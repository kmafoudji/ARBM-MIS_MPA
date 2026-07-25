"""
Tests SF-5 — Génération des périodes de reporting.
"""
import pytest
from datetime import date
from apps.project.services import generate_reporting_periods
from apps.project.models import ReportingPeriod
from tests.factories import ProjectFactory


@pytest.mark.django_db
class TestGenerateReportingPeriods:

    def test_requires_reporting_frequency(self):
        project = ProjectFactory(
            reporting_frequency=None,
            next_reporting_due=date(2026, 4, 1),
            end_date=date(2028, 12, 31),
        )
        count, error = generate_reporting_periods(project)
        assert count == 0
        assert error is not None
        assert "frequency" in error.lower()

    def test_requires_next_reporting_due(self):
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=None,
            end_date=date(2028, 12, 31),
        )
        count, error = generate_reporting_periods(project)
        assert count == 0
        assert error is not None

    def test_requires_end_date(self):
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
            end_date=None,
        )
        count, error = generate_reporting_periods(project)
        assert count == 0
        assert "end date" in error.lower()

    def test_quarterly_generates_correct_count(self):
        """Projet ~2 ans → vérifier count cohérent avec la logique."""
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
            end_date=date(2028, 3, 31),
        )
        count, error = generate_reporting_periods(project)
        assert error is None
        assert count > 0
        # Vérifier que toutes les périodes sont dans la fenêtre projet
        periods = ReportingPeriod.objects.filter(project=project).order_by("period_number")
        assert periods.last().end_date <= date(2028, 3, 31)
        assert periods.first().end_date == date(2026, 4, 1)

    def test_annual_generates_correct_count(self):
        """Projet 3 ans → 3 périodes annuelles."""
        project = ProjectFactory(
            reporting_frequency="annual",
            next_reporting_due=date(2026, 12, 31),
            end_date=date(2028, 12, 31),
        )
        count, error = generate_reporting_periods(project)
        assert error is None
        assert count == 3

    def test_first_period_ends_at_first_deadline(self):
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
            end_date=date(2027, 12, 31),
        )
        generate_reporting_periods(project)
        p1 = ReportingPeriod.objects.get(project=project, period_number=1)
        assert p1.end_date == date(2026, 4, 1)

    def test_quarterly_labels(self):
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
            end_date=date(2026, 12, 31),
        )
        generate_reporting_periods(project)
        labels = list(
            ReportingPeriod.objects.filter(project=project)
            .order_by("period_number")
            .values_list("label", flat=True)
        )
        assert "Q1 2026" in labels[0]

    def test_idempotent(self):
        """Appeler deux fois ne crée pas de doublons."""
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
            end_date=date(2026, 12, 31),
        )
        count1, _ = generate_reporting_periods(project)
        count2, _ = generate_reporting_periods(project)
        assert count2 == 0  # Rien de nouveau — idempotent
        assert ReportingPeriod.objects.filter(project=project).count() == count1

    def test_due_date_is_after_end_date(self):
        """La due_date doit être après la fin de période (délai de grâce)."""
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
            end_date=date(2026, 6, 30),
        )
        generate_reporting_periods(project)
        for p in ReportingPeriod.objects.filter(project=project):
            assert p.due_date > p.end_date

    def test_last_period_bounded_by_end_date(self):
        """La dernière période ne dépasse pas end_date."""
        project = ProjectFactory(
            reporting_frequency="quarterly",
            next_reporting_due=date(2026, 4, 1),
            end_date=date(2026, 10, 15),  # Fin en milieu de trimestre
        )
        generate_reporting_periods(project)
        last = ReportingPeriod.objects.filter(project=project).order_by("period_number").last()
        assert last.end_date <= date(2026, 10, 15)
