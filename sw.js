/*!
 * sw.js — Service worker (candidat conservateur).
 * Ne met en cache QUE les assets figés (js/css/images/polices).
 * API Google Apps Script, .json et HTML : réseau direct, JAMAIS interceptés.
 */
var VERSION = 'pm-sw-v2';
var ASSET_CACHE = VERSION + '-assets';
var FONT_CACHE  = VERSION + '-fonts';

self.addEventListener('install', function (e) { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return k.indexOf(VERSION) !== 0 ? caches.delete(k) : null; }));
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
  if (isFont(url.hostname)) { e.respondWith(cacheFirst(req, FONT_CACHE)); return; }
  if (url.origin === self.location.origin && isStaticAsset(url)) { e.respondWith(cacheFirst(req, ASSET_CACHE)); return; }
  // HTML, .json, autres cross-origin → réseau direct (non intercepté).
});

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
