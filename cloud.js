// Skupna baza (Firebase): tekme vidi vsak s povezavo, vnašajo prijavljeni, briše le skrbnik.
// Brez nastavitev v firebase-config.js aplikacija deluje kot prej, samo v tej napravi.
const CLOUD=window.CELJE_CLOUD||{};
const cloudOn=!!CLOUD.firebase?.apiKey;
const CLOUD_TEAMS=['members','juniors'];
let cloudUser=null,cloudDb=null,cloudReady=false,cloudTimer=null;
let cloudSent={},cloudRemote={},cloudRosterSent={};

function cloudAdmin(){return !!cloudUser&&(CLOUD.adminUids||[]).includes(cloudUser.uid)}
function cloudGameJson(g){const {updatedAt,...rest}=g;return JSON.stringify(rest)}
function cloudLoadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
function cloudStatus(text){const c=$('.connection');if(c)c.innerHTML=`<span class="dot"></span> ${esc(text)}`}
function cloudErr(e){console.error(e);toast(e?.code==='permission-denied'?'Za to nimaš dovoljenja v skupni bazi.':'Shranjevanje v skupno bazo ni uspelo – podatki so v napravi.')}

function cloudUi(){
  document.body.classList.toggle('ro',cloudOn&&!cloudUser);
  document.body.classList.toggle('notadmin',cloudOn&&!cloudAdmin());
  const btn=$('#cloudBtn');if(!btn)return;
  btn.textContent=cloudUser?`Odjava · ${cloudUser.displayName?.split(' ')[0]||'račun'}`:'Prijava za vnos';
  cloudStatus(cloudReady?(cloudUser?'Skupna baza · vnos':'Skupna baza · samo ogled'):'Povezujem s skupno bazo …');
}
async function cloudSignIn(){
  const auth=firebase.auth(),provider=new firebase.auth.GoogleAuthProvider();
  try{await auth.signInWithPopup(provider)}catch(e){if(e?.code==='auth/popup-closed-by-user')return;await auth.signInWithRedirect(provider)}
}

// Pošlje spremenjene tekme in sezname igralk. Imported tekme iz Excela ostanejo lokalne.
function cloudPush(){
  if(!cloudOn||!cloudUser||!cloudDb||!cloudReady)return;
  const local=new Map();
  for(const t of CLOUD_TEAMS)for(const g of state.teams[t].games){if(g.imported)continue;local.set(g.id,{t,g})}
  for(const [gid,{t,g}] of local){
    const j=cloudGameJson(g);if(cloudSent[gid]===j)continue;
    cloudSent[gid]=j;g.updatedAt=Date.now();
    cloudDb.collection('games').doc(gid).set({team:t,json:j,updatedAt:g.updatedAt,by:cloudUser.uid,byName:cloudUser.displayName||''}).catch(e=>{delete cloudSent[gid];cloudErr(e)});
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
    if(i>=0&&cloudUser&&(list[i].updatedAt||0)>d.updatedAt)return;
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
  const g=game();
  if(cloudOn&&!cloudUser&&g&&!g.imported)classicRenderGame();else cloudRenderGame();
  if(cloudOn&&g&&!g.imported&&$('#backGames')){$('#backGames').insertAdjacentHTML('afterend','<button class="btn small" id="shareGame">Kopiraj povezavo</button>');$('#shareGame').onclick=()=>cloudCopy(g.id)}
};
const cloudRenderMatches=renderMatches;
renderMatches=function(){
  cloudRenderMatches();
  if(cloudOn&&!cloudUser)$('#view-matches').insertAdjacentHTML('afterbegin',`<div class="lv-start"><div><p class="eyebrow">Samo ogled</p><h2>Tekme Celja v živo</h2><p>Rezultati in akcije se osvežujejo sami. Za vnos tekem se prijavi.</p></div><div class="lv-startbtns"><button class="btn lime lv-startbig" data-cloud-login>Prijava za vnos</button></div></div>`);
  $$('[data-cloud-login]').forEach(b=>b.onclick=cloudSignIn);
};
const cloudRenderExports=renderExports;
renderExports=function(){
  cloudRenderExports();
  $('#view-exports').insertAdjacentHTML('afterbegin',`<div class="panel"><div class="panel-head"><h2>Skupna baza</h2><span class="tag">${cloudOn?(cloudUser?(cloudAdmin()?'skrbnik':'vnos'):'samo ogled'):'ni nastavljena'}</span></div>${cloudOn
    ?`<p>Tekme se shranjujejo v skupno bazo. Vsak s povezavo jih lahko gleda, prijavljeni jih vnašajo, briše jih samo skrbnik.</p>${cloudUser?`<p class="muted">Prijavljen: ${esc(cloudUser.displayName||cloudUser.email||'')} · tvoj ID: <code>${esc(cloudUser.uid)}</code></p>`:'<button class="btn primary" data-cloud-login>Prijava z Google računom</button>'}`
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
