const vm = require('vm');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };

console.log('\n═══ 6. Notes du miroir : coalescence et éditions manuelles ═══');
VERROUS.script = false;
const PROPS = {}; const triggers = []; const pousses = [];
const cl = new Classeur();
const ctx = vm.createContext({
  console, JSON, Date, Number, String, Object, Array, Set, Math, Error,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in PROPS ? PROPS[k] : null),
    setProperty: (k, v) => { PROPS[k] = String(v); },
    deleteProperty: k => { delete PROPS[k]; } }) },
  LockService: { getScriptLock: () => fabriqueVerrou('script') },
  ScriptApp: {
    getProjectTriggers: () => triggers.slice(),
    newTrigger: nom => ({ timeBased: () => ({ after: () => ({ create: () => triggers.push({ h: nom, getHandlerFunction: () => nom }) }) }) }),
    deleteTrigger: t => { const i = triggers.findIndex(x => x.h === t.h); if (i >= 0) triggers.splice(i, 1); },
  },
  Logger: { log: () => {} },
  SpreadsheetApp: { getActiveSpreadsheet: () => cl },
  getActiveYear: () => 2026,
  miroirPousserFamilles_: (f, y) => pousses.push({ familles: f.slice().sort(), annee: y }),
});
ctx.globalThis = ctx;
vm.runInContext('const MIROIR_CLE_ATTENTE = "MIROIR_POUSSEES_EN_ATTENTE";', ctx);
['_miroirNoterPoussee_', 'miroirRattrapage', 'miroirSurEdition'].forEach(n =>
  vm.runInContext(extraireFonction('../gas/miroir.gs', n), ctx));
vm.runInContext(extraireFonction('../gas/miroir.gs', 'miroirSurEdition').includes('MIROIR_ONGLETS_SUIVIS')
  ? require('fs').readFileSync('../gas/miroir.gs','utf8').match(/const MIROIR_ONGLETS_SUIVIS = \{[\s\S]*?\};/)[0] : '', ctx);

// rafale de 5 écritures → UNE note, UN déclencheur
/* (23/08/2026) La poussée différée écrit désormais dans LOGS — une trace, pas
   une logique : on la collecte au lieu de l'écrire. */
const journal = [];
ctx.__journal = journal;
vm.runInContext('function logAction(m){ __journal.push(m); }', ctx);
vm.runInContext(`_miroirNoterPoussee_(['config_admin'], 2027)`, ctx);
vm.runInContext(`_miroirNoterPoussee_(['config_admin'], 2027)`, ctx);
vm.runInContext(`_miroirNoterPoussee_(['gardes','indispos'], 2027)`, ctx);
vm.runInContext(`_miroirNoterPoussee_(['config_admin'], 2026)`, ctx);
V('un seul déclencheur pour 4 écritures', triggers.length === 1, triggers.length);
V('la note cumule les familles', JSON.parse(PROPS.MIROIR_POUSSEES_EN_ATTENTE).familles.config_admin === true);
vm.runInContext('miroirRattrapage()', ctx);
V('une seule poussée par année (2 années touchées)', pousses.length === 2, pousses);
V('les familles sont fusionnées', pousses[0].familles.join(',') === 'config_admin,gardes,indispos', pousses[0]);
V('la note est purgée', !PROPS.MIROIR_POUSSEES_EN_ATTENTE);
V('aucun déclencheur orphelin', triggers.length === 0, triggers);
/* (23/08/2026) BLOCAGE DÉFINITIF. Le déclencheur n'était armé que si la file
   était VIDE. Une exécution morte avant la purge laissait la file pleine :
   plus aucune note n'armait de déclencheur, la copie rapide ne se
   rafraîchissait PLUS JAMAIS seule. Constaté en production. */
PROPS.MIROIR_POUSSEES_EN_ATTENTE = JSON.stringify({ familles: { gardes: true }, annees: { 2027: true } });
triggers.length = 0;                       // la file est pleine, aucun déclencheur
vm.runInContext(`_miroirNoterPoussee_(['indispos'], 2027)`, ctx);
V('file pleine SANS déclencheur → un déclencheur est quand même armé',
  triggers.length === 1, triggers);
vm.runInContext(`_miroirNoterPoussee_(['acces'], 2027)`, ctx);
V('…et il n\'en crée pas un deuxième', triggers.length === 1, triggers);
/* (23/08/2026) La poussée était MUETTE : quand la copie rapide ne se
   rafraîchissait pas, rien ne disait si l'écriture avait été notée, avec
   quelle année, ni si la poussée avait eu lieu. Deux symptômes en production
   sans aucune trace pour trancher. */
V('la poussée différée laisse une trace dans le journal',
  journal.some(function (m) { return /poussée différée/.test(m); }), journal);
V('…qui nomme les familles et les années',
  journal.some(function (m) { return /config_admin/.test(m) && /2027/.test(m); }), journal);

// édition manuelle du classeur
const edition = nom => vm.runInContext(`miroirSurEdition({ range: { getSheet: () => ({ getName: () => ${JSON.stringify(nom)} }) } })`, ctx);
pousses.length = 0; triggers.length = 0;
edition('GARDES_2027');
V('éditer GARDES_2027 pose une note', !!PROPS.MIROIR_POUSSEES_EN_ATTENTE);
const note = JSON.parse(PROPS.MIROIR_POUSSEES_EN_ATTENTE);
V('la bonne année est déduite du nom d\'onglet', note.annees['2027'] === true, note.annees);
V('les bonnes familles sont notées', note.familles.gardes && note.familles.indispos, note.familles);
edition('PLANNING_OVERRIDES');
V('éditer PLANNING_OVERRIDES note config_admin', JSON.parse(PROPS.MIROIR_POUSSEES_EN_ATTENTE).familles.config_admin === true);
const avant = JSON.stringify(PROPS.MIROIR_POUSSEES_EN_ATTENTE);
edition('LOGS');
V('éditer un onglet non suivi ne note RIEN', JSON.stringify(PROPS.MIROIR_POUSSEES_EN_ATTENTE) === avant);
edition('CONNEXIONS');
V('éditer CONNEXIONS ne note rien non plus', JSON.stringify(PROPS.MIROIR_POUSSEES_EN_ATTENTE) === avant);
vm.runInContext('miroirRattrapage()', ctx);
V('la poussée suit l\'édition manuelle', pousses.length >= 1, pousses);

console.log('\n═══ 56. Inventaire des onglets écoutés (06/08/2026) ═══');
{
  /* Chaque famille du miroir a une source dans le classeur. Si un onglet
     source n'est pas écouté, une correction manuelle y attend la synchro
     HORAIRE — sans que rien ne le signale. Trois manquaient. */
  const fs2 = require('fs');
  const src = fs2.readFileSync('../gas/miroir.gs', 'utf8');
  const table = src.match(/const MIROIR_ONGLETS_SUIVIS = \{([\s\S]*?)\};/)[1];
  const suivis = {};
  table.replace(/(\w+):\s*\[([^\]]*)\]/g, (m, o, f) => { suivis[o] = f.replace(/['\s]/g, '').split(','); });

  const ATTENDU = {
    GARDES: 'gardes', STATS_GARDES: 'stats', INDISPOS: 'indispos', MEDECINS: 'config_admin',
    SECTEURS: 'secteurs', AFFECTATIONS: 'affectations', PLANNING_OVERRIDES: 'config_admin',
    CS_TEMPLATE: 'config_admin', SEUILS: 'config_admin', LIBERAL: 'liberal',
    PERIODES_VAC: 'vacances_admin', GROUPES_VAC: 'vacances_admin',
  };
  Object.entries(ATTENDU).forEach(([onglet, famille]) => {
    V(`${onglet} est écouté (famille « ${famille} »)`,
      suivis[onglet] && suivis[onglet].includes(famille), suivis[onglet]);
  });

  // les trois oublis du 05/08, nommément
  V('AFFECTATIONS — l\'oubli qui masquait les cases à pourvoir', !!suivis.AFFECTATIONS);
  V('STATS_GARDES — l\'équité de référence et la dette', !!suivis.STATS_GARDES);
  V('CS_TEMPLATE et SEUILS — consultations et bornes de tension', !!suivis.CS_TEMPLATE && !!suivis.SEUILS);

  // toute famille construite par le miroir doit avoir au moins une source écoutée
  const construites = [...src.matchAll(/if \(uniq\['(\w+)'\]\)/g)].map(m => m[1]);
  const couvertes = new Set(Object.values(suivis).flat());
  const SANS_SOURCE = ['annees', 'planning', 'affectations', 'tuiles', 'joursferies', 'mail'];
  const orphelines = construites.filter(f => !couvertes.has(f) && !SANS_SOURCE.includes(f));
  V('aucune famille sans onglet source écouté', orphelines.length === 0, orphelines);
}

/* ═══ OUBLI DES ANNEES RETIREES (2026-08-09) ═══════════════════════════
   Defaut trouve en production le 09/08 : supprimer les onglets et les JSON
   2027 ne retirait PAS `planning_2027` du miroir — les 23 MARs auraient
   continue de voir des gardes fictives. On verifie les deux sens :
   ce qui doit partir part, et surtout ce qui ne doit PAS partir reste. */
{
  console.log('\n═══ 6 bis. Le miroir sait oublier une année retirée ═══');
  const fs2 = require('fs');
  const src2 = fs2.readFileSync('../gas/miroir.gs', 'utf8');

  const monter = (onglets, archives, opts) => {
    opts = opts || {};
    const actif = new Classeur();
    onglets.forEach(n => actif.ajouter(n, [[]]));
    const arch = new Classeur();
    (archives || []).forEach(n => arch.ajouter(n, [[]]));
    const c = vm.createContext({
      console, JSON, Date, Number, String, Object, Array, Set, Math, Error, RegExp,
      SpreadsheetApp: {
        getActiveSpreadsheet: () => { if (opts.actifKO) throw new Error('classeur injoignable'); return actif; },
        openById: () => { if (opts.archiveKO) throw new Error('archive injoignable'); return arch; },
      },
      ARCHIVE_SS_ID: 'ARCH',
      getActiveYear: () => opts.active || 2026,
      getIndisposYear: () => opts.indispos || null,
    });
    c.globalThis = c;
    ['MIROIR_PURGE_APRES', 'MIROIR_PURGE_MAX_ANNEES', 'MIROIR_CLES_PAR_ANNEE']
      .forEach(n => vm.runInContext(src2.match(new RegExp('const ' + n + ' *=[^;]+;'))[0], c));
    ['_miroirAnneesAttendues_', '_miroirPurgerAnnees_'].forEach(n =>
      vm.runInContext(extraireFonction('../gas/miroir.gs', n), c));
    return c;
  };
  const purger = (c, items, annee) => {
    c.__items = items || {};
    const r = vm.runInContext('_miroirPurgerAnnees_(__items, ' + annee + ')', c);
    return { rapport: r, items: c.__items };
  };

  // 1. Le cas reel : 2027 retire du classeur → ses cles sont effacees
  {
    const c = monter(['GARDES_2026', 'MEDECINS'], [], { active: 2026 });
    const { rapport, items } = purger(c, {}, 2026);
    V('2027 retiré : la purge le désigne', (rapport.annees || []).indexOf(2027) >= 0, rapport);
    V('planning_2027 marqué pour effacement', items.planning_2027 === null, Object.keys(items));
    V('affectations_2027 aussi', items.affectations_2027 === null);
    V('indispos_2027 aussi', items.indispos_2027 === null);
    V('l\'effacement se fait par la valeur null (contrat du Worker)',
      Object.keys(items).every(k => items[k] === null));
    V('2026 (année active) n\'est JAMAIS effacée', !('planning_2026' in items), Object.keys(items));
  }

  // 2. Le garde-fou qui compte : une panne ne doit rien effacer
  {
    const c = monter(['GARDES_2026'], [], { active: 2026, archiveKO: true });
    const { rapport, items } = purger(c, {}, 2026);
    V('archive injoignable → AUCUN effacement', Object.keys(items).length === 0, rapport);
    V('le refus est tracé', !!rapport.refus, rapport);
  }
  {
    const c = monter(['GARDES_2026'], [], { active: 2026, actifKO: true });
    const { items } = purger(c, {}, 2026);
    V('classeur principal injoignable → AUCUN effacement', Object.keys(items).length === 0);
  }

  // 3. Une année archivée reste servie
  {
    const c = monter(['GARDES_2026'], ['GARDES_2025', 'GARDES_2024'], { active: 2026 });
    const { items } = purger(c, {}, 2026);
    V('une année ARCHIVÉE n\'est pas effacée', !('planning_2025' in items) && !('planning_2024' in items),
      Object.keys(items));
  }

  // 4. L'année de campagne (INDISPOS_ACTIVE) est protégée même sans GARDES_
  {
    const c = monter(['GARDES_2026'], [], { active: 2026, indispos: 2027 });
    const { items } = purger(c, {}, 2026);
    V('l\'année de campagne est protégée même sans onglet GARDES_',
      !('indispos_2027' in items), Object.keys(items));
  }

  // 5. Structure anormale : aucun onglet d'année → on n'efface rien
  {
    const c = monter(['MEDECINS'], [], { active: 2026 });
    const { rapport, items } = purger(c, {}, 2026);
    V('classeur sans aucun onglet GARDES_ → refus', !!rapport.refus, rapport);
    V('et donc aucune clé effacée', Object.keys(items).length === 0);
  }

  // 5 bis. Le défaut trouvé au banc le 09/08 : la fenêtre ne doit pas
  // remonter avant la plus ancienne année connue, sinon le plafond saute
  // et la purge ne s'exécute JAMAIS.
  {
    const c = monter(['GARDES_2026'], ['GARDES_2025', 'GARDES_2024'], { active: 2026 });
    const { rapport, items } = purger(c, {}, 2026);
    V('avec 3 années connues, la purge s\'exécute (pas de refus)', !rapport.refus, rapport);
    V('elle ne vise que l\'après (2027, 2028)',
      JSON.stringify(rapport.annees) === JSON.stringify([2027, 2028]), rapport.annees);
    V('aucune année connue n\'est touchée',
      !('planning_2024' in items) && !('planning_2025' in items) && !('planning_2026' in items));
  }

  // 5 ter. Plafond réel : trop d'années à effacer d'un coup → refus
  {
    const c = monter(['GARDES_2020'], [], { active: 2026 });
    const { rapport, items } = purger(c, {}, 2026);
    V('un écart anormal déclenche le plafond', !!rapport.refus, rapport);
    V('et rien n\'est effacé', Object.keys(items).length === 0);
  }

  // 6. Une clé construite dans la même passe n'est jamais écrasée par null
  {
    const c = monter(['GARDES_2026'], [], { active: 2026 });
    const { items } = purger(c, { planning_2027: '{"months":[]}' }, 2026);
    V('une clé déjà construite n\'est pas remplacée par un effacement',
      items.planning_2027 === '{"months":[]}', items.planning_2027);
  }

  // 7. Les listes communes ne sont JAMAIS effaçables
  {
    const listes = ['topos', 'protocoles', 'annuaire', 'secteurs', 'acces', 'veille', 'staffs'];
    const parAnnee = src2.match(/const MIROIR_CLES_PAR_ANNEE *=[\s\S]*?\];/)[0];
    V('aucune liste commune dans les clés effaçables',
      listes.every(l => !new RegExp("'" + l + "'").test(parAnnee)), parAnnee);
    V('toutes les clés effaçables se terminent par un séparateur d\'année',
      (parAnnee.match(/'[a-z_]+_'/g) || []).length >= 5, parAnnee);
  }

  /* 7 bis. (16/08/2026) LE TEST QUI MANQUAIT — et qui aurait vu le trou.
     Les tests ci-dessus nomment trois clés à la main (planning_, affectations_,
     indispos_). Ils ne pouvaient donc PAS voir qu'une famille poussée par année
     échappait à l'oubli : `equite_live_{Y}`, ajoutée le 13/08, est restée quatre
     jours hors de la purge. On ne compare plus la liste à des noms écrits ici,
     mais à ce que le miroir CONSTRUIT réellement par année. */
  {
    const parAnnee = src2.match(/const MIROIR_CLES_PAR_ANNEE *=[\s\S]*?\];/)[0];
    const efface = (parAnnee.match(/'([a-z_]+_)'/g) || []).map(x => x.replace(/'/g, ''));
    /* Toutes les clés bâties avec l'année en suffixe, relevées dans le code :
       _miroirAjoute*(items, 'xxx_' + y, …) — y, annee ou année. */
    const construites = [...src2.matchAll(/items,\s*'([a-z_]+_)'\s*\+\s*(?:y|annee|année)\b/g)]
      .map(m => m[1]);
    const oubliees = [...new Set(construites)].filter(p => efface.indexOf(p) === -1);
    V('toute clé construite par année figure dans les clés effaçables',
      oubliees.length === 0, oubliees);
    console.log('    ' + [...new Set(construites)].length + ' familles par année, '
                + efface.length + ' effaçables');
    V('equite_live_ en fait partie (défaut du 16/08)', efface.indexOf('equite_live_') > -1, efface);
  }

  // 7 ter. Le cas réel du 4 septembre : 2027 retiré, TOUTES ses clés partent
  {
    const c = monter(['GARDES_2026', 'MEDECINS'], [], { active: 2026 });
    const { items } = purger(c, {}, 2026);
    const parAnnee = src2.match(/const MIROIR_CLES_PAR_ANNEE *=[\s\S]*?\];/)[0];
    const efface = (parAnnee.match(/'([a-z_]+_)'/g) || []).map(x => x.replace(/'/g, ''));
    const manquantes = efface.filter(p => items[p + '2027'] !== null);
    V('après le ménage du 4/09, aucune clé 2027 ne survit', manquantes.length === 0, manquantes);
    V('equite_live_2027 est bien effacée', items['equite_live_2027'] === null);
  }

  // 8. La purge n'est câblée QUE dans la synchro complète
  {
    V('la purge n\'est appelée que si toutesAnnees',
      /if \(toutesAnnees\) \{[\s\S]{0,200}_miroirPurgerAnnees_/.test(src2));
  }
}

/* ═══ COPIE DES DOCUMENTS AU MIROIR (2026-08-10) ══════════════════════
   Le geste le plus cher du portail (6-11 s) doit devenir une lecture de
   copie. On verifie surtout ce qui ne doit PAS arriver : copier en boucle,
   effacer sur une lecture ratee, saturer une passe. */
{
  console.log('\n═══ 6 ter. Copie des documents (topos / protocoles) ═══');
  const fs3 = require('fs');
  const src3 = fs3.readFileSync('../gas/miroir.gs', 'utf8');

  const faireDoc = (id, nom, maj, taille) => ({
    getId: () => id, getName: () => nom, getSize: () => taille,
    getMimeType: () => 'application/pdf',
    getLastUpdated: () => new Date(maj),
    getBlob: () => ({ getContentType: () => 'application/pdf', getBytes: () => 'OCTETS-' + id }),
  });
  const faireDossier = (fichiers, sous) => ({
    getFiles: () => { let i = 0; return { hasNext: () => i < fichiers.length, next: () => fichiers[i++] }; },
    getFolders: () => { const l = sous || []; let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
  });

  const monterDocs = (parDossier, opts) => {
    opts = opts || {};
    const envois = [];
    const props = { valeurs: {} };
    const c = vm.createContext({
      console, JSON, Date, Number, String, Object, Array, Math, Error, RegExp, Buffer,
      Logger: { log: () => {} },
      Utilities: {
        formatDate: (d) => new Date(d).toISOString().replace(/\.\d+Z$/, 'Z'),
        base64Encode: (s) => Buffer.from(String(s)).toString('base64'),
      },
      PropertiesService: { getScriptProperties: () => ({
        getProperty: (k) => (k in props.valeurs ? props.valeurs[k] : null),
        setProperty: (k, v) => { if (v.length > 9216) throw new Error('Limit exceeded: Properties value size'); props.valeurs[k] = v; },
        deleteProperty: (k) => { delete props.valeurs[k]; },
      }) },
      DriveApp: {
        getFoldersByName: (n) => {
          if (opts.enPanne && opts.enPanne === n) throw new Error('Drive injoignable');
          const d = parDossier[n];
          let pris = false;
          return { hasNext: () => !!d && !pris, next: () => { pris = true; return d; } };
        },
        getFileById: (id) => {
          if (opts.blobKO && opts.blobKO === id) throw new Error('lecture impossible');
          return { getBlob: () => ({ getContentType: () => 'application/pdf', getBytes: () => 'OCTETS-' + id }) };
        },
      },
      TOPOS_FOLDER: 'Planning-Med-Topos',
      PROTOS_FOLDER: 'Planning-Med-Protocoles',
      _miroirEnvoyer_: (items) => { envois.push(items); return { success: opts.envoiKO ? false : true }; },
      ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }) },
    });
    c.globalThis = c;
    ['DOC_DOSSIERS', 'DOC_POIDS_MAX', 'DOC_PROP_DATES', 'DOC_PAR_PASSAGE'].forEach(n =>
      vm.runInContext(src3.match(new RegExp('const ' + n + ' *=[^;]+;'))[0], c));
    ['_docsRecenser_', '_docsDatesLues_', '_docsDatesEcrites_', 'miroirDocuments'].forEach(n =>
      vm.runInContext(extraireFonction('../gas/miroir.gs', n), c));
    return { c, envois, props, lancer: () => vm.runInContext('miroirDocuments()', c) };
  };

  const T = 'Planning-Med-Topos', P = 'Planning-Med-Protocoles';

  // 1. Premiere passe : UN document copie, pas dix-sept
  {
    const docs = [faireDoc('a', 'Topo A.pdf', '2026-08-01T10:00:00Z', 500000),
                  faireDoc('b', 'Topo B.pdf', '2026-08-02T10:00:00Z', 600000),
                  faireDoc('c', 'Topo C.pdf', '2026-08-03T10:00:00Z', 700000)];
    const m = monterDocs({ [T]: faireDossier(docs), [P]: faireDossier([]) });
    const r = m.lancer();
    V('un seul document par passage', r.copies.length === 1, r);
    V('les autres sont annonces comme restants', r.restants === 2, r);
    V('la cle porte le prefixe doc_ et l\'identifiant Drive',
      Object.keys(m.envois[0]).every(k => /^doc_[a-z]$/.test(k)), Object.keys(m.envois[0]));
    const v = JSON.parse(m.envois[0][Object.keys(m.envois[0])[0]]);
    V('la valeur a la forme EXACTE de getTopo (success/name/mimeType/dataB64)',
      v.success === true && !!v.name && v.mimeType === 'application/pdf' && !!v.dataB64,
      Object.keys(v));
  }

  // 2. Rien ne bouge → passage a vide, aucun envoi (le cas 23 h sur 24)
  {
    const docs = [faireDoc('a', 'Topo A.pdf', '2026-08-01T10:00:00Z', 500000)];
    const m = monterDocs({ [T]: faireDossier(docs), [P]: faireDossier([]) });
    m.lancer();
    const r2 = m.lancer();
    V('deuxième passage : rien a faire', r2.rien === true, r2);
    V('et AUCUN envoi supplementaire', m.envois.length === 1, m.envois.length);
  }

  // 3. Document modifie → recopie ; document inchange → jamais recopie
  {
    const a = faireDoc('a', 'Topo A.pdf', '2026-08-01T10:00:00Z', 500000);
    const dossier = { fichiers: [a] };
    const m = monterDocs({ [T]: faireDossier(dossier.fichiers), [P]: faireDossier([]) });
    m.lancer();
    dossier.fichiers[0] = faireDoc('a', 'Topo A.pdf', '2026-08-09T10:00:00Z', 500000);
    const r = m.lancer();
    V('un document modifie est recopie', r.copies.length === 1, r);
  }

  // 4. LE GARDE-FOU : un dossier injoignable → aucune copie, aucun effacement
  {
    const m = monterDocs({ [T]: faireDossier([faireDoc('a', 'A.pdf', '2026-08-01T10:00:00Z', 5e5)]),
                           [P]: faireDossier([]) }, { enPanne: P });
    const r = m.lancer();
    V('dossier injoignable → refus explicite', !!r.refus, r);
    V('et AUCUN envoi', m.envois.length === 0, m.envois.length);
  }

  // 5. Document disparu du Drive → sa copie est effacee (valeur null)
  {
    const a = faireDoc('a', 'A.pdf', '2026-08-01T10:00:00Z', 5e5);
    const b = faireDoc('b', 'B.pdf', '2026-08-01T10:00:00Z', 5e5);
    const etat = { l: [a, b] };
    const m = monterDocs({ [T]: { getFiles: () => { let i = 0; return { hasNext: () => i < etat.l.length, next: () => etat.l[i++] }; }, getFolders: () => ({ hasNext: () => false }) },
                           [P]: faireDossier([]) });
    m.lancer(); m.lancer();                       // a puis b copies
    etat.l = [a];                                 // b retire du Drive
    const r = m.lancer();
    V('un document retire est efface du miroir', r.effaces === 1, r);
    const dernier = m.envois[m.envois.length - 1];
    V('l\'effacement passe par la valeur null', dernier['doc_b'] === null, dernier);
  }

  // 6. Trop lourd → ecarte, JAMAIS copie, et signale
  {
    const gros = faireDoc('g', 'Enorme.pdf', '2026-08-01T10:00:00Z', 20 * 1024 * 1024);
    const m = monterDocs({ [T]: faireDossier([gros]), [P]: faireDossier([]) });
    const r = m.lancer();
    V('un document trop lourd est ecarte', r.ecartes.length === 1, r);
    V('il n\'est PAS copie', m.envois.length === 0, m.envois.length);
  }

  // 7. Protocoles : deux niveaux de sous-dossiers (specialite > sous-dossier)
  {
    const p1 = faireDoc('p1', 'Antibio.pdf', '2026-08-01T10:00:00Z', 2e5);
    const p2 = faireDoc('p2', 'ACR.pdf', '2026-08-01T10:00:00Z', 2e5);
    const sousSous = faireDossier([p2]);
    const specialite = faireDossier([p1], [sousSous]);
    const m = monterDocs({ [T]: faireDossier([]), [P]: faireDossier([], [specialite]) });
    const rec = vm.runInContext('_docsRecenser_()', m.c);
    V('les protocoles sont vus sur DEUX niveaux', rec.docs.length === 2, rec.docs.map(d => d.nom));
  }

  // 8. Envoi en echec → les dates ne sont PAS enregistrees (on recopiera)
  {
    const m = monterDocs({ [T]: faireDossier([faireDoc('a', 'A.pdf', '2026-08-01T10:00:00Z', 5e5)]),
                           [P]: faireDossier([]) }, { envoiKO: true });
    m.lancer();
    const r2 = m.lancer();
    V('envoi rate → le document reste a copier', (r2.copies || []).length === 1, r2);
  }

  // 9. Blob illisible → erreur tracee, la tache ne leve pas
  {
    const m = monterDocs({ [T]: faireDossier([faireDoc('x', 'X.pdf', '2026-08-01T10:00:00Z', 5e5)]),
                           [P]: faireDossier([]) }, { blobKO: 'x' });
    let leve = false, r = null;
    try { r = m.lancer(); } catch (e) { leve = true; }
    V('un document illisible ne fait pas planter la tache', !leve && !!r, r);
    V('et l\'erreur est tracee', r && r.erreurs.length === 1, r && r.erreurs);
  }
}

/* ═══ ETAPE 3 : le portail lit la copie, et REPLIE si elle manque ═══════
   C'est la seule etape qui touche une page. Le repli est ce qui rend la
   bascule sans risque : un document non encore copie doit rester LENT,
   jamais casse. On le verifie dans les deux sens. */
{
  console.log('\n═══ 6 quater. Lecture d\'un document par le portail (miroir + repli) ═══');
  const fs4 = require('fs');
  const html = fs4.readFileSync('../dashboard.html', 'utf8');

  const corps = html.match(/async function _lireDoc\(id, action\)\{[\s\S]*?\n\}/);
  V('la page contient bien _lireDoc', !!corps);

  const monter = (opts) => {
    const appels = { miroir: [], gas: [] };
    const c = vm.createContext({
      console, JSON, Object, String, Error,
      miroirRead: async (cles) => {
        appels.miroir.push(cles);
        if (opts.miroirKO) throw new Error('miroir injoignable');
        if (!opts.copie) return { success: true, data: {} };
        const d = {}; d[cles[0]] = opts.copie;
        return { success: true, data: d };
      },
      apiPost: async (p) => { appels.gas.push(p); return { success: true, name: 'via GAS.pdf', mimeType: 'application/pdf', dataB64: 'GAS' }; },
    });
    c.globalThis = c;
    vm.runInContext(corps[0], c);
    return { c, appels, lire: (id, act) => vm.runInContext(`_lireDoc(${JSON.stringify(id)}, ${JSON.stringify(act)})`, c) };
  };

  const attendre = (p) => { let r, e; p.then(v => r = v, x => e = x); return new Promise(res => setImmediate(() => res({ r, e }))); };

  (async () => {
    // 1. Copie presente → lecture miroir, AUCUN appel serveur
    {
      const m = monter({ copie: { success: true, name: 'Topo.pdf', mimeType: 'application/pdf', dataB64: 'MIROIR' } });
      const r = await m.lire('abc', 'getTopo');
      V('copie présente → contenu servi par le miroir', r.dataB64 === 'MIROIR', r && r.name);
      V('et AUCUN appel Apps Script', m.appels.gas.length === 0, m.appels.gas);
      V('la clé demandée est doc_<id>', m.appels.miroir[0][0] === 'doc_abc', m.appels.miroir[0]);
    }
    // 2. LE REPLI : copie absente → ancien chemin, document quand même servi
    {
      const m = monter({ copie: null });
      const r = await m.lire('abc', 'getTopo');
      V('copie absente → repli sur Apps Script', r.dataB64 === 'GAS', r);
      V('l\'action d\'origine est conservée', m.appels.gas[0].action === 'getTopo', m.appels.gas[0]);
      V('l\'identifiant est transmis', m.appels.gas[0].id === 'abc', m.appels.gas[0]);
    }
    // 3. Miroir en panne → repli, jamais d'erreur remontée
    {
      const m = monter({ miroirKO: true });
      const r = await m.lire('xyz', 'getProtocole');
      V('miroir injoignable → repli, document servi', r && r.success === true, r);
      V('et c\'est bien getProtocole qui part', m.appels.gas[0].action === 'getProtocole', m.appels.gas[0]);
    }
    // 4. Copie presente mais INCOMPLETE (sans contenu) → repli
    {
      const m = monter({ copie: { success: true, name: 'Vide.pdf' } });
      const r = await m.lire('abc', 'getTopo');
      V('copie sans contenu → repli (jamais un document vide à l\'écran)', r.dataB64 === 'GAS', r);
    }
    // 5. Le protocole passe par le MEME chemin que le topo
    {
      const m = monter({ copie: { success: true, name: 'P.pdf', mimeType: 'application/pdf', dataB64: 'MIROIR' } });
      await m.lire('p1', 'getProtocole');
      V('les protocoles lisent aussi la copie', m.appels.gas.length === 0, m.appels.gas);
    }

    // 6. Contrat de source : openDoc ne doit plus appeler apiPost en direct
    const bloc = html.match(/async function openDoc\([\s\S]*?\n\}/)[0];
    V('openDoc passe par _lireDoc', /_lireDoc\(/.test(bloc));
    V('openDoc n\'appelle plus apiPost directement', !/apiPost\(\{action:action/.test(bloc), bloc.slice(0, 0));

    console.log(`\n${ok} OK · ${ko} en échec`);
    if (ko) process.exit(1);
  })();
}
