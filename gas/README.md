# Code Google Apps Script — Planning-Med (carte du code)

⚠️ **Le dépôt fait foi à 100 %** : ce dossier contient le code GAS complet de prod.
Workflow : Claude pousse ici → Arthur recopie dans l'éditeur Apps Script → **nouvelle version de déploiement**.
Ne jamais modifier un `.gs` directement dans Apps Script sans le committer aussitôt : la modif serait écrasée à la prochaine recopie.

## Versionnage (détecteur de dérive, 15/07/2026)
Chaque fichier commence par une constante `GAS_VERSION_*` (format `AAAA-MM-JJ.n`), **à incrémenter à CHAQUE push** du fichier.
Le 🔍 Diagnostic (admin → onglet Maintenance) compare les versions déployées avec celles du dépôt et signale toute recopie oubliée (« DÉRIVE »).

## Sauvegardes automatiques (revu le 09/08/2026)
Trois filets actifs, vérifiés : `backupHebdo` (classeur, lundi ~4 h, compte planning),
`sauvegardeHebdo` de `sauvegarde.gs` (dépôt en zip, dimanche ~3 h, compte planning),
et la sauvegarde hors-compte du classeur (dimanche ~5 h, compte personnel —
voir `docs/sauvegarde-compte-perso.md`).

### Détail historique
`backupHebdo()` (code.gs) copie le classeur maître chaque lundi ~4 h dans le dossier Drive `Planning-Med-Backups` (rotation : 8 copies ≈ 2 mois).
Installation une seule fois : exécuter `installBackupTrigger()` dans l'éditeur. Le diagnostic vérifie la présence du déclencheur et la fraîcheur de la dernière copie.

## Les 11 fichiers de l'éditeur (relevé le 09/08/2026)

Le projet Apps Script est **rattaché au classeur maître** (Extensions → Apps Script).
Ses fichiers viennent de **trois endroits** du dépôt : attention aux noms exacts,
majuscule comprise.

| Dans l'éditeur | Dans le dépôt | Rôle |
|---|---|---|
| `appsscript.json` | `gas/appsscript.json` | Réglages : fuseau, service Gmail, web app, autorisations |
| `Code.gs` | `gas/code.gs` *(minuscule)* | `generatePlanningFromGardes`, overrides, jours fériés, `pushFileToGitHub`, `onEdit`, sauvegarde hebdo du classeur (`backupHebdo`), notifications de changement |
| `Indispos.gs` | `gas/Indispos.gs` | Routeur d'API (`doGet`/`doPost`), indispos, vacances/quotas, actions admin, diagnostic hebdo |
| `generateur_gardes.gs` | `gas/generateur_gardes.gs` | Algorithme `generateGardes` : sélection MAR, rôles G/G2, équité, dette inter-annuelle |
| `setup_annee.gs` | `gas/setup_annee.gs` | `setupAnnee` (init N+1), `archiveYear` |
| `portail.gs` | `gas/portail.gs` | Portail/Dashboard, topos, staffs, protocoles, annuaire, module libéral |
| `miroir.gs` | `gas/miroir.gs` | Dépôt des données de lecture vers le miroir rapide, rattrapage et sync horaire |
| `dispo_jour.gs` | `partage/dispo_jour.js` *(extension différente)* | `calculerDispoJour` — logique partagée avec le frontend |
| `journal.gs` | `gas/journal.gs` | Relève et application des gestes du comité déposés en attente (toutes les minutes) |
| `sauvegarde.gs` | `sauvegarde.gs` *(racine du dépôt)* | Copie hebdomadaire du dépôt GitHub (zip) dans Drive, dimanche ~3 h |
| `veille.gs` | `gas/veille.gs` | Veille bibliographique : requêtes PubMed, filtres, `runVeille` (lundi ~6 h) |

⚠️ Un envoi automatisé du dossier `gas/` seul **effacerait** `dispo_jour` et
`sauvegarde`, et créerait un doublon `code.gs` à côté de `Code.gs`.

## Faits clés (utiles pour les patches)
- `savePlanningOverride` écrit dans **PLANNING_OVERRIDES** (retouches comité, indexées par date).
- `setActiveYear` archive/vide **OVERRIDES** (onglet hérité, utilisé seulement par l'ancien `applyModification`) — **ne touche pas** PLANNING_OVERRIDES.
- `archiveYear` a sa propre `getGithubToken()` interne (pas de plantage), suppression d'onglets **commentée** (non destructif).
- `generateGardes(2026)` est **désactivé** côté API (2026 sanctuarisé).

## Synchroniser le code dans ce dossier
- **Recommandé (exact, 2 sens)** : `clasp` — `clasp clone <scriptId>` puis `clasp pull`/`push`.
- **Manuel** : coller le contenu exact de chaque fichier depuis l'éditeur.

Dernière revue de structure : 13/06/2026 (sources complètes fournies par Arthur, conservées dans l'historique de la session).
