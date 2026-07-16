"""
Peuple la matrice RBAC par defaut : 7 profils (personas), definis par
capacite x portee, conformement a la specification fonctionnelle validee
(grille F2 - workflow QRT : Configurer / Collecter / Valider-Approuver /
Agreger-Restituer / Administrer).

Principe : un droit = capacite x portee. La capacite est ce qu'on a le
droit de faire (modelisee ici via Permission.action) ; la portee est
l'ensemble des projets/hubs qu'on voit (modelisee via
RoleAssignment.scope_type au moment de l'attribution a un utilisateur —
pas au niveau du role lui-meme).

Le Role/Permission ajoute une dimension supplementaire (module, ex. M1
Configuration, M2 Indicateurs...) par rapport a la spec d'origine qui ne
distinguait que la capacite. Par simplicite en v1, chaque capacite est
appliquee uniformement sur les 11 modules ; un raffinement par module
(ex. "Configurer" restreint a M1/M2 uniquement) pourra etre fait plus
tard sans casser la structure.

⚠ Rappel R26 : le profil "Responsable M&E PMU" cumule par construction
Saisir + Soumettre + Valider — son attribution a un utilisateur sur un
perimetre "projet" declenchera donc systematiquement la verification R26
(apps.identity.services.check_r26_separation_of_duties) et exigera une
RBACException documentee, conformement a la decision du 16/07/2026.

Idempotent : peut etre relancee sans creer de doublons.

Usage :
    python manage.py seed_rbac_matrix
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import Permission, Role, RolePermission


# Capacite (spec fonctionnelle) -> actions Permission concretes
CAPABILITY_ACTIONS = {
    "read": ["read", "export"],
    "saisir": ["create", "update"],
    "soumettre": ["submit"],
    "reviser": ["review"],
    "valider": ["validate"],
    "configurer": ["create", "update", "delete"],
    "administrer": ["admin"],
}

# 7 profils par defaut (persona, label, capacites, is_system, description)
ROLES = [
    (
        "admin_central_llfmu",
        "Administrateur central LLFMU",
        ["read", "configurer", "administrer"],
        True,
        "Portee recommandee a l'attribution : Global. Configure et administre l'ensemble du fonds.",
    ),
    (
        "analyste_me_llfmu",
        "Analyste / M&E LLFMU",
        ["read", "valider"],
        False,
        "Portee recommandee : Global. Valide au niveau fonds (central decide des cibles - cf. decision target-setting).",
    ),
    (
        "coordinateur_hub",
        "Coordinateur Hub",
        ["read", "reviser"],
        False,
        "Portee recommandee : Hub. Revise les soumissions des projets de son hub.",
    ),
    (
        "responsable_me_pmu",
        "Responsable M&E PMU",
        ["read", "saisir", "soumettre", "valider"],
        False,
        "⚠ R26 : cumule Saisie+Validation par construction. Attribution a un perimetre "
        "'projet' necessite une RBACException documentee (derogation R26).",
    ),
    (
        "agent_saisie_pmu",
        "Agent de saisie PMU",
        ["read", "saisir", "soumettre"],
        False,
        "Portee recommandee : Projet. Profil de saisie sans droit de validation (separation des taches).",
    ),
    (
        "donateur",
        "Donateur",
        ["read"],
        False,
        "Portee recommandee : Bailleur (donor) — perimetre de donnees exact encore a trancher.",
    ),
    (
        "admin_systeme",
        "Administrateur systeme",
        ["administrer"],
        True,
        "Portee recommandee : Global/Transversal. Gestion technique (utilisateurs, audit, parametres).",
    ),
]

MODULES = [choice[0] for choice in Permission.MODULE_CHOICES]


class Command(BaseCommand):
    help = "Peuple la matrice RBAC par defaut : permissions (module x action) + 7 profils."

    @transaction.atomic
    def handle(self, *args, **options):
        # 1. Generer toutes les permissions (module x action)
        perm_count = 0
        permissions_by_action = {}
        for module in MODULES:
            for action_code, _label in Permission.ACTION_CHOICES:
                perm, _created = Permission.objects.get_or_create(
                    module=module,
                    action=action_code,
                    defaults={"code": f"{module}.{action_code}"},
                )
                permissions_by_action.setdefault(action_code, []).append(perm)
                perm_count += 1
        self.stdout.write(self.style.SUCCESS(f"Permissions (module x action) : {perm_count} OK"))

        # 2. Creer les 7 roles + leur matrice de droits (role_permission)
        role_count = 0
        rp_count = 0
        for code, label, capabilities, is_system, description in ROLES:
            role, _created = Role.objects.get_or_create(
                code=code,
                defaults={"label": label, "description": description, "is_system": is_system},
            )
            role_count += 1

            actions_for_role = set()
            for capability in capabilities:
                actions_for_role.update(CAPABILITY_ACTIONS[capability])

            for action_code in actions_for_role:
                for perm in permissions_by_action.get(action_code, []):
                    _rp, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    if created:
                        rp_count += 1

        self.stdout.write(self.style.SUCCESS(f"Roles (profils) : {role_count} OK"))
        self.stdout.write(self.style.SUCCESS(f"Attributions role<->permission : {rp_count} nouvelles"))

        self.stdout.write(
            self.style.WARNING(
                "\n⚠ Le role 'responsable_me_pmu' cumule Saisie+Validation par construction "
                "(conflit R26). Toute tentative d'attribution (RoleAssignment) a un utilisateur "
                "sur un perimetre 'project' sans RBACException prealable sera bloquee par "
                "apps.identity.services.check_r26_separation_of_duties()."
            )
        )
