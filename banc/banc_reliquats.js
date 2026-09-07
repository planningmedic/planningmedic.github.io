/* ═══ BANC — CE QU'IL RESTE À POSER (reliquats de congés, 01/09/2026) ═══════

   Après la génération, le comité place les congés que les MAR n'ont pas posés
   pendant la campagne. Le chiffre existait au staff, mais seulement pour les
   vacances et seulement avant la génération.

   ⚠️ LA SOURCE CHANGE AVEC L'ÉTAT DE L'ANNÉE, et c'est tout l'enjeu :
     · année non générée → INDISPOS_{Y}, codes VAC / FORM / TP ;
     · année générée     → GARDES_{Y}, codes V / F / TP.
   L'onglet Statuts écrit dans GARDES et JAMAIS dans INDISPOS (vérifié dans
   appliquerStatutJour) : compter dans INDISPOS après la génération raterait
   tout ce que le comité a posé depuis. C'est le défaut que ce scénario
   empêche de revenir. */
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };
const RACINE = path.join(__dirname, '..');
const IND = fs.readFileSync(path.join(RACINE, 'gas/Indispos.gs'), 'utf8');
const ADM = fs.readFileSync(path.join(RACINE, 'admin.html'), 'utf8');

/* ═══ 1. La source suit l'état de l'année ═══════════════════════════════ */
console.log('\n═══ 1. Indispos.gs · GARDES fait foi dès que l\'année est générée ═══');
{
  V('la présence de GARDES_{Y} décide de la source',
    /const genere = !!gardes;/.test(IND));
  V('année générée → GARDES, sinon INDISPOS',
    /const source = genere \? gardes : ss\.getSheetByName\('INDISPOS_' \+ year\);/.test(IND));
  /* Deux jeux de codes pour la même chose : les mélanger compterait un congé
     deux fois, ou pas du tout. */
  V('les codes suivent la source, sans mélange',
    /const CODES = genere \? \{ V: 'vac', F: 'form', TP: 'tp' \}[\s\S]{0,90}\{ VAC: 'vac', FORM: 'form', TP: 'tp' \}/.test(IND));
  V('la réponse dit dans quel onglet elle a compté',
    /source: genere \? 'GARDES_' \+ year : 'INDISPOS_' \+ year/.test(IND));
  V('…et si l\'année est générée', /genere: genere/.test(IND));
  V('ni l\'un ni l\'autre → une erreur claire, pas un tableau de zéros',
    /Ni GARDES_' \+ year \+ ' ni INDISPOS_/.test(IND));
  /* Contre-preuve de lecture : l'onglet Statuts n'écrit VRAIMENT que dans
     GARDES. Si cela changeait un jour, compter dans GARDES ne suffirait plus. */
  const bloc = IND.slice(IND.indexOf('function appliquerStatutJour'),
                         IND.indexOf('function appliquerStatutJour') + 2600);
  V('appliquerStatutJour écrit bien dans GARDES', /getSheetByName\(`GARDES_\$\{year\}`\)/.test(bloc));
  V('…et ne touche pas INDISPOS', !/getSheetByName\(`INDISPOS_/.test(bloc));
}

/* ═══ 2. Le compte lui-même ═════════════════════════════════════════════ */
console.log('\n═══ 2. Un jour de congé se compte en jours TRAVAILLÉS ═══');
{
  /* Même règle que le quota de vacances côté serveur, et que l'écran du staff
     depuis le correctif du 01/09 : ni week-end, ni férié. */
  V('les week-ends et les fériés sont retirés du compte',
    /d !== 0 && d !== 6 && !jf\.has\(ds\) && !jf2\.has\(ds\)/.test(IND));
  V('les fériés de l\'année SUIVANTE comptent aussi (l\'année de planning déborde)',
    /getJoursFeries\(year \+ 1\)/.test(IND));
  V('le reste est quota moins posé', /reste: q\.vac  - p\.vac/.test(IND));
  /* Les demandes non tranchées occupent une place : sans elles, un MAR
     pourrait demander plus que son quota. */
  V('les temps partiels en attente sont comptés à part',
    /attente: att,/.test(IND) && /_tpDemandes_\(year\)\.forEach/.test(IND));
  V('…et retirés du reste des temps partiels',
    /reste: Math\.max\(0, tpQuota - p\.tp - att\)/.test(IND));
  /* Un temps plein, un rythme 2/2 ou des jours fixes convenus n'ont pas de
     temps partiel à poser : leur afficher un quota inventerait des jours. */
  V('un profil sans temps partiel affiche un quota nul, pas un faux compteur',
    /const tpQuota = \(FLAGS\.rythme2sur2\.has\(id\) \|\| FLAGS\.tpJoursFixes\[id\]\) \? 0 : q\.ctp;/.test(IND));
  /* Le filtre et le push sont séparés par le calcul des quotas : on cherche
     les deux dans le corps de computeReliquats, pas dans une fenêtre fixe. */
  const corps = IND.slice(IND.indexOf('function computeReliquats'),
                          IND.indexOf('function computeReliquats') + 4200);
  V('seuls les MAR actifs sont listés',
    /String\(med\[r\]\[3\]\)\.trim\(\)\.toUpperCase\(\) !== 'O'/.test(corps)
    && /lignes\.push/.test(corps));
  V('les MAR qui ont le plus à poser viennent en tête',
    /lignes\.sort\(\(a, b\) => \(b\.vac\.reste \+ b\.form\.reste \+ b\.tp\.reste\)/.test(IND));
}

/* ═══ 3. L'action est réservée au comité ════════════════════════════════ */
console.log('\n═══ 3. Indispos.gs · l\'action getReliquats ═══');
{
  V('l\'action existe', /if \(action === 'getReliquats'\)/.test(IND));
  V('elle est réservée au rôle admin',
    /if \(action === 'getReliquats'\) \{[\s\S]{0,140}user\.role !== 'admin'[\s\S]{0,40}_deny\(\)/.test(IND));
  V('elle vise une année explicite, avec repli sur l\'année active',
    /Number\(payload\.year\) \|\| getActiveYear\(\)/.test(IND));
  V('c\'est une LECTURE : pas de verrou d\'écriture à prendre',
    !/'getReliquats'/.test(IND.slice(IND.indexOf('ACTIONS D\'ÉCRITURE SÉRIALISÉES'),
                                     IND.indexOf('ACTIONS D\'ÉCRITURE SÉRIALISÉES') + 1800)));
}

/* ═══ 4. L'écran du comité ══════════════════════════════════════════════ */
console.log('\n═══ 4. admin.html · le panneau de l\'onglet Statuts ═══');
{
  V('le bloc existe dans l\'onglet Statuts',
    /id="reliquatsBloc"/.test(ADM) && /id="reliquatsPanel"/.test(ADM));
  V('chaque ancre est unique',
    (ADM.match(/id="reliquatsBloc"/g) || []).length === 1
    && (ADM.match(/id="reliquatsPanel"/g) || []).length === 1
    && (ADM.match(/id="btnReliquats"/g) || []).length === 1);
  V('il est replié au départ', /id="reliquatsPanel" style="display:none/.test(ADM));
  /* Le chargement se fait au dépliage : c'est une consultation, elle ne doit
     pas ralentir l'ouverture de l'écran de saisie. */
  V('le contenu n\'est chargé qu\'au premier dépliage',
    /function toggleReliquats\(\)[\s\S]{0,320}if \(!ouvert\) renderReliquats\(\);/.test(ADM));
  V('le bloc apparaît avec l\'onglet Statuts',
    /_rb\.style\.display='block'/.test(ADM));
  /* Un compteur périmé sur un écran de saisie vaut moins que pas de compteur. */
  /* La fenêtre doit rester assez large : un commentaire inséré entre les deux
     lignes a fait échouer la première version de ce test sur du code correct. */
  V('le cache est vidé à chaque chargement de l\'onglet (l\'année a pu changer)',
    /if\(_rb\) _rb\.style\.display='block';[\s\S]{0,700}_reliquatsData=null;/.test(ADM));
  V('poser ou retirer un statut invalide le compte',
    /setDailyStatus[\s\S]{0,420}_reliquatsData = null;/.test(ADM));
  V('…et rafraîchit le panneau s\'il est ouvert',
    /_reliquatsData = null;[\s\S]{0,200}if\(_rp && _rp\.style\.display!=='none'\) renderReliquats\(\);/.test(ADM));
  V('une panne de chargement le dit au lieu d\'afficher un tableau vide',
    /Reliquats indisponibles/.test(ADM));
  V('un quota nul affiche un tiret, jamais « 0 / 0 »',
    /return '<td style="text-align:center;padding:6px 8px;color:#CBD5E1">—<\/td>'/.test(ADM));
  /* (01/09/2026) L'écran affiche POSÉ sur QUOTA — « 37/37 » se lit d'un coup,
     là où un reste demandait de savoir ce que le premier chiffre voulait dire. */
  V('chaque case donne les jours posés sur le quota',
    /o\.pose \+ '\/' \+ o\.quota/.test(ADM));
  V('vert quand le compte y est, rouge quand il manque des jours',
    /const complet = o\.reste <= 0;/.test(ADM) && /complet \? '#166534' : '#B91C1C'/.test(ADM));
  V('le nombre de jours restants reste visible sous la case',
    /o\.reste \+ ' à poser<\/div>'/.test(ADM));
  V('le serveur rend bien le nombre posé, pas seulement le reste',
    /vac:  \{ pose: p\.vac,  quota: q\.vac,  reste: q\.vac  - p\.vac \}/.test(IND));
  /* L'onglet Statuts suit l'année choisie en haut d'écran, qui n'est pas
     forcément celle qu'on a en tête : un reliquat de 2026 lu comme un
     reliquat de 2027 fait croire à une campagne mal remplie. Constaté le
     01/09 — le chiffre était juste, la lecture non. */
  V('le libellé du bouton porte l\'année regardée',
    /_bt\.textContent='📋 Ce qu\\'il reste à poser · '\+ADMIN_YEAR/.test(ADM));
  V('…et il est remis à jour à chaque chargement de l\'onglet',
    /_rb\.style\.display='block';[\s\S]{0,420}btnReliquats/.test(ADM));
  V('les MAR sans reliquat sont estompés, pas cachés',
    /const zero = x\.vac\.reste <= 0 && x\.form\.reste <= 0 && x\.tp\.reste <= 0;/.test(ADM));
  V('l\'écran rappelle qu\'une garde ne se remplace pas par un congé',
    /ces jours-là passent par un échange/.test(ADM));
  V('il dit où se posent les temps partiels (la tuile du MAR, pas cet écran)',
    /les temps partiels par les MAR depuis leur tuile/.test(ADM));
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
