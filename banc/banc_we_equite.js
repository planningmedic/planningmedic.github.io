/* ═══ BANC — WEEK-ENDS : MÊME CIBLE À QUOTITÉ ÉGALE, ÉTÉ, RÉA / MATERNITÉ (12/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Constaté par le responsable sur la génération 2027, le 12/11/2026 : à quotité
   égale, un MAR à 12 week-ends de garde et deux autres à 9 ; cinq MAR à 3
   week-ends en juillet-août quand d'autres en avaient 1 ; un partage réa /
   maternité très inégal chez certains.
   Trois causes, toutes dans le générateur :
     • les samedis et les vendredis-dimanches étaient arrondis chacun de leur
       côté, et à égalité c'était l'ordre alphabétique qui tranchait : le même
       MAR pouvait être arrondi vers le haut des deux côtés, un autre vers le
       bas des deux côtés ;
     • rien ne regardait QUAND tombaient les week-ends ;
     • les rôles d'une nuit n'étaient équilibrés que par un poids faible.

   CE QUE LE GÉNÉRATEUR 2026-11-13.1 FAIT.
     1. Le nombre de week-ends de chacun est arrondi D'ABORD, puis réparti en
        samedis et vendredis-dimanches. Plus aucun départage alphabétique.
     2. L'arrondi lit le cumul de toutes les années en mémoire, pas seulement N-1.
     3. Une retouche finale rapproche chacun de sa part de week-ends, l'été et
        sur l'année. (13/11/2026) Elle peut déplacer un écart d'une garde du
        nombre de week-ends vers les samedis ou les vendredis ; rien d'autre ne recule.
     4. Les deux MAR d'une même nuit échangent leurs rôles quand cela équilibre
        réa et maternité : personne ne change de nuit.
     5. (13/11/2026) Le 18 h du vendredi va à l'un des DEUX MAR de garde le samedi
        (le code n'essayait que celui de réa), puis une passe d'échanges un pour un
        rattrape les vendredis manqués : chacun garde son nombre de 18 h.

   CONTRE-PREUVES : le générateur d'avant (commit b6f65e6), relu dans
   l'historique du dépôt, sur les mêmes campagnes fictives.

   Effectif et absences fictifs (simulateur/) : aucun nom réel.
   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
process.env.BANC_MULTI_DEPART = '1';
const path = require('path'), fs = require('fs');
const { execSync } = require('child_process');
const RACINE = path.join(__dirname, '..');
const h = require(path.join(RACINE, 'simulateur', 'harness.js'));
const D = require(path.join(RACINE, 'simulateur', 'demographie.js'));
const A = require(path.join(RACINE, 'simulateur', 'analyse.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 260) : '')); } };
const YEAR = 2027, ITERS = 60000;
const SRC = fs.readFileSync(path.join(RACINE, 'gas', 'generateur_gardes.gs'), 'utf8');
let AVANT = null;
try { AVANT = execSync('git show b6f65e6:gas/generateur_gardes.gs', { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
const num = v => Number(String(v).replace(/^'/, '')) || 0;
const feuilles = (year, roster, im, plus) => [
  h.makeSheet('MEDECINS', h.medecinsRows(roster)),
  h.makeSheet('INDISPOS_' + year, h.indisposRows(year, roster, im)),
  h.makeSheet('PERIODES_VAC', h.periodesRows(year)),
  h.makeSheet('CONFIG', [['CLE', 'VALEUR']])].concat(plus || []);

console.log('\n═══ 0. Le code ═══');
V('le générateur d\'avant est lisible dans l\'historique (sinon : cloner AVEC l\'historique)', !!AVANT);
const bloc = (SRC.split('CIBLES ENTIÈRES CROISÉES')[1] || '').split('Le report est désormais DANS la cible')[0];
V('le bloc d\'arrondi des cibles est présent', bloc.length > 500);
V('plus aucun départage alphabétique dans l\'arrondi des cibles', bloc.length > 500 && !/a\s*<\s*b\s*\?\s*-1\s*:\s*1/.test(bloc) && !/localeCompare/.test(bloc));
V('contre-preuve : le générateur d\'avant départageait bien par ordre alphabétique', !!AVANT && /prio\(a\)-prio\(b\) \|\| \(a<b\?-1:1\)/.test(AVANT));
V('la retouche des week-ends et l\'équilibrage réa / maternité sont présents', /8septies\./.test(SRC) && /8octies\./.test(SRC));
V('été = juillet-août, nombre d\'essais fixe (le calcul à blanc = la génération)', /const WE_ETE_MOIS\s*=\s*\[7, 8\];/.test(SRC) && /const WE_ITERS\s*=\s*\d+;/.test(SRC));

/* ═══ 1. Les cibles ═══════════════════════════════════════════════════════ */
console.log('\n═══ 1. À part égale, cible de week-ends égale (à 1 près, jamais 2) ═══');
function cibles(src, year, roster, im, plus) {
  const ctx = h.buildContext(h.makeSpreadsheet(feuilles(year, roster, im, plus)), [], src);
  return ctx.generateGardes(year, { dryRun: true, tirage: 1, selection: true });
}
/* Les MAR de même part exacte (même quotité, même présence) : étendue de leur cible de week-ends. */
function etendues(r) {
  const g = {};
  Object.keys(r.cibles).forEach(id => { const pe = r.partExacte[id]; if (!pe || !(pe.sam > 0)) return;
    const k = pe.sam.toFixed(3) + '/' + pe.vd.toFixed(3); (g[k] = g[k] || []).push(r.cibles[id].sam + r.cibles[id].vd); });
  return Object.values(g).filter(x => x.length > 1).map(x => Math.max(...x) - Math.min(...x));
}
const somme = (r, ax) => Object.values(r.cibles).reduce((t, c) => t + (c[ax] || 0), 0);
const R0 = h.defaultRoster();
const cN = cibles(SRC, YEAR, R0, {}), cA = AVANT ? cibles(AVANT, YEAR, R0, {}) : null;
const eN = etendues(cN), eA = cA ? etendues(cA) : [];
V('un groupe d\'au moins 10 MAR de même part existe dans l\'effectif fictif', eN.length >= 1 && Object.keys(cN.cibles).length >= 15, eN);
V('nouveau : jamais plus d\'1 week-end d\'écart de cible entre MAR de même part', eN.length >= 1 && eN.every(x => x <= 1), eN);
V('contre-preuve : avant, 2 week-ends d\'écart de cible à part égale', eA.length >= 1 && eA.some(x => x >= 2), eA);
V('le total des samedis et des vendredis-dimanches à répartir ne change pas',
  !!cA && somme(cN, 'sam') === somme(cA, 'sam') && somme(cN, 'vd') === somme(cA, 'vd') && somme(cN, 'sam') > 0, [somme(cN, 'sam'), somme(cN, 'vd')]);
V('les cibles restent des entiers', Object.values(cN.cibles).every(c => ['sam', 'vd', 'jeu', 'jf', 'vjf', 'total'].every(k => Number.isInteger(c[k]))));

/* ═══ 2. Le planning ══════════════════════════════════════════════════════ */
console.log('\n═══ 2. Le planning écrit : week-ends, règles, rien ne recule ═══');
function monde(k) {
  const roster = D.buildRoster(YEAR, { ageExempt: 60, ageRetraite: 67 });
  return { roster, im: D.buildAbsences(YEAR, roster, k, { souhaitsEtendus: true }) };
}
function ecrire(w, src) {
  const ss = h.makeSpreadsheet(feuilles(YEAR, w.roster, w.im)), logs = [];
  const ctx = h.buildContext(ss, logs, src); ctx.__BANC_OPTIM_ITERS__ = ITERS;
  let err = null; try { ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { err = e.message; }
  const sh = ss.getSheetByName('STATS_GARDES_' + YEAR); if (err || !sh) return { err: err || 'pas de statistiques' };
  const st = sh._rows, H = st[0], c = n => H.indexOf(n);
  const L = st.slice(1).filter(x => x[c('PART EXACTE SAM')] !== '' && Number(x[c('PART EXACTE SAM')]) > 0).map(x => ({ id: x[0],
    we: num(x[c('SAM')]) + num(x[c('DIM')]), cible: num(x[c('CIBLE SAM')]) + num(x[c('CIBLE VD')]),
    part: Number(x[c('PART EXACTE SAM')]) + Number(x[c('PART EXACTE VD')]), g: num(x[c('G (REA)')]), g2: num(x[c('G2 (MAT)')]) }));
  const P = A.parsePlanning(ss, YEAR);
  const fer = new Set([...ctx.getJoursFeries(YEAR), ...ctx.getJoursFeries(YEAR + 1)]);
  const inv = A.checkInvariants(P, { indisposMap: w.im, ctxFeries: fer, roster: w.roster });
  return { L, P, inv: inv.errs, logs };
}
function bilan(w, src) {
  const ctx = h.buildContext(h.makeSpreadsheet(feuilles(YEAR, w.roster, w.im)), [], src); ctx.__BANC_OPTIM_ITERS__ = ITERS;
  return ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }).optim || {};
}
const loin = L => L.filter(l => Math.abs(l.we - l.cible) >= 2).map(l => l.id + (l.we - l.cible > 0 ? '+' : '') + (l.we - l.cible));
const pirePart = L => Math.max(...L.map(l => Math.abs(l.we - l.part)));
const sRM = L => L.reduce((t, l) => t + Math.abs(l.g - l.g2), 0), mRM = L => Math.max(...L.map(l => Math.abs(l.g - l.g2)));
const W = [monde(1), monde(2)];
const N = W.map(w => ecrire(w, SRC)), Z = AVANT ? W.map(w => ecrire(w, AVANT)) : [];
V('les deux campagnes fictives se génèrent', N.every(x => !x.err), N.map(x => x.err));
V('contre-preuve : les mêmes campagnes se génèrent avec le générateur d\'avant', Z.length === 2 && Z.every(x => !x.err), Z.map(x => x.err));
if (N.every(x => !x.err) && Z.length === 2 && Z.every(x => !x.err)) {
  V('nouveau : aucun MAR à 2 week-ends ou plus de sa cible (week-end = samedis + dimanches)', N.every(x => loin(x.L).length === 0), N.map(x => loin(x.L)));
  V('contre-preuve : avant, au moins un MAR à 2 week-ends ou plus de sa cible', Z.some(x => loin(x.L).length > 0), Z.map(x => loin(x.L)));
  V('nouveau : l\'écart à la part exacte de week-ends est plus petit qu\'avant, sur chaque campagne',
    N.every((x, i) => pirePart(x.L) < pirePart(Z[i].L)), N.map((x, i) => [+pirePart(x.L).toFixed(2), +pirePart(Z[i].L).toFixed(2)]));
  V('aucune règle dure de plus enfreinte qu\'avant (contrôle indépendant du simulateur)', N.every((x, i) => x.inv.length <= Z[i].inv.length),
    N.map((x, i) => [x.inv.length, Z[i].inv.length]));

  console.log('\n═══ 3. La retouche des week-ends ne fait rien reculer ═══');
  const o = bilan(W[0], SRC), we = o.weekEnds;
  V('le calcul à blanc rend le bilan de la retouche', !!we && !!we.avant && !!we.apres && !!we.mesureAvant && !!we.mesureApres, o && Object.keys(o));
  if (we && we.mesureAvant) {
    const a = we.mesureAvant, b = we.mesureApres;
    /* (13/11/2026) LES WEEK-ENDS D'ABORD — arbitrage du responsable. Le nombre d'écarts d'une
       garde (n1) n'est plus intouchable : il peut monter, mais seulement d'autant que les
       écarts de week-ends descendent. Tout le reste reste interdit de recul. */
    const recul = ['n2', 'split', 'j2', 'dwe'].filter(k => b[k] > a[k]).concat(['sh', 'conf', 'cpl'].filter(k => b[k] < a[k]));
    V('aucun autre critère ne recule : MAR à 2 gardes de leur part, souhaits, week-ends coupés, garde-repos-garde, doubles week-ends, couples, confort', recul.length === 0, { recul, avant: a, apres: b });
    V('un écart d\'une garde de plus ailleurs = un écart de week-end rattrapé, jamais davantage', b.n1 + we.apres.annee <= a.n1 + we.avant.annee + 0.011, { n1: [a.n1, b.n1], annee: [we.avant.annee, we.apres.annee] });
    { const REGLE = 'm.n1 + CW <= m1.n1 + CW1 + 1e-9';
      V('la règle est repérable dans le code (pour la couper)', SRC.split(REGLE).length === 2);
      /* (14/11/2026) Depuis la fourchette (générateur 2026-11-14.1), la règle ne sert plus sur
         les deux campagnes du scénario : sans elle, la retouche y obtient autant de week-ends.
         Mesuré sur 4 autres campagnes : elle sert sur la n° 3 (2 écarts de week-ends contre 4),
         rien sur les n° 5 et 8, et fait moins bien sur la n° 4 (2 contre 0) — c'est une
         heuristique, pas une garantie. La contre-preuve exige qu'elle serve sur au moins une. */
      const CUT = SRC.split(REGLE).join('m.n1 <= m1.n1'); let sert = null; const vu = [], CW_ = [W[0], W[1], monde(3)];
      for (let i = 0; i < CW_.length && !sert; i++) { const ai = i === 0 ? we : bilan(CW_[i], SRC).weekEnds, st = bilan(CW_[i], CUT).weekEnds;
        if (!ai || !st) continue; vu.push([i, st.apres.annee, ai.apres.annee]);
        if (st.mesureApres.n1 <= st.mesureAvant.n1 && st.apres.annee > ai.apres.annee + 1e-9) sert = { campagne: i, n1: [st.mesureAvant.n1, st.mesureApres.n1], annee: [st.apres.annee, ai.apres.annee] }; }
      V('contre-preuve : sur au moins une campagne, sans la règle, les écarts d\'une garde ne bougent pas et il reste plus d\'écarts de week-ends',
        !!sert, sert || vu); }
    V('pire écart à la cible jamais dégradé', b.pire <= Math.max(1, a.pire), [a.pire, b.pire]);
    V('l\'été ne recule pas, l\'année non plus', we.apres.ete <= we.avant.ete + 1e-9 && we.apres.annee <= we.avant.annee + 1e-9, [we.avant, we.apres]);
    V('la retouche améliore effectivement l\'été ou l\'année sur cette campagne', we.garde === true && (we.apres.ete < we.avant.ete || we.apres.annee < we.avant.annee), [we.garde, we.avant, we.apres]);
    V('espacements non dégradés : gardes à 3 jours, à 4 jours, semaines à 3 gardes',
      ['a3j', 'a4j', 'semaines3'].every(k => we.espacement[k][1] <= we.espacement[k][0]), we.espacement);
    V('la retouche n\'a pas été écourtée', we.ecourtee === false, we.ecourtee);
  }

  console.log('\n═══ 4. Réa / maternité : les rôles s\'équilibrent, personne ne change de nuit ═══');
  V('nouveau : aucun MAR à plus de 2 nuits d\'écart entre réa et maternité', N.every(x => mRM(x.L) <= 2), N.map(x => mRM(x.L)));
  V('contre-preuve : avant, un MAR à 5 nuits d\'écart ou plus', Z.every(x => mRM(x.L) >= 5), Z.map(x => mRM(x.L)));
  V('somme des écarts réa / maternité divisée par 4 au moins', N.every((x, i) => sRM(x.L) * 4 <= sRM(Z[i].L)), N.map((x, i) => [sRM(x.L), sRM(Z[i].L)]));
  V('le bilan compte les inversions et ne dépareille aucune nuit solidaire', !!o.roles && o.roles.inversions > 0 && o.roles.apres < o.roles.avant
    && o.roles.depareillesApres <= o.roles.depareillesAvant && o.roles.annule === false, o.roles);
  /* Le même générateur, équilibrage coupé : les mêmes MAR aux mêmes nuits, seuls les rôles diffèrent. */
  const COUPE = 'while (_encore && _tours++ < 50) { _encore = false;';
  V('l\'équilibrage est repérable dans le code (pour le couper)', SRC.split(COUPE).length === 2);
  const S = ecrire(W[0], SRC.split(COUPE).join('while (false) { _encore = false;'));
  V('la copie sans équilibrage se génère', !S.err, S.err);
  if (!S.err) {
    const duo = P => { const out = {}; P.dates.forEach(d => { const x = P.byDate[d]; out[d] = [x.G, x.G2].sort().join('+'); }); return out; };
    const dN = duo(N[0].P), dS = duo(S.P), jours = Object.keys(dN);
    V('avec ou sans équilibrage : le même binôme chaque nuit de l\'année', jours.length >= 360 && jours.every(d => dN[d] === dS[d]), jours.filter(d => dN[d] !== dS[d]).slice(0, 3));
    V('des rôles ont bien été inversés', jours.some(d => N[0].P.byDate[d].G !== S.P.byDate[d].G));
    V('contre-preuve : sans équilibrage, l\'écart réa / maternité est au moins 4 fois plus grand', sRM(S.L) >= 4 * sRM(N[0].L), [sRM(S.L), sRM(N[0].L)]);
    V('aucune règle dure de plus enfreinte par l\'équilibrage (vendredi et dimanche restent solidaires)', N[0].inv.length <= S.inv.length, [N[0].inv, S.inv]);
  }
}

/* ═══ 4 bis. Le 18 h du vendredi ══════════════════════════════════════════ */
console.log('\n═══ 4 bis. Le 18 h du vendredi va à un des deux MAR de garde le samedi (13/11/2026) ═══');
if (N.every(x => !x.err)) {
  /* Compté sur le planning ÉCRIT, sans rien demander au générateur. */
  const jplus = (d, n) => { const p = d.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); };
  const dowU = d => { const p = d.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); };
  const vendredis = P => { let bons = 0, tous = 0; P.dates.forEach(d => { const x = P.byDate[d]; if (dowU(d) !== 5 || !x.h18) return; const s = P.byDate[jplus(d, 1)]; if (!s) return;
    tous++; if (x.h18 === s.G || x.h18 === s.G2) bons++; }); return { bons, tous }; };
  const par18 = P => { const c = {}; P.dates.forEach(d => { const h = P.byDate[d].h18; if (h) c[h] = (c[h] || 0) + 1; }); return c; };
  const deSuite = P => P.dates.filter(d => P.byDate[d].h18 && P.byDate[jplus(d, 1)] && P.byDate[jplus(d, 1)].h18 === P.byDate[d].h18).length;
  const surGarde = P => P.dates.filter(d => { const x = P.byDate[d]; return x.h18 && (x.h18 === x.G || x.h18 === x.G2 || x.RG.indexOf(x.h18) >= 0 || x.R.indexOf(x.h18) >= 0); }).length;
  const PASSE = 'const X=h18A[f]; if(!X||_bon(f)) return;';
  V('la passe d\'échanges de 18 h est repérable dans le code (pour la couper)', SRC.split(PASSE).length === 2);
  /* (14/11/2026) la passe à trois, qui suit, rattraperait les vendredis : coupée aussi ici */
  const SP = ecrire(W[0], SRC.split(PASSE).join('return;').split('const X=h18A[f]; if(!X || _bon(f)) return;   /* passe à trois */').join('return;'));
  V('la copie sans la passe se génère', !SP.err, SP.err);
  const vN = vendredis(N[0].P), vZ = Z.length && !Z[0].err ? vendredis(Z[0].P) : null;
  V('des vendredis portent un 18 h dans le planning écrit', vN.tous >= 40, vN);
  if (!SP.err) {
    const vS = vendredis(SP.P);
    V('avec les passes d\'échange : plus de vendredis conformes que sans', vN.bons > vS.bons, [vN, vS]);
    V('chaque MAR garde exactement son nombre de 18 h', JSON.stringify(Object.entries(par18(N[0].P)).sort()) === JSON.stringify(Object.entries(par18(SP.P)).sort()));
    V('aucune garde ne bouge', N[0].P.dates.every(d => N[0].P.byDate[d].G === SP.P.byDate[d].G && N[0].P.byDate[d].G2 === SP.P.byDate[d].G2));
    V('pas plus de 18 h deux jours de suite qu\'avant la passe', deSuite(N[0].P) <= deSuite(SP.P), [deSuite(N[0].P), deSuite(SP.P)]);
  }
  V('aucun 18 h un jour de garde, de repos de garde ou de récupération', surGarde(N[0].P) === 0, surGarde(N[0].P));
  V('au moins 2 vendredis sur 3 conformes', vN.bons * 3 >= vN.tous * 2, vN);
  if (vZ) V('contre-preuve : le générateur d\'avant en avait moins', vZ.bons < vN.bons, [vZ, vN]);
  V('le calcul à blanc rend le même compte que le planning écrit', (() => { const b = h.buildContext(h.makeSpreadsheet(feuilles(YEAR, W[0].roster, W[0].im)), [], SRC); b.__BANC_OPTIM_ITERS__ = ITERS;
    const r = b.generateGardes(YEAR, { dryRun: true, tirage: 1 }).h18Vendredi; return !!r && r.conformes === vN.bons && r.echanges > 0; })());
  /* (14/11/2026) ÉCHANGE À TROIS : Y (samedi) prend le vendredi, cède son 18 h à Z, qui cède le sien à X. */
  { const P3 = 'const X=h18A[f]; if(!X || _bon(f)) return;   /* passe à trois */';
    V('la passe à trois est repérable dans le code (pour la couper)', SRC.split(P3).length === 2);
    const S3 = ecrire(W[0], SRC.split(P3).join('return;'));
    V('la copie sans la passe à trois se génère', !S3.err, S3.err);
    if (!S3.err) { const v3 = vendredis(S3.P);
      V('avec la passe à trois : pas moins de vendredis conformes que sans', vN.bons >= v3.bons, [vN, v3]);
      V('chaque MAR garde exactement son nombre de 18 h (avec et sans la passe à trois)', JSON.stringify(Object.entries(par18(N[0].P)).sort()) === JSON.stringify(Object.entries(par18(S3.P)).sort()));
      V('aucune garde ne bouge', N[0].P.dates.every(d => N[0].P.byDate[d].G === S3.P.byDate[d].G && N[0].P.byDate[d].G2 === S3.P.byDate[d].G2));
      V('pas plus de 18 h deux jours de suite qu\'avant la passe à trois', deSuite(N[0].P) <= deSuite(S3.P), [deSuite(N[0].P), deSuite(S3.P)]);
      const gainW = [];
      for (const w of [W[1]]) { const a3 = ecrire(w, SRC), b3 = ecrire(w, SRC.split(P3).join('return;')); if (!a3.err && !b3.err) gainW.push([vendredis(a3.P).bons, vendredis(b3.P).bons]); }
      gainW.unshift([vN.bons, v3.bons]);
      V('contre-preuve : sur au moins une campagne, la passe à trois ajoute des vendredis conformes', gainW.some(([x, y]) => x > y), gainW); } }
}

/* ═══ 5. La mémoire de plusieurs années ═══════════════════════════════════ */
console.log('\n═══ 5. L\'arrondi lit le cumul des années, pas seulement N-1 ═══');
{
  const roster = h.defaultRoster().filter(r => !r[3].dateDebut && !r[3].dateFin);
  const gen = (year, im, plus) => { const res = h.runScenario({ year, roster, indisposMap: im, extraSheets: [h.makeSheet('CONFIG', [['PARAMETRE', 'VALEUR']])].concat(plus || []) });
    const st = res.ss.getSheetByName('STATS_GARDES_' + year); return { err: res.error, rows: st ? st._rows : null }; };
  const a27 = gen(2027, {});
  const a28 = a27.rows ? gen(2028, D.buildAbsences(2028, roster, 1), [h.makeSheet('STATS_GARDES_2027', a27.rows)]) : { err: 'pas de 2027' };
  V('deux années fictives enchaînées se génèrent', !a27.err && !a28.err && !!a28.rows, a27.err || a28.err);
  if (a28.rows) {
    const im29 = D.buildAbsences(2029, roster, 2);
    const c29 = (src, s27) => cibles(src, 2029, roster, im29, [h.makeSheet('STATS_GARDES_2028', a28.rows), h.makeSheet('STATS_GARDES_2027', s27)]);
    const vrai = c29(SRC, a27.rows);
    /* Un temps plein arrondi vers le BAS en samedis en 2029, et dont la part n'est pas entière. */
    const X = Object.keys(vrai.cibles).find(id => { const pe = vrai.partExacte[id]; return pe && pe.sam > 4 && vrai.cibles[id].sam < pe.sam - 0.05 && vrai.cibles[id].sam === Math.floor(pe.sam); });
    V('un MAR arrondi vers le bas en samedis existe en 2029', !!X, X);
    if (X) {
      /* On lui retire 2 samedis faits en 2027 — l'année N-2, que le report seul ne lit pas. */
      const truque = a27.rows.map(r => r.slice()), iS = truque[0].indexOf('SAM');
      const ligne = truque.find(r => r[0] === X); ligne[iS] = Math.max(0, num(ligne[iS]) - 2);
      const apres = c29(SRC, truque);
      /* (13/11/2026) Le retard cumulé entre dans la visée à 60 % : 2 samedis de retard = 1,2 samedi de plus visé, donc 1 ou 2 après arrondi, jamais plus que le retard. */
      V('en retard de 2 samedis sur N-2, sa cible monte de 1 ou 2 — jamais plus que son retard', apres.cibles[X].sam >= vrai.cibles[X].sam + 1 && apres.cibles[X].sam <= vrai.cibles[X].sam + 2, { medecin: X, vrai: vrai.cibles[X].sam, truque: apres.cibles[X].sam });
      V('le total des samedis à répartir ne change pas', somme(apres, 'sam') === somme(vrai, 'sam'), [somme(apres, 'sam'), somme(vrai, 'sam')]);
      /* (13/11/2026) ANNÉE ARCHIVÉE. En production, l'onglet de N-2 n'est plus dans le
         classeur maître : la clôture l'a déplacé dans le classeur d'archives. Défaut
         vu le 13/11 à la relecture : le cumul ne le cherchait que dans le maître. */
      const c29arch = (src, s27) => { const ctx = h.buildContext(h.makeSpreadsheet(feuilles(2029, roster, im29, [h.makeSheet('STATS_GARDES_2028', a28.rows)])), [], src);
        const archives = h.makeSpreadsheet([h.makeSheet('STATS_GARDES_2027', s27)]); let ouvertures = 0;
        ctx.SpreadsheetApp.openById = () => { ouvertures++; return archives; };
        const r = ctx.generateGardes(2029, { dryRun: true, tirage: 1, selection: true }); r._ouvertures = ouvertures; return r; };
      const archV = c29arch(SRC, a27.rows), archT = c29arch(SRC, truque);
      V('N-2 archivée : mêmes cibles que si l\'onglet était resté dans le classeur maître', JSON.stringify(archV.cibles) === JSON.stringify(vrai.cibles) && JSON.stringify(archT.cibles) === JSON.stringify(apres.cibles));
      V('N-2 archivée : le retard de 2 samedis compte toujours', archT.cibles[X].sam >= archV.cibles[X].sam + 1 && archT.cibles[X].sam <= archV.cibles[X].sam + 2, [archV.cibles[X].sam, archT.cibles[X].sam]);
      V('le classeur d\'archives n\'est ouvert qu\'une fois', archT._ouvertures === 1, archT._ouvertures);
      { const REPLI = "if(!_sh && _y!==year-1){";
        V('le repli vers les archives est repérable dans le code (pour le couper)', SRC.split(REPLI).length === 2);
        const sans = c29arch(SRC.split(REPLI).join('if(false){'), truque);
        V('contre-preuve : sans le repli, l\'année archivée est ignorée', sans.cibles[X].sam === archV.cibles[X].sam, [archV.cibles[X].sam, sans.cibles[X].sam]); }
      { const ctx = h.buildContext(h.makeSpreadsheet(feuilles(2029, roster, im29, [h.makeSheet('STATS_GARDES_2028', a28.rows)])), [], SRC);
        let err = null, r = null; try { r = ctx.generateGardes(2029, { dryRun: true, tirage: 1, selection: true }); } catch (e) { err = e.message; }
        V('archives inaccessibles : le calcul continue, avec l\'année précédente seule', !err && !!r && !!r.cibles, err); }
      /* (13/11/2026) LE RETARD N'EST COMPTÉ QU'UNE FOIS. Vu sur l'estimation 2028 des données
         réelles : un MAR à 0 férié pour une part de 1,4 visait 2,1 (60 % du retard) puis
         recevait 3, le retard servant une seconde fois à choisir l'arrondi haut. Il reprenait
         plus que son retard en une seule année. */
      { const im28 = D.buildAbsences(2028, roster, 1);
        const cJ = (src, s27) => cibles(src, 2028, roster, im28, [h.makeSheet('STATS_GARDES_2027', s27)]);
        const H27 = a27.rows[0], iJ = H27.indexOf('JF');
        let AV3 = null; try { AV3 = execSync('git show 34f4de1:gas/generateur_gardes.gs', { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
        V('le générateur du 13/11 midi est lisible dans l\'historique', !!AV3);
        /* On prive tour à tour un MAR de ses fériés de 2027, et on garde le premier cas où le
           générateur d'avant lui rendait PLUS que son retard dès 2028. */
        const sans = id => { const s27 = a27.rows.map(r => r.slice()); s27.find(r => r[0] === id)[iJ] = 0; return s27; };
        const base28 = cJ(SRC, a27.rows);
        const cand = Object.keys(base28.cibles).filter(id => { const l = a27.rows.find(r => r[0] === id), pe = base28.partExacte[id]; return l && pe && pe.jf > 1 && num(l[iJ]) >= 1; });
        let F = null, o = null;
        if (AV3) for (const id of cand) { const x = cJ(AV3, sans(id)); if (x.cibles[id].jf - x.partExacte[id].jf > -x.cumulPrec[id].jf + 1e-9) { F = id; o = x; break; } }
        V('contre-preuve : avant, un MAR privé de ses fériés reprenait plus que son retard en une seule année', !!F, { essayes: cand.length });
        if (F) {
          const n = cJ(SRC, sans(F)), retard = -n.cumulPrec[F].jf, part = n.partExacte[F].jf, repris = n.cibles[F].jf - part;
          V('le même MAR est bien en retard d\'au moins 1 férié', retard >= 1, retard);
          V('nouveau : sa cible monte, mais il reprend moins que son retard', repris > 0 && repris < retard && n.cibles[F].jf < o.cibles[F].jf, { part, retard, avant: o.cibles[F].jf, nouveau: n.cibles[F].jf });
          V('la somme des cibles de fériés ne change pas', somme(n, 'jf') === somme(base28, 'jf'), [somme(n, 'jf'), somme(base28, 'jf')]);
        } }
      if (AVANT) {
        const vA = c29(AVANT, a27.rows), tA = c29(AVANT, truque);
        V('contre-preuve : le générateur d\'avant ne voyait pas N-2 (cible inchangée)', tA.cibles[X].sam === vA.cibles[X].sam, [vA.cibles[X].sam, tA.cibles[X].sam]);
      }
    }
  }
}

/* ═══ 6. Des comptes exacts ═══════════════════════════════════════════════ */
console.log('\n═══ 6. Les compteurs du calcul = le planning écrit, sur chaque axe (13/11/2026) ═══');
/* POURQUOI. Demande du responsable le 13/11/2026 : « je veux que les comptes soient
   exacts, sur chaque axe ». Mesuré le jour même sur les indispos 2027 : le compteur
   des vendredis-dimanches, tenu à la main (+1 par week-end posé d'un bloc), ignorait
   les vendredis posés SEULS (week-end rompu) — 9 MAR avaient un vendredi de plus que
   leur compteur, un autre deux. Le compteur de week-ends, qui en était déduit,
   héritait de l'erreur et ne voyait pas le dimanche tenu seul.
   Le monde : trois week-ends où un seul MAR est libre vendredi ET dimanche — l'unité
   casse forcément, comme dans banc_vd_rompu.js. */
{
  const WES = ['2027-03-12', '2027-05-21', '2027-10-08'];
  const plus2 = ds => { const d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); };
  const roster = h.defaultRoster(), gardeIds = roster.filter(r => !r[3].noGarde).map(r => r[0]);
  const im = {}; gardeIds.forEach(id => im[id] = {});
  WES.forEach((ven, k) => { const dim = plus2(ven), n = gardeIds.length;
    const pivot = gardeIds[(k * 5) % n], lv = new Set([pivot]), ld = new Set([pivot]);
    for (let i = 1; i <= 4; i++) { lv.add(gardeIds[(k * 5 + i) % n]); ld.add(gardeIds[(k * 5 + 4 + i) % n]); }
    gardeIds.forEach(id => { if (!lv.has(id)) im[id][ven] = 'INDISPO'; if (!ld.has(id)) im[id][dim] = 'INDISPO'; }); });
  const jouer = src => {
    const ss = h.makeSpreadsheet(feuilles(YEAR, roster, im)), logs = [];
    const ctx = h.buildContext(ss, logs, src); ctx.__BANC_OPTIM_ITERS__ = ITERS;
    const dry = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 });
    let err = null; try { ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { err = e.message; }
    if (err) return { err };
    const P = A.parsePlanning(ss, YEAR), fer = new Set([...ctx.getJoursFeries(YEAR), ...ctx.getJoursFeries(YEAR + 1)]);
    const reel = {};
    Object.keys(P.byDoc).forEach(id => { const c = { total: 0, g: 0, g2: 0, ven: 0, sam: 0, dim: 0, jeu: 0, jf: 0 };
      Object.keys(P.byDoc[id]).forEach(d => { const v = P.byDoc[id][d]; if (v !== 'G' && v !== 'G2') return;
        const dow = new Date(d + 'T12:00:00').getDay(); c.total++; v === 'G' ? c.g++ : c.g2++;
        if (dow === 5) c.ven++; if (dow === 6) c.sam++; if (dow === 0) c.dim++; if (dow === 4 && !fer.has(d)) c.jeu++; if (fer.has(d)) c.jf++; });
      reel[id] = c; });
    const casses = WES.filter(ven => { const a = P.byDate[ven], b = P.byDate[plus2(ven)];
      return a && b && [a.G, a.G2].sort().join() !== [b.G, b.G2].sort().join(); });
    return { dry, reel, casses };
  };
  const faux = (r, axe, de) => Object.keys(r.dry.compteurs).filter(id => r.reel[id] && r.dry.compteurs[id][axe] !== de(r.reel[id]))
    .map(id => id + ' ' + r.dry.compteurs[id][axe] + '≠' + de(r.reel[id]));
  const N = jouer(SRC);
  V('la génération aboutit', !N.err, N.err);
  if (!N.err) {
    V('au moins un week-end est bien rompu dans ce monde (sinon le test ne prouve rien)', N.casses.length >= 1, N.casses);
    V('le calcul rend aussi les vendredis, les dimanches, les week-ends et les fériés', ['ven', 'dim', 'we', 'jf'].every(k => typeof Object.values(N.dry.compteurs)[0][k] === 'number'));
    [['total', c => c.total], ['g', c => c.g], ['g2', c => c.g2], ['sam', c => c.sam], ['jeu', c => c.jeu], ['ven', c => c.ven], ['dim', c => c.dim], ['jf', c => c.jf]]
      .forEach(([axe, de]) => { const f = faux(N, axe, de); V('compteur « ' + axe + ' » = planning écrit, pour chaque MAR', f.length === 0, f); });
    { const f = faux(N, 'vd', c => c.ven); V('compteur vendredis-dimanches = vendredis réellement tenus, week-ends rompus compris', f.length === 0, f); }
    { const f = faux(N, 'we', c => c.sam + c.dim); V('compteur week-ends = samedis + dimanches réellement tenus', f.length === 0, f); }
    V('les compteurs sont déduits du planning dans le code (repère)', /Object\.defineProperty\(cnt\[id\],'vd',\{get:function\(\)\{return this\.ven;\}/.test(SRC) && /Object\.defineProperty\(cnt\[id\],'we',\{get:function\(\)\{return this\.sam\+this\.dim;\}/.test(SRC));
  }
  let AV2 = null; try { AV2 = execSync('git show 23e50aa:gas/generateur_gardes.gs', { cwd: RACINE, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {}
  V('le générateur du 13/11 matin est lisible dans l\'historique', !!AV2);
  if (AV2) { const O = jouer(AV2);
    V('contre-preuve : avant, le compteur vendredis-dimanches était faux dans ce même monde', !O.err && faux(O, 'vd', c => c.ven).length >= 1, O.err || faux(O, 'vd', c => c.ven)); }
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
