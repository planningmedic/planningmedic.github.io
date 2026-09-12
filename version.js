/* ─────────────────────────────────────────────────────────────────────────
   SOURCE UNIQUE du numéro de version du site.

   (14/08/2026) Le numéro était recopié à la main dans 11 emplacements de
   5 fichiers. On s'est trompés : une note interne en annonçait 9. Un numéro
   qu'il faut recompter avant chaque publication finit par mentir.

   Désormais : il s'écrit ICI, une fois. Toute page qui veut l'afficher pose
   un élément portant l'attribut data-version — il se remplit tout seul.

   Deux chiffres, pas trois : le troisième ne disait rien à personne dans le
   service et donnait des « v1.34.10 » qui font perdre confiance plus qu'ils
   n'informent.

   (01/09/2026) PASSAGE DE v1.99 À v10.0, puis RETOUR À v1.0 le 05/09/2026.
   La série des v1.x était montée à 99 non pas parce que le portail avait changé
   99 fois de visage, mais parce qu'on montait le 2e chiffre à chaque lot. Le
   numéro ne disait donc plus rien. Passer à v10 n'a fait que déplacer le
   problème : il fallait repartir de bas et remonter LENTEMENT.

   On repart donc à v1.0. Le repère : **v1.0 est la version présentée au staff
   du 4 septembre 2026**, celle que l'équipe a vue et utilise. Le 1er chiffre est
   réservé à ce qui change vraiment de visage — l'ouverture du module libéral
   sera v2.0. Le 2e ne monte que pour une fonctionnalité qu'un MAR remarque. Le
   3e pour tout le reste.

   ⚠️ Le numéro DESCEND (v10.8.3 → v1.0.4). C'est voulu, et c'est la seule fois.
   ───────────────────────────────────────────────────────────────────────── */
window.SITE_VERSION = 'v1.11.0';

(function () {
  function poser() {
    var els = document.querySelectorAll('[data-version]');
    for (var i = 0; i < els.length; i++) els[i].textContent = window.SITE_VERSION;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', poser);
  } else {
    poser();
  }
})();
