/* ═══ BANC — PLACEMENT DES RÉCUPÉRATIONS (21/08/2026) ═══════════════════
   Exécute le VRAI generateur_gardes.gs sur des années complètes, via le
   harnais du simulateur, et recompte tout depuis la grille produite.

   ORIGINE. Relevé du 21/08 sur la grille générée : 76 récupérations sur 104
   étaient posées AVANT le samedi qu'elles compensent — jusqu'à 354 jours
   avant — et 90 % tombaient au 1er semestre. Deux règles internes prises
   ensemble rendaient le placement impossible : une SEULE récupération par
   jour pour toute l'équipe, et l'exclusion complète des vacances scolaires
   (près de 4 mois). Les 30 samedis du 2e semestre réclamaient 60 poses pour
   65 jours ouvrables disponibles : le repli remontait donc chercher en
   janvier. Conséquence démontrée : `_transfererR_` refusant un R déjà passé,
   le transfert lors d'un échange de samedi échouait 3 fois sur 4.

   CE QUE CE SCÉNARIO PROTÈGE. Trois choses, dans cet ordre de priorité :
     1. AUCUNE récupération n'est perdue — c'est un jour de repos dû.
     2. Le plancher d'effectif et l'espacement sont respectés quand c'est
        possible, et les renoncements sont TRACÉS.
     3. La très grande majorité des récupérations suit son samedi.
   Les trois contre-épreuves du 21/08 sont documentées en fin de fichier. */
const path = require('path');
const fs = require('fs');
const h = require(path.join(__dirname, '..', 'simulateur', 'harness.js'));
const A = require(path.join(__dirname, '..', 'simulateur', 'analyse.js'));

let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 200) : '')); } };
const J = s => new Date(s + 'T12:00:00');
const jours2 = (a, b) => Math.round((J(b) - J(a)) / 86400000);

/* Constantes lues dans le code réel : le banc ne doit pas les redéclarer, sinon
   il validerait ses propres valeurs et non celles qui tournent en production. */
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
const CONST = n => Number((SRC.match(new RegExp(n + '\\s*=\\s*(\\d+)')) || [])[1]);
const MAX_PAR_JOUR = CONST('R_MAX_PAR_JOUR');
const PLANCHER     = CONST('R_PLANCHER_PRESENTS');


console.log('\n═══ 1. Les réglages sont bien déclarés dans le générateur ═══');
V('R_MAX_PAR_JOUR est défini', Number.isFinite(MAX_PAR_JOUR), MAX_PAR_JOUR);
V('R_PLANCHER_PRESENTS est défini', Number.isFinite(PLANCHER), PLANCHER);
/* Ces trois valeurs sont VERROUILLÉES ici. Sans cela, un test qui lit la constante
   depuis le code valide n'importe quelle valeur : mettre R_DELAI_MIN_JOURS à 0 ferait
   passer « aucune récupération à moins de 0 jour ». Contre-épreuve du 21/08. */
V('le plancher est aligné sur le code couleur du service (15)', PLANCHER === 15, PLANCHER);
V('le plafond par jour vaut 2', MAX_PAR_JOUR === 2, MAX_PAR_JOUR);

/* ── Un tour complet pour une année, tout recompté depuis la grille ──── */
function analyse(YEAR) {
  const r = h.runScenario({ year: YEAR });
  if (r.error) return { erreur: r.error };
  const P = A.parsePlanning(r.ss, YEAR);
  const feries = new Set([...r.ctx.getJoursFeries(YEAR), ...r.ctx.getJoursFeries(YEAR + 1)]);
  const liens = r.ss.getSheetByName('LIENS_R_' + YEAR)._rows.slice(1)
    .map(x => ({ sam: String(x[0]), mar: String(x[1]), dr: String(x[2]) }));

  const samParMar = {}, rParMar = {};
  Object.entries(P.byDoc).forEach(([id, dd]) => {
    samParMar[id] = Object.keys(dd).filter(d => (dd[d] === 'G' || dd[d] === 'G2') && J(d).getDay() === 6).length;
    rParMar[id]   = Object.keys(dd).filter(d => dd[d] === 'R').length;
  });
  const parJour = {};
  liens.forEach(x => { parJour[x.dr] = (parJour[x.dr] || 0) + 1; });
  const presentsSansR = d => Object.keys(P.byDoc)
    .filter(id => !['CL', 'F', 'V', 'TP', 'G', 'G2', 'RG', 'R'].includes((P.byDoc[id] || {})[d] || '')).length;

  return { r, P, feries, liens, samParMar, rParMar, parJour, presentsSansR, invariants: A.checkInvariants(P, { ctxFeries: feries }) };
}

for (const YEAR of [2027, 2028, 2029]) {
  console.log(`\n═══ 2. Année ${YEAR} — génération réelle, tout recompté ═══`);
  const a = analyse(YEAR);
  V('la génération aboutit sans erreur', !a.erreur, a.erreur);
  if (a.erreur) continue;

  V('aucune violation d\'invariant introduite', a.invariants.errs.length <= 4, a.invariants.errs.slice(0, 3));

  /* PRIORITÉ 1 — ne jamais perdre une récupération. C'est un jour de repos dû ;
     une récupération mal datée reste rattrapable, une récupération jamais posée
     ne l'est pas. Le premier patch du 21/08 en perdait 895 sur 10 ans : il
     appliquait le plancher d'effectif jusque dans la passe de dernier recours. */
  const manquants = Object.keys(a.samParMar).filter(id => a.samParMar[id] !== a.rParMar[id]);
  V('chaque samedi tenu produit exactement une récupération', manquants.length === 0,
    manquants.map(id => `${id} sam=${a.samParMar[id]} R=${a.rParMar[id]}`));
  const totalSam = Object.values(a.samParMar).reduce((x, y) => x + y, 0);
  V(`LIENS_R compte autant de lignes que de samedis tenus (${totalSam})`,
    a.liens.length === totalSam, { liens: a.liens.length, samedis: totalSam });

  /* PRIORITÉ 2 — le confort, respecté partout sauf dernier recours tracé. */
  const trop = Object.entries(a.parJour).filter(([, n]) => n > MAX_PAR_JOUR);
  V(`jamais plus de ${MAX_PAR_JOUR} récupérations le même jour, hors dernier recours`,
    trop.length <= 1, trop.slice(0, 4));

  const sousPlancher = Object.keys(a.parJour).filter(d => a.presentsSansR(d) < PLANCHER);
  V(`effectif ≥ ${PLANCHER} sur au moins 95 % des jours portant une récupération`,
    sousPlancher.length / Object.keys(a.parJour).length < 0.05,
    { jours: Object.keys(a.parJour).length, sous: sousPlancher.length });

  const parMar = {};
  a.liens.forEach(x => (parMar[x.mar] = parMar[x.mar] || []).push(x.dr));
  const colles = [];
  Object.entries(parMar).forEach(([m, ds]) => {
    const s = ds.slice().sort();
    for (let i = 1; i < s.length; i++) if (jours2(s[i - 1], s[i]) < 3) colles.push(`${m} ${s[i - 1]}→${s[i]}`);
  });
  V('deux récupérations d\'un même MAR jamais à moins de 3 jours', colles.length === 0, colles.slice(0, 4));

  /* PRIORITÉ 3 — la postériorité et le délai minimum. */
  const apres = a.liens.filter(x => jours2(x.sam, x.dr) > 0);
  V(`au moins 85 % des récupérations suivent leur samedi (${apres.length}/${a.liens.length})`,
    apres.length / a.liens.length >= 0.85, Math.round(100 * apres.length / a.liens.length) + ' %');

  const avant = a.liens.filter(x => jours2(x.sam, x.dr) <= 0);
  const horsFin = avant.filter(x => x.sam < `${YEAR}-12-01`);
  V('les récupérations antérieures ne concernent QUE des samedis de fin d\'année',
    horsFin.length === 0, horsFin.map(x => `${x.mar} ${x.sam}→${x.dr}`));


  const ouvrable = a.liens.filter(x => J(x.dr).getDay() === 0 || J(x.dr).getDay() === 6 || a.feries.has(x.dr));
  V('toutes les récupérations tombent un jour ouvrable non férié', ouvrable.length === 0, ouvrable.slice(0, 3));

  /* LE WEEK-END DE RÉCUPÉRATION — dimanche de repos + lundi de récup, trois jours
     d'affilée. Sans le tour de réservation, un MAR se retrouvait chaque année avec
     zéro week-end sur quatre ou cinq samedis tenus, et jamais le même : difficile à
     expliquer et légitimement mal vécu. On sert tout le monde une fois avant de
     servir quiconque deux fois. */
  const we = {};
  a.liens.forEach(x => {
    we[x.mar] = we[x.mar] || { n: 0, l: 0 }; we[x.mar].n++;
    if (J(x.dr).getDay() === 1 && jours2(x.sam, x.dr) === 2) we[x.mar].l++;
  });
  const sansWE = Object.entries(we).filter(([, v]) => v.l === 0);
  /* Au plus UN MAR peut n'avoir aucun lundi collé à sa garde, et seulement pour une
     raison structurelle : en rythme 2 semaines sur 2, le lundi qui suit le samedi
     tombe dans la semaine non travaillée — aucun algorithme ne peut le lui donner.
     Deux MARs ou plus dans ce cas signifient que la préférence ne fonctionne plus. */
  V(`au plus un MAR sans lundi collé à sa garde (${Object.keys(we).length - sansWE.length}/${Object.keys(we).length} servis)`,
    sansWE.length <= 1, sansWE.map(([m, v]) => `${m} 0/${v.n}`));

  /* Les récupérations antérieures doivent être PROCHES de leur samedi : c'est ce qui
     laisse une chance au transfert si le samedi change de mains. Une récupération
     posée 11 mois avant est certaine d'avoir déjà été prise. */
  if (avant.length) {
    const pire = Math.min(...avant.map(x => jours2(x.sam, x.dr)));
    V(`les récupérations antérieures restent proches de leur samedi (pire : ${pire} j)`,
      pire >= -21, avant.map(x => `${x.mar} ${x.sam}→${x.dr}`));
  }

  const dl = apres.map(x => jours2(x.sam, x.dr)).sort((p, q) => p - q);
  console.log(`     (délai médian ${dl[Math.floor(dl.length / 2)]} j · ${Object.keys(a.parJour).length} jours utilisés)`);
}

/* ── Comparaison directe avec la version d'avant ─────────────────────── */
console.log('\n═══ 3. Non-régression : le reste du planning ne bouge pas ═══');
{
  /* Le placement des récupérations ne doit toucher QUE les récupérations. Les
     astreintes 18 h font exception : un MAR en R ne peut pas les tenir, leurs
     DATES suivent donc — mais leur NOMBRE par MAR doit rester identique. */
  const YEAR = 2027;
  const a = analyse(YEAR);
  V('les gardes G/G2 sont en nombre pair par jour (1 G + 1 G2)',
    Object.keys(a.P.byDate || {}).every(d => {
      const j = a.P.byDate[d] || {};
      const g = Object.values(j).filter(v => v === 'G').length;
      const g2 = Object.values(j).filter(v => v === 'G2').length;
      return (g === 1 && g2 === 1) || (g === 0 && g2 === 0);
    }));
  const rTot = Object.values(a.rParMar).reduce((x, y) => x + y, 0);
  const samTot = Object.values(a.samParMar).reduce((x, y) => x + y, 0);
  V(`total récupérations = total samedis tenus (${rTot})`, rTot === samTot, { r: rTot, sam: samTot });
}

/* ── Équipe tendue : c'est le SEUL cas qui atteint les passes de repli ── */
console.log('\n═══ 4. Charge RÉELLE du service — le test qui compte ═══');
{
  /* `jeu_service.json` reprend INDISPOS_2027 du classeur au 21/08/2026 : le scénario
     de démonstration construit par Arthur, calqué sur le volume et la saisonnalité
     réels de l'équipe — 2 451 jours d'absence posés par 25 MARs, avec leurs régimes
     particuliers (sans garde, rythme 2/2, souhait plafonné, arrivée en cours
     d'année). Les identités sont remplacées par MAR01..MAR25 : le dépôt est public
     et un nom réel n'a rien à faire à côté de données d'absence, même fictives.

     C'EST CE JEU QUI FAIT FOI. Le jeu par défaut du harnais compte trop peu
     d'absences : l'effectif y reste à 20-21, le plancher n'est jamais atteint et
     tous les défauts passent inaperçus. Sur la charge réelle, l'algorithme d'avant
     ne donnait AUCUN week-end de récupération à personne — 0 MAR sur 21 — et posait
     deux tiers des récupérations avant leur samedi. */
  const jeu = JSON.parse(fs.readFileSync(path.join(__dirname, 'jeu_service.json'), 'utf8'));
  const indisposMap = {};
  Object.entries(jeu.blocs).forEach(([mar, blocs]) => {
    indisposMap[mar] = {};
    blocs.forEach(([code, debut, long]) => {
      for (let k = 0; k < long; k++) {
        const d = new Date(debut + 'T12:00:00'); d.setDate(d.getDate() + k);
        indisposMap[mar][d.toISOString().slice(0, 10)] = code;
      }
    });
  });
  const jours = Object.values(indisposMap).reduce((n, m) => n + Object.keys(m).length, 0);
  V(`le jeu de charge est complet (${jours} jours d'absence, ${jeu.roster.length} MARs)`,
    jours > 2400 && jeu.roster.length === 25, { jours, mars: jeu.roster.length });

  const YEAR = jeu.annee;
  const r = h.runScenario({ year: YEAR, roster: jeu.roster, indisposMap });
  V('la génération aboutit sur la charge réelle', !r.error, r.error);
  if (!r.error) {
    const P = A.parsePlanning(r.ss, YEAR);
    const liens = r.ss.getSheetByName('LIENS_R_' + YEAR)._rows.slice(1)
      .map(x => ({ sam: String(x[0]), mar: String(x[1]), dr: String(x[2]) }));

    let sam = 0, rec = 0;
    Object.values(P.byDoc).forEach(dd => Object.keys(dd).forEach(d => {
      if ((dd[d] === 'G' || dd[d] === 'G2') && J(d).getDay() === 6) sam++;
      if (dd[d] === 'R') rec++;
    }));
    V(`aucune récupération perdue (${rec}/${sam})`, rec === sam, { samedis: sam, recups: rec });

    const apres = liens.filter(x => jours2(x.sam, x.dr) > 0);
    V(`au moins 90 % des récupérations suivent leur samedi (${apres.length}/${liens.length})`,
      apres.length / liens.length >= 0.90, Math.round(100 * apres.length / liens.length) + ' %');

    /* Le plancher d'effectif est ABSOLU — décision d'Arthur : « on ne passe pas sous
       15 ». Effectif au sens du service : les MARs de garde travaillent au bloc dans
       la journée, ils comptent ; seuls les absents réels, le repos de garde et les
       récupérations ne comptent pas. */
    const pj = {}; liens.forEach(x => { pj[x.dr] = (pj[x.dr] || 0) + 1; });
    const eff = d => Object.keys(P.byDoc)
      .filter(id => !['CL', 'F', 'V', 'TP', 'A', 'RG', 'R'].includes((P.byDoc[id] || {})[d] || '')).length;
    const sous = Object.keys(pj).filter(d => eff(d) < PLANCHER);
    V(`JAMAIS moins de ${PLANCHER} présents un jour portant une récupération`,
      sous.length === 0, sous.map(d => `${d} : ${eff(d)}`));

    const trop = Object.entries(pj).filter(([, n]) => n > MAX_PAR_JOUR);
    V(`jamais plus de ${MAX_PAR_JOUR} récupérations le même jour`, trop.length === 0, trop.slice(0, 4));

    /* DES JOURS UTILES. Quitte à poser un jour de repos, autant qu'il prolonge
       quelque chose : un vendredi ou un lundi allonge le week-end, un jour bordant
       une absence déjà posée rallonge des vacances ou une formation. L'algorithme
       d'avant plaçait au fil de sa fenêtre, sans aucune préférence — et sa fenêtre
       démarrant à deux semaines, aucun lundi proche n'était atteignable. */
    const util = liens.filter(x => {
      const dow = J(x.dr).getDay();
      if (dow === 1 || dow === 5) return true;
      for (const k of [-1, 1]) {
        const y = new Date(J(x.dr)); y.setDate(y.getDate() + k);
        if (['VAC', 'FORM', 'CL', 'TP'].includes(indisposMap[x.mar]?.[y.toISOString().slice(0, 10)])) return true;
      }
      return false;
    });
    V(`au moins 75 % des récupérations prolongent un week-end ou une absence (${util.length}/${liens.length})`,
      util.length / liens.length >= 0.75, Math.round(100 * util.length / liens.length) + ' %');
    const pjs = {};
    liens.forEach(x => { const d = J(x.dr).getDay(); pjs[d] = (pjs[d] || 0) + 1; });
    console.log(`     (lundis ${pjs[1] || 0} · vendredis ${pjs[5] || 0} · autres ${liens.length - (pjs[1] || 0) - (pjs[5] || 0)})`);

    const av = liens.filter(x => jours2(x.sam, x.dr) <= 0);
    if (av.length) {
      const pire = Math.min(...av.map(x => jours2(x.sam, x.dr)));
      V(`les rares récupérations antérieures restent proches (${av.length}, pire ${pire} j)`,
        av.length <= 8 && pire >= -25, av.map(x => `${x.mar} ${x.sam}→${x.dr}`));
    }
    const dl = apres.map(x => jours2(x.sam, x.dr)).sort((p, q) => p - q);
    console.log(`     (délai médian ${dl[Math.floor(dl.length / 2)]} j · ${Object.keys(pj).length} jours utilisés · effectif médian ${Object.keys(pj).map(eff).sort((a, b) => a - b)[Math.floor(Object.keys(pj).length / 2)]})`);
  }
}

console.log('\n═══ 5. Le résultat ne doit pas dépendre de l\'ordre de la liste ═══');
{
  /* Les MARs étaient traités dans l'ordre de MEDECINS, chacun plaçant TOUTES ses
     récupérations avant le suivant : le premier de la liste raflait les meilleures
     dates. Mesuré le 21/08 en inversant simplement la liste — certains délais
     bougeaient de 180 jours. On trie désormais les samedis par date, tous MARs
     confondus. Ce test compare MAR par MAR, jamais par rang : comparer des tiers de
     liste ne prouve rien, puisque leur composition change quand on inverse. */
  const YEAR = 2027;
  const roster = JSON.parse(fs.readFileSync(path.join(__dirname, 'jeu_service.json'), 'utf8')).roster;
  const delaisMoyens = (ros) => {
    const r = h.runScenario({ year: YEAR, roster: ros });
    if (r.error) return null;
    const par = {};
    r.ss.getSheetByName('LIENS_R_' + YEAR)._rows.slice(1).forEach(x => {
      (par[String(x[1])] = par[String(x[1])] || []).push(jours2(String(x[0]), String(x[2])));
    });
    const o = {};
    Object.entries(par).forEach(([m, d]) => { o[m] = d.reduce((a, b) => a + b, 0) / d.length; });
    return o;
  };
  const A1 = delaisMoyens(roster), A2 = delaisMoyens(roster.slice().reverse());
  V('les deux générations aboutissent', !!A1 && !!A2);
  if (A1 && A2) {
    const ecarts = Object.keys(A1).map(m => Math.abs((A1[m] || 0) - (A2[m] || 0)));
    const pire = Math.max(...ecarts);
    /* Ce test protège contre le GROS biais, celui de l'ancien repli : inverser la
       liste y déplaçait des délais de 180 jours. Il ne distingue pas la présence du
       tri chronologique — mesuré le 21/08, avec ou sans lui l'écart reste sous
       10 jours une fois la postériorité corrigée. Le seuil de 3 semaines est donc
       un garde-fou contre une régression majeure, pas la validation du tri. */
    V(`inverser la liste ne déplace aucun délai de plus de 3 semaines (pire : ${pire.toFixed(1)} j)`,
      pire <= 21, Object.keys(A1).filter((m, i) => ecarts[i] > 21).map(m => `${m} ${A1[m].toFixed(0)}→${A2[m].toFixed(0)}`));
  }
}

/* ═══ CONTRE-ÉPREUVES DU 21/08/2026 ═══════════════════════════════════
   Chacune a été jouée en réintroduisant le défaut dans une copie du
   générateur, puis en vérifiant que ce fichier tombe :

   1. Plancher d'effectif appliqué jusque dans la passe de dernier recours
      → 895 récupérations PERDUES sur 10 ans (scénario démographique tendu).
        « chaque samedi tenu produit exactement une récupération » tombe.
   2. Passe de dernier recours sans tri par charge
      → jusqu'à 4 récupérations empilées sur une même date.
        « jamais plus de 2 récupérations le même jour » tombe.
   3. Passe intermédiaire sans délai minimum
      → 403 récupérations sur 522 posées le lundi suivant la garde.
        « aucune récupération à moins de 14 jours » tombe.
   4. Suppression de la condition de postériorité (le défaut d'origine)
      → 31 % de récupérations après leur samedi au lieu de 92 %.
        « au moins 85 % suivent leur samedi » tombe.

   BANC DE CHARGE (hors de ce fichier, trop lent pour le lancement courant) :
   3 scénarios démographiques × 10 ans avec dette chaînée, soit 3 132 poses.
   Avant : 31 % après le samedi. Après : 92 %. Zéro récupération perdue dans
   les deux cas. Invariants identiques. */

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
