/* ═══ BANC — L'ACCUEIL EN BLOCS (11/10/2026, v1.21) ═══
   Maquette validée par le responsable : deux raccourcis tout en haut (ACR,
   Annuaire), puis Moi · Le service · Ressources · Réservé.

   Ce qui ne doit JAMAIS arriver :
     · un MAR voit une tuile réservée qui ne lui est pas ouverte (Comité, CRH,
       Libéral…) — la règle « qui voit quoi » reste LA ligne de filtrage d'avant ;
     · le bloc Réservé apparaît, même vide, chez un MAR sans aucun droit ;
     · la carte Mes échanges perd son comportement (compteur, pastille) ;
     · la tuile Équité n'ouvre pas le planning sur l'onglet Équité.

   index.html et planning.html sont chargés TELS QUELS dans un navigateur simulé. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function monter(fichier, largeur, hash) {
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(String(e.message).split('\n')[0]));
  const dom = new JSDOM(lire(fichier), { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/' + fichier + (hash || ''), pretendToBeVisual: true,
    beforeParse(win) {
      Object.defineProperty(win, 'innerWidth', { value: largeur || 1280, configurable: true, writable: true });
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.Element.prototype.scrollIntoView = function () {};
      win.scrollTo = () => {};
      win.eval(lire('partage/session.js'));
      win.eval(lire('partage/portail.js'));
      win.eval(lire('partage/rendu_equite.js'));
    } });
  const w = dom.window;
  if (!w.navigator.sendBeacon) w.navigator.sendBeacon = () => true;
  w.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
  return { w, D: w.document, erreurs };
}

/* Accueil d'un MAR : on pose son identité comme le ferait la connexion, puis
   on dessine les tuiles. */
function accueil(w, ident) {
  w.eval(`MY_ID = 'ALPHA'; MY_ROLE = 'mar';
    MY_TUILES = ${JSON.stringify(ident.tuiles || [])};
    MY_LIBERAL = ${!!ident.liberal};
    INDISPOS_OUVERTE = ${!!ident.campagne};
    renderTiles();`);
}
const cles = (D, bloc) => [...D.querySelectorAll('#tiles-' + bloc + ' [data-gen]')]
  .map(e => (e.getAttribute('href') || e.getAttribute('onclick') || e.id || '').toString());
const titres = (D, bloc) => [...D.querySelectorAll('#tiles-' + bloc + ' [data-gen] .tile-title')].map(e => e.textContent);
const visible = (D, id) => D.getElementById(id).style.display !== 'none';

(async () => {
  console.log('\n═══ A1. MAR sans aucun droit réservé ═══');
  {
    const { w, D, erreurs } = monter('index.html');
    await dodo(300);
    accueil(w, { tuiles: [], liberal: false });
    const racc = [...D.querySelectorAll('#raccourcis .racc')];
    V('deux raccourcis tout en haut', racc.length === 2, racc.map(e => e.textContent));
    V('le premier est l\'ACR, en rouge, vers l\'outil autonome',
      racc[0] && /ACR/.test(racc[0].textContent) && racc[0].classList.contains('rouge') && racc[0].getAttribute('href') === 'acr/');
    V('le second est l\'Annuaire', racc[1] && /Annuaire/.test(racc[1].textContent));
    V('les raccourcis viennent AVANT le premier bloc',
      !!(D.getElementById('raccourcis').compareDocumentPosition(D.getElementById('bloc-moi')) & w.Node.DOCUMENT_POSITION_FOLLOWING));
    const ordre = [...D.querySelectorAll('#tilesView .bloc')].map(b => b.id);
    V('les blocs dans l\'ordre de la maquette', JSON.stringify(ordre) === JSON.stringify(['bloc-moi', 'bloc-service', 'bloc-ressources', 'bloc-reserve']), ordre);
    V('Moi : Mes congés', JSON.stringify(titres(D, 'moi')) === JSON.stringify(['Mes congés']), titres(D, 'moi'));
    V('Le service : Planning, Équité des gardes, Staffs à venir',
      JSON.stringify(titres(D, 'service')) === JSON.stringify(['Planning', 'Équité des gardes', 'Staffs à venir']), titres(D, 'service'));
    V('Ressources : Fiches pratiques, Protocoles, Topos, Veille biblio',
      JSON.stringify(titres(D, 'ressources')) === JSON.stringify(['Fiches pratiques', 'Protocoles', 'Topos', 'Veille biblio']), titres(D, 'ressources'));
    V('AUCUNE tuile réservée dans la page', D.querySelectorAll('#tiles-reserve [data-gen]').length === 0);
    V('le bloc Réservé n\'apparaît pas du tout', !visible(D, 'bloc-reserve'));
    const html = D.getElementById('tilesView').innerHTML;
    V('aucun lien vers l\'espace comité', !/admin\.html/.test(html));
    V('aucun lien vers CRH, statistiques, guide technique, libéral',
      !/crh\.html|stats-usage|guide-technique|estimateur-liberal|suivi-liberal|absences\.html/.test(html));
    V('ACR et Annuaire ne sont PAS dupliqués en tuiles',
      D.querySelectorAll('[data-gen][href="acr/"]').length === 0 && !/openView\('annuaire'\)/.test(D.getElementById('bloc-ressources').innerHTML));
    V('la tuile Équité ouvre le planning sur l\'onglet Équité',
      !!D.querySelector('#tiles-service a[href="planning.html#equite"]'));
    V('Planning occupe toute la ligne', !!D.querySelector('#tiles-service a[href="planning.html"].large'));
    V('Mes congés, seule tuile de Moi, s\'élargit (pas de trou)',
      D.querySelector('#tiles-moi [data-gen]').classList.contains('seul'));
    V('Le service : Équité et Staffs côte à côte (aucune élargie)',
      D.querySelectorAll('#tiles-service .seul').length === 0);
    V('Ressources : 4 tuiles, aucune élargie', D.querySelectorAll('#tiles-ressources .seul').length === 0);
    V('un second dessin ne duplique rien',
      (() => { w.eval('renderTiles()'); return D.querySelectorAll('#tiles-ressources [data-gen]').length === 4 && D.querySelectorAll('#raccourcis .racc').length === 2; })());
    V('la carte Mes échanges survit au redessin', !!D.getElementById('echangesHero'));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  }

  console.log('\n═══ A2. Le bloc Réservé ne montre QUE ce qui est ouvert à ce MAR ═══');
  {
    const { w, D, erreurs } = monter('index.html');
    await dodo(300);
    accueil(w, { tuiles: ['comite', 'crh'], liberal: false });
    V('le bloc Réservé apparaît', visible(D, 'bloc-reserve'));
    V('il contient Comité puis CRH, et rien d\'autre',
      JSON.stringify(titres(D, 'reserve')) === JSON.stringify(['Comité', 'CRH']), titres(D, 'reserve'));
    V('Comité mène à l\'espace comité', !!D.querySelector('#tiles-reserve a[href="admin.html"]'));
    V('pas de statistiques ni de guide technique (non accordés)',
      !/stats-usage|guide-technique/.test(D.getElementById('tiles-reserve').innerHTML));

    accueil(w, { tuiles: ['liberal', 'consult'], liberal: false });
    V('Libéral et consultations : invisibles si le MAR n\'est pas du groupement libéral',
      D.querySelectorAll('#tiles-reserve [data-gen]').length === 0 && !visible(D, 'bloc-reserve'), titres(D, 'reserve'));
    accueil(w, { tuiles: [], liberal: true });
    V('…et invisibles pour un membre du groupement sans la tuile accordée',
      D.querySelectorAll('#tiles-reserve [data-gen]').length === 0);
    accueil(w, { tuiles: ['liberal', 'consult'], liberal: true });
    V('Libéral et Mes consultations quand les deux conditions sont réunies',
      JSON.stringify(titres(D, 'reserve')) === JSON.stringify(['Libéral', 'Mes consultations']), titres(D, 'reserve'));
    V('le Libéral garde ses deux moitiés (cotation / suivi des 30 %)',
      D.querySelectorAll('#tile-liberal .split-half').length === 2);
    V('les tuiles réservées sont en grille comme les autres blocs (v1.23, maquette A validée)', !D.getElementById('tiles-reserve').classList.contains('liste'));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  }

  console.log('\n═══ A3. Mes échanges, habillée en tuile, garde son comportement ═══');
  {
    const { w, D, erreurs } = monter('index.html');
    await dodo(300);
    accueil(w, { tuiles: [], campagne: true });
    const hero = D.getElementById('echangesHero');
    V('la carte est dans le bloc Moi, en premier', D.getElementById('tiles-moi').firstElementChild === hero);
    w.eval(`ECH_AUTORISE = true; ECH_LISTE = [{ etat:'attente', receveur:'ALPHA' }, { etat:'attente', receveur:'BRAVO' }]; majEchangesHero();`);
    V('visible quand les échanges sont ouverts', hero.style.display !== 'none');
    V('le titre annonce la demande qui m\'attend (et seulement la mienne)', /^1 demande attend/.test(D.getElementById('echHeroMain').textContent));
    V('elle passe au rouge', hero.classList.contains('attente'));
    V('la pastille porte le nombre', D.getElementById('echPastille').style.display !== 'none' && D.getElementById('echPastille').textContent === '1');
    V('Mes échanges + Mes congés côte à côte : aucune élargie',
      [...D.querySelectorAll('#tiles-moi > *')].filter(e => e.style.display !== 'none' && !e.classList.contains('large')).every(e => !e.classList.contains('seul')));
    V('Mes indisponibilités (campagne) occupe sa ligne', !!D.querySelector('#tiles-moi a[href="indispos.html"].large'));
    w.eval(`ECH_LISTE = []; majEchangesHero();`);
    V('plus de demande : retour au titre normal, sans rouge ni pastille',
      /Mes échanges/.test(D.getElementById('echHeroMain').textContent) && !hero.classList.contains('attente') && D.getElementById('echPastille').style.display === 'none');
    w.eval(`ECH_AUTORISE = false; majEchangesHero();`);
    V('échanges fermés : la carte disparaît et Mes congés s\'élargit',
      hero.style.display === 'none' && D.querySelector('#tiles-moi a[href="indispos.html"], #tiles-moi [data-gen]:not(.large)').classList.contains('seul'));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  }

  console.log('\n═══ A4. Toute icône de l\'accueil existe dans le paquet local ═══');
  {
    const src = lire('index.html'), bundle = lire('assets/vendor/lucide-icons.js');
    for (const n of ['scale', 'shield', 'heart-pulse', 'phone', 'repeat']) V(`icône « ${n} » présente`, bundle.indexOf('"' + n + '":[') > -1);
    V('le paquet d\'icônes est appelé à une adresse NOUVELLE (sinon le téléphone ressert l\'ancien)',
      /assets\/vendor\/lucide-icons\.js\?v=2"/.test(src));
  }

  console.log('\n═══ A5. planning.html#equite ouvre l\'onglet Équité ═══');
  {
    const src = lire('planning.html');
    const init = (src.match(/async function init\(loginYear\)\{[\s\S]*?\n\}/) || [''])[0];
    V('l\'ouverture demandée est faite À LA FIN du démarrage (données chargées)',
      /setMainView\('annee'\);\s*updateHeaderSteppers\(\);\s*ouvrirVueDemandee\(\);\s*\}$/.test(init));
    const essai = (hash, mobile) => {
      const { w, erreurs } = monter('planning.html', mobile ? 390 : 1280, hash);
      w.eval(`window.__vue = null;
        setMainView = v => { window.__vue = 'pc:' + v; };
        mobileSetView = v => { window.__vue = 'tel:' + v; };
        isMobile = ${!!mobile};`);
      const r = w.eval('ouvrirVueDemandee()');
      return { r, vue: w.__vue, erreurs };
    };
    let e = essai('#equite', false);
    V('ordinateur : #equite → onglet Équité', e.vue === 'pc:equite', e);
    e = essai('#equite', true);
    V('téléphone : #equite → onglet Équité de la barre du bas', e.vue === 'tel:equite', e);
    e = essai('#secteurs', false);
    V('#secteurs → onglet Secteurs', e.vue === 'pc:affect', e);
    e = essai('#annee', true);
    V('#annee → onglet Année', e.vue === 'tel:annee', e);
    e = essai('', false);
    V('sans adresse : rien ne change (onglet Planning)', e.vue === null && e.r === null, e);
    e = essai('#nimportequoi', false);
    V('adresse inconnue : rien ne change', e.vue === null, e);
    V('aucune erreur JavaScript au chargement', e.erreurs.length === 0, e.erreurs.slice(0, 2));
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
