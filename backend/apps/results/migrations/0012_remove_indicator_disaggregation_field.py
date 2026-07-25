"""
Migration SF-6 — Suppression du champ texte libre `disaggregation` sur Indicator.
Remplacé par le modèle structuré IndicatorDisaggregation.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0011_alter_disaggregationvalue_id_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="indicator",
            name="disaggregation",
        ),
    ]
