"""
`project_specific` indicator type, and backfill of the indicators the AS-IS
import created.

The loader never wrote `indicator_type`, so every indicator it created kept
the model default, `numeric`. That made "Numeric" mean "came from a project
workbook" by accident, and left the catalogue describing its two populations
on different axes: the seeded institutional rows carry a chain level in
`indicator_type` (`output`/`outcome`/`impact`, values outside the choice list)
while the imported ones carried `numeric`.

The backfill needs no code-prefix heuristic: on this database `numeric` is
held by exactly the 81 imported indicators, and by no institutional one.
"""
from django.db import migrations, models


def numeric_to_project_specific(apps, schema_editor):
    Indicator = apps.get_model("results", "Indicator")
    Indicator.objects.filter(indicator_type="numeric").update(
        indicator_type="project_specific"
    )


def project_specific_to_numeric(apps, schema_editor):
    # Not an exact inverse: indicators created as `project_specific` after this
    # migration also come back as `numeric`. Nothing distinguishes them once
    # the value is gone.
    Indicator = apps.get_model("results", "Indicator")
    Indicator.objects.filter(indicator_type="project_specific").update(
        indicator_type="numeric"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0014_sf10_evidence_workflow"),
    ]

    operations = [
        # `project_specific` is 16 characters: max_length has to grow with it.
        migrations.AlterField(
            model_name="indicator",
            name="indicator_type",
            field=models.CharField(
                choices=[
                    ("numeric",     "Numeric"),
                    ("percentage",  "Percentage"),
                    ("yes_no",      "Yes / No"),
                    ("count",       "Count"),
                    ("project_specific", "Project-specific"),
                ],
                default="project_specific",
                max_length=20,
            ),
        ),
        migrations.RunPython(
            numeric_to_project_specific, project_specific_to_numeric
        ),
    ]
