// ═══ ÉCHANGES « JOUR GAGNÉ AVANT VACANCES » — APPLIQUÉS ET VALIDÉS ═══
// Différence avec une simple estimation : les échanges sont RÉELLEMENT appliqués au
// planning produit par le vrai générateur, puis le planning modifié est repassé dans
// checkInvariants() du dépôt (les 7 règles dures) et les compteurs d'équité sont
// recomptés MAR par MAR et comparés à l'avant. Aucune tolérance : 0 erreur et 0 écart.
//
// Assouplissement demandé par Arthur (30/07) : le BÉNÉFICIAIRE accepte une garde à
// J±2 (pénalité d'espacement, pas une interdiction — cf. invariant 8). Le CÉDANT, lui,
// ne doit pas hériter d'un rapprochement qu'il n'a pas choisi.
//
// Usage : SCEN=0 node simulateur/echanges_rg_vacances.js >> /tmp/ech.jsonl
const H = require('./harness.js'), A = require('./analyse.js'), D = require('./demographie.js');
const SC = +(process.env.SCEN || 0), Y0 = +(process.env.Y0 || 2027), Y1 = +(process.env.Y1 || 2046);
const PLAFOND = +(process.env.PLAFOND || 2);

const dow = ds => new Date(ds + 'T12:00:00').getDay();
const addD = (ds, n) => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const estG = v => v === 'G' || v === 'G2';

// Maille d'équité : un échange n'est neutre que DANS le même type ET le même rôle.
function typeJour(ds, fer, vjf) {
  if (fer.has(ds)) return 'jf';
  if (vjf.has(ds)) return 'vjf';
  const d = dow(ds);
  if (d === 6) return 'sam';
  if (d === 5 || d === 0) return 'vd';
  if (d === 4) return 'jeu';
  return ['x', 'lun', 'mar', 'mer'][d];       // lundi/mardi/mercredi séparés : maille la plus fine
}

// Compteurs d'équité par MAR, recalculés depuis le planning (pas depuis STATS)
function compteurs(P, fer, vjf) {
  const c = {};
  Object.entries(P.byDoc).forEach(([id, days]) => {
    const o = { tot: 0, G: 0, G2: 0 };
    Object.entries(days).forEach(([d, v]) => {
      if (!estG(v)) return;
      o.tot++; o[v]++;
      const t = typeJour(d, fer, vjf);
      o[t] = (o[t] || 0) + 1;
    });
    c[id] = o;
  });
  return c;
}
const memeCompteurs = (a, b) => {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const x = a[id] || {}, y = b[id] || {};
    const ks = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of ks) if ((x[k] || 0) !== (y[k] || 0)) return `${id}.${k} ${x[k] || 0}→${y[k] || 0}`;
  }
  return null;
};

const out = { scen: SC, annees: [], tot: {} };
const add = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
let prev = null;

for (let y = Y0; y <= Y1; y++) {
  const roster = D.buildRoster(y, { ageExempt: 60, ageRetraite: 67 });
  const im = D.buildAbsences(y, roster, SC);
  const r = H.runScenario({ year: y, roster, indisposMap: im, statsPrev: prev });
  if (r.error) { out.annees.push({ y, err: r.error }); prev = null; continue; }
  prev = r.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(x => x.slice());

  const fer = new Set([...r.ctx.getJoursFeries(y), ...r.ctx.getJoursFeries(y + 1)]);
  const P = A.parsePlanning(r.ss, y);
  const dans = new Set(P.dates);
  const vjf = new Set(P.dates.filter(d => { const n = addD(d, 1); const w = dow(d); return w >= 1 && w <= 5 && fer.has(n); }));

  const ABS = new Set(['VAC', 'FORM', 'CL', 'TP', 'CTP', 'CP', 'A', 'INDISPO']);
  const indispo = (id, d) => ABS.has(String((im[id] || {})[d] || '').trim().toUpperCase());
  const flags = {}; roster.forEach(([id, p, q, f]) => flags[id] = f || {});
  const aG = (id, d) => estG((P.byDoc[id] || {})[d]);

  const avant = compteurs(P, fer, vjf);
  const avantPaires = (() => { const s = new Set(); Object.entries(P.byDoc).forEach(([id, dd]) => Object.keys(dd).forEach(x => {
    if (!estG(dd[x])) return; const z = addD(x, 2);
    if (estG(dd[z]) && !(dow(x) === 5 && dow(z) === 0)) s.add(id + '|' + x + '|' + z); })); return s; })();
  const invAvant = A.checkInvariants(P, { indisposMap: im, ctxFeries: fer, roster });

  // ── 1. Jour à libérer pour chaque bloc de vacances ──
  const jourCible = (id, debut) => {
    let j = addD(debut, -1), g = 0;
    while (g++ < 15) { const w = dow(j); if (w !== 0 && w !== 6 && !fer.has(j) && !indispo(id, j)) break; j = addD(j, -1); }
    return addD(j, -1);
  };
  const blocs = [];
  Object.keys(im).forEach(id => Object.keys(im[id]).sort().forEach(d => {
    if (String(im[id][d]).toUpperCase() !== 'VAC') return;
    if (String((im[id] || {})[addD(d, -1)] || '').toUpperCase() === 'VAC') return;
    blocs.push({ id, debut: d, D1: jourCible(id, d) });
  }));

  // gains déjà acquis (règle b : ne pas les reprendre au cédant)
  const gainDe = {};
  blocs.forEach(b => { if (aG(b.id, b.D1)) gainDe[b.id + '|' + b.D1] = true; });

  const S = { blocs: blocs.length };
  const demandes = [];
  blocs.forEach(b => {
    if (!dans.has(b.D1)) { add(S, 'ko_horsFenetre'); return; }
    const w = dow(b.D1);
    if (w < 1 || w > 4 || fer.has(b.D1) || vjf.has(b.D1)) { add(S, 'ko_horsFenetre'); return; }
    add(S, 'eligibles');
    if (aG(b.id, b.D1)) { add(S, 'dejaOk'); return; }
    demandes.push(b);
  });

  // ── 2. Application réelle des échanges ──
  const benef = {}, journal = [];
  demandes.sort((a, b) => a.D1 < b.D1 ? -1 : 1).forEach(x => {
    const Aid = x.id, Dn = x.D1;
    if ((benef[Aid] || 0) >= PLAFOND) { add(S, 'ko_plafond'); return; }
    if (aG(Aid, Dn)) { add(S, 'ko_dejaTitulaire'); return; }   // sécurité : jamais les 2 rôles
    if (indispo(Aid, Dn)) { add(S, 'ko_indispoA'); return; }
    if (flags[Aid].noGarde) { add(S, 'ko_indispoA'); return; }
    if ((flags[Aid].dateDebut && Dn < flags[Aid].dateDebut) ||
        (flags[Aid].dateFin && Dn >= flags[Aid].dateFin)) { add(S, 'ko_horsPresence'); return; }
    if (aG(Aid, addD(Dn, 1)) || aG(Aid, addD(Dn, -1))) { add(S, 'ko_consecutif'); return; }  // règle DURE
    if (dow(Dn) === 4 && aG(Aid, addD(Dn, 2))) { add(S, 'ko_jeudiSamedi'); return; }         // règle DURE
    const t = typeJour(Dn, fer, vjf);
    let fait = false, raison = 'ko_pasDePartenaire';
    for (const rl of ['G', 'G2']) {
      const B = P.byDate[Dn] && P.byDate[Dn][rl];
      if (!B || B === Aid) continue;
      if (gainDe[B + '|' + Dn]) { raison = 'ko_perteB'; continue; }
      const cand = Object.keys(P.byDoc[Aid] || {}).filter(d2 =>
        (P.byDoc[Aid][d2] === rl) && d2 !== Dn && typeJour(d2, fer, vjf) === t && dans.has(d2));
      const ok = cand.find(d2 => {
        if (gainDe[Aid + '|' + d2]) return false;              // A ne se saborde pas
        if (aG(B, d2)) return false;   // B tient déjà l'autre rôle ce jour-là → G=G2 interdit
        if (indispo(B, d2) || flags[B].noGarde) return false;
        if ((flags[B].dateDebut && d2 < flags[B].dateDebut) ||
            (flags[B].dateFin && d2 >= flags[B].dateFin)) return false;   // arrivée / départ du MAR
        if (aG(B, addD(d2, 1)) || aG(B, addD(d2, -1))) return false;      // dure
        if (dow(d2) === 4 && aG(B, addD(d2, 2))) return false;            // dure
        // le CÉDANT n'hérite pas d'un rapprochement J±2 qu'il n'a pas choisi
        if (aG(B, addD(d2, 2)) || aG(B, addD(d2, -2))) return false;
        return true;
      });
      if (ok) {
        delete P.byDoc[Aid][ok]; P.byDoc[Aid][Dn] = rl;
        delete P.byDoc[B][Dn];   P.byDoc[B][ok]   = rl;
        P.byDate[Dn][rl] = Aid;  P.byDate[ok][rl] = B;
        journal.push({ A: Aid, gagne: Dn, cede: ok, B, rl });
        fait = true; break;
      }
    }
    if (fait) { add(S, 'echanges'); benef[Aid] = (benef[Aid] || 0) + 1; }
    else add(S, raison);
  });

  // ── 3. Repos de garde recalculés après déplacement ──
  Object.keys(P.byDoc).forEach(id => Object.keys(P.byDoc[id]).forEach(d => { if (P.byDoc[id][d] === 'RG') delete P.byDoc[id][d]; }));
  Object.keys(P.byDoc).forEach(id => Object.keys(P.byDoc[id]).slice().forEach(d => {
    if (!estG(P.byDoc[id][d])) return;
    const n = addD(d, 1);
    if (dans.has(n) && !P.byDoc[id][n]) P.byDoc[id][n] = 'RG';
  }));
  P.dates.forEach(d => { P.byDate[d].RG = []; Object.keys(P.byDoc).forEach(id => { if (P.byDoc[id][d] === 'RG') P.byDate[d].RG.push(id); }); });

  // ── 3bis. DÉTAIL (option DETAIL=1) : les rapprochements créés ──
  if (process.env.DETAIL && y === +(process.env.YT || Y0)) {
    const pj2 = PP => { const s = new Set(); Object.entries(PP.byDoc).forEach(([id, dd]) => Object.keys(dd).forEach(x => {
      if (!estG(dd[x])) return; const z = addD(x, 2);
      if (estG(dd[z]) && !(dow(x) === 5 && dow(z) === 0)) s.add(id + '|' + x + '|' + z); })); return s; };
    const ap = pj2(P);
    const nouveaux = [...ap].filter(k => !avantPaires.has(k));
    const disparus = [...avantPaires].filter(k => !ap.has(k));
    const J = ['dim','lun','mar','mer','jeu','ven','sam'];
    console.error('\n===== ANNÉE ' + y + ' — DÉTAIL =====');
    console.error('Échanges réalisés : ' + journal.length);
    journal.forEach(j => console.error('  ' + j.A + ' obtient ' + j.gagne + ' (' + J[dow(j.gagne)] + ') et cède ' + j.cede + ' (' + J[dow(j.cede)] + ') à ' + j.B + ' [' + j.rl + ']'));
    console.error('Rapprochements CRÉÉS : ' + nouveaux.length);
    nouveaux.forEach(k => { const [id, a, b] = k.split('|');
      console.error('  ' + id + ' : garde ' + a + ' (' + J[dow(a)] + ') puis ' + b + ' (' + J[dow(b)] + ')' + (benef[id] ? '  ← bénéficiaire (' + benef[id] + ' jour(s) gagné(s))' : '  ← NON bénéficiaire !')); });
    console.error('Rapprochements SUPPRIMÉS : ' + disparus.length);
    disparus.forEach(k => { const [id, a, b] = k.split('|'); console.error('  ' + id + ' : ' + a + ' / ' + b); });
  }

  // ── 4. GARANTIES ──
  const apres = compteurs(P, fer, vjf);
  const diff = memeCompteurs(avant, apres);
  const invApres = A.checkInvariants(P, { indisposMap: im, ctxFeries: fer, roster });
  S.equite_identique = diff === null;
  S.equite_ecart = diff || '';
  S.err_avant = invAvant.errs.length;
  S.err_apres = invApres.errs.length;
  S.j2_avant = invAvant.pairsJ2;
  S.j2_apres = invApres.pairsJ2;
  S.gagnes = (S.dejaOk || 0) + (S.echanges || 0);
  if (invApres.errs.length) S.premieres_err = invApres.errs.slice(0, 3);

  Object.entries(S).forEach(([k, v]) => { if (typeof v === 'number') add(out.tot, k, v); });
  if (!S.equite_identique) add(out.tot, 'ANNEES_EQUITE_CASSEE');
  if (S.err_apres > S.err_avant) add(out.tot, 'ANNEES_INVARIANT_CASSE');
  out.annees.push({ y, ...S });
  process.stderr.write(`sc${SC} ${y} ech=${S.echanges || 0} gagnes=${S.gagnes} equite=${S.equite_identique ? 'OK' : 'CASSEE:' + diff} err=${S.err_avant}->${S.err_apres} J2=${S.j2_avant}->${S.j2_apres}\n`);
}
console.log(JSON.stringify(out));
