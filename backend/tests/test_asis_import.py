"""
Tests de l'import AS-IS (core/asis_import) — design §12.

Les classeurs sont construits en memoire par `build_workbook`, qui reproduit
la forme des fichiers reels : treize feuilles, en-tetes annotes, et une ligne
de note sur certaines feuilles seulement — c'est ce qui exerce la detection
de la ligne d'en-tete.
"""
import io

import pytest
from openpyxl import Workbook
from rest_framework.test import APIClient

from tests.factories import (
    CountryFactory,
    CurrencyFactory,
    HubFactory,
    SdgFactory,
    SectorFactory,
    UserFactory,
)

ENDPOINT = "/api/import/asis/"

# Feuilles dont la ligne 1 porte une note, comme dans les classeurs reels.
# 02a_envelope, 03_donors et 04_agencies commencent par leur en-tete.
SHEETS_WITH_NOTE = {
    "01_project",
    "02_financing_source",
    "05_project_partners",
    "07_indicators_logframe",
    "08_logframe_targets",
    "09_components",
    "10_activities",
    "11_milestones",
    "12_gadm_scope",
    "13_results_data",
}

HEADERS = {
    "01_project": [
        "official_reference_number", "name", "acronym", "lead_country_iso3", "hub_code",
        "primary_sector", "primary_sdg", "contributing_sdgs", "gender_marker",
        "geographic_typology", "risk_rating", "budget_amount", "currency",
        "reporting_frequency", "next_reporting_due", "lifecycle_stage",
        "start_date", "end_date",
    ],
    "02a_envelope": ["official_reference_number", "notes"],
    "02_financing_source": ["source (enum)", "instrument (enum)", "amount", "currency", "amount_usd", "note"],
    "03_donors": ["code", "name"],
    "04_agencies": ["code", "name", "agency_type_note"],
    "05_project_partners": ["agency_code", "role", "is_lead"],
    "07_indicators_logframe": [
        "indicator_code", "chain_level", "sector", "name", "definition", "unit",
        "direction", "baseline_value", "baseline_year", "end_target_value",
        "end_target_date", "reporting_frequency", "toc_node_ref (informational)",
    ],
    "08_logframe_targets": ["indicator_code", "target_date", "target_value", "is_original_pad"],
    "09_components": ["code", "parent_code", "level", "sequence", "name"],
    "10_activities": [
        "activity_id", "sub_component_code", "name", "baseline_start", "baseline_end",
        "current_start", "current_end", "status", "budget_planned", "depends_on",
    ],
    "11_milestones": [
        "milestone_id", "activity_id", "name", "baseline_date", "current_date",
        "actual_date", "status",
    ],
    "12_gadm_scope": ["level", "admin1_name", "admin2_name", "admin3_name", "source_site"],
    "13_results_data": ["indicator_code", "period", "value", "source", "narrative"],
}

SHEET_ORDER = [
    "00_README", "98_Loader_Notes", "01_project", "02a_envelope", "02_financing_source",
    "03_donors", "04_agencies", "05_project_partners", "07_indicators_logframe",
    "08_logframe_targets", "09_components", "10_activities", "11_milestones",
    "12_gadm_scope", "13_results_data", "99_Parked",
]


def base_rows(country_iso3, hub_code, sector_code):
    """Un projet coherent et minimal : le point de depart de chaque test."""
    return {
        "01_project": [[
            "REF001", "Projet de test", "PT", country_iso3, hub_code, sector_code,
            1, "2; 5", "", "rural", "moderate", 1000, "USD", "quarterly",
            "2025-03-31", "implementing", "2025-01-01", "2026-12-31",
        ]],
        "02a_envelope": [["REF001", "Note d'enveloppe"]],
        "02_financing_source": [
            ["llf", "grant", 400, "USD", 400, "Part don"],
            ["isdb_oc", "loan", 600, "USD", 600, "Part prêt"],
        ],
        "03_donors": [["TESTDONOR", "Bailleur de test"]],
        "04_agencies": [["TEST-AG", "Agence de test", "government"]],
        "05_project_partners": [["TEST-AG", "lead", "Yes"]],
        "07_indicators_logframe": [[
            "REF001-IND-01", "output", sector_code, "Indicateur de test",
            "Definition", "Hectares", "increase", 0, 2024, 100, "2026-12-31",
            "annual", "REF001-OUT-1",
        ]],
        "08_logframe_targets": [],
        "09_components": [
            ["REF001-C1", "", "Component", 1, "Composante 1"],
            ["REF001-C1.1", "REF001-C1", "Sub-component", 1, "Sous-composante 1.1"],
        ],
        "10_activities": [[
            "REF001-A1", "REF001-C1.1", "Activite de test",
            "2025-01-01", "2026-12-31", "2025-01-01", "2026-12-31",
            "not_started", 500, "",
        ]],
        "11_milestones": [],
        "12_gadm_scope": [],
        "13_results_data": [],
    }


def build_workbook(rows):
    """Serialise `rows` en classeur xlsx et renvoie un fichier en memoire."""
    book = Workbook()
    book.remove(book.active)
    for name in SHEET_ORDER:
        sheet = book.create_sheet(name)
        if name not in HEADERS:
            sheet.append([f"Feuille {name} — ignoree par l'import."])
            continue
        if name in SHEETS_WITH_NOTE:
            sheet.append([f"Note de la feuille {name}."])
        sheet.append(HEADERS[name])
        for row in rows.get(name, []):
            sheet.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    buffer.seek(0)
    return buffer


@pytest.fixture
def reference_data(db):
    """Referentiel minimal : le parser resout ses FK contre la base reelle."""
    country = CountryFactory(iso3="TST", iso2="TS")
    hub = HubFactory(code="hub-test")
    sector = SectorFactory(code="sector-test")
    CurrencyFactory(code="USD")
    for number in (1, 2, 5):
        SdgFactory(number=number)
    return {"country": country, "hub": hub, "sector": sector}


@pytest.fixture
def rows(reference_data):
    return base_rows(
        reference_data["country"].iso3,
        reference_data["hub"].code,
        reference_data["sector"].code,
    )


@pytest.fixture
def auth_client(db):
    client = APIClient()
    client.force_authenticate(user=UserFactory())
    return client


def post(client, workbook, mode="validate", expected_sha256=None):
    payload = {"file": workbook, "mode": mode}
    if expected_sha256 is not None:
        payload["expected_sha256"] = expected_sha256
    return client.post(ENDPOINT, payload, format="multipart")


def messages(items):
    return " | ".join(item["message"] for item in items)


# ---------------------------------------------------------------------------
# Analyse
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_valid_workbook_validates_without_errors(auth_client, rows):
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200, response.data
    assert response.data["errors"] == []
    assert response.data["project_ref"] == "REF001"
    assert response.data["project_exists"] is False
    assert response.data["summary"]["01_project"]["create"] == 1
    assert response.data["file_sha256"]


@pytest.mark.django_db
def test_enum_outside_model_choices_is_an_error(auth_client, rows):
    """Design §8 : une valeur qui n'est pas un litteral du modele bloque."""
    rows["10_activities"][0][7] = "Delayed"  # status
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert any(
        error["sheet"] == "10_activities" and error["column"] == "status"
        for error in response.data["errors"]
    ), messages(response.data["errors"])


@pytest.mark.django_db
def test_unresolved_internal_reference_is_an_error(auth_client, rows):
    """Une activite qui nomme un sous-composant absent de 09_components."""
    rows["10_activities"][0][1] = "REF001-C9.9"
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert any(
        error["column"] == "sub_component_code" for error in response.data["errors"]
    ), messages(response.data["errors"])


@pytest.mark.django_db
def test_financing_must_reconcile_to_budget_amount(auth_client, rows):
    """VAL015 : la somme des lignes doit reconstituer budget_amount."""
    rows["02_financing_source"][0][4] = 300  # amount_usd : 300 + 600 != 1000
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert "VAL015" in messages(response.data["errors"])


@pytest.mark.django_db
def test_end_date_before_start_date_is_an_error(auth_client, rows):
    """VAL012."""
    rows["01_project"][0][17] = "2024-01-01"  # end_date < start_date
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert "VAL012" in messages(response.data["errors"])


@pytest.mark.django_db
def test_unresolved_gadm_area_warns_and_does_not_block(auth_client, rows):
    """
    D-9 : les classeurs decrivent des niveaux que le referentiel GADM charge
    ne connait pas. On signale la lacune et on charge le reste.
    """
    rows["12_gadm_scope"] = [["ADM3", "Province", "District", "Chefferie", "site S01"]]
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200, response.data
    assert any(
        warning["sheet"] == "12_gadm_scope" for warning in response.data["warnings"]
    ), messages(response.data["warnings"])
    assert "12_gadm_scope" not in response.data["summary"]


# ---------------------------------------------------------------------------
# Ecriture
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_commit_writes_then_revalidation_reports_unchanged(auth_client, rows):
    """
    La preuve que l'upsert fonctionne (design §12, etape 4) : rejouer le
    meme fichier ne doit plus rien changer.
    """
    from apps.project.models import Project
    from apps.workplan.models import Activity

    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    assert validation.status_code == 200

    workbook.seek(0)
    commit = post(
        auth_client, workbook, mode="commit",
        expected_sha256=validation.data["file_sha256"],
    )
    assert commit.status_code == 200, commit.data
    assert commit.data["committed"] is True

    project = Project.objects.get(official_reference_number="REF001")
    assert project.pk == commit.data["project_id"]
    assert project.financial_envelope.total_amount_usd == 1000
    assert project.logframe_rows.count() == 1
    assert Activity.objects.filter(sub_component__component__project=project).count() == 1

    workbook.seek(0)
    again = post(auth_client, workbook, mode="validate")
    assert again.status_code == 200
    assert again.data["project_exists"] is True
    actions = {
        change["action"]
        for change in again.data["changes"]
        # Le financement et les jalons sont en remplacement integral par
        # construction (D-8) : ils ne peuvent pas se declarer `unchanged`.
        if change["sheet"] not in ("02_financing_source", "11_milestones")
    }
    assert actions == {"unchanged"}, again.data["changes"]


@pytest.mark.django_db
def test_update_reports_a_field_level_diff(auth_client, rows):
    """Design §6 : une action `update` porte l'ecart champ par champ."""
    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])

    rows["01_project"][0][1] = "Projet de test renomme"
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200
    change = next(c for c in response.data["changes"] if c["sheet"] == "01_project")
    assert change["action"] == "update"
    diff = next(d for d in change["diffs"] if d["field"] == "name")
    assert diff["from"] == "Projet de test"
    assert diff["to"] == "Projet de test renomme"


@pytest.mark.django_db
def test_blank_cell_never_clears_a_stored_value(auth_client, rows):
    """
    Regle du parser : une cellule vide veut dire "non renseignee".

    Les classeurs AS-IS laissent des colonnes de classification vides
    deliberement ; sans cette regle, le premier commit effacerait ce que
    l'interface contient deja.
    """
    from apps.project.models import Project

    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])
    assert Project.objects.get(official_reference_number="REF001").risk_rating == "moderate"

    rows["01_project"][0][10] = ""  # risk_rating vide
    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    assert validation.status_code == 200
    change = next(c for c in validation.data["changes"] if c["sheet"] == "01_project")
    assert change["action"] == "unchanged"

    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])
    assert Project.objects.get(official_reference_number="REF001").risk_rating == "moderate"


@pytest.mark.django_db
def test_activityless_milestone_gets_a_declared_placeholder(auth_client, rows):
    """
    D-10 : Milestone.activity est un FK obligatoire. L'activite de
    rattachement est creee, et sa creation figure au rapport.
    """
    from apps.workplan.models import Milestone

    rows["11_milestones"] = [[
        "REF001-M01", "", "Signature de l'accord de financement",
        "2025-02-01", "", "", "pending",
    ]]
    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    assert validation.status_code == 200, validation.data

    placeholder = [
        change for change in validation.data["changes"]
        if change["sheet"] == "10_activities" and "MILESTONES" in change["target"]
    ]
    assert placeholder and placeholder[0]["action"] == "create"

    workbook.seek(0)
    commit = post(auth_client, workbook, mode="commit",
                  expected_sha256=validation.data["file_sha256"])
    assert commit.status_code == 200, commit.data
    milestone = Milestone.objects.get(name="Signature de l'accord de financement")
    assert milestone.activity.code.endswith("-A-MILESTONES")
    assert milestone.category == "contractual"


@pytest.mark.django_db
def test_existing_donor_is_matched_case_insensitively(auth_client, rows):
    """
    La base porte `isdb`, les classeurs ecrivent `ISDB`. Un rapprochement
    litteral creerait un doublon d'une ligne de referentiel deja presente.
    """
    from apps.reference.models import Donor

    Donor.objects.create(code="testdonor", name="Bailleur deja au referentiel")
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200
    change = next(c for c in response.data["changes"] if c["sheet"] == "03_donors")
    assert change["action"] == "unchanged"
    assert Donor.objects.filter(code__iexact="testdonor").count() == 1


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_commit_with_a_mismatched_hash_returns_409(auth_client, rows):
    """
    D-4 : rien n'est stocke entre les deux appels, donc l'echo de hash est
    ce qui empeche de valider le fichier A puis de confirmer le B.
    """
    from apps.project.models import Project

    response = post(
        auth_client, build_workbook(rows), mode="commit",
        expected_sha256="0" * 64,
    )
    assert response.status_code == 409
    assert not Project.objects.filter(official_reference_number="REF001").exists()


@pytest.mark.django_db
def test_commit_without_a_hash_is_refused(auth_client, rows):
    response = post(auth_client, build_workbook(rows), mode="commit")
    assert response.status_code == 400


@pytest.mark.django_db
def test_a_file_that_is_not_a_zip_is_refused(auth_client):
    """Design §11 : la signature est verifiee sur le contenu, pas sur l'annonce."""
    fake = io.BytesIO(b"Ceci n'est pas un classeur.")
    fake.name = "faux.xlsx"
    response = auth_client.post(
        ENDPOINT, {"file": fake, "mode": "validate"}, format="multipart"
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_a_workbook_missing_sheets_is_refused(auth_client):
    book = Workbook()
    book.remove(book.active)
    book.create_sheet("01_project")
    buffer = io.BytesIO()
    book.save(buffer)
    buffer.seek(0)
    response = post(auth_client, buffer)
    assert response.status_code == 422
    assert "Feuilles absentes" in messages(response.data["errors"])


@pytest.mark.django_db
def test_the_endpoint_requires_authentication(rows):
    response = APIClient().post(
        ENDPOINT, {"file": build_workbook(rows), "mode": "validate"}, format="multipart"
    )
    assert response.status_code in (401, 403)
