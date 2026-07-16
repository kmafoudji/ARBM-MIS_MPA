from rest_framework import serializers

from .models import LIFECYCLE_STAGE_CHOICES, Project


class ProjectListSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.name", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    lifecycle_stage_display = serializers.CharField(
        source="get_lifecycle_stage_display", read_only=True
    )

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "country", "country_name", "sector", "sector_name",
            "lifecycle_stage", "lifecycle_stage_display", "budget_amount", "created_at",
        ]


class ProjectCreateSerializer(serializers.ModelSerializer):
    """
    SF-1 Etape 1, sous-ensemble minimal exige au stade Concept Note
    (SF-4) : Nom, pays, secteur, budget indicatif, ODD primaire.
    """

    class Meta:
        model = Project
        fields = ["name", "country", "sector", "budget_amount", "primary_sdg"]

    def create(self, validated_data):
        validated_data["lifecycle_stage"] = "concept_note"
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class ProjectDetailSerializer(serializers.ModelSerializer):
    country_name = serializers.CharField(source="country.name", read_only=True)
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    primary_sdg_name = serializers.CharField(source="primary_sdg.name", read_only=True)
    lifecycle_stage_display = serializers.CharField(
        source="get_lifecycle_stage_display", read_only=True
    )
    created_by_email = serializers.CharField(source="created_by.email", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "official_reference_number",
            "lifecycle_stage", "lifecycle_stage_display",
            "country", "country_name", "sector", "sector_name",
            "primary_sdg", "primary_sdg_name",
            "gender_marker", "implementation_modality",
            "geographic_typology", "fragility_status", "risk_rating",
            "budget_amount", "currency",
            "start_date", "end_date",
            "created_by_email", "created_at", "updated_at",
        ]
        read_only_fields = fields
