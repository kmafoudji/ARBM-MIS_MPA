from django.db import migrations, models

# The Fund's own three sectors (ADR 0014), from the LLF sector mapping slide of
# September 2026. Colours are the --sec-health / --sec-agri / --sec-infra
# design tokens. (code, sequence, name, icon, color)
LLF_SECTORS = [
    ("LLF_HEALTH", 1, "Health", "health", "#FB563B"),
    ("LLF_AGRI", 2, "Agriculture & Food Security", "agriculture", "#0EB584"),
    ("LLF_SOCINF", 3, "Social Infrastructure", "infrastructure", "#F49D07"),
]


def create_llf_sectors(apps, schema_editor):
    """Every existing row is IsDB (the field default); add the three LLF sectors.

    No-op on an empty table (ADR 0005): a fresh environment gets them from
    seed_reference_data, like the IsDB ones.
    """
    Sector = apps.get_model("reference", "Sector")
    if not Sector.objects.exists():
        return
    for code, sequence, name, icon, color in LLF_SECTORS:
        Sector.objects.get_or_create(
            code=code,
            defaults={
                "name": name, "sequence": sequence, "icon": icon,
                "color": color, "taxonomy": "llf",
            },
        )


def delete_llf_sectors(apps, schema_editor):
    Sector = apps.get_model("reference", "Sector")
    Sector.objects.filter(taxonomy="llf").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0012_natural_earth"),
    ]

    operations = [
        migrations.AddField(
            model_name="sector",
            name="taxonomy",
            field=models.CharField(
                choices=[("llf", "LLF"), ("isdb", "IsDB")],
                default="isdb",
                help_text="LLF (three flat sectors) or IsDB (pillars and sectors). A project only takes sectors of its own taxonomy (ADR 0014).",
                max_length=10,
            ),
        ),
        migrations.RunPython(create_llf_sectors, delete_llf_sectors),
    ]
