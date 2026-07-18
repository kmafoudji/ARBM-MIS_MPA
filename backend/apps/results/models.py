"""
Domaine results — Theorie du Changement (SF-1 Etape 2, BRQ-1.35).

Aligne sur le modele canonique v6.0 (domaine results : theory_of_change,
toc_node), avec une simplification assumee pour cette premiere passe :
une seule ToC par projet (OneToOneField), pas de workflow de
versionnement multi-lignes. Les champs version/status restent presents
pour une evolution future, mais rien ne cree encore une nouvelle ligne
a chaque revision — modifier la ToC modifie la ligne existante.

App dediee plutot que logee dans apps.project : le futur Module 2 (Cadre
de resultats & indicateurs) etendra ce meme domaine (logframe_row =
projection de ToCNode vers le Logframe, assignation d'indicateurs par
niveau de la chaine). Deplacer un modele vers une autre app apres qu'il
porte des donnees reelles est une operation delicate — autant demarrer
au bon endroit.
"""
from django.db import models

from apps.identity.models import AppUser
from apps.project.models import Project

TOC_STATUS_CHOICES = [
    ("draft", "Brouillon"),
    ("active", "Active"),
]

# 4 niveaux nodaux de la chaine de resultats. L'Effet ultime (impact) est
# capture directement sur TheoryOfChange.ultimate_outcome, PAS comme noeud :
# c'est le sommet unique de la chaine, coherent avec le schema de
# codification a 4 paliers du SFD (A / A.1 / A.1.1 / A.1.1.1).
CHAIN_LEVEL_CHOICES = [
    ("activity", "Activite"),
    ("output", "Produit"),
    ("immediate_outcome", "Effet immediat"),
    ("intermediate_outcome", "Effet intermediaire"),
]

# Niveau de parent attendu pour chaque niveau (validation du rattachement
# et du pathway causal). None = racine, pas de parent autorise.
PARENT_LEVEL = {
    "activity": None,
    "output": "activity",
    "immediate_outcome": "output",
    "intermediate_outcome": "immediate_outcome",
}


class TheoryOfChange(models.Model):
    """
    Une ToC par projet (SF-1 Etape 2). Le SFD la rend obligatoire au stade
    Pipeline Taskforce Approved ou ulterieur — non bloquant avant, donc pas
    de controle de completude cote service pour l'instant : a brancher sur
    SF-4 (transition_stage) quand ce gate sera arbitre au niveau metier,
    sur le meme modele que POL-1.10 pour la classification SF-2.
    """

    project = models.OneToOneField(
        Project, on_delete=models.CASCADE, related_name="theory_of_change"
    )
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=10, choices=TOC_STATUS_CHOICES, default="draft")
    problem_statement = models.TextField(
        blank=True, help_text="Enonce du probleme que le projet adresse."
    )
    ultimate_outcome = models.TextField(
        blank=True,
        help_text="Effet ultime / impact — sommet de la chaine, non decompose en noeuds.",
    )
    created_by = models.ForeignKey(
        AppUser, on_delete=models.SET_NULL, null=True, related_name="theories_of_change_created"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "theory_of_change"

    def __str__(self):
        return f"ToC - {self.project.code or self.project.name}"


class ToCNode(models.Model):
    """
    Noeud de la chaine causale. Le rattachement au parent EST le pathway
    causal (BRQ-1.35 : "Activites -> Produits -> Effets immediats ->
    intermediaires -> ultime, avec pathways causaux et hypotheses") ;
    `assumptions` porte les hypotheses.

    Code hierarchique (A, A.1, A.1.1, A.1.1.1) auto-genere a la creation
    via services.create_toc_node(), jamais recalcule ensuite : le faire
    bougerait les references deja citees ailleurs (reporting narratif,
    Module 9 risques...). Consequence assumee : reclasser un noeud vers un
    autre niveau/parent n'est pas supporte dans cette passe — supprimer et
    recreer.
    """

    toc = models.ForeignKey(TheoryOfChange, on_delete=models.CASCADE, related_name="nodes")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    code = models.CharField(max_length=20, blank=True, editable=False)
    chain_level = models.CharField(max_length=25, choices=CHAIN_LEVEL_CHOICES)
    statement = models.TextField(help_text="Enonce du noeud (ce qui est fait / obtenu).")
    key_result_indicator = models.CharField(
        max_length=255, blank=True,
        help_text="Texte libre pour l'instant — liaison a la bibliotheque "
        "d'indicateurs prevue au Module 2 (logframe_row).",
    )
    means_of_verification = models.TextField(blank=True)
    assumptions = models.TextField(blank=True, help_text="Hypotheses (BRQ-1.35).")
    risks_mitigation = models.TextField(blank=True)
    adaptation_strategy = models.TextField(blank=True)
    gender_climate_tag = models.CharField(max_length=100, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "toc_node"
        ordering = ["chain_level", "order", "id"]

    def __str__(self):
        return f"{self.code} - {self.statement[:40]}"
