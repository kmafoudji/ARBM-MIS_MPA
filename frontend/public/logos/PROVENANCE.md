# Provenance des assets graphiques

Ce dossier contient des marques appartenant à des tiers. Elles sont utilisées
dans le cadre du système de gestion du portefeuille LLF2, pour identifier les
partenaires du fonds. Toute réutilisation hors de ce cadre doit être vérifiée.

## `donors/` — logos des bailleurs

| Fichier | Organisation | Source |
|---|---|---|
| `adfd.png` | Abu Dhabi Fund for Development | Fourni par le client (MillenniumPromise) |
| `gates.png` | Bill & Melinda Gates Foundation | Fourni par le client |
| `isdb.png` | Islamic Development Bank | Fourni par le client |
| `isfd.png` | Islamic Solidarity Fund for Development | Fourni par le client |
| `ksrelief.png` | King Salman Humanitarian Aid & Relief Centre | Fourni par le client |
| `qffd.png` | Qatar Fund for Development | Fourni par le client |

Ces images ont été extraites de captures d'écran transmises par le client. Elles
sont donc en **résolution limitée** (~250 à 380 px de large) et sur fond blanc
opaque. À remplacer par les fichiers vectoriels officiels (SVG ou PNG
transparent haute résolution) lorsqu'ils seront disponibles auprès de la LLF MU.

## `sdg/` — pictogrammes des Objectifs de développement durable

- **Source** : [open-sdg/sdg-translations](https://github.com/open-sdg/sdg-translations),
  branche `2.5.0-dev`, chemin `www/assets/img/goals/fr/`.
- **Langue** : française.
- **Format** : PNG 500 × 500.
- **Licence d'usage** : les Nations Unies autorisent la reprise des 17 icônes et
  de la roue des couleurs conformément à leurs lignes directrices
  (« Guidelines for the use of the SDG logo, including the colour wheel and 17
  icons »). Le logo ODD **portant l'emblème de l'ONU** est en revanche réservé
  aux entités du système des Nations Unies : il n'est pas utilisé ici.
- Voir : https://www.un.org/sustainabledevelopment/news/communications-material/

## `agencies/` — logos des agences d'implémentation

**Vide à ce jour.** Les logos des ministères (Sénégal, Mali, Burkina Faso,
Guinée), du Kano State Ministry of Agriculture, de KNARDA, de SOS Sahel
International et des agences onusiennes (UNICEF, UNFPA, OMS) n'ont pas pu être
récupérés automatiquement : aucune source ouverte fiable n'est accessible et il
n'existe pas de paquet libre les regroupant.

Deux façons de les ajouter :

1. Déposer les fichiers dans ce dossier, puis renseigner le chemin
   (`/logos/agencies/unicef.png`) via **Données de base → Agences → Éditer**.
2. Coller directement l'URL du logo officiel dans le même champ.

En l'absence de logo, l'interface affiche un monogramme — aucune image n'est
inventée.

## Convention technique

Le champ `logo_url` accepte indifféremment :

- un chemin relatif servi par l'application : `/logos/donors/isdb.png` ;
- une URL absolue : `https://.../isdb.png` (Azure Blob Storage en production).

Conformément au principe d'architecture du projet, **aucune image n'est stockée
en base64 dans la base de données**.
