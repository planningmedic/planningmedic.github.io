/* ═══ BANC — LA GARDE DE 18h RESPECTE LA FENÊTRE D'ACTIVITÉ ═══════════════
   Exécute le VRAI generateur_gardes.gs sur une année complète, via le
   harnais du simulateur, et recompte tout depuis la grille produite.

   ORIGINE (10/09/2026). Le générateur a cinq fonctions qui décident si un
   MAR est disponible un jour donné. Quatre vérifiaient les bornes
   date_debut / date_fin lues dans MEDECINS : indispoIndividuelle (les
   gardes), structAvail (les cibles), _rDispo et _rPresents (les
   récupérations). La cinquième, dispo18, ne les vérifiait pas — elle
   regardait les absences, la semaine « off » du rythme 2/2, les gardes déjà
   posées et les jours fixes de temps partiel, et s'arrêtait là.

   Relevé sur 2027 avant correctif, trois profils simulés : 18 soirées de
   18h attribuées à quelqu'un qui n'était pas dans le service ce jour-là
   (8 pour un départ en février, 4 pour un mi-temps partant en mars, 6 pour
   une arrivée en septembre). Sur les mêmes tirages, zéro G, G2, R ou RG
   hors fenêtre : la fuite était isolée à dispo18.

   CE QUE CE SCÉNARIO PROTÈGE. Une soirée de 18h attribuée à un absent n'est
   pas une case en trop sur un planning : elle est comptée comme POURVUE,
   et personne ne vient. C'est un trou de couverture que rien ne signale.

   CONTRE-ÉPREUVE incluse : le même scénario rejoué sur une copie du
   générateur privée du correctif doit ÉCHOUER. Sans elle, ce fichier
   validerait le comportement quel qu'il soit. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');

/* Trois profils D'ESSAI, entièrement fictifs — le dépôt est public, la
   configuration réelle du service vit dans le classeur et nulle part
   ailleurs. Ils couvrent les trois formes que prend une fenêtre partielle :
   un départ, un départ à temps réduit, une arrivée. */
const PROFILS = [
  { id: 'PARTANT',  pct: 100, quot: 100, flags: { dateFin:   '2027-02-08' }, borne: '2027-02-08', sens: 'fin' },
  { id: 'MITEMPS',  pct: 50,  quot: 50,  flags: { r2s2: 1, dateFin: '2027-03-01' }, borne: '2027-03-01', sens: 'fin' },
  { id: 'ARRIVANT', pct: 100, quot: 100, flags: { dateDebut: '2027-09-01' }, borne: '2027-09-01', sens: 'debut' },
  { id: 'TARDIF',   pct: 100, quot: 100, flags: { dateFin:   '2027-12-01' }, borne: '2027-12-01', sens: 'fin' },
];

function lancer(genSource) {
  const roster = H.defaultRoster().map(r => r.slice());
  PROFILS.forEach(p => roster.push([p.id, p.pct, p.quot, p.flags]));
  const sheets = [
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, {})),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ];
  const ss = H.makeSpreadsheet(sheets);
  const logs = [];
  const ctx = H.buildContext(ss, logs, genSource);
  let error = null;
  try { ctx.generateGardes(YEAR); } catch (e) { error = e.message; }
  return { ss, logs, error, ctx };
}

// Jours portant `code` pour ce MAR, situés HORS de sa fenêtre d'activité.
function horsFenetre(r, p, code) {
  const P = A.parsePlanning(r.ss, YEAR);
  const dd = P.byDoc[p.id] || {};
  return Object.keys(dd).filter(d => dd[d] === code)
    .filter(d => p.sens === 'fin' ? d >= p.borne : d < p.borne)
    .sort();
}
const compte = (r, p, code) => {
  const P = A.parsePlanning(r.ss, YEAR);
  const dd = P.byDoc[p.id] || {};
  return Object.keys(dd).filter(d => dd[d] === code).length;
};

console.log('\n═══ 1. Le correctif est bien dans le code, pas seulement dans ce test ═══');
/* Verrou : si quelqu'un retire les bornes de dispo18, ce test le dit AVANT
   de dérouler une année entière — et le message nomme la fonction. */
const BLOC18 = (SRC.match(/function dispo18\([^)]*\)\{([\s\S]*?)\n  \}/) || [])[1] || '';
V('dispo18 existe dans le générateur', BLOC18.length > 0);
V('dispo18 consulte FLAGS.dateDebut', /FLAGS\.dateDebut/.test(BLOC18), BLOC18.slice(0, 200));
V('dispo18 consulte FLAGS.dateFin', /FLAGS\.dateFin/.test(BLOC18), BLOC18.slice(0, 200));

console.log('\n═══ 2. Une année complète : aucune 18h hors fenêtre ═══');
const r = lancer();
V('la génération aboutit sans erreur', r.error === null, r.error);
let total18Hors = 0;
PROFILS.forEach(p => {
  const h = horsFenetre(r, p, '18');
  total18Hors += h.length;
  V(`${p.id} : aucune 18h ${p.sens === 'fin' ? 'après' : 'avant'} le ${p.borne}`, h.length === 0, h);
});

console.log('\n═══ 3. Les autres codes restent propres (non-régression) ═══');
/* Ces quatre-là respectaient déjà la fenêtre. Le correctif ne doit pas les
   déplacer : s'ils cassent, c'est que la correction a débordé. */
['G', 'G2', 'RG', 'R'].forEach(code => {
  let n = 0;
  PROFILS.forEach(p => { n += horsFenetre(r, p, code).length; });
  V(`aucun ${code} hors fenêtre, tous profils confondus`, n === 0, n);
});

console.log('\n═══ 4. Le service reste couvert : la correction ne crée pas de trou ═══');
/* Retirer trois personnes du vivier certains jours ne doit pas laisser une
   soirée sans personne. Le générateur crie « Aucun 18h {date} » dans ce cas. */
const cris = r.logs.filter(l => /Aucun 18h/.test(String(l)));
V('aucune soirée laissée sans 18h', cris.length === 0, cris.slice(0, 5));

console.log('\n═══ 5. La borne ne doit pas exclure de TOUT : un partant prend sa part ═══');
/* Défaut symétrique, et tout aussi faux : une borne trop large ferait lire
   date_fin comme « jamais éligible », et le MAR ne ferait plus aucune 18h de
   l'année. On le vérifie sur les DEUX fenêtres longues — TARDIF (11 mois) et
   ARRIVANT (4 mois) — et jamais sur une fenêtre courte : à 25 jours ouvrés et
   ~39 poses pour mille, l'espérance vaut 1,0, et exiger « au moins une » serait
   un pile ou face déguisé en test. Mesuré le 10/09 : le même profil rend 1 sur
   un tirage et 0 sur un autre, sans que rien ne soit cassé. */
[['TARDIF', 8], ['ARRIVANT', 3]].forEach(([id, plancher]) => {
  const p = PROFILS.find(x => x.id === id);
  V(`${id} garde une charge de 18h réelle (≥ ${plancher})`, compte(r, p, '18') >= plancher, compte(r, p, '18'));
});

console.log('\n═══ 5bis. La CHARGE de 18h est proratisée, pas seulement bornée ═══');
/* Borner sans proratiser ne suffit pas. Le pot des 18h se partage AU PRORATA
   DES POIDS : un poids calculé sur l'année pleine pour quelqu'un présent
   quatre mois lui fait rattraper son retard en se faisant servir en premier,
   et déplace la part de tous les autres — à commencer par les ONLY_18, dont
   le RATIO_18 est une compensation calculée sur ce partage.
   Mesuré le 10/09 avant proratisation : 113,6 poses pour mille jours ouvrés
   de présence contre 39,5 pour un temps plein, soit 2,9 fois trop.
   Bande large À DESSEIN : le plafond « une par semaine » et l'arrondi entier
   des cibles laissent un jeu réel, et un test serré ici deviendrait un test
   du tirage. C'est le facteur 3 qu'on interdit, pas l'écart de 10 %. */
function densite(res, id, ouvres) {
  const P = A.parsePlanning(res.ss, YEAR);
  const dd = P.byDoc[id] || {};
  return Object.keys(dd).filter(d => dd[d] === '18').length / ouvres * 1000;
}
function ouvresEntre(a, b) {
  let n = 0; const d = new Date(a + 'T12:00:00'), f = new Date(b + 'T12:00:00');
  for (; d < f; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w >= 1 && w <= 5) n++; }
  return n;
}
const REF = densite(r, 'AUBERT', ouvresEntre('2027-01-04', '2028-01-03'));
V('la référence temps plein est plausible (25 à 60 pour mille)', REF > 25 && REF < 60, REF.toFixed(1));
const densArr = densite(r, 'ARRIVANT', ouvresEntre('2027-09-01', '2028-01-03'));
V('un arrivant en cours d\'année reste dans la bande de l\'équipe (0,6 à 1,6 ×)',
  densArr > REF * 0.6 && densArr < REF * 1.6, { arrivant: densArr.toFixed(1), reference: REF.toFixed(1) });
console.log('    → arrivant : ' + densArr.toFixed(1) + ' pour mille · référence : ' + REF.toFixed(1));

console.log('\n═══ 6. CONTRE-ÉPREUVE : sans le correctif, le scénario échoue ═══');
/* On rejoue TOUT sur une copie du générateur d'où les deux bornes de dispo18
   ont été retirées. Si cette copie passe le test, le test ne prouve rien. */
const SANS = SRC
  .replace(/(function dispo18\(id,date\)\{\n)\s*const _dd18[^\n]*\n\s*if\(\(_dd18[^\n]*\n/, '$1')
  .replace(/\*\(weekdays\.length\?dispo18Cnt\[id\]\/weekdays\.length:0\)/, '');
V('la copie sans correctif est bien différente de l\'originale', SANS !== SRC);
const rSans = lancer(SANS);
V('la génération sans correctif aboutit aussi', rSans.error === null, rSans.error);
let fuites = 0;
const detail = [];
PROFILS.forEach(p => {
  const h = horsFenetre(rSans, p, '18');
  fuites += h.length;
  if (h.length) detail.push(p.id + ' : ' + h.length);
});
V('sans le correctif, des 18h fuient bien hors fenêtre (sinon ce test ne prouve rien)',
  fuites > 0, detail);
const densArrSans = densite(rSans, 'ARRIVANT', ouvresEntre('2027-09-01', '2028-01-03'));
V('sans proratisation, l\'arrivant sort bien de la bande (sinon ce test ne prouve rien)',
  densArrSans > REF * 1.6, densArrSans.toFixed(1));
console.log('    → arrivant sans proratisation : ' + densArrSans.toFixed(1) + ' pour mille');
console.log('    → sans correctif : ' + fuites + ' soirée(s) hors fenêtre [' + detail.join(' · ') + ']');
console.log('    → avec correctif : ' + total18Hors + ' soirée(s) hors fenêtre');

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
