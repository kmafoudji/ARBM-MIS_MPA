"""
Analyse d'un classeur AS-IS -> ImportPlan (design §4, §7, §8).

Ce module lit la base pour resoudre des references et comparer l'existant.
Il n'ecrit jamais. Toute decision — creation, mise a jour, remplacement,
erreur, avertissement — est prise ici ; `applier` se contente de rejouer.

Regle de fond sur les cellules vides (plan §1d) : une cellule vide signifie
"non renseignee" et laisse la valeur en base intacte. Elle n'efface jamais
rien. Les classeurs AS-IS laissent des colonnes de classification vides
deliberement ; sans cette regle, le premier commit ecraserait ce que
l'interface contient deja.
"""
import hashlib
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from openpyxl import load_workbook

from apps.project.models import (
    FinancingSource,
    Project,
    ProjectFinancialEnvelope,
    ProjectGadmScope,
    ProjectImplementingPartner,
    ReportingPeriod,
)
from apps.reference.models import (
    Country,
    Currency,
    Donor,
    GadmArea,
    ImplementingAgency,
    RegionalHub,
    Sdg,
    Sector,
)
from apps.results.models import Indicator, LogframeRow, LogframeTarget, ResultsData
from apps.workplan.models import Activity, Milestone, WorkplanComponent, WorkplanSubComponent

from . import vocab
from .plan import (
    ACTION_CREATE,
    ACTION_REPLACE,
    ACTION_UNCHANGED,
    ACTION_UPDATE,
    FieldDiff,
    ImportPlan,
)

# Feuilles ignorees (design §7).
IGNORED_SHEETS = {"00_README", "98_Loader_Notes", "99_Parked", "99b_toc_nodes_parked"}

SHEET_PROJECT = "01_project"
SHEET_ENVELOPE = "02a_envelope"
SHEET_FINANCING = "02_financing_source"
SHEET_DONORS = "03_donors"
SHEET_AGENCIES = "04_agencies"
SHEET_PARTNERS = "05_project_partners"
SHEET_INDICATORS = "07_indicators_logframe"
SHEET_TARGETS = "08_logframe_targets"
SHEET_COMPONENTS = "09_components"
SHEET_ACTIVITIES = "10_activities"
SHEET_MILESTONES = "11_milestones"
SHEET_GADM = "12_gadm_scope"
SHEET_RESULTS = "13_results_data"
SHEET_PERIODS = "reporting_periods"  # pas une feuille : effet de bord (design §7)

REQUIRED_SHEETS = [
    SHEET_PROJECT,
    SHEET_ENVELOPE,
    SHEET_FINANCING,
    SHEET_DONORS,
    SHEET_AGENCIES,
    SHEET_PARTNERS,
    SHEET_INDICATORS,
    SHEET_TARGETS,
    SHEET_COMPONENTS,
    SHEET_ACTIVITIES,
    SHEET_MILESTONES,
    SHEET_GADM,
    SHEET_RESULTS,
]

# Un en-tete est reconnu a ces colonnes-la. Le design annonce "note en
# ligne 1, en-tetes en ligne 2" ; c'est vrai de 9 feuilles sur 13 —
# 02a_envelope, 03_donors et 04_agencies commencent directement par
# l'en-tete. On cherche donc la ligne d'en-tete au lieu de la supposer.
SHEET_HEADER_MARKERS = {
    SHEET_PROJECT: ["official_reference_number", "name"],
    SHEET_ENVELOPE: ["official_reference_number"],
    SHEET_FINANCING: ["source", "instrument", "amount"],
    SHEET_DONORS: ["code", "name"],
    SHEET_AGENCIES: ["code", "name"],
    SHEET_PARTNERS: ["agency_code", "role"],
    SHEET_INDICATORS: ["indicator_code", "chain_level"],
    SHEET_TARGETS: ["indicator_code", "target_date"],
    SHEET_COMPONENTS: ["code", "level"],
    SHEET_ACTIVITIES: ["activity_id", "sub_component_code"],
    SHEET_MILESTONES: ["milestone_id", "name"],
    SHEET_GADM: ["level", "admin1_name"],
    SHEET_RESULTS: ["indicator_code", "period"],
}

HEADER_SEARCH_DEPTH = 3  # lignes examinees avant d'abandonner
EXCEL_EPOCH = date(1899, 12, 30)  # decalage du systeme 1900, bug bissextile inclus


# ---------------------------------------------------------------------------
# Coercition de cellules
# ---------------------------------------------------------------------------


def as_text(value):
    """Texte nettoye, ou "" si la cellule est vide."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def as_date(value):
    """
    Date, ou None si vide. Leve ValueError si la valeur est inexploitable.

    Les cellules de date des classeurs portent un format `yyyy-mm-dd`, donc
    openpyxl rend deja un datetime. Les deux autres branches couvrent un
    fichier retouche a la main : chaine ISO, ou numero de serie Excel brut.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)):
        return EXCEL_EPOCH + timedelta(days=int(value))
    return date.fromisoformat(str(value).strip())


def as_decimal(value):
    """Decimal, ou None si vide. Leve ValueError si inexploitable."""
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    text = str(value).strip().replace(" ", "").replace(",", "")
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"nombre invalide : {value!r}") from exc


def as_int(value):
    """Entier, ou None si vide. Leve ValueError si inexploitable."""
    decimal_value = as_decimal(value)
    if decimal_value is None:
        return None
    return int(decimal_value)


def as_bool(value):
    """Oui/non tolerant, utilise par `is_lead`."""
    text = vocab.normalise(value)
    if text in ("yes", "y", "true", "1", "oui"):
        return True
    if text in ("no", "n", "false", "0", "non", ""):
        return False
    return None


# ---------------------------------------------------------------------------
# Lecture du classeur
# ---------------------------------------------------------------------------


class SheetRows:
    """Lignes de donnees d'une feuille, indexees par nom de colonne."""

    def __init__(self, name, header_row, headers, rows):
        self.name = name
        self.header_row = header_row
        self.headers = headers
        self.rows = rows  # [(numero_de_ligne, {colonne: valeur})]

    def __iter__(self):
        return iter(self.rows)

    def __len__(self):
        return len(self.rows)


class WorkbookReader:
    """
    Acces en lecture seule au classeur.

    `read_only=True, data_only=True` (design §11) : aucune formule n'est
    evaluee, aucun lien externe n'est suivi, et le fichier reste en memoire.
    """

    def __init__(self, file_obj):
        self.workbook = load_workbook(file_obj, read_only=True, data_only=True)

    def close(self):
        self.workbook.close()

    @property
    def sheet_names(self):
        return list(self.workbook.sheetnames)

    def read(self, name):
        """
        Renvoie un SheetRows, ou None si la feuille est absente.

        La ligne d'en-tete est celle des `HEADER_SEARCH_DEPTH` premieres qui
        porte tous les marqueurs attendus ; les lignes de note sont donc
        sautees sans qu'on ait a savoir combien il y en a.
        """
        if name not in self.workbook.sheetnames:
            return None

        sheet = self.workbook[name]
        markers = SHEET_HEADER_MARKERS.get(name, [])
        header_row = None
        headers = {}
        rows = []

        for index, raw in enumerate(sheet.iter_rows(values_only=True), start=1):
            if header_row is None:
                if index > HEADER_SEARCH_DEPTH:
                    break
                candidate = {}
                for position, cell in enumerate(raw):
                    label = _header_key(cell)
                    if label:
                        candidate[label] = position
                if all(marker in candidate for marker in markers):
                    header_row = index
                    headers = candidate
                continue

            values = {
                label: raw[position] if position < len(raw) else None
                for label, position in headers.items()
            }
            if any(as_text(value) for value in values.values()):
                rows.append((index, values))

        if header_row is None:
            return SheetRows(name, None, {}, [])
        return SheetRows(name, header_row, headers, rows)


def _header_key(cell):
    """
    Normalise un libelle d'en-tete. `toc_node_ref (informational)` et
    `source (enum)` deviennent `toc_node_ref` et `source` : les classeurs
    annotent leurs en-tetes entre parentheses.
    """
    text = as_text(cell)
    if not text:
        return ""
    text = text.split("(")[0]
    return "_".join(text.strip().lower().replace("-", "_").split())


# ---------------------------------------------------------------------------
# Contexte d'analyse
# ---------------------------------------------------------------------------


class ParseContext:
    """
    Etat partage entre les fonctions de feuille : le plan en construction,
    le projet existant s'il y en a un, et les registres qui permettent a une
    feuille de resoudre ce qu'une feuille precedente a planifie sans que rien
    n'existe encore en base.
    """

    def __init__(self, reader, plan):
        self.reader = reader
        self.plan = plan
        self.project = None  # instance existante, ou None
        self.project_ref = ""
        self.project_fields = {}  # valeurs issues de 01_project
        self.start_date = None
        self.end_date = None
        self.budget_amount = None
        self.lead_country = None
        # Registres de ce que le fichier declare, par code.
        self.agency_codes = {}  # code fichier -> ImplementingAgency ou None
        self.donor_codes = {}
        self.component_codes = set()
        self.sub_component_codes = {}  # code -> code parent
        self.activity_codes = set()
        self.indicator_rows = {}  # code indicateur -> ligne du classeur
        self.planned_targets = {}  # (code indicateur, date) -> PlannedChange
        self.has_activityless_milestone = False

    # -- raccourcis -------------------------------------------------------

    def error(self, sheet, row, message, column=""):
        self.plan.add_error(sheet, row, message, column)

    def warn(self, sheet, row, message, column=""):
        self.plan.add_warning(sheet, row, message, column)

    def effective_end_date(self):
        if self.end_date:
            return self.end_date
        return self.project.end_date if self.project else None


def diff_fields(instance, desired):
    """
    Ecarts entre l'existant et ce que le fichier demande.

    `desired` ne contient que des valeurs reellement fournies : une cellule
    vide n'y figure pas et ne peut donc pas produire d'ecart. C'est la
    traduction concrete de la regle du module.
    """
    diffs = []
    for field_name, new_value in desired.items():
        current = getattr(instance, field_name, None)
        if _same(current, new_value):
            continue
        diffs.append(FieldDiff(field=field_name, from_value=_display(current), to_value=_display(new_value)))
    return diffs


def _same(current, new_value):
    if isinstance(current, Decimal) or isinstance(new_value, Decimal):
        try:
            return Decimal(str(current or 0)) == Decimal(str(new_value or 0))
        except (InvalidOperation, ValueError):
            return False
    if isinstance(current, datetime):
        current = current.date()
    return current == new_value


def _display(value):
    """Valeur serialisable pour le rapport."""
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (int, float, bool, str)):
        return value
    return str(value)


# ---------------------------------------------------------------------------
# Point d'entree
# ---------------------------------------------------------------------------


def compute_sha256(file_obj):
    """SHA-256 du fichier televerse (design D-4). Repositionne le curseur."""
    file_obj.seek(0)
    digest = hashlib.sha256()
    for chunk in iter(lambda: file_obj.read(65536), b""):
        digest.update(chunk)
    file_obj.seek(0)
    return digest.hexdigest()


def parse(file_obj):
    """
    Analyse le classeur et renvoie un ImportPlan complet.

    Ne leve pas sur un fichier mal rempli : les problemes deviennent des
    erreurs du plan, qui portent leur feuille et leur ligne. Ne remontent
    que les defauts qui empechent meme d'ouvrir le classeur.
    """
    plan = ImportPlan(file_sha256=compute_sha256(file_obj))
    reader = WorkbookReader(file_obj)
    try:
        context = ParseContext(reader, plan)

        missing = [
            name
            for name in REQUIRED_SHEETS
            if name not in reader.sheet_names
        ]
        if missing:
            plan.add_error(
                "", None,
                "Feuilles absentes du classeur : " + ", ".join(missing)
                + ". Le fichier attendu est le classeur AS-IS a 13 feuilles.",
            )
            return plan

        # Ordre d'ecriture du design §9. Chaque etape peut s'arreter net si
        # ce dont elle depend manque ; le plan garde alors ses erreurs.
        _parse_project(context)
        if not context.project_ref:
            return plan

        _parse_envelope(context)
        _parse_financing(context)
        _parse_donors(context)
        _parse_agencies(context)
        _parse_partners(context)
        _parse_indicators(context)
        _parse_targets(context)
        _parse_components(context)
        _parse_activities(context)
        _parse_milestones(context)
        _parse_gadm(context)
        _plan_reporting_periods(context)
        _parse_results(context)
        _report_drift(context)
        return plan
    finally:
        reader.close()


# ---------------------------------------------------------------------------
# 01_project
# ---------------------------------------------------------------------------


def _parse_project(context):
    sheet = context.reader.read(SHEET_PROJECT)
    if sheet is None or not sheet.rows:
        context.error(SHEET_PROJECT, None, "Feuille vide : aucun projet a importer.")
        return

    if len(sheet.rows) > 1:
        context.warn(
            SHEET_PROJECT,
            sheet.rows[1][0],
            f"{len(sheet.rows)} lignes de projet ; seule la premiere est prise en compte "
            "(un classeur AS-IS porte un projet).",
        )

    row_number, values = sheet.rows[0]
    reference = as_text(values.get("official_reference_number"))
    if not reference:
        context.error(
            SHEET_PROJECT, row_number,
            "official_reference_number est obligatoire : c'est la cle de rapprochement du projet.",
            column="official_reference_number",
        )
        return

    context.project_ref = reference
    context.plan.project_ref = reference
    context.project = Project.objects.filter(official_reference_number=reference).first()
    context.plan.project_exists = context.project is not None

    desired = {}

    name = as_text(values.get("name"))
    if not name:
        context.error(SHEET_PROJECT, row_number, "Le nom du projet est obligatoire.", column="name")
    else:
        desired["name"] = name

    acronym = as_text(values.get("acronym"))
    if acronym:
        if len(acronym) > 20:
            context.error(
                SHEET_PROJECT, row_number,
                f"acronym fait {len(acronym)} caracteres ; le modele en accepte 20.",
                column="acronym",
            )
        else:
            desired["acronym"] = acronym

    # -- references du referentiel ---------------------------------------

    iso3 = as_text(values.get("lead_country_iso3")).upper()
    if iso3:
        country = Country.objects.filter(iso3=iso3).first()
        if country is None:
            context.error(
                SHEET_PROJECT, row_number,
                f"Pays chef de file inconnu : {iso3}.", column="lead_country_iso3",
            )
        else:
            context.lead_country = country

    hub_code = as_text(values.get("hub_code"))
    if hub_code:
        hub = RegionalHub.objects.filter(code__iexact=hub_code).first()
        if hub is None:
            context.error(
                SHEET_PROJECT, row_number, f"Hub inconnu : {hub_code}.", column="hub_code",
            )
        else:
            desired["hub"] = hub

    sector_key = as_text(values.get("primary_sector"))
    if sector_key:
        sector = Sector.objects.filter(code__iexact=sector_key).first()
        if sector is None:
            context.error(
                SHEET_PROJECT, row_number,
                f"Secteur primaire inconnu : {sector_key}.", column="primary_sector",
            )
        else:
            desired["primary_sector"] = sector

    primary_sdg = _read_int(context, SHEET_PROJECT, row_number, values, "primary_sdg")
    if primary_sdg is not None:
        sdg = Sdg.objects.filter(number=primary_sdg).first()
        if sdg is None:
            context.error(
                SHEET_PROJECT, row_number, f"ODD primaire inconnu : {primary_sdg}.",
                column="primary_sdg",
            )
        else:
            desired["primary_sdg"] = sdg

    currency_code = as_text(values.get("currency")).upper()
    if currency_code:
        currency = Currency.objects.filter(code=currency_code).first()
        if currency is None:
            context.error(
                SHEET_PROJECT, row_number, f"Devise inconnue : {currency_code}.", column="currency",
            )
        else:
            desired["currency"] = currency

    # -- enumerations -----------------------------------------------------

    enum_columns = [
        ("lifecycle_stage", vocab.LIFECYCLE_STAGES),
        ("gender_marker", vocab.GENDER_MARKERS),
        ("rio_marker_mitigation", vocab.RIO_MARKERS),
        ("rio_marker_adaptation", vocab.RIO_MARKERS),
        ("rio_marker_biodiversity", vocab.RIO_MARKERS),
        ("rio_marker_desertification", vocab.RIO_MARKERS),
        ("rio_marker_water", vocab.RIO_MARKERS),
        ("implementation_modality", vocab.IMPLEMENTATION_MODALITIES),
        ("fragility_status", vocab.FRAGILITY_STATUSES),
        ("risk_rating", vocab.RISK_RATINGS),
        ("geographic_typology", vocab.GEOGRAPHIC_TYPOLOGIES),
        ("reporting_frequency", vocab.REPORTING_FREQUENCIES),
    ]
    for column, allowed in enum_columns:
        value = _read_enum(context, SHEET_PROJECT, row_number, values, column, allowed)
        if value is not None:
            desired[column] = value

    # -- nombres et dates -------------------------------------------------

    for column in ("beneficiary_target_direct", "beneficiary_target_indirect"):
        number = _read_int(context, SHEET_PROJECT, row_number, values, column)
        if number is not None:
            desired[column] = number

    budget = _read_decimal(context, SHEET_PROJECT, row_number, values, "budget_amount")
    if budget is not None:
        desired["budget_amount"] = budget
        context.budget_amount = budget

    for column in ("next_reporting_due", "start_date", "end_date"):
        parsed = _read_date(context, SHEET_PROJECT, row_number, values, column)
        if parsed is not None:
            desired[column] = parsed

    context.start_date = desired.get("start_date") or (context.project.start_date if context.project else None)
    context.end_date = desired.get("end_date") or (context.project.end_date if context.project else None)

    # VAL012 — coherence des bornes du projet.
    if context.start_date and context.end_date and context.end_date < context.start_date:
        context.error(
            SHEET_PROJECT, row_number,
            f"VAL012 : end_date ({context.end_date}) est anterieure a start_date "
            f"({context.start_date}).",
            column="end_date",
        )

    context.project_fields = desired

    # -- pays et ODD contributifs ----------------------------------------

    contributing = []
    for token in as_text(values.get("contributing_sdgs")).replace(",", ";").split(";"):
        token = token.strip()
        if not token:
            continue
        try:
            number = int(Decimal(token))
        except (InvalidOperation, ValueError):
            context.error(
                SHEET_PROJECT, row_number,
                f"ODD contributif illisible : {token!r}.", column="contributing_sdgs",
            )
            continue
        if not Sdg.objects.filter(number=number).exists():
            context.error(
                SHEET_PROJECT, row_number, f"ODD contributif inconnu : {number}.",
                column="contributing_sdgs",
            )
            continue
        contributing.append(number)

    payload = {
        "fields": desired,
        "lead_country_id": context.lead_country.pk if context.lead_country else None,
        "contributing_sdgs": contributing,
    }

    if context.project is None:
        context.plan.add_change(
            SHEET_PROJECT, ACTION_CREATE, reference,
            detail=name or reference, payload=payload,
        )
        return

    diffs = diff_fields(context.project, desired)
    diffs += _project_relation_diffs(context, contributing)
    action = ACTION_UPDATE if diffs else ACTION_UNCHANGED
    context.plan.add_change(
        SHEET_PROJECT, action, reference,
        detail=f"Projet existant {context.project.code or ''}".strip(),
        diffs=diffs, payload=payload,
    )


def _project_relation_diffs(context, contributing):
    """Ecarts sur le pays chef de file et les ODD contributifs."""
    diffs = []
    if context.lead_country is not None:
        current = context.project.lead_country
        if current != context.lead_country:
            diffs.append(FieldDiff(
                field="lead_country",
                from_value=current.iso3 if current else None,
                to_value=context.lead_country.iso3,
            ))
    if contributing:
        current = sorted(context.project.contributing_sdgs.values_list("number", flat=True))
        if current != sorted(contributing):
            diffs.append(FieldDiff(
                field="contributing_sdgs",
                from_value=", ".join(str(n) for n in current) or None,
                to_value=", ".join(str(n) for n in sorted(contributing)),
            ))
    return diffs


# ---------------------------------------------------------------------------
# 02a_envelope / 02_financing_source
# ---------------------------------------------------------------------------


def _parse_envelope(context):
    sheet = context.reader.read(SHEET_ENVELOPE)
    if sheet is None or not sheet.rows:
        # L'enveloppe est une relation 1:1 creee au besoin (design §7).
        context.plan.add_change(
            SHEET_ENVELOPE, ACTION_CREATE, context.project_ref,
            detail="Enveloppe financiere creee (feuille vide).", payload={"notes": ""},
        )
        return

    row_number, values = sheet.rows[0]
    reference = as_text(values.get("official_reference_number"))
    if reference and reference != context.project_ref:
        context.error(
            SHEET_ENVELOPE, row_number,
            f"L'enveloppe reference {reference}, le projet est {context.project_ref}.",
            column="official_reference_number",
        )
        return

    notes = as_text(values.get("notes"))
    payload = {"notes": notes}
    existing = None
    if context.project is not None:
        existing = ProjectFinancialEnvelope.objects.filter(project=context.project).first()

    if existing is None:
        context.plan.add_change(
            SHEET_ENVELOPE, ACTION_CREATE, context.project_ref,
            detail="Enveloppe financiere creee.", payload=payload,
        )
        return

    desired = {"notes": notes} if notes else {}
    diffs = diff_fields(existing, desired)
    context.plan.add_change(
        SHEET_ENVELOPE, ACTION_UPDATE if diffs else ACTION_UNCHANGED, context.project_ref,
        detail="Enveloppe financiere existante.", diffs=diffs, payload=payload,
    )


def _parse_financing(context):
    """
    Remplacement integral, borne au projet charge (D-8).

    FinancingSource n'a pas de cle naturelle : SLE1013 porte deux lignes
    co_financing + loan que seule leur note distingue. On remplace donc
    l'ensemble des lignes de CE projet, jamais celles d'un autre.
    """
    sheet = context.reader.read(SHEET_FINANCING)
    if sheet is None:
        return

    total = Decimal("0")
    for row_number, values in sheet.rows:
        source = _read_enum(context, SHEET_FINANCING, row_number, values, "source", vocab.FINANCING_SOURCES)
        instrument = _read_enum(
            context, SHEET_FINANCING, row_number, values, "instrument", vocab.FINANCING_INSTRUMENTS
        )
        amount = _read_decimal(context, SHEET_FINANCING, row_number, values, "amount")
        amount_usd = _read_decimal(context, SHEET_FINANCING, row_number, values, "amount_usd")
        currency_code = as_text(values.get("currency")).upper() or "USD"
        currency = Currency.objects.filter(code=currency_code).first()
        note = as_text(values.get("note"))

        if source is None:
            context.error(SHEET_FINANCING, row_number, "source est obligatoire.", column="source")
        if instrument is None:
            context.error(
                SHEET_FINANCING, row_number, "instrument est obligatoire.", column="instrument"
            )
        if currency is None:
            context.error(
                SHEET_FINANCING, row_number, f"Devise inconnue : {currency_code}.", column="currency"
            )
        if amount is None and amount_usd is None:
            context.error(
                SHEET_FINANCING, row_number,
                "Ni amount ni amount_usd ne sont renseignes.", column="amount",
            )
            continue

        amount = amount if amount is not None else amount_usd
        amount_usd = amount_usd if amount_usd is not None else amount
        total += amount_usd

        if len(note) > 200:
            context.warn(
                SHEET_FINANCING, row_number,
                "La note depasse 200 caracteres et sera tronquee dans le libelle.",
                column="note",
            )

        context.plan.add_change(
            SHEET_FINANCING, ACTION_REPLACE,
            f"{source or '?'} / {instrument or '?'}",
            detail=f"{amount_usd:,.0f} USD — {note}" if amount_usd is not None else note,
            payload={
                "source": source,
                "instrument": instrument,
                "amount": amount,
                "amount_usd": amount_usd,
                "currency_code": currency_code,
                "label": note[:200],
                "order": len(context.plan.changes_for(SHEET_FINANCING)),
            },
        )

    # VAL015 — les lignes de financement doivent reconstituer le budget.
    if sheet.rows and context.budget_amount is not None and total != context.budget_amount:
        context.error(
            SHEET_FINANCING, sheet.header_row,
            f"VAL015 : les lignes de financement totalisent {total:,.2f} USD, "
            f"budget_amount vaut {context.budget_amount:,.2f} USD.",
        )

    if context.project is not None:
        existing = FinancingSource.objects.filter(envelope__project=context.project).count()
        if existing and sheet.rows:
            context.warn(
                SHEET_FINANCING, None,
                f"{existing} ligne(s) de financement existante(s) seront remplacees par les "
                f"{len(sheet.rows)} du fichier (D-8).",
            )
        elif existing:
            # Une feuille vide vaut "non fournie", pas "a vider" : le
            # remplacement integral ne doit pas transformer un fichier
            # partiel en effaceur.
            context.warn(
                SHEET_FINANCING, None,
                f"Feuille vide ; les {existing} ligne(s) de financement existantes sont "
                "conservees.",
            )


# ---------------------------------------------------------------------------
# 03_donors / 04_agencies — referentiels globaux
# ---------------------------------------------------------------------------


def _parse_donors(context):
    """
    Creation seule, jamais de mise a jour (design §7) : ce sont des tables
    de reference globales, pas des donnees de projet.

    Le rapprochement est insensible a la casse : la base porte `isdb`, le
    classeur ecrit `ISDB`. Un rapprochement litteral creerait un doublon
    d'une ligne deja presente.
    """
    sheet = context.reader.read(SHEET_DONORS)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("code"))
        name = as_text(values.get("name"))
        if not code:
            context.error(SHEET_DONORS, row_number, "code est obligatoire.", column="code")
            continue

        existing = Donor.objects.filter(code__iexact=code).first()
        context.donor_codes[code] = existing
        if existing is not None:
            context.plan.add_change(
                SHEET_DONORS, ACTION_UNCHANGED, code,
                detail=f"Bailleur deja au referentiel sous le code {existing.code}.",
            )
            continue
        if not name:
            context.error(
                SHEET_DONORS, row_number,
                f"name est obligatoire pour creer le bailleur {code}.", column="name",
            )
            continue
        context.plan.add_change(
            SHEET_DONORS, ACTION_CREATE, code, detail=name,
            payload={"code": code, "name": name},
        )


def _parse_agencies(context):
    sheet = context.reader.read(SHEET_AGENCIES)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("code"))
        name = as_text(values.get("name"))
        raw_type = as_text(values.get("agency_type_note"))
        if not code:
            context.error(SHEET_AGENCIES, row_number, "code est obligatoire.", column="code")
            continue

        existing = ImplementingAgency.objects.filter(code__iexact=code).first()
        context.agency_codes[code] = existing
        if existing is not None:
            context.plan.add_change(
                SHEET_AGENCIES, ACTION_UNCHANGED, code,
                detail=f"Agence deja au referentiel sous le code {existing.code}.",
            )
            continue

        if not name:
            context.error(
                SHEET_AGENCIES, row_number,
                f"name est obligatoire pour creer l'agence {code}.", column="name",
            )
            continue

        agency_type, translated = vocab.map_value(vocab.AGENCY_TYPE_MAP, raw_type)
        if agency_type is None:
            context.error(
                SHEET_AGENCIES, row_number,
                f"agency_type_note inconnu : {raw_type!r}. Valeurs traduites : "
                + ", ".join(sorted(vocab.AGENCY_TYPE_MAP)),
                column="agency_type_note",
            )
            continue
        if translated:
            context.warn(
                SHEET_AGENCIES, row_number,
                f"agency_type_note {raw_type!r} interprete comme {agency_type!r}.",
                column="agency_type_note",
            )

        near = _near_duplicate_agency(name)
        if near is not None:
            context.warn(
                SHEET_AGENCIES, row_number,
                f"Une agence de nom proche existe deja au referentiel : {near.code} "
                f"({near.name}). Le fichier en creera une seconde sous le code {code}.",
                column="code",
            )

        context.plan.add_change(
            SHEET_AGENCIES, ACTION_CREATE, code, detail=f"{name} [{agency_type}]",
            payload={
                "code": code,
                "name": name,
                "agency_type": agency_type,
                "country_id": context.lead_country.pk if context.lead_country else None,
            },
        )


def _near_duplicate_agency(name):
    """
    Agence existante portant le meme nom a la casse et aux espaces pres.

    Les classeurs prefixent leurs codes par le pays (`NGA-KNARDA`) la ou le
    referentiel utilise un code court (`knarda`) : le code ne suffit pas a
    detecter le doublon, le nom si.
    """
    normalised = vocab.normalise(name)
    for agency in ImplementingAgency.objects.all().only("code", "name"):
        if vocab.normalise(agency.name) == normalised:
            return agency
    return None


# ---------------------------------------------------------------------------
# 05_project_partners
# ---------------------------------------------------------------------------


def _parse_partners(context):
    sheet = context.reader.read(SHEET_PARTNERS)
    if sheet is None:
        return

    leads = 0
    for row_number, values in sheet.rows:
        agency_code = as_text(values.get("agency_code"))
        raw_role = as_text(values.get("role"))
        is_lead = as_bool(values.get("is_lead"))

        if not agency_code:
            context.error(
                SHEET_PARTNERS, row_number, "agency_code est obligatoire.", column="agency_code"
            )
            continue
        if agency_code not in context.agency_codes:
            context.error(
                SHEET_PARTNERS, row_number,
                f"Agence {agency_code} absente de 04_agencies.", column="agency_code",
            )
            continue

        role, translated = vocab.map_value(vocab.PARTNER_ROLE_MAP, raw_role)
        if role is None:
            context.error(
                SHEET_PARTNERS, row_number,
                f"role inconnu : {raw_role!r}. Valeurs traduites : "
                + ", ".join(sorted(vocab.PARTNER_ROLE_MAP)),
                column="role",
            )
            continue
        if is_lead:
            role = "lead"
        if translated and role != "lead":
            context.warn(
                SHEET_PARTNERS, row_number,
                f"role {raw_role!r} interprete comme {role!r}.", column="role",
            )

        if role == "lead":
            leads += 1
            if leads > 1:
                # Le modele porte une contrainte unique_lead_partner_per_project :
                # mieux vaut la voir ici que sous forme d'IntegrityError a l'ecriture.
                context.error(
                    SHEET_PARTNERS, row_number,
                    "Deux partenaires chef de file pour le meme projet ; le modele n'en accepte qu'un.",
                    column="is_lead",
                )

        payload = {"agency_code": agency_code, "role": role, "order": row_number}
        existing = None
        agency = context.agency_codes.get(agency_code)
        if context.project is not None and agency is not None:
            existing = ProjectImplementingPartner.objects.filter(
                project=context.project, agency=agency
            ).first()

        if existing is None:
            context.plan.add_change(
                SHEET_PARTNERS, ACTION_CREATE, agency_code, detail=role, payload=payload,
            )
        else:
            diffs = diff_fields(existing, {"role": role})
            context.plan.add_change(
                SHEET_PARTNERS, ACTION_UPDATE if diffs else ACTION_UNCHANGED, agency_code,
                detail=role, diffs=diffs, payload=payload,
            )


# ---------------------------------------------------------------------------
# 07_indicators_logframe
# ---------------------------------------------------------------------------


def _parse_indicators(context):
    """
    Trois objets par ligne : l'indicateur du catalogue, la ligne de cadre
    logique du projet, et la cible de fin portee par `end_target_*`.

    Chacun devient une entree distincte du rapport : c'est ce qui permet de
    voir qu'un indicateur est deja au catalogue alors que sa ligne de cadre
    logique est a creer.
    """
    sheet = context.reader.read(SHEET_INDICATORS)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("indicator_code"))
        if not code:
            context.error(
                SHEET_INDICATORS, row_number, "indicator_code est obligatoire.",
                column="indicator_code",
            )
            continue
        if code in context.indicator_rows:
            context.error(
                SHEET_INDICATORS, row_number,
                f"indicator_code {code} apparait plusieurs fois dans la feuille.",
                column="indicator_code",
            )
            continue
        context.indicator_rows[code] = row_number

        name = as_text(values.get("name"))
        if not name:
            context.error(
                SHEET_INDICATORS, row_number, "name est obligatoire.", column="name"
            )
            continue

        sector_key = as_text(values.get("sector"))
        sector = Sector.objects.filter(code__iexact=sector_key).first() if sector_key else None
        if sector is None:
            context.error(
                SHEET_INDICATORS, row_number,
                f"indicator.sector est un FK obligatoire ; secteur inconnu : {sector_key!r}.",
                column="sector",
            )
            continue

        chain_level = _read_enum(
            context, SHEET_INDICATORS, row_number, values, "chain_level", vocab.CHAIN_LEVELS
        )
        if chain_level is None:
            context.error(
                SHEET_INDICATORS, row_number, "chain_level est obligatoire.", column="chain_level"
            )
            continue

        direction = _read_enum(
            context, SHEET_INDICATORS, row_number, values, "direction", vocab.DIRECTIONS
        )
        if direction is None:
            context.error(
                SHEET_INDICATORS, row_number, "direction est obligatoire.", column="direction"
            )
            continue

        frequency = _read_enum(
            context, SHEET_INDICATORS, row_number, values, "reporting_frequency",
            vocab.MEASUREMENT_FREQUENCIES,
        )
        definition = as_text(values.get("definition"))
        unit = as_text(values.get("unit"))
        if not definition:
            context.warn(
                SHEET_INDICATORS, row_number,
                f"Definition vide pour {code} ; l'indicateur sera cree sans definition.",
                column="definition",
            )

        indicator_payload = {
            "kind": "indicator",
            "code": code,
            "name": name,
            "sector_id": sector.pk,
            "definition": definition,
            "unit": unit,
            "direction": direction,
            # Indicator.chain_level n'admet pas `impact` (niveau de synthese
            # propre au cadre logique) : on ne le propage que s'il est valide.
            "chain_level": chain_level if chain_level != "impact" else "",
            "reporting_frequency": frequency or "",
        }

        indicator = Indicator.objects.filter(code=code).first()
        if indicator is None:
            context.plan.add_change(
                SHEET_INDICATORS, ACTION_CREATE, f"Indicateur {code}",
                detail=name[:120], payload=indicator_payload,
            )
        else:
            context.plan.add_change(
                SHEET_INDICATORS, ACTION_UNCHANGED, f"Indicateur {code}",
                detail="Deja au catalogue (le catalogue est gouverne par la LLFMU, "
                       "un fichier projet ne le reecrit pas).",
                payload=indicator_payload,
            )

        # -- ligne de cadre logique --------------------------------------

        baseline_value = _read_decimal(
            context, SHEET_INDICATORS, row_number, values, "baseline_value"
        )
        baseline_year = _read_int(context, SHEET_INDICATORS, row_number, values, "baseline_year")
        row_desired = {"chain_level": chain_level}
        if baseline_value is not None:
            row_desired["baseline_value"] = baseline_value
        if baseline_year is not None:
            row_desired["baseline_year"] = baseline_year
        if frequency:
            row_desired["measurement_frequency"] = frequency

        row_payload = {
            "kind": "logframe_row",
            "indicator_code": code,
            "fields": row_desired,
            "order": row_number,
        }

        existing_row = None
        if context.project is not None and indicator is not None:
            existing_row = LogframeRow.objects.filter(
                project=context.project, indicator=indicator
            ).first()

        if existing_row is None:
            context.plan.add_change(
                SHEET_INDICATORS, ACTION_CREATE, f"Ligne logframe {code}",
                detail=chain_level, payload=row_payload,
            )
        else:
            diffs = diff_fields(existing_row, row_desired)
            context.plan.add_change(
                SHEET_INDICATORS, ACTION_UPDATE if diffs else ACTION_UNCHANGED,
                f"Ligne logframe {code}", detail=chain_level, diffs=diffs, payload=row_payload,
            )

        # -- cible de fin -------------------------------------------------

        target_value = _read_decimal(
            context, SHEET_INDICATORS, row_number, values, "end_target_value"
        )
        target_date = _read_date(context, SHEET_INDICATORS, row_number, values, "end_target_date")
        if target_value is None or target_date is None:
            if target_value is not None or target_date is not None:
                context.warn(
                    SHEET_INDICATORS, row_number,
                    "Cible de fin incomplete (valeur et date sont requises ensemble) ; ignoree.",
                    column="end_target_value",
                )
            continue

        _plan_target(
            context, SHEET_INDICATORS, row_number, code, target_date, target_value,
            is_original_pad=True, existing_row=existing_row,
        )


def _plan_target(context, sheet_name, row_number, indicator_code, target_date, target_value,
                 is_original_pad, existing_row):
    """
    Planifie une LogframeTarget sur la cle (logframe_row, target_date).

    C'est la meme cle pour la cible de fin de 07 et pour une cible de 08 :
    une cible presente dans les deux feuilles met a jour une ligne au lieu
    d'en creer deux (design §7).
    """
    key = (indicator_code, target_date)
    already = context.planned_targets.get(key)
    payload = {
        "kind": "logframe_target",
        "indicator_code": indicator_code,
        "target_date": target_date,
        "target_value": target_value,
        "is_original_pad": is_original_pad,
    }

    if already is not None:
        # Deuxieme apparition : la feuille 08 est plus specifique que la
        # cible de fin deduite de 07, elle gagne.
        already.payload.update(payload)
        already.detail = f"{target_value} au {target_date.isoformat()}"
        return

    end_date = context.effective_end_date()
    if end_date and target_date > end_date:
        context.warn(
            sheet_name, row_number,
            f"Cible datee du {target_date.isoformat()}, au-dela de end_date "
            f"({end_date.isoformat()}). Legitime pour un PAD, signale sans blocage.",
            column="target_date",
        )

    existing_target = None
    if existing_row is not None:
        existing_target = LogframeTarget.objects.filter(
            logframe_row=existing_row, target_date=target_date
        ).first()

    target_label = f"Cible {indicator_code} @ {target_date.isoformat()}"
    if existing_target is None:
        change = context.plan.add_change(
            sheet_name, ACTION_CREATE, target_label,
            detail=str(target_value), payload=payload,
        )
    else:
        diffs = diff_fields(existing_target, {"target_value": target_value})
        change = context.plan.add_change(
            sheet_name, ACTION_UPDATE if diffs else ACTION_UNCHANGED, target_label,
            detail=str(target_value), diffs=diffs, payload=payload,
        )
    context.planned_targets[key] = change


# ---------------------------------------------------------------------------
# 08_logframe_targets
# ---------------------------------------------------------------------------


def _parse_targets(context):
    sheet = context.reader.read(SHEET_TARGETS)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("indicator_code"))
        if not code:
            context.error(
                SHEET_TARGETS, row_number, "indicator_code est obligatoire.",
                column="indicator_code",
            )
            continue
        if code not in context.indicator_rows:
            context.error(
                SHEET_TARGETS, row_number,
                f"Indicateur {code} absent de 07_indicators_logframe.", column="indicator_code",
            )
            continue

        target_date = _read_date(context, SHEET_TARGETS, row_number, values, "target_date")
        target_value = _read_decimal(context, SHEET_TARGETS, row_number, values, "target_value")
        if target_date is None or target_value is None:
            context.error(
                SHEET_TARGETS, row_number,
                "target_date et target_value sont obligatoires.", column="target_date",
            )
            continue

        is_pad = as_bool(values.get("is_original_pad"))
        existing_row = None
        if context.project is not None:
            existing_row = LogframeRow.objects.filter(
                project=context.project, indicator__code=code
            ).first()

        _plan_target(
            context, SHEET_TARGETS, row_number, code, target_date, target_value,
            is_original_pad=bool(is_pad), existing_row=existing_row,
        )


# ---------------------------------------------------------------------------
# 09_components
# ---------------------------------------------------------------------------


def _parse_components(context):
    """Une seule feuille pour les deux niveaux : `level` designe le modele."""
    sheet = context.reader.read(SHEET_COMPONENTS)
    if sheet is None:
        return

    # Premiere passe : les composants, pour que les sous-composants puissent
    # resoudre leur parent quel que soit l'ordre des lignes.
    rows = []
    for row_number, values in sheet.rows:
        code = as_text(values.get("code"))
        raw_level = as_text(values.get("level"))
        level, _ = vocab.map_value(vocab.COMPONENT_LEVEL_MAP, raw_level)
        if not code:
            context.error(SHEET_COMPONENTS, row_number, "code est obligatoire.", column="code")
            continue
        if level is None:
            context.error(
                SHEET_COMPONENTS, row_number,
                f"level inconnu : {raw_level!r}. Attendu : Component ou Sub-component.",
                column="level",
            )
            continue
        rows.append((row_number, values, code, level))
        if level == "component":
            context.component_codes.add(code)

    for row_number, values, code, level in rows:
        name = as_text(values.get("name"))
        sequence = _read_int(context, SHEET_COMPONENTS, row_number, values, "sequence") or 0
        if not name:
            context.error(
                SHEET_COMPONENTS, row_number, f"name est obligatoire pour {code}.", column="name"
            )
            continue

        if level == "component":
            desired = {"name": name, "order": sequence}
            existing = None
            if context.project is not None:
                existing = WorkplanComponent.objects.filter(
                    project=context.project, code=code
                ).first()
            payload = {"kind": "component", "code": code, "fields": desired}
            _add_upsert_change(context, SHEET_COMPONENTS, code, name, existing, desired, payload)
            continue

        parent_code = as_text(values.get("parent_code"))
        if parent_code not in context.component_codes:
            context.error(
                SHEET_COMPONENTS, row_number,
                f"Sous-composant {code} : parent_code {parent_code!r} absent de la feuille.",
                column="parent_code",
            )
            continue
        context.sub_component_codes[code] = parent_code

        desired = {"name": name, "order": sequence}
        existing = None
        if context.project is not None:
            existing = WorkplanSubComponent.objects.filter(
                component__project=context.project, component__code=parent_code, code=code
            ).first()
        payload = {
            "kind": "sub_component",
            "code": code,
            "parent_code": parent_code,
            "fields": desired,
        }
        _add_upsert_change(context, SHEET_COMPONENTS, code, name, existing, desired, payload)


def _add_upsert_change(context, sheet_name, target, detail, existing, desired, payload):
    if existing is None:
        context.plan.add_change(
            sheet_name, ACTION_CREATE, target, detail=detail[:120], payload=payload
        )
        return
    diffs = diff_fields(existing, desired)
    context.plan.add_change(
        sheet_name, ACTION_UPDATE if diffs else ACTION_UNCHANGED, target,
        detail=detail[:120], diffs=diffs, payload=payload,
    )


# ---------------------------------------------------------------------------
# 10_activities
# ---------------------------------------------------------------------------


def _parse_activities(context):
    sheet = context.reader.read(SHEET_ACTIVITIES)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("activity_id"))
        sub_code = as_text(values.get("sub_component_code"))
        name = as_text(values.get("name"))

        if not code:
            context.error(
                SHEET_ACTIVITIES, row_number, "activity_id est obligatoire.", column="activity_id"
            )
            continue
        if len(code) > 30:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"activity_id fait {len(code)} caracteres ; le modele en accepte 30.",
                column="activity_id",
            )
            continue
        if sub_code not in context.sub_component_codes:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activite {code} : sous-composant {sub_code!r} absent de 09_components.",
                column="sub_component_code",
            )
            continue
        if not name:
            context.error(
                SHEET_ACTIVITIES, row_number, f"name est obligatoire pour {code}.", column="name"
            )
            continue

        planned_start = _read_date(context, SHEET_ACTIVITIES, row_number, values, "current_start") \
            or _read_date(context, SHEET_ACTIVITIES, row_number, values, "baseline_start")
        planned_end = _read_date(context, SHEET_ACTIVITIES, row_number, values, "current_end") \
            or _read_date(context, SHEET_ACTIVITIES, row_number, values, "baseline_end")
        if planned_start is None or planned_end is None:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activite {code} : dates de debut et de fin obligatoires "
                "(planned_start / planned_end ne sont pas nullables).",
                column="baseline_start",
            )
            continue
        if planned_end < planned_start:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activite {code} : la fin ({planned_end}) precede le debut ({planned_start}).",
                column="current_end",
            )
            continue

        status = _read_enum(
            context, SHEET_ACTIVITIES, row_number, values, "status", vocab.ACTIVITY_STATUSES
        )
        if status is None:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activite {code} : status est obligatoire.", column="status",
            )
            continue

        budget = _read_decimal(context, SHEET_ACTIVITIES, row_number, values, "budget_planned")
        end_date = context.effective_end_date()
        if end_date and planned_end > end_date:
            context.warn(
                SHEET_ACTIVITIES, row_number,
                f"Activite {code} : fin au {planned_end.isoformat()}, au-dela de end_date "
                f"({end_date.isoformat()}).",
                column="current_end",
            )

        depends_on = as_text(values.get("depends_on"))
        if depends_on:
            context.warn(
                SHEET_ACTIVITIES, row_number,
                f"depends_on ({depends_on}) n'est pas charge : ActivityDependency est hors "
                "perimetre de cet import.",
                column="depends_on",
            )

        context.activity_codes.add(code)
        desired = {
            "name": name,
            "planned_start": planned_start,
            "planned_end": planned_end,
            "status": status,
        }
        if budget is not None:
            desired["budget_planned"] = budget

        existing = None
        if context.project is not None:
            existing = Activity.objects.filter(
                sub_component__component__project=context.project,
                sub_component__code=sub_code,
                code=code,
            ).first()
        payload = {
            "code": code,
            "sub_component_code": sub_code,
            "fields": desired,
            "order": row_number,
        }
        _add_upsert_change(context, SHEET_ACTIVITIES, code, name, existing, desired, payload)


# ---------------------------------------------------------------------------
# 11_milestones
# ---------------------------------------------------------------------------

PLACEHOLDER_ACTIVITY_SUFFIX = "-A-MILESTONES"
PLACEHOLDER_ACTIVITY_NAME = "Jalons projet (activite de rattachement)"


def _parse_milestones(context):
    """
    Remplacement integral, borne au projet (D-8) : Milestone n'a pas de
    colonne de code, donc pas de cle de rapprochement.

    D-10 : `Milestone.activity` est un FK obligatoire, et les six jalons de
    SLE1013 n'ont pas d'activite. Ils sont rattaches a une activite de
    rattachement, creee uniquement si le fichier en a besoin et annoncee
    dans le rapport comme une creation a part entiere — jamais en douce.
    """
    sheet = context.reader.read(SHEET_MILESTONES)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        milestone_id = as_text(values.get("milestone_id"))
        name = as_text(values.get("name"))
        activity_code = as_text(values.get("activity_id"))

        if not name:
            context.error(
                SHEET_MILESTONES, row_number,
                f"name est obligatoire pour le jalon {milestone_id or row_number}.", column="name",
            )
            continue

        planned_date = _read_date(context, SHEET_MILESTONES, row_number, values, "current_date") \
            or _read_date(context, SHEET_MILESTONES, row_number, values, "baseline_date")
        if planned_date is None:
            context.error(
                SHEET_MILESTONES, row_number,
                f"Jalon {milestone_id or name} : planned_date est obligatoire.",
                column="baseline_date",
            )
            continue

        actual_date = _read_date(context, SHEET_MILESTONES, row_number, values, "actual_date")
        status = _read_enum(
            context, SHEET_MILESTONES, row_number, values, "status", vocab.MILESTONE_STATUSES
        )
        if status is None:
            context.error(
                SHEET_MILESTONES, row_number,
                f"Jalon {milestone_id or name} : status est obligatoire.", column="status",
            )
            continue

        if activity_code and activity_code not in context.activity_codes:
            context.error(
                SHEET_MILESTONES, row_number,
                f"Jalon {milestone_id or name} : activite {activity_code!r} absente de "
                "10_activities.",
                column="activity_id",
            )
            continue

        if not activity_code:
            context.has_activityless_milestone = True
            context.warn(
                SHEET_MILESTONES, row_number,
                f"Jalon {milestone_id or name} sans activity_id : rattache a l'activite "
                f"{context.project_ref}{PLACEHOLDER_ACTIVITY_SUFFIX} (D-10).",
                column="activity_id",
            )

        end_date = context.effective_end_date()
        if end_date and planned_date > end_date:
            context.warn(
                SHEET_MILESTONES, row_number,
                f"Jalon date du {planned_date.isoformat()}, au-dela de end_date "
                f"({end_date.isoformat()}).",
                column="baseline_date",
            )

        context.plan.add_change(
            SHEET_MILESTONES, ACTION_REPLACE, milestone_id or name, detail=name[:120],
            payload={
                "name": name,
                "category": vocab.DEFAULT_MILESTONE_CATEGORY,
                "planned_date": planned_date,
                "actual_date": actual_date,
                "status": status,
                "activity_code": activity_code,
                "order": row_number,
            },
        )

    if sheet.rows:
        # Le classeur n'a pas de colonne `category` et le modele l'exige :
        # un avertissement pour la feuille, pas un par ligne — la valeur est
        # la meme partout et repeter la noierait dans le rapport.
        context.warn(
            SHEET_MILESTONES, sheet.header_row,
            f"Le classeur ne porte pas de colonne `category` ; les {len(sheet.rows)} jalons "
            f"prennent la valeur {vocab.DEFAULT_MILESTONE_CATEGORY!r} (D-10).",
            column="category",
        )

    if context.has_activityless_milestone:
        _plan_placeholder_activity(context)

    if context.project is not None:
        existing = Milestone.objects.filter(
            activity__sub_component__component__project=context.project
        ).count()
        if existing and sheet.rows:
            context.warn(
                SHEET_MILESTONES, None,
                f"{existing} jalon(s) existant(s) seront remplaces par les {len(sheet.rows)} "
                "du fichier (D-8).",
            )
        elif existing:
            context.warn(
                SHEET_MILESTONES, None,
                f"Feuille vide ; les {existing} jalon(s) existants sont conserves.",
            )


def _plan_placeholder_activity(context):
    """
    Declare l'activite de rattachement des jalons sans activite (D-10).

    Elle se greffe sur le dernier sous-composant declare par le fichier —
    par convention celui de coordination — et couvre toute la duree du
    projet. Sa creation apparait explicitement dans le rapport.
    """
    sub_codes = list(context.sub_component_codes)
    if not sub_codes:
        context.error(
            SHEET_MILESTONES, None,
            "Des jalons sont sans activity_id mais 09_components ne declare aucun "
            "sous-composant ou rattacher l'activite de rattachement (D-10).",
        )
        return

    start = context.start_date
    end = context.effective_end_date()
    if start is None or end is None:
        context.error(
            SHEET_MILESTONES, None,
            "Des jalons sont sans activity_id ; l'activite de rattachement exige "
            "start_date et end_date sur 01_project (D-10).",
        )
        return

    code = f"{context.project_ref}{PLACEHOLDER_ACTIVITY_SUFFIX}"
    if len(code) > 30:
        code = code[:30]
    sub_code = sub_codes[-1]

    existing = None
    if context.project is not None:
        existing = Activity.objects.filter(
            sub_component__component__project=context.project, code=code
        ).first()

    desired = {
        "name": PLACEHOLDER_ACTIVITY_NAME,
        "planned_start": start,
        "planned_end": end,
        "status": "not_started",
    }
    payload = {
        "code": code,
        "sub_component_code": sub_code,
        "fields": desired,
        "order": 999,
    }
    context.activity_codes.add(code)
    _add_upsert_change(
        context, SHEET_ACTIVITIES, code,
        f"{PLACEHOLDER_ACTIVITY_NAME} — sur {sub_code} (D-10)",
        existing, desired, payload,
    )


# ---------------------------------------------------------------------------
# 12_gadm_scope
# ---------------------------------------------------------------------------


def _parse_gadm(context):
    """
    D-9 : une zone introuvable est un avertissement, pas une erreur.

    Les fichiers portent des niveaux et des orthographes que le referentiel
    GADM charge ne connait pas — SLE1013 decrit six chefferies ADM3 quand la
    base s'arrete a ADM2. Bloquer rendrait le fichier inchargeable ; on
    signale la lacune et on charge le reste (LN-7, dans l'esprit de D-7).
    """
    sheet = context.reader.read(SHEET_GADM)
    if sheet is None:
        return
    if context.lead_country is None:
        if sheet.rows:
            context.warn(
                SHEET_GADM, None,
                "Perimetre GADM ignore : le pays chef de file n'est pas resolu.",
            )
        return

    seen = set()
    for row_number, values in sheet.rows:
        raw_level = as_text(values.get("level"))
        admin1 = as_text(values.get("admin1_name"))
        admin2 = as_text(values.get("admin2_name"))
        admin3 = as_text(values.get("admin3_name"))
        source_site = as_text(values.get("source_site"))

        target_name = admin3 or admin2 or admin1
        if not target_name:
            context.warn(
                SHEET_GADM, row_number, "Ligne sans nom de zone ; ignoree.", column="admin1_name"
            )
            continue

        level = _gadm_level(raw_level, admin1, admin2, admin3)
        area = _resolve_gadm_area(context.lead_country, level, target_name, admin1)
        if area is None:
            context.warn(
                SHEET_GADM, row_number,
                f"Zone GADM introuvable : {raw_level or 'niveau ?'} {target_name!r} "
                f"({context.lead_country.iso3}). Ligne ignoree ; le reste du fichier est "
                "charge (D-9).",
                column="admin1_name" if level == 1 else "admin2_name",
            )
            continue

        if area.pk in seen:
            context.warn(
                SHEET_GADM, row_number,
                f"Zone {area.name} deja declaree plus haut dans la feuille ; ligne ignoree.",
            )
            continue
        seen.add(area.pk)

        existing = None
        if context.project is not None:
            existing = ProjectGadmScope.objects.filter(
                project=context.project, area=area
            ).first()

        payload = {
            "area_id": area.pk,
            "is_primary": len(seen) == 1,
            "notes": source_site,
        }
        detail = f"{area.name} (L{area.level})" + (f" — {source_site}" if source_site else "")
        if existing is None:
            context.plan.add_change(
                SHEET_GADM, ACTION_CREATE, area.name, detail=detail, payload=payload
            )
        else:
            context.plan.add_change(
                SHEET_GADM, ACTION_UNCHANGED, area.name, detail=detail, payload=payload
            )


def _gadm_level(raw_level, admin1, admin2, admin3):
    """Niveau demande par la ligne, deduit des colonnes si `level` est vide."""
    digits = "".join(ch for ch in raw_level if ch.isdigit())
    if digits:
        return int(digits)
    if admin3:
        return 3
    if admin2:
        return 2
    return 1


def _resolve_gadm_area(country, level, name, admin1):
    """
    Resout une zone par nom, a la casse et aux espaces pres.

    GADM stocke `DawakinTofa` la ou le classeur ecrit `Dawakin Tofa` : la
    comparaison porte donc sur une forme sans espaces ni casse. Aucune
    approximation au-dela — un rapprochement flou lierait un projet a la
    mauvaise zone en silence.
    """
    candidates = GadmArea.objects.filter(country=country, level=level)
    wanted = _gadm_key(name)
    for area in candidates.only("id", "name", "name_alt", "level"):
        if _gadm_key(area.name) == wanted or (
            area.name_alt and _gadm_key(area.name_alt) == wanted
        ):
            return area
    return None


def _gadm_key(value):
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


# ---------------------------------------------------------------------------
# Periodes de reporting / 13_results_data
# ---------------------------------------------------------------------------


def _plan_reporting_periods(context):
    """
    Effet de bord du design §7 : les periodes sont regenerees des lors que
    le projet est cree ou que ses dates bougent. `generate_reporting_periods`
    est idempotent et ne genere rien au-dela de `end_date`.
    """
    fields = context.project_fields
    frequency = fields.get("reporting_frequency") or (
        context.project.reporting_frequency if context.project else None
    )
    first_due = fields.get("next_reporting_due") or (
        context.project.next_reporting_due if context.project else None
    )
    end_date = context.effective_end_date()

    if not (frequency and first_due and end_date):
        missing = [
            label
            for label, value in (
                ("reporting_frequency", frequency),
                ("next_reporting_due", first_due),
                ("end_date", end_date),
            )
            if not value
        ]
        context.warn(
            SHEET_PERIODS, None,
            "Aucun calendrier de reporting ne sera genere : " + ", ".join(missing) + " manquant(s).",
        )
        return

    dates_changed = any(
        field in fields for field in ("start_date", "end_date", "reporting_frequency", "next_reporting_due")
    )
    if context.project is not None and not dates_changed:
        context.plan.add_change(
            SHEET_PERIODS, ACTION_UNCHANGED, context.project_ref,
            detail="Calendrier de reporting inchange.",
        )
        return

    context.plan.add_change(
        SHEET_PERIODS, ACTION_CREATE, context.project_ref,
        detail=f"Periodes {frequency} a partir du {first_due.isoformat()} jusqu'au "
               f"{end_date.isoformat()} (les periodes existantes sont conservees).",
        payload={"generate": True},
    )


def _parse_results(context):
    """
    Les deux fichiers courants livrent cette feuille vide (design §7) : le
    chemin est specifie mais peu exerce. La periode est rapprochee par
    libelle ; si elle n'existe pas, on nomme la periode manquante au lieu
    d'en inventer une.
    """
    sheet = context.reader.read(SHEET_RESULTS)
    if sheet is None or not sheet.rows:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("indicator_code"))
        period_label = as_text(values.get("period"))
        value = _read_decimal(context, SHEET_RESULTS, row_number, values, "value")
        narrative = as_text(values.get("narrative"))

        if not code or code not in context.indicator_rows:
            context.error(
                SHEET_RESULTS, row_number,
                f"Indicateur {code!r} absent de 07_indicators_logframe.", column="indicator_code",
            )
            continue
        if not period_label:
            context.error(
                SHEET_RESULTS, row_number, "period est obligatoire.", column="period"
            )
            continue
        if value is None:
            context.error(
                SHEET_RESULTS, row_number, "value est obligatoire.", column="value"
            )
            continue

        period = None
        if context.project is not None:
            period = ReportingPeriod.objects.filter(
                project=context.project, label__iexact=period_label
            ).first()
        if period is None:
            context.error(
                SHEET_RESULTS, row_number,
                f"Periode de reporting {period_label!r} inexistante pour ce projet. "
                "Elle doit etre generee avant de charger des valeurs ; aucune periode "
                "n'est inventee.",
                column="period",
            )
            continue

        existing = ResultsData.objects.filter(
            logframe_row__project=context.project,
            logframe_row__indicator__code=code,
            reporting_period=period,
        ).first()
        desired = {"actual_value": value}
        if narrative:
            desired["narrative"] = narrative
        payload = {
            "indicator_code": code,
            "period_id": period.pk,
            "fields": desired,
        }
        _add_upsert_change(
            context, SHEET_RESULTS, f"{code} @ {period_label}",
            str(value), existing, desired, payload,
        )


# ---------------------------------------------------------------------------
# D-7 — derive
# ---------------------------------------------------------------------------


def _report_drift(context):
    """
    Ce que l'outil contient et que le fichier ne mentionne pas (D-7).

    Rien n'est supprime : supprimer une activite emporterait ses journaux de
    retard, ses alertes et ses instantanes SPI ; supprimer une ligne de
    cadre logique emporterait les valeurs deja saisies. On signale.
    """
    if context.project is None:
        return

    file_activity_codes = context.activity_codes
    orphan_activities = list(
        Activity.objects.filter(sub_component__component__project=context.project)
        .exclude(code__in=file_activity_codes)
        .values_list("code", flat=True)
    )
    if orphan_activities:
        context.warn(
            SHEET_ACTIVITIES, None,
            f"{len(orphan_activities)} activite(s) presentes dans l'outil et absentes du "
            f"fichier ; conservees (D-7) : " + ", ".join(sorted(orphan_activities)[:20]),
        )

    file_indicator_codes = set(context.indicator_rows)
    orphan_rows = list(
        LogframeRow.objects.filter(project=context.project)
        .exclude(indicator__code__in=file_indicator_codes)
        .values_list("indicator__code", flat=True)
    )
    if orphan_rows:
        context.warn(
            SHEET_INDICATORS, None,
            f"{len(orphan_rows)} ligne(s) de cadre logique presentes dans l'outil et absentes "
            f"du fichier ; conservees (D-7) : " + ", ".join(sorted(orphan_rows)[:20]),
        )

    file_component_codes = context.component_codes
    orphan_components = list(
        WorkplanComponent.objects.filter(project=context.project)
        .exclude(code__in=file_component_codes)
        .values_list("code", flat=True)
    )
    if orphan_components:
        context.warn(
            SHEET_COMPONENTS, None,
            f"{len(orphan_components)} composant(s) presents dans l'outil et absents du "
            f"fichier ; conserves (D-7) : " + ", ".join(sorted(orphan_components)[:20]),
        )


# ---------------------------------------------------------------------------
# Lecteurs de cellule adosses au plan
# ---------------------------------------------------------------------------


def _read_enum(context, sheet_name, row_number, values, column, allowed):
    """Litteral du modele, ou None. Une valeur hors liste est une erreur."""
    raw = values.get(column)
    text = as_text(raw)
    if not text:
        return None
    candidate = vocab.normalise(text).replace(" ", "_")
    if candidate in allowed:
        return candidate
    if text in allowed:
        return text
    context.error(
        sheet_name, row_number,
        f"{column} : {text!r} n'est pas une valeur du modele. Valeurs acceptees : "
        + ", ".join(sorted(allowed)),
        column=column,
    )
    return None


def _read_date(context, sheet_name, row_number, values, column):
    try:
        return as_date(values.get(column))
    except (ValueError, TypeError, OverflowError):
        context.error(
            sheet_name, row_number,
            f"{column} : date illisible ({values.get(column)!r}).", column=column,
        )
        return None


def _read_decimal(context, sheet_name, row_number, values, column):
    try:
        return as_decimal(values.get(column))
    except ValueError:
        context.error(
            sheet_name, row_number,
            f"{column} : nombre illisible ({values.get(column)!r}).", column=column,
        )
        return None


def _read_int(context, sheet_name, row_number, values, column):
    try:
        return as_int(values.get(column))
    except ValueError:
        context.error(
            sheet_name, row_number,
            f"{column} : entier illisible ({values.get(column)!r}).", column=column,
        )
        return None
