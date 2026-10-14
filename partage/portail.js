/* ═══════════════════════════════════════
   SOCLE COMMUN DES PAGES — ce que chaque page recopiait, écrit une fois
   (14/09/2026) Première brique : la lecture du miroir.

   LE PROBLÈME. `miroirRead` existait en six exemplaires (une par page) et plus
   aucun n'était identique : l'un mesurait le temps de réponse, l'autre
   acceptait un code en paramètre, un troisième était une version raccourcie.
   L'adresse du relais était écrite sept fois. Changer le délai d'abandon ou
   l'adresse imposait de retoucher chaque page, et l'on en oubliait une (le
   délai de 10 s « mobile » n'existe que dans admin.html).

   LE CHOIX. Une seule fonction, capable de tout ce que faisaient les six :
     · le code d'accès passé en paramètre, sinon le VIEW_CODE de la page ;
     · la mesure de temps si la page expose window.PERF, sinon rien ;
     · le délai d'abandon en paramètre ou par page (window.MIROIR_DELAI), 6 s par défaut.
   Les pages rejoignent ce socle UNE PAR UNE (staff.html la première) ; tant
   qu'une page garde sa copie locale, c'est sa copie qui gagne — ce fichier ne
   redéfinit jamais une fonction déjà présente.

   Chargé par <script src="partage/portail.js">, comme partage/session.js.
   Le banc (banc_portail.js) exécute ce fichier tel quel. */

(function () {
  if (typeof window === 'undefined') return;

  if (!window.MIROIR_URL) window.MIROIR_URL = 'https://miroir.planningmedic.workers.dev';

  /* Lecture d'une ou plusieurs clés du miroir.
       keys      : tableau de clés ('config_admin', 'indispos_2027', …)
       codeAcces : code à présenter au relais ; sinon window.VIEW_CODE
       options   : { delai: ms avant abandon (défaut 6000) }
     Renvoie l'objet JSON du relais, ou null en cas de panne de transport
     (délai dépassé, réseau) — le repli vers le serveur reste la décision de
     la page appelante, comme avant. */
  if (typeof window.miroirRead !== 'function') {
    window.miroirRead = async function miroirRead(keys, codeAcces, options) {
      /* Délai d'abandon : l'appel, sinon la page (window.MIROIR_DELAI — admin.html
         le fixe à 10 s depuis v1.20.1 : 6 s coupait les réseaux mobiles lents en
         plein colis), sinon 6 s. */
      const delai = (options && options.delai) || window.MIROIR_DELAI || 6000;
      /* VIEW_CODE est déclaré par `let` dans les pages : c'est une variable
         globale de script, pas une propriété de window — on la lit par son
         nom, avec typeof pour ne pas planter si la page ne la déclare pas. */
      const code = codeAcces || (typeof VIEW_CODE !== 'undefined' ? VIEW_CODE : window.VIEW_CODE);
      const _dep = (typeof performance !== 'undefined') ? Math.round(performance.now()) : 0;
      const _t0 = Date.now();
      const _ctrl = new AbortController();
      const _timer = setTimeout(function () { _ctrl.abort(); }, delai);
      const mesure = function (erreur) {
        try { if (window.PERF) window.PERF.appel('miroir:' + keys.join('+'), Date.now() - _t0, null, _dep, erreur); } catch (_e) {}
      };
      try {
        const res = await fetch(window.MIROIR_URL + '/read', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // requête « simple » : pas de préambule CORS
          body: JSON.stringify({ code: code, keys: keys }),
          signal: _ctrl.signal,
        });
        const rep = await res.json();
        mesure(rep && rep.success ? undefined : 'ECHEC — ' + ((rep && rep.error) || 'HTTP ' + res.status));
        return rep;
      } catch (e) {
        mesure('ECHEC — ' + (e && e.message));
        return null;   // panne de transport → le repli serveur décide
      } finally { clearTimeout(_timer); }
    };
  }

  /* ═══ THÈME clair / sombre / automatique (14/09/2026, brique 2) ═══
     Trois copies identiques (accueil, planning, crh) au tronc près : la clé
     localStorage `pmTheme`, l'attribut data-theme, la couleur de la barre du
     téléphone et l'icône du bouton. Ce que chaque page fait EN PLUS après un
     changement de thème (planning recalcule ses couleurs de secteurs et
     redessine) passe par des crochets facultatifs :
       window.onThemeApplied(t, pref)  — après chaque applyTheme()
       window.apresCycleTheme()        — après un clic sur le bouton
       window.apresThemeSysteme()      — après un basculement du réglage du
                                         téléphone (mode auto)
     Le socle n'applique PAS le thème de lui-même : chaque page garde son
     appel applyTheme() là où il était (après ses propres déclarations). */
  if (typeof window.getThemePref !== 'function') {
    window.getThemePref = function getThemePref() { try { return localStorage.getItem('pmTheme') || 'auto'; } catch (e) { return 'auto'; } };
    window.resolveTheme = function resolveTheme(pref) { return pref === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref; };
    window.applyTheme = function applyTheme() {
      const pref = getThemePref(), t = resolveTheme(pref);
      document.documentElement.dataset.theme = t;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = t === 'dark' ? '#0B1220' : '#CE1126';
      const btn = document.getElementById('themeBtn');
      if (btn) { btn.textContent = pref === 'auto' ? '🌗' : (pref === 'dark' ? '🌙' : '☀️');
                 btn.title = 'Thème : ' + (pref === 'auto' ? 'automatique' : (pref === 'dark' ? 'sombre' : 'clair')); }
      try { if (typeof window.onThemeApplied === 'function') window.onThemeApplied(t, pref); } catch (e) {}
    };
    window.cycleTheme = function cycleTheme() {
      const order = ['auto', 'light', 'dark'];
      const next = order[(order.indexOf(getThemePref()) + 1) % 3];
      try { localStorage.setItem('pmTheme', next); } catch (e) {}
      applyTheme();
      try { if (typeof window.apresCycleTheme === 'function') window.apresCycleTheme(); } catch (e) {}
    };
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (getThemePref() !== 'auto') return;
        applyTheme();
        try { if (typeof window.apresThemeSysteme === 'function') window.apresThemeSysteme(); } catch (e) {}
      });
    } catch (e) {}
  }

  /* ── MISE À JOUR SANS QUITTER L'APPLI (14/10/2026, v1.23.1) ─────────────
     Une appli restée en arrière-plan garde le code chargé au départ, même après
     une publication. Au retour au premier plan (au plus une fois toutes les
     30 min), on lit le numéro en ligne (version.js, ~1 Ko, jamais mis en cache) :
       · s'il diffère, et que la page l'autorise (window.__majRechargeAuto() vrai :
         l'accueil, sans saisie en cours), la page se recharge seule ;
       · sinon, un bandeau « Nouvelle version — Mettre à jour » : on ne recharge
         JAMAIS sous les doigts de quelqu'un.
     Inactif sur une page qui ne connaît pas son numéro (pas de version.js). */
  if (!window.__majVerifier) {
    const MAJ_INTERVALLE = 30 * 60 * 1000;
    let majDerniere = Date.now(), majEnCours = false;
    function majRecharger() { if (typeof window.__majRecharger === 'function') window.__majRecharger(); else location.reload(); }   // __majRecharger : point d'écoute du banc
    function majBandeau() {
      if (!window.document || document.getElementById('majBandeau')) return;
      const b = document.createElement('div');
      b.id = 'majBandeau'; b.setAttribute('role', 'status');
      b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:10000;'
        + 'max-width:480px;margin:0 auto;background:#0F172A;color:#F8FAFC;border-radius:14px;padding:11px 12px 11px 14px;'
        + 'display:flex;align-items:center;gap:10px;font:500 14px "DM Sans",-apple-system,sans-serif;box-shadow:0 10px 30px rgba(15,23,42,.35)';
      b.innerHTML = '<span style="flex:1">Nouvelle version disponible</span>'
        + '<button type="button" id="majBouton" style="border:0;background:#F8FAFC;color:#0F172A;font:600 14px \'DM Sans\',-apple-system,sans-serif;border-radius:10px;padding:8px 12px;cursor:pointer">Mettre à jour</button>';
      document.body.appendChild(b);
      document.getElementById('majBouton').onclick = majRecharger;
    }
    window.__majVerifier = async function (forcer) {
      const actuelle = window.SITE_VERSION;
      if (!actuelle || typeof actuelle !== 'string' || majEnCours) return null;
      if (!forcer && Date.now() - majDerniere < MAJ_INTERVALLE) return null;
      majEnCours = true; majDerniere = Date.now();
      try {
        const r = await fetch('version.js?t=' + Date.now(), { cache: 'no-store' });
        if (!r || !r.ok) return null;
        const m = /SITE_VERSION\s*=\s*'([^']+)'/.exec(await r.text());
        if (!m || m[1] === actuelle) return 'a-jour';
        let auto = false;
        try { auto = typeof window.__majRechargeAuto === 'function' && !!window.__majRechargeAuto(); } catch (e) {}
        if (auto) { majRecharger(); return 'recharge'; }
        majBandeau(); return 'bandeau';
      } catch (e) { return null; }                 // hors réseau : on réessaiera au prochain retour
      finally { majEnCours = false; }
    };
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') window.__majVerifier(false);
      });
    } catch (e) {}
  }

  /* Message d'erreur de l'écran de code (« Code incorrect », « Erreur réseau »),
     affiché 4 s. Identique dans les trois pages qui ont un écran de code. */
  if (typeof window._authErr !== 'function') {
    window._authErr = function _authErr(msg) {
      const el = document.getElementById('viewAuthErr');
      if (!el) return;
      el.textContent = msg; el.style.display = 'block';
      setTimeout(function () { el.style.display = 'none'; }, 4000);
    };
  }
})();
