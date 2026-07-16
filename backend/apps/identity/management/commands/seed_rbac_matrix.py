"""
Peuple la matrice RBAC par defaut : 11 acteurs, conformement a la
specification fonctionnelle SFD Module 1 - Configuration & Controle
d'acces (section 2 "Acteurs et habilitations" + section 5 "SF-3 -
Structure organisationnelle & RBAC").

Hierarchie d'acces (SF-3) :
    LLFMU (Full Access) -> Regional Hub (Reviewer) -> PMU (Editor)
    -> Partenaires (Viewer / Restricted)

Principe deny-by-default (POL-1.01) : tout acces refuse sauf role
explicitement attribue. La portee (projet/hub/fonds/bailleur/global) est
geree au niveau de RoleAssignment.scope_type, pas au niveau du Role
lui-meme — un meme role peut donc etre attribue a differentes portees
selon le contexte, meme si une portee "recommandee" est indiquee ici a
titre indicatif pour chaque acteur.

Notes de fidelite au SFD :
- RG-3.5 (separation des taches, NIST AC-5) : le createur d'un projet ne
  peut en etre l'unique approbateur — verifie par
  apps.identity.services.check_r26_separation_of_duties() au moment de
  toute attribution de role (cumul Saisie/Soumission + Validation sur un
  meme perimetre).
- RG-3.6 (role restreint "Data Contributor — Partner Sub-component") :
  modelise ici comme une note sur le role Implementing Partner. La
  restriction fine a une sous-composante precise (activites / preuves /
  beneficiaires) n'est PAS encore appliquee au niveau objet — elle
  necessitera un lien vers le futur modele "component" (Module 3/4) pour
  etre enforced techniquement.
- RG-3.7 (override d'urgence, 24h max, justification, auto-revocation)
  n'est PAS encore modelise (aucune table dediee) — a construire si/quand
  la fonctionnalite est priorisee.

Idempotent : peut etre relancee sans creer de doublons.

Usage :
    python manage.py seed_rbac_matrix
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.identity.models import Permission, Role, RolePermission


# (code, label, actions Permission, is_system, description incl. portee recommandee)
ROLES = [
    (
        "llfmu_manager",
        "LLFMU Manager",
        ["read", "validate", "admin"],
        True,
        "Autorite strategique. Visibilite portefeuille, approbation finale des "
        "transitions d'etape, supervision de la gouvernance d'acces. "
        "Portee recommandee : Global.",
    ),
    (
        "llfmu_arbm_specialist",
        "LLFMU aRBM Specialist",
        ["read", "create", "update", "delete", "admin"],
        False,
        "Proprietaire module. Execution de l'assistant d'enregistrement, "
        "gouvernance des classifications, gestion du pre-pipeline. "
        "Portee recommandee : Global.",
    ),
    (
        "llfmu_portfolio_analyst",
        "LLFMU Portfolio Analyst",
        ["read", "create", "update", "submit"],
        False,
        "Intendant pre-approbation. Enregistrement en phase Concept Note / "
        "Pipeline, initiation des transitions. Portee recommandee : Global.",
    ),
    (
        "data_digital_analyst",
        "Data & Digital Analyst",
        ["read", "create", "update", "delete", "admin"],
        True,
        "Autorite de provisioning. Cycle de vie des comptes, affectation de "
        "roles, revocation immediate, revue d'acces trimestrielle (RG-3.2, "
        "RG-3.3). Portee recommandee : Global.",
    ),
    (
        "isdb_otl",
        "IsDB OTL",
        ["read", "validate"],
        False,
        "Supervision projet. Concurrence aux transitions d'etape (autorisation "
        "double), acces au workspace projet. Portee recommandee : Projet.",
    ),
    (
        "regional_hub",
        "Regional Hub (OTL / PMS)",
        ["read", "review"],
        False,
        "Approbateur regional (acces Reviewer). Portefeuille regional, "
        "premier niveau d'approbation. Portee recommandee : Hub.",
    ),
    (
        "pmu_project_manager",
        "PMU Project Manager",
        ["read", "create", "update", "submit"],
        False,
        "Depositaire projet (acces Editor). Soumission de donnees, revue des "
        "affectations RBAC de son equipe. Portee recommandee : Projet.",
    ),
    (
        "pmu_me_officer",
        "PMU M&E Officer",
        ["read", "create", "update"],
        False,
        "Configurateur projet. Configuration du workspace, import en masse, "
        "selection d'indicateurs. Portee recommandee : Projet.",
    ),
    (
        "implementing_partner",
        "Implementing Partner",
        ["read", "create", "update"],
        False,
        "Contributeur composante (Viewer / Restricted Data Contributor). "
        "RG-3.6 : a restreindre a une sous-composante precise "
        "(activites/preuves/beneficiaires) — restriction fine non encore "
        "enforced techniquement. Portee recommandee : Projet (sous-composante).",
    ),
    (
        "donor_representative",
        "Donor Representative",
        ["read"],
        False,
        "Intendant d'investissement. Lecture seule sur les projets finances, "
        "portail self-service (Module 11). Portee recommandee : Bailleur.",
    ),
    (
        "isdb_internal_audit",
        "IsDB Internal Audit / IEvD",
        ["read", "export"],
        False,
        "Verificateur / Evaluateur. Export de la piste d'audit, lecture "
        "seule des archives de cloture. Portee recommandee : Global.",
    ),
]

MODULES = [choice[0] for choice in Permission.MODULE_CHOICES]


class Command(BaseCommand):
    help = "Peuple la matrice RBAC par defaut : permissions (module x action) + 11 acteurs (SFD Module 1)."

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

        # 2. Creer les 11 acteurs + leur matrice de droits (role_permission)
        role_count = 0
        rp_count = 0
        for code, label, actions, is_system, description in ROLES:
            role, _created = Role.objects.get_or_create(
                code=code,
                defaults={"label": label, "description": description, "is_system": is_system},
            )
            role_count += 1

            for action_code in actions:
                for perm in permissions_by_action.get(action_code, []):
                    _rp, created = RolePermission.objects.get_or_create(role=role, permission=perm)
                    if created:
                        rp_count += 1

        self.stdout.write(self.style.SUCCESS(f"Roles (acteurs SFD Module 1) : {role_count} OK"))
        self.stdout.write(self.style.SUCCESS(f"Attributions role<->permission : {rp_count} nouvelles"))

        self.stdout.write(
            self.style.WARNING(
                "\nRappel RG-3.5 (separation des taches, NIST AC-5) : le createur d'un "
                "projet ne peut en etre l'unique approbateur. Toute attribution cumulant "
                "Saisie/Soumission + Validation sur un meme perimetre sera bloquee par "
                "apps.identity.services.check_r26_separation_of_duties(), sauf "
                "RBACException documentee."
            )
        )
        self.stdout.write(
            self.style.WARNING(
                "Non modelise pour l'instant : RG-3.6 (restriction fine sous-composante "
                "pour Implementing Partner) et RG-3.7 (override d'urgence 24h) — a "
                "construire si/quand priorises."
            )
        )
