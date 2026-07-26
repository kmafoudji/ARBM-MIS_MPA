"""
Migration M2 SF-1/SF-2/SF-3 — générée manuellement.

SF-1 Indicator :
  - aggregation_rule    (CharField, default='sum')
  - chain_level         (CharField, blank=True)
  - cross_cutting_tags  (JSONField, default=list)
  - version             (PositiveIntegerField, default=1)
  - indicator_type      : choices étendus (numeric/percentage/yes_no/count)
  - reporting_frequency : ajout 'monthly'

SF-2 TheoryOfChange :
  - local_actors (TextField, blank=True)

SF-2 ToCNode :
  - chain_level : ajout 'ultimate_outcome'
  - cross_pathways (ManyToManyField vers self)

SF-3 LogframeTarget :
  - status         (CharField, default='draft')
  - is_original_pad (BooleanField, default=False)
  - approved_by    (FK AppUser, null=True)
  - approved_at    (DateTimeField, null=True)

SF-3 TargetRevision (nouveau modèle)
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ("results", "0004_alter_theoryofchange_status"),
        ("results", "0005_indicator_aggregation_rule_indicator_chain_level_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [

        # ── SF-1 : Indicator ────────────────────────────────────────────

        migrations.AddField(
            model_name="indicator",
            name="version",
            field=models.PositiveIntegerField(
                default=1,
                help_text="Numéro de version. Auto-incrémenté à chaque modification validée (RG-1.1).",
            ),
        ),
        migrations.AlterField(
            model_name="indicator",
            name="indicator_type",
            field=models.CharField(
                choices=[
                    ("numeric", "Numeric"), ("percentage", "Percentage"),
                    ("yes_no", "Yes / No"), ("count", "Count"),
                ],
                default="numeric", max_length=15,
            ),
        ),
        migrations.AlterField(
            model_name="indicator",
            name="reporting_frequency",
            field=models.CharField(
                blank=True, max_length=15,
                choices=[
                    ("monthly", "Monthly"), ("quarterly", "Quarterly"),
                    ("semi_annual", "Semi-annual"), ("annual", "Annual"),
                    ("end_of_project", "End of project"),
                ],
            ),
        ),

        # ── SF-2 : TheoryOfChange ────────────────────────────────────────

        migrations.AddField(
            model_name="theoryofchange",
            name="local_actors",
            field=models.TextField(
                blank=True,
                help_text="Acteurs locaux ayant participé à l'élaboration de la ToC (BRQ-2.06b).",
            ),
        ),

        # ── SF-2 : ToCNode — nouveau niveau + cross_pathways ─────────────

        migrations.AlterField(
            model_name="tocnode",
            name="chain_level",
            field=models.CharField(
                max_length=25,
                choices=[
                    ("activity", "Activity"), ("output", "Output"),
                    ("immediate_outcome", "Immediate outcome"),
                    ("intermediate_outcome", "Intermediate outcome"),
                    ("ultimate_outcome", "Ultimate outcome"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="tocnode",
            name="cross_pathways",
            field=models.ManyToManyField(
                blank=True,
                related_name="incoming_pathways",
                to="results.tocnode",
                help_text="Liaisons non linéaires vers d'autres nœuds de la chaîne (RG-2.6).",
            ),
        ),

        # ── SF-3 : LogframeTarget — statut + PAD + approbation ───────────

        migrations.AddField(
            model_name="logframetarget",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"), ("approved", "Approved"), ("revised", "Revised"),
                ],
                default="draft", max_length=10,
                help_text="Statut de la cible.",
            ),
        ),
        migrations.AddField(
            model_name="logframetarget",
            name="is_original_pad",
            field=models.BooleanField(
                default=False,
                help_text="True = cible issue du PAD. Jamais écrasée, toujours consultable (RG-3.4).",
            ),
        ),
        migrations.AddField(
            model_name="logframetarget",
            name="approved_by",
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="targets_approved",
                to=settings.AUTH_USER_MODEL,
                help_text="Approbateur LLFMU/IsDB (RG-3.5).",
            ),
        ),
        migrations.AddField(
            model_name="logframetarget",
            name="approved_at",
            field=models.DateTimeField(null=True, blank=True),
        ),

        # ── SF-3 : TargetRevision — nouveau modèle ───────────────────────

        migrations.CreateModel(
            name="TargetRevision",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("previous_value", models.DecimalField(
                    decimal_places=4, max_digits=18,
                    help_text="Valeur de la cible avant révision.",
                )),
                ("previous_date", models.DateField(
                    help_text="Date cible avant révision.",
                )),
                ("justification", models.TextField(
                    help_text="Justification narrative obligatoire (RG-3.3).",
                )),
                ("revision_status", models.CharField(
                    choices=[
                        ("pending", "Pending approval"),
                        ("approved", "Approved"),
                        ("rejected", "Rejected"),
                    ],
                    default="pending", max_length=15,
                )),
                ("revision_comment", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("target", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="revisions",
                    to="results.logframetarget",
                )),
                ("revised_by", models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="target_revisions_initiated",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("approved_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="target_revisions_approved",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "target_revision", "ordering": ["-created_at"]},
        ),

        # ── LogframeRow + ToCNode chain_level : ajout ultimate_outcome ────

        migrations.AlterField(
            model_name="logframerow",
            name="chain_level",
            field=models.CharField(
                max_length=25,
                choices=[
                    ("activity", "Activity"), ("output", "Output"),
                    ("immediate_outcome", "Immediate outcome"),
                    ("intermediate_outcome", "Intermediate outcome"),
                    ("ultimate_outcome", "Ultimate outcome"),
                    ("impact", "Impact"),
                ],
            ),
        ),
    ]
