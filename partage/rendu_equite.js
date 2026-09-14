/* ═══════════════════════════════════════
   CARTES D'ÉQUITÉ — une seule version pour le MAR (planning) et le comité (admin)
   (14/09/2026, chantier 7)

   Avant : renderEquiteCards, ciblesEquite et eqVerdict recopiés dans les deux
   pages, avec 67 lignes d'écart. Les écarts étaient tous des ajouts côté MAR
   (le MAR connecté en tête et déplié, couleurs du mode sombre, mode
   « souhaits ») — sauf un : le mode « souhaits » manquait au comité, qui voyait
   un verdict pour un MAR sans cible. Décision du responsable : le comité voit
   la même chose que le MAR.

   Ce que la page fournit, en options :
     moiNom  : nom du MAR connecté (planning) — en tête et toujours déplié
     ouverts : Set des noms dépliés (état de la page, basculé par eqBasculer)
     sombre  : true en mode sombre (planning : IS_DARK) — couleurs des barres
     neutre  : couleur des cases sans cible (défaut : var(--surface-2))
     axes    : AX_EQUITE (défaut : window.AX_EQUITE de la page)
   L'état (EQ_LIST, EQ_OUVERTS, eqBasculer) reste dans la page.
   Une copie locale encore présente garde la main. Banc : banc_equite_commun.js. */
(function () {
  if (typeof window === 'undefined') return;
  if (typeof window.ciblesEquite !== 'function') window.ciblesEquite = function ciblesEquite(evalues, axes){
  const T = {}, ECART = { }, SEUIL = 0.01;
  evalues.forEach(m => { T[m.name] = {}; });
  axes.forEach(a => {
    const rk = a[0], ck = a[1];
    /* Axe absent de l'onglet (les fériés sur les années d'avant) : aucun MAR n'a
       de cible, on ne fabrique rien — l'axe sera simplement muet à l'écran. */
    /* (11/09/2026) ÉLIGIBLE = qui a une cible SUR CET AXE **OU** qui y a pris une
       garde. Ne retenir que les cibles non nulles écartait des deux sommes le MAR
       dont la cible entière vaut 0 et qui a pourtant assuré une veille de férié ou
       un week-end — cas ordinaire sur les axes rares, où la part individuelle vaut
       0,5. Son réel disparaissait, la somme des réels tombait sous celle des
       cibles, et l'écran affichait « des gardes ont été assurées par un médecin
       extérieur au service » sur une année parfaitement normale. Mesuré sur 2027 :
       100 week-ends réels pour 104 de cibles, 8 veilles pour 10. Le message est
       une alerte grave — il déclare l'année non comparable aux suivantes — et il
       ne doit se déclencher que lorsque des gardes ont vraiment été prises par
       quelqu'un absent de la liste. */
    const elig = evalues.filter(m => (+m[ck] || 0) > 0 || (+m[rk] || 0) > 0);
    if(!elig.length) return;
    let sr = 0, sc = 0;
    elig.forEach(m => { sr += +m[rk] || 0; sc += +m[ck] || 0; });
    if(!(sc > 0)) return;
    ECART[ck] = Math.abs(sr - sc) > SEUIL * sc;
    const f = sr / sc;                       // ramène les cibles au réel
    const base = {}; let somme = 0;
    elig.forEach(m => { base[m.name] = Math.floor((+m[ck] || 0) * f); somme += base[m.name]; });
    let reste = Math.round(sr - somme);
    const ordre = elig.slice().sort((x, y) => {
      const fx = ((+x[ck] || 0) * f) % 1, fy = ((+y[ck] || 0) * f) % 1;
      return fy - fx || (String(x.name) < String(y.name) ? -1 : 1);
    });
    let k = 0;
    while(reste > 0 && k < ordre.length * 4){ base[ordre[k % ordre.length].name]++; reste--; k++; }
    while(reste < 0 && k < ordre.length * 4){
      const n = ordre[ordre.length - 1 - (k % ordre.length)].name;
      if(base[n] > 0){ base[n]--; reste++; } k++;
    }
    elig.forEach(m => { T[m.name][ck] = base[m.name]; });
  });
  /* (11/09/2026) LE DRAPEAU EST RETIRÉ. Il servait à afficher « des gardes ont
     été assurées par un médecin extérieur au service ». Ce message se déclenchait
     sur des années parfaitement normales : la somme des réels et celle des cibles
     ne coïncident jamais tout à fait sur les axes rares, et l'écart dépassait le
     seuil de 1 %. Mesuré sur 2027 : 100 week-ends réels pour 104 de cibles.
     Un message qui déclare l'année « non comparable aux suivantes » ne peut pas
     se tromper : il alarme sans recours et sans que personne puisse le vérifier.
     La correction d'éligibilité ci-dessus règle le vrai défaut — les cibles sont
     justes. Le message, lui, ne sert plus : il est supprimé, pas rendu plus fin.
     La variable ECART reste calculée, elle documente l'écart sans rien afficher. */
  T._corrige = false;
  return T;
}

  if (typeof window.eqVerdict !== 'function') window.eqVerdict = function eqVerdict(it, cib, axes){
  // (05/09/2026) Six axes : les fériés entrent dans le verdict, comme dans le certificat.
  const AX=axes || window.AX_EQUITE;   // (14/09/2026) les axes en paramètre, sinon ceux de la page
  let pire=0, axe='';
  AX.forEach(a=>{ const t=cib&&cib[a[1]]; if(t===undefined) return;
    const d=(+it[a[0]]||0)-t; if(Math.abs(d)>Math.abs(pire)){ pire=d; axe=a[2]; } });
  if(!axe) return {t:'—', c:'var(--ink-3)', pire:0};
  if(pire===0) return {t:'à la cible', c:'#15803D', pire:0};
  return {t:(pire>0?'+':'')+pire+' '+axe.slice(0,3), c:Math.abs(pire)>=2?'#CE1126':'var(--ink-3)', pire:pire};
}

  /* Rafraîchit une grille déjà affichée sans la reconstruire (pas de saut de
     l'écran) : barres, ET ligne repliée. Identique dans les deux pages avant
     le 14/09 ; corrigé ici une fois pour les deux. */
  if (typeof window.morphGrid !== 'function') window.morphGrid = function morphGrid(oldGrid, newGridHtml){
  try{
    const tmp=document.createElement('div'); tmp.innerHTML=newGridHtml;
    const newGrid=tmp.firstElementChild;
    if(!oldGrid || !newGrid) return false;
    const oC=[...oldGrid.children], nC=[...newGrid.children];
    if(oC.length!==nC.length) return false;
    for(let i=0;i<oC.length;i++){
      const oN=oC[i].querySelector('.eqv-name'), nN=nC[i].querySelector('.eqv-name');
      if(oN&&nN&&oN.textContent!==nN.textContent) return false;
      /* (14/09/2026 — vu en production, onglet Équité du portail) La première
         peinture part SANS cibles (elles arrivent une seconde plus tard) ; le
         morph ne mettait à jour que les barres des cartes DÉPLIÉES. Toutes
         repliées : zéro ligne, « succès » sans rien changer — bandes grises et
         verdicts « — » jusqu'à un clic. La ligne repliée est synchronisée aussi. */
      const oB=oC[i].querySelector('.eqv-bande'), nB=nC[i].querySelector('.eqv-bande');
      if(oB&&nB&&oB.innerHTML!==nB.innerHTML) oB.innerHTML=nB.innerHTML;
      const oV=oC[i].querySelector('.eqv-verdict'), nV=nC[i].querySelector('.eqv-verdict');
      if(oV&&nV){ if(oV.innerHTML!==nV.innerHTML) oV.innerHTML=nV.innerHTML; oV.style.color=nV.style.color; }
      /* Déplié d'un côté, replié de l'autre : structures différentes, on laisse
         le remplacement complet faire le travail. */
      if(!!oC[i].querySelector('.eqv-bande')!==!!nC[i].querySelector('.eqv-bande')) return false;
      const oR=oC[i].querySelectorAll('.eqv-row'), nR=nC[i].querySelectorAll('.eqv-row');
      if(oR.length!==nR.length) return false;
      for(let r=0;r<oR.length;r++){
        const of=oR[r].querySelector('.eqv-fill'), nf=nR[r].querySelector('.eqv-fill');
        if(of&&nf){ of.style.width=nf.style.width; of.style.background=nf.style.background; of.style.opacity=nf.style.opacity; }
        const ot=oR[r].querySelector('.eqv-tick'), nt=nR[r].querySelector('.eqv-tick'), tk=oR[r].querySelector('.eqv-track');
        if(ot&&nt){ ot.style.left=nt.style.left; ot.style.opacity=nt.style.opacity; }
        else if(ot&&!nt){ ot.remove(); }
        else if(!ot&&nt&&tk){ tk.appendChild(nt.cloneNode(true)); }
        const ov=oR[r].querySelector('.eqv-val'), nv=nR[r].querySelector('.eqv-val');
        if(ov&&nv&&ov.innerHTML!==nv.innerHTML) ov.innerHTML=nv.innerHTML;
      }
    }
    return true;
  }catch(e){ return false; }
}

  if (typeof window.renderEquiteCards !== 'function') window.renderEquiteCards = function renderEquiteCards(list, opts){
  opts = opts || {};
  const _sombre = !!opts.sombre, _ouverts = opts.ouverts || new Set(), _neutre = opts.neutre || 'var(--surface-2)';
  const AX=[['lu','Lun'],['ma','Mar'],['me','Mer'],['je','Jeu'],['sa','Sam'],['vd','VD'],['jf','JF'],['vjf','VJF']];
  /* (05/09/2026) Les fériés ont désormais une CIBLE, servie par getStats. La barre
     « JF » était jusqu'ici tracée contre une moyenne d'équipe — un repère qui ne
     dit rien de la justice de la répartition. */
  const CB={je:'cJe',sa:'cSa',vd:'cVd',vjf:'cVjf',jf:'cJf'};
  const NEUTRAL={lu:1,ma:1,me:1}; // hors équité : pas de cible, barre neutre
  const meanAx={};
  ['lu','ma','me'].forEach(k=>{const v=list.map(x=>+x[k]||0);meanAx[k]=v.length?v.reduce((s,n)=>s+n,0)/v.length:0;});
  /* (05/09/2026) Barres et certificat lisent la MÊME cible entière : deux
     lecteurs d'une même donnée qui divergent, c'est un écran qui se contredit. */
  const _CIB = window.ciblesEquite(list.filter(x=>!x.wish), opts.axes || window.AX_EQUITE);
  const cibOf=(it,k)=>{
    if(!CB[k]) return meanAx[k];
    const ck=CB[k], t=_CIB[it.name];
    return (t && t[ck]!==undefined) ? t[ck] : (+it[ck]||0);
  };
  const colOf=(v,c)=>{const d=v-c;
    const over=_sombre?'#F4586B':'#CE1126', under=_sombre?'#7BAAF7':'#1D4ED8', ok=_sombre?'#5BD08B':'#15803D';
    return d>=2?over:(d<=-2?under:ok);};
  const maxOf=k=>Math.max(0.1,...list.map(x=>+x[k]||0),...list.map(x=>cibOf(x,k)))*1.15;
  const maxTot=Math.max(0.1,...list.map(x=>+x.total||0))*1.12; // échelle = totaux réels (une cible aberrante ne peut plus vider la barre)
  /* (28/08/2026) Axes SANS cible : UNE seule échelle pour Lun/Mar/Mer. Chacun
     avait la sienne, calculée sur son propre maximum d'équipe : 3 mercredis
     donnaient une barre quatre fois plus longue que 4 mardis. Le MAR à souhaits
     garantis est exclu du calcul — ses 43 mardis étiraient l'échelle du mardi et
     écrasaient les barres des 23 autres. Sa propre barre sature à 100 %, ce qui
     est juste : sa carte n'est comparable à aucune autre, elle porte déjà un
     total « souhaits » sans cible. */
  const mxGris=Math.max(0.1,...list.filter(x=>!x.wish).flatMap(x=>[+x.lu||0,+x.ma||0,+x.me||0]))*1.15;
  const _meN = opts.moiNom || null; // le MAR connecté (planning) en tête ; le comité n'en a pas
  const sorted=list.slice().sort((a,b)=>{
    if(_meN){ if(String(a.name)===_meN) return -1; if(String(b.name)===_meN) return 1; }
    return String(a.name).localeCompare(String(b.name));
  });
  return '<div class="eqv-grid">'+sorted.map(it=>{
    const _wish=!!it.wish;
    const _tci=_CIB[it.name];
    const tv=+it.total||0, tc=_wish?0:((_tci&&_tci.cTot!==undefined)?_tci.cTot:(+it.cTot||0)),
          tw=Math.min(100,tv/maxTot*100), tcx=Math.min(100,tc/maxTot*100);
    const _totFill=_wish?'#94A3B8':colOf(tv,tc), _totOpac=_wish?';opacity:.5':'';
    const _totVal=_wish?(tv+'<span> souhaits</span>'):(tv+'<span> /'+(tc>0?Math.round(tc):'—')+'</span>');
    const totBar='<div class="eqv-row eqv-row-tot"><div class="eqv-lbl">Total</div><div class="eqv-track eqv-track-tot"><div class="eqv-fill" style="width:'+tw+'%;background:'+_totFill+_totOpac+'"></div>'+((tc>0&&!_wish)?'<div class="eqv-tick" style="left:'+tcx+'%"></div>':'')+'</div><div class="eqv-val">'+_totVal+'</div></div>';
    const bars=AX.map(([k,lbl])=>{
      const v=+it[k]||0;
      if(NEUTRAL[k]||_wish){
        const w=Math.min(100,v/mxGris*100);
        return '<div class="eqv-row"><div class="eqv-lbl">'+lbl+'</div><div class="eqv-track"><div class="eqv-fill" style="width:'+w+'%;background:#94A3B8;opacity:.5"></div></div><div class="eqv-val">'+v+'</div></div>';
      }
      /* (05/09/2026) Une cible ABSENTE n'est pas une cible à zéro. Sur les années
         antérieures, l'onglet de statistiques s'arrête avant la colonne des fériés :
         la barre affichait « 2 /0 » en rouge, une accusation fabriquée de toutes
         pièces. Sans cible, la barre redevient neutre, comme les lundis. */
      const c=cibOf(it,k);
      if(CB[k] && !(c>0)){
        const w=Math.min(100,v/mxGris*100);
        return '<div class="eqv-row"><div class="eqv-lbl">'+lbl+'</div><div class="eqv-track"><div class="eqv-fill" style="width:'+w+'%;background:#94A3B8;opacity:.5"></div></div><div class="eqv-val">'+v+'</div></div>';
      }
      const mx=maxOf(k);
      const w=Math.min(100,v/mx*100),cx=Math.min(100,c/mx*100);
      const cval=CB[k]?Math.round(c):c.toFixed(1),tick=CB[k]?'':'opacity:.42';
      return '<div class="eqv-row"><div class="eqv-lbl">'+lbl+'</div><div class="eqv-track"><div class="eqv-fill" style="width:'+w+'%;background:'+colOf(v,c)+'"></div><div class="eqv-tick" style="left:'+cx+'%;'+tick+'"></div></div><div class="eqv-val">'+v+'<span> /'+cval+'</span></div></div>';
    }).join('');
    const _isMe = _meN && String(it.name)===_meN;
    /* Ligne repliée : une case par axe, dans le MÊME ordre que les barres, pour
       que les colonnes se lisent d'une ligne à l'autre. */
    const ORDRE=[['total','cTot'],['lu',null],['ma',null],['me',null],['je','cJe'],
                 ['sa','cSa'],['vd','cVd'],['jf',null],['vjf','cVjf']];
    const cib=_CIB[it.name];
    const bande=ORDRE.map(([k,ck])=>{
      const t=(ck&&cib&&!_wish&&cib[ck]>0)?cib[ck]:undefined;
      if(t===undefined) return '<div class="eqv-case" style="background:'+_neutre+'"></div>';
      const d=Math.abs((+it[k]||0)-t);
      return '<div class="eqv-case" style="background:'+(d>=2?'#CE1126':'#15803D')+';opacity:'+(d===0?1:(d>=2?1:.35))+'"></div>';
    }).join('');
    const v=_wish?{t:'souhaits',c:'#7c3aed'}:window.eqVerdict(it,cib,opts.axes || window.AX_EQUITE);
    // Le MAR connecté est TOUJOURS déplié : c'est sa carte qu'il vient voir.
    const ouvert=_isMe||_ouverts.has(it.name);
    const _esc=String(it.name).replace(/'/g,"\\'");
    return '<div class="eqv-card'+(_isMe?' me-card':'')+'">'
      + '<div class="eqv-tete" onclick="eqBasculer(&quot;'+_esc+'&quot;)">'
      +   '<div class="eqv-name" style="width:82px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+it.name+'</div>'
      +   (ouvert?'<div style="flex:1"></div>':'<div class="eqv-bande">'+bande+'</div>')
      +   '<div class="eqv-verdict" style="color:'+v.c+'">'+v.t+'</div>'
      +   '<div class="eqv-chev">'+(ouvert?'▲':'▼')+'</div>'
      + '</div>'
      + (ouvert?('<div style="padding:0 11px 10px">'+totBar+bars+'</div>'):'')
      + '</div>';
  }).join('')+'</div>';
}

})();
