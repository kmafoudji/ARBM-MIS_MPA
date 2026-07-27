import django.core.validators
import django.db.models.deletion
import django.db.models.expressions
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("project", "0018_merge_rio_water"),
        ("results", "0014_sf10_evidence_workflow"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── WorkplanComponent ────────────────────────────────────────────
        migrations.CreateModel(
            name="WorkplanComponent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=20)),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True, help_text="POL-1.07 : soft-delete.")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workplan_components", to="project.project")),
            ],
            options={"db_table": "workplan_component", "ordering": ["project", "order", "code"]},
        ),
        migrations.AddConstraint(
            model_name="workplancomponent",
            constraint=models.UniqueConstraint(fields=["project", "code"], name="unique_component_code_per_project"),
        ),
        # ── WorkplanSubComponent ─────────────────────────────────────────
        migrations.CreateModel(
            name="WorkplanSubComponent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=20)),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("component", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sub_components", to="workplan.workplancomponent")),
            ],
            options={"db_table": "workplan_sub_component", "ordering": ["component", "order", "code"]},
        ),
        migrations.AddConstraint(
            model_name="workplansubcomponent",
            constraint=models.UniqueConstraint(fields=["component", "code"], name="unique_subcomponent_code_per_component"),
        ),
        # ── Activity ─────────────────────────────────────────────────────
        migrations.CreateModel(
            name="Activity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(max_length=30)),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("responsible_party", models.CharField(blank=True, help_text="Utilisateur ou organisation responsable.", max_length=255)),
                ("planned_start", models.DateField(help_text="Date de début planifiée (baseline).")),
                ("planned_end", models.DateField(help_text="Date de fin planifiée (baseline).")),
                ("baseline_start", models.DateField(blank=True, editable=False, null=True)),
                ("baseline_end", models.DateField(blank=True, editable=False, null=True)),
                ("revised_end", models.DateField(blank=True, help_text="Date de fin révisée — motif obligatoire dans DelayLog.", null=True)),
                ("actual_end", models.DateField(blank=True, null=True)),
                ("status", models.CharField(choices=[("not_started", "Not Started"), ("in_progress", "In Progress"), ("on_hold", "On Hold"), ("completed", "Completed"), ("cancelled", "Cancelled")], default="not_started", max_length=20)),
                ("progress", models.PositiveSmallIntegerField(default=0, help_text="Pourcentage d'avancement (0–100).", validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)])),
                ("requires_evidence", models.BooleanField(default=False, help_text="Preuve obligatoire avant passage à Completed (RG-4.4).")),
                ("is_kpi_linked", models.BooleanField(default=False, help_text="Activité liée à un KPI de suivi spécifique.")),
                ("is_critical_path", models.BooleanField(default=False, help_text="Activité sur le chemin critique du projet.")),
                ("budget_planned", models.DecimalField(decimal_places=2, default=0, help_text="Budget planifié en USD.", max_digits=15)),
                ("budget_spent", models.DecimalField(decimal_places=2, default=0, help_text="Dépensé réel lu depuis le Module 9.", max_digits=15)),
                ("order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True, help_text="POL-1.07 : soft-delete.")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("sub_component", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="activities", to="workplan.workplansubcomponent")),
                ("output_node", models.ForeignKey(blank=True, help_text="Nœud Output du Module 2 auquel cette activité contribue (RG-2.1).", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="linked_activities", to="results.tocnode")),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="activities_created", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "activity", "ordering": ["sub_component", "order", "code"]},
        ),
        migrations.AddConstraint(
            model_name="activity",
            constraint=models.UniqueConstraint(fields=["sub_component", "code"], name="unique_activity_code_per_subcomponent"),
        ),
        # ── ActivityDependency ───────────────────────────────────────────
        migrations.CreateModel(
            name="ActivityDependency",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("dep_type", models.CharField(choices=[("FS", "Finish-to-Start"), ("SS", "Start-to-Start"), ("FF", "Finish-to-Finish"), ("SF", "Start-to-Finish")], default="FS", max_length=2)),
                ("lag_days", models.IntegerField(default=0, help_text="Décalage en jours.")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("predecessor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="successor_deps", to="workplan.activity")),
                ("successor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="predecessor_deps", to="workplan.activity")),
            ],
            options={"db_table": "activity_dependency"},
        ),
        migrations.AddConstraint(
            model_name="activitydependency",
            constraint=models.UniqueConstraint(fields=["predecessor", "successor"], name="unique_dependency_pair"),
        ),
        migrations.AddConstraint(
            model_name="activitydependency",
            constraint=models.CheckConstraint(
                check=~models.Q(predecessor=django.db.models.expressions.F("successor")),
                name="no_self_dependency",
            ),
        ),
        # ── Milestone ────────────────────────────────────────────────────
        migrations.CreateModel(
            name="Milestone",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("category", models.CharField(choices=[("contractual", "Contractuel"), ("programmatic", "Programmatique"), ("reporting", "Reporting")], max_length=20)),
                ("planned_date", models.DateField()),
                ("actual_date", models.DateField(blank=True, null=True)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("achieved", "Achieved"), ("missed", "Missed"), ("forecasted", "Forecasted")], default="pending", max_length=15)),
                ("evidence_url", models.URLField(blank=True)),
                ("evidence_note", models.TextField(blank=True)),
                ("is_gate", models.BooleanField(default=False, help_text="Jalon-gate : bloque le passage à 100% de l'activité si non atteint.")),
                ("is_procurement", models.BooleanField(default=False, help_text="Jalon de passation synchronisé depuis le Module 8.")),
                ("ai_forecast_date", models.DateField(blank=True, help_text="Date d'atteinte prévue par l'IA (BRQ-3.26).", null=True)),
                ("order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("activity", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="milestones", to="workplan.activity")),
            ],
            options={"db_table": "milestone", "ordering": ["activity", "planned_date", "order"]},
        ),
        # ── DelayLog ─────────────────────────────────────────────────────
        migrations.CreateModel(
            name="DelayLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("previous_end", models.DateField(help_text="Date de fin avant révision.")),
                ("revised_end", models.DateField(help_text="Nouvelle date de fin proposée.")),
                ("variance_days", models.IntegerField(help_text="Écart en jours.")),
                ("delay_category", models.CharField(choices=[("procurement", "Passation de marchés"), ("customs", "Dédouanement"), ("weather", "Météo / Environnement"), ("land", "Foncier & Tenure"), ("security", "Sécurité / Conflit"), ("budget", "Contrainte budgétaire"), ("contractor", "Non-performance contractant"), ("technical", "Conception / Technique"), ("counterpart", "Performance contrepartie"), ("force_majeure", "Force majeure"), ("other", "Autre")], max_length=30)),
                ("delay_subcategory", models.CharField(blank=True, choices=[("bid_preparation", "Préparation des offres"), ("nol_delay", "Retard NOL"), ("re_evaluation", "Ré-évaluation"), ("single_bid", "Rejet d'offre unique"), ("access_suspended", "Accès suspendu"), ("country_suspension", "Suspension pays"), ("rainy_season", "Saison des pluies"), ("flood", "Inondation"), ("drought", "Sécheresse"), ("land_acquisition", "Acquisition foncière"), ("right_of_way", "Droit de passage")], max_length=30)),
                ("justification", models.TextField(help_text="Narrative justificative obligatoire.")),
                ("cascade_applied", models.BooleanField(default=False)),
                ("cumulative_variance_days", models.IntegerField(default=0)),
                ("approval_status", models.CharField(choices=[("pending", "En attente"), ("approved", "Approuvée"), ("rejected", "Rejetée")], default="pending", max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("activity", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="delay_logs", to="workplan.activity")),
                ("approved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="delay_approvals", to=settings.AUTH_USER_MODEL)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("recorded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="delay_logs_recorded", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "delay_log", "ordering": ["-created_at"]},
        ),
        # ── SPISnapshot ──────────────────────────────────────────────────
        migrations.CreateModel(
            name="SPISnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("level", models.CharField(choices=[("activity", "Activité"), ("project", "Projet"), ("portfolio", "Portefeuille")], max_length=10)),
                ("earned_value", models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ("planned_value", models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ("spi", models.DecimalField(decimal_places=4, default=0, help_text="SPI = EV / PV.", max_digits=6)),
                ("snapshot_date", models.DateField(default=django.utils.timezone.now)),
                ("computed_at", models.DateTimeField(auto_now_add=True)),
                ("method_note", models.TextField(blank=True)),
                ("activity", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="spi_snapshots", to="workplan.activity")),
                ("project", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="spi_snapshots", to="project.project")),
            ],
            options={"db_table": "spi_snapshot", "ordering": ["-snapshot_date", "level"]},
        ),
    ]
