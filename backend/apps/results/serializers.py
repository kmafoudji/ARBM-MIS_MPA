from rest_framework import serializers
from .models import (
    CHAIN_LEVEL_WITH_IMPACT_CHOICES,
    INDICATOR_TYPE_CHOICES,
    DIRECTION_CHOICES,
    MEASUREMENT_FREQUENCY_CHOICES,
    Indicator,
    LogframeRow,
    LogframeTarget,
    TheoryOfChange,
    ToCNode,
    CHAIN_LEVEL_CHOICES,
)


# ---------------------------------------------------------------------------
# Catalogue indicateurs
# ---------------------------------------------------------------------------

class IndicatorListSerializer(serializers.ModelSerializer):
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    indicator_type_display = serializers.CharField(source="get_indicator_type_display", read_only=True)
    direction_display = serializers.CharField(source="get_direction_display", read_only=True)

    class Meta:
        model = Indicator
        fields = [
            "id", "code", "sector", "sector_name", "subsector",
            "name", "indicator_type", "indicator_type_display",
            "direction", "direction_display", "unit",
            "reporting_frequency", "is_active",
        ]


class IndicatorDetailSerializer(serializers.ModelSerializer):
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    indicator_type_display = serializers.CharField(source="get_indicator_type_display", read_only=True)
    direction_display = serializers.CharField(source="get_direction_display", read_only=True)
    reporting_frequency_display = serializers.CharField(
        source="get_reporting_frequency_display", read_only=True
    )
    related_sdg_numbers = serializers.SerializerMethodField()

    class Meta:
        model = Indicator
        fields = [
            "id", "code", "sector", "sector_name", "subsector",
            "name", "indicator_type", "indicator_type_display",
            "direction", "direction_display", "definition", "unit",
            "numerator", "denominator", "calculation_method", "formula",
            "disaggregation", "data_source", "collection_method",
            "reporting_frequency", "reporting_frequency_display",
            "means_of_verification", "responsible",
            "assumptions", "limitations",
            "related_sdg_numbers", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_related_sdg_numbers(self, obj):
        return list(obj.related_sdgs.values_list("number", flat=True))


# ---------------------------------------------------------------------------
# Logframe
# ---------------------------------------------------------------------------

class LogframeTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = LogframeTarget
        fields = ["id", "target_value", "target_date", "label", "disaggregation_note", "created_at"]
        read_only_fields = ["id", "created_at"]


class LogframeTargetCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LogframeTarget
        fields = ["target_value", "target_date", "label", "disaggregation_note"]


class LogframeRowSerializer(serializers.ModelSerializer):
    indicator_code = serializers.CharField(source="indicator.code", read_only=True)
    indicator_name = serializers.CharField(source="indicator.name", read_only=True)
    indicator_unit = serializers.CharField(source="indicator.unit", read_only=True)
    indicator_type = serializers.CharField(source="indicator.indicator_type", read_only=True)
    indicator_direction = serializers.CharField(source="indicator.direction", read_only=True)
    chain_level_display = serializers.CharField(source="get_chain_level_display", read_only=True)
    measurement_frequency_display = serializers.CharField(
        source="get_measurement_frequency_display", read_only=True
    )
    targets = LogframeTargetSerializer(many=True, read_only=True)
    toc_node_code = serializers.SerializerMethodField()
    toc_node_statement = serializers.SerializerMethodField()

    class Meta:
        model = LogframeRow
        fields = [
            "id", "project", "indicator", "indicator_code", "indicator_name",
            "indicator_unit", "indicator_type", "indicator_direction",
            "chain_level", "chain_level_display",
            "toc_node_code", "toc_node_statement",
            "baseline_value", "baseline_year", "baseline_source",
            "measurement_frequency", "measurement_frequency_display",
            "notes", "order", "targets",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "indicator_code", "indicator_name", "indicator_unit",
            "indicator_type", "indicator_direction", "chain_level_display",
            "measurement_frequency_display", "toc_node_code", "toc_node_statement",
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
        model = LogframeRow
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
# ToC (mise a jour pour inclure les infos logframe_row sur les noeuds)
# ---------------------------------------------------------------------------

class ToCNodeSerializer(serializers.ModelSerializer):
    chain_level_display = serializers.CharField(source="get_chain_level_display", read_only=True)
    logframe_row_id = serializers.IntegerField(source="logframe_row.id", read_only=True)
    logframe_indicator_code = serializers.CharField(
        source="logframe_row.indicator.code", read_only=True
    )
    logframe_indicator_name = serializers.CharField(
        source="logframe_row.indicator.name", read_only=True
    )
    logframe_indicator_unit = serializers.CharField(
        source="logframe_row.indicator.unit", read_only=True
    )
    logframe_baseline_value = serializers.DecimalField(
        source="logframe_row.baseline_value", max_digits=18, decimal_places=4, read_only=True
    )
    logframe_baseline_year = serializers.IntegerField(
        source="logframe_row.baseline_year", read_only=True
    )

    class Meta:
        model = ToCNode
        fields = [
            "id", "parent", "code", "chain_level", "chain_level_display",
            "statement",
            "logframe_row_id", "logframe_indicator_code",
            "logframe_indicator_name", "logframe_indicator_unit",
            "logframe_baseline_value", "logframe_baseline_year",
            "means_of_verification", "assumptions", "risks_mitigation",
            "adaptation_strategy", "gender_climate_tag", "order",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "parent", "code", "chain_level", "chain_level_display",
            "logframe_row_id", "logframe_indicator_code",
            "logframe_indicator_name", "logframe_indicator_unit",
            "logframe_baseline_value", "logframe_baseline_year",
            "created_at", "updated_at",
        ]


class ToCNodeCreateSerializer(serializers.Serializer):
    chain_level = serializers.ChoiceField(choices=CHAIN_LEVEL_CHOICES)
    parent = serializers.PrimaryKeyRelatedField(
        queryset=ToCNode.objects.all(), required=False, allow_null=True
    )
    statement = serializers.CharField()
    logframe_row = serializers.PrimaryKeyRelatedField(
        queryset=LogframeRow.objects.all(), required=False, allow_null=True
    )
    means_of_verification = serializers.CharField(required=False, allow_blank=True, default="")
    assumptions = serializers.CharField(required=False, allow_blank=True, default="")
    risks_mitigation = serializers.CharField(required=False, allow_blank=True, default="")
    adaptation_strategy = serializers.CharField(required=False, allow_blank=True, default="")
    gender_climate_tag = serializers.CharField(required=False, allow_blank=True, default="")
    order = serializers.IntegerField(required=False, default=0)


class ToCNodeUpdateSerializer(serializers.ModelSerializer):
    """Champs editables apres creation (pas parent/chain_level/code)."""
    logframe_row = serializers.PrimaryKeyRelatedField(
        queryset=LogframeRow.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = ToCNode
        fields = [
            "statement", "logframe_row",
            "means_of_verification", "assumptions", "risks_mitigation",
            "adaptation_strategy", "gender_climate_tag", "order",
        ]


class TheoryOfChangeSerializer(serializers.ModelSerializer):
    nodes = ToCNodeSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)

    class Meta:
        model = TheoryOfChange
        fields = [
            "id", "project", "project_name", "project_code",
            "version", "status", "status_display",
            "problem_statement", "ultimate_outcome",
            "nodes", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "project", "project_name", "project_code", "version",
            "status_display", "nodes", "created_at", "updated_at",
        ]


class TheoryOfChangeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TheoryOfChange
        fields = ["status", "problem_statement", "ultimate_outcome"]


# ---------------------------------------------------------------------------
# Vocabulaires (pour peupler les selects frontend)
# ---------------------------------------------------------------------------

def get_logframe_choices():
    return {
        "indicator_types": [{"value": v, "label": l} for v, l in INDICATOR_TYPE_CHOICES],
        "directions": [{"value": v, "label": l} for v, l in DIRECTION_CHOICES],
        "chain_levels": [{"value": v, "label": l} for v, l in CHAIN_LEVEL_WITH_IMPACT_CHOICES],
        "measurement_frequencies": [{"value": v, "label": l} for v, l in MEASUREMENT_FREQUENCY_CHOICES],
    }
