/* ═══ BANC — ONGLET CONTRÔLES DU COMITÉ ET HORS EFFECTIF (17/11/2026) ═══
   Décision du responsable : l'admin est un tableau de bord de tout ce qui cloche
   dans le planning (onglet Contrôles) — six familles : Réa 1, temps partiel,
   congés, 18 h, récupérations, gardes — et le comité coche « Prévenu ». Le chef
   de service n'est jamais compté parmi les postables (colonne HORS_EFFECTIF).
   Jour tendu = moins que le seuil d'alerte de l'onglet SEUILS (13 par défaut),
   le même partout : pose des TP, contrôles, placement des récupérations.

   Ce qui ne doit JAMAIS arriver :
     · un MAR marqué HORS_EFFECTIF compté dans l'effectif présent ;
     · un TP signalé « jour tendu » alors qu'il reste 13 postables, ou oublié à 12 ;
     · un seuil changé dans l'onglet SEUILS et ignoré par les contrôles ;
     · une récupération signalée parce qu'elle tombe en vacances scolaires ;
     · un jour passé signalé ;
     · un jour fixe de temps partiel compté comme un jour de vacances ;
     · le 24/12 ou le 31/12 compté une journée entière ;
     · une coche « Prévenu » qui survit à la correction du point ;
     · un MAR (rôle mar) qui lit ou coche les points.
   Tout le code exécuté est EXTRAIT des fichiers livrés. */
const vm = require('vm');
const { Classeur, extraireFonction, socleMedecins } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const SRC = require('./stubs').sourceGasTout();
const constante = nom => { const m = SRC.match(new RegExp('const\\s+' + nom + '\\s*=[^;]*;')); if (!m) throw new Error(nom); return m[0]; };

const P = n => 'P' + String(n).padStart(2, '0');
/* MEDECINS aux colonnes de production ; HORS_EFFECTIF en 18e colonne, repérée par son titre. */
function ligneMed(id, init, quotite, opts) {
  opts = opts || {};
  return [id, id, init, 'O', quotite, 100, 'C' + id, '', '', '', '', '', '', '', '', '', opts.fixes || '', opts.hors ? 'O' : ''];
}
function monde(opts) {
  opts = opts || {};
  const cl = new Classeur();
  const med = [['ID','NOM','INITIALES','ACTIF','QUOTITE','PCT_GARDES','CODE','EMAIL','DECT','date_debut','date_fin','no_garde','only_18','no_weekend','rythme_2sur2','souhait_plafond','tp_jours_fixes', opts.sansColonne ? 'AUTRE' : 'HORS_EFFECTIF']];
  med.push(ligneMed('REA', 'RE', 80));
  med.push(ligneMed('ZORRO', 'ZO', 90));
  med.push(ligneMed('VACX', 'VX', 90));
  med.push(ligneMed('FIXE', 'FX', 60, { fixes: 'JEU, VEN' }));
  for (let i = 1; i <= 11; i++) med.push(ligneMed(P(i), 'Q' + i, 100));
  med.push(ligneMed('CHEF', 'CH', 100, { hors: true }));
  const ids = med.slice(1).map(l => l[0]);
  cl.ajouter('MEDECINS', med);
  cl.ajouter('CONFIG', [['CLE','VALEUR'], ['ANNEE_ACTIVE', '2027']]);
  cl.ajouter('CONFIG_CONGES', [['QUOTITE','VAC','FORM','CTP'], [100,33,10,0], [90,30,9,2], [80,26,8,3], [60,20,6,4], [50,17,5,4]]);
  /* INDISPOS_2027 : l'effectif présent y lit les absences (comme en production). */
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const datesI = [], e1 = [''], e2 = [''];
  for (let m = 0; m < 12; m++) { const nb = new Date(2027, m + 1, 0).getDate();
    for (let j = 1; j <= nb; j++) { datesI.push(`2027-${String(m + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`); e1.push(j === 1 ? `${MOIS[m]} 2027` : ''); e2.push(j); } }
  const ind = [e1, [''].concat(datesI.map(() => '')), e2];
  ids.forEach(id => ind.push([id].concat(datesI.map(() => ''))));
  /* GARDES_2027 : 04/01/2027 = colonne 1, 364 jours. */
  const nCols = 364, debut = new Date(2027, 0, 4, 12);
  const g = [Array(nCols + 1).fill(''), Array(nCols + 1).fill(''), Array(nCols + 1).fill('')];
  ids.forEach(id => g.push([id].concat(Array(nCols).fill(''))));
  const MAPI = { V: 'VAC', F: 'FORM', TP: 'TP', CL: 'CL', A: 'A', VA: 'VA', VM: 'VM' };
  (opts.indispos || []).forEach(([id, ds, code]) => { ind[3 + ids.indexOf(id)][1 + datesI.indexOf(ds)] = code; });
  (opts.cases || []).forEach(([id, ds, code]) => {
    const c = Math.round((new Date(ds + 'T12:00:00') - debut) / 86400000) + 1;
    g[3 + ids.indexOf(id)][c] = code;
    if (MAPI[code] && datesI.indexOf(ds) >= 0) ind[3 + ids.indexOf(id)][1 + datesI.indexOf(ds)] = MAPI[code];
  });
  cl.ajouter('GARDES_2027', g);
  cl.ajouter('INDISPOS_2027', ind);
  cl.ajouter('LIENS_R_2027', [['SAMEDI','MEDECIN','DATE R']]);
  if (opts.rea1) cl.ajouter('REA1_2027', [['Semaine n°','Du','Au','REA 1','REA 2']].concat(opts.rea1));
  if (opts.demandes) cl.ajouter('TP_DEMANDES', [['ANNEE','DATE','MAR','QUAND']].concat(opts.demandes));

  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Set, RegExp, parseInt, isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl, flush() {} }, Logger: { log() {} },
    Session: { getScriptTimeZone: () => 'Europe/Paris' } });
  ctx.globalThis = ctx;
  ctx.__aujourdhui = opts.aujourdhui || '2027-01-01';
  ctx.Utilities = { formatDate: (d) => {
    if (Math.abs(d - Date.now()) < 120000) return ctx.__aujourdhui;   // « maintenant » : le jour du scénario
    const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); } };
  socleMedecins(ctx);
  vm.runInContext('const ContentService = { MimeType:{JSON:1}, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) };', ctx);
  vm.runInContext('var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };', ctx);
  vm.runInContext('function _configRows_(){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CONFIG").getDataRange().getValues(); }', ctx);
  vm.runInContext('let _medFlagsCache = null; let _quotasCache = null;', ctx);
  ['getActiveYear', 'getPremierJourPlanning', 'reconstruireDatesHeaders', 'buildDateToCol', 'getJoursFeries', 'getMedecinFlags', 'seuilsPresence_'].forEach(n =>
    vm.runInContext(extraireFonction('../gas/code.gs', n), ctx));
  vm.runInContext('function _cacheLire_(){ return null; } function _cacheEcrire_(){}', ctx);
  vm.runInContext("const SEUILS_TAB = 'SEUILS'; const _SEUILS_HEADER = ['CLE', 'VALEUR', 'DESCRIPTION']; const _SEUILS_SEED = [];", ctx);
  ['getOrCreateSeuilsTab', 'getSeuils'].forEach(n => vm.runInContext(extraireFonction('../gas/portail.gs', n), ctx));
  if (opts.seuils) cl.ajouter('SEUILS', [['CLE', 'VALEUR', 'DESCRIPTION']].concat(opts.seuils));
  vm.runInContext(extraireFonction('../gas/generateur_gardes.gs', 'estSemaineOff'), ctx);
  ['_loadQuotasConges', 'getQuotasConges', '_tpMondePresence_', '_tpDemandesSheet_', '_tpDemandes_',
   '_echangesTz_', '_echangesTexteDate_', '_recupsDecale_', '_recupsDow_', '_rea1Jours_',
   '_verifPrevenusSheet_', '_verifPrevenus_', '_verifJjMm_', '_verifDecale_', '_pl_', 'computePointsVerif', '_verifPourquoi_',
   '_act_getPointsVerif', '_act_marquerPrevenu', '_deny', '_error'].forEach(n =>
    vm.runInContext(extraireFonction('../gas/Indispos.gs', n), ctx));
  ['VERIF_ONGLET', 'VERIF_ENTETE', 'VERIF_EQUIPE', 'VERIF_LIB_REA1', 'VERIF_INDISPOS_GARDES', 'VERIF_MOTIFS'].forEach(n => vm.runInContext(constante(n), ctx));
  const frais = () => vm.runInContext('_medFlagsCache = null; _quotasCache = null; _medecinsInvalider_();', ctx);
  return {
    cl, ctx,
    presents: ds => { frais(); return vm.runInContext(`_tpMondePresence_(2027).presents(${JSON.stringify(ds)})`, ctx); },
    points: (user) => { frais(); return vm.runInContext(`_act_getPointsVerif({ e:{}, payload:{ year: 2027 }, action:'getPointsVerif', code:'x', user: ${JSON.stringify(user || { role: 'admin', id: 'ADMIN' })} })`, ctx); },
    cocher: (cle, prevenu, user) => vm.runInContext(`_act_marquerPrevenu({ e:{}, payload:{ cle: ${JSON.stringify(cle)}, prevenu: ${!!prevenu} }, action:'marquerPrevenu', code:'x', user: ${JSON.stringify(user || { role: 'admin', id: 'ADMIN' })} })`, ctx),
    poser: (id, ds, code) => {   // une case du planning change (comme un geste du comité)
      const sh = cl.getSheetByName('GARDES_2027'), d = sh.getDataRange().getValues();
      const r = d.findIndex(l => l[0] === id), c = Math.round((new Date(ds + 'T12:00:00') - new Date(2027, 0, 4, 12)) / 86400000) + 1;
      sh.getRange(r + 1, c + 1).setValue(code);
    },
  };
}
const semaine = (lundi, code) => { const out = []; for (let k = 0; k < 5; k++) { const d = new Date(lundi + 'T12:00:00'); d.setDate(d.getDate() + k);
  out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); } return out.map(ds => [null, ds, code]); };
const pour = (id, lignes) => lignes.map(l => [id, l[1], l[2]]);
const cles = r => (r.points || []).map(p => p.cle);

console.log('\n═══ HE · le MAR hors effectif n\'est jamais compté parmi les présents ═══');
{
  const avec = monde(), sans = monde({ sansColonne: true });
  V('lundi ordinaire : 15 présents quand le chef de service est hors effectif', avec.presents('2027-03-01') === 15, avec.presents('2027-03-01'));
  V('contre-épreuve : sans la colonne HORS_EFFECTIF, il est compté (16)', sans.presents('2027-03-01') === 16, sans.presents('2027-03-01'));
  V('la colonne est repérée par son TITRE, pas par sa place', /HORS_EFFECTIF/.test(extraireFonction('../gas/code.gs', 'getMedecinFlags')) && !/COL_MED\.HORS/.test(SRC));
  V('jour fixe de temps partiel toujours retiré (jeudi : 14)', avec.presents('2027-03-04') === 14, avec.presents('2027-03-04'));
}

console.log('\n═══ JT · TP un jour tendu : ≤ 12 postables s\'il est absent, pas 13 ═══');
{
  const b = monde({ cases: [
    ['ZORRO', '2027-03-02', 'TP'], ['P01', '2027-03-02', 'V'], ['P02', '2027-03-02', 'V'], ['P03', '2027-03-02', 'V'],   // 15 - 1 - 3 = 11
    ['ZORRO', '2027-03-03', 'TP'], ['P01', '2027-03-03', 'V'], ['P02', '2027-03-03', 'V'],                              // 12 : limite, signalé
    ['ZORRO', '2027-03-10', 'TP'], ['P01', '2027-03-10', 'V'],                                                           // 13 : pas signalé
  ] });
  const r = b.points();
  V('lecture réussie, année générée', r.success === true && r.genere === true, r);
  const t = (r.points || []).filter(p => p.code === 'tendu');
  V('11 postables : signalé', t.some(p => p.date === '2027-03-02'), t);
  V('12 postables : signalé (même seuil que le refus à la pose)', t.some(p => p.date === '2027-03-03'), t);
  V('13 postables : pas signalé', !t.some(p => p.date === '2027-03-10'), t);
  const p2 = t.find(p => p.date === '2027-03-02') || {};
  V('le texte dit le compte et qui n\'est pas compté, par ses initiales du classeur', p2.texte === "11 MAR postables (hors CH) s'il est absent.", p2.texte);
  V('le seuil est celui du refus à la pose : seuilsPresence_().alerte, des deux côtés', /reste < S\.alerte/.test(extraireFonction('../gas/temps_partiel.gs', '_poserTp_'))
    && /n < S\.alerte/.test(extraireFonction('../gas/gardes.gs', 'computePointsVerif')));
  V('un point tendu est orange, dans la famille temps partiel', p2.niv === 'orange' && p2.fam === 'tp', p2);
  /* Le point disparaît dès que la case est corrigée. */
  b.poser('P03', '2027-03-02', ''); b.poser('P02', '2027-03-02', '');
  const sh = b.cl.getSheetByName('INDISPOS_2027'), d = sh.getDataRange().getValues();
  ['P02', 'P03'].forEach(id => { const rr = d.findIndex(l => l[0] === id); const cc = 1 + (new Date('2027-03-02T12:00:00') - new Date(2027, 0, 1, 12)) / 86400000; sh.getRange(rr + 1, Math.round(cc) + 1).setValue(''); });
  const r2 = b.points();
  V('deux absences retirées (13 postables) : le point du 02/03 a disparu', !cles(r2).includes('tendu|ZORRO|2027-03-02'), cles(r2));
  /* Un jour passé n'est plus à corriger. */
  const passe = monde({ aujourdhui: '2027-03-03', cases: [
    ['ZORRO', '2027-03-02', 'TP'], ['P01', '2027-03-02', 'V'], ['P02', '2027-03-02', 'V'], ['P03', '2027-03-02', 'V'],
    ['ZORRO', '2027-03-03', 'TP'], ['P01', '2027-03-03', 'V'], ['P02', '2027-03-03', 'V'] ] });
  const rp = cles(passe.points());
  V('vu le 03/03 : le 02/03 (passé) n\'est plus signalé, le 03/03 (aujourd\'hui) l\'est', !rp.includes('tendu|ZORRO|2027-03-02') && rp.includes('tendu|ZORRO|2027-03-03'), rp);
}

console.log('\n═══ R1 · semaine Réa 1 occupée ═══');
{
  const b = monde({
    rea1: [[14, new Date(2027, 3, 5), new Date(2027, 3, 9), 'RE', 'Q1']],
    demandes: [[2027, new Date(2027, 3, 8), 'REA', '2027-04-01T10:00:00Z']],
    cases: [['REA', '2027-04-06', 'TP'], ['REA', '2027-04-09', 'F'], ['REA', '2027-04-12', 'TP'], ['P01', '2027-04-06', 'TP']] });
  const r = b.points();
  const rea = (r.points || []).filter(p => p.fam === 'rea1' && p.code === 'rea');
  V('TP le mardi de sa semaine : signalé', rea.some(p => p.id === 'REA' && p.date === '2027-04-06'), rea);
  V('formation le vendredi de sa semaine : signalée', rea.some(p => p.id === 'REA' && p.date === '2027-04-09' && /^Formation/.test(p.texte)), rea);
  V('demande de TP en attente dans sa semaine : signalée', rea.some(p => p.date === '2027-04-08' && /Demande/.test(p.texte)), rea);
  V('TP la semaine suivante : pas signalé', !rea.some(p => p.date === '2027-04-12'), rea);
  V('un autre MAR en TP cette semaine-là : pas concerné', !rea.some(p => p.id === 'P01'), rea);
  const p = rea.find(x => x.date === '2027-04-06') || {};
  V('le texte donne la semaine', p.texte === 'Temps partiel posé dans sa semaine Réa 1 (05/04 → 09/04).', p.texte);
  V('les initiales accompagnent le point', p.init === 'RE', p);
  const sansOnglet = monde({ cases: [['REA', '2027-04-06', 'TP']] });
  V('sans onglet REA1_2027 : aucun point Réa 1', !(sansOnglet.points().points || []).some(x => x.fam === 'rea1'));
}

console.log('\n═══ VA · vacances au-delà du droit ═══');
{
  const lundis = n => { const out = []; let d = new Date(2027, 1, 1, 12); for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 7); } return out; };
  const semaines = (id, n) => [].concat(...lundis(n).map(l => pour(id, semaine(l, 'V'))));
  const vacx = semaines('VACX', 6).concat([['VACX', '2027-09-01', 'V']]);              // 31 jours ouvrés pour 30
  const fixe = semaines('FIXE', 5);                                                     // 25 jours, dont 10 jeudis/vendredis fixes
  const p04 = semaines('P04', 6).slice(0, 32).concat([['P04', '2027-12-24', 'V'], ['P04', '2027-12-31', 'V']]);   // 32 + 0,5 + 0,5 = 33
  const b = monde({ cases: vacx.concat(fixe, p04) });
  const vac = (b.points().points || []).filter(p => p.code === 'vac');
  const vx = vac.find(p => p.id === 'VACX') || {};
  V('31 jours pour un droit de 30 : signalé, avec le compte', vx.texte === '31 jours de vacances posés en 2027 pour un droit de 30 jours (90 %) : 1 de trop.', vx.texte);
  V('jours fixes de temps partiel non comptés (15 jours réels pour 20)', !vac.some(p => p.id === 'FIXE'), vac);
  V('24/12 et 31/12 comptés pour une demi-journée (33 pour 33)', !vac.some(p => p.id === 'P04'), vac);
  V('un point de vacances n\'a pas de date : sa clé porte l\'année', vx.cle === 'vac|VACX|2027' && vx.date === null, vx);
}

console.log('\n═══ PR · la case « Prévenu » ═══');
{
  const b = monde({ cases: [['ZORRO', '2027-03-02', 'TP'], ['P01', '2027-03-02', 'V'], ['P02', '2027-03-02', 'V'], ['P03', '2027-03-02', 'V']] });
  const cle = 'tendu|ZORRO|2027-03-02';
  const c = b.cocher(cle, true);
  V('cocher : enregistré, avec la date', c.success === true && c.prevenu && c.prevenu.le === '2027-01-01', c);
  V('l\'onglet VERIF_PREVENUS est créé avec son en-tête', !!b.cl.getSheetByName('VERIF_PREVENUS') && b.cl.getSheetByName('VERIF_PREVENUS').lignes[0].join() === 'CLE,LE,PAR');
  V('relu à la lecture suivante', !!(b.points().prevenus || {})[cle]);
  b.cocher(cle, true);
  V('cocher deux fois ne double pas la ligne', b.cl.getSheetByName('VERIF_PREVENUS').lignes.length === 2, b.cl.getSheetByName('VERIF_PREVENUS').lignes.length);
  b.cocher(cle, false);
  V('décocher : la coche disparaît', !(b.points().prevenus || {})[cle]);
  b.cocher(cle, true);
  b.poser('ZORRO', '2027-03-02', '');
  const sh = b.cl.getSheetByName('INDISPOS_2027'), d = sh.getDataRange().getValues();
  sh.getRange(d.findIndex(l => l[0] === 'ZORRO') + 1, Math.round((new Date('2027-03-02T12:00:00') - new Date(2027, 0, 1, 12)) / 86400000) + 2).setValue('');
  const r = b.points();
  V('point corrigé : il disparaît, et sa coche avec lui', !cles(r).includes(cle) && !(r.prevenus || {})[cle], r);
  V('une clé inconnue est refusée', b.cocher('nimporte|quoi', true).success === false);
  const mar = { role: 'mar', id: 'ZORRO' };
  V('un MAR ne lit pas les points', b.points(mar).success === false);
  V('un MAR ne coche pas', b.cocher(cle, true, mar).success === false);
}

console.log('\n═══ SE · le seuil vient de l\'onglet SEUILS du classeur ═══');
{
  const cases = [['ZORRO', '2027-03-03', 'TP'], ['P01', '2027-03-03', 'V'], ['P02', '2027-03-03', 'V']];   // 12 postables s'il est absent
  const def = monde({ cases }), bas = monde({ cases, seuils: [['SEUIL_PRESENCE_ALERTE', 12, ''], ['SEUIL_PRESENCE_CONFORT', 14, '']] });
  const haut = monde({ cases: [['ZORRO', '2027-03-10', 'TP'], ['P01', '2027-03-10', 'V']], seuils: [['SEUIL_PRESENCE_ALERTE', 14, ''], ['SEUIL_PRESENCE_CONFORT', 16, '']] });
  V('sans onglet SEUILS : 13 par défaut, 12 postables signalé', cles(def.points()).includes('tendu|ZORRO|2027-03-03'));
  V('onglet SEUILS à 12 : 12 postables n\'est plus tendu', !cles(bas.points()).includes('tendu|ZORRO|2027-03-03'), cles(bas.points()).filter(c => /^tendu/.test(c)));
  V('onglet SEUILS à 14 : 13 postables devient tendu', cles(haut.points()).includes('tendu|ZORRO|2027-03-10'));
  V('le seuil lu est renvoyé à l\'écran', JSON.stringify(bas.points().seuils) === '{"alerte":12,"confort":14}', bas.points().seuils);
  const absurde = monde({ seuils: [['SEUIL_PRESENCE_ALERTE', 13, ''], ['SEUIL_PRESENCE_CONFORT', 10, '']] });
  V('un confort sous l\'alerte est corrigé (alerte + 2)', vm.runInContext('JSON.stringify(seuilsPresence_())', absurde.ctx) === '{"alerte":13,"confort":15}');
  /* Les autres usages du seuil : une seule source. */
  const gen = extraireFonction('../gas/generateur_gardes.gs', '_rPresents') + require('fs').readFileSync(require('path').join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8').match(/const R_PLANCHER\s*=[^\n]*/)[0];
  /* (20/11/2026) les récupérations ne se posent que sur un jour qui reste vert : le seuil de confort. */
  V('placement des récups (génération) : seuilsPresence_().confort (jour vert)', /seuilsPresence_\(\)\.confort/.test(gen) && !/seuilsPresence_\(\)\.alerte/.test(gen), gen.slice(-160));
  const ech = require('fs').readFileSync(require('path').join(__dirname, '..', 'gas', 'echanges.gs'), 'utf8');
  V('placement des récups (échanges) : seuilsPresence_().confort (jour vert)', /const plancher = \(typeof seuilsPresence_ === 'function'\) \? seuilsPresence_\(\)\.confort : RECUP_PLANCHER_REPLI;/.test(ech));
  const adm = require('fs').readFileSync(require('path').join(__dirname, '..', 'admin.html'), 'utf8');
  V('bande de présence de l\'admin : le MAR hors effectif n\'est pas compté', /m\.horsEffectif/.test(adm));
}

console.log('\n═══ H18 · les 18 h ═══');
{
  const b = monde({ cases: [['P05', '2027-03-04', '18'], ['P05', '2027-03-05', 'V'], ['P06', '2027-03-05', '18'], ['P06', '2027-03-06', 'G'], ['P07', '2027-03-12', '18']] });
  const r = b.points(), c = cles(r);
  V('18 h la veille de vacances : orange', r.points.some(p => p.cle === 'h18veille|P05|2027-03-04' && p.niv === 'orange'), c.filter(x => /^h18/.test(x)));
  V('18 h du vendredi avec garde le samedi : rien', !c.includes('h18ven|P06|2027-03-05'));
  V('18 h du vendredi sans garde le samedi : pour information', r.points.some(p => p.cle === 'h18ven|P07|2027-03-12' && p.niv === 'info'));
  V('jour ouvré sans 18 h : rouge, pour l\'équipe', r.points.some(p => p.cle === 'sans18|EQUIPE|2027-03-01' && p.niv === 'rouge' && p.init === 'Équipe'));
  V('jour ouvré avec son 18 h : rien', !c.includes('sans18|EQUIPE|2027-03-04'));
  V('samedi sans 18 h : rien (pas un jour ouvré)', !c.includes('sans18|EQUIPE|2027-03-06'));
}

console.log('\n═══ RC · les récupérations ═══');
{
  const b = monde({ cases: [
    ['P08', '2027-03-06', 'G'], ['P08', '2027-03-07', 'RG'], ['P08', '2027-03-02', 'R'], ['P01', '2027-03-02', 'V'], ['P02', '2027-03-02', 'V'], ['P03', '2027-03-02', 'V'],   // R un jour à 11
    ['P09', '2027-03-13', 'G'], ['P09', '2027-03-14', 'RG'], ['P09', '2027-04-06', 'R'],   // R un jour ordinaire, même en vacances scolaires
    ['P10', '2027-03-20', 'G'], ['P10', '2027-03-21', 'RG'] ],                              // samedi sans récup
    /* (20/11/2026) le petit monde n'a que 15 postables : seuils abaissés pour qu'un jour ordinaire (14) reste vert */
    seuils: [['SEUIL_PRESENCE_ALERTE', 11, ''], ['SEUIL_PRESENCE_CONFORT', 13, '']] });
  const r = b.points(), pt = cle => r.points.find(p => p.cle === cle);
  V('récup un jour non vert : orange, avec le compte', pt('rtendu|P08|2027-03-02') && /11 MAR postables/.test(pt('rtendu|P08|2027-03-02').texte), cles(r).filter(x => /^r/.test(x)));
  V('(20/11/2026) récup signalée dès qu\'un jour n\'est pas vert (seuil de confort, comme la règle de pose)', /n < S\.confort\) ajouter\('recups', 'rtendu'/.test(extraireFonction('../gas/gardes.gs', 'computePointsVerif')));
  V('récup un jour ordinaire : rien, vacances scolaires ou non', !cles(r).some(x => /\|P09\|/.test(x) && /^r/.test(x)));
  V('samedi tenu sans récup : signalé', pt('recart|P10|2027') && /1 récupération de samedi due/.test(pt('recart|P10|2027').texte), pt('recart|P10|2027'));
  V('samedi tenu avec sa récup : rien', !pt('recart|P08|2027') && !pt('recart|P09|2027'));
  V('aucune règle « vacances scolaires » dans les contrôles', !/PERIODES_VAC[\s\S]{0,400}rtendu|vacsc[\s\S]{0,200}ajouter/.test(extraireFonction('../gas/gardes.gs', 'computePointsVerif')));
}

console.log('\n═══ GA · les gardes ═══');
{
  const b = monde({ rea1: [[14, new Date(2027, 3, 5), new Date(2027, 3, 9), 'RE', 'Q1']], cases: [
    ['P01', '2027-03-09', 'G'], ['P02', '2027-03-09', 'G2'], ['P01', '2027-03-10', 'RG'], ['P02', '2027-03-10', 'RG'],   // nuit complète
    ['P03', '2027-03-11', 'G'], ['P03', '2027-03-12', '18'],                                                             // pas de repos
    ['P04', '2027-05-03', 'G'], ['P04', '2027-05-04', 'RG'], ['P04', '2027-05-05', 'G'], ['P04', '2027-05-06', 'RG'],
    ['P04', '2027-05-07', 'G'], ['P04', '2027-05-08', 'RG'], ['P04', '2027-05-09', 'G'], ['P04', '2027-05-10', 'RG'],   // 4 en 7 jours
    ['REA', '2027-04-07', 'G'], ['REA', '2027-04-08', 'RG'], ['REA', '2027-04-04', 'G2'], ['REA', '2027-04-05', 'RG'] ] });
  const r = b.points(), c = cles(r), pt = cle => r.points.find(p => p.cle === cle);
  V('nuit avec un G et un G2 : rien', !c.includes('nuit|EQUIPE|2027-03-09'));
  V('nuit sans G2 : rouge', pt('nuit|EQUIPE|2027-03-11') && pt('nuit|EQUIPE|2027-03-11').niv === 'rouge' && /1 G et 0 G2/.test(pt('nuit|EQUIPE|2027-03-11').texte));
  V('garde suivie d\'un 18 h au lieu du repos : orange', pt('rg|P03|2027-03-11') && /« 18 »/.test(pt('rg|P03|2027-03-11').texte));
  V('garde suivie de son repos : rien', !c.includes('rg|P01|2027-03-09'));
  V('4 gardes en 7 jours : orange', pt('densite|P04|2027-05-03') && pt('densite|P04|2027-05-03').niv === 'orange');
  V('garde le mercredi de sa semaine Réa 1 : rouge', pt('rea1g|REA|2027-04-07') && pt('rea1g|REA|2027-04-07').niv === 'rouge');
  V('garde le dimanche veille de sa semaine Réa 1 : rouge', pt('rea1g|REA|2027-04-04') && /veille/.test(pt('rea1g|REA|2027-04-04').texte));
  V('ce qui est en ordre est listé par famille', Array.isArray(r.oks.h18) || Array.isArray(r.oks.tp), Object.keys(r.oks));
}

console.log('\n═══ CO · indispos et planning concordent ═══');
{
  const b = monde({ indispos: [['P05', '2027-06-01', 'VAC'], ['P06', '2027-06-02', 'VAC']], cases: [['P06', '2027-06-02', 'G'], ['P06', '2027-06-03', 'RG']] });
  const c = cles(b.points());
  V('vacances aux indispos, case vide au planning : signalé', c.includes('concord|P05|2027-06-01'));
  V('vacances écrasées par une garde (un don) : normal, rien', !c.includes('concord|P06|2027-06-02'));
  V('une clé de nouvelle famille est acceptée par « Prévenu »', b.cocher('concord|P05|2027-06-01', true).success === true);
}

console.log('\n═══ PS · la présence jour par jour (heatmap de l\'onglet Contrôles, 18/11/2026) ═══');
{
  const b = monde({ cases: [
    ['P01', '2027-03-02', 'V'], ['P02', '2027-03-02', 'V'], ['P03', '2027-03-02', 'RG'], ['P04', '2027-03-02', 'R'],
    ['ZORRO', '2027-03-02', 'TP'], ['P05', '2027-03-02', 'F'], ['P06', '2027-03-02', 'G'] ] });
  const r = b.points(), P = r.presence || {}, j = P['2027-03-02'] || {};
  const nAb = x => Object.keys(x.ab || {}).reduce((t, k) => t + x.ab[k].length, 0);
  V('la présence arrive avec les contrôles, un jour par jour ouvré', Object.keys(P).length > 240 && Object.keys(P).length < 262, Object.keys(P).length);
  V('postables = le compte de la pose des TP, tel quel (mardi 02/03 : 15 − 6 = 9)', j.p === b.presents('2027-03-02') && j.p === 9, j);
  V('postables + absents = effectif hors chef, tous les jours (jamais un MAR perdu ou compté deux fois)', Object.keys(P).every(ds => P[ds].p + nAb(P[ds]) === 15), Object.keys(P).filter(ds => P[ds].p + nAb(P[ds]) !== 15).slice(0, 3));
  V('chaque motif à sa place : vacances, repos de garde, récup, temps partiel, formation', (j.ab['Vacances'] || []).join() === 'Q1,Q2' && (j.ab['Repos de garde'] || []).join() === 'Q3'
    && (j.ab['Récup'] || []).join() === 'Q4' && (j.ab['Temps partiel'] || []).join() === 'ZO' && (j.ab['Formation'] || []).join() === 'Q5', j.ab);
  V('une garde du jour reste postable (G compté présent)', !Object.keys(j.ab).some(k => j.ab[k].includes('Q6')));
  V('rg = les repos de garde du jour (total avec RG = 10)', j.rg === 1 && j.p + j.rg === 10, j);
  V('le chef hors effectif n\'apparaît nulle part', Object.keys(P).every(ds => !Object.keys(P[ds].ab).some(k => P[ds].ab[k].includes('CH'))));
  V('jour fixe de temps partiel : motif « Temps partiel » (jeudi)', ((P['2027-03-04'] || {}).ab || {})['Temps partiel'] && P['2027-03-04'].ab['Temps partiel'].includes('FX'), (P['2027-03-04'] || {}).ab);
  V('ni week-end ni férié dans la présence ; le férié est envoyé à part', !P['2027-03-06'] && !P['2027-11-01'] && (r.feries || []).includes('2027-11-01'), r.feries);
}

console.log('\n═══ GF · une fois l\'année générée, GARDES fait foi (24/11/2026) ═══');
{
  /* Défaut de production : en 2026, les absences n'existaient que dans GARDES_2026
     (INDISPOS_2026 ne portait que des INDISPO) — la heatmap était toute verte. */
  const b = monde({ indispos: [['P07', '2027-06-01', 'VAC']] });   // vestige : dans INDISPOS seulement
  V('une absence restée dans INDISPOS seulement ne compte plus (mardi 01/06 : 15)', b.presents('2027-06-01') === 15, b.presents('2027-06-01'));
  [['P01', 'A'], ['P02', 'CL'], ['P03', 'CP'], ['P04', 'V'], ['P05', 'F']].forEach(([id, c]) => b.poser(id, '2027-06-08', c));
  V('A, CL, CP, V, F écrits dans GARDES seulement : 5 absents (mardi 08/06 : 10)', b.presents('2027-06-08') === 10, b.presents('2027-06-08'));
  [['P01', 'VM'], ['P02', 'VA'], ['P03', 'E'], ['P04', 'I'], ['P05', 'B']].forEach(([id, c]) => b.poser(id, '2027-06-15', c));
  V('VM, VA et tout autre code (E, I, B) : présents (mardi 15/06 : 15)', b.presents('2027-06-15') === 15, b.presents('2027-06-15'));
  const j = (b.points().presence || {})['2027-06-08'] || {};
  V('heatmap : chaque absence lue dans GARDES a son motif', (j.ab || {})['Absent'] + '' === 'Q1' && (j.ab || {})['Congé long'] + '' === 'Q2'
    && (j.ab || {})['Congé'] + '' === 'Q3' && (j.ab || {})['Vacances'] + '' === 'Q4' && (j.ab || {})['Formation'] + '' === 'Q5' && j.p === 10, j);
  V('les jours de l\'année sont ceux du planning (04/01/2027 → 364 jours)',
    vm.runInContext("(function(){ const M = _tpMondePresence_(2027); return M.datesValides.has('2027-01-04') && M.datesValides.size === 364; })()", b.ctx));
  b.cl.deleteSheet(b.cl.getSheetByName('GARDES_2027'));
  V('contre-épreuve : année pas encore générée (sans GARDES), INDISPOS est lu (01/06 : 14)', b.presents('2027-06-01') === 14, b.presents('2027-06-01'));
}

console.log('\n═══ RT · le routeur et l\'écran ═══');
{
  const ind = require('fs').readFileSync(require('path').join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
  V('getPointsVerif déclarée au routeur, réservée au comité', /"getPointsVerif"\s*:\s*\{\s*role:\s*'admin'\s*,\s*fn:\s*_act_getPointsVerif\s*\}/.test(ind));
  V('marquerPrevenu déclarée au routeur, réservée au comité', /"marquerPrevenu"\s*:\s*\{\s*role:\s*'admin'\s*,\s*fn:\s*_act_marquerPrevenu\s*\}/.test(ind));
  const adm = require('fs').readFileSync(require('path').join(__dirname, '..', 'admin.html'), 'utf8');
  V('admin : un onglet Contrôles, avec sa pastille', /id="tab-controles"[^\n]*id="pastilleCtl"/.test(adm) && /id="panel-controles"/.test(adm));
  V('admin : chargé à l\'ouverture de l\'onglet, pas à l\'ouverture de la page', /name==='controles'\) \{ chargerControles\(/.test(adm)
    && !/async function initDashboard\(\)[\s\S]*?\n\}/.exec(adm)[0].includes('chargerControles'));
  V('admin : l\'ancien bandeau de l\'onglet Statuts est retiré', !/verifStatuts|pastilleVerif/.test(adm));
  V('« Prévenu » accepte les clés de toutes les familles', /\[a-z0-9\]\+\\\|/.test(extraireFonction('../gas/gardes.gs', '_act_marquerPrevenu')));
}

/* L'écran, exécuté : le vrai admin.html dans un navigateur simulé. */
(async () => {
  console.log('\n═══ EC · l\'onglet Contrôles, dessiné ═══');
  const { JSDOM, VirtualConsole } = require('jsdom');
  const fs = require('fs'), path = require('path');
  const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const vc = new VirtualConsole();
  const erreurs = []; vc.on('jsdomError', e => erreurs.push(String(e && e.message)));
  const dom = new JSDOM(lire('admin.html'), { runScripts: 'dangerously', virtualConsole: vc, url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
    beforeParse(w) { w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.Element.prototype.scrollIntoView = function () {}; w.scrollTo = () => {};
      w.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
      ['partage/portail.js', 'partage/rendu_equite.js', 'partage/dispo_jour.js', 'version.js'].forEach(f => { try { w.eval(lire(f)); } catch (e) {} }); } });
  const w = dom.window, D = w.document;
  await new Promise(r => setTimeout(r, 300));
  const appels = [];
  w.__appels = appels;
  w.__reponse = { success: true, genere: true, seuils: { alerte: 13, confort: 15 }, prevenus: {}, vacsc: [['2027-07-03', '2027-09-01']], feries: ['2027-11-01'],
    presence: { '2027-03-02': { p: 11, rg: 2, ab: { 'Vacances': ['Q1', 'Q2'], 'Repos de garde': ['Q3', 'Q4'] } }, '2027-03-03': { p: 12, rg: 2, ab: { 'Vacances': ['Q1'] } },
      '2027-03-04': { p: 16, rg: 0, ab: {} }, '2027-07-16': { p: 14, rg: 2, ab: { 'Vacances': ['Q7'] } } }, oks: { gardes: ['Chaque nuit à venir a un G et un G2 (300)'], h18: ['Un 18 h chaque jour ouvré à venir (200)'] }, points: [
    { cle:'rea|REA|2027-04-06', fam:'rea1', code:'rea', niv:'rouge', id:'REA', init:'RE', date:'2027-04-06', texte:'Temps partiel posé dans sa semaine Réa 1 (05/04 → 09/04).' },
    { cle:'tendu|ZORRO|2027-03-02', fam:'tp', code:'tendu', niv:'orange', id:'ZORRO', init:'ZO', date:'2027-03-02', texte:"11 MAR postables (hors CH) s'il est absent." },
    { cle:'tpdem|ZORRO|2027-07-16', fam:'tp', code:'tpdem', niv:'info', id:'ZORRO', init:'ZO', date:'2027-07-16', texte:'Demande de temps partiel en attente de réponse du comité (à valider dans la tuile Temps partiel).' },
    { cle:'vac|VACX|2027', fam:'conges', code:'vac', niv:'orange', id:'VACX', init:'VX', date:null, texte:'31 jours de vacances posés en 2027 pour un droit de 30 jours (90 %) : 1 de trop.' },
    { cle:'rtendu|P08|2027-03-02', fam:'recups', code:'rtendu', niv:'orange', id:'P08', init:'Q8', date:'2027-03-02', texte:'Récupération un jour tendu : 11 MAR postables (hors CH).' } ] };
  w.eval(`ADMIN_YEAR = 2027; api = async function(p){ window.__appels.push(p); return p.action==='marquerPrevenu' ? {success:true, prevenu:{le:'2027-01-02', par:'ADMIN'}} : window.__reponse; };`);
  V('rien n\'est demandé au serveur à l\'ouverture de la page', !appels.some(a => a.action === 'getPointsVerif'));
  w.eval("showTab('controles')");
  await new Promise(r => setTimeout(r, 80));
  const el = D.getElementById('ctlContenu'), past = D.getElementById('pastilleCtl');
  V('ouvrir l\'onglet charge les contrôles de l\'année', appels.filter(a => a.action === 'getPointsVerif' && a.year === 2027).length === 1, appels);
  V('le total : 4 points à traiter (l\'information n\'est pas comptée), 4 MAR, 1 bloquant', /4\s*points à traiter pour 4 MAR, dont 1 bloquant/.test(el.textContent.replace(/\s+/g, ' ')), el.textContent.slice(0, 200));
  V('pastille de l\'onglet : 4, rouge car un point bloquant', past.style.display !== 'none' && past.textContent === '4' && /217, 45, 32|#D92D20/i.test(past.style.background), past.style.background);
  V('la frise Réa 1 porte les initiales', el.querySelector('.bx-rea .bx-frise b') && el.querySelector('.bx-rea .bx-frise b').textContent === 'RE');
  V('la jauge des congés montre le dépassement', el.querySelector('.bx-vac .bx-j em') && el.querySelector('.bx-vac .bx-j em').textContent === '+1');
  V('une famille sans point devient une tuile verte avec ce qui est en ordre', el.querySelector('.bx-ok') && /Chaque nuit à venir a un G et un G2/.test(el.textContent));
  V('la liste : un point par ligne, rangée par mois', el.querySelectorAll('.bx-l').length === 5 && /Mars/.test(el.textContent) && /Sur l'année/.test(el.textContent));
  V('aucune erreur de script', !erreurs.length, erreurs);
  /* (18/11/2026) la tuile Présence et son panneau */
  const tuile = el.querySelector('.bx-pres');
  V('tuile Présence : le nombre de jours tendus (11 et 12 → 2) et le plus bas', tuile && tuile.querySelector('.bx-big').textContent === '2' && /Plus bas : 11 le mar\. 2 mars/.test(tuile.textContent), tuile && tuile.textContent.slice(0, 160));
  V('tuile Présence : la frise de 52 semaines × 5 jours', tuile && tuile.querySelectorAll('.pres-mini i').length === 260);
  w.eval('presOuvrir()');
  const fond = D.getElementById('hmFond');
  V('un clic ouvre le panneau plein écran', fond && fond.classList.contains('on'));
  V('le panneau : une case par jour reçu, couleur selon le seuil', D.querySelectorAll('#hmBig b[data-d]').length === 4
    && /var\(--h0\)/.test(D.querySelector('#hmBig b[data-d="2027-03-02"]').getAttribute('style')) && /var\(--h3\)/.test(D.querySelector('#hmBig b[data-d="2027-03-04"]').getAttribute('style')));
  V('la demande de TP en attente est cerclée', D.querySelector('#hmBig b[data-d="2027-07-16"]').classList.contains('dem') && !D.querySelector('#hmBig b[data-d="2027-03-02"]').classList.contains('dem'));
  V('une période chaude : les 2 jours d\'affilée sous 13', D.querySelectorAll('#hmFond .hm-per').length === 1 && /2 jours ouvrés/.test(D.querySelector('#hmFond .hm-per').textContent));
  V('le jour le plus bas est ouvert d\'office : 11, total 13 avec les repos de garde, absents par motif', /11/.test(D.querySelector('#hmDet .n').textContent) && /13 avec les repos de garde/.test(D.getElementById('hmDet').textContent)
    && /Vacances · 2/.test(D.getElementById('hmDet').textContent) && D.querySelectorAll('#hmDet .chips em').length === 4);
  w.eval("presJour('2027-07-16')");
  V('un jour à demande : « ZO → 13 si accordée »', /Demande de TP en attente : ZO → 13 si accordée/.test(D.getElementById('hmDet').textContent), D.getElementById('hmDet').textContent);
  D.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  V('Échap ferme le panneau', !fond.classList.contains('on'));
  V('aucune erreur de script (tuile et panneau)', !erreurs.length, erreurs);
  w.eval("ctlFam('tp')");
  V('filtrer une famille : la liste ne garde qu\'elle', D.querySelectorAll('#ctlContenu .bx-l').length === 2);
  w.eval("ctlFam(null)");
  const cb = [...D.querySelectorAll('#ctlContenu .bx-l input[type=checkbox]')].find(x => /tendu\|ZORRO/.test(x.getAttribute('onchange')));
  cb.checked = true; cb.dispatchEvent(new w.Event('change'));
  await new Promise(r => setTimeout(r, 50));
  V('cocher « Prévenu » envoie la clé au serveur', appels.some(a => a.action === 'marquerPrevenu' && a.cle === 'tendu|ZORRO|2027-03-02' && a.prevenu === true), appels.slice(-1));
  V('la ligne affiche la date de la coche et le total baisse', /Prévenu le 02\/01/.test(D.getElementById('ctlContenu').textContent) && D.getElementById('pastilleCtl').textContent === '3');
  w.eval("showTab('statuts'); showTab('controles')");
  await new Promise(r => setTimeout(r, 50));
  V('revenir sur l\'onglet ne recharge pas', appels.filter(a => a.action === 'getPointsVerif').length === 1);
  w.__reponse = Object.assign({}, w.__reponse, { points: [] });
  w.eval("chargerControles(true)");
  await new Promise(r => setTimeout(r, 80));
  V('« Relancer » recharge ; plus aucun point : « Tout est en ordre », pastille masquée', /Tout est en ordre/.test(D.getElementById('ctlContenu').textContent) && D.getElementById('pastilleCtl').style.display === 'none');
  w.eval("ctlOuvrir('REA', '2027-04-06')");
  V('« Ouvrir » mène à l\'onglet Statuts, sur le MAR et le mois', w.eval("STAT.marId==='REA' && STAT.monthKey==='2027-04' && STAT.view==='mar'") && D.getElementById('panel-statuts').classList.contains('active'));

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
