"""
SF-10 + Workflow — Evidence model + champs workflow sur ResultsData.
submitted_at, reviewed_by, reviewed_at, review_notes + statuts étendus.
"""
from django.db import migrations, models
import django.db.models.deletion
import apps.results.models


class Migration(migrations.Migration):

    dependencies = [
        ("identity", "0001_initial"),
        ("results", "0013_sf9_dq_score"),
    ]

    operations = [
        # 1. Étendre les choix de statut (aucune migration DDL requise — CharField)
        migrations.AlterField(
            model_name="resultsdata",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft",     "Draft"),
                    ("submitted", "Submitted"),
                    ("reviewed",  "Reviewed"),
                    ("approved",  "Approved"),
                    ("rejected",  "Rejected"),
                ],
                default="draft",
                max_length=10,
            ),
        ),
        # 2. Champs workflow sur ResultsData
        migrations.AddField(
            model_name="resultsdata",
            name="submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="resultsdata",
            name="reviewed_by",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="results_reviewed",
                to="identity.appuser",
            ),
        ),
        migrations.AddField(
            model_name="resultsdata",
            name="reviewed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="resultsdata",
            name="review_notes",
            field=models.TextField(
                blank=True,
                help_text="Notes du relecteur (approbation ou rejet).",
            ),
        ),
        # 3. Modèle Evidence
        migrations.CreateModel(
            name="Evidence",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("evidence_type", models.CharField(
                    choices=[
                        ("photo", "Photo / Image"),
                        ("pdf",   "PDF Document"),
                        ("survey","Survey / Questionnaire"),
                        ("report","Report / Assessment"),
                        ("video", "Video"),
                        ("other", "Other"),
                    ],
                    default="pdf", max_length=20,
                )),
                ("title",        models.CharField(max_length=200)),
                ("description",  models.TextField(blank=True)),
                ("file",         models.FileField(
                    blank=True, null=True,
                    upload_to=apps.results.models.evidence_upload_path,
                    help_text="PDF max 25 MB, images max 10 MB.",
                )),
                ("external_url", models.URLField(blank=True, help_text="Lien externe.")),
                ("status",       models.CharField(
                    choices=[
                        ("pending",  "Pending review"),
                        ("verified", "Verified"),
                        ("rejected", "Rejected"),
                    ],
                    default="pending", max_length=10,
                )),
                ("notes",        models.TextField(blank=True)),
                ("uploaded_at",  models.DateTimeField(auto_now_add=True)),
                ("is_active",    models.BooleanField(default=True)),
                ("results_data", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="evidences",
                    to="results.resultsdata",
                )),
                ("verified_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="evidences_verified",
                    to="identity.appuser",
                )),
                ("uploaded_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="evidences_uploaded",
                    to="identity.appuser",
                )),
                ("verified_at",  models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "verbose_name": "Evidence",
                "db_table": "evidence",
                "ordering": ["-uploaded_at"],
            },
        ),
    ]
