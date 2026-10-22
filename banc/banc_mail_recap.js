/* ═══ BANC — MAIL « VOS GARDES » APRÈS GÉNÉRATION (22/10/2026) ════════════
   POURQUOI CE SCÉNARIO EXISTE.
   Le mail que chaque MAR reçoit après la génération (action
   envoyerRecapIndispos) utilisait deux blocs — le résumé « N gardes » et le
   message « aucune garde » — définis nulle part. L'envoi s'arrêtait au premier
   MAR ayant des gardes : personne ne recevait rien. Aucun scénario n'envoyait
   ce mail, d'où un défaut invisible depuis la mise en service. Trouvé le
   22/10/2026 en rejouant le mail sur les indispos 2027.

   CE QUI EST VÉRIFIÉ. Le vrai générateur produit l'année, puis la vraie
   action envoie les mails (envoi simulé) : un mail par MAR actif ayant une
   adresse, avec son résumé, ses souhaits et son message « aucune garde »
   s'il n'en a pas. Contre-épreuve : la version précédente échoue.

   Effectif synthétique uniquement (simulateur/) : aucun nom réel. */
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');
const H = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
  else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };
const YEAR = 2027, SOUHAITEUR = 'GARNIER', SANS_GARDE = 'BOISSY';
const FICHIER = path.join(__dirname, '..', 'gas', 'indisponibilites.gs');
const DEBUT = 'function _act_envoyerRecapIndispos', FIN = '/* ── action "setIndisposYear"';

function envoyer(srcMetier) {
  const roster = H.defaultRoster();
  const map = { [SOUHAITEUR]: { '2027-03-09': 'SOUHAIT', '2027-05-11': 'SOUHAIT' } };
  const med = H.medecinsRows(roster);
  med.slice(1).forEach(r => { r[3] = 'O'; r[7] = r[0].toLowerCase() + '@exemple.invalid'; });  // ACTIF, EMAIL
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', med),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']])]);
  const ctx = H.buildContext(ss, []);
  ctx.generateGardes(YEAR);
  const mails = [];
  Object.assign(ctx, {
    _quotaEmailInsuffisant_: () => '', _marsAvecEmail_: () => [], _deny: () => ({ refus: true }),
    _error: m => { throw new Error(m); }, logAction: () => {}, TEST_YEAR: YEAR,
    MailApp: { sendEmail: o => mails.push(o) },
    ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 1 } } });
  const a = srcMetier.indexOf(DEBUT), b = srcMetier.indexOf(FIN);
  if (a < 0 || b < a) throw new Error('action envoyerRecapIndispos introuvable');
  vm.runInContext(srcMetier.slice(a, b), ctx);
  let rep = null, err = null;
  try { rep = JSON.parse(ctx._act_envoyerRecapIndispos({ e: {}, payload: { year: YEAR }, user: { role: 'admin' } })); }
  catch (e) { err = e.message; }
  return { mails, rep, err, roster };
}

console.log('\n═══ 1. Le mail part, pour chacun ═══');
const r = envoyer(fs.readFileSync(FICHIER, 'utf8'));
V('l\'envoi va au bout, sans erreur', !r.err && r.rep && r.rep.success, r.err || r.rep);
V('un mail par MAR actif ayant une adresse', r.mails.length === r.roster.length, { mails: r.mails.length, mar: r.roster.length });
V('aucune erreur d\'envoi signalée', r.rep && r.rep.errors && r.rep.errors.length === 0, r.rep && r.rep.errors);

console.log('\n═══ 2. Le contenu ═══');
const de = id => r.mails.find(m => m.htmlBody.indexOf('DR ' + id + '<') > 0 || m.htmlBody.indexOf('Bonjour DR ' + id + ',') > 0);
const mS = de(SOUHAITEUR), m0 = de(SANS_GARDE);
const nG = mS ? (mS.htmlBody.match(/(\d+) gardes? en 2027/) || [])[1] : null;
V('le résumé annonce le nombre de gardes', !!nG, mS && mS.htmlBody.slice(0, 200));
V('le résumé porte les pastilles réa / maternité', mS && /\d+ réanimation/.test(mS.htmlBody) && /\d+ maternité/.test(mS.htmlBody));
V('le nombre annoncé = le nombre de lignes de garde du mail', mS && Number(nG) === (mS.htmlBody.match(/G &middot; Réa|G2 &middot; Mat/g) || []).length,
  { annonce: nG });
V('l\'encadré des souhaits apparaît chez celui qui en a posé', mS && /Souhaits : \d+ retenus? sur 2/.test(mS.htmlBody));
V('MAR sans garde : message « aucune garde »', m0 && /Aucune garde programmée pour vous en 2027/.test(m0.htmlBody));
V('MAR sans garde : pas de résumé chiffré', m0 && !/\d+ gardes? en 2027/.test(m0.htmlBody));

console.log('\n═══ 3. Contre-épreuve : la version précédente n\'envoyait rien ═══');
let ancien = null;
try { ancien = execSync('git show HEAD~0:gas/indisponibilites.gs', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64e6 }); } catch (e) {}
const marque = 'const summaryHtml';
if (ancien && ancien.indexOf(marque) < 0) {
  const r0 = envoyer(ancien);
  V('version précédente : l\'envoi s\'arrête (bloc non défini)', !!r0.err && /summaryHtml|emptyHtml/.test(r0.err) && r0.mails.length === 0, r0.err);
} else {
  const r0 = envoyer(fs.readFileSync(FICHIER, 'utf8').split(marque).join('const _summaryRetire').replace("const emptyHtml", "const _emptyRetire"));
  V('sans les deux blocs : l\'envoi s\'arrête', !!r0.err && r0.mails.length === 0, r0.err);
}

console.log(`\n${ok} ✓ · ${ko} ✗`);
process.exit(ko ? 1 : 0);
