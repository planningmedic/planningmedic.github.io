/**
 * anti_persistance_devis.test.js
 * ────────────────────────────────────────────────────────────────────────────
 * Preuve REPRODUCTIBLE de la contrainte NON NÉGOCIABLE du module libéral
 * (conception §3.bis / décision 14) : aucun champ patient saisi dans le devis
 * ne persiste où que ce soit.
 *
 * Trois vérifications, dans l'esprit "montrer, pas jurer" :
 *   1. SCAN STATIQUE   — le code ne référence aucun stockage navigateur.
 *   2. RUNTIME (jsdom) — on remplit le devis d'un patient fictif, on ferme,
 *                        et on inspecte localStorage / sessionStorage / cookies
 *                        / DOM : zéro trace du patient.
 *   3. RÉSEAU          — aucune requête sortante ne porte le champ patient
 *                        (le remplissage/fermeture du devis ne déclenche
 *                        aucun fetch).
 *
 * Usage :  node anti_persistance_devis.test.js [chemin_html] [chemin_ccam_json]
 * Sortie :  code 0 si tout passe, 1 sinon. Résultat archivable pour audit
 *           (CCIN / loi n° 1.565).
 * ────────────────────────────────────────────────────────────────────────────
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = process.argv[2] || path.join(__dirname, 'estimateur-liberal.html');
const CCAM = process.argv[3] || path.join(__dirname, 'ccam_actes.json');
const SENTINEL = 'ZZ_PATIENT_TEMOIN_9137'; // valeur-témoin, improbable ailleurs

let failures = 0;
const ok  = m => console.log('  \u2713 ' + m);
const bad = m => { console.log('  \u2717 ' + m); failures++; };

const html = fs.readFileSync(HTML, 'utf8');

/* ── 1. SCAN STATIQUE ─────────────────────────────────────────────────────── */
console.log('\n[1] Scan statique — aucune API de stockage navigateur');
const script = (html.match(/<script>([\s\S]*?)<\/script>/g) || []).join('\n');
for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
  if (new RegExp(api.replace('.', '\\.')).test(script)) bad(`${api} référencé dans le code`);
  else ok(`${api} absent du code`);
}

/* ── 2 & 3. RUNTIME + RÉSEAU ──────────────────────────────────────────────── */
console.log('\n[2/3] Runtime (jsdom) — remplissage puis fermeture du devis');

const ccamJson = fs.existsSync(CCAM) ? fs.readFileSync(CCAM, 'utf8') : '{"actes":[]}';
const fetchCalls = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://planningmedic.github.io/docs/module-liberal/estimateur-liberal.html',
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    // fetch mocké : on enregistre tout appel (URL + corps) pour la preuve réseau
    w.fetch = (url, opts) => {
      fetchCalls.push({ url: String(url), body: opts && opts.body ? String(opts.body) : '' });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(ccamJson)) });
    };
    w.Element.prototype.scrollIntoView = function () {}; // stub (existe dans tout navigateur réel)
  },
});

setTimeout(() => {
  const w = dom.window, d = w.document;
  try {
    // Simuler le geste réel : créer un parcours, ouvrir le devis, saisir un patient
    if (typeof w.addParcours !== 'function') throw new Error('addParcours introuvable');
    w.addParcours();
    if (!d.querySelectorAll('.pitem').length) throw new Error('aucun parcours créé (addParcours)');
    const nbFetchAvant = fetchCalls.length;

    w.openDevis(0);
    // remplir TOUS les champs éditables du devis avec la valeur-témoin
    const eds = d.querySelectorAll('#devisOverlay .ed');
    eds.forEach(e => { e.textContent = SENTINEL; });
    d.getElementById('dvPatient').textContent = SENTINEL;
    ok(`devis ouvert, ${eds.length} champs éditables remplis avec le patient témoin`);

    // Fermer le devis (geste utilisateur)
    w.closeDevis();

    // ── Inspection : le témoin ne doit subsister nulle part ──
    const inStore = (store) => {
      try { for (let i = 0; i < store.length; i++) {
        const k = store.key(i); if (k && (k.includes(SENTINEL) || (store.getItem(k) || '').includes(SENTINEL))) return true;
      } } catch (e) {}
      return false;
    };
    inStore(w.localStorage)   ? bad('trace dans localStorage')   : ok('localStorage : aucune trace');
    inStore(w.sessionStorage) ? bad('trace dans sessionStorage') : ok('sessionStorage : aucune trace');
    (d.cookie || '').includes(SENTINEL) ? bad('trace dans les cookies') : ok('cookies : aucune trace');
    // indexedDB : non implémenté par jsdom ⇒ inutilisable par le code (couvert par le scan statique)
    ok('indexedDB : non disponible (donc non utilisé) — confirmé par le scan statique');

    // DOM après fermeture : plus aucune trace du patient
    d.documentElement.innerHTML.includes(SENTINEL)
      ? bad('trace persistante dans le DOM après fermeture')
      : ok('DOM après fermeture : champs patient effacés, aucune trace');

    // ── Preuve réseau ──
    console.log('\n[3] Réseau — aucune requête ne porte le patient');
    const nbFetchApres = fetchCalls.length;
    (nbFetchApres === nbFetchAvant)
      ? ok(`aucun appel réseau déclenché par le devis (${nbFetchAvant} avant / ${nbFetchApres} après)`)
      : bad(`${nbFetchApres - nbFetchAvant} appel(s) réseau déclenché(s) par le devis`);
    fetchCalls.some(c => c.url.includes(SENTINEL) || c.body.includes(SENTINEL))
      ? bad('un appel réseau contient le patient témoin')
      : ok('aucun appel réseau ne contient le patient témoin');

  } catch (e) {
    bad('exception pendant le test : ' + (e && e.message || e));
  }

  console.log('\n' + '─'.repeat(60));
  if (failures === 0) {
    console.log('✅ PREUVE ÉTABLIE — aucune donnée patient ne persiste (0 échec).');
    console.log('   Test reproductible, archivable pour audit CCIN / loi n° 1.565.');
    process.exit(0);
  } else {
    console.log(`❌ ÉCHEC — ${failures} vérification(s) en échec. Ne pas déployer en l'état.`);
    process.exit(1);
  }
}, 900);
