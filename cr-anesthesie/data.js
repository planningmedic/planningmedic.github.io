const DATA = {

  anesthesistes: [],

  monitorage: ["Scope","SpO2","VVP","KTA","KTC","BIS","TOF"],

  induction: ["Sufentanil","Rémifentanil","Kétamine","Etomidate","Propofol"],

  entretien: ["Sevoflurane","Propofol AIVOC"],
  
  sedationGestes: [
  "Cataracte"
],
  
ectGestes: [
  "Electroconvulsivothérapie"
],

ectMedications: [
  "Propofol",
  "Célocurine",
  "Kétamine"
],
  
  sedationMedications: [
  "Midazolam",
  "Propofol",
  "Sufentanil",
  "Kétamine"
],
  
  laterality: ["Droite","Gauche","Bilatéral"],

  lateralizedGestes: [
  "PTH",
  "PTG",
  "Hallux valgus",
  "Clou gamma",
  "Varices",
  "Canal carpien",
  "Ostéosynthèse poignet",
  "Ostéosynthèse cheville",
  "Hernie inguinale",
  "Colectomie",
  "Annexectomie",
  "Kystectomie ovarienne",
  "Cataracte",
  "Prothèse d'épaule",
  "Arthroscopie de genou",
  "Arthroscopie d'épaule",
  "Mastectomie partielle",
  "Mastectomie totale",
  "Surrénalectomie",
  "Néphrectomie",
  "Montée de JJ",
  "URS + Laser",
  "UPR",
  "Ostéosynthèse plateau tibial",
  "Arthroscopie cheville",
  "Ethmoïdectomie",
  "Blépharoplastie",
  ],
  
approachOptions: {
  "Colectomie": ["Cœlioscopie", "Laparotomie"],
  "Néphrectomie": ["Totale", "Partielle"],
  "Appendicectomie": ["Cœlioscopie", "Laparotomie"],
  "Cholécystectomie": ["Cœlioscopie", "Laparotomie"],
  "Annexectomie": ["Cœlioscopie", "Laparotomie"],
  "Hystérectomie": ["Cœlioscopie", "Laparotomie"],
  "Kystectomie ovarienne": ["Cœlioscopie", "Laparotomie"],
  "Prostatectomie totale": ["Robot-assistée", "Laparotomie"],
  "Lobectomie pulmonaire": ["Thoracoscopie", "Thoracotomie"],
  "Segmentectomie": ["Thoracoscopie", "Thoracotomie"],
  "Sigmoïdectomie": ["Cœlioscopie", "Laparotomie"],
  "Résection grêlique": ["Cœlioscopie", "Laparotomie"],
  "Cure d’éventration": ["Cœlioscopie", "Laparotomie"],
  "Cure de hernie hiatale": ["Cœlioscopie", "Laparotomie"],
  "Sleeve gastrectomie": ["Cœlioscopie", "Laparotomie"],
  "Bypass gastrique": ["Cœlioscopie", "Laparotomie"],
  "Splénectomie": ["Cœlioscopie", "Laparotomie"],
  "Surrénalectomie": ["Cœlioscopie", "Laparotomie"],
  "Rétablissement de continuité": ["Cœlioscopie", "Laparotomie"],
},
  textGestes: [
    "Lobectomie pulmonaire",
    "Segmentectomie",
    "Recalibrage",
    "Vertébroplastie",
    "Segmentectomie hépatique",
    "Embolisation"
  ],
  
  robotGestes: [
  "Colectomie",
  "Sigmoïdectomie",
  "Résection grêlique",
  "Cure d’éventration",
  "Sleeve gastrectomie",
  "Bypass gastrique",
  "Surrénalectomie",
  "Hystérectomie",
  "Annexectomie",
  "Lobectomie pulmonaire",
  "Segmentectomie"
],

  specialites: {
    "Orthopédie": {
      chirurgiens: [],
      interventions: [
        "PTH","PTG","Ostéosynthèse cheville","Ostéosynthèse poignet",
        "Recalibrage","Canal carpien","Hallux valgus","Clou gamma",
        "Prothèse d'épaule","Arthroscopie de genou","Arthroscopie d'épaule","Ostéosynthèse plateau tibial",
        "Arthroscopie cheville",
        "Autre..."
      ]
    },

    "Viscéral": {
      chirurgiens: [],
      interventions: [
        "Duodénopancréatectomie céphalique",
        "Œsophagectomie Lewis-Santy",
        "Appendicectomie",
        "Hernie inguinale",
        "Hernie ombilicale",
        "Hémorroïdectomie",
        "Colectomie",
        "Coelioscopie exploratrice",
        "Cholécystectomie",
        "Promontofixation",
        "Mastectomie partielle",
        "Mastectomie totale",
        "Injection Bulkamide",
        "Annexectomie",
        "Hystérectomie",
        "CHIP",
        "Kystectomie ovarienne",
        "Segmentectomie hépatique",
"Amputation abdomino-périnéale",
"Sigmoïdectomie",
"Résection grêlique",
"Rétablissement de continuité",
"Cure d’éventration",
"Cure de hernie hiatale",
"Sleeve gastrectomie",
"Bypass gastrique",
"Splénectomie",
"Surrénalectomie",
"Thyroïdectomie totale",
"Parathyroïdectomie",
        "Autre..."
      ]
    },

    "Thoracique": {
      chirurgiens: [],
      interventions: [
        "Lobectomie pulmonaire",
        "Segmentectomie",
        "Talcage pleural",
        "Médiastinoscopie",
        "Autre..."
      ]
    },

    "Endoscopie digestive": {
      chirurgiens: [],
      interventions: [
        "Gastroscopie","Coloscopie","Echo-endoscopie haute","RSF","ERCP",
        "Pose de prothèse biliaire","Dissection sous-muqueuse","Mucosectomie",
        "POEM","Autre..."
      ]
    },

    "Cardiologie interventionnelle": {
      chirurgiens: [],
      interventions: ["Ablation de FA","Ablation de flutter","Autre..."]
    },

    "Radiologie interventionnelle": {
      chirurgiens: [],
      interventions: ["Vertébroplastie","Embolisation","Autre..."]
    },

    "Gynécologie / Obstétrique": {
      chirurgiens: [],
      interventions: [
        "Césarienne","Hystérectomie","Annexectomie",
        "Conisation","Nymphoplastie de réduction",
        "Curetage","Cerclage","Autre..."
      ]
    },

    "Urologie": {
      chirurgiens: [],
      interventions: [
        "Prostatectomie totale","Biopsies de prostate",
        "REP HOLEP","REV","URS + Laser","Montée de JJ",
        "Néphrectomie","Posthectomie","UPR",
        "Cystectomie totale",
        "Autre..."
      ]
    },

    "ORL": {
      chirurgiens: [],
      interventions: [
        "Septoplastie","Rhinoplastie","Thyroïdectomie totale",
        "Thyroïdectomie partielle","Parathyroïdectomie",
        "Extraction DDS","Carcinome cutané","Cholestéatome",
        "Adénoidectomie","DTT","Turbinoplastie","Ethmoïdectomie",
        "Adénoamygdalectomie","Autre..."
      ]
    },

    "Vasculaire": {
      chirurgiens: [],
      interventions: ["Varices","Autre..."]
    },
    
"Psychiatrie": {
   chirurgiens: [],
    interventions: ["Electroconvulsivothérapie"]
  },
  
    "Ophtalmologie": {
      chirurgiens: [],
      interventions: ["Cataracte","Blépharoplastie","Autre..."]
    }
  }
};

const GESTE_GENRE = {
  feminin: [
    "PTH",
    "PTG",
    "Ostéosynthèse cheville",
    "Ostéosynthèse poignet",
    "Hernie inguinale",
    "Colectomie",
    "Annexectomie",
    "Kystectomie ovarienne",
    "Cataracte",
    "Néphrectomie",
    "Prothèse d'épaule",
    "Arthroscopie de genou",
    "Arthroscopie d'épaule",
    "Mastectomie partielle",
    "Mastectomie totale",
    "Arthroscopie cheville",
    "Ostéosynthèse plateau tibial",
    "Blépharoplastie",
    "Surrénalectomie",
    "Thyroïdectomie totale",
    "Thyroïdectomie partielle",
    "Parathyroïdectomie"
  ],
  pluriel: [
    "Varices"
  ]
};
