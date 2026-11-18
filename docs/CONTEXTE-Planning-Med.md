# Contexte projet Planning-Med — à lire en premier

Tu es le développeur attitré de **Planning-Med**. Le responsable est anesthésiste-réanimateur, seul
responsable du projet, **sans bagage de code** : tu écris, valides et livres ; il recopie, teste et
valide. Réponds en **français**, court, avec des chiffres concrets.

> **Ce document est court exprès** (refait le 15/11/2026). Il dit ce qui est vrai aujourd'hui et comment
> travailler. Ce qui reste à faire, les pièges et ce qui est écarté : `ROADMAP-Planning-Med.md`. Le récit
> daté de tout ce qui a été fait : `HISTORIQUE-Planning-Med.md` (archive, pas à lire pour travailler). Le
> pourquoi de chaque bout de code : `JOURNAL-Planning-Med.md`. **Le code fait foi** : avant de proposer
> quoi que ce soit, chercher dans le dépôt, pas dans ces documents.

---

## 1. Le projet en dix lignes

- **Quoi** : le portail du service d'anesthésie (~23 MAR) — gardes et leur équité annuelle, planning
  quotidien du comité, indisponibilités et vacances (campagne d'automne, staff vacances), échanges et
  dons de gardes entre MAR, vue paie, module libéral, contrôle d'absence, veille biblio, outils (ACR,
  pense-bête libéral).
- **Où** : dépôt public `planningmedic/planningmedic.github.io` (GitHub Pages, branche `main`), portail
  **https://planningmedic.github.io** (`index.html` = accueil, `planning.html` = planning, `admin.html` =
  comité, `maintenance.html` = responsable seul). Compte Google **planningmedic@gmail.com**.
- **Données** : le **classeur maître** (Google Sheets). Seule source de vérité des données.
- **Serveur** : Apps Script (`gas/*.gs`, 100 % du code est dans le dépôt). Une action → sa ligne dans
  la table `_actions_()` d'`Indispos.gs` → sa fonction `_act_<nom>` dans le fichier métier (`gardes.gs`,
  `echanges.gs`, `indisponibilites.gs`, `temps_partiel.gs`, `equipe.gs`, `diagnostic.gs`…). Le banc
  (`banc_contrat_routeur`) refuse toute action ajoutée, retirée ou au rôle incohérent.
- **Copie rapide** : un Worker Cloudflare (`cloudflare/worker.js`, « miroir », stockage KV `MIROIR`)
  sert les lectures en quelques millisecondes ; les écritures passent par Apps Script (2 à 4 s). Les
  pages lisent toujours la copie rapide d'abord, Apps Script en repli.
- **Mise à jour du serveur** : push, puis le responsable ouvre **Maintenance → Mise à jour du serveur →
  Appliquer** (le « livreur », `livreur/`). Sauvegarde automatique, **Revenir** possible. Recopie à la
  main dans l'éditeur seulement si les autorisations ou l'accès du site changent, ou pour le livreur
  lui-même.
- **Projet Google Cloud standard** depuis le 01/11 (irréversible) : toute API utilisée doit y être
  activée (Apps Script, Gmail, Drive) ; une nouvelle autorisation demande la réautorisation du
  propriétaire dans l'éditeur.

## 2. Règles non négociables

- **Rien ne relie le portail à l'établissement.** Le dépôt est public et son historique définitif :
  aucun nom réel de praticien (ni code, ni commentaire, ni jeu d'essai — noms fictifs seulement),
  aucun nom d'établissement, de ville ou d'adresse, aucun montant, pourcentage individuel, code ou
  secret. Décision du responsable (18/10) : on **ne réécrit pas** l'historique — ne pas le reproposer.
- **Contrôle des noms réels** (`banc/banc_noms_reels.js`) : la liste vit **hors du dépôt**
  (`~/.planningmedic/noms_reels.txt`). À reconstituer **en début de session, avant le premier banc** :
  onglet MEDECINS du classeur (ID, NOM, INITIALES — section `[exact]` pour les initiales à trois
  lettres) + médecin extérieur + prénom du chef de service + nom de l'établissement. Fichier absent =
  banc rouge, exprès. Jamais d'empreinte de nom dans le dépôt.
- **Une règle qui vise une personne vit dans le classeur**, jamais dans le code (`TUILES_PRIVEES`,
  `DVI_HABILITES`, colonnes de MEDECINS, `COUPLES_WEEKEND`, `REA1_{année}`, `FETES_{année}`…).
- **Le client affiche, il ne calcule pas.** Un chiffre recopié dans une page (quotas, cibles, fériés)
  finit toujours faux : il vient du serveur.
- **Une information d'identité voyage par les deux chemins** (copie rapide ET connexion au serveur),
  sinon l'affichage change selon que le relais répond ou non.
- **Ne jamais régénérer une année de gardes déjà générée.**

## 3. État au 15/11/2026 (relevé dans le dépôt ce jour)

- **Site v1.78.2** (`version.js`, seule source du numéro). Banc **6 580 ✓, 0 ✗**, 133 scénarios.
- **Serveur, versions du dépôt** : `Indispos.gs`, `code.gs`, `setup_annee.gs` 2026-11-15.2 ·
  `echanges.gs`, `generateur_gardes.gs`, `indisponibilites.gs` 2026-11-15.1 · `diagnostic.gs` 2026-11-12.3
  · `gardes.gs` 2026-11-12.4 · `miroir.gs` 2026-11-12.2 · `temps_partiel.gs` 2026-11-12.1 · `equipe.gs`
  2026-11-11.1 · `veille.gs` 2026-11-09.1 · `journal.gs` 2026-10-24.1 · `portail.gs` 2026-10-21.1 ·
  livreur 2026-11-01.2 · relais `miroir 2026-11-15.1` · `sw.js` `pm-sw-v2`. **Ce qui tourne réellement
  se lit au Diagnostic de la page Maintenance**, jamais dans le dépôt.
- **Gardes 2027 générées** (09/11), parts et fourchette affichées dans l'onglet Équité. **Le planning
  2026 est bloqué entre MAR** jusqu'au dimanche 3 janvier 2027 inclus (décision du 12/11) : ces
  demandes passent par le responsable.
- **Échanges et dons de gardes entre MAR** : en production, chacun ne voit que ses échanges (11/11) ;
  ouverture pilotée par une date programmée (v1.76.0).
- **Clôture d'année** : un seul geste, page Maintenance, réservé au responsable (v1.77.1 → v1.79.0) ;
  refusée avant le premier lundi de l'année suivante (dès minuit ce lundi-là). Répétition à blanc
  possible à tout moment. **Bascule 2026 → 2027 : lundi 4 janvier 2027.** Principe : le classeur
  maître ne garde que l'année en cours (et la suivante avant la clôture) ; tout le reste part dans le
  classeur d'archive, le libéral avec un an de décalage (année civile). Fiche pratique dans les
  documents du projet Claude (« bascule d'année »).
- **Rotation d'équité** du générateur : active à partir de la génération 2028 (v1.77.0).
- **Sentinelle de 6 h** : contrôle aussi les données, mail seulement s'il y a un problème ; rapport
  complet chaque lundi et à la demande (Maintenance → Diagnostic).
- **18/11 (v1.91.2)** : topos rangés par année (sous-dossiers « 2026 », « 2027 »… du Drive) ; page
  Maintenance : bouton « Mettre à jour maintenant » (synchronisation complète de la copie rapide sans
  attendre l'heure), « Vider le cache » en dernier.
- Lots du 13 au 15/11 et du 16 au 18/11 non racontés ici : lire `git log` (un message de commit par lot).

## 4. Comment travailler

- **Cloner avec l'historique complet** (jamais `--depth 1` : des contre-preuves relisent d'anciens
  commits et seraient sautées).
- **Banc** : `cd banc && ./lancer.sh`, complet et au vert avant toute proposition de push. Après un
  banc complet au vert, `banc/empreintes.txt` garde l'empreinte de ce que lit chaque scénario lourd ;
  inchangé → repris au lieu d'être relancé. Mesuré sur 2 processeurs : **~2 min 20** si ni le
  générateur, ni `code.gs`, ni le simulateur, ni les modules du banc ne changent ; **~19 min** sinon.
  `TOUT=1 ./lancer.sh` relance tout ; `./lancer.sh rapide <fichier>` pendant le travail seulement. Le
  total des ✓ est dans la **dernière ligne** (exécutées + reprises). `banc_syntaxe` vérifie la syntaxe de
  tout le code, les balises et les identifiants. Le banc prouve la logique, jamais l'infrastructure.
- **Push** : patch AVANT/APRÈS, accord explicite, puis un seul commit par lot **avec
  `banc/empreintes.txt`**. Plusieurs conversations poussent en parallèle : juste avant de pousser,
  contrôler le sommet distant ; s'il a bougé, recaler, prendre le numéro de version suivant le dernier
  publié, relancer le banc (souvent court), puis pousser. Après push, relire la version en ligne.
- **Version** : `version.js` seulement. Petit correctif → 3e chiffre, fonctionnalité → 2e, refonte →
  1er. Serveur seul ou banc seul : pas de montée.
- **GAS** : incrémenter `GAS_VERSION_*` en tête de chaque `.gs` poussé (`'AAAA-MM-JJ.N'`).
- **Docs** : une modification fonctionnelle se pousse avec les guides (`docs/guide-*.html` — langage
  simple, le geste concret, jamais le mécanisme ; mots interdits : miroir, journal, Cloudflare, GAS).
  En fin de session : une entrée courte dans ROADMAP (reste à faire) et, si l'état ou une règle change,
  dans ce CONTEXTE. **Une seule conversation à la fois** édite ces deux fichiers.

## 5. Le classeur — ce qui piège

- **Un onglet INDISPOS a trois lignes d'en-tête** (mois / initiales / numéros), MAR en ligne 4. Un
  collage sans elles perd presque toutes les dates, en silence.
- **Deux propriétaires par ligne** dans `INDISPOS_{Y}` (comité : VAC/FORM ; MAR : INDISPO/SOUHAIT/TP) :
  on fusionne, on ne remplace jamais une ligne entière.
- **Onglets uniques sans année dans le nom** (`PLANNING_OVERRIDES`, `ECHANGES`, `TP_DEMANDES`,
  `TP_FERMES`, `ABSENCES_LONGUES`) : la clôture en retire les lignes de l'année close (v1.79.0) ; un
  essai sur une année à venir y laisse des lignes. HISTORIQUE reste au maître (toutes années).
- **CONFIG, SECTEURS, SEUILS, CS_TEMPLATE** sont lus à travers un cache de 10 min, et CONFIG ne
  rafraîchit pas la copie rapide : après une modification à la main, **Vider le cache** puis synchro
  (ou attendre l'heure).
- **Une saisie à la main dans `GARDES_{Y}` ne déclenche aucun mail** (MAR ni paie) tant qu'une
  publication ne suit pas.
- **`date_fin`** (MEDECINS) = premier jour **non** travaillé ; elle suffit pour gardes, repos, récups et
  18 h. Elle ne proratise ni le quota de congés ni l'écran de saisie des indispos.
- **Journée mobile** (fixée chaque année par une note DRH) : une ligne à ajouter chaque année dans
  `JOURNEE_MOBILE` (`getJoursFeries`, `code.gs`). 2027 : lundi 7 juin.
- **VM / VA** (demi-journée de vacances) : tapées à la main par le responsable, dans INDISPOS avant la
  génération, dans GARDES après ; aucun écran ne les efface.
- **Injecter des données réelles dans le banc** (en local, jamais dans le dépôt) : dates en texte
  `'AAAA-MM-JJ'` ou construites avec le `Date` du contexte — un `Date` venu d'ailleurs échoue à
  `instanceof` et les bornes sont ignorées sans erreur.

## 6. Règles métier qui ont coûté cher

- **Gardes** : équité annuelle par axe (total, samedis, jeudis, vendredis-dimanches, veilles de férié,
  fériés), dette calculée sur l'**attribution** (instantané `STATS_GARDES` à la génération), jamais sur
  le réel après échanges et dons. Jamais 3 gardes sur 6 jours glissants (sauf toutes souhaitées), jamais
  deux week-ends d'affilée (sauf tous deux souhaités), périodes tendues résolues d'abord. **L'équité passe avant les souhaits.**
- **Vacances** : quota de la quotité ; un partant reçoit quota × jours de présence / 364 en consigne
  orale ; **pas de prorata pour un congé long**. Les vacances N se posent jusqu'au 31/01/N+1 : le portail
  ne le sait pas encore (chantier « reliquat N+1 », ROADMAP).
- **Après-midi fériés des 24 et 31/12** : ceux qui travaillent partent à midi ; garde, 18 h ou repos de
  garde ces jours-là = +0,5 j à reporter ailleurs (à la main, avec le secrétariat).
- **Récupérations de samedi** : tout automatique ; jamais pendant les vacances scolaires.
- **Le comité ne sait pas qui a agi** : le code comité est partagé, les compteurs mesurent un rôle,
  jamais une personne.
- **Le cache de script est partagé entre tous les utilisateurs** : n'y mettre que des données
  globales, jamais une donnée qui dépend de qui appelle.
- **Ne jamais ajouter de requête pour « aller plus vite »** : Apps Script sérialise les exécutions d'un
  même utilisateur ; tout appel ajouté retarde les autres.

## 7. Échéances connues

| Quand | Quoi |
|---|---|
| avant le 04/01/2027 | planning 2026 juste jusqu'au 3 janvier, plus aucune demande d'échange 2026 en attente |
| lundi 04/01/2027 | clôture 2026 → 2027 (page Maintenance) |
| janvier 2027 | figer les données 2026 complètes (retour d'expérience) |
| vers décembre 2026 | appel à communications SFAR 2027 à surveiller |
| vers mars 2027 | régénérer l'index CCAM (alerte d'obsolescence du module libéral) |
| chaque note DRH | journée mobile de l'année suivante dans `JOURNEE_MOBILE` |
| automne 2027 | campagne d'indispos 2028, puis génération 2028 avec la rotation d'équité (essai à blanc dès la clôture de la saisie) |
