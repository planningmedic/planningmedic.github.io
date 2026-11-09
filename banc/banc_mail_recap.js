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
const DEBUT = '/* ── (09/11/2026) PIÈCE JOINTE', FIN = '/* ── action "setIndisposYear"';

function envoyer(srcMetier, configEnPlus) {
  const roster = H.defaultRoster();
  const map = { [SOUHAITEUR]: { '2027-03-09': 'SOUHAIT', '2027-05-11': 'SOUHAIT' } };
  /* (09/11/2026) Des vacances, pour que des gardes « allongent les vacances » existent. */
  const vac = (id, a, n) => { map[id] = map[id] || {}; for (let k = 0; k < n; k++) { const d = new Date(a + 'T12:00:00'); d.setDate(d.getDate() + k); map[id][`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`] = 'VAC'; } };
  ['DURAND', 'FAUVEL', 'LEBRUN', 'MERCIER'].forEach((id, i) => vac(id, ['2027-06-14', '2027-07-05', '2027-09-13', '2027-10-18'][i], 12));
  const med = H.medecinsRows(roster);
  med.slice(1).forEach(r => { r[3] = 'O'; r[7] = r[0].toLowerCase() + '@exemple.invalid'; });  // ACTIF, EMAIL
  const ss = H.makeSpreadsheet([
    H.makeSheet('MEDECINS', med),
    H.makeSheet(`INDISPOS_${YEAR}`, H.indisposRows(YEAR, roster, map)),
    H.makeSheet('PERIODES_VAC', H.periodesRows(YEAR)),
    H.makeSheet('CONFIG', [['CLE', 'VALEUR']].concat(configEnPlus || []))]);
  const ctx = H.buildContext(ss, []);
  ctx.generateGardes(YEAR);
  const mails = [];
  Object.assign(ctx, {
    _quotaEmailInsuffisant_: () => '', _marsAvecEmail_: () => [], _deny: () => ({ refus: true }),
    _error: m => { throw new Error(m); }, logAction: () => {}, TEST_YEAR: YEAR,
    MailApp: { sendEmail: o => mails.push(o) },
    Utilities: Object.assign({}, ctx.Utilities, { newBlob: (h) => ({ getAs: (t) => ({ _html: h, _type: t, setName(x) { this.name = x; return this; } }) }) }),
    ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 1 } } });
  let a = srcMetier.indexOf(DEBUT); if (a < 0) a = srcMetier.indexOf('function _act_envoyerRecapIndispos'); const b = srcMetier.indexOf(FIN);
  if (a < 0 || b < a) throw new Error('action envoyerRecapIndispos introuvable');
  vm.runInContext(srcMetier.slice(a, b), ctx);
  let rep = null, err = null;
  try { rep = JSON.parse(ctx._act_envoyerRecapIndispos({ e: {}, payload: { year: YEAR }, user: { role: 'admin' } })); }
  catch (e) { err = e.message; }
  return { mails, rep, err, roster, ss };
}

console.log('\n═══ 1. Le mail part, pour chacun ═══');
const r = envoyer(fs.readFileSync(FICHIER, 'utf8'));
V('l\'envoi va au bout, sans erreur', !r.err && r.rep && r.rep.success, r.err || r.rep);
V('un mail par MAR actif ayant une adresse', r.mails.length === r.roster.length, { mails: r.mails.length, mar: r.roster.length });
V('aucune erreur d\'envoi signalée', r.rep && r.rep.errors && r.rep.errors.length === 0, r.rep && r.rep.errors);

console.log('\n═══ 2. Le contenu ═══');
const de = id => r.mails.find(m => m.htmlBody.indexOf('DR ' + id + '<') > 0 || m.htmlBody.indexOf('Bonjour DR ' + id + ',') > 0);
const mS = de(SOUHAITEUR), m0 = de(SANS_GARDE);
const nG = mS ? (mS.htmlBody.match(/(\d+) gardes?(?: et \d+ × 18 h)? en 2027/) || [])[1] : null;
V('le résumé annonce le nombre de gardes', !!nG, mS && mS.htmlBody.slice(0, 200));
V('le résumé porte les pastilles réa / maternité', mS && /\d+ réanimation/.test(mS.htmlBody) && /\d+ maternité/.test(mS.htmlBody));
V('le nombre annoncé = le nombre de lignes de garde du mail', mS && Number(nG) === (mS.htmlBody.match(/G &middot; Réa|G2 &middot; Mat/g) || []).length,
  { annonce: nG });
V('l\'encadré des souhaits apparaît chez celui qui en a posé', mS && /Souhaits : \d+ retenus? sur 2/.test(mS.htmlBody));
V('MAR sans garde : message « aucune garde »', m0 && /Aucune garde programmée pour vous en 2027/.test(m0.htmlBody));
V('MAR sans garde : pas de résumé chiffré de gardes', m0 && !/\d+ gardes?( et [^<]*)? en 2027/.test(m0.htmlBody));

console.log('\n═══ 2 bis. 18 h, souhaits honorés, gardes qui allongent les vacances (09/11/2026) ═══');
function grilleDe(ss) {
  const rows = ss.getSheetByName('GARDES_' + YEAR)._rows, ent = rows[2], mois = rows[0];
  const MO = { Janvier: 1, 'Février': 2, Mars: 3, Avril: 4, Mai: 5, Juin: 6, Juillet: 7, 'Août': 8, Septembre: 9, Octobre: 10, Novembre: 11, 'Décembre': 12 };
  let m = null, an = YEAR, prev = 0; const dates = [];
  for (let c = 1; c < ent.length; c++) { const lm = String(mois[c] || '').trim().split(' ')[0];
    if (MO[lm]) { if (prev && MO[lm] < prev) an++; m = MO[lm]; prev = MO[lm]; }
    const j = parseInt(String(ent[c]).replace(/\D/g, ''), 10);
    dates.push(m && j ? `${an}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null); }
  const g = {}; for (let i = 3; i < rows.length; i++) { const id = rows[i][0]; if (!id) continue; g[id] = {};
    dates.forEach((d, k) => { const v = String(rows[i][k + 1] || '').trim(); if (d && v) g[id][d] = v; }); }
  return g;
}
const GR = grilleDe(r.ss);
const plus = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const wd = s => new Date(s + 'T12:00:00').getDay();
/* Calcul indépendant : repos un jour de semaine, puis vacances (après un
   éventuel samedi-dimanche libre). Pas de férié dans les dates choisies. */
const allongeAttendu = (id, d) => { const c = GR[id] || {}; const rp = plus(d, 1);
  if (c[rp] !== 'RG' || wd(rp) === 0 || wd(rp) === 6) return false;
  for (let k = 2; k <= 4; k++) { const x = plus(d, k); if (c[x] === 'V') return true; if (!(wd(x) === 0 || wd(x) === 6) || c[x]) return false; }
  return false; };
let ok18 = true, okAll = true, totAll = 0; const det = [];
r.roster.forEach(([id]) => { const m = de(id); if (!m) return; const c = GR[id] || {};
  const n18 = Object.values(c).filter(v => v === '18').length;
  const l18 = (m.htmlBody.match(/>18 h<\/span><\/div>/g) || []).length;
  if (n18 !== l18) { ok18 = false; det.push(id + ' 18h ' + n18 + '/' + l18); }
  const att = Object.keys(c).filter(d => (c[d] === 'G' || c[d] === 'G2') && allongeAttendu(id, d)).length;
  const lu = (m.htmlBody.match(/☀ Allonge vos vacances/g) || []).length;
  totAll += att; if (att !== lu) { okAll = false; det.push(id + ' allonge ' + att + '/' + lu); } });
V('chaque 18 h du planning a sa ligne dans le mail du MAR', ok18, det);
V('les gardes qui allongent les vacances sont toutes étiquetées, et elles seules', okAll, det);
V('le cas existe bien dans ce jeu d\'essai (sinon le test ne prouve rien)', totAll > 0, totAll);
const cS = GR[SOUHAITEUR] || {}, honor = ['2027-03-09', '2027-05-11'].filter(d => cS[d] === 'G' || cS[d] === 'G2').length;
V('chaque souhait honoré porte l\'étiquette « Souhait »', mS && (mS.htmlBody.match(/★ Souhait/g) || []).length === honor && honor > 0, { honor, lu: mS && (mS.htmlBody.match(/★ Souhait/g) || []).length });
V('aucune étiquette « Souhait » chez qui n\'en a posé aucun', r.mails.filter(x => x !== mS).every(x => !/★ Souhait/.test(x.htmlBody)));
V('le texte brut reprend les 18 h', mS && (Object.values(cS).some(v => v === '18') ? /\n18 h \(\d+\) :/.test(mS.body) : true));
{ let av = null; try { av = execSync('git show ae1cfa8:gas/indisponibilites.gs', { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 64e6 }); } catch (e) {}
  if (!av) V('version d\'avant lisible dans l\'historique (clone complet requis)', false);
  else { const r1 = envoyer(av); V('contre-preuve : la version d\'avant n\'affichait ni 18 h, ni souhait, ni vacances allongées, sans pièce jointe',
    r1.mails.length > 0 && r1.mails.every(x => !/>18 h<\/span><\/div>/.test(x.htmlBody) && !/★ Souhait|☀ Allonge/.test(x.htmlBody) && !x.attachments)); } }

console.log('\n═══ 2 ter. Pièce jointe : l\'année du MAR en une page (09/11/2026) ═══');
V('chaque mail porte une pièce jointe PDF', r.mails.length > 0 && r.mails.every(x => x.attachments && x.attachments.length === 1 && x.attachments[0]._type === 'application/pdf' && /\.pdf$/.test(x.attachments[0].name)));
V('aucun échec de pièce jointe signalé', r.rep && Array.isArray(r.rep.pjEchecs) && r.rep.pjEchecs.length === 0, r.rep && r.rep.pjEchecs);
{ let okG = true, ok18b = true, okNom = true; const det2 = [];
  r.roster.forEach(([id]) => { const m = de(id); if (!m || !m.attachments) return; const h = m.attachments[0]._html, c = GR[id] || {};
    const nG = Object.keys(c).filter(d => (c[d] === 'G' || c[d] === 'G2') && d.slice(0, 4) === String(YEAR)).length;
    const lu = (h.match(/background:#dc2626;color:#ffffff/g) || []).length;
    if (nG !== lu) { okG = false; det2.push(id + ' G ' + nG + '/' + lu); }
    const n18 = Object.keys(c).filter(d => c[d] === '18' && d.slice(0, 4) === String(YEAR)).length;
    if (n18 !== (h.match(/background:#fb923c;color:#ffffff/g) || []).length) { ok18b = false; det2.push(id + ' 18h'); }
    if (h.indexOf('DR ' + id) < 0) okNom = false; });
  V('le calendrier colore chaque garde du MAR, et elles seules', okG, det2);
  V('le calendrier colore chaque 18 h du MAR, et eux seuls', ok18b, det2);
  V('la page porte le nom du MAR', okNom);
  V('ni indisponibilité ni souhait dans la pièce jointe', r.mails.every(x => !/INDISPO|Souhait/i.test(x.attachments[0]._html))); }
{ const r2 = envoyer(fs.readFileSync(FICHIER, 'utf8').replace('function _pdfRecapMar_(nom, year, codeDu, isF) {', 'function _pdfRecapMar_(nom, year, codeDu, isF) { throw new Error("conversion impossible");'));
  V('conversion en échec : les mails partent quand même, sans pièce jointe, et l\'échec est compté',
    !r2.err && r2.mails.length === r.mails.length && r2.mails.every(x => !x.attachments) && r2.rep.pjEchecs.length === r2.mails.length, r2.err || r2.rep); }

V('plus de lien vers le site dans le mail (sur iPhone il ouvre Safari et redemande le code)', r.mails.every(m => !/<a\s/i.test(m.htmlBody) && !/https?:\/\//.test(m.body)));
console.log('\n═══ 2 quater. Couple de week-end : l\'encadré et son constat chiffré (09/11/2026) ═══');
{ const A_ = 'AUBERT', B_ = 'DURAND';
  const rc = envoyer(fs.readFileSync(FICHIER, 'utf8'), [['COUPLES_WEEKEND', A_ + '+' + B_]]);
  const G2 = grilleDe(rc.ss); const dm = id => rc.mails.find(m => m.htmlBody.indexOf('Bonjour DR ' + id + ',') > 0);
  const gd = (c, d) => c[d] === 'G' || c[d] === 'G2';
  const a = G2[A_] || {}, b = G2[B_] || {};
  const jours = Object.keys(Object.assign({}, a, b)).sort();
  let ens = 0, s18 = 0, we = 0;
  jours.forEach(d => { if (gd(a, d) && gd(b, d)) ens++; if ((gd(a, d) && b[d] === '18') || (gd(b, d) && a[d] === '18')) s18++; });
  const tous = new Set(); Object.values(G2).forEach(c => Object.keys(c).forEach(d => tous.add(d)));
  [...tous].sort().forEach(d => { if (new Date(d + 'T12:00:00').getDay() !== 5) return; const j = [d, plus(d, 1), plus(d, 2)];
    if (j.some(x => gd(a, x)) && j.some(x => gd(b, x))) we++; });
  const mA = dm(A_), mB = dm(B_);
  V('les deux membres du couple reçoivent l\'encadré, avec le nom de l\'autre', mA && mB && mA.htmlBody.indexOf('Vos week-ends avec DR ' + B_) > 0 && mB.htmlBody.indexOf('Vos week-ends avec DR ' + A_) > 0);
  V('personne d\'autre ne le reçoit', rc.mails.filter(m => /Vos week-ends avec/.test(m.htmlBody)).length === 2);
  const lit = m => ({ we: Number((m.htmlBody.match(/<b>(\d+)<\/b> week-ends? de garde en commun/) || [])[1]),
    ens: Number((m.htmlBody.match(/(\d+) nuits? de garde en même temps/) || [])[1]),
    s18: Number((m.htmlBody.match(/(\d+) jours? où l'un est de garde pendant le 18 h/) || [])[1]) });
  V('les chiffres de l\'encadré = le calcul indépendant sur le planning (week-ends, nuits ensemble, garde pendant un 18 h)',
    we > 0 && mA && JSON.stringify(lit(mA)) === JSON.stringify({ we, ens, s18 }) && JSON.stringify(lit(mB)) === JSON.stringify({ we, ens, s18 }), { mail: mA && lit(mA), calcul: { we, ens, s18 } });
  V('sans la ligne CONFIG : aucun encadré', r.mails.every(m => !/Vos week-ends avec/.test(m.htmlBody)));
}

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
