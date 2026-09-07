/* ═══ BANC — LES VACANCES ESTIMÉES ONT LA FORME DES VRAIES (27/08/2026) ═══
   Quand l'arrêté du ministère n'est pas publié, proposerVacances pose des
   repères estimés. Avant le 27/08, ces repères étaient des dates fixes qui
   tombaient un jour différent chaque année (le repère Hiver du 08/02 : un
   mardi en 2028) — alors que toutes les vraies périodes commencent un SAMEDI
   et finissent un DIMANCHE (sauf l'été, fin forcée au 31/08).
   Ici : API muette → tout est estimé → la forme samedi→dimanche est exigée
   sur six années ; puis API partielle → les périodes de l'API gardent leurs
   dates, les estimées restantes gardent la forme. */
const fs = require('fs'), vm = require('vm');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d).slice(0,200) : '')); } };

function monter(reponseApi) {
  const ctx = vm.createContext({ console, JSON, Date, Math, Object, Array, String, Number,
    Logger: { log(){} },
    toDateStr: d => { const p = n => String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); },
    Utilities: { formatDate: (d,tz,f) => { const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); } },
    UrlFetchApp: { fetch: (url) => ({ getResponseCode: () => reponseApi ? 200 : 500,
      getContentText: () => JSON.stringify(reponseApi || {}) }) },
    SpreadsheetApp: {}
  });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync('../gas/setup_annee.gs','utf8'), ctx);
  return ctx;
}
const DOW = ds => new Date(ds + 'T12:00:00').getDay();   // 6 = samedi, 0 = dimanche

console.log('— API muette : six années, tout estimé, forme samedi→dimanche —');
{
  const ctx = monter(null);
  let toutBon = true, detail = [];
  for (let an = 2028; an <= 2033; an++) {
    const p = ctx.proposerVacances(an);
    if (p.length !== 5) { toutBon = false; detail.push(an + ': ' + p.length + ' périodes'); }
    p.forEach(x => {
      if (!x.estime) { toutBon = false; detail.push(an + ' ' + x.nom + ' non estimée ?'); }
      if (DOW(x.debut) !== 6) { toutBon = false; detail.push(an + ' ' + x.nom + ' début ' + x.debut); }
      if (x.nom === 'Été') {
        if (!String(x.fin).endsWith('-08-31')) { toutBon = false; detail.push(an + ' été fin ' + x.fin); }
      } else if (DOW(x.fin) !== 0) { toutBon = false; detail.push(an + ' ' + x.nom + ' fin ' + x.fin); }
    });
    const noel = p.find(x => x.nom === 'Noël');
    if (noel && !String(noel.fin).startsWith(String(an + 1))) { toutBon = false; detail.push(an + ' Noël finit ' + noel.fin); }
  }
  V('30 périodes estimées sur 6 années : début samedi, fin dimanche (été : 31/08)', toutBon, detail);
  const p28 = ctx.proposerVacances(2028);
  const h = p28.find(x => x.nom === 'Hiver');
  V('le repère Hiver 2028 (08/02, un mardi) est accroché au samedi le plus proche', h && h.debut === '2028-02-05', h && h.debut);
  V('et sa fin est le dimanche quinze jours plus tard', h && h.fin === '2028-02-20' && DOW(h.fin) === 0, h && h.fin);
}

console.log('— API partielle : les vraies dates gagnent, les estimées gardent la forme —');
{
  const rep = { results: [
    { description: 'Vacances d\'Hiver', start_date: '2028-02-12', end_date: '2028-02-28',
      zones: 'Zone B', annee_scolaire: '2027-2028' }
  ] };
  const ctx = monter(rep);
  const p = ctx.proposerVacances(2028);
  const h = p.find(x => x.nom === 'Hiver');
  V('l\'Hiver vient de l\'API, dates intactes (fin = veille de la reprise)', h && h.estime === false && h.debut === '2028-02-12' && h.fin === '2028-02-27', h);
  const autres = p.filter(x => x.nom !== 'Hiver');
  V('les quatre autres restent estimées, début samedi', autres.length === 4 && autres.every(x => x.estime && DOW(x.debut) === 6), autres.map(x=>x.nom+' '+x.debut));
}

console.log(`\n${ok} OK · ${ko} en échec`);
process.exit(ko ? 1 : 0);
