/*!
 * sw.js — Service worker (candidat conservateur).
 * Met en cache les assets figés (js/css/images/polices), cache d'abord.
 * API Google Apps Script et .json : réseau direct, JAMAIS interceptés.
 * (29/10/2026) Pages (navigations) : RÉSEAU D'ABORD, copie de la dernière
 * ouverture réussie si pas de réseau — voir pageReseauDabord().
 * (27/11/2026) Scripts et feuilles de style : chaque copie porte le numéro de
 * version du site ; après une publication ils sont redemandés au réseau, la
 * copie ne servant plus que de secours — voir codeAJour(). RIEN n'est jamais
 * jeté : sans réseau, la page garde les scripts qu'elle avait.
 */
var VERSION = 'pm-sw-v2';
var ASSET_CACHE = VERSION + '-assets';
var FONT_CACHE  = VERSION + '-fonts';
var PAGE_CACHE  = VERSION + '-pages';   // (29/10/2026) dernière version vue de chaque page
var PAGE_DELAI  = 6000;                 // au-delà, sans réponse du réseau : la copie
var META_CACHE  = VERSION + '-meta';    // (27/11/2026) le dernier numéro de version du site vu par cet appareil
var MAJ_DELAI   = 1500;                 // attente maximale du numéro de version, une fois la page reçue
var CODE_DELAI  = 4000;                 // script d'une version précédente : au-delà, sans réponse du réseau, la copie
var ETIQUETTE   = 'x-pm-version';       // en-tête posé sur chaque copie de script : le numéro du site au moment où elle a été prise
var versionSite = null;                 // numéro en ligne, lu à chaque ouverture de page (null = pas encore connu)

self.addEventListener('install', function (e) { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    /* (27/09/2026) Ne supprime que SES anciens caches (« pm-sw-… ») : l'outil ACR
       (acr/sw.js) a le sien sur la même origine, qu'il faut laisser intact. */
    await Promise.all(keys.map(function (k) { return (k.indexOf('pm-sw-') === 0 && k.indexOf(VERSION) !== 0) ? caches.delete(k) : null; }));
    await self.clients.claim();
  })());
});

function isFont(h) { return h.indexOf('fonts.googleapis.com') > -1 || h.indexOf('fonts.gstatic.com') > -1; }
function isCode(chemin) { return /\.(js|css)(\?|$)/i.test(chemin); }
function isStaticAsset(url) { return /\.(js|css|png|svg|webp|ico|woff2?|ttf|otf)(\?|$)/i.test(url.pathname); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                        // POST (API) → passthrough total
  var url; try { url = new URL(req.url); } catch (_) { return; }
  if (url.hostname.indexOf('script.google') > -1) return;  // API GAS → jamais touchée
  /* (14/10/2026, v1.23.1) Le numéro de version doit toujours être le vrai : jamais en copie.
     Avant : servi depuis la copie, il affichait l'ancien numéro pendant une ouverture. */
  if (url.origin === self.location.origin && /\/version\.js$/.test(url.pathname)) return;
  /* (29/10/2026) DÉFAUT TROUVÉ EN PRODUCTION : au retour sur l'appli restée ouverte,
     l'iPhone réaffichait parfois une copie de l'accueil vieille de deux semaines
     (« Choisissez une rubrique du service. », ancien habillage) — sa propre copie,
     puisque ce service worker ne touchait pas aux pages. Désormais chaque page est
     demandée au réseau, sans copie intermédiaire ; la dernière version reçue est
     gardée et ne sert QUE sans réseau. Le stockage local (pense-bête, réglages) est
     un autre tiroir : un service worker n'y a pas accès. */
  if (req.mode === 'navigate' && url.origin === self.location.origin) { e.respondWith(pageReseauDabord(req, url)); return; }
  if (isFont(url.hostname)) { e.respondWith(cacheFirst(req, FONT_CACHE)); return; }
  if (url.origin === self.location.origin && isCode(url.pathname)) { e.respondWith(codeAJour(req)); return; }   // (27/11/2026)
  if (url.origin === self.location.origin && isStaticAsset(url)) { e.respondWith(cacheFirst(req, ASSET_CACHE)); return; }
  // HTML, .json, autres cross-origin → réseau direct (non intercepté).
});

/* Page : le réseau d'abord, en revalidant (jamais la copie HTTP du téléphone) ; la
   copie gardée est rangée SANS le « ?… » de l'adresse (aucun code ni paramètre
   conservé) et ne ressort que si le réseau manque ou ne répond pas à temps. */
/* ── (27/11/2026) SCRIPTS COMMUNS EN RETARD D'UNE OUVERTURE ──────────────
   Les pages arrivent du réseau, mais scripts et feuilles de style étaient servis
   de la copie (rafraîchie en fond, pour la fois suivante). Après une publication,
   la page neuve tournait donc UNE fois avec les scripts d'avant : le 14/11
   (v1.75.0), planning.html appelait une fonction que l'ancien
   partage/rendu_equite.js ne connaissait pas — onglet Équité en erreur jusqu'au
   rechargement suivant.
   Désormais :
     · à chaque ouverture de page, le numéro de version en ligne est lu (version.js,
       ~1 Ko, en même temps que la page) et mémorisé ;
     · chaque copie de script porte le numéro du site au moment où elle a été prise ;
     · copie du numéro courant → servie tout de suite, comme avant ;
     · copie d'un autre numéro → le réseau d'abord (CODE_DELAI), la copie en secours.
   Rien n'est jeté : hors réseau, ou si le numéro tarde, la page garde ses scripts. */
async function lireVersionSite() {
  try {
    var r = await fetch(self.registration.scope + 'version.js?sw=' + Date.now(), { cache: 'no-store' });
    if (!r || !r.ok) return;
    var m = /SITE_VERSION\s*=\s*'([^']+)'/.exec(await r.text());
    if (!m) return;
    versionSite = m[1];
    var meta = await caches.open(META_CACHE);
    await meta.put('version', new Response(m[1]));
  } catch (e) { /* sans réseau : le dernier numéro connu reste */ }
}
async function versionConnue() {
  if (versionSite) return versionSite;
  try { var vu = await (await caches.open(META_CACHE)).match('version'); if (vu) versionSite = await vu.text(); } catch (e) {}
  return versionSite;
}
async function etiqueter(res, v) {
  try {
    var h = new Headers(res.headers); h.set(ETIQUETTE, v);
    return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) { return res; }
}
async function codeAJour(req) {
  var cached = await caches.match(req);
  var v = await versionConnue();
  /* « no-cache » = faire revalider par le serveur, sans se contenter de la copie que
     le téléphone garde 10 minutes de son côté. */
  var demander = async function () {
    var res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) { var c = await caches.open(ASSET_CACHE); await c.put(req, v ? await etiqueter(res.clone(), v) : res.clone()); }
    return res;
  };
  if (cached && (!v || cached.headers.get(ETIQUETTE) === v)) {
    demander().catch(function () {});                       // revalidation discrète en fond, comme avant
    return cached;
  }
  try {
    var res = await Promise.race([
      demander(),
      new Promise(function (_, ko) { setTimeout(function () { ko(new Error('délai')); }, cached ? CODE_DELAI : 60000); })
    ]);
    if (res && (res.ok || !cached)) return res;
    return cached;                                          // réponse en erreur : la copie d'avant vaut mieux
  } catch (e) { return cached || Response.error(); }
}

async function pageReseauDabord(req, url) {
  var cle = url.origin + url.pathname;
  var maj = lireVersionSite();                              // (27/11/2026) en même temps que la page
  try {
    var res = await Promise.race([
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise(function (_, ko) { setTimeout(function () { ko(new Error('délai')); }, PAGE_DELAI); })
    ]);
    if (res && res.redirected) return Response.redirect(res.url, 302);   // iPhone : pas de réponse redirigée pour une page
    if (res && res.ok) { var c = await caches.open(PAGE_CACHE); await c.put(cle, res.clone()); }
    await Promise.race([maj, new Promise(function (ok) { setTimeout(ok, MAJ_DELAI); })]);   // (27/11/2026) le numéro est connu avant que la page demande ses scripts
    return res;
  } catch (e) {
    var copie = await (await caches.open(PAGE_CACHE)).match(cle);
    if (copie) return copie;
    try { return await fetch(req); } catch (e2) { return Response.error(); }
  }
}

async function cacheFirst(req, cacheName) {
  var cached = await caches.match(req);
  if (cached) {
    fetch(req).then(function (res) {                       // revalidation discrète en fond
      if (res && res.ok) caches.open(cacheName).then(function (c) { c.put(req, res.clone()); });
    }).catch(function () {});
    return cached;
  }
  try {
    var res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) { var c = await caches.open(cacheName); c.put(req, res.clone()); }
    return res;
  } catch (e) { return cached || Response.error(); }
}

/* ── NOTIFICATIONS PUSH (12/08/2026, v3) ─────────────────────────────
   Deux gestionnaires, rien d'autre : afficher ce qui arrive, ouvrir la
   bonne page au toucher. La charge est déjà déchiffrée par le navigateur. */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  var titre = d.titre || 'Planning-Med';
  /* (v4) Pastille sur l'icône de l'app : bannière et pastille sont deux
     mécanismes séparés sur iPhone — la pastille se demande explicitement
     (iOS 16.4+, app installée). Posée seulement si la charge porte un
     nombre ; effacée par le portail à son ouverture. Jamais bloquant. */
  if (typeof d.pastille === 'number' && navigator.setAppBadge) {
    try { navigator.setAppBadge(d.pastille); } catch (_) {}
  }
  e.waitUntil(self.registration.showNotification(titre, {
    body: d.corps || '',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    data: { url: d.url || './index.html' },
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (fen) {
    for (var i = 0; i < fen.length; i++) {
      if ('focus' in fen[i]) { if (fen[i].navigate) fen[i].navigate(url); return fen[i].focus(); }
    }
    return clients.openWindow(url);
  }));
});
