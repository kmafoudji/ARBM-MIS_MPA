# Classification rework (SF-2), 5 September 2026: the OECD gender marker becomes
# the WE category, risk rating and the new climate marker get a single
# "to be defined" value, and the fields the fund does not track are dropped
# (Rio markers, implementation modality, geographic typology, fragility
# status, cross-cutting themes).

from django.db import migrations, models


def clear_remapped_values(apps, schema_editor):
    """Old gender-marker and risk-rating values have no counterpart in the
    new vocabularies: null them rather than keep invalid choices."""
    Project = apps.get_model("project", "Project")
    Project.objects.exclude(gender_marker__isnull=True).update(gender_marker=None)
    Project.objects.exclude(risk_rating__isnull=True).update(risk_rating=None)


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0022_project_reporting_frequency_monthly"),
    ]

    operations = [
        migrations.RunPython(clear_remapped_values, migrations.RunPython.noop),
        migrations.RenameField(
            model_name="project", old_name="gender_marker", new_name="we_category",
        ),
        migrations.AlterField(
            model_name="project",
            name="we_category",
            field=models.CharField(
                blank=True,
                choices=[
                    ("WE001", "WE001 — EWE"),
                    ("WE002", "WE002 — RWE"),
                    ("WE003", "WE003 — SWE"),
                    ("WE004", "WE004 — WEB"),
                    ("WE005", "WE005 — NWE"),
                ],
                help_text="Categorie d'autonomisation economique des femmes (WE).",
                max_length=5,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="project",
            name="risk_rating",
            field=models.CharField(
                blank=True,
                choices=[("tbd", "To be defined")],
                help_text="Revu annuellement (RG-4.2). Valeurs a definir.",
                max_length=15,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="climate_marker",
            field=models.CharField(
                blank=True,
                choices=[("tbd", "To be defined")],
                help_text="Marqueur climat. Valeurs a definir.",
                max_length=10,
                null=True,
            ),
        ),
        migrations.RemoveField(model_name="project", name="rio_marker_mitigation"),
        migrations.RemoveField(model_name="project", name="rio_marker_adaptation"),
        migrations.RemoveField(model_name="project", name="rio_marker_biodiversity"),
        migrations.RemoveField(model_name="project", name="rio_marker_desertification"),
        migrations.RemoveField(model_name="project", name="rio_marker_water"),
        migrations.RemoveField(model_name="project", name="cross_cutting_themes"),
        migrations.RemoveField(model_name="project", name="implementation_modality"),
        migrations.RemoveField(model_name="project", name="geographic_typology"),
        migrations.RemoveField(model_name="project", name="fragility_status"),
    ]
