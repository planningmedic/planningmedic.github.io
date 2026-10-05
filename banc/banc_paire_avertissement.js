/* ═══ BANC — PAIRE À ÉVITER : AVERTIR QUAND LA RÈGLE CÈDE (05/10/2026) ════
   POURQUOI CE SCÉNARIO EXISTE.
   La règle des paires cède quand la couverture l'exige — c'est voulu : la
   couverture et l'équité priment. Mais elle cédait EN SILENCE. Constaté sur
   une campagne 2027 simulée (seuils de vacances +2) : un couple de garde
   ensemble un vendredi et un dimanche de juillet, parce qu'ils étaient les
   deux seuls disponibles ces deux jours-là, et aucun message nulle part. Le
   comité ne pouvait pas arbitrer ce qu'il ne voyait pas.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Quand la règle est FORCÉE à céder, un avertissement nomme la paire et
      toutes ses dates, en tête de liste (jamais coupé par la limite de 60).
   2. Le message dit EXACTEMENT ce que montre le planning : les dates annoncées
      sont celles où les deux sont de sortie ensemble (garde ou 18 h), ni plus
      ni moins, dates exemptées de Noël/An mises à part.
   3. Sans paire configurée, ou quand la règle tient, aucun message.
   4. Le planning n'est pas modifié : l'avertissement ne fait que parler.
   5. CONTRE-ÉPREUVE : le générateur d'avant, sur la même entrée, produit la
      même nuit en couple mais ne dit rien.

   Profils entièrement fictifs — le dépôt est public. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const PAIRE = ['ORVAL', 'VALLET'];
const CFG = [['PAIRES_A_EVITER', PAIRE.join('+')]];
const VEN = '2027-03-12', DIM = '2027-03-14';
const EXEMPTES = new Set([`${YEAR}-12-24`, `${YEAR}-12-25`, `${YEAR}-12-31`, `${YEAR + 1}-01-01`]);

function lancer({ config, forcer, genSource }) {
  const roster = H.defaultRoster();
  const ind = {};
  if (forcer) roster.forEach(([id]) => { if (PAIRE.indexOf(id) < 0) ind[id] = { [VEN]: 'INDISPO', [DIM]: 'INDISPO' }; });
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, ind)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']].concat(config || [])),
  ]);
  const logs = [];
  const ctx = H.buildContext(ss, logs, genSource);
  let res = null, error = null;
  try { res = ctx.generateGardes(YEAR); } catch (e) { error = e.message; }
  const w = (res && res.warnings) || [];
  return { ss, error, w, msg: w.filter(x => /^Paire à éviter/.test(x)), nb: res && res.nbWarnings };
}
// Dates où les deux membres de la paire sont de sortie ensemble, relevées sur la grille produite
function ensemble(r) {
  const P = A.parsePlanning(r.ss, YEAR), sortie = v => v === 'G' || v === 'G2' || v === '18';
  return P.dates.filter(d => !EXEMPTES.has(d)
    && sortie(P.byDoc[PAIRE[0]][d]) && sortie(P.byDoc[PAIRE[1]][d])
    && !(P.byDoc[PAIRE[0]][d] === '18' && P.byDoc[PAIRE[1]][d] === '18'));
}
const datesDuMessage = m => (m.match(/\d{4}-\d{2}-\d{2}/g) || []);

console.log('\n═══ 0. Le correctif est dans le code ═══');
V('le générateur émet « Paire à éviter : … »', /Paire à éviter : \$\{k\} ensemble/.test(SRC));

console.log('\n═══ 1. Règle forcée à céder : le comité est prévenu ═══');
const force = lancer({ config: CFG, forcer: true });
V('génération sans erreur', !force.error, force.error);
const Pf = A.parsePlanning(force.ss, YEAR);
V('le couple est bien de garde ensemble le vendredi forcé', [Pf.byDate[VEN].G, Pf.byDate[VEN].G2].sort().join() === PAIRE.slice().sort().join(),
  Pf.byDate[VEN]);
V('…et le dimanche (même binôme de week-end)', [Pf.byDate[DIM].G, Pf.byDate[DIM].G2].sort().join() === PAIRE.slice().sort().join(), Pf.byDate[DIM]);
V('un seul message pour cette paire', force.msg.length === 1, force.msg);
V('il nomme les deux médecins', force.msg[0] && force.msg[0].indexOf('ORVAL + VALLET') >= 0, force.msg[0]);
V('il est en tête de la liste des avertissements', force.w[0] === force.msg[0], force.w.slice(0, 2));
const vu = ensemble(force);
V('les dates annoncées sont exactement celles du planning', force.msg[0] && datesDuMessage(force.msg[0]).join() === vu.join(),
  { message: force.msg[0] && datesDuMessage(force.msg[0]), planning: vu });
V('aucune journée sans binôme', Pf.dates.every(d => Pf.byDate[d].G && Pf.byDate[d].G2));

console.log('\n═══ 2. Pas de message quand il n\'y a rien à dire ═══');
const sansCfg = lancer({ config: [], forcer: true });
V('sans paire configurée : aucun message de paire', sansCfg.msg.length === 0, sansCfg.msg);
const normal = lancer({ config: CFG, forcer: false });
V('règle active, année normale : message présent si et seulement si le planning a une nuit commune',
  (normal.msg.length > 0) === (ensemble(normal).length > 0), { msg: normal.msg, planning: ensemble(normal) });
V('…et ses dates sont celles du planning', normal.msg.length === 0 || datesDuMessage(normal.msg[0]).join() === ensemble(normal).join());

console.log('\n═══ 3. Contre-épreuve : le générateur d\'avant se taisait ═══');
const a = SRC.indexOf('  /* (05/10/2026) PAIRE À ÉVITER — AVERTIR'), b = SRC.indexOf('  // ── 11. Compteurs JF/Noël');
V('la copie sans correctif est bien différente', a > 0 && b > a);
const SRC_AVANT = SRC.slice(0, a) + SRC.slice(b);
const avant = lancer({ config: CFG, forcer: true, genSource: SRC_AVANT });
V('même entrée : le même planning, garde par garde',
  JSON.stringify(avant.ss.getSheetByName(`GARDES_${YEAR}`)._rows) === JSON.stringify(force.ss.getSheetByName(`GARDES_${YEAR}`)._rows));
V('…mais aucun avertissement de paire', avant.msg.length === 0, avant.msg);

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
