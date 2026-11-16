/* ═══ BANC — 18 H : JAMAIS LA VEILLE DE VACANCES, RÉA 1 EN DERNIER RECOURS (16/11/2026) ═══

   Deux règles du responsable, constatées sur les gardes 2027 générées :
   · « le 18 h veille de vacances c'est non » : deux MAR avaient un 18 h le jour
     qui précède leurs vacances (un vendredi, un mercredi). dispo18 ne regardait
     que le jour même, jamais le lendemain.
   · « le 18 h est à éviter pour le Réa 1 sauf en dernier recours » : la semaine
     Réa 1 était un interdit absolu ; elle devient le tout dernier repli, quand
     plus personne d'autre ne peut tenir la soirée, et l'essai l'annonce.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur, et
   chaque règle a sa CONTRE-ÉPREUVE (le code d'avant doit échouer). */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const YEAR = 2027, D0 = '2027-01-04';
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const fr = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
const RACINE = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RACINE, 'gas', 'generateur_gardes.gs'), 'utf8');

/* Le générateur SANS la règle de la veille : seule la ligne du lendemain est retirée. */
const SANS_VEILLE = SRC.replace(/\n.*VAC_LENDEMAIN_18\.has\(indispos\[id\]\?\.\[addOneDay\(date\)\]\).*\n/, '\n');
/* Le générateur SANS le dernier recours Réa 1 : la semaine Réa 1 redevient un interdit absolu. */
const SANS_RECOURS = SRC.replace("if(!rea1Ok&&REA1_SEM[id]", "if(REA1_SEM[id]");

function grille(ss) {
  const sh = ss.getSheetByName('GARDES_' + YEAR); if (!sh) return null;
  const rows = sh._rows, G = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; G[id] = {};
    for (let c = 1; c < rows[r].length; c++) { const v = String(rows[r][c] || '').trim(); if (v) G[id][addD(D0, c - 1)] = v; } }
  return G;
}

console.log('\n═══ 1. Le correctif est bien dans le code, pas seulement dans ce test ═══');
const BLOC18 = (SRC.match(/function dispo18\([^)]*\)\{([\s\S]*?)\n  \}/) || [])[1] || '';
V('dispo18 regarde le lendemain (vacances)', /VAC_LENDEMAIN_18\.has\(indispos\[id\]\?\.\[addOneDay\(date\)\]\)/.test(BLOC18), BLOC18.slice(0, 200));
V('dispo18 accepte la semaine Réa 1 seulement sur demande (rea1Ok)', /function dispo18\(id,date,rea1Ok,veilleOk\)/.test(SRC) && /!rea1Ok&&REA1_SEM/.test(BLOC18));
V('les deux contre-épreuves ont bien retiré leur règle', SANS_VEILLE !== SRC && SANS_RECOURS !== SRC);

/* ── 2. Veille de vacances ── Chaque MAR pose des vacances qui commencent un
   lundi, un mardi, un mercredi, un jeudi, un vendredi, un samedi : tous les
   jours où un 18 h la veille serait possible. */
function scenarioVac() {
  const im = {}, departs = [];
  const roster = h.defaultRoster();
  const ids = roster.filter(r => (r[1] || 0) > 0 || (r[3] || {}).only18).map(r => r[0]);
  const debuts = ['2027-02-08', '2027-03-16', '2027-04-21', '2027-05-13', '2027-06-18', '2027-09-25', '2027-10-05', '2027-11-10', '2027-01-26', '2027-07-08', '2027-12-17'];
  ids.forEach((id, i) => {
    im[id] = {};
    [debuts[i % debuts.length], debuts[(i + 4) % debuts.length]].forEach((d0, k) => {
      const code = (i + k) % 5 === 0 ? 'VM' : 'VAC';
      for (let j = 0; j < 5; j++) im[id][addD(d0, j)] = j === 0 ? code : 'VAC';
      departs.push([id, addD(d0, -1)]);
    });
  });
  return { im, departs };
}
console.log('\n═══ 2. Aucun 18 h la veille de vacances ═══');
{
  const { im, departs } = scenarioVac();
  const run = (src) => { const s2 = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(h.defaultRoster())),
      h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, h.defaultRoster(), im)), h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
    const ctx = h.buildContext(s2, [], src); let err = null; try { ctx.generateGardes(YEAR); } catch (e) { err = e.message; }
    const G = grille(s2) || {};
    const fautes = departs.filter(([id, d]) => (G[id] || {})[d] === '18').map(([id, d]) => id + ' ' + d);
    const n18 = Object.values(G).reduce((s, x) => s + Object.values(x).filter(v => v === '18').length, 0);
    return { err, fautes, n18 };
  };
  const A = run(SRC);
  V('la génération aboutit', !A.err, A.err);
  V('AUCUN 18 h la veille d\'un départ en vacances (lundi au samedi, VAC ou VM)', A.fautes.length === 0, A.fautes.slice(0, 6));
  V('les soirées restent pourvues (des 18 h sont posés)', A.n18 > 200, A.n18);
  const B = run(SANS_VEILLE);
  V('CONTRE-ÉPREUVE : sans la règle, au moins un 18 h tombe la veille d\'un départ', !B.err && B.fautes.length > 0, { err: B.err, n: B.fautes.length });
}

/* ── 3. Réa 1 : jamais, sauf tout dernier recours ── Même équipe que banc_rea1.js. */
const EQUIPE = [['AUBERT', 'AU'], ['DURAND', 'DU'], ['FAUVEL', 'FAUVEL'], ['MERCIER', 'ME'], ['ORVAL', 'ORVAL']];
function tableauRea() {
  const tab = [['Semaine n°', 'Du', 'Au', 'Cycle', 'REA 1 (1re semaine)', 'REA 2 (2e semaine)']];
  for (let w = 0; w < 52; w++) { const lun = addD(D0, 7 * w); tab.push([String(w + 1), fr(lun), fr(addD(lun, 4)), 'A1', EQUIPE[w % 5][1], '']); }
  return tab;
}
const semaineDe = d => Math.floor((new Date(d + 'T12:00:00') - new Date(D0 + 'T12:00:00')) / 864e5 / 7);
function genRea(im, src) {
  const roster = h.defaultRoster();
  const ss = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']]), h.makeSheet('REA1_' + YEAR, tableauRea())]);
  const ctx = h.buildContext(ss, [], src); let err = null, rep = null;
  try { rep = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { err = e.message; }
  const G = grille(ss) || {};
  const rea18 = [];
  Object.keys(G).forEach(id => Object.keys(G[id]).forEach(d => {
    if (G[id][d] !== '18') return; const w = semaineDe(d), dow = new Date(d + 'T12:00:00').getDay();
    if (w >= 0 && w < 52 && dow >= 1 && dow <= 5 && EQUIPE[w % 5][0] === id) rea18.push(d);
  }));
  return { err, rep, rea18, G };
}
console.log('\n═══ 3. Réa 1 : pas de 18 h dans sa semaine quand quelqu\'un d\'autre est libre ═══');
{
  const A = genRea({}, SRC);
  V('la génération aboutit', !A.err, A.err);
  V('aucun 18 h en semaine Réa 1 sur une année ordinaire', A.rea18.length === 0, A.rea18.slice(0, 6));
  V('aucun avertissement de dernier recours Réa 1', A.rep && !A.rep.warnings.some(w => /18 h en semaine Réa 1/.test(w)));
}

console.log('\n═══ 4. Réa 1 : en tout dernier recours, il tient la soirée plutôt que de la laisser vide ═══');
/* Mercredi 17/03/2027 (semaine 11 → AUBERT Réa 1) : tous les autres sont « A »
   (absents de jour, garde possible) — personne d'autre ne peut faire le 18 h. */
{
  const JOUR = '2027-03-17', im = {};
  h.defaultRoster().forEach(([id]) => { if (id !== 'AUBERT') im[id] = { [JOUR]: 'A' }; });
  V('le scénario vise bien la semaine Réa 1 d\'AUBERT', EQUIPE[semaineDe(JOUR) % 5][0] === 'AUBERT');
  const A = genRea(im, SRC);
  V('la génération aboutit', !A.err, A.err);
  V('le 18 h du 17/03 est tenu par le Réa 1 (seul présent)', (A.G.AUBERT || {})[JOUR] === '18', (A.G.AUBERT || {})[JOUR]);
  V('l\'essai l\'annonce : « 18 h en semaine Réa 1 (dernier recours…) : 2027-03-17 »',
    A.rep && A.rep.warnings.some(w => /18 h en semaine Réa 1 \(dernier recours/.test(w) && w.indexOf(JOUR) >= 0), (A.rep || {}).warnings);
  V('c\'est le seul 18 h de Réa 1 de l\'année', A.rea18.length === 1 && A.rea18[0] === JOUR, A.rea18);
  const B = genRea(im, SANS_RECOURS);
  V('CONTRE-ÉPREUVE : avec l\'interdit absolu, la soirée reste sans 18 h', !B.err && !Object.values(B.G).some(x => x[JOUR] === '18')
    && B.rep.warnings.some(w => w.indexOf('Aucun 18h ' + JOUR) >= 0), { err: B.err });
}

console.log('\n═══ 5. Veille de vacances : en tout dernier recours, la soirée n\'est pas laissée vide (choix du 16/11) ═══');
/* Vendredi 24/12/2027 : tous les MAR partent en vacances le 25 — le cas réel des
   indispos 2027. La règle cède plutôt que de laisser la soirée sans 18 h, et l'essai le dit. */
{
  const JOUR = '2027-12-24', im = {};
  /* Quatre MAR restent pour tenir les gardes de Noël, mais sont « A » le 24 (absents de
     jour, garde possible) : personne d'autre que les partants ne peut faire le 18 h. */
  const quatre = h.defaultRoster().filter(r => !(r[3] || {}).noGarde && (r[1] || 0) >= 100).slice(0, 4).map(r => r[0]);
  h.defaultRoster().forEach(([id]) => { im[id] = quatre.indexOf(id) >= 0 ? { [JOUR]: 'A' } : { '2027-12-25': 'VAC', '2027-12-26': 'VAC' }; });
  const run = src => { const roster = h.defaultRoster();
    const s2 = h.makeSpreadsheet([h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im)),
      h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
    const ctx = h.buildContext(s2, [], src); let rep = null, err = null;
    try { rep = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { err = e.message; }
    const G = grille(s2) || {}; return { err, rep, tenu: Object.keys(G).filter(id => G[id][JOUR] === '18') }; };
  const A = run(SRC);
  V('la génération aboutit', !A.err, A.err);
  V('le 18 h du 24/12 est tenu (une personne)', A.tenu.length === 1, A.tenu);
  V('l\'essai l\'annonce : « 18 h la veille de vacances (dernier recours…) : 2027-12-24 »',
    A.rep && A.rep.warnings.some(w => /18 h la veille de vacances \(dernier recours/.test(w) && w.indexOf(JOUR) >= 0), (A.rep || {}).warnings);
  V('aucun « Aucun 18h » ce jour-là', A.rep && !A.rep.warnings.some(w => w.indexOf('Aucun 18h ' + JOUR) >= 0));
  const STRICT = SRC.replace('if(!veilleOk&&VAC_LENDEMAIN_18', 'if(VAC_LENDEMAIN_18');
  const B = run(STRICT);
  V('CONTRE-ÉPREUVE : avec la règle stricte, la soirée reste vide', STRICT !== SRC && !B.err && B.tenu.length === 0
    && B.rep.warnings.some(w => w.indexOf('Aucun 18h ' + JOUR) >= 0), { err: B.err, tenu: B.tenu });
}

console.log(`\n  ${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
