/* ═══ BANC — LE CONTRAT DES 64 ACTIONS DU ROUTEUR (14/09/2026, fondation du chantier 9) ═══
   Avant de découper Indispos.gs (un fichier par sujet, le routeur en table),
   on fige ce qui existe : chaque action, et le contrôle d'accès tel qu'il
   est écrit AUJOURD'HUI dans les `if (action === '…')`. Extrait
   automatiquement le 14/09/2026, relu à la main.
     · 'sans code'        : servie avant checkCode (getActiveYear, getAnneesDisponibles) ;
     · 'tout code valide' : n'importe quel MAR authentifié ;
     · 'admin'            : `if (user.role !== 'admin') return _deny();` en tête ;
     · 'conditionnel'     : le rôle décide du périmètre à l'intérieur (getIndispos,
                            saveIndispos : un MAR n'agit que sur lui-même).
   Quand la table du routeur sera écrite, elle devra reproduire EXACTEMENT
   cette liste : une action de plus, de moins, ou un rôle qui change fait
   échouer ce scénario. Tant qu'Indispos.gs n'est pas découpé, il vérifie
   que le fichier n'a pas bougé de son contrat entre deux sessions. */
const fs = require('fs'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
                         else { ko++; console.log('  ✗ ' + t, d === undefined ? '' : JSON.stringify(d)); } };
const CONTRAT = {
  'getActiveYear'             : 'tout code valide',
  'getAnneesDisponibles'      : 'tout code valide',
  'viderCacheConfig'          : 'admin',
  'getStatus'                 : 'tout code valide',
  'getStatsLive'              : 'tout code valide',
  'login'                     : 'tout code valide',
  'getReliquats'              : 'admin',
  'getNoelAnEligibles'        : 'tout code valide',
  'getIndispos'               : 'conditionnel',
  'deciderJourTpLot'          : 'admin',
  'deciderJourTp'             : 'admin',
  'getPoseTp'                 : 'tout code valide',
  'saveIndispos'              : 'conditionnel',
  'saveIndisposBatch'         : 'admin',
  'getAllIndispos'            : 'admin',
  'applyModification'         : 'admin',
  'creerEchange'              : 'tout code valide',
  'repondreEchange'           : 'tout code valide',
  'getStats'                  : 'admin',
  'generateGardes'            : 'admin',
  'getGardes'                 : 'admin',
  'getJoursFeries'            : 'admin',
  'getOrdreVacances'          : 'tout code valide',
  'getVacConfig'              : 'tout code valide',
  'setActiveYear'             : 'admin',
  'initYear'                  : 'admin',
  'publishPlanning'           : 'admin',
  'getVacValidation'          : 'admin',
  'getOverrides'              : 'admin',
  'deleteOverride'            : 'admin',
  'getAdminBootstrap'         : 'admin',
  'getMedecins'               : 'admin',
  'saveMedecin'               : 'admin',
  'getAffectations'           : 'admin',
  'saveAffectations'          : 'admin',
  'getVacancesConfig'         : 'admin',
  'savePeriodes'              : 'admin',
  'saveGroupes'               : 'admin',
  'saveConfig'                : 'admin',
  'sendCodes'                 : 'admin',
  'mailNonLus'                : 'admin',
  'mailListe'                 : 'admin',
  'mailMessage'               : 'admin',
  'diagComplet'               : 'admin',
  'archiveYear'               : 'admin',
  'saveAffectationsMar'       : 'admin',
  'addMedecinToGroupe'        : 'admin',
  'resetCodeMar'              : 'admin',
  'sendCodesMar'              : 'admin',
  'getConflitsAll'            : 'admin',
  'envoyerRecapIndispos'      : 'admin',
  'setIndisposYear'           : 'admin',
  'clearIndisposYear'         : 'admin',
  'savePlanningOverride'      : 'admin',
  'savePlanningOverridesBatch': 'admin',
  'getPanneauSemaine'         : 'admin',
  'getMARsDispoJour'          : 'admin',
  'setDailyStatus'            : 'admin',
  'poserAbsenceLongue'        : 'admin',
  'getAbsencesLongues'        : 'admin',
  'annulerAbsenceLongue'      : 'admin',
  'getConsultAbsences'        : 'tout code valide',
  'getPlanningJson'           : 'tout code valide',
  'getAffectationsJson'       : 'tout code valide',
};
function contratActuel() {
  /* Le routeur vit dans Indispos.gs tant que le chantier 9 n'est pas fait ;
     ensuite dans routeur.gs. On lit celui qui existe. */
  const cands = ['routeur.gs', 'Indispos.gs'].map(f => path.join(__dirname, '..', 'gas', f)).filter(fs.existsSync);
  const src = fs.readFileSync(cands[0], 'utf8');
  const L = src.split('\n');
  const idx = L.map((l, i) => [i, (l.match(/if \(action === '(\w+)'\)/) || [])[1]]).filter(x => x[1]);
  const checkAt = L.findIndex(l => /const user = checkCode\(/.test(l));
  const out = {};
  idx.forEach(([i, a], k) => {
    const fin = k + 1 < idx.length ? idx[k + 1][0] : L.length;
    const fen = L.slice(i, Math.min(i + 8, fin)).join('\n');
    if (i < checkAt) out[a] = 'sans code';
    else if (/role !== 'admin'/.test(fen)) out[a] = 'admin';
    else if (/role ===/.test(fen)) out[a] = 'conditionnel';
    else out[a] = 'tout code valide';
  });
  return { fichier: path.basename(cands[0]), actions: out };
}
console.log('═══ Le routeur répond au contrat des 64 actions ═══');
const { fichier, actions } = contratActuel();
const attendu = Object.assign({}, CONTRAT, { getActiveYear: 'sans code', getAnneesDisponibles: 'sans code' });
V('le routeur est lu dans ' + fichier, !!fichier);
V('64 actions, ni plus ni moins', Object.keys(actions).length === 64, Object.keys(actions).length);
const manquantes = Object.keys(attendu).filter(a => !(a in actions));
const enTrop = Object.keys(actions).filter(a => !(a in attendu));
V('aucune action du contrat ne manque', manquantes.length === 0, manquantes);
V('aucune action hors contrat', enTrop.length === 0, enTrop);
const roleChange = Object.keys(attendu).filter(a => actions[a] && actions[a] !== attendu[a]).map(a => a + ': ' + attendu[a] + ' → ' + actions[a]);
V('chaque action garde exactement son contrôle d\'accès', roleChange.length === 0, roleChange);
V('exactement deux actions sans code : les listes d\'années', Object.values(actions).filter(r => r === 'sans code').length === 2);
V('48 actions réservées au comité', Object.values(actions).filter(r => r === 'admin').length === 48, Object.values(actions).filter(r => r === 'admin').length);
console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
