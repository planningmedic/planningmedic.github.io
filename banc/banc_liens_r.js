/* ═══ BANC — LIENS_R : le lien samedi → récupération est enregistré ═══
   (13/08/2026 — échanges de gardes, lot 1.) Jusqu'ici le couple « samedi
   tenu → date du R posé » n'existait qu'en mémoire pendant la génération.
   Le générateur écrit désormais LIENS_R_{année} : une ligne par (samedi,
   tenant). C'est la fondation du transfert automatique de R quand un
   samedi change de mains (phase 3 du cycle d'échange).

   Ce scénario exécute le VRAI generateur_gardes.gs (via le harnais du
   simulateur) sur une année complète, puis confronte l'onglet écrit à la
   grille GARDES : rien n'est cru sur parole, tout est recompté. */
const path = require('path');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const YEAR = 2027;
console.log('\n═══ 1. Génération réelle ' + YEAR + ' : l\'onglet LIENS_R existe et a la bonne forme ═══');
const { ss, error } = h.runScenario({ year: YEAR });
V('la génération aboutit sans erreur', !error, error);

const lr = ss.getSheetByName('LIENS_R_' + YEAR);
V('l\'onglet LIENS_R_' + YEAR + ' est écrit', !!lr);
const lignes = lr ? lr._rows : [];
V('l\'en-tête est SAMEDI / MEDECIN / DATE R',
  JSON.stringify(lignes[0]) === JSON.stringify(['SAMEDI', 'MEDECIN', 'DATE R']), lignes[0]);

/* ── Reconstruire la grille GARDES : {mar: {date: code}} ──────────────── */
const grille = {};                       // par MAR : date → code
const parDate = {};                      // par date : {mar: code}
{
  const g = ss.getSheetByName('GARDES_' + YEAR)._rows;
  const MOIS = { 'Janvier': 0, 'Février': 1, 'Mars': 2, 'Avril': 3, 'Mai': 4, 'Juin': 5,
    'Juillet': 6, 'Août': 7, 'Septembre': 8, 'Octobre': 9, 'Novembre': 10, 'Décembre': 11 };
  /* L'en-tête ne porte que le NOM du mois (« Janvier »), répété à chaque
     semaine, jamais l'année. L'année de départ est celle du planning ; elle
     s'incrémente quand le mois REDESCEND (Décembre → Janvier de l'an
     d'après : le planning 2027 court jusqu'au premier dimanche de 2028). */
  const dates = [];                      // date de chaque colonne
  let m = null, y = YEAR;
  for (let c = 1; c < g[0].length; c++) {
    const ent = String(g[0][c] || '').trim();
    if (ent && MOIS[ent] !== undefined) { if (m !== null && MOIS[ent] < m) y++; m = MOIS[ent]; }
    const j = Number(g[2][c]);
    if (m === null || !Number.isFinite(j) || j < 1) { dates[c] = null; continue; }
    dates[c] = new Date(y, m, j, 12).toISOString().slice(0, 10);
  }
  for (let r = 3; r < g.length; r++) {
    const id = String(g[r][0] || '').trim(); if (!id) continue;
    grille[id] = {};
    for (let c = 1; c < g[r].length; c++) {
      if (!dates[c]) continue;
      const v = String(g[r][c] || '').toUpperCase(); if (!v) continue;
      grille[id][dates[c]] = v;
      (parDate[dates[c]] = parDate[dates[c]] || {})[id] = v;
    }
  }
}

console.log('\n═══ 2. Chaque ligne dit vrai : garde tenue au samedi, R posé à la date écrite ═══');
const liens = lignes.slice(1).filter(l => l && l[0]);
/* NB : un R peut être ANTICIPÉ (posé avant son samedi). Comportement voulu
   du générateur : quand la fenêtre 2–16 semaines après le samedi est mangée
   par les vacances scolaires ou la fin d'année, la passe de repli pose le R
   sur n'importe quel jour de semaine libre de l'année — y compris avant.
   Le vrai invariant : le R vit dans l'année de planning, en semaine. */
let samediOK = 0, gardeOK = 0, rOK = 0, anneeOK = 0, semaineOK = 0;
liens.forEach(([sam, id, dR]) => {
  const dt = new Date(sam + 'T12:00:00');
  if (dt.getDay() === 6) samediOK++;
  if (/^G2?$/.test(grille[id] && grille[id][sam] || '')) gardeOK++;
  if ((grille[id] && grille[id][dR]) === 'R') rOK++;
  if (String(dR).indexOf(String(YEAR)) === 0) anneeOK++;
  const dow = new Date(dR + 'T12:00:00').getDay();
  if (dow >= 1 && dow <= 5) semaineOK++;
});
V('chaque SAMEDI de l\'onglet est un vrai samedi (' + samediOK + '/' + liens.length + ')', samediOK === liens.length);
V('chaque MEDECIN tient bien G ou G2 ce samedi-là dans la grille (' + gardeOK + '/' + liens.length + ')', gardeOK === liens.length);
V('chaque DATE R porte bien un R de ce MAR dans la grille (' + rOK + '/' + liens.length + ')', rOK === liens.length);
V('le R reste dans l\'année de planning ' + YEAR, anneeOK === liens.length, liens.length - anneeOK);
V('le R tombe toujours en semaine (lun–ven)', semaineOK === liens.length, liens.length - semaineOK);

console.log('\n═══ 3. Rien ne manque, rien n\'est en trop : le compte est une bijection ═══');
/* Tous les (samedi, tenant) de la grille — y compris G2 — doivent avoir leur ligne. */
const attendus = new Set();
Object.keys(parDate).forEach(d => {
  if (new Date(d + 'T12:00:00').getDay() !== 6) return;
  Object.keys(parDate[d]).forEach(id => { if (/^G2?$/.test(parDate[d][id])) attendus.add(d + '|' + id); });
});
const presents = new Set(liens.map(([s, id]) => s + '|' + id));
const manquants = [...attendus].filter(k => !presents.has(k));
const enTrop = [...presents].filter(k => !attendus.has(k));
V('chaque (samedi, tenant) de la grille a sa ligne — ' + attendus.size + ' attendus', manquants.length === 0, manquants.slice(0, 3));
V('aucune ligne fantôme (un lien sans garde dans la grille)', enTrop.length === 0, enTrop.slice(0, 3));
V('un samedi = deux lignes (G et G2), jamais plus, jamais moins',
  [...attendus].every(k => presents.has(k)) && liens.length === attendus.size, { liens: liens.length, attendus: attendus.size });

/* Chaque R de la grille est référencé UNE fois : autant de R que de liens,
   et pas deux liens vers le même R du même MAR. */
let totalR = 0;
Object.keys(grille).forEach(id => Object.keys(grille[id]).forEach(d => { if (grille[id][d] === 'R') totalR++; }));
V('autant de R dans la grille que de lignes dans l\'onglet (' + totalR + ')', totalR === liens.length, { totalR, liens: liens.length });
const cibles = liens.map(([, id, dR]) => id + '|' + dR);
V('jamais deux samedis pointant le même R du même MAR', new Set(cibles).size === cibles.length);

console.log('\n═══ 4. L\'archiveur emporte LIENS_R avec les autres onglets annuels ═══');
{
  const fs = require('fs'), src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
  const m = src.match(/const noms = \[([^\]]+)\]/);
  V('LIENS_R_ figure dans la liste des onglets archivés', !!m && m[1].indexOf("'LIENS_R_'") > -1, m && m[1]);
  V('l\'archiveur tolère un onglet absent (années d\'avant le lien)', /absent du maître/.test(src));
}

console.log('\n' + (ok) + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
