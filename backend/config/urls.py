from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from core.asis_import.views import AsisImportView
from core.uploads import LogoUploadView
from core.views import csrf_bootstrap, health_check
from apps.results.urls import indicator_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health-check"),
    path("api/csrf/", csrf_bootstrap, name="csrf-bootstrap"),
    path("api/uploads/logo/", LogoUploadView.as_view(), name="upload-logo"),
    path("api/import/asis/", AsisImportView.as_view(), name="import-asis"),
    path("auth/", include("apps.authentication.urls")),
    path("api/", include("apps.project.urls")),
    path("api/reference/", include("apps.reference.urls")),
    path("api/identity/", include("apps.identity.urls")),
    # Notifications globales (topbar)
    path("api/workplan/notifications/", __import__("apps.workplan.views", fromlist=["GlobalWorkplanNotificationsView"]).GlobalWorkplanNotificationsView.as_view(), name="global-notifications"),
    # Catalogue indicateurs (routes independantes du projet)
    path("api/results/", include((indicator_urlpatterns, "results"))),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
