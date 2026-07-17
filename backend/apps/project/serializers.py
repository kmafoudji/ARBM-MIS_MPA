from rest_framework import serializers

from apps.reference.models import Country, Sdg

from .models import Project
from .services import set_project_countries, set_project_sdgs


class ProjectListSerializer(serializers.ModelSerializer):
    lead_country_name = serializers.SerializerMethodField()
    country_names = serializers.SerializerMethodField()
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    lifecycle_stage_display = serializers.CharField(
        source="get_lifecycle_stage_display", read_only=True
    )

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "lead_country_name", "country_names",
            "sector", "sector_name", "lifecycle_stage", "lifecycle_stage_display",
            "budget_amount", "created_at",
        ]

    def get_lead_country_name(self, obj):
        lead = obj.lead_country
        return lead.name if lead else None

    def get_country_names(self, obj):
        return [pc.country.name for pc in obj.project_countries.select_related("country")]


class ProjectCreateSerializer(serializers.ModelSerializer):
    """
    SF-1 Etape 1, sous-ensemble minimal exige au stade Concept Note
    (SF-4) : Nom, pays (1 ou plusieurs + chef de file), secteur, budget
    indicatif, ODD primaire.
    """

    country_ids = serializers.PrimaryKeyRelatedField(
        queryset=Country.objects.all(), many=True, write_only=True
    )
    lead_country_id = serializers.PrimaryKeyRelatedField(
        queryset=Country.objects.all(), write_only=True
    )
    contributing_sdg_ids = serializers.PrimaryKeyRelatedField(
        queryset=Sdg.objects.all(), many=True, write_only=True, required=False
    )

    class Meta:
        model = Project
        fields = [
            "name", "country_ids", "lead_country_id", "sector", "budget_amount",
            "primary_sdg", "contributing_sdg_ids",
        ]

    def create(self, validated_data):
        country_ids = [c.id for c in validated_data.pop("country_ids")]
        lead_country_id = validated_data.pop("lead_country_id").id
        contributing_sdg_ids = [s.number for s in validated_data.pop("contributing_sdg_ids", [])]
        validated_data["lifecycle_stage"] = "concept_note"
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        project = Project.objects.create(**validated_data)
        set_project_countries(project, country_ids, lead_country_id)
        if contributing_sdg_ids:
            set_project_sdgs(project, contributing_sdg_ids)
        return project


class ProjectDetailSerializer(serializers.ModelSerializer):
    lead_country_name = serializers.SerializerMethodField()
    country_names = serializers.SerializerMethodField()
    sector_name = serializers.CharField(source="sector.name", read_only=True)
    primary_sdg_name = serializers.CharField(source="primary_sdg.name", read_only=True)
    contributing_sdg_names = serializers.SerializerMethodField()
    lifecycle_stage_display = serializers.CharField(
        source="get_lifecycle_stage_display", read_only=True
    )
    created_by_email = serializers.CharField(source="created_by.email", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "official_reference_number",
            "lifecycle_stage", "lifecycle_stage_display",
            "lead_country_name", "country_names",
            "sector", "sector_name",
            "primary_sdg", "primary_sdg_name", "contributing_sdg_names",
            "gender_marker", "implementation_modality",
            "geographic_typology", "fragility_status", "risk_rating",
            "budget_amount", "currency",
            "start_date", "end_date",
            "created_by_email", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_lead_country_name(self, obj):
        lead = obj.lead_country
        return lead.name if lead else None

    def get_country_names(self, obj):
        return [pc.country.name for pc in obj.project_countries.select_related("country")]

    def get_contributing_sdg_names(self, obj):
        return [f"ODD {s.number} - {s.name}" for s in obj.contributing_sdgs.all()]
