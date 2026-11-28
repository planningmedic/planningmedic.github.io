/* ═══ HABILLAGE DE NOËL DE L'ACCUEIL (26/11/2026) ═══════════════════════════
   Maquette validée par le responsable le 26/11/2026.
   Du 1er décembre au 6 janvier inclus, tout seul, sans rien à pousser :
   - de la neige tombe sur l'accueil (blanche la nuit, bleu glacier le jour) ;
   - un chapeau de Noël et un peu de neige sur le logo de l'en-tête ;
   - une congère sur la carte « Prochaine garde ».
   Habillage seul : posé par-dessus, inerte au toucher (pointer-events:none),
   aucun texte, aucun appel réseau, aucun stockage. Le reste de l'année : rien.
   La neige ne tombe que sur l'accueil (portail ouvert, tuiles visibles), se met
   en pause quand l'appli passe en arrière-plan, et reste immobile si le
   téléphone demande de réduire les animations.
   L'icône de l'écran d'accueil du téléphone ne change pas : iOS la fige à
   l'installation (décision du 26/11/2026). */
(function () {
  'use strict';
  function actif(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, j = d.getDate();
    return m === 12 || (m === 1 && j <= 6);
  }

  var CSS = ''
    + '.noel .header-brand{position:relative}'
    + '.noel .header-flag{position:relative}'
    + '.noel .noel-neige-logo{position:absolute;left:0;top:0;width:100%;height:42%;pointer-events:none}'
    + '.noel .noel-chapeau{position:absolute;left:14px;top:-9px;width:26px;height:23px;transform:rotate(14deg);'
    +   'pointer-events:none;filter:drop-shadow(0 0 .6px #fff) drop-shadow(0 1px 1.5px rgba(0,0,0,.35));z-index:2}'
    + '.noel .header.pm-h .noel-chapeau{left:11px;top:-8px;width:22px;height:19px}'   /* (28/11/2026) en-tête commun : logo de 28 px */
    + '.noel #myGardesHero{position:relative;overflow:visible}'
    + '.noel .noel-congere{position:absolute;left:10px;right:10px;top:-7px;height:20px;pointer-events:none;'
    +   'filter:drop-shadow(0 1px 0 #C9DDF0) drop-shadow(0 3px 4px rgba(30,80,140,.28))}'
    + 'html[data-theme="dark"].noel .noel-congere{filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));opacity:.92}'
    + '.noel-flocons{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:210}';

  var CHAPEAU = '<svg class="noel-chapeau" viewBox="0 0 34 30" aria-hidden="true">'
    + '<path d="M4 23 C6 12 13 3 23 4 C29 5 31 11 30 17 C28 13 25 11 22 12 C18 13 16 18 15 23 Z" fill="#8E0A18"/>'
    + '<path d="M22 12 C25 11 28 13 30 17 C30 13 29 9 26 7 C25 9 24 11 22 12 Z" fill="#5E0610" opacity=".6"/>'
    + '<rect x="1.5" y="21" width="17" height="6.5" rx="3.2" fill="#fff"/>'
    + '<circle cx="30" cy="18.5" r="3.6" fill="#fff"/></svg>';
  var NEIGE_LOGO = '<svg class="noel-neige-logo" viewBox="0 0 34 14" preserveAspectRatio="none" aria-hidden="true">'
    + '<path d="M0 0 H34 V6 C31 8 29 6 27 7.5 C25 9 24 12 22 11 C20 10 20 7 17 7.5 C14 8 13 10 10 9 C7 8 6 6 3 7 C2 7.5 1 7 0 6.5 Z" fill="#fff"/></svg>';
  var CONGERE = '<svg class="noel-congere" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true">'
    + '<path d="M0 12 C10 4 30 2 55 5 C80 8 95 3 125 3 C155 3 170 7 200 5 C230 3 255 2 280 5 C292 6 298 9 300 12 '
    + 'L300 13 C290 14 282 13 276 14 C272 15 271 19 268 19 C265 19 265 15 260 14 C220 13 180 14 140 13 '
    + 'C120 13 112 14 108 15 C105 16 105 20 101 20 C97 20 98 16 94 14 C70 13 40 14 20 13 C12 13 4 14 0 13 Z" fill="#fff"/></svg>';

  /* Pose (ou repose) les décors ; sans effet s'ils sont déjà là. */
  function poser() {
    var doc = document;
    var flag = doc.querySelector('.header-flag');
    if (flag && !flag.querySelector('.noel-neige-logo')) {
      flag.insertAdjacentHTML('beforeend', NEIGE_LOGO);
      flag.insertAdjacentHTML('afterend', CHAPEAU);
    }
    var hero = doc.getElementById('myGardesHero');
    if (hero && !hero.querySelector('.noel-congere')) hero.insertAdjacentHTML('afterbegin', CONGERE);
  }

  /* La neige n'est visible que sur l'accueil : portail ouvert et tuiles affichées. */
  function surAccueil() {
    var p = document.getElementById('portal'), t = document.getElementById('tilesView');
    return !!(p && t && p.style.display !== 'none' && t.style.display !== 'none');
  }

  function flocons() {
    if (document.querySelector('.noel-flocons')) return;
    var c = document.createElement('canvas');
    c.className = 'noel-flocons'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    var x = c.getContext && c.getContext('2d');
    if (!x) return;
    var L = 0, H = 0, r = Math.min(window.devicePixelRatio || 1, 2), F = [], vide = true;
    function taille() {
      L = c.clientWidth || window.innerWidth || 390; H = c.clientHeight || window.innerHeight || 760;
      c.width = L * r; c.height = H * r; x.setTransform(r, 0, 0, r, 0, 0);
    }
    taille(); window.addEventListener('resize', taille);
    var n = Math.round(Math.min(70, L * H / 9000));
    for (var i = 0; i < n; i++) F.push({ x: Math.random() * L, y: Math.random() * H, t: 1 + Math.random() * 2.2,
      v: .25 + Math.random() * .55, p: Math.random() * 6.28, a: .55 + Math.random() * .45 });
    var calme = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function dessin(bouger) {
      x.clearRect(0, 0, L, H); vide = false;
      var co = document.documentElement.getAttribute('data-theme') === 'dark' ? '255,255,255' : '150,186,222';
      for (var k = 0; k < F.length; k++) {
        var f = F[k];
        if (bouger) {
          f.y += f.v * f.t * .6; f.p += .012; f.x += Math.sin(f.p) * .35;
          if (f.y > H + 4) { f.y = -4; f.x = Math.random() * L; }
        }
        x.beginPath(); x.arc(f.x, f.y, f.t, 0, 6.283); x.fillStyle = 'rgba(' + co + ',' + f.a + ')'; x.fill();
      }
    }
    var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 40); };
    (function boucle() {
      if (document.hidden) { /* arrière-plan : rien */ }
      else if (!surAccueil()) { if (!vide) { x.clearRect(0, 0, L, H); vide = true; } }
      else dessin(!calme);
      raf(boucle);
    })();
  }

  function demarrer(d) {
    if (!actif(d)) return false;
    document.documentElement.classList.add('noel');
    if (!document.getElementById('noel-css')) {
      var st = document.createElement('style'); st.id = 'noel-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    poser(); flocons();
    return true;
  }

  window.Noel = { actif: actif, demarrer: demarrer, poser: poser };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { demarrer(); });
  else demarrer();
})();
