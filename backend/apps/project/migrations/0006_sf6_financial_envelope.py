"""
Migration SF-6 — no-op.

Cette migration a ete creee manuellement en doublon de
0006_projectfinancialenvelope_financingsource_and_more.py qui couvre
le meme perimetre. Elle est conservee pour ne pas rompre la chaine
de migrations (0007_merge en depend), mais toutes ses operations ont
ete retirees pour eviter le DuplicateTable en test et en CI.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0006_projectfinancialenvelope_financingsource_and_more"),
    ]

    operations = []
