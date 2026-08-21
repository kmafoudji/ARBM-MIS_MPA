"""
Parsing an AS-IS workbook -> ImportPlan (design §4, §7, §8).

This module reads the database to resolve references and to compare against
what exists. It never writes. Every decision — create, update, replace,
error, warning — is taken here; `applier` only replays it.

The rule that governs empty cells (plan §1d): an empty cell means "not
supplied" and leaves the stored value untouched. It never clears anything.
The AS-IS workbooks leave classification columns empty deliberately; without
this rule, the first commit would overwrite what the interface already holds.
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

# Sheets that are ignored (design §7).
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
SHEET_PERIODS = "reporting_periods"  # not a sheet: a side effect (design §7)

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

# A header row is recognised by these columns. The design says "a note in
# row 1, headers in row 2"; that is true of 9 sheets out of 13 —
# 02a_envelope, 03_donors and 04_agencies start with the header itself. So
# the header row is searched for rather than assumed.
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

HEADER_SEARCH_DEPTH = 3  # rows examined before giving up
EXCEL_EPOCH = date(1899, 12, 30)  # 1900 system offset, leap-year bug included


# ---------------------------------------------------------------------------
# Cell coercion
# ---------------------------------------------------------------------------


def as_text(value):
    """Cleaned text, or "" if the cell is empty."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def as_date(value):
    """
    A date, or None if empty. Raises ValueError if the value is unusable.

    The workbooks' date cells carry a `yyyy-mm-dd` format, so openpyxl
    already hands back a datetime. The other two branches cover a
    hand-edited file: an ISO string, or a raw Excel serial number.
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
    """A Decimal, or None if empty. Raises ValueError if unusable."""
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    text = str(value).strip().replace(" ", "").replace(",", "")
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"invalid number: {value!r}") from exc


def as_int(value):
    """An integer, or None if empty. Raises ValueError if unusable."""
    decimal_value = as_decimal(value)
    if decimal_value is None:
        return None
    return int(decimal_value)


def as_bool(value):
    """Tolerant yes/no, used by `is_lead`."""
    text = vocab.normalise(value)
    if text in ("yes", "y", "true", "1", "oui"):
        return True
    if text in ("no", "n", "false", "0", "non", ""):
        return False
    return None


# ---------------------------------------------------------------------------
# Reading the workbook
# ---------------------------------------------------------------------------


class SheetRows:
    """The data rows of one sheet, indexed by column name."""

    def __init__(self, name, header_row, headers, rows):
        self.name = name
        self.header_row = header_row
        self.headers = headers
        self.rows = rows  # [(row_number, {column: value})]

    def __iter__(self):
        return iter(self.rows)

    def __len__(self):
        return len(self.rows)


class WorkbookReader:
    """
    Read-only access to the workbook.

    `read_only=True, data_only=True` (design §11): no formula is evaluated,
    no external link is followed, and the file stays in memory.
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
        Return a SheetRows, or None if the sheet is absent.

        The header row is the first of the `HEADER_SEARCH_DEPTH` leading rows
        carrying every expected marker; note rows are therefore skipped
        without having to know how many there are.
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
    Normalise a header label. `toc_node_ref (informational)` and
    `source (enum)` become `toc_node_ref` and `source`: the workbooks
    annotate their headers in parentheses.
    """
    text = as_text(cell)
    if not text:
        return ""
    text = text.split("(")[0]
    return "_".join(text.strip().lower().replace("-", "_").split())


# ---------------------------------------------------------------------------
# Parse context
# ---------------------------------------------------------------------------


class ParseContext:
    """
    State shared between the sheet functions: the plan being built, the
    existing project if there is one, and the registries that let a sheet
    resolve what an earlier sheet planned while nothing exists in the
    database yet.
    """

    def __init__(self, reader, plan):
        self.reader = reader
        self.plan = plan
        self.project = None  # existing instance, or None
        self.project_ref = ""
        self.project_fields = {}  # values coming from 01_project
        self.start_date = None
        self.end_date = None
        self.budget_amount = None
        self.lead_country = None
        # What the file declares, by code.
        self.agency_codes = {}  # workbook code -> ImplementingAgency or None
        self.donor_codes = {}
        self.component_codes = set()
        self.sub_component_codes = {}  # code -> parent code
        self.activity_codes = set()
        self.indicator_rows = {}  # indicator code -> workbook row
        self.planned_targets = {}  # (indicator code, date) -> PlannedChange
        self.has_activityless_milestone = False

    # -- shorthands -------------------------------------------------------

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
    Differences between what exists and what the file asks for.

    `desired` only ever holds values actually supplied: an empty cell is not
    in it and therefore cannot produce a difference. That is the concrete
    form of this module's rule.
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
    """A serialisable value for the report."""
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
# Entry point
# ---------------------------------------------------------------------------


def compute_sha256(file_obj):
    """SHA-256 of the uploaded file (design D-4). Rewinds the cursor."""
    file_obj.seek(0)
    digest = hashlib.sha256()
    for chunk in iter(lambda: file_obj.read(65536), b""):
        digest.update(chunk)
    file_obj.seek(0)
    return digest.hexdigest()


def parse(file_obj):
    """
    Parse the workbook and return a complete ImportPlan.

    Does not raise on a badly filled file: problems become errors on the
    plan, each carrying its sheet and row. Only defects that prevent the
    workbook from being opened at all propagate.
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
                "Sheets missing from the workbook: " + ", ".join(missing)
                + ". The expected file is the 13-sheet AS-IS workbook.",
            )
            return plan

        # Write order of design §9. Each step can stop short if what it
        # depends on is missing; the plan keeps its errors either way.
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
        context.error(SHEET_PROJECT, None, "Empty sheet: there is no project to import.")
        return

    if len(sheet.rows) > 1:
        context.warn(
            SHEET_PROJECT,
            sheet.rows[1][0],
            f"{len(sheet.rows)} project rows; only the first is taken into account "
            "(an AS-IS workbook carries one project).",
        )

    row_number, values = sheet.rows[0]
    reference = as_text(values.get("official_reference_number"))
    if not reference:
        context.error(
            SHEET_PROJECT, row_number,
            "official_reference_number is required: it is the key the project is matched on.",
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
        context.error(SHEET_PROJECT, row_number, "The project name is required.", column="name")
    else:
        desired["name"] = name

    acronym = as_text(values.get("acronym"))
    if acronym:
        if len(acronym) > 20:
            context.error(
                SHEET_PROJECT, row_number,
                f"acronym is {len(acronym)} characters; the model accepts 20.",
                column="acronym",
            )
        else:
            desired["acronym"] = acronym

    # -- reference-table lookups ------------------------------------------

    iso3 = as_text(values.get("lead_country_iso3")).upper()
    if iso3:
        country = Country.objects.filter(iso3=iso3).first()
        if country is None:
            context.error(
                SHEET_PROJECT, row_number,
                f"Unknown lead country: {iso3}.", column="lead_country_iso3",
            )
        else:
            context.lead_country = country

    hub_code = as_text(values.get("hub_code"))
    if hub_code:
        hub = RegionalHub.objects.filter(code__iexact=hub_code).first()
        if hub is None:
            context.error(
                SHEET_PROJECT, row_number, f"Unknown hub: {hub_code}.", column="hub_code",
            )
        else:
            desired["hub"] = hub

    sector_key = as_text(values.get("primary_sector"))
    if sector_key:
        sector = Sector.objects.filter(code__iexact=sector_key).first()
        if sector is None:
            context.error(
                SHEET_PROJECT, row_number,
                f"Unknown primary sector: {sector_key}.", column="primary_sector",
            )
        else:
            desired["primary_sector"] = sector

    primary_sdg = _read_int(context, SHEET_PROJECT, row_number, values, "primary_sdg")
    if primary_sdg is not None:
        sdg = Sdg.objects.filter(number=primary_sdg).first()
        if sdg is None:
            context.error(
                SHEET_PROJECT, row_number, f"Unknown primary SDG: {primary_sdg}.",
                column="primary_sdg",
            )
        else:
            desired["primary_sdg"] = sdg

    currency_code = as_text(values.get("currency")).upper()
    if currency_code:
        currency = Currency.objects.filter(code=currency_code).first()
        if currency is None:
            context.error(
                SHEET_PROJECT, row_number, f"Unknown currency: {currency_code}.", column="currency",
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

    # -- numbers and dates ------------------------------------------------

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

    # VAL012 — the project's bounds must be coherent.
    if context.start_date and context.end_date and context.end_date < context.start_date:
        context.error(
            SHEET_PROJECT, row_number,
            f"VAL012: end_date ({context.end_date}) is earlier than start_date "
            f"({context.start_date}).",
            column="end_date",
        )

    context.project_fields = desired

    # -- countries and contributing SDGs ----------------------------------

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
                f"Unreadable contributing SDG: {token!r}.", column="contributing_sdgs",
            )
            continue
        if not Sdg.objects.filter(number=number).exists():
            context.error(
                SHEET_PROJECT, row_number, f"Unknown contributing SDG: {number}.",
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
        detail=f"Existing project {context.project.code or ''}".strip(),
        diffs=diffs, payload=payload,
    )


def _project_relation_diffs(context, contributing):
    """Differences on the lead country and the contributing SDGs."""
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
        # The envelope is a 1:1 relation created on demand (design §7).
        context.plan.add_change(
            SHEET_ENVELOPE, ACTION_CREATE, context.project_ref,
            detail="Financial envelope created (sheet is empty).", payload={"notes": ""},
        )
        return

    row_number, values = sheet.rows[0]
    reference = as_text(values.get("official_reference_number"))
    if reference and reference != context.project_ref:
        context.error(
            SHEET_ENVELOPE, row_number,
            f"The envelope references {reference}, the project is {context.project_ref}.",
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
            detail="Financial envelope created.", payload=payload,
        )
        return

    desired = {"notes": notes} if notes else {}
    diffs = diff_fields(existing, desired)
    context.plan.add_change(
        SHEET_ENVELOPE, ACTION_UPDATE if diffs else ACTION_UNCHANGED, context.project_ref,
        detail="Existing financial envelope.", diffs=diffs, payload=payload,
    )


def _parse_financing(context):
    """
    Replace-all, scoped to the project being loaded (D-8).

    FinancingSource has no natural key: SLE1013 carries two co_financing +
    loan rows that only their note tells apart. So every row of THIS project
    is replaced, never another project's.
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
            context.error(SHEET_FINANCING, row_number, "source is required.", column="source")
        if instrument is None:
            context.error(
                SHEET_FINANCING, row_number, "instrument is required.", column="instrument"
            )
        if currency is None:
            context.error(
                SHEET_FINANCING, row_number, f"Unknown currency: {currency_code}.", column="currency"
            )
        if amount is None and amount_usd is None:
            context.error(
                SHEET_FINANCING, row_number,
                "Neither amount nor amount_usd is filled in.", column="amount",
            )
            continue

        amount = amount if amount is not None else amount_usd
        amount_usd = amount_usd if amount_usd is not None else amount
        total += amount_usd

        if len(note) > 200:
            context.warn(
                SHEET_FINANCING, row_number,
                "The note is longer than 200 characters and will be truncated in the label.",
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

    # VAL015 — the financing rows must reconcile to the budget.
    if sheet.rows and context.budget_amount is not None and total != context.budget_amount:
        context.error(
            SHEET_FINANCING, sheet.header_row,
            f"VAL015: the financing rows total {total:,.2f} USD, "
            f"budget_amount is {context.budget_amount:,.2f} USD.",
        )

    if context.project is not None:
        existing = FinancingSource.objects.filter(envelope__project=context.project).count()
        if existing and sheet.rows:
            context.warn(
                SHEET_FINANCING, None,
                f"{existing} existing financing row(s) will be replaced by the "
                f"{len(sheet.rows)} in the file (D-8). These two tables have no natural "
                "key to match on, so replacement is the only safe operation; rows "
                "belonging to other projects are never touched.",
            )
        elif existing:
            # An empty sheet means "not supplied", not "wipe this": replace-all
            # must not turn a partial file into an eraser.
            context.warn(
                SHEET_FINANCING, None,
                f"Sheet is empty; the {existing} existing financing row(s) are kept.",
            )


# ---------------------------------------------------------------------------
# 03_donors / 04_agencies — global reference tables
# ---------------------------------------------------------------------------


def _parse_donors(context):
    """
    Create only, never update (design §7): these are global reference
    tables, not project data.

    Matching is case-insensitive: the database holds `isdb`, the workbook
    writes `ISDB`. A literal match would duplicate a row that already exists.
    """
    sheet = context.reader.read(SHEET_DONORS)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("code"))
        name = as_text(values.get("name"))
        if not code:
            context.error(SHEET_DONORS, row_number, "code is required.", column="code")
            continue

        existing = Donor.objects.filter(code__iexact=code).first()
        context.donor_codes[code] = existing
        if existing is not None:
            context.plan.add_change(
                SHEET_DONORS, ACTION_UNCHANGED, code,
                detail=f"Donor already in the reference table under the code {existing.code}.",
            )
            continue
        if not name:
            context.error(
                SHEET_DONORS, row_number,
                f"name is required to create the donor {code}.", column="name",
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
            context.error(SHEET_AGENCIES, row_number, "code is required.", column="code")
            continue

        existing = ImplementingAgency.objects.filter(code__iexact=code).first()
        context.agency_codes[code] = existing
        if existing is not None:
            context.plan.add_change(
                SHEET_AGENCIES, ACTION_UNCHANGED, code,
                detail=f"Agency already in the reference table under the code {existing.code}.",
            )
            continue

        if not name:
            context.error(
                SHEET_AGENCIES, row_number,
                f"name is required to create the agency {code}.", column="name",
            )
            continue

        agency_type, translated = vocab.map_value(vocab.AGENCY_TYPE_MAP, raw_type)
        if agency_type is None:
            context.error(
                SHEET_AGENCIES, row_number,
                f"Unknown agency_type_note: {raw_type!r}. Values that are translated: "
                + ", ".join(sorted(vocab.AGENCY_TYPE_MAP)),
                column="agency_type_note",
            )
            continue
        if translated:
            context.warn(
                SHEET_AGENCIES, row_number,
                f"agency_type_note {raw_type!r} read as {agency_type!r}. The workbook "
                "describes a function, the model a legal nature; the closest match is used.",
                column="agency_type_note",
            )

        near = _near_duplicate_agency(name)
        if near is not None:
            context.warn(
                SHEET_AGENCIES, row_number,
                f"An agency with a matching name already exists in the reference table: "
                f"{near.code} ({near.name}). The file will create a second one under the "
                f"code {code}.",
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
    An existing agency with the same name up to case and spacing.

    The workbooks prefix their codes with the country (`NGA-KNARDA`) where
    the reference table uses a short code (`knarda`): the code cannot detect
    the duplicate, the name can.
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
                SHEET_PARTNERS, row_number, "agency_code is required.", column="agency_code"
            )
            continue
        if agency_code not in context.agency_codes:
            context.error(
                SHEET_PARTNERS, row_number,
                f"Agency {agency_code} is absent from 04_agencies.", column="agency_code",
            )
            continue

        role, translated = vocab.map_value(vocab.PARTNER_ROLE_MAP, raw_role)
        if role is None:
            context.error(
                SHEET_PARTNERS, row_number,
                f"Unknown role: {raw_role!r}. Values that are translated: "
                + ", ".join(sorted(vocab.PARTNER_ROLE_MAP)),
                column="role",
            )
            continue
        if is_lead:
            role = "lead"
        if translated and role != "lead":
            context.warn(
                SHEET_PARTNERS, row_number,
                f"role {raw_role!r} read as {role!r}. The model has no matching literal; "
                "the closest one is used.",
                column="role",
            )

        if role == "lead":
            leads += 1
            if leads > 1:
                # The model carries a unique_lead_partner_per_project
                # constraint: better seen here than as an IntegrityError on write.
                context.error(
                    SHEET_PARTNERS, row_number,
                    "Two lead partners for the same project; the model accepts only one.",
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
    Three objects per row: the catalogue indicator, the project's logframe
    row, and the target carried by `end_target_*`.

    Each becomes its own entry in the report: that is what makes it visible
    when an indicator is already in the catalogue while its logframe row
    still has to be created.
    """
    sheet = context.reader.read(SHEET_INDICATORS)
    if sheet is None:
        return

    for row_number, values in sheet.rows:
        code = as_text(values.get("indicator_code"))
        if not code:
            context.error(
                SHEET_INDICATORS, row_number, "indicator_code is required.",
                column="indicator_code",
            )
            continue
        if code in context.indicator_rows:
            context.error(
                SHEET_INDICATORS, row_number,
                f"indicator_code {code} appears more than once in the sheet.",
                column="indicator_code",
            )
            continue
        context.indicator_rows[code] = row_number

        name = as_text(values.get("name"))
        if not name:
            context.error(
                SHEET_INDICATORS, row_number, "name is required.", column="name"
            )
            continue

        sector_key = as_text(values.get("sector"))
        sector = Sector.objects.filter(code__iexact=sector_key).first() if sector_key else None
        if sector is None:
            context.error(
                SHEET_INDICATORS, row_number,
                f"indicator.sector is a required PROTECT FK; unknown sector: {sector_key!r}.",
                column="sector",
            )
            continue

        chain_level = _read_enum(
            context, SHEET_INDICATORS, row_number, values, "chain_level", vocab.CHAIN_LEVELS
        )
        if chain_level is None:
            context.error(
                SHEET_INDICATORS, row_number, "chain_level is required.", column="chain_level"
            )
            continue

        direction = _read_enum(
            context, SHEET_INDICATORS, row_number, values, "direction", vocab.DIRECTIONS
        )
        if direction is None:
            context.error(
                SHEET_INDICATORS, row_number, "direction is required.", column="direction"
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
                f"Definition is empty for {code}; the indicator will be created without one.",
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
            # Indicator.chain_level does not accept `impact` (a synthesis
            # level belonging to the logframe): only propagate it if valid.
            "chain_level": chain_level if chain_level != "impact" else "",
            "reporting_frequency": frequency or "",
        }

        indicator = Indicator.objects.filter(code=code).first()
        if indicator is None:
            context.plan.add_change(
                SHEET_INDICATORS, ACTION_CREATE, f"Indicator {code}",
                detail=name[:120], payload=indicator_payload,
            )
        else:
            context.plan.add_change(
                SHEET_INDICATORS, ACTION_UNCHANGED, f"Indicator {code}",
                detail="Already in the catalogue (the catalogue is governed by the LLFMU; "
                       "a project file does not rewrite it).",
                payload=indicator_payload,
            )

        # -- logframe row -------------------------------------------------

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
                SHEET_INDICATORS, ACTION_CREATE, f"Logframe row {code}",
                detail=chain_level, payload=row_payload,
            )
        else:
            diffs = diff_fields(existing_row, row_desired)
            context.plan.add_change(
                SHEET_INDICATORS, ACTION_UPDATE if diffs else ACTION_UNCHANGED,
                f"Logframe row {code}", detail=chain_level, diffs=diffs, payload=row_payload,
            )

        # -- end target ---------------------------------------------------

        target_value = _read_decimal(
            context, SHEET_INDICATORS, row_number, values, "end_target_value"
        )
        target_date = _read_date(context, SHEET_INDICATORS, row_number, values, "end_target_date")
        if target_value is None or target_date is None:
            if target_value is not None or target_date is not None:
                context.warn(
                    SHEET_INDICATORS, row_number,
                    "Incomplete end target (value and date are required together); ignored.",
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
    Plan a LogframeTarget on the key (logframe_row, target_date).

    That is the same key for the end target from 07 and for a target from
    08: a target appearing in both sheets updates one row instead of
    creating two (design §7).
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
        # Second appearance: sheet 08 is more specific than the end target
        # derived from 07, so it wins.
        already.payload.update(payload)
        already.detail = f"{target_value} on {target_date.isoformat()}"
        return

    end_date = context.effective_end_date()
    if end_date and target_date > end_date:
        context.warn(
            sheet_name, row_number,
            f"Target dated {target_date.isoformat()}, beyond end_date "
            f"({end_date.isoformat()}). Legitimate for a PAD; reported without blocking.",
            column="target_date",
        )

    existing_target = None
    if existing_row is not None:
        existing_target = LogframeTarget.objects.filter(
            logframe_row=existing_row, target_date=target_date
        ).first()

    target_label = f"Target {indicator_code} @ {target_date.isoformat()}"
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
                SHEET_TARGETS, row_number, "indicator_code is required.",
                column="indicator_code",
            )
            continue
        if code not in context.indicator_rows:
            context.error(
                SHEET_TARGETS, row_number,
                f"Indicator {code} is absent from 07_indicators_logframe.",
                column="indicator_code",
            )
            continue

        target_date = _read_date(context, SHEET_TARGETS, row_number, values, "target_date")
        target_value = _read_decimal(context, SHEET_TARGETS, row_number, values, "target_value")
        if target_date is None or target_value is None:
            context.error(
                SHEET_TARGETS, row_number,
                "target_date and target_value are both required.", column="target_date",
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
    """One sheet for both levels: `level` names the target model."""
    sheet = context.reader.read(SHEET_COMPONENTS)
    if sheet is None:
        return

    # First pass: the components, so that sub-components can resolve their
    # parent whatever order the rows come in.
    rows = []
    for row_number, values in sheet.rows:
        code = as_text(values.get("code"))
        raw_level = as_text(values.get("level"))
        level, _ = vocab.map_value(vocab.COMPONENT_LEVEL_MAP, raw_level)
        if not code:
            context.error(SHEET_COMPONENTS, row_number, "code is required.", column="code")
            continue
        if level is None:
            context.error(
                SHEET_COMPONENTS, row_number,
                f"Unknown level: {raw_level!r}. Expected: Component or Sub-component.",
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
                SHEET_COMPONENTS, row_number, f"name is required for {code}.", column="name"
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
                f"Sub-component {code}: parent_code {parent_code!r} is absent from the sheet.",
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
                SHEET_ACTIVITIES, row_number, "activity_id is required.", column="activity_id"
            )
            continue
        if len(code) > 30:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"activity_id is {len(code)} characters; the model accepts 30.",
                column="activity_id",
            )
            continue
        if sub_code not in context.sub_component_codes:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activity {code}: sub-component {sub_code!r} is absent from 09_components.",
                column="sub_component_code",
            )
            continue
        if not name:
            context.error(
                SHEET_ACTIVITIES, row_number, f"name is required for {code}.", column="name"
            )
            continue

        planned_start = _read_date(context, SHEET_ACTIVITIES, row_number, values, "current_start") \
            or _read_date(context, SHEET_ACTIVITIES, row_number, values, "baseline_start")
        planned_end = _read_date(context, SHEET_ACTIVITIES, row_number, values, "current_end") \
            or _read_date(context, SHEET_ACTIVITIES, row_number, values, "baseline_end")
        if planned_start is None or planned_end is None:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activity {code}: start and end dates are required "
                "(planned_start / planned_end are not nullable).",
                column="baseline_start",
            )
            continue
        if planned_end < planned_start:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activity {code}: the end ({planned_end}) precedes the start ({planned_start}).",
                column="current_end",
            )
            continue

        status = _read_enum(
            context, SHEET_ACTIVITIES, row_number, values, "status", vocab.ACTIVITY_STATUSES
        )
        if status is None:
            context.error(
                SHEET_ACTIVITIES, row_number,
                f"Activity {code}: status is required.", column="status",
            )
            continue

        budget = _read_decimal(context, SHEET_ACTIVITIES, row_number, values, "budget_planned")
        end_date = context.effective_end_date()
        if end_date and planned_end > end_date:
            context.warn(
                SHEET_ACTIVITIES, row_number,
                f"Activity {code}: ends {planned_end.isoformat()}, beyond end_date "
                f"({end_date.isoformat()}).",
                column="current_end",
            )

        depends_on = as_text(values.get("depends_on"))
        if depends_on:
            context.warn(
                SHEET_ACTIVITIES, row_number,
                f"depends_on ({depends_on}) is not loaded: ActivityDependency is out of "
                "scope for this import.",
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
PLACEHOLDER_ACTIVITY_NAME = "Project milestones (placeholder activity)"


def _parse_milestones(context):
    """
    Replace-all, scoped to the project (D-8): Milestone has no code column,
    therefore no key to match on.

    D-10: `Milestone.activity` is a required FK, and the six SLE1013
    milestones have no activity. They attach to a placeholder activity,
    created only if the file needs one and announced in the report as a
    creation in its own right — never quietly.
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
                f"name is required for milestone {milestone_id or row_number}.", column="name",
            )
            continue

        planned_date = _read_date(context, SHEET_MILESTONES, row_number, values, "current_date") \
            or _read_date(context, SHEET_MILESTONES, row_number, values, "baseline_date")
        if planned_date is None:
            context.error(
                SHEET_MILESTONES, row_number,
                f"Milestone {milestone_id or name}: planned_date is required.",
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
                f"Milestone {milestone_id or name}: status is required.", column="status",
            )
            continue

        if activity_code and activity_code not in context.activity_codes:
            context.error(
                SHEET_MILESTONES, row_number,
                f"Milestone {milestone_id or name}: activity {activity_code!r} is absent "
                "from 10_activities.",
                column="activity_id",
            )
            continue

        if not activity_code:
            context.has_activityless_milestone = True
            context.warn(
                SHEET_MILESTONES, row_number,
                f"Milestone {milestone_id or name} has no activity_id: it attaches to the "
                f"activity {context.project_ref}{PLACEHOLDER_ACTIVITY_SUFFIX}, which the "
                "import creates because Milestone.activity is a required FK (D-10).",
                column="activity_id",
            )

        end_date = context.effective_end_date()
        if end_date and planned_date > end_date:
            context.warn(
                SHEET_MILESTONES, row_number,
                f"Milestone dated {planned_date.isoformat()}, beyond end_date "
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
        # The workbook has no `category` column and the model requires one:
        # one warning for the sheet, not one per row — the value is the same
        # everywhere and repeating it would drown the report.
        context.warn(
            SHEET_MILESTONES, sheet.header_row,
            f"The workbook has no `category` column; the {len(sheet.rows)} milestones take "
            f"the value {vocab.DEFAULT_MILESTONE_CATEGORY!r} (D-10).",
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
                f"{existing} existing milestone(s) will be replaced by the {len(sheet.rows)} "
                "in the file (D-8). Milestone has no code column to match on, so "
                "replacement is the only safe operation; other projects are never touched.",
            )
        elif existing:
            context.warn(
                SHEET_MILESTONES, None,
                f"Sheet is empty; the {existing} existing milestone(s) are kept.",
            )


def _plan_placeholder_activity(context):
    """
    Declare the activity that carries milestones with no activity (D-10).

    It hangs off the last sub-component the file declares — by convention
    the coordination one — and spans the whole project. Its creation appears
    explicitly in the report.
    """
    sub_codes = list(context.sub_component_codes)
    if not sub_codes:
        context.error(
            SHEET_MILESTONES, None,
            "Some milestones have no activity_id, but 09_components declares no "
            "sub-component for the placeholder activity to attach to (D-10).",
        )
        return

    start = context.start_date
    end = context.effective_end_date()
    if start is None or end is None:
        context.error(
            SHEET_MILESTONES, None,
            "Some milestones have no activity_id; the placeholder activity requires "
            "start_date and end_date on 01_project (D-10).",
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
        f"{PLACEHOLDER_ACTIVITY_NAME} — on {sub_code} (D-10)",
        existing, desired, payload,
    )


# ---------------------------------------------------------------------------
# 12_gadm_scope
# ---------------------------------------------------------------------------


def _parse_gadm(context):
    """
    D-9: an area that cannot be resolved is a warning, not an error.

    The files carry levels and spellings the loaded GADM reference does not
    know — SLE1013 describes six ADM3 chiefdoms while the database stops at
    ADM2. Blocking would make the file unloadable; the gap is reported and
    the rest is loaded (LN-7, in the spirit of D-7).
    """
    sheet = context.reader.read(SHEET_GADM)
    if sheet is None:
        return
    if context.lead_country is None:
        if sheet.rows:
            context.warn(
                SHEET_GADM, None,
                "Geographic scope skipped: the lead country is not resolved.",
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
                SHEET_GADM, row_number, "Row carries no area name; ignored.", column="admin1_name"
            )
            continue

        level = _gadm_level(raw_level, admin1, admin2, admin3)
        area = _resolve_gadm_area(context.lead_country, level, target_name, admin1)
        if area is None:
            context.warn(
                SHEET_GADM, row_number,
                f"GADM area not found: {raw_level or 'level ?'} {target_name!r} "
                f"({context.lead_country.iso3}). Row skipped; the rest of the file is "
                "loaded (D-9).",
                column="admin1_name" if level == 1 else "admin2_name",
            )
            continue

        if area.pk in seen:
            context.warn(
                SHEET_GADM, row_number,
                f"Area {area.name} was already declared earlier in the sheet; row skipped.",
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
    """The level the row asks for, inferred from the columns if `level` is empty."""
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
    Resolve an area by name, up to case and spacing.

    GADM stores `DawakinTofa` where the workbook writes `Dawakin Tofa`, so
    the comparison runs on a form without spaces or case. Nothing looser
    than that — a fuzzy match would silently bind a project to the wrong
    area.
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
# Reporting periods / 13_results_data
# ---------------------------------------------------------------------------


def _plan_reporting_periods(context):
    """
    A side effect of design §7: the schedule is regenerated as soon as the
    project is created or its dates move. `generate_reporting_periods` is
    idempotent and generates nothing beyond `end_date`.
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
            "No reporting schedule will be generated: " + ", ".join(missing) + " missing.",
        )
        return

    # The schedule only moves if one of the dates that drive it ACTUALLY
    # moves. Keying on the column being present in the file would announce a
    # creation on every re-run while nothing would be written: the report has
    # to say what will happen, not what was read.
    schedule_fields = {"start_date", "end_date", "reporting_frequency", "next_reporting_due"}
    project_changes = context.plan.changes_for(SHEET_PROJECT)
    project_created = bool(project_changes) and project_changes[0].action == ACTION_CREATE
    dates_changed = project_created or any(
        diff.field in schedule_fields
        for change in project_changes
        for diff in change.diffs
    )
    # A project whose dates have not moved but which has no period at all
    # still needs them.
    has_periods = (
        context.project is not None
        and ReportingPeriod.objects.filter(project=context.project).exists()
    )
    if context.project is not None and not dates_changed and has_periods:
        context.plan.add_change(
            SHEET_PERIODS, ACTION_UNCHANGED, context.project_ref,
            detail="Reporting schedule unchanged.",
        )
        return

    context.plan.add_change(
        SHEET_PERIODS, ACTION_CREATE, context.project_ref,
        detail=f"{frequency} periods from {first_due.isoformat()} through "
               f"{end_date.isoformat()} (existing periods are kept).",
        payload={"generate": True},
    )


def _parse_results(context):
    """
    Both current files ship this sheet empty (design §7): the path is
    specified but barely exercised. The period is matched by label; if none
    exists, the missing period is named rather than invented.
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
                f"Indicator {code!r} is absent from 07_indicators_logframe.",
                column="indicator_code",
            )
            continue
        if not period_label:
            context.error(
                SHEET_RESULTS, row_number, "period is required.", column="period"
            )
            continue
        if value is None:
            context.error(
                SHEET_RESULTS, row_number, "value is required.", column="value"
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
                f"Reporting period {period_label!r} does not exist for this project. "
                "It has to be generated before values can be loaded; no period is invented.",
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
# D-7 — drift
# ---------------------------------------------------------------------------


def _report_drift(context):
    """
    What the tool holds and the file does not mention (D-7).

    Nothing is deleted: deleting an activity would take its delay logs, its
    alerts and its SPI snapshots with it; deleting a logframe row would take
    the values already entered. The drift is reported instead.
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
            f"{len(orphan_activities)} activity/activities present in the tool and absent "
            f"from the file; kept (D-7): " + ", ".join(sorted(orphan_activities)[:20]),
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
            f"{len(orphan_rows)} logframe row(s) present in the tool and absent from the "
            f"file; kept (D-7): " + ", ".join(sorted(orphan_rows)[:20]),
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
            f"{len(orphan_components)} component(s) present in the tool and absent from the "
            f"file; kept (D-7): " + ", ".join(sorted(orphan_components)[:20]),
        )


# ---------------------------------------------------------------------------
# Cell readers backed by the plan
# ---------------------------------------------------------------------------


def _read_enum(context, sheet_name, row_number, values, column, allowed):
    """A model literal, or None. A value outside the list is an error."""
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
        f"{column}: {text!r} is not a value the model accepts. Accepted values: "
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
            f"{column}: unreadable date ({values.get(column)!r}).", column=column,
        )
        return None


def _read_decimal(context, sheet_name, row_number, values, column):
    try:
        return as_decimal(values.get(column))
    except ValueError:
        context.error(
            sheet_name, row_number,
            f"{column}: unreadable number ({values.get(column)!r}).", column=column,
        )
        return None


def _read_int(context, sheet_name, row_number, values, column):
    try:
        return as_int(values.get(column))
    except ValueError:
        context.error(
            sheet_name, row_number,
            f"{column}: unreadable integer ({values.get(column)!r}).", column=column,
        )
        return None
