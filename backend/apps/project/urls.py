from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.results.views import TheoryOfChangeView, ToCNodeDetailView, ToCNodeListView

from .views import (
    ComponentAllocationView,
    FinancingSourceDetailView,
    FinancingSourceListView,
    ProjectFinancialEnvelopeView,
    ProjectPadView,
    ProjectReportingConfigView,
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
    path("projects/<int:pk>/toc/", TheoryOfChangeView.as_view(), name="project-toc"),
    path("projects/<int:pk>/toc/nodes/", ToCNodeListView.as_view(), name="project-toc-nodes"),
    path("projects/<int:pk>/toc/nodes/<int:node_pk>/",
         ToCNodeDetailView.as_view(), name="project-toc-node-detail"),
]
