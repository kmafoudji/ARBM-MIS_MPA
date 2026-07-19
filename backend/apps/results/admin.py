from django.contrib import admin
from .models import Indicator, LogframeRow, LogframeTarget, TheoryOfChange, ToCNode


class LogframeTargetInline(admin.TabularInline):
    model = LogframeTarget
    extra = 0


@admin.register(Indicator)
class IndicatorAdmin(admin.ModelAdmin):
    list_display = ["code", "sector", "subsector", "name", "indicator_type", "unit", "is_active"]
    list_filter = ["sector", "indicator_type", "direction", "is_active"]
    search_fields = ["code", "name", "definition"]
    filter_horizontal = ["related_sdgs"]
    fieldsets = [
        ("Identification", {"fields": ["code", "sector", "subsector", "name", "indicator_type", "direction", "unit", "is_active"]}),
        ("Definition", {"fields": ["definition", "numerator", "denominator", "calculation_method", "formula"]}),
        ("Collecte et reporting", {"fields": ["disaggregation", "data_source", "collection_method", "reporting_frequency", "means_of_verification", "responsible"]}),
        ("Hypotheses et limites", {"fields": ["assumptions", "limitations"]}),
        ("ODD lies", {"fields": ["related_sdgs"]}),
    ]


@admin.register(LogframeRow)
class LogframeRowAdmin(admin.ModelAdmin):
    list_display = ["project", "indicator", "chain_level", "baseline_value", "baseline_year"]
    list_filter = ["chain_level", "project"]
    search_fields = ["project__name", "indicator__code", "indicator__name"]
    inlines = [LogframeTargetInline]


class ToCNodeInline(admin.TabularInline):
    model = ToCNode
    extra = 0
    readonly_fields = ["code"]


@admin.register(TheoryOfChange)
class TheoryOfChangeAdmin(admin.ModelAdmin):
    list_display = ["project", "status", "version", "updated_at"]
    list_filter = ["status"]
    search_fields = ["project__name", "project__code"]
    inlines = [ToCNodeInline]


@admin.register(ToCNode)
class ToCNodeAdmin(admin.ModelAdmin):
    list_display = ["code", "toc", "chain_level", "statement", "logframe_row"]
    list_filter = ["chain_level"]
    search_fields = ["statement", "code"]
