from django.core.exceptions import ValidationError
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError
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
from apps.identity.permissions import ReadOnlyOrHasModulePermission

from .services import check_transition_authorization, transition_stage


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

    # Lecture ouverte a tout compte authentifie ; ecriture soumise au RBAC.
    #
    # PORTEE : ce controle est module-large. Le filtrage par perimetre
    # (un PMU ne voit que ses projets, un hub que sa region) n'est pas
    # implemente — il releve du row-level security, encore absent. Tout
    # compte authentifie voit donc l'integralite du portefeuille.
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def get_serializer_class(self):
        if self.action == "create":
            return ProjectCreateSerializer
        if self.action == "list":
            return ProjectListSerializer
        return ProjectDetailSerializer

    def perform_create(self, serializer):
        """
        Enregistrer un projet, c'est le faire entrer a l'etape Concept Note :
        la meme regle SF-4 s'applique donc. Sans ce controle, un PMU Project
        Manager ou un Implementing Partner pourrait creer un projet — ils
        portent `create` sur m1_config_access — alors que le SFD reserve
        l'enregistrement au LLFMU Portfolio Analyst / aRBM Specialist.
        """
        try:
            check_transition_authorization(self.request.user, "concept_note")
        except ValidationError as exc:
            raise DRFValidationError({"detail": exc.messages})
        serializer.save()

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


# ---------------------------------------------------------------------------
# SF-6 — Enveloppe financière
# ---------------------------------------------------------------------------
from django.db import transaction as db_transaction

from .models import (
    ComponentAllocation,
    FinancingSource,
    ProjectFinancialEnvelope,
)
from .serializers import (
    ComponentAllocationSerializer,
    FinancingSourceSerializer,
    ProjectFinancialEnvelopeSerializer,
)


class ProjectFinancialEnvelopeView(APIView):
    """
    GET  /api/projects/{pk}/envelope/   — lit ou cree l'enveloppe
    PATCH /api/projects/{pk}/envelope/  — met a jour les notes
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_project(self, pk):
        from .models import Project
        return Project.objects.get(pk=pk)

    def get(self, request, pk):
        project = self._get_project(pk)
        envelope, _ = ProjectFinancialEnvelope.objects.get_or_create(project=project)
        return Response(ProjectFinancialEnvelopeSerializer(envelope).data)

    def patch(self, request, pk):
        project = self._get_project(pk)
        envelope, _ = ProjectFinancialEnvelope.objects.get_or_create(project=project)
        notes = request.data.get("notes", envelope.notes)
        envelope.notes = notes
        envelope.updated_by = request.user
        envelope.save(update_fields=["notes", "updated_by", "updated_at"])
        return Response(ProjectFinancialEnvelopeSerializer(envelope).data)


class FinancingSourceListView(APIView):
    """
    GET  /api/projects/{pk}/envelope/sources/   — liste des lignes
    POST /api/projects/{pk}/envelope/sources/   — ajouter une ligne
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_envelope(self, pk):
        from .models import Project
        project = Project.objects.get(pk=pk)
        envelope, _ = ProjectFinancialEnvelope.objects.get_or_create(
            project=project,
            defaults={"updated_by": None},
        )
        return envelope

    def get(self, request, pk):
        envelope = self._get_envelope(pk)
        return Response(
            FinancingSourceSerializer(envelope.financing_sources.all(), many=True).data
        )

    def post(self, request, pk):
        envelope = self._get_envelope(pk)
        serializer = FinancingSourceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(envelope=envelope)
        # Mettre a jour l'horodatage de l'enveloppe
        envelope.updated_by = request.user
        envelope.save(update_fields=["updated_by", "updated_at"])
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FinancingSourceDetailView(APIView):
    """
    PATCH  /api/projects/{pk}/envelope/sources/{src_pk}/
    DELETE /api/projects/{pk}/envelope/sources/{src_pk}/
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_source(self, pk, src_pk):
        from .models import Project
        project = Project.objects.get(pk=pk)
        return FinancingSource.objects.get(pk=src_pk, envelope__project=project)

    def patch(self, request, pk, src_pk):
        source = self._get_source(pk, src_pk)
        serializer = FinancingSourceSerializer(source, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        source.envelope.updated_by = request.user
        source.envelope.save(update_fields=["updated_by", "updated_at"])
        return Response(serializer.data)

    def delete(self, request, pk, src_pk):
        source = self._get_source(pk, src_pk)
        envelope = source.envelope
        source.delete()
        envelope.updated_by = request.user
        envelope.save(update_fields=["updated_by", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ComponentAllocationView(APIView):
    """
    GET  /api/projects/{pk}/envelope/allocations/
    POST /api/projects/{pk}/envelope/allocations/   — upsert par composante
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def _get_envelope(self, pk):
        from .models import Project
        project = Project.objects.get(pk=pk)
        envelope, _ = ProjectFinancialEnvelope.objects.get_or_create(project=project)
        return envelope

    def get(self, request, pk):
        envelope = self._get_envelope(pk)
        return Response(
            ComponentAllocationSerializer(
                envelope.component_allocations.all(), many=True
            ).data
        )

    @db_transaction.atomic
    def post(self, request, pk):
        """
        Upsert d'une allocation. Cree la ligne si elle n'existe pas,
        la met a jour sinon (unique_together envelope x component).
        """
        envelope = self._get_envelope(pk)
        component = request.data.get("component")
        amount_usd = request.data.get("amount_usd")
        if not component or amount_usd is None:
            return Response(
                {"detail": "Les champs `component` et `amount_usd` sont requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        alloc, _ = ComponentAllocation.objects.update_or_create(
            envelope=envelope,
            component=component,
            defaults={"amount_usd": amount_usd},
        )
        envelope.updated_by = request.user
        envelope.save(update_fields=["updated_by", "updated_at"])
        return Response(ComponentAllocationSerializer(alloc).data, status=status.HTTP_200_OK)
