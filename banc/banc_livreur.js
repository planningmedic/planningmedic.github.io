/* ═══ BANC — LIVREUR (31/10/2026 : étape 1, lecture seule ; 01/11/2026 : étape 3, la livraison) ═══
   Le vrai livreur.gs exécuté avec un faux UrlFetchApp. On prouve : il ne fait
   que des GET vers l'API Apps Script ; il ne recopie jamais le contenu des
   fichiers dans son journal ; il retrouve le déploiement du site ; chaque
   refus de Google est traduit en geste à faire ; ses autorisations sont
   « readonly ». Ce que le banc ne prouve PAS : que Google accepte réellement
   l'appel depuis le projet — vérifié en réel le 01/11/2026 (trois ✅).
   (01/11/2026) Étape 3 : [3] la carte du dépôt, [4] la logique pure (comparer,
   fusionner, manifeste), [5] la livraison complète contre une fausse API Apps
   Script, un faux GitHub et un faux serveur du portail, [6] la carte de la page.
   Ce que le banc ne prouve PAS : que Google exécute réellement la bascule —
   c'est le premier essai réel (étape 4) qui le dira. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 220) : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'livreur', 'livreur.gs'), 'utf8');
const MANIF = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'livreur', 'appsscript.json'), 'utf8'));
const SITE = 'AKfycbxDbTnhgdjCNBqkeAblZWgS3CK-IptjJoRDQd1AtGF7WQoQkXriWGvISIo7LJG8zUtjTQ';
const SECRET = 'CONTENU_SECRET_DU_FICHIER';

function lancer({ id = 'ID_SCRIPT_TEST', reponses }) {
  const appels = [], journal = [];
  const ctx = vm.createContext({
    Logger: { log: t => journal.push(String(t)) },
    ScriptApp: { getOAuthToken: () => 'JETON' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'CIBLE_SCRIPT_ID' ? id : null), setProperty: () => {} }) },
    UrlFetchApp: { fetch: (u, o) => { appels.push({ u, m: (o && o.method) || 'get', o }); const k = Object.keys(reponses).find(s => u.includes(s)); const r = reponses[k] || { code: 500, body: {} };
      return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) }; } },
    encodeURIComponent, JSON, ContentService: { MimeType: { JSON: 'j' }, createTextOutput: t => ({ setMimeType: () => t }) },
  });
  vm.runInContext(SRC, ctx);
  const sortie = vm.runInContext('testerAcces()', ctx);
  return { appels, sortie: String(sortie), journal: journal.join('\n') };
}
const BON = {
  '/content': { code: 200, body: { files: [{ name: 'Code', type: 'SERVER_JS', source: SECRET }, { name: 'appsscript', type: 'JSON', source: '{}' }, { name: 'Indispos', type: 'SERVER_JS', source: 'x'.repeat(10) }] } },
  '/versions': { code: 200, body: { versions: [{ versionNumber: 85 }, { versionNumber: 87 }, { versionNumber: 86 }] } },
  '/deployments': { code: 200, body: { deployments: [{ deploymentId: 'AKfyAUTRE' }, { deploymentId: SITE, deploymentConfig: { versionNumber: 87 } }] } },
};

console.log('\n[1] Lecture seule, sans fuite');
/* (01/11/2026) Étape 3 : le livreur ÉCRIT désormais (c'est son rôle). Ses droits
   sont bornés au strict nécessaire : projets et déploiements Apps Script, appels
   externes — ni Drive, ni Gmail, ni classeur. testerAcces, lui, reste en lecture. */
V('autorisations du livreur : projets + déploiements Apps Script + appels externes, rien d\'autre',
  JSON.stringify(MANIF.oauthScopes.slice().sort()) === JSON.stringify(['https://www.googleapis.com/auth/script.deployments', 'https://www.googleapis.com/auth/script.external_request', 'https://www.googleapis.com/auth/script.projects']), MANIF.oauthScopes);
V('publié comme application web exécutée par son propriétaire', MANIF.webapp && MANIF.webapp.executeAs === 'USER_DEPLOYING' && MANIF.webapp.access === 'ANYONE_ANONYMOUS');
const a = lancer({ reponses: BON });
V('trois lectures, toutes en GET, toutes vers l\'API Apps Script', a.appels.length === 3 && a.appels.every(x => x.m === 'get' && x.u.startsWith('https://script.googleapis.com/v1/projects/ID_SCRIPT_TEST/')), a.appels.map(x => x.m + ' ' + x.u));
V('authentification par le compte qui exécute (jeton Apps Script)', a.appels.every(x => x.o.headers.Authorization === 'Bearer JETON'));
V('journal : la liste des fichiers avec leur taille, JAMAIS leur contenu', /3 fichiers/.test(a.sortie) && /Code\.gs \(25 caractères\)/.test(a.sortie) && /appsscript\.json/.test(a.sortie) && !a.sortie.includes(SECRET) && !a.journal.includes(SECRET), a.sortie);
V('version la plus récente : n° 87', /la plus récente est la n° 87/.test(a.sortie));
V('déploiement du site retrouvé, version servie n° 87', /Déploiement du site retrouvé.*n° 87/.test(a.sortie) && /2 déploiement/.test(a.sortie));
V('il le dit : aucune modification faite', /Aucune modification faite/.test(a.sortie));
V('testerAcces reste en lecture : aucun appel autre que GET', a.appels.every(x => x.m === 'get'));

console.log('\n[2] Chaque refus de Google devient un geste à faire');
const b = lancer({ id: null, reponses: BON });
V('sans CIBLE_SCRIPT_ID : explique où la mettre, aucun appel', b.appels.length === 0 && /Propriétés du script/.test(b.sortie));
const c = lancer({ reponses: { '/content': { code: 403, body: { error: { message: 'User has not enabled the Apps Script API. Enable it by visiting https://script.google.com/home/usersettings' } } } } });
V('interrupteur coupé : renvoie vers script.google.com/home/usersettings, s\'arrête', /home\/usersettings/.test(c.sortie) && c.appels.length === 1);
const d = lancer({ reponses: { '/content': { code: 403, body: { error: { message: 'Apps Script API has not been used in project 1234 before or it is disabled.' } } } } });
V('projet Google Cloud à régler : le dit, demande de copier le message à Claude', /projet Google Cloud/.test(d.sortie) && /copiez ce message à Claude/.test(d.sortie));
const e = lancer({ reponses: { '/content': { code: 404, body: { error: { message: 'Requested entity was not found.' } } } } });
V('mauvais ID : renvoie vers l\'ID du script du classeur', /vérifiez CIBLE_SCRIPT_ID/.test(e.sortie));
const f = lancer({ reponses: Object.assign({}, BON, { '/deployments': { code: 200, body: { deployments: [{ deploymentId: 'AKfyAUTRE' }] } } }) });
V('déploiement du site absent : « NE RIEN FAIRE, prévenir Claude »', /NE RIEN FAIRE/.test(f.sortie) && !/retrouvé/.test(f.sortie));
V('identifiant du déploiement = celui de l\'adresse écrite dans le site', fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').includes('/macros/s/' + SITE + '/exec') && SRC.includes("'" + SITE + "'"));
V('le livreur n\'est pas un fichier du projet du classeur (hors de gas/)', !fs.existsSync(path.join(__dirname, '..', 'gas', 'livreur.gs')));

/* ═══ Étape 3 (01/11/2026) ═══ */
console.log('\n[3] La carte du dépôt : chaque fichier du serveur, et lui seul');
const CARTE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'livreur', 'carte.json'), 'utf8')).fichiers;
{
  const gasFichiers = fs.readdirSync(path.join(__dirname, '..', 'gas')).filter(f => f.endsWith('.gs') && f !== 'dev.gs');
  V('chaque .gs de gas/ (sauf dev.gs) est dans la carte', gasFichiers.every(f => CARTE.some(c => c.depot === 'gas/' + f)), gasFichiers.filter(f => !CARTE.some(c => c.depot === 'gas/' + f)));
  V('dev.gs n\'y est pas (jamais déployé)', !CARTE.some(c => /dev\.gs$/.test(c.depot)));
  V('les deux fichiers vivant ailleurs y sont : sauvegarde.gs et partage/dispo_jour.js',
    CARTE.some(c => c.depot === 'sauvegarde.gs' && c.nom === 'sauvegarde') && CARTE.some(c => c.depot === 'partage/dispo_jour.js' && c.nom === 'dispo_jour'));
  V('le manifeste y est, en JSON', CARTE.some(c => c.depot === 'gas/appsscript.json' && c.nom === 'appsscript' && c.type === 'JSON'));
  V('code.gs devient « Code » (le nom dans l\'éditeur)', CARTE.some(c => c.depot === 'gas/code.gs' && c.nom === 'Code'));
  V('chaque chemin de la carte existe dans le dépôt', CARTE.every(c => fs.existsSync(path.join(__dirname, '..', c.depot))), CARTE.filter(c => !fs.existsSync(path.join(__dirname, '..', c.depot))).map(c => c.depot));
  V('aucun nom en double', new Set(CARTE.map(c => c.nom)).size === CARTE.length);
  V('17 fichiers, comme le projet en service (vérifié en réel le 01/11)', CARTE.length === 17, CARTE.length);
}

/* Un contexte d'exécution complet : fausse API Apps Script, faux GitHub, faux serveur du portail. */
function monde(opts) {
  opts = opts || {};
  const appels = [], props = Object.assign({ CIBLE_SCRIPT_ID: 'ID_SCRIPT_TEST' }, opts.props || {});
  const projet = { files: (opts.fichiers || [
    { name: 'Code', type: 'SERVER_JS', source: "const GAS_VERSION_CODE = '2026-10-27.2';\nfunction a(){}" },
    { name: 'equipe', type: 'SERVER_JS', source: "const GAS_VERSION_EQUIPE = '2026-10-27.1';\nfunction b(){}" },
    { name: 'brouillon', type: 'SERVER_JS', source: 'function horsDepot(){}' },
    { name: 'appsscript', type: 'JSON', source: '{"oauthScopes":["a","b"],"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}' },
  ]).map(f => Object.assign({}, f)) };
  const depot = Object.assign({
    'livreur/carte.json': JSON.stringify({ fichiers: [
      { depot: 'gas/code.gs', nom: 'Code', type: 'SERVER_JS' }, { depot: 'gas/equipe.gs', nom: 'equipe', type: 'SERVER_JS' },
      { depot: 'gas/neuf.gs', nom: 'neuf', type: 'SERVER_JS' }, { depot: 'gas/appsscript.json', nom: 'appsscript', type: 'JSON' } ] }),
    'gas/code.gs': "const GAS_VERSION_CODE = '2026-10-27.2';\nfunction a(){}\n",                     // identique (au retour à la ligne près)
    'gas/equipe.gs': "const GAS_VERSION_EQUIPE = '2026-11-01.1';\nfunction b(){ return 2; }",        // modifié
    'gas/neuf.gs': "const GAS_VERSION_NEUF = '2026-11-01.1';",                                      // nouveau
    'gas/appsscript.json': '{"oauthScopes":["a","b"],"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}',   // identique
  }, opts.depot || {});
  let deployee = opts.deployee || 57, prochaine = 58;
  const copieFichiers = () => projet.files.map(f => Object.assign({}, f));
  const versions = [{ versionNumber: 57, description: 'v1.53.0', fichiers: copieFichiers() }, { versionNumber: 56, description: '', fichiers: copieFichiers() }];
  const reponse = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const ctx = vm.createContext({
    Logger: { log: () => {} }, ScriptApp: { getOAuthToken: () => 'JETON' }, encodeURIComponent, JSON, String, Number, Object, Array,
    Utilities: { formatDate: () => '01/11 18:00' },
    LockService: { getScriptLock: () => ({ tryLock: () => !opts.verrouPris, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    ContentService: { MimeType: { JSON: 'j' }, createTextOutput: t => ({ setMimeType: () => t }) },
    UrlFetchApp: { fetch: (u, o) => {
      const m = ((o && o.method) || 'get').toLowerCase(); const corps = o && o.payload ? JSON.parse(o.payload) : null;
      appels.push({ u, m, corps });
      if (u.indexOf('/macros/s/') > -1) return reponse(200, { success: true, maintenance: corps && corps.code === 'MOI' });
      if (u.indexOf('raw.githubusercontent.com') > -1) {
        const k = u.split('/').slice(6).join('/');
        if (opts.manquant === k || !(k in depot)) return reponse(404, 'Not Found');
        return reponse(200, depot[k]);
      }
      const vq = u.match(/\/content\?versionNumber=(\d+)$/);
      if (vq) { const v = versions.find(x => x.versionNumber === Number(vq[1])); return v ? reponse(200, { files: v.fichiers }) : reponse(404, { error: { message: 'not found' } }); }
      if (/\/content$/.test(u) && m === 'get') return reponse(200, projet);
      if (/\/content$/.test(u) && m === 'put') { projet.files = corps.files; return reponse(200, corps); }
      if (/\/deployments$/.test(u)) return reponse(200, { deployments: [{ deploymentId: 'AUTRE' }, { deploymentId: SITE, deploymentConfig: { versionNumber: opts.deploiementFige || deployee } }] });
      if (/\/deployments\//.test(u) && m === 'put') { if (opts.basculeRefusee) return reponse(500, { error: { message: 'boom' } }); deployee = corps.deploymentConfig.versionNumber; return reponse(200, {}); }
      if (/\/versions/.test(u) && m === 'post') { const n = prochaine++; versions.unshift({ versionNumber: n, description: corps.description, fichiers: copieFichiers() }); return reponse(200, { versionNumber: n }); }
      if (/\/versions/.test(u)) return reponse(200, { versions });
      return reponse(500, {});
    } },
  });
  vm.runInContext(SRC, ctx);
  const post = p => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(p) } }));
  return { ctx, appels, props, projet, post, deployee: () => deployee, versions };
}
const SHA = 'a'.repeat(40);
const ecritures = ap => ap.filter(a => a.m !== 'get' && a.u.indexOf('script.googleapis.com') > -1);

console.log('\n[4] La logique pure');
{
  const { ctx } = monde();
  V('normaliser : retours chariot et blancs de fin ignorés', ctx.livreurNormaliser_('a\r\nb  \n\n') === ctx.livreurNormaliser_('a\nb'));
  V('version GAS lue dans la source', ctx.livreurVersionGas_("const GAS_VERSION_X = '2026-11-01.1';") === '2026-11-01.1');
  const actuels = [{ name: 'A', type: 'SERVER_JS', source: 'x' }, { name: 'B', type: 'SERVER_JS', source: 'y' }, { name: 'H', type: 'SERVER_JS', source: 'h' }];
  const dep = [{ nom: 'A', type: 'SERVER_JS', source: 'x\n' }, { nom: 'B', type: 'SERVER_JS', source: 'y2' }, { nom: 'N', type: 'SERVER_JS', source: 'n' }];
  const L = ctx.livreurComparer_(actuels, dep);
  V('comparer : identique / modifié / nouveau / hors dépôt', JSON.stringify(L.map(l => l.nom + ':' + l.etat)) === JSON.stringify(['A.gs:identique', 'B.gs:modifié', 'N.gs:nouveau', 'H.gs:hors dépôt (conservé)']), L.map(l => l.nom + ':' + l.etat));
  const F = ctx.livreurFusionner_(actuels, dep);
  V('fusionner : le fichier hors dépôt est CONSERVÉ (l\'API supprimerait un fichier omis)', F.some(f => f.name === 'H' && f.source === 'h'));
  V('fusionner : les fichiers de la carte sont remplacés, le nouveau ajouté', F.find(f => f.name === 'B').source === 'y2' && F.some(f => f.name === 'N') && F.length === 4);
  const naif = dep.map(d => ({ name: d.nom }));
  V('contre-épreuve : n\'envoyer que la carte aurait supprimé le fichier hors dépôt', !naif.some(f => f.name === 'H'));
  const M = '{"oauthScopes":["a","b"],"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}';
  V('manifeste identique (scopes dans un autre ordre) : accepté', ctx.livreurVerifierManifeste_(M, '{"oauthScopes":["b","a"],"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}') === null);
  V('une autorisation en plus : REFUSÉ (réautorisation à faire depuis l\'ordinateur)', /autorisations/.test(ctx.livreurVerifierManifeste_(M, '{"oauthScopes":["a","b","c"],"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}') || ''));
  V('l\'accès du site qui change : REFUSÉ', /accès du site/.test(ctx.livreurVerifierManifeste_(M, '{"oauthScopes":["a","b"],"webapp":{"executeAs":"USER_ACCESSING","access":"ANYONE"}}') || ''));
  V('manifeste du dépôt illisible : REFUSÉ', /illisible/.test(ctx.livreurVerifierManifeste_(M, '{pas du json') || ''));
  const vrai = fs.readFileSync(path.join(__dirname, '..', 'gas', 'appsscript.json'), 'utf8');
  V('le vrai manifeste du serveur, comparé à lui-même : accepté', ctx.livreurVerifierManifeste_(vrai, vrai) === null);
}

console.log('\n[5] La livraison, de bout en bout');
{
  let w = monde();
  let r = w.post({ action: 'etat', code: 'AUTRE', sha: SHA });
  V('code sans la clé maintenance : « Accès refusé », aucun appel à l\'API Apps Script', r.error === 'Accès refusé' && !w.appels.some(a => a.u.indexOf('script.googleapis.com') > -1));
  V('la porte est demandée au serveur du portail (getMedecins), avec le code reçu', w.appels[0].u.indexOf('/macros/s/' + SITE + '/exec') > -1 && w.appels[0].corps.action === 'getMedecins' && w.appels[0].corps.code === 'AUTRE');
  r = w.post({ action: 'etat', code: 'MOI', sha: 'main' });
  V('commit « main » refusé : il faut un commit précis', /Commit/.test(r.error || ''));

  w = monde();
  r = w.post({ action: 'etat', code: 'MOI', sha: SHA });
  V('état : version en service lue (57)', r.success && r.enService === 57, r);
  V('état : 2 fichiers à changer (equipe modifié, neuf nouveau)', r.aChanger === 2, r.fichiers);
  V('état : versions avant → après affichables', r.fichiers.some(f => f.nom === 'equipe.gs' && f.avant === '2026-10-27.1' && f.apres === '2026-11-01.1'));
  V('état : le fichier hors dépôt est signalé « conservé »', r.fichiers.some(f => f.nom === 'brouillon.gs' && /conservé/.test(f.etat)));
  V('état : aucune écriture', ecritures(w.appels).length === 0);
  V('état : les fichiers sont lus AU COMMIT DEMANDÉ', w.appels.filter(a => a.u.indexOf('raw.githubusercontent.com') > -1).every(a => a.u.indexOf('/' + SHA + '/') > -1));

  r = w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  const ec = ecritures(w.appels).map(a => a.m + ' ' + a.u.replace(/.*\/projects\/ID_SCRIPT_TEST/, ''));
  V('appliquer : sauvegarde, code, version, bascule — dans cet ordre', JSON.stringify(ec) === JSON.stringify(['post /versions', 'put /content', 'post /versions', 'put /deployments/' + SITE]), ec);
  V('appliquer : la bascule vise le déploiement EXISTANT (même adresse)', w.appels.some(a => a.m === 'put' && a.u.endsWith('/deployments/' + SITE)) && !w.appels.some(a => a.m === 'post' && /\/deployments$/.test(a.u)));
  V('appliquer : le site sert la nouvelle version (59 : 58 = sauvegarde)', r.success && r.version === 59 && w.deployee() === 59, r);
  V('appliquer : la précédente (57) est retenue pour « Revenir »', r.precedente === 57 && w.props.PRECEDENTE === '57');
  V('appliquer : le projet garde le fichier hors dépôt', w.projet.files.some(f => f.name === 'brouillon'));
  V('appliquer : equipe porte la version du dépôt, neuf est ajouté', /2026-11-01\.1/.test(w.projet.files.find(f => f.name === 'equipe').source) && w.projet.files.some(f => f.name === 'neuf'));
  V('appliquer : les descriptions de version disent ce qu\'elles sont', /Sauvegarde avant livraison aaaaaaa/.test(w.versions[1].description) && /Livreur aaaaaaa/.test(w.versions[0].description));

  r = w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  V('réappliquer le même commit : « rien à changer », aucune écriture de plus', r.success && r.rien === true && ecritures(w.appels).length === 4);

  r = w.post({ action: 'revenir', code: 'MOI' });
  V('revenir : le déploiement rebascule sur la 57', r.success && w.deployee() === 57 && r.enService === 57);
  V('revenir : et l\'on peut re-revenir (la 59 devient la précédente)', w.props.PRECEDENTE === '59');
  V('revenir : aucune réécriture du code (seulement le déploiement)', ecritures(w.appels).slice(4).every(a => /\/deployments\//.test(a.u)));

  /* (01/11/2026) DÉFAUT VU AU PREMIER ESSAI RÉEL : après « Revenir », la carte disait
     « À jour » (comparaison avec le dernier code ENVOYÉ) et masquait « Appliquer ».
     On compare désormais avec la version qui TOURNE. */
  r = w.post({ action: 'etat', code: 'MOI', sha: SHA });
  V('après un retour : l\'état compare à la version qui TOURNE (57) — 2 fichiers à relivrer', r.success && r.enService === 57 && r.aChanger === 2, { en: r.enService, n: r.aChanger });
  V('l\'état lit le code de la version servie (content?versionNumber=57)', w.appels.some(a => /\/content\?versionNumber=57$/.test(a.u)));
  r = w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  V('après un retour : on peut RELIVRER (nouvelle version servie, 61)', r.success && !r.rien && w.deployee() === 61 && r.version === 61, r);
  V('et la précédente redevient 57', w.props.PRECEDENTE === '57');
}
{
  /* Google renvoie l'ancien déploiement quelques secondes après la bascule : la page
     indique la version qu'elle sait en service. */
  const w = monde();
  w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  const fige = monde({ deploiementFige: 57 });
  fige.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  const sansIndice = fige.post({ action: 'etat', code: 'MOI', sha: SHA });
  const avecIndice = fige.post({ action: 'etat', code: 'MOI', sha: SHA, version: 59 });
  V('déploiement relu en retard : sans indice, l\'état montre l\'ancienne version (le défaut affiché)', sansIndice.enService === 57);
  V('avec la version indiquée par la page : « 59 », et rien à changer', avecIndice.enService === 59 && avecIndice.aChanger === 0, { en: avecIndice.enService, n: avecIndice.aChanger });
  V('une version indiquée non numérique est ignorée', fige.post({ action: 'etat', code: 'MOI', sha: SHA, version: '59; x' }).enService === 57);
}
{
  const w = monde({ manquant: 'gas/neuf.gs' });
  const r = w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  V('un fichier du dépôt illisible : refus, RIEN n\'est écrit', !r.success && /illisible/.test(r.error) && ecritures(w.appels).length === 0, r);
}
{
  const w = monde({ depot: { 'gas/appsscript.json': '{"oauthScopes":["a","b","c"],"webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}' } });
  const e = w.post({ action: 'etat', code: 'MOI', sha: SHA });
  V('autorisations changées : l\'état le signale (la page masque « Appliquer »)', /autorisations/.test(e.blocage || ''));
  const r = w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  V('autorisations changées : appliquer est refusé, rien n\'est écrit', !r.success && /ordinateur/.test(r.error) && ecritures(w.appels).length === 0);
}
{
  const w = monde({ verrouPris: true });
  const r = w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  V('une livraison déjà en cours : la seconde attend, rien n\'est écrit', /déjà en cours/.test(r.error || '') && ecritures(w.appels).length === 0);
}
{
  const w = monde({ basculeRefusee: true });
  const r = w.post({ action: 'appliquer', code: 'MOI', sha: SHA });
  V('bascule refusée par Google : erreur dite, le site garde l\'ancienne version (57)', !r.success && /Bascule/.test(r.error) && w.deployee() === 57);
}
{
  const w = monde();
  const r = w.post({ action: 'revenir', code: 'MOI' });
  V('revenir sans précédente connue : refus clair', !r.success && /Aucune version précédente/.test(r.error));
}

/* ═══ [6] La carte de la page ═══ */
(async () => {
  console.log('\n[6] La carte « Mise à jour du serveur » de la page Maintenance');
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dodo = ms => new Promise(r => setTimeout(r, ms));
  const BRUT = fs.readFileSync(path.join(__dirname, '..', 'maintenance.html'), 'utf8');
  V('la page porte l\'emplacement de l\'adresse du livreur', /const LIVREUR_URL = '[^']*';/.test(BRUT));
  async function monter(url, livreurRep) {
    const html = BRUT.replace(/const LIVREUR_URL = '[^']*';/, "const LIVREUR_URL = '" + url + "';");
    const appels = [], erreurs = [], vc = new VirtualConsole(); vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true, url: 'https://planningmedic.github.io/maintenance.html',
      beforeParse(win) {
        win.fetch = async (u, o) => {
          if (u.indexOf('api.github.com') > -1) return { ok: true, status: 200, json: async () => ({ sha: SHA, commit: { message: 'v1.54.0 — essai\n\ndétail' } }) };
          const c = o && o.body ? JSON.parse(o.body) : {}; appels.push({ u, c });
          if (u.indexOf('LIVREUR') > -1) return { ok: true, json: async () => livreurRep(c) };
          if (c.action === 'getMedecins') return { ok: true, json: async () => ({ success: true, maintenance: true, medecins: [] }) };
          return { ok: true, json: async () => ({ success: false }) };
        };
        try { win.sessionStorage.setItem('pmViewCode', 'MOI'); } catch (e) {}
      } });
    await dodo(300);
    return { d: dom.window.document, appels, erreurs };
  }
  {
    const { d, appels } = await monter('', () => ({}));
    V('adresse vide : « pas encore installé », aucun appel au livreur', /pas encore installé/.test(d.getElementById('majCorps').textContent) && !appels.some(a => a.u.indexOf('LIVREUR') > -1));
  }
  const ETAT = { success: true, enService: 57, aChanger: 2, precedente: 56, blocage: null,
    fichiers: [{ nom: 'equipe.gs', etat: 'modifié', avant: '2026-10-27.1', apres: '2026-11-01.1' }, { nom: 'neuf.gs', etat: 'nouveau', avant: '', apres: '2026-11-01.1' }, { nom: 'Code.gs', etat: 'identique' }],
    historique: [{ n: 57, description: 'v1.53.0' }, { n: 56, description: '' }] };
  {
    let applique = null;
    const { d, appels, erreurs } = await monter('https://LIVREUR/exec', c => {
      if (c.action === 'etat') return ETAT;
      if (c.action === 'appliquer') { applique = c; return { success: true, version: 59, fichiers: 2, precedente: 57 }; }
      return { success: false };
    });
    const corps = d.getElementById('majCorps').textContent;
    V('le livreur reçoit le code de la session et le commit lu sur GitHub', appels.some(a => a.u.indexOf('LIVREUR') > -1 && a.c.action === 'etat' && a.c.code === 'MOI' && a.c.sha === SHA));
    V('affiche : version en service, « 2 fichiers à changer », commit court et son titre', /version 57/.test(corps) && /2 fichiers à changer/.test(corps) && /aaaaaaa · v1\.54\.0 — essai/.test(corps), corps.slice(0, 200));
    V('liste les fichiers changés avec avant → après, et compte les identiques', /equipe\.gs/.test(corps) && /2026-10-27\.1 → 2026-11-01\.1/.test(corps) && /Les 1 autres fichiers sont identiques/.test(corps));
    const b = d.getElementById('btnMajAppliquer');
    V('« Appliquer » visible, « Revenir (v56) » disponible', !b.hidden && d.getElementById('btnMajRevenir').textContent === 'Revenir (v56)' && !d.getElementById('btnMajRevenir').disabled);
    b.click(); await dodo(30);
    V('premier appui : armé, rien n\'est livré', b.classList.contains('arm') && !applique);
    b.click(); await dodo(200);
    V('second appui : livre CE commit-là', applique && applique.sha === SHA && applique.code === 'MOI');
    V('après la livraison, la carte redemande l\'état en indiquant la version livrée (59)', appels.some(a => a.u.indexOf('LIVREUR') > -1 && a.c.action === 'etat' && a.c.version === 59));
    V('le résultat dit la version en service et « même adresse »', /version 59/.test(d.getElementById('majRes').textContent) && /Même adresse/.test(d.getElementById('majRes').textContent), d.getElementById('majRes').textContent);
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
  }
  {
    const { d } = await monter('https://LIVREUR/exec', c => c.action === 'etat' ? Object.assign({}, ETAT, { aChanger: 0, fichiers: [{ nom: 'Code.gs', etat: 'identique' }] }) : {});
    V('à jour : case verte « À jour », pas de bouton Appliquer', /À jour/.test(d.getElementById('majCorps').textContent) && d.getElementById('btnMajAppliquer').hidden);
  }
  {
    const { d } = await monter('https://LIVREUR/exec', c => c.action === 'etat' ? Object.assign({}, ETAT, { blocage: 'Les autorisations du serveur changent : cette mise à jour se fait depuis l\'ordinateur.' }) : {});
    V('blocage (autorisations) : dit, et « Appliquer » masqué', /ordinateur/.test(d.getElementById('majCorps').textContent) && d.getElementById('btnMajAppliquer').hidden);
  }
  {
    const { d } = await monter('https://LIVREUR/exec', () => ({ success: false, error: 'Accès refusé' }));
    V('livreur qui refuse le code : message « réservée »', /réservée/.test(d.getElementById('majCorps').textContent));
  }
  console.log(`\n${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})();

