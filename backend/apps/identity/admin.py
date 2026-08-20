from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AppUser,
    IdentityProvider,
    Permission,
    RBACException,
    Role,
    RoleAssignment,
    RolePermission,
)


@admin.register(AppUser)
class AppUserAdmin(UserAdmin):
    list_display = ("username", "email", "user_type", "auth_method", "mfa_enrolled", "is_active")
    fieldsets = UserAdmin.fieldsets + (
        (
            "aRBM-MIS — SSO / MFA",
            {
                "fields": (
                    "user_type",
                    "auth_method",
                    "identity_provider",
                    "idp_subject",
                    "mfa_enrolled",
                    "mfa_method",
                )
            },
        ),
    )


@admin.register(IdentityProvider)
class IdentityProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "protocol", "is_active")


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("code", "label", "is_system")


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "module", "action")
    list_filter = ("module", "action")


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ("role", "permission")
    list_filter = ("role",)


@admin.register(RoleAssignment)
class RoleAssignmentAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "scope_type", "scope_id", "granted_at", "revoked_at")
    list_filter = ("scope_type", "role")


@admin.register(RBACException)
class RBACExceptionAdmin(admin.ModelAdmin):
    list_display = ("user", "scope_type", "scope_id", "approved_by", "approved_at")
