const GAS_VERSION_LIVREUR = '2026-10-31.1';
/* ═══ LIVREUR — mise à jour du serveur Apps Script depuis le téléphone ═══════
   PROJET APPS SCRIPT SÉPARÉ, à ne PAS recopier dans le projet du classeur.
   Idée (conçue le 09/08/2026, relancée le 31/10/2026) : ce petit projet est le
   SEUL à détenir le droit de réécrire le serveur principal. Le serveur du
   portail, lui, ne gagne aucun droit nouveau.

   ÉTAPE 1 (ce fichier) — LECTURE SEULE. testerAcces() vérifie que Google
   accepte les appels à l'« API Apps Script » depuis ce projet : il lit la
   liste des fichiers du projet principal (noms seulement, jamais leur
   contenu), ses versions et ses déploiements, et retrouve le déploiement
   dont l'adresse est utilisée par le site. Il ne modifie RIEN : ce projet
   n'a que des autorisations « readonly » (voir appsscript.json).

   Installation : voir livreur/README.md. */

// Identifiant du déploiement utilisé par le site (déjà public : il figure dans
// l'adresse du serveur, écrite dans les pages). Ne jamais en créer un autre.
const LIVREUR_DEPLOIEMENT_SITE = 'AKfycbxDbTnhgdjCNBqkeAblZWgS3CK-IptjJoRDQd1AtGF7WQoQkXriWGvISIo7LJG8zUtjTQ';

// Lecture seule : uniquement des GET vers l'API Apps Script.
function _livreurLire_(chemin) {
  const r = UrlFetchApp.fetch('https://script.googleapis.com/v1/' + chemin, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  let json = null;
  try { json = JSON.parse(r.getContentText()); } catch (e) {}
  return { code: r.getResponseCode(), json };
}

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
  lignes.push('Aucune modification faite : ce projet n\'a que des droits de lecture.');
  Logger.log(lignes.join('\n'));
  return lignes.join('\n');
}
