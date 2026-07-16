"""
Application de la regle R26 (separation des taches) lors de l'attribution
d'un role. A appeler depuis les serializers/vues de gestion RBAC (Module 1,
SF-x "Attribution de roles") avant toute creation de RoleAssignment.

Regle : un utilisateur ne peut pas detenir, sur le meme perimetre
(scope_type + scope_id), a la fois une permission "create/update" (saisie)
et une permission "validate" (validation) — sauf s'il existe une
RBACException active et approuvee pour ce perimetre.
"""
from django.core.exceptions import ValidationError

from .models import RBACException, RoleAssignment, RolePermission


ENTRY_ACTIONS = {"create", "update", "submit"}
VALIDATION_ACTIONS = {"validate"}


def _has_action_on_scope(user, scope_type, scope_id, actions):
    assignments = RoleAssignment.objects.filter(
        user=user, scope_type=scope_type, scope_id=scope_id, revoked_at__isnull=True
    )
    role_ids = assignments.values_list("role_id", flat=True)
    return RolePermission.objects.filter(
        role_id__in=role_ids, permission__action__in=actions
    ).exists()


def check_r26_separation_of_duties(user, new_role, scope_type, scope_id):
    """
    Leve une ValidationError si l'attribution de `new_role` a `user` sur ce
    perimetre creerait un cumul Saisie+Validation non derogue.

    A appeler AVANT de sauvegarder un nouveau RoleAssignment.
    """
    new_role_actions = set(
        RolePermission.objects.filter(role=new_role).values_list("permission__action", flat=True)
    )

    would_add_entry = bool(new_role_actions & ENTRY_ACTIONS)
    would_add_validation = bool(new_role_actions & VALIDATION_ACTIONS)

    has_entry = would_add_entry or _has_action_on_scope(user, scope_type, scope_id, ENTRY_ACTIONS)
    has_validation = would_add_validation or _has_action_on_scope(
        user, scope_type, scope_id, VALIDATION_ACTIONS
    )

    if has_entry and has_validation:
        exception_exists = RBACException.objects.filter(
            user=user, scope_type=scope_type, scope_id=scope_id
        ).exists()
        if not exception_exists:
            raise ValidationError(
                "R26 : cet utilisateur cumulerait les droits Saisie et Validation "
                "sur ce perimetre. Creez une derogation documentee (RBACException) "
                "avant d'attribuer ce role, ou choisissez un autre perimetre/role."
            )
