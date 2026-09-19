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
    V('le bouton annonce « toutes »', /toutes/.test(w.document.getElementById('vRevBtn').textContent));

    // On coche Anesthesiology, AU CLIC.
    const caseAnesth = [...cases].find(c => c.value === 'Anesthesiology');
    caseAnesth.click();
    V('cocher une revue → 2 cartes, la bonne revue', w.document.querySelectorAll('.veille-card').length === 2
      && [...w.document.querySelectorAll('.vc-journal')].every(el => el.textContent === 'Anesthesiology'));
    V('le bouton annonce le compte', /1 cochée/.test(w.document.getElementById('vRevBtn').textContent), w.document.getElementById('vRevBtn').textContent);
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
    V('DOI, revue et date lus dans la fiche', par['701'][5] === '10.1000/x701' && par['701'][4] === 'Anesthesiology' && (par['701'][1] instanceof Date ? par['701'][1].toISOString().slice(0, 10) : String(par['701'][1]).slice(0, 10)) === '2026-09-10', [par['701'][5], par['701'][4], par['701'][1]]);
    V('thèmes posés LOCALEMENT depuis titre + résumé : Ventilation et SDRA + Hémodynamique', /Ventilation et SDRA/.test(par['701'][13]) && /Hémodynamique/.test(par['701'][13]), par['701'][13]);
    V('…et depuis les descripteurs MeSH (Delirium → Neurologie et délire)', /Neurologie et délire/.test(par['801'][13]), par['801'][13]);
    V('le type retenu est le plus fort (ECR devant Multicenter)', par['701'][12] === 'Randomized Controlled Trial', par['701'][12]);
    const n = id => Number(par[id][7]);
    V('un ECR de revue spécialisée avec résumé et deux thèmes est très haut (≥ 90)', n('701') >= 90, n('701'));
    V('une lettre sans résumé est tout en bas (< 30)', n('702') < 30, n('702'));
    V('un protocole d\'essai est pénalisé (< 60)', n('703') < 60, n('703'));
    V('une revue systématique généraliste est entre les deux', n('801') > n('703') && n('801') < n('701'), [n('801'), n('703'), n('701')]);
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
    const fen = (depuis) => { const m = monde(plan); if (depuis) m.props.VEILLE_DERNIER_SUCCES = new Date(Date.now() - depuis * 86400000).toISOString(); return vm.runInContext('_veilleFenetreJours(180)', m.ctx); };
    V('premier passage (aucun marqueur) : la fenêtre entière, 180 j', fen(null) === 180);
    V('passage 7 jours après un succès : 21 j (7 + 14 de marge, plancher 21)', fen(7) === 21, fen(7));
    V('40 jours après : 54 j', fen(40) === 54, fen(40));
    V('un an après : borné à 180 j', fen(400) === 180);
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


