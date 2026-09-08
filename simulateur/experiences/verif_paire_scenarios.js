/* ═══ EXPÉRIENCE — LA RÈGLE DES PAIRES SOUS PLUSIEURS ANNÉES RÉALISTES ═══════
   (08/09/2026)

   CE QU'ON MESURE. Sur des années entières générées par le VRAI générateur du
   dépôt, combien de nuits les deux membres d'une paire à éviter se retrouvent
   tous les deux hors de la maison — garde commune, ou l'un de garde et l'autre
   de 18 h. La même année est générée deux fois : avec la règle, puis avec le
   même code privé de la règle. Sans cette contre-épreuve on ne saurait pas si
   la règle sert, ou si ces deux-là ne se croisaient simplement jamais.

   POURQUOI PLUSIEURS SCÉNARIOS. Une seule année prouve peu : ses congés
   peuvent, par chance, éloigner les deux personnes. On fait varier le volume
   d'indisponibilités, du service détendu au service sous tension, pour voir si
   la règle tient quand le moteur manque de candidats.

   CE QUE ÇA NE MESURE PAS. Les chiffres d'équité de l'année réelle : les
   souhaits des collègues ne sont pas ceux-ci. On éprouve une RÈGLE, pas 2027.

   Ce fichier ne modifie rien, ne se déploie pas, aucun déclencheur ne l'appelle.
   Lancer : node simulateur/experiences/verif_paire_scenarios.js */

const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'harness.js'));
const A = require(path.join(__dirname, '..', 'analyse.js'));

const YEAR  = Number(process.env.Y0 || 2027);
const PAIRE = (process.env.PAIRE || 'LEMAIRE+GARNIER').split('+');
const [P1, P2] = PAIRE;

/* Tirage à graine : chaque scénario est rejouable à l'identique, sinon les deux
   générations ne porteraient pas sur les mêmes données. */
function alea(graine) {
  let x = graine;
  return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function toutesLesDates(an) {
  const out = [], d = new Date(an, 0, 1, 12), fin = new Date(an, 11, 31, 12);
  for (; d <= fin; d.setDate(d.getDate() + 1))
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  return out;
}

/* Indisponibilités plausibles.
   ⚠️ LE VOCABULAIRE EST CELUI DU CLASSEUR, PAS UN VOCABULAIRE INVENTÉ.
   Première version de ce fichier : elle écrivait « V », « I », « F ». Le
   générateur attend VAC, INDISPO, FORM, TP, CL, CTP, SOUHAIT (ABSENT_STRUCT,
   generateur_gardes.gs) et ignore silencieusement tout le reste. Résultat :
   cinq scénarios différents produisaient le MÊME planning au bit près, et
   l'expérience ne mesurait rien du tout. Un jeu de données qui parle une autre
   langue que le code teste la croyance de celui qui l'écrit, pas le système.
   `charge` module le volume — 1 = service détendu, 3 = service sous tension. */
function indisposRealistes(an, roster, charge, graine) {
  const r = alea(graine), D = toutesLesDates(an), map = {};
  roster.forEach(([id]) => {
    map[id] = {};
    // 4 à 7 semaines de congés, par blocs de 7 jours
    const nbSem = 4 + Math.floor(r() * 4);
    for (let s = 0; s < nbSem; s++) {
      const debut = Math.floor(r() * (D.length - 8));
      for (let k = 0; k < 7; k++) map[id][D[debut + k]] = 'VAC';
    }
    // 2 à 4 journées de formation isolées
    const nbF = 2 + Math.floor(r() * 3);
    for (let f = 0; f < nbF; f++) map[id][D[Math.floor(r() * D.length)]] = 'FORM';
    // indisponibilités de garde ponctuelles, proportionnelles à la charge
    const nbI = Math.round((6 + r() * 10) * charge);
    for (let i = 0; i < nbI; i++) {
      const j = D[Math.floor(r() * D.length)];
      if (!map[id][j]) map[id][j] = 'INDISPO';
    }
    // quelques souhaits de garde, comme en campagne réelle
    const nbS = 2 + Math.floor(r() * 4);
    for (let w = 0; w < nbS; w++) {
      const j = D[Math.floor(r() * D.length)];
      if (!map[id][j]) map[id][j] = 'SOUHAIT';
    }
  });
  return map;
}

/* Génère une année. `src` permet d'injecter un générateur modifié. */
function genere(an, roster, map, config, src) {
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${an}`, H.indisposRows(an, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(an)),
    H.makeSheet('CONFIG', config),
  ]);
  const logs = [];
  const ctx = H.buildContext(ss, logs, src);
  let erreur = null;
  try { ctx.generateGardes(an); } catch (e) { erreur = e.message; }
  return { ss, logs, erreur };
}

/* Les nuits où AUCUN des deux n'est à la maison. Le 18 h compte : celui qui le
   fait rentre tard, la maison est vide pareil. */
function nuitsEnsemble(ss, an) {
  const P = A.parsePlanning(ss, an);
  const DEHORS = new Set(['G', 'G2', '18']);
  const EXEMPT = new Set([`${an}-12-24`, `${an}-12-25`, `${an}-12-31`, `${an + 1}-01-01`]);
  const out = [];
  P.dates.forEach(d => {
    const a = (P.byDoc[P1] || {})[d], b = (P.byDoc[P2] || {})[d];
    if (DEHORS.has(a) && DEHORS.has(b)) out.push({ d, a, b, exempt: EXEMPT.has(d) });
  });
  return out;
}

// ── La contre-épreuve : le même générateur, règle neutralisée ──
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const SANS = SRC.replace(/const evite = \([^)]*\) =>[^;]*;/,
                         'const evite = () => false;   // contre-épreuve');
if (SANS === SRC) {
  console.error("La neutralisation de la règle a échoué : l'expérience ne prouverait rien. Arrêt.");
  process.exit(1);
}

const CFG_AVEC = [['CLE', 'VALEUR'], ['PAIRES_A_EVITER', PAIRE.join('+')]];
const SCENARIOS = [
  { nom: 'service détendu',          charge: 1, graine: 101 },
  { nom: 'charge courante',          charge: 2, graine: 202 },
  { nom: 'charge courante (autre)',  charge: 2, graine: 303 },
  { nom: 'service sous tension',     charge: 3, graine: 404 },
  { nom: 'tension + congés lourds',  charge: 3, graine: 505 },
];

console.log(`\n  PAIRE ÉPROUVÉE : ${P1} + ${P2}     année ${YEAR}`);
console.log('  Une « nuit ensemble » = les deux dehors : G, G2 ou 18 h.\n');
console.log('  scénario                     sans la règle    avec la règle');
console.log('  ' + '─'.repeat(62));

let tAvec = 0, tSans = 0;
const restantes = [], mesures = [];
SCENARIOS.forEach(sc => {
  const roster = H.defaultRoster();
  const map = indisposRealistes(YEAR, roster, sc.charge, sc.graine);
  const rSans = genere(YEAR, roster, map, CFG_AVEC, SANS);
  const rAvec = genere(YEAR, roster, map, CFG_AVEC, null);
  if (rSans.erreur || rAvec.erreur) {
    console.log(`  ${sc.nom.padEnd(28)} ERREUR : ${rSans.erreur || rAvec.erreur}`);
    return;
  }
  const nSans = nuitsEnsemble(rSans.ss, YEAR);
  const nAvec = nuitsEnsemble(rAvec.ss, YEAR);
  tSans += nSans.length; tAvec += nAvec.length;
  nAvec.forEach(n => restantes.push(Object.assign({ sc: sc.nom }, n)));
  mesures.push({ nom: sc.nom,
    sans: A.equityStats(rSans.ss, YEAR, roster),
    avec: A.equityStats(rAvec.ss, YEAR, roster) });
  console.log(`  ${sc.nom.padEnd(28)} ${String(nSans.length).padStart(9)} ${String(nAvec.length).padStart(16)}`);
});

console.log('  ' + '─'.repeat(62));
console.log(`  ${'TOTAL — 5 années'.padEnd(28)} ${String(tSans).padStart(9)} ${String(tAvec).padStart(16)}\n`);

/* ── CE QUE LA RÈGLE COÛTE À L'ÉQUITÉ ──────────────────────────────────────
   Une contrainte qui interdit certaines combinaisons peut dégrader la
   répartition : le moteur a moins de marge. On mesure donc, sur les MÊMES
   données, l'écart max-min de chaque axe avec et sans la règle. Si les deux
   colonnes se ressemblent, la règle est gratuite. */
console.log('  ÉQUITÉ — écart entre le MAR le plus chargé et le moins chargé');
console.log('  (moyenne des 5 scénarios · plus le chiffre est bas, plus c\'est équitable)\n');
console.log('  axe                    sans la règle    avec la règle    écart');
console.log('  ' + '─'.repeat(62));
const AXES = [['total', 'total des gardes'], ['sam', 'samedis'], ['jeu', 'jeudis'],
              ['vd', 'vendredis'], ['jf', 'jours fériés'], ['vjf', 'veilles de férié']];
const cumul = { sans: {}, avec: {} };
AXES.forEach(([k]) => { cumul.sans[k] = []; cumul.avec[k] = []; });
const ecartsTot = { sans: [], avec: [] };
mesures.forEach(m => {
  AXES.forEach(([k]) => { cumul.sans[k].push(m.sans[k].spread); cumul.avec[k].push(m.avec[k].spread); });
  ecartsTot.sans.push(m.sans.devTotal[0].dev);
  ecartsTot.avec.push(m.avec.devTotal[0].dev);
});
const moy = t => t.reduce((a, b) => a + b, 0) / t.length;
AXES.forEach(([k, libelle]) => {
  const a = moy(cumul.sans[k]), b = moy(cumul.avec[k]);
  const d = b - a;
  console.log(`  ${libelle.padEnd(22)} ${a.toFixed(2).padStart(9)} ${b.toFixed(2).padStart(16)}    ${d > 0 ? '+' : ''}${d.toFixed(2)}`);
});
console.log('  ' + '─'.repeat(62));
console.log(`  ${'plus gros dépassement'.padEnd(22)} ${moy(ecartsTot.sans).toFixed(2).padStart(9)} ${moy(ecartsTot.avec).toFixed(2).padStart(16)}    ${(moy(ecartsTot.avec) - moy(ecartsTot.sans) > 0 ? '+' : '')}${(moy(ecartsTot.avec) - moy(ecartsTot.sans)).toFixed(2)}`);
console.log('  (en gardes au-dessus de la cible, pour le MAR le plus servi)\n');

/* L'écart brut max-min du total ne mesure PAS l'équité : il compare un MAR à
   100 % et un MAR à 50 %, qui n'ont pas la même cible. La seule lecture juste
   est l'écart de chacun À SA PROPRE CIBLE. C'est ce que montre le tableau
   ci-dessous : le plus servi et le moins servi, en gardes. */
console.log('  ÉCART À LA CIBLE — la seule mesure juste (chacun comparé à SON dû)');
console.log('  ' + '─'.repeat(76));
console.log('  scénario                     le plus servi              le moins servi');
mesures.forEach(m => {
  const d = m.avec.devTotal;
  const haut = d[0], bas = d[d.length - 1];
  console.log(`    ${m.nom.padEnd(26)} ${haut.id.padEnd(10)} ${(haut.dev > 0 ? '+' : '') + haut.dev.toFixed(1)}` +
              `        ${bas.id.padEnd(10)} ${(bas.dev > 0 ? '+' : '') + bas.dev.toFixed(1)}`);
});
const pires = mesures.map(m => Math.max(...m.avec.devTotal.map(x => Math.abs(x.dev))));
const piresSans = mesures.map(m => Math.max(...m.sans.devTotal.map(x => Math.abs(x.dev))));
console.log('  ' + '─'.repeat(76));
console.log(`  Pire écart à la cible, toutes années : ${Math.max(...piresSans).toFixed(1)} sans la règle · ` +
            `${Math.max(...pires).toFixed(1)} avec la règle (en gardes)\n`);

if (!restantes.length) {
  console.log('  Aucune nuit commune ne subsiste avec la règle active.\n');
} else {
  console.log('  Nuits subsistant malgré la règle :');
  restantes.forEach(r => console.log(
    `    ${r.d}  ${P1}=${r.a}  ${P2}=${r.b}   ${r.exempt ? '← date exemptée (Noël / Jour de l\'An)' : '← À EXPLIQUER'}   [${r.sc}]`));
  console.log('');
}
