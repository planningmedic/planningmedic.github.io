# Dette cumulative et cible contrainte — maquette d'essai du 6 septembre 2026

> ⚠️ **Ceci n'est pas du code livrable.** C'est une maquette écrite pour répondre à
> une question, mesurée sur cinq années simulées, **jamais passée au banc**.
> Le fichier `generateur_dette_cumulative_v1.gs.txt` ne doit pas être recopié
> dans l'éditeur Apps Script en l'état.

## Le défaut trouvé

`generateur_gardes.gs`, dans la section 5bis :

```js
cible[id].total = Math.max(cible[id].total, n);   // n = nombre de souhaits posés
```

Cette ligne ne concerne qu'un seul MAR, celui qui porte le drapeau
`souhait_plafond` dans l'onglet MEDECINS. Elle **relève sa cible sans la
retirer à personne**. La somme des cibles dépasse donc le nombre de gardes
réellement à poser, d'exactement (souhaits − part proportionnelle).

**Mesuré sur l'essai réel du 5 septembre 2026** (copie du classeur,
régénération de 2026 sur les absences complétées) :

| | |
|---|---|
| Somme des cibles sans lui | 692 |
| Sa cible | 44 |
| Total annoncé | **736** |
| Gardes réellement à poser | **728** |
| Écart | **8** = 44 − 36 |

Conséquence mécanique : **dix MARs affichés à −1, deux à +1**, bilan net −8.
Ces dix personnes ne sont pas sous-servies : leur cible est trop haute.

Les cinq autres compteurs — samedis, jeudis, week-ends, veilles de férié,
fériés — tombent tous exactement juste, parce que ce MAR en est déjà exclu.
Seul le compteur total dérive.

## Les deux cibles

- **Cible théorique** — la part d'un temps plein sur 728 gardes. En 2027 : 34,34.
- **Cible contrainte** — ce qui reste réellement à faire pour les autres une
  fois ses mardis pris. En 2027 avec 44 mardis : 33,86.

L'écran n'affiche que la théorique. Elle n'est jamais atteignable.

**La cible affichée doit être la cible contrainte**, sans quoi la dette
mesure un déficit permanent qui ne peut jamais être remboursé — il n'y a
rien pour le rembourser. Simulé : la dette se stabiliserait à −0,71 par
personne, jamais soldée.

## Ce que contient la maquette

1. **La cible fixée se prélève sur le pot**, en fractionnaire, AVANT l'arrondi
   entier. La somme des cibles tombe juste par construction.
2. **Six colonnes ajoutées en fin de `STATS_GARDES`** : `EXACTE TOTAL`,
   `EXACTE SAM`, `EXACTE JEU`, `EXACTE VD`, `EXACTE VJF`, `EXACTE JF`. La part
   fractionnaire avant arrondi et avant dette. Sans elle, la dérive réelle
   n'est pas mesurable.
3. **La dette devient cumulative** : elle relit toutes les années depuis
   `PREMIERE_ANNEE_STATS_FIABLES` et somme les écarts à la part exacte. La
   correction porte sur ce cumul, toujours plafonnée à ±2 et amortie à 0,6.
4. **Lecture unique et journalisée.** Le multi-départ rappelle `generateGardes`
   jusqu'à neuf fois : sans cache, le classeur d'archives serait rouvert
   neuf fois par année passée — 90 ouvertures en 2037, au-delà de la limite
   des six minutes de Google. Le compteur est lu une fois et mémorisé, le
   classeur d'archives ouvert une seule fois, et les années lues sont
   journalisées avec un avertissement si l'une manque.

## Mesures

Cinq années enchaînées (2027→2031), vrai générateur dans le harnais Node,
absences fabriquées, BP demandant tous ses mardis hors ses propres congés.
Script : `simulateur/cinq_ans_bp.js`.

| | Dette sur un an | Dette cumulative |
|---|---|---|
| Dérive la plus forte, sur cinq ans | 2,76 | **1,12** |
| Dérive moyenne du service | 1,62 | **0,79** |

Un MAR passait de +1, +1, +1, +2, +2 (cumul **+7**) à −1, 0, 0, +1, +1
(cumul **+1**).

Somme des cibles = gardes posées, les cinq années, sans exception.

Le résidu restant est **entièrement sur les jours fériés** : douze fériés,
24 places pour 22 MARs, une part individuelle de 1,18 que l'arrondi ne peut
rendre qu'en 1 ou 2. C'est arithmétique, pas un défaut.

## Décisions prises avec Arthur le 6 septembre

1. La génération **annonce les années lues** et alerte si l'une manque. Obligatoire.
2. Mémoire **depuis 2027**, pas de fenêtre glissante : une fenêtre remettrait
   le compteur à zéro brutalement.
3. Un MAR revenu après une **longue absence repart de zéro**.

## Ce qui reste à faire avant de livrer

- Le **contrôle de somme** : refuser de générer si les cibles ne tombent pas
  juste, sur chacun des six compteurs. Non codé.
- La **remise à zéro après longue absence** (décision 3). Non codée.
- **Le banc** : aucun test n'existe pour ces quatre changements. Chacun doit
  venir avec le sien et sa contre-épreuve.
- **Les cinq lecteurs de `STATS_GARDES`** à vérifier un par un : `code.gs`
  (lit par position, colonnes 1, 17, 18, 19, 21, 22), `Indispos.gs`,
  `miroir.gs`, l'écran d'équité, le diagnostic. Ajouter en fin est réputé sûr,
  ce n'est pas vérifié.
- **L'effet sur ce que voient les MARs** : la cible passe de 34 à 33. Écran,
  certificat d'équité et tableau de bord doivent dire la même chose.
- **La remesure sur 45 années**, neuf scénarios de cinq ans, comme pour le
  changement de septembre. Cinq ans sur une seule chaîne ne prouvent rien
  sur la durée.

Échéance : tout doit être déployé **avant le 30 octobre**, sans quoi le calcul
à blanc mesurerait l'ancien algorithme.
