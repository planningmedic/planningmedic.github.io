/*!
 * acr/sw.js — Service worker de l'outil ACR (27/09/2026). Périmètre : /acr/ seulement.
 *
 * Rôle : l'outil doit s'ouvrir SANS RÉSEAU. Dès la première ouverture, la page,
 * le manifeste et les icônes sont copiés sur le téléphone ; ensuite la copie est
 * servie immédiatement (pas d'attente réseau en pleine urgence), et le réseau,
 * s'il répond, remplace la copie en fond. Une nouvelle version publiée est donc
 * sur le téléphone au plus tard à l'ouverture suivante, sans aucun geste.
 *
 * Cohabitation avec le service worker du portail (sw.js à la racine, périmètre /) :
 *   · une page de /acr/ est contrôlée par CE service worker — le navigateur choisit
 *     toujours le périmètre le plus précis ; le portail n'intercepte rien ici ;
 *   · chacun ne supprime QUE ses propres caches : « acr- » ici, « pm-sw- » pour le
 *     portail (corrigé le même jour : jusque-là, le portail effaçait à son
 *     activation tout cache ne portant pas son nom, donc aussi celui-ci) ;
 *   · filet malgré tout : `completer()` recopie, à chaque ouverture avec réseau,
 *     tout fichier manquant — un cache vidé par le navigateur se reconstitue seul.
 *
 * Monter VERSION seulement si la LISTE des fichiers change. Une nouvelle version
 * de la page n'en a pas besoin : elle est reprise en fond à chaque ouverture.
 */
var VERSION = 'acr-v1';
var CACHE = VERSION;
var FICHIERS = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

function adresse(f) { return new URL(f, self.registration.scope).href; }
function frais(url) { return new Request(url, { cache: 'no-cache', credentials: 'same-origin' }); }

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE)
    .then(function (c) { return c.addAll(FICHIERS.map(function (f) { return frais(adresse(f)); })); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.map(function (k) {
      return (k.indexOf('acr-') === 0 && k !== CACHE) ? caches.delete(k) : null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

/* Recopie tout fichier de la liste absent du cache (cache effacé par un tiers). */
function completer(cache) {
  return Promise.all(FICHIERS.map(function (f) {
    var url = adresse(f);
    return cache.match(url).then(function (r) {
      return r ? null : fetch(frais(url)).then(function (res) { if (res && res.ok) return cache.put(url, res); }).catch(function () {});
    });
  }));
}

/* Prévient les pages ouvertes qu'une nouvelle version de la page est en cache. */
function annoncer() {
  return self.clients.matchAll({ type: 'window' }).then(function (fen) {
    fen.forEach(function (c) { c.postMessage({ type: 'acr-nouvelle-version' }); });
  });
}

var HORS_RESEAU = '<!DOCTYPE html><html lang="fr"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>ACR</title>' +
  '<body style="font-family:system-ui,sans-serif;padding:24px;line-height:1.5">' +
  '<h1>Pas de réseau</h1><p>L\'outil ACR n\'a pas encore été enregistré sur ce téléphone. ' +
  'Ouvrez-le une fois avec du réseau : il fonctionnera ensuite sans.</p></body></html>';

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url; try { url = new URL(req.url); } catch (_) { return; }
  var scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || url.pathname.indexOf(scope.pathname) !== 0) return;   // hors /acr/ : réseau direct

  // La page : « /acr/ », « /acr/index.html », ou toute navigation du périmètre.
  var estPage = req.mode === 'navigate' || url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html';
  var cle = estPage ? adresse('./') : url.origin + url.pathname;

  var ouvert = caches.open(CACHE);
  var ancien = ouvert.then(function (c) { return c.match(cle); });
  var reseau = ouvert.then(function (cache) {
    return fetch(frais(cle)).then(function (res) {
      if (!res || !res.ok) return null;
      var copie = res.clone();
      /* Relue ici, pas reprise de `ancien` : celle-là part à l'écran et son
         contenu peut déjà être consommé quand le réseau répond. */
      return cache.match(cle).then(function (av) {
        if (!estPage || !av) return cache.put(cle, copie).then(function () { return res; });
        return Promise.all([av.clone().text(), copie.clone().text()]).then(function (t) {
          return cache.put(cle, copie).then(function () { if (t[0] !== t[1]) return annoncer(); }).then(function () { return res; });
        });
      });
    }).then(function (res) {
      return estPage ? completer(cache).then(function () { return res; }) : res;
    });
  }).catch(function () { return null; });

  e.waitUntil(reseau);
  e.respondWith(ancien.then(function (av) {
    if (av) return av;
    return reseau.then(function (res) {
      if (res) return res.clone();
      return estPage
        ? new Response(HORS_RESEAU, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        : Response.error();
    });
  }));
});
