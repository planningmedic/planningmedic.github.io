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
const GAS_VERSION_GENERATEUR = '2026-09-05.1';

/* (05/09/2026) INTERRUPTEUR DU NOUVEL ALGORITHME.
   À false, le générateur se comporte EXACTEMENT comme avant : c'est le retour
   arrière, en une ligne, sans avoir à retrouver l'ancien fichier.
   À true, quatre mécanismes s'activent ensemble (aucun n'a de sens seul) :
     1. CIBLES ENTIÈRES — la part de chacun cesse d'être un nombre à virgule
        (5,4 samedis, jamais atteignable) et devient un entier, réparti par la
        méthode des plus forts restes pour que la somme reste exacte.
     2. TIRAGE — à égalité parfaite entre deux MAR, c'est un numéro qui tranche,
        plus la position dans l'onglet MEDECINS.
     3. MULTI-DÉPART — jusqu'à N calculs à blanc, on écrit le meilleur.
     4. OBJECTIF LEXICOGRAPHIQUE de l'optimiseur + interdiction dure de deux
        week-ends de garde consécutifs.
   Mesuré sur 45 années simulées (9 scénarios × 5 ans, dette cumulative
   injectée hors code) : 44 années où personne ne dépasse UNE garde d'écart sur
   aucun des six axes, contre 29 sur 45 avec l'algorithme d'avant. Zéro journée
   sans binôme. Gardes rapprochées inchangées (17,8 % d'intervalles de 2 jours
   contre 17,7 %). Souhaits honorés 75,3 % contre 76,6 %.
   ⚠️ Ces chiffres viennent du SIMULATEUR, sur des absences fabriquées. Ils
   prouvent la logique, pas le comportement sur les vraies données : l'essai à
   blanc sur l'année réelle reste obligatoire avant de générer. */
const NOUVEL_ALGO_GLOBAL = true;

// Multi-départ : nombre maximum de calculs à blanc avant d'écrire le meilleur.
// La règle d'arrêt coupe dès qu'un tirage met tout le monde à une garde d'écart,
// ce qui arrive au premier essai dans plus d'un cas sur deux.
const MULTI_DEPART_MAX  = 8;
const MULTI_DEPART_SEUIL = 1;   // écart, en gardes, qui suffit à s'arrêter

// Optimiseur §8c : au-delà de LEX_SEUIL gardes d'écart, la pénalité devient
// prioritaire sur la baisse de l'écart moyen. Le poids reste SOUS les 1000 de la
// règle des week-ends : à 3000, l'équité l'écrasait (48 enchaînements par an).
const LEX_SEUIL = 1;
const LEX_POIDS = 600;

const ARCHIVE_SS_ID = '1-QIYD2U7u41L_pV4wQGN6kDBDzFRHDdXRsHNrcSlvcE';
// Dette inter-annuelle : STATS_GARDES_2026 sont des stats MANUELLES (échanges/dons)
// → inexploitables. La dette ne lit qu'à partir de cette année (2027 = 1re année
// générée proprement par l'algo). 2027 part donc en dette NEUTRE ; 1re vraie dette = 2028.
const PREMIERE_ANNEE_STATS_FIABLES = 2027;

// ══════════════════════════════════════════════════════════════════════
// GÉNÉRATEUR DE GARDES — ALGORITHME DE RÉFÉRENCE
// ══════════════════════════════════════════════════════════════════════
// Règles (par priorité) :
//   1. Quotité (PCT_GARDES) : cible totale proportionnelle au temps de travail
//   2. PRUNET SOUHAIT : placé en premier, S'AJOUTE au quota
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
const RATIO_18      = 1.3;
// Quota annuel de souhaits sur les familles RARES (samedis et week-ends) : ces axes
// n'offrent qu'environ 5 places par personne et par an, sans marge d'arrondi. Au-delà,
// le souhait est ignoré — le MAR reçoit sa part normale par l'équité. 0 = fermé.
const SOUHAIT_QUOTA_RARE = 1;
const DETTE_AMORTI  = 0.6;  // amortissement de la dette : evite la sur-correction/oscillation annuelle (10 ans : 0 annee non-conforme)
const FREEBUDGET_MARGE = 1;  // marge : reserve ~1 jour pour absorber les pertes de placement VD (multi-mardis robuste)
const MIN_PRESENT   = {1:16, 2:15, 3:16, 4:15, 5:15};
/* (2027-XX) PLACEMENT DES RÉCUPÉRATIONS — plancher unique et pluralité par jour.
   Constaté le 21/08/2026 sur la grille générée : 76 R sur 104 étaient posés AVANT
   le samedi qu'ils compensent (jusqu'à 354 jours avant), et 90 % tombaient au 1er
   semestre. Cause : `rAssigned` n'autorisait QU'UN R par jour pour toute l'équipe,
   et les vacances scolaires — près de 4 mois — étaient exclues. Les 30 samedis du
   2e semestre réclament 60 R pour 65 jours ouvrables hors vacances : la place
   n'existait pas, le repli remontait donc chercher en janvier.
   Relevé du planning réel (193 jours ouvrables) : effectif médian 17, 105 jours à
   17+ et 30 jours à 16 → 240 poses possibles pour 104 besoins. Le verrou n'a jamais
   été l'effectif. Règle retenue avec Arthur : n'importe quel jour ouvrable, vacances
   comprises, tant qu'il reste R_PLANCHER_PRESENTS après la pose ; deux au maximum. */
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
function addOneDay(ds){const dt=new Date(ds+'T12:00:00');dt.setDate(dt.getDate()+1);return toDateStr(dt);}
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

/* (04/09/2026) CALCUL À BLANC — `generateGardes(year, {dryRun:true})`.
   POURQUOI. Depuis l'ouverture du portail au service, générer une année ne se
   voit pas seulement du comité : l'onglet créé fait apparaître l'année dans le
   sélecteur des 23, et la fonction se termine par une notification push sur
   leur téléphone. Il n'existe donc plus aucun endroit où éprouver le
   générateur sur les VRAIES données.
   CE QUE FAIT LE MODE. Le calcul se déroule à l'identique — mêmes lectures,
   mêmes règles, même optimiseur. Seuls les quatre gestes VISIBLES sont sautés :
   l'onglet des gardes, celui des statistiques, celui des liens samedi→récup, et
   la notification. Rien n'est écrit, rien n'est envoyé, rien n'est effacé.
   Le verrou anti-régénération ne s'applique pas : il protège un planning
   existant contre l'écrasement, et un calcul à blanc n'écrase rien. C'est ce
   qui permet de relancer l'année en cours autant de fois qu'on veut.
   CE QU'IL RENVOIE. La durée, l'écart réel−cible par axe avec le nom du MAR
   concerné, et les avertissements — de quoi mesurer sans rien montrer.
   PRÉREQUIS du multi-départ : lancer N calculs et n'écrire que le meilleur,
   c'est exactement « calculer sans écrire », N fois, puis écrire une fois. */
/* (04/09/2026) LANCEUR TEMPORAIRE — sélectionner « T » dans la liste déroulante
   de l'éditeur Apps Script, puis Exécuter.
   Il n'existe que parce que l'éditeur ne sait pas passer d'argument à une
   fonction. Il est DANS LE DÉPÔT à dessein : le fichier recopié dans l'éditeur
   doit être rigoureusement identique à celui d'ici, sinon la prochaine session
   comparera deux versions divergentes sans le savoir.
   ⚠️ À RETIRER une fois la mesure du 04/09 faite. Ne rien construire dessus.
   Sans risque en attendant : il n'écrit rien et ne part jamais tout seul —
   aucun déclencheur, aucun bouton, aucune route ne l'appelle. */
function T() { return comparerAlgorithmes(2026); }

/* (05/09/2026) SECOND LANCEUR — même comparaison, mais sur 2027. À utiliser une
   fois la campagne d'indisponibilités close (30 octobre), pour voir ce que donnera
   la génération du 2 novembre AVANT de la lancer. Il n'écrit rien non plus.
   Deux lanceurs plutôt qu'un seul à modifier : le fichier du dépôt et celui de
   l'éditeur doivent rester identiques au caractère près, sinon la prochaine
   session compare deux versions divergentes sans le savoir.
   ⚠️ À RETIRER avec l'autre lanceur une fois 2027 publié. */
function T7() { return comparerAlgorithmes(2027); }

/* (04/09/2026) À LANCER DEPUIS L'ÉDITEUR — « Est-ce que N calculs d'affilée
   tiennent ? ». Un calcul à blanc seul a été mesuré à 4,3 s en production. Rien
   ne dit que douze à la suite se comportent pareil : Apps Script peut ralentir
   ou manquer de mémoire en cours de route (la même expérience menée hors ligne
   s'est fait couper trois fois à une quarantaine de générations, sur une machine
   pourtant bien plus large). C'est la dernière inconnue avant d'écrire le
   multi-départ, et la seule qui ne se mesure qu'ici.
   Elle journalise la durée de CHAQUE passage — c'est la dérive entre le premier
   et le dernier qui parle, pas la moyenne.
   Budget d'arrêt à 4 minutes : on s'arrête proprement avant le mur des 6 de
   Google, et on rend ce qu'on a. Aucune écriture, aucune notification. */
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


/* (04/09/2026) À LANCER DEPUIS L'ÉDITEUR APPS SCRIPT — « Essai de génération ».
   Enveloppe lisible du calcul à blanc : elle chronomètre, met en forme et écrit
   dans le journal d'exécution. Aucun bouton, aucune page, aucune montée de
   version du site : c'est un outil de mesure, pas une fonctionnalité.
   Elle ne modifie RIEN — l'année peut être déjà générée, on peut la relancer
   autant de fois qu'on veut, l'équipe ne voit rien. */
function essaiGenerationGardes(year) {
  const an = Number(year) || getIndisposYear();
  const r = generateGardes(an, { dryRun: true });
  const L = [];
  L.push('═══ ESSAI DE GÉNÉRATION ' + an + ' — AUCUNE ÉCRITURE ═══');
  L.push('Durée du calcul : ' + (r.ms / 1000).toFixed(1) + ' s   ·   ' + r.gardeurs + ' médecins de garde');
  L.push('Jours sans binôme : ' + r.sansBinome + (r.jours.length ? '  → ' + r.jours.join(' ') : ''));
  L.push('Écart réel−cible, par axe :');
  const NOM = { total:'Total ', sam:'Samedi', jeu:'Jeudi ', vd:'Ven-Dim', vjf:'VeilleJF', jf:'Férié ' };
  Object.keys(r.ecarts).forEach(function (k) {
    const e = r.ecarts[k];
    L.push('   ' + (NOM[k] || k) + ' : ' + e.ecart.toFixed(2) + (e.mar ? '   (' + e.mar + ')' : ''));
  });
  L.push('Avertissements : ' + r.nbWarnings);
  r.warnings.slice(0, 15).forEach(function (w) { L.push('   · ' + w); });
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
  let meilleur = 1, cleMeilleure = null;
  for(let t = 1; t <= MULTI_DEPART_MAX; t++){
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
    const cle = [r.sansBinome || 0, nAu, pire];
    let mieux = !cleMeilleure;
    if(cleMeilleure){
      for(let i = 0; i < cle.length; i++){
        if(cle[i] !== cleMeilleure[i]){ mieux = cle[i] < cleMeilleure[i]; break; }
      }
    }
    if(mieux){ cleMeilleure = cle; meilleur = t; }
    Logger.log('Tirage ' + t + ' : ' + (r.sansBinome || 0) + ' jour(s) sans binôme, pire écart ' + pire);
    if((r.sansBinome || 0) === 0 && pire <= MULTI_DEPART_SEUIL) break;
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

  /* (05/09/2026) MULTI-DÉPART — on calcule plusieurs fois À BLANC, on retient le
     meilleur tirage, et on ne l'écrit qu'une fois. Le calcul étant reproductible,
     rejouer le tirage gagnant redonne exactement le même planning.
     Aucune écriture pendant la recherche : les passes sont des dryRun.
     La règle d'arrêt coupe dès qu'un tirage met tout le monde à MULTI_DEPART_SEUIL
     garde d'écart — mesuré : un seul tirage suffit dans 25 années sur 45. */
  if(NOUVEL_ALGO && !DRY && !(opts && opts.tirage)){
    const _t = choisirMeilleurTirage(year);
    return generateGardes(year, Object.assign({}, opts || {}, { tirage: _t }));
  }

  // (C2-D1) Flags effectif lus depuis MEDECINS (remplacent les Set en dur).
  const FLAGS = getMedecinFlags();
  const NO_GARDE   = FLAGS.noGarde;
  const ONLY_18    = FLAGS.only18;
  const NO_WEEKEND = FLAGS.noWeekend;

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
  const medData=ss.getSheetByName('MEDECINS').getDataRange().getValues();
  const allDoctors=[],gardeDoctors=[],pct={},quot={};
  for(let r=1;r<medData.length;r++){
    const id=String(medData[r][0]).trim();
    if(!id||id==='DRUGE') continue;
    allDoctors.push(id);pct[id]=Number(medData[r][5])||100;quot[id]=Number(medData[r][4])||100;
    if(!NO_GARDE.has(id)) gardeDoctors.push(id);
    if(!indispos[id]) indispos[id]={};
  }
  // (C2-D2) Exclure les MAR entièrement hors de l'année planning via date_debut/date_fin.
  // Remplace le splice('TRAN') en dur. Pour 2027 : TRAN (fin 2026-09-01) entièrement
  // avant le début 2027 → exclue (= ancien splice) ; ARMAND (début 2026-11-01) actif en
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

  /* (05/09/2026) NUMÉRO DE TIRAGE — à égalité PARFAITE entre deux MAR, c'est ce
     numéro qui départage, et non plus la position de la ligne dans MEDECINS.
     Mesuré en juillet : déplacer une ligne dans l'onglet changeait près d'une
     garde sur trois. L'ordre est ici recalculé par hachage(nom, tirage) : il ne
     dépend plus du tableur, et rejouer le même tirage redonne le MÊME planning.
     L'onglet MEDECINS n'est jamais modifié. */
  const TIRAGE = Math.max(1, Number(opts && opts.tirage) || 1);
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
      const cbS=iCbS>=0?_num(ps[r][iCbS]):0;
      cibN1[id]={
        total: iCbT>=0?_num(ps[r][iCbT]):0,
        sam: cbS,
        jeu: iCbJ>=0?_num(ps[r][iCbJ]):0,
        vd:  iCbV>=0?_num(ps[r][iCbV]):0,
        vjf: iCbVj>=0?_num(ps[r][iCbVj]):0,
        jf:  iCbJf>=0?_num(ps[r][iCbJf]):cbS, // pas de CIBLE JF en N-1 → repli CIBLE SAM (même pool WE)
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
  function structAvail(id,d){
    const dd=FLAGS.dateDebut[id], df=FLAGS.dateFin[id];
    if(dd && d.date<dd) return false;
    if(df && d.date>=df) return false;
    if(indispos[id]?.[d.date]==='CL') return false;
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
    if(axis==='vjf'&&FLAGS.souhaitPlafond.has(id)) return false; // PRUNET hors VJF
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

  /* (05/09/2026) CIBLES ENTIÈRES — méthode des plus forts restes.
     Une part de 5,4 samedis n'est atteignable par personne : le MAR est TOUJOURS
     en écart, et l'écart affiché mélange l'injustice réelle et l'impossibilité
     arithmétique. On passe donc à des entiers, comme on répartit des sièges :
     chacun reçoit sa partie entière, puis les unités restantes sont attribuées
     une par une. La SOMME reste exactement égale au nombre de gardes à poser —
     arrondir chaque cible séparément la casserait (mesuré : +6 jeudis promis en
     trop, 6 jours fériés sans propriétaire).
     Qui reçoit l'unité en plus ? Celui qui est le plus CRÉDITEUR, report compris :
     l'arrondi et la dette deviennent un seul et même mécanisme. Le report est donc
     plié dans la cible et NE DOIT PLUS être ajouté une seconde fois dans ratio()
     — d'où la remise à zéro de `dette` juste après.
     `cibleExacte` conserve la part fractionnaire : c'est la vérité comptable, et
     c'est elle qui servira à tenir le compteur cumulatif (lot 2). */
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
// ── 5bis. Souhaits plafonnés à la cible (PRUNET uniquement) ──────────
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
  });
  // Budget de jours LIBRES (lun/mar/mer) = total − axes-clés. Les souhaits des
  // non-PRUNET sont plafonnés à ce budget : leurs parts sam/jeu/VD/VJF/férié
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
  // fixes). Un MAR 2/2 (ex. COPELOVICI/LC) a une espérance nulle ses semaines off.
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
  function indispoIndividuelle(id,date){
    const _dd=FLAGS.dateDebut[id], _df=FLAGS.dateFin[id]; // (F3) arrivée/départ en cours d'année
    if(_dd&&date<_dd) return true;
    if(_df&&date>=_df) return true;
    const s=indispos[id]?.[date];
    if(s==='INDISPO'||s==='VAC'||s==='FORM'||s==='TP'||s==='CL'||s==='CTP') return true;
    if(s==='RG_TRANSITION') return true;      // repos hérité de la garde du 31/12 (CONFIG_TRANSITION)
    if(estSemaineOff(id,date)) return true;   // semaine "off" du rythme 2/2
    const _tpF=FLAGS.tpJoursFixes[id];         // (D1) jours fixes non travaillés (MEDECINS col Q)
    if(_tpF&&_tpF.has(new Date(date+'T12:00:00').getDay())) return true;
    const _di=dayByDate[date];
    const _dw=_di?_di.dow:new Date(date+'T12:00:00').getDay();
    /* (LOT B · 01/09/2026) JAMAIS DE GARDE LA VEILLE D'UN TEMPS PARTIEL.
       Le lendemain d'une garde est un repos de garde (RG), et le RG s'écrit
       PAR-DESSUS le TP dans GARDES : le jour de temps partiel disparaissait
       sans bruit. Mesuré sur les indisponibilités réelles 2027 augmentées des
       260 jours de TP posables : 16 à 30 jours effacés par an, dans 18 tirages
       sur 18. Un TP posé est ACQUIS (arbitrage Arthur, 01/09/2026) : cette
       règle n'est levée par AUCUN dernier recours. Le levier, quand un jour
       manque, est de libérer des vacances — pas de reprendre un congé accordé. */
    if(indispos[id]?.[addOneDay(date)]==='TP') return true;
    if(NO_WEEKEND.has(id)&&(_dw===0||_dw===6||_di?.isFerie)) return true;
    if(SOUHAIT_PLAFOND.has(id)&&_di?.isVjf) return true;
    // (Fix A2) souhait_plafond : jamais de week-end ni de férié — le complément des
    // mardis perdus ne peut tomber qu'en semaine. Vendredi bloqué aussi (unité VD).
    if(SOUHAIT_PLAFOND.has(id)&&(_dw===0||_dw===5||_dw===6||_di?.isFerie)) return true;
    // Plafond souhaits : un MAR plafonné ne dépasse JAMAIS sa cible totale.
    if(SOUHAIT_PLAFOND.has(id)&&cnt[id]&&cible[id]&&cnt[id].total>=cible[id].total) return true;
    return false;
  }

  /* (LOT C · 01/09/2026) POURQUOI CE MAR NE PEUT-IL PAS PRENDRE CETTE GARDE ?
     Rend null s'il le peut, sinon { classe, texte }. Trois classes, qui sont
     les trois blocs du message d'échec :
       'immediat' — une case saisie dans INDISPOS : le comité ou le MAR peut la
                    changer aujourd'hui, sans rien recalculer ;
       'planning' — une conséquence du placement en cours (garde voisine, repos,
                    récup, combos) : non modifiable directement, mais libérer
                    ailleurs peut la faire disparaître ;
       'profil'   — MEDECINS : pas de garde, jamais de week-end, rythme 2/2,
                    jours fixes, arrivée/départ. Hors de portée du staff.
     ⚠️ Cette fonction REJOUE les tests de blocked() dans le MÊME ORDRE. Toute
     divergence produirait des leviers qui ne débloquent rien — le défaut le
     plus coûteux possible ici, puisque le comité agirait à l'aveugle. Le banc
     vérifie l'équivalence exhaustive (blocked ⇔ motif non nul) sur une année
     entière, MAR par MAR et jour par jour. */
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
    if(SOUHAIT_PLAFOND.has(id)&&_di?.isVjf) return {classe:'profil',texte:'régime à part : pas de veille de férié'};
    if(SOUHAIT_PLAFOND.has(id)&&(_dw===0||_dw===5||_dw===6||_di?.isFerie)) return {classe:'profil',texte:'régime à part : pas de vendredi, week-end ni férié'};
    if(SOUHAIT_PLAFOND.has(id)&&cnt[id]&&cible[id]&&cnt[id].total>=cible[id].total) return {classe:'profil',texte:'régime à part : a déjà atteint son nombre de gardes'};
    const s=indispos[id]?.[date];
    /* `_sansAbsence` : « et si on retirait cette absence, serait-il libre ? »
       C'est la question qui décide si un MAR est un LEVIER ou un faux espoir.
       Proposer de faire revenir quelqu'un qui serait de toute façon en repos de
       garde enverrait le comité négocier un congé pour rien. */
    if(s&&_LIB_ABS[s]&&!_sansAbsence) return {classe:'immediat',texte:_LIB_ABS[s],code:s};
    if(s==='RG_TRANSITION') return {classe:'planning',texte:'repos de sa garde du 31 décembre'};
    if(indispos[id]?.[addOneDay(date)]==='TP') return {classe:'immediat',texte:'libre, mais a posé un temps partiel LE LENDEMAIN (le repos de garde ne peut pas s\'y écrire)',code:'TP_LENDEMAIN'};
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
      if(m.classe==='immediat'&&m.code&&m.code!=='TP_LENDEMAIN'){
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
       le générateur venait d'abandonner. Arbitrage Arthur du 01/09/2026 : en
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
    /* (01/09/2026) VERSION COURTE. La première énumérait chaque MAR sur sa
       propre ligne : sur un jour d'été, cela donnait trente lignes où le seul
       geste utile était noyé — illisible à l'écran, constaté en production le
       jour même. On GROUPE désormais par motif : « 7 indisponibilités : … »
       se lit, sept lignes séparées ne se lisent pas.
       L'écran du comité, lui, met en forme la structure `joursVides` ; ce texte
       sert au journal et à l'éditeur Apps Script. */
    /* [singulier, pluriel] — et l'ORDRE d'affichage va du plus facile à
       retirer au plus coûteux : une indisponibilité se reprend d'un clic, un
       congé validé au staff se renégocie. */
    const LIB = {INDISPO:['indisponibilité','indisponibilités'],
                 TP_LENDEMAIN:['temps partiel posé LE LENDEMAIN','temps partiels posés LE LENDEMAIN'],
                 FORM:['jour de formation','jours de formation'],
                 VAC:['jour de vacances','jours de vacances'],
                 CL:['congé long','congés longs'], CTP:['congé','congés'],
                 TP:['temps partiel','temps partiels']};
    const ORDRE = ['INDISPO','TP_LENDEMAIN','FORM','VAC','CTP','TP','CL'];
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
    /* (05/09/2026) DEUX WEEK-ENDS DE GARDE D'AFFILÉE : INTERDIT.
       La règle existait, mais seulement comme pénalité dans l'optimiseur — donc
       franchissable, et de fait franchie dès qu'on donne plus de poids à l'équité
       (mesuré : 48 enchaînements par an au lieu de 2). Or ils ne naissaient même
       pas dans l'optimiseur : c'est la POSE qui les créait, sans aucune règle de
       week-end. On l'ajoute donc ici, au même niveau que le combo jeudi-samedi —
       relâché uniquement en dernier recours, pour ne jamais laisser un jour vide. */
    if(NOUVEL_ALGO && _di && !_relaxJS && (_di.dow===5||_di.dow===6||_di.dow===0)){
      const _b=new Date(date+'T12:00:00');
      for(let _n=-9;_n<=9;_n++){
        if(_n>=-4&&_n<=4) continue;                 // le week-end courant lui-même
        const _x=new Date(_b); _x.setDate(_b.getDate()+_n);
        const _xs=toDateStr(_x), _dx=dayByDate[_xs];
        if(!_dx) continue;
        if(_dx.dow!==5&&_dx.dow!==6&&_dx.dow!==0) continue;
        if(gSet[id]?.has(_xs)||g2Set[id]?.has(_xs)) return true;
      }
    }
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

  // ── 7bis. NOËL / JOUR DE L'AN — rotation pluriannuelle ───────────────
  // 4 dates (24/12, 25/12, 31/12, 01/01) = 8 MAR/an. Priorité = jamais fait
  // puis le plus ancien. ≤ 1 jour/MAR/an. PRUNET exempté. Les couplages (VD
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
    const canHoldUnit=(m,unit)=>unit.every(d=>!blocked(m,d));
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
          for (let a=0; a<p.length; a++) {
            if (prev.indexOf(p[a]) >= 0) continue;
            for (let b=a+1; b<p.length; b++) {
              if (prev.indexOf(p[b]) >= 0) continue;
              sol[i] = [p[a], p[b]];
              rec(i+1, sol[i], cout + coutJour(p[a],serie[i]) + coutJour(p[b],serie[i]));
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
  // Régime 1 : souhait_plafond (PRUNET) = priorité absolue, peut dépasser sa cible.
  // Régime 2 : autres MAR = préférence de placement DANS leur cible, équitable
  //            (le moins-servi mène) ; la 2e place préfère un co-souhaiteur.
  const souhParJour={}; // date (dans l'année) -> souhaiteurs gardeDoctors
  Object.entries(souhaits).forEach(([date,ids])=>{
    if(!dayByDate[date]) return;
    souhParJour[date]=ids.filter(m=>gardeDoctors.indexOf(m)>=0);
  });
  const souhaitHonored={}; allDoctors.forEach(id=>{souhaitHonored[id]=0;});
  // (25/08/2026) Récapitulatif rendu au MAR : « X souhaits sur Y honorés ». On compte
  // TOUT ce qui est saisi, sans filtrer les demandes irréalistes — poser 43 samedis
  // affichera 5/43, ce qui est l'information juste.
  const souhaitPose={}; allDoctors.forEach(id=>{souhaitPose[id]=0;});
  // (25/08/2026) Le compte des souhaits honorés est fait EN FIN de génération, sur le
  // planning final (voir souhaitJoursOK plus bas) : compter à la pose ne voyait que la
  // passe des souhaits et ratait les gardes obtenues autrement — mesuré en production
  // sur PRUNET, 43 comptés pour 45 réellement obtenus, ses mardis des 21 et 28 décembre
  // ayant été posés par la passe des jours critiques de la semaine de Noël.
  Object.keys(souhaits).forEach(ds=>{(souhaits[ds]||[]).forEach(id=>{
    if(souhaitPose[id]!==undefined) souhaitPose[id]++;
  });});

  // ── Souhaits hors lundi/mardi/mercredi (ajout du 25/08/2026) ─────────────
  // AUCUNE modification du chemin historique ci-dessous : les jours libres gardent
  // exactement leur règle (freeBudget). On AJOUTE seulement la possibilité de poser
  // un souhait sur les autres jours, sous plafond de chaque axe touché + quota.
  const shiftDays=(ds,n)=>toDateStr(new Date(new Date(ds+'T12:00:00').getTime()+n*86400000));
  // Chemin HISTORIQUE, strictement inchangé : lundi, mardi, mercredi — y compris les
  // veilles de férié, traitées comme aujourd'hui. Seuls les lun/mar/mer FÉRIÉS en
  // sortent : posés seuls, ils brisaient le couplage samedi↔lundi férié (4 couplages
  // brisés mesurés en 2027 sur la version en production) ; ils passent désormais par
  // le nouveau chemin, qui pose l'unité complète.
  const estJourLibre=date=>{const d=dayByDate[date];return !!d&&d.dow>=1&&d.dow<=3&&!d.isFerie;};
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
    if(uniteRare(un)&&souhaitRare[m]>=SOUHAIT_QUOTA_RARE) return false;      // joker annuel
    if(cnt[m].total+un.jours.length>cible[m].total) return false;            // jamais au-delà de sa part
    return Object.keys(c).every(a=>!c[a]
      || ((a==='jeu'||a==='sam'||a==='vd') ? cnt[m][a]<Math.floor(cible[m][a]) : cnt[m][a]<cible[m][a]));
  };
  function placeSouhaitUnite(id,un){
    const jours=un.jours, free=m=>jours.every(d=>!blocked(m,d));
    const wish=new Set(); jours.forEach(d=>(souhParJour[d]||[]).forEach(m=>wish.add(m)));
    const dRef=jours.length>1&&!un.vd ? jours.find(d=>dayByDate[d].dow===6) : jours[0];
    const scoreU=un.vd ? (m=>scoreVD(m,jours[0],jours[1]))
                       : (m=>scoreSelect(m,dayByDate[dRef].dow,dayByDate[dRef].isVjf,dRef));
    let co=[...wish].filter(m=>m!==id&&!SOUHAIT_PLAFOND.has(m)&&free(m)&&okSouhaitRare(m,un));
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
      const tous=gardeDoctors.filter(m=>m!==id&&free(m));
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
    if(uniteRare(un)){ souhaitRare[id]++; if(viaCo) souhaitRare[partner]++; }
    if(un.vd){cnt[id].vd++;cnt[partner].vd++;}
    const [g,g2]=assignRoles(id,partner);
    jours.forEach(d=>assign(d,g,g2,dayByDate[d].dow));
    return true;
  }

  function placeSouhait(id,date){
    const dow=new Date(date+'T12:00:00').getDay();
    const vjf=dayByDate[date]?.isVjf;
    let co=(souhParJour[date]||[]).filter(m=>m!==id&&!blocked(m,date)
              &&(SOUHAIT_PLAFOND.has(m)||cnt[m].total<freeBudget[m]));
    let partner;
    if(co.length){
      co.sort((a,b)=>(souhaitHonored[a]-souhaitHonored[b])
                     ||cmp(scoreSelect(a,dow,vjf,date),scoreSelect(b,dow,vjf,date)));
      partner=co[0]; souhaitHonored[partner]++;
    } else {
      const others=gardeDoctors.filter(m=>m!==id&&!blocked(m,date));
      if(!others.length){warnings.push(`SOUHAIT ${id} ${date} sans binôme`);return false;}
      others.sort((a,b)=>cmp(scoreSelect(a,dow,vjf,date),scoreSelect(b,dow,vjf,date)));
      partner=others[0];
    }
    const [g,g2]=assignRoles(id,partner);
    assign(date,g,g2,dow);
    return true;
  }

  // Régime 1 — PRUNET (souhait_plafond) : priorité absolue
  gardeDoctors.filter(id=>SOUHAIT_PLAFOND.has(id)).forEach(id=>{
    Object.keys(souhParJour).filter(date=>souhParJour[date].indexOf(id)>=0).sort().forEach(date=>{
      if(gardes[date]||blocked(id,date)) return;
      if(placeSouhait(id,date)) souhaitHonored[id]++;
    });
  });

  // Régime 2 — autres MAR : équitable, DANS la cible
  Object.keys(souhParJour).sort().forEach(date=>{
    if(gardes[date]) return;
    // Défense en profondeur : un souhait n'est honoré que sur jour LIBRE (lun/mar/mer).
    // Un souhait sur jeudi/samedi/VD (axe d'équité) est ignoré → le MAR reçoit sa part
    // normale par l'équité, l'axe ne peut pas être monopolisé même si le garde-fou est contourné.
    if(!estJourLibre(date)){
      // Nouveau : jeudi, samedi, week-end, férié, veille de férié. Le souhait est
      // POSABLE ; il n'est HONORÉ que s'il tient dans la part du MAR sur chaque axe
      // touché et dans son quota de familles rares. Sinon il est ignoré, sans effet.
      const un=uniteDeSouhait(date); if(!un) return;
      const cds=souhParJour[date].filter(m=>!SOUHAIT_PLAFOND.has(m)
                  &&un.jours.every(d=>!blocked(m,d))&&okSouhaitRare(m,un));
      if(!cds.length) return;
      cds.sort((a,b)=>souhaitHonored[a]-souhaitHonored[b]);
      if(placeSouhaitUnite(cds[0],un)) souhaitHonored[cds[0]]++;
      return;
    }
    const cands=souhParJour[date].filter(m=>!SOUHAIT_PLAFOND.has(m)&&!blocked(m,date)
                  &&cnt[m].total<freeBudget[m]);
    if(!cands.length) return; // sera rempli par la passe chronologique
    cands.sort((a,b)=>souhaitHonored[a]-souhaitHonored[b]); // le moins servi mène
    const lead=cands[0];
    if(placeSouhait(lead,date)) souhaitHonored[lead]++;
  });

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
        const availC=gardeDoctors.filter(id=>!blocked(id,date)&&!blocked(id,satDate));
        if(availC.length>=2){
          const scoreSat=id=>[ratio(id,'sam'),ratioTotal(id),cnt[id].g+cnt[id].g2];
          availC.sort((a,b)=>cmp(scoreSat(a),scoreSat(b)));
          const A=availC[0];
          const rest=availC.filter(id=>id!==A); rest.sort((a,b)=>cmp(scoreSat(a),scoreSat(b)));
          const B=rest[0];
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
        const A=availR[0],B=availR[1];
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
      const availVD=(dimExists&&!gardes[dimDate])?avail.filter(id=>!blocked(id,dimDate)):[];
      if(availVD.length>=2){
        availVD.sort((a,b)=>cmp(scoreVD(a,date,dimDate),scoreVD(b,date,dimDate)));
        let A=availVD[0],B=availVD[1];
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
            for(let i=0;i<availVD.length&&!_ok;i++)
              for(let j=i+1;j<availVD.length&&!_ok;j++)
                if(_poolS.filter(id=>id!==availVD[i]&&id!==availVD[j]).length>=2){
                  A=availVD[i];B=availVD[j];_ok=true;
                  warnings.push(`Couverture : binôme VD ${date} ajusté pour préserver le ${_samC}`);
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
    let A=avail[0],B=avail[1];
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
        for(let i=0;i<avail.length&&!_ok;i++)
          for(let j=i+1;j<avail.length&&!_ok;j++)
            if(_pres(avail[i],avail[j])){
              A=avail[i];B=avail[j];_ok=true;
              warnings.push(`Couverture : binôme ${date} ajusté pour préserver ${Object.keys(_pools).join(' et ')}`);
            }
      }
    }
    const [g,g2]=assignRoles(A,B);
    assign(date,g,g2,dow);
  });

  /* ── 8b-bis. (LOT C · 01/09/2026) ARRÊT SI UN JOUR N'A PAS DE BINÔME ──────
     Décision d'Arthur, 01/09/2026 : « pas de porte de sortie, le problème
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
  // Respecte espacements, NO_WEEKEND, plafond PRUNET, souhaits verrouillés et
  // l'intégrité VD / couplages fériés. ~0,1 s ; chacun finit à ≤1,3 de sa cible.
  {
    const W={vd:7,sam:6,jeu:5,vjf:5,jf:4,total:2}, WGG2=1;
    const EQ=['vd','sam','jf','jeu','vjf','total'];
    const KEYS=['dim','lun','mar','mer','jeu','ven','sam'];
    const ABS=new Set(['INDISPO','VAC','FORM','TP','CL','CTP']);
    const shift=(ds,n)=>toDateStr(new Date(new Date(ds+'T12:00:00').getTime()+n*86400000));
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
    // 3) Slots = (groupe, rôle 0=G/1=G2) ; verrou si titulaire = PRUNET ou souhait honoré.
    const slots=[];
    Object.values(groups).forEach(days_=>{
      const contrib=contribOf(days_);
      [0,1].forEach(role=>{
        const holder=role===0?gardes[days_[0]].g:gardes[days_[0]].g2;
        const locked=SOUHAIT_PLAFOND.has(holder)||days_.some(dd=>(souhParJour[dd]||[]).indexOf(holder)>=0)||days_.some(dd=>noelDatesAssigned.has(dd));
        slots.push({days:days_,role,contrib,locked});
      });
    });
    // 4) Faisabilité : B peut-il tenir ce rôle sur tous les jours du groupe ?
    const canHold=(B,days_)=>{
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
        /* (05/09/2026) OBJECTIF LEXICOGRAPHIQUE. Cette somme de carrés minimise
           l'écart MOYEN : elle laisse volontiers un MAR à 3 gardes d'écart si le
           total baisse. On ajoute un terme charnière qui ne se déclenche qu'AU-DELÀ
           du seuil vert, et qui coûte assez cher pour passer avant tout gain de
           moyenne — sans écraser la règle des week-ends (poids 1000 plus bas).
           Effet mesuré sur l'année la plus dure (2041, 15 gardeurs) : 60 calculs
           complets sans lui ne descendaient jamais sous 2 gardes d'écart ; avec lui,
           les 20 calculs testés donnent 1. La bonne répartition existait. */
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
          if(!canHold(B,days_))continue;
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
    if(NOUVEL_ALGO && TIRAGE>1) warnings.push('Multi-départ : tirage n°'+TIRAGE+' retenu (équité meilleure que le tirage 1).');

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
    // Assouplissement assumé (Arthur, 30/07/2026) : le BÉNÉFICIAIRE peut accepter une
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
          if(dejaGagne[B+'|'+Dn]) continue;            // B y perdrait son propre jour
          if(SOUHAIT_PLAFOND.has(A)||SOUHAIT_PLAFOND.has(B)) continue;   // régime à part
          const mesDates=[...(role===0?gSet[A]:g2Set[A])].filter(d2=>
            d2!==Dn && _neutre(d2) && dayByDate[d2].dow===dayByDate[Dn].dow);
          const cede=mesDates.find(d2=>{
            if(dejaGagne[A+'|'+d2]) return false;      // A ne se saborde pas
            if(_aG(B,d2)) return false;                // B tiendrait les deux rôles
            if(blocked(B,d2)) return false;
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
       Décision d'Arthur le 21/08 — « on ne passe pas sous 15 ». Le mode `ultime`
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
  const w18=id=>((quot[id]||100)/100)*(ONLY_18.has(id)?RATIO_18:1);
  const sumW18=allDoctors.reduce((s,id)=>s+w18(id),0);
  const baseT=sumW18?weekdays.length/sumW18:0;
  const h18T={},h18cnt={},h18A={};
  allDoctors.forEach(id=>{h18T[id]=Math.round(baseT*w18(id));h18cnt[id]=0;});
  // Disponibilité 18h : exclut absences totales, gardes/récups, semaines "off"
  // (rythme 2/2) et BONNET les jeudi/vendredi (60%).
  const ABSENT_18 = new Set(['VAC','FORM','CL','TP','CTP','CP','A','RG_TRANSITION']);
  function dispo18(id,date){
    if(ABSENT_18.has(indispos[id]?.[date])) return false;
    if(estSemaineOff(id,date)) return false;
    if(gSet[id]?.has(date)||g2Set[id]?.has(date)||rgSet[id]?.has(date)||rSet[id]?.has(date)) return false;
    const _tp=FLAGS.tpJoursFixes[id]; // (C2-D3) jours fixes non travaillés → MEDECINS
    if(_tp && _tp.has(new Date(date+'T12:00:00').getDay())) return false;
    return true;
  }
  const h18wk={}; // semaines ISO où chaque MAR a déjà fait un 18h (≤ 1 par semaine)
  const did18wk=(id,date)=> h18wk[id]?h18wk[id].has(dayByDate[date].wk):false;
  const set18=(id,date)=>{ h18A[date]=id; h18cnt[id]++; (h18wk[id]||(h18wk[id]=new Set())).add(dayByDate[date].wk); };
  weekdays.forEach(day=>{
    const veille=toDateStr(new Date(new Date(day.date+'T12:00:00').getTime()-86400000)); // pas 2 x 18h d'affilée
    // (18h veille de garde samedi) le vendredi, le 18h revient au MAR de garde (G) du samedi
    if(day.dow===5){
      const satDate=toDateStr(new Date(new Date(day.date+'T12:00:00').getTime()+86400000));
      const satG=gardes[satDate]?.g;
      if(satG&&dispo18(satG,day.date)&&h18A[veille]!==satG&&!did18wk(satG,day.date)){set18(satG,day.date);return;}
    }
    // Replis successifs : on lève d'abord INDISPO, puis la veille, et seulement
    // en tout dernier recours la règle "≤ 1 par semaine".
    let pool=allDoctors.filter(id=>dispo18(id,day.date)&&h18A[veille]!==id&&!did18wk(id,day.date)&&indispos[id]?.[day.date]!=='INDISPO');
    if(!pool.length) pool=allDoctors.filter(id=>dispo18(id,day.date)&&h18A[veille]!==id&&!did18wk(id,day.date));
    if(!pool.length) pool=allDoctors.filter(id=>dispo18(id,day.date)&&!did18wk(id,day.date)); // garde "1/semaine"
    if(!pool.length) pool=allDoctors.filter(id=>dispo18(id,day.date)); // dernier recours absolu
    if(!pool.length){warnings.push(`Aucun 18h ${day.date}`);return;}
    pool.sort((a,b)=>(h18cnt[a]/(h18T[a]||1))-(h18cnt[b]/(h18T[b]||1)));
    set18(pool[0],day.date);
  });

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
    return { dryRun:true, year:year, ms:Date.now()-_tGen,
             ecarts:ecarts, compteurs:compteurs,
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
  st.getRange(1,1,1,25).setValues([['MEDECIN','CIBLE','TOTAL G','G (REA)','G2 (MAT)','LUN','MAR','MER','JEU','VEN','SAM','DIM','RECUP R','18H','JF','VEILLE JF','NOEL/AN','CIBLE SAM','CIBLE JEU','CIBLE VD','VD','CIBLE VJF','CIBLE JF','SOUHAITS POSES','SOUHAITS HONORES']]).setFontWeight('bold');
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
  const sRows=allDoctors.map(id=>{
    const cbT=cible[id]?cible[id].total:0;
    const cbS=cible[id]?cible[id].sam:0, cbJ=cible[id]?cible[id].jeu:0, cbV=cible[id]?cible[id].vd:0, cbVjf=cible[id]?cible[id].vjf:0;
    const cbJf=cible[id]?cible[id].jf:0; // (RH-3) exploité par la dette de N+1
    const c=cnt[id]||{total:0,g:0,g2:0,lun:0,mar:0,mer:0,jeu:0,ven:0,sam:0,dim:0,recupR:0,vd:0,vjf:0};
    return[id,"'"+cbT.toFixed(1),c.total,c.g,c.g2,c.lun,c.mar,c.mer,c.jeu,c.ven,c.sam,c.dim,c.recupR,
      h18cnt[id]||0,jfCnt[id]||0,c.vjf||0,noelAnCnt[id]||0,
      +cbS.toFixed(1),+cbJ.toFixed(1),+cbV.toFixed(1),c.vd||0,+cbVjf.toFixed(1),+cbJf.toFixed(1),
      souhaitPose[id]||0,souhaitJoursOK[id]||0];
  });
  st.getRange(2,1,sRows.length,25).setValues(sRows);
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
    /* (25/08/2026) Le message partait à TOUS les abonnés, vers './admin.html' :
       le MAR recevait une notification qui ne le concernait pas (« N avertissements »)
       et atterrissait sur la page du comité — qui n'a pas de portail. Le canal push
       est celui du MAR (doctrine notifications) : un seul message, ciblé sur eux,
       vers la page qui les intéresse. Le comité, lui, voit le résultat à l'écran
       au moment où il génère. */
    notifierPush_('Votre planning ' + year + ' est disponible',
      'Vos gardes de l\'année sont réparties. Retrouvez-les dans « Mes gardes ».',
      './dashboard.html#mes-gardes', { role: 'mar' });
  } catch (e) { /* silencieux : la génération, elle, a réussi */ }
  return { warnings: warnings.slice(0, 60), nbWarnings: warnings.length };
}

// Déplace GARDES/INDISPOS/STATS/AFFECTATIONS de l'année N vers le classeur d'archives.
// Sûr : copie → vérifie → supprime. À tester en isolé AVANT de câbler en W3.
function archiveMoveTabs_(year) {
  const master = SpreadsheetApp.getActiveSpreadsheet();
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
// Lanceur de test (visible dans le menu Exécuter). Change l'année si besoin.
function testArchiveMove() {
  const rapport = archiveMoveTabs_(1999);
  Logger.log(rapport.join('\n'));
  try { SpreadsheetApp.getUi().alert('Archivage test\n\n' + rapport.join('\n')); } catch(e) {}
}
