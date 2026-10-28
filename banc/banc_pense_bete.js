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
    assure(a) { const b = w.document.querySelector('#pAss .chip[data-a="' + a + '"]'); b && b.click(); return !!b; },
    // (26/10/2026) l'assurance est obligatoire et remise à zéro après chaque ajout :
    // par défaut le banc touche « Monaco » ; ass === null = ne rien toucher.
    ajouter(date, ini, ass = 'mc') { if (ass) this.assure(ass); if (date) $('dt').value = date; $('ini').value = ini; $('frm').dispatchEvent(new w.Event('submit', { cancelable: true })); },
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
  const att = (tarif, r50, mc) => Math.round(Math.round(Math.round(tarif * 100) * 1.06) * (r50 ? 0.5 : 1) * (mc ? 1.98 : 1));
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
  V('même valeur que la colo des Réglages, calculée de la même façon (au centime)', att(t('HHQE002'), 0, 1) === Math.round(Math.round(5203 * 1.06) * 1.98));
  /* (20/10/2026) DÉFAUT TROUVÉ EN PRODUCTION : le Compteur multipliait par 1,95,
     coefficient périmé depuis le 01/10/2026 (1,98), et n'arrondissait qu'à la fin.
     Cas réel relevé dans le recueil de l'hôpital : HHFE002, assuré Monaco, avec
     modificateur 7 → base 113,24 € (le code donnait 111,51 €). */
  await taper('HHFE002');
  V('cas réel HHFE002 Monaco : 113,24 € comme le recueil de l\'hôpital', t('HHFE002') === 53.95 && a.$('cLibelle').textContent.includes('113,24'), a.$('cLibelle').textContent);
  V('…l\'arrondi se fait après le modificateur 7 (un arrondi final unique donnait 113,23)', att(53.95, 0, 1) === 11324 && Math.round(5395 * 1.06 * 1.98) === 11323);
  V('plus aucun 1,95 dans le calcul du pense-bête', !/1\.95/.test(PAGE) && /COEF_MC = 1\.98/.test(PAGE));
  a.$('cCode').value = ''; a.$('cCode').dispatchEvent(new a.w.Event('input')); await pause();
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
  V('Réa A Monaco = 100 × coefficient Monaco = 198,00 € (pas de +6 %)', /niveau A → 198,00/.test(z.$('cLibelle').textContent), z.$('cLibelle').textContent);
  z.$('cAutre').click(); await pause();
  z.w.document.querySelector('#cAss .chip[data-v="fr"]').click();
  await tz('YYYY020'); z.$('c50').checked = true; z.$('c50').dispatchEvent(new z.w.Event('change')); await pause();
  V('Réa B France à 50 % = 100,25 €', /niveau B → 100,25/.test(z.$('cLibelle').textContent), z.$('cLibelle').textContent);
  z.$('cAutre').click(); await pause();
  V('public = 1 000 + 198,00 + 100,25 = 1 298,25 €', /1\s298,25/.test(z.$('cPub').textContent), z.$('cPub').textContent);
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
  ng.$('rvn_CS').value = '10'; ng.$('rvn_CSfr').value = '10'; ng.$('rvn_APC').value = '12,50'; ng.$('rSave').click();   // (28/10) CS France réglée à part
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

  /* ── 10. MONTANT CORRIGÉ À LA MAIN (14/10/2026) ──────────────────────────
     Demande : les modificateurs changent parfois beaucoup le tarif. Le montant
     saisi est le montant FINAL du recueil Hôpital Manager : il remplace le calcul,
     sans ×1,06 ni ×1,98 par-dessus. Valeurs fictives. */
  console.log('\n[10] Montant corrigé à la main — à l\'ajout et dans la liste');
  const m = ouvrir(null, { ccam: true }); m.$('tC').click();
  regler(m, '2026-09-30', '1 000,00', '', VALS);
  m.$('cDt').value = '2026-10-03';
  const tape = async (code) => { m.$('cCode').value = code; m.$('cCode').dispatchEvent(new m.w.Event('input')); await pause(); };
  const montant = (v) => { m.$('cMt').value = v; m.$('cMt').dispatchEvent(new m.w.Event('input')); };
  const calcH = att(t('HHQE002'), 0, 1);
  V('sans code : pas de case montant', m.$('cMtB').hidden);
  await tape('HHQE002');
  V('code tapé : case « Montant compté » pré-remplie par le calcul', !m.$('cMtB').hidden && m.$('cMt').value === (calcH / 100).toFixed(2).replace('.', ','), m.$('cMt').value);
  V('…sans marque « Corrigé »', !m.$('cMt').classList.contains('mod') && !/Corrigé/.test(m.$('cMtEtat').textContent));
  montant('150,00');
  V('montant changé : « Corrigé » et rappel du calcul', m.$('cMt').classList.contains('mod') && /Corrigé/.test(m.$('cMtEtat').textContent) && m.$('cMtEtat').textContent.includes(fmt(calcH)), m.$('cMtEtat').textContent);
  m.$('cMtRz').click();
  V('« ↺ revenir au calcul » remet le calcul', m.$('cMt').value === (calcH / 100).toFixed(2).replace('.', ',') && !m.$('cMt').classList.contains('mod'));
  montant('150,00');
  m.$('c50').checked = true; m.$('c50').dispatchEvent(new m.w.Event('change')); await pause();
  V('changer le 50 % refait le calcul et efface la correction', m.$('cMt').value === (att(t('HHQE002'), 1, 1) / 100).toFixed(2).replace('.', ',') && !m.$('cMt').classList.contains('mod'), m.$('cMt').value);
  m.$('c50').checked = false; m.$('c50').dispatchEvent(new m.w.Event('change')); await pause();
  montant('abc');
  m.$('cAutre').click(); await pause();
  V('montant illisible : rien n\'est compté, message clair', m.$('cList').querySelectorAll('.acte').length === 0 && /Montant illisible/.test(m.$('cMsg').textContent), m.$('cMsg').textContent);
  montant('150,00');
  m.$('cAutre').click(); await pause();
  V('ajouté au montant CORRIGÉ : 150,00 € libéral, pas le calcul', /150,00/.test(m.$('cLib').textContent) && !m.$('cLib').textContent.includes(fmt(calcH)), m.$('cLib').textContent);
  V('…le message le dit, et la case se referme', /150,00 € \(corrigé\)/.test(m.$('cMsg').textContent) && m.$('cMtB').hidden, m.$('cMsg').textContent);
  const st = () => JSON.parse(m.w.localStorage.getItem('pense-bete-compteur-v1'));
  const aH = st().actes.find(x => x.code === 'HHQE002');
  V('enregistré : le calcul (v) ET le montant corrigé (vm) sont gardés tous les deux', aH.v === calcH && aH.vm === 15000, aH);
  V('dans la liste : montant en couleur « corrigé »', m.w.document.querySelector('#cList .cv.mod') && /150,00/.test(m.w.document.querySelector('#cList .cv.mod').textContent));
  await tape('HHQE002'); m.$('cAutre').click(); await pause();
  V('sans correction : pas de vm stocké', st().actes.filter(x => x.code === 'HHQE002' && x.vm == null).length === 1);
  V('libéral = 150,00 + calcul', m.$('cLib').textContent.includes(fmt(15000 + calcH)), m.$('cLib').textContent);

  // Liste : corriger un Colo (valeur des Réglages : 20,00)
  m.w.document.querySelector('#cGestes .geste[data-g="colo"]').click();
  const ligneColo = () => [...m.w.document.querySelectorAll('#cList .acte')].find(l => /Colo/.test(l.textContent) && !/gastro/.test(l.textContent));
  ligneColo().querySelector('.cv').click();
  V('toucher le montant ouvre la correction, pré-remplie (20,00) avec le calcul rappelé', m.$('cEv') && m.$('cEv').value === '20,00' && /Calcul : 20,00/.test(m.$('cEvMsg').textContent));
  m.$('cEv').value = 'zz'; ligneColo().querySelector('.cok').click();
  V('montant illisible dans la liste : refusé, rien ne change', /illisible/.test(m.$('cEvMsg').textContent) && st().actes.find(x => x.g === 'colo').vm == null);
  m.$('cEv').value = '25,50'; ligneColo().querySelector('.cok').click();
  V('Colo corrigé à 25,50 € : total libéral recalculé', m.$('cLib').textContent.includes(fmt(15000 + calcH + 2550)) && st().actes.find(x => x.g === 'colo').vm === 2550, m.$('cLib').textContent);
  V('…seulement CET acte : la valeur Colo des Réglages reste 20,00', m.$('rv_colo_mc').value === '20,00');
  ligneColo().querySelector('.cv').click();
  m.w.document.querySelector('#cList .crz').click();
  V('« ↺ revenir au calcul » dans la liste : 20,00 €, plus de correction', st().actes.find(x => x.g === 'colo').vm == null && m.$('cLib').textContent.includes(fmt(15000 + calcH + 2000)), m.$('cLib').textContent);
  ligneColo().querySelector('.cv').click();
  m.$('cEv').value = '20,00'; ligneColo().querySelector('.cok').click();
  V('corriger au montant du calcul = pas de correction stockée', st().actes.find(x => x.g === 'colo').vm == null);
  ligneColo().querySelector('.cv').click();
  m.$('cEv').value = '31,00'; m.$('cEv').dispatchEvent(new m.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  V('Entrée valide la correction', st().actes.find(x => x.g === 'colo').vm === 3100 && !m.$('cEv'));
  ligneColo().querySelector('.cv').click(); m.w.document.querySelector('#cList .cno').click();
  V('Annuler referme sans rien changer', !m.$('cEv') && st().actes.find(x => x.g === 'colo').vm === 3100);
  const pct = m.$('cPct').textContent, lib = m.$('cLib').textContent;
  // Réouverture : corrections retrouvées, aucun téléchargement
  const brut10 = m.w.localStorage.getItem('pense-bete-compteur-v1');
  const r10 = []; const d10 = new JSDOM(PAGE, { runScripts: 'dangerously', url: 'https://planningmedic.github.io/pense-bete/',
    beforeParse(w) { w.fetch = (u) => { r10.push(u); return Promise.reject(); }; w.Element.prototype.focus = function () {};
      w.localStorage.setItem('pense-bete-compteur-v1', brut10); } });
  d10.window.document.getElementById('tC').click();
  V('réouverture : montants corrigés retrouvés (même %, même libéral), sans téléchargement', r10.length === 0 && d10.window.document.getElementById('cPct').textContent === pct && d10.window.document.getElementById('cLib').textContent === lib, [pct, lib]);
  V('aucun montant ne part dans le réseau (seul le téléchargement de la liste)', m.reseau.length === 1 && !JSON.stringify(m.reseau).match(/150|25,50|31,00/), m.reseau);
  V('aucune erreur JavaScript', m.erreurs.length === 0, m.erreurs);

  /* ── 11. SAUVEGARDE / RESTAURATION (16/10/2026) ──────────────────────────
     Demande : ne pas perdre ses données, et pouvoir les sortir pour les comparer
     au relevé de l'hôpital. Un fichier JSON = patients + Compteur. Restaurer
     FUSIONNE : rien n'est effacé, aucun doublon. Valeurs fictives. */
  console.log('\n[11] Sauvegarde et restauration (fusion sans doublon)');
  const lire = (w, blob) => new Promise(r => { const fr = new w.FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsText(blob); });
  const A = ouvrir();
  A.secteur('Endos'); A.ajouter('2026-10-05', 'AB'); A.ajouter('2026-10-05', 'CD');
  A.$('tC').click(); regler(A, '2026-09-30', '1 000,00', '', VALS);
  geste(A, 'colo', 'lib', 'mc', '2026-10-05'); geste(A, 'gastro', 'pub', 'fr', '2026-10-06');
  const patA = A.liste(), cA = JSON.parse(A.w.localStorage.getItem('pense-bete-compteur-v1'));
  // iPhone : menu de partage
  let partage = null;
  A.w.navigator.canShare = o => !!(o && o.files && o.files.length);
  A.w.navigator.share = o => { partage = o; return Promise.resolve(); };
  A.$('svExp').click(); await pause();
  V('Sauvegarder ouvre le menu de partage avec UN fichier daté', partage && partage.files.length === 1 && partage.files[0].name === 'patients-lib-2026-09-30.json', partage && partage.files[0].name);
  const fichier = partage.files[0], txt = await lire(A.w, fichier);
  const o = JSON.parse(txt);
  V('le fichier contient les 2 patients, les 2 actes et les réglages', o.app === 'pense-bete-lib' && o.patients.length === 2 && o.compteur.actes.length === 2 && o.compteur.d0 === '2026-09-30' && o.compteur.v.colo_mc === 2000);
  V('message : « 2 patients et 2 actes »', /2 patients et 2 actes/.test(A.$('svMsg').textContent), A.$('svMsg').textContent);
  // Ailleurs (ordinateur) : téléchargement direct
  const B0 = ouvrir(null); let blob0 = null, nomDl = null;
  B0.w.URL.createObjectURL = b => { blob0 = b; return 'blob:x'; }; B0.w.URL.revokeObjectURL = () => {};
  B0.w.HTMLAnchorElement.prototype.click = function () { nomDl = this.download; };
  B0.$('svExp').click();
  V('sans menu de partage : téléchargement direct du même fichier', blob0 && nomDl === 'patients-lib-2026-09-30.json');
  // Téléphone perdu : nouvel appareil vide
  const restaurer = async (X, f) => { Object.defineProperty(X.$('svFic'), 'files', { value: [f], configurable: true }); X.$('svFic').dispatchEvent(new X.w.Event('change')); await pause(); };
  const B = ouvrir(null);
  await restaurer(B, new B.w.File([txt], 'patients-lib-2026-09-30.json', { type: 'application/json' }));
  V('restaurer : bilan affiché avant d\'écrire (2 patients, 2 actes, réglages)', !B.$('svBilan').hidden && /2 patients<\/b> et <b>2 actes/.test(B.$('svTxt').innerHTML) && /Réglages repris/.test(B.$('svTxt').textContent), B.$('svTxt').textContent);
  V('…rien n\'est écrit tant qu\'on n\'a pas touché « Ajouter »', B.liste().length === 0 && B.w.localStorage.getItem('pense-bete-compteur-v1') === null);
  B.$('svOui').click();
  const cB = JSON.parse(B.w.localStorage.getItem('pense-bete-compteur-v1'));
  V('après « Ajouter » : patients identiques à l\'appareil d\'origine', JSON.stringify(B.liste()) === JSON.stringify(patA), B.liste());
  V('…Compteur identique (actes et réglages)', JSON.stringify(cB) === JSON.stringify(cA));
  B.$('tC').click(); A.$('tC').click();
  V('…même part libérale et même libéral affichés', B.$('cPct').textContent === A.$('cPct').textContent && B.$('cLib').textContent === A.$('cLib').textContent, [B.$('cPct').textContent, A.$('cPct').textContent]);
  // Restaurer deux fois : aucun doublon
  await restaurer(B, new B.w.File([txt], 'x.json'));
  V('2e restauration : 0 à ajouter, 4 déjà présents', /0 patient<\/b> et <b>0 acte/.test(B.$('svTxt').innerHTML) && /4 éléments déjà présents/.test(B.$('svTxt').textContent), B.$('svTxt').textContent);
  B.$('svOui').click();
  V('…aucun doublon créé', B.liste().length === 2 && JSON.parse(B.w.localStorage.getItem('pense-bete-compteur-v1')).actes.length === 2);
  // Fusion : un patient saisi sur l'appareil est gardé
  const F = ouvrir(null); F.secteur('Ortho'); F.ajouter('2026-10-07', 'EF');
  await restaurer(F, new F.w.File([txt], 'x.json')); F.$('svOui').click();
  V('fusion : le patient déjà saisi est gardé, 3 patients en tout', F.liste().length === 3 && F.liste().some(p => p.i === 'EF'));
  // Annuler
  const G = ouvrir(null);
  await restaurer(G, new G.w.File([txt], 'x.json')); G.$('svNon').click();
  V('« Annuler » : rien n\'est ajouté', G.liste().length === 0 && G.$('svBilan').hidden && /Rien/.test(G.$('svMsg').textContent));
  // Mauvais fichiers
  await restaurer(G, new G.w.File(['{pas du json'], 'x.json'));
  V('fichier illisible : message, rien de changé', /pas une sauvegarde lisible/.test(G.$('svMsg').textContent) && G.$('svBilan').hidden && G.liste().length === 0);
  await restaurer(G, new G.w.File([JSON.stringify({ patients: [], compteur: {} })], 'x.json'));
  V('JSON d\'une autre appli : refusé', /pas une sauvegarde de « Mes patients lib »/.test(G.$('svMsg').textContent) && G.liste().length === 0);
  // Relevé plus récent sur l'appareil : un acte déjà inclus n'est pas recompté
  const H = ouvrir(null); H.$('tC').click(); regler(H, '2026-10-05', '1 000,00', '', VALS);
  await restaurer(H, new H.w.File([txt], 'x.json'));
  V('relevé de l\'appareil plus récent (05/10) : l\'acte du 05/10 n\'est pas recompté, ses réglages restent', /1 acte<\/b>/.test(H.$('svTxt').innerHTML) && /1 acte antérieur au relevé/.test(H.$('svTxt').textContent) && !/Réglages repris/.test(H.$('svTxt').textContent), H.$('svTxt').textContent);
  H.$('svOui').click();
  const cH = JSON.parse(H.w.localStorage.getItem('pense-bete-compteur-v1'));
  V('…seul l\'acte du 06/10 est ajouté, relevé du 05/10 gardé', cH.actes.length === 1 && cH.actes[0].d === '2026-10-06' && cH.d0 === '2026-10-05');
  V('sauvegarde et restauration : aucun appel réseau', [A, B0, B, F, G, H].every(x => x.reseau.length === 0));
  V('sauvegarde et restauration : aucune erreur JavaScript', [A, B0, B, F, G, H].every(x => x.erreurs.length === 0), [A, B0, B, F, G, H].map(x => x.erreurs));

  /* ── 12. LISTE REGROUPÉE PAR JOUR (19/10/2026) ───────────────────────────
     Demande : 17 lignes identiques le même jour, c'est illisible. Par jour, un
     groupe par acte identique (même montant) avec − / +, détail dépliable pour
     corriger un acte. Un montant corrigé sort de son groupe. Valeurs fictives. */
  console.log('\n[12] Liste regroupée par jour — compteurs − / + et détail dépliable');
  const R = ouvrir(); R.$('tC').click(); regler(R, '2026-09-30', '1 000,00', '', VALS);
  geste(R, 'colo', 'lib', 'mc', '2026-10-03'); geste(R, 'colo', 'lib', 'mc', '2026-10-03'); geste(R, 'colo', 'lib', 'mc', '2026-10-03');
  geste(R, 'combo', 'pub', 'fr', '2026-10-03'); geste(R, 'colo', 'lib', 'mc', '2026-10-02');
  const Rd = R.w.document, grps = () => [...Rd.querySelectorAll('#cList .grp')], jrs = () => [...Rd.querySelectorAll('#cList .jr')];
  const grpDe = re => grps().find(g => re.test(g.querySelector('.gn').textContent));
  const stR = () => JSON.parse(R.w.localStorage.getItem('pense-bete-compteur-v1'));
  V('2 jours, 03/10 en haut : « 4 actes · 75,00 € » (3 × 20,00 + 15,00)', jrs().length === 2 && /03\/10/.test(jrs()[0].textContent) && /4 actes · 75,00/.test(jrs()[0].textContent), jrs().map(j => j.textContent));
  V('3 groupes : les 3 Colo du 03/10 en une ligne « 3 », séparés du 02/10', grps().length === 3 && grpDe(/^Colo · MC/).querySelector('.gq').textContent === '3', grps().map(g => g.textContent));
  V('le titre compte toujours chaque acte (5)', /Actes comptés \(5\)/.test(R.$('cListT').textContent));
  V('replié : les 5 actes restent dans la page mais cachés', Rd.querySelectorAll('#cList .acte').length === 5 && Rd.querySelectorAll('#cList .acte:not([hidden])').length === 0);
  grpDe(/^Colo · MC/).querySelector('.gp').click();
  V('« + » : 4 Colo le 03/10, libéral 100,00 € (5 Colo × 20,00 sur les deux jours)', grpDe(/^Colo · MC/).querySelector('.gq').textContent === '4' && /^100,00/.test(R.$('cLib').textContent) && stR().actes.filter(x => x.d === '2026-10-03' && x.g === 'colo').length === 4, R.$('cLib').textContent);
  V('…copie au même jour, nouvel identifiant', new Set(stR().actes.map(x => x.id)).size === 6 && /\+1 Colo libéral Monaco le 03\/10\/2026/.test(R.$('cMsg').textContent), R.$('cMsg').textContent);
  grpDe(/^Colo · MC/).querySelector('.gm').click();
  V('« − » : 3 Colo, barre Annuler', grpDe(/^Colo · MC/).querySelector('.gq').textContent === '3' && R.$('undo').style.display === 'flex' && /Colo retiré/.test(R.$('undoTxt').textContent));
  R.$('undoBtn').click();
  V('Annuler le remet (4)', grpDe(/^Colo · MC/).querySelector('.gq').textContent === '4');
  R.$('cList').querySelector('.grp .gm').click(); R.$('undoBtn').click();
  const combo = () => grpDe(/Colo \+ gastro/);
  combo().querySelector('.gm').click();
  V('« − » sur un groupe de 1 : le groupe disparaît', !combo() && grps().length === 2);
  R.$('undoBtn').click();
  const colo = () => grpDe(/^Colo · MC/);
  colo().querySelector('.gch').click();
  V('chevron : les 4 Colo apparaissent, chacun avec crayon et ×', colo().querySelectorAll('.acte:not([hidden])').length === 4 && colo().querySelectorAll('.cv').length === 4 && colo().querySelectorAll('.cx').length === 4 && colo().querySelector('.gch').getAttribute('aria-expanded') === 'true');
  V('…les autres groupes restent repliés', combo().querySelectorAll('.acte:not([hidden])').length === 0);
  colo().querySelector('.acte .cv').click();
  R.$('cEv').value = '10,00'; Rd.querySelector('#cList .cok').click();
  const corr = () => grps().find(g => g.querySelector('small.mod'));
  V('montant corrigé : l\'acte sort du groupe (3 Colo à 20,00 + 1 à 10,00 marqué corrigé)', corr() && corr().querySelector('.gq').textContent === '1' && /10,00/.test(corr().querySelector('small').textContent)
    && grps().filter(g => /^Colo · MC/.test(g.querySelector('.gn').textContent)).map(g => g.querySelector('.gq').textContent).sort().join() === '1,1,3', grps().map(g => g.textContent));
  V('…son groupe reste déplié pour voir le résultat', corr().querySelectorAll('.acte:not([hidden])').length === 1);
  V('…jour 03/10 : 5 actes · 85,00 € (3 × 20 + 10 + 15)', /5 actes · 85,00/.test(jrs()[0].textContent), jrs()[0].textContent);
  corr().querySelector('.gp').click();
  V('« + » sur le groupe corrigé : copie au montant corrigé', corr().querySelector('.gq').textContent === '2' && stR().actes.filter(x => x.vm === 1000).length === 2);
  colo().querySelector('.gch').click();
  V('chevron à nouveau : groupe replié', colo().querySelectorAll('.acte:not([hidden])').length === 0);
  R.$('cList').querySelector('.grp .gch').click(); R.$('cList').querySelector('.grp .acte .cv').click();
  R.$('cList').querySelector('.grp .gch').click();
  V('replier pendant une correction : la correction se ferme', !R.$('cEv'));
  // NGAP : même présentation, mot « consultation »
  R.w.document.querySelector('#cAxe .chip[data-v="ngap"]').click();
  V('NGAP sans consultation : message vide habituel', /Aucune consultation/.test(R.$('cList').textContent));
  V('regroupement : aucun appel réseau, aucune erreur JavaScript', R.reseau.length === 0 && R.erreurs.length === 0, R.erreurs);

  /* ── 13. JOURS REPLIÉS (25/10/2026) ──────────────────────────────────────
     Demande : la liste fait trop d'écran à faire défiler. Chaque jour est
     replié sous sa date ; toucher la date déplie les actes de ce jour. Le
     jour où l'on vient d'ajouter un acte s'ouvre pour voir le résultat. */
  console.log('\n[13] Jours repliés — toucher la date déplie les actes du jour');
  const J = ouvrir(null, { compteur: R.w.localStorage.getItem('pense-bete-compteur-v1') }); J.$('tC').click();
  const Jd = J.w.document, jj = () => [...Jd.querySelectorAll('#cList .jr')], corps = () => [...Jd.querySelectorAll('#cList .jc')];
  const jour = re => jj().findIndex(x => re.test(x.textContent));
  V('à l\'ouverture : 2 dates, tous les jours repliés', jj().length === 2 && corps().length === 2 && corps().every(x => x.hidden) && jj().every(x => x.getAttribute('aria-expanded') === 'false'),
    jj().map(x => x.getAttribute('aria-expanded')));
  V('…la date reste lisible : jour, nombre d\'actes et total', /03\/10/.test(jj()[0].textContent) && /actes · /.test(jj()[0].textContent), jj()[0].textContent);
  V('…la date est un bouton (atteignable au clavier)', jj().every(x => x.tagName === 'BUTTON' && x.type === 'button'));
  V('…les groupes restent dans la page (totaux inchangés)', Jd.querySelectorAll('#cList .grp').length === 4, Jd.querySelectorAll('#cList .grp').length);
  jj()[jour(/03\/10/)].click();
  V('toucher le 03/10 : ses groupes apparaissent, le 02/10 reste replié', !corps()[jour(/03\/10/)].hidden && corps()[jour(/02\/10/)].hidden
    && jj()[jour(/03\/10/)].getAttribute('aria-expanded') === 'true');
  V('…les − / + du jour sont utilisables', corps()[jour(/03\/10/)].querySelectorAll('.gp').length > 0);
  jj()[jour(/03\/10/)].click();
  V('toucher à nouveau : le 03/10 se replie', corps().every(x => x.hidden));
  geste(J, 'gastro', 'lib', 'mc', '2026-10-02');
  V('ajouter un acte le 02/10 : ce jour s\'ouvre, le 03/10 reste replié', !corps()[jour(/02\/10/)].hidden && corps()[jour(/03\/10/)].hidden,
    jj().map(x => x.textContent + ':' + x.getAttribute('aria-expanded')));
  jj()[jour(/02\/10/)].click(); jj()[jour(/02\/10/)].click();
  Jd.querySelector('#cList .jc:not([hidden]) .gch').click(); Jd.querySelector('#cList .jc:not([hidden]) .acte .cv').click();
  V('correction ouverte dans un jour déplié', !!J.$('cEv'));
  jj()[jour(/02\/10/)].click();
  V('replier le jour pendant une correction : la correction se ferme', !J.$('cEv') && corps()[jour(/02\/10/)].hidden);
  V('jours repliés : aucun appel réseau, aucune erreur JavaScript', J.reseau.length === 0 && J.erreurs.length === 0, J.erreurs);

  /* ── 14. ASSURÉ MONACO / FRANCE (26/10/2026) ─────────────────────────── */
  {
  console.log('\n[14] Assuré Monaco / France — code couleur');
  const PA = ouvrir(), PAd = PA.w.document;
  V('deux boutons Monaco / France, aucun choisi à l\'ouverture',
    [...PAd.querySelectorAll('#pAss .chip')].map(b => b.dataset.a).join('|') === 'mc|fr' && !PAd.querySelector('#pAss .chip[aria-checked="true"]'));
  PA.secteur('Endos'); PA.ajouter('2026-10-05', 'GH', null);
  V('sans assurance : refusé, message clair', PA.liste().length === 0 && /Monaco ou France/.test(PA.$('msg').textContent), PA.$('msg').textContent);
  PA.ajouter('2026-10-05', 'GH', 'fr');
  V('ajout : l\'assurance est enregistrée', PA.liste().length === 1 && PA.liste()[0].a === 'fr', PA.liste());
  V('après ajout : assurance remise à zéro (date et secteur gardés)', !PAd.querySelector('#pAss .chip[aria-checked="true"]')
    && PA.$('dt').value === '2026-10-05' && PAd.querySelector('#chips .chip[aria-checked="true"]').dataset.s === 'Endos');
  PA.ajouter(null, 'GH', null);
  V('patient suivant sans retoucher l\'assurance : refusé', PA.liste().length === 1);
  PA.ajouter(null, 'JK', 'mc');
  const lignes = () => [...PA.$('next').querySelectorAll('.pt')];
  const ligne = ini => lignes().find(x => x.querySelector('.i').textContent === ini);
  V('Monaco : ligne marquée mc, pastille « MC »', ligne('JK').classList.contains('mc') && ligne('JK').querySelector('.as').textContent === 'MC');
  V('France : ligne marquée fr, pastille « FR »', ligne('GH').classList.contains('fr') && ligne('GH').querySelector('.as').textContent === 'FR');
  V('couleurs distinctes en clair et en sombre', /--mc:#C8102E; --fr:#1F4FA3; --as-ink:#FFFFFF;/.test(PAGE) && (PAGE.match(/--mc:#FF6B7A; --fr:#7EA8FF; --as-ink:#10171D;/g) || []).length === 2);
  // Patient saisi avant ce jour (sans champ a) : pastille « ? », un toucher la renseigne
  const ancien = JSON.stringify([{ id: 'old1', d: '2026-10-06', s: 'Endos', i: 'LM', t: 1 }]);
  const PB = ouvrir(ancien), lb = () => PB.$('next').querySelector('.pt');
  V('ancien patient sans assurance : pastille « ? », pas de couleur', lb().querySelector('.as').textContent === '?' && !lb().classList.contains('mc') && !lb().classList.contains('fr'));
  lb().querySelector('.as').click();
  V('toucher la pastille : Monaco, enregistré', lb().classList.contains('mc') && PB.liste()[0].a === 'mc');
  lb().querySelector('.as').click();
  V('toucher encore : France', lb().classList.contains('fr') && PB.liste()[0].a === 'fr');
  lb().querySelector('.as').click();
  V('…puis de nouveau Monaco (pas de retour au « ? »)', PB.liste()[0].a === 'mc');
  V('toucher la pastille n\'efface pas le patient', PB.liste().length === 1 && PB.$('undo').style.display !== 'flex');
  // Sauvegarde / restauration : l'assurance suit ; une valeur inconnue est ignorée
  const sauv = JSON.stringify({ app: 'pense-bete-lib', format: 1, patients: [
    { id: 'r1', d: '2026-10-07', s: 'ORL', i: 'NP', a: 'fr', t: 2 },
    { id: 'r2', d: '2026-10-07', s: 'ORL', i: 'QR', a: 'xx', t: 3 }], compteur: { actes: [] } });
  const PCr = ouvrir(), prep = PCr.w.svPreparer ? PCr.w.svPreparer(sauv) : null;
  const restaure = prep && prep.np ? prep.np : (prep && prep.patients) || null;
  V('restauration : assurance gardée, valeur inconnue écartée', !!restaure && restaure.find(x => x.id === 'r1').a === 'fr' && !('a' in restaure.find(x => x.id === 'r2')), prep);
  V('assurance : aucun appel réseau, aucune erreur JavaScript', PA.reseau.length + PB.reseau.length === 0 && PA.erreurs.length + PB.erreurs.length + PCr.erreurs.length === 0, [PA.erreurs, PB.erreurs, PCr.erreurs]);
  }

  /* ── 15. COMPTEUR : MÊME CODE COULEUR (26/10/2026) ──────────────────── */
  {
  console.log('\n[15] Compteur — fond pastel rouge (Monaco) / bleu (France)');
  const V0 = { colo_mc: 1000, colo_fr: 500, gastro_mc: 1000, gastro_fr: 500, combo_mc: 1500, combo_fr: 800 };
  const cpt = JSON.stringify({ d0: '2026-09-30', p0: 100000, l0: 0, v: V0, rea: {}, vn: {}, actes: [
    { id: 'k1', d: '2026-10-05', g: 'colo', m: 'lib', a: 'mc', t: 1 },
    { id: 'k2', d: '2026-10-05', g: 'colo', m: 'pub', a: 'fr', t: 2 },
    { id: 'k3', d: '2026-10-05', g: 'gastro', m: 'lib', a: 'zz', t: 3 }] });
  const K = ouvrir(null, { compteur: cpt }), Kd = K.w.document;
  K.$('tC').click();
  const grps = [...Kd.querySelectorAll('#cList .grp')];
  const g = re => grps.find(x => re.test(x.querySelector('.gn').textContent));
  V('acte assuré Monaco : groupe marqué mc', !!g(/Colo.*MC/) && g(/Colo.*MC/).classList.contains('mc') && !g(/Colo.*MC/).classList.contains('fr'), grps.map(x => x.className));
  V('acte assuré France : groupe marqué fr', !!g(/Colo.*FR/) && g(/Colo.*FR/).classList.contains('fr'));
  V('assurance inconnue : aucune couleur', !!g(/Gastro/) && g(/Gastro/).className === 'grp', grps.map(x => x.className));
  V('fonds pastel définis en clair et en sombre', /--mc-bg:#FBE9EC; --fr-bg:#E8EEFA;/.test(PAGE) && (PAGE.match(/--mc-bg:#3A2228; --fr-bg:#1E2B44;/g) || []).length === 2
    && /\.grp\.mc\{background:var\(--mc-bg\)\}/.test(PAGE) && /\.grp\.fr\{background:var\(--fr-bg\)\}/.test(PAGE));
  V('boutons Monaco / France de saisie aux mêmes couleurs que l\'onglet Patients',
    /#cAss \.chip\[data-v="mc"\]\[aria-checked="true"\]\{background:var\(--mc\)/.test(PAGE) && /#cAss \.chip\[data-v="fr"\]\[aria-checked="true"\]\{background:var\(--fr\)/.test(PAGE));
  Kd.querySelector('#cAss .chip[data-v="fr"]').click();
  V('choisir France dans le Compteur : bouton France coché seul', Kd.querySelector('#cAss .chip[aria-checked="true"]').dataset.v === 'fr');
  V('couleurs du Compteur : aucun appel réseau, aucune erreur JavaScript', K.reseau.length === 0 && K.erreurs.length === 0, K.erreurs);
  }
  /* ── 16. PATIENT À DEUX ACTES (27/10/2026) ──────────────────────────────
     Demande : HHFE004 puis HJQJ002 coché « 2e acte (50 %) » = le même patient ;
     une seule ligne dépliable. Le 2e acte se rattache à l'acte à 100 % saisi juste
     avant (même jour, secteur, pays). « Détacher » défait le lien. Valeurs fictives. */
  {
  console.log('\n[16] Patient à deux actes — une ligne, dépliable, détachable');
  const pause = () => new Promise(r => setTimeout(r, 20));
  const V0 = { colo_mc: 1000, colo_fr: 500, gastro_mc: 1000, gastro_fr: 500, combo_mc: 1500, combo_fr: 800 };
  const base = { d0: '2026-09-30', p0: 100000, l0: 0, v: V0, rea: {}, vn: {} };
  const cpt = JSON.stringify(Object.assign({}, base, { actes: [
    { id: 'a1', d: '2026-10-27', g: 'autre', code: 'HHFE004', v: 6248, m: 'pub', a: 'fr', t: 1 },
    { id: 'a2', d: '2026-10-27', g: 'autre', code: 'HJQJ002', r50: true, v: 2717, m: 'pub', a: 'fr', t: 2 },
    { id: 'a3', d: '2026-10-27', g: 'colo', m: 'pub', a: 'fr', t: 3 } ] }));
  const P = ouvrir(null, { compteur: cpt }); P.$('tC').click();
  const Pd = P.w.document, gr = () => [...Pd.querySelectorAll('#cList .grp')];
  const ligne = re => gr().find(g => re.test(g.querySelector('.gn').textContent));
  const st = () => JSON.parse(P.w.localStorage.getItem('pense-bete-compteur-v1'));
  V('actes déjà saisis : HHFE004 puis HJQJ002 (50 %) réunis sur une ligne « HHFE004 + HJQJ002 · FR »',
    !!ligne(/^HHFE004 \+ HJQJ002 · FR/) && ligne(/^HHFE004 \+ HJQJ002/).querySelector('.gq').textContent === '1', gr().map(g => g.querySelector('.gn').textContent));
  V('…montant de la ligne = somme des deux (62,48 + 27,17 = 89,65 €)', /89,65/.test(ligne(/^HHFE004 \+/).querySelector('small').textContent), ligne(/^HHFE004 \+/).querySelector('small').textContent);
  V('…le lien est enregistré (même p), la colo d\'après reste seule', st().actes.find(x => x.id === 'a1').p && st().actes.find(x => x.id === 'a1').p === st().actes.find(x => x.id === 'a2').p && !st().actes.find(x => x.id === 'a3').p);
  V('…le jour compte toujours chaque acte (3 actes) et le même total', Pd.querySelector('#cList .jr').textContent.includes('3 actes') && Pd.querySelector('#cList .jr').textContent.includes('94,65'), Pd.querySelector('#cList .jr').textContent);
  ligne(/^HHFE004 \+/).querySelector('.gch').click();
  V('chevron : les deux actes apparaissent, « détacher » sur le 2e seulement',
    ligne(/^HHFE004 \+/).querySelectorAll('.acte:not([hidden])').length === 2 && ligne(/^HHFE004 \+/).querySelectorAll('.cdet').length === 1
    && ligne(/^HHFE004 \+/).querySelector('.cdet').dataset.id === 'a2');
  ligne(/^HHFE004 \+/).querySelector('.gp').click();
  const ids = st().actes.filter(x => x.code === 'HHFE004' || x.code === 'HJQJ002');
  V('« + » : un 2e patient identique (2 actes de plus, reliés entre eux, compteur 2)',
    ligne(/^HHFE004 \+/).querySelector('.gq').textContent === '2' && ids.length === 4 && new Set(ids.map(x => x.p)).size === 2, ids.map(x => x.p));
  ligne(/^HHFE004 \+/).querySelector('.gm').click();
  V('« − » : retire un patient entier (2 actes), barre Annuler', ligne(/^HHFE004 \+/).querySelector('.gq').textContent === '1' && st().actes.length === 3 && /HHFE004 \+ HJQJ002 retiré/.test(P.$('undoTxt').textContent));
  P.$('undoBtn').click();
  V('Annuler : les 2 actes reviennent, toujours reliés', ligne(/^HHFE004 \+/).querySelector('.gq').textContent === '2' && st().actes.length === 5
    && new Set(st().actes.filter(x => x.code === 'HJQJ002').map(x => x.p)).size === 2);
  Pd.querySelector('#cList .cdet[data-id="a2"]').click();
  V('« détacher » : HJQJ002 (50 %) redevient une ligne seule, HHFE004 aussi pour ce patient',
    !!ligne(/^HJQJ002 \(50 %\) · FR/) && !!ligne(/^HHFE004 · FR/) && ligne(/^HHFE004 \+/).querySelector('.gq').textContent === '1', gr().map(g => g.querySelector('.gn').textContent));
  const R2 = ouvrir(null, { compteur: P.w.localStorage.getItem('pense-bete-compteur-v1') }); R2.$('tC').click();
  V('…et le reste au rechargement (pas de rattachement d\'office)', [...R2.w.document.querySelectorAll('#cList .gn')].some(g => /^HJQJ002 \(50 %\) · FR/.test(g.textContent)));
  V('le lien voyage avec la sauvegarde (champs p et sl importés)', /const CHAMPS_ACTE=\[[^\]]*'p','sl'[,\]]/.test(PAGE));

  // Saisie en direct : le 2e acte coché 50 % rejoint l'acte saisi juste avant
  const a = ouvrir(null, { ccam: true }); a.$('tC').click();
  regler(a, '2026-09-30', '1 000,00', '', VALS);
  a.$('cDt').value = '2026-10-03';
  a.w.document.querySelector('#cMode .chip[data-v="pub"]').click(); a.w.document.querySelector('#cAss .chip[data-v="fr"]').click();
  const taper = async (code) => { a.$('cCode').value = code; a.$('cCode').dispatchEvent(new a.w.Event('input')); await pause(); };
  await taper('HHFE002'); a.$('cAutre').click(); await pause();
  await taper('HJQJ002'); a.$('c50').checked = true; a.$('c50').dispatchEvent(new a.w.Event('change')); await pause();
  a.$('cAutre').click(); await pause();
  V('saisie : « 2e acte (50 %) » rattaché à l\'acte d\'avant, message explicite', /même patient que HHFE002/.test(a.$('cMsg').textContent), a.$('cMsg').textContent);
  V('…une seule ligne « HHFE002 + HJQJ002 · FR »', [...a.w.document.querySelectorAll('#cList .gn')].some(g => /^HHFE002 \+ HJQJ002 · FR/.test(g.textContent)),
    [...a.w.document.querySelectorAll('#cList .gn')].map(g => g.textContent));
  await taper('HJQJ002'); a.$('c50').checked = true; a.$('c50').dispatchEvent(new a.w.Event('change')); await pause();
  a.$('cAutre').click(); await pause();
  V('un 2e « 50 % » sans nouvel acte à 100 % : il reste seul (l\'acte d\'avant est déjà pris)', !/même patient/.test(a.$('cMsg').textContent)
    && [...a.w.document.querySelectorAll('#cList .gn')].some(g => /^HJQJ002 \(50 %\) · FR/.test(g.textContent)), a.$('cMsg').textContent);
  V('patient à deux actes : aucune erreur JavaScript', P.erreurs.length === 0 && R2.erreurs.length === 0 && a.erreurs.length === 0, [P.erreurs, R2.erreurs, a.erreurs]);
  }
  /* ── 17. NGAP PAR PAYS (28/10/2026) ─────────────────────────────────────
     Constat : une CS publique d'assuré France ne vaut pas la CS Monaco ; l'APC
     n'existe qu'en libéral France. Même jour : bouton « CS + MCS » retiré, la
     majoration MCS est comprise dans la valeur CS France. Valeurs FICTIVES. */
  {
  console.log('\n[17] NGAP par pays — CS Monaco, CS France public (MCS comprise), APC libéral France');
  const N = ouvrir(); N.$('tC').click();
  regler(N, '2026-09-30', '1 000,00', '', VALS);
  N.w.document.querySelector('#cAxe .chip[data-v="ngap"]').click();
  N.$('rPn0').value = '400'; N.$('rLn0').value = '0';
  N.$('rvn_CS').value = '40'; N.$('rvn_APC').value = '60'; N.$('rSave').click();
  const btn = sel => N.w.document.querySelector('#cNgap ' + sel);
  const mode = (m, a) => { N.w.document.querySelector('#cMode .chip[data-v="' + m + '"]').click(); N.w.document.querySelector('#cAss .chip[data-v="' + a + '"]').click(); };
  V('Réglages : 3 valeurs NGAP (CS Monaco, CS France public MCS comprise, APC France libéral), plus de MCS à part',
    ['CS', 'CSfr', 'APC'].every(g => !!N.$('rvn_' + g)) && !N.$('rvn_MCS') && /CS · France \(public, MCS comprise\)/.test(N.$('rValsN').textContent), N.$('rValsN').textContent);
  V('plus de bouton « CS + MCS » : CS et APC seulement', N.w.document.querySelectorAll('#cNgap .geste').length === 2 && !/MCS/.test(N.$('cNgap').textContent));
  V('CS France facultative : enregistré sans elle', /Enregistré/.test(N.$('rMsg').textContent), N.$('rMsg').textContent);
  mode('pub', 'fr');
  V('public France sans CS France réglée : CS grisée, avec le pourquoi', btn('[data-n="CS"]').disabled
    && /Renseignez CS France/.test(N.$('cApcNote').textContent), N.$('cApcNote').textContent);
  N.$('rvn_CSfr').value = '31,50'; N.$('rSave').click();
  mode('pub', 'fr');
  V('public France réglé : CS active, APC grisée', !btn('[data-n="CS"]').disabled && btn('[data-n="APC"]').disabled);
  N.$('cDt').value = '2026-10-05';
  btn('[data-n="CS"]').click(); btn('[data-n="CS"]').click();
  V('CS France publique comptée 31,50 € (public 400 + 2 × 31,50 = 463,00 €)', /^463,00/.test(N.$('cPub').textContent), N.$('cPub').textContent);
  mode('lib', 'fr');
  V('libéral France : APC seule active (CS grisée)', !btn('[data-n="APC"]').disabled && btn('[data-n="CS"]').disabled
    && /Libéral France : APC/.test(N.$('cApcNote').textContent));
  btn('[data-n="APC"]').click();
  V('APC libérale France comptée 60,00 €', /60,00/.test(N.$('cLib').textContent), N.$('cLib').textContent);
  mode('lib', 'mc');
  V('Monaco (libéral) : CS active à la valeur Monaco, APC grisée', !btn('[data-n="CS"]').disabled && btn('[data-n="APC"]').disabled);
  mode('pub', 'mc');
  btn('[data-n="CS"]').click();
  V('CS Monaco publique comptée à 40,00 € (public 463 + 40 = 503,00 €)', /^503,00/.test(N.$('cPub').textContent), N.$('cPub').textContent);
  N.$('rvn_CSfr').value = '30'; N.$('rSave').click();
  V('CS France passée à 30 € : les CS France déjà comptées suivent (400 + 2 × 30 + 40 = 500,00 €)', /^500,00/.test(N.$('cPub').textContent), N.$('cPub').textContent);
  // Données d'avant : une CS France sans réglage CS France n'est pas valorisée à la CS Monaco ;
  // une CS saisie avec l'ancien bouton « CS + MCS » vaut la CS France, sans majoration ajoutée
  const vieux = JSON.stringify({ d0: '2026-09-30', p0: 100000, l0: 0, v: {}, rea: {}, pn0: 40000, ln0: 0, vn: { CS: 4000, APC: 6000, MCS: 500 },
    actes: [{ id: 'n1', d: '2026-10-02', ax: 'ngap', g: 'CS', m: 'pub', a: 'fr', t: 1 }, { id: 'n2', d: '2026-10-02', ax: 'ngap', g: 'CS', m: 'pub', a: 'fr', mcs: true, t: 2 }] });
  const O = ouvrir(null, { compteur: vieux }); O.$('tC').click(); O.w.document.querySelector('#cAxe .chip[data-v="ngap"]').click();
  V('données d\'avant : une CS France n\'est plus comptée au prix de la CS Monaco (« — » tant que CS France n\'est pas réglée)',
    !/40,00/.test(O.$('cList').textContent) && /—/.test(O.$('cList').textContent), O.$('cList').textContent);
  O.$('rvn_CSfr').value = '31,50'; regler(O, '2026-09-30', '1 000,00', '', VALS);
  V('…CS France réglée : les deux comptent 31,50 €, l\'ancienne « CS + MCS » sans majoration en double (400 + 63 = 463,00 €)', /^463,00/.test(O.$('cPub').textContent), O.$('cPub').textContent);
  V('NGAP par pays : aucune erreur JavaScript, aucun appel réseau', N.erreurs.length === 0 && O.erreurs.length === 0 && N.reseau.length === 0, [N.erreurs, O.erreurs]);
  }
  console.log(`\n${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();
