/* ═══ BANC — LA FOURCHETTE : MÊME PART, MÊME FOURCHETTE (14/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Reproche de l'équipe : à part égale, les cibles changeaient d'un MAR à l'autre
   (37 gardes pour l'un, 36 pour l'autre ; 6 samedis contre 5). Mesuré le
   13/11/2026 sur les indisponibilités 2027 : la part exacte d'un temps plein est
   la même pour tous (36,66 gardes), mais l'arrondi la répartit au hasard d'un
   départage, et tout le calcul visait ces cibles : il restait des écarts de 2
   entre collègues de même part (35 contre 37 gardes, 7 contre 5 samedis).

   CE QUE LE GÉNÉRATEUR 2026-11-14.1 FAIT.
   L'écart se mesure à la fourchette de la part : entre son arrondi inférieur et
   son arrondi supérieur. Optimiseur, réparation, choix du tirage et dernière
   passe visent tous la fourchette. Les week-ends gardent leur nombre entier.

   ÉCART ENTRE COLLÈGUES. La fourchette seule faisait PIRE sur ce point (mesuré
   le 14/11/2026 : 4, 3 et 3 écarts de 2 contre 1, 2 et 2) : un MAR forcé sous sa
   fourchette laissait sa garde à un collègue de même part qui montait en haut.
   La dernière passe paie désormais l'excès d'écart dans chaque groupe de même part.

   CONTRE-PREUVES, sur les mêmes campagnes fictives :
   · AVANT : fourchette ET écart entre collègues coupés (__BANC_FOURCHETTE__ et
     __BANC_ECART__ = false) : le comportement d'avant le 14/11/2026 ;
   · FOURCHETTE SEULE : écart entre collègues coupé.
   LIMITE CONNUE, mesurée le 14/11/2026 : sur ces 3 années fictives, il reste 2, 2
   et 2 écarts de 2 entre collègues de même part, contre 1, 2 et 2 avant. Sur 2027
   réel : 0 contre 6. Ce scénario ne prétend donc pas « toujours mieux » sur ce
   point : il vérifie que l'écart entre collègues fait mieux que la fourchette seule,
   et que la fourchette fait moins de compteurs hors fourchette qu'avant.

   Effectif et absences fictifs (simulateur/) : aucun nom réel.
   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path'), fs = require('fs');
const RACINE = path.join(__dirname, '..');
const h = require(path.join(RACINE, 'simulateur', 'harness.js'));
const D = require(path.join(RACINE, 'simulateur', 'demographie.js'));
const A = require(path.join(RACINE, 'simulateur', 'analyse.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 260) : '')); } };
const YEAR = 2027, ITERS = 60000;
const SRC = fs.readFileSync(path.join(RACINE, 'gas', 'generateur_gardes.gs'), 'utf8');
const feuilles = (w) => [
  h.makeSheet('MEDECINS', h.medecinsRows(w.roster)),
  h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, w.roster, w.im)),
  h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
  h.makeSheet('CONFIG', [['CLE', 'VALEUR']])];

console.log('\n═══ 0. Le code ═══');
V('la fourchette est présente et allumée en production, et le banc peut la couper',
  /const _fourchetteOn_=\(\)=>\(typeof __BANC_FOURCHETTE__==='boolean'\)\?__BANC_FOURCHETTE__:true;/.test(SRC));
V('elle se lit sur la part exacte moins le report, avant la remise à zéro du report',
  SRC.indexOf('VISEE[id][k]=Math.max(0,(ex[k]||0)-_dtA(id,k))') > 0 && SRC.indexOf('VISEE[id][k]=Math.max(0,(ex[k]||0)-_dtA(id,k))') < SRC.indexOf("dette[id][k]=0; }); });"));
V('les week-ends gardent leur nombre entier', /if\(!_fourchetteOn_\(\)\|\|ax==='we'\|\|/.test(SRC));
V('l\'écart entre collègues est payé dans la dernière passe, et le banc peut le couper',
  /const _ecartOn_ = \(typeof __BANC_ECART__ === 'boolean'\) \? __BANC_ECART__ : true;/.test(SRC) && /d \+= APP_ECART \* \(_exc\(k, gA, vA, vA \+ x, vB, vB - x\) - _exc\(k, gA\)\)/.test(SRC));
V('optimiseur, réparation, choix du tirage et dernière passe jugent tous à la fourchette',
  /fA1=_ecF\(A,ax,a0-ca\)/.test(SRC) && /const _ec=\(id,ax\)=>_ecF\(id,ax,cnt\[id\]\[ax\]\);/.test(SRC)
  && (SRC.match(/Math\.abs\(_ecF\(id, ax, cnt\[id\]\[ax\]\)\)/g) || []).length === 2 && /const _eP = \(id, ax\) => _ecF\(id, ax, cnt\[id\]\[ax\]\);/.test(SRC));

const AXES = ['total', 'sam', 'jeu', 'vd', 'vjf', 'jf'];
function monde(k) { const roster = D.buildRoster(YEAR, { ageExempt: 60, ageRetraite: 67 });
  return { roster, im: D.buildAbsences(YEAR, roster, k, { souhaitsEtendus: true }) }; }
function passer(w, allume, ecart) {
  const prep = () => { const ss = h.makeSpreadsheet(feuilles(w)), logs = []; const ctx = h.buildContext(ss, logs, SRC);
    ctx.__BANC_OPTIM_ITERS__ = ITERS; ctx.__BANC_FOURCHETTE__ = allume; ctx.__BANC_ECART__ = ecart; return { ss, ctx }; };
  const a = prep(); let r;
  try { r = a.ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); } catch (e) { return { err: e.message }; }
  const b = prep(); try { b.ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { return { err: e.message }; }
  const P = A.parsePlanning(b.ss, YEAR);
  const fer = new Set([...b.ctx.getJoursFeries(YEAR), ...b.ctx.getJoursFeries(YEAR + 1)]);
  const inv = A.checkInvariants(P, { indisposMap: w.im, ctxFeries: fer, roster: w.roster });
  const ids = Object.keys(r.cibles).filter(id => r.cibles[id] && r.cibles[id].total > 0 && r.compteurs[id] && r.partExacte[id]);
  const fk = (id, ax) => { const ex = r.partExacte[id][ax], v = r.compteurs[id][ax] || 0; if (ex === undefined) return 0;
    const lo = Math.floor(ex + 1e-9), hi = Math.ceil(ex - 1e-9); return v < lo ? v - lo : (v > hi ? v - hi : 0); };
  let hors = 0, deux = 0; ids.forEach(id => AXES.forEach(ax => { const e = Math.abs(fk(id, ax)); if (e >= 0.5) hors++; if (e >= 1.5) deux++; }));
  /* écart entre collègues de même part : plus de 1 sur un compteur */
  const grp = {}; ids.forEach(id => { const k = AXES.map(ax => r.partExacte[id][ax]).join('|'); (grp[k] = grp[k] || []).push(id); });
  let ecart2 = 0; Object.values(grp).forEach(L => { if (L.length < 2) return; AXES.forEach(ax => { const v = L.map(id => r.compteurs[id][ax] || 0); if (Math.max(...v) - Math.min(...v) > 1) ecart2++; }); });
  const nuits = Object.keys(P.byDoc).reduce((t, id) => t + Object.values(P.byDoc[id]).filter(x => x === 'G' || x === 'G2').length, 0);
  const pileWE = ids.filter(id => r.compteurs[id].we === r.cibles[id].we).length;
  const app = (r.optim && r.optim.appariement) || {};
  return { app, hors, deux, ecart2, inv: inv.errs, nuits, sansBinome: r.sansBinome, pileWE, nIds: ids.length };
}
console.log('\n═══ 1. Trois campagnes fictives : nouveau, fourchette seule, avant ═══');
const W = [monde(1), monde(2), monde(3)];
const ON = W.map(w => passer(w, true, true)), FS = W.map(w => passer(w, true, false)), OLD = W.map(w => passer(w, false, false));
const T = ON.concat(FS, OLD);
V('les trois campagnes se génèrent dans les trois réglages', T.every(x => !x.err), T.map(x => x.err));
if (T.every(x => !x.err)) {
  const m = (L, f) => L.map(f);
  console.log('    hors fourchette  nouveau ' + m(ON, x => x.hors) + ' · fourchette seule ' + m(FS, x => x.hors) + ' · avant ' + m(OLD, x => x.hors));
  console.log('    écarts de 2      nouveau ' + m(ON, x => x.ecart2) + ' · fourchette seule ' + m(FS, x => x.ecart2) + ' · avant ' + m(OLD, x => x.ecart2));
  V('jamais plus de compteurs hors fourchette qu\'avant, et moins au total', ON.every((x, i) => x.hors <= OLD[i].hors) && ON.reduce((t, x) => t + x.hors, 0) < OLD.reduce((t, x) => t + x.hors, 0), ON.map((x, i) => [x.hors, OLD[i].hors]));
  V('l\'écart entre collègues fait mieux que la fourchette seule, sur chaque campagne', ON.every((x, i) => x.ecart2 < FS[i].ecart2), ON.map((x, i) => [x.ecart2, FS[i].ecart2]));
  V('et ne coûte aucun compteur hors fourchette de plus que la fourchette seule', ON.every((x, i) => x.hors <= FS[i].hors), ON.map((x, i) => [x.hors, FS[i].hors]));
  V('le bilan compte l\'écart entre collègues, et la passe le réduit', ON.every(x => Array.isArray(x.app.ecartCollegues) && x.app.ecartCollegues[1] <= x.app.ecartCollegues[0]) && ON.some(x => x.app.ecartCollegues[1] < x.app.ecartCollegues[0]), ON.map(x => x.app.ecartCollegues));
  V('écart entre collègues coupé : la passe le laisse tel quel ou presque (la contre-preuve coupe bien)', FS.every((x, i) => x.ecart2 > ON[i].ecart2), FS.map(x => x.ecart2));
  V('la passe finit largement avant son plafond (pas de calcul écourté, à blanc = génération)', ON.every(x => !x.app.coupe && x.app.ms < 30000), ON.map(x => [x.app.coupe, x.app.ms]));
  console.log('\n═══ 2. Les règles et les week-ends tiennent ═══');
  V('aucune nuit sans binôme', ON.every(x => x.sansBinome === 0), ON.map(x => x.sansBinome));
  V('autant de gardes posées qu\'avant', ON.every((x, i) => x.nuits === OLD[i].nuits && x.nuits > 600), ON.map((x, i) => [x.nuits, OLD[i].nuits]));
  /* (14/11/2026) Le contrôle indépendant ne trouve que des vendredis-dimanches rompus (« VD BRISÉ ») :
     week-ends que le placement n'a pas pu garder entiers faute de deux MAR libres les deux jours.
     LIMITE CONNUE, mesurée : 2, 2 et 5 avec la fourchette contre 2, 2 et 3 avant (campagne 3). Les
     essais pour l'éviter (interdire ou pénaliser dans l'optimiseur, 100 à 1000) dégradaient l'équité
     sans gain net ; 0 sur 2027 réel, avant comme après. */
  const _dur = L => L.filter(e => !/^VD BRISÉ/.test(String(e)));
  V('aucune autre règle enfreinte que des vendredis-dimanches rompus, ni plus qu\'avant', ON.every((x, i) => _dur(x.inv).length <= _dur(OLD[i].inv).length), ON.map((x, i) => [_dur(x.inv), _dur(OLD[i].inv)]));
  V('vendredis-dimanches rompus : au plus 2 de plus qu\'avant sur une campagne (limite connue)', ON.every((x, i) => x.inv.length - _dur(x.inv).length <= OLD[i].inv.length - _dur(OLD[i].inv).length + 2), ON.map((x, i) => [x.inv.length - _dur(x.inv).length, OLD[i].inv.length - _dur(OLD[i].inv).length]));
  V('pas moins de MAR pile sur leur nombre de week-ends qu\'avant', ON.every((x, i) => x.pileWE >= OLD[i].pileWE), ON.map((x, i) => [x.pileWE, OLD[i].pileWE, x.nIds]));
}
console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
