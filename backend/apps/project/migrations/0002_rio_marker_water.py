"""Ajout rio_marker_water — 5ème marqueur Rio OCDE-DAC."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="rio_marker_water",
            field=models.CharField(
                choices=[
                    ("not_targeted", "Not targeted"),
                    ("significant",  "Significant"),
                    ("principal",    "Principal"),
                ],
                default="not_targeted",
                max_length=20,
                help_text="OECD-DAC Rio Marker — Water.",
            ),
        ),
    ]
