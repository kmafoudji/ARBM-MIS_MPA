from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Project
from .serializers import ProjectCreateSerializer, ProjectDetailSerializer, ProjectListSerializer


class ProjectViewSet(viewsets.ModelViewSet):
    """
    SF-1 (assistant d'enregistrement) — v1 expose la creation minimale
    (Etape 1, sous-ensemble Concept Note) et la consultation. Les etapes
    2/3/4/5 (ToC, transitions d'etape, RBAC projet, reporting) seront
    exposees via des endpoints dedies au fur et a mesure.
    """

    queryset = Project.objects.select_related("country", "sector", "primary_sdg", "created_by").all()
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return ProjectCreateSerializer
        if self.action == "list":
            return ProjectListSerializer
        return ProjectDetailSerializer
