from django.core.exceptions import ValidationError
from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import ReadOnlyOrHasModulePermission
from apps.project.models import Project

from .models import Indicator, LogframeRow, LogframeTarget, TargetRevision, TheoryOfChange, ToCNode

def fmt_decimal(value):
    """Formate un Decimal : supprime les zéros décimaux inutiles.
    1500.0000 → '1500'  |  3.5000 → '3.5'  |  2.7500 → '2.75'
    """
    if value is None:
        return None
    from decimal import Decimal
    d = Decimal(str(value)).normalize()
    # Si l'exposant est positif (ex. 1.5E+3), repasser en notation fixe
    if d == d.to_integral_value():
        return str(d.to_integral_value())
    return str(d)


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

        # Bloquer la saisie sur les périodes non ouvertes
        if period.status == "upcoming":
            raise DRFValidationError({
                "detail": f"La période « {period.label} » n'est pas encore ouverte (statut : upcoming). La saisie sera disponible à partir du {period.start_date}."
            })
        if period.status == "approved":
            raise DRFValidationError({
                "detail": f"La période « {period.label} » est approuvée et verrouillée."
            })

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
                            "actual_value":     fmt_decimal(rd.actual_value) if rd else None,
                            "narrative":        rd.narrative    if rd else "",
                            "rag_status":       rd.rag_status   if rd else None,
                            "achievement_rate": fmt_decimal(rd.achievement_rate) if rd and rd.achievement_rate else None,
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
                    "baseline_value":   fmt_decimal(row.baseline_value) if row.baseline_value else None,
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


# ---------------------------------------------------------------------------
# SF-6 — Désagrégation : dimensions par indicateur
# ---------------------------------------------------------------------------

class IndicatorDisaggregationView(APIView):
    """
    GET  /api/results/indicators/<ind_pk>/disaggregations/
         Liste les dimensions de désagrégation de l'indicateur.

    POST /api/results/indicators/<ind_pk>/disaggregations/
         Ajoute une dimension (LLFMU).
         Body: { "name": "Sexe", "categories": ["Homme","Femme","Non précisé"], "order": 0 }
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def _get_indicator(self, ind_pk):
        return get_object_or_404(Indicator, pk=ind_pk)

    def get(self, request, ind_pk):
        from .models import IndicatorDisaggregation
        from .serializers import IndicatorDisaggregationSerializer
        qs = IndicatorDisaggregation.objects.filter(indicator_id=ind_pk)
        return Response(IndicatorDisaggregationSerializer(qs, many=True).data)

    def post(self, request, ind_pk):
        from .models import IndicatorDisaggregation
        from .serializers import IndicatorDisaggregationSerializer
        indicator = self._get_indicator(ind_pk)
        ser = IndicatorDisaggregationSerializer(data={**request.data, "indicator": indicator.id})
        ser.is_valid(raise_exception=True)
        dim = ser.save()
        return Response(IndicatorDisaggregationSerializer(dim).data, status=status.HTTP_201_CREATED)


class IndicatorDisaggregationDetailView(APIView):
    """
    PATCH  /api/results/indicators/<ind_pk>/disaggregations/<dim_pk>/
    DELETE /api/results/indicators/<ind_pk>/disaggregations/<dim_pk>/
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def _get(self, ind_pk, dim_pk):
        from .models import IndicatorDisaggregation
        return get_object_or_404(IndicatorDisaggregation, pk=dim_pk, indicator_id=ind_pk)

    def patch(self, request, ind_pk, dim_pk):
        from .serializers import IndicatorDisaggregationSerializer
        dim = self._get(ind_pk, dim_pk)
        ser = IndicatorDisaggregationSerializer(dim, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, ind_pk, dim_pk):
        self._get(ind_pk, dim_pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# SF-6 — Désagrégation : valeurs par ResultsData
# ---------------------------------------------------------------------------

class DisaggregationValueView(APIView):
    """
    GET  /api/projects/<pk>/results/<rd_pk>/disaggregation/
         Retourne toutes les valeurs désagrégées + les dimensions disponibles
         pour cet indicateur + avertissement somme ≠ total.

    POST /api/projects/<pk>/results/<rd_pk>/disaggregation/
         Sauvegarde les valeurs d'une dimension.
         Body: { "dimension_id": 3, "values": [{"category":"Homme","value":120}, ...] }
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def _get_rd(self, pk, rd_pk):
        from .models import ResultsData
        return get_object_or_404(ResultsData, pk=rd_pk, logframe_row__project_id=pk)

    def get(self, request, pk, rd_pk):
        from .models import DisaggregationValue, IndicatorDisaggregation
        from .serializers import DisaggregationValueSerializer, IndicatorDisaggregationSerializer

        rd = self._get_rd(pk, rd_pk)
        indicator = rd.logframe_row.indicator

        # Dimensions disponibles pour cet indicateur
        dimensions = IndicatorDisaggregation.objects.filter(indicator=indicator)

        # Valeurs saisies
        values = DisaggregationValue.objects.filter(results_data=rd).select_related("dimension")

        # Avertissements : somme par dimension vs actual_value
        warnings = []
        for dim in dimensions:
            dim_values = values.filter(dimension=dim)
            total = sum(v.value for v in dim_values)
            if dim_values.exists() and total != rd.actual_value:
                warnings.append({
                    "dimension": dim.name,
                    "sum": str(total),
                    "actual": fmt_decimal(rd.actual_value),
                    "message": f"La somme des valeurs pour « {dim.name} » ({total}) ≠ valeur totale ({rd.actual_value}).",
                })

        return Response({
            "results_data_id": rd.id,
            "actual_value":    fmt_decimal(rd.actual_value),
            "dimensions":      IndicatorDisaggregationSerializer(dimensions, many=True).data,
            "values":          DisaggregationValueSerializer(values, many=True).data,
            "warnings":        warnings,
        })

    def post(self, request, pk, rd_pk):
        from decimal import Decimal
        from .models import DisaggregationValue, IndicatorDisaggregation
        from .serializers import DisaggregationValueSerializer, DisaggregationValueWriteSerializer

        rd  = self._get_rd(pk, rd_pk)
        ser = DisaggregationValueWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        dim = get_object_or_404(
            IndicatorDisaggregation,
            pk=d["dimension_id"],
            indicator=rd.logframe_row.indicator,
        )

        # Upsert de chaque valeur
        saved = []
        for item in d["values"]:
            category = str(item.get("category", "")).strip()
            value    = Decimal(str(item.get("value", 0)))
            if not category:
                continue
            dv, _ = DisaggregationValue.objects.update_or_create(
                results_data=rd, dimension=dim, category=category,
                defaults={"value": value},
            )
            saved.append(dv)

        # Vérification somme (avertissement non bloquant)
        total   = sum(Decimal(str(item.get("value", 0))) for item in d["values"])
        warning = None
        if total != rd.actual_value:
            warning = f"La somme des valeurs ({total}) ≠ valeur totale ({rd.actual_value})."

        return Response({
            "saved":   DisaggregationValueSerializer(saved, many=True).data,
            "warning": warning,
        }, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# SF-4 — Agrégation portefeuille (roll-up multi-niveaux)
# ---------------------------------------------------------------------------

class PortfolioAggregationView(APIView):
    """
    GET /api/results/portfolio/
        Agrégation des valeurs réelles par indicateur sur l'ensemble du portefeuille.
        Filtres optionnels : ?hub=<id> &sector=<id> &period=<id> &chain_level=<level>

    Retourne pour chaque indicateur :
      - les valeurs agrégées par projet, par hub, par secteur
      - le taux d'atteinte global (actual / target cumulée)
      - le statut RAG agrégé
      - la règle d'agrégation appliquée

    Règles d'agrégation (RG-4.1) :
      sum              → somme des actuals approuvés
      average          → moyenne simple
      weighted_average → moyenne pondérée par budget projet
      ratio            → somme numérateurs / somme dénominateurs (valeurs brutes)
      last_value       → dernière valeur disponible (date la plus récente)
      maximum          → maximum des actuals
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def get(self, request):
        from decimal import Decimal
        from django.db.models import Sum, Avg, Max, Q
        from apps.project.models import Project, ReportingPeriod
        from .models import ResultsData, LogframeRow

        # ── Filtres ──────────────────────────────────────────────────────────
        hub_id      = request.query_params.get("hub")
        sector_id   = request.query_params.get("sector")
        period_id   = request.query_params.get("period")
        chain_level = request.query_params.get("chain_level")
        country_id  = request.query_params.get("country")
        donor_id    = request.query_params.get("donor")
        fragility   = request.query_params.get("fragility")
        rag_filter  = request.query_params.get("rag")

        # Projets Effective uniquement (workspace actif)
        projects = Project.objects.filter(
            workspace__isnull=False,
        ).select_related("hub", "primary_sector")

        if hub_id:
            projects = projects.filter(
                models.Q(hub_id=hub_id) |
                models.Q(project_countries__is_lead=True, project_countries__country__hub_id=hub_id)
            ).distinct()
        if sector_id:
            projects = projects.filter(primary_sector_id=sector_id)
        if country_id:
            projects = projects.filter(
                project_countries__country_id=country_id
            ).distinct()
        if donor_id:
            projects = projects.filter(
                financial_envelope__sources__donor_id=donor_id
            ).distinct()
        if fragility:
            projects = projects.filter(fragility_status=fragility)

        project_ids = list(projects.values_list("id", flat=True))

        # Lignes logframe dans le périmètre
        rows_qs = LogframeRow.objects.filter(
            project_id__in=project_ids
        ).select_related("indicator", "indicator__sector", "project__hub", "project__primary_sector")
        if chain_level:
            rows_qs = rows_qs.filter(chain_level=chain_level)

        # Valeurs approuvées uniquement (source officielle — RG-4.1)
        rd_filter = Q(logframe_row__project_id__in=project_ids, status="approved")
        if period_id:
            rd_filter &= Q(reporting_period_id=period_id)

        rd_all = ResultsData.objects.filter(rd_filter).select_related(
            "logframe_row__indicator",
            "logframe_row__project",
            "reporting_period",
        )

        # Index : indicator_id → list of (ResultsData, project)
        from collections import defaultdict
        by_indicator = defaultdict(list)
        for rd in rd_all:
            by_indicator[rd.logframe_row.indicator_id].append(rd)

        # Budget par projet (pour weighted_average)
        budget_by_project = {p.id: float(p.budget_amount or 0) for p in projects}
        total_budget = sum(budget_by_project.values()) or 1

        result = []
        # Grouper les rows par indicateur
        rows_by_indicator = defaultdict(list)
        for row in rows_qs:
            rows_by_indicator[row.indicator_id].append(row)

        for ind_id, rows in rows_by_indicator.items():
            indicator = rows[0].indicator
            rule      = indicator.aggregation_rule or "sum"
            rd_list   = by_indicator.get(ind_id, [])

            if not rd_list:
                # Aucune donnée approuvée — on retourne quand même la ligne
                result.append({
                    "indicator_id":   ind_id,
                    "indicator_code": indicator.code,
                    "indicator_name": indicator.name,
                    "indicator_unit": indicator.unit,
                    "chain_level":    rows[0].chain_level if rows else indicator.chain_level,
                    "aggregation_rule": rule,
                    "aggregated_value": None,
                    "achievement_rate": None,
                    "rag_status":       "na",
                    "projects_count":   0,
                    "breakdown":        [],
                })
                continue

            actuals = [float(rd.actual_value) for rd in rd_list]

            # Appliquer la règle
            if rule == "sum":
                agg = sum(actuals)
            elif rule == "average":
                agg = sum(actuals) / len(actuals)
            elif rule == "weighted_average":
                weights = [budget_by_project.get(rd.logframe_row.project_id, 0) for rd in rd_list]
                w_total = sum(weights) or 1
                agg = sum(a * w for a, w in zip(actuals, weights)) / w_total
            elif rule == "maximum":
                agg = max(actuals)
            elif rule == "last_value":
                latest = max(rd_list, key=lambda r: r.reporting_period.end_date if r.reporting_period else r.updated_at)
                agg = float(latest.actual_value)
            else:
                agg = sum(actuals)

            # Cible agrégée (somme des cibles approuvées)
            from .models import LogframeTarget
            targets = LogframeTarget.objects.filter(
                logframe_row__indicator_id=ind_id,
                logframe_row__project_id__in=project_ids,
                status__in=["approved", "draft"],  # inclure draft — cibles ToC créées en draft
            )
            target_sum = float(targets.aggregate(s=Sum("target_value"))["s"] or 0)

            # RAG agrégé
            if target_sum > 0:
                rate = (agg / target_sum) * 100
                rag  = "green" if rate >= 90 else "amber" if rate >= 60 else "red"
            else:
                rate = None
                rag  = "na"

            # Ventilation par projet
            breakdown = []
            for rd in rd_list:
                proj = rd.logframe_row.project
                # Cible projet individuelle
                proj_targets = LogframeTarget.objects.filter(
                    logframe_row__indicator_id=ind_id,
                    logframe_row__project_id=proj.id,
                    status__in=["approved", "draft"],
                )
                proj_target_sum = float(proj_targets.aggregate(s=Sum("target_value"))["s"] or 0)
                proj_actual = float(rd.actual_value)
                proj_rate = (proj_actual / proj_target_sum * 100) if proj_target_sum > 0 else None
                proj_rag = (
                    "green" if proj_rate is not None and proj_rate >= 90
                    else "amber" if proj_rate is not None and proj_rate >= 60
                    else "red" if proj_rate is not None
                    else "na"
                )
                # Résoudre le hub via Project.hub OU pays lead
                hub_name = None
                if proj.hub_id:
                    hub_name = proj.hub.name
                else:
                    lead_country = proj.project_countries.filter(
                        is_lead=True
                    ).select_related("country__hub").first()
                    if lead_country and lead_country.country.hub_id:
                        hub_name = lead_country.country.hub.name

                breakdown.append({
                    "project_id":   proj.id,
                    "project_code": proj.code,
                    "project_name": proj.name[:60],
                    "hub":          hub_name,
                    "sector":       proj.primary_sector.name if proj.primary_sector else None,
                    "actual_value": fmt_decimal(rd.actual_value),
                    "target_value": fmt_decimal(Decimal(str(proj_target_sum))) if proj_target_sum else None,
                    "achievement_rate": fmt_decimal(Decimal(str(round(proj_rate, 2)))) if proj_rate is not None else None,
                    "rag_status":   proj_rag,
                })

            result.append({
                "indicator_id":     ind_id,
                "indicator_code":   indicator.code,
                "indicator_name":   indicator.name,
                "indicator_unit":   indicator.unit,
                "chain_level":      rows[0].chain_level if rows else indicator.chain_level,
                "aggregation_rule": rule,
                "aggregated_value": fmt_decimal(Decimal(str(round(agg, 4)))),
                "target_value":     fmt_decimal(Decimal(str(target_sum))) if target_sum else None,
                "achievement_rate": fmt_decimal(Decimal(str(round(rate, 2)))) if rate is not None else None,
                "rag_status":       rag,
                "projects_count":   len(rd_list),
                "breakdown":        breakdown,
            })

        # Appliquer le filtre RAG après calcul
        if rag_filter:
            result = [r for r in result if r["rag_status"] == rag_filter]

        # Trier par chain_level puis code indicateur
        level_order = ["activity", "output", "immediate_outcome", "intermediate_outcome", "ultimate_outcome"]
        result.sort(key=lambda x: (
            level_order.index(x["chain_level"]) if x["chain_level"] in level_order else 99,
            x["indicator_code"],
        ))

        # Méta-résumé
        approved_count = len([r for r in result if r["aggregated_value"] is not None])
        green = len([r for r in result if r["rag_status"] == "green"])
        amber = len([r for r in result if r["rag_status"] == "amber"])
        red   = len([r for r in result if r["rag_status"] == "red"])

        return Response({
            "meta": {
                "projects_count":  len(project_ids),
                "indicators_count": len(result),
                "with_data":       approved_count,
                "rag_summary":     {"green": green, "amber": amber, "red": red, "na": len(result) - green - amber - red},
            },
            "filters": {
                "hub":         hub_id,
                "sector":      sector_id,
                "period":      period_id,
                "chain_level": chain_level,
                "country":     country_id,
                "donor":       donor_id,
                "fragility":   fragility,
                "rag":         rag_filter,
            },
            "indicators": result,
        })


# ---------------------------------------------------------------------------
# SF-7 — Générateur PIRS (Performance Indicator Reference Sheet)
# RG-7.1 / RG-7.2 / RG-7.3
# ---------------------------------------------------------------------------

class PIRSDataView(APIView):
    """
    GET /api/projects/<pk>/logframe/<row_pk>/pirs/
        Retourne toutes les données pour générer le PIRS d'un indicateur.
        Données temps réel tirées de la bibliothèque + moteur de performance.

    GET /api/projects/<pk>/logframe/<row_pk>/pirs/?format=docx
        Génère et retourne le fichier DOCX.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def get(self, request, pk, row_pk):
        from decimal import Decimal
        from django.db.models import Sum
        from apps.project.models import ReportingPeriod
        from .models import ResultsData, LogframeTarget, IndicatorDisaggregation, DisaggregationValue

        row     = get_object_or_404(LogframeRow, pk=row_pk, project_id=pk)
        project = row.project
        ind     = row.indicator

        # ── Cibles ────────────────────────────────────────────────────────
        targets = list(row.targets.order_by("target_date").values(
            "id", "target_value", "target_date", "label",
            "status", "is_original_pad",
        ))
        for t in targets:
            t["target_value"] = fmt_decimal(t["target_value"])

        # ── Actuals par période ───────────────────────────────────────────
        periods = project.reporting_periods.order_by("period_number")
        actuals = []
        for p in periods:
            rd = ResultsData.objects.filter(
                logframe_row=row, reporting_period=p
            ).first()
            if rd:
                # Recalculer achievement à la volée (cibles draft incluses)
                target_at_period = row.targets.filter(
                    target_date__lte=p.end_date,
                    status__in=["approved", "draft"],
                ).order_by("target_date").last() or row.targets.filter(
                    status__in=["approved", "draft"],
                ).order_by("target_date").first()

                live_rate = None
                live_rag  = rd.rag_status
                if target_at_period and target_at_period.target_value:
                    t_val = float(target_at_period.target_value)
                    a_val = float(rd.actual_value)
                    if t_val > 0:
                        live_rate = round((a_val / t_val) * 100, 2)
                        live_rag  = "green" if live_rate >= 90 else "amber" if live_rate >= 60 else "red"

                actuals.append({
                    "period_id":        p.id,
                    "period_label":     p.label,
                    "period_end":       str(p.end_date),
                    "actual_value":     fmt_decimal(rd.actual_value),
                    "target_value":     fmt_decimal(target_at_period.target_value) if target_at_period else None,
                    "narrative":        rd.narrative,
                    "rag_status":       live_rag,
                    "achievement_rate": fmt_decimal(Decimal(str(live_rate))) if live_rate is not None else None,
                    "status":           rd.status,
                    "approved_at":      rd.approved_at.isoformat() if rd.approved_at else None,
                })

        # ── Désagrégations ────────────────────────────────────────────────
        disagg_dims = IndicatorDisaggregation.objects.filter(indicator=ind).order_by("order")
        disaggregations = []
        for dim in disagg_dims:
            dim_data = {"dimension": dim.name, "categories": []}
            for p in periods:
                rd = ResultsData.objects.filter(logframe_row=row, reporting_period=p).first()
                if rd:
                    values = DisaggregationValue.objects.filter(
                        results_data=rd, dimension=dim
                    ).values("category", "value")
                    if values.exists():
                        dim_data["categories"].append({
                            "period_label": p.label,
                            "values": [{"cat": v["category"], "val": fmt_decimal(v["value"])} for v in values],
                        })
            disaggregations.append(dim_data)

        # ── Hub via pays lead ─────────────────────────────────────────────
        hub_name = None
        if project.hub_id:
            hub_name = project.hub.name
        else:
            lead = project.project_countries.filter(
                is_lead=True
            ).select_related("country__hub").first()
            if lead and lead.country.hub_id:
                hub_name = lead.country.hub.name

        lead_country = project.project_countries.filter(
            is_lead=True
        ).select_related("country").first()

        # ── SDGs ─────────────────────────────────────────────────────────
        sdg_numbers = list(ind.related_sdgs.values_list("number", flat=True))

        # ── PAD ──────────────────────────────────────────────────────────────
        pad_url  = project.pad_reference_file.url  if project.pad_reference_file else None
        pad_name = project.pad_reference_file.name.rsplit("/", 1)[-1] if project.pad_reference_file else None

        pirs_data = {
            # En-tête projet
            "project": {
                "id":             project.id,
                "code":           project.code,
                "name":           project.name,
                "acronym":        project.acronym or "",
                "sector":         project.primary_sector.name if project.primary_sector else None,
                "hub":            hub_name,
                "country":        lead_country.country.name if lead_country else None,
                "start_date":     str(project.start_date) if project.start_date else None,
                "end_date":       str(project.end_date) if project.end_date else None,
                "lifecycle_stage": project.lifecycle_stage,
                "pad_url":        pad_url,
                "pad_name":       pad_name,
            },
            # Définition indicateur (RG-7.1)
            "indicator": {
                "id":                 ind.id,
                "code":               ind.code,
                "name":               ind.name,
                "definition":         ind.definition,
                "unit":               ind.unit,
                "indicator_type":     ind.get_indicator_type_display(),
                "direction":          ind.get_direction_display(),
                "aggregation_rule":   ind.get_aggregation_rule_display(),
                "chain_level":        row.chain_level,
                "chain_level_display": row.get_chain_level_display(),
                "calculation_method": ind.calculation_method,
                "numerator":          ind.numerator,
                "denominator":        ind.denominator,
                "formula":            ind.formula,
                "data_source":        ind.data_source,
                "collection_method":  ind.collection_method,
                "reporting_frequency": ind.get_reporting_frequency_display(),
                "means_of_verification": ind.means_of_verification,
                "responsible":        ind.responsible,
                "assumptions":        ind.assumptions,
                "limitations":        ind.limitations,
                "cross_cutting_tags": ind.cross_cutting_tags,
                "related_sdgs":       sdg_numbers,
                "version":            ind.version,
            },
            # Baseline (RG-3.1)
            "baseline": {
                "value":  fmt_decimal(row.baseline_value) if row.baseline_value else None,
                "year":   row.baseline_year,
                "source": row.baseline_source,
                "measurement_frequency": row.get_measurement_frequency_display(),
                "notes":  row.notes,
            },
            # Cibles (RG-3.2)
            "targets": targets,
            # Actuals par période
            "actuals": actuals,
            # Désagrégations (SF-6)
            "disaggregations": disaggregations,
            # Méta
            "generated_at": __import__("django.utils.timezone", fromlist=["now"]).now().isoformat(),
        }

        fmt = request.query_params.get("format", "json")
        if fmt == "docx":
            return self._generate_docx(pirs_data)

        return Response(pirs_data)

    def _generate_docx(self, data):
        """Génère le PIRS en DOCX via python-docx."""
        import io
        from django.http import HttpResponse
        from docx import Document
        from docx.shared import Pt, RGBColor, Cm
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement

        def set_cell_bg(cell, hex_color):
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear")
            shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"), hex_color)
            tcPr.append(shd)

        def add_section_heading(doc, title):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after  = Pt(4)
            run = p.add_run(title.upper())
            run.bold = True
            run.font.size = Pt(10)
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            pPr = p._p.get_or_add_pPr()
            shd = OxmlElement("w:shd")
            shd.set(qn("w:val"), "clear")
            shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"), "111111")
            pPr.append(shd)
            p.paragraph_format.left_indent = Cm(0.3)

        def add_info_table(doc, rows):
            table = doc.add_table(rows=len(rows), cols=2)
            table.style = "Table Grid"
            table.columns[0].width = Cm(5)
            table.columns[1].width = Cm(12)
            for i, (label, value) in enumerate(rows):
                if not value and value != 0:
                    continue
                row = table.rows[i]
                c0, c1 = row.cells[0], row.cells[1]
                set_cell_bg(c0, "F9FAFB")
                r0 = c0.paragraphs[0].add_run(str(label))
                r0.bold = True
                r0.font.size = Pt(8)
                r0.font.color.rgb = RGBColor(0x37, 0x41, 0x51)
                r1 = c1.paragraphs[0].add_run(str(value))
                r1.font.size = Pt(9)
            doc.add_paragraph()

        doc  = Document()
        proj = data["project"]
        ind  = data["indicator"]
        base = data["baseline"]
        tgts = data["targets"]
        acts = data["actuals"]
        gen_date = data["generated_at"][:10]

        # ── Titre ──────────────────────────────────────────────────────
        title_p = doc.add_paragraph()
        run = title_p.add_run("PERFORMANCE INDICATOR REFERENCE SHEET")
        run.bold = True
        run.font.size = Pt(14)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pPr = title_p._p.get_or_add_pPr()
        shd = OxmlElement("w:shd"); shd.set(qn("w:val"),"clear"); shd.set(qn("w:color"),"auto"); shd.set(qn("w:fill"),"111111"); pPr.append(shd)

        sub_p = doc.add_paragraph()
        sub_r = sub_p.add_run(f"Lives & Livelihoods Fund 2 · IsDB · Generated {gen_date}")
        sub_r.font.size = Pt(9)
        sub_r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pPr2 = sub_p._p.get_or_add_pPr()
        shd2 = OxmlElement("w:shd"); shd2.set(qn("w:val"),"clear"); shd2.set(qn("w:color"),"auto"); shd2.set(qn("w:fill"),"333333"); pPr2.append(shd2)

        doc.add_paragraph()

        # ── A. Projet ──────────────────────────────────────────────────
        add_section_heading(doc, "A. Project Identification")
        add_info_table(doc, [
            ("Project Code",  proj.get("code")),
            ("Project Name",  proj.get("name")),
            ("Acronym",       proj.get("acronym")),
            ("Sector",        proj.get("sector")),
            ("Hub",           proj.get("hub")),
            ("Country",       proj.get("country")),
            ("Period",        f"{proj.get('start_date','—')} → {proj.get('end_date','—')}"),
            ("Stage",         (proj.get("lifecycle_stage") or "").replace("_"," ").upper()),
            ("PAD Document",  proj.get("pad_name") or "—"),
        ])

        # ── B. Définition ──────────────────────────────────────────────
        add_section_heading(doc, "B. Indicator Definition")
        add_info_table(doc, [
            ("Code",               ind.get("code")),
            ("Full Name",          ind.get("name")),
            ("Chain Level",        ind.get("chain_level_display")),
            ("Definition",         ind.get("definition")),
            ("Unit",               ind.get("unit")),
            ("Type",               ind.get("indicator_type")),
            ("Direction",          ind.get("direction")),
            ("Aggregation Rule",   ind.get("aggregation_rule")),
            ("Calculation Method", ind.get("calculation_method")),
            ("Formula",            ind.get("formula")),
        ])

        # ── C. Collecte ────────────────────────────────────────────────
        add_section_heading(doc, "C. Data Collection")
        add_info_table(doc, [
            ("Data Source",           ind.get("data_source")),
            ("Collection Method",     ind.get("collection_method")),
            ("Reporting Frequency",   ind.get("reporting_frequency")),
            ("Means of Verification", ind.get("means_of_verification")),
            ("Responsible Party",     ind.get("responsible")),
            ("Assumptions",           ind.get("assumptions")),
            ("Limitations",           ind.get("limitations")),
        ])

        # ── D. Baseline ────────────────────────────────────────────────
        add_section_heading(doc, "D. Baseline")
        add_info_table(doc, [
            ("Baseline Value", f"{base.get('value','—')} {ind.get('unit','')}"),
            ("Reference Year", base.get("year")),
            ("Source",         base.get("source")),
            ("Notes",          base.get("notes")),
        ])

        # ── E. Cibles ──────────────────────────────────────────────────
        add_section_heading(doc, "E. Targets")
        if tgts:
            tbl = doc.add_table(rows=1+len(tgts), cols=4)
            tbl.style = "Table Grid"
            for i, hdr in enumerate(["Label","Target Value","Deadline","Status"]):
                cell = tbl.rows[0].cells[i]
                set_cell_bg(cell, "111111")
                r = cell.paragraphs[0].add_run(hdr)
                r.bold = True; r.font.size = Pt(8); r.font.color.rgb = RGBColor(255,255,255)
            for ri, t in enumerate(tgts, 1):
                cells = tbl.rows[ri].cells
                cells[0].paragraphs[0].add_run(t.get("label","—")).font.size = Pt(9)
                cells[1].paragraphs[0].add_run(f"{t.get('target_value','—')} {ind.get('unit','')}").font.size = Pt(9)
                cells[2].paragraphs[0].add_run(str(t.get("target_date","—"))).font.size = Pt(9)
                cells[3].paragraphs[0].add_run(t.get("status","").upper()).font.size = Pt(9)
            doc.add_paragraph()

        # ── F. Actuals ─────────────────────────────────────────────────
        add_section_heading(doc, "F. Results by Reporting Period")
        if acts:
            tbl = doc.add_table(rows=1+len(acts), cols=5)
            tbl.style = "Table Grid"
            for i, hdr in enumerate(["Period","Actual","Target","Achievement","RAG"]):
                cell = tbl.rows[0].cells[i]
                set_cell_bg(cell, "111111")
                r = cell.paragraphs[0].add_run(hdr)
                r.bold = True; r.font.size = Pt(8); r.font.color.rgb = RGBColor(255,255,255)
            for ri, a in enumerate(acts, 1):
                cells = tbl.rows[ri].cells
                cells[0].paragraphs[0].add_run(a.get("period_label","")).font.size = Pt(9)
                cells[1].paragraphs[0].add_run(f"{a.get('actual_value','—')} {ind.get('unit','')}").font.size = Pt(9)
                cells[2].paragraphs[0].add_run(f"{a.get('target_value','—')} {ind.get('unit','')}").font.size = Pt(9)
                cells[3].paragraphs[0].add_run(f"{a.get('achievement_rate','—')}%" if a.get("achievement_rate") else "—").font.size = Pt(9)
                cells[4].paragraphs[0].add_run({"green":"On Track","amber":"At Risk","red":"Off Track"}.get(a.get("rag_status",""),"No Data")).font.size = Pt(9)
            doc.add_paragraph()

        # ── Pied de page ────────────────────────────────────────────────
        footer_p = doc.add_paragraph()
        footer_r = footer_p.add_run(f"PIRS · {ind.get('code')} · {proj.get('code')} · v{ind.get('version',1)} · {gen_date} · ARBM-MES")
        footer_r.font.size = Pt(7)
        footer_r.font.color.rgb = RGBColor(0x9C, 0xA3, 0xAF)
        footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # ── Sérialisation ───────────────────────────────────────────────
        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        content = buf.read()

        filename = f"PIRS_{proj.get('code')}_{ind.get('code')}.docx"
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
