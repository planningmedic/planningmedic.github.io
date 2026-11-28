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

- **Clôture 2026 → 2027, lundi 04/01/2027, dès minuit** (Maintenance → 📦 Clôturer l'année, réservée
  au responsable ; le serveur refuse le code comité). D'ici là : **Répétition à blanc** (rien n'est écrit :
  contrôles, bilan 2026 par MAR, lignes qui partiront). La clôture fait elle-même une copie complète du
  classeur (« Avant clôture 2026 », bloquante si elle échoue). Avant : planning 2026 juste jusqu'au
  dimanche 3 janvier inclus. Fiche pratique dans les documents du projet Claude (« bascule d'année »).
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
- **Topos 2027, début janvier** : créer un sous-dossier « 2027 » dans le dossier Drive des topos et y
  déposer les nouveaux (un PDF ou un dossier par topo). Rien à coder : le portail le reconnaît (v1.91.0).
- **Journée mobile** de chaque année dans `JOURNEE_MOBILE` (`code.gs`), à réception de la note DRH.
- **Index CCAM** du module libéral à régénérer vers mars 2027.
- **Génération 2028** (automne 2027) : rotation d'équité active (fiche « rotation d'équité 2028 » des
  documents du projet Claude) ; essai à blanc sur les vraies indispos 2028 dès la clôture de leur saisie.
- **Reliquat de vacances 2026, avant janvier 2027** (v2.5.0) : le responsable remplit l'onglet RELIQUATS
  (une ligne par MAR : MAR, 2026, jours), chiffres vérifiés avec le secrétariat. Sans ligne, pas de
  reliquat. Dès 2027 le calcul est automatique et la clôture le fige (lignes « calculé à la clôture » à
  vérifier). Décisions du 26/11 : imputation automatique (janvier pris d'abord sur le reliquat), pas de
  mail de rappel. Exception « toute l'année » dans ORIGINE (retour de congé long, v2.6.1) : le reliquat
  vaut sur toute l'année N+1. Au staff vacances N+1 (v2.7.2, 27/11) : la jauge Congés prend aussi janvier
  N+1 d'abord sur le reliquat de N (chiffre provisoire, N n'étant pas fini) ; même compte dans l'onglet
  Récap du comité (staff.html, v2.9.0). Limite connue : avant le staff
  N+1, janvier N+1 se pose par chaque MAR dans son écran N (13e mois, onglet JANVIER_SUIVANT, sans contrôle des
  présents, compté sur N, recopié dans INDISPOS N+1 à sa création — v2.9.0) ; le comité aussi, dans staff.html
  (13e onglet « Jan N+1 » du mode VAC année, sans seuil — v2.10.2).
- **Retour d'expérience / poster SFAR 2027** : appel à communications à surveiller vers décembre 2026
  (3 500 caractères, inscription payée ; un résumé accepté et non présenté = 3 ans d'interdiction : ne
  soumettre que si la venue est sûre). Mesurer sur l'**attribution initiale**, jamais sur le réel. La
  bibliographie du 10/08 est partielle : à refaire avant toute rédaction. Figer les données 2026
  complètes en janvier 2027. Cosignature du comité recommandée.

### Suite du diagnostic systémique du 11/11 (détail dans les documents du projet Claude)

- **Lot 4** : un statut posé par le comité sur un 18 h ou une récupération les fait disparaître (C1) ;
  demi-journée VM/VA effaçable depuis Statuts (C2) ; course rare comité / MAR sur la même case (C3) ;
  ~~receveur d'un don non éligible (B5)~~ fait le 27/11 (v2.11.0).
- **Suite du diagnostic du 27/11** (détail dans les documents du projet Claude), non tranché :
  appels sans limite de temps dans `absences.html` et `paie.html` ; icônes de secteur jamais
  dessinées dans `admin.html` ; contrôles du
  banc qui lisent l'ancien formulaire d'échange (à déplacer avant de retirer ce code) ; deux documents
  du module libéral chargent encore une police extérieure (IBM Plex). Voulu, à ne pas « corriger » :
  une récupération peut être posée AVANT son samedi quand aucun jour ne convient après (une
  récupération jamais posée est un jour de repos volé — générateur et gestes).
- **Génération des gardes** : à terme tout se passe sur la page Maintenance (décision du 27/11). Fait
  pour le calcul exact (v2.12.0). Décidé le 27/11 pour la suite : à partir de 2028 seul le calcul
  exact reste — l'assistant 2 de l'admin disparaît et le lien « 2 · Générer les gardes » de
  Maintenance mène à la carte du calcul exact. À NE FAIRE QU'APRÈS le premier essai réel réussi du
  calcul exact sur 2028 (essai à blanc dès que les indisponibilités 2028 sont closes) : d'ici là
  l'assistant 2 est le seul chemin qui a fait ses preuves, on n'y touche pas.
- **Lot 5** : sources uniques — codes de case (dont VAC/V et FORM/F entre indisponibilités et gardes),
  équipe à une date, année d'une date — et test « au hasard » des échanges.

### Serveur, données, outils

- **Diagnostic** (12/11) : le bloc « Intégrité GARDES 2027 » coûte ~4× celui de 2026 (relectures
  supposées, non vérifiées) ; la page Maintenance n'a ni délai ni reprise (quittée pendant l'analyse :
  « Load failed ») ; une lecture refusée hors zone protégée fait perdre tout le rapport.
- **Budget des tâches de fond** (24/10) : compteur proposé (durée de chaque tâche, alerte à 70 min/j,
  blocages de 8 min comptés) ; `miroirDocuments` toutes les heures, à espacer si rien n'en dépend.
- **Assistants « Démarrer l'année » et « Générer les gardes » à déplacer dans Maintenance** (décision du
  15/11, comme la clôture) : ~450 et ~890 lignes d'écran à refaire pour le téléphone, puis actions
  serveur réservées au droit Maintenance. Avant octobre 2027. D'ici là ils restent dans l'admin.
- **Clôture : `_ACTIONS_LONGUES` de l'admin** n'a plus lieu d'être pour `archiveYear` (la clôture vit
  dans Maintenance, sans délai d'attente côté page) — à nettoyer au passage.
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
- Un MAR de secours avec le droit Maintenance, pour clôturer si le responsable est absent (15/11 :
  « on verra »). Sans lui, personne d'autre ne peut clôturer.
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
Téléphone (≤ 720 px, v1.103.0) : la vue Jour (`_mjConstruire`) ne calcule RIEN — elle reçoit de
`renderWeek` `makeSlot`/`makeCsSlot`, `nonPlacesJour`, et passe par `openSidePanel`/`placeMAR`. Toute
règle de case se change dans la grille, jamais dans la vue Jour. Au-dessus de 720 px elle n'existe pas.

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

### Patients lib de « Mes consultations » (v2.4.0 → v2.8.0, 26–27/11/2026)
- **Ouvert à tout le groupement libéral** (colonne LIBERAL de MEDECINS, `_patlibDroit_`) ; tuile dans
  **Moi**. Le droit réservé `patlib` reste reconnu mais ne sert plus.
- **Rattrapage** : « Qui peut le voir ? » = membres du groupement présents le jour de **ma**
  consultation **et** le jour du bloc. Jamais un autre jour de consultation (c'est l'ancien panneau,
  qui sert à orienter le patient d'emblée). Garde = présent.
- **Pas de « Confier »** (décision du 27/11) : la page dit **qui contacter**, l'accord se prend de vive
  voix, le **secrétariat est prévenu par téléphone par le MAR**, rien dans l'interface. La pastille
  orange s'éteint quand le MAR retire la ligne (×). L'opération `confier` existe encore côté serveur,
  plus rien ne l'appelle.
- **Classement** des confrères : la plus serrée des marges CCAM et NGAP (consultation + anesthésie).
  **Aucun montant affiché ni envoyé** (27/11, « ça risque de faire des histoires ») : le serveur
  n'envoie que le rang (`rangsMarge`).
- **Export CPA** importé par le responsable seul (Maintenance), **chaque vendredi pour la semaine
  suivante**. Lu dans le navigateur ; n'arrivent au serveur que jour, demi-journée, salle, secteur,
  date opératoire (`partage/export_cpa.js`). Secteur lu dans l'agenda ; agenda sans secteur (« UB »)
  → secteur de la salle cette demi-journée s'il est unique, sinon écarté et signalé.
- **Salle ↔ MAR** : automatique si seul de son secteur avec une seule salle ; sinon le MAR choisit (ou
  « Aucune ») et l'autre reçoit la salle restante. Une **consultation tenue par le secteur** (note `css`
  du planning) est montrée aux MAR placés dans ce secteur du bloc, **seulement s'il y a des patients
  lib** ; celui qui la fait la prend (« Oui, c'est moi »). En concurrence avec le secteur, un MAR
  nommé n'est jamais rattaché d'office.
- Onglets écrits par l'interface : `PATIENTS_LIB` (saisies à la main et décisions sur les lignes CPA,
  vidable sans risque), `CPA_EXPORT`, `CPA_SALLES`. **Jamais de nom de patient.**

### Sécurité
Toutes les actions derrière `checkCode()`, aucun code renvoyé en clair, verrou d'écriture
(`WRITE_ACTIONS_LOCK` : toute nouvelle écriture le rejoint), journalisation « qui/quand » sans contenu
clinique. Tout rôle qui n'est ni comité ni MAR n'atteint que **sa liste blanche** (`_listeBlancheRole_`) ;
un rôle sans liste est refusé partout. Maintenance : rôle à part, le code comité ne suffit pas.
`ensureMarRows()` garantit les lignes annuelles de tout MAR actif. `annulerAbsenceLongue` n'efface que
les cases valant exactement `CL`.

---

## 🚫 Écarté — ne pas reproposer sans élément nouveau

- **Confier un patient lib dans le portail, ou prévenir le secrétariat depuis l'interface** *(26–27/11)*.
  Décision du responsable : la page dit qui contacter, le reste se fait par téléphone.

- **Réduire encore les écritures du relais** *(20/11, chiffré)*. Pistes : regrouper les poussées
  pendant une ruée (~3 min), calculer la pastille sur le téléphone, alléger les placements (3 → 1),
  espacer la resynchronisation de 4 h. Une journée ordinaire tourne à ~180 écritures sur 1 000 : seuls
  les ~2 jours d'ouverture d'échanges par an frôlent la limite. Décision du responsable : ne rien
  faire et observer comment l'équipe tolère un dépassement (affichage en retard jusqu'à 1 h, aucune
  donnée perdue : accepter un échange et placer passent par le serveur Google). Repli si mal vécu :
  forfait payant du relais le mois d'une ouverture, ou la piste du regroupement.

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

- **28/11/2026** — « Mes consultations », vue du MAR refaite pour le téléphone (v2.13.0,
  `indisponibilites.gs` 2026-11-28.1), sur maquette validée par le responsable. Une colonne :
  « À faire » en tête (patient opéré un jour d'absence, salle à choisir, consultation du secteur à
  prendre), une ligne par consultation avec son état, les absences, le calendrier replié. « Qui
  appeler, dans l'ordre » affiche le DECT de chaque confrère (colonne DECT de MEDECINS, servie aux
  seuls MAR du groupement). Toucher le nom du confrère qui a accepté, puis confirmer : la ligne
  reste affichée « réglé avec… » ; « Réglé autrement » : sans nom. Décisions : cette mention n'est
  vue que de celui qui l'a notée (le serveur ne sert plus une ligne au confrère nommé, le bloc
  « patients que des confrères vous ont confiés » disparaît) ; aucun bouton « Confier ». La colonne
  CONFIE_A de PATIENTS_LIB garde son nom : identifiant du confrère, ou « - » (réglé autrement).
  Vues du secrétariat et du comité inchangées. Limite connue, antérieure : les absences ne sont
  servies que sur 8 semaines ; un bloc à plus de 8 semaines d'aujourd'hui (consultation en fin de
  4e semaine + un mois) peut tomber juste après, l'absence n'est alors pas vue.
  Le même jour (v2.13.1, `indisponibilites.gs` 2026-11-28.2), décision du responsable : dans « Qui
  appeler », le MAR du secteur passe avant tout classement lié au libéral — placé dans le secteur
  de la consultation les deux jours, puis le jour de l'intervention seul, puis les autres dans
  l'ordre habituel. Les placements viennent du planning publié ; un jour pas encore posé ne
  marque personne. Puis v2.13.2 : le DECT n'est plus un lien d'appel (un DECT ne se joint que
  depuis un téléphone de l'hôpital), il reste affiché comme numéro à lire.
  Puis v2.13.3 : « Ce qu'il reste à poser » (admin, Statuts) passe à trois couleurs — rouge quand
  un quota est DÉPASSÉ (avec « N en trop »), vert quand le compte y est, bleu quand il reste des
  jours à poser. Avant, un dépassement s'affichait en vert. La vue quitte l'onglet Statuts pour
  l'onglet Contrôles (décision du responsable : c'est un contrôle, pas une saisie).
- **27/11/2026** — Répétition générale de la clôture 2026 (détail : document du projet Claude
  `claude/repetition-cloture-2026-11-27.md`), puis deux correctifs (v2.12.3). Clôture jouée sur un
  classeur fictif à la forme du vrai, puis 630 appels serveur, 11 tâches programmées, 1 000 gestes au
  hasard et 8 écrans au 5 janvier 2027 : aucun plantage. La « Répétition à blanc » réelle, lancée par
  le responsable, confirme l'accès au classeur d'archive. Corrigé : la page Planning ouvre l'année de
  planning DU JOUR dès qu'elle est publiée (`_anneePlanningDuJour`) — du premier lundi de janvier à la
  clôture elle s'ouvrait sur la dernière semaine de l'année passée ; le récapitulatif de l'année
  clôturée reste consultable à l'écran, sans PDF (décision du responsable). Laissé tel quel :
  indisponibilités, affectations et contrôles d'une année close ne s'affichent plus dans l'admin
  (ils sont dans l'archive). Banc `banc_annee_du_jour.js`, `banc_ordre_vac.js` §5b.

- **27/11/2026** — Clôture d'année : cinq onglets nés après le 15/11 sont rangés aussi (v2.12.2,
  `setup_annee.gs` 2026-11-27.2). Lignes datées avant le premier lundi de l'année suivante :
  PLANNING_NOTES, CPA_SALLES, PATIENTS_LIB et CPA_EXPORT (la plus tardive de la consultation et du
  bloc — un patient vu en décembre et opéré en janvier reste), VERIF_PREVENUS (cases « Prévenu » de
  l'année close). La répétition à blanc les annonce. Banc `banc_cloture.js` (lot O).

- **27/11/2026** — Suite du diagnostic (v2.12.1, `temps_partiel.gs` 2026-11-27.7,
  `indisponibilites.gs` .7). Polices servies par le site (`assets/fonts/`, DM Sans variable et DM Mono,
  licence OFL jointe) : 23 pages ne demandent plus rien à l'extérieur avant de s'afficher ; banc
  `banc_polices.js`. Congé long posé sur un MAR qui avait une garde en vitrine : l'offre est fermée
  aussitôt (`_echangesSansObjet_` appelée par `poserAbsenceLongue`), plus de message technique au
  preneur. Refus de vacances : quand l'écran comptait présentes des récupérations qui n'ont pas pu
  céder la place, le message le dit.

- **27/11/2026** — Calcul exact : tout se termine sur la page Maintenance (v2.12.0, `solveur.gs`
  2026-11-27.1, `Indispos.gs` .4, demande du responsable). L'essai à blanc affiche un compte rendu
  (nuits couvertes, écarts de 2+ entre collègues de même part, hors fourchette, souhaits, une ligne
  par MAR) ; « Appliquer » publie et arme les notifications ; nouveau bouton « Envoyer les
  récapitulatifs » (action `solveurRecaps`, un seul envoi sauf demande explicite). Plus de renvoi
  vers l'assistant 2 de l'admin.

- **27/11/2026** — Diagnostic complet du code et scénarios de vie réelle (v2.11.0, un seul commit ;
  `Indispos.gs` 2026-11-27.3, `temps_partiel.gs` .6, `echanges.gs` .3). Lot technique : icônes du
  planning servies par le site (758 Ko bloquants en moins) ; le service worker étiquette ses copies
  par version du site et va chercher la version du jour, sans jamais rien supprimer ;
  `deciderJourTp`, `deciderJourTpLot` et `solveurAppliquer` sous verrou ; message d'échec du PDF du
  récapitulatif ; pastille et quotas de TP en repli serveur ; ExcelJS figé. Lot bourse/TP (décisions du
  responsable) : preneur ou receveur non éligible refusé avec message (`_echangesInapte_` : ne fait pas
  de gardes, hors période en poste — le statut A reste admis) ; question `[18P]` au preneur de 18 h ;
  phrase au dépôt pour le donneur ; demande de TP en attente retirée quand la case n'est plus libre
  (`tpDemandesCaduques_`, notification et historique). 1 500 gestes tirés au hasard sur le vrai
  serveur : aucun planning dégradé. Écarté par le responsable : contrôle « données changées » entre
  Lancer et Appliquer du calcul exact ; outil de scénarios au hasard dans le banc. Banc 8 235 ✓.

- **27/11/2026** — Patients lib (v2.4.0 → v2.8.0, `indisponibilites.gs` jusqu'à 2026-11-27.3) :
  saisie date opératoire + nombre sous chaque consultation, verdict présent/absent, « Qui peut le
  voir ? » (rattrapage) ; import hebdomadaire de l'export CPA (carte Maintenance, bibliothèque de
  lecture de tableur chargée à la demande) avec rattachement par salle, choix de salle, consultations
  tenues par le secteur ; marges CCAM + NGAP dans le classement ; agendas « UB » rattachés par la
  salle. Testé deux jours par le responsable et un confrère, puis ouvert à tout le groupement, sans
  « Confier ». Guide MAR section 27. Simulation sur l'export réel : ~1 patient lib sur 5 opéré un jour
  d'absence de son MAR de consultation. Banc 8 039 ✓.

- **26/11/2026** — Le TP et les vacances passent avant la récup de samedi (v2.3.0, `temps_partiel.gs`
  2026-11-26.1, décision du responsable) : à la pose d'un TP ou de vacances, et à la validation d'un TP
  par le comité, un jour non vert à cause de récups devient vert en les déplaçant (`_tpLibererRecups_` :
  tout ou rien, jamais pour passer de rouge à orange, jamais une récup à moins de 30 jours, nouvelle date
  selon les règles habituelles, notification au MAR sans le nom du collègue, ligne d'historique). L'écran
  de pose compte ces récups présentes (`_tpRecupsCedables_`) ; `_tpRouvrirSiLibere_` reste sur
  l'effectif réel. Banc PT40 et PV13. Appliqué et vérifié en production le jour même (deux récups
  déplacées sur le 25/01/2027). Petit défaut d'affichage constaté, laissé en l'état par le responsable :
  l'écran des demandes du comité ne se met pas à jour juste après une validation (un second clic échoue
  « plus en attente »).

- **24/11/2026** — Placement quotidien sur téléphone (v1.103.0, maquette validée par le responsable) :
  sous 720 px, l'onglet Planning s'ouvre sur une vue Jour (une ligne par secteur, cases Matin /
  Après-midi, barre des 5 jours avec « N à placer ») et une bascule Jour / Semaine retenue sur
  l'appareil. Deux gestes : toucher une case → panneau des disponibles ; toucher un nom « à placer »
  puis ses cases → `placeMAR` direct (nom oublié au changement de jour ou de semaine). Grille semaine
  sur téléphone : colonne des secteurs figée ; « + » et outils de consultation visibles sans survol.
  Ordinateur inchangé. `banc_jour_mobile.js` (40 ✓). Guide du comité : « Placer depuis le téléphone ».

- **20/11/2026** — Écritures du relais (`miroir.gs` 2026-11-20.1) : ouverture des échanges = ~70
  acceptations en une heure, ~960 écritures sur 1 000 dans la journée. Cause corrigée : la file des
  poussées différées mélangeait familles et années (un échange 2027 + sa notification en 2026 →
  tout repoussé pour les deux années, `config_admin` bâti deux fois et laissé en version 2027).
  Chaque famille ne part plus que pour ses années, les familles sans année une fois avec l'année
  active (≈ 3 écritures de moins par acceptation). Scénario 6 ter du banc. Appliqué par le
  responsable. Aller plus loin : écarté (voir plus haut).

- **18/11/2026** — Topos rangés par année (v1.91.0, `portail.gs` 2026-11-18.1) : un sous-dossier nommé
  par une année (« 2026 ») est une étagère ; écran des années puis topos de l'année ; liste à plat tant
  que le Drive n'est pas rangé ; les 16 topos existants rangés dans « 2026 » (accord du responsable).
  Écran vide des topos qui plantait corrigé. Maintenance (v1.91.1 → v1.91.2, `Indispos.gs` et
  `equipe.gs` 2026-11-18.1) : bouton « Mettre à jour maintenant » = synchronisation complète de la copie
  rapide à la demande (`miroirSyncMaintenant`, rôle maintenance) ; cartes réordonnées (serveur,
  diagnostic, mise à jour, récups, clôture, codes, cache en dernier) et textes raccourcis. Appliqué et
  vérifié en production par le responsable.

- **15/11/2026** — Clôture d'année refaite (v1.77.1 → v1.79.0, serveur setup 2026-11-15.4) : un seul
  geste côté serveur, contrôles bloquants, copie de sécurité, reprise après coupure, contrôle d'après,
  mail ; refus de date dès minuit (le serveur refusait jusqu'à midi le jour J) ; carte dans Maintenance,
  assistant retiré de l'admin ; le classeur maître ne garde que l'année en cours et la suivante (REA1,
  FETES, libéral N-1 et lignes de l'année des onglets partagés partent à l'archive) ; HISTORIQUE gagne
  PART EXACTE et JOURS TP. Lanceurs d'essai `TEST_W3_*`, `W1_2028`, `W2_2026` retirés.
- **15/11/2026** — Banc plus rapide (empreintes, une génération au lieu de deux, `banc_syntaxe`) :
  ~2 min 20 au lieu de 24 min quand le générateur ne change pas. `admin.html` : `<div class="main">`
  refermé (v1.78.2). CONTEXTE et ROADMAP refaits ; tout l'ancien contenu daté est dans HISTORIQUE.
