const H = require('./harness.js');
const A = require('./analyse.js');

// ── S11 : chaîne 2027→2028→2029→2030 avec inéquité initiale — convergence ? ──
let prev=null, inject=true;
[2027,2028,2029,2030].forEach(y=>{
  const res=H.runScenario({year:y, statsPrev:prev});
  const st=res.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(r=>r.slice());
  const hdr=st[0].map(String); const iSam=hdr.indexOf('SAM');
  const s=H.readStats(res.ss,y).byId;
  console.log(`${y} : SULTAN sam=${s['SULTAN']['SAM']} SUPLY sam=${s['SUPLY']['SAM']} (cible ${s['SULTAN']['CIBLE SAM']}) — écart max sam=${Math.max(...Object.keys(s).filter(id=>+s[id]['TOTAL G']>0&&!['PRUNET'].includes(id)).map(id=>Math.abs(+s[id]['SAM']-+s[id]['CIBLE SAM']))).toFixed(2)}`);
  if(inject){ st.forEach(r=>{ if(r[0]==='SULTAN') r[iSam]=+r[iSam]+2; if(r[0]==='SUPLY') r[iSam]=Math.max(0,+r[iSam]-2); }); inject=false; console.log('   (injection +2/−2 sam dans les stats transmises)'); }
  prev=st;
});

// ── S12 : les paires jeu→sam sont-elles TOUTES des couplages fériés ? ──
const res=H.runScenario({year:2027});
const P=A.parsePlanning(res.ss,2027);
const feries=new Set([...res.ctx.getJoursFeries(2027),...res.ctx.getJoursFeries(2028)]);
let legit=0, illegal=[];
Object.entries(P.byDoc).forEach(([id,days])=>{
  Object.keys(days).forEach(d=>{
    if((days[d]==='G'||days[d]==='G2')&&A.DOW(d)===4){
      const sat=A.addD(d,2);
      if(days[sat]==='G'||days[sat]==='G2'){ if(feries.has(d)) legit++; else illegal.push([id,d]); }
    }
    if((days[d]==='G'||days[d]==='G2')&&A.DOW(d)===6){
      const lun=A.addD(d,2);
      if(days[lun]==='G'||days[lun]==='G2'){ if(feries.has(lun)) legit++; else illegal.push([id,d,'sam→lun']); }
    }
  });
});
console.log(`\nS12 — paires jeu→sam / sam→lun : ${legit} couplages fériés légitimes, ${illegal.length} illégales`, illegal);

// ── S13 : équité du 18h et cohérence R=SAM ──
const s=H.readStats(res.ss,2027).byId;
const act=Object.keys(s).filter(id=>+s[id]['TOTAL G']>0);
const h18=act.map(id=>+s[id]['18H']);
console.log(`\nS13 — 18h : min=${Math.min(...h18)} max=${Math.max(...h18)} | BONNET(only18?)=${s['BONNET']?s['BONNET']['18H']:'-'} BOUREGBA=${s['BOUREGBA']?s['BOUREGBA']['18H']:'-'}`);
const rMismatch=act.filter(id=>+s[id]['RECUP R']!==+s[id]['SAM']);
console.log(`R ≡ SAM : ${rMismatch.length?('❌ '+rMismatch.map(id=>`${id} R=${s[id]['RECUP R']} SAM=${s[id]['SAM']}`).join(' ')):'✅'}`);
