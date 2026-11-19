/* ═══ BANC — DÉPÔT SANS COURSE DES ÉCHANGES (15/11/2026) ═══
   Décision du responsable : à l'ouverture, le premier connecté trouvait tous
   les preneurs, les suivants plus personne. Désormais, une seconde heure
   (ECHANGES_REPONSES) : avant elle, on propose, on refuse, on annule, on
   n'accepte pas ; à l'heure dite, toutes les demandes déposées arrivent en
   même temps ; les 48 h et le rappel comptent depuis elle.
   Trois maillons, le VRAI code de chacun :
   1. echanges.gs — l'heure posée / refusée / effacée, l'acceptation refusée
      avant l'heure (refuser reste permis), le délai compté depuis l'heure,
      une notification à chacun à la fin du dépôt, une seule fois ;
   2. le Worker — l'heure voyage avec la réponse ;
   3. l'accueil et « Mes échanges » (index.html réel, servi par le vrai
      Worker) — tuile ambre « Réponses dans », Accepter grisé, deux blocs triés
      par DATE DE GARDE, bloc replié « Déjà traitées », bascule à l'heure.
   Contre-épreuves : sans seconde heure, tout se comporte comme avant. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm'), path = require('path');
const { extraireFonction } = require('./stubs');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0, 240) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const HEURE = 3600 * 1000, JOUR = 24 * HEURE;
const iso = ms => new Date(ms).toISOString();
const GS = path.join(__dirname, '..', 'gas', 'echanges.gs');

/* Contexte GAS : les propriétés du script, et le strict nécessaire autour. */
function contexteGas(lignes) {
  const PROPS = {}, pousses = [], notifs = [], ecrits = [], journal = [], cloche = [];
  const sh = { getRange: (row, col) => ({ setValue: v => ecrits.push({ row, col, v }) }) };
  const ctx = vm.createContext({ console, JSON, Date, Number, String, Object, Array, Math, Error, isNaN,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in PROPS ? PROPS[k] : (k === 'MIROIR_PUSH_TOKEN' ? 'JETON' : null)),
      setProperty: (k, v) => { PROPS[k] = String(v); }, deleteProperty: k => { delete PROPS[k]; } }) },
    Logger: { log: () => {} },
    Utilities: { formatDate: (d, tz, f) => {
      const p = new Date(d.getTime() + 3600 * 1000);   // heure de Paris en hiver
      const z = n => String(n).padStart(2, '0');
      return f === 'u' ? String(p.getUTCDay() || 7) : f === 'dd/MM' ? z(p.getUTCDate()) + '/' + z(p.getUTCMonth() + 1)
        : f === 'H' ? String(p.getUTCHours()) : f === 'mm' ? z(p.getUTCMinutes()) : d.toISOString(); } },
    _miroirEnvoyerLot_: (lot) => { pousses.push(lot); return { success: true }; },
    notifierPush_: (t, c, u, cible) => { notifs.push({ t, c, cible }); },
    _notifJournalNoter_: (cible, t, c) => { cloche.push({ t, c, cible }); },
    logAction: m => journal.push(m),
    _echangesLignes_: () => ({ sh, lignes: lignes || [] }),
    _echangesSansObjet_: () => 0,
    _echangesVersKV_: () => {},
    _echangesMaintenant_: () => new Date().toISOString(),
    _echangesDr_: id => 'Dr ' + id,
    _echangesEnAttentePour_: () => 1,
  });
  const src = fs.readFileSync(GS, 'utf8');
  vm.runInContext(src.match(/const ECHANGES_ENTETE = \[[^\]]*\];/)[0].replace('const ', 'var '), ctx);
  vm.runInContext('var ECHANGES_EXPIRATION_H = 48, ECHANGES_RAPPEL_H = 24;', ctx);
  vm.runInContext("var ECHANGES_OUVERTURE_A_PROGRAMMER = '';", ctx);   // les scénarios posent l'heure eux-mêmes
  vm.runInContext("var ECHANGES_REPONSES_A_PROGRAMMER = '';", ctx);   // les scénarios posent l'heure eux-mêmes
  ['_echangesOuvertureMs_', '_echangesEtat_', '_echangesEnDepot_', '_echangesDebutDelai_', '_echangesPoserReponses_',
   '_echangesMentionDepot_', '_echangesQuandFr_', '_echangesOuvertsMaintenant_', '_echangesAutorise_', 'ouvrirEchanges', 'programmerOuvertureEchanges',
   'annoncerOuvertureEchanges', 'fermerEchanges', 'synchroniserEtatEchanges', 'expirerEchanges', '_echangesAnnoncerReponses_', '_echangesAnnoncerOuverture_',
   '_echangesJoli_', '_echangesEst18_', 'repondreEchange']
    .forEach(n => vm.runInContext(extraireFonction(GS, n), ctx));
  const lever = f => { try { vm.runInContext(f, ctx); return null; } catch (e) { return e.message; } };
  return { ctx, PROPS, pousses, notifs, ecrits, journal, cloche, lever, src };
}

(async () => {
  console.log('\n═══ 1. echanges.gs : la seconde heure se pose, se refuse, s\'efface ═══');
  {
    const { ctx, PROPS, pousses, notifs, lever, src } = contexteGas();
    const etatPousse = () => JSON.parse(pousses[pousses.length - 1].notif_config);
    const cst = (src.match(/const ECHANGES_REPONSES_A_PROGRAMMER = '([^']*)';/) || [])[1];
    V('l\'heure des réponses est une constante en tête de section, vide ou lisible', cst !== undefined && (cst === '' || !isNaN(Date.parse(cst))), cst);
    V('(16/11) elle vaut vendredi 20/11/2026 à 10 h, heure de Paris', cst === '' || Date.parse(cst) === Date.parse('2026-11-20T09:00:00Z'), cst);
    const ouvCst = (src.match(/const ECHANGES_OUVERTURE_A_PROGRAMMER = '([^']*)';/) || [])[1];
    V('(16/11) l\'ouverture programmée vaut mercredi 18/11/2026 à 10 h, avant l\'heure des réponses', ouvCst === '' || (Date.parse(ouvCst) === Date.parse('2026-11-18T09:00:00Z') && (cst === '' || Date.parse(ouvCst) < Date.parse(cst))), ouvCst);
    const ouv = iso(Date.now() + JOUR), rep = iso(Date.now() + 4 * JOUR);
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(ouv)}, ${JSON.stringify(rep)})`, ctx);
    V('programmer avec une heure des réponses : les deux heures sont notées', PROPS.ECHANGES_OUVERTURE === ouv && PROPS.ECHANGES_REPONSES === rep, PROPS);
    V('le Worker reçoit l\'heure des réponses (notif_config)', etatPousse().reponses === rep && etatPousse().ouverture === ouv, etatPousse());
    V('une heure des réponses AVANT l\'ouverture est refusée', /doit tomber après/.test(lever(`programmerOuvertureEchanges(${JSON.stringify(ouv)}, ${JSON.stringify(iso(Date.now() + 2 * HEURE))})`) || ''));
    V('… et le refus ne touche à rien (ni l\'ouverture ni l\'heure déjà posées)', PROPS.ECHANGES_OUVERTURE === ouv && PROPS.ECHANGES_REPONSES === rep);
    V('une heure des réponses illisible est refusée', /illisible/.test(lever(`programmerOuvertureEchanges(${JSON.stringify(ouv)}, 'jeudi')`) || ''));
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(ouv)})`, ctx);
    V('contre-épreuve — reprogrammer sans heure des réponses l\'efface : ouverture d\'un coup, comme avant', !('ECHANGES_REPONSES' in PROPS) && etatPousse().reponses === '', etatPousse());
    vm.runInContext(`ECHANGES_REPONSES_A_PROGRAMMER = ${JSON.stringify(rep)}`, ctx);
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(ouv)})`, ctx);
    V('sans argument : la constante est prise (lancement depuis l\'éditeur)', PROPS.ECHANGES_REPONSES === rep);
    vm.runInContext(`ECHANGES_REPONSES_A_PROGRAMMER = ''`, ctx);
    const rep2 = iso(Date.now() + 3 * JOUR);
    vm.runInContext(`ouvrirEchanges(${JSON.stringify(rep2)})`, ctx);
    const annonce = notifs.filter(n => n.t === 'Échanges de gardes ouverts');
    V('(16/11) ouvrir avec dépôt : UNE notification à tous (sans destinataire précis)', annonce.length === 1 && !annonce[0].cible, annonce);
    V('… courte : on propose maintenant, on accepte à partir de l\'heure', annonce.length === 1 && /^Proposez vos dons et échanges dès maintenant\. Accepter sera possible à partir du (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d\d\/\d\d à \d+ h( \d\d)?\.$/.test(annonce[0].c), annonce[0] && annonce[0].c);
    V('ouvrir tout de suite avec une heure des réponses : ouvert, dépôt jusqu\'à l\'heure',
      PROPS.ECHANGES_OUVERTS === 'O' && PROPS.ECHANGES_REPONSES === rep2 && vm.runInContext('_echangesEnDepot_()', ctx) === true);
    PROPS.ECHANGES_REPONSES_ANNONCEES = rep2;
    vm.runInContext('annoncerOuvertureEchanges()', ctx);
    V('annoncer « prochainement » efface l\'heure des réponses (et sa trace d\'annonce)', !('ECHANGES_REPONSES' in PROPS) && !('ECHANGES_REPONSES_ANNONCEES' in PROPS));
    vm.runInContext(`ouvrirEchanges(${JSON.stringify(rep2)})`, ctx);
    vm.runInContext('fermerEchanges()', ctx);
    V('fermer efface l\'heure des réponses', !('ECHANGES_REPONSES' in PROPS) && etatPousse().reponses === '');
    const avant = notifs.length;
    vm.runInContext('ouvrirEchanges()', ctx);
    V('contre-épreuve — ouvrir sans heure : pas de dépôt', vm.runInContext('_echangesEnDepot_()', ctx) === false);
    V('… et pas de notification (comme avant)', notifs.length === avant);
    V('l\'heure se dit en clair : « mercredi 18/11 à 10 h »', vm.runInContext("_echangesQuandFr_(Date.parse('2026-11-18T09:00:00Z'))", ctx) === 'mercredi 18/11 à 10 h');
    PROPS.ECHANGES_REPONSES = 'pas une date';
    V('heure des réponses illisible : jamais de dépôt (on n\'empêche personne d\'accepter par erreur)', vm.runInContext('_echangesEnDepot_()', ctx) === false);
  }

  console.log('\n═══ 2. echanges.gs : pendant le dépôt on refuse, on n\'accepte pas ═══');
  {
    const ligne = () => ({ ID: 'E1', CREE_LE: iso(Date.now() - HEURE), TYPE: 'don', ANNEE: 2027, DATE: '2027-03-12', DATE2: '',
      DEMANDEUR: 'BRAVO', RECEVEUR: 'ALPHA', ETAT: 'attente', REPONDU_LE: '', RAPPEL_LE: '', INFO: '', _row: 2 });
    let g = contexteGas([ligne()]);
    g.PROPS.ECHANGES_OUVERTS = 'O';
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() + 2 * JOUR);
    const err = g.lever(`repondreEchange({ id:'ALPHA', role:'mar' }, { id:'E1', reponse:'accepter' })`);
    V('accepter avant l\'heure : refusé par le serveur, avec l\'heure', /^Accepter s'ouvre le \S+ \d\d\/\d\d à \d+ h.*, pour tout le monde en même temps\. Vous pouvez déjà refuser\.$/.test(err || ''), err);
    V('… et rien n\'est écrit dans ECHANGES (la demande reste en attente)', g.ecrits.length === 0, g.ecrits);
    const errAdm = g.lever(`repondreEchange({ id:'ALPHA', role:'admin' }, { id:'E1', reponse:'accepter' })`);
    V('le comité non plus n\'accepte pas avant l\'heure', /^Accepter s'ouvre/.test(errAdm || ''), errAdm);
    const r = vm.runInContext(`repondreEchange({ id:'ALPHA', role:'mar' }, { id:'E1', reponse:'refuser' })`, g.ctx);
    V('refuser pendant le dépôt : permis, écrit « refusee » comme aujourd\'hui', r.etat === 'refusee' && g.ecrits.some(e => e.v === 'refusee'), g.ecrits);
    V('… et le demandeur est prévenu', g.notifs.some(n => n.cible && n.cible.id === 'BRAVO' && /décliné/.test(n.c)));

    g = contexteGas([ligne()]);
    g.PROPS.ECHANGES_OUVERTS = 'O';
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() - 1000);
    const apres = g.lever(`repondreEchange({ id:'ALPHA', role:'mar' }, { id:'E1', reponse:'accepter' })`);
    V('heure atteinte : plus aucun refus de dépôt (l\'acceptation suit son chemin habituel)', !/^Accepter s'ouvre/.test(apres || ''), apres);
    g = contexteGas([ligne()]);
    g.PROPS.ECHANGES_OUVERTS = 'O';
    const sans = g.lever(`repondreEchange({ id:'ALPHA', role:'mar' }, { id:'E1', reponse:'accepter' })`);
    V('contre-épreuve — sans heure des réponses : rien ne change', !/^Accepter s'ouvre/.test(sans || ''), sans);

    g.PROPS.ECHANGES_REPONSES = iso(Date.now() + JOUR);
    V('pendant le dépôt, la notification de proposition dit quand on pourra répondre', /^ Vous pourrez répondre à partir du .+\.$/.test(vm.runInContext('_echangesMentionDepot_()', g.ctx)));
    delete g.PROPS.ECHANGES_REPONSES;
    V('… et ne dit rien hors dépôt', vm.runInContext('_echangesMentionDepot_()', g.ctx) === '');
    V('la phrase est bien ajoutée à la notification envoyée au receveur', /\+ _echangesMentionDepot_\(\),/.test(g.src));
  }

  console.log('\n═══ 3. echanges.gs : les 48 h comptent depuis l\'heure des réponses ═══');
  {
    const vieille = (id) => ({ ID: id, CREE_LE: iso(Date.now() - 3 * JOUR), TYPE: 'don', ANNEE: 2027, DATE: '2027-03-12', DATE2: '',
      DEMANDEUR: 'BRAVO', RECEVEUR: 'ALPHA', ETAT: 'attente', REPONDU_LE: '', RAPPEL_LE: '', INFO: '', _row: 2 });
    let g = contexteGas([vieille('E1')]);
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() - HEURE);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('déposée il y a 3 jours, réponses ouvertes depuis 1 h : ni expirée ni rappelée', !g.ecrits.some(e => e.v === 'expiree') && g.ecrits.length === 0, g.ecrits);
    g = contexteGas([vieille('E1')]);
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() - 25 * HEURE);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('réponses ouvertes depuis 25 h : le rappel part (24 h après l\'heure, pas après le dépôt)', g.notifs.some(n => /attend votre réponse/.test(n.c)) && !g.ecrits.some(e => e.v === 'expiree'));
    g = contexteGas([vieille('E1')]);
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() - 49 * HEURE);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('réponses ouvertes depuis 49 h : expirée', g.ecrits.some(e => e.v === 'expiree'));
    g = contexteGas([vieille('E1')]);
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() + JOUR);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('dépôt en cours : rien n\'expire, rien n\'est rappelé', g.ecrits.length === 0 && g.notifs.length === 0, g.notifs);
    g = contexteGas([vieille('E1')]);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('contre-épreuve — sans heure des réponses : expirée après 48 h, comme avant', g.ecrits.some(e => e.v === 'expiree'));
    const recente = vieille('E2'); recente.CREE_LE = iso(Date.now() - 50 * HEURE);
    g = contexteGas([recente]);
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() - 60 * HEURE);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('proposée APRÈS l\'heure des réponses : son délai part de sa création (50 h → expirée)', g.ecrits.some(e => e.v === 'expiree'));
  }

  console.log('\n═══ 4. echanges.gs : fin du dépôt — la CLOCHE de chacun, une seule fois ; le téléphone, c\'est le Worker ═══');
  {
    const l = (id, rec, etat) => ({ ID: id, CREE_LE: iso(Date.now() - 2 * JOUR), TYPE: 'don', ANNEE: 2027, DATE: '2027-03-12', DATE2: '',
      DEMANDEUR: 'BRAVO', RECEVEUR: rec, ETAT: etat || 'attente', REPONDU_LE: '', RAPPEL_LE: '', INFO: '', _row: 2 });
    const g = contexteGas([l('A', 'ALPHA'), l('B', 'ALPHA'), l('C', 'CHARLIE'), l('D', 'DELTA', 'refusee')]);
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() + HEURE);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('avant l\'heure : rien dans la cloche', !g.cloche.some(n => /vous pouvez répondre/.test(n.t)));
    g.PROPS.ECHANGES_REPONSES = iso(Date.now() - 10 * 60 * 1000);
    vm.runInContext('expirerEchanges()', g.ctx);
    const ann = g.cloche.filter(n => /vous pouvez répondre/.test(n.t));
    V('premier passage après l\'heure : une ligne de cloche par MAR qui a des demandes en attente', ann.length === 2, ann);
    V('… avec son nombre de demandes', ann.some(n => n.cible.id === 'ALPHA' && /^Vous pouvez maintenant accepter : 2 demandes vous attendent/.test(n.c)) && ann.some(n => n.cible.id === 'CHARLIE' && /une demande vous attend/.test(n.c)), ann);
    V('… rien pour celui dont la demande est déjà refusée', !ann.some(n => n.cible.id === 'DELTA'));
    V('(18/11) AUCUNE notification téléphone depuis Google (le Worker l\'a envoyée à la minute : pas de doublon)', !g.notifs.some(n => /vous pouvez répondre/.test(n.t)), g.notifs);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('passage suivant : pas de seconde ligne', g.cloche.filter(n => /vous pouvez répondre/.test(n.t)).length === 2);
  }

  console.log('\n═══ 4 bis. echanges.gs : ouverture PROGRAMMÉE — la notification part au passage horaire, une fois ═══');
  {
    const g = contexteGas([]);
    const ouv = Date.now() + 2 * HEURE, rep = Date.now() + 2 * JOUR;
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(iso(ouv))}, ${JSON.stringify(iso(rep))})`, g.ctx);
    const annonces = () => g.notifs.filter(n => n.t === 'Échanges de gardes ouverts');
    vm.runInContext('expirerEchanges()', g.ctx);
    V('avant l\'heure d\'ouverture : aucune notification', annonces().length === 0);
    g.PROPS.ECHANGES_OUVERTURE = iso(Date.now() - 20 * 60 * 1000);   // l'heure est passée depuis 20 min
    vm.runInContext('expirerEchanges()', g.ctx);
    V('premier passage après l\'ouverture : UNE notification à tous', annonces().length === 1 && !annonces()[0].cible, annonces());
    V('… le même texte court que l\'ouverture à la main', /^Proposez vos dons et échanges dès maintenant\. Accepter sera possible à partir du \S+ \d\d\/\d\d à \d+ h( \d\d)?\.$/.test(annonces()[0].c), annonces()[0].c);
    vm.runInContext('expirerEchanges()', g.ctx);
    V('passage suivant : pas de seconde notification', annonces().length === 1);
    V('… et pas d\'annonce « vous pouvez répondre » pendant le dépôt', !g.notifs.some(n => /vous pouvez répondre/.test(n.t)));

    const m = contexteGas([]);
    vm.runInContext(`ouvrirEchanges(${JSON.stringify(iso(Date.now() + 2 * JOUR))})`, m.ctx);
    vm.runInContext('expirerEchanges()', m.ctx);
    V('ouverture À LA MAIN : sa notification, puis rien au passage horaire (pas de doublon)', m.notifs.filter(n => n.t === 'Échanges de gardes ouverts').length === 1);

    const s = contexteGas([]);
    vm.runInContext(`programmerOuvertureEchanges(${JSON.stringify(iso(Date.now() + HEURE))})`, s.ctx);
    s.PROPS.ECHANGES_OUVERTURE = iso(Date.now() - 10 * 60 * 1000);
    vm.runInContext('expirerEchanges()', s.ctx);
    V('contre-épreuve — ouverture programmée SANS dépôt : aucune notification (comme avant)', s.notifs.length === 0);

    const v = contexteGas([]);
    v.PROPS.ECHANGES_OUVERTURE = iso(Date.now() - 3 * JOUR);
    v.PROPS.ECHANGES_REPONSES = iso(Date.now() + JOUR);
    vm.runInContext('expirerEchanges()', v.ctx);
    V('ouverture vieille de plus de 24 h : rien ne part (une heure posée après coup ne réveille rien)', v.notifs.length === 0);
  }

  /* ── Le Worker et la page ── */
  const src = fs.readFileSync(path.join(__dirname, '..', 'cloudflare', 'worker.js'), 'utf8').replace('export default', 'globalThis.__W =');
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
  const CODE = 'MARCODE77';
  const jours = ['2027-02-06', '2027-02-12', '2027-02-13'];
  const planning = { months: [{ days: jours.map(d => ({ date: d })), doctors: [{ id: 'ALPHA', days: jours.map(() => ({ status: '' })) }] }] };
  const dem = (id, date, de, a, etat, cree) => ({ id, creeLe: cree || iso(Date.now() - HEURE), type: 'don', annee: 2027, date, date2: '',
    demandeur: de, receveur: a, etat: etat || 'attente', reponduLe: etat && etat !== 'attente' ? iso(Date.now()) : '', info: '' });
  /* Créées dans le désordre : la plus TARDIVE en date de garde est la plus ANCIENNE en dépôt. */
  const liste = [
    dem('R3', '2027-04-10', 'BRAVO', 'ALPHA', 'attente', iso(Date.now() - 30 * HEURE)),
    dem('R1', '2027-02-06', 'CHARLIE', 'ALPHA', 'attente', iso(Date.now() - 2 * HEURE)),
    dem('R2', '2027-02-13', 'DELTA', 'ALPHA', 'attente', iso(Date.now() - 20 * HEURE)),
    dem('RX', '2027-03-03', 'BRAVO', 'ALPHA', 'refusee'),
    dem('M2', '2027-05-25', 'ALPHA', 'BRAVO'),
    dem('M1', '2027-03-18', 'ALPHA', 'CHARLIE'),
  ];
  const baseKV = async (cfg) => ({
    acces: JSON.stringify({ indisposYear: 2027, indisposOuverte: false, users: [
      { h: await sha(CODE), role: 'mar', id: 'ALPHA', name: 'ALPHA', initials: 'AL', prenom: 'Test' }] }),
    annees: JSON.stringify({ success: true, active: 2027, annees: [{ annee: 2027, statut: 'ACTIF' }] }),
    planning_2027: JSON.stringify(planning),
    echanges: JSON.stringify({ success: true, echanges: liste }),
    notif_config: JSON.stringify(cfg),
  });
  function worker(kvInitial) {
    const wctx = vm.createContext({ globalThis: {}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise, Intl });
    wctx.globalThis = wctx; vm.runInContext(src, wctx);
    const M = new Map(Object.entries(kvInitial));
    const KV = { get: async k => (M.has(k) ? M.get(k) : null), put: async (k, v) => { M.set(k, v); }, delete: async k => { M.delete(k); },
      list: async ({ prefix, limit }) => ({ keys: [...M.keys()].filter(k => k.startsWith(prefix)).slice(0, limit || 1000).map(name => ({ name })) }) };
    const env = { KV, PUSH_TOKEN: 'JETON' };
    const appel = async (chemin, corps) => (await wctx.__W.fetch(new Request('https://worker' + chemin, { method: 'POST', body: JSON.stringify(corps) }), env)).json();
    return { WK: wctx.__W, env, appel, ctx: wctx };
  }

  console.log('\n═══ 5. Le Worker : l\'heure des réponses voyage avec la réponse ═══');
  {
    const rep = iso(Date.now() + 2 * JOUR);
    let w = worker(await baseKV({ ouvert: true, pilotes: [], reponses: rep }));
    let r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('dépôt : la liste est servie (on propose déjà)', !!(r.data.echanges && r.data.echanges.success), r.refuses);
    V('… et l\'heure des réponses lui est jointe', r.echangesReponses === rep, r.echangesReponses);
    w = worker(await baseKV({ ouvert: true, pilotes: [], reponses: 'jeudi' }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('heure illisible : rien n\'est servi comme heure', !('echangesReponses' in r));
    w = worker(await baseKV({ ouvert: true, pilotes: [] }));
    r = await w.appel('/read', { code: CODE, keys: ['echanges'] });
    V('contre-épreuve — sans heure des réponses : aucun champ en plus', !('echangesReponses' in r) && !!r.data.echanges);
  }

  console.log('\n═══ 5 bis. (18/11/2026) Le Worker : rappels À LA MINUTE, 1 h avant et à l\'heure des réponses ═══');
  {
    const REP = Date.parse('2026-11-20T09:00:00Z');   // vendredi 20/11 à 10 h, heure de Paris
    const monte = async () => {
      const kv = await baseKV({ ouvert: true, pilotes: [], reponses: iso(REP) });
      kv.notif_sub_ALPHA = JSON.stringify({ endpoint: 'https://push/alpha' });
      kv.notif_sub_DELTA = JSON.stringify({ endpoint: 'https://push/delta' });
      const w = worker(kv);
      return w;
    };
    /* Les envois réels (Web Push chiffré) sont remplacés par un relevé : on veut savoir QUI reçoit QUOI. */
    const relever = (w) => { const r = []; w.ctx.notifExpedier = async (sub, msg) => { r.push({ sub: JSON.parse(JSON.stringify(sub)).endpoint, m: JSON.parse(msg) }); return 201; }; return r; };
    let w = await monte(); let r = relever(w);
    w.env.VAPID_PUBLIC = 'x'; w.env.VAPID_PRIVATE = 'y';
    const lancer = (ms) => new Promise(ok => { const p = []; w.WK.scheduled({ scheduledTime: ms }, w.env, { waitUntil: x => p.push(x) }); Promise.all(p).then(ok); });
    await lancer(REP - 2 * HEURE);
    V('2 h avant : rien', r.length === 0, r);
    await lancer(REP - HEURE);
    V('1 h avant, à la minute : ALPHA prévenu (3 demandes reçues en attente)', r.length === 1 && r[0].sub === 'https://push/alpha' && /réponses dans 1 h/.test(r[0].m.titre) && /^À 10 h, vous pourrez accepter : 3 demandes vous attendent/.test(r[0].m.corps), r);
    V('… DELTA (proposeur, rien reçu) n\'est pas dérangé', !r.some(x => x.sub === 'https://push/delta'));
    await lancer(REP - HEURE + 60 * 1000);
    V('minute suivante : pas de doublon', r.length === 1, r.length);
    await lancer(REP - 60 * 1000);
    V('à 9 h 59 : rien de plus', r.length === 1);
    await lancer(REP);
    V('à 10 h pile : « vous pouvez répondre », avec le nombre et les 48 h', r.length === 2 && /vous pouvez répondre/.test(r[1].m.titre) && /^C'est ouvert : 3 demandes vous attendent, 48 h pour répondre/.test(r[1].m.corps), r[1]);
    await lancer(REP + 60 * 1000);
    V('10 h 01 : pas de doublon', r.length === 2);
    w = await monte(); r = relever(w); w.env.VAPID_PUBLIC = 'x'; w.env.VAPID_PRIVATE = 'y';
    await lancer(REP + 3 * 60 * 1000);
    V('minute de 10 h manquée : rattrapée à 10 h 03 (fenêtre de 10 min)', r.length === 1 && /vous pouvez répondre/.test(r[0].m.titre), r);
    w = await monte(); r = relever(w); w.env.VAPID_PUBLIC = 'x'; w.env.VAPID_PRIVATE = 'y';
    await lancer(REP + 20 * 60 * 1000);
    V('au-delà de 10 min : plus rien (un rappel en retard ne sert à rien)', r.length === 0, r);
    const kv0 = await baseKV({ ouvert: true, pilotes: [] }); kv0.notif_sub_ALPHA = JSON.stringify({ endpoint: 'https://push/alpha' });
    w = worker(kv0); r = relever(w); w.env.VAPID_PUBLIC = 'x'; w.env.VAPID_PRIVATE = 'y';
    await lancer(REP);
    V('contre-épreuve — pas d\'heure des réponses : rien', r.length === 0);
  }

  async function monterPage(kvInitial) {
    const { WK, env } = worker(kvInitial);
    const contenu = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const fauxFetch = async (url, opt) => {
      const u = String(url);
      if (u.includes('workers.dev')) return WK.fetch(new Request('https://worker' + u.replace(/^https:\/\/[^/]+/, ''), { method: 'POST', body: opt.body }), env);
      return { ok: true, json: async () => ({ success: false, error: 'GAS indisponible dans le banc' }) };
    };
    const dom = new JSDOM(contenu, { runScripts: 'dangerously', virtualConsole: vc,
      url: 'https://planningmedic.github.io/index.html', pretendToBeVisual: true,
      beforeParse(win) {
        win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'portail.js'), 'utf8'));
        win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));
        win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
        win.Element.prototype.scrollIntoView = function () {};
        win.scrollTo = () => {};
        win.fetch = fauxFetch;
        if (!win.navigator.sendBeacon) win.navigator.sendBeacon = () => true;
        try { win.sessionStorage.setItem('pmViewCode', CODE); } catch (e) {}
        try { win.localStorage.setItem('pmEchOuvertureVue', 'deja'); } catch (e) {}
      } });
    await dodo(900);
    return { w: dom.window, erreurs, fermer: () => dom.window.close() };
  }
  const ouvrirVue = async (w) => { w.location.hash = '#echanges'; w.route(); await dodo(400); return w.document.getElementById('echList').innerHTML; };

  console.log('\n═══ 6. Pendant le dépôt : tuile ambre, Accepter grisé, deux blocs par date de garde ═══');
  {
    const rep = Date.now() + (1 * JOUR + 23 * HEURE + 5 * 60 * 1000);
    const { w, erreurs, fermer } = await monterPage(await baseKV({ ouvert: true, pilotes: [], reponses: iso(rep) }));
    const d = w.document, hero = d.getElementById('echangesHero');
    V('la page se charge sans erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    V('la tuile est ouverte, en mode dépôt (pleine largeur)', hero.style.display !== 'none' && hero.classList.contains('depot') && hero.classList.contains('large') && !hero.classList.contains('verrou'));
    V('le compte à rebours dit « Réponses dans » et vise l\'heure des réponses', d.getElementById('echReboursL').textContent === 'Réponses dans'
      && d.getElementById('echRebours').style.display !== 'none' && /^1 j 23 h$/.test(d.getElementById('echReboursV').textContent), d.getElementById('echReboursV').textContent);
    const pg = d.getElementById('echPastille');
    V('pastille GRISE : 3 demandes arrivées, pas encore acceptables', pg.style.display !== 'none' && pg.textContent === '3' && pg.classList.contains('grise') && !hero.classList.contains('attente'));
    V('le sous-titre dit que le dépôt est ouvert', d.getElementById('echHeroSub').textContent === 'Dépôt ouvert : proposez vos gardes.');
    hero.click();
    V('toucher la tuile ouvre Mes échanges (pas de verrou)', w.location.hash === '#echanges');
    const h = await ouvrirVue(w);
    V('le bandeau du dépôt est affiché', /ech-bandeau depot/.test(h) && /Dépôt en cours, jusqu’au/.test(h));
    const accs = [...d.querySelectorAll('#echList .ech-accepter')];
    V('les 3 boutons Accepter sont grisés, avec le jour et l\'heure', accs.length === 3 && accs.every(b => b.disabled && /^Accepter \S+ \d+ h/.test(b.textContent)), accs.map(b => b.textContent));
    const refs = [...d.querySelectorAll('#echList .ech-refuser:not(.ech-annuler)')];
    V('Refuser reste actif', refs.length === 3 && refs.every(b => !b.disabled));
    const iA = h.indexOf('<h3>À traiter</h3>'), iF = h.indexOf('Déjà traitées'), iM = h.indexOf('<h3>Mes propositions</h3>');
    const pos = id => h.indexOf("repondreEch('" + id + "'");
    V('« À traiter » est trié par date de garde, pas par heure de dépôt (06/02, 13/02, 10/04)', iA > -1 && pos('R1') > iA && pos('R1') < pos('R2') && pos('R2') < pos('R3') && pos('R3') < iF, [pos('R1'), pos('R2'), pos('R3')]);
    V('les mois servent d\'intercalaires', /Février 2027[\s\S]*Avril 2027/.test(h.slice(iA, iF)));
    V('l\'heure du dépôt n\'est affichée nulle part (« Expire dans » absent pendant le dépôt)', !/Expire dans/.test(h) && /Le délai de 48 h démarrera/.test(h));
    const faites = d.querySelector('#echList details.ech-faites');
    V('la demande déjà refusée est dans le bloc replié « Déjà traitées (1) »', !!faites && !faites.open && /Déjà traitées <i>1<\/i>/.test(faites.innerHTML) && /Refusée/.test(faites.innerHTML), faites && faites.innerHTML.slice(0, 120));
    V('… et plus dans « À traiter »', h.slice(iA, iF).indexOf('Refusée') === -1);
    const iM1 = h.indexOf('Dr Charlie</strong>, ', iM) > -1 ? h.indexOf('Don proposé à <strong>Dr Charlie', iM) : h.indexOf('Don proposé à <strong>Dr Charlie', iM);
    V('« Mes propositions » en ordre chronologique, marquées « Déposée »', iM > iF && iM1 > iM && iM1 < h.indexOf('Don proposé à <strong>Dr Bravo', iM) && (h.slice(iM).match(/Déposée/g) || []).length === 2);
    V('… et toujours annulables', d.querySelectorAll('#echList .ech-annuler').length === 2);
    V('le bouton du panneau Proposer dit « Déposer la proposition »', w._echLibEnvoyer() === 'Déposer la proposition');
    faites.open = true; faites.dispatchEvent(new w.Event('toggle'));
    w.renderEchanges();
    V('le bloc « Déjà traitées » reste déplié d\'un affichage à l\'autre', d.querySelector('#echList details.ech-faites').open === true);
    fermer();
  }

  console.log('\n═══ 7. À l\'heure des réponses : tout bascule, sans recharger ═══');
  {
    const rep = Date.now() + 2500;
    const { w, erreurs, fermer } = await monterPage(await baseKV({ ouvert: true, pilotes: [], reponses: iso(rep) }));
    const d = w.document, hero = d.getElementById('echangesHero');
    await ouvrirVue(w);
    V('juste avant : Accepter grisé', [...d.querySelectorAll('#echList .ech-accepter')].every(b => b.disabled));
    await dodo(3600);
    V('à l\'heure : la tuile quitte le mode dépôt, pastille rouge', !hero.classList.contains('depot') && hero.classList.contains('attente') && !d.getElementById('echPastille').classList.contains('grise'));
    const accs = [...d.querySelectorAll('#echList .ech-accepter')];
    V('… Accepter s\'active dans l\'écran déjà ouvert', accs.length === 3 && accs.every(b => !b.disabled && b.textContent === 'Accepter'), accs.map(b => b.textContent));
    const h = d.getElementById('echList').innerHTML;
    V('… le bandeau passe au vert, le délai s\'affiche (48 h depuis l\'heure)', /ech-bandeau ouvert/.test(h) && /Expire dans 48 h/.test(h));
    V('… le compte à rebours a disparu', d.getElementById('echRebours').style.display === 'none');
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    fermer();
  }

  console.log('\n═══ 8. Contre-épreuve : sans heure des réponses, comme avant (plus le tri par date) ═══');
  {
    const { w, erreurs, fermer } = await monterPage(await baseKV({ ouvert: true, pilotes: [] }));
    const d = w.document, hero = d.getElementById('echangesHero');
    V('tuile normale, rouge, pastille rouge', !hero.classList.contains('depot') && hero.classList.contains('attente') && !d.getElementById('echPastille').classList.contains('grise'));
    const h = await ouvrirVue(w);
    V('aucun bandeau', !/ech-bandeau/.test(h));
    V('Accepter actif, délai compté depuis la création', [...d.querySelectorAll('#echList .ech-accepter')].every(b => !b.disabled) && /Expire dans 18 h/.test(h), h.match(/Expire dans \d+ h/g));
    V('le bouton du panneau dit « Envoyer la proposition »', w._echLibEnvoyer() === 'Envoyer la proposition');
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    fermer();
  }

  console.log('\n═══ 9. (19/11/2026) Une inversion des rôles d\'un jour s\'affiche comme telle ═══');
  {
    const inv = (id, de, a) => Object.assign(dem(id, '2027-02-12', de, a), { type: 'inversion' });
    liste.push(inv('I1', 'BRAVO', 'ALPHA'), inv('I2', 'ALPHA', 'CHARLIE'));
    const { w, erreurs, fermer } = await monterPage(await baseKV({ ouvert: true, pilotes: [] }));
    const d = w.document;
    await ouvrirVue(w);
    const carte = id => { const m = d.getElementById('echMsg-' + id); return m ? m.closest('.ech-card') : null; };
    const recue = carte('I1'), mienne = carte('I2');
    V('reçue : « Inversion garde ↔ 18 h », « Dr Bravo prend votre garde, vous faites son 18 h »', recue && /Inversion garde ↔ 18 h/.test(recue.textContent) && /Dr Bravo prend votre garde, vous faites son 18 h/.test(recue.textContent), recue && recue.textContent);
    V('… avec Accepter et Refuser comme toute demande reçue', recue && !!recue.querySelector('.ech-accepter') && !!recue.querySelector('.ech-refuser'));
    V('envoyée : « vous prenez sa garde, le Dr Charlie fait votre 18 h », annulable', mienne && /Proposée à Dr Charlie : vous prenez sa garde, le Dr Charlie fait votre 18 h/.test(mienne.textContent) && !!mienne.querySelector('.ech-annuler'), mienne && mienne.textContent);
    V('aucun « elle » à l\'écran', !/\belle\b/.test((recue ? recue.textContent : '') + (mienne ? mienne.textContent : '')));
    V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 2));
    fermer();
    liste.splice(liste.length - 2, 2);
  }

  console.log(`\n${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
