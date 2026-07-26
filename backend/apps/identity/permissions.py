"""
Permissions DRF adossees au RBAC applicatif (RG-3.1 deny-by-default).

Si RBAC_ENFORCED=False, tout utilisateur authentifie est autorise
sur toutes les actions (mode developpement).
"""
from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .services import user_has_permission

METHOD_ACTION_MAP = {
    "GET": "read", "HEAD": "read", "OPTIONS": "read",
    "POST": "create", "PUT": "update", "PATCH": "update", "DELETE": "delete",
}


class HasModulePermission(BasePermission):
    message = "Votre role ne vous autorise pas cette action sur ce module."

    def has_permission(self, request, view):
        # Court-circuit si RBAC désactivé
        if not getattr(settings, "RBAC_ENFORCED", True):
            return bool(request.user and request.user.is_authenticated)

        module = getattr(view, "permission_module", None)
        if module is None:
            raise AssertionError(
                f"{view.__class__.__name__} utilise HasModulePermission sans "
                f"definir l'attribut `permission_module`."
            )
        action = METHOD_ACTION_MAP.get(request.method)
        if action is None:
            return False
        return user_has_permission(request.user, module, action)


class ReadOnlyOrHasModulePermission(HasModulePermission):
    """Lecture ouverte ; ecriture soumise au RBAC (ou bypass si RBAC_ENFORCED=False)."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return super().has_permission(request, view)
