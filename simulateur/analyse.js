// ═══ SUITE D'ANALYSE — invariants + scénarios sur le VRAI générateur ═══
const H = require('./harness.js');

// ── Reconstruction du planning depuis l'onglet GARDES écrit ────────────
function parsePlanning(ss, year) {
  const sh = ss.getSheetByName(`GARDES_${year}`);
  const rows = sh._rows;
  // reconstruire les dates depuis row1 (mois fusionnés → 1re cellule) + row3 (jours)
  // plus robuste : recomposer via getPremierJourPlanning côté JS
  const j1=new Date(year,0,1),d1=j1.getDay(),o1=d1===1?7:d1===0?1:8-d1;
  const start=new Date(year,0,1+o1,12);
  const j1n=new Date(year+1,0,1),d1n=j1n.getDay(),on=d1n===1?7:d1n===0?1:8-d1n;
  const end=new Date(new Date(year+1,0,1+on,12).getTime()-86400000);
  const dates=[];
  for(const dt=new Date(start);dt<=end;dt.setDate(dt.getDate()+1))
    dates.push(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`);
  const byDoc={}, byDate={};
  dates.forEach(d=>byDate[d]={G:null,G2:null,RG:[],R:[],h18:null});
  for(let r=3;r<rows.length;r++){
    const id=String(rows[r][0]||'').trim(); if(!id) continue;
    byDoc[id]={};
    dates.forEach((d,i)=>{
      const v=String(rows[r][i+1]||'').trim();
      if(v) byDoc[id][d]=v;
      if(v==='G') byDate[d].G=id;
      if(v==='G2') byDate[d].G2=id;
      if(v==='RG') byDate[d].RG.push(id);
      if(v==='R') byDate[d].R.push(id);
      if(v==='18') byDate[d].h18=id;
    });
  }
  return {dates, byDoc, byDate};
}

const DOW = ds => new Date(ds+'T12:00:00').getDay();
const addD = (ds,n)=>{const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

// ── Vérificateur d'invariants ──────────────────────────────────────────
function checkInvariants(P, {indisposMap={}, ctxFeries, roster}) {
  const errs=[], warns=[];
  const flags={}; (roster||H.defaultRoster()).forEach(([id,p,q,f])=>flags[id]=f||{});
  const feries = ctxFeries; // Set de dates fériées (année + N+1)

  // 1. Chaque jour a exactement 1 G et 1 G2, distincts
  P.dates.forEach(d=>{
    const s=P.byDate[d];
    if(!s.G||!s.G2) errs.push(`JOUR SANS BINOME ${d} G=${s.G} G2=${s.G2}`);
    else if(s.G===s.G2) errs.push(`G=G2 ${d} ${s.G}`);
  });
  // 2. Jamais 2 gardes consécutives ; RG le lendemain de chaque garde
  Object.entries(P.byDoc).forEach(([id,days])=>{
    Object.keys(days).forEach(d=>{
      if(days[d]==='G'||days[d]==='G2'){
        const nx=addD(d,1);
        if(days[nx]==='G'||days[nx]==='G2') errs.push(`GARDES CONSECUTIVES ${id} ${d}→${nx}`);
        if(P.byDate[nx] && days[nx]!=='RG' && days[nx]!==undefined && days[nx]!=='') {
          // le lendemain devrait être RG (sauf hors planning)
          if(days[nx]!=='RG') warns.push(`RG MANQUANT ${id} après ${d} (=${days[nx]||'vide'})`);
        }
      }
    });
  });
  // 3. VD : binôme identique vendredi et dimanche, mêmes rôles
  P.dates.forEach(d=>{
    if(DOW(d)!==5) return;
    const sun=addD(d,2); if(!P.byDate[sun]) return;
    const f=P.byDate[d], s=P.byDate[sun];
    if(f.G!==s.G||f.G2!==s.G2) errs.push(`VD BRISÉ ${d}/${sun} : ${f.G}+${f.G2} vs ${s.G}+${s.G2}`);
  });
  // 4. Couplages fériés jeudi/lundi ↔ samedi : même binôme
  P.dates.forEach(d=>{
    if(!feries.has(d)) return;
    const dw=DOW(d);
    if(dw===4){const sat=addD(d,2);
      if(P.byDate[sat]&&(P.byDate[d].G!==P.byDate[sat].G||P.byDate[d].G2!==P.byDate[sat].G2))
        errs.push(`COUPLAGE JS BRISÉ ${d}/${sat}`);}
    if(dw===1){const sat=addD(d,-2);
      if(P.byDate[sat]&&(P.byDate[d].G!==P.byDate[sat].G||P.byDate[d].G2!==P.byDate[sat].G2))
        errs.push(`COUPLAGE SL BRISÉ ${sat}/${d}`);}
  });
  // 5. Indispos respectées
  Object.entries(P.byDoc).forEach(([id,days])=>{
    Object.keys(days).forEach(d=>{
      if((days[d]==='G'||days[d]==='G2') && indisposMap[id] && ['INDISPO','VAC','FORM','TP','CL','CTP'].includes(indisposMap[id][d]))
        errs.push(`GARDE SUR INDISPO ${id} ${d} (${indisposMap[id][d]})`);
    });
  });
  // 6. NO_WEEKEND / NO_GARDE respectés
  Object.entries(P.byDoc).forEach(([id,days])=>{
    const f=flags[id]||{};
    Object.keys(days).forEach(d=>{
      if(days[d]!=='G'&&days[d]!=='G2') return;
      if(f.noGarde) errs.push(`NO_GARDE VIOLÉ ${id} ${d}`);
      if(f.noWeekend&&(DOW(d)===0||DOW(d)===6||feries.has(d))) errs.push(`NO_WEEKEND VIOLÉ ${id} ${d}`);
      if(f.dateDebut&&d<f.dateDebut) errs.push(`AVANT DATE_DEBUT ${id} ${d}`);
      if(f.dateFin&&d>=f.dateFin) errs.push(`APRÈS DATE_FIN ${id} ${d}`);
    });
  });
  // 7. Combo jeudi (non férié) → samedi interdit
  Object.entries(P.byDoc).forEach(([id,days])=>{
    Object.keys(days).forEach(d=>{
      if((days[d]==='G'||days[d]==='G2')&&DOW(d)===4&&!feries.has(d)){
        const sat=addD(d,2);
        if(days[sat]==='G'||days[sat]==='G2') errs.push(`COMBO JEU-SAM ${id} ${d}`);
      }
    });
  });
  // 8. Espacement : compter les paires à J±2 (pénalisées, pas interdites)
  let pairsJ2=0;
  Object.entries(P.byDoc).forEach(([id,days])=>{
    Object.keys(days).forEach(d=>{
      if(days[d]==='G'||days[d]==='G2'){
        const d2=addD(d,2);
        if((days[d2]==='G'||days[d2]==='G2') && !(DOW(d)===5&&DOW(d2)===0)) pairsJ2++;
      }
    });
  });
  return {errs, warns, pairsJ2};
}

// ── Statistiques d'équité ──────────────────────────────────────────────
function equityStats(ss, year, roster) {
  const st=H.readStats(ss,year);
  const flags={}; (roster||H.defaultRoster()).forEach(([id,p,q,f])=>flags[id]=f||{});
  const active=Object.keys(st.byId).filter(id=>+st.byId[id]['TOTAL G']>0);
  const noWE=active.filter(id=>!flags[id].noWeekend);
  const g=k=>id=>+st.byId[id][k];
  const cible=id=>parseFloat(String(st.byId[id]['CIBLE']).replace("'",''));
  const spread=(ids,k)=>{const v=ids.map(g(k));return {min:Math.min(...v),max:Math.max(...v),spread:Math.max(...v)-Math.min(...v)};};
  const devTotal=active.map(id=>({id,dev:+st.byId[id]['TOTAL G']-cible(id)})).sort((a,b)=>b.dev-a.dev);
  return {
    total: spread(active,'TOTAL G'), sam: spread(noWE,'SAM'), jeu: spread(active,'JEU'),
    vd: spread(noWE,'VD'), jf: spread(noWE,'JF'), vjf: spread(active,'VEILLE JF'),
    ggap: Math.max(...active.map(id=>Math.abs(g('G (REA)')(id)-g('G2 (MAT)')(id)))),
    devTotal, st,
  };
}

module.exports = { parsePlanning, checkInvariants, equityStats, DOW, addD };

// ── Scénario 1 : année 2027 nominale ───────────────────────────────────
if (require.main === module) {
  const year=2027;
  const {ss, logs, error, ctx} = H.runScenario({year});
  if(error){ console.log('ERREUR:',error); process.exit(1); }
  const P=parsePlanning(ss,year);
  const feries=new Set([...ctx.getJoursFeries(year), ...ctx.getJoursFeries(year+1)]);
  const inv=checkInvariants(P,{ctxFeries:feries});
  const eq=equityStats(ss,year);
  console.log('══ SCÉNARIO 1 — 2027 nominal (0 indispo) ══');
  console.log('Invariants :', inv.errs.length? inv.errs.slice(0,10) : '✅ tous respectés');
  console.log('RG warnings:', inv.warns.length, '| paires J±2 :', inv.pairsJ2);
  console.log('Écarts — total:',JSON.stringify(eq.total),'sam:',JSON.stringify(eq.sam),'jeu:',JSON.stringify(eq.jeu));
  console.log('       — vd:',JSON.stringify(eq.vd),'jf:',JSON.stringify(eq.jf),'vjf:',JSON.stringify(eq.vjf),'| max|G-G2|:',eq.ggap);
  console.log('Top dérives vs cible :', eq.devTotal.slice(0,3).map(x=>`${x.id}:${x.dev.toFixed(1)}`).join(' '), '…', eq.devTotal.slice(-3).map(x=>`${x.id}:${x.dev.toFixed(1)}`).join(' '));
  console.log('Warnings générateur :', logs.filter(l=>/Manque|exception|repli|<2/.test(l)));
}
