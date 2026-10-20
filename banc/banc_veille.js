/* ═══ BANC — VEILLE BIBLIOGRAPHIQUE ═══
   Défaut trouvé à la PREMIÈRE collecte réelle (08/08/2026) : la suppression
   de la liste blanche de types, justifiée pour les 23 revues d'anesthésie-
   réanimation, avait aussi été appliquée aux 18 généralistes. Résultat :
   axe croisé 1 040 articles/180 j au lieu de ~31/90 j, total 114/semaine
   pour une cible de 50-80.
   Ici on exécute le VRAI gas/veille.gs et on lit les requêtes envoyées à
   PubMed : la liste blanche doit figurer dans l'axe croisé, et SEULEMENT là. */
const vm = require('vm'), fs = require('fs');
const { Classeur } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const BLANCHE = '"Randomized Controlled Trial"[Publication Type]';
const NOIRE   = '"editorial"[Publication Type]';

/* Monte un monde où UrlFetchApp répond à esearch/esummary selon `plan`,
   en gardant la trace de chaque requête. */

/* (15/09/2026) Une fiche PubMed au format efetch XML, comme le vrai PubMed la rend. */
function ficheXml(pmid, o) {
  o = o || {};
  const auteurs = (o.auteurs || []).map(a => '<Author><LastName>' + a.split(' ')[0] + '</LastName><Initials>' + (a.split(' ')[1] || '') + '</Initials></Author>').join('');
  const types = (o.pubtypes || ['Journal Article']).map(t => '<PublicationType UI="D016428">' + t + '</PublicationType>').join('');
  const mesh = (o.mesh || []).map(m => '<MeshHeading><DescriptorName>' + m + '</DescriptorName></MeshHeading>').join('');
  const kw = (o.motscles || []).map(k => '<Keyword>' + k + '</Keyword>').join('');
  const d = (o.date || '2026-09-01').split('-');
  return '<PubmedArticle><MedlineCitation><PMID Version="1">' + pmid + '</PMID><Article PubModel="Print">'
    + '<Journal><ISOAbbreviation>' + (o.revue || 'Anesthesiology') + '</ISOAbbreviation><Title>' + (o.revue || 'Anesthesiology') + '</Title>'
    + '<JournalIssue><PubDate><Year>' + d[0] + '</Year><Month>' + d[1] + '</Month><Day>' + d[2] + '</Day></PubDate></JournalIssue></Journal>'
    + '<ArticleTitle>' + (o.titre || 'Article ' + pmid) + '</ArticleTitle>'
    + (o.resume ? '<Abstract><AbstractText Label="RESULTS">' + o.resume + '</AbstractText></Abstract>' : '')
    + '<AuthorList>' + auteurs + '</AuthorList><PublicationTypeList>' + types + '</PublicationTypeList></Article>'
    + '<MeshHeadingList>' + mesh + '</MeshHeadingList><KeywordList>' + kw + '</KeywordList></MedlineCitation>'
    + '<PubmedData><ArticleIdList><ArticleId IdType="pubmed">' + pmid + '</ArticleId>' + (o.doi ? '<ArticleId IdType="doi">' + o.doi + '</ArticleId>' : '') + '</ArticleIdList></PubmedData></PubmedArticle>';
}
function efetchXml(params, fabrique) {
  return '<?xml version="1.0"?><PubmedArticleSet>' + (params.get('id') || '').split(',').filter(Boolean).map(id => ficheXml(id, fabrique ? fabrique(id) : {})).join('') + '</PubmedArticleSet>';
}
function monde(plan) {
  const props = {};   // (15/09) propriétés du script (VEILLE_DERNIER_SUCCES)
  const requetes = [];
  const journal = [];
  const ctx = vm.createContext({
    console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN, parseInt, encodeURIComponent,
    SpreadsheetApp: { getActiveSpreadsheet: () => monde.cl },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ onWeekDay: () => ({ atHour: () => ({ create: () => {} }) }) }) }), WeekDay: { MONDAY: 1 }, deleteTrigger: () => {} },
    Utilities: { sleep: ms => pauses.push(ms), formatDate: () => new Date().toISOString().slice(0, 10) },   // (15/09) la vraie date : la fenêtre des résumés en dépend
    Logger: { log: m => journal.push(String(m)) },
    _isoDate: v => String(v || ''),
    _bat_: nom => battements.push(nom),
    logAction: m => logs.push(String(m)),
    _configRows_: () => [['CLE', 'VALEUR']],
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    getAnthropicToken: () => monde.jetonIA === undefined ? 'sk-test' : monde.jetonIA,   // (15/09) passe 4
    UrlFetchApp: { fetch: (url, opt) => {
      if (/api\.anthropic\.com/.test(String(url))) {   // (15/09) l'API de résumé : réponse programmable
        const body = JSON.parse(opt.payload); appelsIA.push(body);
        const rep = monde.ia ? monde.ia(body) : { code: 200, texte: 'Résumé de test en deux phrases. Seconde phrase.' };
        return { getResponseCode: () => rep.code || 200, getContentText: () => JSON.stringify({ content: [{ type: 'text', text: rep.texte || '' }] }) };
      }
      const params = new URLSearchParams(opt.payload);
      const endpoint = url.split('/').pop();
      requetes.push({ endpoint, term: params.get('term') || '', id: params.get('id') || '' });
      // (15/09) codes HTTP programmables : monde.codes est une file de codes à servir avant les 200
      const code = (monde.codes && monde.codes.length) ? monde.codes.shift() : 200;
      // (15/09) efetch rend du XML brut : le plan peut rendre une chaîne, servie telle quelle
      const rep = code === 200 ? plan(endpoint, params) : null;
      return { getResponseCode: () => code, getContentText: () => code === 200 ? (typeof rep === 'string' ? rep : JSON.stringify(rep)) : 'Too Many Requests' };
    } },
  });
  const pauses = [], battements = [], logs = [], appelsIA = []; ctx.__pauses = pauses; ctx.__props = props; ctx.__battements = battements; ctx.__logs = logs;
  ctx.globalThis = ctx;
  monde.cl = new Classeur();
  vm.runInContext(fs.readFileSync('../gas/veille.gs', 'utf8'), ctx);
  return { ctx, requetes, journal, cl: monde.cl, pauses, battements, logs, props, appelsIA };
}

(async () => {
  console.log('\n═══ 1. La configuration par défaut porte la liste blanche ═══');
  {
    const { ctx } = monde(() => ({}));
    vm.runInContext('getOrCreateVeilleTabs()', ctx);
    const cfg = vm.runInContext('_readVeilleCfg()', ctx);
    V('les lignes PUBTYPE sont relues (5 types)', cfg.pubtypes.length === 5, cfg.pubtypes);
    V('essai randomisé, méta-analyse, revue systématique, recommandations',
      ['Randomized Controlled Trial', 'Meta-Analysis', 'Systematic Review', 'Practice Guideline', 'Guideline']
        .every(t => cfg.pubtypes.indexOf(t) !== -1), cfg.pubtypes);
    const clause = vm.runInContext('_veilleListeBlanche(_readVeilleCfg())', ctx);
    V('la clause assemble les 5 types en OU', (clause.match(/\[Publication Type\]/g) || []).length === 5 && clause.indexOf(BLANCHE) !== -1, clause);
    V('les 23 revues directes et 18 croisées sont toujours là', cfg.revues.length === 23 && cfg.general.length === 18, [cfg.revues.length, cfg.general.length]);
  }

  console.log('\n═══ 2. Le défaut du 08/08 : la liste blanche ne bride QUE l\'axe croisé ═══');
  {
    /* PubMed simulé : l'axe croisé SANS liste blanche rendrait 1 040 articles
       (le chiffre mesuré en production). Avec, il en rend 12. */
    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const term = params.get('term') || '';
        const direct  = term.indexOf('"Anesthesiology"[Journal]') !== -1;
        const general = term.indexOf('"N Engl J Med"[Journal]') !== -1;
        if (direct && general) return { esearchresult: { count: '0', idlist: [] } };       // étiquetage par thème
        if (direct)  return { esearchresult: { count: '3', idlist: ['101', '102', '103'] } };
        if (general) {
          if (term.indexOf(BLANCHE) === -1) {                                              // RÉGRESSION : sans bride
            const ids = []; for (let i = 0; i < 1000; i++) ids.push(String(2000 + i));
            return { esearchresult: { count: '1040', idlist: ids } };
          }
          return { esearchresult: { count: '1', idlist: ['201'] } };
        }
        return { esearchresult: { count: '0', idlist: [] } };
      }
      if (endpoint === 'efetch.fcgi') return efetchXml(params, id => ({ titre: 'Article ' + id, revue: 'Rev' }));   // (15/09) fiches en XML
      return {};
    };
    const { ctx, requetes, journal } = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', ctx);
    const res = vm.runInContext('runVeille()', ctx);

    const qDirect  = requetes.filter(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"Anesthesiology"[Journal]') !== -1 && q.term.indexOf('"N Engl J Med"[Journal]') === -1);
    const qGeneral = requetes.filter(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"N Engl J Med"[Journal]') !== -1 && q.term.indexOf('"Anesthesiology"[Journal]') === -1);
    V('une requête par axe est bien partie', qDirect.length === 1 && qGeneral.length === 1, [qDirect.length, qGeneral.length]);
    V('l\'axe croisé PORTE la liste blanche', qGeneral.length && qGeneral[0].term.indexOf(BLANCHE) !== -1);
    V('l\'axe direct N\'EN porte AUCUNE', qDirect.length && qDirect[0].term.indexOf(BLANCHE) === -1, qDirect.length && qDirect[0].term.slice(0, 200));
    V('la liste NOIRE reste sur les deux axes', qDirect.length && qGeneral.length && qDirect[0].term.indexOf(NOIRE) !== -1 && qGeneral[0].term.indexOf(NOIRE) !== -1);
    V('résultat : axe croisé bridé (1 article, pas 1 040)', res.axeCroise === 1, res.axeCroise);
    V('le total en articles/semaine est calculé et rendu', typeof res.parSemaine === 'number' && res.parSemaine < 80, res.parSemaine);
    V('le journal annonce le total par semaine et la cible', journal.some(l => l.indexOf('articles/semaine') !== -1 && l.indexOf('cible 50-80') !== -1), journal.slice(-3));
    V('le journal détaille chaque axe en /sem', journal.some(l => l.indexOf('/sem') !== -1 && l.indexOf('axe direct') !== -1), journal.slice(-3));
  }

  console.log('\n═══ 3. Liste blanche vidée : l\'axe croisé tourne mais le journal prévient ═══');
  {
    const { ctx, requetes, journal, cl } = monde(() => ({ esearchresult: { count: '0', idlist: [] }, result: {} }));
    vm.runInContext('getOrCreateVeilleTabs()', ctx);
    const feuille = cl.getSheetByName('VEILLE_CFG');
    feuille.lignes = feuille.lignes.filter(l => String(l[0]).toUpperCase() !== 'PUBTYPE');
    const cfg = vm.runInContext('_readVeilleCfg()', ctx);
    V('plus aucune ligne PUBTYPE lue', cfg.pubtypes.length === 0, cfg.pubtypes);
    vm.runInContext('runVeille()', ctx);
    const qGeneral = requetes.filter(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"N Engl J Med"[Journal]') !== -1 && q.term.indexOf('"Anesthesiology"[Journal]') === -1);
    V('l\'axe croisé part quand même, sans bride', qGeneral.length === 1 && qGeneral[0].term.indexOf(BLANCHE) === -1, qGeneral.length);
    V('mais le journal crie', journal.some(l => l.indexOf('PUBTYPE') !== -1 && l.indexOf('⚠️') !== -1), journal.slice(0, 3));
  }

  console.log('\n═══ 4. veilleReinitConfig réécrit bien les lignes PUBTYPE ═══');
  {
    const { ctx, cl } = monde(() => ({}));
    vm.runInContext('getOrCreateVeilleTabs()', ctx);
    const feuille = cl.getSheetByName('VEILLE_CFG');
    feuille.lignes = feuille.lignes.filter(l => String(l[0]).toUpperCase() !== 'PUBTYPE');   // ancienne config
    vm.runInContext('veilleReinitConfig()', ctx);
    const cfg = vm.runInContext('_readVeilleCfg()', ctx);
    V('après réécriture, les 5 types sont revenus', cfg.pubtypes.length === 5, cfg.pubtypes);
  }

  console.log('\n═══ 5. Contrat SOURCE : les codes que index.html filtre, rien d\'autre ═══');
  {
    /* Défaut du 08/08 (15 h 44) : la refonte écrivait 'Revue'/'Généraliste',
       le filtre source de l'écran compare à 'REVUE'/'GENERAL'/'THEME' →
       aucun article affiché hors « Toutes sources ». Ici on lit le VRAI
       index.html pour extraire les codes du filtre, et on exige que
       getVeille ne serve QUE ces codes-là. */
    const html = fs.readFileSync('../index.html', 'utf8');
    const bloc = html.slice(html.indexOf('onVSource'), html.indexOf('vThemeSel'));
    const codes = [];
    (html.match(/onchange="onVSource[\s\S]{0,400}?<\/select>/) || [''])[0]
      .replace(/<option value="([^"]+)"/g, (m, v) => { codes.push(v); return m; });
    V('le filtre de l\'écran expose bien des codes', codes.length >= 2 && codes.indexOf('REVUE') !== -1 && codes.indexOf('GENERAL') !== -1, codes);

    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const term = params.get('term') || '';
        const direct  = term.indexOf('"Anesthesiology"[Journal]') !== -1;
        const general = term.indexOf('"N Engl J Med"[Journal]') !== -1;
        if (direct && general) return { esearchresult: { count: '0', idlist: [] } };
        if (direct)  return { esearchresult: { count: '2', idlist: ['301', '302'] } };
        if (general) return { esearchresult: { count: '1', idlist: ['401'] } };
        return { esearchresult: { count: '0', idlist: [] } };
      }
      if (endpoint === 'efetch.fcgi') return efetchXml(params, id => ({ titre: 'A' + id, revue: 'Rev' }));   // (15/09) fiches en XML
      return {};
    };
    const { ctx, cl } = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', ctx);
    vm.runInContext('runVeille()', ctx);
    const feuille = cl.getSheetByName('VEILLE');
    const colSrc = feuille.lignes.slice(1).map(l => l[6]);
    V('runVeille écrit les codes (REVUE×2, GENERAL×1)', colSrc.filter(v => v === 'REVUE').length === 2 && colSrc.filter(v => v === 'GENERAL').length === 1, colSrc);
    // Lignes héritées du réglage fautif (les 2 044 du 08/08) : normalisées à la lecture
    feuille.appendRow(['500', '2026-07-01', 'Hérité 1', '', 'NEJM', '', 'Généraliste', '', '', 'N', 'N', '2026-08-08', '', '']);
    feuille.appendRow(['501', '2026-07-02', 'Hérité 2', '', 'BJA',  '', 'Revue',       '', '', 'N', 'N', '2026-08-08', '', '']);
    const g = vm.runInContext('getVeille()', ctx);
    const sources = g.items.map(i => i.source);
    V('getVeille traduit les libellés hérités en codes', sources.indexOf('Généraliste') === -1 && sources.indexOf('Revue') === -1, sources);
    V('chaque source servie est un code que l\'écran sait filtrer', sources.every(v => codes.indexOf(v) !== -1), sources);
    const h1 = g.items.find(i => i.pmid === '500'), h2 = g.items.find(i => i.pmid === '501');
    V('Généraliste → GENERAL, Revue → REVUE', h1 && h1.source === 'GENERAL' && h2 && h2.source === 'REVUE', [h1 && h1.source, h2 && h2.source]);
  }

  console.log('\n═══ 6. Dates : epubdate au jour près prime, sinon repli (défaut des blocs par revue) ═══');
  {
    /* Mesuré le 08/08 : 925/2 044 articles datés au « 01 » par sortpubdate
       → blocs par revue à l'écran. epubdate au jour près pour 27/30. */
    const { ctx } = monde(() => ({}));
    const d = o => vm.runInContext('_veilleDatePub(' + JSON.stringify(o) + ')', ctx);
    V('epubdate "2026 Feb 7" prime sur le sortpubdate au 01',
      d({ epubdate: '2026 Feb 7', sortpubdate: '2026/06/01 00:00' }) === '2026-02-07',
      d({ epubdate: '2026 Feb 7', sortpubdate: '2026/06/01 00:00' }));
    V('jour sur un chiffre → zéro devant', d({ epubdate: '2026 Jun 1' }) === '2026-06-01', d({ epubdate: '2026 Jun 1' }));
    V('epubdate vide → repli sortpubdate', d({ epubdate: '', sortpubdate: '2026/04/01 00:00' }) === '2026-04-01');
    V('epubdate au mois seul ("2026 Feb") → repli', d({ epubdate: '2026 Feb', sortpubdate: '2026/05/01 00:00' }) === '2026-05-01');
    V('epubdate exotique ("2026 Jan-Feb") → repli', d({ epubdate: '2026 Jan-Feb', sortpubdate: '2026/05/01 00:00' }) === '2026-05-01');
    V('rien du tout → chaîne vide', d({}) === '');
  }

  console.log('\n═══ 7. Filtre par revues cochées (v1.29) — piloté au clic dans la vraie page ═══');
  {
    const { JSDOM, VirtualConsole } = require('jsdom');
    const vcons = new VirtualConsole(); const erreurs = [];
    vcons.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(fs.readFileSync('../index.html', 'utf8'), {
      runScripts: 'dangerously', virtualConsole: vcons,
      url: 'https://planningmedic.github.io/index.html', pretendToBeVisual: true,
      beforeParse(win) {
        win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));   // (14/09/2026) le socle commun, servi comme le vrai site
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
      } });
    const w = dom.window;
    w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });
    await new Promise(r => setTimeout(r, 400));
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));

    /* Trois articles, deux revues. VEILLE_ITEMS est un `let` de page,
       invisible depuis w.* : on passe par le chemin PUBLIC — miroirRead
       remplacée (déclaration `function`, donc propriété de window),
       puis le vrai openVeille(). (v1.30 : openVeille lit DEUX clés miroir.) */
    w.miroirRead = async () => ({ success:true, data: {
      veille: { success:true, count:3, enrich:false, items: [
        { pmid:'1', date:'2026-08-01', titre:'Un',    auteurs:'', revue:'Anesthesiology', doi:'', source:'REVUE', score:null, resume:'', lu:false, star:false, ajoute:'', pubtype:'', themes:[] },
        { pmid:'2', date:'2026-08-02', titre:'Deux',  auteurs:'', revue:'Crit Care',      doi:'', source:'REVUE', score:null, resume:'', lu:false, star:false, ajoute:'', pubtype:'', themes:[] },
        { pmid:'3', date:'2026-08-03', titre:'Trois', auteurs:'', revue:'Anesthesiology', doi:'', source:'REVUE', score:null, resume:'', lu:false, star:false, ajoute:'', pubtype:'', themes:['NVPO'] },
      ] },
      veille_marques: { parMar: {} },
    } });
    await w.openVeille();
    const panneau = w.document.getElementById('vRevPanel');
    const cases = panneau.querySelectorAll('input[type=checkbox]');
    V('le panneau liste les 2 revues présentes', cases.length === 2, cases.length);
    V('rien de coché → 3 cartes affichées', w.document.querySelectorAll('.veille-card').length === 3);
    V('le bouton dit simplement « Revues » quand rien n\'est coché (v1.29)', w.document.getElementById('vRevBtn').textContent === 'Revues' && !w.document.getElementById('vRevBtn').classList.contains('actif'), w.document.getElementById('vRevBtn').textContent);

    // On coche Anesthesiology, AU CLIC.
    const caseAnesth = [...cases].find(c => c.value === 'Anesthesiology');
    caseAnesth.click();
    V('cocher une revue → 2 cartes, la bonne revue', w.document.querySelectorAll('.veille-card').length === 2
      && [...w.document.querySelectorAll('.vc-journal')].every(el => el.textContent === 'Anesthesiology'));
    V('le bouton annonce le compte et passe en couleur', w.document.getElementById('vRevBtn').textContent === '1 revue' && w.document.getElementById('vRevBtn').classList.contains('actif'), w.document.getElementById('vRevBtn').textContent);
    V('le choix est mémorisé sur l\'appareil', w.localStorage.getItem('pmVeilleRevues') === '["Anesthesiology"]', w.localStorage.getItem('pmVeilleRevues'));

    // « Toutes les revues » remet tout.
    panneau.querySelector('.vrev-clear').click();
    V('« Toutes les revues » → 3 cartes et mémoire vidée', w.document.querySelectorAll('.veille-card').length === 3
      && w.localStorage.getItem('pmVeilleRevues') === '[]');

    // Cumul avec le filtre thème : Anesthesiology cochée ET thème NVPO
    // → seul l'article 3 (Anesthesiology + NVPO) reste.
    [...panneau.querySelectorAll('input[type=checkbox]')].find(c => c.value === 'Anesthesiology').click();
    w.onVTheme('NVPO');
    V('cumul revue + thème → seule la carte qui a les deux', w.document.querySelectorAll('.veille-card').length === 1
      && /Trois/.test(w.document.querySelector('.vc-title').textContent));
  }

  console.log('\n═══ 8. Lu/★ PAR MAR (GAS) : deux collègues ne se marchent plus dessus ═══');
  {
    const plan = () => ({ esearchresult: { count: '0', idlist: [] }, result: {} });
    const { ctx, cl } = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', ctx);
    const feuille = cl.getSheetByName('VEILLE');
    feuille.appendRow(['700', '2026-08-01', 'Article commun', '', 'BJA', '', 'REVUE', '', '', 'N', 'N', '2026-08-08', '', '']);
    ctx.__A = { id: 'BOISSY' }; ctx.__B = { id: 'SUBLET' };

    // Sans identité : refus.
    let r = vm.runInContext("markVeille('700','lu',true)", ctx);
    V('markVeille SANS identité est refusé', r.success === false && /identité/.test(r.error), r);

    // A marque lu, B marque ★ — même article.
    r = vm.runInContext("markVeille('700','lu',true, __A)", ctx);
    V('BOISSY marque « lu »', r.success === true, r);
    r = vm.runInContext("markVeille('700','star',true, __B)", ctx);
    V('SUBLET marque « ★ »', r.success === true, r);

    const parMar = vm.runInContext('_veilleMarquesParMar()', ctx);
    V('chacun sa ligne : BOISSY lu, pas ★', parMar.BOISSY && parMar.BOISSY.lus[0] === '700' && parMar.BOISSY.stars.length === 0, parMar.BOISSY);
    V('SUBLET ★, pas lu', parMar.SUBLET && parMar.SUBLET.stars[0] === '700' && parMar.SUBLET.lus.length === 0, parMar.SUBLET);

    // getVeille fusionne les marques DU MAR passé (repli GAS du dashboard).
    let g = vm.runInContext('getVeille(__A)', ctx);
    let it = g.items.find(i => i.pmid === '700');
    V('getVeille(BOISSY) : lu=vrai, ★=faux', it && it.lu === true && it.star === false, it && [it.lu, it.star]);
    g = vm.runInContext('getVeille(__B)', ctx);
    it = g.items.find(i => i.pmid === '700');
    V('getVeille(SUBLET) : lu=faux, ★=vrai — la marque de BOISSY ne déteint pas', it && it.lu === false && it.star === true, it && [it.lu, it.star]);
    g = vm.runInContext('getVeille()', ctx);
    it = g.items.find(i => i.pmid === '700');
    V('getVeille() SANS user (instantané miroir) : marques neutres', it && it.lu === false && it.star === false);

    // Idempotence + repentir.
    vm.runInContext("markVeille('700','lu',true, __A)", ctx);
    vm.runInContext("markVeille('700','lu',false, __A)", ctx);
    const pm2 = vm.runInContext('_veilleMarquesParMar()', ctx);
    V('re-poser puis retirer : plus de « lu », pas de ligne dupliquée', (!pm2.BOISSY || pm2.BOISSY.lus.length === 0)
      && cl.getSheetByName('VEILLE_MARQUES').lignes.filter(l => l[0] === 'BOISSY' && String(l[1]) === '700').length === 1, pm2.BOISSY);

    r = vm.runInContext("markVeille('999999','lu',true, __A)", ctx);
    V('PMID inconnu : refusé (article introuvable)', r.success === false && /introuvable/.test(r.error), r);

    // Les colonnes LU/STAR partagées de VEILLE sont mortes : getVeille les ignore.
    feuille.lignes[1][9] = 'O'; feuille.lignes[1][10] = 'O';
    g = vm.runInContext('getVeille()', ctx);
    it = g.items.find(i => i.pmid === '700');
    V('les anciennes colonnes partagées ne sont PLUS lues', it && it.lu === false && it.star === false);
  }

  console.log('\n═══ 9. File locale des marques (v1.30) : rien ne se perd, même téléphone verrouillé ═══');
  {
    const { JSDOM, VirtualConsole } = require('jsdom');
    const faireDom = (transportOk, envois, graine) => {
      const vcons = new VirtualConsole();
      const dom = new JSDOM(fs.readFileSync('../index.html', 'utf8'), {
        runScripts: 'dangerously', virtualConsole: vcons,
        url: 'https://planningmedic.github.io/index.html', pretendToBeVisual: true,
        beforeParse(win) {
          win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));   // (14/09/2026) le socle commun, servi comme le vrai site
          win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
          win.Element.prototype.scrollIntoView = function () {}; win.scrollTo = () => {};
        } });
      const w = dom.window;
      if (graine) Object.keys(graine).forEach(k => w.localStorage.setItem(k, graine[k]));
      w.fetch = async () => ({ ok:true, json: async () => ({ success:false }) });   // pas de miroir
      // apiPost remplacée : capture des envois, succès selon transportOk.
      w.apiPost = async (p) => {
        if (p.action === 'getVeille') return { success:true, count:1, enrich:false, items:[
          { pmid:'800', date:'2026-08-01', titre:'Art', auteurs:'', revue:'BJA', doi:'', source:'REVUE', score:null, resume:'', lu:false, star:false, ajoute:'', pubtype:'', themes:[] }] };
        if (p.action === 'markVeille') { if (!transportOk()) throw new Error('transport mort'); envois.push(p); return { success:true }; }
        return { success:true };
      };
      return w;
    };

    // Acte 1 : transport MORT — on marque, la file retient, l'écran est à jour.
    let envois1 = [];
    const w1 = faireDom(() => false, envois1, null);
    await new Promise(r => setTimeout(r, 350));
    await w1.openVeille();
    w1.toggleV('800', 'lu'); w1.toggleV('800', 'star');
    await new Promise(r => setTimeout(r, 50));
    V('transport mort : rien ne part', envois1.length === 0);
    const file1 = JSON.parse(w1.localStorage.getItem('pmVeilleFile') || '[]');
    V('mais la file locale retient les 2 marques', file1.length === 2, file1);
    const compteur1 = w1.document.getElementById('veilleCount').textContent;
    V('l\'écran montre déjà « 0 non lus » (optimisme, transport mort compris)', /0 non lus/.test(compteur1), compteur1);

    // Acte 2 : « téléphone rouvert » — nouvelle page, MÊME localStorage, transport VIVANT.
    let envois2 = [];
    const w2 = faireDom(() => true, envois2, { pmVeilleFile: w1.localStorage.getItem('pmVeilleFile') });
    await new Promise(r => setTimeout(r, 350));
    await w2.openVeille();
    await new Promise(r => setTimeout(r, 80));
    V('à la réouverture, les 2 marques PARTENT au serveur', envois2.filter(e => e.action === 'markVeille').length === 2, envois2);
    V('et la file locale se vide', JSON.parse(w2.localStorage.getItem('pmVeilleFile') || '[]').length === 0);
    V('la marque rejouée porte les bons champs', envois2.some(e => e.pmid === '800' && e.field === 'lu' && e.value === true), envois2);

    // Deux gestes contraires sur le même champ : une seule entrée, le dernier gagne.
    w2.toggleV('800', 'lu');   // false (était true après rejeu... l'écran : true → false)
    w2.toggleV('800', 'lu');   // true
    const f2 = JSON.parse(w2.localStorage.getItem('pmVeilleFile') || '[]');
    V('même champ retouché : une seule entrée en file (le dernier geste)', f2.filter(m => m.pmid === '800' && m.field === 'lu').length <= 1, f2);

    // L'option morte « Thèmes » a quitté le menu sources.
    const opts = [...w2.document.querySelectorAll('select.vsel option')].map(o => o.value);
    V('l\'option « THEME » du menu sources est retirée', opts.indexOf('THEME') === -1, opts);
    V('REVUE et GENERAL, elles, restent', opts.indexOf('REVUE') !== -1 && opts.indexOf('GENERAL') !== -1);
  }

    console.log('\n═══ Le lundi 6 h de PubMed : HTTP 429 (production, 31/08, 07/09, 14/09) ═══');
  /* Le passage plantait au 23e appel — un par thème — sur « Too Many Requests », et
     n'écrivait rien ; le battement de cœur, écrit en tête de fonction, restait vert. */
  {
    const plan = (endpoint, params) => endpoint === 'esearch.fcgi' ? { esearchresult: { count: '1', idlist: ['99999001'] } }
      : efetchXml(params, () => ({ titre: 'Essai', date: '2026-09-10', revue: 'Anesthesiology' }));
    const m = monde(plan); monde.codes = [429, 429];   // les deux premiers appels : refusés, puis tout passe
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    const r = vm.runInContext('runVeille()', m.ctx);
    V('deux 429 successifs : la veille réessaie et aboutit', r && r.success === true, r);
    V('…après des pauses croissantes (3 s puis 8 s), pas immédiatement', m.pauses.includes(3000) && m.pauses.includes(8000), m.pauses.slice(0, 4));
    V('le battement de cœur est écrit UNE fois, à la fin, après le succès', m.battements.length === 1 && m.battements[0] === 'runVeille');
    V('une ligne est laissée dans LOGS avec le bilan', m.logs.some(l => /^veille — \d+ nouveaux, \d+ écrits/.test(l)), m.logs);
    const m2 = monde(plan); monde.codes = [429, 429, 429, 429];   // quatre refus : on renonce
    vm.runInContext('getOrCreateVeilleTabs()', m2.ctx);
    let err = null; try { vm.runInContext('runVeille()', m2.ctx); } catch (e) { err = e.message; }
    V('quatre 429 : l\'erreur remonte (Google la montre dans Exécutions), avec le nombre d\'essais', /HTTP 429 après 4 essais/.test(err || ''), err);
    V('…et AUCUN battement : le Diagnostic verra la veille en retard', m2.battements.length === 0, m2.battements);
    V('…mais une ligne LOGS dit l\'échec', m2.logs.some(l => /^veille — ÉCHEC : PubMed/.test(l)), m2.logs);
    V('une erreur non passagère (HTTP 400) ne fait pas réessayer', (() => { const m3 = monde(plan); monde.codes = [400]; vm.runInContext('getOrCreateVeilleTabs()', m3.ctx); try { vm.runInContext('runVeille()', m3.ctx); } catch (e) { return /HTTP 400$/.test(e.message) && !m3.pauses.includes(3000); } return false; })());
    monde.codes = [];
  }

  console.log('\n═══ Frugal et pertinent (15/09/2026) : fiches en un appel, thèmes locaux, note expliquée ═══');
  {
    const fabrique = id => ({
      '701': { titre: 'Prone Positioning in <i>ARDS</i>: a Randomized Trial', resume: 'Mechanical ventilation and prone positioning in acute respiratory distress syndrome. Norepinephrine dose was recorded.', pubtypes: ['Journal Article', 'Randomized Controlled Trial', 'Multicenter Study'], auteurs: ['Guerin C', 'Reignier J', 'Richard JC', 'Beuret P'], doi: '10.1000/x701', date: '2026-09-10', revue: 'Anesthesiology' },
      '702': { titre: 'Letter to the editor on airway management', pubtypes: ['Letter'], date: '2026-08-01', revue: 'Anesthesiology' },
      '703': { titre: 'Study protocol for a trial of sepsis bundles', resume: 'sepsis and septic shock', pubtypes: ['Journal Article'], date: '2026-09-01', revue: 'Anesthesiology' },
      '801': { titre: 'Delirium after surgery: systematic review', resume: 'postoperative cognitive outcomes', pubtypes: ['Systematic Review'], mesh: ['Delirium'], date: '2026-09-05', revue: 'N Engl J Med' },
    }[id] || {});
    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const term = params.get('term') || '';
        if (term.indexOf('"Anesthesiology"[Journal]') !== -1 && term.indexOf('"N Engl J Med"[Journal]') === -1) return { esearchresult: { count: '3', idlist: ['701', '702', '703'] } };
        if (term.indexOf('"N Engl J Med"[Journal]') !== -1) return { esearchresult: { count: '1', idlist: ['801'] } };
        return { esearchresult: { count: '0', idlist: [] } };
      }
      return efetchXml(params, fabrique);
    };
    const m = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    const res = vm.runInContext('runVeille()', m.ctx);
    const esearch = m.requetes.filter(q => q.endpoint === 'esearch.fcgi').length, efetch = m.requetes.filter(q => q.endpoint === 'efetch.fcgi').length;
    V('DEUX requêtes esearch (une par axe), plus AUCUNE par thème', esearch === 2, esearch);
    V('les fiches viennent d\'efetch, en un lot', efetch === 1 && m.requetes.every(q => q.endpoint !== 'esummary.fcgi'), efetch);
    const f = m.cl.getSheetByName('VEILLE'); const L = f.lignes.slice(1); const par = {}; L.forEach(l => { par[String(l[0])] = l; });
    V('15 colonnes écrites, la 15e est MOTIF', f.lignes[0][14] === 'MOTIF' && L.every(l => l.length === 15), f.lignes[0]);
    V('le titre est débarrassé des balises (<i>ARDS</i>)', par['701'][2] === 'Prone Positioning in ARDS: a Randomized Trial', par['701'][2]);
    V('quatre auteurs → trois puis « et al. »', /^Guerin C, Reignier J, Richard JC et al\.$/.test(par['701'][3]), par['701'][3]);
    const d701 = par['701'][1];   // date LOCALE (minuit de la machine) : toISOString() la décalerait d'un jour hors UTC (Europe/Paris → la veille à 22:00Z)
    const jour701 = d701 instanceof Date ? d701.getFullYear() + '-' + String(d701.getMonth() + 1).padStart(2, '0') + '-' + String(d701.getDate()).padStart(2, '0') : String(d701).slice(0, 10);
    V('DOI, revue et date lus dans la fiche', par['701'][5] === '10.1000/x701' && par['701'][4] === 'Anesthesiology' && jour701 === '2026-09-10', [par['701'][5], par['701'][4], jour701]);
    V('thèmes posés LOCALEMENT depuis titre + résumé : Ventilation et SDRA + Hémodynamique', /Ventilation et SDRA/.test(par['701'][13]) && /Hémodynamique/.test(par['701'][13]), par['701'][13]);
    V('…et depuis les descripteurs MeSH (Delirium → Neurologie et délire)', /Neurologie et délire/.test(par['801'][13]), par['801'][13]);
    V('le type retenu est le plus fort (ECR devant Multicenter)', par['701'][12] === 'Randomized Controlled Trial', par['701'][12]);
    const n = id => Number(par[id][7]);
    V('un ECR de revue spécialisée avec résumé et deux thèmes est très haut (≥ 90)', n('701') >= 90, n('701'));
    V('une lettre sans résumé est tout en bas (< 30)', n('702') < 30, n('702'));
    V('un protocole d\'essai est pénalisé (< 60)', n('703') < 60, n('703'));
    // (20/10/2026) Règle d'Arthur : une grande revue généraliste compte le plus — sa revue systématique rejoint l'ECR spécialisé en tête.
    V('une revue systématique de grande revue généraliste est en tête (≥ 90), loin devant le protocole', n('801') >= 90 && n('801') > n('703'), [n('801'), n('703'), n('701')]);
    V('le motif dit pourquoi, en clair', /ECR/.test(par['701'][14]) && /2 thèmes/.test(par['701'][14]) && /revue spécialisée/.test(par['701'][14]), par['701'][14]);
    V('…et pour la lettre aussi', /lettre\/éditorial/.test(par['702'][14]) && /sans résumé/.test(par['702'][14]), par['702'][14]);
    const g = vm.runInContext('getVeille()', m.ctx);
    V('getVeille expose la note et le motif, et trie par note', g.items[0].pmid === '701' && g.items[0].motif.length > 0 && g.items[g.items.length - 1].pmid === '702', g.items.map(i => i.pmid + ':' + i.score));
    V('le passage réussi pose VEILLE_DERNIER_SUCCES', !!m.props.VEILLE_DERNIER_SUCCES, m.props);
  }
  console.log('\n═══ La fenêtre : depuis le dernier passage réussi, pas 180 jours ═══');
  {
    const plan = () => ({ esearchresult: { count: '0', idlist: [] } });
    const jours = (depuis) => { const m = monde(plan); if (depuis) m.props.VEILLE_DERNIER_SUCCES = new Date(Date.now() - depuis * 86400000).toISOString(); vm.runInContext('getOrCreateVeilleTabs()', m.ctx); vm.runInContext('runVeille()', m.ctx); const q = m.requetes.find(r => r.endpoint === 'esearch.fcgi'); return q ? Number(new URLSearchParams(m.requetes[0].raw || '').get('reldate')) || m.journalFenetre : null; };
    // + 60 s : _veilleFenetreJours arrondit l'âge au jour SUPÉRIEUR ; pile N jours, la moindre milliseconde écoulée avant sa lecture de l'horloge donnait N+1 (banc instable)
    const fen = (depuis) => { const m = monde(plan); if (depuis) m.props.VEILLE_DERNIER_SUCCES = new Date(Date.now() - depuis * 86400000 + 60000).toISOString(); return vm.runInContext('_veilleFenetreJours(180)', m.ctx); };
    V('premier passage (aucun marqueur) : la fenêtre entière, 180 j', fen(null) === 180);
    V('passage 7 jours après un succès : 21 j (7 + 14 de marge, plancher 21)', fen(7) === 21, fen(7));
    V('40 jours après : 54 j', fen(40) === 54, fen(40));
    V('un an après : borné à 180 j', fen(400) === 180);
  }

  console.log('\n═══ Le type d\'étude lu dans le titre (13/10/2026) — défaut constaté en production ═══');
  {
    // Le 12/10, trois ECR (Anesth Analg, J Clin Anesth) arrivaient en « Journal Article » :
    // PubMed n'étiquette le type qu'à l'indexation. Notés 66-72 au lieu de 100.
    const m0 = monde(() => ({ esearchresult: { count: '0', idlist: [] } }));
    const tt = t => vm.runInContext('_veilleTypeTitre(' + JSON.stringify(t) + ')', m0.ctx);
    V('« … : A Randomized Clinical Trial » → ECR', tt('Effect of Deep Versus Moderate Neuromuscular Block on Chronic Postsurgical Pain: A Randomized Clinical Trial') === 'ECR');
    V('« randomised » (orthographe britannique) → ECR', tt('Remimazolam versus propofol: a randomised controlled trial') === 'ECR');
    V('« … of randomized trials: a meta-analysis » → méta-analyse, pas ECR', tt('Tranexamic acid in hip surgery: a meta-analysis of randomized trials') === 'META');
    V('« Systematic Review and Meta-Analysis » → méta-analyse', tt('Hypoalbuminaemia and complications: A Systematic Review and Meta-Analysis') === 'META');
    V('« A Scoping Review » → rien (pas une revue systématique)', tt('Intravenous Immunoglobulin in Cardiac Surgery: A Scoping Review') === '');
    V('analyse secondaire d\'un ECR → PAS un ECR', tt('Delirium after surgery: a secondary analysis of a randomized trial') === '');
    V('analyse post hoc d\'un ECR → PAS un ECR', tt('Post hoc analysis of a randomized controlled trial of ketamine') === '');
    V('protocole d\'essai randomisé → PAS un ECR', tt('Study protocol for a randomised trial of goal-directed therapy') === '');
    V('« randomized » sans « trial » → rien', tt('Randomized allocation in observational cohorts') === '');
    V('cohorte rétrospective → rien', tt('Impact of an Enhanced Recovery Framework on Opioid Use: A Retrospective Cohort Study') === '');

    const fabrique = id => ({
      '901': { titre: 'Fluid responsiveness-guided preinduction volume optimization and postinduction hypotension: A randomized clinical trial', resume: 'Intraoperative hypotension and fluid responsiveness in frailty.', pubtypes: ['Journal Article'], date: '2026-10-09', revue: 'Anesthesiology' },
      '902': { titre: 'Hypoalbuminaemia and postoperative complications: A Systematic Review and Meta-Analysis', resume: 'postoperative complications and nutrition', pubtypes: ['Journal Article', 'Review'], date: '2026-10-06', revue: 'Anesthesiology' },
      '903': { titre: 'Sepsis bundles: a secondary analysis of a randomized trial', resume: 'sepsis and septic shock', pubtypes: ['Journal Article'], date: '2026-10-06', revue: 'Anesthesiology' },
    }[id] || {});
    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const term = params.get('term') || '';
        if (term.indexOf('"Anesthesiology"[Journal]') !== -1 && term.indexOf('"N Engl J Med"[Journal]') === -1) return { esearchresult: { count: '3', idlist: ['901', '902', '903'] } };
        return { esearchresult: { count: '0', idlist: [] } };
      }
      return efetchXml(params, fabrique);
    };
    const m = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    vm.runInContext('runVeille()', m.ctx);
    const L = m.cl.getSheetByName('VEILLE').lignes.slice(1); const par = {}; L.forEach(l => { par[String(l[0])] = l; });
    V('un ECR encore étiqueté « Journal Article » prend le bonus ECR (≥ 90)', Number(par['901'][7]) >= 90 && /^ECR/.test(par['901'][14]), [par['901'][7], par['901'][14]]);
    V('une méta-analyse étiquetée « Review » est notée méta-analyse, pas revue', /^méta-analyse/.test(par['902'][14]) && Number(par['902'][7]) >= 90, [par['902'][7], par['902'][14]]);
    V('une analyse secondaire reste sans bonus ECR (< 90)', Number(par['903'][7]) < 90 && !/ECR/.test(par['903'][14]), [par['903'][7], par['903'][14]]);

    const rl = (t, s, mo) => vm.runInContext('_veilleRenoterLigne_(' + JSON.stringify(t) + ',' + JSON.stringify(s) + ',' + JSON.stringify(mo) + ')', m0.ctx);
    const a = rl('X: a randomized controlled trial', 60, 'étude · revue spécialisée · 1 thème');
    V('rattrapage : « étude » (+8) devient ECR (+35) → 60 − 8 + 35 = 87', a && a.note === 87 && a.motif === 'ECR · revue spécialisée · 1 thème', a);
    const b = rl('X: a systematic review and meta-analysis', 62, 'revue · revue spécialisée · 2 thèmes');
    V('rattrapage : « revue » (+10) devient méta-analyse (+30) → 82, le « revue spécialisée » reste', b && b.note === 82 && b.motif === 'méta-analyse · revue spécialisée · 2 thèmes', b);
    const c = rl('X: a randomized trial', 66, 'revue spécialisée · 1 thème · récent');
    V('rattrapage : aucun type (+0) devient ECR → 66 + 35 = 101, plafonné à 100', c && c.note === 100 && /^ECR · revue spécialisée/.test(c.motif), c);
    V('rattrapage : un article déjà noté ECR n\'est pas touché', rl('X: a randomized trial', 90, 'ECR · revue spécialisée') === null);
    V('rattrapage : une revue systématique déjà notée ne devient pas méta-analyse', rl('X: systematic review and meta-analysis', 80, 'revue systématique · revue spécialisée') === null);
    V('rattrapage : un article d\'avant la note (SCORE vide) n\'est pas touché', rl('X: a randomized trial', '', '') === null);
    V('rattrapage : un titre sans type n\'est pas touché', rl('Retrospective cohort of 49,394 patients', 70, 'revue spécialisée') === null);

    const f = m.cl.getSheetByName('VEILLE'); const iS = f.lignes[0].indexOf('SCORE'), iM = f.lignes[0].indexOf('MOTIF');
    const r901 = f.lignes.findIndex(l => String(l[0]) === '901'), r903 = f.lignes.findIndex(l => String(l[0]) === '903');
    f.lignes[r901][iS] = 66; f.lignes[r901][iM] = 'revue spécialisée · 2 thèmes · récent';   // l'état d'avant le correctif
    const avant903 = [f.lignes[r903][iS], f.lignes[r903][iM]];
    const res = vm.runInContext('veilleRenoterParTitre()', m.ctx);
    V('veilleRenoterParTitre corrige l\'ECR sous-noté (66 → 100)', Number(f.lignes[r901][iS]) === 100 && /^ECR/.test(f.lignes[r901][iM]), [f.lignes[r901][iS], f.lignes[r901][iM]]);
    V('…ne touche pas l\'analyse secondaire', f.lignes[r903][iS] === avant903[0] && f.lignes[r903][iM] === avant903[1]);
    V('…et ne compte qu\'une correction (la méta-analyse était déjà juste)', res.corriges === 1, res);
    V('…relancé, ne change plus rien', vm.runInContext('veilleRenoterParTitre()', m.ctx).corriges === 0);
  }

  console.log('\n═══ Nouvel habillage v1.22 (13/10/2026) — thèmes en rangée, sections, cartes à anneau — piloté au clic ═══');
  {
    const { JSDOM, VirtualConsole } = require('jsdom');
    const vcons = new VirtualConsole(); const erreurs = [];
    vcons.on('jsdomError', e => erreurs.push(e.message));
    const page = fs.readFileSync('../index.html', 'utf8');
    const dom = new JSDOM(page, {
      runScripts: 'dangerously', virtualConsole: vcons,
      url: 'https://planningmedic.github.io/index.html', pretendToBeVisual: true,
      beforeParse(win) {
        win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(require('fs').readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
      } });
    const w = dom.window, d = w.document;
    const envois = [];
    w.fetch = async (u, o) => { try { envois.push(JSON.parse(o && o.body || '{}')); } catch (e) {} return { ok:true, json: async () => ({ success:true }) }; };
    await new Promise(r => setTimeout(r, 400));
    const it = (pmid, titre, revue, score, themes, motif, extra) => Object.assign({ pmid:String(pmid), date:'2026-10-0' + (pmid % 9 + 1), titre, auteurs:'Dupont A', revue, doi:'', source:'REVUE', score, resume:'', lu:false, star:false, ajoute:'', pubtype:'', themes, motif }, extra || {});
    w.miroirRead = async () => ({ success:true, data: {
      veille: { success:true, items: [
        it(10, 'Essai A', 'Anesth Analg', 100, ['Hémodynamique', 'Douleur périopératoire'], 'ECR · revue spécialisée · 2 thèmes', { resume:'Moins de douleur à 3 mois.', pubtype:'Journal Article', ajoute:new Date().toISOString().slice(0, 10) }),
        it(11, 'Méta B', 'BJA', 90, ['Hémodynamique'], 'méta-analyse · revue spécialisée'),
        it(12, 'Cohorte C', 'Anaesthesia', 80, ['Hémodynamique'], 'étude · revue spécialisée'),
        it(13, 'Article D', 'Anesthesiology', 70, ['Hémodynamique'], 'revue spécialisée'),
        it(14, 'Article E', 'BJA', 60, ['Douleur périopératoire'], 'revue spécialisée'),
        it(15, 'Revue F', 'Crit Care', null, [], '', { pubtype:'Systematic Review' }),
      ] },
      veille_marques: { parMar: {} },
    } });
    try { w.localStorage.removeItem('pmVeilleRevues'); w.localStorage.removeItem('pmVeilleFile'); } catch (e) {}
    await w.openVeille();
    const cartes = () => [...d.querySelectorAll('#veilleList .veille-card')];
    const titres = () => cartes().map(c => c.querySelector('.vc-title').textContent);
    const chips = () => [...d.querySelectorAll('#vThemeRail .vt-chip')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    V('le menu déroulant des thèmes a disparu, la rangée de pastilles le remplace', !d.getElementById('vThemeSel') && !!d.getElementById('vThemeRail'));
    V('la rangée : « Tous les thèmes » puis chaque thème avec son compte, « Autres » en dernier', JSON.stringify(chips()) === JSON.stringify(['Tous les thèmes', 'Hémodynamique 4', 'Douleur périopératoire 2', 'Autres 1']), chips());
    const secs = [...d.querySelectorAll('#veilleList .vt-sec')].map(sct => sct.querySelector('h3').textContent + ':' + sct.querySelectorAll('.veille-card').length);
    V('vue rangée : 3 meilleurs par thème, un article une seule fois', JSON.stringify(secs) === JSON.stringify(['Hémodynamique:3', 'Douleur périopératoire:1', 'Autres:1']), secs);
    const plus = [...d.querySelectorAll('#veilleList .vt-sec')].map(sct => (sct.querySelector('.vt-more') || { textContent:'' }).textContent.trim());
    V('« Voir les N → » dès qu\'un thème a plus d\'articles que ses cartes ; rien sous « Autres », complet', JSON.stringify(plus) === JSON.stringify(['Voir les 4 →', 'Voir les 2 →', '']), plus);
    const cA = cartes()[0];
    V('carte : anneau avec la note, étiquette du type d\'après la note (ECR → Essai randomisé)', cA.querySelector('.vc-ring b').textContent === '100' && cA.querySelector('.vc-type').textContent === 'Essai randomisé', [cA.querySelector('.vc-ring b').textContent, cA.querySelector('.vc-type').textContent]);
    V('…méta-analyse et étude reconnues aussi', /Méta-analyse/.test(cartes()[1].querySelector('.vc-type').textContent) && /Étude/.test(cartes()[2].querySelector('.vc-type').textContent));
    const cF = cartes().find(c => /Revue F/.test(c.textContent));
    V('sans note ni motif : « – » dans l\'anneau, type pris dans PubMed (Revue systématique)', cF.querySelector('.vc-ring b').textContent === '–' && cF.querySelector('.vc-type').textContent === 'Revue systématique');
    V('le résumé garde son étiquette « En deux lignes », le pourquoi de la note reste sous le titre', /En deux lignes/.test(cA.querySelector('.vc-resume').textContent) && /ECR · revue spécialisée/.test(cA.querySelector('.vc-motif').textContent));
    V('la revue est dans la ligne du type', cA.querySelector('.vc-journal').textContent === 'Anesth Analg');
    V('« Cette semaine » et la légende des couleurs restent en tête', !!d.querySelector('#veilleList .vt-legend'));
    V('« Cette semaine » compte par le type de la carte (l\'ECR d\'après la note, pas « étude »)', /1 essai randomisé/.test((d.querySelector('#veilleList .vs-semaine') || { textContent:'' }).textContent), (d.querySelector('#veilleList .vs-semaine') || {}).textContent);

    d.querySelector('.vt-more').click();
    V('« Voir les 4 » ouvre le thème : 4 cartes, triées par note', JSON.stringify(titres()) === JSON.stringify(['Essai A', 'Méta B', 'Cohorte C', 'Article D']), titres());
    V('…la pastille du thème s\'allume, un bouton « ← Tous les thèmes » apparaît', /Hémodynamique/.test(d.querySelector('#vThemeRail .vt-chip.on').textContent) && !!d.querySelector('#veilleList .vt-back'));
    w.onVSort('journal');
    V('tri « Par revue » : ordre alphabétique des revues', JSON.stringify(cartes().map(c => c.querySelector('.vc-journal').textContent)) === JSON.stringify(['Anaesthesia', 'Anesth Analg', 'Anesthesiology', 'BJA']), cartes().map(c => c.querySelector('.vc-journal').textContent));
    V('« Par revue » figure dans le menu de tri', [...d.querySelectorAll('select.vsel option')].some(o => o.value === 'journal'));
    w.onVSort('relevance');
    d.querySelector('#veilleList .vt-back').click();
    V('« ← Tous les thèmes » revient à la vue rangée', d.querySelectorAll('#veilleList .vt-sec').length === 3);

    [...d.querySelectorAll('#veilleList .vc-th')].find(b => b.textContent === 'Douleur périopératoire').click();
    V('toucher le thème d\'une carte ouvre ce thème (2 articles)', JSON.stringify(titres()) === JSON.stringify(['Essai A', 'Article E']), titres());
    [...d.querySelectorAll('#vThemeRail .vt-chip')][0].click();

    w.onVSearch('cohorte');
    V('une recherche donne la liste à plat, sans sections', cartes().length === 1 && d.querySelectorAll('#veilleList .vt-sec').length === 0);
    w.onVSearch('');

    cartes()[0].querySelector('.vc-act').click();
    await new Promise(r => setTimeout(r, 30));
    V('« Marquer lu » : la carte quitte les non lus…', !titres().includes('Essai A'), titres());
    V('…et la marque part au serveur (file locale inchangée)', envois.some(e => e.action === 'markVeille' && e.pmid === '10' && e.field === 'lu' && e.value === true), envois);
    V('la rangée recompte sans l\'article lu', chips()[1] === 'Hémodynamique 3', chips());

    const sombre = (page.match(/html\[data-theme="dark"\] \{[\s\S]*?\}/) || [''])[0];
    V('les 5 couleurs de type existent aussi en mode sombre', ['ecr', 'meta', 'rs', 'reco', 'aut'].every(k => sombre.indexOf('--vt-' + k + ':') !== -1 && sombre.indexOf('--vt-' + k + '-bg:') !== -1));
    V('aucune erreur JavaScript pendant toute la navigation', erreurs.length === 0, erreurs.slice(0, 2));
    // (20/10/2026, v1.29) La recherche n'était pas assez visible (Arthur) : en tête, pleine largeur ; puis les marques ; puis Sources | Revues | Tri.
    const barre = d.getElementById('veilleToolbar');
    const enfants = [...barre.children].map(e => e.className.split(' ')[0]);
    V('v1.29 : la barre se lit dans l\'ordre recherche, marques, puis 3 menus', JSON.stringify(enfants) === JSON.stringify(['vsearch-big', 'vfilter', 'vsel', 'vrev-wrap', 'vsel']), enfants);
    const champ = barre.querySelector('.vsearch-big input');
    V('…la recherche a sa loupe et une invite claire', !!barre.querySelector('.vsearch-big svg') && champ.placeholder === 'Chercher un article, un auteur…');
    const cssBarre = (page.match(/\.vsearch-big input\{[^}]*\}/) || [''])[0];
    V('…texte de 16 px : l\'iPhone ne zoome pas la page en touchant la recherche', /font:500 16px/.test(cssBarre), cssBarre);
    V('…recherche et marques sur toute la largeur, les 3 menus de même largeur, libellé centré', /\.veille-toolbar\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(page) && /\.veille-toolbar \.vsearch-big,\.veille-toolbar \.vfilter\{grid-column:1\/-1\}/.test(page) && /\.veille-toolbar \.vsel\{[^}]*text-align-last:center/.test(page));
    const menus = [...barre.querySelectorAll('select.vsel')];
    V('…libellés courts : « Sources » et « Tri »', menus[0].options[menus[0].selectedIndex].text === 'Sources' && menus[1].options[menus[1].selectedIndex].text === 'Tri', menus.map(m => m.options[m.selectedIndex].text));
    menus[0].value = 'GENERAL'; menus[0].dispatchEvent(new w.Event('change'));
    V('…un menu changé passe en couleur, revenu au défaut il redevient neutre', menus[0].classList.contains('actif') && (menus[0].value = '', menus[0].dispatchEvent(new w.Event('change')), !menus[0].classList.contains('actif')));
    champ.value = 'Méta B'; champ.dispatchEvent(new w.Event('input'));
    V('…taper dans la nouvelle recherche filtre bien la liste', titres().length === 1 && titres()[0] === 'Méta B', titres());
    champ.value = ''; champ.dispatchEvent(new w.Event('input'));
    V('…et l\'écran ne lui impose plus « flex » en dur (sinon la grille serait écrasée)', d.getElementById('veilleToolbar').style.display === '' && !/getElementById\('veilleToolbar'\)\.style\.display = VEILLE_ITEMS\.length \? 'flex'/.test(page), d.getElementById('veilleToolbar').style.display);
  }

  console.log('\n═══ Essai récent d\'une revue généraliste, pas encore étiqueté par PubMed (20/10/2026) — défaut constaté en production ═══');
  {
    /* Production, 20/10 : VASSPR et l'essai dobutamine + noradrénaline (JAMA)
       absents de la veille ; aucun article JAMA entré depuis le 19/09. L'axe
       croisé exigeait l'étiquette « Randomized Controlled Trial », posée par
       PubMed des semaines après la parution. PubMed simulé : l'essai n'a QUE
       « Journal Article » ; il ne répond qu'à une requête qui lit le titre. */
    const TYPE_TITRE = '("randomized"[Title] OR "randomised"[Title]) AND "trial"[Title]';
    const TITRE = 'Effect of Vasopressin Initiation Threshold on Septic Shock Mortality: A Cluster Crossover Randomized Strategy Trial';
    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const term = params.get('term') || '';
        const general = term.indexOf('"JAMA"[Journal]') !== -1 && term.indexOf('"Anesthesiology"[Journal]') === -1;
        // le marqueur exact de la clause « titre » (« randomized »/« trial » figurent déjà dans la liste noire des protocoles)
        if (general && term.indexOf(TYPE_TITRE) !== -1)
          return { esearchresult: { count: '1', idlist: ['301'] } };
        return { esearchresult: { count: '0', idlist: [] } };
      }
      if (endpoint === 'efetch.fcgi') return efetchXml(params, () => ({ titre: TITRE, revue: 'JAMA', pubtypes: ['Journal Article'], resume: 'In septic shock, early vasopressin did not reduce mortality.', date: new Date().toISOString().slice(0, 10) }));
      return {};
    };
    const m = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    const res = vm.runInContext('runVeille()', m.ctx);
    const qG = m.requetes.filter(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"JAMA"[Journal]') !== -1 && q.term.indexOf('"Anesthesiology"[Journal]') === -1);
    const qD = m.requetes.filter(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"Anesthesiology"[Journal]') !== -1);
    const lignes = m.cl.getSheetByName('VEILLE').lignes.slice(1);
    V('l\'essai JAMA non étiqueté entre dans la veille', res.axeCroise === 1 && lignes.some(l => String(l[0]) === '301'), [res.axeCroise, lignes.length]);
    const l = lignes.find(x => String(x[0]) === '301') || [];
    V('…comme article de revue généraliste, noté en essai randomisé', l[6] === 'GENERAL' && /ECR/.test(String(l[14])) && Number(l[7]) >= 80, [l[6], l[7], l[14]]);
    V('l\'étiquette PubMed reste acceptée (la liste blanche n\'est pas remplacée)', qG.length === 1 && qG[0].term.indexOf(BLANCHE) !== -1);
    V('le titre écarte analyses secondaires, post hoc et protocoles', qG.length === 1 && ['"secondary"[Title]', '"post hoc"[Title]', '"protocol"[Title]'].every(x => qG[0].term.indexOf(x) !== -1));
    V('l\'axe direct n\'est pas touché (aucune restriction de type)', qD.length >= 1 && qD.every(q => q.term.indexOf(TYPE_TITRE) === -1 && q.term.indexOf(BLANCHE) === -1), qD.map(q => q.term.slice(0, 120)));
    const t = qG.length ? qG[0].term : ''; let prof = 0, mini = 0; for (const ch of t) { if (ch === '(') prof++; if (ch === ')') prof--; mini = Math.min(mini, prof); }
    V('la requête envoyée à PubMed a ses parenthèses équilibrées', t && prof === 0 && mini === 0, prof);
    const mots = /"[^"]*\b(of|for|the|a|and|after|in|on|to|with)\b[^"]*"\[Title\]/i;
    V('aucune expression de titre ne contient de mot vide (PubMed les ignorerait)', t && !mots.test(t), (t.match(mots) || [])[0]);
  }

  console.log('\n═══ Archivage (20/10/2026) : plus de 3 mois → hors de l\'écran, sauf pour qui l\'a étoilé ═══');
  {
    /* Production, 20/10 : 2 820 articles, ~75 de plus chaque semaine, rien jamais retiré.
       Règle d'Arthur : un ancien quitte l'écran sauf pour le MAR qui l'a étoilé. */
    const jour = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const ligne = (pmid, pub, ajoute, titre) => [pmid, pub, titre || 'Article ' + pmid, 'Dupont A', 'Anesthesiology', '', 'REVUE', 70, '', 'N', 'N', ajoute, '', 'Hémodynamique', 'revue spécialisée'];
    const remplir = (m, lignes, marques) => {
      vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
      const v = m.cl.getSheetByName('VEILLE'); lignes.forEach(l => v.lignes.push(l.map(x => x)));
      v.lignes[0] = ['PMID', 'DATE_PUB', 'TITRE', 'AUTEURS', 'REVUE', 'DOI', 'SOURCE', 'SCORE', 'RESUME', 'LU', 'STAR', 'AJOUTE_LE', 'PUBTYPE', 'THEMES', 'MOTIF'];
      const mq = m.cl.getSheetByName('VEILLE_MARQUES'); (marques || []).forEach(x => mq.lignes.push(x));
      // la doublure coerce comme le vrai Sheets : les dates texte deviennent des objets Date
      v.lignes.slice(1).forEach(l => { [1, 11].forEach(c => { if (/^\d{4}-\d{2}-\d{2}$/.test(String(l[c]))) l[c] = new Date(l[c] + 'T00:00:00'); }); });
    };
    const lignes = [
      ligne('501', jour(180), jour(60), 'Ancien sans étoile'),
      ligne('502', jour(180), jour(60), 'Ancien étoilé par le MAR 7'),
      ligne('503', jour(180), jour(10), 'Parution ancienne, entré il y a 10 jours'),
      ligne('504', jour(30),  jour(30), 'Récent'),
      ligne('505', jour(180), '',       'Sans date d\'entrée'),
      ligne('506', jour(150), jour(100), 'Ancien, étoile RETIRÉE'),
    ];
    const marques = [['7', '502', 'N', 'O', new Date()], ['9', '501', 'O', 'N', new Date()], ['7', '506', 'N', 'N', new Date()]];
    const m = monde(() => ({ esearchresult: { count: '0', idlist: [] } }));
    remplir(m, lignes, marques);
    const r1 = vm.runInContext('veilleArchiver()', m.ctx);
    const restent = () => m.cl.getSheetByName('VEILLE').lignes.slice(1).map(l => String(l[0] || '')).filter(Boolean);
    const arch = () => (m.cl.getSheetByName('VEILLE_ARCHIVE') || { lignes: [] }).lignes;
    V('2 anciens sans étoile partent (une marque « lu » ou une étoile retirée ne protège pas)', r1.archives === 2 && JSON.stringify(restent()) === JSON.stringify(['502', '503', '504', '505']), [r1, restent()]);
    V('ils sont DÉPLACÉS dans VEILLE_ARCHIVE, en-tête compris, rien n\'est effacé', arch().length === 3 && arch()[0][0] === 'PMID' && arch().slice(1).map(l => l[0]).join() === '501,506' && arch()[1][2] === 'Ancien sans étoile', arch().map(l => l[0]));
    V('l\'ancien étoilé par un collègue reste dans VEILLE', restent().indexOf('502') !== -1);
    V('une parution ancienne entrée il y a 10 jours reste (au moins 4 semaines à l\'écran)', restent().indexOf('503') !== -1);
    V('sans date d\'entrée : prudence, on garde', restent().indexOf('505') !== -1);
    const r2 = vm.runInContext('veilleArchiver()', m.ctx);
    V('un second passage n\'archive rien et ne duplique rien', r2.archives === 0 && arch().length === 3, [r2, arch().length]);

    const g = vm.runInContext('getVeille()', m.ctx);
    const vx = {}; g.items.forEach(i => { vx[i.pmid] = i.vieux; });
    V('getVeille marque « vieux » l\'ancien étoilé, pas les autres', vx['502'] === true && vx['503'] === false && vx['504'] === false && vx['505'] === false, vx);

    // Un article archivé ne revient pas, même sur la fenêtre pleine de 180 jours (marqueur perdu)
    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const t = params.get('term') || '';
        return t.indexOf('"Anesthesiology"[Journal]') !== -1 ? { esearchresult: { count: '2', idlist: ['501', '507'] } } : { esearchresult: { count: '0', idlist: [] } };
      }
      if (endpoint === 'efetch.fcgi') return efetchXml(params, id => ({ titre: 'Article ' + id, revue: 'Anesthesiology' }));
      return {};
    };
    const m2 = monde(plan); remplir(m2, lignes, marques);
    vm.runInContext('veilleArchiver()', m2.ctx);
    const rr = vm.runInContext('runVeille()', m2.ctx);
    const ids2 = m2.cl.getSheetByName('VEILLE').lignes.slice(1).map(l => String(l[0] || '')).filter(Boolean);
    V('runVeille : un article archivé n\'est pas recollecté, le nouveau entre', ids2.indexOf('501') === -1 && ids2.indexOf('507') !== -1 && rr.trouves === 1, [ids2, rr.trouves]);
    V('runVeille archive en fin de passage et le rapporte', typeof rr.archives === 'number' && m2.logs.some(l => /archivés/.test(l)), m2.logs.slice(-1));

    // Le seuil vit dans VEILLE_CFG (ARCHIVE_MOIS) ; absent → 3 mois
    const m3 = monde(() => ({})); remplir(m3, [ligne('601', jour(150), jour(60))]);
    const cfg3 = m3.cl.getSheetByName('VEILLE_CFG');
    V('la configuration par défaut porte ARCHIVE_MOIS = 3', cfg3.lignes.some(l => l[0] === 'PARAM' && l[1] === 'ARCHIVE_MOIS' && String(l[2]) === '3'));
    cfg3.lignes = cfg3.lignes.map(l => (l[1] === 'ARCHIVE_MOIS' ? ['PARAM', 'ARCHIVE_MOIS', '6', 'O'] : l));
    V('ARCHIVE_MOIS = 6 : un article de 5 mois reste', vm.runInContext('veilleArchiver()', m3.ctx).archives === 0);
    cfg3.lignes = cfg3.lignes.filter(l => l[1] !== 'ARCHIVE_MOIS');
    V('ligne ARCHIVE_MOIS absente du classeur : 3 mois par défaut', vm.runInContext('veilleArchiver()', m3.ctx).archives === 1);

    // L'écran : l'ancien n'est montré qu'à qui l'a étoilé — piloté dans la vraie page
    const { JSDOM, VirtualConsole } = require('jsdom');
    const vcons = new VirtualConsole(); const erreurs = []; vcons.on('jsdomError', e => erreurs.push(e.message));
    const ouvrir = async (mesEtoiles) => {
      const dom = new JSDOM(fs.readFileSync('../index.html', 'utf8'), {
        runScripts: 'dangerously', virtualConsole: vcons, url: 'https://planningmedic.github.io/index.html', pretendToBeVisual: true,
        beforeParse(win) {
          win.eval(fs.readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(fs.readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));
          win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
          win.Element.prototype.scrollIntoView = function () {}; win.scrollTo = () => {};
        } });
      const w = dom.window;
      w.fetch = async () => ({ ok:true, json: async () => ({ success:true }) });
      await new Promise(r => setTimeout(r, 300));
      const art = (pmid, titre, vieux) => ({ pmid, date:'2026-06-01', titre, auteurs:'', revue:'BJA', doi:'', source:'REVUE', score:70, resume:'', lu:false, star:false, ajoute:'2026-07-01', pubtype:'', themes:['Hémodynamique'], motif:'', vieux });
      w.miroirRead = async () => ({ success:true, data: {
        veille: { success:true, items: [art('1', 'Récent R', false), art('2', 'Ancien étoilé', true), art('3', 'Ancien libre', true)] },
        veille_marques: { parMar: { '7': { lus: [], stars: mesEtoiles } } } } });
      try { w.localStorage.removeItem('pmVeilleFile'); w.localStorage.removeItem('pmVeilleRevues'); } catch (e) {}
      await w.openVeille();
      return w.eval('VEILLE_ITEMS').map(i => i.titre);
    };
    const avec = await ouvrir(['2']), sans = await ouvrir([]);
    V('MAR qui a étoilé : il voit le récent et SON ancien, pas l\'ancien libre', JSON.stringify(avec) === JSON.stringify(['Récent R', 'Ancien étoilé']), avec);
    V('collègue sans étoile : il ne voit que le récent', JSON.stringify(sans) === JSON.stringify(['Récent R']), sans);
    V('aucune erreur JavaScript à l\'ouverture', erreurs.length === 0, erreurs.slice(0, 2));
    const guide = fs.readFileSync('../docs/guide-mar.html', 'utf8');
    V('le guide MAR explique la règle (3 mois, ★ favori) et le geste « garder un article »', /Je veux garder un article/.test(guide) && /3 mois/.test(guide) && /★ Favoris/.test(guide));
  }

  console.log('\n═══ Recherche dans les archives (20/10/2026, v1.31) — consultation seule ═══');
  {
    const m = monde(() => ({}));
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    const vide = vm.runInContext('chercherVeilleArchive("vasopressine")', m.ctx);
    V('pas encore d\'onglet VEILLE_ARCHIVE : réponse vide, pas d\'erreur', vide.success === true && vide.total === 0 && vide.items.length === 0, vide);
    const a = m.cl.insertSheet('VEILLE_ARCHIVE');
    a.lignes.push(['PMID', 'DATE_PUB', 'TITRE', 'AUTEURS', 'REVUE', 'DOI', 'SOURCE', 'SCORE', 'RESUME', 'LU', 'STAR', 'AJOUTE_LE', 'PUBTYPE', 'THEMES', 'MOTIF']);
    a.lignes.push(['701', '2026-02-16', 'Attenuated hemodynamic response to adjunct vasopressin in obese septic shock', 'Melchers M', 'Crit Care', '', 'REVUE', 60, '', 'N', 'N', '2026-08-08', 'Multicenter Study', 'Hémodynamique; Sepsis et infection', '']);
    a.lignes.push(['702', '2026-04-03', 'Vasopressin analogues for hemorrhagic shock resuscitation', 'Jiang S', 'Shock', '', 'REVUE', 50, '', 'N', 'N', '2026-08-08', '', 'Hémorragie et transfusion', '']);
    a.lignes.push(['703', '2026-03-01', 'Prone positioning in ARDS', 'Bélanger É', 'Intensive Care Med', '', 'REVUE', 70, '', 'N', 'N', '2026-08-08', '', 'Ventilation et SDRA', '']);
    for (let i = 0; i < 60; i++) a.lignes.push([String(800 + i), '2026-01-' + String(1 + (i % 28)).padStart(2, '0'), 'Sugammadex study ' + i, 'Auteur X', 'Anesth Analg', '', 'REVUE', 40, '', 'N', 'N', '2026-07-01', '', '', '']);
    const ch = q => vm.runInContext('chercherVeilleArchive(' + JSON.stringify(q) + ')', m.ctx);
    const r1 = ch('vasopressin');
    V('un mot du titre : les 2 articles, le plus récent d\'abord', r1.success && r1.total === 2 && r1.items.map(i => i.pmid).join() === '702,701', r1.items && r1.items.map(i => i.pmid));
    V('chaque mot doit figurer (« vasopressin obese » → 1)', ch('vasopressin obese').total === 1 && ch('vasopressin obese').items[0].pmid === '701');
    V('accents et majuscules ignorés (« BELANGER » trouve « Bélanger »)', ch('BELANGER').total === 1);
    V('la revue compte aussi (« shock » trouve le titre ET la revue Shock)', ch('shock').total === 2);
    V('moins de 3 lettres : refus poli, rien n\'est lu', ch('ab').success === false && /3 lettres/.test(ch('ab').error));
    const r60 = ch('sugammadex');
    V('au plus 50 renvoyés, le total exact annoncé (60)', r60.items.length === 50 && r60.total === 60, [r60.items.length, r60.total]);
    V('consultation seule : ni « lu » ni étoile dans la réponse', r1.items.every(i => !('lu' in i) && !('star' in i)));
    const portail = fs.readFileSync('../gas/portail.gs', 'utf8');
    V('le routeur du portail sert chercherVeilleArchive (lecture, hors verrou d\'écriture)', /case 'chercherVeilleArchive': return _portailJson\(chercherVeilleArchive\(payload && payload\.q\)\)/.test(portail) && !/'chercherVeilleArchive'/.test(fs.readFileSync('../gas/Indispos.gs', 'utf8')));

    // L'écran, piloté au clic
    const { JSDOM, VirtualConsole } = require('jsdom');
    const vcons = new VirtualConsole(); const erreurs = []; vcons.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(fs.readFileSync('../index.html', 'utf8'), {
      runScripts: 'dangerously', virtualConsole: vcons, url: 'https://planningmedic.github.io/index.html', pretendToBeVisual: true,
      beforeParse(win) {
        win.eval(fs.readFileSync(require('path').join(__dirname, '..', 'partage', 'portail.js'), 'utf8')); win.eval(fs.readFileSync(require('path').join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function () {}; win.scrollTo = () => {};
      } });
    const w = dom.window, d = w.document;
    const demandes = [];
    w.fetch = async (u, o) => { let b = {}; try { b = JSON.parse(o && o.body || '{}'); } catch (e) {} demandes.push(b);
      if (b.action === 'chercherVeilleArchive') return { ok:true, json: async () => ({ success:true, total: 1, items: [{ pmid:'701', date:'2026-02-16', titre:'Attenuated hemodynamic response to adjunct vasopressin', auteurs:'Melchers M', revue:'Crit Care', doi:'' }] }), text: async () => JSON.stringify({ success:true, total:1, items:[{ pmid:'701', date:'2026-02-16', titre:'Attenuated hemodynamic response to adjunct vasopressin', auteurs:'Melchers M', revue:'Crit Care', doi:'' }] }) };
      return { ok:true, json: async () => ({ success:true }), text: async () => '{"success":true}' }; };
    await new Promise(r => setTimeout(r, 300));
    const art = (pmid, titre) => ({ pmid, date:'2026-10-01', titre, auteurs:'', revue:'JAMA', doi:'', source:'GENERAL', score:90, resume:'', lu:false, star:false, ajoute:'2026-10-19', pubtype:'', themes:['Hémodynamique'], motif:'', vieux:false });
    w.miroirRead = async () => ({ success:true, data: { veille: { success:true, items: [art('1', 'Vasopressin initiation threshold in septic shock'), art('2', 'Dobutamine plus norepinephrine')] }, veille_marques: { parMar: { '7': { lus: [], stars: [] } } } } });
    try { w.localStorage.removeItem('pmVeilleFile'); w.localStorage.removeItem('pmVeilleRevues'); } catch (e) {}
    await w.openVeille();
    const champ = d.querySelector('.vsearch-big input');
    const taper = v => { champ.value = v; champ.dispatchEvent(new w.Event('input')); };
    V('sans recherche : aucun bouton archives', !d.querySelector('.varch-btn'));
    taper('va');
    V('moins de 3 lettres : pas de bouton', !d.querySelector('.varch-btn'));
    taper('vasopressin');
    const btn = d.querySelector('.varch-btn');
    V('recherche « vasopressin » : le résultat actuel, puis le bouton « Chercher dans les archives »', [...d.querySelectorAll('#veilleList .veille-card:not(.varch-card) .vc-title')].length === 1 && btn && btn.textContent === 'Chercher dans les archives');
    V('rien n\'est demandé au serveur tant qu\'on n\'a pas touché le bouton', !demandes.some(b => b.action === 'chercherVeilleArchive'));
    btn.click();
    await new Promise(r => setTimeout(r, 50));
    const q = demandes.find(b => b.action === 'chercherVeilleArchive');
    V('le bouton interroge les archives avec le texte tapé', q && q.q === 'vasopressin', q);
    const ac = [...d.querySelectorAll('.varch-card')];
    V('le résultat archivé s\'affiche avec son badge « Archivé » et l\'en-tête « 1 résultat dans les archives »', ac.length === 1 && ac[0].querySelector('.varch-badge').textContent === 'Archivé' && /1 résultat dans les archives/.test(d.querySelector('.varch-h').textContent));
    V('consultation seule : ni « Marquer lu » ni étoile sur une carte archivée, le titre ouvre PubMed', !ac[0].querySelector('button.vc-act') && !!ac[0].querySelector('a.vc-act[href*="pubmed"]') && /pubmed\.ncbi\.nlm\.nih\.gov\/701\//.test(ac[0].querySelector('.vc-title').href));
    taper('dobutamine');
    V('changer la recherche efface les résultats archivés et repropose le bouton', !d.querySelector('.varch-card') && !!d.querySelector('.varch-btn'));
    taper('zzzz');
    V('aucun résultat actuel : le bouton archives reste proposé', /Rien à afficher/.test(d.getElementById('veilleList').textContent) && !!d.querySelector('.varch-btn'));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    const guide = fs.readFileSync('../docs/guide-mar.html', 'utf8');
    V('le guide MAR explique « Chercher dans les archives »', /Chercher dans les archives/.test(guide));
  }

  console.log('\n═══ ICRAKI (NEJM, 14/10/2026) : essai dont seul le RÉSUMÉ dit la randomisation — défaut constaté en production ═══');
  {
    const TITRE = 'Intermittent or Continuous Renal-Replacement Therapy in Acute Kidney Injury';
    const RESUME = 'In this multicenter, open-label, noninferiority trial, we randomly assigned critically ill adults with acute kidney injury to intermittent hemodialysis or continuous renal-replacement therapy.';
    const MARQUEUR = '"randomly assigned"[tiab]';
    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const t = params.get('term') || '';
        const general = t.indexOf('"N Engl J Med"[Journal]') !== -1 && t.indexOf('"Anesthesiology"[Journal]') === -1;
        return (general && t.indexOf(MARQUEUR) !== -1) ? { esearchresult: { count: '1', idlist: ['901'] } } : { esearchresult: { count: '0', idlist: [] } };
      }
      if (endpoint === 'efetch.fcgi') return efetchXml(params, () => ({ titre: TITRE, revue: 'N Engl J Med', pubtypes: ['Journal Article'], resume: RESUME, date: new Date().toISOString().slice(0, 10) }));
      return {};
    };
    const m = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    const r = vm.runInContext('runVeille()', m.ctx);
    const l = m.cl.getSheetByName('VEILLE').lignes.find(x => String(x[0]) === '901') || [];
    V('ICRAKI, sans étiquette PubMed ni type dans le titre, entre dans la veille', r.axeCroise === 1 && l[2] === TITRE, [r.axeCroise, l[2]]);
    V('…noté en essai randomisé (au moins 80), pas en simple article', /^ECR/.test(String(l[14])) && Number(l[7]) >= 80, [l[7], l[14]]);
    const qG = m.requetes.find(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"N Engl J Med"[Journal]') !== -1 && q.term.indexOf('"Anesthesiology"[Journal]') === -1);
    let prof = 0, mini = 0; for (const ch of (qG ? qG.term : '')) { if (ch === '(') prof++; if (ch === ')') prof--; mini = Math.min(mini, prof); }
    V('la requête des généralistes reste équilibrée en parenthèses', qG && prof === 0 && mini === 0);
    const vide = /"[^"]*\b(of|for|the|a|and|after|in|on|to|with)\b[^"]*"\[(Title|tiab)\]/i;
    V('aucune expression titre/résumé ne contient de mot vide', qG && !vide.test(qG.term), qG && (qG.term.match(vide) || [])[0]);
    const tr = (t, rs) => vm.runInContext('_veilleTypeResume(' + JSON.stringify(t) + ',' + JSON.stringify(rs) + ')', m.ctx);
    V('analyse secondaire d\'un essai : pas notée en ECR, même si le résumé dit « randomly assigned »', tr('Long-term outcomes: a secondary analysis of the X trial', 'patients were randomly assigned') === '');
    V('méta-analyse : pas notée en ECR par le résumé', tr('Vasopressors in septic shock: a meta-analysis', 'trials in which patients were randomly assigned') === '');
    V('résumé sans randomisation : rien', tr('Cohort study of AKI', 'we included 3 000 patients') === '');
  }

  console.log('\n═══ Règle d\'Arthur (20/10/2026) : revue généraliste + thème dans le TITRE = l\'article entre, quel que soit son type ═══');
  {
    const plan = (endpoint, params) => {
      if (endpoint === 'esearch.fcgi') {
        const t = params.get('term') || '';
        const general = t.indexOf('"N Engl J Med"[Journal]') !== -1 && t.indexOf('"Anesthesiology"[Journal]') === -1;
        return (general && t.indexOf('"acute kidney injury"[Title]') !== -1) ? { esearchresult: { count: '1', idlist: ['951'] } } : { esearchresult: { count: '0', idlist: [] } };
      }
      if (endpoint === 'efetch.fcgi') return efetchXml(params, () => ({ titre: 'Acute Kidney Injury in the ICU: a narrative review', revue: 'N Engl J Med', pubtypes: ['Journal Article'], resume: 'We review the management of acute kidney injury.', date: new Date().toISOString().slice(0, 10) }));
      return {};
    };
    const m = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    const r = vm.runInContext('runVeille()', m.ctx);
    V('NEJM, « acute kidney injury » dans le titre, simple article : il entre', r.axeCroise === 1 && m.cl.getSheetByName('VEILLE').lignes.some(l => String(l[0]) === '951'), r.axeCroise);
    const qG = m.requetes.find(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"N Engl J Med"[Journal]') !== -1 && q.term.indexOf('"Anesthesiology"[Journal]') === -1);
    const qD = m.requetes.find(q => q.endpoint === 'esearch.fcgi' && q.term.indexOf('"Anesthesiology"[Journal]') !== -1);
    V('généralistes : (thème dans le titre) OU (thème dans titre/résumé ET type d\'étude)', qG && /AND \(\(\("intubation"\[Title\]/.test(qG.term) && /\) OR \(\(\("intubation"\[tiab\][\s\S]*\) AND \("Randomized Controlled Trial"\[Publication Type\]/.test(qG.term), qG && qG.term.slice(0, 260));
    V('le thème vu seulement dans le résumé exige toujours un type (la liste blanche est conservée)', qG && qG.term.indexOf(BLANCHE) !== -1);
    V('revues spécialisées inchangées : thème en titre/résumé, sans restriction de type', qD && qD.term.indexOf('"intubation"[Title]') === -1 && qD.term.indexOf(BLANCHE) === -1);
    let prof = 0, mini = 0; for (const ch of (qG ? qG.term : '')) { if (ch === '(') prof++; if (ch === ')') prof--; mini = Math.min(mini, prof); }
    V('parenthèses équilibrées', qG && prof === 0 && mini === 0);
  }

  console.log('\n═══ Règle d\'Arthur (20/10/2026) : un article d\'une grande revue généraliste est très bien noté ═══');
  {
    const m = monde(() => ({}));
    const jour = new Date().toISOString().slice(0, 10);
    const note = (fiche, source, themes) => vm.runInContext('_veilleNote(' + JSON.stringify(Object.assign({ pubtypes: ['Journal Article'], titre: '', resume: 'x', date: jour }, fiche)) + ',' + JSON.stringify(source) + ',' + JSON.stringify(themes) + ',' + JSON.stringify(jour) + ')', m.ctx);
    const synth = note({ titre: 'Acute Kidney Injury in Critical Care' }, 'GENERAL', { 'Insuffisance rénale': true });
    V('synthèse du NEJM pas encore étiquetée « Review », 1 thème : au moins 80 (≈56 avant)', synth.note >= 80 && /grande revue/.test(synth.motif), synth);
    const icraki = note({ titre: 'Intermittent or Continuous Renal-Replacement Therapy in Acute Kidney Injury', resume: 'we randomly assigned critically ill adults' }, 'GENERAL', { 'Insuffisance rénale': true });
    V('ICRAKI (essai lu dans le résumé, NEJM) : 100, motif « ECR · grande revue »', icraki.note === 100 && /^ECR · grande revue/.test(icraki.motif), icraki);
    const spe = note({ titre: 'Some observational study' }, 'REVUE', { 'Hémodynamique': true });
    V('un article ordinaire de revue spécialisée reste en dessous d\'une synthèse du NEJM', spe.note < synth.note, [spe.note, synth.note]);
    const edito = note({ pubtypes: ['Editorial'], titre: 'Kidney injury: time to act' }, 'GENERAL', { 'Insuffisance rénale': true });
    V('un éditorial de grande revue reste pénalisé (sous 60)', edito.note < 60, edito);
  }

console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();  console.log('\n═══ Passe 4 : le résumé en deux lignes (15/09/2026) ═══');
  {
    const fabrique = id => ({
      '901': { titre: 'Trial A', resume: 'Population 1200 patients. Mortality unchanged.', pubtypes: ['Randomized Controlled Trial'], date: '2026-09-15', revue: 'Anesthesiology' },
      '902': { titre: 'Trial B', resume: 'Cohort of 300.', pubtypes: ['Observational Study'], date: '2026-09-14', revue: 'Anesthesiology' },
      '903': { titre: 'Letter about C', pubtypes: ['Letter'], date: '2026-09-13', revue: 'Anesthesiology' },
    }[id] || {});
    const plan = (endpoint, params) => endpoint === 'esearch.fcgi'
      ? ((params.get('term') || '').indexOf('"N Engl J Med"[Journal]') !== -1 ? { esearchresult: { count: '0', idlist: [] } } : { esearchresult: { count: '3', idlist: ['901', '902', '903'] } })
      : efetchXml(params, fabrique);
    monde.jetonIA = undefined;
    monde.ia = body => /Letter about C/.test(body.messages[0].content) ? { code: 200, texte: 'SANS_RESUME' } : { code: 200, texte: 'Voici le résumé : Chez 1 200 patients, la mortalité est inchangée. Le critère secondaire baisse.' };
    const m = monde(plan);
    vm.runInContext('getOrCreateVeilleTabs()', m.ctx);
    const r = vm.runInContext('runVeille()', m.ctx);
    const f = m.cl.getSheetByName('VEILLE'); const par = {}; f.lignes.slice(1).forEach(l => { par[String(l[0])] = l; });
    V('les articles du passage reçoivent un résumé, du mieux noté au moins bien noté', m.appelsIA.length === 3 && /Trial A/.test(m.appelsIA[0].messages[0].content), { appels: m.appelsIA.length, journal: m.journal.filter(l => /sum|Anthropic|token|efetch/i.test(l)), retour: r });
    V('la consigne impose deux phrases, du factuel, et rien qui ne soit dans le texte', /DEUX phrases/.test(m.appelsIA[0].system) && /aucun chiffre absent du texte/.test(m.appelsIA[0].system) && /SANS_RESUME/.test(m.appelsIA[0].system));
    V('ce qui part à l\'API : titre + résumé PubMed, rien d\'autre', m.appelsIA.every(a => a.messages.length === 1 && !/MAR|CODE|CONFIG/.test(a.messages[0].content)));
    V('le préambule « Voici le résumé : » est retiré', par['901'][8] === 'Chez 1 200 patients, la mortalité est inchangée. Le critère secondaire baisse.', par['901'][8]);
    V('une lettre est marquée SANS_RESUME dans la feuille…', par['903'][8] === 'SANS_RESUME');
    const g = vm.runInContext('getVeille()', m.ctx);
    V('…et l\'écran ne montre rien pour elle, le résumé pour les autres', g.items.find(i => i.pmid === '903').resume === '' && /Chez 1 200/.test(g.items.find(i => i.pmid === '901').resume));
    V('le bilan LOGS compte les résumés', m.logs.some(l => /2 résumés/.test(l)) && r.resumes === 2, m.logs);
    // second passage : rien de nouveau → aucun appel IA (un résumé est définitif)
    m.appelsIA.length = 0; vm.runInContext('runVeille()', m.ctx);
    V('au passage suivant, aucun article ne repasse à l\'API (résumé définitif, SANS_RESUME compris)', m.appelsIA.length === 0, m.appelsIA.length);
    /* (20/09/2026) Un résumé long n'est plus coupé à 420 caractères (le bicarbonate finissait par « ;… ») */
    monde.ia = () => ({ code: 200, texte: 'X'.repeat(300) + ' fin de première phrase. ' + 'Y'.repeat(300) + ' fin.' });
    const mL = monde(plan); vm.runInContext('getOrCreateVeilleTabs()', mL.ctx); vm.runInContext('runVeille()', mL.ctx);
    const long = mL.cl.getSheetByName('VEILLE').lignes.slice(1).map(l => String(l[8] || '')).find(v => v.length > 500) || '';
    V('un résumé long est gardé entier, jamais amputé d\'un « … »', long.length > 600 && !/…$/.test(long), long.length);
    monde.ia = null;
    /* (20/09/2026) Une recommandation / revue reçoit une consigne adaptée (question + messages
       pratiques), pas celle des études chiffrées ; SANS_RESUME ne vise plus que lettre, éditorial,
       erratum, protocole. */
    const fabriqueReco = id => ({ '911': { titre: 'Peri-operative management of day surgery: a consensus statement', resume: 'Guidance on selection, fasting and discharge.', pubtypes: ['Journal Article', 'Consensus Development Conference'], date: '2026-09-15', revue: 'Anaesthesia' },
                                  '912': { titre: 'Individualising glucose control in ICU: evidence and practice', resume: 'Narrative review.', pubtypes: ['Review'], date: '2026-09-14', revue: 'Anaesthesia' } }[id] || {});
    const planReco = (endpoint, params) => endpoint === 'esearch.fcgi'
      ? ((params.get('term') || '').indexOf('"N Engl J Med"[Journal]') !== -1 ? { esearchresult: { count: '0', idlist: [] } } : { esearchresult: { count: '2', idlist: ['911', '912'] } })
      : efetchXml(params, fabriqueReco);
    monde.ia = () => ({ code: 200, texte: 'Le texte traite de la chirurgie ambulatoire. Messages : sélection, jeûne, sortie.' });
    const mR = monde(planReco); vm.runInContext('getOrCreateVeilleTabs()', mR.ctx); vm.runInContext('runVeille()', mR.ctx);
    V('un consensus et une revue reçoivent la consigne « question + messages pratiques »', mR.appelsIA.length === 2 && mR.appelsIA.every(a => /messages pratiques principaux/.test(a.system) && !/critère principal/.test(a.system)), mR.appelsIA.map(a => a.system.slice(0, 40)));
    V('…et un essai garde la consigne chiffrée (critère principal, chiffres du texte)', /VEILLE_RESUME_CONSIGNE =[\s\S]{0,400}critère principal/.test(fs.readFileSync(require('path').join(__dirname, '..', 'gas', 'veille.gs'), 'utf8')));
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'gas', 'veille.gs'), 'utf8');
    V('veilleRepasserRefuses efface les SANS_RESUME et les résumés coupés des 7 jours puis résume', /function veilleRepasserRefuses\(\)/.test(src) && /v === 'SANS_RESUME' \|\| \/…\$\/\.test\(v\)\)\) \{ f\.getRange\(r \+ 1, iRes \+ 1\)\.setValue\(''\)/.test(src));
    V('l\'accueil trie par pertinence d\'emblée', /let V_SORT   = 'relevance'/.test(fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')) && /<option value="relevance" selected>/.test(fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')));
    // panne de l'API : la case reste vide, le passage réussit
    monde.ia = () => ({ code: 529, texte: '' });
    const m2 = monde(plan); vm.runInContext('getOrCreateVeilleTabs()', m2.ctx);
    const r2 = vm.runInContext('runVeille()', m2.ctx);
    const f2 = m2.cl.getSheetByName('VEILLE');
    V('API en panne : le passage réussit quand même, aucun résumé écrit, cases vides (on réessaiera lundi)', r2.success === true && r2.resumes === 0 && f2.lignes.slice(1).every(l => !l[8]) && m2.battements.length === 1);
    // sans clé : rien ne part
    monde.ia = null; monde.jetonIA = '';
    const m3 = monde(plan); vm.runInContext('getOrCreateVeilleTabs()', m3.ctx); vm.runInContext('runVeille()', m3.ctx);
    V('sans ANTHROPIC_TOKEN : aucun appel, le passage réussit', m3.appelsIA.length === 0 && m3.battements.length === 1);
    monde.jetonIA = undefined; monde.ia = null;
    const page = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    V('l\'accueil : bloc « Cette semaine » (résumés des 7 jours) et encadré « En deux lignes »', /function _vSemaine\(\)/.test(page) && /Cette semaine/.test(page) && /En deux lignes/.test(page) && /_semaine\+/.test(page));
  }


