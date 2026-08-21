"""
Structures de donnees du plan d'import (design §6).

Volontairement sans dependance Django : ce module decrit ce qui *va* etre
fait, pas comment l'ecrire. Il est donc testable seul, et le rapport rendu
au client est exactement ce que le parser a decide.
"""
from dataclasses import dataclass, field
from typing import Any, Optional

# Actions possibles sur une ligne (design §6).
ACTION_CREATE = "create"
ACTION_UPDATE = "update"
ACTION_REPLACE = "replace"
ACTION_UNCHANGED = "unchanged"

ACTIONS = (ACTION_CREATE, ACTION_UPDATE, ACTION_REPLACE, ACTION_UNCHANGED)


@dataclass
class FieldDiff:
    """Ecart sur un champ, porte par une action `update`."""

    field: str
    from_value: Any
    to_value: Any

    def to_dict(self):
        return {"field": self.field, "from": self.from_value, "to": self.to_value}


@dataclass
class PlannedChange:
    """
    Une ligne du rapport. `target` identifie l'objet en langage humain
    (code d'activite, reference projet...), pas par cle primaire : le
    rapport est lu avant que quoi que ce soit existe en base.
    """

    sheet: str
    action: str
    target: str
    detail: str = ""
    diffs: list[FieldDiff] = field(default_factory=list)
    # Charge utile a ecrire, remplie par le parser et consommee par
    # l'applier. Jamais serialisee vers le client.
    payload: dict = field(default_factory=dict, repr=False)

    def to_dict(self):
        out = {
            "sheet": self.sheet,
            "action": self.action,
            "target": self.target,
            "detail": self.detail,
        }
        if self.diffs:
            out["diffs"] = [d.to_dict() for d in self.diffs]
        return out


@dataclass
class ImportIssue:
    """
    Une erreur (bloquante) ou un avertissement (informatif). Toutes deux
    portent la feuille et la ligne : un message sans coordonnees n'est pas
    exploitable dans un classeur de 13 feuilles.
    """

    sheet: str
    row: Optional[int]
    message: str
    column: str = ""

    def to_dict(self):
        return {
            "sheet": self.sheet,
            "row": self.row,
            "column": self.column,
            "message": self.message,
        }


@dataclass
class ImportPlan:
    """Resultat complet d'une analyse de classeur."""

    project_ref: str = ""
    project_exists: bool = False
    changes: list[PlannedChange] = field(default_factory=list)
    errors: list[ImportIssue] = field(default_factory=list)
    warnings: list[ImportIssue] = field(default_factory=list)
    file_sha256: str = ""
    # Renseigne par l'applier, apres ecriture.
    committed: bool = False
    project_id: Optional[int] = None

    # -- construction -----------------------------------------------------

    def add_change(self, sheet, action, target, detail="", diffs=None, payload=None):
        change = PlannedChange(
            sheet=sheet,
            action=action,
            target=str(target),
            detail=detail,
            diffs=diffs or [],
            payload=payload or {},
        )
        self.changes.append(change)
        return change

    def add_error(self, sheet, row, message, column=""):
        self.errors.append(ImportIssue(sheet=sheet, row=row, message=message, column=column))

    def add_warning(self, sheet, row, message, column=""):
        self.warnings.append(ImportIssue(sheet=sheet, row=row, message=message, column=column))

    @property
    def has_errors(self):
        return bool(self.errors)

    def changes_for(self, sheet, action=None):
        """Filtre utilise par l'applier pour rejouer le plan feuille par feuille."""
        return [
            c
            for c in self.changes
            if c.sheet == sheet and (action is None or c.action == action)
        ]

    # -- rapport ----------------------------------------------------------

    def summary(self):
        """
        Comptes par feuille et par action (design §6) : l'ecran mene avec
        une ligne par feuille avant d'ouvrir le detail.
        """
        by_sheet = {}
        for change in self.changes:
            counts = by_sheet.setdefault(
                change.sheet, {action: 0 for action in ACTIONS}
            )
            counts[change.action] = counts.get(change.action, 0) + 1
        return by_sheet

    def to_dict(self):
        payload = {
            "project_ref": self.project_ref,
            "project_exists": self.project_exists,
            "summary": self.summary(),
            "changes": [c.to_dict() for c in self.changes],
            "errors": [e.to_dict() for e in self.errors],
            "warnings": [w.to_dict() for w in self.warnings],
            "file_sha256": self.file_sha256,
        }
        if self.committed:
            payload["committed"] = True
            payload["project_id"] = self.project_id
        return payload
