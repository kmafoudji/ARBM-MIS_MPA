from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import AppUser, Role, RoleAssignment, RolePermission


class AppUserSerializer(serializers.ModelSerializer):
    """Lecture + création + patch is_active."""
    full_name = serializers.SerializerMethodField()
    role_labels = serializers.SerializerMethodField()

    class Meta:
        model = AppUser
        fields = [
            "id", "email", "first_name", "last_name", "full_name",
            "user_type", "auth_method", "is_active",
            "mfa_enrolled", "mfa_method",
            "date_joined", "last_login",
            "role_labels",
        ]
        read_only_fields = ["date_joined", "last_login", "full_name", "role_labels"]

    def get_full_name(self, obj):
        return (f"{obj.first_name} {obj.last_name}").strip() or None

    def get_role_labels(self, obj):
        return list(
            RoleAssignment.objects.filter(user=obj, revoked_at__isnull=True)
            .select_related("role")
            .values_list("role__label", flat=True)
        )


class AppUserCreateSerializer(serializers.ModelSerializer):
    """Création d'un compte local (pre-provisioning SSO ou compte de test)."""
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = AppUser
        fields = ["email", "first_name", "last_name", "user_type", "auth_method", "password"]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        auth_method = validated_data.get("auth_method", "sso")
        user = AppUser(**validated_data)
        user.username = validated_data["email"]
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user


class RolePermissionInlineSerializer(serializers.ModelSerializer):
    action = serializers.CharField(source="permission.action")
    module = serializers.CharField(source="permission.module")

    class Meta:
        model = RolePermission
        fields = ["action", "module"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    assignment_count = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "code", "label", "description", "is_system", "permissions", "assignment_count"]

    def get_permissions(self, obj):
        actions = set(
            obj.role_permissions.values_list("permission__action", flat=True)
        )
        return sorted(actions)

    def get_assignment_count(self, obj):
        return obj.assignments.filter(revoked_at__isnull=True).count()


class RoleAssignmentSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.SerializerMethodField(read_only=True)
    role_label = serializers.CharField(source="role.label", read_only=True)
    role_code = serializers.CharField(source="role.code", read_only=True)
    scope_type_display = serializers.CharField(source="get_scope_type_display", read_only=True)
    granted_by_email = serializers.CharField(source="granted_by.email", read_only=True)

    class Meta:
        model = RoleAssignment
        fields = [
            "id",
            "user", "user_email", "user_name",
            "role", "role_label", "role_code",
            "scope_type", "scope_type_display", "scope_id",
            "granted_by_email", "granted_at", "revoked_at",
        ]
        read_only_fields = [
            "id", "user_email", "user_name", "role_label", "role_code",
            "scope_type_display", "granted_by_email", "granted_at",
        ]

    def get_user_name(self, obj):
        u = obj.user
        return (f"{u.first_name} {u.last_name}").strip() or None

    def validate(self, attrs):
        # Appel de la règle R26 via model.clean()
        instance = RoleAssignment(**attrs)
        try:
            instance.clean()
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict if hasattr(e, 'message_dict') else str(e))
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["granted_by"] = request.user
        return super().create(validated_data)
