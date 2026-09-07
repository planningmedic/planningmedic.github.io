// ══════════════════════════════════════════════════════════════════════
//  VEILLE BIBLIOGRAPHIQUE — module autonome
//  Extrait de portail.gs le 08/08/2026, puis refondu.
//
//  ⚠️ INCRÉMENTER GAS_VERSION_VEILLE à CHAQUE push de ce fichier.
//
//  ── CE QUI A CHANGÉ, ET POURQUOI ──────────────────────────────────────
//  Tout ce qui suit vient de mesures faites sur PubMed le 03 et 08/08/2026,
//  pas d'une intuition. Les chiffres sont conservés pour qu'on ne refasse
//  pas le chemin à l'envers.
//
//  1. RÈGLE « REVUE ET THÈME ». Avant : revue OU thème, l'axe thème
//     interrogeant TOUT PubMed sans borne. Il produisait 95 % du volume
//     (504 articles sur 528 en 90 jours) et la totalité du bruit : Gene,
//     Virulence, Ren Fail, Sleep Med, Ann Med. Désormais un article doit
//     venir d'une revue de la liste ET correspondre à un thème.
//
//  2. FILTRE ESPÈCE ASSOUPLI. Avant : "humans"[MeSH] exigé. Ce mot-clé
//     n'est attribué qu'à l'indexation MEDLINE, des semaines après la
//     parution : sur les 6 grandes revues, il rejetait 14 articles sur 14
//     du mois en cours (Prone positioning in ARDS, entre autres).
//     Désormais on ne rejette que l'animal AVÉRÉ.
//
//  3. LISTE BLANCHE DE TYPES : SUPPRIMÉE sur l'axe REVUE, RÉTABLIE sur
//     l'axe GENERAL. Sur les revues d'anesthésie-réanimation elle
//     plafonnait Anesthesiology à 20 % même entièrement indexée, 2 % en
//     pratique (3 articles sur 122, tous des synthèses). Mais sa
//     suppression sur les 18 généralistes a fait exploser l'axe croisé :
//     1 040 articles/180 j au lieu de ~31/90 j — NEJM, BMJ, Circulation
//     déversent tout dès qu'un mot d'un thème apparaît. D'où :
//     axe REVUE sans liste blanche, axe GENERAL restreint aux essais
//     randomisés, méta-analyses, revues systématiques et recommandations.
//     La liste NOIRE, elle, s'applique aux deux axes.
//
//  4. PAGINATION. Avant : retmax=200 avec sort=date, sans le moindre
//     message en cas de dépassement. Le code gardait les 200 plus RÉCENTS,
//     c'est-à-dire les moins indexés : le pire choix possible.
//
//  5. REQUÊTES EN POST. La liste de 41 revues dépasse 2 000 caractères ;
//     en GET elle était tronquée silencieusement.
//
//  6. MOTS VIDES. PubMed ignore of/for/the/a/and/after dans une recherche
//     de phrase, qui alors ne correspond à RIEN. C'est ce qui rendait
//     inopérante l'ancienne exclusion "protocol for a"[Title] — d'où les
//     protocoles d'essai qui passaient. Aucune expression de ce fichier
//     ne contient de mot vide.
//
//  ── CE QUE CE MODULE NE FAIT PAS ──────────────────────────────────────
//  Il ne classe pas les articles par qualité. Il ramène ~73 articles par
//  semaine, tous issus des revues retenues et correspondant aux thèmes.
//  Le tri fin (notation sur titre + résumé) est un chantier distinct.
//  Mesuré : resserrer davantage le vocabulaire coûte plus de couverture
//  (-12 % sur Anesthesiology) qu'il ne réduit de volume (-9 %).
//
//  LU et STAR restent COMMUNS à tout le service (une seule colonne pour
//  23 MARs). Le passage par MAR suppose de toucher au miroir, qui sert un
//  instantané unique et partagé : chantier séparé.
// ══════════════════════════════════════════════════════════════════════

const GAS_VERSION_VEILLE = '2026-08-27.1';

const VEILLE_CFG_TAB = 'VEILLE_CFG';
const VEILLE_TAB     = 'VEILLE';
const EUTILS_BASE    = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const EUTILS_TOOL    = 'PlanningMed';
const EUTILS_EMAIL   = 'planningmedic@gmail.com';

const VEILLE_PAGE     = 1000;   // résultats rapatriés par appel esearch
const VEILLE_PLAFOND  = 6000;   // garde-fou absolu par requête
const VEILLE_LOT      = 200;    // taille des lots esummary
const VEILLE_PAUSE    = 350;    // ms entre deux appels PubMed (politesse NCBI)

// ══════════════════════════════════════════════════════════════════════
//  CONFIGURATION PAR DÉFAUT (onglet VEILLE_CFG)
//  TYPE : REVUE (accès direct) · GENERAL (croisée aux thèmes) ·
//         THEME · PARAM · PUBTYPE (liste blanche de l'axe GENERAL
//         uniquement — cf. point 3 de l'en-tête).
// ══════════════════════════════════════════════════════════════════════

const VEILLE_DEFAULT_CFG = [
  // ── 23 revues en accès direct ─────────────────────────────────────
  ['REVUE', 'Anesthesiology',             'Anesthesiology',             'O'],
  ['REVUE', 'Br J Anaesth',               'Br J Anaesth',               'O'],
  ['REVUE', 'Anaesthesia',                'Anaesthesia',                'O'],
  ['REVUE', 'Anesth Analg',               'Anesth Analg',               'O'],
  ['REVUE', 'Eur J Anaesthesiol',         'Eur J Anaesthesiol',         'O'],
  ['REVUE', 'Anaesth Crit Care Pain Med', 'Anaesth Crit Care Pain Med', 'O'],
  ['REVUE', 'Can J Anaesth',              'Can J Anaesth',              'O'],
  ['REVUE', 'J Clin Anesth',              'J Clin Anesth',              'O'],
  ['REVUE', 'Reg Anesth Pain Med',        'Reg Anesth Pain Med',        'O'],
  ['REVUE', 'Paediatr Anaesth',           'Paediatr Anaesth',           'O'],
  ['REVUE', 'Int J Obstet Anesth',        'Int J Obstet Anesth',        'O'],
  ['REVUE', 'Perioper Med',               'Perioper Med (Lond)',        'O'],
  ['REVUE', 'Intensive Care Med',         'Intensive Care Med',         'O'],
  ['REVUE', 'Crit Care Med',              'Crit Care Med',              'O'],
  ['REVUE', 'Crit Care',                  'Crit Care',                  'O'],
  ['REVUE', 'Ann Intensive Care',         'Ann Intensive Care',         'O'],
  ['REVUE', 'Am J Respir Crit Care Med',  'Am J Respir Crit Care Med',  'O'],
  ['REVUE', 'J Crit Care',                'J Crit Care',                'O'],
  ['REVUE', 'Shock',                      'Shock',                      'O'],
  ['REVUE', 'Crit Care Explor',           'Crit Care Explor',           'O'],
  ['REVUE', 'Thorax',                     'Thorax',                     'O'],
  ['REVUE', 'Resuscitation',              'Resuscitation',              'O'],
  ['REVUE', 'Ann Emerg Med',              'Ann Emerg Med',              'O'],

  // ── 18 revues croisées aux thèmes ─────────────────────────────────
  ['GENERAL', 'N Engl J Med',      'N Engl J Med',      'O'],
  ['GENERAL', 'JAMA',              'JAMA',              'O'],
  ['GENERAL', 'Lancet',            'Lancet',            'O'],
  ['GENERAL', 'BMJ',               'BMJ',               'O'],
  ['GENERAL', 'Ann Intern Med',    'Ann Intern Med',    'O'],
  ['GENERAL', 'JAMA Intern Med',   'JAMA Intern Med',   'O'],
  ['GENERAL', 'Nat Med',           'Nat Med',           'O'],
  ['GENERAL', 'Ann Surg',          'Ann Surg',          'O'],
  ['GENERAL', 'JAMA Surg',         'JAMA Surg',         'O'],
  ['GENERAL', 'Br J Surg',         'Br J Surg',         'O'],
  ['GENERAL', 'Pain',              'Pain',              'O'],
  ['GENERAL', 'Transfusion',       'Transfusion',       'O'],
  ['GENERAL', 'J Thromb Haemost',  'J Thromb Haemost',  'O'],
  ['GENERAL', 'Circulation',       'Circulation',       'O'],
  ['GENERAL', 'Eur Heart J',       'Eur Heart J',       'O'],
  ['GENERAL', 'Clin Infect Dis',   'Clin Infect Dis',   'O'],
  ['GENERAL', 'Chest',             'Chest',             'O'],
  ['GENERAL', 'Lancet Respir Med', 'Lancet Respir Med', 'O'],

  // ── 21 thèmes, en TITRE/RÉSUMÉ (pas en MeSH : disponible dès la
  //    parution, donc aucun retard d'indexation) ────────────────────
  ['THEME', 'Voies aériennes',
    '"intubation"[tiab] OR "extubation"[tiab] OR "difficult airway"[tiab] OR "airway management"[tiab] OR "videolaryngoscopy"[tiab] OR "video laryngoscopy"[tiab] OR "laryngoscopy"[tiab] OR "laryngeal mask"[tiab] OR "supraglottic airway"[tiab] OR "preoxygenation"[tiab] OR "cricothyroidotomy"[tiab] OR "tracheostomy"[tiab]', 'O'],
  ['THEME', 'Anesthésie locorégionale',
    '"regional anesthesia"[tiab] OR "regional anaesthesia"[tiab] OR "nerve block"[tiab] OR "nerve blocks"[tiab] OR "spinal anesthesia"[tiab] OR "spinal anaesthesia"[tiab] OR "epidural"[tiab] OR "neuraxial"[tiab] OR "local anesthetic"[tiab] OR "local anaesthetic"[tiab] OR "ropivacaine"[tiab] OR "bupivacaine"[tiab] OR "plane block"[tiab]', 'O'],
  ['THEME', 'Douleur périopératoire',
    '"postoperative pain"[tiab] OR "acute pain"[tiab] OR "analgesia"[tiab] OR "analgesic"[tiab] OR "opioid"[tiab] OR "opioids"[tiab] OR "morphine"[tiab] OR "ketamine"[tiab] OR "chronic postsurgical pain"[tiab] OR "multimodal analgesia"[tiab] OR "opioid free"[tiab]', 'O'],
  ['THEME', 'Hémodynamique',
    '"hemodynamic"[tiab] OR "haemodynamic"[tiab] OR "vasopressor"[tiab] OR "vasopressors"[tiab] OR "norepinephrine"[tiab] OR "noradrenaline"[tiab] OR "fluid responsiveness"[tiab] OR "fluid therapy"[tiab] OR "cardiac output"[tiab] OR "intraoperative hypotension"[tiab] OR "circulatory shock"[tiab] OR "microcirculation"[tiab] OR "capillary refill"[tiab] OR "lactate clearance"[tiab] OR "goal directed"[tiab]', 'O'],
  ['THEME', 'Ventilation et SDRA',
    '"mechanical ventilation"[tiab] OR "ARDS"[tiab] OR "acute respiratory distress syndrome"[tiab] OR "prone position"[tiab] OR "prone positioning"[tiab] OR "PEEP"[tiab] OR "positive end expiratory pressure"[tiab] OR "tidal volume"[tiab] OR "weaning"[tiab] OR "extubation failure"[tiab] OR "one lung ventilation"[tiab] OR "high flow nasal"[tiab] OR "noninvasive ventilation"[tiab] OR "ECMO"[tiab] OR "apnoeic oxygenation"[tiab]', 'O'],
  ['THEME', 'Sepsis et infection',
    '"sepsis"[tiab] OR "septic shock"[tiab] OR "bacteremia"[tiab] OR "bacteraemia"[tiab] OR "antibiotic"[tiab] OR "antibiotics"[tiab] OR "antimicrobial"[tiab] OR "pneumonia"[tiab] OR "nosocomial"[tiab] OR "surgical site infection"[tiab]', 'O'],
  ['THEME', 'Arrêt cardiaque',
    '"cardiac arrest"[tiab] OR "cardiopulmonary resuscitation"[tiab] OR "resuscitation"[tiab] OR "defibrillation"[tiab] OR "ROSC"[tiab] OR "post cardiac arrest"[tiab] OR "targeted temperature management"[tiab]', 'O'],
  ['THEME', 'Hémorragie et transfusion',
    '"hemorrhage"[tiab] OR "haemorrhage"[tiab] OR "bleeding"[tiab] OR "transfusion"[tiab] OR "tranexamic acid"[tiab] OR "coagulopathy"[tiab] OR "fibrinogen"[tiab] OR "massive transfusion"[tiab] OR "patient blood management"[tiab] OR "anemia"[tiab] OR "anaemia"[tiab] OR "viscoelastic"[tiab]', 'O'],
  ['THEME', 'Neurologie et délire',
    '"delirium"[tiab] OR "postoperative cognitive"[tiab] OR "neurocognitive"[tiab] OR "anesthetic depth"[tiab] OR "anaesthetic depth"[tiab] OR "processed EEG"[tiab] OR "bispectral"[tiab] OR "traumatic brain injury"[tiab] OR "intracranial pressure"[tiab] OR "perioperative stroke"[tiab] OR "sedation depth"[tiab] OR "sedation practice"[tiab]', 'O'],
  ['THEME', 'Médecine périopératoire',
    '"postoperative complications"[tiab] OR "prehabilitation"[tiab] OR "enhanced recovery"[tiab] OR "ERAS"[tiab] OR "frailty"[tiab] OR "preoperative assessment"[tiab] OR "preoperative optimization"[tiab] OR "postoperative outcome"[tiab] OR "postoperative outcomes"[tiab] OR "postoperative mortality"[tiab] OR "myocardial injury"[tiab] OR "perioperative medicine"[tiab]', 'O'],
  ['THEME', 'Agents et pharmacologie',
    '"propofol"[tiab] OR "sevoflurane"[tiab] OR "desflurane"[tiab] OR "remimazolam"[tiab] OR "dexmedetomidine"[tiab] OR "remifentanil"[tiab] OR "sufentanil"[tiab] OR "neuromuscular block"[tiab] OR "neuromuscular blockade"[tiab] OR "rocuronium"[tiab] OR "sugammadex"[tiab] OR "total intravenous"[tiab] OR "target controlled infusion"[tiab]', 'O'],
  ['THEME', 'Obstétrique',
    '"obstetric"[tiab] OR "obstetrical"[tiab] OR "cesarean"[tiab] OR "caesarean"[tiab] OR "labor analgesia"[tiab] OR "labour analgesia"[tiab] OR "preeclampsia"[tiab] OR "postpartum hemorrhage"[tiab] OR "postpartum haemorrhage"[tiab] OR "parturient"[tiab]', 'O'],
  ['THEME', 'Pédiatrie',
    '"pediatric anesthesia"[tiab] OR "paediatric anaesthesia"[tiab] OR "pediatric patients"[tiab] OR "paediatric patients"[tiab] OR "neonatal anesthesia"[tiab] OR "neonatal anaesthesia"[tiab] OR "children undergoing"[tiab] OR "pediatric intensive care"[tiab] OR "paediatric intensive care"[tiab]', 'O'],
  ['THEME', 'Insuffisance rénale',
    '"acute kidney injury"[tiab] OR "renal replacement therapy"[tiab] OR "hemodialysis"[tiab] OR "haemodialysis"[tiab] OR "hemofiltration"[tiab] OR "CRRT"[tiab] OR "nephrotoxicity"[tiab] OR "renal failure"[tiab] OR "oliguria"[tiab]', 'O'],
  ['THEME', 'NVPO',
    '"postoperative nausea"[tiab] OR "vomiting"[tiab] OR "antiemetic"[tiab] OR "ondansetron"[tiab] OR "droperidol"[tiab] OR "PONV"[tiab]', 'O'],
  ['THEME', 'Ambulatoire',
    '"ambulatory surgery"[tiab] OR "ambulatory anesthesia"[tiab] OR "ambulatory anaesthesia"[tiab] OR "day surgery"[tiab] OR "day case"[tiab] OR "outpatient surgery"[tiab] OR "same day discharge"[tiab] OR "fast track"[tiab] OR "postanesthesia care"[tiab] OR "postanaesthesia care"[tiab]', 'O'],
  ['THEME', 'Nutrition',
    '"nutrition"[tiab] OR "nutritional"[tiab] OR "enteral"[tiab] OR "parenteral"[tiab] OR "caloric"[tiab] OR "malnutrition"[tiab] OR "refeeding"[tiab] OR "glycemic control"[tiab] OR "glycaemic control"[tiab] OR "preoperative fasting"[tiab]', 'O'],
  ['THEME', 'Thrombose et anticoagulation',
    '"venous thromboembolism"[tiab] OR "thromboprophylaxis"[tiab] OR "pulmonary embolism"[tiab] OR "deep vein thrombosis"[tiab] OR "anticoagulation"[tiab] OR "anticoagulant"[tiab] OR "heparin"[tiab] OR "direct oral anticoagulant"[tiab] OR "antiplatelet"[tiab]', 'O'],
  ['THEME', 'Échographie clinique',
    '"ultrasound guided"[tiab] OR "POCUS"[tiab] OR "lung ultrasound"[tiab] OR "gastric ultrasound"[tiab] OR "focused echocardiography"[tiab] OR "transthoracic echocardiography"[tiab] OR "transcranial doppler"[tiab] OR "focused cardiac"[tiab] OR "diaphragm ultrasound"[tiab]', 'O'],
  ['THEME', 'Sécurité et erreurs',
    '"patient safety"[tiab] OR "medication error"[tiab] OR "medication errors"[tiab] OR "checklist"[tiab] OR "human factors"[tiab] OR "critical incident"[tiab] OR "near miss"[tiab] OR "morbidity conference"[tiab] OR "burnout"[tiab] OR "wrong site"[tiab]', 'O'],
  ['THEME', 'Simulation et formation',
    '"simulation based"[tiab] OR "simulation training"[tiab] OR "high fidelity simulation"[tiab] OR "medical education"[tiab] OR "competency based"[tiab] OR "learning curve"[tiab] OR "curriculum"[tiab]', 'O'],

  // ── Liste blanche de types — axe GENERAL uniquement ───────────────
  ['PUBTYPE', 'ECR',        'Randomized Controlled Trial', 'O'],
  ['PUBTYPE', 'Méta',       'Meta-Analysis',               'O'],
  ['PUBTYPE', 'Revue syst', 'Systematic Review',           'O'],
  ['PUBTYPE', 'Reco',       'Practice Guideline',          'O'],
  ['PUBTYPE', 'Reco',       'Guideline',                   'O'],

  // ── Paramètres ────────────────────────────────────────────────────
  ['PARAM', 'JOURS',       '180',       'O'],   // fenêtre glissante (edat)
  ['PARAM', 'LANGS',       'eng,fre',   'O'],
  ['PARAM', 'ANIMAUX',     'N',         'O'],   // N = exclure l'animal pur
  ['PARAM', 'MAX_PASSAGE', '700',       'O'],   // nouveaux articles par exécution
  ['PARAM', 'ENRICH',      'N',         'O'],
];

// Liste NOIRE de types d'article. Volontairement courte : elle écarte ce
// qui n'est pas un travail scientifique, rien d'autre.
const VEILLE_EXCLUSIONS =
  '"comment"[Publication Type] OR "editorial"[Publication Type] OR "letter"[Publication Type] ' +
  'OR "case reports"[Publication Type] OR "retracted publication"[Publication Type] ' +
  'OR "published erratum"[Publication Type] OR "preprint"[Publication Type] ' +
  'OR "news"[Publication Type] OR "biography"[Publication Type] ' +
  'OR ("protocol"[Title] AND ("randomized"[Title] OR "randomised"[Title] OR "trial"[Title] ' +
  'OR "systematic review"[Title] OR "meta-analysis"[Title]))';

// ══════════════════════════════════════════════════════════════════════
//  ONGLETS
// ══════════════════════════════════════════════════════════════════════

function getOrCreateVeilleTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let cfg = ss.getSheetByName(VEILLE_CFG_TAB);
  if (!cfg) {
    cfg = ss.insertSheet(VEILLE_CFG_TAB);
    cfg.getRange(1, 1, 1, 4).setValues([['TYPE', 'CLE', 'VALEUR', 'ACTIF']]);
    cfg.getRange(1, 1, 1, 4).setFontWeight('bold');
    cfg.setFrozenRows(1);
    cfg.setColumnWidth(3, 360);
    cfg.getRange(2, 1, VEILLE_DEFAULT_CFG.length, 4).setValues(VEILLE_DEFAULT_CFG);
  }

  /* (2026-08-08.5) Marques de lecture PAR MAR : une ligne par couple
     (MAR, article) touché — écriture ciblée, jamais de suppression. Les
     colonnes LU/STAR de l'onglet VEILLE (partagées entre 23 MARs) sont
     abandonnées : plus lues, plus écrites. */
  let mq = ss.getSheetByName('VEILLE_MARQUES');
  if (!mq) {
    mq = ss.insertSheet('VEILLE_MARQUES');
    mq.getRange(1, 1, 1, 5).setValues([['MAR_ID', 'PMID', 'LU', 'STAR', 'MAJ_LE']]);
    mq.getRange(1, 1, 1, 5).setFontWeight('bold');
    mq.setFrozenRows(1);
  }

  let v = ss.getSheetByName(VEILLE_TAB);
  if (!v) {
    v = ss.insertSheet(VEILLE_TAB);
    v.getRange(1, 1, 1, 14).setValues([[
      'PMID', 'DATE_PUB', 'TITRE', 'AUTEURS', 'REVUE', 'DOI',
      'SOURCE', 'SCORE', 'RESUME', 'LU', 'STAR', 'AJOUTE_LE', 'PUBTYPE', 'THEMES',
    ]]);
    v.getRange(1, 1, 1, 14).setFontWeight('bold');
    v.setFrozenRows(1);
    v.setColumnWidth(3, 420);
  } else {
    _ensureVeilleColumns(v);
  }
  return { cfg: cfg, veille: v, marques: mq };
}

// Ajoute en fin les colonnes manquantes sans décaler LU/STAR, référencés
// par leur position dans markVeille.
function _ensureVeilleColumns(v) {
  const need = ['PUBTYPE', 'THEMES'];
  let lastCol = Math.max(v.getLastColumn(), 1);
  const hdr = v.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x || '').trim(); });
  need.forEach(function (name) {
    if (hdr.indexOf(name) === -1) {
      lastCol += 1;
      v.getRange(1, lastCol).setValue(name).setFontWeight('bold');
      hdr.push(name);
    }
  });
}

/* Réécrit INTÉGRALEMENT l'onglet VEILLE_CFG avec la configuration ci-dessus.
   À lancer UNE FOIS, à la main, après l'installation de ce fichier.

   Pourquoi c'est nécessaire : l'ancienne configuration contient des thèmes
   écrits en MeSH qui resteraient actifs et continueraient d'apporter du
   bruit ; une simple complétion des lignes manquantes ne les enlèverait
   pas. La réécriture pose aussi les lignes PUBTYPE (liste blanche de
   l'axe GENERAL).

   ÉCRIT dans le classeur maître : ne se déclenche jamais tout seul. */
function veilleReinitConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = ss.getSheetByName(VEILLE_CFG_TAB);
  if (!cfg) { getOrCreateVeilleTabs(); Logger.log('VEILLE_CFG créé avec la configuration par défaut.'); return; }
  const avant = Math.max(cfg.getLastRow() - 1, 0);
  if (cfg.getLastRow() > 1) cfg.getRange(2, 1, cfg.getLastRow() - 1, 4).clearContent();
  cfg.getRange(2, 1, VEILLE_DEFAULT_CFG.length, 4).setValues(VEILLE_DEFAULT_CFG);
  Logger.log('VEILLE_CFG réécrit : ' + avant + ' lignes remplacées par ' + VEILLE_DEFAULT_CFG.length + '.');
  Logger.log('Prochaine étape : resetVeille() puis runVeille().');
}

/* Lecture PASSIVE de la configuration. N'écrit rien, ne crée rien —
   c'est ce qui permet à getVeille() de ne faire aucune écriture. */
function _readVeilleCfg() {
  const cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VEILLE_CFG_TAB);
  const out = { revues: [], general: [], themes: [], params: {}, pubtypes: [] };
  if (!cfg) return out;
  const data = cfg.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    const type   = String(data[r][0] || '').trim().toUpperCase();
    const cle    = String(data[r][1] || '').trim();
    const valeur = String(data[r][2] || '').trim();
    const actif  = String(data[r][3] || '').trim().toUpperCase() !== 'N';
    if (!type) continue;
    if (type === 'PARAM') { out.params[cle.toUpperCase()] = valeur; continue; }
    if (!actif || !valeur) continue;
    if (type === 'REVUE')   out.revues.push(valeur);
    if (type === 'GENERAL') out.general.push(valeur);
    if (type === 'THEME')   out.themes.push({ cle: cle, valeur: valeur });
    if (type === 'PUBTYPE') out.pubtypes.push(valeur);
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════
//  ACCÈS PUBMED — POST + pagination
// ══════════════════════════════════════════════════════════════════════

function _eutilsPost(endpoint, params) {
  const payload = params + '&tool=' + EUTILS_TOOL + '&email=' + encodeURIComponent(EUTILS_EMAIL);
  const res = UrlFetchApp.fetch(EUTILS_BASE + endpoint, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error('PubMed ' + endpoint + ' HTTP ' + code);
  return JSON.parse(res.getContentText());
}

/* Rapatrie TOUS les identifiants d'une requête, par pages successives.
   L'ancien code s'arrêtait à 200 sans le dire. Ici, tout dépassement du
   plafond est écrit dans le journal. */
function _esearchTout(term, jours) {
  if (!term) return [];
  const ids = [];
  let start = 0, total = null;
  while (true) {
    const j = _eutilsPost('esearch.fcgi',
      'db=pubmed&retmode=json&sort=date&datetype=edat' +
      '&reldate=' + encodeURIComponent(jours) +
      '&retmax=' + VEILLE_PAGE + '&retstart=' + start +
      '&term=' + encodeURIComponent(term));
    Utilities.sleep(VEILLE_PAUSE);
    const r = (j && j.esearchresult) || {};
    const page = r.idlist || [];
    if (total === null) total = parseInt(r.count || '0', 10);
    for (let i = 0; i < page.length; i++) ids.push(page[i]);
    start += page.length;
    if (!page.length || ids.length >= total || start >= VEILLE_PLAFOND) break;
  }
  if (total > ids.length) {
    Logger.log('⚠️ requête tronquée : ' + total + ' résultats, ' + ids.length +
               ' rapatriés (plafond ' + VEILLE_PLAFOND + ').');
  }
  return ids;
}

function _esummary(pmids) {
  return _eutilsPost('esummary.fcgi', 'db=pubmed&retmode=json&id=' + pmids.join(','));
}

// ══════════════════════════════════════════════════════════════════════
//  CONSTRUCTION DES REQUÊTES
// ══════════════════════════════════════════════════════════════════════

function _veilleOrRevues(list) {
  return list.map(function (j) { return '"' + j + '"[Journal]'; }).join(' OR ');
}

function _veilleOrThemes(themes) {
  return themes.map(function (t) { return '(' + t.valeur + ')'; }).join(' OR ');
}

/* Filtre commun. Aucune liste blanche de types : uniquement la langue,
   l'exclusion de l'animal pur, et la liste noire. */
function _veilleFiltre(cfg) {
  const langs = String(cfg.params.LANGS || 'eng,fre')
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  let s = langs.length
    ? '(' + langs.map(function (l) { return l + '[la]'; }).join(' OR ') + ')'
    : '';
  if (String(cfg.params.ANIMAUX || 'N').toUpperCase() === 'N') {
    s += (s ? ' ' : '') + 'NOT ("animals"[MeSH Terms] NOT "humans"[MeSH Terms])';
  }
  s += (s ? ' ' : '') + 'NOT (' + VEILLE_EXCLUSIONS + ')';
  return s;
}

function _veilleAvec(base, filtre) { return filtre ? '(' + base + ') AND ' + filtre : base; }

/* Liste blanche de types, servie UNIQUEMENT à l'axe GENERAL. Vide si
   aucune ligne PUBTYPE active dans VEILLE_CFG : l'axe tourne alors sans
   restriction, et runVeille() le signale au journal. */
function _veilleListeBlanche(cfg) {
  if (!cfg.pubtypes || !cfg.pubtypes.length) return '';
  return '(' + cfg.pubtypes.map(function (t) {
    return '"' + t + '"[Publication Type]';
  }).join(' OR ') + ')';
}

// ══════════════════════════════════════════════════════════════════════
//  COLLECTE
// ══════════════════════════════════════════════════════════════════════

function runVeille() {
  try { if (typeof _bat_ === 'function') _bat_('runVeille'); } catch (e) {}   // (27/08) battement de cœur — lu par le diagnostic
  const t0   = Date.now();
  const tabs = getOrCreateVeilleTabs();
  const cfg  = _readVeilleCfg();

  if (!cfg.themes.length) {
    Logger.log('Aucun thème actif : rien à faire. Lancer veilleReinitConfig() ?');
    return { success: false, error: 'aucun theme actif' };
  }
  if (!cfg.revues.length && !cfg.general.length) {
    Logger.log('Aucune revue active : rien à faire.');
    return { success: false, error: 'aucune revue active' };
  }

  const jours   = parseInt(cfg.params.JOURS, 10) || 180;
  const maxPass = parseInt(cfg.params.MAX_PASSAGE, 10) || 700;
  const filtre  = _veilleFiltre(cfg);
  const themeOr = _veilleOrThemes(cfg.themes);

  // ── Axe 1 : revues en accès direct, croisées aux thèmes ───────────
  let idsDirect = [];
  if (cfg.revues.length) {
    idsDirect = _esearchTout(_veilleAvec(
      '(' + _veilleOrRevues(cfg.revues) + ') AND (' + themeOr + ')', filtre), jours);
  }
  // ── Axe 2 : revues généralistes, croisées aux thèmes, RESTREINTES
  //    à la liste blanche de types (cf. point 3 de l'en-tête) ─────────
  let idsGeneral = [];
  if (cfg.general.length) {
    const blanche = _veilleListeBlanche(cfg);
    if (!blanche) {
      Logger.log('⚠️ aucune ligne PUBTYPE active : axe croisé SANS liste blanche ' +
                 '(volume attendu ×10 — vérifier VEILLE_CFG).');
    }
    let baseG = '(' + _veilleOrRevues(cfg.general) + ') AND (' + themeOr + ')';
    if (blanche) baseG += ' AND ' + blanche;
    idsGeneral = _esearchTout(_veilleAvec(baseG, filtre), jours);
  }

  /* (2026-08-08.4) CODES, pas libellés : le filtre source et les badges de
     dashboard.html comparent à 'REVUE' / 'GENERAL' / 'THEME'. La refonte
     avait écrit 'Revue'/'Généraliste' → filtre vide, badges faux. */
  const source = {};
  idsDirect.forEach(function (id) { source[id] = 'REVUE'; });
  idsGeneral.forEach(function (id) { if (!source[id]) source[id] = 'GENERAL'; });

  // ── Étiquetage par thème ──────────────────────────────────────────
  // Une requête par thème, bornée à l'univers de revues. Sert à remplir
  // la colonne THEMES : sans ça le filtre par thème de l'écran est aveugle
  // pour les articles pêchés par leur revue.
  const univers = '(' + _veilleOrRevues(cfg.revues.concat(cfg.general)) + ')';
  const themesParPmid = {};
  cfg.themes.forEach(function (th) {
    const ids = _esearchTout(_veilleAvec(univers + ' AND (' + th.valeur + ')', filtre), jours);
    ids.forEach(function (id) {
      if (!source[id]) return;                 // hors des deux axes : ignoré
      if (!themesParPmid[id]) themesParPmid[id] = {};
      themesParPmid[id][th.cle] = true;
    });
  });

  // ── Nouveaux PMID seulement ───────────────────────────────────────
  const data = tabs.veille.getDataRange().getValues();
  const connus = {};
  for (let r = 1; r < data.length; r++) {
    const p = String(data[r][0] || '').trim();
    if (p) connus[p] = true;
  }
  let nouveaux = Object.keys(source).filter(function (id) { return !connus[id]; });
  const trouves = nouveaux.length;
  let plafonne = false;
  if (nouveaux.length > maxPass) { nouveaux = nouveaux.slice(0, maxPass); plafonne = true; }

  // ── Métadonnées et écriture ───────────────────────────────────────
  const aujourdhui = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  const lignes = [];
  for (let i = 0; i < nouveaux.length; i += VEILLE_LOT) {
    const lot = nouveaux.slice(i, i + VEILLE_LOT);
    let res;
    try { res = _esummary(lot); } catch (e) { Logger.log('esummary : ' + e); continue; }
    Utilities.sleep(VEILLE_PAUSE);
    const r = (res && res.result) || {};
    lot.forEach(function (pmid) {
      const o = r[pmid];
      if (!o || o.error) return;
      lignes.push([
        pmid,
        _veilleDatePub(o),
        String(o.title || '').replace(/\s+/g, ' ').trim(),
        _veilleAuteurs(o.authors),
        String(o.source || ''),
        _veilleDoi(o),
        source[pmid] || 'REVUE',
        '',                                   // SCORE  — réservé au tri fin
        '',                                   // RESUME — idem
        'N', 'N',
        aujourdhui,
        _veillePubType(o.pubtype),
        _veilleThemes(themesParPmid[pmid]),
      ]);
    });
  }
  if (lignes.length) {
    tabs.veille.getRange(tabs.veille.getLastRow() + 1, 1, lignes.length, 14).setValues(lignes);
  }

  const sec = Math.round((Date.now() - t0) / 1000);
  Logger.log('Veille ' + GAS_VERSION_VEILLE + ' — fenêtre ' + jours + ' j · ' +
             cfg.revues.length + ' revues directes · ' + cfg.general.length + ' croisées · ' +
             cfg.themes.length + ' thèmes');
  const uniques  = Object.keys(source).length;
  const semaines = jours / 7;
  const parSem   = Math.round(uniques / semaines * 10) / 10;
  Logger.log('  axe direct ' + idsDirect.length + ' (' + Math.round(idsDirect.length / semaines) +
             '/sem) · axe croisé ' + idsGeneral.length + ' (' + Math.round(idsGeneral.length / semaines) +
             '/sem) · uniques ' + uniques);
  Logger.log('  TOTAL : ' + parSem + ' articles/semaine (cible 50-80)');
  Logger.log('  nouveaux ' + trouves + (plafonne ? ' (plafonnés à ' + maxPass + ')' : '') +
             ' · écrits ' + lignes.length + ' · ' + sec + ' s');
  if (plafonne) Logger.log('  → relancer runVeille() pour absorber le reste.');

  return { success: true, trouves: trouves, ecrits: lignes.length,
           parSemaine: parSem, axeDirect: idsDirect.length, axeCroise: idsGeneral.length,
           secondes: sec };
}

// ══════════════════════════════════════════════════════════════════════
//  MISE EN FORME DES MÉTADONNÉES
// ══════════════════════════════════════════════════════════════════════

function _veilleAuteurs(authors) {
  if (!authors || !authors.length) return '';
  const noms = authors.map(function (a) { return String(a.name || '').trim(); }).filter(Boolean);
  if (!noms.length) return '';
  return noms.length <= 3 ? noms.join(', ') : noms.slice(0, 3).join(', ') + ' et al.';
}

function _veilleDoi(obj) {
  if (obj && obj.elocationid && /^doi:/i.test(obj.elocationid)) {
    return String(obj.elocationid).replace(/^doi:\s*/i, '').trim();
  }
  const ids = (obj && obj.articleids) || [];
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i].idtype).toLowerCase() === 'doi') return String(ids[i].value || '').trim();
  }
  return '';
}

/* (2026-08-08.3, MESURÉ) 925 articles sur 2 044 n'avaient que le MOIS de
   parution (numéro de revue) : sortpubdate les datait tous au « 01 », le
   tri par date les laissait en blocs par revue (PMID contigus d'un même
   numéro). Or epubdate — la date de MISE EN LIGNE — est au jour près pour
   27 échantillons sur 30. On la préfère quand elle porte un jour ; sinon
   repli sur sortpubdate/pubdate comme avant. */
const _VEILLE_MOIS = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
                       Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };

function _veilleDatePub(obj) {
  const epub = String((obj && obj.epubdate) || '').trim();
  const e = epub.match(/^(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})$/);   // "2026 Feb 7"
  if (e && _VEILLE_MOIS[e[2]]) {
    return e[1] + '-' + _VEILLE_MOIS[e[2]] + '-' + ('0' + e[3]).slice(-2);
  }
  const raw = String((obj && (obj.sortpubdate || obj.pubdate)) || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})[\/\-\s]?(\d{2})?[\/\-\s]?(\d{2})?/);
  if (!m) return raw;
  return m[1] + '-' + (m[2] || '01') + '-' + (m[3] || '01');
}

// Ordre d'affichage des types. Sert uniquement à choisir l'étiquette la
// plus informative quand un article en porte plusieurs — plus à filtrer.
const VEILLE_PUBTYPE_RANG = [
  'Meta-Analysis', 'Systematic Review', 'Randomized Controlled Trial',
  'Practice Guideline', 'Guideline', 'Observational Study',
  'Multicenter Study', 'Clinical Trial', 'Review',
];

function _veillePubType(list) {
  if (!list || !list.length) return '';
  for (let i = 0; i < VEILLE_PUBTYPE_RANG.length; i++) {
    if (list.indexOf(VEILLE_PUBTYPE_RANG[i]) !== -1) return VEILLE_PUBTYPE_RANG[i];
  }
  const autres = list.filter(function (p) { return p !== 'Journal Article' && p !== 'English Abstract'; });
  return autres.length ? String(autres[0]) : '';
}

/* Normalise la colonne SOURCE vers le code que l'écran attend. Les 2 044
   lignes collectées le 08/08 portent les libellés fautifs : on les traduit
   à la lecture plutôt que de réécrire la feuille. */
function _veilleSourceCode(v) {
  const s = String(v || '').trim();
  if (s === 'Revue') return 'REVUE';
  if (s === 'Généraliste') return 'GENERAL';
  return s.toUpperCase() === 'GENERAL' ? 'GENERAL' : (s ? s.toUpperCase() : 'REVUE');
}

function _veilleThemes(obj) { return obj ? Object.keys(obj).join('; ') : ''; }
function _veilleSplitThemes(v) {
  return String(v || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean);
}

// ══════════════════════════════════════════════════════════════════════
//  LECTURE ET MARQUAGE
//  Contrat inchangé : le miroir appelle getVeille() sans argument et
//  l'écran consomme exactement ces champs. Ne pas modifier sans lire
//  dashboard.html ET miroir.gs.
// ══════════════════════════════════════════════════════════════════════

/* (2026-08-08.5) `user` optionnel : la synchro miroir appelle SANS user
   (instantané partagé, marques neutres) ; le repli GAS du dashboard passe
   PAR le routeur, qui fournit user → les marques du MAR sont fusionnées
   ici même, l'écran n'a rien à faire de plus. Les colonnes LU/STAR de
   l'onglet VEILLE ne sont PLUS lues. */
function getVeille(user) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const v  = ss.getSheetByName(VEILLE_TAB);
  if (!v) return { success: true, count: 0, enrich: false, items: [] };

  let lus = {}, stars = {};
  if (user && user.id) {
    const m = _veilleMarquesParMar()[String(user.id).trim()];
    if (m) {
      m.lus.forEach(function (p) { lus[p] = true; });
      m.stars.forEach(function (p) { stars[p] = true; });
    }
  }

  const cfg  = _readVeilleCfg();
  const data = v.getDataRange().getValues();
  const items = [];
  for (let r = 1; r < data.length; r++) {
    const pmid = String(data[r][0] || '').trim();
    if (!pmid) continue;
    items.push({
      pmid: pmid, date: _isoDate(data[r][1]), titre: String(data[r][2] || ''),
      auteurs: String(data[r][3] || ''), revue: String(data[r][4] || ''), doi: String(data[r][5] || ''),
      source: _veilleSourceCode(data[r][6]), score: data[r][7] === '' ? null : Number(data[r][7]),
      resume: String(data[r][8] || ''), lu: !!lus[pmid],
      star: !!stars[pmid], ajoute: _isoDate(data[r][11]),
      pubtype: String(data[r][12] || ''), themes: _veilleSplitThemes(data[r][13]),
    });
  }
  items.sort(function (a, b) {
    const sa = a.score == null ? -1 : a.score, sb = b.score == null ? -1 : b.score;
    if (sa !== sb) return sb - sa;
    return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
  });
  return {
    success: true, count: items.length,
    enrich: String(cfg.params.ENRICH || 'N').toUpperCase() === 'O',
    items: items,
  };
}

/* (2026-08-08.5) Marque PERSONNELLE : l'identité vient du routeur
   (portail.gs lui passe `user`, déjà authentifié) — jamais du payload.
   Idempotent : poser deux fois « lu » = « lu », le rejeu de la file locale
   du dashboard est donc sans danger. */
function markVeille(pmid, field, value, user) {
  if (!user || !user.id) return { success: false, error: 'identité requise' };
  const tabs = getOrCreateVeilleTabs();
  const p = String(pmid || '').trim();

  // L'article doit exister (protège l'onglet des PMID fantaisistes).
  const arts = tabs.veille.getRange(1, 1, Math.max(tabs.veille.getLastRow(), 1), 1).getValues();
  let existe = false;
  for (let r = 1; r < arts.length; r++) {
    if (String(arts[r][0] || '').trim() === p) { existe = true; break; }
  }
  if (!existe) return { success: false, error: 'article introuvable' };

  const col = String(field).toUpperCase() === 'STAR' ? 4 : 3;
  const id  = String(user.id).trim();
  const mq  = tabs.marques;
  const data = mq.getRange(1, 1, Math.max(mq.getLastRow(), 1), 2).getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0] || '').trim() === id && String(data[r][1] || '').trim() === p) {
      mq.getRange(r + 1, col).setValue(value ? 'O' : 'N');
      mq.getRange(r + 1, 5).setValue(new Date());
      return { success: true };
    }
  }
  mq.appendRow([id, p,
    String(field).toUpperCase() === 'LU'   ? (value ? 'O' : 'N') : 'N',
    String(field).toUpperCase() === 'STAR' ? (value ? 'O' : 'N') : 'N',
    new Date()]);
  return { success: true };
}

/* Toutes les marques, groupées par MAR — pour la clé miroir
   `veille_marques`, filtrée par le Worker : chacun ne reçoit que les
   siennes (admin compris — ce qu'un collègue lit est personnel). */
function _veilleMarquesParMar() {
  const tabs = getOrCreateVeilleTabs();
  const mq = tabs.marques;
  const data = mq.getRange(1, 1, Math.max(mq.getLastRow(), 1), 4).getValues();
  const parMar = {};
  for (let r = 1; r < data.length; r++) {
    const id = String(data[r][0] || '').trim(), p = String(data[r][1] || '').trim();
    if (!id || !p) continue;
    if (!parMar[id]) parMar[id] = { lus: [], stars: [] };
    if (String(data[r][2] || '').toUpperCase() === 'O') parMar[id].lus.push(p);
    if (String(data[r][3] || '').toUpperCase() === 'O') parMar[id].stars.push(p);
  }
  return parMar;
}

// ══════════════════════════════════════════════════════════════════════
//  ENTRETIEN — fonctions manuelles
// ══════════════════════════════════════════════════════════════════════

function installVeilleTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runVeille') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runVeille').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  Logger.log('Déclencheur hebdomadaire installé (lundi 6 h).');
}

function resetVeille() {
  const tabs = getOrCreateVeilleTabs();
  const n = Math.max(tabs.veille.getLastRow() - 1, 0);
  if (n) tabs.veille.getRange(2, 1, n, 14).clearContent();
  Logger.log('Onglet VEILLE vidé : ' + n + ' lignes supprimées.');
}

/* Vérifie que chaque revue de la configuration est reconnue par PubMed.
   Une revue mal orthographiée est absente de la veille SANS aucun message :
   c'était le cas de "Perioper Med", dont le nom exact est
   "Perioper Med (Lond)". À passer dans le Diagnostic de Maintenance. */
function veilleVerifierNoms() {
  const cfg = _readVeilleCfg();
  const suspects = [];
  cfg.revues.concat(cfg.general).forEach(function (rev) {
    const j = _eutilsPost('esearch.fcgi',
      'db=pubmed&retmode=json&retmax=0&datetype=edat&reldate=365' +
      '&term=' + encodeURIComponent('"' + rev + '"[Journal]'));
    Utilities.sleep(VEILLE_PAUSE);
    const n = parseInt((j && j.esearchresult && j.esearchresult.count) || '0', 10);
    Logger.log('  ' + rev + ' → ' + n + ' articles sur 1 an' + (n ? '' : '   ⚠️ NOM NON RECONNU'));
    if (!n) suspects.push(rev);
  });
  if (suspects.length) {
    Logger.log('À CORRIGER dans VEILLE_CFG : ' + suspects.join(', '));
  } else {
    Logger.log('Les ' + (cfg.revues.length + cfg.general.length) + ' noms de revues sont reconnus.');
  }
  return { success: true, suspects: suspects };
}

function testVeille() {
  const cfg = _readVeilleCfg();
  Logger.log('Veille ' + GAS_VERSION_VEILLE);
  Logger.log('  ' + cfg.revues.length + ' revues directes · ' + cfg.general.length +
             ' croisées · ' + cfg.themes.length + ' thèmes · ' +
             cfg.pubtypes.length + ' types en liste blanche (axe croisé)');
  Logger.log('  liste blanche : ' + (_veilleListeBlanche(cfg) || '(AUCUNE — axe croisé sans restriction !)'));
  Logger.log('  JOURS=' + (cfg.params.JOURS || '180') +
             ' · LANGS=' + (cfg.params.LANGS || 'eng,fre') +
             ' · ANIMAUX=' + (cfg.params.ANIMAUX || 'N') +
             ' · MAX_PASSAGE=' + (cfg.params.MAX_PASSAGE || '700'));
  Logger.log('  filtre : ' + _veilleFiltre(cfg).substring(0, 200) + '…');
  const v = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VEILLE_TAB);
  Logger.log('  onglet VEILLE : ' + (v ? Math.max(v.getLastRow() - 1, 0) : 0) + ' articles en cache');
}
