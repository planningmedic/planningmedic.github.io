/* ═══ BANC — SOLVEUR EXACT DES GARDES (18/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Le solveur exact (dépôt GitHub privé planningmedic-solveur) cherche LE meilleur
   planning de gardes et le prouve, critère après critère. Il tourne 15 à 60 min,
   hors de Google. Le portail lui envoie les entrées du générateur, puis réimpose
   son planning au générateur, qui fait le reste comme d'habitude (18 h, R, stats).

   CE QUE CE SCÉNARIO VÉRIFIE (VRAI generateur_gardes.gs et VRAI solveur.gs).
   1. l'export : generateGardes(…, { exportSolveur }) rend les entrées complètes
      (jours, équipe, parts, cumul des années — week-ends compris —, gardes fixées)
      sans rien écrire ;
   2. le planning imposé : avec { planSolveur } = le planning d'une génération
      normale, le générateur réécrit EXACTEMENT les mêmes gardes ;
      contre-épreuve : un planning où deux MAR échangent une nuit est écrit tel quel ;
   3. sans ces options, la génération ne change pas ;
   4. les actions du serveur (GitHub simulé) : année refusée (2027, année déjà
      générée), jeton absent, envoi compressé puis lancement, état (aucun, en
      cours, prêt, impossible avec les nuits nommées, échec), essai à blanc sans
      écriture, application réelle, droit Maintenance seul ;
   5. la page Maintenance, la carte du livreur, le routeur, le diagnostic.

   Effectif et absences fictifs (simulateur/) : aucun nom réel. */
const path = require('path'), fs = require('fs'), vm = require('vm'), zlib = require('zlib');
const RACINE = path.join(__dirname, '..');
const h = require(path.join(RACINE, 'simulateur', 'harness.js'));
const DEMO = require(path.join(RACINE, 'simulateur', 'demographie.js'));
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const SRC = fs.readFileSync(path.join(RACINE, 'gas', 'generateur_gardes.gs'), 'utf8');
const SOLV = fs.readFileSync(path.join(RACINE, 'gas', 'solveur.gs'), 'utf8');
const Y = 2028;

const roster = DEMO.buildRoster(Y, { ageExempt: 60, ageRetraite: 67 });
const im = DEMO.buildAbsences(Y, roster, 3, { souhaitsEtendus: true });
function generer(opts) {
  const ss = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + Y, h.indisposRows(Y, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(Y)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = h.buildContext(ss, [], SRC);
  ctx.__BANC_OPTIM_ITERS__ = 20000; ctx.__BANC_APP_MS__ = 1e9; ctx.__BANC_REP_MS__ = 3000;
  try { return { r: ctx.generateGardes(Y, opts), ss }; } catch (e) { return { err: e.message, ss }; }
}
// Lit GARDES_{Y} : { date: {g, g2} } d'après les codes G / G2, colonnes = jours exportés.
function lirePlan(ss, jours) {
  const sh = ss.getSheetByName('GARDES_' + Y); if (!sh) return null;
  const v = sh.getDataRange().getValues(), P = {};
  jours.forEach((d, j) => { const x = { g: null, g2: null };
    for (let i = 3; i < v.length; i++) { const c = v[i][j + 1]; if (c === 'G') x.g = v[i][0]; else if (c === 'G2') x.g2 = v[i][0]; }
    if (x.g || x.g2) P[d.date] = x; });
  return P;
}

console.log('\n═══ 0. Le code ═══');
V('export et planning imposé n\'agissent que sur demande (options du générateur)',
  /if\(opts && opts\.exportSolveur\)\{/.test(SRC) && (SRC.match(/if\(opts && opts\.planSolveur\)\{ const _P=opts\.planSolveur;/g) || []).length === 2);
V('le planning imposé est posé avant l\'arrêt « jour sans binôme » et avant les récupérations',
  SRC.indexOf('opts.planSolveur') < SRC.indexOf('/* ── 8b-bis. (LOT C') && SRC.lastIndexOf('opts.planSolveur') < SRC.indexOf('// ── 9. Placer les R') && SRC.lastIndexOf('opts.planSolveur') > SRC.indexOf('/* ── 8b-bis. (LOT C'));
V('la dette des week-ends est lue dans les années archivées', /we:_h\.indexOf\('PART EXACTE WE'\)/.test(SRC) && /we:_h\.indexOf\('WE'\)/.test(SRC) && /CUMUL\[id\]\.we=_hA\(id,'we'\)/.test(SRC));

console.log('\n═══ 1. Export des entrées ═══');
const ex = generer({ dryRun: true, tirage: 1, exportSolveur: true });
const D = ex.r && ex.r.solveur;
V('l\'export rend les entrées du solveur', !!D, ex.err);
if (D) {
  V('tous les champs attendus par le solveur sont là', ['days', 'ids', 'allDoctors', 'pct', 'quot', 'noWeekend', 'plafond', 'only18', 'tpJours', 'indiv', 'struct', 'off',
    'indispos', 'souhaits', 'rea1Nuit', 'rea1Sem', 'visee', 'cibleExacte', 'cible', 'monthExp', 'fixes', 'paires', 'couples', 'prio', 'cumul', 'rot', 'vacSco', 'year'].every(k => k in D),
    Object.keys(D));
  V('un jour par date de l\'année, une ligne par MAR et par jour', D.days.length >= 365 && D.ids.every(id => D.indiv[id].length === D.days.length), D.days.length);
  V('2028 : la rotation d\'équité est allumée', D.rot === true);
  V('le cumul des années porte aussi les week-ends', D.ids.every(id => !D.cumul[id] || 'we' in D.cumul[id]), D.cumul[D.ids[0]]);
  V('les entrées tiennent en un petit envoi une fois compressées (< 200 Ko)', zlib.gzipSync(JSON.stringify(D)).length < 200000, zlib.gzipSync(JSON.stringify(D)).length);
  V('rien n\'est écrit dans le classeur', !ex.ss.getSheetByName('GARDES_' + Y) && !ex.ss.getSheetByName('STATS_GARDES_' + Y));
}

console.log('\n═══ 2. Planning imposé ═══');
const ref = generer({ tirage: 1 });
const P0 = D && !ref.err && lirePlan(ref.ss, D.days);
V('génération normale de référence', !!P0 && Object.keys(P0).length > 300, ref.err);
if (P0) {
  const imp = generer({ tirage: 1, planSolveur: P0 });
  const P1 = !imp.err && lirePlan(imp.ss, D.days);
  const diff = P1 ? Object.keys(P0).filter(d => !P1[d] || P1[d].g !== P0[d].g || P1[d].g2 !== P0[d].g2) : ['erreur'];
  V('le générateur réécrit exactement le planning imposé', P1 && diff.length === 0 && Object.keys(P1).length === Object.keys(P0).length, { err: imp.err, diff: diff.slice(0, 5) });
  V('statistiques écrites comme d\'habitude', !!imp.ss.getSheetByName('STATS_GARDES_' + Y));
  // contre-épreuve : un mardi ordinaire, les deux MAR de garde échangent leur nuit avec ceux du mercredi
  const jours = Object.keys(P0).sort().filter(d => new Date(d + 'T12:00:00Z').getUTCDay() === 2 && d > Y + '-03-01');
  let fait = null;
  for (const d of jours) { const e = new Date(new Date(d + 'T12:00:00Z').getTime() + 864e5).toISOString().slice(0, 10);
    if (P0[e] && [P0[d].g, P0[d].g2].every(x => x !== P0[e].g && x !== P0[e].g2)) { fait = [d, e]; break; } }
  if (fait) {
    const P2 = JSON.parse(JSON.stringify(P0)); const t = P2[fait[0]]; P2[fait[0]] = P2[fait[1]]; P2[fait[1]] = t;
    const mod = generer({ tirage: 1, planSolveur: P2 });
    const P3 = !mod.err && lirePlan(mod.ss, D.days);
    V('contre-épreuve : deux nuits échangées dans le planning imposé sont écrites échangées',
      P3 && P3[fait[0]].g === P0[fait[1]].g && P3[fait[1]].g === P0[fait[0]].g, { err: mod.err, j: fait });
  } else V('contre-épreuve : deux nuits échangeables trouvées', false);
}

console.log('\n═══ 3. Sans les options, rien ne change ═══');
const ref2 = generer({ tirage: 1 });
const Pb = D && !ref2.err && lirePlan(ref2.ss, D.days);
V('deux générations normales identiques (l\'export n\'a pas d\'effet de bord)', Pb && P0 && JSON.stringify(Pb) === JSON.stringify(P0));

console.log('\n═══ 4. Les actions du serveur (GitHub simulé) ═══');
function serveur(o) {
  o = o || {};
  const appels = [], props = {}, gens = [], logs = [], notifs = [], envois = [];
  const fichiers = Object.assign({}, o.fichiers || {});
  const ctx = vm.createContext({ JSON, String, Object, Array, Number, Math, Date, console,
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType: () => t }) },
    _deny: () => JSON.stringify({ success: false, error: 'Accès refusé' }),
    _droitMaintenance_: u => !!(u && u.maint),
    _configRows_: () => [['CLE', 'VALEUR']].concat(o.sansJeton ? [] : [['SOLVEUR_TOKEN', 'jeton-fictif']]),
    logAction: t => logs.push(t),
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => (o.existe || []).indexOf(n) >= 0 ? {} : null }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: {
      gzip: b => ({ getBytes: () => zlib.gzipSync(Buffer.from(b._s)) }),
      ungzip: b => ({ getDataAsString: () => zlib.gunzipSync(Buffer.from(b._o)).toString() }),
      newBlob: (x, type) => (typeof x === 'string' ? { _s: x } : { _o: x }),
      base64Encode: x => Buffer.from(x).toString('base64'), base64Decode: s => Buffer.from(s, 'base64'),
      formatDate: () => '20281101-120000',
    },
    UrlFetchApp: { fetch: (url, opt) => {
      const m = (opt && opt.method) || 'get', ch = url.replace('https://api.github.com/repos/planningmedic/planningmedic-solveur', '');
      appels.push({ m, ch, corps: opt && opt.payload ? JSON.parse(opt.payload) : null, auth: opt && opt.headers && opt.headers.Authorization });
      let code = 404, j = { message: 'Not Found' };
      if (m === 'put' && /^\/contents\/entrees\//.test(ch)) { code = 201; j = {}; }
      else if (m === 'post' && /dispatches$/.test(ch)) { code = o.refusLancement ? 422 : 204; j = null; }
      else if (m === 'get' && /^\/contents\//.test(ch)) { const f = fichiers[ch.replace('/contents/', '')]; if (f) { code = 200; j = { content: zlib.gzipSync(Buffer.from(JSON.stringify(f))).toString('base64') }; } }
      else if (m === 'get' && /^\/actions\/runs/.test(ch)) { code = 200; j = { workflow_runs: o.runs || [] }; }
      return { getResponseCode: () => code, getContentText: () => (j === null ? '' : JSON.stringify(j)) }; } },
    generateGardes: (an, op) => { gens.push(Object.assign({ an }, op)); if (op.exportSolveur) return { dryRun: true, solveur: { year: an, ids: ['M1'] } };
      if (op.dryRun) return { dryRun: true, sansBinome: 0, jours: [], qualite: { ok: 1 }, compteurs: { M1: { total: 30, we: 9 } }, cibles: { M1: { total: 30 } }, partExacte: { M1: { total: 29.6 } }, jf: { M1: 3 }, h18: { M1: 12 }, noel: { M1: 1 }, souhaits: { M1: { poses: 4, honores: 3 } } }; return { warnings: ['w'], nbWarnings: 1 }; },
    generatePlanning: an => { gens.push({ an, planning: true }); },
    /* (27/11/2026) publication et récapitulatifs depuis la page Maintenance */
    notifPlanifier: an => { if (o.notifPlante) throw new Error('minuteur refusé'); notifs.push(an); },
    _act_envoyerRecapIndispos: R => { envois.push(R); if (o.recapPlante) throw new Error('quota'); return { getContent: () => JSON.stringify(o.recap || { success: true, sent: 21, skipped: 1, errors: [], pjEchecs: ['x'] }) }; },
  });
  vm.runInContext(SOLV, ctx);
  const appel = (nom, payload, user) => JSON.parse(ctx['_act_' + nom]({ payload: payload || {}, code: 'CODE-PERSO', user: user === undefined ? { maint: true } : user }));
  return { appel, appels, props, gens, logs, fichiers, notifs, envois };
}
{
  const s = serveur();
  V('droit Maintenance seul, pour les trois actions', ['solveurLancer', 'solveurEtat', 'solveurAppliquer'].every(a => s.appel(a, { year: 2028 }, { maint: false }).success === false) && s.gens.length === 0);
  V('2027 refusée (déjà générée, sanctuarisée)', /à partir des gardes 2028/.test(s.appel('solveurLancer', { year: 2027 }).error));
  const s2 = serveur({ existe: ['GARDES_2028'] });
  V('une année déjà générée est refusée, au lancement comme à l\'application',
    /ne régénère jamais/.test(s2.appel('solveurLancer', { year: 2028 }).error) && /ne régénère jamais/.test(s2.appel('solveurAppliquer', { year: 2028 }).error) && s2.gens.length === 0);
  V('sans jeton dans CONFIG, rien ne part', /SOLVEUR_TOKEN/.test(serveur({ sansJeton: true }).appel('solveurLancer', { year: 2028 }).error));
  V('état « aucun » avant tout lancement', s.appel('solveurEtat', { year: 2028 }).etat === 'aucun');
  const r = s.appel('solveurLancer', { year: 2028 });
  const put = s.appels.find(a => a.m === 'put'), go = s.appels.find(a => a.m === 'post');
  V('lancement : export du générateur à blanc, avec le tirage fixe', r.success && s.gens[0].exportSolveur && s.gens[0].dryRun && s.gens[0].tirage === 1, r);
  V('les entrées partent compressées dans le dépôt privé, avec le jeton du solveur',
    put && put.ch === '/contents/entrees/2028-20281101-120000.json.gz' && JSON.parse(zlib.gunzipSync(Buffer.from(put.corps.content, 'base64')).toString()).year === 2028 && put.auth === 'Bearer jeton-fictif', put);
  V('puis le calcul est lancé sur ce fichier', go && /\/actions\/workflows\/solveur\.yml\/dispatches$/.test(go.ch) && go.corps.inputs.fichier === '2028-20281101-120000.json.gz' && go.corps.ref === 'main', go);
  V('le suivi est gardé (nom du fichier)', JSON.parse(s.props.SOLVEUR_2028).base === '2028-20281101-120000');
  V('état « en cours » tant qu\'aucun résultat n\'est là', s.appel('solveurEtat', { year: 2028 }).etat === 'en_cours');
  V('rien à appliquer tant que le résultat manque', s.appel('solveurAppliquer', { year: 2028, essai: true }).success === false && s.gens.length === 1);
  s.fichiers['sorties/2028-20281101-120000.json.gz'] = { rapport: [{ palier: '1. exceptions', valeur: 0, prouve: true }, { palier: '3d. dette', valeur: 5, prouve: false }],
    plan: { gardes: { '2028-01-01': { g: 'M1', g2: 'M2' } } } };
  const e = s.appel('solveurEtat', { year: 2028 });
  V('état « prêt » avec le bilan des critères prouvés', e.etat === 'pret' && e.prouvees === 1 && e.etapes.length === 2, e);
  const es = s.appel('solveurAppliquer', { year: 2028, essai: true });
  const gEs = s.gens[s.gens.length - 1];
  V('essai à blanc : le générateur à blanc reçoit le planning du solveur, rien d\'écrit',
    es.success && es.essai && gEs.dryRun === true && gEs.planSolveur['2028-01-01'].g === 'M1' && !s.gens.some(g => g.planning), { es, gEs });
  const ap = s.appel('solveurAppliquer', { year: 2028 });
  const gAp = s.gens.filter(g => !g.planning).pop();
  V('application : génération réelle avec le planning imposé, puis le planning du jour',
    ap.success && !ap.essai && !gAp.dryRun && gAp.planSolveur && gAp.tirage === 1 && s.gens[s.gens.length - 1].planning && ap.nbWarnings === 1, { ap, gAp });
  /* ── (27/11/2026) Tout se termine sur la page Maintenance ── */
  V('essai à blanc : le compte rendu par MAR est rendu (compteurs, cibles, part exacte, fériés, 18 h, souhaits)',
    es.compteurs.M1.total === 30 && es.cibles.M1.total === 30 && es.partExacte.M1.total === 29.6 && es.jf.M1 === 3 && es.h18.M1 === 12 && es.souhaits.M1.honores === 3 && Array.isArray(es.jours), es);
  V('l\'essai à blanc n\'arme aucune notification : une seule, celle de l\'application', s.notifs.length === 1, s.notifs);
  V('application : les notifications sont armées comme à la publication du comité, et la date est notée', s.notifs[0] === 2028 && /^\d{4}-\d\d-\d\dT/.test(JSON.parse(s.props.SOLVEUR_2028).applique));
  {
    const sA = serveur({ notifPlante: true });
    sA.appel('solveurLancer', { year: 2028 });
    sA.fichiers['sorties/2028-20281101-120000.json.gz'] = { rapport: [], plan: { gardes: { '2028-01-01': { g: 'M1', g2: 'M2' } } } };
    V('récapitulatifs refusés tant que les gardes ne sont pas créées', (() => { const x = sA.appel('solveurRecaps', { year: 2028 }); return !x.success && /appliquez d'abord/.test(x.error) && sA.envois.length === 0; })());
    const apA = sA.appel('solveurAppliquer', { year: 2028 });
    V('un minuteur de notification refusé ne fait pas échouer l\'application', apA.success === true && !!JSON.parse(sA.props.SOLVEUR_2028).applique, apA);
  }
  const eA = s.appel('solveurEtat', { year: 2028 });
  V('état « appliqué » : dit sans relire le dépôt privé, récapitulatifs encore à envoyer', (() => { const n = s.appels.length; const x = s.appel('solveurEtat', { year: 2028 }); return eA.etat === 'applique' && eA.recaps === null && !!eA.applique && x.etat === 'applique' && s.appels.length === n; })(), eA);
  V('récapitulatifs : droit Maintenance seul', s.appel('solveurRecaps', { year: 2028 }, { maint: false }).success === false && s.envois.length === 0);
  const rc = s.appel('solveurRecaps', { year: 2028 });
  V('récapitulatifs : c\'est l\'envoi du comité, avec le code personnel de l\'appelant pour sa porte « responsable »',
    rc.success && rc.envoyes === 21 && rc.sansMail === 1 && rc.echecs === 0 && rc.pjEchecs === 1 && s.envois.length === 1 && s.envois[0].payload.year === 2028 && s.envois[0].payload.codeResponsable === 'CODE-PERSO' && s.envois[0].user.role === 'admin', { rc, e: s.envois[0] });
  V('l\'envoi est noté, et l\'état le dit', (() => { const x = s.appel('solveurEtat', { year: 2028 }); return x.etat === 'applique' && x.recaps && x.recaps.envoyes === 21 && /^\d{4}-/.test(x.recaps.le); })());
  const rc2 = s.appel('solveurRecaps', { year: 2028 });
  V('second envoi refusé par défaut (pas de doublon par mégarde)', !rc2.success && rc2.deja === true && /déjà envoyés \(21 mails\)/.test(rc2.error) && s.envois.length === 1, rc2);
  V('second envoi possible sur demande explicite', s.appel('solveurRecaps', { year: 2028, encore: true }).success === true && s.envois.length === 2);
  {
    const sB = serveur({ recap: { success: true, sent: 0, skipped: 0, errors: ['a', 'b'] } });
    sB.props.SOLVEUR_2028 = JSON.stringify({ base: '2028-b', lance: new Date().toISOString(), applique: new Date().toISOString() });
    const x = sB.appel('solveurRecaps', { year: 2028 });
    V('aucun mail parti : rien n\'est noté, l\'envoi reste à faire', x.success && x.envoyes === 0 && x.echecs === 2 && !JSON.parse(sB.props.SOLVEUR_2028).recaps, x);
    const sC = serveur({ recap: { success: false, error: 'Quota e-mail insuffisant' } });
    sC.props.SOLVEUR_2028 = sB.props.SOLVEUR_2028;
    V('refus de l\'envoi (quota) : message rendu tel quel, rien de noté', (() => { const y = sC.appel('solveurRecaps', { year: 2028 }); return !y.success && /Quota/.test(y.error) && !JSON.parse(sC.props.SOLVEUR_2028).recaps; })());
    const sD = serveur({ recapPlante: true }); sD.props.SOLVEUR_2028 = sB.props.SOLVEUR_2028;
    V('envoi qui plante : message, pas d\'exception', /Envoi impossible : quota/.test(sD.appel('solveurRecaps', { year: 2028 }).error));
  }
  // nuits impossibles
  const s3 = serveur({ fichiers: { 'sorties/2028-x.json.gz': { rapport: [], echec: 'couverture', nuits: ['2028-12-25'] } } });
  s3.props.SOLVEUR_2028 = JSON.stringify({ base: '2028-x', lance: new Date().toISOString() });
  const e3 = s3.appel('solveurEtat', { year: 2028 });
  V('nuits impossibles : nommées, et rien à appliquer', e3.etat === 'impossible' && e3.nuits[0] === '2028-12-25' && s3.appel('solveurAppliquer', { year: 2028 }).success === false, e3);
  // calcul interrompu
  const s4 = serveur({ fichiers: { 'sorties/2028-y.json.gz': { rapport: [], echec: 'calcul interrompu (code 137)', plan: { gardes: {} } } } });
  s4.props.SOLVEUR_2028 = JSON.stringify({ base: '2028-y', lance: new Date().toISOString() });
  V('calcul interrompu : signalé en échec, jamais appliqué', s4.appel('solveurEtat', { year: 2028 }).etat === 'echec' && s4.appel('solveurAppliquer', { year: 2028 }).success === false);
  const s5 = serveur({ runs: [{ created_at: new Date().toISOString(), status: 'completed', conclusion: 'failure' }] });
  s5.props.SOLVEUR_2028 = JSON.stringify({ base: '2028-z', lance: new Date().toISOString() });
  V('calcul arrêté chez GitHub sans résultat : échec', s5.appel('solveurEtat', { year: 2028 }).etat === 'echec');
  V('lancement refusé par GitHub : message, aucun suivi enregistré', (() => { const s6 = serveur({ refusLancement: true }); const x = s6.appel('solveurLancer', { year: 2028 }); return !x.success && /Lancement refusé/.test(x.error) && !s6.props.SOLVEUR_2028; })());
}

console.log('\n═══ 5. Page, livreur, routeur, diagnostic ═══');
const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const MH = lire('maintenance.html');
V('carte « calcul exact » sur la page Maintenance, avec ses quatre gestes',
  /id="cSolveur"/.test(MH) && ['btnSolvLancer', 'btnSolvEtat', 'btnSolvEssai', 'btnSolvAppl'].every(i => MH.includes('id="' + i + '"')));
V('lancer et appliquer en deux appuis ; essai et application désactivés tant que rien n\'est prêt',
  /deuxAppuis\(\$\('btnSolvLancer'\)/.test(MH) && /deuxAppuis\(\$\('btnSolvAppl'\)/.test(MH) && /id="btnSolvEssai" type="button" disabled/.test(MH) && /id="btnSolvAppl" type="button" disabled/.test(MH));
V('la page appelle les quatre actions du solveur', ['solveurLancer', 'solveurEtat', 'solveurAppliquer', 'solveurRecaps'].every(a => MH.includes("action:'" + a + "'")));
V('récapitulatifs : bouton caché tant que les gardes ne sont pas créées, envoi en deux appuis, et la page ne renvoie plus vers l\'admin',
  /id="solvFin"[^>]* hidden>/.test(MH) && /deuxAppuis\(\$\('btnSolvRecaps'\)/.test(MH) && !/Terminez dans l'admin/.test(MH) && !/Terminez dans l\\'admin/.test(MH));
const carte = JSON.parse(lire('livreur/carte.json'));
V('le livreur met solveur.gs en service', carte.fichiers.some(f => f.depot === 'gas/solveur.gs' && f.nom === 'solveur' && f.type === 'SERVER_JS'));
const RT = lire('gas/Indispos.gs');
V('routeur : les quatre actions, rôle maintenance', ['solveurLancer', 'solveurEtat', 'solveurAppliquer', 'solveurRecaps'].every(a => new RegExp('"' + a + '"\\s*: \\{ role: \'maintenance\'\\s*, fn: _act_' + a + ' \\}').test(RT)));
V('le diagnostic contrôle la version déployée de solveur.gs', /deployed\['solveur\.gs'\] = GAS_VERSION_SOLVEUR/.test(lire('gas/diagnostic.gs')));
V('aucune donnée nominative vers le dépôt public : seul le dépôt privé est appelé', /const SOLVEUR_DEPOT = 'planningmedic\/planningmedic-solveur';/.test(SOLV) && !/GITHUB_REPO|getGithubToken/.test(SOLV));

console.log(`\nbanc_solveur : ${ok} ✓, ${ko} ✗`);
process.exit(ko ? 1 : 0);
