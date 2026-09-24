from django.core.exceptions import ValidationError
from django.db import models
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import ReadOnlyOrHasModulePermission
from core.scope import ProjectInScope, hub_q
from apps.project.models import Project

from apps.reference.models import Sdg, Sector
from .models import (
    AGGREGATION_RULE_CHOICES,
    CHAIN_LEVEL_CHOICES,
    CROSS_CUTTING_TAG_CHOICES,
    Indicator,
    LogframeRow,
    LogframeTarget,
    TargetRevision,
    TheoryOfChange,
    ToCNode,
)

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
        from apps.reference.filters import (
            indicator_sector_field, read_project_type, read_sector_id, sector_q,
        )

        qs = (Indicator.objects.filter(is_active=True)
              .select_related("sector", "llf_sector")
              .prefetch_related("related_sdgs"))
        # ADR 0014 : sans ?taxonomy=, tout le catalogue (le selecteur du cadre
        # logique en a besoin) ; avec, les indicateurs de cette taxonomie, et
        # ?sector= parle la meme (un pilier IsDB englobe ses secteurs).
        # ?type= designe deja le type d'indicateur sur cette route.
        params = request.query_params
        if params.get("taxonomy"):
            field = indicator_sector_field(read_project_type(params, name="taxonomy"))
            qs = qs.filter(**{f"{field}__isnull": False})
        else:
            field = "sector"
        sector = read_sector_id(params)
        if sector:
            qs = qs.filter(sector_q(field, sector))
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
            # Offerts par le formulaire du catalogue depuis SF-1 mais absents
            # de cette liste : les trois etaient silencieusement ignores.
            "chain_level", "aggregation_rule", "cross_cutting_tags",
        ]
        data = {k: v for k, v in request.data.items() if k in editable}

        # La vue ne passe pas par un serializer en ecriture : les vocabulaires
        # fermes se verifient ici, sinon un 200 repond a une valeur refusee.
        errors = {}
        if "chain_level" in data and data["chain_level"]:
            if data["chain_level"] not in dict(CHAIN_LEVEL_CHOICES):
                errors["chain_level"] = "Unknown chain level."
        if "aggregation_rule" in data:
            if data["aggregation_rule"] not in dict(AGGREGATION_RULE_CHOICES):
                errors["aggregation_rule"] = "Unknown aggregation rule."
        if "cross_cutting_tags" in data:
            tags = data["cross_cutting_tags"]
            known = dict(CROSS_CUTTING_TAG_CHOICES)
            if not isinstance(tags, list) or any(t not in known for t in tags):
                errors["cross_cutting_tags"] = "Unknown cross-cutting tag."

        # Les ODD sont un M2M : ils arrivent sous le meme nom que celui rendu
        # par le serializer, pour ne pas avoir deux vocabulaires cote client.
        sdg_numbers = request.data.get("related_sdg_numbers")
        if sdg_numbers is not None:
            if not isinstance(sdg_numbers, list) or any(
                not isinstance(n, int) or isinstance(n, bool) for n in sdg_numbers
            ):
                errors["related_sdg_numbers"] = "Expected a list of SDG numbers."
            elif Sdg.objects.filter(number__in=sdg_numbers).count() != len(set(sdg_numbers)):
                errors["related_sdg_numbers"] = "Unknown SDG number."

        # Les deux secteurs (ADR 0014) : chacun dans sa taxonomie ; le
        # secteur IsDB est obligatoire et jamais un pilier, le LLF facultatif.
        for field, taxonomy, required in (("sector", "isdb", True), ("llf_sector", "llf", False)):
            if field not in request.data:
                continue
            value = request.data.get(field)
            if value in (None, ""):
                if required:
                    errors[field] = "An indicator needs an IsDB sector."
                else:
                    data[field] = None
                continue
            sector = Sector.objects.filter(pk=value, taxonomy=taxonomy).first() if str(value).isdigit() else None
            if sector is None:
                errors[field] = f"Expected a {taxonomy.upper()} sector."
            elif sector.is_pillar:
                errors[field] = f"'{sector.name}' is a pillar; choose one of its sectors."
            else:
                data[field] = sector

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        for field, value in data.items():
            setattr(ind, field, value)
        ind.save()
        if sdg_numbers is not None:
            ind.related_sdgs.set(Sdg.objects.filter(number__in=sdg_numbers))

        # Rechargement propre pour renvoyer la fiche complete. `refresh_from_db`
        # ne rafraichit pas un M2M : on relit l'objet avec son prefetch.
        ind = Indicator.objects.prefetch_related("related_sdgs").get(pk=pk)
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

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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

    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        return Response(get_logframe_choices())


class LogframeRowDetailView(APIView):
    """
    GET    /api/projects/{pk}/logframe/{row_pk}/
    PATCH  /api/projects/{pk}/logframe/{row_pk}/
    DELETE /api/projects/{pk}/logframe/{row_pk}/
    """

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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

    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def get(self, request, pk):
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
                    "period_is_late": p.is_late,
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
            "project_code": project.official_reference_number,
            "rows":         result,
            "periods":      [{"id": p.id, "label": p.label, "end_date": str(p.end_date), "status": p.status, "is_late": p.is_late} for p in periods],
        })


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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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

        from apps.reference.filters import read_project_type, read_sector_id, sector_q

        # ── Filtres ──────────────────────────────────────────────────────────
        # ?type= (ADR 0014) : un seul type de projet a la fois, LLF par defaut.
        project_type = read_project_type(request.query_params)
        hub_id      = request.query_params.get("hub")
        sector_id   = read_sector_id(request.query_params)
        period_id   = request.query_params.get("period")
        chain_level = request.query_params.get("chain_level")
        country_id  = request.query_params.get("country")
        donor_id    = request.query_params.get("donor")
        rag_filter  = request.query_params.get("rag")

        # Projets Effective uniquement (workspace actif), dans le perimetre
        # de l'utilisateur (core/scope.py). ?hub= ne peut que restreindre a
        # l'interieur de ce perimetre, jamais l'elargir.
        projects = Project.objects.in_scope(request).of_taxonomy(project_type).filter(
            workspace__isnull=False,
        ).select_related("hub", "primary_sector")

        if hub_id:
            projects = projects.filter(hub_q((hub_id,))).distinct()
        if sector_id:
            # Un pilier (ADR 0007) englobe ses secteurs.
            projects = projects.filter(sector_q("primary_sector", sector_id))
        if country_id:
            projects = projects.filter(
                project_countries__country_id=country_id
            ).distinct()
        if donor_id:
            projects = projects.filter(
                financial_envelope__financing_sources__donor_id=donor_id
            ).distinct()

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

            # Ventilation par projet. Avec la règle "sum", une seule ligne par
            # projet : ses valeurs (périodes, lignes logframe) sont sommées.
            # Les autres règles gardent une ligne par valeur pour l'instant.
            if rule == "sum":
                per_project = {}
                for rd in rd_list:
                    proj = rd.logframe_row.project
                    if proj.id in per_project:
                        per_project[proj.id][1] += rd.actual_value
                    else:
                        per_project[proj.id] = [proj, rd.actual_value]
                entries = list(per_project.values())
            else:
                entries = [[rd.logframe_row.project, rd.actual_value] for rd in rd_list]

            breakdown = []
            for proj, actual_value in entries:
                # Cible projet individuelle
                proj_targets = LogframeTarget.objects.filter(
                    logframe_row__indicator_id=ind_id,
                    logframe_row__project_id=proj.id,
                    status__in=["approved", "draft"],
                )
                proj_target_sum = float(proj_targets.aggregate(s=Sum("target_value"))["s"] or 0)
                proj_actual = float(actual_value)
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
                    "project_code": proj.official_reference_number,
                    "project_name": proj.name[:60],
                    "hub":          hub_name,
                    "sector":       proj.primary_sector.name if proj.primary_sector else None,
                    "actual_value": fmt_decimal(actual_value),
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
                "projects_count":   len(breakdown),
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
                "type":        project_type,
                "sector":      sector_id,
                "period":      period_id,
                "chain_level": chain_level,
                "country":     country_id,
                "donor":       donor_id,
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
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
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
                "official_reference_number": project.official_reference_number,
                "name":           project.name,
                "sector":         project.primary_sector.name if project.primary_sector else None,
                "hub":            hub_name,
                "country":        lead_country.country.name if lead_country else None,
                "start_date":     str(project.start_date) if project.start_date else None,
                "end_date":       str(project.end_date) if project.end_date else None,
                "lifecycle_stage": project.lifecycle_stage,
                "lifecycle_stage_display": project.get_lifecycle_stage_display(),
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

        fmt = request.query_params.get("format", request.query_params.get("export", "json"))
        if fmt == "docx":
            return self._generate_docx(pirs_data)

        return Response(pirs_data)

    def _generate_docx(self, data):
        """Génère le PIRS en DOCX via python-docx.
        Couleurs ARBM-MIS : Navy #1B5A8C · Lime #A4C53F
        """
        import io, base64, tempfile, os
        from django.http import HttpResponse
        from django.utils import timezone
        try:
            from docx import Document
            from docx.shared import Pt, RGBColor, Cm, Inches
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.oxml.ns import qn
            from docx.oxml import OxmlElement
        except ImportError:
            return Response({"detail": "python-docx not installed."}, status=500)

        NAVY_HEX  = "1B5A8C"
        LIME_HEX  = "A4C53F"
        GRAY_HEX  = "6B7280"
        LIGHT_HEX = "F0F6DC"
        NAVY_RGB  = RGBColor(0x1B, 0x5A, 0x8C)
        LIME_RGB  = RGBColor(0xA4, 0xC5, 0x3F)
        WHITE_RGB = RGBColor(0xFF, 0xFF, 0xFF)
        GRAY_RGB  = RGBColor(0x9C, 0xA3, 0xAF)

        # Logo ARBM-MIS embarqué (PNG base64)
        LOGO_B64 = "iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAACl0lEQVR4nO3czZnTMBSF4S9TBy1NBZTAksXUwIIlJVABLdFHWOkZIGP7Sro/R3bO1pHkvI/tOLaubvf7nWfG81K9A6vnCTgZecBPn79LX2OkARueMqIs4P9oqoiSgFtYiohygEdIaohSgFYcJUQZwF4UFUQJwD2Mb19+DbXLSjmgBU8ZsRSw58hTRSwDHDltFRFLAEeveUfbKxDTAWfwLJ/LRkwF9MCzfD4TMQ3QE8/SLgsxBTACz9I+AzEcMBLP0k80YihgBp6lv0jEMMBMPEu/UYghgBV4lv4jEN0BK/Es43gjugIq4FnG80R0A1TCs4zrhegCqIhnGd8DcRpQGa8lEnEKcAW8lijEYcCV8FoiEIcAV8Rr8UbsBlwZr8UTsQvwDHgtXohmwDPhtXggmgDPiNcyi3gIeGa8lhnEXcAr4LWMIm4CXgmvZQTxQ8Ar4rX0Ij4AXhmvpQfxZW+jtdMzxor4D+Dvn19vW43efry67Ngq2fu+fzs9nMJPRDsebPyIXBmxBw92bmOuiNiLBwc30ldCHMEDw1+5KyCO4oHxYcKZEWfwoONx1hkRZ/Gg84HqmRA98GDgkf4ZEL3wYPCl0sqInngw8VpzRURvPJh8sb4SYgQeOEztWAExCg+cJhcpI0bigeP0NkXEaDxwnmCphJiBBwFTfBUQs/AgaJJ5JWImHgSWOVQgZuNBcKFNJmIFHiSUemUgVuFBUrFhJGIlHiSWu0YgVuNBcsG1J6ICHhSU/HsgquBB0aITM4hKeFC47MkIohoeFC+804OoiAcCSz9ZEFXxAG4qyyCPFLlU44HAEdjSi6GAB0KAYEdRwQMxQDjGUcIDQUDYRlLDA1FAeMRSxANhQHhHU8UDoduYVSN9BK6QP4t76VRD74/PAAAAAElFTkSuQmCC"

        import re as _re
        def strip_html(s):
            if not s:
                return ""
            return _re.sub(r"<[^>]+>", "", str(s)).replace("&amp;","&").replace("&nbsp;"," ").strip()

        def fmt_val(v):
            """Normalise une valeur numérique pour l'affichage DOCX — pas de notation scientifique."""
            if v is None or v == "" or v == "—":
                return "—"
            try:
                n = float(str(v))
                if n == int(n):
                    return f"{int(n):,}".replace(",", " ")
                # max 4 décimales, supprime les zéros trailing
                s = f"{n:.4f}".rstrip("0").rstrip(".")
                return s
            except (ValueError, TypeError):
                return str(v)

        def set_cell_bg(cell, hex_color):
            tcPr = cell._tc.get_or_add_tcPr()
            shd  = OxmlElement("w:shd")
            shd.set(qn("w:val"),   "clear")
            shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"),  hex_color)
            tcPr.append(shd)

        def set_cell_borders(cell, color="E5E7EB"):
            tcPr = cell._tc.get_or_add_tcPr()
            tcBorders = OxmlElement("w:tcBorders")
            for side in ["top","left","bottom","right"]:
                el = OxmlElement(f"w:{side}")
                el.set(qn("w:val"), "single")
                el.set(qn("w:sz"),  "4")
                el.set(qn("w:color"), color)
                tcBorders.append(el)
            tcPr.append(tcBorders)

        def add_header_row(table, headers, widths):
            row = table.add_row()
            for i, (hdr, w) in enumerate(zip(headers, widths)):
                cell = row.cells[i]
                set_cell_bg(cell, NAVY_HEX)
                set_cell_borders(cell, "2C4A6E")
                cell.width = Cm(w)
                p = cell.paragraphs[0]
                p.paragraph_format.space_before = Pt(3)
                p.paragraph_format.space_after  = Pt(3)
                run = p.add_run(hdr)
                run.bold = True
                run.font.size = Pt(8)
                run.font.color.rgb = WHITE_RGB

        def add_data_row(table, values, widths, bg="FFFFFF"):
            row = table.add_row()
            for i, (val, w) in enumerate(zip(values, widths)):
                cell = row.cells[i]
                set_cell_bg(cell, bg)
                set_cell_borders(cell)
                cell.width = Cm(w)
                p = cell.paragraphs[0]
                p.paragraph_format.space_before = Pt(2)
                p.paragraph_format.space_after  = Pt(2)
                run = p.add_run(str(val) if val else "—")
                run.font.size = Pt(9)

        def add_section_heading(doc, letter, title):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after  = Pt(4)
            p.paragraph_format.left_indent  = Cm(0)
            # Lettre lime
            r1 = p.add_run(f"{letter}.  ")
            r1.bold = True
            r1.font.size = Pt(11)
            r1.font.color.rgb = LIME_RGB
            # Titre blanc sur fond navy
            r2 = p.add_run(title.upper())
            r2.bold = True
            r2.font.size = Pt(10)
            r2.font.color.rgb = WHITE_RGB
            pPr = p._p.get_or_add_pPr()
            shd  = OxmlElement("w:shd")
            shd.set(qn("w:val"),   "clear")
            shd.set(qn("w:color"), "auto")
            shd.set(qn("w:fill"),  NAVY_HEX)
            pPr.append(shd)

        def add_info_table(doc, rows):
            """Tableau label | valeur."""
            filtered = [(l, v) for l, v in rows if v or v == 0]
            if not filtered:
                return
            table = doc.add_table(rows=0, cols=2)
            table.style = "Table Grid"
            W_LABEL = 5.0
            W_VALUE = 12.0
            for i, (label, value) in enumerate(filtered):
                row = table.add_row()
                # Label
                c0 = row.cells[0]; c0.width = Cm(W_LABEL)
                set_cell_bg(c0, "F8FAFC" if i % 2 == 0 else "F0F4F8")
                set_cell_borders(c0)
                c0.paragraphs[0].paragraph_format.space_before = Pt(2)
                c0.paragraphs[0].paragraph_format.space_after  = Pt(2)
                r0 = c0.paragraphs[0].add_run(str(label))
                r0.bold = True; r0.font.size = Pt(8.5)
                r0.font.color.rgb = NAVY_RGB
                # Valeur
                c1 = row.cells[1]; c1.width = Cm(W_VALUE)
                set_cell_bg(c1, "FFFFFF" if i % 2 == 0 else "F9FAFB")
                set_cell_borders(c1)
                c1.paragraphs[0].paragraph_format.space_before = Pt(2)
                c1.paragraphs[0].paragraph_format.space_after  = Pt(2)
                r1 = c1.paragraphs[0].add_run(str(value))
                r1.font.size = Pt(9)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)

        # ── Données ────────────────────────────────────────────────────
        proj = data["project"]
        ind  = data["indicator"]
        base = data["baseline"]
        tgts = data["targets"]
        acts = data["actuals"]
        now_local = timezone.localtime(timezone.now())
        gen_datetime = now_local.strftime("%d %B %Y at %H:%M")
        gen_date     = now_local.strftime("%d %B %Y")
        editor_name  = proj.get("official_reference_number") or "LLFMU"

        # ── Document ───────────────────────────────────────────────────
        doc = Document()

        # Marges
        for section in doc.sections:
            section.top_margin    = Cm(2)
            section.bottom_margin = Cm(2)
            section.left_margin   = Cm(2)
            section.right_margin  = Cm(1.5)
            section.page_width    = Cm(21)
            section.page_height   = Cm(29.7)

            # En-tête (header)
            header = section.header
            header.is_linked_to_previous = False
            htable = header.add_table(1, 3, Cm(17))
            htable.style = "Table Grid"
            # Cellule 1 : logo
            logo_cell = htable.rows[0].cells[0]
            logo_cell.width = Cm(2)
            set_cell_borders(logo_cell, "E5E7EB")
            logo_p = logo_cell.paragraphs[0]
            logo_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run_logo = logo_p.add_run()
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp.write(base64.b64decode(LOGO_B64))
                tmp_path = tmp.name
            try:
                run_logo.add_picture(tmp_path, width=Cm(1.2))
            finally:
                os.unlink(tmp_path)
            # Cellule 2 : titre
            title_cell = htable.rows[0].cells[1]
            title_cell.width = Cm(12)
            set_cell_borders(title_cell, "E5E7EB")
            tp = title_cell.paragraphs[0]
            tp.alignment = WD_ALIGN_PARAGRAPH.LEFT
            tr1 = tp.add_run("PERFORMANCE INDICATOR REFERENCE SHEET  ")
            tr1.bold = True; tr1.font.size = Pt(10)
            tr1.font.color.rgb = NAVY_RGB
            tp.add_run(f"\n{ind.get('code')} · {proj.get('official_reference_number')} · LLF2 / IsDB").font.size = Pt(7.5)
            # Cellule 3 : date
            date_cell = htable.rows[0].cells[2]
            date_cell.width = Cm(4)
            set_cell_borders(date_cell, "E5E7EB")
            dp = date_cell.paragraphs[0]
            dp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            dr1 = dp.add_run(gen_date + "\n")
            dr1.font.size = Pt(8); dr1.font.color.rgb = GRAY_RGB
            dr2 = dp.add_run(f"v{ind.get('version', 1)}")
            dr2.font.size = Pt(8); dr2.font.color.rgb = LIME_RGB; dr2.bold = True

            # Pied de page (footer)
            footer = section.footer
            footer.is_linked_to_previous = False
            ftable = footer.add_table(1, 2, Cm(17))
            ftable.style = "Table Grid"
            fl = ftable.rows[0].cells[0]
            fl.width = Cm(11)
            set_cell_borders(fl, "E5E7EB")
            fp = fl.paragraphs[0]
            fp.alignment = WD_ALIGN_PARAGRAPH.LEFT
            fp_run = fp.add_run(f"Generated by {editor_name} · aRBM-MIS · IsDB LLF2 · {gen_datetime}")
            fp_run.font.size = Pt(7.5); fp_run.font.color.rgb = GRAY_RGB
            fr = ftable.rows[0].cells[1]
            fr.width = Cm(6)
            set_cell_borders(fr, "E5E7EB")
            frp = fr.paragraphs[0]
            frp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            frp.add_run("Page ").font.size = Pt(7.5)
            fld = OxmlElement("w:fldChar")
            fld.set(qn("w:fldCharType"), "begin")
            frp.runs[-1]._r.append(fld)
            instr = OxmlElement("w:instrText")
            instr.set(qn("xml:space"), "preserve")
            instr.text = " PAGE "
            frp.runs[-1]._r.append(instr)
            fld2 = OxmlElement("w:fldChar")
            fld2.set(qn("w:fldCharType"), "end")
            frp.runs[-1]._r.append(fld2)

        # ── Titre principal ────────────────────────────────────────────
        title_p = doc.add_paragraph()
        title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        title_p.paragraph_format.space_before = Pt(0)
        title_p.paragraph_format.space_after  = Pt(8)
        pPr = title_p._p.get_or_add_pPr()
        shd = OxmlElement("w:shd"); shd.set(qn("w:val"),"clear"); shd.set(qn("w:color"),"auto"); shd.set(qn("w:fill"), NAVY_HEX); pPr.append(shd)
        t1 = title_p.add_run(f"  {ind.get('code')} — {ind.get('name')}  ")
        t1.bold = True; t1.font.size = Pt(13); t1.font.color.rgb = WHITE_RGB

        sub_p = doc.add_paragraph()
        sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sub_p.paragraph_format.space_after = Pt(12)
        pPr2 = sub_p._p.get_or_add_pPr()
        shd2 = OxmlElement("w:shd"); shd2.set(qn("w:val"),"clear"); shd2.set(qn("w:color"),"auto"); shd2.set(qn("w:fill"), LIGHT_HEX); pPr2.append(shd2)
        s1 = sub_p.add_run(f"  {proj.get('name')} · {proj.get('official_reference_number')} · {proj.get('sector','—')} · {proj.get('hub','—')}  ")
        s1.font.size = Pt(9.5); s1.font.color.rgb = NAVY_RGB

        # ── A. Identification ──────────────────────────────────────────
        add_section_heading(doc, "A", "Project Identification")
        add_info_table(doc, [
            ("Official Reference", proj.get("official_reference_number")),
            ("Project Name",    proj.get("name")),
            ("Sector",          proj.get("sector")),
            ("Hub",             proj.get("hub")),
            ("Country",         proj.get("country")),
            ("Period",          f"{proj.get('start_date','—')} → {proj.get('end_date','—')}"),
            ("Stage",           proj.get("lifecycle_stage_display") or proj.get("lifecycle_stage") or "—"),
            ("PAD Document",    proj.get("pad_name") or "—"),
        ])

        # ── B. Définition ──────────────────────────────────────────────
        add_section_heading(doc, "B", "Indicator Definition")
        add_info_table(doc, [
            ("Code",               ind.get("code")),
            ("Full Name",          ind.get("name")),
            ("Chain Level",        ind.get("chain_level_display")),
            ("Definition",         strip_html(ind.get("definition"))),
            ("Unit of Measure",    ind.get("unit")),
            ("Type",               ind.get("indicator_type")),
            ("Direction",          ind.get("direction")),
            ("Aggregation Rule",   ind.get("aggregation_rule")),
            ("Calculation Method", strip_html(ind.get("calculation_method"))),
            ("Formula",            strip_html(ind.get("formula"))),
            ("Numerator",          ind.get("numerator")),
            ("Denominator",        ind.get("denominator")),
        ])

        # ── C. Collecte ────────────────────────────────────────────────
        add_section_heading(doc, "C", "Data Collection")
        add_info_table(doc, [
            ("Data Source",           ind.get("data_source")),
            ("Collection Method",     ind.get("collection_method")),
            ("Reporting Frequency",   ind.get("reporting_frequency")),
            ("Means of Verification", ind.get("means_of_verification")),
            ("Responsible Party",     ind.get("responsible")),
            ("Assumptions",           strip_html(ind.get("assumptions"))),
            ("Limitations",           strip_html(ind.get("limitations"))),
        ])

        # ── D. Baseline ────────────────────────────────────────────────
        add_section_heading(doc, "D", "Baseline")
        add_info_table(doc, [
            ("Baseline Value", f"{base.get('value','—')} {ind.get('unit','')}"),
            ("Reference Year", str(base.get("year","—"))),
            ("Source",         base.get("source")),
            ("Notes",          base.get("notes")),
        ])

        # ── E. Cibles ──────────────────────────────────────────────────
        add_section_heading(doc, "E", "Targets")
        if tgts:
            WIDTHS_T = [3.5, 3, 2.8, 2.5, 1.2]
            HDRS_T   = ["Label", f"Target\n({ind.get('unit','')})", "Deadline", "Status", ""]
            table = doc.add_table(rows=0, cols=5)
            table.style = "Table Grid"
            add_header_row(table, HDRS_T, WIDTHS_T)
            for i, t in enumerate(tgts):
                bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
                add_data_row(table, [
                    t.get("label","—"),
                    fmt_val(t.get("target_value")),
                    str(t.get("target_date","—")),
                    t.get("status","").upper(),
                    "✓" if t.get("is_original_pad") else "",
                ], WIDTHS_T, bg)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)

        # ── F. Actuals ─────────────────────────────────────────────────
        add_section_heading(doc, "F", "Results by Reporting Period")
        if acts:
            WIDTHS_A = [2.5, 2.5, 2.5, 2.2, 2.0, 5.3]
            HDRS_A   = ["Period", f"Actual\n({ind.get('unit','')})", f"Target\n({ind.get('unit','')})", "Achievement %", "RAG", "Narrative"]
            RAG_LBL  = {"green":"On Track","amber":"At Risk","red":"Off Track"}
            table = doc.add_table(rows=0, cols=6)
            table.style = "Table Grid"
            add_header_row(table, HDRS_A, WIDTHS_A)
            for i, a in enumerate(acts):
                bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
                add_data_row(table, [
                    a.get("period_label",""),
                    fmt_val(a.get("actual_value")),
                    fmt_val(a.get("target_value")),
                    fmt_val(a.get("achievement_rate")) if a.get("achievement_rate") else "—",
                    RAG_LBL.get(a.get("rag_status",""),"No Data"),
                    a.get("narrative","—") or "—",
                ], WIDTHS_A, bg)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)

        # ── G. Désagrégation ───────────────────────────────────────────
        disagg = data.get("disaggregations", [])
        has_disagg = any(d["categories"] for d in disagg)
        if has_disagg:
            add_section_heading(doc, "G", "Disaggregation")
            for dim in disagg:
                if not dim["categories"]:
                    continue
                dp = doc.add_paragraph()
                dr = dp.add_run(dim["dimension"].upper())
                dr.bold = True; dr.font.size = Pt(8.5); dr.font.color.rgb = NAVY_RGB
                all_cats = list(dict.fromkeys(
                    v["cat"] for p in dim["categories"] for v in p["values"]
                ))
                if all_cats:
                    n_cols = len(all_cats) + 1
                    col_w  = [2.5] + [round(14.5 / len(all_cats), 2)] * len(all_cats)
                    table  = doc.add_table(rows=0, cols=n_cols)
                    table.style = "Table Grid"
                    add_header_row(table, ["Period"] + all_cats, col_w)
                    for i, period_data in enumerate(dim["categories"]):
                        bg = "FFFFFF" if i % 2 == 0 else "F8FAFC"
                        vals = [period_data["period_label"]]
                        for cat in all_cats:
                            found = next((v["val"] for v in period_data["values"] if v["cat"] == cat), None)
                            vals.append(fmt_val(found) if found else "—")
                        add_data_row(table, vals, col_w, bg)
                    doc.add_paragraph().paragraph_format.space_after = Pt(2)

        # ── H. Transversaux ────────────────────────────────────────────
        tags = ind.get("cross_cutting_tags", [])
        sdgs = ind.get("related_sdgs", [])
        if tags or sdgs:
            add_section_heading(doc, "H", "Cross-cutting Themes & SDGs")
            add_info_table(doc, [
                ("Cross-cutting Tags", ", ".join(tags) if tags else "—"),
                ("Related SDGs",       ", ".join(f"SDG {n}" for n in sdgs) if sdgs else "—"),
                ("Indicator Version",  f"v{ind.get('version', 1)}"),
            ])

        # ── Serialisation ───────────────────────────────────────────────
        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        content = buf.read()

        filename = f"PIRS_{proj.get('official_reference_number')}_{ind.get('code')}.docx"
        response = HttpResponse(
            content,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response



# ---------------------------------------------------------------------------
# SF-9 — DQ Score (Data Quality Score)
# BRQ-2.23a / BRQ-2.23b
# ---------------------------------------------------------------------------

class DQScoreView(APIView):
    """
    GET  /api/projects/<pk>/logframe/<row_pk>/dq-score/
         Retourne le DQ Score calculé à la volée (pas de snapshot requis).
         ?period=<id> pour une période spécifique.

    POST /api/projects/<pk>/logframe/<row_pk>/dq-score/
         Sauvegarde un snapshot DQ en base.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def get(self, request, pk, row_pk):
        from .dq_service import compute_dq_score
        from apps.project.models import ReportingPeriod

        row    = get_object_or_404(LogframeRow, pk=row_pk, project_id=pk)
        period = None
        period_id = request.query_params.get("period")
        if period_id:
            period = get_object_or_404(ReportingPeriod, pk=period_id, project_id=pk)

        scores = compute_dq_score(row, period)

        return Response({
            "indicator_code":  row.indicator.code,
            "indicator_name":  row.indicator.name,
            "project_code":    row.project.official_reference_number,
            "period":          period.label if period else "All periods",
            "scores": {
                "completeness": str(scores["completeness"]),
                "timeliness":   str(scores["timeliness"]),
                "consistency":  str(scores["consistency"]),
                "accuracy":     str(scores["accuracy"]),
                "composite":    str(scores["composite"]),
            },
            "weights": {
                "completeness": "30%",
                "timeliness":   "25%",
                "consistency":  "25%",
                "accuracy":     "20%",
            },
            "details":    scores["details"],
            "computed_at": timezone.now().isoformat(),
        })

    def post(self, request, pk, row_pk):
        from .dq_service import save_dq_snapshot
        from apps.project.models import ReportingPeriod

        row    = get_object_or_404(LogframeRow, pk=row_pk, project_id=pk)
        period = None
        period_id = request.data.get("period")
        if period_id:
            period = get_object_or_404(ReportingPeriod, pk=period_id, project_id=pk)

        snapshot = save_dq_snapshot(row, period)
        return Response({
            "composite_score": str(snapshot.composite_score),
            "computed_at":     snapshot.computed_at.isoformat(),
        }, status=201)


class DQPortfolioView(APIView):
    """
    GET /api/results/dq-portfolio/
        DQ Score agrégé sur tout le portefeuille ou filtré par projet.
        ?project=<id>, sinon ?type=llf|isdb (LLF par defaut, ADR 0014).
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def get(self, request):
        from .dq_service import compute_dq_score
        from apps.project.models import Project

        from apps.reference.filters import read_project_type

        project_id = request.query_params.get("project")
        # Meme denominateur que le portefeuille : perimetre de l'utilisateur,
        # un seul type de projet a la fois sauf pour un projet donne.
        projects = Project.objects.in_scope(request)
        if not project_id:
            projects = projects.of_taxonomy(read_project_type(request.query_params))
        rows_qs = LogframeRow.objects.select_related(
            "indicator", "project__primary_sector__parent"
        ).filter(
            project__workspace__isnull=False,
            project__in=projects,
        )

        if project_id:
            rows_qs = rows_qs.filter(project_id=project_id)

        results = []
        for row in rows_qs:
            scores = compute_dq_score(row)
            composite = float(scores["composite"])
            # Hub via Project.hub ou pays lead
            hub_name = None
            if row.project.hub_id:
                hub_name = row.project.hub.name
            else:
                lead = row.project.project_countries.filter(
                    is_lead=True
                ).select_related("country__hub").first()
                if lead and lead.country.hub_id:
                    hub_name = lead.country.hub.name

            results.append({
                "project_code":    row.project.official_reference_number,
                "project_name":    row.project.name[:50],
                "indicator_code":  row.indicator.code,
                "indicator_name":  row.indicator.name[:60],
                "hub":             hub_name,
                "sector":          row.project.primary_sector.name if row.project.primary_sector else None,
                # Ids for the sector filter; the pillar is None in LLF (ADR 0014).
                "sector_id":       row.project.primary_sector_id,
                "pillar_id":       (
                    row.project.primary_sector.pillar.id
                    if row.project.primary_sector and row.project.primary_sector.pillar else None
                ),
                "chain_level":     row.chain_level,
                "composite_score": str(scores["composite"]),
                "completeness":    str(scores["completeness"]),
                "timeliness":      str(scores["timeliness"]),
                "consistency":     str(scores["consistency"]),
                "accuracy":        str(scores["accuracy"]),
                "grade": (
                    "A" if composite >= 80
                    else "B" if composite >= 60
                    else "C" if composite >= 40
                    else "D"
                ),
            })

        # Tri par score composite décroissant
        results.sort(key=lambda x: float(x["composite_score"]), reverse=True)

        # Agrégat global
        if results:
            avg = round(sum(float(r["composite_score"]) for r in results) / len(results), 2)
        else:
            avg = 0

        return Response({
            "portfolio_average": str(avg),
            "indicators_count":  len(results),
            "results":           results,
        })


# ---------------------------------------------------------------------------
# SF-10 — Evidence (preuves) + Workflow complet
# BRQ-2.24 / RG-10.x
# ---------------------------------------------------------------------------

# Signatures des types acceptes, lues dans les premiers octets du fichier : le
# controle porte sur le contenu, pas sur le nom ni sur le type declare par le
# navigateur, sans dependre de libmagic.
_EVIDENCE_SIGNATURES = [
    (b"%PDF-", "application/pdf"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
]


def _sniff_evidence_mime(head):
    """Type MIME d'apres les premiers octets, ou None si non reconnu."""
    for signature, mime in _EVIDENCE_SIGNATURES:
        if head.startswith(signature):
            return mime
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


class EvidenceView(APIView):
    """
    GET    /api/projects/<pk>/logframe/<row_pk>/results/<rd_pk>/evidence/
    POST   — upload fichier ou URL externe
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"
    parser_classes     = [MultiPartParser, FormParser, JSONParser]

    def _get_rd(self, pk, row_pk, rd_pk):
        from .models import ResultsData
        return get_object_or_404(
            ResultsData,
            pk=rd_pk,
            logframe_row_id=row_pk,
            logframe_row__project_id=pk,
        )

    def get(self, request, pk, row_pk, rd_pk):
        from .models import Evidence
        rd   = self._get_rd(pk, row_pk, rd_pk)
        evs  = Evidence.objects.filter(results_data=rd, is_active=True).select_related("uploaded_by", "verified_by")
        data = [{
            "id":            e.id,
            "title":         e.title,
            "description":   e.description,
            "evidence_type": e.evidence_type,
            "evidence_type_display": e.get_evidence_type_display(),
            "file_url":      e.file_url,
            "external_url":  e.external_url,
            "status":        e.status,
            "status_display":e.get_status_display(),
            "notes":         e.notes,
            "uploaded_by":   e.uploaded_by.get_full_name() if e.uploaded_by else None,
            "uploaded_at":   e.uploaded_at.isoformat(),
            "verified_by":   e.verified_by.get_full_name() if e.verified_by else None,
            "verified_at":   e.verified_at.isoformat() if e.verified_at else None,
        } for e in evs]
        return Response({"count": len(data), "results": data})

    def post(self, request, pk, row_pk, rd_pk):
        from .models import Evidence
        rd    = self._get_rd(pk, row_pk, rd_pk)
        title = request.data.get("title", "").strip()
        if not title:
            return Response({"detail": "title is required."}, status=400)

        ev = Evidence(
            results_data  = rd,
            title         = title,
            description   = request.data.get("description", ""),
            evidence_type = request.data.get("evidence_type", "pdf"),
            external_url  = request.data.get("external_url", ""),
            uploaded_by   = request.user,
        )

        file = request.FILES.get("file")
        if file:
            # Validation du type d'apres le contenu (PDF, JPEG, PNG, WebP, GIF)
            mime = _sniff_evidence_mime(file.read(16))
            file.seek(0)
            if mime is None:
                return Response(
                    {"detail": "File type not allowed: only PDF, JPEG, PNG, WebP and GIF are accepted."},
                    status=400,
                )
            # Taille max : PDF 25MB, images 10MB
            max_size = 25 * 1024 * 1024 if "pdf" in mime else 10 * 1024 * 1024
            if file.size > max_size:
                return Response({"detail": f"File too large (max {max_size // 1024 // 1024} MB)."}, status=400)
            ev.file = file

        ev.save()
        return Response({"id": ev.id, "title": ev.title, "status": ev.status}, status=201)


class EvidenceDetailView(APIView):
    """
    PATCH  /api/.../evidence/<ev_pk>/  — vérifier ou rejeter
    DELETE — soft-delete
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    def _get_ev(self, pk, row_pk, rd_pk, ev_pk):
        from .models import Evidence
        return get_object_or_404(
            Evidence,
            pk=ev_pk, is_active=True,
            results_data_id=rd_pk,
            results_data__logframe_row_id=row_pk,
            results_data__logframe_row__project_id=pk,
        )

    def patch(self, request, pk, row_pk, rd_pk, ev_pk):
        ev     = self._get_ev(pk, row_pk, rd_pk, ev_pk)
        action = request.data.get("action")
        if action == "verify":
            ev.status      = "verified"
            ev.verified_by = request.user
            ev.verified_at = timezone.now()
            ev.notes       = request.data.get("notes", ev.notes)
        elif action == "reject":
            ev.status = "rejected"
            ev.notes  = request.data.get("notes", "")
        else:
            ev.title       = request.data.get("title", ev.title)
            ev.description = request.data.get("description", ev.description)
            ev.notes       = request.data.get("notes", ev.notes)
        ev.save()
        # Mettre à jour le DQ Score
        from .dq_service import save_dq_snapshot
        save_dq_snapshot(ev.results_data.logframe_row)
        return Response({"id": ev.id, "status": ev.status})

    def delete(self, request, pk, row_pk, rd_pk, ev_pk):
        ev = self._get_ev(pk, row_pk, rd_pk, ev_pk)
        ev.is_active = False
        ev.save(update_fields=["is_active"])
        return Response(status=204)


class ResultsWorkflowView(APIView):
    """
    POST /api/projects/<pk>/logframe/<row_pk>/results/<rd_pk>/workflow/
    body: { "action": "submit" | "review" | "approve" | "reject", "notes": "..." }

    Transitions :
      draft     → submit  → submitted
      submitted → review  → reviewed   (relecteur)
      reviewed  → approve → approved   (approbateur)
      reviewed  → reject  → draft      (renvoyer au saisisseur)
      submitted → reject  → draft      (rejet direct)
      approved  → reopen  → draft      (réouverture)

    Séparation des tâches : le saisisseur ne peut pas approuver sa propre saisie
    (neutralisé si RBAC_ENFORCED=False).
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission, ProjectInScope]
    permission_module  = "m1_config_access"

    TRANSITIONS = {
        "submit":  ("draft",             "submitted"),
        "review":  ("submitted",         "reviewed"),
        "approve": (("submitted","reviewed"), "approved"),
        "reject":  (("submitted","reviewed"), "draft"),
        "reopen":  ("approved",          "draft"),
    }

    def post(self, request, pk, row_pk, rd_pk):
        from .models import ResultsData
        from django.utils import timezone
        rd     = get_object_or_404(ResultsData, pk=rd_pk, logframe_row_id=row_pk, logframe_row__project_id=pk)
        action = request.data.get("action")
        notes  = request.data.get("notes", "")
        user   = request.user

        if action not in self.TRANSITIONS:
            return Response({"detail": f"Unknown action: {action}"}, status=400)

        from django.conf import settings
        RBAC = getattr(settings, "RBAC_ENFORCED", False)

        allowed_from, to_status = self.TRANSITIONS[action]
        if isinstance(allowed_from, str):
            allowed_from = (allowed_from,)

        if rd.status not in allowed_from:
            return Response({
                "detail": f"Cannot {action} from status '{rd.status}'. Expected: {allowed_from}."
            }, status=400)

        # Séparation des tâches
        if RBAC and action == "approve" and rd.submitted_by == user:
            return Response({"detail": "Saisisseur ne peut pas approuver sa propre entrée."}, status=403)

        now = timezone.now()
        rd.status = to_status

        if action == "submit":
            rd.submitted_by = user
            rd.submitted_at = now
        elif action == "review":
            rd.reviewed_by  = user
            rd.reviewed_at  = now
            rd.review_notes = notes
        elif action == "approve":
            rd.approved_by  = user
            rd.approved_at  = now
            rd.review_notes = notes
            rd.compute_and_save_rag()
        elif action == "reject":
            rd.reviewed_by  = user
            rd.reviewed_at  = now
            rd.review_notes = notes
        elif action == "reopen":
            rd.review_notes = notes

        rd.save()

        return Response({
            "id":          rd.id,
            "status":      rd.status,
            "action":      action,
            "notes":       rd.review_notes,
            "updated_at":  rd.updated_at.isoformat(),
        })


# ---------------------------------------------------------------------------
# Tier III — performance du Fonds lui-meme (Annex L)
# ---------------------------------------------------------------------------

class FundPerformanceView(APIView):
    """
    GET /api/results/fund-performance/
        Les 34 indicateurs operationnels Tier III (Annex L), en cinq sections.

    Aucune saisie : chaque indicateur est soit calcule a partir du dossier
    partage, soit renvoye `available: false` avec la raison. Le calcul et
    l'inventaire de ce qui manque vivent dans `fund_performance.py`.

    Perimetre : `Project.objects.in_scope(request)`, donc le hub choisi dans
    la barre du haut — meme denominateur que les autres vues portefeuille.
    """
    permission_classes = [IsAuthenticated, ReadOnlyOrHasModulePermission]
    permission_module  = "m1_config_access"

    def get(self, request):
        from .fund_performance import build_fund_performance
        return Response(build_fund_performance(request))
