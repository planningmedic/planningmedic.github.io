/* ═══ BANC — STAFF VACANCES : VIVIER DES WEEK-ENDS ET PONTS ═════════════════
   (lots D et E, 01/09/2026)

   LOT D — les colonnes samedi et dimanche affichent enfin quelque chose.
   Elles n'avaient NI compteur NI couleur : la grille les grisait, et le comité
   posait à l'aveugle les seuls jours où deux gardes doivent être assurées avec
   un effectif réduit. Mesuré sur les vacances 2027 déjà saisies : le week-end
   des 10-11 juillet portait 19 MAR en congés pour un seuil de période de 10,
   invisible. Ce qui s'affiche désormais n'est pas le nombre d'absents (un seuil
   de période ne veut rien dire un samedi) mais le nombre de GARDEURS encore
   disponibles, face au minimum de 4 posé par Arthur — deux le samedi, deux le
   dimanche.

   LOT E — l'onglet « Ponts ». Un pont est le jour ouvré coincé entre un férié
   et le week-end : très rentable (un jour posé en rapporte quatre), c'était un
   libre-service. Il s'attribue désormais au staff, avant la génération.

   Les fonctions sont EXTRAITES de staff.html, jamais recopiées. */
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const PAGE = path.join(__dirname, '..', 'staff.html');
const src = fs.readFileSync(PAGE, 'utf8');
function extraire(nom) {
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error(nom + ' introuvable dans staff.html');
  let prof = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
  return src.slice(i, j + 1);
}
function extraireConst(nom) {
  /* La déclaration est suivie d'un commentaire de fin de ligne dans la page :
     on s'arrête au premier point-virgule, pas à la fin de la ligne. */
  let i = src.indexOf('const ' + nom + ' =');
  if (i < 0) i = src.indexOf('const ' + nom + '=');
  if (i < 0) throw new Error('const ' + nom + ' introuvable');
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
}

/* Contexte minimal : les DONNÉES sont fabriquées ici, le CODE vient de la page. */
function monde(medecins, saisies, feries) {
  const ctx = vm.createContext({ Date, Set, String, Object, Number, Math, Array, console, RegExp });
  ctx.globalThis = ctx;
  ctx.medecins = medecins;
  ctx.saisies = saisies || {};
  ctx.joursFeries = new Set(feries || []);
  ctx.currentYear = 2027;
  vm.runInContext(extraireConst('VIVIER_MINI'), ctx);
  vm.runInContext(extraireConst('VIVIER_CONFORT'), ctx);
  vm.runInContext(extraireConst('ANCRE_2SUR2'), ctx);
  vm.runInContext(extraireConst('JOURS_CODE'), ctx);
  vm.runInContext(extraire('isWeekend'), ctx);
  vm.runInContext(extraire('semaineOff2sur2'), ctx);
  vm.runInContext(extraire('gardeurDispo'), ctx);
  vm.runInContext(extraire('vivierGarde'), ctx);
  vm.runInContext(extraire('vivierClasse'), ctx);
  vm.runInContext(extraire('detecterPonts'), ctx);
  return ctx;
}
const M = (id, extra) => Object.assign({ id, initiales: id.slice(0, 2), actif: true,
  quotite: 100, pctGardes: 100, noGarde: false, noWeekend: false, rythme2sur2: false,
  souhaitPlafond: false, tpJoursFixes: '', dateDebut: '', dateFin: '' }, extra || {});

/* ═══ 1. Qui compte dans le vivier de garde ? ═══════════════════════════ */
console.log('\n═══ 1. Le compte ne retient que ceux qui peuvent réellement prendre la garde ═══');
{
  const SAM = '2027-07-10', LUN = '2027-07-12';
  const tous = [M('A'), M('B'), M('C'), M('D')];
  V('quatre médecins disponibles un samedi → vivier de 4',
    monde(tous, {}).vivierGarde(SAM) === 4);
  V('celui qui ne prend jamais de garde ne compte pas',
    monde([M('A'), M('B'), M('C'), M('NOG', { noGarde: true })], {}).vivierGarde(SAM) === 3);
  V('celui qui ne fait jamais de week-end ne compte pas un samedi',
    monde([M('A'), M('B'), M('WE', { noWeekend: true })], {}).vivierGarde(SAM) === 2);
  V('…mais il compte bien un lundi',
    monde([M('A'), M('B'), M('WE', { noWeekend: true })], {}).vivierGarde(LUN) === 3);
  V('le régime à part (souhaits plafonnés) ne compte pas un week-end',
    monde([M('A'), M('B'), M('P', { souhaitPlafond: true })], {}).vivierGarde(SAM) === 2);
  V('une part de gardes nulle ne compte pas',
    monde([M('A'), M('B'), M('Z', { pctGardes: 0 })], {}).vivierGarde(SAM) === 2);
  V('un médecin parti avant la date ne compte pas',
    monde([M('A'), M('B'), M('X', { dateFin: '2027-01-01' })], {}).vivierGarde(SAM) === 2);
  V('un médecin pas encore arrivé ne compte pas',
    monde([M('A'), M('B'), M('X', { dateDebut: '2027-12-01' })], {}).vivierGarde(SAM) === 2);
  V('des vacances retirent du vivier',
    monde(tous, { A: { [SAM]: 'VAC' } }).vivierGarde(SAM) === 3);
  V('une formation aussi',
    monde(tous, { A: { [SAM]: 'FORM' } }).vivierGarde(SAM) === 3);
  V('un jour de la semaine jamais travaillé retire du vivier ce jour-là',
    monde([M('A'), M('B'), M('F', { tpJoursFixes: 'LUN' })], {}).vivierGarde(LUN) === 2);
  V('…et ne change rien les autres jours',
    monde([M('A'), M('B'), M('F', { tpJoursFixes: 'LUN' })], {}).vivierGarde('2027-07-13') === 3);
  /* Le rythme deux semaines sur deux : une semaine sur deux compte, l'autre non.
     On n'affirme pas LAQUELLE — l'ancre est celle du générateur — mais les deux
     cas doivent exister, sinon le calcul est inerte. */
  const c = monde([M('R', { rythme2sur2: true })], {});
  const semaines = [];
  for (let d = new Date(2027, 0, 4); d < new Date(2027, 2, 1); d.setDate(d.getDate() + 7)) {
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    semaines.push(c.vivierGarde(s));
  }
  V('le rythme deux semaines sur deux alterne réellement',
    semaines.includes(0) && semaines.includes(1), semaines);
}

/* ═══ 2. Les seuils ═════════════════════════════════════════════════════ */
console.log('\n═══ 2. Les trois bandes : moins de 4 impossible · 4-5 sans marge · 6+ confortable ═══');
{
  const c = monde([M('A')], {});
  V('0 disponible → rouge', c.vivierClasse(0) === 'hot');
  V('3 disponibles → rouge (il en faut 4)', c.vivierClasse(3) === 'hot');
  V('4 disponibles → orange, le strict minimum', c.vivierClasse(4) === 'warn');
  V('5 disponibles → orange', c.vivierClasse(5) === 'warn');
  V('6 disponibles → vert', c.vivierClasse(6) === 'ok');
  V('20 disponibles → vert', c.vivierClasse(20) === 'ok');
  /* Une `const` déclarée dans un contexte n'en est pas une propriété : on
     l'évalue DANS le contexte plutôt que de la lire à côté. */
  const val = n => vm.runInContext(n, c);
  V('le minimum retenu est bien 4 (deux binômes distincts)', val('VIVIER_MINI') === 4);
  V('le confort commence à 6', val('VIVIER_CONFORT') === 6);
}

/* ═══ 3. La page affiche vraiment ce chiffre les week-ends ══════════════ */
console.log('\n═══ 3. staff.html · le week-end n\'est plus une colonne muette ═══');
{
  V('le compteur des week-ends est calculé dans l\'en-tête',
    src.includes('const viv=we?vivierGarde(date):null'));
  V('la couleur de tension s\'applique désormais AUSSI aux week-ends',
    src.includes("const ten=isFormMode?'':(' tension-'+(we?vivierClasse(viv):tension(date,seuil)))"));
  V('l\'ancienne exclusion des week-ends a disparu',
    !src.includes("const ten=we||isFormMode?''"));
  V('le chiffre est affiché dans la colonne du week-end',
    src.includes("gt-th-day-count gt-viv"));
  V('une infobulle explique ce que le chiffre veut dire',
    /médecin\(s\) encore disponible\(s\) pour la garde/.test(src));
  V('la légende dit qu\'il en faut 4',
    /le chiffre est le nombre de médecins encore disponibles[\s\S]{0,200}<strong>4<\/strong>/.test(src));
}

/* ═══ 4. La détection des ponts ═════════════════════════════════════════ */
console.log('\n═══ 4. Un pont OFFICIEL : le jour ouvré COINCÉ entre un férié et le week-end ═══');
{
  /* Fériés monégasques 2027 (calculés par getJoursFeries, servis par la copie
     rapide) : l'Ascension le jeudi 6 mai, la Fête-Dieu le jeudi 27 mai. */
  const F2027 = ['2027-01-01', '2027-01-27', '2027-03-29', '2027-05-01', '2027-05-06',
                 '2027-05-17', '2027-05-27', '2027-08-16', '2027-11-01', '2027-11-19',
                 '2027-12-08', '2027-12-25'];
  const c = monde([M('A')], {}, F2027);
  const ponts = c.detecterPonts(2027);
  const dates = ponts.map(p => p.date);
  /* DÉFINITION ARRÊTÉE LE 03/09/2026 : seuls les ponts OFFICIELS comptent — le
     jour ouvré COINCÉ, chômé la veille, chômé le lendemain, un férié d'un côté.
     Deux jours en 2027 : les vendredis 7 et 28 mai.
     Le banc garde la trace du détour pour qu'il ne soit pas refait : un critère
     purement arithmétique (« quatre jours de repos pour un seul posé ») en
     désignait TREIZE, en comptant le vendredi d'avant et le mardi d'après un
     lundi férié. Le calcul était juste, la notion non : ces jours-là allongent
     un week-end, ils ne ferment pas un trou. */
  V('2027 compte DEUX ponts', ponts.length === 2, dates);
  V('vendredi 7 mai — entre l\'Ascension du jeudi et le week-end',
    dates.includes('2027-05-07'), dates);
  V('vendredi 28 mai — entre la Fête-Dieu du jeudi et le week-end',
    dates.includes('2027-05-28'), dates);

  /* Les six recalés de l'ancienne définition, nommément. Chacun rapporte bien
     quatre jours ; aucun n'est coincé — sa veille ou son lendemain est ouvré. */
  V('vendredi 26 mars — avant le lundi de Pâques — N\'EST PAS un pont',
    !dates.includes('2027-03-26'), dates);
  V('lundi 4 janvier — après le 1er janvier férié — non plus',
    !dates.includes('2027-01-04'), dates);
  V('lundi 22 novembre — après la Fête du Prince du vendredi — non plus',
    !dates.includes('2027-11-22'), dates);
  V('mardi 30 mars — après le lundi de Pâques — non plus',
    !dates.includes('2027-03-30'), dates);
  V('mardi 17 août — après l\'Assomption reportée au lundi — non plus',
    !dates.includes('2027-08-17'), dates);
  V('jeudi 18 novembre — avant la Fête du Prince du vendredi — non plus',
    !dates.includes('2027-11-18'), dates);

  V('ils sont rendus dans l\'ordre du calendrier',
    dates.join('|') === dates.slice().sort().join('|'), dates);
  V('chaque pont dit de quel férié il vient', ponts.every(p => F2027.includes(p.ferie)));
  V('chaque pont dit en clair de quel jour il s\'agit',
    ponts.every(p => /(lundi|mardi|mercredi|jeudi|vendredi), (après|avant) le férié du /.test(p.quoi)),
    ponts.map(p => p.quoi));

  /* Un lundi coincé avant un mardi férié en est un aussi. 2028 : le 15 août
     tombe un mardi, le lundi 14 est donc un pont. */
  const F2028 = ['2028-01-27', '2028-05-25', '2028-06-15', '2028-08-15'];
  const p28 = monde([M('A')], {}, F2028).detecterPonts(2028).map(p => p.date);
  V('un lundi avant un mardi férié est reconnu comme pont',
    p28.includes('2028-08-14'), p28);
  V('un jeudi férié donne le vendredi qui suit',
    p28.includes('2028-01-28') && p28.includes('2028-05-26'), p28);
  V('un mercredi férié (Sainte Dévote 2028) ne donne AUCUN pont — il n\'y a pas de jour coincé',
    !p28.includes('2028-01-25') && !p28.includes('2028-01-26'), p28);
  V('2028 en compte quatre, pas davantage', p28.length === 4, p28);

  /* Ce que la règle du jour coincé refuse, cas par cas. */

  V('un férié le mercredi ne crée pas de pont',
    monde([M('A')], {}, ['2027-12-08']).detecterPonts(2027).length === 0);
  /* Un férié isolé le lundi laisse le vendredi d'avant ouvert sur le jeudi, et
     le mardi d'après ouvert sur le mercredi : ni l'un ni l'autre n'est coincé. */
  V('un férié le lundi ne donne AUCUN pont',
    monde([M('A')], {}, ['2027-11-01']).detecterPonts(2027).length === 0,
    monde([M('A')], {}, ['2027-11-01']).detecterPonts(2027).map(p => p.date));
  V('un férié le vendredi ne donne AUCUN pont',
    monde([M('A')], {}, ['2027-11-19']).detecterPonts(2027).length === 0,
    monde([M('A')], {}, ['2027-11-19']).detecterPonts(2027).map(p => p.date));
  V('un férié le samedi ne donne rien (le week-end absorbe tout)',
    monde([M('A')], {}, ['2027-05-01']).detecterPonts(2027).length === 0);
  /* Deux fériés consécutifs jeudi+vendredi : le mercredi d'avant rapporterait
     cinq jours, mais son mardi est ouvré — il n'est pas coincé. Sous la règle
     officielle, cette semaine-là ne donne aucun pont. */
  V('deux fériés qui se suivent en fin de semaine ne laissent aucun pont',
    monde([M('A')], {}, ['2027-05-06', '2027-05-07']).detecterPonts(2027).length === 0,
    monde([M('A')], {}, ['2027-05-06', '2027-05-07']).detecterPonts(2027).map(p => p.date));
  /* Un mardi ET un jeudi fériés la même semaine ferment TROIS jours d'un coup :
     le lundi (dimanche + mardi férié), le mercredi (pris entre les deux fériés)
     et le vendredi (jeudi férié + samedi). Cas rare mais réel, et il montre que
     tous les ponts ne valent pas quatre jours : le mercredi n'en rend que trois,
     et l'écran l'annonce tel quel plutôt que d'arrondir. */
  {
    const r = monde([M('A')], {}, ['2027-05-04', '2027-05-06']).detecterPonts(2027);
    V('deux fériés mardi et jeudi ferment trois jours ouvrés',
      r.map(p => p.date).join() === '2027-05-03,2027-05-05,2027-05-07', r.map(p => p.date));
    V('le mercredi coincé entre deux fériés ne rend que trois jours, et le dit',
      r[1] && r[1].repos === 3, r.map(p => p.repos));
  }
  V('sans jours fériés connus, aucun pont n\'est deviné',
    monde([M('A')], {}, []).detecterPonts(2027).length === 0);
  V('les fériés d\'une AUTRE année ne comptent pas',
    monde([M('A')], {}, ['2028-01-27']).detecterPonts(2027).length === 0);
}

/* ═══ 5. L'écran des ponts ══════════════════════════════════════════════ */
console.log('\n═══ 5. staff.html · ce que l\'écran des ponts met sous les yeux ═══');
{
  V('un onglet « Ponts » existe à côté de VAC, FORM et VAC année',
    src.includes('id="btnPONTS"') && src.includes("setType('PONTS')"));
  V('un pont est posé comme une vacance (il consomme le quota)',
    /pontsMode=\(t==='PONTS'\);[\s\S]{0,120}currentType=\(t==='FORM'\)\?'FORM':'VAC'/.test(src));
  V('l\'écran compte les ponts obtenus par chaque MAR',
    src.includes("const compte=m=>ponts.filter(p=>(saisies[m.id]||{})[p.date]==='VAC').length"));
  V('il nomme ceux qui n\'ont AUCUN pont cette année',
    src.includes('Aucun pont cette année pour'));
  V('il félicite quand tout le monde en a un',
    src.includes('Tous les médecins ont au moins un pont cette année'));
  V('il rappelle le vivier de garde de chaque pont (un vendredi est un demi-week-end)',
    /renderPonts[\s\S]{0,2200}vivierGarde\(p\.date\)/.test(src));
  V('il dit que le pont compte dans le quota de vacances',
    /compte dans le quota de vacances/.test(src));
  V('le mode ponts court-circuite la grille et le récap',
    src.includes('if(pontsMode){ renderPonts(); return; }'));
  V('les onglets de période sont neutralisés en mode ponts',
    /function buildPeriodeTabs[\s\S]{0,400}if\(pontsMode\)\{/.test(src));
  V('l\'écran se met en sommeil si les fériés manquent, au lieu de deviner',
    src.includes('Les jours fériés ne sont pas encore disponibles'));
}

/* ═══ 6. Les jours fériés viennent de la source unique ══════════════════ */
console.log('\n═══ 6. Aucune règle de calendrier n\'est recopiée dans la page ═══');
{
  V('les fériés sont lus dans la copie rapide (clé joursferies_{année})',
    src.includes("miroirRead(['joursferies_'+currentYear]"));
  V('la page ne recalcule JAMAIS la date de Pâques elle-même',
    !/paques|Paques|Pâques/.test(src));
  V('un échec de lecture laisse simplement l\'ensemble vide',
    /joursferies_[\s\S]{0,400}catch\(e\)\{\}/.test(src));
  /* (03/09/2026) Défaut vu en production le soir du staff : l'onglet Ponts de
     l'année 2027 restait en sommeil. La clé joursferies_{Y} n'est publiée que
     pour les années possédant un onglet GARDES_{Y} (miroir.gs) — donc jamais
     pendant la campagne de congés de l'année suivante, qui est précisément le
     moment où cet écran sert. Il lui faut un repli, comme pour les périodes. */
  const bloc = src.slice(src.indexOf("miroirRead(['joursferies_'+currentYear]"),
                         src.indexOf('const iRes'));
  V('la clé absente n\'est plus un cul-de-sac : repli sur getJoursFeries',
    /if\(!joursFeries\.size\)\{[\s\S]{0,400}action:'getJoursFeries'/.test(bloc), bloc.slice(-400));
  V('le repli demande bien l\'année affichée',
    /action:'getJoursFeries',year:currentYear/.test(bloc));
  V('la copie rapide reste essayée EN PREMIER',
    bloc.indexOf('miroirRead') < bloc.indexOf('getJoursFeries'));
  V('le repli ne recopie aucune règle de calendrier',
    !/paques|Paques|Pâques|11-11|05-01/.test(bloc));
  V('un repli qui échoue laisse l\'écran en sommeil, il ne devine pas',
    /getJoursFeries[\s\S]{0,260}catch\(e\)\{\}/.test(bloc));
}

/* ═══ 7. La barre rouge : une commande, un endroit ══════════════════════ */
console.log('\n═══ 7. staff.html · Priorités monte dans la barre, Récap n\'y est plus ═══');
{
  const head = src.slice(src.indexOf('<div class="header-right">'),
                         src.indexOf('</div>', src.indexOf('<div class="header-right">')));
  V('le bouton « Priorités » est dans la barre rouge',
    /openRecapPriorites\(\)/.test(head), head.slice(0, 300));
  V('le bouton « Récap » a quitté la barre rouge',
    !/Récap/.test(head), head.slice(0, 300));
  V('« Valider et verrouiller » y reste', /doValidate\(\)/.test(head));
  V('le déverrouillage y reste aussi', /unlockAll\(\)/.test(head));
  /* Le sélecteur Grille / Récap, lui, ne bouge pas : c'est lui qui commande
     désormais l'affichage, et il est posé juste au-dessus de la grille. */
  V('le sélecteur Grille / Récap est toujours là',
    /id="vtGrille"/.test(src) && /id="vtRecap"/.test(src));
  /* On compte les APPELS (onclick), pas la déclaration de la fonction : la
     première version de ce test comptait les deux et échouait sur du code
     correct. */
  V('« Priorités » n\'est plus en double : un seul bouton l\'appelle',
    (src.match(/onclick="openRecapPriorites\(\)"/g) || []).length === 1,
    (src.match(/onclick="openRecapPriorites\(\)"/g) || []).length);
  V('la fonction, elle, existe toujours', /function openRecapPriorites\(/.test(src));
  /* toggleView() lisait #viewBtn, retiré avec le bouton : la garder aurait
     laissé une fonction qui échoue au premier appel. */
  V('toggleView() a disparu avec son bouton', !/function toggleView\(/.test(src));
  V('plus aucun code ne lit #viewBtn',
    !/getElementById\('viewBtn'\)/.test(src));
}

/* ═══ 8. Noël & Jour de l'An : un tableau consultable, plus un bandeau ══ */
console.log('\n═══ 8. L\'historique de Noël se consulte au lieu de défiler ═══');
{
  const fsx = require('fs'), px = require('path');
  /* Le bandeau ne montrait que huit prioritaires, en boucle : impossible de
     voir qui était exempté ni depuis quand. Il est remplacé, pas doublé. */
  V('le bandeau défilant a disparu de la page',
    !/id="noelBanner"/.test(src) && !/renderNoelBanner/.test(src));
  V('ses styles et son animation sont partis avec lui',
    !/noel-bnr/.test(src) && !/nbScroll/.test(src));
  V('un bouton « Noël » est dans la barre rouge',
    /openRecapNoel\(\)/.test(src.slice(src.indexOf('<div class="header-right">'),
                                       src.indexOf('</div>', src.indexOf('<div class="header-right">')))));
  V('l\'écran demande l\'historique complet au serveur',
    /getNoelAnEligibles[\s\S]{0,90}historique:true/.test(src));
  /* (01/09/2026) L'écran ne désigne PLUS de prioritaires : décision d'Arthur,
     il y a souvent plus de huit candidats légitimes et l'arbitrage revient au
     comité. Le tableau montre l'historique brut, une ligne par MAR, une
     colonne par année. */
  V('l\'écran ne classe plus les MAR en prioritaires et dispensés',
    !/À servir en priorité/.test(src) && !/Ont donné récemment/.test(src));
  V('il dresse une matrice année par année',
    /annees\.forEach/.test(src) && /m\.annees\.indexOf\(a\.annee\)/.test(src));
  V('chaque année annonce les noms trouvés sur ceux qu\'elle mobilisait',
    /a\.tenus\+'\/'\+a\.postes/.test(src));
  V('le passage à la double garde est marqué visuellement',
    /const bascule=annees\.findIndex\(a=>a\.postes===8\)/.test(src));
  /* Les apostrophes sont échappées dans le source de la page : on cherche le
     texte tel qu'il est ÉCRIT, pas tel qu'il s'affiche. */
  V('la règle des trois ans est rappelée sans nommer personne',
    /pas tenu ces dates depuis trois ans/.test(src));
  V('un historique vide le dit au lieu d\'afficher un tableau creux',
    /Aucun médecin à afficher/.test(src));
  V('une panne de chargement le dit au lieu d\'afficher une page vide',
    /Historique indisponible pour le moment/.test(src));

  /* Côté serveur : une seule lecture des sources pour deux besoins. */
  const code = fsx.readFileSync(px.join(__dirname, '..', 'gas', 'code.gs'), 'utf8');
  V('getNoelHistoryDetail collecte toutes les années',
    /function getNoelHistoryDetail\(beforeYear\)/.test(code));
  V('getNoelHistory n\'est plus qu\'une vue de ce détail (aucun second parcours)',
    /function getNoelHistory\(beforeYear\) \{[\s\S]{0,400}getNoelHistoryDetail\(beforeYear\)/.test(code));
  V('l\'ancienne version dupliquée a été supprimée, pas mise de côté',
    !/_getNoelHistoryAncien_/.test(code));
  V('les quatre dates restent 24, 25, 31 décembre et 1er janvier',
    /\$\{y\}-12-24[\s\S]{0,80}\$\{y\}-12-25[\s\S]{0,80}\$\{y\}-12-31[\s\S]{0,80}\$\{y \+ 1\}-01-01/.test(code));

  const ind = fsx.readFileSync(px.join(__dirname, '..', 'gas', 'Indispos.gs'), 'utf8');
  V('l\'historique est un champ À PART de la liste des prioritaires',
    /if \(payload\.historique === true\) _rep\.historique = computeNoelAnHistorique\(yr\)/.test(ind));
  V('…pour que le contrôle du W2 continue de porter sur les seuls prioritaires',
    /eligibles: computeNoelAnEligibles\(yr, payload\.tous === true\)/.test(ind));
  V('le serveur ne rend plus de drapeau « prioritaire » dans l\'historique',
    !/prioritaire:/.test(ind));
  /* Le nombre de postes par année vit en UN seul endroit : la double garde
     est effective depuis octobre 2025, donc dès le Noël 2025. Sans ce chiffre,
     une année ancienne à quatre noms passerait pour une saisie incomplète. */
  V('la bascule vers la double garde est une constante nommée',
    /const NOEL_AN_DOUBLE_GARDE_DEPUIS = 2025;/.test(ind));
  V('4 postes avant, 8 à partir de la bascule',
    /return Number\(annee\) >= NOEL_AN_DOUBLE_GARDE_DEPUIS \? 8 : 4;/.test(ind));
  V('l\'historique rend les MAR ET les années à afficher',
    /return \{ mars: out, annees: annees \};/.test(ind));
  V('le tableau est borné à huit colonnes (lisible sur un portable)',
    /if \(liste\.length > 8\) liste = liste\.slice\(liste\.length - 8\);/.test(ind));
  /* Le compte de l'année porte sur TOUT l'historique, pas sur les seules
     lignes affichées : un médecin parti du service a bien tenu sa garde, et
     l'exclure du compte ferait annoncer un trou sur une année complète. */
  V('le compte d\'une année inclut les médecins qui ont quitté le service',
    /Object\.keys\(detail\)\.forEach\(function \(id\) \{ if \(detail\[id\]\.indexOf\(a\) >= 0\) n\+\+; \}\)/.test(ind));
  V('…et ne se contente pas de filtrer les lignes du tableau',
    !/tenus: out\.filter/.test(ind));
  V('les MAR sans garde et le régime à part sont écartés du tableau',
    /computeNoelAnHistorique[\s\S]{0,1400}FLAGS\.noGarde\.has\(id\)[\s\S]{0,120}FLAGS\.souhaitPlafond\.has\(id\)/.test(ind));
}

/* ═══ 8 bis. L'historique de Noël voyage par la copie rapide ════════════
   (04/09/2026) Défaut de PRODUCTION, constaté en séance devant le service :
   le bouton « 🎄 Noël & Jour de l'An » a répondu « historique indisponible ».
   `getNoelAnEligibles` était le SEUL appel de staff.html à partir en direct sur
   Apps Script — médecins, indispos, fériés et périodes arrivent tous de la
   copie rapide. Apps Script exécute en FILE : une vingtaine de connexions
   simultanées ont suffi à mettre le clic derrière tout le monde. Le soir, au
   calme, le même bouton répondait — ce qui exclut une erreur de code.

   Ce que ces vérifications tiennent :
     · l'historique part avec `vacances_admin`, déjà lue au chargement ;
     · il est enveloppé dans SON PROPRE try — sinon une erreur ici emporterait
       les périodes et les groupes, donc tout l'écran du staff vacances ;
     · l'écran contrôle l'année avant de s'en servir ;
     · le repli direct reste en place et n'a pas été retiré.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n═══ 8 bis. Le tableau de Noël ne dépend plus d\'un appel Google au clic ═══');
{
  const fsx = require('fs'), px = require('path');
  const mir = fsx.readFileSync(px.join(__dirname, '..', 'gas', 'miroir.gs'), 'utf8');
  const src2 = fsx.readFileSync(px.join(__dirname, '..', 'staff.html'), 'utf8');

  /* Côté serveur — la clé qui porte les périodes porte aussi l'historique. */
  const bloc = (function () {
    const i = mir.indexOf('function _miroirConstruireVacancesAdmin_(');
    if (i < 0) throw new Error('_miroirConstruireVacancesAdmin_ introuvable');
    let prof = 0, j = mir.indexOf('{', i);
    for (; j < mir.length; j++) { if (mir[j] === '{') prof++; else if (mir[j] === '}') { prof--; if (!prof) break; } }
    return mir.slice(i, j + 1);
  })();
  V('vacances_admin rend désormais un champ noel',
    /return \{ success: true, periodes: periodes, groupes: groupes, noel: noel \};/.test(bloc));
  V('il est construit par la MÊME fonction que l\'appel direct (aucun second calcul)',
    /computeNoelAnHistorique\(yNoel\)/.test(bloc));
  V('l\'année servie est celle de la campagne, pas l\'année civile',
    /var yNoel = getIndisposYear\(\);/.test(bloc));
  V('l\'année voyage AVEC l\'historique, pour que l\'écran puisse la contrôler',
    /annee: Number\(yNoel\), historique:/.test(bloc));
  /* Le filet qui compte : `_miroirAjouteEnveloppe_` abandonne la clé entière
     au premier jet. Sans try local, une panne de l'historique de Noël ferait
     disparaître les périodes et les groupes — l'écran entier. */
  V('l\'historique a son PROPRE try : une panne ici ne peut pas emporter la clé',
    /try \{[\s\S]{0,200}computeNoelAnHistorique\(yNoel\)[\s\S]{0,60}\} catch \(e\) \{ noel = null; \}/.test(bloc));
  V('…et l\'échec vaut null, jamais un objet à moitié rempli',
    /var noel = null;/.test(bloc));

  /* Côté écran — on s'en sert, on contrôle l'année, on garde le repli. */
  V('l\'écran range l\'historique livré avec les périodes',
    /pRes\.noel && Number\(pRes\.noel\.annee\)===currentYear/.test(src2));
  V('il refuse un historique qui ne porte pas la bonne année',
    /Number\(pRes\.noel\.annee\)===currentYear/.test(src2));
  V('il refuse aussi un historique mal formé',
    /Array\.isArray\(pRes\.noel\.historique\.mars\)/.test(src2));
  V('le repli direct sur Apps Script n\'a PAS été retiré',
    /action:'getNoelAnEligibles',year:currentYear,historique:true/.test(src2));
  V('…et il ne se déclenche que si rien n\'a été livré',
    /if\(!noelHistoData\)\{[\s\S]{0,900}getNoelAnEligibles/.test(src2));
  V('le message d\'échec reste en place pour le cas où les deux voies tombent',
    /Historique indisponible pour le moment/.test(src2));

  /* La clé n'est pas suffixée par année : elle n'a donc RIEN à faire dans la
     liste des clés effaçables par année, et n'impose aucun déploiement du
     Worker. On le vérifie, sinon le prochain lecteur ajoutera l'un ou l'autre
     « par sécurité » et rouvrira le débat. */
  V('vacances_admin reste hors de la liste des clés datées par année',
    /const MIROIR_CLES_PAR_ANNEE\s*=\s*\[[^\]]*\]/.test(mir) &&
    !/MIROIR_CLES_PAR_ANNEE[\s\S]{0,400}vacances_admin/.test(mir));
  const wk = fsx.readFileSync(px.join(__dirname, '..', 'cloudflare', 'worker.js'), 'utf8');
  V('le Worker n\'a pas besoin d\'une règle neuve : vacances_admin est déjà au comité',
    /cle === 'vacances_admin'[\s\S]{0,120}user\.role === 'admin'/.test(wk));
  V('aucune clé noel_ n\'a été inventée au passage',
    !/noel_\\d\{4\}/.test(wk));
}

/* ═══ 9. Le quota se compte en jours TRAVAILLÉS ═════════════════════════ */
console.log('\n═══ 9. staff.html · ni les week-ends ni les fériés ne mangent le quota ═══');
{
  /* (01/09/2026) Cet écran ne retirait que les week-ends, quand le serveur et
     l'écran du MAR retirent aussi les fériés. Douze MAR étaient annoncés
     au-dessus de leur quota sur un jeu réel, uniquement parce que leurs congés
     enjambaient des jours fériés. */
  const ctx = vm.createContext({ Date, Set, String, Object, Number, Math, Array, console, RegExp });
  ctx.globalThis = ctx;
  ctx.saisies = { AA: {
    '2027-05-03':'VAC','2027-05-04':'VAC','2027-05-05':'VAC',
    '2027-05-06':'VAC',                       // Ascension — férié, ne doit rien coûter
    '2027-05-07':'VAC',
    '2027-05-08':'VAC','2027-05-09':'VAC',    // samedi et dimanche — idem
    '2027-05-10':'VAC' } };
  ctx.joursFeries = new Set(['2027-05-06']);
  vm.runInContext(extraire('isWeekend'), ctx);
  vm.runInContext(extraire('estChome'), ctx);
  vm.runInContext(extraire('countForMAR'), ctx);
  V('un bloc de 8 jours enjambant un férié et un week-end compte 5 jours',
    ctx.countForMAR('AA', 'VAC') === 5, ctx.countForMAR('AA', 'VAC'));
  /* Contre-preuve : sans le retrait des fériés, on compterait 6. Le test
     n° 1 ne prouverait rien si les deux règles donnaient le même chiffre. */
  const ctx2 = vm.createContext({ Date, Set, String, Object, Number, Math, Array, console, RegExp });
  ctx2.globalThis = ctx2; ctx2.saisies = ctx.saisies; ctx2.joursFeries = new Set();
  vm.runInContext(extraire('isWeekend'), ctx2);
  vm.runInContext(extraire('estChome'), ctx2);
  vm.runInContext(extraire('countForMAR'), ctx2);
  V('sans jours fériés connus, le même bloc en compte 6 (l\'ancien comportement)',
    ctx2.countForMAR('AA', 'VAC') === 6, ctx2.countForMAR('AA', 'VAC'));
  V('le compte passe par estChome, pas par isWeekend seul',
    /countForMAR[\s\S]{0,240}estChome\(d\)/.test(src) && !/src\[d\]===type&&!isWeekend\(d\)/.test(src));
  V('estChome retire bien les deux : week-end ET férié',
    /function estChome\(ds\)\{ return isWeekend\(ds\) \|\| joursFeries\.has\(ds\); \}/.test(src));
}

/* ═══ 10. Les vues par mois s'arrêtent aux bornes de l'année de planning ═══
   Defaut vu en production le 03/09/2026 : les onglets FORM et « VAC annee »
   fabriquaient le mois calendaire entier. Les 1, 2 et 3 janvier 2027 etaient
   donc cliquables alors qu'INDISPOS_2027 commence au lundi 4 (verifie au
   classeur : 363 colonnes, du 04/01/2027 au 02/01/2028). saveIndisposBatch ne
   reecrit que les colonnes existantes : la saisie etait jetee EN SILENCE, avec
   un « enregistre » affiche. Meme defaut que celui corrige le 12/08 sur
   indispos.html (banc T072) — la borne sert a l'AFFICHAGE ET au CLIC. */
console.log('\n═══ 10. staff.html · les vues par mois respectent l\'année de planning ═══');
{
  const ctx = vm.createContext({ Date, Set, String, Object, Number, Math, Array, console, RegExp });
  ctx.globalThis = ctx;
  ctx.currentYear = 2027;
  vm.runInContext(extraire('premierJourAnneePlanning'), ctx);
  vm.runInContext(extraire('bornesAnneePlanning'), ctx);
  vm.runInContext(extraire('horsAnneePlanning'), ctx);
  vm.runInContext(extraire('getMonthDays'), ctx);

  /* Les bornes doivent etre EXACTEMENT celles du serveur et celles d'indispos.html. */
  const b = ctx.bornesAnneePlanning(2027);
  V('2027 commence au lundi 04/01/2027', b.debut === '2027-01-04', b.debut);
  V('2027 finit au dimanche 02/01/2028', b.fin === '2028-01-02', b.fin);
  const b28 = ctx.bornesAnneePlanning(2028);
  V('2028 : du 03/01/2028 au 07/01/2029', b28.debut === '2028-01-03' && b28.fin === '2029-01-07', b28);

  const janv = ctx.getMonthDays(0);
  V('l\'onglet Janvier ne commence plus le 1er', janv[0] === '2027-01-04', janv.slice(0, 4));
  V('les 1, 2 et 3 janvier ont disparu de la grille', janv.length === 28, janv.length);
  V('le 31 janvier est toujours là', janv[janv.length - 1] === '2027-01-31', janv[janv.length - 1]);
  V('un mois de plein milieu d\'année est intact', ctx.getMonthDays(5).length === 30, ctx.getMonthDays(5).length);
  V('décembre est intact lui aussi', ctx.getMonthDays(11).length === 31, ctx.getMonthDays(11).length);

  /* Contre-preuve : sans la borne, janvier compterait 31 jours. */
  const ctx2 = vm.createContext({ Date, Set, String, Object, Number, Math, Array, console, RegExp });
  ctx2.globalThis = ctx2; ctx2.currentYear = 2027;
  vm.runInContext(extraire('getMonthDays').replace('days.filter(date=>!horsAnneePlanning(date))', 'days'), ctx2);
  V('sans la borne, janvier en comptait 31 (l\'ancien comportement)',
    ctx2.getMonthDays(0).length === 31, ctx2.getMonthDays(0).length);

  /* Second rideau : meme atteint autrement, le clic est refuse et EXPLIQUE. */
  const ctx3 = vm.createContext({ Date, Set, String, Object, Number, Math, Array, console, RegExp });
  ctx3.globalThis = ctx3;
  ctx3.currentYear = 2027; ctx3.vacHS = false; ctx3.currentType = 'VAC';
  ctx3.saisies = {}; ctx3.locked = {}; ctx3.periodes = [];
  ctx3.__toasts = [];
  ctx3.showToast = m => ctx3.__toasts.push(m);
  ctx3.updateStatsBar = () => {}; ctx3.renderCurrent = () => {};
  ctx3.majBandeauVerrou = () => {}; ctx3.confirm = () => true; ctx3.formatDay = d => d;
  vm.runInContext(extraire('premierJourAnneePlanning'), ctx3);
  vm.runInContext(extraire('bornesAnneePlanning'), ctx3);
  vm.runInContext(extraire('horsAnneePlanning'), ctx3);
  vm.runInContext(extraire('isScolaire'), ctx3);
  vm.runInContext(extraire('toggleDay'), ctx3);
  ctx3.toggleDay('AA', '2027-03-15');
  V('une date DANS l\'année se pose normalement', ctx3.saisies.AA['2027-03-15'] === 'VAC', ctx3.saisies);
  ctx3.toggleDay('AA', '2028-01-02');
  V('le dernier jour de l\'année se pose encore', ctx3.saisies.AA['2028-01-02'] === 'VAC', ctx3.saisies);
  ctx3.toggleDay('AA', '2027-01-01');
  V('le 1er janvier 2027 est REFUSÉ', !ctx3.saisies.AA['2027-01-01'], ctx3.saisies);
  ctx3.toggleDay('AA', '2028-01-03');
  V('le lundi 03/01/2028, déjà l\'année suivante, est refusé aussi', !ctx3.saisies.AA['2028-01-03'], ctx3.saisies);
  V('rien d\'autre n\'a été écrit', Object.keys(ctx3.saisies.AA).length === 2, ctx3.saisies);
  V('le refus est expliqué au comité, jamais silencieux',
    /Hors de l'année de planning/.test(ctx3.__toasts.join(' ')), ctx3.__toasts);
}

/* ═══ QUOTAS DE CONGÉS — la table de staff.html contre le classeur ═══
   (03/09/2026) Constat en production : un temps plein voyait « 33j » au staff
   alors que CONFIG_CONGES dit 37, et que le serveur lit bien le classeur
   (_loadQuotasConges). La table de staff.html était l'ancienne, de 2026, et
   elle était fausse pour TOUTES les quotités en VAC.
   Les valeurs ci-dessous sont celles relevées dans CONFIG_CONGES le 03/09.
   Ce scénario ne prouve pas que le classeur n'a pas rebougé depuis — il fige
   ce qui a été constaté, pour qu'une régression se voie. */
console.log('\n═══ Quotas de congés : staff.html suit CONFIG_CONGES ═══');
{
  const ctx = vm.createContext({ Math, Object, Number, console });
  ctx.globalThis = ctx;
  /* Les deux déclarations sont `const` : évaluées dans deux scripts séparés
     elles resteraient invisibles l'une de l'autre et du banc. Un seul script,
     et on expose la fonction. */
  vm.runInContext(extraireConst('QUOTAS') + '\n' + extraireConst('getQuota')
                  + '\nglobalThis.gq = getQuota;', ctx);
  const attenduVac = { 100: 37, 90: 33, 80: 30, 60: 22, 50: 18 };
  const attenduForm = { 100: 10, 90: 9, 80: 8, 60: 6, 50: 5 };
  Object.keys(attenduVac).forEach(q =>
    V('VAC à ' + q + ' % : ' + attenduVac[q] + ' jours',
      ctx.gq('VAC', Number(q)) === attenduVac[q], ctx.gq('VAC', Number(q))));
  Object.keys(attenduForm).forEach(q =>
    V('FORM à ' + q + ' % : ' + attenduForm[q] + ' jours',
      ctx.gq('FORM', Number(q)) === attenduForm[q], ctx.gq('FORM', Number(q))));
  V('un temps plein n\'affiche plus l\'ancien 33', ctx.gq('VAC', 100) !== 33);
  V('une quotité décimale est arrondie au palier', ctx.gq('VAC', 89.6) === 33, ctx.gq('VAC', 89.6));
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
