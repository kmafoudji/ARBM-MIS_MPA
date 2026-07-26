from rest_framework import serializers
from .models import (
    AGGREGATION_RULE_CHOICES,
    CHAIN_LEVEL_CHOICES,
    CHAIN_LEVEL_WITH_IMPACT_CHOICES,
    CROSS_CUTTING_TAG_CHOICES,
    DIRECTION_CHOICES,
    INDICATOR_TYPE_CHOICES,
    MEASUREMENT_FREQUENCY_CHOICES,
    TARGET_STATUS_CHOICES,
    Indicator,
    LogframeRow,
    LogframeTarget,
    TargetRevision,
    TheoryOfChange,
    ToCNode,
)


# ---------------------------------------------------------------------------
# SF-1 — Indicateurs
# ---------------------------------------------------------------------------

class IndicatorListSerializer(serializers.ModelSerializer):
    sector_name            = serializers.CharField(source="sector.name", read_only=True)
    indicator_type_display = serializers.CharField(source="get_indicator_type_display", read_only=True)
    direction_display      = serializers.CharField(source="get_direction_display", read_only=True)
    aggregation_rule_display = serializers.CharField(
        source="get_aggregation_rule_display", read_only=True
    )
    chain_level_display = serializers.CharField(source="get_chain_level_display", read_only=True)

    class Meta:
        model  = Indicator
        fields = [
            "id", "code", "sector", "sector_name", "subsector",
            "name", "indicator_type", "indicator_type_display",
            "direction", "direction_display", "unit",
            "aggregation_rule", "aggregation_rule_display",
            "chain_level", "chain_level_display",
            "cross_cutting_tags",
            "reporting_frequency", "version", "is_active",
        ]


class IndicatorDetailSerializer(serializers.ModelSerializer):
    sector_name                = serializers.CharField(source="sector.name", read_only=True)
    indicator_type_display     = serializers.CharField(source="get_indicator_type_display", read_only=True)
    direction_display          = serializers.CharField(source="get_direction_display", read_only=True)
    reporting_frequency_display = serializers.CharField(
        source="get_reporting_frequency_display", read_only=True
    )
    aggregation_rule_display = serializers.CharField(
        source="get_aggregation_rule_display", read_only=True
    )
    chain_level_display = serializers.CharField(source="get_chain_level_display", read_only=True)
    related_sdg_numbers = serializers.SerializerMethodField()

    class Meta:
        model  = Indicator
        fields = [
            "id", "code", "sector", "sector_name", "subsector",
            "name", "indicator_type", "indicator_type_display",
            "direction", "direction_display", "definition", "unit",
            "numerator", "denominator", "calculation_method", "formula",
            "data_source", "collection_method",
            "reporting_frequency", "reporting_frequency_display",
            "means_of_verification", "responsible",
            "assumptions", "limitations",
            "aggregation_rule", "aggregation_rule_display",
            "chain_level", "chain_level_display",
            "cross_cutting_tags",
            "version", "related_sdg_numbers", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_related_sdg_numbers(self, obj):
        return list(obj.related_sdgs.values_list("number", flat=True))


# ---------------------------------------------------------------------------
# SF-3 — Cibles et révision
# ---------------------------------------------------------------------------

class TargetRevisionSerializer(serializers.ModelSerializer):
    revised_by_email  = serializers.CharField(source="revised_by.email",  read_only=True)
    approved_by_email = serializers.CharField(source="approved_by.email", read_only=True)
    revision_status_display = serializers.CharField(
        source="get_revision_status_display", read_only=True
    )

    class Meta:
        model  = TargetRevision
        fields = [
            "id", "previous_value", "previous_date",
            "justification", "revision_status", "revision_status_display",
            "revision_comment",
            "revised_by_email", "approved_by_email",
            "created_at", "resolved_at",
        ]
        read_only_fields = fields


class LogframeTargetSerializer(serializers.ModelSerializer):
    status_display    = serializers.CharField(source="get_status_display", read_only=True)
    approved_by_email = serializers.CharField(source="approved_by.email", read_only=True)
    revisions         = TargetRevisionSerializer(many=True, read_only=True)

    target_value = serializers.SerializerMethodField()

    class Meta:
        model  = LogframeTarget
        fields = [
            "id", "target_value", "target_date", "label",
            "disaggregation_note",
            "status", "status_display",
            "is_original_pad",
            "approved_by_email", "approved_at",
            "revisions",
            "created_at",
        ]
        read_only_fields = ["id", "approved_by_email", "revisions", "created_at"]

    def get_target_value(self, obj):
        from decimal import Decimal
        if obj.target_value is None: return None
        d = Decimal(str(obj.target_value)).normalize()
        return str(d.to_integral_value()) if d == d.to_integral_value() else str(d)


class LogframeTargetCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LogframeTarget
        fields = [
            "target_value", "target_date", "label",
            "disaggregation_note", "is_original_pad",
        ]


class TargetRevisionRequestSerializer(serializers.Serializer):
    """Payload pour initier une révision de cible (SF-3, RG-3.3)."""
    new_value     = serializers.DecimalField(max_digits=18, decimal_places=4)
    new_date      = serializers.DateField()
    new_label     = serializers.CharField(required=False, allow_blank=True, default="")
    justification = serializers.CharField(
        help_text="Justification narrative obligatoire (RG-3.3)."
    )


class TargetRevisionActionSerializer(serializers.Serializer):
    """Payload pour approuver ou rejeter une révision (SF-3, RG-3.5)."""
    action  = serializers.ChoiceField(choices=["approve", "reject"])
    comment = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# Logframe
# ---------------------------------------------------------------------------

class LogframeRowSerializer(serializers.ModelSerializer):
    indicator_code     = serializers.CharField(source="indicator.code",           read_only=True)
    indicator_name     = serializers.CharField(source="indicator.name",           read_only=True)
    indicator_unit     = serializers.CharField(source="indicator.unit",           read_only=True)
    indicator_type     = serializers.CharField(source="indicator.indicator_type", read_only=True)
    indicator_direction = serializers.CharField(source="indicator.direction",     read_only=True)
    indicator_aggregation_rule = serializers.CharField(
        source="indicator.aggregation_rule", read_only=True
    )
    indicator_cross_cutting_tags = serializers.JSONField(
        source="indicator.cross_cutting_tags", read_only=True
    )
    chain_level_display = serializers.CharField(source="get_chain_level_display", read_only=True)
    measurement_frequency_display = serializers.CharField(
        source="get_measurement_frequency_display", read_only=True
    )
    targets        = LogframeTargetSerializer(many=True, read_only=True)
    toc_node_code  = serializers.SerializerMethodField()
    toc_node_statement = serializers.SerializerMethodField()

    class Meta:
        model  = LogframeRow
        fields = [
            "id", "project", "indicator", "indicator_code", "indicator_name",
            "indicator_unit", "indicator_type", "indicator_direction",
            "indicator_aggregation_rule", "indicator_cross_cutting_tags",
            "chain_level", "chain_level_display",
            "toc_node_code", "toc_node_statement",
            "baseline_value", "baseline_year", "baseline_source",
            "measurement_frequency", "measurement_frequency_display",
            "notes", "order", "targets",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "indicator_code", "indicator_name", "indicator_unit",
            "indicator_type", "indicator_direction",
            "indicator_aggregation_rule", "indicator_cross_cutting_tags",
            "chain_level_display", "measurement_frequency_display",
            "toc_node_code", "toc_node_statement",
            "targets", "created_at", "updated_at",
        ]

    def get_toc_node_code(self, obj):
        node = obj.toc_nodes.first()
        return node.code if node else None

    def get_toc_node_statement(self, obj):
        node = obj.toc_nodes.first()
        return node.statement[:80] if node else None


class LogframeRowCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LogframeRow
        fields = [
            "indicator", "chain_level",
            "baseline_value", "baseline_year", "baseline_source",
            "measurement_frequency", "notes", "order",
        ]

    def validate_chain_level(self, value):
        valid = [c[0] for c in CHAIN_LEVEL_WITH_IMPACT_CHOICES]
        if value not in valid:
            raise serializers.ValidationError(f"Niveau invalide. Valeurs possibles : {valid}")
        return value


# ---------------------------------------------------------------------------
# SF-2 — ToC et nœuds
# ---------------------------------------------------------------------------

class ToCNodeSerializer(serializers.ModelSerializer):
    chain_level_display        = serializers.CharField(source="get_chain_level_display", read_only=True)
    logframe_row_id            = serializers.IntegerField(source="logframe_row.id",               read_only=True)
    logframe_indicator_code    = serializers.CharField(source="logframe_row.indicator.code",      read_only=True)
    logframe_indicator_name    = serializers.CharField(source="logframe_row.indicator.name",      read_only=True)
    logframe_indicator_unit    = serializers.CharField(source="logframe_row.indicator.unit",      read_only=True)
    logframe_baseline_value    = serializers.DecimalField(
        source="logframe_row.baseline_value", max_digits=18, decimal_places=4, read_only=True
    )
    logframe_baseline_year     = serializers.IntegerField(source="logframe_row.baseline_year",    read_only=True)
    # Fréquence depuis le catalogue (recommandation) et depuis LogframeRow (choix projet)
    catalogue_frequency        = serializers.CharField(
        source="logframe_row.indicator.reporting_frequency", read_only=True
    )
    logframe_frequency         = serializers.CharField(
        source="logframe_row.measurement_frequency", read_only=True
    )
    # Dimensions de désagrégation du catalogue
    catalogue_disagg_dims      = serializers.SerializerMethodField()
    cross_pathway_ids          = serializers.SerializerMethodField()

    def get_catalogue_disagg_dims(self, obj):
        if not obj.logframe_row_id:
            return []
        dims = obj.logframe_row.indicator.disaggregation_dimensions.all()
        return [{"id": d.id, "name": d.name, "categories": d.categories} for d in dims]

    class Meta:
        model  = ToCNode
        fields = [
            "id", "parent", "code", "chain_level", "chain_level_display",
            "statement",
            "logframe_row_id", "logframe_indicator_code",
            "logframe_indicator_name", "logframe_indicator_unit",
            "logframe_baseline_value", "logframe_baseline_year",
            "catalogue_frequency", "logframe_frequency",
            "catalogue_disagg_dims",
            "means_of_verification", "assumptions", "risks_mitigation",
            "adaptation_strategy", "gender_climate_tag",
            "cross_pathway_ids",
            "order", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "parent", "code", "chain_level", "chain_level_display",
            "logframe_row_id", "logframe_indicator_code",
            "logframe_indicator_name", "logframe_indicator_unit",
            "logframe_baseline_value", "logframe_baseline_year",
            "catalogue_frequency", "logframe_frequency",
            "catalogue_disagg_dims",
            "cross_pathway_ids",
            "created_at", "updated_at",
        ]

    def get_cross_pathway_ids(self, obj):
        return list(obj.cross_pathways.values_list("id", flat=True))


class ToCNodeCreateSerializer(serializers.Serializer):
    chain_level  = serializers.ChoiceField(choices=CHAIN_LEVEL_CHOICES)
    parent       = serializers.PrimaryKeyRelatedField(
        queryset=ToCNode.objects.all(), required=False, allow_null=True
    )
    statement    = serializers.CharField()
    logframe_row = serializers.PrimaryKeyRelatedField(
        queryset=LogframeRow.objects.all(), required=False, allow_null=True
    )
    means_of_verification = serializers.CharField(required=False, allow_blank=True, default="")
    assumptions           = serializers.CharField(required=False, allow_blank=True, default="")
    risks_mitigation      = serializers.CharField(required=False, allow_blank=True, default="")
    adaptation_strategy   = serializers.CharField(required=False, allow_blank=True, default="")
    gender_climate_tag    = serializers.CharField(required=False, allow_blank=True, default="")
    cross_pathway_ids     = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list,
        help_text="IDs des nœuds cibles pour liaisons non linéaires (RG-2.6).",
    )
    order = serializers.IntegerField(required=False, default=0)


class ToCNodeUpdateSerializer(serializers.ModelSerializer):
    """Champs éditables après création (pas parent/chain_level/code)."""
    logframe_row  = serializers.PrimaryKeyRelatedField(
        queryset=LogframeRow.objects.all(), required=False, allow_null=True
    )
    cross_pathway_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False,
        help_text="Remplace la liste complète des liaisons non linéaires.",
    )

    class Meta:
        model  = ToCNode
        fields = [
            "statement", "logframe_row",
            "means_of_verification", "assumptions", "risks_mitigation",
            "adaptation_strategy", "gender_climate_tag",
            "cross_pathway_ids",
            "order",
        ]

    def update(self, instance, validated_data):
        cross_ids = validated_data.pop("cross_pathway_ids", None)
        instance = super().update(instance, validated_data)
        if cross_ids is not None:
            targets = ToCNode.objects.filter(id__in=cross_ids, toc=instance.toc)
            instance.cross_pathways.set(targets)
        return instance


class TheoryOfChangeSerializer(serializers.ModelSerializer):
    nodes        = ToCNodeSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)

    class Meta:
        model  = TheoryOfChange
        fields = [
            "id", "project", "project_name", "project_code",
            "version", "status", "status_display",
            "problem_statement", "ultimate_outcome",
            "local_actors",
            "nodes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "project", "project_name", "project_code", "version",
            "status_display", "nodes", "created_at", "updated_at",
        ]


class TheoryOfChangeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TheoryOfChange
        fields = ["status", "problem_statement", "ultimate_outcome", "local_actors"]


# ---------------------------------------------------------------------------
# Vocabulaires pour les selects frontend
# ---------------------------------------------------------------------------

def get_logframe_choices():
    return {
        "indicator_types":        [{"value": v, "label": l} for v, l in INDICATOR_TYPE_CHOICES],
        "directions":             [{"value": v, "label": l} for v, l in DIRECTION_CHOICES],
        "chain_levels":           [{"value": v, "label": l} for v, l in CHAIN_LEVEL_WITH_IMPACT_CHOICES],
        "measurement_frequencies":[{"value": v, "label": l} for v, l in MEASUREMENT_FREQUENCY_CHOICES],
        "aggregation_rules":      [{"value": v, "label": l} for v, l in AGGREGATION_RULE_CHOICES],
        "cross_cutting_tags":     [{"value": v, "label": l} for v, l in CROSS_CUTTING_TAG_CHOICES],
        "target_statuses":        [{"value": v, "label": l} for v, l in TARGET_STATUS_CHOICES],
    }


# ---------------------------------------------------------------------------
# SF-4 / SF-5 — ResultsData
# ---------------------------------------------------------------------------

class ResultsDataSerializer(serializers.ModelSerializer):
    indicator_code    = serializers.CharField(source="logframe_row.indicator.code",      read_only=True)
    indicator_name    = serializers.CharField(source="logframe_row.indicator.name",      read_only=True)
    indicator_unit    = serializers.CharField(source="logframe_row.indicator.unit",      read_only=True)
    indicator_direction = serializers.CharField(source="logframe_row.indicator.direction", read_only=True)
    period_label      = serializers.CharField(source="reporting_period.label",           read_only=True)
    period_end        = serializers.DateField(source="reporting_period.end_date",        read_only=True)
    status_display    = serializers.CharField(source="get_status_display",               read_only=True)
    rag_display       = serializers.CharField(source="get_rag_status_display",           read_only=True)
    submitted_by_email = serializers.CharField(source="submitted_by.email",             read_only=True)
    approved_by_email  = serializers.CharField(source="approved_by.email",              read_only=True)

    # Cible de référence pour cette période (la plus proche approuvée)
    reference_target  = serializers.SerializerMethodField()

    class Meta:
        from .models import ResultsData
        model  = ResultsData
        fields = [
            "id", "logframe_row", "reporting_period",
            "indicator_code", "indicator_name", "indicator_unit", "indicator_direction",
            "period_label", "period_end",
            "actual_value", "narrative",
            "rag_status", "rag_display", "achievement_rate",
            "status", "status_display",
            "submitted_by_email", "approved_by_email", "approved_at",
            "reference_target",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "rag_status", "rag_display", "achievement_rate",
            "indicator_code", "indicator_name", "indicator_unit", "indicator_direction",
            "period_label", "period_end",
            "submitted_by_email", "approved_by_email",
            "reference_target", "created_at", "updated_at",
        ]

    def get_reference_target(self, obj):
        period_end = obj.reporting_period.end_date
        t = (
            obj.logframe_row.targets
            .filter(status="approved")
            .filter(target_date__lte=period_end)
            .order_by("target_date")
            .last()
        ) or obj.logframe_row.targets.filter(status="approved").order_by("target_date").first()
        if not t:
            return None
        return {
            "id": t.id,
            "target_value": str(t.target_value),
            "target_date": str(t.target_date),
            "label": t.label,
        }


class ResultsDataCreateSerializer(serializers.Serializer):
    logframe_row     = serializers.IntegerField()
    reporting_period = serializers.IntegerField()
    actual_value     = serializers.DecimalField(max_digits=18, decimal_places=4)
    narrative        = serializers.CharField(required=False, allow_blank=True, default="")
    approve          = serializers.BooleanField(
        default=False,
        help_text="True = approuver directement (RBAC neutralisé).",
    )


class ResultsDataUpdateSerializer(serializers.Serializer):
    actual_value = serializers.DecimalField(max_digits=18, decimal_places=4, required=False)
    narrative    = serializers.CharField(required=False, allow_blank=True)
    approve      = serializers.BooleanField(required=False)


# ---------------------------------------------------------------------------
# SF-6 — Désagrégation
# ---------------------------------------------------------------------------

class IndicatorDisaggregationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = __import__("apps.results.models", fromlist=["IndicatorDisaggregation"]).IndicatorDisaggregation
        fields = ["id", "indicator", "name", "categories", "order"]
        read_only_fields = ["id"]


class DisaggregationValueSerializer(serializers.ModelSerializer):
    dimension_name = serializers.CharField(source="dimension.name", read_only=True)
    value = serializers.SerializerMethodField()

    class Meta:
        model  = __import__("apps.results.models", fromlist=["DisaggregationValue"]).DisaggregationValue
        fields = ["id", "dimension", "dimension_name", "category", "value"]
        read_only_fields = ["id", "dimension_name"]

    def get_value(self, obj):
        from decimal import Decimal
        d = Decimal(str(obj.value)).normalize()
        if d == d.to_integral_value():
            return str(d.to_integral_value())
        return str(d)


class DisaggregationValueWriteSerializer(serializers.Serializer):
    """Payload pour sauvegarder toutes les valeurs d'une dimension en une fois."""
    dimension_id = serializers.IntegerField()
    values       = serializers.ListField(
        child=serializers.DictField(),
        help_text='[{"category": "Homme", "value": 120}, ...]',
    )
