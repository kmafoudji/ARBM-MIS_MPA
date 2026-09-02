from rest_framework import serializers

from apps.identity.models import AppUser
from apps.reference.models import Country, CrossCuttingTheme, Sdg, Sector

from .models import (
    LIFECYCLE_STAGE_CHOICES,
    Project,
    ProjectImplementingPartner,
    ProjectStageTransition,
)
from .services import set_project_countries, set_project_sdgs, set_project_sectors


class ProjectListSerializer(serializers.ModelSerializer):
    lead_country_name = serializers.SerializerMethodField()
    lead_country_iso2 = serializers.SerializerMethodField()
    country_names = serializers.SerializerMethodField()
    primary_sector_name = serializers.CharField(source="primary_sector.name", read_only=True)
    primary_sector_icon = serializers.CharField(source="primary_sector.icon", read_only=True)
    primary_sector_color = serializers.CharField(source="primary_sector.color", read_only=True)
    contributing_sector_count = serializers.SerializerMethodField()
    lifecycle_stage_display = serializers.CharField(
        source="get_lifecycle_stage_display", read_only=True
    )
    hub_name = serializers.SerializerMethodField()
    envelope_total = serializers.SerializerMethodField()

    def get_envelope_total(self, obj):
        """Total de l'enveloppe financière (sum des sources) — priorité sur budget_amount."""
        try:
            env = obj.financial_envelope
            if env and env.total_amount_usd:
                return str(env.total_amount_usd)
        except Exception:
            pass
        return str(obj.budget_amount) if obj.budget_amount else None

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "acronym",
            "lead_country_name", "lead_country_iso2", "country_names",
            "primary_sector", "primary_sector_name", "primary_sector_icon",
            "primary_sector_color", "contributing_sector_count",
            "lifecycle_stage", "lifecycle_stage_display",
            "budget_amount", "envelope_total", "created_at",
            "hub_name",
        ]

    def get_hub_name(self, obj):
        if obj.hub_id:
            return obj.hub.name
        lead = obj.project_countries.filter(
            is_lead=True
        ).select_related("country__hub").first()
        return lead.country.hub.name if lead and lead.country.hub_id else None

    def get_lead_country_name(self, obj):
        lead = obj.lead_country
        return lead.name if lead else None

    def get_lead_country_iso2(self, obj):
        lead = obj.lead_country
        return lead.iso2 if lead else None

    def get_country_names(self, obj):
        return [pc.country.name for pc in obj.project_countries.select_related("country")]

    def get_contributing_sector_count(self, obj):
        return obj.contributing_sectors.count()


class ProjectCreateSerializer(serializers.ModelSerializer):
    """
    SF-1 Etape 1, sous-ensemble minimal exige au stade Concept Note
    (SF-4) : Nom, pays (1 ou plusieurs + chef de file), secteur primaire
    (+ contributifs optionnels, meme modele que les ODD), budget
    indicatif, ODD primaire (+ contributifs optionnels).
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
    contributing_sector_ids = serializers.PrimaryKeyRelatedField(
        queryset=Sector.objects.all(), many=True, write_only=True, required=False
    )

    class Meta:
        model = Project
        fields = [
            "id", "name", "acronym", "country_ids", "lead_country_id",
            "primary_sector", "contributing_sector_ids",
            "budget_amount", "primary_sdg", "contributing_sdg_ids",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        country_ids = [c.id for c in validated_data.pop("country_ids")]
        lead_country_id = validated_data.pop("lead_country_id").id
        contributing_sdg_ids = [s.number for s in validated_data.pop("contributing_sdg_ids", [])]
        contributing_sector_ids = [s.id for s in validated_data.pop("contributing_sector_ids", [])]
        validated_data["lifecycle_stage"] = "concept_note"
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        project = Project.objects.create(**validated_data)
        set_project_countries(project, country_ids, lead_country_id)
        if contributing_sdg_ids:
            set_project_sdgs(project, contributing_sdg_ids)
        if contributing_sector_ids:
            set_project_sectors(project, contributing_sector_ids)
        return project


class ProjectDetailSerializer(serializers.ModelSerializer):
    lead_country_name = serializers.SerializerMethodField()
    countries_detail = serializers.SerializerMethodField()
    hub_name = serializers.SerializerMethodField()
    hub_color = serializers.SerializerMethodField()
    primary_sector_name = serializers.CharField(source="primary_sector.name", read_only=True)
    primary_sector_icon = serializers.CharField(source="primary_sector.icon", read_only=True)
    primary_sector_color = serializers.CharField(source="primary_sector.color", read_only=True)
    contributing_sectors_detail = serializers.SerializerMethodField()
    primary_sdg_name = serializers.CharField(source="primary_sdg.name", read_only=True)
    primary_sdg_color = serializers.CharField(source="primary_sdg.color", read_only=True)
    contributing_sdgs_detail = serializers.SerializerMethodField()
    lifecycle_stage_display = serializers.CharField(
        source="get_lifecycle_stage_display", read_only=True
    )
    created_by_email = serializers.CharField(source="created_by.email", read_only=True)

    # SF-2 — labels lisibles (le front n'affichait que le code brut, ex.
    # "2" au lieu de "Categorie 2 - Principal")
    gender_marker_display = serializers.CharField(source="get_gender_marker_display", read_only=True)
    implementation_modality_display = serializers.CharField(
        source="get_implementation_modality_display", read_only=True
    )
    geographic_typology_display = serializers.CharField(
        source="get_geographic_typology_display", read_only=True
    )
    fragility_status_display = serializers.CharField(source="get_fragility_status_display", read_only=True)
    risk_rating_display = serializers.CharField(source="get_risk_rating_display", read_only=True)
    cross_cutting_theme_ids = serializers.SerializerMethodField()
    cross_cutting_theme_names = serializers.SerializerMethodField()
    pad_reference_url = serializers.SerializerMethodField()
    pad_reference_name = serializers.SerializerMethodField()
    reporting_frequency_display = serializers.CharField(
        source="get_reporting_frequency_display", read_only=True
    )
    has_workspace   = serializers.SerializerMethodField()
    toc_node_count  = serializers.SerializerMethodField()

    def get_has_workspace(self, obj):
        return hasattr(obj, "workspace") and obj.workspace is not None

    def get_toc_node_count(self, obj):
        try:
            return obj.theory_of_change.nodes.count()
        except Exception:
            return 0

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "acronym", "official_reference_number",
            "lifecycle_stage", "lifecycle_stage_display",
            "lead_country_name", "countries_detail",
            "hub_name", "hub_color",
            "primary_sector", "primary_sector_name", "primary_sector_icon", "primary_sector_color",
            "contributing_sectors_detail",
            "primary_sdg", "primary_sdg_name", "primary_sdg_color",
            "contributing_sdgs_detail",
            "gender_marker", "gender_marker_display",
            "implementation_modality", "implementation_modality_display",
            "geographic_typology", "geographic_typology_display",
            "fragility_status", "fragility_status_display",
            "risk_rating", "risk_rating_display",
            "cross_cutting_theme_ids", "cross_cutting_theme_names",
            "rio_marker_mitigation", "rio_marker_adaptation",
            "rio_marker_biodiversity", "rio_marker_desertification", "rio_marker_water",
            "has_workspace", "toc_node_count",
            "pad_reference_url", "pad_reference_name",
            "reporting_frequency", "reporting_frequency_display", "next_reporting_due",
            "budget_amount", "currency",
            "start_date", "end_date",
            "created_by_email", "created_at", "updated_at",
        ]
        read_only_fields = fields

    def get_lead_country_name(self, obj):
        lead = obj.lead_country
        return lead.name if lead else None

    def get_countries_detail(self, obj):
        return [
            {
                "id": pc.country_id,
                "name": pc.country.name,
                "iso2": pc.country.iso2,
                "iso3": pc.country.iso3,
                "flag": pc.country.flag,
                "is_lead": pc.is_lead,
            }
            for pc in obj.project_countries.select_related("country")
        ]

    def get_hub_name(self, obj):
        # Le hub n'est pour l'instant jamais saisi manuellement (pas de
        # champ d'edition dedie) : on retombe sur le hub du pays chef de
        # file, coherent avec le decoupage des 8 hubs regionaux du LLF2.
        if obj.hub_id:
            return obj.hub.name
        lead = obj.lead_country
        return lead.hub.name if lead and lead.hub_id else None

    def get_hub_color(self, obj):
        if obj.hub_id:
            return obj.hub.color
        lead = obj.lead_country
        return lead.hub.color if lead and lead.hub_id else None

    def get_contributing_sectors_detail(self, obj):
        return [
            {"id": s.id, "name": s.name, "icon": s.icon, "color": s.color}
            for s in obj.contributing_sectors.all()
        ]

    def get_contributing_sdgs_detail(self, obj):
        return [
            {"number": s.number, "name": s.name, "color": s.color}
            for s in obj.contributing_sdgs.all()
        ]

    def get_cross_cutting_theme_ids(self, obj):
        return list(obj.cross_cutting_themes.values_list("id", flat=True))

    def get_cross_cutting_theme_names(self, obj):
        return [t.name for t in obj.cross_cutting_themes.all()]

    def get_pad_reference_url(self, obj):
        return obj.pad_reference_file.url if obj.pad_reference_file else None

    def get_pad_reference_name(self, obj):
        return obj.pad_reference_file.name.rsplit("/", 1)[-1] if obj.pad_reference_file else None


class ProjectClassificationUpdateSerializer(serializers.ModelSerializer):
    """
    SF-2 — ecriture de la classification strategique complete : secteur et
    ODD (primaire + contributifs) en plus des 5 champs a choix unique.
    Les contributifs passent par set_project_sectors()/set_project_sdgs()
    (meme validation qu'a la creation : le primaire ne peut pas doubler en
    contributif) — PAS par l'assignation M2M par defaut de DRF, qui ne sait
    pas appliquer cette regle. cross_cutting_themes, seul M2M ici sans
    through model, reste sur l'assignation standard.
    """

    cross_cutting_theme_ids = serializers.PrimaryKeyRelatedField(
        queryset=CrossCuttingTheme.objects.all(), many=True, required=False,
        source="cross_cutting_themes",
    )
    contributing_sector_ids = serializers.PrimaryKeyRelatedField(
        queryset=Sector.objects.all(), many=True, required=False, write_only=True
    )
    contributing_sdg_ids = serializers.PrimaryKeyRelatedField(
        queryset=Sdg.objects.all(), many=True, required=False, write_only=True
    )

    class Meta:
        model = Project
        fields = [
            "name", "acronym", "budget_amount",
            "primary_sector", "contributing_sector_ids",
            "primary_sdg", "contributing_sdg_ids",
            "gender_marker", "implementation_modality", "geographic_typology",
            "fragility_status", "risk_rating", "cross_cutting_theme_ids",
            "rio_marker_mitigation", "rio_marker_adaptation",
            "rio_marker_biodiversity", "rio_marker_desertification", "rio_marker_water",
        ]

    def update(self, instance, validated_data):
        contributing_sector_ids = validated_data.pop("contributing_sector_ids", None)
        contributing_sdg_ids = validated_data.pop("contributing_sdg_ids", None)

        # super().update() sauve d'abord primary_sector/primary_sdg : les
        # services ci-dessous, qui verifient le primaire pour rejeter un
        # doublon en contributif, doivent voir la valeur a jour.
        instance = super().update(instance, validated_data)

        if contributing_sector_ids is not None:
            set_project_sectors(instance, [s.id for s in contributing_sector_ids])
        if contributing_sdg_ids is not None:
            set_project_sdgs(instance, [s.number for s in contributing_sdg_ids])
        return instance


class ReportingConfigUpdateSerializer(serializers.ModelSerializer):
    """SF-1 Etape 5 — perimetre reduit (cf. models.py) : frequence + premiere echeance."""

    class Meta:
        model = Project
        fields = ["reporting_frequency", "next_reporting_due", "end_date"]


class ProjectDatesUpdateSerializer(serializers.ModelSerializer):
    """SF-1 Etape 3 — dates de debut/fin. Duree indicative avant pipeline,
    obligatoires a partir de BED Approved (cf. services._check_bed_approved_
    prerequisites_complete)."""

    class Meta:
        model = Project
        fields = ["start_date", "end_date"]


class ProjectStageTransitionSerializer(serializers.ModelSerializer):
    from_stage_display = serializers.CharField(source="get_from_stage_display", read_only=True)
    to_stage_display = serializers.CharField(source="get_to_stage_display", read_only=True)
    transitioned_by_email = serializers.CharField(source="transitioned_by.email", read_only=True)
    dual_authorized_by_email = serializers.CharField(
        source="dual_authorized_by.email", read_only=True
    )

    class Meta:
        model = ProjectStageTransition
        fields = [
            "id", "from_stage", "from_stage_display", "to_stage", "to_stage_display",
            "transitioned_by_email", "transitioned_at", "transition_date",
            "justification", "document_reference", "dual_authorized_by_email",
        ]
        read_only_fields = fields


class StageTransitionRequestSerializer(serializers.Serializer):
    """Payload pour POST /api/projects/{id}/transitions/ (SF-4)."""

    to_stage = serializers.ChoiceField(choices=LIFECYCLE_STAGE_CHOICES)
    transition_date = serializers.DateField(required=False, allow_null=True, default=None)
    justification = serializers.CharField(required=False, allow_blank=True, default="")
    document_reference = serializers.CharField(required=False, allow_blank=True, default="")
    dual_authorized_by = serializers.PrimaryKeyRelatedField(
        queryset=AppUser.objects.all(), required=False, allow_null=True
    )


# ---------------------------------------------------------------------------
# SF-6 — Enveloppe financière
# ---------------------------------------------------------------------------
from .models import (  # noqa: E402 (imports groupes en bas pour eviter circulaire)
    ComponentAllocation,
    FinancingSource,
    ProjectFinancialEnvelope,
    FINANCING_SOURCE_CHOICES,
    FINANCING_INSTRUMENT_CHOICES,
    COMPONENT_CHOICES,
)


class FinancingSourceSerializer(serializers.ModelSerializer):
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    instrument_display = serializers.CharField(source="get_instrument_display", read_only=True)
    donor_name = serializers.CharField(source="donor.short_name", read_only=True)
    currency_code = serializers.CharField(source="currency.code", read_only=True)

    class Meta:
        model = FinancingSource
        fields = [
            "id", "source", "source_display", "instrument", "instrument_display",
            "donor", "donor_name", "amount", "currency", "currency_code",
            "amount_usd", "exchange_rate_date", "label", "order",
        ]


class ComponentAllocationSerializer(serializers.ModelSerializer):
    component_display = serializers.CharField(source="get_component_display", read_only=True)

    class Meta:
        model = ComponentAllocation
        fields = ["id", "component", "component_display", "amount_usd"]


class ProjectFinancialEnvelopeSerializer(serializers.ModelSerializer):
    financing_sources = FinancingSourceSerializer(many=True, read_only=True)
    component_allocations = ComponentAllocationSerializer(many=True, read_only=True)
    total_amount_usd = serializers.DecimalField(
        max_digits=16, decimal_places=2, read_only=True
    )
    # Vocabulaires pour peupler les selects cote frontend
    source_choices = serializers.SerializerMethodField()
    instrument_choices = serializers.SerializerMethodField()
    component_choices = serializers.SerializerMethodField()

    class Meta:
        model = ProjectFinancialEnvelope
        fields = [
            "id", "project", "notes", "total_amount_usd",
            "financing_sources", "component_allocations",
            "source_choices", "instrument_choices", "component_choices",
            "created_at", "updated_at",
        ]

    def get_source_choices(self, obj):
        return [{"value": v, "label": l} for v, l in FINANCING_SOURCE_CHOICES]

    def get_instrument_choices(self, obj):
        return [{"value": v, "label": l} for v, l in FINANCING_INSTRUMENT_CHOICES]

    def get_component_choices(self, obj):
        return [{"value": v, "label": l} for v, l in COMPONENT_CHOICES]


# ---------------------------------------------------------------------------
# SF-6 — Enveloppe financière
# ---------------------------------------------------------------------------
from .models import (
    ComponentAllocation,
    FinancingSource,
    ProjectFinancialEnvelope,
    FINANCING_SOURCE_CHOICES,
    FINANCING_INSTRUMENT_CHOICES,
    COMPONENT_CHOICES,
)


class FinancingSourceSerializer(serializers.ModelSerializer):
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    instrument_display = serializers.CharField(source="get_instrument_display", read_only=True)
    donor_name = serializers.CharField(source="donor.short_name", read_only=True)
    currency_code = serializers.CharField(source="currency.code", read_only=True)

    class Meta:
        model = FinancingSource
        fields = [
            "id", "source", "source_display", "instrument", "instrument_display",
            "donor", "donor_name", "amount", "currency", "currency_code",
            "amount_usd", "exchange_rate_date", "label", "order",
        ]


class ComponentAllocationSerializer(serializers.ModelSerializer):
    component_display = serializers.CharField(source="get_component_display", read_only=True)

    class Meta:
        model = ComponentAllocation
        fields = ["id", "component", "component_display", "amount_usd"]


class ProjectFinancialEnvelopeSerializer(serializers.ModelSerializer):
    financing_sources = FinancingSourceSerializer(many=True, read_only=True)
    component_allocations = ComponentAllocationSerializer(many=True, read_only=True)
    total_amount_usd = serializers.DecimalField(
        max_digits=16, decimal_places=2, read_only=True
    )
    source_choices = serializers.SerializerMethodField()
    instrument_choices = serializers.SerializerMethodField()
    component_choices = serializers.SerializerMethodField()

    class Meta:
        model = ProjectFinancialEnvelope
        fields = [
            "id", "project", "notes", "total_amount_usd",
            "financing_sources", "component_allocations",
            "source_choices", "instrument_choices", "component_choices",
            "created_at", "updated_at",
        ]

    def get_source_choices(self, obj):
        return [{"value": v, "label": l} for v, l in FINANCING_SOURCE_CHOICES]

    def get_instrument_choices(self, obj):
        return [{"value": v, "label": l} for v, l in FINANCING_INSTRUMENT_CHOICES]

    def get_component_choices(self, obj):
        return [{"value": v, "label": l} for v, l in COMPONENT_CHOICES]


class ProjectImplementingPartnerSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True)
    agency_type = serializers.CharField(source="agency.get_agency_type_display", read_only=True)
    agency_country_iso2 = serializers.SerializerMethodField()
    agency_country_name = serializers.SerializerMethodField()
    agency_logo_url = serializers.SerializerMethodField()
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = ProjectImplementingPartner
        fields = [
            "id", "agency", "agency_name", "agency_type",
            "agency_country_iso2", "agency_country_name", "agency_logo_url",
            "role", "role_display", "allocated_amount_usd", "notes",
            "focal_point_name", "focal_point_email", "focal_point_phone",
            "order",
        ]

    def get_agency_country_iso2(self, obj):
        return obj.agency.country.iso2 if obj.agency and obj.agency.country else None

    def get_agency_country_name(self, obj):
        return obj.agency.country.name if obj.agency and obj.agency.country else None

    def get_agency_logo_url(self, obj):
        return obj.agency.logo_url if obj.agency else None


class ProjectGadmScopeSerializer(serializers.ModelSerializer):
    area_name  = serializers.CharField(source="area.name",      read_only=True)
    area_level = serializers.IntegerField(source="area.level",  read_only=True)
    area_uid   = serializers.CharField(source="area.gadm_uid",  read_only=True)
    parent_name = serializers.SerializerMethodField()
    parent_id   = serializers.SerializerMethodField()

    class Meta:
        from apps.project.models import ProjectGadmScope
        model = ProjectGadmScope
        fields = ["id", "area", "area_uid", "area_name", "area_level", "parent_name", "parent_id", "is_primary", "notes"]

    def get_parent_name(self, obj):
        return obj.area.parent.name if obj.area.parent else None

    def get_parent_id(self, obj):
        return obj.area.parent.id if obj.area.parent else None
