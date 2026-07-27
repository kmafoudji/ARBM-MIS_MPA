"""
Module 3 — Serializers
SF-1 : Hiérarchie Component / SubComponent / Activity
SF-2 : Liaison Activity → Output (ToCNode)
SF-4 : Mise à jour statut & progression
SF-5 : Jalons
SF-7 : DelayLog
SF-8 : SPISnapshot
"""

from rest_framework import serializers
from apps.results.models import ToCNode
from .models import (
    Activity,
    ActivityDependency,
    DelayLog,
    Milestone,
    SPISnapshot,
    WorkplanComponent,
    WorkplanSubComponent,
    ACTIVITY_STATUS_CHOICES,
    DELAY_CATEGORY_CHOICES,
    DELAY_SUBCATEGORY_CHOICES,
    DEPENDENCY_TYPE_CHOICES,
    MILESTONE_CATEGORY_CHOICES,
    MILESTONE_STATUS_CHOICES,
)


# ---------------------------------------------------------------------------
# SF-2 — Output nodes disponibles pour la liaison (lecture seule)
# ---------------------------------------------------------------------------

class OutputNodeSerializer(serializers.ModelSerializer):
    """Représentation légère d'un nœud Output M2, pour les dropdowns."""
    toc_id = serializers.IntegerField(source="toc.id", read_only=True)

    class Meta:
        model  = ToCNode
        fields = ["id", "code", "statement", "chain_level", "toc_id"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# SF-5 — Jalons
# ---------------------------------------------------------------------------

class MilestoneSerializer(serializers.ModelSerializer):
    status_display   = serializers.CharField(source="get_status_display",   read_only=True)
    category_display = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model  = Milestone
        fields = [
            "id", "activity", "name", "category", "category_display",
            "planned_date", "actual_date", "status", "status_display",
            "evidence_url", "evidence_note",
            "is_gate", "is_procurement", "ai_forecast_date",
            "order", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "ai_forecast_date"]

    def validate_activity(self, value):
        """L'activité doit appartenir au projet courant."""
        request = self.context.get("request")
        project_pk = self.context.get("project_pk")
        if project_pk and value.sub_component.component.project_id != int(project_pk):
            raise serializers.ValidationError(
                "Cette activité n'appartient pas au projet courant."
            )
        return value


class MilestoneUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Milestone
        fields = [
            "name", "category", "planned_date", "actual_date",
            "status", "evidence_url", "evidence_note",
            "is_gate", "order",
        ]


# ---------------------------------------------------------------------------
# SF-7 — DelayLog
# ---------------------------------------------------------------------------

class DelayLogSerializer(serializers.ModelSerializer):
    delay_category_display    = serializers.CharField(
        source="get_delay_category_display", read_only=True
    )
    delay_subcategory_display = serializers.CharField(
        source="get_delay_subcategory_display", read_only=True
    )
    approval_status_display   = serializers.CharField(
        source="get_approval_status_display", read_only=True
    )
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = DelayLog
        fields = [
            "id", "activity",
            "previous_end", "revised_end", "variance_days",
            "delay_category", "delay_category_display",
            "delay_subcategory", "delay_subcategory_display",
            "justification", "cascade_applied",
            "cumulative_variance_days",
            "approval_status", "approval_status_display",
            "approved_by", "approved_by_name", "approved_at",
            "recorded_by", "created_at",
        ]
        read_only_fields = [
            "id", "variance_days", "cumulative_variance_days",
            "approval_status", "approved_by", "approved_at",
            "recorded_by", "created_at",
        ]

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.email
        return None


class DelayLogCreateSerializer(serializers.ModelSerializer):
    """Création d'un DelayLog — calcule variance_days automatiquement."""

    class Meta:
        model  = DelayLog
        fields = [
            "previous_end", "revised_end",
            "delay_category", "delay_subcategory",
            "justification", "cascade_applied",
        ]

    def validate(self, data):
        if data["revised_end"] <= data["previous_end"]:
            raise serializers.ValidationError(
                {"revised_end": "La date révisée doit être postérieure à la date précédente."}
            )
        return data


# ---------------------------------------------------------------------------
# SF-1 — Activity
# ---------------------------------------------------------------------------

class ActivitySerializer(serializers.ModelSerializer):
    """Serializer complet pour lecture et liste."""
    status_display       = serializers.CharField(source="get_status_display", read_only=True)
    output_node_detail   = OutputNodeSerializer(source="output_node", read_only=True)
    is_overdue           = serializers.BooleanField(read_only=True)
    schedule_variance_days = serializers.IntegerField(read_only=True)
    burn_rate            = serializers.FloatField(read_only=True)
    milestones_count     = serializers.SerializerMethodField()
    pending_delays_count = serializers.SerializerMethodField()
    responsible_user_detail = serializers.SerializerMethodField()

    class Meta:
        model  = Activity
        fields = [
            "id", "sub_component", "code", "name", "description",
            "responsible_user", "responsible_user_detail", "responsible_party",
            "planned_start", "planned_end",
            "baseline_start", "baseline_end",
            "revised_end", "actual_end",
            "status", "status_display", "progress",
            "requires_evidence", "is_kpi_linked", "is_critical_path",
            "output_node", "output_node_detail",
            "budget_planned", "budget_spent",
            "is_overdue", "schedule_variance_days", "burn_rate",
            "milestones_count", "pending_delays_count",
            "order", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "baseline_start", "baseline_end",
            "is_overdue", "schedule_variance_days", "burn_rate",
            "created_at", "updated_at",
        ]

    def get_milestones_count(self, obj):
        return obj.milestones.count()

    def get_pending_delays_count(self, obj):
        return obj.delay_logs.filter(approval_status="pending").count()

    def get_responsible_user_detail(self, obj):
        if obj.responsible_user:
            u = obj.responsible_user
            full = f"{u.first_name} {u.last_name}".strip() or u.email
            return {"id": u.id, "email": u.email, "full_name": full}
        return None


class ActivityCreateSerializer(serializers.ModelSerializer):
    """Création d'une activité — valide la liaison output_node."""

    class Meta:
        model  = Activity
        fields = [
            "sub_component", "code", "name", "description",
            "responsible_user", "responsible_party",
            "planned_start", "planned_end",
            "requires_evidence", "is_kpi_linked", "is_critical_path",
            "output_node",
            "budget_planned",
            "order",
        ]

    def validate_output_node(self, value):
        """RG-2.1 : seuls les nœuds chain_level='output' sont autorisés."""
        if value is not None and value.chain_level != "output":
            raise serializers.ValidationError(
                "La liaison n'est autorisée qu'avec un nœud de niveau Output "
                f"(reçu : {value.chain_level})."
            )
        return value



    def validate(self, data):
        if data.get("planned_end") and data.get("planned_start"):
            if data["planned_end"] < data["planned_start"]:
                raise serializers.ValidationError(
                    {"planned_end": "La date de fin doit être postérieure à la date de début."}
                )
        return data


class ActivityUpdateSerializer(serializers.ModelSerializer):
    """Mise à jour partielle — ne permet pas de modifier le sub_component."""

    class Meta:
        model  = Activity
        fields = [
            "code", "name", "description",
            "responsible_user", "responsible_party",
            "planned_start", "planned_end", "revised_end", "actual_end",
            "status", "progress",
            "requires_evidence", "is_kpi_linked", "is_critical_path",
            "output_node",
            "budget_planned",
            "order", "is_active",
        ]

    def validate_output_node(self, value):
        """RG-2.1 : seuls les nœuds chain_level='output' sont autorisés."""
        if value is not None and value.chain_level != "output":
            raise serializers.ValidationError(
                "La liaison n'est autorisée qu'avec un nœud de niveau Output "
                f"(reçu : {value.chain_level})."
            )
        return value

    def validate_progress(self, value):
        """RG-4.1 : % ne peut dépasser 100."""
        if value > 100:
            raise serializers.ValidationError("Le pourcentage d'avancement ne peut dépasser 100.")
        return value

    def validate(self, data):
        instance = self.instance
        status   = data.get("status", instance.status if instance else None)
        progress = data.get("progress", instance.progress if instance else 0)

        # RG-4.4 : preuve obligatoire avant Completed si requires_evidence
        if status == "completed":
            req_ev = data.get("requires_evidence", instance.requires_evidence if instance else False)
            if req_ev:
                # La vérification de la preuve effective se fait côté service/view
                pass

        # Completed → progress doit être 100
        if status == "completed" and progress < 100:
            raise serializers.ValidationError(
                {"progress": "Le pourcentage doit être 100 pour une activité Completed."}
            )

        # Cancelled → progress inchangé (pas de contrainte)
        return data


class ActivityProgressSerializer(serializers.ModelSerializer):
    """Mise à jour rapide statut + progress uniquement (SF-4)."""

    class Meta:
        model  = Activity
        fields = ["status", "progress"]

    def validate(self, data):
        instance = self.instance
        status   = data.get("status", instance.status)
        progress = data.get("progress", instance.progress)

        if status == "completed" and progress < 100:
            raise serializers.ValidationError(
                {"progress": "Le pourcentage doit être 100 pour une activité Completed."}
            )
        return data


# ---------------------------------------------------------------------------
# SF-1 — ActivityDependency
# ---------------------------------------------------------------------------

class ActivityDependencySerializer(serializers.ModelSerializer):
    predecessor_code = serializers.CharField(source="predecessor.code", read_only=True)
    successor_code   = serializers.CharField(source="successor.code",   read_only=True)
    dep_type_display = serializers.CharField(source="get_dep_type_display", read_only=True)

    class Meta:
        model  = ActivityDependency
        fields = [
            "id", "predecessor", "predecessor_code",
            "successor", "successor_code",
            "dep_type", "dep_type_display", "lag_days",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, data):
        pred = data.get("predecessor")
        succ = data.get("successor")
        if pred and succ and pred == succ:
            raise serializers.ValidationError(
                "Une activité ne peut pas dépendre d'elle-même."
            )
        # Les deux activités doivent appartenir au même projet
        if pred and succ:
            if pred.sub_component.component.project_id != succ.sub_component.component.project_id:
                raise serializers.ValidationError(
                    "Les deux activités doivent appartenir au même projet."
                )
        return data


# ---------------------------------------------------------------------------
# SF-1 — WorkplanSubComponent
# ---------------------------------------------------------------------------

class WorkplanSubComponentSerializer(serializers.ModelSerializer):
    activities_count = serializers.SerializerMethodField()

    class Meta:
        model  = WorkplanSubComponent
        fields = [
            "id", "component", "code", "name", "description",
            "order", "is_active", "activities_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_activities_count(self, obj):
        return obj.activities.filter(is_active=True).count()


class WorkplanSubComponentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = WorkplanSubComponent
        fields = ["component", "code", "name", "description", "order"]


class WorkplanSubComponentWithActivitiesSerializer(serializers.ModelSerializer):
    """Sous-composant avec ses activités imbriquées — pour la vue détail."""
    activities = ActivitySerializer(many=True, read_only=True)

    class Meta:
        model  = WorkplanSubComponent
        fields = [
            "id", "component", "code", "name", "description",
            "order", "is_active", "activities",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# SF-1 — WorkplanComponent
# ---------------------------------------------------------------------------

class WorkplanComponentSerializer(serializers.ModelSerializer):
    sub_components_count = serializers.SerializerMethodField()
    activities_count     = serializers.SerializerMethodField()

    class Meta:
        model  = WorkplanComponent
        fields = [
            "id", "project", "code", "name", "description",
            "order", "is_active",
            "sub_components_count", "activities_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "project", "created_at", "updated_at"]

    def get_sub_components_count(self, obj):
        return obj.sub_components.filter(is_active=True).count()

    def get_activities_count(self, obj):
        return Activity.objects.filter(
            sub_component__component=obj, is_active=True
        ).count()


class WorkplanComponentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = WorkplanComponent
        fields = ["code", "name", "description", "order"]


class WorkplanComponentWithChildrenSerializer(serializers.ModelSerializer):
    """Composant avec sous-composants et activités — pour la vue workplan complète."""
    sub_components = WorkplanSubComponentWithActivitiesSerializer(many=True, read_only=True)

    class Meta:
        model  = WorkplanComponent
        fields = [
            "id", "project", "code", "name", "description",
            "order", "is_active", "sub_components",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# SF-8 — SPISnapshot
# ---------------------------------------------------------------------------

class SPISnapshotSerializer(serializers.ModelSerializer):
    level_display = serializers.CharField(source="get_level_display", read_only=True)

    class Meta:
        model  = SPISnapshot
        fields = [
            "id", "level", "level_display",
            "activity", "project",
            "earned_value", "planned_value", "spi",
            "snapshot_date", "computed_at", "method_note",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Vue d'ensemble workplan complet d'un projet
# ---------------------------------------------------------------------------

class WorkplanSummarySerializer(serializers.Serializer):
    """
    Résumé exécutif du workplan d'un projet.
    Retourné par GET /api/projects/{pk}/workplan/summary/
    """
    total_activities    = serializers.IntegerField()
    not_started         = serializers.IntegerField()
    in_progress         = serializers.IntegerField()
    on_hold             = serializers.IntegerField()
    completed           = serializers.IntegerField()
    cancelled           = serializers.IntegerField()
    overdue_count       = serializers.IntegerField()
    overall_progress    = serializers.FloatField()
    critical_path_count = serializers.IntegerField()
    latest_spi          = serializers.FloatField(allow_null=True)


# ---------------------------------------------------------------------------
# Choices endpoint
# ---------------------------------------------------------------------------

def get_workplan_choices():
    return {
        "activity_status":    [{"value": v, "label": l} for v, l in ACTIVITY_STATUS_CHOICES],
        "dependency_type":    [{"value": v, "label": l} for v, l in DEPENDENCY_TYPE_CHOICES],
        "milestone_category": [{"value": v, "label": l} for v, l in MILESTONE_CATEGORY_CHOICES],
        "milestone_status":   [{"value": v, "label": l} for v, l in MILESTONE_STATUS_CHOICES],
        "delay_category":     [{"value": v, "label": l} for v, l in DELAY_CATEGORY_CHOICES],
        "delay_subcategory":  [{"value": v, "label": l} for v, l in DELAY_SUBCATEGORY_CHOICES],
    }
