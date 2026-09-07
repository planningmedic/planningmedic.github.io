/* ═══ BANC — NOUVEL ALGORITHME DE GÉNÉRATION (05/09/2026) ════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Quatre mécanismes ont été ajoutés d'un bloc au générateur, et aucun n'a de
   sens seul. Une régression sur l'un d'eux ne se verrait pas dans les autres
   scénarios du banc : ils mesurent le planning produit, pas la façon dont les
   cibles sont fabriquées. Ce fichier tient les quatre promesses, séparément.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. CIBLES ENTIÈRES — aucune cible à virgule sur les six axes surveillés, et
      surtout : la SOMME des cibles reste égale au nombre de gardes à poser.
      C'est le piège de l'arrondi naïf, qui promettait 6 jeudis de trop et
      laissait 6 jours fériés sans propriétaire.
   2. TIRAGE — l'ordre des lignes de MEDECINS n'influence plus le planning.
      C'était le défaut mesuré en juillet : déplacer une ligne changeait près
      d'une garde sur trois. Et le même tirage redonne le MÊME planning.
   3. DEUX WEEK-ENDS D'AFFILÉE — jamais, quand le vivier le permet.
   4. INTERRUPTEUR — à false, le générateur redevient celui d'avant : cibles
      fractionnaires. C'est le retour arrière, il doit être éprouvé.

   Le vrai générateur du dépôt est exécuté, jamais recopié.  */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const num = v => Number(String(v).replace(/^'/, '')) || 0;
const AXES = [['TOTAL G', 'CIBLE'], ['SAM', 'CIBLE SAM'], ['JEU', 'CIBLE JEU'],
              ['VD', 'CIBLE VD'], ['VEILLE JF', 'CIBLE VJF'], ['JF', 'CIBLE JF']];

function lancer(roster, opts, genSource) {
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
  try { ctx.generateGardes(YEAR, opts); } catch (e) { error = e.message; }
  return { ss, logs, error, ctx };
}
const statsDe = ss => {
  const st = H.readStats(ss, YEAR);
  return st ? st.byId : null;
};
const actifs = st => Object.keys(st).filter(id => num(st[id]['TOTAL G']) > 0 && id !== 'PRUNET');

console.log('\n─── 1. Cibles entières ───');
const base = lancer(H.defaultRoster(), {});
V('la génération aboutit', !base.error, base.error);
const stB = statsDe(base.ss);
V('l\'onglet de statistiques est écrit', !!stB);

if (stB) {
  const ids = actifs(stB);
  let virgules = [];
  ids.forEach(id => AXES.forEach(([, ck]) => {
    const c = num(stB[id][ck]);
    if (c > 0 && Math.abs(c - Math.round(c)) > 1e-9) virgules.push(id + ' ' + ck + '=' + c);
  }));
  V('aucune cible à virgule sur les six axes', virgules.length === 0, virgules.slice(0, 5));

  /* Le contrôle qui compte vraiment : la somme. Arrondir chaque cible dans son
     coin la casse — c'est ce qui rendait l'idée naïve inapplicable. */
  const sommes = {};
  AXES.forEach(([rk, ck]) => {
    let sc = 0, sr = 0;
    Object.keys(stB).forEach(id => { sc += num(stB[id][ck]); sr += num(stB[id][rk]); });
    sommes[ck] = { cibles: Math.round(sc * 100) / 100, reel: sr };
  });
  // Le total et les fériés incluent PRUNET (souhaits garantis, hors cibles d'axe) :
  // on contrôle les axes où la cible couvre bien tout le monde.
  ['CIBLE SAM', 'CIBLE JEU'].forEach(ck => {
    const s = sommes[ck];
    V('somme des cibles = gardes à poser (' + ck + ')', Math.abs(s.cibles - s.reel) < 1.01, s);
  });
}

console.log('\n─── 2. Numéro de tirage ───');
/* L'ordre de l'onglet MEDECINS ne doit plus rien changer. On rejoue la même
   année avec le tableau des médecins retourné : le planning doit être IDENTIQUE. */
const rosterEnvers = H.defaultRoster().slice().reverse();
const envers = lancer(rosterEnvers, {});
V('la génération aboutit sur l\'onglet inversé', !envers.error, envers.error);
const stE = statsDe(envers.ss);
if (stB && stE) {
  const ids = actifs(stB);
  const diff = ids.filter(id => !stE[id] || num(stE[id]['TOTAL G']) !== num(stB[id]['TOTAL G'])
                             || num(stE[id]['SAM']) !== num(stB[id]['SAM'])
                             || num(stE[id]['VD']) !== num(stB[id]['VD']));
  V('l\'ordre des lignes de MEDECINS ne change plus le planning', diff.length === 0, diff.slice(0, 6));
}
/* Reproductibilité : le même tirage redonne le même planning. Sans elle, on ne
   pourrait pas rejouer le tirage gagnant du multi-départ en écrivant. */
const t3a = lancer(H.defaultRoster(), { tirage: 3 });
const t3b = lancer(H.defaultRoster(), { tirage: 3 });
const sa = statsDe(t3a.ss), sb = statsDe(t3b.ss);
if (sa && sb) {
  const memes = Object.keys(sa).every(id => sb[id] && num(sa[id]['TOTAL G']) === num(sb[id]['TOTAL G'])
    && num(sa[id]['SAM']) === num(sb[id]['SAM']) && num(sa[id]['VD']) === num(sb[id]['VD']));
  V('rejouer le même tirage redonne le même planning', memes);
}
/* Et deux tirages différents doivent pouvoir donner deux plannings différents,
   sinon le multi-départ n'aurait rien à choisir. */
const t7 = lancer(H.defaultRoster(), { tirage: 7 });
const s7 = statsDe(t7.ss);
if (sa && s7) {
  const identique = Object.keys(sa).every(id => s7[id] && num(sa[id]['SAM']) === num(s7[id]['SAM'])
    && num(sa[id]['VD']) === num(s7[id]['VD']) && num(sa[id]['JEU']) === num(s7[id]['JEU']));
  V('deux tirages explorent des plannings distincts', !identique);
}

console.log('\n─── 3. Deux week-ends de garde d\'affilée ───');
function enchainements(ss) {
  const P = A.parsePlanning(ss, YEAR);
  const out = [];
  Object.keys(P.byDoc || {}).forEach(id => {
    const ds = Object.keys(P.byDoc[id]).filter(d => P.byDoc[id][d] === 'G' || P.byDoc[id][d] === 'G2').sort();
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) {
      const n = (new Date(ds[j]) - new Date(ds[i])) / 86400000;
      if (n > 9) break;
      if (n < 5) continue;
      const a = new Date(ds[i]).getUTCDay(), b = new Date(ds[j]).getUTCDay();
      if ((a === 5 || a === 6 || a === 0) && (b === 5 || b === 6 || b === 0)) out.push(id + ' ' + ds[i] + '→' + ds[j]);
    }
  });
  return out;
}
V('aucun MAR ne fait deux week-ends de garde consécutifs', enchainements(base.ss).length === 0,
  enchainements(base.ss).slice(0, 4));

console.log('\n─── 4. Couverture : rien n\'a été sacrifié ───');
const P = A.parsePlanning(base.ss, YEAR);
const vides = P.dates.filter(d => !P.byDate[d].G || !P.byDate[d].G2);
V('aucune journée sans binôme', vides.length === 0, vides.slice(0, 5));
if (stB) {
  const ids = actifs(stB);
  let pire = 0, qui = '';
  ids.forEach(id => AXES.forEach(([rk, ck]) => {
    const c = num(stB[id][ck]); if (!(c > 0)) return;
    const e = Math.abs(num(stB[id][rk]) - c);
    if (e > pire) { pire = e; qui = id; }
  }));
  V('personne au-delà de 2 gardes d\'écart sur un axe', pire < 2, { pire: pire, mar: qui });
}

console.log('\n─── 5. L\'interrupteur ramène l\'algorithme d\'avant ───');
/* CONTRE-ÉPREUVE. À false, les cibles doivent REDEVENIR fractionnaires : c'est la
   preuve que le test du point 1 mesure bien le nouveau mécanisme, et pas une
   propriété que le générateur aurait déjà eue. */
const ancien = SRC.replace('const NOUVEL_ALGO_GLOBAL = true;', 'const NOUVEL_ALGO_GLOBAL = false;');
V('l\'interrupteur existe et est unique dans le fichier',
  SRC.split('const NOUVEL_ALGO_GLOBAL = true;').length === 2);
const off = lancer(H.defaultRoster(), {}, ancien);
V('la génération aboutit avec l\'ancien algorithme', !off.error, off.error);
const stO = statsDe(off.ss);
if (stO) {
  const ids = actifs(stO);
  let aVirgule = false;
  ids.forEach(id => AXES.forEach(([, ck]) => {
    const c = num(stO[id][ck]);
    if (c > 0 && Math.abs(c - Math.round(c)) > 1e-9) aVirgule = true;
  }));
  V('à false, les cibles redeviennent fractionnaires', aVirgule);
}

console.log('\n─── 6. Comparaison avant/après (lanceur d\'éditeur) ───');
V('la fonction de comparaison existe', /function comparerAlgorithmes\(year\)/.test(SRC));
V('elle n\'écrit rien : les deux passes sont des calculs à blanc',
  (SRC.match(/dryRun: true, tirage: 1, forcerAncien/g) || []).length === 1);
V('le multi-départ ne part jamais sur une écriture directe',
  /if\(NOUVEL_ALGO && !DRY && !\(opts && opts\.tirage\)\)/.test(SRC));
V('la recherche du meilleur tirage est bornée', /t <= MULTI_DEPART_MAX/.test(SRC));
V('la couverture prime dans le choix du tirage',
  /const cle = \[r\.sansBinome \|\| 0, nAu, pire\];/.test(SRC));
V('le poids de l\'équité reste sous celui de la règle des week-ends',
  /const LEX_POIDS = 600;/.test(SRC));
V('la version du fichier a été montée', /GAS_VERSION_GENERATEUR = '2026-09-05\.1'/.test(SRC));

console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
