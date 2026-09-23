import django.db.models.deletion
from django.db import migrations, models

# ADR 0014. Indicator.sector stays the IsDB sector; llf_sector is new. The
# indicators in the catalogue today are all in the two IsDB sectors that map
# one to one onto LLF sectors, so they get that LLF sector once, here.
# Indicators created later get their LLF sector by hand.
ISDB_TO_LLF = {"HEALTH": "LLF_HEALTH", "AGRICU": "LLF_AGRI"}


def fill_llf_sector(apps, schema_editor):
    """No-op when there are no indicators or no LLF sectors (ADR 0005)."""
    Indicator = apps.get_model("results", "Indicator")
    Sector = apps.get_model("reference", "Sector")
    llf = {s.code: s for s in Sector.objects.filter(code__in=ISDB_TO_LLF.values())}
    for isdb_code, llf_code in ISDB_TO_LLF.items():
        if llf_code in llf:
            Indicator.objects.filter(sector__code=isdb_code, llf_sector__isnull=True).update(
                llf_sector=llf[llf_code]
            )


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0015_indicator_project_specific"),
        ("reference", "0013_sector_taxonomy"),
    ]

    operations = [
        migrations.AlterField(
            model_name="indicator",
            name="sector",
            field=models.ForeignKey(
                help_text="IsDB sector (ADR 0014). Required.",
                limit_choices_to={"taxonomy": "isdb"},
                on_delete=django.db.models.deletion.PROTECT,
                related_name="indicators",
                to="reference.sector",
            ),
        ),
        migrations.AddField(
            model_name="indicator",
            name="llf_sector",
            field=models.ForeignKey(
                blank=True,
                help_text="LLF sector, for the indicators the Fund uses (ADR 0014).",
                limit_choices_to={"taxonomy": "llf"},
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="llf_indicators",
                to="reference.sector",
            ),
        ),
        migrations.RunPython(fill_llf_sector, migrations.RunPython.noop),
    ]
