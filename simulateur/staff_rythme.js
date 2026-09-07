// ═══ RYTHME + CHARGE sur les 20 scénarios × 20 ans ═══
// Mesure : intervalle entre deux gardes, gardes rapprochées, mois chargés.
const H=require('./harness.js'), A=require('./analyse.js'), D=require('./demographie.js');
const SC=+(process.env.SCEN||0), Y0=2027, Y1=2046;
const num=v=>Number(String(v).replace(/^'/,''))||0;
const out={scen:SC, annees:[]};
let prev=null;
const jour=d=>Math.floor(Date.parse(d+'T12:00:00Z')/86400000);
for(let y=Y0;y<=Y1;y++){
  const roster=D.buildRoster(y,{ageExempt:60,ageRetraite:67});
  const r=H.runScenario({year:y, roster, indisposMap:D.buildAbsences(y,roster,SC), statsPrev:prev});
  if(r.error){ out.annees.push({y,err:1}); prev=null; continue; }
  prev=r.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(x=>x.slice());
  const st=H.readStats(r.ss,y).byId;
  const P=A.parsePlanning(r.ss,y);
  const gapsAll=[], gapsHorsWE=[]; let sous7=0, sous7hWE=0, nG=0, nGh=0;
  let moisTot=0, mois4=0, pireMois=0;
  Object.entries(P.byDoc).forEach(([id,days])=>{
    if(id==='PRUNET') return;
    const ds=Object.keys(days).filter(d=>days[d]==='G'||days[d]==='G2').sort();
    if(!ds.length) return;
    const parMois={};
    ds.forEach(d=>{const m=d.slice(0,7); parMois[m]=(parMois[m]||0)+1;});
    Object.values(parMois).forEach(n=>{moisTot++; if(n>4)mois4++; if(n>pireMois)pireMois=n;});
    for(let i=1;i<ds.length;i++){
      const g=jour(ds[i])-jour(ds[i-1]);
      gapsAll.push(g); nG++; if(g<7) sous7++;
      if(g>2){ gapsHorsWE.push(g); nGh++; if(g<7) sous7hWE++; }   // >2 j = hors binôme ven/dim
    }
  });
  const med=a=>{const s=a.slice().sort((x,z)=>x-z);return s.length?(s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2):0;};
  const pleins=roster.filter(([i,p,q,f])=>p===100&&q===100&&!f.noGarde&&!f.dateFin&&!f.dateDebut).map(x=>x[0]);
  out.annees.push({y,
    gardeurs:roster.filter(([i,p,q,f])=>!f.noGarde&&p>0).length,
    charge:+Math.max(...pleins.map(id=>num(st[id]['CIBLE'])).filter(v=>v>0)).toFixed(2),
    medAll:med(gapsAll), medHors:med(gapsHorsWE),
    sous7:+(100*sous7/nG).toFixed(1), sous7h:+(100*sous7hWE/nGh).toFixed(1),
    mois4:+(100*mois4/moisTot).toFixed(1), pireMois});
}
console.log(JSON.stringify(out));
