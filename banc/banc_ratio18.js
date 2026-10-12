/* ═══ BANC — LA PART DE 18h DES PROFILS « SEULEMENT 18h » (12/10/2026) ═════
   POURQUOI CE SCÉNARIO EXISTE.
   Un MAR qui ne fait pas de gardes de nuit fait des 18h à la place, avec un
   bonus (RATIO_18) appliqué à sa quotité. À 1,3, un tel profil à 60 % pesait
   0,78 part et tombait à 9 soirées par an : une de trop, selon le
   responsable. Le bonus passe à 1,2 : 0,72 part, soit 8.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Le bonus vaut 1,2, et c'est la seule pondération propre aux 18h.
   2. Sur une année complète, un profil fictif « seulement 18h » à 60 % a une
      part de 8 et un temps plein du même type une part de 14 (12 pour un
      temps plein ordinaire) ; chacun reçoit sa part à une soirée près.
   3. Contre-épreuve : le même scénario rejoué avec l'ancien bonus (1,3) donne
      9 au profil à 60 % — sans elle, ce fichier validerait n'importe quoi.
   Effectif fictif (simulateur/), aucun nom réel. Le vrai générateur est
   exécuté ; seule une ligne d'observation est ajoutée pour lire les parts. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const ANCRE = 'allDoctors.forEach(id=>{h18T[id]=Math.round(baseT*w18(id));h18cnt[id]=0;});';

/* L'effectif par défaut du simulateur, dont les deux profils « sans garde »
   deviennent « seulement 18h » : l'un à temps plein, l'autre à 60 %. Deux
   temps pleins en moins pour que la part de base d'un temps plein (≈ 11,8)
   soit celle d'un service réel de cette taille : c'est là que 1,2 et 1,3
   tombent de part et d'autre de l'arrondi (0,72 × 11,77 = 8,47 → 8 ; 0,78 × 11,77 = 9,18 → 9). */
const RETIRES = ['ZEVACO', 'VALLET'];
const ROSTER = H.defaultRoster().filter(r => !RETIRES.includes(r[0])).map(r => {
  if (r[0] === 'BOISSY') return ['BOISSY', 0, 100, { noGarde: 1, only18: 1 }];
  if (r[0] === 'BRIAND') return ['BRIAND', 0, 60, { noGarde: 1, only18: 1 }];
  return r;
});

function generer(src) {
  if (!src.includes(ANCRE)) throw new Error('ancre des parts de 18h introuvable');
  src = src.replace(ANCRE, ANCRE + 'globalThis.__parts18=Object.assign({__base:baseT},h18T);');
  const ss = H.makeSpreadsheet([H.makeSheet('MEDECINS', H.medecinsRows(ROSTER)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, ROSTER, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)), H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = H.buildContext(ss, [], src);
  ctx.generateGardes(YEAR, { tirage: 1 });
  const parts = require('vm').runInContext('globalThis.__parts18', ctx);
  const recu = {};
  ss.getSheetByName(`GARDES_${YEAR}`)._rows.forEach(r => { recu[r[0]] = r.filter(v => String(v) === '18').length; });
  return { parts, recu };
}

console.log('\n═══ 1. Le bonus « seulement 18h » ═══');
V('RATIO_18 vaut 1,2', /^const RATIO_18\s*=\s*1\.2;/m.test(SRC));
V('le poids d\'un 18h = quotité × bonus × présence, rien d\'autre',
  /const w18=id=>\(\(quot\[id\]\|\|100\)\/100\)\*\(ONLY_18\.has\(id\)\?RATIO_18:1\)/.test(SRC));

console.log('\n═══ 2. Les parts sur une année complète ═══');
const r = generer(SRC);
console.log('     part de base d\'un temps plein : ' + r.parts.__base.toFixed(2));
V('« seulement 18h » à 60 % : part de 8 (était 9 à 1,3)', r.parts.BRIAND === 8, r.parts.BRIAND);
V('« seulement 18h » à temps plein : part de 14', r.parts.BOISSY === 14, r.parts.BOISSY);
V('temps plein ordinaire : part de 12', r.parts.AUBERT === 12, r.parts.AUBERT);
['BRIAND', 'BOISSY'].forEach(id =>
  V(id + ' reçoit sa part à une soirée près (' + r.recu[id] + ' pour ' + r.parts[id] + ')',
    Math.abs(r.recu[id] - r.parts[id]) <= 1, { recu: r.recu[id], part: r.parts[id] }));

console.log('\n═══ 3. Contre-épreuve : l\'ancien bonus donnait 9 ═══');
const avant = generer(SRC.replace(/^const RATIO_18\s*=\s*1\.2;/m, 'const RATIO_18      = 1.3;'));
V('à 1,3, le même profil à 60 % avait une part de 9', avant.parts.BRIAND === 9, avant.parts.BRIAND);

console.log('\n' + ok + ' ✓   ' + ko + ' ✗');
if (ko) process.exit(1);
