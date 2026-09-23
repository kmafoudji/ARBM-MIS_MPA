from django.db import migrations, models

# ADR 0014: LLF projects classify into the Fund's own three sectors. Until now
# every project used the IsDB taxonomy; the two sectors LLF projects actually
# use map one-to-one onto LLF sectors.
IsDB_TO_LLF = {"HEALTH": "LLF_HEALTH", "AGRICU": "LLF_AGRI"}
LLF_TO_ISDB = {llf: isdb for isdb, llf in IsDB_TO_LLF.items()}


def _move(apps, mapping, projects):
    Sector = apps.get_model("reference", "Sector")
    ProjectSector = apps.get_model("project", "ProjectSector")
    by_code = {s.code: s for s in Sector.objects.filter(code__in=[*mapping, *mapping.values()])}
    unmapped = set()
    for project in projects:
        if project.primary_sector_id:
            code = project.primary_sector.code
            if code in mapping:
                project.primary_sector = by_code[mapping[code]]
                project.save(update_fields=["primary_sector"])
            else:
                unmapped.add(f"{project.official_reference_number}: {code}")
        for link in ProjectSector.objects.filter(project=project).select_related("sector"):
            code = link.sector.code
            if code in mapping:
                link.sector = by_code[mapping[code]]
                link.save(update_fields=["sector"])
            else:
                unmapped.add(f"{project.official_reference_number}: {code}")
    if unmapped:
        raise RuntimeError(
            "Sectors with no counterpart in the other taxonomy; reclassify by hand "
            "first: " + ", ".join(sorted(unmapped))
        )


def llf_projects_to_llf_sectors(apps, schema_editor):
    """No-op when there are no projects (ADR 0005)."""
    Project = apps.get_model("project", "Project")
    projects = Project.objects.exclude(investment_cycle="IsDB").select_related("primary_sector")
    if projects.exists():
        _move(apps, IsDB_TO_LLF, projects)


def llf_projects_back_to_isdb_sectors(apps, schema_editor):
    Project = apps.get_model("project", "Project")
    projects = Project.objects.exclude(investment_cycle="IsDB").select_related("primary_sector")
    if projects.exists():
        _move(apps, LLF_TO_ISDB, projects)


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0026_lifecycle_stages_ls_codes"),
        ("reference", "0013_sector_taxonomy"),
    ]

    operations = [
        migrations.AlterField(
            model_name="project",
            name="investment_cycle",
            field=models.CharField(
                blank=True,
                choices=[("LLF1", "LLF1"), ("LLF2", "LLF2"), ("IsDB", "IsDB")],
                help_text="Project type: LLF1, LLF2 or IsDB. Set at creation and never changed; it selects the sector taxonomy (ADR 0014).",
                max_length=10,
                null=True,
            ),
        ),
        migrations.RunPython(llf_projects_to_llf_sectors, llf_projects_back_to_isdb_sectors),
    ]
