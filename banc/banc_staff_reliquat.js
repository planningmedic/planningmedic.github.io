/* ═══ BANC — STAFF VACANCES (COMITÉ) : LE RELIQUAT DANS L'ONGLET RÉCAP (27/11/2026) ═══
   La jauge du MAR prenait déjà ses VAC de janvier N+1 d'abord sur le reliquat
   de N ; la carte Récap du comité, elle, les comptait sur N+1 : 33 / 33 pour
   le comité, 31 / 33 pour le MAR. Même règle désormais, avec la petite ligne
   bleue « + 2/2 reliquat 2027 en janvier ».
   Les fonctions sont EXTRAITES de staff.html et du serveur, jamais recopiées. */
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
const ligne = (debut) => { const i = src.indexOf(debut); if (i < 0) throw new Error(debut + ' introuvable'); return src.slice(i, src.indexOf('\n', i)); };

const ctx = vm.createContext({ Date, Set, String, Object, Number, Math, Array, RegExp, console });
vm.runInContext(ligne('const nbFr='), ctx);
vm.runInContext('var currentYear = 2028, joursFeries = new Set(["2028-01-01"]), saisies = {}, demiVac = {}, RELIQUATS = null, medecins = [];', ctx);
['isWeekend', 'estChome', 'countForMAR', 'reliquatPris'].forEach(f => vm.runInContext(extraire(f), ctx));

// EX : 3 VAC début janvier 2028 + 30 en mars ; TE : ½ journée en janvier + 1 VAC en août.
const ouvres = (deb, n) => { const o = []; const d = new Date(deb + 'T12:00:00'); while (o.length < n) { const w = d.getDay(); if (w > 0 && w < 6) o.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); } return o; };
vm.runInContext('saisies = ' + JSON.stringify({
  EX: Object.fromEntries(['2028-01-03', '2028-01-04', '2028-01-05'].concat(ouvres('2028-03-06', 30)).map(d => [d, 'VAC'])),
  TE: { '2028-08-07': 'VAC' }, MO: { '2028-01-10': 'VAC' },
}) + '; demiVac = { TE: { "2028-01-11": "VM" } };', ctx);

console.log('\n— Ce que la carte Récap retire du quota —');
V('sans reliquat reçu (ancien serveur) : rien de retiré', ctx.reliquatPris('EX') === null);
vm.runInContext('RELIQUATS = { annee: 2027, campagne: 2028, parMar: { EX: { droit: 2, touteAnnee: false }, TE: { droit: 9, touteAnnee: true }, MO: { droit: 0 } } };', ctx);
const ex = vm.runInContext('JSON.parse(JSON.stringify(reliquatPris("EX")))', ctx);
V('EX, reliquat 2027 de 2 : 2 des 3 jours de janvier pris dessus → carte 33 − 2 = 31 / 33',
  ex && ex.pris === 2 && ex.droit === 2 && ex.annee === 2027 && vm.runInContext('countForMAR("EX","VAC") - reliquatPris("EX").pris', ctx) === 31, ex);
const te = vm.runInContext('JSON.parse(JSON.stringify(reliquatPris("TE")))', ctx);
V('TE, exception « toute l\'année » : ½ journée de janvier + 1 jour d\'août = 1,5 pris sur 9', te && te.pris === 1.5 && te.touteAnnee === true, te);
V('MO, reliquat à 0 : aucune ligne', vm.runInContext('reliquatPris("MO")', ctx) === null);
V('un MAR absent de la liste : aucune ligne', vm.runInContext('reliquatPris("ZZ")', ctx) === null);

console.log('\n— Câblage —');
V('la carte retire le pris et affiche « + pris/droit reliquat AAAA en janvier | sur l\'année »',
  /const vp=countForMAR\(m\.id,'VAC'\)-\(rel\?rel\.pris:0\)/.test(src)
  && /' reliquat '\+rel\.annee\+\(rel\.touteAnnee\?' sur l\\'année':' en janvier'\)/.test(src));
V('les reliquats ne valent que pour l\'année de campagne affichée', /RELIQUATS=\(pRes\.reliquats && Number\(pRes\.reliquats\.campagne\)===currentYear\) \? pRes\.reliquats : null;/.test(src));
const GS = require('./stubs').sourceGasTout() + fs.readFileSync(path.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');
V('le serveur les envoie avec la config du staff, par l\'action ET par la copie rapide',
  /quotasConges:_loadQuotasConges\(\), reliquats:reliquatsCampagne_\(\)\}/.test(GS) && /try \{ reliquats = reliquatsCampagne_\(\); \} catch \(e\) \{ reliquats = null; \}/.test(GS));

console.log('\n— reliquatsCampagne_ (le vrai serveur) —');
{
  const { socleReliquats } = require('./stubs');
  const sctx = vm.createContext({ console, Object, Number, String, Math });
  sctx.getIndisposYear = () => 2028;
  socleReliquats(sctx);
  const f = (() => { const T = fs.readFileSync(path.join(__dirname, '..', 'gas', 'temps_partiel.gs'), 'utf8');
    const i = T.indexOf('function reliquatsCampagne_('); let p = 0, j = T.indexOf('{', i);
    for (; j < T.length; j++) { if (T[j] === '{') p++; else if (T[j] === '}') { p--; if (!p) break; } } return T.slice(i, j + 1); })();
  vm.runInContext(f, sctx);
  sctx.reliquatsVac_ = () => ({ EX: 2, MO: 0, TE: 9 });
  sctx.reliquatsToutAnnee_ = () => ({ TE: true });
  const r = JSON.parse(JSON.stringify(vm.runInContext('reliquatsCampagne_()', sctx)));
  V('campagne 2028 : reliquats 2027, seuls les MAR qui en ont un', JSON.stringify(r) === JSON.stringify({ annee: 2027, campagne: 2028, parMar: { EX: { droit: 2, touteAnnee: false }, TE: { droit: 9, touteAnnee: true } } }), r);
}

console.log(`\n  ${ok} vérifications OK, ${ko} en échec`);
process.exit(ko ? 1 : 0);
