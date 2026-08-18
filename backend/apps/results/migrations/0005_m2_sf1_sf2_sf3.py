"""
Migration M2 SF-1/SF-2/SF-3 — générée manuellement le 2026-07-25, puis vidée.

VIDÉE VOLONTAIREMENT. Ne pas y remettre d'opérations.

Cette migration et 0005_indicator_aggregation_rule_indicator_chain_level_and_more
ont été ajoutées le même jour et créent les mêmes colonnes : les douze opérations
qu'elle contenait figurent toutes, à l'identique (seuls des help_text diffèrent),
dans la migration auto-générée, qui en porte cinq de plus. Comme celle-ci est
déclarée dans les dépendances ci-dessous, elle s'appliquait toujours en second et
échouait toujours sur une base vide :

    django.db.utils.ProgrammingError: column "version" of relation "indicator"
    already exists

La migration de fusion 0006_merge_20260725_1228 réconcilie le graphe mais ne
déduplique pas les opérations. Résultat : `migrate` depuis zéro était impossible
depuis juillet 2026 — nouveaux postes, environnements de CI, restauration à partir
du schéma seul, et la suite de tests (pytest-django construit sa base à partir de
rien).

Le fichier est conservé, avec ses dépendances, pour que l'historique enregistré
dans django_migrations reste valide : sur toute base déjà migrée, Django ne
ré-exécute pas une migration déjà appliquée, ce changement n'y a donc aucun effet.
Sur une base vide, elle s'applique désormais comme un no-op.

Ce que cette migration décrivait (désormais porté par sa jumelle auto-générée) :

SF-1 Indicator :
  - aggregation_rule    (CharField, default='sum')
  - chain_level         (CharField, blank=True)
  - cross_cutting_tags  (JSONField, default=list)
  - version             (PositiveIntegerField, default=1)
  - indicator_type      : choices étendus (numeric/percentage/yes_no/count)
  - reporting_frequency : ajout 'monthly'

SF-2 TheoryOfChange :
  - local_actors (TextField, blank=True)

SF-2 ToCNode :
  - chain_level : ajout 'ultimate_outcome'
  - cross_pathways (ManyToManyField vers self)

SF-3 LogframeTarget :
  - status         (CharField, default='draft')
  - is_original_pad (BooleanField, default=False)
  - approved_by    (FK AppUser, null=True)
  - approved_at    (DateTimeField, null=True)

SF-3 TargetRevision (nouveau modèle)
"""
from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0004_alter_theoryofchange_status"),
        ("results", "0005_indicator_aggregation_rule_indicator_chain_level_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = []
