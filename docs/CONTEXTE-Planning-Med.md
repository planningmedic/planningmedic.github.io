# Contexte projet Planning-Med — à coller en début de conversation

Tu es mon développeur attitré sur **Planning-Med**. Je suis **Arthur**, anesthésiste-réanimateur
au **un service hospitalier**, seul responsable de ce projet et **sans bagage de code** : tu écris, valides
et livres tout ; moi je recopie/valide. Réponds en **français**, de façon **concise**, avec des
chiffres concrets plutôt que des généralités.

---

# PARTIE 1 — L'ESSENTIEL

*Si tu ne lis qu'une chose, lis ceci. Le détail complet est en partie 2.*

## ⚠️ LE 4 SEPTEMBRE 2026 : LE STAFF

**Révision du 03/09 au soir : le W1 ne sera PAS joué en direct.** La porte d'entrée d'Apps Script
s'est montrée capricieuse ce soir-là (404 sur le canal de réponse, délais dépassés). Arthur passe
le W1 la veille et montre un résultat. `staff.html` est ouvert **avant** la séance et **n'est pas
rechargé** : les jours fériés n'y sont lus qu'à l'ouverture.

*Intention initiale, conservée pour mémoire :* lancer la génération en séance, en régénérant celle
du 25/08.

**`NOTIF_ACTIVE` est le vrai interrupteur** : quand il ne vaut pas `O`, le système prend quand même
la photo et se tait — **aucun arriéré ne peut s'accumuler**. Inutile de toucher aux fichiers
`_notifie.json`. Et le récapitulatif « Vos gardes » ne dépend PAS de `NOTIF_EMAIL_TEST` : il lit la
colonne EMAIL du classeur, directement.

1. **avant le 4** : `NOTIF_ACTIVE` = `N` · remettre les 21 adresses dans la colonne EMAIL (elles
   sont décalées d'une colonne à droite) · laisser `NOTIF_EMAIL_TEST` ;
2. **le 4** : ménage, génération en direct → le récap part à tous, aucune notif de changement
   possible, **rien à supprimer** ;
3. **après, planning stable** : publier, attendre 15 min, vérifier au journal « système éteint,
   photo prise, aucun envoi » ;
4. **rallumer** : `NOTIF_ACTIVE` = `O`, supprimer `NOTIF_EMAIL_TEST`.

**Filtre des mails de changement** : un par MAR, ses seules dates. Statut (garde, astreinte,
absence) → toujours signalé, même à six mois. Secteur (affectation en journée) → seulement dans la
fenêtre du dernier Excel (vendredi 16 h → dimanche +9).

---

## État au 6 septembre 2026 (matin)

Site **v1.3.3**, banc **2 727 vérifications, 0 échec**.
**Cinq fichiers GAS à recopier dans l'éditeur et à redéployer** : `code.gs` **2026-09-05.1**,
`Indispos.gs` **2026-09-05.1**, `miroir.gs` **2026-09-06.1**, `generateur_gardes.gs`
**2026-09-05.1**, `setup_annee.gs` **2026-09-05.2**.

### L'axe des jours fériés est enfin à l'écran

Le générateur surveille six axes ; l'écran n'en montrait que cinq. La colonne `CIBLE JF`
existait depuis toujours, aucun lecteur ne la servait : la barre « JF » était tracée contre une
moyenne d'équipe, pas contre une cible. Corrigé de bout en bout.

**Mesuré** : sur les absences réelles, le pire écart sur les fériés est de UNE garde ; sur 45
années simulées, une seule dépasse 2. L'axe ne fait pas apparaître de rouge.

**Défaut introduit puis corrigé le jour même** : sur 2026, dont l'onglet s'arrête avant la
colonne, la barre affichait « 2 /0 » en rouge — une cible ABSENTE lue comme une cible à zéro.
Le lot avait vérifié les lecteurs de la donnée, pas ce que la page en fait.

### La saisie des indisponibilités est prête pour le 10 octobre

Refonte visuelle seule, logique intacte : barre d'outils passée SOUS le calendrier et collante,
couleur qui remplit la case, cadenas sur les jours du staff, refus écrits sous le calendrier au
lieu d'un toast fugace, week-ends estompés quand l'outil temps partiel est actif, et les quotas
devenus des jauges — congés, formation, temps partiel. Indispos et souhaits n'ont pas de
plafond : ils restent de simples comptes.

Essayée sur téléphone, campagne 2027 ouverte quelques minutes puis refermée.

### La cloche ne notait rien depuis le passage au canal par rôle

Le garde-fou `if (cible && cible.role) return;` visait le comité ; il écartait TOUS les rôles,
dont `role:'mar'` — la génération des gardes. Le push partait, la cloche restait vide, et rien
ne pouvait le révéler. Les notifications déjà envoyées ne sont pas rattrapées.

### À savoir

- **Un onglet INDISPOS a TROIS lignes d'en-tête** (mois / initiales / numéros), MAR en ligne 4.
  Un collage sans elles fait perdre presque toutes les dates, en silence.
- **W1 n'envoie aucun mail** : l'envoi des codes est une étape séparée, déclenchée par un bouton.
- **Jetons en clair dans l'onglet CONFIG** : ils sortent dès qu'on exporte ou copie le classeur.
- **La dette cumulative n'est pas codée.** Inutile pour 2027 (compteur vide), à faire d'ici
  novembre 2027.
- **La tuile temps partiel** attend sa reprise visuelle. Son fonctionnement ne change pas.

---


## État au 5 septembre 2026 (soir)

Site **v1.1.2**, banc **2 690 vérifications, 0 échec**. `generateur_gardes.gs` **2026-09-05.1** et
`setup_annee.gs` **2026-09-05.2** — **les deux sont à recopier dans l'éditeur et à redéployer.**
Sept commits : `67803951`, `1a53a068`, `a3a35084`, `723da5d5`, `ab810462`, `cc024d39`, `d2ab072b`.

### Le nouvel algorithme de gardes est en ligne

Quatre mécanismes, sous l'interrupteur `NOUVEL_ALGO_GLOBAL` (retour arrière en une ligne) :
**cibles entières** par plus forts restes, **numéro de tirage** à la place de l'ordre de MEDECINS,
**multi-départ** (8 calculs à blanc, on écrit le meilleur), **objectif lexicographique** de
l'optimiseur et **interdiction dure de deux week-ends d'affilée**.

Mesuré sur 45 années simulées : 44 sur 45 où personne ne dépasse **une garde d'écart** sur les six
axes, contre 29 sur 45 avant. Éprouvé dans Apps Script sur les absences RÉELLES du service,
complétées par quotité, avec 161 souhaits : 364 journées toutes pourvues (y compris le 27/12 avec
3 gardeurs disponibles sur 20), un seul MAR à 2 gardes d'écart, 121 souhaits honorés sur 161.

**La dette inter-annuelle n'est PAS codée.** Elle est inutile pour 2027 (compteur vide), et le
travail se fera d'ici novembre 2027.

### L'écran d'équité affichait un calcul faux

Sur 2026, la colonne CIBLE promettait 730,8 gardes pour 707 posées : les gardes du **médecin
extérieur au service** n'étaient comptées nulle part. Tout le monde apparaissait ~1,7 garde trop
bas, l'écran accusait **19 MAR sur 20** au lieu de 17, dont trois pile à leur part. Corrigé dans
les deux pages : les gardes réellement posées sont réparties en cibles entières, et la mention
d'explication s'affiche dès que la correction s'applique.

L'écran est refait : nombres de personnes au lieu de pourcentages, classement replié au lieu du mur
de noms, **une ligne par MAR** dépliable au clic, la sienne en tête.

### La numérotation repart à v1.0

**v10.8.3 → v1.0.4**, le numéro descend volontairement et une seule fois. **v1.0 = la version
présentée au staff du 4 septembre.** v2.0 est réservé au module libéral. Conséquence : un numéro ne
peut plus dater une fonctionnalité — deux contrôles du banc qui le faisaient ont été réécrits.

### Lanceurs temporaires, à retirer une fois 2027 publié

`T()` et `T7()` : avant/après à blanc sur 2026 et 2027, aucune écriture — c'est la mesure à lancer
le **30 octobre**, campagne close. `W1_2028()` et `W2_2026()` : **copie du classeur uniquement**,
`W2_2026` efface le planning en cours et notifie toute l'équipe.

### À surveiller

- **Axe jours fériés absent de l'écran d'équité** : `getStats` ne sert pas `CIBLE JF` (colonne 22).
  C'est l'axe où le nouvel algorithme laisse son résidu.
- **Jetons en clair dans l'onglet CONFIG** : ils sortent dès qu'on exporte ou copie le classeur.
- **Un onglet INDISPOS a TROIS lignes d'en-tête** (mois / initiales / numéros), MAR en ligne 4. Un
  collage sans elles fait perdre presque toutes les dates, en silence.

---

## État au 3 septembre 2026 (soir) — la veille du staff

Site **v10.8.1**, banc **2531 vérifications sur 54 scripts, 0 échec**. Quatre commits ce soir-là :
`2fb03e94`, `c238c4ab`, `908bce5b`, `f3b44286`. **Aucun `.gs` modifié : rien à recopier.**
Versions du dépôt : `code.gs` 2026-09-01.1, `Indispos.gs` 2026-09-03.1,
`generateur_gardes.gs` 2026-09-01.2, `portail.gs` 2026-08-31.1.

⚠️ **Ce qui est déployé ne se déduit pas du dépôt.** Seule la sonde « Code déployé vs dépôt » du
🔍 Diagnostic le dit. Indice partiel : `LOGS` du 02/09 porte les lignes « avertissement 1/4 · 2027 »
du lot 2026-09-01.3, donc ce lot-là tournait bien.

### Décision d'Arthur sur le déroulé du 4 septembre

**Le W1 ne sera PAS joué en direct.** La porte d'entrée d'Apps Script s'est montrée capricieuse le
03/09 au soir (voir ci-dessous). Le W1 a été passé la veille ; le 4, Arthur montre un résultat.

**`staff.html` sera ouvert avant le staff et NE SERA PAS RECHARGÉ.** Les jours fériés y sont lus
**une seule fois**, à l'ouverture. Tant que la page n'est pas rechargée, l'onglet Ponts continue de
fonctionner même si Google tombe ensuite. Le seul geste qui casse tout, c'est F5.

**Ce qui survit sans Apps Script** (copie rapide) : l'entrée dans `staff.html`, la liste des MAR,
les périodes, les groupes, les congés déjà saisis, le planning et l'équité côté `index.html` et
`dashboard.html`. **Ce qui ne survit pas** : toute saisie. `saveIndisposBatch` et « Valider et
verrouiller » partent en direct, sans file d'attente — le journal d'intentions ne couvre que les
placements, les statuts et la publication. **On peut montrer, on ne peut pas enregistrer.**

### Règles gravées ce jour

- **Un message d'attente qui ne peut pas se résoudre est un mensonge.** « Rouvrez la page dans un
  instant » s'affichait sur un cul-de-sac : la clé attendue n'existait pas et n'allait pas
  apparaître. Un écran qui invite à réessayer doit avoir une chance d'aboutir au réessai.
- **Une clé de la copie rapide n'existe que si sa famille a une source déclenchante.**
  `joursferies` est classée « sans source » (`banc_miroir.js`) : elle n'est construite que par la
  synchro horaire, et seulement pour les années possédant un onglet `GARDES_{Y}`. Donc jamais
  pendant la campagne de l'année suivante. **Toute lecture de la copie rapide a besoin d'un
  repli**, comme les périodes de vacances en ont un depuis le 13/08.
- **Une correction faite sur un écran doit être cherchée sur tous les autres.** Les bornes de
  l'année de planning avaient été posées dans `indispos.html` le 12/08 (banc T072) ; `staff.html`
  ne les avait jamais reçues, et laissait poser des congés sur trois jours qui n'existent pas au
  classeur. Le serveur les jetait en silence en répondant « enregistré ».
- **Deux écrans qui rejouent le même calcul ne se contrôlent pas l'un l'autre : ils se répètent.**
  L'écran « Vacances » du W2 refaisait exactement le calcul des conflits de l'étape précédente —
  même rotation, même seuil, même test. Il était vert par construction dès que l'étape 1 laissait
  passer. Supprimé.
- **Un chiffre affiché qui n'entre dans aucun calcul finit par tromper.** « ✓ 127 jour(s) »
  additionnait VAC, FORM, INDISPO, SOUHAIT, TP et CL : il mesurait une quotité, pas une saisie.
  Le seul test réel a toujours été « zéro ou pas zéro ».
- **Une alerte doit reproduire la règle du moteur, pas une approximation prudente.** L'alerte des
  prioritaires Noël se déclenchait dès une date bloquée, alors que le générateur traite les quatre
  dates séparément et sert en priorité ceux qui n'ont jamais donné : une seule date libre suffit.
  Elle signalait quatre MAR dont aucun n'était écarté.
- **Un test devenu faux se corrige avec sa raison ; un test gênant ne se supprime pas.**
  `banc_page.js` attendait 2 appels `getVacValidation`, il en reste 1.

### 🔴 L'erreur de méthode du jour — une déduction présentée comme un constat

J'ai annoncé à Arthur que les fériés seraient lus « copie rapide d'abord, Apps Script en repli »
**sans avoir vérifié** que la famille `joursferies` n'a aucune source déclenchante. C'était juste
sur le papier et faux en pratique : le repli allait être le seul chemin. Il a ouvert `staff.html`
en pensant que ça marcherait. La règle du contexte — distinguer ce qui est vérifié de ce qui est
supposé — n'a pas été tenue.

### Trous connus, décision de NE PAS les boucher maintenant

- 🔴 **Les MAR hors groupe ne consomment aucune place du seuil de présence.** `getVacConfig` et
  `getVacValidation` construisent `marEnVacCeJour` à partir des seuls membres de `GROUPES_VAC`.
  Un actif absent de ces groupes n'a pas de rang : ses congés ne peuvent jamais être refusés **et
  ne comptent pas dans le seuil**. Cas visé : **PRUNET (BP)**, qui pose où il veut par régime.
  **FERRIERO était hors groupe le 03/09 alors qu'il est actif — à réintégrer.**
  ⚠️ Côté `staff.html`, **rien à faire** : `countForDay` et `vivierGarde` bouclent sur tous les
  médecins actifs, le trou est purement serveur. Remède envisagé, à confirmer par Arthur : les
  hors-groupe occupent les **premières** places du seuil — jamais refusables, mais ils font
  reculer les autres d'un rang. **Reporté : cela change des résultats d'arbitrage.**
- ⏳ **Le rejeu des actions du W1**, écrit et testé le 03/09, **jamais poussé** — Arthur ne voulait
  pas de changement non éprouvé la veille du staff. Il n'existe dans aucun commit.
- ⏳ **`bornesAnneePlanning` est dupliquée** dans `indispos.html` et `staff.html`. À porter dans
  `partage/` après le staff — toucher la page des MAR en pleine campagne était le mauvais moment.
- ⏳ **Les 1er et 2 janvier N+1** appartiennent à la campagne mais n'apparaissent dans aucune vue
  par mois de `staff.html`. Atteignables par la période Noël, donc rien n'est perdu.

### La panne du 3 septembre au soir, et ce qu'elle apprend

Le W1 s'arrêtait à des étapes variables, en **délai dépassé** et en **HTTP 404**. Ni le classeur
(`GROUPES_VAC` et `PERIODES_VAC` relus, conformes) ni le code métier n'y sont pour quelque chose.

La cause est **écrite en tête de `journal.gs` depuis le 05/08** : « 2,5-5 s au mieux, 30 s+ les
mauvais matins, 404 sur le canal de réponse ». La requête part, le script s'exécute, mais le
chemin de retour répond 404. Le journal d'intentions ne couvre que trois types d'écriture
(placements, statuts, publication) : **les onze actions du W1 passent en direct**, et la page ne
tente chaque appel qu'une fois.

⚠️ **`initYear` refuse de tourner si `INDISPOS_{année}` existe déjà.** Un 404 sur le canal de
réponse APRÈS une création réussie affiche donc un échec alors que l'année EST créée. **Avant de
relancer une étape du W1, regarder l'onglet.**

⚠️ **Leçon de méthode** : la réponse était déjà dans les commentaires d'intention du code. J'ai
cherché dans la logique avant de lire ce que le code disait de lui-même.

---

## État au 1er septembre 2026 — six lots, et le passage à la série v10

Site **v1.99 → v10.6**, banc **2200 → 2415**. Le numéro change de série : la suite de v1.99 aurait
été « v1.100 », qui se lit mal. On avance de dixième en dixième ; le premier chiffre reste réservé
à ce que l'équipe voit changer pour de bon.

**Ce qui a été livré** : pose des temps partiels pendant la campagne · un TP posé est acquis (plus
aucune garde la veille) · génération bloquante quand un jour n'a pas de binôme · vivier de garde
affiché sur les colonnes samedi et dimanche du staff · onglet « Ponts » · diagnostic des jours
sans binôme rendu lisible · avertissements de génération persistés dans `LOGS` · matrice Noël /
Jour de l'An · quota de congés compté en jours travaillés au staff · panneau « Ce qu'il reste à
poser ».

### Règles gravées ce jour

- **Deux lecteurs des mêmes données qui ne comptent pas pareil : troisième occurrence en une
  journée.** La grille contre les statistiques, l'écran contre le journal, le staff contre le
  serveur. Les trois fois, ce sont les **données réelles** qui l'ont révélé — pas la relecture.
- **Un chiffre mesuré vaut mieux qu'un chiffre raisonné** : « plus aucune garde la veille d'un
  TP » a été mesuré sur 18 tirages sur 18, pas déduit.
- **L'écran montre, le comité décide.** La matrice de Noël ne désigne personne comme prioritaire :
  il y a souvent plus de huit candidats légitimes, et désigner huit noms donnerait à un calcul le
  dernier mot sur un arbitrage humain.
- **Une source qui suit l'état de l'année.** Les reliquats se comptent dans `INDISPOS_{Y}` avant
  génération et dans `GARDES_{Y}` après — vérifié dans `appliquerStatutJour`, qui n'écrit **jamais**
  dans `INDISPOS`. Compter au mauvais endroit aurait rendu invisible tout ce que le comité pose
  après la génération.
- **Un plafond de journal doit être comparé au maximum que peut produire l'émetteur.** 25 lignes
  d'avertissements écrites dans `LOGS`, quand le générateur peut en rendre 60 et que `LOGS` est
  purgé à 501 lignes. Au-delà, le reste est annoncé, jamais tu.
- **Deux erreurs dans mes propres tests** sur les ponts, attrapées en les écrivant : le code avait
  raison. Un test qui contredit le code n'a pas forcément raison.

### 🔴 Une fonction perdue par accident, retrouvée quatre jours plus tard

`generateCode` avait été effacée le **29/08** par le commit des compteurs d'usage — un lot sans
aucun rapport. Restaurée le 03/09 (`0c54ffa3`), avec un scénario de banc sur la réinitialisation
du code d'accès. **Une suppression accidentelle dans un lot voisin ne se voit que le jour où on
appelle la fonction.**

### Décision du 3 septembre sur les ponts

La règle arithmétique du 01/09 (quatre jours de repos pour un seul posé) désignait **treize** jours
en 2027 : elle comptait aussi ceux qui ALLONGENT un week-end. Le calcul était juste, la notion non.
Décision d'Arthur : règle **géométrique** — chômé la veille ET le lendemain, un férié d'un côté.
**2027 = les vendredis 7 et 28 mai.** 2028 = 4, 2029 = 5, 2030 = 4, 2031 = 4.

---

## État au 31 août 2026 (soir) — le compteur par rôle : le comité s'en sert-il, ou l'ouvre-t-il ?

Site **v1.98**, `Indispos.gs` **2026-08-31.1**, `portail.gs` **2026-08-31.1**, banc **2200**.
Commit `4484b92`. ⏳ **EN ATTENTE : les deux `.gs` doivent être recopiés et déployés.**

**La question posée.** Les connexions disent qui ouvre le portail, jamais ce qui y est fait.
Arthur, qui passera la main au comité, veut savoir si la page d'administration servira ou sera
seulement ouverte.

**Ce qui bloquait.** `LOGS` journalise déjà ~70 gestes, mais ne peut pas servir de source : il ne
garde que **500 lignes** et son message est du **texte libre**, pas une donnée rangée. Une carte
alimentée par lui afficherait une courbe qui rétrécit — le défaut corrigé le matin même.

**Ce qui a été construit.** Onglet `STATS_ACTIONS` (`ROLE`, `ACTION`, `NOMBRE`, `DERNIERE`),
incrémenté au moment du geste par `_statsActionIncr_`. Deux branchements, pas un de plus :
`logConnexion` pour les ouvertures, et l'entrée de `WRITE_ACTIONS_LOCK` pour les **26 écritures**.
Deux cartes dans `stats-usage.html` : « Qui se connecte » (celle qui était écrite depuis mars et
masquée en dur faute de données) et « L'administration, au-delà de la connexion ».

### Règles gravées ce jour

- **Les lectures ne sont jamais comptées.** Une écriture au classeur par ouverture d'écran
  ralentirait tout le portail — mesure du 28/07 : quatre exécutions concurrentes coûtent 4 à 7 s
  chacune contre 1,8 s pour une seule.
- **Un compteur n'a jamais le droit de faire échouer le geste qu'il compte.** Chaque appel est
  sous `try/catch` ; le banc rend l'écriture impossible et vérifie que la connexion aboutit.
- **Le compteur mesure un RÔLE, jamais une personne.** Le code d'administration est unique et
  partagé, `checkCode` le rend sans nom ni initiales. Impossible de savoir qui a agi — c'est une
  limite de conception, pas un manque à combler dans ce lot.
- **Les trois barres restent séparées.** Fondues dans les « actifs », les ouvertures
  d'administration feraient dépasser la courbe de son plafond de 25.

### Défaut connu, non corrigé par ce lot

Le **secrétariat** (`initials: 'SEC'`) porte un nom, donc `statsRecalculer` le compte comme un
**26e utilisateur** dans la courbe « actifs / 25 ». Le lot le rend visible sans le corriger.
Décision reportée après le 4 septembre.

### Ce que le routeur compte exactement

La **tentative**, pas la réussite : le point de passage est unique à l'entrée des écritures, il ne
l'est plus après. Une publication refusée par le verrou d'écriture est comptée.

---

## État au 31 août 2026 — statistiques d'usage, et le journal qui s'autodétruisait

Site **v1.97**, `Indispos.gs` **2026-08-29.1**, `portail.gs` **2026-08-29.2**, banc **2163**.
Six commits : `2c01cb4` `cb64f70` `f7915fa` `cfe2b64` `b54bdc2` `ef5a303`.

✅ **RIEN EN ATTENTE.** Les deux `.gs` recopiés et déployés, `installStatsTrigger()` exécutée.

**Ce qui a été construit.** Un écran de statistiques d'usage (`docs/stats-usage.html`, tuile
`only:'DURAND'`) et les compteurs qui l'alimentent. Le journal `CONNEXIONS` était plafonné à
2 000 lignes : mesuré à 27 connexions/jour avec 5 utilisateurs, le plafond aurait été atteint
toutes les 2 à 3 semaines à 25 MAR, détruisant l'historique en continu. Plafond porté à 10 000
(~3 mois), et trois compteurs qui **ne dépendent plus des lignes brutes** : `STATS_SEMAINE`
(52 lignes/an, figée dès la semaine finie), `STATS_HEURES` (grille 7 × 24), et
`MEDECINS.DERNIERE_CONNEXION`.

### Règles gravées ce jour

- **On ne reconstruit jamais une statistique depuis les lignes brutes après coup ; on la fige
  pendant qu'elles existent.** Corollaire dans `logConnexion` : **figer PUIS supprimer**. Si le
  figeage échoue, rien n'est supprimé.
- **Une date de dernière connexion est un état, pas un compteur.** D'où le filtre d'origine
  (`STATS_ORIGINE = '2026-09-04'`) sur les courbes et la grille horaire, mais **pas** sur
  `DERNIERE_CONNEXION`. Conséquence assumée : entre le pré-test et le 4, tableau nominatif et
  graphiques racontent deux choses différentes.
- **Le volume d'usage flatte, le nombre de personnes distinctes informe.** Le volume monte aussi
  quand les mêmes reviennent plus souvent. Graphique principal = médecins distincts par semaine ;
  seconde courbe = connexions par médecin actif. Le volume brut est relégué, avec la mise en garde
  écrite dessus.
- **Cet écran observe, il ne surveille pas.** Aucun total par personne, ni affiché ni renvoyé par
  le serveur. Aucun rouge dans les pastilles — il dirait « en faute » à propos d'un collègue qui
  n'a pas ouvert une page web. **Le banc vérifie cette décision dans la feuille de style**, pas
  seulement dans le rendu : sans ça, un futur ajustement la déferait sans que personne le voie.
- **`instanceof` ne survit pas à deux contextes d'exécution.** Un `Date` venu d'ailleurs échoue au
  test et la normalisation est silencieusement sautée. On reconnaît une date à ce qu'elle sait
  faire, pas à sa filiation.

### 🔴 L'erreur de méthode du jour — un test qui entérine la croyance au lieu de la vérifier

`getStatsUsage` contrôlait `user.role !== 'admin'`. Or `checkCode` ne rend ce rôle que pour le
**code d'administration** (id `ADMIN`) : avec son code personnel, Arthur est un `mar` d'id
`DURAND` et **se voyait refuser sa propre page** — alors que la tuile filtre sur l'**identité**.
Deux critères différents pour la même porte, et **mon scénario de banc vérifiait « refus pour rôle
mar » comme une sécurité**. Il ne pouvait donc pas voir le défaut : il testait ma croyance.

Corrigé en `STATS_ALLOWED = ['DURAND']` (motif déjà en place pour le CRH). Le banc vérifie
maintenant que **l'identité autorisée côté serveur est celle que porte la tuile** — c'est leur
désaccord qui a produit la panne.

**Même racine, deux autres fois dans la journée** : `deleteRows` manquait à la doublure du banc
alors que le vrai code l'appelle en 4 endroits *(la purge n'avait jamais été exercée)*, et
l'en-tête `CONNEXIONS` du monde simulé disait `['DATE','ID']` là où le code écrit
`['HORODATAGE','NOM','INITIALES','ROLE']`.

### ⚠️ Deux règles écrites périmées, à ne plus réciter

- **La version du site a UNE source, `version.js`.** Plus « 9 emplacements dans 5 fichiers » :
  c'est vrai depuis le 14/08.
- **Deux chiffres, jamais trois.** `version.js` porte la décision du 14/08 ; le banc l'applique et
  a refusé un `v1.94.1`. La règle du 3e chiffre pour un petit correctif est **caduque**.

### 📄 Conformité — fiche de traitement pour le DPO (hors dépôt, le dépôt est public)

PDF de 3 pages, prêt. Interlocuteur : **`dpo@exemple.fr`**, pas la DSI. La **loi n° 1.565 du
03/12/2024** a largement supprimé la déclaration préalable au profit de la **responsabilisation** :
la fiche n'est pas une formalité en plus, c'est ce qui a remplacé la formalité. **Ne jamais poser
de question nue** (« ai-je le droit ? » appelle un non par défaut) : on décrit le traitement et on
demande la liste des obligations. Saisine **après** le 4, annoncée en séance le 4. Module libéral
**hors périmètre** (groupement, pas l'établissement). Question ouverte : responsable du traitement,
l'établissement ou Arthur à titre personnel ?

## Archive — 5 au 28 août 2026

Le détail de ces états a été retiré le 06/09/2026 : le document faisait 3 019 lignes.
**Rien n'est perdu** — chaque version reste dans l'historique du dépôt. Ce qui devait survivre
est remonté dans les états récents ci-dessus.

- État au 28 août 2026 (soir)
- État au 28 août 2026 (matin)
- État au 27 août 2026 (soir) — le diagnostic optimum
- État au 27 août 2026 — vacances estimées au format samedi→dimanche, et une erreur trouvée dans le classeur
- État au 26 août 2026 — audit critique du générateur, un doublon corrigé, les week-ends d'affilée assumés
- État au 25 août 2026 — les souhaits de garde ouverts à tous les jours
- État au 23 août 2026 (nuit) — la cloche en production, une seule pastille
- État au 23 août 2026 (soir) — le TP vit dans GARDES, et la copie rapide était bloquée depuis le 5 août
- État au 22 août 2026 (soir) — la pose des temps partiels est construite (v1.65 → v1.67), déploiement en attente
- État au 22 août 2026 (après-midi) — les jours de temps partiel changent de moment
- État au 22 août 2026 — récupérations déployées, vérifiées en production
- État au 21 août 2026 (soir) — le placement des récupérations de samedi
- État au 20 août 2026 — les plafonds gratuits de Cloudflare, et une panne quotidienne que rien ne signalait
- État au 19 août 2026 (fin de journée) — v1.64 : tuile CR hors mobile, doc de panne rattrapé, banc à 1464
- État au 19 août 2026 (midi) — v1.61 : dépôt nettoyé, l'affaire PRUNET close, banc à 1449
- État au 17 août 2026 (matin) — v1.41 : le code d'accès retenu 30 jours, et la séquence du 4 septembre écrite
- État au 16 août 2026 (soir) — v1.36 : le guide du comité prêt à être envoyé, banc à 1119 vérifications
- État au 14 août 2026 (après-midi) — les échanges de gardes TOURNENT EN PRODUCTION, éteints, prêts pour la v2.0
- État au 14 août 2026 (midi) — v1.34.6 en ligne : cinq défauts d'affichage, dont un qui attendait 2027
- État au 14 août 2026 — v1.34 en attente de push : les échanges de gardes sont construits de bout en bout
- État au 13 août 2026 (soir) — v1.33.2, plus rien n'attend Google, banc à 863 vérifications
- État au 12 août 2026 (soir) — v1.31.14, identité visuelle propre, banc à 723 vérifications
- État au 11 août 2026 — v1.31.1, les temps partiels entrent dans l'équité, banc à 612 vérifications
- État au 9 août 2026 — session d'audit : sauvegardes, comptes, connecteurs
- État au 8 août 2026 — v1.30.2, veille refondue et validée, banc à 524 vérifications
- État au 6 août 2026 — v1.28, guides refondus, banc à 436 vérifications
- État au 5 août 2026 — LE JOURNAL D'INTENTIONS ET LE BANC D'ESSAI
- État au 4 août 2026 — LE MIROIR CLOUDFLARE EST EN PRODUCTION
- État au 3 août 2026
