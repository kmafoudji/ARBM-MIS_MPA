from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.results.urls import project_urlpatterns as results_project_urls
from apps.results.views import TheoryOfChangeView, ToCNodeDetailView, ToCNodeListView

from .views import (
    ComponentAllocationView,
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

urlpatterns = router.urls + [
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
    path("projects/<int:pk>/partners/",
         ProjectImplementingPartnerListView.as_view(), name="project-partners"),
    path("projects/<int:pk>/partners/<int:partner_pk>/",
         ProjectImplementingPartnerDetailView.as_view(), name="project-partner-detail"),
] + [
    path(f"projects/<int:pk>/{pattern.pattern}", pattern.callback, name=pattern.name)
    for pattern in results_project_urls
]
