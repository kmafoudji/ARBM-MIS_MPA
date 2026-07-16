"""Endpoint de sante technique, utilise par Docker/Azure Container Apps
pour verifier que le service backend repond correctement."""
from django.http import JsonResponse


def health_check(request):
    return JsonResponse({"status": "ok", "service": "sentinelle-backend"})
