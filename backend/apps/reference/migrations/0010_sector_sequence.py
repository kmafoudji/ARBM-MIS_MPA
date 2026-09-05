import re

from django.db import migrations, models

PREFIX = re.compile(r"^\s*(\d+)\s+(.*)$")


def split_number_from_name(apps, schema_editor):
    """'031 Agriculture & Food Security' -> sequence=31, name='Agriculture & Food Security'.

    Names without a leading number are left alone (sequence stays 0). No-op on
    an empty table, so the migration applies from scratch (ADR 0005).
    """
    Sector = apps.get_model("reference", "Sector")
    for sector in Sector.objects.all():
        match = PREFIX.match(sector.name)
        if match:
            sector.sequence = int(match.group(1))
            sector.name = match.group(2).strip()
            sector.save(update_fields=["sequence", "name"])


def put_number_back(apps, schema_editor):
    Sector = apps.get_model("reference", "Sector")
    for sector in Sector.objects.exclude(sequence=0):
        sector.name = f"{sector.sequence:03d} {sector.name}"
        sector.save(update_fields=["name"])


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0009_unique_regional_hub_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="sector",
            name="sequence",
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text="LLF2 numbering (010, 011, ..., 032). Drives the display order; the number itself is not shown in the name.",
            ),
        ),
        migrations.AlterModelOptions(
            name="sector",
            options={"ordering": ["sequence", "name"]},
        ),
        migrations.RunPython(split_number_from_name, put_number_back),
    ]
