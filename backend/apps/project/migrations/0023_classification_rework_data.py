# Classification rework (SF-2), step 1 of 2 — data. Old gender-marker and
# risk-rating values have no counterpart in the new vocabularies (WE
# categories, "to be defined"): null them. Kept apart from the schema
# changes in 0024 because PostgreSQL refuses ALTER TABLE in a transaction
# that already updated the table (pending trigger events).

from django.db import migrations


def clear_remapped_values(apps, schema_editor):
    Project = apps.get_model("project", "Project")
    Project.objects.exclude(gender_marker__isnull=True).update(gender_marker=None)
    Project.objects.exclude(risk_rating__isnull=True).update(risk_rating=None)


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0022_project_reporting_frequency_monthly"),
    ]

    operations = [
        migrations.RunPython(clear_remapped_values, migrations.RunPython.noop),
    ]
