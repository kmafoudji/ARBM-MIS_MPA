"""
Migration SF-6 : enveloppe financiere (financement mixte LLF2).
Generee manuellement — makemigrations retournait 'No changes detected'
malgre la presence des modeles dans models.py, probablement du a un
probleme de cache Django dans l'environnement de developpement.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0005_alter_projectsdg_sdg_alter_projectsector_sector"),
        ("reference", "0006_country_is_active_donor_is_active_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectFinancialEnvelope",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("notes", models.TextField(blank=True, help_text="Remarques libres sur la structure de financement.")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("project", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="financial_envelope",
                    to="project.project",
                )),
                ("updated_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="envelopes_updated",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "project_financial_envelope"},
        ),
        migrations.CreateModel(
            name="FinancingSource",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("source", models.CharField(
                    choices=[
                        ("isdb_oc", "IsDB Ordinary Capital"),
                        ("llf", "LLF (fonds fiduciaire multi-donateurs)"),
                        ("government", "Gouvernement / contrepartie nationale"),
                        ("co_financing", "Co-financement"),
                    ],
                    max_length=20,
                )),
                ("instrument", models.CharField(
                    choices=[
                        ("loan", "Pret"),
                        ("grant", "Don"),
                        ("counterpart", "Contrepartie"),
                        ("co_financing", "Co-financement"),
                    ],
                    max_length=20,
                )),
                ("amount", models.DecimalField(decimal_places=2, max_digits=16)),
                ("amount_usd", models.DecimalField(decimal_places=2, max_digits=16)),
                ("exchange_rate_date", models.DateField(blank=True, null=True)),
                ("label", models.CharField(blank=True, max_length=200)),
                ("order", models.PositiveSmallIntegerField(default=0)),
                ("currency", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    to="reference.currency",
                )),
                ("donor", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="financing_contributions",
                    to="reference.donor",
                )),
                ("envelope", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="financing_sources",
                    to="project.projectfinancialenvelope",
                )),
            ],
            options={
                "db_table": "financing_source",
                "ordering": ["order", "pk"],
            },
        ),
        migrations.CreateModel(
            name="ComponentAllocation",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ("component", models.CharField(
                    choices=[
                        ("works", "Travaux"),
                        ("consulting", "Conseil"),
                        ("goods", "Biens"),
                        ("training", "Formation"),
                        ("operating", "Fonctionnement"),
                    ],
                    max_length=20,
                )),
                ("amount_usd", models.DecimalField(decimal_places=2, max_digits=16)),
                ("envelope", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="component_allocations",
                    to="project.projectfinancialenvelope",
                )),
            ],
            options={
                "db_table": "component_allocation",
                "ordering": ["component"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="componentallocation",
            unique_together={("envelope", "component")},
        ),
    ]
