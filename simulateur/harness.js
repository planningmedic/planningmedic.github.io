// ═══ BANC D'ESSAI — exécute le VRAI generateur_gardes.gs dans Node ═══
const fs = require('fs');
const vm = require('vm');

// ── Faux Google Sheets en mémoire ──────────────────────────────────────
function makeSheet(name, rows) {
  const self = {
    _name: name, _rows: rows || [],
    getName: () => name,
    getDataRange: () => ({ getValues: () => self._rows.map(r => r.slice()) }),
    getLastRow: () => self._rows.length,
    getLastColumn: () => Math.max(0, ...self._rows.map(r => r.length)),
    getRange: (r, c, nr, nc) => {
      /* (14/08/2026) Chaque méthode renvoie LE RANGE LUI-MÊME : la production
         enchaîne désormais setNumberFormat('@').setValues(...) — le format
         AVANT l'écriture, seul ordre qui empêche la coercition de dates du
         vrai Sheets. L'ancien `chain()` générique perdait le setValues réel
         et l'écriture devenait silencieusement un no-op. */
      const rng = {};
      rng.setValues = (vals) => {
        for (let i = 0; i < vals.length; i++) {
          while (self._rows.length < r - 1 + i + 1) self._rows.push([]);
          const row = self._rows[r - 1 + i];
          for (let j = 0; j < vals[i].length; j++) row[c - 1 + j] = vals[i][j];
        }
        return rng;
      };
      rng.setValue = (v) => { while (self._rows.length < r) self._rows.push([]); self._rows[r-1][c-1] = v; return rng; };
      rng.getValues = () => { const out=[]; for(let i=0;i<(nr||1);i++){const row=self._rows[r-1+i]||[];const o=[];for(let j=0;j<(nc||1);j++)o.push(row[c-1+j]);out.push(o);} return out; };
      ['merge','breakApart','mergeAcross','setBackgrounds','setFontColors','setFontWeights',
       'setNumberFormats','setHorizontalAlignments','setNotes','setNote',
       'setDataValidation','clearDataValidations','setTextRotation','setVerticalAlignment',
       'setFontWeight','setBackground','setFontColor',
       'setHorizontalAlignment','setNumberFormat','setBorder','setFontSize','setWrap']
        .forEach(m => { rng[m] = () => rng; });
      return rng;
    },
    setFrozenRows: chain, setFrozenColumns: chain, setColumnWidth: chain, setColumnWidths: chain,
    autoResizeColumns: chain, hideSheet: chain, appendRow: (r)=>{self._rows.push(r);return chain();},
    clear: () => { self._rows = []; return chain(); },
  };
  // Chainage tolerant : le generateur enchaine les appels cosmetiques
  // (setFontColor().setFontWeight().setFontSize().setVerticalAlignment()...).
  // Lister ces methodes une par une condamnait le banc d'essai a casser des qu'une
  // nouvelle etait utilisee — c'est arrive avec setVerticalAlignment (16/07/2026),
  // et PLUS AUCUN scenario ne tournait. Le Proxy accepte n'importe quel nom et se
  // rechaine : la mise en forme n'a de toute facon aucun effet sur les resultats.
  function chain(){
    return new Proxy({}, { get: (t, p) => {
      if (p === 'getValues') return () => [[]];
      if (p === 'getValue')  return () => '';
      if (typeof p === 'symbol') return undefined;
      return () => chain();
    }});
  }
  return self;
}

function makeSpreadsheet(sheets) {
  const map = {};
  (sheets || []).forEach(sh => { map[sh._name] = sh; });
  return {
    getSheetByName: (n) => map[n] || null,
    insertSheet: (n) => { const sh = makeSheet(n, []); map[n] = sh; return sh; },
    deleteSheet: (sh) => { delete map[sh._name]; },
    getSheets: () => Object.values(map),
    _map: map,
  };
}

// ── Contexte GAS ───────────────────────────────────────────────────────
/* (01/09/2026) `genSource` : contenu de remplacement pour generateur_gardes.gs.
   Sert aux CONTRE-PREUVES du banc — rejouer un scénario sur une copie du
   générateur privée du correctif, pour vérifier que le test échoue bien sans
   lui. Sans ce paramètre, la copie devrait être chargée dans un contexte qui
   contient déjà le générateur du dépôt : les constantes de premier niveau
   entrent en collision et rien ne tourne. Omis = comportement inchangé. */
function buildContext(ss, logs, genSource) {
  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => { throw new Error('archives inaccessibles (simulation)'); },
      BorderStyle: { SOLID: 1, SOLID_MEDIUM: 2, SOLID_THICK: 3, DASHED: 4, DOTTED: 5, DOUBLE: 6 },
      WrapStrategy: { WRAP: 1, CLIP: 2, OVERFLOW: 3 },
    },
    Logger: { log: (m) => logs.push(String(m)) },
    Utilities: { formatDate: (d) => String(d) },
    SpreadsheetApp_BorderStyle: null,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* (13/08/2026) Chemins RELATIFS au fichier : les chemins absolus d'un
     environnement de travail ne tournaient ailleurs que par coïncidence.
     Depuis que le banc (banc_liens_r.js) s'appuie sur ce harnais, il doit
     fonctionner partout. */
  const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'code.gs'), 'utf8');
  const gen  = genSource !== undefined && genSource !== null
    ? genSource
    : fs.readFileSync(path.join(__dirname, '..', 'gas', 'generateur_gardes.gs'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'code.gs' });
  vm.runInContext(gen, ctx, { filename: 'generateur_gardes.gs' });
  return ctx;
}

// ── Générateur de données synthétiques ─────────────────────────────────
// Effectif réaliste : ~20 MARs de garde, quotités variées, flags.
function defaultRoster() {
  // [id, pct_gardes, quotite, {noGarde,only18,noWeekend,r2s2,souhaitPlafond,dateDebut,dateFin}]
  return [
    ['ALBOUY',100,100,{}], ['ARMANDO',100,100,{}], ['BONNET',0,100,{noGarde:1}],
    ['BOUREGBA',0,100,{noGarde:1}], ['CATINEAU',100,100,{}], ['DURAND',100,100,{}],
    ['FERRIERO',100,100,{}], ['GHIGLIONE',100,100,{}], ['GUERIN',100,100,{}],
    ['LEVASSEUR',100,100,{}], ['LEY',90,90,{}], ['MENADE',100,100,{}],
    ['OPPRECHT',100,100,{}], ['PARTOUCHE',100,100,{}], ['ROUSSEAU',100,100,{}],
    ['SALA',100,100,{}], ['SEVERAC',100,100,{}], ['SULTAN',100,100,{}],
    ['SUPLY',100,100,{}], ['WIDEHEM',100,100,{}], ['ZAMARON',100,100,{}],
    ['PRUNET',100,100,{noWeekend:1,souhaitPlafond:1}],
    ['COPELOVICI',50,50,{r2s2:1}],
    ['ARMAND',100,100,{dateDebut:'2026-11-01'}],
  ];
}

function medecinsRows(roster) {
  const rows = [['ID','NOM','INITIALES','?','QUOTITE','PCT_GARDES','CODE','EMAIL','DECT','DATE_DEBUT','DATE_FIN','NO_GARDE','ONLY_18','NO_WEEKEND','RYTHME_2_2','SOUHAIT_PLAFOND','TP_JOURS']];
  roster.forEach(([id,p,q,f]) => rows.push([id,'DR '+id,id.slice(0,2),'',q,p,'XXXXXXXX','','',
    f.dateDebut||'', f.dateFin||'', f.noGarde?'O':'', f.only18?'O':'', f.noWeekend?'O':'', f.r2s2?'O':'', f.souhaitPlafond?'O':'', f.tpJours||'']));
  return rows;
}

// INDISPOS : ligne 0 = mois "Janvier 2027"…, ligne 2 = numéros de jour, r>=3 = MARs.
function indisposRows(year, roster, indisposMap) {
  const dates = [];
  const d0 = new Date(year,0,1,12), d1 = new Date(year,11,31,12);
  // couvrir aussi janvier N+1 (début de planning décalé) : jusqu'au 10 janvier N+1
  const dEnd = new Date(year+1,0,10,12);
  for (const dt=new Date(d0); dt<=dEnd; dt.setDate(dt.getDate()+1)) dates.push(new Date(dt));
  const row0=[''], row1=[''], row2=[''];
  const MOIS=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  let lastM=-1;
  dates.forEach(dt=>{
    const key=dt.getFullYear()*100+dt.getMonth();
    row0.push(key!==lastM ? `${MOIS[dt.getMonth()]} ${dt.getFullYear()}` : '');
    lastM=key;
    row1.push('');
    row2.push(dt.getDate());
  });
  const rows=[row0,row1,row2];
  roster.forEach(([id])=>{
    const r=[id];
    dates.forEach(dt=>{
      const ds=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      r.push((indisposMap[id]&&indisposMap[id][ds])||'');
    });
    rows.push(r);
  });
  return rows;
}

// PERIODES_VAC minimal (isVacancesScolaires)
function periodesRows(year){
  return [['NOM','DEBUT','FIN'],
    ['Hiver',`${year}-02-07`,`${year}-02-23`],['Printemps',`${year}-04-04`,`${year}-04-20`],
    ['Été',`${year}-07-04`,`${year}-08-31`],['Toussaint',`${year}-10-17`,`${year}-11-02`],
    ['Noël',`${year}-12-19`,`${year+1}-01-04`]];
}

// ── Lancement d'un scénario ────────────────────────────────────────────
function runScenario({year, roster, indisposMap, extraSheets, statsPrev}) {
  roster = roster || defaultRoster();
  indisposMap = indisposMap || {};
  const sheets = [
    makeSheet('MEDECINS', medecinsRows(roster)),
    makeSheet(`INDISPOS_${year}`, indisposRows(year, roster, indisposMap)),
    makeSheet('PERIODES_VAC', periodesRows(year)),
    makeSheet('CONFIG', [['CLE','VALEUR']]),
  ].concat(extraSheets||[]);
  if (statsPrev) sheets.push(makeSheet(`STATS_GARDES_${year-1}`, statsPrev));
  const ss = makeSpreadsheet(sheets);
  const logs = [];
  const ctx = buildContext(ss, logs);
  let error = null;
  try { ctx.generateGardes(year); } catch(e){ error = e.message; }
  return { ss, logs, error, ctx };
}

// ── Extraction des résultats ───────────────────────────────────────────
function readGardes(ss, year) {
  const sh = ss.getSheetByName(`GARDES_${year}`);
  if (!sh) return null;
  const rows = sh._rows;
  // format : lignes 1-3 en-têtes (dates), ligne "GARDE 24H" etc. → relire STATS plutôt
  return rows;
}
function readStats(ss, year) {
  const sh = ss.getSheetByName(`STATS_GARDES_${year}`);
  if (!sh) return null;
  const rows = sh._rows;
  const hdr = rows[0].map(h=>String(h));
  const out = {};
  for (let r=1;r<rows.length;r++){
    const id=String(rows[r][0]||'').trim(); if(!id) continue;
    const o={}; hdr.forEach((h,i)=>o[h]=rows[r][i]);
    out[id]=o;
  }
  return { hdr, byId: out };
}

module.exports = { makeSheet, makeSpreadsheet, buildContext, defaultRoster, medecinsRows, indisposRows, periodesRows, runScenario, readGardes, readStats };

// Exécution directe : scénario de base 2027
if (require.main === module) {
  const t0=Date.now();
  const {ss, logs, error} = runScenario({year: 2027});
  console.log('erreur :', error);
  console.log('durée :', Date.now()-t0, 'ms');
  const stats = readStats(ss, 2027);
  if (stats) {
    console.log('MARs dans STATS :', Object.keys(stats.byId).length);
    const s = stats.byId;
    const line = id => { const o=s[id]; return `${id.padEnd(10)} cible=${(+o['CIBLE']).toFixed(1).padStart(5)} réel=${String(o['TOTAL G']).padStart(3)} sam=${o['SAM']} jeu=${o['JEU']} vd=${o['VD']} jf=${o['JF']} G=${o['G (REA)']} G2=${o['G2 (MAT)']}`; };
    Object.keys(s).forEach(id => console.log(line(id)));
  }
  console.log('warnings :', logs.filter(l=>/⚠|Manque|exception|repli/.test(l)).slice(0,8));
}
