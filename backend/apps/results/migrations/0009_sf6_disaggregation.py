"""
Migration SF-6 — Désagrégation structurée.
  IndicatorDisaggregation : dimensions configurables par indicateur.
  DisaggregationValue     : valeurs saisies par catégorie/dimension/ResultsData.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0008_resultsdata"),
    ]

    operations = [
        migrations.CreateModel(
            name="IndicatorDisaggregation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True)),
                ("name",       models.CharField(max_length=100)),
                ("categories", models.JSONField(default=list)),
                ("order",      models.PositiveIntegerField(default=0)),
                ("indicator",  models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="disaggregation_dimensions",
                    to="results.indicator",
                )),
            ],
            options={
                "db_table": "indicator_disaggregation",
                "ordering": ["order", "id"],
                "unique_together": {("indicator", "name")},
            },
        ),
        migrations.CreateModel(
            name="DisaggregationValue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True)),
                ("category", models.CharField(max_length=100)),
                ("value",    models.DecimalField(decimal_places=4, max_digits=18)),
                ("dimension", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="values",
                    to="results.indicatordisaggregation",
                )),
                ("results_data", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="disaggregation_values",
                    to="results.resultsdata",
                )),
            ],
            options={
                "db_table": "disaggregation_value",
                "ordering": ["dimension__order", "category"],
                "unique_together": {("results_data", "dimension", "category")},
            },
        ),
    ]
