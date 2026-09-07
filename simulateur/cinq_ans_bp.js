/* ═══ CINQ ANNÉES ENCHAÎNÉES — BP sur tous ses mardis, dette active ═══
   Exécute le VRAI generateur_gardes.gs (patché option B) sur 2027→2031,
   chaque année héritant des STATS de la précédente : la dette joue.
   BP demande TOUS les mardis hors vacances scolaires et hors veille de férié.
   Les autres MARs reçoivent des absences réalistes, tirées différemment
   chaque année à partir d'une graine reproductible. */
const H = require('./harness.js');

// ── Hasard reproductible ───────────────────────────────────────────────
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }

const ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const DOW = s => new Date(s+'T12:00:00').getDay();

function paques(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),
        g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,
        l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  return new Date(y,Math.floor((h+l-7*m+114)/31)-1,((h+l-7*m+114)%31)+1,12);
}
function feries(y){
  const P=paques(y), add=(n)=>{const d=new Date(P);d.setDate(d.getDate()+n);return ds(d);};
  const rep=(mo,da)=>{const d=new Date(y,mo-1,da,12); if(d.getDay()===0)d.setDate(d.getDate()+1); return ds(d);};
  return new Set([rep(1,1),ds(new Date(y,0,27,12)),rep(5,1),rep(8,15),rep(11,1),rep(11,19),
                  rep(12,8),rep(12,25),add(1),add(39),add(50),add(60)]);
}
// Vacances scolaires, mêmes bornes que periodesRows du harnais
function vacances(y){
  return [[`${y}-02-07`,`${y}-02-23`],[`${y}-04-04`,`${y}-04-20`],[`${y}-07-04`,`${y}-08-31`],
          [`${y}-10-17`,`${y}-11-02`],[`${y}-12-19`,`${y+1}-01-04`]];
}
const enVac=(d,y)=>vacances(y).some(([a,b])=>d>=a&&d<=b);

// Bornes de l'année de planning : 1er lundi de janvier → veille du 1er lundi suivant
function bornes(y){
  const j1=new Date(y,0,1,12), d1=j1.getDay(), o1=d1===1?7:d1===0?1:8-d1;
  const start=new Date(y,0,1+o1,12);
  const jn=new Date(y+1,0,1,12), dn=jn.getDay(), on=dn===1?7:dn===0?1:8-dn;
  const end=new Date(y+1,0,on,12);
  return [start,end];
}
function tousLesJours(y){
  const [a,b]=bornes(y), out=[];
  for(const d=new Date(a); d<=b; d.setDate(d.getDate()+1)) out.push(ds(d));
  return out;
}

// ── Absences ───────────────────────────────────────────────────────────
/* Chaque MAR (hors BP) pose ~7 semaines de congés + 2 semaines de formation,
   par blocs, plus quelques jours isolés d'indisponibilité. BP pose ses congés
   par blocs lui aussi, et demande ensuite TOUS ses mardis restants. */
function absences(year, roster, seed){
  const R=rng(seed), jours=tousLesJours(year), F=new Set([...feries(year),...feries(year+1)]);
  const map={};
  roster.forEach(([id,pct,q,f])=>{
    map[id]={};
    if(f.noGarde) return;
    const nbBlocs = 5 + Math.floor(R()*3);           // 5 à 7 blocs
    for(let b=0;b<nbBlocs;b++){
      const len = 5 + Math.floor(R()*9);             // 5 à 13 jours
      const i0 = Math.floor(R()*(jours.length-len));
      const code = R()<0.78 ? 'VAC' : 'FORM';
      for(let k=0;k<len;k++) map[id][jours[i0+k]]=code;
    }
    const isoles = 3 + Math.floor(R()*6);
    for(let k=0;k<isoles;k++){
      const d=jours[Math.floor(R()*jours.length)];
      if(!map[id][d]) map[id][d]='INDISPO';
    }
  });
  // BP : tous les mardis libres, hors vacances scolaires, hors veille de férié
  const add1=d=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+1);return ds(x);};
  let n=0;
  jours.forEach(d=>{
    if(DOW(d)!==2) return;                       // mardi
    if(map['PRUNET'][d]) return;                 // ses propres congés — la seule exclusion
    if(F.has(d)||F.has(add1(d))) return;          // férié ou veille de férié
    map['PRUNET'][d]='SOUHAIT'; n++;
  });
  return {map, mardisBP:n};
}

// ── Boucle ─────────────────────────────────────────────────────────────
const roster = H.defaultRoster().map(r=>{
  const c=[...r]; c[3]={...c[3]};
  if(c[0]==='ARMAND') delete c[3].dateDebut;      // présent toute la période
  return c;
});
const GARDEURS = roster.filter(r=>!r[3].noGarde).map(r=>r[0]);
const AXES = [['CIBLE','TOTAL G','total'],['CIBLE SAM','SAM','samedis'],['CIBLE JEU','JEU','jeudis'],
              ['CIBLE VD','VD','week-ends'],['CIBLE VJF','VEILLE JF','veilles JF'],['CIBLE JF','JF','fériés']];

let prev=null;
const passees=[];          // TOUS les onglets STATS des années déjà générées
const histo={}, vrai={};
console.log('══ CINQ ANNÉES ENCHAÎNÉES — dette active, BP sur tous ses mardis ══\n');

for(let i=0;i<5;i++){
  const year=2027+i;
  const {map, mardisBP} = absences(year, roster, 1000+i*37);
  const _t0=Date.now();
  const res = H.runScenario({year, roster, indisposMap:map, statsPrev:prev,
                             extraSheets: passees.map(o=>H.makeSheet(o.nom, o.rows))});
  if(res.error){ console.log(year,'ERREUR', res.error); break; }
  const _ms=Date.now()-_t0;
  const S = H.readStats(res.ss, year).byId;
  const jrn=(res.logs||[]).filter(l=>/Compteur d'équité/.test(l));
  const n = v => Number(String(v).replace(/^'/,''))||0;

  const actifs = GARDEURS.filter(id=>S[id]);
  const sommeCible = actifs.reduce((s,id)=>s+n(S[id]['CIBLE']),0);
  const sommeReel  = actifs.reduce((s,id)=>s+n(S[id]['TOTAL G']),0);

  // écart le plus fort de chaque MAR, sur les six axes
  // dérive VRAIE : écart à la part exacte, cumulé, par axe
  const EX=[['EXACTE TOTAL','TOTAL G'],['EXACTE SAM','SAM'],['EXACTE JEU','JEU'],
            ['EXACTE VD','VD'],['EXACTE VJF','VEILLE JF'],['EXACTE JF','JF']];
  actifs.forEach(id=>{
    vrai[id]=vrai[id]||{};
    EX.forEach(([x,r])=>{ vrai[id][x]=(vrai[id][x]||0)+(n(S[id][r])-n(S[id][x])); });
  });
  const pires={};
  actifs.forEach(id=>{
    let p=0,ax='';
    AXES.forEach(([c,r,nom])=>{
      const cc=n(S[id][c]), rr=n(S[id][r]);
      if(S[id][c]===undefined||S[id][c]==='') return;
      const e=rr-cc; if(Math.abs(e)>Math.abs(p)){p=e;ax=nom;}
    });
    pires[id]={e:p,ax};
    (histo[id]=histo[id]||[]).push(p);
  });
  const rep={};
  Object.values(pires).forEach(o=>{ rep[o.e]=(rep[o.e]||0)+1; });
  const bp=S['PRUNET'];

  console.log(`── ${year} ──`);
  console.log(`   durée du calcul : ${_ms} ms   |   ${jrn[0]||'compteur : —'}`);
  console.log(`   mardis demandés par BP : ${mardisBP}   |   obtenus : ${n(bp['TOTAL G'])}   |   sa cible : ${n(bp['CIBLE'])}`);
  console.log(`   somme des cibles : ${sommeCible}   |   gardes posées : ${sommeReel}   ${sommeCible===sommeReel?'✔ tombe juste':'✘ ÉCART DE '+(sommeCible-sommeReel)}`);
  const cles=Object.keys(rep).map(Number).sort((a,b)=>a-b);
  console.log(`   écarts max par MAR : ${cles.map(k=>`${k>0?'+':''}${k} → ${rep[k]}`).join('   ')}`);
  const gros=actifs.filter(id=>Math.abs(pires[id].e)>=2);
  console.log(`   au-delà d'une garde d'écart : ${gros.length?gros.map(id=>`${id} ${pires[id].e>0?'+':''}${pires[id].e} ${pires[id].ax}`).join(', '):'aucun'}`);
  console.log('');

  const brut = res.ss.getSheetByName(`STATS_GARDES_${year}`)._rows.map(r=>r.slice());
  prev = brut;
  ['OPPRECHT','CATINEAU'].forEach(id=>{
    if(!S[id]) return;
    const r=n(S[id]['JF']), x=n(S[id]['EXACTE JF']);
    console.log(`   SUIVI ${id} fériés : part ${x.toFixed(2)}  fait ${r}  écart ${(r-x>=0?'+':'')}${(r-x).toFixed(2)}`);
  });
  passees.push({nom:`STATS_GARDES_${year}`, rows:brut});
}

// ── Dérive cumulée sur cinq ans ────────────────────────────────────────
console.log('══ DÉRIVE CUMULÉE SUR CINQ ANS (somme des écarts annuels) ══\n');
const lignes = Object.keys(histo).map(id=>({id, cum:histo[id].reduce((a,b)=>a+b,0), det:histo[id]}));
lignes.sort((a,b)=>Math.abs(b.cum)-Math.abs(a.cum));
lignes.forEach(l=>console.log(`   ${l.id.padEnd(11)} ${String(l.cum>0?'+'+l.cum:l.cum).padStart(4)}   (${l.det.map(x=>x>0?'+'+x:x).join(' ')})`));
const max=Math.max(...lignes.map(l=>Math.abs(l.cum)));
console.log(`\n   dérive la plus forte (écarts entiers) : ${max}`);

console.log('\n══ DÉRIVE VRAIE : écart cumulé à la PART EXACTE, par axe ══\n');
const NOMAX={'EXACTE TOTAL':'total','EXACTE SAM':'samedis','EXACTE JEU':'jeudis',
             'EXACTE VD':'week-ends','EXACTE VJF':'veilles JF','EXACTE JF':'fériés'};
const L2=Object.keys(vrai).map(id=>{
  let p=0,ax='';
  Object.keys(vrai[id]).forEach(k=>{ if(Math.abs(vrai[id][k])>Math.abs(p)){p=vrai[id][k];ax=NOMAX[k];} });
  return {id,p,ax};
}).sort((a,b)=>Math.abs(b.p)-Math.abs(a.p));
L2.slice(0,8).forEach(l=>console.log(`   ${l.id.padEnd(11)} ${(l.p>0?'+':'')+l.p.toFixed(2)}  sur ${l.ax}`));
console.log(`\n   DÉRIVE VRAIE LA PLUS FORTE : ${Math.max(...L2.map(l=>Math.abs(l.p))).toFixed(2)}`);
const moy=L2.reduce((a,l)=>a+Math.abs(l.p),0)/L2.length;
console.log(`   dérive moyenne du service   : ${moy.toFixed(2)}`);
