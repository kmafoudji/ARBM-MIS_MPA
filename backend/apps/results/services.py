"""
Generation du code hierarchique et validation du rattachement parent/niveau
d'un noeud de ToC (SF-1 Etape 2, BRQ-1.35).
"""
from django.core.exceptions import ValidationError
from django.db import transaction

from .models import PARENT_LEVEL, ToCNode


def _next_letter(existing_count):
    """A, B, C... Z, AA, AB... — improbable de depasser 26 activites sur un projet, mais robuste."""
    n = existing_count
    letters = ""
    while True:
        n, rem = divmod(n, 26)
        letters = chr(65 + rem) + letters
        if n == 0:
            return letters
        n -= 1


@transaction.atomic
def create_toc_node(toc, chain_level, parent_id, **fields):
    """
    Cree un noeud, valide que son parent est bien au niveau immediatement
    superieur de la chaine (le rattachement EST le pathway causal), et lui
    genere un code hierarchique (A / A.1 / A.1.1 / A.1.1.1).
    """
    expected_parent_level = PARENT_LEVEL[chain_level]

    parent = None
    if parent_id is not None:
        try:
            parent = ToCNode.objects.get(pk=parent_id, toc=toc)
        except ToCNode.DoesNotExist:
            raise ValidationError("Noeud parent introuvable dans cette ToC.")

    if expected_parent_level is None and parent is not None:
        raise ValidationError("Une Activite ne peut pas avoir de parent.")
    if expected_parent_level is not None:
        if parent is None:
            raise ValidationError(
                f"Un noeud de niveau '{chain_level}' doit etre rattache a un "
                f"noeud de niveau '{expected_parent_level}'."
            )
        if parent.chain_level != expected_parent_level:
            raise ValidationError(
                f"Le parent doit etre de niveau '{expected_parent_level}' "
                f"(recu : '{parent.chain_level}')."
            )

    if parent is None:
        siblings_count = ToCNode.objects.filter(
            toc=toc, parent=None, chain_level=chain_level
        ).count()
        code = _next_letter(siblings_count)
    else:
        siblings_count = parent.children.count()
        code = f"{parent.code}.{siblings_count + 1}"

    return ToCNode.objects.create(
        toc=toc, parent=parent, chain_level=chain_level, code=code, **fields
    )
