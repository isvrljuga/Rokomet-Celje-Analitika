// Skupna baza (Firebase): tekme vidi vsak s povezavo, vnašajo prijavljeni, briše le skrbnik.
// Brez nastavitev v firebase-config.js aplikacija deluje kot prej, samo v tej napravi.
const CLOUD=window.CELJE_CLOUD||{};
const cloudOn=!!CLOUD.firebase?.apiKey;
const CLOUD_TEAMS=['members','juniors'];
let cloudUser=null,cloudDb=null,cloudReady=false,cloudTimer=null;
let cloudSent={},cloudRemote={},cloudRosterSent={};

function cloudAdmin(){return !!cloudUser&&(CLOUD.adminUids||[]).includes(cloudUser.uid)}
// Urejati sme skrbnik ali tisti, ki je tekmo ustvaril; nova (še neposlana) tekma je od trenutnega uporabnika.
function cloudOwner(gid){return cloudRemote[gid]?cloudRemote[gid].owner||null:cloudUser?.uid||null}
function cloudCanEdit(g){return !cloudOn||!g||g.imported||cloudAdmin()||(!!cloudUser&&cloudOwner(g.id)===cloudUser.uid)}
function cloudGameJson(g){const {updatedAt,...rest}=g;return JSON.stringify(rest)}
function cloudLoadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
function cloudStatus(text){const c=$('.connection');if(c)c.innerHTML=`<span class="dot"></span> ${esc(text)}`}
function cloudErr(e){console.error(e);toast(e?.code==='permission-denied'?'Za to nimaš dovoljenja v skupni bazi.':'Shranjevanje v skupno bazo ni uspelo – podatki so v napravi.')}

function cloudUi(){
  document.body.classList.toggle('ro',cloudOn&&!cloudUser);
  document.body.classList.toggle('notadmin',cloudOn&&!cloudAdmin());
  const btn=$('#cloudBtn');if(!btn)return;
  btn.textContent=cloudUser?`Odjava · ${cloudUser.displayName?.split(' ')[0]||cloudUser.email?.split('@')[0]||'račun'}`:'Prijava za vnos';
  cloudStatus(cloudReady?(cloudUser?'Skupna baza · vnos':'Skupna baza · samo ogled'):'Povezujem s skupno bazo …');
}
async function cloudGoogle(){
  const auth=firebase.auth(),provider=new firebase.auth.GoogleAuthProvider();
  try{await auth.signInWithPopup(provider)}catch(e){if(e?.code==='auth/popup-closed-by-user')return;await auth.signInWithRedirect(provider)}
}
const CLOUD_AUTH_ERR={'auth/invalid-email':'E-poštni naslov ni veljaven.','auth/missing-password':'Vpiši geslo.','auth/weak-password':'Geslo mora imeti vsaj 6 znakov.','auth/email-already-in-use':'Ta e-pošta že ima račun – prijavi se.','auth/invalid-credential':'Napačna e-pošta ali geslo.','auth/wrong-password':'Napačna e-pošta ali geslo.','auth/user-not-found':'Napačna e-pošta ali geslo.','auth/too-many-requests':'Preveč poskusov, poskusi čez nekaj minut.','auth/operation-not-allowed':'Prijava z e-pošto v Firebase še ni vklopljena.'};
// Okno za prijavo: Google ali katerikoli e-poštni naslov z geslom (nov račun se ustvari z imenom).
function cloudSignIn(){
  const overlay=document.createElement('div');overlay.className='modal-backdrop';let mode='login';
  const draw=()=>{overlay.innerHTML=`<div class="modal"><div class="panel-head"><div><p class="eyebrow">Skupna baza</p><h2>${mode==='login'?'Prijava za vnos':'Nov račun'}</h2></div><button class="btn small" data-close>Zapri</button></div>
    <div class="form-grid">${mode==='new'?'<div class="field full"><label for="caName">Ime in priimek</label><input id="caName" autocomplete="name"></div>':''}
    <div class="field full"><label for="caMail">E-pošta</label><input id="caMail" type="email" autocomplete="email" inputmode="email"></div>
    <div class="field full"><label for="caPass">Geslo${mode==='new'?' (vsaj 6 znakov)':''}</label><input id="caPass" type="password" autocomplete="${mode==='new'?'new-password':'current-password'}"></div></div>
    <p class="muted" id="caErr" role="alert" style="color:var(--red);min-height:20px;margin:10px 0 0"></p>
    <div class="toolbar" style="margin-top:6px"><button class="btn primary" id="caGo" style="flex:1;min-height:48px">${mode==='login'?'Prijava':'Ustvari račun'}</button></div>
    <div class="toolbar" style="margin-top:10px;justify-content:space-between"><button class="btn small" id="caMode">${mode==='login'?'Nimaš računa? Ustvari ga':'Že imaš račun? Prijava'}</button>${mode==='login'?'<button class="btn small" id="caReset">Pozabljeno geslo</button>':''}</div>
    <hr class="divider"><button class="btn" id="caGoogle" style="width:100%;min-height:48px">Prijava z Google računom</button></div>`;
    const err=m=>{overlay.querySelector('#caErr').textContent=m},val=s=>overlay.querySelector(s)?.value.trim()||'';
    overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
    overlay.querySelector('#caMode').onclick=()=>{mode=mode==='login'?'new':'login';draw()};
    overlay.querySelector('#caGoogle').onclick=()=>{overlay.remove();cloudGoogle()};
    overlay.querySelector('#caReset')?.addEventListener('click',async()=>{const m=val('#caMail');if(!m){err('Vpiši e-pošto, nato tapni Pozabljeno geslo.');return}try{await firebase.auth().sendPasswordResetEmail(m);err('');toast('Poslali smo ti e-pošto za novo geslo.')}catch(e){err(CLOUD_AUTH_ERR[e?.code]||'Pošiljanje ni uspelo.')}});
    const go=async()=>{const m=val('#caMail'),p=overlay.querySelector('#caPass').value,n=val('#caName');
      if(mode==='new'&&!n){err('Vpiši ime – pokaže se pri tekmah, ki jih vneseš.');return}
      try{const auth=firebase.auth();
        if(mode==='login')await auth.signInWithEmailAndPassword(m,p);
        else{const cred=await auth.createUserWithEmailAndPassword(m,p);await cred.user.updateProfile({displayName:n});cloudUser=auth.currentUser||cred.user;cloudUi();render()}
        overlay.remove();toast(mode==='login'?'Prijava uspešna.':'Račun je ustvarjen.')}
      catch(e){console.error(e);err(CLOUD_AUTH_ERR[e?.code]||'Prijava ni uspela.')}};
    overlay.querySelector('#caGo').onclick=go;overlay.querySelector('#caPass').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
    (overlay.querySelector('#caName')||overlay.querySelector('#caMail')).focus();
  };
  draw();document.body.appendChild(overlay);
}

// Pošlje spremenjene tekme in sezname igralk. Imported tekme iz Excela ostanejo lokalne.
function cloudPush(){
  if(!cloudOn||!cloudUser||!cloudDb||!cloudReady)return;
  const local=new Map();
  for(const t of CLOUD_TEAMS)for(const g of state.teams[t].games){if(g.imported)continue;local.set(g.id,{t,g})}
  for(const [gid,{t,g}] of local){
    const j=cloudGameJson(g);if(cloudSent[gid]===j||!cloudCanEdit(g))continue;
    cloudSent[gid]=j;g.updatedAt=Date.now();
    const r=cloudRemote[gid],owner=r?.owner||cloudUser.uid,ownerName=r?.owner?r.ownerName||'':cloudUser.displayName||cloudUser.email||'';
    cloudDb.collection('games').doc(gid).set({team:t,json:j,updatedAt:g.updatedAt,owner,ownerName,by:cloudUser.uid,byName:cloudUser.displayName||cloudUser.email||''}).catch(e=>{delete cloudSent[gid];cloudErr(e)});
  }
  // Brisanje: posamezna tekma, ki je skrbnik ni več imel, se izbriše; več hkrati (npr. uvoz kopije) se ne briše.
  const missing=Object.keys(cloudRemote).filter(gid=>!local.has(gid));
  if(missing.length===1&&cloudAdmin())cloudDb.collection('games').doc(missing[0]).delete().catch(cloudErr);
  else if(missing.length){for(const gid of missing){const d=cloudRemote[gid];state.teams[d.team]?.games.push(Object.assign(JSON.parse(d.json),{updatedAt:d.updatedAt}))}cloudLocalSave();if(!cloudAdmin())toast('Tekme lahko izbriše samo skrbnik.');render()}
  for(const t of CLOUD_TEAMS){const j=JSON.stringify(state.teams[t].roster);if(cloudRosterSent[t]===j)continue;cloudRosterSent[t]=j;cloudDb.collection('rosters').doc(t).set({json:j,updatedAt:Date.now(),by:cloudUser.uid}).catch(e=>{delete cloudRosterSent[t];cloudErr(e)})}
}

function cloudOnGames(snap){
  let changed=false;
  snap.docChanges().forEach(ch=>{
    const gid=ch.doc.id,d=ch.doc.data();
    if(ch.type==='removed'){delete cloudRemote[gid];delete cloudSent[gid];for(const t of CLOUD_TEAMS){const n=state.teams[t].games.length;state.teams[t].games=state.teams[t].games.filter(g=>g.id!==gid);if(n!==state.teams[t].games.length)changed=true}if(gameId===gid){gameId=null;view='matches'}return}
    cloudRemote[gid]=d;
    if(cloudSent[gid]===d.json)return;
    const list=state.teams[d.team]?.games;if(!list)return;
    const i=list.findIndex(x=>x.id===gid);
    // Prijavljen vnašalec obdrži svojo novejšo, še neposlano različico.
    if(i>=0&&cloudCanEdit(list[i])&&cloudUser&&(list[i].updatedAt||0)>d.updatedAt)return;
    const g=Object.assign(JSON.parse(d.json),{updatedAt:d.updatedAt});
    if(i>=0)list[i]=g;else list.push(g);
    cloudSent[gid]=d.json;changed=true;
  });
  const first=!cloudReady;cloudReady=true;
  if(changed){cloudLocalSave();render()}
  if(first){cloudUi();cloudOpenHash();cloudPush()}
}
function cloudOnRosters(snap){
  let changed=false;
  snap.docChanges().forEach(ch=>{if(ch.type==='removed')return;const t=ch.doc.id,d=ch.doc.data();if(!state.teams[t]||cloudRosterSent[t]===d.json)return;cloudRosterSent[t]=d.json;state.teams[t].roster=JSON.parse(d.json);changed=true});
  if(changed){cloudLocalSave();render()}
}

// Povezava #tekma=<id> odpre tekmo (gledalci vidijo zapisnik brez urejanja).
function cloudShareUrl(gid){return `${location.origin}${location.pathname}#tekma=${gid}`}
function cloudOpenHash(){
  const m=location.hash.match(/tekma=([\w-]+)/);if(!m)return;
  for(const t of CLOUD_TEAMS)if(state.teams[t].games.some(g=>g.id===m[1])){team=t;$$('[data-team]').forEach(b=>b.classList.toggle('active',b.dataset.team===t));gameId=m[1];view='game';render();return}
}
async function cloudCopy(gid){const url=cloudShareUrl(gid);try{await navigator.clipboard.writeText(url);toast('Povezava do tekme je kopirana.')}catch{prompt('Kopiraj povezavo do tekme:',url)}}

const cloudLocalSave=save;
save=function(){cloudLocalSave();if(cloudOn&&cloudReady){clearTimeout(cloudTimer);cloudTimer=setTimeout(cloudPush,600)}};

const cloudRenderGame=renderGame;
renderGame=function(){
  const g=game(),ro=cloudOn&&!!g&&!cloudCanEdit(g);
  document.body.classList.toggle('ro',cloudOn&&(!cloudUser||ro));
  if(ro)classicRenderGame();else cloudRenderGame();
  if(ro&&cloudUser){const r=cloudRemote[g.id];$('#view-game .match-banner')?.insertAdjacentHTML('afterend',`<div class="hint" style="margin:0 0 16px">Samo ogled – tekmo vnaša ${esc(r?.ownerName||'drug uporabnik')}. Urejati jo lahko le on in skrbnik.</div>`)}
  if(cloudOn&&g&&!g.imported&&$('#backGames')){$('#backGames').insertAdjacentHTML('afterend','<button class="btn small" id="shareGame">Kopiraj povezavo</button>');$('#shareGame').onclick=()=>cloudCopy(g.id)}
};
const cloudRender=render;
render=function(){cloudUi();cloudRender()};
const cloudRenderMatches=renderMatches;
renderMatches=function(){
  cloudRenderMatches();
  if(cloudOn&&!cloudUser)$('#view-matches').insertAdjacentHTML('afterbegin',`<div class="lv-start"><div><p class="eyebrow">Samo ogled</p><h2>Tekme Celja v živo</h2><p>Rezultati in akcije se osvežujejo sami. Za vnos tekem se prijavi.</p></div><div class="lv-startbtns"><button class="btn lime lv-startbig" data-cloud-login>Prijava za vnos</button></div></div>`);
  $$('[data-cloud-login]').forEach(b=>b.onclick=cloudSignIn);
  // Brisanje neposredno s seznama (odprte in zaključene tekme); s skupno bazo samo skrbnik.
  if(cloudOn&&!cloudAdmin())return;
  $$('#view-matches [data-open]').forEach(b=>{b.insertAdjacentHTML('afterend',`<button class="btn small danger" data-del-game="${b.dataset.open}">Izbriši</button>`)});
  $$('[data-del-game]').forEach(b=>b.onclick=()=>{
    const g=db().games.find(x=>x.id===b.dataset.delGame);if(!g)return;
    if(!confirm(`Izbrišem tekmo Celje – ${g.opponent} (${g.date}) in vse njene akcije?${cloudOn&&!g.imported?' Izbrisala se bo za vse.':''}`))return;
    db().games=db().games.filter(x=>x.id!==g.id);save();render();toast('Tekma izbrisana.');
  });
};
const cloudRenderExports=renderExports;
renderExports=function(){
  cloudRenderExports();
  $('#view-exports').insertAdjacentHTML('afterbegin',`<div class="panel"><div class="panel-head"><h2>Skupna baza</h2><span class="tag">${cloudOn?(cloudUser?(cloudAdmin()?'skrbnik':'vnos'):'samo ogled'):'ni nastavljena'}</span></div>${cloudOn
    ?`<p>Tekme se shranjujejo v skupno bazo. Vsak s povezavo jih lahko gleda, prijavljeni (Google ali e-pošta) jih vnašajo, briše jih samo skrbnik.</p>${cloudUser?`<p class="muted">Prijavljen: ${esc(cloudUser.displayName||cloudUser.email||'')} · tvoj ID: <code>${esc(cloudUser.uid)}</code></p>`:'<button class="btn primary" data-cloud-login>Prijava</button>'}`
    :'<p class="muted">Skupna baza še ni nastavljena, zato so tekme shranjene samo v tej napravi. Navodila so v datoteki <code>firebase-config.js</code>.</p>'}</div>`);
  $$('[data-cloud-login]').forEach(b=>b.onclick=cloudSignIn);
};

async function cloudInit(){
  if(!cloudOn)return;
  document.body.classList.add('cloud');
  $('.top-actions')?.insertAdjacentHTML('beforeend','<button class="btn small" id="cloudBtn">Prijava za vnos</button>');
  $('#cloudBtn').onclick=()=>cloudUser?firebase.auth().signOut():cloudSignIn();
  cloudUi();render();
  try{
    if(!window.firebase){const b='https://www.gstatic.com/firebasejs/10.12.2/';await cloudLoadScript(b+'firebase-app-compat.js');await Promise.all([cloudLoadScript(b+'firebase-auth-compat.js'),cloudLoadScript(b+'firebase-firestore-compat.js')])}
    firebase.initializeApp(CLOUD.firebase);cloudDb=firebase.firestore();
    firebase.auth().getRedirectResult().catch(()=>{});
    firebase.auth().onAuthStateChanged(u=>{cloudUser=u;cloudUi();cloudPush();render()});
    cloudDb.collection('games').onSnapshot(cloudOnGames,e=>{console.error(e);cloudStatus('Skupna baza ni dosegljiva – shranjeno v napravi')});
    cloudDb.collection('rosters').onSnapshot(cloudOnRosters,e=>console.error(e));
  }catch(e){console.error(e);cloudStatus('Skupna baza ni dosegljiva – shranjeno v napravi')}
}
addEventListener('hashchange',cloudOpenHash);
cloudInit();
