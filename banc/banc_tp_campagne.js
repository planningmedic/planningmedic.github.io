/* ═══ BANC — LOT A : LE TEMPS PARTIEL SE POSE PENDANT LA CAMPAGNE ═══════════
   (01/09/2026) Décision du comité : un MAR à temps partiel pose ses jours EN
   MÊME TEMPS que ses indisponibilités et ses gardes souhaitées, sur le même
   écran, AVANT la génération. Le 23/08 la règle était l'inverse — les TP se
   posaient après, dans les trous — et le serveur JETAIT tout TP arrivé par le
   circuit de campagne. C'est ce refus qui est levé ici.

   Ce qui doit rester vrai malgré la réouverture :
     · le quota annuel (CONFIG_CONGES, colonne CTP) est vérifié par le SERVEUR,
       jamais seulement par l'écran ;
     · un profil sans temps partiel (temps plein, jours fixes déjà convenus,
       rythme deux semaines sur deux) ne peut rien poser, même en tapant
       l'adresse à la main ;
     · un TP ne se pose pas un samedi, un dimanche ou un férié : ce ne sont pas
       des jours travaillés, le poser n'enlèverait rien mais écarterait des
       gardes lourdes ;
     · les cases du comité (vacances, formation) restent intouchables ;
     · le reliquat reste posable plus tard, au fil de l'eau.

   Le vrai code du dépôt est éprouvé : la fonction de fusion et les gardes-fous
   de la page sont extraits de leurs fichiers, jamais recopiés. */
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 190) : '')); } };

const RACINE = path.join(__dirname, '..');
function extraireFonction(fichier, nom) {
  const src = fs.readFileSync(path.join(RACINE, fichier), 'utf8');
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error(nom + ' introuvable dans ' + fichier);
  let prof = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
  return src.slice(i, j + 1);
}

/* ═══ 1. Le serveur n'ignore plus les TP de la campagne ═════════════════ */
console.log('\n═══ 1. Indispos.gs · le refus systématique des TP a bien disparu ═══');
{
  const src = fs.readFileSync(path.join(RACINE, 'gas/Indispos.gs'), 'utf8');
  V('le rejet « TP ignorés » du 23/08 n\'est plus dans le code',
    !src.includes('TP ignorés'));
  V('le circuit de campagne calcule désormais le quota de temps partiel',
    src.includes('const quotaTpC = getQuotasConges(_quotiteDe_(targetId)).ctp'));
  V('un profil sans temps partiel est écarté côté serveur',
    src.includes('const sansTpProfil = _tpFixeDe_(targetId) || quotaTpC <= 0'));
  V('les refus sont tracés dans LOGS, jamais silencieux',
    /TP refusés/.test(src));
  V('la fusion reçoit bien les TP (et non une copie expurgée)',
    src.includes('_fusionIndispos_(existantC, envoyeC,'));
}

/* ═══ 2. La fusion : le TP appartient au MAR, pas au comité ═════════════ */
console.log('\n═══ 2. Indispos.gs · _fusionIndispos_ range le TP du bon côté ═══');
{
  const ctx = vm.createContext({ Set, String, Object, console });
  ctx.globalThis = ctx;
  vm.runInContext('const CODES_COMITE = new Set([\'VAC\', \'FORM\']);', ctx);
  vm.runInContext(extraireFonction('gas/Indispos.gs', '_fusionIndispos_'), ctx);
  const f = ctx._fusionIndispos_;

  V('un MAR peut poser un TP sur une case vide',
    f({}, { '2027-03-10': 'TP' }, false)['2027-03-10'] === 'TP');
  V('un MAR ne peut PAS écraser une vacance posée par le comité',
    f({ '2027-03-10': 'VAC' }, { '2027-03-10': 'TP' }, false)['2027-03-10'] === 'VAC');
  V('poser un TP n\'efface pas les vacances des autres jours',
    f({ '2027-03-11': 'VAC' }, { '2027-03-10': 'TP' }, false)['2027-03-11'] === 'VAC');
  V('un TP retiré par le MAR disparaît (une date absente de l\'envoi = retrait)',
    f({ '2027-03-10': 'TP' }, {}, false)['2027-03-10'] === undefined);
  V('le comité qui valide ses vacances n\'efface pas les TP des MAR',
    f({ '2027-03-10': 'TP' }, { '2027-03-12': 'VAC' }, true)['2027-03-10'] === 'TP');
  V('TP et indisponibilité sont exclusifs : une case ne porte qu\'un code',
    f({ '2027-03-10': 'INDISPO' }, { '2027-03-10': 'TP' }, false)['2027-03-10'] === 'TP');
}

/* ═══ 3. L'écran : le bouton n'apparaît que s'il y a des jours à poser ══ */
console.log('\n═══ 3. indispos.html · le bouton suit le quota ═══');
{
  const page = fs.readFileSync(path.join(RACINE, 'indispos.html'), 'utf8');
  V('le bouton « Temps partiel » existe dans la légende de la campagne',
    page.includes('id="btnOutilTp"') && page.includes("selectTool('TP')"));
  V('il est masqué par défaut (affiché seulement si quota > 0)',
    /id="btnOutilTp"[^>]*style="display:none"/.test(page));
  V('son affichage dépend du quota de temps partiel du MAR',
    page.includes("_btnTp.style.display = (res.quotaCtp > 0)"));
  V('le compteur de la barre de stats suit le même quota',
    page.includes('const showCtp = vacConfig && vacConfig.quotaCtp > 0'));
  V('« Temps partiel » a un libellé d\'outil',
    /STATUS_LABELS[\s\S]{0,220}TP:'Temps partiel'/.test(page));
}

/* ═══ 4. L'écran : les gardes-fous de pose tiennent toujours ════════════ */
console.log('\n═══ 4. indispos.html · applyTool refuse ce qui doit l\'être ═══');
{
  function poser(dateStr, dejaPoses, quota, feries) {
    const ctx = vm.createContext({
      Date, String, Object, Number, Math, console, setTimeout: () => {},
      window: {}, isDragging: false, messages: [],
      indispos: Object.assign({}, dejaPoses || {}),
      currentTool: 'TP',
      joursFeries: new Set(feries || []),
      vacConfig: { quotaCtp: quota },
      showToast: function (m) { ctx.messages.push(m); },
      renderMonth: () => {}, renderCalendar: () => {}, updateStats: () => {},
      marquerModifie: () => {}, sauvegarder: () => {}, planifierSauvegarde: () => {}, maj: () => {},
    });
    ctx.globalThis = ctx; ctx.YEAR = 2027;
    vm.runInContext(extraireFonction('indispos.html', 'premierJourAnneePlanning'), ctx);
    vm.runInContext(extraireFonction('indispos.html', 'bornesAnneePlanning'), ctx);
    /* La page n'est pas montée ici : un document minimal suffit pour que la zone
   d'aide existe sans rien afficher. */
  ctx.document = ctx.document || { getElementById: () => null };
  /* (06/09/2026) applyTool écrit désormais ses refus dans la zone d'aide sous le
   calendrier — un toast disparaissait avant qu'on ait fini le geste. On charge
   la dépendance plutôt que d'ajouter un garde-fou dans la page pour le banc. */
  /* (06/09/2026) applyTool met aussi à jour le bouton d'enregistrement : il
     redevenait « Sauvegarder » alors que tout était enregistré. */
  vm.runInContext('function majBoutonSave(){}', ctx);
  vm.runInContext(extraireFonction('indispos.html', 'hintRefus'), ctx);
  vm.runInContext(extraireFonction('indispos.html', 'applyTool'), ctx);
    ctx.applyTool(dateStr);
    return { pose: ctx.indispos[dateStr] === 'TP', messages: ctx.messages };
  }

  V('un mercredi ordinaire accepte un jour de temps partiel',
    poser('2027-03-10', {}, 26, []).pose);
  V('un samedi le refuse', !poser('2027-03-13', {}, 26, []).pose);
  V('un dimanche le refuse', !poser('2027-03-14', {}, 26, []).pose);
  V('un jour férié le refuse', !poser('2027-05-06', {}, 26, ['2027-05-06']).pose);
  const plein = {}; for (let i = 1; i <= 26; i++) plein['2027-02-' + String(i).padStart(2, '0')] = 'TP';
  const r = poser('2027-03-10', plein, 26, []);
  V('le quota atteint bloque la pose du 27e jour', !r.pose);
  V('et le dit clairement au MAR', /[Qq]uota/.test(r.messages.join(' ')), r.messages);
  V('sous le quota, la pose passe',
    poser('2027-03-10', { '2027-02-01': 'TP' }, 26, []).pose);
}

/* ═══ 5. Le reliquat : cohérence entre les deux onglets ═════════════════ */
console.log('\n═══ 5. Indispos.gs · retirer un TP le retire des DEUX onglets ═══');
{
  const src = fs.readFileSync(path.join(RACINE, 'gas/Indispos.gs'), 'utf8');
  V('un helper retire la case TP dans INDISPOS',
    src.includes('function _tpRetirerDIndispos_(annee, marId, ds)'));
  V('il est appelé au moment où le TP quitte le planning',
    /_tpGrilleEcrire_\(annee, targetId, ds, ''\)[\s\S]{0,600}_tpRetirerDIndispos_\(annee, targetId, ds\)/.test(src));
  V('il ne touche QUE les cases portant TP (une vacance posée depuis reste intacte)',
    src.includes("!== 'TP') return false"));
  V('une erreur de retrait ne fait pas échouer la pose (try/catch + trace)',
    /_tpRetirerDIndispos_[\s\S]{0,900}catch \(e\) \{ logAction\('_tpRetirerDIndispos_/.test(src));
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);

/* ═══ (06/09/2026) REFONTE VISUELLE DE LA CAMPAGNE ══════════════════════
   La page servait telle quelle au 10 octobre. Trois inconforts mesurables :
   la barre d'outils était EN HAUT (il fallait remonter à chaque changement),
   la couleur d'un jour tenait dans une petite pastille au milieu d'une case
   blanche, et un refus s'affichait en toast — disparu avant la fin du geste.
   Rien de la logique ne change : chargement, sauvegarde, glisser-déposer et
   règles de refus sont intacts. Ces vérifications tiennent l'apparence. */
{
  const fs2 = require('fs');
  const page = fs2.readFileSync(__dirname + '/../indispos.html', 'utf8');
  const V2 = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); }
    else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };
  console.log('\n═══ 5. indispos.html · la refonte visuelle ═══');
  const iOutils = page.indexOf('<div class="legend" id="legend">');
  const iCal    = page.indexOf('<div class="calendar-grid" id="calGrid">');
  V2('la barre d\'outils est SOUS le calendrier', iOutils > iCal, { outils: iOutils, calendrier: iCal });
  V2('…et elle est collante', /\.legend \{[\s\S]{0,120}position:sticky/.test(page));
  V2('les quatre outils sont là, avec leurs identifiants d\'origine',
    /data-tool="INDISPO"/.test(page) && /data-tool="SOUHAIT"/.test(page)
    && /id="btnOutilTp"/.test(page) && /data-tool="ERASE"/.test(page));
  /* (06/09/2026) Trois retours d'usage sur la capture du 06/09 : la gomme réduite
     à une icône n'était reconnue par personne, les compteurs débordaient en trois
     plus un de largeurs inégales, et la réserve de 100 px sous le calendrier —
     héritée du temps où les outils étaient en haut — creusait un trou. */
  V2('la gomme porte une icône ET son mot, comme les trois autres outils',
    /data-tool="ERASE"[^>]*aria-label="Effacer">🧽 Effacer</.test(page));
  /* (06/09/2026) La formation a un quota, comme les vacances et le temps partiel.
     Il n'était pas affiché : on lisait « 6 jours » sans savoir s'il en restait. */
  /* (06/09/2026) Les compteurs : cinq pastilles à emoji, de largeurs inégales,
     débordant sur deux lignes bancales. Ce qui a un PLAFOND porte une jauge — on
     voit ce qu'il reste à poser, ce qu'aucun chiffre seul ne disait. */
  V2('congés, formation et temps partiel portent une jauge',
    /const jauge = \(nom, fait, quota, coul, unite\)/.test(page)
    && /jauge\('Congés'/.test(page) && /jauge\('Formation'/.test(page) && /jauge\('Temps partiel'/.test(page));
  V2('…et la jauge passe en rouge au-delà du plafond',
    /const trop = quota && fait > quota;/.test(page) && /trop \? '#B91C1C' : coul/.test(page));
  V2('indispos et souhaits restent de simples comptes, sur une ligne à part',
    /const compte = \(nom, n, coul\)/.test(page) && /class="compte-ligne"/.test(page));
  V2('le temps partiel a sa ligne, et seulement s\'il a un quota',
    /\$\{showCtp \? `<div class="jauge-ligne jauge-seule">/.test(page));
  V2('plus aucun emoji dans les compteurs',
    !/🏖️/.test(page) && !/📚/.test(page));
  V2('le compteur de formation affiche son quota',
    /const quotaForm = vacConfig && Number\(vacConfig\.quotaForm\) \|\| 0;/.test(page)
    && /jauge\('Formation', counts\.FORM, quotaForm/.test(page));

  V2('la ligne de jauges est en deux colonnes égales',
    /\.jauge-ligne \{ display:grid; grid-template-columns:1fr 1fr;/.test(page));
  V2('la case du calendrier est carrée', /\.cal-day \{[\s\S]{0,260}aspect-ratio:1/.test(page));
  V2('la réserve du bas est passée sur l\'écran, plus sous le calendrier',
    /\.calendar-container \{[\s\S]{0,60}padding:12px 16px 0;/.test(page)
    && /\.app \{ display:none; padding-bottom:76px; \}/.test(page));
  V2('la couleur remplit la case, elle ne tient plus dans une pastille',
    /\.cal-day\.indispo \{ background:var\(--indispo-fg\)/.test(page)
    && /const badge = '';/.test(page));
  V2('les jours posés au staff portent un cadenas',
    /class="cal-lock"/.test(page) && /status === 'VAC' \|\| status === 'FORM'/.test(page));
  V2('l\'outil temps partiel estompe les jours non travaillés AVANT le geste',
    /cls \+= ' hors-portee'/.test(page) && /\.cal-day\.hors-portee \{ opacity/.test(page));
  V2('changer d\'outil redessine le calendrier', /if \(document\.getElementById\('calGrid'\)\) renderMonth\(\);/.test(page));
  V2('les refus s\'écrivent dans la zone d\'aide, pas seulement en toast',
    (page.match(/hintRefus\(/g) || []).length >= 6);
  V2('le glisser-déposer est intact',
    /ontouchmove="handleDragMove\(event\)"/.test(page) && /onmouseover="handleMouseOver/.test(page));
  V2('la sauvegarde n\'a pas bougé', /onclick="saveIndispos\(\)"/.test(page));
  const vjs = fs2.readFileSync(__dirname + '/../version.js', 'utf8');
  /* (06/09/2026) Trois retours de l'essai grandeur nature du 6 septembre : le
     bouton réclamait une sauvegarde déjà faite, les compteurs annonçaient un
     « 0/0 » faux le temps que le quota arrive du serveur, et rien ne rassurait
     si Apps Script traînait — un MAR qui ferme l'onglet perd sa saisie. */
  V2('le bouton dit quand tout est enregistré',
    /function majBoutonSave\(\)/.test(page)
    && /btn\.textContent = hasChanges \? '💾 Sauvegarder' : '✓ Tout est enregistré';/.test(page)
    && /class="save-btn save-btn-ok" id="saveBtn"[^>]*disabled/.test(page));
  V2('…et il se réveille dès qu\'un jour est touché',
    (page.match(/majBoutonSave\(\);/g) || []).length >= 3);
  V2('le calendrier se fige pendant l\'écriture',
    /body\.save-en-cours \.calendar-grid,/.test(page)
    && /classList\.add\('save-en-cours'\)/.test(page));
  V2('un tiret plutôt qu\'un « 0/0 » faux tant que le quota n\'est pas connu',
    /const quotaConnu = !!vacConfig;/.test(page)
    && /!quotaConnu \? '— jours ouvrés'/.test(page) && /!quotaConnu \? '— jours'/.test(page));
  V2('une attente longue est annoncée au lieu de laisser croire à un plantage',
    /ne fermez pas la page/.test(page) && /\}, 5000\);/.test(page));
  /* (06/09/2026) Le numéro EXACT était figé ici. Depuis le retour à v1.0, un
     numéro ne date plus une fonctionnalité : ce contrôle tombait à chaque
     montée de version, pour un motif de forme. Deux contrôles avaient déjà été
     repris le 05/09 (banc_cloche, banc_stats_ecran) ; celui-ci avait été
     oublié. On vérifie la FORME du numéro et la source unique, pas sa valeur. */
  V2('la version du site vient de la source unique et a la bonne forme',
    /window\.SITE_VERSION = 'v\d+\.\d+(\.\d+)?'/.test(vjs));
}
console.log('\n' + ok + ' OK · ' + ko + ' en échec');
