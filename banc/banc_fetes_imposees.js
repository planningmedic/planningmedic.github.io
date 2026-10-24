/* ═══ BANC — NUITS DE FÊTES IMPOSÉES PAR L'ONGLET FETES_{année} (24/10/2026) ═══

   Le comité décide des binômes des nuits de fêtes. Avant, on l'obtenait en
   bloquant des cases dans les indisponibilités des autres MAR : constaté le
   24/10/2026, un MAR qui enregistre ses souhaits dépasse la limite de 5 week-ends
   bloqués, le portail retire sa case du Jour de l'An, et le scénario saute.
   Désormais l'onglet FETES_{année} (Date, MAR 1, MAR 2) impose les binômes.

   Scénario court exprès (une génération à blanc par cas, planning n° 1) : il
   vérifie l'imposition, pas la qualité du reste de l'année, déjà couverte ailleurs.
   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const YEAR = 2027;

/* Le scénario : six nuits, dont un vendredi-dimanche au même binôme (31/12 et
   02/01) et un MAR présent deux fois (FAUVEL, 24 et 26/12), comme en 2027.
   Initiales du harnais (deux premières lettres) pour certains, identifiants pour d'autres. */
const SCEN = [['24/12/2027', 'FAUVEL', 'ORVAL'], ['25/12/2027', 'ME', 'DU'], ['26/12/2027', 'AU', 'FAUVEL'],
              ['31/12/2027', 'PELLETIER', 'RIVIERE'], ['01/01/2028', 'SABLON', 'SERVANT'], ['02/01/2028', 'PELLETIER', 'RIVIERE']];
const ATTENDU = { '2027-12-24': ['FAUVEL', 'ORVAL'], '2027-12-25': ['MERCIER', 'DURAND'], '2027-12-26': ['AUBERT', 'FAUVEL'],
                  '2027-12-31': ['PELLETIER', 'RIVIERE'], '2028-01-01': ['SABLON', 'SERVANT'], '2028-01-02': ['PELLETIER', 'RIVIERE'] };

function classeur(fetes, im) {
  const roster = h.defaultRoster();
  const f = [h.makeSheet('MEDECINS', h.medecinsRows(roster)), h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, im || {})),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)), h.makeSheet('CONFIG', [['CLE', 'VALEUR']])];
  if (fetes) f.push(h.makeSheet('FETES_' + YEAR, [['Date', 'MAR 1', 'MAR 2']].concat(fetes.map(l => l.slice()))));
  return h.makeSpreadsheet(f);
}
function generer(fetes, im) {
  const ss = classeur(fetes, im), logs = [], ctx = h.buildContext(ss, logs, null);
  let rep = null, err = null;
  try { rep = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { err = e.message; }
  const sh = ss.getSheetByName('GARDES_' + YEAR), G = {};
  if (sh) {
    const rows = sh._rows, D0 = new Date(2027, 0, 4, 12);
    for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue;
      for (let c = 1; c < rows[r].length; c++) { const v = String(rows[r][c] || '').trim();
        if (v === 'G' || v === 'G2') { const d = new Date(D0); d.setDate(d.getDate() + c - 1);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; (G[k] = G[k] || []).push(id); } } }
  }
  return { rep, err, G, logs };
}
const meme = (a, b) => !!a && !!b && a.slice().sort().join() === b.slice().sort().join();

console.log('\n═══ 1. Les six nuits du scénario sont posées telles quelles ═══');
/* AUBERT a posé une indisponibilité le 26/12 : la décision du comité passe, mais
   elle est signalée. */
const A = generer(SCEN, { AUBERT: { '2027-12-26': 'INDISPO' } });
V('la génération aboutit', !A.err, A.err);
Object.keys(ATTENDU).forEach(d => V(`${d} : ${ATTENDU[d].join(' + ')}`, meme(A.G[d], ATTENDU[d]), A.G[d]));
V('le rapport compte 6 nuits imposées', A.rep && A.rep.fetesImposees === 6, A.rep && A.rep.fetesImposees);
V('le vendredi-dimanche imposé au même binôme est un seul week-end (même binôme les deux nuits)', meme(A.G['2027-12-31'], A.G['2028-01-02']));
V('la nuit imposée malgré une indisponibilité est signalée au comité',
  A.rep && A.rep.warnings.some(w => /Fêtes imposées : AUBERT posé le 2027-12-26 malgré/.test(w)), A.rep && A.rep.warnings.filter(w => /Fêtes/.test(w)));
V('aucune nuit sans binôme', A.rep && A.rep.sansBinome === 0);

console.log('\n═══ 2. Contre-preuve : sans l\'onglet, la rotation choisit d\'autres binômes ═══');
const B = generer(null, { AUBERT: { '2027-12-26': 'INDISPO' } });
const diff = Object.keys(ATTENDU).filter(d => !meme(B.G[d], ATTENDU[d]));
V('SANS l\'onglet, au moins une nuit diffère du scénario (sinon le test 1 ne prouve rien)', diff.length > 0, diff);
V('sans l\'onglet, aucune nuit imposée annoncée', B.rep && !B.rep.fetesImposees);

console.log('\n═══ 3. Une ligne illisible est signalée, pas imposée en silence ═══');
const C = generer([['24/12/2027', 'XYZ', 'ORVAL'], ['25/12/2027', 'ME', 'DU']]);
V('le binôme non reconnu est signalé', C.rep && C.rep.warnings.some(w => /binôme non reconnu le 2027-12-24/.test(w)), C.rep && C.rep.warnings.filter(w => /Fêtes/.test(w)));
V('la ligne valable est imposée', meme(C.G['2027-12-25'], ['MERCIER', 'DURAND']) && C.rep.fetesImposees === 1, C.G['2027-12-25']);

console.log(`\n${ok} réussite(s), ${ko} échec(s)`);
if (ko) process.exit(1);
