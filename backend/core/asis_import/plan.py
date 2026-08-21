"""
Data structures of the import plan (design §6).

Deliberately free of any Django import: this module describes what *will* be
done, not how to write it. It is therefore testable on its own, and the
report handed to the client is exactly what the parser decided.
"""
from dataclasses import dataclass, field
from typing import Any, Optional

# Possible actions on a row (design §6).
ACTION_CREATE = "create"
ACTION_UPDATE = "update"
ACTION_REPLACE = "replace"
ACTION_UNCHANGED = "unchanged"

ACTIONS = (ACTION_CREATE, ACTION_UPDATE, ACTION_REPLACE, ACTION_UNCHANGED)


@dataclass
class FieldDiff:
    """A difference on one field, carried by an `update` action."""

    field: str
    from_value: Any
    to_value: Any

    def to_dict(self):
        return {"field": self.field, "from": self.from_value, "to": self.to_value}


@dataclass
class PlannedChange:
    """
    One line of the report. `target` identifies the object in human terms
    (activity code, project reference…), never by primary key: the report is
    read before anything exists.
    """

    sheet: str
    action: str
    target: str
    detail: str = ""
    diffs: list[FieldDiff] = field(default_factory=list)
    # Payload to write, filled by the parser and consumed by the applier.
    # Never serialised to the client.
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
    An error (blocking) or a warning (informative). Both carry their sheet
    and row: a message without coordinates is unusable in a 13-sheet
    workbook.
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
    """Complete result of parsing one workbook."""

    project_ref: str = ""
    project_exists: bool = False
    changes: list[PlannedChange] = field(default_factory=list)
    errors: list[ImportIssue] = field(default_factory=list)
    warnings: list[ImportIssue] = field(default_factory=list)
    file_sha256: str = ""
    # Filled by the applier, after writing.
    committed: bool = False
    project_id: Optional[int] = None

    # -- building ---------------------------------------------------------

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
        """Filter used by the applier to replay the plan sheet by sheet."""
        return [
            c
            for c in self.changes
            if c.sheet == sheet and (action is None or c.action == action)
        ]

    # -- report -----------------------------------------------------------

    def summary(self):
        """
        Counts by sheet and by action (design §6): the screen leads with one
        line per sheet before opening the detail.
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
