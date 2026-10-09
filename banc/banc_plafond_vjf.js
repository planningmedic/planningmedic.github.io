/* ═══ BANC — RÉGIME À PART : VEILLE DE FÉRIÉ SOUHAITÉE (09/10/2026) ═══════
   POURQUOI CE SCÉNARIO EXISTE.
   Le régime à part (colonne SOUHAIT_PLAFOND de MEDECINS) interdisait toute
   garde la veille d'un férié. Ses souhaits passent pourtant en priorité
   absolue : un souhait posé sur une veille de férié était donc refusé en
   silence, et le MAR n'en savait rien avant la publication.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. Une veille de férié SOUHAITÉE par un profil à part lui est donnée.
   2. Une veille de férié NON souhaitée lui reste interdite (rien d'autre ne
      bouge pour lui : ni vendredi, ni week-end, ni férié).
   3. Contre-preuve : le générateur d'avant le correctif refuse ces mêmes
      souhaits — sans quoi le test ne prouverait rien.
   4. L'équité tient : sur quatre années enchaînées, aucun MAR ne s'écarte de
      sa cible de plus de 2 gardes, sur aucun type de garde (exigence du
      responsable, 09/10/2026).

   Effectif synthétique uniquement (simulateur/harness.js) : aucun nom réel.
   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const YEAR = 2027;
const PROFIL = 'PERRIN';                       // profil à part du roster synthétique
const VEILLES = ['2027-01-26', '2027-12-07'];  // mardis, veilles de férié (27/01 et 08/12)

function essai(indisposMap, genSource) {
  const roster = H.defaultRoster();
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, indisposMap)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ]);
  const ctx = H.buildContext(ss, [], genSource);
  return ctx.generateGardes(YEAR, { dryRun: true });
}
const titulaires = (r, d) => {
  const j = ((r.raresDetail || {}).vjf || []).find(x => x.date === d);
  return j ? [j.g, j.g2] : null;
};

/* ═══ 0. Le décor ═════════════════════════════════════════════════════ */
console.log('\n═══ 0. Les deux dates sont bien des veilles de férié ═══');
const base = essai({});
VEILLES.forEach(d => V(d + ' figure parmi les veilles de férié de ' + YEAR, !!titulaires(base, d)));
V('sans souhait, le profil à part n\'est sur AUCUNE veille de férié',
  ((base.raresDetail || {}).vjf || []).every(x => x.g !== PROFIL && x.g2 !== PROFIL),
  (base.raresDetail || {}).vjf);

/* ═══ 1. Souhaitée : donnée ═══════════════════════════════════════════ */
console.log('\n═══ 1. Une veille de férié souhaitée par le profil à part lui est donnée ═══');
const souhaits = { [PROFIL]: {} };
VEILLES.forEach(d => { souhaits[PROFIL][d] = 'SOUHAIT'; });
const avec = essai(souhaits);
VEILLES.forEach(d => {
  const t = titulaires(avec, d);
  V('il est de garde le ' + d, !!t && t.indexOf(PROFIL) >= 0, t);
});
V('le bilan des souhaits le confirme : 2 posés, 2 honorés',
  avec.souhaits && avec.souhaits[PROFIL] && avec.souhaits[PROFIL].poses === 2
  && avec.souhaits[PROFIL].honores === 2, avec.souhaits && avec.souhaits[PROFIL]);
V('l\'année reste entièrement pourvue', avec.sansBinome === 0, avec.sansBinome);

/* ═══ 2. Non souhaitée : toujours interdite ═══════════════════════════ */
console.log('\n═══ 2. Les autres veilles de férié lui restent interdites ═══');
const autres = ((avec.raresDetail || {}).vjf || []).filter(x => VEILLES.indexOf(x.date) < 0);
V('il y a d\'autres veilles de férié dans l\'année', autres.length > 0);
V('il n\'en tient aucune', autres.every(x => x.g !== PROFIL && x.g2 !== PROFIL), autres);

/* ═══ 3. Contre-preuve ═══════════════════════════════════════════════ */
console.log('\n═══ 3. Contre-preuve : avant le correctif, ces souhaits étaient refusés ═══');
let ancien = null;
try {
  /* b7f2e47 : dernier état du dépôt AVANT ce correctif. */
  ancien = execSync('git show b7f2e47:gas/generateur_gardes.gs',
                    { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { ancien = null; }
if (ancien) {
  const r0 = essai(souhaits, ancien);
  V('l\'ancien générateur ne lui donne aucune des deux veilles',
    VEILLES.every(d => { const t = titulaires(r0, d); return !t || t.indexOf(PROFIL) < 0; }));
} else {
  V('contre-preuve sautée (historique git indisponible ici)', true);
}

/* ═══ 4. L'équité tient, année après année ═══════════════════════════ */
console.log('\n═══ 4. Quatre années enchaînées : jamais plus de 2 gardes d\'écart à la cible ═══');
/* Exigence du responsable (09/10/2026) : donner ses veilles souhaitées au profil
   à part ne doit pas dégrader l'équité. Chaque année, sur chaque type de garde
   (total, samedi, jeudi, vendredi-dimanche, veille de férié, férié), aucun MAR
   ne s'écarte de sa cible de plus de 2 gardes. Les années suivantes lisent le
   report de la précédente, comme en vrai ; les absences sont celles de
   l'effectif fictif (simulateur/demographie.js), souhaits du profil compris. */
const D = require(path.join(__dirname, '..', 'simulateur', 'demographie.js'));
const ROSTER4 = H.defaultRoster().filter(r => !r[3].dateDebut && !r[3].dateFin);
let prec = null; const parAn = [];
[2027, 2028, 2029, 2030].forEach(y => {
  const im = y === 2027 ? {} : D.buildAbsences(y, ROSTER4, y === 2028 ? 1 : y - 2027);
  const feuilles = () => {
    const f = [H.makeSheet('MEDECINS', H.medecinsRows(ROSTER4)),
               H.makeSheet(`INDISPOS_${y}`, H.indisposRows(y, ROSTER4, im)),
               H.makeSheet('PERIODES_VAC', H.periodesRows(y)),
               H.makeSheet('CONFIG', [['PARAMETRE', 'VALEUR']])];
    if (prec) f.push(H.makeSheet(`STATS_GARDES_${y - 1}`, prec.map(r => r.slice())));
    return f;
  };
  const r = H.buildContext(H.makeSpreadsheet(feuilles()), []).generateGardes(y, { dryRun: true });
  const pire = Math.max(...Object.values(r.ecarts).map(e => e.ecart));
  parAn.push(y + ' : ' + pire);
  V(y + ' — écart maximal à la cible ≤ 2 gardes, tous types confondus', pire <= 2, r.ecarts);
  /* Le report de l'année suivante se lit dans les statistiques d'une VRAIE génération. */
  const ss2 = H.makeSpreadsheet(feuilles()); H.buildContext(ss2, []).generateGardes(y);
  prec = ss2.getSheetByName(`STATS_GARDES_${y}`)._rows;
});
console.log('     pire écart à la cible, année par année : ' + parAn.join('  ·  '));

/* ═══ 5. Contrat de code ═════════════════════════════════════════════ */
console.log('\n═══ 5. Contrat de code ═══');
const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
V('l\'interdiction de la veille de férié épargne le souhait (blocage)',
  /SOUHAIT_PLAFOND\.has\(id\)&&_di\?\.isVjf&&!isSouhaitDe\(id,date\)\) return true;/.test(src));
V('…et le motif affiché au comité dit la même chose',
  /isVjf&&!isSouhaitDe\(id,date\)\) return \{classe:'profil',texte:'régime à part : pas de veille de férié non souhaitée'\}/.test(src));
V('vendredi, week-end et férié restent interdits au régime à part',
  /SOUHAIT_PLAFOND\.has\(id\)&&\(_dw===0\|\|_dw===5\|\|_dw===6\|\|_di\?\.isFerie\)\) return true;/.test(src));
V('la version du fichier a été montée',
  (src.match(/GAS_VERSION_GENERATEUR = '(\d{4}-\d{2}-\d{2})\.\d+'/) || [, ''])[1] >= '2026-10-09');

console.log('\n' + ok + ' ✓   ' + ko + ' ✗');
if (ko) process.exit(1);
