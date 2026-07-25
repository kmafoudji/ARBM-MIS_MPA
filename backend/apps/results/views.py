from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import ReadOnlyOrHasModulePermission
from apps.project.models import Project

from .models import Indicator, LogframeRow, LogframeTarget, TargetRevision, TheoryOfChange, ToCNode
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
        from django.db import IntegrityError
        project = Project.objects.get(pk=pk)
        serializer = LogframeRowCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            row = serializer.save(project=project)
        except IntegrityError:
            # unique_together (project, indicator) — l'indicateur est deja
            # dans le cadre logique de ce projet. Retourner la ligne existante
            # plutot que de bloquer : le frontend peut l'attacher au noeud.
            indicator_id = serializer.validated_data["indicator"].id
            row = LogframeRow.objects.get(project=project, indicator_id=indicator_id)
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
        chain_level       = data.pop("chain_level")
        parent            = data.pop("parent", None)
        cross_pathway_ids = data.pop("cross_pathway_ids", [])

        # Valider que le logframe_row appartient au meme projet
        logframe_row = data.get("logframe_row")
        if logframe_row and logframe_row.project_id != project.id:
            raise DRFValidationError({"detail": ["Cette ligne logframe n'appartient pas a ce projet."]})

        try:
            node = create_toc_node(toc, chain_level, parent.id if parent else None, **data)
        except ValidationError as exc:
            raise DRFValidationError({"detail": exc.messages if hasattr(exc, "messages") else [str(exc)]})

        # Liaisons cross-pathway après création (M2M — pas dans create_toc_node)
        if cross_pathway_ids:
            targets = ToCNode.objects.filter(id__in=cross_pathway_ids, toc=toc)
            node.cross_pathways.set(targets)

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
        # Bloquer les modifications structurelles si la ToC est verrouillée
        if node.toc.status == "locked":
            # Seul l'attachement d'indicateur (logframe_row) reste autorisé
            allowed_fields = {"logframe_row"}
            if not set(request.data.keys()).issubset(allowed_fields):
                raise DRFValidationError({"detail": ["The Theory of Change is locked (Effective stage). Only indicator attachment is allowed."]})
        serializer = ToCNodeUpdateSerializer(node, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        lr = serializer.validated_data.get("logframe_row")
        if lr and lr.project_id != int(pk):
            raise DRFValidationError({"detail": ["Cette ligne logframe n'appartient pas a ce projet."]})
        serializer.save()
        return Response(ToCNodeSerializer(node).data)

    def delete(self, request, pk, node_pk):
        self._get_node(pk, node_pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# SF-3 — Révision auditable des cibles (RG-3.3 / RG-3.5)
# ---------------------------------------------------------------------------

class TargetRevisionView(APIView):
    """
    POST /api/projects/{pk}/logframe/{row_pk}/targets/{t_pk}/revise/
         Initie une révision : crée TargetRevision (pending) + nouvelle LogframeTarget draft.

    GET  /api/projects/{pk}/logframe/{row_pk}/targets/{t_pk}/revisions/
         Liste l'historique des révisions (immuable).
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def _get_target(self, pk, row_pk, t_pk):
        return LogframeTarget.objects.select_related("logframe_row__project").get(
            pk=t_pk, logframe_row_id=row_pk, logframe_row__project_id=pk
        )

    def get(self, request, pk, row_pk, t_pk):
        target = self._get_target(pk, row_pk, t_pk)
        from .serializers import TargetRevisionSerializer
        return Response(TargetRevisionSerializer(target.revisions.all(), many=True).data)

    def post(self, request, pk, row_pk, t_pk):
        from django.utils import timezone
        from .models import TargetRevision
        from .serializers import (
            TargetRevisionRequestSerializer,
            TargetRevisionSerializer,
            LogframeTargetSerializer,
        )

        target = self._get_target(pk, row_pk, t_pk)

        # Seules les cibles approved peuvent être révisées (pas draft, pas PAD)
        if target.is_original_pad:
            return Response(
                {"detail": "La cible PAD originale ne peut pas être révisée (RG-3.4)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if target.status == "draft":
            return Response(
                {"detail": "Seule une cible approuvée peut faire l'objet d'une révision (RG-3.3)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req = TargetRevisionRequestSerializer(data=request.data)
        req.is_valid(raise_exception=True)
        d = req.validated_data

        # Créer la nouvelle cible draft
        new_target = LogframeTarget.objects.create(
            logframe_row=target.logframe_row,
            target_value=d["new_value"],
            target_date=d["new_date"],
            label=d.get("new_label", ""),
            status="draft",
        )

        # Enregistrer la révision
        revision = TargetRevision.objects.create(
            target=new_target,
            previous_value=target.target_value,
            previous_date=target.target_date,
            justification=d["justification"],
            revised_by=request.user,
            revision_status="pending",
        )

        # Marquer l'ancienne cible comme révisée
        target.status = "revised"
        target.save(update_fields=["status"])

        return Response(
            {
                "revision": TargetRevisionSerializer(revision).data,
                "new_target": LogframeTargetSerializer(new_target).data,
            },
            status=status.HTTP_201_CREATED,
        )


class TargetRevisionActionView(APIView):
    """
    POST /api/projects/{pk}/logframe/{row_pk}/targets/{t_pk}/revisions/{rev_pk}/action/
         action=approve → approuve la nouvelle cible (status draft → approved)
         action=reject  → rejette (commentaire obligatoire, ancienne cible redevient active)
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def post(self, request, pk, row_pk, t_pk, rev_pk):
        from django.utils import timezone
        from .models import TargetRevision
        from .serializers import TargetRevisionActionSerializer, TargetRevisionSerializer

        revision = TargetRevision.objects.select_related("target__logframe_row").get(
            pk=rev_pk,
            target_id=t_pk,
            target__logframe_row_id=row_pk,
            target__logframe_row__project_id=pk,
        )

        if revision.revision_status != "pending":
            return Response(
                {"detail": "Cette révision a déjà été traitée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Principe des quatre yeux : l'initiateur ne peut pas approuver (POL-2.03)
        if revision.revised_by == request.user:
            return Response(
                {"detail": "Le principe des quatre yeux s'applique : vous ne pouvez pas approuver votre propre révision (POL-2.03)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ser = TargetRevisionActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        action  = ser.validated_data["action"]
        comment = ser.validated_data.get("comment", "")

        now = timezone.now()

        if action == "approve":
            revision.revision_status = "approved"
            revision.approved_by     = request.user
            revision.revision_comment = comment
            revision.resolved_at     = now
            revision.save()
            revision.target.status      = "approved"
            revision.target.approved_by = request.user
            revision.target.approved_at = now
            revision.target.save(update_fields=["status", "approved_by", "approved_at"])
        else:  # reject
            if not comment:
                return Response(
                    {"detail": "Un commentaire est obligatoire en cas de rejet (RG-3.3)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            revision.revision_status  = "rejected"
            revision.approved_by      = request.user
            revision.revision_comment = comment
            revision.resolved_at      = now
            revision.save()
            # Remettre la cible précédente en approved
            prev = LogframeTarget.objects.filter(
                logframe_row=revision.target.logframe_row,
                target_value=revision.previous_value,
                target_date=revision.previous_date,
                status="revised",
            ).first()
            if prev:
                prev.status = "approved"
                prev.save(update_fields=["status"])
            # La nouvelle cible draft reste mais est désormais orpheline (pas supprimée)
            revision.target.status = "draft"
            revision.target.save(update_fields=["status"])

        return Response(TargetRevisionSerializer(revision).data)


# ---------------------------------------------------------------------------
# SF-2 — Liaisons cross-pathway sur un nœud
# ---------------------------------------------------------------------------

class ToCNodeCrossPathwayView(APIView):
    """
    GET  /api/projects/{pk}/toc/nodes/{node_pk}/cross-pathways/
         Liste les liaisons non linéaires sortantes du nœud.

    POST /api/projects/{pk}/toc/nodes/{node_pk}/cross-pathways/
         Ajoute une liaison (body: {"target_node_id": <int>}).

    DELETE /api/projects/{pk}/toc/nodes/{node_pk}/cross-pathways/{target_pk}/
           Retire la liaison.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def _get_node(self, pk, node_pk):
        return ToCNode.objects.get(pk=node_pk, toc__project_id=pk)

    def get(self, request, pk, node_pk):
        node    = self._get_node(pk, node_pk)
        targets = node.cross_pathways.all()
        from .serializers import ToCNodeSerializer
        return Response(ToCNodeSerializer(targets, many=True).data)

    def post(self, request, pk, node_pk):
        node      = self._get_node(pk, node_pk)
        target_id = request.data.get("target_node_id")
        if not target_id:
            return Response({"detail": "target_node_id requis."}, status=status.HTTP_400_BAD_REQUEST)
        target = ToCNode.objects.get(pk=target_id, toc__project_id=pk)
        if target == node:
            return Response({"detail": "Un nœud ne peut pas pointer vers lui-même."}, status=400)
        node.cross_pathways.add(target)
        from .serializers import ToCNodeSerializer
        return Response(ToCNodeSerializer(target).data, status=status.HTTP_201_CREATED)

    def delete(self, request, pk, node_pk, target_pk):
        node   = self._get_node(pk, node_pk)
        target = ToCNode.objects.get(pk=target_pk, toc__project_id=pk)
        node.cross_pathways.remove(target)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# SF-4 / SF-5 — ResultsData : saisie et scoring RAG
# ---------------------------------------------------------------------------

class ResultsDataView(APIView):
    """
    GET  /api/projects/<pk>/results/
         Liste toutes les valeurs saisies pour ce projet.
         Filtres optionnels : ?period=<id>  ?row=<id>  ?status=draft|approved

    POST /api/projects/<pk>/results/
         Crée ou met à jour une valeur (upsert sur logframe_row + reporting_period).
         Calcule le RAG automatiquement.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def get(self, request, pk):
        from .models import ResultsData
        from .serializers import ResultsDataSerializer
        qs = ResultsData.objects.filter(
            logframe_row__project_id=pk
        ).select_related(
            "logframe_row__indicator",
            "reporting_period",
            "submitted_by", "approved_by",
        )
        period = request.query_params.get("period")
        row    = request.query_params.get("row")
        st     = request.query_params.get("status")
        if period: qs = qs.filter(reporting_period_id=period)
        if row:    qs = qs.filter(logframe_row_id=row)
        if st:     qs = qs.filter(status=st)
        return Response(ResultsDataSerializer(qs, many=True).data)

    def post(self, request, pk):
        from django.utils import timezone
        from .models import ResultsData
        from .serializers import ResultsDataCreateSerializer, ResultsDataSerializer

        ser = ResultsDataCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        # Valider appartenance au projet
        row = get_object_or_404(LogframeRow, pk=d["logframe_row"], project_id=pk)
        from apps.project.models import ReportingPeriod
        period = get_object_or_404(ReportingPeriod, pk=d["reporting_period"], project_id=pk)

        # Upsert
        rd, created = ResultsData.objects.update_or_create(
            logframe_row=row,
            reporting_period=period,
            defaults={
                "actual_value": d["actual_value"],
                "narrative":    d.get("narrative", ""),
                "submitted_by": request.user,
            },
        )

        # Approbation directe si demandée
        if d.get("approve"):
            rd.status      = "approved"
            rd.approved_by = request.user
            rd.approved_at = timezone.now()
            rd.save(update_fields=["status", "approved_by", "approved_at"])

        # Calcul RAG
        rd.compute_and_save_rag()
        rd.refresh_from_db()

        return Response(
            ResultsDataSerializer(rd).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ResultsDataDetailView(APIView):
    """
    GET    /api/projects/<pk>/results/<rd_pk>/  Détail d'une valeur.
    PATCH  /api/projects/<pk>/results/<rd_pk>/  Mise à jour (valeur, narrative, approve).
    DELETE /api/projects/<pk>/results/<rd_pk>/  Suppression (draft uniquement).
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def _get(self, pk, rd_pk):
        from .models import ResultsData
        return get_object_or_404(
            ResultsData,
            pk=rd_pk,
            logframe_row__project_id=pk,
        )

    def get(self, request, pk, rd_pk):
        from .serializers import ResultsDataSerializer
        return Response(ResultsDataSerializer(self._get(pk, rd_pk)).data)

    def patch(self, request, pk, rd_pk):
        from django.utils import timezone
        from .serializers import ResultsDataUpdateSerializer, ResultsDataSerializer
        rd  = self._get(pk, rd_pk)
        ser = ResultsDataUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        if "actual_value" in d:
            rd.actual_value = d["actual_value"]
        if "narrative" in d:
            rd.narrative = d["narrative"]
        rd.save(update_fields=["actual_value", "narrative", "updated_at"])

        if d.get("approve"):
            rd.status      = "approved"
            rd.approved_by = request.user
            rd.approved_at = timezone.now()
            rd.save(update_fields=["status", "approved_by", "approved_at"])

        rd.compute_and_save_rag()
        rd.refresh_from_db()
        return Response(ResultsDataSerializer(rd).data)

    def delete(self, request, pk, rd_pk):
        rd = self._get(pk, rd_pk)
        if rd.status == "approved":
            return Response(
                {"detail": "Une valeur approuvée ne peut pas être supprimée."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rd.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResultsSummaryView(APIView):
    """
    GET /api/projects/<pk>/results/summary/
    Vue consolidée : pour chaque ligne logframe, toutes les périodes
    avec leur valeur saisie, RAG et taux d'atteinte.
    Utilisé par le frontend pour afficher la grille de saisie.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def get(self, request, pk):
        try:
            from .models import ResultsData
            project = get_object_or_404(Project, pk=pk)
            rows    = LogframeRow.objects.filter(project=project).select_related("indicator")
            periods = project.reporting_periods.all().order_by("period_number")

            rd_index = {
                (rd.logframe_row_id, rd.reporting_period_id): rd
                for rd in ResultsData.objects.filter(
                    logframe_row__project=project
                ).select_related("submitted_by", "approved_by")
            }

            result = []
            for row in rows:
                periods_data = []
                for p in periods:
                    rd = rd_index.get((row.id, p.id))
                    periods_data.append({
                        "period_id":    p.id,
                        "period_label": p.label,
                        "period_end":   str(p.end_date),
                        "period_status": p.status,
                        "data": {
                            "id":               rd.id           if rd else None,
                            "actual_value":     str(rd.actual_value) if rd else None,
                            "narrative":        rd.narrative    if rd else "",
                            "rag_status":       rd.rag_status   if rd else None,
                            "achievement_rate": str(rd.achievement_rate) if rd and rd.achievement_rate else None,
                            "status":           rd.status       if rd else None,
                            "approved_at":      rd.approved_at.isoformat() if rd and rd.approved_at else None,
                        } if rd else None,
                    })
                result.append({
                    "row_id":           row.id,
                    "indicator_code":   row.indicator.code,
                    "indicator_name":   row.indicator.name,
                    "indicator_unit":   row.indicator.unit,
                    "indicator_direction": row.indicator.direction,
                    "chain_level":      row.chain_level,
                    "baseline_value":   str(row.baseline_value) if row.baseline_value else None,
                    "baseline_year":    row.baseline_year,
                    "periods":          periods_data,
                })

            return Response({
                "project_id":   pk,
                "project_code": project.code,
                "rows":         result,
                "periods":      [{"id": p.id, "label": p.label, "end_date": str(p.end_date), "status": p.status} for p in periods],
            })
        except Exception as exc:
            import traceback
            return Response(
                {"detail": f"{type(exc).__name__}: {exc}", "trace": traceback.format_exc()},
                status=500,
            )
