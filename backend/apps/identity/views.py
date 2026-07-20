from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AppUser, Role, RoleAssignment
from .serializers import (
    AppUserSerializer,
    AppUserCreateSerializer,
    RoleSerializer,
    RoleAssignmentSerializer,
)


class AppUserViewSet(viewsets.ModelViewSet):
    """
    GET    /api/identity/users/          — liste (tous, y compris inactifs)
    POST   /api/identity/users/          — créer un compte (local ou pre-SSO)
    GET    /api/identity/users/{id}/     — détail
    PATCH  /api/identity/users/{id}/     — modifier (is_active, nom…)
    POST   /api/identity/users/{id}/toggle_active/ — activer / désactiver
    """
    permission_classes = [IsAuthenticated]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return AppUser.objects.all().order_by("email")

    def get_serializer_class(self):
        if self.action == "create":
            return AppUserCreateSerializer
        return AppUserSerializer

    @action(detail=True, methods=["post"], url_path="toggle_active")
    def toggle_active(self, request, pk=None):
        user = self.get_object()
        user.is_active = not user.is_active
        user.save(update_fields=["is_active"])
        return Response(AppUserSerializer(user).data)


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """Catalogue des 11 acteurs RBAC — lecture seule."""
    queryset = Role.objects.all().order_by("label")
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None


class RoleAssignmentViewSet(viewsets.ModelViewSet):
    """
    GET    /api/identity/role-assignments/          — liste active
    POST   /api/identity/role-assignments/          — attribuer un rôle
    DELETE /api/identity/role-assignments/{id}/     — révoquer (soft delete)
    """
    permission_classes = [IsAuthenticated]
    pagination_class = None
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = RoleAssignment.objects.select_related(
            "user", "role", "granted_by"
        ).order_by("-granted_at")
        # Filtre optionnel ?active=true
        if self.request.query_params.get("active") == "true":
            qs = qs.filter(revoked_at__isnull=True)
        return qs

    def get_serializer_class(self):
        return RoleAssignmentSerializer

    def destroy(self, request, *args, **kwargs):
        """Révocation soft : on pose revoked_at, on ne supprime pas la ligne."""
        from django.utils import timezone
        assignment = self.get_object()
        if assignment.revoked_at:
            return Response(
                {"detail": "Assignment already revoked."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assignment.revoked_at = timezone.now()
        assignment.save(update_fields=["revoked_at"])
        return Response(RoleAssignmentSerializer(assignment).data)
