"""
Domaine identity — authentification (SSO/MFA) et RBAC.

Aligne sur le modele de donnees canonique v6.0 (domaine identity, 7 tables) :
app_user, identity_provider, role, permission, role_permission,
role_assignment, + gestion des exceptions R26 (separation des taches).

Regle metier R26 (tranchee le 16/07/2026) : un utilisateur ne peut pas
cumuler les droits Saisie ET Validation sur le meme perimetre, sauf
derogation explicitement justifiee et tracee (voir RBACException).
"""
from django.contrib.auth.models import AbstractUser
from django.db import models


class IdentityProvider(models.Model):
    """Fournisseur d'identite externe (Microsoft Entra ID en premier lieu)."""

    PROTOCOL_CHOICES = [
        ("oidc", "OpenID Connect"),
        ("saml2", "SAML 2.0"),
    ]

    name = models.CharField(max_length=100)
    protocol = models.CharField(max_length=10, choices=PROTOCOL_CHOICES, default="oidc")
    issuer = models.CharField(max_length=255, blank=True)
    metadata_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "identity_provider"

    def __str__(self):
        return self.name


class AppUser(AbstractUser):
    """Utilisateur de la plateforme ARBM-MES. Remplace le User Django par defaut."""

    USER_TYPE_CHOICES = [
        ("internal", "Interne (staff MillenniumPromise / IsDB)"),
        ("external", "Externe (PMU, hub regional, donateur, auditeur)"),
    ]
    AUTH_METHOD_CHOICES = [
        ("password", "Mot de passe local"),
        ("sso", "SSO (Entra ID)"),
    ]
    MFA_METHOD_CHOICES = [
        ("none", "Aucune"),
        ("app", "Application d'authentification"),
        ("sms", "SMS"),
    ]

    user_type = models.CharField(max_length=10, choices=USER_TYPE_CHOICES, default="internal")
    auth_method = models.CharField(max_length=10, choices=AUTH_METHOD_CHOICES, default="sso")
    identity_provider = models.ForeignKey(
        IdentityProvider, on_delete=models.SET_NULL, null=True, blank=True, related_name="users"
    )
    idp_subject = models.CharField(
        max_length=255, blank=True, help_text="Identifiant unique cote fournisseur (sub claim OIDC)."
    )
    mfa_enrolled = models.BooleanField(default=False)
    mfa_method = models.CharField(max_length=10, choices=MFA_METHOD_CHOICES, default="none")

    class Meta:
        db_table = "app_user"

    def __str__(self):
        return self.email or self.username


class Role(models.Model):
    """Role fonctionnel (persona) — ex. Admin Global, M&E IsDB, Responsable PMU, ..."""

    code = models.SlugField(max_length=50, unique=True)
    label = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(
        default=False, help_text="Role systeme non supprimable (ex. Admin Global)."
    )

    class Meta:
        db_table = "role"

    def __str__(self):
        return self.label


class Permission(models.Model):
    """Droit atomique : une action sur un module donne."""

    MODULE_CHOICES = [
        ("m1_config_access", "M1 - Configuration & Controle d'acces"),
        ("m2_results_indicators", "M2 - Cadre de resultats & indicateurs"),
        ("m3_workplan", "M3 - Plan de travail"),
        ("m4_collection", "M4 - Collecte de donnees"),
        ("m5_validation", "M5 - Validation"),
        ("m6_reporting", "M6 - Restitution"),
        ("m7_gis", "M7 - Cartographie"),
        ("m8_procurement", "M8 - Achats"),
        ("m9_risk", "M9 - Risques"),
        ("m10_quality", "M10 - Qualite / Audit"),
        ("m11_admin", "M11 - Administration"),
    ]
    ACTION_CHOICES = [
        ("create", "Creer"),
        ("read", "Consulter"),
        ("update", "Modifier"),
        ("delete", "Supprimer"),
        ("validate", "Valider"),
        ("export", "Exporter"),
        ("admin", "Administrer"),
    ]

    code = models.SlugField(max_length=80, unique=True)
    module = models.CharField(max_length=30, choices=MODULE_CHOICES)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "permission"
        unique_together = ("module", "action")

    def __str__(self):
        return f"{self.module}:{self.action}"


class RolePermission(models.Model):
    """Table de jonction — materialise la matrice de droits par persona (grille F2)."""

    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="role_permissions")

    class Meta:
        db_table = "role_permission"
        unique_together = ("role", "permission")


class RoleAssignment(models.Model):
    """Attribution d'un role a un utilisateur, a un perimetre donne (global/fonds/hub/projet)."""

    SCOPE_CHOICES = [
        ("global", "Global"),
        ("fund", "Fonds (LLF2)"),
        ("hub", "Hub regional"),
        ("project", "Projet"),
    ]

    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="assignments")
    scope_type = models.CharField(max_length=10, choices=SCOPE_CHOICES)
    scope_id = models.PositiveIntegerField(
        null=True, blank=True, help_text="ID de l'objet cible (hub, projet...). Vide si scope_type=global."
    )
    granted_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="assignments_granted"
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "role_assignment"

    def __str__(self):
        return f"{self.user} -> {self.role} [{self.scope_type}:{self.scope_id or '-'}]"


class RBACException(models.Model):
    """
    Derogation documentee a la regle R26 (separation des taches).

    R26 : par defaut, un utilisateur ne peut pas cumuler Saisie + Validation
    sur le meme perimetre. Toute derogation doit etre justifiee et approuvee
    explicitement — trace d'audit permanente.
    """

    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="rbac_exceptions")
    scope_type = models.CharField(max_length=10, choices=RoleAssignment.SCOPE_CHOICES)
    scope_id = models.PositiveIntegerField(null=True, blank=True)
    justification = models.TextField()
    approved_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, related_name="rbac_exceptions_approved"
    )
    approved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "rbac_exception"

    def __str__(self):
        return f"Derogation R26 - {self.user} [{self.scope_type}:{self.scope_id or '-'}]"
