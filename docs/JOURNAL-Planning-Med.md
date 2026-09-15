# Journal des décisions — Planning-Med

> (15/09/2026, chantier 10) Les récits datés qui vivaient en commentaires dans le code (« pourquoi on a fait ainsi, ce qu'on a mesuré, le cas réel ») sont rassemblés ici, fichier par fichier, dans l'ordre du code. Chaque emplacement d'origine garde une ligne : la date, la première phrase, et le renvoi « → JOURNAL §n ». Le code dit le *quoi* et le *pourquoi* en une ligne ; la chronologie se lit ici. Rien de ce texte n'est une donnée : ce sont des raisonnements.

## admin.html

### §1 — `admin.html` · (03/09/2026)

*Juste avant :* `let INDISPOS_OUVERTE = false;   // la ligne INDISPOS_ACTIVE existe`

(03/09/2026) Etat REEL de la campagne. INDISPOS_YEAR ne suffit pas a le
dire : cote serveur, getIndisposYear() retombe silencieusement sur l'annee
active quand la ligne INDISPOS_ACTIVE est absente de CONFIG. Ces deux
drapeaux voyagent deja avec l'identite, par le serveur ET par la copie
rapide, et pilotent deja la tuile du portail (index.html) : meme
source, meme lecture, pas de troisieme verite.

### §2 — `admin.html` · (28/07/2026, 16 h)

*Juste avant :* `try { boot = await api({action:'getAdminBootstrap', code}); }`

(28/07/2026, 16 h) DIAGNOSTIC — l'echec du bootstrap etait AVALE ici sans laisser
de trace : ni dans le journal (l'exception peut survenir avant son ecriture), ni
en console. Symptomes observes toute la journee et tous issus de ce point unique :
un `login` apparaissant AVANT le bootstrap (T+0,0 s au chronometre), un
getPlanningJson de repli, et le compteur de mails redemande separement — car
`window.__boot` reste vide et initDashboard refait tout.
Le comportement est INCHANGE (l'erreur reste avalee, le repli fonctionne) : on
l'affiche seulement.

### §3 — `admin.html` · (28/07/2026, 16 h 15)

*Juste avant :* `let _ouvertureFaite = false;   // une ouverture reussie interdit d'en relancer une`

(28/07/2026, 16 h 15) LA CONNEXION AUTOMATIQUE A ETE DEPLACEE EN FIN DE SCRIPT.
CAUSE RACINE trouvee par la trace « [ouverture] » :
  ReferenceError: Cannot access '_fileAPI' before initialization
Cette fonction s'executait ICI (ligne ~1816) alors que `_fileAPI` — la file
d'attente utilisee par api() — n'est declaree que ~250 lignes plus bas. Une
variable `let` n'existe pas avant sa ligne de declaration : le TOUT PREMIER
appel (getAdminBootstrap) levait donc une exception immediate, avalee par le
catch d'ouvrirSession.
Consequences en cascade, toutes observees le 28/07 et longtemps chassees
separement : un `login` parti AVANT le bootstrap (T+0,0 s au chronometre),
`window.__boot` vide, donc initDashboard refaisant un bootstrap complet, et
les replis getPlanningJson + mailNonLus par-dessus — soit 4 appels au lieu
de 1 a CHAQUE rechargement de page avec session active.
⚠️ Ne jamais remonter ce bloc au-dessus des declarations de la section API.

### §4 — `admin.html` · (v1.21.2)

*Juste avant :* `const API_TIMEOUT_LECTURE_MS  = 20000;`

(v1.21.2) TIMEOUTS DIFFERENCIES — le 2 min unique etait la cause du
« chargement infini » du 04/08 au soir : sur iOS, un onglet mis en
arriere-plan gele le fetch ET son minuteur d'abandon ; au retour, l'appel
zombie tenait la file SERIELLE jusqu'a 2 minutes, barre figee, et tout
attendait derriere (dont le changement d'annee). Lectures : 20 s — un GAS
sain repond en < 8 s, au-dela c'est mort, on rejoue ou on echoue VITE et la
file vit. Ecritures et taches longues (generation, diagnostic, publication,
archivage) : 90 s — on ne coupe pas une ecriture en cours.

### §5 — `admin.html` · (28/07/2026, 11 h)

*Juste avant :* `const API_REJOUABLES = new Set(['getAdminBootstrap',`

(28/07/2026, 11 h) LE REJEU EST RAMENE A UNE SEULE ACTION.
Mesure de 10:55 : sur une file d'attente saturee, rejouer AGGRAVE l'engorgement —
3 rejeux = 15 executions envoyees au lieu de 12, et des appels a 30-40 s. Le rejeu
generalise que j'avais ajoute le matin meme etait donc contre-productif.
Il ne reste que getAdminBootstrap, parce que son echec coute le plus cher (repli
sur six appels unitaires), et avec une pause franche pour laisser la file se vider.

### §6 — `admin.html` · (18/08/2026)

*Juste avant :* `let _tsEcritureAnnee = null;`

(18/08/2026) LA GARDE CONNAIT DESORMAIS L'ANNEE ECRITE. Elle ne portait
qu'un horodatage : publier 2026 fermait aussi la copie rapide de 2027, ou
rien n'avait ete ecrit. Mesure du 18/08 au matin : publication a T+49 s,
bascule sur 2027 a T+118 s — 69 s, donc sous les 90 s — repli Apps Script
froid, DEUX delais de 20 s depasses puis 12 a 17 s pour afficher une annee
que la copie rapide rendait en 164 ms.
LE DOUTE RESTE PROTECTEUR : annee d'ecriture inconnue, ou annee demandee
inconnue → toutes les annees sont fermees, exactement comme avant. On ne
gagne de la vitesse que la ou on peut PROUVER que l'annee lue n'est pas
celle qu'on vient d'ecrire.

### §7 — `admin.html` · (v1.22)

*Juste avant :* `function _prendreLotPourPublication() {`

(v1.22) PUBLICATION COMBINEE — le lot en attente part DANS l'appel de
publication (payload.items, Indispos.gs 2026-08-04.8) : un aller-retour au
lieu de deux. Conventions IDENTIQUES a flushBatch : le lot fige passe « en
vol » (persiste : un crash en pleine publication ne perd rien, le
rechargement le renverra), succes → lot vide, echec → tout REVIENT en
attente sans ecraser les poses faites entre-temps.

### §8 — `admin.html` · (13/08/2026)

*Juste avant :* `if (name==='equite') { loadStats(ADMIN_YEAR); }`

(13/08/2026) loadVacancesValidation() retire d'ici. Elle appelait Google a
CHAQUE ouverture de l'onglet Equite pour ecrire son tableau dans #vacContent
— le conteneur de la section « Gestion des vacances » de l'onglet EQUIPE, le
seul de la page a porter ce nom. Le tableau n'etait donc jamais visible
(ecrit dans un autre onglet que celui regarde) et ecrasait au passage
l'affichage des periodes et des groupes, que loadVacances() reecrivait au
retour sur Equipe. Elle manipulait en outre #vacEmpty, absent de la page :
toute erreur levait sur cette ligne et etait avalee.
Un appel serveur a chaque ouverture, pour un contenu que personne ne voit.
Le suivi des vacances (qui a obtenu quoi, periode par periode) reste a
construire s'il est juge utile : il lui faudra son propre conteneur, et
getVacValidation n'est PAS dans le miroir (calcul croise indispos/seuils).

### §9 — `admin.html` · (v1.21, etage 4)

*Juste avant :* `async function statApply(statut){`

(v1.21, etage 4) POSE DE STATUT OPTIMISTE — l'ecran n'attend plus le
serveur. Meme regle de verrouillage que lui (STAT_LOCK sur le code ACTUEL
de la cellule) appliquee localement ; l'envoi part derriere, SERIALISE
(apiSerie : l'ordre des poses et de la publication est garanti). Le
serveur reste l'autorite : un refus de sa part ANNULE la cellule a
l'ecran, visiblement, avec un message — rien ne diverge en silence.
L'echec de transport (apres le rejeu automatique) annule tout le lot.

### §10 — `admin.html` · (03/08/2026)

*Juste avant :* `try {`

(03/08/2026) On demande au SERVEUR quelles annees existent, au lieu de tester
« ./archives/stats_{annee}.json » sur le site. Ce fichier n'a jamais existe :
depuis le passage au Drive prive, l'archivage ecrit « archives_stats_{annee}.json »
sur Drive. Le selecteur ne pouvait donc JAMAIS proposer une annee cloturee, et
depensait 4 requetes par ouverture vers des URL en 404.
getAnneesDisponibles scanne le maitre ET le classeur d'archives : un seul appel,
resultat retenu pour la session (cette fonction est appelee deux fois a
l'ouverture). Recharger la page refait la demande.

### §11 — `admin.html` · (v1.26.2, CORRECTIF)

*Juste avant :* `const _dejaLa = new Set(availableYears.map(a => a.year));`

(v1.26.2, CORRECTIF) La liste du miroir fait foi pour TOUTES les années,
futures comprises. Auparavant elle était filtrée sur « années < année
active » : l'accès à N+1 dépendait alors du SEUL booléen anneeSuivante,
calculé à part. Le jour où ce booléen n'arrive pas (ou pas en booléen),
2027 disparaissait du sélecteur sans un mot — constaté le 05/08 au soir,
sur mobile, la pastille passant en mode « solo » (sans chevron).
Une seule source de vérité désormais, la même qu'planning.html.

### §12 — `admin.html` · (v1.21.2)

*Juste avant :* `try {`

(v1.21.2) LE CHANGEMENT D'ANNEE PASSE PAR LE MIROIR — il passait par la
file GAS (2 appels, 5-8 s au mieux, otage de la file au pire : c'est lui
que la panne du 04/08 au soir a fige). Desormais : une lecture miroir
(~300-800 ms meme en 4G), INSENSIBLE a l'etat de la file, et l'etage 2
est rebranche sur la nouvelle annee. Tout ecart → circuit GAS d'origine
via loadPlanningData(), inchange.

### §13 — `admin.html` · (28/07/2026, 15 h 50)

*Juste avant :* `async function checkNextYearAvailable(preAnneeSuivante) {`

(28/07/2026, 15 h 50) L'ANNEE SUIVANTE EST DETECTEE PAR LE BOOTSTRAP.
Avant : cette fonction telechargeait le planning COMPLET de N+1 (255 Ko, ~2,5 s
mesurees) pour repondre a une seule question — cette annee existe-t-elle ?
Le serveur repond desormais par le champ `anneeSuivante` du bootstrap, sans lire
le fichier. Un appel de moins a CHAQUE ouverture.
Repli conserve : si le GAS deploye ne fournit pas encore le champ (valeur nulle
ou absente), on repasse par l'ancien telechargement — la detection n'est jamais
perdue, et elle reste juste des que N+1 est publiee puisqu'elle est recalculee
a chaque ouverture.

### §14 — `admin.html` · (04/08/2026, lot A)

*Juste avant :* `aucun clic des premieres secondes ne fait la queue. Les deux chauffages`

(04/08/2026, lot A) CHAUFFAGE D'ARRIERE-PLAN — l'ouverture miroir a mis
la lenteur GAS a nu : le premier clic sur une case flash ou sur la boite
mail payait le peage (2,5-5 s) en direct. Des la page utilisable, on
lance en silence, dans la file api() existante : le panneau de la
semaine affichee (sans attendre la temporisation de 500 ms) puis la
liste des mails. Au clic, dans la grande majorite des cas, tout est
deja la. Un clic dans les toutes premieres secondes retombe sur
l'attente actuelle — irreductible tant que le GAS est le fournisseur.
Aucun risque de fraicheur : le panneau garde son invalidation sur
ecriture (invaliderCacheSemaine), les mails ont 2 min de validite.

### §15 — `admin.html` · (v1.21.1)

*Juste avant :* `09h43 : les deux chauffages restants ont coute 15,1 s et 20 s (echec)`

(v1.21.1) FILE VIDE A L'OUVERTURE — exigence : la barre bleue eteinte,
aucun clic des premieres secondes ne fait la queue. Les deux chauffages
restants partent APRES la fenetre d'action initiale, etales : la semaine
affichee a +8 s (nourrit le temoin ; avant elle, un premier panneau
declenche lui-meme sa verification, en arriere-plan, sans bloquer), les
mails a +15 s (l'appel Gmail est le plus lent de tous).

### §16 — `admin.html` · (18/08/2026)

*Juste avant :* `let _plM = null, _affM = null;`

(18/08/2026) LA COPIE RAPIDE D'ABORD, ICI AUSSI. Ce chemin etait le SEUL
a n'avoir aucune tentative miroir : une fois tombe sur Apps Script, on y
restait. Le bouton « Reessayer », un retour sur l'onglet Planning, tout
rechargement de l'annee repartaient sur le circuit lent, meme une demi-
heure plus tard, quand la garde des 90 s etait retombee depuis longtemps.
Constate le 18/08 : trois tentatives a 12, 17 et 20 s (delai depasse)
pour une annee que la copie rapide rendait en 164 ms. Seul un aller-
retour dans le selecteur d'annees rebranchait le miroir — geste que
personne ne peut deviner.
La regle de fraicheur est la MEME que partout ailleurs : moins de 90 s
apres une ecriture SUR CETTE ANNEE, on ne lit pas la copie. Et tout
ecart — pas de code, miroir muet, cle absente — retombe sur le circuit
Apps Script ci-dessous, inchange.

### §17 — `admin.html` · (28/07/2026, 14 h 20)

*Juste avant :* `la semaine courante ET des voisines passent ici. Comportement inchange :`

(28/07/2026, 14 h 20) CORRECTIF — LE SUIVI SE FAIT PAR JOUR, PAS PAR SEMAINE.
Premiere version : une signature `_preCleSemaine` retenait la DERNIERE semaine
prechargee. Deux consequences mesurees a 14:17 (9 appels en une seule session,
72 s cumulees) : renderWeek() est appele bien plus souvent qu'a un changement de
semaine (chaque placement le rappelle), et revenir sur une semaine deja chargee
relancait tout, la signature ayant change entre-temps.
Desormais on ne demande QUE les jours reellement absents du cache : une semaine
revisitee ne coute plus rien, et l'ordre de navigation n'a plus d'importance.

### §18 — `admin.html` · (v1.20.1)

*Juste avant :* `le compteur a zero (on reverifie la semaine suivante). */`

(v1.20.1) TRIMESTRE ET VOISINES RETIRES — histoire complete dans le depot.
Le chauffage des semaines etait ne AVANT l'etage 2 ; le calcul local du
panneau l'a rendu redondant, et son cout etait devenu le principal frein
du MOBILE : la file GAS est unique (cote page ET cote Google), chaque
semaine de chauffage l'occupait 2,5-5 s, et placements, publications,
Statuts et Affectations faisaient la queue derriere. Ne reste que le
prechargement de la semaine AFFICHEE (1 appel, nourrit le temoin).

### §19 — `admin.html` · (28/07/2026, 14 h 35)

*Juste avant :* `const _precedent = _preEnCours || Promise.resolve();`

(28/07/2026, 14 h 35) Un prechargement deja en vol ne doit pas faire ABANDONNER
celui-ci : sauter d'un coup a une semaine lointaine pendant que la semaine
courante charge encore (5-6 s) laissait cette nouvelle semaine sans cache, donc
2 appels unitaires par jour ouvert — mesure de 14:27, lignes 8 a 17.
On s'enchaine derriere, et on relit le cache a ce moment-la : ce qui aura ete
charge entre-temps ne sera pas redemande.

### §20 — `admin.html` · (v1.24)

*Juste avant :* `if (!_temoinDoitVerifier_()) { restant.forEach(d => { _preSemaine[d] = true; }); return; }`

(v1.24) TEMOIN ECHANTILLONNE. Ce prechargement ne sert plus a AFFICHER
(le panneau est calcule sur la page depuis l'etage 2) : il sert de
TEMOIN — il compare la reponse du serveur au calcul local et signale
tout ecart. Or il partait a CHAQUE semaine parcourue : 2,5-5 s de file
Google occupee par semaine, qui retardaient les gestes passant encore
par le serveur (affectations, echanges de gardes).
Regle : la 1re semaine de la session, puis une sur cinq, et TOUJOURS
apres une anomalie (le compteur repart a zero). Filet conserve, trafic
divise par cinq.

### §21 — `admin.html` · (v1.25)

*Juste avant :* `_preTimer = null;`

(v1.25) PLUS AUCUNE VÉRIFICATION AUTOMATIQUE. Le témoin (getPanneauSemaine)
coûtait 2,5-5 s de file Google à chaque semaine où l'on s'arrête, et
c'était l'autre occupant de la barre bleue à l'ouverture. Le calcul local
est prouvé identique au serveur (oracle 400 cas + banc d'essai) : la
vérification devient MANUELLE (Maintenance) et automatique seulement là
où le calcul local est indisponible — le panneau appelle alors le serveur
de lui-même, comme avant l'étage 2.

### §22 — `admin.html` · (v1.26)

*Juste avant :* `function loadLiberalJour(date) {`

(v1.26) Le volet libéral vient du MIROIR (clé liberal_{année}), remplie au
chargement de la page. Correction d'une erreur d'analyse du 05/08 : j'avais
conclu « non mirrorable » en lisant la réponse SERVEUR (qui portait des
montants) sans lire l'AFFICHAGE, qui n'utilise que marId, secteur et
chirurgie. La réponse serveur a été allégée en conséquence
(portail.gs 2026-08-05.2) : les montants ne quittent plus le classeur.

### §23 — `admin.html` · (08/09/2026)

*Juste avant :* `let TITRES_PR = [], SOUHAITS_PLAFOND = [];`

(08/09/2026) Le titre affiché et le régime de souhaits garantis venaient d'un
nom de praticien écrit en dur. Deux défauts : ce nom vivait dans
un dépôt public, et une règle qu'il aurait fallu modifier dans le code le jour
où elle changerait de titulaire. Les deux listes arrivent maintenant avec
l'identité, déduites de MEDECINS — colonne NOM pour le titre, colonne
souhait_plafond pour le régime. Vides tant que l'identité n'est pas reçue :
« Dr » pour tout le monde, aucun régime particulier. Le bon défaut.

### §24 — `admin.html` · (v1.28)

*Juste avant :* `async function ensureGardesYear(y){`

(v1.28) Deux défauts corrigés ici, constatés le 05/08 au soir sur mobile.
1. UN ÉCHEC ÉTAIT MÉMORISÉ COMME UNE RÉPONSE VIDE : au moindre appel raté,
   gardesByYear[y] = {} était retenu POUR TOUTE LA SESSION, et le panneau
   affichait « Aucune garde à cette date » sur chaque date, sans jamais
   dire qu'un appel avait échoué. L'écran affirmait quelque chose de faux.
   Désormais un échec ne laisse RIEN en mémoire : le prochain essai
   recommence, et l'appelant sait que la lecture a échoué (null).
2. La lecture passait par Apps Script alors que la clé gardes_{année}
   existe déjà au miroir et sert ailleurs dans cette page. On la lit là
   d'abord — ouverture immédiate — le serveur restant le repli.

### §25 — `admin.html` · (12/08/2026, v1.31.6)

*Juste avant :* `if(e && e.transport){`

(12/08/2026, v1.31.6) Réponse perdue en route ≠ geste refusé. Constaté en
réel le 12/08 : échange adjacent APPLIQUÉ côté serveur (doPost « Terminée »
en 19 s), mais Google a renvoyé un 404 au lieu de la réponse — travers
connu des Web Apps sur les exécutions longues. L'écran disait « Serveur
indisponible », le classeur disait le contraire. On dit désormais la
vérité : probablement fait, et on RECHARGE le planning pour trancher —
c'est la grille rechargée qui fait foi, pas le message.
(v1.31.7, choix le responsable) Libellé identique au succès normal : sur 19 s
d'exécution un 404 tardif suit quasi toujours un geste fait, et la grille
rechargée corrige le cas contraire. Le journal des appels, lui, garde la
trace « transport » pour le diagnostic.

### §26 — `admin.html` · (04/08/2026, lot B)

*Juste avant :* `const _cleMiroir = (src === 'live' ? 'equite_live_' : 'stats_') + year;`

(04/08/2026, lot B) Miroir + garde de 90 s : dans les 90 secondes suivant
une ecriture planning, la copie rapide peut retarder (~60 s) et un editeur
ne doit JAMAIS voir du perime — le circuit direct tranche.
(13/08/2026) L'INSTANTANE passe lui aussi par le miroir. Le commentaire
precedent disait « getStatsLive = calcul vivant, jamais mirore » : c'est
devenu faux ce soir. La cle equite_live_{annee} porte ce recalcul, republie
aux memes moments que les statistiques — donc dans la minute qui suit un
echange de gardes. La garde des 90 s vaut pour les DEUX sources, et le
bouton Actualiser (force) court-circuite tout.
Les deux sources lisent des cles DISTINCTES : stats_{annee} est la photo
figee a la generation, equite_live_{annee} le recompte sur la grille
reelle. Les confondre afficherait l'une sous le libelle de l'autre.

### §27 — `admin.html` · (05/09/2026)

*Juste avant :* `const EQ_OUVERTS = new Set();`

(05/09/2026) CARTES REPLIABLES. Vingt-quatre cartes de neuf lignes, c'était
deux écrans de défilement avant de trouver la sienne, et rien qui se compare
d'un coup d'œil. Chaque MAR tient désormais sur UNE ligne — son nom, une case
par axe, et son écart le plus fort en clair. Un clic déplie le détail.
Le MAR connecté (portail) est déplié d'office et remonté en tête ; côté
comité, personne n'est connecté comme MAR, donc tout part replié.

### §28 — `admin.html` · (23/08/2026)

*Juste avant :* `function renderRecupsStatuts() {`

(23/08/2026) L'ALERTE DES RÉCUPS, DANS L'ONGLET STATUTS.
Même source que la ligne de l'onglet Équité — recupsEcarts() — donc rien de
nouveau à calculer et aucune donnée à stocker : l'alerte EST l'écart. Elle
nomme le MAR et le manque, et le bouton présélectionne médecin et statut ;
le choix de la DATE reste au comité, les sept contraintes de placement
vivent dans le générateur et ne sont pas rejouées ici.

### §29 — `admin.html` · (14/09/2026)

*Juste avant :* `const list = stats.filter(s=>(+s.total||0)>0).map(s=>({`

(14/09/2026) MÊME LISTE QUE LE PORTAIL MAR (planning.html) : un MAR sans
aucune garde n'a rien à faire dans l'équité (filtre total>0), et l'étiquette
« souhaits » ne désigne que les souhaits garantis (SOUHAITS_PLAFOND) — pas
le temps partiel à jours fixes, qui a une cible comme les autres. Vu en
production le jour où le comité a reçu la version commune des cartes. Le
certificat garde son propre test (estSouhaitsGarantis), inchangé.

### §30 — `admin.html` · (05/09/2026)

*Juste avant :* `['jf','cJf','fériés']];`

(05/09/2026) 6e axe. Le générateur surveille les jours fériés
depuis toujours, mais l'écran ne les montrait pas, faute d'être
servi en cible (colonne 23 de STATS_GARDES, lue par personne).
Or c'est là que le résidu se concentre : 11 fériés dans l'année,
part individuelle autour de 1,4, l'arrondi n'a que 1 ou 2 à
proposer.

### §31 — `admin.html` · (05/09/2026)

*Juste avant :* `let CERT_DEPLIE = false;`

(05/09/2026) REFONTE DE LA MISE EN PAGE. L'écran annonçait « 5 % » là où il
fallait lire « 1 MAR sur 20 », affichait deux cartes portant le MÊME chiffre
l'une en rouge l'autre en vert, et déroulait dix-neuf noms en prose rouge —
illisible sur téléphone. Il porte désormais des NOMBRES DE PERSONNES et un
classement replié. L'histogramme est retiré : sa légende (« la masse doit être
à gauche ») était contredite par les données qu'il affichait.

### §32 — `admin.html` · (13/08/2026)

*Juste avant :* `let _tsEcritureVacances = 0;`

(13/08/2026) Periodes et groupes par la copie rapide.
La cle vacances_admin etait deposee et autorisee au comite depuis le 04/08,
mais AUCUN ecran ne la lisait : l'onglet Equipe appelait Google a chaque
ouverture. J'ai compare les deux producteurs ligne a ligne — le constructeur
du miroir et l'action getVacancesConfig lisent les MEMES colonnes de
PERIODES_VAC et GROUPES_VAC et produisent la meme forme
({periodes:[{nom,debut,fin,seuil}], groupes:{A:[{id}],B,C}}), qui est
exactement ce que renderPeriodes() et renderGroupes() consomment.
Une seule difference, sans effet ici : l'action accepte un parametre `year`
qui filtre les periodes — utilise par l'ASSISTANT, jamais par cet ecran.
GARDE DE 90 s : cet ecran ECRIT (periodes, groupes). Apres un enregistrement,
la copie peut retarder d'une minute et afficherait la version d'avant — on
passe alors par le circuit direct. Le bouton Actualiser force de meme.

### §33 — `admin.html` · (v1.20.1)

*Juste avant :* `let _affSession = {};`

(v1.20.1) Cache de SESSION des affectations. Cet onglet est un editeur de
BROUILLON (source : la feuille, modifications non publiees comprises) — il
ne peut PAS lire le fichier publie du miroir. Regles : des modifications en
attente ne sont JAMAIS ecrasees par un re-clic d'onglet ; premier clic par
annee = serveur ; suivants = memoire ; un enregistrement reussi met la
memoire a jour.

### §34 — `admin.html` · (19/08/2026, après-midi)

*Juste avant :* `function construireEnvoiAffectations(aff, touches) {`

(19/08/2026, après-midi) L'ENVOI DIFFÉRENTIEL remplace la complétion du
matin (completerAffectationsActifs, vie brève : ~5 h). Le matin, Enregistrer
envoyait TOUTE la grille pour créer les lignes manquantes ; mais
toute-la-grille, c'est aussi le vrai danger — depuis une base restée
ouverte, on réécrivait tout, y compris le travail des autres. Décision
du responsable (19/08 après-midi) : n'envoyer QUE les MARs touchés en session.
- un MAR jamais touché n'est JAMAIS réécrit (sa ligne du classeur reste
  intacte à l'octet — éprouvé au banc T-AFF-2) ;
- un MAR sans ligne touché est créé par le serveur (mois absents = VOLANT,
  ecrireAffectations, Indispos.gs 2026-08-19.1) ;
- zéro touche = rien à envoyer, refus poli — la grille vide d'un chargement
  raté est inoffensive par construction.
Volet B (septembre, conçu au ROADMAP) : lecture depuis la copie rapide et
dépôt au journal — le différentiel est le préalable qui rend la fraîcheur
de la base sans importance.

### §35 — `admin.html` · (28/08/2026)

*Juste avant :* `daySlots.forEach((slot,dow)=>{`

(28/08/2026) Chaque jour est lu dans SON mois — exactement comme renderWeek.
Avant, l'export choisissait un seul bloc « mois » pour les 7 jours puis lisait
chaque jour par son rang dans ce bloc : sur une semaine à cheval (ex. S36,
31/08 → 06/09), les jours de septembre allaient chercher les jours d'août de
même rang. Décalage de 31 jours, sans le moindre avertissement : mardi et
mercredi tombaient sur un week-end d'août (donc vides) et les gardes étaient
celles du mois précédent. ⚠️ Ne jamais revenir à un mois unique par semaine.

### §36 — `admin.html` · (25/08/2026)

*Juste avant :* `let extra = '';`

(25/08/2026) Le verrou fermait TOUT l'assistant, y compris les étapes 2 et 3 —
publication et envoi des récapitulatifs — qui ne régénèrent rien. Si la
génération s'arrêtait après l'étape 1 (fenêtre fermée, réseau coupé), les MARs
ne recevaient jamais leur mail « Vos gardes » et il n'existait AUCUN moyen de le
renvoyer, sinon supprimer l'onglet et tout régénérer — un interdit du projet.
Le renvoi est ici, séparé du verrou, et ne touche pas au planning.

### §37 — `admin.html` · (03/09/2026)

*Juste avant :* `html += '<!--WIZG-SPLIT-->';`

(03/09/2026) FRONTIÈRE DES DEUX ÉCRANS. Tout ce qui précède EMPÊCHE de
générer ; tout ce qui suit RENSEIGNE sans jamais bloquer. L'étape était
devenue un mur d'informations où le bloquant se noyait dans le reste.
Le repère est posé dans la chaîne plutôt que dans le code : les blocs
qui suivent continuent d'écrire dans `html` sans être touchés, et la
coupure se fait une seule fois, à la fin.

### §38 — `admin.html` · (17/08/2026)

*Juste avant :* `{`

(17/08/2026) VERROU DE DATE — posé le jour où le code administrateur a été
remis au comité. Les garde-fous existants (côté serveur) portaient sur
l'EXISTENCE des onglets de l'année suivante, jamais sur la date : or ils
existaient depuis août, créés par le bac à sable de la démonstration du
4 septembre. La clôture était donc à deux clics pour n'importe quel membre
du comité, alors qu'elle déplace le planning EN COURS D'USAGE et bascule le
service sur l'année suivante. Le Diagnostic l'annonçait, le guide l'écrivait
— une consigne n'est pas un verrou.
Ici l'assistant ne s'ouvre même pas : c'est la protection qui compte contre
une exploration de bonne foi. Le refus serveur (Indispos.gs 2026-08-17.1)
est la seconde barrière, celle qui tient quel que soit l'écran.

### §39 — `admin.html` · (28/07/2026, 15 h 40)

*Juste avant :* `let marData = [];`

(28/07/2026, 15 h 40) BLOC RESIDUEL SUPPRIME.
Ce script commencait par un SECOND ecouteur « Entree » sur le champ de code,
vestige d'une reorganisation dont les en-tetes vides (TABS, TOAST, MODAL, API)
subsistaient sans contenu. Consequence prouvee par simulation : un appui sur
Entree declenchait authenticate() DEUX fois, soit deux ouvertures completes
— 4 appels au lieu de 2, dont deux getPlanningJson. L'ecouteur utile est
declare une seule fois dans le bloc precedent.

### §40 — `admin.html` · (23/08/2026)

*Juste avant :* `const passees = {};`

(23/08/2026) AUCUNE RELECTURE ICI. La copie rapide met ~1 min 45 à se
rafraîchir (trace LOGS du 23/08) : la relire maintenant ferait revenir
les demandes qu'on vient de trancher. Et relire le serveur coûterait
10 à 20 secondes d'attente au comité. On sait ce qui est passé — la
réponse le dit ligne par ligne : on retire ces lignes, c'est tout.
L'écran est juste, instantanément, sans un appel de plus.

## planning.html

### §41 — `planning.html` · (14/08/2026)

*Juste avant :* `.doc-panel-overlay {`

(14/08/2026) DEFAUT VU EN PRODUCTION sur iPhone : la fiche d'un MAR
sortait de l'ecran a gauche (largeur figee a 480px) et son en-tete
— nom, secteur, croix de fermeture — etait coupe par le haut.
Le panneau epouse desormais la zone REELLEMENT visible : l'enveloppe
est en position:fixed inset:0, le panneau s'y etire au lieu d'etre
colle en bas avec une hauteur de 100vh qui pouvait la depasser.

### §42 — `planning.html` · (13/08/2026)

*Juste avant :* `.eq-switchbar{padding:14px 0 0}`

(13/08/2026) Onglets pleine largeur, souligne actif. AVANT : un interrupteur
qui epousait la largeur de son texte, cale a 32 px du bord — sur telephone il
flottait dans le coin gauche, et la touche ne faisait que 27 px de haut.
La barre n'a plus de marge laterale propre : elle partage le bord gauche de
.eq-wrap, son voisin dans #equiteView, donc les onglets s'alignent sur les
cartes quelle que soit la marge du conteneur.

### §43 — `planning.html` · (08/09/2026)

*Juste avant :* `let TITRES_PR = [], SOUHAITS_PLAFOND = [];`

(08/09/2026) Le titre affiché et le régime de souhaits garantis venaient d'un
nom de praticien écrit en dur. Deux défauts : ce nom vivait dans
un dépôt public, et une règle qu'il aurait fallu modifier dans le code le jour
où elle changerait de titulaire. Les deux listes arrivent maintenant avec
l'identité, déduites de MEDECINS — colonne NOM pour le titre, colonne
souhait_plafond pour le régime. Vides tant que l'identité n'est pas reçue :
« Dr » pour tout le monde, aucun régime particulier. Le bon défaut.

### §44 — `planning.html` · (03/08/2026)

*Juste avant :* `const availableYears = [];`

(03/08/2026) UN SEUL APPEL au lieu d'une sonde par annee.
On sondait chaque annee de 2026 a N+1 avec un getAffectationsJson : 1 appel en
2026, 5 en 2030, 10 en 2035. Apps Script serialise les executions d'un meme
utilisateur, donc ces sondes ne se recouvrent pas, elles s'additionnent — le
plancher mesure par appel est d'environ 2,5 s (1,4 s de plateforme + 0,7 s de
compilation), sans compter la file d'attente Google.
getAnneesDisponibles repond pour toutes les annees d'un coup, et couvre aussi
celles dont les onglets sont partis dans le classeur d'archives.
AFF_CACHE n'est plus pre-rempli : loadYear() le remplit a la demande (l. 1376).

### §45 — `planning.html` · (13/08/2026)

*Juste avant :* `if(currentMainView === 'medecins') renderMedecins();`

(13/08/2026) CHANGER D'ANNÉE NE REDESSINAIT QUE « Médecins ».
Constaté en réel : le sélecteur affichait 2027, l'écran Équité montrait
encore les chiffres de 2026 — totaux ET cibles de l'année précédente, sous
le libellé de la nouvelle. Reproduit à l'identique hors ligne : les six
écarts affichés (Aubert -2,4 samedis · Aveline -4,0 · Chapuis -3,0 ·
Durand +2,2 jeudis · Fauvel +5,0 · Gautier -3,0) sont exactement ceux
du planning 2026 comparé à ses propres cibles.
C'est pire qu'un écran vide : le certificat annonçait « 19 écarts au-delà
de 2 gardes » sur un planning 2027 qui n'en compte aucun.
Affectations et Année souffraient du même oubli, plus silencieusement.
Toute vue dérivée de DATA doit être redessinée ici.

### §46 — `planning.html` · (05/09/2026)

*Juste avant :* `['jf','cJf','fériés']];`

(05/09/2026) 6e axe. Le générateur surveille les jours fériés
depuis toujours, mais l'écran ne les montrait pas, faute d'être
servi en cible (colonne 23 de STATS_GARDES, lue par personne).
Or c'est là que le résidu se concentre : 11 fériés dans l'année,
part individuelle autour de 1,4, l'arrondi n'a que 1 ou 2 à
proposer.

### §47 — `planning.html` · (13/08/2026)

*Juste avant :* `try{`

(13/08/2026) Le trait de chaque barre — la cible — arrivait d'un appel
Apps Script : les barres s'affichaient, puis les traits apparaissaient une
seconde plus tard, pour les 21 MAR d'un coup. La copie rapide sert
desormais stats_{annee}, ou ces cibles sont deja deposees pour le comite.
Ce n'est pas un elargissement : la vue Equite montre deja ces compteurs
nominatifs a tout MAR, et getStatsLive ne porte aucun controle de role.
L'appel direct reste le repli — et reste seul a fournir l'INSTANTANE, qui
recompte les gardes reellement faites.

### §48 — `planning.html` · (05/09/2026)

*Juste avant :* `var CERT_MAR_DEPLIE = false, CERT_MAR_LIST = null, CERT_MAR_WRAP = null;`

(05/09/2026) MÊME REFONTE QUE CÔTÉ COMITÉ. L'écran annonçait « 5 % » là où il
fallait lire « 1 MAR sur 20 », affichait deux cartes portant le même chiffre
l'une en rouge l'autre en vert, et déroulait dix-neuf noms en prose rouge —
illisible sur téléphone. Nombres de PERSONNES, classement replié, plus
d'histogramme (sa légende « la masse doit être à gauche » était contredite par
les données qu'il affichait).

### §49 — `planning.html` · (13/08/2026)

*Juste avant :* `async function loadEquiteLive(force){`

(13/08/2026) L'instantane arrive par la copie rapide.
AVANT : chaque clic sur l'onglet declenchait computeStatsLive chez Google —
le calcul le plus lourd du portail, plusieurs dizaines de secondes ressenties,
payees par CHAQUE MAR a CHAQUE consultation.
APRES : le calcul tourne une fois pour les 23, dans le declencheur differe du
miroir, aux memes moments que les statistiques — un echange de garde le
republie dans la minute. L'ecran n'est donc plus exact a la seconde mais a la
minute : c'est assume, et le lien « recalculer » force le calcul direct pour
qui veut la valeur fraiche.
force = true : on saute la copie rapide ET la memoire, on redemande a Google.

### §50 — `planning.html` · (13/08/2026)

*Juste avant :* `function majSelecteurMois() {`

(13/08/2026) Equite, Affectations et Annee raisonnent a l'ANNEE : le mois n'y
change rien. Sur grand ecran les steppers le savaient deja (updateHeaderSteppers),
mais sur mobile les deux listes deroulantes restaient affichees cote a cote, et
choisir un mois dans la vue Equite ne produisait aucun effet.
⚠️ On ne remet JAMAIS display:'block' : la regle @media (min-width:769px) masque
les deux listes sur grand ecran, et une valeur en dur la court-circuiterait.
On repose la chaine vide, qui rend la main a la feuille de style.

## index.html

### §51 — `index.html` · (08/09/2026)

*Juste avant :* `let TITRES_PR = [], SOUHAITS_PLAFOND = [];`

(08/09/2026) Le titre affiché et le régime de souhaits garantis venaient d'un
nom de praticien écrit en dur. Deux défauts : ce nom vivait dans
un dépôt public, et une règle qu'il aurait fallu modifier dans le code le jour
où elle changerait de titulaire. Les deux listes arrivent maintenant avec
l'identité, déduites de MEDECINS — colonne NOM pour le titre, colonne
souhait_plafond pour le régime. Vides tant que l'identité n'est pas reçue :
« Dr » pour tout le monde, aucun régime particulier. Le bon défaut.

### §52 — `index.html` · (06/08/2026)

*Juste avant :* `try {`

(06/08/2026) Journal de connexion en envoi A FOND PERDU.
Il n'apporte rien a l'ecran : il alimente l'onglet CONNEXIONS. En passant
par le circuit normal, il allumait pourtant le temoin d'activite pendant
2 a 3 secondes a CHAQUE ouverture de page — un clignotement sans cause
visible pour l'utilisateur. sendBeacon l'envoie hors de la file, sans
attendre de reponse, et survit meme a la fermeture de l'onglet.

### §53 — `index.html` · (08/08/2026)

*Juste avant :* `try{ const suiv=_planDejaLa(year+1); if(suiv) list=list.concat(_extractMyGardes(suiv, today)); }catc`

(08/08/2026) Transition decembre -> janvier : l'annee suivante est lue
SANS aucun appel. Avant, un seuil « des octobre » declenchait un appel
Apps Script a chaque ouverture tant que le planning N+1 n'etait pas
genere (novembre) — et la tuile attendait sa reponse. Le seuil de date a
disparu : il ratait aussi les 1er-3 janvier, ou l'annee de planning est
encore la precedente et le mois vaut 0.

### §54 — `index.html` · (17/08/2026)

*Juste avant :* `function _appareilMobile(){`

(17/08/2026) La carte ne se propose plus sur ORDINATEUR. Elle s'affichait
partout où le navigateur sait recevoir des notifications — donc sur les PC du
comité, avec en prime un texte écrit en dur « sur ce téléphone », faux à
l'écran. Or une annonce de planning n'a d'intérêt que sur le téléphone qu'on a
sur soi : sur un poste, elle arrive là où on est déjà en train de regarder, et
sur un poste PARTAGÉ elle s'afficherait chez le suivant.
Un abonnement déjà pris sur ordinateur continue de fonctionner : on cache la
proposition, on ne révoque rien.

### §55 — `index.html` · (14/08/2026 — vu en test réel)

*Juste avant :* `const item = ECH_LISTE.find(function(e){ return e.id === id; });`

(14/08/2026 — vu en test réel) La réponse du serveur FAIT FOI : on met
la liste à jour localement, sans relire la copie rapide tout de suite —
elle peut mettre quelques secondes à refléter l'écriture, et la
relecture immédiate réaffichait « EN ATTENTE » sur une demande
acceptée. La prochaine ouverture de la vue (ou le retour au premier
plan) réconciliera.

### §56 — `index.html` · (2026-08-10)

*Juste avant :* `async function _lireDoc(id, action){`

(2026-08-10) LECTURE D'UN DOCUMENT — miroir d'abord, GAS en repli.
Mesure du 08/08 : `getProtocole` 6,1 s et `getTopo` 11,5 s, quand tout le
reste de la page arrive du miroir en 100-270 ms. C'était le geste le plus
cher du portail, et le seul appel lourd que 23 MARs pouvaient empiler.
La copie est déposée par `miroirDocuments` (miroir.gs) sous la clé
`doc_<id>`, avec EXACTEMENT la forme que renvoie `getTopo` — d'où une
bascule qui ne change que la SOURCE, jamais le traitement en aval.
REPLI : toute copie absente (document déposé il y a moins d'une heure,
trop lourd, ou erreur de lecture) repasse par l'ancien chemin. Un document
sans copie reste donc lent, JAMAIS cassé.

## indispos.html

### §57 — `indispos.html` · (17/08/2026)

*Juste avant :* `.header-user[data-deco] { cursor:pointer; }`

(17/08/2026) La pastille du MAR ouvre la deconnexion, exactement comme sur
index.html et planning.html. AUCUN bouton ajoute : le code etant desormais
memorise 30 jours dans l'app installee, il faut pouvoir le retirer — mais pas
au prix d'un element de plus dans un bandeau deja etroit sur telephone.
L'icone n'apparait qu'au survol sur ordinateur ; au doigt, tout le nom est
la zone tactile.

### §58 — `indispos.html` · (26/08/2026)

*Juste avant :* `await new Promise(function (r) { setTimeout(r, 0); });`

(26/08/2026) DÉFAUT TROUVÉ AU BANC : cette fonction s'exécutait PENDANT le
chargement du script, avant la ligne qui posait l'adresse du miroir plus bas —
(adresse venue du socle partage/portail.js depuis le 14/09/2026) —
référence morte (TDZ), erreur avalée par le filet de miroirRead. Depuis le
04/08, chaque reprise de session sautait donc la copie rapide et réveillait
Apps Script (plusieurs secondes) ; la connexion manuelle, tapée après le
chargement, passait bien par le miroir — ce qui masquait le défaut.
Le tour de boucle ci-dessous laisse le script finir de se charger : la
reprise emprunte enfin le circuit rapide (~150 ms).

### §59 — `indispos.html` · (25/08/2026)

*Juste avant :* `const _uniteSouhait = (d) => {`

(25/08/2026) JOURS COUPLÉS — un souhait ne se pose jamais sur un demi-week-end.
Le vendredi et le dimanche sont assurés par le MÊME binôme (le samedi revient à
d'autres) ; un lundi férié va avec le samedi qui le précède, un jeudi férié avec
celui qui le suit. En cliquant un seul de ces jours, on demandait sans le savoir
les deux — et en cliquant les deux, on croyait faire deux demandes alors qu'il
n'y en a qu'une. Le clic pose donc l'unité complète, et le dit.

### §60 — `indispos.html` · (06/09/2026)

*Juste avant :* `const jauge = (nom, fait, quota, coul, unite) => {`

(06/09/2026) Les compteurs étaient cinq pastilles à emoji, de largeurs
inégales, qui débordaient sur deux lignes bancales. Ce qui a un PLAFOND porte
désormais une jauge — congés, formation, temps partiel : on voit ce qu'il
reste à poser, ce qu'aucun chiffre seul ne disait. Ce qui n'en a pas —
indisponibilités, gardes souhaitées — reste un simple compte, sur une ligne
à part, avec une pastille de couleur qui rappelle celle du calendrier.

## staff.html

### §61 — `staff.html` · (03/09/2026)

*Juste avant :* `congés arrivent avec la configuration (clé miroir vacances_admin ou action`

(03/09/2026) QUOTAS RECALÉS SUR CONFIG_CONGES. La table VAC était fausse
pour TOUTES les quotités : 33 jours annoncés à un temps plein au lieu de 37,
30 au lieu de 33 à 90 %, 26 au lieu de 30 à 80 %, 20 au lieu de 22 à 60 %,
17 au lieu de 18 à 50 %. FORM était juste.
C'était l'ancienne table de 2026, figée ici pendant qu'le responsable mettait
CONFIG_CONGES à jour au classeur. Le serveur, lui, lit le classeur
(`_loadQuotasConges`) : la page du MAR et « Ce qu'il reste à poser »
affichaient donc 37, et le staff 33 — quatrième occurrence du même défaut,
deux lecteurs des mêmes données qui ne comptent pas pareil.
⚠️ CETTE TABLE RESTE UNE COPIE. Elle redeviendra fausse au prochain
changement du classeur. Le remède durable est de faire renvoyer les quotas
par le serveur, avec le reste de la configuration — à faire après le staff.
⚠️ Le repli diffère aussi du serveur : ici une quotité inconnue reçoit le
quota d'un temps plein, alors que le serveur prend le palier le plus proche.
Aucun MAR actif n'est concerné (quotités relevées le 03/09 : 100, 90, 80,
60, 50), donc laissé tel quel plutôt que corrigé à l'aveugle.

### §62 — `staff.html` · (14/09/2026 — chantier 11)

*Juste avant :* `let QUOTAS_SERVEUR=null;   // {quotite:{vac,form,ctp}}`

(14/09/2026 — chantier 11) LE CLIENT AFFICHE, IL NE CALCULE PAS. Les quotas de
congés arrivent avec la configuration (clé miroir vacances_admin ou action
getVacancesConfig), tels que le serveur les lit dans CONFIG_CONGES. Cette page
ne porte plus aucune table : c'était la quatrième fois qu'une copie locale
se trouvait fausse. Le repli transitoire a été retiré le soir même, une fois
la recopie Apps Script confirmée au Diagnostic. Sans table reçue, la page le
dit (toast) et affiche 0 plutôt qu'un chiffre inventé.

### §63 — `staff.html` · (04/09/2026)

*Juste avant :* `if(pRes.noel && Number(pRes.noel.annee)===currentYear`

(04/09/2026) L'historique de Noël arrive AVEC les périodes : le clic sur
« 🎄 Noël & Jour de l'An » n'appelle plus Apps Script. C'était le dernier
appel direct de cette page, et le seul sans repli — il a échoué en séance
le 04/09, la file d'attente Apps Script étant saturée par les connexions
du staff.
L'ANNÉE EST CONTRÔLÉE : la copie rapide porte l'année de campagne du
serveur, l'écran peut regarder une autre année. En cas d'écart, on ne
garde rien et `buildRecapNoel` refait l'appel direct, comme avant.

### §64 — `staff.html` · (03/09/2026)

*Juste avant :* `if(!joursFeries.size){`

(03/09/2026) REPLI, comme pour les périodes juste au-dessus. La clé
joursferies_{Y} n'est publiée QUE pour les années possédant un onglet
GARDES_{Y} : pendant toute la campagne de congés de l'année suivante —
c'est-à-dire précisément quand cet écran sert — les gardes ne sont pas
encore générées, la clé n'existe pas, et l'onglet des ponts restait en
sommeil sans jamais pouvoir en sortir. L'action getJoursFeries renvoie
exactement la même forme (année ET suivante), et reste la SEULE source :
aucune règle de calendrier n'est recopiée ici.

### §65 — `staff.html` · (01/09/2026)

*Juste avant :* `function estChome(ds){ return isWeekend(ds) || joursFeries.has(ds); }`

(01/09/2026) LE QUOTA SE COMPTE EN JOURS TRAVAILLÉS : ni week-end, NI FÉRIÉ.
Cet écran ne retirait que les week-ends. Le serveur (Indispos.gs,
totalVacDoc) et l'écran du MAR (indispos.html) retirent les deux depuis
toujours : trois écrans, deux règles, et le comité voyait des dépassements
qui n'existaient pas. Constaté le 01/09 sur un jeu réel — douze MAR
annoncés au-dessus de leur quota, dont un à 35 jours pour 33, uniquement
parce que ses congés traversaient des jours fériés.
Un bloc de congés qui enjambe le 1er mai reste posé sur le 1er mai : c'est
la saisie normale. Ce jour-là n'était simplement pas travaillé, il ne coûte
rien au quota. Même raison que pour les temps partiels, qui ne se posent
jamais un férié.
`joursFeries` est alimenté à l'ouverture depuis la copie rapide ; s'il est
vide, le compte retombe sur l'ancien comportement plutôt que de mentir dans
l'autre sens.

## suivi-liberal.html

### §66 — `suivi-liberal.html` · (17/08/2026)

*Juste avant :* `(chargé en tête de page) : plus de copie locale ici. */`

(17/08/2026) LECTURE PAR LA COPIE RAPIDE. Cette page etait la derniere a ne
parler qu'a Apps Script : elle tombait par intermittence, et son echec
s'affichait « Aucun releve saisi pour le moment » — une phrase fausse, qui
ressemblait a une reponse. Le releve vit desormais aussi dans la copie
rapide, reserve aux MEMBRES DU GROUPEMENT (meme regle que l'action
serveur). Apps Script reste le repli, et un echec se DIT.

### §67 — `suivi-liberal.html` · (17/08/2026)

*Juste avant :* `function ouvrirEcran(nom){`

(17/08/2026) OUVERTURE SANS ALLER-RETOUR INUTILE. La page appelait TOUJOURS
l'action 'login' d'Apps Script avant d'afficher quoi que ce soit : quelques
secondes d'écran d'authentification alors que le code était déjà connu, puis
disparition toute seule. Constaté en réel sur mobile.
La copie rapide valide le code ET rend l'identité ET le relevé, en un seul
appel : plus rien à demander à Apps Script quand elle répond.

## crh.html

### §68 — `crh.html` · (08/09/2026)

*Juste avant :* `let TITRES_PR = [], SOUHAITS_PLAFOND = [];`

(08/09/2026) Le titre affiché et le régime de souhaits garantis venaient d'un
nom de praticien écrit en dur. Deux défauts : ce nom vivait dans
un dépôt public, et une règle qu'il aurait fallu modifier dans le code le jour
où elle changerait de titulaire. Les deux listes arrivent maintenant avec
l'identité, déduites de MEDECINS — colonne NOM pour le titre, colonne
souhait_plafond pour le régime. Vides tant que l'identité n'est pas reçue :
« Dr » pour tout le monde, aucun régime particulier. Le bon défaut.

## gas/Indispos.gs

### §69 — `gas/Indispos.gs` · (29/08/2026)

*Juste avant :* `const CONNEXIONS_PLAFOND = 10000;    // ~3 mois de détail nominatif à 25 MAR`

(29/08/2026) Trois besoins, trois durées de vie — et une règle qui tient
l'ensemble : on ne RECONSTRUIT jamais une statistique depuis les lignes
brutes après coup, on la FIGE pendant qu'elles existent encore.

CONNEXIONS    : le détail nominatif récent. Plafonné, donc borné.
STATS_SEMAINE : une ligne par semaine (52/an), figée dès la semaine finie.
STATS_HEURES  : grille 7 × 24 cumulée, incrémentée à chaque connexion.

Conséquence : purger CONNEXIONS ne fait perdre aucune courbe. Sans ce
dispositif, le plafond détruirait l'historique en continu — à 25 MAR, les
10 000 lignes couvrent environ trois mois, donc la première année d'usage
aurait disparu avant d'avoir pu être lue.

### §70 — `gas/Indispos.gs` · (23/08/2026)

*Juste avant :* `const TP_CLE_REPUBLIER = 'TP_ANNEES_A_REPUBLIER';`

(23/08/2026) REPUBLICATION DIFFÉRÉE — mesure du 09/08 : republier coûte
~10 s. Dans la requête, chaque validation du comité ferait attendre dix
secondes, cinquante sur une série de cinq. On NOTE donc l'année à republier
et on garantit UN déclencheur unique : la réponse part tout de suite, la
republication tombe dans la minute. Même mécanisme que l'accroche différée
de la copie rapide (miroir.gs, 05/08), et mêmes garanties : au pire, le
planning publié a une minute de retard — le classeur, lui, est déjà juste.
Le déclencheur porte un nom distinct de celui du miroir : les deux files
doivent pouvoir vivre en parallèle.

### §71 — `gas/Indispos.gs` · (11/09/2026)

*Juste avant :* `const QUOTA_INDISPO = 20;`

(11/09/2026) QUOTA D'INDISPONIBILITÉS — source unique.
Mesuré sur la grille 2027, effectif réel, congés/formations/temps partiels
posés au quota entier, trois tirages par configuration, et les
indisponibilités placées dans le PIRE cas — toutes sur des samedis et des
dimanches. L'équité (écart réel-cible ≤ 1) tient jusqu'à 36 par MAR et
décroche à 37 sur les trois tirages ; la couverture tient bien au-delà.
25 laisse donc 30 % de marge, et cette marge n'est pas du luxe : la mesure
tire les dates au hasard, la vraie vie fait converger tout le monde sur les
mêmes ponts. Vérifié aussi : à 25, la part de week-end n'a AUCUN effet —
inutile de compliquer la règle par un sous-quota.

### §72 — `gas/Indispos.gs` · (11/09/2026)

*Juste avant :* `const QUOTA_INDISPO_WE = 8;   // vendredi, samedi ou dimanche`

(11/09/2026) SOUS-QUOTA WEEK-END — vendredis, samedis et dimanches, 8 par an.
POURQUOI LE VENDREDI EN FAIT PARTIE. La garde de week-end est une UNITÉ
vendredi+dimanche, assurée par le même binôme ; le samedi revient à d'autres.
Bloquer le seul vendredi sort donc de l'unité entière. Compter samedi et
dimanche seuls laissait une faille béante : une indisponibilité de vendredi
évitait tout le week-end sans rien consommer du sous-quota. Les trois jours
comptés sont exactement ceux qui retirent d'un axe de garde.
À DIRE HONNÊTEMENT : ce plafond ne protège PAS de ce qu'on croit. Mesuré,
trois week-ends bloqués PAR TOUT LE MONDE suffisent à rendre la génération
impossible, et 3 est en dessous de 8 : vingt personnes qui visent le même
pont n'en dépensent qu'un chacune, quel que soit le plafond. Ce que 8 réduit,
c'est l'empilement ACCIDENTEL, quand chacun pose au hasard.
Ce qui protégerait vraiment de l'empilement volontaire est un seuil PAR DATE,
comme le vert/jaune/noir des congés — mesuré à 18 personnes sur 22 pour un
même week-end. Ce n'est pas construit : si la question revient, c'est là
qu'il faut aller, pas vers un plafond par personne plus bas.

### §73 — `gas/Indispos.gs` · (01/08/2026)

*Juste avant :* `return ContentService.createTextOutput(JSON.stringify({`

(01/08/2026) DEUX CAUSES, DEUX MESSAGES.
Mesure du 01/08 a 13:50 : le premier getAdminBootstrap d'une ouverture est
revenu « Code invalide » apres 44 s d'attente pour 14 ms de travail serveur.
Or 14 ms ne correspond qu'a UN chemin dans checkCode : le retour immediat
sur code vide, avant toute lecture d'onglet (un code faux, lui, coute une
lecture de MEDECINS). Impossible de trancher : les deux causes rendaient le
meme message. On les distingue desormais.
Sans risque : aucun code valide n'est revele, et le message ne dit que si le
champ etait vide — information que l'appelant possede deja.

### §74 — `gas/Indispos.gs` · (01/08/2026)

*Juste avant :* `if (WRITE_ACTIONS_LOCK.has(action)) {`

(01/08/2026) TOUTE ECRITURE VIDE LE CACHE DE CONFIGURATION.
Place ICI et non action par action : WRITE_ACTIONS_LOCK est la liste de
reference des ecritures, et l'accrocher a cette liste garantit qu'aucune
action nouvelle ne sera oubliee. L'invalidation est parfois inutile (une
ecriture de planning ne touche pas SECTEURS) : cela coute une relecture
d'onglet, jamais une donnee perimee. Le sens de l'erreur est le bon.

### §75 — `gas/Indispos.gs` · (31/08/2026)

*Juste avant :* `try { _statsActionIncr_(SpreadsheetApp.getActiveSpreadsheet(), user.role, action); } catch (e) {}`

(31/08/2026) COMPTEUR D'USAGE. Placé ICI pour la même raison que
l'invalidation du cache juste dessous : WRITE_ACTIONS_LOCK est la liste
de référence des écritures, s'y accrocher garantit qu'aucune action
nouvelle ne sera oubliée. On compte la TENTATIVE, pas la réussite : le
point de sortie est unique ici, il ne l'est plus après. Les lectures ne
sont JAMAIS comptées — une écriture par ouverture d'écran ralentirait
tout le portail.

### §76 — `gas/Indispos.gs` · (01/08/2026)

*Juste avant :* `const txt = out.getContent();`

(01/08/2026) INSERTION PAR TEXTE, PLUS PAR ANALYSE COMPLETE.
Version du 28/07 : JSON.parse de TOUTE la reponse, ajout des champs, puis
JSON.stringify. Pour le bootstrap cela fait ~350 Ko analyses puis
reencodes uniquement pour y glisser deux nombres — sur CHAQUE reponse.
Ici les champs sont inseres juste apres l'accolade ouvrante, par simple
concatenation. Le JSON produit est rigoureusement identique.
CONDITION STRICTE : on n'insere que si le texte commence par `{"`, ce qui
garantit qu'un objet NON VIDE suit — donc que la virgule ajoutee reste
valide. Un `{}`, un JSON indente ou un tableau retombent sur l'ancienne
voie : jamais de JSON invalide produit.
Le plafond de 400 000 caracteres ne s'applique plus qu'a ce repli : il
n'existait qu'a cause du cout du parse.

### §77 — `gas/Indispos.gs` · (03/08/2026)

*Juste avant :* `function _act_getAnneesDisponibles(R) {`

(03/08/2026) Quelles annees sont consultables ?
admin.html testait l'existence de « ./archives/stats_{annee}.json » sur le site —
fichier qui n'a JAMAIS ete cree : depuis le passage au Drive prive, l'archivage
ecrit « archives_stats_{annee}.json » sur Drive. Le selecteur ne pouvait donc
jamais proposer une annee cloturee. planning.html, lui, sondait les annees une par
une (un appel par annee, or Apps Script serialise les executions d'un meme
utilisateur : 1 sonde en 2026, 5 en 2030, 10 en 2035).
Un seul appel repond desormais pour les deux pages. Pas de controle de role :
c'est une liste d'annees, et planning.html est la page des MAR.

## gas/code.gs

### §78 — `gas/code.gs` · (08/09/2026)

*Juste avant :* `function getDoctorsFromMedecins() {`

(08/09/2026) LA LISTE NOMINATIVE A ETE SUPPRIMEE.
Vingt-cinq noms de medecins vivaient ici, dans un depot public, pour servir
de repli si l'onglet MEDECINS etait absent ou vide. planning.html avait deja
retire la sienne pour la meme raison — « code mort + noms en clair ».
Le repli lui-meme etait dangereux : un onglet momentanement illisible
faisait publier un planning bati sur un effectif fige et perime, en
silence. Desormais getDoctorsFromMedecins() echoue franchement. Un ecran
d'erreur se voit ; un planning faux, non.

### §79 — `gas/code.gs` · (01/09/2026)

*Juste avant :* `function getNoelHistoryDetail(beforeYear) {`

(01/09/2026) TOUTES les années où chacun a tenu Noël ou le Jour de l'An,
pas seulement la dernière. Le staff a besoin de l'historique complet pour
arbitrer ; le générateur, lui, ne veut que la plus récente.
Une SEULE lecture des sources pour les deux besoins : getNoelHistory ne fait
plus que prendre le maximum de ce que rend cette fonction. Deux parcours
séparés auraient fini par diverger — c'est déjà arrivé sur la rotation des
groupes, où serveur et écran tournaient en sens inverse.
Rend { id: [années croissantes] }.

### §80 — `gas/code.gs` · (05/08/2026)

*Juste avant :* `const dayOv = planningOverrides[day.date] || {};`

(05/08/2026) PLACEMENT CADUC. Constat de terrain : un placement du
comité s'appliquait SANS JAMAIS consulter le statut du MAR — poser un
TP (ou V, CL, A…) dans GARDES ne défaisait pas le placement, qui
continuait d'afficher le MAR en secteur alors qu'il est absent. Seule
issue : supprimer la ligne à la main dans PLANNING_OVERRIDES.
Désormais le statut PRIME : un placement visant un MAR absent ce
jour-là est ignoré et RECENSÉ (planningCaducs) — la ligne reste dans
le classeur, elle redeviendra active si le statut est retiré.

### §81 — `gas/code.gs` · (05/08/2026)

*Juste avant :* `if (planningCaducs.length) {`

(05/08/2026) Trace des placements caducs : le comité doit pouvoir
comprendre pourquoi un MAR placé n'apparaît pas en secteur. Repris
aussi par le diagnostic Maintenance.
(24/08/2026) La mémoire du mois est réécrite À CHAQUE publication,
même quand il n'y a plus aucun conflit : avant, un mois redevenu
propre gardait ses vieilles entrées pour toujours et le Diagnostic
ressortait des fantômes.

### §82 — `gas/code.gs` · (25/08/2026)

*Juste avant :* `function notifPlanifier(year) {`

(25/08/2026) La propriété ne portait qu'UNE année et l'écrasait à chaque appel :
publier 2027 faisait oublier les changements de 2026 encore en attente. Leur photo
n'étant recalée qu'après un envoi réussi, ils s'accumulaient et repartaient tous
d'un coup à la publication suivante de CETTE année-là — 25 changements et 13 mails
d'un seul coup le 25/08, pour des modifications remontant au 21.
La propriété porte désormais une FILE d'années ; notifEnvoyer les traite toutes.

## gas/diagnostic.gs

### §83 — `gas/diagnostic.gs` · (2026-08-05.13)

*Juste avant :* `function _diagNiveauToken_(jours) {`

(2026-08-05.13) Paliers d'alerte du jeton GitHub, isolés pour être
éprouvables au banc :
  expiré ou ≤ 10 j  → ROUGE   (la publication va s'arrêter)
  11 à 30 j         → ORANGE  (à planifier)
  > 30 j            → simple information
Le renouvellement demande d'aller sur GitHub, de créer un jeton et de le
coller dans PARAMETRES : ce n'est pas un geste qu'on improvise la veille.

## gas/echanges.gs

### §84 — `gas/echanges.gs` · (14/08/2026)

*Juste avant :* `function _echangesDr_(id) {`

(14/08/2026) Un humain lit ces messages : « Dr Durand », pas « DURAND ».
MÊME règle que l'écran (index.html, _tit) — titre « Pr » compris.
(08/09/2026) Le titre venait d'un nom écrit en dur ; il est maintenant
déduit de la colonne NOM de MEDECINS, comme partout ailleurs. Mise en
forme d'AFFICHAGE seule : les noms stockés dans l'onglet ne changent pas,
les correspondances non plus.

### §85 — `gas/echanges.gs` · (23/08/2026)

*Juste avant :* `try {`

(23/08/2026) LE MAIL EST RETIRÉ — un seul canal, décision du responsable.
Il partait vers DIAG_EMAIL : muet si l'adresse manquait dans CONFIG, et
incapable de dire s'il avait été traité. L'alerte vit désormais dans
l'onglet Statuts, là où le geste se fait, avec une pastille sur l'onglet.
Elle se CALCULE (écart entre samedis tenus et récups posées) : elle
disparaît d'elle-même quand le R est posé, et revient si on l'efface.
La trace, elle, reste — LOGS dit la vérité même quand l'écran est fermé.

## gas/equipe.gs

### §86 — `gas/equipe.gs` · (13/08/2026 — échanges, phase 3)

*Juste avant :* `function _act_creerEchange(R) {`

(13/08/2026 — échanges, phase 3) Les DEUX verbes du circuit pair-à-pair.
Ouverts aux rôles mar ET admin (le secrétariat est déjà refusé par
défaut en amont). Le demandeur est TOUJOURS user.id — résolu par
checkCode, jamais lu du payload. Toute erreur (contrôle refusé à la
création, demande introuvable, mauvais répondeur…) revient en
success:false avec son motif : c'est un verdict, pas une panne.

### §87 — `gas/equipe.gs` · (28/07/2026)

*Juste avant :* `out.role = user.role; out.id = user.id;`

(28/07/2026) L'IDENTITE REJOINT LE BOOTSTRAP — mesure du 28/07 a 10:46 :
quatre executions lancees ensemble coutent 4 a 7 s chacune, alors qu'une
execution SEULE coute 1,8 s. Apps Script met les executions d'un meme
utilisateur en file : le parallelisme ne fait pas gagner de temps, il en
fait perdre. L'ouverture d'admin appelait login PUIS getAdminBootstrap,
soit deux executions concurrentes pour une seule information utile.
En livrant l'identite ici, l'ouverture ne coute plus qu'UNE execution.
Les champs ci-dessous sont EXACTEMENT ceux de l'action login, qui reste
en place pour les autres pages et comme repli.

### §88 — `gas/equipe.gs` · (01/08/2026)

*Juste avant :* `const _det = {}; let _tp = Date.now();`

(01/08/2026) CHRONOMETRE INTERNE — mesure, ne change RIEN.
Mesure du 01/08 a 14:53, ouverture ramenee a UN SEUL appel : doGet vaut
3 633 ms, soit 53 % du cout total. Le travail du bootstrap est donc
devenu le premier poste, devant le peage. Restait a savoir laquelle de
ses dix operations le porte. `_jalon` note le temps ecoule depuis le
jalon precedent : aucune expression n'est enveloppee, aucun try/catch
deplace. Le detail part dans out._detail et s'affiche dans chrono().

### §89 — `gas/equipe.gs` · (28/07/2026, 15 h)

*Juste avant :* `try {`

(28/07/2026, 15 h) LE COMPTEUR DE MAILS REJOINT LE BOOTSTRAP.
Un commentaire d'admin.html disait « NE JAMAIS le mettre dans
getAdminBootstrap : ~1 s ajoutee a chaque ouverture ». Cette regle est
PERIMEE et remplacee : la mesure du 28/07 donne 129 ms de travail reel
pour cette action, quand un appel separe coute 2,4 s au total (le peage
d'entree d'Apps Script, mesure a 2-3 s sur une requete vide). Le fusionner
SUPPRIME un appel de l'ouverture pour 0,13 s de serveur en plus.
Echec tolere : le badge est un confort, jamais une donnee critique.

### §90 — `gas/equipe.gs` · (28/07/2026, 15 h 50)

*Juste avant :* `try {`

(28/07/2026, 15 h 50) EXISTENCE DE L'ANNEE SUIVANTE, SANS LA TELECHARGER.
Le frontend appelait getPlanningJson sur N+1 pour repondre a une seule
question : « cette annee existe-t-elle ? ». Cela telechargeait le planning
COMPLET (255 Ko) a chaque ouverture, soit ~2,5 s, pour un oui/non.
_jsonFilesByName_ liste les fichiers du dossier Drive SANS lire leur contenu
(aucun getBlob) : la reponse coute quelques dizaines de ms.
La detection reste exacte et se met a jour des que N+1 est publiee, puisque
elle est recalculee a chaque ouverture.

## gas/gardes.gs

### §91 — `gas/gardes.gs` · (05/09/2026)

*Juste avant :* `const nCol = Math.min(23, sh.getLastColumn());`

(05/09/2026) La colonne 23 (CIBLE JF) est désormais lue elle aussi : l'écran
d'équité surveille les SIX axes du générateur, plus cinq.
Elle n'est contrôlée que si elle EXISTE : les années antérieures — 2026, dont
les statistiques ont été reconstruites à la main — s'arrêtent à la colonne 22.
Exiger la colonne là-bas ferait hurler le diagnostic sur une année qui n'a
rien à se reprocher ; l'axe fériés y sera simplement absent de l'écran.

### §92 — `gas/gardes.gs` · (12/08/2026 — phase 2 échanges)

*Juste avant :* `const ABSENCES = ['INDISPO', 'VAC', 'FORM', 'TP', 'CL', 'CTP', 'CP', 'A'];`

(12/08/2026 — phase 2 échanges) Un don ne regardait que la grille des
gardes : donner une garde à un MAR en congé passait sans un mot, et son
absence restait posée sur le même jour que sa nouvelle garde. C'était
l'œil du comité qui l'attrapait — indispensable avant d'ouvrir les dons
aux MAR eux-mêmes (phase 4), où plus personne ne relira.
La source de vérité des absences est INDISPOS_{annee} (même lecture que
l'échange de secteurs). Un SOUHAIT n'est PAS une absence : recevoir une
garde un jour qu'on a souhaité est exactement le but.

### §93 — `gas/gardes.gs` · (2026-08-05.12, CORRECTIF)

*Juste avant :* `const jourRG = date2 || nextDay(date);`

(2026-08-05.12, CORRECTIF) TOUT VÉRIFIER AVANT D'ÉCRIRE. L'échange de
la date principale était écrit AVANT le contrôle du repos de garde du
lendemain : un refus laissait donc le classeur À MOITIÉ modifié — la
garde avait changé de titulaire, le comité lisait « échange refusé »,
et personne ne voyait la divergence (défaut trouvé au banc d'essai,
scénario 39). Un geste doit être entièrement fait, ou entièrement
refusé.

### §94 — `gas/gardes.gs` · (19/08/2026)

*Juste avant :* `function ecrireAffectations(sheet, aff) {`

(19/08/2026) Écrit la grille complète des affectations dans l'onglet.
Extrait du routeur pour être éprouvable au banc. Défaut corrigé : un MAR
sans ligne existante (fiche créée après l'onglet)
était ignoré EN SILENCE, et le journal comptait les données reçues, pas
les lignes écrites (« 25 mis à jour » pour 24 écrites, constaté le 19/08
au matin). La ligne manquante est désormais créée en bas de l'onglet,
exactement comme le fait saveAffectationsMar trois écrans plus bas.

### §95 — `gas/gardes.gs` · (2026-08-05.11)

*Juste avant :* `const STATUTS_RETIRANT_PLACEMENT = new Set(['V', 'F', 'TP', 'CL', 'A']);`

(2026-08-05.11) LE DERNIER GESTE GAGNE. Constat de terrain : un MAR
placé en secteur puis passé en TP restait affiché en secteur — la
ligne de PLANNING_OVERRIDES survivait au changement de statut, et il
fallait la supprimer à la main dans le classeur. Désormais, poser un
statut d'ABSENCE retire les placements de ces jours-là pour ce MAR.
Le TP y figure : poser un TP annule le placement du jour. L'inverse
reste vrai et VOLONTAIRE — un MAR en TP peut être réquisitionné en
dernier recours, il suffit de le placer APRÈS (le panneau le
propose, et le placement, postérieur, tient).
« 18 » (8h-18h) et l'effacement ('') ne retirent RIEN : ce ne sont
pas des absences.

### §96 — `gas/gardes.gs` · (01/09/2026)

*Juste avant :* `function computeReliquats(year) {`

(01/09/2026) CE QU'IL RESTE À POSER, pour chaque MAR.
Un jour de congé se compte en jours TRAVAILLÉS : ni week-end, ni férié —
la même règle que le serveur applique déjà au quota de vacances, et que
l'écran du staff vient d'adopter.
Les temps partiels en attente d'arbitrage (TPA) sont comptés à part : ils
ne sont pas acquis, mais ils occupent une place dans le quota.

### §97 — `gas/gardes.gs` · (01/09/2026)

*Juste avant :* `const NOEL_AN_DOUBLE_GARDE_DEPUIS = 2025;   // 4 postes avant, 8 à partir de là`

(01/09/2026) L'HISTORIQUE BRUT, pour le tableau du staff vacances.
Une ligne par MAR pouvant tenir Noël, avec TOUTES ses années passées.
Trié du plus ancien au plus récent — l'ordre de la rotation elle-même.

AUCUN jugement n'est rendu ici : ni « prioritaire », ni liste des huit à
servir. Décision du responsable du 01/09/2026 — il y a souvent plus de huit
candidats légitimes, et désigner huit noms donnerait à un calcul le dernier
mot sur un arbitrage qui revient au comité. L'écran montre, le comité
décide. Le générateur, lui, garde sa propre règle pour l'attribution
automatique : c'est computeNoelAnEligibles, inchangée.

`postes` dit combien de médecins l'année mobilisait : QUATRE jusqu'en 2024
(une garde par jour sur les quatre dates), HUIT depuis que la double garde
est effective — octobre 2025, donc dès le Noël 2025. Sans ce chiffre, une
année ancienne à quatre noms se lirait comme une année incomplète.

### §98 — `gas/gardes.gs` · (01/09/2026)

*Juste avant :* `function _act_getReliquats(R) {`

(01/09/2026) LE RELIQUAT DE CONGÉS, MAR par MAR.
Après la génération, le comité place ce qui n'a pas été posé pendant la
campagne : encore faut-il savoir ce qu'il reste. Le chiffre existait au
staff, mais seulement pour les vacances, et seulement avant la
génération. Ici : vacances, formations et temps partiels, à jour.
⚠️ La SOURCE change avec l'état de l'année. Tant que le planning n'est
pas généré, tout vit dans INDISPOS_{Y}. Une fois généré, l'onglet
Statuts écrit dans GARDES_{Y} et JAMAIS dans INDISPOS : compter dans
INDISPOS raterait tout ce que le comité a posé depuis. GARDES fait donc
foi dès qu'il existe.

### §99 — `gas/gardes.gs` · (01/09/2026)

*Juste avant :* `logAction('generateGardes ${yearToGenerate} — ${_genWarn.nbWarnings} avertissement(s)');`

(01/09/2026) LES AVERTISSEMENTS DOIVENT SURVIVRE À LA FERMETURE DE
L'ASSISTANT. Jusqu'ici LOGS ne gardait que leur NOMBRE : le contenu
ne partait que dans le journal d'exécution d'Apps Script, invisible
depuis l'application. Constaté le 01/09 — « il y a eu des
avertissements mais je ne sais plus ce que c'était », et rien ne
permettait de les retrouver. C'est précisément le moment où le comité
en a besoin : ils disent quels replis l'algorithme a dû consentir.
Plafond de 25 lignes : LOGS est purgé au-delà de 501 lignes, et le
générateur peut en produire jusqu'à 60 — les écrire toutes chasserait
le reste du journal. Le compte exact figure sur la ligne de tête.

### §100 — `gas/gardes.gs` · (10/09/2026)

*Juste avant :* `function _act_setDailyStatus(R) {`

(10/09/2026) ENVOI DES CODES SUPPRIMÉ — l'action `sendCodesWithRecap`
terminait le W1 par un mail portant trois choses : le code d'accès, le
récap des congés posés au staff, et l'annonce de l'ouverture.
Les trois ont perdu leur raison d'être : le code des indispos est devenu
celui du portail (plus rien à rappeler), les VAC/FORM verrouillés sont
consultables dans « Mes indispos » avec leur cadenas, et l'ouverture
s'annonce de vive voix — le staff est justement en séance à ce moment-là.
`renderRecapMailBlocks_` est partie avec : plus aucun appelant.
L'ouverture de la saisie N'A JAMAIS été faite ici : elle est écrite à
l'étape 4, par setIndisposYear (INDISPOS_ACTIVE). Rien n'a changé de ce
côté.

## gas/generateur_gardes.gs

### §101 — `gas/generateur_gardes.gs` · (05/09/2026)

*Juste avant :* `const NOUVEL_ALGO_GLOBAL = true;`

(05/09/2026) INTERRUPTEUR DU NOUVEL ALGORITHME.
À false, le générateur se comporte EXACTEMENT comme avant : c'est le retour
arrière, en une ligne, sans avoir à retrouver l'ancien fichier.
À true, quatre mécanismes s'activent ensemble (aucun n'a de sens seul) :
  1. CIBLES ENTIÈRES — la part de chacun cesse d'être un nombre à virgule
     (5,4 samedis, jamais atteignable) et devient un entier, réparti par la
     méthode des plus forts restes pour que la somme reste exacte.
  2. TIRAGE — à égalité parfaite entre deux MAR, c'est un numéro qui tranche,
     plus la position dans l'onglet MEDECINS.
  3. MULTI-DÉPART — jusqu'à N calculs à blanc, on écrit le meilleur.
  4. OBJECTIF LEXICOGRAPHIQUE de l'optimiseur + interdiction dure de deux
     week-ends de garde consécutifs.
Mesuré sur 45 années simulées (9 scénarios × 5 ans, dette cumulative
injectée hors code) : 44 années où personne ne dépasse UNE garde d'écart sur
aucun des six axes, contre 29 sur 45 avec l'algorithme d'avant. Zéro journée
sans binôme. Gardes rapprochées inchangées (17,8 % d'intervalles de 2 jours
contre 17,7 %). Souhaits honorés 75,3 % contre 76,6 %.
⚠️ Ces chiffres viennent du SIMULATEUR, sur des absences fabriquées. Ils
prouvent la logique, pas le comportement sur les vraies données : l'essai à
blanc sur l'année réelle reste obligatoire avant de générer.

### §102 — `gas/generateur_gardes.gs` · (13/09/2026)

*Juste avant :* `let _archiveSsIdMemo_ = null;`

(13/09/2026) L'identifiant du classeur d'archive ne vit plus dans le dépôt
public : il se lit dans l'onglet CONFIG, ligne ARCHIVE_DRIVE_ID — qui
existait déjà, documentée comme « inerte », et que le code ignorait. Lecture PARESSEUSE (au premier usage, puis
mémorisée) et non au chargement : les fichiers Apps Script s'initialisent
dans un ordre non garanti, et lire CONFIG au chargement pouvait tomber avant
que code.gs soit prêt. Les huit appelants `openById(ARCHIVE_SS_ID)` sont
inchangés ; les stubs du banc qui posent ARCHIVE_SS_ID eux-mêmes aussi.

### §103 — `gas/generateur_gardes.gs` · (2027-XX)

*Juste avant :* `const R_MAX_PAR_JOUR      = 2;`

(2027-XX) PLACEMENT DES RÉCUPÉRATIONS — plancher unique et pluralité par jour.
Constaté le 21/08/2026 sur la grille générée : 76 R sur 104 étaient posés AVANT
le samedi qu'ils compensent (jusqu'à 354 jours avant), et 90 % tombaient au 1er
semestre. Cause : `rAssigned` n'autorisait QU'UN R par jour pour toute l'équipe,
et les vacances scolaires — près de 4 mois — étaient exclues. Les 30 samedis du
2e semestre réclament 60 R pour 65 jours ouvrables hors vacances : la place
n'existait pas, le repli remontait donc chercher en janvier.
Relevé du planning réel (193 jours ouvrables) : effectif médian 17, 105 jours à
17+ et 30 jours à 16 → 240 poses possibles pour 104 besoins. Le verrou n'a jamais
été l'effectif. Règle retenue avec le responsable : n'importe quel jour ouvrable, vacances
comprises, tant qu'il reste R_PLANCHER_PRESENTS après la pose ; deux au maximum.

### §104 — `gas/generateur_gardes.gs` · (04/09/2026)

*Juste avant :* `de l'éditeur Apps Script, puis Exécuter.`

(04/09/2026) CALCUL À BLANC — `generateGardes(year, {dryRun:true})`.
POURQUOI. Depuis l'ouverture du portail au service, générer une année ne se
voit pas seulement du comité : l'onglet créé fait apparaître l'année dans le
sélecteur des 23, et la fonction se termine par une notification push sur
leur téléphone. Il n'existe donc plus aucun endroit où éprouver le
générateur sur les VRAIES données.
CE QUE FAIT LE MODE. Le calcul se déroule à l'identique — mêmes lectures,
mêmes règles, même optimiseur. Seuls les quatre gestes VISIBLES sont sautés :
l'onglet des gardes, celui des statistiques, celui des liens samedi→récup, et
la notification. Rien n'est écrit, rien n'est envoyé, rien n'est effacé.
Le verrou anti-régénération ne s'applique pas : il protège un planning
existant contre l'écrasement, et un calcul à blanc n'écrase rien. C'est ce
qui permet de relancer l'année en cours autant de fois qu'on veut.
CE QU'IL RENVOIE. La durée, l'écart réel−cible par axe avec le nom du MAR
concerné, et les avertissements — de quoi mesurer sans rien montrer.
PRÉREQUIS du multi-départ : lancer N calculs et n'écrire que le meilleur,
c'est exactement « calculer sans écrire », N fois, puis écrire une fois.

### §105 — `gas/generateur_gardes.gs` · (04/09/2026)

*Juste avant :* `function T() { return comparerAlgorithmes(2026); }`

(04/09/2026) LANCEUR TEMPORAIRE — sélectionner « T » dans la liste déroulante
de l'éditeur Apps Script, puis Exécuter.
Il n'existe que parce que l'éditeur ne sait pas passer d'argument à une
fonction. Il est DANS LE DÉPÔT à dessein : le fichier recopié dans l'éditeur
doit être rigoureusement identique à celui d'ici, sinon la prochaine session
comparera deux versions divergentes sans le savoir.
⚠️ À RETIRER une fois la mesure du 04/09 faite. Ne rien construire dessus.
Sans risque en attendant : il n'écrit rien et ne part jamais tout seul —
aucun déclencheur, aucun bouton, aucune route ne l'appelle.

### §106 — `gas/generateur_gardes.gs` · (05/09/2026)

*Juste avant :* `function T7() { return comparerAlgorithmes(2027); }`

(05/09/2026) SECOND LANCEUR — même comparaison, mais sur 2027. À utiliser une
fois la campagne d'indisponibilités close (30 octobre), pour voir ce que donnera
la génération du 2 novembre AVANT de la lancer. Il n'écrit rien non plus.
Deux lanceurs plutôt qu'un seul à modifier : le fichier du dépôt et celui de
l'éditeur doivent rester identiques au caractère près, sinon la prochaine
session compare deux versions divergentes sans le savoir.
⚠️ À RETIRER avec l'autre lanceur une fois 2027 publié.

### §107 — `gas/generateur_gardes.gs` · (04/09/2026)

*Juste avant :* `Deux calculs à blanc de la MÊME année : un avec l'algorithme d'avant, un avec le`

(04/09/2026) À LANCER DEPUIS L'ÉDITEUR — « Est-ce que N calculs d'affilée
tiennent ? ». Un calcul à blanc seul a été mesuré à 4,3 s en production. Rien
ne dit que douze à la suite se comportent pareil : Apps Script peut ralentir
ou manquer de mémoire en cours de route (la même expérience menée hors ligne
s'est fait couper trois fois à une quarantaine de générations, sur une machine
pourtant bien plus large). C'est la dernière inconnue avant d'écrire le
multi-départ, et la seule qui ne se mesure qu'ici.
Elle journalise la durée de CHAQUE passage — c'est la dérive entre le premier
et le dernier qui parle, pas la moyenne.
Budget d'arrêt à 4 minutes : on s'arrête proprement avant le mur des 6 de
Google, et on rend ce qu'on a. Aucune écriture, aucune notification.

### §108 — `gas/generateur_gardes.gs` · (04/09/2026)

*Juste avant :* `function essaiGenerationGardes(year) {`

(04/09/2026) À LANCER DEPUIS L'ÉDITEUR APPS SCRIPT — « Essai de génération ».
Enveloppe lisible du calcul à blanc : elle chronomètre, met en forme et écrit
dans le journal d'exécution. Aucun bouton, aucune page, aucune montée de
version du site : c'est un outil de mesure, pas une fonctionnalité.
Elle ne modifie RIEN — l'année peut être déjà générée, on peut la relancer
autant de fois qu'on veut, l'équipe ne voit rien.

### §109 — `gas/generateur_gardes.gs` · (05/09/2026)

*Juste avant :* `if(NOUVEL_ALGO && !DRY && !(opts && opts.tirage)){`

(05/09/2026) MULTI-DÉPART — on calcule plusieurs fois À BLANC, on retient le
meilleur tirage, et on ne l'écrit qu'une fois. Le calcul étant reproductible,
rejouer le tirage gagnant redonne exactement le même planning.
Aucune écriture pendant la recherche : les passes sont des dryRun.
La règle d'arrêt coupe dès qu'un tirage met tout le monde à MULTI_DEPART_SEUIL
garde d'écart — mesuré : un seul tirage suffit dans 25 années sur 45.

### §110 — `gas/generateur_gardes.gs` · (07/09/2026)

*Juste avant :* `const PAIRES_EV = getPairesEvitees();`

(07/09/2026) PAIRES À ÉVITER — deux MAR jamais la même nuit : ni tous les deux
de garde, ni l'un de garde et l'autre de 18h. Deux jours d'affilée restent
permis. Lue depuis CONFIG (cf. code.gs) : si rien n'y est déclaré, `evite` est
TOUJOURS faux et pas une seule décision du générateur ne change.
EXEMPTION NOËL / JOUR DE L'AN : sur ces quatre dates la règle ne s'applique pas.
Le tour de Noël se joue sur l'ancienneté (qui n'en a pas fait depuis le plus
longtemps) ; faire céder cette ancienneté déclassait quelqu'un qui attendait
son tour et cassait en cascade les unités suivantes.

### §111 — `gas/generateur_gardes.gs` · (05/09/2026)

*Juste avant :* `const TIRAGE = Math.max(1, Number(opts && opts.tirage) || 1);`

(05/09/2026) NUMÉRO DE TIRAGE — à égalité PARFAITE entre deux MAR, c'est ce
numéro qui départage, et non plus la position de la ligne dans MEDECINS.
Mesuré en juillet : déplacer une ligne dans l'onglet changeait près d'une
garde sur trois. L'ordre est ici recalculé par hachage(nom, tirage) : il ne
dépend plus du tableur, et rejouer le même tirage redonne le MÊME planning.
L'onglet MEDECINS n'est jamais modifié.

### §112 — `gas/generateur_gardes.gs` · (11/09/2026)

*Juste avant :* `const iExT=hdr.indexOf('PART EXACTE'), iExS=hdr.indexOf('PART EXACTE SAM'),`

(11/09/2026) PART EXACTE — la reference du report, quand elle existe.
Les colonnes CIBLE de N-1 portent la cible ENTIERE. Un MAR dont la part
valait 5,539 samedis, arrondie a 6, et qui a fait 6 samedis, apparaissait
« a jour » alors qu'il en avait fait 0,46 de trop. Ce reliquat se rejouait
a l'identique chaque annee, toujours dans le meme sens, l'arbitrage a
egalite parfaite etant l'ordre alphabetique. Mesure sur cinq annees
consecutives : l'ecart cumule sur l'axe samedi passait de 1 a 5 gardes
entre le plus et le moins servi, et c'etaient toujours les memes.
En lisant la part exacte, le meme ecart oscille entre 1 et 2 sans monter,
et les positions tournent d'une annee a l'autre.
REPLI : si les colonnes manquent — statistiques ecrites par une version
anterieure a 2026-09-11.1, ou annee reconstruite a la main — on retombe
sur les colonnes CIBLE, exactement comme avant.

### §113 — `gas/generateur_gardes.gs` · (05/09/2026)

*Juste avant :* `const cibleExacte={};`

(05/09/2026) CIBLES ENTIÈRES — méthode des plus forts restes.
Une part de 5,4 samedis n'est atteignable par personne : le MAR est TOUJOURS
en écart, et l'écart affiché mélange l'injustice réelle et l'impossibilité
arithmétique. On passe donc à des entiers, comme on répartit des sièges :
chacun reçoit sa partie entière, puis les unités restantes sont attribuées
une par une. La SOMME reste exactement égale au nombre de gardes à poser —
arrondir chaque cible séparément la casserait (mesuré : +6 jeudis promis en
trop, 6 jours fériés sans propriétaire).
Qui reçoit l'unité en plus ? Celui qui est le plus CRÉDITEUR, report compris :
l'arrondi et la dette deviennent un seul et même mécanisme. Le report est donc
plié dans la cible et NE DOIT PLUS être ajouté une seconde fois dans ratio()
— d'où la remise à zéro de `dette` juste après.
`cibleExacte` conserve la part fractionnaire : c'est la vérité comptable, et
c'est elle qui servira à tenir le compteur cumulatif (lot 2).

### §114 — `gas/generateur_gardes.gs` · (LOT B · 01/09/2026)

*Juste avant :* `if(indispos[id]?.[addOneDay(date)]==='TP') return true;`

(LOT B · 01/09/2026) JAMAIS DE GARDE LA VEILLE D'UN TEMPS PARTIEL.
Le lendemain d'une garde est un repos de garde (RG), et le RG s'écrit
PAR-DESSUS le TP dans GARDES : le jour de temps partiel disparaissait
sans bruit. Mesuré sur les indisponibilités réelles 2027 augmentées des
260 jours de TP posables : 16 à 30 jours effacés par an, dans 18 tirages
sur 18. Un TP posé est ACQUIS (arbitrage le responsable, 01/09/2026) : cette
règle n'est levée par AUCUN dernier recours. Le levier, quand un jour
manque, est de libérer des vacances — pas de reprendre un congé accordé.

### §115 — `gas/generateur_gardes.gs` · (LOT C · 01/09/2026)

*Juste avant :* `const _LIB_ABS={INDISPO:'indisponible ce jour-là',VAC:'en vacances',FORM:'en formation',`

(LOT C · 01/09/2026) POURQUOI CE MAR NE PEUT-IL PAS PRENDRE CETTE GARDE ?
Rend null s'il le peut, sinon { classe, texte }. Trois classes, qui sont
les trois blocs du message d'échec :
  'immediat' — une case saisie dans INDISPOS : le comité ou le MAR peut la
               changer aujourd'hui, sans rien recalculer ;
  'planning' — une conséquence du placement en cours (garde voisine, repos,
               récup, combos) : non modifiable directement, mais libérer
               ailleurs peut la faire disparaître ;
  'profil'   — MEDECINS : pas de garde, jamais de week-end, rythme 2/2,
               jours fixes, arrivée/départ. Hors de portée du staff.
⚠️ Cette fonction REJOUE les tests de blocked() dans le MÊME ORDRE. Toute
divergence produirait des leviers qui ne débloquent rien — le défaut le
plus coûteux possible ici, puisque le comité agirait à l'aveugle. Le banc
vérifie l'équivalence exhaustive (blocked ⇔ motif non nul) sur une année
entière, MAR par MAR et jour par jour.

### §116 — `gas/generateur_gardes.gs` · (01/09/2026)

*Juste avant :* `retirer au plus coûteux : une indisponibilité se reprend d'un clic, un`

(01/09/2026) VERSION COURTE. La première énumérait chaque MAR sur sa
propre ligne : sur un jour d'été, cela donnait trente lignes où le seul
geste utile était noyé — illisible à l'écran, constaté en production le
jour même. On GROUPE désormais par motif : « 7 indisponibilités : … »
se lit, sept lignes séparées ne se lisent pas.
L'écran du comité, lui, met en forme la structure `joursVides` ; ce texte
sert au journal et à l'éditeur Apps Script.

### §117 — `gas/generateur_gardes.gs` · (05/09/2026)

*Juste avant :* `if(NOUVEL_ALGO && _di && !_relaxJS && (_di.dow===5||_di.dow===6||_di.dow===0)){`

(05/09/2026) DEUX WEEK-ENDS DE GARDE D'AFFILÉE : INTERDIT.
La règle existait, mais seulement comme pénalité dans l'optimiseur — donc
franchissable, et de fait franchie dès qu'on donne plus de poids à l'équité
(mesuré : 48 enchaînements par an au lieu de 2). Or ils ne naissaient même
pas dans l'optimiseur : c'est la POSE qui les créait, sans aucune règle de
week-end. On l'ajoute donc ici, au même niveau que le combo jeudi-samedi —
relâché uniquement en dernier recours, pour ne jamais laisser un jour vide.

### §118 — `gas/generateur_gardes.gs` · (05/09/2026)

*Juste avant :* `if(NOUVEL_ALGO){`

(05/09/2026) OBJECTIF LEXICOGRAPHIQUE. Cette somme de carrés minimise
l'écart MOYEN : elle laisse volontiers un MAR à 3 gardes d'écart si le
total baisse. On ajoute un terme charnière qui ne se déclenche qu'AU-DELÀ
du seuil vert, et qui coûte assez cher pour passer avant tout gain de
moyenne — sans écraser la règle des week-ends (poids 1000 plus bas).
Effet mesuré sur l'année la plus dure (2041, 15 gardeurs) : 60 calculs
complets sans lui ne descendaient jamais sous 2 gardes d'écart ; avec lui,
les 20 calculs testés donnent 1. La bonne répartition existait.

### §119 — `gas/generateur_gardes.gs` · (10/09/2026)

*Juste avant :* `const dispo18Cnt={};`

(10/09/2026) POIDS PRORATISE PAR LA PRESENCE REELLE. Le poids ne tenait
compte que de la quotite : un MAR present deux mois visait une annee
pleine de 18h, et se faisait servir en premier pour rattraper. Le pot des
18h etant partage AU PRORATA DES POIDS, un poids faux deplace la part de
tous les autres — a commencer par les ONLY_18, dont le RATIO_18 est
precisement une compensation calculee sur ce partage.
On reutilise structAvail (section 5), deja la reference pour les cibles
de gardes : meme notion de presence structurelle (bornes date_debut /
date_fin et conges longs), une seule definition dans le fichier.

### §120 — `gas/generateur_gardes.gs` · (08/09/2026)

*Juste avant :* `const cibles = {}, jf = {}, noel = {}, h18 = {};`

(08/09/2026) LE CALCUL À BLANC EST LE SEUL ÉCRAN.
Il ne crée aucun onglet : tout ce qu'il ne dit pas est perdu. On rend donc
ici TOUT ce que la fin du calcul a déjà sous la main — cibles par axe,
fériés, Noël, 18 h, souhaits honorés, tenue de la règle des paires. Rien
n'est recalculé, rien n'est écrit : ce sont des variables déjà en mémoire
que l'ancienne version jetait.

### §121 — `gas/generateur_gardes.gs` · (11/09/2026)

*Juste avant :* `st.getRange(1,1,1,31).setValues([['MEDECIN','CIBLE','TOTAL G','G (REA)','G2 (MAT)','LUN','MAR','MER'`

(11/09/2026) PART EXACTE — colonnes 26 a 31, AJOUTEES EN FIN comme les souhaits.
Pourquoi : la colonne CIBLE porte la cible ENTIERE (36 ou 37). La part reelle,
36,6, disparaissait a la generation. Deux MAR de meme quotite finissaient donc
l'un a 36 et l'autre a 37 sans que rien ne garde trace du reliquat, et le report
de N+1 les voyait tous deux « a jour ». On enregistre ici la part fractionnaire
AVANT arrondi, pour que le report de N+1 puisse s'y referer.
CE PATCH N'ECRIT QUE DE LA DONNEE : aucune decision du generateur ne la lit,
aucun planning ne change. La lecture par la dette viendra separement.
Colonnes ajoutees EN FIN : code.gs lit encore 1, 17, 18, 19, 21 et 22 par
position, et la sonde de diagnostic s'arrete a la colonne 23.

### §122 — `gas/generateur_gardes.gs` · (25/08/2026)

*Juste avant :* `notifierPush_('Votre planning ' + year + ' est disponible',`

(25/08/2026) Le message partait à TOUS les abonnés, vers './admin.html' :
le MAR recevait une notification qui ne le concernait pas (« N avertissements »)
et atterrissait sur la page du comité — qui n'a pas de portail. Le canal push
est celui du MAR (doctrine notifications) : un seul message, ciblé sur eux,
vers la page qui les intéresse. Le comité, lui, voit le résultat à l'écran
au moment où il génère.

## gas/indisponibilites.gs

### §123 — `gas/indisponibilites.gs` · (POSE TP · 22/08/2026)

*Juste avant :* `if (payload.tp === true) {`

(POSE TP · 22/08/2026) DEUX CIRCUITS, DEUX ANNÉES — jamais l'un vers l'autre.
· mode TP (payload.tp === true) : vise l'année de la PHASE (_phaseTp_),
  JAMAIS getIndisposYear() — qui se replie en silence sur l'année active
  hors campagne, et enverrait les TP dans la mauvaise année.
· mode campagne (défaut) : comportement historique, PLUS le verrou qui
  manquait — saveIndispos n'interrogeait jamais _indisposOuverte_ : rien
  n'empêchait un rôle mar d'écrire hors campagne. Le rôle admin n'est pas
  verrouillé : le comité reste maître des corrections VAC/FORM.

### §124 — `gas/indisponibilites.gs` · (LOT A · 01/09/2026)

*Juste avant :* `const existantC = getIndisposForDoctor(targetId, anneeInd);`

(LOT A · 01/09/2026) LE TEMPS PARTIEL REVIENT DANS LA CAMPAGNE.
Le 23/08 les TP avaient été sortis d'INDISPOS : ils se posaient APRÈS
la génération, pour ne pas contraindre l'algorithme. Le comité a
tranché l'inverse le 01/09 — un MAR à temps partiel pose ses jours EN
MÊME TEMPS que ses indisponibilités et ses gardes souhaitées, sur le
même écran. Le reliquat non posé reste plaçable au fil de l'eau, dans
les trous du planning, par le circuit dédié (payload.tp === true).
Mesuré avant de rouvrir : 260 jours de TP posables par 8 MAR, ajoutés
aux indisponibilités réelles 2027, ne dégradent ni l'équité (écart
maximal 1,6 pour un plafond de 2) ni les gardes rapprochées.
Le TP est un CONGÉ : il est exclusif d'une indisponibilité ou d'une
garde souhaitée le même jour — une case ne porte qu'un code, poser un
TP remplace ce qui s'y trouvait. Le quota annuel (CONFIG_CONGES,
colonne CTP) est vérifié ICI : l'écran peut retarder, le serveur non.

### §125 — `gas/indisponibilites.gs` · (11/09/2026)

*Juste avant :* `const indRefuses = [];`

(11/09/2026) QUOTA D'INDISPONIBILITÉS — vérifié ICI, comme le TP :
l'écran peut retarder d'une version, le serveur non.
On compte SUR L'ENVOI, et c'est le bon compte : l'écran envoie toujours
la carte complète de l'année, jamais un delta, et _fusionIndispos_
retire ce qui n'y figure pas pour les codes appartenant au MAR. L'envoi
est donc l'état final de ses indisponibilités.
Écrit puis corrigé le même jour : la première version ajoutait au compte
les INDISPO déjà enregistrées absentes de l'envoi — or la fusion allait
justement les supprimer. Elle facturait deux fois des jours retirés, et
le banc l'a prise en défaut sur « redescendre à 5 puis remonter à 25 ».
Le comité n'est pas plafonné : il arbitre des cas particuliers, et le
refuser l'obligerait à passer par le classeur.

### §126 — `gas/indisponibilites.gs` · (13/08/2026)

*Juste avant :* `function _act_getOrdreVacances(R) {`

(13/08/2026) Bandeau « mon ordre de passage » de la vue Mes congés.
Lecture seule, réservée aux MAR : un code secrétariat n'y accède pas
(liste blanche SECRETARIAT_ACTIONS), un code admin n'a pas d'identifiant
de MAR et n'aurait donc pas de rang à afficher.
L'année mise en avant bascule le 1er septembre : jusqu'au 31 août on
regarde l'année en cours, après on prépare le staff de la suivante.
C'est une règle d'affichage, tranchée ici pour que la date de référence
soit celle du service et non celle du téléphone.

### §127 — `gas/indisponibilites.gs` · (25/08/2026)

*Juste avant :* `const _dejaGenere = _indisposFigees_();   // (26/08) source unique — partagée avec la clé acces`

(25/08/2026) `genere` : le planning de l'année de campagne existe déjà.
L'écran passe alors en LECTURE SEULE — les indispos ne servent plus à
rien une fois les gardes tirées, et sans ce signal le MAR pouvait
continuer à saisir pendant des semaines en croyant que ça comptait.
La campagne n'est PAS fermée pour autant : la clôture (qui archive
l'année et bascule sur la suivante) reste un geste du comité, sinon
une simple génération d'essai basculerait tout.

### §128 — `gas/indisponibilites.gs` · (13/09/2026)

*Juste avant :* `quotaIndispo: QUOTA_INDISPO, quotaIndispoWe: QUOTA_INDISPO_WE,`

(13/09/2026) LES DEUX PLAFONDS D'INDISPONIBILITÉS. Ils étaient ajoutés
au retour de la fonction interne getVacConfig — que l'écran n'appelle
PAS. Cette action-ci reconstruit sa réponse champ par champ : les deux
quotas étaient calculés puis jetés. L'écran recevait donc null, et son
garde-fou, conditionné à `quotaIndispo != null`, était sauté en entier.
Un MAR a pu poser 27 indisponibilités sans rien voir passer.
Le serveur, lui, refusait bien au-delà de 20 — mais en silence, sans
dire lesquelles il écartait. Le pire des deux mondes.
Le banc compare désormais les champs renvoyés ici à ceux que la page
lit dans vacConfig.

## gas/journal.gs

### §129 — `gas/journal.gs` · (2026-08-05.3, CORRECTIF)

*Juste avant :* `const verrou = LockService.getDocumentLock();`

(2026-08-05.3, CORRECTIF) Verrou de DOCUMENT, pas verrou de script. Les
fonctions d'ecriture appelees ensuite (savePlanningOverridesBatch,
retirerPlacementsPourDates) prennent, elles, le verrou de SCRIPT : si
l'applicateur le tenait deja, chacune de ces ecritures attendrait ses
15 s de timeout avant de continuer — une pose de statut par le journal
aurait coute 15 s de plus, pour rien. Deux espaces de verrous distincts :
l'applicateur ne se chevauche pas avec lui-meme, et les ecritures gardent
leur exclusion mutuelle habituelle.

## gas/miroir.gs

### §130 — `gas/miroir.gs` · (2026-08-04.5, AUDIT)

*Juste avant :* `const MIROIR_APRES_ECRITURE = {`

(2026-08-04.5, AUDIT) Une famille = ce que l'action MODIFIE REELLEMENT.
L'accroche tourne DANS la requete, avant la reponse : chaque famille en
trop est du temps d'attente utilisateur. Constats de l'audit :
- un lot de placements n'ecrit que PLANNING_OVERRIDES → config_admin seul
  (le fichier planning ne change qu'a la PUBLICATION) ;
- setDailyStatus ecrit GARDES + le reflet INDISPOS, ne republie pas ;
- la generation n'a pas encore publie → pas de famille planning.
applyModification garde un perimetre large (action rare, doute documente
sur la mise a jour du fichier).

### §131 — `gas/miroir.gs` · (2026-08-05.6)

*Juste avant :* `const MIROIR_CLE_ATTENTE = 'MIROIR_POUSSEES_EN_ATTENTE';`

(2026-08-05.6) ACCROCHE DIFFEREE — mesure du 05/08 au matin : meme avec
l'audit des familles (.5), la construction + l'envoi au miroir DANS la
requete coutaient encore ~5 s a chaque ecriture (savePlanningOverridesBatch :
6,9 s serveur, dont ~1,5-2 s d'ecriture reelle). Desormais la requete se
contente de NOTER ce qu'il faudra pousser (fusion dans les proprietes du
script, sous verrou) et de garantir UN declencheur unique : la reponse part
tout de suite, le declencheur pousse dans la minute qui suit, la synchro
horaire ramasse tout echec. Fraicheur MAR : ~1-2 min au lieu de ~1 —
l'ecran qui vient d'ecrire relit de toute facon le circuit DIRECT.

### §132 — `gas/miroir.gs` · (23/08/2026)

*Juste avant :* `logAction('miroir : ' + payload.action + ' → familles [' + familles.join(',') + '] année ' + annee`

(23/08/2026) TRACE. Cette accroche était entièrement muette : quand une
écriture ne rafraîchissait pas la copie rapide, rien ne permettait de
savoir si elle avait été notée, avec quelle année, ni si la poussée
avait eu lieu. Deux symptômes en production le 23/08 (alertes du comité
qui reviennent au rechargement, tuile lente) sans aucune trace pour
trancher. LOGS dit désormais la vérité.

### §133 — `gas/miroir.gs` · (23/08/2026)

*Juste avant :* `const deja = ScriptApp.getProjectTriggers().some(function (t) {`

(23/08/2026) BLOCAGE DÉFINITIF CORRIGÉ. Le déclencheur n'était armé que si
la file était VIDE : l'idée était qu'une file non vide signifiait qu'un
déclencheur existait déjà. Faux dès qu'une exécution meurt avant d'avoir
purgé la file — dépassement de quota, temps limite, erreur non prévue.
La file restait alors pleine POUR TOUJOURS, plus aucune note n'armait de
déclencheur, et la copie rapide ne se rafraîchissait plus jamais seule.
Constaté en production le 23/08 : notes prises à 16h15 et 16h16, aucune
poussée derrière, alors que celle de 15h56 était passée.
La condition juste n'est pas « la file était vide » mais « aucun
déclencheur n'existe » — c'est le seul fait qui compte.

### §134 — `gas/miroir.gs` · (2026-08-20.1)

*Juste avant :* `try { if (new Date().getHours() === 4) miroirOublierEmpreintes(); } catch (e) {}`

(2026-08-20.1) UNE FOIS PAR JOUR, tout repart sans condition. Le filtre
différentiel se fie à une mémoire locale ; si elle ment (miroir vidé à la
main, écriture perdue chez Cloudflare), une donnée resterait figée sans
que rien ne le signale. Le passage de 4 h efface cette mémoire : ~29
écritures, une fois par nuit, contre l'assurance qu'aucun écart ne dure
plus de 24 h.

### §135 — `gas/miroir.gs` · (2026-08-05.8)

*Juste avant :* `miroir, on est remonté à l'onglet qui l'alimente réellement, au lieu de`

(2026-08-05.8) MODIFICATIONS MANUELLES DU CLASSEUR. Constat du 05/08 :
une correction faite directement dans le Google Sheet n'était vue par
personne — aucune requête ne part, donc aucune note miroir ; la copie de
lecture ne se réalignait qu'à la synchro HORAIRE (attente jusqu'à 1 h,
affichages incohérents entre pages). Ce déclencheur écoute les éditions du
classeur et pose la MÊME note que les écritures du portail : la copie suit
dans la minute. Le planning PUBLIÉ, lui, ne bouge pas — c'est le rôle du
bouton « Publier », qui reste un acte volontaire du comité.

### §136 — `gas/miroir.gs` · (2026-08-06.11)

*Juste avant :* `const MIROIR_ONGLETS_SUIVIS = {`

(2026-08-06.11) Liste établie par INVENTAIRE : pour chaque famille du
miroir, on est remonté à l'onglet qui l'alimente réellement, au lieu de
lister les onglets « qui viennent à l'esprit ». Trois manquaient —
AFFECTATIONS (les cases à pourvoir), STATS_GARDES (l'équité et la dette),
CS_TEMPLATE et SEUILS (modèle de consultations, bornes de tension) : une
correction manuelle y attendait la synchro HORAIRE sans que rien ne le dise.
Toute nouvelle famille du miroir impose de revoir cette table.

### §137 — `gas/miroir.gs` · (17/08/2026)

*Juste avant :* `if (uniq['releve_liberal']) {`

(17/08/2026) Relevé du groupement. ⚠️ ANNÉE CIVILE, PAS L'ANNÉE ACTIVE :
le relevé de l'administration est calendaire, alors que l'année active du
planning bascule dès l'automne (même piège que les onglets LIBERAL_{Y},
corrigé le 22/07). En janvier, l'onglet de la nouvelle année n'existe pas
encore : getReleveLiberal rend alors une liste vide, ce qui est juste.
L'enveloppe complète est déposée telle quelle : la page consomme
exactement ce que lui rendait l'action, sans transformation.

### §138 — `gas/miroir.gs` · (03/08/2026, correctif)

*Juste avant :* `const annees = [];`

(03/08/2026, correctif) TOUTES les annees consultables, pas « active
+ N+1 ». Constate en reel : annee active 2027, selecteur proposant
2026 → planning_2026 jamais depose au miroir, repli GAS a chaque
bascule d'annee. Source de la liste : le meme balayage que le
selecteur (_miroirConstruireAnnees_ : GARDES_{Y} actifs + archives) ;
chaque annee n'est poussee que si son fichier existe sur le Drive
(_miroirAjouteFichierDrive_ saute silencieusement les absents).

### §139 — `gas/miroir.gs` · (2026-08-13.2)

*Juste avant :* `if (uniq['stats'])       _miroirAjouteEnveloppe_(items, 'equite_live_' + y, function () {`

(2026-08-13.2) INSTANTANE D'EQUITE. computeStatsLive recompte les gardes
REELLEMENT faites sur toute l'annee, echanges et dons compris. C'est le
calcul le plus lourd du portail : mesure du 13/08, plusieurs dizaines de
secondes ressenties cote MAR, et c'est lui qui rend le diagnostic long.
Le faire ici, c'est le payer UNE fois pour les 23, dans le declencheur
differe — jamais dans la requete d'un MAR, jamais dans l'ecriture du
comite (celle-ci se contente de noter la poussee depuis le 05/08).
Memes declencheurs que la famille stats : un echange de garde republie
donc l'instantane dans la minute. Contrepartie assumee : l'ecran n'est
plus exact a la seconde mais a la minute — le lien « recalculer » de la
page reste la pour qui veut la valeur fraiche.

### §140 — `gas/miroir.gs` · (2026-08-05.9)

*Juste avant :* `_miroirAjouteEnveloppe_(items, 'liberal_' + annee, function () {`

(2026-08-05.9) Activité libérale du jour, pour le volet du panneau de
placement. Contenu STRICTEMENT limité à ce que l'écran affiche : qui
opère, dans quel secteur, quelle chirurgie. AUCUN montant — ils restent
au classeur (voir listLiberalJour, portail.gs 2026-08-05.2).
Clé admin seule. Objectif : le volet s'affiche instantanément au lieu
des 3,8-9,6 s mesurés le 05/08.

### §141 — `gas/miroir.gs` · (17/08/2026)

*Juste avant :* `_miroirAjoute_(items, 'liberal_mar_' + annee, function () {`

(17/08/2026) MES DECLARATIONS. La cle liberal_{Y} existante est celle du
COMITE : volontairement allegee (ni identifiant, ni montant, ni
specialite — decision du 05/08). La page « Mes interventions declarees »
a besoin de tout cela : identifiant pour supprimer, dates, specialite,
montants. D'ou une cle SEPAREE, structuree par MAR comme les indispos,
que le Worker filtre a ses propres lignes. Le comite garde la sienne,
allegee : il n'a pas besoin des montants.

### §142 — `gas/miroir.gs` · (LOT 3 · 22/08/2026)

*Juste avant :* `[annee, annee + 1].forEach(function (yP) {`

(LOT 3 · 22/08/2026) La cle de l'ecran de pose des TP : effectifs par
jour + blocages par MAR + quotas (contenu : _construirePoseTp_,
Indispos.gs). Rebatie des que gardes OU indispos bougent — les deux
nourrissent l'effectif. Poussee pour l'annee active ET la suivante :
hors phase, le constructeur renvoie { ferme: true }, empreinte stable
(une ecriture KV une seule fois), et la cle s'auto-nettoie quand
GARDES_{Y} est supprime pour regenerer.

### §143 — `gas/miroir.gs` · (2026-08-13.1)

*Juste avant :* `_miroirAjoute_(items, 'ordre_vac', function () {`

(2026-08-13.1) Ordre de passage des vacances, pour l'annee en cours et la
suivante. Copie COMMUNE : elle ne contient aucun rang personnel — la page
cherche son propre identifiant dans les listes ordonnees.
Pourquoi au miroir : le bandeau de « Mes conges » attendait un
aller-retour Apps Script a chaque ouverture. Ici il voyage dans le MEME
appel que le planning, a l'ouverture du portail — aucune requete de plus.
Les annees sont FIGEES a la poussee : la synchro horaire les reactualise
au plus tard une heure apres le 1er janvier, et la page compare de toute
facon les annees recues a celles qu'elle attend.

### §144 — `gas/miroir.gs` · (16/08/2026)

*Juste avant :* `const MIROIR_CLES_PAR_ANNEE    = ['planning_', 'affectations_', 'indispos_',`

(16/08/2026) `equite_live_` manquait à cette liste : la clé est poussée PAR
ANNÉE depuis le 13/08 (instantané d'équité), donc elle survivait au retrait
d'une année — exactement le défaut du 09/08, revenu par une famille ajoutée
depuis. Toute nouvelle clé portant une année DOIT entrer ici le jour même,
sinon elle reste servie indéfiniment. Le banc compare cette liste aux clés
réellement construites par année dans _miroirConstruire_ : il refuse qu'une
famille échappe à l'oubli.

### §145 — `gas/miroir.gs` · (2026-08-05.10)

*Juste avant :* `const MIROIR_MAX_CLES = 20;`

(2026-08-05.10) ENVOI PAR PAQUETS. Le Worker refuse plus de 20 clés par
appel — garde-fou volontaire contre les requêtes énormes. Or la synchro
COMPLÈTE construit 11 clés globales + 5 par année consultable + 1 pour les
indispos : 23 clés avec 2026 et 2027, et 28 dès que 2028 existera. Elle
échouait donc EN BLOC (« 20 clés maximum », 05/08 17:42) — le filet horaire
était hors service sans que rien ne le signale à l'écran.
Découpage en lots de 20 : chaque lot part séparément, et le compte rendu
agrège les résultats. Un lot en échec n'empêche pas les autres de passer,
et le rapport dit lequel a échoué.

### §146 — `gas/miroir.gs` · (08/09/2026)

*Juste avant :* `var tuilesParMar = {};`

(08/09/2026) TUILES RESTREINTES. Cinq tuiles du dashboard ne s'adressent
qu'a une ou deux personnes (CRH, statistiques d'usage, guide technique,
consultations, liberal en rodage). Leur destinataire etait ECRIT EN DUR
dans index.html — un nom de medecin dans un depot public, et une
tuile qui disparait pour tout le monde des que ce nom change.
Desormais : cle CONFIG / TUILES_PRIVEES, dans le classeur prive.
Format : ID:tuile,tuile;ID:tuile   (ex. AFR:crh,stats;WS:liberal)
Cle absente = personne ne voit ces tuiles : le defaut sur : ferme.

### §147 — `gas/miroir.gs` · (08/09/2026)

*Juste avant :* `try {`

(08/09/2026) DEUX LISTES GLOBALES, DEDUITES DE MEDECINS.
Elles remplacent des noms de medecins ECRITS EN DUR dans les pages :
  titresPr        — qui s'affiche « Pr » plutot que « Dr » (colonne NOM)
  souhaitsPlafond — regime de souhaits garantis (colonne souhait_plafond),
                    qui retire le MAR des calculs d'equite
Un depot public n'a pas a nommer un praticien pour savoir comment
l'appeler. Deduites, donc rien a saisir : la colonne fait foi.

### §148 — `gas/miroir.gs` · (04/09/2026)

*Juste avant :* `var noel = null;`

(04/09/2026) L'HISTORIQUE DE NOËL VOYAGE AVEC LES PÉRIODES.
Constaté au staff du 04/09, devant la salle : le bouton « 🎄 Noël & Jour
de l'An » a répondu « historique indisponible ». C'était le SEUL appel de
staff.html qui partait encore en direct sur Apps Script — tout le reste de
la page (médecins, indispos, fériés, périodes) arrive de la copie rapide.
Or Apps Script exécute en file : une vingtaine de connexions simultanées
ont suffi à mettre le clic derrière tout le monde. Le soir, au calme, le
même bouton répondait.

POURQUOI ICI et pas dans une clé à part : `vacances_admin` est déjà
réservée au comité côté Worker, déjà lue au chargement de cet écran, et
n'est PAS suffixée par année. Une clé neuve aurait imposé les trois choses
qu'on veut éviter — une entrée dans MIROIR_CLES_PAR_ANNEE (sinon elle
survit au ménage de fin d'année, défaut déjà vu deux fois), une règle
d'accès dans le Worker, et donc un déploiement Cloudflare de plus.

⚠️ TRY À LUI SEUL, volontairement. `_miroirAjouteEnveloppe_` abandonne la
clé ENTIÈRE au premier jet : sans ce filet, une erreur sur l'historique de
Noël emporterait aussi les périodes et les groupes, c'est-à-dire tout
l'écran du staff vacances. En cas d'échec, `noel` vaut null et la page
repasse par Apps Script exactement comme avant : dégradé, jamais cassé.

### §149 — `gas/miroir.gs` · (06/09/2026)

*Juste avant :* `if (cible && cible.role && cible.role !== 'mar') return;   // comité : pas de cloche`

(06/09/2026) DÉFAUT VU EN PRODUCTION. Ce garde-fou visait le canal du
COMITÉ, qui n'a pas de cloche. Il écartait en réalité TOUS les rôles — y
compris `role:'mar'`, celui de la génération des gardes, c'est-à-dire la
notification la plus importante de l'année. Le push partait sur les
téléphones, la cloche restait vide, et rien ne pouvait le révéler puisque
la notification, elle, arrivait bien.
Preuve : NOTIFS_JOURNAL ne contenait que deux lignes, du 25/08, écrites
quand l'appel utilisait encore la cible `*`. La génération du 04/09 n'y
figure pas.
Une cible `role:'mar'` s'adresse à TOUS les MAR : c'est le sens de `*`.

## gas/portail.gs

### §150 — `gas/portail.gs` · (17/08/2026)

*Juste avant :* `function _libMoisISO_(v) {`

(17/08/2026) LE MOIS DU RELEVE PEUT ETRE UNE DATE, PAS DU TEXTE.
getOrCreateLiberalCaTab ecrit la chaine '2026-07' ; Sheets la RECONNAIT comme
une date et stocke une vraie date. getValues() renvoie alors un objet Date,
dont String() donne 'Wed Jul 01 2026 00:00:00 GMT+0200'. Constate le
17/08/2026 sur les 228 cellules de LIBERAL_CA_2026. Deux consequences, vues
a l'ecran : la page affichait « cumul janvier -> undefined Wed », et le
« dernier mois », choisi par un tri alphabetique, comparait des NOMS DE JOURS
ANGLAIS — il serait reste bloque sur juillet jusqu'en decembre (Sat, Sun,
Thu, Tue passent tous avant Wed).
On normalise ICI, a la lecture : le classeur n'est pas touche, les mois deja
saisis sont rattrapes, et 'AAAA-MM' se trie de nouveau dans l'ordre.
Canard-typage volontaire (pas `instanceof Date`) : au banc, la date vient
d'un autre contexte d'execution et `instanceof` y serait faux.

### §151 — `gas/portail.gs` · (02/08/2026)

*Juste avant :* `let trouveAutreMar = false;`

(02/08/2026) La recherche se faisait sur le SEUL identifiant, et s'arretait a la
premiere ligne trouvee. LIBERAL_2026 contient dix lignes partageant un meme ID
(heritage d'un ancien schema d'ID par fusion) appartenant a des MAR differents :
tous sauf le proprietaire de la premiere occurrence recevaient « pas la votre »
et ne pouvaient plus supprimer leur propre declaration. On cherche desormais sur
ID + MAR_ID, ce qui rend la suppression insensible aux doublons d'identifiant.

### §152 — `gas/portail.gs` · (2026-08-05.2)

*Juste avant :* `items.push({`

(2026-08-05.2) RÉPONSE ALLÉGÉE. Le volet du comité n'affiche que QUI
opère, dans quel SECTEUR, et le libellé de chirurgie (vérifié dans
renderLiberalCard, admin.html) : il regroupe par MAR + secteur et
compte les interventions. Les montants (br CCAM / NGAP) et la
spécialité voyageaient donc jusqu'au navigateur SANS AUCUN USAGE.
Ils restent désormais dans le classeur — moins de donnée sensible en
circulation, et cette liste devient mirrorable (affichage instantané).

## gas/setup_annee.gs

### §153 — `gas/setup_annee.gs` · (03/08/2026)

*Juste avant :* `let live = null;`

(03/08/2026) HISTORIQUE reflete desormais les gardes REELLEMENT faites.
Il recopiait le snapshot STATS, c'est-a-dire le planning tel que genere. Or la
dette d'equite de l'annee suivante n'est PAS lue ici : le generateur va la
chercher directement dans STATS_GARDES_{annee-1}, avec repli sur le classeur
d'archives (generateur_gardes.gs). HISTORIQUE n'est donc pas un moteur, c'est
la memoire longue du service — et une fois GARDES_{annee} parti aux archives,
la seule trace qui reste dans le maitre. Autant qu'elle dise la verite.
Effet de bord voulu : les MAR presents dans la grille mais absents du snapshot
(arrivee en cours d'annee, ex. une prise de fonctions en novembre) obtiennent enfin leur
ligne, avec leur Noel reel — sans quoi ils redevenaient eligibles a Noel.
Repli : si la grille est illisible, on retombe sur l'ancien comportement.

### §154 — `gas/setup_annee.gs` · (05/09/2026)

*Juste avant :* `function W1_2028() { setupAnnee(2028); }`

(05/09/2026) LANCEUR TEMPORAIRE — essai à blanc de l'année 2028 dans une COPIE
du classeur, pour éprouver le nouvel algorithme sur une année complète dont
toutes les vacances, formations et TP sont posés (ce qui n'est le cas d'aucune
année réelle disponible aujourd'hui).
setupAnnee n'est appelée par AUCUN menu ni bouton — le guide technique la
décrit comme endormie — et l'éditeur Apps Script ne sait pas passer d'argument
à une fonction : d'où ce lanceur, sur le modèle de T() et T7().
⚠️ À N'EXÉCUTER QUE DANS UNE COPIE. Dans le classeur de production, il
effacerait la grille d'indisponibilités de 2028 si elle existait. Le garde-fou
de setupAnnee demande confirmation dès qu'une saisie est présente, mais ne
comptez pas dessus : vérifiez le nom du classeur avant de lancer.
⚠️ À RETIRER avec T() et T7() une fois 2027 publié.

### §155 — `gas/setup_annee.gs` · (05/09/2026)

*Juste avant :* `function W2_2026() { generateGardes(2026); }`

(05/09/2026) LANCEUR TEMPORAIRE — régénère 2026 sur des indisponibilités
COMPLÉTÉES, pour éprouver le nouvel algorithme sur les VRAIES absences du
service, pic de Noël compris (27/12 : 3 gardeurs disponibles sur 20).
Le seul intérêt de 2026 : c'est la seule année dont les absences sont réelles.
Le planning existant sert de point de comparaison.

⚠️ DANGER — À N'EXÉCUTER QUE DANS UNE COPIE DU CLASSEUR.
Dans le classeur de production, cette fonction :
  · exige d'abord la suppression manuelle de GARDES_2026 (verrou anti-
    régénération), mais une fois l'onglet supprimé plus rien ne protège ;
  · EFFACE le planning 2026 que l'équipe consulte ;
  · envoie une notification push à tous les MAR abonnés.
Vérifiez le nom du classeur avant de lancer.
⚠️ À RETIRER avec les autres lanceurs une fois 2027 publié.

## gas/temps_partiel.gs

### §156 — `gas/temps_partiel.gs` · (23/08/2026 — refonte)

*Juste avant :* `const estAdmin = user && user.role === 'admin';`

(23/08/2026 — refonte) LE TP S'ÉCRIT DANS GARDES, L'ONGLET MAÎTRE.
INDISPOS n'est plus touché : il sert AVANT la génération, pas après.
Une demande non tranchée n'écrit rien dans le planning — elle attend
dans TP_DEMANDES. Le comité seul la transforme en TP.

`envoye` est la photo complète de ce que l'écran croit : { date: 'TP' }.
Ce qui n'y figure plus est retiré.

### §157 — `gas/temps_partiel.gs` · (LOT 4 · 22/08/2026)

*Juste avant :* `puis enregistrer d'un coup. Chaque décision est traitée exactement comme`

(LOT 4 · 22/08/2026) LES DÉCISIONS DU COMITÉ sur les jours sous réserve.
Quatre gestes, tous annulables depuis l'écran, tous journalisés :
· valider            : la TPA du MAR devient TP (souveraineté comité,
                       passe par _poserTp_ — quota et journal compris)
· annuler_validation : le TP redevient TPA (même chemin)
· refuser            : le JOUR se ferme pour TOUTE l'équipe (TP_FERMES),
                       et chaque TPA posée ce jour-là est rendue — elles
                       ne pourraient jamais être validées. La réponse
                       liste qui a été rendu, pour l'annulation.
· annuler_refus      : le jour rouvre, les TPA rendues sont rétablies.
AUCUNE notification : le comité le dit de vive voix (maquette).

### §158 — `gas/temps_partiel.gs` · (23/08/2026)

*Juste avant :* `function _act_deciderJourTpLot(R) {`

(23/08/2026) DÉCISIONS EN LOT — le comité peut marquer toute sa liste
puis enregistrer d'un coup. Chaque décision est traitée exactement comme
une décision isolée (mêmes contrôles, mêmes notifications) ; seule la
republication est mutualisée, puisqu'elle est de toute façon différée et
dédoublonnée. Un échec sur une ligne n'arrête pas les autres : la réponse
dit ce qui est passé et ce qui ne l'est pas.

## gas/veille.gs

### §159 — `gas/veille.gs` · (2026-08-08.3, MESURÉ)

*Juste avant :* `const _VEILLE_MOIS = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',`

(2026-08-08.3, MESURÉ) 925 articles sur 2 044 n'avaient que le MOIS de
parution (numéro de revue) : sortpubdate les datait tous au « 01 », le
tri par date les laissait en blocs par revue (PMID contigus d'un même
numéro). Or epubdate — la date de MISE EN LIGNE — est au jour près pour
27 échantillons sur 30. On la préfère quand elle porte un jour ; sinon
repli sur sortpubdate/pubdate comme avant.

## cloudflare/worker.js

### §160 — `cloudflare/worker.js` · (2026-08-10.1)

*Juste avant :* `const CORS = {`

(2026-08-10.1) `doc_<idDrive>` : un topo ou un protocole PDF, pousse par la
tache dediee de miroir.gs. La valeur a la MEME forme que la reponse de
`getTopo`/`getProtocole` cote Apps Script — {success,name,mimeType,dataB64} —
pour que la bascule cote page ne change QUE la source, jamais le traitement.
Le controle « le fichier est-il bien dans le dossier Topos » n'a plus lieu
d'etre ici : seuls les documents reellement pousses existent comme cle, donc
un identifiant forge ne renvoie rien.

### §161 — `cloudflare/worker.js` · (08/09/2026)

*Juste avant :* `tuiles: Array.isArray(user.tuiles) ? user.tuiles : [],`

(08/09/2026) Tuiles reservees (CONFIG / TUILES_PRIVEES, deposees dans
`acces` par miroir.gs). Le Worker ne decide rien : il transmet. La
reponse de l'action `login` d'Apps Script porte le meme champ, sinon
la tuile clignoterait au gre des pannes du relais.
Place en FIN d'objet a dessein : banc_pose_tp mesure la distance entre
l'ouverture de `identite` et `phaseTp`. Un champ insere plus haut la
fait deborder et casse un garde-fou qui n'a rien demande.

### §162 — `cloudflare/worker.js` · (pastille, 23/08/2026 — UNIFIÉE)

*Juste avant :* `(notif_sub_<id>), une cible par id est un accès direct ; une cible par`

(pastille, 23/08/2026 — UNIFIÉE) Une seule logique : le compteur de
non-vus PAR destinataire (notif_cpt_<id>), +1 à chaque envoi, remis à
zéro quand le MAR ouvre son dashboard (/notif-vu). Un `pastille` imposé
par l'appelant (les échanges en envoyaient un : les demandes en attente)
est IGNORÉ — décision du 23/08 : deux chiffres qui se disputent l'icône,
c'est un chiffre faux. La charge devient nominative : chiffrée par
destinataire de toute façon, elle l'était déjà.

