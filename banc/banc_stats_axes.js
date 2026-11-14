/* ═══ BANC — TOUS LES AXES DANS LES STATISTIQUES (14/11/2026) ═══════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Le générateur équilibre les week-ends, les week-ends d'été et vise, sur
   chaque compteur, la part exacte moins le report des années passées (la
   fourchette). Ces trois choses n'étaient pas écrites dans l'onglet des
   statistiques : impossible de vérifier l'équité à la main depuis le classeur.

   LA RÈGLE. Onze colonnes ajoutées EN FIN de ligne (aucune colonne lue par
   position ne bouge) : WE, CIBLE WE, PART EXACTE WE, ETE, PART EXACTE ETE,
   PART VISEE (total), PART VISEE SAM / JEU / VD / VJF / JF.
   WE = SAM + DIM de la même ligne ; ETE = samedis et dimanches de
   juillet-août tenus ; la part d'été = été tenu par l'équipe × cible WE du
   MAR ÷ cibles WE de l'équipe (la règle de la dernière passe) ; sans report
   des années passées, la part visée égale la part exacte.
   Le planning ne change pas : seule l'écriture s'ajoute.

   Effectif synthétique uniquement (simulateur/) : aucun nom réel.
   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const NOUVELLES = ['WE', 'CIBLE WE', 'PART EXACTE WE', 'ETE', 'PART EXACTE ETE',
  'PART VISEE', 'PART VISEE SAM', 'PART VISEE JEU', 'PART VISEE VD', 'PART VISEE VJF', 'PART VISEE JF'];
function generer(src) {
  const roster = H.defaultRoster();
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = H.buildContext(ss, [], src); ctx.generateGardes(YEAR, { tirage: 1 });
  return { st: ss.getSheetByName(`STATS_GARDES_${YEAR}`)._rows, gr: ss.getSheetByName(`GARDES_${YEAR}`)._rows };
}
const A = generer(SRC);
const h = A.st[0], L = A.st.slice(1).filter(r => r[0]);
const col = (r, n) => r[h.indexOf(n)];
const num = v => v === '' ? null : Number(v);

console.log('\n═══ 1. Les onze colonnes, en fin de ligne ═══');
V('les 33 premières colonnes n\'ont pas bougé', h[0] === 'MEDECIN' && h[1] === 'CIBLE' && h[17] === 'CIBLE SAM' && h[19] === 'CIBLE VD'
  && h[20] === 'VD' && h[22] === 'CIBLE JF' && h[31] === 'SOUHAITS POSSIBLES' && h[32] === 'SOUHAITS POSSIBLES OBTENUS', h.slice(0, 33));
V('les onze colonnes suivent, dans l\'ordre', JSON.stringify(h.slice(33)) === JSON.stringify(NOUVELLES), h.slice(33));
V('chaque ligne a la largeur de l\'en-tête', L.every(r => r.length === h.length), L.map(r => r.length));

console.log('\n═══ 2. Les week-ends ═══');
const gardiens = L.filter(r => num(col(r, 'TOTAL G')) > 0 && num(col(r, 'PART EXACTE ETE')) !== null);
V('il y a des MAR de garde à contrôler', gardiens.length >= 10, gardiens.length);
V('WE = SAM + DIM, sur chaque ligne', L.every(r => col(r, 'WE') === col(r, 'SAM') + col(r, 'DIM')),
  L.filter(r => col(r, 'WE') !== col(r, 'SAM') + col(r, 'DIM')).map(r => [r[0], col(r, 'WE'), col(r, 'SAM'), col(r, 'DIM')]));
V('part exacte WE = part exacte SAM + part exacte VD', gardiens.every(r => Math.abs(num(col(r, 'PART EXACTE WE')) - num(col(r, 'PART EXACTE SAM')) - num(col(r, 'PART EXACTE VD'))) < 0.002));
V('la cible WE est l\'arrondi de la part exacte WE (à 1 près)', gardiens.every(r => Math.abs(col(r, 'CIBLE WE') - num(col(r, 'PART EXACTE WE'))) < 1));

console.log('\n═══ 3. L\'été ═══');
const eteTot = gardiens.reduce((t, r) => t + col(r, 'ETE'), 0), weTot = gardiens.reduce((t, r) => t + col(r, 'CIBLE WE'), 0);
V('l\'été est compté (des week-ends de juillet-août sont tenus)', eteTot > 0, eteTot);
V('ETE ≤ WE sur chaque ligne', L.every(r => col(r, 'ETE') <= col(r, 'WE')));
V('part d\'été = été de l\'équipe × cible WE ÷ cibles WE', gardiens.every(r => Math.abs(num(col(r, 'PART EXACTE ETE')) - eteTot * col(r, 'CIBLE WE') / weTot) < 0.002));
V('les parts d\'été de l\'équipe font l\'été tenu', Math.abs(gardiens.reduce((t, r) => t + num(col(r, 'PART EXACTE ETE')), 0) - eteTot) < 0.05);
/* contre-preuve : recompter l'été dans la grille finale */
{
  /* grille : ligne 0 = mois (porté vers la droite), ligne 1 = lettre du jour */
  const g = A.gr, mois = [], lettre = g[1]; let m = '';
  g[0].forEach((v, j) => { if (j && v) m = String(v); mois[j] = m; });
  const parMar = {}; g.slice(3).forEach(r => { if (!r[0]) return; let n = 0; r.forEach((v, j) => { if (!j) return;
    if ((lettre[j] === 'S' || lettre[j] === 'D') && /^(Juillet|Août)$/.test(mois[j]) && /^G2?$/.test(String(v))) n++; }); parMar[r[0]] = n; });
  const dif = L.filter(r => parMar[r[0]] !== undefined && parMar[r[0]] !== col(r, 'ETE')).map(r => [r[0], col(r, 'ETE'), parMar[r[0]]]);
  V('contre-preuve : ETE = samedis et dimanches de juillet-août lus dans la grille', Object.keys(parMar).length > 0 && dif.length === 0, dif);
}

console.log('\n═══ 4. La part visée ═══');
V('sans report des années passées, part visée = part exacte, sur les six axes', gardiens.every(r =>
  [['PART VISEE', 'PART EXACTE'], ['PART VISEE SAM', 'PART EXACTE SAM'], ['PART VISEE JEU', 'PART EXACTE JEU'], ['PART VISEE VD', 'PART EXACTE VD'],
   ['PART VISEE VJF', 'PART EXACTE VJF'], ['PART VISEE JF', 'PART EXACTE JF']].every(([a, b]) => Math.abs(num(col(r, a)) - num(col(r, b))) < 0.002)),
  gardiens.map(r => [r[0], col(r, 'PART VISEE'), col(r, 'PART EXACTE')]));

console.log('\n═══ 5. Le planning ne change pas ═══');
{
  const i = SRC.indexOf('/* (14/11/2026) TOUS LES AXES DANS LES STATISTIQUES.');
  V('le bloc d\'écriture est repérable', i > 0);
  /* contre-preuve : l'ancien en-tête (33 colonnes), même calcul */
  const ancien = SRC.replace(/const STATS_COLS=\[([^\]]*'SOUHAITS POSSIBLES OBTENUS'),\s*'WE'[^\]]*\];/, 'const STATS_COLS=[$1];')
    .replace(/_sp\(id\)\.utiles,\s*_weDe\[id\][\s\S]*?_vi\('jf'\)\];/, '_sp(id).utiles];');
  V('contre-preuve montée : l\'ancien en-tête est reconstitué', ancien !== SRC && ancien.indexOf("'PART VISEE JF'") < 0);
  const B = generer(ancien);
  V('contre-preuve : l\'ancienne version écrit 33 colonnes', B.st[0].length === 33, B.st[0].length);
  V('même grille de gardes, case pour case', JSON.stringify(A.gr) === JSON.stringify(B.gr));
  V('mêmes 33 premières colonnes de statistiques', JSON.stringify(A.st.map(r => r.slice(0, 33))) === JSON.stringify(B.st));
}

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
