/* ═══ BANC — TOUT LISSER : « LE +1 DONNE AU −1 » (13/11/2026) ═══

   POURQUOI CE SCÉNARIO EXISTE.
   Reproche fait au responsable après la génération 2027 : « untel est à +1 sur
   un compteur, un autre à −1 sur le même : le +1 n'a qu'à donner au −1 ».
   Mesuré le 13/11/2026 sur les indisponibilités 2027 : un temps plein à 12
   week-ends, un autre à 10, pour une cible de 11 — et aucun échange possible,
   parce que tous les week-ends du premier étaient des souhaits, que le
   générateur ne retirait jamais tant que l'écart restait à une garde.

   CE QUE LE GÉNÉRATEUR 2026-11-13.5 FAIT (passe 8nonies).
   Une dernière passe cherche le transfert ou l'échange qui remet le plus de
   compteurs pile sur leur cible (total, week-ends, samedis, vendredis, jeudis,
   fériés, veilles de férié, week-ends de juillet-août), y compris par deux coups
   enchaînés. Décision du responsable : un souhait accordé peut être retiré pour
   cela. Jamais sur les fêtes ; toutes les règles dures tiennent ; aucune
   « garde, repos, garde » n'est créée.

   CONTRE-PREUVES : le même générateur, passe coupée (__BANC_APPARIEMENT__ = false),
   sur les mêmes campagnes fictives.

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
const bloc = (SRC.split('8nonies.')[1] || '').split('8octies.')[0];
V('la passe d\'appariement est présente, avant l\'équilibrage réa / maternité', bloc.length > 2000);
V('elle est allumée en production, et le banc peut la couper', /const APPARIEMENT = true;/.test(SRC) && /__BANC_APPARIEMENT__/.test(SRC));
V('aucun hasard dans la passe : le calcul à blanc et la génération font les mêmes coups', bloc.length > 2000 && !/Math\.random|rnd\(/.test(bloc));
V('elle ne tourne ni pendant le choix du tirage ni sans l\'optimisation finale (même bloc qu\'elle)',
  SRC.indexOf('if(NOUVEL_ALGO && !(opts && opts.selection) && _optimIters_() > 0){') > 0 && SRC.indexOf('if(NOUVEL_ALGO && !(opts && opts.selection) && _optimIters_() > 0){') < SRC.indexOf('8nonies.'));
V('les fêtes ne sont jamais déplacées, et aucune « garde, repos, garde » n\'est créée', /_fixeP = sl => sl\.days\.some\(dd => noelDatesAssigned\.has\(dd\)\)/.test(bloc) && /!_grgP\(B, s1\.days\)/.test(bloc));
V('un vendredi ou un dimanche isolé n\'est jamais déplacé seul (il couperait un vendredi-dimanche)', /sl\.days\.length === 1 && \(dayByDate\[sl\.days\[0\]\]\.dow === 5 \|\| dayByDate\[sl\.days\[0\]\]\.dow === 0\)/.test(bloc));

function monde(k) {
  const roster = D.buildRoster(YEAR, { ageExempt: 60, ageRetraite: 67 });
  return { roster, im: D.buildAbsences(YEAR, roster, k, { souhaitsEtendus: true }) };
}
const AXES = ['total', 'sam', 'jeu', 'vd', 'vjf', 'jf'];
function passer(w, allume) {
  const prep = () => { const ss = h.makeSpreadsheet(feuilles(w)), logs = []; const ctx = h.buildContext(ss, logs, SRC);
    ctx.__BANC_OPTIM_ITERS__ = ITERS; ctx.__BANC_APPARIEMENT__ = allume; return { ss, logs, ctx }; };
  const a = prep(); let err = null, r = null;
  try { r = a.ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); } catch (e) { err = e.message; }
  if (err || !r) return { err: err || 'pas de résultat' };
  const b = prep(); try { b.ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { return { err: e.message }; }
  const P = A.parsePlanning(b.ss, YEAR);
  const fer = new Set([...b.ctx.getJoursFeries(YEAR), ...b.ctx.getJoursFeries(YEAR + 1)]);
  const inv = A.checkInvariants(P, { indisposMap: w.im, ctxFeries: fer, roster: w.roster });
  const ids = Object.keys(r.cibles).filter(id => r.cibles[id] && r.cibles[id].total > 0 && r.compteurs[id]);
  let n1 = 0, n2 = 0; ids.forEach(id => AXES.forEach(ax => { const e = Math.abs((r.compteurs[id][ax] || 0) - (r.cibles[id][ax] || 0)); if (e >= 1.5) n2++; else if (e >= 0.5) n1++; }));
  /* garde, repos, garde (hors vendredi-dimanche) et gardes par MAR, lus sur le planning écrit */
  let grg = 0, nuits = 0; const ecrit = {};
  Object.keys(P.byDoc).forEach(id => { const g = Object.keys(P.byDoc[id]).filter(d => P.byDoc[id][d] === 'G' || P.byDoc[id][d] === 'G2').sort(); ecrit[id] = g.length; nuits += g.length;
    g.forEach(d => { const d2 = A.addD(d, 2); if (A.DOW(d) !== 5 && (P.byDoc[id][d2] === 'G' || P.byDoc[id][d2] === 'G2')) grg++; }); });
  const souhaits = Object.values(r.souhaits || {}).reduce((t, x) => t + (x.honores || 0), 0);
  const meme = ids.every(id => ecrit[id] === r.compteurs[id].total);
  return { r, n1, n2, grg, nuits, inv: inv.errs, souhaits, meme, app: (r.optim || {}).appariement, sansBinome: r.sansBinome, logs: a.logs };
}
console.log('\n═══ 1. Trois campagnes fictives, passe allumée puis coupée ═══');
const W = [monde(1), monde(2), monde(3)];
const ON = W.map(w => passer(w, true)), OFF = W.map(w => passer(w, false));
V('les trois campagnes se génèrent, passe allumée', ON.every(x => !x.err), ON.map(x => x.err));
V('contre-preuve : les mêmes campagnes se génèrent, passe coupée', OFF.every(x => !x.err), OFF.map(x => x.err));
if (ON.every(x => !x.err) && OFF.every(x => !x.err)) {
  V('passe coupée : aucun bilan d\'appariement (la contre-preuve coupe bien la passe)', OFF.every(x => !x.app));
  V('passe allumée : un bilan d\'appariement est rendu par le calcul à blanc', ON.every(x => x.app && typeof x.app.avant === 'number'));
  V('jamais plus d\'écarts d\'une garde qu\'avec la passe coupée', ON.every((x, i) => x.n1 <= OFF[i].n1), ON.map((x, i) => [x.n1, OFF[i].n1]));
  V('au moins une campagne où la passe en retire (sinon ce scénario ne prouve rien)', ON.some((x, i) => x.n1 < OFF[i].n1), ON.map((x, i) => [x.n1, OFF[i].n1]));
  V('aucun compteur à 2 gardes de sa cible de plus qu\'avant', ON.every((x, i) => x.n2 <= OFF[i].n2), ON.map((x, i) => [x.n2, OFF[i].n2]));
  V('le bilan de la passe ne ment pas : elle ne finit jamais avec plus d\'écarts qu\'elle n\'en a trouvé', ON.every(x => x.app.apres <= x.app.avant), ON.map(x => [x.app.avant, x.app.apres]));
  console.log('\n═══ 2. Les règles tiennent ═══');
  V('aucune nuit sans binôme', ON.every(x => x.sansBinome === 0), ON.map(x => x.sansBinome));
  V('autant de gardes posées qu\'avec la passe coupée', ON.every((x, i) => x.nuits === OFF[i].nuits && x.nuits > 600), ON.map((x, i) => [x.nuits, OFF[i].nuits]));
  V('aucune règle dure de plus enfreinte, aucun vendredi-dimanche coupé de plus (contrôle indépendant du simulateur)', ON.every((x, i) => x.inv.length <= OFF[i].inv.length), ON.map((x, i) => [x.inv.length, OFF[i].inv.length]));
  V('aucune « garde, repos, garde » de plus', ON.every((x, i) => x.grg <= OFF[i].grg), ON.map((x, i) => [x.grg, OFF[i].grg]));
  V('le calcul à blanc et la génération écrite donnent le même nombre de gardes à chacun', ON.every(x => x.meme));
  console.log('\n═══ 3. Les souhaits : le prix est compté, pas caché ═══');
  V('les souhaits perdus ne dépassent jamais ce que le bilan annonce avoir retiré',
    ON.every((x, i) => OFF[i].souhaits - x.souhaits <= x.app.souhaitsRetires), ON.map((x, i) => [OFF[i].souhaits, x.souhaits, x.app.souhaitsRetires, x.app.souhaitsGagnes]));
  V('quand la passe déplace des gardes, elle le dit au comité (message du compte rendu)',
    ON.every(x => !x.app.creneaux || (x.r.warnings || []).some(m => /^Appariement : /.test(m))), ON.map(x => x.app.creneaux));
  V('été : personne de plus au-dessus de sa part de week-ends de juillet-août', ON.every(x => x.app.ete3Apres <= x.app.ete3Avant), ON.map(x => [x.app.ete3Avant, x.app.ete3Apres]));
  console.log('\n═══ 4. Pendant le choix du tirage, la passe ne tourne pas ═══');
  { const ctx = h.buildContext(h.makeSpreadsheet(feuilles(W[0])), [], SRC); ctx.__BANC_OPTIM_ITERS__ = ITERS;
    const r = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1, selection: true });
    V('calcul à blanc de sélection : pas de passe d\'appariement', !r.optim || !r.optim.appariement); }
}
console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
