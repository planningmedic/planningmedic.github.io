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

   GÉNÉRATEUR 2026-11-14.1 : LE RELAIS.
   Essai de génération chez Google du 13/11/2026 : 3 MAR à +1 férié, 3 à −1, aucun
   échange direct possible ; l'échange à trois existait, la recherche générale ne
   le trouvait pas. Le relais le cherche de façon ciblée, et la passe fait deux
   parcours (relais avant ou après la recherche générale) dont elle garde le
   meilleur. Contre-preuve : relais coupé (__BANC_RELAIS__ = false).

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
function passer(w, allume, sansRelais) {
  const prep = () => { const ss = h.makeSpreadsheet(feuilles(w)), logs = []; const ctx = h.buildContext(ss, logs, SRC);
    ctx.__BANC_OPTIM_ITERS__ = ITERS; ctx.__BANC_APPARIEMENT__ = allume; if (sansRelais) ctx.__BANC_RELAIS__ = false; return { ss, logs, ctx }; };
  const a = prep(); let err = null, r = null;
  try { r = a.ctx.generateGardes(YEAR, { dryRun: true, tirage: 1 }); } catch (e) { err = e.message; }
  if (err || !r) return { err: err || 'pas de résultat' };
  const b = prep(); try { b.ctx.generateGardes(YEAR, { tirage: 1 }); } catch (e) { return { err: e.message }; }
  const P = A.parsePlanning(b.ss, YEAR);
  const fer = new Set([...b.ctx.getJoursFeries(YEAR), ...b.ctx.getJoursFeries(YEAR + 1)]);
  const inv = A.checkInvariants(P, { indisposMap: w.im, ctxFeries: fer, roster: w.roster });
  const ids = Object.keys(r.cibles).filter(id => r.cibles[id] && r.cibles[id].total > 0 && r.compteurs[id]);
  /* (14/11/2026) écart mesuré à la FOURCHETTE de la part exacte (générateur 2026-11-14.1) */
  const fk = (id, ax) => { const ex = (r.partExacte[id] || {})[ax]; const v = r.compteurs[id][ax] || 0;
    if (ex === undefined) return v - (r.cibles[id][ax] || 0); const lo = Math.floor(ex + 1e-9), hi = Math.ceil(ex - 1e-9); return v < lo ? v - lo : (v > hi ? v - hi : 0); };
  let n1 = 0, n2 = 0; ids.forEach(id => AXES.forEach(ax => { const e = Math.abs(fk(id, ax)); if (e >= 1.5) n2++; else if (e >= 0.5) n1++; }));
  /* (14/11/2026) écart entre collègues de même part : excès au-delà de 1, compteur par compteur */
  let ec = 0; AXES.forEach(ax => { const g = {}; ids.forEach(id => { const ex = (r.partExacte[id] || {})[ax]; if (ex === undefined) return; const k = ex.toFixed(3); (g[k] = g[k] || []).push(r.compteurs[id][ax] || 0); });
    Object.values(g).forEach(v => { if (v.length > 1) ec += Math.max(0, Math.max(...v) - Math.min(...v) - 1); }); });
  /* garde, repos, garde (hors vendredi-dimanche) et gardes par MAR, lus sur le planning écrit */
  let grg = 0, nuits = 0; const ecrit = {};
  Object.keys(P.byDoc).forEach(id => { const g = Object.keys(P.byDoc[id]).filter(d => P.byDoc[id][d] === 'G' || P.byDoc[id][d] === 'G2').sort(); ecrit[id] = g.length; nuits += g.length;
    g.forEach(d => { const d2 = A.addD(d, 2); if (A.DOW(d) !== 5 && (P.byDoc[id][d2] === 'G' || P.byDoc[id][d2] === 'G2')) grg++; }); });
  const souhaits = Object.values(r.souhaits || {}).reduce((t, x) => t + (x.honores || 0), 0);
  const meme = ids.every(id => ecrit[id] === r.compteurs[id].total);
  return { r, n1, n2, ec, grg, nuits, inv: inv.errs, souhaits, meme, app: (r.optim || {}).appariement, sansBinome: r.sansBinome, logs: a.logs };
}
console.log('\n═══ 1. Trois campagnes fictives, passe allumée puis coupée ═══');
const W = [monde(1), monde(2), monde(3)];
const ON = W.map(w => passer(w, true)), OFF = W.map(w => passer(w, false));
V('les trois campagnes se génèrent, passe allumée', ON.every(x => !x.err), ON.map(x => x.err));
V('contre-preuve : les mêmes campagnes se génèrent, passe coupée', OFF.every(x => !x.err), OFF.map(x => x.err));
if (ON.every(x => !x.err) && OFF.every(x => !x.err)) {
  V('passe coupée : aucun bilan d\'appariement (la contre-preuve coupe bien la passe)', OFF.every(x => !x.app));
  V('passe allumée : un bilan d\'appariement est rendu par le calcul à blanc', ON.every(x => x.app && typeof x.app.avant === 'number'));
  /* (14/11/2026) la passe arbitre désormais entre « hors fourchette » et « écart entre collègues » (même
     poids) : elle peut accepter un compteur hors fourchette de plus pour défaire un écart de 2 entre
     collègues. On juge donc la somme des deux. */
  V('jamais plus d\'écarts (hors fourchette + écarts entre collègues) qu\'avec la passe coupée', ON.every((x, i) => x.n1 + x.ec <= OFF[i].n1 + OFF[i].ec), ON.map((x, i) => [x.n1 + '+' + x.ec, OFF[i].n1 + '+' + OFF[i].ec]));
  V('au moins une campagne où la passe en retire (sinon ce scénario ne prouve rien)', ON.some((x, i) => x.n1 + x.ec < OFF[i].n1 + OFF[i].ec), ON.map((x, i) => [x.n1 + x.ec, OFF[i].n1 + OFF[i].ec]));
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
  console.log('\n═══ 3 bis. Le relais : un troisième MAR sert d\'intermédiaire ═══');
  V('le relais est présent, allumé en production, et le banc peut le couper', /const _relais = \(fin\) =>/.test(bloc) && /function _relaisOn_\(\)\{ return \(typeof __BANC_RELAIS__ === 'boolean'\) \? __BANC_RELAIS__ : true; \}/.test(SRC));
  V('deux parcours depuis le même planning, le moins coûteux est gardé', /_parcours\(true, /.test(bloc) && /_parcours\(false, /.test(bloc) && /_pA\.tot < _pB\.tot/.test(bloc) && /_defaire\(_pA\.jnl\)/.test(bloc));
  const SR = W.map(w => passer(w, true, true));
  V('contre-preuve : les mêmes campagnes se génèrent, relais coupé', SR.every(x => !x.err), SR.map(x => x.err));
  if (SR.every(x => !x.err)) {
    V('relais coupé : le bilan n\'en compte aucun (la contre-preuve coupe bien le relais)', SR.every(x => x.app && x.app.relais === 0), SR.map(x => x.app && x.app.relais));
    V('relais allumé : au moins un relais joué sur ces campagnes (sinon ce scénario ne prouve rien)', ON.some(x => x.app.relais > 0), ON.map(x => x.app.relais));
    /* (14/11/2026) Depuis la fourchette et l'écart entre collègues, le relais n'améliore plus aucun résultat
       mesuré (2027 réel ; 9 années fictives : joué sur 3, même résultat sans lui). Il est gardé parce qu'il
       ne coûte rien ; on vérifie seulement qu'il ne fait jamais moins bien. */
    V('jamais plus d\'écarts (hors fourchette + écarts entre collègues) qu\'avec le relais coupé', ON.every((x, i) => x.n1 + x.ec <= SR[i].n1 + SR[i].ec), ON.map((x, i) => [x.n1 + x.ec, SR[i].n1 + SR[i].ec]));
    V('aucun compteur à 2 gardes de sa cible de plus qu\'avec le relais coupé', ON.every((x, i) => x.n2 <= SR[i].n2), ON.map((x, i) => [x.n2, SR[i].n2]));
    V('aucune règle dure de plus enfreinte, aucune « garde, repos, garde » de plus qu\'avec le relais coupé', ON.every((x, i) => x.inv.length <= SR[i].inv.length && x.grg <= SR[i].grg), ON.map((x, i) => [x.inv.length, SR[i].inv.length, x.grg, SR[i].grg]));
    V('la recherche n\'est écourtée sur aucune campagne (sinon le calcul à blanc et la génération pourraient différer)', ON.every(x => !x.app.coupe), ON.map(x => [x.app.coupe, x.app.ms]));
  }
  console.log('\n═══ 4. Pendant le choix du tirage, la passe ne tourne pas ═══');
  { const ctx = h.buildContext(h.makeSpreadsheet(feuilles(W[0])), [], SRC); ctx.__BANC_OPTIM_ITERS__ = ITERS;
    const r = ctx.generateGardes(YEAR, { dryRun: true, tirage: 1, selection: true });
    V('calcul à blanc de sélection : pas de passe d\'appariement', !r.optim || !r.optim.appariement); }
}
console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
