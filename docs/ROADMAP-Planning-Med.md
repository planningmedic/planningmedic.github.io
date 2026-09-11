# Roadmap — Planning-Med

Système web pour le service d'anesthésie (~23 MARs) :
planning des gardes (équité annuelle), planning quotidien, consultations,
portail/Dashboard, module libéral, contrôle d'absence, veille biblio.
(Le générateur de comptes rendus a été retiré le 07/09/2026 : il portait le logo de
l'établissement et 77 noms de praticiens sur une page publique sans code d'accès.)

**Dépôt** `planningmedic/planningmedic.github.io`, branche `main` · **Site v1.9.0** ·
**Portail** https://planningmedic.github.io ·
**GAS** (relevé dans le dépôt le 10/09/2026) `code.gs` **2026-09-08.2** ·
`Indispos.gs` **2026-09-10.1** · `generateur_gardes.gs` **2026-09-10.1** ·
(deux fichiers sous le même numéro : deux lots distincts du 10/09, au soir et en soirée) ·
`portail.gs` **2026-09-08.1** · `miroir.gs` **2026-09-08.2** ·
`journal.gs` 2026-08-27.1 · `echanges.gs` **2026-09-08.1** · `veille.gs` 2026-08-27.1 ·
`setup_annee.gs` **2026-09-08.1** · `sauvegarde.gs` 2026-09-07.1 ·
**Worker** `cloudflare/worker.js` : `const VERSION = 'miroir 2026-08-22.2'` — ⚠️ le marqueur n'a
pas été monté avec le lot cloche du 23/08 (oubli assumé, le code déployé est bien le nouveau) :
à monter au prochain lot Worker. La constante reste la **seule** version écrite dans le fichier.

## 10/09/2026 (soir) — le W1 se termine sur le staff

L'assistant finissait par un mail à chaque MAR : code d'accès, récap des congés posés au staff,
annonce de l'ouverture. Les trois ont perdu leur objet — le code des indispos est celui du
portail, les VAC/FORM verrouillés se relisent dans « Mes indispos » avec leur cadenas, et
l'annonce se fait de vive voix puisque le staff est en séance à ce moment précis.

**Le contresens évité en décidant :** croire que c'était l'envoi qui OUVRAIT la saisie. Il ne
l'a jamais fait — `INDISPOS_ACTIVE` est écrite à l'étape 4, deux étapes plus tôt, par
`setIndisposYear`. Le premier bloc du nouveau scénario l'exécute pour de vrai sur un classeur
simulé, précisément pour que ce lien ne puisse plus être coupé sans que le banc le voie.

**Retiré aussi :** l'écran de l'étape 6 annonçait que l'envoi verrouillait les VAC/FORM. Il ne
verrouillait rien — le verrou vient de « Valider et verrouiller » de `staff.html`. La phrase
était fausse depuis son écriture, et personne ne l'avait relue en regardant le code.

Wizard de 6 à 5 étapes, écran de fin déplacé dans `wizFinish`, déclenché par la confirmation du
staff. `sendCodesWithRecap` (158 l.) et `renderRecapMailBlocks_` retirées d'`Indispos.gs`. Les
autres envois restent : outil de Maintenance, et arrivée d'un nouveau MAR.

Banc : `banc_w1_fin_staff.js`, 20 vérifications, **contre-épreuve faite** — rejoué sur l'ancien
code, il tombe à 11 échecs. Total 2 913 vérifications, 0 échec. Une assertion de `banc_docs.js`
visait la phrase exacte du guide au lieu de l'exigence : elle serait tombée en rouge pour un
texte devenu plus juste. Recentrée sur ce qui doit rester vrai. **Sixième cas de test figeant
une valeur plutôt qu'une exigence.**

Site v1.8.0 → v1.9.0. Documentation mise à jour dans le même lot : `guide-comite.html`,
`guide-technique.html`, `roadmap.html`.

---

## 10/09/2026 — la garde de 18h ignorait les dates d'arrivée et de départ

Le générateur a cinq fonctions qui décident si un MAR est disponible un jour donné. QUATRE
vérifiaient les bornes `date_debut` / `date_fin` de MEDECINS : `indispoIndividuelle` (les
gardes), `structAvail` (les cibles), `_rDispo` et `_rPresents` (les récups). La cinquième,
`dispo18`, ne les vérifiait pas. Trouvé AVANT la génération de 2027, pas après.

Mesuré sur une année complète, trois profils simulés : **20 soirées de 18h attribuées à
quelqu'un qui n'était pas dans le service ce jour-là.** Le problème n'est pas la case en trop
sur le planning — ces soirées étaient comptées comme POURVUES, et personne ne serait venu.

**Deuxième correctif, même section.** Le poids dans le partage des 18h ne dépendait que de la
quotité. Un MAR présent deux mois visait une année pleine et se faisait servir en premier pour
rattraper : 114 poses pour mille jours ouvrés de présence contre 46 pour un temps plein. Le
poids est multiplié par la part de l'année réellement passée dans le service, via
`structAvail` — pas une seconde notion de « présent ».

| | avant | après |
|---|---|---|
| Arrivée en cours d'année | 114 | 46 |
| Retour de congé long | 43 | 38 |
| Soirées hors fenêtre | 20 | 0 |

Convention rappelée : `date_fin` est le **premier jour NON travaillé**, le code teste partout
`date >= date_fin`. Les cibles de gardes sont proratisées par `PCT_GARDES` × part de présence,
les 18h par `QUOTITE` × part de présence — deux colonnes distinctes, deux usages, c'est voulu.

Banc : `banc_18h_fenetre.js`, 21 vérifications, **deux contre-épreuves** — le scénario est
rejoué sur une copie du générateur privée de chaque correctif et doit échouer.

### Ce que ce défaut révèle et qui n'est pas traité

Le rapport réel des profils `ONLY_18` reste à **1,17 au lieu de 1,30**. `RATIO_18` répartit
1,3 part sur le pot entier, mais **40 vendredis par an vont d'office au MAR de garde du
samedi** — donc fermés à qui ne prend pas de gardes. Deux règles justes qui se contredisent au
croisement. Piste retenue : une colonne `PCT_18` dans MEDECINS, sur le modèle de `PCT_GARDES`,
et une cible calculée sur les soirées **atteignables**. Décision de service à prendre d'abord :
le 18h reste-t-il une charge tirée à l'année, ou devient-il une conséquence de l'affectation ?

Non traité non plus : le poids ignore les jours fixes non travaillés (`tp_jours_fixes`), même
famille de défaut.

### PROJET — la seconde ligne de 18h (décidé le 10/09, à faire avant la génération de novembre)

**Décision prise :** à partir d'une date de bascule (1er avril 2027 prévu, ouverture du nouvel
hôpital), il faut DEUX MAR de 18h par jour au lieu d'un. **Même travail pour les deux**, aucune
distinction de poste à faire apparaître au planning. Une hypothèse antérieure — « les MAR de 18h
sont les MAR du bloc long eux-mêmes » — est ABANDONNÉE : le 18h reste une charge tirée à l'année.

**Une seule génération, un seul onglet, bascule automatique.** `generateGardes(2027)` produit les
gardes inchangées, une ligne de 18h jusqu'au 31/03, deux ensuite. L'équité se compte sur
l'ensemble de l'année. NE PAS générer la seconde ligne à part : les règles de `dispo18` seraient
réécrites ailleurs et finiraient par diverger (le générateur porte déjà cet avertissement, écrit
après un vrai défaut de production), et l'équité ne serait pas comptée.

**Contrainte de calendrier.** Ce lot doit passer AVANT la génération de novembre : une année
publiée ne se régénère pas.

#### Ce qui a été mesuré avant de décider (10/09, générateur réel, année 2027 complète)

| | |
|---|---|
| Soirées ouvrées dans l'année | 251, dont 190 à partir du 01/04 |
| Avec la seconde ligne | **441 soirées**, soit 18 par MAR au lieu de 10,5 |
| Vivier éligible chaque soir, 01/04 → fin | min 15 · médiane 17 · max 18 |
| Soirées où le vivier tombe sous 5 | **0** |
| Charge induite par le plafond « 1 par semaine » | 0,4 par MAR et par semaine — **non contraignant** |

Le plafond n'est donc PAS à desserrer. Estimation initiale contraire (« presque une par semaine
sans marge ») : fausse, elle divisait par les 22 preneurs de gardes au lieu des 24 éligibles.

**Effet de bord favorable sur les vendredis.** Sur 251 soirées, seules 211 passent par le vivier
général : les 40 autres sont les vendredis attribués d'office au MAR de garde du samedi, donc
fermés à qui ne prend pas de gardes. Avec deux places, ces vendredis en réservent une et
**libèrent l'autre** — la part inaccessible tombe de 16 % à ~7 % du pot annuel. Le rapport réel
des profils `ONLY_18` (1,17 au lieu de 1,30) devrait remonter d'autant. **À REMESURER après
coup, pas à prédire.** En conséquence, la colonne `PCT_18` passe EN ATTENTE : une partie de
l'écart qu'elle devait corriger se corrige seule.

#### Périmètre du lot

- un paramètre **daté** dans CONFIG (type `LIGNES_18H = 2027-04-01:2`), sur le modèle de
  `CONFIG_TRANSITION` — pour que la date se déplace sans toucher au code si l'ouverture glisse ;
- `h18A[date]` passe d'un nom à une liste ; les cibles doublent à partir de la date ;
- les règles deviennent « par soirée » : deux personnes différentes le même soir, jamais deux
  soirs de suite pour la même, la paire à éviter valable sur les deux places ;
- vendredi : une place réservée au G du samedi, l'autre au vivier général ;
- affichage du planning, export Excel et rapport d'essai doivent montrer DEUX noms ;
- scénario de banc : avant/après bascule, couverture complète, contre-épreuve.

Touche des pages visibles → **montée du 2e chiffre de version du site**.

#### À embarquer dans le même lot (coût faible, sinon le lot est invendable)

Aujourd'hui le 18h n'a **ni cible affichée, ni cible stockée, ni report d'une année sur l'autre** :

- le rapport d'essai montre le nombre de 18h SANS sa cible, contrairement aux gardes — impossible
  de savoir en lisant si 13 contre 9 est juste (c'est le cas : quotités différentes) ;
- STATS_GARDES a une colonne `18H` mais **pas** de `CIBLE 18H` ;
- la somme des cibles fait 254 pour 251 soirées : chaque cible est arrondie dans son coin, sans
  la méthode des plus forts restes appliquée aux gardes. Trois personnes en écart perpétuel de −1 ;
- aucune dette inter-annuelle : un −1 sur les 18h est perdu pour toujours (les gardes, elles,
  reportent par axe).

Mesuré le 10/09 : le placement lui-même est SAIN — 21 MAR sur 24 exactement sur leur cible, trois
à −1, écart maximal 1. Le risque n'est pas la dérive du placement, c'est qu'à 18 soirées par an
un écart de 1 ou 2 se ressente et qu'on n'ait **aucun moyen de montrer qu'il est juste**.

#### Questions laissées ouvertes

- Les 18h doivent-elles entrer dans l'arbitrage GLOBAL de la charge, ou rester un compteur à
  part ? Les deux compteurs vivent aujourd'hui côte à côte sans se parler. À 10 soirées par an
  c'était secondaire ; à 18, ça ne l'est plus. À décider en regardant la première génération.
- Report inter-annuel des écarts de 18h : plus lourd, à traiter séparément.

### Deux chantiers ouverts par la même journée

- **La borne ne s'applique pas à l'écran de saisie des indisponibilités.** Le calendrier reste
  ouvert toute l'année pour un MAR dont le contrat s'arrête en cours d'année, et le serveur
  accepte l'écriture. Les jours posés au-delà sont inoffensifs — le générateur les ignore —
  mais ils faussent les compteurs et le taux de complétion. Maquette validée : jours estompés
  via la classe `hors-portee` qui existe déjà, navigation coupée au dernier mois utile, refus
  côté serveur dans `saveIndispos` (l'écran peut retarder, le serveur tranche).
- **Une seconde ligne de 18h est envisagée en cours d'année 2027.** Elle ferait passer le pot
  de 252 à 442 soirées, soit 21 par MAR au lieu de 12. Ne PAS la générer à part : les règles
  de `dispo18` seraient réécrites ailleurs et finiraient par diverger, et l'équité ne serait
  pas comptée. Piste : un paramètre daté disant combien de 18h par jour, une seule passe.

## 07–08/09/2026 — migration complète et retrait de toute donnée nominative

Le service informatique de l'établissement valide le projet mais refuse d'en porter la
responsabilité. Tout ce qui reliait le portail à l'établissement devait donc disparaître, et la
responsabilité des données basculer sur une personne. Le dépôt d'origine était public depuis des
mois : c'était lui l'exposition, pas le classeur.

### Ce qui a bougé

Comptes neufs : `planningmedic@gmail.com`, GitHub `planningmedic`, Cloudflare `planningmedic`.
Copie du classeur maître sur le nouveau compte — une copie, pas un transfert de propriété, pour
repartir avec un historique de versions vierge. Dépôt **créé vide**, sans reprise d'historique :
la réécriture d'un historique public ne garantit rien, seule la suppression du dépôt d'origine
efface les 646 mentions de l'établissement et le logo.

Retiré du dépôt public : le logo officiel de l'établissement et les 77 noms de praticiens du
générateur de comptes rendus (module supprimé), l'adresse postale imprimée sur le devis patient,
la liste `DOCTORS` (25 noms), `DVI_ALLOWED` (3 noms), les tests `id === '<initiales>'` (15 occurrences),
et 517 occurrences de noms réels dans les jeux d'essai et la documentation.

### Trois mécanismes construits pour cela

| avant | après |
|---|---|
| `only:'<initiales>'` sur 5 tuiles + `CRH_ALLOWED` / `STATS_ALLOWED` côté serveur | `CONFIG / TUILES_PRIVEES`, lue par l'écran **et** par le serveur |
| `DVI_ALLOWED = [3 noms]` | `CONFIG / DVI_HABILITES` |
| `id === '<initiales>' ? 'Pr ' : 'Dr '` et `wish: id === '<initiales>'` | listes `titresPr` et `souhaitsPlafond`, déduites des colonnes NOM et `souhait_plafond` |

Les deux listes voyagent par **les deux chemins d'identité** — copie rapide et connexion au
serveur. Le précédent `libAdmin` n'existait que d'un côté : une tuile qui apparaît quand le relais
répond et disparaît quand il tombe est pire que pas de tuile du tout.

### Le repli silencieux supprimé

`getDoctorsFromMedecins()` retombait sur la liste figée quand MEDECINS était illisible : un onglet
momentanément inaccessible faisait publier un planning bâti sur un effectif périmé, sans alerte.
Elle échoue désormais franchement. Un écran d'erreur se voit ; un planning faux, non.

### L'essai à blanc devient le seul écran

`essaiGenerationGardes` ne crée aucun onglet : ce qu'elle n'affiche pas est perdu. Le rapport
passe de six écarts à sept sections — charge par médecin **avec les cibles en face**, souhaits
honorés/posés, nuits de fêtes, et vérification que la règle des paires a tenu (18 h compris).
Rien n'est recalculé : ce sont des variables que la fin du calcul jetait.

### Chantiers ouverts, par ordre d'importance

1. ~~**Le calcul à blanc ne prédit pas la génération réelle quand l'effectif n'est pas
   trié.**~~ **NON REPRODUIT le 10/09/2026 — diagnostic probablement erroné.** Onze
   configurations essayées, zéro écart : effectif trié, une ligne déplacée en fin, ordre
   inversé, huit permutations aléatoires, trois calculs à blanc enchaînés dans un même
   contexte, et un essai suivi d'une vraie génération. Explication la plus probable : le
   correctif du 05/09 a supprimé la dépendance à la position des lignes — à égalité, c'est un
   hachage du NOM qui départage. Or le 08/09 les jeux d'essai ont été **renommés**, pas
   réordonnés, et changer les noms change le hachage donc le planning. L'écart lu comme une
   divergence blanc/réel était vraisemblablement une comparaison entre deux jeux de noms.
   **Conséquence : l'ordre de l'onglet MEDECINS n'a pas d'importance.** Réserve : les données
   du 08/09 n'ont pas été retrouvées, la démonstration est indirecte.
2. **W2 ne voit pas les temps partiels.** Son contrôle bloquant ne compte que les jours
   `INDISPO` : les TP, VAC, FORM et CL sont invisibles, et la règle « pas de garde la veille d'un
   temps partiel » — qui ferme le dimanche quand le lundi est en TP, donc l'unité VD entière —
   n'y est pas modélisée. Mesuré le 10/09 sur un jeu saturé : W2 annonçait 50 week-ends VD
   disponibles là où le générateur n'en voyait que 9, sur le même MAR et les mêmes données. Tout
   vert, zéro profil bloquant. Deux défauts mineurs visibles au passage : les MAR sans garde sont
   dans le dénominateur et reçoivent une cible VD qu'ils ne feront jamais, et le dénominateur
   n'est pas proratisé par la présence depuis le correctif du 10/09 — W2 et le générateur ont
   donc divergé. **Sans danger aux volumes réels** (il faut plus de 30 TP sur un même jour de
   semaine pour que ça morde) : c'est un défaut de cohérence entre deux calculs de la même chose.

3. **Le relais écrit puis efface 9 clés de l'année 2028 à chaque synchronisation**, soit environ
   430 opérations inutiles par jour sur un plafond gratuit de 1 000. Le constructeur et la purge
   ne s'accordent pas sur ce qu'est une année valide. Défaut antérieur à la migration.
4. **Un souhait posé sur un jour interdit par le profil compte comme non honoré.** Un profil
   `no_garde` peut poser des souhaits de garde ; un profil `no_weekend` peut en poser le samedi.
   Le taux affiché est pessimiste et incompréhensible pour l'intéressé. Deux pistes : empêcher la
   saisie, ou ne compter que les souhaits honorables. La tuile des indisponibilités devrait par
   ailleurs disparaître pour qui n'a ni garde ni temps partiel à poser (deux MAR, par leurs initiales).
5. **Le module libéral n'a pas été repensé.** L'en-tête du devis est devenu un champ à compléter,
   mais 21 mentions de Monaco subsistent — mutuelles CCSP, ordonnance souveraine, coefficient
   1,95 : ce sont des règles tarifaires d'un pays, non des références à un établissement.
6. **Volet juridique.** Loi n° 1.565 du 3 décembre 2024, autorité APDP. Points à faire trancher
   par un juriste : la qualité de responsable de traitement s'apprécie en fait, pas par
   déclaration ; le consentement de subordonnés à leur chef de service est fragile par
   construction. Documents à produire : registre des traitements, mentions légales, note
   d'information individuelle.

### 09/09/2026 — la racine sert le portail

`dashboard.html` devient `index.html`, l'ancienne `index.html` (le planning) devient
`planning.html`. L'adresse à dicter aux MAR passe de
`planningmedic.github.io/dashboard.html` à **`planningmedic.github.io`**.

258 liens réécrits dans 45 fichiers. `manifest.webmanifest` démarre sur `./`, et le cache du
service worker monte en `pm-sw-v2` pour que les appareils rechargent au lieu de servir l'ancien.

Un `dashboard.html` de redirection est laissé en place : filet pour les favoris, les liens déjà
envoyés et les icônes installées avant le changement. Il ne contient aucune logique. À supprimer
quand les statistiques d'usage montreront que plus personne n'y arrive.

Deux tests figeaient une valeur au lieu de garder une exigence — le quatrième et le cinquième
cas en deux jours. `banc_notif` vérifiait `VERSION = 'pm-sw-v1'` ; il vérifie maintenant que le
cache porte un numéro et qu'il a monté. `banc_liberal` visait le nom du fichier de sortie ; il
vise la sortie elle-même.

### Reste à faire

Supprimer l'ancien dépôt, l'organisation `chpg-anesthesie` et l'ancien Worker. **Le compte Google
d'origine attend une semaine de fonctionnement réel** — il porte le classeur, les archives et les
fichiers du planning. Vider `INDISPOS_2027` de son jeu d'essai **avant le 10 octobre**.

---

## 06/09/2026 — l'axe fériés, la saisie des indispos refondue, et la cloche muette

Cinq commits : `9976767a`, `5bc1a8a9`, `3be879be`+`a8a7e063`+`e7c60821`+`38e8467e`, `8c59bc7a`.
Site **v1.2.1 → v1.3.3**. Banc **2 690 → 2 727 vérifications, 0 échec**.

### 1. Le sixième axe : les jours fériés (v1.2.0, puis v1.2.1)

Le générateur surveille SIX axes ; l'écran n'en montrait que cinq. La colonne `CIBLE JF`
(23e de `STATS_GARDES`) est écrite par le générateur depuis toujours, mais aucun lecteur ne la
servait au front : `getStats`, les deux lecteurs de `Indispos.gs` et celui de la copie rapide
s'arrêtaient à la colonne 21. La barre « JF » était donc tracée contre une **moyenne d'équipe**,
pas contre une cible — un repère qui ne dit rien de la justice de la répartition, et qui
s'affichait avec une décimale faute d'être un entier.

`cJf` est servi de bout en bout ; l'axe entre dans le certificat, dans le verdict de chaque
ligne et dans la barre. `code.gs`, `Indispos.gs` et `miroir.gs` passent en `2026-09-05.1`.

**Mesuré, contre la crainte que l'axe fasse apparaître du rouge** : sur l'essai mené dans Apps
Script avec les absences réelles, le pire écart sur les fériés est de **une garde**, aucun
dépassement ; sur 45 années simulées, **une seule année** dépasse 2 sur cet axe. La confusion
venait de moi : les « 17 dettes non résorbées » sont un CUMUL sur cinq ans, pas un écart annuel.

**Défaut introduit dans la foulée, attrapé AU RENDU et pas à la lecture** : les années dont
l'onglet s'arrête avant la colonne — 2026 — affichaient « 2 /0 » **en rouge**. L'absence de
cible était lue comme une cible à zéro, donc comme un dépassement : une accusation fabriquée,
sur l'écran que toute l'équipe consulte. Sans cible, la barre est neutre.
→ **Le lot avait vérifié les LECTEURS de la donnée, pas ce que la page en fait.**

La sonde du diagnostic ne contrôle la colonne 23 que si elle EXISTE : l'exiger sur 2026 ferait
hurler le diagnostic sur une année qui n'a rien à se reprocher.

### 2. La saisie des indisponibilités refondue (v1.3.0 → v1.3.3)

La page sert à toute l'équipe du 10 au 30 octobre. Refonte VISUELLE seule — chargement,
sauvegarde, glisser-déposer, règles de refus et gestion des conflits sont intacts, le banc le
vérifie explicitement.

  · la barre d'outils était EN HAUT : il fallait remonter à chaque changement. Elle passe SOUS
    le calendrier, collante, boutons pleine largeur — la cible du doigt passe de 26 à 44 px ;
  · la couleur d'un jour tenait dans une pastille de trois lettres au milieu d'une case
    blanche : elle REMPLIT la case. Les jours posés au staff portent un cadenas ;
  · un refus s'affichait en toast, disparu en deux secondes, souvent avant la fin du geste :
    il s'écrit sous le calendrier et y reste ;
  · avec l'outil temps partiel actif, week-ends et fériés s'estompent — le refus se voit AVANT
    le geste. La règle elle-même ne change pas ;
  · les quotas deviennent des JAUGES : congés et formation sur une ligne, temps partiel sur la
    sienne (seulement si le profil a un quota), indispos et gardes souhaitées en simples
    comptes sous un filet — elles n'ont pas de plafond, une jauge mentirait.

**Quatre retours d'usage, essayés sur téléphone** (campagne 2027 ouverte quelques minutes) :
la gomme réduite à une icône n'était reconnue par personne — elle a été cherchée alors qu'elle
était sous les yeux, elle reprend son mot ET une icône ; les compteurs débordaient en trois
plus un de largeurs inégales ; la case restait haute et vide, elle devient carrée ; et les
100 px sous le calendrier, réservés au bouton Sauvegarder du temps où les outils étaient en
haut, ne faisaient plus que creuser un trou — d'autant plus visible sur un mois de cinq
semaines.

**Le quota de FORMATION** existait dans `CONFIG_CONGES` et était déjà servi à la page : personne
ne le lisait. On voyait « 6 jours » sans savoir s'il en restait.

### 3. La cloche ne notait rien depuis le passage au canal par rôle

**Défaut vu en production.** Le staff du 04/09 a reçu « Votre planning 2027 est disponible » sur
les téléphones — la notification n'est jamais apparue dans la cloche.

`_notifJournalNoter_` commençait par `if (cible && cible.role) return;`, un garde-fou destiné au
canal du COMITÉ, qui n'a pas de cloche. Il écartait en réalité TOUS les rôles — dont
`role:'mar'`, celui de la génération des gardes, c'est-à-dire **la notification la plus
importante de l'année**. Rien ne pouvait le révéler : le push, lui, arrivait bien.
Preuve : `NOTIFS_JOURNAL` ne contenait que deux lignes, du 25/08, écrites quand l'appel
utilisait encore la cible `*`.

**Pourquoi le banc n'avait rien vu** : il testait `{role:'admin'}` et vérifiait qu'il n'allait
PAS à la cloche. Il ne pouvait pas distinguer « on écarte le comité » de « on écarte tous les
rôles ». Trois vérifications couvrent désormais `role:'mar'`.

Les notifications déjà envoyées ne sont pas rattrapées : elles n'ont jamais été écrites.
`miroir.gs` → `2026-09-06.1`.

### 4. Décisions de conception prises ce jour

- **La tuile temps partiel** garde son fonctionnement ; seul le visuel sera repris, dans la même
  direction que la campagne. Ses six états doivent se DISTINGUER : « tendu » (jaune, un jour du
  service encore ouvert mais serré) et « demandé » (violet pâle en pointillés + horloge, VOTRE
  jour en attente du comité) portaient la même couleur dans une première maquette.
- **W1 n'envoie aucun mail** : ses étapes 1 à 4 créent l'onglet et activent la campagne ;
  l'envoi des codes est l'étape 6, déclenchée par un bouton. Ouvrir la campagne pour regarder
  une page, puis la refermer, est sans effet de bord — `setIndisposYear` / `clearIndisposYear`
  n'écrivent qu'une ligne de CONFIG.


## 05/09/2026 — le nouvel algorithme de gardes, et l'écran d'équité refait

Journée en six commits : `67803951`, `1a53a068`, `a3a35084`, `e2678fdc`+`723da5d5`, `ab810462`,
`cc024d39`, `d2ab072b`. Site **v10.8.3 → v1.1.2** (voir « retour à v1.0 » plus bas).
Banc **2 528 → 2 690 vérifications, 0 échec**, deux scénarios nouveaux.

### 1. Le générateur — quatre mécanismes d'un bloc (`generateur_gardes.gs` 2026-09-05.1)

Sous l'interrupteur `NOUVEL_ALGO_GLOBAL`, qui ramène l'ancien comportement en une ligne.

1. **Cibles ENTIÈRES** par la méthode des plus forts restes. Une part de 5,4 samedis n'est
   atteignable par personne : chacun était toujours en écart, et l'écart mélangeait l'injustice
   réelle et l'impossibilité arithmétique. La somme des cibles reste exactement le nombre de gardes
   à poser — arrondir chacune dans son coin promettait 6 jeudis de trop et laissait 6 fériés sans
   propriétaire (mesuré). Le report de dette est **plié dans la cible** et `dette` remis à zéro
   pour que `ratio()` ne l'applique pas deux fois.
2. **Numéro de tirage** : à égalité parfaite, l'ordre de l'onglet MEDECINS ne tranche plus (il
   déplaçait près d'une garde sur trois). L'ordre vient d'un hachage(nom, tirage) ; rejouer le même
   tirage redonne le même planning. L'onglet n'est jamais modifié.
3. **Multi-départ** : jusqu'à 8 calculs à blanc, on écrit le meilleur ; règle d'arrêt à une garde
   d'écart. Critère de choix, dans l'ordre : jours sans binôme, axes au-delà de 2, pire écart.
   En pratique **un seul tirage suffit dans 25 années sur 45**.
4. **Optimiseur §8c** : objectif **lexicographique** (supprimer tout écart ≥ 2 avant d'affiner la
   moyenne, poids 600) et **interdiction dure de deux week-ends d'affilée**, posée dans `blocked()`
   à la construction — les enchaînements ne naissaient pas dans l'optimiseur mais dans la pose, qui
   n'avait aucune règle de week-end. Le poids reste SOUS les 1000 de la règle des week-ends : à
   3000, l'équité l'écrasait (48 enchaînements par an au lieu de 2).

**Mesuré** — 45 années (9 scénarios × 5 ans, dette cumulative injectée hors code) : **44 années sur
45 où personne ne dépasse une garde d'écart** sur les six axes, contre 29 sur 45 avant. Zéro journée
sans binôme. Gardes rapprochées inchangées (17,8 % d'intervalles de 2 jours contre 17,7 %).
Souhaits 75,3 % contre 76,6 %.

**Éprouvé dans Apps Script**, sur les absences RÉELLES du service complétées par quotité (420 jours
ajoutés sur 14 MAR) et 161 souhaits, dans une COPIE du classeur : 364 journées toutes pourvues,
y compris le 27/12 et les 17-18/04 où il ne restait que 3 gardeurs sur 20 ; **un seul MAR à 2 gardes
d'écart** (AUBERT, et c'est le prix de ses 25 mardis demandés) ; **121 souhaits honorés sur 161** ;
un seul binôme VD cassé sur 52, en dernier recours le 17/04.

**Deux pièges rencontrés, à ne pas refaire :**
- un onglet INDISPOS collé sans ses **trois lignes d'en-tête** (mois / initiales / numéros) fait
  lire la 3ᵉ ligne comme des numéros de jour : presque toutes les dates sont perdues et les deux
  premiers MAR ignorés. Le premier essai a donné un résultat parfait… sur une année quasiment sans
  absences. `reconstruireDatesHeaders` lit `data[0]` pour le mois et `data[2]` pour le jour, les
  MAR commencent en ligne 4.
- un souhait de PERRIN tombé un **8 décembre** (Immaculée Conception, férié local) n'est pas
  honoré : le régime `souhait_plafond` exclut week-ends et fériés. Ce n'est **pas** un défaut —
  43 mardis sur 43 possibles, total exact à 44, complément posé un mercredi.

### 2. L'écran d'équité — un calcul faux corrigé, et une refonte

**Défaut vu EN PRODUCTION** : l'écran 2026, ouvert à toute l'équipe, annonçait « 19 MAR sur 20
dépassent 2 gardes d'écart », nommément. Vérification dans le classeur : la colonne CIBLE promet
**730,8 gardes pour 707 posées**, et **103,7 samedis pour 91**. La différence, ce sont les gardes
assurées par un **médecin extérieur au service**, absent de la liste. Tout le monde apparaissait
~1,7 garde trop bas : GARNIER, AUBERT et SABLON signalés alors qu'ils sont pile à leur part, LEMAIRE à
+2,1 absent de la liste, FAUVEL à +6,7 et non +5,0.

**Le contrôle qui prouve l'anomalie sans rien supposer** : une mesure d'équité juste a des écarts
qui **s'annulent**. Ceux de 2026 totalisaient −23,8.

**Correction** (`ciblesEquite`, même fonction dans `admin.html` ET `planning.html`) : les gardes
réellement posées sont réparties en cibles **entières**, par plus forts restes — la même méthode que
le générateur. Au-delà de 1 % d'écart entre la somme des cibles et les gardes réparties, la mention
d'explication s'affiche : la correction n'est **jamais** silencieuse. En deçà, rien n'est touché —
une garde manquante isolée doit rester visible, pas lissée sur tout le monde.

Sur 2026 : cible d'un temps plein **35 gardes, 5 samedis**. FAUVEL +6, SUBLET +6, PELLETIER −4
jeudis. **17 MAR au-delà de 2** au lieu des 19 affichés.

**Refonte de la mise en page** : des NOMBRES DE PERSONNES au lieu de deux cartes affichant le même
pourcentage ; un classement trié et replié à cinq lignes au lieu d'un mur de dix-neuf noms en prose ;
l'histogramme retiré (sa légende « la masse doit être à gauche » était contredite par les données) ;
**une ligne par MAR** — nom, une case par axe, écart le plus fort — dépliable au clic, la carte du
MAR connecté ouverte d'office et en tête ; grille sur une seule colonne ; textes raccourcis.

`morphGrid` ne peut plus rapprocher deux rendus (le nombre de lignes change selon l'état replié) :
il renvoie `false` de lui-même et le remplacement complet prend le relais — voulu, pas un repli
silencieux.

### 3. Retour à v1.0 (décision d'Arthur, 05/09)

`v10.8.3 → v1.0.4`. **Le numéro DESCEND, volontairement et une seule fois.** La série v1.x était
montée à 99 non parce que le portail avait changé 99 fois de visage, mais parce qu'on montait le
2ᵉ chiffre à chaque lot ; passer à v10 n'avait fait que déplacer le problème. **v1.0 = la version
présentée au staff du 4 septembre**, celle que l'équipe utilise. **v2.0 est réservé au module
libéral.**

Conséquence : **un numéro ne peut plus dater une fonctionnalité.** Deux contrôles du banc le
faisaient (`banc_cloche.js` « au moins v1.77 », `banc_stats_ecran.js` « a dépassé v1.95 ») ; ils
vérifient désormais la présence de la fonctionnalité et la forme du numéro.

### 4. Lanceurs temporaires d'essai (`setup_annee.gs` 2026-09-05.2)

`T()` → `comparerAlgorithmes(2026)`, `T7()` → 2027 : deux calculs à blanc de la même année, ancien
et nouvel algorithme, six écarts côte à côte. Aucune écriture, aucune notification.
`W1_2028()`, `W2_2026()` : **à n'exécuter que dans une COPIE du classeur** — `W2_2026` efface le
planning que l'équipe consulte et notifie tous les MAR abonnés. `TEST_W2` visait 2029 alors que
`TEST_run` remplit 2028 : enchaîner les deux générait une année VIDE sans que rien ne le signale.
**Tous ces lanceurs sont à retirer une fois 2027 publié.**

### 5. Reste à faire, dans l'ordre

- **Axe JOURS FÉRIÉS absent de l'écran d'équité.** Le générateur surveille six axes ; l'écran n'en
  affiche que cinq — total, samedis, jeudis, VD, veilles de férié. La cause : `getStats`
  (`code.gs` l. ~824) et les lecteurs de `Indispos.gs` / `miroir.gs` lisent les colonnes 1, 17, 18,
  19 et 21 de `STATS_GARDES`, jamais la **22 (`CIBLE JF`)**. La barre « JF » des cartes est donc
  tracée contre une *moyenne d'équipe*, pas contre une cible, et le certificat ignore l'axe.
  **C'est exactement l'axe où le nouvel algorithme laisse son résidu** (17 des 38 dettes non
  résorbées y sont). Chantier : servir `cJf` jusqu'au front, puis l'ajouter à `AX_EQUITE`.
- **Dette cumulative** — inutile avant novembre 2027 (compteur vide en 2027), mais indispensable
  ensuite. Demande **six colonnes ajoutées EN FIN** de `STATS_GARDES` (positions 26-31) pour
  conserver la cible *exacte* fractionnaire : ajouter en fin est sûr, tous les lecteurs existants
  lisent par index fixe jusqu'à 24 et `Indispos.gs` l. 260 ne contrôle que 0, 1, 17, 18, 19, 21.
  Mesuré : dérive à 20 ans **8,70 → 3,1-3,9**, résidu concentré sur veilles de férié et fériés.
- **Section 12 du guide algo** (la dette) à reformuler quand elle sera codée — son contenu actuel
  reste exact, autant n'y revenir qu'une fois.
- **`banc/node_modules` n'est pas ignoré par git.** Signalé, pas traité.
- **Jetons en clair dans l'onglet CONFIG** (GitHub, Anthropic, codes d'accès). Ils sortent dès qu'on
  exporte ou copie le classeur — c'est arrivé le 05/09 via le connecteur Drive. Leur place est dans
  les propriétés du script, qui ne sont ni exportées ni copiées.

⚠️ **Ces numéros sont ceux du DÉPÔT, pas ceux de l'éditeur Apps Script.** Ce qui fait foi sur ce
qui tourne vraiment, c'est la sonde « Code déployé vs dépôt » du 🔍 Diagnostic, qui compare les
constantes `GAS_VERSION_*` réellement en mémoire aux dix fichiers du dépôt. Sonde muette = tout est
recopié. Indice partiel relevé le 03/09 : `LOGS` du 02/09 porte des lignes
« avertissement 1/4 · 2027 : … », donc le lot du 01/09 (`Indispos.gs` 2026-09-01.3) **était**
déployé ce jour-là. Pour les lots du 03/09, seul le Diagnostic peut répondre.

✅ **28/08 (soir) — relecture de l'échéancier dans le code, deux points périmés retirés.**
Demandé par Arthur après qu'une liste récitée de mémoire s'est révélée fausse.

- **« Corriger l'échange de gardes adjacentes » : déjà fait le 12/08.** `Indispos.gs`, cas
  `echangeGardeJours`, branche dédiée quand les deux dates se suivent : préconditions strictes sur
  l'état de départ, contrôle des vraies adjacences **à l'arrivée** (veille du premier jour,
  surlendemain du second), contrôle de disponibilité, puis écriture des six cellules de l'état
  final. Couvert par `banc_gestes.js` : trois cas nominaux, cinq refus, une non-régression sur
  l'échange non adjacent. Le transfert du R est câblé au don et à l'échange (`_transfererR_`,
  règle « exactement un des deux jours est un samedi » ; samedi↔samedi ne bouge rien).
- **« Le générateur doit porter la correspondance samedi→R pour 2027 » : déjà fait.**
  `LIENS_R_{année}` est recréé à chaque génération, en format texte forcé. 2026 n'en a pas —
  cette année-là a été générée avant la fonctionnalité — et le cas est traité proprement :
  motif explicite « année d'avant le lien », l'échange reste valide, le comité replace.
- **Deux alertes déjà automatiques, rien à surveiller à la main** : jeton GitHub (`Indispos.gs`,
  ⚠ à 30 jours, ❌ à 10) et fraîcheur de l'index CCAM (`admin.html`, seuils 8 et 14 mois, lecture
  des seules métadonnées par requête HTTP Range ; effet 2026-07-03 → l'alerte tombera seule en
  mars 2027).
- **Toujours vrai** : le mécanisme `tp_jours_fixes` est encore là (six occurrences dans le
  générateur), à retirer après le 4 septembre.

⚠️ **Le chantier des secteurs en dur était mal chiffré** : « cinq blocs dans `admin.html` » était
faux dans les deux sens. Il y en a **neuf**, répartis sur **quatre fichiers**. Inventaire exact
ci-dessous, dans l'entrée du chantier.

⚠️ **Leçon de méthode** : une liste de tâches récitée depuis un document n'est pas un constat.
Trois des points de l'échéancier étaient faux ou périmés, et personne ne s'en serait aperçu avant
de commencer le travail. Un chantier se revérifie dans le code avant d'être planifié.

✅ **RIEN EN ATTENTE au 28/08 (soir).** `code.gs` **2026-08-28.1** recopié dans l'éditeur Apps
Script et déployé en nouvelle version — **confirmé par le Diagnostic**, dont la sonde « Code déployé
vs dépôt » compare les constantes `GAS_VERSION_*` réellement en mémoire avec celles du dépôt, les
dix fichiers. Sonde muette = tout est recopié. C'est ce contrôle qui fait foi, pas le fait d'avoir
poussé.

ℹ️ **L'alerte « Interrupteurs des mails » est ATTENDUE jusqu'au 4 septembre.** Elle se déclenche
quand `NOTIF_ACTIVE = O` **et** que `NOTIF_EMAIL_TEST` est encore posée, et annonce que les MARs ne
reçoivent rien. C'est exactement l'état voulu avant la démonstration : le filet de sécurité. La
sonde ne peut pas deviner que c'est délibéré, et c'est très bien ainsi — le jour où la redirection
sera oubliée, elle criera de la même façon. Elle s'éteindra à la dernière étape de la séquence du 4 :
supprimer `NOTIF_EMAIL_TEST`. **Aucune autre conversation ne doit la traiter comme un défaut.**

✅ **28/08 (soir) — le mail « Votre planning a changé ».** Commit `6401c1a5`, `code.gs`
**2026-08-28.1**, banc **2063**. Trois choses dans le même lot.

1. **Un mail annonçait « 18h — avant : 18h ».** Le diff compare le triplet statut/matin/après-midi,
mais `_notifDecrire` s'arrêtait au statut et n'affichait jamais le secteur. Un MAR resté en astreinte
18h dont le secteur passait de volant à réanimation recevait donc une carte qui n'apprenait rien.
Corrigé par une table explicite `NOTIF_STATUT_AVEC_SECTEUR = { '18': true }` — les gardes n'y
figurent pas, leur secteur est déduit et le répéter donnerait « garde réanimation — Réanimation ».
2. **Les cartes vides ne sont plus émises.** Même libellé ET même secteur des deux côtés → rien.
Cela supprime aussi les faux changements V→VAC, F→FORM, TP→CTP, qui partagent un libellé.
3. **Nouveau visuel** (proposition A, choisie par Arthur sur maquette) : pastille de date façon
agenda, matin et après-midi sur deux lignes séparées, résumé en tête, codes secteur écrits en clair.
Les libellés viennent de SECTEURS et CS_TEMPLATE, tous deux servis par le cache de configuration :
aucune lecture de feuille supplémentaire. Config illisible → codes bruts, jamais d'invention.
Gabarit 100 % `<table>` + styles en ligne : ni flex, ni grid, ni CSS externe, sinon Outlook casse.

Nouveau scénario `banc/banc_mail_change.js` (39 vérifications, dont la fenêtre d'annonce des
secteurs). Contre-épreuve sur la version en ligne : `_notifDecrire(['18','REA','REA'])` rendait
`"18h"`, et le mail ne contenait nulle part le mot du secteur.

✅ **28/08 (après-midi) — le badge « à placer » et les dates d'arrivée.** Commit `99157503`,
site **v1.91**. Côté GAS, un MAR n'est sorti du bloc « mois » que si sa période d'activité ne
recouvre AUCUN jour du mois. CHASTEL (`date_debut` **2026-09-28**, vérifié dans MEDECINS)
figurait donc dans tout le bloc de septembre, statut et secteur vides du 1er au 27 : la signature
exacte d'un « présent non placé ». Elle était réclamée « à placer » **19 jours ouvrés** avant sa
prise de fonctions, matin et après-midi. Symétrique pour un partant en cours de mois.
`nonPlacesJour` s'aligne désormais sur `statActive()`, convention de tout le reste de l'appli.
Même famille que le défaut du 01/08 sur la colonne ACTIF : autre colonne, même oubli.
Seul LC était concernée : ANCEL arrive un 1er du mois, TESSIER part un 1er du mois, tous deux sont
exclus proprement. Nouveau scénario `banc/banc_a_placer.js` (11 vérifications), contre-épreuve à
4 échecs. Rien à recopier côté Apps Script pour ce lot.

⚠️ **Leçon, quatrième défaut de la même famille** : **une exclusion faite à la maille du mois ne
protège pas à la maille du jour.** Vrai pour l'export Excel du matin, vrai pour le badge « à
placer » de l'après-midi.

✅ **28/08 (matin) — export Excel des semaines à cheval sur deux mois.** Commit `8f73c645`,
site **v1.89** (puis v1.90 dans la foulée, autre lot), Pages déployé (success). L'export choisissait
UN bloc « mois » pour les 7 jours puis lisait chaque jour par son rang dans ce bloc : sur une semaine
à cheval (S36, 31/08 → 06/09), les jours de septembre allaient chercher les jours d'août de même
rang — **décalage de 31 jours, totalement silencieux**. Mardi et mercredi tombaient sur un week-end
d'août (colonnes quasi vides, aucune absence) et les gardes affichées étaient celles du mois
précédent. L'écran, lui, était juste : `renderWeek` lit chaque jour dans SON mois depuis toujours.
Défaut présent depuis l'origine de l'export, ~11 semaines par an concernées, jamais signalé.
Corrigé en alignant l'export sur `renderWeek`. Nouveau scénario `banc/banc_export_excel.js`
(15 vérifications), contre-épreuve faite : 8 échecs sans le correctif. **Rien à recopier côté Apps
Script.** Vérifié en production par Arthur sur le fichier régénéré de la S36.

⚠️ **Leçon, troisième défaut de la même famille** (après le miroir maternité et les consultations
fusionnées) : **l'écran et le fichier ne lisent pas pareil**. Ce sont deux lecteurs distincts des
mêmes données. Une règle vérifiée à l'affichage ne l'est pas dans l'export, et réciproquement :
toute correction d'affichage doit être cherchée aussi dans `exportWeekExcel`.

✅ **RIEN EN ATTENTE au 27/08 (soir), soldé le 28/08.** `installerSentinelle()` a été exécutée
(confirmé par Arthur). Quant à `Indispos.gs`, il n'est plus en 2026-08-27.2 mais en
**2026-08-28.1** — l'autre conversation l'a modifié le 28 au matin (commit `be652a8f`, sonde relais
de la sentinelle). Le Diagnostic ne signale aucune dérive : c'est bien cette version-là qui tourne.

✅ **RIEN EN ATTENTE au 26/08 (soir).** Worker Cloudflare déployé, `generateur_gardes.gs`
2026-08-26.1 + `miroir.gs` 2026-08-26.1 + `Indispos.gs` 2026-08-26.2 recopiés et redéployés,
`miroirSyncComplet` passé — confirmé par Arthur.

✅ **RIEN EN ATTENTE au 23/08 (soir).** Le lot cloche (commit `c7dd7b68d3`) est déployé et testé
par Arthur dans la foulée : Worker recopié, puis `miroir.gs` **2026-08-26.1** **et** `echanges.gs`
2026-08-23.1 (qui attendait depuis le 14) en nouvelle version, puis `miroirSyncComplet`. Test du
canal vérifié sur téléphone : notification reçue, pastille « 1 » sur l'icône, effacée à l'ouverture
du dashboard, cloche vide (le test est exclu du journal, c'est voulu).

✅ **RIEN EN ATTENTE au 19/08 (midi).** `Indispos.gs` **2026-08-19.1** recopié et déployé le
19/08 au matin, **confirmé par le 🔍 Diagnostic de 11:12** ; site **v1.61** ; quatre commits dans
la journée (`c630ce2c85`, `ba8448b0e6`, `b2bebfaf4e`, `4e0a211fa4`). Historique du 17/08 : le **Worker** (2026-08-17.2), **`miroir.gs`**
(2026-08-17.4) et **`portail.gs`** (2026-08-17.3) sont déployés, `miroirSyncComplet` exécutée, et la
clé `LIBERAL_ADMIN` posée dans CONFIG — dans cet ordre, qui n'est pas négociable : Worker → `.gs` →
synchro. Dans l'autre sens, les pages demandent des clés qui n'existent pas encore et retombent en
silence sur l'ancien circuit.
**Vérifié à l'écran par Arthur** : diagnostic sans avertissement, la page du suivi affiche
« juillet 2026 » au lieu de « undefined », et surtout **la double déclaration au même jour, même
secteur, produit bien deux lignes** — le seul scénario où une erreur du jeton aurait écrit une
bêtise durable dans le classeur.

**Pour le reste, rien en attente.** Le Worker le 16/08 au soir ;
`Indispos.gs` deux fois, en 2026-08-16.1 puis en **2026-08-17.1** (verrou de clôture), recopié et
déployé le 17/08 dans la foulée du push. **Confirmé par Arthur au diagnostic après la première
recopie : le bloc « Version du site » ne sonne plus en rouge.** C'est le contrôle qui fait foi ici,
pas le fait d'avoir poussé — coder, livrer et déployer restent trois étapes distinctes.

**Le numéro de version du site vit dans UN seul fichier : `version.js`** (`window.SITE_VERSION`,
depuis le 14/08/2026). Il n'y a plus de marqueurs à compter ni à recopier : toute page qui doit
l'afficher charge `version.js` et pose un élément portant `data-version`, qui se remplit seul.
Cinq pages l'affichent aujourd'hui — `admin.html`, `index.html`, `docs/guide-comite.html`,
`docs/guide-mar.html`, `docs/roadmap.html` — mais **une modification de n'importe quelle page
visible impose quand même la montée de version**, dans le même push. Deux chiffres, pas trois.
Le banc refuse tout numéro réintroduit en dur, et le Diagnostic aussi depuis le 16/08.

**Banc d'essai** `banc/` — **2531 vérifications** sur **54 scripts**, 0 échec (relevé le
03/09/2026 au soir). *(Historique : 2063 sur 43 scripts le 28/08, 2200 le 31/08, 2415 au soir du
01/09, 2531 le 03/09.)* Recette de comptage inchangée depuis le 28/08 (relevé de l'époque,
recette exacte `grep -cE "^\s+✓ "` — le `grep -c "✓"` naïf rend 1925 en comptant les lignes
récapitulatives),
`cd banc && ./lancer.sh`. *(⚠️ La recette du 19/08 disait « compter les coches `✓` de la sortie
complète ». Appliquée telle quelle — `grep -c "✓"` — elle donne **1538** : elle compte aussi la
ligne récapitulative de `banc_notif.mjs`, qui contient « 36 ✓ / 0 ✗ ». La recette exacte est de
compter les **lignes de coche**, `grep -cE "^\s+✓ "`. Même écart sur les échecs : `grep -c "✗"`
rend 1 alors qu'il n'y en a aucun. Deuxième correction de cette recette en deux jours.)* *(Comptage — **recette corrigée le 19/08 au soir** : compter les
coches `✓` de la sortie complète, et rien d'autre. L'ancienne recette — somme des récapitulatifs de
fin de script — donnait 1444 et **ne reproduisait plus son propre chiffre** : `banc.js` n'imprime
plus de récapitulatif du tout, ses 19 vérifications échappaient donc à la somme, et `banc_notif.mjs`
en annonce 36 pour 37 coches. Une recette de comptage qu'il faut corriger avant de s'en servir est
une recette morte. Recompter, ne pas recopier.)*
À lancer AVANT toute proposition de push touchant une page visible, un `.gs`,
le Worker ou `partage/dispo_jour.js`.

*Mise à jour : 3 septembre 2026 (soir).*

> 📋 **Vue courte : [`docs/roadmap.html`](roadmap.html)** — échéancier, chantiers en cours et règles
> à ne jamais casser, sans l'historique. Ce fichier-ci reste la mémoire longue : les deux se tiennent
> à jour ensemble.
>
> **Le dépôt en ligne fait foi.** Ce document est un repère de pilotage, pas la source de vérité
> du code. Les règles de méthode sont dans `CONTEXTE-Planning-Med.md` ; l'architecture et le
> dépannage dans `docs/guide-technique.html` ; la conception du module libéral dans
> `docs/module-liberal/module_liberal_conception.md`.

---

## 3 septembre 2026 (soir) — quatre défauts trouvés en production, la veille du staff

Site **v10.7.1 → v10.8.1** en quatre commits (`2fb03e94`, `c238c4ab`, `908bce5b`, `f3b44286`).
Banc **2470 → 2531**. Aucun fichier `.gs` modifié ce soir-là : tout est frontal, rien à recopier
dans l'éditeur Apps Script.

Journée commencée par une panne, finie par trois corrections trouvées en regardant les écrans.

### La panne du W1 — c'est Google, et c'était déjà écrit

Le W1 « Démarrer l'année » s'arrêtait à des étapes variables, tantôt en **délai dépassé**, tantôt
en **HTTP 404**. Rien dans le classeur ni dans le code métier : `GROUPES_VAC` (22 lignes, A=7,
B=7, C=8, CHASTEL en C ordre 8) et `PERIODES_VAC` (5 périodes 2027) ont été relus, tous deux
conformes, et le code de lecture ignore silencieusement toute ligne qu'il ne comprend pas — il ne
peut pas échouer dessus.

La cause est **écrite en tête de `journal.gs` depuis le 05/08** : « 2,5-5 s au mieux, 30 s+ les
mauvais matins, **404 sur le canal de réponse** ». La requête part, le script s'exécute, mais le
chemin par lequel Google renvoie la réponse répond 404. Le journal d'intentions a été construit
pour contourner exactement ça — mais il ne couvre que trois types d'écriture (placements, statuts,
publication). **Les onze actions du W1 passent en direct, sans filet, et la page ne tente chaque
appel qu'une seule fois** (`API_REJOUABLES` ne contient que `getAdminBootstrap` et le lot de
placements ; délai de lecture 20 s).

**Piège à connaître** : `initYear` refuse de tourner si `INDISPOS_{année}` existe déjà. Un 404 sur
le canal de réponse APRÈS une création réussie fait donc afficher un échec alors que l'année EST
créée. Avant de relancer une étape du W1, regarder l'onglet.

Un correctif a été écrit et testé le soir même — rejeu automatique pour les seules actions sûres à
rejouer, et affichage de la cause exacte au lieu du message générique — puis **volontairement non
poussé** : Arthur ne voulait pas de changement non éprouvé la veille du staff. Il est décrit dans
« À faire » ci-dessous ; il n'existe dans aucun commit.

### `staff.html` — l'onglet Ponts dépendait d'une clé qui n'existera jamais à ce moment-là

Commit `2fb03e94`, site **v10.7.2**, banc **2470** (+5).

L'onglet affichait « Les jours fériés ne sont pas encore disponibles — rouvrez la page dans un
instant », sans jamais en sortir. La page ne lisait les fériés **que** dans la copie rapide, sans
repli. Or la clé `joursferies_{Y}` n'est publiée que pour les années possédant un onglet
`GARDES_{Y}` (`miroir.gs`, ligne 441 : la famille suit la liste des années « consultables »,
construite en balayant les onglets `GARDES_`). Les gardes 2027 ne seront générées qu'en novembre.

**Pendant toute la campagne de congés de l'année suivante — c'est-à-dire précisément quand cet
écran sert — la clé n'existe pas.** Le message mentait : rouvrir n'y changeait rien, c'était un
cul-de-sac.

Repli sur l'action `getJoursFeries`, exactement le motif déjà utilisé trois lignes plus haut pour
les périodes de vacances : copie rapide d'abord, Apps Script ensuite. Aucune règle de calendrier
recopiée dans la page. Si le repli échoue aussi, l'écran retombe en sommeil au lieu de deviner.

⚠️ **Erreur de méthode, à ne pas répéter.** J'avais d'abord annoncé à Arthur que le repli jouerait
« copie rapide d'abord » sans avoir vérifié que la famille `joursferies` n'a **aucun onglet
déclencheur** (`banc_miroir.js` la classe « sans source » : elle n'est construite que par la
synchro horaire). Juste sur le papier, faux en pratique. Une déduction présentée comme un constat
lui a coûté un aller-retour.

### `staff.html` — on pouvait poser des congés sur des jours qui n'existent pas

Commit `c238c4ab`, site **v10.7.3**, banc **2485** (+15).

Les vues par mois (boutons **FORM** et **VAC année**) fabriquaient le mois calendaire entier, du
1er au 31. Or l'année de planning va du premier lundi de janvier au jour précédant le premier
lundi de janvier suivant : pour 2027, du **lundi 4 janvier 2027 au dimanche 2 janvier 2028** —
363 colonnes, **vérifié dans `INDISPOS_2027` au classeur**. Les 1, 2 et 3 janvier apparaissaient
donc comme des cases normales, cliquables.

Et `saveIndisposBatch` reconstruit chaque ligne à partir des seules colonnes existantes
(`datesB.map(...)`) : une saisie sur le 01/01/2027 n'était **écrite nulle part**, le serveur
répondait quand même `success`, l'écran affichait « enregistré », et la pastille disparaissait au
rechargement suivant. Perte silencieuse, pas refus.

**Même défaut, déjà corrigé ailleurs.** `indispos.html` porte la correction depuis le 12/08 (banc
T072), avec le même constat écrit en commentaire. Le helper `bornesAnneePlanning(y)` existait — il
vivait dans `indispos.html` uniquement. `staff.html` ne l'avait jamais reçu.

`getMonthDays` filtre désormais, `toggleDay` refuse et l'explique. Les deux fonctions de bornes
sont pour l'instant une **copie conforme** de celles d'`indispos.html`, doublon assumé et signalé
en commentaire : toucher la page des MAR en pleine campagne, la veille du staff, était le mauvais
moment. Elles doivent rejoindre `partage/`.

*Trou symétrique laissé tel quel* : les 1er et 2 janvier 2028 appartiennent à la campagne mais
n'apparaissent dans aucune vue par mois. Ils restent atteignables par la période Noël en mode VAC,
donc rien n'est perdu.

### Le W2 remanié — « Contrôles → Couverture → Lancer »

Commits `908bce5b` (site **v10.8**, banc **2522**, +37 avec `banc_wizard_gardes.js`) et
`f3b44286` (site **v10.8.1**, banc **2531**, +9).

Trois décisions d'Arthur, prises en lisant l'écran en production.

**1. Le total de jours par MAR disparaît.** « ✓ 127 jour(s) » additionnait VAC, FORM, INDISPO,
SOUHAIT, TP et CL sans distinction : il mesurait une quotité et un historique d'absences, jamais
la qualité d'une saisie — un MAR à 80 % part avec ~46 jours de TP, une absence longue en ajoute
des dizaines de CL. Et il n'entrait dans **aucun** calcul : le seul test a toujours été
`count === 0`.

**2. L'écran « Vacances » est supprimé.** Il rejouait EXACTEMENT le calcul des conflits de l'étape
précédente — vérifié ligne à ligne entre `getVacConfig` (qui alimente `getConflitsAll`) et
`getVacValidation` : même rotation droite des groupes, même exclusion des week-ends et fériés,
même test `rang du jour > seuil`. L'un écrit `joursBloqués.push(...)`, l'autre `joursRefuses++`.
Si l'étape 1 laissait passer, celui-ci était **vert par construction** et ne pouvait rien
découvrir. Il ne bloquait d'ailleurs rien. Son seul apport réel — relire les dates et les seuils
avant de lancer — rejoint l'écran de lancement, sans statut et **sans appel supplémentaire** :
`getVacValidation` est déjà appelée dans le lot d'ouverture.

**3. L'ancienne étape 1 est coupée en deux.** Ce qui EMPÊCHE de générer (qui n'a pas saisi, TP
déséquilibrés, conflits vacances, profils bloquants) d'abord ; ce qui RENSEIGNE ensuite (indispos
et souhaits sur jours à enjeu, prioritaires Noël, jours à risque de trou, couverture par semaine,
report de dette). La coupure passe par un **repère posé dans la chaîne HTML**, pas dans le code :
aucun des blocs existants n'est touché, la coupure se fait une seule fois à la fin. L'écran
Couverture ne coûte aucun aller-retour, tout était déjà calculé.

`updateWizGNav()` remet le bouton Suivant actif à chaque écran ; seuls les contrôles le
reverrouillent. Sans cela, un blocage posé à l'étape 1 restait collé aux écrans suivants, qui ne
bloquent rien.

**Puis la répétition, signalée par Arthur** : le bandeau annonçait « Tous les MARs ont saisi » et
vingt-quatre lignes répétaient « ✓ Saisi » juste en dessous. Dans le cas inverse, le bandeau nomme
déjà les manquants. La liste nominative est supprimée ; ce qu'elle apportait de réel — le nombre
de MAR effectivement contrôlés, donc le périmètre — passe dans le bandeau : « Les 24 MARs actifs
ont saisi » / « 2 MAR(s) sur 24 n'ont pas encore saisi : … ».

### L'alerte des prioritaires Noël se déclenchait sur la mauvaise règle

Même commit `f3b44286`.

Elle prévenait dès qu'un prioritaire était absent ou indisponible sur **une** des quatre dates
(24, 25, 31 décembre, 1er janvier). C'est faux, et le générateur le dit :
`generateur_gardes.gs` traite les quatre dates **séparément** (`noelDates.forEach`) et repart,
pour chacune, des candidats non bloqués ce jour-là, triés par ancienneté — `overdueKey` place en
tête ceux qui n'ont **jamais** fait Noël. Un prioritaire indisponible le 24 est donc non seulement
éligible au 25, au 31 ou au 1er : **il y passe en premier**. Il n'a besoin que d'UNE date libre.

L'alerte ne vaut donc que si les quatre sont prises. Sur l'écran du 03/09, l'ancien seuil signalait
quatre MAR dont **aucun** n'était réellement écarté.

⚠️ **Réserve consignée** : le générateur raisonne en **unités liées** (vendredi → dimanche, férié
couplé → samedi) là où l'écran ne regarde que les quatre dates du calendrier. Être bloqué sur les
quatre reste une condition nécessaire, donc plus de fausse alerte ; un cas d'unité liée pourrait
en théorie échapper. Répliquer `noelUnit()` dans l'écran serait une duplication de logique métier —
écarté sans accord explicite.

### Un test du banc corrigé, pas contourné

`banc_page.js` exigeait exactement **2** appels à `getVacValidation` dans `admin.html`. Il en
reste **1**. L'attendu a été mis à jour avec la raison en commentaire. La distinction compte : un
test devenu faux se corrige, un test gênant ne se supprime pas.

### Deux trous laissés ouverts, décidés ce jour

- 🔴 **Les MAR hors groupe ne consomment aucune place du seuil de présence.** `getVacConfig` et
  `getVacValidation` construisent tous deux `marEnVacCeJour` à partir de la seule liste ordonnée
  des membres de `GROUPES_VAC`. Un actif absent de ces groupes n'a jamais de rang — donc ses
  congés ne peuvent jamais être refusés, **et ils ne comptent pas dans le seuil**. Une période où
  il est absent avec 8 autres s'affiche VALIDE avec un seuil à 8. Cas visé : **PERRIN (BP)**, qui
  pose ses congés où il veut par régime. **FAUVEL était aussi hors groupe le 03/09** alors qu'il
  est actif — à réintégrer. Côté `staff.html` **rien à faire, c'est déjà correct** : `countForDay`
  et `vivierGarde` bouclent sur tous les médecins actifs sans regarder le groupe ; le trou est
  purement serveur. Remède retenu si Arthur le confirme : les hors-groupe occupent les
  **premières** places du seuil — jamais refusables, mais ils font reculer les autres d'un rang.
  Reporté volontairement : cela change des résultats d'arbitrage.
- ⏳ **Le rejeu du W1** (voir la panne ci-dessus), écrit et testé, jamais poussé.

---

## 2 et 3 septembre 2026 — préparation du staff, et deux corrections

- **`bee71d42` (v10.7) — les ponts reviennent à la définition officielle.** La règle arithmétique
  du 01/09 (quatre jours de repos pour un seul posé) en désignait **treize** en 2027 : elle
  comptait aussi ceux qui ALLONGENT un week-end. Le calcul était juste, la notion non. Décision
  d'Arthur : la règle redevient géométrique — chômé la veille ET le lendemain, un férié d'un côté.
  **2027 = les vendredis 7 et 28 mai, et eux seuls.** Vérifié sur les fériés calculés : 2028 = 4,
  2029 = 5, 2030 = 4, 2031 = 4 ponts. Contre-preuve : 12 échecs sur le code non corrigé.
- 🔴 **`0c54ffa3` — `generateCode` avait été perdue le 29/08**, effacée par le commit des
  compteurs d'usage. Restaurée, avec un scénario de banc sur la réinitialisation du code d'accès.
  *Une fonction supprimée par accident dans un lot sans rapport ne se voit que le jour où on
  l'appelle.*
- **`75931d11` (v10.7.1) — la pastille indispos** n'apparaît plus que pendant la campagne
  (ouverte et non générée).
- **`a6e2e6af` — le guide du comité** remis à jour après les lots des 01 et 02/09 : les ponts, le
  panneau « Ce qu'il reste à poser » et ses trois pièges, les deux boutons de la barre rouge, la
  matrice de Noël. Vérifié : plus aucune mention de « deux ponts » ni de la doctrine des temps
  partiels posés après la génération.
- **`d376ce61`, `9d3846ba`, `27d19780`, et quinze commits de présentation** — flashcodes,
  parcours 45 min (21 étapes sur 35), notes du présentateur, mise en page des diapositives.

---

## 1er septembre 2026 — la journée des six lots : temps partiels dans la campagne, ponts au staff, génération bloquante

Site **v1.99 → v10.6** en six lots, banc **2200 → 2415**. Puis répétition générale de la
génération 2027, seule et en 4G. Deux lots `.gs` à recopier ce jour-là
(`GAS_VERSION_GENERATEUR` 2026-09-01.2, `GAS_VERSION_INDISPOS` 2026-09-01.7,
`GAS_VERSION_CODE` 2026-09-01.1).

**Le numéro de version change de série : v1.99 → v10.0.** La suite aurait été « v1.100 », qui se
lit mal. On avance désormais de dixième en dixième. Le premier chiffre reste réservé à ce que
l'équipe voit changer pour de bon.

### v10.0 (`c37f6443`) — cinq lots d'un coup

- **Pose des temps partiels PENDANT la campagne.** Le circuit de campagne les accepte au lieu de
  les jeter ; quota, profil et jour ouvré vérifiés côté serveur, refus tracés dans `LOGS`. Retirer
  un TP le retire d'`INDISPOS` **et** de `GARDES`, qui pouvaient diverger depuis que les deux
  circuits coexistent.
- **Un temps partiel posé est acquis.** Plus aucune garde la veille d'un TP : le repos du
  lendemain s'écrivait par-dessus et l'effaçait — 16 à 30 jours par an, mesurés sur les
  indisponibilités réelles 2027 augmentées des 260 jours posables, **dans 18 tirages sur 18**.
  Aucun dernier recours ne lève la règle.
- **Génération bloquante.** Un jour sans binôme arrête tout AVANT la première écriture : ni
  onglet, ni notification, ni phase de pose ouverte — rien à supprimer pour relancer. Message
  nommant les jours et les leviers, rangés en trois familles ; un levier proposé est vérifié
  (retirer l'absence doit réellement rendre la personne disponible).
- **Staff vacances, les week-ends.** Les colonnes samedi et dimanche affichent enfin le nombre de
  **gardeurs disponibles** (rouge < 4, orange 4-5, vert 6+). Elles n'avaient ni compteur ni
  couleur : le week-end des 10-11 juillet 2027 portait **19 MAR en congés pour un seuil de 10**,
  et personne ne l'avait jamais vu. Le mécanisme est mécanique — ceux qui partent finissent le
  vendredi, ceux qui reviennent reprennent le lundi, les deux blocs se croisent sur le week-end.
- **Onglet « Ponts ».** Attribution au staff avant la génération, compteur par MAR, liste de ceux
  qui n'en ont aucun. Un pont consomme un jour du quota, comme n'importe quel autre.

### v10.1 (`09c92f00`) — le diagnostic des jours sans binôme devient lisible

Le message d'échec s'affichait en un seul paragraphe rouge de trente lignes : le générateur
produisait bien un texte structuré, mais le routeur ne renvoyait que la chaîne et l'écran
l'affichait dans un `textContent` — tous les retours à la ligne disparaissaient. Le routeur
transmet désormais la **structure** (`joursVides`, `messageComplet`), l'écran met en forme un
encadré par jour, et le générateur rend une ligne par **motif** au lieu d'une ligne par MAR :
13 lignes au lieu de 30 pour deux jours en défaut. Leviers ordonnés du moins au plus coûteux.

⚠️ **Trois défauts attrapés en écrivant les tests, pas en lisant le code** — un pluriel absent et
**deux erreurs dans mes propres tests** sur les ponts (un férié le lundi donne deux jours
rentables et non un ; deux fériés consécutifs déplacent le pont de part et d'autre au lieu de
l'annuler). Le code avait raison.

### `011a376b` — les avertissements de génération persistent dans `LOGS`

« Il y a eu des avertissements mais je ne sais plus ce que c'était » : `LOGS` ne gardait que leur
**nombre**, le contenu ne partait que dans le journal d'exécution d'Apps Script, invisible depuis
l'application. Chaque avertissement est désormais écrit avec son rang. **Plafond de 25 lignes** —
`LOGS` est purgé au-delà de 501 lignes et le générateur peut en rendre 60 : les écrire toutes
chasserait un huitième du journal. Au-delà du plafond, le reste est annoncé, jamais tu.

### v10.3 (`e572df7d`) — Noël et Jour de l'An : une matrice, pas un bandeau

Le bandeau défilant est retiré : il n'affichait que huit prioritaires, en boucle, sans jamais
montrer qui était exempté ni depuis quand. À sa place, une **matrice** — une ligne par médecin,
une colonne par année, un point rempli quand la personne a tenu l'une des quatre dates.

**Aucun jugement n'est rendu** : ni « prioritaire », ni liste des huit à servir. Décision
d'Arthur — il y a souvent plus de huit candidats légitimes, et désigner huit noms donnerait à un
calcul le dernier mot sur un arbitrage qui revient au comité. **L'écran montre, le comité décide.**

Sous chaque année, le nombre de postes réellement mobilisés : **quatre jusqu'en 2024, huit depuis
la double garde** (octobre 2025). Sans ce chiffre, une année ancienne à quatre noms se lirait
comme une saisie incomplète. Côté serveur, `getNoelHistoryDetail` devient la source unique et
`getNoelHistory` n'en est plus qu'une vue : l'ancienne version dupliquée est **supprimée**, pas
mise de côté.

Dans la barre rouge, « Priorités » monte (c'est l'ordre de passage des groupes, la donnée qui
commande tout l'arbitrage) et « Récap » sort (il doublait le sélecteur Grille/Récap posé juste
au-dessus).

### v10.4 (`4394a8b9`) — le quota de congés se compte en jours TRAVAILLÉS au staff

Douze MAR annoncés au-dessus de leur quota, dont un à 35 jours pour 33. **Aucun ne dépassait.**
Trois écrans, deux règles : `indispos.html` et le serveur retiraient les week-ends **et** les
fériés, `staff.html` ne retirait que les week-ends. Un bloc de congés qui enjambe le 1er mai reste
posé sur le 1er mai — ce jour-là n'était pas travaillé, il ne coûte rien au quota.

⚠️ **Troisième fois dans la même journée que le motif ressort — deux lecteurs des mêmes données
qui ne comptent pas pareil** : la grille contre les statistiques, l'écran contre le journal, le
staff contre le serveur. Les trois fois, ce sont les **données réelles** qui l'ont révélé.

### v10.5 et v10.6 (`4cf7e713`, `369dc907`) — « Ce qu'il reste à poser »

Panneau replié en tête de l'onglet Statuts : ce qui reste à poser par MAR, en vacances, formations
et temps partiels.

**La source suit l'état de l'année, et c'est tout l'enjeu** : `INDISPOS_{Y}` tant que le planning
n'est pas généré, `GARDES_{Y}` dès qu'il l'est. Vérifié dans `appliquerStatutJour` : l'onglet
Statuts écrit dans `GARDES` et **jamais** dans `INDISPOS` — compter dans `INDISPOS` aurait rendu
invisible tout ce que le comité pose après la génération. Les demandes de TP non tranchées sont
comptées à part et retirées du reste. Un profil sans temps partiel affiche un quota nul, jamais un
faux compteur.

Le bouton porte **l'année regardée** (« Ce qu'il reste à poser · 2027 ») : un reliquat 2026 lu
comme un reliquat 2027 avait fait croire à une campagne mal remplie alors qu'elle était complète.
Les cases donnent **posé sur quota** — « 26/26 » se lit d'un coup.

⏳ **Reste à faire** : `getReliquats` passe par Apps Script à chaque dépliage, rien n'est encore
relayé par la copie rapide.

---

## 31 août 2026 (soir) — le comité se sert-il de la page, ou l'ouvre-t-il ?

**Un commit `4484b92`, banc 2 163 → 2 200, site v1.97 → v1.98.**
⏳ `Indispos.gs` **2026-08-31.1** et `portail.gs` **2026-08-31.1** à recopier et déployer.

### La question, et pourquoi elle n'avait pas de réponse

Les connexions disent QUI ouvre le portail. Elles ne disent rien de ce qui y est fait. Arthur, qui
ne fera plus de gestes d'administration une fois le portail entre les mains du comité, veut savoir
si la page d'administration servira ou sera seulement ouverte.

**`LOGS` ne pouvait pas servir de source.** Il journalise déjà ~70 gestes, mais il ne garde que
**500 lignes** et son message est du **texte libre** — pas de colonne action, pas de colonne
auteur. Compter proprement supposerait de relire des phrases françaises, ce qui casse à la
première reformulation. Et une carte alimentée par lui rétrécirait toute seule : exactement le
défaut corrigé le matin même sur `CONNEXIONS`.

### Ce qui a été construit

Onglet **`STATS_ACTIONS`** — `ROLE`, `ACTION`, `NOMBRE`, `DERNIERE`. Même principe que
`STATS_HEURES` : on incrémente au moment du geste, on ne reconstruit jamais après coup.

Deux branchements, pas un de plus :

| Où | Ce qui est compté |
|---|---|
| `logConnexion` | les ouvertures, sous l'action `(ouverture)` |
| entrée de `WRITE_ACTIONS_LOCK` (routeur) | les **26 actions** qui modifient des données |

Le second point est choisi pour la même raison que l'invalidation du cache posée juste dessous :
`WRITE_ACTIONS_LOCK` **est** la liste de référence des écritures. S'y accrocher garantit qu'aucune
action nouvelle ne sera oubliée.

Côté écran, la carte « Répartition par rôle » — écrite en mars, jamais affichée, masquée en dur par
`volume()` faute de données — devient **« Qui se connecte »**. Une seconde carte s'ajoute :
**« L'administration, au-delà de la connexion »**, deux compteurs (ouvertures, modifications), le
rapport entre les deux, et le détail des gestes avec leur date de dernière fois.

### Décisions

- **Les lectures ne sont JAMAIS comptées.** Compter chaque ouverture d'écran imposerait une
  écriture au classeur à chaque affichage. Mesure du 28/07 : quatre exécutions concurrentes
  coûtent 4 à 7 s chacune, contre 1,8 s pour une seule.
- **Un compteur ne peut pas faire échouer le geste qu'il compte.** Chaque appel est sous
  `try/catch`. Le banc rend l'écriture impossible et vérifie que la connexion aboutit quand même —
  c'est la seule propriété non négociable du lot.
- **Le compteur mesure un RÔLE, jamais une personne.** `checkCode` rend le code d'administration
  sans nom ni initiales : `{role:'admin', id:'ADMIN'}`. On saura qu'un geste vient de
  l'administration, jamais de qui. **La carte ne répondra donc pas à « les autres membres du
  comité s'en servent-ils ».** Y répondre supposerait un accès administration adossé au code
  personnel de chacun — chantier de droits d'accès, écarté à quatre jours de la démonstration.
- **Les trois barres restent séparées.** Fondues dans les « actifs », les ouvertures
  d'administration feraient dépasser la courbe de son propre plafond de 25.
- **Le routeur compte la tentative, pas la réussite.** Le point de passage est unique à l'entrée
  des écritures, il ne l'est plus après. Une publication refusée par le verrou est comptée.

### Défaut rendu visible, pas corrigé

Le **secrétariat** porte un nom (`initials: 'SEC'`), donc `statsRecalculer` le compte comme un
**26e utilisateur** dans la courbe « actifs / 25 », qui peut ainsi dépasser son propre plafond.
Constat de ce jour, **non corrigé** : après le 4 septembre.

### Ce que le banc a attrapé

Une vérification est tombée au premier essai : le classeur simulé rend la date de dernière fois
comme **objet `Date`**, pas comme chaîne — ce que fait réellement Sheets. Le code de lecture la
normalisait déjà ; c'est le test qui croyait lire une chaîne. Une contre-épreuve a été ajoutée :
la même date écrite comme objet doit ressortir au format jour, sinon « il y a N jours » deviendrait
illisible. **C'est le même piège que celui qui faisait rétrécir les semaines figées le 29/08.**

Contre-épreuve du lot : sur le dépôt intact, les 5 vérifications de branchement tombent.

### ⚠️ Notifications — l'angle mort de la marche à suivre du 26/08

Question d'Arthur ce soir : que se passe-t-il si `NOTIF_EMAIL_TEST` est supprimée alors que seule
son adresse figure dans la colonne EMAIL ? **Réponse vérifiée dans le code : c'est plus sûr, pas
moins.** Un seul endroit lit la redirection (`_notifExpedier`, `code.gs`) : elle ne protège que les
notifications de changement. Tous les autres envois — codes d'accès, réinitialisation,
récapitulatifs annuels — lisent `EMAIL` (col. index 7) directement et l'ignorent. Avec une seule
adresse renseignée, le garde-fou devient la colonne EMAIL, qui gouverne **tous** les canaux.

**Correction du 31/08 au soir — j'avais surestimé ce risque.** Arthur l'a relevé : en régime normal,
deux années actives ne posent aucun problème, une modification de 2026 fait partir un mail, une
modification de 2027 aussi, c'est le comportement voulu. Le cas décrit plus haut ne survient **qu'au
moment où on rallume un système éteint**, et ce qui partirait alors, ce sont les modifications des dix
dernières minutes — des changements réels, que les MARs auraient reçus de toute façon une fois le
système rallumé. **Pas une salve d'arriérés**, et rien à voir avec les 13 mails du 25/08, qui venaient de la
file d'années, défaut corrigé depuis.

**Ce qu'il faut retenir, et rien de plus :** une modification programme son envoi dix minutes plus tard, et
rallumer ne l'annule pas. Donc **ne rien modifier pendant dix minutes avant de rallumer** — ce que la
marche à suivre du 26/08 prévoit déjà (quinze minutes d'attente). `notifRecaler` reste disponible comme
ceinture, mais n'est pas nécessaire.

**Leçon de méthode.** Un mécanisme correctement lu peut être présenté avec une gravité fausse. Ici le
code était juste décrit, mais « le seul chemin de spam qui reste » a transformé un cas mineur, déjà couvert,
en risque à parer — et a fait écrire un geste supplémentaire dans une marche à suivre qui n'en avait pas
besoin. **Vérifier le mécanisme ne dispense pas de vérifier l'importance qu'on lui donne.**

---

## 31 août 2026 — les statistiques d'usage, et le journal qui s'autodétruisait

**Six commits, banc de 2 011 → 2 163 vérifications, site v1.93 → v1.97.**
Point de départ : Arthur voulait « des stats comme sur les réseaux sociaux ».
Point d'arrivée : un écran qui mesure l'adoption, un journal qui ne se détruit plus,
et une fiche de traitement prête pour le DPO.

### ⚠️ Le défaut qui pressait — l'historique s'autodétruisait

`CONNEXIONS` était plafonné à 2 000 lignes, les plus anciennes écrasées (`logConnexion`).
**Mesure du 31/08 : 1 449 lignes en 53 jours à 5 utilisateurs, soit ~27/jour.** À 25 MAR, le
plafond aurait été atteint **toutes les 2 à 3 semaines** — et il ne l'avait jamais été, donc
personne ne l'avait vu venir. La courbe d'adoption n'aurait jamais pu exister : les premières
semaines d'usage réel auraient disparu avant d'être lues.

**Règle retenue, et c'est elle qui tient tout l'édifice : on ne RECONSTRUIT jamais une
statistique depuis les lignes brutes après coup, on la FIGE pendant qu'elles existent.**

| Où | Contenu | Taille | Durée |
|---|---|---|---|
| `CONNEXIONS` | détail nominatif | plafond 10 000 (~3 mois à 25 MAR) | glissant |
| `STATS_SEMAINE` | une ligne/semaine : connexions, actifs, figée O/N | 52 lignes/an | sans limite |
| `STATS_HEURES` | grille 7 × 24 cumulée | 7 lignes | sans limite |
| `MEDECINS.DERNIERE_CONNEXION` | une date par MAR, écrasée | 25 lignes | état courant |

Ordre imposé dans `logConnexion` : **figer PUIS supprimer**. Si le figeage échoue, rien n'est
supprimé. Déclencheur `statsRecalculer` posé le lundi à 3 h (`installStatsTrigger`, lancé le 31/08).

**Origine du comptage : `STATS_ORIGINE = '2026-09-04'`.** Décision d'Arthur — les 1 449 connexions
de juillet-août sont presque toutes les siennes, les compter ferait démarrer l'adoption à un
niveau qui ne veut rien dire. Pas de reprise d'historique. Le filtre ne s'applique qu'aux
compteurs : `DERNIERE_CONNEXION` se remplit dès maintenant, car **une date de dernière connexion
est un état, pas un compteur**.

### L'écran — deux questions, pas une

`docs/stats-usage.html`, tuile `only:'DURAND'` dans `index.html`.

Le premier jet montrait le **volume de connexions** en grand. Arthur a tiqué, à raison : le volume
monte aussi quand les mêmes reviennent plus souvent — c'est la métrique qui flatte, pas celle qui
informe. Inversion : le graphique principal est **le nombre de médecins distincts par semaine**,
borné à l'effectif, et une seconde courbe donne **les connexions par médecin actif** — ce qui
sépare *combien de gens s'en servent* de *à quel point*. Le volume brut passe en carte secondaire,
avec la mise en garde écrite dessus.

**Aucun total par personne**, ni affiché ni renvoyé par le serveur. Décision d'Arthur, qui voulait
d'abord des statistiques individuelles : la liste nominative dit **qui n'a pas ouvert le portail,
jamais qui l'ouvre le plus**. Les pastilles codent l'ancienneté sur une rampe vert → bleu → gris,
**sans aucun rouge** — le rouge dirait « en faute » à propos d'un collègue qui n'a pas ouvert une
page web. Le banc vérifie cette décision **dans la feuille de style**, pas seulement dans le rendu.

### 🔴 Trois défauts, trois leçons

**1. Le banc entérinait mon erreur au lieu de la voir.** `getStatsUsage` contrôlait
`user.role !== 'admin'`. Or `checkCode` ne rend ce rôle que pour le **code d'administration**
(id `ADMIN`) : ouvert avec son code personnel, Arthur est un `mar` d'id `DURAND` — il se voyait
**refuser sa propre page**, alors que la tuile, elle, filtre sur l'**identité**. Deux critères
différents pour la même porte. Et mon scénario de banc vérifiait « refus pour rôle mar » comme une
sécurité : **il testait ma croyance, pas le système**. Corrigé en `STATS_ALLOWED = ['DURAND']`,
motif déjà en place pour le CRH. Le banc vérifie désormais que **l'identité autorisée côté serveur
est celle que porte la tuile** — c'est leur désaccord qui a produit la panne.

**2. Sheets convertit une clé de semaine en objet Date.** Une clé relue ne correspondait plus à la
clé calculée : la semaine figée était **recomptée sur les lignes restantes** — elle rétrécissait —
et une ligne en double était créée. Trouvé par le banc, pas par la relecture. Et la première
correction utilisait `instanceof Date`, qui **échoue silencieusement dès qu'il y a deux contextes
d'exécution** (le banc en a un) : remplacé par une reconnaissance sur les méthodes.

**3. La doublure du banc était incomplète, et elle inventait sa propre forme.** `deleteRows`
n'existait pas dans `stubs.js` alors que le vrai code l'appelle **en 4 endroits** : la purge n'avait
jamais été exercée une seule fois. Et l'en-tête `CONNEXIONS` du monde simulé disait `['DATE','ID']`
là où le code écrit `['HORODATAGE','NOM','INITIALES','ROLE']`. Les deux corrigés.

### ⚠️ Deux règles écrites périmées, découvertes en chemin

- **La version du site n'a plus « 9 emplacements dans 5 fichiers ».** Depuis le 14/08, `version.js`
  est la **source unique** — un seul endroit. Toute note affirmant le contraire est fausse.
- **Plus de 3e chiffre pour un petit correctif.** `version.js` porte la décision du 14/08 : « deux
  chiffres, pas trois ». Le banc l'applique en deux endroits (`banc_docs.js`) et a refusé un
  v1.94.1. La règle du 3e chiffre est **caduque**.

### Commits

`2c01cb4` compteurs GAS · `cb64f70` écran + action serveur (v1.94) · `f7915fa` icône (v1.95) ·
`cfe2b64` accès nominatif · `b54bdc2` tableau des 25 (v1.96) · `ef5a303` pastilles (v1.97).

**Icône** : `bar-chart-2` ajoutée au mini-bundle (extraite de lucide v0.383.0, ISC). Le premier
choix, `activity`, était **absent du bundle** — carré vide en production, attrapé par le banc. Le
second, `radar`, était **déjà porté par Veille biblio**. Le banc vérifie maintenant que l'icône des
statistiques n'appartient qu'à elle *(sans condamner tout doublon : `file-text` est partagé par CR
d'anesthésie et CRH, c'est voulu)*.

### 📄 Hors dépôt — la fiche de traitement pour le DPO

Rédigée puis corrigée dans la journée, **jamais poussée** (le dépôt est public). PDF, 3 pages,
10 sections, 6 questions au DPO. Points à retenir :

- **Interlocuteur** : le DPO du service, `dpo@exemple.fr` — pas la DSI. Le nom n'est pas public.
- **Loi n° 1.565 du 03/12/2024**, ordonnance d'application de juillet 2025. Le régime de
  déclaration préalable est largement supprimé, **remplacé par la responsabilisation** : on ne
  dépose plus un dossier, on documente sa conformité et on doit pouvoir la justifier. La fiche
  n'est donc pas une formalité en plus — **c'est ce qui a remplacé la formalité**.
- **Ne jamais poser de question nue** (« ai-je le droit ? » appelle un oui/non ; devant un dossier
  vide, le réflexe d'un DPO est de demander la suspension). On décrit le traitement et on demande
  la **liste des obligations**.
- **Calendrier** : saisine **après** le 4, en l'annonçant en séance le 4. Le module libéral est
  **hors périmètre** (groupement libéral, pas l'établissement) — l'inclure donnerait au DPO du service
  compétence sur des données qui ne le regardent pas.
- **Question ouverte, la seule qui compte vraiment** : qui est responsable du traitement,
  l'établissement ou Arthur à titre personnel ? Aujourd'hui, c'est lui.

---

### ⚠️ LE 4 SEPTEMBRE : LA GÉNÉRATION 2027 EST JOUÉE EN DIRECT DEVANT LE STAFF

**À lire avant toute intervention touchant aux notifications, aux mails ou aux onglets 2027.**
Arthur ne montre pas un planning déjà fait : il **lance la génération en séance**. Le planning 2027
généré le 25/08 au soir n'est donc **pas** celui qui restera — il sera **régénéré** le jour J.

**Marche à suivre — établie le 26/08 après lecture complète du code.**

Deux mécanismes de mail **indépendants**, qui ne lisent pas la même adresse :

| | destinataire | commandé par |
|---|---|---|
| récapitulatif « Vos gardes » | colonne **EMAIL** du classeur (col. H) | rien — aucun détournement possible |
| notifications de changement | `NOTIF_EMAIL_TEST` si renseignée, sinon col. EMAIL | `NOTIF_ACTIVE` |

**Le vrai interrupteur de sécurité est `NOTIF_ACTIVE`.** Quand il ne vaut pas `O`,
`_notifEnvoyerAnnee_` **prend quand même la photo** et se tait (journal : « système éteint, photo
prise, aucun envoi »). Donc **aucun arriéré ne peut s'accumuler tant qu'il est éteint** — inutile
de manipuler les fichiers `_notifie.json`, ce qui était la piste explorée d'abord et abandonnée.

1. **Avant le 4** — mettre `NOTIF_ACTIVE` à **`N`** (Apps Script → Paramètres du projet →
   Propriétés du script). Remettre les **21 adresses dans la colonne EMAIL** de MEDECINS (elles
   sont décalées d'une colonne vers la droite, au-delà de la dernière en-tête). Laisser
   `NOTIF_EMAIL_TEST` en place : second filet, sans effet sur le récapitulatif.
2. **Le 4** — ménage des tests, puis génération en direct, les trois étapes. Le récapitulatif part
   **à tous les MAR** ; aucune notification de changement ne peut partir. **Rien à supprimer.**
3. **Après le staff, planning stable** — publier une fois, attendre 15 min, vérifier au journal
   « système éteint, photo prise, aucun envoi » : la photo est à jour, rien en attente.
4. **Rallumer** — `NOTIF_ACTIVE` à `O`, supprimer `NOTIF_EMAIL_TEST`. Seuls les changements
   **postérieurs** partent, aux vrais MAR.

**Ce que reçoivent les MAR une fois rallumé** : un mail par personne, avec ses seules dates. Un
changement de **statut** (garde, astreinte, absence) est toujours signalé, même à six mois ; un
changement de **secteur** ne l'est que s'il tombe dans la fenêtre du dernier Excel diffusé (du
vendredi 16 h au dimanche +9), au-delà l'Excel suivant fera foi. Documenté depuis le 26/08 dans
`guide-mar.html` (langage simple) et `guide-technique.html` (règle exacte).

---

### Répétition générale : le 1er septembre, seul, en 4G

Déplacée du 28 août au **1er septembre** (Arthur ne revient à l'hôpital que le 31, et il est de garde
le 1er). **Faite seul : WS découvrira l'outil en direct devant la salle**, choix assumé — un collègue
qui n'a jamais cliqué et qui s'en sort convainc plus qu'une démonstration rodée. Consigne unique à lui
donner le jour J : au bout de 45 s un message « toujours en cours » peut s'afficher, ne pas recliquer.

**Conditions réelles à éprouver, découvertes ce soir : il n'y a pas de poste dans la salle de staff.**
Ce sera l'ordinateur personnel d'Arthur en partage de connexion 4G. Donc à vérifier le 1er : le câble
ou l'adaptateur du vidéoprojecteur, la mise à l'échelle des diapos larges, et la tenue de la 4G
pendant un appel serveur de trente secondes — une réponse perdue en route n'est pas un geste refusé,
mais il faut savoir le lire.

**Objet du test — pas le chronomètre.** Le générateur est passé en 2026-08-14.1 après la répétition du
10 août : il écrit désormais `LIENS_R_{Y}` (une ligne par samedi tenu, avec la récupération qui lui
appartient). **Cette version n'a jamais tourné en production.** Contrôle : cinq onglets 2027 créés,
autant de lignes dans `LIENS_R_2027` que de samedis tenus, Diagnostic à zéro récup manquante.

**Changement de doctrine sur le ménage :** l'effacement du bac à sable se fait **dans la foulée de la
génération**, le soir même, et non plus le matin du 4. Les deux gestes sont indissociables — interrompu
entre les deux (garde), le bac à sable reste généré et le 4 l'assistant réafficherait ce résultat sans
calculer, en silence. Le matin du 4 ne garde plus qu'un contrôle, les adresses et le Diagnostic.

---

## Archive — 5 au 26 août 2026

Le détail de ces journées a été retiré le 06/09/2026 : le document faisait 8 137 lignes et
personne ne le relisait. **Rien n'est perdu** — chaque entrée reste dans l'historique du dépôt,
au commit qui l'a écrite. Ce qui devait survivre a été remonté dans les *Pièges* et l'*État par
module* ci-dessous, qui sont les seules parties à jour.

- 27 août 2026 — les vacances estimées prennent la forme des vraies, et le rétro-test attrape une erreur dans le classeur
- 26 août 2026 — l'audit critique du générateur : un doublon de pénalité, le plafond 20 s rendu visible, et les week-ends d'affilée mesurés puis assumés
- 25 août 2026 — les souhaits de garde ouverts à tous les jours de l'année
- 23 août 2026 (nuit) — la cloche : le serveur note ce qu'il envoie, et une seule pastille
- 20 août 2026 — les plafonds gratuits de Cloudflare étaient atteints tous les jours, et personne ne le voyait
- 22 août 2026 — le placement des récupérations, déployé et confirmé en production
- 23 août 2026 (soir) — le circuit TP écrit dans le PLANNING, et un blocage de huit jours mis au jour
- 23 août 2026 — la pose des TP en production, trois défauts trouvés en vrai, et la démo change de forme
- 22 août 2026 (soir) — v1.65 → v1.67 : la pose des temps partiels est CONSTRUITE (lots 1 à 4)
- 22 août 2026 (après-midi) — les jours de temps partiel changeront de moment
- 19 août 2026 (soir) — v1.64 : la tuile CR quitte le mobile, et le document de panne rattrape neuf mois
- 19 août 2026 — v1.59 → v1.61 : le grand diagnostic du dépôt, et l'affaire PERRIN à deux étages
- 18 août 2026 — v1.58 : la recette à la main trouve ce que le banc ne pouvait pas voir
- 17 août 2026 (fin de soirée) — v1.52 à v1.57 : la fabrique, les 50 %, et plus rien à lire chez Google
- 17 août 2026 (soir) — v1.47 à v1.51 : le module libéral optimisé pour la consultation
- 17 août 2026 (matin) — v1.38 à v1.41 : le deck corrigé, la séquence du 4 septembre, et le code retenu 30 jours
- 16 août 2026 (soir) — v1.36 : le guide du comité restructuré, et un Diagnostic qui redit la vérité
- 14 août 2026 — LE DÉPLOIEMENT : les échanges tournent en production (éteints), v1.34.1 + v1.34.3
- 14 août 2026 (matin) — v1.34.2 → v1.34.6 : cinq défauts vus sur un iPhone, dont un qui attendait 2027
- 13-14 août 2026 (nuit) — échanges de gardes : TOUT est construit, prouvé au banc, en attente du push
- 13 août 2026 (soir) — v1.33.2 : plus rien n'attend Google, et trois listes qui mentaient
- 13 août 2026 — v1.32.6 : chacun voit son tour de vacances, et deux affichages menteurs tombent
- 12 août 2026 (nuit) — échanges et dons de gardes entre MAR : décisions de conception
- 12 août 2026 (nuit) — la passe d'optimisation mesurée, et ce qu'un concurrent a fait découvrir
- 12 août 2026 (soir) — v1.31.14 : identité visuelle, bandeaux mobiles, écrans de connexion
- 11 août 2026 — v1.31 : les jours de temps partiel entrent dans l'équité des gardes
- 10 août 2026 — refonte du guide technique
- 10 août 2026 — génération 2027 réelle : zéro défaut, et le piège de l'année planning
- 9 août 2026 (après-midi) — répétition de vitesse sur PC : les trois pages sous 800 ms
- 9 août 2026 — audit des sauvegardes et des comptes, dépôt rangé
- 8 août 2026 (soir) — v1.30.2 : l'année suivante ne coûte plus rien
- 6 août 2026 — v1.28 : plus aucun appel inutile, guides refondus
- 5 août 2026 — Journal d'intentions, banc d'essai, statut vs placement

---

## Comment lire ce document

Le document est en **deux parties**.

**PARTIE 1 — Synthèse** (ci-dessous, ~2 pages). Ce qu'il faut savoir pour travailler aujourd'hui.

| Section | Ce qu'on y trouve |
|---|---|
| **Pièges** | Ce qui a déjà cassé la production. À lire avant de coder. |
| **Performance** | État arrêté, mesures de référence, pistes fermées. |
| **État par module** | Ce qui existe et les règles métier à ne jamais « simplifier ». |
| **À faire** | Par ordre de priorité réelle. |
| **Écarté** | Étudié, chiffré, refusé. **Ne pas reproposer sans élément nouveau.** |

**PARTIE 2 — Historique détaillé par chantier.** Retirée le 06/09/2026 : elle reprenait, chantier
par chantier, ce que le journal en tête raconte déjà date par date. Pour « pourquoi tel choix a
été fait », le journal et l'historique du dépôt font le travail.

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
coïncident **une année sur trois**. Découvert par un symptôme d'Arthur, pas par une relecture.
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
→ Les 7 erreurs ont été trouvées par les **questions de mécanisme d'Arthur**, jamais par relecture.
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
→ Tester les scénarios d'usage réel **avant** de pousser, pas après le retour d'Arthur.

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
carte entière de la vue courte. Constaté par Arthur, pas par le contrôle.

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
**décision d'Arthur : ne pas complexifier**.

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

## 🚀 Performance — état arrêté au 01/08/2026

### 🪞 Miroir Cloudflare — LIVRÉ (04/08/2026) — remplace la lecture GAS à l'ouverture

Le tableau du coût d'un appel ci-dessous reste EXACT — c'est précisément pourquoi la lecture
a quitté Apps Script. Worker `miroir` + KV `MIROIR`, alimentés par `gas/miroir.gs`
(accroche `doGet` sur écriture + synchro horaire). Pages branchées : index, dashboard
(+ tuiles), indispos, admin (site v1.18.5). Repli GAS intégral au moindre écart ; rejeu de
transport sur les 4 pages ; après une écriture la page relit le circuit direct (KV ≈ 60 s).
Détail complet : CONTEXTE « État au 4 août 2026 » et guide technique § 25.
**Ne pas rouvrir** : recalcul client du panneau semaine, cache page pour Statuts/Équité,
clé miroir pour `getVacConfig` (par MAR) — décisions motivées du 04/08.

### Le coût d'un appel, DÉCOMPOSÉ (mesuré le 01/08, chiffres à jour)

Le 01/08 a produit la première décomposition réelle. Elle corrige la formule du 29/07
(« le seul levier est le nombre d'appels ») : **le poids du projet compte aussi**.

| Poste | Durée | À qui |
|---|---|---|
| Plancher de la plateforme | **~1 400 ms** | Google — irréductible |
| Compilation des 545 Ko de `.gs` | **~730 ms** | nous |
| Lecture du classeur avant `doGet` (`TEST_YEAR`) | ~430 ms | nous — **supprimé par le cache** |
| Travail utile | 14 ms à 4 500 ms | nous |

**Méthode de mesure (à reproduire, elle seule fait foi) :** créer un projet Apps Script
**vide** (`doPost` renvoyant `{}`), le déployer en Web App « Exécuter en tant que moi /
Tout le monde », puis appeler ALTERNATIVEMENT le projet vide et le vrai, 5 fois chacun,
depuis la même console. Le 01/08 : **témoin 1 417 ms · projet réel 2 580 ms → écart
1 163 ms**, qui est notre code. Alterner est indispensable : les deux subissent alors la
même minute, et aucune comparaison entre deux heures différentes n'est valable.

### Ce qui décide vraiment des mauvais jours

Le terme **hors exécution** (file d'attente / redirection Google) a valu **2 656 ms puis
18 191 ms à trois minutes d'écart** le 01/08, à code identique. Aucune optimisation ne le
touche. C'est lui qui produit les ouvertures à 30 s ou 1 min, et c'est le seul argument
sérieux en faveur d'un changement d'hébergement.

**→ Réduire le NOMBRE d'appels reste le premier levier** : chaque appel est une occasion
supplémentaire de tomber sur un mauvais moment. L'ouverture d'admin est passée de 3 appels
à 1 le 01/08 — de 50-107 s à ~5 s.
**→ Réduire le nombre d'allers-retours vers SHEETS est le second** (voir le cache ci-dessous).
**→ Ne jamais mesurer un gain sur une base instable.**

### ⚠️ RÈGLE ABSOLUE : ne JAMAIS ajouter de requête pour « aller plus vite »

Apps Script sérialise les exécutions d'un même utilisateur. **Toute requête ajoutée
occupe la file et retarde les autres.** Deux tentatives du 01/08 l'ont prouvé en cassant
l'ouverture d'admin, et ont été retirées le jour même :

- **Appel de « réveil »** (un `getActiveYear` envoyé pendant que l'utilisateur tape son
  code) : il a retardé le bootstrap de 18,5 s. Retiré.
- **Délai d'abandon court + rejeu** (25 s au lieu de 2 min sur les lectures) : il
  abandonnait des réponses **encore en route** et envoyait un second appel derrière le
  premier, qui continuait de tourner côté serveur — la file doublait. 4 appels en échec,
  page inutilisable. Retiré.

Le commentaire d'`admin.html` l.~2124 le disait depuis le 28/07 : *« sur une file
d'attente saturée, rejouer AGGRAVE l'engorgement »*. Il a été enfreint quand même.

### Ce qui a été livré

| Chantier | Avant | Après |
|---|---|---|
| Enregistrer 20+ placements | 34 appels, **10 perdus en silence** | 1 appel groupé, zéro perte |
| Ouvrir une case du planning | 2 appels par jour (~5 s) | 0 — préchargement semaine |
| Ouvrir `admin.html` | 4 appels bloquants | 1 (`getAdminBootstrap`) |

- **File groupée des placements** (`savePlanningOverridesBatch`) : badge « N en attente », lot
  rejouable sans doublon, persistance `localStorage`, envoi de secours à la fermeture, et
  **vidage bloquant avant publication** — on ne publie jamais avec des placements non écrits.
- **Préchargement du panneau** (`getPanneauSemaine`) : un appel pour les 7 jours, déclenché après
  500 ms d'immobilité (traverser 12 semaines = 1 appel). Cache invalidé après changement de statut.
- **Bootstrap enrichi** : compteur de mails et existence de l'année suivante (`anneeSuivante`,
  listage Drive sans lecture de fichier) livrés dans la réponse, au lieu de deux appels séparés.
- **Chronomètre** `chronoAPI()` : affiche **départ (T+), serveur et attente** séparément, grâce au
  champ `_srv_ms` posé par l'enveloppe GAS. ⚠️ `doGet` n'est plus l'aiguillage : celui-ci s'appelle
  **`_routeRequete_`**, `doGet` ne fait que le chronométrer.
- **CONFIG lu une seule fois par exécution** (memo `_configRows_` de `code.gs`, utilisé par
  `getActiveYear`, `getIndisposYear`, `_indisposOuverte_` et `checkCode`) : les ~1,5 s de
  relectures sont récupérées. ⚠️ Toute action qui **écrit** dans CONFIG doit appeler
  `_configReset_()` juste après, sinon la suite de la même exécution relit l'ancienne valeur.
- **Chantier performance CLOS le 30/07/2026**, vérifié en lecture du code en ligne (et non au
  ROADMAP, qui était périmé) : `mailNonLus`, `getSecteurs` et `getCsTemplate` sont dans
  `getAdminBootstrap`, et `gas/mesure_perf.gs` a été supprimé du dépôt **et** de l'éditeur Apps
  Script (confirmé par Arthur le 30/07).

### ⛔ `index.html` — piste fermée, ne pas la rouvrir

Mesuré chez Arthur : 2 appels, ~10,6 s. Deux optimisations étudiées **et écartées sur mesure** :
1. **Gardes livrées par le `login`** → gain réel **130 ms**, pour une lecture Drive (~1 s serveur)
   ajoutée à chaque login de MAR. Rapport défavorable, non livré.
2. **Login et planning en parallèle** → impossible : **Apps Script sérialise les exécutions d'un
   même utilisateur** (4 appels parallèles = 4 à 7 s chacun contre 1,8 s seul).

**`index.html` est à l'optimum de ce qu'Apps Script permet.** Ses ~10 s sont 2 × le péage.

### Comparatif d'hébergement (mesuré le 29/07, même poste, réponse vide des deux côtés)

| | Cloudflare Workers | Apps Script |
|---|---|---|
| Mesures | 93 · 101 · 204 ms | 2,62 · 2,80 · 2,85 · 3,02 · 4,00 s |
| **Médiane** | **~100 ms** | **~2 850 ms** |

**Facteur ≈ 28.** Apps Script fait **deux allers-retours** par appel (redirection puis contenu),
Cloudflare un seul — pénalisant sur connexion à forte latence.

⚠️ **Ce que la mesure ne dit pas** : le coût de lecture des données depuis une plateforme externe.
Sur `admin.html`, le travail serveur (~4,8 s) domine désormais le péage : migrer y serait
décevant. Sur `index.html` et `planning.html` (lecture pure), le gain serait franc.
**Décision : chantier non lancé** (effort de plusieurs semaines, duplication des codes d'accès de
23 médecins sur une plateforme tierce, second service à maintenir seul, et calendrier du 4/09).

### Cache serveur des onglets de configuration — LIVRÉ (01/08/2026)

`CONFIG`, `SECTEURS`, `CS_TEMPLATE`, `SEUILS` sont gardés en `CacheService` (10 min).
Helpers dans `code.gs` (`_cacheLire_`, `_cacheEcrire_`, `viderCacheConfig`), lecture
mise en cache dans `portail.gs`, invalidation accrochée à **`WRITE_ACTIONS_LOCK`** dans
`_routeRequete_` (et non action par action : une écriture ajoutée demain sera couverte
sans que personne y pense). Bouton **🧹 Vider le cache** dans l'onglet Maintenance.

**Motif : la VARIANCE, pas la moyenne.** Mesuré le 01/08, deux ouvertures à trois minutes
d'écart, code identique :

| | 15:03 | 15:06 |
|---|---|---|
| SEUILS + CS_TEMPLATE | 702 ms | **6 956 ms** |
| SECTEURS | 432 ms | 1 291 ms |
| MEDECINS | 257 ms | 1 048 ms |
| **Fichiers Drive (planning, affectations)** | **548 / 588 ms** | **542 / 551 ms** |

**Les lectures Drive sont stables (7 relevés : 529 à 785 ms). Les lectures d'onglets
sautent d'un facteur 10.** Chaque aller-retour vers Sheets est une occasion de tomber sur
un mauvais moment ; le bootstrap en faisait 6, il en fait 3.

Résultat mesuré : SEUILS+CS_TEMPLATE 764 → **15 ms**, SECTEURS 359 → **11 ms**,
`avant doGet` 868 → **13 ms**. `doGet` : 2 943 → **2 551 ms**.

**🔒 RÈGLE DE SÉCURITÉ — le cache de script est PARTAGÉ entre tous les utilisateurs.**
On n'y met JAMAIS une donnée qui dépend de qui appelle. Les quatre onglets retenus sont
globaux. Y mettre un planning de MAR, des indisponibilités ou des déclarations libérales
serait une faille : l'appelant suivant recevrait les données du précédent.
`MEDECINS` reste hors cache (réécrit par les formulaires, et 250 ms ne valent pas ce risque).

**Effet de bord à connaître :** une modification faite **à la main** dans le classeur met
jusqu'à 10 min à prendre effet — y compris un **code d'accès révoqué**. Le bouton de purge
est là pour ça. Toute modification passant par l'interface est immédiate.

### Pistes fermées (performance)

- Tailler les lignes vides du classeur (ouverture = 120 ms pour 1,7 M de cellules).
- Lire les JSON du Drive par identifiant direct (396 ms contre ~350 ms par nom).
- Optimisation du JSON (déjà minifié + gzip).
- **Découper le projet GAS** (sortir `generateur_gardes.gs` + `setup_annee.gs`) : mesuré
  le 01/08, la compilation vaut ~730 ms au total et ces deux fichiers pèsent 115 Ko sur
  545, soit **~150 ms**. Plusieurs semaines de travail et une architecture éclatée pour un
  septième de seconde. **Chantier annulé.**
- **Alléger le code en supprimant les commentaires** (24 % des `.gs`, 130 Ko) : on
  n'échange pas la documentation du projet contre des millisecondes.
- **`JSON.parse`/`stringify` de la réponse** : soupçonné coûteux sur 350 Ko, **mesuré à
  6 ms**. L'enveloppe `_srv_ms` insère désormais ses champs par concaténation de chaîne
  (gain nul mais code plus simple). Rappel : la taille d'un JSON ne dit rien de son coût.

---

## ✅ État par module

### Algorithme de gardes
Équité annuelle sur ~730 gardes/an, dette calculée depuis les colonnes `CIBLE*` du snapshot
`STATS_GARDES_{N-1}` (déjà pro-ratées par la présence), jamais des réels seuls.
Invariants : Σ dette = 0 par axe, repli si les cibles manquent.
**Couverture des jours serrés livrée (23/07)** : 13 jours sans binôme → 0 sur 140 années simulées,
équité et vitesse meilleures que la référence. Mécanisme décisif : passe de dernier recours.
⚠️ Ne jamais régénérer une année déjà générée (verrou de `generateGardes()`).

### Planning quotidien (`admin.html`)
Grille du comité, placement par cases, publication vers les JSON du Drive privé.
`SECTEURS` et `CS_TEMPLATE` sont la configuration — **il n'existe plus aucune copie en dur**
(6 supprimées le 29/07, dont 2 cachées dans l'export Excel). Échec de lecture ⇒ bandeau rouge
`configBanner` + **export Excel refusé** ; la grille s'affiche amputée, jamais fausse en silence.
⚠️ Restent deux listes de secteurs figées, hors config : voir Priorité 3.
⚠️ **`RI` ne doit pas rejoindre `COVERAGE`** — sa règle (mercredi/jeudi matin) est plus fine, et
il n'y a jamais de bloc cardio le jeudi.
⚠️ Les **sorties de garde restent groupées** dans l'Excel : le statut `RG` est unique, rien ne dit
de quelle garde sort la personne.
🆕 **Bande de présence en tête de l'onglet** (01/08, v1.15) : un carré = une journée ouvrée,
couleur = nombre de MAR présents (définition `presentsPool` de `code.gs`, **`G`/`G2`/`18`/`I`
comptent présents**, `PERRIN` exclu). Clic → ouvre la semaine. Aucun appel serveur. Seuils dans
l'onglet **`SEUILS`**, servi par `getAdminBootstrap`, repli silencieux 13/17. Détail complet dans
`CONTEXTE`. A remplacé l'ancienne heatmap des indispos, devenue code mort.

### Notifications de changement de planning (`code.gs`, 01/08/2026) — EN ESSAI, allumage planifié
Compare `planning_{Y}.json` à `planning_{Y}_notifie.json` après **10 minutes d'accalmie** suivant la
dernière publication ; un changement posé puis annulé ne produit aucun mail. Statut ⇒ signalé
toujours ; secteur ⇒ seulement dans la semaine du dernier Excel. Détail dans `CONTEXTE`.
**Essai réel validé par Arthur le 07/08/2026** : `NOTIF_ACTIVE='O'` + `NOTIF_EMAIL_TEST` posées —
tout part sur sa boîte perso, rien aux MARs (`_notifExpedier` : `email: testMail || vraie adresse`).
**Allumage = supprimer la propriété `NOTIF_EMAIL_TEST`, à faire APRÈS le staff et le ménage du
04/09 — jamais avant** : la démo publiera un planning 2027 fictif et le notifieur s'armera dessus
(`journal.gs` l.140) ; avec la redirection en place, ces mails fictifs tombent chez Arthur.
Colonne **`NOTIF`** de `MEDECINS` : **facultative** (absente ⇒ tout le monde reçoit), cherchée par
son nom — à créer au premier désabonnement, pas avant.
Pas de doublon avec le récap de génération (vérifié 07/08) : `generateur_gardes.gs` n'arme jamais
le notifieur ; seule la première **publication** du planning 2027 le fera, et elle sera silencieuse
(pas de photo de référence après le ménage → « photo prise, aucun envoi », l.1573).
`notifRecaler` : outil de secours si une photo de référence préexiste à une génération — inutile en
novembre, le ménage supprime la photo. Les arbitrages de conception (accalmie, deux canaux, filtres
d'horizon) ne sont écrits nulle part — à consigner avant de les perdre.

### Portail / Dashboard
`index.html` est **le seul carrefour** : toutes les pages s'ouvrent depuis ses tuiles.
Service worker sur cette page uniquement (suffisant, tout le monde y passe).

### Module libéral — lots 0, 1, 3, 2A et 2B en production
Le MAR cote, édite un devis, déclare son intervention ; le comité la voit au placement.
Détail complet : `docs/module-liberal/module_liberal_conception.md`.

**Règles métier à ne jamais « simplifier » :**
- Seuil de **30 % par axe**, CCAM et NGAP **indépendants**. La réa ne corrige que le CCAM.
- **Une ligne = un patient** (`LIBERAL_{Y}`, 9 colonnes). La fusion jour+secteur a été supprimée.
- `BR_CCAM` est datée du **bloc**, `BR_NGAP` de la **consultation** — souvent deux mois différents.
- **Le DH n'est jamais déclaré** (hors quota) et ne se répartit pas par acte.
- **Le rendement se ventile, il ne se somme pas** : le relevé certifié fixe le niveau, les BR
  déclarées la structure.
- **Jamais de % issu des seules déclarations** : le dénominateur (activité publique) n'existe que
  dans le relevé. Les déclarations donnent un **volume**, jamais un pourcentage.
- Tarifs NGAP (annexe III CCSS-CAMTI au 01/10/2025) : `C 34,40 · CS 46,00`. **L'APC est une
  cotation française, absente de la nomenclature monégasque.** Les tarifs ameli ne valent pas ici.
- `SPECIALITES` : 12 codes. **Patient mineur ⇒ `PED`**, quelle que soit la chirurgie.
- Index CCAM **v84** (régénéré le 27/07, codes et tarifs sur la même version).
  Alerte d'obsolescence calendaire à 8 puis 14 mois. **Prochaine régénération vers mars 2027.**
- ⚠️ Le devis affiche « secteur 2 (honoraires libres, non-OPTAM) » **en dur** — exact pour Arthur,
  potentiellement faux pour un autre MAR, et invisible si ça l'est.
- ⚠️ **Point ouvert établissement/DAM** : le modèle CNOM réserve l'information sur les actes **au seul
  patient**, y compris vis-à-vis des complémentaires. Non tranché localement.
- ⚠️ **Constat du 27/07 : 10 MAR sur 18 en excédent** au cumul de juin, dont 2 sur le seul axe
  NGAP. Fragilise l'hypothèse ayant servi à geler le Lot 5 — à revérifier sur 2-3 mois.

### Contrôle d'absence (`absences.html`, Lot 5-bis) — en production
Deux portes : tuile MAR et session secrétariat.
🔒 Les **motifs d'absence ne sont jamais transmis au secrétariat** (filtrage serveur).
`G`/`G2` ne comptent pas comme absence. Rôle secrétariat = liste blanche de deux actions.

### Veille bibliographique, CR d'anesthésie
En production. **Refonte du 08/08/2026 validée en production** : module autonome
`gas/veille.gs` (2026-08-08.4), règle « revue ET thème », 41 revues (23 directes +
18 généralistes sous liste blanche `PUBTYPE`), 21 thèmes, fenêtre 180 j, POST +
pagination, dates `epubdate`, codes SOURCE conformes à l'écran — 79,5 art./semaine
mesurés (cible 50-80). Filtre par revues cochées côté dashboard (v1.29). *(L'alerte « `markVeille` sans verrou ni contrôle de rôle » a été retirée le 29/07
après vérification du code : le secrétariat est déjà refusé en amont par `SECRETARIAT_ACTIONS`,
et l'action écrit **une seule cellule ciblée par PMID**, sans lire-modifier-écrire ni suppression
de ligne — son exclusion de `WRITE_ACTIONS_LOCK` est délibérée et documentée.)*

### Sécurité et robustesse
Audit en 5 axes (19-20/07) : toutes les actions derrière `checkCode()`, aucun code renvoyé en
clair, verrou d'écriture, journalisation « qui/quand » sans contenu clinique, XSS fermée dans le
volet libéral (26/07), `getReleveLiberal` réservé aux membres du groupement (29/07).
`ensureMarRows()` garantit les lignes annuelles de tout MAR actif (création et réactivation).
`annulerAbsenceLongue` n'efface que les cases valant exactement `CL`.

### Versionnement
La version du site vit dans **un seul fichier : `version.js`** (`window.SITE_VERSION`, centralisé
le 14/08/2026). Les pages qui l'affichent chargent ce fichier et posent un élément `data-version` ;
aucune n'écrit plus de numéro en dur, et le banc comme le Diagnostic refusent qu'on y revienne.
Deux chiffres, pas trois : le troisième ne disait rien à personne dans le service.
Patch → 2ᵉ chiffre · **v2.0 réservée au 5/09**, jour où le portail s'ouvre aux 23 (l'ouverture vaut
un premier chiffre ; la version est un repère pour les utilisateurs, pas pour le développeur).
**Version en cours : v1.46** (17/08/2026).

---

## 🔜 À faire

### Priorité 1 — Présentation staff du 04/09 *(session du 29/07 : deck refait, il reste 3 choses)*

**Le deck est à jour** (`docs/presentation-staff.html`, commit `6ca0b09cd1`, 33 diapos). Chiffres
alignés sur la génération réelle de 2027 et sur 400 années simulées, animations en place.
Les anciennes lignes de cette section étaient périmées et ont été **supprimées, pas démenties** :
les numéros de slides ne correspondaient plus, et `CONFIG.SUBLET_CODE` demandait d'écrire en dur
le code retiré le 22/07 pour raison de sécurité (il se saisit par `prompt()`, il n'y a **rien** à
remplir dans le fichier).

Reste à faire, par ordre de criticité :
1. ✅ **`GARDES_2027` et `STATS_GARDES_2027` supprimés le 30/07.** Le verrou de `generateGardes()`
   ne bloquera pas la démo (`GARDES_{Y}` est le **seul** onglet qui l'arme, l.138).
   `INDISPOS_2027` et `AFFECTATIONS_2027` conservés : les profils fictifs sont dedans.
   ⚠️ `STATS_GARDES_2026` doit rester en place — c'est lui qui porte les colonnes `CIBLE*` de la
   dette d'équité pour la vraie génération de novembre.
2. ✅ **Répétition à blanc chronométrée — FAITE le 10/08. Le deck était faux d'un facteur trois.**
   Mesure réelle (`chronoAPI()`, génération 2027 complète) : `generateGardes` **28,5 s** (dont 25,8 s
   de calcul serveur), `publishPlanning` **9,5 s**, `envoyerRecapIndispos` **6,4 s** — soit **~45 s**
   du clic au récapitulatif parti. Le deck annonçait « 15 secondes » à **cinq** endroits ; corrigé en
   « moins d'une minute », notes d'orateur portées à ~45 s avec le détail.
   ⚠️ **Ne PAS toucher la 6ᵉ occurrence** (« chacun vérifie, en 15 secondes ») : elle parle du temps de
   lecture humaine du certificat, pas de la machine.
   **Le péage Apps Script est mesuré et constant : 1,7 à 2,9 s par appel, douze fois de suite**, quelle
   que soit la charge (19 ms de serveur pour `getJoursFeries`, 2,0 s d'attente). Les 9 appels de
   préparation du wizard coûtent **30 s dont 19 s de péage pur**, parce que `admin.html` sérialise ses
   appels (`_fileAPI`). Paralléliser les LECTURES les ramènerait à quelques secondes — chantier
   d'après le 04/09, jamais avant.
   ℹ️ Le message « toujours en cours, patience… » s'affiche automatiquement à **45 s** (`admin.html`) :
   à 28 s la marge est confortable, mais si Google traîne le jour J il apparaîtra. C'est prévu — noté
   dans les notes d'orateur : **ne pas recliquer**.
   ⚠️ **Une seule mesure** : la variabilité d'Apps Script n'est pas connue.
3. ✅ **Relecture du deck — FAITE le 09/08 (Arthur) : visuel correct.** Restait le seul contrôle
   qu'aucune machine ne fait. Ne subsiste, non vérifié, que le rendu **au vidéoprojecteur** de la
   diapo 16 (le rosé du repos du lendemain peut passer pour du blanc) — à regarder le jour même,
   sur le matériel de la salle.
4. Vérifier que les **profils indispos 2027 des autres MARs sont remplis** (annoncé à la salle).
5. **Notification de génération sur le téléphone d'Arthur** — ✅ **canal livré et prouvé le
   12/08** (notification de test reçue sur téléphone réel). Déjà câblé sur la fin de génération :
   rien à faire le jour J. Check-list d'avant-séance et détail : voir Priorité 2 ter, phase 1.
   La démo n'en dépend pas.
   `PERIODES_VAC` : ✅ déjà réglé sur 2027 (Arthur, 30/07).
   📌 **`PERIODES_VAC` ne contient qu'UNE année à la fois — celle qu'on prépare, et c'est normal.**
   `savePeriodes` (Indispos.gs l.1765) efface tout l'onglet et réécrit les périodes envoyées. Rien à
   sauvegarder, rien à restaurer : les deux seuls consommateurs (`getVacConfig` via `getIndisposYear()`,
   `getConflitsAll` via l'année passée en paramètre) travaillent **toujours sur l'année préparée, jamais
   sur l'année en cours** — vérifié en lecture de code le 30/07. Ne pas chercher 2026 dedans.

### La séquence du 04/09 — avant, pendant, après *(écrite le 17/08/2026)*

Trois moments, trois listes. Celle du soir (le ménage) existait déjà ; celles d'avant et de pendant
manquaient, et **deux points vérifiés dans le code feraient rater la démonstration** s'ils restaient
implicites.

#### AVANT — le 1ᵉʳ au soir (tout dans la foulée), puis le matin du 4

*(Réaligné le 19/08 sur la décision d'Arthur : « je fais tout dans la foulée de la démo —
démo puis effacement pendant ma garde du 01/09 ». L'ancien découpage J-7 (28/08) / J-1 (03/09)
est caduc.)*

**LE 1ᵉʳ SEPTEMBRE — répétition générale, seul, en 4G, pendant la garde** (détail en tête de
document). Elle génère 2027 pour de bon. **Donc remise à zéro LE SOIR MÊME, dans la foulée** —
les deux gestes sont indissociables : interrompu entre les deux, le bac à sable resterait généré.

**LE SOIR MÊME DU 1ᵉʳ — remise à zéro du bac à sable. ⚠️ POINT CRITIQUE, vérifié dans le code.**
Supprimer `GARDES_2027`, `STATS_GARDES_2027` et `LIENS_R_2027` — **garder `INDISPOS_2027`**, c'est la
matière première de la génération.
Pourquoi c'est critique : le wizard 2 contient une **garde d'idempotence** (`Indispos.gs`, action
`generateGardes`) — si `GARDES_{Y}` **et** `STATS_GARDES_{Y}` existent et sont cohérents, il **ne
régénère pas** : il renvoie les statistiques existantes et enchaîne sur publication et récapitulatifs.
Ce garde-fou est excellent en production (il empêche de détruire un planning valide après une réponse
perdue) mais **en démonstration il est fatal** : la salle verrait « 730 gardes » s'afficher
instantanément sans qu'aucun calcul n'ait eu lieu, et la répétition du 1ᵉʳ aurait justement laissé
les onglets en place. *Aucun message d'erreur n'apparaît : c'est un succès silencieux.*

**LE MATIN DU 04/09 — les 24 adresses mail, puis l'envoi des codes à 12 h 30.**
*(décidé par Arthur le 17/08 : le staff débute à 14 h, les codes partent en début d'après-midi.)*
*(Décidé le 19/08 : les adresses sont préparées À L'AVANCE dans une **colonne de garage** tout à
droite de `MEDECINS`, après PRENOM, en-tête « EMAILS_EN_ATTENTE » — vérifié : le code lit l'onglet
par positions fixes, une colonne au-delà de la 20ᵉ est invisible pour lui. Ne jamais INSÉRER de
colonne au milieu de l'onglet. Le matin du 4 : copier cette colonne dans EMAIL — en **valeurs** —
puis lancer le 🔍 Diagnostic : son contrôle « Emails au format douteux » sert de filet avant
l'envoi.)*
Les 24 MAR actifs sans adresse sont collés dans `MEDECINS`, colonne EMAIL, puis
Maintenance → **Envoyer aux MARs sélectionnés**. Les codes existent déjà (un seul MAR n'en a pas :
TESSIER) — l'envoi **ne régénère rien**, il transmet le code en place.

**Ce que ce choix règle, et ce qu'il crée.** Envoyer une heure et demie avant la séance supprime
*entièrement* la fenêtre de curiosité : personne ne peut se connecter avant, donc plus aucun risque
qu'un MAR tombe sur des gardes 2027 fictives, et l'ordre nettoyage → envoi cesse d'être critique.
En contrepartie, **il n'y a plus de nuit pour rattraper une adresse fausse** : si un code ne
fonctionne pas à 14 h 05, c'est devant la salle. D'où la marge de 1 h 20 et le contrôle préalable.

| Heure | Geste |
|---|---|
| Matin | Nettoyage du bac à sable, JSON du Drive, synchronisation, désactivation de TESSIER, saisie des 24 adresses |
| Matin, **en dernier** | **Diagnostic** — la ligne « MARs actifs sans code d'accès » doit dire **aucun**. Seul contrôle qui garantit que les 25 envois auront un code à transmettre |
| 12 h 30 | **Envoi d'essai à un seul destinataire** (Arthur). Vérifier la réception *et le dossier* |
| 12 h 40 | Envoi aux autres |
| 12 h 45 | Lire le compte rendu : il **nomme** ceux qui n'ont rien reçu, faute d'adresse ou de code |
| 14 h | Staff |

Quatre points vérifiés :

- **Lecture fraîche.** `sendCodes` relit `MEDECINS` directement (`getDataRange`), sans mémoire
  intermédiaire : une adresse saisie une minute avant est prise en compte. *Aucun délai à respecter.*
- **Quota.** Compte Google gratuit = 100 envois/jour. Avec 25 destinataires, `_quotaEmailInsuffisant_`
  laisse passer et il reste de quoi refaire un envoi complet le même jour. Le Diagnostic affiche le
  reste avant de partir.
- **L'ordre nettoyage → envoi reste la règle**, même s'il devient peu risqué à cette heure-là :
  `index.html` demande `planning_{année active + 1}` **à chaque ouverture** depuis la v1.30.2, donc
  des fichiers 2027 encore publiés montreraient des gardes fictives au premier MAR qui se connecte.
- **TESSIER** part le 01/09 : le désactiver avant l'envoi, sinon il figure dans la liste et le compte
  rendu le signalera « sans code ».

**Prudence sur l'envoi groupé** : 25 messages identiques partant d'une adresse Gmail en quelques
secondes, c'est le profil type de ce que les filtres écartent. L'envoi d'essai de 12 h 30 dit **dans
quel dossier** chercher — et permet de l'annoncer avec certitude plutôt que d'espérer.

**À dire dès l'ouverture de la séance, avant même la diapo 7** : « vous avez reçu il y a une heure un
mail de *planningmedic@gmail.com*, objet **[Planning-Med] Votre code d'accès**. Sortez-le
maintenant — et regardez vos indésirables. »

#### PENDANT — ce qui doit être vrai au moment de la démonstration

| Ce qui doit être en place | Pourquoi |
|---|---|
| `INDISPOS_2027` présent et rempli | matière première de la génération en direct |
| `GARDES_2027` **absent** | sinon le wizard ne génère pas (garde d'idempotence) |
| Canal de notifications **ouvert** | fait le 16/08 par Arthur — sans quoi l'abonnement de la diapo 7 est refusé et aucun téléphone ne sonne à la diapo 28 |
| Codes reçus (envoyés à 12 h 30) | la diapo 7 leur demande d'installer l'app **et** de s'y connecter |
| Quota email disponible | les récapitulatifs de génération partent en fin de démonstration |

Deux gestes pendant la séance : **diapo 7**, faire installer l'app et activer les notifications
(vérifier à la voix) ; **diapo 28**, laisser sonner les téléphones avant de commenter.

#### APRÈS — le soir même

C'est la check-list ci-dessous, en 9 étapes numérotées. Un point change avec la distribution des
codes : à partir du 04/09, les 23 peuvent se connecter **et** échanger des gardes — l'interrupteur
d'ouverture ayant été posé le 16/08. L'annonce du 05/09 décrira donc une possibilité déjà active
depuis la veille.

### Ménage post-démo — check-list (à exécuter le 04/09 au soir, puis supprimer cette section)

> **Révisée le 16/08/2026.** Elle était complète le 10/08 ; trois choses sont entrées dans le système
> depuis (`LIENS_R_{Y}` le 13/08, l'onglet `ECHANGES` le 13-14/08, l'oubli des années au miroir le
> 09/08) et la dernière **impose un ordre**. Les étapes sont désormais numérotées dans l'ordre
> d'exécution : le ménage se termine par la synchro, jamais l'inverse.
>
> **Contexte 04/09 (confirmé par Arthur le 16/08)** : après la présentation on repart de zéro — tout
> le 2027 de démonstration est effacé — puis le **W1 s'ouvre le jour du staff vacances**, sur
> `staff.html`. La campagne qui s'ouvre en octobre est donc bien celle de **2027**.

**1. Supprimer les cinq onglets `_2027`** : `INDISPOS_2027`, `AFFECTATIONS_2027`, `GARDES_2027`,
`STATS_GARDES_2027`, **`LIENS_R_2027`** *(ajouté le 16/08 : cet onglet n'existait pas quand la liste a
été écrite — il est créé par le générateur depuis le 13/08 et suit le même cycle de vie annuel que les
quatre autres, `archiveMoveTabs_` le traite déjà comme tel)*.
Impératif, pas cosmétique : `initYear` (Indispos.gs l.≈2613) **refuse de tourner** si `INDISPOS_2027`
existe (« INDISPOS_2027 existe déjà ») → le W1 serait bloqué. Vérifié le 16/08 : c'est sa **seule**
précondition. Et `AFFECTATIONS_2027` n'étant recréé que s'il est **absent**, les affectations fictives
resteraient en place.

**2. `PLANNING_OVERRIDES` : supprimer les lignes datées 2027** — *constat du 10/08/2026, effet de bord
jamais anticipé.* Cet onglet est **UNIQUE, sans année dans son nom** : une simple liste
`DATE | MAR_ID | SECTEUR_MATIN | SECTEUR_AM | COMMENTAIRE`. Supprimer les onglets, les JSON du Drive et
relancer la synchro **ne le touche pas**. Or les overrides sont appliqués comme **dernier calque** à la
construction du planning (`code.gs` l.≈1075) : ils se recollent sur toute grille régénérée.
**Constaté par Arthur le 10/08** : après suppression des onglets, des JSON, synchro complète ET
régénération de 2027, ses placements de test étaient toujours là. **38 lignes datées 2027** au relevé du
16/08 (le Diagnostic les compte : bloc « Overrides planning », dates hors année en cours).
**Le risque n'est pas la démo, c'est NOVEMBRE** : ces lignes se colleraient sur la **vraie** génération
2027, indiscernables de vraies affectations. Silencieux, durable.
**Geste** : ouvrir `PLANNING_OVERRIDES`, trier par DATE, supprimer les lignes 2027. À la main.
⛔ **TRANCHÉ le 10/08/2026 : ce cas restera MANUEL. Ne pas le reproposer.** Supprimer une année à venir
est un geste rare et volontaire ; on est déjà dans le classeur à ce moment-là, un tri par DATE rend les
lignes évidentes, et cela ne justifie pas d'écrire du code qui efface des données. *(Une purge existe,
`setup_annee.gs` l.≈590, mais ne couvre que l'année archivée à la clôture — pas une année à venir
servant de terrain d'essai.)*

**3. `ECHANGES` : supprimer les lignes d'année 2027** — *ajouté le 16/08/2026, même piège que le point 2.*
Onglet **UNIQUE, sans année dans son nom**, créé par le circuit d'échanges le 13/08. Au relevé du 16/08 :
4 lignes réelles, dont **3 dons acceptés portant sur 2027**, faits pendant le test à deux du 14/08.
Vérifié dans le code : `getEchangesEnveloppe` publie **toutes** les lignes au miroir, sans filtre d'année
ni d'état — les 23 verraient donc, dans leur écran d'échanges, des dons portant sur une année qui
n'existe plus. Même geste : trier par ANNEE, supprimer les lignes 2027.

**4. `CONFIG` : retirer `INDISPOS_ACTIVE = 2027`** (bouton du wizard = `clearIndisposYear`, ou
suppression de la ligne). Deux raisons, dont une découverte le 16/08 :
- tant qu'elle est là, la tuile « Mes indispos » est ouverte aux 23 MARs sur une année fictive ;
- ⚠️ **elle bloque l'oubli du miroir** : `_miroirPurgerAnnees_` protège explicitement l'année de
  campagne (garde-fou 3, `getIndisposYear()`). Si la synchro tourne avant que cette ligne soit retirée,
  **aucune clé 2027 n'est effacée du miroir, et rien ne le signale.** D'où sa position ici, AVANT
  l'étape 6.

**5. JSON du Drive** (dossier « Planning-Med-JSON ») : supprimer `planning_2027.json`,
`affectations_2027.json` **et `planning_2027_notifie.json`** *(le notifieur dépose cette photo de
référence à chaque publication, même éteint)*. **Butoir dur : avant le 1er octobre.**
Tracé dans le code le 30/07 :
- `planning.html` l.≈1119 sonde les années `2026 → année+1` avec `getAffectationsJson` : c'est
  **`affectations_2027.json` qui ouvre la porte**. Dès qu'il existe, **2027 apparaît dans le sélecteur
  de tous les MARs**.
- `index.html` : depuis la v1.30.2 la demande de `planning_{active+1}` part à **chaque ouverture**
  (le seuil « dès octobre » a sauté le 08/08). Des JSON de démo laissés en place afficheraient des
  **gardes 2027 fictives** dans « prochaine garde » et « Mes congés ».
- `admin.html` : `anneeSuivante` n'ajoute que « 2027 — N+1 » au sélecteur du comité et fait passer le
  bandeau de clôture de ⛔ à 📦 — bandeau invisible avant le premier lundi de 2027. Sans effet en septembre.
- Session secrétariat : `getPlanningJson` n'est pas dans la liste blanche → aucun accès.
- ⚠️ Non prouvé en réel : supprimer les fichiers ne vide pas le cache `sessionStorage` (`pmPlan:2027`)
  d'un onglet déjà ouvert — la copie en cache survit jusqu'à la fermeture de l'onglet.

**6. Lancer `miroirSyncComplet` — APRÈS les étapes 1 à 5, jamais avant.** C'est cette passe qui efface
du miroir les clés de l'année retirée (`planning_2027`, `affectations_2027`, `indispos_2027`,
`gardes_2027`, `stats_2027`, `equite_live_2027`, `joursferies_2027`, `liberal_2027`). Elle tranche sur
la **structure** — quels onglets `GARDES_{Y}` existent — donc l'étape 1 la conditionne, et l'étape 4
la débloque. Sans elle, supprimer onglets et JSON ne retire rien du miroir : c'est le défaut constaté
en production le 09/08.
*(`equite_live_` a été ajouté à la liste des clés effaçables le 16/08 — il manquait depuis sa création
le 13/08. Le banc compare désormais cette liste aux clés réellement construites par année : une famille
qui échapperait à l'oubli fait échouer le banc.)*

**7. Code d'accès de WS** : saisi devant la salle → « Régénérer le code » dans MEDECINS (`resetCodeMar`) :
nouveau code envoyé par mail, ancien tracé dans `HISTORIQUE`. Idem `ADMIN_CODE` (CONFIG, à la main) s'il
a été projeté.

**8. Mails : rien ne part tout seul.** Vérifié dans le code : `setIndisposYear` n'envoie aucun message ;
les envois sont des actions explicites (`sendCodesWithRecap`, `envoyerRecapIndispos`, `envoyerRecapGardes`).
Contrôler seulement qu'aucun bouton d'envoi n'a été cliqué — journal `HISTORIQUE` en cas de doute.

**9. Terminer par 🔍 Diagnostic système** (onglet Maintenance) : onglets, JSON du Drive, overrides hors
année en cours (doit retomber à 0), version du site.

**Avant le W1 d'octobre, indépendamment du ménage** : ⚠️ **24 MAR actifs sur 25 n'ont aucune adresse mail**
dans `MEDECINS` (relevé au classeur le 16/08). L'assistant 1 envoie les codes par mail — la campagne 2027
ne peut pas partir en l'état. Rien dans le code ne contourne une case vide.

### Priorité 1 bis — Deux données à trancher AVANT la génération de novembre

Aucune urgence pour le 04/09, mais elles faussent la génération réelle si elles restent en l'air.
Arthur n'avait pas la réponse au 29/07.

- **`date_fin` de FAUVEL.** `simulateur/demographie.js` le fait partir fin février 2027 ; `MEDECINS`
  n'a aucune `date_fin`. Le probable, d'après Arthur : le 150 % cumulé AF + LC devient un 50 % seul en
  mars 2027. Si le départ est réel et la colonne vide, l'algorithme lui donne une cible pleine de 34,6
  au lieu de ~5,4, et **les cibles des 21 autres sont fausses de ~1,5 garde chacune**.
- **MERCIER et l'exemption de garde à 60 ans.** Il atteint 60 ans en 2027 (né en 1967 d'après le modèle).
  La règle d'exemption est réelle ; WS en est une exception assumée et continue les gardes. Si RM
  l'invoque, Σ des poids passe de 21,05 à 20,05 : **la base passe de 34,6 à 36,3**, soit +1,7 garde
  pour chacun des autres, et le slide des cibles devient faux dans ses 24 lignes.

### Priorité 2 — Module libéral, brique convergence 30 %
Ordre restant : **2C** (recoupement, taux de couverture, rendement) puis **Lot 4**.
- **Lot 4 pas envisageable avant mi-2027** : il lui faut des rendements mesurés, donc plusieurs
  mois de 2A+2B.
- Chantier de **conception**, pas de code — mérite un fil dédié. Jeu d'essai : relevé réel
  janvier→juin.
- Picker des consultations libérales d'endoscopie : plus aucun contrôle automatique depuis le
  retrait de la rotation (20/07) — attribution 100 % manuelle, règle du 8.1 à vérifier de tête.
  *(Rangé ici le 29/07 : c'est une question de règle métier, pas une dette de code.)*
- ❄️ **Lot 5 (orientation financière par la secrétaire) : GELÉ** depuis le 24/07 — à revoir au vu
  du constat sur les excédents.

### Priorité 2 bis — nouvel établissement (janvier 2027) : la réorganisation des secteurs *(cadrage du 30/07, aucune conception faite)*

**Acquis (Arthur, 30/07) : les codes de secteurs changent, de façon certaine.** Structure annoncée :
de **grands secteurs** (« Bloc long », « Bloc court »…) contenant des **sous-secteurs** (endoscopies,
cardio…). **L'organisation cible n'est pas connue** — donc rien à concevoir tant qu'elle ne l'est pas.
Ce qui suit n'est pas une conception, c'est l'inventaire de ce que le changement casse.

1. **`COVERAGE` (admin.html l.≈3754, revérifié 06/08) deviendra une liste de codes morts** → le « + » de case à
   pourvoir **s'éteindra partout, en silence** : ni erreur, ni message, juste un signal de sécurité
   qui disparaît. C'est le point le plus dangereux du déménagement côté logiciel.
   Correctif décidé : colonne **`COUVERTURE` (O/N)** dans l'onglet `SECTEURS` — c'est une **règle
   métier** (« ce secteur doit toujours être pourvu »), pas la liste des secteurs actifs.
   ⚠️ Conserver l'exception `RI`, volontairement hors couverture (règle plus fine, mercredi/jeudi matin).
2. **`targets` (l.≈4761, revérifié 06/08)**, boutons « Déplacer vers » du volet latéral : à alimenter par les secteurs
   actifs de l'onglet. Confort, pas blocage — on peut toujours retirer puis reposer depuis la case.
3. **Export Excel du vendredi** : déjà piloté par `SECTEURS` (`ORDRE / XL_LABEL / XL_BG / XL_ROWS`)
   et `CS_TEMPLATE` depuis juillet — un secteur créé apparaît dans le fichier sans toucher au code.
   **Mais le modèle est PLAT** : rien n'exprime « sous-secteur de ».
   **Forme retenue le 30/07 — option A, un bandeau par grand secteur** : fusion des colonnes 1→21,
   exactement le mécanisme déjà utilisé par la ligne 7 (« ANESTHESISTES AUX BLOCS »). Les
   sous-secteurs gardent leur comportement actuel (libellé fusionné en colonne 1, `XL_ROWS` pour la
   hauteur, 2 lignes = 4 initiales par demi-journée). Côté code : une colonne **`PARENT`** dans
   l'onglet `SECTEURS` et une boucle imbriquée dans `BLOCS` — pas de réécriture de l'export.
   **Maquette : `docs/maquette-export-excel-secteurs.xlsx`** (4 onglets : modèle actuel, option A,
   variante « à répartir », notes ; secteurs et initiales fictifs). Vérifié au rendu PDF : chaque
   onglet tient sur une page A4 paysage en largeur. Non vérifié : le rendu dans le vrai Excel.
   ⛔ **Écartée : la colonne mère à gauche** (cellule fusionnée verticalement, texte pivoté). La
   contrainte d'impression est la **largeur** (`fitToWidth:1, fitToHeight:0`, déjà ~30 cm pour
   28,7 cm utiles) : une ligne de plus est gratuite, une colonne de plus se paie en réduction de
   police sur tout le document, et obligerait à retoucher tout le calcul `colStart` et chaque fusion.
   ⚠️ ExcelJS : écrire dans une cellule *esclave* d'une fusion casse le fichier en production.
   **Point de départ, pas conception figée** — la maille d'affectation (point 4) reste à trancher.
4. **Question de fond, à trancher avant de coder quoi que ce soit** : l'affectation mensuelle d'un MAR
   est aujourd'hui **un code de secteur unique** (`AFFECTATIONS_{Y}`, comparé tel quel par la
   couverture). Avec une hiérarchie, est-on affecté au **grand secteur** ou au **sous-secteur** ?
   Cette réponse fixe la maille de tout le reste : couverture, volet de placement, export Excel.
5. Rappel : le rendement libéral est modélisé **par spécialité et non par secteur** précisément
   parce que les secteurs changent au nouvel établissement et pas les spécialités. Ce choix reste bon.

**Ordre : ne rien coder avant de connaître l'organisation cible.** Le jour où elle est connue → fil
de conversation dédié.

**06/08/2026 — le chantier a désormais son guide : `docs/guide-demenagement.html`**
(lié depuis le §18 du guide technique). Phases A (décisions) / B (lot de code) / C (bascule,
classeur seul) / D (contrôles), encadrés ⏳ pour ce qui attend l'organisation cible.

6. **Constat vérifié au banc le 06/08 (scénario dédié, vraies pages) : `ACTIF = N` efface
   l'historique de l'écran.** Un secteur désactivé mais encore présent dans un planning publié
   perd sa ligne dans la grille d'`admin.html` (semaines passées comprises) et un MAR placé
   dedans est **ignoré silencieusement** au rendu (l.≈3673 : `if (smap[key])`, pas de repli) ;
   sur `planning.html`, ligne, couleur et libellé disparaissent. Les données restent intactes.
   → Nouvelle décision de Phase A : garder les anciens secteurs actifs tant que l'historique
   de l'ancien hôpital doit rester consultable, **ou** ajouter au lot de code le rendu des
   secteurs inactifs encore présents dans un planning publié.

### Priorité 2 ter — Échanges et dons de gardes entre MAR, par notification *(conception arrêtée le 11/08/2026 — phase 1 AVANCÉE avant la démo, décision Arthur du 11/08 ; phases 2-5 après le 04/09)*

**But.** Un MAR propose à un autre un don ou un échange de garde depuis son téléphone. L'autre
reçoit une notification, accepte ou refuse. S'il accepte, le planning s'écrit tout seul — le
comité n'intervient pas.

**Maquette du parcours : `docs/maquette-notifications.html`** *(11/08)* — 6 scènes (activation,
pastille, bannière, écran « Mes échanges », acceptation, double notification avec R déplacé).
C'est le **contrat visuel des phases 3-4** : les libellés exacts s'y figeront. Noms fictifs
uniquement, couleurs du portail.

**Existant (lu dans le dépôt le 11/08, pas dans un document)** :
- `applyModification` (`Indispos.gs` l.1617) sait déjà faire don, échange même date, échange deux
  dates, échange de secteur — avec les garde-fous d'août : rien n'écrase une garde existante, pas
  de gardes adjacentes, tout vérifié avant la première écriture. Fermée aux MAR par
  `if (user.role !== 'admin')` l.2216.
- Le portail est déjà une application installable (`manifest.webmanifest` complet, `sw.js` en place).
- Le Worker a son stockage (`env.KV`) et son jeton : c'est lui qui portera abonnements et envois.

**Manque** :
- `sw.js` : aucun gestionnaire `push` (vérifié : 0 occurrence).
- Worker : deux routes à créer — s'abonner, envoyer (la seconde protégée par le jeton existant).
- `donGarde` ne vérifie pas que le receveur est disponible : donner une garde à quelqu'un en congé
  écraserait son V sans un mot. **Lu, non testé.** Aujourd'hui c'est l'œil du comité qui l'attrape.

**Décisions arrêtées** :
1. **Expiration d'une demande sans réponse : 48 h**, rappel unique à 24 h ; au-delà, état
   « expirée » et demandeur notifié.
2. **Filtre par défaut de l'écran : mes demandes seulement.** Tout voir = un bouton.
3. **Les demandes vivent dans un onglet `ECHANGES` du classeur** (journalisé, relisable, cohérent
   avec le reste). Le Worker ne porte que les abonnements push (KV) et l'envoi. Le GAS orchestre :
   il écrit la demande, puis demande au Worker de notifier.
4. **Aucun plafond, aucune limite de concentration** : chacun est libre de ses gardes.
5. **Samedi qui change de mains : transfert d'un R futur** du donneur vers le receveur, jamais
   création d'un R neuf (les sept contraintes de pose vivent dans le générateur, l.1274-1310 —
   ne pas les dupliquer). Si le donneur n'a plus de R à venir : la demande se crée quand même, le
   comité est notifié. La notification annonce le R déplacé, aux deux.
6. **Bouton d'activation des notifications dans `index.html`** (rôle admin d'abord) — pas dans
   `admin.html`, atteignable seulement par Safari, où iOS refuse le push hors installation.

**Contrainte posée par Arthur : les chargements restent quasi instantanés.** Conséquences :
- **Lecture : jamais le GAS, toujours le miroir.** L'écran « Mes échanges » et le badge du
  dashboard lisent le KV ; le GAS pousse l'état d'`ECHANGES` vers le KV à chaque écriture
  (création, réponse, expiration) — copie du mécanisme existant. Coût à l'ouverture : une lecture
  KV, quelques millisecondes.
- **Écriture : GAS, 2-4 s, assumé** — geste volontaire avec bouton et spinner, pas un chargement
  de page.
- **Le miroir peut être en retard, jamais faux au moment qui compte** : l'acceptation rejoue tous
  les contrôles côté GAS avant d'écrire. **Interdit** : toute « vérification fraîche » au GAS à
  l'ouverture d'un écran.

**Plan en 5 phases — 1 push par phase, chacun confirmé en production avant le suivant** :
1. **Prouver le canal — ✅ LIVRÉE ET PROUVÉE LE 12/08/2026** (16 jours avant le gel du 28/08).
   Commit `f0462dc`, site v1.31.4, banc 626 vérifications (591 + 35 nouvelles dans
   `banc/banc_notif.mjs`). **Test réel réussi** : notification `testNotificationPush` reçue et
   affichée sur l'iPhone d'Arthur (app installée, code admin), chaîne complète GAS → Worker →
   Apple → téléphone.
   **Ce qui est en place** :
   - `cloudflare/worker.js` (`miroir 2026-08-12.1`) : `/notif-cle` (clé publique), `/notif-abonner`
     (authentifié par code, **rôle admin seul, refusé côté serveur** — l'élargissement aux MAR se
     fera à la phase 4, à cet endroit et nulle part ailleurs), `/notif-envoyer` (jeton
     `PUSH_TOKEN`, chiffrement Web Push complet VAPID + aes128gcm exigé par iOS, abonnements
     morts 404/410 purgés au passage). Abonnements en KV sous `notif_sub_<id>`, préfixe absent
     de `CLE_VALIDE` : illisibles par `/read`, inatteignables par `/push` — prouvé au banc.
   - `sw.js` v3 : gestionnaires `push` + `notificationclick`, rien d'autre. Purge des caches
     des 23 faite une fois au passage v2→v3, sans incident. L'API GAS reste non interceptée.
   - `index.html` (v1.31.4) : carte « Activer les notifications », visible **rôle admin
     seul** et si le navigateur sait faire. ⚠️ La carte n'apparaît qu'avec un **code admin** —
     un code de consultation MAR ne la voit pas (vécu le 12/08, premier réflexe si « je ne vois
     pas la carte »).
   - `gas/miroir.gs` (`2026-08-12.1`) : `notifierPush_()` **jamais bloquante** (tout échec avalé
     et journalisé) + `testNotificationPush()` lançable depuis l'éditeur.
   - `gas/generateur_gardes.gs` (`2026-08-12.1`) : notification « Les gardes {année} sont
     générées » en fin de génération réussie, dans un `try` séparé — une notification ratée ne
     fait jamais échouer une génération.
   - Secrets Worker : `VAPID_PUBLIC` + `VAPID_PRIVATE` posés dans Cloudflare (Settings →
     Variables and Secrets) le 12/08. La privée n'existe **nulle part ailleurs**. En cas de
     fuite : régénérer une paire, remplacer les secrets, chacun se réabonne — rien de grave.
   - Le banc joue l'iPhone : il s'abonne avec ses propres clés, reçoit la charge chiffrée et la
     **déchiffre réellement** (RFC 8291) ; signature du JWT VAPID vérifiée à la clé publique.
   **Marche de redéploiement** (si le Worker ou les .gs doivent être repris un jour) :
   ① coller `cloudflare/worker.js` dans le tableau de bord Cloudflare → Deploy ② recopier les
   .gs dans l'éditeur Apps Script → Déployer → Nouvelle version ③ les secrets VAPID survivent
   aux redéploiements, ne pas y toucher.
   **Scénario démo du 04/09** : à la fin de la génération devant la salle, le téléphone
   d'Arthur, posé face visible, reçoit « Les gardes 2027 sont générées » ; un toucher ouvre la
   page comité. Déjà câblé, rien à faire le jour J côté code. **La démo n'en dépend jamais** :
   si la notification n'arrive pas, personne dans la salle ne le sait.
   Check-list d'avant-séance : téléphone connecté avec le **code admin**, luminosité au max,
   notifications en mode « bannière sur écran verrouillé » (sinon arrivée silencieuse dans le
   centre de notifications).
   **Gel** : plus aucune modification de `sw.js` ni du canal avant le 04/09.
   **Décision du 12/08 (soir)** : l'ouverture du canal aux 23 avant le staff a été envisagée
   puis écartée — le canal est prouvé, ça suffit pour la démo ; l'ouverture se fera à la
   phase 4 avec l'écran, comme prévu. La phase 3 se construira hors production (code + banc
   complets, poussée seulement après le 04/09 avec son écran).
2. **Boucher `donGarde` — ✅ LIVRÉE LE 12/08/2026.** `Indispos.gs` `2026-08-12.1` :
   `refuseSiIndisponible` vérifie AVANT toute écriture que le receveur est disponible le jour
   de la garde ET le lendemain (son repos). Absences bloquantes : INDISPO, VAC, FORM, TP, CL,
   CTP, CP, A (même liste que le générateur). Un SOUHAIT ne bloque pas. Banc : 8 scénarios
   (5 refus feuille intacte, 3 non-régressions), total 634 vérifications.
   **Décisions du 12/08** : `gardeExceptionnelle` reste sans ce contrôle (jamais 3 MAR de
   garde le même jour — impossible en pratique, dixit Arthur) ; `echangeGardeJours` recevra
   le sien à la phase 3, avec les contrôles joués à la création des demandes.
   **Échange de gardes ADJACENTES — ✅ LIVRÉ LE 12/08/2026** (demande Arthur du même jour).
   `Indispos.gs` `2026-08-12.2` : le cas `date2 = lendemain de date` est traité à part dans
   `echangeGardeJours`. Les contrôles jugent l'état d'ARRIVÉE (vraies adjacences, disponibilité
   des jours reçus — règle de la phase 2 appliquée) et exigent l'état de départ exact du
   générateur (repos en place, cases libres), sinon « à traiter manuellement » — on ne devine
   jamais. Écriture de l'état final cellule par cellule : le repos de chacun suit sa nouvelle
   garde, les rôles G/G2 restent attachés aux dates. L'échange non adjacent est inchangé.
   Banc : 9 scénarios (nominal 6 cellules vérifiées, ordre inversé, G2, 5 refus feuille
   intacte, non-régression), total 643 vérifications. La dette technique « bug d'échange
   adjacent » est soldée par ce chemin.
3. **Cycle demande/réponse** (le gros morceau). Onglet `ECHANGES` : id, type (don/échange), dates,
   secteurs, demandeur, receveur, état (en attente / acceptée / refusée / expirée), horodatages.
   GAS : créer (contrôles de la phase 2 joués **dès la création**), accepter (rejoue les contrôles
   puis appelle `applyModification`), refuser, expirer (déclencheur horaire). Cas samedi : transfert
   de R (comité notifié si aucun R à venir). Poussée d'`ECHANGES` vers le KV. Notifications :
   réception d'une demande, réponse, rappel 24 h, R déplacé (aux deux). Banc : cycle complet,
   expiration et samedi-sans-R compris.
4. **Écran et ouverture aux MAR.** « Mes échanges » dans `index.html` (lecture miroir
   exclusivement), bouton notifications ouvert à tous, levée du `if (user.role !== 'admin')`
   l.2216 **en dernier**. Montée de version site (2e chiffre) ; guides dans le même push.
   **Sas entre 4a et 4b** : quelques vrais échanges avec 1-2 volontaires (RW, WS) avant les 23 —
   un défaut à 3 utilisateurs se corrige tranquillement, à 23 il génère des appels.
   **Pastille d'icône (constat du 12/08, décision : phase 4)** : une notification web ne pose
   PAS de pastille toute seule sur iPhone — bannière et pastille sont deux mécanismes séparés,
   la pastille se demande explicitement (API de badge, iOS 16.4+, app installée). À brancher
   ici, où elle a un sens : posée à l'arrivée d'une demande (2 lignes dans le gestionnaire push
   de `sw.js`), comptée sur les demandes en attente, effacée à l'ouverture du portail (1 ligne
   dashboard). Volontairement PAS fait en phase 1 : toucher `sw.js` pour un confort sans rôle
   dans la démo violerait le gel — un seul chantier cohérent vaut mieux que deux retouches.
5. **Brancher le reste sur le tuyau** (plus tard). Planning republié, génération annuelle,
   ouverture de campagne, rappel de garde la veille — chacun un simple appel à la route d'envoi.
   Préférences par MAR (quoi, par quel canal) en dernier.

**Rollback** : chaque commit autonome, revenir = re-pousser le fichier précédent. Seule exception :
`sw.js` — une fois la version montée, on ne redescend pas, on remonte. Raison de plus pour que la
phase 1 soit minuscule.

**Les deux risques réels** : iOS et l'installation sur écran d'accueil (à vérifier tôt, phase 1) ·
le transfert de R (la seule logique neuve, phase 3 — le reste réutilise `applyModification` tel quel).

⚠️ **`sw.js` est servi aux 23 : toute montée de version purge leurs caches.** La seule montée
autorisée avant le 04/09 est celle de la phase 1 (18-20 août, un soir calme). Aucune autre.

### Priorité 3 — Dettes techniques
- **Deux listes de secteurs encore figées dans `admin.html`** (`COVERAGE` l.≈3754, `targets` l.≈4761 — revérifiées 06/08)
  *(trouvées le 29/07, revérifiées présentes le 30/07)* : **un secteur créé dans l'onglet n'apparaît
  dans aucune des deux.** Traitement et solution retenue : voir **Priorité 2 bis (nouvel établissement)** ci-dessus —
  c'est le même chantier. Rien à faire avant le 04/09.
- **Écran « Paramètres » d'`admin.html` : MORT** *(trouvé le 01/08)*. `renderParametres()`
  (l.~7222) n'est appelée nulle part, `configData` n'est jamais rempli, `#paramsBody` n'existe pas
  dans la page. Côté serveur `saveConfig` fonctionne toujours. **Conséquence : régler quoi que ce
  soit dans `CONFIG` impose d'ouvrir le classeur à la main** — donc de passer à côté d'`ADMIN_CODE`
  et `SECRETARIAT_CODE`. C'est ce constat qui a fait créer l'onglet `SEUILS` séparé plutôt que
  d'ajouter deux lignes à `CONFIG`. **Tranché par Arthur le 07/08 : le rebranchement sur `CONFIG`
  est ÉCARTÉ** — argument de sécurité : les secrets doivent rester dans le classeur, pas transiter
  par une page web. Reste : supprimer le code mort (orientation retenue, à grouper avec le retrait
  d'`OVERRIDES` — même genre de lot) · ou rebrancher **sur `SEUILS` seulement** si le besoin de
  régler les bornes souvent apparaît (pas le cas à ce jour, réglées une fois le 01/08).
  ⚠️ Lot séparé, **après le 04/09**.
- **Code mort — INVENTAIRE REFAIT SUR LE CODE EN LIGNE le 10/08/2026** (la description
  précédente était périmée : elle annonçait un lot de trois morceaux dont un n'existe plus).
  État réel, à traiter **après le 04/09** :
  - `gardeExceptionnelle` — action serveur **complète** (`Indispos.gs` l.1750), qu'aucun bouton
    n'appelle. Le morceau le plus substantiel et le plus délicat : c'est une **écriture dans le
    planning**. Avant de retirer, vérifier qu'aucun chemin ne l'atteint — pas seulement qu'aucun
    bouton ne la nomme.
  - `PLANNING_OVERRIDES` — **18 occurrences**, 9 dans `code.gs` et 9 dans `Indispos.gs`. C'est la
    partie sérieuse : elle touche l'écriture du planning dans les deux fichiers les plus critiques.
    Piège nommé le 30/07 et toujours valable : `_localOverrides` ne dit pas de quel système elle
    relève (`OVERRIDES` ancien, dont l'onglet n'existe plus, vs `PLANNING_OVERRIDES` actuel).
    Conséquence visible aujourd'hui : le panneau « Modifications en attente » d'`admin.html`
    affiche **toujours** « ✅ Aucune modification en attente ».
  - `_reveilAPI()` — 3 lignes dans `indispos.html` (l.740), définie et **jamais appelée** ; son
    appel est commenté depuis le 01/08, décision prise après mesure. Ne pas rouvrir la décision,
    juste retirer la fonction.
  - ✅ **L'écran « Paramètres » n'existe PLUS** dans `admin.html` — il n'en reste qu'un titre de
    section en commentaire. Le lot annoncé était donc surdimensionné d'un tiers.

  **Pourquoi ce n'est pas urgent** : rien n'est ralenti, rien n'est faux, aucun MAR n'est gêné.
  Le seul coût est de la confusion à la lecture, plus le panneau trompeur ci-dessus. En face, le
  risque est réel — 18 points d'écriture du planning. **Banc solide + vérification en production**,
  pas une fin de session.
- **Décompte de la tolérance jeudi/samedi non remesuré** sur les 400 années *(le guide n'affiche
  plus aucun chiffre faux, il dit « exceptionnelle » — c'est un confort, pas une correction)*.
  Coût mesuré le 30/07 : **1 min 14 s par scénario**, soit ~25 min pour les 20.
- **Indispo saisie AVANT le staff, écrasée par une vacance** *(examiné le 30/07, **décision :
  on laisse comme ça**)*. La case du comité gagne, la saisie du MAR est perdue sur ce jour et
  devient non modifiable. **Impact nul sur les gardes** : `INDISPO` et `VAC` bloquent
  identiquement (`blocked()`, l.420). Seul cas gênant : **retirer** ensuite la vacance laisse la
  case vide, l'indispo d'origine ne revient pas. Deux pistes étudiées et **non retenues** :
  verrou `STAFF_VALIDE` sur `indispos.html` (bloquerait la démo du 04/09, et retarder
  `INDISPOS_ACTIVE` déplacerait toute la résolution d'année d'un an en silence) et marqueur de
  conflit dans `staff.html`. Ne pas les reproposer sans élément nouveau.
- *(À l'appréciation d'Arthur)* rotation du token GitHub.

*Traitées le 29/07 : tables de configuration en dur (6 supprimées, repli remplacé par un bandeau
visible) · tri `roleOrder` des volants (helper `_rangRole_`) · limites de saisie des codes d'accès.
La ligne `markVeille` a été supprimée : c'était une fausse alerte.*

---

### Jours de congé accordés en sureffectif — équité à surveiller *(piste du 10/08/2026)*

**D'où ça vient.** La bande de présence montre au comité, pour chaque jour ouvré, le nombre de
médecins présents en journée et les jours de sureffectif. Elle rend possible une décision qui était
auparavant un pari : accorder un jour de congé supplémentaire un jour où l'effectif le permet.

**Le risque, soulevé par Arthur.** Ces jours sont un avantage réel. S'ils profitent toujours aux
mêmes — les plus rapides à demander, les plus proches du comité, ceux qui pensent à regarder — le
mécanisme censé améliorer les choses crée une inéquité. Et **invisible** : ces jours ne sont ni
des gardes, ni des récupérations, ni des congés statutaires. Ils n'entrent dans aucun compteur.

> Le principe qui a fait l'équité des gardes s'applique tel quel :
> **ce qui se compte se répartit, ce qui ne se compte pas dérive.**

**Piste, non instruite** : tracer ces jours avec un motif distinct, et exposer un compteur par MAR
au même titre que les gardes et les récupérations.

**⚠️ Trois précautions avant toute ligne de code :**
1. **Vérifier d'abord que ça n'existe pas déjà.** Il y a des statuts de congés, une gestion des
   absences longues et un suivi par MAR — la recherche n'a pas été faite. Reproposer l'existant est
   l'anti-pattern nommé plus haut, commis plusieurs fois cette semaine.
2. **La question n'est pas technique.** C'est au comité de décider si ces jours doivent être
   équilibrés ou relever du cas par cas. Le système peut compter ; il ne peut pas trancher ça.
3. **Rien avant le 04/09.**

**À mesurer pour le retour d'expérience** (poster SFAR 2027) : nombre de congés supplémentaires
accordés avant et après. Ce serait un chiffre du service, pas un chiffre emprunté à la littérature.

### Valoriser le travail : poster SFAR 2027, puis article *(cadrage du 10/08/2026)*

**Objectif énoncé par Arthur : que le projet ne meure pas une fois en place.** Une publication est
la seule forme de survie qui ne dépend de personne — un système tenu par une seule personne
s'éteint avec elle, un travail publié reste citable et reproductible.

#### Ce qui a été décidé, et ce qui a été écarté

**Format retenu : retour d'expérience sur une année complète d'usage.** Cible : **poster / résumé
au congrès SFAR 2027**, puis éventuellement un article. Le poster d'abord, délibérément : format
court, on voit en direct si le sujet intéresse, et on rencontre ceux qui ont le même problème.

⛔ **ÉCARTÉ — l'enquête de satisfaction avant/après. Ne pas la reproposer.** Trois raisons, dans
l'ordre où elles sont apparues :
1. **Un avant-après juge l'état antérieur**, produit pendant des années à la main par des collègues
   du service. Demander à 24 médecins de le noter, même anonymement, revient à leur faire évaluer
   le travail de quelques-uns d'entre eux. Arthur va cosigner avec ces personnes.
2. **Biais d'annonce** : au moment où la mesure initiale aurait dû partir, l'équipe savait déjà
   qu'un changement était en préparation.
3. **Une mesure initiale après le 04/09 est impossible** — biais de rappel massif, les répondants
   reconstruiraient leur souvenir de l'ancien système à la lumière du nouveau.

*Une enquête reste possible en 2027-2028, comme travail distinct : sur le fonctionnement en place,
sans comparaison à ce qu'il a remplacé, et portée par le comité.*

**Conséquence pratique : aucune échéance avant le 04/09.** L'abandon de l'enquête supprime la seule
contrainte de calendrier du projet de publication.

#### Ce que le retour d'expérience rapportera — que des données calculées

| Donnée | Source | Quand |
|---|---|---|
| Équité de l'attribution initiale, 2026 vs 2027 | `STATS_GARDES_*` | **déjà relevé** (voir plus bas) |
| Couverture : jours sans effectif de garde complet | planning publié | déjà : **0** sur 364 en 2027 |
| Consultation de l'écran d'équité (combien de MAR) | journal | 2027 |
| Échanges et dons de gardes | journal | 2027 |
| Congés supplémentaires accordés en sureffectif | à définir | 2027, voir section précédente |
| Temps de production du planning par le comité | déclaratif, porte sur une **tâche** | sept.-oct. 2026 |
| Taux de complétion de la campagne d'indispos | système | nov. 2026 |

**Chiffres d'équité déjà mesurés (10/08/2026), sur l'attribution initiale avant tout échange :**

| | 2026, manuel | 2027, algorithmique |
|---|---|---|
| écart maximal à la part théorique | **8,4 gardes** | **1,3 garde** |
| écart absolu moyen | 3,06 | 0,55 |
| MAR à ±1 garde de leur part | 19 % (4/21) | 95 % (21/22) |

⚠️ **Mesurer sur l'attribution initiale, jamais sur le réel.** Les échanges et dons sont volontaires
et souhaités : certains MAR veulent moins de gardes, d'autres davantage. Les compter comme des
écarts mesurerait la liberté laissée aux gens, pas la qualité de l'attribution. *Le système
garantit un point de départ équitable ; ce qui suit appartient aux médecins.* Cette distinction
n'apparaît dans aucune publication existante — c'est un apport du travail, à expliciter.

#### L'angle : ce que personne n'a publié

**L'équité de TOUTE l'équipe est consultable par chaque MAR, à tout moment.** Ailleurs, l'équité
est une propriété que le logiciel garantit et que l'encadrement constate ; ici c'est une
information interne publique. Aucune des publications identifiées ne décrit cela.

S'y ajoutent : la règle d'attribution **publiée** plutôt qu'enfouie chez un éditeur · la
description complète du **coût réel** (0 €, du temps) · et la **dépendance à une personne**, à
écrire comme un résultat et non comme un aveu — c'est la première question d'un chef de service
qui lit l'article.

#### Modalités SFAR (vérifiées le 10/08, à reconfirmer)

- **3 500 caractères** maximum, espaces compris, pour l'ensemble du résumé.
- L'orateur doit être **à jour de sa cotisation SFAR** ou avoir réglé son inscription ; aucune
  communication n'est définitivement acceptée avant paiement de l'inscription.
- Recevabilité examinée sur les **dispositions éthiques** — préparer la réponse : données
  d'organisation interne, aucune donnée patient, aucune donnée de santé.
- ⚠️ **Ne pas venir présenter un résumé accepté expose à une interdiction de soumission de trois
  ans.** On ne soumet que si on est certain d'y aller.
- L'appel à communications 2027 n'était pas publié au 10/08/2026. **À surveiller vers décembre.**

#### Contexte bibliographique — INCOMPLET, à refaire

Identifié : Sumrall (*Ochsner J* 2025, anesthésie, logiciel commercial — sa limite déclarée est un
instrument de satisfaction **propriétaire**, ni items ni taux de réponse publiables) · Biot
(*Cureus* 2026, pédiatrie, système fait maison par un non-informaticien) · un outil en médecine
interne mesurant satisfaction et perception d'équité · Afonso (*Anesthesiology* 2021).

⚠️ **Cette revue est partielle** : pas d'accès à une base bibliographique depuis l'environnement de
travail (`eutils.ncbi.nlm.nih.gov` bloqué). À refaire avec des équations MeSH sur
`"Personnel Staffing and Scheduling"[Mesh]` **avant toute rédaction** — ne pas construire sur cette
bibliographie.

⚠️ **Que d'autres aient publié n'empêche rien** : l'amélioration de la qualité vit de la
réplication, et les auteurs d'Ochsner appellent explicitement d'autres services à reproduire avec
une méthodologie plus solide. Un tel travail n'a pas à être le premier, il doit être rigoureux et
transposable.

#### Signature

**Cosignature du comité recommandée** — non pour la méthode, mais pour le projet : un travail signé
du service ancre l'outil dans l'institution ; signé d'une seule personne, il reste l'affaire de
cette personne. C'est aussi la meilleure réponse au risque de dépendance à une personne.

### Notés le 19/08 — rien avant le 04/09

1. **La pastille « À publier » qui s'explique au clic** : liste des écarts (date, MAR, valeur
   locale / valeur publiée) + mention « publiés il y a X min, propagation en cours » quand c'est
   le cas. Supprime le « orange sans savoir pourquoi ».
2. **Battement de cœur du journal dans le Diagnostic** : horodatage du dernier passage de
   `journalAppliquer` (propriété de script), pour rendre visible un déclencheur arrêté — LOGS ne
   trace pas les passages à vide, il ne peut pas le faire.
3. **« Affectations sans fil fragile », volet B** *(le volet A — l'envoi différentiel — est LIVRÉ
   le 19/08 après-midi, v1.63)*. Reste pour septembre : **lecture depuis la copie rapide**
   (affichage instantané — le différentiel a rendu la fraîcheur de la base sans importance),
   **dépôt de l'Enregistrer au journal** (fiche « affectations », la republication quitte la
   requête du client), et **diagnostic déposé dans une clé miroir** relue par la page. Neutralise
   la classe entière des « Délai dépassé » sur réponses perdues, vécue le 19/08. Ordre de
   déploiement non négociable : Worker → `.gs` → synchro. Un fil de conversation dédié.
4. **Nettoyage opportuniste des `.gs` restants** (~35 lignes de tests jetables dans `code.gs`,
   `portail.gs`, `veille.gs`, `generateur_gardes.gs`) : à la prochaine recopie de chacun, jamais
   pour eux-mêmes.
5. **Éclaircir `pushFileToGitHub`** (`code.gs` l.1244) : le commentaire dit « sert encore à pousser
   les pages HTML », aucun appelant trouvé — trancher, puis supprimer ou documenter.

#### À ne pas perdre

1. **Temps de production du planning par le comité** — à demander en septembre-octobre, pendant
   qu'on s'en souvient.
2. **Figer les données 2026 complètes en janvier 2027**, quand l'année de planning sera close.

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

---
---

# PARTIE 2 — Historique détaillé

Retirée le 06/09/2026. Elle reprenait, chantier par chantier, ce que le journal ci-dessus
raconte déjà date par date — deux mille lignes de doublon, et deux sections « À faire » qui
divergeaient. **Rien n'est perdu** : l'historique du dépôt garde chaque version du document.
