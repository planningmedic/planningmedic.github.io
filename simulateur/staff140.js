// ═══ BANC 140 ANNÉES — 7 scénarios d'absences × 20 ans (2027→2046) ═══
// Reproduit les chiffres annoncés dans docs/presentation-staff.html.
// Usage : SCEN=0 node simulateur/staff140.js >> /tmp/scen.jsonl
const H=require('./harness.js'), A=require('./analyse.js'), D=require('./demographie.js');
const SC=+(process.env.SCEN||0), Y0=2027, Y1=2046;
const AX=[['TOTAL G','CIBLE'],['SAM','CIBLE SAM'],['JEU','CIBLE JEU'],['VD','CIBLE VD'],['VEILLE JF','CIBLE VJF']];
const num=v=>Number(String(v).replace(/^'/,''))||0;
const out={scen:SC, annees:[], gardes:0, sansBinome:0};
let prev=null;
for(let y=Y0;y<=Y1;y++){
  const roster=D.buildRoster(y,{ageExempt:60,ageRetraite:67});
  const r=H.runScenario({year:y, roster, indisposMap:D.buildAbsences(y,roster,SC), statsPrev:prev});
  if(r.error){ out.annees.push({y,err:r.error}); prev=null; continue; }
  prev=r.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(x=>x.slice());
  const st=H.readStats(r.ss,y).byId;
  const ids=Object.keys(st).filter(id=>num(st[id]['TOTAL G'])>0 && id!=='PRUNET');
  out.gardes+=Object.keys(st).reduce((a,id)=>a+num(st[id]['TOTAL G']),0);
  let dT=0,qT='';
  ids.forEach(id=>{const e=Math.abs(num(st[id]['TOTAL G'])-num(st[id]['CIBLE'])); if(e>dT){dT=e;qT=id;}});
  let dA=0,qA='',aA='';
  ids.forEach(id=>AX.forEach(([k,ck])=>{const cb=num(st[id][ck]); if(cb<=0)return;
    const e=Math.abs(num(st[id][k])-cb); if(e>dA){dA=e;qA=id;aA=k;}}));
  const P=A.parsePlanning(r.ss,y);
  // (31/07/2026) On compte sur P.dates, PAS sur les dates presentes dans le releve :
  // l'ancien compteur construisait un dictionnaire a partir des gardes existantes, donc
  // une journee ENTIEREMENT non pourvue n'y figurait pas et restait invisible. Il
  // annoncait 0 alors que 4 journees sur 400 annees n'ont personne (fin decembre,
  // apres plusieurs replis) — le generateur, lui, les signale par « Manque MAR ».
  const nu=P.dates.filter(d=>!P.byDate[d].G||!P.byDate[d].G2).length; out.sansBinome+=nu;
  const pleins=roster.filter(([i,p,q,f])=>p===100&&q===100&&!f.noGarde&&!f.dateFin&&!f.dateDebut).map(x=>x[0]);
  out.annees.push({y, dT:+dT.toFixed(2), qT, dA:+dA.toFixed(2), qA, aA, nu,
    gardeurs:roster.filter(([i,p,q,f])=>!f.noGarde&&p>0).length,
    charge:+Math.max(...pleins.map(id=>num(st[id]['CIBLE'])).filter(v=>v>0)).toFixed(1)});
  process.stderr.write(`sc${SC} ${y} dT=${dT.toFixed(1)}(${qT}) dA=${dA.toFixed(1)} nu=${nu}\n`);
}
console.log(JSON.stringify(out));
