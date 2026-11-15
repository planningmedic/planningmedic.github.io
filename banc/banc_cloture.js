/* ═══ BANC — CLÔTURE D'ANNÉE EN UN SEUL GESTE (15/11/2026, lot A) ═══
   Jusqu'ici le banc ne vérifiait que le refus de date et l'ouverture du
   wizard : la clôture elle-même (bilan, déplacement des onglets, bascule)
   n'avait jamais été exécutée. Ici, le VRAI code serveur tourne de bout en
   bout sur un classeur principal et un classeur d'archive simulés :
     A. la clôture normale du lundi 04/01/2027, et ce qu'elle laisse derrière
     B. la relancer : rien n'est refait, rien n'est doublé
     C. D. le refus de date, y compris depuis l'éditeur (l'ancien TEST_W3_reel)
     E. ligne ANNEE_ACTIVE absente : refus, et setActiveYear ne ment plus
     F. onglet déjà présent dans l'archive : rien n'est écrasé
     G. copie de sécurité impossible : rien n'est touché
     H. coupure au milieu du déplacement, puis reprise
     I. J. archive inaccessible, année suivante pas générée
     K. répétition à blanc : contrôles et bilan, RIEN n'est écrit
     L. l'écran actuel (trois appels) passe par la même clôture
     M. le code ne contient plus les lanceurs d'essai ni l'ancien déplacement
   Contre-preuves : l'ancien code (commit 4fec50a) rejoué sur deux de ces cas. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { Classeur, extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
                         else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 300) : '')); } };

const GAS = path.join(__dirname, '..', 'gas');
const lire = f => fs.readFileSync(path.join(GAS, f), 'utf8');
const SRC_SETUP = lire('setup_annee.gs');
const MARQUE = 'CLÔTURE D\'ANNÉE EN UN SEUL GESTE';

const MARS = ['MAR01', 'MAR02', 'MAR03', 'MAR04', 'MAR05', 'MAR06'];
function datesPlanning(y) {   // du premier lundi de y au dimanche qui précède celui de y+1
  const pl = a => { const j1 = new Date(a, 0, 1), dow = j1.getDay(); const off = dow === 1 ? 7 : dow === 0 ? 1 : 8 - dow; return new Date(a, 0, 1 + off, 12); };
  const out = []; for (let d = pl(y); d < pl(y + 1); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12))
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  return out;
}
function grilleGardes(y) {
  const dates = datesPlanning(y);
  const lignes = [['GARDES ' + y], ['ID'].concat(dates.map(() => '')), ['ID'].concat(dates)];
  MARS.forEach((id, k) => lignes.push([id].concat(dates.map((dt, i) => i % MARS.length === k ? 'G' : (i + 1) % MARS.length === k ? 'G2' : ''))));
  return lignes;
}
function monde(opts) {
  opts = opts || {};
  const M = new Classeur(), A = new Classeur();
  M.getName = () => 'Classeur maître (banc)'; M.getId = () => 'id-maitre';
  M.ajouter('CONFIG', [['CLE', 'VALEUR']]
    .concat(opts.sansAnneeActive ? [] : [['ANNEE_ACTIVE', 2026]])
    .concat([['INDISPOS_ACTIVE', 2027], ['ARCHIVE_DRIVE_ID', 'id-archive'], ['DIAG_EMAIL', 'responsable@exemple.test']]));
  M.ajouter('GARDES_2026', grilleGardes(2026));
  M.ajouter('INDISPOS_2026', [['I'], ['I'], ['ID'].concat(datesPlanning(2026))].concat(MARS.map(id => [id])));
  M.ajouter('AFFECTATIONS_2026', [['ID', 'SECTEUR']].concat(MARS.map(id => [id, 'BLOC'])));
  M.ajouter('STATS_GARDES_2026', [['MEDECIN', 'TOTAL G', 'NOEL/AN']].concat(MARS.map(id => [id, 60, 0])));
  if (!opts.pasDe2027) {
    M.ajouter('INDISPOS_2027', [['I'], ['I'], ['ID'].concat(datesPlanning(2027))].concat(MARS.map(id => [id])));
    M.ajouter('GARDES_2027', grilleGardes(2027));
    M.ajouter('STATS_GARDES_2027', [['MEDECIN', 'TOTAL G']].concat(MARS.map(id => [id, 61])));
    M.ajouter('LIENS_R_2027', [['SAMEDI', 'MAR', 'R']]);
  }
  M.ajouter('HISTORIQUE', [['ID', 'ANNEE', 'TOTAL']]);
  M.ajouter('PLANNING_OVERRIDES', [['DATE', 'MAR', 'SECTEUR'], ['2026-03-02', 'MAR01', 'REA'], ['2027-02-01', 'MAR02', 'BLOC']]);
  if (opts.homonyme) A.ajouter('GARDES_2026', [['ancienne copie d\'essai']]);

  const journal = { copies: [], drive: [], mails: [], miroir: [], logs: [] };
  const dossier = { getFiles: () => { let i = 0; const f = journal.copies.map(c => ({ getDateCreated: () => c.quand })); return { hasNext: () => i < f.length, next: () => f[i++] }; } };
  const ctx = {
    console, JSON, Date: opts.Date || Date, Math, Number, String, Object, Array, Set, Error, isNaN, parseInt,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => M,
      openById: id => { if (opts.archiveKO) throw new Error('accès refusé (simulation)'); if (id !== 'id-archive') throw new Error('id inconnu'); return A; },
      flush: () => {},
      getUi: () => { throw new Error('pas d\'interface'); },
    },
    DriveApp: {
      getFoldersByName: () => { let pris = false; return { hasNext: () => !pris, next: () => { pris = true; return dossier; } }; },
      createFolder: () => dossier,
      getFileById: () => ({ makeCopy: (nom) => {
        if (opts.copieKO) throw new Error('quota Drive dépassé (simulation)');
        journal.copies.push({ nom, quand: new Date(), maitre: Object.keys(M.feuilles).sort() }); return { getName: () => nom };
      } }),
    },
    MailApp: { sendEmail: (dest, sujet, corps) => journal.mails.push({ dest, sujet, corps }) },
    Utilities: { formatDate: (d, tz, f) => (d instanceof Date ? d.toISOString().slice(0, 16) : String(d)) },
    Logger: { log: () => {} },
    ContentService: { createTextOutput: t => ({ texte: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    logAction: m => journal.logs.push(m),
    savePlanningToDrive: (nom) => journal.drive.push(nom),
    _jsonFilesByName_: nom => (nom === 'planning_2026.json' ? ['f'] : []),
    _miroirNoterPoussee_: (f, a) => journal.miroir.push(a),
    viderCacheConfig: () => {}, _configReset_: () => {},
    getActiveYear: () => { const l = M.getSheetByName('CONFIG').lignes.find(r => r[0] === 'ANNEE_ACTIVE'); return l ? Number(l[1]) : 2026; },
    buildDateToCol: (data) => { const m = {}; (data[2] || []).forEach((v, c) => { if (c && v) m[String(v)] = c; }); return m; },
    reconstruireDatesHeaders: (data) => (data[2] || []).slice(1),
    BACKUP_FOLDER_NAME: 'Planning-Med-Backups',
    ARCHIVE_SS_ID: opts.sansArchiveId ? '' : 'id-archive',
    _deny: () => ({ texte: '{"success":false,"error":"refusé"}' }),
    _error: m => ({ texte: JSON.stringify({ success: false, error: m }) }),
  };
  /* computeStatsLive (code.gs) a son propre banc ; ici, un comptage simple des G / G2
     de la grille, où qu'elle soit (classeur principal ou archive). */
  ctx.computeStatsLive = function (year) {
    const ss = ctx._ssWithSheet('GARDES_' + year); if (!ss) throw new Error('GARDES_' + year + ' introuvable');
    const d = ss.getSheetByName('GARDES_' + year).getDataRange().getValues();
    return d.slice(3).map(r => { const v = r.slice(1); const n = x => v.filter(c => c === x).length;
      return { medecin: r[0], total: n('G') + n('G2'), g: n('G'), g2: n('G2'), lun: 0, mar: 0, mer: 0, jeu: 0, ven: 0, sat: 3, dim: 2, vd: 0, vjf: 0, jf: 1, recupR: 0, h18: 0 }; });
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const code = [
    extraireFonction(path.join(GAS, 'code.gs'), 'getPremierJourPlanning'),
    extraireFonction(path.join(GAS, 'code.gs'), '_ssWithSheet'),
    extraireFonction(path.join(GAS, 'generateur_gardes.gs'), 'archiveMoveTabs_'),
    extraireFonction(path.join(GAS, 'setup_annee.gs'), '_clotureBilan_'),
    SRC_SETUP.slice(SRC_SETUP.indexOf(MARQUE) - 80),
    extraireFonction(path.join(GAS, 'Indispos.gs'), '_act_archiveYear'),
    extraireFonction(path.join(GAS, 'Indispos.gs'), '_act_cloturerAnnee'),
    extraireFonction(path.join(GAS, 'Indispos.gs'), '_act_clotureVerifier'),
    extraireFonction(path.join(GAS, 'Indispos.gs'), '_act_setActiveYear'),
    extraireFonction(path.join(GAS, 'indisponibilites.gs'), '_act_clearIndisposYear'),
  ].join('\n');
  vm.runInContext(code, ctx);
  const jour = opts.jour || new Date(2027, 0, 4, 9, 0);
  ctx._clotureMaintenant_ = () => new Date(jour.getTime());
  const photo = () => JSON.stringify([M.feuilles, A.feuilles].map(c => Object.keys(c).sort().map(n => [n, c[n].lignes])));
  const cfg = cle => (M.getSheetByName('CONFIG').lignes.find(r => r[0] === cle) || [])[1];
  return { M, A, ctx, journal, photo, cfg };
}
const admin = { role: 'admin' };
const action = (w, nom, payload) => JSON.parse(w.ctx['_act_' + nom]({ payload: payload || {}, user: admin, action: nom }).texte);

console.log('═══ A. Clôture normale, lundi 04/01/2027 ═══');
{
  const w = monde();
  const r = w.ctx.cloturerAnnee_(2026);
  V('la clôture réussit', r.success === true, r.message);
  V('année active : 2027, relue dans CONFIG', w.cfg('ANNEE_ACTIVE') === 2027, w.cfg('ANNEE_ACTIVE'));
  V('les 4 onglets 2026 ont quitté le classeur principal',
    ['GARDES_2026', 'INDISPOS_2026', 'AFFECTATIONS_2026', 'STATS_GARDES_2026'].every(n => !w.M.getSheetByName(n)));
  V('…et sont dans l\'archive, sous leur nom, avec toutes leurs lignes',
    ['GARDES_2026', 'INDISPOS_2026', 'AFFECTATIONS_2026', 'STATS_GARDES_2026'].every(n => w.A.getSheetByName(n))
    && w.A.getSheetByName('GARDES_2026').lignes.length === 3 + MARS.length);
  V('2027 n\'a pas bougé (gardes, statistiques, récupérations)',
    ['GARDES_2027', 'STATS_GARDES_2027', 'INDISPOS_2027', 'LIENS_R_2027'].every(n => w.M.getSheetByName(n)) && !w.A.getSheetByName('GARDES_2027'));
  const h = w.M.getSheetByName('HISTORIQUE').lignes.filter(l => l[1] === 2026);
  V('HISTORIQUE : une ligne 2026 par MAR', h.length === MARS.length, h.length);
  V('campagne d\'indisponibilités fermée', w.cfg('INDISPOS_ACTIVE') === undefined);
  V('UNE copie de sécurité, faite AVANT toute modification',
    w.journal.copies.length === 1 && w.journal.copies[0].maitre.includes('GARDES_2026'), w.journal.copies.map(c => c.nom));
  V('elle ne porte pas le nom « Backup… » (la rotation hebdomadaire ne l\'effacera pas)', !/^Backup/.test(w.journal.copies[0].nom));
  V('sauvegardes Drive : bilan, grille et indisponibilités 2026',
    ['archives_stats_2026.json', 'archives_gardes_2026.json', 'archives_indispos_2026.json'].every(n => w.journal.drive.includes(n)), w.journal.drive);
  const an = v => (v instanceof Date ? v.getFullYear() : Number(String(v).slice(0, 4)));
  const po = w.M.getSheetByName('PLANNING_OVERRIDES').lignes.slice(1).filter(l => l[0]);
  V('retouches quotidiennes : 2026 effacée, 2027 gardée', po.length === 1 && an(po[0][0]) === 2027, po);
  V('contrôle d\'après : tout au vert', Array.isArray(r.apres) && r.apres.length >= 7 && r.apres.every(c => c.niveau === 'ok'), r.apres);
  V('il vérifie que les statistiques 2026 restent trouvables pour les gardes 2028',
    r.apres.some(c => /Statistiques 2026 retrouvables pour les gardes 2028/.test(c.texte)));
  V('un mail de compte rendu part au responsable', w.journal.mails.length === 1 && /✅ Clôture 2026/.test(w.journal.mails[0].sujet), w.journal.mails.map(m => m.sujet));
  V('la copie rapide des écrans est prévenue pour 2026 ET 2027', w.journal.miroir.includes(2026) && w.journal.miroir.includes(2027), w.journal.miroir);
  V('le compte rendu ne contient aucune initiale de MAR', !/MAR0\d/.test(r.message), r.message);

  console.log('═══ B. Relancer une clôture faite ═══');
  const avant = w.photo();
  const r2 = w.ctx.cloturerAnnee_(2026);
  V('réponse : succès, « déjà clôturée »', r2.success === true && r2.dejaFaite === true, r2.message);
  V('rien n\'a changé dans les deux classeurs', w.photo() === avant);
  V('pas de seconde copie de sécurité, pas de second mail', w.journal.copies.length === 1 && w.journal.mails.length === 1);
}

console.log('═══ C. Trop tôt : le dimanche 03/01/2027 ═══');
{
  const w = monde({ jour: new Date(2027, 0, 3, 22, 0) });
  const avant = w.photo();
  const r = w.ctx.cloturerAnnee_(2026);
  V('refusée', r.success === false && /n'a pas encore commencé/.test(r.error), r.error);
  V('le refus donne la date et dit que rien n\'a été fait', /sera possible à partir du/.test(r.error) && /Aucune modification n'a été faite/.test(r.error));
  V('rien n\'a changé, aucune copie, aucun mail', w.photo() === avant && !w.journal.copies.length && !w.journal.mails.length);
}

console.log('═══ D. Depuis l\'éditeur Apps Script : archiveYear(2027) le 15/11/2026 ═══');
{
  const w = monde({ jour: new Date(2026, 10, 15, 12, 0) });
  w.M.ajouter('INDISPOS_2028', [['I']]); w.M.ajouter('GARDES_2028', [['G']]); w.M.ajouter('STATS_GARDES_2028', [['M'], ['MAR01']]);
  const avant = w.photo();
  const t = w.ctx.archiveYear(2027);
  V('refusée par les mêmes garde-fous que le portail', /n'a pas encore commencé/.test(t), t.slice(0, 120));
  V('GARDES_2027 est toujours dans le classeur principal, rien n\'a bougé', w.M.getSheetByName('GARDES_2027') && w.photo() === avant);
}

console.log('═══ E. Ligne ANNEE_ACTIVE absente de CONFIG ═══');
{
  const w = monde({ sansAnneeActive: true });
  const avant = w.photo();
  const r = w.ctx.cloturerAnnee_(2026);
  V('refusée avant d\'agir', r.success === false && /ANNEE_ACTIVE manque/.test(r.error), r.error);
  V('rien n\'a changé, aucune copie', w.photo() === avant && !w.journal.copies.length);
  const s = action(w, 'setActiveYear', { year: 2027 });
  V('setActiveYear ne répond plus « succès » sans avoir rien écrit', s.success === false && /ANNEE_ACTIVE/.test(s.error), s);
}

console.log('═══ F. Un onglet GARDES_2026 existe déjà dans l\'archive ═══');
{
  const w = monde({ homonyme: true });
  const avant = w.photo();
  const r = w.ctx.cloturerAnnee_(2026);
  V('refusée, l\'onglet est nommé', r.success === false && /GARDES_2026/.test(r.error) && /Rien ne sera écrasé/.test(r.error), r.error);
  V('l\'onglet de l\'archive est intact, rien n\'a bougé', w.A.getSheetByName('GARDES_2026').lignes[0][0] === 'ancienne copie d\'essai' && w.photo() === avant);
}

console.log('═══ G. Copie de sécurité impossible ═══');
{
  const w = monde({ copieKO: true });
  const avant = w.photo();
  const r = w.ctx.cloturerAnnee_(2026);
  V('la clôture s\'arrête', r.success === false && /Copie de sécurité impossible/.test(r.error), r.error);
  V('rien n\'a été touché', w.photo() === avant && w.cfg('ANNEE_ACTIVE') === 2026);
}

console.log('═══ H. Coupure au milieu du déplacement, puis reprise ═══');
{
  const w = monde();
  const vrai = w.M.getSheetByName('STATS_GARDES_2026').copyTo;
  let panne = true;
  w.M.getSheetByName('STATS_GARDES_2026').copyTo = function (dest) { if (panne) throw new Error('délai dépassé (simulation)'); return vrai.call(this, dest); };
  let r = null, leve = '';
  try { r = w.ctx.cloturerAnnee_(2026); } catch (e) { leve = e.message; }
  V('la panne est rapportée (pas de faux succès)', !leve && r && r.success === false, leve || (r && r.message));
  V('l\'année active n\'a PAS basculé', w.cfg('ANNEE_ACTIVE') === 2026);
  V('le message dit quoi faire : relancer', r && /relancer la clôture/.test(r.error), r && r.error);
  V('STATS_GARDES_2026 est toujours dans le classeur principal', !!w.M.getSheetByName('STATS_GARDES_2026'));
  panne = false;
  const r2 = w.ctx.cloturerAnnee_(2026);
  V('la relance termine la clôture', r2.success === true && w.cfg('ANNEE_ACTIVE') === 2027, r2.message);
  V('HISTORIQUE n\'est pas doublé', w.M.getSheetByName('HISTORIQUE').lignes.filter(l => l[1] === 2026).length === MARS.length);
  V('tout est à l\'archive', ['GARDES_2026', 'STATS_GARDES_2026'].every(n => w.A.getSheetByName(n) && !w.M.getSheetByName(n)));
}

console.log('═══ I. J. Archive inaccessible · 2027 pas générée ═══');
{
  const w = monde({ archiveKO: true }); const avant = w.photo();
  const r = w.ctx.cloturerAnnee_(2026);
  V('archive inaccessible : refusée, rien touché', r.success === false && /archive inaccessible/i.test(r.error) && w.photo() === avant, r.error);
  const w2 = monde({ pasDe2027: true }); const avant2 = w2.photo();
  const r2 = w2.ctx.cloturerAnnee_(2026);
  V('2027 pas générée : refusée, rien touché', r2.success === false && /2027 pas prête/.test(r2.error) && w2.photo() === avant2, r2.error);
}

console.log('═══ K. Répétition à blanc ═══');
{
  const w = monde({ jour: new Date(2026, 11, 15, 10, 0) });   // en décembre : la répétition marche, la clôture non
  const avant = w.photo();
  const v = action(w, 'clotureVerifier', { year: 2026 });
  V('elle répond, et dit que la date bloque encore', v.success === true && v.peutClore === false
    && v.controles.some(c => c.niveau === 'bloquant' && /n'a pas encore commencé/.test(c.texte)), v.controles);
  V('les autres contrôles sont au vert', v.controles.filter(c => c.niveau === 'bloquant').length === 1);
  V('le bilan 2026 : une ligne par MAR, total, week-ends, fériés, Noël/An',
    v.bilan && v.bilan.mars.length === MARS.length && v.bilan.mars.every(m => 'total' in m && 'weekends' in m && 'feries' in m && 'noelAn' in m), v.bilan);
  const f = v.bilan.fetes;
  V('qui était de garde les 24/12, 25/12, 31/12 et 01/01', ['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01'].every(d => f[d] && f[d].length === 2), f);
  V('RIEN n\'a été écrit, aucune copie, aucun mail', w.photo() === avant && !w.journal.copies.length && !w.journal.mails.length);
  const w2 = monde(); const v2 = action(w2, 'clotureVerifier', { year: 2026 });
  V('le 04/01/2027, la répétition donne le feu vert', v2.peutClore === true, v2.controles);
}

console.log('═══ L. L\'écran actuel (trois appels) passe par la même clôture ═══');
{
  const w = monde();
  const a = action(w, 'archiveYear', { year: 2026 });
  const b = action(w, 'setActiveYear', { year: 2027 });
  const c = action(w, 'clearIndisposYear', {});
  V('archiveYear : succès, et l\'année a DÉJÀ basculé dans ce même appel', a.success === true && a.etapes.length >= 5, a.message);
  V('setActiveYear puis clearIndisposYear : succès, rien de plus à faire', b.success === true && c.success === true, [b, c]);
  V('état final identique à la clôture en un geste', w.cfg('ANNEE_ACTIVE') === 2027 && !w.M.getSheetByName('GARDES_2026') && w.cfg('INDISPOS_ACTIVE') === undefined);
}

console.log('═══ M. Le code ═══');
{
  const tout = fs.readdirSync(GAS).filter(f => f.endsWith('.gs') && f !== 'dev.gs').map(lire).join('\n');
  V('plus aucun lanceur d\'essai (TEST_W3_reel, TEST_W3_safe, TEST_W2, W2_2026, W1_2028, TEST_run)',
    !/function (TEST_W3_reel|TEST_W3_safe|TEST_W2|W2_2026|W1_2028|TEST_run|TEST_remplirIndispos)\s*\(/.test(tout));
  V('setup_annee.gs n\'efface plus jamais un onglet de l\'archive', !/arch\.deleteSheet/.test(SRC_SETUP));
  V('archiveYear (éditeur) passe par cloturerAnnee_', /function archiveYear\(year\) \{[\s\S]{0,120}cloturerAnnee_\(year\)/.test(SRC_SETUP));
  V('l\'action archiveYear aussi', /cloturerAnnee_\(yearToArchive\)/.test(lire('Indispos.gs')));
  V('cloturerAnnee est une écriture sous verrou', /WRITE_ACTIONS_LOCK = new Set\(\[[\s\S]*'cloturerAnnee'[\s\S]*?\]\)/.test(lire('Indispos.gs')));
}

console.log('═══ Contre-preuves : l\'ancien code (4fec50a) rejoué ═══');
{
  let ancien = null;
  try { ancien = { ind: execSync('git show 4fec50a:gas/Indispos.gs', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
                   set: execSync('git show 4fec50a:gas/setup_annee.gs', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString() }; } catch (e) { ancien = null; }
  V('l\'historique du dépôt est disponible (clone complet)', !!ancien);
  if (ancien) {
    const tmp = (nom, src) => { const f = path.join(require('os').tmpdir(), 'cloture_' + process.pid + '_' + nom); fs.writeFileSync(f, src); return f; };
    const fInd = tmp('Indispos.gs', ancien.ind), fSet = tmp('setup_annee.gs', ancien.set);
    // 1. L'ancien setActiveYear, ligne absente : il répondait succès
    {
      const w = monde({ sansAnneeActive: true });
      vm.runInContext(extraireFonction(fInd, '_act_setActiveYear'), w.ctx);
      const s = action(w, 'setActiveYear', { year: 2027 });
      V('ANCIEN setActiveYear : « succès » sans rien écrire — le test sait le voir', s.success === true && w.cfg('ANNEE_ACTIVE') === undefined, s);
    }
    // 2. L'ancien archiveYear lancé depuis l'éditeur en novembre 2026 : il archivait 2027
    {
      const w = monde({ jour: new Date(2026, 10, 15, 12, 0) });
      vm.runInContext(extraireFonction(fSet, 'archiveYear'), w.ctx);
      try { w.ctx.archiveYear(2027, true); } catch (e) {}
      V('ANCIEN archiveYear(2027) depuis l\'éditeur : GARDES_2027 sortait du classeur — le test sait le voir',
        !w.M.getSheetByName('GARDES_2027') && !!w.A.getSheetByName('GARDES_2027'));
    }
    // 3. L'ancien refus de date, le lundi 04/01/2027 à 9 h : il refusait (comparé à midi)
    {
      const VraiDate = Date, t0 = new VraiDate(2027, 0, 4, 9, 0).getTime();
      function DateFigee(...a) { return a.length ? new VraiDate(...a) : new VraiDate(t0); }
      DateFigee.now = () => t0;
      const w = monde({ Date: DateFigee });
      w.ctx.getSpreadsheetTimeZone = () => 'Europe/Paris';
      w.M.getSpreadsheetTimeZone = () => 'Europe/Paris';
      vm.runInContext(extraireFonction(fInd, '_act_archiveYear'), w.ctx);
      const r = action(w, 'archiveYear', { year: 2026 });
      V('ANCIEN serveur, lundi 04/01/2027 à 9 h : clôture refusée — le test sait le voir', r.success === false && /n'a pas encore commencé/.test(r.error || ''), r);
      const w2 = monde({ jour: new Date(2027, 0, 4, 9, 0) });
      V('NOUVEAU serveur, même heure : acceptée', w2.ctx.cloturerAnnee_(2026).success === true);
    }
    try { fs.unlinkSync(fInd); fs.unlinkSync(fSet); } catch (e) {}
  }
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
