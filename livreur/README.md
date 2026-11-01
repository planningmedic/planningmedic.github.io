# Livreur — mettre à jour le serveur Apps Script depuis le téléphone

Petit projet Apps Script **séparé** du projet du classeur. C'est lui qui
recopie les fichiers du dépôt dans le serveur et déploie une nouvelle version
**sur le déploiement existant** (même adresse). On l'actionne depuis la carte
« Mise à jour du serveur » de `maintenance.html`. Le serveur du portail ne
gagne aucun droit nouveau.

## Ce qu'il fait (doPost)

| Action | Effet |
|---|---|
| `etat` | compare le code en service au dépôt, au commit précis lu par la page |
| `appliquer` | sauvegarde (une version de l'état actuel) → envoi du code → nouvelle version → bascule du déploiement existant |
| `revenir` | rebascule le déploiement sur la version précédente |

- **Qui** : un code qui porte la clé `maintenance` (CONFIG / TUILES_PRIVEES).
  Le livreur le demande au serveur du portail (`getMedecins` → `maintenance`).
- **Quoi** : `livreur/carte.json` dit quel fichier du dépôt devient quel fichier
  du projet. Les fichiers du projet absents de la carte sont conservés.
- **Refusé** : un manifeste qui change les autorisations (`oauthScopes`) ou
  l'accès du site (`webapp`). Ces cas-là se font sur l'ordinateur.

## Installation (compte planningmedic)

Déjà fait le 01/11/2026 : interrupteur de l'API Apps Script, projet
« Livreur Planning-Med », propriété `CIBLE_SCRIPT_ID`, rattachement au projet
Google Cloud standard (API Apps Script, Drive et Gmail activées).

Pour l'étape 3 (et toute mise à jour du livreur lui-même) :

1. Remplacer `Code.gs` du livreur par `livreur/livreur.gs`, et `appsscript.json`
   par `livreur/appsscript.json`. Enregistrer.
2. Lancer `testerAcces` → accepter les autorisations (projets et déploiements
   Apps Script, en écriture cette fois).
3. **Première fois** : Déployer → Nouveau déploiement → type « Application
   Web », exécuter en tant que « Moi », accès « Tout le monde » → copier
   l'adresse et la mettre dans `maintenance.html` (`LIVREUR_URL`).
   **Ensuite** : Déployer → Gérer les déploiements → crayon → Nouvelle version
   (l'adresse ne change pas).
