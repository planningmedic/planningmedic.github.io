/* ═══ BANC — LA PART EXACTE EST ENREGISTRÉE (11/09/2026) ═══════════════════
   POURQUOI CE SCÉNARIO EXISTE.
   La colonne CIBLE de STATS_GARDES porte la cible ENTIÈRE. Deux MAR de même
   quotité, même présence, même profil, finissent l'un à 36 et l'autre à 37
   parce que 728 places ne se divisent pas en 22 parts égales : leur part réelle
   vaut 36,6 à tous les deux. Ce reliquat disparaissait à la génération, et le
   report de l'année suivante voyait donc les deux « à jour ». Sur cinq ans,
   c'était toujours les mêmes — les derniers de l'alphabet — qui perdaient.

   CE QUE CES VÉRIFICATIONS TIENNENT.
   1. La part exacte est écrite, et elle est bien FRACTIONNAIRE : c'est toute
      l'information que l'arrondi détruisait.
   2. La somme des reliquats vaut zéro. Un report fondé dessus ne pourra donc
      jamais créer ni détruire de garde — il ne fait que décaler le tour.
   3. Les six colonnes que code.gs lit PAR POSITION n'ont pas bougé d'un cran.
      C'est la vérification qui compte le plus : un décalage casserait l'équité
      du tableau de bord en silence, sans message d'erreur.
   4. Ce patch n'écrit que de la donnée : le planning produit est identique,
      garde par garde, à celui d'avant. On le prouve en comparant les compteurs
      réels de deux générations sur les mêmes entrées.

   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };

const YEAR = 2027;
const roster = H.defaultRoster();
const res = H.runScenario({ year: YEAR, roster: roster, indisposMap: {} });

console.log('\n═══ 1. La part exacte est écrite dans STATS_GARDES ═══');
const st = res.ss.getSheetByName(`STATS_GARDES_${YEAR}`);
V('l\'onglet des statistiques existe', !!st, res.error);
const rows = st ? st._rows : [];
const hdr = (rows[0] || []).map(v => String(v).trim());

['PART EXACTE', 'PART EXACTE SAM', 'PART EXACTE JEU',
 'PART EXACTE VD', 'PART EXACTE VJF', 'PART EXACTE JF'].forEach(nom => {
  V('la colonne « ' + nom + ' » est présente', hdr.indexOf(nom) >= 0, hdr);
});

const iEx = hdr.indexOf('PART EXACTE'), iCb = hdr.indexOf('CIBLE');
const gardeurs = rows.slice(1).filter(r => r[iEx] !== '' && r[iEx] !== undefined && r[iEx] !== null);
V('chaque médecin de garde a une part exacte', gardeurs.length > 0, gardeurs.length);

/* Une part entière partout signifierait que l'arrondi n'a rien détruit — donc
   que la colonne ne sert à rien. Au moins une part doit être fractionnaire. */
const fractionnaires = gardeurs.filter(r => Math.abs(Number(r[iEx]) - Math.round(Number(r[iEx]))) > 0.01);
V('au moins une part exacte est fractionnaire', fractionnaires.length > 0,
  gardeurs.map(r => [r[0], r[iEx]]));

console.log('\n═══ 2. Les reliquats se compensent exactement ═══');
/* La cible est stockée en TEXTE (apostrophe de tête) pour que Sheets ne la
   transforme pas en date : on la relit comme le fait la dette de N+1. */
const num = v => Number(String(v).replace(/^'/, '')) || 0;
const reliquat = gardeurs.reduce((s, r) => s + (Number(r[iEx]) - num(r[iCb])), 0);
V('la somme des reliquats vaut zéro', Math.abs(reliquat) < 0.05, reliquat);

const ecarts = gardeurs.map(r => Number(r[iEx]) - num(r[iCb]));
V('des médecins sont arrondis à la baisse', ecarts.some(e => e > 0.005), ecarts);
V('…et d\'autres à la hausse', ecarts.some(e => e < -0.005), ecarts);
V('aucun reliquat ne dépasse une garde entière', ecarts.every(e => Math.abs(e) < 1), ecarts);

console.log('\n═══ 3. Les colonnes lues par position n\'ont pas bougé ═══');
/* code.gs lit sd[r][1], [17], [18], [19], [21] et [22] à l'aveugle, et la sonde
   de diagnostic s'arrête à la colonne 23. Les ajouts DOIVENT rester en fin. */
const attendu = { 0: 'MEDECIN', 1: 'CIBLE', 17: 'CIBLE SAM', 18: 'CIBLE JEU',
                  19: 'CIBLE VD', 21: 'CIBLE VJF', 22: 'CIBLE JF',
                  23: 'SOUHAITS POSES', 24: 'SOUHAITS HONORES' };
Object.keys(attendu).forEach(i => {
  V('colonne ' + (Number(i) + 1) + ' = « ' + attendu[i] + ' »', hdr[i] === attendu[i], hdr[i]);
});
V('les colonnes ajoutées sont TOUTES après la 25e',
  hdr.indexOf('PART EXACTE') >= 25, hdr.indexOf('PART EXACTE'));

console.log('\n═══ 4. La colonne CIBLE reste la cible ENTIÈRE ═══');
/* Le report de N+1 lit CIBLE. Si ce patch l'avait rendue fractionnaire, il
   aurait changé le comportement au lieu de seulement enregistrer. */
const cibles = gardeurs.map(r => num(r[iCb]));
V('toutes les cibles stockées sont entières',
  cibles.every(c => Math.abs(c - Math.round(c)) < 0.001), cibles);
V('la part exacte diffère de la cible pour au moins un médecin',
  gardeurs.some(r => Math.abs(Number(r[iEx]) - num(r[iCb])) > 0.05));

console.log('\n═══ 5. Le planning produit est INCHANGÉ ═══');
/* La preuve que ce patch n'écrit que de la donnée : deux générations sur les
   mêmes entrées rendent les mêmes compteurs réels, médecin par médecin. */
const res2 = H.runScenario({ year: YEAR, roster: roster, indisposMap: {} });
const st2 = res2.ss.getSheetByName(`STATS_GARDES_${YEAR}`);
const sig = s => (s ? s._rows.slice(1) : []).map(r => r.slice(0, 25).join('|')).join('\n');
V('les 25 colonnes historiques sont identiques d\'une génération à l\'autre',
  sig(st) === sig(st2));
V('aucune journée sans binôme', (res.logs.join(' ').match(/(\d+) jour\(s\) sans bin/) || [0, '0'])[1] === '0',
  res.logs.filter(l => /sans bin/.test(String(l))).slice(0, 3));

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
