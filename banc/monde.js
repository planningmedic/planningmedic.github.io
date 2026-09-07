/* ═══ MONDE SIMULÉ COMPLET — le vrai code.gs, un classeur fictif à l'échelle ═══
   Objectif : produire un VRAI planning avec le VRAI générateur du dépôt, pour
   que la page admin s'affiche exactement comme en production. */
const vm = require('vm'), fs = require('fs');
const { Classeur, fabriqueVerrou, VERROUS, extraireFonction } = require('./stubs');
const { MARS } = require('./jeu_donnees');

const SECTEURS = [
  ['CODE','NOM','ORDRE','COUVERTURE'],
  ['VIS','Bloc viscéral',1,'O'], ['REA','Réanimation',2,'O'], ['ORT','Orthopédie',3,'O'],
  ['ORL','ORL / Ophtalmologie',4,'O'], ['END','Endoscopies',5,'O'], ['MAT','Maternité',6,'O'],
  ['CI','Cardio interventionnelle',7,'O'], ['VOLANT','Volant',8,'N'],
];

function classeurComplet(annee) {
  const cl = new Classeur();
  // MEDECINS : id, nom, prénom, secteur, rôle…
  /* Colonnes EXACTES lues par getDoctorsFromMedecins : ID, NOM, INITIALES, ACTIF (=O). */
  const med = [['ID','NOM','INITIALES','ACTIF','SECTEUR','EMAIL','DECT','DATE_DEBUT','DATE_FIN','TP_JOURS']];
  MARS.forEach((id, i) => med.push([id, id, id.slice(0,2), 'O', SECTEURS[(i % 7) + 1][0],
                                    id.toLowerCase() + '@exemple.test', '100' + i, '', '', '']));
  cl.ajouter('MEDECINS', med);
  cl.ajouter('SECTEURS', SECTEURS);
  cl.ajouter('PLANNING_OVERRIDES', [['DATE','MAR_ID','MATIN','APREM','COMMENTAIRE']]);
  cl.ajouter('OVERRIDES', [['DATE','MAR_ID','TYPE','VALEUR']]);
  cl.ajouter('CONFIG', [['CLE','VALEUR'], ['ANNEE_ACTIVE', String(annee)]]);
  cl.ajouter('JOURS_FERIES', [['DATE','NOM'], [`${annee}-01-01`, 'Jour de l\'an'], [`${annee}-05-01`, 'Fête du travail']]);
  cl.ajouter('AFFECTATIONS', [['SECTEUR','JOUR','CRENEAU','MAR_ID']]);
  /* AFFECTATIONS_{annee} : un MAR par ligne, un mois par colonne, exactement
     comme en production (l'en-tête porte « JAN 2027 », « FEV 2027 »…). */
  const MOIS = ['JAN','FEV','MARS','AVRIL','MAI','JUIN','JUILLET','AOUT','SEPT','OCT','NOV','DEC'];
  const aff = [['MAR'].concat(MOIS.map(m => `${m} ${annee}`))];
  /* Un MAR sur quatre est VOLANT : c'est le vivier dans lequel le comité pioche
     pour combler les cases à pourvoir. Sans lui, le panneau dit — à juste titre —
     « aucun MAR disponible ». */
  MARS.forEach((id, i) => aff.push([id].concat(MOIS.map((_, m) =>
    (i % 4 === 3) ? 'VOLANT' : SECTEURS[((i + m) % 7) + 1][0]))));
  cl.ajouter(`AFFECTATIONS_${annee}`, aff);
  cl.ajouter('LOGS', [['DATE','ACTION']]);
  /* (29/08/2026) L'en-tête du banc disait ['DATE','ID'] ; le vrai logConnexion
     écrit ['HORODATAGE','NOM','INITIALES','ROLE']. Une doublure qui invente sa
     propre forme teste la croyance du banc, pas le système. */
  cl.ajouter('CONNEXIONS', [['HORODATAGE','NOM','INITIALES','ROLE']]);
  return cl;
}

/* GARDES_{annee} : construite pour couvrir toute l'année de planning
   (le générateur va du 1er lundi de janvier au dernier dimanche). */
function remplirGardes(cl, annee, ctx) {
  const debut = ctx.getPremierJourPlanning(annee);
  const fin = ctx.getPremierJourPlanning(annee + 1);
  const dates = [];
  const d = new Date(debut);
  while (d < fin) { dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); d.setDate(d.getDate()+1); }
  const lignes = [['', ''].concat(dates.map(()=>'')), ['', ''].concat(dates.map(()=>'')), ['MAR',''].concat(dates)];
  MARS.forEach((id, i) => {
    const l = [id, ''];
    dates.forEach((dt, j) => {
      const jour = new Date(dt + 'T00:00:00Z').getUTCDay();
      let code = '';
      if ((i * 7 + j) % 23 === 0) code = 'G';
      else if ((i * 7 + j) % 23 === 1) code = 'RG';
      else if ((i * 5 + j) % 31 === 0 && jour !== 0 && jour !== 6) code = 'V';
      else if ((i + j * 3) % 47 === 0 && jour !== 0 && jour !== 6) code = 'TP';
      l.push(code);
    });
    lignes.push(l);
  });
  cl.ajouter(`GARDES_${annee}`, lignes);
  return dates;
}

function monter(annee) {
  VERROUS.script = false; VERROUS.document = false;
  const cl = classeurComplet(annee);
  const PROPS = { MIROIR_PUSH_TOKEN: 'JETON' }, fichiersDrive = {}, triggers = [];
  const ctx = vm.createContext({
    console, JSON, Date, Number, String, Object, Array, Set, Map, Math, Error, isNaN, parseInt, parseFloat, RegExp, encodeURIComponent, decodeURIComponent,
    SpreadsheetApp: { getActiveSpreadsheet: () => cl, getActive: () => cl },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k,v) => { PROPS[k]=String(v); }, deleteProperty: k => { delete PROPS[k]; } }) },
    LockService: { getScriptLock: () => fabriqueVerrou('script'), getDocumentLock: () => fabriqueVerrou('document') },
    ScriptApp: { getProjectTriggers: () => triggers.slice(),
      newTrigger: nom => ({ timeBased: () => ({ after: () => ({ create: () => triggers.push({h:nom,getHandlerFunction:()=>nom}) }),
        everyHours: () => ({ create: () => triggers.push({h:nom,getHandlerFunction:()=>nom}) }),
        everyMinutes: () => ({ create: () => triggers.push({h:nom,getHandlerFunction:()=>nom}) }) }),
        forSpreadsheet: () => ({ onEdit: () => ({ create: () => triggers.push({h:nom,getHandlerFunction:()=>nom}) }) }) }),
      deleteTrigger: t => { const i = triggers.findIndex(x=>x.h===t.h); if(i>=0) triggers.splice(i,1); } },
    Logger: { log: () => {} },
    Utilities: { formatDate: (d) => d.toISOString().slice(0,10), sleep: () => {}, base64Encode: s => Buffer.from(String(s)).toString('base64') },
    Session: { getScriptTimeZone: () => 'Europe/Paris', getActiveUser: () => ({ getEmail: () => 'banc@exemple.test' }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{"success":true}' }) },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
      createFolder: () => ({ createFile: (n, c) => { fichiersDrive[n] = c; return { getId: () => 'id', setTrashed: () => {} }; }, getFilesByName: () => ({ hasNext: () => false }) }),
      getFilesByName: (n) => ({ hasNext: () => false, next: () => null }),
      createFile: (n, c) => { fichiersDrive[n] = c; return { getId: () => 'id', setTrashed: () => {} }; },
    },
    Gmail: { Users: { Labels: { get: () => ({ messagesUnread: 3 }) } } },
    __fichiersDrive: fichiersDrive,
  });
  ctx.globalThis = ctx;
  /* On charge les fichiers du dépôt DANS L'ORDRE, comme Apps Script le ferait :
     le projet est un espace de noms unique, les fonctions se voient entre elles. */
  ['../gas/generateur_gardes.gs', '../gas/code.gs'].forEach(f => {
    try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx); }
    catch (e) { console.log('  (chargement partiel de ' + f + ' : ' + e.message.slice(0, 90) + ')'); }
  });
  const dates = remplirGardes(cl, annee, ctx);
  return { cl, ctx, PROPS, fichiersDrive, dates, triggers };
}
module.exports = { monter, SECTEURS };
