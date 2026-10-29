const $ = id => document.getElementById(id);

const report = $("report");
const anesthSelect = null;
const specialiteSelect = $("specialite");

const state = {
  monitorage: [],
  vvpCount: 1,
  induction: [],
  curare: [],
  antagonisation: false,
  va: "",
  ventilation: "",
  entretien: "",
  analgesie: [],
  antibio: "",
  alr: [],
  continuousALR: {},
  continuousALRText: {},
  neuraxial: [],
  reveil: [],
  transfusionActive: false,
  transfusion: [],
  drainsActive: false,
  drains: [],
  peropForced: false,
  peropHidden: false,
  urgence: false,
  endoscopyIntubation: false
};

function initDate(){
  const d = new Date();

  $("date").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];
}

function formatDateFR(v){
  if(!v) return "";

  const parts = v.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
/* (29/10/2026) Aucun nom dans le code (dépôt public) : l'anesthésiste et le
   chirurgien se tapent en texte libre. Les deux fonctions restent appelées. */
function updateAnesthesistes(){}

function addAnesth(removable=true){
  const row = document.createElement("div");
  row.className = "field row-inline";

  row.innerHTML = removable
    ? `<input type="text" class="anesthesiste" placeholder="Nom (facultatif)" autocomplete="off"><button class="remove-btn" type="button">–</button>`
    : `<input type="text" class="anesthesiste" placeholder="Nom (facultatif)" autocomplete="off">`;

  if(removable){
    row.querySelector(".remove-btn").onclick = ()=>{
      row.remove();
      renderReport();
    };
  }

  $("anesthContainer").appendChild(row);
  updateAnesthesistes();
}

function updateChirurgiens(){}

function addChir(removable=true){
  const row = document.createElement("div");
row.className = "field";

  row.innerHTML = removable
  ? `<div class="row-inline"><input type="text" class="chirurgien" placeholder="Nom (facultatif)" autocomplete="off"><button class="remove-btn" type="button">–</button></div>`
  : `<div class="row-inline"><input type="text" class="chirurgien" placeholder="Nom (facultatif)" autocomplete="off"></div>`;
  
  if(removable){
    row.querySelector(".remove-btn").onclick = ()=>{
      row.remove();
      renderReport();
    };
  }

  $("chirContainer").appendChild(row);
  updateChirurgiens();
}

function addGeste(removable=true){
  const list = DATA.specialites[specialiteSelect.value]?.interventions || [];

  const wrapper = document.createElement("div");
  wrapper.className = "field";

  wrapper.innerHTML = `
  <div class="row-inline">
    <select class="geste-select"></select>
    ${removable ? `<button class="remove-btn" type="button">–</button>` : ``}
  </div>
  <div class="geste-extra" style="margin-top:6px"></div>
`;

  if(removable){
    wrapper.querySelector(".remove-btn").onclick = ()=>{
      wrapper.remove();
      state.peropForced = false;
      state.peropHidden = false;
renderALR();
renderAntibio();
renderPeropVisibility();
applyAnesthesiaMode();
renderReport();
    };
  }

  $("gesteContainer").appendChild(wrapper);

  const sel = wrapper.querySelector(".geste-select");
fillSelect(sel, list, "Choisir...");

  sel.addEventListener("change", ()=>{
    state.peropForced = false;
    state.peropHidden = false;
    renderGesteExtra(wrapper, sel.value);

    applySmartPreset(sel.value);

    renderALR();
    renderAntibio();
    renderPeropVisibility();
    renderReport();
  });
}

function renderGesteExtra(wrapper, geste){
  const extra = wrapper.querySelector(".geste-extra");
  extra.innerHTML = "";

    if(DATA.lateralizedGestes.includes(geste)){
    const s = document.createElement("select");
    s.className = "laterality-select";

    let options = DATA.laterality;

    if(geste === "Colectomie"){
      options = ["Droite", "Gauche", "Totale"];
    }

    fillSelect(s, options, "Latéralité...");
    extra.appendChild(s);
  }

  if(DATA.textGestes.includes(geste)){
    const i = document.createElement("input");
    i.className = "precision-input";
    i.placeholder = "Précision...";
    extra.appendChild(i);
  }
  
if(DATA.approachOptions && DATA.approachOptions[geste]){
  const approachRow = document.createElement("div");
  approachRow.className = "row-inline";
  approachRow.style.marginTop = "8px";

  const s = document.createElement("select");
  s.className = "approach-select";
  s.style.flex = "1";
  s.style.minWidth = "0";

  fillSelect(
    s,
    DATA.approachOptions[geste],
    geste === "Néphrectomie"
      ? "Type..."
      : "Voie d'abord..."
  );
  
  approachRow.appendChild(s);

  let robotChip = null;
  let robotZone = null;

  if(DATA.robotGestes && DATA.robotGestes.includes(geste)){
    robotZone = document.createElement("div");
    robotZone.className = "chip-zone robot-zone hidden";
    robotZone.style.marginTop = "0";
    robotZone.style.flexShrink = "0";

    robotZone.innerHTML = `
      <div class="chip sub-chip robot-chip">
        Robot-assistée
      </div>
    `;

    robotChip = robotZone.querySelector(".robot-chip");

    robotChip.onclick = ()=>{
      robotChip.classList.toggle("active");
      renderReport();
    };

    approachRow.appendChild(robotZone);
  }

  s.addEventListener("change", ()=>{
    if(!robotZone) return;

    const robotAllowed =
      s.value === "Cœlioscopie" ||
      s.value === "Thoracoscopie";

    robotZone.classList.toggle("hidden", !robotAllowed);

    if(!robotAllowed && robotChip){
      robotChip.classList.remove("active");
    }

    renderReport();
  });

  extra.appendChild(approachRow);
}
  
if(geste === "Autre..."){
    const i = document.createElement("input");
    i.className = "custom-geste";
    i.placeholder = "Préciser l'intervention";
    extra.appendChild(i);
  }
}

function buildGesteLabel(block){
  let geste = block.querySelector(".geste-select")?.value;

  if(!geste) return null;

  if(geste === "Autre..."){
    geste = block.querySelector(".custom-geste")?.value || "Autre";
  }

    const lat = block.querySelector(".laterality-select")?.value;

  if(lat){
const feminin = GESTE_GENRE.feminin;
const pluriel = GESTE_GENRE.pluriel;

    let map = {
  "Droite":"droit",
  "Gauche":"gauche",
  "Bilatéral":"bilatéral",
  "Totale":"total"
};

    if(feminin.includes(geste)){
     map = {
  "Droite":"droite",
  "Gauche":"gauche",
  "Bilatéral":"bilatérale",
  "Totale":"totale"
};
    }

    if(pluriel.includes(geste)){
      map = {
        "Droite":"droites",
        "Gauche":"gauches",
        "Bilatéral":"bilatérales"
      };
    }

    if(geste === "Varices"){
      geste = "Stripping de varices";
    }

    geste += " " + map[lat];
  }

 const approach = block.querySelector(".approach-select")?.value;

if(approach){

  if(geste.startsWith("Néphrectomie")){
    geste = geste.replace(
      "Néphrectomie",
      `Néphrectomie ${approach.toLowerCase()}`
    );
  }else{
    geste += " par " + approach.toLowerCase();
  }

  const robotActive =
    block.querySelector(".robot-chip")?.classList.contains("active");

  if(robotActive){
    geste += " robot-assistée";
  }
}

  const p = block.querySelector(".precision-input")?.value;
  if(p) geste += ` (${p})`;

  return geste;
}

function getSelectedGestesRaw(){
  return [...document.querySelectorAll(".geste-select")]
    .map(x=>x.value)
    .filter(Boolean);
}
function applySmartPreset(geste){
  const preset = SMART_PRESETS[geste];

  if(!preset) return;

  if(preset.monitorage){
    state.monitorage = [...preset.monitorage];
    createChips("monitorage", DATA.monitorage, "monitorage");
    renderMonitorageDetails();
  }

  if(preset.induction){
    state.induction = [...preset.induction];
  }

  if(preset.va){
    state.va = preset.va;
  }

  if(preset.entretien !== undefined){
    state.entretien = preset.entretien;
  }

  if(preset.reveil){
    state.reveil = [...preset.reveil];
  }
}
function isSedationMode(){
  const gestes = getSelectedGestesRaw();

  if(!gestes.length) return false;

  return gestes.every(g =>
    DATA.sedationGestes && DATA.sedationGestes.includes(g)
  );
}

function isECTMode(){
  const gestes = getSelectedGestesRaw();

  if(!gestes.length) return false;

  return gestes.every(g =>
    DATA.ectGestes && DATA.ectGestes.includes(g)
  );
}
function isEndoscopyMode(){

  if(state.endoscopyIntubation){
    return false;
  }

  const gestes = getSelectedGestesRaw();

  if(!gestes.length) return false;

  return gestes.every(g =>
    ENDOSCOPY_GESTES.includes(g)
  );
}
function isEndoscopyGestureSelected(){

  const gestes = getSelectedGestesRaw();

  if(!gestes.length) return false;

  return gestes.every(g =>
    ENDOSCOPY_GESTES.includes(g)
  );
}

function isEndoscopyIntubatedMode(){

  return (
    isEndoscopyGestureSelected() &&
    state.endoscopyIntubation
  );
}
function applyAnesthesiaMode(){
const ect = isECTMode();

const endoscopyIntubated =
  !ect && isEndoscopyIntubatedMode();

const endoscopy =
  !ect &&
  !endoscopyIntubated &&
  isEndoscopyMode();

const sedation =
  !ect &&
  !endoscopy &&
  !endoscopyIntubated &&
  isSedationMode();
  
  if(ect){
  $("inductionTitle").textContent = "Anesthésie";
}else if(sedation){
  $("inductionTitle").textContent = "Sédation";
}else{
  $("inductionTitle").textContent = "Induction";
}

  $("curareCard").classList.toggle("hidden", sedation || ect);
  $("vaCard").classList.toggle("hidden", sedation || ect);
  $("entretienCard").classList.toggle("hidden", sedation || ect);
  $("antibioCard").classList.toggle("hidden", ect);
  $("analgesieCard").classList.toggle("hidden", ect);
  if(endoscopyIntubated){

  $("inductionTitle").textContent = "Induction";

  $("curareCard").classList.remove("hidden");
  $("vaCard").classList.remove("hidden");
  $("entretienCard").classList.remove("hidden");

  $("peropCard").classList.add("hidden");
  $("showPeropBtn").classList.add("hidden");

  $("analgesieCard").classList.add("hidden");
  $("alrCard").classList.add("hidden");
  $("neuraxialCard").classList.add("hidden");
  $("antibioCard").classList.add("hidden");

  $("destinationPostopBlock").classList.add("hidden");
  $("destinationPostop").value = "";

  state.va = "Intubation oro-trachéale";

  createChips(
    "vaOptions",
    ["Intubation oro-trachéale"],
    "va",
    true
  );

  renderVADetails();

}else if(endoscopy){
$("endoscopyIntubationChip")
  .classList.toggle(
    "hidden",
    !isEndoscopyGestureSelected()
  );

$("endoscopyIntubationChip")
  .classList.toggle(
    "active",
    state.endoscopyIntubation
  );
  
  $("inductionTitle").textContent = "Sédation";

  $("curareCard").classList.add("hidden");
  $("vaCard").classList.add("hidden");
  $("entretienCard").classList.add("hidden");

  $("peropCard").classList.add("hidden");
  $("showPeropBtn").classList.add("hidden");

  $("destinationPostopBlock").classList.add("hidden");
  $("destinationPostop").value = "";

  state.induction =
    state.induction.filter(x => ["Propofol"].includes(x));

  createChips(
    "induction",
    ["Propofol"],
    "induction"
  );

  state.reveil =
    state.reveil.filter(x =>
      ["Simples", "Autre"].includes(x)
    );

  createChips(
    "reveilOptions",
    ["Simples", "Autre"],
    "reveil"
  );

  renderSedationSuitesDetails();

}else if(ect){
  $("endoscopyIntubationChip")
  .classList.add("hidden");
    state.curare = [];
    state.antagonisation = false;
    state.va = "";
    state.ventilation = "";
    state.entretien = "";

    $("destinationPostopBlock").classList.add("hidden");
    $("destinationPostop").value = "";

    $("peropCard").classList.add("hidden");
    $("showPeropBtn").classList.add("hidden");

    createChips(
      "monitorage",
      ["Scope", "SpO2", "VVP"],
      "monitorage"
    );

    state.monitorage = state.monitorage.filter(x =>
      ["Scope", "SpO2", "VVP"].includes(x)
    );

    state.induction = state.induction.filter(x =>
      DATA.ectMedications.includes(x)
    );

    renderECTMedications();

    state.reveil = state.reveil.filter(x =>
    ["Simples", "Autre"].includes(x)
    );

    createChips(
      "reveilOptions",
      ["Simples", "Autre"],
      "reveil"
    );

    renderSedationSuitesDetails();
  
}else if(sedation){
  
    state.curare = [];
    state.antagonisation = false;
    state.va = "";
    state.ventilation = "";
    state.entretien = "";
    
    $("destinationPostopBlock").classList.add("hidden");
    $("destinationPostop").value = "";
    
    $("peropCard").classList.add("hidden");
    $("showPeropBtn").classList.add("hidden");
    
    createChips(
      "monitorage",
      ["Scope", "SpO2", "VVP"],
      "monitorage"
    );

    state.monitorage = state.monitorage.filter(x =>
      ["Scope", "SpO2", "VVP"].includes(x)
    );

    state.induction = state.induction.filter(x =>
      DATA.sedationMedications.includes(x)
    );

    createChips(
      "induction",
      DATA.sedationMedications,
      "induction"
    );
    
createChips(
  "analgesieOptions",
  ["Paracétamol", "Autre"],
  "analgesie"
);

state.analgesie = state.analgesie.filter(x =>
  ["Paracétamol", "Autre"].includes(x)
);

renderAnalgesieDetails();
    
    createChips(
  "antibioOptions",
  ["Aucune", "Autre"],
  "antibio",
  true
);

if(!["Aucune", "Autre"].includes(state.antibio)){
  state.antibio = "Aucune";
}

renderAntibioDetails();
    
    state.reveil = state.reveil.filter(x =>
  ["Simples", "Autre"].includes(x)
);

createChips(
  "reveilOptions",
  ["Simples", "Autre"],
  "reveil"
);

renderSedationSuitesDetails();
    
  }else{
    $("endoscopyIntubationChip")
  .classList.add("hidden");
  
    $("destinationPostopBlock").classList.remove("hidden");
    
renderPeropVisibility();
    
    createChips(
      "monitorage",
      DATA.monitorage,
      "monitorage"
    );

    createChips(
      "induction",
      DATA.induction,
      "induction"
    );
    
createChips(
  "analgesieOptions",
  ["Paracétamol", "Kétoprofène", "Néfopam", "Tramadol", "Morphine"],
  "analgesie"
);

renderAnalgesieDetails();
    
    renderAntibio();
    
    state.reveil = state.reveil.filter(x =>
  ["Extubation", "Complication extubation", "Patient transféré intubé ventilé"].includes(x)
);

createChips(
  "reveilOptions",
  ["Extubation", "Complication extubation", "Patient transféré intubé ventilé"],
  "reveil"
);

renderReveilDetails();
    
    updateCurare();
  }
const endoscopyGesture = isEndoscopyGestureSelected();

$("endoscopyIntubationChip").classList.toggle(
  "hidden",
  !endoscopyGesture
);

$("endoscopyIntubationChip").classList.toggle(
  "active",
  endoscopyGesture && state.endoscopyIntubation
);
  renderMonitorageDetails();
}

function updateCurare(){
  const sr = $("sequenceRapide").checked;

  const list = sr
    ? ["Aucun","Atracurium","Rocuronium","Célocurine"]
    : ["Aucun","Atracurium","Rocuronium"];

  state.curare = state.curare.filter(x=>list.includes(x));
createChips("curare", list, "curare");

const hasNonDepol =
  state.curare.includes("Atracurium") ||
  state.curare.includes("Rocuronium");

$("antagonisationBlock").classList.toggle("hidden", !hasNonDepol);

if(!hasNonDepol){
  state.antagonisation = false;
  $("antagonisationChip").classList.remove("active");
}
}

function handleSequenceRapideChange(){
  if($("sequenceRapide").checked){
    $("ventilationBlock").classList.add("hidden");
    state.ventilation = "";
    $("ventilationPrecision").value = "";
    $("ventilationPrecision").classList.add("hidden");
    $("ventilationOptions").innerHTML = "";
  }else if(state.va === "Intubation oro-trachéale"){
    $("ventilationBlock").classList.remove("hidden");

    createChips(
      "ventilationOptions",
      ["Facile", "Difficile", "Impossible", "Autre"],
      "ventilation",
      true
    );
  }

  updateCurare();
  renderReport();
}

function renderALR(){
  const gestes = getSelectedGestesRaw();

  const alrs = new Set();
  const neuraxials = new Set();

  gestes.forEach(g=>{
    (ALR_PERIPHERIQUE_MAP[g] || []).forEach(a=>alrs.add(a));
    (ALR_NEURAXIAL_MAP[g] || []).forEach(a=>neuraxials.add(a));
  });

  let alrList = [...alrs];

if(alrList.length > 0 && !alrList.includes("Autre")){
  alrList.push("Autre");
}

const neuraxialList = [...neuraxials];

  state.alr = state.alr.filter(x=>alrList.includes(x));
  state.neuraxial = state.neuraxial.filter(x=>neuraxialList.includes(x));

  if(alrList.length === 0){
    $("alrCard").classList.add("hidden");
    state.alr = [];
  }else{
    $("alrCard").classList.remove("hidden");
    createChips("alrOptions", alrList, "alr");
  }

  if(neuraxialList.length === 0){
    $("neuraxialCard").classList.add("hidden");
    state.neuraxial = [];
    $("periduraleDetails").classList.add("hidden");
    $("periduraleNiveau").value = "";
  }else{
    $("neuraxialCard").classList.remove("hidden");
    createChips("neuraxialOptions", neuraxialList, "neuraxial");
    renderNeuraxialDetails();
  }
}

function renderAntibio(){
  const gestes = getSelectedGestesRaw();
  const antibios = new Set();

  gestes.forEach(g=>{
    antibios.add(ANTIBIO_MAP[g] || "Aucune");
  });

  let list = [...antibios];

  if(list.length === 0){
    list = ["Aucune"];
  }

  if(!list.includes("Autre")){
    list.push("Autre");
  }

  if(!list.includes(state.antibio)){
    state.antibio = list[0];
  }

  createChips("antibioOptions", list, "antibio", true);
  renderAntibioDetails();
}

function shouldHidePeropByDefault(){
  const spec = specialiteSelect.value;
  const gestes = getSelectedGestesRaw();

  if(!gestes.length){
    return false;
  }

  if(SIMPLE_PEROP_SPECIALITES.includes(spec)){
    return true;
  }

  return gestes.every(g=>SIMPLE_PEROP_GESTES.includes(g));
}

function renderPeropVisibility(){
  if(isSedationMode() || isECTMode()){
    $("peropCard").classList.add("hidden");
    $("showPeropBtn").classList.add("hidden");
    return;
  }

  const hideByDefault = shouldHidePeropByDefault();

  if(state.peropHidden || (hideByDefault && !state.peropForced)){
    $("peropCard").classList.add("hidden");
    $("showPeropBtn").classList.remove("hidden");
  }else{
    $("peropCard").classList.remove("hidden");
    $("showPeropBtn").classList.add("hidden");
  }
}

async function copyReport(){
  const txt = buildDPIReport();

  try{
    await navigator.clipboard.writeText(txt);
  }catch{
    const old = report.value;
    report.value = txt;
    report.select();
    document.execCommand("copy");
    report.value = old;
  }

  $("copyBtn").textContent = "Copié ✓";
  $("copyBtn").classList.add("copied");

  setTimeout(()=>{
    $("copyBtn").textContent = "Copier le CR";
    $("copyBtn").classList.remove("copied");
  }, 1500);
}
function resetForm(){
  /* (29/10/2026) Un clic de trop effaçait tout le CR sans prévenir. */
  if(!confirm("Effacer tout le compte rendu en cours ?")) return;
  location.reload();
}
function initState(){
  if(!DATA.monitorage.includes("PICC Line")) DATA.monitorage.push("PICC Line");
  if(!DATA.monitorage.includes("Mid Line")) DATA.monitorage.push("Mid Line");
}

function initUI(){
  initDate();

  $("anesthContainer").innerHTML = "";
  addAnesth(false);

  fillSelect(specialiteSelect, Object.keys(DATA.specialites), "Choisir...");

  $("chirContainer").innerHTML = "";
  $("gesteContainer").innerHTML = "";

  addChir(false);
  addGeste(false);

  createChips("monitorage", DATA.monitorage, "monitorage");
  createChips("induction", DATA.induction, "induction");
  createChips("curare", ["Aucun","Atracurium","Rocuronium"], "curare");

  createChips(
    "vaOptions",
    ["Ventilation spontanée","Masque laryngé","Intubation oro-trachéale"],
    "va",
    true
  );

  createChips("entretienOptions", DATA.entretien, "entretien", true);

  createChips(
    "analgesieOptions",
    ["Paracétamol", "Kétoprofène", "Néfopam", "Tramadol", "Morphine"],
    "analgesie"
  );

  createChips(
    "reveilOptions",
    ["Extubation", "Complication extubation", "Patient transféré intubé ventilé"],
    "reveil"
  );

  createChips(
    "transfusionOptions",
    ["CGR", "PFC", "Plaquettes", "Fibrinogène", "Calcium", "Autre"],
    "transfusion"
  );

  createChips(
    "drainsOptions",
    ["Drain thoracique", "Redon", "Lame", "Sonde vésicale", "SNG", "Autre"],
    "drains"
  );

  renderAntibio();
  renderALR();
  renderPeropVisibility();
  renderReport();
}

function initListeners(){
  $("addAnesthBtn").onclick = ()=>addAnesth(true);
  $("addChirBtn").onclick = ()=>addChir(true);
  $("addGesteBtn").onclick = ()=>addGeste(true);
  $("resetBtn").onclick = resetForm;
  $("copyBtn").onclick = copyReport;

  if($("urgenceChip")){
    $("urgenceChip").onclick = ()=>{
      state.urgence = !state.urgence;
      $("urgenceChip").classList.toggle("active", state.urgence);
      renderReport();
    };
  }

  $("antagonisationChip").onclick = ()=>{
    state.antagonisation = !state.antagonisation;
    $("antagonisationChip").classList.toggle("active", state.antagonisation);
    renderReport();
  };

  $("showPeropBtn").onclick = ()=>{
    state.peropForced = true;
    state.peropHidden = false;
    renderPeropVisibility();
    renderReport();
  };

  $("removePeropBtn").onclick = ()=>{
    state.peropHidden = true;
    state.peropForced = false;
    renderPeropVisibility();
    renderReport();
  };

  $("sequenceRapide").addEventListener("change", handleSequenceRapideChange);

  $("sequenceRapideToggle").onclick = ()=>{
    $("sequenceRapide").checked = !$("sequenceRapide").checked;
    $("sequenceRapideToggle").classList.toggle("active", $("sequenceRapide").checked);
    handleSequenceRapideChange();
  };

  $("noradToggle").onclick = ()=>{
    const active = $("noradToggle").classList.toggle("active");
    $("noradBlock").classList.toggle("hidden", !active);
    if(!active) $("noradText").value = "";
    renderReport();
  };

  $("endoscopyIntubationChip").onclick = ()=>{
    state.endoscopyIntubation = !state.endoscopyIntubation;

    if(!state.endoscopyIntubation){
      state.curare = [];
      state.va = "";
      state.ventilation = "";
      state.entretien = "";
      state.antagonisation = false;

      $("sequenceRapide").checked = false;
      $("sequenceRapideToggle")?.classList.remove("active");

      createChips("curare", ["Aucun","Atracurium","Rocuronium"], "curare");
      createChips(
        "vaOptions",
        ["Ventilation spontanée","Masque laryngé","Intubation oro-trachéale"],
        "va",
        true
      );
    }

    $("endoscopyIntubationChip").classList.toggle("active", state.endoscopyIntubation);
    applyAnesthesiaMode();
    renderReport();
  };

  $("incidentToggle").onclick = ()=>{
    const active = $("incidentToggle").classList.toggle("active");
    $("incidentBlock").classList.toggle("hidden", !active);
    if(!active) $("incidentText").value = "";
    renderReport();
  };

  $("transfusionToggle").onclick = ()=>{
    state.transfusionActive = !state.transfusionActive;
    $("transfusionToggle").classList.toggle("active", state.transfusionActive);
    $("transfusionBlock").classList.toggle("hidden", !state.transfusionActive);

    if(!state.transfusionActive){
      state.transfusion = [];
      createChips(
        "transfusionOptions",
        ["CGR", "PFC", "Plaquettes", "Fibrinogène", "Calcium", "Autre"],
        "transfusion"
      );
    }

    renderReport();
  };

  $("drainsToggle").onclick = ()=>{
    state.drainsActive = !state.drainsActive;
    $("drainsToggle").classList.toggle("active", state.drainsActive);
    $("drainsBlock").classList.toggle("hidden", !state.drainsActive);

    if(!state.drainsActive){
      state.drains = [];
      createChips(
        "drainsOptions",
        ["Drain thoracique", "Redon", "Lame", "Sonde vésicale", "SNG", "Autre"],
        "drains"
      );
    }

    renderReport();
  };

  specialiteSelect.onchange = ()=>{
    state.peropForced = false;
    state.peropHidden = false;
    updateChirurgiens();

    $("chirLabel").textContent =
      ["Psychiatrie", "Endoscopie digestive"].includes(specialiteSelect.value)
        ? "Intervenant"
        : "Chirurgien";

    document.querySelectorAll(".field").forEach(block=>{
      const sel = block.querySelector(".geste-select");

      if(sel){
        fillSelect(
          sel,
          DATA.specialites[specialiteSelect.value]?.interventions || [],
          "Intervention..."
        );
        renderGesteExtra(block, sel.value);
      }
    });

    renderALR();
    renderAntibio();
    renderPeropVisibility();
    renderReport();
  };

  document.addEventListener("change", (e)=>{
    const shouldUpdateMode =
      e.target.classList.contains("geste-select") ||
      e.target.classList.contains("anesthesiste") ||
      e.target.id === "specialite";

    if(shouldUpdateMode){
      applyAnesthesiaMode();
    }

    renderReport();
  });

  document.addEventListener("input", renderReport);
}

function init(){
  initState();
  initUI();
  initListeners();
}

init();

