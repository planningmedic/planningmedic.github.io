/* ═══ BANC — TEMPS PARTIEL : POSE ET ÉQUITÉ (v1.31) ═══
   Deux garde-fous, éprouvés sur le VRAI code des pages :
   1. indispos.html — un jour de TP ne se pose que sur un jour ouvré ;
   2. admin.html   — le récap du W2 bloque la génération quand la pose des TP
      d'un MAR le retire d'un axe entier du planning (samedi, VD, jeudi).
   Mesuré sur le générateur : 26 TP sur un même jour ne coûtent rien aux autres,
   52 sur un même jour leur coûtent environ 5 gardes de cet axe. */
const fs = require('fs'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,190) : '')); } };

/* Extraction d'une fonction depuis une page HTML (même principe qu'extraireFonction
   pour les .gs : on éprouve le code du dépôt, jamais une copie). */
function extraireDuHtml(fichier, nom) {
  const src = fs.readFileSync(fichier, 'utf8');
  const i = src.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error(nom + ' introuvable dans ' + fichier);
  let prof = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') prof++; else if (src[j] === '}') { prof--; if (!prof) break; } }
  return src.slice(i, j + 1);
}

// ── 1. La pose : jour ouvré seulement ────────────────────────────────
console.log('\n═══ 1. indispos.html · un jour de TP ne se pose que sur un jour ouvré ═══');
{
  const ctx = vm.createContext({ Date, String, Object, Number, Math, console, setTimeout: () => {},
    window: {}, indispos: {}, currentTool: 'TP', isDragging: false,
    joursFeries: new Set(['2027-05-06']),     // Ascension : un jeudi férié
    vacConfig: { quotaCtp: 26 }, messages: [],
    showToast: function (m) { ctx.messages.push(m); },
    renderMonth: () => {}, renderCalendar: () => {}, updateStats: () => {},
    marquerModifie: () => {}, sauvegarder: () => {}, planifierSauvegarde: () => {}, maj: () => {},
  });
  ctx.globalThis = ctx;
  ctx.YEAR = 2027;
  /* applyTool refuse desormais les dates hors annee de planning : ses deux fonctions
     de bornes doivent etre presentes, elles aussi extraites de la page (jamais recopiees). */
  vm.runInContext(extraireDuHtml('../indispos.html', 'premierJourAnneePlanning'), ctx);
  vm.runInContext(extraireDuHtml('../indispos.html', 'bornesAnneePlanning'), ctx);
  /* La page n'est pas montée ici : un document minimal suffit pour que la zone
   d'aide existe sans rien afficher. */
  ctx.document = ctx.document || { getElementById: () => null };
  /* (06/09/2026) applyTool écrit désormais ses refus dans la zone d'aide sous le
   calendrier — un toast disparaissait avant qu'on ait fini le geste. On charge
   la dépendance plutôt que d'ajouter un garde-fou dans la page pour le banc. */
  /* (06/09/2026) applyTool met aussi à jour le bouton d'enregistrement : il
     redevenait « Sauvegarder » alors que tout était enregistré. */
  vm.runInContext('function majBoutonSave(){}', ctx);
  vm.runInContext(extraireDuHtml('../indispos.html', 'hintRefus'), ctx);
  vm.runInContext(extraireDuHtml('../indispos.html', 'applyTool'), ctx);

  const pose = d => { vm.runInContext(`applyTool('${d}')`, ctx); return ctx.indispos[d]; };
  V('un jeudi ordinaire accepte le TP',        pose('2027-05-13') === 'TP', ctx.indispos);
  V('un samedi le refuse',                     pose('2027-05-15') === undefined, ctx.indispos['2027-05-15']);
  V('un dimanche le refuse',                   pose('2027-05-16') === undefined, ctx.indispos['2027-05-16']);
  V('un jour férié le refuse',                 pose('2027-05-06') === undefined, ctx.indispos['2027-05-06']);
  V('le refus est expliqué au MAR',            ctx.messages.some(m => /jour travaillé/i.test(m)), ctx.messages);
  V('un seul jour posé au total',              Object.keys(ctx.indispos).length === 1, ctx.indispos);
}

// ── 2. Le récap du W2 : blocage sur pose déséquilibrante ─────────────
console.log('\n═══ 2. admin.html · le récap du W2 mesure le report sur les autres ═══');
{
  const ctx = vm.createContext({ Date, String, Object, Number, Math, Array, Set, console });
  ctx.globalThis = ctx;
  vm.runInContext(extraireDuHtml('../admin.html', 'tpDesequilibres'), ctx);
  const feries = new Set(['2027-05-06']);
  // 22 MAR de garde, comme le service : la cible d'un axe vaut ~5 jours par MAR
  const actifs = [];
  for (let i = 1; i <= 22; i++) actifs.push({ id: 'MAR' + i, initiales: 'M' + i, pctGardes: 100, noGarde: false, noWeekend: false });
  const jours = (annee, dow) => {   // sans les fériés : un TP n'y est pas posable
    const out = []; const d = new Date(annee, 0, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    const f = new Date(annee + 1, 0, 1); while (f.getDay() !== 1) f.setDate(f.getDate() + 1);
    for (; d < f; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== dow) continue;
      const ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      if (!feries.has(ds)) out.push(ds);
    }
    return out;
  };
  const pose = (liste, n) => { const o = {}; liste.slice(0, n).forEach(d => { o[d] = 'TP'; }); return o; };
  const appel = ind => vm.runInContext('tpDesequilibres', ctx)(actifs, ind, feries, 2027);

  V('aucune case posée : rien à signaler', appel({}).length === 0);

  // ── la place restante, et non la part bloquée ──
  V('26 jeudis bloqués sur 51, le reste libre : il a la place, aucune alerte',
    appel({ MAR1: pose(jours(2027,4), 26) }).length === 0, appel({ MAR1: pose(jours(2027,4), 26) }));
  {
    const a = appel({ MAR1: pose(jours(2027,4), 51) });   // tous les jeudis ouvrés
    V('plus aucun jeudi libre : alerte levée', a.length === 1, a);
    V('l\'axe est nommé', /jeudi/.test((a[0]||{}).texte||''), a[0]);
    V('le report est chiffré en gardes', /garde/.test((a[0]||{}).detail||''), a[0]);
  }
  // ── (v1.31.1) les congés comptent autant que les TP dans la place restante ──
  {
    const jeudis = jours(2027,4);
    const ind = {}; jeudis.slice(0, 44).forEach(d => { ind[d] = 'TP'; });
    V('44 TP le jeudi, 7 jeudis encore libres : pas d\'alerte',
      appel({ MAR1: ind }).length === 0, appel({ MAR1: ind }));
    jeudis.slice(44).forEach(d => { ind[d] = 'VAC'; });   // les 7 restants sont ses vacances
    const a = appel({ MAR1: ind });
    V('mêmes TP, mais les 7 jeudis restants sont des vacances : alerte levée', a.length === 1, a);
    V('le message dit qu\'il ne reste aucun jeudi libre', /reste que 0 jeudi/.test((a[0]||{}).texte||''), a[0]);
  }
  {
    const jeudis = jours(2027,4); const ind = {};
    jeudis.forEach(d => { ind[d] = 'VAC'; });             // aucun TP : que des congés
    const a = appel({ MAR1: ind });
    V('congés seuls concentrés sur un axe : vu aussi', a.length === 1, a);
    V('le message ne parle pas de TP dans ce cas', /congés occupent/.test((a[0]||{}).texte||''), a[0]);
  }
  {
    const jeudis = jours(2027,4); const ind = {};
    jeudis.forEach(d => { ind[d] = 'SOUHAIT'; });         // un souhait n'est pas une absence
    V('des gardes souhaitées ne bloquent rien', appel({ MAR1: ind }).length === 0, appel({ MAR1: ind }));
  }
  {
    const a = appel({ MAR1: pose(jours(2027,5), 52) });   // tous les vendredis ouvrés
    V('plus aucun vendredi libre : l\'axe VD est signalé', a.some(x => /vendredi-dimanche/.test(x.texte)), a);
  }
  {
    const a = appel({ MAR1: pose(jours(2027,6), 3) });    // 3 samedis
    V('3 TP posés un samedi : alerte grave, sans seuil', a.some(x => x.grave), a);
    V('le motif est le jour non travaillé', /jour travaillé/.test((a.find(x=>x.grave)||{}).texte||''), a);
  }
  {
    const a = appel({ MAR1: { '2027-05-06': 'TP' } });    // Ascension
    V('un TP posé un férié est signalé', a.some(x => x.grave), a);
  }
  {
    const sansWe = actifs.map((m,i) => i === 0 ? Object.assign({}, m, { noWeekend: true }) : m);
    const f = vm.runInContext('tpDesequilibres', ctx)(sansWe, { MAR1: pose(jours(2027,5), 52) }, feries, 2027);
    V('un MAR déjà hors week-end n\'est pas accusé de fuir le VD', !f.some(x => /vendredi-dimanche/.test(x.texte)), f);
  }
  {
    const horsGarde = actifs.map((m,i) => i === 0 ? Object.assign({}, m, { noGarde: true }) : m);
    const f = vm.runInContext('tpDesequilibres', ctx)(horsGarde, { MAR1: pose(jours(2027,4), 51) }, feries, 2027);
    V('un MAR hors gardes n\'est pas concerné', f.length === 0, f);
  }
}

// ── 3. Le W2 n'exige plus de saisie d'un MAR hors année planning (v1.31.2) ──
console.log('\n═══ 3. admin.html · marsDansAnnee : un MAR parti n\'a rien à saisir ═══');
{
  const ctx = vm.createContext({ Date, String, Object, Number, Math, Array, console });
  ctx.globalThis = ctx;
  vm.runInContext(extraireDuHtml('../admin.html', 'marsDansAnnee'), ctx);
  const f = (mars, annee) => vm.runInContext('marsDansAnnee', ctx)(mars, annee);
  const base = { actif: true, initiales: 'XX' };
  /* Cas réel : TRAN, date_fin 01/09/2026, campagne 2027 (année planning
     04/01/2027 → 02/01/2028). Le générateur l'exclut (C2-D2) — le W2 doit
     faire pareil au lieu de réclamer une indispo fictive. */
  V('un MAR parti avant l\'année est exclu',
    f([Object.assign({}, base, { dateFin: '2026-09-01' })], 2027).length === 0);
  V('un MAR arrivant après l\'année est exclu',
    f([Object.assign({}, base, { dateDebut: '2028-02-01' })], 2027).length === 0);
  V('un MAR partant EN COURS d\'année reste inclus',
    f([Object.assign({}, base, { dateFin: '2027-06-30' })], 2027).length === 1);
  V('un MAR arrivant en cours d\'année reste inclus',
    f([Object.assign({}, base, { dateDebut: '2027-03-01' })], 2027).length === 1);
  V('un MAR sans dates reste inclus',
    f([Object.assign({}, base)], 2027).length === 1);
  V('un MAR inactif reste exclu',
    f([{ actif: false, initiales: 'YY' }], 2027).length === 0);
  /* Frontières exactes, miroir de _horsAnnee (df < début → exclu ; df = début → gardé) */
  V('date_fin = 1er lundi (04/01/2027) → GARDÉ (frontière du générateur)',
    f([Object.assign({}, base, { dateFin: '2027-01-04' })], 2027).length === 1);
  V('date_fin = veille du 1er lundi (03/01/2027) → exclu',
    f([Object.assign({}, base, { dateFin: '2027-01-03' })], 2027).length === 0);
  V('date_debut = dernier jour (02/01/2028) → GARDÉ',
    f([Object.assign({}, base, { dateDebut: '2028-01-02' })], 2027).length === 1);
  V('date_debut = lendemain (03/01/2028) → exclu',
    f([Object.assign({}, base, { dateDebut: '2028-01-03' })], 2027).length === 0);
}

console.log(`\n${ok} OK · ${ko} en échec`);
if (ko) process.exit(1);
