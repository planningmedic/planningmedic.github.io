function fillSelect(select, list, placeholder=""){
  select.innerHTML = "";

  if(placeholder){
    const o = document.createElement("option");
    o.value = "";
    o.textContent = placeholder;
    select.appendChild(o);
  }

  list.forEach(v=>{
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function createChips(id, list, key, single=false){
  const box = $(id);
  box.innerHTML = "";
  box.className = "chip-zone";

  list.forEach(item=>{
    const chip = document.createElement("div");
chip.className =
  (key === "transfusion" || key === "drains" || (key === "reveil" && item === "Complication extubation"))
    ? "chip sub-chip"
    : "chip";    chip.textContent = item;

    if(single && state[key] === item) chip.classList.add("active");
    if(!single && Array.isArray(state[key]) && state[key].includes(item)) chip.classList.add("active");

    chip.onclick = ()=>{
      if(single){
        state[key] = state[key] === item ? "" : item;
     }else{
  const arr = state[key];
  const idx = arr.indexOf(item);

  idx > -1 ? arr.splice(idx, 1) : arr.push(item);

  if(key === "reveil" && (isSedationMode() || isECTMode() || isALRSeule())){
    if(idx === -1){
      state.reveil = [item];
    }
  }
}
      if(key === "reveil"){
        if(item === "Patient transféré intubé ventilé" && state.reveil.includes(item)){
          state.reveil = ["Patient transféré intubé ventilé"];
        }

      if(item === "Extubation"){
          if(state.reveil.includes("Extubation")){
    state.reveil = state.reveil.filter(x => x !== "Patient transféré intubé ventilé");
  }else{
    state.reveil = state.reveil.filter(x => x !== "Complication extubation");
  }
}

        if(item === "Complication extubation" && state.reveil.includes(item)){
          state.reveil = state.reveil.filter(x => x !== "Patient transféré intubé ventilé");

          if(!state.reveil.includes("Extubation")){
            state.reveil.push("Extubation");
          }
        }
      }
      if(key === "curare"){
  if(item === "Aucun" && state.curare.includes("Aucun")){
    state.curare = ["Aucun"];
    state.antagonisation = false;
  }

  if((item === "Atracurium" || item === "Rocuronium") && state.curare.includes(item)){
    state.curare = state.curare.filter(x =>
      x !== "Aucun" &&
      x !== (item === "Atracurium" ? "Rocuronium" : "Atracurium")
    );
    state.antagonisation = false;

    /* (29/10/2026) Curare non dépolarisant ⇒ TOF coché d'office (décision du
       MAR). Une seule fois, au choix du curare : on peut le décocher ensuite. */
    if(!state.monitorage.includes("TOF")){
      state.monitorage.push("TOF");
      state.tofAuto = true;
      createChips("monitorage", DATA.monitorage, "monitorage");
      renderMonitorageDetails();
    }
  }

  if(item === "Célocurine" && state.curare.includes("Célocurine")){
    state.curare = state.curare.filter(x => x !== "Aucun");
  }
}
      if(key === "monitorage" && item === "TOF") state.tofAuto = false; // choix manuel
      if(key === "monitorage" && item === "VVP" && !state.monitorage.includes("VVP")){
  state.vvpCount = 1;
}
      createChips(id, list, key, single);

      if(key === "monitorage") renderMonitorageDetails();
      if(key === "va") renderVADetails();
      if(key === "ventilation") renderVentilationDetails();
      if(key === "neuraxial") renderNeuraxialDetails();
      if(key === "antibio"){
        state.antibioManuel = !!state.antibio; // choix fait à la main
        renderAntibioDetails();
      }
      if(key === "alr") renderALRDetails();
      if(key === "analgesie") renderAnalgesieDetails();
      if(key === "curare") updateCurare();
      if(key === "typeAnesth") applyAnesthesiaMode();
      if(key === "transfusion") renderTransfusionDetails();
      if(key === "drains") renderDrainsDetails();
      if(key === "reveil"){
        if(isSedationMode() || isECTMode() || isALRSeule()){
          renderSedationSuitesDetails();
        }else{
          renderReveilDetails();
        }
    }
      renderALR();
      renderPeropVisibility();
      renderReport();
    };

if(key === "monitorage" && item === "VVP" && state.monitorage.includes("VVP")){
  const wrapper = document.createElement("div");
  wrapper.className = "chip-with-options";

  const mini = document.createElement("div");
  mini.className = "chip-mini-options";

  [1, 2].forEach(n=>{
    const opt = document.createElement("span");
    opt.className = "chip-mini-option";
    if(state.vvpCount === n) opt.classList.add("active");
    opt.textContent = n;

    opt.onclick = (e)=>{
      e.stopPropagation();
      state.vvpCount = n;
      createChips(id, list, key, single);
      renderReport();
    };

    mini.appendChild(opt);
  });

  wrapper.appendChild(mini);
  wrapper.appendChild(chip);
  box.appendChild(wrapper);
}else{
  box.appendChild(chip);
}
  });
}

function renderMonitorageDetails(){
  const box = $("monitorageDetails");

  const previousScope = $("scopeDerivations")?.value || "3 dérivations";
  const previousKta = $("ktaSite")?.value || "";
  const previousKtc = $("ktcSite")?.value || "";

const hasDetails =
  state.monitorage.includes("Scope") ||
  state.monitorage.includes("KTA") ||
  state.monitorage.includes("KTC");

if(!hasDetails){
  box.innerHTML = "";
  return;
}

box.innerHTML = `<div class="detail-box" id="monitorageDetailBox"></div>`;
const detailBox = $("monitorageDetailBox");

  if(state.monitorage.includes("Scope")){
    const s = document.createElement("select");
    s.id = "scopeDerivations";

    const list = ["3 dérivations", "5 dérivations"];
    fillSelect(s, list, "");

    if(list.includes(previousScope)) s.value = previousScope;

detailBox.appendChild(s);
  }

  if(state.monitorage.includes("KTA")){
    const s = document.createElement("select");
    s.id = "ktaSite";

    const list = ["Radial droit","Radial gauche","Fémoral droit","Fémoral gauche"];
    fillSelect(s, list, "Localisation KTA...");

    if(list.includes(previousKta)) s.value = previousKta;

detailBox.appendChild(s);
  }

  if(state.monitorage.includes("KTC")){
    const s = document.createElement("select");
    s.id = "ktcSite";

    const list = [
      "Jugulaire interne droite",
      "Jugulaire interne gauche",
      "Sous-clavier droit",
      "Sous-clavier gauche",
      "Fémoral droit",
      "Fémoral gauche"
    ];

    fillSelect(s, list, "Localisation KTC...");

    if(list.includes(previousKtc)) s.value = previousKtc;

detailBox.appendChild(s);
  }
}

function renderVADetails(){
  const box = $("vaDetails");
  box.innerHTML = "";

  $("srBlock").classList.add("hidden");
  $("ventilationBlock").classList.add("hidden");

  $("sequenceRapide").checked = false;
  state.ventilation = "";
  $("ventilationPrecision").classList.add("hidden");
  $("ventilationPrecision").value = "";

  if(state.va === "Masque laryngé"){
    box.innerHTML += `<input id="mlSize" placeholder="Taille masque laryngé">`;
  }

  if(state.va === "Intubation oro-trachéale"){
    const gestes = getSelectedGestesRaw();
    const isThoracicSelective =
      gestes.includes("Lobectomie pulmonaire") ||
      gestes.includes("Segmentectomie") ||
      gestes.includes("Œsophagectomie Lewis-Santy");

    if(isThoracicSelective){
      box.innerHTML += `
        <select id="selectiveTubeSize">
          <option value="">Taille sonde sélective...</option>
          <option>35 Fr</option>
          <option>37 Fr</option>
          <option>39 Fr</option>
          <option>41 Fr</option>
        </select>
      `;
    }else{
      box.innerHTML += `<input id="tubeSize" placeholder="Taille sonde (7.5)">`;
    }

    $("srBlock").classList.remove("hidden");
    $("ventilationBlock").classList.remove("hidden");

    createChips(
      "ventilationOptions",
      ["Facile", "Difficile", "Impossible", "Autre"],
      "ventilation",
      true
    );
  }

  updateCurare();
}

function renderVentilationDetails(){
  const isOther = state.ventilation === "Autre";

  $("ventilationPrecision").classList.toggle("hidden", !isOther);

  if(!isOther){
    $("ventilationPrecision").value = "";
  }
}

function renderNeuraxialDetails(){
  const hasPeridurale =
    state.neuraxial.includes("Péridurale") ||
    state.neuraxial.includes("Péridurale thoracique");

  $("periduraleDetails").classList.toggle("hidden", !hasPeridurale);

  if(!hasPeridurale){
    $("periduraleNiveau").value = "";
  }

  /* (29/10/2026) Produit/dose et adjuvants, en texte libre, par technique.
     Vides au départ : rien n'est écrit dans le CR tant qu'ils le restent. */
  const box = $("neuraxialDetailsBox");
  box.innerHTML = "";

  state.neuraxial.forEach(n=>{
    const d = state.neuraxialDetails[n] || (state.neuraxialDetails[n] = {});

    const bloc = document.createElement("div");
    bloc.className = "detail-box neuraxial-bloc";
    bloc.dataset.technique = n;
    bloc.style.marginTop = "8px";

    const titre = document.createElement("div");
    titre.className = "alr-bloc-titre";
    titre.textContent = n;
    bloc.appendChild(titre);

    [["produit", "Produit et dose"], ["adjuvants", "Adjuvants et doses (facultatif)"]]
      .forEach(([cle, libelle])=>{
        const i = document.createElement("input");
        i.type = "text";
        i.className = "neuraxial-" + cle + " mt8";
        i.placeholder = libelle;
        i.value = d[cle] || "";
        i.oninput = ()=>{ d[cle] = i.value; };
        bloc.appendChild(i);
      });

    box.appendChild(bloc);
  });
}

function renderAntibioDetails(){
  const isOther = state.antibio === "Autre";

  $("antibioOtherBlock").classList.toggle("hidden", !isOther);

  if(!isOther){
    $("antibioOtherText").value = "";
  }
}

function renderPeropVisibility(){
  const hideByDefault = shouldHidePeropByDefault();

  if(hideByDefault && !state.peropForced){
    $("peropCard").classList.add("hidden");
    $("showPeropBtn").classList.remove("hidden");
  }else{
    $("peropCard").classList.remove("hidden");
    $("showPeropBtn").classList.add("hidden");
  }
}
function renderTransfusionDetails(){
  const isOther = state.transfusion.includes("Autre");
  const hasProduct = state.transfusion.some(x => x !== "Autre");

  $("transfusionOtherText").classList.toggle("hidden", !isOther);
  $("transfusionQuantities").classList.toggle("hidden", !hasProduct);

  $("qteCGR").classList.toggle("hidden", !state.transfusion.includes("CGR"));
  $("qtePFC").classList.toggle("hidden", !state.transfusion.includes("PFC"));
  $("qtePlaquettes").classList.toggle("hidden", !state.transfusion.includes("Plaquettes"));
  $("qteFibrinogene").classList.toggle("hidden", !state.transfusion.includes("Fibrinogène"));
  $("qteCalcium").classList.toggle("hidden", !state.transfusion.includes("Calcium"));

  if(!state.transfusion.includes("CGR")) $("qteCGR").value = "";
  if(!state.transfusion.includes("PFC")) $("qtePFC").value = "";
  if(!state.transfusion.includes("Plaquettes")) $("qtePlaquettes").value = "";
  if(!state.transfusion.includes("Fibrinogène")) $("qteFibrinogene").value = "";
  if(!state.transfusion.includes("Calcium")) $("qteCalcium").value = "";

  if(!isOther){
    $("transfusionOtherText").value = "";
  }
}
function renderDrainsDetails(){
  const hasDrainThoracique = state.drains.includes("Drain thoracique");
  const hasRedon = state.drains.includes("Redon");
  const hasLame = state.drains.includes("Lame");
  const hasSV = state.drains.includes("Sonde vésicale");
  const isOther = state.drains.includes("Autre");

  $("drainThoraciqueText").classList.toggle("hidden", !hasDrainThoracique);
  $("redonText").classList.toggle("hidden", !hasRedon);
  $("lameText").classList.toggle("hidden", !hasLame);
  $("svText").classList.toggle("hidden", !hasSV);
  $("drainsOtherText").classList.toggle("hidden", !isOther);
  $("drainsDetailsBox").classList.toggle(
  "hidden",
  !(hasDrainThoracique || hasRedon || hasLame || hasSV || isOther)
);
  if(!hasDrainThoracique) $("drainThoraciqueText").value = "";
  if(!hasRedon) $("redonText").value = "";
  if(!hasLame) $("lameText").value = "";
  if(!hasSV) $("svText").value = "";
  if(!isOther) $("drainsOtherText").value = "";
}

function renderSedationSuitesDetails(){
  const other = state.reveil.includes("Autre");

  $("sedationSuitesOtherBlock")
    .classList.toggle("hidden", !other);

  if(!other){
    $("sedationSuitesOtherText").value = "";
  }
}

function renderReveilDetails(){
  const complication = state.reveil.includes("Complication extubation");
  const intube = state.reveil.includes("Patient transféré intubé ventilé");

  $("complicationExtubationBlock").classList.toggle("hidden", !complication);
  $("intubeVentileBlock").classList.toggle("hidden", !intube);

  if(!complication){
    $("complicationExtubationText").value = "";
  }

  if(!intube){
    $("intubeVentileReason").value = "";
  }
}

function renderAnalgesieDetails(){
  const other = state.analgesie.includes("Autre");

  $("analgesieOtherBlock")
    .classList.toggle("hidden", !other);

  if(!other){
    $("analgesieOtherText").value = "";
  }
}

function renderALRDetails(){

  const other = state.alr.includes("Autre");

  $("alrOtherText").classList.toggle("hidden", !other);

  if(!other){
    $("alrOtherText").value = "";
  }

  /* (29/10/2026) Un encadré par bloc coché : produit, volume, échoguidage,
     neurostimulation, KT. Tout est vide ou décoché au départ : le CR n'écrit
     que ce qui a été saisi. */
  const box = $("alrDetailsBox");
  box.innerHTML = "";

  state.alr.forEach(alr=>{
    const d = state.alrDetails[alr] || (state.alrDetails[alr] = {});

    const bloc = document.createElement("div");
    bloc.className = "detail-box alr-bloc";
    bloc.dataset.alr = alr;
    bloc.style.marginTop = "8px";

    const titre = document.createElement("div");
    titre.className = "alr-bloc-titre";
    titre.textContent = alr === "Autre" ? "ALR précisée ci-dessus" : alr;
    bloc.appendChild(titre);

    const ligne = document.createElement("div");
    ligne.className = "inline mt8";

    const sel = document.createElement("select");
    sel.className = "alr-produit";
    fillSelect(sel, [...ANESTHESIQUES_LOCAUX, "Autre"], "Produit...");
    sel.value = d.produit || "";
    sel.onchange = ()=>{
      d.produit = sel.value;
      if(sel.value !== "Autre") d.produitAutre = "";
      renderALRDetails();
    };
    ligne.appendChild(sel);

    const vol = document.createElement("input");
    vol.type = "number";
    vol.className = "alr-volume";
    vol.placeholder = "mL";
    vol.min = "0";
    vol.value = d.volume || "";
    vol.oninput = ()=>{ d.volume = vol.value; };
    ligne.appendChild(vol);
    bloc.appendChild(ligne);

    if(d.produit === "Autre"){
      const autre = document.createElement("input");
      autre.type = "text";
      autre.className = "alr-produit-autre mt8";
      autre.placeholder = "Préciser le produit...";
      autre.value = d.produitAutre || "";
      autre.oninput = ()=>{ d.produitAutre = autre.value; };
      bloc.appendChild(autre);
    }

    const puces = document.createElement("div");
    puces.className = "chip-zone mt8";

    const puce = (libelle, cle, classe)=>{
      const c = document.createElement("div");
      c.className = "chip sub-chip " + classe + (d[cle] ? " active" : "");
      c.textContent = libelle;
      c.onclick = ()=>{
        d[cle] = !d[cle];
        renderALRDetails();
        renderReport();
      };
      puces.appendChild(c);
    };

    puce("Échoguidé", "echo", "alr-echo");
    puce("Neurostimulation", "neurostim", "alr-neurostim");
    if(CONTINUOUS_ALR.includes(alr) || alr === "Autre"){
      puce("KT continu", "kt", "alr-kt");
    }
    bloc.appendChild(puces);

    if(d.kt){
      const kt = document.createElement("input");
      kt.type = "text";
      kt.className = "alr-kt-texte mt8";
      kt.placeholder = "Produit et débit du KT (facultatif)";
      kt.value = d.ktTexte || "";
      kt.oninput = ()=>{ d.ktTexte = kt.value; };
      bloc.appendChild(kt);
    }

    box.appendChild(bloc);
  });
}

/* Produits proposés pour l'ALR périphérique : la liste de la page d'origine. */
const ANESTHESIQUES_LOCAUX = [
  "Ropivacaïne 0,2%", "Ropivacaïne 0,375%", "Ropivacaïne 0,5%",
  "Mépivacaïne 1%", "Mépivacaïne 1,5%", "Mépivacaïne 2%",
  "Lidocaïne 1%", "Lidocaïne 2%", "Lidocaïne 2% adrénalinée"
];

function renderECTMedications(){
  const box = $("induction");
  box.innerHTML = "";
  box.className = "ect-med-list";

  DATA.ectMedications.forEach(med=>{
    const row = document.createElement("div");
    row.className = "ect-med-row";

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = med;

    if(state.induction.includes(med)){
      chip.classList.add("active");
    }

    chip.onclick = ()=>{
      const idx = state.induction.indexOf(med);

      if(idx > -1){
        state.induction.splice(idx, 1);
      }else{
        state.induction.push(med);
      }

      renderECTMedications();
      renderReport();
    };

    row.appendChild(chip);

    if(state.induction.includes(med)){
      const input = document.createElement("input");
      input.className = "ect-dose";
      input.type = "number";
      input.id = "doseECT_" + med;
      input.placeholder = "mg";
      input.value = state.ectDoses?.[med] || "";

      input.oninput = ()=>{
        if(!state.ectDoses){
          state.ectDoses = {};
        }

        state.ectDoses[med] = input.value;
        renderReport();
      };

      row.appendChild(input);
    }

    box.appendChild(row);
  });
}
