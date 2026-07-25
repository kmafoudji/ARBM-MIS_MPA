"""SF-9 — DQScoreSnapshot : score qualité données par indicateur/période."""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0001_initial"),
        ("results", "0012_remove_indicator_disaggregation_field"),
    ]

    operations = [
        migrations.CreateModel(
            name="DQScoreSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("completeness_score",  models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("timeliness_score",    models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("consistency_score",   models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("accuracy_score",      models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("composite_score",     models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ("computed_at",         models.DateTimeField(auto_now=True)),
                ("notes",               models.TextField(blank=True)),
                ("logframe_row", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="dq_snapshots",
                    to="results.logframerow",
                )),
                ("reporting_period", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="dq_snapshots",
                    to="project.reportingperiod",
                    help_text="Null = score global (toutes périodes).",
                )),
            ],
            options={
                "verbose_name": "DQ Score Snapshot",
                "db_table": "dq_score_snapshot",
                "ordering": ["-computed_at"],
                "unique_together": {("logframe_row", "reporting_period")},
            },
        ),
    ]
