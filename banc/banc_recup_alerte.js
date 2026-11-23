/* ═══ BANC — RÉCUP POSÉE À LA MAIN : ALERTE NON BLOQUANTE SI LE JOUR N'EST PLUS VERT ═══
   Demande du responsable (23/11/2026) : un MAR demande à déplacer sa récup de
   samedi. Le comité le fait dans l'onglet Statuts (effacer l'ancien R, poser le
   nouveau). Le portail ne place lui-même une récup que sur un jour qui reste
   vert (≥ SEUIL_CONFORT postables après la pose) ; à la main, rien ne prévenait.
   Désormais : la pose se fait TOUJOURS (non bloquant), et un bandeau ambre dit
   combien de postables restent si le jour passe sous le vert.

   Compte des postables : comme le serveur (RECUP_ABSENTS) — hors effectif exclu,
   repos de garde absent, demi-journée de vacances présente, garde/18 h présents.

   CONTRE-ÉPREUVE : la version d'admin.html d'avant (commit 549e2b6) est rejouée ;
   elle ne doit produire aucun bandeau. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const V = (t, c, d) => { if (c) { ok++; console.log('  ✓ ' + t); } else { ko++; console.log('  ✗ ' + t + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); } };
const dodo = ms => new Promise(r => setTimeout(r, ms));
const RACINE = path.join(__dirname, '..');

async function monter(html) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
    url: 'https://planningmedic.github.io/admin.html', pretendToBeVisual: true,
    beforeParse(win) {
      win.eval(fs.readFileSync(path.join(RACINE, 'partage', 'portail.js'), 'utf8'));
      win.eval(fs.readFileSync(path.join(RACINE, 'partage', 'rendu_equite.js'), 'utf8'));
    },
  });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = function () {};
  w.requestAnimationFrame = f => setTimeout(f, 0);
  try { w.eval(fs.readFileSync(path.join(RACINE, 'partage', 'dispo_jour.js'), 'utf8')); } catch (e) {}
  await dodo(300);
  w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, applied: [] }), text: async () => '{"success":true}' });
  // 18 MAR fictifs + 1 hors effectif (le chef, en joker). Jeudi 11/03/2027, lundi 08/03.
  w.eval(`
    ADMIN_CODE = 'X'; ADMIN_YEAR = 2027; ADMIN_YEAR_READONLY = false;
    marData = [];
    for (let i = 1; i <= 18; i++) marData.push({ id: 'M' + String(i).padStart(2, '0'), actif: true });
    marData.push({ id: 'CHEF', actif: true, horsEffectif: true });
    STAT.year = 2027; STAT.days = statBuildDays(2027); STAT.view = 'mar'; STAT.monthKey = '2027-03';
    STAT.feries = new Set(['2027-05-13']);
    STAT.gardes = {
      // 11/03 : 2 RG, 1 F, 1 TP, 1 VM (présente), 1 G, 1 18 → 18 − 4 = 14 postables avant la récup
      '2027-03-11': { M01: 'RG', M02: 'RG', M03: 'F', M04: 'TP', M05: 'VM', M06: 'G', M07: '18' },
      // 08/03 : 1 RG → 17 postables avant
      '2027-03-08': { M01: 'RG' },
    };
    toast = function () {};
  `);
  return w;
}
async function poserR(w, mar, dates) {
  w.eval(`STAT.marId = '${mar}'; STAT.selected = new Set(${JSON.stringify(dates)});`);
  await w.eval(`statApply('R')`);
  await dodo(30);
}
const alerte = w => w.eval(`JSON.stringify(STAT.alerteR || null)`);
const bandeau = w => { const el = w.document.getElementById('statAlerteR'); return el ? el.textContent.replace(/\s+/g, ' ') : ''; };

(async () => {
  console.log('\n═══ RÉCUP POSÉE À LA MAIN — ALERTE SI LE JOUR N\'EST PLUS VERT ═══');
  const w = await monter(fs.readFileSync(path.join(RACINE, 'admin.html'), 'utf8'));

  V('compte des postables comme le serveur (11/03 : RG, F, TP absents ; VM, G, 18 présents ; chef exclu)',
    w.eval(`statPostables('2027-03-11')`) === 14, w.eval(`statPostables('2027-03-11')`));

  await poserR(w, 'M10', ['2027-03-11']);
  V('pose sur un jour pas vert : la récup est QUAND MÊME posée (non bloquant)', w.eval(`STAT.gardes['2027-03-11'].M10`) === 'R');
  V('… l\'alerte dit 13 postables après la pose', alerte(w) === JSON.stringify([{ date: '2027-03-11', n: 13 }]), alerte(w));
  V('… le bandeau s\'affiche en haut de l\'onglet', /11\/03/.test(bandeau(w)) && /13/.test(bandeau(w)) && /plus vert/.test(bandeau(w)), bandeau(w));

  w.eval(`statAlerteFermer()`);
  V('bouton OK : le bandeau disparaît', bandeau(w) === '' && alerte(w) === 'null', bandeau(w));

  await poserR(w, 'M11', ['2027-03-08']);
  V('pose sur un jour qui reste vert (17 → 16) : aucune alerte', alerte(w) === '[]' && bandeau(w) === '', alerte(w));

  w.eval(`STAT.gardes['2027-03-09'] = { M01: 'RG', M02: 'V' }`);   // 16 avant → 15 après : reste vert
  await poserR(w, 'M12', ['2027-03-09']);
  V('pile au seuil vert après la pose (15) : aucune alerte', alerte(w) === '[]', alerte(w));

  w.eval(`STAT.gardes['2027-03-10'] = { M01: 'RG', M02: 'V', M03: 'V' }`);   // 15 avant → 14 après
  await poserR(w, 'M13', ['2027-03-15', '2027-03-10', '2027-03-13']);
  V('plusieurs jours : seul le jour passé sous le vert est signalé (week-end ignoré)',
    alerte(w) === JSON.stringify([{ date: '2027-03-10', n: 14 }]), alerte(w));

  w.eval(`STAT.selected = new Set(['2027-03-11']); STAT.marId = 'M10';`);
  await w.eval(`statApply('')`);
  await dodo(30);
  V('un autre geste (effacer) referme l\'alerte précédente', alerte(w) === 'null' && bandeau(w) === '', alerte(w));

  w.eval(`STAT.gardes['2027-03-12'] = { M01: 'RG', M02: 'RG', M03: 'V', M04: 'V' }`);
  w.eval(`STAT.selected = new Set(['2027-03-12']); STAT.marId = 'M14';`);
  await w.eval(`statApply('V')`);
  await dodo(30);
  V('poser des vacances (pas une récup) : jamais d\'alerte de récup', alerte(w) === 'null', alerte(w));

  console.log('\n═══ CONTRE-ÉPREUVE — admin.html d\'avant (549e2b6) ═══');
  let ancien = null;
  try { ancien = execSync('git show 549e2b6:admin.html', { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) {}
  if (!ancien) { V('contre-épreuve : version d\'avant introuvable (cloner AVEC l\'historique)', false); }
  else {
    const w0 = await monter(ancien);
    await poserR(w0, 'M10', ['2027-03-11']);
    V('ancienne version : la récup est posée sans aucun bandeau (le défaut corrigé)',
      w0.eval(`STAT.gardes['2027-03-11'].M10`) === 'R' && bandeau(w0) === '' && alerte(w0) === 'null', alerte(w0));
  }

  console.log(`\n${ok} ✓ · ${ko} ✗`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
