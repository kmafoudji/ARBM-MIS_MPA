from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0010_alter_componentallocation_component_and_more"),
        ("reference", "0007_gadmarea_gadm_uid_gadmarea_name_alt_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectGadmScope",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_primary", models.BooleanField(
                    default=False,
                    help_text="Zone principale d'intervention.",
                )),
                ("notes", models.TextField(blank=True)),
                ("project", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="gadm_scope",
                    to="project.project",
                )),
                ("area", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="project_scopes",
                    to="reference.gadmarea",
                )),
            ],
            options={
                "db_table": "project_gadm_scope",
                "ordering": ["-is_primary", "area__level", "area__name"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="projectgadmscope",
            unique_together={("project", "area")},
        ),
    ]
