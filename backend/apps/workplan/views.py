"""
Module 3 — Views / API Endpoints
Toutes les routes sont imbriquées sous /api/projects/{pk}/workplan/
"""

from django.db import transaction
from django.db.models import Avg, Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from core.scope import ProjectInScope
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.project.models import Project
from apps.results.models import ToCNode

from .models import (
    Activity,
    ActivityDependency,
    DelayLog,
    Milestone,
    SPISnapshot,
    WorkplanComponent,
    WorkplanSubComponent,
)
from .serializers import (
    ActivityCreateSerializer,
    ActivityDependencySerializer,
    ActivityProgressSerializer,
    ActivitySerializer,
    ActivityUpdateSerializer,
    DelayLogCreateSerializer,
    DelayLogSerializer,
    MilestoneSerializer,
    MilestoneUpdateSerializer,
    OutputNodeSerializer,
    SPISnapshotSerializer,
    WorkplanComponentCreateSerializer,
    WorkplanComponentSerializer,
    WorkplanComponentWithChildrenSerializer,
    WorkplanSubComponentCreateSerializer,
    WorkplanSubComponentSerializer,
    WorkplanSubComponentWithActivitiesSerializer,
    WorkplanSummarySerializer,
    get_workplan_choices,
)


def get_project_or_404(pk):
    return get_object_or_404(Project, pk=pk)


# ---------------------------------------------------------------------------
# Choices
# ---------------------------------------------------------------------------

class WorkplanChoicesView(APIView):
    """GET /api/projects/{pk}/workplan/choices/"""
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        return Response(get_workplan_choices())


# ---------------------------------------------------------------------------
# SF-2 — Output nodes disponibles pour liaison
# ---------------------------------------------------------------------------

class WorkplanOutputNodesView(APIView):
    """
    GET /api/projects/{pk}/workplan/output-nodes/
    Retourne tous les nœuds Output de la ToC du projet.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        project = get_project_or_404(pk)
        nodes = ToCNode.objects.filter(
            toc__project=project,
            chain_level="output",
        ).select_related("toc").order_by("code")
        return Response(OutputNodeSerializer(nodes, many=True).data)


# ---------------------------------------------------------------------------
# SF-1 — WorkplanComponent
# ---------------------------------------------------------------------------

class WorkplanComponentListView(APIView):
    """
    GET  /api/projects/{pk}/workplan/components/        — liste
    POST /api/projects/{pk}/workplan/components/        — créer
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        project = get_project_or_404(pk)
        qs = WorkplanComponent.objects.filter(
            project=project, is_active=True
        ).order_by("order", "code")
        return Response(WorkplanComponentSerializer(qs, many=True).data)

    def post(self, request, pk):
        project = get_project_or_404(pk)
        serializer = WorkplanComponentCreateSerializer(
            data=request.data,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            component = serializer.save(project=project)
            return Response(
                WorkplanComponentSerializer(component).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkplanComponentDetailView(APIView):
    """
    GET    /api/projects/{pk}/workplan/components/{c_pk}/
    PATCH  /api/projects/{pk}/workplan/components/{c_pk}/
    DELETE /api/projects/{pk}/workplan/components/{c_pk}/  — soft-delete
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_component(self, pk, c_pk):
        return get_object_or_404(WorkplanComponent, pk=c_pk, project_id=pk, is_active=True)

    def get(self, request, pk, c_pk):
        component = self._get_component(pk, c_pk)
        return Response(WorkplanComponentWithChildrenSerializer(component).data)

    def patch(self, request, pk, c_pk):
        component = self._get_component(pk, c_pk)
        serializer = WorkplanComponentCreateSerializer(
            component, data=request.data, partial=True,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            serializer.save()
            return Response(WorkplanComponentSerializer(component).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk, c_pk):
        component = self._get_component(pk, c_pk)
        component.is_active = False
        component.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# SF-1 — WorkplanSubComponent
# ---------------------------------------------------------------------------

class WorkplanSubComponentListView(APIView):
    """
    GET  /api/projects/{pk}/workplan/components/{c_pk}/subcomponents/
    POST /api/projects/{pk}/workplan/components/{c_pk}/subcomponents/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_component(self, pk, c_pk):
        return get_object_or_404(WorkplanComponent, pk=c_pk, project_id=pk, is_active=True)

    def get(self, request, pk, c_pk):
        component = self._get_component(pk, c_pk)
        qs = component.sub_components.filter(is_active=True).order_by("order", "code")
        return Response(WorkplanSubComponentSerializer(qs, many=True).data)

    def post(self, request, pk, c_pk):
        component = self._get_component(pk, c_pk)
        data = {**request.data, "component": component.pk}
        serializer = WorkplanSubComponentCreateSerializer(
            data=data,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            sub = serializer.save()
            return Response(
                WorkplanSubComponentSerializer(sub).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkplanSubComponentDetailView(APIView):
    """
    GET    /api/projects/{pk}/workplan/components/{c_pk}/subcomponents/{s_pk}/
    PATCH  /api/projects/{pk}/workplan/components/{c_pk}/subcomponents/{s_pk}/
    DELETE /api/projects/{pk}/workplan/components/{c_pk}/subcomponents/{s_pk}/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_sub(self, pk, c_pk, s_pk):
        return get_object_or_404(
            WorkplanSubComponent,
            pk=s_pk, component_id=c_pk,
            component__project_id=pk, is_active=True,
        )

    def get(self, request, pk, c_pk, s_pk):
        sub = self._get_sub(pk, c_pk, s_pk)
        return Response(WorkplanSubComponentWithActivitiesSerializer(sub).data)

    def patch(self, request, pk, c_pk, s_pk):
        sub = self._get_sub(pk, c_pk, s_pk)
        serializer = WorkplanSubComponentCreateSerializer(
            sub, data=request.data, partial=True,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            serializer.save()
            return Response(WorkplanSubComponentSerializer(sub).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk, c_pk, s_pk):
        sub = self._get_sub(pk, c_pk, s_pk)
        sub.is_active = False
        sub.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# SF-1 / SF-4 — Activity
# ---------------------------------------------------------------------------

class ActivityListView(APIView):
    """
    GET  /api/projects/{pk}/workplan/activities/
    POST /api/projects/{pk}/workplan/activities/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        project = get_project_or_404(pk)
        qs = Activity.objects.filter(
            sub_component__component__project=project,
            is_active=True,
        ).select_related(
            "sub_component__component", "output_node__toc"
        ).order_by("sub_component__component__order", "sub_component__order", "order", "code")

        # Filtres optionnels
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        overdue_only = request.query_params.get("overdue")
        if overdue_only == "true":
            today = timezone.now().date()
            qs = qs.filter(
                progress__lt=100,
                status__in=["not_started", "in_progress", "on_hold"],
            ).filter(
                Q(revised_end__lt=today) | Q(revised_end__isnull=True, planned_end__lt=today)
            )

        critical_only = request.query_params.get("critical_path")
        if critical_only == "true":
            qs = qs.filter(is_critical_path=True)

        sub_pk = request.query_params.get("sub_component")
        if sub_pk:
            qs = qs.filter(sub_component_id=sub_pk)

        return Response(ActivitySerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request, pk):
        project = get_project_or_404(pk)
        serializer = ActivityCreateSerializer(
            data=request.data,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            activity = serializer.save(created_by=request.user)
            return Response(
                ActivitySerializer(activity).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ActivityDetailView(APIView):
    """
    GET    /api/projects/{pk}/workplan/activities/{a_pk}/
    PATCH  /api/projects/{pk}/workplan/activities/{a_pk}/
    DELETE /api/projects/{pk}/workplan/activities/{a_pk}/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_activity(self, pk, a_pk):
        return get_object_or_404(
            Activity,
            pk=a_pk,
            sub_component__component__project_id=pk,
            is_active=True,
        )

    def get(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        return Response(ActivitySerializer(activity).data)

    @transaction.atomic
    def patch(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        serializer = ActivityUpdateSerializer(
            activity, data=request.data, partial=True,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            # RG-4.4 : si passage à Completed + requires_evidence, vérifier preuve
            new_status = serializer.validated_data.get("status", activity.status)
            if new_status == "completed" and activity.requires_evidence:
                has_evidence = (
                    activity.milestones.filter(
                        status="achieved", evidence_url__isnull=False
                    ).exclude(evidence_url="").exists()
                )
                if not has_evidence:
                    return Response(
                        {"detail": "Une preuve est requise avant de marquer cette activité comme Completed."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            serializer.save()
            return Response(ActivitySerializer(activity).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        activity.is_active = False
        activity.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ActivityProgressView(APIView):
    """
    PATCH /api/projects/{pk}/workplan/activities/{a_pk}/progress/
    Mise à jour rapide statut + % (SF-4).
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def patch(self, request, pk, a_pk):
        activity = get_object_or_404(
            Activity, pk=a_pk,
            sub_component__component__project_id=pk,
            is_active=True,
        )
        serializer = ActivityProgressSerializer(
            activity, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            return Response(ActivitySerializer(activity).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# SF-1 — ActivityDependency (RG-1.1 · BRQ-3.03)
# ---------------------------------------------------------------------------

class ActivityDependencyView(APIView):
    """
    GET  /api/projects/{pk}/workplan/activities/{a_pk}/dependencies/
    POST /api/projects/{pk}/workplan/activities/{a_pk}/dependencies/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_activity(self, pk, a_pk):
        return get_object_or_404(
            Activity, pk=a_pk,
            sub_component__component__project_id=pk,
            is_active=True,
        )

    def get(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        # Toutes les dépendances où cette activité est prédécesseur ou successeur
        deps = ActivityDependency.objects.filter(
            Q(predecessor=activity) | Q(successor=activity)
        ).select_related("predecessor", "successor")
        return Response(ActivityDependencySerializer(deps, many=True).data)

    @transaction.atomic
    def post(self, request, pk, a_pk):
        self._get_activity(pk, a_pk)
        serializer = ActivityDependencySerializer(
            data=request.data,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            # Détection de circuit (RG-1.1 · BRQ-3.03)
            pred = serializer.validated_data["predecessor"]
            succ = serializer.validated_data["successor"]
            if self._would_create_cycle(pred, succ):
                return Response(
                    {"detail": "Cette dépendance créerait une dépendance circulaire."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            dep = serializer.save()
            return Response(
                ActivityDependencySerializer(dep).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _would_create_cycle(self, predecessor, successor):
        """
        BRQ-3.03 : vérifie si ajouter pred→succ créerait un circuit.
        Parcours en largeur depuis le successeur vers ses propres successeurs.
        """
        visited = set()
        queue   = [successor]
        while queue:
            current = queue.pop(0)
            if current.pk == predecessor.pk:
                return True
            if current.pk not in visited:
                visited.add(current.pk)
                for dep in current.successor_deps.all():
                    queue.append(dep.successor)
        return False


class ActivityDependencyDetailView(APIView):
    """
    DELETE /api/projects/{pk}/workplan/activities/{a_pk}/dependencies/{d_pk}/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def delete(self, request, pk, a_pk, d_pk):
        dep = get_object_or_404(
            ActivityDependency,
            pk=d_pk,
        )
        # Vérifier que la dépendance appartient bien au projet
        if (dep.predecessor.sub_component.component.project_id != int(pk) and
                dep.successor.sub_component.component.project_id != int(pk)):
            return Response(status=status.HTTP_404_NOT_FOUND)
        dep.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# SF-5 — Milestones
# ---------------------------------------------------------------------------

class MilestoneListView(APIView):
    """
    GET  /api/projects/{pk}/workplan/activities/{a_pk}/milestones/
    POST /api/projects/{pk}/workplan/activities/{a_pk}/milestones/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_activity(self, pk, a_pk):
        return get_object_or_404(
            Activity, pk=a_pk,
            sub_component__component__project_id=pk,
            is_active=True,
        )

    def get(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        qs = activity.milestones.all().order_by("planned_date", "order")
        return Response(MilestoneSerializer(qs, many=True).data)

    def post(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        data = {**request.data, "activity": activity.pk}
        serializer = MilestoneSerializer(
            data=data,
            context={"project_pk": pk, "request": request},
        )
        if serializer.is_valid():
            milestone = serializer.save()
            return Response(
                MilestoneSerializer(milestone).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MilestoneDetailView(APIView):
    """
    GET    /api/projects/{pk}/workplan/activities/{a_pk}/milestones/{m_pk}/
    PATCH  /api/projects/{pk}/workplan/activities/{a_pk}/milestones/{m_pk}/
    DELETE /api/projects/{pk}/workplan/activities/{a_pk}/milestones/{m_pk}/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_milestone(self, pk, a_pk, m_pk):
        return get_object_or_404(
            Milestone, pk=m_pk, activity_id=a_pk,
            activity__sub_component__component__project_id=pk,
        )

    def get(self, request, pk, a_pk, m_pk):
        m = self._get_milestone(pk, a_pk, m_pk)
        return Response(MilestoneSerializer(m).data)

    def patch(self, request, pk, a_pk, m_pk):
        m = self._get_milestone(pk, a_pk, m_pk)
        serializer = MilestoneUpdateSerializer(m, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(MilestoneSerializer(m).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk, a_pk, m_pk):
        m = self._get_milestone(pk, a_pk, m_pk)
        m.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# SF-7 — DelayLog
# ---------------------------------------------------------------------------

class DelayLogListView(APIView):
    """
    GET  /api/projects/{pk}/workplan/activities/{a_pk}/delays/
    POST /api/projects/{pk}/workplan/activities/{a_pk}/delays/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_activity(self, pk, a_pk):
        return get_object_or_404(
            Activity, pk=a_pk,
            sub_component__component__project_id=pk,
            is_active=True,
        )

    def get(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        qs = activity.delay_logs.all().select_related("approved_by", "recorded_by")
        return Response(DelayLogSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request, pk, a_pk):
        activity = self._get_activity(pk, a_pk)
        serializer = DelayLogCreateSerializer(data=request.data)
        if serializer.is_valid():
            data = serializer.validated_data

            # Calcul variance_days (RG-7.2)
            variance = (data["revised_end"] - data["previous_end"]).days

            # Variance cumulée depuis le baseline
            previous_cumulative = (
                activity.delay_logs.filter(approval_status="approved")
                .aggregate(total=Sum("variance_days"))["total"] or 0
            )
            cumulative = previous_cumulative + variance

            delay_log = DelayLog.objects.create(
                activity=activity,
                previous_end=data["previous_end"],
                revised_end=data["revised_end"],
                variance_days=variance,
                delay_category=data["delay_category"],
                delay_subcategory=data.get("delay_subcategory", ""),
                justification=data["justification"],
                cascade_applied=data.get("cascade_applied", False),
                cumulative_variance_days=cumulative,
                recorded_by=request.user,
            )

            # Mettre à jour la date révisée de l'activité (RG-7.2)
            activity.revised_end = data["revised_end"]
            activity.save(update_fields=["revised_end", "updated_at"])

            # Seuil d'approbation (RG-7.4)
            # > 30j : PMU PM ; > 60j cumulés : OTL/LLFMU — statut pending par défaut
            return Response(
                DelayLogSerializer(delay_log).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DelayLogApprovalView(APIView):
    """
    POST /api/projects/{pk}/workplan/activities/{a_pk}/delays/{d_pk}/approve/
    POST /api/projects/{pk}/workplan/activities/{a_pk}/delays/{d_pk}/reject/
    RG-7.4 : approbation des révisions de dates.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_delay(self, pk, a_pk, d_pk):
        return get_object_or_404(
            DelayLog, pk=d_pk, activity_id=a_pk,
            activity__sub_component__component__project_id=pk,
        )

    def post(self, request, pk, a_pk, d_pk, action):
        delay = self._get_delay(pk, a_pk, d_pk)
        if delay.approval_status != "pending":
            return Response(
                {"detail": "Ce log de retard a déjà été traité."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if action == "approve":
            delay.approval_status = "approved"
            delay.approved_by     = request.user
            delay.approved_at     = timezone.now()
        elif action == "reject":
            delay.approval_status = "rejected"
            delay.approved_by     = request.user
            delay.approved_at     = timezone.now()
            # Annuler la date révisée sur l'activité
            activity = delay.activity
            last_approved = activity.delay_logs.filter(
                approval_status="approved"
            ).order_by("-created_at").first()
            activity.revised_end = last_approved.revised_end if last_approved else None
            activity.save(update_fields=["revised_end", "updated_at"])
        else:
            return Response(status=status.HTTP_404_NOT_FOUND)
        delay.save(update_fields=["approval_status", "approved_by", "approved_at"])
        return Response(DelayLogSerializer(delay).data)


# ---------------------------------------------------------------------------
# SF-8 — SPI Snapshots
# ---------------------------------------------------------------------------

class SPISnapshotView(APIView):
    """
    GET /api/projects/{pk}/workplan/spi/
    Retourne les snapshots SPI du projet.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        project = get_project_or_404(pk)
        qs = SPISnapshot.objects.filter(
            project=project
        ).order_by("-snapshot_date")[:12]  # 12 derniers snapshots
        return Response(SPISnapshotSerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# Vue d'ensemble workplan + résumé (SF-10)
# ---------------------------------------------------------------------------

class WorkplanView(APIView):
    """
    GET /api/projects/{pk}/workplan/
    Vue complète du workplan : tous les composants avec sous-composants et activités.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        project = get_project_or_404(pk)
        components = WorkplanComponent.objects.filter(
            project=project, is_active=True
        ).prefetch_related(
            "sub_components__activities__milestones",
            "sub_components__activities__output_node__toc",
        ).order_by("order", "code")
        return Response(WorkplanComponentWithChildrenSerializer(components, many=True).data)


class WorkplanSummaryView(APIView):
    """
    GET /api/projects/{pk}/workplan/summary/
    Résumé exécutif : compteurs, progress global, overdue, SPI.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        project = get_project_or_404(pk)
        activities = Activity.objects.filter(
            sub_component__component__project=project,
            is_active=True,
        )

        total       = activities.count()
        by_status   = dict(activities.values_list("status").annotate(n=Count("id")))
        today       = timezone.now().date()
        overdue_qs  = activities.filter(
            progress__lt=100,
            status__in=["not_started", "in_progress", "on_hold"],
        ).filter(
            Q(revised_end__lt=today) | Q(revised_end__isnull=True, planned_end__lt=today)
        )

        # Progression globale pondérée (moyenne simple)
        avg_progress = activities.aggregate(avg=Avg("progress"))["avg"] or 0

        # Dernier SPI projet
        latest_spi_obj = SPISnapshot.objects.filter(
            project=project, level="project"
        ).order_by("-snapshot_date").first()

        summary = {
            "total_activities":    total,
            "not_started":         by_status.get("not_started", 0),
            "in_progress":         by_status.get("in_progress", 0),
            "on_hold":             by_status.get("on_hold", 0),
            "completed":           by_status.get("completed", 0),
            "cancelled":           by_status.get("cancelled", 0),
            "overdue_count":       overdue_qs.count(),
            "overall_progress":    round(float(avg_progress), 1),
            "critical_path_count": activities.filter(is_critical_path=True).count(),
            "latest_spi":          float(latest_spi_obj.spi) if latest_spi_obj else None,
        }
        return Response(WorkplanSummarySerializer(summary).data)


# ---------------------------------------------------------------------------
# SF-6 — WorkplanAlert
# ---------------------------------------------------------------------------

from .models import WorkplanAlert
from .serializers import WorkplanAlertSerializer


class WorkplanAlertListView(APIView):
    """
    GET  /api/projects/{pk}/workplan/alerts/        — liste des alertes actives
    POST /api/projects/{pk}/workplan/alerts/run/    — déclencher le moteur manuellement
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def get(self, request, pk):
        project = get_project_or_404(pk)
        qs = WorkplanAlert.objects.filter(project=project).select_related(
            "activity", "milestone", "assigned_to", "acknowledged_by"
        )
        # Filtres optionnels
        status_filter = request.query_params.get("status", "active")
        if status_filter != "all":
            qs = qs.filter(status=status_filter)
        alert_type = request.query_params.get("type")
        if alert_type:
            qs = qs.filter(alert_type=alert_type)
        return Response(WorkplanAlertSerializer(qs, many=True).data)


class WorkplanAlertRunView(APIView):
    """
    POST /api/projects/{pk}/workplan/alerts/run/
    Déclenche le moteur d'alertes SF-6 immédiatement pour ce projet.
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def post(self, request, pk):
        project = get_project_or_404(pk)
        from .tasks import check_workplan_alerts_project
        task = check_workplan_alerts_project.delay(project.pk)
        return Response({"task_id": task.id, "status": "queued"}, status=status.HTTP_202_ACCEPTED)


class WorkplanAlertDetailView(APIView):
    """
    PATCH /api/projects/{pk}/workplan/alerts/{a_pk}/acknowledge/
    PATCH /api/projects/{pk}/workplan/alerts/{a_pk}/resolve/
    """
    permission_classes = [IsAuthenticated, ProjectInScope]

    def _get_alert(self, pk, a_pk):
        return get_object_or_404(WorkplanAlert, pk=a_pk, project_id=pk)

    def patch(self, request, pk, a_pk, action):
        alert = self._get_alert(pk, a_pk)
        if action == "acknowledge":
            if alert.status != "active":
                return Response({"detail": "Only active alerts can be acknowledged."}, status=status.HTTP_400_BAD_REQUEST)
            alert.status = "acknowledged"
            alert.acknowledged_by = request.user
            alert.acknowledged_at = timezone.now()
            alert.save(update_fields=["status", "acknowledged_by", "acknowledged_at", "updated_at"])
        elif action == "resolve":
            alert.status = "resolved"
            alert.save(update_fields=["status", "updated_at"])
        else:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(WorkplanAlertSerializer(alert).data)


# ---------------------------------------------------------------------------
# Notifications globales (topbar) — toutes alertes actives de l'utilisateur
# ---------------------------------------------------------------------------

class GlobalWorkplanNotificationsView(APIView):
    """
    GET /api/workplan/notifications/
    Retourne toutes les alertes actives sur tous les projets,
    groupées par catégorie, pour la cloche de notifications topbar.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.project.models import Project

        # Tous les projets avec workspace actif, dans le perimetre de
        # l'utilisateur (core/scope.py)
        projects = Project.objects.in_scope(request).filter(
            workspace__isnull=False,
        ).exclude(
            lifecycle_stage__in=["LS018", "LS016", "LS001"],  # Cancelled, Closed, Concept Note
        ).values_list("id", flat=True)

        qs = WorkplanAlert.objects.filter(
            project_id__in=projects,
            status="active",
        ).select_related(
            "project", "activity", "milestone"
        ).order_by("-created_at")

        # Groupement par catégorie
        CATEGORIES = [
            {
                "key":   "escalation",
                "label": "Escalations",
                "types": ["escalation_l3", "escalation_l2", "escalation_l1"],
                "color": "#dc2626",
                "icon":  "alert-triangle",
            },
            {
                "key":   "overdue",
                "label": "Overdue Activities",
                "types": ["activity_overdue"],
                "color": "#ea580c",
                "icon":  "clock",
            },
            {
                "key":   "milestone",
                "label": "Milestones",
                "types": ["milestone_missed", "milestone_t0", "milestone_t7", "milestone_t30"],
                "color": "#9333ea",
                "icon":  "check-square",
            },
            {
                "key":   "pending",
                "label": "Pending Approvals",
                "types": ["delay_pending"],
                "color": "#2563eb",
                "icon":  "clock",
            },
        ]

        alerts_by_cat = {}
        for cat in CATEGORIES:
            cat_alerts = [a for a in qs if a.alert_type in cat["types"]]
            alerts_by_cat[cat["key"]] = {
                "label":  cat["label"],
                "color":  cat["color"],
                "icon":   cat["icon"],
                "count":  len(cat_alerts),
                "alerts": WorkplanAlertSerializer(cat_alerts[:10], many=True).data,
            }

        total = qs.count()
        return Response({
            "total":      total,
            "categories": alerts_by_cat,
        })

    def post(self, request):
        """PATCH /api/workplan/notifications/acknowledge-all/ — tout accuser.

        Limite au perimetre de l'utilisateur : sans ce filtre, un membre d'un
        hub accuserait les alertes de tous les autres hubs.
        """
        from django.utils import timezone
        from apps.project.models import Project
        WorkplanAlert.objects.filter(
            status="active",
            project__in=Project.objects.in_scope(request),
        ).update(
            status="acknowledged",
            acknowledged_by=request.user,
            acknowledged_at=timezone.now(),
        )
        return Response({"acknowledged": True})
