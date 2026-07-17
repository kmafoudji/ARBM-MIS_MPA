from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from core.uploads import LogoUploadView
from core.views import csrf_bootstrap, health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health_check, name="health-check"),
    path("api/csrf/", csrf_bootstrap, name="csrf-bootstrap"),
    path("api/uploads/logo/", LogoUploadView.as_view(), name="upload-logo"),
    path("auth/", include("apps.authentication.urls")),
    path("api/", include("apps.project.urls")),
    path("api/reference/", include("apps.reference.urls")),
    path("api/identity/", include("apps.identity.urls")),
]

# En developpement, Django sert lui-meme les fichiers televerses. En
# production ce role revient a Azure Blob Storage / au CDN : Django ne doit
# jamais servir de media, c'est lent et non securise (cf. doc Django).
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
