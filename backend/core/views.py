"""Endpoint de sante technique, utilise par Docker/Azure Container Apps
pour verifier que le service backend repond correctement."""
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.scope import HUB_SESSION_KEY, resolve_scope, scope_payload


def health_check(request):
    return JsonResponse({"status": "ok", "service": "arbm-mis-backend"})


@ensure_csrf_cookie
def csrf_bootstrap(request):
    """A appeler une fois par le frontend pour obtenir le cookie CSRF
    avant tout POST/PUT/DELETE (voir X-CSRFToken cote React)."""
    return JsonResponse({"status": "csrf-cookie-set"})


class HubScopeView(APIView):
    """GET/POST /api/scope/hub/ — the session-stored hub denominator.

    GET returns the current scope (same payload as /auth/me/ "scope").
    POST {"hub": <id>|null} selects a hub within the user's allowed hubs
    (any active hub for a global user; null clears the selection). Users whose
    scope is a single project — or nothing — have no selector: 403.

    Session-authenticated and CSRF-protected (deliberately NOT csrf_exempt).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(scope_payload(request))

    def post(self, request):
        scope = resolve_scope(request)
        if scope.kind not in ("global", "hubs"):
            return Response(
                {"detail": "Your scope has no hub selector."}, status=403
            )

        hub = request.data.get("hub")
        if hub is None:
            request.session.pop(HUB_SESSION_KEY, None)
            return Response(scope_payload(request))

        try:
            hub = int(hub)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid hub id."}, status=400)

        allowed = {h["id"] for h in scope_payload(request)["allowed_hubs"]}
        if hub not in allowed:
            return Response(
                {"detail": "Hub outside your visibility scope."}, status=403
            )

        request.session[HUB_SESSION_KEY] = hub
        return Response(scope_payload(request))
