from django.contrib import admin
from .models import (
    WorkplanComponent, WorkplanSubComponent,
    Activity, ActivityDependency,
    Milestone, DelayLog, SPISnapshot,
)


class WorkplanSubComponentInline(admin.TabularInline):
    model = WorkplanSubComponent
    extra = 0
    fields = ("code", "name", "order", "is_active")


class ActivityInline(admin.TabularInline):
    model = Activity
    extra = 0
    fields = ("code", "name", "status", "progress", "planned_start", "planned_end", "is_active")


@admin.register(WorkplanComponent)
class WorkplanComponentAdmin(admin.ModelAdmin):
    list_display  = ("code", "name", "project", "order", "is_active")
    list_filter   = ("project", "is_active")
    search_fields = ("code", "name", "project__official_reference_number")
    inlines       = [WorkplanSubComponentInline]


@admin.register(WorkplanSubComponent)
class WorkplanSubComponentAdmin(admin.ModelAdmin):
    list_display  = ("code", "name", "component", "order", "is_active")
    list_filter   = ("component__project", "is_active")
    search_fields = ("code", "name")
    inlines       = [ActivityInline]


class MilestoneInline(admin.TabularInline):
    model  = Milestone
    extra  = 0
    fields = ("name", "category", "planned_date", "status", "is_gate")


class DelayLogInline(admin.TabularInline):
    model  = DelayLog
    extra  = 0
    fields = ("delay_category", "variance_days", "revised_end", "approval_status")
    readonly_fields = ("created_at",)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display  = (
        "code", "name", "sub_component", "status", "progress",
        "planned_start", "planned_end", "revised_end", "is_overdue", "is_active",
    )
    list_filter   = ("status", "is_critical_path", "requires_evidence", "is_active")
    search_fields = ("code", "name", "sub_component__component__project__official_reference_number")
    readonly_fields = ("baseline_start", "baseline_end", "created_at", "updated_at")
    inlines       = [MilestoneInline, DelayLogInline]

    @admin.display(boolean=True, description="Overdue")
    def is_overdue(self, obj):
        return obj.is_overdue


@admin.register(ActivityDependency)
class ActivityDependencyAdmin(admin.ModelAdmin):
    list_display  = ("predecessor", "dep_type", "lag_days", "successor")
    list_filter   = ("dep_type",)


@admin.register(Milestone)
class MilestoneAdmin(admin.ModelAdmin):
    list_display  = ("name", "activity", "category", "planned_date", "status", "is_gate")
    list_filter   = ("category", "status", "is_gate", "is_procurement")
    search_fields = ("name", "activity__code")


@admin.register(DelayLog)
class DelayLogAdmin(admin.ModelAdmin):
    list_display  = (
        "activity", "delay_category", "variance_days",
        "previous_end", "revised_end", "approval_status", "created_at",
    )
    list_filter   = ("delay_category", "approval_status")
    readonly_fields = ("created_at",)


@admin.register(SPISnapshot)
class SPISnapshotAdmin(admin.ModelAdmin):
    list_display  = ("level", "project", "activity", "spi", "snapshot_date")
    list_filter   = ("level", "snapshot_date")
