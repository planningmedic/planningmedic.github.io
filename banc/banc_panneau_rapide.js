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

   (01/11/2026, second temps) Les statuts du calcul local n'étaient chargés qu'à
   l'ouverture : 90 s après une pose de statut, le panneau repartait des
   statuts d'avant. Ils sont désormais recopiés à chaque pose, et relus sur la
   copie rapide après les autres écritures qui les changent.

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
const raz = w => w.eval(`_tsEcriturePlanning = 0; if (typeof _tsEcritureDispo !== 'undefined') _tsEcritureDispo = 0; if (typeof _etage2Perime !== 'undefined') _etage2Perime = false;`);
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

  console.log('\n═══ STATUTS DU CALCUL LOCAL — tenus à jour pendant la session ═══');
  // Le geste réel de l'onglet Statuts : AAA en vacances le mardi 02/03.
  const poserVacance = async (w2) => {
    w2.eval(`
      renderStatuts = function () {}; toast = function () {};
      STAT.year = 2027; STAT.marId = 'AAA'; STAT.gardes = {}; STAT.selected = new Set(['2027-03-02']);
    `);
    await w2.eval(`statApply('V')`);
    await dodo(50);   // le dépôt au journal se termine (il réarme la garde)
    // La garde des 90 s est passée (la pose remonte à plus d'1 min 30).
    w2.eval(`_tsEcriturePlanning = Date.now() - 91000; if (typeof _tsEcritureDispo !== 'undefined') _tsEcritureDispo = Date.now() - 91000;`);
  };
  const proposes = w2 => JSON.parse(w2.eval(`JSON.stringify((_dispoLocale('2027-03-02') || []).map(m => m.id))`));
  raz(w);
  await poserVacance(w);
  V('vacance posée dans Statuts, 90 s plus tard : AAA n\'est plus proposé', !proposes(w).includes('AAA'), proposes(w));
  V('… BBB l\'est toujours', proposes(w).includes('BBB'), proposes(w));
  V('… et l\'onglet Statuts relirait la même chose (copie à jour)', w.eval(`_ETAGE2.gardes['2027-03-02'].AAA`) === 'V');

  // Statut effacé (pose annulée) : AAA redevient proposé.
  w.eval(`STAT.selected = new Set(['2027-03-02'])`);
  await w.eval(`statApply('')`);
  await dodo(50);
  w.eval(`_tsEcritureDispo = Date.now() - 91000`);
  V('statut effacé : AAA est de nouveau proposé', proposes(w).includes('AAA'), proposes(w));

  // Autre écriture qui change les statuts (absence longue) : relecture de la copie rapide.
  let lectures = 0;
  w.miroirRead = async (cles) => { lectures++; return { success: true, data: { ['gardes_2027']: { success: true, data: { '2027-03-02': { BBB: 'F' } } } } }; };
  raz(w);
  w.eval(`api({ action: 'poserAbsenceLongue', year: 2027 })`);
  await dodo(50);
  V('absence longue : le panneau passe par le serveur pendant 90 s', local(w) === null);
  w.eval(`_tsEcritureDispo = Date.now() - 91000`);
  V('… puis, la garde passée, il attend la relecture des statuts', local(w) === null);
  await dodo(50);
  V('… relus UNE fois sur la copie rapide', lectures === 1, lectures);
  V('… et le panneau repart des statuts relus (BBB en formation, plus proposé)',
    JSON.stringify(proposes(w)) === JSON.stringify(['AAA']), proposes(w));
  V('… l\'onglet Statuts ne recopie plus une mémoire périmée', w.eval(`_etage2Perime`) === false);

  console.log('\n═══ CONTRE-ÉPREUVE — version v1.54.3 (27233d4) ═══');
  let ancien = null;
  try { ancien = execSync('git show 27233d4:admin.html', { cwd: RACINE, encoding: 'utf8', maxBuffer: 64e6 }); } catch (e) {}
  V('la version v1.54.3 est lisible dans l\'historique (cloner SANS --depth)', !!ancien && !/_tsEcritureDispo/.test(ancien));
  if (ancien && !/_tsEcritureDispo/.test(ancien)) {
    const w0 = await monter(ancien);
    raz(w0);
    await w0.eval(`_journalDeposer({ type: 'placements', year: 2027, items: [] })`);
    V('CONTRE-ÉPREUVE : l\'ancienne page coupait bien le calcul local après un placement', local(w0) === null, local(w0));
    raz(w0);
    await poserVacance(w0);
    V('CONTRE-ÉPREUVE : l\'ancienne page reproposait AAA en vacances 90 s après la pose', proposes(w0).includes('AAA'), proposes(w0));
  }

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
