from django.db import migrations, models
import django.db.models.deletion

OLD = "Productivity Enabled Infrastructure"
NEW = "Productivity Enabling Infrastructure"


def rename_infra_pillar(apps, schema_editor):
    """Align the INFRA pillar with the LLF2 wording. No-op on an empty table (ADR 0005)."""
    Sector = apps.get_model("reference", "Sector")
    Sector.objects.filter(code="INFRA", name=OLD).update(name=NEW)


def rename_back(apps, schema_editor):
    Sector = apps.get_model("reference", "Sector")
    Sector.objects.filter(code="INFRA", name=NEW).update(name=OLD)


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0010_sector_sequence"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sector",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="children",
                to="reference.sector",
            ),
        ),
        migrations.RunPython(rename_infra_pillar, rename_back),
    ]
