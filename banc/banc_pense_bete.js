/* ═══ BANC — PENSE-BÊTE « MES PATIENTS LIB » (30/09/2026) ═══
   Page AUTONOME (pense-bete/) : date opératoire + secteur + initiales, gardés
   dans le stockage local du navigateur. La contrainte qui compte : AUCUNE
   saisie ne quitte le téléphone. On la prouve de trois façons :
     1. lecture du fichier : aucune instruction d'envoi, aucune ressource
        extérieure (police, script, image) ;
     2. navigateur simulé : fetch / XHR / sendBeacon / WebSocket piégés, on
        saisit des patients fictifs, rien n'est appelé ;
     3. la saisie survit à une réouverture (stockage local) et à rien d'autre.
   Puis les gestes : secteur obligatoire, date et secteur gardés entre deux
   patients, effacement + Annuler, tri par date, passés repliés.

   Ce que le banc ne prouve PAS : l'installation réelle sur iPhone, ni la
   durée de conservation par iOS. Ces points se vérifient à la main. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const racine = (...p) => path.join(__dirname, '..', ...p);
const PAGE = fs.readFileSync(racine('pense-bete/index.html'), 'utf8');
const MANIF = JSON.parse(fs.readFileSync(racine('pense-bete/manifest.webmanifest'), 'utf8'));
const CLE = 'pense-bete-lib-v1';
const TEMOIN = 'ZQ';                      // initiales-témoin, improbables ailleurs
const T0 = new Date(2026, 8, 30, 10, 0, 0).getTime();

function ouvrir(stock) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const reseau = [];
  const dom = new JSDOM(PAGE, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://planningmedic.github.io/pense-bete/',
    beforeParse(w) {
      const D = w.Date; w.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
      w.fetch = (u, o) => { reseau.push(['fetch', String(u), o && o.body]); return Promise.reject(new Error('interdit')); };
      w.XMLHttpRequest = function () { reseau.push(['xhr']); this.open = () => {}; this.send = b => reseau.push(['xhr-send', b]); };
      w.navigator.sendBeacon = (u, b) => { reseau.push(['beacon', u, b]); return true; };
      w.WebSocket = function (u) { reseau.push(['ws', u]); };
      w.Element.prototype.focus = function () {};
      if (stock) w.localStorage.setItem(CLE, stock);
    },
  });
  const w = dom.window, $ = id => w.document.getElementById(id);
  return {
    w, $, reseau, erreurs,
    secteur(s) { const b = [...w.document.querySelectorAll('.chip')].find(x => x.dataset.s === s); b && b.click(); return !!b; },
    ajouter(date, ini) { if (date) $('dt').value = date; $('ini').value = ini; $('frm').dispatchEvent(new w.Event('submit', { cancelable: true })); },
    stock() { return w.localStorage.getItem(CLE); },
    liste() { return JSON.parse(w.localStorage.getItem(CLE) || '[]'); },
  };
}

/* ── 1. LECTURE DU FICHIER ─────────────────────────────────────────────── */
console.log('\n[1] Le fichier ne contient aucun moyen d\'envoyer quoi que ce soit');
const script = (PAGE.match(/<script>([\s\S]*?)<\/script>/) || ['', ''])[1];
for (const api of ['fetch', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'document.cookie', 'indexedDB', 'serviceWorker', 'import(']) {
  V(api + ' absent du code', !script.includes(api));
}
V('aucune adresse extérieure (police, script, image, lien)', !/(https?:)?\/\/[a-z0-9.-]+\.[a-z]/i.test(PAGE.replace(/<!--[\s\S]*?-->/g, '')));
V('aucun <script src>, aucun <link rel="stylesheet">', !/<script[^>]+src=/i.test(PAGE) && !/rel="stylesheet"/i.test(PAGE));
V('noindex posé', /name="robots" content="noindex, nofollow"/.test(PAGE));
V('manifeste propre au dossier (périmètre /pense-bete/)', MANIF.id === '/pense-bete/' && MANIF.scope === '/pense-bete/' && MANIF.start_url === '/pense-bete/');
V('les 4 icônes existent', ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'].every(f => fs.existsSync(racine('pense-bete', f))));
V('la page n\'est reliée ni au portail ni à la tuile Libéral',
  !['index.html', 'dashboard.html', 'docs/module-liberal/estimateur-liberal.html'].some(f => fs.readFileSync(racine(f), 'utf8').includes('pense-bete')));

/* ── 2. NAVIGATEUR SIMULÉ ──────────────────────────────────────────────── */
console.log('\n[2] Saisie de patients fictifs — rien ne sort');
const p = ouvrir();
V('ouverture sans erreur', p.erreurs.length === 0, p.erreurs);
V('date du jour pré-remplie', p.$('dt').value === '2026-09-30', p.$('dt').value);
V('les 6 secteurs sont des boutons, dans l\'ordre',
  [...p.w.document.querySelectorAll('.chip')].map(b => b.dataset.s).join('|') === 'Endos|Viscéral|Ortho|ORL|Cardio|Mater');
V('aucun secteur choisi à l\'ouverture', !p.w.document.querySelector('.chip[aria-checked="true"]'));

p.ajouter('2026-10-14', TEMOIN);
V('sans secteur : refusé, message clair', p.liste().length === 0 && /secteur/i.test(p.$('msg').textContent), p.$('msg').textContent);
p.secteur('Ortho');
V('le secteur touché est marqué', p.w.document.querySelector('.chip[aria-checked="true"]').dataset.s === 'Ortho');
p.ajouter('2026-10-14', 'zq');
V('ajout : initiales passées en majuscules', p.liste().length === 1 && p.liste()[0].i === TEMOIN && p.liste()[0].s === 'Ortho' && p.liste()[0].d === '2026-10-14', p.liste());
V('après ajout : date et secteur gardés, initiales vidées', p.$('dt').value === '2026-10-14' && p.w.document.querySelector('.chip[aria-checked="true"]').dataset.s === 'Ortho' && p.$('ini').value === '');
p.ajouter(null, 'AB');
p.secteur('Endos'); p.ajouter('2026-10-02', 'CD');
p.secteur('Mater'); p.ajouter('2026-09-12', 'EF');
p.ajouter('2026-10-20', '');
V('sans initiales : refusé', p.liste().length === 4, p.liste().length);
V('aucun appel réseau pendant toute la saisie', p.reseau.length === 0, p.reseau);
V('les initiales-témoin ne sont que dans le stockage local', p.stock().includes(TEMOIN) && !p.w.document.cookie.includes(TEMOIN) && p.w.sessionStorage.length === 0);

console.log('\n[3] Affichage');
const jours = [...p.$('next').querySelectorAll('.day')];
V('à venir triés par date (2/10 puis 14/10)', jours.length === 2 && jours[0].textContent.includes('2') && jours[1].textContent.includes('14') && jours[0].textContent.includes('CD'),
  jours.map(j => j.textContent));
V('deux patients du même jour groupés', jours[1].querySelectorAll('.pt').length === 2);
V('patient passé replié à part', !p.$('pastBox').hidden && p.$('pastSum').textContent === 'Passés (1)' && p.$('past').textContent.includes('EF'));
p.secteur('ORL'); p.ajouter('2026-10-03', '<img src=x onerror=alert(1)>');
V('saisie piégée affichée comme du texte, pas du code', !p.$('next').querySelector('img'));

console.log('\n[4] Effacer et Annuler');
const n0 = p.liste().length;
p.$('next').querySelector('.x').click();
V('effacé du stockage', p.liste().length === n0 - 1);
V('barre « Annuler » visible', p.$('undo').style.display === 'flex' && /effacé/.test(p.$('undoTxt').textContent));
p.$('undoBtn').click();
V('Annuler le remet', p.liste().length === n0);

console.log('\n[5] Réouverture');
const q = ouvrir(p.stock());
V('la liste est retrouvée à la réouverture', q.liste().length === n0 && q.$('next').textContent.includes(TEMOIN));
V('toujours aucun appel réseau', q.reseau.length === 0, q.reseau);
const r = ouvrir('{pas du json');
V('stockage abîmé : la page s\'ouvre quand même, liste vide', r.erreurs.length === 0 && /Aucun patient/.test(r.$('next').textContent));

console.log(`\n${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
