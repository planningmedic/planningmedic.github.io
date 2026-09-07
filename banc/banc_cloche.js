/* ═══ BANC — LA CLOCHE : journal des notifications (23/08/2026) ═══
   Le principe testé : le SERVEUR note ce qu'il envoie, avant même de tenter
   l'envoi — la ligne existe même si le relais est injoignable. Les VRAIES
   fonctions de gas/miroir.gs tournent ici sur le classeur simulé :
   1. l'inscription (ciblée, à tous, comité exclu, test exclu) ;
   2. l'ordre : le journal s'écrit AVANT l'appel au relais ;
   3. la panne du relais ne perd jamais la ligne ;
   4. la purge des 30 jours, au fil de l'eau, sans déclencheur ;
   5. la construction de la clé `notifs` (groupée, triée, bornée) ;
   6. le dashboard : la clé voyage dans l'appel d'ouverture (zéro requête
      ajoutée), la cloche existe, le rendu échappe le HTML. */
const vm = require('vm');
const fs = require('fs');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 180) : '')); } };

function monter(feuilleInitiale) {
  const cl = new Classeur();
  if (feuilleInitiale) cl.ajouter('NOTIFS_JOURNAL', feuilleInitiale);
  const evenements = [];   // l'ordre réel : écritures du classeur, puis appels HTTP
  const familles = [];
  let relaisEnPanne = false;
  const ctx = vm.createContext({
    console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => cl,
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'JETON-BANC' }) },
    UrlFetchApp: { fetch: (url, opts) => {
      evenements.push({ type: 'fetch', url });
      if (relaisEnPanne) throw new Error('relais injoignable');
      return { getResponseCode: () => 200, getContentText: () => '{"success":true,"envoyees":1}' };
    } },
    _miroirNoterPoussee_: (f, y) => familles.push({ familles: f.slice(), annee: y }),
    getActiveYear: () => 2026,
    MIROIR_URL: 'https://miroir.test',
  });
  ctx.globalThis = ctx;
  // Les constantes vivent hors des fonctions : on les redéclare depuis la source.
  const src = fs.readFileSync('../gas/miroir.gs', 'utf8');
  ['NOTIF_JOURNAL_ONGLET', 'NOTIF_JOURNAL_JOURS'].forEach(n => {
    const m = src.match(new RegExp('const ' + n + '\\s*=\\s*[^;]+;'));
    vm.runInContext(m[0], ctx);
  });
  ['_notifJournalNoter_', '_miroirConstruireNotifs_', 'notifierPush_'].forEach(n =>
    vm.runInContext(extraireFonction('../gas/miroir.gs', n), ctx));
  // observer les écritures du classeur DANS le fil des événements
  const { brancherSurEcriture } = require('./stubs');
  brancherSurEcriture(() => evenements.push({ type: 'ecriture' }));
  return { cl, ctx, evenements, familles, panne: v => { relaisEnPanne = v; } };
}
const lignes = (b) => { const sh = b.cl.getSheetByName('NOTIFS_JOURNAL'); return sh ? sh.getDataRange().getValues() : null; };

console.log('\n═══ C1. Inscription : ciblée, à tous, comité exclu, test exclu ═══');
{
  const b = monter();
  vm.runInContext(`notifierPush_('Échange confirmé', 'Votre garde du 12/09 passe à BRAVO.', './dashboard.html', { id: 'ALPHA' })`, b.ctx);
  const d = lignes(b);
  V('une ligne inscrite (en-tête + 1)', d && d.length === 2, d && d.length);
  V('destinataire = ALPHA', d[1][1] === 'ALPHA', d[1]);
  V('titre, corps et url intacts', d[1][2] === 'Échange confirmé' && /BRAVO/.test(d[1][3]) && d[1][4] === './dashboard.html', d[1]);
  V('QUAND est une date valable', d[1][0] instanceof Date && !isNaN(d[1][0].getTime()), String(d[1][0]));
  V('la famille `notifs` est notée pour la copie rapide', b.familles.length === 1 && b.familles[0].familles.join(',') === 'notifs', b.familles);

  vm.runInContext(`notifierPush_('Les gardes 2027 sont générées', 'Planning complet.', './dashboard.html')`, b.ctx);
  V("sans cible → destinataire '*' (tout le monde)", lignes(b)[2][1] === '*', lignes(b)[2]);

  vm.runInContext(`notifierPush_('Alerte comité', 'x', './admin.html', { role: 'admin' })`, b.ctx);
  V('une cible par rôle COMITÉ ne va PAS à la cloche', lignes(b).length === 3, lignes(b).length);

  /* (06/09/2026) DÉFAUT VU EN PRODUCTION, que ce banc laissait passer. Le
     garde-fou ci-dessus visait le comité ; il écartait TOUS les rôles, dont
     `role:'mar'` — celui de la génération des gardes, la notification la plus
     importante de l'année. Le push partait, la cloche restait vide, et rien ne
     pouvait le révéler puisque la notification, elle, arrivait bien.
     Preuve : NOTIFS_JOURNAL n'avait que deux lignes du 25/08, écrites du temps
     où l'appel utilisait la cible `*` ; la génération du 04/09 n'y figurait pas.
     Le banc ne testait que 'admin' — il ne pouvait pas voir la différence. */
  vm.runInContext(`notifierPush_('Votre planning 2027 est disponible', 'x', './dashboard.html#mes-gardes', { role: 'mar' })`, b.ctx);
  V('une cible par rôle MAR va bien à la cloche', lignes(b).length === 4, lignes(b).length);
  V("…et sous '*', puisqu'elle s'adresse à tous", lignes(b)[3] && lignes(b)[3][1] === '*', lignes(b)[3]);
  V('…avec son titre et son lien', lignes(b)[3] && /planning 2027/.test(lignes(b)[3][2])
    && lignes(b)[3][4] === './dashboard.html#mes-gardes', lignes(b)[3]);

  vm.runInContext(`notifierPush_('Test du canal', 'x', './dashboard.html', null, true)`, b.ctx);
  V('le test du canal (sansJournal) ne laisse aucune ligne', lignes(b).length === 4, lignes(b).length);
}

console.log('\n═══ C2. L\'ordre : le journal AVANT le relais, et la panne ne perd rien ═══');
{
  const b = monter();
  vm.runInContext(`notifierPush_('Un', 'x', './dashboard.html', { id: 'ALPHA' })`, b.ctx);
  const premierFetch = b.evenements.findIndex(e => e.type === 'fetch');
  const derniereEcritureAvant = b.evenements.slice(0, premierFetch).some(e => e.type === 'ecriture');
  V('au moins une écriture du journal PRÉCÈDE l\'appel au relais', premierFetch > 0 && derniereEcritureAvant, b.evenements);

  b.panne(true);
  const r = vm.runInContext(`notifierPush_('Deux', 'x', './dashboard.html', { id: 'ALPHA' })`, b.ctx);
  V('relais injoignable → la ligne du journal existe QUAND MÊME', lignes(b).length === 3, lignes(b).length);
  V('et l\'échec est avalé, jamais levé', r && r.success === false, r);
}

console.log('\n═══ C3. Purge des 30 jours, au fil de l\'eau ═══');
{
  const vieille = new Date(Date.now() - 31 * 86400000);
  const recente = new Date(Date.now() - 10 * 86400000);
  const b = monter([
    ['QUAND', 'MAR', 'TITRE', 'CORPS', 'URL'],
    [vieille, 'ALPHA', 'Trop vieille', '', './dashboard.html'],
    [recente, 'ALPHA', 'Encore bonne', '', './dashboard.html'],
  ]);
  vm.runInContext(`notifierPush_('Neuve', 'x', './dashboard.html', { id: 'BRAVO' })`, b.ctx);
  const d = lignes(b);
  V('la ligne de 31 jours a été purgée', !d.some(l => l[2] === 'Trop vieille'), d.map(l => l[2]));
  V('celle de 10 jours est restée', d.some(l => l[2] === 'Encore bonne'));
  V('la neuve est inscrite en queue', d[d.length - 1][2] === 'Neuve');
}

console.log('\n═══ C4. La clé `notifs` : groupée, bornée à 30 jours, triée ═══');
{
  const t0 = Date.now();
  const b = monter([
    ['QUAND', 'MAR', 'TITRE', 'CORPS', 'URL'],
    [new Date(t0 - 40 * 86400000), 'ALPHA', 'Hors fenêtre', '', ''],
    [new Date(t0 - 2 * 86400000), 'ALPHA', 'Avant-hier', 'c1', './a.html'],
    [new Date(t0 - 1 * 86400000), '*', 'Pour tous', 'c2', './b.html'],
    [new Date(t0 - 3600000), 'ALPHA', 'Il y a une heure', 'c3', './c.html'],
  ]);
  const env = vm.runInContext('_miroirConstruireNotifs_()', b.ctx);
  V('enveloppe {success:true}', env && env.success === true);
  V('groupée par destinataire (ALPHA et *)', !!env.notifs.ALPHA && !!env.notifs['*'], Object.keys(env.notifs));
  V('les 40 jours sont EXCLUS', !env.notifs.ALPHA.some(n => n.t === 'Hors fenêtre'));
  V('triée du plus récent au plus ancien', env.notifs.ALPHA[0].t === 'Il y a une heure', env.notifs.ALPHA.map(n => n.t));
  V('q en ISO (le dashboard le lit avec new Date)', /^\d{4}-\d{2}-\d{2}T/.test(env.notifs.ALPHA[0].q), env.notifs.ALPHA[0].q);
}

console.log('\n═══ C5. Le dashboard : zéro requête ajoutée, cloche présente, rendu sûr ═══');
{
  const html = fs.readFileSync('../dashboard.html', 'utf8');
  V("la clé `notifs` voyage dans L'APPEL D'OUVERTURE (pas une requête de plus)",
    /miroirRead\(\['annees'[^\]]*'echanges', 'notifs'\]\)/.test(html));
  V('aucun autre appel réseau dédié à la cloche',
    (html.match(/notif-vu/g) || []).length === 1);   // le seul : la remise à zéro, à fond perdu
  V('la cloche est dans l\'en-tête', html.includes('id="notifBell"') && html.includes('data-lucide="bell"'));
  V('le panneau existe et est unique', (html.match(/id="notifPanel"/g) || []).length === 1);
  V('le rendu passe par l\'échappement HTML', /_notifEchap\(n\.t\)/.test(html) && /_notifEchap\(n\.c\)/.test(html));
  V("l'ouverture remet la pastille d'icône à zéro", /clearAppBadge/.test(html));
  V('la remise à zéro serveur part à fond perdu (keepalive, échec avalé)',
    /notif-vu[\s\S]{0,200}keepalive:true/.test(html));
  V('la cloche filtre sur MY_ID + les entrées pour tous',
    /NOTIFS_REGISTRE\[MY_ID\]/.test(html) && /NOTIFS_REGISTRE\['\*'\]/.test(html));
  /* (25/08/2026) Le test figeait « v1.77 » et cassait à la nouveauté suivante. Il
     vérifiait donc que le numéro était AU MOINS celui du lot cloche.
     (05/09/2026) La numérotation est repartie de v1.0 — v1.0 = la version
     présentée au staff du 4 septembre. Comparer à un ancien numéro n'a plus de
     sens : v1.0.4 est POSTÉRIEUR à v1.77, et pourtant plus petit. Un numéro ne
     peut donc plus servir à dater une fonctionnalité.
     Ce qui reste vrai et vérifiable : la cloche est là, et le numéro vient de la
     source unique. C'est ce qu'on contrôle désormais. */
  {
    const _v = (fs.readFileSync('../version.js', 'utf8').match(/window\.SITE_VERSION = 'v([\d.]+)'/) || [])[1] || '';
    V('le numéro de version vient de version.js et est lisible',
      /^\d+\.\d+(\.\d+)?$/.test(_v), 'v' + _v);
    V('la page de la cloche ne porte aucun numéro en dur',
      !/(?:const|let|var)\s+SITE_VERSION\s*=\s*'v[\d.]+'/.test(html));
  }
}

console.log(`\nbanc_cloche : ${ok} ✓ / ${ko} ✗`);
if (ko) process.exit(1);
