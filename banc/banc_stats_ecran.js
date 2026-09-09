/* ═══ BANC — ÉCRAN DES STATISTIQUES D'USAGE (29/08/2026) ═════════════════
   Exécute le VRAI getStatsUsage de gas/portail.gs, et lit la page réelle
   docs/stats-usage.html plus la tuile de index.html.

   CE QUE CE SCÉNARIO PROTÈGE, par ordre de gravité :
     1. L'action est REFUSÉE à tout rôle autre qu'admin. Masquer la tuile ne
        ferme rien : seul le serveur décide (même principe que getReleveLiberal).
     2. Aucun total de connexions PAR PERSONNE n'est renvoyé. La page dit qui
        n'a pas ouvert le portail, jamais qui l'ouvre le plus — décision
        d'Arthur du 29/08, et c'est ce que la fiche déclare au DPO.
     3. La page lit les compteurs FIGÉS, jamais l'onglet brut CONNEXIONS.
        Une page qui recalculerait depuis le brut afficherait une courbe qui
        rétrécit à mesure que la purge opère.
     4. Les médecins inactifs (ACTIF≠O) ne sont pas comptés dans l'effectif. */
const path = require('path'), fs = require('fs'), vm = require('vm');
const { Classeur, extraireFonction } = require(path.join(__dirname, 'stubs'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

const GS   = path.join(__dirname, '..', 'gas', 'portail.gs');
const INDGS = path.join(__dirname, '..', 'gas', 'Indispos.gs');  // _aDroitTuile_ y vit
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'stats-usage.html'), 'utf8');
const DASH = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const IND  = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
const VJS  = fs.readFileSync(path.join(__dirname, '..', 'version.js'), 'utf8');
const BUNDLE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'vendor', 'lucide-icons.js'), 'utf8');

/* ── Le serveur ──────────────────────────────────────────────────────── */
function bac() {
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [
    ['ID','NOM','INITIALES','ACTIF','SECTEUR','EMAIL','CODE','X','DECT','DERNIERE_CONNEXION'],
    ['DUPONT','DUPONT','DU','O','VIS','a@b.c','AAAA1111','','1001','2026-09-20'],
    ['MARTIN','MARTIN','MA','O','REA','d@e.f','BBBB2222','','1002',''],
    ['PARTI', 'PARTI', 'PA','N','ORT','g@h.i','CCCC3333','','1003','2026-09-01'],
  ]);
  cl.ajouter('STATS_SEMAINE', [['SEMAINE','CONNEXIONS','ACTIFS','FIGEE'],
    ['2026-09-07', 30, 2, 'O'], ['2026-09-14', 44, 2, 'O'], ['2026-09-21', 12, 1, 'N']]);
  const gh = [['JOUR'].concat(Array.from({length:24},(_,h)=>'H'+String(h).padStart(2,'0')))];
  ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'].forEach((j,i)=>
    gh.push([j].concat(Array.from({length:24},(_,h)=> (i===6&&h===20)?9:(i+h)%3 ))));
  cl.ajouter('STATS_HEURES', gh);
  cl.ajouter('CONNEXIONS', [['HORODATAGE','NOM','INITIALES','ROLE'],
    [new Date('2026-09-21T08:00:00'), 'MARTIN', 'MA', 'mar']]);

  const lus = [];
  const cl2 = { getSheetByName(n){ lus.push(n); return cl.getSheetByName(n); },
                getSheets(){ return cl.getSheets(); }, insertSheet(n){ return cl.insertSheet(n); } };
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => cl2 }, Logger: { log(){} }, console };
  vm.createContext(ctx);
  /* Constantes LUES dans le code réel, jamais redéclarées à la main : un bac qui
     invente sa propre liste d'accès testerait la croyance du banc, pas le
     système. C'est précisément l'erreur qui a laissé passer le défaut du 29/08. */
  vm.runInContext("const STATS_ORIGINE='2026-09-04';", ctx);
  /* (08/09/2026) La porte lit maintenant CONFIG / TUILES_PRIVEES. On injecte les
     VRAIES fonctions du dépôt — _aDroitTuile_ et _tuilesPriveesDe_ — plus un
     onglet CONFIG dans le classeur du bac. Réécrire la règle ici testerait la
     croyance du banc et non le système : c'est l'erreur du 29/08. */
  cl.ajouter('CONFIG', [['CLE','VALEUR'], ['TUILES_PRIVEES', 'AYANTDROIT:crh,stats']]);
  vm.runInContext(
    'function _configRows_(){ return SpreadsheetApp.getActiveSpreadsheet()' +
    '.getSheetByName("CONFIG").getDataRange().getValues(); }', ctx);
  vm.runInContext(extraireFonction(INDGS, '_tuilesPriveesDe_'), ctx);
  vm.runInContext(extraireFonction(INDGS, '_aDroitTuile_'), ctx);
  vm.runInContext(extraireFonction(GS, 'getStatsUsage'), ctx);
  return { ctx, lus, cl };
}
/* L'ayant droit du bac : un identifiant fictif, cité par la clé CONFIG ci-dessus.
   Plus aucun nom réel dans ce scénario — c'est tout l'objet du changement. */
const ADMIN = { id:'AYANTDROIT', role:'mar', name:'AYANTDROIT' };

console.log('\n═══ 1. Qui a le droit d\'ouvrir la page ═══');
/* DÉFAUT RÉEL DU 29/08, trouvé en production, pas au banc. Le contrôle portait
   sur user.role === 'admin'. Or checkCode ne rend ce rôle QUE pour le code
   d'administration (id 'ADMIN') : ouvert avec son code personnel, DURAND est
   un `mar` et se voyait refuser sa propre page. La tuile, elle, filtre sur
   l'identité. La version précédente de ce scénario vérifiait « refus pour rôle
   mar » — elle enterinait l'erreur au lieu de la voir. */
{
  const { ctx } = bac();
  V('refus pour un utilisateur absent', ctx.getStatsUsage(null).success === false);
  V('refus pour un MAR quelconque',
    ctx.getStatsUsage({ role:'mar', id:'DUPONT' }).success === false);
  V('refus pour le secrétariat',
    ctx.getStatsUsage({ role:'secretariat', id:'SECRETARIAT' }).success === false);
  V('refus pour un rôle vide', ctx.getStatsUsage({ role:'', id:'X' }).success === false);
  /* Les deux portes qui doivent s'ouvrir. */
  V('ACCEPTÉ pour l\'ayant droit avec son code personnel (rôle mar)',
    ctx.getStatsUsage({ role:'mar', id:'AYANTDROIT' }).success === true,
    ctx.getStatsUsage({ role:'mar', id:'AYANTDROIT' }));
  V('ACCEPTÉ pour le code d\'administration (rôle admin, id ADMIN)',
    ctx.getStatsUsage({ role:'admin', id:'ADMIN' }).success === true);
  /* Le serveur et la tuile doivent viser la MÊME personne : deux critères
     différents pour la même porte, c'est le défaut du 29/08 qui revient. */
  /* (08/09/2026) Le critère n'est plus un identifiant écrit des deux côtés,
     mais UNE SEULE clé du classeur (CONFIG / TUILES_PRIVEES) lue par les deux.
     On ne compare donc plus deux noms : on vérifie qu'aucun des deux ne nomme
     personne, et qu'ils interrogent bien la même clé. */
  const srcGs = fs.readFileSync(GS, 'utf8');
  V('le serveur ne nomme plus personne', !/STATS_ALLOWED\s*=\s*\[/.test(srcGs));
  V('la tuile ne nomme plus personne', !/key:'stats'[^}]*only:/.test(DASH));
  V('le serveur interroge la clé du classeur',
    /_aDroitTuile_\(user\.id,\s*'stats'\)/.test(srcGs));
  V('la tuile est marquée réservée', /key:'stats'[^}]*prive:true/.test(DASH));
}

console.log('\n═══ 2. Aucun total par personne n\'est renvoyé ═══');
{
  const { ctx } = bac();
  const r = ctx.getStatsUsage(ADMIN);
  const brut = JSON.stringify(r);
  V('la réponse ne contient aucun compteur nominatif',
    r.medecins.every(function (m) {
      return Object.keys(m).every(function (k) { return k === 'i' || k === 'd'; });
    }), r.medecins);
  V('chaque médecin n\'expose QUE ses initiales et une date',
    r.medecins.every(function (m) { return typeof m.i === 'string' && typeof m.d === 'string'; }));
  V('aucun nom complet ne figure dans la réponse',
    brut.indexOf('DUPONT') < 0 && brut.indexOf('MARTIN') < 0, brut.slice(0, 160));
  V('aucun code d\'accès ne fuit', brut.indexOf('AAAA1111') < 0 && brut.indexOf('BBBB2222') < 0);
}

console.log('\n═══ 3. Le serveur ne lit JAMAIS les lignes brutes ═══');
{
  const { ctx, lus } = bac();
  ctx.getStatsUsage(ADMIN);
  V('l\'onglet CONNEXIONS n\'est pas ouvert', lus.indexOf('CONNEXIONS') < 0, lus);
  V('les compteurs figés sont bien lus',
    lus.indexOf('STATS_SEMAINE') >= 0 && lus.indexOf('STATS_HEURES') >= 0, lus);
  V('la page ne mentionne nulle part l\'onglet brut',
    !/getSheetByName\(.CONNEXIONS/.test(PAGE) && PAGE.indexOf("'CONNEXIONS'") < 0);
}

console.log('\n═══ 4. Le contenu renvoyé est juste ═══');
{
  const { ctx } = bac();
  const r = ctx.getStatsUsage(ADMIN);
  V('3 semaines sont renvoyées', r.semaines.length === 3, r.semaines.length);
  V('elles sont triées de la plus ancienne à la plus récente',
    r.semaines[0].s === '2026-09-07' && r.semaines[2].s === '2026-09-21', r.semaines.map(x=>x.s));
  V('les connexions de la 2e semaine valent 44', r.semaines[1].c === 44, r.semaines[1]);
  V('la grille fait 7 lignes de 24 heures',
    r.heures.length === 7 && r.heures.every(function (l) { return l.length === 24; }));
  V('l\'effectif ne compte que les médecins ACTIF=O', r.effectif === 2, r.effectif);
  V('le médecin parti est exclu', !r.medecins.some(function (m) { return m.i === 'PA'; }), r.medecins);
  V('celui qui ne s\'est jamais connecté a une date vide',
    r.medecins.filter(function (m) { return m.i === 'MA'; })[0].d === '', r.medecins);
  V('l\'origine du comptage est renvoyée', r.origine === '2026-09-04', r.origine);
}

console.log('\n═══ 5. La page et la tuile sont cohérentes avec le serveur ═══');
{
  V('la page appelle bien l\'action getStatsUsage', PAGE.indexOf("action:'getStatsUsage'") >= 0);
  V('la tuile existe dans le portail', DASH.indexOf("key:'stats'") >= 0);
  V('elle est réservée (droit venu du classeur)',
    /key:'stats'[^}]*prive:true/.test(DASH),
    (DASH.match(/\{ key:'stats'[^}]*\}/) || [''])[0].slice(0, 160));
  V('elle pointe sur la page réelle', /key:'stats'[^}]*docs\/stats-usage\.html/.test(DASH));
  /* (29/08) La tuile portait 'radar', déjà pris par Veille biblio : deux tuiles
     identiques à l'œil, pour deux choses sans rapport. Aucune icône libre du
     bundle ne disait « statistiques », bar-chart-2 a donc été ajoutée.
     La règle est que l'icône des statistiques n'appartienne qu'à elle. */
  const icoStats = (DASH.match(/key:'stats'[^}]*icon:'([a-z0-9-]+)'/) || [])[1];
  const toutes = (DASH.match(/icon:'[a-z0-9-]+'/g) || []).map(function (x) { return x.slice(6, -1); });
  V('l\'icône des statistiques est lisible', !!icoStats, icoStats);
  V('elle n\'est portée par aucune autre tuile',
    toutes.filter(function (x) { return x === icoStats; }).length === 1, icoStats);
  V('elle existe dans le mini-bundle',
    BUNDLE.indexOf('"' + icoStats + '":') >= 0, icoStats);
  V('la tuile porte bien bar-chart-2', /key:'stats'[^}]*icon:'bar-chart-2'/.test(DASH));
  V('la page ne réclame aucun classement d\'assiduité',
    PAGE.indexOf('classement') < 0 || /aucun classement/.test(PAGE));
  /* Le numéro de version vit dans version.js et NULLE PART ailleurs : une page
     visible a changé, il doit avoir bougé. Contre-épreuve du 29/08 : remettre
     v1.93 fait tomber cette vérification. */
  const v = (VJS.match(/window\.SITE_VERSION = 'v([\d.]+)'/) || [])[1];
  V('version.js porte un numéro, une seule fois',
    !!v && (VJS.match(/window\.SITE_VERSION =/g) || []).length === 1, v);
  /* (05/09/2026) Ce contrôle comparait le numéro à v1.95 pour dater la
     fonctionnalité. La numérotation est repartie de v1.0 le 05/09 — v1.0 = la
     version présentée au staff du 4 septembre — donc v1.0.4 est POSTÉRIEUR à
     v1.95 tout en étant plus petit. Un numéro ne peut plus dater quoi que ce
     soit ; on vérifie donc la PRÉSENCE de la fonctionnalité, ce que font déjà
     les vérifications ci-dessus, et la seule chose que le numéro doit encore
     garantir : sa forme. */
  V('le numéro de version est lisible (vX.Y ou vX.Y.Z)',
    !!v && /^\d+\.\d+(\.\d+)?$/.test(v), v);
}
function cmp(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

console.log('\n═══ 6. Le tableau montre TOUT le service ═══');
/* (29/08) Le tableau ne listait que les « jamais » et les inactifs de plus de
   30 jours, puis compensait par « Les N autres se sont connectés ». Il masquait
   donc justement les gens qui vont bien, et la phrase n'apprenait rien. Décision
   d'Arthur : les 25, tous, triés du plus ancien au plus récent. */
{
  /* On prend tableau() ET esc() : extraire la moitié d'une dépendance et
     recoder l'autre dans le banc reviendrait à tester une fonction qui n'existe
     pas dans la page. */
  const src = PAGE.slice(PAGE.indexOf('function tableau(){'), PAGE.indexOf('charger();'));
  const aux = PAGE.slice(PAGE.indexOf('const MOIS ='), PAGE.indexOf('/* ── Compteurs'));
  let sortie = '';
  const document = { getElementById: function(){ return { set innerHTML(v){ sortie = v; } }; } };
  /* Dates RELATIVES à aujourd'hui. Écrites en dur, elles vieillissaient : le
     scénario passait le 29/08 et tombait le 31, en signalant un défaut de la
     page alors que seul le test avait tort. Un test qui dépend du calendrier
     ment tôt ou tard. */
  const jourISO = function (recul) {
    const d = new Date(); d.setDate(d.getDate() - recul);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
                           + '-' + String(d.getDate()).padStart(2,'0');
  };
  const D = { medecins: [
    { i:'AFR', d:jourISO(0) }, { i:'LL', d:'' }, { i:'NP', d:'' },
    { i:'RW', d:jourISO(50) }, { i:'ZZ', d:jourISO(1) }, { i:'AA', d:'' }
  ]};
  eval(aux + src);
  tableau();
  const lignes = [...sortie.matchAll(/<td><span class="ini">([A-Z]+)<\/span><\/td><td>(.*?)<\/td>/g)]
    .map(function(m){ return [m[1], m[2].replace(/<[^>]+>/g, '')]; });
  V('les 6 médecins fournis sont TOUS affichés', lignes.length === 6, lignes.length);
  V('aucun n\'est masqué derrière un résumé', !/colspan/.test(sortie));
  V('la phrase « les N autres » a disparu', sortie.indexOf('autres se sont connect') < 0);
  V('les jamais connectés viennent en tête',
    lignes.slice(0,3).every(function(l){ return l[1] === 'jamais'; }), lignes.map(function(l){return l[0];}));
  V('puis du plus ancien au plus récent',
    lignes[3][0] === 'RW' && lignes[4][0] === 'ZZ' && lignes[5][0] === 'AFR',
    lignes.map(function(l){return l[0];}));
  V('« aujourd\'hui » plutôt que « il y a 0 jours »', lignes[5][1] === "aujourd'hui", lignes[5]);
  V('« hier » plutôt que « il y a 1 jours »', lignes[4][1] === 'hier', lignes[4]);
  V('au-delà d\'un mois, la date en clair (jour mois année)',
    /^\d{1,2} [a-zéû]+ \d{4}$/.test(lignes[3][1]), lignes[3]);

  /* (29/08) Couleurs : la pastille code l'ANCIENNETÉ, pas le mérite. Aucun
     rouge — il dirait « en faute » à propos d'un collègue qui n'a pas ouvert
     une page web, exactement le rôle que le service ne veut pas donner à cet
     écran. Vérifié sur la sortie réelle ET sur la feuille de style. */
  const pil = [...sortie.matchAll(/<span class="pil ([a-z]+)">([^<]*)<\/span>/g)]
    .map(function(m){ return [m[1], m[2]]; });
  V('chaque ligne porte une pastille', pil.length === lignes.length, pil.length);
  V('les jamais connectés sont en ambre',
    pil.filter(function(p){ return p[1] === 'jamais'; }).every(function(p){ return p[0] === 'jamais'; }), pil);
  V('aujourd\'hui est en vert', pil[5][0] === 'auj', pil[5]);
  V('hier aussi', pil[4][0] === 'auj', pil[4]);
  V('au-delà d\'un mois, la pastille pâlit', pil[3][0] === 'vieux', pil[3]);
  const styles = PAGE.slice(PAGE.indexOf('.pil {'), PAGE.indexOf('</style>'));
  V('aucune pastille n\'utilise la couleur d\'alerte',
    styles.indexOf('--red') < 0, styles.slice(0, 200));
  V('les 5 états ont chacun leur style',
    ['.pil.auj','.pil.sem','.pil.mois','.pil.vieux','.pil.jamais']
      .every(function(c){ return styles.indexOf(c) >= 0; }));
}

console.log('\n═══ 7. Les compteurs GAS ont bien été poussés avec ═══');
{
  V('CONNEXIONS_PLAFOND est à 10 000 dans Indispos.gs', /CONNEXIONS_PLAFOND\s*=\s*10000/.test(IND));
  V('statsRecalculer existe', /function statsRecalculer\(/.test(IND));
  V('portail.gs déclare l\'action', /case 'getStatsUsage'/.test(fs.readFileSync(GS, 'utf8')));
}

console.log('\n────────────────────────────────────');
console.log(ko === 0 ? `✅ ${ok} vérifications, 0 échec` : `❌ ${ko} échec(s) sur ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
