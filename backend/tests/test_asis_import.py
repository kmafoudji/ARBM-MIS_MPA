"""
Tests for the AS-IS import (core/asis_import) — design §12.

The workbooks are built in memory by `build_workbook`, which reproduces the
shape of the real files: thirteen sheets, annotated headers, and a note row
on some sheets only — which is what exercises the header-row detection.
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

# Sheets whose row 1 carries a note, as in the real workbooks.
# 02a_envelope, 03_donors and 04_agencies start with their header.
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
        "primary_sector", "sdgs", "gender_marker",
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

PROJECT_NAME = "Test project"


def base_rows(country_iso3, hub_code, sector_code):
    """A coherent, minimal project: the starting point of every test."""
    return {
        "01_project": [[
            "REF001", PROJECT_NAME, "TP", country_iso3, hub_code, sector_code,
            "1; 2; 5", "", "rural", "moderate", 1000, "USD", "quarterly",
            "2025-03-31", "implementing", "2025-01-01", "2026-12-31",
        ]],
        "02a_envelope": [["REF001", "Envelope note"]],
        "02_financing_source": [
            ["llf", "grant", 400, "USD", 400, "Grant share"],
            ["isdb_oc", "loan", 600, "USD", 600, "Loan share"],
        ],
        "03_donors": [["TESTDONOR", "Test donor"]],
        "04_agencies": [["TEST-AG", "Test agency", "government"]],
        "05_project_partners": [["TEST-AG", "lead", "Yes"]],
        "07_indicators_logframe": [[
            "REF001-IND-01", "output", sector_code, "Test indicator",
            "Definition", "Hectares", "increase", 0, 2024, 100, "2026-12-31",
            "annual", "REF001-OUT-1",
        ]],
        "08_logframe_targets": [],
        "09_components": [
            ["REF001-C1", "", "Component", 1, "Component 1"],
            ["REF001-C1.1", "REF001-C1", "Sub-component", 1, "Sub-component 1.1"],
        ],
        "10_activities": [[
            "REF001-A1", "REF001-C1.1", "Test activity",
            "2025-01-01", "2026-12-31", "2025-01-01", "2026-12-31",
            "not_started", 500, "",
        ]],
        "11_milestones": [],
        "12_gadm_scope": [],
        "13_results_data": [],
    }


def build_workbook(rows):
    """Serialise `rows` into an xlsx workbook and return an in-memory file."""
    book = Workbook()
    book.remove(book.active)
    for name in SHEET_ORDER:
        sheet = book.create_sheet(name)
        if name not in HEADERS:
            sheet.append([f"Sheet {name} — ignored by the import."])
            continue
        if name in SHEETS_WITH_NOTE:
            sheet.append([f"Note for sheet {name}."])
        sheet.append(HEADERS[name])
        for row in rows.get(name, []):
            sheet.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    buffer.seek(0)
    return buffer


@pytest.fixture
def reference_data(db):
    """Minimal reference tables: the parser resolves its FKs against the real database."""
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
# Parsing
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
    """Design §8: a value that is not a model literal blocks the import."""
    rows["10_activities"][0][7] = "Delayed"  # status
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert any(
        error["sheet"] == "10_activities" and error["column"] == "status"
        for error in response.data["errors"]
    ), messages(response.data["errors"])


@pytest.mark.django_db
def test_unresolved_internal_reference_is_an_error(auth_client, rows):
    """An activity naming a sub-component absent from 09_components."""
    rows["10_activities"][0][1] = "REF001-C9.9"
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert any(
        error["column"] == "sub_component_code" for error in response.data["errors"]
    ), messages(response.data["errors"])


@pytest.mark.django_db
def test_financing_must_reconcile_to_budget_amount(auth_client, rows):
    """VAL015: the financing rows must add back up to budget_amount."""
    rows["02_financing_source"][0][4] = 300  # amount_usd: 300 + 600 != 1000
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert "VAL015" in messages(response.data["errors"])


@pytest.mark.django_db
def test_end_date_before_start_date_is_an_error(auth_client, rows):
    """VAL012."""
    rows["01_project"][0][16] = "2024-01-01"  # end_date < start_date
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 422
    assert "VAL012" in messages(response.data["errors"])


@pytest.mark.django_db
def test_unresolved_gadm_area_warns_and_does_not_block(auth_client, rows):
    """
    D-9: the workbooks describe levels the loaded GADM reference does not
    know. The gap is reported and the rest of the file is loaded.
    """
    rows["12_gadm_scope"] = [["ADM3", "Province", "District", "Chiefdom", "site S01"]]
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200, response.data
    assert any(
        warning["sheet"] == "12_gadm_scope" for warning in response.data["warnings"]
    ), messages(response.data["warnings"])
    assert "12_gadm_scope" not in response.data["summary"]


# ---------------------------------------------------------------------------
# Writing
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_commit_writes_then_revalidation_reports_unchanged(auth_client, rows):
    """
    The proof that the upsert works (design §12, step 4): replaying the same
    file must change nothing.
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
    assert sorted(project.sdgs.values_list("number", flat=True)) == [1, 2, 5]
    assert project.logframe_rows.count() == 1
    assert Activity.objects.filter(sub_component__component__project=project).count() == 1

    workbook.seek(0)
    again = post(auth_client, workbook, mode="validate")
    assert again.status_code == 200
    assert again.data["project_exists"] is True
    # Every sheet, with no exception. Financing and milestones used to be
    # excluded here because replace-all could not report itself as unchanged;
    # syncing them by content is what removed that exception.
    actions = {change["action"] for change in again.data["changes"]}
    assert actions == {"unchanged"}, again.data["changes"]


@pytest.mark.django_db
def test_legacy_sdg_columns_are_folded_into_the_set(auth_client, rows):
    """ADR 0006: v0.x workbooks with primary_sdg + contributing_sdgs still load."""
    from apps.project.models import Project

    legacy_rows = dict(rows)
    legacy_rows["01_project"] = [list(rows["01_project"][0])]
    legacy_rows["01_project"][0][6] = ""  # the new `sdgs` column left empty
    legacy_headers = {name: list(cols) for name, cols in HEADERS.items()}
    legacy_headers["01_project"] = legacy_headers["01_project"] + ["primary_sdg", "contributing_sdgs"]
    legacy_rows["01_project"][0] += [1, "2; 5"]

    original = dict(HEADERS)
    HEADERS.update(legacy_headers)
    try:
        workbook = build_workbook(legacy_rows)
    finally:
        HEADERS.clear()
        HEADERS.update(original)

    validation = post(auth_client, workbook, mode="validate")
    assert validation.status_code == 200, validation.data
    assert any("legacy" in w["message"] for w in validation.data["warnings"]), \
        messages(validation.data["warnings"])
    workbook.seek(0)
    commit = post(auth_client, workbook, mode="commit",
                  expected_sha256=validation.data["file_sha256"])
    assert commit.status_code == 200, commit.data
    project = Project.objects.get(official_reference_number="REF001")
    assert sorted(project.sdgs.values_list("number", flat=True)) == [1, 2, 5]


@pytest.mark.django_db
def test_update_reports_a_field_level_diff(auth_client, rows):
    """Design §6: an `update` action carries the difference field by field."""
    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])

    renamed = f"{PROJECT_NAME} renamed"
    rows["01_project"][0][1] = renamed
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200
    change = next(c for c in response.data["changes"] if c["sheet"] == "01_project")
    assert change["action"] == "update"
    diff = next(d for d in change["diffs"] if d["field"] == "name")
    assert diff["from"] == PROJECT_NAME
    assert diff["to"] == renamed


@pytest.mark.django_db
def test_blank_cell_never_clears_a_stored_value(auth_client, rows):
    """
    The parser's rule: an empty cell means "not supplied".

    The AS-IS workbooks leave classification columns empty deliberately;
    without this rule the first commit would erase what the interface
    already holds.
    """
    from apps.project.models import Project

    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])
    assert Project.objects.get(official_reference_number="REF001").risk_rating == "moderate"

    rows["01_project"][0][9] = ""  # risk_rating left empty
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
    D-10: Milestone.activity is a required FK. The placeholder activity is
    created, and its creation appears in the report.
    """
    from apps.workplan.models import Milestone

    rows["11_milestones"] = [[
        "REF001-M01", "", "Financing agreement signature",
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
    milestone = Milestone.objects.get(name="Financing agreement signature")
    assert milestone.activity.code.endswith("-A-MILESTONES")
    assert milestone.category == "contractual"


@pytest.mark.django_db
def test_a_stage_at_or_past_effective_activates_the_workspace(auth_client, rows):
    """
    The importer writes `lifecycle_stage` directly, so the SF-4 state machine
    never runs and never generates the workspace. `ProjectDetail` locks the
    Workplan and Results tabs on that row, which left everything the import
    loaded present in the database and unreachable in the interface.
    """
    from apps.project.models import Project, ProjectWorkspace

    workbook = build_workbook(rows)  # 01_project declares `implementing`
    validation = post(auth_client, workbook, mode="validate")
    assert validation.status_code == 200, validation.data
    planned = [c for c in validation.data["changes"] if c["sheet"] == "workspace"]
    assert planned and planned[0]["action"] == "create"

    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])

    project = Project.objects.get(official_reference_number="REF001")
    assert ProjectWorkspace.objects.filter(project=project).exists()

    # Idempotent: a second pass reports it as already activated.
    again = post(auth_client, build_workbook(rows))
    planned = [c for c in again.data["changes"] if c["sheet"] == "workspace"]
    assert planned and planned[0]["action"] == "unchanged"


@pytest.mark.django_db
def test_a_stage_before_effective_activates_nothing(auth_client, rows):
    """Below Effective the workspace is not implied and must not be invented."""
    rows["01_project"][0][14] = "appraisal"  # lifecycle_stage
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200, response.data
    assert "workspace" not in response.data["summary"]


@pytest.mark.django_db
def test_setting_the_stage_directly_warns_that_no_audit_row_is_written(auth_client, rows):
    """
    A project loaded from a file has no transition history. Reconstructing it
    would invent dates, actors and justifications in the one table whose value
    is being immutable and true (POL-1.09), so the report says so instead.
    """
    from apps.project.models import ProjectStageTransition, Project

    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    assert any(
        w["column"] == "lifecycle_stage" for w in validation.data["warnings"]
    ), messages(validation.data["warnings"])

    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])
    project = Project.objects.get(official_reference_number="REF001")
    assert ProjectStageTransition.objects.filter(project=project).count() == 0


def test_the_written_field_sets_name_real_model_fields():
    """
    The replace-all warning subtracts these sets from the model to say what a
    confirm costs. A typo would silently inflate the list of losses, so the
    names are checked against the models. Nothing can prove the applier writes
    exactly these — that part stays a comment on the constants.
    """
    from apps.project.models import FinancingSource
    from apps.workplan.models import Milestone
    from core.asis_import.parser import (
        FINANCING_WRITTEN_FIELDS,
        MILESTONE_WRITTEN_FIELDS,
        _fields_reset_by_replacement,
    )

    for model, written in (
        (FinancingSource, FINANCING_WRITTEN_FIELDS),
        (Milestone, MILESTONE_WRITTEN_FIELDS),
    ):
        names = {f.name for f in model._meta.fields}
        assert written <= names, f"{model.__name__}: {written - names}"

    # The two the design missed until 21 August 2026.
    assert "donor" in _fields_reset_by_replacement(FinancingSource, FINANCING_WRITTEN_FIELDS)
    assert "is_gate" in _fields_reset_by_replacement(Milestone, MILESTONE_WRITTEN_FIELDS)


MILESTONE_ROW = [
    "REF001-M01", "", "Financing agreement signature",
    "2025-02-01", "", "", "pending",
]


def commit_once(client, rows):
    """Validate then commit, returning the committed report."""
    workbook = build_workbook(rows)
    validation = post(client, workbook, mode="validate")
    assert validation.status_code == 200, validation.data
    workbook.seek(0)
    committed = post(client, workbook, mode="commit",
                     expected_sha256=validation.data["file_sha256"])
    assert committed.status_code == 200, committed.data
    return committed


@pytest.mark.django_db
def test_an_unchanged_reload_warns_about_nothing_and_touches_nothing(auth_client, rows):
    """
    The point of syncing by content: a file that has not changed costs
    nothing. No warning, no write, and the stored rows keep their identity.
    """
    from apps.project.models import FinancingSource, Project
    from apps.workplan.models import Milestone

    rows["11_milestones"] = [list(MILESTONE_ROW)]
    commit_once(auth_client, rows)

    project = Project.objects.get(official_reference_number="REF001")
    before_financing = set(
        FinancingSource.objects.filter(envelope__project=project).values_list("pk", flat=True)
    )
    before_milestones = set(
        Milestone.objects.filter(
            activity__sub_component__component__project=project
        ).values_list("pk", flat=True)
    )

    again = post(auth_client, build_workbook(rows))
    assert again.status_code == 200
    text = messages(again.data["warnings"])
    assert "will be deleted" not in text

    commit_once(auth_client, rows)
    assert before_financing == set(
        FinancingSource.objects.filter(envelope__project=project).values_list("pk", flat=True)
    )
    assert before_milestones == set(
        Milestone.objects.filter(
            activity__sub_component__component__project=project
        ).values_list("pk", flat=True)
    )


@pytest.mark.django_db
def test_hand_edited_fields_survive_an_unchanged_reload(auth_client, rows):
    """
    `donor` and `is_gate` have no column in the workbook. Under replace-all
    they were cleared on every load; rows that do not change are now left
    alone, so they survive. `is_gate` is a control, not just a value — it is
    what stops an activity reaching 100% before its milestone (RG-5.2).
    """
    from apps.project.models import FinancingSource, Project
    from apps.reference.models import Donor
    from apps.workplan.models import Milestone

    rows["11_milestones"] = [list(MILESTONE_ROW)]
    commit_once(auth_client, rows)
    project = Project.objects.get(official_reference_number="REF001")

    donor = Donor.objects.create(code="handpicked", name="Entered through the interface")
    financing = FinancingSource.objects.filter(envelope__project=project).first()
    financing.donor = donor
    financing.save()
    milestone = Milestone.objects.filter(
        activity__sub_component__component__project=project
    ).first()
    milestone.is_gate = True
    milestone.evidence_url = "https://example.test/evidence.pdf"
    milestone.save()

    commit_once(auth_client, rows)

    financing.refresh_from_db()
    milestone.refresh_from_db()
    assert financing.donor == donor
    assert milestone.is_gate is True
    assert milestone.evidence_url == "https://example.test/evidence.pdf"


@pytest.mark.django_db
def test_a_changed_row_is_one_delete_and_one_create(auth_client, rows):
    """
    Without a key there is no way to recognise a changed row as the same row,
    so it is removed and written again — but only that row. The others stay
    untouched, which is the whole difference from replace-all.
    """
    rows["02_financing_source"] = [
        ["llf", "grant", 400, "USD", 400, "Grant share"],
        ["isdb_oc", "loan", 600, "USD", 600, "Loan share"],
    ]
    commit_once(auth_client, rows)

    # The note changes; the amounts still reconcile, so VAL015 stays happy.
    rows["02_financing_source"][1][5] = "Loan share — renegotiated"
    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200, response.data
    counts = response.data["summary"]["02_financing_source"]
    assert counts["create"] == 1
    assert counts["delete"] == 1
    assert counts["unchanged"] == 1
    text = messages(response.data["warnings"])
    assert "is_gate" not in text  # the milestone warning must not fire here
    assert "1 financing row(s) will be deleted and 1 created" in text


@pytest.mark.django_db
def test_replacing_milestones_warns_when_alerts_hang_off_them(auth_client, rows):
    """
    WorkplanAlert.milestone is CASCADE. The design asserted nothing referenced
    Milestone; it was wrong, so the alerts are counted and reported.
    """
    from apps.workplan.models import Milestone, WorkplanAlert

    rows["11_milestones"] = [[
        "REF001-M01", "", "Financing agreement signature",
        "2025-02-01", "", "", "pending",
    ]]
    workbook = build_workbook(rows)
    validation = post(auth_client, workbook, mode="validate")
    workbook.seek(0)
    post(auth_client, workbook, mode="commit",
         expected_sha256=validation.data["file_sha256"])

    milestone = Milestone.objects.get(name="Financing agreement signature")
    WorkplanAlert.objects.create(
        project=milestone.activity.project,
        activity=milestone.activity,
        milestone=milestone,
        alert_type="milestone_t30",
        message="Milestone due in 30 days.",
    )

    # Unchanged file: the milestone is not deleted, so nothing is at risk.
    quiet = post(auth_client, build_workbook(rows))
    assert "workplan alert(s)" not in messages(quiet.data["warnings"])

    # Change the milestone: now it is deleted and recreated, and the alert
    # goes with it (WorkplanAlert.milestone is CASCADE).
    rows["11_milestones"][0][6] = "achieved"
    again = post(auth_client, build_workbook(rows))
    assert again.status_code == 200
    assert "workplan alert(s)" in messages(again.data["warnings"])


@pytest.mark.django_db
def test_an_acronym_named_reference_row_is_flagged_as_a_near_duplicate(auth_client, rows):
    """
    The case a name-only comparison missed on the real data: the reference
    table held `knarda` named "KNARDA" while NGA1007 declared `NGA-KNARDA`
    named "Kano State Agricultural and Rural Development Authority". Same
    body, no shared name — the signal is in the code.
    """
    from apps.reference.models import ImplementingAgency

    ImplementingAgency.objects.create(
        code="knarda", name="KNARDA", agency_type="national_agency"
    )
    rows["04_agencies"] = [[
        "NGA-KNARDA", "Kano State Agricultural and Rural Development Authority", "government",
    ]]
    rows["05_project_partners"] = [["NGA-KNARDA", "lead", "Yes"]]

    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200, response.data
    flagged = [
        w for w in response.data["warnings"]
        if w["sheet"] == "04_agencies" and w["column"] == "code"
    ]
    assert flagged, messages(response.data["warnings"])
    assert "knarda" in flagged[0]["message"]
    # A warning, never a merge: the reference tables are governed outside
    # this import and rows pointing at them would have to be repointed.
    assert response.data["errors"] == []


@pytest.mark.django_db
def test_a_short_shared_code_segment_is_not_a_near_duplicate(auth_client, rows):
    """
    `NGA-PMU` and `SLE-PMU` share `PMU` and are different bodies. Below the
    length floor nothing fires — a warning that cries wolf is a warning
    nobody reads.
    """
    from apps.reference.models import ImplementingAgency

    ImplementingAgency.objects.create(
        code="SLE-PMU", name="SL-RVCP PMU", agency_type="national_agency"
    )
    rows["04_agencies"] = [["NGA-PMU", "KSADP PMU", "government"]]
    rows["05_project_partners"] = [["NGA-PMU", "lead", "Yes"]]

    response = post(auth_client, build_workbook(rows))
    assert response.status_code == 200, response.data
    assert not [
        w for w in response.data["warnings"]
        if w["sheet"] == "04_agencies" and w["column"] == "code"
    ], messages(response.data["warnings"])


@pytest.mark.django_db
def test_existing_donor_is_matched_case_insensitively(auth_client, rows):
    """
    The database holds `isdb`, the workbooks write `ISDB`. A literal match
    would duplicate a reference row that already exists.
    """
    from apps.reference.models import Donor

    Donor.objects.create(code="testdonor", name="Donor already in the reference table")
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
    D-4: nothing is stored between the two calls, so the hash echo is what
    stops someone validating file A and confirming file B.
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
    """Design §11: the signature is checked on the content, not on the claim."""
    fake = io.BytesIO(b"This is not a workbook.")
    fake.name = "fake.xlsx"
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
    assert "Sheets missing" in messages(response.data["errors"])


@pytest.mark.django_db
def test_the_endpoint_requires_authentication(rows):
    response = APIClient().post(
        ENDPOINT, {"file": build_workbook(rows), "mode": "validate"}, format="multipart"
    )
    assert response.status_code in (401, 403)
