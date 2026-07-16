from django.contrib import admin
from django.urls import include, path

from core.views import csrf_bootstrap, health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health-check"),
    path("api/csrf/", csrf_bootstrap, name="csrf-bootstrap"),
    path("auth/", include("apps.authentication.urls")),
    path("api/", include("apps.project.urls")),
    path("api/reference/", include("apps.reference.urls")),
]
