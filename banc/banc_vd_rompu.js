/* ═══ BANC — VENDREDI-DIMANCHE ROMPU : ON GARDE LES MAR DE L'AUTRE JOUR (07/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Quand moins de deux MAR sont libres le vendredi ET le dimanche, le générateur
   casse l'unité (« VD exception ») et pose chaque jour seul. Le jour restant
   était alors choisi sans regarder qui tenait l'autre : sur les indispos réelles
   2027, les 4 week-ends cassés mobilisaient chacun 4 MAR au lieu de 2.
   Règle du responsable (07/11/2026) : garder un MAR de l'autre jour, ou les
   deux, plutôt que d'en prendre de nouveaux. Mesuré après correctif sur les
   mêmes indispos : 1 seul week-end encore cassé (3 MAR), équité inchangée.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Dimanche posé APRÈS le vendredi : le MAR libre les deux jours est gardé.
   2. Dimanche posé AVANT le vendredi (souhait) : le vendredi garde les MAR du
      dimanche — la règle marche dans les deux sens.
   3. Les règles dures ne cèdent pas : le MAR gardé n'est jamais de garde la
      veille ou le lendemain, et jamais sur une absence.
   5. Réparation finale (07/11/2026) : week-ends réunis après l'optimiseur,
      compteurs d'équité et souhaits identiques à un générateur sans elle.
   4. Contre-preuve : le générateur d'avant le correctif ne garde personne
      dans le cas 1 — le test échoue bien sans la règle.
   Mesure sur les indispos réelles 2027 (07/11/2026) : avant, 4 week-ends cassés
   à 4 MAR chacun (19/02, 05/03, 30/04, 23/07) ; après, 1 seul (19/02, 3 MAR).

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const YEAR = 2027;
const VEN = '2027-03-12', SAM = '2027-03-13', DIM = '2027-03-14', LUN = '2027-03-15';

function grilleDe(ss) {
  const sh = ss.getSheetByName('GARDES_' + YEAR); if (!sh) return null;
  const rows = sh._rows, ent = rows[2] || [], mois = rows[0] || [];
  const MOIS = { Janvier: 1, 'Février': 2, Mars: 3, Avril: 4, Mai: 5, Juin: 6, Juillet: 7,
                 'Août': 8, Septembre: 9, Octobre: 10, Novembre: 11, 'Décembre': 12 };
  let m = null, an = YEAR, prev = 0; const dates = [];
  for (let c = 1; c < ent.length; c++) {
    const lm = String(mois[c] || '').trim().split(' ')[0];
    if (MOIS[lm]) { const mm = MOIS[lm]; if (prev && mm < prev) an++; m = mm; prev = mm; }
    const j = parseInt(String(ent[c]).replace(/\D/g, ''), 10);
    dates.push(m && j ? `${an}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null);
  }
  const g = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; g[id] = {};
    dates.forEach((d, i) => { const v = String(rows[r][i + 1] || '').trim(); if (d && v) g[id][d] = v; }); }
  return g;
}
const deGarde = (G, d) => Object.keys(G).filter(id => G[id][d] === 'G' || G[id][d] === 'G2').sort();

/* Le monde : un seul MAR (AUBERT) libre le vendredi ET le dimanche ; les autres
   libres sont libres l'un OU l'autre jour. Tous les autres MAR de garde sont
   indisponibles ces deux jours (mais libres le samedi, pour que le samedi reste
   pourvu). L'unité vendredi-dimanche doit donc casser. Le jour « large » compte
   assez de candidats pour que, SANS la règle, l'équité choisisse quelqu'un
   d'autre qu'AUBERT (qui vient de garder deux jours avant : pénalité
   d'espacement) — c'est ce qui rend la contre-preuve parlante. */
const V_ETROIT = ['AUBERT', 'DURAND'], D_LARGE = ['AUBERT', 'FAUVEL', 'GARNIER', 'GAUTIER', 'LEBRUN'];
const V_LARGE = ['AUBERT', 'DURAND', 'CHAPUIS', 'MERCIER', 'ORVAL'], D_ETROIT = ['AUBERT', 'FAUVEL'];
function monde(lv, ld, extra) {
  const roster = h.defaultRoster();
  const libresV = new Set(lv), libresD = new Set(ld);
  const im = {};
  roster.forEach(([id, p, q, f]) => {
    if (f.noGarde) return;
    im[id] = {};
    if (!libresV.has(id)) im[id][VEN] = 'INDISPO';
    if (!libresD.has(id)) im[id][DIM] = 'INDISPO';
  });
  if (extra) extra(im);
  return { roster, im };
}

/* ═══ 1. Dimanche posé après le vendredi ═══════════════════════════════ */
console.log('\n═══ 1. Vendredi-dimanche cassé : le dimanche garde le MAR du vendredi ═══');
let G1 = null;
{
  const { roster, im } = monde(V_ETROIT, D_LARGE);
  const r = h.runScenario({ year: YEAR, roster, indisposMap: im });
  V('la génération aboutit', !r.error, r.error);
  G1 = grilleDe(r.ss);
  if (G1) {
    const v = deGarde(G1, VEN), d = deGarde(G1, DIM);
    V('le vendredi est tenu par les deux seuls libres (AUBERT + DURAND)', JSON.stringify(v) === '["AUBERT","DURAND"]', v);
    V('AUBERT, libre les deux jours, garde aussi le dimanche', d.indexOf('AUBERT') >= 0, d);
    const mobilises = new Set(v.concat(d)).size;
    V('3 MAR mobilisés sur le week-end, pas 4', mobilises === 3, { v, d });
    V('le samedi reste pourvu (2 MAR)', deGarde(G1, SAM).length === 2, deGarde(G1, SAM));
    V('AUBERT est en repos le samedi, entre ses deux gardes', G1.AUBERT[SAM] === 'RG', G1.AUBERT[SAM]);
    V('AUBERT n\'est pas de garde le lundi (jamais deux gardes d\'affilée)', ['G', 'G2'].indexOf(G1.AUBERT[LUN]) < 0, G1.AUBERT[LUN]);
  }
}

/* ═══ 2. Dimanche posé avant le vendredi (souhait) ═════════════════════ */
console.log('\n═══ 2. Dimanche posé en premier : le vendredi garde les MAR du dimanche ═══');
{
  /* AUBERT souhaite le dimanche : le dimanche est posé AVANT le placement
     chronologique du vendredi. La règle doit marcher dans ce sens aussi. */
  const { roster, im } = monde(V_LARGE, D_ETROIT, m => { m.AUBERT[DIM] = 'SOUHAIT'; });
  const r = h.runScenario({ year: YEAR, roster, indisposMap: im });
  V('la génération aboutit', !r.error, r.error);
  const G = grilleDe(r.ss);
  if (G) {
    const v = deGarde(G, VEN), d = deGarde(G, DIM);
    V('AUBERT tient le dimanche souhaité', d.indexOf('AUBERT') >= 0, d);
    V('…et AUBERT tient aussi le vendredi', v.indexOf('AUBERT') >= 0, v);
    V('3 MAR mobilisés sur le week-end, pas 4', new Set(v.concat(d)).size === 3, { v, d });
  }
}

/* ═══ 3. Les règles dures ne cèdent pas ═════════════════════════════════ */
console.log('\n═══ 3. Le MAR gardé n\'enfreint aucune règle dure ═══');
{
  /* AUBERT absent le lundi : son repos de garde du dimanche tomberait sur une
     absence. Il ne doit PAS être gardé le dimanche, même avec la règle. */
  const { roster, im } = monde(V_ETROIT, D_LARGE, m => { m.AUBERT[LUN] = 'VAC'; });
  const r = h.runScenario({ year: YEAR, roster, indisposMap: im });
  V('la génération aboutit', !r.error, r.error);
  const G = grilleDe(r.ss);
  if (G) {
    const d = deGarde(G, DIM);
    V('AUBERT, en vacances le lundi, n\'est pas mis de garde le dimanche', d.indexOf('AUBERT') < 0, d);
    V('le dimanche reste pourvu par deux autres libres', d.length === 2, d);
  }
}

/* ═══ 4. Contre-preuve : sans la règle, personne n'est gardé ════════════ */
console.log('\n═══ 4. Contre-preuve sur le générateur d\'avant le correctif ═══');
{
  let ancien = null;
  try {
    ancien = execSync('git show 67920ea:gas/generateur_gardes.gs', { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { ancien = null; }
  if (!ancien) { V('version d\'avant le correctif lisible dans l\'historique (clone complet requis)', false); }
  else {
    const essai = (lv, ld, extra) => {
      const { roster, im } = monde(lv, ld, extra);
      const ss = h.makeSpreadsheet([
        h.makeSheet('MEDECINS', h.medecinsRows(roster)),
        h.makeSheet(`INDISPOS_${YEAR}`, h.indisposRows(YEAR, roster, im)),
        h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
        h.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
      ]);
      const ctx = h.buildContext(ss, [], ancien);
      let err = null; try { ctx.generateGardes(YEAR); } catch (e) { err = e.message; }
      return { err, G: grilleDe(ss) };
    };
    const a1 = essai(V_ETROIT, D_LARGE);
    const d1 = a1.G ? deGarde(a1.G, DIM) : [], v1 = a1.G ? deGarde(a1.G, VEN) : [];
    V('cas 1 sans la règle : 4 MAR mobilisés, AUBERT pas gardé le dimanche (le test discrimine)',
      !a1.err && d1.length === 2 && d1.indexOf('AUBERT') < 0 && new Set(v1.concat(d1)).size === 4, { err: a1.err, v1, d1 });
    /* Le cas 2 n'a pas de contre-preuve : sans la règle, l'équité choisit déjà
       AUBERT le vendredi dans ce monde — on ne peut pas montrer l'écart ici.
       L'effet se voit sur les indispos réelles 2027 : les week-ends du 05/03 et
       du 23/07, dimanche posé en premier, passent de 4 MAR à 2. */
  }
}

/* ═══ 5. Réparation finale : réunir les week-ends cassés, équité intacte ═══
   (07/11/2026) La règle du placement ne tenait pas : l'optimiseur et les
   échanges déplacent vendredi et dimanche séparément. Une passe finale échange
   un dimanche contre un lun/mar/mer du même rôle : aucun axe d'équité ne bouge.
   Effectif fictif saturé (simulateur/demographie.js, année 6 : 6 week-ends
   cassés), comparé au même générateur privé de cette passe. */
console.log('\n═══ 5. Réparation finale : week-ends réunis, équité et souhaits intacts ═══');
{
  const D = require(path.join(__dirname, '..', 'simulateur', 'demographie.js'));
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
  const CLE = "    if(NOUVEL_ALGO){\n      const _slotDe=";
  V('la passe de réparation est présente dans le générateur', SRC.split(CLE).length === 2);
  const SANS = SRC.split(CLE).join("    if(false){\n      const _slotDe=");
  const roster = D.buildRoster(YEAR, { ageExempt: 60, ageRetraite: 67 });
  const im = D.buildAbsences(YEAR, roster, 6, { souhaitsEtendus: true });
  const run = src => {
    const mk = () => h.makeSpreadsheet([
      h.makeSheet('MEDECINS', h.medecinsRows(roster)),
      h.makeSheet(`INDISPOS_${YEAR}`, h.indisposRows(YEAR, roster, im)),
      h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
      h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
    const r = h.buildContext(mk(), [], src).generateGardes(YEAR, { dryRun: true, tirage: 1 });
    const ss = mk(); h.buildContext(ss, [], src).generateGardes(YEAR, { tirage: 1 });
    return { r, G: grilleDe(ss) };
  };
  const A = run(SRC), B = run(SANS);
  const cles = r => JSON.stringify(Object.keys(r.compteurs).sort().map(id => { const c = r.compteurs[id];
    return [id, c.total, c.sam, c.jeu, c.vd, c.vjf, c.jf, c.g, c.g2]; }));
  const hon = r => Object.values(r.souhaits).reduce((t, o) => t + o.honores, 0);
  /* Nombre de MAR mobilisés sur les week-ends cassés (vendredi ≠ dimanche). */
  const mobil = G => { let n = 0, k = 0; const ids = Object.keys(G);
    const jours = [...new Set([].concat(...ids.map(id => Object.keys(G[id]))))].filter(d => new Date(d + 'T12:00:00').getDay() === 5);
    jours.forEach(f => { const dd = new Date(f + 'T12:00:00'); dd.setDate(dd.getDate() + 2);
      const s = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
      const v = deGarde(G, f), d = deGarde(G, s); if (v.length !== 2 || d.length !== 2) return;
      if (JSON.stringify(v) !== JSON.stringify(d)) { k++; n += new Set(v.concat(d)).size; } });
    return { casses: k, mar: n }; };
  const w = A.r.warnings.filter(x => /Vendredi-dimanche rompu : \d+ échange/.test(x));
  V('la réparation a joué sur cette année (au moins un échange)', w.length === 1, A.r.warnings.filter(x => /rompu/.test(x)));
  V('compteurs d\'équité identiques MAR par MAR (total, samedis, jeudis, ven-dim, veilles, fériés, G/G2)', cles(A.r) === cles(B.r));
  V('écarts d\'équité identiques', JSON.stringify(A.r.ecarts) === JSON.stringify(B.r.ecarts), { avec: A.r.ecarts, sans: B.r.ecarts });
  V('souhaits honorés identiques', hon(A.r) === hon(B.r), { avec: hon(A.r), sans: hon(B.r) });
  V('toujours aucune nuit sans binôme', A.r.sansBinome === 0);
  const mA = A.G ? mobil(A.G) : null, mB = B.G ? mobil(B.G) : null;
  V('moins de MAR mobilisés sur les week-ends cassés que sans la réparation (contre-preuve)',
    mA && mB && mA.mar < mB.mar, { avec: mA, sans: mB });
}

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
