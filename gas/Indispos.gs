// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_INDISPOS = '2026-09-08.2';

/* ── (01/08/2026) MARQUEUR DE TEMPS GLOBAL — mesure, ne change rien ───────
   `_srv_ms` chronometre l'INTERIEUR de doGet. Or avant que doGet soit appele,
   Apps Script evalue toutes les constantes de premier niveau — dont TEST_YEAR,
   juste en dessous, qui ouvre le classeur et lit CONFIG. Ce temps etait compte
   comme « attente Google » alors qu'il est a NOUS.
   Ce marqueur permet a doGet de renvoyer `_glob_ms` = temps ecoule entre ici et
   l'entree dans doGet. Il ne mesure PAS la compilation du code (545 Ko), qui a
   lieu avant toute execution : pour celle-la, comparer avec la duree totale
   affichee dans le menu « Executions » d'Apps Script.
   Cout : un Date.now(). A retirer si le diagnostic conclut. */
const _T_GLOBAUX = Date.now();

// ── CONFIG ─────────────────────────────────────────────────────────────
const GITHUB_USER_INDISPOS = 'planningmedic';
const GITHUB_REPO_INDISPOS = 'planningmedic.github.io';
const TEST_YEAR = getActiveYear();

function getIndisposYear() {
  const data = _configRows_();   // memo de CONFIG (code.gs)
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
      const y = parseInt(String(data[r][1]).trim());
      if (!isNaN(y)) return y;
    }
  }
  return getActiveYear();
}

// La campagne de saisie des indispos est-elle EN COURS ?
// La ligne INDISPOS_ACTIVE de CONFIG n'existe que pendant la campagne :
//   - Wizard 1 (octobre)  → setIndisposYear() la CRÉE
//   - Wizard 3 (clôture)  → clearIndisposYear() la SUPPRIME
// Sa seule présence est donc l'indicateur — aucun réglage supplémentaire à tenir
// à jour. Attention : getIndisposYear() ne permet PAS de le savoir, car il se
// replie silencieusement sur getActiveYear() quand la ligne est absente.
/* (26/08/2026) Campagne FIGÉE : le planning de l'année de campagne existe déjà
   (généré), les indispos ne changent plus rien — l'écran indispos passe en
   lecture seule et la tuile du portail l'annonce. SOURCE UNIQUE : l'écran
   (getVacConfig) et la clé `acces` du miroir lisent tous deux ici. */
function _indisposFigees_() {
  return !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GARDES_' + getIndisposYear());
}

function _indisposOuverte_() {
  try {
    const data = _configRows_();   // memo de CONFIG (code.gs)
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
        return !isNaN(parseInt(String(data[r][1]).trim()));
      }
    }
  } catch (e) {}
  return false;
}

/* ── (POSE TP · 22/08/2026) PHASE DE POSE DES TEMPS PARTIELS — DÉDUITE, JAMAIS ÉCRITE ──
   Les jours de temps partiel se posent APRÈS la génération des gardes (décision
   d'Arthur, 22/08/2026). La phase n'est stockée nulle part : elle se DÉDUIT de
   l'état du classeur, donc supprimer GARDES_{Y} pour régénérer la referme seule.
   Une année ne compte « générée » que si GARDES_{Y} ET LIENS_R_{Y} existent :
   le générateur crée toujours les deux, alors que 2026 (tenue à la main) a un
   GARDES_2026 mais pas de LIENS_R_2026 — vérifié dans le classeur le 22/08.
   ⚠️ Sans ce double test, supprimer GARDES_2027 en octobre ferait retomber la
   phase sur 2026 et des TP fuiraient dans INDISPOS_2026.
   On regarde active+1 PUIS active : en régime de croisière (année en cours
   générée, suivante pas encore), la pose continue sur l'année en cours. */
function _phaseTp_() {
  /* (LOT 5 · 22/08/2026) La phase est MULTI-ANNÉES — arbitrage Arthur : « il
     faut pouvoir poser encore dans l'année en cours même si N+1 est ouvert ».
     Fin 2027, GARDES_2027 et GARDES_2028 coexistent : les DEUX années sont
     ouvertes à la pose. `annees` les porte toutes (croissant) ; `annee` reste
     la plus récente, pour les appelants qui n'en veulent qu'une. */
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const a = getActiveYear();
    const annees = [];
    for (let y = a; y <= a + 1; y++) {
      if (ss.getSheetByName(`GARDES_${y}`) && ss.getSheetByName(`LIENS_R_${y}`)) annees.push(y);
    }
    if (annees.length) return { actif: true, annee: annees[annees.length - 1], annees: annees };
  } catch (e) {}
  return { actif: false, annee: null, annees: [] };
}

// (C3) MEDECINS_LIST supprimé — l'effectif vient de l'onglet MEDECINS.

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

/* ═════════ DIAGNOSTIC EN TROIS QUESTIONS + SENTINELLE (27/08/2026) ═════════
   Recul pris après trois incidents silencieux la même semaine : le dépôt juste
   mais le site servant l'ancien (événement Pages perdu), une donnée fausse dans
   PERIODES_VAC (Toussaint 2027), et le constat que les déclencheurs peuvent
   mourir sans laisser de trace. Le diagnostic devient : trois QUESTIONS
   (chapitres) au lieu de sections d'inventaire, des sondes de bout en bout,
   des battements de cœur, et une sentinelle quotidienne qui n'écrit QUE si ❌.
   Contrainte d'Arthur : rester loin sous la minute — chaque sonde réseau
   attrape ses erreurs et rend ⚠️ « injoignable » plutôt que de bloquer. */

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

// ── Sonde : les interrupteurs des mails sont-ils cohérents ? ──
function _sondeInterrupteursMails_(check, R, info) {
  try {
    const P = PropertiesService.getScriptProperties();
    const actif = String(P.getProperty('NOTIF_ACTIVE') || '').trim().toUpperCase() === 'O';
    const test  = !!(P.getProperty('NOTIF_EMAIL_TEST') || '').trim();
    if (actif && test) {
      check('Mails ALLUMÉS avec la redirection d\'essai encore posée : tous les messages de changements partent vers l\'adresse de test, les MARs ne reçoivent RIEN — en silence', R.ERR);
      check('   → LE GESTE : Apps Script → Paramètres du projet → Propriétés → supprimer NOTIF_EMAIL_TEST (ou repasser NOTIF_ACTIVE à N si c\'était voulu).', R.OK);
    } else if (actif) check('Mails de changements allumés, redirection absente — les MARs reçoivent leurs messages', R.OK);
    else info('Mails de changements éteints (NOTIF_ACTIVE ≠ O)' + (test ? ' · redirection d\'essai posée' : '') + ' — le notifieur photographie et se tait');
  } catch (e) { check('Interrupteurs des mails illisibles : ' + e.message, R.WARN); }
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

// ── Sonde : les positions de STATS que code.gs lit à l'aveugle ──
function _sondeStatsEntetes_(check, R, annee) {
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('STATS_GARDES_' + annee);
    if (!sh) return;
    /* (05/09/2026) La colonne 23 (CIBLE JF) est désormais lue elle aussi : l'écran
       d'équité surveille les SIX axes du générateur, plus cinq.
       Elle n'est contrôlée que si elle EXISTE : les années antérieures — 2026, dont
       les statistiques ont été reconstruites à la main — s'arrêtent à la colonne 22.
       Exiger la colonne là-bas ferait hurler le diagnostic sur une année qui n'a
       rien à se reprocher ; l'axe fériés y sera simplement absent de l'écran. */
    const nCol = Math.min(23, sh.getLastColumn());
    const h = sh.getRange(1, 1, 1, nCol).getValues()[0].map(v => String(v).trim());
    const attendu = { 0:'MEDECIN', 1:'CIBLE', 17:'CIBLE SAM', 18:'CIBLE JEU', 19:'CIBLE VD', 21:'CIBLE VJF' };
    if (nCol >= 23) attendu[22] = 'CIBLE JF';
    const faux = Object.keys(attendu).filter(i => h[i] !== attendu[i]).map(i => `col ${Number(i)+1} : « ${h[i]} » au lieu de « ${attendu[i]} »`);
    if (faux.length) {
      check(`STATS_GARDES_${annee} : en-tête déplacé — ${faux.join(' · ')} — code.gs lit ces colonnes PAR POSITION, l'équité se casserait en silence`, R.ERR);
      check('   → LE GESTE : remettre les colonnes à leur place (ne jamais insérer/supprimer de colonne dans STATS), ou régénérer les cibles.', R.OK);
    } else check(`STATS_GARDES_${annee} : les ${nCol >= 23 ? 7 : 6} colonnes lues par position sont où le code les attend`, R.OK);
  } catch (e) { check('STATS en-têtes : sonde en échec (' + e.message + ')', R.WARN); }
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
      ['dashboard.html', 'admin.html', 'docs/guide-mar.html', 'docs/guide-comite.html', 'docs/roadmap.html']
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
      const md = medSheet.getDataRange().getValues();
      const sansEmail = [], sansCode = [], quotiteKO = [], datesKO = [], partis = [];
      const _auj = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      const idDup = [], codeMap = {}, emailKO = [];
      for (let r = 1; r < md.length; r++) {
        const id = String(md[r][0]).trim(); if (!id) continue;
        if (tousIds.has(id)) idDup.push(id); else tousIds.add(id);
        if (String(md[r][3]).trim().toUpperCase() !== 'O') continue; // ACTIF = O
        actifs.push(id);
        const cAcc = String(md[r][6]).trim();
        if (cAcc) (codeMap[cAcc] = codeMap[cAcc] || []).push(id);
        const em = String(md[r][7]).trim();
        if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) emailKO.push(id);
        if (!String(md[r][7]).trim()) sansEmail.push(id);            // email col 7
        if (!String(md[r][6]).trim()) sansCode.push(id);             // code col 6
        // Quotité col 4 et PCT_GARDES col 5 (mêmes colonnes que generateGardes).
        // Cellule vide tolérée : le générateur applique 100 par défaut.
        // NO_GARDE (col 11) posé → PCT_GARDES non contrôlé : le MAR est exclu de
        // gardeDoctors, son pct n'est jamais lu (un « 0 » y est expressif, pas une erreur).
        const estNoGarde = String(md[r][11]).trim().toUpperCase() === 'O';
        const rawQ = String(md[r][4]).trim(), rawP = String(md[r][5]).trim();
        const q = Number(rawQ), p = Number(rawP);
        if (rawQ && !(q > 0 && q <= 100)) quotiteKO.push(`${id} (quotité « ${rawQ} »)`);
        else if (!estNoGarde && rawP && !(p > 0 && p <= 100)) quotiteKO.push(`${id} (PCT_GARDES « ${rawP} »)`);
        const dd = md[r][9], df = md[r][10];                         // arrivée / départ
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


function logAction(message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('LOGS');
    if (!sheet) {
      sheet = ss.insertSheet('LOGS');
      sheet.getRange(1, 1, 1, 2).setValues([['TIMESTAMP','MESSAGE']]);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(2, 400);
    }
    sheet.appendRow([new Date(), message]);
    if (sheet.getLastRow() > 501) sheet.deleteRows(2, sheet.getLastRow() - 501);
  } catch(e) {
    Logger.log('logAction error: ' + e.message);
  }
}

// ── JOURNAL DES CONNEXIONS (qui se connecte, quand, avec quel rôle) ────
/* (29/08/2026) Trois besoins, trois durées de vie — et une règle qui tient
   l'ensemble : on ne RECONSTRUIT jamais une statistique depuis les lignes
   brutes après coup, on la FIGE pendant qu'elles existent encore.

   CONNEXIONS    : le détail nominatif récent. Plafonné, donc borné.
   STATS_SEMAINE : une ligne par semaine (52/an), figée dès la semaine finie.
   STATS_HEURES  : grille 7 × 24 cumulée, incrémentée à chaque connexion.

   Conséquence : purger CONNEXIONS ne fait perdre aucune courbe. Sans ce
   dispositif, le plafond détruirait l'historique en continu — à 25 MAR, les
   10 000 lignes couvrent environ trois mois, donc la première année d'usage
   aurait disparu avant d'avoir pu être lue. */
const CONNEXIONS_PLAFOND = 10000;    // ~3 mois de détail nominatif à 25 MAR
const STATS_ORIGINE      = '2026-09-04';  // présentation au service = jour zéro

/* Date -> 'AAAA-MM-JJ' du LUNDI de sa semaine. Pas de Utilities ici : la
   fonction doit tourner à l'identique dans le banc, hors environnement Google. */
function _statsLundi_(d) {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dec = (j.getDay() + 6) % 7;          // lundi = 0
  j.setDate(j.getDate() - dec);
  return _statsJour_(j);
}
function _statsJour_(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}
/* Feuille de compteurs : créée à la demande, jamais dans setup_annee (elle ne
   dépend pas de l'année de planning et ne doit surtout pas être ré-initialisée
   au changement d'année — elle porte l'historique). */
function _statsFeuille_(ss, nom, entete) {
  let f = ss.getSheetByName(nom);
  if (!f) {
    f = ss.insertSheet(nom);
    f.getRange(1, 1, 1, entete.length).setValues([entete]);
    f.getRange(1, 1, 1, entete.length).setFontWeight('bold');
  }
  return f;
}

function logConnexion(user) {
  try {
    if (!user) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('CONNEXIONS');
    if (!sheet) {
      sheet = ss.insertSheet('CONNEXIONS');
      sheet.getRange(1, 1, 1, 4).setValues([['HORODATAGE','NOM','INITIALES','ROLE']]);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 200);
    }
    const maintenant = new Date();
    sheet.appendRow([maintenant, user.name || '', user.initials || '', user.role || '']);

    /* Compteurs qui NE dépendent pas des lignes brutes : ils sont incrémentés
       ici, une fois, et ne sont jamais recalculés. */
    try { _statsHeureIncr_(ss, maintenant); } catch (e) {}
    try { _statsDerniereConnexion_(ss, user, maintenant); } catch (e) {}
    /* Ouvertures par rôle : alimente la carte « qui se connecte ». */
    try { _statsActionIncr_(ss, user.role, '(ouverture)', maintenant); } catch (e) {}

    /* Purge — MAIS jamais avant d'avoir figé les semaines concernées.
       L'ordre compte : figer PUIS supprimer. L'inverse perd la semaine. */
    if (sheet.getLastRow() > CONNEXIONS_PLAFOND + 1) {
      try { statsRecalculer(); } catch (e) { return; }   // rien n'est supprimé si le figeage échoue
      sheet.deleteRows(2, sheet.getLastRow() - (CONNEXIONS_PLAFOND + 1));
    }
  } catch(e) {
    Logger.log('logConnexion error: ' + e.message);
  }
}

/* Grille 7 jours × 24 heures, cumulée depuis l'origine. Une case = un compteur.
   Incrémentée à la connexion : aucune dépendance aux lignes brutes. */
function _statsHeureIncr_(ss, d) {
  if (_statsJour_(d) < STATS_ORIGINE) return;
  const JOURS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const entete = ['JOUR'];
  for (let h = 0; h < 24; h++) entete.push('H' + String(h).padStart(2, '0'));
  const f = _statsFeuille_(ss, 'STATS_HEURES', entete);
  if (f.getLastRow() < 8) {
    for (let i = 0; i < 7; i++) {
      if (f.getLastRow() < i + 2) {
        const ligne = [JOURS[i]];
        for (let h = 0; h < 24; h++) ligne.push(0);
        f.appendRow(ligne);
      }
    }
  }
  const ligne = ((d.getDay() + 6) % 7) + 2;   // lundi -> ligne 2
  const col   = d.getHours() + 2;             // H00 -> colonne 2
  const cell  = f.getRange(ligne, col, 1, 1);
  cell.setValue(Number(cell.getValue() || 0) + 1);
}

/* Dernière connexion, par médecin. Colonne ajoutée EN FIN d'onglet MEDECINS et
   repérée par son EN-TÊTE : toutes les autres lectures de MEDECINS utilisent des
   index FIGÉS, une insertion au milieu rendrait les codes d'accès inopérants
   (constaté en réel le 21/07/2026). */
function _statsDerniereConnexion_(ss, user, d) {
  if (!user || !user.id || user.id === 'SECRETARIAT') return;
  const f = ss.getSheetByName('MEDECINS');
  if (!f) return;
  const data = f.getDataRange().getValues();
  if (!data.length) return;
  let col = -1;
  for (let c = 0; c < data[0].length; c++) {
    if (String(data[0][c]).trim().toUpperCase() === 'DERNIERE_CONNEXION') { col = c; break; }
  }
  if (col < 0) {
    col = data[0].length;                       // toujours EN FIN
    f.getRange(1, col + 1, 1, 1).setValue('DERNIERE_CONNEXION');
    f.getRange(1, col + 1, 1, 1).setFontWeight('bold');
  }
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(user.id).trim()) {
      f.getRange(r + 1, col + 1, 1, 1).setValue(_statsJour_(d));
      return;
    }
  }
}

/* ═══ COMPTEUR D'USAGE PAR RÔLE (31/08/2026) ═══════════════════════════
   Répond à une question que les connexions seules ne tranchent pas : le comité
   OUVRE-t-il la page d'administration, ou s'en SERT-il ?

   Même principe que STATS_HEURES : on incrémente AU MOMENT du geste, on ne
   reconstruit jamais après coup. LOGS ne pouvait pas servir de source — il ne
   garde que 500 lignes et son message est du texte libre, pas une donnée
   rangée.

   Une ligne par couple (rôle, action). '(ouverture)' est l'action des
   connexions. Aucune donnée nominative : le rôle, jamais la personne — le code
   d'administration est de toute façon partagé et ne porte aucun nom.

   PROTÉGÉ PAR UN FILET : tout appelant enveloppe l'appel dans un try/catch.
   Un compteur n'a jamais le droit de faire échouer une publication de planning. */
function _statsActionIncr_(ss, role, action, d) {
  d = d || new Date();
  if (_statsJour_(d) < STATS_ORIGINE) return;
  const r = String(role || '').trim().toLowerCase();
  const a = String(action || '').trim();
  if (!r || !a) return;
  const f = _statsFeuille_(ss, 'STATS_ACTIONS', ['ROLE','ACTION','NOMBRE','DERNIERE']);
  const data = f.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === r &&
        String(data[i][1]).trim() === a) {
      f.getRange(i + 1, 3, 1, 2).setValues([[Number(data[i][2] || 0) + 1, _statsJour_(d)]]);
      return;
    }
  }
  f.appendRow([r, a, 1, _statsJour_(d)]);
}

/* Recalcule les semaines ENCORE OUVERTES depuis les lignes brutes, et les fige
   dès qu'elles sont terminées. Une semaine figée n'est plus jamais retouchée :
   c'est ce qui rend la fonction sûre à rejouer, et ce qui protège la courbe
   quand les lignes brutes commencent à disparaître.
   Posée sur un déclencheur hebdomadaire ET appelée avant toute purge. */
function statsRecalculer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const brut = ss.getSheetByName('CONNEXIONS');
  if (!brut) return 'Aucune connexion enregistrée.';
  const f = _statsFeuille_(ss, 'STATS_SEMAINE',
                           ['SEMAINE','CONNEXIONS','ACTIFS','FIGEE']);

  /* Google Sheets CONVERTIT « 2026-09-07 » en objet Date à l'écriture, et le
     format texte ne suffit pas toujours à l'en empêcher. Une clé relue serait
     donc un Date et ne correspondrait plus à la clé calculée : la semaine
     paraîtrait inconnue, serait recomptée à chaque passage, et RÉTRÉCIRAIT à
     mesure que ses lignes brutes disparaissent. Défaut trouvé au banc le
     29/08/2026. On normalise donc TOUTE clé relue. */
  const _cleSem_ = function (v) {
    /* Volontairement PAS `instanceof Date` : dès qu'il existe deux contextes
       d'exécution (le banc en a un), un Date venu de l'autre contexte échoue au
       test et la normalisation est silencieusement sautée. On reconnaît la date
       à ce qu'elle sait faire, pas à sa filiation. */
    if (v && typeof v.getFullYear === 'function') return _statsJour_(v);
    return String(v).trim();
  };
  const dejaFigees = {};
  const lignesStats = f.getDataRange().getValues();
  const posLigne = {};
  for (let r = 1; r < lignesStats.length; r++) {
    const s = _cleSem_(lignesStats[r][0]);
    if (!s) continue;
    posLigne[s] = r + 1;
    if (String(lignesStats[r][3]).trim().toUpperCase() === 'O') dejaFigees[s] = true;
  }

  const total = {}, gens = {};
  const data = brut.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    const h = data[r][0];
    if (!h) continue;
    const d = (h instanceof Date) ? h : new Date(h);
    if (isNaN(d.getTime())) continue;
    if (_statsJour_(d) < STATS_ORIGINE) continue;      // avant l'ouverture au service
    const sem = _statsLundi_(d);
    if (dejaFigees[sem]) continue;                     // jamais recompter une semaine close
    const qui = String(data[r][2] || data[r][1] || '').trim();
    if (!qui) continue;
    total[sem] = (total[sem] || 0) + 1;
    if (!gens[sem]) gens[sem] = {};
    gens[sem][qui] = true;
  }

  /* Une semaine est FIGÉE dès que son lundi + 7 jours est passé. */
  const lundiCourant = _statsLundi_(new Date());
  let ecrites = 0;
  Object.keys(total).sort().forEach(function (sem) {
    const actifs = Object.keys(gens[sem]).length;
    const close  = (sem < lundiCourant) ? 'O' : 'N';
    if (posLigne[sem]) {
      f.getRange(posLigne[sem], 2, 1, 3).setValues([[total[sem], actifs, close]]);
    } else {
      f.appendRow([sem, total[sem], actifs, close]);
    }
    ecrites++;
  });
  return ecrites + ' semaine(s) mise(s) à jour.';
}

/* À lancer UNE fois depuis l'éditeur Apps Script. Idempotent. */
function installStatsTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'statsRecalculer'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('statsRecalculer').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).nearMinute(0).create();
  return 'Declencheur statsRecalculer installe : tous les lundis vers 3 h.';
}

// ── GÉNÉRATION CODE ACCÈS ─────────────────────────────────────────────
/* PERDUE le 29/08/2026 (commit 2c01cb49, « compteurs d'usage ») : le bloc a été
   écrasé en même temps que la fin de logConnexion. Seul appelant : resetCodeMar,
   qui tombait donc en « generateCode is not defined » sans rien écrire.
   L'alphabet exclut I, O, 0 et 1 (confusions à la dictée). */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// (C3) setupIndispos supprimé — remplacé par initYear / setupAnnee.

// ── LIRE INDISPOS D'UN MAR ────────────────────────────────────────────
function getIndisposForDoctor(doctorId, year) {
  year = year || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`INDISPOS_${year}`);
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const dates = reconstruireDatesHeaders(data, year); // (C3b) helper unifié
  // MARs à partir de la ligne 4 (index 3)
  for (let r = 3; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(doctorId).trim()) {
      const indispos = {};
      dates.forEach((date, i) => {
        if (!date) return;
        const val = String(data[r][i+1]||'').trim();
        if (val) indispos[date] = val;
      });
      return indispos;
    }
  }
  return {};
}

// ── FUSION DES DEUX PROPRIETAIRES DE INDISPOS_{Y} ────────────────────
// L'onglet porte DEUX familles de codes, avec un proprietaire net :
//    VAC / FORM             -> le comite (staff.html, staff vacances)
//    INDISPO / SOUHAIT / TP -> le MAR    (indispos.html)
// Avant le 30/07/2026, saveIndispos REECRIVAIT la ligne entiere avec ce
// qu'envoyait la page. Deux pertes silencieuses en decoulaient :
//  1) « Valider et verrouiller » du staff n'envoie QUE les VAC/FORM :
//     revalider apres la campagne effacait toutes les saisies des MARs ;
//  2) une page MAR ouverte AVANT la pose des vacances les effacait en
//     enregistrant plus tard (elle renvoyait sa photo perimee).
// Regle posee : chacun remplace INTEGRALEMENT ses propres cases — un
// retrait reste donc possible des deux cotes — et ne touche JAMAIS
// celles de l'autre. En cas de conflit sur une date, la case du comite
// gagne : c'est le verrou des vacances, cote SERVEUR et non navigateur.
const CODES_COMITE = new Set(['VAC', 'FORM']);
function _fusionIndispos_(existant, envoye, estRoleComite) {
  const out = {};
  const auComite = v => CODES_COMITE.has(String(v || '').trim().toUpperCase());
  // 1) conserver les cases de L'AUTRE proprietaire, telles qu'en base
  Object.keys(existant || {}).forEach(function (d) {
    const v = String(existant[d] || '').trim();
    if (v && auComite(v) !== estRoleComite) out[d] = v;
  });
  // 2) poser MES cases telles qu'envoyees (une date absente = retrait)
  Object.keys(envoye || {}).forEach(function (d) {
    const v = String(envoye[d] || '').trim();
    if (!v) return;
    if (auComite(v) !== estRoleComite) return;  // code hors de mon perimetre : ignore
    if (estRoleComite) { out[d] = v; return; }  // le comite ecrase (verrou vacances)
    if (out[d]) return;                         // MAR : case VAC/FORM intouchable
    out[d] = v;
  });
  return out;
}

// ── SAUVEGARDER INDISPOS D'UN MAR ────────────────────────────────────
function saveIndisposForDoctor(doctorId, indisposMap, year) {
  year = year || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`INDISPOS_${year}`);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const dates = reconstruireDatesHeaders(data, year); // (C3b) helper unifié
  // MARs à partir de la ligne 4 (index 3)
  for (let r = 3; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(doctorId).trim()) {
      const rowValues = dates.map(date => date ? (indisposMap[date] || '') : '');
      sheet.getRange(r + 1, 2, 1, rowValues.length).setValues([rowValues]);
      return true;
    }
  }
  return false;
}

/* ═══ (POSE TP · 22/08/2026) LE CIRCUIT DE POSE DES TEMPS PARTIELS ═══════════
   Les TP se posent APRÈS la génération, dans ce qui reste. Trois familles de
   codes cohabitent désormais dans INDISPOS_{Y}, chacune avec son propriétaire :
     VAC / FORM        -> le comité   (staff vacances)
     INDISPO / SOUHAIT -> le MAR, pendant la campagne (indispos.html)
     TP / TPA          -> le MAR, via CE circuit, toute l'année
   TPA = « TP en attente » (jour jaune, sous réserve du comité). Il ne compte
   NI comme absence NI dans le quota : sinon la demande ferait elle-même
   baisser l'effectif, et deux demandes le même jour se bloqueraient. */

// Le MAR est-il hors du dispositif TP ? (règle SANS nom en dur : jours fixes
// déclarés — BONNET — ou rythme 2 semaines sur 2 — même règle que getVacConfig.)
function _tpFixeDe_(marId) {
  try {
    const f = getMedecinFlags();
    return f.rythme2sur2.has(marId) || !!f.tpJoursFixes[marId];
  } catch (e) { return false; }
}

function _quotiteDe_(marId) {
  const data = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS').getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim() === String(marId).trim()) return Number(data[r][4]) || 100;
  }
  return 100;
}

/* ── L'EFFECTIF PRÉSENT, CÔTÉ SERVEUR — réplique de _rPresents du générateur ──
   Même définition que generateur_gardes.gs (validée contre la ligne
   « TOTAL PRESENTS » du planning du service) : tous les MAR actifs sauf DRUGE,
   bornés par date_debut/date_fin ; absent = VAC/FORM/CL/TP/CTP/CP/A lu dans
   INDISPOS_{Y} (JAMAIS dans GARDES, qui écrit RG par-dessus TP — l.≈1535),
   semaine off du rythme 2/2, jour fixe tp_jours_fixes, et RG/R lus dans
   GARDES_{Y}. Les gardes G/G2 comptent PRÉSENTES (le MAR travaille au bloc).
   TPA ne compte pas absent — voir l'en-tête du circuit.
   Tout est lu UNE fois par appel, puis compté en mémoire. */
function _tpMondePresence_(annee) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ABS = new Set(['VAC', 'FORM', 'CL', 'TP', 'CTP', 'CP', 'A', 'RG_TRANSITION']);
  const FLAGS = getMedecinFlags();
  const medData = ss.getSheetByName('MEDECINS').getDataRange().getValues();
  const ids = [];
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][0]).trim();
    if (!id || id === 'DRUGE') continue;                     // même exclusion que le générateur
    if (String(medData[r][3]).trim().toUpperCase() !== 'O') continue;
    ids.push(id);
  }
  const indispos = {};
  const shI = ss.getSheetByName(`INDISPOS_${annee}`);
  const dI = shI ? shI.getDataRange().getValues() : [];
  const datesI = dI.length ? reconstruireDatesHeaders(dI, annee) : [];
  for (let r = 3; r < dI.length; r++) {
    const id = String(dI[r][0]).trim(); if (!id) continue;
    indispos[id] = {};
    datesI.forEach((ds, i) => {
      if (!ds) return;
      const v = String(dI[r][i + 1] || '').trim().toUpperCase();
      if (v) indispos[id][ds] = v;
    });
  }
  const enGarde = {}, enRepos = {}, en18 = {}, enTp = {};
  const shG = ss.getSheetByName(`GARDES_${annee}`);
  if (shG) {
    const dG = shG.getDataRange().getValues();
    const d2c = buildDateToCol(dG, annee);
    const c2d = {}; Object.keys(d2c).forEach(ds => { c2d[d2c[ds]] = ds; });
    for (let r = 3; r < dG.length; r++) {
      const id = String(dG[r][0]).trim(); if (!id) continue;
      for (let c = 1; c < dG[0].length; c++) {
        const ds = c2d[c]; if (!ds) continue;
        const v = String(dG[r][c] || '').trim().toUpperCase();
        // Le CODE est conservé (pas un simple booléen) : l'écran de pose
        // distingue GARDE / REPOS / RÉCUP dans ses pastilles.
        if (v === 'G' || v === 'G2') { (enGarde[id] = enGarde[id] || {})[ds] = v; }
        else if (v === 'RG' || v === 'R') { (enRepos[id] = enRepos[id] || {})[ds] = v; }
        // La garde de 18h : PRÉSENT dans l'effectif, mais AU TRAVAIL — un TP
        // (congé) ne peut pas s'y poser. Arbitrage Arthur du 22/08/2026.
        else if (v === '18') { (en18[id] = en18[id] || {})[ds] = v; }
        /* (23/08/2026) LE TP VIT DANS GARDES, plus dans INDISPOS. C'est
           l'onglet maître du planning : un TP écrit là retire le MAR de son
           secteur (il figure dans ABSENT_CODES, code.gs). INDISPOS redevient
           ce qu'il est : la matière première d'AVANT la génération. */
        else if (v === 'TP') { (enTp[id] = enTp[id] || {})[ds] = v; }
      }
    }
  }
  function presents(ds) {
    let n = 0;
    ids.forEach(id => {
      const dd = FLAGS.dateDebut[id], df = FLAGS.dateFin[id];
      if ((dd && ds < dd) || (df && ds >= df)) return;
      if (ABS.has((indispos[id] || {})[ds])) return;
      if (estSemaineOff(id, ds)) return;
      const tpF = FLAGS.tpJoursFixes[id];
      if (tpF && tpF.has(new Date(ds + 'T12:00:00').getDay())) return;
      if (enRepos[id] && enRepos[id][ds]) return;
      if (enTp[id] && enTp[id][ds]) return;          // jour de temps partiel accordé
      n++;
    });
    return n;
  }
  return { presents: presents, enGarde: enGarde, enRepos: enRepos, en18: en18, enTp: enTp,
           ids: ids, indispos: indispos,
           datesValides: new Set(datesI.filter(Boolean)) };
}

/* ── POSER LES TP D'UN MAR — le serveur juge, il ne croit pas l'écran ─────────
   L'écran calcule ses bandes depuis la copie rapide, qui peut retarder de
   quelques minutes : deux MAR peuvent voir le même jour vert. C'est donc ICI,
   au moment d'écrire, que chaque jour NOUVEAU est tranché, sur l'état réel du
   classeur :  il resterait ≥ 15 → TP validé · 13-14 → TPA (sous réserve) ·
   ≤ 12 → refusé. Un jour DÉJÀ posé est acquis, jamais re-jugé (« revenir sur
   un jour accordé serait pire que le problème »).
   Le rôle mar ne peut PAS transformer son TPA en TP (seul le comité valide) ;
   le rôle admin écrit ce qu'il envoie dans la famille TP/TPA, sans re-jugement :
   la décision du comité est souveraine et annulable.
   Une date absente de l'envoi = retrait (même sémantique que la campagne).
   Renvoie { success, resultat: {date: 'TP'|'TPA'|motif}, quota:{valides,total} } :
   c'est le récapitulatif que l'écran affiche à l'enregistrement. */
function _poserTp_(user, targetId, envoye, annee) {
  /* (23/08/2026 — refonte) LE TP S'ÉCRIT DANS GARDES, L'ONGLET MAÎTRE.
     INDISPOS n'est plus touché : il sert AVANT la génération, pas après.
     Une demande non tranchée n'écrit rien dans le planning — elle attend
     dans TP_DEMANDES. Le comité seul la transforme en TP.

     `envoye` est la photo complète de ce que l'écran croit : { date: 'TP' }.
     Ce qui n'y figure plus est retiré. */
  const estAdmin = user && user.role === 'admin';
  const M = _tpMondePresence_(annee);
  const jf = new Set(getJoursFeries(annee));
  const FERMES = _tpFermes_(annee);
  const aujourdHui = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const quotaTotal = getQuotasConges(_quotiteDe_(targetId)).ctp || 0;

  /* Le profil d'abord : jours fixes convenus, rythme deux semaines sur deux,
     ou temps plein — ces trois-là n'ont rien à poser. L'écran ne leur montre
     pas la carte, mais l'adresse reste tapable : le serveur tranche. */
  if (_tpFixeDe_(targetId) || quotaTotal <= 0) {
    const refus = {};
    Object.keys(envoye || {}).forEach(function (ds) {
      refus[ds] = 'profil sans jours de temps partiel';
    });
    return { success: true, resultat: refus, annee: annee,
             quota: { valides: 0, total: quotaTotal } };
  }

  const grille = _tpGrilleLire_(annee, targetId);            // ce que dit le planning
  const enAttente = {};                                       // demandes non tranchées
  _tpDemandes_(annee, targetId).forEach(function (x) { enAttente[x.date] = true; });

  const resultat = {};
  let nbTP = 0, nbAttente = 0, grilleTouchee = false;

  // ── Passe 1 : l'ACQUIS et l'ATTENTE ──────────────────────────────────
  Object.keys(grille).forEach(function (ds) {
    if (grille[ds] !== 'TP') return;
    const passe = ds < aujourdHui;
    if (ds in (envoye || {}) || (passe && !estAdmin)) {
      resultat[ds] = 'TP'; nbTP++;                            // conservé (figé si passé)
      return;
    }
    if (_tpGrilleEcrire_(annee, targetId, ds, '')) grilleTouchee = true;
    /* (LOT A · 01/09/2026) Depuis que les TP se posent AUSSI pendant la
       campagne, un même jour peut exister à deux endroits : la case TP dans
       INDISPOS_{Y} (posée avant la génération) et sa recopie dans GARDES_{Y}
       (faite par le générateur). Retirer l'une sans l'autre les fait diverger —
       et le jour reviendrait à la moindre régénération. On retire les deux. */
    _tpRetirerDIndispos_(annee, targetId, ds);
    resultat[ds] = 'retiré';
  });
  Object.keys(enAttente).forEach(function (ds) {
    if (ds in (envoye || {})) { resultat[ds] = 'TPA'; nbAttente++; return; }
    _tpDemandeRetirer_(annee, ds, targetId);
    resultat[ds] = 'retiré';
  });

  // ── Passe 2 : les NOUVEAUTÉS, dans l'ordre du calendrier ─────────────
  const nouveaux = Object.keys(envoye || {})
    .filter(function (ds) { return grille[ds] !== 'TP' && !enAttente[ds]; })
    .sort();

  nouveaux.forEach(function (ds) {
    if (!M.datesValides.has(ds)) { resultat[ds] = 'hors année'; return; }
    if (ds < aujourdHui) { resultat[ds] = 'jour passé'; return; }
    if (FERMES.has(ds)) { resultat[ds] = 'jour fermé par le comité'; return; }
    const dow = new Date(ds + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) { resultat[ds] = 'week-end'; return; }
    if (jf.has(ds)) { resultat[ds] = 'jour férié'; return; }
    const occupe = grille[ds];
    if (occupe) { resultat[ds] = 'jour déjà ' + occupe; return; }

    const presents = M.presents(ds);
    const reste = presents - 1;
    if (reste <= 12) { resultat[ds] = 'équipe trop réduite (' + presents + ' présents)'; return; }
    if (reste < 15) {
      /* Bande jaune : le comité tranchera. Rien n'entre dans le planning,
         le MAR travaille tant qu'il n'a pas de réponse.
         (23/08/2026) PLAFOND : accordés + en attente ne dépassent jamais le
         quota. Sans ça, on pouvait poser 26 jours verts ET 10 demandes, et se
         retrouver à 36 si tout passait. */
      if (nbTP + nbAttente >= quotaTotal) {
        resultat[ds] = 'quota atteint (' + quotaTotal + ', demandes en attente comprises)';
        return;
      }
      _tpDemandeAjouter_(annee, ds, targetId);
      resultat[ds] = 'TPA';
      nbAttente++;
      return;
    }
    if (nbTP + nbAttente >= quotaTotal) {
      resultat[ds] = 'quota atteint (' + quotaTotal
                   + (nbAttente ? ', demandes en attente comprises' : '') + ')';
      return;
    }
    if (!_tpGrilleEcrire_(annee, targetId, ds, 'TP')) {
      resultat[ds] = 'la case vient d\'être occupée'; return;
    }
    grilleTouchee = true;
    nbTP++;
    resultat[ds] = 'TP';
  });

  if (grilleTouchee) _tpRepublier_(annee);

  logAction('poserTp ' + targetId + ' (' + annee + ') — ' + nbTP + '/' + quotaTotal
            + ' posés, ' + Object.keys(resultat).length + ' jours traités'
            + (grilleTouchee ? ', planning republié' : ''));

  return { success: true, resultat: resultat, annee: annee,
           quota: { valides: nbTP, attente: nbAttente, total: quotaTotal } };
}

/* ── (23/08/2026) ÉCRIRE LE TEMPS PARTIEL DANS LA GRILLE DU PLANNING ──────
   GARDES_{Y} est l'onglet MAÎTRE. Un TP accordé s'y écrit, et nulle part
   ailleurs. Règles gravées :
     · on n'écrit QUE dans une case VIDE — jamais par-dessus une garde, un
       repos, une récupération, un 18h, un congé ou une formation ;
     · on n'efface QUE si la case porte exactement TP ;
     · lecture immédiatement avant écriture : entre l'affichage et le clic, un
       échange de gardes a pu remplir la case.
   Renvoie true si la grille a changé — l'appelant republie alors le planning. */
/* (LOT A · 01/09/2026) Efface la case TP d'un MAR dans INDISPOS_{Y}, et rien
   d'autre : si la case porte un autre code (vacances posées depuis par le
   comité, indisponibilité), on n'y touche pas. Silencieux si l'onglet ou la
   date n'existent pas — un retrait ne doit jamais faire échouer une pose. */
function _tpRetirerDIndispos_(annee, marId, ds) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('INDISPOS_' + annee);
    if (!sh) return false;
    const d = sh.getDataRange().getValues();
    const dates = reconstruireDatesHeaders(d, annee);
    const col = dates.indexOf(ds);
    if (col < 0) return false;
    for (let r = 3; r < d.length; r++) {
      if (String(d[r][0]).trim() !== String(marId).trim()) continue;
      if (String(d[r][col + 1] || '').trim().toUpperCase() !== 'TP') return false;
      sh.getRange(r + 1, col + 2).setValue('');
      return true;
    }
  } catch (e) { logAction('_tpRetirerDIndispos_ ' + marId + ' ' + ds + ' : ' + e.message); }
  return false;
}

function _tpGrilleEcrire_(annee, marId, ds, valeur) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('GARDES_' + annee);
  if (!sh) return false;
  const d = sh.getDataRange().getValues();
  const col = buildDateToCol(d, annee)[ds];
  if (col === undefined) return false;
  let ligne = -1;
  for (var r = 3; r < d.length; r++) {
    if (String(d[r][0]).trim() === String(marId).trim()) { ligne = r; break; }
  }
  if (ligne < 0) return false;
  const actuel = String(d[ligne][col] || '').trim().toUpperCase();
  if (valeur === 'TP') {
    if (actuel !== '') return false;                 // occupé : on ne touche à rien
    sh.getRange(ligne + 1, col + 1).setValue('TP');
    return true;
  }
  if (actuel !== 'TP') return false;                 // rien à effacer
  sh.getRange(ligne + 1, col + 1).setValue('');
  return true;
}

/* Ce que la grille dit d'un MAR : { date: code } pour toute la ligne. */
function _tpGrilleLire_(annee, marId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('GARDES_' + annee);
  const out = {};
  if (!sh) return out;
  const d = sh.getDataRange().getValues();
  const c2d = {};
  const dateToCol = buildDateToCol(d, annee);
  Object.keys(dateToCol).forEach(function (ds) { c2d[dateToCol[ds]] = ds; });
  for (var r = 3; r < d.length; r++) {
    if (String(d[r][0]).trim() !== String(marId).trim()) continue;
    for (var c = 1; c < d[r].length; c++) {
      const ds = c2d[c];
      const v = String(d[r][c] || '').trim().toUpperCase();
      if (ds && v) out[ds] = v;
    }
    break;
  }
  return out;
}

/* Republier le planning : le fichier que lisent les 23 est figé à la
   publication, écrire dans GARDES ne suffit pas. On ne réveille PAS le
   notifieur de changement de planning — la notification dédiée du circuit TP
   est plus précise, et deux messages pour un même événement se contredisent. */
/* (23/08/2026) REPUBLICATION DIFFÉRÉE — mesure du 09/08 : republier coûte
   ~10 s. Dans la requête, chaque validation du comité ferait attendre dix
   secondes, cinquante sur une série de cinq. On NOTE donc l'année à republier
   et on garantit UN déclencheur unique : la réponse part tout de suite, la
   republication tombe dans la minute. Même mécanisme que l'accroche différée
   de la copie rapide (miroir.gs, 05/08), et mêmes garanties : au pire, le
   planning publié a une minute de retard — le classeur, lui, est déjà juste.
   Le déclencheur porte un nom distinct de celui du miroir : les deux files
   doivent pouvoir vivre en parallèle. */
const TP_CLE_REPUBLIER = 'TP_ANNEES_A_REPUBLIER';

function _tpRepublier_(annee) {
  try {
    const props = PropertiesService.getScriptProperties();
    const verrou = LockService.getScriptLock();
    try { verrou.waitLock(5000); } catch (eL) { /* on note quand même */ }
    let file = [];
    try { file = JSON.parse(props.getProperty(TP_CLE_REPUBLIER) || '[]'); } catch (eP) { file = []; }
    const etaitVide = file.length === 0;
    if (file.indexOf(Number(annee)) === -1) file.push(Number(annee));
    props.setProperty(TP_CLE_REPUBLIER, JSON.stringify(file));
    try { verrou.releaseLock(); } catch (eR) {}
    /* (23/08/2026) Même piège que la copie rapide, corrigé de la même façon :
       la condition n'est pas « la file était vide » — une exécution morte
       avant purge la laisserait pleine à jamais — mais « aucun déclencheur
       n'existe ». C'est le seul fait qui compte. */
    const deja = ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'tpRepublicationDifferee';
    });
    if (!deja) {
      try { ScriptApp.newTrigger('tpRepublicationDifferee').timeBased().after(1000).create(); } catch (eT) {}
    }
  } catch (e) {
    /* Dernier recours : republier tout de suite plutôt que pas du tout. */
    try { generatePlanning(annee); } catch (e2) {
      try { Logger.log('_tpRepublier_ : ' + e2.message); } catch (e3) {}
    }
  }
}

/* Exécuté par le déclencheur (~30-60 s après la note) : republie, se nettoie.
   Un échec n'est pas grave — la note reste, la prochaine décision réarmera. */
function tpRepublicationDifferee() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tpRepublicationDifferee') {
      try { ScriptApp.deleteTrigger(t); } catch (e) {}
    }
  });
  const props = PropertiesService.getScriptProperties();
  let file = [];
  try { file = JSON.parse(props.getProperty(TP_CLE_REPUBLIER) || '[]'); } catch (e) { file = []; }
  props.deleteProperty(TP_CLE_REPUBLIER);
  file.forEach(function (y) {
    try { generatePlanning(y); logAction('Planning ' + y + ' republié (temps partiels)'); }
    catch (e) { try { Logger.log('tpRepublicationDifferee ' + y + ' : ' + e.message); } catch (e2) {} }
  });
}

/* ── LE REGISTRE DES DEMANDES EN ATTENTE — onglet TP_DEMANDES ─────────────
   Une demande non tranchée n'écrit RIEN dans les onglets de planning : tant
   que le comité n'a pas dit oui, le MAR travaille. Elle vit donc ici, et
   seulement ici. Colonnes : ANNEE | DATE | MAR | QUAND. */
function _tpDemandesSheet_(creer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('TP_DEMANDES');
  if (!sh && creer) {
    sh = ss.insertSheet('TP_DEMANDES');
    sh.getRange(1, 1, 1, 4).setValues([['ANNEE', 'DATE', 'MAR', 'QUAND']]);
  }
  return sh;
}
function _tpDemandes_(annee, marId) {
  const sh = _tpDemandesSheet_(false);
  const out = [];
  if (!sh) return out;
  const d = sh.getDataRange().getValues();
  for (var r = 1; r < d.length; r++) {
    if (Number(d[r][0]) !== Number(annee)) continue;
    const ds = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    const id = String(d[r][2]).trim();
    if (!ds || !id) continue;
    if (marId && id !== String(marId).trim()) continue;
    out.push({ date: ds, mar: id });
  }
  return out;
}
function _tpDemandeAjouter_(annee, ds, marId) {
  const sh = _tpDemandesSheet_(true);
  const deja = _tpDemandes_(annee, marId).some(function (x) { return x.date === ds; });
  if (deja) return;
  sh.appendRow([Number(annee), ds, String(marId), new Date().toISOString()]);
}
function _tpDemandeRetirer_(annee, ds, marId) {
  const sh = _tpDemandesSheet_(false);
  if (!sh) return;
  const d = sh.getDataRange().getValues();
  for (var r = d.length - 1; r >= 1; r--) {
    const dr = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    if (Number(d[r][0]) === Number(annee) && dr === ds
        && (!marId || String(d[r][2]).trim() === String(marId).trim())) {
      sh.deleteRow(r + 1);
    }
  }
}

/* Une notification ne fait JAMAIS échouer la décision qui la déclenche —
   règle du canal depuis le 12/08. `notifierPush_` avale déjà ses propres
   erreurs ; cette enveloppe protège aussi le cas où elle serait absente
   (miroir.gs non déployé) ou lèverait malgré tout. */
function _tpNotifier_(titre, corps, id) {
  try { notifierPush_(titre, corps, './indispos.html?tp=1', { id: String(id) }); }
  catch (e) { try { Logger.log('_tpNotifier_ : ' + e.message); } catch (e2) {} }
}

/* La date telle qu'on la dit : « jeudi 18 février ». Les notifications sont
   lues sur un écran verrouillé — « 2027-02-18 » n'y a pas sa place. */
function _tpJourLisible_(ds) {
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const d = new Date(ds + 'T12:00:00');
  if (isNaN(d.getTime())) return String(ds);
  return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()];
}

/* ── (LOT 4 · 22/08/2026) LES JOURS FERMÉS PAR LE COMITÉ — onglet TP_FERMES ──
   Un refus du comité ne vise pas UNE demande : il dit « ce jour-là, l'équipe
   est trop juste ». Le jour se ferme donc POUR TOUS : noir sur l'écran de
   pose, refusé par le serveur, et les demandes en attente ce jour-là sont
   rendues. Stockage : onglet TP_FERMES (ANNEE | DATE | PAR | QUAND), créé au
   premier refus — la liste voyage dans la clé pose_tp_{Y}. */
function _tpFermesSheet_(creer) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('TP_FERMES');
  if (!sh && creer) {
    sh = ss.insertSheet('TP_FERMES');
    sh.getRange(1, 1, 1, 4).setValues([['ANNEE', 'DATE', 'PAR', 'QUAND']]);
  }
  return sh;
}
function _tpFermes_(annee) {
  const sh = _tpFermesSheet_(false);
  const out = new Set();
  if (!sh) return out;
  const d = sh.getDataRange().getValues();
  for (var r = 1; r < d.length; r++) {
    if (Number(d[r][0]) !== Number(annee)) continue;
    const ds = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    if (ds) out.add(ds);
  }
  return out;
}
function _tpFermerJour_(annee, ds, par) {
  const sh = _tpFermesSheet_(true);
  if (_tpFermes_(annee).has(ds)) return;   // déjà fermé : idempotent
  sh.appendRow([Number(annee), ds, String(par || ''), new Date().toISOString()]);
}
function _tpRouvrirJour_(annee, ds) {
  const sh = _tpFermesSheet_(false);
  if (!sh) return;
  const d = sh.getDataRange().getValues();
  for (var r = d.length - 1; r >= 1; r--) {
    const dr = d[r][1] instanceof Date
      ? Utilities.formatDate(d[r][1], Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(d[r][1]).trim();
    if (Number(d[r][0]) === Number(annee) && dr === ds) sh.deleteRow(r + 1);
  }
}

/* ── (LOT 3 · 22/08/2026) LA CLÉ DE L'ÉCRAN DE POSE — pose_tp_{Y} ─────────────
   Tout ce que l'écran affiche, en UNE lecture de la copie rapide :
     presents    : effectif présent par jour ouvré (anonyme — des NOMBRES,
                   jamais de noms : servi à tout MAR)
     joursFeries : les fériés de l'année (la clé joursferies_{Y} est réservée
                   au comité — l'écran MAR les reçoit donc ICI)
     parMar      : pour chaque MAR, SES blocages (codes INDISPOS + G/G2/RG/R
                   des gardes) et SON quota — le relais filtre à l'identité,
                   comme indispos_{Y}
   Année sans phase active → { ferme: true }, poussé tel quel : la clé
   s'auto-nettoie quand GARDES_{Y} est supprimé pour régénérer (l'écran voit
   « fermé », et le serveur refuse de toute façon).
   Servie par le relais (miroir.gs) ET par l'action getPoseTp (repli GAS). */
function _construirePoseTp_(annee) {
  const ph = _phaseTp_();
  if (!ph.actif || ph.annees.indexOf(Number(annee)) === -1) return { success: true, ferme: true, year: annee };
  const M = _tpMondePresence_(annee);
  const jf = getJoursFeries(annee);
  const jfSet = new Set(jf);
  const presents = {};
  M.datesValides.forEach(function (ds) {
    const dow = new Date(ds + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6 || jfSet.has(ds)) return;   // jamais posables : pas comptés
    presents[ds] = M.presents(ds);
  });
  const attentes = {};
  _tpDemandes_(annee).forEach(function (x) {
    (attentes[x.mar] = attentes[x.mar] || {})[x.date] = true;
  });
  const parMar = {};
  M.ids.forEach(function (id) {
    const jours = {};
    const mesInd = M.indispos[id] || {};
    Object.keys(mesInd).forEach(function (ds) {
      const v = String(mesInd[ds]).trim().toUpperCase();
      if (v === 'INDISPO' || v === 'SOUHAIT') return;   // vestiges de campagne : ne bloquent plus
      /* (LOT A · 01/09/2026) Un TP peut venir de la campagne (INDISPOS) : il
         n'est plus un vestige. On l'ignore ICI quand même, car le générateur
         l'a recopié dans GARDES — l'onglet maître, lu quelques lignes plus
         bas. Le prendre aux deux endroits le compterait deux fois. */
      if (v === 'TP' || v === 'TPA') return;
      jours[ds] = mesInd[ds];
    });
    Object.keys(M.en18[id] || {}).forEach(function (ds) { jours[ds] = '18'; });
    /* (23/08/2026) Le TP accordé vient de GARDES, l'onglet maître. Les demandes
       en attente ne sont écrites nulle part dans le planning : elles vivent
       dans TP_DEMANDES et n'apparaissent ici que pour l'affichage. */
    Object.keys(M.enTp[id] || {}).forEach(function (ds) { jours[ds] = 'TP'; });
    // Les gardes par-dessus : dans GARDES, RG écrase TP — même priorité ici,
    // le MAR voit la vérité du planning publié.
    Object.keys(M.enGarde[id] || {}).forEach(function (ds) { jours[ds] = M.enGarde[id][ds]; });
    Object.keys(M.enRepos[id] || {}).forEach(function (ds) { jours[ds] = M.enRepos[id][ds]; });
    Object.keys(attentes[id] || {}).forEach(function (ds) {
      if (!jours[ds]) jours[ds] = 'TPA';               // en attente : rien dans le planning
    });
    parMar[id] = {
      jours: jours,
      quota: getQuotasConges(_quotiteDe_(id)).ctp || 0,
      tpFixe: _tpFixeDe_(id),
    };
  });
  /* (CORRECTIF 23/08/2026) `getJoursFeries` renvoie un ENSEMBLE. Un ensemble
     mis en texte pour voyager jusqu'à la page devient {} — vide et non
     parcourable : l'écran plantait à l'ouverture. Tout ce qui part dans une
     clé doit être une LISTE ou un objet simple. */
  return { success: true, year: annee, presents: presents,
           joursFeries: Array.from(jf).sort(),
           fermes: Array.from(_tpFermes_(annee)).sort(), parMar: parMar };
}

// ── (RH-1) GARANTIR LES LIGNES D'UN MAR DANS LES ONGLETS ANNUELS ──────
// Un MAR créé/réactivé APRÈS l'init d'une année n'a de ligne ni dans
// INDISPOS_{Y}, ni dans GARDES_{Y}, ni dans AFFECTATIONS_{Y} → indispos
// impossibles à saisir (échec silencieux), don/échange/garde exceptionnelle
// en erreur « introuvable », affectations sautées. Ce helper ajoute les
// lignes manquantes (année active et suivantes) ; idempotent, n'écrase rien.
function ensureMarRows(marId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const id = String(marId).trim().toUpperCase();
  const created = [];
  if (!id) return created;
  const activeYear = getActiveYear();
  const years = [];
  ss.getSheets().forEach(sh => {
    const m = sh.getName().match(/^INDISPOS_(\d{4})$/);
    if (m && Number(m[1]) >= activeYear) years.push(Number(m[1]));
  });
  years.sort();
  years.forEach(y => {
    _ensureRowInSheet_(ss, `INDISPOS_${y}`, id, 4, created);      // MARs dès la ligne 4
    _ensureRowInSheet_(ss, `GARDES_${y}`, id, 4, created);        // idem (si année générée)
    _ensureRowInSheet_(ss, `AFFECTATIONS_${y}`, id, 2, created);  // MARs dès la ligne 2
  });
  return created;
}

// Ajoute une ligne [id] en bas de sheetName si l'id n'y figure pas déjà.
// firstDataRow = première ligne de données MAR (1-indexé). Copie le format
// de la dernière ligne existante (zébrures WE, bordures) pour rester lisible.
function _ensureRowInSheet_(ss, sheetName, id, firstDataRow, created) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;                                  // onglet absent → rien à faire
  const last = sheet.getLastRow();
  if (last >= firstDataRow) {
    const ids = sheet.getRange(firstDataRow, 1, last - firstDataRow + 1, 1).getValues();
    for (let i = 0; i < ids.length; i++)
      if (String(ids[i][0]).trim().toUpperCase() === id) return;  // déjà présent
  }
  const newRow = Math.max(last, firstDataRow - 1) + 1;
  if (last >= firstDataRow) {
    const nCols = sheet.getLastColumn();
    sheet.getRange(last, 1, 1, nCols).copyTo(sheet.getRange(newRow, 1, 1, nCols), {formatOnly: true});
  }
  sheet.getRange(newRow, 1).setValue(id);
  created.push(sheetName);
}

// ── DIAG : localiser les gardes de GARDES_{Y} exclues du planning publié ──
// Rejoue EXACTEMENT les règles du constructeur JSON (generatePlanningFromGardes) :
//  - MAR absent de l'effectif MEDECINS (ACTIF=O) → ligne jamais lue ;
//  - garde hors période d'activité (< date_debut ou ≥ date_fin) → remise à vide ;
//  - colonne dont la date dépasse la borne de l'année → jamais construite ;
//  - ligne en double pour un même id (le JSON ne lit que la dernière).
// Renvoie [{id, date, cell, code, reason}] = les cases comptées « dans l'onglet »
// mais absentes du JSON (donc de l'écart X vs Y du diagnostic).
function _findPhantomGardes_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`GARDES_${year}`);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (!data.length || !data[0]) return [];

  const DOCTORS = getDoctorsFromMedecins();
  const effectif = {}; DOCTORS.forEach(d => { effectif[d.id] = true; });
  const FLAGS = getMedecinFlags();

  const dateToCol = buildDateToCol(data, year);
  const colToDate = {}; Object.keys(dateToCol).forEach(ds => { colToDate[dateToCol[ds]] = ds; });

  const start = getPremierJourPlanning(year);
  const nextStart = getPremierJourPlanning(year + 1);
  const endD = new Date(nextStart); endD.setDate(nextStart.getDate() - 1);
  const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  const startStr = fmt(start), endStr = fmt(endD);

  // Ligne retenue par id (la DERNIÈRE gagne, comme le JSON)
  const doctorRow = {};
  for (let r = 3; r < data.length; r++) { const id = String(data[r][0]).trim(); if (id) doctorRow[id] = r; }

  // Cases G/G2 réellement INCLUSES dans le JSON : clé `${id}|${date}`
  const included = {};
  DOCTORS.forEach(doc => {
    const rr = doctorRow[doc.id]; if (rr == null) return;
    const dd0 = FLAGS.dateDebut[doc.id], df0 = FLAGS.dateFin[doc.id];
    for (let c = 1; c < data[0].length; c++) {
      const ds = colToDate[c];
      if (!ds || ds < startStr || ds > endStr) continue;
      if ((dd0 && ds < dd0) || (df0 && ds >= df0)) continue;
      const v = String(data[rr][c] || '').trim().toUpperCase();
      if (v === 'G' || v === 'G2') included[`${doc.id}|${ds}`] = true;
    }
  });

  // Toutes les cases G/G2 de l'onglet ; phantom = non incluse dans le JSON
  const phantoms = [];
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    for (let c = 1; c < data[0].length; c++) {
      const v = String(data[r][c] || '').trim().toUpperCase();
      if (v !== 'G' && v !== 'G2') continue;
      const ds = colToDate[c];
      if (id && ds && included[`${id}|${ds}`]) continue;   // bien publiée
      const dateLabel = ds || `colonne ${c + 1}`;
      let reason;
      if (!id) reason = 'ligne sans identifiant MAR';
      else if (!effectif[id]) reason = `MAR « ${id} » absent de l'effectif MEDECINS (inactif ou id modifié)`;
      else if (!ds || ds < startStr || ds > endStr) reason = 'colonne hors année (date au-delà de la borne du planning)';
      else {
        const dd0 = FLAGS.dateDebut[id], df0 = FLAGS.dateFin[id];
        if (dd0 && ds < dd0) reason = `avant l'arrivée de ${id} (date_debut ${dd0})`;
        else if (df0 && ds >= df0) reason = `après le départ de ${id} (date_fin ${df0})`;
        else reason = `ligne en double pour ${id} dans GARDES_${year}`;
      }
      phantoms.push({ id: id || '—', date: dateLabel, cell: `L${r + 1}C${c + 1}`, code: v, reason });
    }
  }
  return phantoms;
}

// ── GARDE-FOU QUOTA D'ENVOI ───────────────────────────────────────────
// Le compte Google est un compte GRATUIT : 100 emails/jour, pas 1500.
// Avec ~23 MAR, un envoi groupé consomme un quart du quota ; trois envois dans
// la même journée (codes + récap congés + récap gardes) frôlent la limite.
// Sans contrôle, MailApp échoue EN COURS d'envoi : la moitié des MAR reçoit son
// mail, l'autre non, et rien ne dit où ça s'est arrêté. On refuse donc AVANT
// d'envoyer quoi que ce soit, plutôt que de laisser un envoi à moitié fait.
function _marsAvecEmail_() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MEDECINS');
    if (!sheet) return 0;
    const data = sheet.getDataRange().getValues();
    let n = 0;
    for (let r = 1; r < data.length; r++) {
      if (!String(data[r][0]).trim()) continue;                          // ligne vide
      if (String(data[r][3]).trim().toUpperCase() !== 'O') continue;     // inactif
      if (!String(data[r][7]).trim()) continue;                          // sans email
      n++;
    }
    return n;
  } catch (e) { return 0; }
}

// Renvoie un message d'erreur si le quota ne suffit pas, sinon null.
// Quota illisible (API indisponible) → on N'EMPÊCHE PAS l'envoi : mieux vaut
// tenter que bloquer le comité sur une lecture qui a échoué.
function _quotaEmailInsuffisant_(besoin) {
  if (!besoin) return null;
  try {
    const reste = MailApp.getRemainingDailyQuota();
    if (reste >= besoin) return null;
    logAction(`Envoi REFUSÉ — besoin ${besoin} emails, quota restant ${reste}`);
    return `Envoi annulé : ${besoin} email(s) à envoyer, il n'en reste que ${reste} aujourd'hui `
         + `(compte Google gratuit, 100/jour). Le quota se réinitialise chaque nuit — réessayez demain. `
         + `AUCUN email n'a été envoyé.`;
  } catch (e) { return null; }
}

// ── MODÈLE UNIQUE DES EMAILS DE CODE D'ACCÈS ──────────────────────────
// SOURCE UNIQUE pour les trois envois (sendCodes, sendCodesMar, resetCodeMar).
// Avant (07/2026) le texte était dupliqué à l'identique dans sendCodes et
// sendCodesMar : la correction d'année n'avait été appliquée qu'à un seul
// endroit. Toute évolution du message se fait DÉSORMAIS ICI, et nulle part ailleurs.
//
// Année : getIndisposYear() (= INDISPOS_ACTIVE, l'année RÉELLEMENT ouverte à la
// saisie), et non TEST_YEAR/getActiveYear qui est l'année du planning en cours.
// Les deux diffèrent pendant le Wizard 1 (octobre) — exactement quand ces emails
// partent en masse.
//   renouvele = true  → formulation « nouveau code, l'ancien ne marche plus »
function _mailCodeAcces_(nom, code, renouvele) {
  const ouvert = _indisposOuverte_();          // campagne en cours ?
  const an     = getIndisposYear();
  const base   = 'https://planningmedic.github.io/';
  const portail  = base + 'dashboard.html';
  const saisie   = base + 'indispos.html';
  const esc = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nomE = esc(nom), codeE = esc(code);

  const titre = renouvele ? "Votre nouveau code d'accès" : "Votre code d'accès";
  const introHtml = renouvele
    ? "Votre code d'accès personnel a été renouvelé. <strong>Le précédent n'est plus valable.</strong>"
    : "Voici votre code d'accès personnel au portail du service.";
  const introText = renouvele
    ? "Votre code d'accès personnel a été renouvelé. Le précédent n'est plus valable."
    : "Voici votre code d'accès personnel au portail du service.";

  // Appel à l'action : pendant la campagne la saisie prime, sinon le portail.
  const btn = (href, txt) =>
    '<a href="' + href + '" style="display:inline-block;background:#15803d;color:#ffffff;'
    + 'text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px">'
    + txt + ' &rarr;</a>';

  const corpsHtml = ouvert
    ? '<p style="margin:0 0 14px;font-size:13px;color:#3a4759">Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.</p>'
      + '<div style="background:#fff8e6;border:1px solid #f3e0b0;border-radius:10px;padding:13px 16px;margin-bottom:16px">'
        + '<div style="font-size:13px;font-weight:700;color:#8a5a00;margin-bottom:4px">Saisie des indisponibilités ' + an + ' ouverte</div>'
        + '<div style="font-size:12.5px;color:#6b5320">C\'est le moment de déclarer vos souhaits et vos congés.</div>'
      + '</div>'
      + btn(saisie, 'Saisir mes indisponibilités')
      + '<p style="margin:16px 0 0;font-size:12.5px;color:#697789">Portail du service : <a href="' + portail + '" style="color:#1d4ed8">' + portail + '</a></p>'
    : '<p style="margin:0 0 16px;font-size:13px;color:#3a4759">Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.</p>'
      + btn(portail, 'Ouvrir le portail');

  const html =
    '<div style="background:#f4f6f9;padding:0;margin:0">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 14px;font-family:Arial,Helvetica,sans-serif">' +
      '<div style="background:#ffffff;border:1px solid #e3e8ef;border-radius:14px;overflow:hidden">' +
        '<div style="background:#ce1126;padding:18px 22px">' +
          '<div style="color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Planning-Med &middot; Anesthésie-Réanimation</div>' +
          '<div style="color:#ffffff;font-size:19px;font-weight:700;margin-top:4px">' + titre + '</div>' +
        '</div>' +
        '<div style="padding:22px">' +
          '<p style="margin:0 0 16px;font-size:14px;color:#3a4759">Bonjour <strong>' + nomE + '</strong>,</p>' +
          '<p style="margin:0 0 16px;font-size:13px;color:#3a4759">' + introHtml + '</p>' +
          '<div style="background:#f4f6f9;border:1px solid #e3e8ef;border-radius:10px;padding:12px 16px;margin-bottom:18px">' +
            '<div style="font-size:11px;color:#697789;text-transform:uppercase;letter-spacing:.5px">Votre code d\'accès</div>' +
            '<div style="font-size:22px;font-weight:700;letter-spacing:2px;color:#ce1126;font-family:monospace">' + codeE + '</div>' +
          '</div>' +
          corpsHtml +
          '<p style="margin:18px 0 0;font-size:12px;color:#9aa4b2">Conservez ce code confidentiel. En cas de difficulté, contactez le comité planning.</p>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:center;font-size:11px;color:#9aa4b2;margin-top:14px">Le Comité Planning-Med</div>' +
    '</div>' +
    '</div>';

  const corpsText = ouvert
    ? 'Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.\n\n'
      + 'SAISIE DES INDISPONIBILITÉS ' + an + ' OUVERTE\n'
      + 'C\'est le moment de déclarer vos souhaits et vos congés :\n' + saisie + '\n\n'
      + 'Portail du service : ' + portail + '\n'
    : 'Il vous ouvre le portail du service : planning, gardes, congés, protocoles et annuaire.\n\n'
      + portail + '\n';

  const body =
    'Bonjour ' + nom + ',\n\n' + introText + '\n\n' +
    '    ' + code + '\n\n' + corpsText +
    '\nConservez ce code confidentiel.\n\nBonne journée,\nLe Comité Planning-Med';

  return {
    subject: '[Planning-Med] ' + titre,
    htmlBody: html,
    body: body,
    name: 'Comité Planning-Med',
  };
}

// ── VÉRIFIER CODE ACCÈS ───────────────────────────────────────────────
/* Analyse CONFIG / TUILES_PRIVEES pour UN identifiant.
   « AFR:crh,stats;WS:liberal » + « AFR »  ->  ['crh','stats']
   Cle absente, identifiant non cite, valeur mal formee : tableau vide.
   Le defaut est FERME — une tuile reservee ne s'ouvre jamais par accident.
   Meme format que _tuilesPriveesLire_ (miroir.gs) : une seule ecriture dans
   le classeur sert les deux chemins de lecture. */
function _tuilesPriveesDe_(brut, id) {
  try {
    const cible = String(id == null ? '' : id).trim().toUpperCase();
    if (!cible || !brut) return [];
    let trouve = [];
    String(brut).split(';').forEach(function (bloc) {
      const dp = bloc.indexOf(':');
      if (dp < 1) return;
      if (bloc.slice(0, dp).trim().toUpperCase() !== cible) return;
      trouve = trouve.concat(bloc.slice(dp + 1).split(',')
        .map(function (c) { return c.trim(); }).filter(Boolean));
    });
    return trouve;
  } catch (e) { return []; }   /* jamais bloquant : au pire, aucune tuile */
}

/* Ce MAR a-t-il droit a la tuile `cle` ? Lit CONFIG / TUILES_PRIVEES.
   MEME source que la tuile du dashboard : la porte du serveur et l'icone
   affichee ne peuvent plus diverger. C'est exactement le defaut du 29/08
   (tuile filtree sur l'identite, serveur sur le role) — un seul critere,
   un seul endroit. Le role `admin` n'est PAS traite ici : chaque appelant
   decide s'il l'accepte en plus, comme aujourd'hui. */
function _aDroitTuile_(id, cle) {
  try {
    const cible = String(id == null ? '' : id).trim().toUpperCase();
    if (!cible) return false;
    const rows = _configRows_();
    for (let r = 1; r < rows.length; r++) {
      if (String(rows[r][0]).trim() !== 'TUILES_PRIVEES') continue;
      return _tuilesPriveesDe_(rows[r][1], cible).indexOf(String(cle)) > -1;
    }
    return false;
  } catch (e) { return false; }   /* porte fermee par defaut */
}

function checkCode(code) {
  /* CASSE IGNOREE (27/07/2026). Le code etait compare a l'identique : taper son
     code en minuscules donnait « Code incorrect », sans indice. Le piege etait
     invisible parce que les champs de saisie portent autocapitalize="characters" :
     le telephone corrigeait tout seul, PAS l'ordinateur. Meme code, accepte sur
     mobile et refuse sur PC — incomprehensible pour l'utilisateur.
     Sans risque de collision : generateCode() n'emet que des MAJUSCULES
     (ABCDEFGHJKLMNPQRSTUVWXYZ23456789) et resetCodeMar verifie deja l'unicite en
     majuscules. Deux codes ne peuvent donc pas differer par la seule casse.
     ⚠️ Si un code est un jour saisi A LA MAIN dans le classeur, il doit rester
     unique une fois mis en majuscules. */
  const _normCode = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
  const codeN = _normCode(code);
  // Un code vide ne doit JAMAIS ouvrir de session : sans ce garde-fou, il
  // correspondrait a la cellule vide d'un MAR sans code.
  if (!codeN) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let adminCode = null;   // AUCUN code par défaut : ADMIN_CODE doit exister dans CONFIG
  // Code PARTAGE du secretariat d'anesthesie (lecture seule). Meme regime que
  // ADMIN_CODE : aucun defaut, la cle doit exister dans CONFIG pour que le role vive.
  let secretariatCode = null;
  /* (08/09/2026) Tuiles reservees — cle CONFIG / TUILES_PRIVEES. Lue ICI, dans
     la boucle qui parcourt deja CONFIG : aucune lecture supplementaire du
     classeur a chaque connexion. */
  let tuilesBrut = null;
  {
    const configData = _configRows_();   // memo de CONFIG (code.gs)
    for (let r = 1; r < configData.length; r++) {
      const _cle = String(configData[r][0]).trim();
      // Premiere occurrence gagnante pour chaque cle (comportement d'origine conserve :
      // le `break` initial faisait deja gagner la premiere ligne ADMIN_CODE).
      if (_cle === 'ADMIN_CODE'       && adminCode === null)       adminCode = String(configData[r][1]).trim();
      else if (_cle === 'SECRETARIAT_CODE' && secretariatCode === null) secretariatCode = String(configData[r][1]).trim();
      else if (_cle === 'TUILES_PRIVEES'   && tuilesBrut === null)      tuilesBrut = String(configData[r][1]);
    }
  }
  if (adminCode && _normCode(adminCode) === codeN) return {role: 'admin', id: 'ADMIN'};
  // ROLE SECRETARIAT (Lot 5-bis). Code partage, donc perimetre verrouille par la
  // liste blanche SECRETARIAT_ACTIONS dans doGet — refus par defaut de tout le reste.
  // Aucune donnee nominative renvoyee ici (ni nom, ni RPPS, ni prenom).
  // `name` sert uniquement de libelle dans le journal CONNEXIONS (logConnexion lit
  // user.name) : le code etant partage, on ne peut pas savoir QUI s'est connecte.
  if (secretariatCode && _normCode(secretariatCode) === codeN) {
    return {role: 'secretariat', id: 'SECRETARIAT', name: 'Secrétariat', initials: 'SEC'};
  }

  const sheet = ss.getSheetByName('MEDECINS');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  // Colonnes reperees par leur EN-TETE et non par un index fige : leur position peut
  // donc changer sans toucher au code.
  // ⚠️ Cela ne vaut QUE pour ces colonnes-ci. Toutes les autres lectures de MEDECINS
  // utilisent des index FIGES ([0] id, [1] nom, [2] initiales, [3] actif, [6] code,
  // [8] dect, [9..16] gardes). Consequence : une NOUVELLE colonne s'ajoute TOUJOURS
  // EN FIN d'onglet. Une insertion au milieu decale tout et rend les codes d'acces
  // inoperants -- constate en reel le 21/07/2026 (checkCode lisait la colonne voisine,
  // symptome : « code refuse » alors que le code est correct dans le classeur).
  const _colParTitre = function (titre) {
    if (!data.length) return -1;
    for (let c = 0; c < data[0].length; c++) {
      if (String(data[0][c]).trim().toUpperCase() === titre) return c;
    }
    return -1;
  };
  const colLib  = _colParTitre('LIBERAL');   // O/N : membre du groupement liberal
  const colRpps = _colParTitre('RPPS');      // n° RPPS, pre-remplissage des devis
  // PRENOM : colonne DEDIEE, ajoutee en fin d'onglet. Surtout NE PAS mettre le prenom
  // dans la colonne NOM : celle-ci alimente le planning, le dashboard et l'export Excel,
  // ou un nom rallonge deborderait partout.
  const colPre  = _colParTitre('PRENOM');
  for (let r = 1; r < data.length; r++) {
    if (_normCode(data[r][6]) === codeN) {
      return {role:'mar', id:data[r][0], name:data[r][1], initials:data[r][2],
              // (POSE TP · 22/08/2026) Quotité (col. E) : pilote l'éligibilité à la
              // tuile « Mes jours de temps partiel » et le quota annuel (CONFIG_CONGES).
              quotite: Number(data[r][4]) || 100,
              liberal: colLib >= 0 && String(data[r][colLib]).trim().toUpperCase() === 'O',
              // DONNEE NOMINATIVE. Le RPPS vit UNIQUEMENT dans le classeur prive, jamais
              // dans le depot (public). Il n'est renvoye qu'au MAR identifie par SON code
              // personnel, et pour sa seule ligne : personne ne recoit le RPPS d'un autre.
              rpps: colRpps >= 0 ? String(data[r][colRpps] == null ? '' : data[r][colRpps]).trim() : '',
              // DONNEE NOMINATIVE, meme regime que le RPPS : classeur prive uniquement,
              // renvoyee au seul MAR identifie par son propre code.
              prenom: colPre >= 0 ? String(data[r][colPre] == null ? '' : data[r][colPre]).trim() : '',
              /* (08/09/2026) Tuiles reservees. Ce champ existe AUSSI dans la cle
                 `acces` de la copie rapide (miroir.gs, meme format CONFIG). Les
                 DEUX chemins doivent le porter : sinon la tuile s'affiche quand
                 le relais repond et disparait des qu'il est en panne. */
              tuiles: _tuilesPriveesDe_(tuilesBrut, data[r][0])};
    }
  }
  return null;
}

// ── JOURS FÉRIÉS ─────────────────────────────────────────────────────
// (C3) Définition unique : getJoursFeries() est global, défini dans code.gs.

// ── CALCUL PRIORITÉS VACANCES ─────────────────────────────────────────
// ── Cache PAR-EXÉCUTION des onglets partagés (process neuf à chaque requête →
// jamais de données périmées). Évite que getVacConfig relise GROUPES_VAC / PERIODES_VAC /
// INDISPOS / MEDECINS une fois PAR médecin (getConflitsAll boucle sur ~20 MARs).
var _VAC_SHARED = {};
function _getVacShared(year) {
  if (_VAC_SHARED[year]) return _VAC_SHARED[year];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gs = ss.getSheetByName('GROUPES_VAC');
  const ps = ss.getSheetByName('PERIODES_VAC');
  const is_ = ss.getSheetByName(`INDISPOS_${year}`);
  const ms = ss.getSheetByName('MEDECINS');
  _VAC_SHARED[year] = {
    groupData: gs ? gs.getDataRange().getValues() : [],
    perData:   ps ? ps.getDataRange().getValues() : [],
    indData:   is_ ? is_.getDataRange().getValues() : null,
    medData:   ms ? ms.getDataRange().getValues() : [],
    jfYear:     getJoursFeries(year),
    jfNextYear: getJoursFeries(year + 1),
  };
  return _VAC_SHARED[year];
}

/* ── ORDRE DE PASSAGE DES VACANCES — bandeau « Mes congés » ───────────────
   (13/08/2026) Répond pour DEUX années d'un coup, et c'est ce qui impose une
   fonction séparée de getVacConfig : celle-ci part de PERIODES_VAC, qui ne
   contient que les périodes de l'année de campagne, et de INDISPOS_{Y}, qui
   n'existe pas encore pour l'année suivante. L'ordre de passage, lui, ne
   dépend que de GROUPES_VAC et de l'année : il est donc calculable pour
   n'importe quelle année, même sans campagne ouverte.

   SENS DE ROTATION : à DROITE, le dernier repasse premier — pour les groupes
   entre eux comme pour les membres d'un groupe. C'est le sens de l'écran
   d'arbitrage, seul à faire foi (défaut du 30/07/2026 : le serveur tournait à
   gauche, les deux ordres ne coïncidaient qu'une année sur trois).

   NE RENVOIE QUE DES IDENTIFIANTS de MAR, jamais d'adresse ni de code. */
function getOrdreVacances(doctorId, annees) {
  const ORDRE_BASE_2026 = {
    HIVER:'CAB', PRINTEMPS:'ABC', ETE:'ABC', TOUSSAINT:'BCA', NOEL:'CAB',
  };
  const PERIODES = [
    ['Hiver','HIVER'], ['Printemps','PRINTEMPS'], ['Été','ETE'],
    ['Toussaint','TOUSSAINT'], ['Noël','NOEL'],
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gs = ss.getSheetByName('GROUPES_VAC');
  if (!gs) return { annees: [] };
  const gd = gs.getDataRange().getValues();

  const groupes = { A: [], B: [], C: [] };
  const ordreBase = { A: {}, B: {}, C: {} };
  for (let r = 1; r < gd.length; r++) {
    const grp = String(gd[r][0]).trim();
    const id  = String(gd[r][1]).trim();
    const ord = Number(gd[r][2]);
    if (!id || !groupes[grp]) continue;
    groupes[grp].push(id);
    ordreBase[grp][id] = ord;
  }

  const out = [];
  (annees || []).forEach(function (an) {
    const offset = Number(an) - 2026;
    const ordonne = {};
    ['A','B','C'].forEach(function (g) {
      const tri = [...groupes[g]].sort((a,b) => ordreBase[g][a] - ordreBase[g][b]);
      const n = tri.length;
      const sh = n ? (((n - (offset % n)) % n) + n) % n : 0;
      ordonne[g] = [...tri.slice(sh), ...tri.slice(0, sh)];
    });

    let monGroupe = null, monRang = 0;
    ['A','B','C'].forEach(function (g) {
      const i = ordonne[g].indexOf(doctorId);
      if (i > -1) { monGroupe = g; monRang = i + 1; }
    });

    const gsh = (((3 - (offset % 3)) % 3) + 3) % 3;
    const periodes = PERIODES.map(function (p) {
      const arr = (ORDRE_BASE_2026[p[1]] || 'ABC').split('');
      return { nom: p[0], ordre: [...arr.slice(gsh), ...arr.slice(0, gsh)] };
    });

    out.push({
      annee: Number(an),
      monGroupe: monGroupe,
      monRang: monRang,
      tailleGroupe: monGroupe ? ordonne[monGroupe].length : 0,
      groupes: ordonne,
      periodes: periodes,
    });
  });
  return { annees: out };
}

function getVacConfig(doctorId, year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const _ctx = _getVacShared(year);

  const ORDRE_BASE_2026 = {
    HIVER:'CAB', PRINTEMPS:'ABC', ETE:'ABC', TOUSSAINT:'BCA', NOEL:'CAB',
  };

  function premierJourAnneePlanning(y) {
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay();
    const offset = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow;
    const d = new Date(y, 0, 1 + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  const groupData = _ctx.groupData;
  const groups = { A: [], B: [], C: [] };
  const ordre2026 = { A: {}, B: {}, C: {} };
  for (let r = 1; r < groupData.length; r++) {
    const grp = String(groupData[r][0]).trim();
    const id  = String(groupData[r][1]).trim();
    const ord = Number(groupData[r][2]);
    if (!id || !groups[grp]) continue;
    groups[grp].push(id);
    ordre2026[grp][id] = ord;
  }

  const offset = year - 2026;
  function getOrderedGroup(grp) {
    const sorted = [...groups[grp]].sort((a,b) => ordre2026[grp][a] - ordre2026[grp][b]);
    const shift = sorted.length ? (sorted.length - (offset % sorted.length)) % sorted.length : 0;  // rotation droite, cf. grpShift
    return [...sorted.slice(shift), ...sorted.slice(0, shift)];
  }
  const orderedA = getOrderedGroup('A');
  const orderedB = getOrderedGroup('B');
  const orderedC = getOrderedGroup('C');

  const perData = _ctx.perData;
  const debutAnnee = premierJourAnneePlanning(year);
  const finAnnee = premierJourAnneePlanning(year + 1);

  const indData = _ctx.indData;
  if (!indData) return { periodes: [], quotaVac: 40, totalVacDoc: 0 };

  const jan1Ind = new Date(year, 0, 1);
  const dow1Ind = jan1Ind.getDay();
  const off1Ind = dow1Ind === 1 ? 7 : dow1Ind === 0 ? 1 : 8 - dow1Ind;
  const startInd = new Date(year, 0, 1 + off1Ind, 12, 0, 0);
  const jan1NextInd = new Date(year + 1, 0, 1);
  const dow1NextInd = jan1NextInd.getDay();
  const offNextInd = dow1NextInd === 1 ? 7 : dow1NextInd === 0 ? 1 : 8 - dow1NextInd;
  const endInd = new Date(year + 1, 0, offNextInd);
  const indDates = [];
  const dtInd = new Date(startInd);
  while (dtInd <= endInd) {
    indDates.push(`${dtInd.getFullYear()}-${String(dtInd.getMonth()+1).padStart(2,'00')}-${String(dtInd.getDate()).padStart(2,'00')}`);
    dtInd.setDate(dtInd.getDate() + 1);
  }

  const vacByDoc = {};
  for (let r = 3; r < indData.length; r++) {
    const id = String(indData[r][0]).trim();
    if (!id) continue;
    vacByDoc[id] = new Set();
    indDates.forEach((date, i) => {
      const val = String(indData[r][i+1]||'').trim();
      if (val === 'VAC' || val === 'FORM') vacByDoc[id].add(date);
    });
  }

  const medData = _ctx.medData;
  let quotite = 100;
  for (let r = 1; r < medData.length; r++) {
    if (String(medData[r][0]).trim() === doctorId) {
      quotite = Number(medData[r][4]) || 100;
      break;
    }
  }
  const quotas = getQuotasConges(quotite);
  const quotaVac = quotas.vac;

  const jfYear = _ctx.jfYear;
  const jfNextYear = _ctx.jfNextYear;
  const totalVacDoc = [...(vacByDoc[doctorId] || [])].filter(date => {
    const dow = new Date(date).getDay();
    return dow !== 0 && dow !== 6 && !jfYear.has(date) && !jfNextYear.has(date);
  }).length;

  const periodes = [];
  for (let r = 1; r < perData.length; r++) {
    const nom = String(perData[r][0]).trim();
    const debutRaw = perData[r][1];
    const finRaw   = perData[r][2];
    const debut = debutRaw instanceof Date
      ? `${debutRaw.getFullYear()}-${String(debutRaw.getMonth()+1).padStart(2,'00')}-${String(debutRaw.getDate()).padStart(2,'00')}`
      : String(debutRaw).trim();
    const fin = finRaw instanceof Date
      ? `${finRaw.getFullYear()}-${String(finRaw.getMonth()+1).padStart(2,'00')}-${String(finRaw.getDate()).padStart(2,'00')}`
      : String(finRaw).trim();
    const seuil = Number(perData[r][3]);

    if (debut < debutAnnee || debut >= finAnnee) continue;

    const nomNorm = nom.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
    const base = ORDRE_BASE_2026[nomNorm] || 'ABC';
    const grpArr = base.split('');
    // ROTATION DROITE — « le dernier devient le premier » : ABC -> CAB -> BCA.
    // (30/07/2026) Le serveur tournait à GAUCHE (offset % 3) alors que staff.html et
    // admin.html tournent à DROITE : les deux ordres n'étaient identiques qu'une année
    // sur trois. Une année sur trois, le MAR désigné comme le moins prioritaire par le
    // calcul des conflits n'était PAS celui affiché au staff. Constaté en réel sur
    // l'hiver 2027. Le sens qui fait foi est celui de l'écran d'arbitrage.
    const grpShift = (3 - (offset % 3)) % 3;
    const orderedGrps = [...grpArr.slice(grpShift), ...grpArr.slice(0, grpShift)];
    const orderedList = [];
    orderedGrps.forEach(g => {
      if (g === 'A') orderedList.push(...orderedA);
      else if (g === 'B') orderedList.push(...orderedB);
      else if (g === 'C') orderedList.push(...orderedC);
    });

    const rang = orderedList.indexOf(doctorId) + 1;
    const joursBloqués = [];
    const joursDisponibles = [];
    const dt = new Date(debut + 'T12:00:00');
    const dtFin = new Date(fin + 'T12:00:00');

    while (dt <= dtFin) {
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'00')}-${String(dt.getDate()).padStart(2,'00')}`;
      const _dow = dt.getDay();
      if (_dow === 0 || _dow === 6 || jfYear.has(dateStr) || jfNextYear.has(dateStr)) {
        joursDisponibles.push(dateStr); dt.setDate(dt.getDate() + 1); continue;
      }
      const marEnVacCeJour = orderedList.filter(id => vacByDoc[id]?.has(dateStr));
      const nbEnVac = marEnVacCeJour.length;
      const rangDansCeJour = marEnVacCeJour.indexOf(doctorId) + 1;

      if (rangDansCeJour > 0 && rangDansCeJour > seuil) joursBloqués.push(dateStr);
else joursDisponibles.push(dateStr);

      dt.setDate(dt.getDate() + 1);
    }

    const aBloqueAuMoinsUnJour = joursBloqués.length > 0;
    const tousBloqués = joursBloqués.length === (joursDisponibles.length + joursBloqués.length);

    periodes.push({
      nom, debut, fin, seuil, rang,
      joursBloqués, joursDisponibles,
      bloque: aBloqueAuMoinsUnJour, tousBloqués,
      marAvantNonValides: 0, marEnVac: 0, seuilAtteint: tousBloqués,
    });
  }

  return { periodes, quotaVac, quotaForm: quotas.form, quotaCtp: quotas.ctp, totalVacDoc };
}
// ── R2 — Système de congés (quotas pilotés par CONFIG_CONGES) ──────────
function setupCongesConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('CONFIG_CONGES');
  if (sheet) { SpreadsheetApp.getUi().alert('CONFIG_CONGES existe déjà — rien modifié.'); return; }
  sheet = ss.insertSheet('CONFIG_CONGES');
  sheet.getRange(1, 1, 1, 4).setValues([['QUOTITE', 'VAC', 'FORM', 'CTP']]).setFontWeight('bold');
  const rows = [[100,33,10,0],[90,30,9,12],[80,26,8,26],[60,20,6,62],[50,17,5,104]];
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  sheet.setColumnWidth(1, 90); [2,3,4].forEach(c => sheet.setColumnWidth(c, 70));
  sheet.setFrozenRows(1);
  SpreadsheetApp.getUi().alert('✅ CONFIG_CONGES créé.\n\n⚠️ Chiffres à confirmer avec la DRH (surtout CTP).');
}

let _quotasCache = null;
function _loadQuotasConges() {
  if (_quotasCache !== null) return _quotasCache;
  _quotasCache = {};
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG_CONGES');
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let r = 1; r < data.length; r++) {
      const q = Number(data[r][0]); if (!q) continue;
      _quotasCache[q] = { vac:Number(data[r][1])||0, form:Number(data[r][2])||0, ctp:Number(data[r][3])||0 };
    }
  }
  return _quotasCache;
}

function getQuotasConges(quotite) {
  const q = Number(quotite) || 100;
  const table = _loadQuotasConges();
  if (table[q]) return { vac:table[q].vac, form:table[q].form, ctp:q>=100?0:table[q].ctp };
  const tiers = Object.keys(table).map(Number);
  if (tiers.length) {
    const n = tiers.reduce((a,b) => Math.abs(b-q)<Math.abs(a-q)?b:a);
    return { vac:table[n].vac, form:table[n].form, ctp:q>=100?0:table[n].ctp };
  }
  return { vac:Math.round(17+16*(q-50)/50), form:Math.round(5+5*(q-50)/50), ctp:0 };
}
// ── VALIDATION VACANCES ───────────────────────────────────────────────
function getVacValidation(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const ORDRE_BASE_2026 = {
    HIVER:'CAB', PRINTEMPS:'ABC', ETE:'ABC', TOUSSAINT:'BCA', NOEL:'CAB',
  };

  function premierJourAnneePlanning(y) {
    const jan1 = new Date(y, 0, 1);
    const dow = jan1.getDay();
    const offset = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow;
    const d = new Date(y, 0, 1 + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  const groupSheet = ss.getSheetByName('GROUPES_VAC');
  const groupData = groupSheet.getDataRange().getValues();
  const groups = { A: [], B: [], C: [] };
  const ordre2026 = { A: {}, B: {}, C: {} };
  for (let r = 1; r < groupData.length; r++) {
    const grp = String(groupData[r][0]).trim();
    const id  = String(groupData[r][1]).trim();
    const ord = Number(groupData[r][2]);
    if (!id || !groups[grp]) continue;
    groups[grp].push(id);
    ordre2026[grp][id] = ord;
  }

  const offset = year - 2026;
  function getOrderedGroup(grp) {
    const sorted = [...groups[grp]].sort((a,b) => ordre2026[grp][a] - ordre2026[grp][b]);
    const shift = sorted.length ? (sorted.length - (offset % sorted.length)) % sorted.length : 0;  // rotation droite, cf. grpShift
    return [...sorted.slice(shift), ...sorted.slice(0, shift)];
  }
  const orderedA = getOrderedGroup('A');
  const orderedB = getOrderedGroup('B');
  const orderedC = getOrderedGroup('C');

  const perSheet = ss.getSheetByName('PERIODES_VAC');
  const perData = perSheet.getDataRange().getValues();
  const debutAnnee = premierJourAnneePlanning(year);
  const finAnnee = premierJourAnneePlanning(year + 1);

  const indSheet = ss.getSheetByName(`INDISPOS_${year}`);
  if (!indSheet) return [];

  const jan1Ind = new Date(year, 0, 1);
  const dow1Ind = jan1Ind.getDay();
  const off1Ind = dow1Ind === 1 ? 7 : dow1Ind === 0 ? 1 : 8 - dow1Ind;
  const startInd = new Date(year, 0, 1 + off1Ind, 12, 0, 0);
  const jan1NextInd = new Date(year + 1, 0, 1);
  const dow1NextInd = jan1NextInd.getDay();
  const offNextInd = dow1NextInd === 1 ? 7 : dow1NextInd === 0 ? 1 : 8 - dow1NextInd;
  const endInd = new Date(year + 1, 0, offNextInd);
  const indDates = [];
  const dtInd = new Date(startInd);
  while (dtInd <= endInd) {
    indDates.push(`${dtInd.getFullYear()}-${String(dtInd.getMonth()+1).padStart(2,'00')}-${String(dtInd.getDate()).padStart(2,'00')}`);
    dtInd.setDate(dtInd.getDate() + 1);
  }

  const indData = indSheet.getDataRange().getValues();
  const vacByDoc = {};
  for (let r = 3; r < indData.length; r++) {
    const id = String(indData[r][0]).trim();
    if (!id) continue;
    vacByDoc[id] = new Set();
    indDates.forEach((date, i) => {
      const val = String(indData[r][i+1]||'').trim();
      if (val === 'VAC' || val === 'FORM') vacByDoc[id].add(date);
    });
  }

  const medSheet = ss.getSheetByName('MEDECINS');
  const medData = medSheet.getDataRange().getValues();
  const nomMap = {};
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][0]).trim();
    nomMap[id] = String(medData[r][1]).trim();
  }

  const jfYear = getJoursFeries(year);
  const jfNextYear = getJoursFeries(year + 1);

  const result = [];
  for (let r = 1; r < perData.length; r++) {
    const nom = String(perData[r][0]).trim();
    const debutRaw = perData[r][1];
    const finRaw   = perData[r][2];
    const debut = debutRaw instanceof Date
      ? `${debutRaw.getFullYear()}-${String(debutRaw.getMonth()+1).padStart(2,'00')}-${String(debutRaw.getDate()).padStart(2,'00')}`
      : String(debutRaw).trim();
    const fin = finRaw instanceof Date
      ? `${finRaw.getFullYear()}-${String(finRaw.getMonth()+1).padStart(2,'00')}-${String(finRaw.getDate()).padStart(2,'00')}`
      : String(finRaw).trim();
    const seuil = Number(perData[r][3]);

    if (debut < debutAnnee || debut >= finAnnee) continue;

    const nomNorm = nom.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
    const base = ORDRE_BASE_2026[nomNorm] || 'ABC';
    const grpArr = base.split('');
    // ROTATION DROITE — « le dernier devient le premier » : ABC -> CAB -> BCA.
    // (30/07/2026) Le serveur tournait à GAUCHE (offset % 3) alors que staff.html et
    // admin.html tournent à DROITE : les deux ordres n'étaient identiques qu'une année
    // sur trois. Une année sur trois, le MAR désigné comme le moins prioritaire par le
    // calcul des conflits n'était PAS celui affiché au staff. Constaté en réel sur
    // l'hiver 2027. Le sens qui fait foi est celui de l'écran d'arbitrage.
    const grpShift = (3 - (offset % 3)) % 3;
    const orderedGrps = [...grpArr.slice(grpShift), ...grpArr.slice(0, grpShift)];
    const orderedList = [];
    orderedGrps.forEach(g => {
      if (g === 'A') orderedList.push(...orderedA);
      else if (g === 'B') orderedList.push(...orderedB);
      else if (g === 'C') orderedList.push(...orderedC);
    });

    const mars = orderedList.map((id, idx) => {
      const rang = idx + 1;
      const joursVac = [...(vacByDoc[id] || [])].filter(d => d >= debut && d <= fin);
      const joursOuvres = joursVac.filter(d => {
        const dow = new Date(d).getDay();
        return dow !== 0 && dow !== 6 && !jfYear.has(d) && !jfNextYear.has(d);
      });

      let joursValides = 0, joursRefuses = 0;
      joursOuvres.forEach(date => {
        const marEnVacCeJour = orderedList.filter(mid => vacByDoc[mid]?.has(date));
        const rangCeJour = marEnVacCeJour.indexOf(id) + 1;
        if (rangCeJour > 0 && rangCeJour <= seuil) joursValides++;
        else if (rangCeJour > seuil) joursRefuses++;
      });

      let statut;
      if (joursOuvres.length === 0) statut = 'AUCUN';
      else if (joursRefuses === 0) statut = 'VALIDE';
      else if (joursValides === 0) statut = 'REFUSE';
      else statut = 'PARTIEL';

      return {id, nom:nomMap[id]||id, rang,
        joursVac:joursVac.length, joursOuvres:joursOuvres.length,
        joursValides, joursRefuses, statut};
    });

    result.push({ nom, debut, fin, seuil, mars });
  }

  return result;
}

// ── APPLY MODIFICATION (Comité) ───────────────────────────────────────
function applyModification(mod) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = Number(mod.year) || TEST_YEAR;

  /* (03/08/2026) Verrou explicite sur les annees cloturees. La protection existait
     deja, mais par accident : getSheet() ne cherchant que dans le maitre, une annee
     archivee produisait « Onglet GARDES_YYYY introuvable ». Le jour ou cette fonction
     lira les archives pour une bonne raison, la protection disparaitrait sans que
     personne ne s'en apercoive. La regle est donc ecrite, et le message est lisible. */
  if (!ss.getSheetByName(`GARDES_${year}`)) {
    throw new Error(`Année ${year} archivée — consultation seule, aucune modification possible`);
  }

  function getSheet(name) {
    const s = ss.getSheetByName(name);
    if (!s) throw new Error(`Onglet ${name} introuvable`);
    return s;
  }

  function buildDateIndex(sheet) {
    const jan1 = new Date(year, 0, 1);
    const dow1 = jan1.getDay();
    const off1 = dow1 === 1 ? 7 : dow1 === 0 ? 1 : 8 - dow1;
    const startDate = new Date(year, 0, 1 + off1, 12, 0, 0);
    const nCols = sheet.getLastColumn() - 1;
    const index = {};
    for (let i = 0; i < nCols; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
      index[key] = i + 2;
    }
    return index;
  }

  function getDateIndex(sheet, date) { return buildDateIndex(sheet)[date] || -1; }

  function getDoctorRow(sheet, doctorId) {
    const col = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    for (let i = 3; i < col.length; i++) {
      if (String(col[i][0]).trim() === doctorId) return i + 1;
    }
    return -1;
  }

  function writeCell(sheetName, doctorId, date, value) {
    const sheet = getSheet(sheetName);
    const col = getDateIndex(sheet, date);
    const row = getDoctorRow(sheet, doctorId);
    if (col < 0) throw new Error(`Date ${date} introuvable dans ${sheetName}`);
    if (row < 0) throw new Error(`Médecin ${doctorId} introuvable dans ${sheetName}`);
    /* (13/08/2026 — échanges, phase 3) Mode dryRun : TOUS les contrôles sont
       joués (la doctrine 2026-08-05.12 garantit qu'ils précèdent la première
       écriture), l'existence des cellules visées comprise — seule l'écriture
       elle-même est neutralisée. C'est ce qui permet de juger une demande
       d'échange DÈS SA CRÉATION sans dupliquer un seul contrôle. */
    if (mod.dryRun) return;
    sheet.getRange(row, col).setValue(value);
  }

  function readCell(sheetName, doctorId, date) {
    const sheet = getSheet(sheetName);
    const col = getDateIndex(sheet, date);
    const row = getDoctorRow(sheet, doctorId);
    if (col < 0 || row < 0) return '';
    return String(sheet.getRange(row, col).getValue()).trim();
  }

  function nextDay(date) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  function prevDay(date) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'00')}-${String(d.getDate()).padStart(2,'00')}`;
  }

  /* ── GARDE-FOUS (02/08/2026) ──────────────────────────────────────────────
     Un don / une garde exceptionnelle ecrivait le RG du lendemain SANS regarder
     la case d'arrivee. Constate sur 2027 : la garde du jeudi 25/03 donnee a
     DURAND a fait ecrire 'RG' le vendredi 26/03, ecrasant SA PROPRE garde de
     ce jour-la. Resultat : 26/03/2027 sans G, un RG orphelin le 27, aucun signal.
     Trois regles desormais :
       1. aucune ecriture ne detruit un G/G2 existant ;
       2. personne ne recoit une garde adjacente a une garde qu'il tient deja ;
       3. toutes les cases visees sont verifiees AVANT la premiere ecriture
          (writeCell leve une erreur si le MAR est absent de la grille — ex. un
          MAR actif mais sorti de GARDES_{annee} — et laissait la modification
          a moitie appliquee, donc une garde perdue). */
  const estGarde = v => /^G2?$/i.test(String(v == null ? '' : v).trim());

  function refuseSiGarde(who, jour, motif) {
    const v = readCell(`GARDES_${year}`, who, jour);
    if (estGarde(v)) throw new Error(`${who} est deja de garde (${v}) le ${jour} — ${motif}`);
  }

  function refuseSiAdjacente(who, jour) {
    [prevDay(jour), nextDay(jour)].forEach(d => {
      const v = readCell(`GARDES_${year}`, who, d);
      if (estGarde(v)) throw new Error(`${who} est de garde (${v}) le ${d} — deux gardes consecutives sont impossibles`);
    });
  }

  /* (12/08/2026 — phase 2 échanges) Un don ne regardait que la grille des
     gardes : donner une garde à un MAR en congé passait sans un mot, et son
     absence restait posée sur le même jour que sa nouvelle garde. C'était
     l'œil du comité qui l'attrapait — indispensable avant d'ouvrir les dons
     aux MAR eux-mêmes (phase 4), où plus personne ne relira.
     La source de vérité des absences est INDISPOS_{annee} (même lecture que
     l'échange de secteurs). Un SOUHAIT n'est PAS une absence : recevoir une
     garde un jour qu'on a souhaité est exactement le but. */
  const ABSENCES = ['INDISPO', 'VAC', 'FORM', 'TP', 'CL', 'CTP', 'CP', 'A'];
  function refuseSiIndisponible(who, jour, motif) {
    const v = readCell(`INDISPOS_${year}`, who, jour).toUpperCase();
    if (ABSENCES.indexOf(v) > -1) {
      throw new Error(`${who} est indisponible (${v}) le ${jour} — ${motif}`);
    }
  }

  // Pre-vol : la case existe-t-elle ? Meme controle que writeCell, mais AVANT
  // d'ecrire quoi que ce soit, pour ne jamais laisser une modification a moitie faite.
  function verifieCellules(paires) {
    const sheetName = `GARDES_${year}`;
    const sheet = getSheet(sheetName);
    paires.forEach(([who, jour]) => {
      if (!who || !jour) return;
      if (getDateIndex(sheet, jour) < 0) throw new Error(`Date ${jour} introuvable dans ${sheetName}`);
      if (getDoctorRow(sheet, who)  < 0) throw new Error(`${who} est absent de ${sheetName} — modification impossible`);
    });
  }

  const { type, date, doctorId, doctorId2, value, date2 } = mod;

  // (02/08/2026 - correctif) Le journal etait ecrit APRES le switch : un geste refuse
  // levait une exception et ne laissait donc aucune trace — exactement le cas qu'on
  // veut tracer. On capture, on journalise succes ET refus, puis on relance l'erreur.
  let _echec = null;
  try {

  switch (type) {
    case 'echangeSecteur': {
      /* (2026-08-05.12) Mêmes précautions : les deux cellules sont vérifiées
         avant la première écriture (readCell/writeCell lèvent si le MAR ou la
         date est introuvable — un doctorId2 mal saisi ne doit pas laisser la
         première cellule modifiée). */
      verifieCellules([[doctorId, date], [doctorId2, date]]);
      const valA = readCell(`INDISPOS_${year}`, doctorId,  date);
      const valB = readCell(`INDISPOS_${year}`, doctorId2, date);
      writeCell(`INDISPOS_${year}`, doctorId,  date, valB);
      writeCell(`INDISPOS_${year}`, doctorId2, date, valA);
      break;
    }
    case 'transfertR': {
      /* (13/08/2026 — échanges, phase 3) La récupération d'un samedi transféré
         suit son samedi : le R du donneur (doctorId@date) passe au receveur
         (doctorId2@date), MÊME date — neutre pour l'effectif présent ce
         jour-là, donc aucun critère de pose à rejouer. Jamais de création
         d'un R neuf : les contraintes de pose vivent dans le générateur. */
      verifieCellules([[doctorId, date], [doctorId2, date]]);
      const valR = readCell(`GARDES_${year}`, doctorId, date);
      if (String(valR).toUpperCase() !== 'R') throw new Error(`${doctorId} n'a pas de R le ${date} — rien à transférer`);
      if (readCell(`GARDES_${year}`, doctorId2, date) !== '') throw new Error(`${doctorId2} n'est pas libre le ${date} — R à replacer manuellement`);
      refuseSiIndisponible(doctorId2, date, 'R à replacer manuellement');
      writeCell(`GARDES_${year}`, doctorId, date, '');
      writeCell(`GARDES_${year}`, doctorId2, date, 'R');
      break;
    }
    case 'gardeExceptionnelle': {
      const lendemain = nextDay(date);
      verifieCellules([[doctorId, date], [doctorId, lendemain]]);
      refuseSiGarde(doctorId, date, 'garde exceptionnelle impossible');
      refuseSiAdjacente(doctorId, date);
      writeCell(`GARDES_${year}`, doctorId, date, value || 'G');
      writeCell(`GARDES_${year}`, doctorId, lendemain, 'RG');
      break;
    }
    case 'echangeGarde': {
      /* (2026-08-05.12, CORRECTIF) TOUT VÉRIFIER AVANT D'ÉCRIRE. L'échange de
         la date principale était écrit AVANT le contrôle du repos de garde du
         lendemain : un refus laissait donc le classeur À MOITIÉ modifié — la
         garde avait changé de titulaire, le comité lisait « échange refusé »,
         et personne ne voyait la divergence (défaut trouvé au banc d'essai,
         scénario 39). Un geste doit être entièrement fait, ou entièrement
         refusé. */
      const jourRG = date2 || nextDay(date);
      verifieCellules([[doctorId, date], [doctorId2, date], [doctorId, jourRG], [doctorId2, jourRG]]);
      refuseSiGarde(doctorId,  jourRG, 'l\'echange deplacerait cette garde — a traiter manuellement');
      refuseSiGarde(doctorId2, jourRG, 'l\'echange deplacerait cette garde — a traiter manuellement');
      // Toutes les lectures AVANT la première écriture : aucune ne peut plus échouer ensuite.
      const valGardeA = readCell(`GARDES_${year}`, doctorId,  date);
      const valGardeB = readCell(`GARDES_${year}`, doctorId2, date);
      const valRGA    = readCell(`GARDES_${year}`, doctorId,  jourRG);
      const valRGB    = readCell(`GARDES_${year}`, doctorId2, jourRG);
      writeCell(`GARDES_${year}`, doctorId,  date,   valGardeB);
      writeCell(`GARDES_${year}`, doctorId2, date,   valGardeA);
      writeCell(`GARDES_${year}`, doctorId,  jourRG, valRGB);
      writeCell(`GARDES_${year}`, doctorId2, jourRG, valRGA);
      break;
    }
    case 'donGarde': {
      const valGarde = readCell(`GARDES_${year}`, doctorId, date);
      const jourRG = date2 || nextDay(date);
      verifieCellules([[doctorId, date], [doctorId2, date], [doctorId, jourRG], [doctorId2, jourRG]]);
      if (!estGarde(valGarde)) throw new Error(`${doctorId} n'a pas de garde le ${date} — rien a donner`);
      refuseSiGarde(doctorId2, date,   'don impossible');
      refuseSiGarde(doctorId2, jourRG, 'le repos de garde ecraserait cette garde — don impossible');
      refuseSiAdjacente(doctorId2, date);
      // (12/08/2026 — phase 2) Le receveur doit être disponible le jour de la
      // garde ET le lendemain (son repos de garde) : tout vérifié avant d'écrire.
      refuseSiIndisponible(doctorId2, date,   'don impossible');
      refuseSiIndisponible(doctorId2, jourRG, 'son repos de garde tomberait sur cette absence — don impossible');
      writeCell(`GARDES_${year}`, doctorId,  date,   '');
      writeCell(`GARDES_${year}`, doctorId2, date,   valGarde);
      writeCell(`GARDES_${year}`, doctorId,  jourRG, '');
      writeCell(`GARDES_${year}`, doctorId2, jourRG, 'RG');
      break;
    }
    case 'echangeGardeJours': {
      // Échange de DEUX gardes sur deux dates : doctorId@date <-> doctorId2@date2 (le rôle reste attaché à sa date).
      if (date === date2) throw new Error('Les deux dates doivent être différentes');
      const codeA = readCell(`GARDES_${year}`, doctorId,  date);
      const codeB = readCell(`GARDES_${year}`, doctorId2, date2);
      if (!/^G2?$/.test(String(codeA).toUpperCase())) throw new Error(`Pas de garde G/G2 pour ${doctorId} le ${date}`);
      if (!/^G2?$/.test(String(codeB).toUpperCase())) throw new Error(`Pas de garde G/G2 pour ${doctorId2} le ${date2}`);
      /* (12/08/2026 — demande Arthur) L'échange de deux gardes ADJACENTES
         (lundi/mardi) était refusé « à échanger manuellement ». La raison
         historique : les contrôles regardaient l'état de DÉPART, où le repos
         de l'un tombe sur la garde de l'autre — alors que l'état d'ARRIVÉE
         est parfaitement sain. On traite donc ce cas à part : préconditions
         strictes sur l'état de départ (celui que pose le générateur), puis
         écriture de l'état final calculé, cellule par cellule.
         A garde J, B garde J+1. Après échange : B garde J (repos J+1),
         A garde J+1 (repos J+2). Chaque date conserve son rôle G/G2. */
      const adjacent = (date2 === nextDay(date)) || (date === nextDay(date2));
      if (adjacent) {
        // Normalisation : dA = le premier jour, son titulaire tA ; dB = le lendemain, titulaire tB.
        const ordreDirect = (date2 === nextDay(date));
        const dA = ordreDirect ? date : date2;
        const dB = ordreDirect ? date2 : date;
        const tA = ordreDirect ? doctorId : doctorId2;
        const tB = ordreDirect ? doctorId2 : doctorId;
        const dC = nextDay(dB); // le surlendemain : repos final de tA
        const codeJ1 = readCell(`GARDES_${year}`, tA, dA); // rôle du 1er jour
        const codeJ2 = readCell(`GARDES_${year}`, tB, dB); // rôle du 2e jour
        verifieCellules([[tA, dA], [tB, dA], [tA, dB], [tB, dB], [tA, dC], [tB, dC]]);
        // Préconditions : l'état exact que pose le générateur, sinon on ne devine pas.
        if (String(readCell(`GARDES_${year}`, tA, dB)).toUpperCase() !== 'RG')
          throw new Error(`${tA} n'a pas son repos de garde le ${dB} — échange à traiter manuellement`);
        if (String(readCell(`GARDES_${year}`, tB, dC)).toUpperCase() !== 'RG')
          throw new Error(`${tB} n'a pas son repos de garde le ${dC} — échange à traiter manuellement`);
        if (readCell(`GARDES_${year}`, tB, dA) !== '')
          throw new Error(`${tB} n'est pas libre le ${dA} — échange à traiter manuellement`);
        if (readCell(`GARDES_${year}`, tA, dC) !== '')
          throw new Error(`${tA} n'est pas libre le ${dC} — échange à traiter manuellement`);
        // Vraies adjacences à l'ARRIVÉE : tB garderait dA avec une garde la veille,
        // tA garderait dB avec une garde le surlendemain.
        const veille = prevDay(dA);
        if (estGarde(readCell(`GARDES_${year}`, tB, veille)))
          throw new Error(`${tB} est de garde le ${veille} — deux gardes consecutives sont impossibles`);
        if (estGarde(readCell(`GARDES_${year}`, tA, nextDay(dC))))
          throw new Error(`${tA} est de garde le ${nextDay(dC)} — deux gardes consecutives sont impossibles`);
        // Disponibilité des jours nouvellement reçus (même règle que le don) :
        // tB reçoit la garde du ${dA}, tA reçoit celle du ${dB} et son repos glisse au ${dC}.
        refuseSiIndisponible(tB, dA, 'echange impossible');
        refuseSiIndisponible(tA, dC, 'son repos de garde tomberait sur cette absence — echange impossible');
        // Écriture de l'état final. Tout est vérifié : plus rien ne peut échouer.
        writeCell(`GARDES_${year}`, tA, dA, '');       // tA quitte le 1er jour
        writeCell(`GARDES_${year}`, tB, dA, codeJ1);   // tB le prend (rôle conservé)
        writeCell(`GARDES_${year}`, tA, dB, codeJ2);   // tA prend le 2e jour (écrase son propre RG)
        writeCell(`GARDES_${year}`, tB, dB, 'RG');     // repos de tB après sa nouvelle garde
        writeCell(`GARDES_${year}`, tA, dC, 'RG');     // repos de tA après la sienne
        writeCell(`GARDES_${year}`, tB, dC, '');       // l'ancien repos de tB s'efface
        break;
      }
      const rg1 = nextDay(date), rg2 = nextDay(date2);
      // refus si un MAR a déjà quelque chose à la date d'arrivée (évite d'écraser une garde existante)
      if (readCell(`GARDES_${year}`, doctorId, date2) || readCell(`GARDES_${year}`, doctorId2, date))
        throw new Error('Un des médecins a déjà une garde à l\'autre date — échange à traiter manuellement');
      // échange des gardes (chaque date conserve son rôle G/G2)
      writeCell(`GARDES_${year}`, doctorId,  date,  '');
      writeCell(`GARDES_${year}`, doctorId2, date,  codeA);
      writeCell(`GARDES_${year}`, doctorId2, date2, '');
      writeCell(`GARDES_${year}`, doctorId,  date2, codeB);
      // les repos de garde (RG) du lendemain suivent la personne
      writeCell(`GARDES_${year}`, doctorId,  rg1, '');
      writeCell(`GARDES_${year}`, doctorId2, rg1, 'RG');
      writeCell(`GARDES_${year}`, doctorId2, rg2, '');
      writeCell(`GARDES_${year}`, doctorId,  rg2, 'RG');
      break;
    }
    // (C3b) 'indispo'/'secteur'/'libre' retirés — écrivaient dans OVERRIDES (jamais lu).
    // Le placement secteur réel passe par savePlanningOverride → PLANNING_OVERRIDES.
    default:
      throw new Error(`Type de modification inconnu : ${type}`);
  }

  } catch (e) { _echec = e; }

  // (02/08/2026) Ces gestes ne laissaient aucune trace : LOGS ne disait rien d'un
  // don, d'un echange ou d'une garde exceptionnelle. Diagnostic aveugle garanti.
  logAction(`applyModification ${type} — ${date || ''}${date2 ? ' / ' + date2 : ''}`
    + `${doctorId ? ' | ' + doctorId : ''}${doctorId2 ? ' -> ' + doctorId2 : ''}`
    + `${mod.dryRun ? ' [contrôle seul]' : ''}`
    + `${_echec ? ' — REFUSE : ' + _echec.message : ' — OK'}`);
  if (_echec) throw _echec;

  // (13/08/2026) dryRun : rien n'a été écrit — pas de republication, pas de notifieur.
  if (mod.dryRun) return true;

  generatePlanning();
  // (01/08/2026) Un don, un echange de gardes ou de secteurs modifie le statut ou le
  // secteur des MAR concernes. On arme le notifieur comme le fait publishPlanning :
  // le filtre existant fait le tri (un statut part toujours, un secteur seulement
  // dans la fenetre de l'Excel). Isole : un echec du notifieur ne doit jamais faire
  // echouer la modification, qui est deja ecrite dans le classeur a ce stade.
  try { notifPlanifier(); }
  catch (e) { logAction('notifPlanifier apres modification : ' + e.message); }
  return true;
}
// ── STATUT CYCLE PLANNING ────────────────────────────────────────────
function getPlanningStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = TEST_YEAR;
  const nextYear = year + 1;
  const indNextSheet = ss.getSheetByName('INDISPOS_' + nextYear);
  const indisposN1Exists = !!indNextSheet;
  let indisposN1Complete = false, marsManquants = 0;
  if (indNextSheet) {
    const medSheet = ss.getSheetByName('MEDECINS');
    const medData = medSheet ? medSheet.getDataRange().getValues() : [];
    const actifs = [];
    for (let r = 1; r < medData.length; r++) {
      if (String(medData[r][3]).trim().toUpperCase() === 'O') actifs.push(String(medData[r][0]).trim());
    }
    const indData = indNextSheet.getDataRange().getValues();
    const indById = {};
    for (let r = 3; r < indData.length; r++) {
      const id = String(indData[r][0]).trim();
      if (!id) continue;
      indById[id] = indData[r].slice(1).some(v => String(v).trim() !== '');
    }
    marsManquants = actifs.filter(id => !indById[id]).length;
    indisposN1Complete = marsManquants === 0;
  }
  const gardesNextSheet = ss.getSheetByName('GARDES_' + nextYear);
  const gardesN1Generated = !!(gardesNextSheet && gardesNextSheet.getLastRow() > 3);
  // Vérifier la présence de stats_N.json sur GitHub Pages
let gardesNClosed = false;
try {
  const checkUrl = 'https://planningmedic.github.io/stats_' + year + '.json';
  const resp = UrlFetchApp.fetch(checkUrl, {muteHttpExceptions: true});
  gardesNClosed = resp.getResponseCode() === 200;
} catch(e) {
  gardesNClosed = false;
}
  return { indisposN1Exists, indisposN1Complete, marsManquants, gardesN1Generated, gardesNClosed, year, nextYear };
}
// ── API WEB APP — doGet ───────────────────────────────────────────────
// ── Builders partagés (handlers unitaires + getAdminBootstrap) ──
function _buildMedecins_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('MEDECINS');
  if (!sheet) return { error: 'Onglet MEDECINS introuvable' };
  const data = sheet.getDataRange().getValues();
  const isO = v => String(v).trim().toUpperCase() === 'O';
  const toDate = v => {
    if (!v) return '';
    if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return String(v).trim();
  };
  const medecins = [];
  for (let r = 1; r < data.length; r++) {
    if (!data[r][0]) continue;
    medecins.push({id:String(data[r][0]).trim(), nom:String(data[r][1]).trim(),
      initiales:String(data[r][2]).trim(), actif:isO(data[r][3]),
      quotite:Number(data[r][4])||100, pctGardes:Number(data[r][5])||100,
      hasCode:!!String(data[r][6]).trim(), email:String(data[r][7]).trim(), dect:String(data[r][8]).trim(),
      dateDebut:toDate(data[r][9]), dateFin:toDate(data[r][10]),
      noGarde:isO(data[r][11]), only18:isO(data[r][12]), noWeekend:isO(data[r][13]),
      rythme2sur2:isO(data[r][14]), souhaitPlafond:isO(data[r][15]),
      tpJoursFixes:String(data[r][16]||'').trim().toUpperCase()});
  }
  return { medecins };
}

function _buildOverrides_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('OVERRIDES');
  if (!sheet) return { success:true, overrides:[], total:0, passed:0, upcoming:0 };
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0,0,0,0);
  const overrides = [];
  for (let r = 1; r < data.length; r++) {
    const raw = data[r][0];
    if (!raw) continue;
    let dateStr = raw instanceof Date
      ? `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'00')}-${String(raw.getDate()).padStart(2,'00')}`
      : String(raw).trim();
    if (!dateStr) continue;
    const isFuture = new Date(dateStr + 'T00:00:00') >= today;
    overrides.push({rowIndex:r+1, date:dateStr,
      doctorId:String(data[r][1]||'').trim().toUpperCase(),
      morning:String(data[r][2]||'').trim().toUpperCase(),
      afternoon:String(data[r][3]||'').trim().toUpperCase(),
      comment:String(data[r][4]||'').trim(), isFuture});
  }
  return { success:true, overrides,
    total:overrides.length,
    passed:overrides.filter(o=>!o.isFuture).length,
    upcoming:overrides.filter(o=>o.isFuture).length };
}

// ── (RH-C) ACTIONS D'ÉCRITURE SÉRIALISÉES PAR VERROU ─────────────────
// Toute action de cette liste prend le verrou de script avant de s'exécuter :
// les écritures se font une par une, jamais entremêlées. Élimine les courses
// « lire-modifier-écrire » (écrasement de ligne d'indispos, don de garde
// dupliqué, suppression de la mauvaise ligne après décalage).
// EXCLUS volontairement :
//  - savePlanningOverride : verrou dédié déjà en place (même verrou de script
//    → exclusion mutuelle assurée avec deleteOverride et les autres écritures) ;
//  - savePlanningOverridesBatch : même verrou dédié (code.gs), mêmes garanties ;
//  - markVeille : écriture d'une cellule ciblée, lignes jamais supprimées ;
// INCLUS (routées par portail.gs mais écrivantes — le verrou est vérifié AVANT
// la délégation, par nom d'action) :
//  - declareLiberal : lire-modifier-écrire avec fusion sur LIBERAL_{Y} ;
//  - deleteLiberal  : supprime une ligne (décalage → ciblage par ID, pas par n° de ligne).
//  - genererCRH : aucune écriture de données ;
//  - sendCodes* / envoyerRecapIndispos : emails (lents, pas d'écriture à risque).
// NB : pas de releaseLock explicite — Google libère le verrou automatiquement
// à la fin de chaque exécution.
// (18/08/2026) _rangRole_ supprimé : le rang de tri vit dans le module partagé
// dispo_jour (partage/dispo_jour.js) — la copie locale n'avait plus d'appelant.

const WRITE_ACTIONS_LOCK = new Set([
  'addMedecinToGroupe', 'annulerAbsenceLongue', 'applyModification',
  'archiveYear', 'clearIndisposYear', 'creerEchange', 'deleteOverride',
  'generateGardes', 'initYear', 'poserAbsenceLongue', 'publishPlanning',
  'repondreEchange',
  'saveAffectations', 'saveAffectationsMar', 'saveConfig', 'saveGroupes',
  'resetCodeMar',
  'saveIndispos', 'saveIndisposBatch', 'saveMedecin', 'savePeriodes', 'setActiveYear',
  'setDailyStatus', 'setIndisposYear',
  'declareLiberal', 'deleteLiberal',
]);

// (Lot 5-bis) PERIMETRE DU ROLE SECRETARIAT — liste blanche, REFUS PAR DEFAUT.
// Le code du secretariat est PARTAGE : son perimetre se definit ici, en un seul
// endroit, et JAMAIS par des gardes ajoutees action par action (audit du 24/07 :
// 10 actions d'Indispos.gs sont ouvertes a tout code valide, dont saveIndispos
// qui ECRIT, et getStatsLive qui renvoie des stats nominatives).
// ⚠️ NE JAMAIS y ajouter getPlanningJson ni getAffectationsJson : planning_{Y}.json
// contient le CODE D'ABSENCE BRUT de chaque MAR pour toute l'annee (code.gs : la
// valeur de GARDES_{Y} est recopiee dans `status`). Les y autoriser contournerait
// la regle « dates seules » de l'ecran Consultations a venir.
const SECRETARIAT_ACTIONS = new Set([
  'login',
  'getConsultAbsences',
]);

/* (19/08/2026) Écrit la grille complète des affectations dans l'onglet.
   Extrait du routeur pour être éprouvable au banc. Défaut corrigé : un MAR
   sans ligne existante (fiche créée après l'onglet — PRUNET 2026, ARMAND)
   était ignoré EN SILENCE, et le journal comptait les données reçues, pas
   les lignes écrites (« 25 mis à jour » pour 24 écrites, constaté le 19/08
   au matin). La ligne manquante est désormais créée en bas de l'onglet,
   exactement comme le fait saveAffectationsMar trois écrans plus bas. */
function ecrireAffectations(sheet, aff) {
  const data = sheet.getDataRange().getValues();
  const idToRow = {};
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (id) idToRow[id] = r + 1;
  }
  let maj = 0, crees = 0;
  Object.keys(aff).forEach(doctorId => {
    const vals = [];
    for (let m = 1; m <= 12; m++) vals.push(aff[doctorId][m] || 'VOLANT');
    const rowNum = idToRow[doctorId];
    if (rowNum) { sheet.getRange(rowNum, 2, 1, 12).setValues([vals]); maj++; }
    else { sheet.appendRow([doctorId].concat(vals)); crees++; }
  });
  return { maj: maj, crees: crees };
}

function _routeRequete_(e) {
  try {
    const payload = JSON.parse(e.parameter.payload || '{}');
    const action = payload.action;
    const code = payload.code;

    if (action === 'getActiveYear') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true, year: TEST_YEAR
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (03/08/2026) Quelles annees sont consultables ?
       admin.html testait l'existence de « ./archives/stats_{annee}.json » sur le site —
       fichier qui n'a JAMAIS ete cree : depuis le passage au Drive prive, l'archivage
       ecrit « archives_stats_{annee}.json » sur Drive. Le selecteur ne pouvait donc
       jamais proposer une annee cloturee. index.html, lui, sondait les annees une par
       une (un appel par annee, or Apps Script serialise les executions d'un meme
       utilisateur : 1 sonde en 2026, 5 en 2030, 10 en 2035).
       Un seul appel repond desormais pour les deux pages. Pas de controle de role :
       c'est une liste d'annees, et index.html est la page des MAR. */
    if (action === 'getAnneesDisponibles') {
      const vues = {};
      const scan = (classeur, archivee) => {
        try {
          classeur.getSheets().forEach(sh => {
            const m = sh.getName().match(/^GARDES_(\d{4})$/);
            if (!m) return;
            const y = Number(m[1]);
            if (vues[y] === undefined) vues[y] = archivee;
          });
        } catch (e) { /* classeur inaccessible : on garde ce qu'on a */ }
      };
      scan(SpreadsheetApp.getActiveSpreadsheet(), false);
      try { scan(SpreadsheetApp.openById(ARCHIVE_SS_ID), true); } catch (e) {}
      const annees = Object.keys(vues).map(Number).sort()
        .map(y => ({ annee: y, archivee: vues[y] }));
      return ContentService.createTextOutput(JSON.stringify({
        success: true, active: TEST_YEAR, annees
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const user = checkCode(code);
    if (!user) {
      /* (01/08/2026) DEUX CAUSES, DEUX MESSAGES.
         Mesure du 01/08 a 13:50 : le premier getAdminBootstrap d'une ouverture est
         revenu « Code invalide » apres 44 s d'attente pour 14 ms de travail serveur.
         Or 14 ms ne correspond qu'a UN chemin dans checkCode : le retour immediat
         sur code vide, avant toute lecture d'onglet (un code faux, lui, coute une
         lecture de MEDECINS). Impossible de trancher : les deux causes rendaient le
         meme message. On les distingue desormais.
         Sans risque : aucun code valide n'est revele, et le message ne dit que si le
         champ etait vide — information que l'appelant possede deja. */
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: String(code == null ? '' : code).trim()
               ? 'Code invalide'
               : 'Code absent de la requête'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    // (Lot 5-bis) REFUS PAR DEFAUT du role secretariat. Place ICI, juste apres
    // checkCode et AVANT le verrou d'ecriture et tout traitement d'action : rien
    // ne peut etre atteint qui ne figure pas dans SECRETARIAT_ACTIONS.
    if (user.role === 'secretariat' && !SECRETARIAT_ACTIONS.has(action)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, error: 'Action non autorisée pour ce code'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    // (RH-C) Verrou d'écriture global : sérialise les actions qui modifient
    // les données. Les lectures ne prennent jamais le verrou (dashboard fluide).
    /* (01/08/2026) TOUTE ECRITURE VIDE LE CACHE DE CONFIGURATION.
       Place ICI et non action par action : WRITE_ACTIONS_LOCK est la liste de
       reference des ecritures, et l'accrocher a cette liste garantit qu'aucune
       action nouvelle ne sera oubliee. L'invalidation est parfois inutile (une
       ecriture de planning ne touche pas SECTEURS) : cela coute une relecture
       d'onglet, jamais une donnee perimee. Le sens de l'erreur est le bon. */
    if (WRITE_ACTIONS_LOCK.has(action)) {
      /* (31/08/2026) COMPTEUR D'USAGE. Placé ICI pour la même raison que
         l'invalidation du cache juste dessous : WRITE_ACTIONS_LOCK est la liste
         de référence des écritures, s'y accrocher garantit qu'aucune action
         nouvelle ne sera oubliée. On compte la TENTATIVE, pas la réussite : le
         point de sortie est unique ici, il ne l'est plus après. Les lectures ne
         sont JAMAIS comptées — une écriture par ouverture d'écran ralentirait
         tout le portail. */
      try { _statsActionIncr_(SpreadsheetApp.getActiveSpreadsheet(), user.role, action); } catch (e) {}
      try { viderCacheConfig(); } catch (e) {}
      const _wl = LockService.getScriptLock();
      if (!_wl.tryLock(20000)) {
        return ContentService.createTextOutput(JSON.stringify({ success: false,
          error: 'Une autre opération d\'écriture est en cours — réessayez dans quelques secondes.' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    // (B1 sécurité) getStatus / getStatsLive : désormais code-gated (données nominatives)
    // Purge manuelle du cache de configuration (bouton de l'onglet Maintenance).
    // Utile apres une modification faite A LA MAIN dans le classeur, ou pour
    // rendre immediate la revocation d'un code d'acces.
    if (action === 'viderCacheConfig') {
      if (user.role !== 'admin') return _deny();
      viderCacheConfig();
      return ContentService.createTextOutput(JSON.stringify({
        success: true, message: 'Cache de configuration vidé — la prochaine lecture ira au classeur.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getStatus') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true, status: getPlanningStatus()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getStatsLive') {
      const statsYear = Number(payload.year) || TEST_YEAR;
      try {
        return ContentService.createTextOutput(JSON.stringify({success:true, stats:computeStatsLive(statsYear)}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error(err.message); }
    }
    if (action === 'login') {
      logConnexion(user);
      return ContentService.createTextOutput(JSON.stringify({
        success: true, role: user.role, id: user.id,
        // Membre du groupement liberal (colonne LIBERAL de MEDECINS) : pilote
        // l'affichage de la tuile Module liberal du dashboard.
        liberal: !!user.liberal,
        // N° RPPS du MAR connecte (colonne RPPS de MEDECINS) : pre-remplit l'identite
        // du praticien sur les devis du module liberal. Chaine vide si non renseigne.
        rpps: user.rpps || '',
        // Prenom (colonne PRENOM de MEDECINS) : complete le nom sur les devis du
        // module liberal. Chaine vide si la colonne est absente ou non renseignee.
        prenom: user.prenom || '',
        // (08/09/2026) Tuiles reservees (CONFIG / TUILES_PRIVEES) : meme contenu
        // que le champ `tuiles` de l'identite servie par la copie rapide.
        tuiles: user.tuiles || [],
        name: user.name, initials: user.initials, 
        year: TEST_YEAR, indisposYear: getIndisposYear(),
        // Campagne de saisie en cours ? Pilote l'affichage de la tuile
        // « Mes indisponibilités » du dashboard (masquée hors campagne).
        indisposOuverte: _indisposOuverte_(),
        // (26/08/2026) Campagne figée : la tuile passe en « consultation seule »
        // dès le portail — même information que le verrou de l'écran indispos.
        indisposFigees: _indisposFigees_(),
        // (POSE TP · 22/08/2026) Phase de pose des temps partiels (déduite) +
        // profil du MAR : la tuile « Mes jours de temps partiel » ne s'affiche
        // que si phaseTp.actif ET quotite < 100 ET !tpFixe. Aucun nom en dur :
        // jours fixes (BONNET) et rythme 2/2 s'excluent par leurs colonnes MEDECINS.
        phaseTp: _phaseTp_(),
        quotite: user.quotite || 100,
        tpFixe: _tpFixeDe_(user.id),
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (01/09/2026) LE RELIQUAT DE CONGÉS, MAR par MAR.
       Après la génération, le comité place ce qui n'a pas été posé pendant la
       campagne : encore faut-il savoir ce qu'il reste. Le chiffre existait au
       staff, mais seulement pour les vacances, et seulement avant la
       génération. Ici : vacances, formations et temps partiels, à jour.
       ⚠️ La SOURCE change avec l'état de l'année. Tant que le planning n'est
       pas généré, tout vit dans INDISPOS_{Y}. Une fois généré, l'onglet
       Statuts écrit dans GARDES_{Y} et JAMAIS dans INDISPOS : compter dans
       INDISPOS raterait tout ce que le comité a posé depuis. GARDES fait donc
       foi dès qu'il existe. */
    if (action === 'getReliquats') {
      if (user.role !== 'admin') return _deny();
      const anR = Number(payload.year) || getActiveYear();
      return ContentService.createTextOutput(JSON.stringify(computeReliquats(anR)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getNoelAnEligibles') {
      const yr = parseInt(payload.year) || getIndisposYear();
      const _rep = { success: true, year: yr,
                     eligibles: computeNoelAnEligibles(yr, payload.tous === true) };
      /* (01/09/2026) `historique` : l'ÉQUIPE ENTIÈRE avec toutes ses années de
         Noël, pour le tableau du staff. Champ à part, volontairement : le
         contrôle du W2 (admin.html) travaille sur `eligibles`, c'est-à-dire les
         seuls PRIORITAIRES. Élargir cette liste-là ferait signaler comme
         bloquants des MAR que le comité n'a aucune raison de retenir. */
      if (payload.historique === true) _rep.historique = computeNoelAnHistorique(yr);
      return ContentService.createTextOutput(JSON.stringify(_rep))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getIndispos') {
      const targetId = user.role === 'admin' ? payload.doctorId : user.id;
      return ContentService.createTextOutput(JSON.stringify({
        success: true, indispos: getIndisposForDoctor(targetId, getIndisposYear())
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (LOT 4 · 22/08/2026) LES DÉCISIONS DU COMITÉ sur les jours sous réserve.
       Quatre gestes, tous annulables depuis l'écran, tous journalisés :
       · valider            : la TPA du MAR devient TP (souveraineté comité,
                              passe par _poserTp_ — quota et journal compris)
       · annuler_validation : le TP redevient TPA (même chemin)
       · refuser            : le JOUR se ferme pour TOUTE l'équipe (TP_FERMES),
                              et chaque TPA posée ce jour-là est rendue — elles
                              ne pourraient jamais être validées. La réponse
                              liste qui a été rendu, pour l'annulation.
       · annuler_refus      : le jour rouvre, les TPA rendues sont rétablies.
       AUCUNE notification : le comité le dit de vive voix (maquette). */
    /* (23/08/2026) DÉCISIONS EN LOT — le comité peut marquer toute sa liste
       puis enregistrer d'un coup. Chaque décision est traitée exactement comme
       une décision isolée (mêmes contrôles, mêmes notifications) ; seule la
       republication est mutualisée, puisqu'elle est de toute façon différée et
       dédoublonnée. Un échec sur une ligne n'arrête pas les autres : la réponse
       dit ce qui est passé et ce qui ne l'est pas. */
    if (action === 'deciderJourTpLot') {
      if (user.role !== 'admin') {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Réservé au comité' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const liste = payload.decisions || [];
      const detail = [];
      let faits = 0, rates = 0;
      liste.forEach(function (d) {
        try {
          const r = _routeRequete_({ parameter: { payload: JSON.stringify({
            action: 'deciderJourTp', code: payload.code, year: payload.year,
            decision: d.decision, doctorId: d.doctorId, date: d.date, retablir: d.retablir || {},
          }) } });
          const rep = JSON.parse(r.getContent());
          if (rep && rep.success) faits++; else rates++;
          detail.push({ date: d.date, doctorId: d.doctorId, decision: d.decision,
                        success: !!(rep && rep.success), error: rep && rep.error,
                        rendues: rep && rep.rendues });
        } catch (eL) {
          rates++;
          detail.push({ date: d.date, doctorId: d.doctorId, decision: d.decision,
                        success: false, error: eL.message });
        }
      });
      logAction('deciderJourTpLot par ' + user.id + ' — ' + faits + ' décision(s) appliquée(s), ' + rates + ' échec(s)');
      return ContentService.createTextOutput(JSON.stringify({ success: true, faits: faits, rates: rates, detail: detail }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'deciderJourTp') {
      /* (23/08/2026 — refonte) LE COMITÉ ÉCRIT DANS LE PLANNING.
         Valider, c'est écrire TP dans GARDES_{Y} et republier : sans ça, le
         jour resterait un enregistrement sans effet. Refuser, c'est fermer le
         jour pour toute l'équipe — rien n'ayant jamais touché le planning,
         il n'y a rien à défaire. Tout est annulable, tout est journalisé. */
      if (user.role !== 'admin') {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Réservé au comité' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const phD = _phaseTp_();
      if (!phD.actif) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Aucune phase de pose active' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ds = String(payload.date || '').trim();
      const anneeD = Number(ds.slice(0, 4));
      if (phD.annees.indexOf(anneeD) === -1) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'L\'année ' + anneeD + ' n\'est pas ouverte à la pose' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const decision = String(payload.decision || '').trim();
      let out = { success: false, error: 'décision inconnue : ' + decision };

      if (decision === 'valider') {
        const cibleId = String(payload.doctorId || '').trim();
        const attend = _tpDemandes_(anneeD, cibleId).some(function (x) { return x.date === ds; });
        if (!attend) {
          out = { success: false, error: 'Cette demande n\'est plus en attente' };
        } else if (!_tpGrilleEcrire_(anneeD, cibleId, ds, 'TP')) {
          out = { success: false, error: 'La case du planning n\'est plus libre ce jour-là' };
        } else {
          _tpDemandeRetirer_(anneeD, ds, cibleId);
          _tpRepublier_(anneeD);
          logAction('deciderJourTp VALIDE ' + ds + ' (' + anneeD + ') ' + cibleId + ' par ' + user.id + ' — planning republié');
          _tpNotifier_('Temps partiel validé',
            'Votre jour du ' + _tpJourLisible_(ds) + ' est validé par le comité.', cibleId);
          out = { success: true, date: ds, doctorId: cibleId };
        }
      }

      if (decision === 'annuler_validation') {
        const cibleId = String(payload.doctorId || '').trim();
        if (!_tpGrilleEcrire_(anneeD, cibleId, ds, '')) {
          out = { success: false, error: 'Ce jour n\'est plus un temps partiel accordé' };
        } else {
          _tpDemandeAjouter_(anneeD, ds, cibleId);      // il repasse en attente
          _tpRepublier_(anneeD);
          logAction('deciderJourTp ANNULE-VALIDATION ' + ds + ' (' + anneeD + ') ' + cibleId + ' par ' + user.id);
          _tpNotifier_('Temps partiel remis en attente',
            'Votre jour du ' + _tpJourLisible_(ds) + ' repasse en attente de validation.', cibleId);
          out = { success: true, date: ds, doctorId: cibleId };
        }
      }

      if (decision === 'refuser') {
        _tpFermerJour_(anneeD, ds, user.id);
        const rendues = {};
        _tpDemandes_(anneeD).forEach(function (x) {
          if (x.date !== ds) return;
          rendues[x.mar] = 'TPA';
          _tpDemandeRetirer_(anneeD, ds, x.mar);
        });
        logAction('deciderJourTp REFUS ' + ds + ' (' + anneeD + ') par ' + user.id +
                  ' — ' + Object.keys(rendues).length + ' demande(s) rendue(s) : ' + Object.keys(rendues).join(', '));
        /* Le jour se ferme pour toute l'équipe, mais SEULS ceux qui l'avaient
           demandé sont prévenus — les autres le verront simplement noir. */
        Object.keys(rendues).forEach(function (idR) {
          _tpNotifier_('Temps partiel refusé',
            'Votre jour du ' + _tpJourLisible_(ds) + ' n\'a pas pu être accordé : l\'équipe serait trop réduite.', idR);
        });
        out = { success: true, date: ds, fermes: Array.from(_tpFermes_(anneeD)).sort(), rendues: rendues };
      }

      if (decision === 'annuler_refus') {
        _tpRouvrirJour_(anneeD, ds);
        const retablies = [];
        Object.keys(payload.retablir || {}).forEach(function (idR) {
          _tpDemandeAjouter_(anneeD, ds, idR);
          retablies.push(idR);
        });
        logAction('deciderJourTp ANNULE-REFUS ' + ds + ' (' + anneeD + ') par ' + user.id +
                  ' — rétabli : ' + (retablies.join(', ') || 'personne'));
        retablies.forEach(function (idR) {
          _tpNotifier_('Temps partiel de nouveau en attente',
            'Le ' + _tpJourLisible_(ds) + ' rouvre : votre demande est rétablie, en attente du comité.', idR);
        });
        out = { success: true, date: ds, fermes: Array.from(_tpFermes_(anneeD)).sort(), retablies: retablies };
      }

      return ContentService.createTextOutput(JSON.stringify(out))
        .setMimeType(ContentService.MimeType.JSON);
    }

    /* (LOT 3 · 22/08/2026) Repli GAS de la clé pose_tp_{Y} : même contenu,
       filtré à l'identité pour un rôle mar (le comité voit tout — écran du
       lot 4). Sert quand le relais est injoignable ou la clé pas encore
       poussée. Lecture seule, aucun verrou. */
    if (action === 'getPoseTp') {
      const ph = _phaseTp_();
      if (!ph.actif) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, ferme: true }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const anneeG = (ph.annees.indexOf(Number(payload.year)) !== -1) ? Number(payload.year) : ph.annee;
      const t = _construirePoseTp_(anneeG);
      t.annees = ph.annees;                      // (LOT 5) l'écran apprend ici quelles années sont ouvertes
      if (user.role !== 'admin') {
        const mien = {};
        if (t.parMar && t.parMar[user.id]) mien[user.id] = t.parMar[user.id];
        t.parMar = mien;
      }
      return ContentService.createTextOutput(JSON.stringify(t))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveIndispos') {
      const targetId = user.role === 'admin' ? payload.doctorId : user.id;
      /* (POSE TP · 22/08/2026) DEUX CIRCUITS, DEUX ANNÉES — jamais l'un vers l'autre.
         · mode TP (payload.tp === true) : vise l'année de la PHASE (_phaseTp_),
           JAMAIS getIndisposYear() — qui se replie en silence sur l'année active
           hors campagne, et enverrait les TP dans la mauvaise année.
         · mode campagne (défaut) : comportement historique, PLUS le verrou qui
           manquait — saveIndispos n'interrogeait jamais _indisposOuverte_ : rien
           n'empêchait un rôle mar d'écrire hors campagne. Le rôle admin n'est pas
           verrouillé : le comité reste maître des corrections VAC/FORM. */
      if (payload.tp === true) {
        const ph = _phaseTp_();
        if (!ph.actif) return _error('La pose des jours de temps partiel n\'est pas ouverte : aucune année générée.');
        /* (LOT 5) Deux années peuvent être ouvertes à la fois (fin 2027 :
           le reliquat 2027 ET 2028). L'écran dit laquelle il montre ; toute
           autre valeur est refusée — jamais de repli silencieux d'année. */
        const anneeTp = Number(payload.year) || ph.annee;
        if (ph.annees.indexOf(anneeTp) === -1) {
          return _error('L\'année ' + anneeTp + ' n\'est pas ouverte à la pose (ouvertes : ' + ph.annees.join(', ') + ').');
        }
        return ContentService.createTextOutput(JSON.stringify(
          _poserTp_(user, targetId, payload.indispos, anneeTp)
        )).setMimeType(ContentService.MimeType.JSON);
      }
      if (user.role !== 'admin' && !_indisposOuverte_()) {
        return _error('La campagne de saisie est fermée : indisponibilités et souhaits ne peuvent plus être enregistrés.');
      }
      const anneeInd = getIndisposYear();
      /* (LOT A · 01/09/2026) LE TEMPS PARTIEL REVIENT DANS LA CAMPAGNE.
         Le 23/08 les TP avaient été sortis d'INDISPOS : ils se posaient APRÈS
         la génération, pour ne pas contraindre l'algorithme. Le comité a
         tranché l'inverse le 01/09 — un MAR à temps partiel pose ses jours EN
         MÊME TEMPS que ses indisponibilités et ses gardes souhaitées, sur le
         même écran. Le reliquat non posé reste plaçable au fil de l'eau, dans
         les trous du planning, par le circuit dédié (payload.tp === true).
         Mesuré avant de rouvrir : 260 jours de TP posables par 8 MAR, ajoutés
         aux indisponibilités réelles 2027, ne dégradent ni l'équité (écart
         maximal 1,6 pour un plafond de 2) ni les gardes rapprochées.
         Le TP est un CONGÉ : il est exclusif d'une indisponibilité ou d'une
         garde souhaitée le même jour — une case ne porte qu'un code, poser un
         TP remplace ce qui s'y trouvait. Le quota annuel (CONFIG_CONGES,
         colonne CTP) est vérifié ICI : l'écran peut retarder, le serveur non. */
      const existantC = getIndisposForDoctor(targetId, anneeInd);
      const envoyeC = {}, tpRefuses = [];
      const quotaTpC = getQuotasConges(_quotiteDe_(targetId)).ctp || 0;
      const sansTpProfil = _tpFixeDe_(targetId) || quotaTpC <= 0;
      const jfC = getJoursFeries(anneeInd);
      let nbTpC = 0;
      Object.keys(payload.indispos || {}).forEach(function (ds) {
        const v = String(payload.indispos[ds] || '').trim().toUpperCase();
        if (v !== 'TP' && v !== 'TPA') { envoyeC[ds] = payload.indispos[ds]; return; }
        /* TPA n'a pas de sens dans la campagne : il n'y a pas encore de
           planning, donc rien à mettre « sous réserve ». Tout devient TP. */
        if (sansTpProfil) { tpRefuses.push(ds + ' (profil sans jours de temps partiel)'); return; }
        const dow = new Date(ds + 'T12:00:00').getDay();
        if (dow === 0 || dow === 6 || jfC.has(ds)) { tpRefuses.push(ds + ' (jour non travaillé)'); return; }
        if (nbTpC >= quotaTpC) { tpRefuses.push(ds + ' (quota de ' + quotaTpC + ' atteint)'); return; }
        nbTpC++; envoyeC[ds] = 'TP';
      });
      if (tpRefuses.length) logAction('saveIndispos ' + targetId + ' (' + anneeInd + ') : ' +
        tpRefuses.length + ' TP refusés — ' + tpRefuses.slice(0, 20).join(', '));
      // Fusion par proprietaire de code — voir _fusionIndispos_.
      // NE PAS remonter cette logique dans saveIndisposForDoctor : ce helper
      // sert aussi a l'absence longue, qui doit continuer a poser une ligne
      // complete. La regle de propriete n'a de sens qu'ici, ou l'on connait
      // le role de l'appelant.
      const fusion = _fusionIndispos_(existantC, envoyeC, user.role === 'admin');
      return ContentService.createTextOutput(JSON.stringify({
        success: saveIndisposForDoctor(targetId, fusion, anneeInd)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── STAFF VACANCES : ENREGISTREMENT DE TOUS LES MARs EN UN APPEL ──
    // « Valider et verrouiller » appelait saveIndispos une fois PAR MAR :
    // 23 allers-retours serialises par Apps Script, ~3 min en reel, au point
    // de passer pour un plantage. Ici : 1 aller-retour, 1 lecture d'onglet,
    // 1 ecriture de bloc. Meme regle de fusion que saveIndispos (le comite
    // ne remplace que les VAC/FORM et ne touche pas aux saisies des MARs).
    if (action === 'saveIndisposBatch') {
      if (user.role !== 'admin') return _deny();
      const anneeB = getIndisposYear();
      const ssB = SpreadsheetApp.getActiveSpreadsheet();
      const shB = ssB.getSheetByName(`INDISPOS_${anneeB}`);
      if (!shB) return _error(`INDISPOS_${anneeB} introuvable`);
      const dataB = shB.getDataRange().getValues();
      const datesB = reconstruireDatesHeaders(dataB, anneeB);
      const envoi = payload.indispos || {};
      const inconnus = [];
      let touches = 0;
      // matrice complete relue depuis l'onglet : les lignes non visees
      // sont reecrites a l'identique, jamais perdues.
      const bloc = [];
      for (let r = 3; r < dataB.length; r++) {
        bloc.push(datesB.map((d, i) => d ? String(dataB[r][i + 1] || '').trim() : ''));
      }
      Object.keys(envoi).forEach(function (marId) {
        const id = String(marId).trim();
        let ligne = -1;
        for (let r = 3; r < dataB.length; r++) {
          if (String(dataB[r][0]).trim() === id) { ligne = r - 3; break; }
        }
        if (ligne < 0) { inconnus.push(id); return; }
        const existant = {};
        datesB.forEach(function (d, i) { if (d && bloc[ligne][i]) existant[d] = bloc[ligne][i]; });
        const fusion = _fusionIndispos_(existant, envoi[marId], true);  // true = comite
        bloc[ligne] = datesB.map(d => d ? (fusion[d] || '') : '');
        touches++;
      });
      if (bloc.length) shB.getRange(4, 2, bloc.length, datesB.length).setValues(bloc);
      logAction(`saveIndisposBatch : ${touches} MAR(s) enregistre(s)` +
                (inconnus.length ? ` — introuvables : ${inconnus.join(', ')}` : ''));
      return ContentService.createTextOutput(JSON.stringify({
        success: true, saved: touches, inconnus: inconnus
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getAllIndispos') {
  if (user.role !== 'admin') return _deny();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const indYear = Number(payload.year) || getIndisposYear();
  const sheet = ss.getSheetByName(`INDISPOS_${indYear}`);
      if (!sheet) return _error(`INDISPOS_${indYear} introuvable`);
      const data = sheet.getDataRange().getValues();
      const dates = reconstruireDatesHeaders(data, indYear); // (C3b) helper unifié
      const result = {};
      for (let r = 3; r < data.length; r++) {
        const id = String(data[r][0]).trim();
        if (!id) continue;
        result[id] = {};
        dates.forEach((date, i) => {
          if (!date) return;
          const val = String(data[r][i+1]||'').trim();
          if (val) result[id][date] = val;
        });
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true, data: result, year: indYear
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'applyModification') {
      if (user.role !== 'admin') return _deny();
      return ContentService.createTextOutput(JSON.stringify({
        success: applyModification(payload.modification)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    /* (13/08/2026 — échanges, phase 3) Les DEUX verbes du circuit pair-à-pair.
       Ouverts aux rôles mar ET admin (le secrétariat est déjà refusé par
       défaut en amont). Le demandeur est TOUJOURS user.id — résolu par
       checkCode, jamais lu du payload. Toute erreur (contrôle refusé à la
       création, demande introuvable, mauvais répondeur…) revient en
       success:false avec son motif : c'est un verdict, pas une panne. */
    if (action === 'creerEchange') {
      if (!_echangesAutorise_(user)) return _deny();
      try {
        return ContentService.createTextOutput(JSON.stringify(Object.assign(
          { success: true }, creerEchange(user, payload)
        ))).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false, error: String(err.message)
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    if (action === 'repondreEchange') {
      if (!_echangesAutorise_(user)) return _deny();
      try {
        return ContentService.createTextOutput(JSON.stringify(Object.assign(
          { success: true }, repondreEchange(user, payload)
        ))).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false, error: String(err.message)
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (action === 'getStats') {
  if (user.role !== 'admin') return _deny();
  const statsYear = Number(payload.year) || TEST_YEAR;
  // (03/08/2026) Repli archives, meme raison que getGardes ci-dessus.
  const ss = _ssWithSheet(`STATS_GARDES_${statsYear}`) || SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`STATS_GARDES_${statsYear}`);
  if (!sheet) return _error(`Onglet STATS_GARDES_${statsYear} introuvable`);
      const data = sheet.getDataRange().getValues();
      const stats = [];
      for (let r = 1; r < data.length; r++) {
        if (!data[r][0]) continue;
        stats.push({medecin:data[r][0], cible:data[r][1], total:data[r][2],
          g:data[r][3], g2:data[r][4], lun:data[r][5], mar:data[r][6], mer:data[r][7],
          jeu:data[r][8], ven:data[r][9], sat:data[r][10], dim:data[r][11],
          recupR:data[r][12], h18:data[r][13],
          jf:data[r][14], vjf:data[r][15], vd:data[r][20], cSat:data[r][17], cJeu:data[r][18], cVd:data[r][19], cVjf:data[r][21], cJf:data[r][22]});
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, stats}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'generateGardes') {
  if (user.role !== 'admin') return _deny();
  logAction('DEBUG generateGardes: payload.year=' + payload.year + ' TEST_YEAR=' + TEST_YEAR);
  const yearToGenerate = Number(payload.year) || TEST_YEAR;
  logAction('DEBUG yearToGenerate=' + yearToGenerate);
  if (yearToGenerate === 2026) return _error('Génération désactivée — GARDES_2026 est sanctuarisé');
if (yearToGenerate === 2026) return _error('Génération désactivée — GARDES_2026 est sanctuarisé');
      // ── (W2-R) Garde d'idempotence — même principe que archiveYear (15/07/2026).
      // Cas visé : la génération a RÉUSSI côté serveur mais la réponse s'est
      // perdue (réseau, onglet fermé, veille) → au réessai, generateGardes()
      // lèverait « GARDES_{Y} existe déjà — supprimez d'abord l'onglet », un
      // message que l'utilisateur pourrait suivre et DÉTRUIRE un planning valide.
      // Ici : si l'année est déjà générée ET cohérente, on ne régénère pas, on
      // renvoie les stats existantes et le wizard enchaîne sur publication/récaps.
      // Le verrou de generateGardes() reste intact (appel direct depuis l'éditeur).
      {
        const ssChk = SpreadsheetApp.getActiveSpreadsheet();
        const gChk = ssChk.getSheetByName(`GARDES_${yearToGenerate}`);
        const sChk = ssChk.getSheetByName(`STATS_GARDES_${yearToGenerate}`);
        // Cohérence stricte : les DEUX onglets présents et STATS non vide
        // (au moins une ligne de données sous l'en-tête). Sinon → génération
        // réellement incomplète : on laisse le flux normal remonter l'erreur.
        if (gChk && sChk && sChk.getLastRow() > 1) {
          const dChk = sChk.getDataRange().getValues();
          const statsChk = [];
          for (let r = 1; r < dChk.length; r++) {
            if (!dChk[r][0]) continue;
            statsChk.push({medecin:dChk[r][0], cible:dChk[r][1], total:dChk[r][2],
              g:dChk[r][3], g2:dChk[r][4], lun:dChk[r][5], mar:dChk[r][6], mer:dChk[r][7],
              jeu:dChk[r][8], ven:dChk[r][9], sat:dChk[r][10], dim:dChk[r][11],
              recupR:dChk[r][12], h18:dChk[r][13],
              jf:dChk[r][14], vjf:dChk[r][15], vd:dChk[r][20], cSat:dChk[r][17],
              cJeu:dChk[r][18], cVd:dChk[r][19], cVjf:dChk[r][21], cJf:dChk[r][22]});
          }
          logAction(`generateGardes — ${yearToGenerate} déjà générée : reprise sans régénération (${statsChk.length} MARs)`);
          return ContentService.createTextOutput(JSON.stringify({
            success: true, alreadyDone: true, stats: statsChk
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
let _genWarn = { warnings: [], nbWarnings: 0 };
try {
  _genWarn = generateGardes(yearToGenerate) || _genWarn;
  generatePlanning(yearToGenerate);
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(`STATS_GARDES_${yearToGenerate}`);
        const data = sheet.getDataRange().getValues();
        const stats = [];
        for (let r = 1; r < data.length; r++) {
          if (!data[r][0]) continue;
          stats.push({medecin:data[r][0], cible:data[r][1], total:data[r][2],
            g:data[r][3], g2:data[r][4], lun:data[r][5], mar:data[r][6], mer:data[r][7],
            jeu:data[r][8], ven:data[r][9], sat:data[r][10], dim:data[r][11],
            recupR:data[r][12], h18:data[r][13],
            jf:data[r][14], vjf:data[r][15], vd:data[r][20], cSat:data[r][17], cJeu:data[r][18], cVd:data[r][19], cVjf:data[r][21], cJf:data[r][22]});
        }
        /* (01/09/2026) LES AVERTISSEMENTS DOIVENT SURVIVRE À LA FERMETURE DE
           L'ASSISTANT. Jusqu'ici LOGS ne gardait que leur NOMBRE : le contenu
           ne partait que dans le journal d'exécution d'Apps Script, invisible
           depuis l'application. Constaté le 01/09 — « il y a eu des
           avertissements mais je ne sais plus ce que c'était », et rien ne
           permettait de les retrouver. C'est précisément le moment où le comité
           en a besoin : ils disent quels replis l'algorithme a dû consentir.
           Plafond de 25 lignes : LOGS est purgé au-delà de 501 lignes, et le
           générateur peut en produire jusqu'à 60 — les écrire toutes chasserait
           le reste du journal. Le compte exact figure sur la ligne de tête. */
        logAction(`generateGardes ${yearToGenerate} — ${_genWarn.nbWarnings} avertissement(s)`);
        {
          const _w = _genWarn.warnings || [];
          const _MAX = 25;
          _w.slice(0, _MAX).forEach(function (t, k) {
            logAction(`  avertissement ${k + 1}/${_genWarn.nbWarnings} · ${yearToGenerate} : ${t}`);
          });
          if (_w.length > _MAX) {
            logAction(`  … ${_w.length - _MAX} avertissement(s) de plus, non détaillés (voir l'écran de génération)`);
          }
        }
        return ContentService.createTextOutput(JSON.stringify({success:true, stats,
          warnings: _genWarn.warnings, nbWarnings: _genWarn.nbWarnings}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        /* (LOT C · 01/09/2026) Un jour sans binôme n'est pas une panne : c'est
           un diagnostic. Le générateur attache la STRUCTURE (err.joursVides) ;
           la renvoyer telle quelle permet à l'écran de la mettre en forme.
           Sans elle, le comité recevait trente lignes aplaties en un seul
           paragraphe rouge, où le levier utile était noyé. */
        if (err && err.joursVides) {
          logAction('generateGardes ' + yearToGenerate + ' — bloqué : ' +
            err.joursVides.length + ' jour(s) sans binôme (' +
            err.joursVides.map(function (o) { return o.date; }).join(', ') + ')');
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: err.joursVides.length + ' jour(s) sans binôme de garde — rien n\'a été écrit.',
            joursVides: err.joursVides,
            messageComplet: err.message
          })).setMimeType(ContentService.MimeType.JSON);
        }
        return _error(err.message);
      }
    }
    if (action === 'getGardes') {
      if (user.role !== 'admin') return _deny();
      const gYear = Number(payload.year) || TEST_YEAR;              // (C3) année paramétrable
      /* (03/08/2026) Repli sur le classeur d'archives : une annee cloturee voit ses
         onglets deplaces hors du maitre, et cet endpoint repondait « introuvable ».
         L'onglet Statuts et l'equite initiale d'une annee passee etaient donc morts. */
      const ss = _ssWithSheet(`GARDES_${gYear}`) || SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(`GARDES_${gYear}`);
      if (!sheet) return _error(`Onglet GARDES_${gYear} introuvable`);
      const data = sheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(data, gYear);                // (C3) ancré 1er lundi → fin du décalage + queue janvier N+1
      const result = {};
      for (let r = 3; r < data.length; r++) {
        const id = String(data[r][0]).trim();
        if (!id) continue;
        Object.keys(dateToCol).forEach(date => {
          const val = String(data[r][dateToCol[date]] || '').trim();
          if (!val) return;
          if (!result[date]) result[date] = {};
          result[date][id] = val;
        });
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, data:result, year:gYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getJoursFeries') {
      if (user.role !== 'admin') return _deny();
      const fYear = Number(payload.year) || TEST_YEAR;
      const jf = [...getJoursFeries(fYear), ...getJoursFeries(fYear + 1)];
      return ContentService.createTextOutput(JSON.stringify({success:true, joursFeries: jf, year: fYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    /* (13/08/2026) Bandeau « mon ordre de passage » de la vue Mes congés.
       Lecture seule, réservée aux MAR : un code secrétariat n'y accède pas
       (liste blanche SECRETARIAT_ACTIONS), un code admin n'a pas d'identifiant
       de MAR et n'aurait donc pas de rang à afficher.
       L'année mise en avant bascule le 1er septembre : jusqu'au 31 août on
       regarde l'année en cours, après on prépare le staff de la suivante.
       C'est une règle d'affichage, tranchée ici pour que la date de référence
       soit celle du service et non celle du téléphone. */
    if (action === 'getOrdreVacances') {
      if (user.role !== 'mar') return _deny();
      const _now = new Date();
      const _an = _now.getFullYear();
      const res = getOrdreVacances(user.id, [_an, _an + 1]);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        annees: res.annees,
        anneePrincipale: (_now.getMonth() + 1) >= 9 ? _an + 1 : _an,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getVacConfig') {
      const indYear = getIndisposYear();
      const cfg = getVacConfig(user.id, indYear);
      const jf = getJoursFeries(indYear);
      const jfNext = getJoursFeries(indYear + 1);
      const _f = getMedecinFlags();
      const tpFixe = _f.rythme2sur2.has(user.id) || !!_f.tpJoursFixes[user.id];
      /* (25/08/2026) `genere` : le planning de l'année de campagne existe déjà.
         L'écran passe alors en LECTURE SEULE — les indispos ne servent plus à
         rien une fois les gardes tirées, et sans ce signal le MAR pouvait
         continuer à saisir pendant des semaines en croyant que ça comptait.
         La campagne n'est PAS fermée pour autant : la clôture (qui archive
         l'année et bascule sur la suivante) reste un geste du comité, sinon
         une simple génération d'essai basculerait tout. */
      const _dejaGenere = _indisposFigees_();   // (26/08) source unique — partagée avec la clé acces
      return ContentService.createTextOutput(JSON.stringify({
        success: true, periodes: cfg.periodes, quotaVac: cfg.quotaVac,
        quotaForm: cfg.quotaForm, quotaCtp: cfg.quotaCtp, tpFixe: tpFixe,
        totalVacDoc: cfg.totalVacDoc, joursFeries: [...jf, ...jfNext],
        genere: _dejaGenere, anneeCampagne: indYear,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'setActiveYear') {
      if (user.role !== 'admin') return _deny();
      const newYear = Number(payload.year);
      if (!newYear || newYear < 2026) return _error('Année invalide');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      // (Onglet OVERRIDES retiré : registre inutilisé, jamais alimenté, non branché au planning.)
      const configSheet = ss.getSheetByName('CONFIG');
      const configData = configSheet.getDataRange().getValues();
      for (let r = 1; r < configData.length; r++) {
        if (String(configData[r][0]).trim() === 'ANNEE_ACTIVE') {
          configSheet.getRange(r + 1, 2).setValue(newYear); break;
        }
      }
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      return ContentService.createTextOutput(JSON.stringify({success:true, year:newYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'initYear') {
      if (user.role !== 'admin') return _deny();
      const newYear = Number(payload.year);
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let indSheet = ss.getSheetByName(`INDISPOS_${newYear}`);
      if (indSheet) return _error(`INDISPOS_${newYear} existe déjà`);
      // ── Effectif = onglet MEDECINS (actifs), source unique (plus de MEDECINS_LIST en dur) ──
      const medSheetSrc = ss.getSheetByName('MEDECINS');
      const actifsIds = [];
      if (medSheetSrc) {
        const medSrcData = medSheetSrc.getDataRange().getValues();
        for (let r = 1; r < medSrcData.length; r++) {
          const id = String(medSrcData[r][0]).trim();
          const actif = String(medSrcData[r][3]).trim().toUpperCase() === 'O';
          if (id && actif) actifsIds.push(id);
        }
      }
      if (!actifsIds.length) return _error('Aucun MAR actif dans MEDECINS — vérifiez la colonne ACTIF (O/N)');
      indSheet = ss.insertSheet(`INDISPOS_${newYear}`);

      const jan1 = new Date(newYear, 0, 1);
      const dow1 = jan1.getDay();
      const offset = dow1 === 1 ? 7 : dow1 === 0 ? 1 : 8 - dow1;
      const startDate = new Date(newYear, 0, 1 + offset);
      const jan1Next = new Date(newYear + 1, 0, 1);
      const dow1Next = jan1Next.getDay();
      const offsetNext = dow1Next === 1 ? 7 : dow1Next === 0 ? 1 : 8 - dow1Next;
      const endDate = new Date(newYear + 1, 0, offsetNext);
      const days = [];
      const dLoop = new Date(startDate);
      while (dLoop <= endDate) { days.push(new Date(dLoop)); dLoop.setDate(dLoop.getDate() + 1); }

      const ROUGE = '#C0392B', GRIS_WE = '#CFD8DC', BLANC = '#FFFFFF';
      const JOURS_ABR = ['D','L','M','M','J','V','S'];
      const nCols = days.length + 1;
      indSheet.setFrozenRows(3);

      const row1 = ['MÉDECIN']; days.forEach(() => row1.push(''));
      indSheet.getRange(1, 1, 1, nCols).setValues([row1]);
      indSheet.getRange(1, 1).setFontWeight('bold').setBackground(ROUGE).setFontColor(BLANC);

      // (UX) En-têtes de mois par tranches hebdomadaires : le mois reste visible
      // à toute position de scroll (helper partagé ecrireEntetesMois, code.gs).
      ecrireEntetesMois(indSheet, days.map(d => ({ month: d.getMonth() + 1, dow: d.getDay() })));

      const row2 = ['JOUR']; days.forEach(d => row2.push(JOURS_ABR[d.getDay()]));
      indSheet.getRange(2, 1, 1, nCols).setValues([row2]);
      indSheet.getRange(2, 1).setFontWeight('bold').setBackground(ROUGE).setFontColor(BLANC);

      const row3 = ['N°']; days.forEach(d => row3.push(d.getDate()));
      indSheet.getRange(3, 1, 1, nCols).setValues([row3]);
      indSheet.getRange(3, 1).setFontWeight('bold').setBackground(ROUGE).setFontColor(BLANC);

      const medRows = actifsIds.map(id => [id, ...Array(days.length).fill('')]);
      indSheet.getRange(4, 1, medRows.length, nCols).setValues(medRows);

      // ── Report des absences longues (CL) chevauchant cette année (registre ABSENCES_LONGUES) ──
      try {
        const absSheet = ss.getSheetByName('ABSENCES_LONGUES');
        if (absSheet && days.length) {
          const adata = absSheet.getDataRange().getValues();
          const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const planStart = fmt(days[0]), planEnd = fmt(days[days.length - 1]);
          const rowOf = {}; actifsIds.forEach((id, i) => { rowOf[String(id).trim().toUpperCase()] = 4 + i; });
          for (let r = 1; r < adata.length; r++) {
            const id = String(adata[r][0]).trim().toUpperCase();
            const a  = _isoDate(adata[r][1]), b = _isoDate(adata[r][2]);
            if (!id || !a || !b || !(id in rowOf)) continue;
            if (b < planStart || a > planEnd) continue;     // ne chevauche pas l'année planning
            days.forEach((day, i) => { const ds = fmt(day); if (ds >= a && ds <= b) indSheet.getRange(rowOf[id], i + 2).setValue('CL'); });
          }
        }
      } catch(e) {}

      const jfY = getJoursFeries(newYear);
      const jfYn = getJoursFeries(newYear + 1);
      days.forEach((day, i) => {
        const col = i + 2, isWE = day.getDay() === 0 || day.getDay() === 6;
        const ds = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
        const isFerie = jfY.has(ds) || jfYn.has(ds);
        if (isWE || isFerie) indSheet.getRange(2, col, 2 + medRows.length, 1).setBackground(GRIS_WE); // ligne 1 = bandeau des mois, préservé
        const nextDay = days[i + 1];
        if (!nextDay || nextDay.getMonth() !== day.getMonth()) {
          indSheet.getRange(1, col, 3 + medRows.length, 1)
            .setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
        }
      });
      indSheet.setColumnWidth(1, 120);
      for (let c = 2; c <= nCols; c++) indSheet.setColumnWidth(c, 35);
      indSheet.getRange(1, 2, 3 + medRows.length, nCols - 1).setHorizontalAlignment('center');
// ── Créer AFFECTATIONS_newYear si inexistant ──────────────────────
const affName = `AFFECTATIONS_${newYear}`;
let affSheet = ss.getSheetByName(affName);
if (!affSheet) {
  affSheet = ss.insertSheet(affName);
  const RED = '#C0392B', WHITE = '#FFFFFF';
  const MONTHS_SHORT = ['JAN','FEV','MARS','AVRIL','MAI','JUIN',
                        'JUILLET','AOUT','SEPT','OCT','NOV','DEC'];
  const affHeaders = ['MÉDECIN', ...MONTHS_SHORT.map(m => `${m} ${newYear}`)];
  affSheet.getRange(1, 1, 1, affHeaders.length).setValues([affHeaders]);
  affSheet.getRange(1, 1, 1, affHeaders.length)
    .setFontWeight('bold').setBackground(RED).setFontColor(WHITE).setHorizontalAlignment('center');
  affSheet.setColumnWidth(1, 140);
  for (let c = 2; c <= affHeaders.length; c++) affSheet.setColumnWidth(c, 90);
  affSheet.setFrozenRows(1);
  affSheet.setFrozenColumns(1);

  // Lire les MARs actifs depuis MEDECINS
  const medSheet2 = ss.getSheetByName('MEDECINS');
  const affRows = [];
  if (medSheet2) {
    const medData2 = medSheet2.getDataRange().getValues();
    for (let r = 1; r < medData2.length; r++) {
      const id = String(medData2[r][0]).trim();
      const actif = String(medData2[r][3]).trim().toUpperCase() === 'O';
      if (id && actif) affRows.push([id, ...Array(12).fill('VOLANT')]);
    }
  }
  if (affRows.length > 0) {
    affSheet.getRange(2, 1, affRows.length, affHeaders.length).setValues(affRows);
    affSheet.getRange(2, 2, affRows.length, 12)
      .setFontColor('#64748B').setHorizontalAlignment('center');
  }
  Logger.log(`✅ ${affName} créé (${affRows.length} MARs)`);
}
      return ContentService.createTextOutput(JSON.stringify({
        success: true, message: `INDISPOS_${newYear} créé avec ${days.length} jours`
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'publishPlanning') {
      if (user.role !== 'admin') return _deny();
      try {
        /* (2026-08-04.8) PUBLICATION COMBINEE : le lot de placements en
           attente arrive DANS le meme appel (payload.items) — un aller-retour
           au lieu de deux. Meme fonction que l'action dediee : lignes visees
           par (date, MAR), rejouable sans doublon. Lot vide ou absent :
           comportement inchange. */
        let _lotEcrit = 0;
        if (Array.isArray(payload.items) && payload.items.length) {
          const _resLot = savePlanningOverridesBatch(payload.items);
          _lotEcrit = (_resLot && _resLot.saved) || 0;
        }
        generatePlanning(Number(payload.year) || TEST_YEAR);
        // Notifications : arme le minuteur d'accalmie. Isolé : un échec ici
        // ne doit jamais faire échouer la publication.
        try { notifPlanifier(Number(payload.year) || TEST_YEAR); } catch (e) {}
        return ContentService.createTextOutput(JSON.stringify({
          success: true, message: `Planning ${TEST_YEAR} publié`, lotEcrit: _lotEcrit
        })).setMimeType(ContentService.MimeType.JSON);
      } catch(err) { return _error(err.message); }
    }

    if (action === 'getVacValidation') {
      if (user.role !== 'admin') return _deny();
      return ContentService.createTextOutput(JSON.stringify({
        success: true, data: getVacValidation(getIndisposYear())
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getOverrides') {
      if (user.role !== 'admin') return _deny();
      return ContentService.createTextOutput(JSON.stringify(_buildOverrides_()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'deleteOverride') {
      if (user.role !== 'admin') return _deny();
      const rowIndex = Number(payload.rowIndex);
      if (!rowIndex || rowIndex < 2) return _error('Index invalide');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('OVERRIDES');
      if (!sheet) return _error('Onglet OVERRIDES introuvable');
      sheet.deleteRow(rowIndex);
      generatePlanning();
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── (perf) BOOTSTRAP ADMIN : tout le boot en UN aller-retour ──
    // Regroupe planning + affectations + medecins + overrides. Les handlers unitaires
    // (getMedecins, getOverrides, getPlanningJson, getAffectationsJson) restent inchangés
    // et partagent les mêmes builders → réponse identique champ à champ.
    if (action === 'getAdminBootstrap') {
      if (user.role !== 'admin') return _deny();
      const jy = parseInt(payload.year) || getActiveYear();
      const out = { success: true, year: jy };
      /* (28/07/2026) L'IDENTITE REJOINT LE BOOTSTRAP — mesure du 28/07 a 10:46 :
         quatre executions lancees ensemble coutent 4 a 7 s chacune, alors qu'une
         execution SEULE coute 1,8 s. Apps Script met les executions d'un meme
         utilisateur en file : le parallelisme ne fait pas gagner de temps, il en
         fait perdre. L'ouverture d'admin appelait login PUIS getAdminBootstrap,
         soit deux executions concurrentes pour une seule information utile.
         En livrant l'identite ici, l'ouverture ne coute plus qu'UNE execution.
         Les champs ci-dessous sont EXACTEMENT ceux de l'action login, qui reste
         en place pour les autres pages et comme repli. */
      out.role = user.role; out.id = user.id;
      out.name = user.name; out.initials = user.initials;
      out.liberal = !!user.liberal;
      out.rpps = user.rpps || '';
      out.prenom = user.prenom || '';
      /* (01/08/2026) CHRONOMETRE INTERNE — mesure, ne change RIEN.
         Mesure du 01/08 a 14:53, ouverture ramenee a UN SEUL appel : doGet vaut
         3 633 ms, soit 53 % du cout total. Le travail du bootstrap est donc
         devenu le premier poste, devant le peage. Restait a savoir laquelle de
         ses dix operations le porte. `_jalon` note le temps ecoule depuis le
         jalon precedent : aucune expression n'est enveloppee, aucun try/catch
         deplace. Le detail part dans out._detail et s'affiche dans chrono(). */
      const _det = {}; let _tp = Date.now();
      const _jalon = function (nom) { const n = Date.now(); _det[nom] = n - _tp; _tp = n; };

      out.indisposYear = getIndisposYear();
      out.indisposOuverte = _indisposOuverte_();
      // (POSE TP · 22/08/2026) Mêmes trois champs que `login` : phase déduite,
      // quotité, exclusion jours fixes / rythme 2/2. Zéro lecture nouvelle
      // (CONFIG et MEDECINS sont déjà lus par ce bootstrap).
      out.phaseTp = _phaseTp_();
      out.quotite = user.quotite || 100;
      out.tpFixe = _tpFixeDe_(user.id);
      _jalon('annee + campagne (CONFIG)');
      logConnexion(user);
      _jalon('journal de connexion (ecriture)');
      try {
        const rawP = readPlanningFromDrive(`planning_${jy}.json`);
        _jalon('planning : lecture Drive');
        out.planning = rawP ? JSON.parse(rawP) : null;
        _jalon('planning : analyse JSON');
        if (!rawP) out.planningError = `planning_${jy}.json introuvable dans le Drive`;
      } catch (e) { out.planning = null; out.planningError = e.message; _jalon('planning : ECHEC'); }
      try {
        const rawA = readPlanningFromDrive(`affectations_${jy}.json`);
        out.affectations = rawA ? JSON.parse(rawA) : null;
      } catch (e) { out.affectations = null; }
      _jalon('affectations (Drive + analyse)');
      const _m = _buildMedecins_();
      out.medecins = _m.error ? [] : _m.medecins;
      _jalon('medecins (onglet)');
      /* (18/08/2026) overrides retirés du bootstrap : le widget « modifications
         en attente » a quitté admin.html — lire l'onglet PLANNING_OVERRIDES à
         chaque ouverture ne servait plus personne. _buildOverrides_ reste servi
         par l'action getOverrides. */
      // (28/07/2026 perf) Secteurs et consultations rejoignent le bootstrap.
      // Motif : chaque aller-retour coute ~1 s de DEMARRAGE (compilation des 5
      // fichiers + liaison au classeur) avant meme la moindre lecture. Deux appels
      // separes valaient donc ~2 s a chaque ouverture d'admin. Un echec ici n'est
      // jamais bloquant : la page repasse par getSecteurs / getCsTemplate.
      try { out.secteurs   = getSecteurs(); }   catch (e) { out.secteurs = null; }
      _jalon('secteurs (onglet)');
      // (01/08/2026) Seuils d'affichage (onglet SEUILS). Jamais bloquant :
      // absent ou illisible, admin.html garde ses valeurs de repli.
      try { out.seuils     = getSeuils(); }     catch (e) { out.seuils = null; }
      // (01/08/2026) Premiere annee generee par l'algorithme : le compteur de recups
      // de samedi n'a de sens qu'a partir de la. Lu ici pour ne PAS figer 2027 dans
      // admin.html — la constante vit dans generateur_gardes.gs, elle seule fait foi.
      try { out.anneeStatsFiables = PREMIERE_ANNEE_STATS_FIABLES; } catch (e) { out.anneeStatsFiables = null; }
      try { out.csTemplate = getCsTemplate(); } catch (e) { out.csTemplate = null; }
      _jalon('seuils + modele de consultations');
      /* (28/07/2026, 15 h) LE COMPTEUR DE MAILS REJOINT LE BOOTSTRAP.
         Un commentaire d'admin.html disait « NE JAMAIS le mettre dans
         getAdminBootstrap : ~1 s ajoutee a chaque ouverture ». Cette regle est
         PERIMEE et remplacee : la mesure du 28/07 donne 129 ms de travail reel
         pour cette action, quand un appel separe coute 2,4 s au total (le peage
         d'entree d'Apps Script, mesure a 2-3 s sur une requete vide). Le fusionner
         SUPPRIME un appel de l'ouverture pour 0,13 s de serveur en plus.
         Echec tolere : le badge est un confort, jamais une donnee critique. */
      try {
        const _lab = Gmail.Users.Labels.get('me', 'INBOX');
        out.mailNonLus = Number(_lab.messagesUnread || 0);
      } catch (e) { out.mailNonLus = null; }
      _jalon('compteur de mails (Gmail)');
      /* (28/07/2026, 15 h 50) EXISTENCE DE L'ANNEE SUIVANTE, SANS LA TELECHARGER.
         Le frontend appelait getPlanningJson sur N+1 pour repondre a une seule
         question : « cette annee existe-t-elle ? ». Cela telechargeait le planning
         COMPLET (255 Ko) a chaque ouverture, soit ~2,5 s, pour un oui/non.
         _jsonFilesByName_ liste les fichiers du dossier Drive SANS lire leur contenu
         (aucun getBlob) : la reponse coute quelques dizaines de ms.
         La detection reste exacte et se met a jour des que N+1 est publiee, puisque
         elle est recalculee a chaque ouverture. */
      try {
        out.anneeSuivante = _jsonFilesByName_('planning_' + (jy + 1) + '.json').length > 0;
      } catch (e) { out.anneeSuivante = null; }
      _jalon('existence annee N+1 (listage Drive)');
      out._detail = _det;
      out._taille = null;
      // La serialisation ne peut pas figurer dans le texte qu'elle produit :
      // on la mesure, puis on l'insere en tete par simple concatenation.
      const _tSer = Date.now();
      const _txtOut = JSON.stringify(out);
      const _dSer = Date.now() - _tSer;
      return ContentService.createTextOutput(
        _txtOut.charAt(1) === '"'
          ? '{"_ser_ms":' + _dSer + ',"_taille":' + _txtOut.length + ',' + _txtOut.slice(1)
          : _txtOut
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getMedecins') {
      if (user.role !== 'admin') return _deny();
      const _m = _buildMedecins_();
      if (_m.error) return _error(_m.error);
      return ContentService.createTextOutput(JSON.stringify({success:true, medecins:_m.medecins}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveMedecin') {
      if (user.role !== 'admin') return _deny();
      const m = payload.medecin;
      if (!m || !m.id) return _error('Données invalides');
      const id = String(m.id).toUpperCase().trim();
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('MEDECINS');
      const data = sheet.getDataRange().getValues();

      // ligne existante ? sinon valeurs par défaut
      let rowIdx = -1, ex = [];
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim().toUpperCase() === id) { rowIdx = r; ex = data[r]; break; }
      }
      // fusion : valeur du formulaire si fournie, sinon on garde l'existant
      const old = i => (ex[i] !== undefined && ex[i] !== null) ? ex[i] : '';
      const str = (k, i) => (m[k] !== undefined && m[k] !== null) ? String(m[k]).trim() : old(i);
      const num = (k, i, d) => (m[k] !== undefined && m[k] !== null && m[k] !== '') ? (Number(m[k]) || d) : (old(i) !== '' ? old(i) : d);
      const yn  = (k, i) => (m[k] !== undefined) ? (m[k] ? 'O' : 'N') : (String(old(i)).trim().toUpperCase() === 'O' ? 'O' : 'N');

      const row = [
        id,                        // A id
        str('nom', 1),             // B nom
        str('initiales', 2),       // C initiales
        yn('actif', 3),            // D actif
        num('quotite', 4, 100),    // E quotité
        num('pctGardes', 5, 100),  // F % gardes
        (m.codeAcces ? String(m.codeAcces).trim() : old(6)),  // G code — vide = inchangé (jamais effacé)
        str('email', 7),           // H email
        str('dect', 8),            // I dect
        str('dateDebut', 9),       // J date_debut
        str('dateFin', 10),        // K date_fin
        yn('noGarde', 11),         // L no_garde
        yn('only18', 12),          // M only_18
        yn('noWeekend', 13),       // N no_weekend
        yn('rythme2sur2', 14),     // O rythme_2sur2
        yn('souhaitPlafond', 15),  // P souhait_plafond
        (m.tpJoursFixes !== undefined) ? String(m.tpJoursFixes).trim().toUpperCase() : String(old(16)).trim().toUpperCase()  // Q tp_jours_fixes
      ];
      if (rowIdx >= 0) sheet.getRange(rowIdx + 1, 1, 1, row.length).setValues([row]);
      else             sheet.appendRow(row);

      _medFlagsCache = null;  // invalider le cache des particularités
      // (RH-1) MAR actif → garantir ses lignes dans les onglets annuels
      // (couvre création tardive ET réactivation après une init/génération).
      let rowsCreated = [];
      if (row[3] === 'O') {
        try { rowsCreated = ensureMarRows(id); }
        catch(e) { Logger.log('ensureMarRows: ' + e.message); }
        if (rowsCreated.length) logAction(`ensureMarRows — ${id} : ${rowsCreated.join(', ')}`);
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, created: rowIdx < 0, rowsCreated}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getAffectations') {
  if (user.role !== 'admin') return _deny();
  const affYear = Number(payload.year) || TEST_YEAR;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`AFFECTATIONS_${affYear}`);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({success:true, affectations:{}}))
        .setMimeType(ContentService.MimeType.JSON);
      const data = sheet.getDataRange().getValues();
      const affectations = {};
      for (let r = 1; r < data.length; r++) {
        const id = String(data[r][0]).trim();
        if (!id) continue;
        affectations[id] = {};
        for (let m = 1; m <= 12; m++) {
          const val = String(data[r][m]||'').trim();
          if (val) affectations[id][m] = val;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, affectations}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveAffectations') {
  if (user.role !== 'admin') return _deny();
  const aff = payload.affectations;
  if (!aff) return _error('Données manquantes');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const affYear = Number(payload.year) || TEST_YEAR;
  const sheetName = `AFFECTATIONS_${affYear}`;
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return _error(`Onglet ${sheetName} introuvable`);
  const res = ecrireAffectations(sheet, aff);
  logAction(`saveAffectations — ${res.maj} MAR(s) mis à jour` +
            (res.crees ? `, ${res.crees} ligne(s) créée(s)` : ''));
  
  // ← AJOUT : republier le planning après chaque modification d'affectation
  try { generatePlanning(affYear); } catch(e) { Logger.log('generatePlanning error: ' + e.message); }

  return ContentService.createTextOutput(JSON.stringify({success:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

    if (action === 'getVacancesConfig') {
      if (user.role !== 'admin') return _deny();
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const perSheet = ss.getSheetByName('PERIODES_VAC');
      let periodes = [];
      if (perSheet) {
        const perData = perSheet.getDataRange().getValues();
        for (let r = 1; r < perData.length; r++) {
          const nom = String(perData[r][0]).trim();
          if (!nom) continue;
          const debutRaw = perData[r][1], finRaw = perData[r][2];
          const debut = debutRaw instanceof Date
            ? `${debutRaw.getFullYear()}-${String(debutRaw.getMonth()+1).padStart(2,'00')}-${String(debutRaw.getDate()).padStart(2,'00')}`
            : String(debutRaw).trim();
          const fin = finRaw instanceof Date
            ? `${finRaw.getFullYear()}-${String(finRaw.getMonth()+1).padStart(2,'00')}-${String(finRaw.getDate()).padStart(2,'00')}`
            : String(finRaw).trim();
          periodes.push({nom, debut, fin, seuil:Number(perData[r][3])||8});
        }
      }
      // Année visée (wizard) : ne garder que ses périodes ; si aucune, proposer (API Nice + filet)
      const wizYear = Number(payload.year) || 0;
      if (wizYear) {
        const pourAnnee = periodes.filter(function(p){ return String(p.debut).startsWith(String(wizYear)); });
        periodes = pourAnnee.length ? pourAnnee : proposerVacances(wizYear);
      }
      const groupSheet = ss.getSheetByName('GROUPES_VAC');
      const groupes = {A:[],B:[],C:[]};
      if (groupSheet) {
        const groupData = groupSheet.getDataRange().getValues();
        const tempGroups = {A:[],B:[],C:[]};
        for (let r = 1; r < groupData.length; r++) {
          const grp = String(groupData[r][0]).trim(), id = String(groupData[r][1]).trim();
          const ord = Number(groupData[r][2])||0;
          if (!id||!tempGroups[grp]) continue;
          tempGroups[grp].push({id, ordre:ord});
        }
        ['A','B','C'].forEach(g => {
          groupes[g] = tempGroups[g].sort((a,b)=>a.ordre-b.ordre).map(m=>({id:m.id}));
        });
      }
      return ContentService.createTextOutput(JSON.stringify({success:true, periodes, groupes}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'savePeriodes') {
      if (user.role !== 'admin') return _deny();
      const periodes = payload.periodes;
      if (!Array.isArray(periodes)) return _error('Données invalides');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('PERIODES_VAC');
      if (!sheet) {
        sheet = ss.insertSheet('PERIODES_VAC');
        sheet.getRange(1,1,1,4).setValues([['NOM','DEBUT','FIN','SEUIL']]);
        sheet.getRange(1,1,1,4).setFontWeight('bold');
      }
      // (30/07/2026) L'onglet porte les periodes de TOUTES les annees (getVacancesConfig
      // filtre par l'annee de DEBUT). L'ancienne version rasait la table entiere : preparer
      // 2028 effacait les periodes de 2027. On ne remplace desormais que l'annee visee,
      // reconnue a l'annee de sa date de debut, exactement comme a la lecture.
      const anneeCible = String(Number(payload.year) || '');
      const _an = v => (v instanceof Date)
        ? String(v.getFullYear())
        : String(v || '').trim().slice(0, 4);
      const conservees = [];
      const ancien = sheet.getDataRange().getValues();
      for (let r = 1; r < ancien.length; r++) {
        const nom = String(ancien[r][0]).trim();
        if (!nom) continue;
        if (anneeCible && _an(ancien[r][1]) === anneeCible) continue;   // remplacee
        conservees.push([ancien[r][0], ancien[r][1], ancien[r][2], Number(ancien[r][3]) || 8]);
      }
      const nouvelles = periodes.map(p => [p.nom, p.debut, p.fin, Number(p.seuil) || 8]);
      // Filet : sans annee ciblee, on refuse de vider une table pleine.
      if (!anneeCible && !nouvelles.length && ancien.length > 1) {
        return _error('Refus : aucune période fournie, la table ne sera pas vidée');
      }
      const finales = anneeCible ? conservees.concat(nouvelles) : nouvelles;
      if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
      if (finales.length > 0) sheet.getRange(2, 1, finales.length, 4).setValues(finales);
      logAction(`savePeriodes${anneeCible ? ' ' + anneeCible : ''} : ${nouvelles.length} période(s) écrite(s), ${conservees.length} conservée(s)`);
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveGroupes') {
      if (user.role !== 'admin') return _deny();
      const groupes = payload.groupes;
      if (!groupes) return _error('Données invalides');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName('GROUPES_VAC');
      if (!sheet) {
        sheet = ss.insertSheet('GROUPES_VAC');
        sheet.getRange(1,1,1,3).setValues([['GROUPE','MEDECIN_ID','ORDRE']]);
        sheet.getRange(1,1,1,3).setFontWeight('bold');
      }
      const rows = [];
      ['A','B','C'].forEach(grp => {
        (groupes[grp]||[]).forEach((mar, idx) => rows.push([grp, mar.id, idx+1]));
      });
      // (30/07/2026) Filet : un payload vide effacait GROUPES_VAC en silence, et le
      // wizard affichait « ✓ Groupes sauvegardes ». Cas reel : lecture initiale ratee,
      // wizGroupes reste {A:[],B:[],C:[]}. On refuse plutot que d'ecraser.
      if (!rows.length && sheet.getLastRow() > 1) {
        logAction('saveGroupes REFUSE : payload vide sur une table pleine');
        return _error('Refus : aucun groupe fourni, GROUPES_VAC ne sera pas vidé');
      }
      if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
      if (rows.length > 0) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

        if (action === 'saveConfig') {
      if (user.role !== 'admin') return _deny();
      const key = String(payload.key||'').trim();
      const value = String(payload.value||'').trim();
      if (!key) return _error('Clé manquante');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('CONFIG');
      if (!sheet) return _error('Onglet CONFIG introuvable');
      const data = sheet.getDataRange().getValues();
      let found = false;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === key) {
          sheet.getRange(r+1, 2).setValue(value); found = true; break;
        }
      }
      if (!found) sheet.appendRow([key, value]);
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

        if (action === 'sendCodes') {
      if (user.role !== 'admin') return _deny();
      { const _q = _quotaEmailInsuffisant_(_marsAvecEmail_()); if (_q) return _error(_q); }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const medSheet = ss.getSheetByName('MEDECINS');
      if (!medSheet) return _error('Onglet MEDECINS introuvable');
      const data = medSheet.getDataRange().getValues();
      let sent = 0;
      const errors = [];
      // (07/2026) Les MAR non servis étaient sautés SILENCIEUSEMENT : l'écran
      // annonçait « codes envoyés » sans dire que 2 ou 3 n'avaient rien reçu.
      // On les nomme désormais, en distinguant les deux causes — « sans code »
      // est une anomalie (un MAR actif doit toujours en avoir un), « sans email »
      // est une donnée manquante connue. Les INACTIFS restent ignorés en silence.
      const sansEmail = [], sansCode = [];
      for (let r = 1; r < data.length; r++) {
        const id = String(data[r][0]).trim(), nom = String(data[r][1]).trim();
        const actif = String(data[r][3]).trim().toUpperCase() === 'O';
        const code = String(data[r][6]).trim(), email = String(data[r][7]).trim();
        if (!id || !actif) continue;
        if (!email) { sansEmail.push(nom || id); continue; }
        if (!code)  { sansCode.push(nom || id);  continue; }
        try {
          MailApp.sendEmail(Object.assign({to: email}, _mailCodeAcces_(nom, code, false)));
          sent++;
        } catch(err) { errors.push(`${nom} (${email}) : ${err.message}`); }
      }
      const skipped = sansEmail.length + sansCode.length;
      logAction(`sendCodes — ${sent} envoyés`
        + (sansEmail.length ? `, ${sansEmail.length} sans email (${sansEmail.join(', ')})` : '')
        + (sansCode.length  ? `, ${sansCode.length} SANS CODE (${sansCode.join(', ')})`   : '')
        + (errors.length    ? `, ${errors.length} erreur(s)` : ''));
      return ContentService.createTextOutput(JSON.stringify({
        success: true, sent, skipped, sansEmail, sansCode, errors
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ── BOITE DE RECEPTION (admin) ───────────────────────────────────────
    // Lecture de planningmedic@gmail.com depuis admin.html.
    // Autorisation declaree : gmail.modify (et non gmail.readonly). Motif : ouvrir un
    // message le marque LU, sans quoi le compteur de non-lus ne bougerait jamais et
    // n'aurait aucun sens pour le comite. gmail.modify n'autorise PAS la suppression
    // definitive — c'est plus etroit que l'acces large accorde jusqu'au 26/07.
    // Le script LIT et MARQUE LU, rien d'autre : il n'envoie ni ne supprime.
    // Repondre depuis l'admin reste une decision distincte, a reprendre explicitement.
    // Passe par le service avance Gmail (et non GmailApp, qui exigerait une
    // autorisation large lire/envoyer/supprimer).

    // Compteur de non-lus. Appele APRES l'affichage de l'admin, en tache de fond :
    // ne JAMAIS le mettre dans getAdminBootstrap, il ajouterait ~1 s a chaque
    // ouverture pour une fonction consultee occasionnellement.
    if (action === 'mailNonLus') {
      if (user.role !== 'admin') return _deny();
      try {
        const lab = Gmail.Users.Labels.get('me', 'INBOX');
        return ContentService.createTextOutput(JSON.stringify({
          success: true, nonLus: Number(lab.messagesUnread || 0)
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error('Lecture Gmail impossible : ' + err.message); }
    }

    // Liste des messages recus. Charge au clic sur l'enveloppe (~2-4 s).
    if (action === 'mailListe') {
      if (user.role !== 'admin') return _deny();
      try {
        const nb = Math.min(Math.max(parseInt(payload.nb) || 20, 1), 50);
        const liste = Gmail.Users.Messages.list('me', {q: 'in:inbox', maxResults: nb});
        const out = [];
        (liste.messages || []).forEach(function (ref) {
          const m = Gmail.Users.Messages.get('me', ref.id, {format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date']});
          const h = {};
          ((m.payload && m.payload.headers) || []).forEach(function (x) { h[x.name] = x.value; });
          out.push({
            id: m.id,
            de: h.From || '',
            objet: h.Subject || '(sans objet)',
            date: Number(m.internalDate || 0),
            apercu: m.snippet || '',
            nonLu: (m.labelIds || []).indexOf('UNREAD') >= 0
          });
        });
        return ContentService.createTextOutput(JSON.stringify({success: true, messages: out}))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error('Lecture Gmail impossible : ' + err.message); }
    }

    // Corps d'un message, en TEXTE BRUT uniquement.
    // ⚠️ Ne JAMAIS renvoyer le HTML du message : l'injecter dans admin.html
    // executerait du contenu venu de l'exterieur dans la page.
    if (action === 'mailMessage') {
      if (user.role !== 'admin') return _deny();
      try {
        const id = String(payload.id || '').trim();
        if (!id) return _error('Identifiant de message manquant');
        const m = Gmail.Users.Messages.get('me', id, {format: 'full'});
        const h = {};
        ((m.payload && m.payload.headers) || []).forEach(function (x) { h[x.name] = x.value; });
        // ⚠️ Gmail encode le corps en base64 « URL-safe » et SANS remplissage.
        // Utilities.base64DecodeWebSafe echoue sur ces chaines : mesure le 26/07,
        // ~2 messages sur 3 tombaient en « Impossible de decoder la chaine ».
        // On normalise donc soi-meme (caracteres URL-safe + remplissage) avant de decoder.
        const _decode = function (data) {
          try {
            let b = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b.length % 4) b += '=';
            return Utilities.newBlob(Utilities.base64Decode(b)).getDataAsString('UTF-8');
          } catch (e) { return ''; }   // une partie illisible ne doit pas perdre tout le message
        };
        // Beaucoup de messages n'ont QUE du HTML. On le recupere alors, mais on le convertit
        // en texte ICI, cote serveur : le HTML brut ne quitte jamais le script.
        const _htmlEnTexte = function (h) {
          return String(h || '')
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            // Entites numeriques puis nommees. Les mails en francais en sont pleins
            // (&eacute;, &ucirc;...) : sans cela le texte serait illisible.
            .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
            .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
            .replace(/&([a-z]+);/gi, function (t, n) {
              const E = {nbsp:' ', eacute:'é', egrave:'è', ecirc:'ê', euml:'ë', agrave:'à',
                acirc:'â', aacute:'á', ccedil:'ç', ugrave:'ù', ucirc:'û', uuml:'ü', icirc:'î',
                iuml:'ï', ocirc:'ô', ouml:'ö', oelig:'œ', aelig:'æ', Eacute:'É', Egrave:'È',
                Ecirc:'Ê', Agrave:'À', Ccedil:'Ç', Ocirc:'Ô', Ucirc:'Û',
                laquo:'«', raquo:'»', deg:'°', euro:'€', hellip:'…', middot:'·',
                rsquo:'\u2019', lsquo:'\u2018', ldquo:'\u201C', rdquo:'\u201D',
                ndash:'\u2013', mdash:'\u2014', apos:"'", quot:'"', lt:'<', gt:'>'};
              return Object.prototype.hasOwnProperty.call(E, n) ? E[n]
                   : (E[n.toLowerCase()] !== undefined ? E[n.toLowerCase()] : t);
            })
            .replace(/&amp;/gi, '&')            // en DERNIER : evite un double decodage
            .replace(/\n{3,}/g, '\n\n').trim();
        };
        // Parcours recursif des parties MIME.
        let texte = '', html = '';
        (function lire(p) {
          if (!p) return;
          const mt = String(p.mimeType || '');
          if (p.body && p.body.data) {
            if (mt === 'text/plain')     texte += _decode(p.body.data) + '\n';
            else if (mt === 'text/html') html  += _decode(p.body.data) + '\n';
          }
          (p.parts || []).forEach(lire);
        })(m.payload);
        if (!texte.trim() && html) texte = _htmlEnTexte(html);
        if (!texte.trim()) texte = m.snippet || '(message sans contenu lisible)';
        // Marquer comme LU (retrait du libelle UNREAD) : sans cela le compteur ne
        // bougerait jamais et serait incomprehensible pour le comite.
        // ⚠️ Ecriture GMAIL, pas Sheets : volontairement PAS dans WRITE_ACTIONS_LOCK.
        // Ce verrou protege le classeur contre les ecritures concurrentes ; l'y mettre
        // sérialiserait la lecture des messages pendant 20 s sans rien proteger.
        // L'operation est idempotente : retirer UNREAD deux fois est sans effet.
        let marque = false;
        try {
          if ((m.labelIds || []).indexOf('UNREAD') >= 0) {
            Gmail.Users.Messages.modify({removeLabelIds: ['UNREAD']}, 'me', id);
            marque = true;
          }
        } catch (e) { /* un echec de marquage ne doit JAMAIS empecher de lire */ }
        return ContentService.createTextOutput(JSON.stringify({
          success: true, de: h.From || '', objet: h.Subject || '(sans objet)',
          date: Number(m.internalDate || 0), texte: texte.trim(), marque: marque
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error('Lecture Gmail impossible : ' + err.message); }
    }

    if (action === 'diagComplet') {
      if (user.role !== 'admin') return _deny();
      const _d = diagnosticComplet();
      return ContentService.createTextOutput(JSON.stringify({ success:true, ok:_d.ok, results:_d.results }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'archiveYear') {
      if (user.role !== 'admin') return _deny();
      const yearToArchive = Number(payload.year);
      if (!yearToArchive || yearToArchive < 2026) return _error('Année invalide');
      // ── Garde-fou : l'année SUIVANTE doit être prête (W1+W2) avant de clôturer ──
      const _ssArch = SpreadsheetApp.getActiveSpreadsheet();
      const _next = yearToArchive + 1;
      if (!_ssArch.getSheetByName(`INDISPOS_${_next}`))
        return _error(`Année ${_next} non préparée : lancez d'abord « Démarrer l'année » (étape 1) avant de clôturer ${yearToArchive}.`);
      if (!_ssArch.getSheetByName(`STATS_GARDES_${_next}`))
        return _error(`Gardes ${_next} non générées : lancez d'abord la génération des gardes (étape 2) avant de clôturer ${yearToArchive}.`);
      /* ── Garde-fou de DATE (17/08/2026) ────────────────────────────────────
         Découvert la veille de la remise du code comité : les deux conditions
         ci-dessus portent sur l'EXISTENCE des onglets de l'année suivante, pas
         sur la date. Or elles étaient satisfaites dès août par le bac à sable de
         la démonstration du 4 septembre — la clôture était donc à deux clics,
         alors qu'archiver 2026 en août déplace le planning EN COURS D'USAGE et
         bascule le service sur une année fictive. C'est l'erreur la plus coûteuse
         du calendrier, et rien ne l'empêchait : le Diagnostic l'annonce, le guide
         l'écrit, mais une consigne n'est pas un verrou. Un garde-fou ne doit pas
         reposer sur la vigilance de qui clique.
         La clôture n'a de sens qu'une fois l'année suivante COMMENCÉE : le
         premier lundi de planning de _next (jamais le 1er janvier civil — voir
         getPremierJourPlanning). Avant cette date : refus net, avec le jour exact. */
      {
        const _debutNext = getPremierJourPlanning(_next);
        const _now = new Date();
        if (_now < _debutNext) {
          const _tz  = _ssArch.getSpreadsheetTimeZone();
          const _txt = Utilities.formatDate(_debutNext, _tz, 'EEEE d MMMM yyyy');
          const _j   = Math.ceil((_debutNext - _now) / 86400000);
          logAction(`archiveYear REFUSÉ — ${yearToArchive} demandée le ${Utilities.formatDate(_now, _tz, 'yyyy-MM-dd')}, avant le ${_txt}`);
          return _error(
            `Clôture refusée : l'année ${_next} n'a pas encore commencé. `
            + `La clôture de ${yearToArchive} sera possible à partir du ${_txt} (dans ${_j} jour(s)). `
            + `Archiver maintenant déplacerait le planning en cours d'usage et basculerait le service sur ${_next}. `
            + `Aucune modification n'a été faite.`);
        }
      }
      try {
        const rapport = String(archiveYear(yearToArchive) || '');
        const archiveOk = !/(^|\n)❌/.test(rapport);   // une ligne « ❌ » dans le rapport = étape échouée
        return ContentService.createTextOutput(JSON.stringify(
          archiveOk
            ? { success: true, message: rapport || `Archivage ${yearToArchive} terminé` }
            : { success: false,
                error: `Archivage ${yearToArchive} incomplet — une étape a échoué (le plus souvent le push GitHub : vérifie la clé GITHUB_TOKEN dans l'onglet CONFIG). Les onglets GSheet sont conservés, relance l'archivage après correction.`,
                rapport: rapport }
        )).setMimeType(ContentService.MimeType.JSON);
      } catch(err) {
        return _error(err.message);
      }
    }
    if (action === 'saveAffectationsMar') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  const aff = payload.affectations;
  if (!medecinId || !aff) return _error('Données manquantes');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(`AFFECTATIONS_${TEST_YEAR}`);
  if (!sheet) return _error(`Onglet AFFECTATIONS_${TEST_YEAR} introuvable`);
  const data = sheet.getDataRange().getValues();
  const vals = [];
  for (let m = 1; m <= 12; m++) vals.push(aff[m] || 'VOLANT');
  let found = false;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() === medecinId) {
      sheet.getRange(r + 1, 2, 1, 12).setValues([vals]);
      found = true; break;
    }
  }
  if (!found) {
    sheet.appendRow([medecinId, ...vals]);
  }
  logAction(`saveAffectationsMar — ${medecinId} mis à jour`);
  return ContentService.createTextOutput(JSON.stringify({success: true, created: !found}))
    .setMimeType(ContentService.MimeType.JSON);
}
if (action === 'addMedecinToGroupe') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  const groupe = String(payload.groupe || '').trim().toUpperCase();
  if (!medecinId || !['A','B','C'].includes(groupe)) return _error('Données invalides');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('GROUPES_VAC');
  if (!sheet) {
    sheet = ss.insertSheet('GROUPES_VAC');
    sheet.getRange(1,1,1,3).setValues([['GROUPE','MEDECIN_ID','ORDRE']]);
    sheet.getRange(1,1,1,3).setFontWeight('bold');
  }
  const data = sheet.getDataRange().getValues();
  // Vérifier si le MAR est déjà dans un groupe
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][1]).trim().toUpperCase() === medecinId) {
      sheet.getRange(r + 1, 1).setValue(groupe);
      logAction(`addMedecinToGroupe — ${medecinId} déplacé vers groupe ${groupe}`);
      return ContentService.createTextOutput(JSON.stringify({success: true, moved: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  // Calculer l'ordre max dans ce groupe
  let maxOrdre = 0;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() === groupe) {
      maxOrdre = Math.max(maxOrdre, Number(data[r][2]) || 0);
    }
  }
  sheet.appendRow([groupe, medecinId, maxOrdre + 1]);
  logAction(`addMedecinToGroupe — ${medecinId} ajouté au groupe ${groupe}`);
  return ContentService.createTextOutput(JSON.stringify({success: true, created: true}))
    .setMimeType(ContentService.MimeType.JSON);
}
if (action === 'resetCodeMar') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  if (!medecinId) return _error('Médecin manquant');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const medSheet = ss.getSheetByName('MEDECINS');
  if (!medSheet) return _error('Onglet MEDECINS introuvable');
  const data = medSheet.getDataRange().getValues();

  // Codes déjà pris (autres MARs + code admin) : le nouveau doit être unique,
  // sinon deux personnes partageraient un accès — ou un MAR hériterait du rôle admin.
  const pris = new Set();
  for (let r = 1; r < data.length; r++) {
    const c = String(data[r][6]).trim();
    if (c) pris.add(c.toUpperCase());
  }
  const cfgSheet = ss.getSheetByName('CONFIG');
  if (cfgSheet) {
    const cfg = cfgSheet.getDataRange().getValues();
    for (let r = 1; r < cfg.length; r++) {
      if (String(cfg[r][0]).trim() === 'ADMIN_CODE') { pris.add(String(cfg[r][1]).trim().toUpperCase()); break; }
    }
  }

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).trim().toUpperCase() !== medecinId) continue;
    const nom = String(data[r][1]).trim();
    const ancien = String(data[r][6]).trim();
    const email = String(data[r][7]).trim();
    // Email vérifié AVANT toute écriture : sans lui, on n'invalide rien.
    if (!email) return _error(`Pas d'email pour ${nom} — code inchangé.`);

    let nouveau = '';
    for (let essai = 0; essai < 50; essai++) {
      const c = generateCode();
      if (!pris.has(c.toUpperCase())) { nouveau = c; break; }
    }
    if (!nouveau) return _error('Génération impossible (collision) — code inchangé.');

    // Trace de l'ancien code AVANT écrasement (filet si l'email n'arrive pas).
    logAction(`resetCodeMar — ${nom} (${medecinId}) : ancien code ${ancien || '(vide)'} remplacé`);
    medSheet.getRange(r + 1, 7).setValue(nouveau);
    SpreadsheetApp.flush();

    try {
      MailApp.sendEmail(Object.assign({to: email}, _mailCodeAcces_(nom, nouveau, true)));
      logAction(`resetCodeMar — nouveau code envoyé à ${nom} (${email})`);
      return ContentService.createTextOutput(JSON.stringify({success: true, nom: nom}))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      // Le code EST déjà changé : le dire franchement plutôt que laisser croire à un échec sans conséquence.
      logAction(`resetCodeMar — ECHEC EMAIL ${nom} : ${err.message} — nouveau code ${nouveau}`);
      return _error(`Code changé pour ${nom} MAIS email non parti (${err.message}). Nouveau code : ${nouveau} — transmets-le en main propre.`);
    }
  }
  return _error(`Médecin ${medecinId} introuvable`);
}

if (action === 'sendCodesMar') {
  if (user.role !== 'admin') return _deny();
  const medecinId = String(payload.medecin || '').trim().toUpperCase();
  if (!medecinId) return _error('Médecin manquant');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const medSheet = ss.getSheetByName('MEDECINS');
  if (!medSheet) return _error('Onglet MEDECINS introuvable');
  const data = medSheet.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0]).trim();
    if (id.toUpperCase() !== medecinId) continue;
    const nom = String(data[r][1]).trim();
    const code = String(data[r][6]).trim();
    const email = String(data[r][7]).trim();
    if (!email) return _error(`Pas d'email pour ${nom}`);
    if (!code) return _error(`Pas de code pour ${nom}`);
    try {
      MailApp.sendEmail(Object.assign({to: email}, _mailCodeAcces_(nom, code, false)));
      logAction(`sendCodesMar — email envoyé à ${nom} (${email})`);
      return ContentService.createTextOutput(JSON.stringify({success: true, sent: 1}))
        .setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return _error(`Envoi échoué pour ${nom} : ${err.message}`);
    }
  }
  return _error(`Médecin ${medecinId} introuvable`);
}
if (action === 'getConflitsAll') {
      if (user.role !== 'admin') return _deny();
      const year = Number(payload.year) || TEST_YEAR;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const medSheet = ss.getSheetByName('MEDECINS');
      if (!medSheet) return _error('Onglet MEDECINS introuvable');
      const medData = medSheet.getDataRange().getValues();
      const actifs = [];
      for (let r = 1; r < medData.length; r++) {
        const id = String(medData[r][0]).trim();
        const actif = String(medData[r][3]).trim().toUpperCase() === 'O';
        const email = String(medData[r][7]).trim();
        if (id && actif) actifs.push({id, nom: String(medData[r][1]).trim(), email});
      }
      const conflits = [];
      actifs.forEach(mar => {
        const cfg = getVacConfig(mar.id, year);
        const periodesConflits = [];
        cfg.periodes.forEach(p => {
          if (p.joursBloqués && p.joursBloqués.length > 0) {
            periodesConflits.push({
              periode: p.nom,
              debut: p.debut,
              fin: p.fin,
              joursBloqués: p.joursBloqués,
              joursDisponibles: p.joursDisponibles,
            });
          }
        });
        if (periodesConflits.length > 0) {
          conflits.push({
            id: mar.id,
            nom: mar.nom,
            email: mar.email,
            periodesConflits,
          });
        }
      });
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        conflits,
        total: actifs.length,
        nbConflits: conflits.length,
        nbResolus: actifs.length - conflits.length,
      })).setMimeType(ContentService.MimeType.JSON);
    }

        if (action === 'envoyerRecapIndispos') {
      // (Remplace l'ancien récap indispos) — Récapitulatif des GARDES attribuées (G réa / G2 mat).
      if (user.role !== 'admin') return _deny();
      { const _q = _quotaEmailInsuffisant_(_marsAvecEmail_()); if (_q) return _error(_q); }
      const year = Number(payload.year) || TEST_YEAR;
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const medSheet = ss.getSheetByName('MEDECINS');
      if (!medSheet) return _error('Onglet MEDECINS introuvable');
      const medData = medSheet.getDataRange().getValues();

      const gardesSheet = ss.getSheetByName(`GARDES_${year}`);
      if (!gardesSheet) return _error(`Onglet GARDES_${year} introuvable`);
      const gData = gardesSheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(gData, year);
      const colToDate = {};
      Object.keys(dateToCol).forEach(d => { colToDate[dateToCol[d]] = d; });

      // Fériés : Set (depuis getJoursFeries déjà déployé) pour savoir QUELS jours, + mapping nom local (mêmes calculs).
      const feriesSet = getJoursFeries(year), feriesSetN = getJoursFeries(year + 1);
      const isF = d => feriesSet.has(d) || feriesSetN.has(d);
      const feriesNamed = (y) => {
        const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
        const h=(19*a+b-d-g+15)%30,ii=Math.floor(c/4),k=c%4,l=(32+2*e+2*ii-h-k)%7,mm=Math.floor((a+11*h+22*l)/451);
        const mo=Math.floor((h+l-7*mm+114)/31), da=((h+l-7*mm+114)%31)+1;
        const paques=new Date(y,mo-1,da,12,0,0);
        const fmt=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        const add=(dt,n)=>{const x=new Date(dt);x.setDate(x.getDate()+n);return fmt(x);};
        const fix=(m2,d2)=>{const dt=new Date(y,m2-1,d2,12,0,0);if(dt.getDay()===0)dt.setDate(dt.getDate()+1);return fmt(dt);};
        const plain=(m2,d2)=>`${y}-${String(m2).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;
        const M={};
        M[fix(1,1)]='Jour de l\'An'; M[plain(1,27)]='Sainte Dévote'; M[fix(5,1)]='Fête du Travail';
        M[fix(8,15)]='Assomption'; M[fix(11,1)]='Toussaint'; M[fix(11,19)]='Fête du Prince';
        M[fix(12,8)]='Immaculée Conception'; M[fix(12,25)]='Noël';
        M[add(paques,1)]='Lundi de Pâques'; M[add(paques,39)]='Ascension'; M[add(paques,50)]='Lundi de Pentecôte'; M[add(paques,60)]='Fête-Dieu';
        return M;
      };
      const fnames = Object.assign({}, feriesNamed(year), feriesNamed(year + 1));

      const site = 'https://planningmedic.github.io/';
      const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
      const MOIS  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const dd = n => String(n).padStart(2,'0');

      let sent = 0, skipped = 0;
      const errors = [];

      for (let r = 1; r < medData.length; r++) {
        const id = String(medData[r][0]).trim();
        const nom = String(medData[r][1]).trim();
        const actif = String(medData[r][3]).trim().toUpperCase() === 'O';
        const email = String(medData[r][7]).trim();
        if (!id || !actif) continue;
        if (!email) { skipped++; continue; }

        // Gardes du MAR (G / G2 uniquement)
        const gardes = [];
        for (let ri = 3; ri < gData.length; ri++) {
          if (String(gData[ri][0]).trim() !== id) continue;
          Object.keys(colToDate).forEach(col => {
            const date = colToDate[col];
            const val = String(gData[ri][Number(col)] || '').trim().toUpperCase();
            if (val === 'G' || val === 'G2') gardes.push({ date, type: val });
          });
          break;
        }
        gardes.sort((x,y2) => x.date < y2.date ? -1 : (x.date > y2.date ? 1 : 0));

        let nRea=0, nMat=0, nWe=0, nFer=0;
        const byMonth = {};
        gardes.forEach(gg => {
          const dt = new Date(gg.date + 'T12:00:00'), dw = dt.getDay();
          if (gg.type === 'G') nRea++; else nMat++;
          if (dw === 0 || dw === 5 || dw === 6) nWe++;   // même définition que le marquage
          if (isF(gg.date)) nFer++;
          const mo = Number(gg.date.slice(5,7)) - 1;
          (byMonth[mo] = byMonth[mo] || []).push(gg);
        });

        /* (25/08/2026) Récapitulatif des souhaits, demandé par Arthur : c'est ici
           qu'il a sa place, dans le mail que chacun reçoit et garde — plutôt que
           dans un bandeau du portail qu'on ferme et qu'on oublie. Colonnes lues
           PAR NOM : absentes des plannings générés avant cette date, d'où le repli
           silencieux (aucun encadré affiché). */
        let souhaitsHtml = '', souhaitsTexte = '';
        try {
          const _stS = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('STATS_GARDES_' + year);
          if (_stS && _stS.getLastRow() > 1) {
            const _sd = _stS.getDataRange().getValues();
            const _sh = _sd[0].map(function (x) { return String(x).trim(); });
            const _iP = _sh.indexOf('SOUHAITS POSES'), _iH = _sh.indexOf('SOUHAITS HONORES');
            if (_iP >= 0 && _iH >= 0) {
              for (let _r = 1; _r < _sd.length; _r++) {
                if (String(_sd[_r][0]).trim() !== String(id).trim()) continue;
                const _p = Number(_sd[_r][_iP]) || 0, _h = Number(_sd[_r][_iH]) || 0;
                if (!_p) break;                       // aucun souhait posé : on ne dit rien
                const _tous = (_h === _p);
                souhaitsHtml =
                  '<div style="background:' + (_tous ? '#ecfdf5' : '#f8fafc') + ';border:1px solid '
                  + (_tous ? '#cdeee6' : '#eef1f5') + ';border-radius:12px;padding:13px 16px;margin-bottom:22px">'
                  + '<div style="font-size:13px;color:' + (_tous ? '#0d9488' : '#334155')
                  + ';font-weight:700">' + (_tous ? '✓ ' : '') + 'Souhaits : ' + _h + ' retenu'
                  + (_h > 1 ? 's' : '') + ' sur ' + _p + '</div></div>';
                souhaitsTexte = 'Souhaits : ' + _h + ' retenu' + (_h > 1 ? 's' : '') + ' sur ' + _p + '.\n';
                break;
              }
            }
          }
        } catch (eS) { /* le récapitulatif des souhaits est un confort, jamais bloquant */ }

        // ---------- HTML ----------
        const chips =
          `<span style="display:inline-block;background:#eef4ff;color:#1d4ed8;border:1px solid #dbe6ff;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nRea} réanimation</span>` +
          `<span style="display:inline-block;background:#ecfdf5;color:#0d9488;border:1px solid #cdeee6;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nMat} maternité</span>` +
          (nWe ? `<span style="display:inline-block;background:#fff7ed;color:#c2410c;border:1px solid #fde3cf;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nWe} jour${nWe>1?'s':''} de week-end</span>` : '') +
          (nFer ? `<span style="display:inline-block;background:#fef2f2;color:#b91c1c;border:1px solid #fbd5d5;border-radius:999px;font-size:12px;font-weight:700;padding:4px 11px;margin:0 6px 6px 0">${nFer} férié${nFer>1?'s':''}</span>` : '');

        let rowsHtml = '';
        /* (26/08/2026) Un week-end de garde (vendredi + dimanche, même binôme) est
           présenté dans UN SEUL encadré : deux lignes séparées donnaient une liste
           hachée où rien ne disait que les deux dates allaient ensemble. Les jours
           sont d'abord regroupés en UNITÉS, puis rangés au mois du vendredi — un
           week-end à cheval sur deux mois reste donc d'un seul tenant. */
        const parDate = {};
        gardes.forEach(gg => { parDate[gg.date] = gg; });
        const dPlus = (ds, n) => {
          const x = new Date(ds + 'T12:00:00'); x.setDate(x.getDate() + n);
          return `${x.getFullYear()}-${dd(x.getMonth()+1)}-${dd(x.getDate())}`;
        };
        const pris = {};
        const unites = [];
        gardes.slice().sort((a,b) => a.date < b.date ? -1 : 1).forEach(gg => {
          if (pris[gg.date]) return;
          const dw = new Date(gg.date + 'T12:00:00').getDay();
          if (dw === 5) {
            const dim = dPlus(gg.date, 2), gd = parDate[dim];
            /* (26/08/2026) On lie dès qu'il y a garde le vendredi ET le dimanche : c'est
               le WEEK-END qui compte. Le rôle peut différer entre les deux jours (après
               un échange, par exemple) — chaque ligne porte le sien, le cadre les réunit
               quand même. Exiger le même rôle aurait dissocié ces week-ends à l'affichage. */
            if (gd && !pris[dim]) {
              pris[gg.date] = pris[dim] = 1;
              unites.push({ we: true, jours: [gg, gd] });
              return;
            }
          }
          pris[gg.date] = 1;
          unites.push({ we: false, jours: [gg] });
        });

        const parMois = {};
        unites.forEach(u => {
          const mo = Number(u.jours[0].date.slice(5,7)) - 1;
          (parMois[mo] = parMois[mo] || []).push(u);
        });

        const badgeDe = t => t === 'G'
          ? '<span style="display:inline-block;background:#eef4ff;color:#1d4ed8;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G &middot; Réa</span>'
          : '<span style="display:inline-block;background:#ecfdf5;color:#0d9488;border-radius:7px;font-size:12px;font-weight:700;padding:4px 10px">G2 &middot; Mat</span>';
        const libelle = ds => {
          const dt = new Date(ds + 'T12:00:00');
          return `${JOURS[dt.getDay()]} ${dd(dt.getDate())}/${dd(dt.getMonth()+1)}`;
        };

        Object.keys(parMois).map(Number).sort((p,q)=>p-q).forEach(mo => {
          rowsHtml += `<div style="font-size:12px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#94a3b8;margin:18px 0 8px 2px">${MOIS[mo]}</div>`;
          parMois[mo].forEach(u => {
            if (u.we) {
              /* Chaque jour garde SA ligne (sa date, son rôle) ; c'est le cadre qui les
                 réunit — le vendredi et le dimanche sont un seul week-end de garde. */
              rowsHtml += `<div style="border:1px solid #fde3cf;background:#fffaf5;border-radius:10px;padding:8px 12px 4px;margin-bottom:7px">`
                + `<div style="font-size:10.5px;font-weight:800;color:#c2410c;letter-spacing:.3px;margin-bottom:2px">WEEK-END</div>`
                + u.jours.map((g, i) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;`
                    + `${i ? 'border-top:1px solid #fde3cf;' : ''}">`
                    + `<span style="font-size:14px;font-weight:700;color:#0f172a">${libelle(g.date)}</span>`
                    + `${badgeDe(g.type)}</div>`).join('')
                + `</div>`;
              return;
            }
            const gg = u.jours[0];
            const dw = new Date(gg.date + 'T12:00:00').getDay();
            const ferie = isF(gg.date), sam = (dw === 6);
            let rowStyle = 'border:1px solid #eef1f5;', tag = '';
            if (ferie) {
              const nm = fnames[gg.date];
              rowStyle = 'border:1px solid #fbd5d5;background:#fef6f6;';
              tag = `<span style="font-size:10.5px;font-weight:700;color:#b91c1c;background:#fdeaea;border-radius:5px;padding:2px 7px">Férié${nm?' &middot; '+nm:''}</span>`;
            } else if (sam) {
              rowStyle = 'border:1px solid #fde3cf;background:#fffaf5;';
              tag = '<span style="font-size:10.5px;font-weight:700;color:#c2410c;background:#fff1e6;border-radius:5px;padding:2px 7px">Samedi</span>';
            }
            rowsHtml += `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;${rowStyle}border-radius:10px;margin-bottom:7px"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:14px;font-weight:700;color:#0f172a">${libelle(gg.date)}</span>${tag}</div>${badgeDe(gg.type)}</div>`;
          });
        });

        const coreHtml = gardes.length ? (summaryHtml + souhaitsHtml + rowsHtml) : (emptyHtml + souhaitsHtml);

        const html =
          '<div style="background:#e9edf1;padding:0;margin:0">' +
          '<div style="max-width:600px;margin:0 auto;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif">' +
            '<div style="background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e3e8ef">' +
              '<div style="background:#0f172a;padding:22px 26px">' +
                '<div style="color:#cbd5e1;font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase">Planning-Med</div>' +
                '<div style="color:#ffffff;font-size:23px;font-weight:800;margin-top:12px">Vos gardes ' + year + '</div>' +
                '<div style="color:#94a3b8;font-size:14px;margin-top:3px">' + nom + '</div>' +
              '</div>' +
              '<div style="padding:22px 26px 8px">' +
                '<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#334155">Bonjour ' + nom + ',<br>Le planning ' + year + ' vient d\'être généré. Voici vos gardes pour l\'année — à reporter dans votre agenda.</p>' +
                coreHtml +
                '<div style="border-top:1px solid #eef1f5;margin:8px 0 18px"></div>' +
                '<div style="text-align:center"><a href="' + site + '" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px">Voir le planning complet &rarr;</a>' +
                '<p style="margin:14px 0 0;font-size:12px;color:#9aa4b2;line-height:1.5">Une erreur ou un échange à signaler ? Contactez le comité planning.</p></div>' +
              '</div>' +
              '<div style="background:#f8fafc;border-top:1px solid #eef1f5;padding:14px;text-align:center"><div style="font-size:11px;color:#9aa4b2">Le Comité Planning-Med</div></div>' +
            '</div>' +
          '</div>' +
          '</div>';

        // ---------- Texte brut (repli) ----------
        let bodyText = 'Bonjour ' + nom + ',\n\nLe planning ' + year + ' vient d\'être généré. Voici vos gardes :\n\n';
        if (souhaitsTexte) bodyText += souhaitsTexte + '\n';
        if (!gardes.length) {
          bodyText += 'Aucune garde programmée pour vous en ' + year + '.\n';
        } else {
          bodyText += gardes.length + ' garde' + (gardes.length>1?'s':'') + ' — ' + nRea + ' réa / ' + nMat + ' mat'
            + (nWe ? ' \u00b7 ' + nWe + ' jour' + (nWe>1?'s':'') + ' de week-end' : '')
            + (nFer ? ' \u00b7 ' + nFer + ' férié' + (nFer>1?'s':'') : '') + '\n\n';
          Object.keys(byMonth).map(Number).sort((p,q)=>p-q).forEach(mo => {
            bodyText += MOIS[mo] + ' :\n';
            byMonth[mo].forEach(gg => {
              const dt = new Date(gg.date + 'T12:00:00'), dw = dt.getDay();
              const nm = fnames[gg.date];
              const tag = isF(gg.date) ? ' [Férié' + (nm?' '+nm:'') + ']' : ((dw===0||dw===5||dw===6) ? ' [week-end]' : '');
              bodyText += '  ' + JOURS[dw] + ' ' + dd(dt.getDate()) + '/' + dd(mo+1) + ' \u2014 ' + (gg.type==='G'?'G (réa)':'G2 (mat)') + tag + '\n';
            });
          });
        }
        bodyText += '\nVoir le planning : ' + site + '\n\nLe Comité Planning-Med';

        try {
          MailApp.sendEmail({
            to: email,
            subject: `[Planning-Med ${year}] Vos gardes ${year}`,
            htmlBody: html,
            body: bodyText,
          });
          sent++;
        } catch(err) {
          errors.push(`${nom} : ${err.message}`);
        }
      }

      logAction(`envoyerRecapGardes ${year} — ${sent} emails, ${skipped} sans email, ${errors.length} erreur(s)`);
      return ContentService.createTextOutput(JSON.stringify({
        success: true, sent, skipped, errors
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'setIndisposYear') {
      if (user.role !== 'admin') return _deny();
      const newYear = Number(payload.year);
      if (!newYear || newYear < 2026) return _error('Année invalide');
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('CONFIG');
      if (!sheet) return _error('CONFIG introuvable');
      const data = sheet.getDataRange().getValues();
      let found = false;
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
          sheet.getRange(r+1, 2).setValue(newYear);
          found = true; break;
        }
      }
      if (!found) sheet.appendRow(['INDISPOS_ACTIVE', newYear]);
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      logAction(`setIndisposYear → ${newYear}`);
      return ContentService.createTextOutput(JSON.stringify({success:true, year:newYear}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'clearIndisposYear') {
      if (user.role !== 'admin') return _deny();
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName('CONFIG');
      if (!sheet) return _error('CONFIG introuvable');
      const data = sheet.getDataRange().getValues();
      for (let r = 1; r < data.length; r++) {
        if (String(data[r][0]).trim() === 'INDISPOS_ACTIVE') {
          sheet.deleteRow(r+1); break;
        }
      }
      _configReset_();   // CONFIG modifie : le memo doit repartir a zero
      logAction('clearIndisposYear — INDISPOS_ACTIVE supprimée');
      return ContentService.createTextOutput(JSON.stringify({success:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

// ── ACTION : savePlanningOverride ─────────────────────────────────────
// Appelé quand le comité place un MAR dans une case flash
// payload : { action, code, date, marId, morning, afternoon, comment }
if (action === 'savePlanningOverride') {
  if (user.role !== 'admin') return _deny();
  const { date, marId, morning, afternoon, comment } = payload;
  if (!date || !marId) return _error('date et marId requis');
  try {
    // Passer morning/afternoon TELS QUELS : null ou '' = « demi-jour non modifié »
    // (savePlanningOverride ne touchera alors pas cette colonne). Plus de recopie matin→aprem.
    savePlanningOverride(date, marId, morning, afternoon, comment || '');
    logAction(`savePlanningOverride — ${marId} le ${date} → ${morning}`);
    return ContentService.createTextOutput(JSON.stringify({success: true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return _error(e.message);
  }
}


// ── ACTION : savePlanningOverridesBatch ───────────────────────────────
// Toute une rafale de placements du comité en UN appel (>20 par session mesurés).
// payload : { action, code, items:[{date, marId, morning, afternoon, comment}, …] }
// Exclue de WRITE_ACTIONS_LOCK comme l'unitaire : verrou dédié dans code.gs
// (même verrou de script → exclusion mutuelle avec l'unitaire et deleteOverride).
if (action === 'savePlanningOverridesBatch') {
  if (user.role !== 'admin') return _deny();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return _error('items requis');
  try {
    const res = savePlanningOverridesBatch(items);
    logAction(`savePlanningOverridesBatch — ${res.saved} placement(s) (${items.length} item(s) reçus)`);
    return ContentService.createTextOutput(JSON.stringify({success: true, saved: res.saved}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return _error(e.message);
  }
}


// ── ACTION : getPanneauSemaine ────────────────────────────────────────
// (28/07/2026) UN SEUL APPEL POUR TOUTE LA SEMAINE.
// Mesure du jour : une requete qui ne fait RIEN (17 ms de travail) coute 2 a 3 s
// d'attente a la porte d'entree Google — identique sur un deploiement neuf, donc
// hors de notre controle. Le seul levier est de payer ce peage moins souvent.
// Le panneau de placement coutait 2 appels PAR JOUR ouvert (dispos + liberal) ;
// il n'en coute plus qu'UN pour les 7 jours, lance en arriere-plan des l'affichage
// de la semaine. Au clic, le panneau s'ouvre sans aucun appel.
// Le surcout serveur est faible : les onglets (GARDES, AFFECTATIONS, MEDECINS)
// sont lus UNE fois pour les 7 jours, la ou getMARsDispoJour les relisait a chaque
// appel. Seule la boucle par jour se repete, sur des donnees deja en memoire.
// payload : { action, code, dates:[ '2026-08-03', … ] }  (1 a 10 dates)
if (action === 'getPanneauSemaine') {
  if (user.role !== 'admin') return _deny();
  const dates = Array.isArray(payload.dates) ? payload.dates.map(function(d){ return String(d||'').trim(); }).filter(Boolean) : [];
  if (!dates.length) return _error('dates requises');
  if (dates.length > 10) return _error('10 dates maximum');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Une seule annee par appel : la semaine a cheval sur deux annees civiles reste
    // dans la meme annee de planning (GARDES_{Y} couvre jusqu'a debut janvier).
    const year = Number(dates[0].slice(0,4));
    const gardesSheet = ss.getSheetByName('GARDES_' + year);
    if (!gardesSheet) return _error('GARDES_' + year + ' introuvable');

    // ── Lectures MUTUALISEES : une fois pour les 7 jours ──
    const gardesData = gardesSheet.getDataRange().getValues();
    const dateToCol  = buildDateToCol(gardesData, year);
    const affSheet   = ss.getSheetByName('AFFECTATIONS_' + year);
    const affData    = affSheet ? affSheet.getDataRange().getValues() : null;
    const medSheet   = ss.getSheetByName('MEDECINS');
    const actifs = [];
    const initMap = {};
    if (medSheet) {
      const medData = medSheet.getDataRange().getValues();
      for (let r = 1; r < medData.length; r++) {
        const id = String(medData[r][0]).trim();
        if (!id) continue;
        initMap[id] = String(medData[r][2] || '').trim();
        if (String(medData[r][3]).trim().toUpperCase() === 'O') actifs.push(id);
      }
    }
    const FLAGS = getMedecinFlags();
    // Affectations par mois : memoisees, la semaine ne couvre au plus que deux mois.
    const affParMois = {};
    const _affDuMois = function (monthIdx) {
      if (affParMois[monthIdx]) return affParMois[monthIdx];
      const m = {};
      if (affData) {
        for (let r = 1; r < affData.length; r++) {
          const id = String(affData[r][0]).trim();
          if (!id) continue;
          m[id] = normalizeAffectation(String(affData[r][monthIdx] || '').trim().toUpperCase());
        }
      }
      affParMois[monthIdx] = m;
      return m;
    };
    /* (04/08/2026, etage 2) CŒUR PARTAGÉ — la logique de tri vit desormais
       dans calculerDispoJour (fichier `dispo_jour`, source unique du depot :
       partage/dispo_jour.js, incluse A L'IDENTIQUE cote frontend).
       Equivalence prouvee par test-oracle (400 cas) avant extraction.
       Toute evolution du tri se fait LA-BAS et se deploie des deux cotes. */
    const jours = {};
    dates.forEach(function (targetDate) {
      const colIdx = dateToCol[targetDate];
      if (colIdx === undefined) { jours[targetDate] = {dispo: [], absent: true}; return; }
      const codeById = {};
      for (let r = 3; r < gardesData.length; r++) {
        const gid = String(gardesData[r][0]).trim();
        if (gid) codeById[gid] = String(gardesData[r][colIdx] || '').trim().toUpperCase();
      }
      jours[targetDate] = { dispo: calculerDispoJour(targetDate, {
        actifs: actifs, initiales: initMap,
        affectationDuMois: _affDuMois(new Date(targetDate + 'T12:00:00').getMonth() + 1),
        codeById: codeById, flags: FLAGS,
      }) };
    });

    // ── Liberal : l'onglet LIBERAL_{Y} lu UNE fois pour les 7 jours ──
    // (listLiberalJour le relisait entierement a chaque jour ouvert)
    const liberal = {};
    dates.forEach(function (d) { liberal[d] = []; });
    try {
      // ⚠️ Une semaine peut chevaucher DEUX annees civiles (28/12 → 03/01), et les
      // declarations sont rangees par annee civile de la DATE DE BLOC. Lire le seul
      // onglet du lundi faisait disparaitre les interventions de janvier (mesure du
      // 29/07/2026 : 3 jours en 2026→2027, 6 en 2029→2030). On lit chaque annee
      // presente dans la semaine. (Ici c'est bien l'annee CIVILE, pas anneePlanning :
      // les onglets LIBERAL_{Y} suivent le releve, qui est calendaire.)
      const _libAns = {};
      dates.forEach(function (d) { _libAns[_libYearOf(d)] = true; });
      Object.keys(_libAns).forEach(function (_an) {
        const libSh = ss.getSheetByName(_libSheetName(Number(_an)));
        if (!libSh) return;
        const libData = libSh.getDataRange().getValues();
        for (let r = 1; r < libData.length; r++) {
          const dBloc = _isoDate(libData[r][2]);
          if (!liberal.hasOwnProperty(dBloc)) continue;
          liberal[dBloc].push({
            id:         String(libData[r][0]),
            marId:      String(libData[r][3]).trim(),
            secteur:    String(libData[r][4]).trim().toUpperCase(),
            chirurgie:  String(libData[r][5] || '').trim(),
            specialite: String(libData[r][6] || '').trim().toUpperCase(),
            brCcam:     _libMoney_(libData[r][7]),
            brNgap:     _libMoney_(libData[r][8]),
          });
        }
      });
      Object.keys(liberal).forEach(function (d) {
        liberal[d].sort(function (a, b) { return String(a.marId).localeCompare(String(b.marId)); });
      });
    } catch(e) {
      // Le volet liberal est un confort : son echec ne doit jamais priver le comite
      // des dispos. On renvoie des listes vides plutot qu'une erreur.
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true, dates: dates, jours: jours, liberal: liberal
    })).setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return _error(e.message);
  }
}

// ── ACTION : getMARsDispoJour ─────────────────────────────────────────
// Retourne les MARs disponibles un jour donné pour le popup "combler case flash"
// Groupés par rôle : VOLANT / CTP / R / autres présents
// payload : { action, code, date }
if (action === 'getMARsDispoJour') {
  if (user.role !== 'admin') return _deny();
  const targetDate = String(payload.date || '').trim();
  if (!targetDate) return _error('date requise');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const year = Number(targetDate.slice(0,4));
  const gardesSheet = ss.getSheetByName(`GARDES_${year}`);
  if (!gardesSheet) return _error(`GARDES_${year} introuvable`);

  const gardesData = gardesSheet.getDataRange().getValues();
  const dateToCol = buildDateToCol(gardesData, year);
  const colIdx = dateToCol[targetDate];
  if (colIdx === undefined) return _error(`Date ${targetDate} introuvable dans GARDES_${year}`);

  const affSheet = ss.getSheetByName(`AFFECTATIONS_${year}`);
  const medSheet = ss.getSheetByName('MEDECINS');

  // Lire l'affectation de chaque MAR
  const affMap = {}; // marId → secteur
  if (affSheet) {
    const affData = affSheet.getDataRange().getValues();
    const dt = new Date(targetDate + 'T12:00:00');
    const monthIdx = dt.getMonth() + 1; // 1-12
    for (let r = 1; r < affData.length; r++) {
      const id = String(affData[r][0]).trim();
      if (!id) continue;
      // Colonne du mois (1=JAN, 2=FEV, ... 12=DEC)
      affMap[id] = normalizeAffectation(String(affData[r][monthIdx] || '').trim().toUpperCase());
    }
  }

  // Lire les actifs depuis MEDECINS
  const actifs = new Set();
  const initMap = {};
  if (medSheet) {
    const medData = medSheet.getDataRange().getValues();
    for (let r = 1; r < medData.length; r++) {
      const id = String(medData[r][0]).trim();
      if (!id) continue;
      initMap[id] = String(medData[r][2] || '').trim();   // colonne INITIALES
      if (String(medData[r][3]).trim().toUpperCase() === 'O') actifs.add(id);
    }
  }

  const FLAGS = getMedecinFlags(); // (C2-D2) date_debut/date_fin externalisées → MEDECINS

  // (C2-D2) Index des codes GARDES par MAR (un MAR sans ligne GARDES → code vide).
  const codeById = {};
  for (let r = 3; r < gardesData.length; r++) {
    const gid = String(gardesData[r][0]).trim();
    if (gid) codeById[gid] = String(gardesData[r][colIdx] || '').trim().toUpperCase();
  }

  /* (04/08/2026, etage 2) CŒUR PARTAGÉ — meme delegation que getPanneauSemaine :
     calculerDispoJour (fichier `dispo_jour` / partage/dispo_jour.js). L'iteration
     sur l'effectif MEDECINS actifs (C2-D2) et toutes les regles (TP fixes C2-D3,
     bornes, rythme 2/2, tri VOLANT en tete) vivent dans le module. */
  const dispo = calculerDispoJour(targetDate, {
    actifs: Array.from(actifs), initiales: initMap,
    affectationDuMois: affMap, codeById: codeById, flags: FLAGS,
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true, date: targetDate, dispo
  })).setMimeType(ContentService.MimeType.JSON);
}
if (action === 'sendCodesWithRecap') {
  if (user.role !== 'admin') return _deny();
  { const _q = _quotaEmailInsuffisant_(_marsAvecEmail_()); if (_q) return _error(_q); }
  const indYear = Number(payload.year) || getIndisposYear();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const medSheet = ss.getSheetByName('MEDECINS');
  if (!medSheet) return _error('Onglet MEDECINS introuvable');
  const medData = medSheet.getDataRange().getValues();

  const perSheet = ss.getSheetByName('PERIODES_VAC');
  const periodes = [];
  if (perSheet) {
    const perData = perSheet.getDataRange().getValues();
    for (let r = 1; r < perData.length; r++) {
      const nom = String(perData[r][0]).trim();
      if (!nom) continue;
      const dr = perData[r][1], fr = perData[r][2];
      const debut = dr instanceof Date
        ? dr.getFullYear()+'-'+String(dr.getMonth()+1).padStart(2,'0')+'-'+String(dr.getDate()).padStart(2,'0')
        : String(dr).trim();
      const fin = fr instanceof Date
        ? fr.getFullYear()+'-'+String(fr.getMonth()+1).padStart(2,'0')+'-'+String(fr.getDate()).padStart(2,'0')
        : String(fr).trim();
      periodes.push({nom, debut, fin});
    }
  }

  const indSheet = ss.getSheetByName('INDISPOS_'+indYear);
  if (!indSheet) return _error('INDISPOS_'+indYear+' introuvable');
  const indData = indSheet.getDataRange().getValues();

  const dates = reconstruireDatesHeaders(indData, indYear); // (C3b) helper unifié

  function fmtDate(ds) {
    const d = new Date(ds+'T12:00:00');
    return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
  }
const MOIS_ABR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  function fmtJour(ds){ const d=new Date(ds+'T12:00:00'); return d.getDate()+' '+MOIS_ABR[d.getMonth()]; }
  function fmtPlage(a,b){
    if(a===b) return fmtJour(a);
    const da=new Date(a+'T12:00:00'), db=new Date(b+'T12:00:00');
    if(da.getMonth()===db.getMonth()) return da.getDate()+' → '+db.getDate()+' '+MOIS_ABR[db.getMonth()];
    return fmtJour(a)+' → '+fmtJour(b);
  }
  const pillV = t => '<span style="display:inline-block;background:#eef4fb;border:1px solid #cfe0f2;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:600;color:#1d6fb8;margin:0 5px 5px 0;white-space:nowrap">'+t+'</span>';
  const pillF = t => '<span style="display:inline-block;background:#fdf3e3;border:1px solid #f2d98a;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:600;color:#b45309;margin:0 5px 5px 0;white-space:nowrap">'+t+'</span>';

  let sent = 0, skipped = 0;
  const errors = [];

  for (let r = 1; r < medData.length; r++) {
    const id    = String(medData[r][0]).trim();
    const nom   = String(medData[r][1]).trim();
    const actif = String(medData[r][3]).trim().toUpperCase() === 'O';
    const code  = String(medData[r][6]).trim();
    const email = String(medData[r][7]).trim();
    if (!id || !actif) continue;
    if (!email) { skipped++; continue; }

    const marVAC = {}, marFORM = {};
    for (let ri = 3; ri < indData.length; ri++) {
      if (String(indData[ri][0]).trim() !== id) continue;
      dates.forEach((date, i) => {
        if (!date) return;
        const val = String(indData[ri][i+1]||'').trim();
        if (val === 'VAC') marVAC[date] = true;
        else if (val === 'FORM') marFORM[date] = true;
      });
      break;
    }

    const _TV2={label:'Vacances',bg:'#eef4fb',fg:'#1d6fb8'}, _TF2={label:'Formation',bg:'#fdf3e3',fg:'#b45309'};
    const _blocks2 = []; let vacText = '';
    periodes.forEach(p => {
      const jV = Object.keys(marVAC).filter(d => d >= p.debut && d <= p.fin).sort();
      const jF = Object.keys(marFORM).filter(d => d >= p.debut && d <= p.fin).sort();
      if (!jV.length && !jF.length) return;
      _blocks2.push({title:p.nom, rows:[
        {label:_TV2.label,bg:_TV2.bg,fg:_TV2.fg,dates:jV},
        {label:_TF2.label,bg:_TF2.bg,fg:_TF2.fg,dates:jF},
      ]});
      if (jV.length) vacText += '  '+p.nom+' : '+jV.map(fmtJour).join(', ')+'\n';
    });
    const _hV2 = Object.keys(marVAC).filter(d => !periodes.some(p => d >= p.debut && d <= p.fin)).sort();
    const _hF2 = Object.keys(marFORM).filter(d => !periodes.some(p => d >= p.debut && d <= p.fin)).sort();
    if (_hV2.length || _hF2.length) {
      _blocks2.push({title:'Hors périodes', rows:[
        {label:_TV2.label,bg:_TV2.bg,fg:_TV2.fg,dates:_hV2},
        {label:_TF2.label,bg:_TF2.bg,fg:_TF2.fg,dates:_hF2},
      ]});
      if (_hV2.length) vacText += '  Autres : '+_hV2.map(fmtJour).join(', ')+'\n';
    }
    const formKeys = Object.keys(marFORM).sort();
    const nbVAC = Object.keys(marVAC).length;
    const nbFORM = formKeys.length;
    const link = 'https://planningmedic.github.io/indispos.html';
    const congesBlocks = renderRecapMailBlocks_([
      {n:nbVAC,label:'jours vacances',bg:'#eef4fb',fg:'#1d6fb8'},
      {n:nbFORM,label:'jours formation',bg:'#fdf3e3',fg:'#b45309'},
    ], _blocks2);

    const html =
      '<div style="background:#f4f6f9;padding:0;margin:0">'+
      '<div style="max-width:560px;margin:0 auto;padding:24px 14px;font-family:Arial,Helvetica,sans-serif">'+
        '<div style="background:#ffffff;border:1px solid #e3e8ef;border-radius:14px;overflow:hidden">'+
          '<div style="background:#ce1126;padding:18px 22px">'+
            '<div style="color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Planning-Med · Anesthésie-Réanimation</div>'+
            '<div style="color:#ffffff;font-size:19px;font-weight:700;margin-top:4px">Vos congés &amp; ouverture des indispos '+indYear+'</div>'+
          '</div>'+
          '<div style="padding:22px">'+
            '<p style="margin:0 0 18px;font-size:14px;color:#3a4759">Bonjour <strong>'+nom+'</strong>,</p>'+
            '<div style="font-size:13px;font-weight:700;color:#16202e;margin-bottom:12px">📋 Vos congés posés au staff</div>'+
            congesBlocks+
            '<div style="border-top:1px solid #eef1f5;margin:22px 0 16px"></div>'+
            '<div style="font-size:13px;font-weight:700;color:#16202e;margin-bottom:10px">🔓 Saisissez vos indisponibilités</div>'+
            '<p style="margin:0 0 14px;font-size:13px;color:#3a4759">La saisie est maintenant ouverte. Connectez-vous avec votre code personnel :</p>'+
            '<div style="background:#f4f6f9;border:1px solid #e3e8ef;border-radius:10px;padding:12px 16px;margin-bottom:16px">'+
              '<div style="font-size:11px;color:#697789;text-transform:uppercase;letter-spacing:.5px">Votre code d\'accès</div>'+
              '<div style="font-size:22px;font-weight:700;letter-spacing:2px;color:#ce1126;font-family:monospace">'+code+'</div>'+
            '</div>'+
            '<a href="'+link+'" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:10px">Ouvrir la saisie →</a>'+
            '<p style="margin:16px 0 0;font-size:12px;color:#9aa4b2">Conservez ce code confidentiel. En cas d\'erreur dans vos congés, contactez le comité planning.</p>'+
          '</div>'+
        '</div>'+
        '<div style="text-align:center;font-size:11px;color:#9aa4b2;margin-top:14px">Le Comité Planning-Med</div>'+
      '</div>'+
      '</div>';

    const bodyText =
      'Bonjour '+nom+',\n\n'+
      'Vos congés posés au staff '+indYear+' :\n'+
      'Vacances ('+nbVAC+' j) :\n'+(vacText||'  Aucune\n')+
      'Formations ('+nbFORM+' j) : '+(formKeys.map(fmtJour).join(', ')||'Aucune')+'\n\n'+
      'Saisie des indisponibilités ouverte. Code : '+code+'\n'+
      'Lien : '+link+'\n\n'+
      'Conservez ce code confidentiel.\nLe Comité Planning-Med';

    try {
      MailApp.sendEmail({
        to: email,
        subject: '[Planning-Med '+indYear+'] Vos congés + ouverture des indispos',
        htmlBody: html,
        body: bodyText,
      });
      sent++;
    } catch(err) {
      errors.push(nom+' : '+err.message);
    }
  }

  logAction('sendCodesWithRecap '+indYear+' — '+sent+' emails, '+skipped+' sans email, '+errors.length+' erreur(s)');
  return ContentService.createTextOutput(JSON.stringify({success:true, sent, skipped, errors}))
    .setMimeType(ContentService.MimeType.JSON);
}
if (action === 'setDailyStatus') {
      if (user.role !== 'admin') return _deny();
      /* (2026-08-05.9) Corps extrait dans appliquerStatutJour — une seule
         source pour le routage et l'applicateur du journal. */
      try {
        const res = appliquerStatutJour(
          Number(payload.year) || TEST_YEAR,
          payload.marId, payload.statut,
          Array.isArray(payload.dates) ? payload.dates : (payload.date ? [String(payload.date)] : []));
        return ContentService.createTextOutput(JSON.stringify({ success: true, applied: res.applied, rejected: res.rejected }))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (e) { return _error(e.message); }
    }
    if (action === 'poserAbsenceLongue') {
      if (user.role !== 'admin') return _deny();
      const marId = String(payload.marId || '').trim().toUpperCase();
      const d1 = String(payload.dateDebut || '').trim();
      const d2 = String(payload.dateFin   || '').trim();
      if (!marId || !d1 || !d2) return _error('marId, dateDebut et dateFin requis');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return _error('Dates au format YYYY-MM-DD');
      if (d1 > d2) return _error('La date de début est après la date de fin');

      const ss = SpreadsheetApp.getActiveSpreadsheet();

      // Registre persistant des absences longues -> permet le report auto vers les années pas encore créées (initYear le rejoue)
      {
        let absSheet = ss.getSheetByName('ABSENCES_LONGUES');
        if (!absSheet) { absSheet = ss.insertSheet('ABSENCES_LONGUES'); absSheet.appendRow(['MAR_ID','DATE_DEBUT','DATE_FIN','POSE_LE']); }
        absSheet.getRange('B:C').setNumberFormat('@');   // dates stockées en TEXTE (pas de coercition Date)
        const adata = absSheet.getDataRange().getValues();
        let exists = false;
        for (let r = 1; r < adata.length; r++) {
          if (String(adata[r][0]).trim().toUpperCase() === marId
              && _isoDate(adata[r][1]) === d1 && _isoDate(adata[r][2]) === d2) { exists = true; break; }
        }
        if (!exists) absSheet.appendRow([marId, d1, d2, new Date()]);
      }

      // Toutes les dates calendaires de la plage [d1, d2]
      const allDates = [];
      { const cur = new Date(d1 + 'T12:00:00'), end = new Date(d2 + 'T12:00:00');
        while (cur <= end) {
          allDates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
          cur.setDate(cur.getDate() + 1);
        } }
      const nextStr = (d) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate()+1);
        return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };

      // Années civiles couvrant la plage (1 ou 2 en pratique)
      const years = [];
      for (let y = Number(d1.slice(0,4)); y <= Number(d2.slice(0,4)); y++) years.push(y);

      const freed = [];                 // gardes libérées {date, role}
      const deferred = [];              // années de la plage pas encore créées (report différé à l'init)
      let nbCL = 0;
      const touched = [];

      years.forEach(year => {
        const gSheet = ss.getSheetByName(`GARDES_${year}`);
        if (gSheet) {
          // Année GÉNÉRÉE : CL écrase tout (gardes + RG), on note les gardes libérées
          const data = gSheet.getDataRange().getValues();
          const dateToCol = buildDateToCol(data, year);
          let row = -1;
          for (let r = 3; r < data.length; r++)
            if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
          if (row < 0) return;
          const inYear = allDates.filter(dt => dateToCol[dt] !== undefined);
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          inYear.forEach(dt => {
            const col = dateToCol[dt];
            const curv = String(data[row][col] || '').trim().toUpperCase();
            if (curv === 'G' || curv === 'G2') freed.push({ date: dt, role: curv });
            gSheet.getRange(row + 1, col + 1).setValue('CL');
            indMap[dt] = 'CL';
            nbCL++;
          });
          // Nettoie le RG du lendemain d'une garde libérée si ce lendemain est hors plage
          freed.forEach(f => {
            const lend = nextStr(f.date), lc = dateToCol[lend];
            if (lc !== undefined && inYear.indexOf(lend) < 0
                && String(data[row][lc] || '').trim().toUpperCase() === 'RG')
              gSheet.getRange(row + 1, lc + 1).setValue('');
          });
          saveIndisposForDoctor(marId, indMap, year);
          touched.push(`${year} (générée)`);
        } else {
          // Année NON générée : CL dans INDISPOS seulement (zéro garde à reprendre)
          const iSheet = ss.getSheetByName(`INDISPOS_${year}`);
          if (!iSheet) { deferred.push(year); return; }
          const idata = iSheet.getDataRange().getValues();
          const dset = new Set(reconstruireDatesHeaders(idata, year).filter(Boolean));
          const inYear = allDates.filter(dt => dset.has(dt));
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          inYear.forEach(dt => { indMap[dt] = 'CL'; nbCL++; });
          saveIndisposForDoctor(marId, indMap, year);
          touched.push(`${year} (préparation)`);
        }
      });

      if (!nbCL && !deferred.length) return _error('Aucune date de la plage ne correspond à une année configurée (INDISPOS/GARDES).');
      freed.sort((a,b) => a.date < b.date ? -1 : 1);
      logAction(`poserAbsenceLongue — ${marId} ${d1} -> ${d2} : ${nbCL} j CL, ${freed.length} garde(s) liberee(s)${deferred.length ? ', reporté: ' + deferred.join('/') : ''}`);
      return ContentService.createTextOutput(JSON.stringify({ success: true, marId, nbCL, freed, touched, deferred }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── (RH-2) Lister le registre des absences longues ──────────────────
    if (action === 'getAbsencesLongues') {
      if (user.role !== 'admin') return _deny();
      const absSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ABSENCES_LONGUES');
      const absences = [];
      if (absSheet) {
        const adata = absSheet.getDataRange().getValues();
        for (let r = 1; r < adata.length; r++) {
          const id = String(adata[r][0]).trim().toUpperCase();
          if (!id) continue;
          absences.push({ marId: id, dateDebut: _isoDate(adata[r][1]), dateFin: _isoDate(adata[r][2]) });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, absences }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── (RH-2) Annuler ou raccourcir une absence longue ─────────────────
    // Sans nouvelleFin : annulation totale (efface les CL de [d1,d2] + supprime
    // la ligne du registre). Avec nouvelleFin : retour anticipé (efface les CL
    // de ]nouvelleFin, d2] + met à jour la ligne du registre).
    // SÉCURITÉ : on n'efface QUE les cases valant exactement 'CL' — jamais une
    // garde, un statut ou toute autre valeur. Les gardes libérées à la pose ne
    // sont PAS restaurées (redistribution par don/échange/garde exceptionnelle).
    if (action === 'annulerAbsenceLongue') {
      if (user.role !== 'admin') return _deny();
      const marId = String(payload.marId || '').trim().toUpperCase();
      const d1 = String(payload.dateDebut || '').trim();
      const d2 = String(payload.dateFin   || '').trim();
      const nf = String(payload.nouvelleFin || '').trim();   // optionnel
      if (!marId || !d1 || !d2) return _error('marId, dateDebut et dateFin requis');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d1) || !/^\d{4}-\d{2}-\d{2}$/.test(d2)) return _error('Dates au format YYYY-MM-DD');
      if (nf && !/^\d{4}-\d{2}-\d{2}$/.test(nf)) return _error('nouvelleFin au format YYYY-MM-DD');
      if (nf && (nf < d1 || nf >= d2)) return _error('La nouvelle fin doit être dans la plage (≥ début, < fin actuelle)');

      const ss = SpreadsheetApp.getActiveSpreadsheet();

      // 1) Retrouver la ligne EXACTE du registre (marId + début + fin)
      const absSheet = ss.getSheetByName('ABSENCES_LONGUES');
      if (!absSheet) return _error('Registre ABSENCES_LONGUES introuvable');
      const adata = absSheet.getDataRange().getValues();
      let regRow = -1;
      for (let r = 1; r < adata.length; r++) {
        if (String(adata[r][0]).trim().toUpperCase() === marId
            && _isoDate(adata[r][1]) === d1 && _isoDate(adata[r][2]) === d2) { regRow = r; break; }
      }
      if (regRow < 0) return _error(`Absence introuvable au registre : ${marId} ${d1} -> ${d2}`);

      // 2) Plage à effacer : totale (annulation) ou queue (retour anticipé)
      const clearStart = nf ? (function(){ const x = new Date(nf + 'T12:00:00'); x.setDate(x.getDate()+1);
        return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; })() : d1;
      const clearEnd = d2;
      const allDates = [];
      { const cur = new Date(clearStart + 'T12:00:00'), end = new Date(clearEnd + 'T12:00:00');
        while (cur <= end) {
          allDates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);
          cur.setDate(cur.getDate() + 1);
        } }

      // 3) Effacer les CL année par année (miroir exact de poserAbsenceLongue)
      let nbEfface = 0;
      const touched = [];
      const years = [];
      for (let y = Number(clearStart.slice(0,4)); y <= Number(clearEnd.slice(0,4)); y++) years.push(y);
      years.forEach(year => {
        const gSheet = ss.getSheetByName(`GARDES_${year}`);
        if (gSheet) {
          // Année générée : effacer les CL de GARDES + miroir INDISPOS
          const data = gSheet.getDataRange().getValues();
          const dateToCol = buildDateToCol(data, year);
          let row = -1;
          for (let r = 3; r < data.length; r++)
            if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
          if (row < 0) return;
          const inYear = allDates.filter(dt => dateToCol[dt] !== undefined);
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          let n = 0;
          inYear.forEach(dt => {
            const col = dateToCol[dt];
            if (String(data[row][col] || '').trim().toUpperCase() !== 'CL') return; // on ne touche QUE les CL
            gSheet.getRange(row + 1, col + 1).setValue('');
            if (indMap[dt] === 'CL') delete indMap[dt];
            n++;
          });
          if (n) { saveIndisposForDoctor(marId, indMap, year); nbEfface += n; touched.push(`${year} (générée)`); }
        } else {
          // Année non générée : effacer les CL d'INDISPOS seulement
          const iSheet = ss.getSheetByName(`INDISPOS_${year}`);
          if (!iSheet) return; // année pas créée : rien à effacer, la purge du registre suffit
          const idata = iSheet.getDataRange().getValues();
          const dset = new Set(reconstruireDatesHeaders(idata, year).filter(Boolean));
          const inYear = allDates.filter(dt => dset.has(dt));
          if (!inYear.length) return;
          const indMap = getIndisposForDoctor(marId, year);
          let n = 0;
          inYear.forEach(dt => { if (indMap[dt] === 'CL') { delete indMap[dt]; n++; } });
          if (n) { saveIndisposForDoctor(marId, indMap, year); nbEfface += n; touched.push(`${year} (préparation)`); }
        }
      });

      // 4) Registre : mise à jour (raccourci) ou suppression (annulation)
      if (nf) absSheet.getRange(regRow + 1, 3).setValue(nf);
      else    absSheet.deleteRow(regRow + 1);

      logAction(`annulerAbsenceLongue — ${marId} ${d1} -> ${d2}${nf ? ' raccourcie au ' + nf : ' ANNULEE'} : ${nbEfface} CL effacé(s)`);
      return ContentService.createTextOutput(JSON.stringify({ success: true, marId, nbEfface, touched, nouvelleFin: nf || null }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── ACTION : getConsultAbsences (Lot 5-bis) ──────────────────────────
    // Alimente l'ecran « Consultations a venir ». LECTURE SEULE, aucune donnee patient.
    // Un seul aller-retour : consultations posees + absences de chaque MAR.
    // ⚠️ Deux reponses selon le role : le motif d'absence (`c`) n'est JOINT QUE pour
    //    'mar' et 'admin'. En session 'secretariat' il n'est meme pas envoye — le
    //    masquer cote navigateur le laisserait lisible dans le source de la page.
    if (action === 'getConsultAbsences') {
      try {
        const JOURS_CONSULT = 20;  // 4 semaines ouvrees de consultations affichees
        const JOURS_ABS     = 20;  // 4 semaines d'absences APRES la derniere consultation
        const avecMotifs = (user.role !== 'secretariat');
        const _isoD = function (d) {
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
                 '-' + String(d.getDate()).padStart(2, '0');
        };
        // 1) Fenetre de jours ouvres a partir d'aujourd'hui. Il en faut
        //    JOURS_CONSULT + JOURS_ABS : chaque consultation regarde 4 semaines DEVANT
        //    elle, donc la derniere consultation affichee a besoin de 4 semaines de plus.
        const jours = [];
        const _cur = new Date(); _cur.setHours(12, 0, 0, 0);
        while (jours.length < JOURS_CONSULT + JOURS_ABS) {
          const _dw = _cur.getDay();
          if (_dw >= 1 && _dw <= 5) jours.push(_isoD(_cur));
          _cur.setDate(_cur.getDate() + 1);
        }
        const joursConsult = jours.slice(0, JOURS_CONSULT);

        // 2) Effectif actif (MEDECINS). Index figes : [0] id, [1] nom, [3] actif.
        const ssL = SpreadsheetApp.getActiveSpreadsheet();
        const medSh = ssL.getSheetByName('MEDECINS');
        if (!medSh) return _error('Onglet MEDECINS introuvable');
        const medD = medSh.getDataRange().getValues();
        const noms = {};
        // Appartenance au groupement liberal : colonne LIBERAL de MEDECINS, lue PAR
        // TITRE (comme checkCode). ⚠️ Ne JAMAIS deduire l'appartenance du releve : un
        // membre dont le mois n'est pas encore saisi n'y figure pas, il serait retire
        // des remplacants possibles alors qu'il est parfaitement disponible.
        const _hdrMed = (medD[0] || []).map(function (x) { return String(x).trim().toUpperCase(); });
        const colLibC = _hdrMed.indexOf('LIBERAL');
        const groupement = {};
        for (let r = 1; r < medD.length; r++) {
          const id = String(medD[r][0]).trim();
          if (!id) continue;
          if (String(medD[r][3]).trim().toUpperCase() !== 'O') continue;
          noms[id] = String(medD[r][1]).trim();
          if (colLibC >= 0 && String(medD[r][colLibC]).trim().toUpperCase() === 'O') groupement[id] = true;
        }

        // 3) Consultations : lues dans le PLANNING PUBLIE (planning_{Y}.json), pas dans
        //    PLANNING_OVERRIDES. Raison : les overrides ne contiennent que ce que le comite
        //    a pose A LA MAIN ; tout ce qui vient de la generation (dont les affectations de
        //    secteur) n'y figure pas. Le JSON est le rendu final = generation + overrides,
        //    donc exactement ce que voient les MARs dans index.html. S'il n'est pas publie,
        //    la consultation n'existe pour personne — la source est donc la bonne par
        //    definition. Le JSON est lu ICI, cote serveur : il ne part JAMAIS au navigateur
        //    (il contient le code d'absence brut de chaque MAR dans `status`).
        const consultations = [];
        const vus = {};                       // dedoublonnage date|mar|periode
        const anneesJ = {};
        // anneePlanning (code.gs) et non ds.slice(0,4) : les 1ers jours de janvier
        // appartiennent au planning de l'annee PRECEDENTE (cf. commentaire du helper).
        joursConsult.forEach(function (ds) { anneesJ[anneePlanning(ds)] = true; });
        Object.keys(anneesJ).forEach(function (an) {
          let doc;
          try {
            const raw = readPlanningFromDrive('planning_' + an + '.json');
            if (!raw) return;                  // annee non publiee : rien a lire
            doc = JSON.parse(raw);
          } catch (e) { return; }
          (doc.months || []).forEach(function (mois) {
            const jrs = mois.days || [];
            (mois.doctors || []).forEach(function (md) {
              const id = md.id;
              if (!noms[id]) return;           // MAR inactif ou inconnu
              (md.days || []).forEach(function (cell, i) {
                const j = jrs[i];
                if (!j || !j.date || joursConsult.indexOf(j.date) < 0) return;
                if (j.isWeekend || j.isFerie) return;
                const am = String((cell && cell.morning)   || '');
                const pm = String((cell && cell.afternoon) || '');
                const cs = String((cell && cell.cs)        || '');
                const _add = function (code, per) {
                  const k = j.date + '|' + id + '|' + per;
                  if (vus[k]) return;
                  vus[k] = true;
                  consultations.push({date: j.date, mar: id, cs: code, per: per});
                };
                if (am.indexOf('CS-') === 0) _add(am, 'am');
                if (pm.indexOf('CS-') === 0) _add(pm, 'pm');
                if (cs.indexOf('CS-') === 0) _add(cs, 'am');   // champ dedie (defensif)
                // MIROIR MATERNITE — mardi (dow 2) et jeudi (dow 4) matin.
                // Regle existante d'admin.html l.2586 : « la consult CS-MAT et la ligne MAT
                // sont la MEME personne, le MAR de mater fait la consult systematiquement ».
                // Elle n'est ecrite NULLE PART dans les donnees : elle est recalculee a
                // l'affichage. Sans cette reprise, l'ecran raterait toutes les consultations
                // de maternite. Sens unique, comme dans admin.html : etre en MAT implique la
                // consult, l'inverse n'est pas vrai.
                if ((j.dow === 2 || j.dow === 4) && am === 'MAT') _add('CS-MAT', 'am');
              });
            });
          });
        });
        consultations.sort(function (a, b) {
          return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.per < b.per ? -1 : 1);
        });

        // 4) Absences par MAR sur toute la fenetre.
        //    Source : GARDES_{Y} (onglet maitre : la campagne d'indispos y est recopiee
        //    par generateur_gardes.gs, et poserAbsenceLongue y ecrit CL directement).
        //    ABSENT_CODES (code.gs) = RG,V,F,CTP,CP,R,A,TP,CL — G/G2 volontairement
        //    ABSENTS de ce jeu : un MAR de garde peut assurer une intervention liberale.
        //    Trois absences ne figurent PAS dans GARDES et sont ajoutees ici, sans quoi
        //    l'ecran afficherait « disponible » a tort :
        //      TP  = jour fixe non travaille (colonne tp_jours_fixes de MEDECINS)
        //      OFF = semaine off du rythme 2/2
        //      HS  = hors periode d'activite (date_debut / date_fin)
        const FL = getMedecinFlags();
        const parAn = {};                                // annee -> {data, dateToCol}
        const _gardes = function (an) {
          if (parAn[an] === undefined) {
            const sh = ssL.getSheetByName('GARDES_' + an);
            if (!sh) { parAn[an] = null; }
            else {
              const dt = sh.getDataRange().getValues();
              const codes = {};
              for (let r = 3; r < dt.length; r++) {      // MARs des la ligne 4
                const gid = String(dt[r][0]).trim();
                if (gid) codes[gid] = dt[r];
              }
              parAn[an] = {codes: codes, col: buildDateToCol(dt, an)};
            }
          }
          return parAn[an];
        };

        const absences = {};
        const horsTotal = [];          // MAR hors service sur TOUTE la fenetre
        Object.keys(noms).forEach(function (id) {
          const liste = [];
          let nbHS = 0;
          const tpj = FL.tpJoursFixes[id];
          const dd  = FL.dateDebut[id], df = FL.dateFin[id];
          jours.forEach(function (ds) {
            let code = '';
            if (dd && ds < dd) code = 'HS';                        // pas encore en poste
            else if (df && ds >= df) code = 'HS';                  // a quitte le service
            else {
              const g = _gardes(anneePlanning(ds));   // pas ds.slice(0,4) : voir code.gs
              if (g) {
                const c = g.col[ds];
                if (c !== undefined && g.codes[id]) {
                  code = String(g.codes[id][c] || '').trim().toUpperCase();
                }
              }
              if (!ABSENT_CODES.has(code)) code = '';              // present ce jour-la
              if (!code && tpj && tpj.has(new Date(ds + 'T12:00:00').getDay())) code = 'TP';
              if (!code && estSemaineOff(id, ds)) code = 'OFF';
            }
            if (code === 'HS') nbHS++;
            if (code) liste.push(avecMotifs ? {d: ds, c: code} : {d: ds});
          });
          // Hors service sur TOUS les jours de la fenetre (pas encore arrive, ou deja
          // parti) : il ne fait pas partie de l'effectif pour cette periode.
          if (nbHS === jours.length) { horsTotal.push(id); return; }
          if (liste.length) absences[id] = liste;
        });
        // ⚠️ Retirer AUSSI de `noms` et des consultations, pas seulement des absences :
        // un MAR absent de la carte d'absences serait lu comme PRESENT par le frontend
        // (« pas d'absence ce jour-la »), donc propose comme remplacant alors qu'il
        // n'est pas dans le service. C'est le faux « disponible » que l'outil doit eviter.
        horsTotal.forEach(function (id) { delete noms[id]; delete absences[id]; });
        const consultationsF = consultations.filter(function (c) { return !!noms[c.mar]; });

        // 5) MARGE LIBERALE (axe CCAM) — sert a classer les remplacants possibles.
        //    Une consultation liberale declenche un bloc : c'est le CCAM qui portera
        //    la charge, pas le NGAP. Calculee ICI et non par un appel getReleveLiberal
        //    du navigateur : cette action reste HORS de SECRETARIAT_ACTIONS. Ne sort
        //    qu'UNE valeur derivee par MAR — jamais les tarifs, pourcentages ni exces.
        //    ⚠️ Le jour ou le secretariat prend cette mission : remplacer ici la valeur
        //    par un rang (1, 2, 3…) quand avecMotifs === false. L'ordre reste, les
        //    montants disparaissent, et rien ne change dans la page.
        let marges = {}, margesMois = '';
        try {
          if (typeof getReleveLiberal === 'function') {
            const rel = getReleveLiberal({});                 // annee liberale par defaut
            const its = (rel && rel.items) || [];
            if (its.length) {
              const dernier = its.map(function (i) { return i.mois; }).sort().pop();
              its.forEach(function (i) {
                if (i.mois !== dernier) return;
                if (i.tCcam === null || i.pctCcam === null) return;
                // marge = T x (3 - 10p) / 7 : nulle a 30 %, negative au-dela
                marges[i.marId] = i.tCcam * (3 - 10 * (i.pctCcam / 100)) / 7;
              });
              margesMois = dernier;
            }
          }
        } catch (e) { marges = {}; margesMois = ''; }   // confort de tri : jamais bloquant
        // Non-membre du groupement : aucun chiffre. Le masquage de la tuile ne suffit
        // pas — absences.html est une page publique, seul le serveur ferme la porte.
        if (!user.liberal) { marges = {}; margesMois = ''; }

        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          motifs: avecMotifs,          // le frontend sait s'il peut afficher un motif
          groupement: groupement,      // id -> true : membre du groupement liberal
          marges: marges,              // id -> marge CCAM restante (euros), dernier releve
          margesMois: margesMois,      // 'AAAA-MM' du releve utilise ('' si aucun)
          role: user.role,                       // (04/08/2026, fusion absences.html) auth + donnees en UN appel
          name: user.name || '',                 //  → le login separe devient un simple journal d'arriere-plan
          moi: user.role === 'mar' ? user.id : null,
          jours: joursConsult,
          noms: noms,
          consultations: consultationsF,
          absences: absences
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) { return _error(err.message); }
    }

    // ── JSON du planning (Drive) — consommés par index.html / dashboard.html ──
    // (Reconstruits après la régression de recopie : ils n'existaient qu'en prod.)
    if (action === 'getPlanningJson') {
      const jy = parseInt(payload.year) || getActiveYear();
      const raw = readPlanningFromDrive(`planning_${jy}.json`);
      if (!raw) return _error(`planning_${jy}.json introuvable dans le Drive`);
      return ContentService.createTextOutput(JSON.stringify({success:true, planning: JSON.parse(raw)}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'getAffectationsJson') {
      const jy = parseInt(payload.year) || getActiveYear();
      const raw = readPlanningFromDrive(`affectations_${jy}.json`);
      if (!raw) return _error(`affectations_${jy}.json introuvable dans le Drive`);
      return ContentService.createTextOutput(JSON.stringify({success:true, affectations: JSON.parse(raw)}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── PORTAIL (dashboard.html) : délégation au routeur de portail.gs ──
    // Auth déjà faite plus haut (checkCode) → toute action portail est code-gated.
    if (typeof portailRoute === 'function') {
      const _rp = portailRoute(action, payload, user);
      if (_rp) return _rp;
    }

    return ContentService.createTextOutput(JSON.stringify({success:false, error:'Action inconnue'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── HELPERS INTERNES ─────────────────────────────────────────────────
function _deny() {
  return ContentService.createTextOutput(JSON.stringify({success:false, error:'Accès refusé'}))
    .setMimeType(ContentService.MimeType.JSON);
}
function _error(msg) {
  return ContentService.createTextOutput(JSON.stringify({success:false, error:msg}))
    .setMimeType(ContentService.MimeType.JSON);
}
// Normalise une valeur de cellule (texte OU objet Date) en 'yyyy-MM-dd' — évite la coercition date de Sheets.
// _isoDate : DEFINITION UNIQUE dans portail.gs (espace de noms commun Apps Script).
// Le doublon qui vivait ici a ete supprime le 29/07/2026 : les deux versions
// divergeaient et l'ordre des fichiers du projet decidait silencieusement
// laquelle tournait. La version conservee (portail.gs) est la plus stricte.

// ── doPost — même logique que doGet ──────────────────────────────────
// ── (28/07/2026) CHRONOMETRE SERVEUR DANS CHAQUE REPONSE ─────────────
// Constat du jour : getMARsDispoJour = ~3 s cote serveur, 18,7 s cote
// navigateur — 15 s perdues quelque part entre Google et l'hopital, sans
// pouvoir dire ou. Chaque reponse JSON porte desormais sa duree d'execution
// reelle (_srv_ms) : chronoAPI() (admin.html) separe alors « serveur » et
// « transport+file », et le diagnostic se lit sans ouvrir le menu Executions.
// L'aiguillage historique est INTACT : doGet ne fait plus que le chronometrer.
/* (2026-08-05.11) Retire les lignes de PLANNING_OVERRIDES visant ce MAR à ces
   dates. Ciblage par (date, MAR) — JAMAIS par numéro de ligne : les rangs
   bougent entre le moment où on les lit et celui où on écrit. Même verrou et
   même normalisation de date que savePlanningOverridesBatch ; suppression de
   la FIN vers le DÉBUT (une suppression ne décale que les lignes en dessous). */
function retirerPlacementsPourDates(marId, dates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('PLANNING_OVERRIDES');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const cible = String(marId || '').trim().toUpperCase();
  const jours = {};
  (dates || []).forEach(function (d) { jours[String(d).trim()] = true; });
  if (!cible || !Object.keys(jours).length) return 0;

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { Logger.log('retirerPlacements : verrou indisponible, on continue'); }
  try {
    const data = sheet.getDataRange().getValues();
    const aSupprimer = [];
    for (let r = 1; r < data.length; r++) {
      const brut = data[r][0];
      const dateStr = brut instanceof Date
        ? `${brut.getFullYear()}-${String(brut.getMonth()+1).padStart(2,'0')}-${String(brut.getDate()).padStart(2,'0')}`
        : String(brut).trim();
      if (!jours[dateStr]) continue;
      if (String(data[r][1]).trim().toUpperCase() !== cible) continue;
      aSupprimer.push(r);
    }
    aSupprimer.sort(function (a, b) { return b - a; }).forEach(function (r) { sheet.deleteRow(r + 1); });
    return aSupprimer.length;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
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

function appliquerStatutJour(year, marIdBrut, statutBrut, datesBrutes) {
  const payload = { marId: marIdBrut, statut: statutBrut, dates: datesBrutes };
                  const marId  = String(payload.marId || '').trim().toUpperCase();
      const statut = String(payload.statut || '').trim().toUpperCase(); // '' = effacer
      const dates  = Array.isArray(payload.dates)
        ? payload.dates
        : (payload.date ? [String(payload.date)] : []);
      if (!marId || !dates.length) throw new Error('marId et date(s) requis');

      const ALLOWED = new Set(['', 'V', 'F', 'TP', 'CL', 'A', '18']);   // (31/07/2026) « I » retire : l'indispo de garde se pose dans INDISPOS
      if (!ALLOWED.has(statut)) throw new Error(`Statut non autorisé : ${statut}`);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(`GARDES_${year}`);
      if (!sheet) throw new Error(`GARDES_${year} introuvable`);
      const data = sheet.getDataRange().getValues();
      const dateToCol = buildDateToCol(data, year);

      let row = -1;
      for (let r = 3; r < data.length; r++) {
        if (String(data[r][0]).trim().toUpperCase() === marId) { row = r; break; }
      }
      if (row < 0) throw new Error(`${marId} introuvable dans GARDES_${year}`);

      const GARDE_BLOCK = new Set(['G', 'G2', 'RG']); // garde + récup → échange/don
      const applied = [], rejected = [];
      dates.forEach(d => {
        const col = dateToCol[d];
        if (col === undefined) { rejected.push(`${d} (hors planning)`); return; }
        const current = String(data[row][col] || '').trim().toUpperCase();
        if (GARDE_BLOCK.has(current)) { rejected.push(`${d} (${current} → échange/don)`); return; }
        sheet.getRange(row + 1, col + 1).setValue(statut);
        applied.push(d);
      });

      if (applied.length) {
        /* (2026-08-05.11) LE DERNIER GESTE GAGNE. Constat de terrain : un MAR
           placé en secteur puis passé en TP restait affiché en secteur — la
           ligne de PLANNING_OVERRIDES survivait au changement de statut, et il
           fallait la supprimer à la main dans le classeur. Désormais, poser un
           statut d'ABSENCE retire les placements de ces jours-là pour ce MAR.
           Le TP y figure : poser un TP annule le placement du jour. L'inverse
           reste vrai et VOLONTAIRE — un MAR en TP peut être réquisitionné en
           dernier recours, il suffit de le placer APRÈS (le panneau le
           propose, et le placement, postérieur, tient).
           « 18 » (8h-18h) et l'effacement ('') ne retirent RIEN : ce ne sont
           pas des absences. */
        const STATUTS_RETIRANT_PLACEMENT = new Set(['V', 'F', 'TP', 'CL', 'A']);
        if (STATUTS_RETIRANT_PLACEMENT.has(statut)) {
          try {
            const _nbRet = retirerPlacementsPourDates(marId, applied);
            if (_nbRet) logAction(`setDailyStatus — ${_nbRet} placement(s) retiré(s) (${marId}, statut ${statut})`);
          } catch (e) { Logger.log('Retrait des placements : ' + e.message); }
        }
        try {
          const indMap = {'':'', 'V':'VAC', 'F':'FORM', 'TP':'TP', 'CL':'CL', 'A':'A', '18':'INDISPO'};
          const existing = getIndisposForDoctor(marId, year);
          applied.forEach(d => { existing[d] = indMap[statut]; });
          saveIndisposForDoctor(marId, existing, year);
        } catch(e) { Logger.log('Miroir INDISPOS: ' + e.message); }
        // (C3) plus d'auto-republication : déclenchée par le bouton « Publier » (action publishPlanning).
      }
      logAction(`setDailyStatus — ${marId} "${statut || '∅'}" ×${applied.length}, ${rejected.length} rejeté(s)`);
      return { applied: applied, rejected: rejected };
}

function doGet(e) {
  const _t0 = Date.now();
  const out = _routeRequete_(e);
  // (03/08/2026, miroir) Après une ÉCRITURE réussie, déposer les données à
  // jour au miroir Cloudflare (miroir.gs). Coût nul pour les lectures (un
  // simple lookup) ; jamais bloquant : une panne du miroir n'affecte
  // aucune réponse du portail.
  try { miroirApresRequete_(e, out.getContent()); } catch (_m) {}
  return _ajouterDureeServeur_(out, _t0);
}
function _ajouterDureeServeur_(out, t0) {
  try {
    /* (01/08/2026) INSERTION PAR TEXTE, PLUS PAR ANALYSE COMPLETE.
       Version du 28/07 : JSON.parse de TOUTE la reponse, ajout des champs, puis
       JSON.stringify. Pour le bootstrap cela fait ~350 Ko analyses puis
       reencodes uniquement pour y glisser deux nombres — sur CHAQUE reponse.
       Ici les champs sont inseres juste apres l'accolade ouvrante, par simple
       concatenation. Le JSON produit est rigoureusement identique.
       CONDITION STRICTE : on n'insere que si le texte commence par `{"`, ce qui
       garantit qu'un objet NON VIDE suit — donc que la virgule ajoutee reste
       valide. Un `{}`, un JSON indente ou un tableau retombent sur l'ancienne
       voie : jamais de JSON invalide produit.
       Le plafond de 400 000 caracteres ne s'applique plus qu'a ce repli : il
       n'existait qu'a cause du cout du parse. */
    const txt = out.getContent();
    if (!txt || txt.charAt(0) !== '{') return out;
    let _g = null;
    try { _g = t0 - _T_GLOBAUX; } catch (e) { _g = null; }
    const _champs = '"_srv_ms":' + (Date.now() - t0)
                  + (_g === null ? '' : ',"_glob_ms":' + _g);
    if (txt.charAt(1) === '"') {
      return ContentService.createTextOutput('{' + _champs + ',' + txt.slice(1))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (txt.length > 400000) return out;          // repli : ancienne voie
    const o = JSON.parse(txt);
    o._srv_ms = Date.now() - t0;
    if (_g !== null) o._glob_ms = _g;
    return ContentService.createTextOutput(JSON.stringify(o))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return out;   // au moindre doute, la reponse d'origine part telle quelle
  }
}

function doPost(e) {
  // Réutiliser doGet en reconstituant e.parameter
  try {
    const payload = JSON.parse(e.postData.contents);
    return doGet({parameter: {payload: JSON.stringify(payload)}});
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
function testNotifierConflits() {
  const year = 2027;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const medSheet = ss.getSheetByName('MEDECINS');
  const medData = medSheet.getDataRange().getValues();
  const actifs = [];
  for (let r = 1; r < medData.length; r++) {
    const id = String(medData[r][0]).trim();
    if (!id || String(medData[r][3]).trim().toUpperCase() !== 'O') continue;
    actifs.push({id, nom: String(medData[r][1]).trim(), email: String(medData[r][7]).trim()});
  }
  Logger.log('MARs actifs: ' + actifs.length);
  
  const indSheet = ss.getSheetByName('INDISPOS_' + year);
  if (!indSheet) { Logger.log('INDISPOS_' + year + ' introuvable'); return; }
  const indData = indSheet.getDataRange().getValues();
  Logger.log('INDISPOS lignes: ' + indData.length + ' cols: ' + indData[0].length);
  
  const dates = [];
  let curY = year, curM = null;
  const MM = {'janvier':1,'février':2,'mars':3,'avril':4,'mai':5,'juin':6,'juillet':7,'août':8,'septembre':9,'octobre':10,'novembre':11,'décembre':12};
  for (let c = 1; c < indData[0].length; c++) {
    const cell = indData[0][c];
    if (cell) {
      if (cell instanceof Date) { curY = cell.getFullYear(); curM = cell.getMonth()+1; }
      else { const low = String(cell).toLowerCase(); const m2 = String(cell).match(/(\d{4})/); if (m2) curY = parseInt(m2[1]); Object.entries(MM).forEach(([n,v]) => { if (low.includes(n)) curM = v; }); }
    }
    const dn = indData[2][c];
    dates.push((dn && curY && curM) ? curY+'-'+String(curM).padStart(2,'0')+'-'+String(Number(dn)).padStart(2,'0') : null);
  }
  Logger.log('Dates non-nulles: ' + dates.filter(Boolean).length);
  
  const vacByDoc = {};
  for (let r = 3; r < indData.length; r++) {
    const id = String(indData[r][0]).trim();
    if (!id) continue;
    vacByDoc[id] = new Set();
    dates.forEach((date, i) => {
      if (!date) return;
      const val = String(indData[r][i+1]||'').trim();
      if (val === 'VAC' || val === 'FORM') vacByDoc[id].add(date);
    });
  }
  const nonVides = Object.entries(vacByDoc).filter(([k,v]) => v.size > 0);
  Logger.log('MARs avec VAC: ' + nonVides.length);

  const groupSheet = ss.getSheetByName('GROUPES_VAC');
  const groupData = groupSheet.getDataRange().getValues();
  const groups = {A:[],B:[],C:[]}, ordre2026 = {A:{},B:{},C:{}};
  for (let r = 1; r < groupData.length; r++) {
    const grp = String(groupData[r][0]).trim(), id = String(groupData[r][1]).trim(), ord = Number(groupData[r][2]);
    if (!id || !groups[grp]) continue;
    groups[grp].push(id); ordre2026[grp][id] = ord;
  }
  const offset = year - 2026;
  function getOrd(grp) {
    const sorted = [...groups[grp]].sort((a,b) => ordre2026[grp][a] - ordre2026[grp][b]);
    const sh = sorted.length ? (sorted.length - (offset % sorted.length)) % sorted.length : 0;  // rotation droite
    return [...sorted.slice(sh), ...sorted.slice(0, sh)];
  }
  const ordA = getOrd('A'), ordB = getOrd('B'), ordC = getOrd('C');

  const testDate = '2027-02-22';
  const ORDRE_BASE = {HIVER:'CAB',PRINTEMPS:'ABC',ETE:'ABC',TOUSSAINT:'BCA',NOEL:'CAB'};
  const base = ORDRE_BASE['HIVER'];
  const ga = base.split(''); const gs = (3 - (offset % 3)) % 3;   // rotation droite
  const og = [...ga.slice(gs), ...ga.slice(0, gs)];
  const ol = []; og.forEach(g => { if (g==='A') ol.push(...ordA); else if (g==='B') ol.push(...ordB); else ol.push(...ordC); });
  const marEnVac = ol.filter(id => vacByDoc[id] && vacByDoc[id].has(testDate));
  Logger.log('MARs en VAC le ' + testDate + ': ' + marEnVac.length);

  // Tester le filtre des périodes
  const perSheet = ss.getSheetByName('PERIODES_VAC');
  const perData = perSheet.getDataRange().getValues();

  function premierJour(y) {
    const j = new Date(y,0,1); const d = j.getDay(); 
    const o = d===1?7:d===0?1:8-d; 
    const r = new Date(y,0,1+o); 
    return r.getFullYear()+'-'+String(r.getMonth()+1).padStart(2,'0')+'-'+String(r.getDate()).padStart(2,'0');
  }
  const debutAnnee = premierJour(year);
  const finAnnee = premierJour(year+1);
  Logger.log('debutAnnee: ' + debutAnnee + ' finAnnee: ' + finAnnee);
  
  for (let r = 1; r < perData.length; r++) {
    const nom = String(perData[r][0]).trim();
    const dr = perData[r][1];
    const debut = dr instanceof Date 
      ? dr.getFullYear()+'-'+String(dr.getMonth()+1).padStart(2,'0')+'-'+String(dr.getDate()).padStart(2,'0') 
      : String(dr).trim();
    const passe = debut >= debutAnnee && debut < finAnnee;
    Logger.log('Periode ' + nom + ' debut=' + debut + ' → ' + (passe ? '✅ incluse' : '❌ EXCLUE'));
  }
}
// ── Rendu HTML d'un récap d'indispos pour mail : synthèse + blocs par période ──
// synth  = [{n, label, bg, fg}]   (cartes du haut, n=0 → masquée)
// blocks = [{title, rows:[{label, bg, fg, dates:[ISO,...]}]}]
function renderRecapMailBlocks_(synth, blocks) {
  const MOIS_ABR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const fmtJour = ds => { const d=new Date(ds+'T12:00:00'); return d.getDate()+' '+MOIS_ABR[d.getMonth()]; };
  const fmtPlage = (a,b) => { if(a===b) return fmtJour(a); const da=new Date(a+'T12:00:00'),db=new Date(b+'T12:00:00'); if(da.getMonth()===db.getMonth()) return da.getDate()+' → '+db.getDate()+' '+MOIS_ABR[db.getMonth()]; return fmtJour(a)+' → '+fmtJour(b); };
  const toRanges = arr => { const j=arr.slice().sort(); const out=[]; if(!j.length) return out; let deb=j[0],prev=j[0]; for(let i=1;i<j.length;i++){ const d1=new Date(prev+'T12:00:00'); d1.setDate(d1.getDate()+1); if(d1.toISOString().slice(0,10)!==j[i]){ out.push([deb,prev]); deb=j[i]; } prev=j[i]; } out.push([deb,prev]); return out; };
  const rangesText = arr => toRanges(arr).map(r=>fmtPlage(r[0],r[1])).join('&nbsp;&nbsp;·&nbsp;&nbsp;');

  let synthHtml = '';
  if (synth && synth.length) {
    const cells = synth.filter(x=>x.n).map(x =>
      '<td style="padding:0 6px 0 0"><div style="background:'+x.bg+';border-radius:9px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:800;color:'+x.fg+';line-height:1">'+x.n+'</div><div style="font-size:10px;font-weight:600;color:'+x.fg+';text-transform:uppercase;letter-spacing:.4px;margin-top:2px">'+x.label+'</div></div></td>'
    ).join('');
    if (cells) synthHtml = '<table cellpadding="0" cellspacing="0" style="margin:4px 0 18px;width:100%"><tr>'+cells+'<td style="width:99%"></td></tr></table>';
  }

  const blocksHtml = blocks.map(blk => {
    const rows = (blk.rows||[]).filter(r=>r.dates&&r.dates.length).map(r =>
      '<tr><td style="padding:7px 12px 7px 0;vertical-align:top;white-space:nowrap;width:96px"><span style="display:inline-block;background:'+r.bg+';color:'+r.fg+';font-size:11px;font-weight:700;border-radius:6px;padding:3px 9px">'+r.label+'</span></td>'
      +'<td style="padding:7px 0;vertical-align:top;font-size:13px;color:#334155;line-height:1.55">'+rangesText(r.dates)+'</td></tr>'
    ).join('');
    if (!rows) return '';
    return '<div style="margin:0 0 12px;border:1px solid #e8edf3;border-radius:12px;overflow:hidden">'
      +'<div style="background:#f7f9fc;border-left:4px solid #ce1126;padding:9px 14px;font-size:13px;font-weight:700;color:#16202e">'+blk.title+'</div>'
      +'<table cellpadding="0" cellspacing="0" style="width:100%;padding:4px 14px 8px"><tbody>'+rows+'</tbody></table></div>';
  }).join('');

  return synthHtml + (blocksHtml || '<div style="color:#9aa4b2;font-style:italic;font-size:13px">Aucune indisponibilité enregistrée.</div>');
}
// ── Éligibles Noël/Jour de l'An (bandeau staff.html) ───────────────────
// Réutilise la rotation overdueKey du générateur : jamais-fait d'abord,
// puis l'année la plus ancienne. Exclut no_garde et PRUNET (souhait_plafond),
// et les MAR hors année planning (date_debut/date_fin).
// PLANCHER = PLAFOND = 8 : il faut EXACTEMENT 8 MAR distincts. Les 4 dates
// (24/12, 25/12, 31/12, 01/01) portent chacune 2 gardes (G rea + G2 mat), et
// elles ne peuvent jamais tomber dans la meme unite de couplage (les couplages
// se font a +/-2 jours, ces dates sont espacees de 1 ou 7). Le bandeau doit
// donc toujours proposer 8 noms, meme si moins de MAR sont "en retard".
// Seuils EN DUR (30/07/2026). La lecture de CONFIG (NOEL_SEUIL_ANS / NOEL_PLANCHER /
// NOEL_PLAFOND) a ete SUPPRIMEE : aucune des trois lignes n'existait dans le classeur,
// donc c'etait une lecture d'onglet a chaque affichage du bandeau pour rien.
// SEUIL = 3 ans : "en retard" = jamais fait, ou pas fait depuis 3 ans.
/* (01/09/2026) CE QU'IL RESTE À POSER, pour chaque MAR.
   Un jour de congé se compte en jours TRAVAILLÉS : ni week-end, ni férié —
   la même règle que le serveur applique déjà au quota de vacances, et que
   l'écran du staff vient d'adopter.
   Les temps partiels en attente d'arbitrage (TPA) sont comptés à part : ils
   ne sont pas acquis, mais ils occupent une place dans le quota. */
function computeReliquats(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const gardes = ss.getSheetByName('GARDES_' + year);
  const genere = !!gardes;
  const jf = getJoursFeries(year);
  const jf2 = getJoursFeries(year + 1);
  const ouvre = ds => {
    const d = new Date(ds + 'T12:00:00').getDay();
    return d !== 0 && d !== 6 && !jf.has(ds) && !jf2.has(ds);
  };
  /* Deux jeux de codes pour la même chose : INDISPOS parle en VAC/FORM/TP,
     GARDES en V/F/TP. Une table par source, jamais un mélange des deux. */
  const source = genere ? gardes : ss.getSheetByName('INDISPOS_' + year);
  if (!source) return { success: false, error: 'Ni GARDES_' + year + ' ni INDISPOS_' + year };
  const CODES = genere ? { V: 'vac', F: 'form', TP: 'tp' }
                       : { VAC: 'vac', FORM: 'form', TP: 'tp' };
  const data = source.getDataRange().getValues();
  const dates = genere ? null : reconstruireDatesHeaders(data, year);
  const d2c = genere ? buildDateToCol(data, year) : null;
  const colDate = [];
  if (genere) { Object.keys(d2c).forEach(ds => { colDate[d2c[ds]] = ds; }); }

  const poses = {};
  for (let r = 3; r < data.length; r++) {
    const id = String(data[r][0]).trim(); if (!id) continue;
    const p = poses[id] = { vac: 0, form: 0, tp: 0 };
    for (let c = 1; c < data[r].length; c++) {
      const ds = genere ? colDate[c] : dates[c - 1];
      if (!ds || !ouvre(ds)) continue;
      const k = CODES[String(data[r][c] || '').trim().toUpperCase()];
      if (k) p[k]++;
    }
  }

  // Demandes de temps partiel non encore tranchées par le comité
  const attente = {};
  try { _tpDemandes_(year).forEach(x => { attente[x.mar] = (attente[x.mar] || 0) + 1; }); } catch (e) {}

  const FLAGS = getMedecinFlags();
  const med = ss.getSheetByName('MEDECINS').getDataRange().getValues();
  const lignes = [];
  for (let r = 1; r < med.length; r++) {
    const id = String(med[r][0]).trim(); if (!id) continue;
    if (String(med[r][3]).trim().toUpperCase() !== 'O') continue;
    const quotite = Number(med[r][4]) || 100;
    const q = getQuotasConges(quotite);
    const p = poses[id] || { vac: 0, form: 0, tp: 0 };
    const att = attente[id] || 0;
    /* Un profil à jours fixes convenus ou en rythme deux semaines sur deux
       n'a pas de temps partiel à poser : afficher un quota lui inventerait
       des jours qu'il n'a pas. */
    const tpQuota = (FLAGS.rythme2sur2.has(id) || FLAGS.tpJoursFixes[id]) ? 0 : q.ctp;
    lignes.push({
      id: id, init: String(med[r][2] || '').trim() || id,
      nom: String(med[r][1] || '').trim(), quotite: quotite,
      vac:  { pose: p.vac,  quota: q.vac,  reste: q.vac  - p.vac },
      form: { pose: p.form, quota: q.form, reste: q.form - p.form },
      tp:   { pose: p.tp,   quota: tpQuota, attente: att,
              reste: Math.max(0, tpQuota - p.tp - att) }
    });
  }
  lignes.sort((a, b) => (b.vac.reste + b.form.reste + b.tp.reste)
                      - (a.vac.reste + a.form.reste + a.tp.reste)
                      || (a.id < b.id ? -1 : 1));
  return { success: true, year: year, genere: genere,
           source: genere ? 'GARDES_' + year : 'INDISPOS_' + year, lignes: lignes };
}

/* (01/09/2026) L'HISTORIQUE BRUT, pour le tableau du staff vacances.
   Une ligne par MAR pouvant tenir Noël, avec TOUTES ses années passées.
   Trié du plus ancien au plus récent — l'ordre de la rotation elle-même.

   AUCUN jugement n'est rendu ici : ni « prioritaire », ni liste des huit à
   servir. Décision d'Arthur du 01/09/2026 — il y a souvent plus de huit
   candidats légitimes, et désigner huit noms donnerait à un calcul le dernier
   mot sur un arbitrage qui revient au comité. L'écran montre, le comité
   décide. Le générateur, lui, garde sa propre règle pour l'attribution
   automatique : c'est computeNoelAnEligibles, inchangée.

   `postes` dit combien de médecins l'année mobilisait : QUATRE jusqu'en 2024
   (une garde par jour sur les quatre dates), HUIT depuis que la double garde
   est effective — octobre 2025, donc dès le Noël 2025. Sans ce chiffre, une
   année ancienne à quatre noms se lirait comme une année incomplète. */
const NOEL_AN_DOUBLE_GARDE_DEPUIS = 2025;   // 4 postes avant, 8 à partir de là
function noelAnPostes(annee) {
  return Number(annee) >= NOEL_AN_DOUBLE_GARDE_DEPUIS ? 8 : 4;
}

function computeNoelAnHistorique(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const FLAGS = getMedecinFlags();
  const planStart = toDateStr(getPremierJourPlanning(year));
  const planEnd   = toDateStr(new Date(getPremierJourPlanning(year + 1).getTime() - 86400000));
  const horsAnnee = id => { const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id];
    if(df && df<planStart) return true; if(dd && dd>planEnd) return true; return false; };
  const detail = getNoelHistoryDetail(year);
  const out = [];
  const med = ss.getSheetByName('MEDECINS');
  if (med) {
    const md = med.getDataRange().getValues();
    for (let r = 1; r < md.length; r++) {
      const id = String(md[r][0]).trim(); if (!id || id === 'DRUGE') continue;
      if (String(md[r][3]).trim().toUpperCase() !== 'O') continue;
      if (FLAGS.noGarde.has(id)) continue;
      if (FLAGS.souhaitPlafond.has(id)) continue;
      if (horsAnnee(id)) continue;
      const annees = detail[id] || [];
      out.push({ id: id, init: String(md[r][2] || '').trim() || id,
                 nom: String(md[r][1] || '').trim(),
                 annees: annees,
                 last: annees.length ? annees[annees.length - 1] : null });
    }
  }
  out.sort(function (a, b) {
    const ka = a.last == null ? [0, 0] : [1, a.last];
    const kb = b.last == null ? [0, 0] : [1, b.last];
    return ka[0] - kb[0] || ka[1] - kb[1] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  /* Les années à afficher en colonnes, et ce que chacune mobilisait. On part
     de la plus ancienne trouvée, sans jamais dépasser huit colonnes : au-delà
     le tableau devient illisible sur un écran de portable. */
  const toutes = {};
  out.forEach(function (x) { x.annees.forEach(function (a) { toutes[a] = true; }); });
  let liste = Object.keys(toutes).map(Number).sort(function (a, b) { return a - b; });
  const fin = year - 1;
  if (!liste.length) liste = [fin];
  for (let a = liste[liste.length - 1] + 1; a <= fin; a++) liste.push(a);
  if (liste.length > 8) liste = liste.slice(liste.length - 8);
  /* ⚠️ `tenus` compte TOUT l'historique de l'année, pas les seules lignes
     affichées. Un médecin parti n'apparaît plus dans le tableau, mais il a bien
     tenu sa garde : le compter à part ferait annoncer un trou là où l'année est
     complète. Constaté sur les données réelles du 01/09 — deux anciens du
     service faisaient afficher « 3/4 » sur une année pourtant pleine. */
  const annees = liste.map(function (a) {
    let n = 0;
    Object.keys(detail).forEach(function (id) { if (detail[id].indexOf(a) >= 0) n++; });
    return { annee: a, postes: noelAnPostes(a), tenus: n };
  });
  return { mars: out, annees: annees };
}

function computeNoelAnEligibles(year, tous) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const SEUIL = 3, PLANCHER = 8, PLAFOND = 8;

  const FLAGS = getMedecinFlags();
  const planStart = toDateStr(getPremierJourPlanning(year));
  const planEnd   = toDateStr(new Date(getPremierJourPlanning(year + 1).getTime() - 86400000));
  const horsAnnee = id => { const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id]; if(df && df<planStart) return true; if(dd && dd>planEnd) return true; return false; };

  // Effectif éligible : actifs − no_garde − PRUNET − hors année
  const initMap = {}, eligibles = [];
  const med = ss.getSheetByName('MEDECINS');
  if (med) {
    const md = med.getDataRange().getValues();
    for (let r=1;r<md.length;r++){
      const id = String(md[r][0]).trim(); if(!id || id==='DRUGE') continue;
      initMap[id] = String(md[r][2]||'').trim() || id;
      if (String(md[r][3]).trim().toUpperCase() !== 'O') continue;
      if (FLAGS.noGarde.has(id)) continue;
      if (FLAGS.souhaitPlafond.has(id)) continue;
      if (horsAnnee(id)) continue;
      eligibles.push(id);
    }
  }

  // Historique Noël/An : source unique getNoelHistory(year) = HISTORIQUE ∪ onglets
  // GARDES_{Y} présents (voir code.gs). Prend en compte l'année générée mais pas
  // encore archivée, pour ne pas re-proposer qui vient de faire Noël l'an passé.
  const noelHistory = getNoelHistory(year);

  const overdueKey = m => { const ly=noelHistory[m]; return ly==null ? [0,0,m] : [1,ly,m]; };
  const cmp = (a,b)=>a[0]-b[0]||a[1]-b[1]||(a[2]<b[2]?-1:a[2]>b[2]?1:0);
  eligibles.sort((a,b)=>cmp(overdueKey(a),overdueKey(b)));

  // "En retard" = jamais fait OU pas fait depuis ≥ SEUIL ans
  const enRetard = eligibles.filter(id => { const ly=noelHistory[id]; return ly==null || (year-ly)>=SEUIL; });
  let finalIds = enRetard.slice();
  if (finalIds.length < PLANCHER) finalIds = eligibles.slice(0, PLANCHER);
  // (31/07/2026) `tous` : renvoie la liste COMPLETE, sans le plafond de 8. Le bandeau
  // du staff en affiche 8 ; a egalite d'annee le tri est ALPHABETIQUE, donc des
  // prioritaires legitimes restent invisibles. Le controle du W2 doit porter sur tous.
  if (!tous) finalIds = finalIds.slice(0, PLAFOND);

  return finalIds.map(id => ({ id, init: initMap[id]||id, last: (noelHistory[id]!=null ? noelHistory[id] : null) }));
}

/* (24/08/2026) Tri des placements caducs pour le Diagnostic : seul l'avenir
   mérite un avertissement — un conflit passé est de l'histoire, la
   publication a déjà affiché l'absence. Comparaison sur l'ISO 'yyyy-MM-dd' :
   aujourd'hui compte comme à venir. Pure, testée au banc. */
function _caducsTrier_(liste, aujourdhuiIso) {
  const futurs = [], passes = [];
  (liste || []).forEach(function (x) {
    (String(x && x.date) >= aujourdhuiIso ? futurs : passes).push(x);
  });
  return { futurs: futurs, passes: passes };
}
