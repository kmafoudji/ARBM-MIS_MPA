from django.core.exceptions import ValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import LIFECYCLE_STAGE_CHOICES, Project
from .serializers import (
    ProjectClassificationUpdateSerializer,
    ProjectCreateSerializer,
    ProjectDetailSerializer,
    ProjectListSerializer,
    ProjectStageTransitionSerializer,
    StageTransitionRequestSerializer,
)
from apps.identity.permissions import ReadOnlyOrHasModulePermission
from core.scope import ProjectInScope

from .services import check_transition_authorization, transition_stage


class ProjectViewSet(viewsets.ModelViewSet):
    """
    SF-1 (assistant d'enregistrement) — v1 expose la creation minimale
    (Etape 1, sous-ensemble Concept Note), la consultation, et les
    transitions d'etape (SF-4). Les etapes 2/5 (ToC, reporting) seront
    exposees via des endpoints dedies au fur et a mesure.
    """

    # Lecture ouverte a tout compte authentifie ; ecriture soumise au RBAC.
    #
    # PORTEE : le filtrage par perimetre (row-level security) est applique
    # dans get_queryset() via Project.objects.in_scope() — un PMU ne voit que
    # ses projets, un membre de hub que sa region, un role global tout le
    # portefeuille (voir core/scope.py). Un projet hors perimetre repond 404.
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module = "m1_config_access"

    def get_queryset(self):
        return (
            Project.objects.in_scope(self.request)
            .select_related("primary_sector__parent", "created_by")
            .prefetch_related(
                "project_countries__country", "contributing_sectors", "sdgs",
                "stage_transitions",
            )
        )

    def perform_destroy(self, instance):
        # Suppression physique et irreversible : toutes les tables liees au
        # projet (pays, transitions, cadre logique, resultats, workplan...)
        # sont en on_delete=CASCADE. Les FileField ne sont pas couverts par la
        # cascade : PAD et couches GIS sont retires du stockage explicitement,
        # sans quoi ils resteraient orphelins sur Blob Storage.
        with transaction.atomic():
            if instance.pad_reference_file:
                instance.pad_reference_file.delete(save=False)
            for asset in instance.spatial_assets.all():
                if asset.original_file:
                    asset.original_file.delete(save=False)
            instance.delete()

    def get_serializer_class(self):
        if self.action == "create":
            return ProjectCreateSerializer
        if self.action == "list":
            return ProjectListSerializer
        if self.action in ("update", "partial_update"):
            return ProjectClassificationUpdateSerializer
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
            check_transition_authorization(self.request.user, "LS001")  # Concept Note
        except ValidationError as exc:
            raise DRFValidationError({"detail": exc.messages})
        serializer.save()

    def update(self, request, *args, **kwargs):
        """
        PATCH sert aujourd'hui exclusivement l'edition de la classification
        SF-2 (nom, pays, budget n'ont pas encore de formulaire d'edition
        dedie). La reponse renvoie toujours la fiche complete, pas seulement
        les champs modifies.
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except ValidationError as exc:
            raise DRFValidationError({"detail": exc.messages})
        # Re-read through the queryset: get_object() prefetched the M2M
        # relations before the services rewrote them, and the stale cache
        # would otherwise be serialised back.
        instance = self.get_queryset().get(pk=instance.pk)
        return Response(ProjectDetailSerializer(instance).data)

    @action(detail=False, methods=["get"], url_path="stage-choices")
    def stage_choices(self, request):
        """Liste des 13+2 etapes du cycle de vie (SF-4), pour peupler un select."""
        return Response([{"value": v, "label": l} for v, l in LIFECYCLE_STAGE_CHOICES])

    @action(detail=False, methods=["get"], url_path="classification-choices")
    def classification_choices(self, request):
        """Vocabulaires SF-2, pour peupler les selects du formulaire de classification."""
        from .models import (
            CLIMATE_MARKER_CHOICES,
            RISK_RATING_CHOICES,
            WE_CATEGORY_CHOICES,
        )
        return Response({
            "we_category": [{"value": v, "label": l} for v, l in WE_CATEGORY_CHOICES],
            "risk_rating": [{"value": v, "label": l} for v, l in RISK_RATING_CHOICES],
            "climate_marker": [{"value": v, "label": l} for v, l in CLIMATE_MARKER_CHOICES],
        })

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
                transition_date=data.get("transition_date"),
            )
        except ValidationError as exc:
            return Response({"detail": exc.messages}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

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

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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


# ---------------------------------------------------------------------------
# SF-1 Etape 1 — Reference PAD (BRQ-1.14 : le pipeline d'extraction IA est
# hors perimetre de cette passe, seul le televersement/telechargement du
# document est couvert).
# ---------------------------------------------------------------------------
from pathlib import Path as _Path
from uuid import uuid4 as _uuid4

from django.core.files.storage import default_storage
from rest_framework.parsers import MultiPartParser

PAD_MAX_BYTES = 25 * 1024 * 1024  # 25 Mo : les PAD sont des documents longs
PAD_MAGIC = b"%PDF-"


class ProjectPadView(APIView):
    """
    POST   /api/projects/{pk}/pad/   (multipart : champ `file`, PDF uniquement)
    DELETE /api/projects/{pk}/pad/   — retire la reference sans supprimer le
                                        fichier stocke (meme choix que les
                                        logos : nettoyage differe si besoin)
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module = "m1_config_access"
    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        from .models import Project
        project = Project.objects.get(pk=pk)

        upload = request.FILES.get("file")
        if upload is None:
            return Response(
                {"detail": "Aucun fichier recu (champ attendu : `file`)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if upload.size > PAD_MAX_BYTES:
            return Response(
                {
                    "detail": f"Fichier trop volumineux ({upload.size / 1024 / 1024:.1f} Mo). "
                    f"Maximum : {PAD_MAX_BYTES // 1024 // 1024} Mo."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = (upload.content_type or "").split(";")[0].strip().lower()
        head = upload.read(len(PAD_MAGIC))
        upload.seek(0)
        # Meme logique de defense en profondeur que LogoUploadView (voir
        # core/uploads.py) : le Content-Type declare par le client n'est
        # pas fiable, on verifie la signature binaire reelle du fichier.
        if content_type != "application/pdf" or not head.startswith(PAD_MAGIC):
            return Response(
                {"detail": "Format non accepte. Seul le PDF est autorise pour le PAD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stem = _Path(upload.name).stem[:60]
        safe_stem = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in stem).strip("-")
        filename = f"pad/{safe_stem or 'pad'}-{_uuid4().hex[:8]}.pdf"

        # L'ancien fichier (s'il existe) devient orphelin — meme choix que
        # pour les logos, pas de suppression physique automatique.
        project.pad_reference_file.save(filename, upload, save=True)

        return Response(ProjectDetailSerializer(project).data, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        from .models import Project
        project = Project.objects.get(pk=pk)
        project.pad_reference_file.delete(save=False)
        project.pad_reference_file = None
        project.save(update_fields=["pad_reference_file"])
        return Response(ProjectDetailSerializer(project).data)


class ProjectReportingConfigView(APIView):
    """
    PATCH /api/projects/{pk}/reporting-config/  — SF-1 Etape 5 (perimetre reduit)
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module = "m1_config_access"

    def patch(self, request, pk):
        from .models import Project
        from .serializers import ReportingConfigUpdateSerializer
        project = Project.objects.get(pk=pk)
        serializer = ReportingConfigUpdateSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ProjectDetailSerializer(project).data)


class ProjectStatsView(APIView):
    """
    GET /api/projects/stats/ — compteurs portefeuille pour la page login.
    Accessible sans authentification (données agrégées non sensibles).
    """
    permission_classes = []  # public

    def get(self, request):
        from .models import Project
        from apps.reference.models import RegionalHub
        projects = Project.objects.all()
        countries = set()
        for p in projects.prefetch_related("project_countries__country"):
            for pc in p.project_countries.all():
                if pc.country:
                    countries.add(pc.country_id)
        return Response({
            "project_count": projects.count(),
            "country_count": len(countries),
            "hub_count": RegionalHub.objects.filter(is_active=True).count(),
        })


class ProjectDatesView(APIView):
    """
    PATCH /api/projects/{pk}/dates/  — SF-1 Etape 3 (dates de debut/fin)
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module = "m1_config_access"

    def patch(self, request, pk):
        from .models import Project
        from .serializers import ProjectDatesUpdateSerializer
        project = Project.objects.get(pk=pk)
        serializer = ProjectDatesUpdateSerializer(project, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(ProjectDetailSerializer(project).data)


class ProjectBasicUpdateView(APIView):
    """
    PATCH /api/projects/<pk>/basic/
    Mise a jour des champs Basic Identity (step 1 wizard) :
    name, pays, secteur primaire — champs non couverts par
    ProjectClassificationUpdateSerializer.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module = "m1_config_access"

    def patch(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        data = request.data

        if "name" in data:
            project.name = data["name"]
        if "official_reference_number" in data:
            from apps.project.serializers import validate_official_reference_number
            try:
                project.official_reference_number = validate_official_reference_number(
                    data["official_reference_number"], exclude_pk=project.pk
                )
            except DRFValidationError as exc:
                return Response({"official_reference_number": exc.detail}, status=400)
        # Le type de projet est fixe a la creation (ADR 0014) : le renvoyer
        # inchange est tolere, le modifier jamais.
        if "investment_cycle" in data and (data["investment_cycle"] or None) != project.investment_cycle:
            return Response(
                {"investment_cycle": ["The project type is fixed at creation."]}, status=400
            )
        if "budget_amount" in data:
            project.budget_amount = data["budget_amount"] or None

        # Secteurs : valides avant toute ecriture, dans la taxonomie du projet.
        from apps.project.serializers import validate_sectors_for_taxonomy
        from apps.reference.models import Sector
        primary = None
        if "primary_sector" in data and data["primary_sector"]:
            primary = Sector.objects.filter(pk=data["primary_sector"]).first()
            if primary is None:
                return Response({"primary_sector": ["Unknown sector."]}, status=400)
        contrib = data.get("contributing_sector_ids")
        contrib_sectors = list(Sector.objects.filter(pk__in=contrib)) if contrib else []
        errors = validate_sectors_for_taxonomy(project.taxonomy, primary, contrib_sectors)
        if errors:
            return Response(errors, status=400)
        if primary is not None:
            project.primary_sector = primary

        project.save()

        # Pays
        country_ids = data.get("country_ids")
        lead_country_id = data.get("lead_country_id")
        if country_ids is not None:
            from apps.project.services import set_project_countries
            lead = int(lead_country_id) if lead_country_id else (int(country_ids[0]) if country_ids else None)
            set_project_countries(project, [int(c) for c in country_ids], lead)

        # Secteurs contributifs
        if contrib is not None:
            from apps.project.services import set_project_sectors
            set_project_sectors(project, [int(s) for s in contrib])

        from apps.project.serializers import ProjectDetailSerializer
        return Response(ProjectDetailSerializer(project).data)


class ProjectImplementingPartnerListView(APIView):
    """
    GET  /api/projects/<pk>/partners/   — liste des partenaires d'exécution
    POST /api/projects/<pk>/partners/   — ajouter un partenaire
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module = "m1_config_access"

    def _get_project(self, pk):
        from apps.project.models import Project
        return get_object_or_404(Project, pk=pk)

    def get(self, request, pk):
        from apps.project.models import ProjectImplementingPartner
        from apps.project.serializers import ProjectImplementingPartnerSerializer
        project = self._get_project(pk)
        partners = ProjectImplementingPartner.objects.filter(project=project).select_related("agency", "agency__country")
        return Response(ProjectImplementingPartnerSerializer(partners, many=True).data)

    def post(self, request, pk):
        from apps.project.models import ProjectImplementingPartner
        from apps.project.serializers import ProjectImplementingPartnerSerializer
        from apps.reference.models import ImplementingAgency
        project = self._get_project(pk)
        serializer = ProjectImplementingPartnerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        partner = ProjectImplementingPartner.objects.create(
            project=project,
            agency=d["agency"],
            role=d.get("role", "lead"),
            allocated_amount_usd=d.get("allocated_amount_usd"),
            notes=d.get("notes", ""),
            order=d.get("order", 0),
        )
        return Response(ProjectImplementingPartnerSerializer(partner).data, status=201)


class ProjectImplementingPartnerDetailView(APIView):
    """
    PATCH  /api/projects/<pk>/partners/<partner_pk>/
    DELETE /api/projects/<pk>/partners/<partner_pk>/
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module = "m1_config_access"

    def _get_partner(self, pk, partner_pk):
        from apps.project.models import ProjectImplementingPartner
        return get_object_or_404(ProjectImplementingPartner, pk=partner_pk, project_id=pk)

    def patch(self, request, pk, partner_pk):
        from apps.project.serializers import ProjectImplementingPartnerSerializer
        partner = self._get_partner(pk, partner_pk)
        serializer = ProjectImplementingPartnerSerializer(partner, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        for field in ("agency", "role", "allocated_amount_usd", "notes", "order"):
            if field in d:
                setattr(partner, field, d[field])
        partner.save()
        return Response(ProjectImplementingPartnerSerializer(partner).data)

    def delete(self, request, pk, partner_pk):
        partner = self._get_partner(pk, partner_pk)
        partner.delete()
        return Response(status=204)


class ProjectGadmScopeView(APIView):
    """
    GET    /api/projects/<pk>/gadm-scope/         — zones du projet
    POST   /api/projects/<pk>/gadm-scope/         — ajouter une zone
    DELETE /api/projects/<pk>/gadm-scope/<area_pk>/ — retirer une zone
    PATCH  /api/projects/<pk>/gadm-scope/<area_pk>/ — marquer zone primaire
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def get(self, request, pk):
        from apps.project.models import ProjectGadmScope
        from apps.project.serializers import ProjectGadmScopeSerializer
        project = get_object_or_404(Project, pk=pk)
        scopes  = ProjectGadmScope.objects.filter(project=project).select_related("area", "area__parent")
        return Response(ProjectGadmScopeSerializer(scopes, many=True).data)

    def post(self, request, pk):
        from apps.project.models import ProjectGadmScope
        from apps.project.serializers import ProjectGadmScopeSerializer
        from apps.reference.models import GadmArea
        project = get_object_or_404(Project, pk=pk)
        area_id    = request.data.get("area")
        is_primary = request.data.get("is_primary", False)
        notes      = request.data.get("notes", "")
        area = get_object_or_404(GadmArea, pk=area_id)
        scope, created = ProjectGadmScope.objects.get_or_create(
            project=project, area=area,
            defaults={"is_primary": is_primary, "notes": notes},
        )
        if not created:
            return Response({"detail": "Cette zone est déjà dans le périmètre."}, status=400)
        return Response(ProjectGadmScopeSerializer(scope).data, status=201)

    def delete(self, request, pk, area_pk):
        from apps.project.models import ProjectGadmScope
        scope = get_object_or_404(ProjectGadmScope, project_id=pk, area_id=area_pk)
        scope.delete()
        return Response(status=204)

    def patch(self, request, pk, area_pk):
        from apps.project.models import ProjectGadmScope
        from apps.project.serializers import ProjectGadmScopeSerializer
        scope = get_object_or_404(ProjectGadmScope, project_id=pk, area_id=area_pk)
        if "is_primary" in request.data:
            scope.is_primary = request.data["is_primary"]
        if "notes" in request.data:
            scope.notes = request.data["notes"]
        scope.save()
        return Response(ProjectGadmScopeSerializer(scope).data)


class ReportingPeriodView(APIView):
    """
    GET  /api/projects/<pk>/reporting-periods/           — liste des périodes
    POST /api/projects/<pk>/reporting-periods/generate/  — générer les périodes
    PATCH /api/projects/<pk>/reporting-periods/<p_pk>/   — mettre à jour le statut
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def get(self, request, pk):
        from apps.project.models import ReportingPeriod
        project = get_object_or_404(Project, pk=pk)
        periods = ReportingPeriod.objects.filter(project=project)
        data = [
            {
                "id":            p.id,
                "period_number": p.period_number,
                "label":         p.label,
                "start_date":    str(p.start_date),
                "end_date":      str(p.end_date),
                "due_date":      str(p.due_date),
                "status":        p.status,
                "status_display": p.get_status_display(),
                "submitted_at":  p.submitted_at.isoformat() if p.submitted_at else None,
                "is_late":       p.is_late,
            }
            for p in periods
        ]
        return Response(data)

    def post(self, request, pk):
        """Génère les périodes manquantes. Idempotent."""
        from apps.project.services import generate_reporting_periods
        project = get_object_or_404(Project, pk=pk)
        created, error = generate_reporting_periods(project)
        if error:
            return Response({"detail": error}, status=400)
        return Response({"created": created, "message": f"{created} period(s) generated."})


class ReportingPeriodResetView(APIView):
    """DELETE /api/projects/<pk>/reporting-periods/reset/ — purge et régénère"""
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def delete(self, request, pk):
        from apps.project.models import ReportingPeriod
        project = get_object_or_404(Project, pk=pk)
        count, _ = ReportingPeriod.objects.filter(project=project).delete()
        return Response({"deleted": count})


class ReportingPeriodDetailView(APIView):
    """PATCH /api/projects/<pk>/reporting-periods/<p_pk>/ — statut"""
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def patch(self, request, pk, p_pk):
        from apps.project.models import ReportingPeriod
        period = get_object_or_404(ReportingPeriod, pk=p_pk, project_id=pk)
        allowed = {"status", "submitted_at", "approved_at"}
        for field in allowed:
            if field in request.data:
                setattr(period, field, request.data[field] or None)
        # Horodater la transition si l'appelant ne fournit pas la date :
        # submitted_at sert ensuite à dériver is_late (soumission tardive).
        now = timezone.now()
        if period.status == "submitted" and not period.submitted_at:
            period.submitted_at = now
        if period.status == "approved":
            if not period.submitted_at:
                period.submitted_at = now
            if not period.approved_at:
                period.approved_at = now
        period.save()
        return Response({
            "id": period.id, "status": period.status,
            "status_display": period.get_status_display(),
            "submitted_at": period.submitted_at.isoformat() if period.submitted_at else None,
            "is_late": period.is_late,
        })


class ReportingPeriodRefreshView(APIView):
    """
    POST /api/projects/<pk>/reporting-periods/refresh/

    Force la mise à jour des statuts (upcoming/open/overdue) pour ce projet
    sans attendre le cron quotidien. Utile en dev et pour les tests.

    Retourne le nombre de périodes mises à jour + le détail par statut.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def post(self, request, pk):
        from apps.project.services import refresh_period_statuses
        project = get_object_or_404(Project, pk=pk)
        result = refresh_period_statuses(project=project)
        return Response(result)


class ProjectWorkspaceView(APIView):
    """GET /api/projects/<pk>/workspace/ — état du workspace SF-10"""
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        from apps.project.models import ProjectWorkspace
        project = get_object_or_404(Project, pk=pk)
        try:
            ws = project.workspace
            return Response({
                "exists":              True,
                "activated_at":        ws.activated_at,
                "activated_by_email":  ws.activated_by.email if ws.activated_by else None,
                "m2_results_ready":    ws.m2_results_ready,
                "m3_workplan_ready":   ws.m3_workplan_ready,
                "m5_gis_ready":        ws.m5_gis_ready,
                "m6_beneficiary_ready":ws.m6_beneficiary_ready,
                "m9_risk_ready":       ws.m9_risk_ready,
                "m11_dashboard_ready": ws.m11_dashboard_ready,
            })
        except ProjectWorkspace.DoesNotExist:
            return Response({"exists": False})


class ProjectStageTransitionDetailView(APIView):
    """
    PATCH  /api/projects/<pk>/transitions/<t_pk>/
           Corrige la justification ou la référence documentaire
           de la DERNIÈRE transition uniquement (audit trail protégé).

    DELETE /api/projects/<pk>/transitions/<t_pk>/
           Supprime la DERNIÈRE transition et restaure le stade précédent.
           Bloqué si c'est la seule transition enregistrée.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def _get_last_transition(self, pk, t_pk):
        project = get_object_or_404(Project, pk=pk)
        from apps.project.models import ProjectStageTransition
        last = project.stage_transitions.order_by("-transitioned_at").first()
        if not last or last.pk != int(t_pk):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(
                "Seule la dernière transition peut être modifiée ou supprimée (RG-4.1)."
            )
        return project, last

    def patch(self, request, pk, t_pk):
        from apps.project.serializers import ProjectStageTransitionSerializer
        project, transition = self._get_last_transition(pk, t_pk)
        allowed = {"justification", "document_reference", "transition_date"}
        for field in allowed:
            if field in request.data:
                value = request.data[field]
                if field == "transition_date" and not value:
                    value = None
                setattr(transition, field, value)
        transition.save(update_fields=list(allowed & set(request.data.keys())))
        return Response(ProjectStageTransitionSerializer(transition).data)

    def delete(self, request, pk, t_pk):
        from apps.project.serializers import ProjectDetailSerializer
        project, transition = self._get_last_transition(pk, t_pk)
        # Restaurer le stade précédent
        previous_stage = transition.from_stage
        transition.delete()
        project.lifecycle_stage = previous_stage
        project.save(update_fields=["lifecycle_stage", "updated_at"])
        return Response(ProjectDetailSerializer(project).data)


# ---------------------------------------------------------------------------
# Carte géographique — GeoJSON endpoint
# ---------------------------------------------------------------------------

class ProjectGeoJSONView(APIView):
    """
    GET /api/projects/<pk>/geojson/
    Retourne les géométries GeoJSON du projet :
      - Polygones pays (niveau 0 via Natural Earth bbox approximatif)
      - Admin 1 et Admin 2 depuis gadm_area (si géométries chargées)
      - Zones d'intervention ProjectGadmScope
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        from django.db import connection
        import json

        project = get_object_or_404(Project, pk=pk)

        # Pays du projet
        project_countries = project.project_countries.select_related(
            "country"
        ).all()
        country_ids = [pc.country_id for pc in project_countries]
        lead_iso2s  = [pc.country.iso2 for pc in project_countries if pc.is_lead]

        features = []

        # Admin 1 et Admin 2 depuis gadm_area avec géométries
        with connection.cursor() as cur:
            cur.execute("""
                SELECT
                    ga.id, ga.gadm_uid, ga.name, ga.level,
                    ga.parent_id,
                    pgs.is_primary,
                    c.iso2, c.name as country_name,
                    ST_AsGeoJSON(ga.geometry)::json as geom
                FROM gadm_area ga
                JOIN country c ON c.id = ga.country_id
                LEFT JOIN project_gadm_scope pgs ON pgs.area_id = ga.id AND pgs.project_id = %s
                WHERE ga.country_id = ANY(%s)
                  AND ga.geometry IS NOT NULL
                  AND (pgs.id IS NOT NULL OR ga.level = 1)
                ORDER BY ga.level, ga.name
            """, [pk, country_ids])

            rows = cur.fetchall()

        # Admin 1 de tous les pays du projet
        # Admin 2 seulement si dans ProjectGadmScope
        for row in rows:
            id_, uid, name, level, parent_id, is_primary, iso2, country_name, geom = row
            if geom is None:
                continue
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "id":           id_,
                    "gadm_uid":     uid,
                    "name":         name,
                    "level":        level,
                    "parent_id":    parent_id,
                    "is_primary":   bool(is_primary) if is_primary is not None else False,
                    "iso2":         iso2,
                    "country_name": country_name,
                    "in_scope":     is_primary is not None,
                },
            })

        # Pays (niveau 0) — bbox depuis Admin 1
        with connection.cursor() as cur:
            cur.execute("""
                SELECT
                    c.iso2, c.iso3, c.name,
                    pc.is_lead,
                    ST_AsGeoJSON(ST_Union(ga.geometry))::json as geom
                FROM gadm_area ga
                JOIN country c ON c.id = ga.country_id
                JOIN project_country pc ON pc.country_id = c.id AND pc.project_id = %s
                WHERE ga.country_id = ANY(%s)
                  AND ga.level = 1
                  AND ga.geometry IS NOT NULL
                GROUP BY c.iso2, c.iso3, c.name, pc.is_lead
            """, [pk, country_ids])
            for iso2, iso3, cname, is_lead, geom in cur.fetchall():
                if geom is None:
                    continue
                features.append({
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "level":    0,
                        "iso2":     iso2,
                        "iso3":     iso3,
                        "name":     cname,
                        "is_lead":  bool(is_lead),
                        "in_scope": True,
                    },
                })

        return Response({
            "type":     "FeatureCollection",
            "features": features,
        })


class ProjectMapPointsView(APIView):
    """
    GET /api/projects/map/
    FeatureCollection de points — un par projet — pour la vue carte du
    portefeuille. Le point est ST_PointOnSurface de l'union des zones
    d'intervention (project_gadm_scope) ; a defaut, repli sur l'union des
    Admin 1 du pays chef de file. Les projets sans aucune geometrie sont
    omis. `bbox` [ouest, sud, est, nord] est l'emprise de cette meme
    geometrie : la fiche projet de la carte s'y cadre (« Zoom to area »).

    Deux mesures par projet pour le « Colour by » de la carte :
      - physical_progress : moyenne simple de l'avancement des activites
        actives, comme WorkplanSummaryView (overall_progress) ; None sans
        workplan.
      - indicator_performance : moyenne des taux d'atteinte de la derniere
        valeur approuvee de chaque indicateur, et son RAG aux seuils de
        ResultsData.compute_and_save_rag (vert >= 90, ambre >= 60, rouge
        sinon) ; None sans valeur approuvee ayant une cible.

    PORTEE : comme ProjectViewSet, la visibilite passe par
    Project.objects.in_scope() — un PMU ne voit que ses projets, un hub
    que sa region. (Fixup d'integration : la branche est ecrite contre
    main, sans in_scope ; cette ligne suit PR-14, present sur develop.)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db import connection

        projects = Project.objects.in_scope(request).select_related(
            "primary_sector__parent"
        ).prefetch_related("project_countries__country")

        meta = {}
        for p in projects:
            lead = p.lead_country
            meta[p.id] = {
                "id":                      p.id,
                "name":                    p.name,
                "official_reference_number": p.official_reference_number,
                "lifecycle_stage":         p.lifecycle_stage,
                "lifecycle_stage_display": p.get_lifecycle_stage_display(),
                # `or None` : une couleur vide casserait le coalesce MapLibre
                "primary_sector_name":  (p.primary_sector.name or None) if p.primary_sector_id else None,
                "primary_sector_color": (p.primary_sector.color or None) if p.primary_sector_id else None,
                "pillar_name":          p.primary_sector.pillar.name if p.primary_sector_id and p.primary_sector.pillar else None,
                "lead_country_name":    lead.name if lead else None,
            }

        if not meta:
            return Response({"type": "FeatureCollection", "features": []})

        from django.db.models import Avg
        from apps.results.models import ResultsData
        from apps.workplan.models import Activity

        ids = list(meta.keys())
        progress = dict(
            Activity.objects.filter(is_active=True, sub_component__component__project_id__in=ids)
            .values("sub_component__component__project_id")
            .annotate(avg=Avg("progress"))
            .values_list("sub_component__component__project_id", "avg")
        )
        # Derniere valeur approuvee par indicateur (ligne logframe), puis
        # moyenne des taux par projet.
        latest = {}
        for row_id, project_id, rate in (
            ResultsData.objects.filter(
                logframe_row__project_id__in=ids, status="approved", achievement_rate__isnull=False,
            )
            .order_by("logframe_row_id", "reporting_period__end_date")
            .values_list("logframe_row_id", "logframe_row__project_id", "achievement_rate")
        ):
            latest[row_id] = (project_id, float(rate))
        rates = {}
        for project_id, rate in latest.values():
            rates.setdefault(project_id, []).append(rate)
        for pid, m in meta.items():
            avg = progress.get(pid)
            m["physical_progress"] = round(float(avg), 1) if avg is not None else None
            perf = round(sum(rates[pid]) / len(rates[pid]), 1) if pid in rates else None
            m["indicator_performance"] = perf
            m["indicator_rag"] = (
                None if perf is None
                else "green" if perf >= 90 else "amber" if perf >= 60 else "red"
            )

        with connection.cursor() as cur:
            cur.execute("""
                SELECT p.id, ST_AsGeoJSON(ST_PointOnSurface(g.geom))::json,
                       ST_XMin(g.geom), ST_YMin(g.geom), ST_XMax(g.geom), ST_YMax(g.geom)
                FROM project p
                CROSS JOIN LATERAL (
                    SELECT COALESCE(
                        -- Zones d'intervention explicites
                        (SELECT ST_Union(ga.geometry)
                           FROM project_gadm_scope pgs
                           JOIN gadm_area ga ON ga.id = pgs.area_id
                          WHERE pgs.project_id = p.id
                            AND ga.geometry IS NOT NULL),
                        -- Repli : Admin 1 du pays chef de file
                        (SELECT ST_Union(ga.geometry)
                           FROM project_country pc
                           JOIN gadm_area ga ON ga.country_id = pc.country_id
                                            AND ga.level = 1
                          WHERE pc.project_id = p.id AND pc.is_lead
                            AND ga.geometry IS NOT NULL)
                    ) AS geom
                ) g
                WHERE p.id = ANY(%s) AND g.geom IS NOT NULL
            """, [list(meta.keys())])
            rows = cur.fetchall()

        features = [
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {**meta[pid], "bbox": [xmin, ymin, xmax, ymax]},
            }
            for pid, geom, xmin, ymin, xmax, ymax in rows
        ]
        return Response({"type": "FeatureCollection", "features": features})
