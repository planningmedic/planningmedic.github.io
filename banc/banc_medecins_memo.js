/* ═══ BANC — MEDECINS : une lecture par requête, des colonnes nommées (14/09/2026, chantier 8) ═══
   Le VRAI code de code.gs (COL_MED, _medecinsRows_, _medecinsInvalider_) tourne
   contre une feuille simulée qui compte ses lectures. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Classeur, extraireFonction, socleMedecins } = require('./stubs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
                         else { ko++; console.log('  ✗ ' + t, d === undefined ? '' : JSON.stringify(d)); } };
const CODE = fs.readFileSync(path.join(__dirname, '..', 'gas', 'code.gs'), 'utf8');

console.log('═══ 1. COL_MED dit la vérité sur l\'ordre des colonnes ═══');
{
  const col = JSON.parse((CODE.match(/^const COL_MED = Object\.freeze\((\{[^\n]*\})\);/m) || [])[1].replace(/(\w+):/g, '"$1":'));
  const entete = H.medecinsRows(H.defaultRoster())[0];   // l'en-tête que le simulateur reproduit du classeur
  const attendu = { ID: 'ID', NOM: 'NOM', INITIALES: 'INITIALES', QUOTITE: 'QUOTITE', PCT_GARDES: 'PCT_GARDES', CODE: 'CODE', EMAIL: 'EMAIL', DECT: 'DECT', DATE_DEBUT: 'DATE_DEBUT', DATE_FIN: 'DATE_FIN', NO_GARDE: 'NO_GARDE', ONLY_18: 'ONLY_18', NO_WEEKEND: 'NO_WEEKEND', RYTHME_2_2: 'RYTHME_2_2', SOUHAIT_PLAFOND: 'SOUHAIT_PLAFOND', TP_JOURS: 'TP_JOURS' };
  const ecarts = Object.entries(attendu).filter(([k, h]) => entete[col[k]] !== h).map(([k]) => k + '→' + entete[col[k]]);
  V('chaque nom de COL_MED tombe sur la bonne colonne de l\'en-tête (16 colonnes nommées)', ecarts.length === 0 && Object.keys(col).length === 17, ecarts);
  V('ACTIF est la colonne D (indice 3), celle que _buildMedecins_ lit depuis toujours', col.ACTIF === 3 && /actif:isO\(data\[r\]\[COL_MED\.ACTIF\]\)/.test(require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */));
}

console.log('\n═══ 2. Une requête = une lecture ═══');
{
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [['ID','NOM','INITIALES','ACTIF','QUOTITE','PCT_GARDES','CODE','EMAIL'],
    ['ALPHA','Dr Alpha','AL','O',100,100,'CODEALPH','al@exemple.mc'],
    ['BRAVO','Dr Bravo','BR','N',80,100,'CODEBRAV','br@exemple.mc']]);
  const feuille = cl.getSheetByName('MEDECINS'); let lectures = 0;
  const _gdr = feuille.getDataRange.bind(feuille); feuille.getDataRange = () => { lectures++; return _gdr(); };
  const ctx = vm.createContext({ console, String, Number, JSON, SpreadsheetApp: { getActiveSpreadsheet: () => cl } });
  ctx.globalThis = ctx; socleMedecins(ctx);
  vm.runInContext(extraireFonction(path.join(__dirname, '..', 'gas', 'code.gs'), 'getDoctorsFromMedecins'), ctx);
  const a = vm.runInContext('getDoctorsFromMedecins().map(d=>d.id)', ctx);
  const b = vm.runInContext('_medecinsRows_().length', ctx);
  const c = vm.runInContext('getDoctorsFromMedecins().length', ctx);
  V('trois lectures logiques (getDoctors ×2, _medecinsRows_) → UNE lecture de l\'onglet', lectures === 1 && a.length === 1 && b === 3 && c === 1, { lectures, a, b, c });
  vm.runInContext('_medecinsInvalider_()', ctx);
  vm.runInContext('_medecinsRows_()', ctx);
  V('après invalidation, l\'onglet est relu (nouvelle requête)', lectures === 2, lectures);
  feuille.getRange(3, 4).setValue('O');   // BRAVO devient actif : la doublure périme le memo
  const d = vm.runInContext('getDoctorsFromMedecins().map(d=>d.id)', ctx);
  V('une écriture périme le memo : le changement est vu', d.length === 2 && lectures === 3, { d, lectures });
  V('_medecinsRows_ ne passe JAMAIS par CacheService (la colonne CODE est un secret)', !/CacheService/.test(extraireFonction(path.join(__dirname, '..', 'gas', 'code.gs'), '_medecinsRows_')));
}

console.log('\n═══ 3. Plus de lecture directe de l\'onglet en dehors des trois écrivains ═══');
{
  const gas = ['Indispos.gs','gardes.gs','indisponibilites.gs','temps_partiel.gs','equipe.gs','diagnostic.gs','code.gs','generateur_gardes.gs','miroir.gs','portail.gs','setup_annee.gs','veille.gs','echanges.gs','journal.gs']
    .map(f => [f, fs.readFileSync(path.join(__dirname, '..', 'gas', f), 'utf8')]);
  let directes = 0, ecrivainsSansInvalidation = 0, memo = 0;
  gas.forEach(([f, s]) => {
    const L = s.split('\n');
    L.forEach((l, i) => {
      if (!/getSheetByName\('MEDECINS'\)/.test(l) || /function _medecinsRows_/.test(L[i-1] || '') || /^\s*\/\//.test(l)) return;
      const fenetre = L.slice(i, i + 40).join('\n');
      if (/_medecinsRows_\(\)/.test(fenetre)) { memo++; return; }
      const varSheet = (l.match(/(?:const|let|var)\s+(\w+)\s*=/) || [])[1];
      const ecrit = varSheet && new RegExp('\\b' + varSheet + '\\b\\s*\\.\\s*(getRange|appendRow)').test(fenetre);
      if (ecrit) { if (!/_medecinsInvalider_\(\)/.test(fenetre)) ecrivainsSansInvalidation++; }
      else directes++;
    });
  });
  V('toutes les lectures de MEDECINS passent par le memo (' + memo + ' sites)', directes === 0 && memo >= 30, { directes, memo });
  V('chaque écrivain périme le memo derrière son écriture', ecrivainsSansInvalidation === 0, ecrivainsSansInvalidation);
  const total = gas.reduce((n, [, s]) => n + (s.match(/COL_MED\.[A-Z_0-9]+/g) || []).length, 0);
  V('les colonnes sont nommées partout où l\'onglet est lu (≥ 120 usages de COL_MED)', total >= 120, total);
  V('la colonne EMAIL n\'est plus un « 7 » magique dans les lectures', !gas.some(([f, s]) => /_medecinsRows_\(\)[\s\S]{0,400}\]\[7\]/.test(s)));
}
console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
