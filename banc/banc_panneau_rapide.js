/* ═══ BANC — LE PANNEAU DES DISPONIBLES RESTE INSTANTANÉ EN SÉANCE ═══
   Défaut signalé le 01/11/2026 : « le panneau latéral met parfois du temps à
   s'ouvrir ». Mesuré dans la vraie page (Google ralenti à 3 s) : 0,08 s au
   premier clic, puis 4,6 s et 3,0 s sur les jours suivants, dès qu'un
   placement avait été enregistré.

   Cause : le calcul local du panneau (_dispoLocale) se coupait pendant 90 s
   après TOUTE écriture planning — placements compris. Or le panneau ne lit que
   les statuts (GARDES), les affectations du mois et MEDECINS : un placement ne
   change aucun de ces trois éléments. En séance, chaque nouveau jour ouvert
   partait donc chez Google.

   Correctif : garde propre au panneau (_tsEcritureDispo), armée seulement par
   une écriture qui change les disponibles (statut, échange, affectations,
   absence longue, temps partiel, fiche MAR, génération, archivage).

   CONTRE-ÉPREUVE : la version v1.54.3 d'admin.html (commit 27233d4) est rejouée ; elle
   doit couper le calcul local après un placement. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const RACINE = path.join(__dirname, '..');

async function monter(html) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
    url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
    beforeParse(win) {
      win.eval(fs.readFileSync(path.join(RACINE, 'partage', 'portail.js'), 'utf8'));
      win.eval(fs.readFileSync(path.join(RACINE, 'partage', 'rendu_equite.js'), 'utf8'));
    },
  });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = function () {};
  w.eval(fs.readFileSync(path.join(RACINE, 'partage', 'dispo_jour.js'), 'utf8'));
  await dodo(300);
  // Tout appel réseau est compté ; le journal et Google répondent « accepté ».
  w.__appels = [];
  w.fetch = async (url, opt) => {
    let action = '?';
    try { const b = String((opt && opt.body) || ''); const j = JSON.parse(new URLSearchParams(b).get('payload') || b); action = j.action || (j.intention && 'journal:' + j.intention.type) || '?'; } catch (e) {}
    w.__appels.push(action);
    return { ok: true, status: 200, json: async () => ({ success: true, enAttente: 0, dispo: [], jours: {}, liberal: {} }), text: async () => '{"success":true}' };
  };
  // Un service minimal : deux MAR présents le mardi 02/03/2027.
  w.eval(`
    ADMIN_CODE = 'X'; ADMIN_YEAR = 2027;
    _ETAGE2 = { annee: 2027, gardes: { '2027-03-02': {} }, joursFeries: [],
      flags: { tpJoursFixes: {}, dateDebut: {}, dateFin: {}, rythme2sur2: [] },
      actifs: ['AAA', 'BBB'], initiales: { AAA: 'AA', BBB: 'BB' },
      affectations: { AAA: { 3: 'VOLANT' }, BBB: { 3: 'VIS' } }, codesValides: ['VIS'] };
  `);
  return w;
}
const raz = w => w.eval(`_tsEcriturePlanning = 0; if (typeof _tsEcritureDispo !== 'undefined') _tsEcritureDispo = 0;`);
const local = w => w.eval(`(function(){ const r = _dispoLocale('2027-03-02'); return r ? r.length : null; })()`);

(async () => {
  console.log('\n═══ PANNEAU DES DISPONIBLES — calcul local après un placement ═══');
  const w = await monter(fs.readFileSync(path.join(RACINE, 'admin.html'), 'utf8'));

  raz(w);
  V('sans écriture : le panneau se calcule sur la page (2 MAR)', local(w) === 2, local(w));

  // Le vrai chemin d'un placement : dépôt au journal, type « placements ».
  raz(w);
  await w.eval(`_journalDeposer({ type: 'placements', year: 2027, items: [] })`);
  V('après un placement : la garde générale est bien armée (lectures Statuts/Équité protégées)',
    w.eval('Date.now() - _tsEcriturePlanning < 90000'));
  V('après un placement : le panneau reste calculé sur la page', local(w) === 2, local(w));

  raz(w);
  await w.eval(`_journalDeposer({ type: 'publier', year: 2027 })`);
  V('après une publication : le panneau reste calculé sur la page', local(w) === 2, local(w));

  raz(w);
  w.eval(`api({ action: 'savePlanningOverridesBatch', year: 2027, items: [] })`);
  V('placement par le circuit de secours : le panneau reste calculé sur la page', local(w) === 2, local(w));

  raz(w);
  await w.eval(`_journalDeposer({ type: 'statut', year: 2027, marId: 'AAA', statut: 'V', dates: ['2027-03-02'] })`);
  V('après un changement de STATUT : le panneau repasse par le serveur', local(w) === null, local(w));

  ['setDailyStatus', 'applyModification', 'generateGardes', 'archiveYear', 'initYear', 'saveAffectations',
   'saveAffectationsMar', 'poserAbsenceLongue', 'annulerAbsenceLongue', 'deciderJourTpLot', 'saveMedecin'].forEach(a => {
    raz(w);
    w.eval(`api({ action: '${a}', year: 2027 })`);
    V(`après « ${a} » : le panneau repasse par le serveur`, local(w) === null, local(w));
  });

  // Le geste réel : placer, puis ouvrir la case d'un autre jour.
  raz(w);
  await w.eval(`_journalDeposer({ type: 'placements', year: 2027, items: [] })`);
  w.__appels = [];
  w.eval(`openSidePanel('VIS', '2027-03-02', 'Bloc viscéral', 'am')`);
  await dodo(200);
  const appelsPanneau = w.__appels.filter(a => a === 'getMARsDispoJour' || a === 'getPanneauSemaine');
  V('placer puis ouvrir un autre jour : AUCUN appel Google pour le panneau', appelsPanneau.length === 0, w.__appels);
  const contenu = w.document.getElementById('pspContent').textContent;
  V('… et le panneau affiche aussitôt les disponibles', /AAA/.test(contenu) && /BBB/.test(contenu), contenu.slice(0, 120));

  console.log('\n═══ CONTRE-ÉPREUVE — version v1.54.3 (27233d4) ═══');
  let ancien = null;
  try { ancien = execSync('git show 27233d4:admin.html', { cwd: RACINE, encoding: 'utf8', maxBuffer: 64e6 }); } catch (e) {}
  V('la version v1.54.3 est lisible dans l\'historique (cloner SANS --depth)', !!ancien && !/_tsEcritureDispo/.test(ancien));
  if (ancien && !/_tsEcritureDispo/.test(ancien)) {
    const w0 = await monter(ancien);
    raz(w0);
    await w0.eval(`_journalDeposer({ type: 'placements', year: 2027, items: [] })`);
    V('CONTRE-ÉPREUVE : l\'ancienne page coupait bien le calcul local après un placement', local(w0) === null, local(w0));
  }

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
