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
/* (15/09/2026, étape 2) Le contrat est relu depuis les CORPS eux-mêmes (inchangés
   depuis le 13/09), avec un classifieur qui ignore les commentaires. Quatre libellés
   du 13/09 étaient approximatifs — le corps n'a pas bougé, l'étiquette si :
   getOrdreVacances est « mar seulement » (`if (user.role !== 'mar') return _deny()`),
   getPoseTp et getConsultAbsences sont « conditionnel » (un MAR ne reçoit que sa part),
   deciderJourTp est « admin » (refus multi-lignes que la première lecture avait raté). */
const CONTRAT = {
  'getActiveYear'             : 'sans code',
  'getAnneesDisponibles'      : 'sans code',
  'viderCacheConfig'          : 'admin',
  'getStatus'                 : 'tout code valide',
  'getStatsLive'              : 'tout code valide',
  'login'                     : 'tout code valide',
  'getReliquats'              : 'admin',
  'getNoelAnEligibles'        : 'tout code valide',
  'getIndispos'               : 'conditionnel',
  'deciderJourTpLot'          : 'admin',
  'deciderJourTp'             : 'admin',
  'getPoseTp'                 : 'conditionnel',
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
  'getOrdreVacances'          : 'mar seulement',
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
  'getConsultAbsences'        : 'conditionnel',
  'getPlanningJson'           : 'tout code valide',
  'getAffectationsJson'       : 'tout code valide',
};
function classer(fn, tout) {
  /* admin : refus hors comité en tête (1 ou plusieurs lignes) ; mar seulement : refus
     hors MAR en tête ; conditionnel : le rôle décide du périmètre à l'intérieur ;
     sinon tout code valide. Les commentaires sont retirés avant lecture. */
  const k = tout.indexOf('function ' + fn + '('); if (k < 0) return 'FONCTION ABSENTE';
  let prof = 0, j = tout.indexOf('{', k); for (; j < tout.length; j++) { if (tout[j] === '{') prof++; else if (tout[j] === '}') { prof--; if (!prof) break; } }
  const sans = tout.slice(k, j + 1).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const l = sans.split('\n').slice(2).map(x => x.trim()).filter(Boolean);
  for (const x of l.slice(0, 3)) { if (/^if \(user\.role !== 'admin'\)/.test(x)) return 'admin'; if (/^if \(user\.role !== 'mar'\)/.test(x)) return 'mar seulement'; }
  if (/if \([^)]*user\.role/.test(sans) || /user\.role\s*[!=]==/.test(sans)) return 'conditionnel';
  return 'tout code valide';
}
function contratActuel() {
  /* (15/09/2026 — étape 2) Le routeur est une TABLE : _actions_() dans Indispos.gs
     (ou routeur.gs), une ligne par action avec son rôle déclaré et sa fonction
     _act_<nom>, dont le corps vit dans un fichier métier. Le contrat se lit dans la
     table ; et pour chaque action on relit le corps pour vérifier que le contrôle de
     rôle qui s'y trouve dit la même chose que la déclaration. */
  const cands = ['routeur.gs', 'Indispos.gs'].map(f => path.join(__dirname, '..', 'gas', f)).filter(fs.existsSync);
  const src = fs.readFileSync(cands[0], 'utf8');
  const tout = require('./stubs').sourceGasTout();
  const out = {}, corps = {};
  const reTable = /"(\w+)"\s*:\s*\{\s*role:\s*'([^']+)'\s*,\s*fn:\s*(_act_\w+)\s*\}/g; let m;
  while ((m = reTable.exec(src))) {
    out[m[1]] = m[2];
    const k = tout.indexOf('function ' + m[3] + '(');
    const fen = k >= 0 ? tout.slice(k, k + 700) : '';
    corps[m[1]] = classer(m[3], tout);
  }
  return { fichier: path.basename(cands[0]), actions: out, corps };
}
console.log('═══ Le routeur répond au contrat des 64 actions ═══');
const { fichier, actions, corps } = contratActuel();
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
const desaccords = Object.keys(actions).filter(a => actions[a] !== 'sans code' && corps[a] !== actions[a]).map(a => a + ': table=' + actions[a] + ' corps=' + corps[a]);
V('pour chaque action, le rôle DÉCLARÉ dans la table est celui que le CORPS vérifie', desaccords.length === 0, desaccords);
V('chaque fonction _act_ existe dans le code métier', !Object.values(corps).includes('FONCTION ABSENTE'));
V('plus aucun « if (action === … ) » : le routeur est une table', !/if \(action === '/.test(fs.readFileSync(path.join(__dirname, '..', 'gas', fichier), 'utf8')));
console.log('\n' + ok + ' OK · ' + ko + ' en échec');
if (ko) process.exit(1);
