/* ═══ BANC — LIVREUR, étape 1 : test d'accès en LECTURE SEULE (31/10/2026) ═══
   Le vrai livreur.gs exécuté avec un faux UrlFetchApp. On prouve : il ne fait
   que des GET vers l'API Apps Script ; il ne recopie jamais le contenu des
   fichiers dans son journal ; il retrouve le déploiement du site ; chaque
   refus de Google est traduit en geste à faire ; ses autorisations sont
   « readonly ». Ce que le banc ne prouve PAS : que Google accepte réellement
   l'appel depuis le projet — c'est précisément ce que le test réel vérifiera. */
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
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'CIBLE_SCRIPT_ID' ? id : null) }) },
    UrlFetchApp: { fetch: (u, o) => { appels.push({ u, m: (o && o.method) || 'get', o }); const k = Object.keys(reponses).find(s => u.includes(s)); const r = reponses[k] || { code: 500, body: {} };
      return { getResponseCode: () => r.code, getContentText: () => JSON.stringify(r.body) }; } },
    encodeURIComponent, JSON,
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
V('autorisations du livreur : lecture seule pour les projets et les déploiements', MANIF.oauthScopes.includes('https://www.googleapis.com/auth/script.projects.readonly')
  && MANIF.oauthScopes.includes('https://www.googleapis.com/auth/script.deployments.readonly') && !MANIF.oauthScopes.some(s => /script\.(projects|deployments)$/.test(s)), MANIF.oauthScopes);
V('aucune écriture possible dans le code (ni PUT, ni POST, ni création de version)', !/method:\s*'(put|post|patch|delete)'/i.test(SRC) && !/versions'\s*,\s*\{\s*method/i.test(SRC));
const a = lancer({ reponses: BON });
V('trois lectures, toutes en GET, toutes vers l\'API Apps Script', a.appels.length === 3 && a.appels.every(x => x.m === 'get' && x.u.startsWith('https://script.googleapis.com/v1/projects/ID_SCRIPT_TEST/')), a.appels.map(x => x.m + ' ' + x.u));
V('authentification par le compte qui exécute (jeton Apps Script)', a.appels.every(x => x.o.headers.Authorization === 'Bearer JETON'));
V('journal : la liste des fichiers avec leur taille, JAMAIS leur contenu', /3 fichiers/.test(a.sortie) && /Code\.gs \(25 caractères\)/.test(a.sortie) && /appsscript\.json/.test(a.sortie) && !a.sortie.includes(SECRET) && !a.journal.includes(SECRET), a.sortie);
V('version la plus récente : n° 87', /la plus récente est la n° 87/.test(a.sortie));
V('déploiement du site retrouvé, version servie n° 87', /Déploiement du site retrouvé.*n° 87/.test(a.sortie) && /2 déploiement/.test(a.sortie));
V('il le dit : aucune modification faite', /Aucune modification faite/.test(a.sortie));

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

console.log(`\n${ok} ✓  ${ko} ✗`);
process.exit(ko ? 1 : 0);
