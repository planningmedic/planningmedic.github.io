# Roadmap — Planning-Med

Ce qui **reste à faire**, les **pièges** à connaître avant d'intervenir, et ce qui est **écarté**.
Refaite le 15/11/2026 : l'ancien journal daté (31/08 → 15/11) et les sections périmées sont dans
`HISTORIQUE-Planning-Med.md`, mot pour mot. L'état actuel et la méthode : `CONTEXTE-Planning-Med.md`.

> **Avant de reprendre un point : le chercher dans le code.** Chaque point porte la date de son
> constat ; certains ont pu être réglés par un lot qui ne l'a pas noté ici. Reproposer ce qui existe
> déjà est l'erreur la plus fréquente du projet (voir Pièges).

**Tenue de ce document.** En fin de session : cocher ou retirer ce qui est fait, ajouter ce qui
s'ouvre, une ligne datée dans le *Journal récent* (en fin de document). Ce qui est fait ne reste pas
dans « À faire ». Quand le journal récent dépasse une page, ses entrées partent dans HISTORIQUE.

---

## 🔜 À faire

### Échéances

- **Clôture 2026 → 2027, lundi 04/01/2027** (page Maintenance, réservée au responsable). Avant : planning
  2026 juste jusqu'au dimanche 3 janvier inclus, plus aucune demande d'échange 2026 en attente,
  Diagnostic vert, sauvegarde du lundi faite. Fiche pratique dans les documents du projet Claude.
  Défauts de la jonction relevés le 11-12/11 (paie des 1er–3 janvier, garde du dimanche 3 janvier,
  planning du jour ouvert sur la mauvaise année si la clôture tarde, échange décembre ↔ janvier,
  absence longue à cheval, R d'un samedi de l'onglet 2026) : **état à revérifier dans le code**,
  plusieurs lots ont touché la clôture du 12 au 15/11.
- **Seconde ligne de 18 h à l'ouverture du nouvel hôpital — possibilité, pas arrêtée** (envisagée le
  10/09 : deux MAR de 18 h par jour à partir d'une date de bascule). Pas dans le code (vérifié le 15/11),
  et 2027 a été générée avec une seule ligne. À trancher en temps voulu par le responsable ; si oui, il
  faudra l'ajouter à une année déjà générée sans la régénérer. Lot envisagé décrit dans HISTORIQUE (10/09).
- **Nouvel établissement : réorganisation des secteurs** (cadrage du 30/07, guide
  `docs/guide-demenagement.html`). Rien à coder tant que l'organisation cible n'est pas connue. Ce qui
  casserait : `COVERAGE` et `targets` en dur dans `admin.html` (le « + » de case à pourvoir s'éteindrait
  en silence — correctif décidé : colonne `COUVERTURE` O/N dans SECTEURS, garder l'exception `RI`) ;
  export Excel plat (forme retenue : un bandeau par grand secteur, colonne `PARENT`) ; `ACTIF = N` efface
  un secteur de l'historique affiché. Question de fond : affectation au grand secteur ou au sous-secteur ?
- **Journée mobile** de chaque année dans `JOURNEE_MOBILE` (`code.gs`), à réception de la note DRH.
- **Index CCAM** du module libéral à régénérer vers mars 2027.
- **Génération 2028** (automne 2027) : rotation d'équité active (fiche « rotation d'équité 2028 » des
  documents du projet Claude) ; essai à blanc sur les vraies indispos 2028 dès la clôture de leur saisie.
- **Reliquat de vacances N+1** (décision du 21/10, à construire avant janvier 2028) : les vacances N se
  posent jusqu'au 31/01/N+1 ; les premiers jours de janvier vont au reste du quota N ; compteurs
  « reliquat N » et « quota N+1 » séparés ; MAR prévenu avant la perte. À trancher : imputation
  automatique ou choix du MAR.
- **Retour d'expérience / poster SFAR 2027** : appel à communications à surveiller vers décembre 2026
  (3 500 caractères, inscription payée ; un résumé accepté et non présenté = 3 ans d'interdiction : ne
  soumettre que si la venue est sûre). Mesurer sur l'**attribution initiale**, jamais sur le réel. La
  bibliographie du 10/08 est partielle : à refaire avant toute rédaction. Figer les données 2026
  complètes en janvier 2027. Cosignature du comité recommandée.

### Suite du diagnostic systémique du 11/11 (détail dans les documents du projet Claude)

- **Lot 4** : un statut posé par le comité sur un 18 h ou une récupération les fait disparaître (C1) ;
  demi-journée VM/VA effaçable depuis Statuts (C2) ; course rare comité / MAR sur la même case (C3) ;
  receveur d'un don non éligible — inactif, hors contrat, sans garde (B5).
- **Lot 5** : sources uniques — codes de case (dont VAC/V et FORM/F entre indisponibilités et gardes),
  équipe à une date, année d'une date — et test « au hasard » des échanges.

### Serveur, données, outils

- **Diagnostic** (12/11) : le bloc « Intégrité GARDES 2027 » coûte ~4× celui de 2026 (relectures
  supposées, non vérifiées) ; la page Maintenance n'a ni délai ni reprise (quittée pendant l'analyse :
  « Load failed ») ; une lecture refusée hors zone protégée fait perdre tout le rapport.
- **Budget des tâches de fond** (24/10) : compteur proposé (durée de chaque tâche, alerte à 70 min/j,
  blocages de 8 min comptés) ; `miroirDocuments` toutes les heures, à espacer si rien n'en dépend.
- **Archivage annuel incomplet** (24/10, revérifié le 15/11) : `archiveMoveTabs_` ne range que GARDES_,
  INDISPOS_, STATS_GARDES_, AFFECTATIONS_ et LIENS_R_. `REA1_{Y}` et `FETES_{Y}` sont archivables à la
  clôture de Y ; `LIBERAL_{Y}` et `LIBERAL_CA_{Y}` (année civile) à la clôture de Y+1. Sinon +4 onglets
  par an.
- **Saisie à la main dans `GARDES_{Y}`** (18/10) : aucun mail (MAR ni paie) tant qu'une publication ne
  suit pas — branchement de `onEdit` proposé, non fait.
- **Synchro complète** (07/10) : un onglet supprimé laisse sa copie dans le relais — correctif proposé,
  non fait.
- **Relais** (10/09) : 9 clés de l'année N+2 écrites puis effacées à chaque synchronisation (~430
  opérations par jour sur 1 000) — non revérifié.
- **Jetons en clair dans CONFIG** (06/09) : ils sortent dès qu'on copie ou exporte le classeur ; leur
  place serait les propriétés du script — non revérifié.
- **Écran de saisie des indispos** (10/09, revérifié le 15/11) : il ignore `date_fin` — calendrier ouvert
  toute l'année à un partant, serveur qui accepte. Maquette validée (classe `hors-portee`).
- **MAR hors `GROUPES_VAC`** (03/09) : ses congés ne comptent pas dans le seuil de présence côté serveur.
  Remède envisagé (les hors-groupe prennent les premières places du seuil) **reporté** : il change des
  arbitrages.
- **W2 ne voit pas les temps partiels** (10/09) : son contrôle ne compte que les INDISPO ; sans danger aux
  volumes réels, incohérent avec le générateur.
- **Souhait posé sur un jour interdit par le profil** (10/09) : compté non honoré, taux pessimiste.
- **Générateur** : découper `generateGardes` en blocs nommés (décision du 26/10, après la génération
  2027 ; critère : banc vert et planning identique case pour case) · chargeur d'instantané réel pour le
  harnais (dates construites avec le `Date` du contexte) · journal de l'essai Apps Script qui répète les
  avertissements des 8 calculs.
- **Fêtes** (23/10) : en 2027 le 26/12 n'est pas compté « fête » (à reporter à la main) ; la rotation
  d'équité l'inclut à partir de 2028.
- **18 h** (10/09) : `ONLY_18` réel à 1,17 au lieu de 1,30 (40 vendredis vont d'office au G du samedi) ;
  à remesurer si une seconde ligne de 18 h est mise en place, avant toute colonne `PCT_18`.
- **Code mort** (10/08) : `gardeExceptionnelle` (action complète, aucun bouton), ancien système
  `OVERRIDES` mêlé à `PLANNING_OVERRIDES` (panneau « Modifications en attente » toujours vide),
  `pushFileToGitHub` sans appelant identifié. Risque réel (écritures du planning) : banc solide d'abord.
- **Banc** (15/11) : `banc_we_equite` reste à ~6 min ; `banc_rea1` refait des calculs à blanc en double ;
  accélérer le générateur lui-même profiterait aussi à la production, mais touche du code de production.

### Pages

- **Paie** (18/10) : adresses des deux secrétaires dans `PAIE_EMAILS`, page et code remis, code partagé
  durci — à confirmer par le responsable.
- **Veille** (14/10) : pastille « N nouveaux » (compte calculé par le serveur) ; remettre *J Cardiothorac
  Vasc Anesth* limité aux ECR et méta-analyses (non tranché).
- **Mise à jour sans quitter l'appli** (14/10) : pas encore éprouvée sur un vrai iPhone.
- **Module libéral** : règle de dépassement Bulle et NAS (01/10) ; retirer la consultation « C » de la
  page de fabrication ; test `docs/module-liberal/tests/anti_persistance_devis.test.js` cassé (il appelle
  `addParcours`, disparu — revérifié le 15/11), hors banc : le réparer ou le retirer ; brique 30 % :
  **2C** puis **Lot 4** (pas avant mi-2027) ; **Lot 5 gelé** depuis le 24/07 ; devis « secteur 2 » en
  dur ; point ouvert sur l'information des complémentaires (modèle CNOM).

### Décisions attendues du responsable

- Échanges : 3 gardes en 6 jours par un échange — laisser, prévenir ou bloquer (B4) ; bouton « Tout
  accepter » (B6) ; échange sur un jour de récupération ou de 18 h, même règle que le don (B8) ; un don
  sur un jour **A** doit-il demander confirmation et effacer le A ? ; statut posé sur un 18 h : alerte ou
  réattribution (C1).
- Seconde ligne de 18 h : à décider en temps voulu (voir Échéances).
- Piste 2028 (27/10) : fermer les failles qui laissent choisir ses week-ends sans en faire moins
  (vacances sur un seul samedi-dimanche, TP collé au week-end, fériés hors plafond).
- Jours de congé accordés en sureffectif (10/08) : les compter et les répartir, ou cas par cas ? Au comité
  de trancher ; vérifier d'abord que rien n'existe déjà.
- Les 18 h dans l'arbitrage global de la charge, ou compteur à part (10/09).

---

## ⚠️ Pièges — à lire avant toute intervention

### Issus d'erreurs commises (ne pas les refaire)

- **(03/08) Ne jamais écrire une donnée dérivée sans regarder la case d'arrivée.** Un don de
  garde écrivait le repos du lendemain sans vérifier ce qu'il écrasait. Le 26/03/2027 s'est
  retrouvé sans garde de réa pendant deux jours, sans le moindre signal. Toute écriture qui
  découle d'une autre (RG après G, récup après samedi) doit refuser si la case est occupée.
- **(03/08) Un geste non journalisé rend le diagnostic impossible.** `applyModification`
  n'écrivait rien dans `LOGS`. J'en ai déduit à tort qu'aucun don n'avait eu lieu, et cherché
  le bug dans le générateur pendant des heures. **L'absence de trace ne prouve rien.**
- **(03/08) Un contrôle sans destinataire ne sert à rien.** Le trou du 26/03 était détecté par
  le Diagnostic depuis le 01/08, avec la mention « À TRAITER IMMÉDIATEMENT ». Personne ne le
  lançait. Avant d'ajouter un contrôle, se demander qui le lira.
- **(03/08) Lire la fonction avant de proposer de l'étendre.** Trois propositions d'ajout au
  Diagnostic portaient sur des contrôles **qui existaient déjà** (rotation de `CONNEXIONS`,
  purge de `PLANNING_OVERRIDES`, couverture des gardes). Inventorier d'abord, proposer ensuite.
- **(03/08) Un cache de 10 minutes n'a rien à faire dans une tâche hebdomadaire.**
  `diagHebdo` lisait `CONFIG` via `_configRows_()` et a conclu « DIAG_EMAIL absent » sur une
  valeur périmée. Une tâche rare lit la source, pas le cache.

- **(01/08) Ne jamais ajouter de requête pour accélérer.** Apps Script sérialise les
  exécutions d'un même utilisateur. Un « appel de réveil » et un délai d'abandon court avec
  rejeu ont tous deux CASSÉ l'ouverture d'admin le jour de leur livraison, et ont été
  retirés. Voir la RÈGLE ABSOLUE, § Performance.
- **(01/08) Ne jamais reconstruire un correctif sur une copie non revérifiée.** Un patch
  GAS a failli être poussé sur une copie d'`Indispos.gs` antérieure au push précédent : il
  aurait annulé `_glob_ms` en silence. Toujours re-télécharger le fichier AVANT de le
  modifier, même si on l'a lu une heure plus tôt.
- **(01/08) Une hypothèse tirée de la lecture du code ne vaut rien tant qu'elle n'est pas
  mesurée.** Trois coupables « évidents » — `renderWeek`, le poids d'`admin.html`, le
  `JSON.parse` de la réponse — étaient tous innocents (17 ms, 0,44 s, 6 ms).

**0. Écrire une ligne entière, c'est écraser ce qu'on n'a pas chargé.** (30/07/2026)
`saveIndispos` remplaçait toute la ligne d'un MAR par ce qu'envoyait la page. Or `INDISPOS_{Y}`
a **deux propriétaires** (comité : VAC/FORM · MAR : INDISPO/SOUHAIT/TP). Résultat : revalider le
staff effaçait la campagne entière, et une page MAR ouverte trop tôt effaçait les vacances.
Aucune erreur, aucun message — le dernier qui enregistre a raison.
→ **Dès qu'une ressource a deux propriétaires, on fusionne, on ne remplace pas.**
→ Et un interdit posé dans le navigateur (`indispos.html` refuse de cliquer sur une VAC) **ne
protège rien** : ce n'est pas par le clic que la perte arrive.

**0 quater. Une mémorisation ne vaut que si sa clé couvre TOUTES ses sources.** (01/08/2026)
La bande de présence mémorisait son calcul sur `DATA` seul, alors qu'elle lit aussi `marsData`.
Or `loadPlanningData` et `loadStatusBar` partent **en parallèle** : `DATA` arrive d'abord,
`renderWeek` est appelée entre les deux, le compte vaut 0 partout — et ce 0 était mémorisé.
Le second `renderWeek` (celui de `loadStatusBar`) resservait le cache. Résultat : **0 présent sur
toute l'année, définitivement**, sans la moindre erreur affichée.
→ **Clé de cache = toutes les entrées lues.** Et tant qu'une entrée manque : ne rien calculer,
ne rien mémoriser (retour vide), plutôt que de figer un résultat faux.
→ Même famille que la TDZ du 28/07 : **l'ordre d'exécution est la première chose à vérifier**
quand un affichage est uniformément faux.

**0 bis. Déclarer un document « sans erreur » après un contrôle par sondage.** (30/07/2026)
`guide-fichier-maitre.html` a été annoncé exact ; le croisement avec `VEILLE_CFG-mode-emploi.md`
a révélé qu'il oubliait le type `GENERAL`. Le sondage prouve la qualité, jamais l'absence d'erreur.
→ Dire ce qui a été vérifié **et par quel moyen**, pas « tout est propre ».

**0 ter. La même règle métier écrite à quatre endroits finit par diverger.** (30/07/2026)
La rotation A/B/C vit dans `staff.html`, `admin.html` et **deux fois** dans `Indispos.gs`.
Le serveur tournait à l'envers depuis le début ; personne ne l'a vu parce que les deux ordres
coïncident **une année sur trois**. Découvert par un symptôme du responsable, pas par une relecture.
→ Avant de modifier une règle de classement, d'équité ou de rotation : **chercher toutes ses
copies dans tout le dépôt**, jamais seulement celle qu'on a sous les yeux.
→ Un bug qui ne se manifeste qu'une année sur trois ne se trouve pas en relisant : il se trouve
en **comparant deux implémentations** sur plusieurs années.

**0 quater. Un « succès » décidé sur un caractère de préfixe.** (30/07/2026)
`archiveYear` renvoie un rapport texte ; le succès se lisait à l'absence de `❌` en tête de ligne.
Les vrais échecs de transfert étaient des `⚠️` → succès annoncé, année basculée, onglets restés
en place. → Un contrat de retour doit être **structuré** (booléen, code), pas typographique.

**0 quinquies. Le banc d'essai ne teste pas le chemin de lecture du classeur.** (31/07/2026)
Le simulateur **fabrique** onglets et dates ; il ne relit jamais des libellés de mois réels. Les
400 années n'ont donc jamais exercé `reconstruireDatesHeaders` — bug de frontière d'année sorti en
30 s par la première génération réelle.
→ **Une validation ne vaut que pour le chemin qu'elle emprunte.** Dire *par quel chemin* un
composant est validé — et lister ceux qui ne le sont pas.

**0 sexies. Un indicateur qui ne détecte jamais rien doit prouver qu'il sait détecter.** (31/07/2026)
Le compteur « 0 journée sans binôme » bâtissait son dictionnaire **à partir des gardes existantes** :
une journée entièrement vide n'y figurait pas. Il répondait 0 quoi qu'il arrive.
→ **Contrôle négatif obligatoire** : fabriquer le défaut, vérifier qu'il est vu. Appliqué ensuite
aux 5 contrôles du planning et au patch de frontière d'année — les deux fois, il a servi.
→ Même famille que le garde-fou mort du W2 (`.length` sur un dictionnaire).

**0 septies. Un chiffre dont je n'ai pas lu le calcul est une rumeur.** (31/07/2026)
Sept chiffres annoncés dans la journée se sont révélés faux — jamais par erreur de raisonnement,
toujours parce que la **source n'avait pas été lue** : compteur écrit des semaines plus tôt,
commentaire obsolète, deux mesures aux définitions différentes comparées entre elles.
→ Marquer la **provenance** : *lu dans le code* · *mesuré, et par quoi* · *supposé*. Sans
provenance = supposé.
→ Les 7 erreurs ont été trouvées par les **questions de mécanisme du responsable**, jamais par relecture.
Une question sur le résultat ne trouve rien ; une question sur le mécanisme trouve tout.

**1. Une déclaration placée trop bas dans le fichier casse tout, en silence.** (28/07/2026)
Dans `admin.html`, la file d'appels `_fileAPI` (`let`) avait été déclarée ligne 2036 alors que la
connexion automatique l'utilise ligne 1801. Une variable `let` n'existe pas avant sa ligne : le
tout premier appel échouait **à chaque rechargement**, l'exception était avalée par un `catch`, et
trois appels de repli partaient par-dessus. Quatre symptômes apparemment distincts, une seule
cause. Coût : une journée.
→ `tryAutoLogin` doit rester **la dernière chose du gros bloc `<script>`**. Ne jamais la remonter.
→ **L'emplacement d'une déclaration est une décision technique, jamais éditoriale.**

**2. Une section déclarée « terminée » sans vérifier le chemin complet.** (20/07/2026)
Le chantier « créer un secteur » a été annoncé fini alors que la création de bout en bout ne
fonctionnait pas. → Vérifier le trajet réel avant d'écrire « terminé ».

**3. Une 4ᵉ liste en dur, invisible aux recherches.** (21/07/2026)
Des tables figées dans le code doublonnaient les onglets du classeur. Une recherche partielle ne
les avait pas trouvées. → **Une recherche négative ne prouve rien tant qu'elle n'est pas
exhaustive** (tout le dépôt, pas les deux fichiers auxquels on pense).

**4. Un générateur livré puis retiré le même jour.** (23/07/2026)
La version fermait tous les trous de garde mais **dégradait l'équité des week-ends** — non détecté
parce que seule la déviation globale était mesurée. → **Mesure d'équité par axe obligatoire**
avant toute livraison du générateur (`simulateur/eval.js`).

**5. Quatre versions successives d'une même fonction en un après-midi.** (28/07/2026)
Le préchargement du panneau de placement a demandé 4 itérations, dont 3 régressions livrées en
production. Point commun : les défauts n'apparaissaient que dans **l'usage réel** (navigation
rapide, clic pendant un chargement, retour en arrière), jamais sur le chemin nominal.
→ **Quand la même fonction casse deux fois, arrêter de patcher** et repartir d'une analyse.
→ Tester les scénarios d'usage réel **avant** de pousser, pas après le retour du responsable.

**6. Un gain annoncé sans être mesuré.** (29/07/2026)
« Faire voyager les gardes avec le login » devait gagner ~4 s. Gain réel mesuré : **130 ms** — le
second appel n'était pas sur le chemin critique. → Le gain d'un appel supprimé n'est réel que s'il
est **bloquant**. Mesurer l'instant d'affichage de l'information utile, pas le nombre d'appels.

**7. Un commentaire périmé maintenu sous un correctif.** Une décision qui ne vaut plus se
**supprime et se remplace**, elle ne s'empile pas — git garde l'historique.

### Écraser son propre travail avec une copie locale — 10/08/2026

**Ce qui s'est passé.** La copie de travail du dépôt est extraite UNE FOIS en
début de session (`curl .../tarball/main`). Le matin, `docs/roadmap.html` a été
patché **directement en ligne** (commit `a119f5aa`). L'après-midi, la montée de
version v1.30.3 a reconstruit le même fichier **depuis la copie locale du
matin** — qui ne contenait pas le patch. Le commit `6e613794` a donc effacé une
carte entière de la vue courte. Constaté par le responsable, pas par le contrôle.

**Pourquoi le contrôle après push ne l'a pas vu.** Il comparait l'empreinte en
ligne à celle du fichier construit : les deux correspondaient, donc « vert ».
Ce contrôle prouve que le push a abouti, **jamais que le contenu poussé était à
jour**. C'est un contrôle de transmission, pas de contenu.

**La règle, deja écrite mais enfreinte** : repartir TOUJOURS de la version en
ligne, jamais d'une copie locale. À compléter par ceci : **une copie de travail
vieillit dès le premier push de la session** — y compris de ses propres pushs.

**Contrôle à ajouter avant tout push d'un lot** : pour chaque fichier, comparer
la version EN LIGNE à la version de la copie locale AVANT d'appliquer le patch.
Si elles diffèrent, re-télécharger et rejouer le patch dessus. Un `assert
live == base` par fichier suffit — il était présent sur les lots construits
directement depuis le live, absent sur celui construit depuis le tarball.

**Périmètre de la perte, vérifié fichier par fichier** : une seule carte. Les
quatre autres fichiers du lot (`admin.html`, `index.html`, les deux guides)
n'avaient pas bougé depuis le 08/08, la copie locale était donc juste pour eux.
Rétabli par `ab82eee9`.

ℹ️ Au passage : l'API `contents` peut servir une version **en cache** juste
après un push (empreinte différente de celle attendue). Relire avec
`?ref=<sha du commit>` pour trancher — c'est ce qui a levé le doute ici.

### Reproposer ce qui existe déjà — deux cas le 09/08/2026

Dans une même séance, deux fonctionnalités ont été proposées ou analysées alors qu'elles
existaient : le **bilan personnel du MAR** (la vue Équité d'`planning.html` a déjà ses boutons
« Initiale » et « Instantané ») et le **solde des récups de samedi** (déjà dans le Diagnostic
depuis le 01/08). Même cause dans les deux cas : **le ROADMAP a été lu à la place du code.**
Le document décrivait un chantier ouvert que la production avait déjà refermé.
→ Avant toute proposition : chercher la fonction dans le code, pas dans ce fichier.

### Le quota de temps de calcul — épée de Damoclès mesurée le 10/08/2026

**(24/10/2026) Remesuré et traité : voir l'entrée du 24/10 (soir).** Le texte ci-dessous est l'état du 10/08.

**90 minutes par jour de tâches de fond** sur un compte gmail ordinaire
(6 heures sur un compte Workspace) — chiffre **vérifié à la source officielle**
Google, page mise à jour le 22/07/2026. Les requêtes des pages n'y comptent pas.

**Où on en est.** `journalAppliquer` tourne **toutes les minutes** (1 440 fois
par jour) à **3,5 s de moyenne** relevés sur 90 exécutions → **~84 minutes**.
Plus la synchro horaire, la veille, les sauvegardes. **Et pourtant rien ne
casse** : 2 échecs isolés en 7 jours sur ~10 000 exécutions, aucune rafale,
aucun message de dépassement.

**Hypothèse NON VÉRIFIÉE** expliquant l'écart : la durée affichée est le temps
**écoulé**, le quota parle de temps **machine**. `journalAppliquer` passe sa vie
à attendre (verrou 5 s max, puis appel réseau) sans calculer. Indice : les
durées vont de 1,3 à 14,3 s pour un travail identique — une dispersion qui ne
peut venir que de l'attente. Trancher demanderait d'instrumenter la fonction ;
**décision du responsable : ne pas complexifier**.

**Le symptôme, s'il tombe un jour** : « Service using too much computer time for
one day ». Les tâches de fond s'arrêtent **jusqu'au lendemain**, les pages
continuent normalement, **rien n'est perdu** — les intentions en attente
s'appliquent au passage suivant. Le dégât est un retard.

**Le remède, sans code, 30 secondes** : dans l'éditeur, passer le déclencheur de
`journalAppliquer` de 1 minute à 5 → coût divisé par 5. Prix : une action du
comité met jusqu'à 5 min à s'appliquer. **Sortie définitive** : compte Workspace
(90 min → 6 h, ~20 €/mois).

⚠️ Les quotas repartent **24 h après la première requête**, pas à minuit :
observer une continuité à travers minuit ne prouve rien.

**Autres plafonds passés en revue le 10/08 — aucun ne menace.** Emails 100/jour :
**déjà surveillé** à trois endroits (diagnostic, avant tout envoi groupé, avant
notifications) avec refus propre. Appels réseau 20 000/jour : ~1 500 utilisés.
Exécutions simultanées 30 : 24 MARs se connectant ensemble tiennent, et un
dépassement ne perdrait qu'une ligne de journal de connexion, l'affichage venant
du miroir. Versions de déploiement 200/script : Apps Script prévient.
Trace `PLANNING_CADUCS` plafonnée à 200 entrées pour une limite de 9 Ko
(~120 entrées) : l'écriture échouerait en silence et la liste du diagnostic
figerait — mais il faut qu'un placement soit contredit par un congé posé APRÈS,
soit quelques cas par an. **Non-sujet, à corriger si on touche le fichier.**

### Pièges techniques

- **ExcelJS** : écrire dans une cellule *esclave* d'une fusion casse le fichier en production.
- **Cache `sessionStorage`** : une colonne ajoutée à un onglet reste invisible tant que la session
  n'est pas fermée (`Ctrl+Maj+R` ne suffit pas). **Versionner les clés** à chaque changement.
- **Clé de semaine** : ne jamais la fonder sur le numéro de semaine (frontières d'année).
- **`.length` sur un dictionnaire vaut `undefined`.** `getAllIndispos` renvoie `{date: code}` par
  MAR : `ind.length === 0` est toujours faux, le garde-fou du W2 n'a jamais rien détecté.
  Utiliser `Object.keys(x).length`. Un test qui ne lève jamais d'erreur peut ne jamais rien tester.
- **Une boucle d'appels côté page = N exécutions sérialisées.** Apps Script sérialise les appels
  d'un même utilisateur : `doValidate()` faisait 23 allers-retours (~3 min, pris pour un plantage).
  **Dès qu'une action porte sur toute l'équipe, c'est un batch** — 1 lecture, 1 écriture de bloc.
- **Rendre un état persistant peut rendre permanent un défaut jusque-là passager.** Les cadenas de
  `staff.html` masquaient le libellé VAC/FORM ; invisible tant qu'ils s'effaçaient au rechargement,
  gênant dès qu'ils ont duré. *(Ici les couleurs suffisaient : bleu = VAC, violet = FORM.)*
- **Codes d'accès** : insensibles à la casse depuis le 27/07 (mobile vs PC). Un code vide est
  refusé explicitement. Format : éviter `&` (coupe les URL) et `O`/`0`/`I`/`1`.
  **Aucune limite de longueur** : les trois `maxlength` des champs de saisie ont été retirés le
  29/07 (`indispos.html` 8, `staff.html` 20, wizard `admin.html` 12). Ils tronquaient un code
  saisi à la main **sans aucun message**, et le code était ensuite déclaré invalide. Ne jamais
  remettre de `maxlength` sur un champ de code.
- **Verrou d'écriture** : toute nouvelle action qui écrit doit rejoindre `WRITE_ACTIONS_LOCK`
  (`Indispos.gs`). Les lectures ne le prennent jamais.
- **Motifs d'absence** : filtrage **serveur**, jamais navigateur. Le rôle secrétariat est une
  liste blanche de deux actions — ne jamais y ajouter `getPlanningJson`.

---

## 🚀 Performance — ce qui reste vrai (mesures du 29/07 au 01/08, détail dans HISTORIQUE)

- **Ne jamais ajouter de requête pour « aller plus vite ».** Apps Script sérialise les exécutions d'un
  même utilisateur : un appel de « réveil » et un délai court avec rejeu ont tous deux cassé l'ouverture
  d'admin le jour de leur livraison (01/08). Rejouer sur une file saturée aggrave l'engorgement.
- **Coût d'un appel Apps Script** : ~1,4 s de plancher Google + ~0,7 s de compilation de nos `.gs`, plus
  le travail utile ; certains jours la file d'attente de Google ajoute jusqu'à 18 s, et aucune
  optimisation n'y touche. Cloudflare répond en ~100 ms : c'est pourquoi les lectures passent par la
  copie rapide.
- **Leviers, dans l'ordre** : moins d'appels ; moins d'allers-retours vers Sheets (cache de 10 min de
  CONFIG / SECTEURS / CS_TEMPLATE / SEUILS, invalidé par toute écriture du verrou) ; jamais de gain
  annoncé sans mesure, jamais de mesure sur une base instable.
- **Le cache de script est partagé entre tous les utilisateurs** : jamais une donnée qui dépend de qui
  appelle. MEDECINS reste hors cache.
- **Pistes fermées** : tailler les lignes vides du classeur ; lire les JSON du Drive par identifiant ;
  optimiser le JSON ; découper le projet Apps Script pour la compilation (~150 ms) ; retirer les
  commentaires ; `JSON.parse`/`stringify` (6 ms) ; optimiser `index.html` (à l'optimum d'Apps Script) ;
  migrer hors Apps Script (non lancé : plusieurs semaines, codes d'accès sur une plateforme tierce,
  second service à maintenir seul).

---

## ✅ État par module — règles à ne jamais « simplifier »

### Gardes
Équité annuelle par axe (total, samedis, jeudis, vendredis-dimanches, veilles de férié, fériés), dette
inter-annuelle sur l'attribution (instantané `STATS_GARDES` figé à la génération), rotation d'équité à
partir de 2028. Règles dures : jamais 3 gardes sur 6 jours, jamais deux week-ends d'affilée sauf tous
deux souhaités, semaines Réa 1 (`REA1_{Y}`), fêtes imposées (`FETES_{Y}`), paires à éviter (l'équité
prime : un avertissement dit quand une paire cède). Le calcul à blanc = la vraie génération, écriture
en moins. **Ne jamais régénérer une année déjà générée** (verrou de `generateGardes()`). Toute livraison
du générateur se mesure **par axe**, jamais sur l'écart global seul.

### Échanges et dons entre MAR
Demandes dans l'onglet `ECHANGES`, lues par la copie rapide, écrites par Apps Script ; l'acceptation
rejoue tous les contrôles avant d'écrire. Expiration 48 h, rappel à 24 h. Chacun ne voit que ses
échanges. Un samedi qui change de mains emmène son R ; un 18 h se donne et s'échange contre un 18 h.
Les gestes du comité passent par les mêmes suites (`_gesteSuites_`).

### Planning quotidien (`admin.html`)
Configuration dans `SECTEURS` et `CS_TEMPLATE`, plus aucune copie en dur sauf `COVERAGE` et `targets`
(voir À faire). Échec de lecture ⇒ bandeau rouge et export Excel refusé : la grille s'affiche amputée,
jamais fausse en silence. `RI` ne rejoint pas `COVERAGE` (règle du mercredi et du jeudi matin). Les
sorties de garde restent groupées dans l'Excel (`RG` unique). Bande de présence : `G`, `G2`, `18`, `I`
comptent présents ; seuils dans l'onglet `SEUILS`.

### Notifications et mails
Mails de changement : un par MAR, ses seules dates, après 10 min d'accalmie suivant la publication ;
statut toujours signalé, secteur seulement dans la semaine du dernier Excel. `NOTIF_ACTIVE` est le vrai
interrupteur. Mail paie indépendant (sa propre photo). Notifications push : Worker + `sw.js`, jamais
bloquantes.

### Module libéral
Détail : `docs/module-liberal/module_liberal_conception.md`.
- Seuil de **30 % par axe**, CCAM et NGAP **indépendants**. La réa ne corrige que le CCAM.
- **Une ligne = un patient** (`LIBERAL_{Y}`, 9 colonnes).
- `BR_CCAM` est datée du **bloc**, `BR_NGAP` de la **consultation** — souvent deux mois différents.
- **Le DH n'est jamais déclaré** (hors quota) et ne se répartit pas par acte.
- **Le rendement se ventile, il ne se somme pas** : le relevé certifié fixe le niveau, les BR déclarées
  la structure.
- **Jamais de % issu des seules déclarations** : le dénominateur (activité publique) n'existe que dans
  le relevé.
- Tarifs NGAP (annexe III CCSS-CAMTI au 01/10/2025) : `C 34,40 · CS 46,00`. **L'APC est une cotation
  française**, absente de la nomenclature monégasque. Les tarifs ameli ne valent pas ici.
- `SPECIALITES` : 12 codes. **Patient mineur ⇒ `PED`**, quelle que soit la chirurgie.

### Contrôle d'absence (`absences.html`)
Deux portes : tuile MAR et session secrétariat. Les **motifs d'absence ne sont jamais transmis au
secrétariat** (filtrage serveur) ; `G`/`G2` ne comptent pas comme absence ; rôle secrétariat = liste
blanche de deux actions, jamais `getPlanningJson`.

### Sécurité
Toutes les actions derrière `checkCode()`, aucun code renvoyé en clair, verrou d'écriture
(`WRITE_ACTIONS_LOCK` : toute nouvelle écriture le rejoint), journalisation « qui/quand » sans contenu
clinique. Tout rôle qui n'est ni comité ni MAR n'atteint que **sa liste blanche** (`_listeBlancheRole_`) ;
un rôle sans liste est refusé partout. Maintenance : rôle à part, le code comité ne suffit pas.
`ensureMarRows()` garantit les lignes annuelles de tout MAR actif. `annulerAbsenceLongue` n'efface que
les cases valant exactement `CL`.

---

## 🚫 Écarté — ne pas reproposer sans élément nouveau

- **Protection anti-force-brute sur `checkCode()`** *(20/07, chiffré)*. 32⁸ ≈ 1 100 milliards de
  combinaisons, ~50 essais/s au mieux → **~350 ans**. Surtout : `checkCode()` tourne à **chaque
  requête**, pas seulement au login — un disjoncteur global aurait coupé le service pour les
  23 MARs avec 30 essais ratés. Et `Utilities.sleep()` épuise le quota au lieu de le protéger.
  *(Le compteur par IP est de toute façon impossible : Apps Script ne donne pas l'IP.)*
- **Généraliser le service worker aux autres pages** *(22/07)*. Tout le monde passe par le
  Dashboard, qui le porte déjà.
- **Servir les icônes d'`planning.html` depuis le bundle local** *(22/07)*. Les icônes sont
  configurables par l'onglet `SECTEURS` (1 728 icônes possibles) : une liste figée ferait
  disparaître un picto **en silence**. Ne reproposer qu'avec un repli visible.
- **Réduction automatique du devis à l'impression** *(21/07)*. 95 % des dossiers font 2 actes,
  3 au maximum ; réglé par la mise en page seule.
- **Archivage annuel automatisé** *(29/07)*. Un déclencheur annuel est du code jamais testé qui
  s'exécute sans surveillance ; il transformerait un oubli en erreur grave.
- **`config.html`** — couvert par les onglets d'`admin.html`.
- **Migration hors Apps Script** — non lancée, voir la section Performance pour le détail chiffré.
- **Réécrire l'historique du dépôt** pour en retirer les traces d'identité *(18/10)*.
- **Badge « mise à jour prête » sur la tuile Maintenance** *(01/11)* : le responsable ouvre la tuile
  lui-même.
- **E-mails manquants dans MEDECINS, MAR hors GROUPES_VAC, avis du DPO sur le widget du pense-bête**
  *(02/11)* : normal et voulu pour le moment.
- **Rebrancher l'écran « Paramètres » d'admin sur CONFIG** *(07/08)* : les secrets restent dans le
  classeur.
- **Purger par du code les lignes d'une année à venir** dans `PLANNING_OVERRIDES` *(10/08)* : geste rare,
  il reste manuel.
- **Enquête de satisfaction avant / après** pour la publication *(10/08)* : elle jugerait le travail de
  collègues, biais d'annonce, mesure initiale impossible.
- **Garde-fou souhaits / équité** *(abandonné le 02/11)* : à rouvrir seulement si une génération sort un
  MAR à 2 gardes ou plus de sa cible.
- **Verrou `STAFF_VALIDE` sur la saisie des indispos, ou marqueur de conflit au staff**, pour une indispo
  écrasée par une vacance *(30/07)*.
- **Réutiliser les générations identiques d'un scénario du banc à l'autre** *(21/10)* : risque de faux
  vert si un scénario modifie le contexte avant de générer. (Les empreintes du 15/11 reprennent un
  scénario entier dont rien n'a changé : ce n'est pas la même chose.)

---

## Journal récent

- **15/11/2026** — Banc plus rapide (empreintes, une génération au lieu de deux, `banc_syntaxe`) :
  ~2 min 20 au lieu de 24 min quand le générateur ne change pas. `admin.html` : `<div class="main">`
  refermé (v1.78.2). CONTEXTE et ROADMAP refaits ; tout l'ancien contenu daté est dans HISTORIQUE.
