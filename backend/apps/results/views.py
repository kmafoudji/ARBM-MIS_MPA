from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import ReadOnlyOrHasModulePermission
from apps.project.models import Project

from .models import Indicator, LogframeRow, LogframeTarget, TheoryOfChange, ToCNode
from .serializers import (
    IndicatorDetailSerializer,
    IndicatorListSerializer,
    LogframeRowCreateSerializer,
    LogframeRowSerializer,
    LogframeTargetCreateSerializer,
    LogframeTargetSerializer,
    TheoryOfChangeSerializer,
    TheoryOfChangeUpdateSerializer,
    ToCNodeCreateSerializer,
    ToCNodeSerializer,
    ToCNodeUpdateSerializer,
    get_logframe_choices,
)
from .services import create_toc_node


# ---------------------------------------------------------------------------
# Catalogue indicateurs (lecture seule pour les non-LLFMU)
# ---------------------------------------------------------------------------

class IndicatorListView(APIView):
    """GET /api/results/indicators/ — liste du catalogue."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Indicator.objects.filter(is_active=True).select_related("sector")
        sector = request.query_params.get("sector")
        if sector:
            qs = qs.filter(sector_id=sector)
        indicator_type = request.query_params.get("type")
        if indicator_type:
            qs = qs.filter(indicator_type=indicator_type)
        search = request.query_params.get("q")
        if search:
            qs = qs.filter(name__icontains=search) | qs.filter(code__icontains=search)
        return Response(IndicatorListSerializer(qs, many=True).data)


# Valeurs normalisees extraites du handbook Agriculture (doublons fusionnes,
# points finaux supprimes). Health et Infra viendront completer ces listes.
UNIT_CHOICES = [
    "Hectares",
    "Kilometres (km)",
    "Litres",
    "Metric tons (MT)",
    "Number",
    "Number of beneficiaries",
    "Number of biogas systems",
    "Number of drying floors",
    "Number of farmer associations",
    "Number of farmer cooperatives",
    "Number of farmers",
    "Number of female beneficiaries",
    "Number of female farmers",
    "Number of female individuals",
    "Number of female jobs",
    "Number of financial instruments",
    "Number of financing facilities",
    "Number of groups",
    "Number of individuals",
    "Number of jobs",
    "Number of people",
    "Number of training sessions",
    "Number of warehouses",
    "Number of women",
    "Number of youth",
    "Percentage (%)",
    "Other",
]

DISAGGREGATION_CHOICES = [
    "Not applicable",
    "Sex (Male/Female)",
    "Sex (Male/Female) and by age group",
    "Sex (Male/Female) and by type",
    "By region / geographic area",
    "By beneficiary category",
    "Other",
]

RESPONSIBLE_CHOICES = [
    "Project Manager and M&E Unit",
    "M&E Manager and Agricultural Specialist",
    "Extension officers and Project Manager",
    "N/A",
    "Other",
]


class IndicatorChoicesView(APIView):
    """GET /api/results/indicator-choices/ — listes deroulantes normalisees."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "units": UNIT_CHOICES,
            "disaggregations": DISAGGREGATION_CHOICES,
            "responsibles": RESPONSIBLE_CHOICES,
        })


class IndicatorDetailView(APIView):
    """GET /api/results/indicators/{id}/ — fiche IRS complete.
    PATCH /api/results/indicators/{id}/ — mise a jour (LLFMU uniquement)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        ind = Indicator.objects.prefetch_related("related_sdgs").get(pk=pk)
        return Response(IndicatorDetailSerializer(ind).data)

    def patch(self, request, pk):
        ind = Indicator.objects.prefetch_related("related_sdgs").get(pk=pk)
        # Champs editables directement via le serializer de detail
        editable = [
            "code", "subsector", "name", "indicator_type", "direction",
            "definition", "unit", "numerator", "denominator",
            "calculation_method", "formula", "disaggregation",
            "data_source", "collection_method", "reporting_frequency",
            "means_of_verification", "responsible",
            "assumptions", "limitations", "is_active",
        ]
        data = {k: v for k, v in request.data.items() if k in editable}
        for field, value in data.items():
            setattr(ind, field, value)
        ind.save()
        # Rechargement propre pour renvoyer la fiche complete
        ind.refresh_from_db()
        return Response(IndicatorDetailSerializer(ind).data)


# ---------------------------------------------------------------------------
# Logframe par projet
# ---------------------------------------------------------------------------

class LogframeView(APIView):
    """
    GET  /api/projects/{pk}/logframe/          — liste des lignes
    POST /api/projects/{pk}/logframe/          — ajouter une ligne
    GET  /api/projects/{pk}/logframe/choices/  — vocabulaires pour les selects
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def get(self, request, pk):
        project = Project.objects.get(pk=pk)
        qs = (
            project.logframe_rows
            .select_related("indicator", "indicator__sector")
            .prefetch_related("targets", "toc_nodes")
            .order_by("chain_level", "order", "id")
        )
        return Response(LogframeRowSerializer(qs, many=True).data)

    def post(self, request, pk):
        project = Project.objects.get(pk=pk)
        serializer = LogframeRowCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = serializer.save(project=project)
        return Response(
            LogframeRowSerializer(row).data,
            status=status.HTTP_201_CREATED,
        )


class LogframeChoicesView(APIView):
    """GET /api/projects/{pk}/logframe/choices/"""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(get_logframe_choices())


class LogframeRowDetailView(APIView):
    """
    GET    /api/projects/{pk}/logframe/{row_pk}/
    PATCH  /api/projects/{pk}/logframe/{row_pk}/
    DELETE /api/projects/{pk}/logframe/{row_pk}/
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_row(self, pk, row_pk):
        return LogframeRow.objects.select_related(
            "indicator", "indicator__sector"
        ).prefetch_related("targets", "toc_nodes").get(pk=row_pk, project_id=pk)

    def get(self, request, pk, row_pk):
        return Response(LogframeRowSerializer(self._get_row(pk, row_pk)).data)

    def patch(self, request, pk, row_pk):
        row = self._get_row(pk, row_pk)
        serializer = LogframeRowCreateSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(LogframeRowSerializer(row).data)

    def delete(self, request, pk, row_pk):
        self._get_row(pk, row_pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LogframeTargetListView(APIView):
    """
    POST /api/projects/{pk}/logframe/{row_pk}/targets/
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def post(self, request, pk, row_pk):
        row = LogframeRow.objects.get(pk=row_pk, project_id=pk)
        serializer = LogframeTargetCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = serializer.save(logframe_row=row)
        return Response(LogframeTargetSerializer(target).data, status=status.HTTP_201_CREATED)


class LogframeTargetDetailView(APIView):
    """
    PATCH  /api/projects/{pk}/logframe/{row_pk}/targets/{t_pk}/
    DELETE /api/projects/{pk}/logframe/{row_pk}/targets/{t_pk}/
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_target(self, pk, row_pk, t_pk):
        return LogframeTarget.objects.get(pk=t_pk, logframe_row_id=row_pk, logframe_row__project_id=pk)

    def patch(self, request, pk, row_pk, t_pk):
        target = self._get_target(pk, row_pk, t_pk)
        serializer = LogframeTargetCreateSerializer(target, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(LogframeTargetSerializer(target).data)

    def delete(self, request, pk, row_pk, t_pk):
        self._get_target(pk, row_pk, t_pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# ToC (inchange, plus les nouveaux endpoints noeud ↔ logframe_row)
# ---------------------------------------------------------------------------

class TheoryOfChangeView(APIView):
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_toc(self, pk):
        project = Project.objects.get(pk=pk)
        toc, _ = TheoryOfChange.objects.get_or_create(project=project)
        return toc

    def get(self, request, pk):
        return Response(TheoryOfChangeSerializer(self._get_toc(pk)).data)

    def patch(self, request, pk):
        toc = self._get_toc(pk)
        serializer = TheoryOfChangeUpdateSerializer(toc, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(TheoryOfChangeSerializer(toc).data)


class ToCNodeListView(APIView):
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def post(self, request, pk):
        project = Project.objects.get(pk=pk)
        toc, _ = TheoryOfChange.objects.get_or_create(project=project)
        serializer = ToCNodeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        chain_level = data.pop("chain_level")
        parent = data.pop("parent", None)

        # Valider que le logframe_row appartient au meme projet
        logframe_row = data.get("logframe_row")
        if logframe_row and logframe_row.project_id != project.id:
            raise DRFValidationError({"detail": ["Cette ligne logframe n'appartient pas a ce projet."]})

        try:
            node = create_toc_node(toc, chain_level, parent.id if parent else None, **data)
        except ValidationError as exc:
            raise DRFValidationError({"detail": exc.messages if hasattr(exc, "messages") else [str(exc)]})

        return Response(ToCNodeSerializer(node).data, status=status.HTTP_201_CREATED)


class ToCNodeDetailView(APIView):
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_node(self, pk, node_pk):
        return ToCNode.objects.select_related("logframe_row__indicator").get(
            pk=node_pk, toc__project_id=pk
        )

    def patch(self, request, pk, node_pk):
        node = self._get_node(pk, node_pk)
        serializer = ToCNodeUpdateSerializer(node, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        # Valider que le logframe_row (si fourni) appartient au meme projet
        lr = serializer.validated_data.get("logframe_row")
        if lr and lr.project_id != int(pk):
            raise DRFValidationError({"detail": ["Cette ligne logframe n'appartient pas a ce projet."]})
        serializer.save()
        return Response(ToCNodeSerializer(node).data)

    def delete(self, request, pk, node_pk):
        self._get_node(pk, node_pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
