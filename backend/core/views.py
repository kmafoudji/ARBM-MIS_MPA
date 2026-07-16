"""Endpoint de sante technique, utilise par Docker/Azure Container Apps
pour verifier que le service backend repond correctement."""
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie


def health_check(request):
    return JsonResponse({"status": "ok", "service": "arbm-mes-backend"})


@ensure_csrf_cookie
def csrf_bootstrap(request):
    """A appeler une fois par le frontend pour obtenir le cookie CSRF
    avant tout POST/PUT/DELETE (voir X-CSRFToken cote React)."""
    return JsonResponse({"status": "csrf-cookie-set"})
