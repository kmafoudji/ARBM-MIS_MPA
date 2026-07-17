"""
Permissions DRF adossees au RBAC applicatif (RG-3.1 deny-by-default).

Branche les vues sur la matrice role x permission definie en base plutot
que sur le simple fait d'etre authentifie.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .services import user_has_permission


# Methode HTTP -> action Permission
METHOD_ACTION_MAP = {
    "GET": "read",
    "HEAD": "read",
    "OPTIONS": "read",
    "POST": "create",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
}


class HasModulePermission(BasePermission):
    """
    Verifie que l'utilisateur detient l'action correspondant a la methode
    HTTP sur le module declare par la vue via `permission_module`.

    Exemple :
        class CountryViewSet(ModelViewSet):
            permission_classes = [IsAuthenticated, HasModulePermission]
            permission_module = "m1_config_access"
    """

    message = "Votre role ne vous autorise pas cette action sur ce module."

    def has_permission(self, request, view):
        module = getattr(view, "permission_module", None)
        if module is None:
            raise AssertionError(
                f"{view.__class__.__name__} utilise HasModulePermission sans definir "
                f"l'attribut `permission_module`."
            )

        action = METHOD_ACTION_MAP.get(request.method)
        if action is None:
            return False

        return user_has_permission(request.user, module, action)


class ReadOnlyOrHasModulePermission(HasModulePermission):
    """
    Lecture ouverte a tout utilisateur authentifie ; ecriture soumise au RBAC.

    Utile pour les referentiels : tout le monde doit pouvoir lire la liste des
    pays (pour remplir un formulaire projet), mais seuls les roles habilites
    peuvent la modifier.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return super().has_permission(request, view)
