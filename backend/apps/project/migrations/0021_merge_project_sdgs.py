import django.db.models.deletion
from django.db import migrations, models


def copy_primary_sdg_into_set(apps, schema_editor):
    """Fold every non-null primary_sdg into project_sdg (ADR 0006).

    No-op on an empty database, so the migration still applies from scratch
    (ADR 0005). Pairs already present are left alone.
    """
    Project = apps.get_model("project", "Project")
    ProjectSdg = apps.get_model("project", "ProjectSdg")
    existing = set(ProjectSdg.objects.values_list("project_id", "sdg_id"))
    rows = [
        ProjectSdg(project_id=project_id, sdg_id=sdg_id)
        for project_id, sdg_id in Project.objects.filter(primary_sdg__isnull=False)
        .values_list("id", "primary_sdg_id")
        if (project_id, sdg_id) not in existing
    ]
    ProjectSdg.objects.bulk_create(rows)


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0020_project_investment_cycle"),
    ]

    operations = [
        migrations.RenameField(
            model_name="project",
            old_name="contributing_sdgs",
            new_name="sdgs",
        ),
        migrations.RunPython(copy_primary_sdg_into_set, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="project",
            name="primary_sdg",
        ),
        migrations.AlterField(
            model_name="project",
            name="sdgs",
            field=models.ManyToManyField(
                blank=True,
                help_text="ODD du projet, sans distinction primaire/contributif (au moins 1 exige a BED Approved, POL-1.10 ; cf. ADR 0006).",
                related_name="projects",
                through="project.ProjectSdg",
                to="reference.sdg",
            ),
        ),
        migrations.AlterField(
            model_name="projectsdg",
            name="sdg",
            field=models.ForeignKey(
                help_text="PROTECT et non CASCADE : supprimer un ODD effacerait silencieusement la classification des projets qui le portent. Cf. POL-1.07 (pas de suppression definitive).",
                on_delete=django.db.models.deletion.PROTECT,
                to="reference.sdg",
            ),
        ),
    ]
