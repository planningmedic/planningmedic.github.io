/* ═══ BANC — ÉCRAN DES STATISTIQUES D'USAGE (29/08/2026) ═════════════════
   Exécute le VRAI getStatsUsage de gas/portail.gs, et lit la page réelle
   docs/stats-usage.html plus la tuile de index.html.

   CE QUE CE SCÉNARIO PROTÈGE, par ordre de gravité :
     1. L'action est REFUSÉE à tout rôle autre qu'admin. Masquer la tuile ne
        ferme rien : seul le serveur décide (même principe que getReleveLiberal).
     2. Aucun total de connexions PAR PERSONNE n'est renvoyé. La page dit qui
        n'a pas ouvert le portail, jamais qui l'ouvre le plus — décision
        du responsable du 29/08, et c'est ce que la fiche déclare au DPO.
     3. La page lit les compteurs FIGÉS, jamais l'onglet brut CONNEXIONS.
        Une page qui recalculerait depuis le brut afficherait une courbe qui
        rétrécit à mesure que la purge opère.
     4. Les médecins inactifs (ACTIF≠O) ne sont pas comptés dans l'effectif. */
const path = require('path'), fs = require('fs'), vm = require('vm');
const { Classeur, extraireFonction, socleMedecins } = require(path.join(__dirname, 'stubs'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

const GS   = path.join(__dirname, '..', 'gas', 'portail.gs');
const INDGS = path.join(__dirname, '..', 'gas', 'Indispos.gs');  // _aDroitTuile_ y vit
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'stats-usage.html'), 'utf8');
const DASH = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const IND  = require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */;
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
  /* Dates RELATIVES à aujourd'hui : la frise couvre les 28 derniers jours. */
  const il = function (j, h) { const d = new Date(); d.setDate(d.getDate() - j); d.setHours(h, 0, 0, 0); return d; };
  cl.ajouter('CONNEXIONS', [['HORODATAGE','NOM','INITIALES','ROLE'],
    [il(60, 8), 'DUPONT', 'DU', 'mar'],       // hors des 28 jours
    [il(10, 8), 'DUPONT', 'DU', 'mar'],
    [il(10, 15), 'DUPONT', 'DU', 'mar'],      // même jour : un seul carré
    [il(2, 9),  'DUPONT', 'DU', 'mar'],
    [il(1, 9),  'ADMIN',  '',   'admin'],     // code d'administration : n'alimente aucune frise
    [il(1, 9),  'PARTI',  'PA', 'mar']]);

  const lus = [];
  const cl2 = { getSheetByName(n){ lus.push(n); return cl.getSheetByName(n); },
                getSheets(){ return cl.getSheets(); }, insertSheet(n){ return cl.insertSheet(n); } };
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => cl2 }, Logger: { log(){} }, console };
  vm.createContext(ctx);
  socleMedecins(ctx);   // (14/09/2026) COL_MED, _medecinsRows_, _medecinsInvalider_ (code.gs)
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
  /* (17/11/2026) Décision du responsable : la frise montre les JOURS de
     connexion des 28 derniers jours. Des dates, jamais un nombre. */
  V('la réponse ne contient aucun compteur nominatif',
    r.medecins.every(function (m) {
      return Object.keys(m).every(function (k) { return k === 'i' || k === 'd' || k === 'j'; });
    }), r.medecins);
  V('chaque médecin n\'expose QUE ses initiales, une date et une liste de jours',
    r.medecins.every(function (m) { return typeof m.i === 'string' && typeof m.d === 'string'
      && Array.isArray(m.j) && m.j.every(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); }); }), r.medecins);
  V('aucun nom complet ne figure dans la réponse',
    brut.indexOf('DUPONT') < 0 && brut.indexOf('MARTIN') < 0, brut.slice(0, 160));
  V('aucun code d\'accès ne fuit', brut.indexOf('AAAA1111') < 0 && brut.indexOf('BBBB2222') < 0);
}

console.log('\n═══ 3. Les courbes viennent des compteurs figés, la frise du brut ═══');
/* (17/11/2026) Les courbes ont disparu de la page ; la frise lit l'onglet brut
   CONNEXIONS, complet sur 28 jours (plafond ~3 mois). Ce qui reste interdit :
   que la PAGE lise le brut, et qu'une purge passe pour une absence. */
{
  const { ctx, lus } = bac();
  const r = ctx.getStatsUsage(ADMIN);
  const du = r.medecins.filter(function (m) { return m.i === 'DU'; })[0];
  const ma = r.medecins.filter(function (m) { return m.i === 'MA'; })[0];
  const jISO = function (j) { const d = new Date(); d.setDate(d.getDate() - j);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  V('la frise lit l\'onglet brut', lus.indexOf('CONNEXIONS') >= 0, lus);
  V('DU : 2 jours dans les 28 derniers (deux connexions le même jour = un seul jour)',
    JSON.stringify(du.j) === JSON.stringify([jISO(10), jISO(2)]), du.j);
  V('une connexion de plus de 28 jours n\'entre pas dans la frise', du.j.indexOf(jISO(60)) < 0, du.j);
  V('un médecin sans connexion récente a une frise vide', ma.j.length === 0, ma.j);
  V('le médecin parti n\'apparaît toujours pas', !r.medecins.some(function (m) { return m.i === 'PA'; }));
  V('le début du détail conservé est renvoyé (pour ne pas confondre purge et absence)',
    r.frise_depuis === jISO(60), r.frise_depuis);
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

console.log('\n═══ 6. « Qui s\'est connecté » montre TOUT le service ═══');
/* (29/08) Le tableau ne listait que les « jamais » et les inactifs de plus de
   30 jours, puis compensait par « Les N autres se sont connectés ». Décision
   du responsable : les 25, tous.
   (17/11/2026) Remonté en tête de page, rangé du plus récent au plus ancien,
   en groupes d'ancienneté et vignettes ; les deux courbes hebdomadaires sont
   retirées. Toujours aucun décompte par personne. */
{
  const src = PAGE.slice(PAGE.indexOf("/* ── Qui s'est connecté"), PAGE.indexOf('charger();'));
  const aux = PAGE.slice(PAGE.indexOf('const MOIS ='), PAGE.indexOf('/* ── Compteurs'));
  let sortie = '';
  const document = { getElementById: function(id){
    return id === 'qui' ? { set innerHTML(v){ sortie = v; } } : null; } };
  /* Dates RELATIVES à aujourd'hui : un test qui dépend du calendrier ment tôt ou tard. */
  const jourISO = function (recul) {
    const d = new Date(); d.setDate(d.getDate() - recul);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
                           + '-' + String(d.getDate()).padStart(2,'0');
  };
  const D = { medecins: [
    { i:'AXE', d:jourISO(0) }, { i:'LX', d:'' }, { i:'NX', d:'' },
    { i:'RX', d:jourISO(50) }, { i:'ZZ', d:jourISO(1) }, { i:'AA', d:'' },
    { i:'SM', d:jourISO(4), j:[jourISO(20), jourISO(4)] }, { i:'MO', d:jourISO(12) }
  ], frise_depuis: jourISO(25) };
  D.medecins[0].j = [jourISO(3), jourISO(0)];
  eval(aux + src);
  tableau();
  const vign = [...sortie.matchAll(/<span class="av ([a-z]+)">([A-Z]+)<\/span>(.*?)<span class="q">([^<]*)<\/span>/g)]
    .map(function(m){ return { k:m[1], i:m[2], f:m[3], q:m[4] }; });
  const ordre = vign.map(function(v){ return v.i; });
  const groupes = [...sortie.matchAll(/<div class="grp-t">([^<]+) <span class="nb">(\d+)<\/span>/g)]
    .map(function(m){ return [m[1], Number(m[2])]; });
  V('les 8 médecins fournis sont TOUS affichés', vign.length === 8, vign.length);
  V('aucun n\'est masqué derrière un résumé', sortie.indexOf('autres se sont connect') < 0);
  V('du plus récent au plus ancien, les jamais connectés en dernier',
    ordre.join(',') === 'AXE,ZZ,SM,MO,RX,AA,LX,NX', ordre);
  V('6 groupes, dans l\'ordre de l\'ancienneté',
    groupes.map(function(g){ return g[0]; }).join('|')
      === "Aujourd'hui|Hier|Cette semaine|Ce mois-ci|Plus d'un mois|Jamais connectés", groupes);
  V('le compte de chaque groupe est juste',
    groupes.map(function(g){ return g[1]; }).join(',') === '1,1,1,1,1,3', groupes);
  V('chaque vignette porte la classe de son groupe',
    vign.map(function(v){ return v.k; }).join(',') === 'auj,hier,sem,mois,vieux,jamais,jamais,jamais',
    vign.map(function(v){ return v.k; }));
  V('la barre de répartition totalise l\'effectif', /sur 8<\/span>/.test(sortie));
  V('« il y a N j » dans la semaine et le mois',
    vign[2].q === 'il y a 4 j' && vign[3].q === 'il y a 12 j', [vign[2], vign[3]]);
  V('au-delà d\'un mois, la date en clair (jour mois année)',
    /^\d{1,2} [a-zéû]+ \d{4}$/.test(vign[4].q), vign[4]);
  V('le titre du groupe n\'est pas répété sous la vignette',
    vign[0].q === '' && vign[1].q === '' && vign[5].q === '', [vign[0], vign[1], vign[5]]);
  V('chaque frise compte 28 jours',
    vign.filter(function(v){ return v.k !== 'jamais'; })
        .every(function(v){ return (v.f.match(/<i[ >]/g) || []).length === 28; }),
    vign.map(function(v){ return (v.f.match(/<i[ >]/g) || []).length; }));
  const carres = function (v) { return [...v.f.matchAll(/<i([^>]*)><\/i>/g)].map(function(m){ return m[1]; }); };
  const ax = carres(vign[0]), sm = carres(vign[2]);
  V('la frise allume aujourd\'hui et il y a 3 jours, en vert (groupe Aujourd\'hui)',
    /--ok/.test(ax[27]) && /--ok/.test(ax[24]) && ax.filter(function(c){ return /background:var/.test(c); }).length === 2, ax);
  V('dans le groupe Cette semaine, les carrés sont bleus', /--me/.test(sm[23]) && /--me/.test(sm[7]), sm);
  V('avant le début du détail conservé : case « inconnue », pas « absent »',
    /class="hors"/.test(sm[0]) && /class="hors"/.test(sm[1]) && !/class="hors"/.test(sm[3]), sm.slice(0, 4));
  V('les jamais connectés n\'ont pas de frise', vign.filter(function(v){ return v.k === 'jamais'; })
    .every(function(v){ return v.f.indexOf('aucune connexion') >= 0; }));
  V('aucun chiffre de connexions par personne n\'est affiché',
    !/\d+\s*connexion/i.test(sortie.replace(/<[^>]+>/g, ' ')), sortie.replace(/<[^>]+>/g, ' ').slice(0, 200));

  /* Couleurs : l'ANCIENNETÉ, pas le mérite. Aucun rouge. */
  const styles = PAGE.slice(PAGE.indexOf('.pil {'), PAGE.indexOf('</style>'));
  V('aucune vignette n\'utilise la couleur d\'alerte',
    styles.indexOf('--red') < 0 && src.indexOf('--red') < 0, styles.slice(0, 200));
  V('les 6 états ont chacun leur style',
    ['.av.auj','.av.hier','.av.sem','.av.mois','.av.vieux','.av.jamais']
      .every(function(c){ return styles.indexOf(c) >= 0; }));
  V('les jamais connectés sont en ambre', /\.av\.jamais\s*\{[^}]*--amber/.test(styles));
  V('la liste est la PREMIÈRE carte de la page',
    PAGE.indexOf('id="qui"') > 0 && PAGE.indexOf('id="qui"') < PAGE.indexOf('class="kpis"'));
  V('les deux courbes hebdomadaires ont disparu',
    PAGE.indexOf('id="ligne"') < 0 && PAGE.indexOf('id="profondeur"') < 0 && PAGE.indexOf('function courbe(') < 0);
  V('la carte de chaleur reste', PAGE.indexOf('id="heat"') > 0);
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
