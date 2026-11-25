/* ═══ BANC — LE VERROU DES INDISPOS PART DE LA COPIE RAPIDE (25/11/2026) ════
   Constaté par le responsable : à l'ouverture de « Mes indisponibilités »,
   campagne close et gardes générées, on pouvait modifier ses indispos pendant
   quelques secondes. Le calendrier s'affichait par la copie rapide (~150 ms),
   mais le verrou n'arrivait qu'avec getVacConfig, au serveur (2 à 20 s).
   Le verdict était pourtant déjà dans l'identité servie par le relais
   (indisposFigees, finSaisie) : l'écran se verrouille désormais dès
   l'ouverture. Vieille copie rapide sans ces champs : aucun geste accepté tant
   que le serveur n'a pas répondu.

   Ici : la VRAIE page indispos.html, un relais qui répond aussitôt, et un
   serveur qu'on fait attendre à volonté. On pilote au clic (applyTool).    */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let ok = 0, ko = 0;
function V(libelle, condition, detail) {
  if (condition) { ok++; console.log('  ✓ ' + libelle); }
  else { ko++; console.log('  ✗ ' + libelle + (detail !== undefined ? ' → ' + JSON.stringify(detail).slice(0, 300) : '')); }
}
const dodo = ms => new Promise(r => setTimeout(r, ms));

/* identite : ce que le relais sert. vacCfg : la réponse du serveur, ou null
   pour un serveur qui ne répond jamais (on la libère avec liberer()). */
async function ouvrir(identite, vacCfg) {
  const contenu = fs.readFileSync(__dirname + '/../indispos.html', 'utf8');
  const vc = new VirtualConsole(); const erreurs = [];
  vc.on('jsdomError', e => erreurs.push(e.message));
  let liberer = null;
  const attente = new Promise(r => { liberer = r; });
  const appels = [];
  const dom = new JSDOM(contenu, { runScripts: 'dangerously', virtualConsole: vc,
    url: 'https://planningmedic.github.io/indispos.html', pretendToBeVisual: true,
    beforeParse(win) {
      win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      win.Element.prototype.scrollIntoView = function () {};
      win.scrollTo = function () {};
      win.eval(fs.readFileSync(__dirname + '/../partage/session.js', 'utf8'));
      win.eval(fs.readFileSync(__dirname + '/../partage/portail.js', 'utf8'));
      try { win.sessionStorage.setItem('pmViewCode', 'MOICODE'); } catch (e) {}
      win.fetch = async (url, opt) => {
        const u = String(url), corps = JSON.parse((opt && opt.body) || '{}');
        if (u.includes('workers.dev')) {
          appels.push('relais');
          return { ok: true, status: 200, json: async () => ({ success: true, identite: identite,
            data: { indispos_2027: { parMar: { MOI: { '2027-03-03': 'INDISPO' } } } }, refuses: [], manquants: [] }) };
        }
        appels.push('serveur:' + corps.action);
        if (corps.action === 'getVacConfig') {
          const libere = vacCfg === null ? await attente : null;
          return { ok: true, json: async () => libere || vacCfg || { success: true, periodes: [], quotaVac: 30, quotaForm: 5, quotaCtp: 0,
            quotaIndispo: 20, quotaIndispoWe: 4, joursFeries: [], genere: false, anneeCampagne: 2027, finSaisie: '2099-10-30', saisieClose: false } };
        }
        return { ok: true, json: async () => ({ success: false, error: 'non prévu au banc' }) };
      };
    } });
  const w = dom.window;
  await dodo(300);
  const etat = () => ({
    fige: w.eval('ECRAN_FIGE'), motif: w.eval('ECRAN_MOTIF'), attente: w.eval('VERDICT_ATTENDU'),
    bandeau: (w.document.getElementById('figeBanner') || {}).textContent || '',
    jour: w.eval('indispos["2027-03-10"] || ""'),
    affiche: w.document.getElementById('app').style.display,
  });
  return { w, etat, appels, erreurs, liberer: v => liberer(v) };
}
const BASE = { id: 'MOI', role: 'mar', name: 'Dr Moi', initials: 'DM', indisposYear: 2027 };

(async () => {
  console.log('\n═══ IV1. Gardes générées : verrouillé AVANT la réponse du serveur ═══');
  {
    const p = await ouvrir(Object.assign({}, BASE, { indisposFigees: true, finSaisie: '2026-11-06' }), null);
    const e = p.etat();
    V('le calendrier est affiché par la copie rapide', e.affiche === 'block', e);
    V('le serveur n\'a pas encore répondu (on le fait attendre)', p.appels.includes('serveur:getVacConfig'), p.appels);
    V('l\'écran est DÉJÀ verrouillé, motif « planning établi »', e.fige === true && e.motif === 'fige', e);
    V('le bandeau le dit', /Le planning 2027 est établi/.test(e.bandeau), e.bandeau);
    p.w.applyTool('2027-03-10');
    V('un appui sur un jour ne change RIEN', p.etat().jour === '', p.etat());
    V('« Sauvegarder » est inactif', p.w.document.getElementById('saveBtn').disabled === true);
    p.liberer();
    await dodo(80);
    V('le serveur répond ensuite : toujours verrouillé, un seul bandeau',
      p.etat().fige === true && p.w.document.querySelectorAll('#figeBanner').length === 1);
    V('aucune erreur de page', p.erreurs.length === 0, p.erreurs);
  }

  console.log('\n═══ IV2. Date limite passée : verrouillé, motif « saisie close » ═══');
  {
    const p = await ouvrir(Object.assign({}, BASE, { indisposFigees: false, finSaisie: '2020-10-30' }), null);
    const e = p.etat();
    V('verrouillé dès l\'ouverture, motif « close »', e.fige === true && e.motif === 'close', e);
    V('le bandeau dit la date lue dans la copie rapide', /La saisie 2027 est close/.test(e.bandeau) && /30 octobre/.test(e.bandeau), e.bandeau);
    p.w.applyTool('2027-03-10');
    V('un appui ne change rien', p.etat().jour === '');
    V('le message parle de saisie close, pas de planning établi', /saisie est close/.test(p.w.document.body.textContent));
    p.liberer();
  }

  console.log('\n═══ IV3. Saisie ouverte : on peut poser sans attendre le serveur ═══');
  {
    const p = await ouvrir(Object.assign({}, BASE, { indisposFigees: false, finSaisie: '2099-10-30' }), null);
    const e = p.etat();
    V('pas de verrou, pas d\'attente', e.fige === false && e.attente === false, e);
    p.w.applyTool('2027-03-10');
    V('un appui pose le jour (le serveur juge à l\'enregistrement)', p.etat().jour !== '', p.etat());
    p.liberer();
  }
  {
    const p = await ouvrir(Object.assign({}, BASE, { indisposFigees: false, finSaisie: null }), null);
    V('sans date limite (la ligne n\'existe pas) : ouvert aussi', p.etat().fige === false && p.etat().attente === false, p.etat());
    p.liberer();
  }

  console.log('\n═══ IV4. Vieille copie rapide (sans verdict) : aucun geste avant le serveur ═══');
  {
    const p = await ouvrir(Object.assign({}, BASE), null);
    V('l\'écran attend le verdict', p.etat().attente === true && p.etat().fige === false, p.etat());
    p.w.applyTool('2027-03-10');
    V('un appui pendant l\'attente ne change rien', p.etat().jour === '', p.etat());
    p.liberer();
    await dodo(80);
    V('le serveur dit « ouvert » : l\'attente se lève', p.etat().attente === false && p.etat().fige === false, p.etat());
    p.w.applyTool('2027-03-10');
    V('…et l\'appui pose le jour', p.etat().jour !== '', p.etat());
  }
  {
    const p = await ouvrir(Object.assign({}, BASE), null);
    p.liberer({ success: true, periodes: [], quotaVac: 30, quotaForm: 5, quotaCtp: 0, quotaIndispo: 20, quotaIndispoWe: 4,
      joursFeries: [], genere: true, anneeCampagne: 2027, finSaisie: '2026-11-06', saisieClose: true });
    await dodo(80);
    V('le serveur dit « généré » : verrou posé par lui, comme avant', p.etat().fige === true && p.etat().attente === false && p.etat().motif === 'fige', p.etat());
  }
  {
    const p = await ouvrir(Object.assign({}, BASE), null);
    p.liberer({ success: false, error: 'panne' });
    await dodo(80);
    V('le serveur échoue : l\'écran ne reste pas bloqué (l\'enregistrement reste jugé par le serveur)', p.etat().attente === false, p.etat());
  }

  console.log('\n═══ IV5. Le relais transmet bien les deux champs ═══');
  {
    const W = fs.readFileSync(__dirname + '/../cloudflare/worker.js', 'utf8');
    V('indisposFigees et finSaisie sont dans l\'identité servie', /indisposFigees: !!acces\.indisposFigees/.test(W) && /finSaisie: \(typeof acces\.finSaisie === 'string'/.test(W));
    const M = fs.readFileSync(__dirname + '/../gas/miroir.gs', 'utf8');
    V('le serveur les pose dans la clé d\'accès, par la même règle que l\'écran', /acces\.indisposFigees = _indisposFigees_\(\)/.test(M) && /acces\.finSaisie = _finSaisieIndispos_\(\)/.test(M));
    const P = fs.readFileSync(__dirname + '/../indispos.html', 'utf8');
    V('la règle de la page suit celle du serveur : close le LENDEMAIN de la date, heure de Paris',
      /aujourdhuiParis\(\) > id\.finSaisie/.test(P) && /timeZone: 'Europe\/Paris'/.test(P));
  }

  console.log('\n' + (ko === 0 ? '✅' : '❌') + ' banc_indispos_verrou : ' + ok + ' vérifications, ' + ko + ' échec(s)');
  process.exit(ko === 0 ? 0 : 1);
})();
