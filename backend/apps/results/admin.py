from django.contrib import admin

from .models import TheoryOfChange, ToCNode


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
    list_display = ["code", "toc", "chain_level", "statement"]
    list_filter = ["chain_level"]
    search_fields = ["statement", "code"]
