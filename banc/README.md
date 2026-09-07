# Banc d'essai — Planning-Med

> **RÈGLE DE TRAVAIL.** Avant toute proposition de push touchant `admin.html`,
> un fichier `.gs`, `cloudflare/worker.js` ou `partage/dispo_jour.js` :
> lancer le banc, ne présenter le patch qu'une fois **tout au vert**, et
> annoncer le résultat chiffré. Toute fonctionnalité nouvelle ou tout défaut
> corrigé se pousse **avec le test qui l'accompagne** — un défaut trouvé en
> production devient un scénario du banc, pour qu'il ne revienne jamais.
> Le banc prouve la **logique**, jamais l'infrastructure : « le banc est vert »
> ne veut pas dire « ça marche en production ».


Exécute le **vrai code** (fichiers `.gs`, `cloudflare/worker.js`, `admin.html`)
dans un Google et un Cloudflare simulés. Sert à vérifier une modification
**avant** de la déployer, plutôt qu'en production.

## Lancer

```bash
cd banc && ./lancer.sh        # tout, d'un coup — 95 vérifications
```

ou script par script :

```bash
node banc.js             # statuts, placements, verrous            (19)
node banc_worker.mjs     # le vrai Worker : journal + /read         (17)
node banc_miroir.js      # notes du miroir, éditions manuelles      (13)
node banc_resilience.js  # rafales, crash, panne, concurrence       (16)
node banc_page.js        # la page face aux pannes                  (11)
node e2e.js              # circuit d'écriture de bout en bout        (19)
node interface.js        # L'INTERFACE RÉELLE, pilotée au clic       (18)
node banc_chaos.js       # Google capricieux, session interrompue    (24)
node banc_pages_mar.js   # index / dashboard / indispos + droits     (17)
node banc_ios.js         # mécanismes du mobile (gel, fermeture, cache) (13)
node banc_google.js      # contraintes Apps Script (budget, refus)   (14)
node banc_gestes.js      # échanges/dons, affectations, volet libéral (29)
node banc_synchro.js     # plafond de clés du miroir, années futures (20)
```

`interface.js` est le test le plus proche du terrain : il monte un service
fictif complet (`monde.js` : 23 MAR, secteurs, affectations, gardes de
l'année), fait produire le planning par **le vrai générateur** du dépôt, sert
ces données par **le vrai Worker**, charge `admin.html` **telle quelle**, puis
saisit le code, clique le bouton « Accéder », clique une case à pourvoir,
choisit un MAR dans le panneau, publie, « ferme la page », laisse le serveur
appliquer, et vérifie enfin que le classeur ET le planning régénéré
contiennent le placement.

`jeu_donnees.js` fabrique un service **fictif** à l'échelle réelle (23 MAR,
120 jours, 40 placements de départ). Le dépôt est public : **aucune donnée du
classeur ne doit y figurer**, jamais.

Chaque script sort en erreur si une vérification échoue.

## Ce qui est simulé

| Simulé | Réel |
|---|---|
| Feuilles Google (tableaux en mémoire) | les fonctions d'écriture des `.gs` |
| KV Cloudflare (une Map) | `cloudflare/worker.js`, exécuté |
| Transport GAS ↔ Cloudflare dans `e2e.js` | le Worker, dans `banc_worker.mjs` |
| Navigateur (jsdom) | `admin.html`, chargée et cliquée |
| Données du service (`monde.js`, fictives) | `code.gs` + `generateur_gardes.gs`, qui produisent le planning |

## Ce que le banc prouve — et ce qu'il ne prouve pas

**Prouve** : l'ordre des opérations, l'idempotence (un rejeu ne duplique
jamais), l'isolation des échecs, le ciblage des lignes par (date, MAR),
la séparation des verrous, l'absence d'appel Apps Script sur les gestes
du comité.

**Ne prouve pas** : les autorisations Google, les quotas, la latence réelle,
le comportement des déclencheurs installables. Ces points-là ne se vérifient
qu'en production, avec le diagnostic de Maintenance.

## Incidents rejoués (chacun a été observé en production)

| Scénario | Ce qui doit se produire |
|---|---|
| Cloudflare injoignable | la page bascule sur Apps Script, le placement passe |
| Google ET Cloudflare tombés | le travail reste en attente + est écrit sur le poste |
| Panne entre application et purge | rejeu au passage suivant, **sans doublon** |
| Publication refusée | le lot revient en attente, badge rouge |
| Deux membres du comité sur la même case | une seule ligne, le dernier déposé gagne |
| 200 fiches en attente | toutes traitées, miroir noté une seule fois par année |
| Statut posé un jour de garde | refusé (échange ou don obligatoire) |
| MAR inconnu, statut invalide, date hors planning | refusés proprement, file non bloquée |

## Angles morts : ce qui a été ramené dans le banc

On ne peut pas embarquer Safari ni Google dans un test. En revanche, les
*mécanismes* qui causent leurs pannes se reproduisent, et c'est fait :

| Panne réelle | Comment elle est jouée ici |
|---|---|
| Onglet iOS gelé, requête zombie | la réponse n'arrive JAMAIS ; on vérifie qu'aucun envoi n'est perdu ni empilé |
| Onglet fermé avec du travail en cours | événement `pagehide` réel → envoi de secours + mémoire du poste |
| Cache servant une ANCIENNE page | la version précédente est chargée contre un serveur à jour (copie dans `reference/`) |
| Réseau mobile lent | délai d'abandon du miroir vérifié à la valeur, lecture non bloquante |
| Limite des 6 minutes | 140 intentions en une exécution : 2 appels réseau, écritures groupées |
| Autorisation de déclencheur refusée | la note survit, rien ne plante, la synchro horaire prend le relais |
| Édition manuelle en rafale (100 cellules) | une seule note, un seul déclencheur |
| Google saturé (429) | l'intention reste en file, le classeur n'est pas à moitié écrit |

### Ce qui reste hors de portée

Le vrai moteur de Safari, les quotas réels, la latence réelle et l'exécution
effective des déclencheurs installables. Ces points ne se vérifient qu'en production, au
diagnostic de Maintenance et au chronomètre. Un jeu de données écrit par la
même main que le code peut aussi partager une hypothèse fausse : le banc
réduit le risque, il ne l'annule pas.

## Défauts trouvés par ce banc (05/08/2026)

- **Synchro complète en échec sur « 20 clés maximum ».** Depuis l'ajout des
  familles courrier et libérale, la synchro construisait 23 clés pour un
  plafond de 20 : elle échouait EN BLOC, filet horaire hors service, sans rien
  à l'écran. Corrigé (`miroir.gs 2026-08-05.10`) : envoi par paquets de 20,
  éprouvé jusqu'à cinq années (38 clés) — la limite ne reviendra pas.
- **Volet libéral déclaré « non mirrorable » à tort.** Décision prise en
  lisant la réponse SERVEUR (qui portait des montants) sans lire l'AFFICHAGE,
  qui n'utilise que MAR, secteur et chirurgie. Corrigé des deux côtés : la
  réponse serveur est allégée (les montants restent au classeur) et le volet
  passe par le miroir. Leçon : lire le CONSOMMATEUR, pas seulement le
  producteur.
- **Échange de garde refusé = classeur à moitié modifié.** `echangeGarde`
  écrivait l'échange de la date principale AVANT de vérifier le repos de garde
  du lendemain : un refus laissait la garde changée de titulaire pendant que
  le comité lisait « échange refusé ». Corrigé (`Indispos.gs 2026-08-05.12`) :
  tout est vérifié, et toutes les lectures faites, avant la première écriture.
  Le scénario 44 éprouve désormais l'atomicité des CINQ types de modification.

- Verrous imbriqués : l'applicateur du journal prenait le verrou de script,
  que réclament ensuite les fonctions d'écriture → 15 s d'attente par
  écriture. Corrigé (verrou de document).
- Deux faux positifs dans les tests eux-mêmes (mauvais nom de paramètre,
  code d'accès non injecté) : la page retombait silencieusement sur le
  circuit Apps Script sans que rien ne le signale.
