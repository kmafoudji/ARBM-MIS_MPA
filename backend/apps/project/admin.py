from django.contrib import admin

from .models import Project, ProjectSdg


class ProjectSdgInline(admin.TabularInline):
    model = ProjectSdg
    extra = 1


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "country", "sector", "status", "created_by")
    list_filter = ("status", "country", "sector")
    inlines = [ProjectSdgInline]
