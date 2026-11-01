const GAS_VERSION_LIVREUR = '2026-11-01.2';
/* ═══ LIVREUR — mise à jour du serveur Apps Script depuis le téléphone ═══════
   PROJET APPS SCRIPT SÉPARÉ, à ne PAS recopier dans le projet du classeur.
   Idée (conçue le 09/08/2026, relancée le 31/10/2026) : ce petit projet est le
   SEUL à détenir le droit de réécrire le serveur principal. Le serveur du
   portail, lui, ne gagne aucun droit nouveau.

   ÉTAPE 1 (31/10/2026) — testerAcces(), lecture seule : validé le 01/11/2026
   (trois ✅, après rattachement à un projet Google Cloud standard).

   ÉTAPE 3 (01/11/2026) — la mise à jour elle-même, appelée par la carte
   « Mise à jour du serveur » de maintenance.html (doPost) :
     · etat      : compare le code EN SERVICE au dépôt, à un commit PRÉCIS
                   (le sha que la page a lu sur GitHub : jamais « main », qui
                   peut bouger entre la lecture et l'application) ;
     · appliquer : sauvegarde (une version de l'état actuel), remplace les
                   fichiers du dépôt, crée une version, bascule le déploiement
                   EXISTANT dessus — même adresse, rien à changer dans le site ;
     · revenir   : rebascule le déploiement sur la version précédente.
   Qui : le MAR qui a la tuile cachée `maintenance`. Le livreur ne connaît
   aucun code : il demande au serveur du portail (getMedecins → maintenance)
   — une seule porte, un seul critère, comme la page.
   (01/11/2026, .2) DÉFAUT VU AU PREMIER ESSAI : la comparaison se faisait avec le
   dernier code ENVOYÉ dans le projet, pas avec la version qui TOURNE. Après un
   « Revenir », la carte disait « À jour » et masquait « Appliquer » : impossible de
   relivrer. On compare et on livre désormais à partir de la version EN SERVICE
   (content?versionNumber=N), lue au déploiement du site — ou à la version indiquée
   par la page juste après un geste (Google peut renvoyer l'ancien déploiement
   quelques secondes : c'était le « version 57 » affiché après la livraison).
   Garde-fous : un seul passage à la fois (verrou) ; un fichier du dépôt
   illisible = rien n'est touché ; un manifeste qui change les autorisations
   ou l'accès du site est REFUSÉ (ces changements-là demandent l'ordinateur :
   le propriétaire doit les réautoriser dans l'éditeur) ; les fichiers du
   projet absents de la carte sont conservés tels quels.

   Installation : voir livreur/README.md. */

// Identifiant du déploiement utilisé par le site (déjà public : il figure dans
// l'adresse du serveur, écrite dans les pages). Ne jamais en créer un autre.
const LIVREUR_DEPLOIEMENT_SITE = 'AKfycbxDbTnhgdjCNBqkeAblZWgS3CK-IptjJoRDQd1AtGF7WQoQkXriWGvISIo7LJG8zUtjTQ';
const LIVREUR_SITE_URL = 'https://script.google.com/macros/s/' + LIVREUR_DEPLOIEMENT_SITE + '/exec';
const LIVREUR_DEPOT = 'planningmedic/planningmedic.github.io';
const LIVREUR_API = 'https://script.googleapis.com/v1/';

/* ── Appels à l'API Apps Script, avec le jeton du compte qui exécute ── */
function _livreurApi_(methode, chemin, corps) {
  const o = { method: methode, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (corps !== undefined) { o.contentType = 'application/json'; o.payload = JSON.stringify(corps); }
  const r = UrlFetchApp.fetch(LIVREUR_API + chemin, o);
  let json = null;
  try { json = JSON.parse(r.getContentText()); } catch (e) {}
  return { code: r.getResponseCode(), json };
}
function _livreurLire_(chemin) { return _livreurApi_('get', chemin); }

// Traduit un refus de Google en geste à faire
function _livreurExpliquer_(rep) {
  const msg = (rep.json && rep.json.error && rep.json.error.message) || '';
  if (/has not enabled the Apps Script API|User has not enabled/i.test(msg))
    return 'L\'interrupteur « Google Apps Script API » est coupé : script.google.com/home/usersettings → l\'activer, attendre 2 minutes, relancer.';
  if (/has not been used in project|is disabled/i.test(msg))
    return 'Google demande d\'activer l\'API dans le projet Google Cloud de ce livreur. C\'est le cas prévu « à ajuster » : copiez ce message à Claude.';
  if (rep.code === 404) return 'Projet introuvable : vérifiez CIBLE_SCRIPT_ID (Paramètres du projet du classeur → ID du script).';
  if (rep.code === 403) return 'Accès refusé : ce livreur doit appartenir au même compte Google que le projet du classeur (planningmedic).';
  return 'Réponse inattendue (' + rep.code + ') : ' + msg.slice(0, 200);
}

/* ── Le dépôt, lu à un commit précis ── */
function _livreurBrut_(sha, chemin) {
  const r = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + LIVREUR_DEPOT + '/' + sha + '/' + chemin, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Fichier du dépôt illisible : ' + chemin + ' (HTTP ' + r.getResponseCode() + '). Rien n\'a été modifié.');
  return r.getContentText();
}
/* Charge la carte (quel fichier du dépôt devient quel fichier du projet) et
   tous les fichiers qu'elle désigne. Un seul échec = exception, rien de touché. */
function _livreurDepot_(sha) {
  const carte = JSON.parse(_livreurBrut_(sha, 'livreur/carte.json'));
  const fichiers = (carte.fichiers || []).map(function (f) {
    return { nom: f.nom, type: f.type, depot: f.depot, source: _livreurBrut_(sha, f.depot) };
  });
  if (!fichiers.length) throw new Error('Carte du dépôt vide : rien n\'a été modifié.');
  return fichiers;
}

/* ── La porte : le serveur du portail dit si ce code a la clé `maintenance` ── */
function _livreurDroit_(code) {
  if (!code) return false;
  const r = UrlFetchApp.fetch(LIVREUR_SITE_URL, { method: 'post', contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({ action: 'getMedecins', code: String(code) }), muteHttpExceptions: true, followRedirects: true });
  try { const j = JSON.parse(r.getContentText()); return !!(j && j.success && j.maintenance === true); }
  catch (e) { return false; }
}

/* ── Logique pure (testée au banc) ── */
function livreurNormaliser_(s) { return String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/\s+$/, ''); }
function livreurVersionGas_(s) { const m = String(s || '').match(/const (GAS_VERSION_\w+) = '([^']+)'/); return m ? m[2] : ''; }
const _LIVREUR_EXT_ = { SERVER_JS: '.gs', JSON: '.json', HTML: '.html' };
/* Compare le projet (actuels) au dépôt : une ligne par fichier. */
function livreurComparer_(actuels, depot) {
  const parNom = {}; (actuels || []).forEach(function (f) { parNom[f.name] = f; });
  const lignes = depot.map(function (d) {
    const a = parNom[d.nom];
    const etat = !a ? 'nouveau' : (livreurNormaliser_(a.source) === livreurNormaliser_(d.source) ? 'identique' : 'modifié');
    return { nom: d.nom + (_LIVREUR_EXT_[d.type] || ''), etat: etat, avant: a ? livreurVersionGas_(a.source) : '', apres: livreurVersionGas_(d.source) };
  });
  const dansDepot = {}; depot.forEach(function (d) { dansDepot[d.nom] = 1; });
  (actuels || []).forEach(function (a) {
    if (!dansDepot[a.name]) lignes.push({ nom: a.name + (_LIVREUR_EXT_[a.type] || ''), etat: 'hors dépôt (conservé)', avant: livreurVersionGas_(a.source), apres: '' });
  });
  return lignes;
}
/* Le contenu complet à envoyer : l'API remplace TOUT le projet, un fichier
   oublié serait supprimé. On part donc des fichiers actuels : ceux de la carte
   sont remplacés, les autres conservés, les nouveaux ajoutés. */
function livreurFusionner_(actuels, depot) {
  const parNom = {}; depot.forEach(function (d) { parNom[d.nom] = d; });
  const vus = {};
  const out = (actuels || []).map(function (a) {
    const d = parNom[a.name];
    if (!d) return { name: a.name, type: a.type, source: a.source };
    vus[a.name] = 1;
    return { name: d.nom, type: d.type, source: d.source };
  });
  depot.forEach(function (d) { if (!vus[d.nom]) out.push({ name: d.nom, type: d.type, source: d.source }); });
  return out;
}
/* Un manifeste qui change les autorisations ou l'accès du site ne passe pas
   par le téléphone : le propriétaire doit réautoriser dans l'éditeur, sans
   quoi le site cesserait de répondre. Renvoie null (accepté) ou la raison. */
function livreurVerifierManifeste_(actuelSrc, nouveauSrc) {
  let a, n;
  try { a = JSON.parse(actuelSrc || '{}'); } catch (e) { return 'Manifeste en service illisible.'; }
  try { n = JSON.parse(nouveauSrc || ''); } catch (e) { return 'Manifeste du dépôt illisible (JSON invalide).'; }
  const tri = function (x) { return JSON.stringify((x || []).slice().sort()); };
  if (tri(a.oauthScopes) !== tri(n.oauthScopes))
    return 'Les autorisations du serveur changent : cette mise à jour se fait depuis l\'ordinateur (réautorisation dans l\'éditeur).';
  const wa = a.webapp || {}, wn = n.webapp || {};
  if (wa.executeAs !== wn.executeAs || wa.access !== wn.access)
    return 'L\'accès du site change (webapp) : cette mise à jour se fait depuis l\'ordinateur.';
  return null;
}

/* ── Les trois gestes ── */
function _livreurCible_() {
  const id = PropertiesService.getScriptProperties().getProperty('CIBLE_SCRIPT_ID');
  if (!id) throw new Error('Propriété CIBLE_SCRIPT_ID absente dans le livreur.');
  return id;
}
function _livreurExiger_(rep, quoi) {
  if (rep.code < 200 || rep.code > 299) throw new Error(quoi + ' refusé — ' + _livreurExpliquer_(rep));
  return rep.json || {};
}
function _livreurDeploiement_(id) {
  const d = _livreurExiger_(_livreurLire_('projects/' + encodeURIComponent(id) + '/deployments'), 'Lecture des déploiements');
  const site = (d.deployments || []).find(function (x) { return x.deploymentId === LIVREUR_DEPLOIEMENT_SITE; });
  if (!site) throw new Error('Le déploiement utilisé par le site est introuvable : rien n\'a été modifié.');
  return site;
}
/* Le code qui TOURNE : celui de la version servie par le déploiement du site
   (ou de la version indiquée, si la page vient de faire un geste). Sans numéro
   (déploiement « dernière version enregistrée »), le dernier code envoyé. */
function _livreurEnService_(id, version) {
  const chemin = 'projects/' + encodeURIComponent(id) + '/content' + (version ? '?versionNumber=' + version : '');
  return _livreurExiger_(_livreurLire_(chemin), 'Lecture du code en service');
}
function livreurEtat_(sha, versionIndiquee) {
  const id = _livreurCible_();
  const site = _livreurDeploiement_(id);
  const servie = versionIndiquee || (site.deploymentConfig || {}).versionNumber || null;
  const contenu = _livreurEnService_(id, servie);
  const v = _livreurLire_('projects/' + encodeURIComponent(id) + '/versions?pageSize=6');
  const depot = _livreurDepot_(sha);
  const lignes = livreurComparer_(contenu.files, depot);
  const manif = (depot.find(function (d) { return d.type === 'JSON'; }) || {}).source;
  const manifActuel = ((contenu.files || []).find(function (f) { return f.type === 'JSON'; }) || {}).source;
  const P = PropertiesService.getScriptProperties();
  return {
    success: true, sha: sha,
    enService: servie,
    fichiers: lignes,
    aChanger: lignes.filter(function (l) { return l.etat === 'modifié' || l.etat === 'nouveau'; }).length,
    blocage: manif ? livreurVerifierManifeste_(manifActuel, manif) : null,
    precedente: Number(P.getProperty('PRECEDENTE')) || null,
    historique: ((v.json && v.json.versions) || []).map(function (x) { return { n: x.versionNumber, description: x.description || '', le: x.createTime || '' }; }),
  };
}
function livreurAppliquer_(sha) {
  const id = _livreurCible_(), P = PropertiesService.getScriptProperties();
  const site = _livreurDeploiement_(id);
  const avant = (site.deploymentConfig || {}).versionNumber || null;
  const contenu = _livreurEnService_(id, avant);                         // ce qui TOURNE
  const depot = _livreurDepot_(sha);                                   // tout ou rien
  const manif = (depot.find(function (d) { return d.type === 'JSON'; }) || {}).source;
  const manifActuel = ((contenu.files || []).find(function (f) { return f.type === 'JSON'; }) || {}).source;
  const refus = manif ? livreurVerifierManifeste_(manifActuel, manif) : null;
  if (refus) throw new Error(refus + ' Rien n\'a été modifié.');
  const lignes = livreurComparer_(contenu.files, depot);
  const n = lignes.filter(function (l) { return l.etat === 'modifié' || l.etat === 'nouveau'; }).length;
  if (!n) return { success: true, rien: true, enService: avant };
  const court = String(sha).slice(0, 7), quand = Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM HH:mm');
  // 1. Sauvegarde : une version de l'état actuel (immuable, restaurable)
  _livreurExiger_(_livreurApi_('post', 'projects/' + encodeURIComponent(id) + '/versions', { description: 'Sauvegarde avant livraison ' + court + ' (' + quand + ')' }), 'Sauvegarde');
  // 2. Le nouveau code (le projet entier : rien d'oublié)
  _livreurExiger_(_livreurApi_('put', 'projects/' + encodeURIComponent(id) + '/content', { files: livreurFusionner_(contenu.files, depot) }), 'Envoi du code');
  // 3. La version livrée
  const ver = _livreurExiger_(_livreurApi_('post', 'projects/' + encodeURIComponent(id) + '/versions', { description: 'Livreur ' + court + ' (' + quand + ')' }), 'Création de la version');
  // 4. Le déploiement EXISTANT bascule dessus : même adresse
  _livreurExiger_(_livreurApi_('put', 'projects/' + encodeURIComponent(id) + '/deployments/' + LIVREUR_DEPLOIEMENT_SITE,
    { deploymentConfig: { scriptId: id, versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: 'Livreur ' + court } }), 'Bascule du déploiement');
  if (avant) P.setProperty('PRECEDENTE', String(avant));
  P.setProperty('DERNIER_SHA', String(sha));
  const apres = (_livreurDeploiement_(id).deploymentConfig || {}).versionNumber;
  return { success: apres === ver.versionNumber, enService: apres, version: ver.versionNumber, precedente: avant, fichiers: n,
           error: apres === ver.versionNumber ? undefined : 'Le déploiement ne sert pas la version attendue : relancer « Vérifier ».' };
}
function livreurRevenir_() {
  const id = _livreurCible_(), P = PropertiesService.getScriptProperties();
  const cible = Number(P.getProperty('PRECEDENTE'));
  if (!cible) throw new Error('Aucune version précédente connue : rien à annuler.');
  const avant = (_livreurDeploiement_(id).deploymentConfig || {}).versionNumber || null;
  _livreurExiger_(_livreurApi_('put', 'projects/' + encodeURIComponent(id) + '/deployments/' + LIVREUR_DEPLOIEMENT_SITE,
    { deploymentConfig: { scriptId: id, versionNumber: cible, manifestFileName: 'appsscript', description: 'Livreur : retour à la version ' + cible } }), 'Retour en arrière');
  if (avant) P.setProperty('PRECEDENTE', String(avant));
  return { success: true, enService: cible, precedente: avant };
}

/* ── Point d'entrée de la page Maintenance ── */
function doPost(e) {
  let rep;
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!_livreurDroit_(p.code)) rep = { success: false, error: 'Accès refusé' };
    else if (p.action === 'etat' || p.action === 'appliquer') {
      if (!/^[0-9a-f]{40}$/.test(String(p.sha || ''))) rep = { success: false, error: 'Commit du dépôt manquant ou invalide.' };
      else if (p.action === 'etat') rep = livreurEtat_(p.sha, /^\d{1,6}$/.test(String(p.version || '')) ? Number(p.version) : null);
      else rep = _livreurSousVerrou_(function () { return livreurAppliquer_(p.sha); });
    }
    else if (p.action === 'revenir') rep = _livreurSousVerrou_(livreurRevenir_);
    else rep = { success: false, error: 'Action inconnue' };
  } catch (err) { rep = { success: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(rep)).setMimeType(ContentService.MimeType.JSON);
}
function _livreurSousVerrou_(fn) {
  const v = LockService.getScriptLock();
  if (!v.tryLock(2000)) return { success: false, error: 'Une mise à jour est déjà en cours : patientez une minute.' };
  try { return fn(); } finally { v.releaseLock(); }
}

/* ── Étape 1, conservée : diagnostic d'accès depuis l'éditeur, LECTURE SEULE ── */
function testerAcces() {
  const lignes = ['Livreur ' + GAS_VERSION_LIVREUR + ' — test en LECTURE SEULE'];
  const ok = t => lignes.push('✅ ' + t), ko = t => lignes.push('❌ ' + t), info = t => lignes.push('   ' + t);
  const id = PropertiesService.getScriptProperties().getProperty('CIBLE_SCRIPT_ID');
  if (!id) {
    ko('Propriété CIBLE_SCRIPT_ID absente : Paramètres du projet (roue dentée) → Propriétés du script → Ajouter : CIBLE_SCRIPT_ID = l\'ID du script du classeur.');
    Logger.log(lignes.join('\n')); return lignes.join('\n');
  }

  // 1. Les fichiers du projet principal (noms et tailles seulement)
  const c = _livreurLire_('projects/' + encodeURIComponent(id) + '/content');
  if (c.code !== 200) { ko('Lecture des fichiers refusée — ' + _livreurExpliquer_(c)); Logger.log(lignes.join('\n')); return lignes.join('\n'); }
  const fichiers = (c.json.files || []).map(f => ({ nom: f.name + (f.type === 'JSON' ? '.json' : f.type === 'HTML' ? '.html' : '.gs'), taille: (f.source || '').length }));
  ok('API Apps Script joignable : ' + fichiers.length + ' fichiers dans le projet du classeur');
  fichiers.forEach(f => info('· ' + f.nom + ' (' + f.taille + ' caractères)'));

  // 2. Les versions
  const v = _livreurLire_('projects/' + encodeURIComponent(id) + '/versions?pageSize=50');
  if (v.code !== 200) ko('Lecture des versions refusée — ' + _livreurExpliquer_(v));
  else {
    const vs = (v.json.versions || []).map(x => x.versionNumber).sort((a, b) => b - a);
    ok('Versions lisibles : la plus récente est la n° ' + (vs[0] || '—'));
  }

  // 3. Le déploiement du site
  const d = _livreurLire_('projects/' + encodeURIComponent(id) + '/deployments');
  if (d.code !== 200) ko('Lecture des déploiements refusée — ' + _livreurExpliquer_(d));
  else {
    const tous = d.json.deployments || [];
    const site = tous.find(x => x.deploymentId === LIVREUR_DEPLOIEMENT_SITE);
    if (site) {
      const cfg = site.deploymentConfig || {};
      ok('Déploiement du site retrouvé (même adresse que les pages) : il sert la version n° ' + (cfg.versionNumber || '« dernière enregistrée »'));
    } else ko('Le déploiement utilisé par le site est introuvable parmi les ' + tous.length + ' déploiements : NE RIEN FAIRE, prévenir Claude.');
    info(tous.length + ' déploiement(s) au total.');
  }
  lignes.push('Aucune modification faite : testerAcces ne fait que lire.');
  Logger.log(lignes.join('\n'));
  return lignes.join('\n');
}
