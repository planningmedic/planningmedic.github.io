/* ═══════════════════════════════════════════════════════════════════════
   DIAGNOSTIC — Diagnostic complet, hebdo, sentinelle, battements et sondes
   (15/09/2026, chantier 9 — étape 1) Fonctions sorties d'Indispos.gs telles
   quelles : aucune ligne de logique modifiée, seulement déplacée. Le routeur et
   ses aides (checkCode, _deny, _error, doGet/doPost) restent dans Indispos.gs.
   Un seul espace global dans Apps Script : rien à importer. */
const GAS_VERSION_DIAG = '2026-09-15.2';

// ── LOG ───────────────────────────────────────────────────────────────
/* ─────────────────────────────────────────────────────────────────────────────
   diagnosticComplet() — (02/08/2026) extrait du routeur doPost pour pouvoir etre
   lance aussi par un declencheur hebdomadaire. Le corps est INCHANGE : meme
   controles, meme ordre, meme libelles. Seules l'indentation et l'enveloppe de
   sortie changent (objet au lieu de reponse HTTP).
   Retourne { ok, results, nbErr, nbWarn }.
   ───────────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────────
   _versionSiteAnomalies_(sourceJs, pages) — le contrôle de version, sans réseau.
   Reçoit le contenu de version.js et celui de chaque page qui affiche le numéro.
   Rend { version, anomalies:[{fichier, motif}] }. Aucune anomalie = la chaîne
   est alignée sur la source unique.
   Séparée du diagnostic pour une seule raison : ainsi elle se teste au banc avec
   des fichiers fabriqués, y compris les cas fautifs qu'on ne peut pas provoquer
   en production.
   ───────────────────────────────────────────────────────────────────────────── */
function _versionSiteAnomalies_(sourceJs, pages) {
  const m = String(sourceJs || '').match(/window\.SITE_VERSION\s*=\s*'(v[\d.]+)'/);
  if (!m) return { version: null, anomalies: [{ fichier: 'version.js', motif: 'source unique illisible' }] };
  const anomalies = [];
  Object.keys(pages || {}).forEach(fn => {
    const txt = pages[fn];
    if (txt === null || txt === undefined) { anomalies.push({ fichier: fn, motif: 'illisible (dépôt injoignable)' }); return; }
    if (!/src="\.?\.?\/?version\.js"/.test(txt)) anomalies.push({ fichier: fn, motif: 'ne charge pas la source unique → réaligner' });
    if (!/data-version/.test(txt)) anomalies.push({ fichier: fn, motif: 'aucun emplacement où afficher le numéro → réaligner' });
    /* Un numéro EN DUR se reconnaît à sa présence dans du texte affiché ou dans
       une constante. Les mentions d'historique en commentaire restent légitimes. */
    const enDur = (txt.match(/>\s*v\d+\.\d+[^<]*</g) || [])
      .concat(txt.match(/(?:const|let|var)\s+SITE_VERSION\s*=\s*'v[\d.]+'/g) || []);
    if (enDur.length) anomalies.push({ fichier: fn, motif: `numéro écrit en dur (${String(enDur[0]).trim().slice(0, 24)}) → réaligner` });
  });
  return { version: m[1], anomalies: anomalies };
}

// ── Battements de cœur : chaque tâche périodique horodate son passage. ──
function _bat_(nom) {
  try { PropertiesService.getScriptProperties().setProperty('BAT_' + nom, String(Date.now())); } catch (e) {}
}

function _batAge_(nom) {           // minutes depuis le dernier battement, ou null
  try {
    const v = PropertiesService.getScriptProperties().getProperty('BAT_' + nom);
    return v ? Math.round((Date.now() - Number(v)) / 60000) : null;
  } catch (e) { return null; }
}

// Cadences attendues (minutes) et seuil d'alerte — large pour éviter les faux ❌.
function _batAttendus_() {
  return [
    { nom:'journalAppliquer', label:'Journal d\'intentions (les enregistrements des MARs)', alerte:15 },
    { nom:'miroirSyncComplet', label:'Synchronisation horaire de la copie rapide', alerte:180 },
    { nom:'miroirDocuments',  label:'Miroir des documents', alerte:26*60 },
    { nom:'expirerEchanges',  label:'Expiration des échanges', alerte:180 },
    { nom:'runVeille',        label:'Veille bibliographique', alerte:8*24*60 },
    { nom:'diagSentinelle',   label:'La sentinelle quotidienne elle-même', alerte:26*60 }
  ];
}

function _batVerifs_(check, R) {
  let jamais = 0;
  _batAttendus_().forEach(b => {
    const age = _batAge_(b.nom);
    if (age === null) { jamais++; return; }        // pas encore instrumenté / premier tour
    if (age <= b.alerte) check(`${b.label} — dernier battement il y a ${age < 60 ? age + ' min' : Math.round(age/60) + ' h'}`, R.OK);
    else {
      check(`${b.label} NE BAT PLUS — dernier passage il y a ${Math.round(age/60)} h (attendu : < ${b.alerte < 60 ? b.alerte + ' min' : Math.round(b.alerte/60) + ' h'})`, R.ERR);
      check(`   → LE GESTE : Apps Script → Déclencheurs → vérifier « ${b.nom} », le recréer s'il a disparu, puis l'exécuter une fois à la main.`, R.OK);
    }
  });
  if (jamais) check(`${jamais} battement(s) pas encore enregistré(s) — normal juste après le déploiement, chaque tâche s'horodate à son prochain passage`, R.WARN);
}

// ── Sonde : le site sert-il le dernier dépôt ? (l'événement perdu du 26/08) ──
function _sondePagesDeployee_(check, R, info) {
  try {
    const token = getGithubToken();   // (27/08 soir) même accesseur que le test Publication — _githubToken_ n'existait pas
    if (!token) { info('Site déployé : jeton GitHub absent, sonde sautée'); return; }
    const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    const refR = UrlFetchApp.fetch('https://api.github.com/repos/planningmedic/planningmedic.github.io/git/ref/heads/main', { headers: H, muteHttpExceptions: true });
    const runR = UrlFetchApp.fetch('https://api.github.com/repos/planningmedic/planningmedic.github.io/actions/runs?per_page=1&status=success', { headers: H, muteHttpExceptions: true });
    if (refR.getResponseCode() !== 200 || runR.getResponseCode() !== 200) { check('Site déployé : GitHub injoignable pour la sonde (réessayer plus tard)', R.WARN); return; }
    const head = JSON.parse(refR.getContentText()).object.sha;
    const runs = JSON.parse(runR.getContentText()).workflow_runs || [];
    if (!runs.length) { check('Site déployé : aucun déploiement trouvé', R.WARN); return; }
    if (runs[0].head_sha === head) { check('Le site sert le dernier dépôt (déploiement ' + head.slice(0, 7) + ' réussi)', R.OK); return; }
    // HEAD ≠ dernier déploiement : tolérer un déploiement EN COURS (< 15 min)
    const cR = UrlFetchApp.fetch('https://api.github.com/repos/planningmedic/planningmedic.github.io/commits/' + head, { headers: H, muteHttpExceptions: true });
    const age = cR.getResponseCode() === 200 ? (Date.now() - new Date(JSON.parse(cR.getContentText()).commit.committer.date).getTime()) / 60000 : 999;
    if (age < 15) check('Dernier commit poussé il y a ' + Math.round(age) + ' min — déploiement probablement en cours', R.WARN);
    else {
      check('Le site NE SERT PAS le dernier dépôt : commit ' + head.slice(0, 7) + ' (il y a ' + Math.round(age / 60) + ' h) jamais déployé — événement de publication perdu chez GitHub', R.ERR);
      check('   → LE GESTE : pousser un commit vide (« redéclencher la publication ») ou attendre la reprise du service GitHub — le dépôt, lui, est juste.', R.OK);
    }
  } catch (e) { check('Site déployé : sonde en échec (' + e.message + ')', R.WARN); }
}

// ── Sonde : PERIODES_VAC vs calendrier officiel (aurait attrapé Toussaint 2027) ──
function _sondePeriodesOfficiel_(check, R, info, annee) {
  try {
    // Cache 24 h : l'API du ministère n'est interrogée qu'une fois par jour.
    const P = PropertiesService.getScriptProperties();
    const cleCache = 'DIAG_VACAPI_' + annee;
    let officiel = null;
    try {
      const c = JSON.parse(P.getProperty(cleCache) || 'null');
      if (c && Date.now() - c.t < 24 * 3600 * 1000) officiel = c.p;
    } catch (e) {}
    if (!officiel) {
      officiel = proposerVacances(annee).filter(p => !p.estime);
      P.setProperty(cleCache, JSON.stringify({ t: Date.now(), p: officiel }));
    }
    if (!officiel.length) { info('Périodes ' + annee + ' : arrêté pas encore publié (ou API muette) — rien à comparer'); return; }
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PERIODES_VAC');
    if (!sh) return;
    const data = sh.getDataRange().getValues();
    const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const dstr = v => (v instanceof Date) ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v).trim().slice(0, 10);
    let compares = 0, ecarts = [];
    officiel.forEach(o => {
      // (27/08 soir) le concept se DÉRIVE du nom : les périodes issues de l'API
      // n'ont pas de champ concept — comparer dessus rendait la sonde muette.
      const oc = conceptDe(String(o.nom));
      if (!oc) return;
      for (let r = 1; r < data.length; r++) {
        if (conceptDe(String(data[r][0])) === oc && dstr(data[r][1]).startsWith(String(annee))) {
          compares++;
          if (dstr(data[r][1]) !== o.debut || (oc !== 'ete' && dstr(data[r][2]) !== o.fin))
            ecarts.push(`${data[r][0]} : classeur ${dstr(data[r][1])}→${dstr(data[r][2])} · officiel ${o.debut}→${o.fin}`);
          break;
        }
      }
    });
    if (ecarts.length) {
      check(`Périodes ${annee} : ${ecarts.length} écart(s) avec le calendrier officiel — ${ecarts.join(' · ')}`, R.ERR);
      check('   → LE GESTE : corriger la ou les lignes À LA MAIN dans PERIODES_VAC (l\'import n\'écrase pas une ligne existante).', R.OK);
    } else if (compares) check(`Périodes ${annee} : ${compares} période(s) comparée(s) au calendrier officiel — dates exactes`, R.OK);
    else info(`Périodes ${annee} : le calendrier officiel est publié mais aucune ligne du classeur ne correspond — vérifier PERIODES_VAC`);
  } catch (e) { check('Périodes vs officiel : sonde en échec (' + e.message + ')', R.WARN); }
}

// ── Regroupement en trois questions — PUR AFFICHAGE, aucun contrôle déplacé. ──
function _regrouperEnChapitres_(lignes) {
  const CHAP = {
    'Publication (test réel)':1, 'Site déployé':1, 'Miroir Cloudflare':1,
    'Publication JSON (Drive)':1, 'Version du site':1,
    'Environnement':2, 'Battements de cœur':2, 'Journal d\'intentions':2,
    'Sauvegarde automatique':2, 'Code déployé vs dépôt':2
  };
  const TITRES = { 1:'══ 1 · Ce que les MARs voient est-il juste et à jour ? ══',
                   2:'══ 2 · Les automatismes tournent-ils ? ══',
                   3:'══ 3 · Les données sont-elles saines ? ══' };
  const blocs = { 1:[], 2:[], 3:[] }; let courant = null; const queue = [];
  lignes.forEach(l => {
    if (l.startsWith('── ')) {
      const nom = l.slice(3).replace(/─+\s*$/, '').trim();
      let ch = 3;
      Object.keys(CHAP).forEach(k => { if (nom.indexOf(k) === 0) ch = CHAP[k]; });
      courant = blocs[ch]; courant.push(l);
    } else if (l.startsWith('────')) { courant = null; queue.push(l); }
    else if (courant) courant.push(l);
    else queue.push(l);                       // résumé final + chrono, après les chapitres
  });
  const out = [];
  [1, 2, 3].forEach(c => { if (blocs[c].length) { out.push(TITRES[c]); out.push.apply(out, blocs[c]); } });
  return out.concat(queue);
}

function diagnosticComplet() {
    const results = [];
    let ok = true;
    const R = { OK:1, WARN:2, ERR:3 };
    function check(label, level) {
      if (level === true || level === R.OK) results.push(`✅ ${label}`);
      else if (level === R.WARN) results.push(`⚠️ ${label}`);
      else { results.push(`❌ ${label}`); ok = false; }
    }
    const info = t => results.push(`ℹ️ ${t}`);
    const hdr  = t => results.push(`── ${t} ${'─'.repeat(Math.max(0,32-t.length))}`);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const has = n => !!ss.getSheetByName(n);
    const rows = n => { const sh = ss.getSheetByName(n); return sh ? sh.getLastRow() : 0; };
    const Y  = getActiveYear();
    const N1 = Y + 1;
    const t0 = Date.now();

    // ── 0. Environnement d'exécution ──
    hdr('Environnement');
    try {
      const tzS = Session.getScriptTimeZone(), tzC = ss.getSpreadsheetTimeZone();
      if (tzS === tzC) check(`Fuseau horaire cohérent (${tzS})`, R.OK);
      else check(`Fuseaux DIFFÉRENTS : script « ${tzS} » vs classeur « ${tzC} » — risque de décalage de dates (à aligner dans les paramètres)`, R.ERR);
    } catch (e) { check('Fuseau horaire illisible : ' + e.message, R.WARN); }
    try {
      const q = MailApp.getRemainingDailyQuota();
      // Seuil calé sur l'effectif RÉEL (compte gratuit = 100 emails/jour) :
      // en dessous d'un envoi complet, un groupé serait refusé.
      const besoin = _marsAvecEmail_();
      if (q >= besoin * 2) check(`Quota email : ${q} envois restants aujourd'hui (un envoi groupé en demande ${besoin})`, R.OK);
      else if (q >= besoin) check(`Quota email : ${q} restants — de quoi faire UN seul envoi groupé (${besoin}) aujourd'hui`, R.WARN);
      else check(`Quota email insuffisant : ${q} restants pour ${besoin} destinataires — tout envoi groupé sera refusé jusqu'à demain`, R.ERR);
    } catch (e) { info('Quota email non consultable : ' + e.message); }
    try {
      const lk = LockService.getScriptLock();
      if (lk.tryLock(3000)) { lk.releaseLock(); check('Verrou de script disponible (enregistrements protégés)', R.OK); }
      else check('Verrou de script occupé — une exécution longue est en cours, relancer dans une minute', R.WARN);
    } catch (e) { check('Verrou de script indisponible : ' + e.message, R.WARN); }
    try {
      const trigs = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
      info(`Déclencheur(s) installé(s) : ${trigs.length ? trigs.join(', ') : 'aucun'}`);
    } catch (e) {}

    // ── 1. Onglets de base (toujours requis) ──
    hdr('Onglets de base');
    ['CONFIG','MEDECINS','HISTORIQUE','PERIODES_VAC','GROUPES_VAC'].forEach(n =>
      check(`Onglet ${n}`, has(n) ? R.OK : R.ERR));
    // Onglets créés à l'usage : absence = simple info
    ['PLANNING_OVERRIDES','LOGS','CONNEXIONS'].forEach(n =>
      has(n) ? check(`Onglet ${n}`, R.OK) : info(`Onglet ${n} pas encore créé (normal tant qu'inutilisé)`));

    // ── 2. Configuration ──
    hdr('Configuration');
    const cfgSheet = ss.getSheetByName('CONFIG');
    const cfg = {};
    if (cfgSheet) {
      const cd = cfgSheet.getDataRange().getValues();
      for (let r = 1; r < cd.length; r++) cfg[String(cd[r][0]).trim()] = String(cd[r][1]).trim();
    }
    check('ANNEE_ACTIVE présente', cfg['ANNEE_ACTIVE'] ? R.OK : R.ERR);
    check(`ANNEE_ACTIVE cohérente (= ${Y})`, String(cfg['ANNEE_ACTIVE']) === String(Y) ? R.OK : R.WARN);
    // ── Fenetre de cloture ────────────────────────────────────────────────
    // Une annee de planning commence le PREMIER LUNDI. Cloturer AVANT ferait
    // disparaitre du portail les gardes des tout premiers jours de janvier, qui
    // appartiennent encore a l'annee ecoulee. Cloturer en retard n'est qu'un
    // inconfort d'affichage : on informe, on n'alerte pas.
    (function () {
      const _lundi = getPremierJourPlanning(Y + 1);
      const _lundiTxt = Utilities.formatDate(_lundi, ss.getSpreadsheetTimeZone(), 'EEEE d MMMM yyyy');
      // getPremierJourPlanning renvoie MIDI (protection changement d'heure) : comparer
      // l'instant courant a midi masquerait la bascule toute la matinee du jour J.
      const _lundi0 = new Date(_lundi.getFullYear(), _lundi.getMonth(), _lundi.getDate(), 0, 0, 0);
      if (new Date() < _lundi0) {
        info(`Clôture de ${Y} : à faire à partir du ${_lundiTxt} — surtout pas avant`);
      } else {
        check(`Clôture de ${Y} attendue depuis le ${_lundiTxt}`, R.WARN);
      }
    })();
    check('ADMIN_CODE présent', cfg['ADMIN_CODE'] ? R.OK : R.ERR);
    check('Clé de publication GITHUB_TOKEN présente', cfg['GITHUB_TOKEN'] ? R.OK : R.ERR);

    // ── 3. Publication GitHub (test réel de la clé) ──
    hdr('Publication (test réel)');
    try {
      const tok = getGithubToken();
      if (!tok) {
        check('Clé de publication lisible', R.ERR);
      } else {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/branches/${GITHUB_BRANCH}`;
        const resp = UrlFetchApp.fetch(url, {
          method: 'get',
          headers: { Authorization: 'token ' + tok, Accept: 'application/vnd.github+json' },
          muteHttpExceptions: true
        });
        const code = resp.getResponseCode();
        if (code === 200) {
          check('Connexion GitHub OK (le planning peut être publié)', R.OK);
          const exp = (resp.getAllHeaders() || {})['github-authentication-token-expiration'];
          if (exp) {
            const days = Math.round((new Date(String(exp)) - new Date()) / 86400000);
            /* (2026-08-05.13) Le jour où ce jeton expire, la PUBLICATION
               s'arrête net : les MAR ne voient plus aucune mise à jour, et
               rien ne le dit à l'écran du comité. Un simple « ℹ️ » à 14 jours
               se noie dans un diagnostic de 90 lignes. Trois paliers, avec un
               ROUGE franc quand il reste moins de deux semaines de marge. */
            const _tk = _diagNiveauToken_(days);
            if (_tk.niveau === 'ERR') check(_tk.message, R.ERR);
            else if (_tk.niveau === 'WARN') check(_tk.message, R.WARN);
            else info(_tk.message);
          } else info('Token GitHub sans date d\'expiration');
        } else if (code === 401) {
          check('Token GitHub invalide/expiré (401) — publications impossibles', R.ERR);
        } else if (code === 404) {
          check(`Dépôt/branche introuvable (404) — vérifier ${GITHUB_USER}/${GITHUB_REPO}@${GITHUB_BRANCH}`, R.ERR);
        } else {
          check(`Réponse GitHub inattendue (${code})`, R.WARN);
        }
      }
    } catch (e) {
      check('Connexion GitHub impossible : ' + e.message, R.WARN);
    }

    // ── 3bis. Synchronisation dépôt ↔ Apps Script (détecteur de dérive) ──
    // Compare la version des constantes GAS_VERSION_* déployées ici avec
    // celles du dépôt GitHub : toute recopie oubliée est signalée.
    hdr('Site déployé (le dépôt est-il en ligne ?)');
    _sondePagesDeployee_(check, R, info);

    hdr('Battements de cœur');
    _batVerifs_(check, R);

    hdr('Interrupteurs des mails');
    _sondeInterrupteursMails_(check, R, info);

    hdr('Code déployé vs dépôt');
    try {
      const deployed = {};
      try { deployed['code.gs'] = GAS_VERSION_CODE; } catch (e) { deployed['code.gs'] = null; }
      try { deployed['Indispos.gs'] = GAS_VERSION_INDISPOS; } catch (e) { deployed['Indispos.gs'] = null; }
      try { deployed['generateur_gardes.gs'] = GAS_VERSION_GENERATEUR; } catch (e) { deployed['generateur_gardes.gs'] = null; }
      try { deployed['setup_annee.gs'] = GAS_VERSION_SETUP; } catch (e) { deployed['setup_annee.gs'] = null; }
      try { deployed['portail.gs'] = GAS_VERSION_PORTAIL; } catch (e) { deployed['portail.gs'] = null; }
      try { deployed['miroir.gs'] = GAS_VERSION_MIROIR; } catch (e) { deployed['miroir.gs'] = null; }   // (04/08/2026) le 6e fichier entre au controle de derive
      try { deployed['partage/dispo_jour.js'] = GAS_VERSION_DISPO; } catch (e) { deployed['partage/dispo_jour.js'] = null; }   // (etage 2) module partage serveur/frontend
      try { deployed['journal.gs'] = GAS_VERSION_JOURNAL; } catch (e) { deployed['journal.gs'] = null; }   // (05/08/2026) applicateur du journal d'intentions
      try { deployed['veille.gs'] = GAS_VERSION_VEILLE; } catch (e) { deployed['veille.gs'] = null; }   // (08/08/2026) veille biblio sortie de portail.gs
      try { deployed['echanges.gs'] = GAS_VERSION_ECHANGES; } catch (e) { deployed['echanges.gs'] = null; }   // (13/08/2026) échanges de gardes pair-à-pair
      // (15/09/2026) chantier 9 : cinq fichiers sortis d'Indispos.gs entrent au contrôle de déploiement
      try { deployed['gardes.gs'] = GAS_VERSION_GARDES; } catch (e) { deployed['gardes.gs'] = null; }
      try { deployed['indisponibilites.gs'] = GAS_VERSION_INDISPOS_METIER; } catch (e) { deployed['indisponibilites.gs'] = null; }
      try { deployed['temps_partiel.gs'] = GAS_VERSION_TP; } catch (e) { deployed['temps_partiel.gs'] = null; }
      try { deployed['equipe.gs'] = GAS_VERSION_EQUIPE; } catch (e) { deployed['equipe.gs'] = null; }
      try { deployed['diagnostic.gs'] = GAS_VERSION_DIAG; } catch (e) { deployed['diagnostic.gs'] = null; }
      const tokSync = getGithubToken();
      Object.keys(deployed).forEach(fn => {
        let repoV = null;
        try {
          const r = UrlFetchApp.fetch(
            `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${fn.indexOf('/') !== -1 ? fn : 'gas/' + fn}?ref=${GITHUB_BRANCH}`,   // chemin complet si fourni (module partage)
            { headers: { Authorization: 'token ' + tokSync, Accept: 'application/vnd.github.raw' }, muteHttpExceptions: true });
          if (r.getResponseCode() === 200) {
            const m = r.getContentText().match(/GAS_VERSION_\w+\s*=\s*'([^']+)'/);
            repoV = m ? m[1] : '(sans version)';
          }
        } catch (e) {}
        if (repoV === null) check(`${fn} : dépôt illisible (réseau/clé)`, R.WARN);
        else if (!deployed[fn]) check(`${fn} : version déployée absente — recopier le fichier depuis le dépôt`, R.WARN);
        else if (repoV === deployed[fn]) check(`${fn} : à jour (v${repoV})`, R.OK);
        else check(`${fn} : DÉRIVE — dépôt v${repoV}, déployé v${deployed[fn]} → recopier + redéployer`, R.ERR);
      });
    } catch (e) { check('Contrôle de synchronisation impossible : ' + e.message, R.WARN); }

    // ── 3bis-c. Placements caducs (05/08/2026, trié passé/futur le 24/08) ──
    try {
      const _cad = JSON.parse(PropertiesService.getScriptProperties().getProperty('PLANNING_CADUCS') || '[]');
      const _auj = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      const _tri = _caducsTrier_(_cad, _auj);
      if (_tri.futurs.length) {
        check(`${_tri.futurs.length} placement(s) À VENIR ignoré(s) à la publication — MAR absent ce jour-là : ` +
              _tri.futurs.slice(0, 6).map(x => `${x.marId} ${x.date} (${x.statut})`).join(', ') +
              (_tri.futurs.length > 6 ? ` … et ${_tri.futurs.length - 6} autre(s)` : '') +
              ' — la ligne reste dans PLANNING_OVERRIDES et redeviendra active si le statut est retiré', R.WARN);
      } else {
        check('Aucun placement à venir ignoré à la publication', R.OK);
      }
      if (_tri.passes.length) {
        info(`${_tri.passes.length} placement(s) passé(s) ignoré(s) — historique, aucun geste attendu`);
      }
    } catch (e) { /* trace absente : sans objet */ }

    // ── 3bis-j. Journal d'intentions (05/08/2026) ──
    hdr('Journal d\'intentions');
    try {
      const _trigJ = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'journalAppliquer'; });
      if (_trigJ) check('Applicateur installé (journalAppliquer, chaque minute)', R.OK);
      else check('Applicateur ABSENT — exécuter journalInstallerDeclencheur() : les intentions du comité ne s\'appliquent pas', R.ERR);
      try {
        const _ej = journalEtat_();
        check('File chez Cloudflare : ' + _ej.enAttente + ' intention(s) en attente', _ej.enAttente > 20 ? R.WARN : R.OK);
      } catch (eJ) { check('File injoignable (' + eJ.message + ')', R.WARN); }
    } catch (eJt) { check('Contrôle du journal impossible : ' + eJt.message, R.WARN); }

    // ── 3bis-m. Miroir Cloudflare (04/08/2026) ──
    hdr('Miroir Cloudflare');
    try {
      const _jeton = PropertiesService.getScriptProperties().getProperty('MIROIR_PUSH_TOKEN');
      if (_jeton) check('Jeton d\'écriture présent (propriétés du script)', R.OK);
      else check('MIROIR_PUSH_TOKEN ABSENT — le miroir ne reçoit plus rien, pages en repli GAS', R.ERR);
      try {
        const _rw = UrlFetchApp.fetch(MIROIR_URL + '/', { muteHttpExceptions: true });
        if (_rw.getResponseCode() === 200) {
          const _o = JSON.parse(_rw.getContentText());
          check('Worker joignable — ' + (_o.service || 'version inconnue'), _o.ok ? R.OK : R.WARN);
        } else check('Worker injoignable (HTTP ' + _rw.getResponseCode() + ') — repli GAS actif partout', R.WARN);
      } catch (eW) { check('Worker injoignable (' + eW.message + ') — repli GAS actif partout', R.WARN); }
      const _trigM = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'miroirSyncComplet'; });
      if (_trigM) check('Synchro horaire installée (miroirSyncComplet)', R.OK);
      else check('Synchro horaire ABSENTE — exécuter miroirInstallerDeclencheur()', R.WARN);
    } catch (eM) { check('Contrôle du miroir impossible : ' + eM.message, R.WARN); }

    // ── 3ter. Sauvegarde automatique du classeur ──
    hdr('Sauvegarde automatique');
    try {
      const trigOk = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'backupHebdo');
      if (trigOk) check('Déclencheur hebdomadaire installé (lundi ~4 h)', R.OK);
      else check("Déclencheur hebdomadaire absent — exécuter installBackupTrigger() dans Apps Script", R.WARN);
      let last = null;
      const bIt = DriveApp.getFoldersByName('Planning-Med-Backups');
      if (bIt.hasNext()) {
        const bFiles = bIt.next().getFiles();
        while (bFiles.hasNext()) { const bf = bFiles.next(); const dc = bf.getDateCreated(); if (!last || dc > last) last = dc; }
      }
      if (!last) info('Aucune copie de sauvegarde encore créée' + (trigOk ? ' (la première viendra lundi)' : ''));
      else {
        const bDays = Math.round((new Date() - last) / 86400000);
        check(`Dernière sauvegarde il y a ${bDays} j`, bDays <= 10 ? R.OK : R.WARN);
      }
    } catch (e) { check('Contrôle de sauvegarde impossible : ' + e.message, R.WARN); }

    // ── 3quater. Cohérence de la version du site ──
    // (Corrigé 16/08/2026) Ce contrôle cherchait des numéros ÉCRITS EN DUR dans
    // quatre fichiers (constante JS, badge HTML, ligne d'en-tête des guides).
    // Le 14/08, le numéro a été centralisé dans version.js et ces écritures ont
    // disparu : le contrôle ne trouvait donc plus rien et annonçait « (absente)
    // → réaligner » sur les quatre — quatre ❌ pour une chaîne parfaitement
    // alignée. Un rapport qui crie au rouge sans motif finit par ne plus être lu.
    // Ce qui doit être vérifié a changé avec la centralisation : que chaque page
    // afficheuse se BRANCHE sur la source unique, et qu'aucune ne réintroduise un
    // numéro en dur (l'erreur reviendrait alors sans bruit). La comparaison
    // elle-même vit dans _versionSiteAnomalies_, sans réseau, donc vérifiable au banc.
    hdr('Version du site');
    try {
      const tokV = getGithubToken();
      const _lireDepot = fn => {
        try {
          const r = UrlFetchApp.fetch(
            `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${fn}?ref=${GITHUB_BRANCH}`,
            { headers: { Authorization: 'token ' + tokV, Accept: 'application/vnd.github.raw' }, muteHttpExceptions: true });
          return r.getResponseCode() === 200 ? r.getContentText() : null;
        } catch (e) { return null; }
      };
      const pages = {};
      ['index.html', 'admin.html', 'docs/guide-mar.html', 'docs/guide-comite.html', 'docs/roadmap.html']
        .forEach(fn => { pages[fn] = _lireDepot(fn); });
      const v = _versionSiteAnomalies_(_lireDepot('version.js'), pages);
      if (!v.version) check('version.js illisible — version du site non vérifiable', R.WARN);
      else if (!v.anomalies.length) {
        check(`Les ${Object.keys(pages).length} pages affichent la version du dépôt (${v.version})`, R.OK);
      } else {
        info(`Version publiée : ${v.version}`);
        v.anomalies.forEach(a => check(`${a.fichier} : ${a.motif}`,
          a.motif === 'illisible (dépôt injoignable)' ? R.WARN : R.ERR));
      }
    } catch (e) { check('Contrôle de version impossible : ' + e.message, R.WARN); }

    // ── 4. Équipe (MEDECINS) ──
    hdr('Équipe');
    let actifs = [];
    const tousIds = new Set();
    const medSheet = ss.getSheetByName('MEDECINS');
    if (medSheet) {
      const md = _medecinsRows_();
      const sansEmail = [], sansCode = [], quotiteKO = [], datesKO = [], partis = [];
      const _auj = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      const idDup = [], codeMap = {}, emailKO = [];
      for (let r = 1; r < md.length; r++) {
        const id = String(md[r][COL_MED.ID]).trim(); if (!id) continue;
        if (tousIds.has(id)) idDup.push(id); else tousIds.add(id);
        if (String(md[r][COL_MED.ACTIF]).trim().toUpperCase() !== 'O') continue; // ACTIF = O
        actifs.push(id);
        const cAcc = String(md[r][COL_MED.CODE]).trim();
        if (cAcc) (codeMap[cAcc] = codeMap[cAcc] || []).push(id);
        const em = String(md[r][COL_MED.EMAIL]).trim();
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) emailKO.push(id);
        if (!String(md[r][COL_MED.EMAIL]).trim()) sansEmail.push(id);            // email col 7
        if (!String(md[r][COL_MED.CODE]).trim()) sansCode.push(id);             // code col 6
        // Quotité col 4 et PCT_GARDES col 5 (mêmes colonnes que generateGardes).
        // Cellule vide tolérée : le générateur applique 100 par défaut.
        // NO_GARDE (col 11) posé → PCT_GARDES non contrôlé : le MAR est exclu de
        // gardeDoctors, son pct n'est jamais lu (un « 0 » y est expressif, pas une erreur).
        const estNoGarde = String(md[r][COL_MED.NO_GARDE]).trim().toUpperCase() === 'O';
        const rawQ = String(md[r][COL_MED.QUOTITE]).trim(), rawP = String(md[r][COL_MED.PCT_GARDES]).trim();
        const q = Number(rawQ), p = Number(rawP);
        if (rawQ && !(q > 0 && q <= 100)) quotiteKO.push(`${id} (quotité « ${rawQ} »)`);
        else if (!estNoGarde && rawP && !(p > 0 && p <= 100)) quotiteKO.push(`${id} (PCT_GARDES « ${rawP} »)`);
        const dd = md[r][COL_MED.DATE_DEBUT], df = md[r][COL_MED.DATE_FIN];                         // arrivée / départ
        if (dd && df) {
          const a = dd instanceof Date ? dd : new Date(String(dd) + 'T00:00:00');
          const b = df instanceof Date ? df : new Date(String(df) + 'T00:00:00');
          if (a.getTime() && b.getTime() && b < a) datesKO.push(id);
        }
        if (df) {
          const _f = df instanceof Date
            ? Utilities.formatDate(df, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
            : String(df).trim().slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(_f) && _f < _auj) partis.push(`${id} (depuis le ${_f})`);
        }
      }
      check(`${actifs.length} MARs actifs`, actifs.length > 0 ? R.OK : R.ERR);
      check(`MARs actifs sans email : ${sansEmail.length || 'aucun'}${sansEmail.length ? ' (' + sansEmail.join(', ') + ')' : ''}`, sansEmail.length ? R.WARN : R.OK);
      check(`MARs actifs sans code d'accès : ${sansCode.length || 'aucun'}${sansCode.length ? ' (' + sansCode.join(', ') + ')' : ''}`, sansCode.length ? R.WARN : R.OK);
      check(`Quotité manquante ou hors bornes : ${quotiteKO.length || 'aucun'}${quotiteKO.length ? ' (' + quotiteKO.join(', ') + ')' : ''}`, quotiteKO.length ? R.WARN : R.OK);
      check(`Dates arrivée/départ incohérentes : ${datesKO.length || 'aucun'}${datesKO.length ? ' (' + datesKO.join(', ') + ')' : ''}`, datesKO.length ? R.WARN : R.OK);
      /* (03/08/2026) Le controle ci-dessus verifie seulement que le depart ne precede pas
         l'arrivee ; aucune date n'est comparee a aujourd'hui. Un MAR parti mais reste
         ACTIF=O continue d'apparaitre partout ou seul ce drapeau est consulte : relances,
         selecteurs, completude des indispos de l'annee suivante. */
      check(`MARs ACTIF=O dont la date de départ est passée : ${partis.length || 'aucun'}${partis.length ? ' (' + partis.join(', ') + ') — à passer en ACTIF=N' : ''}`, partis.length ? R.WARN : R.OK);
      check(`Identifiants en double dans MEDECINS : ${idDup.length || 'aucun'}${idDup.length ? ' (' + idDup.join(', ') + ') — CORROMPT tout le système' : ''}`, idDup.length ? R.ERR : R.OK);
      const codeDup = Object.keys(codeMap).filter(c => codeMap[c].length > 1).map(c => codeMap[c].join('+'));
      check(`Codes d'accès partagés par plusieurs MARs actifs : ${codeDup.length || 'aucun'}${codeDup.length ? ' (' + codeDup.join(', ') + ') — connexions ambiguës' : ''}`, codeDup.length ? R.ERR : R.OK);
      check(`Emails au format douteux : ${emailKO.length || 'aucun'}${emailKO.length ? ' (' + emailKO.join(', ') + ')' : ''}`, emailKO.length ? R.WARN : R.OK);
    } else {
      check('Onglet MEDECINS', R.ERR);
    }

    // ── 5. Année active {Y} ──
    hdr('Année active ' + Y);
    check(`INDISPOS_${Y} présent`, has(`INDISPOS_${Y}`) ? R.OK : R.WARN);
    check(`GARDES_${Y} avec données`, rows(`GARDES_${Y}`) > 3 ? R.OK : R.WARN);
    check(`STATS_GARDES_${Y} (référence équité/dette)`, rows(`STATS_GARDES_${Y}`) > 1 ? R.OK : R.WARN);
    // ── Récups de samedi ────────────────────────────────────────────────
    // Chaque samedi tenu (G ou G2) ouvre EXACTEMENT une récup, et le générateur
    // garantit sa pose (repli en 2 passes sur toute l'année, section 9). Or un don
    // ou un échange déplace la garde et le repos du lendemain, JAMAIS le R
    // (`applyModification`) : tout écart signale un geste manuel resté à faire.
    // Sans objet avant PREMIERE_ANNEE_STATS_FIABLES : une année reconstruite à la
    // main n'a pas de R issus de ce mécanisme, l'écart n'y voudrait rien dire.
    if (Y >= PREMIERE_ANNEE_STATS_FIABLES && rows(`GARDES_${Y}`) > 3) {
      try {
        const _ecarts = computeStatsLive(Y)
          .map(s => ({ id: s.medecin, d: (Number(s.sat) || 0) - (Number(s.recupR) || 0) }))
          .filter(x => x.d !== 0)
          .map(x => x.d > 0
            ? `${x.id} : ${x.d} récup${x.d > 1 ? 's' : ''} manquante${x.d > 1 ? 's' : ''}`
            : `${x.id} : ${-x.d} récup${-x.d > 1 ? 's' : ''} en trop`);
        check(`Récups de samedi : ${_ecarts.length
            ? _ecarts.join(' · ') + ' — à corriger dans l\'onglet Statuts'
            : 'une par samedi tenu, pour tous'}`,
          _ecarts.length ? R.WARN : R.OK);
      } catch (e) { check('Récups de samedi non vérifiables : ' + e.message, R.WARN); }
    }
    const affSheet = ss.getSheetByName(`AFFECTATIONS_${Y}`);
    if (affSheet && actifs.length) {
      const affIds = new Set();
      const ad = affSheet.getDataRange().getValues();
      for (let r = 1; r < ad.length; r++) { const id = String(ad[r][0]).trim(); if (id) affIds.add(id); }
      const sansAff = actifs.filter(id => !affIds.has(id));
      check(`MARs actifs sans affectation : ${sansAff.length || 'aucun'}${sansAff.length ? ' (' + sansAff.join(', ') + ')' : ''}`, sansAff.length ? R.WARN : R.OK);

      // ── Affectations pointant vers un secteur qui n'existe plus ──
      // (07/2026) Supprimer une ligne de l'onglet SECTEURS — ou la passer à
      // ACTIF=N, ou vider sa colonne AFF — ne touche PAS les affectations déjà
      // saisies : elles gardent l'ancien code. À la publication, ce code devient
      // VOLANT (normalizeAffectation). Le MAR n'est pas perdu, mais il quitte
      // silencieusement son secteur. Ce contrôle le dit AVANT qu'on le découvre
      // sur le planning. Rappel : préférer ACTIF=N à la suppression d'une ligne.
      try {
        const codesOk = new Set(['VOLANT']);
        (getSecteurs() || []).forEach(sec => {
          if (sec && sec.actif && String(sec.aff || '').trim()) {
            codesOk.add(String(sec.code).trim().toUpperCase());
          }
        });
        const orphelinsSect = {};   // code inconnu -> Set(MAR)
        for (let r = 1; r < ad.length; r++) {
          const id = String(ad[r][0]).trim();
          if (!id) continue;
          for (let c = 1; c < ad[r].length; c++) {
            const v = String(ad[r][c] || '').trim().toUpperCase();
            if (!v || codesOk.has(v)) continue;
            if (!orphelinsSect[v]) orphelinsSect[v] = new Set();
            orphelinsSect[v].add(id);
          }
        }
        const codesKo = Object.keys(orphelinsSect);
        if (!codesKo.length) {
          check('Affectations pointant toutes vers un secteur valide', R.OK);
        } else {
          codesKo.forEach(code => {
            const qui = Array.from(orphelinsSect[code]);
            check(`Secteur « ${code} » absent de l'onglet SECTEURS (ou inactif / sans AFF) `
                + `— ${qui.length} MAR concerné(s) : ${qui.join(', ')} → passeront en VOLANT à la publication`,
                R.ERR);
          });
        }
      } catch (e) {
        info('Contrôle des secteurs affectés impossible : ' + e.message);
      }
    } else {
      check(`AFFECTATIONS_${Y} présent`, affSheet ? R.OK : R.WARN);
    }

    // ── 5bis. Intégrité GARDES (couverture 1 G + 1 G2 par jour, IDs orphelins) ──
    const auditGardesIntegrite = y => {
      hdr(`Intégrité GARDES_${y}`);
      try {
        const gSheet = ss.getSheetByName(`GARDES_${y}`);
        if (!gSheet || gSheet.getLastRow() <= 3) { info('Onglet absent ou vide — contrôle sans objet'); return; }
        const gd = gSheet.getDataRange().getValues();
        const orphelins = new Set();
        for (let r = 3; r < gd.length; r++) {
          const id = String(gd[r][0]).trim();
          if (id && tousIds.size && !tousIds.has(id)) orphelins.add(id);
        }
        check(`Lignes avec identifiant inconnu de MEDECINS : ${orphelins.size || 'aucune'}${orphelins.size ? ' (' + [...orphelins].join(', ') + ') — leurs gardes sont IGNORÉES à la publication' : ''}`, orphelins.size ? R.WARN : R.OK);
        const d2c = buildDateToCol(gd, y);
        // Passé vs futur : un trou PASSÉ est de l'histoire (redistribution manuelle
        // non reportée, ex. départ d'un MAR) → ⚠️ ; un trou FUTUR = jour sans
        // médecin de garde → ❌ à traiter immédiatement.
        const aujd = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
        const sansGFut = [], sansGPas = [], multiG = [], g2KO = [];
        Object.keys(d2c).sort().forEach(ds => {
          const c = d2c[ds];
          let nG = 0, nG2 = 0;
          for (let r = 3; r < gd.length; r++) {
            const v = String(gd[r][c] || '').trim().toUpperCase();
            if (v === 'G') nG++; else if (v === 'G2') nG2++;
          }
          if (nG === 0) (ds >= aujd ? sansGFut : sansGPas).push(ds);
          else if (nG > 1) multiG.push(`${ds} (×${nG})`);
          if (nG2 === 0) g2KO.push(ds); else if (nG2 > 1) g2KO.push(`${ds} (×${nG2})`);
        });
        const liste = arr => arr.slice(0, 10).join(', ') + (arr.length > 10 ? ` … et ${arr.length - 10} autre(s)` : '');
        check(`Jours FUTURS sans garde G : ${sansGFut.length || 'aucun'}${sansGFut.length ? ' → ' + liste(sansGFut) + ' — À TRAITER IMMÉDIATEMENT' : ''}`, sansGFut.length ? R.ERR : R.OK);
        check(`Jours passés sans garde G (historique, tableau non tenu à jour) : ${sansGPas.length || 'aucun'}${sansGPas.length ? ' → ' + liste(sansGPas) : ''}`, sansGPas.length ? R.WARN : R.OK);
        check(`Jours avec PLUSIEURS gardes G : ${multiG.length || 'aucun'}${multiG.length ? ' → ' + liste(multiG) : ''}`, multiG.length ? R.WARN : R.OK);
        check(`Jours sans exactement une G2 : ${g2KO.length || 'aucun'}${g2KO.length ? ' → ' + liste(g2KO) : ''}`, g2KO.length ? R.WARN : R.OK);
        /* (03/08/2026) Les repos de garde n'etaient jamais controles : le diagnostic
           voyait le symptome (jour sans G) mais jamais la cause. Un repos orphelin —
           un RG sans garde la veille — designe la garde effacee ET son porteur, ce qui
           a permis d'identifier DURAND sur le 26/03/2027. */
        const dates = Object.keys(d2c).sort();
        const estG = x => x === 'G' || x === 'G2';
        const rgOrph = [], consec = [], sansRepos = [];
        for (let r = 3; r < gd.length; r++) {
          const id = String(gd[r][0]).trim(); if (!id) continue;
          for (let i = 0; i < dates.length; i++) {
            const v  = String(gd[r][d2c[dates[i]]] || '').trim().toUpperCase();
            const av = i > 0 ? String(gd[r][d2c[dates[i-1]]] || '').trim().toUpperCase() : null;
            const ap = i < dates.length - 1 ? String(gd[r][d2c[dates[i+1]]] || '').trim().toUpperCase() : null;
            if (v === 'RG' && av !== null && !estG(av))   rgOrph.push(`${id} ${dates[i]}`);
            if (estG(v)   && av !== null && estG(av))     consec.push(`${id} ${dates[i]}`);
            if (estG(v)   && ap !== null && ap !== 'RG')  sansRepos.push(`${id} ${dates[i]}`);
          }
        }
        check(`Repos orphelins (RG sans garde la veille) : ${rgOrph.length || 'aucun'}${rgOrph.length ? ' → ' + liste(rgOrph) + ' — une garde a probablement ete ecrasee' : ''}`, rgOrph.length ? R.ERR : R.OK);
        check(`Gardes consecutives : ${consec.length || 'aucune'}${consec.length ? ' → ' + liste(consec) : ''}`, consec.length ? R.ERR : R.OK);
        check(`Gardes sans repos le lendemain : ${sansRepos.length || 'aucune'}${sansRepos.length ? ' → ' + liste(sansRepos) : ''}`, sansRepos.length ? R.WARN : R.OK);
      } catch (e) { check(`Contrôle GARDES_${y} impossible : ` + e.message, R.WARN); }
    };
    auditGardesIntegrite(Y);
    if (rows(`GARDES_${N1}`) > 3) auditGardesIntegrite(N1);

    // ── 5ter. Indisponibilités : lignes orphelines ──
    hdr(`Indisponibilités ${Y}`);
    try {
      const indS = ss.getSheetByName(`INDISPOS_${Y}`);
      if (!indS || indS.getLastRow() <= 3) info('Onglet absent ou vide — contrôle sans objet');
      else {
        const idd = indS.getDataRange().getValues();
        const inc = new Set();
        for (let r = 3; r < idd.length; r++) {
          const id = String(idd[r][0]).trim();
          if (id && tousIds.size && !tousIds.has(id)) inc.add(id);
        }
        check(`Lignes avec identifiant inconnu de MEDECINS : ${inc.size || 'aucune'}${inc.size ? ' (' + [...inc].join(', ') + ') — leurs indispos sont IGNORÉES' : ''}`, inc.size ? R.WARN : R.OK);
      }
    } catch (e) { check('Contrôle INDISPOS impossible : ' + e.message, R.WARN); }

    // ── 6. Année en préparation {N+1} (état du cycle) ──
    hdr('Préparation ' + N1);
    if (has(`INDISPOS_${N1}`)) {
      info(`INDISPOS_${N1} créé → assistant 1 (octobre) lancé`);
      if (rows(`GARDES_${N1}`) > 3) info(`GARDES_${N1} généré → assistant 2 (novembre) fait`);
      else info(`GARDES_${N1} pas encore généré → assistant 2 à venir`);
    } else {
      info(`Aucun onglet ${N1} : préparation non commencée (normal hors période octobre→décembre)`);
    }

    // ── 6ter. HISTORIQUE : coherence avec les gardes reellement faites ──
    /* (03/08/2026) HISTORIQUE n'etait verifie que par sa presence. C'est pourtant la
       memoire longue du service : une fois GARDES_{annee} deplace vers les archives,
       c'est la seule trace qui reste dans le maitre. Ses 25 lignes 2026 ne
       correspondaient ni au planning genere ni au planning reel. */
    hdr('Historique');
    try {
      const hSheet = ss.getSheetByName('HISTORIQUE');
      if (!hSheet || hSheet.getLastRow() < 2) info('Onglet vide — contrôle sans objet');
      else {
        const hd = hSheet.getDataRange().getValues();
        const annees = [...new Set(hd.slice(1).map(l => Number(l[1])).filter(y => y > 2000))].sort();
        info(`${hd.length - 1} ligne(s), année(s) ${annees.join(', ')}`);
        let controlees = 0;
        annees.forEach(y => {
          if (!(rows(`GARDES_${y}`) > 3)) return;      // grille archivée : rien à comparer
          controlees++;
          let live; try { live = computeStatsLive(y); } catch (e) { return; }
          const reel = {}; live.forEach(x => reel[x.medecin] = x);
          const ecarts = [], absents = [];
          hd.slice(1).filter(l => Number(l[1]) === y).forEach(l => {
            const id = String(l[0]).trim(); if (!id) return;
            const r = reel[id];
            if (!r) { absents.push(id); return; }
            if (Number(l[2] || 0) !== r.total || Number(l[3] || 0) !== r.g || Number(l[4] || 0) !== r.g2)
              ecarts.push(`${id} (${l[2]}/${l[3]}/${l[4]} vs ${r.total}/${r.g}/${r.g2})`);
          });
          const manquants = Object.keys(reel).filter(id =>
            !hd.slice(1).some(l => Number(l[1]) === y && String(l[0]).trim() === id));
          check(`HISTORIQUE ${y} vs gardes réellement faites : ${ecarts.length || 'aucun'} écart${ecarts.length ? ' → ' + ecarts.slice(0, 6).join(', ') + (ecarts.length > 6 ? ` … et ${ecarts.length - 6} autre(s)` : '') : ''}`, ecarts.length ? R.WARN : R.OK);
          if (absents.length)   check(`HISTORIQUE ${y} : ${absents.length} MAR absent(s) de la grille (${absents.join(', ')})`, R.WARN);
          if (manquants.length) check(`HISTORIQUE ${y} : ${manquants.length} MAR de la grille sans ligne (${manquants.join(', ')})`, R.WARN);
        });
        if (!controlees) info('Aucune année comparable (grilles archivées) — contrôle sans objet');
      }
    } catch (e) { check('Contrôle HISTORIQUE impossible : ' + e.message, R.WARN); }

    // ── 7. Vacances & groupes ──
    hdr('Vacances & groupes');
    check(`${Math.max(0, rows('PERIODES_VAC') - 1)} période(s) de vacances configurée(s)`, rows('PERIODES_VAC') > 1 ? R.OK : R.WARN);
    const grpSheet = ss.getSheetByName('GROUPES_VAC');
    if (grpSheet) {
      const gd = grpSheet.getDataRange().getValues();
      const c = { A:0, B:0, C:0 };
      for (let r = 1; r < gd.length; r++) { const g = String(gd[r][0]).trim(); if (c[g] !== undefined) c[g]++; }
      check(`Groupes A/B/C peuplés (${c.A}/${c.B}/${c.C})`, (c.A && c.B && c.C) ? R.OK : R.WARN);
      /* (03/08/2026) On ne comptait que la TAILLE des groupes, jamais leur completude.
         Un MAR absent de GROUPES_VAC n'est pas dans la liste ordonnee : son rang vaut 0
         et la condition de blocage n'est jamais vraie. Il echappe a l'arbitrage des
         vacances dans les deux sens — jamais bloque, jamais compte contre les autres. */
      const idsGV = new Set();
      for (let r = 1; r < gd.length; r++) { const m = String(gd[r][1]).trim(); if (m) idsGV.add(m); }
      const horsGroupe = actifs.filter(id => !idsGV.has(id));
      check(`MARs actifs absents de GROUPES_VAC : ${horsGroupe.length || 'aucun'}${horsGroupe.length ? ' (' + horsGroupe.join(', ') + ') — hors arbitrage des vacances' : ''}`, horsGroupe.length ? R.WARN : R.OK);
    }

    // ── 8. Overrides planning (PLANNING_OVERRIDES) ──
    hdr('Overrides planning');
    const ov = ss.getSheetByName('PLANNING_OVERRIDES');
    if (ov && ov.getLastRow() > 1) {
      const od = ov.getDataRange().getValues();
      const seen = new Set(), dup = [];
      const ovIdKO = new Set(); let ovHorsAnnee = 0, ovDateKO = 0;
      const fmtOv = v => {
        if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
        return String(v || '').trim();
      };
      for (let r = 1; r < od.length; r++) {
        const ds = fmtOv(od[r][0]), id = String(od[r][1] || '').trim();
        const key = `${ds}_${id}`;
        if (seen.has(key)) dup.push(key); else seen.add(key);
        if (id && tousIds.size && !tousIds.has(id)) ovIdKO.add(id);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) ovDateKO++;
        else if (!ds.startsWith(String(Y) + '-')) ovHorsAnnee++;
      }
      info(`${od.length - 1} placement(s) manuel(s) enregistré(s)`);
      check(`Doublons (même date + MAR) : ${dup.length || 'aucun'}`, dup.length ? R.WARN : R.OK);
      check(`Placements sur MAR inconnu de MEDECINS : ${ovIdKO.size || 'aucun'}${ovIdKO.size ? ' (' + [...ovIdKO].join(', ') + ')' : ''}`, ovIdKO.size ? R.WARN : R.OK);
      check(`Placements avec date illisible : ${ovDateKO || 'aucun'}`, ovDateKO ? R.WARN : R.OK);
      check(`Placements hors année active ${Y} : ${ovHorsAnnee || 'aucun'}${ovHorsAnnee ? ' — reliquat à purger (clôture W3)' : ''}`, ovHorsAnnee ? R.WARN : R.OK);
    } else {
      info('Aucun placement manuel enregistré');
    }

    // ── 9. Publication JSON (Drive) ──
    hdr('Publication JSON (Drive)');
    try {
      let nbFolders = 0;
      const fit = DriveApp.getFoldersByName(DRIVE_JSON_FOLDER);
      while (fit.hasNext()) { fit.next(); nbFolders++; }
      if (nbFolders === 0) check(`Dossier Drive « ${DRIVE_JSON_FOLDER} » introuvable`, R.ERR);
      else if (nbFolders > 1) check(`Doublon : ${nbFolders} dossiers « ${DRIVE_JSON_FOLDER} »`, R.WARN);
      else check(`Dossier Drive « ${DRIVE_JSON_FOLDER} » présent`, R.OK);

      const countGardesJson = txt => {
        let n = 0;
        const j = JSON.parse(txt);
        (j.months || []).forEach(mo => (mo.doctors || []).forEach(dc => (dc.days || []).forEach(day => {
          if (day && (day.status === 'G' || day.status === 'G2')) n++;
        })));
        return n;
      };
      const countGardesSheet = name => {
        const sh = ss.getSheetByName(name);
        if (!sh) return null;
        const dd = sh.getDataRange().getValues();
        let n = 0;
        for (let r = 3; r < dd.length; r++) for (let c = 1; c < dd[r].length; c++) {
          const v = String(dd[r][c] || '').trim().toUpperCase();
          if (v === 'G' || v === 'G2') n++;
        }
        return n;
      };
      const auditPlanning = (y, critique) => {
        const name = `planning_${y}.json`;
        const files = _jsonFilesByName_(name);
        if (!files.length) { check(`${name} absent du Drive — planning ${y} invisible aux MARs`, critique ? R.ERR : R.WARN); return; }
        if (files.length > 1) check(`Doublon : ${files.length} × ${name}`, R.WARN);
        const f = files[0];
        const ageJ = Math.round((Date.now() - f.getLastUpdated().getTime()) / 86400000);
        let njson = null;
        try { njson = countGardesJson(f.getBlob().getDataAsString()); } catch (e) {}
        if (!njson) { check(`${name} vide ou illisible — republier`, R.ERR); return; }
        const nsheet = countGardesSheet(`GARDES_${y}`);
        if (nsheet === null) info(`${name} publié (${njson} gardes, il y a ${ageJ} j) — onglet GARDES_${y} absent, cohérence non vérifiable`);
        else if (njson === nsheet) check(`${name} à jour, cohérent avec GARDES_${y} (${njson} gardes, publié il y a ${ageJ} j)`, R.OK);
        else {
          check(`${name} DÉSYNCHRONISÉ : ${njson} gardes publiées vs ${nsheet} dans l'onglet`, R.WARN);
          let ph = [];
          try { ph = _findPhantomGardes_(y); } catch (e) { info(`Détail des gardes en écart indisponible : ${e.message}`); }
          if (ph.length) {
            info(`${ph.length} garde(s) présente(s) dans GARDES_${y} mais exclue(s) du planning publié :`);
            ph.slice(0, 15).forEach(p => info(`   • ${p.id} — ${p.date} (${p.code}, ${p.cell}) → ${p.reason}`));
            if (ph.length > 15) info(`   … et ${ph.length - 15} autre(s), voir le journal d'exécution.`);
            info(`Si ces gardes sont légitimes : rien à faire, le planning publié est correct. Sinon, corrigez GARDES_${y} puis republiez.`);
            Logger.log(`[diag] ${name} désync ${njson} vs ${nsheet} — ${ph.length} garde(s) fantôme :\n` +
                       ph.map(p => `   ${p.id} | ${p.date} | ${p.code} | ${p.cell} | ${p.reason}`).join('\n'));
          } else {
            info(`Écart de ${nsheet - njson} garde(s) non localisé (override de statut ou cas particulier) — republiez ; si l'écart persiste, signalez-le.`);
            Logger.log(`[diag] ${name} désync ${njson} vs ${nsheet} — aucune garde fantôme localisée`);
          }
        }
      };
      const auditAff = y => {
        const name = `affectations_${y}.json`;
        const files = _jsonFilesByName_(name);
        if (!files.length) { info(`${name} absent du Drive`); return; }
        if (files.length > 1) check(`Doublon : ${files.length} × ${name}`, R.WARN);
        const ageJ = Math.round((Date.now() - files[0].getLastUpdated().getTime()) / 86400000);
        info(`${name} présent (publié il y a ${ageJ} j)`);
      };
      auditPlanning(Y, true);
      auditAff(Y);
      if (rows(`GARDES_${N1}`) > 3) { auditPlanning(N1, false); auditAff(N1); }
    } catch (e) {
      check('Audit Drive impossible : ' + e.message, R.WARN);
    }

    // ── 10. Santé du classeur ──
    hdr('Périodes vs calendrier officiel');
    try { _sondePeriodesOfficiel_(check, R, info, getIndisposYear() || N1); } catch (e) { info('Périodes vs officiel : ' + e.message); }

    hdr('STATS — positions lues par le code');
    _sondeStatsEntetes_(check, R, Y);

    hdr('Santé du classeur');
    try {
      const shts = ss.getSheets();
      let cells = 0; shts.forEach(sh => cells += sh.getMaxRows() * sh.getMaxColumns());
      check(`${shts.length} onglets, ~${Math.round(cells / 1000)} k cellules (limite Google : 10 000 k)`, cells > 8000000 ? R.WARN : R.OK);
      ['LOGS', 'CONNEXIONS'].forEach(n => {
        const nr = rows(n);
        if (nr > 20000) check(`Onglet ${n} volumineux (${nr} lignes) — purge des anciennes lignes conseillée`, R.WARN);
        else if (nr > 1) info(`Onglet ${n} : ${nr - 1} ligne(s)`);
      });
    } catch (e) { check('Contrôle du classeur impossible : ' + e.message, R.WARN); }

    // (27/08/2026) Trois questions au lieu de dix-huit sections — pur réagencement.
    const regroupes = _regrouperEnChapitres_(results.splice(0));
    regroupes.forEach(l => results.push(l));
    results.push('────────────────────────────────────');
    const nbErr = results.filter(l => l.startsWith('❌')).length;
    const nbWarn = results.filter(l => l.startsWith('⚠️')).length;
    results.push(ok ? `✅ Tout est en ordre${nbWarn ? ` (${nbWarn} point(s) de vigilance)` : ''}` : `❌ ${nbErr} problème(s) à corriger${nbWarn ? `, ${nbWarn} avertissement(s)` : ''}`);
    results.push(`ℹ️ Diagnostic exécuté en ${((Date.now() - t0) / 1000).toFixed(1)} s — ${Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm')} (v${GAS_VERSION_INDISPOS})`);
    logAction(`diagComplet — ${ok ? 'OK' : 'ERREURS'} (${nbErr} err, ${nbWarn} warn)`);
  return { ok, results, nbErr, nbWarn };
}

/* ─────────────────────────────────────────────────────────────────────────────
   DIAGNOSTIC AUTOMATIQUE (03/08/2026)
   Le trou du 26/03/2027 etait detectable par le diagnostic depuis le 01/08 : il
   affichait « Jours FUTURS sans garde G : 1 — A TRAITER IMMEDIATEMENT ». Personne
   ne l'a lance. Ajouter des controles a un rapport que personne n'ouvre ne sert a
   rien : on l'envoie donc tout seul, chaque lundi a 2 h.
   L'adresse est lue dans CONFIG / DIAG_EMAIL — jamais ecrite dans le code, le
   depot etant public. Absente : on ne fait rien plutot que d'echouer.
   ───────────────────────────────────────────────────────────────────────────── */
function diagHebdo() {
  try { _bat_('diagHebdo'); } catch (e) {}
  let dest = '';
  try {
    /* Lecture DIRECTE de l'onglet. _configRows_() sert un cache de 10 minutes, et une
       tache hebdomadaire ne doit pas dependre de sa fraicheur. Constate le 03/08/2026 :
       DIAG_EMAIL venait d'etre ajoute, le cache tenait encore la version d'avant,
       diagHebdo a conclu « adresse absente » et n'a rien envoye — sans que la cause
       soit lisible dans le journal. */
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
    const data = sh ? sh.getDataRange().getValues() : [];
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === 'DIAG_EMAIL') { dest = String(data[r][1]).trim(); break; }
    }
  } catch (e) { /* CONFIG illisible : on sortira sans envoi */ }
  if (!dest) { logAction('diagHebdo — annule : DIAG_EMAIL absent ou vide dans l\'onglet CONFIG (lecture directe)'); return; }

  let d;
  try { d = diagnosticComplet(); }
  catch (e) {
    try {
      MailApp.sendEmail(dest, '❌ Diagnostic Planning-Med en echec',
        'Le diagnostic hebdomadaire n\'a pas pu s\'executer.\n\n' + e.message + '\n\n' + (e.stack || ''));
    } catch (e2) { /* rien de plus a tenter */ }
    logAction('diagHebdo — ECHEC : ' + e.message);
    return;
  }

  const sujet = d.nbErr
    ? `❌ ${d.nbErr} problème(s) — Planning-Med`
    : `✅ RAS${d.nbWarn ? ` (${d.nbWarn} point(s) de vigilance)` : ''} — Planning-Med`;
  try {
    MailApp.sendEmail(dest, sujet,
      d.results.join('\n') + '\n\n— Diagnostic automatique du lundi. Repondre a ce mail ne sert a rien.');
  } catch (e) { logAction('diagHebdo — envoi impossible : ' + e.message); return; }
  logAction(`diagHebdo — envoye (${d.nbErr} err, ${d.nbWarn} warn)`);
}

// A lancer UNE fois depuis l'editeur Apps Script. Idempotent : les declencheurs
// existants sur diagHebdo sont retires avant d'en reposer un.
function installDiagTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'diagHebdo')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('diagHebdo').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(2).nearMinute(0).create();
  return 'Declencheur diagHebdo installe : tous les lundis vers 2 h.';
}

/* ── SENTINELLE QUOTIDIENNE (27/08/2026) — le mail qui n'arrive que quand ça compte.
   Sous-ensemble rapide (< 10 s) des sondes de bout en bout, chaque matin :
   site = dépôt, interrupteurs des mails, battements de cœur, relais joignable,
   quota email. AUCUN mail si tout est vert — l'absence de bruit est le contrat.
   Elle pose son propre battement : le rapport hebdo vérifie le surveillant. */
function diagSentinelle() {
  _bat_('diagSentinelle');
  const R = { OK:1, WARN:2, ERR:3 };
  const lignes = []; let nbErr = 0;
  function check(label, level) {
    if (level === true || level === R.OK) lignes.push('✅ ' + label);
    else if (level === R.WARN) lignes.push('⚠️ ' + label);
    else { lignes.push('❌ ' + label); nbErr++; }
  }
  const info = t => lignes.push('ℹ️ ' + t);
  const t0 = Date.now();
  _sondePagesDeployee_(check, R, info);
  _sondeInterrupteursMails_(check, R, info);
  _batVerifs_(check, R);
  try {
    // (28/08/2026) La santé du Worker se lit sur « / » (il n'a PAS de route /health —
    // URL écrite de mémoire le 27/08, fausse alerte au premier passage réel).
    // Même sonde que le rapport complet : code 200 ET { ok:true } dans la réponse.
    const _base = (typeof MIROIR_URL !== 'undefined') ? MIROIR_URL : 'https://miroir.planningmedic.workers.dev';
    const r = UrlFetchApp.fetch(_base + '/', { muteHttpExceptions: true });
    let o = null; try { o = JSON.parse(r.getContentText()); } catch (e2) {}
    if (r.getResponseCode() === 200 && o && o.ok) check('Relais de lecture en service (' + (o.service || 'version inconnue') + ')', R.OK);
    else {
      check('Relais de lecture EN PANNE (code ' + r.getResponseCode() + ') — les pages se replient sur le serveur lent', R.ERR);
      check('   → LE GESTE : tableau de bord Cloudflare → worker miroir → vérifier le déploiement et les journaux.', R.OK);
    }
  } catch (e) { check('Relais de lecture injoignable : ' + e.message, R.WARN); }
  try {
    const q = MailApp.getRemainingDailyQuota();
    check('Quota email : ' + q + ' restants', q > 10 ? R.OK : R.WARN);
  } catch (e) {}
  logAction('diagSentinelle — ' + (nbErr ? nbErr + ' ERREUR(S)' : 'RAS') + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  if (!nbErr) return;                                  // silence : le contrat
  let dest = '';
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
    const data = sh ? sh.getDataRange().getValues() : [];
    for (let r = 1; r < data.length; r++)
      if (String(data[r][0]).trim() === 'DIAG_EMAIL') { dest = String(data[r][1]).trim(); break; }
  } catch (e) {}
  if (!dest) return;
  try {
    MailApp.sendEmail(dest, '❌ SENTINELLE — ' + nbErr + ' problème(s) — Planning-Med',
      lignes.map(function (l) { return l.replace(/^✅ +(?=→ LE GESTE)/, ''); }).join('\n') + '\n\nLes jours où tout va bien, ce mail n\'existe pas.');
  } catch (e) { logAction('diagSentinelle — envoi impossible : ' + e.message); }
}

function installerSentinelle() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'diagSentinelle') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('diagSentinelle').timeBased().everyDays(1).atHour(6).create();
  logAction('Sentinelle quotidienne installée (6 h)');
}

/* (2026-08-05.9) Corps de l'action setDailyStatus, EXTRAIT VERBATIM du
   routage (transformation mecanique verifiee : 4 _error → throw, reponse
   → objet). Une seule source pour le routage ET l'applicateur du journal
   (journal.gs) — meme principe que dispo_jour. */
/* (2026-08-05.13) Paliers d'alerte du jeton GitHub, isolés pour être
   éprouvables au banc :
     expiré ou ≤ 10 j  → ROUGE   (la publication va s'arrêter)
     11 à 30 j         → ORANGE  (à planifier)
     > 30 j            → simple information
   Le renouvellement demande d'aller sur GitHub, de créer un jeton et de le
   coller dans PARAMETRES : ce n'est pas un geste qu'on improvise la veille. */
function _diagNiveauToken_(jours) {
  const j = Number(jours);
  if (!isFinite(j)) return { niveau: 'INFO', message: 'Token GitHub : date d\'expiration illisible' };
  if (j < 0)   return { niveau: 'ERR',  message: `Token GitHub EXPIRÉ depuis ${Math.abs(j)} j — PUBLICATION IMPOSSIBLE : les MAR ne voient plus les mises à jour. Renouveler immédiatement.` };
  if (j <= 10) return { niveau: 'ERR',  message: `Token GitHub expire dans ${j} j — À RENOUVELER MAINTENANT : passé cette date, plus aucune publication ne partira.` };
  if (j <= 30) return { niveau: 'WARN', message: `Token GitHub expire dans ${j} j — prévoir son renouvellement (sans lui, la publication s'arrête).` };
  return { niveau: 'INFO', message: `Token GitHub valide, expire dans ${j} j` };
}

/* ═══ ACTIONS DU ROUTEUR (15/09/2026, chantier 9 — étape 2) ═══
   Chaque bloc « if (action === …) » de _routeRequete_ est devenu une fonction
   _act_<nom>(R), corps mot pour mot, R = { e, payload, action, code, user }.
   Le contrôle de rôle reste dans le corps, là où il était ; la table ACTIONS
   (Indispos.gs) le déclare aussi, et le banc vérifie que les deux disent la
   même chose. */

/* ── action "diagComplet" ── */
function _act_diagComplet(R) {
  const { e, payload, action, code, user } = R;
  if (user.role !== 'admin') return _deny();
  const _d = diagnosticComplet();
  return ContentService.createTextOutput(JSON.stringify({ success:true, ok:_d.ok, results:_d.results }))
    .setMimeType(ContentService.MimeType.JSON);
}
