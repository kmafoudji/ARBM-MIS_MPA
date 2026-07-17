from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ComponentAllocationView,
    FinancingSourceDetailView,
    FinancingSourceListView,
    ProjectFinancialEnvelopeView,
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
]
