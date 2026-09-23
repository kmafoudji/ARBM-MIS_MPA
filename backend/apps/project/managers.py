"""Custom queryset for Project — carries the scoping seam (see core.scope)."""
from django.db import models

from core.scope import hub_q, resolve_scope


class ProjectQuerySet(models.QuerySet):
    def in_scope(self, request):
        """Restrict to the projects the requesting user may see.

        Explicit and opt-in, not the default behaviour: the Django admin and
        the public login-page counters keep the unrestricted queryset.
        """
        scope = resolve_scope(request)

        if scope.kind == "global":
            if scope.selected_hub_id:
                return self.filter(hub_q((scope.selected_hub_id,))).distinct()
            return self
        if scope.kind == "none":
            return self.none()

        q = models.Q(pk__in=scope.project_ids)
        if scope.hub_ids:
            hub_ids = (
                (scope.selected_hub_id,)
                if scope.selected_hub_id
                else scope.hub_ids
            )
            q |= hub_q(hub_ids)
        return self.filter(q).distinct()

    def of_taxonomy(self, taxonomy):
        """Projects of one type (ADR 0014): IsDB, or LLF (LLF1, LLF2, untyped)."""
        if taxonomy == "isdb":
            return self.filter(investment_cycle="IsDB")
        return self.exclude(investment_cycle="IsDB")
