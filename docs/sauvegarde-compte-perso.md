# Sauvegarde hors-compte du classeur Planning-Med

> ⚠️ **Ce script ne fait PAS partie du projet Apps Script du planning.**
> Il s'installe dans le **compte Google personnel d'Arthur**. C'est tout l'intérêt :
> sur Drive, **un fichier appartient à celui qui le crée**. Une copie faite par le
> compte `planningmedic` lui appartiendrait encore, et disparaîtrait avec lui.
> Ne jamais le coller dans `gas/` ni dans l'éditeur Apps Script du classeur.

## Pourquoi

`backupHebdo()` (`code.gs`) copie déjà le classeur chaque lundi vers 4 h dans le dossier
Drive `Planning-Med-Backups`, avec rotation sur 8 copies. Mais cette copie est **dans le
même Drive, sous le même compte** que l'original : elle protège d'une fausse manœuvre ou
d'un onglet effacé, **pas** d'un compte compromis, suspendu ou fermé — dans ce cas
l'original et les 8 copies partent ensemble.

Principe retenu : **la sauvegarde va chercher, elle n'est pas envoyée.** Un compte tiers
tire la copie ; compromettre la source ne compromet pas les sauvegardes.

Une copie Drive emporte le **script attaché** au classeur, contrairement à un export XLSX —
c'est pourquoi l'envoi d'un XLSX par mail a été écarté.

## Installation

1. Se connecter au **compte Google personnel** (surtout pas `planningmedic`).
2. Aller sur <https://script.google.com> → **Nouveau projet**, le nommer
   « Sauvegarde Planning-Med ».
3. Coller le code ci-dessous, en remplaçant `ID_CLASSEUR` par l'identifiant du classeur
   maître — c'est la portion de son URL entre `/d/` et `/edit` :
   `https://docs.google.com/spreadsheets/d/`**`CETTE_PARTIE`**`/edit`
4. Depuis le compte `planningmedic`, **partager le classeur** avec le compte personnel.
   Voir « Niveau d'accès » ci-dessous.
5. Exécuter **une fois** `sauvegardeHebdo` à la main : Google demande l'autorisation
   d'accéder à Drive, l'accepter.
6. Exécuter **une fois** `installerDeclencheur` : la sauvegarde tournera ensuite toute
   seule chaque dimanche vers 5 h.

## Niveau d'accès — VÉRIFIÉ le 26/07/2026

**Partager en « Lecteur » suffit.** Testé en conditions réelles : une copie faite par le
compte personnel à partir du classeur partagé en lecture seule **emporte bien le script
attaché**. Vérifié deux fois, en Éditeur puis en Lecteur.

C'est le meilleur réglage : le compte personnel **ne peut jamais modifier la production**,
et la sauvegarde reste un classeur complet, réutilisable tel quel. Ne pas passer en Éditeur
« au cas où » — ce serait donner à un second compte le droit d'abîmer les données réelles
sans rien gagner.

Poids constaté du classeur : **~78 Ko**. Huit copies ≈ 600 Ko, négligeable sur les 15 Go
d'un compte gratuit.

## ⚠️ Piège à connaître AVANT d'en avoir besoin

Si plusieurs comptes Google sont connectés dans le navigateur, l'ouverture d'un classeur
ou d'Apps Script affiche :

> **Impossible d'ouvrir le fichier pour le moment. Vérifiez l'adresse, puis réessayez.**

**Ce n'est ni un problème de droits, ni une sauvegarde corrompue.** Google sert la page au
compte « par défaut » du navigateur, qui n'est pas le bon.

**Solution : ouvrir une fenêtre de navigation privée et s'y connecter UNIQUEMENT avec le
compte personnel.** Le fichier et son script apparaissent alors normalement.

C'est écrit ici parce que le jour où cette sauvegarde servira vraiment, ce sera un jour de
panne, sous pression — et ce message ferait croire que l'archive est perdue alors qu'elle
va parfaitement bien.

## Le code

```javascript
/**
 * Sauvegarde hebdomadaire HORS-COMPTE du classeur Planning-Med.
 * À installer dans le compte Google PERSONNEL, jamais dans le projet du planning.
 * La copie est créée par CE compte, donc elle lui appartient : rien de ce qui
 * arrive au compte planningmedic ne peut l'atteindre.
 */

const ID_CLASSEUR = 'COLLER_ICI_L_IDENTIFIANT_DU_CLASSEUR';
const NOM_DOSSIER = 'Sauvegardes Planning-Med';
const PREFIXE     = 'Planning-Med ';
const NB_COPIES   = 8;              // ≈ 2 mois de recul, comme BACKUP_KEEP côté planning

function sauvegardeHebdo() {
  const dossier = dossierSauvegardes_();
  const jour = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  DriveApp.getFileById(ID_CLASSEUR).makeCopy(PREFIXE + jour, dossier);
  purger_(dossier);
}

function dossierSauvegardes_() {
  const it = DriveApp.getFoldersByName(NOM_DOSSIER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(NOM_DOSSIER);
}

/**
 * Ne garde que les NB_COPIES plus récentes. Le filtre sur PREFIXE évite de
 * supprimer un fichier étranger qui se trouverait dans le dossier.
 */
function purger_(dossier) {
  const copies = [];
  const it = dossier.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(PREFIXE) === 0) {
      copies.push({ f: f, t: f.getDateCreated().getTime() });
    }
  }
  copies.sort(function (a, b) { return b.t - a.t; });   // la plus récente d'abord
  copies.slice(NB_COPIES).forEach(function (c) { c.f.setTrashed(true); });
}

/** À exécuter UNE FOIS. Relancer cette fonction ne crée pas de doublon. */
function installerDeclencheur() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sauvegardeHebdo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sauvegardeHebdo')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(5).create();
}
```

## Points de vigilance

- **Rotation indispensable côté compte personnel aussi.** Depuis 2021 les fichiers Google
  Sheets **comptent dans le quota de stockage** (15 Go partagés avec Gmail et Photos).
  Sans purge, l'accumulation est illimitée — d'où `NB_COPIES`.
- **Ne pas se limiter à une seule copie.** Une sauvegarde unique ne protège que de la perte
  brutale, pas de la **corruption silencieuse** : un onglet abîmé un mardi sans que personne
  ne le remarque, et la copie suivante écrase la seule version saine. La profondeur
  d'historique est ce qui rattrape ce cas.
- **Dimanche 5 h**, alors que `backupHebdo` tourne le lundi vers 4 h : les deux sauvegardes
  sont volontairement décalées et indépendantes.
- **En cas d'échec**, Google envoie automatiquement un mail au propriétaire du script.
- **Vérifier une fois par trimestre** qu'une copie récente existe bien dans le dossier.
  Une sauvegarde jamais vérifiée n'est pas une sauvegarde.

## En cas de restauration réelle

Scénario : le compte `planningmedic` est perdu, suspendu ou compromis.

1. **Ouvrir la copie la plus récente** du dossier « Sauvegardes Planning-Med », en
   navigation privée avec le seul compte personnel (voir le piège ci-dessus).
2. **Vérifier le script** : Extensions → Apps Script. Il doit être présent. S'il manque,
   récupérer les 5 fichiers depuis le dépôt GitHub (`gas/`), qui en contient toujours
   100 % du code.
3. **Redéployer en application web** depuis ce nouveau classeur.
4. ⚠️ **Le nouveau déploiement aura une ADRESSE DIFFÉRENTE.** L'ancienne est écrite en dur
   dans les pages du site (`index.html`, `planning.html`, `admin.html`, `indispos.html`,
   `staff.html`, `absences.html`…). Il faut donc **remplacer cette adresse partout dans le
   dépôt** avant que le site refonctionne. C'est l'étape qu'on oublie et qui coûte une
   heure de panique — la connaître à l'avance suffit à l'éviter.
5. Recréer le dossier Drive `Planning-Med-JSON` et republier le planning depuis l'admin.

**À vérifier une fois par trimestre** : qu'une copie récente existe, et qu'elle s'ouvre.
Une sauvegarde jamais ouverte n'est pas une sauvegarde.
