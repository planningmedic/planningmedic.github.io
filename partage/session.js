/* ═════════════════════════════════════════════════════════════════════════════
   SESSION DES MAR — où vit le code d'accès, et combien de temps
   (17/08/2026) Source UNIQUE pour dashboard.html, index.html et indispos.html.

   LE PROBLÈME. Le code était gardé en sessionStorage : il ne survit pas à la
   fermeture de l'app. Or iOS ferme volontiers les apps web en arrière-plan —
   en pratique, un MAR retapait ses 8 caractères à peu près une fois par jour.
   Sur un portail qu'on ouvre pour vérifier une garde en trente secondes, c'est
   la friction qui décide si l'outil est utilisé ou pas.

   LE CHOIX (Arthur, 17/08/2026) : ni l'un ni l'autre des deux extrêmes.
     · 30 JOURS GLISSANTS. L'échéance est repoussée à chaque ouverture. Qui
       consulte, même une fois par mois, ne retape jamais. Un téléphone oublié
       dans un tiroir cesse d'ouvrir le portail au bout d'un mois.
     · SEULEMENT DANS L'APP INSTALLÉE. Ouvert depuis Safari ou Chrome — donc
       peut-être depuis un poste du bloc — rien n'est mémorisé : on retombe sur
       l'ancien comportement, effacé à la fermeture de l'onglet. Le confort ne
       s'installe que là où le téléphone est déjà verrouillé par son
       propriétaire. C'est un gain de sécurité, pas seulement de confort.

   CE QUI RESTE VRAI. Le code mémorisé est REVALIDÉ auprès du serveur à chaque
   ouverture. Régénérer le code d'un MAR (bouton 🔄, onglet Équipe) éjecte donc
   son téléphone dès l'ouverture suivante : le comité garde la main, et c'est ce
   qui rend cette mémoire acceptable.

   RÈGLE. Aucune page ne doit lire ou écrire 'pmViewCode' directement. Tout
   passe par ici. Trois pages qui recopieraient la même quinzaine de lignes
   finiraient par diverger — le banc vérifie qu'aucune ne le fait.
   ═════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CLE_COURTE = 'pmViewCode';       // sessionStorage — durée de l'onglet
  var CLE_LONGUE = 'pmViewCodeMem';    // localStorage  — 30 jours glissants
  var DUREE_MS   = 30 * 24 * 60 * 60 * 1000;

  /* Navigation privée, stockage plein, réglages verrouillés : toute opération
     peut lever. Aucune ne doit empêcher la page de s'ouvrir — au pire, le MAR
     retape son code. */
  function sessLire()   { try { return sessionStorage.getItem(CLE_COURTE) || ''; } catch (e) { return ''; } }
  function sessEcrire(c){ try { sessionStorage.setItem(CLE_COURTE, c); } catch (e) {} }
  function sessEffacer(){ try { sessionStorage.removeItem(CLE_COURTE); } catch (e) {} }
  function locEffacer() { try { localStorage.removeItem(CLE_LONGUE); } catch (e) {} }

  /* App posée sur l'écran d'accueil. `standalone` est la propriété d'iOS ;
     display-mode couvre Android et les navigateurs de bureau. */
  function estInstallee() {
    try {
      if (global.navigator && global.navigator.standalone === true) return true;
      if (global.matchMedia) {
        return global.matchMedia('(display-mode: standalone)').matches === true
            || global.matchMedia('(display-mode: fullscreen)').matches === true;
      }
    } catch (e) {}
    return false;
  }

  function memoriser(code) {
    var c = String(code || '').trim();
    if (!c) return;
    sessEcrire(c);                       // toujours : l'onglet en cours
    if (!estInstallee()) { locEffacer(); return; }
    try {
      localStorage.setItem(CLE_LONGUE, JSON.stringify({ c: c, exp: Date.now() + DUREE_MS }));
    } catch (e) {}
  }

  function lire() {
    var court = sessLire();
    if (court) { if (estInstallee()) memoriser(court); return court; }  // glissement
    if (!estInstallee()) return '';
    var brut = null;
    try { brut = localStorage.getItem(CLE_LONGUE); } catch (e) { return ''; }
    if (!brut) return '';
    var o = null;
    try { o = JSON.parse(brut); } catch (e) { locEffacer(); return ''; }
    if (!o || !o.c || !o.exp || Date.now() > Number(o.exp)) { locEffacer(); return ''; }
    memoriser(o.c);                      // échéance repoussée de 30 jours
    return String(o.c);
  }

  /* Déconnexion, code refusé, code régénéré par le comité : on efface PARTOUT.
     Un code effacé d'un seul des deux endroits reviendrait à l'ouverture
     suivante — c'est le défaut que ce point unique empêche. */
  function oublier() { sessEffacer(); locEffacer(); }

  /* Jours restants avant que le code soit redemandé. Sert aux tests et à
     l'affichage éventuel ; null si rien n'est mémorisé durablement. */
  function joursRestants() {
    if (!estInstallee()) return null;
    try {
      var o = JSON.parse(localStorage.getItem(CLE_LONGUE) || 'null');
      if (!o || !o.exp) return null;
      return Math.max(0, Math.ceil((Number(o.exp) - Date.now()) / 86400000));
    } catch (e) { return null; }
  }

  global.SessionPortail = {
    lire: lire,
    memoriser: memoriser,
    oublier: oublier,
    estInstallee: estInstallee,
    joursRestants: joursRestants,
    DUREE_JOURS: 30
  };
})(window);
