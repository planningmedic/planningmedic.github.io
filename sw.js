/*!
 * sw.js — Service worker (candidat conservateur).
 * Met en cache les assets figés (js/css/images/polices), cache d'abord.
 * API Google Apps Script et .json : réseau direct, JAMAIS interceptés.
 * (29/10/2026) Pages (navigations) : RÉSEAU D'ABORD, copie de la dernière
 * ouverture réussie si pas de réseau — voir pageReseauDabord().
 */
var VERSION = 'pm-sw-v2';
var ASSET_CACHE = VERSION + '-assets';
var FONT_CACHE  = VERSION + '-fonts';
var PAGE_CACHE  = VERSION + '-pages';   // (29/10/2026) dernière version vue de chaque page
var PAGE_DELAI  = 6000;                 // au-delà, sans réponse du réseau : la copie

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
  if (url.origin === self.location.origin && isStaticAsset(url)) { e.respondWith(cacheFirst(req, ASSET_CACHE)); return; }
  // HTML, .json, autres cross-origin → réseau direct (non intercepté).
});

/* Page : le réseau d'abord, en revalidant (jamais la copie HTTP du téléphone) ; la
   copie gardée est rangée SANS le « ?… » de l'adresse (aucun code ni paramètre
   conservé) et ne ressort que si le réseau manque ou ne répond pas à temps. */
async function pageReseauDabord(req, url) {
  var cle = url.origin + url.pathname;
  try {
    var res = await Promise.race([
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }),
      new Promise(function (_, ko) { setTimeout(function () { ko(new Error('délai')); }, PAGE_DELAI); })
    ]);
    if (res && res.redirected) return Response.redirect(res.url, 302);   // iPhone : pas de réponse redirigée pour une page
    if (res && res.ok) { var c = await caches.open(PAGE_CACHE); await c.put(cle, res.clone()); }
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
