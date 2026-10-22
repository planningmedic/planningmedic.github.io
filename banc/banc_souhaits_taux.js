/* ═══ BANC — TAUX DE SOUHAITS RAPPORTÉ AU POSSIBLE (22/10/2026) ════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Le bilan des souhaits de l'essai de génération affichait honorés ÷ posés.
   Un MAR qui souhaite 10 jeudis pour une part de 6 et en obtient 6 voyait
   60 %, alors que l'algorithme ne pouvait pas faire mieux : il n'honore un
   souhait que dans la limite de la part.

   LA RÈGLE. Le taux = souhaits obtenus ÷ souhaits POSSIBLES, le possible
   reprenant les limites de la passe des souhaits (jeudis, samedis, week-ends :
   part arrondie à l'inférieur ; une unité fériée par an ; lundi-mercredi :
   budget de semaine ; le tout sous la cible totale). Les obtenus sont comptés
   famille par famille sans dépasser le possible : jamais plus de 100 %.

   Effectif synthétique uniquement (simulateur/) : aucun nom réel.
   Le vrai générateur du dépôt est exécuté, jamais recopié. */
const path = require('path');
const fs = require('fs');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const YEAR = 2027, MAR = 'GARNIER';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
/* Tous les jeudis non fériés de l'année : bien plus que sa part. */
const JEUDIS = [];
for (let d = new Date('2027-01-07T12:00:00'); d.getFullYear() === 2027; d = new Date(d.getTime() + 7 * 86400000))
  JEUDIS.push(d.toISOString().slice(0, 10));
const JEUDIS_POSES = JEUDIS.filter((d, i) => i % 3 === 0 && d < '2027-11-01');   // 15 jeudis ordinaires (le 18/11, veille de la fête du 19/11, relève du joker)
function contexte() {
  const roster = H.defaultRoster(); const map = { [MAR]: {} };
  JEUDIS_POSES.forEach(d => { map[MAR][d] = 'SOUHAIT'; });
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', H.medecinsRows(roster)),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  return H.buildContext(ss, [], SRC);
}
const r = contexte().generateGardes(YEAR, { dryRun: true });
const s = (r.souhaits || {})[MAR] || {};
const partJeu = r.cibles[MAR] ? r.cibles[MAR].jeu : null;

console.log('\n═══ 1. Le possible est la part de jeudis, pas le nombre de souhaits ═══');
console.log(`   posés ${s.poses} · obtenus ${s.honores} · possible ${s.possible} · part jeudis ${partJeu}`);
V('le bilan expose le possible et les obtenus utiles', typeof s.possible === 'number' && typeof s.honoresUtiles === 'number', s);
V('plus de souhaits posés que la part', s.poses > Math.floor(partJeu), { poses: s.poses, part: partJeu });
V('possible = part de jeudis arrondie à l\'inférieur', s.possible === Math.floor(partJeu), { possible: s.possible, part: partJeu });

console.log('\n═══ 2. Jamais plus de 100 % ═══');
V('obtenus utiles ≤ possible', s.honoresUtiles <= s.possible, s);
V('obtenus utiles ≤ obtenus réels', s.honoresUtiles <= s.honores, s);

console.log('\n═══ 3. Part entièrement servie = 100 % (l\'ancien calcul l\'aurait sous-estimé) ═══');
const taux = s.possible ? Math.round(100 * s.honoresUtiles / s.possible) : null;
const ancien = s.poses ? Math.round(100 * s.honores / s.poses) : null;
console.log(`   nouveau ${taux} % · ancien ${ancien} %`);
V('si la part de jeudis est servie, le taux vaut 100 %', s.honoresUtiles < s.possible || taux === 100, { taux, s });
V('contre-épreuve : l\'ancien calcul (obtenus ÷ posés) donnait moins', ancien < taux, { ancien, taux });

console.log('\n═══ 4. Le récapitulatif de l\'essai affiche le possible ═══');
const txt = contexte().essaiGenerationGardes(YEAR);
const bloc = txt.slice(txt.indexOf('── SOUHAITS'));
const ligne = bloc.split('\n').find(l => l.trim().indexOf(MAR) === 0) || '';
V('en-tête obtenus / posés · possible · taux', /obtenus \/ posés · possible · taux/.test(bloc), bloc.slice(0, 200));
V('la ligne du MAR porte le taux rapporté au possible', ligne.indexOf('· ' + String(s.possible).padStart(3) + ' · ') > 0
  && /\b\d+ %$/.test(ligne.trim()) && ligne.trim().endsWith(taux + ' %'), ligne);

console.log('\n═══ 5. La vraie génération l\'écrit, le mail l\'affiche ═══');
{
  const vm = require('vm');
  const ctx = contexte(); ctx.generateGardes(YEAR);
  const st = ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName(`STATS_GARDES_${YEAR}`)._rows;
  const h = st[0], ligneS = st.find(x => x[0] === MAR) || [];
  const col = n => ligneS[h.indexOf(n)];
  V('colonnes SOUHAITS POSSIBLES et … OBTENUS ajoutées EN FIN de ligne',
    h.indexOf('SOUHAITS POSSIBLES') === 31 && h.indexOf('SOUHAITS POSSIBLES OBTENUS') === 32 && h.length === 33, h.slice(29));
  V('les colonnes lues par position n\'ont pas bougé', h[0] === 'MEDECIN' && h[1] === 'CIBLE' && h[17] === 'CIBLE SAM'
    && h[18] === 'CIBLE JEU' && h[19] === 'CIBLE VD' && h[21] === 'CIBLE VJF' && h[22] === 'CIBLE JF');
  V('possible écrit = possible de l\'essai', col('SOUHAITS POSSIBLES') === s.possible, { ecrit: col('SOUHAITS POSSIBLES'), essai: s.possible });
  V('obtenus utiles ≤ honorés écrits', col('SOUHAITS POSSIBLES OBTENUS') <= col('SOUHAITS HONORES'), ligneS.slice(23, 25).concat(ligneS.slice(31)));
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'indisponibilites.gs'), 'utf8');
  const a = src.indexOf('function _act_envoyerRecapIndispos'), b = src.indexOf('/* ── action "setIndisposYear"');
  const med = ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS')._rows;
  med.slice(1).forEach(r => { r[3] = 'O'; r[7] = String(r[0]).toLowerCase() + '@exemple.invalid'; });
  if (ctx._medecinsInvalider_) ctx._medecinsInvalider_();
  const mails = [];
  Object.assign(ctx, { _quotaEmailInsuffisant_: () => '', _marsAvecEmail_: () => [], _deny: () => ({}),
    _error: m => { throw new Error(m); }, logAction: () => {}, TEST_YEAR: YEAR, MailApp: { sendEmail: o => mails.push(o) },
    ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 1 } } });
  vm.runInContext(src.slice(a, b), ctx);
  ctx._act_envoyerRecapIndispos({ e: {}, payload: { year: YEAR }, user: { role: 'admin' } });
  const m = mails.find(x => x.body.indexOf('Bonjour DR ' + MAR + ',') === 0) || { body: '', htmlBody: '' };
  const attendu = `Souhaits : ${s.honoresUtiles} retenu${s.honoresUtiles > 1 ? 's' : ''} sur ${s.possible} possible${s.possible > 1 ? 's' : ''} — ${taux} %`;
  V('le mail annonce le taux rapporté au possible', m.htmlBody.indexOf(attendu) > 0 && m.body.indexOf(attendu) > 0, attendu);
  V('le mail rappelle le nombre demandé', m.htmlBody.indexOf(s.poses + ' demandés') > 0, s.poses);
  V('part servie : encadré vert ✓', taux !== 100 || m.htmlBody.indexOf('✓ ' + attendu) > 0);
}

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
