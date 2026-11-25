/* ═══ ATTENTE ILLUSTRÉE — LA BAIE (17/11/2026) ═══════════════════════════════
   Petit dessin animé pendant les attentes LONGUES des assistants : le nouvel
   hôpital (façade blanche aux lames ondulantes, toit-jardin, socle aux
   arches) au-dessus de la baie — le Rocher et son palais, le port, le
   Casino, les tours —, en cycle jour/nuit de 16 s.

   Maquette validée par le responsable le 17/11/2026. Réservé aux attentes qui
   durent : génération des gardes (W2), démarrage de l'année (W1), clôture
   (Maintenance). Jamais sur l'ouverture d'une page : elle est rapide.

   RÈGLES
   - N'apparaît qu'après 1 s d'attente (SEUIL_MS) : une attente courte ne fait
     pas de flash.
   - Purement visuel : aucun appel réseau, aucune donnée, aucun nom. Le dessin
     est du SVG animé en CSS, construit ici.
   - Ne remplace rien : la liste des étapes et les messages restent en dessous.
   - Ne peut pas casser l'assistant : toute erreur est avalée, et un appelant
     sans ce fichier continue sans le dessin (window.AttenteBaie absent).
   - Si le conteneur est réécrit (innerHTML), le dessin part avec : rien à
     nettoyer. Sinon, retirer().

   USAGE
     const att = AttenteBaie.poser(conteneur [, avant]);  // avant : nœud devant lequel l'insérer
     …attente…
     att.retirer();
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  var SEUIL_MS = 1000;
  var CSS_ID = 'att-baie-css';

  // Couleurs [jour, nuit] des éléments du décor, animées sur 16 s.
  var TEINTES = {
    sky: null, // ciel : animation à part (aube et crépuscule)
    mt: ['#A7B8A0', '#26304A'], mt2: ['#8FA487', '#1F2840'], sea: ['#2A7DBD', '#0E2242'],
    rk: ['#C79C72', '#463935'], st: ['#F2E4C8', '#7D715F'], cy: ['#EDE6D8', '#4D5470'],
    cy2: ['#E2D3BD', '#434A64'], cu: ['#5FA79A', '#2F5A58'], tw: ['#DDE7EF', '#56607C'],
    gr: ['#5E9A4E', '#21382A'], gr2: ['#447F3C', '#182C20']
  };

  function css() {
    var k = '';
    Object.keys(TEINTES).forEach(function (n) {
      var t = TEINTES[n]; if (!t) return;
      k += '@keyframes abT' + n + '{0%,33%,100%{fill:' + t[0] + '}53%,85%{fill:' + t[1] + '}}'
        + '.att-baie .k-' + n + '{animation:abT' + n + ' 16s linear infinite}';
    });
    return ''
      + '.att-baie{max-width:440px;margin:0 auto 14px;border-radius:14px;overflow:hidden;line-height:0;'
      + 'opacity:0;max-height:0;transition:opacity .4s ease,max-height .4s ease}'
      + '.att-baie.vu{opacity:1;max-height:260px}'
      + '.att-baie svg{display:block;width:100%;height:auto}'
      + '@keyframes abSky{0%,33%,100%{fill:#9AD7F5}43%{fill:#F59A6E}48%{fill:#7A5A8C}55%,84%{fill:#141C3A}92%{fill:#F4B98E}}'
      + '.att-baie .k-sky{animation:abSky 16s linear infinite}'
      + '@keyframes abGl{0%,40%,96%,100%{fill:#BCD6E6}52%,88%{fill:#FFCF74}}.att-baie .k-gl{animation:abGl 16s linear infinite}'
      + '@keyframes abLv{0%,33%,100%{stroke:#FFFFFF}53%,85%{stroke:#C7CCDA}}.att-baie .k-lv{animation:abLv 16s linear infinite}'
      + '@keyframes abOn{0%,44%,95%,100%{opacity:0}54%,87%{opacity:1}}.att-baie .k-on{animation:abOn 16s linear infinite}'
      + '@keyframes abOrb{from{transform:rotate(-80deg)}to{transform:rotate(280deg)}}'
      + '.att-baie .k-orb{transform-origin:190px 250px;animation:abOrb 16s linear infinite}'
      + '@keyframes abBl{50%{opacity:0}}.att-baie .k-bl{animation:abBl 1.6s steps(1) infinite}'
      + '@keyframes abYa{from{transform:translateX(400px)}to{transform:translateX(-120px)}}.att-baie .k-ya{animation:abYa 16s linear infinite}'
      + '@keyframes abSa{from{transform:translateX(-40px)}to{transform:translateX(420px)}}.att-baie .k-sa{animation:abSa 22s linear infinite}'
      + '@keyframes abHe{0%{transform:translate(-40px,80px)}100%{transform:translate(420px,30px)}}.att-baie .k-he{animation:abHe 10s linear infinite}'
      + '@keyframes abRo{to{transform:scaleX(.2)}}.att-baie .k-ro{transform-origin:13px 0;animation:abRo .25s linear infinite alternate}'
      + '@keyframes abWv{to{transform:translateX(-12px)}}.att-baie .k-wv{animation:abWv 3s ease-in-out infinite alternate}'
      + k
      + '@media (prefers-reduced-motion:reduce){.att-baie *{animation:none!important}}';
  }

  // Une rangée de lames brise-soleil : 10 ondulations, amplitude décalée d'un étage à l'autre (le drapé).
  function lame(y, a) { return '<path d="M218 ' + y + ' q7.7 ' + a + ' 15.4 0' + new Array(10).join(' t15.4 0') + '"/>'; }
  function palmes(x, y) {
    return ['q-6 -1 -8 3', 'q6 -1 8 3', 'q-3 -5 -7 -5', 'q3 -5 7 -5'].map(function (q) { return 'M' + x + ' ' + y + ' ' + q; }).join(' ');
  }
  function rects(l, w, h) { return l.map(function (p) { return '<rect x="' + p[0] + '" y="' + p[1] + '" width="' + w + '" height="' + h + '"/>'; }).join(''); }
  function arches(dx, h, r) {
    var s = ''; for (var x = 222; x <= 354; x += 22) s += 'M' + (x + dx) + ' 228 h' + (12 - 2 * dx) + ' v-' + h + ' q-' + r + ' -' + r + ' -' + (12 - 2 * dx) + ' 0 z ';
    return s;
  }

  function svg() {
    var amp = [-5, -3, 1, 3, 5, 3, -1, -3, -5, -3], lames = '';
    for (var i = 0; i < 10; i++) lames += lame(98 + 12 * i, amp[i]);
    return '<svg viewBox="0 62 380 170" aria-hidden="true" focusable="false">'
      + '<rect class="k-sky" x="0" y="0" width="380" height="270"/>'
      + '<g class="k-on" fill="#FFFFFF">' + [[22, 70, 1.3], [70, 80, 1], [118, 68, 1.3], [140, 84, 1], [205, 72, 1.3], [240, 66, 1], [20, 94, 1]]
        .map(function (c) { return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>'; }).join('') + '</g>'
      + '<g class="k-orb"><circle cx="190" cy="62" r="14" fill="#FFD23F"/><circle cx="190" cy="438" r="10" fill="#F4F1DE"/></g>'
      // montagne, ville, tours
      + '<path class="k-mt" d="M0 120 L30 100 L60 108 L95 82 L130 98 L160 90 L190 104 L220 70 L250 60 L285 48 L320 56 L350 44 L380 52 V200 H0 Z"/>'
      + '<path class="k-mt2" d="M180 140 L215 112 L245 104 L270 90 L300 96 L330 84 L380 90 V210 H180 Z"/>'
      + '<g class="k-cy2"><rect x="96" y="150" width="16" height="50"/><rect x="114" y="140" width="12" height="60"/><rect x="186" y="150" width="14" height="50"/><rect x="200" y="160" width="12" height="40"/></g>'
      + '<g class="k-tw"><path d="M158 200 V84 L166 74 L170 78 V200 Z"/><path d="M172 200 V92 L180 82 L184 86 V200 Z"/><rect x="128" y="132" width="10" height="68"/></g>'
      + '<g class="k-on" fill="#FFCF74">' + rects([[160, 96], [164, 108], [160, 124], [164, 142], [160, 160], [174, 104], [178, 120], [174, 138], [178, 156], [99, 160], [105, 176], [117, 150], [120, 168], [131, 146], [189, 164], [203, 172]], 3, 2) + '</g>'
      + '<circle class="k-bl" cx="166" cy="73" r="1.4" fill="#FF4D4D"/><circle class="k-bl" cx="180" cy="81" r="1.4" fill="#FF4D4D"/>'
      // Casino et ses dômes
      + '<g class="k-cy"><rect x="136" y="176" width="36" height="20"/><rect x="146" y="170" width="16" height="6"/></g>'
      + '<g class="k-cu"><ellipse cx="140" cy="176" rx="4" ry="5"/><ellipse cx="168" cy="176" rx="4" ry="5"/><ellipse cx="154" cy="168" rx="5" ry="4"/></g>'
      + '<g class="k-on" fill="#FFCF74">' + rects([[140, 184], [147, 184], [154, 184], [161, 184]], 3, 5) + '</g>'
      // mer, Rocher, palais, cathédrale, musée
      + '<rect class="k-sea" x="0" y="198" width="380" height="72"/>'
      + '<path class="k-rk" d="M0 160 L10 156 L82 154 L94 168 L100 198 L0 198 Z"/>'
      + '<path class="k-gr2" d="M0 158 L82 155 L84 160 L0 162 Z"/>'
      + '<g class="k-st"><rect x="34" y="140" width="40" height="15"/><path d="M34 140' + new Array(7).join(' h3 v-3 h3 v3') + ' h3 v-3 h1 v3"/>'
        + '<rect x="48" y="128" width="10" height="12"/><rect x="47" y="126" width="12" height="2"/><rect x="8" y="142" width="22" height="14"/><path d="M8 142 h22 l-11 -8 z"/>'
        + '<rect x="14" y="128" width="8" height="14"/><path d="M14 128 q4 -6 8 0 z"/><rect x="76" y="146" width="18" height="10"/><path d="M78 146 q7 -7 14 0 z"/></g>'
      + '<rect x="52.5" y="116" width="1" height="10" fill="#5F5E5A"/><rect x="53.5" y="116" width="7" height="2.5" fill="#E53935"/><rect x="53.5" y="118.5" width="7" height="2.5" fill="#FFFFFF"/>'
      + '<g class="k-on" fill="#FFCF74">' + rects([[38, 145], [43, 145], [62, 145], [67, 145], [51, 132], [11, 146], [25, 146], [82, 150], [88, 150]], 2, 4) + '</g>'
      // port : jetées, feux, yachts
      + '<path d="M98 204 H150 M184 204 H214 l6 -4" stroke="#D3D1C7" stroke-width="2.5" fill="none"/>'
      + '<circle class="k-bl" cx="150" cy="204" r="1.6" fill="#E24B4A"/><circle class="k-bl" cx="184" cy="204" r="1.6" fill="#3BB273"/>'
      + '<g fill="#FFFFFF"><path d="M104 203 h12 l-2 -3 h-8 z"/><path d="M120 203 h16 l-2 -4 h-11 z"/><path d="M138 203 h10 l-2 -3 h-6 z"/><path d="M188 203 h12 l-2 -3 h-8 z"/></g>'
      + '<g class="k-wv" stroke="#FFFFFF" stroke-width="1.2" fill="none" opacity=".55"><path d="M14 214 q6 -3 12 0 t12 0"/><path d="M60 228 q6 -3 12 0 t12 0"/><path d="M160 214 q6 -3 12 0 t12 0"/></g>'
      + '<g class="k-ya"><path d="M0 222 h44 l-7 7 h-32 z" fill="#FFFFFF"/><path d="M8 222 h28 l-4 -5 h-20 z" fill="#E8EEF3"/><path d="M14 217 h14 l-2 -3 h-10 z" fill="#FFFFFF"/><rect x="12" y="219" width="22" height="1.6" fill="#2C3E50"/></g>'
      + '<g class="k-sa"><path d="M0 212 h20 l-4 5 h-13 z" fill="#FFFFFF"/><path d="M9 212 v-16 l9 14 z" fill="#FFFFFF"/><path d="M8 212 v-12 l-6 11 z" fill="#F1EFE8"/></g>'
      // hélicoptère, nez vers la droite (sens de la marche), queue à gauche
      + '<g class="k-he"><rect x="6" y="2" width="16" height="6" rx="3" fill="#E53935"/><rect x="17" y="3" width="4" height="3" rx="1" fill="#BFE3F5"/>'
        + '<path d="M6 4 h-10 l-2 -3" stroke="#E53935" stroke-width="1.5" fill="none"/><rect class="k-ro" x="2" y="-1" width="22" height="1" fill="#444441"/>'
        + '<path d="M8 9 h12" stroke="#444441" stroke-width="1"/></g>'
      // l'hôpital : socle végétalisé aux arches, façade, toit-jardin, lames
      + '<path class="k-gr" d="M206 270 L206 218 C230 206 300 200 380 196 V270 Z"/>'
      + '<path class="k-gr2" d="M212 218 H378 V228 H212 Z"/>'
      + '<path class="k-st" d="' + arches(0, 6, 6) + '"/>'
      + '<path class="k-on" fill="#FFCF74" d="' + arches(2, 5, 4) + '"/>'
      + '<rect class="k-gl" x="220" y="92" width="152" height="122" rx="3"/>'
      + '<path class="k-gr" d="M216 92 C240 82 270 78 296 84 C326 78 352 80 376 88 V94 H216 Z"/>'
      + '<g class="k-gr2"><circle cx="232" cy="84" r="5"/><circle cx="262" cy="79" r="6"/><circle cx="314" cy="79" r="5"/><circle cx="344" cy="80" r="6"/><circle cx="366" cy="84" r="4"/></g>'
      + '<path d="M248 84 v-10 M290 82 v-12 M330 82 v-10" stroke="#8A6A45" stroke-width="1.2"/>'
      + '<path fill="none" stroke="#4C8C44" stroke-width="1.6" d="' + palmes(248, 74) + ' ' + palmes(290, 70) + ' ' + palmes(330, 72) + '"/>'
      + '<g class="k-lv" fill="none" stroke-width="2.6" stroke-linecap="round">' + lames + '</g>'
      + '<rect x="356" y="100" width="12" height="12" rx="2" fill="#E53935"/><rect x="360.5" y="102" width="3" height="8" fill="#FFFFFF"/><rect x="358" y="104.5" width="8" height="3" fill="#FFFFFF"/>'
      + '<circle class="k-gr2" cx="372" cy="210" r="7"/>'
      + '</svg>';
  }

  function poserCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style'); s.id = CSS_ID; s.textContent = css();
    (document.head || document.documentElement).appendChild(s);
  }

  var INERTE = { retirer: function () {} };

  function poser(conteneur, avant) {
    try {
      if (!conteneur) return INERTE;
      poserCss();
      var el = document.createElement('div');
      el.className = 'att-baie';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = svg();
      conteneur.insertBefore(el, (avant && avant.parentNode === conteneur) ? avant : conteneur.firstChild);
      var t = setTimeout(function () { if (el.isConnected) el.classList.add('vu'); }, SEUIL_MS);
      return {
        el: el,
        retirer: function () {
          try {
            clearTimeout(t);
            if (!el.isConnected) return;
            el.classList.remove('vu');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
          } catch (e) {}
        }
      };
    } catch (e) { return INERTE; }
  }

  /* (25/11/2026) Le dessin seul, pour la carte d'annonce de version
     (partage/annonce_version.js) : même décor, styles posés au passage.
     Exception voulue à « jamais sur l'ouverture d'une page » : la carte ne
     s'affiche qu'une fois par appareil, au passage d'une version majeure. */
  function dessin() { try { poserCss(); return svg(); } catch (e) { return ''; } }

  window.AttenteBaie = { poser: poser, SEUIL_MS: SEUIL_MS, dessin: dessin };
})();
