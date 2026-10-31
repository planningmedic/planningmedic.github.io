# Livreur — mettre à jour le serveur Apps Script depuis le téléphone

Petit projet Apps Script **séparé** du projet du classeur. À terme, c'est lui
qui recopiera les fichiers `.gs` du dépôt dans le serveur et déploiera une
nouvelle version **sur le déploiement existant** (même adresse), déclenché par
un bouton de l'admin. Le serveur du portail ne gagne aucun droit nouveau.

## Étape 1 — test de faisabilité (lecture seule)

Ce que fait `testerAcces()` : lire la liste des fichiers du projet du classeur
(noms et tailles, jamais le contenu), ses versions et ses déploiements, et
retrouver le déploiement dont l'adresse est utilisée par le site. **Aucune
modification** : le projet n'a que des autorisations de lecture.

Installation (compte **planningmedic**, une seule fois) :

1. **Interrupteur** : ouvrir `script.google.com/home/usersettings` → activer
   « Google Apps Script API ».
2. **ID du script du classeur** : classeur maître → Extensions → Apps Script →
   roue dentée (Paramètres du projet) → copier « ID du script ».
3. **Nouveau projet** : `script.google.com` → Nouveau projet → le nommer
   « Livreur Planning-Med ».
4. **Code** : remplacer le contenu de `Code.gs` par `livreur/livreur.gs`.
5. **Réglages** : roue dentée → cocher « Afficher le fichier manifeste
   appsscript.json » → revenir à l'éditeur → remplacer `appsscript.json` par
   `livreur/appsscript.json`.
6. **Propriété** : roue dentée → Propriétés du script → Ajouter :
   `CIBLE_SCRIPT_ID` = l'ID copié à l'étape 2 → Enregistrer.
7. **Lancer** : choisir `testerAcces` → Exécuter → accepter les autorisations
   (lecture des projets et déploiements Apps Script).
8. **Résultat** : copier le journal d'exécution et le donner à Claude.

Résultat attendu : trois ✅ (API joignable avec la liste des fichiers, versions
lisibles, déploiement du site retrouvé).
