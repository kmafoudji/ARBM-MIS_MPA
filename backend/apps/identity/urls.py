from rest_framework.routers import DefaultRouter

from .views import AppUserViewSet, RoleAssignmentViewSet, RoleViewSet

router = DefaultRouter()
router.register("users", AppUserViewSet, basename="appuser")
router.register("roles", RoleViewSet, basename="role")
router.register("role-assignments", RoleAssignmentViewSet, basename="roleassignment")

urlpatterns = router.urls
