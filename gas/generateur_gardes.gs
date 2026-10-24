/* ═══════════════════════════════════════════════════════════════════════════
   GÉNÉRATEUR DE GARDES — VERSION DE PRODUCTION
   ═══════════════════════════════════════════════════════════════════════════
   À RECOPIER dans l'éditeur Apps Script, puis Déployer → Gérer les déploiements
   → NOUVELLE VERSION. Sans ce second geste, l'ancien code continue de tourner.
   Le dépôt fait foi à 100 % : ne jamais modifier ce fichier directement dans
   Apps Script sans le committer aussitôt, il serait écrasé à la recopie suivante.

   COUVERTURE DES JOURS SERRÉS (23/07/2026) — quatre mécanismes :
     · passe « jours critiques » : les journées à faible vivier sont pourvues
       en premier ; parmi les combinaisons possibles, la MOINS COÛTEUSE EN
       ÉQUITÉ est retenue (borne dure : 20 000 essais, jamais d'explosion) ;
     · anticipation d'un jour et repli VD de la rotation de Noël ;
     · passe de DERNIER RECOURS : aucune journée n'est abandonnée sans avoir
       retenté en tolérant le combo jeudi↔samedi — légal, ce n'est PAS deux
       gardes d'affilée. Les deux règles dures ne sont JAMAIS relâchées :
       jamais deux gardes consécutives, jamais de garde sur une absence
       déclarée. Si personne n'est disponible, la date est signalée nommément
       au comité AVANT publication (« Manque MAR »).
     · avertissement au comité quand la couverture a coûté cher en équité,
       pour agir en amont sur la pose des vacances.

   VALIDATION — 140 années simulées (7 scénarios × 20 ans, 2027 → 2046) :
     · 0 jour sans binôme (13 avec la version précédente)
     · pire écart d'équité PAR AXE 3,3 (contre 3,4) · médiane 1,7
     · 0 garde consécutive, 0 garde sur absence déclarée
     · batterie des 11 scénarios identique au caractère près · déterminisme confirmé
     · 7,5 s par année générée (contre 7,6)
   ÉPREUVE SUR LE PLANNING RÉEL 2026 : toutes les journées pourvues, y compris
   la semaine de Noël (18 gardeurs absents sur 23) ; écart maximal 1,4 ; rotation
   de Noël identique à celle décidée par le comité.

   ⚠️ CONTRÔLE OBLIGATOIRE avant toute livraison de ce fichier : simulateur/eval.js
   — écart par AXE (samedis, jeudis, week-ends, veilles de fériés), pas seulement
   le total. Une régression sur l'axe week-end est passée sous dix contrôles
   successifs parce que seul le total était mesuré.

   Protocole et pièges : simulateur/experiences/2026-07_couverture_jours_serres.md
   ═══════════════════════════════════════════════════════════════════════════ */

// ⚠️ RÈGLE (détecteur de dérive dépôt↔Apps Script) : incrémenter cette version
// à CHAQUE push de ce fichier. Le diagnostic (admin → Maintenance) compare la
// version déployée ici avec celle du dépôt et signale toute recopie oubliée.
const GAS_VERSION_GENERATEUR = '2026-10-24.2';

/* (05/09/2026) INTERRUPTEUR DU NOUVEL ALGORITHME — récit : docs/JOURNAL-Planning-Med.md §101 */
const NOUVEL_ALGO_GLOBAL = true;

// Multi-départ : nombre maximum de calculs à blanc avant d'écrire le meilleur.
// La règle d'arrêt coupe dès qu'un tirage met tout le monde à une garde d'écart,
// ce qui arrive au premier essai dans plus d'un cas sur deux.
const MULTI_DEPART_MAX  = 8;
const MULTI_DEPART_SEUIL = 1;   // écart, en gardes, qui suffit à s'arrêter
/* (11/10/2026) COUPLES DE WEEK-END — inerte sans la ligne COUPLES_WEEKEND de CONFIG.
   Deux MAR d'un même foyer (« A+B », plusieurs couples séparés par ';') demandent
   que, quand l'un fait le vendredi-dimanche, l'autre fasse le samedi du MÊME
   week-end : le foyer bloque moins de week-ends. AUCUN NOM DANS LE CODE (dépôt
   public). La règle des paires à éviter n'est pas touchée : le samedi et le
   vendredi-dimanche ne tombent jamais le même soir.
   Trois leviers, du plus doux au plus fort, aucun ne change un compteur d'équité :
   1. placement : le samedi qui suit le vendredi-dimanche de l'un, l'autre passe en
      tête s'il reste sous sa part de samedis (symétrique pour le vendredi-dimanche) ;
   2. optimiseur : un transfert qui crée un week-end lié gagne CPL_LAMBDA, un
      transfert qui en casse un le paie ;
   3. échanges ciblés après l'optimiseur : même jour, même rôle, même contribution —
      l'équité est inchangée PAR CONSTRUCTION.
   Mesuré le 11/10/2026 sur les demandes réelles 2027 : voir banc_couples_weekend.js. */
const CPL_LAMBDA = 200;
function getCouplesWeekend() {
  const m = {};
  try {
    const data = _configRows_();
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][0]).trim().toUpperCase() !== 'COUPLES_WEEKEND') continue;
      String(data[r][1] == null ? '' : data[r][1]).split(';').forEach(function (tok) {
        const p = String(tok).split('+').map(function (x) { return String(x).trim().toUpperCase(); })
                             .filter(function (x) { return !!x; });
        if (p.length !== 2 || p[0] === p[1] || m[p[0]] || m[p[1]]) return;   // un MAR, un seul couple
        m[p[0]] = p[1]; m[p[1]] = p[0];
      });
    }
  } catch (e) { /* CONFIG illisible : règle inerte */ }
  return m;
}

// Optimiseur §8c : au-delà de LEX_SEUIL gardes d'écart, la pénalité devient
// prioritaire sur la baisse de l'écart moyen. Le poids reste SOUS les 1000 de la
// règle des week-ends : à 3000, l'équité l'écrasait (48 enchaînements par an).
const LEX_SEUIL = 1;
const LEX_POIDS = 600;

/* (13/09/2026) L'identifiant du classeur d'archive ne vit plus dans le dépôt — récit : docs/JOURNAL-Planning-Med.md §102 */
let _archiveSsIdMemo_ = null;
Object.defineProperty(globalThis, 'ARCHIVE_SS_ID', {
  configurable: true,
  get: function () {
    if (_archiveSsIdMemo_) return _archiveSsIdMemo_;
    try {
      const rows = _configRows_();
      for (let r = 1; r < rows.length; r++) {
        if (String(rows[r][0]).trim() === 'ARCHIVE_DRIVE_ID') {
          _archiveSsIdMemo_ = String(rows[r][1]).trim();
          return _archiveSsIdMemo_;
        }
      }
    } catch (e) { /* CONFIG illisible ou code.gs absent (banc) : '' ci-dessous */ }
    return '';
  }
});
// Dette inter-annuelle : STATS_GARDES_2026 sont des stats MANUELLES (échanges/dons)
// → inexploitables. La dette ne lit qu'à partir de cette année (2027 = 1re année
// générée proprement par l'algo). 2027 part donc en dette NEUTRE ; 1re vraie dette = 2028.
const PREMIERE_ANNEE_STATS_FIABLES = 2027;

// ══════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DE GARDES — ALGORITHME DE RÉFÉRENCE
// ══════════════════════════════════════════════════════════════════════
// Règles (par priorité) :
//   1. Quotité (PCT_GARDES) : cible totale proportionnelle au temps de travail
//   2. SOUHAIT PLAFONNÉ : placé en premier, S'AJOUTE au quota
//   3. VD : même binôme vendredi+dimanche, équité maximale
//   4. Samedi : équité maximale (proportionnelle à la quotité)
//   5. Jeudi : équité maximale (proportionnelle à la quotité)
//   6. G vs G2 : équité
//   7. Lun/Mar/Mer : peu important
//   Priorité conflit : VD > Samedi > Jeudi > Total
//   Inter-annuel : dette (réel N-1 − cible N-1) reportée comme ajustement initial
// ══════════════════════════════════════════════════════════════════════

// (C2-D1) NO_GARDE / ONLY_18 / NO_WEEKEND sortis vers l'onglet MEDECINS.
// → lus localement dans generateGardes via getMedecinFlags() (const FLAGS).
/* (12/10/2026) 1,3 → 1,2, décision du responsable : à 1,3, un profil « seulement
   18h » à 60 % tombait à 9 soirées par an (0,6 × 1,3 = 0,78 part), une de trop.
   À 1,2 : 0,72 part, soit 8 ; un temps plein « seulement 18h » passe de 15 à 14.
   Mesuré sur la campagne réelle : les ONLY_18 tenaient déjà un rapport réel de
   1,17 (cf. ROADMAP), le 1,2 rapproche la consigne du constat. */
const RATIO_18      = 1.2;
// Quota annuel de souhaits sur les FÉRIÉS et VEILLES DE FÉRIÉ (≈ 0,5 date par personne
// et par an). (10/10/2026) Les samedis et week-ends n'y sont plus soumis : ils sont
// honorés dans la limite de la part du MAR sur l'axe (okSouhaitRare) — mesuré sur les
// demandes 2027, le joker unique ne laissait passer que 3 souhaits sur 17. 0 = fermé.
const SOUHAIT_QUOTA_RARE = 1;
const DETTE_AMORTI  = 0.6;  // amortissement de la dette : evite la sur-correction/oscillation annuelle (10 ans : 0 annee non-conforme)
const FREEBUDGET_MARGE = 1;  // marge : reserve ~1 jour pour absorber les pertes de placement VD (multi-mardis robuste)
const MIN_PRESENT   = {1:16, 2:15, 3:16, 4:15, 5:15};
/* (2027-XX) PLACEMENT DES RÉCUPÉRATIONS — récit : docs/JOURNAL-Planning-Med.md §103 */
const R_MAX_PAR_JOUR      = 2;
const R_PLANCHER_PRESENTS = 15;   // aligné sur le code couleur du planning du service
// (C2-D3) Rythme 2/2 lu depuis MEDECINS (colonne rythme_2sur2, via getMedecinFlags).
// Ancre semaine 23/2026 conservée en dur (la dérive année-53-sem. = Fix A, séparé).
function estSemaineOff(id, dateStr){
  if(!getMedecinFlags().rythme2sur2.has(id)) return false;
  // Compte les vraies semaines écoulées depuis le lundi de la semaine ISO 23/2026
  // (01/06/2026), robuste aux années à 53 semaines. 2 sem. ON puis 2 sem. OFF.
  const ancre = Date.UTC(2026, 5, 1);
  const dt = new Date(dateStr + 'T12:00:00');
  const m = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7)); // lundi de la semaine du jour
  const nb = Math.round((m - ancre) / (7 * 86400000));      // semaines réelles écoulées
  return (((nb % 4) + 4) % 4) >= 2;
}

function toDateStr(d){
  if(!d) return '';
  if(typeof d==='string'&&d.match(/^\d{4}-\d{2}-\d{2}$/)) return d;
  const dt=new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
// (24/10/2026) VITESSE : mémorisé — appelé des centaines de milliers de fois par génération.
const _addOneDayMemo_={};
function addOneDay(ds){const m=_addOneDayMemo_[ds]; if(m) return m;
  const dt=new Date(ds+'T12:00:00');dt.setDate(dt.getDate()+1);return (_addOneDayMemo_[ds]=toDateStr(dt));}
// (C3) getJoursFeries() : définition unique dans code.gs (globale, identique).
function isReducedPeriod(m){return m===7||m===8||m===12;}
// OPTIM : PERIODES_VAC lu UNE SEULE FOIS par exécution (cache module).
// Avant, getDataRange().getValues() était rappelé à CHAQUE appel
// d'isVacancesScolaires — soit des milliers de fois dans la boucle des R.
// ⚠️ (21/08/2026) isVacancesScolaires N'EST PLUS APPELÉE par le placement des
// récupérations : l'exclusion des vacances scolaires y a été remplacée par le
// plancher d'effectif (cf. R_PLANCHER_PRESENTS). Elle est conservée — le cache
// et la fonction restent corrects et peuvent resservir — mais elle n'a plus
// aucun appelant à ce jour. Ne pas croire, en la lisant, qu'elle contraint
// encore quoi que ce soit.
let _vacCache=null;
function _loadVacances(){
  if(_vacCache!==null) return _vacCache;
  _vacCache=[];
  try{
    const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PERIODES_VAC');
    if(s){
      const data=s.getDataRange().getValues();
      for(let r=1;r<data.length;r++){
        const dr=data[r][1],fr=data[r][2];if(!dr||!fr) continue;
        _vacCache.push({
          debut:dr instanceof Date?toDateStr(dr):String(dr).trim(),
          fin:fr instanceof Date?toDateStr(fr):String(fr).trim()
        });
      }
    }
  }catch(e){}
  return _vacCache;
}
function isVacancesScolaires(dateStr,year){
  const periodes=_loadVacances();
  const y=String(year);
  for(let i=0;i<periodes.length;i++){
    const debut=periodes[i].debut,fin=periodes[i].fin;
    if(!debut.startsWith(y)&&!fin.startsWith(y)) continue;
    if(dateStr>=debut&&dateStr<=fin) return true;
  }
  return false;
}

/* (04/09/2026) CALCUL À BLANC — récit : docs/JOURNAL-Planning-Med.md §104 */
/* (04/09/2026) LANCEUR TEMPORAIRE — ⚠️ À RETIRER une fois la mesure du 04/09 faite. Ne rien construire dessus. — récit : docs/JOURNAL-Planning-Med.md §105 */
function T() { return comparerAlgorithmes(2026); }

/* (05/09/2026) SECOND LANCEUR — récit : docs/JOURNAL-Planning-Med.md §106 */
function T7() { return comparerAlgorithmes(2027); }

/* (04/09/2026) À LANCER DEPUIS L'ÉDITEUR — récit : docs/JOURNAL-Planning-Med.md §107 */
/* (05/09/2026) À LANCER DEPUIS L'ÉDITEUR — « avant / après sur mes vraies données ».
   Deux calculs à blanc de la MÊME année : un avec l'algorithme d'avant, un avec le
   nouveau, et les six écarts côte à côte. Aucune écriture, aucune notification,
   aucun onglet touché — l'année peut être déjà générée et publiée.
   C'est la seule mesure qui vaille : tout le reste vient du simulateur. */
function comparerAlgorithmes(year){
  const an = Number(year) || getIndisposYear();
  const AXES = ['total','sam','jeu','vd','vjf','jf'];
  const NOM = { total:'Total   ', sam:'Samedi  ', jeu:'Jeudi   ', vd:'Ven-Dim ', vjf:'VeilleJF', jf:'Férié   ' };
  const L = [];
  L.push('═══ AVANT / APRÈS — ' + an + ' — AUCUNE ÉCRITURE ═══');
  if (!NOUVEL_ALGO_GLOBAL) {
    L.push("⚠️ NOUVEL_ALGO_GLOBAL vaut false : les deux colonnes seront identiques.");
  }
  const mesures = {};
  [['avant', false], ['après', true]].forEach(function (cas) {
    const t0 = Date.now();
    let r = null, err = '';
    try { r = generateGardes(an, { dryRun: true, tirage: 1, forcerAncien: !cas[1] }); }
    catch (e) { err = e.message; }
    mesures[cas[0]] = { r: r, ms: Date.now() - t0, err: err };
  });
  L.push('Durée : avant ' + (mesures['avant'].ms / 1000).toFixed(1) + ' s   ·   après '
       + (mesures['après'].ms / 1000).toFixed(1) + ' s');
  L.push('');
  L.push('Écart réel−cible, par axe        AVANT        APRÈS');
  AXES.forEach(function (k) {
    const a = mesures['avant'].r, b = mesures['après'].r;
    const ea = a && a.ecarts && a.ecarts[k] ? a.ecarts[k] : null;
    const eb = b && b.ecarts && b.ecarts[k] ? b.ecarts[k] : null;
    L.push('   ' + NOM[k] + ' : '
      + (ea ? (ea.ecart.toFixed(2) + ' (' + ea.mar + ')').padEnd(20) : '—'.padEnd(20))
      + (eb ? (eb.ecart.toFixed(2) + ' (' + eb.mar + ')') : '—'));
  });
  L.push('');
  ['avant','après'].forEach(function (c) {
    const m = mesures[c];
    if (m.err) { L.push(c + ' : ✗ ' + m.err); return; }
    L.push(c + ' : ' + m.r.sansBinome + ' jour(s) sans binôme'
      + (m.r.jours.length ? ' → ' + m.r.jours.join(' ') : '')
      + '   ·   ' + m.r.nbWarnings + ' avertissement(s)');
  });
  L.push("Rien n'a été écrit dans le classeur, aucune notification envoyée.");
  const txt = L.join('\n');
  Logger.log(txt);
  return txt;
}

function essaiEnchainementGardes(year, nb) {
  const an = Number(year) || getIndisposYear();
  const N  = Number(nb) || 12;
  const t0 = Date.now(), BUDGET = 240000;
  const L = [], durees = [], signatures = {};
  let arret = '', echecs = 0;

  for (let i = 1; i <= N; i++) {
    if (Date.now() - t0 > BUDGET) { arret = 'budget de 4 minutes atteint après ' + (i - 1) + ' calculs'; break; }
    const t = Date.now();
    let r = null, err = '';
    try { r = generateGardes(an, { dryRun: true }); }
    catch (e) { err = e.message; echecs++; }
    const ms = Date.now() - t;
    durees.push(ms);
    /* Signature = les six écarts mis bout à bout. Deux calculs identiques
       doivent la partager : c'est ce qui prouve qu'enchaîner ne dégrade rien. */
    const sig = r && r.ecarts
      ? ['total','sam','jeu','vd','vjf','jf'].map(function (k) { return r.ecarts[k].ecart; }).join('/')
      : 'ECHEC';
    signatures[sig] = (signatures[sig] || 0) + 1;
    L.push('   ' + (i < 10 ? ' ' : '') + i + ' : ' + (ms / 1000).toFixed(2) + ' s' + (err ? '   ✗ ' + err : ''));
  }

  const n = durees.length;
  const tot = durees.reduce(function (s, x) { return s + x; }, 0);
  const mini = Math.min.apply(null, durees), maxi = Math.max.apply(null, durees);
  const cles = Object.keys(signatures);
  const O = [];
  O.push('═══ ENCHAÎNEMENT DE ' + n + ' CALCULS À BLANC — ' + an + ' — AUCUNE ÉCRITURE ═══');
  O.push('Durée de chaque calcul :');
  L.forEach(function (l) { O.push(l); });
  O.push('Total ' + (tot / 1000).toFixed(1) + ' s   ·   plus court ' + (mini / 1000).toFixed(2)
       + ' s   ·   plus long ' + (maxi / 1000).toFixed(2) + ' s');
  if (n >= 2) {
    const der = durees[n - 1], pre = durees[0];
    O.push('Dérive du premier au dernier : ' + (der > pre ? '+' : '') + (((der - pre) / pre) * 100).toFixed(0) + ' %'
         + (der > pre * 1.5 ? '   ⚠️ ralentissement net' : '   (rien d\'anormal)'));
  }
  O.push('Résultats distincts obtenus : ' + cles.length
       + (cles.length === 1 ? '   ✔ tous identiques, l\'enchaînement ne dégrade rien'
                            : '   ⚠️ l\'enchaînement change le résultat — à comprendre AVANT le multi-départ'));
  if (echecs) O.push('⚠️ ' + echecs + ' calcul(s) en échec');
  if (arret)  O.push('Arrêt : ' + arret);
  O.push('Rien n\'a été écrit dans le classeur, aucune notification envoyée.');
  const txt = O.join('\n');
  Logger.log(txt);
  return txt;
}


/* (04/09/2026) À LANCER DEPUIS L'ÉDITEUR APPS SCRIPT — récit : docs/JOURNAL-Planning-Med.md §108 */
function essaiGenerationGardes(year) {
  const an = Number(year) || getIndisposYear();
  /* (05/10/2026) LE MÊME PLANNING QUE LA VRAIE GÉNÉRATION. Celle-ci calcule
     jusqu'à MULTI_DEPART_MAX plannings et écrit le plus équitable ; l'essai ne
     calculait que le premier, et pouvait donc montrer un autre planning que
     celui qui serait écrit (constaté le 05/10/2026 sur une campagne 2027
     simulée : planning 1 affiché, planning 3 retenu). Même choix, même
     fonction, puis ce planning-là calculé à blanc. La durée affichée est celle
     de la vraie génération, écriture en moins. */
  const _t0 = Date.now();
  const _t = NOUVEL_ALGO_GLOBAL ? choisirMeilleurTirage(an) : 1;
  const r = generateGardes(an, { dryRun: true, tirage: _t });
  const _total = (Date.now() - _t0) / 1000;
  const L = [];
  const pad = function (t, n) { t = String(t); return t + Array(Math.max(1, n - t.length + 1)).join(' '); };
  const num = function (v, n) { v = String(v); return Array(Math.max(1, n - v.length + 1)).join(' ') + v; };

  L.push('═══ ESSAI DE GÉNÉRATION ' + an + ' — AUCUNE ÉCRITURE ═══');
  L.push('Planning retenu : n° ' + _t + ' — celui qu\'écrirait la vraie génération');
  L.push('Durée : ' + _total.toFixed(1) + ' s au total (la vraie génération y ajoute l\'écriture)   ·   ' + r.gardeurs + ' médecins de garde');
  if (_total > 240) L.push('⚠️ Plus de 4 minutes : la vraie génération risque d\'atteindre la limite de 6 minutes de Google.');
  L.push('');

  // ── 1. la couverture, avant tout : un trou est plus grave qu'un déséquilibre
  L.push('── COUVERTURE ──');
  L.push('Jours sans binôme : ' + r.sansBinome + (r.jours.length ? '  → ' + r.jours.join(' ') : '  (aucun)'));
  L.push('');

  // ── 2. l'équité, axe par axe
  L.push('── ÉQUITÉ · écart réel−cible ──');
  const NOM = { total:'Total', sam:'Samedi', jeu:'Jeudi', vd:'Ven-Dim', vjf:'VeilleJF', jf:'Férié' };
  Object.keys(r.ecarts).forEach(function (k) {
    const e = r.ecarts[k];
    L.push('   ' + pad(NOM[k] || k, 9) + e.ecart.toFixed(2) + (e.mar ? '   (' + e.mar + ')' : ''));
  });
  L.push('');

  /* ── 3. LE TABLEAU PAR MÉDECIN. Sans onglet créé, c'est la seule façon de
     voir qui porte quoi. Les cibles sont affichées à côté du réel : un chiffre
     seul ne dit pas s'il est juste. */
  L.push('── PAR MÉDECIN · réel (cible) ──');
  L.push('   ' + pad('MAR', 12) + pad('total', 12) + pad('sam', 10) + pad('jeu', 10)
         + pad('ven-dim', 12) + pad('férié', 10) + pad('18h', 6) + 'Noël');
  const ids = Object.keys(r.compteurs).sort();
  const duo = function (reel, cib) {
    if (cib === null || cib === undefined) return String(reel);
    return reel + ' (' + (Math.round(cib * 10) / 10) + ')';
  };
  ids.forEach(function (id) {
    const c = r.compteurs[id], cb = r.cibles[id] || {};
    /* (11/09/2026) La part exacte suit la cible quand l'arrondi a joué : « 37 (37)
       ·36,8 » se lit tout de suite comme un arrondi à la hausse. */
    const pe = (r.partExacte || {})[id];
    const fin = pe && pe.total !== undefined && Math.abs(pe.total - cb.total) > 0.01
      ? '  part ' + (Math.round(pe.total * 10) / 10) : '';
    L.push('   ' + pad(id, 12)
      + pad(duo(c.total, cb.total), 12)
      + pad(duo(c.sam, cb.sam), 10)
      + pad(duo(c.jeu, cb.jeu), 10)
      + pad(duo(c.vd, cb.vd), 12)
      + pad(duo(r.jf[id], cb.jf), 10)
      + pad(r.h18[id], 6)
      + pad(r.noel[id] || 0, 6) + fin);
  });
  L.push('');

  /* ── 4. LES SOUHAITS. La première question du comité, et l'aperçu n'y
     répondait pas : ce bilan n'existait que dans l'onglet de statistiques,
     donc seulement après une vraie génération. */
  const sIds = Object.keys(r.souhaits || {}).sort();
  L.push('── SOUHAITS · honorés / posés ──');
  if (!sIds.length) { L.push('   aucun souhait posé cette année'); }
  else {
    /* (22/10/2026) Le % se rapporte au POSSIBLE (part du MAR), plus aux posés :
       « possible » = ce que l'algorithme pouvait accorder au mieux, vu sa part. */
    L.push('   ' + pad('', 12) + 'obtenus / posés · possible · taux');
    let tp = 0, th = 0, tq = 0, tu = 0;
    sIds.forEach(function (id) {
      const s = r.souhaits[id];
      tp += s.poses; th += s.honores; tq += s.possible; tu += s.honoresUtiles;
      const pct = s.possible ? num(Math.round(100 * s.honoresUtiles / s.possible), 3) + ' %' : '  —  ';
      L.push('   ' + pad(id, 12) + num(s.honores, 3) + ' / ' + num(s.poses, 3) + ' · ' + num(s.possible, 3) + ' · ' + pct);
    });
    L.push('   ' + pad('TOTAL', 12) + num(th, 3) + ' / ' + num(tp, 3) + ' · ' + num(tq, 3) + ' · '
           + num(tq ? Math.round(100 * tu / tq) : 0, 3) + ' %');
  }
  L.push('');

  /* ── 4bis. LES AXES RARES, EN DÉTAIL. (11/09/2026)
     Sur les samedis, chacun en doit cinq par an : un écart d'une garde se voit
     et se rattrape. Sur les veilles de férié, chacun en doit UNE TOUS LES DEUX
     ANS. Un tableau de compteurs n'y apprend rien — il faut la liste des dates,
     qui les a eues, et pour ceux qui sont sous leur part, ce qui les a écartés
     de chacune. Sans onglet créé, c'est la seule façon de le savoir. */
  const RNOM = { vjf: 'VEILLES DE FÉRIÉ', jf: 'JOURS FÉRIÉS' };
  const JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  Object.keys(RNOM).forEach(function (axe) {
    const det = (r.raresDetail || {})[axe] || [];
    if (!det.length) return;
    L.push('── ' + RNOM[axe] + ' · ' + det.length + ' date(s) ──');
    det.forEach(function (d) {
      L.push('   ' + d.date + '  ' + pad(JOURS[d.dow] || '', 5) + d.g + '  +  ' + d.g2);
    });
    const sous = (r.raresManque || {})[axe] || [];
    if (!sous.length) { L.push('   → personne sous sa part sur cet axe'); L.push(''); return; }
    L.push('   ── sous leur part ──');
    sous.forEach(function (m) {
      const det2 = Object.keys(m.motifs).filter(function (k) { return k !== 'eu'; })
        .sort(function (a, b) { return m.motifs[b] - m.motifs[a]; })
        .map(function (k) { return m.motifs[k] + '× ' + k; });
      L.push('   ' + pad(m.id, 12) + m.reel + ' pour ' + m.part + ' due(s)');
      if (det2.length) L.push('              ' + det2.join(' · '));
    });
    L.push('');
  });

  /* ── 4ter. LE CUMUL DES ANNÉES PRÉCÉDENTES. Une année seule ne dit rien d'un
     axe rare : c'est sur trois ou cinq ans que l'injustice se voit. */
  const cp = r.cumulPrec || {}, cpIds = Object.keys(cp).sort();
  if (cpIds.length && (r.anneesLues || []).length) {
    L.push('── CUMUL DES ANNÉES ' + r.anneesLues.join(', ') + ' · réel − part due ──');
    L.push('   ' + pad('MAR', 12) + pad('total', 10) + pad('sam', 9) + pad('jeu', 9)
           + pad('ven-dim', 11) + pad('veilleJF', 11) + 'férié');
    const sgn = function (v) { return (v > 0 ? '+' : '') + (Math.round(v * 10) / 10); };
    cpIds.forEach(function (id) {
      const o = cp[id];
      L.push('   ' + pad(id, 12) + pad(sgn(o.total || 0), 10) + pad(sgn(o.sam || 0), 9)
             + pad(sgn(o.jeu || 0), 9) + pad(sgn(o.vd || 0), 11)
             + pad(sgn(o.vjf || 0), 11) + sgn(o.jf || 0));
    });
    L.push('   (positif : a fait plus que sa part · négatif : moins)');
    L.push('');
  }

  // ── 5. les quatre nuits de fêtes, celles que tout le monde regarde
  L.push('── NUITS DE FÊTES ──');
  Object.keys(r.fetes || {}).sort().forEach(function (d) {
    L.push('   ' + d + '   ' + r.fetes[d][0] + '  +  ' + r.fetes[d][1]);
  });
  L.push('');

  /* ── 6. LA RÈGLE DES PAIRES. Elle s'applique en silence, en écartant des
     candidats : aucun message ne prouve qu'elle a tenu. On le vérifie ici, le
     18 h compris — celui qui le fait rentre tard, la maison est vide pareil. */
  if (r.paires && r.paires.length) {
    L.push('── PAIRES À ÉVITER ──');
    r.paires.forEach(function (p) {
      if (!p.nuits.length) { L.push('   ' + p.paire + ' : aucune nuit ensemble'); }
      else {
        L.push('   ' + p.paire + ' : ' + p.nuits.length + ' nuit(s) ensemble');
        p.nuits.forEach(function (n) { L.push('      ' + n); });
      }
    });
    L.push('');
  }

  /* (24/10/2026) SEMAINES RÉA 1 : rien sans l'onglet REA1_{année}. */
  if (r.rea1 && r.rea1.semaines) {
    L.push('── SEMAINES RÉA 1 ──');
    L.push('   ' + r.rea1.semaines + ' semaine(s) lue(s) : pas de garde du dimanche au jeudi, ni récupération ni 18 h du lundi au vendredi');
    L.push('   Souhaits retirés (posés sur une nuit Réa 1) : ' + r.rea1.souhaitsRetires.length);
    if (r.rea1.absences.length) L.push('   ⚠️ Absences pendant sa propre semaine Réa 1 : ' + r.rea1.absences.join(', '));
    if (r.rea1.inconnus.length) L.push('   ⚠️ Noms non reconnus : ' + r.rea1.inconnus.join(', '));
    L.push('');
  }

  /* (11/10/2026) COUPLES DE WEEK-END : rien sans la ligne COUPLES_WEEKEND de CONFIG. */
  if (r.couplesWE && r.couplesWE.length) {
    L.push('── COUPLES DE WEEK-END ──');
    if (r.coupleAssoupli) L.push('   Règle assouplie : avec la règle entière, aucun planning ne tenait l\'équité');
    r.couplesWE.forEach(function (c) {
      L.push('   ' + c.couple + ' : week-ends en commun : ' + c.lies + '   ·   week-ends bloqués au foyer : ' + c.bloques);
    });
    L.push('');
  }

  L.push('── AVERTISSEMENTS (' + r.nbWarnings + ') ──');
  r.warnings.slice(0, 30).forEach(function (w) { L.push('   · ' + w); });
  if (r.nbWarnings > 30) L.push('   … et ' + (r.nbWarnings - 30) + ' autre(s)');
  L.push('');
  L.push('Rien n\'a été écrit dans le classeur, aucune notification envoyée.');

  const txt = L.join('\n');
  Logger.log(txt);
  return txt;
}

/* (05/09/2026) Choisit le tirage à écrire : jusqu'à MULTI_DEPART_MAX calculs à
   blanc, comparés dans cet ordre — journées sans binôme d'abord (la couverture
   prime tout), puis nombre d'axes au-delà du seuil, puis pire écart. Renvoie un
   NUMÉRO, pas un planning : l'appelant rejoue ce tirage en écrivant.
   Un calcul en échec n'interrompt pas la recherche. */
function choisirMeilleurTirage(year){
  const AXES = ['total','sam','jeu','vd','vjf','jf'];
  let meilleur = 1, cleMeilleure = null, atteint = false;
  /* (24/10/2026) COUPLES DE WEEK-END — LA RÈGLE S'ASSOUPLIT, ELLE NE SAUTE PAS.
     Règle du responsable : l'équité passe avant le couple. Première série : la
     règle entière. Si AUCUN planning n'atteint le seuil d'écart, seconde série
     (numéros MULTI_DEPART_MAX+1 à 2×MULTI_DEPART_MAX, mêmes ordres de départ) où
     seul le bonus de l'optimiseur (levier 2, le seul qui pèse contre l'équité)
     est retiré ; le placement (levier 1) et les échanges neutres (levier 3)
     restent. Filet de sécurité : depuis la réparation par échange (8c-ter), les
     demandes 2027 avec les semaines Réa 1 tiennent le seuil dès la première série ;
     avant elle, la règle entière laissait un pire écart de 2 sur les 8 plannings.
     Sans couple déclaré, la seconde série n'existe pas : rien ne change.
     Avec un couple, la première série ne s'arrête plus au premier planning
     équitable : parmi ceux qui tiennent le seuil, elle garde celui qui donne au
     couple le plus de week-ends en commun (mesuré le même jour : 1 à 5 selon le
     planning, tous à une garde près). L'équité reste le premier critère. */
  const avecCouple = Object.keys(getCouplesWeekend()).length > 0;
  const series = [1];
  if (avecCouple) series.push(2);
  for (const serie of series) {
  if (serie === 2) {
    if (atteint) break;
    Logger.log('Multi-départ : aucun planning à ' + MULTI_DEPART_SEUIL + ' garde d\'écart avec la règle du couple entière — nouvel essai sans son bonus');
  }
  for(let t = (serie - 1) * MULTI_DEPART_MAX + 1; t <= serie * MULTI_DEPART_MAX; t++){
    let r = null;
    try { r = generateGardes(year, { dryRun: true, tirage: t }); }
    catch(e){ Logger.log('Tirage ' + t + ' en échec : ' + e.message); continue; }
    if(!r || !r.ecarts) continue;
    let pire = 0, nAu = 0;
    AXES.forEach(function(k){
      const e = r.ecarts[k] ? r.ecarts[k].ecart : 0;
      if(e >= 2) nAu++;
      if(e > pire) pire = e;
    });
    const lies = (r.couplesWE || []).reduce(function(t, c){ return t + (c.lies || 0); }, 0);
    const cle = [r.sansBinome || 0, nAu, pire, -lies];
    let mieux = !cleMeilleure;
    if(cleMeilleure){
      for(let i = 0; i < cle.length; i++){
        if(cle[i] !== cleMeilleure[i]){ mieux = cle[i] < cleMeilleure[i]; break; }
      }
    }
    if(mieux){ cleMeilleure = cle; meilleur = t; }
    Logger.log('Tirage ' + t + ' : ' + (r.sansBinome || 0) + ' jour(s) sans binôme, pire écart ' + pire
               + (avecCouple ? ', week-ends en commun ' + lies : ''));
    if((r.sansBinome || 0) === 0 && pire <= MULTI_DEPART_SEUIL){ atteint = true; if(!avecCouple) break; }
  }
  }
  Logger.log('Multi-départ : tirage ' + meilleur + ' retenu');
  return meilleur;
}

function generateGardes(year, opts){
  if(!year) throw new Error('Précisez l\'année');
  const DRY = !!(opts && opts.dryRun);
  /* (05/09/2026) `forcerAncien` sert UNIQUEMENT à la comparaison à blanc : il rejoue
     l'algorithme d'avant sans toucher à l'interrupteur global. */
  const NOUVEL_ALGO = !(opts && opts.forcerAncien) && NOUVEL_ALGO_GLOBAL;
  const _tGen = Date.now();
  const ss=SpreadsheetApp.getActiveSpreadsheet();

  // ── 🔒 GARDE-FOU ANTI-RÉGÉNÉRATION ────────────────────────────────────
  // Une fois GARDES_{year} créé, la génération est VERROUILLÉE. Le code plus bas
  // fait deleteSheet+recreate de GARDES_{year} ET STATS_GARDES_{year} : sans ce
  // garde-fou, relancer W2 écraserait la preuve d'équité de l'algo et le planning.
  // Pour régénérer volontairement (rare) : supprimer d'abord manuellement l'onglet.
  if(!DRY && ss.getSheetByName(`GARDES_${year}`)){
    throw new Error(`🔒 GARDES_${year} existe déjà — génération verrouillée pour protéger l'équité. Pour régénérer (rare), supprimez d'abord manuellement l'onglet GARDES_${year}.`);
  }

  /* (05/09/2026) MULTI-DÉPART — récit : docs/JOURNAL-Planning-Med.md §109 */
  if(NOUVEL_ALGO && !DRY && !(opts && opts.tirage)){
    const _t = choisirMeilleurTirage(year);
    return generateGardes(year, Object.assign({}, opts || {}, { tirage: _t }));
  }

  // (C2-D1) Flags effectif lus depuis MEDECINS (remplacent les Set en dur).
  const FLAGS = getMedecinFlags();
  const NO_GARDE   = FLAGS.noGarde;
  const ONLY_18    = FLAGS.only18;
  const NO_WEEKEND = FLAGS.noWeekend;

  /* (07/09/2026) PAIRES À ÉVITER — récit : docs/JOURNAL-Planning-Med.md §110 */
  const PAIRES_EV = getPairesEvitees();
  const CPL_WE = getCouplesWeekend();                 // (11/10/2026) {} sans la ligne CONFIG
  const _cplOn = Object.keys(CPL_WE).length > 0;
  const DATES_EXEMPTES = new Set([`${year}-12-24`,`${year}-12-25`,`${year}-12-31`,`${year+1}-01-01`]);
  // d : une date, un tableau de dates (unité), ou rien. Une unité est exemptée dès
  // qu'UN de ses jours l'est — on ne coupe pas une unité en deux régimes.
  const jourExempt = (d) => Array.isArray(d) ? d.some(x=>DATES_EXEMPTES.has(x)) : DATES_EXEMPTES.has(d);
  const evite = (a,b,d) => !!(a && b && a!==b && PAIRES_EV[a] && PAIRES_EV[a].has(b)) && !jourExempt(d);
  const okPaire = (a,b,d) => !evite(a,b,d);
  // Retire les binômes interdits d'une liste de candidats ; si la liste devient vide,
  // elle est rendue telle quelle : la couverture prime TOUJOURS sur la règle de paire.
  const sansPaire = (liste,id,d) => { const f=liste.filter(m=>okPaire(id,m,d)); return f.length?f:liste; };
  /* Dans une liste DÉJÀ TRIÉE par mérite, la meilleure paire autorisée : on remonte
     d'abord le second, puis le premier. Si la tête de liste est interdite, on prend
     donc (1er, 3e) — le plus petit renoncement possible. Si aucune paire n'est
     autorisée (2 personnes disponibles, et c'est le couple), on rend la tête de
     liste : un jour sans binôme arrête toute la génération, jamais l'inverse. */
  const meilleurePaire = (L,d) => {
    for(let j=1;j<L.length;j++) for(let i=0;i<j;i++) if(okPaire(L[i],L[j],d)) return [L[i],L[j]];
    return [L[0],L[1]];
  };

  // ── 1. Indispos ──────────────────────────────────────────────────────
  const indSheet=ss.getSheetByName(`INDISPOS_${year}`);
  if(!indSheet) throw new Error(`INDISPOS_${year} introuvable`);
  const indData=indSheet.getDataRange().getValues();
  const indispos={},souhaits={};
  const indDates = reconstruireDatesHeaders(indData, year); // (C3b) helper unifié
  for(let r=3;r<indData.length;r++){
    const id=String(indData[r][0]).trim();if(!id) continue;
    indispos[id]={};
    indDates.forEach((ds,i)=>{if(!ds) return;const v=String(indData[r][i+1]||'').trim();
      if(v)indispos[id][ds]=v;
      if(v==='SOUHAIT'){if(!souhaits[ds])souhaits[ds]=[];souhaits[ds].push(id);}
    });
  }

  // (Fix A3) une garde posée sur un jour que le MAR a lui-même souhaité est
  // « assumée » : elle ne compte pas dans SES pénalités d'espacement.
  const isSouhaitDe=(id,date)=>!!(souhaits[date]&&souhaits[date].indexOf(id)>=0);
  // (25/08/2026) Les indulgences d'espacement (voisin souhaité moins pénalisé, VDM)
  // n'ont de sens que pour les jours LIBRES : c'est le régime historique, éprouvé.
  // Sur un jour rare, un souhait ne doit jamais servir à coller deux gardes — sans
  // cette restriction, les gardes rapprochées passaient de 35 à 46 au pire cas.
  const isSouhaitLibre=(id,date)=>{
    const d=dayByDate[date];
    return !!d&&d.dow>=1&&d.dow<=3&&!d.isFerie&&isSouhaitDe(id,date);
  };

  // ── 2. Médecins ──────────────────────────────────────────────────────
  const medData=_medecinsRows_();
  const allDoctors=[],gardeDoctors=[],pct={},quot={};
  for(let r=1;r<medData.length;r++){
    const id=String(medData[r][COL_MED.ID]).trim();
    if(!id||id==='DRUGE') continue;
    allDoctors.push(id);pct[id]=Number(medData[r][COL_MED.PCT_GARDES])||100;quot[id]=Number(medData[r][COL_MED.QUOTITE])||100;
    if(!NO_GARDE.has(id)) gardeDoctors.push(id);
    if(!indispos[id]) indispos[id]={};
  }
  // (C2-D2) Exclure les MAR entièrement hors de l'année planning via date_debut/date_fin.
  // Remplace le splice('TESSIER') en dur. Pour 2027 : TESSIER (fin 2026-09-01) entièrement
  // avant le début 2027 → exclue (= ancien splice) ; une arrivante au 01/11/2026 active en
  // 2027 → conservé. Générique : tout futur départ/arrivée passe par MEDECINS.
  const _planStart = toDateStr(getPremierJourPlanning(year));
  const _planEnd   = toDateStr(new Date(getPremierJourPlanning(year + 1).getTime() - 86400000));
  const _horsAnnee = id => {
    const dd = FLAGS.dateDebut[id], df = FLAGS.dateFin[id];
    if (df && df < _planStart) return true; // activité terminée avant le début de l'année
    if (dd && dd > _planEnd)   return true; // activité démarrant après la fin de l'année
    return false;
  };
  [gardeDoctors, allDoctors].forEach(arr => {
    for (let i = arr.length - 1; i >= 0; i--) { if (_horsAnnee(arr[i])) arr.splice(i, 1); }
  });

  /* (05/09/2026) NUMÉRO DE TIRAGE — récit : docs/JOURNAL-Planning-Med.md §111 */
  const TIRAGE_BRUT = Math.max(1, Number(opts && opts.tirage) || 1);
  /* (24/10/2026) Numéros au-delà de MULTI_DEPART_MAX : même ordre de départ que
     le tirage (n − MULTI_DEPART_MAX), sans le bonus du couple (voir
     choisirMeilleurTirage). */
  const CPL_SANS_BONUS = TIRAGE_BRUT > MULTI_DEPART_MAX;
  const TIRAGE = ((TIRAGE_BRUT - 1) % MULTI_DEPART_MAX) + 1;
  if(NOUVEL_ALGO){
    const _h = s => { let h = 2166136261 ^ Math.imul(TIRAGE, 0x9E3779B1);
      for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0; };
    const _rang = {}; gardeDoctors.forEach(id => { _rang[id] = _h(id); });
    gardeDoctors.sort((a,b) => _rang[a] - _rang[b] || (a < b ? -1 : 1));
  }

  // ── 3. Calendrier ────────────────────────────────────────────────────
  const j1=new Date(year,0,1),d1=j1.getDay(),o1=d1===1?7:d1===0?1:8-d1;
  const start=new Date(year,0,1+o1,12,0,0);
  const j1n=new Date(year+1,0,1),d1n=j1n.getDay(),on=d1n===1?7:d1n===0?1:8-d1n;
  const end=new Date(new Date(year+1,0,1+on,12,0,0).getTime()-86400000);
  const jf=getJoursFeries(year),jfn=getJoursFeries(year+1);
  const allDays=[];
  for(const dt=new Date(start);dt<=end;dt.setDate(dt.getDate()+1)){
    const ds=toDateStr(dt),dow=dt.getDay();
    const isFerie=jf.has(ds)||jfn.has(ds);
    const lend=addOneDay(ds), ferieLend=jf.has(lend)||jfn.has(lend);
    // VJF de semaine : J non férié, J+1 férié, J = lun..jeu (le JF tombe donc mar..ven)
    const isVjf=!isFerie&&ferieLend&&dow>=1&&dow<=4;
    const mon=new Date(dt); mon.setDate(mon.getDate()-((dow+6)%7)); // lundi ISO (clé semaine, pré-calculée)
    allDays.push({date:ds,dow,month:dt.getMonth()+1,wk:toDateStr(mon),
      isFerie,isSat:dow===6,isSun:dow===0,
      isWeekday:dow>=1&&dow<=5,isReduced:isReducedPeriod(dt.getMonth()+1),isVjf});
  }
  // OPTIM : Map date→day pour lookup O(1) (remplace allDays.find)
  const dayByDate={};
  allDays.forEach(d=>{dayByDate[d.date]=d;});

  // Transition N-1
  const ts=ss.getSheetByName('CONFIG_TRANSITION');
  if(ts){
    const td=ts.getDataRange().getValues();
    for(let r=1;r<td.length;r++){
      if(Number(td[r][0])!==year) continue;
      const pj=toDateStr(new Date(year,0,1+o1));
      [String(td[r][1]).trim(),String(td[r][2]).trim()].forEach(id=>{
        if(id){if(!indispos[id])indispos[id]={};indispos[id][pj]='RG_TRANSITION';}});
      break;
    }
  }

  /* ── 3bis. (24/10/2026) SEMAINES RÉA 1 — inerte sans l'onglet REA1_{year} ──
     Règle du responsable : la semaine Réa 1 est sanctuarisée. Du lundi au
     vendredi, le Réa 1 désigné fait la réanimation : aucune garde du dimanche
     soir au jeudi soir (la garde du dimanche mettrait son repos le lundi, celle
     du jeudi le vendredi), aucune récupération et aucun 18 h du lundi au
     vendredi. Il reste libre le vendredi soir, le samedi et le week-end VD qui
     clôt sa semaine. L'onglet est le tableau de répartition de l'équipe réa,
     collé tel quel : une ligne par semaine, colonne « Du » (le lundi) et colonne
     « REA 1 … » (initiales ou identifiant). Les souhaits posés sur une nuit
     Réa 1 de leur auteur sont retirés, et listés dans les avertissements. */
  const REA1_NUIT={}, REA1_SEM={}, rea1Msgs=[], rea1Bilan={semaines:0,souhaitsRetires:[],absences:[],inconnus:[]};
  {
    const _shR=ss.getSheetByName(`REA1_${year}`);
    if(_shR){
      const _v=_shR.getDataRange().getValues();
      const _norm=x=>String(x==null?'':x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
      const _h=(_v[0]||[]).map(_norm);
      let _cDu=_h.indexOf('DU'), _cR=_h.findIndex(x=>/^REA ?1\b/.test(x));
      if(_cDu<0) _cDu=1; if(_cR<0) _cR=4;
      const _parse=x=>{
        if(x instanceof Date||Object.prototype.toString.call(x)==='[object Date]') return toDateStr(x);
        const t=String(x==null?'':x).trim(); let m;
        if((m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        if(/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
        return '';
      };
      const _ini={}; medData.slice(1).forEach(row=>{const id=String(row[COL_MED.ID]).trim(), ini=String(row[COL_MED.INITIALES]||'').trim().toUpperCase();
        if(id){ _ini[id.toUpperCase()]=id; if(ini) _ini[ini]=id; }});
      const _sh=(ds,n)=>toDateStr(new Date(new Date(ds+'T12:00:00').getTime()+n*86400000));
      for(let r=1;r<_v.length;r++){
        let lun=_parse(_v[r][_cDu]); const code=String(_v[r][_cR]==null?'':_v[r][_cR]).trim().toUpperCase();
        if(!lun||!code) continue;
        const _dw=new Date(lun+'T12:00:00').getDay(); lun=_sh(lun,-((_dw+6)%7));   // ramené au lundi
        const id=_ini[code];
        if(!id||gardeDoctors.indexOf(id)<0){ rea1Bilan.inconnus.push(code+' ('+lun+')'); continue; }
        rea1Bilan.semaines++;
        (REA1_NUIT[id]=REA1_NUIT[id]||new Set()); (REA1_SEM[id]=REA1_SEM[id]||new Set());
        for(let k=-1;k<=3;k++) REA1_NUIT[id].add(_sh(lun,k));
        for(let k=0;k<=4;k++)  REA1_SEM[id].add(_sh(lun,k));
        for(let k=-1;k<=3;k++){ const d=_sh(lun,k);
          if(indispos[id]?.[d]==='SOUHAIT'){
            delete indispos[id][d];
            if(souhaits[d]){ souhaits[d]=souhaits[d].filter(x=>x!==id); if(!souhaits[d].length) delete souhaits[d]; }
            rea1Bilan.souhaitsRetires.push(id+' '+d);
          } }
        for(let k=0;k<=3;k++){ const d=_sh(lun,k), a=indispos[id]?.[d];
          if(a==='VAC'||a==='FORM'||a==='CL'||a==='TP'||a==='CTP') rea1Bilan.absences.push(id+' '+d+' ('+a+')'); }
      }
      if(rea1Bilan.souhaitsRetires.length) rea1Msgs.push('Réa 1 : '+rea1Bilan.souhaitsRetires.length+' souhait(s) posé(s) sur une nuit Réa 1 de leur auteur, retiré(s) : '+rea1Bilan.souhaitsRetires.join(', '));
      if(rea1Bilan.absences.length) rea1Msgs.push('Réa 1 : absence posée pendant sa propre semaine Réa 1 — à vérifier avec l\'équipe réa : '+rea1Bilan.absences.join(', '));
      if(rea1Bilan.inconnus.length) rea1Msgs.push('Réa 1 : nom non reconnu dans REA1_'+year+', semaine ignorée : '+rea1Bilan.inconnus.join(', '));
    }
  }

  // ── 4. Dette inter-annuelle PAR AXE (samedi / jeudi / VD) ─────────────
  // On reporte l'écart (réel − cible) de l'an dernier sur CHAQUE axe à enjeu,
  // plutôt que sur le total : qui a fait trop de samedis en N en fera moins en N+1,
  // idem jeudis et VD. Lu seulement si la cible N-1 de l'axe est connue
  // (colonnes CIBLE SAM/JEU/VD de STATS_GARDES_{N-1}) ; sinon départ neutre.
  const dette={};
  gardeDoctors.forEach(id=>{dette[id]={sam:0,jeu:0,vd:0,vjf:0,jf:0,total:0};});
  let prevStats=null;
  if(year-1 >= PREMIERE_ANNEE_STATS_FIABLES){
    prevStats=ss.getSheetByName(`STATS_GARDES_${year-1}`);
    if(!prevStats){
      // Repli : l'onglet N-1 a pu être déplacé vers le classeur d'archives (W3)
      try { prevStats=SpreadsheetApp.openById(ARCHIVE_SS_ID).getSheetByName(`STATS_GARDES_${year-1}`); }
      catch(e){ /* archives inaccessibles → dette neutre, l'algo continue */ }
    }
  }
  if(prevStats){
    const ps=prevStats.getDataRange().getValues();
    const hdr=ps[0].map(h=>String(h).trim());
    const iSam=hdr.indexOf('SAM'), iJeu=hdr.indexOf('JEU'), iVd=hdr.indexOf('VD'), iVjf=hdr.indexOf('VEILLE JF'), iJf=hdr.indexOf('JF'), iTot=hdr.indexOf('TOTAL G');
    // (RH-3) Colonnes CIBLE de N-1 : déjà pro-ratées par la présence structurelle
    // (arrivée/départ, congés longs, TP, no_weekend) au moment de la génération N-1.
    const iCbT=hdr.indexOf('CIBLE'), iCbS=hdr.indexOf('CIBLE SAM'), iCbJ=hdr.indexOf('CIBLE JEU'),
          iCbV=hdr.indexOf('CIBLE VD'), iCbVj=hdr.indexOf('CIBLE VJF'), iCbJf=hdr.indexOf('CIBLE JF');
    /* (11/09/2026) PART EXACTE — récit : docs/JOURNAL-Planning-Med.md §112 */
    const iExT=hdr.indexOf('PART EXACTE'), iExS=hdr.indexOf('PART EXACTE SAM'),
          iExJ=hdr.indexOf('PART EXACTE JEU'), iExV=hdr.indexOf('PART EXACTE VD'),
          iExVj=hdr.indexOf('PART EXACTE VJF'), iExJf=hdr.indexOf('PART EXACTE JF');
    // (dette) on lit les NOMBRES RÉELS affectés en N-1, puis on recompose la part
    // juste en redistribuant ces réels au prorata des CIBLES N-1 stockées (RH-3) —
    // et non plus de la seule quotité, qui créait une fausse dette « négative »
    // pour un MAR légitimement absent une partie de N-1 (maternité, arrivée tardive).
    const reel={}, cibN1={}; let totSam=0,totJeu=0,totVd=0,totVjf=0,totJf=0,totTot=0;
    const _num=v=>Number(String(v).replace(/^'/,''))||0; // CIBLE totale stockée en texte
    for(let r=1;r<ps.length;r++){
      const id=String(ps[r][0]).trim();
      if(!id||!dette[id]) continue;
      const rs=iSam>=0?Number(ps[r][iSam])||0:0, rj=iJeu>=0?Number(ps[r][iJeu])||0:0,
            rv=iVd>=0?Number(ps[r][iVd])||0:0,  rvj=iVjf>=0?Number(ps[r][iVjf])||0:0,
            rjf=iJf>=0?Number(ps[r][iJf])||0:0,  rt=iTot>=0?Number(ps[r][iTot])||0:0;
      reel[id]={sam:rs,jeu:rj,vd:rv,vjf:rvj,jf:rjf,total:rt};
      totSam+=rs; totJeu+=rj; totVd+=rv; totVjf+=rvj; totJf+=rjf; totTot+=rt;
      // Part exacte si elle est renseignée, sinon la cible entière (cf. commentaire ci-dessus).
      const _ref=(iEx,iCb)=>{ const v=iEx>=0?_num(ps[r][iEx]):0;
        return v>0 ? v : (iCb>=0?_num(ps[r][iCb]):0); };
      const cbS=_ref(iExS,iCbS);
      cibN1[id]={
        total: _ref(iExT,iCbT),
        sam: cbS,
        jeu: _ref(iExJ,iCbJ),
        vd:  _ref(iExV,iCbV),
        vjf: _ref(iExVj,iCbVj),
        jf:  iExJf>=0&&_num(ps[r][iExJf])>0 ? _num(ps[r][iExJf])
             : (iCbJf>=0?_num(ps[r][iCbJf]):cbS), // pas de CIBLE JF en N-1 → repli CIBLE SAM (même pool WE)
      };
    }
    const sumP=gardeDoctors.reduce((s,id)=>s+pct[id]/100,0);
    const _horsWE=id=>NO_WEEKEND.has(id)||FLAGS.souhaitPlafond.has(id); // (Fix A2) plafonné hors axes WE
    const sumPWE=gardeDoctors.reduce((s,id)=>_horsWE(id)?s:s+pct[id]/100,0);
    // (RH-3) fair(axe) = totalRéel(axe) × cibleN1(id,axe) / Σ cibleN1(axe).
    // Propriétés : Σdette = 0 par axe ; cibles ∝ quotité quand tout le monde est
    // à temps plein toute l'année → identique à l'ancienne formule dans ce cas.
    // Repli intégral sur l'ancienne formule (quotité) si les cibles N-1 manquent.
    const sumCb={}; ['sam','jeu','vd','vjf','jf','total'].forEach(k=>{
      sumCb[k]=gardeDoctors.reduce((s,id)=>s+(cibN1[id]?cibN1[id][k]:0),0);
    });
    const fairOf=(id,k,totReel)=>{
      if(sumCb[k]>0) return totReel*(cibN1[id]?cibN1[id][k]:0)/sumCb[k];
      const p=pct[id]/100; // repli : ancienne part au prorata de la quotité
      if(k==='jeu'||k==='vjf'||k==='total') return sumP?totReel*p/sumP:0;
      return (_horsWE(id)||!sumPWE)?0:totReel*p/sumPWE;
    };
    gardeDoctors.forEach(id=>{
      if(!reel[id]) return; // MAR absent de N-1 → dette neutre
      dette[id].sam=reel[id].sam-fairOf(id,'sam',totSam);
      dette[id].jeu=reel[id].jeu-fairOf(id,'jeu',totJeu);
      dette[id].vd =reel[id].vd -fairOf(id,'vd',totVd);
      dette[id].vjf=reel[id].vjf-fairOf(id,'vjf',totVjf);
      dette[id].jf =reel[id].jf -fairOf(id,'jf',totJf);
      dette[id].total=reel[id].total-fairOf(id,'total',totTot);
    });
    // (équité annuelle = dogme) plafond ±2 par axe : la dette nudge, ne bouleverse pas l'année
    gardeDoctors.forEach(id=>['sam','jeu','vd','vjf','jf','total'].forEach(k=>{dette[id][k]=DETTE_AMORTI*Math.max(-2,Math.min(2,dette[id][k]));}));
  }

  // ── 5. Cibles PRO-RATÉES par disponibilité STRUCTURELLE ──────────────
  // Réduit la cible : hors [date_debut,date_fin] OU statut 'CL' (congé long).
  // NE réduit PAS : INDISPO/VAC/FORM (indispo volontaire → le MAR assume sa
  // concentration). Poids axe = pct × (jours d'axe structurellement dispo /
  // total jours d'axe) ; la part libérée est redistribuée aux autres.
  const nDays=allDays.length;
  const nSam=allDays.filter(d=>d.dow===6).length;
  const nJeu=allDays.filter(d=>d.dow===4&&!d.isFerie).length;
  const nVen=allDays.filter(d=>d.dow===5).length;
  const nVjf=allDays.filter(d=>d.isVjf).length;
  const nFerie=allDays.filter(d=>d.isFerie&&(d.dow===2||d.dow===3)).length;       // fériés NON couplés (mar/mer)
  const nCoupleSam=allDays.filter(d=>d.isFerie&&(d.dow===1||d.dow===4)).length;   // jeudi/lundi fériés couplés → comptés samedi
  /* (05/10/2026) CONGÉ LONG À CIBLE PLEINE. Par défaut un CL réduit la cible
     au prorata (la part libérée va aux autres). Le MAR peut demander l'inverse :
     garder la cible d'une année pleine et la concentrer sur ses mois de présence.
     Le choix vit dans le classeur — colonne CIBLE_PLEINE (OUI) du registre
     ABSENCES_LONGUES, une ligne par absence — jamais dans le code.
     Effet limité au CALCUL de la cible (structAvail, donc aussi le poids des
     18 h) : les jours CL restent bloqués pour les gardes partout ailleurs, et le
     lissage mensuel (5ter) répartit d'office la cible sur les mois de présence. */
  const clPlein={};
  { const _abs=ss.getSheetByName('ABSENCES_LONGUES');
    const _ad=_abs?_abs.getDataRange().getValues():[];
    const _h=(_ad[0]||[]).map(v=>String(v).trim().toUpperCase());
    const _iP=_h.indexOf('CIBLE_PLEINE');
    if(_iP>=0) for(let r=1;r<_ad.length;r++){
      const _id=String(_ad[r][0]||'').trim().toUpperCase();
      const _ok=/^(OUI|O|X|TRUE|VRAI)$/i.test(String(_ad[r][_iP]).trim());
      const _a=toDateStr(_ad[r][1]), _b=toDateStr(_ad[r][2]);
      if(!_id||!_ok||!_a||!_b||_a>_b) continue;
      const _s=clPlein[_id]||(clPlein[_id]=new Set());
      for(let _d=_a;_d<=_b;_d=addOneDay(_d)) _s.add(_d);
    }
    Object.keys(clPlein).forEach(_id=>Logger.log(`ℹ️ ${_id} : congé long à cible pleine (${clPlein[_id].size} j) — cible non réduite`));
  }
  function structAvail(id,d){
    const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id];
    if(dd && d.date<dd) return false;
    if(df && d.date>=df) return false;
    if(indispos[id]?.[d.date]==='CL' && !clPlein[String(id).toUpperCase()]?.has(d.date)) return false;
    return true;
  }
  const AX={
    total: allDays,
    sam:   allDays.filter(d=>d.dow===6),
    jeu:   allDays.filter(d=>d.dow===4&&!d.isFerie),
    vd:    allDays.filter(d=>d.dow===5),
    vjf:   allDays.filter(d=>d.isVjf),
    ferie: allDays.filter(d=>d.isFerie&&(d.dow===2||d.dow===3)),
    jf:    allDays.filter(d=>d.isFerie),
  };
  const nFerieAll=allDays.filter(d=>d.isFerie).length;
  const SLOTS={total:nDays*2, sam:nSam*2, jeu:nJeu*2, vd:nVen*2, vjf:nVjf*2, ferie:nFerie*2, jf:nFerieAll*2};
  function axisEligible(axis,id){
    if((axis==='sam'||axis==='vd'||axis==='ferie'||axis==='jf')&&(NO_WEEKEND.has(id)||FLAGS.souhaitPlafond.has(id))) return false; // (Fix A2) plafonné : aucun axe WE/férié
    if(axis==='jeu'&&FLAGS.souhaitPlafond.has(id)) return false; // (Fix A2) plafonné hors axe jeudi : sa cible fantôme gonflait les jeudis des autres ; ses compensations vont sur lun/mar/mer
    if(axis==='vjf'&&FLAGS.souhaitPlafond.has(id)) return false; // souhait_plafond hors VJF
    return true;
  }
  const cible={};
  gardeDoctors.forEach(id=>{cible[id]={};});
  Object.keys(AX).forEach(axis=>{
    const tot=AX[axis].length||1, w={};
    gardeDoctors.forEach(id=>{
      if(!axisEligible(axis,id)){w[id]=0;return;}
      // (D1) jours fixes TP : indisponibilité STRUCTURELLE des axes-jour concernés
      // (ex. JEU off → cible jeudi 0, comme NO_WEEKEND annule sam/VD). L'axe total
      // n'est PAS réduit : la quotité (pct) couvre déjà le volume — sinon double peine.
      const _tpA=FLAGS.tpJoursFixes[id];
      const avail=AX[axis].filter(d=>structAvail(id,d)&&(axis==='total'||!_tpA||!_tpA.has(d.dow))).length;
      w[id]=(pct[id]/100)*(avail/tot);
    });
    const sw=gardeDoctors.reduce((s,id)=>s+w[id],0)||1;
    gardeDoctors.forEach(id=>{cible[id][axis]=SLOTS[axis]*w[id]/sw;});
  });

  /* (05/09/2026) CIBLES ENTIÈRES — récit : docs/JOURNAL-Planning-Med.md §113 */
  const cibleExacte={};
  gardeDoctors.forEach(id=>{ cibleExacte[id]=Object.assign({}, cible[id]); });
  if(NOUVEL_ALGO){
    ['total','sam','jeu','vd','vjf','jf'].forEach(axis=>{
      const elig=gardeDoctors.filter(id=>cible[id][axis]>0);
      if(!elig.length) return;
      const _dt=id=>(dette[id]&&dette[id][axis])||0;
      const vise={}; elig.forEach(id=>{ vise[id]=Math.max(0, cible[id][axis]-_dt(id)); });
      const base={}; let somme=0;
      elig.forEach(id=>{ base[id]=Math.floor(vise[id]); somme+=base[id]; });
      let reste=Math.round(SLOTS[axis]-somme);
      // Priorité : le plus créditeur d'abord ; à égalité, le plus fort reste.
      const prio=id=>_dt(id)-(vise[id]-Math.floor(vise[id]));
      const ordre=elig.slice().sort((a,b)=> prio(a)-prio(b) || (a<b?-1:1));
      let k=0;
      while(reste>0 && k<ordre.length*4){ base[ordre[k%ordre.length]]++; reste--; k++; }
      while(reste<0 && k<ordre.length*4){ const id=ordre[ordre.length-1-(k%ordre.length)];
        if(base[id]>0){ base[id]--; reste++; } k++; }
      elig.forEach(id=>{ cible[id][axis]=base[id]; });
    });
    // Le report est désormais DANS la cible : le compteur repart à zéro pour que
    // ratio() ne l'applique pas deux fois.
    gardeDoctors.forEach(id=>{ ['sam','jeu','vd','vjf','jf','total'].forEach(k=>{ dette[id][k]=0; }); });
  }
// ── 5bis. Souhaits plafonnés à la cible (profils souhait_plafond) ──────────
  // La cible totale devient le MAX entre la cible proportionnelle et le
  // nombre de souhaits :
  //   • souhaits ≤ cible → il termine à la cible prévue (souhaits inclus) ;
  //   • souhaits > cible → il obtient exactement ses souhaits, sans extra.
  // (Pour les autres MAR, les souhaits sont déjà "dans" le quota.)
  const SOUHAIT_PLAFOND = FLAGS.souhaitPlafond; // (C2-D1) externalisé → MEDECINS
  SOUHAIT_PLAFOND.forEach(id=>{
    if(!cible[id]) return;
    const n=Object.values(souhaits).filter(ids=>ids.includes(id)).length;
    cible[id].total = Math.max(cible[id].total, n);
    // (11/09/2026) La part exacte suit le plafond : pour ces profils, la « part
    // juste » EST le nombre de souhaits, pas la fraction d'équité — qui ne veut
    // rien dire puisqu'ils sont hors des axes week-end, jeudi et veille de férié.
    if(cibleExacte[id]) cibleExacte[id].total = Math.max(cibleExacte[id].total, n);
  });
  // Budget de jours LIBRES (lun/mar/mer) = total − axes-clés. Les souhaits des
  // sans souhait_plafond sont plafonnés à ce budget : leurs parts sam/jeu/VD/VJF/férié
  // restent dues à l'équipe (équité) et ne peuvent être noyées sous des mardis.
  const freeBudget={};
  gardeDoctors.forEach(id=>{
    const c=cible[id];
    // un week-end VD coûte 2 jours (vendredi + dimanche) au total → compté ×2,
    // sinon le budget de souhaits est surévalué et les mardis affament l'axe VD.
    freeBudget[id]=c.total-(c.sam+c.jeu+2*c.vd+c.vjf+c.ferie)-FREEBUDGET_MARGE;
  });
  // ── 5ter. Lissage annuel : espérance de gardes par MOIS, proportionnelle aux
  // jours STRUCTURELLEMENT disponibles ce mois (respecte 2/2, CL, dates, absences
  // fixes). Un MAR en rythme 2/2 a une espérance nulle ses semaines off.
  const ABSENT_STRUCT=new Set(['INDISPO','VAC','FORM','TP','CL','CTP']);
  const monthExp={};
  gardeDoctors.forEach(id=>{
    const ma={}; for(let m=1;m<=12;m++) ma[m]=0;
    const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id];
    allDays.forEach(d=>{
      if(dd && d.date<dd) return;
      if(df && d.date>=df) return;
      if(ABSENT_STRUCT.has(indispos[id]?.[d.date])) return;
      if(estSemaineOff(id,d.date)) return;
      ma[d.month]++;
    });
    const tot=Object.values(ma).reduce((s,x)=>s+x,0)||1;
    const me={}; for(let m=1;m<=12;m++) me[m]=cible[id].total*ma[m]/tot;
    monthExp[id]=me;
  });
  // ── 6. État ──────────────────────────────────────────────────────────
  const gSet={},g2Set={},rgSet={},rSet={};
  const cnt={};
  gardeDoctors.forEach(id=>{
    gSet[id]=new Set();g2Set[id]=new Set();rgSet[id]=new Set();rSet[id]=new Set();
    cnt[id]={total:0,g:0,g2:0,sam:0,jeu:0,ven:0,vd:0,vjf:0,ferie:0,jf:0,lun:0,mar:0,mer:0,dim:0,recupR:0};
  });
  allDoctors.forEach(id=>{if(!rSet[id])rSet[id]=new Set();if(!rgSet[id])rgSet[id]=new Set();});
  const recupDue={}; gardeDoctors.forEach(id=>{recupDue[id]=[];}); // (R fix) #R ≡ #samedis (couplages inclus)
  const weekCnt={}; gardeDoctors.forEach(id=>{weekCnt[id]={};}); // gardes par semaine ISO (espacement O(1))
  const weekCntS={}; gardeDoctors.forEach(id=>{weekCntS[id]={};}); // (Fix A3) dont gardes-souhaits
  const monthCnt={}; gardeDoctors.forEach(id=>{monthCnt[id]={};}); // gardes par mois (lissage annuel)

  // _relaxJS : tolère le combo jeudi↔samedi (2 gardes en 3 jours glissants, G-RG-G).
  // Utilisé UNIQUEMENT en dernier recours par la passe des jours critiques, quand un
  // jour resterait sinon non pourvu. Aucun autre appelant ne passe ce paramètre :
  // le comportement par défaut est strictement inchangé.
  // ── (31/07/2026) SOURCE UNIQUE DES CONTRAINTES INDIVIDUELLES ──────────
  // Contraintes qui ne dépendent NI de l'ordre de placement NI du contexte d'un
  // transfert : présence, absences, régimes. Appelée par blocked() ET par canHold()
  // de l'optimiseur.
  // POURQUOI : les deux fonctions répondaient séparément à « ce MAR peut-il prendre
  // cette garde ? », avec deux listes maintenues à la main. canHold en avait oublié
  // DEUX — RG_TRANSITION (→ deux gardes d'affilée le 1er jour de l'année, constaté en
  // production le 04/01/2027) et le plafond des souhaits garantis. Une règle écrite
  // deux fois finit toujours par diverger : elle n'est plus écrite qu'ici.
  // Ce qui reste PROPRE à chaque appelant : tout ce qui dépend du planning en cours
  // (repos, récup, gardes adjacentes, combos jeudi↔samedi et dimanche→mardi), car
  // l'optimiseur raisonne sur un GROUPE de jours et doit ignorer l'adjacence interne.
  // (20/10/2026) Le lendemain est-il un jour de vacances / formation / congé long ?
  // TOUS les jours comptent, week-ends et fériés compris (arbitrage du responsable :
  // vacances au départ du samedi → pas de garde le vendredi).
  function absenceLendemain(id,date){
    const _sl=indispos[id]?.[addOneDay(date)];
    return _sl==='VAC'||_sl==='FORM'||_sl==='CL';
  }
  function indispoIndividuelle(id,date){
    const _dd=FLAGS.dateDebut[id], _df=FLAGS.dateFin[id]; // (F3) arrivée/départ en cours d'année
    if(_dd&&date<_dd) return true;
    if(_df&&date>=_df) return true;
    const s=indispos[id]?.[date];
    if(s==='INDISPO'||s==='VAC'||s==='FORM'||s==='TP'||s==='CL'||s==='CTP') return true;
    if(s==='RG_TRANSITION') return true;      // repos hérité de la garde du 31/12 (CONFIG_TRANSITION)
    if(REA1_NUIT[id]&&REA1_NUIT[id].has(date)) return true;   // (24/10/2026) semaine Réa 1, dimanche → jeudi
    if(estSemaineOff(id,date)) return true;   // semaine "off" du rythme 2/2
    const _tpF=FLAGS.tpJoursFixes[id];         // (D1) jours fixes non travaillés (MEDECINS col Q)
    if(_tpF&&_tpF.has(new Date(date+'T12:00:00').getDay())) return true;
    const _di=dayByDate[date];
    const _dw=_di?_di.dow:new Date(date+'T12:00:00').getDay();
    /* (LOT B · 01/09/2026) JAMAIS DE GARDE LA VEILLE D'UN TEMPS PARTIEL — récit : docs/JOURNAL-Planning-Med.md §114 */
    if(indispos[id]?.[addOneDay(date)]==='TP') return true;
    /* (20/10/2026) JAMAIS DE REPOS DE GARDE SUR UN JOUR DE VACANCES — règle du responsable :
       le repos ne peut pas tomber sur un jour de vacances, de formation ou de congé long,
       quel qu'il soit (départ un mercredi → pas de garde le mardi ; départ un samedi → pas
       de garde le vendredi). Même logique que le temps partiel du lendemain ci-dessus. */
    if(absenceLendemain(id,date)) return true;
    if(NO_WEEKEND.has(id)&&(_dw===0||_dw===6||_di?.isFerie)) return true;
    /* (09/10/2026) VEILLE DE FÉRIÉ : interdite au régime à part SAUF s'il l'a lui-même
       demandée. Ses souhaits passent en priorité absolue (régime 1) : sans cette
       exception, un souhait posé sur une veille de férié était refusé en silence. */
    if(SOUHAIT_PLAFOND.has(id)&&_di?.isVjf&&!isSouhaitDe(id,date)) return true;
    // (Fix A2) souhait_plafond : jamais de week-end ni de férié — le complément des
    // mardis perdus ne peut tomber qu'en semaine. Vendredi bloqué aussi (unité VD).
    if(SOUHAIT_PLAFOND.has(id)&&(_dw===0||_dw===5||_dw===6||_di?.isFerie)) return true;
    // Plafond souhaits : un MAR plafonné ne dépasse JAMAIS sa cible totale.
    if(SOUHAIT_PLAFOND.has(id)&&cnt[id]&&cible[id]&&cnt[id].total>=cible[id].total) return true;
    return false;
  }

  /* (LOT C · 01/09/2026) POURQUOI CE MAR NE PEUT-IL PAS PRENDRE CETTE GARDE ? — récit : docs/JOURNAL-Planning-Med.md §115 */
  const _LIB_ABS={INDISPO:'indisponible ce jour-là',VAC:'en vacances',FORM:'en formation',
                  TP:'temps partiel posé ce jour-là',CL:'congé long',CTP:'congé temps partiel'};
  function motifBlocage(id,date,_relaxJS,_sansAbsence){
    /* ORDRE DÉLIBÉRÉMENT DIFFÉRENT de indispoIndividuelle() : le PROFIL est
       testé en premier. Un MAR qui ne prend jamais de week-end et qui se trouve
       aussi en vacances doit apparaître « hors dispositif », jamais « à faire
       revenir de vacances » — le faire revenir ne débloquerait rien. L'ordre
       ne change pas le VERDICT (tous ces tests rendent bloqué), seulement la
       colonne où le MAR est rangé. Le banc vérifie l'équivalence booléenne. */
    const _dd=FLAGS.dateDebut[id], _df=FLAGS.dateFin[id];
    if(_dd&&date<_dd) return {classe:'profil',texte:'pas encore arrivé dans le service'};
    if(_df&&date>=_df) return {classe:'profil',texte:'a quitté le service'};
    if(estSemaineOff(id,date)) return {classe:'profil',texte:'semaine off (rythme deux semaines sur deux)'};
    const _tpF=FLAGS.tpJoursFixes[id];
    if(_tpF&&_tpF.has(new Date(date+'T12:00:00').getDay())) return {classe:'profil',texte:'jour de la semaine jamais travaillé'};
    const _di=dayByDate[date];
    const _dw=_di?_di.dow:new Date(date+'T12:00:00').getDay();
    if(NO_WEEKEND.has(id)&&(_dw===0||_dw===6||_di?.isFerie)) return {classe:'profil',texte:'jamais de week-end ni de férié'};
    if(SOUHAIT_PLAFOND.has(id)&&_di?.isVjf&&!isSouhaitDe(id,date)) return {classe:'profil',texte:'régime à part : pas de veille de férié non souhaitée'};
    if(SOUHAIT_PLAFOND.has(id)&&(_dw===0||_dw===5||_dw===6||_di?.isFerie)) return {classe:'profil',texte:'régime à part : pas de vendredi, week-end ni férié'};
    if(SOUHAIT_PLAFOND.has(id)&&cnt[id]&&cible[id]&&cnt[id].total>=cible[id].total) return {classe:'profil',texte:'régime à part : a déjà atteint son nombre de gardes'};
    if(REA1_NUIT[id]&&REA1_NUIT[id].has(date)) return {classe:'profil',texte:'semaine Réa 1 (en réanimation du lundi au vendredi)'};
    const s=indispos[id]?.[date];
    /* `_sansAbsence` : « et si on retirait cette absence, serait-il libre ? »
       C'est la question qui décide si un MAR est un LEVIER ou un faux espoir.
       Proposer de faire revenir quelqu'un qui serait de toute façon en repos de
       garde enverrait le comité négocier un congé pour rien. */
    if(s&&_LIB_ABS[s]&&!_sansAbsence) return {classe:'immediat',texte:_LIB_ABS[s],code:s};
    if(s==='RG_TRANSITION') return {classe:'planning',texte:'repos de sa garde du 31 décembre'};
    if(indispos[id]?.[addOneDay(date)]==='TP') return {classe:'immediat',texte:'libre, mais a posé un temps partiel LE LENDEMAIN (le repos de garde ne peut pas s\'y écrire)',code:'TP_LENDEMAIN'};
    /* `_sansAbsence` : rendre un jour d'un bloc de vacances suppose de rendre aussi
       le lendemain (le repos). On ne déclasse donc pas ce MAR en « bloqué » : il
       reste un levier, comme avant la règle du 20/10/2026. */
    if(!_sansAbsence&&absenceLendemain(id,date)){ const _sl=indispos[id]?.[addOneDay(date)];
      return {classe:'immediat',texte:'libre, mais '+(_sl==='VAC'?'en vacances':_sl==='FORM'?'en formation':'en congé long')+' LE LENDEMAIN (le repos de garde ne peut pas tomber sur ce jour)',code:'ABS_LENDEMAIN'}; }
    if(rgSet[id].has(date)) return {classe:'planning',texte:'repos de sa garde de la veille'};
    if(rSet[id]?.has(date)) return {classe:'planning',texte:'récupération de samedi posée ce jour'};
    const _lend=addOneDay(date);
    if(gSet[id]?.has(_lend)||g2Set[id]?.has(_lend)) return {classe:'planning',texte:'de garde le lendemain'};
    if(_di&&!_relaxJS){
      if(_di.dow===6){const thu=toDateStr(new Date(new Date(date+'T12:00:00').getTime()-2*86400000)),tdi=dayByDate[thu];
        if(tdi&&!tdi.isFerie&&(gSet[id]?.has(thu)||g2Set[id]?.has(thu))) return {classe:'planning',texte:'de garde le jeudi précédent'};}
      if(_di.dow===4&&!_di.isFerie){const sat=toDateStr(new Date(new Date(date+'T12:00:00').getTime()+2*86400000));
        if(gSet[id]?.has(sat)||g2Set[id]?.has(sat)) return {classe:'planning',texte:'de garde le samedi suivant'};}
    }
    return null;
  }

  /* (LOT C) LE DIAGNOSTIC D'UN JOUR SANS BINÔME — tout ce que le comité doit
     savoir pour le régler, et rien d'autre. Rend une structure ; la mise en
     phrases est faite par _messageJoursVides_ juste après. */
  const _JN=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const _MN=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  function _fmtJour_(ds){const d=new Date(ds+'T12:00:00');return _JN[d.getDay()]+' '+d.getDate()+' '+_MN[d.getMonth()]+' '+d.getFullYear();}
  function _diagnostiquerJourVide_(date){
    const g=gardes[date]||{};
    const dejaPlaces=[g.g,g.g2].filter(Boolean);
    const immediats=[],planningC=[],profil=[],libres=[];
    gardeDoctors.forEach(id=>{
      if(dejaPlaces.indexOf(id)>=0) return;
      const m=motifBlocage(id,date);
      if(!m){libres.push(id);return;}
      const e={mar:id,texte:m.texte,code:m.code||null};
      /* Une absence dont le retrait ne suffirait pas n'est PAS un levier :
         elle descend dans le bloc « bloqués par le planning », avec sa vraie
         raison — celle qui resterait une fois le congé rendu. */
      if(m.classe==='immediat'&&m.code&&m.code!=='TP_LENDEMAIN'&&m.code!=='ABS_LENDEMAIN'){
        const reste=motifBlocage(id,date,false,true);
        if(reste){ planningC.push({mar:id,texte:m.texte+', et de toute façon '+reste.texte,code:null}); return; }
      }
      if(m.classe==='immediat')      immediats.push(e);
      else if(m.classe==='planning') planningC.push(e);
      else                           profil.push(e);
    });
    /* ⚠️ NE JAMAIS écrire ici que le vendredi et le dimanche demandent le même
       binôme. C'est vrai en régime normal, c'est FAUX au moment où ce message
       s'écrit : un dimanche ne peut arriver vide que si l'unité VD a DÉJÀ été
       rompue plus haut (« VD exception » — moins de deux personnes libres les
       deux jours), et le dimanche est alors placé seul. Réclamer ici quelqu'un
       de libre les deux jours enverrait le comité chercher une contrainte que
       le générateur venait d'abandonner. Arbitrage le responsable du 01/09/2026 : en
       cas de galère franche, le binôme VD se casse. Seule compte la
       disponibilité de CE jour-là. */
    const _dw=new Date(date+'T12:00:00').getDay();
    const vdRompu=(_dw===5||_dw===0);
    return {date:date, libelle:_fmtJour_(date), manque:2-dejaPlaces.length,
            aLiberer:Math.max(0,(2-dejaPlaces.length)-libres.length),
            dejaPlaces:dejaPlaces, libres:libres, vdRompu:vdRompu,
            immediats:immediats, planning:planningC, profil:profil};
  }
  function _messageJoursVides_(detail){
    /* (01/09/2026) VERSION COURTE — récit : docs/JOURNAL-Planning-Med.md §116 */
    /* [singulier, pluriel] — et l'ORDRE d'affichage va du plus facile à
       retirer au plus coûteux : une indisponibilité se reprend d'un clic, un
       congé validé au staff se renégocie. */
    const LIB = {INDISPO:['indisponibilité','indisponibilités'],
                 TP_LENDEMAIN:['temps partiel posé LE LENDEMAIN','temps partiels posés LE LENDEMAIN'],
                 ABS_LENDEMAIN:['absence posée LE LENDEMAIN','absences posées LE LENDEMAIN'],
                 FORM:['jour de formation','jours de formation'],
                 VAC:['jour de vacances','jours de vacances'],
                 CL:['congé long','congés longs'], CTP:['congé','congés'],
                 TP:['temps partiel','temps partiels']};
    const ORDRE = ['INDISPO','TP_LENDEMAIN','ABS_LENDEMAIN','FORM','VAC','CTP','TP','CL'];
    const L=[];
    L.push('❌ GÉNÉRATION IMPOSSIBLE — '+detail.length+' jour'+(detail.length>1?'s':'')+' sans binôme de garde.');
    L.push('Rien n\'a été écrit : aucun onglet, aucune notification. Corrigez et relancez.');
    detail.forEach(function(o){
      L.push('');
      L.push('■ '+o.libelle.toUpperCase()+' — '+o.libres.length+' disponible sur 2. À libérer : '+o.aLiberer+'.');
      const parCode={};
      o.immediats.forEach(function(x){
        const k=x.code||'AUTRE';
        (parCode[k]=parCode[k]||[]).push(x.mar);
      });
      const cles=Object.keys(parCode).sort(function(a,b){return ORDRE.indexOf(a)-ORDRE.indexOf(b);});
      if(!cles.length) L.push('   Aucune absence à retirer ce jour-là : agir sur les jours voisins.');
      cles.forEach(function(k){
        const n=parCode[k].length, lib=LIB[k]||['absence','absences'];
        L.push('   ▸ '+n+' '+(n>1?lib[1]:lib[0])+' : '+parCode[k].join(', '));
      });
      if(o.planning.length) L.push('   (bloqués par le planning : '+o.planning.map(function(x){return x.mar;}).join(', ')+')');
    });
    L.push('');
    L.push('Après correction, le planning est recalculé entièrement : d\'autres jours peuvent apparaître.');
    return L.join('\n');
  }

  // (10/10/2026) Le week-end (ven/sam/dim) qui contient `date` porte-t-il un souhait de `id` ?
  // Un week-end se demande souvent par un seul de ses jours (le vendredi pour un VD).
  function weSouhaite(id,date){
    const _d=dayByDate[date]; if(!_d) return false;
    const off={5:[0,1,2],6:[-1,0,1],0:[-2,-1,0]}[_d.dow]; if(!off) return false;
    const _b=new Date(date+'T12:00:00');
    return off.some(k=>{const _x=new Date(_b);_x.setDate(_b.getDate()+k);return isSouhaitDe(id,toDateStr(_x));});
  }

  /* (23/10/2026) JAMAIS 3 GARDES SUR 6 JOURS GLISSANTS. Règle du responsable :
     « 2 gardes en 3 jours doit être le pire schéma » — garde, repos, garde (le
     vendredi-dimanche par exemple), puis au moins 4 jours avant la suivante.
     Constaté sur la simulation 2027 : ven. 15, dim. 17, mar. 19 et jeu. 21/10
     pour le même MAR, à cheval sur deux semaines (la limite par semaine ne le
     voyait pas). Règle dure, jamais relâchée, même en dernier recours.
     `ajout` = la ou les nuits qu'on s'apprête à poser (2 pour un vendredi-dimanche).
     Seule exception : le MAR a souhaité lui-même toutes les gardes de la fenêtre
     (un vendredi ou un dimanche souhaité vaut pour les deux nuits du week-end :
     elles vont ensemble). */
  const DENSITE_MAX = 2, DENSITE_FENETRE = 6;
  function souhaitDense(id,ds){
    if(isSouhaitDe(id,ds)) return true;
    const w=dayByDate[ds]?.dow, b=new Date(ds+'T12:00:00');
    const autre=n=>{const x=new Date(b);x.setDate(b.getDate()+n);return toDateStr(x);};
    return (w===5&&isSouhaitDe(id,autre(2)))||(w===0&&isSouhaitDe(id,autre(-2)));
  }
  /* (24/10/2026) VITESSE — même verdict, sans conversions de dates. Mesuré : la
     version d'origine (gardée plus bas en secours) prenait 69 % du temps d'une
     génération (9,7 s sur 14 s), en refabriquant 66 dates par appel. On lit ici
     les jours par leur rang dans l'année. Les gardes ne se posent que sur les
     jours de l'année : une fenêtre qui en déborde se lit comme vide au-delà.
     Le banc compare les deux versions planning par planning. */
  const _rangJour={}; allDays.forEach((d,i)=>{_rangJour[d.date]=i;});
  function tropDense(id,ajout){
    const gs=gSet[id], g2=g2Set[id], N=allDays.length, set=new Set(ajout);
    for(const a of ajout){ if(_rangJour[a]===undefined) return _tropDenseLent(id,ajout); }
    const has=k=>{ if(k<0||k>=N) return false; const ds=allDays[k].date; return set.has(ds)||(gs&&gs.has(ds))||(g2&&g2.has(ds)); };
    for(const a of ajout){
      const i=_rangJour[a], F=DENSITE_FENETRE;
      const occ=[]; for(let k=i-(F-1);k<=i+(F-1);k++) occ.push(has(k));
      for(let deb=0;deb<F;deb++){
        let n=0; for(let k=deb;k<deb+F;k++) if(occ[k]) n++;
        if(n>DENSITE_MAX){
          const jours=[]; for(let k=deb;k<deb+F;k++) if(occ[k]) jours.push(allDays[i-(F-1)+k].date);
          if(!jours.every(ds=>souhaitDense(id,ds))) return true;
        }
      }
    }
    return false;
  }
  function _tropDenseLent(id,ajout){
    const set=new Set(ajout);
    const has=ds=>set.has(ds)||gSet[id]?.has(ds)||g2Set[id]?.has(ds);
    for(const a of ajout){
      const b=new Date(a+'T12:00:00');
      for(let deb=-(DENSITE_FENETRE-1);deb<=0;deb++){
        const jours=[];
        for(let k=0;k<DENSITE_FENETRE;k++){const x=new Date(b);x.setDate(b.getDate()+deb+k);const xs=toDateStr(x);if(has(xs))jours.push(xs);}
        if(jours.length>DENSITE_MAX && !jours.every(ds=>souhaitDense(id,ds))) return true;
      }
    }
    return false;
  }

  function blocked(id,date,_relaxJS){
    if(indispoIndividuelle(id,date)) return true;
    if(rgSet[id].has(date)||rSet[id]?.has(date)) return true;
    const _lend=addOneDay(date);
    if(gSet[id]?.has(_lend)||g2Set[id]?.has(_lend)) return true; // jamais 2 gardes d'affilée, même si la garde du lendemain est déjà posée (souhait/VD hors ordre chrono)
    // Combo jeudi-samedi interdit (hors jeudi férié couplé)
    const _di=dayByDate[date];
    if(_di&&!_relaxJS){
      if(_di.dow===6){const thu=toDateStr(new Date(new Date(date+'T12:00:00').getTime()-2*86400000)),tdi=dayByDate[thu];
        if(tdi&&!tdi.isFerie&&(gSet[id]?.has(thu)||g2Set[id]?.has(thu))) return true;}
      if(_di.dow===4&&!_di.isFerie){const sat=toDateStr(new Date(new Date(date+'T12:00:00').getTime()+2*86400000));
        if(gSet[id]?.has(sat)||g2Set[id]?.has(sat)) return true;}
    }
    /* (05/09/2026) DEUX WEEK-ENDS DE GARDE D'AFFILÉE — récit : docs/JOURNAL-Planning-Med.md §117 */
    if(NOUVEL_ALGO && _di && !_relaxJS && (_di.dow===5||_di.dow===6||_di.dow===0)){
      const _b=new Date(date+'T12:00:00');
      for(let _n=-9;_n<=9;_n++){
        if(_n>=-4&&_n<=4) continue;                 // le week-end courant lui-même
        const _x=new Date(_b); _x.setDate(_b.getDate()+_n);
        const _xs=toDateStr(_x), _dx=dayByDate[_xs];
        if(!_dx) continue;
        if(_dx.dow!==5&&_dx.dow!==6&&_dx.dow!==0) continue;
        /* (10/10/2026) Deux week-ends d'affilée restent interdits… SAUF si le MAR
           a lui-même souhaité les deux. L'algorithme ne les enchaîne jamais de
           lui-même ; il ne refuse plus ce qu'on lui demande explicitement. */
        if((gSet[id]?.has(_xs)||g2Set[id]?.has(_xs)) && !(weSouhaite(id,date)&&weSouhaite(id,_xs))) return true;
      }
    }
    if(tropDense(id,[date])) return true;
    return false;   // le reste est dans indispoIndividuelle() — source unique
  }

  // ── 7. Fonctions de score ─────────────────────────────────────────────
  // ratio(axe) = (réel + dette) / cible → on choisit le ratio le plus bas
  function ratio(id,axis){
    const c=cnt[id][axis]+(dette[id]?.[axis]||0);
    const cb=cible[id][axis];
    return cb>0?c/cb:999;
  }
  function ratioTotal(id){
    const c=cnt[id].total+(dette[id]?.total||0);
    return cible[id].total>0?c/cible[id].total:999;
  }
  // Lissage : pénalise une garde proche (hors adjacence J±1 déjà bloquée).
  // J±2 = le "1j/2" avec le RG (et jeudi→samedi) → forte ; J±3/J±4 → légère.
  // clé de semaine = lundi ISO, PRÉ-CALCULÉE dans dayByDate[date].wk (zéro parsing Date)
  const weekKey = ds => dayByDate[ds]?.wk;
  const weekLoad = (id,date) => {                       // O(1) via compteur incrémental
    let n=(weekCnt[id][dayByDate[date].wk]||0)-(weekCntS[id][dayByDate[date].wk]||0); // (Fix A3) hors souhaits
    if((gSet[id]?.has(date)||g2Set[id]?.has(date))&&!isSouhaitLibre(id,date)) n--;  // exclure la date elle-même si déjà posée
    return n;
  };
  function spacingPenalty(id, date){
    // (VDM) dimanche→mardi non souhaité = DERNIER RECOURS : pénalité écrasante,
    // le candidat ne passe que si la couverture du jour l'exige (la couverture prime tout).
    let vdm=0;
    { const _dw=new Date(date+'T12:00:00').getDay();
      if(_dw===2&&!isSouhaitLibre(id,date)){
        const dim=toDateStr(new Date(new Date(date+'T12:00:00').getTime()-2*86400000));
        if(gSet[id]?.has(dim)||g2Set[id]?.has(dim)) vdm=5000;
      } else if(_dw===0){
        const mar=toDateStr(new Date(new Date(date+'T12:00:00').getTime()+2*86400000));
        if((gSet[id]?.has(mar)||g2Set[id]?.has(mar))&&!isSouhaitLibre(id,mar)) vdm=5000;
      } }
    const has = n => {
      const x = new Date(date + 'T12:00:00'); x.setDate(x.getDate() + n);
      const ds = toDateStr(x);
      if(!((gSet[id] && gSet[id].has(ds)) || (g2Set[id] && g2Set[id].has(ds)))) return 0;
      return isSouhaitLibre(id,ds) ? 2 : 1; // (Fix A3) voisin souhaité = pénalité réduite, pas nulle
    };
    let p=0;
    const lv=(a,b)=>Math.max(has(a),has(b)); // 1=garde normale, 2=garde-souhait
    let v=lv(-2,2); if(v===1)p+=100; else if(v===2)p+=10;
    v=lv(-3,3);     if(v===1)p+=10;  else if(v===2)p+=2;
    v=lv(-4,4);     if(v===1)p+=1;
    p+=vdm; // (VDM)
    const wl=weekLoad(id,date);      // >2 gardes/semaine à éviter (souple)
    if(wl>=2) p+=80;                 // ce serait la 3e (ou +)
    if(wl>=3) p+=200;
    return p;
  }
  const monthOver=(id,date)=>{ const m=Number(date.slice(5,7)); return Math.max(0,(monthCnt[id][m]||0)-(monthExp[id][m]||0)); };
  // Score de SÉLECTION (sans distinction G/G2) :
  //   [espacement, ratio axe du jour, lissage mensuel, ratio total, total brut]
  function scoreSelect(id,dow,isVjf,date){
    const space=spacingPenalty(id,date); // lissage : prime sur l'équité (tue jeudi→samedi + 1j/2)
    const prim=dow===6?[ratio(id,'sam')]:dow===4?[ratio(id,'jeu')]:[];
    if(isVjf) prim.push(ratio(id,'vjf'));
    if(dayByDate[date]?.isFerie) prim.push(ratio(id,'ferie'));
    return [space].concat(prim).concat([Math.round(monthOver(id,date)*100)/100,ratioTotal(id),cnt[id].total]);
  }
  function scoreVD(id,fri,sun){
    let wpen=(weekLoad(id,fri)>=1||weekLoad(id,sun)>=1)?80:0; // VD = ven+dim : éviter une 3e garde la même semaine
    // (VDM) mardi non souhaité déjà en garde à J+2 du dimanche → dernier recours
    { const mar=toDateStr(new Date(new Date(sun+'T12:00:00').getTime()+2*86400000));
      if((gSet[id]?.has(mar)||g2Set[id]?.has(mar))&&!isSouhaitLibre(id,mar)) wpen+=5000; }
    return [wpen,ratio(id,'vd'),ratioTotal(id),cnt[id].g+cnt[id].g2];
  }
  function cmp(a,b){for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i];}return 0;}
  // Attribution des rôles G/G2 entre 2 MARs : celui qui a le moins de G prend G
  function assignRoles(A,B){
    if((cnt[A].g-cnt[A].g2)<=(cnt[B].g-cnt[B].g2)) return [A,B];
    return [B,A];
  }

  function assign(date,g,g2,dow){
    gardes[date]={g,g2};
    assignDow[date]=dow;
    [[g,false],[g2,true]].forEach(([id,isg2])=>{
      if(!id) return;
      if(isg2){g2Set[id].add(date);cnt[id].g2++;}else{gSet[id].add(date);cnt[id].g++;}
      rgSet[id].add(addOneDay(date));
      cnt[id].total++;
      const KEYS=['dim','lun','mar','mer','jeu','ven','sam'];
      // (Fix v2) SEUL le jeudi férié couplé = JF seul (pas de WE de 3 j → pas un "jeudi").
      // Le lundi férié reste un LUNDI (+JF) ; le samedi (même férié) reste un SAMEDI + récup R.
      const _diA=dayByDate[date], _coupledF=_diA&&_diA.isFerie&&_diA.dow===4;
      if(!_coupledF){
        cnt[id][KEYS[dow]]++;
        if(dow===6){cnt[id].recupR++;recupDue[id].push(date);}
      }
      if(dayByDate[date]?.isVjf)cnt[id].vjf++;
      const _rdow=dayByDate[date]?.dow;
      if(dayByDate[date]?.isFerie&&(_rdow===2||_rdow===3))cnt[id].ferie++;
      if(dayByDate[date]?.isFerie)cnt[id].jf++; // total fériés (couplages inclus)
      const _wk=dayByDate[date]?.wk;
      if(_wk!==undefined){weekCnt[id][_wk]=(weekCnt[id][_wk]||0)+1;
        if(isSouhaitLibre(id,date)) weekCntS[id][_wk]=(weekCntS[id][_wk]||0)+1;} // (Fix A3)
      const _m=Number(date.slice(5,7)); monthCnt[id][_m]=(monthCnt[id][_m]||0)+1;
    });
  }

  // ── 8. Placement ─────────────────────────────────────────────────────
  const gardes={};
  const assignDow={}; // (optim) axe-jour de chaque date (couplages fériés : 6)
  const warnings=[];
  rea1Msgs.forEach(m=>warnings.push(m));   // (24/10/2026) semaines Réa 1

  // ── 7bis. NOËL / JOUR DE L'AN — rotation pluriannuelle ───────────────
  // 4 dates (24/12, 25/12, 31/12, 01/01) = 8 MAR/an. Priorité = jamais fait
  // puis le plus ancien. ≤ 1 jour/MAR/an. Profils souhait_plafond exemptés. Les couplages (VD
  // ven/dim, jeudi/lundi férié ↔ samedi) sont respectés : le binôme de
  // rotation possède toute l'unité liée. Historique = onglet NOEL_AN_HISTORIQUE.
  const noelDatesAssigned=new Set();
  const noelAssignees={};
  {
    // Rotation Noël/An : dernière année où chacun a fait Noël/An.
    // Source unique getNoelHistory(year) = HISTORIQUE (années archivées) ∪ onglets
    // GARDES_{Y} présents (années générées non encore archivées, Y < year). Corrige
    // le décalage d'un an : sans ça, générer N ré-attribuerait Noël à la personne
    // qui fait déjà Noël N-1.
    const noelHistory = getNoelHistory(year);

    const shiftD=(d,n)=>toDateStr(new Date(new Date(d+'T12:00:00').getTime()+n*86400000));
    let noelDates=[];
    [year,year+1].forEach(y=>[`${y}-12-24`,`${y}-12-25`,`${y}-12-31`,`${y+1}-01-01`].forEach(dn=>{
      if(dayByDate[dn]&&(dn.startsWith(String(year))||dn===`${year+1}-01-01`)) noelDates.push(dn);
    }));
    noelDates=[...new Set(noelDates)].filter(d=>dayByDate[d]).sort();

    const noelUnit=(date)=>{
      const di=dayByDate[date],dow=di.dow,u=[date];
      if(dow===5) u.push(shiftD(date,2));                       // VD vendredi → dimanche
      else if(dow===0) u.push(shiftD(date,-2));                 // VD dimanche → vendredi
      else if(di.isFerie&&dow===4) u.push(shiftD(date,2));      // jeudi férié → samedi (JS)
      else if(di.isFerie&&dow===1) u.push(shiftD(date,-2));     // lundi férié → samedi (SL)
      else if(dow===6){                                         // samedi couplé à un férié ?
        const thu=shiftD(date,-2),mon=shiftD(date,2);
        if(dayByDate[thu]?.isFerie&&dayByDate[thu].dow===4) u.push(thu);
        if(dayByDate[mon]?.isFerie&&dayByDate[mon].dow===1) u.push(mon);
      }
      return [...new Set(u)].filter(d=>dayByDate[d]).sort();
    };
    const canHoldUnit=(m,unit)=>unit.every(d=>!blocked(m,d))&&!tropDense(m,unit);
    const assignUnit=(unit,A,B)=>{
      const [g,gg]=assignRoles(A,B);
      const hasFri=unit.some(d=>dayByDate[d].dow===5);
      unit.forEach(d=>{
        const dw=dayByDate[d].dow;
        const adow=dw; // vrai jour ; le jeudi férié couplé est exclu via _coupledF dans assign()
        assign(d,g,gg,adow); noelDatesAssigned.add(d);
      });
      if(hasFri){cnt[g].vd++;cnt[gg].vd++;}
    };
    // ── (COUVERTURE) Choix sensible au voisinage ──────────────────────
    // Poser un binôme sur une date de Noël bloque ses 2 membres la veille, le
    // lendemain et via le combo jeudi↔samedi. Sur la semaine de Noël, le vivier
    // des jours voisins est minuscule : consommer la mauvaise personne le 24 rend
    // le 25 ou le 26 insolubles (constaté : 25/12/2037, 25/12/2039). On prend
    // donc, DANS L'ORDRE DE LA ROTATION, la première paire qui laisse ≥ 2
    // disponibles sur chaque jour voisin non encore pourvu. Si aucune paire ne
    // convient, on garde le choix historique (comportement antérieur inchangé).
    const bloqueraitSur=(dd,unit)=>unit.some(ud=>{
      if(dd===ud) return true;
      if(dd===shiftD(ud,1)||dd===shiftD(ud,-1)) return true;             // veille / lendemain
      const dU=dayByDate[ud],dD=dayByDate[dd];
      if(dU&&dD){
        if(dU.dow===4&&!dU.isFerie&&dD.dow===6&&dd===shiftD(ud,2)) return true;  // jeu→sam
        if(dU.dow===6&&dD.dow===4&&!dD.isFerie&&dd===shiftD(ud,-2)) return true; // sam→jeu
      }
      return false;
    });
    const preserveVoisins=(pair,unit)=>{
      const d0=shiftD(unit[0],-2),d1=shiftD(unit[unit.length-1],2);
      for(let dd=d0;dd<=d1;dd=shiftD(dd,1)){
        if(!dayByDate[dd]||gardes[dd]||unit.indexOf(dd)>=0) continue;
        const gene=bloqueraitSur(dd,unit);
        const pool=gardeDoctors.filter(id=>!blocked(id,dd)&&!(gene&&pair.indexOf(id)>=0));
        if(pool.length<2) return false;
      }
      return true;
    };
    const choisirPaire=(liste,unit)=>{
      // (07/09/2026) INCHANGÉ. La règle des paires à éviter ne s'applique PAS ici :
      // les dates de Noël/An sont exemptées (cf. DATES_EXEMPTES en tête de fonction).
      // Le tour de Noël reste réglé par la seule ancienneté.
      for(let i=0;i<liste.length;i++)
        for(let j=i+1;j<liste.length;j++)
          if(preserveVoisins([liste[i],liste[j]],unit)) return [liste[i],liste[j]];
      return [liste[0],liste[1]];   // aucune paire ne préserve tout : choix antérieur
    };
    const overdueKey=(m)=>{const ly=noelHistory[m]; return ly==null?[0,0,m]:[1,ly,m];};
    const cmpKey=(a,b)=>a[0]-b[0]||a[1]-b[1]||(a[2]<b[2]?-1:a[2]>b[2]?1:0);

    const noelDone=new Set();
    noelDates.forEach(date=>{
      if(gardes[date]) return;
      const unit=noelUnit(date);
      let cands=gardeDoctors.filter(m=>!SOUHAIT_PLAFOND.has(m)&&!noelDone.has(m)&&canHoldUnit(m,unit));
      if(cands.length<2) cands=gardeDoctors.filter(m=>!SOUHAIT_PLAFOND.has(m)&&canHoldUnit(m,unit));
      cands.sort((a,b)=>cmpKey(overdueKey(a),overdueKey(b)));
      if(cands.length<2){
        // Repli : aucun binôme ne peut tenir l'UNITÉ complète (VD vendredi↔dimanche ou
        // couplage férié). Plutôt que de laisser la date de Noël NON POURVUE — et de
        // laisser le placement chronologique consommer entre-temps les dernières
        // personnes disponibles — on place la date SEULE, exactement comme la
        // « VD exception » du placement chronologique. Le jour couplé sera pourvu
        // normalement par la suite.
        const seule=gardeDoctors.filter(m=>!SOUHAIT_PLAFOND.has(m)&&!blocked(m,date));
        seule.sort((a,b)=>cmpKey(overdueKey(a),overdueKey(b)));
        if(seule.length>=2){
          const [sA,sB]=choisirPaire(seule,[date]);
          const [gA,gB]=assignRoles(sA,sB);
          assign(date,gA,gB,dayByDate[date].dow);      // pas de cnt.vd : l'unité est rompue
          noelDatesAssigned.add(date); noelAssignees[date]=[sA,sB];
          noelDone.add(sA); noelDone.add(sB);
          warnings.push(`NOEL/AN ${date} : unité non tenable, date placée seule (repli)`);
          return;
        }
        warnings.push(`NOEL/AN ${date} : <2 dispo`);return;}
      const [A,B]=choisirPaire(cands,unit);
      assignUnit(unit,A,B); noelAssignees[date]=[A,B];
      noelDone.add(A);noelDone.add(B);
    });
    if(Object.keys(noelAssignees).length)
      Logger.log('Noël/An: '+Object.entries(noelAssignees).map(([d,ab])=>`${d}:${ab.join('+')}`).join(' | '));
  }

  // ── 7ter. JOURS CRITIQUES — pourvus AVANT tout le reste ───────────────
  // Un jour non pourvu est le SEUL défaut vraiment grave : il laisse le service sans
  // binôme. Les jours où très peu de MAR sont disponibles (semaine de Noël, ponts)
  // sont donc résolus EN PREMIER, par recherche exhaustive sur la série, avant que le
  // placement chronologique n'ait consommé les rares personnes disponibles.
  //
  // Pourquoi c'est nécessaire : sur une série de jours serrés, le placement glouton
  // choisit chaque jour le meilleur binôme selon l'équité, et épuise ainsi le vivier
  // du lendemain. Un humain, lui, fait alterner deux binômes sur la période — c'est
  // exactement ce que cette passe reproduit.
  //
  // Périmètre volontairement étroit : uniquement les jours SIMPLES (ni vendredi, ni
  // dimanche, ni férié couplé), pour ne pas interférer avec les unités VD et les
  // couplages fériés, qui ont leur propre logique éprouvée. Mesuré : ~1 jour par an.
  {
    const SEUIL_CRIT = 4;                       // vivier au-delà duquel il n'y a pas de risque
    // Nombre de jours de l'année où chaque MAR est structurellement disponible.
    const dispoAn = {}; gardeDoctors.forEach(id => dispoAn[id] = 0);
    allDays.forEach(d => gardeDoctors.forEach(id => { if (!blocked(id, d.date)) dispoAn[id]++; }));
    // Périmètre : ni vendredi, ni dimanche (unité VD), ni férié couplé — ET NI SAMEDI.
    // Un samedi placé ici bloque le vendredi et le dimanche encadrants (veille et
    // lendemain de garde) : il casse l'unité week-end de la personne retenue, qui ne
    // rattrape jamais son axe VD. Cause mesurée du décrochage de 2041 (−5,3).
    const simple = d => d.dow!==5 && d.dow!==0 && !(d.isFerie && (d.dow===1||d.dow===4));
    const poolOf = ds => gardeDoctors.filter(id => !blocked(id, ds));
    // 1) repérer les jours critiques encore libres (Noël/An est déjà posé)
    const crit = allDays.filter(d => !gardes[d.date] && simple(d) && poolOf(d.date).length <= SEUIL_CRIT);
    if (crit.length) {
      // 2) regrouper en séries de jours consécutifs
      const series = []; let cur = [];
      crit.forEach(d => {
        // helper local : shiftD est déclaré en const DANS le bloc 7bis, donc hors de portée ici
        const _j1 = ds => toDateStr(new Date(new Date(ds+'T12:00:00').getTime()+86400000));
        if (cur.length && _j1(cur[cur.length-1].date) === d.date) cur.push(d);
        else { if (cur.length) series.push(cur); cur = [d]; }
      });
      if (cur.length) series.push(cur);
      // 3) résoudre chaque série exhaustivement : 2 MAR par jour, jamais 2 jours de suite
      series.forEach(serie => {
        // Ordre de préférence : les MAR les MOINS souvent disponibles dans l'année
        // d'abord. Ils ont peu d'occasions de faire leur part ; les utiliser sur les
        // jours tendus préserve la marge de manœuvre des autres — et donc l'équité
        // globale, que les compteurs (encore vides à ce stade) ne peuvent pas guider.
        // Ordre de parcours : ÉQUITÉ d'abord (classement standard du moteur), la
        // disponibilité annuelle ne servant plus que de départage. L'ordre inverse —
        // retenu dans la première version — écrasait l'équité : il consommait sur les
        // jours tendus des MAR qui devaient faire des week-ends, sans rattrapage
        // possible (écart week-end mesuré : 5,3 gardes contre 3,5 pour le moteur
        // d'origine, sur 140 années simulées).
        const faire = relax => serie.map(d => {
          const p = gardeDoctors.filter(id => !blocked(id, d.date, relax));
          p.sort((a,b)=> cmp(scoreSelect(a,d.dow,d.isVjf,d.date), scoreSelect(b,d.dow,d.isVjf,d.date)) || (dispoAn[a]-dispoAn[b]));
          return p;
        });
        // Coût d'équité d'une affectation : plus le MAR est EN RETARD sur l'axe du jour
        // et au total, plus le coût est bas — donc plus il est légitime de la lui donner.
        const coutJour = (id,d) => ratio(id, (d.dow===4 && !d.isFerie) ? 'jeu' : (d.isVjf ? 'vjf' : 'total')) + ratioTotal(id);
        let pools = faire(false), relache = false;
        // On ne s'arrête PAS à la première solution : on énumère (sous borne dure) et on
        // retient la MOINS COÛTEUSE en équité. Les séries mesurées font 1 à 3 jours avec
        // des viviers de 3 ou 4 personnes : l'énumération est immédiate.
        const sol = [];
        let best = null, bestCout = Infinity, essais = 0;
        const MAX_ESSAIS = 20000;   // borne de sécurité : jamais d'explosion combinatoire
        const rec = (i, prev, cout) => {
          if (essais > MAX_ESSAIS) return;
          if (i === serie.length) { essais++; if (cout < bestCout) { bestCout = cout; best = sol.map(x => x.slice()); } return; }
          const p = pools[i];
          // (23/10/2026) Jamais 3 gardes sur 6 jours, y compris entre jours de la série
          // (un MAR le 1er et le 3e jour, plus une garde déjà posée à côté).
          const _dense = id => tropDense(id, sol.slice(0,i).map((x,j)=>x&&x.indexOf(id)>=0?serie[j].date:null).filter(Boolean).concat([serie[i].date]));
          for (let a=0; a<p.length; a++) {
            if (prev.indexOf(p[a]) >= 0 || _dense(p[a])) continue;
            for (let b=a+1; b<p.length; b++) {
              if (prev.indexOf(p[b]) >= 0 || _dense(p[b])) continue;
              sol[i] = [p[a], p[b]];
              /* (07/09/2026) Paire à éviter : PÉNALITÉ, pas exclusion. Sur ces séries
                 le vivier tombe à 3 ou 4 personnes ; une interdiction dure pourrait
                 rendre la série insoluble et faire échouer toute la génération. Le
                 poids (1000) dépasse tout coût d'équité imaginable ici (coutJour reste
                 sous 5) : dès qu'une solution sans la paire existe, elle est retenue. */
              const _pen = evite(p[a],p[b],serie[i]) ? 1000 : 0;
              rec(i+1, sol[i], cout + _pen + coutJour(p[a],serie[i]) + coutJour(p[b],serie[i]));
              if (essais > MAX_ESSAIS) return;
            }
          }
          sol[i] = null;
        };
        rec(0, [], 0);
        let trouve = !!best;
        if (trouve) { for (let i=0;i<serie.length;i++) sol[i] = best[i]; }
        if (!trouve) {
          // Dernier recours : on tolère le combo jeudi↔samedi (G-RG-G), jamais deux
          // gardes d'affilée. Un jour non pourvu est bien plus grave qu'une garde
          // rapprochée, et c'est exactement l'arbitrage que fait le comité à la main.
          pools = faire(true); relache = true;
          best = null; bestCout = Infinity; essais = 0;
          rec(0, [], 0);
          trouve = !!best;
          if (trouve) { for (let i=0;i<serie.length;i++) sol[i] = best[i]; }
        }
        if (trouve) {
          serie.forEach((d,i) => {
            const [A,B] = sol[i];
            const [g,g2] = assignRoles(A,B);
            assign(d.date, g, g2, d.dow);
          });
          // Le comité doit SAVOIR quand la couverture a coûté cher en équité : c'est le
          // signal qu'il faut agir en amont, sur la pose des vacances de cette période.
          const _coutMoy = bestCout / (serie.length * 2);
          warnings.push(`Couverture : ${serie[0].date}${serie.length>1?'→'+serie[serie.length-1].date:''} pourvu en priorité${relache?' (jeudi↔samedi toléré)':''}${_coutMoy>2.2?' — ⚠ choix contraint, équité dégradée : à anticiper sur la pose des vacances':''}`);
        } else {
          warnings.push(`Couverture : série ${serie[0].date} sans solution même en priorité`);
        }
      });
    }
  }

  // ── 8a. SOUHAITS — deux régimes ──────────────────────────────────────
  // Régime 1 : souhait_plafond = priorité absolue, peut dépasser sa cible.
  // Régime 2 : autres MAR = préférence de placement DANS leur cible, équitable
  //            (le moins-servi mène) ; la 2e place préfère un co-souhaiteur.
  const souhParJour={}; // date (dans l'année) -> souhaiteurs gardeDoctors
  Object.entries(souhaits).forEach(([date,ids])=>{
    if(!dayByDate[date]) return;
    souhParJour[date]=ids.filter(m=>gardeDoctors.indexOf(m)>=0);
  });
  const souhaitHonored={}; allDoctors.forEach(id=>{souhaitHonored[id]=0;}); const _slotSouhait=new Set();
  // (25/08/2026) Récapitulatif rendu au MAR : « X souhaits sur Y honorés ». On compte
  // TOUT ce qui est saisi, sans filtrer les demandes irréalistes — poser 43 samedis
  // affichera 5/43, ce qui est l'information juste.
  const souhaitPose={}; allDoctors.forEach(id=>{souhaitPose[id]=0;});
  // (25/08/2026) Le compte des souhaits honorés est fait EN FIN de génération, sur le
  // planning final (voir souhaitJoursOK plus bas) : compter à la pose ne voyait que la
  // passe des souhaits et ratait les gardes obtenues autrement — mesuré en production
  // sur un profil souhait_plafond, 43 comptés pour 45 réellement obtenus, ses mardis des 21 et 28 décembre
  // ayant été posés par la passe des jours critiques de la semaine de Noël.
  Object.keys(souhaits).forEach(ds=>{(souhaits[ds]||[]).forEach(id=>{
    if(souhaitPose[id]!==undefined) souhaitPose[id]++;
  });});

  // ── Souhaits hors lundi/mardi/mercredi (ajout du 25/08/2026) ─────────────
  // AUCUNE modification du chemin historique ci-dessous : les jours libres gardent
  // exactement leur règle (freeBudget). On AJOUTE seulement la possibilité de poser
  // un souhait sur les autres jours, sous plafond de chaque axe touché + quota.
  const shiftDays=(ds,n)=>toDateStr(new Date(new Date(ds+'T12:00:00').getTime()+n*86400000));
  // (11/10/2026) COUPLES DE WEEK-END — titulaires du vendredi-dimanche du vendredi `fri`
  // (même binôme vendredi ET dimanche), et « encore sous sa part » sur un axe.
  const _cplVDde=fri=>{ const gf=gardes[fri], gs=gardes[shiftDays(fri,2)];
    if(!gf||!gs||!dayByDate[fri]||dayByDate[fri].dow!==5) return [];
    return [gf.g,gf.g2].filter(x=>x&&(gs.g===x||gs.g2===x)); };
  const _cplSousPart=(id,ax)=>cnt[id][ax]+(dette[id]?.[ax]||0)+1<=cible[id][ax]+0.5;
  // Chemin HISTORIQUE, strictement inchangé : lundi, mardi, mercredi — y compris les
  // veilles de férié, traitées comme aujourd'hui. Seuls les lun/mar/mer FÉRIÉS en
  // sortent : posés seuls, ils brisaient le couplage samedi↔lundi férié (4 couplages
  // brisés mesurés en 2027 sur la version en production) ; ils passent désormais par
  // le nouveau chemin, qui pose l'unité complète.
  const estJourLibre=date=>{const d=dayByDate[date];return !!d&&d.dow>=1&&d.dow<=3&&!d.isFerie;};
  /* (21/10/2026) BUDGET DES SOUHAITS DE SEMAINE — ne compter QUE les gardes de
     lundi-mardi-mercredi déjà posées. Avant, le test portait sur le total des gardes :
     les jeudis, samedis et week-ends accordés en début d'année vidaient le budget, et
     les souhaits de semaine suivants étaient refusés sans raison (mesuré sur les vraies
     demandes 2027 : 102 souhaits accordés sur 144 → 113, équité inchangée). Ces jours
     rares restent limités par leur propre part (okSouhaitRare), comme le dit le guide. */
  const cntLibre=m=>{let n=0;for(const d in gardes){const g=gardes[d];if(g&&(g.g===m||g.g2===m)&&estJourLibre(d)&&!dayByDate[d].isVjf)n++;}return n;};
  // Un jour couplé emporte son unité entière (même binôme, mêmes rôles).
  const uniteDeSouhait=date=>{
    const di=dayByDate[date]; if(!di) return null;
    const u=(jours,vd)=>jours.every(d=>dayByDate[d]&&!gardes[d])?{jours,vd:!!vd}:null;
    if(di.dow===5||di.dow===0){
      const ven=di.dow===5?date:shiftDays(date,-2), dim=di.dow===5?shiftDays(date,2):date;
      return u([ven,dim],true);                                    // week-end entier
    }
    if(di.isFerie&&di.dow===4) return u([date,shiftDays(date,2)]);  // jeudi férié + samedi
    if(di.isFerie&&di.dow===1) return u([shiftDays(date,-2),date]); // samedi + lundi férié
    if(di.dow===6){
      const thu=shiftDays(date,-2),mon=shiftDays(date,2);
      if(dayByDate[thu]?.isFerie&&dayByDate[thu].dow===4) return u([thu,date]);
      if(dayByDate[mon]?.isFerie&&dayByDate[mon].dow===1) return u([date,mon]);
    }
    return u([date]);
  };
  // Coût de l'unité sur chaque axe — miroir exact du comptage d'assign().
  const coutAxesUnite=un=>{
    const c={sam:0,jeu:0,vd:un.vd?1:0,vjf:0,ferie:0,jf:0};
    un.jours.forEach(d=>{
      const di=dayByDate[d]; if(!di) return;
      const coupledF=di.isFerie&&di.dow===4;   // jeudi férié couplé : compté en JF seul
      if(!coupledF){ if(di.dow===6)c.sam++; if(di.dow===4)c.jeu++; }
      if(di.isVjf)c.vjf++;
      if(di.isFerie&&(di.dow===2||di.dow===3))c.ferie++;
      if(di.isFerie)c.jf++;
    });
    return c;
  };
  const souhaitRare={}; allDoctors.forEach(id=>{souhaitRare[id]=0;});
  // Un jour est « rare » dès qu'il touche un axe d'équité : samedi, week-end, mais
  // AUSSI férié et veille de férié — ces derniers ne comptent qu'une douzaine de dates
  // par an (part ≈ 0,5 par personne), si bien qu'un seul souhait honoré suffit à sortir
  // du vert. Mesuré en usage saturé : 34 années sur 200 au-dessus de 2 quand ils
  // étaient hors quota, contre 1 avant. Le joker couvre donc TOUTES ces familles.
  const uniteRare=un=>{const c=coutAxesUnite(un);return c.sam>0||c.vd>0||c.vjf>0||c.ferie>0||c.jf>0;};
  const okSouhaitRare=(m,un)=>{
    const c=coutAxesUnite(un);
    {const _c=coutAxesUnite(un); if((_c.vjf>0||_c.ferie>0||_c.jf>0)&&souhaitRare[m]>=SOUHAIT_QUOTA_RARE) return false;}      // joker annuel
    if(cnt[m].total+un.jours.length>cible[m].total) return false;            // jamais au-delà de sa part
    return Object.keys(c).every(a=>!c[a]
      || ((a==='jeu'||a==='sam'||a==='vd') ? cnt[m][a]<Math.floor(cible[m][a]) : cnt[m][a]<cible[m][a]));
  };
  function placeSouhaitUnite(id,un){
    const jours=un.jours, free=m=>jours.every(d=>!blocked(m,d))&&!tropDense(m,jours);
    const wish=new Set(); jours.forEach(d=>(souhParJour[d]||[]).forEach(m=>wish.add(m)));
    const dRef=jours.length>1&&!un.vd ? jours.find(d=>dayByDate[d].dow===6) : jours[0];
    const scoreU=un.vd ? (m=>scoreVD(m,jours[0],jours[1]))
                       : (m=>scoreSelect(m,dayByDate[dRef].dow,dayByDate[dRef].isVjf,dRef));
    let co=[...wish].filter(m=>m!==id&&okPaire(id,m,jours)&&!SOUHAIT_PLAFOND.has(m)&&free(m)&&okSouhaitRare(m,un));
    let partner,viaCo=false;
    if(co.length){
      co.sort((a,b)=>(souhaitHonored[a]-souhaitHonored[b])||cmp(scoreU(a),scoreU(b)));
      partner=co[0];viaCo=true;
    } else {
      // (25/08/2026) Le binôme ENTRAÎNÉ par le souhait consomme lui aussi un jour rare,
      // alors qu'il n'a rien demandé : sans contrôle de SES plafonds, il encaissait des
      // veilles de férié au-delà de sa part (mesuré en usage saturé : 32 années sur 200
      // au-dessus de 2 sur cet axe, pic à 5,1). On préfère donc un binôme qui a encore
      // de la place sur chaque axe touché ; à défaut seulement, le meilleur score.
      const tous=sansPaire(gardeDoctors.filter(m=>m!==id&&free(m)),id,jours);
      if(!tous.length){warnings.push(`SOUHAIT ${id} ${jours[0]} sans binôme`);return false;}
      const c0=coutAxesUnite(un);
      const place=m=>Object.keys(c0).every(a=>!c0[a]
        || ((a==='jeu'||a==='sam'||a==='vd') ? cnt[m][a]<Math.floor(cible[m][a]) : cnt[m][a]<cible[m][a]));
      const others=tous.filter(place).length?tous.filter(place):tous;
      others.sort((a,b)=>cmp(scoreU(a),scoreU(b)));
      partner=others[0];
    }
    // (COUVERTURE) une unité de plusieurs jours bloque le binôme alentour : on refuse
    // si un jour voisin n'a plus 2 personnes — l'équité chronologique le servira.
    if(jours.length>1){
      for(let dd=shiftDays(jours[0],-1);dd<=shiftDays(jours[jours.length-1],1);dd=shiftDays(dd,1)){
        if(!dayByDate[dd]||gardes[dd]||jours.indexOf(dd)>=0) continue;
        const pool=gardeDoctors.filter(m=>m!==id&&m!==partner&&!blocked(m,dd));
        if(pool.length<2){warnings.push(`SOUHAIT ${id} ${jours[0]} refusé : couverture du ${dd}`);return false;}
      }
    }
    if(viaCo) souhaitHonored[partner]++;
    {const _c=coutAxesUnite(un); if(_c.vjf>0||_c.ferie>0||_c.jf>0){ souhaitRare[id]++; if(viaCo) souhaitRare[partner]++; }}
    if(un.vd){cnt[id].vd++;cnt[partner].vd++;}
    jours.forEach(d=>{_slotSouhait.add(d+'|'+id); if(viaCo) _slotSouhait.add(d+'|'+partner);});
    const [g,g2]=assignRoles(id,partner);
    jours.forEach(d=>assign(d,g,g2,dayByDate[d].dow));
    return true;
  }

  function placeSouhait(id,date){
    const dow=new Date(date+'T12:00:00').getDay();
    const vjf=dayByDate[date]?.isVjf;
    let co=(souhParJour[date]||[]).filter(m=>m!==id&&okPaire(id,m,date)&&!blocked(m,date)
              &&(SOUHAIT_PLAFOND.has(m)||cntLibre(m)<freeBudget[m]));
    let partner;
    if(co.length){
      co.sort((a,b)=>(souhaitHonored[a]-souhaitHonored[b])
                     ||cmp(scoreSelect(a,dow,vjf,date),scoreSelect(b,dow,vjf,date)));
      partner=co[0]; souhaitHonored[partner]++;
    } else {
      const others=sansPaire(gardeDoctors.filter(m=>m!==id&&!blocked(m,date)),id,date);
      if(!others.length){warnings.push(`SOUHAIT ${id} ${date} sans binôme`);return false;}
      others.sort((a,b)=>cmp(scoreSelect(a,dow,vjf,date),scoreSelect(b,dow,vjf,date)));
      partner=others[0];
    }
    _slotSouhait.add(date+'|'+id); if(isSouhaitDe(partner,date)) _slotSouhait.add(date+'|'+partner);
    const [g,g2]=assignRoles(id,partner);
    assign(date,g,g2,dow);
    return true;
  }

  // Régime 1 — souhait_plafond : priorité absolue
  gardeDoctors.filter(id=>SOUHAIT_PLAFOND.has(id)).forEach(id=>{
    Object.keys(souhParJour).filter(date=>souhParJour[date].indexOf(id)>=0).sort().forEach(date=>{
      if(gardes[date]||blocked(id,date)) return;
      if(placeSouhait(id,date)) souhaitHonored[id]++;
    });
  });

  /* ── 8a-bis. (23/10/2026) PÉRIODES TENDUES D'ABORD ──────────────────────
     Règle du responsable : « l'algo doit d'abord gérer les périodes tendues,
     pas bêtement poser au fil de l'année ». Constaté sur 2027 : mi-août, 6 à 10
     MAR présents sur deux week-ends de suite. Posé au fil de l'eau, le calcul
     utilisait en semaine (17-19/08) des MAR dont il avait besoin le week-end
     suivant, et devait lever l'interdit des deux week-ends d'affilée le 22/08,
     alors qu'une répartition « 4 un week-end, 4 l'autre » existait.
     1. Tension d'un jour = nombre de MAR qui peuvent y être de garde (absences,
        temps partiel, veille de congé…). Un jour est tendu sous FRAC_TENSION de
        l'effectif de garde (moitié de l'équipe : 45 % laissait passer
        un été à trois week-ends de suite à moitié présents).
     2. Les jours tendus proches (moins de FUSION_TENSION jours d'écart) forment
        une période, jours ordinaires intercalés compris : ce sont eux qui
        épuisent le vivier du week-end suivant.
     3. Chaque période est résolue d'un bloc, par recherche avec retour arrière,
        avec TOUTES les règles strictes (blocked, tropDense) et les unités du
        service (vendredi-dimanche, férié couplé au samedi). Parmi les solutions
        trouvées dans le budget, la plus proche de la part de chacun est retenue
        (part de l'année au prorata de sa présence dans la période).
     4. Ordre : APRÈS les souhaits garantis (régime à part), AVANT les autres
        souhaits — posés avant, ils vidaient le vivier du week-end (mesuré sur
        2027 : 3 MAR seulement pour le vendredi-dimanche du 13-15/08). Dans la
        période, un souhait posé est préféré (bonus de coût) et compté honoré.
     5. Le reste de l'année est posé ensuite, souhaits puis fil de l'eau, comme avant.
     Aucune solution dans le budget → la période est laissée au placement
     habituel, inchangé. Les MAR à régime à part (souhaits plafonnés) n'y sont
     pas placés : ils n'ont que leurs souhaits. */
  const FRAC_TENSION = 0.5, FUSION_TENSION = 6, BUDGET_TENSION = 4000;
  const periodesTendues = [];
  if(NOUVEL_ALGO){
    const _cands = gardeDoctors.filter(id=>!SOUHAIT_PLAFOND.has(id));
    const _seuil = Math.ceil(FRAC_TENSION*_cands.length);
    const _viv = allDays.map(d=>_cands.filter(id=>!indispoIndividuelle(id,d.date)).length);
    const _idx = []; allDays.forEach((d,i)=>{ if(_viv[i]<=_seuil) _idx.push(i); });
    const _per = [];
    _idx.forEach(i=>{ const L=_per[_per.length-1];
      if(L && i-L[1]<=FUSION_TENSION) L[1]=i; else _per.push([i,i]); });
    const _sd=(ds,n)=>toDateStr(new Date(new Date(ds+'T12:00:00').getTime()+n*86400000));
    // Disponibilité de chaque MAR par type de jour, sur l'année (pour la part attendue)
    const _type = d => ({tot:1, sam:d.dow===6?1:0, vd:d.dow===5?1:0, jeu:(d.dow===4&&!d.isFerie)?1:0});
    const _dispoAn = {}; _cands.forEach(id=>{ const a={tot:0,sam:0,vd:0,jeu:0};
      allDays.forEach(d=>{ if(!indispoIndividuelle(id,d.date)){ const t=_type(d); Object.keys(a).forEach(k=>a[k]+=t[k]); } });
      _dispoAn[id]=a; });
    const _AXP = {tot:'total', sam:'sam', vd:'vd', jeu:'jeu'}, _W = {tot:1, sam:3, vd:3, jeu:2};
    _per.forEach(([i0,i1])=>{
      const jours = allDays.slice(i0,i1+1).filter(d=>!gardes[d.date]);
      if(!jours.length) return;
      // ── unités de la période
      const pris = new Set(), unites = [];
      jours.forEach(d=>{
        if(pris.has(d.date)) return;
        let u=[d.date], type=null;
        if(d.dow===5){ const dim=_sd(d.date,2); if(dayByDate[dim]&&!gardes[dim]){ u=[d.date,dim]; type='vd'; } }
        else if(d.dow===6){
          const lun=_sd(d.date,2), jeu=_sd(d.date,-2);
          if(dayByDate[lun]?.isFerie&&dayByDate[lun].dow===1&&!gardes[lun]) u=[d.date,lun];
          else if(dayByDate[jeu]?.isFerie&&dayByDate[jeu].dow===4&&!gardes[jeu]&&!pris.has(jeu)) u=[jeu,d.date];
        } else if(d.isFerie&&d.dow===4){ const sam=_sd(d.date,2); if(dayByDate[sam]&&!gardes[sam]) u=[d.date,sam]; }
        else if(d.isFerie&&d.dow===1){ const sam=_sd(d.date,-2); if(dayByDate[sam]&&!gardes[sam]&&!pris.has(sam)) return; }
        u.forEach(x=>pris.add(x)); unites.push({jours:u, type});
      });
      if(!unites.length) return;
      // ── part attendue de chacun dans la période, et gardes déjà posées (souhaits, Noël…)
      const dansP = new Set(allDays.slice(i0,i1+1).map(d=>d.date));
      unites.forEach(un=>un.jours.forEach(x=>dansP.add(x)));
      const att={}, x0={};
      _cands.forEach(id=>{ const a={tot:0,sam:0,vd:0,jeu:0};
        dansP.forEach(ds=>{ const d=dayByDate[ds]; if(d&&!indispoIndividuelle(id,ds)){ const t=_type(d); Object.keys(a).forEach(k=>a[k]+=t[k]); } });
        att[id]={}; Object.keys(a).forEach(k=>{ att[id][k]=_dispoAn[id][k]?(cibleExacte[id][_AXP[k]]||0)*a[k]/_dispoAn[id][k]:0; });
        x0[id]={tot:0,sam:0,vd:0,jeu:0};
        dansP.forEach(ds=>{ const d=dayByDate[ds]; if(d&&gardes[ds]&&(gardes[ds].g===id||gardes[ds].g2===id)){ const t=_type(d); Object.keys(t).forEach(k=>x0[id][k]+=t[k]); } });
      });
      // Souhait : toutes les nuits de l'unité demandées — un vendredi OU un dimanche
      // demandé vaut pour le week-end entier (les deux nuits vont ensemble).
      const _souhaite = (id,un) => un.type==='vd' ? un.jours.some(ds=>isSouhaitDe(id,ds)) : un.jours.every(ds=>isSouhaitDe(id,ds));
      const contrib = un => { const c={tot:0,sam:0,vd:0,jeu:0}; un.jours.forEach(ds=>{ const t=_type(dayByDate[ds]); c.tot++; c.sam+=t.sam; c.jeu+=t.jeu; }); if(un.type==='vd') c.vd=1; return c; };
      unites.forEach(un=>un.c=contrib(un));
      const _souhAilleurs = {}; _cands.forEach(id=>{ _souhAilleurs[id]=unites.some(u=>_souhaite(id,u)); });
      const X = {}; _cands.forEach(id=>X[id]=Object.assign({},x0[id]));
      // Réserve : les souhaits de samedi, de week-end et de jeudi posés AILLEURS dans
      // l'année consommeront la part du MAR sur ces axes. La période ne doit pas la
      // lui prendre d'avance (mesuré sur 2027 : sans réserve, 5 week-ends souhaités
      // d'un même MAR en octobre-novembre étaient refusés, sa part étant épuisée en août).
      const reserve = {};
      _cands.forEach(id=>{ const r={sam:0,vd:0,jeu:0}, vus=new Set();
        Object.keys(souhaits).forEach(ds=>{ const d=dayByDate[ds]; if(!d||dansP.has(ds)||!isSouhaitDe(id,ds)) return;
          if(d.dow===6) r.sam++; else if(d.dow===4&&!d.isFerie) r.jeu++;
          else if(d.dow===5||d.dow===0){ const f=d.dow===5?ds:_sd(ds,-2); if(!vus.has(f)){ vus.add(f); r.vd++; } } });
        Object.keys(r).forEach(k=>{ r[k]=Math.min(r[k],Math.floor(cibleExacte[id][_AXP[k]]||0)); });
        reserve[id]=r; });
      const coutPose = (id,un) => { let d=0; const c=un.c;
        Object.keys(_W).forEach(k=>{ if(!c[k]) return; const e=att[id][k], a=X[id][k]; d+=_W[k]*((a+c[k]-e)*(a+c[k]-e)-(a-e)*(a-e)); });
        if(_souhaite(id,un)) d-=3;
        else if(_souhAilleurs[id]) d+=3;     // il a demandé une AUTRE nuit de la période : la lui garder
        else ['sam','vd','jeu'].forEach(k=>{ if(c[k]&&X[id][k]+c[k]+reserve[id][k]>(cibleExacte[id][_AXP[k]]||0)+0.5) d+=6; });
        un.jours.forEach(ds=>{ for(const n of [2,-2]){ const v=_sd(ds,n); if(un.jours.indexOf(v)<0&&(gSet[id]?.has(v)||g2Set[id]?.has(v))) d+=4; } });
        return d; };
      // ── pose provisoire (réversible) pour que blocked / tropDense voient la période
      const poser = (id,un) => { const tr=[]; un.jours.forEach(ds=>{ gSet[id].add(ds); const r=addOneDay(ds); if(!rgSet[id].has(r)){ rgSet[id].add(r); tr.push(r); } });
        Object.keys(un.c).forEach(k=>X[id][k]+=un.c[k]); return tr; };
      const retirer = (id,un,tr) => { un.jours.forEach(ds=>gSet[id].delete(ds)); tr.forEach(r=>rgSet[id].delete(r));
        Object.keys(un.c).forEach(k=>X[id][k]-=un.c[k]); };
      const libre = (id,un) => un.jours.every(ds=>!blocked(id,ds)) && !tropDense(id,un.jours);
      // Ordre de résolution : les unités au plus petit vivier d'abord (les week-ends
      // tendus), à égalité dans l'ordre du calendrier. Le jour ordinaire, qui a de la
      // marge, s'arrange ensuite autour.
      const _jr = ds => allDays.findIndex(d=>d.date===ds);
      unites.forEach(un=>{ un.viv=_cands.filter(id=>libre(id,un)).length; un.pos=_jr(un.jours[0]); });
      unites.sort((a,b)=>(a.viv-b.viv)||(a.pos-b.pos));
      // Voisinage d'une unité : les unités à 9 jours ou moins, les seules dont une
      // pose peut changer les candidats (veille, lendemain, week-ends, 3 gardes/6 jours).
      unites.forEach(un=>{ un.voisins=unites.filter(v=>v!==un&&Math.abs(v.pos-un.pos)<=10); });
      let noeuds=0, meilleur=null, meilleurCout=Infinity;
      const choix=[], fait=new Set();
      const rec = (k,cout) => {
        if(++noeuds>BUDGET_TENSION) return;
        if(k===unites.length){ if(cout<meilleurCout){ meilleurCout=cout; meilleur=unites.map(u=>choix[unites.indexOf(u)]); } return; }
        // regard en avant : chaque unité voisine encore libre garde au moins 2 candidats
        if(k>0){ const prec=unites[k-1];
          for(const v of prec.voisins){ if(fait.has(v)) continue; let n=0; for(const id of _cands){ if(libre(id,v)&&++n>=2) break; } if(n<2) return; } }
        const un=unites[k];
        const L=_cands.filter(id=>libre(id,un)).map(id=>[id,coutPose(id,un)]).sort((a,b)=>a[1]-b[1]);
        const paires=[];
        for(let a=0;a<L.length;a++) for(let b=a+1;b<L.length;b++){
          let c=L[a][1]+L[b][1]; if(evite(L[a][0],L[b][0],un.jours)) c+=1000; paires.push([L[a][0],L[b][0],c]); }
        paires.sort((p,q)=>p[2]-q[2]);
        for(const [A,B,c] of paires){
          if(noeuds>BUDGET_TENSION) return;
          const tA=poser(A,un);
          if(!libre(B,un)){ retirer(A,un,tA); continue; }
          const tB=poser(B,un);
          choix[k]=[A,B]; fait.add(un); rec(k+1,cout+c); fait.delete(un); choix[k]=undefined;
          retirer(B,un,tB); retirer(A,un,tA);
        }
      };
      rec(0,0);
      const deb=allDays[i0].date, fin=allDays[i1].date;
      if(!meilleur){ periodesTendues.push({deb,fin,unites:unites.length,resolue:false});
        warnings.push(`Période tendue ${deb}→${fin} : pas de solution trouvée d'un bloc, posée au fil de l'eau`); return; }
      // ── engagement, dans l'ordre du calendrier
      const _ordre = unites.map((u,k)=>[u,meilleur[k]]).sort((a,b)=>a[0].pos-b[0].pos);
      _ordre.forEach(([un,AB])=>{ const [A,B]=AB; const [g,g2]=assignRoles(A,B);
        if(un.type==='vd'){ cnt[A].vd++; cnt[B].vd++; }
        [A,B].forEach(m=>{ if(_souhaite(m,un)){ souhaitHonored[m]++; un.jours.forEach(ds=>_slotSouhait.add(ds+'|'+m)); } });
        un.jours.forEach(ds=>assign(ds,g,g2,dayByDate[ds].isFerie&&dayByDate[ds].dow===4?4:dayByDate[ds].dow)); });
      periodesTendues.push({deb,fin,unites:unites.length,resolue:true,noeuds});
      Logger.log(`Période tendue ${deb}→${fin} : ${unites.length} unités posées d'un bloc (${noeuds} essais)`);
    });
  }

  /* (23/10/2026) SOUHAITS RARES : ÉTALÉS SUR L'ANNÉE, JOKER BIEN CHOISI.
     La passe parcourait l'année dans l'ordre : un MAR qui demandait plus que sa
     part (13 jeudis pour 6) obtenait ses 6 premiers, de janvier à juin, puis plus
     rien. Et le joker férié partait sur le PREMIER férié demandé, même quand un
     férié plus loin couvrait deux jours (samedi + lundi de Toussaint).
     Désormais, pour chaque MAR, on désigne d'avance ses demandes PRIORITAIRES :
       • jeudis, samedis, week-ends — s'il en demande plus que sa part, une sur
         deux (ou trois…) réparties sur toute l'année, autant que sa part ;
       • fériés et veilles de férié — l'unité qui compte le plus de jours
         demandés, à égalité la moins disputée, puis la plus tôt.
     Une première passe n'honore que ces demandes ; une seconde, comme avant,
     tout le reste dans l'ordre de l'année, dans la limite de la part : une
     demande prioritaire refusée (collègue, couverture) est ainsi remplacée.
     Rien ne change pour lundi-mardi-mercredi ni pour les souhaits garantis. */
  const _prioRare={};
  gardeDoctors.filter(id=>!SOUHAIT_PLAFOND.has(id)&&cible[id]).forEach(id=>{
    const fam={jeu:[],sam:[],vd:[],joker:[]}, vu={};
    Object.keys(souhParJour).sort().forEach(ds=>{
      if(souhParJour[ds].indexOf(id)<0||estJourLibre(ds)) return;
      const un=_uniteFixe(ds); if(!un) return;
      const cle=un.jours.join('+');
      if(vu[cle]){ vu[cle].voulus++; return; }
      const c=coutAxesUnite(un);
      const f=(c.vjf||c.ferie||c.jf)?'joker':c.vd?'vd':c.sam?'sam':c.jeu?'jeu':null;
      if(!f) return;
      vu[cle]={jours:un.jours,voulus:1}; fam[f].push(vu[cle]);
    });
    const P=new Set(), prendre=u=>u.jours.forEach(d=>P.add(d));
    /* Une demande qui en touche une autre du même MAR à moins de 3 jours (le
       samedi d'un week-end aussi demandé, le jeudi avant un samedi demandé) ne
       peut pas être accordée avec elle. Pour l'étalement, on choisit d'abord
       parmi les demandes sans voisine ; les autres ne complètent qu'à défaut. */
    const sesRares=Object.keys(vu).reduce((t,k)=>t.concat(vu[k].jours.filter(d=>(souhParJour[d]||[]).indexOf(id)>=0)),[]);
    const gene=u=>sesRares.some(w=>u.jours.indexOf(w)<0
                  &&u.jours.some(d=>Math.abs(new Date(w+'T12:00:00')-new Date(d+'T12:00:00'))<=2*86400000));
    const etaler=(L,k)=>{ const out=[]; for(let i=0;i<k&&L.length;i++) out.push(L[Math.floor((i+0.5)*L.length/k)]); return out; };
    ['jeu','sam','vd'].forEach(f=>{
      const L=fam[f], k=Math.max(0,Math.floor(cible[id][f]));
      if(L.length<=k){ L.forEach(prendre); return; }
      const libres=L.filter(u=>!gene(u)), genees=L.filter(gene);
      if(libres.length>=k) etaler(libres,k).forEach(prendre);
      else { libres.forEach(prendre); etaler(genees,k-libres.length).forEach(prendre); }
    });
    if(fam.joker.length){
      const dispute=u=>u.jours.reduce((t,d)=>t+(souhParJour[d]||[]).length,0)-u.voulus;
      prendre(fam.joker.slice().sort((a,b)=>(b.voulus-a.voulus)||(dispute(a)-dispute(b)))[0]);
    }
    _prioRare[id]=P;
  });
  const _estPrio=(m,date)=>!!(_prioRare[m]&&_prioRare[m].has(date));

  // Régime 2 — autres MAR : équitable, DANS la cible. Passe 1 : jours libres +
  // demandes rares prioritaires ; passe 2 : demandes rares restantes.
  const _passeSouhaits=phase=>Object.keys(souhParJour).sort().forEach(date=>{
    if(gardes[date]) return;
    // Défense en profondeur : un souhait n'est honoré que sur jour LIBRE (lun/mar/mer).
    // Un souhait sur jeudi/samedi/VD (axe d'équité) est ignoré → le MAR reçoit sa part
    // normale par l'équité, l'axe ne peut pas être monopolisé même si le garde-fou est contourné.
    if(!estJourLibre(date)){
      // Nouveau : jeudi, samedi, week-end, férié, veille de férié. Le souhait est
      // POSABLE ; il n'est HONORÉ que s'il tient dans la part du MAR sur chaque axe
      // touché et dans son quota de familles rares. Sinon il est ignoré, sans effet.
      const un=uniteDeSouhait(date); if(!un) return;
      const cds=souhParJour[date].filter(m=>!SOUHAIT_PLAFOND.has(m)&&(phase===2||_estPrio(m,date))
                  &&un.jours.every(d=>!blocked(m,d))&&okSouhaitRare(m,un));
      if(!cds.length) return;
      cds.sort((a,b)=>souhaitHonored[a]-souhaitHonored[b]);
      if(placeSouhaitUnite(cds[0],un)) souhaitHonored[cds[0]]++;
      return;
    }
    if(phase===2) return;                    // jours libres : passe 1 seulement, inchangée
    const cands=souhParJour[date].filter(m=>!SOUHAIT_PLAFOND.has(m)&&!blocked(m,date)
                  &&cntLibre(m)<freeBudget[m]);
    if(!cands.length) return; // sera rempli par la passe chronologique
    cands.sort((a,b)=>souhaitHonored[a]-souhaitHonored[b]); // le moins servi mène
    const lead=cands[0];
    if(placeSouhait(lead,date)) souhaitHonored[lead]++;
  });
  _passeSouhaits(1); _passeSouhaits(2);

  // 8b. Placement chronologique
  allDays.forEach(day=>{
    const date=day.date,dow=day.dow;
    if(gardes[date]) return; // déjà assigné (souhait ou dimanche VD)
    // (Couplages fériés) jeudi férié → binôme du samedi suivant ; lundi férié → binôme du samedi précédent.
    // Le férié couplé est compté dans l'axe samedi (assign avec dow=6) ; jfCnt le compte aussi comme férié.
    if(day.isFerie && (dow===4||dow===1)){
      const satDate=toDateStr(new Date(new Date(date+'T12:00:00').getTime()+(dow===4?2:-2)*86400000));
      if(gardes[satDate]){
        // samedi déjà placé → hériter du même binôme et des mêmes rôles
        const {g,g2}=gardes[satDate];
        if(g&&g2&&!blocked(g,date)&&!blocked(g2,date)){assign(date,g,g2,dow);return;} // vrai jour : lundi férié → LUNDI
        warnings.push(`Couplage férié : binôme samedi indispo ${date} (repli)`);
      } else if(dow===4){
        // jeudi férié, samedi pas encore placé → placer le binôme sur jeudi ET samedi
        const availC=gardeDoctors.filter(id=>!blocked(id,date)&&!blocked(id,satDate)&&!tropDense(id,[date,satDate]));
        if(availC.length>=2){
          const scoreSat=id=>[ratio(id,'sam'),ratioTotal(id),cnt[id].g+cnt[id].g2];
          availC.sort((a,b)=>cmp(scoreSat(a),scoreSat(b)));
          const A=availC[0];
          const rest=availC.filter(id=>id!==A); rest.sort((a,b)=>cmp(scoreSat(a),scoreSat(b)));
          // (23/10/2026) Paire à éviter : ce jumelage ne la consultait pas. Elle reste
          // levée si personne d'autre ne peut tenir le jeudi et le samedi.
          const _restOk=rest.filter(id=>!evite(A,id,[date,satDate]));
          const B=(_restOk.length?_restOk:rest)[0];
          const [g,g2]=assignRoles(A,B);
          assign(date,g,g2,dow);   // jeudi férié (dow=4) : exclu du comptage jour via _coupledF, JF seul
          assign(satDate,g,g2,6);  // samedi suivant, même binôme/rôles : SAMEDI + récup R
          return;
        }
        warnings.push(`Couplage jeudi férié impossible ${date} (repli)`);
      } else {
        warnings.push(`Lundi férié sans samedi placé ${date} (repli)`);
      }
      // repli : laisse continuer vers le placement normal ci-dessous
    }

    const avail=gardeDoctors.filter(id=>!blocked(id,date));
    if(avail.length<2){
      // ── DERNIER RECOURS : ne jamais renoncer sans avoir tout essayé ────────
      // Un jour non pourvu est le pire résultat possible : le comité, à la main,
      // y arrivait TOUJOURS — en cassant la contrainte la moins douloureuse et en
      // le disant. On fait pareil, dans cet ordre :
      //   1. tolérer le combo jeudi↔samedi (légal : ce n'est PAS deux gardes
      //      d'affilée, et c'est exactement l'arbitrage humain) ;
      //   2. si ça ne suffit toujours pas, alors seulement, signaler le manque.
      // Les deux règles dures ne sont JAMAIS relâchées : jamais deux gardes
      // consécutives, jamais de garde sur une absence déclarée.
      const availR=gardeDoctors.filter(id=>!blocked(id,date,true));
      if(availR.length>=2){
        const _vjf=dayByDate[date]?dayByDate[date].isVjf:false;
        availR.sort((a,b)=>cmp(scoreSelect(a,dow,_vjf,date),scoreSelect(b,dow,_vjf,date)));
        const [A,B]=meilleurePaire(availR,date);
        const [g,g2]=assignRoles(A,B);
        assign(date,g,g2,dow);
        warnings.push(`Dernier recours : ${date} pourvu en tolérant le combo jeudi↔samedi (${A} / ${B}) — période trop chargée en congés, à anticiper au staff`);
        return;
      }
      warnings.push(`Manque MAR ${date}`);gardes[date]={g:null,g2:null};return;
    }

    if(dow===5){
      // VENDREDI : VD (binôme vendredi+dimanche)
      const dimDate=toDateStr(new Date(new Date(date+'T12:00:00').getTime()+2*86400000));
      const dimExists=!!dayByDate[dimDate];
      // (COUVERTURE) Si le dimanche est DÉJÀ pourvu (repli de la rotation de Noël :
      // 25/12 tombant un dimanche, posé seul), ne pas reformer d'unité VD :
      // assign(dimDate) écraserait l'attribution de Noël et corromprait les
      // compteurs. Le vendredi est alors placé seul (« VD exception »).
      const availVD=(dimExists&&!gardes[dimDate])?avail.filter(id=>!blocked(id,dimDate)&&!tropDense(id,[date,dimDate])):[];
      if(availVD.length>=2){
        availVD.sort((a,b)=>cmp(scoreVD(a,date,dimDate),scoreVD(b,date,dimDate)));
        /* (11/10/2026) COUPLES DE WEEK-END · levier 1. Le samedi est déjà tenu (un
           souhait) par l'un : l'autre passe en tête du vendredi-dimanche, s'il reste
           sous sa part et sans 3e garde dans la semaine. */
        if(_cplOn){ const _gs=gardes[addOneDay(date)];
          if(_gs) for(const _h of [_gs.g,_gs.g2]){ const P=CPL_WE[_h]; const i=P?availVD.indexOf(P):-1;
            if(i>0 && _cplSousPart(P,'vd') && scoreVD(P,date,dimDate)[0]<80){ availVD.splice(i,1); availVD.unshift(P); break; } } }
        let [A,B]=meilleurePaire(availVD,[date,dimDate]);
        // ── (COUVERTURE) Anticipation du SAMEDI intercalé ────────────────
        // Le binôme VD est bloqué vendredi, samedi (veille/lendemain) ET dimanche.
        // S'il ne restait plus 2 personnes disponibles le samedi, on descend dans
        // le classement scoreVD jusqu'à une paire qui préserve la couverture.
        // Strictement conditionnel : vivier large → RIEN ne change.
        const _samC=addOneDay(date);
        if(dayByDate[_samC]&&!gardes[_samC]){
          const _poolS=gardeDoctors.filter(id=>!blocked(id,_samC));
          if(_poolS.filter(id=>id!==A&&id!==B).length<2){
            let _ok=false;
            // (07/09/2026) Deux tours : d'abord les paires autorisées, puis toutes.
            // La couverture du samedi passe avant la règle de paire.
            for(let _t=0;_t<2&&!_ok;_t++)
            for(let i=0;i<availVD.length&&!_ok;i++)
              for(let j=i+1;j<availVD.length&&!_ok;j++){
                if(_t===0&&evite(availVD[i],availVD[j],[date,dimDate])) continue;
                if(_poolS.filter(id=>id!==availVD[i]&&id!==availVD[j]).length>=2){
                  A=availVD[i];B=availVD[j];_ok=true;
                  warnings.push(`Couverture : binôme VD ${date} ajusté pour préserver le ${_samC}`);
                }
              }
          }
        }
        cnt[A].vd++;cnt[B].vd++;
        // Rôles : celui qui a le moins de G prend G, et garde ce rôle vendredi ET dimanche
        const [gV,g2V]=assignRoles(A,B);
        assign(date,gV,g2V,5);
        assign(dimDate,gV,g2V,0); // même rôle sur tout le week-end (règle VD)
        return;
      } else {
        warnings.push(`VD exception ${date}`);
      }
    }

    // Génération normale : sélectionner 2 MARs par équité, puis attribuer rôles
    avail.sort((a,b)=>cmp(scoreSelect(a,dow,day.isVjf,day.date),scoreSelect(b,dow,day.isVjf,day.date)));
    /* (11/10/2026) COUPLES DE WEEK-END · levier 1. Samedi : si l'un tient le
       vendredi-dimanche qui l'entoure, l'autre passe en tête — seulement s'il reste
       sous sa part de samedis et sans garde à deux jours. */
    if(_cplOn && dow===6){
      for(const _h of _cplVDde(shiftDays(date,-1))){ const P=CPL_WE[_h]; const i=P?avail.indexOf(P):-1;
        if(i>0 && _cplSousPart(P,'sam') && spacingPenalty(P,date)<100){ avail.splice(i,1); avail.unshift(P); break; } } }
    let [A,B]=meilleurePaire(avail,day.date);
    // ── (COUVERTURE) Anticipation d'UN jour ────────────────────────────
    // Ne pas vider le vivier du LENDEMAIN : les deux retenus y seront bloqués (jamais
    // deux gardes d'affilée). S'il ne resterait plus 2 personnes demain, on descend
    // dans le classement d'équité jusqu'à une paire qui préserve la couverture.
    // Strictement conditionnel : en temps normal le vivier est large et RIEN ne change.
    // Jours à préserver : le lendemain, plus le SAMEDI (+2) si on place un jeudi
    // non férié — le combo jeudi↔samedi bloque aussi le binôme du jeudi ce jour-là.
    // Vérification CONJOINTE : la paire retenue doit préserver TOUS ces jours à la
    // fois (ajuster pour l'un ne doit pas sacrifier l'autre).
    const _lendC=addOneDay(date);
    const _protC=[_lendC];
    if(dow===4&&!day.isFerie) _protC.push(addOneDay(_lendC));
    {
      const _pools={};
      _protC.forEach(_dP=>{ if(dayByDate[_dP]&&!gardes[_dP]) _pools[_dP]=gardeDoctors.filter(id=>!blocked(id,_dP)); });
      const _pres=(x,y)=>Object.keys(_pools).every(_dP=>_pools[_dP].filter(id=>id!==x&&id!==y).length>=2);
      if(Object.keys(_pools).length&&!_pres(A,B)){
        let _ok=false;
        // (07/09/2026) Deux tours : paires autorisées d'abord, toutes ensuite.
        for(let _t=0;_t<2&&!_ok;_t++)
        for(let i=0;i<avail.length&&!_ok;i++)
          for(let j=i+1;j<avail.length&&!_ok;j++){
            if(_t===0&&evite(avail[i],avail[j],day.date)) continue;
            if(_pres(avail[i],avail[j])){
              A=avail[i];B=avail[j];_ok=true;
              warnings.push(`Couverture : binôme ${date} ajusté pour préserver ${Object.keys(_pools).join(' et ')}`);
            }
          }
      }
    }
    const [g,g2]=assignRoles(A,B);
    assign(date,g,g2,dow);
  });

  /* ── 8b-bis. (LOT C · 01/09/2026) ARRÊT SI UN JOUR N'A PAS DE BINÔME ──────
     Décision du responsable, 01/09/2026 : « pas de porte de sortie, le problème
     devra être réglé sinon pas de génération ». Un planning amputé d'un jour
     ne se rattrape pas — personne ne sait quoi faire d'une garde vide.
     POURQUOI ICI, et pas plus loin : un jour ne peut devenir vide qu'à UN seul
     endroit du code, la passe de placement ci-dessus (`Manque MAR`). Tout ce
     qui suit — optimiseur, passe confort, échanges avant vacances — remplace un
     MAR par un autre sur un poste déjà pourvu, jamais ne le vide. La couverture
     est donc entièrement décidée ici, et l'échec tombe avant les 20 s
     d'optimisation.
     AUCUNE ÉCRITURE n'a eu lieu à ce stade : la première est la création de
     GARDES_{year}, bien plus bas. Lever ici laisse le classeur intact — pas
     d'onglet, pas de notification aux MARs, pas de phase de temps partiel
     ouverte, rien à supprimer à la main avant de relancer. */
  {
    const vides=allDays.filter(d=>!gardes[d.date]||!gardes[d.date].g||!gardes[d.date].g2).map(d=>d.date);
    if(vides.length){
      const detail=vides.map(date=>_diagnostiquerJourVide_(date));
      const err=new Error(_messageJoursVides_(detail));
      err.joursVides=detail;          // structure lue par l'écran du comité
      throw err;
    }
  }

  // ── 8c. OPTIMISEUR GLOBAL (recherche locale par transferts de créneaux) ─
  // Minimise Σ poids·(réel−cible)² sur les axes d'équité en transférant un
  // créneau (unité VD/couplage incluse) d'un MAR sur-cible vers un sous-cible.
  // Respecte espacements, NO_WEEKEND, plafond souhait_plafond, souhaits verrouillés et
  // l'intégrité VD / couplages fériés. ~0,1 s ; chacun finit à ≤1,3 de sa cible.
  {
    const W={vd:7,sam:6,jeu:5,vjf:5,jf:4,total:2}, WGG2=1;
    const EQ=['vd','sam','jf','jeu','vjf','total'];
    const KEYS=['dim','lun','mar','mer','jeu','ven','sam'];
    const ABS=new Set(['INDISPO','VAC','FORM','TP','CL','CTP']);
    // (24/10/2026) VITESSE : décalage de dates mémorisé (même résultat).
    const _shiftMemo={};
    const shift=(ds,n)=>{const k=ds+'|'+n; const m=_shiftMemo[k]; if(m) return m;
      return (_shiftMemo[k]=toDateStr(new Date(new Date(ds+'T12:00:00').getTime()+n*86400000)));};
    // 1) Groupes de jours liés (VD ven/dim, couplages fériés) — union-find.
    const parent={};
    const find=x=>{if(parent[x]===undefined)parent[x]=x;let r=x;while(parent[r]!==r)r=parent[r];while(parent[x]!==r){const nx=parent[x];parent[x]=r;x=nx;}return r;};
    const union=(a,b)=>{parent[find(a)]=find(b);};
    const placedD=Object.keys(gardes).filter(d=>gardes[d].g);
    placedD.forEach(d=>{if(parent[d]===undefined)parent[d]=d;});
    placedD.forEach(d=>{
      const di=dayByDate[d],dow=di.dow;let p=null;
      if(dow===5)p=shift(d,2);
      else if(di.isFerie&&dow===4)p=shift(d,2);
      else if(di.isFerie&&dow===1)p=shift(d,-2);
      if(p&&gardes[p]&&gardes[p].g===gardes[d].g&&gardes[p].g2===gardes[d].g2)union(d,p);
    });
    const groups={};
    placedD.forEach(d=>{const r=find(d);(groups[r]||(groups[r]=[])).push(d);});
    // 2) Contribution (tous champs cnt) d'un groupe, indépendante du titulaire.
    const contribOf=days_=>{
      const c={total:0,sam:0,jeu:0,vd:0,vjf:0,ferie:0,jf:0,lun:0,mar:0,mer:0,ven:0,dim:0,recupR:0};
      days_.forEach(dd=>{const ad=assignDow[dd],di=dayByDate[dd];
        const coupledF=di.isFerie&&di.dow===4; // SEUL le jeudi férié couplé exclu du comptage jour
        c.total++; if(!coupledF){c[KEYS[ad]]++; if(ad===6)c.recupR++;}
        if(di.isVjf)c.vjf++; if(di.isFerie&&(di.dow===2||di.dow===3))c.ferie++; if(di.isFerie)c.jf++;});
      if(days_.some(dd=>assignDow[dd]===5))c.vd=1;
      return c;
    };
    // 3) Slots = (groupe, rôle 0=G/1=G2) ; verrou si titulaire à souhait_plafond ou souhait honoré.
    const slots=[];
    Object.values(groups).forEach(days_=>{
      const contrib=contribOf(days_);
      [0,1].forEach(role=>{
        const holder=role===0?gardes[days_[0]].g:gardes[days_[0]].g2;
        const locked=SOUHAIT_PLAFOND.has(holder)||days_.some(dd=>_slotSouhait.has(dd+'|'+holder))||days_.some(dd=>noelDatesAssigned.has(dd));
        slots.push({days:days_,role,contrib,locked});
      });
    });
    // 4) Faisabilité : B peut-il tenir ce rôle sur tous les jours du groupe ?
    const canHold=(B,days_,role_)=>{
      // (23/10/2026) Même règle dure que dans blocked() : un transfert ne crée jamais une série trop dense.
      if(tropDense(B,days_)) return false;
      // (05/09/2026) Même règle dure que dans blocked() : un transfert ne peut pas
      // donner à B un deuxième week-end consécutif.
      if(NOUVEL_ALGO){
        const _we=days_.some(dd=>{const w=dayByDate[dd].dow;return w===5||w===6||w===0;});
        if(_we && hasAdjWeekend(B,days_)) return false;
      }
      for(let k=0;k<days_.length;k++){const dd=days_[k];
        const di=dayByDate[dd],dow=di.dow;
        // (31/07/2026) SOURCE UNIQUE — cf. indispoIndividuelle(). canHold refaisait ses
        // propres tests et en avait oublie deux. Ne JAMAIS y remettre une liste locale.
        if(indispoIndividuelle(B,dd))return false;
        const gg=gardes[dd]; if(B===gg.g||B===gg.g2)return false;
        // (07/09/2026) L'autre rôle du jour reste en place : un transfert ne doit pas
        // reconstituer une paire à éviter. Ici le refus est SANS RISQUE — l'optimiseur
        // se contente de ne pas faire ce transfert-là, le jour reste pourvu.
        if(role_!==undefined && evite(B, role_===0?gg.g2:gg.g, dd))return false;
        const adj=[shift(dd,-1),shift(dd,1)];
        for(let a=0;a<2;a++){if(days_.indexOf(adj[a])>=0)continue;
          const ag=gardes[adj[a]]; if(ag&&(B===ag.g||B===ag.g2))return false;}
        // combo jeudi-samedi interdit (hors jeudi férié)
        if(dow===6){const thu=shift(dd,-2),tdi=dayByDate[thu];
          if(days_.indexOf(thu)<0&&tdi&&!tdi.isFerie&&(gSet[B].has(thu)||g2Set[B].has(thu)))return false;}
        if(dow===4&&!di.isFerie){const sat=shift(dd,2);
          if(days_.indexOf(sat)<0&&(gSet[B].has(sat)||g2Set[B].has(sat)))return false;}
        // (VDM) un transfert ne crée JAMAIS de dimanche→mardi non souhaité
        if(dow===2&&!isSouhaitDe(B,dd)){const dim=shift(dd,-2);
          if(days_.indexOf(dim)<0&&(gSet[B].has(dim)||g2Set[B].has(dim)))return false;}
        if(dow===0){const mar=shift(dd,2);
          if(days_.indexOf(mar)<0&&(gSet[B].has(mar)||g2Set[B].has(mar))&&!isSouhaitDe(B,mar))return false;}
      }
      return true;
    };
    // 5) Coût marginal d'un transfert A→B (même rôle).
    const delta=(A,B,c,role)=>{
      let d=0;
      EQ.forEach(ax=>{const ca=c[ax];if(!ca)return;
        // cible effective = cible − dette (qui a trop fait en N-1 vise plus bas)
        const cbA=cible[A][ax]-(dette[A]?.[ax]||0),cbB=cible[B][ax]-(dette[B]?.[ax]||0),a0=cnt[A][ax],b0=cnt[B][ax];
        d+=W[ax]*((Math.pow(a0-ca-cbA,2)-Math.pow(a0-cbA,2))+(Math.pow(b0+ca-cbB,2)-Math.pow(b0-cbB,2)));
        /* (05/09/2026) OBJECTIF LEXICOGRAPHIQUE — récit : docs/JOURNAL-Planning-Med.md §118 */
        if(NOUVEL_ALGO){
          const _h=e=>{const x=Math.abs(e)-LEX_SEUIL; return x>0?x*x:0;};
          d+=LEX_POIDS*((_h(a0-ca-cbA)-_h(a0-cbA))+(_h(b0+ca-cbB)-_h(b0-cbB)));
        }});
      const n=c.total,aG=cnt[A].g,aG2=cnt[A].g2,bG=cnt[B].g,bG2=cnt[B].g2;
      let na,nb;
      if(role===0){na=(aG-n)-aG2;nb=(bG+n)-bG2;}else{na=aG-(aG2-n);nb=bG-(bG2+n);}
      d+=WGG2*((na*na-(aG-aG2)*(aG-aG2))+(nb*nb-(bG-bG2)*(bG-bG2)));
      return d;
    };
    // 6) Appliquer le transfert (tous champs cnt + rôle).
    const applyTr=(slot,B)=>{
      const role=slot.role,days_=slot.days,c=slot.contrib;
      const A=role===0?gardes[days_[0]].g:gardes[days_[0]].g2;
      days_.forEach(dd=>{
        if(role===0){gardes[dd].g=B;gSet[A].delete(dd);gSet[B].add(dd);}
        else{gardes[dd].g2=B;g2Set[A].delete(dd);g2Set[B].add(dd);}
        const _wk=dayByDate[dd].wk;
        weekCnt[A][_wk]=(weekCnt[A][_wk]||0)-1; weekCnt[B][_wk]=(weekCnt[B][_wk]||0)+1;
        if(isSouhaitDe(A,dd)) weekCntS[A][_wk]=(weekCntS[A][_wk]||0)-1; // (Fix A3)
        if(isSouhaitDe(B,dd)) weekCntS[B][_wk]=(weekCntS[B][_wk]||0)+1;
        const _m=Number(dd.slice(5,7));
        monthCnt[A][_m]=(monthCnt[A][_m]||0)-1; monthCnt[B][_m]=(monthCnt[B][_m]||0)+1;});
      Object.keys(c).forEach(ax=>{cnt[A][ax]-=c[ax];cnt[B][ax]+=c[ax];});
      const n=c.total;
      if(role===0){cnt[A].g-=n;cnt[B].g+=n;}else{cnt[A].g2-=n;cnt[B].g2+=n;}
    };
    // Règle 1 : vrai si `id` a déjà une garde de week-end (ven/sam/dim) sur le
    // week-end adjacent (±5 à ±9 j), hors jours du groupe courant.
    const hasAdjWeekend=(id,days_)=>{
      for(let gi=0;gi<days_.length;gi++){
        const base=new Date(days_[gi]+'T12:00:00');
        for(let n=-9;n<=9;n++){ if(n>=-4&&n<=4)continue;
          const x=new Date(base);x.setDate(base.getDate()+n);const xs=toDateStr(x);
          const dx=dayByDate[xs]; if(!dx)continue;
          if(dx.dow!==5&&dx.dow!==6&&dx.dow!==0)continue;
          if(days_.indexOf(xs)>=0)continue;
          if((gSet[id]&&gSet[id].has(xs))||(g2Set[id]&&g2Set[id].has(xs)))return true;
        }
      }
      return false;
    };
    // Lissage anti-chaînes : pénalise les gardes serrées (J±2/±3/±4) du même MAR.
    const _spacingPen=(id,days_)=>{
      let p=0;
      for(let gi=0;gi<days_.length;gi++){
        const b=new Date(days_[gi]+'T12:00:00');
        for(const n of [-4,-3,-2,2,3,4]){
          const x=new Date(b);x.setDate(b.getDate()+n);const xs=toDateStr(x);
          if(days_.indexOf(xs)>=0)continue;
          if((gSet[id]&&gSet[id].has(xs))||(g2Set[id]&&g2Set[id].has(xs))){
            const sw=isSouhaitDe(id,xs); // (Fix A3) voisin souhaité : pénalité réduite —
            // assez faible pour qu'un déficit d'équité VD la surpasse, assez forte
            // pour préférer, à équité égale, un MAR sans mardi souhaité adjacent.
            p+=Math.abs(n)===2?(sw?5:250):(Math.abs(n)===3?(sw?2:40):(sw?0:6));
          }
        }
      }
      return p;
    };
    /* (11/10/2026) COUPLES DE WEEK-END — nombre de week-ends liés (l'un au
       vendredi-dimanche, l'autre au samedi) sur le week-end du vendredi `fri`, en
       supposant éventuellement que `ov` = {days, role, B} a changé de titulaire. */
    const _cplFri=dd=>{const w=dayByDate[dd].dow; return w===5?dd:w===6?shift(dd,-1):w===0?shift(dd,-2):null;};
    const _cplTit=(dd,ov)=>{const g=gardes[dd]; if(!g) return [];
      let a=g.g,b=g.g2; if(ov&&ov.days.indexOf(dd)>=0){ if(ov.role===0)a=ov.B; else b=ov.B; } return [a,b];};
    const _cplLies=(fri,ov)=>{
      const sat=shift(fri,1), sun=shift(fri,2);
      if(!dayByDate[fri]||!dayByDate[sat]||!dayByDate[sun]) return 0;
      const vf=_cplTit(fri,ov), vs=_cplTit(sun,ov), sa=_cplTit(sat,ov);
      let n=0; vf.forEach(x=>{ if(x&&vs.indexOf(x)>=0&&CPL_WE[x]&&sa.indexOf(CPL_WE[x])>=0) n++; });
      return n;
    };
    const _cplDelta=(days_,role,B)=>{
      const fr=[...new Set(days_.map(_cplFri).filter(Boolean))]; let d=0;
      fr.forEach(f=>{ d+=_cplLies(f,{days:days_,role:role,B:B})-_cplLies(f,null); });
      return d;
    };
    // 7) Recherche locale (best-improvement par slot, passes successives).
    const t0=Date.now();let moves=0;
    for(let pass=0;pass<60;pass++){
      let changed=false;
      for(let si=0;si<slots.length;si++){const slot=slots[si];
        if(slot.locked)continue;
        const days_=slot.days,role=slot.role;
        const A=role===0?gardes[days_[0]].g:gardes[days_[0]].g2;
        const _isWE=days_.some(dd=>{const w=dayByDate[dd].dow;return w===5||w===6||w===0;});
        let bestB=null,bestD=-1e-9;
        for(let bi=0;bi<gardeDoctors.length;bi++){const B=gardeDoctors[bi];
          if(B===A)continue;
          if(SOUHAIT_PLAFOND.has(B)&&cnt[B].total+slot.contrib.total>cible[B].total)continue;
          if(!canHold(B,days_,role))continue;
          let dd_=delta(A,B,slot.contrib,role);
          let wkPen=0; days_.forEach(dd=>{ if(((weekCnt[B][dayByDate[dd].wk]||0)-(weekCntS[B][dayByDate[dd].wk]||0))>=2) wkPen+=30; }); // (Fix A3)
          dd_+=wkPen;
          const WM=2; days_.forEach(dd=>{ const m=dayByDate[dd].month;
            const cb=monthCnt[B][m]||0, ca=monthCnt[A][m]||0, eb=monthExp[B][m]||0, ea=monthExp[A][m]||0;
            dd_+=WM*((Math.pow(cb+1-eb,2)-Math.pow(cb-eb,2))+(Math.pow(ca-1-ea,2)-Math.pow(ca-ea,2))); });
          // Règle 1 : éviter 2 week-ends de garde consécutifs (forte pénalité, souple).
          // (2026-08-26) Poids ±1000 : le code portait DEUX copies identiques de ce
          // test (hasAdjWeekend et _hasAdjWE), toutes deux appliquées — soit ±1000
          // effectif alors que chaque copie annonçait ±500. La déduplication CONSERVE
          // le poids réellement en production ; toucher au poids = décision séparée.
          if(_isWE){
            if(hasAdjWeekend(B,days_))dd_+=1000;   // B enchaînerait 2 week-ends
            if(hasAdjWeekend(A,days_))dd_-=1000;   // ce transfert soulage A d'un enchaînement
          }
          dd_+=_spacingPen(B,days_)-_spacingPen(A,days_);
          // (11/10/2026) COUPLES DE WEEK-END · levier 2 : lien créé = gain, lien cassé = coût.
          if(_cplOn&&!CPL_SANS_BONUS&&_isWE&&(CPL_WE[A]||CPL_WE[B])) dd_-=CPL_LAMBDA*_cplDelta(days_,role,B);
          if(dd_<bestD){bestD=dd_;bestB=B;}}
        if(bestB){applyTr(slot,bestB);moves++;changed=true;}
      }
      if(!changed)break;
      // (2026-08-26) Plafond de temps : s'il coupe, le résultat dépend de la vitesse
      // d'exécution — le déterminisme production↔simulateur n'est alors plus garanti.
      // Jusqu'ici c'était SILENCIEUX ; le comité doit le savoir.
      if(Date.now()-t0>20000){
        warnings.push('Optimiseur interrompu par le plafond de 20 s (passe '+(pass+1)+'/60, '+moves+' transferts) : résultat possiblement non déterministe, relancer hors heures de charge si besoin.');
        break;
      }
    }
    Logger.log('Optimiseur: '+moves+' transferts');

    /* ── 8c-ter. (24/10/2026) RÉPARATION PAR ÉCHANGE DE CRÉNEAUX ──────────────
       L'optimiseur ne déplace qu'UN créneau à la fois. Il reste parfois un MAR à
       2 gardes de sa cible sur un axe sans qu'aucun transfert simple ne soit
       permis : constaté le 24/10/2026 sur les demandes 2027 avec les semaines
       Réa 1 — un MAR à 3 VD pour 5, chaque VD libre tombant à côté d'un de ses
       samedis (jamais deux week-ends de suite). Il fallait un ÉCHANGE : il prend
       le VD d'un collègue au-dessus de sa part et lui cède ce samedi.
       Ne joue QUE pour un écart au-delà de LEX_SEUIL. Un échange n'est gardé que
       s'il réduit l'excès d'écart des deux MAR concernés (puis l'écart pondéré),
       en respectant toutes les règles dures (canHold : absences, Réa 1, repos,
       deux week-ends de suite, 3 gardes sur 6 jours, paires à éviter). Jamais
       sur un créneau verrouillé (souhait honoré, fêtes, régime à part). */
    if(NOUVEL_ALGO){
      const _tit=sl=>sl.role===0?gardes[sl.days[0]].g:gardes[sl.days[0]].g2;
      const _ec=(id,ax)=>cnt[id][ax]-(cible[id][ax]-(dette[id]?.[ax]||0));
      const _axOk=(id,ax)=>!!(cible[id]&&cible[id][ax]>0);
      const _cout=ids=>{ let ex=0,sq=0; ids.forEach(id=>EQ.forEach(ax=>{ if(!_axOk(id,ax)) return;
        const e=_ec(id,ax), x=Math.abs(e)-LEX_SEUIL; if(x>0) ex+=x; sq+=W[ax]*e*e; })); return [ex,sq]; };
      const _mieux=(a,b)=>a[0]<b[0]-1e-9||(Math.abs(a[0]-b[0])<1e-9&&a[1]<b[1]-1e-9);
      let _rep=0;
      for(let _p=0;_p<6;_p++){
        let _chg=false;
        const _def=[]; gardeDoctors.forEach(id=>EQ.forEach(ax=>{ if(_axOk(id,ax)&&Math.abs(_ec(id,ax))>LEX_SEUIL) _def.push([id,ax]); }));
        if(!_def.length) break;
        for(const [M,ax] of _def){
          if(Math.abs(_ec(M,ax))<=LEX_SEUIL) continue;
          /* Meilleur échange, pas le premier trouvé : un échange déplace aussi
             d'autres axes (un samedi cédé contre un VD reçu) ; prendre le moins
             coûteux limite ces effets de bord, qui s'additionnent d'une année sur
             l'autre. */
          let best=null;
          for(const s1 of slots){
            if(s1.locked||!s1.contrib[ax]) continue;
            const T1=_tit(s1);
            // M en déficit : il reçoit s1. M en excès : il cède s1 (il doit le tenir).
            let recv, gives;
            if(_ec(M,ax)<0){ if(T1===M) continue; recv=[M]; gives=T1; }
            else { if(T1!==M) continue; gives=M; recv=gardeDoctors.filter(x=>x!==M); }
            if(SOUHAIT_PLAFOND.has(gives)) continue;
            for(const D of recv){
              if(SOUHAIT_PLAFOND.has(D)) continue;
              const avant=_cout([D,gives]);
              for(const s2 of slots){
                if(s2===s1||s2.locked||_tit(s2)!==D) continue;
                if(s2.contrib[ax]>=s1.contrib[ax]) continue;          // l'échange doit déplacer l'axe
                /* Chaque moitié est vérifiée dans l'état FINAL de l'autre : le
                   créneau cédé est souvent celui qui bloquait (un samedi collé au
                   VD visé), et le tester avant l'échange le refusait à tort. */
                applyTr(s1,D);                                        // s1 chez D
                if(!canHold(gives,s2.days,s2.role)||_spacingPen(gives,s2.days)>=250){ applyTr(s1,gives); continue; }
                applyTr(s2,gives);                                    // s2 chez l'autre
                applyTr(s1,gives);                                    // on retire s1 un instant pour tester D
                const _okD=canHold(D,s1.days,s1.role)&&_spacingPen(D,s1.days)<250;
                applyTr(s1,D);
                const apres=_cout([D,gives]);
                const gain=[avant[0]-apres[0], avant[1]-apres[1]];
                if(_okD&&_mieux(apres,avant)&&(!best||gain[0]>best.gain[0]+1e-9||(Math.abs(gain[0]-best.gain[0])<1e-9&&gain[1]>best.gain[1]+1e-9)))
                  best={s1,s2,D,gives,gain};
                applyTr(s1,gives); applyTr(s2,D);                    // remettre en place
              }
            }
          }
          if(best){ applyTr(best.s1,best.D); applyTr(best.s2,best.gives); _rep++; _chg=true; }
        }
        if(!_chg) break;
      }
      if(_rep) Logger.log('Réparation par échange : '+_rep+' échange(s)');
    }

    /* ── 8c-bis. (11/10/2026) COUPLES DE WEEK-END · levier 3 : échanges ciblés ──
       Un week-end où un seul des deux est de garde : le conjoint ÉCHANGE un de ses
       créneaux de même nature (samedi contre samedi, vendredi-dimanche contre
       vendredi-dimanche), de même rôle et de même contribution, avec le titulaire
       du créneau complémentaire. Les compteurs de chacun ne bougent pas : l'équité
       est inchangée PAR CONSTRUCTION. Jamais sur un créneau verrouillé (souhait,
       Noël, régime à part), jamais si une règle dure s'y oppose (canHold), jamais
       en créant une garde à deux jours (_spacingPen < 250), jamais en cassant un
       autre lien. */
    if(_cplOn){
      const _slotDe=(d,role)=>slots.find(x=>x.role===role&&x.days.indexOf(d)>=0);
      const _memeContrib=(a,b)=>Object.keys(a).every(k=>a[k]===b[k])&&Object.keys(b).every(k=>a[k]===b[k]);
      let _cplEch=0;
      for(let _pass=0;_pass<4;_pass++){
        let _chg=false;
        const _fris=allDays.filter(d=>d.dow===5).map(d=>d.date);
        for(const fri of _fris){
          const sat=shift(fri,1);
          if(!gardes[sat]||!dayByDate[sat]) continue;
          // Qui du couple tient quoi ce week-end ?
          const vd=_cplVDde(fri);
          const satT=[gardes[sat].g,gardes[sat].g2];
          const cas=[];
          vd.forEach(P=>{ const Q=CPL_WE[P]; if(Q&&satT.indexOf(Q)<0&&!vd.includes(Q)) cas.push({Q:Q,cible:[sat],type:'sam'}); });
          satT.forEach(P=>{ const Q=CPL_WE[P]; if(Q&&vd.indexOf(Q)<0&&satT.indexOf(Q)<0) cas.push({Q:Q,cible:null,type:'vd'}); });
          for(const c of cas){
            const Q=c.Q;
            // Q ne doit déjà rien tenir ce week-end
            if([fri,sat,shift(fri,2)].some(d=>gardes[d]&&(gardes[d].g===Q||gardes[d].g2===Q))) continue;
            let fait=false;
            for(const role of [0,1]){
              if(fait) break;
              const sCible=c.type==='sam'?_slotDe(sat,role):_slotDe(fri,role);
              if(!sCible||sCible.locked) continue;
              if(c.type==='vd'&&!(sCible.days.length===2&&sCible.days.indexOf(shift(fri,2))>=0)) continue;
              const H=role===0?gardes[sCible.days[0]].g:gardes[sCible.days[0]].g2;
              if(!H||H===Q||CPL_WE[H]===Q) continue;
              // créneaux de Q de même nature, même rôle, même contribution, non liés
              const siens=slots.filter(x=>x!==sCible&&!x.locked&&x.role===role
                &&(role===0?gardes[x.days[0]].g:gardes[x.days[0]].g2)===Q
                &&_memeContrib(x.contrib,sCible.contrib)
                &&x.days.every(d=>{const w=dayByDate[d].dow; return c.type==='sam'?w===6:(w===5||w===0);}));
              for(const sQ of siens){
                const f2=_cplFri(sQ.days[0]);
                if(f2&&_cplLies(f2,null)>0) continue;          // ne jamais casser un autre lien
                if(!canHold(Q,sCible.days,role)||!canHold(H,sQ.days,role)) continue;
                if(_spacingPen(Q,sCible.days)>=250||_spacingPen(H,sQ.days)>=250) continue;
                const avant=_cplLies(fri,null);
                applyTr(sCible,Q); applyTr(sQ,H);
                if(_cplLies(fri,null)>avant){ _cplEch++; _chg=true; fait=true; break; }
                applyTr(sQ,Q); applyTr(sCible,H);              // annuler : rien gagné
              }
            }
          }
        }
        if(!_chg) break;
      }
      if(_cplEch) warnings.push('Couples de week-end : '+_cplEch+' échange(s) ciblé(s), équité inchangée');
    }
    if(NOUVEL_ALGO && TIRAGE_BRUT>1) warnings.push('Multi-départ : tirage n°'+TIRAGE_BRUT+' retenu (équité meilleure que le tirage 1).');
    if(_cplOn && CPL_SANS_BONUS) warnings.push('Couples de week-end : règle assouplie (sans bonus d\'optimisation) — avec la règle entière, aucun planning ne tenait l\'équité à '+MULTI_DEPART_SEUIL+' garde près.');

    // ── 8bis. PASSE CONFORT — « le jour gagné avant les vacances » ────────
    // Pratique historique du service : donner à un MAR la garde de la veille de son
    // dernier jour travaillé avant un départ en congés. Le repos de garde tombe alors
    // sur ce dernier jour, qui n'est PAS décompté du quota : il gagne un jour.
    //
    // PRINCIPE ABSOLU : cette passe n'échange que des gardes de MÊME JOUR DE SEMAINE
    // et de MÊME RÔLE, toutes deux hors férié et hors veille de férié. Les deux dates
    // ont donc EXACTEMENT la même contribution à tous les compteurs (total, g/g2,
    // lun/mar/mer/jeu). L'équité est donc inchangée PAR CONSTRUCTION, pas par mesure.
    // Vérifié sur 240 années simulées : 0 compteur modifié, 0 règle dure cassée.
    //
    // Assouplissement assumé (le responsable, 30/07/2026) : le BÉNÉFICIAIRE peut accepter une
    // garde à J±2 (rapprochement pénalisé, jamais interdit) ; le CÉDANT, lui, n'hérite
    // jamais d'un rapprochement qu'il n'a pas choisi. Mesuré : +2,5 rapprochements/an
    // pour ~18 échanges/an sur toute l'équipe.
    {
      const PLAFOND_CONFORT = 2;                     // par MAR et par an
      // rgSet est recomposé ici : l'optimiseur a pu déplacer des gardes sans le mettre
      // à jour, et blocked() le consulte.
      allDoctors.forEach(id=>{rgSet[id]=new Set();});
      Object.keys(gardes).forEach(dd=>{const gg=gardes[dd];if(!gg.g)return;
        [gg.g,gg.g2].forEach(id=>{if(id)rgSet[id].add(addOneDay(dd));});});

      const _sd=(d,n)=>toDateStr(new Date(new Date(d+'T12:00:00').getTime()+n*86400000));
      const _aG=(id,d)=>gSet[id]?.has(d)||g2Set[id]?.has(d);
      // Jour réellement travaillé par CE MAR (week-end, férié, TP fixe, semaine off,
      // et toute absence posée comptent comme non travaillés).
      const _travaille=(id,d)=>{
        const di=dayByDate[d]; if(!di) return false;
        if(di.dow===0||di.dow===6||di.isFerie) return false;
        const s=indispos[id]?.[d];
        if(s==='VAC'||s==='FORM'||s==='CL'||s==='TP'||s==='CTP'||s==='CP'||s==='A') return false;
        if(estSemaineOff(id,d)) return false;
        const tpF=FLAGS.tpJoursFixes[id];
        if(tpF&&tpF.has(new Date(d+'T12:00:00').getDay())) return false;
        return true;
      };
      // Date échangeable : lundi→jeudi, ni férié ni veille de férié (sinon la
      // contribution aux compteurs diffère et l'équité bougerait).
      const _neutre=d=>{const di=dayByDate[d];
        return !!di && di.dow>=1 && di.dow<=4 && !di.isFerie && !di.isVjf;};

      // 1) Pour chaque début de bloc VAC : remonter au dernier jour travaillé J,
      //    la garde à obtenir est J-1.
      const demandes=[];
      gardeDoctors.forEach(id=>{
        const m=indispos[id]||{};
        Object.keys(m).sort().forEach(d=>{
          if(m[d]!=='VAC') return;
          if(m[_sd(d,-1)]==='VAC') return;            // pas un début de bloc
          let j=_sd(d,-1), garde=0;
          while(garde++<15 && !_travaille(id,j)) j=_sd(j,-1);
          const cible_=_sd(j,-1);
          if(_neutre(cible_)) demandes.push({id,date:cible_});
        });
      });
      // 2) Jours déjà gagnés : on ne les reprend à personne (règle du cédant protégé).
      const dejaGagne={};
      demandes.forEach(x=>{ if(_aG(x.id,x.date)) dejaGagne[x.id+'|'+x.date]=true; });

      let _ech=0;
      const _benef={};
      demandes.sort((a,b)=>a.date<b.date?-1:1).forEach(x=>{
        const A=x.id, Dn=x.date;
        if((_benef[A]||0)>=PLAFOND_CONFORT) return;
        if(_aG(A,Dn)) return;                          // déjà satisfait
        if(blocked(A,Dn)) return;                      // indispo, RG, veille/lendemain, jeu↔sam…
        for(const role of [0,1]){
          const B = role===0 ? gardes[Dn].g : gardes[Dn].g2;
          if(!B||B===A) continue;
          // (07/09/2026) A arrive à côté de l'autre rôle du jour Dn : jamais son conjoint.
          if(evite(A, role===0?gardes[Dn].g2:gardes[Dn].g, Dn)) continue;
          /* (11/10/2026) Un échange ne reprend jamais un jour SOUHAITÉ, ni à B ni à A :
             avant, un souhait accordé pouvait être retiré ici (jeudis souhaités honorés
             à 50 % sur une année simulée, 92 % après). Banc : banc_souhaits_rares §6. */
          if(dejaGagne[B+'|'+Dn]||isSouhaitDe(B,Dn)) continue;   // B y perdrait son propre jour (gagné ou souhaité)
          if(SOUHAIT_PLAFOND.has(A)||SOUHAIT_PLAFOND.has(B)) continue;   // régime à part
          const mesDates=[...(role===0?gSet[A]:g2Set[A])].filter(d2=>
            d2!==Dn && _neutre(d2) && dayByDate[d2].dow===dayByDate[Dn].dow);
          const cede=mesDates.find(d2=>{
            if(dejaGagne[A+'|'+d2]||isSouhaitDe(A,d2)) return false;   // A ne cède ni un jour gagné ni un jour souhaité
            if(_aG(B,d2)) return false;                // B tiendrait les deux rôles
            if(blocked(B,d2)) return false;
            // (07/09/2026) B hérite du créneau de A sur d2 : jamais à côté de son conjoint.
            if(evite(B, role===0?gardes[d2].g2:gardes[d2].g, d2)) return false;
            // le cédant n'hérite pas d'un rapprochement à J±2
            if(_aG(B,_sd(d2,2))||_aG(B,_sd(d2,-2))) return false;
            return true;
          });
          if(!cede) continue;
          // 3) Application : gardes, gSet/g2Set, compteurs hebdo/mensuels.
          //    cnt n'est PAS touché : même jour de semaine, même rôle → contribution
          //    identique. C'est exactement ce qui rend la passe neutre.
          if(role===0){ gardes[Dn].g=A;  gardes[cede].g=B;  gSet[A].delete(cede);  gSet[A].add(Dn);  gSet[B].delete(Dn);  gSet[B].add(cede); }
          else        { gardes[Dn].g2=A; gardes[cede].g2=B; g2Set[A].delete(cede); g2Set[A].add(Dn); g2Set[B].delete(Dn); g2Set[B].add(cede); }
          [[A,cede,-1],[A,Dn,1],[B,Dn,-1],[B,cede,1]].forEach(([who,dd,sgn])=>{
            const wk=dayByDate[dd].wk, mo=Number(dd.slice(5,7));
            weekCnt[who][wk]=(weekCnt[who][wk]||0)+sgn;
            monthCnt[who][mo]=(monthCnt[who][mo]||0)+sgn;
          });
          rgSet[A].delete(addOneDay(cede)); rgSet[A].add(addOneDay(Dn));
          rgSet[B].delete(addOneDay(Dn));   rgSet[B].add(addOneDay(cede));
          _benef[A]=(_benef[A]||0)+1; _ech++;
          break;
        }
      });
      Logger.log('Confort vacances: '+_ech+' echange(s) pour '+Object.keys(_benef).length+' MAR');
      if(_ech) warnings.push(`Confort : ${_ech} garde(s) déplacée(s) pour prolonger un départ en congés (équité inchangée)`);
    }
    // 8) Recomposer rgSet / recupDue depuis l'état optimisé (pour R + 18h + STATS).
    allDoctors.forEach(id=>{rgSet[id]=new Set();});
    gardeDoctors.forEach(id=>{recupDue[id]=[];});
    Object.keys(gardes).forEach(dd=>{const gg=gardes[dd];if(!gg.g)return;
      [gg.g,gg.g2].forEach(id=>{if(!id)return;rgSet[id].add(addOneDay(dd));
        if(dayByDate[dd].dow===6)recupDue[id].push(dd);});}); // R = vrais samedis (jeudi/lundi férié couplé n'ouvre pas de R)
  }

  // ── 9. Placer les R ──────────────────────────────────────────────────
  /* (13/08/2026 — échanges de gardes, lot 1) Le couple « samedi tenu → date
     du R posé » n'existait qu'ici, en mémoire, et n'était jamais écrit.
     Sans lui, impossible de transférer LE R d'un samedi qui change de mains.
     On le collecte au moment exact de la pose, puis LIENS_R_{year} est écrit
     avec GARDES et STATS. Un samedi a DEUX tenants (G et G2) : deux lignes. */
  const liensR=[]; // [samedi, id, dateR]
  const rParJour={};                       // date → nombre de R déjà posés ce jour
  /* Une date est éligible si : jour ouvrable de l'année, pas férié, moins de
     R_MAX_PAR_JOUR récupérations déjà posées, le MAR est libre, aucun autre R du
     même MAR à moins de 3 jours, et l'effectif reste >= R_PLANCHER_PRESENTS APRÈS
     la pose. Les R déjà posés ce jour-là sont déduits du compte : sans cela, deux
     poses le même jour feraient passer sous le plancher sans que rien ne l'indique.
     Les vacances scolaires ne sont plus exclues d'office — le plancher d'effectif
     s'en charge, et il s'en charge mieux : en août il n'y a de toute façon personne. */
  /* `ultime` : la passe de dernier recours abandonne le plancher d'effectif, le
     plafond par jour et l'espacement de 3 jours. C'est délibéré et vérifié au banc :
     avec une équipe réduite ou très absente, appliquer le plancher partout fait
     PERDRE des récupérations (895 sur 10 ans au banc de charge, scénario tendu).
     Une récupération mal placée reste due au MAR ; une récupération jamais posée est
     un jour de repos volé. Ne jamais échanger la seconde contre la première. */
  /* ⚠️ DISPONIBILITÉ POUR UNE RÉCUPÉRATION — différente de celle d'une garde.
     On n'utilise PAS blocked() ni indispoIndividuelle() : elles répondent à « ce MAR
     peut-il prendre une GARDE ce jour-là ? » et excluent deux familles de cas qui
     n'ont rien à voir avec un jour de repos.
       • La veille d'une garde et le combo jeudi-samedi protègent contre
         l'enchaînement de deux gardes. Un MAR de garde est présent au bloc dans la
         journée : se reposer la veille est légitime, voire souhaitable.
       • INDISPO et SOUHAIT signifient « je suis PRÉSENT mais je ne veux pas être de
         garde ce jour-là ». Ce sont des jours travaillés : une récupération peut
         parfaitement s'y poser. Le code le sait déjà ailleurs — ABSENT_18 (l.≈1441)
         ne contient ni INDISPO ni SOUHAIT.
     Sont réellement absents : vacances, formation, congé long, temps partiel,
     semaine « off » du rythme 2/2, jours fixes non travaillés, hors fenêtre
     d'arrivée/départ — plus, évidemment, garde, repos de garde et autre récup.
     Mesuré le 21/08 sur les indisponibilités réelles 2027 : sans cette distinction,
     4 MARs restaient privés de tout week-end de récupération sur des lundis pourtant
     libres avec 20 présents. */
  const R_ABSENT=new Set(['VAC','FORM','CL','TP','CTP','CP','A','RG_TRANSITION']);
  function _rDispo(id,date){
    const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id];
    if((dd&&date<dd)||(df&&date>=df)) return false;
    if(R_ABSENT.has(indispos[id]?.[date])) return false;
    if(REA1_SEM[id]&&REA1_SEM[id].has(date)) return false;   // (24/10/2026) pas de récupération en semaine Réa 1
    if(estSemaineOff(id,date)) return false;
    const tpF=FLAGS.tpJoursFixes[id];
    if(tpF&&tpF.has(new Date(date+'T12:00:00').getDay())) return false;
    if(gSet[id]?.has(date)||g2Set[id]?.has(date)||rgSet[id]?.has(date)||rSet[id]?.has(date)) return false;
    return true;
  }
  /* Effectif présent au sens du service : les MARs de garde travaillent au bloc dans
     la journée, ils COMPTENT. Vérifié sur le planning réel — le 08/09/2026,
     « TOTAL PRESENTS » vaut 15, soit les MARs actifs moins les absents, gardes
     incluses. Ne sont pas présents : absences réelles, repos de garde, récupération. */
  function _rPresents(date){
    return allDoctors.filter(m=>{
      const dd=FLAGS.dateDebut[m], df=FLAGS.dateFin[m];
      if((dd&&date<dd)||(df&&date>=df)) return false;
      if(R_ABSENT.has(indispos[m]?.[date])) return false;
      if(estSemaineOff(m,date)) return false;
      const tpF=FLAGS.tpJoursFixes[m];
      if(tpF&&tpF.has(new Date(date+'T12:00:00').getDay())) return false;
      if(rgSet[m]?.has(date)||rSet[m]?.has(date)) return false;
      return true;
    }).length;
  }
  /* Le jour borde-t-il une absence déjà posée pour ce MAR ? Une récupération
     accolée à des vacances ou une formation les rallonge d'une journée. */
  function _rAccole(id,date){
    const d=new Date(date+'T12:00:00');
    for(const k of [-1,1]){
      const x=new Date(d); x.setDate(d.getDate()+k);
      if(R_ABSENT.has(indispos[id]?.[toDateStr(x)])) return true;
    }
    return false;
  }
  function _rEligible(id,cDate,cDow,ultime){
    if(cDow===0||cDow===6||dayByDate[cDate]?.isFerie||!cDate.startsWith(String(year))) return false;
    if(!_rDispo(id,cDate)) return false;
    /* Le plancher d'effectif est ABSOLU : il s'applique même en dernier recours.
       Décision du responsable le 21/08 — « on ne passe pas sous 15 ». Le mode `ultime`
       relâche le plafond par jour et l'espacement, jamais le plancher. */
    if(_rPresents(cDate)-(rParJour[cDate]||0)-1 < R_PLANCHER_PRESENTS) return false;
    if(ultime) return true;
    if((rParJour[cDate]||0)>=R_MAX_PAR_JOUR) return false;
    const cDt=new Date(cDate+'T12:00:00');
    for(let k=-3;k<=3;k++){ if(k===0) continue;
      const x=new Date(cDt);x.setDate(cDt.getDate()+k);
      if(rSet[id].has(toDateStr(x))) return false; }
    return true;
  }
  function _rPoser(id,samDate,cDate){
    rSet[id].add(cDate); rParJour[cDate]=(rParJour[cDate]||0)+1;
    liensR.push([samDate,id,cDate]); return true;
  }
  /* ORDRE DE TRAITEMENT. On parcourait les MARs dans l'ordre de la liste MEDECINS,
     chacun plaçant TOUTES ses récupérations avant le suivant. Avec l'ancien repli
     (balayage depuis le 1er janvier) cela produisait un vrai biais : inverser la
     liste déplaçait certains délais de 180 jours. On trie désormais les samedis par
     DATE, tous MARs confondus.
     ⚠️ Mesuré honnêtement le 21/08 : une fois la postériorité corrigée, ce tri
     n'apporte plus rien de chiffrable — inverser la liste bouge les délais de 10
     jours au maximum, avec ou sans lui. C'est la postériorité qui a supprimé le
     biais, pas le tri. On le garde parce que « les samedis sont servis dans l'ordre
     du calendrier » s'explique à un MAR, alors que « dans l'ordre de la liste
     MEDECINS » ne s'explique pas — et parce qu'il ne coûte rien. Ne pas lui
     attribuer un mérite qu'il n'a pas. */
  const _aPlacer=[];
  allDoctors.forEach(id=>{ (recupDue[id]||[]).forEach(sd=>_aPlacer.push([sd,id])); });
  _aPlacer.sort((a,b)=> a[0]<b[0] ? -1 : a[0]>b[0] ? 1 : 0);

  _aPlacer.forEach(([samDate,id])=>{
      /* 1) Le premier jour ouvrable APRÈS le samedi qui convient.
         Deux tours : d'abord en gardant le confort (15 présents, 2 R/jour max,
         3 jours entre deux R d'un même MAR), puis sans, si rien n'a été trouvé.
         Le second tour est indispensable : en équipe réduite le confort est
         introuvable, et sans lui seules 20 récupérations sur 104 suivaient leur
         samedi au lieu de 96 (banc du 21/08). Mieux vaut une date un peu serrée
         APRÈS la garde qu'une date confortable des mois AVANT. */
      /* Quitte à poser un jour de repos, autant qu'il serve à quelque chose : on
         cherche d'abord un jour ACCOLÉ à du repos existant. Un vendredi ou un lundi
         allonge le week-end ; un jour bordant une absence déjà posée rallonge des
         vacances ou une formation. À défaut, n'importe quel jour convient — mieux
         vaut une récupération banale qu'une récupération des mois avant la garde.
         Trois tours : jour accolé et confortable · n'importe quel jour confortable ·
         puis sans le confort (le plancher d'effectif, lui, tient toujours). */
      let placed=false;
      for(const tour of [0,1,2]){
        if(placed) break;
        for(const d of allDays){
          if(!d.isWeekday||d.date<=samDate) continue;
          const dow=new Date(d.date+'T12:00:00').getDay();
          if(tour===0&&!(dow===1||dow===5||_rAccole(id,d.date))) continue;
          if(_rEligible(id,d.date,dow,tour===2)){
            placed=_rPoser(id,samDate,d.date);
            if(tour===2) warnings.push(`R de ${id} (samedi ${samDate}) posé le ${d.date} sur une journée déjà chargée : aucune date confortable après la garde.`);
            break;
          }
        }
      }
      /* 2) Sinon, n'importe quel jour ouvrable libre, même AVANT le samedi.
         Une récupération mal datée reste due au MAR ; une récupération jamais
         posée est un jour de repos volé. Les jours les moins chargés d'abord,
         sinon la passe empile jusqu'à 5 R sur une même date (constaté au banc). */
      if(!placed){
        /* Aucune date après la garde : il faut se rabattre sur une date antérieure.
           On prend alors la PLUS PROCHE du samedi, jamais la plus ancienne.
           Pourquoi : si ce samedi change de mains, le R ne peut être transféré que
           s'il est encore à venir. Une récupération posée en janvier pour un samedi
           du 1er janvier suivant est certaine d'avoir déjà été prise ; posée fin
           décembre, elle reste transférable jusqu'au bout. */
        const avant=allDays.filter(d=>d.isWeekday&&d.date<samDate)
          .slice().sort((a,b)=> a.date<b.date ? 1 : -1);      // du plus récent au plus ancien
        for(const large of [false,true]){
          if(placed) break;
          for(const d of avant){
            if(_rEligible(id,d.date,new Date(d.date+'T12:00:00').getDay(),large)){
              placed=_rPoser(id,samDate,d.date);
              warnings.push(`R de ${id} pour le samedi ${samDate} posé le ${d.date}, AVANT la garde : aucune date libre après. Transfert impossible si ce samedi change de mains après cette date.`);
              break;
            }
          }
        }
      }
      if(!placed) warnings.push(`R de ${id} pour le samedi ${samDate} NON POSÉ : aucune date éligible dans l'année.`);
  });

  // ── 10. 18h ───────────────────────────────────────────────────────────
  const weekdays=allDays.filter(d=>d.isWeekday&&!d.isFerie);
  // (18h proportionnel) Poids = quotité (col MEDECINS) × RATIO_18 pour les "seulement 18h"
  /* (10/09/2026) POIDS PRORATISE PAR LA PRESENCE REELLE — récit : docs/JOURNAL-Planning-Med.md §119 */
  const dispo18Cnt={};
  allDoctors.forEach(id=>{dispo18Cnt[id]=weekdays.filter(d=>structAvail(id,d)).length;});
  const w18=id=>((quot[id]||100)/100)*(ONLY_18.has(id)?RATIO_18:1)
                *(weekdays.length?dispo18Cnt[id]/weekdays.length:0);
  const sumW18=allDoctors.reduce((s,id)=>s+w18(id),0);
  const baseT=sumW18?weekdays.length/sumW18:0;
  const h18T={},h18cnt={},h18A={};
  allDoctors.forEach(id=>{h18T[id]=Math.round(baseT*w18(id));h18cnt[id]=0;});
  // Disponibilité 18h : exclut absences totales, gardes/récups, semaines "off"
  // (rythme 2/2) et un autre les jeudi/vendredi (60%).
  const ABSENT_18 = new Set(['VAC','FORM','CL','TP','CTP','CP','A','RG_TRANSITION']);
  function dispo18(id,date){
    const _dd18=FLAGS.dateDebut[id], _df18=FLAGS.dateFin[id];
    if((_dd18&&date<_dd18)||(_df18&&date>=_df18)) return false;
    if(ABSENT_18.has(indispos[id]?.[date])) return false;
    if(REA1_SEM[id]&&REA1_SEM[id].has(date)) return false;   // (24/10/2026) pas de 18 h en semaine Réa 1
    if(estSemaineOff(id,date)) return false;
    if(gSet[id]?.has(date)||g2Set[id]?.has(date)||rgSet[id]?.has(date)||rSet[id]?.has(date)) return false;
    const _tp=FLAGS.tpJoursFixes[id]; // (C2-D3) jours fixes non travaillés → MEDECINS
    if(_tp && _tp.has(new Date(date+'T12:00:00').getDay())) return false;
    return true;
  }
  /* (07/09/2026) PAIRE À ÉVITER — volet 18h. Celui qui fait le 18h rentre tard : si
     son conjoint est de garde la même nuit, personne n'est à la maison. On l'écarte
     du vivier du jour. Coût quasi nul : le 18h se choisit parmi une vingtaine de
     personnes, en retirer une ne change rien à la répartition. */
  const paireDeGarde18=(id,date)=>{const gg=gardes[date]; return !!gg&&(evite(id,gg.g,date)||evite(id,gg.g2,date));};
  const h18wk={}; // semaines ISO où chaque MAR a déjà fait un 18h (≤ 1 par semaine)
  const did18wk=(id,date)=> h18wk[id]?h18wk[id].has(dayByDate[date].wk):false;
  const set18=(id,date)=>{ h18A[date]=id; h18cnt[id]++; (h18wk[id]||(h18wk[id]=new Set())).add(dayByDate[date].wk); };
  weekdays.forEach(day=>{
    const veille=toDateStr(new Date(new Date(day.date+'T12:00:00').getTime()-86400000)); // pas 2 x 18h d'affilée
    // (18h veille de garde samedi) le vendredi, le 18h revient au MAR de garde (G) du samedi
    if(day.dow===5){
      const satDate=toDateStr(new Date(new Date(day.date+'T12:00:00').getTime()+86400000));
      const satG=gardes[satDate]?.g;
      // La règle cède si le G du samedi est le conjoint d'un MAR de garde CE vendredi :
      // on retombe alors sur le vivier normal (quelques fois par an, sans conséquence).
      if(satG&&dispo18(satG,day.date)&&h18A[veille]!==satG&&!did18wk(satG,day.date)
         &&!paireDeGarde18(satG,day.date)){set18(satG,day.date);return;}
    }
    // Replis successifs : on lève d'abord INDISPO, puis la veille, et seulement
    // en tout dernier recours la règle "≤ 1 par semaine".
    const _libre=id=>!paireDeGarde18(id,day.date);
    let pool=allDoctors.filter(id=>_libre(id)&&dispo18(id,day.date)&&h18A[veille]!==id&&!did18wk(id,day.date)&&indispos[id]?.[day.date]!=='INDISPO');
    if(!pool.length) pool=allDoctors.filter(id=>_libre(id)&&dispo18(id,day.date)&&h18A[veille]!==id&&!did18wk(id,day.date));
    if(!pool.length) pool=allDoctors.filter(id=>_libre(id)&&dispo18(id,day.date)&&!did18wk(id,day.date)); // garde "1/semaine"
    if(!pool.length) pool=allDoctors.filter(id=>_libre(id)&&dispo18(id,day.date));
    if(!pool.length) pool=allDoctors.filter(id=>dispo18(id,day.date)); // dernier recours absolu : la paire cède
    if(!pool.length){warnings.push(`Aucun 18h ${day.date}`);return;}
    pool.sort((a,b)=>(h18cnt[a]/(h18T[a]||1))-(h18cnt[b]/(h18T[b]||1)));
    set18(pool[0],day.date);
  });

  /* (05/10/2026) PAIRE À ÉVITER — AVERTIR QUAND LA RÈGLE A CÉDÉ. Elle cède en
     silence quand la couverture l'exige (seul binôme possible, samedi à
     préserver, dernier recours du 18 h) : décision voulue, l'équité et la
     couverture priment. Mais le comité doit le voir pour arbitrer à la main
     (échange). Un seul message par paire, toutes ses dates, en TÊTE de liste
     pour qu'il ne soit jamais coupé. Les dates exemptées (24, 25, 31/12, 01/01)
     ne sont pas signalées : la règle ne s'y applique pas. */
  { const _pv={};
    allDays.forEach(day=>{
      const g=gardes[day.date]; if(!g) return;
      const add=(a,b,txt)=>{const k=[a,b].sort().join(' + ');(_pv[k]||(_pv[k]=[])).push(day.date+txt);};
      if(evite(g.g,g.g2,day.date)) add(g.g,g.g2,'');
      const h=h18A[day.date];
      [g.g,g.g2].forEach(x=>{ if(h&&evite(h,x,day.date)) add(h,x,' (18 h)'); });
    });
    Object.keys(_pv).reverse().forEach(k=>warnings.unshift(`Paire à éviter : ${k} ensemble le ${_pv[k].join(', ')} — aucun autre choix ne préservait la couverture`));
  }

  // ── 11. Compteurs JF/Noël (la VJF de semaine est comptée dans cnt.vjf) ──
  const jfCnt={},noelAnCnt={};
  allDoctors.forEach(id=>{jfCnt[id]=0;noelAnCnt[id]=0;});
  const NOEL=new Set();
  [year,year+1].forEach(y=>[`${y}-12-24`,`${y}-12-25`,`${y}-12-31`,`${y+1}-01-01`].forEach(d=>NOEL.add(d)));
  allDays.forEach(day=>{
    const gg=gardes[day.date]||{};
    [gg.g,gg.g2].forEach(id=>{
      if(!id) return;
      if(day.isFerie)jfCnt[id]=(jfCnt[id]||0)+1;
      if(NOEL.has(day.date))noelAnCnt[id]=(noelAnCnt[id]||0)+1;
    });
  });

  /* (04/09/2026) CALCUL À BLANC — on s'arrête ICI, avant le premier geste
     visible. Tout ce qui suit écrit dans le classeur ou notifie l'équipe ;
     tout ce qui précède n'a fait que lire et calculer. La frontière est nette,
     et c'est ce qui rend la promesse d'invisibilité tenable. */
  /* (11/10/2026) COUPLES DE WEEK-END — bilan : week-ends liés (l'un au
     vendredi-dimanche, l'autre au samedi) et week-ends bloqués au foyer (au moins
     une garde de l'un ou l'autre du vendredi au dimanche). Vide sans la ligne CONFIG. */
  function _couplesWEBilan_(){
    const out=[]; const vus=new Set();
    Object.keys(CPL_WE).sort().forEach(function(a){ const b=CPL_WE[a]; if(vus.has(a)) return; vus.add(a); vus.add(b);
      let lies=0, bloques=0;
      allDays.filter(function(d){return d.dow===5;}).forEach(function(d){
        const f=d.date, sa=shiftDays(f,1), su=shiftDays(f,2);
        const tient=function(id){ return [f,sa,su].some(function(x){ const g=gardes[x]; return g&&(g.g===id||g.g2===id); }); };
        if(tient(a)||tient(b)) bloques++;
        const vd=_cplVDde(f), gs=gardes[sa]||{};
        if(vd.some(function(x){ const p=CPL_WE[x]; return p&&(gs.g===p||gs.g2===p); })) lies++;
      });
      out.push({ couple: a+' + '+b, lies: lies, bloques: bloques });
    });
    return out;
  }
  /* (22/10/2026) TAUX RAPPORTÉ AU POSSIBLE. honorés ÷ posés pénalisait celui qui
     pose plus que sa part : 10 jeudis souhaités pour une part de 6, 6 obtenus,
     affichait 60 % alors que l'algorithme ne pouvait pas faire mieux. Le
     « possible » reprend les limites mêmes de la passe des souhaits : jeudis,
     samedis et week-ends jusqu'à la part arrondie à l'inférieur ; une seule
     unité fériée ou veille de férié (joker) ; lundi-mardi-mercredi jusqu'au
     budget de semaine ; le tout sous la cible totale. Les honorés sont comptés
     famille par famille, sans dépasser le possible de chaque famille : une garde
     de plus obtenue par l'équité ne fait pas passer le taux au-delà de 100 %.
     Profils « souhaits garantis » : le possible est tout ce qu'ils ont posé.
     Partagé par l'essai (bilan affiché) et la vraie génération (colonne
     SOUHAITS POSSIBLES de STATS_GARDES, lue par le mail « Vos gardes »). */
  function _uniteFixe(date){   // déclaration : utilisée aussi par la passe des souhaits, plus haut
    const di = dayByDate[date]; if(!di) return null;
    if(di.dow===5||di.dow===0){
      const ven = di.dow===5?date:shiftDays(date,-2), dim = di.dow===5?shiftDays(date,2):date;
      return { jours:[ven,dim], vd:true };
    }
    if(di.isFerie&&di.dow===4) return { jours:[date,shiftDays(date,2)] };
    if(di.isFerie&&di.dow===1) return { jours:[shiftDays(date,-2),date] };
    if(di.dow===6){
      const thu=shiftDays(date,-2), mon=shiftDays(date,2);
      if(dayByDate[thu]&&dayByDate[thu].isFerie&&dayByDate[thu].dow===4) return { jours:[thu,date] };
      if(dayByDate[mon]&&dayByDate[mon].isFerie&&dayByDate[mon].dow===1) return { jours:[date,mon] };
    }
    return { jours:[date] };
  };
  function souhaitsPossibles_(id){
    let poses = 0, honores = 0;
    const fam = { jeu:{}, sam:{}, vd:{}, joker:{}, libre:{} };   // clé d'unité -> {voulus, obtenus}
    Object.keys(souhaits || {}).forEach(function(ds){
      if((souhaits[ds] || []).indexOf(id) < 0) return;
      const g = gardes[ds], obtenu = !!(g && (g.g === id || g.g2 === id));
      poses++; if(obtenu) honores++;
      if(!dayByDate[ds]) return;
      let f, cle = ds;
      if(estJourLibre(ds)) f = 'libre';
      else {
        const un = _uniteFixe(ds), c = coutAxesUnite(un);
        cle = un.jours.join('+');
        f = (c.vjf||c.ferie||c.jf) ? 'joker' : c.vd ? 'vd' : c.sam ? 'sam' : c.jeu ? 'jeu' : 'libre';
      }
      const u = fam[f][cle] || (fam[f][cle] = { voulus:0, obtenus:0 });
      u.voulus++; if(obtenu) u.obtenus++;
    });
    if(SOUHAIT_PLAFOND.has(id) || !cible[id]) return { possible:poses, utiles:Math.min(honores, poses) };
    const plafond = { jeu:Math.floor(cible[id].jeu), sam:Math.floor(cible[id].sam), vd:Math.floor(cible[id].vd),
                      joker:SOUHAIT_QUOTA_RARE, libre:Math.max(0, Math.ceil(freeBudget[id] || 0)) };
    let possible = 0, utiles = 0;
    Object.keys(fam).forEach(function(f){
      const us = Object.keys(fam[f]).map(function(k){ return fam[f][k]; });
      // le possible d'une famille : les unités les plus « remplies », dans la limite du plafond
      const p = us.map(function(u){ return u.voulus; }).sort(function(x,y){ return y-x; })
                  .slice(0, Math.max(0, plafond[f])).reduce(function(t,v){ return t+v; }, 0);
      const o = us.reduce(function(t,u){ return t+u.obtenus; }, 0);
      possible += p; utiles += Math.min(o, p);
    });
    possible = Math.min(possible, Math.floor(cible[id].total));
    return { possible:possible, utiles:Math.min(utiles, possible) };
  }

  if(DRY){
    const _AXES=['total','sam','jeu','vd','vjf','jf'];
    const ecarts={};
    _AXES.forEach(function(k){
      let pire=0, qui='';
      gardeDoctors.forEach(function(id){
        if(!cnt[id]||!cible[id]) return;
        const cb=cible[id][k]; if(!(cb>0)) return;
        const e=Math.abs(cnt[id][k]-cb);
        if(e>pire){ pire=e; qui=id; }
      });
      ecarts[k]={ ecart:Math.round(pire*100)/100, mar:qui };
    });
    const sansBinome=allDays.filter(function(d){
      const g=gardes[d.date]; return !g||!g.g||!g.g2;
    }).map(function(d){return d.date;});
    /* Les compteurs BRUTS, en entiers. C'est par eux que le banc prouve qu'un
       calcul à blanc et une vraie génération produisent le MÊME planning : les
       écarts ci-dessus ne le prouveraient pas, l'onglet STATS arrondissant la
       cible au dixième alors qu'on la garde ici en pleine précision. */
    const compteurs={};
    gardeDoctors.forEach(function(id){
      if(!cnt[id]) return;
      compteurs[id]={ total:cnt[id].total, g:cnt[id].g, g2:cnt[id].g2,
                      sam:cnt[id].sam, jeu:cnt[id].jeu, vd:cnt[id].vd, vjf:cnt[id].vjf };
    });
    warnings.forEach(function(w){ Logger.log(w); });
    /* (08/09/2026) LE CALCUL À BLANC EST LE SEUL ÉCRAN — récit : docs/JOURNAL-Planning-Med.md §120 */
    const cibles = {}, jf = {}, noel = {}, h18 = {};
    gardeDoctors.forEach(function(id){
      if(!cnt[id]) return;
      cibles[id] = cible[id] ? { total:cible[id].total, sam:cible[id].sam, jeu:cible[id].jeu,
                                 vd:cible[id].vd, vjf:cible[id].vjf, jf:cible[id].jf } : null;
      jf[id] = jfCnt[id] || 0;
      noel[id] = noelAnCnt[id] || 0;
      h18[id] = h18cnt[id] || 0;
    });

    /* Souhaits : combien chacun en a posé, combien ont été honorés. C'est la
       question que le comité pose en premier, et l'aperçu n'y répondait pas. */
    const souhaitsBilan = {};
    Object.keys(souhaits || {}).forEach(function(ds){
      (souhaits[ds] || []).forEach(function(id){
        if(!souhaitsBilan[id]) souhaitsBilan[id] = { poses:0, honores:0 };
        souhaitsBilan[id].poses++;
        const g = gardes[ds];
        if(g && (g.g === id || g.g2 === id)) souhaitsBilan[id].honores++;
      });
    });
    Object.keys(souhaitsBilan).forEach(function(id){
      const p = souhaitsPossibles_(id);
      souhaitsBilan[id].possible = p.possible; souhaitsBilan[id].honoresUtiles = p.utiles;
    });

    /* Qui tient les quatre nuits de fêtes : la question la plus regardée. */
    const fetes = {};
    [year + '-12-24', year + '-12-25', year + '-12-31', (year+1) + '-01-01'].forEach(function(d){
      const g = gardes[d];
      if(g) fetes[d] = [g.g || '—', g.g2 || '—'];
    });

    /* La règle des paires ne produit aucun message : on vérifie ici qu'elle a
       tenu, plutôt que de l'affirmer. Le 18 h compte comme une sortie. */
    const pairesBilan = [];
    /* PAIRES_EV est une TABLE symétrique { A: Set(B), B: Set(A) }, pas une liste
       de couples : on la déplie en paires uniques, chacune une seule fois. */
    const couples = [];
    Object.keys(PAIRES_EV || {}).forEach(function(a1){
      (PAIRES_EV[a1] ? Array.from(PAIRES_EV[a1]) : []).forEach(function(b1){
        if(a1 < b1) couples.push([a1, b1]);
      });
    });
    couples.forEach(function(paire){
      const a2 = paire[0], b2 = paire[1], nuits = [];
      allDays.forEach(function(day){
        const g = gardes[day.date] || {};
        const role = function(id){
          if(g.g === id || g.g2 === id) return 'garde';
          if(h18A[day.date] === id) return '18h';
          return null;
        };
        const ra = role(a2), rb = role(b2);
        if(ra && rb) nuits.push(day.date + ' (' + ra + ' / ' + rb + ')');
      });
      pairesBilan.push({ paire: a2 + ' + ' + b2, nuits: nuits });
    });

    /* (11/09/2026) AXES RARES — le détail, parce que le calcul à blanc est le
       seul écran. Sur un axe où l'on est dû une veille de férié TOUS LES DEUX
       ANS, un écart de 1 ne se lit pas : il faut voir qui a eu quelle date, et
       pourquoi celui qui la devait ne l'a pas eue. Rien n'est recalculé ici :
       on relit le planning terminé et les mêmes motifs que le générateur. */
    const RARES = { vjf:'VEILLES DE FÉRIÉ', jf:'JOURS FÉRIÉS' };
    const raresDetail = {}, raresManque = {};
    Object.keys(RARES).forEach(function(axe){
      const jours = (AX[axe]||[]).map(function(d){return d.date;}).sort();
      raresDetail[axe] = jours.map(function(ds){
        const g = gardes[ds] || {};
        return { date:ds, dow:(dayByDate[ds]?dayByDate[ds].dow:null),
                 g:g.g||'—', g2:g.g2||'—' };
      });
      /* Qui est sous sa part sur cet axe, et ce qui s'est passé pour lui à
         chaque date. On compare au réel EXACT, pas à la cible arrondie : sur
         un axe aussi maigre, l'arrondi masque tout. */
      const sous = [];
      gardeDoctors.forEach(function(id){
        if(!cnt[id] || !axisEligible(axe,id)) return;
        const ex = (cibleExacte[id]||{})[axe];
        const re = axe==='jf' ? (jfCnt[id]||0) : (cnt[id][axe]||0);
        if(ex===undefined || re >= ex - 0.001) return;
        const motifs = {};
        jours.forEach(function(ds){
          const g = gardes[ds] || {};
          if(g.g===id || g.g2===id) { motifs.eu = (motifs.eu||0)+1; return; }
          const m = motifBlocage(id, ds);
          const cle = m && m.texte ? m.texte : 'disponible, non retenu';
          motifs[cle] = (motifs[cle]||0)+1;
        });
        sous.push({ id:id, reel:re, part:Math.round(ex*100)/100, motifs:motifs });
      });
      sous.sort(function(a,b){ return (a.reel-a.part)-(b.reel-b.part); });
      raresManque[axe] = sous;
    });

    /* La part EXACTE avant arrondi, à côté de la cible. Un 6 en face d'un 5,539
       n'est pas un 6 juste : c'est un arrondi à la hausse, et le lecteur doit
       pouvoir le voir sans ouvrir l'onglet des statistiques. */
    const partExacte = {};
    gardeDoctors.forEach(function(id){
      if(!cnt[id] || !cibleExacte[id]) return;
      const e = cibleExacte[id]; const a = {};
      ['total','sam','jeu','vd','vjf','jf'].forEach(function(k){
        if(e[k]!==undefined) a[k]=Math.round(e[k]*1000)/1000;
      });
      partExacte[id] = a;
    });

    /* CUMUL DES ANNÉES PRÉCÉDENTES. La donnée existe depuis 2026-09-11.1 : on
       additionne, pour chaque axe, le réel moins la part exacte des années déjà
       en mémoire. C'est la seule lecture qui vaille sur un axe rare — une année
       seule n'y dit rien. */
    const cumulPrec = {}; const anneesLues = [];
    for(let _y=year-1; _y>=year-6; _y--){
      const _sh = ss.getSheetByName('STATS_GARDES_'+_y);
      if(!_sh) continue;
      const _v = _sh.getDataRange().getValues(); if(_v.length<2) continue;
      const _h = _v[0].map(function(x){return String(x).trim();});
      const _iEx = { total:_h.indexOf('PART EXACTE'), sam:_h.indexOf('PART EXACTE SAM'),
                     jeu:_h.indexOf('PART EXACTE JEU'), vd:_h.indexOf('PART EXACTE VD'),
                     vjf:_h.indexOf('PART EXACTE VJF'), jf:_h.indexOf('PART EXACTE JF') };
      if(_iEx.total<0) continue;                       // année écrite avant la part exacte
      const _iRe = { total:_h.indexOf('TOTAL G'), sam:_h.indexOf('SAM'), jeu:_h.indexOf('JEU'),
                     vd:_h.indexOf('VD'), vjf:_h.indexOf('VEILLE JF'), jf:_h.indexOf('JF') };
      anneesLues.push(_y);
      for(let _r=1; _r<_v.length; _r++){
        const _id = String(_v[_r][0]).trim(); if(!_id) continue;
        Object.keys(_iEx).forEach(function(k){
          const ex = Number(_v[_r][_iEx[k]]); if(!ex && ex!==0) return;
          if(_v[_r][_iEx[k]]==='') return;
          const re = Number(_v[_r][_iRe[k]])||0;
          if(!cumulPrec[_id]) cumulPrec[_id]={};
          cumulPrec[_id][k] = (cumulPrec[_id][k]||0) + re - ex;
        });
      }
    }

    return { dryRun:true, year:year, ms:Date.now()-_tGen,
             raresDetail:raresDetail, raresManque:raresManque,
             partExacte:partExacte, cumulPrec:cumulPrec, anneesLues:anneesLues.sort(),
             ecarts:ecarts, compteurs:compteurs, cibles:cibles,
             jf:jf, noel:noel, h18:h18, souhaits:souhaitsBilan,
             fetes:fetes, paires:pairesBilan, couplesWE:_couplesWEBilan_(), coupleAssoupli:_cplOn&&CPL_SANS_BONUS,
             rea1:rea1Bilan,
             sansBinome:sansBinome.length, jours:sansBinome.slice(0,10),
             gardeurs:gardeDoctors.filter(function(id){return cnt[id];}).length,
             warnings: warnings.slice(0, 60), nbWarnings: warnings.length };
  }

  // ── 12. Écrire GARDES_YYYY ────────────────────────────────────────────
  let gs=ss.getSheetByName(`GARDES_${year}`);if(gs)ss.deleteSheet(gs);
  gs=ss.insertSheet(`GARDES_${year}`);gs.setFrozenRows(3);
  const ROUGE='#C0392B',GRIS='#CFD8DC',BLANC='#FFFFFF';
  const JOURS=['D','L','M','M','J','V','S'];
  const nCols=allDays.length+1;
  const row1=['MEDECIN'];allDays.forEach(()=>row1.push(''));
  gs.getRange(1,1,1,nCols).setValues([row1]);
  gs.getRange(1,1).setFontWeight('bold').setBackground(ROUGE).setFontColor('#FFFFFF');
  // (UX) En-têtes de mois par tranches hebdomadaires : le mois reste visible à
  // toute position de scroll (helper partagé ecrireEntetesMois, code.gs).
  // Corrige aussi l'ancien bug mStart=1 : la fusion « Janvier » avalait A1 (MEDECIN).
  ecrireEntetesMois(gs, allDays);
  const row2=['JOUR'];allDays.forEach(d=>row2.push(JOURS[d.dow]));
  gs.getRange(2,1,1,nCols).setValues([row2]);gs.getRange(2,1).setFontWeight('bold').setBackground(ROUGE).setFontColor('#FFFFFF');
  const row3=['N°'];allDays.forEach(d=>row3.push(d.date.slice(-2)));
  gs.getRange(3,1,1,nCols).setValues([row3]);gs.getRange(3,1).setFontWeight('bold').setBackground(ROUGE).setFontColor('#FFFFFF');
  const dRows=allDoctors.map(id=>{
    const row=[id];
    allDays.forEach(day=>{
      let v='';
      if(gSet[id]?.has(day.date))v='G';
      else if(g2Set[id]?.has(day.date))v='G2';
      else if(rgSet[id]?.has(day.date)||indispos[id]?.[day.date]==='RG_TRANSITION')v='RG';
      else if(rSet[id]?.has(day.date))v='R';
      else if(h18A[day.date]===id)v='18';
      // (31/07/2026) « I » (indispo garde) N'EST PLUS recopie dans GARDES : l'info
      // vit dans INDISPOS, sa place. Recopiee ici, elle devenait un « statut » que
      // 4 ecrans interpretaient comme une ABSENCE — le MAR disparaissait de son
      // secteur alors qu'il travaille normalement (842 cas sur 2027).
      else{const s=indispos[id]?.[day.date];if(s==='VAC')v='V';else if(s==='FORM')v='F';else if(s==='CL')v='CL';else if(s==='TP'||s==='CTP')v='TP';}
      row.push(v);
    });
    return row;
  });
  gs.getRange(4,1,dRows.length,nCols).setValues(dRows);
  // OPTIM : construire la matrice de fonds et l'appliquer en UN appel (setBackgrounds)
  const nRows=3+dRows.length;
  // Grisage WE/fériés : lignes 2..nRows uniquement — la ligne 1 (bandeau des mois)
  // garde ses teintes alternées posées par ecrireEntetesMois.
  const bgMatrix=[];
  for(let r=1;r<nRows;r++){
    const rowBg=[];
    allDays.forEach(day=>{rowBg.push((day.dow===0||day.dow===6||day.isFerie)?GRIS:BLANC);});
    bgMatrix.push(rowBg);
  }
  gs.getRange(2,2,nRows-1,allDays.length).setBackgrounds(bgMatrix);
  // Bordures de fin de mois : un seul passage, regroupé
  allDays.forEach((day,i)=>{
    if(!allDays[i+1]||allDays[i+1].month!==day.month){
      gs.getRange(1,i+2,nRows,1).setBorder(null,null,null,true,null,null,'#000000',SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  });
  // OPTIM : largeurs en une fois via setColumnWidths
  gs.setColumnWidth(1,120);
  gs.setColumnWidths(2,nCols-1,35);
  gs.getRange(1,2,nRows,nCols-1).setHorizontalAlignment('center');

  // ── 13. STATS ─────────────────────────────────────────────────────────
  let st=ss.getSheetByName(`STATS_GARDES_${year}`);if(st)ss.deleteSheet(st);
  st=ss.insertSheet(`STATS_GARDES_${year}`);
  // Les deux dernières colonnes (souhaits) sont AJOUTÉES EN FIN et jamais intercalées :
  // code.gs lit encore des colonnes par position (sd[r][17], [19], [21]) et un décalage
  // fausserait silencieusement les cibles du tableau de bord.
  /* (11/09/2026) PART EXACTE — récit : docs/JOURNAL-Planning-Med.md §121 */
  st.getRange(1,1,1,33).setValues([['MEDECIN','CIBLE','TOTAL G','G (REA)','G2 (MAT)','LUN','MAR','MER','JEU','VEN','SAM','DIM','RECUP R','18H','JF','VEILLE JF','NOEL/AN','CIBLE SAM','CIBLE JEU','CIBLE VD','VD','CIBLE VJF','CIBLE JF','SOUHAITS POSES','SOUHAITS HONORES','PART EXACTE','PART EXACTE SAM','PART EXACTE JEU','PART EXACTE VD','PART EXACTE VJF','PART EXACTE JF','SOUHAITS POSSIBLES','SOUHAITS POSSIBLES OBTENUS']]).setFontWeight('bold');
  // (22/10/2026) Les deux dernières colonnes : souhaits que l'algorithme pouvait accorder
  // au mieux vu la part du MAR, et combien de ceux-là sont obtenus (souhaitsPossibles_).
  // Ajoutées EN FIN de ligne : aucune colonne lue par position ne bouge.
  // Souhaits honorés = dates souhaitées où le MAR est effectivement de garde dans le
  // planning FINAL, quelle que soit la passe qui l'y a placé.
  const souhaitJoursOK={};
  allDoctors.forEach(id=>{
    let k=0;
    Object.keys(souhaits).forEach(d=>{
      if(souhaits[d].indexOf(id)<0) return;
      if((gSet[id]&&gSet[id].has(d))||(g2Set[id]&&g2Set[id].has(d))) k++;
    });
    souhaitJoursOK[id]=k;
  });
  const _spMemo={}; const _sp=id=>_spMemo[id]||(_spMemo[id]=souhaitsPossibles_(id));
  const sRows=allDoctors.map(id=>{
    const cbT=cible[id]?cible[id].total:0;
    const cbS=cible[id]?cible[id].sam:0, cbJ=cible[id]?cible[id].jeu:0, cbV=cible[id]?cible[id].vd:0, cbVjf=cible[id]?cible[id].vjf:0;
    const cbJf=cible[id]?cible[id].jf:0; // (RH-3) exploité par la dette de N+1
    const c=cnt[id]||{total:0,g:0,g2:0,lun:0,mar:0,mer:0,jeu:0,ven:0,sam:0,dim:0,recupR:0,vd:0,vjf:0};
    // (11/09/2026) Part exacte, avant arrondi. Trois decimales : le reliquat vaut
    // quelques dixiemes, l'arrondir a un dixieme le perdrait a moitie.
    const ex=cibleExacte[id]||{};
    const _ex=k=>ex[k]===undefined?'':+Number(ex[k]).toFixed(3);
    return[id,"'"+cbT.toFixed(1),c.total,c.g,c.g2,c.lun,c.mar,c.mer,c.jeu,c.ven,c.sam,c.dim,c.recupR,
      h18cnt[id]||0,jfCnt[id]||0,c.vjf||0,noelAnCnt[id]||0,
      +cbS.toFixed(1),+cbJ.toFixed(1),+cbV.toFixed(1),c.vd||0,+cbVjf.toFixed(1),+cbJf.toFixed(1),
      souhaitPose[id]||0,souhaitJoursOK[id]||0,
      _ex('total'),_ex('sam'),_ex('jeu'),_ex('vd'),_ex('vjf'),_ex('jf'),
      _sp(id).possible,_sp(id).utiles];
  });
  st.getRange(2,1,sRows.length,33).setValues(sRows);
  st.getRange(2,2,sRows.length,1).setNumberFormat('@STRING@');
  st.setColumnWidth(1,140);

  // ── LIENS_R : quel R appartient à quel samedi ─────────────────────────
  /* (13/08/2026 — échanges de gardes, lot 1) Une ligne par (samedi, tenant).
     Consommateur : le cycle d'échange (phase 3) — un samedi qui change de
     mains y retrouve SON R par le couple (SAMEDI, MEDECIN) et le transfère ;
     la ligne est alors mise à jour (MEDECIN = receveur). Lecture seule pour
     tout le reste. Un R jamais posé (cas théorique) = pas de ligne. */
  let lr=ss.getSheetByName(`LIENS_R_${year}`);if(lr)ss.deleteSheet(lr);
  lr=ss.insertSheet(`LIENS_R_${year}`);
  lr.getRange(1,1,1,3).setValues([['SAMEDI','MEDECIN','DATE R']]).setFontWeight('bold');
  if(liensR.length){
    liensR.sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:(x[1]<y[1]?-1:1));
    // (14/08/2026) Format TEXTE d'abord : sans lui, Sheets transforme les
    // dates écrites en vraies dates, et le transfert de R ne les retrouve
    // plus (même défaut que l'onglet ECHANGES, trouvé au premier test réel).
    lr.getRange(2,1,liensR.length,3).setNumberFormat('@').setValues(liensR);
  }
  lr.setColumnWidth(1,110);lr.setColumnWidth(2,140);lr.setColumnWidth(3,110);

  // (31/07/2026) Les avertissements partaient UNIQUEMENT dans Logger.log (journal
  // d'execution Apps Script, invisible depuis l'application) et dans un getUi().alert()
  // qui leve une exception quand la fonction est appelee par la Web App — exception
  // avalee par le try/catch juste en dessous. Resultat : replis de couplage, exceptions
  // VD, « Manque MAR », passe de confort... TOUT etait perdu, et une annee entiere se
  // generait a l'aveugle. Ils sont desormais RENVOYES a l'appelant, qui les affiche.
  warnings.forEach(w=>Logger.log(w));
  const gd=gardeDoctors.filter(id=>cnt[id]);
  const noWE=gd.filter(id=>!NO_WEEKEND.has(id));
  const stat=(arr,k)=>{const v=arr.map(id=>cnt[id][k]);return`${Math.min(...v)}–${Math.max(...v)}`;};
  try{
    SpreadsheetApp.getUi().alert(
      `✅ Planning ${year}\n\n`+
      `Total   : ${stat(gd,'total')}\n`+
      `Samedi  : ${stat(noWE,'sam')}\n`+
      `Jeudi   : ${stat(gd,'jeu')}\n`+
      `VD      : ${stat(noWE,'vd')}\n`+
      `VeilleJF: ${stat(gd,'vjf')}\n`+
      `G/G2    : ${stat(gd,'g')} / ${stat(gd,'g2')}\n`+
      `Exceptions VD : ${warnings.filter(w=>w.includes('VD')).length}`
    );
  }catch(e){Logger.log('✅ généré');}
  /* (12/08/2026) Notification de fin de génération — phase 1 du canal push.
     Dans un try à part : ne doit JAMAIS faire échouer une génération réussie. */
  try {
    /* (25/08/2026) Le message partait à TOUS les abonnés, vers ' — récit : docs/JOURNAL-Planning-Med.md §122 */
    notifierPush_('Votre planning ' + year + ' est disponible',
      'Vos gardes de l\'année sont réparties. Retrouvez-les dans « Mes gardes ».',
      './index.html#mes-gardes', { role: 'mar' });
  } catch (e) { /* silencieux : la génération, elle, a réussi */ }
  return { warnings: warnings.slice(0, 60), nbWarnings: warnings.length };
}

// Déplace GARDES/INDISPOS/STATS/AFFECTATIONS de l'année N vers le classeur d'archives.
// Sûr : copie → vérifie → supprime. À tester en isolé AVANT de câbler en W3.
function archiveMoveTabs_(year) {
  const master = SpreadsheetApp.getActiveSpreadsheet();
  if (!ARCHIVE_SS_ID) throw new Error('ARCHIVE_DRIVE_ID absent de l\'onglet CONFIG : archivage impossible');
  const arch   = SpreadsheetApp.openById(ARCHIVE_SS_ID);
  const noms = ['GARDES_'+year, 'INDISPOS_'+year, 'STATS_GARDES_'+year, 'AFFECTATIONS_'+year, 'LIENS_R_'+year]; // (13/08/2026) LIENS_R suit le même cycle de vie annuel
  const rapport = [];
  noms.forEach(nom => {
    const src = master.getSheetByName(nom);
    if (!src) { rapport.push('⏭️ '+nom+' : absent du maître'); return; }
    if (arch.getSheetByName(nom)) { rapport.push('✓ '+nom+' : déjà archivé (maître non touché)'); return; }
    const copie = src.copyTo(arch);
    copie.setName(nom);
    const coherent = copie.getLastRow() === src.getLastRow()
                  && copie.getLastColumn() === src.getLastColumn();
    if (!coherent) { arch.deleteSheet(copie); rapport.push('⚠️ '+nom+' : copie incohérente → suppression ANNULÉE'); return; }
    master.deleteSheet(src);
    rapport.push('📦 '+nom+' : archivé puis retiré du maître');
  });
  Logger.log(rapport.join('\n'));
  return rapport;
}
