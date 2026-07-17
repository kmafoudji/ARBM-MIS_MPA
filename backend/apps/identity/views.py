from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import AppUser, Role, RoleAssignment
from .serializers import AppUserSerializer, RoleAssignmentSerializer, RoleSerializer


class AppUserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Expose la liste des utilisateurs (email/nom) pour peupler des
    selecteurs cote frontend (ex. second approbateur d'une transition
    d'etape SF-4). Pas de donnees sensibles exposees ici.
    """

    queryset = AppUser.objects.filter(is_active=True).order_by("email")
    serializer_class = AppUserSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """Catalogue des 11 acteurs RBAC (SFD Module 1) — lecture seule."""

    queryset = Role.objects.all().order_by("label")
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class RoleAssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Attributions de roles. v1 : lecture seule, visible par tout
    utilisateur authentifie (a restreindre par perimetre une fois le
    RBAC applicatif branche sur les vues elles-memes).
    """

    queryset = RoleAssignment.objects.select_related(
        "user", "role", "granted_by"
    ).order_by("-granted_at")
    serializer_class = RoleAssignmentSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
