from django.urls import path
from .views import (
    ActivityDependencyDetailView,
    ActivityDependencyView,
    ActivityDetailView,
    ActivityListView,
    ActivityProgressView,
    DelayLogApprovalView,
    DelayLogListView,
    MilestoneDetailView,
    MilestoneListView,
    SPISnapshotView,
    WorkplanAlertDetailView,
    WorkplanAlertListView,
    WorkplanAlertRunView,
    WorkplanChoicesView,
    WorkplanComponentDetailView,
    WorkplanComponentListView,
    WorkplanDelayLogListView,
    WorkplanOutputNodesView,
    WorkplanSubComponentDetailView,
    WorkplanSubComponentListView,
    WorkplanSummaryView,
    WorkplanView,
)

# Toutes ces routes sont imbriquées sous /api/projects/{pk}/ dans project/urls.py
workplan_project_urlpatterns = [

    # Vue d'ensemble & résumé
    path("workplan/",                   WorkplanView.as_view(),        name="project-workplan"),
    path("workplan/summary/",           WorkplanSummaryView.as_view(), name="project-workplan-summary"),
    path("workplan/choices/",           WorkplanChoicesView.as_view(), name="project-workplan-choices"),

    # SF-2 — Output nodes disponibles pour liaison
    path("workplan/output-nodes/",      WorkplanOutputNodesView.as_view(), name="project-workplan-output-nodes"),

    # SF-1 — Composants
    path("workplan/components/",
         WorkplanComponentListView.as_view(),   name="project-workplan-components"),
    path("workplan/components/<int:c_pk>/",
         WorkplanComponentDetailView.as_view(), name="project-workplan-component-detail"),

    # SF-1 — Sous-composants
    path("workplan/components/<int:c_pk>/subcomponents/",
         WorkplanSubComponentListView.as_view(),   name="project-workplan-subcomponents"),
    path("workplan/components/<int:c_pk>/subcomponents/<int:s_pk>/",
         WorkplanSubComponentDetailView.as_view(), name="project-workplan-subcomponent-detail"),

    # SF-1 / SF-4 — Activités
    path("workplan/activities/",
         ActivityListView.as_view(),   name="project-workplan-activities"),
    path("workplan/activities/<int:a_pk>/",
         ActivityDetailView.as_view(), name="project-workplan-activity-detail"),
    path("workplan/activities/<int:a_pk>/progress/",
         ActivityProgressView.as_view(), name="project-workplan-activity-progress"),

    # SF-1 — Dépendances (RG-1.1 · BRQ-3.03)
    path("workplan/activities/<int:a_pk>/dependencies/",
         ActivityDependencyView.as_view(),       name="project-workplan-activity-dependencies"),
    path("workplan/activities/<int:a_pk>/dependencies/<int:d_pk>/",
         ActivityDependencyDetailView.as_view(), name="project-workplan-activity-dependency-detail"),

    # SF-5 — Jalons
    path("workplan/activities/<int:a_pk>/milestones/",
         MilestoneListView.as_view(),   name="project-workplan-activity-milestones"),
    path("workplan/activities/<int:a_pk>/milestones/<int:m_pk>/",
         MilestoneDetailView.as_view(), name="project-workplan-activity-milestone-detail"),

    # SF-7 — DelayLog
    path("workplan/delays/",
         WorkplanDelayLogListView.as_view(), name="project-workplan-delays"),
    path("workplan/activities/<int:a_pk>/delays/",
         DelayLogListView.as_view(), name="project-workplan-activity-delays"),
    path("workplan/activities/<int:a_pk>/delays/<int:d_pk>/<str:action>/",
         DelayLogApprovalView.as_view(), name="project-workplan-activity-delay-action"),

    # SF-8 — SPI
    path("workplan/spi/",
         SPISnapshotView.as_view(), name="project-workplan-spi"),

    # SF-6 — Alertes
    path("workplan/alerts/",
         WorkplanAlertListView.as_view(), name="project-workplan-alerts"),
    path("workplan/alerts/run/",
         WorkplanAlertRunView.as_view(), name="project-workplan-alerts-run"),
    path("workplan/alerts/<int:a_pk>/<str:action>/",
         WorkplanAlertDetailView.as_view(), name="project-workplan-alert-action"),
]
