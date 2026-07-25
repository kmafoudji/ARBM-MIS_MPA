from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0011_projectgadmscope"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReportingPeriod",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("period_number", models.PositiveSmallIntegerField(help_text="Numéro séquentiel de la période.")),
                ("start_date",    models.DateField()),
                ("end_date",      models.DateField()),
                ("due_date",      models.DateField(help_text="Date limite de soumission.")),
                ("status", models.CharField(
                    choices=[
                        ("upcoming",  "Upcoming"),
                        ("open",      "Open"),
                        ("submitted", "Submitted"),
                        ("approved",  "Approved"),
                        ("overdue",   "Overdue"),
                    ],
                    default="upcoming", max_length=15,
                )),
                ("label",        models.CharField(blank=True, max_length=50)),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                ("approved_at",  models.DateTimeField(blank=True, null=True)),
                ("project", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="reporting_periods",
                    to="project.project",
                )),
            ],
            options={"db_table": "reporting_period", "ordering": ["period_number"]},
        ),
        migrations.AlterUniqueTogether(
            name="reportingperiod",
            unique_together={("project", "period_number")},
        ),
    ]
