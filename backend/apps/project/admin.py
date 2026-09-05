from django.contrib import admin

from .models import Project, ProjectCountry, ProjectSdg, ProjectSector, ProjectStageTransition


class ProjectCountryInline(admin.TabularInline):
    model = ProjectCountry
    extra = 1


class ProjectSdgInline(admin.TabularInline):
    model = ProjectSdg
    extra = 1


class ProjectSectorInline(admin.TabularInline):
    model = ProjectSector
    extra = 1


class ProjectStageTransitionInline(admin.TabularInline):
    model = ProjectStageTransition
    extra = 0
    readonly_fields = (
        "from_stage", "to_stage", "transitioned_by", "transitioned_at",
        "justification", "document_reference", "dual_authorized_by",
    )
    can_delete = False
    max_num = 0  # lecture seule : les transitions passent par le service, pas l'admin


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "primary_sector", "lifecycle_stage", "created_by")
    list_filter = ("lifecycle_stage", "primary_sector", "fragility_status", "risk_rating")
    search_fields = ("code", "name", "official_reference_number")
    inlines = [ProjectCountryInline, ProjectSectorInline, ProjectSdgInline, ProjectStageTransitionInline]
    fieldsets = (
        ("Identite de base (SF-1 Etape 1)", {
            "fields": (
                "name", "code", "official_reference_number", "investment_cycle",
                "pad_reference_file",
                "lifecycle_stage",
            )
        }),
        ("Classification (SF-2)", {
            "fields": (
                "primary_sector", "primary_sdg", "gender_marker",
                "rio_marker_mitigation", "rio_marker_adaptation",
                "rio_marker_biodiversity", "rio_marker_desertification",
                "cross_cutting_themes", "implementation_modality",
                "beneficiary_target_direct", "beneficiary_target_indirect",
                "geographic_typology", "fragility_status", "risk_rating",
            )
        }),
        ("Portefeuille", {
            "fields": ("hub", "donors", "budget_amount", "currency"),
        }),
        ("Cycle de vie (SF-1 Etape 3)", {
            "fields": ("start_date", "end_date"),
        }),
        ("Metadonnees", {
            "fields": ("created_by", "created_at", "updated_at"),
        }),
    )
    readonly_fields = ("created_at", "updated_at")
    filter_horizontal = ("donors", "cross_cutting_themes")


@admin.register(ProjectStageTransition)
class ProjectStageTransitionAdmin(admin.ModelAdmin):
    list_display = ("project", "from_stage", "to_stage", "transitioned_by", "transitioned_at")
    list_filter = ("from_stage", "to_stage")
    readonly_fields = [f.name for f in ProjectStageTransition._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
