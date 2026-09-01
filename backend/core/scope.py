"""Role-based data scoping — the single point where row-level visibility is decided.

Who sees which projects, resolved from the user's active RoleAssignments:

- ``global`` / ``fund`` assignment (or ``is_superuser``): the whole portfolio,
  optionally narrowed to one hub chosen in the session (the hub selector);
- ``hub`` assignment(s): only the projects of those hubs;
- ``project`` assignment(s): only those projects;
- no active assignment: nothing (strict default, agreed 2026-09-01).

A project belongs to a hub either through its own ``Project.hub`` FK or — since
that field is rarely filled in — through the hub of its lead country. Always go
through :func:`hub_q`; a bare ``filter(hub_id=...)`` silently drops most of the
portfolio.

This module is independent of ``RBAC_ENFORCED``: that flag gates module-level
permissions (who may *do* what), this one gates row-level visibility (who may
*see* what). ``donor``-scoped assignments grant no row visibility for now.

Views apply the scope through ``Project.objects.in_scope(request)`` (see
``apps.project.managers``) for list/aggregate endpoints, and through the
:class:`ProjectInScope` permission for endpoints nested under
``/api/projects/<pk>/``.
"""
from dataclasses import dataclass

from django.db.models import Q
from rest_framework.permissions import BasePermission

# Session key holding the hub chosen with the topbar selector (int hub id).
HUB_SESSION_KEY = "hub_scope"


def hub_q(hub_ids, prefix=""):
    """Q object matching projects attached to any of ``hub_ids``.

    Matches the direct ``Project.hub`` FK or, as a fallback, the hub of the
    project's lead country. ``prefix`` relocates the predicate when filtering a
    related model (e.g. ``prefix="project__"`` on LogframeRow). Querysets
    filtered with this must call ``.distinct()`` — the lead-country arm joins
    through ``project_countries``.
    """
    hub_ids = list(hub_ids)
    return Q(**{f"{prefix}hub_id__in": hub_ids}) | Q(**{
        f"{prefix}project_countries__is_lead": True,
        f"{prefix}project_countries__country__hub_id__in": hub_ids,
    })


@dataclass(frozen=True)
class Scope:
    """Resolved visibility of one request. ``kind`` drives the frontend too:
    ``global`` shows the hub selector, ``hubs`` a fixed label (or a selector
    restricted to the user's hubs), ``project`` sends the user straight into
    their project, ``none`` shows an empty portfolio."""

    kind: str  # "global" | "hubs" | "project" | "none"
    hub_ids: tuple = ()
    project_ids: tuple = ()
    selected_hub_id: int | None = None


def resolve_scope(request) -> Scope:
    """Resolve the requesting user's scope from RoleAssignments + session.

    The session's selected hub is honoured only when it is within the user's
    allowed hubs (any active hub for a global user).
    """
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return Scope(kind="none")

    selected = request.session.get(HUB_SESSION_KEY)
    selected = int(selected) if selected is not None else None

    if user.is_superuser:
        return Scope(kind="global", selected_hub_id=selected)

    from apps.identity.models import RoleAssignment

    assignments = list(
        RoleAssignment.objects.filter(user=user, revoked_at__isnull=True)
        .values_list("scope_type", "scope_id")
    )

    hub_ids, project_ids = [], []
    for scope_type, scope_id in assignments:
        if scope_type in ("global", "fund"):
            return Scope(kind="global", selected_hub_id=selected)
        if scope_type == "hub" and scope_id:
            hub_ids.append(scope_id)
        elif scope_type == "project" and scope_id:
            project_ids.append(scope_id)

    if hub_ids:
        if selected not in hub_ids:
            selected = None
        return Scope(
            kind="hubs",
            hub_ids=tuple(hub_ids),
            project_ids=tuple(project_ids),
            selected_hub_id=selected,
        )
    if project_ids:
        return Scope(kind="project", project_ids=tuple(project_ids))
    return Scope(kind="none")


def scope_payload(request):
    """Serializable description of the scope, for /auth/me/ and the selector."""
    from apps.reference.models import RegionalHub

    scope = resolve_scope(request)
    if scope.kind == "global":
        hubs = RegionalHub.objects.filter(is_active=True)
    elif scope.hub_ids:
        hubs = RegionalHub.objects.filter(id__in=scope.hub_ids)
    else:
        hubs = RegionalHub.objects.none()

    return {
        "kind": scope.kind,
        "allowed_hubs": [
            {"id": h.id, "code": h.code, "name": h.name}
            for h in hubs.order_by("name")
        ],
        "project_ids": list(scope.project_ids),
        "selected_hub_id": scope.selected_hub_id,
    }


class ProjectInScope(BasePermission):
    """Deny requests whose ``pk`` URL kwarg names a project outside the scope.

    Apply ONLY to views nested under ``/api/projects/<pk>/`` — on those routes
    the ``pk`` kwarg is always the project id. Do not apply it to catalogue
    views (indicators) where ``pk`` means something else.
    """

    message = "Project outside your visibility scope."

    def has_permission(self, request, view):
        pk = view.kwargs.get("pk")
        if pk is None:
            return True
        from apps.project.models import Project

        return Project.objects.in_scope(request).filter(pk=pk).exists()
