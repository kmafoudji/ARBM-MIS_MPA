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


def _has_action_on_scope(user, scope_type, scope_id, actions, exclude_pk=None):
    assignments = RoleAssignment.objects.filter(
        user=user, scope_type=scope_type, scope_id=scope_id, revoked_at__isnull=True
    )
    if exclude_pk is not None:
        # Lors d'une MODIFICATION, la ligne editee ne doit pas etre confrontee a
        # elle-meme : sinon changer un role Validation -> Saisie declenche R26
        # alors que l'ancien role disparait justement au profit du nouveau.
        assignments = assignments.exclude(pk=exclude_pk)
    role_ids = assignments.values_list("role_id", flat=True)
    return RolePermission.objects.filter(
        role_id__in=role_ids, permission__action__in=actions
    ).exists()


def check_r26_separation_of_duties(user, new_role, scope_type, scope_id, exclude_pk=None):
    """
    Leve une ValidationError si l'attribution de `new_role` a `user` sur ce
    perimetre creerait un cumul Saisie+Validation non derogue.

    A appeler AVANT de sauvegarder un RoleAssignment. Lors d'une modification,
    passer `exclude_pk=instance.pk` pour que la ligne editee ne compte pas
    comme une attribution concurrente d'elle-meme.
    """
    new_role_actions = set(
        RolePermission.objects.filter(role=new_role).values_list("permission__action", flat=True)
    )

    would_add_entry = bool(new_role_actions & ENTRY_ACTIONS)
    would_add_validation = bool(new_role_actions & VALIDATION_ACTIONS)

    has_entry = would_add_entry or _has_action_on_scope(
        user, scope_type, scope_id, ENTRY_ACTIONS, exclude_pk
    )
    has_validation = would_add_validation or _has_action_on_scope(
        user, scope_type, scope_id, VALIDATION_ACTIONS, exclude_pk
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


def get_user_permissions(user):
    """
    Retourne l'ensemble des codes "module:action" detenus par l'utilisateur,
    tous perimetres confondus (RG-3.1 : deny-by-default — un utilisateur sans
    RoleAssignment actif n'a aucune permission).

    Note de portee : cette fonction agrege les permissions sans filtrer par
    perimetre. Elle convient aux referentiels, qui sont globaux par nature.
    Pour les objets rattaches a un projet/hub, il faudra un controle
    supplementaire au niveau de l'objet (row-level security).
    """
    if not user or not user.is_authenticated:
        return set()

    # Le superuser est un COMPTE TECHNIQUE d'exploitation (acces de secours a
    # l'admin Django), pas une personne : il court-circuite le RBAC applicatif.
    #
    # Consequence a connaitre : attribuer un role metier a un superuser n'a
    # AUCUN effet restrictif — il conserve toutes les permissions. Un superuser
    # n'est donc pas un persona testable : pour eprouver les limites d'un profil
    # (PMU, Regional Hub...), il faut un compte non-superuser.
    if user.is_superuser:
        return {"*"}

    role_ids = RoleAssignment.objects.filter(
        user=user, revoked_at__isnull=True
    ).values_list("role_id", flat=True)

    return {
        f"{rp.permission.module}:{rp.permission.action}"
        for rp in RolePermission.objects.filter(role_id__in=role_ids).select_related("permission")
    }


def user_has_permission(user, module, action):
    """Vrai si l'utilisateur detient `action` sur `module` (ou est superuser)."""
    perms = get_user_permissions(user)
    return "*" in perms or f"{module}:{action}" in perms


def get_user_role_codes(user):
    """
    Codes des roles actifs de l'utilisateur, tous perimetres confondus.

    Distinct de get_user_permissions() : certaines regles du SFD designent
    des ROLES nommes (« Concept Note -> LLFMU Portfolio Analyst ») et non des
    couples module x action. La matrice module x action est trop grossiere
    pour les exprimer — elle ne sait pas distinguer « creer un projet » de
    « creer un pays », les deux etant des `create` sur m1_config_access.
    """
    if not user or not user.is_authenticated:
        return set()

    return set(
        RoleAssignment.objects.filter(user=user, revoked_at__isnull=True).values_list(
            "role__code", flat=True
        )
    )
