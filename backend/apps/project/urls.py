from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.results.urls import project_urlpatterns as results_project_urls
from apps.workplan.urls import workplan_project_urlpatterns
from apps.results.views import TheoryOfChangeView, ToCNodeDetailView, ToCNodeListView

from .views import (
    ComponentAllocationView,
    ProjectBasicUpdateView,
    ProjectGadmScopeView,
    ProjectGeoJSONView,
    ProjectMapPointsView,
    ReportingPeriodView,
    ReportingPeriodDetailView,
    ReportingPeriodRefreshView,
    ReportingPeriodResetView,
    ProjectWorkspaceView,
    ProjectStageTransitionDetailView,
    FinancingSourceDetailView,
    FinancingSourceListView,
    ProjectDatesView,
    ProjectFinancialEnvelopeView,
    ProjectImplementingPartnerDetailView,
    ProjectImplementingPartnerListView,
    ProjectPadView,
    ProjectReportingConfigView,
    ProjectStatsView,
    ProjectViewSet,
)

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")

urlpatterns = [
    # Avant router.urls : la route detail du routeur (projects/<pk>/, regex
    # [^/.]+) capturerait le segment litteral "map".
    path("projects/map/", ProjectMapPointsView.as_view(), name="project-map-points"),
] + router.urls + [
    path("projects/<int:pk>/envelope/",
         ProjectFinancialEnvelopeView.as_view(), name="project-envelope"),
    path("projects/<int:pk>/envelope/sources/",
         FinancingSourceListView.as_view(), name="project-envelope-sources"),
    path("projects/<int:pk>/envelope/sources/<int:src_pk>/",
         FinancingSourceDetailView.as_view(), name="project-envelope-source-detail"),
    path("projects/<int:pk>/envelope/allocations/",
         ComponentAllocationView.as_view(), name="project-envelope-allocations"),
    path("projects/<int:pk>/pad/", ProjectPadView.as_view(), name="project-pad"),
    path("projects/<int:pk>/reporting-config/",
         ProjectReportingConfigView.as_view(), name="project-reporting-config"),
    path("projects/<int:pk>/dates/", ProjectDatesView.as_view(), name="project-dates"),
    path("projects/stats/", ProjectStatsView.as_view(), name="project-stats"),
    path("projects/<int:pk>/basic/", ProjectBasicUpdateView.as_view(), name="project-basic-update"),
    path("projects/<int:pk>/gadm-scope/", ProjectGadmScopeView.as_view(), name="project-gadm-scope"),
    path("projects/<int:pk>/gadm-scope/<int:area_pk>/", ProjectGadmScopeView.as_view(), name="project-gadm-scope-detail"),
    path("projects/<int:pk>/geojson/", ProjectGeoJSONView.as_view(), name="project-geojson"),
    path("projects/<int:pk>/reporting-periods/", ReportingPeriodView.as_view(), name="project-reporting-periods"),
    path("projects/<int:pk>/reporting-periods/generate/", ReportingPeriodView.as_view(), name="project-reporting-periods-generate"),
    path("projects/<int:pk>/workspace/", ProjectWorkspaceView.as_view(), name="project-workspace"),
    path("projects/<int:pk>/reporting-periods/reset/", ReportingPeriodResetView.as_view(), name="project-reporting-periods-reset"),
    path("projects/<int:pk>/reporting-periods/refresh/", ReportingPeriodRefreshView.as_view(), name="project-reporting-periods-refresh"),
    path("projects/<int:pk>/reporting-periods/<int:p_pk>/", ReportingPeriodDetailView.as_view(), name="project-reporting-period-detail"),
    path("projects/<int:pk>/partners/",
         ProjectImplementingPartnerListView.as_view(), name="project-partners"),
    path("projects/<int:pk>/partners/<int:partner_pk>/",
         ProjectImplementingPartnerDetailView.as_view(), name="project-partner-detail"),
    path("projects/<int:pk>/transitions/<int:t_pk>/",
         ProjectStageTransitionDetailView.as_view(), name="project-transition-detail"),
] + [
    path(f"projects/<int:pk>/{pattern.pattern}", pattern.callback, name=pattern.name)
    for pattern in results_project_urls
] + [
    path(f"projects/<int:pk>/{pattern.pattern}", pattern.callback, name=pattern.name)
    for pattern in workplan_project_urlpatterns
]
