/* ═══ BANC — PLACEMENTS CADUCS : plus de fantômes, plus de bruit (24/08/2026) ═══
   Deux défauts corrigés, deux fonctions pures testées ici sur les VRAIS
   fichiers du dépôt :
   1. _caducsFusionner_ (code.gs) — la mémoire d'un mois publié est TOUTE
      remplacée, y compris par rien : un mois redevenu propre efface ses
      vieilles entrées (avant, elles survivaient pour toujours) ;
   2. _caducsTrier_ (Indispos.gs) — le Diagnostic n'avertit que pour
      l'avenir ; le passé devient une ligne d'information. */
const vm = require('vm');
const fs = require('fs');
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 160) : '')); } };

const ctx = vm.createContext({ console, JSON, String, Array, Object });
vm.runInContext(extraireFonction('../gas/code.gs', '_caducsFusionner_'), ctx);
vm.runInContext(extraireFonction('../gas/Indispos.gs', '_caducsTrier_'), ctx);
const fusionner = (a, b, c) => vm.runInContext('_caducsFusionner_(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ',' + JSON.stringify(c) + ')', ctx);
const trier = (a, b) => vm.runInContext('_caducsTrier_(' + JSON.stringify(a) + ',' + JSON.stringify(b) + ')', ctx);

console.log('\n═══ F1. La fusion : un mois propre efface ses fantômes ═══');
{
  const fantomes = [
    { mois: 'Janvier 2027', marId: 'SUREAU', date: '2027-01-04', statut: 'F' },
    { mois: 'Janvier 2027', marId: 'VALLET', date: '2027-01-07', statut: 'RG' },
    { mois: 'Juin 2026', marId: 'SUREAU', date: '2026-06-25', statut: 'RG' },
  ];
  const r = fusionner(fantomes, 'Janvier 2027', []);
  V('publier Janvier 2027 SANS conflit efface ses deux fantômes', !r.some(x => x.mois === 'Janvier 2027'), r);
  V('les entrées des AUTRES mois sont intactes', r.length === 1 && r[0].date === '2026-06-25', r);

  const r2 = fusionner(fantomes, 'Juin 2026', [{ marId: 'SUBLET', date: '2026-06-30', statut: 'RG' }]);
  V('publier un mois AVEC conflits remplace tout son lot', r2.filter(x => x.mois === 'Juin 2026').length === 1
    && r2.some(x => x.marId === 'SUBLET') && !r2.some(x => x.date === '2026-06-25'), r2);
  V('les nouvelles entrées portent bien le mois publié', r2.find(x => x.marId === 'SUBLET').mois === 'Juin 2026');
  V('une mémoire absente (null) ne casse rien', fusionner(null, 'Mai 2026', []).length === 0);

  const gros = Array.from({ length: 250 }, (_, i) => ({ mois: 'Mars 2026', marId: 'X' + i, date: '2026-03-01', statut: 'F' }));
  const r3 = fusionner(gros, 'Avril 2026', [{ marId: 'Y', date: '2026-04-02', statut: 'V' }]);
  V('plafond à 200, les plus récentes gagnent', r3.length === 200 && r3[r3.length - 1].marId === 'Y', r3.length);
}

console.log('\n═══ F2. Le tri : seul l\'avenir avertit ═══');
{
  const auj = '2026-08-24';
  const r = trier([
    { marId: 'SUREAU', date: '2026-06-25', statut: 'RG' },       // passé
    { marId: 'PELLETIER', date: '2026-08-28', statut: 'F' },     // futur
    { marId: 'DURAND', date: '2026-08-24', statut: 'CP' },     // aujourd'hui
    { marId: 'VALLET', date: '2027-01-07', statut: 'RG' },      // futur lointain
  ], auj);
  V('le passé part en information', r.passes.length === 1 && r.passes[0].date === '2026-06-25', r.passes);
  V("aujourd'hui compte comme à venir", r.futurs.some(x => x.date === '2026-08-24'));
  V('les à-venir sont tous là (3)', r.futurs.length === 3, r.futurs.map(x => x.date));
  V('liste vide → rien nulle part', trier([], auj).futurs.length === 0 && trier([], auj).passes.length === 0);
  V('mémoire absente (null) → rien, sans casser', trier(null, auj).futurs.length === 0);
}

console.log('\n═══ F3. Les blocs appelants, dans les vrais fichiers ═══');
{
  const code = fs.readFileSync('../gas/code.gs', 'utf8');
  const ind = fs.readFileSync('../gas/Indispos.gs', 'utf8');
  const iIf = code.indexOf('if (planningCaducs.length)');
  const iSet = code.indexOf("setProperty('PLANNING_CADUCS'");
  const finIf = code.indexOf('}', code.indexOf('autre(s)`', iIf));
  V("l'écriture de la mémoire est SORTIE du « si conflits » (elle suit sa fermeture)",
    iIf > -1 && iSet > finIf && code.slice(iSet - 400, iSet).includes('_caducsFusionner_(') === false
    && code.includes('_caducsFusionner_(_prec, label, planningCaducs)'));
  V('le Diagnostic trie via _caducsTrier_ et n\'avertit que pour l\'avenir',
    ind.includes('_caducsTrier_(_cad, _auj)') && ind.includes('À VENIR ignoré(s)'));
  V('le passé descend en ℹ️, jamais en ⚠️',
    /info\(`\$\{_tri\.passes\.length\} placement\(s\) passé\(s\)/.test(ind));
  // (25/08/2026) Le test figeait les deux versions en dur : toute évolution
  // ultérieure de ces fichiers cassait le banc pour une raison sans rapport.
  // Il vérifie désormais que chacune est AU MOINS celle du lot « caducs ».
  {
    const _v = (t, cle) => (t.match(new RegExp(cle + " = '(\\d{4}-\\d{2}-\\d{2})\\.(\\d+)'")) || []).slice(1);
    const _auMoins = (v, ref) => v.length === 2 && (v[0] > ref[0] || (v[0] === ref[0] && Number(v[1]) >= Number(ref[1])));
    const vC = _v(code, 'GAS_VERSION_CODE'), vI = _v(ind, 'GAS_VERSION_INDISPOS');
    V('versions au moins égales à celles du lot caducs (2026-08-24.1)',
      _auMoins(vC, ['2026-08-24', '1']) && _auMoins(vI, ['2026-08-24', '1']),
      { code: vC.join('.'), indispos: vI.join('.') });
  }
}

console.log(`\nbanc_caducs : ${ok} ✓ / ${ko} ✗`);
if (ko) process.exit(1);
