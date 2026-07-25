from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0008_project_next_reporting_due_and_more"),
        ("reference", "0006_country_is_active_donor_is_active_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectImplementingPartner",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(
                    choices=[
                        ("lead",        "Lead Implementing Agency"),
                        ("co_executor", "Co-executing Agency"),
                        ("subcontract", "Subcontractor / Service provider"),
                    ],
                    default="lead",
                    max_length=20,
                    help_text="Rôle de l'agence dans le projet.",
                )),
                ("allocated_amount_usd", models.DecimalField(
                    blank=True,
                    decimal_places=2,
                    help_text="Montant délégué en USD (indicatif — budget détaillé au Module 9).",
                    max_digits=16,
                    null=True,
                )),
                ("notes", models.TextField(
                    blank=True,
                    help_text="Remarques libres (périmètre d'intervention, composantes couvertes…).",
                )),
                ("order", models.PositiveSmallIntegerField(
                    default=0,
                    help_text="Ordre d'affichage.",
                )),
                ("project", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="implementing_partners",
                    to="project.project",
                )),
                ("agency", models.ForeignKey(
                    help_text="Agence d'exécution issue du référentiel.",
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="project_assignments",
                    to="reference.implementingagency",
                )),
            ],
            options={
                "db_table": "project_implementing_partner",
                "ordering": ["order", "pk"],
            },
        ),
        migrations.AddConstraint(
            model_name="projectimplementingpartner",
            constraint=models.UniqueConstraint(
                condition=models.Q(role="lead"),
                fields=["project"],
                name="unique_lead_partner_per_project",
            ),
        ),
    ]
