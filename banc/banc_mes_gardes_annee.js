/* ═══ BANC — « MES GARDES » : VUE ANNÉE (16/11/2026, v1.80.0) ═══
   Demande du responsable : afficher dans « Mes gardes » le calendrier annuel
   du récapitulatif PDF, avec une bascule vers la liste actuelle.
   Règles vérifiées ici :
   - la vue Année est la vue par défaut, à chaque ouverture ;
   - elle s'ouvre centrée sur le mois en cours ;
   - G, G2, 18 h, vacances, TP gardent les couleurs de la liste ;
   - les jours passés sont pâlis, aujourd'hui est entouré ;
   - les totaux d'une année sont ceux de SON planning (comme les statistiques),
     même quand ses premiers jours de janvier viennent du planning d'avant ;
   - une année archivée ne s'affiche qu'à la demande (« Afficher … ») ;
   - aucun appel au serveur lent, et aucune lecture d'une année non servie. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const CODE_MAR = 'MARCODE77';
const p2 = n => String(n).padStart(2, '0');
const AUJ = new Date();
const AN = AUJ.getFullYear(), MOIS = AUJ.getMonth() + 1;
const AUJ_ISO = `${AN}-${p2(MOIS)}-${p2(AUJ.getDate())}`;

/* Planning au format servi : months[].days[].date + doctors[].days[].status.
   Une liste creuse de dates suffit (la vue suit l'index des jours). */
function planning(statuts) {
  const parMois = {};
  Object.keys(statuts).sort().forEach(d => { (parMois[d.slice(0,7)] = parMois[d.slice(0,7)] || []).push(d); });
  return { months: Object.keys(parMois).map(k => ({
    year: +k.slice(0,4), month: +k.slice(5,7), days: parMois[k].map(date => ({ date })),
    doctors: [{ id: 'ALPHA', days: parMois[k].map(d => ({ status: statuts[d] })) },
              { id: 'BETA',  days: parMois[k].map(() => ({ status: 'G' })) }] })), equiteInitiale: {} };
}

(async () => {
  const src = fs.readFileSync('../cloudflare/worker.js','utf8').replace('export default','globalThis.__W =');
  const wctx = vm.createContext({ globalThis:{}, console, crypto, TextEncoder, Response, Request, URL, JSON, Date, Math, Object, Array, String, Number, Set, Promise });
  wctx.globalThis = wctx; vm.runInContext(src, wctx);
  const WK = wctx.__W;
  const sha = async t => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const hash = await sha(CODE_MAR);

  async function ouvrir(cles) {
    const M = new Map();
    Object.keys(cles).forEach(k => M.set(k, JSON.stringify(cles[k])));
    M.set('acces', JSON.stringify({ indisposYear: AN, indisposOuverte: false, users: [
      { h: hash, role: 'mar', id: 'ALPHA', name: 'ALPHA', initials: 'AL', prenom: 'Test' }] }));
    const KV = { get: async k => (M.has(k)?M.get(k):null), put: async (k,v)=>{M.set(k,v);}, delete: async k=>{M.delete(k);},
      list: async ({prefix,limit}) => ({ keys:[...M.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit||1000).map(name=>({name})) }) };
    const env = { KV, PUSH_TOKEN: 'JETON' };
    const contenu = fs.readFileSync('../index.html', 'utf8');
    const gas = [], miroir = [], vues = [];
    const vc = new VirtualConsole(); const erreurs = [];
    vc.on('jsdomError', e => erreurs.push(e.message));
    const dom = new JSDOM(contenu, { runScripts:'dangerously', virtualConsole:vc,
      url:'https://planningmedic.github.io/index.html', pretendToBeVisual:true,
      beforeParse(win) {
        win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'portail.js'), 'utf8'));
        win.eval(fs.readFileSync(path.join(__dirname, '..', 'partage', 'rendu_equite.js'), 'utf8'));
        win.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        win.Element.prototype.scrollIntoView = function (o) { vues.push({ id: this.id, o }); };
        win.scrollTo = () => {}; win.scrollBy = () => {};
        try { win.sessionStorage.setItem('pmViewCode', CODE_MAR); } catch (e) {}
        win.navigator.sendBeacon = () => true;
        win.fetch = async (url, opt) => {
          const u = String(url);
          if (u.includes('workers.dev')) {
            try { miroir.push(JSON.parse(opt.body).keys || []); } catch (e) { miroir.push([]); }
            return WK.fetch(new Request('https://worker' + u.replace(/^https:\/\/[^/]+/, ''), { method:'POST', body: opt.body }), env);
          }
          let act = '(inconnue)'; try { act = JSON.parse(opt.body).action || act; } catch (e) {}
          gas.push(act);
          return { ok:true, json: async () => ({ success:false, error:'GAS indisponible dans le banc' }) };
        };
      } });
    await dodo(900);
    return { w: dom.window, gas, miroir, vues, erreurs };
  }

  const MOI = `${AN}-${p2(MOIS)}`;
  const statutsAn = {
    [`${MOI}-01`]: 'G', [`${MOI}-02`]: 'RG', [`${MOI}-03`]: 'G2', [`${MOI}-05`]: '18',
    [`${MOI}-08`]: 'V', [`${MOI}-09`]: 'TP', [`${AN}-01-10`]: 'G', [`${AN}-01-11`]: 'RG',
  };
  const plans = {
    [`planning_${AN}`]: planning(statutsAn),
    [`planning_${AN+1}`]: planning({ [`${AN+1}-01-04`]: 'G2' }),
    [`planning_${AN-1}`]: planning({ [`${AN-1}-06-15`]: 'G', [`${AN}-01-01`]: 'G', [`${AN}-01-02`]: 'RG' }),
  };
  const annees = { success:true, active: AN, annees:[{annee:AN-1, archivee:true},{annee:AN, archivee:false},{annee:AN+1, archivee:false}] };

  console.log('\n═══ 1. Ouverture : vue Année par défaut, centrée sur le mois en cours ═══');
  const { w, gas, miroir, vues, erreurs } = await ouvrir(Object.assign({ annees }, plans));
  const D = w.document, $ = s => D.querySelector(s), cas = d => D.querySelector(`#mgVueAnnee [data-date="${d}"]`);
  w.openMesGardes(); await dodo(120);
  V('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0,2));
  V('la vue Année est affichée', $('#mgVueAnnee').style.display === 'block');
  V('la liste est masquée', $('#mgVueListe').style.display === 'none');
  V('la carte « calendrier du téléphone » est visible dans la vue Année, au-dessus de la bascule', !!$('#agCarte') && !$('#mgVueListe #agCarte') && ($('#agCarte').compareDocumentPosition($('.mg-seg')) & 4) !== 0);
  V('le bouton « Année » est enfoncé', $('#mgSegAnnee').classList.contains('on') && $('#mgSegAnnee').getAttribute('aria-pressed') === 'true');
  V(`les années ${AN} et ${AN+1} sont affichées`, !!$('#mgaAn' + AN) && !!$('#mgaAn' + (AN+1)));
  V(`l'année archivée ${AN-1} n'est pas affichée d'office`, !$('#mgaAn' + (AN-1)));
  V(`un bouton propose « Afficher ${AN-1} »`, !!$('#mgaPlus') && $('#mgaPlus').textContent.trim() === 'Afficher ' + (AN-1), $('#mgaPlus') && $('#mgaPlus').textContent);
  V('12 mois par année affichée', D.querySelectorAll('#mgVueAnnee .mga-mois').length === 24, D.querySelectorAll('#mgVueAnnee .mga-mois').length);
  V('le mois en cours est marqué', $('#mga-' + MOI) && $('#mga-' + MOI).classList.contains('encours'));
  V('la vue se centre sur le mois en cours', vues.some(v => v.id === 'mga-' + MOI && v.o && v.o.block === 'center'), vues);

  console.log('\n═══ 2. Couleurs et marques des jours ═══');
  V('G → case Réa', cas(`${MOI}-01`).classList.contains('g'));
  V('G2 → case Mater/Bloc', cas(`${MOI}-03`).classList.contains('g2'));
  V('18 → case 18 h', cas(`${MOI}-05`).classList.contains('h18'));
  V('V → vacances (couleur de « Mes congés »)', cas(`${MOI}-08`).classList.contains('cat-vac'));
  V('TP → temps partiel', cas(`${MOI}-09`).classList.contains('cat-tp'));
  V('RG → case neutre (pas une garde)', !/\b(g|g2|h18)\b/.test(cas(`${MOI}-02`).className), cas(`${MOI}-02`).className);
  V("aujourd'hui est entouré", cas(AUJ_ISO).classList.contains('auj'));
  if (AUJ_ISO > `${AN}-01-10`) V('une garde passée est pâlie', cas(`${AN}-01-10`).classList.contains('passe') && cas(`${AN}-01-10`).classList.contains('g'));
  V('le mois en cours compte ses gardes (G + G2, pas les 18 h)', /2 G/.test($('#mga-' + MOI + ' .mga-mh').textContent), $('#mga-' + MOI + ' .mga-mh').textContent);
  V(`garde de l'année suivante visible (4 janv. ${AN+1})`, cas(`${AN+1}-01-04`).classList.contains('g2'));

  console.log("\n═══ 3. Totaux = planning de l'année, 1er janvier lu dans le planning d'avant ═══");
  V(`le 1er janvier ${AN} (planning ${AN-1}) apparaît en Réa`, cas(`${AN}-01-01`).classList.contains('g'));
  const tot = $('#mgaAn' + AN + ' .mga-tot').textContent;
  V(`totaux ${AN} : 2 Réa, 1 Mater/Bloc, 1 × 18 h (le 1er janvier compte en ${AN-1})`, /2 Réa/.test(tot) && /1 Mater\/Bloc/.test(tot) && /1 × 18 h/.test(tot), tot);

  console.log("\n═══ 4. Agrandir un mois ═══");
  w.mgaBasculerMois(MOI); await dodo(20);
  V('un appui agrandit le mois', $('#mga-' + MOI).classList.contains('ouvert'));
  V('la case dit le nom de la garde', cas(`${MOI}-01`).querySelector('small') && cas(`${MOI}-01`).querySelector('small').textContent === 'Réa');
  V('un seul mois agrandi à la fois', D.querySelectorAll('.mga-mois.ouvert').length === 1);
  w.mgaBasculerMois(MOI); await dodo(20);
  V('un second appui le referme', !$('#mga-' + MOI).classList.contains('ouvert'));

  console.log('\n═══ 5. Bascule vers la liste, puis retour par défaut ═══');
  w.mgVue('liste'); await dodo(20);
  V('Liste : la liste est affichée et la vue Année masquée', $('#mgVueListe').style.display === 'block' && $('#mgVueAnnee').style.display === 'none');
  V('la liste montre toujours les gardes à venir', D.querySelectorAll('#mesGardesList .staff-card').length >= 1);
  V('la carte « calendrier du téléphone » est hors des deux vues : visible en Liste', !!$('#agCarte') && !$('#mgVueListe #agCarte') && !$('#mgVueAnnee #agCarte'));
  w.backToHome(); await dodo(20); w.openMesGardes(); await dodo(80);
  V('à la réouverture, retour sur la vue Année', $('#mgVueAnnee').style.display === 'block' && $('#mgSegAnnee').classList.contains('on'));

  console.log('\n═══ 6. Remonter dans le temps ═══');
  await w.mgaAfficherAnnee(AN - 1); await dodo(30);
  V(`${AN-1} est affichée au-dessus`, !!$('#mgaAn' + (AN-1)) && D.getElementById('mgVueAnnee').innerHTML.indexOf('mgaAn' + (AN-1)) < D.getElementById('mgVueAnnee').innerHTML.indexOf('mgaAn' + AN));
  V(`sa garde de juin est visible`, cas(`${AN-1}-06-15`).classList.contains('g'));
  V("plus d'année plus ancienne : le bouton disparaît", !$('#mgaPlus'));
  V('aucun appel au serveur lent pour un planning', !gas.includes('getPlanningJson'), gas);
  V('le planning archivé a été lu par la copie rapide', miroir.some(k => k.includes(`planning_${AN-1}`)), miroir);

  console.log("\n═══ 7. Contre-preuve : année non servie = aucune lecture à l'aveugle ═══");
  {
    const anneesSans = { success:true, active: AN, annees:[{annee:AN},{annee:AN+1}] };
    const b = await ouvrir({ annees: anneesSans, [`planning_${AN}`]: plans[`planning_${AN}`], [`planning_${AN+1}`]: plans[`planning_${AN+1}`] });
    const avant = b.miroir.length;
    b.w.openMesGardes(); await dodo(120);
    V('pas de bouton « Afficher … » sans année plus ancienne', !b.w.document.getElementById('mgaPlus'));
    V(`aucune lecture de planning_${AN-1} (non servie)`, !b.miroir.slice(avant).some(k => k.includes(`planning_${AN-1}`)), b.miroir.slice(avant));
    V('aucun appel au serveur lent', !b.gas.includes('getPlanningJson'), b.gas);
    V('aucune erreur JavaScript', b.erreurs.length === 0, b.erreurs.slice(0,2));
  }

  console.log(`\n  ${ok} ✓  ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
