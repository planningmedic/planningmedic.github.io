/* ═══ BANC — STAFF VACANCES : CONGÉS LONGS VISIBLES (09/10/2026) ═════════════
   Défaut constaté le jour du staff : l'écran ne retenait que VAC et FORM.
   Un congé long (CL) n'apparaissait pas, ne comptait ni dans les absents du
   jour ni dans le vivier de garde, et sa case restait cliquable — une VAC
   posée dessus l'aurait écrasé à la validation.
   Les fonctions sont EXTRAITES de staff.html, jamais recopiées. */
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'staff.html'), 'utf8');
function extraire(nom) {
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error(nom + ' introuvable');
  let p = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') p++; else if (src[j] === '}') { p--; if (!p) break; } }
  return src.slice(i, j + 1);
}
function ligneConst(nom) {
  const i = src.indexOf('const ' + nom + '=');
  if (i < 0) throw new Error('const ' + nom + ' introuvable');
  return src.slice(i, src.indexOf('\n', i));
}
const ctx = vm.createContext({ Date, Set, String, Object, Number, Math, Array, RegExp, console });
ctx.medecins = [{ id: 'A', pctGardes: 100 }, { id: 'B', pctGardes: 100 }, { id: 'C', pctGardes: 100 }];
ctx.saisies = { A: { '2027-02-22': 'VAC' }, B: {}, C: {} };
ctx.congesLongs = { B: { '2027-02-22': true, '2027-02-27': true } };
ctx.toasts = []; ctx.showToast = m => ctx.toasts.push(m);
ctx.horsAnneePlanning = () => false; ctx.vacHS = false; ctx.isScolaire = () => true;
ctx.locked = {}; ctx.currentType = 'VAC'; ctx.updateStatsBar = () => {}; ctx.renderCurrent = () => {};
vm.runInContext(ligneConst('estCL'), ctx);
['VIVIER_MINI', 'VIVIER_CONFORT', 'ANCRE_2SUR2', 'JOURS_CODE'].forEach(n => {
  const i = src.indexOf('const ' + n); vm.runInContext(src.slice(i, src.indexOf(';', i) + 1), ctx);
});
['isWeekend', 'semaineOff2sur2', 'gardeurDispo', 'vivierGarde', 'countForDay', 'toggleDay'].forEach(f => vm.runInContext(extraire(f), ctx));

console.log('\n— Congés longs au staff vacances —');
V('un jour ouvré : VAC de A + CL de B = 2 absents', ctx.countForDay('2027-02-22') === 2, ctx.countForDay('2027-02-22'));
V('un jour sans CL ni VAC : 0 absent', ctx.countForDay('2027-02-23') === 0, ctx.countForDay('2027-02-23'));
V('samedi : B en congé long ne compte pas dans le vivier (2 sur 3)', ctx.vivierGarde('2027-02-27') === 2, ctx.vivierGarde('2027-02-27'));
ctx.toggleDay('B', '2027-02-22');
V('clic sur une case CL : rien n\'est posé', !ctx.saisies.B['2027-02-22'], ctx.saisies.B);
V('clic sur une case CL : un message le dit', /Congé long/.test(ctx.toasts.join(' ')), ctx.toasts);
ctx.toggleDay('B', '2027-02-23');
V('le jour d\'après, hors CL, la VAC se pose normalement', ctx.saisies.B['2027-02-23'] === 'VAC', ctx.saisies.B);
V('les CL ne sont jamais dans les saisies renvoyées au serveur', !Object.values(ctx.saisies).some(o => Object.values(o).includes('CL')));
V('le chargement range CL à part (code présent dans la page)', /if\(val==='CL'\)\{congesLongs\[m\.id\]\[date\]=true;return;\}/.test(src));
console.log('\nbanc_staff_cl : ' + ok + ' ✓, ' + ko + ' ✗');
process.exit(ko ? 1 : 0);
