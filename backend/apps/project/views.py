from django.core.exceptions import ValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import LIFECYCLE_STAGE_CHOICES, Project
from .serializers import (
    ProjectCreateSerializer,
    ProjectDetailSerializer,
    ProjectListSerializer,
    ProjectStageTransitionSerializer,
    StageTransitionRequestSerializer,
)
from .services import transition_stage


class ProjectViewSet(viewsets.ModelViewSet):
    """
    SF-1 (assistant d'enregistrement) — v1 expose la creation minimale
    (Etape 1, sous-ensemble Concept Note), la consultation, et les
    transitions d'etape (SF-4). Les etapes 2/5 (ToC, reporting) seront
    exposees via des endpoints dedies au fur et a mesure.
    """

    queryset = Project.objects.select_related(
        "primary_sector", "primary_sdg", "created_by"
    ).prefetch_related("project_countries__country", "contributing_sectors", "contributing_sdgs").all()
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return ProjectCreateSerializer
        if self.action == "list":
            return ProjectListSerializer
        return ProjectDetailSerializer

    @action(detail=False, methods=["get"], url_path="stage-choices")
    def stage_choices(self, request):
        """Liste des 13+2 etapes du cycle de vie (SF-4), pour peupler un select."""
        return Response([{"value": v, "label": l} for v, l in LIFECYCLE_STAGE_CHOICES])

    @action(detail=True, methods=["get", "post"])
    def transitions(self, request, pk=None):
        project = self.get_object()

        if request.method == "GET":
            qs = project.stage_transitions.select_related("transitioned_by", "dual_authorized_by")
            return Response(ProjectStageTransitionSerializer(qs, many=True).data)

        # POST : declencher une nouvelle transition (SF-4)
        req_serializer = StageTransitionRequestSerializer(data=request.data)
        req_serializer.is_valid(raise_exception=True)
        data = req_serializer.validated_data

        try:
            transition_stage(
                project=project,
                to_stage=data["to_stage"],
                actor=request.user,
                justification=data.get("justification", ""),
                dual_authorized_by=data.get("dual_authorized_by"),
                document_reference=data.get("document_reference", ""),
            )
        except ValidationError as exc:
            return Response({"detail": exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        return Response(ProjectDetailSerializer(project).data, status=status.HTTP_200_OK)
