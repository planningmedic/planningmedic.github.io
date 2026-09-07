const H = require('./harness.js');
const A = require('./analyse.js');

function fullCheck(name, year, opts={}) {
  const t0=Date.now();
  const res = H.runScenario({year, ...opts});
  if (res.error) { console.log(`\n══ ${name} ══\n💥 ERREUR : ${res.error}`); return null; }
  const P = A.parsePlanning(res.ss, year);
  const feries = new Set([...res.ctx.getJoursFeries(year), ...res.ctx.getJoursFeries(year+1)]);
  const inv = A.checkInvariants(P, {ctxFeries: feries, indisposMap: opts.indisposMap||{}, roster: opts.roster});
  const eq = A.equityStats(res.ss, year, opts.roster);
  const warn = res.logs.filter(l=>/Manque|exception|repli|<2|SOUHAIT.*sans/.test(l));
  console.log(`\n══ ${name} ══ (${Date.now()-t0} ms)`);
  console.log('Invariants :', inv.errs.length? `❌ ${inv.errs.length} → ${inv.errs.slice(0,5).join(' | ')}` : '✅');
  // écart max |réel − cible| par axe (plus parlant que min/max bruts)
  const st=eq.st; const cible=(id,k)=>+st.byId[id][k];
  const active=Object.keys(st.byId).filter(id=>+st.byId[id]['TOTAL G']>0);
  const devAxe=(k,ck)=>Math.max(...active.map(id=>Math.abs(+st.byId[id][k]-cible(id,ck)))).toFixed(2);
  console.log(`|réel−cible| max — sam:${devAxe('SAM','CIBLE SAM')} jeu:${devAxe('JEU','CIBLE JEU')} vd:${devAxe('VD','CIBLE VD')} vjf:${devAxe('VEILLE JF','CIBLE VJF')} | total dev max:${Math.max(...eq.devTotal.map(x=>Math.abs(x.dev))).toFixed(2)} | maxG−G2:${eq.ggap} | J±2:${inv.pairsJ2}`);
  if (warn.length) console.log('⚠ warnings :', warn.slice(0,6));
  return {res, P, inv, eq, feries};
}

// ── S2 : TP jours fixes AVEC gardes (MAR03 mer/jeu off) ────────────
{
  const roster = H.defaultRoster().map(r => r[0]==='MAR03' ? ['MAR03',80,80,{tpJours:'MER,JEU'}] : r);
  const out = fullCheck('S2 — TP jours fixes (MAR03 ne travaille ni mer ni jeu)', 2027, {roster});
  if (out) {
    const days = out.P.byDoc['MAR03']||{};
    const viol = Object.keys(days).filter(d=>(days[d]==='G'||days[d]==='G2')&&[3,4].includes(A.DOW(d)));
    console.log(`→ Gardes de MAR03 posées un MERCREDI ou JEUDI (jours fixes off) : ${viol.length}`, viol.slice(0,6));
  }
}

// ── S3 : années particulières ──────────────────────────────────────────
[2026, 2028, 2032].forEach(y => fullCheck(`S3 — année ${y}${y===2026?' (53 sem. ISO)':''}${y===2028||y===2032?' (bissextile)':''}`, y));

// ── S4 : stress — 15 MARs indisponibles sur le pont du 8 mai 2027 ──────
{
  const ids = H.defaultRoster().map(r=>r[0]).filter(id=>!['MAR04','MAR17','MAR01','MAR11'].includes(id)).slice(0,15);
  const im = {};
  ids.forEach(id=>{ im[id]={}; ['2027-05-06','2027-05-07','2027-05-08','2027-05-09','2027-05-10'].forEach(d=>im[id][d]='INDISPO'); });
  fullCheck('S4 — stress : 15 MARs indispo sur le pont du 8 mai', 2027, {indisposMap: im});
}

// ── S5 : dette inter-annuelle — inéquité artificielle en 2027, correction 2028 ? ──
{
  const r1 = H.runScenario({year: 2027});
  const st1 = r1.ss.getSheetByName('STATS_GARDES_2027')._rows.map(r=>r.slice());
  // Injecter une inéquité : MAR02 +2 samedis / MAR08 −2 (colonne SAM = index 10)
  const hdr = st1[0].map(String); const iSam = hdr.indexOf('SAM');
  st1.forEach(row=>{ if(row[0]==='MAR02') row[iSam]=+row[iSam]+2; if(row[0]==='MAR08') row[iSam]=Math.max(0,+row[iSam]-2); });
  const out = fullCheck('S5 — dette : MAR02 +2 sam / MAR08 −2 sam injectés en 2027 → 2028', 2028, {statsPrev: st1});
  if (out) {
    const s=out.eq.st.byId;
    console.log(`→ 2028 : MAR02 sam=${s['MAR02']['SAM']} (cible ${s['MAR02']['CIBLE SAM']}) | MAR08 sam=${s['MAR08']['SAM']} (cible ${s['MAR08']['CIBLE SAM']}) — attendu : MAR02 < MAR08`);
  }
}

// ── S6 : souhaits adversariaux ─────────────────────────────────────────
{
  const im = { MAR02: {} };
  // 40 souhaits de mardis + 8 souhaits de samedis (censés être ignorés)
  let n=0;
  for(let m=1;m<=12&&n<40;m++) for(let d=1;d<=28&&n<40;d++){
    const ds=`2027-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(A.DOW(ds)===2){ im.MAR02[ds]='SOUHAIT'; n++; }
  }
  let s2=0;
  for(let m=1;m<=12&&s2<8;m++) for(let d=1;d<=28&&s2<8;d++){
    const ds=`2027-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if(A.DOW(ds)===6 && !im.MAR02[ds]){ im.MAR02[ds]='SOUHAIT'; s2++; }
  }
  const out = fullCheck('S6 — MAR02 : 40 souhaits de mardis + 8 souhaits de samedis', 2027, {indisposMap: im});
  if (out) {
    const days=out.P.byDoc['MAR02']||{};
    const mardis=Object.keys(days).filter(d=>(days[d]==='G'||days[d]==='G2')&&A.DOW(d)===2).length;
    const s=out.eq.st.byId['MAR02'];
    console.log(`→ MAR02 : total=${s['TOTAL G']} (cible ${String(s['CIBLE']).replace("'",'')}) mardis=${mardis} sam=${s['SAM']} (cible ${s['CIBLE SAM']}) jeu=${s['JEU']} vd=${s['VD']}`);
  }
}

// ── S7 : MAR01 45 souhaits (> cible) ──────────────────────────────────
{
  const im = { MAR01: {} };
  let n=0;
  for(let m=1;m<=12&&n<45;m++) for(let d=1;d<=28&&n<45;d++){
    const ds=`2027-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dw=A.DOW(ds);
    if(dw>=1&&dw<=4){ im.MAR01[ds]='SOUHAIT'; n++; }
  }
  const out = fullCheck('S7 — MAR01 : 45 souhaits (cible ~34)', 2027, {indisposMap: im});
  if (out) {
    const s=out.eq.st.byId['MAR01'];
    const days=out.P.byDoc['MAR01']||{};
    const honored=Object.keys(im.MAR01).filter(d=>days[d]==='G'||days[d]==='G2').length;
    console.log(`→ MAR01 : total=${s['TOTAL G']} | souhaits honorés=${honored}/45 | attendu : total ≈ souhaits honorés (plafond strict, zéro extra)`);
  }
}

// ── S8 : déterminisme ──────────────────────────────────────────────────
{
  const a = H.runScenario({year: 2027});
  const b = H.runScenario({year: 2027});
  const ga = JSON.stringify(a.ss.getSheetByName('GARDES_2027')._rows);
  const gb = JSON.stringify(b.ss.getSheetByName('GARDES_2027')._rows);
  console.log(`\n══ S8 — déterminisme ══\n→ deux exécutions identiques : ${ga===gb?'✅ oui':'❌ NON (aléa caché)'}`);
}

// ── S9 : localisation des paires J±2 (hypothèse : autour des VD) ───────
{
  const res = H.runScenario({year: 2027});
  const P = A.parsePlanning(res.ss, 2027);
  const pairs=[];
  Object.entries(P.byDoc).forEach(([id,days])=>{
    Object.keys(days).forEach(d=>{
      if(days[d]==='G'||days[d]==='G2'){
        const d2=A.addD(d,2);
        if((days[d2]==='G'||days[d2]==='G2') && !(A.DOW(d)===5&&A.DOW(d2)===0)) pairs.push([id,d,d2,A.DOW(d),A.DOW(d2)]);
      }
    });
  });
  const NAMES=['dim','lun','mar','mer','jeu','ven','sam'];
  const kinds={};
  pairs.forEach(([id,d,d2,w1,w2])=>{const k=`${NAMES[w1]}→${NAMES[w2]}`;kinds[k]=(kinds[k]||0)+1;});
  console.log(`\n══ S9 — anatomie des paires J±2 ══\n→ ${pairs.length} paires :`, kinds);
}

// ── S10 : congé maternité (CL janvier→février, retour mars) ────────────
{
  const im = { MAR03: {} };
  for(let m=1;m<=2;m++) for(let d=1;d<=31;d++){
    const dt=new Date(2027,m-1,d); if(dt.getMonth()!==m-1) continue;
    im.MAR03[`2027-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`]='CL';
  }
  const out = fullCheck('S10 — MAR03 en CL janvier-février (retour mars)', 2027, {indisposMap: im});
  if (out) {
    const s=out.eq.st.byId['MAR03'];
    console.log(`→ MAR03 : cible=${String(s['CIBLE']).replace("'",'')} (vs ~34 plein temps — attendu ≈ 10/12 de 34 ≈ 28,5) réel=${s['TOTAL G']}`);
    // concentration au retour ? gardes par mois
    const days=out.P.byDoc['MAR03']||{};
    const perM={}; Object.keys(days).forEach(d=>{if(days[d]==='G'||days[d]==='G2'){const m=+d.slice(5,7);perM[m]=(perM[m]||0)+1;}});
    console.log('→ répartition mensuelle :', perM, '(mars ne doit pas exploser)');
  }
}
