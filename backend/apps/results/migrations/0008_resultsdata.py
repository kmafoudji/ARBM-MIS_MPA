import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("results",  "0007_fix_toc_status_maxlength"),
        ("project",  "0017_projectimplementingpartner_focal_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ResultsData",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ("actual_value", models.DecimalField(
                    decimal_places=4, max_digits=18,
                    help_text="Valeur réelle observée pour cette période.",
                )),
                ("narrative", models.TextField(
                    blank=True,
                    help_text="Commentaire qualitatif sur la valeur.",
                )),
                ("rag_status", models.CharField(
                    choices=[
                        ("green", "On track (≥ 90%)"),
                        ("amber", "At risk (60–89%)"),
                        ("red",   "Off track (< 60%)"),
                        ("na",    "N/A — no target for this period"),
                    ],
                    default="na", max_length=6,
                )),
                ("achievement_rate", models.DecimalField(
                    decimal_places=2, max_digits=7, null=True, blank=True,
                    help_text="Taux d'atteinte en %.",
                )),
                ("status", models.CharField(
                    choices=[("draft", "Draft"), ("approved", "Approved")],
                    default="draft", max_length=10,
                )),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("logframe_row", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="results_data",
                    to="results.logframerow",
                )),
                ("reporting_period", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="results_data",
                    to="project.reportingperiod",
                )),
                ("submitted_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="results_submitted",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("approved_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="results_approved",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "results_data", "ordering": ["reporting_period__period_number", "logframe_row__order"]},
        ),
        migrations.AddConstraint(
            model_name="resultsdata",
            constraint=models.UniqueConstraint(
                fields=["logframe_row", "reporting_period"],
                name="unique_results_per_row_period",
            ),
        ),
    ]
