from django.urls import path
from .views import (
    DQScoreView,
    DQPortfolioView,
    IndicatorChoicesView,
    IndicatorDetailView,
    IndicatorDisaggregationView,
    IndicatorDisaggregationDetailView,
    IndicatorListView,
    LogframeChoicesView,
    LogframeRowDetailView,
    LogframeTargetDetailView,
    LogframeTargetListView,
    LogframeView,
    PIRSDataView,
    PortfolioAggregationView,
    ResultsDataView,
    ResultsDataDetailView,
    ResultsSummaryView,
    DisaggregationValueView,
    TargetRevisionView,
    TargetRevisionActionView,
    TheoryOfChangeView,
    ToCNodeDetailView,
    ToCNodeListView,
    ToCNodeCrossPathwayView,
)

# Routes catalogue (indépendantes du projet)
indicator_urlpatterns = [
    path("indicators/",          IndicatorListView.as_view(),    name="indicator-list"),
    path("indicators/choices/",  IndicatorChoicesView.as_view(), name="indicator-choices"),
    path("indicators/<int:pk>/", IndicatorDetailView.as_view(),  name="indicator-detail"),
    # SF-6 : dimensions de désagrégation par indicateur
    path("indicators/<int:ind_pk>/disaggregations/",             IndicatorDisaggregationView.as_view(),       name="indicator-disaggregations"),
    path("indicators/<int:ind_pk>/disaggregations/<int:dim_pk>/",IndicatorDisaggregationDetailView.as_view(), name="indicator-disaggregation-detail"),
    # SF-4 : agrégation portefeuille
    path("portfolio/",           PortfolioAggregationView.as_view(), name="portfolio-aggregation"),
    # SF-9 : DQ Score portefeuille
    path("dq-portfolio/",        DQPortfolioView.as_view(),          name="dq-portfolio"),
]

# Routes imbriquées sous /api/projects/{pk}/
project_urlpatterns = [
    # ToC
    path("toc/",                                     TheoryOfChangeView.as_view(),       name="project-toc"),
    path("toc/nodes/",                               ToCNodeListView.as_view(),           name="project-toc-nodes"),
    path("toc/nodes/<int:node_pk>/",                 ToCNodeDetailView.as_view(),         name="project-toc-node-detail"),
    # SF-2 : liaisons cross-pathway
    path("toc/nodes/<int:node_pk>/cross-pathways/",                    ToCNodeCrossPathwayView.as_view(), name="project-toc-node-cross-pathways"),
    path("toc/nodes/<int:node_pk>/cross-pathways/<int:target_pk>/",    ToCNodeCrossPathwayView.as_view(), name="project-toc-node-cross-pathway-detail"),
    # Logframe
    path("logframe/",                                LogframeView.as_view(),              name="project-logframe"),
    path("logframe/choices/",                        LogframeChoicesView.as_view(),        name="project-logframe-choices"),
    path("logframe/<int:row_pk>/",                   LogframeRowDetailView.as_view(),      name="project-logframe-row"),
    path("logframe/<int:row_pk>/targets/",           LogframeTargetListView.as_view(),     name="project-logframe-targets"),
    path("logframe/<int:row_pk>/targets/<int:t_pk>/",LogframeTargetDetailView.as_view(),  name="project-logframe-target-detail"),
    # SF-3 : révision auditable
    path("logframe/<int:row_pk>/targets/<int:t_pk>/revise/",                          TargetRevisionView.as_view(),       name="project-target-revise"),
    path("logframe/<int:row_pk>/targets/<int:t_pk>/revisions/",                       TargetRevisionView.as_view(),       name="project-target-revisions"),
    path("logframe/<int:row_pk>/targets/<int:t_pk>/revisions/<int:rev_pk>/action/",   TargetRevisionActionView.as_view(), name="project-target-revision-action"),
    # SF-4 / SF-5 : saisie des valeurs réelles + RAG
    path("results/",                  ResultsDataView.as_view(),       name="project-results"),
    path("results/summary/",          ResultsSummaryView.as_view(),    name="project-results-summary"),
    path("results/<int:rd_pk>/",      ResultsDataDetailView.as_view(), name="project-results-detail"),
    # SF-7 : PIRS par indicateur
    path("logframe/<int:row_pk>/pirs/",     PIRSDataView.as_view(),  name="project-pirs"),
    # SF-9 : DQ Score par indicateur
    path("logframe/<int:row_pk>/dq-score/", DQScoreView.as_view(),   name="project-dq-score"),
    # SF-6 : désagrégation par ResultsData
    path("results/<int:rd_pk>/disaggregation/", DisaggregationValueView.as_view(), name="project-results-disaggregation"),
]
