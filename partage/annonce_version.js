/* ═══ ANNONCE D'UNE VERSION MAJEURE (25/11/2026) ═════════════════════════════
   À la première ouverture du portail après le passage à une nouvelle version
   majeure (v2.0, plus tard v3.0…), une carte plein écran salue le MAR : la
   baie de nuit (le dessin de partage/attente_baie.js), un feu d'artifice
   au-dessus du port, le grand « 2.0 », trois nouveautés et un bouton.

   RÈGLES
   - Une fois par appareil et par version majeure : la clé locale retient le
     1er chiffre déjà annoncé. Un petit correctif (v2.0.1) ou une
     fonctionnalité (v2.1) ne rejoue rien.
   - Rien avant v2 : la série v1 n'a jamais eu d'annonce.
   - Purement visuel : aucun appel réseau, aucune donnée, aucun nom.
   - Se ferme d'un geste : bouton, toucher hors de la carte, touche Échap.
   - Ne peut pas casser l'accueil : toute erreur est avalée ; sans ce fichier
     (window.AnnonceVersion absent), l'accueil s'ouvre comme avant.
   - Mouvement réduit demandé par le téléphone : carte fixe, sans feu.

   USAGE
     AnnonceVersion.verifier();   // après l'ouverture du portail ; rappelable
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  var CLE = 'pmVersionMajeureVue';
  var CSS_ID = 'annonce-version-css';

  /* Les nouveautés annoncées, par version majeure. Texte simple, sans nom. */
  var NOUVEAUTES = {
    2: [
      ['Mes vacances', 'tu poses tes vacances toi-même, comme tes TP'],
      ['Mon récapitulatif', 'ton année entière sur un seul écran'],
      ['Bourse aux gardes', 'l\'arrivée de la bourse : mets une garde en vitrine, prends celle d\'un collègue']
    ]
  };

  var dejaVerifie = false;

  function majeure(v) { var m = /^v?(\d+)/.exec(String(v || '')); return m ? Number(m[1]) : 0; }
  function lire() { try { return Number(localStorage.getItem(CLE)) || 0; } catch (e) { return 0; } }
  function ecrire(n) { try { localStorage.setItem(CLE, String(n)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function css() {
    return ''
      + '.av-fond{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;'
      + 'background:rgba(8,13,28,.82);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .45s ease}'
      + '.av-fond.vu{opacity:1}.av-fond.part{opacity:0}'
      + '.av-carte{width:100%;max-width:420px;background:var(--white,#fff);color:var(--ink,#0F172A);border-radius:22px;overflow:hidden;'
      + 'box-shadow:0 24px 60px rgba(0,0,0,.45);transform:translateY(24px) scale(.96);transition:transform .6s cubic-bezier(.2,1.3,.4,1)}'
      + '.av-fond.vu .av-carte{transform:none}'
      + '.av-scene{position:relative;overflow:hidden;line-height:0;background:#141C3A}'
      /* ciel de nuit au-dessus de la baie : le feu et le grand numéro y vivent */
      + '.av-ciel{position:relative;height:112px;background:linear-gradient(#070B1F,#141C3A)}'
      + '.av-scene .att-baie{margin:0;max-width:none;border-radius:0;opacity:1;max-height:none}'
      /* la baie reste de nuit (couleurs figées à 70 % du cycle) ; bateaux, hélico, vagues et feux du port bougent */
      + '.av-scene .att-baie *{animation-delay:-11.2s!important;animation-play-state:paused!important}'
      + '.av-scene .att-baie .k-ya,.av-scene .att-baie .k-sa,.av-scene .att-baie .k-he,.av-scene .att-baie .k-ro,'
      + '.av-scene .att-baie .k-wv,.av-scene .att-baie .k-bl{animation-play-state:running!important}'
      + '.av-num{position:absolute;left:0;right:0;top:50%;margin-top:-34px;text-align:center;line-height:1;pointer-events:none;'
      + 'font:700 68px/1 "DM Sans",-apple-system,sans-serif;letter-spacing:-.02em;color:#fff;'
      + 'text-shadow:0 0 18px rgba(255,207,116,.9),0 0 42px rgba(245,158,11,.6);opacity:0;transform:scale(.4)}'
      + '.av-num small{font-size:.38em;font-weight:600;opacity:.85;margin-right:2px;vertical-align:.9em}'
      + '.av-fond.vu .av-num{animation:avNum .9s 1.5s cubic-bezier(.2,1.6,.4,1) forwards}'
      + '@keyframes avNum{to{opacity:1;transform:none}}'
      + '.av-feu{position:absolute;width:0;height:0}'
      + '.av-feu i{position:absolute;left:0;top:0;width:5px;height:5px;margin:-2.5px;border-radius:50%;opacity:0;'
      + 'box-shadow:0 0 6px currentColor;background:currentColor}'
      + '.av-fond.vu .av-feu i{animation:avEc 1.5s var(--d) ease-out forwards}'
      + '@keyframes avEc{0%{opacity:0;transform:translate(0,0) scale(.4)}8%{opacity:1}'
      + '70%{opacity:1}100%{opacity:0;transform:translate(var(--x),calc(var(--y) + 14px)) scale(.6)}}'
      + '.av-fusee{position:absolute;width:2px;height:12px;margin-left:-1px;border-radius:2px;opacity:0;'
      + 'background:linear-gradient(#FFF6D5,rgba(255,246,213,0))}'
      + '.av-fond.vu .av-fusee{animation:avFu .55s var(--d) ease-in forwards}'
      + '@keyframes avFu{0%{opacity:1;transform:translateY(var(--h))}90%{opacity:1}100%{opacity:0;transform:translateY(0)}}'
      + '.av-corps{padding:20px 22px 22px}'
      + '.av-titre{font:700 20px/1.25 "DM Sans",-apple-system,sans-serif;margin:0 0 4px}'
      + '.av-sous{font-size:14px;color:var(--ink-3,#64748B);margin:0 0 16px}'
      + '.av-liste{list-style:none;margin:0 0 20px;padding:0}'
      + '.av-liste li{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--line-light,#F1F5F9);'
      + 'font-size:14px;line-height:1.35;color:var(--ink-2,#334155);opacity:0;transform:translateY(8px)}'
      + '.av-liste li b{color:var(--ink,#0F172A);font-weight:600}'
      + '.av-liste li span.n{flex:0 0 24px;height:24px;border-radius:50%;background:#FEF3C7;color:#B45309;'
      + 'font:600 12px/24px "DM Mono",monospace;text-align:center}'
      + '.av-fond.vu .av-liste li{animation:avLi .45s ease forwards}'
      + '.av-fond.vu .av-liste li:nth-child(1){animation-delay:2.3s}.av-fond.vu .av-liste li:nth-child(2){animation-delay:2.45s}'
      + '.av-fond.vu .av-liste li:nth-child(3){animation-delay:2.6s}'
      + '@keyframes avLi{to{opacity:1;transform:none}}'
      + '.av-btn{display:block;width:100%;border:0;border-radius:14px;padding:14px;cursor:pointer;'
      + 'font:600 15px "DM Sans",-apple-system,sans-serif;color:#fff;background:linear-gradient(135deg,#D97706,#F59E0B);'
      + 'box-shadow:0 6px 18px rgba(217,119,6,.35)}'
      + '.av-btn:active{transform:scale(.98)}'
      + '@media (prefers-reduced-motion:reduce){.av-fond,.av-carte{transition:none}.av-feu,.av-fusee{display:none}'
      + '.av-fond .av-num,.av-fond .av-liste li{animation:none!important;opacity:1;transform:none}'
      + '.av-scene .att-baie *{animation:none!important}}';
  }

  /* Trois fusées montent du port et éclatent au-dessus de la baie. */
  function feux() {
    var tirs = [[17, 42, 0.7, ['#FFCF74', '#F59E0B', '#FFFFFF']],
                [83, 36, 1.15, ['#CE1126', '#FFFFFF', '#F4586B']],
                [50, 30, 2.4, ['#7BAAF7', '#FFFFFF', '#3BB273']]];
    var h = '';
    tirs.forEach(function (t) {
      var x = t[0], y = t[1], d = t[2];
      h += '<span class="av-fusee" style="left:' + x + '%;top:' + y + '%;--h:140px;--d:' + (d - 0.55).toFixed(2) + 's"></span>';
      h += '<span class="av-feu" style="left:' + x + '%;top:' + y + '%">';
      for (var i = 0; i < 20; i++) {
        var a = i / 20 * 2 * Math.PI, r = 34 + (i % 3) * 9;
        h += '<i style="color:' + t[3][i % 3] + ';--x:' + Math.round(Math.cos(a) * r) + 'px;--y:' + Math.round(Math.sin(a) * r) + 'px;--d:' + d.toFixed(2) + 's"></i>';
      }
      h += '</span>';
    });
    return h;
  }

  function afficher(n) {
    if (!document.getElementById(CSS_ID)) {
      var s = document.createElement('style'); s.id = CSS_ID; s.textContent = css();
      (document.head || document.documentElement).appendChild(s);
    }
    var scene = '';
    if (window.AttenteBaie && AttenteBaie.dessin) scene = '<div class="att-baie vu" aria-hidden="true">' + AttenteBaie.dessin() + '</div>';
    var items = (NOUVEAUTES[n] || []).map(function (l, i) {
      return '<li><span class="n">' + (i + 1) + '</span><span><b>' + esc(l[0]) + '</b> — ' + esc(l[1]) + '</span></li>';
    }).join('');
    var fond = document.createElement('div');
    fond.className = 'av-fond';
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-modal', 'true');
    fond.setAttribute('aria-label', 'Planning-Med passe en version ' + n + '.0');
    fond.innerHTML = '<div class="av-carte">'
      + '<div class="av-scene"><div class="av-ciel">' + feux() + '<div class="av-num"><small>v</small>' + n + '.0</div></div>' + scene + '</div>'
      + '<div class="av-corps"><p class="av-titre">Planning-Med passe en version ' + n + '.0</p>'
      + '<p class="av-sous">Le portail du service fait peau neuve. Ce qui change pour toi :</p>'
      + (items ? '<ul class="av-liste">' + items + '</ul>' : '')
      + '<button type="button" class="av-btn">Découvrir</button></div></div>';
    document.body.appendChild(fond);
    var fini = false;
    function fermer() {
      if (fini) return; fini = true;
      fond.classList.add('part');
      document.removeEventListener('keydown', clavier);
      setTimeout(function () { if (fond.parentNode) fond.parentNode.removeChild(fond); }, 460);
    }
    function clavier(e) { if (e.key === 'Escape') fermer(); }
    fond.querySelector('.av-btn').addEventListener('click', fermer);
    fond.addEventListener('click', function (e) { if (e.target === fond) fermer(); });
    document.addEventListener('keydown', clavier);
    requestAnimationFrame(function () { requestAnimationFrame(function () { fond.classList.add('vu'); }); });
    return fond;
  }

  function verifier() {
    try {
      if (dejaVerifie) return false;
      dejaVerifie = true;
      var n = majeure(window.SITE_VERSION);
      if (n < 2 || lire() >= n) return false;
      ecrire(n);
      afficher(n);
      return true;
    } catch (e) { return false; }
  }

  window.AnnonceVersion = { verifier: verifier, majeure: majeure, CLE: CLE, _afficher: afficher };
})();
