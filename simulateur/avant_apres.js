// ═══ AVANT/APRÈS — la batterie complète sur les DEUX versions ═══
const fs=require('fs'), vm=require('vm');
const H=require('./harness.js'), A=require('./analyse.js');

function runWith(genPath, year, opts={}) {
  // même harness, mais generateur_gardes.gs pris dans genPath
  const origRead=fs.readFileSync;
  const spy=(p,e)=>String(p).includes('generateur_gardes.gs')?origRead(genPath,'utf8'):origRead(p,e);
  fs.readFileSync=spy;
  let out;
  try { out=H.runScenario({year,...opts}); } finally { fs.readFileSync=origRead; }
  return out;
}

function metrics(res, year, roster) {
  const P=A.parsePlanning(res.ss,year);
  const feries=new Set([...res.ctx.getJoursFeries(year),...res.ctx.getJoursFeries(year+1)]);
  const inv=A.checkInvariants(P,{ctxFeries:feries,roster});
  const st=H.readStats(res.ss,year).byId;
  const act=Object.keys(st).filter(id=>+st[id]['TOTAL G']>0);
  const dev=(k,ck)=>Math.max(...act.map(id=>Math.abs(+st[id][k]-+st[id][ck])));
  const cib=id=>parseFloat(String(st[id]['CIBLE']).replace("'",''));
  return {
    errs:inv.errs.length, j2:inv.pairsJ2,
    sam:dev('SAM','CIBLE SAM'), jeu:dev('JEU','CIBLE JEU'), vd:dev('VD','CIBLE VD'), vjf:dev('VEILLE JF','CIBLE VJF'),
    tot:Math.max(...act.map(id=>Math.abs(+st[id]['TOTAL G']-cib(id)))),
    gg2:Math.max(...act.map(id=>Math.abs(+st[id]['G (REA)']-+st[id]['G2 (MAT)']))),
    warn:res.logs.filter(l=>/Manque|exception|repli|<2/.test(l)).length,
  };
}

const SC=[
  {n:'2027 nominal', y:2027, o:{}},
  {n:'2026 (53 sem.)', y:2026, o:{}},
  {n:'2028 bissextile', y:2028, o:{}},
  {n:'stress pont 8 mai', y:2027, o:(()=>{const ids=H.defaultRoster().map(r=>r[0]).filter(id=>!['BONNET','BOUREGBA','PRUNET','COPELOVICI'].includes(id)).slice(0,15);const im={};ids.forEach(id=>{im[id]={};['2027-05-06','2027-05-07','2027-05-08','2027-05-09','2027-05-10'].forEach(d=>im[id][d]='INDISPO');});return {indisposMap:im};})()},
  {n:'TP fixes mer/jeu', y:2027, o:{roster:H.defaultRoster().map(r=>r[0]==='LEVASSEUR'?['LEVASSEUR',80,80,{tpJours:'MER,JEU'}]:r)}},
  {n:'maternité CL 2 mois', y:2027, o:(()=>{const im={LEVASSEUR:{}};for(let m=1;m<=2;m++)for(let d=1;d<=31;d++){const dt=new Date(2027,m-1,d);if(dt.getMonth()!==m-1)continue;im.LEVASSEUR[`2027-0${m}-${String(d).padStart(2,'0')}`]='CL';}return {indisposMap:im};})()},
];

const fmt=m=>`errs=${m.errs} sam=${m.sam.toFixed(1)} jeu=${m.jeu.toFixed(1)} vd=${m.vd.toFixed(1)} vjf=${m.vjf.toFixed(1)} tot=${m.tot.toFixed(1)} G−G2=${m.gg2} J±2=${m.j2} warn=${m.warn}`;
let anyWorse=false;
SC.forEach(({n,y,o})=>{
  const r0=runWith('/home/claude/repo/gas/generateur_gardes.gs',y,o);
  const r1=runWith('/home/claude/repo-patched/gas/generateur_gardes.gs',y,o);
  const m0=metrics(r0,y,o.roster), m1=metrics(r1,y,o.roster);
  const worse=['errs','sam','jeu','vd','vjf','tot','gg2','warn'].filter(k=>m1[k]>m0[k]+1e-9);
  if(worse.length&&!(n==='TP fixes mer/jeu')) anyWorse=true;
  console.log(`── ${n}`);
  console.log(`   avant : ${fmt(m0)}`);
  console.log(`   après : ${fmt(m1)} ${worse.length?('⚠ dégradé: '+worse.join(',')):'✅'}`);
});

// vérification spécifique : le défaut D1 est-il corrigé ?
const rp=runWith('/home/claude/repo-patched/gas/generateur_gardes.gs',2027,{roster:H.defaultRoster().map(r=>r[0]==='LEVASSEUR'?['LEVASSEUR',80,80,{tpJours:'MER,JEU'}]:r)});
const Pp=A.parsePlanning(rp.ss,2027);
const dd=Pp.byDoc['LEVASSEUR']||{};
const viol=Object.keys(dd).filter(d=>(dd[d]==='G'||dd[d]==='G2')&&[3,4].includes(A.DOW(d)));
const s=H.readStats(rp.ss,2027).byId['LEVASSEUR'];
console.log(`\nD1 corrigé : gardes mer/jeu de LEVASSEUR = ${viol.length} (avant patch : 7) | son total=${s['TOTAL G']} cible=${String(s['CIBLE']).replace("'",'')}`);
console.log(anyWorse?'\n❌ AU MOINS UNE DÉGRADATION → ne pas pousser':'\n✅ AUCUNE DÉGRADATION sur la batterie');
