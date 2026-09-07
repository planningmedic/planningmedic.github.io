// ═══ RÉCUPÉRATIONS PERDUES — combien, quand, pour qui ═══════════════════
// Le placement d'un R cherche un jour ouvré 2 à 16 semaines après le samedi, MAIS
// refuse tout jour hors de l'année civile. Une récup dont la fenêtre déborde sur
// janvier n'est donc jamais posée, et l'abandon n'est ni tracé ni signalé.
// Usage : SCEN=0 node simulateur/mesure_recups.js
const H=require('./harness.js'), A=require('./analyse.js'), D=require('./demographie.js');
const SC=+(process.env.SCEN||0);
const dow=d=>new Date(d+'T12:00:00').getDay();
const estG=v=>v==='G'||v==='G2';
const out={scen:SC,an:0,samTot:0,rTot:0,perdues:0,parMois:{},marTouches:{},pireMar:{}};
let prev=null;
for(let y=2027;y<=2046;y++){
  const roster=D.buildRoster(y,{ageExempt:60,ageRetraite:67});
  const im=D.buildAbsences(y,roster,SC);
  const r=H.runScenario({year:y,roster,indisposMap:im,statsPrev:prev});
  if(r.error){prev=null;continue;}
  prev=r.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(x=>x.slice());
  const fer=new Set([...r.ctx.getJoursFeries(y),...r.ctx.getJoursFeries(y+1)]);
  const P=A.parsePlanning(r.ss,y); out.an++;
  Object.entries(P.byDoc).forEach(([id,dd])=>{
    const sam=Object.keys(dd).filter(d=>estG(dd[d])&&dow(d)===6&&!fer.has(d)).sort();
    const nR=Object.keys(dd).filter(d=>dd[d]==='R').length;
    out.samTot+=sam.length; out.rTot+=nR;
    const manque=sam.length-nR;
    if(manque>0){
      out.perdues+=manque; out.marTouches[id]=(out.marTouches[id]||0)+manque;
      // on impute les manques aux derniers samedis de l'année (fenêtre qui déborde)
      sam.slice(-manque).forEach(d=>{const m=d.slice(5,7); out.parMois[m]=(out.parMois[m]||0)+1;});
      if(manque>(out.pireMar.n||0)) out.pireMar={id,n:manque,y};
    }
  });
}
console.log(JSON.stringify(out));
