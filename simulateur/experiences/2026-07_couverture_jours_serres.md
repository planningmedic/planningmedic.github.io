# Couverture des jours serrés — LIVRÉ (23/07/2026, 2ᵉ tentative)

**Objectif d'Arthur : il ne doit JAMAIS y avoir de jour sans binôme.**
Sans réduire le nombre de MAR en vacances, sans autoriser deux gardes d'affilée
(illégal), sans dégrader l'équité.

✅ **LIVRÉ EN PRODUCTION** le 23/07/2026 — `gas/generateur_gardes.gs`,
`GAS_VERSION_GENERATEUR = '2026-07-23.1'`.

⚠️ **Une première version a été poussée puis RETIRÉE le même jour.** Elle fermait
les trous mais **dégradait l'équité des week-ends** : écart par axe de 5,3 gardes
contre 3,4 pour le moteur d'origine (ZAMARON, 2041 : 2 week-ends pour une cible
de 7,3). Le dépôt a été restauré, puis la passe réécrite. Arthur n'avait rien
recopié dans Apps Script : la production n'a jamais été touchée.

**Cause de la régression :** la passe « jours critiques » classait les candidats
par **disponibilité annuelle** (« les moins disponibles d'abord »), ce qui écrasait
complètement l'équité. Elle consommait sur les jours tendus des MAR qui devaient
faire des week-ends ; ils ne rattrapaient jamais.

**Pourquoi ça n'a pas été vu :** la batterie mesurait l'écart au **total** de gardes,
qui restait bon (2,5). Elle ne mesurait **aucun écart par axe** — or la régression
était sur l'axe week-end, le plus prioritaire des quatre. Dix contrôles successifs
sont passés à côté. Le contrôle par axe est désormais dans `simulateur/eval.js` et
doit être lancé avant toute livraison du générateur.

---

## Le problème (rappel)

Le placement chronologique est glouton : chaque jour il choisit le meilleur binôme
selon l'équité, et épuise ainsi le vivier du lendemain. Sur la semaine de Noël,
il ne reste plus personne.

La feuille réelle 2026 le confirme : le **27/12/2026, 17 MAR sur 20 étaient
indisponibles**. Le comité s'en est sorti en faisant **alterner deux binômes**.
C'est ce que l'algorithme ne savait pas faire seul.

Contrainte mathématique : pour couvrir N jours consécutifs avec des binômes de 2
sans gardes consécutives, il faut **au moins 4 personnes disponibles**.

---

## Les sept mécanismes livrés

Tous **strictement additifs** : ils ne s'exécutent que là où le code échouait.

1. **Passe « jours critiques » (section 7ter)** — après la rotation de Noël (7bis),
   avant les souhaits (8a). Repère les jours de vivier ≤ 4, les regroupe en séries
   consécutives, résout par backtracking. Ordre de préférence : les MAR les moins
   souvent disponibles dans l'année d'abord. Périmètre : jours SIMPLES uniquement.
   Dernier recours : tolère le combo jeudi↔samedi.
2. **Anticipation d'un jour** dans le placement chronologique : ne pas retenir un
   binôme s'il ne resterait pas ≥ 2 personnes disponibles demain.
3. **Repli VD sur la rotation de Noël (7bis)** : place la date SEULE quand aucun
   binôme ne peut tenir l'unité complète.
4. **Garde-fou dimanche déjà pourvu** — CORRECTION DE BUG. Quand la rotation pose
   un 25/12 dimanche seul en repli, le placement du vendredi refaisait
   `assign(dimDate)` sans vérifier : il ÉCRASAIT l'attribution de Noël et faussait
   les compteurs, silencieusement. Condition ajoutée : `dimExists && !gardes[dimDate]`.
5. **Anticipation du samedi dans le bloc VD** : le binôme vendredi-dimanche est
   bloqué aussi le samedi. Le bloc VD sortait de la fonction (`return`) avant
   l'anticipation du point 2. `A`/`B` passent en `let`.
6. **Rotation de Noël sensible au voisinage** : prend, DANS L'ORDRE DE LA ROTATION,
   la première paire qui laisse ≥ 2 disponibles sur chaque jour voisin non pourvu
   (helpers `bloqueraitSur`, `preserveVoisins`, `choisirPaire`, déclarés APRÈS
   `shiftD` dans le bloc 7bis). Si aucune paire ne convient : choix historique.
7. **Anticipation étendue au samedi pour un jeudi** : placer un jeudi bloque aussi
   le samedi via le combo. Vérification CONJOINTE lendemain + samedi.

**Modification annexe** : `blocked(id, date, _relaxJS)` — 3ᵉ paramètre optionnel
tolérant le combo jeudi↔samedi. Seule la passe 7ter le passe.

---

## Résultats mesurés — 7 tirages × 20 ans = 140 années de planning

Mesures refaites après réécriture, **et après correction du modèle démographique**
(voir plus bas) : les chiffres antérieurs à cette correction ne sont pas comparables.

| | référence (production) | livré |
|---|---|---|
| jours sans binôme | 13 | **0** |
| pire écart par axe | 3,4 | **3,3** |
| années avec écart ≥ 2 | 45 (32 %) | **38 (27 %)** |
| années avec écart ≥ 3 | 4 (3 %) | **3 (2 %)** |
| médiane des écarts | 1,7 | 1,7 |
| gardes consécutives (illégal) | 0 | **0** |
| gardes sur absence déclarée | 0 | **0** |

**Meilleur que la référence sur toutes les mesures, vitesse comprise** (7 456 ms/an
contre 7 635). **Zéro jour sans binôme sur 140 années.**

**Banc de torture** (23/07/2026) :

| test | référence | livré |
|---|---|---|
| batterie 11 scénarios | — | sortie **identique au caractère près** |
| déterminisme (3 exécutions) | — | **identiques** |
| stress +50 % d'indispos | 0 trou | **0 trou** |
| stress équipe réduite (retraite 63 ans) | 0 trou | **0 trou** |
| stress 12 MAR en congé la semaine de Noël | 18 trous | **12, tous avertis** |
| temps de génération | 7,6 s/an | **7,5 s/an** |

Sur **tous** les tests : nombre d'avertissements « Manque MAR » = nombre de trous.
Aucun jour non pourvu ne peut être publié sans être signalé.

**Contreparties assumées** (cumul 140 années) : 2 combos jeudi↔samedi (légal, jamais
deux gardes d'affilée) et 4 couplages samedi→lundi dégradés de plus (21 → 25). Chacun
est signalé au comité au moment de la génération.

## Génération RÉELLE en production — 23/07/2026

Au-delà des 140 années simulées et du rejeu de 2026, l'année **2027 a été générée
pour de vrai dans le classeur du service**, avec le code déployé (`2026-07-23.3`).

Conditions : 25 MAR, indisponibilités réalistes (données réelles 2026 décalées de
364 jours, ~2 000 jours d'absence), souhaits de 3 MAR sur les mardis — dont PRUNET
en régime plafond (44 mardis) et deux MAR en régime normal (10 mardis chacun).

Résultat :
- **Zéro jour sans binôme.**
- **Écart maximal à la cible : 1,2 garde** (meilleur que les 1,4 du rejeu 2026 et
  que les 3,3 des simulations).
- Une **alerte d'effectif limite en décembre**, correctement levée par la passe des
  jours tendus — le mécanisme a repéré la semaine de Noël et l'a traitée en priorité.

C'est la validation qui manquait : mêmes conditions que la production, dans le vrai
classeur, avec le vrai code déployé.

## Le moteur retenu

1. **L'équité pilote le choix** ; la disponibilité annuelle ne sert plus qu'à départager.
2. **La passe n'accepte plus la première solution venue** : elle énumère les
   combinaisons possibles et retient la **moins coûteuse en équité**, sous une borne
   dure de 20 000 essais qui interdit toute explosion combinatoire. Ce n'est pas un
   réglage ajusté sur l'échantillon, c'est un critère : il tient à 20 000 années
   comme à 140.
3. **Les samedis restent dans le périmètre.** Les avoir exclus (tentative
   intermédiaire) laissait 4 trous, tous des samedis, pour un gain d'équité nul.
   Le danger ne venait pas du samedi mais de l'ordre de choix.
4. **Passe de dernier recours — le mécanisme décisif (`GAS_VERSION 2026-07-23.2`).**
   Le moteur renonçait : dès qu'il restait moins de deux personnes disponibles, il
   écrivait « Manque MAR » et passait au jour suivant — **sans jamais essayer la
   tolérance qu'il avait pourtant dans les mains**. Le comité, lui, n'a jamais
   renoncé : il casse la contrainte la moins douloureuse et le dit. Désormais, avant
   d'abandonner un jour, l'algorithme retente en **tolérant le combo jeudi↔samedi**
   (légal : ce n'est PAS deux gardes d'affilée). Les deux règles dures ne sont jamais
   relâchées : **jamais deux gardes consécutives, jamais de garde sur une absence
   déclarée** — zéro violation sur 140 années. C'est ce seul ajout qui fait passer de
   1 trou à **0**.
5. **Avertissement au comité** quand la couverture a coûté cher en équité :
   « choix contraint, équité dégradée — à anticiper sur la pose des vacances ».
   Le levier principal reste en amont, au staff d'octobre.

## Correction du modèle démographique (indispensable)

`simulateur/demographie.js` donnait au MAR à 80 % un jour de repos **fixe chaque
semaine**, tiré parmi 5 jours consécutifs à partir du 1ᵉʳ janvier. Quand il tombait
sur un samedi ou un jeudi, ce MAR ne pouvait faire **aucune** garde de cet axe alors
que sa cible restait à ~4,8 → écarts artefactuels de 4 à 6 gardes, et **70 % des
années au rouge** sur le certificat d'équité.

Usage réel confirmé par Arthur : les jours de temps partiel sont **dispersés**,
parfois groupés sur une semaine ; le seul rythme fixe du service est BOUREGBA
(60 %, jeudi + vendredi), qui ne prend pas de gardes. Modèle corrigé en volume
équivalent (~52 j/an) posé au fil de l'eau. Après correction, le taux d'années au
rouge tombe de 70 % à 29 % (seuil 2) et le pire écart par axe de 5,9 à 3,3.

**Composition des « autres erreurs »** (cumul 7 tirages) :

| type | RÉF | LIVRÉ |
|---|---|---|
| couplage samedi→lundi rompu | 21 | **16** |
| couplage jeudi→samedi rompu | 4 | 4 |
| unité vendredi-dimanche rompue | 13 | 17 |
| combo jeudi↔samedi | 0 | 2 |
| **gardes consécutives** | **0** | **0** |

Les 4 unités VD rompues en plus sont le prix direct de la correction : 25/12
dimanche placé seul + vendredi placé seul = deux jours couverts au lieu d'un trou.
En regard, 5 couplages samedi→lundi sont sauvés.

**Autres validations** :
- batterie `simulateur/scenarios.js` (11 scénarios) : **sortie complète strictement
  identique** à la référence, au caractère près
- déterminisme : 3 exécutions rigoureusement identiques ✅
- performance : 709,9 s contre 706,6 s sur les 140 années, soit **+0,5 %**
- `node --check` OK, ancres uniques vérifiées, portée de `shiftD` contrôlée

⚠️ **Mesure d'équivalence** : la métrique « années identiques » donne 0 à 4 sur 20
selon le tirage, PAS les 12/20 annoncés dans la version précédente de cette note.
Ce n'est pas comparable : dès qu'une année diffère, le report de dette fait diverger
toutes les suivantes en cascade. Vérifié : la v1 seule donne le même 4/20. La preuve
de non-régression est la batterie des 11 scénarios, identique au bit près.

⚠️ **Tout ceci est prouvé par simulation.** Seule la génération réelle d'une année
dans le classeur le confirmera.

---

## Documentation mise à jour (23/07/2026)

- `docs/guide-algo-gardes.html` § 14 : « Éprouvé sur 140 années simulées » ;
  § 04 protections : nuance sur le combo jeudi↔samedi en ultime recours
- `docs/Presentation-gardes-staff.html` : slide « La preuve » réécrite sur
  140 années ; carte « Zéro journée sans binôme » dans les garanties

---

## Pièges rencontrés (ne pas les refaire)

- **Portée** : `shiftD` est déclaré en `const` DANS le bloc 7bis. Les helpers de
  la rotation doivent être déclarés APRÈS lui, dans le même bloc.
- **Colonnes MEDECINS** : `pct[id]=medData[r][5]` (% GARDES) et
  `quot[id]=medData[r][4]` (quotité). Ne pas les inverser.
- **Le rythme 2/2 est géré NATIVEMENT** par `estSemaineOff()` (l. 35), ancré sur le
  lundi 01/06/2026. Ne jamais poser de jours `TP` par-dessus.
- **L'espacement à 5 jours n'est PAS une règle dure** : c'est `spacingPenalty`.
  Blocages durs : `rgSet`, `rSet`, `gSet`, combo jeudi-samedi.
- **Deux gardes d'affilée : INTERDIT, c'est illégal.** Jamais proposé, jamais mesuré.
- **Plafonner les vacances de Noël : REFUSÉ.**
- **Un `return` masque une protection** : le bloc VD sortait avant l'anticipation
  du point 2 — d'où le point 5. Lire le chemin réel, pas un chemin analogue.
- **Écraser une case déjà écrite** : `assign()` ne vérifie pas si le jour est déjà
  pourvu. Toujours tester `!gardes[date]` avant de (ré)assigner.
- **Outillage** : `pkill -f "motif"` tue le shell appelant si sa ligne de commande
  contient le motif (elle le contient si le script est écrit par heredoc). Utiliser
  `pkill -x node`. Et `worker.js` fait `process.chdir()` : résoudre les chemins de
  sortie en absolu AVANT le chdir.
