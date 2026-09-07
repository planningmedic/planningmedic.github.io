/* ═══ BANC — LE COMITÉ SE SERT-IL DE LA PAGE, OU L'OUVRE-T-IL ? (31/08/2026) ══
   Exécute le VRAI _statsActionIncr_ / logConnexion d'Indispos.gs et le VRAI
   getStatsUsage de portail.gs, puis lit la page réelle docs/stats-usage.html.

   ORIGINE. Les connexions disent QUI ouvre le portail, jamais ce qui y est
   fait. Question posée par Arthur le 31/08 : une fois le portail entre les
   mains du comité, la page d'administration servira-t-elle, ou sera-t-elle
   seulement ouverte ?

   CE QUE CE SCÉNARIO PROTÈGE, par ordre de gravité :
     1. Un compteur ne peut JAMAIS faire échouer le geste qu'il compte. Une
        publication de planning passe même si l'onglet des compteurs est
        cassé — c'est la seule propriété non négociable du lot.
     2. Les lectures ne sont pas comptées. Compter chaque ouverture d'écran
        imposerait une écriture au classeur à chaque affichage.
     3. Aucune donnée nominative n'entre dans l'onglet : le rôle, jamais la
        personne. Le code d'administration est partagé et ne porte aucun nom.
     4. Les connexions d'administration ne se fondent pas dans les « actifs » :
        elles feraient dépasser la courbe de son propre plafond de 25.
     5. Rien n'est compté avant le 4 septembre 2026, comme le reste des stats. */
const path = require('path'), fs = require('fs'), vm = require('vm');
const { Classeur, extraireFonction } = require(path.join(__dirname, 'stubs'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

const IND  = path.join(__dirname, '..', 'gas', 'Indispos.gs');
const POR  = path.join(__dirname, '..', 'gas', 'portail.gs');
const SRC  = fs.readFileSync(IND, 'utf8');
const PAGE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'stats-usage.html'), 'utf8');

/* Constante LUE dans le code réel, jamais redéclarée à la main. */
const ORIGINE = (SRC.match(/STATS_ORIGINE\s*=\s*'([\d-]+)'/) || [])[1];

/* ── Bac à sable côté écriture ────────────────────────────────────────── */
function bac(maintenant) {
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [
    ['ID','NOM','INITIALES','ACTIF','SECTEUR','EMAIL','CODE','X','DECT'],
    ['DUPONT','DUPONT','DU','O','VIS','a@b.c','AAAA1111','','1001'],
  ]);
  cl.ajouter('CONNEXIONS', [['HORODATAGE','NOM','INITIALES','ROLE']]);
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    Logger: { log: () => {} },
    Date: class extends Date { constructor(...a) { if (!a.length) super(maintenant.getTime()); else super(...a); } },
    console,
  };
  vm.createContext(ctx);
  ['_statsJour_','_statsLundi_','_statsFeuille_','_statsHeureIncr_',
   '_statsDerniereConnexion_','_statsActionIncr_','statsRecalculer','logConnexion']
    .forEach(n => vm.runInContext(extraireFonction(IND, n), ctx));
  vm.runInContext(`const CONNEXIONS_PLAFOND=10000; const STATS_ORIGINE='${ORIGINE}';`, ctx);
  return { cl, ctx };
}
const D = s => new Date(s);
const lignes = (cl, n) => (cl.getSheetByName(n) ? cl.getSheetByName(n).lignes : []);
/* Sheets CONVERTIT « 2026-09-10 » en Date à l'écriture. Le banc doit lire ce que
   le vrai classeur rendrait, pas ce qu'il aimerait y trouver — c'est le défaut
   qui avait fait rétrécir les semaines figées le 29/08. */
const jour = v => (v instanceof Date)
  ? v.getUTCFullYear()+'-'+String(v.getUTCMonth()+1).padStart(2,'0')+'-'+String(v.getUTCDate()).padStart(2,'0')
  : String(v).trim();
const trouver = (cl, role, action) =>
  lignes(cl, 'STATS_ACTIONS').slice(1).find(l =>
    String(l[0]).trim() === role && String(l[1]).trim() === action);

console.log('\n═══ 1. Le compteur existe et est branché au code réel ═══');
V('la fonction _statsActionIncr_ est définie', /function _statsActionIncr_/.test(SRC));
V('logConnexion compte les ouvertures par rôle',
  /_statsActionIncr_\(ss, user\.role, '\(ouverture\)'/.test(SRC));
V('le routeur compte les écritures, accroché à WRITE_ACTIONS_LOCK',
  /WRITE_ACTIONS_LOCK\.has\(action\)\)\s*\{[\s\S]{0,900}?_statsActionIncr_\(/.test(SRC));
/* Contre-épreuve : l'appel doit être ENVELOPPÉ. Sans filet, un onglet
   inaccessible ferait échouer la publication du planning elle-même. */
V('l\'appel du routeur est protégé par un filet',
  /try \{ _statsActionIncr_\(SpreadsheetApp\.getActiveSpreadsheet\(\), user\.role, action\); \} catch/.test(SRC));
V('l\'appel de logConnexion est protégé par un filet',
  /try \{ _statsActionIncr_\(ss, user\.role, '\(ouverture\)', maintenant\); \} catch/.test(SRC));

console.log('\n═══ 2. Une ouverture est comptée, par rôle ═══');
{
  const { cl, ctx } = bac(D('2026-09-10T09:30:00'));
  ctx.logConnexion({ id:'DUPONT', name:'DUPONT', initials:'DU', role:'mar' });
  ctx.logConnexion({ id:'ADMIN', role:'admin' });
  ctx.logConnexion({ id:'ADMIN', role:'admin' });
  const mar = trouver(cl, 'mar', '(ouverture)');
  const adm = trouver(cl, 'admin', '(ouverture)');
  V('l\'onglet STATS_ACTIONS est créé', !!cl.getSheetByName('STATS_ACTIONS'));
  V('l\'ouverture d\'un médecin est comptée', mar && Number(mar[2]) === 1, mar);
  V('deux ouvertures en administration font 2', adm && Number(adm[2]) === 2, adm);
  V('la date de dernière fois est renseignée', adm && jour(adm[3]) === '2026-09-10', adm && adm[3]);
  V('les rôles ne se mélangent pas', lignes(cl, 'STATS_ACTIONS').length === 3,
    lignes(cl, 'STATS_ACTIONS'));
}

console.log('\n═══ 3. Aucun nom n\'entre dans les compteurs ═══');
{
  const { cl, ctx } = bac(D('2026-09-10T09:30:00'));
  ctx.logConnexion({ id:'DUPONT', name:'DUPONT', initials:'DU', role:'mar' });
  const plat = JSON.stringify(lignes(cl, 'STATS_ACTIONS'));
  V('ni le nom, ni les initiales, ni l\'identifiant n\'y figurent',
    plat.indexOf('DUPONT') === -1 && plat.indexOf('"DU"') === -1, plat);
  V('l\'en-tête ne prévoit aucune colonne nominative',
    JSON.stringify(lignes(cl, 'STATS_ACTIONS')[0]) === '["ROLE","ACTION","NOMBRE","DERNIERE"]',
    lignes(cl, 'STATS_ACTIONS')[0]);
}

console.log('\n═══ 4. Rien n\'est compté avant l\'ouverture au service ═══');
{
  const { cl, ctx } = bac(D('2026-08-20T09:00:00'));
  ctx.logConnexion({ id:'ADMIN', role:'admin' });
  V('une connexion du 20 août ne crée aucun compteur',
    lignes(cl, 'STATS_ACTIONS').length <= 1, lignes(cl, 'STATS_ACTIONS'));
  const { cl: cl2, ctx: ctx2 } = bac(D('2026-09-04T09:00:00'));
  ctx2.logConnexion({ id:'ADMIN', role:'admin' });
  V('le 4 septembre lui-même est compté',
    !!trouver(cl2, 'admin', '(ouverture)'), lignes(cl2, 'STATS_ACTIONS'));
}

console.log('\n═══ 5. Un compteur cassé ne casse jamais le geste ═══');
{
  const { ctx } = bac(D('2026-09-10T09:00:00'));
  /* On rend l'écriture impossible, comme le ferait un onglet protégé. */
  vm.runInContext('_statsFeuille_ = function(){ throw new Error("onglet inaccessible"); };', ctx);
  let passe = true;
  try { ctx.logConnexion({ id:'DUPONT', name:'DUPONT', initials:'DU', role:'mar' }); }
  catch (e) { passe = false; }
  V('la connexion aboutit malgré le compteur en panne', passe);
  let leve = false;
  try { ctx._statsActionIncr_(null, 'admin', 'publishPlanning'); } catch (e) { leve = true; }
  V('le compteur appelé sans classeur lève, et c\'est au filet de l\'absorber', leve);
}

console.log('\n═══ 6. Le serveur rend les compteurs, séparés par rôle ═══');
{
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [
    ['ID','NOM','INITIALES','ACTIF','SECTEUR','EMAIL','CODE','X','DECT','DERNIERE_CONNEXION'],
    ['DUPONT','DUPONT','DU','O','VIS','a@b.c','AAAA1111','','1001','2026-09-20'],
  ]);
  cl.ajouter('STATS_SEMAINE', [['SEMAINE','CONNEXIONS','ACTIFS','FIGEE'],
    ['2026-09-07', 30, 1, 'O']]);
  cl.ajouter('STATS_ACTIONS', [['ROLE','ACTION','NOMBRE','DERNIERE'],
    ['mar','(ouverture)', 412, '2026-09-20'],
    ['admin','(ouverture)', 86, '2026-09-20'],
    ['secretariat','(ouverture)', 31, '2026-09-19'],
    ['admin','publishPlanning', 12, '2026-09-20'],
    ['admin','resetCodeMar', 2, '2026-09-02'],
    ['mar','saveIndispos', 40, '2026-09-18']]);
  const ctx = { SpreadsheetApp: { getActiveSpreadsheet: () => cl }, Logger: { log(){} }, console };
  vm.createContext(ctx);
  const PSRC = fs.readFileSync(POR, 'utf8');
  vm.runInContext("const STATS_ORIGINE='2026-09-04';", ctx);
  vm.runInContext((PSRC.match(/const STATS_ALLOWED = \[[^\]]*\];/) || ['const STATS_ALLOWED=[];'])[0], ctx);
  vm.runInContext(extraireFonction(POR, 'getStatsUsage'), ctx);
  const r = ctx.getStatsUsage({ role:'admin', id:'ADMIN' });

  V('la réponse porte les ouvertures des médecins', r.roles.mar.ouvertures === 412, r.roles);
  V('celles de l\'administration sont à part', r.roles.admin.ouvertures === 86, r.roles);
  V('celles du secrétariat aussi', r.roles.secretariat.ouvertures === 31, r.roles);
  V('les modifications de l\'administration sont totalisées', r.roles.admin.actions === 14, r.roles);
  V('l\'ouverture n\'est pas comptée comme une modification',
    r.roles.mar.actions === 40, r.roles.mar);
  V('le détail est trié du plus fréquent au moins fréquent',
    r.actions.admin[0].a === 'publishPlanning' && r.actions.admin[1].a === 'resetCodeMar',
    r.actions.admin);
  V('chaque geste porte sa date de dernière fois',
    r.actions.admin[0].d === '2026-09-20', r.actions.admin[0]);
  /* Contre-épreuve : la même date écrite comme OBJET Date, ce que Sheets produit
     réellement. Sans normalisation, la page recevrait un horodatage complet et
     « il y a N jours » deviendrait illisible. */
  cl.getSheetByName('STATS_ACTIONS').lignes[4][3] = new Date('2026-09-20T00:00:00');
  const r3 = ctx.getStatsUsage({ role:'admin', id:'ADMIN' });
  V('une date relue comme objet est ramenée au format jour',
    r3.actions.admin[0].d === '2026-09-20', r3.actions.admin[0]);
  V('le détail des médecins ne se déverse pas dans celui de l\'administration',
    r.actions.admin.length === 2, r.actions.admin);
  /* Le point qui compte vraiment : la courbe reste bornée à l'effectif. */
  V('les ouvertures d\'administration n\'entrent pas dans les actifs de la semaine',
    r.semaines[0].a === 1, r.semaines[0]);
  V('l\'effectif reste celui des médecins actifs', r.effectif === 1, r.effectif);

  const vide = new Classeur();
  vide.ajouter('MEDECINS', [['ID','NOM','INITIALES','ACTIF'],['DUPONT','DUPONT','DU','O']]);
  const ctx2 = { SpreadsheetApp: { getActiveSpreadsheet: () => vide }, Logger: { log(){} }, console };
  vm.createContext(ctx2);
  vm.runInContext("const STATS_ORIGINE='2026-09-04';", ctx2);
  vm.runInContext((PSRC.match(/const STATS_ALLOWED = \[[^\]]*\];/) || ['const STATS_ALLOWED=[];'])[0], ctx2);
  vm.runInContext(extraireFonction(POR, 'getStatsUsage'), ctx2);
  const r2 = ctx2.getStatsUsage({ role:'admin', id:'ADMIN' });
  V('sans onglet de compteurs, la réponse reste valide',
    r2.success === true && JSON.stringify(r2.roles) === '{}', r2.roles);
}

console.log('\n═══ 7. La page sait afficher les deux cartes ═══');
{
  V('la carte « qui se connecte » a son emplacement', PAGE.indexOf('id="roles"') >= 0);
  V('la carte de l\'administration a le sien', PAGE.indexOf('id="adm"') >= 0);
  V('chaque emplacement est unique',
    PAGE.split('id="roles"').length === 2 && PAGE.split('id="adm"').length === 2);
  V('les deux vues sont appelées au dessin',
    /roles\(\);\s*\n\s*administration\(\);/.test(PAGE));
  V('la carte des rôles n\'est plus masquée en dur',
    PAGE.indexOf("closest('.card').style.display='none'") === -1);
  V('la page dit que le code d\'administration est partagé',
    /partagé/.test(PAGE) && /jamais une personne/.test(PAGE));
  V('la page rappelle que seules les connexions des médecins font les courbes',
    /Seules les connexions des médecins/.test(PAGE));
  V('les gestes ont un libellé en français, pas leur nom technique',
    /publishPlanning:'Planning publié'/.test(PAGE));
  V('un geste inconnu retombe sur son nom plutôt que de disparaître',
    /return A_LIB\[a\] \|\| a;/.test(PAGE));
}

console.log('\n────────────────────────────────────');
console.log(ko === 0 ? `✅ ${ok} vérifications, 0 échec` : `❌ ${ko} échec(s) sur ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
