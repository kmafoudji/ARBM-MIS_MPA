from rest_framework import serializers

from .models import AppUser, Role, RoleAssignment


class AppUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppUser
        fields = ["id", "email", "first_name", "last_name"]


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "code", "label", "description", "is_system"]


class RoleAssignmentSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    role_label = serializers.CharField(source="role.label", read_only=True)
    scope_type_display = serializers.CharField(source="get_scope_type_display", read_only=True)
    granted_by_email = serializers.CharField(source="granted_by.email", read_only=True)

    class Meta:
        model = RoleAssignment
        fields = [
            "id", "user", "user_email", "role", "role_label",
            "scope_type", "scope_type_display", "scope_id",
            "granted_by_email", "granted_at", "revoked_at",
        ]
        read_only_fields = fields
