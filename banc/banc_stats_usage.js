/* ═══ BANC — COMPTEURS D'USAGE ET PURGE DES CONNEXIONS (29/08/2026) ═══════
   Exécute le VRAI logConnexion / statsRecalculer d'Indispos.gs.

   ORIGINE. CONNEXIONS était plafonné à 2 000 lignes, les plus anciennes
   écrasées. Relevé du 29/08 : 1 449 lignes en 53 jours à 5 utilisateurs, soit
   ~27/jour. À 25 MAR, le plafond serait atteint toutes les 2 à 3 semaines et
   l'historique détruit en continu — la courbe d'adoption n'aurait jamais pu
   exister. Le plafond passe à 10 000 (~3 mois) et les compteurs sont FIGÉS
   avant toute suppression.

   CE QUE CE SCÉNARIO PROTÈGE, par ordre de gravité :
     1. Une purge ne fait perdre AUCUNE semaine déjà comptée.
     2. Une semaine figée n'est jamais recomptée (sinon elle rétrécirait au
        fur et à mesure que ses lignes brutes disparaissent).
     3. Les connexions antérieures au 4 septembre 2026 ne sont pas comptées.
     4. La colonne DERNIERE_CONNEXION s'ajoute EN FIN de MEDECINS — une
        insertion au milieu rend les codes d'accès inopérants (réel, 21/07). */
const path = require('path'), fs = require('fs'), vm = require('vm');
const { Classeur, extraireFonction } = require(path.join(__dirname, 'stubs'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

const GS = path.join(__dirname, '..', 'gas', 'Indispos.gs');
const SRC = fs.readFileSync(GS, 'utf8');

/* Constantes LUES dans le code réel : le banc ne les redéclare pas, sinon il
   validerait ses propres valeurs. Mais il les VERROUILLE (contre-épreuve :
   sans cela, remettre le plafond à 2 000 passerait inaperçu). */
const PLAFOND = Number((SRC.match(/CONNEXIONS_PLAFOND\s*=\s*(\d+)/) || [])[1]);
const ORIGINE = (SRC.match(/STATS_ORIGINE\s*=\s*'([\d-]+)'/) || [])[1];

console.log('\n═══ 1. Les réglages sont déclarés dans le code réel ═══');
V('CONNEXIONS_PLAFOND est défini', Number.isFinite(PLAFOND), PLAFOND);
V('le plafond vaut 10 000 (~3 mois à 25 MAR)', PLAFOND === 10000, PLAFOND);
V('STATS_ORIGINE est défini', !!ORIGINE, ORIGINE);
V('l\'origine est le 4 septembre 2026', ORIGINE === '2026-09-04', ORIGINE);

/* ── Bac à sable : les vraies fonctions, un classeur simulé ───────────── */
function bac(maintenant) {
  const cl = new Classeur();
  cl.ajouter('MEDECINS', [
    ['ID','NOM','INITIALES','ACTIF','SECTEUR','EMAIL','CODE','X','DECT'],
    ['DUPONT','DUPONT','DU','O','VIS','a@b.c','AAAA1111','','1001'],
    ['MARTIN','MARTIN','MA','O','REA','d@e.f','BBBB2222','','1002'],
  ]);
  cl.ajouter('CONNEXIONS', [['HORODATAGE','NOM','INITIALES','ROLE']]);

  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => cl },
    Logger: { log: () => {} },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ nearMinute: () => ({ create: () => {} }) }) }) }) }), WeekDay: { MONDAY: 1 } },
    Date: class extends Date { constructor(...a) { if (!a.length) super(maintenant.getTime()); else super(...a); } },
    console,
  };
  vm.createContext(ctx);
  ['_statsJour_','_statsLundi_','_statsFeuille_','_statsHeureIncr_',
   '_statsDerniereConnexion_','statsRecalculer','logConnexion']
    .forEach(n => vm.runInContext(extraireFonction(GS, n), ctx));
  vm.runInContext(`const CONNEXIONS_PLAFOND=${PLAFOND}; const STATS_ORIGINE='${ORIGINE}';`, ctx);
  return { cl, ctx };
}
const D = s => new Date(s);
const lignes = (cl, n) => (cl.getSheetByName(n) ? cl.getSheetByName(n).lignes : []);
/* Sheets convertit « 2026-09-07 » en Date à l'écriture : le banc doit lire ce que
   le vrai classeur rendrait, pas ce qu'il aimerait y trouver. */
const jour = v => (v instanceof Date)
  ? v.getUTCFullYear()+'-'+String(v.getUTCMonth()+1).padStart(2,'0')+'-'+String(v.getUTCDate()).padStart(2,'0')
  : String(v).trim();

console.log('\n═══ 2. Une connexion est enregistrée et datée ═══');
{
  const { cl, ctx } = bac(D('2026-09-10T09:30:00'));
  ctx.logConnexion({ id:'DUPONT', name:'DUPONT', initials:'DU', role:'mar' });
  const L = lignes(cl, 'CONNEXIONS');
  V('une ligne est ajoutée', L.length === 2, L.length);
  V('les 4 colonnes du code réel sont remplies', L[1].length === 4 && L[1][2] === 'DU', L[1]);
}

console.log('\n═══ 3. La grille 7 × 24 se remplit à la bonne case ═══');
{
  const { cl, ctx } = bac(D('2026-09-10T09:30:00'));   // jeudi 9 h
  ctx.logConnexion({ id:'DUPONT', name:'DUPONT', initials:'DU', role:'mar' });
  const H = lignes(cl, 'STATS_HEURES');
  V('la grille est créée avec 7 jours', H.length === 8, H.length);
  V('en-tête JOUR + 24 heures', H[0].length === 25, H[0].length);
  V('jeudi 9 h vaut 1', H[4][10] === 1, { ligne: H[4] && H[4][0], valeur: H[4] && H[4][10] });
  ctx.logConnexion({ id:'MARTIN', name:'MARTIN', initials:'MA', role:'mar' });
  V('une 2e connexion au même créneau porte le compteur à 2', lignes(cl,'STATS_HEURES')[4][10] === 2);
}

console.log('\n═══ 4. La dernière connexion s\'écrit EN FIN de MEDECINS ═══');
{
  const { cl, ctx } = bac(D('2026-09-10T09:30:00'));
  const avant = lignes(cl, 'MEDECINS')[0].slice();
  ctx.logConnexion({ id:'MARTIN', name:'MARTIN', initials:'MA', role:'mar' });
  const M = lignes(cl, 'MEDECINS');
  V('la colonne est ajoutée en DERNIÈRE position', M[0][M[0].length-1] === 'DERNIERE_CONNEXION', M[0]);
  V('aucune colonne existante n\'a bougé',
    JSON.stringify(M[0].slice(0, avant.length)) === JSON.stringify(avant), M[0]);
  V('le code d\'accès reste en colonne 7 (index 6)', M[2][6] === 'BBBB2222', M[2][6]);
  V('la date est portée sur la bonne ligne', jour(M[2][M[0].length-1]) === '2026-09-10', M[2]);
  V('l\'autre médecin n\'est pas touché', !M[1][M[0].length-1], M[1]);
  ctx.logConnexion({ id:'SECRETARIAT', name:'Secrétariat', initials:'SEC', role:'secretariat' });
  V('le secrétariat (code partagé) n\'écrit aucune date',
    lignes(cl,'MEDECINS').every(l => l[0] !== 'SECRETARIAT'));
}

console.log('\n═══ 5. Rien n\'est compté avant l\'ouverture au service ═══');
{
  const { cl, ctx } = bac(D('2026-08-20T10:00:00'));   // avant le 4 septembre
  ctx.logConnexion({ id:'DUPONT', name:'DUPONT', initials:'DU', role:'mar' });
  V('la ligne brute est bien écrite', lignes(cl,'CONNEXIONS').length === 2);
  V('aucune grille horaire n\'est créée', !cl.getSheetByName('STATS_HEURES'));
  ctx.statsRecalculer();
  const S = lignes(cl, 'STATS_SEMAINE');
  V('aucune semaine n\'est comptée', S.length === 1, S);
}

console.log('\n═══ 6. Les semaines sont comptées, puis figées ═══');
{
  const { cl, ctx } = bac(D('2026-09-21T10:00:00'));   // lundi 21/09
  const br = cl.getSheetByName('CONNEXIONS');
  // semaine du 07/09 : 3 connexions, 2 personnes
  br.appendRow([D('2026-09-08T08:00:00'), 'DUPONT', 'DU', 'mar']);
  br.appendRow([D('2026-09-09T08:00:00'), 'DUPONT', 'DU', 'mar']);
  br.appendRow([D('2026-09-10T08:00:00'), 'MARTIN', 'MA', 'mar']);
  // semaine EN COURS du 21/09 : 1 connexion
  br.appendRow([D('2026-09-21T08:00:00'), 'MARTIN', 'MA', 'mar']);
  ctx.statsRecalculer();
  const S = lignes(cl, 'STATS_SEMAINE');
  const sem = Object.fromEntries(S.slice(1).map(l => [jour(l[0]), l]));
  V('la semaine du 07/09 est comptée', !!sem['2026-09-07'], Object.keys(sem));
  V('elle totalise 3 connexions', sem['2026-09-07'] && sem['2026-09-07'][1] === 3);
  V('pour 2 personnes distinctes', sem['2026-09-07'] && sem['2026-09-07'][2] === 2);
  V('la semaine terminée est FIGÉE', sem['2026-09-07'] && sem['2026-09-07'][3] === 'O');
  V('la semaine en cours n\'est PAS figée', sem['2026-09-21'] && sem['2026-09-21'][3] === 'N');

  /* Le point qui fait tout tenir, et le cas RÉEL de la purge : la semaine est
     figée, et une PARTIE seulement de ses lignes brutes a disparu. Si la clé
     relue n'est pas normalisée, la semaine n'est pas reconnue comme figée :
     elle est recomptée sur ce qui reste (elle RÉTRÉCIT) et une ligne en double
     est créée. Contre-épreuve du 29/08 : sans _cleSem_, ces trois
     vérifications tombent. */
  br.lignes = [br.lignes[0], br.lignes[3], br.lignes[4]];   // il ne reste qu'1 ligne sur 3
  ctx.statsRecalculer();
  const T = lignes(cl,'STATS_SEMAINE');
  const S2 = Object.fromEntries(T.slice(1).map(l => [jour(l[0]), l]));
  V('la semaine figée n\'est pas recomptée sur ce qui reste',
    S2['2026-09-07'] && S2['2026-09-07'][1] === 3, S2['2026-09-07']);
  V('et garde ses 2 personnes', S2['2026-09-07'] && S2['2026-09-07'][2] === 2, S2['2026-09-07']);
  V('aucune ligne en double n\'est créée pour cette semaine',
    T.slice(1).filter(l => jour(l[0]) === '2026-09-07').length === 1,
    T.slice(1).map(l => jour(l[0])));
}

console.log('\n═══ 7. La purge ne perd aucune semaine ═══');
{
  const { cl, ctx } = bac(D('2026-12-14T10:00:00'));
  const br = cl.getSheetByName('CONNEXIONS');
  /* On remplit jusqu'au plafond avec des connexions étalées sur 10 semaines,
     puis une de plus : la purge doit se déclencher. */
  const debut = new Date('2026-09-07T08:00:00');
  for (let i = 0; i < PLAFOND; i++) {
    const d = new Date(debut.getTime() + Math.floor(i / 100) * 86400000 + (i % 100) * 60000);
    br.appendRow([d, 'DUPONT', (i % 3 === 0) ? 'DU' : 'MA', 'mar']);
  }
  V('le classeur est au plafond', br.getLastRow() === PLAFOND + 1, br.getLastRow());
  const avantPurge = lignes(cl, 'STATS_SEMAINE').length;
  V('aucune semaine n\'est encore figée', avantPurge === 0, avantPurge);

  ctx.logConnexion({ id:'MARTIN', name:'MARTIN', initials:'MA', role:'mar' });

  V('le plafond est tenu après purge', br.getLastRow() === PLAFOND + 1, br.getLastRow());
  const S = lignes(cl, 'STATS_SEMAINE');
  V('les semaines ont été figées AVANT la suppression', S.length > 1, S.length);
  const totalCompte = S.slice(1).reduce((a, l) => a + Number(l[1] || 0), 0);
  V('le total compté couvre bien les lignes qui ont disparu',
    totalCompte >= PLAFOND, { compte: totalCompte, plafond: PLAFOND });
  V('la 1re semaine reste renseignée après purge',
    S[1] && Number(S[1][1]) > 0, S[1]);
}

console.log('\n═══ 8. Le lundi est calculé juste (bornes de semaine) ═══');
{
  const { ctx } = bac(D('2026-09-10T09:00:00'));
  V('un lundi est son propre lundi', ctx._statsLundi_(D('2026-09-07T10:00:00')) === '2026-09-07');
  V('un dimanche appartient à la semaine qui précède',
    ctx._statsLundi_(D('2026-09-13T23:00:00')) === '2026-09-07');
  V('le lundi suivant ouvre une nouvelle semaine',
    ctx._statsLundi_(D('2026-09-14T00:30:00')) === '2026-09-14');
  V('un changement de mois ne casse pas le calcul',
    ctx._statsLundi_(D('2026-10-01T12:00:00')) === '2026-09-28');
}

console.log('\n────────────────────────────────────');
console.log(ko === 0 ? `✅ ${ok} vérifications, 0 échec` : `❌ ${ko} échec(s) sur ${ok + ko}`);
process.exit(ko === 0 ? 0 : 1);
