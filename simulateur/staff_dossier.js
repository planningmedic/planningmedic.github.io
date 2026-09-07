// ═══ DOSSIER COMPLET POUR LE STAFF — tout ce qui est mesurable en une passe ═══
// Usage : SCEN=0 node simulateur/staff_dossier.js >> /tmp/dossier.jsonl
const H=require('./harness.js'), A=require('./analyse.js'), D=require('./demographie.js');
const SC=+(process.env.SCEN||0), Y0=2027, Y1=2046;
const num=v=>Number(String(v).replace(/^'/,''))||0;
const dow=d=>new Date(d+'T12:00:00').getDay();
const addD=(ds,n)=>{const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const estG=v=>v==='G'||v==='G2';
const AX=[['TOTAL G','CIBLE'],['SAM','CIBLE SAM'],['JEU','CIBLE JEU'],['VD','CIBLE VD'],['VEILLE JF','CIBLE VJF']];
const out={scen:SC,annees:[],abs:{},simult:[],espac:[],ecartsMar:[],axes:{},confort:{ech:0,mars:0},replis:[],
  gardes:0,sansBinome:0,consecutives:0,gardeSurAbsence:0,recupOk:0,recupKo:0};
let prev=null;
for(let y=Y0;y<=Y1;y++){
  const roster=D.buildRoster(y,{ageExempt:60,ageRetraite:67});
  const im=D.buildAbsences(y,roster,SC);
  const r=H.runScenario({year:y,roster,indisposMap:im,statsPrev:prev});
  if(r.error){out.annees.push({y,err:r.error});prev=null;continue;}
  prev=r.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(x=>x.slice());
  const fer=new Set([...r.ctx.getJoursFeries(y),...r.ctx.getJoursFeries(y+1)]);
  const P=A.parsePlanning(r.ss,y);
  const st=H.readStats(r.ss,y).byId;
  const flags={}; roster.forEach(([id,p,q,f])=>flags[id]={p,q,...f});
  const gardeurs=roster.filter(([i,p,q,f])=>!f.noGarde&&p>0).map(x=>x[0]);

  // ── ABSENCES : volume et composition par profil ──
  const ABSC=['VAC','INDISPO','FORM','TP','CL','CTP'];
  roster.forEach(([id,p,q,f])=>{
    const m=im[id]||{}; const prof=(f.noGarde?'nonGardeur':String(q));
    const o=out.abs[prof]||(out.abs[prof]={n:0,tot:0}); o.n++;
    ABSC.forEach(c=>{o[c]=(o[c]||0)+Object.values(m).filter(v=>String(v).toUpperCase()===c).length;});
    o.tot+=Object.values(m).filter(v=>ABSC.includes(String(v).toUpperCase())).length;
  });
  // ── CONGES SIMULTANES (VAC seuls) et DISPONIBLES par jour ──
  P.dates.forEach(d=>{
    let vac=0, dispo=0;
    gardeurs.forEach(id=>{const v=String((im[id]||{})[d]||'').toUpperCase();
      if(v==='VAC')vac++;
      if(!['VAC','INDISPO','FORM','TP','CL','CTP'].includes(v)) dispo++;});
    out.simult.push(vac); if(!out.dispoMin||dispo<out.dispoMin)out.dispoMin=dispo;
    out.dispoAll=(out.dispoAll||[]); out.dispoAll.push(dispo);
  });
  // ── EQUITE ──
  const ids=Object.keys(st).filter(id=>num(st[id]['TOTAL G'])>0&&id!=='PRUNET');
  out.gardes+=Object.keys(st).reduce((a,id)=>a+num(st[id]['TOTAL G']),0);
  let dT=0,dA=0,aA='',qA='';
  ids.forEach(id=>{
    const e=Math.abs(num(st[id]['TOTAL G'])-num(st[id]['CIBLE'])); if(e>dT)dT=e;
    out.ecartsMar.push(+e.toFixed(2));
    AX.forEach(([k,ck])=>{const cb=num(st[id][ck]); if(cb<=0)return;
      const ea=Math.abs(num(st[id][k])-cb);
      (out.axes[k]=out.axes[k]||[]).push(+ea.toFixed(2));
      if(ea>dA){dA=ea;aA=k;qA=id;}});
  });
  // ── ROBUSTESSE ──
  const cnt={}; Object.values(P.byDoc).forEach(dd=>Object.entries(dd).forEach(([k,v])=>{if(estG(v))cnt[k]=(cnt[k]||0)+1;}));
  const nu=Object.values(cnt).filter(n=>n<2).length; out.sansBinome+=nu;
  Object.entries(P.byDoc).forEach(([id,dd])=>{
    const g=Object.keys(dd).filter(d=>estG(dd[d])).sort();
    g.forEach((d,i)=>{
      if(estG(dd[addD(d,1)])) out.consecutives++;
      const v=String((im[id]||{})[d]||'').toUpperCase();
      if(['VAC','INDISPO','FORM','TP','CL','CTP'].includes(v)) out.gardeSurAbsence++;
      if(i>0){const prev_=g[i-1];const j=Math.round((new Date(d)-new Date(prev_))/86400000);
        if(!(dow(prev_)===5&&dow(d)===0)) out.espac.push(j);}
    });
    const sam=Object.keys(dd).filter(d=>estG(dd[d])&&dow(d)===6&&!fer.has(d)).length;
    const rec=Object.keys(dd).filter(d=>dd[d]==='R').length;
    if(sam===rec) out.recupOk++; else out.recupKo++;
  });
  const inv=A.checkInvariants(P,{indisposMap:im,ctxFeries:fer,roster});
  inv.errs.forEach(e=>out.replis.push({y,e:e.split(' ').slice(0,3).join(' ')}));
  const lc=r.logs.find(x=>/Confort vacances/.test(x));
  if(lc){const m=lc.match(/(\d+) echange\(s\) pour (\d+)/); if(m){out.confort.ech+=+m[1];out.confort.mars+=+m[2];}}
  const pleins=roster.filter(([i,p,q,f])=>p===100&&q===100&&!f.noGarde&&!f.dateFin&&!f.dateDebut).map(x=>x[0]);
  out.annees.push({y,dT:+dT.toFixed(2),dA:+dA.toFixed(2),aA,qA,nu,gardeurs:gardeurs.length,
    charge:+Math.max(...pleins.map(id=>num(st[id]['CIBLE'])).filter(v=>v>0)).toFixed(1),
    j2:inv.pairsJ2,errs:inv.errs.length});
  process.stderr.write(`sc${SC} ${y} ok\n`);
}
out.dispoAll=null;
console.log(JSON.stringify(out));
