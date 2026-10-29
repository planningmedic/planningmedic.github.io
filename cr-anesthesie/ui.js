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

  if(key === "reveil" && (isSedationMode() || isECTMode())){
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
  }

  if(item === "Célocurine" && state.curare.includes("Célocurine")){
    state.curare = state.curare.filter(x => x !== "Aucun");
  }
}
      if(key === "monitorage" && item === "VVP" && !state.monitorage.includes("VVP")){
  state.vvpCount = 1;
}
      createChips(id, list, key, single);

      if(key === "monitorage") renderMonitorageDetails();
      if(key === "va") renderVADetails();
      if(key === "ventilation") renderVentilationDetails();
      if(key === "neuraxial") renderNeuraxialDetails();
      if(key === "antibio") renderAntibioDetails();
      if(key === "alr") renderALRDetails();
      if(key === "analgesie") renderAnalgesieDetails();
      if(key === "curare") updateCurare();
      if(key === "transfusion") renderTransfusionDetails();
      if(key === "drains") renderDrainsDetails();
      if(key === "reveil"){
        if(isSedationMode() || isECTMode()){
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

  let ktBox = $("continuousALRBox");

  if(!ktBox){
    ktBox = document.createElement("div");
    ktBox.id = "continuousALRBox";
    ktBox.style.marginTop = "10px";
    $("alrCard").appendChild(ktBox);
  }

  ktBox.innerHTML = "";

  state.alr.forEach(alr=>{

    if(!CONTINUOUS_ALR.includes(alr)) return;

    const row = document.createElement("div");
    row.style.marginTop = "8px";

    const chip = document.createElement("div");
    chip.className =
      "chip sub-chip" +
      (state.continuousALR[alr] ? " active" : "");

    chip.textContent = "KT continu";
    chip.style.display = "inline-flex";
    chip.style.width = "fit-content";
    chip.onclick = ()=>{
      state.continuousALR[alr] =
        !state.continuousALR[alr];

      renderALRDetails();
      renderReport();
    };

    row.appendChild(chip);

    if(state.continuousALR[alr]){

      const input = document.createElement("input");
      input.type = "number";
      input.placeholder = "mL/h";
      input.value = state.continuousALRText[alr] || "";
      input.style.marginTop = "8px";

      input.oninput = ()=>{
        state.continuousALRText[alr] = input.value;
        renderReport();
      };

      row.appendChild(input);
    }

    ktBox.appendChild(row);
  });
}

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
