/* ═══ BANC — LE DIAGNOSTIC EN TROIS QUESTIONS ET SA SENTINELLE (27/08/2026) ═══
   Trois incidents silencieux la même semaine (site en retard sur le dépôt,
   Toussaint 2027 fausse dans PERIODES_VAC, déclencheurs sans trace) ont refondu
   le diagnostic : chapitres-questions, sondes de bout en bout, battements de
   cœur, sentinelle quotidienne muette. On charge le VRAI code (setup_annee.gs
   puis Indispos.gs) dans un Google simulé et on éprouve chaque mécanisme,
   y compris le contrat central : la sentinelle n'écrit QUE s'il y a un ❌. */
const fs = require('fs'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };

function monter(opts) {
  opts = opts || {};
  const props = new Map(Object.entries(opts.props || {}));
  const mails = [];
  const feuilles = opts.feuilles || {};
  const feuille = data => ({
    getDataRange: () => ({ getValues: () => data }),
    getRange: (r, c, nr, nc) => ({ getValues: () => data.slice(r - 1, r - 1 + nr).map(l => l.slice(c - 1, c - 1 + nc)) }),
    getLastRow: () => data.length,
    /* (05/09/2026) La sonde d'en-têtes demande le nombre de colonnes : la colonne
       CIBLE JF n'est contrôlée que si elle existe, pour ne pas accuser les années
       antérieures (2026 s'arrête à la 22e). */
    getLastColumn: () => Math.max(0, ...data.map(l => l.length)),
    getName: () => 'stub'
  });
  const ctx = vm.createContext({ console, JSON, Date, Math, Object, Array, String, Number, RegExp, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props.has(k) ? props.get(k) : null,
      setProperty: (k, v) => props.set(k, String(v)),
      deleteProperty: k => props.delete(k) }) },
    MailApp: { sendEmail: (a, b, c) => mails.push({ a, b, c }), getRemainingDailyQuota: () => 90 },
    UrlFetchApp: { fetch: (url, opt) => (opts.fetch || (() => ({ getResponseCode: () => 500, getContentText: () => '{}' })))(String(url), opt) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: n => feuilles[n] ? feuille(feuilles[n]) : null,
      getSpreadsheetTimeZone: () => 'Europe/Paris' }) },
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create() {} }) }) }) }), deleteTrigger() {} },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
    Utilities: { formatDate: d => { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); },
                 sleep() {}, base64Encode: s => Buffer.from(s).toString('base64'), base64Decode: s => Buffer.from(s, 'base64'),
                 computeDigest: () => [], DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 } },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }) },
    HtmlService: { createHtmlOutput: () => ({}) }, ContentService: { createTextOutput: () => ({ setMimeType: () => ({}) }), MimeType: { JSON: 1 } },
    _mails: mails, _props: props
  });
  ctx.globalThis = ctx;
  // fonctions d'autres fichiers .gs référencées au chargement (portée partagée en prod)
  ctx.getActiveYear = () => 2026;
  ctx.logAction = () => {};
  ctx._configRows_ = () => [['CLE','VALEUR']];
  vm.runInContext(fs.readFileSync('../gas/setup_annee.gs', 'utf8'), ctx);
  vm.runInContext(require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */, ctx);
  if (opts.apres) opts.apres(ctx);
  return ctx;
}
// petit vérificateur : rejoue check/info comme le diagnostic
function bac() {
  const lignes = []; const R = { OK: 1, WARN: 2, ERR: 3 };
  const check = (label, level) => lignes.push((level === true || level === R.OK ? '✅ ' : level === R.WARN ? '⚠️ ' : '❌ ') + label);
  const info = t => lignes.push('ℹ️ ' + t);
  return { lignes, R, check, info };
}

(async function () {
  console.log('— Le regroupement en trois questions : rien ne se perd, tout se range —');
  {
    const ctx = monter();
    V('le code patché expose bien le regroupement', typeof ctx._regrouperEnChapitres_ === 'function');
    const entree = [
      '── Environnement ─────', '✅ fuseau',
      '── Publication (test réel) ─────', '✅ github',
      '── Site déployé (le dépôt est-il en ligne ?) ─────', '❌ retard', '✅    → LE GESTE : pousser un commit vide.',
      '── Équipe ─────', '⚠️ sans email',
      '── Section inconnue de demain ─────', 'ℹ️ divers'
    ];
    const s = ctx._regrouperEnChapitres_(entree.slice());
    V('aucune ligne perdue (3 titres de chapitres en plus)', s.length === entree.length + 3, s.length);
    V('les trois questions apparaissent, dans l\'ordre', s.filter(l => l.startsWith('══')).length === 3 &&
      s.findIndex(l => l.includes('1 ·')) < s.findIndex(l => l.includes('2 ·')) && s.findIndex(l => l.includes('2 ·')) < s.findIndex(l => l.includes('3 ·')));
    V('« Site déployé » vit au chapitre 1, « Environnement » au 2', 
      s.indexOf('── Site déployé (le dépôt est-il en ligne ?) ─────') > s.findIndex(l => l.includes('1 ·')) &&
      s.indexOf('── Site déployé (le dépôt est-il en ligne ?) ─────') < s.findIndex(l => l.includes('2 ·')) &&
      s.indexOf('── Environnement ─────') > s.findIndex(l => l.includes('2 ·')));
    V('une section inconnue retombe au chapitre 3 (jamais perdue)', s.indexOf('── Section inconnue de demain ─────') > s.findIndex(l => l.includes('3 ·')));
    V('le geste reste collé à son ❌', s[s.indexOf('❌ retard') + 1].includes('LE GESTE'));
  }

  console.log('— Les battements de cœur : frais, mort, jamais vu —');
  {
    const t = Date.now();
    const ctx = monter({ props: {
      'BAT_journalAppliquer': String(t - 3 * 60000),          // frais (3 min)
      'BAT_miroirSyncComplet': String(t - 9 * 3600000)        // mort (9 h > 3 h)
    } });
    const b = bac();
    ctx._batVerifs_(b.check, b.R);
    V('un battement frais est vert', b.lignes.some(l => l.startsWith('✅') && l.includes('Journal d\'intentions')));
    const mort = b.lignes.findIndex(l => l.startsWith('❌') && l.includes('NE BAT PLUS'));
    V('un battement mort est ❌, âge cité', mort >= 0 && /9 h/.test(b.lignes[mort]), b.lignes[mort]);
    V('…suivi de SON geste (recréer le déclencheur)', mort >= 0 && b.lignes[mort + 1].includes('LE GESTE') && b.lignes[mort + 1].includes('miroirSyncComplet'));
    V('les jamais-vus font UN ⚠️ groupé, pas des ❌ (déploiement frais toléré)', b.lignes.filter(l => l.startsWith('⚠️')).length === 1 && b.lignes.some(l => l.includes('pas encore enregistré')));
  }

  console.log('— Les interrupteurs des mails : le piège du rallumage —');
  {
    const ctx = monter({ props: { 'NOTIF_ACTIVE': 'O', 'NOTIF_EMAIL_TEST': 'responsable@test' } });
    let b = bac(); ctx._sondeInterrupteursMails_(b.check, b.R, b.info);
    V('allumé + redirection = ❌ (les MARs ne reçoivent rien, en silence)', b.lignes.some(l => l.startsWith('❌')) && b.lignes.some(l => l.includes('NOTIF_EMAIL_TEST')));
    const ctx2 = monter({ props: { 'NOTIF_ACTIVE': 'O' } });
    b = bac(); ctx2._sondeInterrupteursMails_(b.check, b.R, b.info);
    V('allumé seul = ✅', b.lignes.length === 1 && b.lignes[0].startsWith('✅'));
    const ctx3 = monter({ props: { 'NOTIF_ACTIVE': 'N', 'NOTIF_EMAIL_TEST': 'x' } });
    b = bac(); ctx3._sondeInterrupteursMails_(b.check, b.R, b.info);
    V('éteint = simple info, redirection mentionnée', b.lignes.length === 1 && b.lignes[0].startsWith('ℹ️') && b.lignes[0].includes('redirection'));
  }

  console.log('— La sonde « le site sert-il le dernier dépôt ? » —');
  {
    const gh = (head, runSha, ageMin) => (url) => {
      const rep = url.includes('/git/ref/') ? { object: { sha: head } }
        : url.includes('/actions/runs') ? { workflow_runs: [{ head_sha: runSha }] }
        : { commit: { committer: { date: new Date(Date.now() - ageMin * 60000).toISOString() } } };
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(rep) };
    };
    const ctxOK = monter({ fetch: gh('abc123abc123', 'abc123abc123', 5), props: {},
      apres: c => { c.getGithubToken = () => 'jeton'; } });
    let b = bac(); ctxOK._sondePagesDeployee_(b.check, b.R, b.info);
    V('dépôt = déploiement → ✅', b.lignes.length === 1 && b.lignes[0].startsWith('✅'), b.lignes);
    const ctxKO = monter({ fetch: gh('abc123abc123', 'vieux999', 60 * 20),
      apres: c => { c.getGithubToken = () => 'jeton'; } });
    b = bac(); ctxKO._sondePagesDeployee_(b.check, b.R, b.info);
    V('commit de 20 h jamais déployé → ❌ « événement perdu »', b.lignes.some(l => l.startsWith('❌') && l.includes('perdu')));
    V('…avec le geste du commit vide', b.lignes.some(l => l.includes('commit vide')));
    const ctxEnCours = monter({ fetch: gh('abc123abc123', 'vieux999', 4),
      apres: c => { c.getGithubToken = () => 'jeton'; } });
    b = bac(); ctxEnCours._sondePagesDeployee_(b.check, b.R, b.info);
    V('commit de 4 min → ⚠️ « en cours », pas de fausse alerte', b.lignes.length === 1 && b.lignes[0].startsWith('⚠️'), b.lignes);
  }

  console.log('— Périodes vs calendrier officiel : la Toussaint fausse d\'une semaine —');
  {
    const feuilles = { 'PERIODES_VAC': [ ['NOM','DATE_DEBUT','DATE_FIN','SEUIL'],
      ['Toussaint', '2027-10-16', '2027-10-31', 8], ['Noël', '2027-12-18', '2028-01-02', 8] ] };
    /* Forme RÉELLE de setup_annee.gs l.165 : PAS de champ concept — c'est
       précisément ce qui a rendu la sonde muette en production le 27/08 au soir. */
    const officiel = [ { nom:'Toussaint', debut:'2027-10-23', fin:'2027-11-07', seuil:8, estime:false },
                       { nom:'Noël', debut:'2027-12-18', fin:'2028-01-02', seuil:8, estime:false } ];
    const ctx = monter({ feuilles, apres: c => { c.proposerVacances = () => officiel; } });
    let b = bac(); ctx._sondePeriodesOfficiel_(b.check, b.R, b.info, 2027);
    const err = b.lignes.find(l => l.startsWith('❌'));
    V('l\'écart Toussaint est ❌, les deux dates citées', !!err && err.includes('2027-10-16') && err.includes('2027-10-23'), err);
    V('…avec le geste : corriger À LA MAIN (l\'import n\'écrase pas)', b.lignes.some(l => l.includes('À LA MAIN')));
    V('Noël, juste, n\'est pas accusé', !b.lignes.some(l => l.startsWith('❌') && l.includes('Noël')));
    // après correction : tout vert
    feuilles['PERIODES_VAC'][1] = ['Toussaint', '2027-10-23', '2027-11-07', 8];
    const ctx2 = monter({ feuilles, apres: c => { c.proposerVacances = () => officiel; } });
    b = bac(); ctx2._sondePeriodesOfficiel_(b.check, b.R, b.info, 2027);
    V('après correction : dates exactes, ✅', b.lignes.length === 1 && b.lignes[0].startsWith('✅') && b.lignes[0].includes('2'), b.lignes);
    V('le cache 24 h a été posé (une interrogation API par jour)', ctx2._props.has('DIAG_VACAPI_2027'));
  }

  console.log('— STATS : les positions que code.gs lit à l\'aveugle —');
  {
    const entete = ['MEDECIN','CIBLE','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','CIBLE SAM','CIBLE JEU','CIBLE VD','x','CIBLE VJF'];
    const ctx = monter({ feuilles: { 'STATS_GARDES_2026': [entete] } });
    let b = bac(); ctx._sondeStatsEntetes_(b.check, b.R, 2026);
    V('en-têtes en place, année sans colonne fériés → ✅', b.lignes.length === 1 && b.lignes[0].startsWith('✅'), b.lignes);
    /* (05/09/2026) Une année générée porte en plus CIBLE JF (23e). Elle doit être
       contrôlée là, et seulement là. */
    const avecJf = entete.concat(['CIBLE JF']);
    const ctxJf = monter({ feuilles: { 'STATS_GARDES_2027': [avecJf] } });
    b = bac(); ctxJf._sondeStatsEntetes_(b.check, b.R, 2027);
    V('année avec colonne fériés → ✅ et les 7 colonnes annoncées',
      b.lignes.length === 1 && b.lignes[0].startsWith('✅') && b.lignes[0].includes('7 colonnes'), b.lignes);
    const jfFaux = entete.concat(['AUTRE CHOSE']);
    const ctxJfKo = monter({ feuilles: { 'STATS_GARDES_2027': [jfFaux] } });
    b = bac(); ctxJfKo._sondeStatsEntetes_(b.check, b.R, 2027);
    V('colonne fériés déplacée → ❌', b.lignes.some(l => l.startsWith('❌') && l.includes('CIBLE JF')), b.lignes);
    const deplace = entete.slice(); deplace[17] = 'AUTRE CHOSE';
    const ctx2 = monter({ feuilles: { 'STATS_GARDES_2026': [deplace] } });
    b = bac(); ctx2._sondeStatsEntetes_(b.check, b.R, 2026);
    V('colonne déplacée → ❌ « par position », geste inclus', b.lignes.some(l => l.startsWith('❌') && l.includes('POSITION')) && b.lignes.some(l => l.includes('LE GESTE')));
  }

  console.log('— La sentinelle : muette au vert, un mail au premier ❌ —');
  {
    const t = Date.now();
    const ghOK = (url) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(
      url.includes('/git/ref/') ? { object: { sha: 'x1' } } : url.includes('/actions/runs') ? { workflow_runs: [{ head_sha: 'x1' }] } : url.includes('workers.dev') ? { ok: true, service: 'miroir banc' } : {} ) });
    const propsVerts = {};
    ['journalAppliquer','miroirSyncComplet','miroirDocuments','expirerEchanges','runVeille','diagSentinelle'].forEach(n => propsVerts['BAT_' + n] = String(t - 60000));
    propsVerts['NOTIF_ACTIVE'] = 'N';
    const feuilles = { 'CONFIG': [ ['CLE','VALEUR'], ['DIAG_EMAIL', 'chef@exemple.fr'] ] };
    const ctxVert = monter({ props: propsVerts, fetch: ghOK, feuilles, apres: c => { c.getGithubToken = () => 'jeton'; c.logAction = () => {}; } });
    ctxVert.diagSentinelle();
    V('tout vert → AUCUN mail (le contrat)', ctxVert._mails.length === 0, ctxVert._mails);
    V('la sentinelle a posé son propre battement', Number(ctxVert._props.get('BAT_diagSentinelle')) >= t);
    const propsKO = Object.assign({}, propsVerts, { 'BAT_journalAppliquer': String(t - 7 * 3600000) });
    const ctxKO = monter({ props: propsKO, fetch: ghOK, feuilles, apres: c => { c.getGithubToken = () => 'jeton'; c.logAction = () => {}; } });
    ctxKO.diagSentinelle();
    V('un battement mort → UN mail, objet ❌ SENTINELLE', ctxKO._mails.length === 1 && ctxKO._mails[0].b.includes('❌ SENTINELLE'), ctxKO._mails.map(m => m.b));
    V('le corps porte le geste, sans préfixe ✅ parasite', /\n→ LE GESTE/.test(ctxKO._mails[0].c), ctxKO._mails[0].c.slice(0, 300));
    V('…et la dernière ligne du contrat', ctxKO._mails[0].c.includes('ce mail n\'existe pas'));
    const src2 = require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */;
    V('la sonde relais interroge la RACINE du worker (pas de route /health)', src2.indexOf("workers.dev/health'") === -1 && src2.indexOf('Relais de lecture en service') !== -1);
    V('…et sa panne a un geste (Cloudflare)', src2.indexOf('worker miroir') !== -1);
  }

  console.log('— (12/11/2026) La sentinelle regarde AUSSI les données, jours à venir, chaque année suivie —');
  {
    /* Un monde qui ne vieillit pas : l'année active est 2099 (tout est à venir) ou
       2020 (tout est passé). Six MARs, une garde et une garde mater par jour, le
       repos le lendemain. */
    const t = Date.now();
    const ghOK = (url) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(
      url.includes('/git/ref/') ? { object: { sha: 'x1' } } : url.includes('/actions/runs') ? { workflow_runs: [{ head_sha: 'x1' }] } : url.includes('workers.dev') ? { ok: true, service: 'miroir banc' } : {} ) });
    const propsVerts = {};
    ['journalAppliquer','miroirSyncComplet','miroirDocuments','expirerEchanges','runVeille','diagSentinelle'].forEach(n => propsVerts['BAT_' + n] = String(t - 60000));
    propsVerts['NOTIF_ACTIVE'] = 'N';
    const NJ = 364, ids = ['MAR01','MAR02','MAR03','MAR04','MAR05','MAR06'];
    /* Le vrai socle de code.gs : calendrier, fériés, colonnes de MEDECINS, et les
       deux tables de codes que le contrôle réutilise — pas des imitations. */
    const codeGs = fs.readFileSync('../gas/code.gs', 'utf8');
    const constante = n => { const m = codeGs.match(new RegExp('^const ' + n + ' = [\\s\\S]*?;\\s*$', 'm')); if (!m) throw new Error('constante introuvable : ' + n); return m[0].replace(/^const /, 'var '); };
    const socle = c => {
      ['getPremierJourPlanning', 'buildDateToCol', 'reconstruireDatesHeaders', 'getJoursFeries', '_medecinsRows_'].forEach(n => vm.runInContext(require('./stubs').extraireFonction('../gas/code.gs', n), c));
      ['COL_MED', 'ABSENT_CODES', 'NOTIF_STATUTS'].forEach(n => vm.runInContext(constante(n), c));
    };
    const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const premierJour = y => { const c = vm.createContext({ Date }); vm.runInContext(require('./stubs').extraireFonction('../gas/code.gs', 'getPremierJourPlanning'), c); return c.getPremierJourPlanning(y); };
    const p2 = n => String(n).padStart(2, '0');
    const jourN = (y, j) => { const d = new Date(premierJour(y).getTime()); d.setDate(d.getDate() + j); return d; };
    const dsN = (y, j) => { const d = jourN(y, j); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    const indispos = (y, lignes) => {
      const h = [0, 1, 2].map(() => new Array(NJ + 1).fill(''));
      for (let j = 0; j < NJ; j++) { const d = jourN(y, j); if (j === 0 || d.getDate() === 1) h[0][1 + j] = MOIS[d.getMonth()] + (j === 0 ? ' ' + y : ''); h[2][1 + j] = d.getDate(); }
      (lignes || ids).forEach(id => h.push([id].concat(new Array(NJ).fill(''))));
      return h;
    };
    const medecins = extra => [['ID','NOM','INITIALES','ACTIF','QUOTITE','PCT_GARDES','CODE','EMAIL','DECT','DATE_DEBUT','DATE_FIN']]
      .concat(ids.map(id => [id, id, id, 'O', 100, 100, '', '', '', '', ''])).concat(extra || []);
    const gardes = () => {
      const g = [0, 1, 2].map(() => new Array(NJ + 1).fill(''));   // trois lignes d'en-tête, à la largeur de l'année
      ids.forEach(id => g.push([id].concat(new Array(NJ).fill(''))));
      for (let j = 0; j < NJ; j++) {
        g[3 + (j % 6)][1 + j] = 'G'; g[3 + ((j + 3) % 6)][1 + j] = 'G2';
        if (j + 1 < NJ) { g[3 + (j % 6)][2 + j] = 'RG'; g[3 + ((j + 3) % 6)][2 + j] = 'RG'; }
      }
      return g;
    };
    const monde = (annee, o) => {
      o = o || {};
      const feuilles = { 'CONFIG': [ ['CLE','VALEUR'], ['DIAG_EMAIL', 'chef@exemple.fr'] ] };
      feuilles['GARDES_' + annee] = o.gardes || gardes();
      feuilles['MEDECINS'] = o.medecins || medecins();
      if (o.indispos !== false) feuilles['INDISPOS_' + annee] = o.indispos || indispos(annee);
      if (o.suivante) feuilles['INDISPOS_' + (annee + 1)] = indispos(annee + 1);
      if (o.suivante) feuilles['GARDES_' + (annee + 1)] = o.suivante;
      if (o.liens !== false) { feuilles['LIENS_R_' + annee] = [['SAMEDI','MED','R']]; feuilles['LIENS_R_' + (annee + 1)] = [['SAMEDI','MED','R']]; }
      const vus = [];
      const ctx = monter({ props: Object.assign({}, propsVerts), fetch: ghOK, feuilles, apres: c => {
        c.getGithubToken = () => 'jeton'; c.logAction = () => {}; c.getActiveYear = () => annee;
        /* le vrai calendrier du planning (code.gs), pas une imitation */
        socle(c);
        if (o.echanges) { c._echangesLignes_ = () => ({ lignes: o.echanges }); c._echangesMotifSansObjet_ = d => d.MOTIF || ''; c._recupsAujourdhui_ = () => '2099-01-01'; c._recupsContexte_ = () => ({}); }
        c.recupsReparer = (y, ecrire) => { vus.push([y, ecrire]); return { actions: (o.recups || {})[y] || [] }; };
      } });
      ctx.diagSentinelle();
      return { mails: ctx._mails, vus, ctx };
    };
    let m = monde(2099);
    V('planning complet et récupérations à jour → AUCUN mail (le contrat tient)', m.mails.length === 0, m.mails.map(x => x.c));
    {
      /* Garde-fou du test lui-même : « aucun mail » ne vaut que si le contrôle a
         réellement tourné (un contrôle en panne ne rend qu'un ⚠️, donc pas de mail). */
      const b = bac(); const f = { 'GARDES_2099': gardes() };
      const cx = monter({ feuilles: f, apres: socle });
      cx._diagIntegriteGardes_(2099, b.check, b.info, b.R, null, true);
      V('le contrôle a bien tourné : 7 réponses, toutes ✅, aucune « impossible »', b.lignes.length === 7 && b.lignes.every(l => l.startsWith('✅')) && !b.lignes.some(l => l.includes('impossible')), b.lignes);
      V('…et il a vraiment lu les 364 jours du planning', Object.keys(cx.buildDateToCol(f['GARDES_2099'], 2099)).length === 364);
    }
    V('les récupérations sont lues en APERÇU, jamais réparées par la sentinelle', m.vus.length === 1 && m.vus[0][0] === 2099 && m.vus[0][1] === false, m.vus);

    const troue = gardes(); troue[3 + (100 % 6)][1 + 100] = '';
    m = monde(2099, { gardes: troue });
    V('un jour À VENIR sans garde → UN mail', m.mails.length === 1 && m.mails[0].b.includes('❌ SENTINELLE'), m.mails.map(x => x.b));
    V('…qui nomme le planning et le jour', m.mails.length === 1 && m.mails[0].c.includes('Planning 2099') && m.mails[0].c.includes('2099-04-1'), m.mails[0] && m.mails[0].c.slice(-900));

    const passe = gardes(); passe[3 + (100 % 6)][1 + 100] = '';
    m = monde(2020, { gardes: passe });
    V('le même trou dans le PASSÉ → aucun mail (la sentinelle ne juge que ce qui reste à venir)', m.mails.length === 0, m.mails.map(x => x.c.slice(-600)));

    m = monde(2099, { recups: { 2099: [{ med: 'MAR02', samedi: '2099-05-09', quoi: 'pose' }] } });
    V('une récupération de samedi MANQUANTE → UN mail, MAR et samedi cités', m.mails.length === 1 && m.mails[0].c.includes('MAR02') && m.mails[0].c.includes('2099-05-09') && m.mails[0].c.includes('à poser'), m.mails.map(x => x.c.slice(-500)));
    V('…avec le geste', m.mails.length === 1 && /\n→ LE GESTE : page Maintenance → Récupérations de samedi/.test(m.mails[0].c));
    m = monde(2099, { recups: { 2099: [{ med: 'MAR02', samedi: '2099-05-09', quoi: 'sansDate' }] } });
    V('« aucune date possible » est dit en clair (le mot du réparateur est sansDate)', m.mails.length === 1 && m.mails[0].c.includes('aucune date possible') && !m.mails[0].c.includes('sansDate'), m.mails.map(x => x.c.slice(-400)));
    m = monde(2099, { recups: { 2099: [{ med: 'MAR02', samedi: '2099-05-09', quoi: 'retrait' }] } });
    V('une récupération EN TROP ne réveille personne (vigilance, pas d\'alerte)', m.mails.length === 0, m.mails.map(x => x.c.slice(-400)));

    /* L'année suivante, dès qu'elle est générée — c'est elle que rien ne regardait. */
    const suivTrouee = gardes(); suivTrouee[3 + (50 % 6)][1 + 50] = '';
    m = monde(2099, { suivante: suivTrouee });
    V('année SUIVANTE générée, un jour sans garde → UN mail qui nomme le planning suivant', m.mails.length === 1 && m.mails[0].c.includes('Planning 2100'), m.mails.map(x => x.c.slice(-600)));
    m = monde(2099, { suivante: gardes(), recups: { 2100: [{ med: 'MAR05', samedi: '2100-02-06', quoi: 'pose' }] } });
    V('…et ses récupérations sont suivies aussi', m.mails.length === 1 && m.mails[0].c.includes('MAR05') && m.vus.length === 2, m.vus);
    m = monde(2099, { liens: false, recups: { 2099: [{ med: 'MAR02', samedi: '2099-05-09', quoi: 'pose' }] } });
    V('année sans suivi des récupérations → contrôle sans objet, le réparateur n\'est pas appelé', m.mails.length === 0 && m.vus.length === 0, m.vus);

    console.log('— (12/11/2026) Morceau 3 : code inconnu, MAR sans ligne, 18 h, trois gardes en six jours, demandes —');
    {
      /* Garde-fou : les contrôles tournent vraiment dans ce monde (sinon tout « aucun mail » serait vide de sens). */
      const b = bac(); const f = { 'GARDES_2099': gardes(), 'INDISPOS_2099': indispos(2099), 'MEDECINS': medecins() };
      const cx = monter({ feuilles: f, apres: socle });
      cx._diagCodesEtLignes_(2099, b.check, b.info, b.R, b.R.ERR);
      V('monde sain : trois réponses, toutes ✅, rien d\'« invérifiable »', b.lignes.length === 3 && b.lignes.every(l => l.startsWith('✅')), b.lignes);
      V('les codes connus viennent des tables du serveur (CTP et CP sont connus sans être recopiés)', cx._diagCodesConnus_().gardes.has('CTP') && cx._diagCodesConnus_().gardes.has('CP') && cx._diagCodesConnus_().indispos.has('SOUHAIT'));
      V('l\'onglet des indisponibilités est bien daté sur toute l\'année, queue de janvier comprise', cx.reconstruireDatesHeaders(f['INDISPOS_2099'], 2099)[363] === dsN(2099, 363), cx.reconstruireDatesHeaders(f['INDISPOS_2099'], 2099)[363]);
    }
    /* Une case « FORM » dans les gardes : le code des indisponibilités, que le planning ne lit pas. */
    let gx = gardes(); gx[3 + 1][1 + 200] = 'FORM';
    m = monde(2099, { gardes: gx });
    V('code inconnu dans une case À VENIR des gardes → UN mail : MAR, jour et code cités', m.mails.length === 1 && m.mails[0].c.includes('MAR02 ' + dsN(2099, 200) + ' « FORM »') && m.mails[0].c.includes('IGNORE'), m.mails.map(x => x.c.slice(-700)));
    V('…avec le geste', m.mails.length === 1 && /\n→ LE GESTE : corriger la case/.test(m.mails[0].c));
    gx = gardes(); gx[3 + 1][1 + 200] = 'FORM';
    m = monde(2020, { gardes: gx });
    V('le même code dans le PASSÉ → aucun mail', m.mails.length === 0, m.mails.map(x => x.c.slice(-500)));
    let ix = indispos(2099); ix[3][1 + 30] = 'VAC'; ix[4][1 + 31] = 'SOUHAIT'; ix[5][1 + 32] = 'TPA'; ix[6][1 + 33] = 'INDISPO';
    m = monde(2099, { indispos: ix });
    V('les codes des indisponibilités (VAC, SOUHAIT, TPA, INDISPO) sont connus → aucun mail', m.mails.length === 0, m.mails.map(x => x.c.slice(-500)));
    ix = indispos(2099); ix[3][1 + 30] = 'VACS';
    m = monde(2099, { indispos: ix });
    V('faute de frappe dans les indisponibilités → UN mail, onglet nommé', m.mails.length === 1 && m.mails[0].c.includes('« VACS » (indisponibilités)'), m.mails.map(x => x.c.slice(-500)));

    /* Le cas vécu : un MAR actif, arrivé en cours d'année, sans ligne. */
    m = monde(2099, { medecins: medecins([['MAR07', 'x', 'x', 'O', 100, 100, '', '', '', '2099-03-01', '']]) });
    V('MAR actif sans ligne dans les gardes → UN mail qui nomme le MAR, avec le geste', m.mails.length === 1 && /❌ MARs actifs sans ligne dans les gardes 2099 : MAR07/.test(m.mails[0].c) && m.mails[0].c.includes('→ LE GESTE : ajouter la ligne du MAR dans GARDES_2099'), m.mails.map(x => x.c.slice(-600)));
    m = monde(2099, { indispos: indispos(2099, ids.slice(0, 5)) });
    V('ligne manquante dans les seules indisponibilités (arrivée en cours d\'année) → AUCUN mail', m.mails.length === 0, m.mails.map(x => x.c.slice(-500)));
    {
      const b = bac(); const cx = monter({ feuilles: { 'GARDES_2099': gardes(), 'INDISPOS_2099': indispos(2099, ids.slice(0, 5)), 'MEDECINS': medecins() }, apres: socle });
      cx._diagCodesEtLignes_(2099, b.check, b.info, b.R, b.R.ERR);
      V('…mais le rapport du lundi le mentionne en ⚠️, MAR cité', b.lignes.some(l => l.startsWith('⚠️') && l.includes('indisponibilités 2099 : MAR06')) && !b.lignes.some(l => l.startsWith('❌')), b.lignes);
    }
    m = monde(2099, { medecins: medecins([['MAR07', 'x', 'x', 'N', 100, 100, '', '', '', '', ''], ['MAR08', 'x', 'x', 'O', 100, 100, '', '', '', '', '2098-06-30'], ['MAR09', 'x', 'x', 'O', 100, 100, '', '', '', '2101-01-01', '']]) });
    V('inactif, déjà parti, pas encore arrivé : aucune ligne attendue → aucun mail', m.mails.length === 0, m.mails.map(x => x.c.slice(-500)));

    /* Rapport du lundi : vigilance, jamais d'alerte. */
    {
      const lundi = (g) => { const b = bac(); const cx = monter({ feuilles: { 'GARDES_2099': g, 'MEDECINS': medecins() }, apres: socle }); cx._diagRythme_(2099, b.check, b.info, b.R); return b.lignes; };
      const c = vm.createContext({ Math, Date, String, Set }); vm.runInContext(require('./stubs').extraireFonction('../gas/code.gs', 'getJoursFeries'), c);
      const jf = new Set([...c.getJoursFeries(2099), ...c.getJoursFeries(2100)]);
      const ouvre = j => { const dow = jourN(2099, j).getDay(); return dow !== 0 && dow !== 6 && !jf.has(dsN(2099, j)); };
      const g18 = gardes();
      for (let j = 0; j < NJ; j++) if (ouvre(j)) g18[3 + ((j + 1) % 6)][1 + j] = '18';   // (j+1)%6 : ni de garde ni de repos ce jour-là
      let l = lundi(g18);
      V('18 h posé chaque jour ouvré (fériés exclus) → ✅', l[0].startsWith('✅') && l[0].includes('sans 18 h : aucun'), l[0]);
      V('…et le monde contient bien des fériés en semaine (sinon l\'exclusion ne serait pas éprouvée)', [...jf].some(d => d.startsWith('2099') && [1, 2, 3, 4, 5].includes(new Date(d + 'T12:00:00').getDay())));
      let j0 = 60; while (!ouvre(j0)) j0++;
      g18[3 + ((j0 + 1) % 6)][1 + j0] = '';
      l = lundi(g18);
      V('un jour ouvré sans 18 h → ⚠️ (pas ❌), le jour cité', l[0].startsWith('⚠️') && l[0].includes(dsN(2099, j0)) && l[0].includes(' 1 →'), l[0]);
      const serre = [0, 1, 2].map(() => new Array(NJ + 1).fill('')); ids.forEach(id => serre.push([id].concat(new Array(NJ).fill(''))));
      [10, 12, 15].forEach(j => { serre[3][1 + j] = 'G'; }); [40, 43, 46].forEach(j => { serre[4][1 + j] = 'G2'; });
      l = lundi(serre);
      V('gardes à J, J+2, J+5 → ⚠️ « trois gardes en six jours », MAR cité', l[1].startsWith('⚠️') && l[1].includes('MAR01') && l[1].includes(' 1 →'), l[1]);
      V('gardes à J, J+3, J+6 (sept jours) → pas signalé', !l[1].includes('MAR02'), l[1]);
    }
    {
      const b = bac(); const cx = monter({ apres: c => { c._echangesLignes_ = () => ({ lignes: [{ ID: 'E1', ETAT: 'attente', ANNEE: 2099 }, { ID: 'E2', ETAT: 'attente', ANNEE: 2099, MOTIF: 'la garde est passée' }, { ID: 'E3', ETAT: 'acceptee', ANNEE: 2099, MOTIF: 'x' }] }); c._echangesMotifSansObjet_ = d => d.MOTIF || ''; c._recupsAujourdhui_ = () => '2099-01-01'; c._recupsContexte_ = () => ({}); } });
      cx._diagDemandes_(b.check, b.info, b.R);
      V('demande en attente sans objet → ⚠️ le lundi, la demande et son motif cités ; une demande close n\'est pas comptée', b.lignes.length === 1 && b.lignes[0].startsWith('⚠️') && b.lignes[0].includes('E2 (la garde est passée)') && b.lignes[0].includes(': 2 ') && !b.lignes[0].includes('E3'), b.lignes);
    }
    m = monde(2099, { echanges: [{ ID: 'E2', ETAT: 'attente', ANNEE: 2099, MOTIF: 'la garde est passée' }] });
    V('…et elle ne déclenche JAMAIS le mail du matin', m.mails.length === 0, m.mails.map(x => x.c.slice(-400)));

    const src3 = fs.readFileSync('../gas/diagnostic.gs', 'utf8');
    V('rapport du lundi : seuls les placements d\'une année ANTÉRIEURE sont un reliquat', src3.includes('Number(ds.slice(0, 4)) < Y') && !src3.includes("!ds.startsWith(String(Y) + '-')) ovHorsAnnee++"));
    V('rapport du lundi : les récupérations passent par le même contrôle, pour chaque année', src3.includes('_diagRecups_(y, check, info, R, R.WARN, true)'));
    V('rapport du lundi : codes, lignes, 18 h, rythme pour chaque année ; demandes une fois', src3.includes('_diagCodesEtLignes_(y, check, info, R, R.ERR);\n      _diagRythme_(y, check, info, R);') && src3.includes('_diagDemandes_(check, info, R);'));
  }

  console.log('— Les intégrations réelles (les stubs avaient masqué deux absences) —');
  {
    const src = require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */;
    V('la sonde Pages utilise getGithubToken (l\'accesseur qui EXISTE)', src.includes('const token = getGithubToken()'));
    V('…et plus jamais _githubToken_', !/_githubToken_\(\)/.test(src));
    V('la sonde périodes dérive le concept du NOM (l\'API n\'a pas de champ concept)', src.includes('conceptDe(String(o.nom))'));
    V('le cas « rien de comparable » parle au lieu de se taire', src.includes('aucune ligne du classeur ne correspond'));
  }

  console.log('— L\'installateur et le rendu admin —');
  {
    const ctx = monter();
    V('installerSentinelle existe (déclencheur quotidien 6 h)', typeof ctx.installerSentinelle === 'function');
    /* (01/11/2026) Le rendu du diagnostic a suivi l'outil sur maintenance.html. */
    const adm = fs.readFileSync('../maintenance.html', 'utf8');
    V('la page Maintenance rend les chapitres ══ en bandeaux', adm.includes('diag-chap') && adm.includes("startsWith('══')"));
    V('la page Maintenance rend « → LE GESTE » en encadré rouge', adm.includes('diag-geste') && adm.includes('→ LE GESTE'));
    V('la page Maintenance prend les compteurs du serveur (le récap n\'est plus compté comme une erreur)', adm.includes('data.nbErr') && adm.includes('problème/'));
    const dh = require('./stubs').sourceGasTout() /* (15/09) Indispos.gs découpé : tout le code serveur métier */;
    V('le regroupement est branché dans le diagnostic', dh.includes('_regrouperEnChapitres_(results.splice(0))'));
    ['journal.gs','miroir.gs','echanges.gs','veille.gs'].forEach(f => {
      const c = fs.readFileSync('../gas/' + f, 'utf8');
      V(`${f} bat (au moins un _bat_)`, /_bat_\('/.test(c));
    });
    V('miroir.gs bat DEUX fois (sync + documents)', (fs.readFileSync('../gas/miroir.gs', 'utf8').match(/_bat_\('/g) || []).length === 2);
  }

  console.log(`\n${ok} OK · ${ko} en échec`);
  process.exit(ko ? 1 : 0);
})();
