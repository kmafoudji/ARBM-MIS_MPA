from django.urls import path
from .views import (
    IndicatorDetailView,
    IndicatorListView,
    LogframeChoicesView,
    LogframeRowDetailView,
    LogframeTargetDetailView,
    LogframeTargetListView,
    LogframeView,
    TheoryOfChangeView,
    ToCNodeDetailView,
    ToCNodeListView,
)

# Routes du catalogue (independantes du projet)
indicator_urlpatterns = [
    path("indicators/", IndicatorListView.as_view(), name="indicator-list"),
    path("indicators/<int:pk>/", IndicatorDetailView.as_view(), name="indicator-detail"),
]

# Routes imbriquees sous /api/projects/{pk}/
project_urlpatterns = [
    path("toc/", TheoryOfChangeView.as_view(), name="project-toc"),
    path("toc/nodes/", ToCNodeListView.as_view(), name="project-toc-nodes"),
    path("toc/nodes/<int:node_pk>/", ToCNodeDetailView.as_view(), name="project-toc-node-detail"),
    path("logframe/", LogframeView.as_view(), name="project-logframe"),
    path("logframe/choices/", LogframeChoicesView.as_view(), name="project-logframe-choices"),
    path("logframe/<int:row_pk>/", LogframeRowDetailView.as_view(), name="project-logframe-row"),
    path("logframe/<int:row_pk>/targets/", LogframeTargetListView.as_view(), name="project-logframe-targets"),
    path("logframe/<int:row_pk>/targets/<int:t_pk>/", LogframeTargetDetailView.as_view(), name="project-logframe-target-detail"),
]
