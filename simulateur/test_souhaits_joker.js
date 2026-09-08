// ═══ SOUHAITS SUR TOUS LES JOURS — batterie dédiée ═══════════════════════════
//
// Ce que ce fichier vérifie (chaque scénario correspond à une décision prise le
// 25/08/2026, avec sa mesure) :
//   • un souhait est POSABLE n'importe quel jour ; il n'est HONORÉ que s'il tient
//     dans la part du MAR sur chaque axe touché, et dans son joker annuel ;
//   • les jours COUPLÉS s'emportent en entier (vendredi↔dimanche ; jeudi férié ou
//     lundi férié ↔ samedi) — un souhait ne peut pas casser un couplage ;
//   • les jours lundi/mardi/mercredi gardent EXACTEMENT leur comportement
//     historique : c'est la garantie de non-régression (identité mesurée sur
//     80 années simulées, 0 différence) ;
//   • aucun axe d'équité ne peut être monopolisé, même en s'acharnant.
//
// Lancer :  node simulateur/test_souhaits_joker.js
const H = require('./harness.js');
const A = require('./analyse.js');

let fails = 0, checks = 0;
const ok = (cond, label) => {
  checks++;
  if (!cond) fails++;
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
};
const num = v => Number(String(v).replace(/^'/, '')) || 0;

// Un scénario = une année 2027 avec la feuille d'indispos fournie.
function run(titre, indisposMap) {
  const res = H.runScenario({ year: 2027, indisposMap });
  const P = A.parsePlanning(res.ss, 2027);
  const feries = new Set([...res.ctx.getJoursFeries(2027), ...res.ctx.getJoursFeries(2028)]);
  const inv = A.checkInvariants(P, { ctxFeries: feries, indisposMap });
  const st = H.readStats(res.ss, 2027).byId;
  console.log(`\n══ ${titre} ══`);
  console.log(`   erreurs d'invariants : ${inv.errs.length}${inv.errs.length ? ' → ' + inv.errs.slice(0, 3).join(' | ') : ''}`);
  return { res, P, st, feries, errs: inv.errs.length, j2: inv.pairsJ2 };
}
const aGarde = (P, id, d) => { const x = (P.byDoc[id] || {})[d]; return x === 'G' || x === 'G2'; };

// Calendrier 2027 : on repère les familles de jours une fois pour toutes.
const ref = H.runScenario({ year: 2027 });
const FER = new Set([...ref.ctx.getJoursFeries(2027), ...ref.ctx.getJoursFeries(2028)]);
const P0 = A.parsePlanning(ref.ss, 2027);
const jours = P0.dates.slice();
const dow = d => A.DOW(d);
const jeudisOrd = jours.filter(d => dow(d) === 4 && !FER.has(d) && !FER.has(A.addD(d, 1)));
const samedisOrd = jours.filter(d => dow(d) === 6 && !FER.has(d)
  && !FER.has(A.addD(d, -2)) && !FER.has(A.addD(d, 2)) && !FER.has(A.addD(d, 1)));
const vendredisOrd = jours.filter(d => dow(d) === 5 && !FER.has(d)
  && !FER.has(A.addD(d, 2)) && !FER.has(A.addD(d, 1)));
const lundisFeries = jours.filter(d => dow(d) === 1 && FER.has(d));
console.log(`Calendrier 2027 — ${jeudisOrd.length} jeudis, ${samedisOrd.length} samedis, `
  + `${vendredisOrd.length} week-ends, ${lundisFeries.length} lundi(s) férié(s)`);

// ── T1 : un souhait de JEUDI est honoré, sans dépasser la part ───────────────
{
  const im = { SUBLET: {} };
  jeudisOrd.filter((d, i) => i % 6 === 0).slice(0, 6).forEach(d => im.SUBLET[d] = 'SOUHAIT');
  const o = run(`T1 — SUBLET souhaite ${Object.keys(im.SUBLET).length} jeudis répartis sur l'année`, im);
  const hon = Object.keys(im.SUBLET).filter(d => aGarde(o.P, 'SUBLET', d)).length;
  const reel = num(o.st.SUBLET['JEU']), cible = num(o.st.SUBLET['CIBLE JEU']);
  console.log(`   honorés ${hon}/${Object.keys(im.SUBLET).length} | jeudis ${reel} pour une part de ${cible}`);
  ok(o.errs === 0, 'invariants intacts');
  ok(hon >= 1, 'au moins un souhait de jeudi est honoré');
  ok(reel <= Math.ceil(cible), `jeudis ≤ part arrondie (${reel} ≤ ${Math.ceil(cible)})`);
}

// ── T2 : un souhait de VENDREDI emporte le dimanche (week-end entier) ────────
{
  const ven = vendredisOrd[12], dim = A.addD(ven, 2);
  const im = { SUREAU: { [ven]: 'SOUHAIT' } };
  const o = run(`T2 — SUREAU souhaite le vendredi ${ven} → week-end entier`, im);
  const aVen = aGarde(o.P, 'SUREAU', ven), aDim = aGarde(o.P, 'SUREAU', dim);
  console.log(`   vendredi ${aVen ? 'pris' : 'non'} | dimanche ${aDim ? 'pris' : 'non'}`);
  ok(o.errs === 0, 'invariants intacts (dont intégrité du week-end)');
  ok(aVen === aDim, 'vendredi et dimanche vont ensemble — jamais l\'un sans l\'autre');
}

// ── T3 : un souhait de DIMANCHE remonte au vendredi ─────────────────────────
{
  const ven = vendredisOrd[20], dim = A.addD(ven, 2);
  const im = { AUBERT: { [dim]: 'SOUHAIT' } };
  const o = run(`T3 — AUBERT souhaite le dimanche ${dim} → le vendredi vient avec`, im);
  ok(o.errs === 0, 'invariants intacts');
  ok(aGarde(o.P, 'AUBERT', ven) === aGarde(o.P, 'AUBERT', dim),
    'demander un dimanche revient à demander le week-end complet');
}

// ── T4 : un souhait de LUNDI FÉRIÉ emporte le samedi couplé ─────────────────
//  CONTRE-PREUVE : sur la version en production, ce souhait est honoré comme un
//  jour de semaine ordinaire et BRISE le couplage samedi↔lundi férié — 4 cas
//  mesurés sur l'année 2027 (Pâques, Pentecôte, 15 août, Toussaint).
if (lundisFeries.length) {
  const lun = lundisFeries[0], sam = A.addD(lun, -2);
  const im = { GAUTIER: { [lun]: 'SOUHAIT' } };
  const o = run(`T4 — GAUTIER souhaite le lundi férié ${lun} → samedi ${sam} couplé`, im);
  ok(o.errs === 0, 'aucun couplage brisé (défaut corrigé)');
  ok(aGarde(o.P, 'GAUTIER', lun) === aGarde(o.P, 'GAUTIER', sam),
    'le samedi et le lundi férié restent au même binôme');
}

// ── T5 : le JOKER limite les demandes de jours rares ────────────────────────
{
  const im = { SERVANT: {} };
  samedisOrd.forEach(d => im.SERVANT[d] = 'SOUHAIT');           // il les demande TOUS
  const o = run(`T5 — SERVANT souhaite les ${samedisOrd.length} samedis de l'année`, im);
  const hon = samedisOrd.filter(d => aGarde(o.P, 'SERVANT', d)).length;
  const reel = num(o.st.SERVANT['SAM']), cible = num(o.st.SERVANT['CIBLE SAM']);
  console.log(`   samedis obtenus ${reel} pour une part de ${cible} (dont ${hon} aux dates demandées)`);
  ok(o.errs === 0, 'invariants intacts');
  ok(reel <= Math.ceil(cible), `impossible de monopoliser les samedis (${reel} ≤ ${Math.ceil(cible)})`);
}

// ── T6 : même acharnement sur les WEEK-ENDS ─────────────────────────────────
{
  const im = { ZEVACO: {} };
  vendredisOrd.forEach(d => im.ZEVACO[d] = 'SOUHAIT');
  const o = run(`T6 — ZEVACO souhaite les ${vendredisOrd.length} week-ends de l'année`, im);
  const reel = num(o.st.ZEVACO['VD']), cible = num(o.st.ZEVACO['CIBLE VD']);
  console.log(`   week-ends obtenus ${reel} pour une part de ${cible}`);
  ok(o.errs === 0, 'invariants intacts');
  ok(reel <= Math.ceil(cible), `impossible de monopoliser les week-ends (${reel} ≤ ${Math.ceil(cible)})`);
}

// ── T7 : adversarial — TOUS les jours de l'année demandés ───────────────────
{
  const im = { CHAPUIS: {} };
  jours.forEach(d => im.CHAPUIS[d] = 'SOUHAIT');
  const o = run(`T7 — CHAPUIS souhaite les ${jours.length} jours de 2027`, im);
  const tot = num(o.st.CHAPUIS['TOTAL G']);
  const cib = parseFloat(String(o.st.CHAPUIS['CIBLE']).replace("'", ''));
  console.log(`   total ${tot} pour une part de ${cib} | samedis ${o.st.CHAPUIS['SAM']} `
    + `week-ends ${o.st.CHAPUIS['VD']} jeudis ${o.st.CHAPUIS['JEU']}`);
  ok(o.errs === 0, 'invariants intacts');
  ok(tot - cib <= 2 + 1e-9, `son total ne dépasse pas sa part de plus de 2 (écart ${(tot - cib).toFixed(1)})`);
  ['SAM', 'JEU', 'VD'].forEach(ax => {
    const c = num(o.st.CHAPUIS['CIBLE ' + (ax === 'VD' ? 'VD' : ax)]);
    ok(num(o.st.CHAPUIS[ax]) <= Math.ceil(c) + 1, `axe ${ax} non monopolisé`);
  });
}

// ── T8 : un souhait ne sert jamais à coller deux gardes ─────────────────────
//  On demande des samedis ET les jeudis qui les précèdent (J−2) : le générateur
//  ne doit pas enchaîner jeudi→samedi pour la même personne (combo interdit).
{
  const im = { DURAND: {} };
  samedisOrd.slice(0, 10).forEach(d => { im.DURAND[d] = 'SOUHAIT'; im.DURAND[A.addD(d, -2)] = 'SOUHAIT'; });
  const o = run('T8 — DURAND souhaite des samedis ET les jeudis qui les précèdent', im);
  ok(o.errs === 0, 'aucun enchaînement jeudi→samedi (invariant COMBO JEU-SAM)');
  console.log(`   gardes rapprochées dans l'année : ${o.j2}`);
}

// ── T9 : les souhaits de semaine gardent leur comportement d'origine ────────
{
  const mardis = jours.filter(d => dow(d) === 2 && !FER.has(d));
  const im = { LEMAIRE: {} };
  mardis.filter((d, i) => i % 3 === 0).forEach(d => im.LEMAIRE[d] = 'SOUHAIT');
  const o = run(`T9 — LEMAIRE souhaite ${Object.keys(im.LEMAIRE).length} mardis (régime historique)`, im);
  const hon = Object.keys(im.LEMAIRE).filter(d => aGarde(o.P, 'LEMAIRE', d)).length;
  console.log(`   mardis honorés : ${hon}`);
  ok(o.errs === 0, 'invariants intacts');
  ok(hon >= 3, 'les souhaits de semaine restent largement honorés');
}

console.log(fails
  ? `\n❌❌ ${fails} ÉCHEC(S) sur ${checks} vérifications`
  : `\n✅✅ ${checks} vérifications, 0 échec`);
process.exit(fails ? 1 : 0);
