/* ═══ BANC — FIN DE CALCUL : SOUHAITS ET GARDES À DEUX JOURS, PAR ÉCHANGE NEUTRE (09/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Audit du 09/11/2026, jour de la génération 2027 : une recherche systématique
   des échanges neutres sur le planning calculé (indispos réelles) a trouvé ce
   que l'algorithme laissait de côté :
   • 3 souhaits qu'un simple échange accordait sans rien coûter à personne
     (2 pour un MAR à 14 sur 16 possibles, 1 pour un MAR à 32 sur 34) ;
   • des gardes « garde, repos, garde » non souhaitées, supprimables sans rien
     coûter (2 sur les 4 hors unités voulues ; les autres sont bloquées par les
     règles dures — départ en vacances, jour de confort).
   Deux passes finales (8quater et 8quinquies) font désormais ces échanges : même
   rôle, contribution identique sur tous les axes d'équité.

   CE QUE CES VÉRIFICATIONS TIENNENT (effectif fictif, simulateur/demographie.js).
   1. Année 8 : compteurs et écarts d'équité IDENTIQUES à un générateur sans
      ces passes ; plus de souhaits accordés ; moins de gardes à deux jours ;
      aucune nuit sans binôme ; aucune règle dure enfreinte.
   2. Contre-preuves séparées : sans la passe des souhaits, moins de souhaits ;
      sans le lissage, plus de gardes à deux jours.
   3. Six années : l'équité ne bouge jamais, les souhaits ne baissent jamais,
      les gardes à deux jours n'augmentent jamais.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path'), fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const D = require(path.join(__dirname, '..', 'simulateur', 'demographie.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const BOUCLE_S = "      for(let _p=0;_p<4;_p++){\n        let _chg=false;\n        const cand=[];";
const BOUCLE_L = "      for(let _p=0;_p<4;_p++){\n        let _chg=false;\n        for(const X of gardeDoctors){";
V('la passe des souhaits est présente dans le générateur', SRC.split(BOUCLE_S).length === 2);
V('la passe de lissage est présente dans le générateur', SRC.split(BOUCLE_L).length === 2);
const coupe = (src, b) => src.split(b).join(b.replace('_p<4', '_p<0'));
const SANS_S = coupe(SRC, BOUCLE_S), SANS_L = coupe(SRC, BOUCLE_L), SANS = coupe(SANS_S, BOUCLE_L);

function grille(ss) {
  const sh = ss.getSheetByName('GARDES_' + YEAR); if (!sh) return null;
  const rows = sh._rows, ent = rows[2] || [], mois = rows[0] || [];
  const MOIS = { Janvier: 1, 'Février': 2, Mars: 3, Avril: 4, Mai: 5, Juin: 6, Juillet: 7, 'Août': 8, Septembre: 9, Octobre: 10, Novembre: 11, 'Décembre': 12 };
  let m = null, an = YEAR, prev = 0; const dates = [];
  for (let c = 1; c < ent.length; c++) {
    const lm = String(mois[c] || '').trim().split(' ')[0];
    if (MOIS[lm]) { const mm = MOIS[lm]; if (prev && mm < prev) an++; m = mm; prev = mm; }
    const j = parseInt(String(ent[c]).replace(/\D/g, ''), 10);
    dates.push(m && j ? `${an}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null);
  }
  const g = {};
  for (let r = 3; r < rows.length; r++) { const id = rows[r][0]; if (!id) continue; g[id] = new Set();
    dates.forEach((d, i) => { const v = String(rows[r][i + 1] || '').trim(); if (d && (v === 'G' || v === 'G2')) g[id].add(d); }); }
  return g;
}
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dow = s => new Date(s + 'T12:00:00').getDay();
/* Gardes à deux jours, hors unités voulues (vendredi-dimanche, jeudi férié +
   samedi, samedi + lundi férié) et hors paires souhaitées toutes deux. */
function serrees(G, im, feries) {
  let n = 0;
  Object.keys(G).forEach(id => G[id].forEach(d => {
    const x = addD(d, 2); if (!G[id].has(x)) return;
    const unite = (dow(d) === 5) || (dow(d) === 4 && feries.has(d)) || (dow(d) === 6 && feries.has(x));
    const souh = (im[id] || {})[d] === 'SOUHAIT' && (im[id] || {})[x] === 'SOUHAIT';
    if (!unite && !souh) n++;
  }));
  return n;
}
function monde(k) {
  const roster = D.buildRoster(YEAR, { ageExempt: 60, ageRetraite: 67 });
  const im = D.buildAbsences(YEAR, roster, k, { souhaitsEtendus: true });
  return { roster, im };
}
function lancer(src, w) {
  const mk = () => h.makeSpreadsheet([
    h.makeSheet('MEDECINS', h.medecinsRows(w.roster)),
    h.makeSheet(`INDISPOS_${YEAR}`, h.indisposRows(YEAR, w.roster, w.im)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
    h.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx0 = h.buildContext(mk(), [], src);
  const r = ctx0.generateGardes(YEAR, { dryRun: true, tirage: 1 });
  const ss = mk(); const ctx = h.buildContext(ss, [], src); ctx.generateGardes(YEAR, { tirage: 1 });
  const feries = new Set([...ctx.getJoursFeries(YEAR), ...ctx.getJoursFeries(YEAR + 1)]);
  const G = grille(ss);
  const inv = A.checkInvariants(A.parsePlanning(ss, YEAR), { indisposMap: w.im, ctxFeries: feries, roster: w.roster });
  return { r, G, feries, inv };
}
const cles = r => JSON.stringify(Object.keys(r.compteurs).sort().map(id => { const c = r.compteurs[id]; return [id, c.total, c.sam, c.jeu, c.vd, c.vjf, c.g, c.g2]; }));
const hon = r => Object.values(r.souhaits).reduce((t, o) => t + o.honores, 0);

console.log('\n═══ 1. Année 8 : plus de souhaits, moins de gardes à deux jours, équité identique ═══');
const W8 = monde(8);
const N = lancer(SRC, W8), Z = lancer(SANS, W8);
V('compteurs d\'équité identiques MAR par MAR (total, samedis, jeudis, ven-dim, veilles, G/G2)', cles(N.r) === cles(Z.r));
V('écarts d\'équité identiques', JSON.stringify(N.r.ecarts) === JSON.stringify(Z.r.ecarts), { avec: N.r.ecarts, sans: Z.r.ecarts });
V('fériés tenus identiques MAR par MAR', JSON.stringify(N.r.jf) === JSON.stringify(Z.r.jf));
V('plus de souhaits accordés qu\'avant', hon(N.r) > hon(Z.r), { avec: hon(N.r), sans: hon(Z.r) });
const sN = serrees(N.G, W8.im, N.feries), sZ = serrees(Z.G, W8.im, Z.feries);
V('moins de gardes à deux jours non souhaitées qu\'avant', sN < sZ, { avec: sN, sans: sZ });
V('aucune nuit sans binôme', N.r.sansBinome === 0);
V('aucune règle dure de plus enfreinte qu\'avant (contrôle indépendant du simulateur)', N.inv.errs.length <= Z.inv.errs.length, { avec: N.inv.errs.slice(0, 4), sans: Z.inv.errs.length });

console.log('\n═══ 2. Contre-preuves, passe par passe ═══');
const S = lancer(SANS_S, W8), L = lancer(SANS_L, W8);
V('sans la passe des souhaits : moins de souhaits accordés', hon(S.r) < hon(N.r), { sans: hon(S.r), avec: hon(N.r) });
V('sans le lissage : plus de gardes à deux jours', serrees(L.G, W8.im, L.feries) > sN, { sans: serrees(L.G, W8.im, L.feries), avec: sN });

console.log('\n═══ 3. Six années : jamais de recul ═══');
let eqOk = true, shOk = true, j2Ok = true; const det = [];
for (const k of [1, 2, 3, 4, 5, 6]) {
  const w = monde(k), a = lancer(SRC, w), b = lancer(SANS, w);
  if (cles(a.r) !== cles(b.r) || JSON.stringify(a.r.ecarts) !== JSON.stringify(b.r.ecarts)) { eqOk = false; det.push('équité ' + k); }
  if (hon(a.r) < hon(b.r)) { shOk = false; det.push('souhaits ' + k); }
  if (serrees(a.G, w.im, a.feries) > serrees(b.G, w.im, b.feries)) { j2Ok = false; det.push('serrées ' + k); }
}
V('équité identique sur les six années', eqOk, det);
V('souhaits jamais en baisse', shOk, det);
V('gardes à deux jours jamais en hausse', j2Ok, det);

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
