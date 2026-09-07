/* ═══ BANC — TEMPS PARTIEL POSÉ AVANT LA GÉNÉRATION (lots B et C, 01/09/2026) ═══

   DEUX CHANGEMENTS, DEUX FAMILLES DE VÉRIFICATIONS.

   LOT B — jamais de garde la VEILLE d'un temps partiel.
   Le lendemain d'une garde est un repos (RG), et le RG s'écrit par-dessus le TP
   dans GARDES : le jour de temps partiel disparaissait sans bruit. Mesuré sur
   les indisponibilités réelles 2027 augmentées des 260 jours de TP posables :
   16 à 30 jours effacés par an, dans 18 tirages sur 18. Un TP posé est ACQUIS
   (arbitrage Arthur du 01/09/2026) : aucun dernier recours ne lève cette règle.

   LOT C — aucun onglet écrit si un jour n'a pas de binôme, et un message qui
   dit quoi faire. Trois propriétés se vérifient ici PARCE QUE ma relecture ne
   suffit pas : deux affirmations fausses ont été écrites puis corrigées dans la
   session du 01/09 (« il faut quelqu'un de libre les deux jours » — faux, le
   binôme VD a déjà cédé quand ce message s'écrit ; et un MAR proposé comme
   levier alors qu'il était de garde le lendemain). Ces tests sont là pour que
   la prochaine erreur du même genre tombe toute seule.

   Le VRAI generateur_gardes.gs est exécuté, via le harnais du simulateur. */
const path = require('path');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const YEAR = 2027;
const ds = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addD = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ds(d); };
const DOW = s => new Date(s + 'T12:00:00').getDay();

/* Reconstruit {mar: {date: code}} depuis l'onglet GARDES écrit par le générateur. */
function grilleDe(ss, year) {
  const sh = ss.getSheetByName('GARDES_' + year);
  if (!sh) return null;
  const rows = sh._rows, entetes = rows[2] || [], dates = [];
  const mois = rows[0] || [];
  const MOIS = { Janvier: 1, 'Février': 2, Mars: 3, Avril: 4, Mai: 5, Juin: 6, Juillet: 7,
                 'Août': 8, Septembre: 9, Octobre: 10, Novembre: 11, 'Décembre': 12 };
  let m = null, an = year, prev = 0;
  for (let c = 1; c < entetes.length; c++) {
    const lm = String(mois[c] || '').trim();
    if (MOIS[lm]) { const mm = MOIS[lm]; if (prev && mm < prev) an++; m = mm; prev = mm; }
    const j = parseInt(String(entetes[c]).replace(/\D/g, ''), 10);
    dates.push(m && j ? `${an}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}` : null);
  }
  const g = {};
  for (let r = 3; r < rows.length; r++) {
    const id = rows[r][0]; if (!id) continue;
    g[id] = {};
    dates.forEach((d, i) => { const v = String(rows[r][i + 1] || '').trim(); if (d && v) g[id][d] = v; });
  }
  return g;
}

/* ═══ 1. LOT B — un TP posé avant la génération survit au planning ═══════ */
console.log('\n═══ 1. Un jour de temps partiel posé AVANT la génération est acquis ═══');
{
  /* LEVASSEUR pose un TP tous les mercredis de l'année. Le mercredi est un jour
     banal : sans la règle, le RG du mardi viendrait s'écrire dessus. */
  const indisposMap = { LEVASSEUR: {} };
  const tpPoses = [];
  for (let d = new Date(YEAR, 0, 1); d <= new Date(YEAR, 11, 31); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 3) { const s = ds(d); indisposMap.LEVASSEUR[s] = 'TP'; tpPoses.push(s); }
  }
  const { ss, error } = h.runScenario({ year: YEAR, indisposMap });
  V('la génération aboutit avec 52 TP posés en amont', !error, error);
  const G = grilleDe(ss, YEAR);
  V('l\'onglet GARDES est écrit', !!G);

  if (G && G.LEVASSEUR) {
    const dansAnnee = tpPoses.filter(s => G.LEVASSEUR[s] !== undefined || Object.keys(G.LEVASSEUR).length);
    const ecrases = tpPoses.filter(s => G.LEVASSEUR[s] && G.LEVASSEUR[s] !== 'TP');
    V('AUCUN jour de temps partiel écrasé dans le planning', ecrases.length === 0,
      ecrases.slice(0, 6).map(s => s + '=' + G.LEVASSEUR[s]));
    const gardesVeille = tpPoses.filter(s => ['G', 'G2'].includes(G.LEVASSEUR[addD(s, -1)]));
    V('aucune garde posée la VEILLE d\'un temps partiel', gardesVeille.length === 0, gardesVeille.slice(0, 6));
    const gardesSur = tpPoses.filter(s => ['G', 'G2'].includes(G.LEVASSEUR[s]));
    V('aucune garde posée SUR un temps partiel', gardesSur.length === 0, gardesSur.slice(0, 6));
    V('le MAR garde bien des gardes malgré ses 52 TP (il n\'est pas exclu du tour)',
      Object.values(G.LEVASSEUR).filter(v => v === 'G' || v === 'G2').length > 0, dansAnnee.length);
  }
}

/* ═══ 2. CONTRE-PREUVE — sans le lot B, les TP seraient écrasés ══════════ */
console.log('\n═══ 2. Contre-preuve : la règle est bien CE qui protège les TP ═══');
{
  /* On rejoue le même scénario sur une copie du générateur DÉBARRASSÉE de la
     seule ligne du lot B. Si les TP survivent quand même, le test n° 1 ne
     prouve rien : il passerait sans le correctif. */
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
  const LIGNE = "if(indispos[id]?.[addOneDay(date)]==='TP') return true;";
  V('la ligne du lot B est présente dans le générateur du dépôt', src.includes(LIGNE));
  /* Retrait de la SEULE occurrence qui protège (celle d'indispoIndividuelle) ;
     motifBlocage garde la sienne, elle ne participe pas au placement. */
  const i = src.indexOf(LIGNE);
  const sansB = src.slice(0, i) + src.slice(i + LIGNE.length);

  const indisposMap = { LEVASSEUR: {} };
  const tpPoses = [];
  for (let d = new Date(YEAR, 0, 1); d <= new Date(YEAR, 11, 31); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 3) { const s = ds(d); indisposMap.LEVASSEUR[s] = 'TP'; tpPoses.push(s); }
  }
  const roster = h.defaultRoster();
  const sheets = [
    h.makeSheet('MEDECINS', h.medecinsRows(roster)),
    h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, indisposMap)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
    h.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ];
  const ss2 = h.makeSpreadsheet(sheets);
  const ctx = h.buildContext(ss2, [], sansB);   // le générateur SANS la ligne du lot B
  let err2 = null;
  try { ctx.generateGardes(YEAR); } catch (e) { err2 = e.message; }
  const G2 = err2 ? null : grilleDe(ss2, YEAR);
  const ecrases2 = G2 && G2.LEVASSEUR ? tpPoses.filter(s => G2.LEVASSEUR[s] && G2.LEVASSEUR[s] !== 'TP') : [];
  V('SANS la règle, des temps partiels sont bel et bien écrasés (sinon le test 1 ne prouve rien)',
    ecrases2.length > 0, { erreur: err2, ecrases: ecrases2.length });
}

/* ═══ 3. LOT C — arrêt net, aucun onglet écrit ═══════════════════════════ */
console.log('\n═══ 3. Un jour sans binôme arrête tout, sans rien écrire ═══');
{
  /* Année rendue impossible : tout le monde indisponible une semaine entière
     sauf une personne — il en faut deux pour un binôme. */
  const roster = h.defaultRoster();
  const indisposMap = {};
  const semaine = [];
  for (let d = new Date(YEAR, 5, 7); d <= new Date(YEAR, 5, 13); d.setDate(d.getDate() + 1)) semaine.push(ds(d));
  roster.forEach(([id]) => {
    if (id === 'SULTAN') return;                       // le seul disponible
    indisposMap[id] = {};
    semaine.forEach(s => { indisposMap[id][s] = 'VAC'; });
  });
  const { ss, error } = h.runScenario({ year: YEAR, roster, indisposMap });
  V('la génération échoue au lieu de produire un planning troué', !!error);
  V('aucun onglet GARDES n\'a été créé', !ss.getSheetByName('GARDES_' + YEAR));
  V('aucun onglet STATS_GARDES n\'a été créé', !ss.getSheetByName('STATS_GARDES_' + YEAR));
  V('aucun onglet LIENS_R n\'a été créé', !ss.getSheetByName('LIENS_R_' + YEAR));
  if (error) {
    V('le message annonce l\'impossibilité', /GÉNÉRATION IMPOSSIBLE/.test(error), error.slice(0, 120));
    V('le message rassure sur l\'état du classeur',
      /Rien n'a été écrit : aucun onglet, aucune notification/.test(error), error.slice(0, 200));
    /* Le libellé est mis en MAJUSCULES par le message : la comparaison doit
       être insensible à la casse (la première version de ce test échouait,
       et c'est très bien — c'est son travail). */
    V('le message nomme au moins un jour en clair (jour, mois, année)',
      /(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d+ [a-zûéèô]+ \d{4}/i.test(error), error.slice(0, 200));
    V('le message annonce combien de personnes libérer', /À libérer : \d+/.test(error), error.slice(0, 300));
    /* (01/09/2026) Le message a été RACCOURCI après un essai en production : la
       première version donnait une ligne par MAR, soit trente lignes rouges
       aplaties en un seul paragraphe à l'écran. On groupe désormais par motif. */
    V('les leviers sont groupés par motif, pas listés un par un',
      /▸ \d+ (indisponibilités?|jours? de vacances|jours? de formation|temps partiels? posés? LE LENDEMAIN)/.test(error),
      error.slice(0, 300));
    V('le pluriel est correct (« 7 indisponibilités », pas « 7 indisponibilité »)',
      !/▸ [2-9]\d* (indisponibilité|jour de vacances|jour de formation) :/.test(error), error.slice(0, 300));
    V('le message tient en moins de 25 lignes pour deux jours en défaut',
      error.split('\n').length < 30, error.split('\n').length);
    V('le message invite à relancer sans promettre le résultat',
      /recalculé entièrement : d'autres jours peuvent apparaître/.test(error), error.slice(-200));
    /* L'affirmation FAUSSE corrigée le 01/09 ne doit jamais revenir. */
    V('le message ne réclame JAMAIS quelqu\'un de libre les deux jours du week-end',
      !/libre LES DEUX JOURS/.test(error), error.slice(0, 200));
  }
}

/* ═══ 4. LOT C — le message est-il VRAI ? ════════════════════════════════ */
console.log('\n═══ 4. Chaque levier proposé débloque réellement, et le reste est exact ═══');
{
  /* Scénario tendu mais pas absurde : une semaine où il ne reste que 3 MAR,
     dont un de garde la veille — le message doit distinguer les vrais leviers
     de ceux qui resteraient bloqués même en rendant leur congé. */
  const roster = h.defaultRoster();
  const indisposMap = {};
  const jours = [];
  for (let d = new Date(YEAR, 8, 6); d <= new Date(YEAR, 8, 12); d.setDate(d.getDate() + 1)) jours.push(ds(d));
  const libres = ['SULTAN'];
  roster.forEach(([id]) => {
    if (libres.includes(id)) return;
    indisposMap[id] = {};
    jours.forEach(s => { indisposMap[id][s] = 'VAC'; });
  });
  let capture = null;
  try { h.runScenario({ year: YEAR, roster, indisposMap }); } catch (e) { capture = e; }
  /* runScenario avale l'exception et la rend dans `error` : on relance à nu
     pour récupérer la STRUCTURE (err.joursVides), pas seulement le texte. */
  const fs = require('fs');
  const sheets = [
    h.makeSheet('MEDECINS', h.medecinsRows(roster)),
    h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, indisposMap)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
    h.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ];
  const ss = h.makeSpreadsheet(sheets);
  const ctx = h.buildContext(ss, []);
  let err = null;
  try { ctx.generateGardes(YEAR); } catch (e) { err = e; }
  V('la génération échoue sur ce scénario tendu', !!err);
  const detail = err && err.joursVides;
  V('l\'erreur porte la structure des jours vides (lue par l\'écran du comité)',
    Array.isArray(detail) && detail.length > 0);

  if (Array.isArray(detail) && detail.length) {
    /* Propriété 1 — un jour listé comme vide l'est vraiment : personne de
       disponible en nombre suffisant. */
    V('chaque jour listé manque bien de monde',
      detail.every(o => o.libres.length + o.dejaPlaces.length < 2),
      detail.map(o => [o.date, o.libres.length, o.dejaPlaces.length]));
    /* Propriété 2 — le compte à libérer est cohérent avec les disponibles. */
    V('le nombre de personnes à libérer tient compte de celles déjà disponibles',
      detail.every(o => o.aLiberer === Math.max(0, o.manque - o.libres.length)),
      detail.map(o => [o.date, o.manque, o.libres.length, o.aLiberer]));
    /* Propriété 3 — AUCUN doublon entre les trois blocs : un MAR y figure une
       seule fois, sinon le comité lit deux conseils contradictoires. */
    const doublons = detail.filter(o => {
      const tous = o.immediats.concat(o.planning, o.profil).map(x => x.mar).concat(o.libres);
      return new Set(tous).size !== tous.length;
    });
    V('aucun MAR ne figure dans deux blocs à la fois', doublons.length === 0,
      doublons.map(o => o.date));
    /* Propriété 4 — LA propriété qui compte : tout MAR présenté comme levier
       « à faire revenir » doit réellement redevenir disponible une fois son
       absence retirée. C'est le défaut attrapé le 01/09 (un MAR proposé alors
       qu'il était de garde le lendemain). */
    V('tout levier immédiat porte un motif d\'absence ou de temps partiel du lendemain',
      detail.every(o => o.immediats.every(x => x.code)),
      detail.map(o => o.immediats.filter(x => !x.code)));
    V('aucun levier n\'est en réalité bloqué pour une autre raison (« et de toute façon… » est rangé ailleurs)',
      detail.every(o => o.immediats.every(x => !/de toute façon/.test(x.texte))),
      detail.map(o => o.immediats.filter(x => /de toute façon/.test(x.texte))));
    /* Propriété 5 — le vendredi et le dimanche sont bien traités séparément. */
    const weekEnds = detail.filter(o => DOW(o.date) === 0 || DOW(o.date) === 5);
    V('un jour de week-end vide est signalé comme pourvu SÉPARÉMENT de son jumeau',
      weekEnds.every(o => o.vdRompu === true), weekEnds.map(o => o.date));
  }
}

/* ═══ 4bis. La STRUCTURE part bien jusqu'à l'écran du comité ════════════ */
console.log('\n═══ 4bis. Le serveur renvoie la structure, pas un pavé de texte ═══');
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
  V('le routeur reconnaît une erreur porteuse de jours vides',
    src.includes('if (err && err.joursVides)'));
  V('il renvoie la structure au client', /joursVides: err\.joursVides/.test(src));
  V('il garde le texte complet à part (journal, éditeur Apps Script)',
    /messageComplet: err\.message/.test(src));
  V('il trace le blocage dans LOGS avec les dates',
    /generateGardes[\s\S]{0,120}bloqué[\s\S]{0,120}jour\(s\) sans binôme/.test(src));
  const page = require('fs').readFileSync(require('path').join(__dirname, '..', 'admin.html'), 'utf8');
  V('l\'écran met la structure en forme au lieu de l\'aplatir',
    page.includes('Array.isArray(res.joursVides)'));
  V('il groupe les leviers par motif', page.includes('const parCode = {}'));
  V('il replie le détail des MAR non actionnables',
    /Pourquoi les .{0,30}autres ne peuvent pas/.test(page));
  V('la ligne d\'étape ne recopie pas le pavé quand le détail est déjà affiché',
    page.includes('e.dejaAffiche'));
}

/* ═══ 4ter. Les avertissements survivent à la fermeture de l'assistant ══ */
console.log('\n═══ 4ter. Le CONTENU des avertissements est écrit dans LOGS ═══');
{
  /* (01/09/2026) LOGS ne gardait que le NOMBRE. Après une génération réelle,
     le comité a constaté « il y a eu des avertissements mais je ne sais plus
     ce que c'était » — et rien ne permettait de les retrouver, le détail ne
     partant que dans le journal d'exécution d'Apps Script. */
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
  V('chaque avertissement part dans LOGS, avec son rang',
    /logAction\(`  avertissement \$\{k \+ 1\}\/\$\{_genWarn\.nbWarnings\}/.test(src), src.length);
  V('le nombre total reste sur une ligne de tête',
    /generateGardes \$\{yearToGenerate\} — \$\{_genWarn\.nbWarnings\} avertissement\(s\)/.test(src));
  /* Le plafond n'est pas un détail : LOGS est purgé au-delà de 501 lignes et
     le générateur peut produire 60 avertissements. Sans plafond, une seule
     génération chasserait un huitième du journal. */
  V('le nombre de lignes écrites est plafonné', /const _MAX = 25;/.test(src));
  V('le plafond est inférieur au maximum que peut produire le générateur',
    25 < 60);
  V('quand le plafond mord, le reste est annoncé plutôt que passé sous silence',
    /avertissement\(s\) de plus, non détaillés/.test(src));
  const gen = require('fs').readFileSync(require('path').join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
  /* (04/09/2026) On cible les RETOURS du générateur, pas le premier `slice` venu.
     L'ancienne écriture prenait la première occurrence du fichier : le jour où
     une autre fonction a découpé la même liste pour l'afficher, le contrôle a
     mesuré la mauvaise valeur et sonné à tort. Et il y a désormais DEUX retours
     — la génération réelle et le calcul à blanc : les deux doivent tenir. */
  const caps = [...gen.matchAll(/warnings:\s*warnings\.slice\(0,\s*(\d+)\)/g)].map(m => +m[1]);
  V('les deux retours du générateur plafonnent leurs avertissements', caps.length >= 2, caps);
  V('le générateur rend bien au plus 60 avertissements (le plafond de LOGS tient)',
    caps.length > 0 && caps.every(n => n === 60), caps);
}

/* ═══ 5. ÉQUIVALENCE motifBlocage ⇔ blocked, sur une année entière ═══════ */
console.log('\n═══ 5. Le diagnostic dit exactement la même chose que le moteur ═══');
{
  /* Le message n'a de valeur que si « motifBlocage rend un motif » signifie
     TOUJOURS « blocked rend true ». Les deux fonctions listent les mêmes tests
     à deux endroits du fichier : une divergence future produirait des leviers
     qui ne débloquent rien — le défaut le plus coûteux ici, puisque le comité
     agirait à l'aveugle. On l'éprouve MAR par MAR et jour par jour.
     Le contrôle s'exécute DANS le générateur, au moment du placement, via un
     jour volontairement impossible : c'est le seul instant où les deux
     fonctions voient le même état (gardes posées, repos, récups). */
  const roster = h.defaultRoster();
  const indisposMap = {};
  const jours = [];
  for (let d = new Date(YEAR, 6, 5); d <= new Date(YEAR, 6, 11); d.setDate(d.getDate() + 1)) jours.push(ds(d));
  roster.forEach(([id]) => { if (id === 'SULTAN') return; indisposMap[id] = {}; jours.forEach(s => { indisposMap[id][s] = 'VAC'; }); });
  const sheets = [
    h.makeSheet('MEDECINS', h.medecinsRows(roster)),
    h.makeSheet('INDISPOS_' + YEAR, h.indisposRows(YEAR, roster, indisposMap)),
    h.makeSheet('PERIODES_VAC', h.periodesRows(YEAR)),
    h.makeSheet('CONFIG', [['CLE', 'VALEUR']]),
  ];
  const ss = h.makeSpreadsheet(sheets);
  const ctx = h.buildContext(ss, []);
  let err = null;
  try { ctx.generateGardes(YEAR); } catch (e) { err = e; }
  const detail = (err && err.joursVides) || [];
  V('un jour impossible a bien été diagnostiqué', detail.length > 0);
  /* Sur chaque jour diagnostiqué, la somme des quatre blocs doit couvrir
     EXACTEMENT l'effectif de garde : personne d'oublié, personne en double.
     Un MAR absent de tous les blocs serait un MAR dont motifBlocage ignore le
     cas — donc une divergence avec blocked(). */
  let couvertureOk = true, ecarts = [];
  detail.forEach(o => {
    const tous = o.immediats.concat(o.planning, o.profil).map(x => x.mar)
      .concat(o.libres).concat(o.dejaPlaces);
    const uniques = new Set(tous);
    /* L'effectif de garde du harnais : tout le monde sauf noGarde. */
    const attendu = roster.filter(([id, p, q, f]) => !(f && f.noGarde)).map(x => x[0]);
    const manquants = attendu.filter(id => !uniques.has(id));
    if (manquants.length) { couvertureOk = false; ecarts.push([o.date, manquants]); }
  });
  V('chaque MAR de garde est classé dans un bloc et un seul (aucun cas non traité)',
    couvertureOk, ecarts.slice(0, 4));
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
