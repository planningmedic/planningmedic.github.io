// Widget « Patients lib » — pour l'appli Scriptable (iPhone). 30/10/2026.
// Installation : dans le pense-bête, onglet Réglages → « Widget de l'écran
// d'accueil », suivre les 4 étapes. Ce script ne contient aucun secret : la clé
// se colle au premier lancement et reste dans le trousseau de l'iPhone.
//
// Ce que fait le widget : il relit sur le serveur du portail la copie CHIFFRÉE
// déposée par le pense-bête, la déchiffre ici avec la clé, et affiche :
//   · grand / moyen / petit widget : les patients du jour (initiales, secteur,
//     Monaco en rouge, France en bleu), le nombre de demain ;
//   · écran verrouillé : seulement le nombre de patients lib du jour.
// Sans réseau, il affiche la dernière liste reçue. iOS décide de l'heure exacte
// des rafraîchissements (souvent toutes les 15 à 30 minutes).

const MIROIR = 'https://miroir.planningmedic.workers.dev';
const TROUSSEAU = 'patients-lib-cle';
const SECTEURS = ['Endos', 'Viscéral', 'Ortho', 'ORL', 'Cardio', 'Mater'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* ═══ CHIFFREMENT PB1 — début ══════════════════════════════════════════════
   (30/10/2026) Code IDENTIQUE dans pense-bete/index.html et dans
   pense-bete/widget-scriptable.js (le banc le vérifie caractère pour caractère).
   ChaCha20-Poly1305 (RFC 8439) écrit en JavaScript simple, sans bibliothèque ni
   fonction du navigateur : le widget (Scriptable) n'a ni crypto.subtle ni
   TextEncoder garantis. Le banc compare le résultat à celui de Node (OpenSSL).
   Message chiffré = base64url( nonce 12 octets | texte chiffré | sceau 16 octets ).
   Sans la clé (32 octets, gardée sur le téléphone et dans le widget), le serveur
   ne voit qu'une suite de caractères illisible. */
const PB=(function(){
  function rotl(v,n){ return (v<<n)|(v>>>(32-n)); }
  function u32(b,o){ return (b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0; }
  function qr(x,a,b,c,d){
    x[a]=(x[a]+x[b])>>>0; x[d]=rotl(x[d]^x[a],16)>>>0;
    x[c]=(x[c]+x[d])>>>0; x[b]=rotl(x[b]^x[c],12)>>>0;
    x[a]=(x[a]+x[b])>>>0; x[d]=rotl(x[d]^x[a],8)>>>0;
    x[c]=(x[c]+x[d])>>>0; x[b]=rotl(x[b]^x[c],7)>>>0;
  }
  function bloc(cle,compteur,nonce){
    const s=[0x61707865,0x3320646e,0x79622d32,0x6b206574];
    for(let i=0;i<8;i++) s.push(u32(cle,4*i));
    s.push(compteur>>>0); for(let i=0;i<3;i++) s.push(u32(nonce,4*i));
    const x=s.slice();
    for(let i=0;i<10;i++){
      qr(x,0,4,8,12); qr(x,1,5,9,13); qr(x,2,6,10,14); qr(x,3,7,11,15);
      qr(x,0,5,10,15); qr(x,1,6,11,12); qr(x,2,7,8,13); qr(x,3,4,9,14);
    }
    const out=new Uint8Array(64);
    for(let i=0;i<16;i++){ const v=(x[i]+s[i])>>>0; out[4*i]=v&255; out[4*i+1]=(v>>>8)&255; out[4*i+2]=(v>>>16)&255; out[4*i+3]=(v>>>24)&255; }
    return out;
  }
  function flux(cle,compteur,nonce,data){
    const out=new Uint8Array(data.length);
    for(let o=0,k=compteur;o<data.length;o+=64,k++){
      const b=bloc(cle,k,nonce);
      for(let i=0;i<64 && o+i<data.length;i++) out[o+i]=data[o+i]^b[i];
    }
    return out;
  }
  function nb(b,de,a){ let n=0n; for(let i=a-1;i>=de;i--) n=(n<<8n)|BigInt(b[i]); return n; }
  function poly(cle,msg){
    const r=nb(cle,0,16)&0x0ffffffc0ffffffc0ffffffc0fffffffn, s=nb(cle,16,32), p=(1n<<130n)-5n;
    let acc=0n;
    for(let o=0;o<msg.length;o+=16){
      const fin=Math.min(o+16,msg.length);
      acc=((acc+nb(msg,o,fin)+(1n<<BigInt(8*(fin-o))))*r)%p;
    }
    acc=(acc+s)&((1n<<128n)-1n);
    const t=new Uint8Array(16); for(let i=0;i<16;i++){ t[i]=Number(acc&255n); acc>>=8n; }
    return t;
  }
  function sceau(cle,nonce,ct){
    const pk=bloc(cle,0,nonce).slice(0,32), pad=(ct.length%16)?16-(ct.length%16):0;
    const m=new Uint8Array(ct.length+pad+16); m.set(ct,0);
    let n=ct.length; for(let i=0;i<8;i++){ m[ct.length+pad+8+i]=n%256; n=Math.floor(n/256); }
    return poly(pk,m);
  }
  function utf8e(t){
    const o=[]; t=String(t);
    for(let i=0;i<t.length;i++){
      let c=t.charCodeAt(i);
      if(c>=0xd800 && c<0xdc00 && i+1<t.length){ const d=t.charCodeAt(i+1); if(d>=0xdc00 && d<0xe000){ c=0x10000+((c-0xd800)<<10)+(d-0xdc00); i++; } }
      if(c>=0xd800 && c<0xe000) c=0xfffd;           // moitié de caractère isolée : « � », comme partout
      if(c<0x80) o.push(c);
      else if(c<0x800) o.push(0xc0|(c>>6),0x80|(c&63));
      else if(c<0x10000) o.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63));
      else o.push(0xf0|(c>>18),0x80|((c>>12)&63),0x80|((c>>6)&63),0x80|(c&63));
    }
    return Uint8Array.from(o);
  }
  function utf8d(b){
    let t='';
    for(let i=0;i<b.length;){
      let c=b[i++];
      if(c>=0xf0){ c=((c&7)<<18)|((b[i++]&63)<<12)|((b[i++]&63)<<6)|(b[i++]&63); }
      else if(c>=0xe0){ c=((c&15)<<12)|((b[i++]&63)<<6)|(b[i++]&63); }
      else if(c>=0xc0){ c=((c&31)<<6)|(b[i++]&63); }
      if(c>=0x10000){ c-=0x10000; t+=String.fromCharCode(0xd800+(c>>10),0xdc00+(c&1023)); } else t+=String.fromCharCode(c);
    }
    return t;
  }
  const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64e(b){
    let t='';
    for(let i=0;i<b.length;i+=3){
      const n=(b[i]<<16)|((b[i+1]||0)<<8)|(b[i+2]||0);
      t+=ABC[n>>18]+ABC[(n>>12)&63]+(i+1<b.length?ABC[(n>>6)&63]:'')+(i+2<b.length?ABC[n&63]:'');
    }
    return t;
  }
  function b64d(t){
    t=String(t); if(!/^[A-Za-z0-9_-]*$/.test(t) || t.length%4===1) return null;
    const o=[];
    for(let i=0;i<t.length;i+=4){
      const q=[0,1,2,3].map(k=>i+k<t.length?ABC.indexOf(t[i+k]):-1);
      const n=(q[0]<<18)|(q[1]<<12)|((q[2]<0?0:q[2])<<6)|(q[3]<0?0:q[3]);
      o.push((n>>16)&255); if(q[2]>=0) o.push((n>>8)&255); if(q[3]>=0) o.push(n&255);
    }
    return Uint8Array.from(o);
  }
  function chiffrer(cle,texte,nonce){
    const ct=flux(cle,1,nonce,utf8e(texte)), tag=sceau(cle,nonce,ct);
    const o=new Uint8Array(12+ct.length+16); o.set(nonce,0); o.set(ct,12); o.set(tag,12+ct.length);
    return b64e(o);
  }
  function dechiffrer(cle,chaine){
    const b=b64d(chaine); if(!b || b.length<28 || !cle || cle.length!==32) return null;
    const nonce=b.slice(0,12), ct=b.slice(12,b.length-16), tag=b.slice(b.length-16), att=sceau(cle,nonce,ct);
    let d=0; for(let i=0;i<16;i++) d|=att[i]^tag[i];
    return d ? null : utf8d(flux(cle,1,nonce,ct));
  }
  return {chiffrer, dechiffrer, b64e, b64d, utf8e, utf8d};
})();
/* ═══ CHIFFREMENT PB1 — fin ═══ */

const COUL = {
  fond: Color.dynamic(new Color('#FFFFFF'), new Color('#1C1C1E')),
  texte: Color.dynamic(new Color('#000000'), new Color('#FFFFFF')),
  gris: new Color('#8E8E93'),
  rouge: Color.dynamic(new Color('#C8102E'), new Color('#FF4D5E')),
  mc: Color.dynamic(new Color('#C8102E'), new Color('#FF6B7A')),
  fr: Color.dynamic(new Color('#1F4FA3'), new Color('#7EA8FF')),
};

function isoJour(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function lireCle(t) {
  const m = /^PB1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(String(t || '').trim());
  return m ? { id: m[1], cle: PB.b64d(m[2]) } : null;
}

// Fichier de secours : la dernière liste déchiffrée (sur l'iPhone seulement)
function fichierCache() { const fm = FileManager.local(); return [fm, fm.joinPath(fm.documentsDirectory(), 'patients-lib-cache.json')]; }
function cacheLire() { try { const [fm, f] = fichierCache(); return fm.fileExists(f) ? JSON.parse(fm.readString(f)) : null; } catch (e) { return null; } }
function cacheEcrire(o) { try { const [fm, f] = fichierCache(); fm.writeString(f, JSON.stringify(o)); } catch (e) {} }

async function charger(K) {
  try {
    const r = new Request(MIROIR + '/pb-lire');
    r.method = 'POST'; r.headers = { 'Content-Type': 'application/json' }; r.body = JSON.stringify({ id: K.id });
    const j = await r.loadJSON();
    if (!j || !j.success) return { erreur: j && j.error === 'Boîte inconnue' ? 'Widget désactivé dans le pense-bête' : 'Serveur : réponse inattendue', donnees: cacheLire() };
    if (!j.c) return { erreur: 'En attente du premier envoi du pense-bête', donnees: null };
    const clair = PB.dechiffrer(K.cle, j.c);
    if (clair === null) return { erreur: 'Clé incorrecte : recollez la clé du pense-bête', donnees: null };
    const d = JSON.parse(clair); d.t = j.t; cacheEcrire(d);
    return { erreur: '', donnees: d };
  } catch (e) {
    const d = cacheLire();
    return { erreur: d ? '' : 'Pas de réseau', horsLigne: !!d, donnees: d };
  }
}

function patientsDu(d, jour) {
  const rang = s => { const k = SECTEURS.indexOf(s); return k < 0 ? 99 : k; };
  return ((d && d.p) || []).filter(x => x.d === jour).sort((a, b) => rang(a.s) - rang(b.s));
}
function parSecteur(liste) {
  const g = [];
  liste.forEach(p => { let x = g.find(y => y.s === p.s); if (!x) { x = { s: p.s, p: [] }; g.push(x); } x.p.push(p); });
  return g;
}
function texte(parent, t, taille, poids, couleur) {
  const x = parent.addText(t);
  x.font = poids === 'gras' ? Font.boldSystemFont(taille) : poids === 'demi' ? Font.semiboldSystemFont(taille) : Font.systemFont(taille);
  x.textColor = couleur || COUL.texte; x.lineLimit = 1; x.minimumScaleFactor = 0.6;
  return x;
}

function construire(famille, res, maintenant) {
  const w = new ListWidget();
  const aujourdhui = isoJour(maintenant), dem = new Date(maintenant); dem.setDate(dem.getDate() + 1);
  const d = res.donnees, auj = patientsDu(d, aujourdhui), nDem = patientsDu(d, isoJour(dem)).length;
  w.refreshAfterDate = new Date(maintenant.getTime() + 15 * 60 * 1000);

  // ÉCRAN VERROUILLÉ : seulement le nombre du jour (demande du 30/10/2026)
  if (famille === 'accessoryInline') { texte(w, d ? auj.length + ' patient' + (auj.length > 1 ? 's' : '') + ' lib aujourd\'hui' : 'Patients lib : —', 12); return w; }
  if (famille === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const s = w.addStack(); s.layoutVertically(); s.centerAlignContent();
    texte(s, d ? String(auj.length) : '—', 22, 'gras'); texte(s, 'lib', 10);
    return w;
  }
  if (famille === 'accessoryRectangular') {
    texte(w, 'Patients lib', 12, 'demi');
    texte(w, d ? auj.length + ' aujourd\'hui' : (res.erreur || '—'), 18, 'gras');
    return w;
  }

  // ÉCRAN D'ACCUEIL
  w.backgroundColor = COUL.fond; w.setPadding(14, 14, 12, 14);
  const nomJour = JOURS[maintenant.getDay()] + ' ' + maintenant.getDate() + ' ' + MOIS[maintenant.getMonth()];
  texte(w, (famille === 'small' ? JOURS[maintenant.getDay()] + ' ' + maintenant.getDate() : nomJour).toUpperCase(), 11, 'demi', COUL.rouge);
  const t = w.addStack(); t.layoutHorizontally(); t.bottomAlignContent();
  texte(t, d ? String(auj.length) : '—', famille === 'small' ? 34 : 30, 'gras'); t.addSpacer(6);
  texte(t, 'patient' + (auj.length > 1 ? 's' : '') + ' lib', 13, '', COUL.gris);
  if (!d) { w.addSpacer(6); texte(w, res.erreur || 'Aucune donnée', 12, '', COUL.gris).lineLimit = 3; w.addSpacer(); return w; }
  w.addSpacer(famille === 'small' ? 4 : 8);
  const groupes = parSecteur(auj), max = famille === 'large' ? 8 : famille === 'medium' ? 3 : 4;
  groupes.slice(0, max).forEach(g => {
    const r = w.addStack(); r.layoutHorizontally(); r.centerAlignContent(); r.spacing = 6;
    texte(r, g.s, famille === 'small' ? 11 : 13, '', COUL.gris);
    if (famille === 'small') { texte(r, String(g.p.length), 11, 'demi'); return; }
    const parLigne = famille === 'large' ? 7 : 6;
    g.p.slice(0, parLigne).forEach(p => texte(r, p.i, 14, 'gras', p.a === 'fr' ? COUL.fr : p.a === 'mc' ? COUL.mc : COUL.texte));
    if (g.p.length > parLigne) texte(r, '+' + (g.p.length - parLigne), 12, '', COUL.gris);
    w.addSpacer(famille === 'large' ? 5 : 3);
  });
  if (groupes.length > max) texte(w, '+ ' + (groupes.length - max) + ' secteur' + (groupes.length - max > 1 ? 's' : ''), 11, '', COUL.gris);
  if (!auj.length) texte(w, 'Aucun patient lib aujourd\'hui', 12, '', COUL.gris);
  w.addSpacer();
  if (famille !== 'small') {
    const b = w.addStack(); b.layoutHorizontally();
    const mc = auj.filter(p => p.a === 'mc').length, fr = auj.filter(p => p.a === 'fr').length;
    texte(b, 'Demain · ' + nDem, 11, '', COUL.gris); b.addSpacer();
    texte(b, 'Monaco ' + mc, 11, 'demi', COUL.mc); b.addSpacer(6); texte(b, 'France ' + fr, 11, 'demi', COUL.fr);
  }
  if (res.horsLigne || res.erreur) texte(w, res.horsLigne ? 'hors ligne · dernière liste reçue' : res.erreur, 9, '', COUL.gris);
  return w;
}

async function demanderCle() {
  let propose = '';
  try { const pp = Pasteboard.paste(); if (lireCle(pp)) propose = pp; } catch (e) {}
  const a = new Alert();
  a.title = 'Clé du widget';
  a.message = 'Collez la clé copiée dans le pense-bête (onglet Réglages → Widget → Copier la clé).';
  a.addTextField('PB1.…', propose);
  a.addAction('Enregistrer'); a.addCancelAction('Annuler');
  if ((await a.present()) === -1) return null;
  const v = a.textFieldValue(0).trim();
  if (!lireCle(v)) { const e = new Alert(); e.title = 'Clé non reconnue'; e.message = 'Elle commence par « PB1. ». Recopiez-la depuis le pense-bête.'; e.addAction('OK'); await e.present(); return null; }
  Keychain.set(TROUSSEAU, v); return v;
}

async function principal() {
  let brut = Keychain.contains(TROUSSEAU) ? Keychain.get(TROUSSEAU) : '';
  if (config.runsInApp) {
    if (!lireCle(brut)) brut = (await demanderCle()) || '';
    else {
      const a = new Alert(); a.title = 'Patients lib'; a.message = 'Le widget est prêt.';
      a.addAction('Aperçu'); a.addAction('Changer la clé'); a.addCancelAction('Fermer');
      const c = await a.present();
      if (c === 1) brut = (await demanderCle()) || brut;
      if (c === -1) { Script.complete(); return; }
    }
  }
  const K = lireCle(brut);
  const res = K ? await charger(K) : { erreur: 'Lancez ce script dans Scriptable pour coller la clé', donnees: null };
  const w = construire(config.widgetFamily || 'large', res, new Date());
  if (config.runsInWidget) Script.setWidget(w); else await w.presentLarge();
  Script.complete();
}

if (typeof module === 'undefined' || !module.banc) await principal();
