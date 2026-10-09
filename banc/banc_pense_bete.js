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

const INDEX = JSON.parse(fs.readFileSync(racine('docs/module-liberal/ccam_actes.json'), 'utf8'));
function ouvrir(stock, opts = {}) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  const reseau = [];
  const dom = new JSDOM(PAGE, {
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    url: 'https://planningmedic.github.io/pense-bete/',
    beforeParse(w) {
      const D = w.Date; w.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
      w.fetch = (u, o) => { reseau.push(['fetch', String(u), o && o.body, o && o.method]);
        return opts.ccam ? Promise.resolve({ ok: true, json: () => Promise.resolve(INDEX) }) : Promise.reject(new Error('interdit')); };
      w.XMLHttpRequest = function () { reseau.push(['xhr']); this.open = () => {}; this.send = b => reseau.push(['xhr-send', b]); };
      w.navigator.sendBeacon = (u, b) => { reseau.push(['beacon', u, b]); return true; };
      w.WebSocket = function (u) { reseau.push(['ws', u]); };
      w.Element.prototype.focus = function () {};
      if (stock) w.localStorage.setItem(CLE, stock);
      if (opts.compteur) w.localStorage.setItem('pense-bete-compteur-v1', opts.compteur);
    },
  });
  const w = dom.window, $ = id => w.document.getElementById(id);
  return {
    w, $, reseau, erreurs,
    secteur(s) { const b = [...w.document.querySelectorAll('#chips .chip')].find(x => x.dataset.s === s); b && b.click(); return !!b; },
    ajouter(date, ini) { if (date) $('dt').value = date; $('ini').value = ini; $('frm').dispatchEvent(new w.Event('submit', { cancelable: true })); },
    stock() { return w.localStorage.getItem(CLE); },
    liste() { return JSON.parse(w.localStorage.getItem(CLE) || '[]'); },
  };
}

/* ── 1. LECTURE DU FICHIER ─────────────────────────────────────────────── */
console.log('\n[1] Le fichier ne contient aucun moyen d\'envoyer quoi que ce soit');
const script = (PAGE.match(/<script>([\s\S]*?)<\/script>/) || ['', ''])[1];
// (05/10/2026) un SEUL fetch permis : le téléchargement de la liste CCAM publique
const fetchs = script.match(/fetch\(/g) || [];
V('un seul fetch, celui de la liste CCAM du site (même adresse), sans contenu envoyé',
  fetchs.length === 1 && /fetch\(CCAM_URL,\{method:'GET',credentials:'omit'/.test(script)
  && /const CCAM_URL='\/docs\/module-liberal\/ccam_actes\.json\?v=\d+';/.test(script) && !/\bbody\s*:/.test(script));
for (const api of ['XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'document.cookie', 'indexedDB', 'serviceWorker', 'import(']) {
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
  [...p.w.document.querySelectorAll('#chips .chip')].map(b => b.dataset.s).join('|') === 'Endos|Viscéral|Ortho|ORL|Cardio|Mater');
V('aucun secteur choisi à l\'ouverture', !p.w.document.querySelector('#chips .chip[aria-checked="true"]'));

p.ajouter('2026-10-14', TEMOIN);
V('sans secteur : refusé, message clair', p.liste().length === 0 && /secteur/i.test(p.$('msg').textContent), p.$('msg').textContent);
p.secteur('Ortho');
V('le secteur touché est marqué', p.w.document.querySelector('#chips .chip[aria-checked="true"]').dataset.s === 'Ortho');
p.ajouter('2026-10-14', 'zq');
V('ajout : initiales passées en majuscules', p.liste().length === 1 && p.liste()[0].i === TEMOIN && p.liste()[0].s === 'Ortho' && p.liste()[0].d === '2026-10-14', p.liste());
V('après ajout : date et secteur gardés, initiales vidées', p.$('dt').value === '2026-10-14' && p.w.document.querySelector('#chips .chip[aria-checked="true"]').dataset.s === 'Ortho' && p.$('ini').value === '');
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

/* ── 6. COMPTEUR (05/10/2026) ──────────────────────────────────────────── */
console.log('\n[6] Compteur — règle des 30 %, axe CCAM');
// Montant « à la française » (1 234,56) hors appels de code type slice(0,10) ;
// seul l'exemple de saisie, volontairement fictif, est permis.
const MONTANT = /(?<![(\w,])\d{1,3}(?:[ \u00a0]\d{3})*,\d{2}(?!\d)/g;
const montants = (PAGE.match(MONTANT) || []).filter(m => m !== '1 234,56');
V('aucun montant écrit dans la page, commentaires compris (seul l\'exemple fictif 1 234,56)', montants.length === 0, montants);
const c = ouvrir();
const cl = c.$('tC'); cl.click();
V('onglet Compteur s\'ouvre, Patients se cache', !c.$('vC').hidden && c.$('vP').hidden);
V('sans réglages : boutons grisés, Réglages ouverts', [...c.w.document.querySelectorAll('.geste')].every(b => b.disabled) && c.$('cReg').open);
// Valeurs FICTIVES (le dépôt est public) — choisies pour des sommes vérifiables à la main.
const regler = (o, d0, p0, l0, vals) => {
  o.$('rD0').value = d0; o.$('rP0').value = p0; o.$('rL0').value = l0;
  for (const [k, v] of Object.entries(vals)) o.$('rv_' + k).value = v;
  o.$('rSave').click();
};
const VALS = { colo_mc: '20,00', colo_fr: '10,00', gastro_mc: '18', gastro_fr: '9,50', combo_mc: '30,01', combo_fr: '15,00' };
regler(c, '2026-09-30', '1 000,00', '', { ...VALS, combo_fr: '' });
V('réglage incomplet refusé avec le nom du geste', /Colo \+ gastro · France/.test(c.$('rMsg').textContent), c.$('rMsg').textContent);
regler(c, '2026-09-30', '1 000,00', '', VALS);
V('réglages enregistrés (libéral vide = 0)', /Enregistré/.test(c.$('rMsg').textContent) && [...c.w.document.querySelectorAll('#cCcamF .geste')].every(b => !b.disabled));
V('départ : 0,0 % et marge = 3/7 × 1 000 = 428,57 €', c.$('cPct').textContent === '0,0 %' && /428,57/.test(c.$('cMarge').textContent),
  [c.$('cPct').textContent, c.$('cMarge').textContent]);
const geste = (o, g, mode, ass, d) => {
  if (d) o.$('cDt').value = d;
  o.w.document.querySelector('#cMode .chip[data-v="' + mode + '"]').click();
  o.w.document.querySelector('#cAss .chip[data-v="' + ass + '"]').click();
  o.w.document.querySelector('.geste[data-g="' + g + '"]').click();
};
geste(c, 'colo', 'lib', 'mc', '2026-09-30');
V('acte daté du jour du relevé refusé (déjà compté)', c.$('cList').querySelectorAll('.acte').length === 0 && /déjà compté/.test(c.$('cMsg').textContent));
geste(c, 'combo', 'lib', 'mc', '2026-10-01');   // 30,01
geste(c, 'gastro', 'lib', 'fr', '2026-10-02');  //  9,50
geste(c, 'colo', 'pub', 'fr', '2026-10-02');    // 10,00
// L = 39,51 ; P = 1 010,00 ; T = 1 049,51 ; 39,51 / 1 049,51 = 3,76 % ; marge = (3×101000 − 7×3951)/7 = 39 334,71 c
V('libéral = 39,51 € (2 actes), public = 1 010,00 € (+1)', /39,51/.test(c.$('cLib').textContent) && /2 actes/.test(c.$('cLib').textContent) && /1\s010,00/.test(c.$('cPub').textContent),
  [c.$('cLib').textContent, c.$('cPub').textContent]);
V('part libérale 3,8 %', c.$('cPct').textContent === '3,8 %', c.$('cPct').textContent);
V('marge 393,34 € (au centime, arrondi vers le bas)', /393,34/.test(c.$('cMarge').textContent), c.$('cMarge').textContent);
V('liste : 3 actes, le plus récent en haut', c.$('cList').querySelectorAll('.acte').length === 3 && /02\/10/.test(c.$('cList').querySelector('.acte').textContent));
// Dépassement : public 100 €, libéral 50 € → T 150, excédent = 50 − 45 = 5,00 ; public à produire = 16,67
const e = ouvrir(); e.$('tC').click();
regler(e, '2026-09-30', '100', '50', VALS);
V('au-delà de 30 % : excédent 5,00 € et public à produire 16,67 €', /Au-delà de 30 % : 5,00/.test(e.$('cMarge').textContent) && /16,67/.test(e.$('cMarge').textContent),
  e.$('cMarge').textContent);
V('33,3 % affiché', e.$('cPct').textContent === '33,3 %', e.$('cPct').textContent);
// Retirer + Annuler, sans toucher la liste des patients
const n1 = c.liste().length;
c.$('cList').querySelector('.cx').click();
V('retirer un acte : 2 restants, barre Annuler', c.$('cList').querySelectorAll('.acte').length === 2 && c.$('undo').style.display === 'flex');
c.$('undoBtn').click();
V('Annuler le remet, la liste des patients est intacte', c.$('cList').querySelectorAll('.acte').length === 3 && c.liste().length === n1);
// Nouveau relevé : les actes antérieurs disparaissent (ils y sont déjà)
regler(c, '2026-10-01', '1 000,00', '30,01', VALS);
V('nouveau relevé au 01/10 : l\'acte du 01/10 est retiré, 2 restent', c.$('cList').querySelectorAll('.acte').length === 2 && /1 acte antérieur/.test(c.$('rMsg').textContent),
  c.$('rMsg').textContent);
V('aucun appel réseau dans le compteur', c.reseau.length === 0 && e.reseau.length === 0, c.reseau.concat(e.reseau));
// Réouverture : compteur et onglet retrouvés
const brut = c.w.localStorage.getItem('pense-bete-compteur-v1');
const o4 = (() => {
  const vc2 = new VirtualConsole(); const r4 = [];
  const d = new JSDOM(PAGE, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2, url: 'https://planningmedic.github.io/pense-bete/',
    beforeParse(w) { const D = w.Date; w.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
      w.fetch = () => { r4.push('fetch'); return Promise.reject(); }; w.Element.prototype.focus = function () {};
      w.localStorage.setItem('pense-bete-compteur-v1', brut); w.localStorage.setItem('pense-bete-onglet', 'C'); } });
  return { d, r4 };
})();
V('réouverture : onglet Compteur et 2 actes retrouvés', !o4.d.window.document.getElementById('vC').hidden && o4.d.window.document.querySelectorAll('#cList .acte').length === 2);
const o5 = (() => { const d = new JSDOM(PAGE, { runScripts: 'dangerously', url: 'https://planningmedic.github.io/pense-bete/',
  beforeParse(w) { w.Element.prototype.focus = function () {}; w.localStorage.setItem('pense-bete-compteur-v1', '{abîmé'); } }); return d; })();
V('compteur abîmé : la page s\'ouvre, réglages demandés', o5.window.document.querySelectorAll('#cCcamF .geste[disabled]').length === 4 && o5.window.document.getElementById('cCode').disabled);

/* ── 7. AUTRE ACTE : code CCAM tapé (05/10/2026) ────────────────────────── */
(async () => {
  console.log('\n[7] Autre acte — code CCAM, tarif de la liste du site');
  const pause = () => new Promise(r => setTimeout(r, 20));
  const t = (c) => INDEX.actes.find(a => a.c === c).t;
  const att = (tarif, r50, mc) => Math.round(Math.round(tarif * 100) * 1.06 * (r50 ? 0.5 : 1) * (mc ? 1.95 : 1));
  const fmt = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const a = ouvrir(null, { ccam: true }); a.$('tC').click();
  regler(a, '2026-09-30', '1 000,00', '', VALS);
  a.$('cDt').value = '2026-10-03';             // la date du jour simulée est celle du relevé
  const taper = async (code) => { a.$('cCode').value = code; a.$('cCode').dispatchEvent(new a.w.Event('input')); await pause(); };
  V('pas de téléchargement tant qu\'aucun code n\'est tapé', a.reseau.length === 0, a.reseau);
  await taper('hhqe00');
  V('code incomplet : rien n\'est cherché', a.reseau.length === 0 && a.$('cLibelle').textContent === '');
  await taper('hhqe002');
  V('code tapé en minuscules : libellé affiché', /Coloscopie totale/.test(a.$('cLibelle').textContent), a.$('cLibelle').textContent);
  V('aperçu Monaco libéral = tarif + 6 % × coefficient Monaco', a.$('cLibelle').textContent.includes(fmt(att(t('HHQE002'), 0, 1))), a.$('cLibelle').textContent);
  a.$('cAutre').click(); await pause();
  V('ajouté : HHQE002 dans la liste, au montant attendu', /HHQE002/.test(a.$('cList').textContent) && a.$('cList').textContent.includes(fmt(att(t('HHQE002'), 0, 1))), a.$('cList').textContent);
  V('même valeur que la colo des Réglages, calculée de la même façon (au centime)', att(t('HHQE002'), 0, 1) === Math.round(5203 * 1.06 * 1.95));
  V('champ vidé après ajout', a.$('cCode').value === '' && !a.$('c50').checked);
  a.w.document.querySelector('#cAss .chip[data-v="fr"]').click();
  a.w.document.querySelector('#cMode .chip[data-v="pub"]').click();
  await taper('ZZLP025'); a.$('c50').checked = true; a.$('c50').dispatchEvent(new a.w.Event('change')); await pause();
  a.$('cAutre').click(); await pause();
  V('2e acte France public à 50 % compté au bon montant', /ZZLP025 \(50 %\)/.test(a.$('cList').textContent) && a.$('cPub').textContent.includes(fmt(100000 + att(t('ZZLP025'), 1, 0))),
    [a.$('cList').textContent, a.$('cPub').textContent]);
  await taper('AAAA000');
  V('code absent de la liste : refusé, message clair', /absent de la liste/.test(a.$('cLibelle').textContent));
  const n = a.$('cList').querySelectorAll('.acte').length;
  a.$('cAutre').click(); await pause();
  V('…et Ajouter ne compte rien', a.$('cList').querySelectorAll('.acte').length === n);
  await taper('1234ABC');
  V('format faux : 4 lettres et 3 chiffres demandés', /4 lettres et 3 chiffres/.test(a.$('cLibelle').textContent));
  V('UN seul téléchargement, de la liste CCAM du site, sans contenu ni code dans l\'adresse',
    a.reseau.length === 1 && a.reseau[0][1] === '/docs/module-liberal/ccam_actes.json?v=84' && a.reseau[0][2] === undefined && a.reseau[0][3] === 'GET', a.reseau);
  V('rien de saisi ne part dans le réseau (codes absents des appels)', !JSON.stringify(a.reseau).match(/HHQE002|ZZLP025|AAAA000/));
  // Liste injoignable
  const b = ouvrir(); b.$('tC').click(); regler(b, '2026-09-30', '1 000,00', '', VALS);
  b.$('cCode').value = 'HHQE002'; b.$('cCode').dispatchEvent(new b.w.Event('input')); await pause();
  V('liste injoignable : message, rien de compté', /injoignable/.test(b.$('cLibelle').textContent) && b.$('cList').querySelectorAll('.acte').length === 0);
  // Réouverture : l'acte « autre » garde sa valeur sans re-télécharger
  const brut2 = a.w.localStorage.getItem('pense-bete-compteur-v1');
  const r2 = []; const d2 = new JSDOM(PAGE, { runScripts: 'dangerously', url: 'https://planningmedic.github.io/pense-bete/',
    beforeParse(w) { w.fetch = (u) => { r2.push(u); return Promise.reject(); }; w.Element.prototype.focus = function () {};
      w.localStorage.setItem('pense-bete-compteur-v1', brut2); } });
  d2.window.document.getElementById('tC').click();
  V('réouverture : montant figé retrouvé sans aucun téléchargement', r2.length === 0 && d2.window.document.getElementById('cLib').textContent.includes(fmt(att(t('HHQE002'), 0, 1))));

  /* ── 8. FORFAITS DE RÉANIMATION (05/10/2026) ─────────────────────────── */
  console.log('\n[8] Forfaits de réa A et B — tarif des Réglages, sans modificateur 7');
  const z = ouvrir(null, { ccam: true }); z.$('tC').click();
  regler(z, '2026-09-30', '1 000,00', '', VALS);
  z.$('cDt').value = '2026-10-03';
  const tz = async (code) => { z.$('cCode').value = code; z.$('cCode').dispatchEvent(new z.w.Event('input')); await pause(); };
  await tz('YYYY015');
  V('tarif non renseigné : message qui renvoie aux Réglages', /renseignez son tarif dans les Réglages/.test(z.$('cLibelle').textContent), z.$('cLibelle').textContent);
  V('…et rien n\'est téléchargé pour un forfait de réa', z.reseau.length === 0, z.reseau);
  z.$('rr_YYYY015').value = 'abc'; z.$('rSave').click();
  V('tarif illisible refusé', /Tarif illisible : Réa A/.test(z.$('rMsg').textContent), z.$('rMsg').textContent);
  // Tarifs FICTIFS
  z.$('rr_YYYY015').value = '100'; z.$('rr_YYYY020').value = '200,50'; z.$('rSave').click();
  V('tarifs réa enregistrés', /Enregistré/.test(z.$('rMsg').textContent));
  z.w.document.querySelector('#cMode .chip[data-v="pub"]').click();
  z.w.document.querySelector('#cAss .chip[data-v="mc"]').click();
  await tz('yyyy015');
  V('Réa A Monaco = 100 × coefficient Monaco = 195,00 € (pas de +6 %)', /niveau A → 195,00/.test(z.$('cLibelle').textContent), z.$('cLibelle').textContent);
  z.$('cAutre').click(); await pause();
  z.w.document.querySelector('#cAss .chip[data-v="fr"]').click();
  await tz('YYYY020'); z.$('c50').checked = true; z.$('c50').dispatchEvent(new z.w.Event('change')); await pause();
  V('Réa B France à 50 % = 100,25 €', /niveau B → 100,25/.test(z.$('cLibelle').textContent), z.$('cLibelle').textContent);
  z.$('cAutre').click(); await pause();
  V('public = 1 000 + 195,00 + 100,25 = 1 295,25 €', /1\s295,25/.test(z.$('cPub').textContent), z.$('cPub').textContent);
  V('liste : YYYY015 et YYYY020 (50 %)', /YYYY015/.test(z.$('cList').textContent) && /YYYY020 \(50 %\)/.test(z.$('cList').textContent));
  V('aucun téléchargement pour les forfaits de réa', z.reseau.length === 0, z.reseau);
  V('tarifs réa gardés dans les Réglages après réaffichage', z.$('rr_YYYY015').value === '100,00' && z.$('rr_YYYY020').value === '200,50');
  // Données enregistrées AVANT cette version (sans tarifs réa) : relues sans perte
  const ancien = JSON.stringify({ d0: '2026-09-30', p0: 100000, l0: 0, v: { colo_mc: 2000, colo_fr: 1000, gastro_mc: 1800, gastro_fr: 950, combo_mc: 3001, combo_fr: 1500 },
    actes: [{ id: 'x1', d: '2026-10-01', g: 'colo', m: 'lib', a: 'mc', t: 1 }] });
  const av = ouvrir(null, { compteur: ancien }); av.$('tC').click();
  V('données d\'avant la mise à jour : compteur intact (20,00 € libéral, 1 acte)', /20,00/.test(av.$('cLib').textContent) && av.$('cList').querySelectorAll('.acte').length === 1 && av.erreurs.length === 0,
    [av.$('cLib').textContent, av.erreurs]);

  /* ── 9. AXE NGAP — consultations, compté à part (09/10/2026) ────────────── */
  console.log('\n[9] Axe NGAP — consultations CS / APC, jamais mêlées au CCAM');
  const ng = ouvrir(); ng.$('tC').click();
  regler(ng, '2026-09-30', '1 000,00', '', VALS);
  const axe = (o, v) => o.w.document.querySelector('#cAxe .chip[data-v="' + v + '"]').click();
  V('à l\'ouverture : axe CCAM, formulaire CCAM visible, NGAP caché', !ng.$('cCcamF').hidden && ng.$('cNgapF').hidden && ng.$('cSub').textContent.startsWith('part libérale CCAM'));
  axe(ng, 'ngap');
  V('axe NGAP : formulaire NGAP, « Date de la consultation », Réglages demandés', ng.$('cCcamF').hidden && !ng.$('cNgapF').hidden
    && ng.$('cDtL').textContent === 'Date de la consultation' && /point de départ NGAP/.test(ng.$('cMsg').textContent) && ng.$('cReg').open, ng.$('cMsg').textContent);
  V('NGAP non réglé : CS et APC grisés, le CCAM reste réglé', [...ng.w.document.querySelectorAll('#cNgap .geste')].every(b => b.disabled) && ng.$('cPct').textContent === '—');
  // Bloc NGAP incomplet → refusé, tout ou rien ; le CCAM n'est pas touché
  ng.$('rPn0').value = '400'; ng.$('rSave').click();
  V('NGAP incomplet refusé avec le nom de la consultation', /NGAP : valeur manquante ou illisible : CS/.test(ng.$('rMsg').textContent), ng.$('rMsg').textContent);
  // Valeurs FICTIVES : CS 10, APC 12,50 ; départ public 400, libéral 0
  ng.$('rvn_CS').value = '10'; ng.$('rvn_APC').value = '12,50'; ng.$('rSave').click();
  V('NGAP enregistré : 0,0 % et marge = 3/7 × 400 = 171,42 €', /Enregistré/.test(ng.$('rMsg').textContent) && ng.$('cPct').textContent === '0,0 %' && /171,42/.test(ng.$('cMarge').textContent),
    [ng.$('rMsg').textContent, ng.$('cPct').textContent, ng.$('cMarge').textContent]);
  const consult = (o, g, mode, ass, d) => {
    if (d) o.$('cDt').value = d;
    o.w.document.querySelector('#cMode .chip[data-v="' + mode + '"]').click();
    o.w.document.querySelector('#cAss .chip[data-v="' + ass + '"]').click();
    o.w.document.querySelector('#cNgap .geste[data-n="' + g + '"]').click();
  };
  consult(ng, 'CS', 'lib', 'mc', '2026-10-05');
  V('APC grisée pour un assuré Monaco, avec l\'explication', ng.w.document.querySelector('#cNgap .geste[data-n="APC"]').disabled && /cotation française/.test(ng.$('cApcNote').textContent));
  ng.w.document.querySelector('#cNgap .geste[data-n="APC"]').click();
  V('…et un clic sur APC Monaco ne compte rien', ng.$('cList').querySelectorAll('.acte').length === 1);
  consult(ng, 'APC', 'lib', 'fr', '2026-10-06');   // 12,50
  consult(ng, 'CS', 'pub', 'fr', '2026-10-06');    // 10,00
  // L = 22,50 ; P = 410 ; T = 432,50 → 5,2 % ; marge = (3×41000 − 7×2250)/7 = 15 321,42 c
  V('NGAP : libéral 22,50 € (2), public 410,00 € (+1), 5,2 %', /22,50/.test(ng.$('cLib').textContent) && /2 actes/.test(ng.$('cLib').textContent)
    && /410,00/.test(ng.$('cPub').textContent) && ng.$('cPct').textContent === '5,2 %', [ng.$('cLib').textContent, ng.$('cPub').textContent, ng.$('cPct').textContent]);
  V('NGAP : marge 153,21 €', /153,21/.test(ng.$('cMarge').textContent), ng.$('cMarge').textContent);
  V('liste NGAP : 3 consultations, titre adapté', ng.$('cList').querySelectorAll('.acte').length === 3 && /Consultations comptées \(3\)/.test(ng.$('cListT').textContent) && /APC/.test(ng.$('cList').textContent));
  // Un geste CCAM n'entre pas dans le NGAP, et inversement
  axe(ng, 'ccam');
  V('retour au CCAM : 0,0 %, public 1 000,00 €, aucune consultation dans la liste', ng.$('cPct').textContent === '0,0 %' && /1\s000,00/.test(ng.$('cPub').textContent)
    && ng.$('cList').querySelectorAll('.acte').length === 0, [ng.$('cPct').textContent, ng.$('cPub').textContent]);
  geste(ng, 'colo', 'lib', 'mc', '2026-10-07');   // 20,00 CCAM
  axe(ng, 'ngap');
  V('un acte CCAM ne bouge pas le NGAP (toujours 22,50 € libéral)', /22,50/.test(ng.$('cLib').textContent) && ng.$('cList').querySelectorAll('.acte').length === 3, ng.$('cLib').textContent);
  // Retirer + Annuler une consultation
  ng.$('cList').querySelector('.cx').click();
  V('retirer une consultation : barre Annuler nommée', ng.$('cList').querySelectorAll('.acte').length === 2 && /(CS|APC) retiré/.test(ng.$('undoTxt').textContent), ng.$('undoTxt').textContent);
  ng.$('undoBtn').click();
  V('Annuler la remet', ng.$('cList').querySelectorAll('.acte').length === 3);
  // Nouveau relevé : les consultations antérieures disparaissent aussi
  regler(ng, '2026-10-05', '1 000,00', '', VALS);
  V('nouveau relevé au 05/10 : la CS du 05/10 est retirée, valeurs NGAP gardées', ng.$('cList').querySelectorAll('.acte').length === 2 && ng.$('rvn_APC').value === '12,50' && ng.$('rPn0').value === '400,00');
  V('aucun appel réseau pour le NGAP', ng.reseau.length === 0, ng.reseau);
  // Réouverture : axe NGAP retrouvé
  const brut3 = ng.w.localStorage.getItem('pense-bete-compteur-v1');
  const d3 = new JSDOM(PAGE, { runScripts: 'dangerously', url: 'https://planningmedic.github.io/pense-bete/',
    beforeParse(w) { w.Element.prototype.focus = function () {}; w.localStorage.setItem('pense-bete-compteur-v1', brut3);
      w.localStorage.setItem('pense-bete-axe', 'ngap'); w.localStorage.setItem('pense-bete-onglet', 'C'); } });
  V('réouverture : axe NGAP et 2 consultations retrouvés', !d3.window.document.getElementById('cNgapF').hidden && d3.window.document.querySelectorAll('#cList .acte').length === 2);
  // Données d'avant (sans NGAP) : CCAM intact, NGAP simplement à régler
  const av2 = ouvrir(null, { compteur: ancien }); av2.$('tC').click(); axe(av2, 'ngap');
  V('données d\'avant : NGAP vide demande ses Réglages, sans erreur', av2.$('cPct').textContent === '—' && av2.erreurs.length === 0 && av2.$('cList').querySelectorAll('.acte').length === 0, av2.erreurs);
  console.log(`\n${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
