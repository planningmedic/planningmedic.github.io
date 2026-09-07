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
  vm.runInContext(fs.readFileSync('../gas/Indispos.gs', 'utf8'), ctx);
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
    const ctx = monter({ props: { 'NOTIF_ACTIVE': 'O', 'NOTIF_EMAIL_TEST': 'arthur@test' } });
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
    const src2 = fs.readFileSync('../gas/Indispos.gs', 'utf8');
    V('la sonde relais interroge la RACINE du worker (pas de route /health)', src2.indexOf("workers.dev/health'") === -1 && src2.indexOf('Relais de lecture en service') !== -1);
    V('…et sa panne a un geste (Cloudflare)', src2.indexOf('worker miroir') !== -1);
  }

  console.log('— Les intégrations réelles (les stubs avaient masqué deux absences) —');
  {
    const src = fs.readFileSync('../gas/Indispos.gs', 'utf8');
    V('la sonde Pages utilise getGithubToken (l\'accesseur qui EXISTE)', src.includes('const token = getGithubToken()'));
    V('…et plus jamais _githubToken_', !/_githubToken_\(\)/.test(src));
    V('la sonde périodes dérive le concept du NOM (l\'API n\'a pas de champ concept)', src.includes('conceptDe(String(o.nom))'));
    V('le cas « rien de comparable » parle au lieu de se taire', src.includes('aucune ligne du classeur ne correspond'));
  }

  console.log('— L\'installateur et le rendu admin —');
  {
    const ctx = monter();
    V('installerSentinelle existe (déclencheur quotidien 6 h)', typeof ctx.installerSentinelle === 'function');
    const adm = fs.readFileSync('../admin.html', 'utf8');
    V('admin rend les chapitres ══ en bandeaux', adm.includes('diag-chap') && adm.includes("startsWith('══')"));
    V('admin rend « → LE GESTE » en encadré rouge', adm.includes('diag-geste') && adm.includes('→ LE GESTE'));
    V('admin prend les compteurs du serveur (le récap n\'est plus compté comme une erreur)', adm.includes('data.nbErr') && adm.includes('problème/'));
    const dh = fs.readFileSync('../gas/Indispos.gs', 'utf8');
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
