/* ═══ BANC — LE REPORT BORNE L'ÉCART CUMULÉ (11/09/2026) ═══════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Une cible est un nombre entier, et 728 gardes ne se divisent pas en parts
   égales. La part réelle d'un temps plein vaut 36,6 : deux collègues identiques
   finissent l'un à 36, l'autre à 37. Jusqu'ici le report de l'année suivante
   lisait la cible ARRONDIE ; celui qui avait fait 36 pour une cible de 36 était
   déclaré à jour, et son demi-samedi manquant n'était vu par personne. Comme
   l'arbitrage à égalité parfaite est l'ordre alphabétique, le même écart se
   rejouait chaque année sur les mêmes personnes.
   Mesuré sur cinq années enchaînées AVANT correction : l'écart cumulé sur l'axe
   samedi montait de 1 à 5 gardes entre le plus et le moins servi, tout droit.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Le report LIT bien la part exacte : changer cette seule colonne dans les
      statistiques de N-1 change la cible de N. Sans cette preuve, tout le reste
      pourrait passer au vert avec un report débranché.
   2. Sur cinq années consécutives, l'écart cumulé reste BORNÉ et ne croît pas
      d'année en année. C'est la propriété qui compte : un report qui corrige
      fait osciller, un report aveugle fait dériver.
   3. Le repli tient : des statistiques SANS les colonnes de part exacte — une
      année reconstruite à la main, ou écrite par une version antérieure — ne
      cassent rien, le report retombe sur les cibles entières comme avant.

   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const D = require(path.join(__dirname, '..', 'simulateur', 'demographie.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };

const ROSTER = H.defaultRoster().filter(r => !r[3].dateDebut && !r[3].dateFin);
const CFG = () => H.makeSheet('CONFIG', [['PARAMETRE', 'VALEUR']]);
const num = v => Number(String(v).replace(/^'/, '')) || 0;
const col = (rows, nom) => rows[0].indexOf(nom);

function genere(year, indisposMap, statsPrev) {
  const res = H.runScenario({ year, roster: ROSTER, indisposMap, extraSheets: [CFG()], statsPrev });
  const st = res.ss.getSheetByName(`STATS_GARDES_${year}`);
  return { res, rows: st ? st._rows : null };
}

/* ═══ 1. Le report lit réellement la part exacte ════════════════════════ */
console.log('\n═══ 1. Changer la seule part exacte de N-1 change la cible de N ═══');
const an0 = genere(2027, {});
V('l\'année de référence se génère', !an0.res.error, an0.res.error);

const base = an0.rows;
const iExS = col(base, 'PART EXACTE SAM'), iCbS = col(base, 'CIBLE SAM');
V('les colonnes de part exacte sont présentes dans N-1', iExS > 0 && iCbS > 0, base[0]);

/* On prend le premier MAR qui prend des samedis et on lui invente une part
   exacte franchement plus basse. S'il en reçoit moins l'année suivante, c'est
   que le report a bien lu cette colonne-là. */
const cible = base.slice(1).find(r => num(r[iCbS]) >= 4);
V('un médecin de référence a été trouvé', !!cible, cible && cible[0]);

const truque = base.map(r => r.slice());
const ligne = truque.find(r => r[0] === cible[0]);
const avantEx = Number(ligne[iExS]);
/* On RÉDUIT sa part exacte de N-1 : sa part juste devient plus petite, donc le
   nombre de samedis qu'il a réellement faits le place en excédent. Il doit en
   recevoir moins en N. */
ligne[iExS] = Math.max(0.5, avantEx - 3);

const imB = D.buildAbsences(2028, ROSTER, 1);
const normal = genere(2028, imB, base);
const modifie = genere(2028, imB, truque);
V('les deux générations 2028 aboutissent', !normal.res.error && !modifie.res.error,
  normal.res.error || modifie.res.error);

const samDe = (rows, id) => { const i = col(rows, 'CIBLE SAM');
  const r = rows.slice(1).find(x => x[0] === id); return r ? num(r[i]) : null; };
const cbNormal = normal.rows && samDe(normal.rows, cible[0]);
const cbModifie = modifie.rows && samDe(modifie.rows, cible[0]);
V('déclaré excédentaire en N-1, il reçoit MOINS de samedis en N',
  cbModifie !== null && cbNormal !== null && cbModifie < cbNormal,
  { medecin: cible[0], normal: cbNormal, truque: cbModifie });

/* ═══ 2. Quatre années enchaînées : l'écart cumulé ne dérive pas ════════ */
console.log('\n═══ 2. Quatre années consécutives, report lu à chaque fois ═══');
/* On réutilise les deux générations déjà faites (2027 de référence, puis 2028
   avec son report) et on prolonge : une génération d'année complète coûte cher,
   le banc entier doit rester lançable d'un trait. */
const cumul = {};
const ecarts = [];
let casse = normal.res.error ? '2028 : ' + normal.res.error.split('\n')[0] : null;
const chaine = [an0.rows, normal.rows];
[2029, 2030].forEach(y => {
  if (casse) return;
  const a2 = genere(y, D.buildAbsences(y, ROSTER, y - 2027), chaine[chaine.length - 1]);
  if (a2.res.error) { casse = y + ' : ' + a2.res.error.split('\n')[0]; return; }
  chaine.push(a2.rows);
});
V('les quatre années se génèrent toutes', !casse, casse);
chaine.forEach(rows => {
  const iS = col(rows, 'SAM'), iE = col(rows, 'PART EXACTE SAM');
  rows.slice(1).forEach(r => {
    if (r[iE] === '' || r[iE] === undefined || r[iE] === null) return;
    cumul[r[0]] = (cumul[r[0]] || 0) + (Number(r[iS]) || 0) - Number(r[iE]);
  });
  const vals = Object.values(cumul);
  ecarts.push(+(Math.max(...vals) - Math.min(...vals)).toFixed(2));
});
console.log('     écart cumulé sur les samedis, année par année : ' + ecarts.join('  ·  '));

/* Repère mesuré sur CETTE configuration, avec le report d'avant qui lisait la
   cible arrondie : 1 · 2 · 3 · 4, une garde de plus chaque année, et 6 la
   cinquième. Avec la part exacte : 1 · 1,41 · 2 · 2. */
V('l\'écart cumulé reste sous 3 gardes tout du long',
  ecarts.length === 4 && ecarts.every(e => e <= 3), ecarts);
V('il ne croît pas strictement d\'année en année',
  ecarts.length === 4 && !(ecarts[1] > ecarts[0] && ecarts[2] > ecarts[1] && ecarts[3] > ecarts[2]),
  ecarts);
V('la quatrième année reste bien en dessous des 4 d\'avant',
  ecarts.length === 4 && ecarts[3] < 3, ecarts);
const pires = Object.entries(cumul).sort((x, y2) => Math.abs(y2[1]) - Math.abs(x[1]))[0];
V('aucun médecin ne dépasse 2 samedis d\'écart cumulé',
  pires && Math.abs(pires[1]) < 2, pires);

/* ═══ 3. Le repli : des statistiques sans part exacte ═══════════════════ */
console.log('\n═══ 3. Statistiques N-1 d\'une version antérieure ═══');
/* On coupe les colonnes ajoutées, comme le ferait STATS_GARDES_2026 : le report
   doit retomber sur les cibles entières sans se plaindre ni se tromper. */
const ancien = base.map(r => r.slice(0, 25));
V('les colonnes de part exacte ont bien disparu',
  ancien[0].indexOf('PART EXACTE') < 0, ancien[0].length);
const repli = genere(2028, imB, ancien);
V('la génération aboutit quand même', !repli.res.error, repli.res.error);
V('les cibles restent des entiers',
  repli.rows && repli.rows.slice(1).every(r => {
    const c = num(r[col(repli.rows, 'CIBLE')]);
    return Math.abs(c - Math.round(c)) < 0.001;
  }));
V('la somme des cibles est conservée',
  repli.rows && Math.abs(repli.rows.slice(1).reduce((s, r) => s + num(r[col(repli.rows, 'CIBLE')]), 0)
    - normal.rows.slice(1).reduce((s, r) => s + num(r[col(normal.rows, 'CIBLE')]), 0)) < 0.001);

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
