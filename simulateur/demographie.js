// ═══ SIMULATION DÉMOGRAPHIQUE 2027→2046 — le VRAI algo, année par année ═══
//
// ⚠️ RÉÉCRIT LE 22/07/2026. La version précédente avait son PROPRE effectif de
// 20 personnes, divergent de harness.defaultRoster() : elle ignorait les deux
// collègues sans garde, le poste à 50 % et les non-titulaires, et surestimait
// donc la charge d'environ 10 % (57 gardes/an au creux au lieu de 52).
// Cette version part de l'effectif RÉEL, avec les années de naissance.
//
// Transition modélisée : FERRIERO (100 %) et COPELOVICI (50 %) cohabitent
// jusqu'en mars 2027 ; ensuite un seul poste subsiste, à 50 %. Le générateur
// proratise seul la cible de celui qui part (6 gardes pour 2 mois) et
// redistribue le reste — comportement vérifié.
const H=require('./harness.js'), A=require('./analyse.js');

// [id, pct_gardes, quotite, naissance, flags de base]
const EQUIPE=[
  ['SULTAN',    100,100, 1961, {noExempt:1}],   // 66 ans en 2027 mais prend 100 % des gardes (décision Arthur 31/07/2026)
  ['BONNET',     60, 60, 1964, {noGarde:1, only18:1, tpJours:'JEU, VEN'}],  // 60/60, jeu+ven fixes
  ['MENADE',   100, 90, 1967, {}],   // 90 % de travail, 100 % des gardes
  ['GUERIN',    100,100, 1969, {}],
  ['CATINEAU', 100, 80, 1974, {}],   // 80 % de travail, 100 % des gardes
  ['BOUREGBA',  100,100, 1975, {noGarde:1, only18:1}],   // 100/100 mais ne prend pas de garde
  ['ARMANDO',   100,100, 1975, {}],
  ['ROUSSEAU',  100,100, 1976, {}],
  ['ALBOUY',    100,100, 1977, {}],
  ['PRUNET',    100,100, 1977, {noWeekend:1,souhaitPlafond:1}],
  ['GHIGLIONE',100, 90, 1978, {}],   // 90 % de travail, 100 % des gardes
  ['LEY',        90, 90, 1981, {}],
  ['OPPRECHT',  100,100, 1982, {}],
  ['ZAMARON',  100, 90, 1986, {}],   // 90 % de travail, 100 % des gardes
  ['SEVERAC',    80, 80, 1986, {}],
  ['SALA',      100,100, 1986, {}],
  ['LEVASSEUR',100, 90, 1987, {}],   // 90 % de travail, 100 % des gardes
  ['COPELOVICI', 50, 50, 1990, {r2s2:1}],   // LC — le poste conservé, 50 %
  ['SUPLY',     100,100, 1990, {}],
  ['FERRIERO',  100,100, 1991, {}],          // AF — date_fin VIDE dans MEDECINS : il reste
  ['WIDEHEM',  100, 90, 1991, {}],   // 90 % de travail, 100 % des gardes
  ['DURAND',  100,100, 1992, {}],
  ['PARTOUCHE', 100,100, 1992, {}],
  ['ARMAND',    100,100, 1993, {}],          // recrutement titulaire, arrivé 11/2026
];
const FIN_FERRIERO='2027-02-28';   // 1 ETP qui disparaît → réabsorbé au prorata mars→déc

function buildRoster(year,{ageExempt=60,ageRetraite=67}={}){
  const out=[], repl=[];
  EQUIPE.forEach(([id,pct,q,born,f0])=>{
    // (31/07/2026) FERRIERO n'est plus un cas particulier : sa date_fin est VIDE dans
    // l'onglet MEDECINS. L'ancien modèle le faisait partir fin février 2027 puis
    // disparaître dès 2028 — un temps plein retiré de TOUTES les années simulées.
    // Décision d'Arthur : par défaut il reste, et suit la règle commune (exemption à
    // 60 ans, retraite à 67). À revoir le jour où sa date de départ sera connue.
    const retYear=born+ageRetraite;
    if(year>=retYear){ if(id!=='SULTAN') repl.push({id:'REMPL_'+id, born:retYear-35}); return; }
    const age=year-born;
    const f={...f0};
    // Exemption de gardes à 60 ans — SAUF exception nominative (drapeau noExempt).
    // MENADE (né 1967) y entre en 2027 : décision d'Arthur, il n'en prend plus.
    // ⚠️ À répercuter dans l'onglet MEDECINS (no_garde = O) avant la génération de
    // novembre, sinon la production et le banc d'essai divergent d'un gardeur.
    if(age>=ageExempt && !f0.noExempt) f.noGarde=1;
    out.push([id,pct,q,f]);
  });
  repl.forEach(r=>{
    const age=year-r.born, f={};
    if(age>=ageExempt) f.noGarde=1;
    out.push([r.id,100,100,f]);
  });
  return out;
}

// ═══ ABSENCES RÉALISTES ═══════════════════════════════════════════════
// Format IMPÉRATIF : objet { 'yyyy-mm-dd': CODE }. Un tableau serait silencieusement
// ignoré par indisposRows() (qui lit indisposMap[id][date]) et la simulation tournerait
// SANS AUCUNE ABSENCE — piège vérifié le 22/07/2026.
// Codes lus par le générateur : VAC / INDISPO / FORM (n'abaissent PAS la cible),
// CL (congé long : SEUL code qui abaisse la cible), SOUHAIT (jour demandé).
// Tirage DÉTERMINISTE (pas de Math.random) : deux exécutions donnent le même résultat.
function rnd(seed){
  // mélange initial (splitmix32) : sans lui, des graines voisines donnent des suites
  // corrélées — piège constaté le 22/07/2026 (tous les MARs en congé long la même année).
  let x=(seed>>>0)+0x9E3779B9;
  const step=()=>{ x=(x+0x9E3779B9)>>>0; let z=x;
    z=Math.imul(z^(z>>>16),0x21f0aaad); z=Math.imul(z^(z>>>15),0x735a2d97);
    return ((z^(z>>>15))>>>0)/4294967296; };
  for(let i=0;i<8;i++) step();
  return step;
}
function iso(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function bloc(im,y,mois,jour,nb,code){
  const d=new Date(Date.UTC(y,mois-1,jour));
  for(let k=0;k<nb;k++){
    if(d.getUTCFullYear()===y) im[iso(y,d.getUTCMonth()+1,d.getUTCDate())]=code;
    d.setUTCDate(d.getUTCDate()+1);
  }
}
// Plafond d'indisponibilités « INDISPO » par MAR et par an (hors VAC / FORM / CL).
// Volume calé sur la FEUILLE RÉELLE 2026 (relevé du 22/07/2026) : 81 jours bloqués
// par MAR et par an, dont ~40 de congés — le reste étant indisponibilités et formation.
// La feuille marque « I » sur tout jour où le MAR ne peut pas prendre de garde, sans
// distinguer les motifs ; on reconstitue ici la composition.
const PLAFOND_INDISPO=42;
// Fériés de l'année : fixes + MOBILES CALCULÉS (Pâques par l'algorithme de Meeus).
// ⚠️ Ne pas approximer les mobiles par une plage de dates : le lundi de Pâques va du
// 23 mars au 26 avril et celui de Pentecôte du 11 mai au 14 juin. Une plage trop
// étroite laisse poser des souhaits sur un lundi férié, ce qui préempte le couplage
// samedi→lundi et produit de faux « COUPLAGE SL BRISÉ » (constaté le 22/07/2026).
function paques(y){
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),
    g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,
    l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
    mo=Math.floor((h+l-7*m+114)/31),jo=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(y,mo-1,jo));
}
function feriesDe(y){
  // Réplique EXACTE de getJoursFeries() (code.gs) : mêmes dates, MÊME report au
  // lundi quand le férié tombe un dimanche (loi monégasque n°798) — sauf la Sainte
  // Dévote. Sans ce report, un lundi comme le 16/08 (Assomption décalée) n'était pas
  // reconnu comme férié par le modèle alors qu'il l'est pour le générateur.
  const P=paques(y);
  const mmdd=d=>String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  const add=n=>{const d=new Date(P); d.setUTCDate(d.getUTCDate()+n); return mmdd(d);};
  const rep=(mo,da)=>{const d=new Date(Date.UTC(y,mo-1,da));
    if(d.getUTCDay()===0) d.setUTCDate(d.getUTCDate()+1); return mmdd(d);};
  return new Set([rep(1,1),'01-27',rep(5,1),rep(8,15),rep(11,1),rep(11,19),rep(12,8),rep(12,25),
                  add(1),add(39),add(50),add(60)]);
}


// Plafond de MAR simultanément en congé d'été (le comité arbitre les vacances avant
// de générer). Sans ce plafond, le pic estival laisse des jours sans binôme.
const MAX_VAC_ETE=7;

function planifierEte(year,roster){
  const sams=[]; const d=new Date(Date.UTC(year,5,15));
  while(d.getUTCFullYear()===year && (d.getUTCMonth()<8 || d.getUTCDate()<=7)){
    if(d.getUTCDay()===6) sams.push(new Date(d));
    d.setUTCDate(d.getUTCDate()+1);
  }
  const occup=new Array(sams.length).fill(0), plan={};
  const gard=roster.filter(([id,p,q,f])=>!f.noGarde&&p>0).map(r=>r[0]);
  const autres=roster.map(r=>r[0]).filter(id=>gard.indexOf(id)<0);
  const quot={}; roster.forEach(([rid,p,qu])=>quot[rid]=qu);
  [...gard,...autres].forEach((id,i)=>{
    const qq=quot[id]||100;
    // Congés d'été au prorata du temps de travail.
    const dur=(qq>=80?2:1)+((qq>=100&&i%2===0)?1:0);   // 3 semaines l'été pour la moitié des temps pleins
    let best=-1,bestC=1e9;
    for(let st=0;st+dur<=sams.length;st++){
      let mx=0; for(let k=0;k<dur;k++) mx=Math.max(mx,occup[st+k]);
      if(mx>=MAX_VAC_ETE) continue;
      const c=occup.slice(st,st+dur).reduce((a,b)=>a+b,0)*10
              +Math.abs(st-((i*3)%Math.max(1,sams.length-dur+1)));
      if(c<bestC){bestC=c;best=st;}
    }
    if(best<0) return;
    for(let k=0;k<dur;k++) occup[best+k]++;
    plan[id]={mois:sams[best].getUTCMonth()+1, jour:sams[best].getUTCDate(), sem:dur};
  });
  return plan;
}

function buildAbsences(year,roster,scen,opts){
  // souhaitsEtendus : souhaits hors lundi/mardi/mercredi (voir bloc plus bas).
  const SOUH_ETENDUS = (opts&&opts.souhaitsEtendus!=null)
    ? !!opts.souhaitsEtendus : (process.env.SOUHAITS==='etendus');
  const SOUH_REALISTE = (opts&&opts.souhaitsRealistes!=null)
    ? !!opts.souhaitsRealistes : (process.env.SOUHAITS==='realiste');
  const im={}; const FER=feriesDe(year); const planningEte=planifierEte(year,roster);
  roster.forEach(([id,pct,q,f],idx)=>{
    // Graine décorrélée : year*1000+idx*7 produisait des tirages groupés (tous les
    // congés longs après 2037). On mélange fortement année et index.
    const R=rnd(Math.imul(year,0x9E3779B1)^Math.imul(idx+1,0x85EBCA6B)^(scen?Math.imul(scen,0xC2B2AE35):0)), m={};
    // ── CONGÉ LONG : 8 à 12 semaines (maternité, maladie). SEUL code qui baisse la cible.
    // Fréquence RÉELLE constatée dans le service : environ un congé long tous les
    // 2 à 3 ans pour l'ensemble de l'équipe — pas un par an. Avec ~20 gardeurs, cela
    // fait une probabilité de l'ordre de 1/50 par MAR et par an (≈ 0,4 CL/an).
    if(!f.noGarde && R()<1/50){
      const debut=1+Math.floor(R()*8);                 // démarre entre janvier et août
      bloc(m,year,debut,1+Math.floor(R()*20),56+Math.floor(R()*28),'CL');
    }
    // ── ÉTÉ : 2 ou 3 semaines d'affilée, ÉTALÉES sur juillet-août.
    // Les départs sont décalés en rotation (tour de rôle) et non tirés au hasard :
    // c'est ce que fait le comité en validant les vacances AVANT la génération, pour
    // garantir la couverture. Sans ce décalage, jusqu'à 2 MARs sur 3 sont absents le
    // même jour de juillet et le planning finit avec des jours non pourvus.
    // Congés posés du SAMEDI AU SAMEDI (usage réel du service). Conséquence : qui est
    // disponible un samedi l'est jusqu'au samedi suivant — donc aussi le lundi. Le
    // couplage samedi→lundi férié n'est donc presque jamais cassé par un congé.
    // Le nombre de MAR simultanément absents est plafonné par planifierEte().
    const dep=planningEte[id];
    if(dep) bloc(m,year,dep.mois,dep.jour,7*dep.sem,'VAC');
    // ── FIN D'ANNÉE et VACANCES SCOLAIRES : elles aussi posées du SAMEDI AU SAMEDI.
    // ⚠️ Ne pas les laisser démarrer un jour quelconque : une semaine commençant un
    // dimanche rendait indisponible le lundi férié suivant quelqu'un qui était de garde
    // le samedi — situation matériellement impossible (il aurait posé tout le week-end).
    const auSamedi=(mo,jo,nb)=>{
      const d=new Date(Date.UTC(year,mo-1,jo));
      while(d.getUTCDay()!==6) d.setUTCDate(d.getUTCDate()+1);
      bloc(m,year,d.getUTCMonth()+1,d.getUTCDate(),nb,'VAC');
    };
    // ⚠️ La semaine de NOËL concentre les absences : sur la feuille réelle 2026, le
    // 27/12 voit 17 gardeurs sur 20 indisponibles — c'est le point le plus tendu de
    // l'année, bien avant l'été. On reproduit ce pic : ~2/3 posent la semaine de Noël,
    // le tiers restant celle du Nouvel An.
    // FIN D'ANNÉE — la seule période où les congés ne sont PAS alignés sur le samedi :
    // chacun cale sa semaine autour du 24-25 selon ses contraintes familiales. La feuille
    // réelle 2026 le montre : les absences montent progressivement (8, 8, 9, 12, 16, 15,
    // puis 17 le 27/12) avant de retomber à 9 le 28. Un bloc identique pour tous créait
    // au contraire un plateau de 6 jours à 3 disponibles — situation où AUCUNE
    // alternance de binômes n'est mathématiquement possible (vérifié le 22/07/2026).
    // Les départs sont donc échelonnés jour par jour sur la fenêtre 18/12 → 30/12.
    const depNoel=18+((idx*5+Math.floor(R()*3))%13);
    if(depNoel<=25) bloc(m,year,12,depNoel,7,'VAC');
    else bloc(m,year,12,depNoel,32-depNoel,'VAC');   // tronqué au 31/12 (l'année suivante gère janvier)
    // DEUX semaines de vacances scolaires : avec l'été et la semaine de fin d'année,
    // on atteint ~40 jours de congés par an pour un temps plein — l'usage réel du service.
    // ⚠️ Les congés d'un temps partiel sont PROPORTIONNELS à son temps de travail :
    // quelqu'un déjà absent la moitié de l'année ne pose pas 5 semaines de congés EN PLUS
    // sur ses semaines travaillées. Sans cette proportionnalité, un 50 % se retrouvait
    // indisponible 213 j/an et n'atteignait plus sa cible (11 gardes pour 19,8) —
    // artefact du modèle, pas une limite de l'algorithme (vérifié le 22/07/2026).
    const VS=[[2,9],[4,6],[10,21]];
    // Un rythme 2 semaines / 2 semaines EST déjà du temps de repos : cette personne ne
    // pose pas en plus des semaines de congés sur ses semaines travaillées — elle les
    // prend pendant ses semaines off. Sinon on cumule deux fois le même repos et elle
    // n'atteint plus sa cible (85 % au lieu de 100 %), ce qui est un artefact.
    // Un 2/2 pose la MOITIÉ des congés d'un temps plein, sur ses semaines de présence.
    const nScol=f.r2s2?1:((q>=100)?2:(q>=80?1:0));
    // 3 périodes × 2 semaines possibles = 6 créneaux, attribués EN ROTATION par MAR.
    // ⚠️ Sans cet étalement, tout le monde posait la même semaine : 15 gardeurs sur 20
    // absents le même jour de février, et 7 à 17 jours sans binôme sur 20 ans —
    // artefact du modèle, pas une limite de l'algorithme (constaté le 22/07/2026).
    const creneau=k=>{ const c=(idx*2+k)%6, per=VS[c%3], sem=Math.floor(c/3);
      auSamedi(per[0], per[1]+sem*7, 7); };
    if(nScol>=1) creneau(0);
    if(nScol>=2) creneau(3);
    /* ── PONTS (01/09/2026) — le jour qui, posé seul, en rapporte quatre.
       Le modèle les ignorait complètement, alors que c'est le jour le plus
       demandé de l'année et qu'il tombe très souvent un vendredi, donc sur la
       moitié d'un week-end de garde. Depuis le 01/09 ils s'arbitrent au staff :
       on reproduit cet arbitrage — chacun en obtient deux ou trois, servis à
       tour de rôle, jamais tous au même. */
    {
      const chome=(ds)=>{ const dt=new Date(ds+'T12:00:00'); const w=dt.getUTCDay();
        return w===0||w===6||FER.has(ds.slice(5)); };
      const pontsAn=[]; const dP=new Date(Date.UTC(year,0,1));
      while(dP.getUTCFullYear()===year){
        const ds=iso(year,dP.getUTCMonth()+1,dP.getUTCDate());
        if(!chome(ds)){
          let n=1, aFerie=false;
          for(const pas of [-1,1]){
            const x=new Date(dP);
            for(;;){ x.setUTCDate(x.getUTCDate()+pas);
              if(x.getUTCFullYear()!==year) break;
              const xs=iso(year,x.getUTCMonth()+1,x.getUTCDate());
              if(!chome(xs)) break;
              if(FER.has(xs.slice(5))) aFerie=true;
              if(++n>10) break; }
          }
          if(n>=4&&aFerie) pontsAn.push(ds);
        }
        dP.setUTCDate(dP.getUTCDate()+1);
      }
      /* Tour de rôle décalé par l'index du MAR : sur 13 ponts et ~24 MAR,
         chacun en prend 2 ou 3 et jamais les mêmes que son voisin. */
      pontsAn.forEach((ds,k)=>{ if((k+idx)%4===0 && !m[ds]) m[ds]='VAC'; });
    }

    /* ── FORMATION / CONGRÈS — LE QUOTA ENTIER (01/09/2026).
       Le modèle n'en posait que la moitié (1 ou 2 blocs, soit ~5 jours pour un
       quota de 10). Arbitrage d'Arthur : on simule le cas où TOUT est posé
       avant la génération — c'est le plus contraignant, et c'est ce que la
       campagne demande désormais.
       Blocs de 2 à 5 jours ouvrés, jamais sur un férié : un congrès ne se tient
       pas un jour chômé. */
    {
      const quotaF=Math.round(10*(q||100)/100);
      let posF=0, essaisF=0;
      while(posF<quotaF && essaisF++<400){
        const mo=1+Math.floor(R()*12), jo=1+Math.floor(R()*24);
        const nb=Math.min(quotaF-posF, 2+Math.floor(R()*4));
        const d0=new Date(Date.UTC(year,mo-1,jo));
        let ok=true;
        for(let j=0;j<nb;j++){ const x=new Date(d0); x.setUTCDate(x.getUTCDate()+j);
          const ds=iso(year,x.getUTCMonth()+1,x.getUTCDate());
          const w=x.getUTCDay();
          if(w===0||w===6||FER.has(ds.slice(5))||m[ds]) { ok=false; break; } }
        if(!ok) continue;
        bloc(m,year,mo,jo,nb,'FORM'); posF+=nb;
      }
    }

    /* ── VACANCES HORS CALENDRIER SCOLAIRE (01/09/2026).
       Le modèle ne posait de congés QUE sur l'été, Noël et les vacances
       scolaires : 61 % des jours de l'année n'avaient aucun congé posé, ce qui
       ne ressemble pas au service. Arbitrage d'Arthur : trois quarts en période
       scolaire, un quart en dehors. On complète ici jusqu'au quota.
       Blocs du vendredi au dimanche, comme les absences réelles de 2026 :
       174 blocs sur 240 y commencent. */
    {
      const quotaV=Math.round(33*(q||100)/100);
      const ouvresV=(mm)=>{ let n=0;
        Object.keys(mm).forEach(ds=>{ if(mm[ds]!=='VAC') return;
          const dt=new Date(ds+'T12:00:00'), w=dt.getUTCDay();
          if(w>=1&&w<=5&&!FER.has(ds.slice(5))) n++; });
        return n; };
      let manque=quotaV-ouvresV(m), essaisV=0;
      while(manque>0 && essaisV++<400){
        const mo=1+Math.floor(R()*12), jo=1+Math.floor(R()*24);
        const d0=new Date(Date.UTC(year,mo-1,jo));
        while(d0.getUTCDay()!==5) d0.setUTCDate(d0.getUTCDate()+1);   // départ le vendredi
        const nb=manque>=6?10:3;                                       // 2 semaines, ou le week-end élargi
        let ok=true;
        for(let j=0;j<nb;j++){ const x=new Date(d0); x.setUTCDate(x.getUTCDate()+j);
          if(x.getUTCFullYear()!==year) { ok=false; break; }
          if(m[iso(year,x.getUTCMonth()+1,x.getUTCDate())]) { ok=false; break; } }
        if(!ok) continue;
        bloc(m,year,d0.getUTCMonth()+1,d0.getUTCDate(),nb,'VAC');
        manque=quotaV-ouvresV(m);
      }
    }
    // ── INDISPO PONCTUELLES. PLAFOND ÉTUDIÉ : 30 jours/an/MAR (statut INDISPO seul,
    // hors VAC et FORM). On simule le PIRE CAS sous la règle : tout le monde consomme
    // son quota entier, ce que personne ne fait en pratique (usage réel ~5 jours).
    // ⚠️ RÈGLE DE BON SENS (corrigée le 22/07/2026) : personne ne pose un lundi férié
    // SEUL pour s'offrir un week-end de trois jours — il poserait aussi le samedi et le
    // dimanche, sinon il risque la garde du samedi et son week-end tombe. Conséquence :
    // celui qui est de garde un samedi n'a PAS posé ce week-end, il est donc disponible
    // le lundi férié qui suit. Le couplage samedi→lundi ne peut donc quasiment jamais
    // être cassé par une indispo. Sans cette règle, le modèle produisait ~12 ruptures
    // de couplage sur 20 ans, toutes matériellement impossibles.
    const ni=Math.round(PLAFOND_INDISPO*(q||100)/100);   // indispos au prorata du temps de travail
    for(let k=0;k<ni;k++){
      const mo=1+Math.floor(R()*12), jo=1+Math.floor(R()*27);
      const d=iso(year,mo,jo); if(m[d]) continue;
      const dt=new Date(d+'T12:00:00'), dow=dt.getUTCDay(), fe=FER.has(d.slice(5));
      m[d]='INDISPO';
      if(fe && dow===1){                       // lundi férié → + samedi et dimanche avant
        for(const n of [-2,-1]){ const x=new Date(dt); x.setUTCDate(x.getUTCDate()+n);
          const ds=iso(year,x.getUTCMonth()+1,x.getUTCDate()); if(!m[ds]) m[ds]='INDISPO'; }
      } else if(fe && dow===5){                // vendredi férié → + samedi et dimanche après
        for(const n of [1,2]){ const x=new Date(dt); x.setUTCDate(x.getUTCDate()+n);
          const ds=iso(year,x.getUTCMonth()+1,x.getUTCDate()); if(!m[ds]) m[ds]='INDISPO'; }
      }
    }
    // ── SOUHAITS — usage RÉEL décrit par le service :
    //   • PRUNET (souhait_plafond, régime 1) : TOUS LES MARDIS, hors fériés et hors
    //     ses propres congés. C'est son rythme personnel, priorité absolue.
    //   • quelques MAR : des mardis choisis (régime 2, dans leur cible).
    //   • lundis / mercredis : rares.
    // ⚠️ Jamais sur un jour férié : personne ne demande une garde qui lui coûterait
    // un week-end de trois jours (et sur un lundi férié cela préempterait le
    // couplage samedi→lundi).
    const poseS=(ds)=>{ if(!m[ds] && !FER.has(ds.slice(5))) m[ds]='SOUHAIT'; };
    if(f.souhaitPlafond){                       // PRUNET : tous les mardis
      const d=new Date(Date.UTC(year,0,1));
      while(d.getUTCFullYear()===year){
        if(d.getUTCDay()===2) poseS(iso(year,d.getUTCMonth()+1,d.getUTCDate()));
        d.setUTCDate(d.getUTCDate()+1);
      }
    } else if(!f.noGarde && idx%5===1){          // ~4 MAR : des mardis choisis
      const d=new Date(Date.UTC(year,0,1));
      while(d.getUTCFullYear()===year){
        if(d.getUTCDay()===2 && R()<0.35) poseS(iso(year,d.getUTCMonth()+1,d.getUTCDate()));
        d.setUTCDate(d.getUTCDate()+1);
      }
    } else if(!f.noGarde && idx%11===4){         // ~2 MAR : quelques lundis/mercredis
      const jour=R()<0.5?1:3;
      const d=new Date(Date.UTC(year,0,1));
      while(d.getUTCFullYear()===year){
        if(d.getUTCDay()===jour && R()<0.15) poseS(iso(year,d.getUTCMonth()+1,d.getUTCDate()));
        d.setUTCDate(d.getUTCDate()+1);
      }
    }
    // ── TEMPS PARTIELS : jours non travaillés, POSÉS SUR indispos.html pour l'année
    // entière — l'algorithme les connaît donc et n'y place pas de garde.
    // Code 'TP' : bloque la disponibilité SANS réduire la cible ; c'est la quotité
    // (pct) qui porte la réduction du volume de gardes, sinon double peine.
    // ⚠️ Le drapeau r2s2 (rythme 2 semaines / 2 semaines) est écrit dans MEDECINS mais
    // n'est lu par AUCUN fichier .gs : le moteur ignore ce rythme, d'où la nécessité
    // de poser les semaines off comme indisponibilités.
    // ⚠️ Un jour de temps partiel ne se pose JAMAIS sur un férié : le jour est déjà
    // chômé, on le prendrait un autre jour de la semaine. Sans cette règle, le jour off
    // d'un 80 % ou d'un 90 % tombait parfois sur un lundi férié et cassait le couplage
    // samedi→lundi (2 cas sur 80 en 20 ans) — artefact du modèle.
    const poseTP=(ds)=>{ if(!m[ds] && !FER.has(ds.slice(5))) { m[ds]='TP'; return true; } return false; };
    // (31/07/2026) POOL LIBRE — corrigé après relevé de l'onglet MEDECINS.
    // L'ancien modèle imposait un SCHÉMA : 1 jour fixe par semaine pour un 80 %,
    // 2 jours par mois tirés entre le 1 et le 27 pour un 90 %. Deux défauts :
    //  1. le jour fixe pouvait tomber sur un axe d'équité (tous les jeudis de
    //     l'année), rendant la cible de cet axe inatteignable → équité faussée ;
    //  2. rien n'interdisait le samedi ou le dimanche — 12 % des jours TP y
    //     tombaient, alors qu'un jour de TP est un jour OUVRÉ non travaillé.
    // Réalité (Arthur) : chacun dispose d'un POOL proportionnel à sa quotité,
    // qu'il place librement — groupé en semaine, ou dispersé, sans motif.
    if(q===90 || q===80){
      const ouvres=[]; { const d=new Date(Date.UTC(year,0,1));
        while(d.getUTCFullYear()===year){ const w=d.getUTCDay();
          const ds=iso(year,d.getUTCMonth()+1,d.getUTCDate());
          if(w>=1&&w<=5&&!FER.has(ds.slice(5))) ouvres.push(ds);
          d.setUTCDate(d.getUTCDate()+1); } }
      const pool=Math.round((1-q/100)*ouvres.length);
      let pose=0, essais=0;
      while(pose<pool && essais++<3000){
        const i=Math.floor(R()*ouvres.length);
        // ~1 fois sur 3, un bloc de 3 à 5 jours ouvrés consécutifs (« je prends une semaine »)
        const long = R()<0.33 ? 3+Math.floor(R()*3) : 1;
        for(let k=0;k<long && pose<pool && i+k<ouvres.length;k++) if(poseTP(ouvres[i+k])) pose++;
      }
    } else if(q===60){                            // jeudi + vendredi
      const d=new Date(Date.UTC(year,0,1));
      while(d.getUTCFullYear()===year){
        if(d.getUTCDay()===4||d.getUTCDay()===5){
          const ds=iso(year,d.getUTCMonth()+1,d.getUTCDate()); if(!m[ds]) m[ds]='TP'; }
        d.setUTCDate(d.getUTCDate()+1); }
    }
    // ⚠️ AUCUN jour à poser pour le rythme 2/2 : le générateur le gère NATIVEMENT via
    // estSemaineOff() (generateur_gardes.gs l.35), ancré sur le lundi 01/06/2026 et lu
    // depuis la colonne rythme_2sur2 de MEDECINS. Y ajouter des jours 'TP' revient à
    // superposer DEUX blocages de phases différentes : selon l'année, l'union couvrait
    // toute l'année et la personne obtenait 0 garde pour une cible de 19,9.
    // Diagnostic du 22/07/2026 : en 2044 elle était disponible 0 jour sur 254 côté
    // algorithme alors que le modèle lui laissait 159 jours libres.
    // ── SOUHAITS ÉTENDUS (hors lundi/mardi/mercredi) — banc de robustesse ────
    // Activés par SOUHAITS=etendus (ou opts.souhaitsEtendus). DÉSACTIVÉS par défaut :
    // POSÉS EN DERNIER, uniquement sur les jours restés libres : un souhait ne doit
    // jamais prendre la place d'une absence (constaté le 25/08/2026 — posés avant les
    // temps partiels, ils occupaient la case et modifiaient les absences, rendant les
    // deux séries incomparables). On ne souhaite pas une garde un jour où l'on est absent.
    // le tirage nominal reste identique au bit près, donc les chiffres publiés dans
    // docs/presentation-staff.html restent reproductibles.
    // ⚠️ Tirage SÉPARÉ (RS) : consommer R() ici décalerait toute la suite (temps
    // partiels, étés) et les deux séries ne seraient plus comparables. Avec RS, les
    // absences sont IDENTIQUES avec et sans l'option — seuls les souhaits changent,
    // ce qui isole leur effet sur l'équité.
    // Le générateur autorise depuis 2026-08-25.1 un souhait sur N'IMPORTE QUEL jour
    // (unités couplées, fériés, Noël inclus) : ce bloc existe pour l'éprouver.
    // ── USAGE RÉALISTE (SOUHAITS=realiste) ──────────────────────────────────
    // Décrit par le service (25/08/2026) : les gens posent surtout des INDISPOS
    // (« pas de garde ce week-end ») ; DEMANDER un week-end précis est rare. On
    // modélise donc quelques demandes ponctuelles dans TOUT le service, pas par
    // personne : ~1 MAR sur 6 pose une demande de jour rare dans l'année, et
    // quelques jeudis choisis. À comparer au mode « etendus », volontairement
    // saturé, qui sert de test de robustesse et non de prévision.
    if(SOUH_REALISTE && !f.noGarde && !f.souhaitPlafond){
      const RR=rnd(Math.imul(year,0x45D9F3B)^Math.imul(idx+1,0x119DE1F3)^(scen?Math.imul(scen,0x7FEB352D):0));
      const poseR=(ds)=>{ if(!m[ds]) m[ds]='SOUHAIT'; };
      const parcours=(cb)=>{ const d=new Date(Date.UTC(year,0,1));
        while(d.getUTCFullYear()===year){ cb(d.getUTCDay(),iso(year,d.getUTCMonth()+1,d.getUTCDate())); d.setUTCDate(d.getUTCDate()+1); } };
      // un jour rare demandé par an, pour environ un MAR sur six
      if(RR()<1/6){
        const cands=[];
        parcours((dow,ds)=>{ if(dow===5||dow===6||FER.has(ds.slice(5))) cands.push(ds); });
        if(cands.length) poseR(cands[Math.floor(RR()*cands.length)]);
      }
      // quelques jeudis choisis, pour environ un MAR sur quatre
      if(RR()<1/4) parcours((dow,ds)=>{ if(dow===4 && RR()<0.08) poseR(ds); });
    }
    if(SOUH_ETENDUS && !f.noGarde && !f.souhaitPlafond){
      const RS=rnd(Math.imul(year,0x27D4EB2F)^Math.imul(idx+1,0x165667B1)^(scen?Math.imul(scen,0x9E3779B1):0));
      const poseE=(ds)=>{ if(!m[ds]) m[ds]='SOUHAIT'; };   // fériés AUTORISÉS ici
      const parcours=(cb)=>{ const d=new Date(Date.UTC(year,0,1));
        while(d.getUTCFullYear()===year){ cb(d.getUTCDay(),iso(year,d.getUTCMonth()+1,d.getUTCDate())); d.setUTCDate(d.getUTCDate()+1); } };
      const g=idx%7;
      // Répartis sur l'année (pas entassés) : un MAR qui concentre ses souhaits est
      // volontairement freiné par le garde-fou de rythme du générateur.
      if(g===0)      parcours((dow,ds)=>{ if(dow===4 && RS()<0.30) poseE(ds); });   // jeudis
      else if(g===1) parcours((dow,ds)=>{ if(dow===6 && RS()<0.25) poseE(ds); });   // samedis
      else if(g===2) parcours((dow,ds)=>{ if(dow===5 && RS()<0.22) poseE(ds); });   // week-ends (par le vendredi)
      else if(g===3) parcours((dow,ds)=>{ if(dow===0 && RS()<0.22) poseE(ds); });   // week-ends (par le dimanche)
      else if(g===4) parcours((dow,ds)=>{ if((dow===4||dow===6) && RS()<0.15) poseE(ds); }); // mixte jeu+sam
      // Fériés et veilles de férié : rares mais réels (grouper avec un pont).
      if(g<=4 && RS()<0.5) parcours((dow,ds)=>{ if(FER.has(ds.slice(5)) && RS()<0.30) poseE(ds); });
      if(g<=4 && RS()<0.5) parcours((dow,ds)=>{
        const x=new Date(ds+'T12:00:00'); x.setUTCDate(x.getUTCDate()+1);
        const lend=iso(year,x.getUTCMonth()+1,x.getUTCDate());
        if(FER.has(lend.slice(5)) && !FER.has(ds.slice(5)) && RS()<0.25) poseE(ds); });
      // Noël / Jour de l'An : un MAR sur sept en demande une date (la rotation
      // pluriannuelle doit rester maîtresse — le souhait n'y départage qu'à
      // priorité strictement égale).
      if(g===5){ const noel=[`${year}-12-24`,`${year}-12-25`,`${year}-12-31`];
        poseE(noel[Math.floor(RS()*noel.length)]); }
    }
    im[id]=m;    im[id]=m;
  });
  return im;
}

// ── Métriques d'une année ──────────────────────────────────────────────
function yearMetrics(res,y,roster){
  const st=H.readStats(res.ss,y);
  const pleins=roster.filter(([id,p,q,f])=>p===100&&q===100&&!f.noGarde&&!f.dateFin&&!f.dateDebut).map(r=>r[0]);
  const cibles=pleins.map(id=>parseFloat(String(st.byId[id]['CIBLE']).replace("'",''))).filter(v=>v>0);
  return {
    n: roster.filter(([id,p,q,f])=>!f.noGarde&&p>0).length,
    charge: cibles.length?Math.max(...cibles):0,
  };
}

function runPolicy(nom,opts){
  console.log(`\n════ POLITIQUE : ${nom} (exemption ${opts.ageExempt} ans, retraite ${opts.ageRetraite} ans) ════`);
  console.log('année  gardeurs  charge temps plein');
  let prev=null; const out=[];
  for(let y=2027;y<=2046;y++){
    const roster=buildRoster(y,opts), im=buildAbsences(y,roster);
    const res=H.runScenario({year:y, roster, indisposMap:im, statsPrev:prev});
    if(res.error){ console.log(`${y}  💥 ${res.error}`); prev=null; continue; }
    prev=res.ss.getSheetByName(`STATS_GARDES_${y}`)._rows.map(r=>r.slice());
    const m=yearMetrics(res,y,roster);
    out.push({y,...m});
    console.log(`${y}     ${String(m.n).padStart(2)}        ${m.charge.toFixed(1).padStart(5)}`);
  }
  const pic=out.reduce((a,b)=>b.charge>a.charge?b:a);
  console.log(`  → pic : ${pic.charge.toFixed(1)} gardes/an en ${pic.y} avec ${pic.n} gardeurs`);
  console.log(`  → départ 2027 : ${out[0].charge.toFixed(1)} gardes/an avec ${out[0].n} gardeurs`);
  return out;
}

if(require.main===module){
  runPolicy('STATU QUO', {ageExempt:60, ageRetraite:67});
  runPolicy('RETRAITE 65', {ageExempt:60, ageRetraite:65});
}
module.exports={EQUIPE,buildRoster,buildAbsences,runPolicy};
