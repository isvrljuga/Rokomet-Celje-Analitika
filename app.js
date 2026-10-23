const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY = 'celje-handball-analytics-v1';
const TYPES = {
  shot:[['9M','9 metrov'],['6M','6 metrov'],['7M','7 metrov'],['wing','Krilo'],['break','Prodor'],['fast','Protinapad']],
  result:[['miss','Zgrešeni'],['save','Obramba'],['goal','Gol']],
  assist:[['AZ','Zgrešeni strel'],['AO','Obramba vratarke'],['AG','Gol'],['A7','Izsiljen 7 m']],
  foul:[['POA','Naš v obrambi · aktiven'],['PON','Naš v obrambi · neaktiven'],['PNA','Pridobljen (prekršek nasprotnice) · aktiven'],['PNN','Pridobljen (prekršek nasprotnice) · neaktiven']],
  error:[['NA','Aktivna napaka'],['NN','Neaktivna napaka']],
  gain:[['DA','Aktivno dobljena'],['DN','Neaktivno dobljena']]
};
const SEEDS = {
  members:{players:['Lara Kolobarič','Zala Petek','Sarah Pilih Derča','Ella Podergajs','Lenja Ripnak','Alja Vrček','Ajla Mehulić','Vita Sečki','Zoja Verbovšek','Tinkara Korošec','Ela Adamič','Lina Kolobarič','Zala Kuri','Pia Kljun','Lana Švrljuga','Kaja Krebs','Larissa Zukič','Lana Kačičnik','Tiana Novak','Tia Kavalar'],keepers:['Nika Kuri','Zoja Brglez']},
  juniors:{players:['Zala Petek','Sarah Pilih Derča','Lenja Ripnak','Ajla Mehulić','Vita Sečki','Zoja Verbovšek','Tinkara Korošec','Lina Kolobarič','Zala Kuri','Pia Kljun','Lana Švrljuga','Teja Jereb','Zoja Jurak','Brina Mernik','Larissa Zukić','Tiana Novak','Tia Kavalar'],keepers:['Nika Kuri','Zoja Brglez']}
};
SEEDS.cadets={players:['Teja Jereb','Taja Lešnik','Alina Novak','Eva Gobec','Zoja Jurak','Neli Reher','Neja Šlogar','Sofija Čelan','Pia Vrečer','Zoja Rea Privšek','Lina Kristavčnik','Brina Mernik','Mia Kostić','Oriana Rozoničnik','Eva Pavlič Novak','Tia Topličanec'],keepers:['Zoya Brglez','Kaja Vrbančič']};
SEEDS.other={players:[],keepers:[]};
const TEAM_LABELS={members:'Članice',juniors:'Mladinke',cadets:'Kadetinje',other:'Ostalo'};
// Seznam igralk osnovnih ekip ureja samo skrbnik; zavihke klubov (club-…) dodaja skrbnik, igralke v njih vsi.
const CORE_TEAMS=['members','juniors','cadets'];
const isClubTeam=t=>String(t).startsWith('club-');
function applyCustomTeams(list){
  const prev=state.customTeams||[],ids=new Set(list.map(x=>x.id));
  for(const x of prev)if(!ids.has(x.id)){delete TEAM_LABELS[x.id];if(state.teams[x.id]&&!state.teams[x.id].games.length)delete state.teams[x.id]}
  state.customTeams=list;
  for(const x of list){TEAM_LABELS[x.id]=x.label;if(!state.teams[x.id])state.teams[x.id]={roster:{players:[],keepers:[]},games:[]}}
  if(!state.teams[team])team='members';
}
const blank=()=>({teams:Object.fromEntries(Object.keys(SEEDS).map(t=>[t,{roster:structuredClone(SEEDS[t]),games:[]}]))});
// Dopolni ekipe, ki jih starejši podatki (ali varnostne kopije) še nimajo.
function ensureTeams(){state.teams=state.teams||{};for(const t of Object.keys(SEEDS))if(!state.teams[t])state.teams[t]={roster:structuredClone(SEEDS[t]),games:[]};for(const x of state.customTeams||[]){TEAM_LABELS[x.id]=x.label;if(!state.teams[x.id])state.teams[x.id]={roster:{players:[],keepers:[]},games:[]}}}
let state; try{state=JSON.parse(localStorage.getItem(KEY))||blank()}catch{state=blank()}
ensureTeams();
let team='members', view='matches', gameId=null, actionKind='shot', qFilter=0, deferredPrompt=null;
function save(){localStorage.setItem(KEY,JSON.stringify(state));}
function db(){return state.teams[team]}
function game(){return db().games.find(g=>g.id===gameId)}
function teamLabel(){return TEAM_LABELS[team]||team}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function id(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2300)}
function setView(v){view=v;gameId=null;$$('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${v}`));$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));render()}
function quarter(half,minute){return (half==='1'?0:2)+(Number(minute)<15?0:1)}
function qName(q){return ['0–15','15–30','30–45','45–60'][q]}
function evQ(e){return e.type==='time'?quarter(e.half,e.start):quarter(e.half,e.minute)}
function actorName(g,e){return e.person||e.actor||'—'}
function findKeeper(g,name){return name||'—'}
function sideLabel(s){return s==='celje'?'Celje':'Nasprotnik'}
function displayType(e){
  if(e.type==='shot')return `${e.side==='celje'?'Strel':'Strel nasprotnic'} · ${TYPES.shot.find(x=>x[0]===e.shot)?.[1]||e.shot} · ${TYPES.result.find(x=>x[0]===e.result)?.[1]||e.result}`;
  if(e.type==='blame')return 'Krivda';
  if(e.type==='assist')return `Asistenca · ${TYPES.assist.find(x=>x[0]===e.code)?.[1]}`;
  if(e.type==='foul')return `Prekršek · ${TYPES.foul.find(x=>x[0]===e.code)?.[1]}${e.seven?' · 7 m':''}${e.twoMin?' · 2 min':''}`;
  if(e.type==='error')return `Napaka · ${TYPES.error.find(x=>x[0]===e.code)?.[1]}`;
  if(e.type==='gain')return `Dobljena žoga · ${TYPES.gain.find(x=>x[0]===e.code)?.[1]}`;
  if(e.type==='exclusion')return `Izključitev · ${e.duration||2} min · ${e.forTeam==='celje'?'Celje':'nasprotnik'} · ${e.person}${e.servedBy?` (ven ${e.servedBy})`:''}`;
  if(e.type==='time')return `Igralni čas · ${e.mode==='full'?'v napadu in obrambi':e.mode==='attack'?'samo napad':'samo obramba'} · ${Number(e.end)-Number(e.start)} min bruto`;
  return e.type;
}
function matchScore(g){let h=0,a=0;for(const e of g.events){if(e.type==='shot'&&e.result==='goal'){if(e.side==='celje')h++;else a++}}return {h,a}}
function currentPlayers(){return [...db().roster.players,...db().roster.keepers]}
function personOptions(selected=''){return `<option value="">Izberi igralko</option>${currentPlayers().map(p=>`<option ${p===selected?'selected':''}>${esc(p)}</option>`).join('')}`}
function keeperOptions(selected=''){return `<option value="">Ni izbrana</option>${db().roster.keepers.map(p=>`<option ${p===selected?'selected':''}>${esc(p)}</option>`).join('')}`}
function render(){
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===`view-${gameId?'game':view}`));
  if(gameId){renderGame();return}
  if(view==='matches')renderMatches(); if(view==='overview')renderOverview(); if(view==='roster')renderRoster(); if(view==='exports')renderExports();
}
function renderMatches(){
 const games=[...db().games].sort((a,b)=>b.date.localeCompare(a.date));
 const active=games.filter(g=>!g.complete),done=games.filter(g=>g.complete);
 $('#view-matches').innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()} · sezona 2026/27</p><h1>Tekme</h1><p>Ustvari tekmo, beleži akcije in spremljaj rezultat v živo.</p></div><button class="btn primary" id="newGameBtn">＋ Nova tekma</button></div>
 <div class="cards"><div class="card stat"><div class="label">Odigrane tekme</div><strong>${done.length}</strong><em>zaključeni zapisniki</em></div><div class="card stat"><div class="label">Vnos v teku</div><strong>${active.length}</strong><em>odprte tekme</em></div><div class="card stat"><div class="label">Zabeležene akcije</div><strong>${games.reduce((n,g)=>n+g.events.length,0)}</strong><em>v ekipi ${teamLabel().toLowerCase()}</em></div><div class="card stat"><div class="label">Indeks ekipe</div><strong>${fmt(teamIndex())}</strong><em>po novem indeksu</em></div></div>
 <div class="grid2"><div class="panel"><div class="panel-head"><h2>${active.length?'Odprte tekme':'Začni z novo tekmo'}</h2><span class="tag">${active.length} odprtih</span></div>${active.length?active.map(gameRow).join(''):`<div class="empty"><strong>Ni odprtih tekem</strong>Nova tekma se shrani posebej za izbrano ekipo.<br><br><button class="btn primary" id="emptyNew">Ustvari tekmo</button></div>`}</div><div class="panel"><div class="panel-head"><h2>Zadnja zaključena tekma</h2></div>${done[0]?gameRow(done[0]):`<div class="empty">Ko zaključiš tekmo, se rezultat prikaže tukaj.</div>`}</div></div>
 <div class="panel"><div class="panel-head"><h2>Vse tekme</h2><span class="muted">${games.length} skupaj</span></div>${games.length?games.map(gameRow).join(''):`<div class="empty">Tekme za ${teamLabel().toLowerCase()} še niso vnesene.</div>`}</div>`;
 $('#newGameBtn')?.addEventListener('click',newGameDialog);$('#emptyNew')?.addEventListener('click',newGameDialog);bindGameRows();
}
function gameRow(g){let s=matchScore(g);const shown=g.finalHome!==''&&g.finalHome!=null?`${g.finalHome} : ${g.finalAway}`:`${s.h} : ${s.a}`;return `<div class="game-row"><div><div class="game-name">${esc(g.home||'Celje')} – ${esc(g.opponent)}</div><div class="game-sub">${esc(g.date)} · ${g.events.length} akcij${g.firstHalfHome!=null&&g.firstHalfHome!==''?` · polčas ${g.firstHalfHome}:${g.firstHalfAway}`:''}</div></div><div class="score">${shown}</div><div class="toolbar"><span class="badge ${g.complete?'':'live'}">${g.complete?'Zaključena':'Vnos v teku'}</span><button class="btn small" data-open="${g.id}">Odpri</button></div></div>`}
function bindGameRows(){$$('[data-open]').forEach(b=>b.addEventListener('click',()=>{gameId=b.dataset.open;view='game';render()}))}
function newGameDialog(){const now=new Date(),today=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);const overlay=document.createElement('div');overlay.className='modal-backdrop';overlay.innerHTML=`<div class="modal"><div class="panel-head"><div><p class="eyebrow">Nova tekma · ${teamLabel()}</p><h2>Osnovni podatki</h2></div><button class="btn small" data-close>Zapri</button></div><div class="form-grid"><div class="field"><label>Datum tekme</label><input id="gDate" type="date" value="${today}"></div><div class="field"><label>Nasprotnik</label><input id="gOpp" placeholder="Ime ekipe"></div><div class="field"><label>Rezultat Celje</label><input id="gHome" type="number" min="0" placeholder="0"></div><div class="field"><label>Rezultat nasprotnika</label><input id="gAway" type="number" min="0" placeholder="0"></div><div class="field"><label>Polčas Celje</label><input id="gH1" type="number" min="0" placeholder="0"></div><div class="field"><label>Polčas nasprotnik</label><input id="gA1" type="number" min="0" placeholder="0"></div></div><div class="toolbar" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" id="createGame">Ustvari zapisnik</button></div></div>`;
 document.body.append(overlay);overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});overlay.querySelector('#createGame').onclick=()=>{let opp=overlay.querySelector('#gOpp').value.trim();if(!opp){toast('Vnesi ime nasprotnika.');return}const g={id:id(),date:overlay.querySelector('#gDate').value||today,opponent:opp,...(isClubTeam(team)?{home:teamLabel()}:{}),finalHome:overlay.querySelector('#gHome').value,finalAway:overlay.querySelector('#gAway').value,firstHalfHome:overlay.querySelector('#gH1').value,firstHalfAway:overlay.querySelector('#gA1').value,complete:false,events:[]};db().games.push(g);save();overlay.remove();gameId=g.id;render()};}
function renderGame(){const g=game();if(!g){gameId=null;view='matches';render();return}const score=matchScore(g),quarterEvents=g.events.filter(e=>qFilter===0||evQ(e)===qFilter-1).slice().reverse();
 $('#view-game').innerHTML=`<div class="toolbar" style="margin-bottom:14px"><button class="btn small" id="backGames">← Vse tekme</button><span class="tag">${teamLabel()}</span></div><div class="match-banner"><div><p>${esc(g.date)} · Zapisnik tekme</p><h2>${esc(g.home||'Celje')} – ${esc(g.opponent)}</h2></div><div class="scoreline">${g.finalHome!==''&&g.finalHome!=null?g.finalHome:score.h} : ${g.finalAway!==''&&g.finalAway!=null?g.finalAway:score.a}</div></div>
 <div class="panel"><div class="counterbar"><div><p class="eyebrow" style="margin:0 0 4px">Obdobje tekme</p><div class="muted" style="font-size:12px">Minute se razporedijo v četrtino iz polčasa in minute.</div></div><div class="counter"><b>${g.events.length}</b> akcij <button class="btn small" id="undoLast" ${g.events.length?'':'disabled'}>↶ Razveljavi zadnjo</button></div></div><div class="qnav" style="margin-top:14px">${['1. četrtina','2. četrtina','3. četrtina','4. četrtina'].map((x,i)=>`<button data-q="${i+1}" class="${qFilter===i+1?'active':''}">${x}</button>`).join('')}<button data-q="0" class="${qFilter===0?'active':''}">Vse</button></div></div>
 <div class="grid2"><div class="panel"><div class="panel-head"><h2>Dodaj akcijo</h2><span class="tag">${qFilter?qName(qFilter-1):'izbor četrtine'}</span></div><div class="action-tabs">${[['shot','Strel'],['assist','Asistenca'],['foul','Prekršek'],['error','Napaka'],['gain','Dobljena žoga'],['blame','Krivda'],['exclusion','Izključitev'],['time','Igralni čas']].map(([k,n])=>`<button data-kind="${k}" class="${actionKind===k?'active':''}">${n}</button>`).join('')}</div><div id="actionForm"></div></div>
 <div class="panel"><div class="panel-head"><div><h2>Zapisane akcije</h2><div class="muted" style="font-size:12px;margin-top:4px">Klikni koš za razveljavitev posamezne akcije.</div></div><span class="tag">${quarterEvents.length}</span></div><div class="event-list">${quarterEvents.length?quarterEvents.map(e=>`<div class="event"><div class="event-time">${e.type==='time'?`${e.half}.P ${e.start}–${e.end}`:`${e.half}.P ${e.minute}'`}</div><div><div class="event-title">${esc(actorName(g,e))} · ${esc(displayType(e))}</div><div class="event-sub">${e.type==='shot'&&e.side==='opponent'?`V vratih: ${esc(findKeeper(g,e.keeper))} · `:''}${qName(evQ(e))}${e.type==='exclusion'?` · ${e.forPersonType==='bench'?'klop/vratarka':'izključitev'}`:''}</div></div><button class="btn small danger" title="Razveljavi akcijo" data-delete="${e.id}">×</button></div>`).join(''):`<div class="empty">Za to obdobje še ni zapisanih akcij.</div>`}</div></div></div>
 <div class="panel"><div class="panel-head"><h2>Rezultat in zaključek</h2><span class="muted">Vrednosti lahko popraviš po tekmi.</span></div><div class="form-grid"><div class="field"><label>Rezultat Celje</label><input data-gamefield="finalHome" type="number" min="0" value="${esc(g.finalHome)}"></div><div class="field"><label>Rezultat nasprotnik</label><input data-gamefield="finalAway" type="number" min="0" value="${esc(g.finalAway)}"></div><div class="field"><label>Polčas Celje</label><input data-gamefield="firstHalfHome" type="number" min="0" value="${esc(g.firstHalfHome)}"></div><div class="field"><label>Polčas nasprotnik</label><input data-gamefield="firstHalfAway" type="number" min="0" value="${esc(g.firstHalfAway)}"></div></div><div class="toolbar" style="justify-content:space-between;margin-top:15px"><button class="btn danger" id="deleteGame">Izbriši tekmo</button><button class="btn ${g.complete?'':'primary'}" id="completeGame">${g.complete?'Ponovno odpri tekmo':'Zaključi tekmo'}</button></div></div>`;
 $('#backGames').onclick=()=>{gameId=null;view='matches';render()};$$('[data-q]').forEach(b=>b.onclick=()=>{qFilter=Number(b.dataset.q);renderGame()});$$('[data-kind]').forEach(b=>b.onclick=()=>{actionKind=b.dataset.kind;renderGame()});$('#undoLast').onclick=()=>{if(g.events.length){g.events.pop();save();renderGame();toast('Zadnja akcija razveljavljena.')}};$$('[data-delete]').forEach(b=>b.onclick=()=>{g.events=g.events.filter(e=>e.id!==b.dataset.delete);save();renderGame();toast('Akcija odstranjena.')});$$('[data-gamefield]').forEach(x=>x.addEventListener('change',()=>{g[x.dataset.gamefield]=x.value;save();renderGame()}));$('#completeGame').onclick=()=>{g.complete=!g.complete;save();renderGame();toast(g.complete?'Tekma zaključena.':'Tekma je znova odprta.')};$('#deleteGame').onclick=()=>{if(confirm('Izbrišem tekmo in vse njene akcije?')){db().games=db().games.filter(x=>x.id!==g.id);save();gameId=null;view='matches';render();toast('Tekma izbrisana.')}};
 renderActionForm(g);
}
function renderActionForm(g){const root=$('#actionForm');if(actionKind==='shot')root.innerHTML=shotForm(g);else if(actionKind==='assist')root.innerHTML=assistForm(g);else if(actionKind==='foul')root.innerHTML=foulForm(g);else if(actionKind==='error')root.innerHTML=errorForm(g);else if(actionKind==='gain')root.innerHTML=gainForm(g);else if(actionKind==='blame')root.innerHTML=blameForm();else if(actionKind==='exclusion')root.innerHTML=exclusionForm(g);else root.innerHTML=timeForm(g);bindActionForm(g)}
function timeFields(){return `<div class="form-grid"><div class="field"><label>Polčas</label><select id="half"><option value="1">1. polčas</option><option value="2">2. polčas</option></select></div><div class="field"><label>Minuta v polčasu (0–30)</label><input id="minute" type="number" min="0" max="30" step="0.5" value="0"></div></div>`}
function basePersonField(label='Igralka'){return `<div class="field"><label>${label}</label><select id="person">${personOptions()}</select></div>`}
function shotForm(g){return `<div class="action-form">${timeFields()}<div class="field"><label>Čigav strel?</label><div class="mode-strip"><button data-side="celje" class="active">Celje</button><button data-side="opponent">Nasprotnik</button></div><input id="side" type="hidden" value="celje"></div><div class="field"><label>Tip strela</label><div class="options">${TYPES.shot.map(([k,n])=>`<button data-choice="shot" data-value="${k}">${n}</button>`).join('')}</div><input id="shot" type="hidden"></div><div class="field"><label>Rezultat</label><div class="options">${TYPES.result.map(([k,n])=>`<button data-choice="result" data-value="${k}">${n}</button>`).join('')}</div><input id="result" type="hidden"></div><div class="grid2"><div class="field" id="personWrap">${basePersonField('Strelka')}</div><div class="field" id="keeperWrap" style="display:none"><label>Vratarka v golu</label><select id="keeper">${keeperOptions()}</select></div></div><button class="btn primary" id="saveAction">＋ Zabeleži strel</button></div>`}
function assistForm(){return `<div class="action-form">${timeFields()}${basePersonField('Igralka, ki je podala') }<div class="field"><label>Izid akcije</label><div class="options">${TYPES.assist.map(([k,n])=>`<button data-choice="code" data-value="${k}">${n}</button>`).join('')}</div><input id="code" type="hidden"></div><button class="btn primary" id="saveAction">＋ Zabeleži asistenco</button></div>`}
function foulForm(){return `<div class="action-form">${timeFields()}${basePersonField('Igralka')}<div class="field"><label>Tip prekrška</label><div class="options">${TYPES.foul.map(([k,n])=>`<button data-choice="code" data-value="${k}">${n}</button>`).join('')}</div><input id="code" type="hidden"></div><div class="checkrow"><label class="checkpill"><input id="seven" type="checkbox"> Prekršek je vodil v 7 m</label><label class="checkpill"><input id="twoMin" type="checkbox"> Sledila je izključitev 2 min</label></div><button class="btn primary" id="saveAction">＋ Zabeleži prekršek</button></div>`}
function errorForm(){return `<div class="action-form">${timeFields()}${basePersonField()}<div class="field"><label>Tip napake</label><div class="options">${TYPES.error.map(([k,n])=>`<button data-choice="code" data-value="${k}">${n}</button>`).join('')}</div><input id="code" type="hidden"></div><button class="btn primary" id="saveAction">＋ Zabeleži napako</button></div>`}
function gainForm(){return `<div class="action-form">${timeFields()}${basePersonField()}<div class="field"><label>Vrsta pridobljene žoge</label><div class="options">${TYPES.gain.map(([k,n])=>`<button data-choice="code" data-value="${k}">${n}</button>`).join('')}</div><input id="code" type="hidden"></div><button class="btn primary" id="saveAction">＋ Zabeleži dobljeno žogo</button></div>`}
function exclusionForm(){return `<div class="action-form">${timeFields()}<div class="field"><label>Katera ekipa je prejela izključitev?</label><div class="mode-strip"><button data-forteam="celje" class="active">Celje</button><button data-forteam="opponent">Nasprotnik</button></div><input id="forTeam" type="hidden" value="celje"></div><div class="field"><label>Komu se pripiše?</label><div class="mode-strip"><button data-persontype="player" class="active">Igralki</button><button data-persontype="bench">Klopi / vratarki</button></div><input id="forPersonType" type="hidden" value="player"></div><div class="grid2"><div class="field" id="exPersonWrap">${basePersonField('Igralka / vratarka')}</div><div class="field"><label>Trajanje</label><select id="duration"><option value="2">2 minuti</option><option value="4">4 minute</option><option value="red">Rdeči karton</option></select></div></div><button class="btn primary" id="saveAction">＋ Zabeleži izključitev</button></div>`}
function timeForm(){return `<div class="action-form">${basePersonField()}<div class="form-grid"><div class="field"><label>Polčas</label><select id="half"><option value="1">1. polčas</option><option value="2">2. polčas</option></select></div><div class="field"><label>Vloga</label><select id="mode"><option value="full">Napad in obramba</option><option value="attack">Samo napad</option><option value="defense">Samo obramba</option></select></div><div class="field"><label>Od minute</label><input id="start" type="number" min="0" max="30" step="0.5" value="0"></div><div class="field"><label>Do minute</label><input id="end" type="number" min="0" max="30" step="0.5" value="30"></div></div><div class="hint">Čas samo v napadu ali samo v obrambi se pri obračunu šteje polovično. Vnos se lahko razteza čez dve četrtini.</div><button class="btn primary" id="saveAction">＋ Dodaj igralni čas</button></div>`}
function blameForm(){return `<div class="action-form">${timeFields()}${basePersonField('Igralka')}<div class="hint">Krivda za prejeti gol: −0,5 točke pri novem indeksu. Zapis ne spremeni rezultata; gol nasprotnic se zabeleži kot strel.</div><button class="btn primary" id="saveAction">＋ Zabeleži krivdo</button></div>`}
function bindActionForm(g){
  $$('[data-choice]').forEach(b=>b.onclick=()=>{const id=b.dataset.choice;const inp=$(`#${id}`);inp.value=b.dataset.value;$$(`[data-choice="${id}"]`).forEach(x=>x.classList.toggle('selected',x===b))});
  $$('[data-side]').forEach(b=>b.onclick=()=>{$$('[data-side]').forEach(x=>x.classList.toggle('active',x===b));$('#side').value=b.dataset.side;const own=b.dataset.side==='celje';$('#personWrap').style.display=own?'block':'none';$('#keeperWrap').style.display=own?'none':'block'});
  $$('[data-forteam]').forEach(b=>b.onclick=()=>{$$('[data-forteam]').forEach(x=>x.classList.toggle('active',x===b));$('#forTeam').value=b.dataset.forteam});
  $$('[data-persontype]').forEach(b=>b.onclick=()=>{$$('[data-persontype]').forEach(x=>x.classList.toggle('active',x===b));$('#forPersonType').value=b.dataset.persontype;$('#exPersonWrap').style.display=b.dataset.persontype==='bench'?'none':'block'});
  $('#saveAction')?.addEventListener('click',()=>{
    let e={id:id(),type:actionKind,created:new Date().toISOString()};
    if(actionKind==='shot'){e.side=$('#side').value;e.shot=$('#shot').value;e.result=$('#result').value;e.half=$('#half').value;e.minute=Number($('#minute').value);e.person=e.side==='celje'?$('#person').value:'';e.keeper=e.side==='opponent'?$('#keeper').value:'';if(!e.shot||!e.result||(e.side==='celje'&&!e.person)){toast('Izberi tip, rezultat in igralko.');return}}
    if(['assist','foul','error','gain'].includes(actionKind)){e.person=$('#person').value;e.code=$('#code').value;e.half=$('#half').value;e.minute=Number($('#minute').value);if(!e.person||!e.code){toast('Izberi igralko in vrsto akcije.');return}if(actionKind==='foul'){e.seven=$('#seven').checked;e.twoMin=$('#twoMin').checked}}
    if(actionKind==='exclusion'){e.forTeam=$('#forTeam').value;e.forPersonType=$('#forPersonType').value;e.person=e.forPersonType==='bench'?(e.forTeam==='celje'?'Klop / vratarka':'Nasprotna klop / vratarka'):$('#person').value;e.duration=$('#duration').value;e.half=$('#half').value;e.minute=Number($('#minute').value);if(e.forPersonType==='player'&&!e.person){toast('Izberi igralko.');return}}
    if(actionKind==='blame'){e.person=$('#person').value;e.half=$('#half').value;e.minute=Number($('#minute').value);if(!e.person){toast('Izberi igralko.');return}if(!['1','2'].includes(e.half)||!Number.isFinite(e.minute)||e.minute<0||e.minute>30){toast('Vnesi veljaven polčas in minuto (0–30).');return}}
    if(actionKind==='time'){e.person=$('#person').value;e.half=$('#half').value;e.mode=$('#mode').value;e.start=Number($('#start').value);e.end=Number($('#end').value);if(!e.person||e.end<=e.start){toast('Izberi igralko in veljaven čas.');return}}
    g.events.push(e);save();renderGame();toast('Akcija shranjena.');
  });
}
function fmt(x){return Number(x||0).toLocaleString('sl-SI',{maximumFractionDigits:1})}
function quarterStats(g,person,q,kind=null){let ev=g.events.filter(e=>evQ(e)===q);if(person!=null)ev=ev.filter(e=>e.person===person);if(kind)ev=ev.filter(e=>e.type===kind);return ev}
function minutes(g,person,q){let total=0;for(const e of g.events){if(e.type!=='time'||e.person!==person)continue;let scale=e.mode==='full'?1:.5;let base=e.half==='1'?0:30;let start=Number(e.start)+base,end=Number(e.end)+base;let lo=q*15,hi=lo+15;total+=Math.max(0,Math.min(end,hi)-Math.max(start,lo))*scale}return total}
function actionCount(es,type,code=null){return es.filter(e=>e.type===type&&(!code||e.code===code)).length}
function playerStats(person,games=db().games){let qidx=[0,0,0,0],qidxOld=[0,0,0,0],count={goal:0,sevenGoal:0,saves:0,miss:0,sevenSave:0,sevenMiss:0,assist:0,DA:0,DN:0,NA:0,NN:0,POA:0,PON:0,PNA:0,PNN:0,blame:0},ptsNew=0,ptsOld=0,mins=[0,0,0,0];
 for(const g of games){for(const e of g.events){const q=evQ(e);if(e.person===person&&e.type==='time'){let base=e.half==='1'?0:30,start=base+Number(e.start),end=base+Number(e.end),scale=e.mode==='full'?1:.5;for(let j=0;j<4;j++)mins[j]+=Math.max(0,Math.min(end,j*15+15)-Math.max(start,j*15))*scale;continue}if(e.person!==person)continue;
  let n=0,o=0;if(e.type==='shot'&&e.side==='celje'){if(e.result==='goal'){if(e.shot==='7M'){n=.7;o=.7;count.sevenGoal++}else{n=1.4;o=1.4;count.goal++}}else if(e.result==='save'){if(e.shot==='7M'){n=-.5;o=-.2;count.sevenSave++}else{n=-.2;o=-.2;count.saves++}}else {if(e.shot==='7M'){n=-.5;o=-.4;count.sevenMiss++}else{n=-.4;o=-.4;count.miss++}}}
  if(e.type==='assist'){n=1;o=1;count.assist++}
  if(e.type==='foul'){const nm={POA:.4,PON:.2,PNA:.2,PNN:.1};n=nm[e.code]||0;o=(e.code==='POA'||e.code==='PON')?.4:0;count[e.code]=(count[e.code]||0)+1;if(e.seven&&(e.code==='PNA'||e.code==='PNN'))n+=.7}
  if(e.type==='error'){n=e.code==='NA'?.4*-1:-.7;o=-.7;count[e.code]=(count[e.code]||0)+1}
  if(e.type==='gain'){n=e.code==='DA'?.7:.2;o=.7;count[e.code]=(count[e.code]||0)+1}
  if(e.type==='blame'){n=-.5;o=0;count.blame++}
  ptsNew+=n;ptsOld+=o;qidx[q]+=n;qidxOld[q]+=o;
 }}
 return {person,qidx,qidxOld,indexNew:ptsNew,indexOld:ptsOld,minutes:mins.reduce((a,b)=>a+b,0),mins,count};}
function allStats(){return db().roster.players.map(p=>playerStats(p))}
function teamIndex(){return allStats().reduce((n,s)=>n+s.indexNew,0)}
function renderOverview(){const games=db().games;const rows=allStats().sort((a,b)=>b.indexNew-a.indexNew);const score=games.reduce((n,g)=>{for(const e of g.events)if(e.type==='shot'&&e.result==='goal')n[e.side==='celje'?0:1]++;return n},[0,0]);
 $('#view-overview').innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()} · vsi zapisani dogodki</p><h1>Skupni pregled</h1><p>Seštevek po igralkah čez vse zabeležene tekme. Akcije vratark so vključene v njihove individualne vrstice.</p></div><button class="btn" data-view="exports">⇩ Izvozi Excel</button></div><div class="cards"><div class="card stat"><div class="label">Tekme</div><strong>${games.length}</strong></div><div class="card stat"><div class="label">Indeks po novem</div><strong>${fmt(teamIndex())}</strong></div><div class="card stat"><div class="label">Goli Celje · nasprotnice</div><strong>${score[0]} : ${score[1]}</strong></div><div class="card stat"><div class="label">Zabeležen čas ekipe</div><strong>${fmt(rows.reduce((n,s)=>n+s.minutes,0))}</strong><em>igralkine minute, ½ za specialno vlogo</em></div></div><div class="panel"><div class="panel-head"><h2>Indeks in učinek po igralkah</h2><div class="mode-strip" id="indexMode"><button data-index="new" class="active">Novi indeks</button><button data-index="old">Stari indeks</button></div></div><div class="tablescroll"><table class="table"><thead><tr><th>Igralka</th><th>0–15</th><th>15–30</th><th>30–45</th><th>45–60</th><th>Index skupaj</th><th>Index/tekmo</th><th>Goli</th><th>7 m</th><th>Obr.</th><th>Zgreš.</th><th>Obr. 7 m</th><th>Zgreš. 7 m</th><th>Asist.</th><th>Krivda</th><th>Min.</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.person)}</td>${s.qidx.map((v,i)=>`<td class="quarterCell" data-qn="${v}" data-qo="${s.qidxOld[i]}">${fmt(v)}</td>`).join('')}<td data-val="${s.indexNew}" data-old="${s.indexOld}" class="indexCell">${fmt(s.indexNew)}</td><td>${fmt(s.indexNew/Math.max(games.length,1))}</td><td>${s.count.goal}</td><td>${s.count.sevenGoal}</td><td>${s.count.saves}</td><td>${s.count.miss}</td><td>${s.count.sevenSave||0}</td><td>${s.count.sevenMiss||0}</td><td>${s.count.assist}</td><td>${s.count.blame||0}</td><td>${fmt(s.minutes)}</td></tr>`).join('')}</tbody><tfoot><tr class="total"><td>Skupaj</td><td colspan="4"></td><td>${fmt(rows.reduce((n,s)=>n+s.indexNew,0))}</td><td></td><td>${rows.reduce((n,s)=>n+s.count.goal,0)}</td><td>${rows.reduce((n,s)=>n+s.count.sevenGoal,0)}</td><td>${rows.reduce((n,s)=>n+s.count.saves,0)}</td><td>${rows.reduce((n,s)=>n+s.count.miss,0)}</td><td>${rows.reduce((n,s)=>n+(s.count.sevenSave||0),0)}</td><td>${rows.reduce((n,s)=>n+(s.count.sevenMiss||0),0)}</td><td>${rows.reduce((n,s)=>n+s.count.assist,0)}</td><td>${rows.reduce((n,s)=>n+(s.count.blame||0),0)}</td><td>${fmt(rows.reduce((n,s)=>n+s.minutes,0))}</td></tr></tfoot></table></div><div class="hint">Indeks izračuna se iz zapisanih akcij. Predloge vsebujejo še podrobno razčlenitev po kodah in rezultatih; za primerjavo indeksov izberi način ali izvozi delovni zvezek.</div></div><div class="panel"><div class="panel-head"><h2>Seštevek akcij po četrtinah</h2></div><div class="tablescroll"><table class="table"><thead><tr><th>Četrtina</th><th>Streli Celje</th><th>Goli</th><th>Streli nasprotnic</th><th>Goli nasprotnic</th><th>Prekrški Celje</th><th>Prekrški nasprotnic</th><th>Izključitve</th></tr></thead><tbody>${[0,1,2,3].map(q=>{let es=games.flatMap(g=>g.events).filter(e=>evQ(e)===q);return `<tr><td>${qName(q)}</td><td>${es.filter(e=>e.type==='shot'&&e.side==='celje').length}</td><td>${es.filter(e=>e.type==='shot'&&e.side==='celje'&&e.result==='goal').length}</td><td>${es.filter(e=>e.type==='shot'&&e.side==='opponent').length}</td><td>${es.filter(e=>e.type==='shot'&&e.side==='opponent'&&e.result==='goal').length}</td><td>${es.filter(e=>e.type==='foul'&&['POA','PON'].includes(e.code)).length}</td><td>${es.filter(e=>e.type==='foul'&&['PNA','PNN'].includes(e.code)).length}</td><td>${es.filter(e=>e.type==='exclusion').length}</td></tr>`}).join('')}</tbody></table></div></div>`;
 $('#indexMode').addEventListener('click',e=>{let b=e.target.closest('[data-index]');if(!b)return;$$('[data-index]').forEach(x=>x.classList.toggle('active',x===b));const useOld=b.dataset.index==='old';$$('.indexCell').forEach((c,i)=>c.textContent=fmt(useOld?rows[i].indexOld:rows[i].indexNew));$$('.quarterCell').forEach(c=>c.textContent=fmt(useOld?c.dataset.qo:c.dataset.qn))});$$('[data-view="exports"]').forEach(b=>b.onclick=()=>setView('exports'));
}
function renderRoster(){const roster=db().roster;$('#view-roster').innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()} · sezona 2026/27</p><h1>Ekipa in igralke</h1><p>Seznam je pripravljen iz dosedanjih Excelovih predlog. Nove igralke se takoj ponudijo pri vnosu akcij.</p></div></div><div class="grid2"><div class="panel"><div class="panel-head"><h2>Igralke v polju</h2><span class="tag">${roster.players.length}</span></div><form class="toolbar" id="addPlayerForm"><input id="newPlayer" placeholder="Ime in priimek" aria-label="Ime in priimek" style="border:1px solid var(--line);border-radius:10px;padding:9px 11px;min-width:180px"><button class="btn primary">＋ Dodaj igralko</button></form><hr class="divider"><div class="player-list">${roster.players.map(p=>`<div class="player-item"><div><b>${esc(p)}</b><br><small>igralka</small></div><button class="btn small danger" data-remove-player="${esc(p)}">Odstrani</button></div>`).join('')}</div></div><div class="panel"><div class="panel-head"><h2>Vratarke</h2><span class="tag">${roster.keepers.length}</span></div><form class="toolbar" id="addKeeperForm"><input id="newKeeper" placeholder="Ime vratarke" aria-label="Ime vratarke" style="border:1px solid var(--line);border-radius:10px;padding:9px 11px;min-width:150px"><button class="btn primary">＋ Dodaj vratarko</button></form><hr class="divider"><div class="player-list">${roster.keepers.map(p=>`<div class="player-item"><div><b>${esc(p)}</b><br><small>vratarka</small></div><button class="btn small danger" data-remove-keeper="${esc(p)}">Odstrani</button></div>`).join('')}</div><div class="hint">Vratarke so na voljo pri strelih nasprotnic ter pri asistencah, napakah in dobljenih žogah.</div></div></div>`;
 $('#addPlayerForm').onsubmit=e=>{e.preventDefault();const n=$('#newPlayer').value.trim();if(!n)return;if([...roster.players,...roster.keepers].some(p=>p.toLowerCase()===n.toLowerCase())){toast('Igralka je že na seznamu.');return}roster.players.push(n);save();renderRoster();toast('Igralka dodana.')};$('#addKeeperForm').onsubmit=e=>{e.preventDefault();const n=$('#newKeeper').value.trim();if(!n)return;if([...roster.players,...roster.keepers].some(p=>p.toLowerCase()===n.toLowerCase())){toast('Igralka je že na seznamu.');return}roster.keepers.push(n);save();renderRoster();toast('Vratarka dodana.')};$$('[data-remove-player]').forEach(b=>b.onclick=()=>removeRoster(b.dataset.removePlayer,'players'));$$('[data-remove-keeper]').forEach(b=>b.onclick=()=>removeRoster(b.dataset.removeKeeper,'keepers'));
}
function removeRoster(name,which){if(!confirm(`Odstranim ${name} iz seznama za nove vnose?`))return;db().roster[which]=db().roster[which].filter(x=>x!==name);save();renderRoster()}
function renderExports(){$('#view-exports').innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()} · prenos podatkov</p><h1>Izvoz in varnostna kopija</h1><p>Excelova delovna zvezka vključujeta skupni seštevek, posamezne tekme in razdelitev po četrtinah.</p></div></div><div class="grid2"><div class="panel"><div class="panel-head"><h2>Izvozi Excel</h2><span class="tag">${db().games.length} tekem</span></div><p class="muted">Izberi obliko indeksa. Vsak izvoz je ločena datoteka .xlsx za trenutno izbrano ekipo.</p><div class="toolbar"><button class="btn primary" id="exportNew">⇩ Novi indeks · XLSX</button><button class="btn" id="exportOld">⇩ Stari indeks 2025 · XLSX</button></div><div class="hint">Novi indeks: zavihka Skupno igralke in Skupno ekipa ter zavihek za vsako tekmo (streli, prekrški, asistence, napake, dobljene žoge, streli skupno, golmanke, igralni čas in indeks igralk).</div></div><div class="panel"><div class="panel-head"><h2>Varnostna kopija</h2><span class="tag">JSON</span></div><p class="muted">Varnostno kopijo prenesi po vnosu tekem. Na drugi napravi jo uvozi; obstoječe podatke izbrane ekipe bo zamenjala.</p><div class="toolbar"><button class="btn" id="backup">⇩ Prenesi kopijo</button><label class="btn" for="restoreFile">⇧ Uvozi kopijo</label><input id="restoreFile" type="file" accept="application/json,.json" hidden></div></div></div><div class="panel"><div class="panel-head"><h2>Pomembno za uporabo na več napravah</h2></div><p>Ta različica podatke hrani v lokalnem pomnilniku posameznega brskalnika. Računalnik in telefon imata ločena zapisa. Če želiš prenesti tekme, izvozi JSON kopijo na eni napravi in jo uvozi na drugi.</p><div class="hint">Brez povezave ne izgubiš podatkov. Brisanje podatkov brskalnika jih lahko odstrani, zato kopijo izvozi po vsaki tekmi.</div></div>`;
 $('#exportNew').onclick=()=>exportBook('new');$('#exportOld').onclick=()=>exportBook('old');$('#backup').onclick=backup;$('#restoreFile').onchange=restore;
}
function backup(){download(new Blob([JSON.stringify({version:1,team,data:db()},null,2)],{type:'application/json'}),`celje-${team}-backup.json`)}
function restore(ev){const f=ev.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const o=JSON.parse(reader.result);const d=o.data||o;if(!Array.isArray(d.games)||!d.roster)throw new Error();if(!confirm(`Uvozim ${d.games.length} tekem in zamenjam podatke ekipe ${teamLabel()}?`))return;state.teams[team]=d;save();setView('matches');toast('Varnostna kopija uvožena.')}catch{toast('Datoteka ni veljavna.')}finally{ev.target.value=''}};reader.readAsText(f)}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function xml(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function colName(n){let s='';while(n){let r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function sheetXml(rows){let out=[];rows.forEach((row,ri)=>{let cells=[];row.forEach((v,ci)=>{if(v===null||v===undefined||v==='')return;let ref=`${colName(ci+1)}${ri+1}`;if(typeof v==='number'&&Number.isFinite(v))cells.push(`<c r="${ref}"><v>${v}</v></c>`);else cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`)});out.push(`<row r="${ri+1}">${cells.join('')}</row>`)});return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${out.join('')}</sheetData></worksheet>`}
const enc=new TextEncoder();let crcTable;function crc32(bytes){if(!crcTable){crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0})}let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function zip(files){let local=[],central=[],offset=0;for(const [name,content]of Object.entries(files)){let n=enc.encode(name),d=typeof content==='string'?enc.encode(content):content,crc=crc32(d),lh=new Uint8Array(30+n.length),lv=new DataView(lh.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);lv.setUint16(8,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,d.length,true);lv.setUint32(22,d.length,true);lv.setUint16(26,n.length,true);lh.set(n,30);local.push(lh,d);let ch=new Uint8Array(46+n.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0,true);cv.setUint16(10,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,d.length,true);cv.setUint32(24,d.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);ch.set(n,46);central.push(ch);offset+=lh.length+d.length}let csize=central.reduce((a,x)=>a+x.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,csize,true);v.setUint32(16,offset,true);return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
function xlsx(sheets){let files={'[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,'_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>','xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>','xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name.slice(0,31))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`,'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`};sheets.forEach((s,i)=>files[`xl/worksheets/sheet${i+1}.xml`]=sheetXml(s.rows));return zip(files)}
function quarterShotTotals(g,side,shot,result){return g.events.filter(e=>e.type==='shot'&&e.side===side&&e.shot===shot&&e.result===result).length}
function keeperWorkbookRows(games,keepers){const all=games.flatMap(g=>g.events).filter(e=>e.type==='shot'&&e.side==='opponent'),names=[...new Set([...keepers,...all.map(e=>e.keeper||'Ni izbrana')])],rows=[['Vratarke – streli nasprotnic'],['Vratarka','Obdobje','Obrambe','Prejeti goli','Zgrešeni streli','Skupaj poskusov','Uspešnost obramb']];for(const name of names){for(let q=0;q<4;q++){const es=all.filter(e=>(e.keeper||'Ni izbrana')===name&&games.some(g=>g.events.includes(e)&&evQ(e)===q)),sv=es.filter(e=>e.result==='save').length,go=es.filter(e=>e.result==='goal').length,mi=es.filter(e=>e.result==='miss').length;rows.push([name,qName(q),sv,go,mi,es.length,es.length?(sv/es.length):0])}const es=all.filter(e=>(e.keeper||'Ni izbrana')===name),sv=es.filter(e=>e.result==='save').length,go=es.filter(e=>e.result==='goal').length,mi=es.filter(e=>e.result==='miss').length;rows.push([name,'Skupno',sv,go,mi,es.length,es.length?(sv/es.length):0])}return rows}
function playerDetailRows(games,players){const all=games.flatMap(g=>g.events),cats=[...TYPES.shot.flatMap(([s,n])=>TYPES.result.map(([r,rn])=>[`${n} – ${rn}`,e=>e.type==='shot'&&e.side==='celje'&&e.shot===s&&e.result===r])),...TYPES.assist.map(([c,n])=>[`Asistenca – ${n}`,e=>e.type==='assist'&&e.code===c]),...TYPES.foul.map(([c,n])=>[`Prekršek – ${n}`,e=>e.type==='foul'&&e.code===c]),...TYPES.error.map(([c,n])=>[`Napaka – ${n}`,e=>e.type==='error'&&e.code===c]),...TYPES.gain.map(([c,n])=>[`Dobljena žoga – ${n}`,e=>e.type==='gain'&&e.code===c]),['Krivda',e=>e.type==='blame']],rows=[['Podrobne akcije igralk'],['Igralka','Dogodek','0–15','15–30','30–45','45–60','Skupno']];for(const p of players){for(const [label,pred]of cats){const q=[0,1,2,3].map(i=>all.filter(e=>e.person===p&&pred(e)&&evQ(e)===i).length);if(q.some(Boolean))rows.push([p,label,...q,q.reduce((a,b)=>a+b,0)])}const q=[0,1,2,3].map(i=>games.reduce((n,g)=>n+minutes(g,p,i),0));rows.push([p,'Igralni čas (utežen)',...q,q.reduce((a,b)=>a+b,0)])}return rows}
function newWorkbook(){const games=db().games,players=[...db().roster.players,...db().roster.keepers],sheets=[];let summary=[['ŽRK Celje '+teamLabel().toLowerCase()+' – sezona 2026/27, novi indeks'],[],['Igralka','Index 0–15','Index 15–30','Index 30–45','Index 45–60','Index skupaj','Goli iz igre','Goli 7M','Obrambe','Zgrešeni','Obrambe 7M','Zgrešeni 7M','Asistence','DA','DN','NA','NN','POA','PON','PNA','PNN','Krivda','Minute']];
 for(const p of players){const s=playerStats(p);summary.push([p,...s.qidx,s.indexNew,s.count.goal,s.count.sevenGoal,s.count.saves,s.count.miss,s.count.sevenSave||0,s.count.sevenMiss||0,s.count.assist,s.count.DA||0,s.count.DN||0,s.count.NA||0,s.count.NN||0,s.count.POA||0,s.count.PON||0,s.count.PNA||0,s.count.PNN||0,s.count.blame||0,s.minutes])}summary.push(['Skupaj',...Array(4).fill(''),players.reduce((n,p)=>n+playerStats(p).indexNew,0)]);sheets.push({name:'Skupno igralke',rows:summary});sheets.push({name:'Podrobnosti igralk',rows:playerDetailRows(games,players)});
 const teamRows=[['Streli skupno Celje'],['Tip','0–15','15–30','30–45','45–60','Skupno'],...TYPES.shot.flatMap(([s,n])=>TYPES.result.map(([r,rn])=>[`${n} – ${rn}`,...[0,1,2,3].map(q=>games.flatMap(g=>g.events).filter(e=>e.type==='shot'&&e.side==='celje'&&e.shot===s&&e.result===r&&evQ(e)===q).length),games.flatMap(g=>g.events).filter(e=>e.type==='shot'&&e.side==='celje'&&e.shot===s&&e.result===r).length])),['','','','','',''],['Streli skupno nasprotnik'],['Tip','0–15','15–30','30–45','45–60','Skupno'],...TYPES.shot.flatMap(([s,n])=>TYPES.result.map(([r,rn])=>[`${n} – ${rn}`,...[0,1,2,3].map(q=>games.flatMap(g=>g.events).filter(e=>e.type==='shot'&&e.side==='opponent'&&e.shot===s&&e.result===r&&evQ(e)===q).length),games.flatMap(g=>g.events).filter(e=>e.type==='shot'&&e.side==='opponent'&&e.shot===s&&e.result===r).length]))];teamRows.push([],['Druge akcije Celje'],['Dogodek','0–15','15–30','30–45','45–60','Skupno']);const allEvents=games.flatMap(g=>g.events),other=[...TYPES.assist.map(([c,n])=>[`Asistenca – ${n}`,e=>e.type==='assist'&&e.code===c]),...TYPES.foul.map(([c,n])=>[`Prekršek – ${n}`,e=>e.type==='foul'&&e.code===c]),...TYPES.error.map(([c,n])=>[`Napaka – ${n}`,e=>e.type==='error'&&e.code===c]),...TYPES.gain.map(([c,n])=>[`Dobljena žoga – ${n}`,e=>e.type==='gain'&&e.code===c]),['Krivda',e=>e.type==='blame'],['Izključitev Celje',e=>e.type==='exclusion'&&e.forTeam==='celje'],['Izključitev nasprotnik',e=>e.type==='exclusion'&&e.forTeam==='opponent']];for(const [label,pred]of other)teamRows.push([label,...[0,1,2,3].map(q=>allEvents.filter(e=>pred(e)&&evQ(e)===q).length),allEvents.filter(pred).length]);sheets.push({name:'Skupno ekipa',rows:teamRows});sheets.push({name:'Vratarke',rows:keeperWorkbookRows(games,db().roster.keepers)});
 for(const g of games){let rows=[[`${g.date}  Celje–${g.opponent}  ${g.finalHome||matchScore(g).h}:${g.finalAway||matchScore(g).a} (polčas ${g.firstHalfHome||0}:${g.firstHalfAway||0})`],[],['Čas','Četrtina','Igralka','Vrsta akcije','Tip','Izid','Vratarka','7 m','2 min','Trajanje'],...g.events.map(e=>[e.type==='time'?`${e.half}.P ${e.start}–${e.end}`:`${e.half}.P ${e.minute}`,qName(evQ(e)),e.person||e.actor||'',e.type,e.type==='shot'?TYPES.shot.find(x=>x[0]===e.shot)?.[1]||e.shot:(e.code||''),e.type==='shot'?TYPES.result.find(x=>x[0]===e.result)?.[1]||e.result:'',e.keeper||'',e.seven?'Da':'',e.twoMin?'Da':'',e.type==='time'?`${(Number(e.end)-Number(e.start))*(e.mode==='full'?1:.5)} min`:e.duration||''])];sheets.push({name:g.opponent.replace(/[\\/?*\[\]:]/g,' ').slice(0,26)||'Tekma',rows})}return sheets}
function oldWorkbook(){const games=db().games,players=[...db().roster.players,...db().roster.keepers];let rows=[['ŽRK Celje '+teamLabel().toLowerCase()+' – sezona 2026/27, stari indeks 2025'],['Število tekem',games.length],[],['Igralka','0–15','15–30','30–45','45–60','Index skupaj','Index/tekmo','Goli iz igre','Goli 7M','Obrambe','Zgrešeni','Obrambe 7M','Zgrešeni 7M','Asistence','Napake','Dobljene žoge','Prekrški narejeni','Prekrški pridobljeni']];
 for(const p of players){const s=playerStats(p),events=games.flatMap(g=>g.events).filter(e=>e.person===p),q=[0,1,2,3].map(i=>games.reduce((n,g)=>n+playerStats(p,[g]).qidxOld[i],0)),goals=events.filter(e=>e.type==='shot'&&e.side==='celje'&&e.result==='goal'&&e.shot!=='7M').length,seven=events.filter(e=>e.type==='shot'&&e.side==='celje'&&e.result==='goal'&&e.shot==='7M').length,saves=events.filter(e=>e.type==='shot'&&e.side==='celje'&&e.result==='save'&&e.shot!=='7M').length,miss=events.filter(e=>e.type==='shot'&&e.side==='celje'&&e.result==='miss'&&e.shot!=='7M').length,sevenSave=events.filter(e=>e.type==='shot'&&e.side==='celje'&&e.result==='save'&&e.shot==='7M').length,sevenMiss=events.filter(e=>e.type==='shot'&&e.side==='celje'&&e.result==='miss'&&e.shot==='7M').length,foulsMade=events.filter(e=>e.type==='foul'&&(e.code==='POA'||e.code==='PON')).length,foulsDrawn=events.filter(e=>e.type==='foul'&&(e.code==='PNA'||e.code==='PNN')).length;rows.push([p,...q,s.indexOld,games.length?s.indexOld/games.length:0,goals,seven,saves,miss,sevenSave,sevenMiss,actionCount(events,'assist'),actionCount(events,'error'),actionCount(events,'gain'),foulsMade,foulsDrawn])}
 let sheets=[{name:'Skupno',rows},{name:'Vratarke',rows:keeperWorkbookRows(games,db().roster.keepers)}];sheets.push({name:'ZAČETEK TEKEM',rows:[['Vsi zavihki tekem morajo biti med tem in zavihkom KONEC TEKEM.']]});for(const g of games){let m=[['Stari indeks 2025 – podatki po igralkah'],['Tekma',g.date,`Celje–${g.opponent}`,`Rezultat ${g.finalHome||matchScore(g).h}:${g.finalAway||matchScore(g).a}`,`Polčas ${g.firstHalfHome||0}:${g.firstHalfAway||0}`],[],['Igralka','Dogodek','0–15','15–30','30–45','45–60','Skupno','Utež']];for(const p of players){const es=g.events.filter(e=>e.person===p);const cats=[['Goli iz igre',e=>e.type==='shot'&&e.side==='celje'&&e.result==='goal'&&e.shot!=='7M',1.4],['Goli 7M',e=>e.type==='shot'&&e.side==='celje'&&e.result==='goal'&&e.shot==='7M',.7],['Streli – obramba',e=>e.type==='shot'&&e.side==='celje'&&e.result==='save',-.2],['Streli – zgrešeni',e=>e.type==='shot'&&e.side==='celje'&&e.result==='miss',-.4],['Asistence',e=>e.type==='assist',1],['Prekrški – narejeni',e=>e.type==='foul'&&(e.code==='POA'||e.code==='PON'),.4],['Prekrški – pridobljeni',e=>e.type==='foul'&&(e.code==='PNA'||e.code==='PNN'),0],['Napake',e=>e.type==='error',-.7],['Dobljene žoge',e=>e.type==='gain',.7],['Krivda',e=>e.type==='blame',0]];for(const [label,pred,w]of cats){let nums=[0,1,2,3].map(q=>es.filter(e=>pred(e)&&evQ(e)===q).length);if(nums.some(Boolean))m.push([p,label,...nums,nums.reduce((a,b)=>a+b,0),w])}}m.push([],['Nasprotnice – streli'],['Vratarka','Tip strela','Izid','0–15','15–30','30–45','45–60','Skupno']);for(const e of g.events.filter(e=>e.type==='shot'&&e.side==='opponent'))m.push([e.keeper||'Ni izbrana',TYPES.shot.find(x=>x[0]===e.shot)?.[1],TYPES.result.find(x=>x[0]===e.result)?.[1],...[0,1,2,3].map(q=>evQ(e)===q?1:0),1]);m.push([],['Izključitve klopi / vratark'],['Ekipa','Trajanje','Čas'],...g.events.filter(e=>e.type==='exclusion'&&e.forPersonType==='bench').map(e=>[e.forTeam,e.duration,e.minute]));m.push([],['Vse zapisane akcije'],['Polčas/minuta','Četrtina','Igralka','Vrsta','Tip','Izid','Vratarka','7 m','2 min'],...g.events.map(e=>[e.type==='time'?`${e.half}.P ${e.start}–${e.end}`:`${e.half}.P ${e.minute}`,qName(evQ(e)),e.person||'',e.type,e.code||e.shot||'',e.result||'',e.keeper||'',e.seven?'Da':'',e.twoMin?'Da':'']));sheets.push({name:g.opponent.replace(/[\\/?*\[\]:]/g,' ').slice(0,26)||'Tekma',rows:m})}sheets.push({name:'KONEC TEKEM',rows:[['Nove tekme vstavi pred ta zavihek.']]});return sheets}
function exportBook(which){try{const sheets=which==='new'?newWorkbook():oldWorkbook();const blob=xlsx(sheets);download(blob,`Celje_${team}_${which==='new'?'novi_indeks':'stari_indeks_2025'}.xlsx`);toast('Excelov izvoz pripravljen.')}catch(e){console.error(e);toast('Izvoza ni bilo mogoče ustvariti.')}}
$$('[data-team]').forEach(b=>b.onclick=()=>{team=b.dataset.team;$$('[data-team]').forEach(x=>x.classList.toggle('active',x===b));gameId=null;view='matches';render()});$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false});$('#installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt=null;$('#installBtn').hidden=true};
render();

const EXCEL_IMPORT = {
  "format": "celje-excel-import",
  "version": 2,
  "batchId": "excel-2026-nov-index-v3",
  "teams": {
    "members": {
      "games": [
        {
          "date": "2026-09-12",
          "opponent": "Ajdovščina",
          "finalHome": 18,
          "finalAway": 42,
          "firstHalfHome": 11,
          "firstHalfAway": 19,
          "id": "excel-2026-members-2026-09-12",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    1,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7G",
                  "quarters": [
                    2,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KO",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ela Adamič",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    3,
                    1,
                    2,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    3,
                    5,
                    7
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    3,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNN",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    3,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    1,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    1,
                    3,
                    3,
                    2
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ela Adamič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AO",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "A7",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NN",
                  "quarters": [
                    3,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "NN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    3
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 39,
                "Zala Petek": 57.5,
                "Sarah Pilih Derča": 32.5,
                "Ella Podergajs": 44,
                "Lenja Ripnak": 46.5,
                "Alja Vrček": 42,
                "Ajla Mehulić": 21,
                "Vita Sečki": 13,
                "Zoja Verbovšek": 19,
                "Tinkara Korošec": 8.5,
                "Ela Adamič": 8,
                "Lina Kolobarič": 9,
                "Zala Kuri": 8
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    1,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    2,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    2,
                    2,
                    1,
                    2
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    2,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    3,
                    0,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    2,
                    2,
                    1,
                    4
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    3,
                    1
                  ]
                },
                {
                  "code": "PTZ",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    3,
                    2,
                    3,
                    4
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 60,
                  "conceded": 42,
                  "shots": 50,
                  "sevenRatio": "7/7",
                  "otherRatio": "35/43"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Ajdovščina",
              "fouls": [
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 2
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "seven": 2,
                  "twoMin": 2
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 2
                },
                {
                  "person": "Vita Sečki",
                  "code": "PNA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 1
                }
              ],
              "summaries": {
                "Lara Kolobarič": {
                  "index": 2.3999999999999995,
                  "goal": 2,
                  "sevenGoal": 4,
                  "saves": 4,
                  "miss": 2,
                  "sevenFailed": 1,
                  "assist": 4,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 5,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 3,
                  "blame": 6,
                  "sevenDrawn": 1
                },
                "Zala Petek": {
                  "index": 8.399999999999999,
                  "goal": 3,
                  "sevenGoal": 1,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 3,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 2,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 8,
                  "PNN": 16,
                  "blame": 6,
                  "sevenDrawn": 2
                },
                "Sarah Pilih Derča": {
                  "index": 1.1999999999999997,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 2,
                  "sevenFailed": 1,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 5,
                  "PNN": 0,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Ella Podergajs": {
                  "index": -0.8000000000000005,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 3,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 2,
                  "blame": 6,
                  "sevenDrawn": 1
                },
                "Lenja Ripnak": {
                  "index": 1.4999999999999998,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 1,
                  "NA": 0,
                  "NN": 1,
                  "POA": 3,
                  "PON": 1,
                  "PNA": 5,
                  "PNN": 3,
                  "blame": 4,
                  "sevenDrawn": 1
                },
                "Alja Vrček": {
                  "index": -0.2999999999999998,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 1,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Ajla Mehulić": {
                  "index": 6.4,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 6,
                  "DA": 0,
                  "DN": 0,
                  "NA": 4,
                  "NN": 2,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 9,
                  "PNN": 4,
                  "blame": 2,
                  "sevenDrawn": 2
                },
                "Vita Sečki": {
                  "index": 1.0999999999999996,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 2,
                  "sevenDrawn": 0
                },
                "Zoja Verbovšek": {
                  "index": 1.8000000000000003,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 2,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Tinkara Korošec": {
                  "index": 0.19999999999999996,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Ela Adamič": {
                  "index": -0.6,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 1,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Lina Kolobarič": {
                  "index": -0.8000000000000002,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 2,
                  "DA": 0,
                  "DN": 0,
                  "NA": 3,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 1,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Zala Kuri": {
                  "index": 0.5999999999999999,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 1,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 2,
                  "sevenDrawn": 0
                }
              },
              "notes": [],
              "teamIndex": 21.1,
              "reportedTeamIndex": 21.1
            },
            "old": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    1,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7G",
                  "quarters": [
                    2,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KO",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ela Adamič",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    3,
                    1,
                    2,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    3,
                    5,
                    7
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    3,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNN",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    3,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    1,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    1,
                    3,
                    3,
                    2
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ela Adamič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AO",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "A7",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NN",
                  "quarters": [
                    3,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "NN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    3
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 39,
                "Zala Petek": 57.5,
                "Sarah Pilih Derča": 32.5,
                "Ella Podergajs": 44,
                "Lenja Ripnak": 46.5,
                "Alja Vrček": 42,
                "Ajla Mehulić": 21,
                "Vita Sečki": 13,
                "Zoja Verbovšek": 19,
                "Tinkara Korošec": 8.5,
                "Ela Adamič": 8,
                "Lina Kolobarič": 9,
                "Zala Kuri": 8
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    1,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    2,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    2,
                    2,
                    1,
                    2
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    2,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    3,
                    0,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    2,
                    2,
                    1,
                    4
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    3,
                    1
                  ]
                },
                {
                  "code": "PTZ",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    3,
                    2,
                    3,
                    4
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 60,
                  "conceded": 42,
                  "shots": 50,
                  "sevenRatio": "7/7",
                  "otherRatio": "35/43"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Ajdovščina",
              "indices": {
                "Lara Kolobarič": [
                  4.2,
                  0.9,
                  -1.1,
                  0.0
                ],
                "Zala Petek": [
                  2.1,
                  2.2,
                  -0.9,
                  3.1
                ],
                "Sarah Pilih Derča": [
                  1.7,
                  -0.6,
                  1.6,
                  -0.4
                ],
                "Ella Podergajs": [
                  -1.1,
                  0.7,
                  -0.2,
                  1.4
                ],
                "Lenja Ripnak": [
                  1.6,
                  -0.2,
                  0.4,
                  0.4
                ],
                "Vita Sečki": [
                  0.0,
                  2.8,
                  0.0,
                  -0.7
                ],
                "Zoja Verbovšek": [
                  0.0,
                  0.0,
                  0.0,
                  1.7
                ],
                "Ela Adamič": [
                  0.0,
                  0.0,
                  -0.2,
                  0.0
                ],
                "Lina Kolobarič": [
                  0.0,
                  0.0,
                  0.0,
                  -0.5
                ],
                "Zala Kuri": [
                  0.0,
                  0.0,
                  0.0,
                  1.8
                ],
                "Alja Vrček": [
                  0.4,
                  0.8,
                  0.4,
                  0.0
                ],
                "Ajla Mehulić": [
                  0.0,
                  0.9,
                  2.0,
                  -0.3
                ],
                "Tinkara Korošec": [
                  0.0,
                  0.0,
                  0.7,
                  0.0
                ]
              },
              "teamIndex": 25.6
            },
            "differences": [],
            "aliases": []
          },
          "venue": "Ajdovščina"
        },
        {
          "date": "2026-09-24",
          "opponent": "Velenje",
          "finalHome": 28,
          "finalAway": 37,
          "firstHalfHome": 12,
          "firstHalfAway": 18,
          "id": "excel-2026-members-2026-09-24",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9O",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    0,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "6O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "6O",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "KG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    1,
                    2,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNN",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    2,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "quarters": [
                    4,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    3,
                    0,
                    3
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    2,
                    2
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "PNA",
                  "quarters": [
                    3,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "A7",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    1,
                    3,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 38,
                "Zala Petek": 42,
                "Sarah Pilih Derča": 53.5,
                "Ella Podergajs": 42,
                "Lenja Ripnak": 25,
                "Alja Vrček": 55,
                "Ajla Mehulić": 17,
                "Vita Sečki": 35,
                "Zoja Verbovšek": 25,
                "Zala Kuri": 6.5,
                "Kaja Krebs": 15
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "6Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    3,
                    2,
                    1,
                    3
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    2,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    2,
                    1,
                    2,
                    2
                  ]
                },
                {
                  "code": "PTZ",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    1,
                    4,
                    3,
                    3
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 38,
                  "conceded": 26,
                  "shots": 27,
                  "sevenRatio": "3/3",
                  "otherRatio": "23/24"
                },
                {
                  "person": "Klara Horvatič",
                  "minutes": 22,
                  "conceded": 11,
                  "shots": 13,
                  "sevenRatio": "2/2",
                  "otherRatio": "9/11"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Velenje",
              "fouls": [
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 2
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 0
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "seven": 3,
                  "twoMin": 0
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "seven": 2,
                  "twoMin": 0
                }
              ],
              "summaries": {
                "Lara Kolobarič": {
                  "index": 6.999999999999998,
                  "goal": 4,
                  "sevenGoal": 2,
                  "saves": 2,
                  "miss": 3,
                  "sevenFailed": 1,
                  "assist": 4,
                  "DA": 0,
                  "DN": 0,
                  "NA": 2,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 3,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Zala Petek": {
                  "index": 7.300000000000001,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 3,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 8,
                  "DA": 2,
                  "DN": 0,
                  "NA": 0,
                  "NN": 2,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 5,
                  "PNN": 5,
                  "blame": 6,
                  "sevenDrawn": 0
                },
                "Sarah Pilih Derča": {
                  "index": 7.000000000000002,
                  "goal": 5,
                  "sevenGoal": 2,
                  "saves": 3,
                  "miss": 1,
                  "sevenFailed": 1,
                  "assist": 2,
                  "DA": 0,
                  "DN": 1,
                  "NA": 0,
                  "NN": 1,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 4,
                  "PNN": 3,
                  "blame": 11,
                  "sevenDrawn": 2
                },
                "Ella Podergajs": {
                  "index": 5.799999999999999,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 2,
                  "DN": 1,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 2,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Lenja Ripnak": {
                  "index": 0.7,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 0,
                  "blame": 2,
                  "sevenDrawn": 1
                },
                "Alja Vrček": {
                  "index": 7.499999999999999,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 4,
                  "PON": 1,
                  "PNA": 7,
                  "PNN": 3,
                  "blame": 1,
                  "sevenDrawn": 3
                },
                "Ajla Mehulić": {
                  "index": 8.7,
                  "goal": 2,
                  "sevenGoal": 1,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 5,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 1,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 6,
                  "PNN": 2,
                  "blame": 3,
                  "sevenDrawn": 1
                },
                "Vita Sečki": {
                  "index": 0.2999999999999998,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 1,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Zoja Verbovšek": {
                  "index": 6,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 4,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Kaja Krebs": {
                  "index": -0.3999999999999999,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 0
                }
              },
              "notes": [],
              "teamIndex": 49.9,
              "reportedTeamIndex": 49.9
            },
            "old": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9O",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    0,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "6O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "6O",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "KG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    1,
                    2,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNN",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    2,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "quarters": [
                    4,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    3,
                    0,
                    3
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    2,
                    2
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "PNA",
                  "quarters": [
                    3,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "A7",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    1,
                    3,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 38,
                "Zala Petek": 42,
                "Sarah Pilih Derča": 53.5,
                "Ella Podergajs": 42,
                "Lenja Ripnak": 25,
                "Alja Vrček": 55,
                "Ajla Mehulić": 17,
                "Vita Sečki": 35,
                "Zoja Verbovšek": 25,
                "Zala Kuri": 6.5,
                "Kaja Krebs": 15
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "6Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    3,
                    2,
                    1,
                    3
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    2,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    2,
                    1,
                    2,
                    2
                  ]
                },
                {
                  "code": "PTZ",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    1,
                    4,
                    3,
                    3
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 38,
                  "conceded": 26,
                  "shots": 27,
                  "sevenRatio": "3/3",
                  "otherRatio": "23/24"
                },
                {
                  "person": "Klara Horvatič",
                  "minutes": 22,
                  "conceded": 11,
                  "shots": 13,
                  "sevenRatio": "2/2",
                  "otherRatio": "9/11"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Velenje",
              "indices": {
                "Lara Kolobarič": [
                  5.7,
                  -1.0,
                  1.4,
                  1.7
                ],
                "Zala Petek": [
                  1.0,
                  5.7,
                  2.3,
                  -0.2
                ],
                "Sarah Pilih Derča": [
                  -0.2,
                  5.2,
                  3.2,
                  2.6
                ],
                "Ella Podergajs": [
                  1.2,
                  4.2,
                  0.7,
                  0.0
                ],
                "Lenja Ripnak": [
                  0.2,
                  0.2,
                  0.0,
                  0.0
                ],
                "Alja Vrček": [
                  1.2,
                  0.0,
                  1.4,
                  1.8
                ],
                "Ajla Mehulić": [
                  0.0,
                  0.3,
                  0.0,
                  7.5
                ],
                "Vita Sečki": [
                  0.0,
                  0.0,
                  2.8,
                  -0.6
                ],
                "Zoja Verbovšek": [
                  0.0,
                  0.0,
                  3.4,
                  3.5
                ],
                "Kaja Krebs": [
                  0.5,
                  0.0,
                  0.0,
                  0.0
                ]
              },
              "teamIndex": 55.7
            },
            "differences": [],
            "aliases": []
          },
          "venue": "Velenje"
        },
        {
          "date": "2026-10-11",
          "opponent": "Krka",
          "finalHome": 25,
          "finalAway": 25,
          "firstHalfHome": 11,
          "firstHalfAway": 14,
          "id": "excel-2026-members-2026-10-11",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7G",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6G",
                  "quarters": [
                    0,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    2,
                    2,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    1,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    4,
                    2,
                    2
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "POA",
                  "quarters": [
                    3,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AG",
                  "quarters": [
                    2,
                    2,
                    3,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    3
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    3
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 41,
                "Zala Petek": 60,
                "Sarah Pilih Derča": 38,
                "Ella Podergajs": 7,
                "Lenja Ripnak": 60,
                "Alja Vrček": 50,
                "Ajla Mehulić": 28,
                "Zoja Verbovšek": 1,
                "Zala Kuri": 16,
                "Kaja Krebs": 53
              },
              "opponents": [
                {
                  "code": "9O",
                  "quarters": [
                    3,
                    0,
                    0,
                    3
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "7O",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    1,
                    1,
                    3,
                    1
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    1,
                    5,
                    1,
                    1
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    0,
                    2,
                    1,
                    3
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    2,
                    2,
                    1,
                    1
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 22,
                  "conceded": 9,
                  "shots": 16,
                  "sevenRatio": "0/1",
                  "otherRatio": "9/15"
                },
                {
                  "person": "Klara Horvatič",
                  "minutes": 38,
                  "conceded": 16,
                  "shots": 24,
                  "sevenRatio": "1/1",
                  "otherRatio": "15/23"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Krka",
              "fouls": [
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 1
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 2
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "seven": 3,
                  "twoMin": 0
                },
                {
                  "person": "Kaja Krebs",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                }
              ],
              "summaries": {
                "Lara Kolobarič": {
                  "index": 6.5,
                  "goal": 1,
                  "sevenGoal": 3,
                  "saves": 2,
                  "miss": 2,
                  "sevenFailed": 1,
                  "assist": 9,
                  "DA": 0,
                  "DN": 0,
                  "NA": 5,
                  "NN": 0,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 7,
                  "blame": 8,
                  "sevenDrawn": 0
                },
                "Zala Petek": {
                  "index": 13.6,
                  "goal": 5,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 7,
                  "DA": 2,
                  "DN": 0,
                  "NA": 3,
                  "NN": 1,
                  "POA": 3,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 5,
                  "blame": 5,
                  "sevenDrawn": 1
                },
                "Sarah Pilih Derča": {
                  "index": -0.5,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 2,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 2,
                  "POA": 3,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 1,
                  "blame": 3,
                  "sevenDrawn": 1
                },
                "Ella Podergajs": {
                  "index": 1.4,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Lenja Ripnak": {
                  "index": 7.5,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 3,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 2
                },
                "Alja Vrček": {
                  "index": 6.1,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 5,
                  "PON": 1,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 1
                },
                "Ajla Mehulić": {
                  "index": 5.8999999999999995,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 3,
                  "DA": 3,
                  "DN": 0,
                  "NA": 1,
                  "NN": 3,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 8,
                  "PNN": 3,
                  "blame": 1,
                  "sevenDrawn": 3
                },
                "Zoja Verbovšek": {
                  "index": 2.8,
                  "goal": 0,
                  "sevenGoal": 4,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Zala Kuri": {
                  "index": 2.3000000000000003,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 3,
                  "PON": 1,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Kaja Krebs": {
                  "index": 3.9000000000000004,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 6,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                }
              },
              "notes": [],
              "teamIndex": 49.5,
              "reportedTeamIndex": 49.5
            },
            "old": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "7G",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6G",
                  "quarters": [
                    0,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    2,
                    2,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    1,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    4,
                    2,
                    2
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "POA",
                  "quarters": [
                    3,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AG",
                  "quarters": [
                    2,
                    2,
                    3,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    3
                  ]
                },
                {
                  "person": "Kaja Krebs",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    3
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 41,
                "Zala Petek": 60,
                "Sarah Pilih Derča": 38,
                "Ella Podergajs": 7,
                "Lenja Ripnak": 60,
                "Alja Vrček": 50,
                "Ajla Mehulić": 28,
                "Zoja Verbovšek": 1,
                "Zala Kuri": 16,
                "Kaja Krebs": 53
              },
              "opponents": [
                {
                  "code": "9O",
                  "quarters": [
                    3,
                    0,
                    0,
                    3
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "7O",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    1,
                    1,
                    3,
                    1
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    1,
                    5,
                    1,
                    1
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    0,
                    2,
                    1,
                    3
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    2,
                    2,
                    1,
                    1
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 22,
                  "conceded": 9,
                  "shots": 16,
                  "sevenRatio": "0/1",
                  "otherRatio": "9/15"
                },
                {
                  "person": "Klara Horvatič",
                  "minutes": 38,
                  "conceded": 16,
                  "shots": 24,
                  "sevenRatio": "1/1",
                  "otherRatio": "15/23"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Krka",
              "indices": {
                "Lara Kolobarič": [
                  3.2,
                  2.9,
                  3.3,
                  -1.4
                ],
                "Zala Petek": [
                  2.5,
                  0.4,
                  3.8,
                  6.9
                ],
                "Sarah Pilih Derča": [
                  -0.1,
                  0.0,
                  -0.3,
                  0.4
                ],
                "Ella Podergajs": [
                  0.0,
                  0.0,
                  1.4,
                  0.0
                ],
                "Lenja Ripnak": [
                  3.8,
                  1.8,
                  1.8,
                  -0.2
                ],
                "Alja Vrček": [
                  0.4,
                  2.9,
                  2.2,
                  1.1
                ],
                "Ajla Mehulić": [
                  0.0,
                  -0.2,
                  1.0,
                  1.3
                ],
                "Zoja Verbovšek": [
                  0.0,
                  0.0,
                  0.7,
                  2.1
                ],
                "Zala Kuri": [
                  1.8,
                  0.0,
                  0.8,
                  0.4
                ],
                "Kaja Krebs": [
                  1.2,
                  0.2,
                  -0.3,
                  3.0
                ]
              },
              "teamIndex": 48.8
            },
            "differences": [],
            "aliases": []
          }
        },
        {
          "date": "2026-10-17",
          "opponent": "Ptuj",
          "finalHome": 29,
          "finalAway": 31,
          "firstHalfHome": 17,
          "firstHalfAway": 15,
          "id": "excel-2026-members-2026-10-17",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    0,
                    3
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    3,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    5
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    2,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    3,
                    2,
                    1,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    2,
                    2,
                    3,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    3,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    2,
                    0,
                    4
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    2,
                    4,
                    4,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukič",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukič",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AG",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    2,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 31.5,
                "Zala Petek": 55.5,
                "Sarah Pilih Derča": 55.5,
                "Ella Podergajs": 60,
                "Lenja Ripnak": 56,
                "Alja Vrček": 9,
                "Ajla Mehulić": 19,
                "Zala Kuri": 45.5,
                "Pia Kljun": 4,
                "Larissa Zukič": 10
              },
              "opponents": [
                {
                  "code": "9O",
                  "quarters": [
                    0,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "7O",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    1,
                    4,
                    1,
                    3
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    2,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    2,
                    3,
                    1,
                    1
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    4,
                    1
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 60,
                  "conceded": 31,
                  "shots": 41,
                  "sevenRatio": "9/11",
                  "otherRatio": "22/30"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Ptuj",
              "fouls": [
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 2
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 3
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "seven": 2,
                  "twoMin": 0
                },
                {
                  "person": "Ella Podergajs",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "seven": 3,
                  "twoMin": 2
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 1
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "seven": 2,
                  "twoMin": 2
                }
              ],
              "summaries": {
                "Lara Kolobarič": {
                  "index": 4.3999999999999995,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 3,
                  "miss": 2,
                  "sevenFailed": 0,
                  "assist": 3,
                  "DA": 1,
                  "DN": 0,
                  "NA": 2,
                  "NN": 1,
                  "POA": 3,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 3,
                  "blame": 5,
                  "sevenDrawn": 0
                },
                "Zala Petek": {
                  "index": 13,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 5,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 1,
                  "POA": 7,
                  "PON": 0,
                  "PNA": 5,
                  "PNN": 2,
                  "blame": 1,
                  "sevenDrawn": 2
                },
                "Sarah Pilih Derča": {
                  "index": 11.299999999999995,
                  "goal": 4,
                  "sevenGoal": 4,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 2,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 8,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 2,
                  "blame": 6,
                  "sevenDrawn": 0
                },
                "Ella Podergajs": {
                  "index": 9.099999999999998,
                  "goal": 7,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 1,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 1,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Lenja Ripnak": {
                  "index": 10.399999999999997,
                  "goal": 6,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 9,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 1,
                  "blame": 6,
                  "sevenDrawn": 0
                },
                "Alja Vrček": {
                  "index": 1.3000000000000003,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 3,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Ajla Mehulić": {
                  "index": 7.1,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 4,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 1,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 6,
                  "PNN": 3,
                  "blame": 1,
                  "sevenDrawn": 2
                },
                "Zala Kuri": {
                  "index": 4.5,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 13,
                  "PON": 1,
                  "PNA": 3,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Pia Kljun": {
                  "index": 0.7,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Larissa Zukič": {
                  "index": 0.5,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 2,
                  "PON": 1,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                }
              },
              "notes": [],
              "teamIndex": 62.3,
              "reportedTeamIndex": 62.3
            },
            "old": {
              "rows": [
                {
                  "person": "Lara Kolobarič",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9O",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    0,
                    3
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "KG",
                  "quarters": [
                    3,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "POA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    2,
                    5
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    2,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    3,
                    2,
                    1,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    2,
                    2,
                    3,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "POA",
                  "quarters": [
                    3,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Alja Vrček",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    2,
                    0,
                    4
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    2,
                    4,
                    4,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukič",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukič",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "AG",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    2,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lara Kolobarič",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ella Podergajs",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                }
              ],
              "minutes": {
                "Lara Kolobarič": 31.5,
                "Zala Petek": 55.5,
                "Sarah Pilih Derča": 55.5,
                "Ella Podergajs": 60,
                "Lenja Ripnak": 56,
                "Alja Vrček": 9,
                "Ajla Mehulić": 19,
                "Zala Kuri": 45.5,
                "Pia Kljun": 4,
                "Larissa Zukič": 10
              },
              "opponents": [
                {
                  "code": "9O",
                  "quarters": [
                    0,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "7O",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    1,
                    4,
                    1,
                    3
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    2,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    2,
                    3,
                    1,
                    1
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    4,
                    1
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 60,
                  "conceded": 31,
                  "shots": 41,
                  "sevenRatio": "9/11",
                  "otherRatio": "22/30"
                }
              ],
              "file": "Celje članice sezona 2026 nov index.xlsx",
              "sheet": "Ptuj",
              "indices": {
                "Lara Kolobarič": [
                  3.6,
                  0.9,
                  1.1,
                  0.0
                ],
                "Zala Petek": [
                  4.8,
                  1.4,
                  2.1,
                  2.3
                ],
                "Sarah Pilih Derča": [
                  4.6,
                  2.7,
                  1.8,
                  4.1
                ],
                "Ella Podergajs": [
                  5.4,
                  2.9,
                  0.4,
                  1.6
                ],
                "Lenja Ripnak": [
                  2.9,
                  2.2,
                  5.4,
                  2.2
                ],
                "Alja Vrček": [
                  2.6,
                  0.0,
                  0.0,
                  0.0
                ],
                "Ajla Mehulić": [
                  0.0,
                  2.7,
                  0.0,
                  1.7
                ],
                "Zala Kuri": [
                  0.8,
                  1.6,
                  1.6,
                  1.6
                ],
                "Larissa Zukič": [
                  0.0,
                  0.0,
                  0.4,
                  0.8
                ],
                "Pia Kljun": [
                  0.0,
                  0.0,
                  0.7,
                  0.0
                ]
              },
              "teamIndex": 66.9
            },
            "differences": [],
            "aliases": []
          },
          "venue": "Ptuj"
        }
      ],
      "roster": {
        "players": [
          "Ajla Mehulić",
          "Alja Vrček",
          "Ela Adamič",
          "Ella Podergajs",
          "Kaja Krebs",
          "Lara Kolobarič",
          "Larissa Zukič",
          "Lenja Ripnak",
          "Lina Kolobarič",
          "Pia Kljun",
          "Sarah Pilih Derča",
          "Tinkara Korošec",
          "Vita Sečki",
          "Zala Kuri",
          "Zala Petek",
          "Zoja Verbovšek"
        ],
        "keepers": [
          "Klara Horvatič",
          "Nika Kuri"
        ]
      }
    },
    "juniors": {
      "games": [
        {
          "date": "2026-09-13",
          "opponent": "Krka",
          "finalHome": 38,
          "finalAway": 20,
          "firstHalfHome": 20,
          "firstHalfAway": 11,
          "id": "excel-2026-juniors-2026-09-13",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDO",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9G",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PTG",
                  "quarters": [
                    0,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9Z",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PTZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    4,
                    0,
                    4,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    4,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PON",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    2,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    3,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    3,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "NN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 30,
                "Sarah Pilih Derča": 29,
                "Lenja Ripnak": 26,
                "Ajla Mehulić": 30,
                "Vita Sečki": 31,
                "Zoja Verbovšek": 53,
                "Tinkara Korošec": 35,
                "Lina Kolobarič": 31,
                "Zala Kuri": 25,
                "Pia Kljun": 17,
                "Lana Švrljuga": 14,
                "Teja Jereb": 19,
                "Zoja Jurak": 15,
                "Brina Mernik": 5
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    3,
                    2,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    5,
                    4,
                    3,
                    6
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    4,
                    3,
                    2,
                    2
                  ]
                },
                {
                  "code": "6Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    2,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 46,
                  "conceded": 14,
                  "shots": 35,
                  "sevenRatio": "3/3",
                  "otherRatio": "11/32"
                },
                {
                  "person": "Zoja Brglez",
                  "minutes": 14,
                  "conceded": 6,
                  "shots": 13,
                  "sevenRatio": null,
                  "otherRatio": "6/13"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Krka",
              "fouls": [
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 0
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                }
              ],
              "summaries": {
                "Zala Petek": {
                  "index": 9.299999999999997,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 3,
                  "DA": 1,
                  "DN": 0,
                  "NA": 2,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 2,
                  "blame": 2,
                  "sevenDrawn": 0
                },
                "Sarah Pilih Derča": {
                  "index": 8.899999999999999,
                  "goal": 2,
                  "sevenGoal": 2,
                  "saves": 2,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 5,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 3,
                  "POA": 8,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Lenja Ripnak": {
                  "index": 10.699999999999998,
                  "goal": 6,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 1,
                  "PNA": 3,
                  "PNN": 1,
                  "blame": 0,
                  "sevenDrawn": 2
                },
                "Ajla Mehulić": {
                  "index": 10.299999999999999,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 5,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 1,
                  "blame": 2,
                  "sevenDrawn": 0
                },
                "Vita Sečki": {
                  "index": 4.499999999999999,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 2,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 4,
                  "PON": 1,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Zoja Verbovšek": {
                  "index": 6.699999999999999,
                  "goal": 5,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 2,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Tinkara Korošec": {
                  "index": -0.3999999999999999,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 0,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Lina Kolobarič": {
                  "index": 9.199999999999998,
                  "goal": 3,
                  "sevenGoal": 1,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 4,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 2,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Zala Kuri": {
                  "index": 2.4999999999999996,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 2,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 5,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Pia Kljun": {
                  "index": 4.199999999999999,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Lana Švrljuga": {
                  "index": 2.1,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 1,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Teja Jereb": {
                  "index": 3.5,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 2,
                  "DA": 0,
                  "DN": 1,
                  "NA": 1,
                  "NN": 2,
                  "POA": 1,
                  "PON": 1,
                  "PNA": 0,
                  "PNN": 2,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Zoja Jurak": {
                  "index": 0.8,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 1,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 4,
                  "PNN": 2,
                  "blame": 0,
                  "sevenDrawn": 1
                },
                "Brina Mernik": {
                  "index": 1.4,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                }
              },
              "notes": [
                [
                  "Ostalo",
                  "Kuri",
                  "NA-1",
                  "AG-1",
                  "AG-1",
                  "AG-1"
                ]
              ],
              "teamIndex": 73.7,
              "reportedTeamIndex": 73.7
            },
            "old": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDO",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9G",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PTG",
                  "quarters": [
                    0,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9Z",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PTZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    4,
                    0,
                    4,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    4,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PON",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    2,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    3,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    3,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "NN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 30,
                "Sarah Pilih Derča": 29,
                "Lenja Ripnak": 26,
                "Ajla Mehulić": 30,
                "Vita Sečki": 31,
                "Zoja Verbovšek": 53,
                "Tinkara Korošec": 35,
                "Lina Kolobarič": 31,
                "Zala Kuri": 25,
                "Pia Kljun": 17,
                "Lana Švrljuga": 14,
                "Teja Jereb": 19,
                "Zoja Jurak": 15,
                "Brina Mernik": 5
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    3,
                    2,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    5,
                    4,
                    3,
                    6
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    4,
                    3,
                    2,
                    2
                  ]
                },
                {
                  "code": "6Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    2,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 46,
                  "conceded": 14,
                  "shots": 35,
                  "sevenRatio": "3/3",
                  "otherRatio": "11/32"
                },
                {
                  "person": "Zoja Brglez",
                  "minutes": 14,
                  "conceded": 6,
                  "shots": 13,
                  "sevenRatio": null,
                  "otherRatio": "6/13"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Krka",
              "indices": {
                "Zala Petek": [
                  6.6,
                  2.9,
                  0.0,
                  0.0
                ],
                "Sarah Pilih Derča": [
                  6.1,
                  0.0,
                  4.1,
                  0.0
                ],
                "Lenja Ripnak": [
                  7.4,
                  0.0,
                  1.4,
                  0.0
                ],
                "Ajla Mehulić": [
                  4.5,
                  3.8,
                  2.3,
                  0.0
                ],
                "Vita Sečki": [
                  0.0,
                  4.6,
                  -0.8,
                  1.4
                ],
                "Zoja Verbovšek": [
                  2.8,
                  0.4,
                  -0.4,
                  5.2
                ],
                "Lina Kolobarič": [
                  0.0,
                  3.8,
                  1.4,
                  4.6
                ],
                "Zala Kuri": [
                  0.0,
                  1.8,
                  0.0,
                  0.8
                ],
                "Pia Kljun": [
                  0.0,
                  0.0,
                  3.5,
                  0.7
                ],
                "Lana Švrljuga": [
                  0.0,
                  0.0,
                  0.0,
                  2.3
                ],
                "Teja Jereb": [
                  0.0,
                  0.0,
                  -0.7,
                  4.9
                ],
                "Zoja Jurak": [
                  0.0,
                  -1.0,
                  0.0,
                  -0.2
                ],
                "Brina Mernik": [
                  0.0,
                  0.0,
                  0.0,
                  1.4
                ],
                "Tinkara Korošec": [
                  0.0,
                  0.1,
                  0.8,
                  0.0
                ]
              },
              "teamIndex": 76.5
            },
            "differences": [],
            "aliases": []
          },
          "venue": "Krka"
        },
        {
          "date": "2026-09-21",
          "opponent": "Olimpija",
          "finalHome": 33,
          "finalAway": 33,
          "firstHalfHome": 19,
          "firstHalfAway": 15,
          "id": "excel-2026-juniors-2026-09-21",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9G",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7O",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "7Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PTO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    1,
                    1,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KG",
                  "quarters": [
                    0,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    4,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    4,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    2,
                    1,
                    3,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    2,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    4,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    3,
                    1,
                    2,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    4
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "quarters": [
                    0,
                    4,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    2,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    2,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    2,
                    2,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    2,
                    1,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    2,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 51,
                "Sarah Pilih Derča": 20,
                "Lenja Ripnak": 24,
                "Ajla Mehulić": 29,
                "Vita Sečki": 15,
                "Zoja Verbovšek": 60,
                "Tinkara Korošec": 42,
                "Lina Kolobarič": 26,
                "Pia Kljun": 32,
                "Larissa Zukić": 51
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    3,
                    1
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    2,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    5,
                    2,
                    1,
                    3
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    3,
                    3,
                    2,
                    2
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    2,
                    2
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 60,
                  "conceded": 33,
                  "shots": 48,
                  "sevenRatio": "5/5",
                  "otherRatio": "28/43"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Olimpija",
              "fouls": [
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 0
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 3
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "seven": 3,
                  "twoMin": 0
                },
                {
                  "person": "Vita Sečki",
                  "code": "PNA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Pia Kljun",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Pia Kljun",
                  "code": "PNN",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Larissa Zukić",
                  "code": "POA",
                  "seven": 2,
                  "twoMin": 0
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 1
                }
              ],
              "summaries": {
                "Zala Petek": {
                  "index": 14.300000000000002,
                  "goal": 6,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 3,
                  "DA": 4,
                  "DN": 0,
                  "NA": 3,
                  "NN": 3,
                  "POA": 5,
                  "PON": 0,
                  "PNA": 7,
                  "PNN": 8,
                  "blame": 4,
                  "sevenDrawn": 2
                },
                "Sarah Pilih Derča": {
                  "index": 4.6000000000000005,
                  "goal": 2,
                  "sevenGoal": 1,
                  "saves": 0,
                  "miss": 1,
                  "sevenFailed": 1,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 5,
                  "PON": 1,
                  "PNA": 2,
                  "PNN": 2,
                  "blame": 3,
                  "sevenDrawn": 1
                },
                "Lenja Ripnak": {
                  "index": 1,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 0,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Ajla Mehulić": {
                  "index": 13.999999999999998,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 1,
                  "sevenFailed": 1,
                  "assist": 10,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 4,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 8,
                  "PNN": 8,
                  "blame": 2,
                  "sevenDrawn": 3
                },
                "Vita Sečki": {
                  "index": 1.8000000000000007,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 2,
                  "sevenDrawn": 0
                },
                "Zoja Verbovšek": {
                  "index": 17.1,
                  "goal": 5,
                  "sevenGoal": 5,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 8,
                  "DA": 1,
                  "DN": 1,
                  "NA": 2,
                  "NN": 2,
                  "POA": 5,
                  "PON": 0,
                  "PNA": 3,
                  "PNN": 5,
                  "blame": 7,
                  "sevenDrawn": 1
                },
                "Tinkara Korošec": {
                  "index": 2.5,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Lina Kolobarič": {
                  "index": 3.8,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 1,
                  "DN": 1,
                  "NA": 1,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 3,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Pia Kljun": {
                  "index": 5.1,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 3,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 3,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 2,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Larissa Zukić": {
                  "index": 3.299999999999999,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 1,
                  "blame": 9,
                  "sevenDrawn": 1
                }
              },
              "notes": [],
              "teamIndex": 67.5,
              "reportedTeamIndex": 67.5
            },
            "old": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "9G",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7O",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "7Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PTO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    1,
                    1,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KG",
                  "quarters": [
                    0,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    4,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    4,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    2,
                    1,
                    3,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    2,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    4,
                    2,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    3,
                    1,
                    2,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    4
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "quarters": [
                    0,
                    4,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    2,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    2,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    2,
                    2,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    2,
                    1,
                    2,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "NN",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    2,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 51,
                "Sarah Pilih Derča": 20,
                "Lenja Ripnak": 24,
                "Ajla Mehulić": 29,
                "Vita Sečki": 15,
                "Zoja Verbovšek": 60,
                "Tinkara Korošec": 42,
                "Lina Kolobarič": 26,
                "Pia Kljun": 32,
                "Larissa Zukić": 51
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    1,
                    3,
                    1
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    2,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    5,
                    2,
                    1,
                    3
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    2
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    3,
                    3,
                    2,
                    2
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    2,
                    2
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 60,
                  "conceded": 33,
                  "shots": 48,
                  "sevenRatio": "5/5",
                  "otherRatio": "28/43"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Olimpija",
              "indices": {
                "Zala Petek": [
                  2.8,
                  1.4,
                  1.4,
                  6.2
                ],
                "Sarah Pilih Derča": [
                  3.7,
                  0.0,
                  1.6,
                  0.0
                ],
                "Lenja Ripnak": [
                  1.4,
                  0.0,
                  0.7,
                  0.0
                ],
                "Ajla Mehulić": [
                  0.9,
                  4.4,
                  1.3,
                  3.7
                ],
                "Vita Sečki": [
                  1.0,
                  1.3,
                  0.0,
                  0.0
                ],
                "Zoja Verbovšek": [
                  3.9,
                  8.1,
                  7.1,
                  -0.4
                ],
                "Tinkara Korošec": [
                  1.4,
                  1.6,
                  0.0,
                  0.0
                ],
                "Pia Kljun": [
                  0.0,
                  0.2,
                  4.9,
                  0.3
                ],
                "Larissa Zukić": [
                  0.0,
                  4.6,
                  0.8,
                  1.4
                ],
                "Lina Kolobarič": [
                  -0.7,
                  2.8,
                  0.8,
                  0.4
                ]
              },
              "teamIndex": 69.0
            },
            "differences": [],
            "aliases": []
          }
        },
        {
          "date": "2026-10-04",
          "opponent": "Ajdovščina",
          "finalHome": 28,
          "finalAway": 23,
          "firstHalfHome": 17,
          "firstHalfAway": 12,
          "id": "excel-2026-juniors-2026-10-04",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDG",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    0,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PTO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    3,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    3,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    5,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    3,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "POA",
                  "quarters": [
                    0,
                    5,
                    0,
                    3
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "DA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 51,
                "Sarah Pilih Derča": 36,
                "Lenja Ripnak": 37,
                "Ajla Mehulić": 29,
                "Vita Sečki": 24,
                "Zoja Verbovšek": 60,
                "Tinkara Korošec": 19,
                "Lina Kolobarič": 24,
                "Zala Kuri": 15,
                "Pia Kljun": 7,
                "Teja Jereb": 31,
                "Larissa Zukić": 19
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    2,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    3,
                    2,
                    1,
                    4
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    0,
                    2,
                    0,
                    2
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 54,
                  "conceded": 19,
                  "shots": 26,
                  "sevenRatio": "4/4",
                  "otherRatio": "15/22"
                },
                {
                  "person": "Zoja Brglez",
                  "minutes": 6,
                  "conceded": 4,
                  "shots": 5,
                  "sevenRatio": "1/1",
                  "otherRatio": "3/4"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Ajdovščina",
              "fouls": [
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "seven": 3,
                  "twoMin": 0
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "POA",
                  "seven": 2,
                  "twoMin": 0
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Teja Jereb",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 1
                },
                {
                  "person": "Teja Jereb",
                  "code": "PON",
                  "seven": 0,
                  "twoMin": 1
                }
              ],
              "summaries": {
                "Zala Petek": {
                  "index": 16.1,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 8,
                  "DA": 0,
                  "DN": 2,
                  "NA": 0,
                  "NN": 0,
                  "POA": 6,
                  "PON": 0,
                  "PNA": 6,
                  "PNN": 2,
                  "blame": 2,
                  "sevenDrawn": 3
                },
                "Sarah Pilih Derča": {
                  "index": 10.6,
                  "goal": 6,
                  "sevenGoal": 2,
                  "saves": 2,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 4,
                  "PNN": 3,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Lenja Ripnak": {
                  "index": 9.099999999999998,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 2,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 8,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 1
                },
                "Ajla Mehulić": {
                  "index": 6.9,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 2,
                  "PON": 1,
                  "PNA": 3,
                  "PNN": 3,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Vita Sečki": {
                  "index": -0.8000000000000003,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 1,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 2,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Zoja Verbovšek": {
                  "index": 5.3999999999999995,
                  "goal": 4,
                  "sevenGoal": 3,
                  "saves": 2,
                  "miss": 2,
                  "sevenFailed": 1,
                  "assist": 1,
                  "DA": 1,
                  "DN": 0,
                  "NA": 2,
                  "NN": 1,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 5,
                  "sevenDrawn": 1
                },
                "Lina Kolobarič": {
                  "index": 4.600000000000001,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 2,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 2,
                  "DA": 0,
                  "DN": 0,
                  "NA": 2,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 3,
                  "blame": 4,
                  "sevenDrawn": 1
                },
                "Zala Kuri": {
                  "index": 2.0999999999999996,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 1,
                  "POA": 4,
                  "PON": 2,
                  "PNA": 2,
                  "PNN": 0,
                  "blame": 2,
                  "sevenDrawn": 0
                },
                "Pia Kljun": {
                  "index": -0.3,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Teja Jereb": {
                  "index": 7,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 2,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 8,
                  "PON": 1,
                  "PNA": 1,
                  "PNN": 1,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Larissa Zukić": {
                  "index": -0.2,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                }
              },
              "notes": [
                [
                  "Ostalo",
                  "Kuri",
                  "AO-1"
                ]
              ],
              "teamIndex": 60.5,
              "reportedTeamIndex": 60.5
            },
            "old": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "6G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PDG",
                  "quarters": [
                    2,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "9G",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9G",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KO",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    0,
                    2,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "9O",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PDG",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PTO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    3,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    3,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    2,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    5,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "POA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PON",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    3,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "POA",
                  "quarters": [
                    0,
                    5,
                    0,
                    3
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "A7",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lina Kolobarič",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Vita Sečki",
                  "code": "DA",
                  "quarters": [
                    0,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "DA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 51,
                "Sarah Pilih Derča": 36,
                "Lenja Ripnak": 37,
                "Ajla Mehulić": 29,
                "Vita Sečki": 24,
                "Zoja Verbovšek": 60,
                "Tinkara Korošec": 19,
                "Lina Kolobarič": 24,
                "Zala Kuri": 15,
                "Pia Kljun": 7,
                "Teja Jereb": 31,
                "Larissa Zukić": 19
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    2,
                    2,
                    0,
                    1
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    1,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    3,
                    2,
                    1,
                    4
                  ]
                },
                {
                  "code": "PDZ",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    0,
                    2,
                    0,
                    2
                  ]
                },
                {
                  "code": "PTO",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 54,
                  "conceded": 19,
                  "shots": 26,
                  "sevenRatio": "4/4",
                  "otherRatio": "15/22"
                },
                {
                  "person": "Zoja Brglez",
                  "minutes": 6,
                  "conceded": 4,
                  "shots": 5,
                  "sevenRatio": "1/1",
                  "otherRatio": "3/4"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Ajdovščina",
              "indices": {
                "Zala Petek": [
                  5.0,
                  4.2,
                  4.7,
                  0.7
                ],
                "Sarah Pilih Derča": [
                  6.0,
                  -0.2,
                  3.1,
                  0.8
                ],
                "Lenja Ripnak": [
                  3.5,
                  0.0,
                  4.1,
                  0.4
                ],
                "Ajla Mehulić": [
                  4.6,
                  1.4,
                  0.3,
                  1.4
                ],
                "Vita Sečki": [
                  0.0,
                  -0.2,
                  0.0,
                  1.1
                ],
                "Zoja Verbovšek": [
                  -0.2,
                  4.5,
                  3.3,
                  -1.1
                ],
                "Lina Kolobarič": [
                  0.0,
                  4.8,
                  0.3,
                  -0.5
                ],
                "Zala Kuri": [
                  0.0,
                  0.0,
                  2.3,
                  0.8
                ],
                "Teja Jereb": [
                  0.0,
                  4.8,
                  1.0,
                  1.6
                ],
                "Larissa Zukić": [
                  0.0,
                  0.0,
                  -0.2,
                  0.0
                ],
                "Pia Kljun": [
                  0,
                  0,
                  0,
                  0
                ]
              },
              "teamIndex": 62.3
            },
            "differences": [],
            "aliases": []
          },
          "venue": "Ajdovščina"
        },
        {
          "date": "2026-10-19",
          "opponent": "Koper",
          "finalHome": 31,
          "finalAway": 21,
          "firstHalfHome": 18,
          "firstHalfAway": 8,
          "id": "excel-2026-juniors-2026-10-19",
          "complete": true,
          "events": [],
          "imported": {
            "version": 2,
            "new": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KZ",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PTG",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tiana Novak",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Tiana Novak",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    3,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    2,
                    4
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    0,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    4,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "POA",
                  "quarters": [
                    2,
                    2,
                    3,
                    2
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PON",
                  "quarters": [
                    0,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    2,
                    3
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    3
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PON",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    3,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "A7",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    4
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 25,
                "Sarah Pilih Derča": 30,
                "Lenja Ripnak": 13,
                "Ajla Mehulić": 12,
                "Zoja Verbovšek": 49,
                "Tinkara Korošec": 30,
                "Zala Kuri": 26,
                "Pia Kljun": 32,
                "Lana Švrljuga": 15,
                "Teja Jereb": 40,
                "Zoja Jurak": 23,
                "Brina Mernik": 15,
                "Larissa Zukić": 45,
                "Tiana Novak": 1
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    3,
                    4,
                    2,
                    1
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "code": "6Z",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    4,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    4,
                    2
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    3,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "code": "PTZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 39,
                  "conceded": 11,
                  "shots": 24,
                  "sevenRatio": "0/1",
                  "otherRatio": "11/23"
                },
                {
                  "person": "Zoja Brglez",
                  "minutes": 21,
                  "conceded": 10,
                  "shots": 15,
                  "sevenRatio": "1/1",
                  "otherRatio": "9/14"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Koper",
              "fouls": [
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "seven": 2,
                  "twoMin": 1
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "seven": 0,
                  "twoMin": 2
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Pia Kljun",
                  "code": "POA",
                  "seven": 1,
                  "twoMin": 0
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 1
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNA",
                  "seven": 3,
                  "twoMin": 2
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNA",
                  "seven": 1,
                  "twoMin": 0
                }
              ],
              "summaries": {
                "Zala Petek": {
                  "index": 8.6,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 4,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 4,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Sarah Pilih Derča": {
                  "index": 9,
                  "goal": 3,
                  "sevenGoal": 2,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 2,
                  "DA": 0,
                  "DN": 1,
                  "NA": 2,
                  "NN": 0,
                  "POA": 5,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 1,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Lenja Ripnak": {
                  "index": 4.499999999999999,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 1,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 1,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Ajla Mehulić": {
                  "index": 1.8,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 2,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Zoja Verbovšek": {
                  "index": 8.2,
                  "goal": 0,
                  "sevenGoal": 2,
                  "saves": 2,
                  "miss": 2,
                  "sevenFailed": 0,
                  "assist": 5,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 1,
                  "POA": 7,
                  "PON": 1,
                  "PNA": 4,
                  "PNN": 2,
                  "blame": 4,
                  "sevenDrawn": 2
                },
                "Tinkara Korošec": {
                  "index": 1.6000000000000005,
                  "goal": 0,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 1,
                  "NA": 0,
                  "NN": 0,
                  "POA": 6,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 4,
                  "sevenDrawn": 0
                },
                "Zala Kuri": {
                  "index": 5.1000000000000005,
                  "goal": 1,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 1,
                  "NA": 0,
                  "NN": 0,
                  "POA": 7,
                  "PON": 1,
                  "PNA": 1,
                  "PNN": 1,
                  "blame": 1,
                  "sevenDrawn": 1
                },
                "Pia Kljun": {
                  "index": 5.6,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 3,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 0
                },
                "Lana Švrljuga": {
                  "index": 0.7999999999999999,
                  "goal": 0,
                  "sevenGoal": 1,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 1,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 1,
                  "NN": 0,
                  "POA": 1,
                  "PON": 1,
                  "PNA": 1,
                  "PNN": 0,
                  "blame": 1,
                  "sevenDrawn": 1
                },
                "Teja Jereb": {
                  "index": 20.1,
                  "goal": 4,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 8,
                  "DA": 2,
                  "DN": 0,
                  "NA": 2,
                  "NN": 0,
                  "POA": 9,
                  "PON": 3,
                  "PNA": 5,
                  "PNN": 1,
                  "blame": 3,
                  "sevenDrawn": 3
                },
                "Zoja Jurak": {
                  "index": 3.8000000000000007,
                  "goal": 2,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 1,
                  "DN": 0,
                  "NA": 0,
                  "NN": 2,
                  "POA": 2,
                  "PON": 0,
                  "PNA": 5,
                  "PNN": 2,
                  "blame": 2,
                  "sevenDrawn": 1
                },
                "Brina Mernik": {
                  "index": 4.6,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 0,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 2,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                },
                "Larissa Zukić": {
                  "index": 4.099999999999999,
                  "goal": 3,
                  "sevenGoal": 0,
                  "saves": 1,
                  "miss": 3,
                  "sevenFailed": 0,
                  "assist": 1,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 4,
                  "PON": 1,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 3,
                  "sevenDrawn": 0
                },
                "Tiana Novak": {
                  "index": 0.19999999999999996,
                  "goal": 0,
                  "sevenGoal": 1,
                  "saves": 0,
                  "miss": 0,
                  "sevenFailed": 1,
                  "assist": 0,
                  "DA": 0,
                  "DN": 0,
                  "NA": 0,
                  "NN": 0,
                  "POA": 0,
                  "PON": 0,
                  "PNA": 0,
                  "PNN": 0,
                  "blame": 0,
                  "sevenDrawn": 0
                }
              },
              "notes": [],
              "teamIndex": 78.0,
              "reportedTeamIndex": 78.0
            },
            "old": {
              "rows": [
                {
                  "person": "Zala Petek",
                  "code": "PDG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "9G",
                  "quarters": [
                    1,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "7G",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "KG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTO",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PTG",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9Z",
                  "quarters": [
                    1,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "9O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PDO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PTG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KO",
                  "quarters": [
                    0,
                    1,
                    2,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PDG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PTG",
                  "quarters": [
                    0,
                    1,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PDG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "KG",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "PTG",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KZ",
                  "quarters": [
                    1,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "KO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PTG",
                  "quarters": [
                    2,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tiana Novak",
                  "code": "7O",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Tiana Novak",
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "POA",
                  "quarters": [
                    1,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "POA",
                  "quarters": [
                    3,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lenja Ripnak",
                  "code": "PNN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "POA",
                  "quarters": [
                    1,
                    0,
                    2,
                    4
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNA",
                  "quarters": [
                    2,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    0,
                    3
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "POA",
                  "quarters": [
                    4,
                    0,
                    3,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "POA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "PON",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "POA",
                  "quarters": [
                    2,
                    2,
                    3,
                    2
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PON",
                  "quarters": [
                    0,
                    3,
                    0,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    2,
                    3
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "PNN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "POA",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNA",
                  "quarters": [
                    0,
                    1,
                    1,
                    3
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "PNN",
                  "quarters": [
                    0,
                    2,
                    0,
                    0
                  ]
                },
                {
                  "person": "Brina Mernik",
                  "code": "PNA",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "POA",
                  "quarters": [
                    0,
                    3,
                    1,
                    0
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "PON",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "AG",
                  "quarters": [
                    3,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AO",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "AG",
                  "quarters": [
                    1,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "A7",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "AG",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AZ",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AO",
                  "quarters": [
                    0,
                    0,
                    2,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "AG",
                  "quarters": [
                    0,
                    0,
                    0,
                    4
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "A7",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Larissa Zukić",
                  "code": "AG",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "NA",
                  "quarters": [
                    2,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Ajla Mehulić",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "NN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Lana Švrljuga",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "NA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "NN",
                  "quarters": [
                    0,
                    0,
                    0,
                    2
                  ]
                },
                {
                  "person": "Zala Petek",
                  "code": "DA",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Sarah Pilih Derča",
                  "code": "DN",
                  "quarters": [
                    1,
                    0,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zoja Verbovšek",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "person": "Tinkara Korošec",
                  "code": "DN",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "person": "Zala Kuri",
                  "code": "DN",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Pia Kljun",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "person": "Teja Jereb",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "person": "Zoja Jurak",
                  "code": "DA",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "minutes": {
                "Zala Petek": 25,
                "Sarah Pilih Derča": 30,
                "Lenja Ripnak": 13,
                "Ajla Mehulić": 12,
                "Zoja Verbovšek": 49,
                "Tinkara Korošec": 30,
                "Zala Kuri": 26,
                "Pia Kljun": 32,
                "Lana Švrljuga": 15,
                "Teja Jereb": 40,
                "Zoja Jurak": 23,
                "Brina Mernik": 15,
                "Larissa Zukić": 45,
                "Tiana Novak": 1
              },
              "opponents": [
                {
                  "code": "9Z",
                  "quarters": [
                    0,
                    1,
                    1,
                    0
                  ]
                },
                {
                  "code": "9O",
                  "quarters": [
                    3,
                    4,
                    2,
                    1
                  ]
                },
                {
                  "code": "9G",
                  "quarters": [
                    2,
                    0,
                    1,
                    1
                  ]
                },
                {
                  "code": "6Z",
                  "quarters": [
                    0,
                    0,
                    1,
                    0
                  ]
                },
                {
                  "code": "6G",
                  "quarters": [
                    0,
                    1,
                    1,
                    2
                  ]
                },
                {
                  "code": "7Z",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7O",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "7G",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                },
                {
                  "code": "KZ",
                  "quarters": [
                    0,
                    1,
                    0,
                    0
                  ]
                },
                {
                  "code": "KO",
                  "quarters": [
                    4,
                    0,
                    2,
                    1
                  ]
                },
                {
                  "code": "KG",
                  "quarters": [
                    0,
                    1,
                    4,
                    2
                  ]
                },
                {
                  "code": "PDG",
                  "quarters": [
                    3,
                    1,
                    0,
                    1
                  ]
                },
                {
                  "code": "PTZ",
                  "quarters": [
                    0,
                    0,
                    0,
                    1
                  ]
                }
              ],
              "keepers": [
                {
                  "person": "Nika Kuri",
                  "minutes": 39,
                  "conceded": 11,
                  "shots": 24,
                  "sevenRatio": "0/1",
                  "otherRatio": "11/23"
                },
                {
                  "person": "Zoja Brglez",
                  "minutes": 21,
                  "conceded": 10,
                  "shots": 15,
                  "sevenRatio": "1/1",
                  "otherRatio": "9/14"
                }
              ],
              "file": "Celje mladinke sezona 2026 nov index.xlsx",
              "sheet": "Koper",
              "indices": {
                "Zala Petek": [
                  5.5,
                  3.6,
                  0.0,
                  0.0
                ],
                "Sarah Pilih Derča": [
                  4.3,
                  4.6,
                  0.0,
                  0.0
                ],
                "Lenja Ripnak": [
                  4.4,
                  0.0,
                  0.0,
                  0.0
                ],
                "Zoja Verbovšek": [
                  1.3,
                  3.0,
                  1.7,
                  1.7
                ],
                "Zala Kuri": [
                  3.0,
                  0.0,
                  2.3,
                  0.0
                ],
                "Pia Kljun": [
                  0.0,
                  4.8,
                  1.0,
                  0.0
                ],
                "Lana Švrljuga": [
                  0.0,
                  0.0,
                  0.0,
                  0.6
                ],
                "Teja Jereb": [
                  0.8,
                  3.4,
                  7.0,
                  7.2
                ],
                "Zoja Jurak": [
                  0.0,
                  0.8,
                  1.4,
                  0.7
                ],
                "Brina Mernik": [
                  0.0,
                  0.0,
                  0.0,
                  4.2
                ],
                "Larissa Zukić": [
                  3.4,
                  2.6,
                  -0.2,
                  0.0
                ],
                "Tiana Novak": [
                  0.0,
                  0.0,
                  0.5,
                  0.0
                ],
                "Tinkara Korošec": [
                  0.0,
                  2.9,
                  0.0,
                  1.2
                ],
                "Ajla Mehulić": [
                  0.0,
                  0.0,
                  1.3,
                  0.0
                ]
              },
              "teamIndex": 79.0
            },
            "differences": [],
            "aliases": []
          }
        }
      ],
      "roster": {
        "players": [
          "Ajla Mehulić",
          "Brina Mernik",
          "Lana Švrljuga",
          "Larissa Zukić",
          "Lenja Ripnak",
          "Lina Kolobarič",
          "Pia Kljun",
          "Sarah Pilih Derča",
          "Teja Jereb",
          "Tiana Novak",
          "Tinkara Korošec",
          "Vita Sečki",
          "Zala Kuri",
          "Zala Petek",
          "Zoja Jurak",
          "Zoja Verbovšek"
        ],
        "keepers": [
          "Nika Kuri",
          "Zoja Brglez"
        ]
      }
    }
  }
};
// Excel imports remain aggregate records; no event timestamps are fabricated.
const normMatch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
function importIdentity(g){return `${g.date}|${normMatch(g.opponent)}`}
function validateExcelPackage(pkg){
 if(pkg?.format!=='celje-excel-import'||pkg.version!==2||!pkg.teams)throw new Error('Neveljavna oblika uvoza.');
 const ids=new Set();
 for(const t of ['members','juniors']){
  const d=pkg.teams[t];if(!d||!Array.isArray(d.games)||!Array.isArray(d.roster?.players)||!Array.isArray(d.roster?.keepers))throw new Error('Manjka ekipa ali seznam igralk.');
  for(const g of d.games){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(g.date)||typeof g.opponent!=='string'||!g.opponent.trim()||!Array.isArray(g.events)||g.events.length||!g.imported)throw new Error('Neveljavna tekma.');
   for(const k of ['finalHome','finalAway','firstHalfHome','firstHalfAway'])if(!Number.isInteger(g[k])||g[k]<0)throw new Error('Neveljaven rezultat.');
   const key=t+'|'+importIdentity(g);if(ids.has(key))throw new Error('Podvojena tekma v paketu.');ids.add(key);
   for(const source of ['old','new']){
    const s=g.imported[source];if(!s||!Array.isArray(s.rows)||!s.minutes||!Array.isArray(s.keepers)||!Array.isArray(s.opponents))throw new Error('Manjkajo podatki vira.');
    for(const row of [...s.rows,...s.opponents])if(typeof row.code!=='string'||!Array.isArray(row.quarters)||row.quarters.length!==4||row.quarters.some(n=>!Number.isInteger(n)||n<0))throw new Error('Neveljavna statistika po četrtinah.');
    for(const n of Object.values(s.minutes))if(!Number.isFinite(n)||n<0)throw new Error('Neveljaven igralni čas.');
    if(source==='new'&&(!s.summaries||Object.values(s.summaries).some(s=>!Number.isFinite(s.index))))throw new Error('Neveljaven indeks.');
    if(source==='old'&&(!s.indices||Object.values(s.indices).some(q=>!Array.isArray(q)||q.length!==4||q.some(n=>!Number.isFinite(n)))))throw new Error('Neveljaven stari indeks.');
   }
  }
 }
 return pkg;
}
function mergeExcelData(current,pkg){
 validateExcelPackage(pkg);
 const next=structuredClone(current),result={added:0,skipped:0,collisions:[]};
 for(const t of ['members','juniors']){
  const target=next.teams[t],incoming=pkg.teams[t];
  const keys=new Set(target.games.map(importIdentity));
  const accepted=[];
  for(const g of incoming.games){if(keys.has(importIdentity(g))){result.skipped++;result.collisions.push({team:t,date:g.date,opponent:g.opponent});continue}target.games.push(structuredClone(g));keys.add(importIdentity(g));accepted.push(g);result.added++}
  if(accepted.length){for(const type of ['players','keepers']){const all=new Set([...target.roster.players,...target.roster.keepers]);for(const p of incoming.roster[type])if(!all.has(p)){target.roster[type].push(p);all.add(p)}}}
 }
 return {next,result};
}
function importExcelPackage(pkg){
 try{
  const {next,result}=mergeExcelData(state,pkg);
  if(!result.added){toast(`Ni novih tekem; ${result.skipped} že obstaja.`);return result}
  download(new Blob([JSON.stringify({version:2,format:'celje-full-backup',state},null,2)],{type:'application/json'}),'Celje-pred-uvozom-varnostna-kopija.json');
  const previous=state;state=next;
  try{save()}catch(error){state=previous;throw error}
  setView('matches');toast(`Dodano ${result.added} tekem; preskočeno ${result.skipped}.`);return result;
 }catch(e){console.error(e);toast(e.message||'Uvoz ni uspel.');return null}
}
const originalPlayerStats=playerStats;
function aggregateCounts(rows,person){
 const c={goal:0,sevenGoal:0,saves:0,miss:0,sevenSave:0,sevenMiss:0,assist:0,DA:0,DN:0,NA:0,NN:0,POA:0,PON:0,PNA:0,PNN:0,blame:0};
 for(const r of rows){if(r.person!==person)continue;const n=r.quarters.reduce((a,b)=>a+b,0),code=r.code;
  if(/^(9|6|7|K|PD|PT)[ZOG]$/.test(code)){if(code.endsWith('G'))c[code==='7G'?'sevenGoal':'goal']+=n;else if(code[0]==='7')c[code.endsWith('O')?'sevenSave':'sevenMiss']+=n;else c[code.endsWith('O')?'saves':'miss']+=n}
  else if(['AZ','AO','AG','A7'].includes(code))c.assist+=n;
  else if(code in c)c[code]+=n;
 }
 return c;
}
playerStats=function(person,games=db().games){
 const s=originalPlayerStats(person,games.filter(g=>!g.imported));
 for(const g of games.filter(g=>g.imported)){
  const {old,new:fresh}=g.imported,counts=aggregateCounts(fresh.rows,person);counts.blame=fresh.summaries[person]?.blame||0;
  for(const k in counts)s.count[k]=(s.count[k]||0)+counts[k];
  s.indexNew+=fresh.summaries[person]?.index||0;s.indexOld+=(old.indices[person]||[]).reduce((a,b)=>a+b,0);
  s.minutes+=fresh.minutes[person]||0;
  for(let q=0;q<4;q++)s.qidxOld[q]+=old.indices[person]?.[q]||0;
  if(fresh.summaries[person]||fresh.minutes[person]){s.qidx=[null,null,null,null];s.mins=[null,null,null,null]}
 }
 return s;
};
function sourceStats(person,g,mode){
 if(!g.imported)return originalPlayerStats(person,[g]);
 const d=g.imported[mode==='old'?'old':'new'],count=aggregateCounts(d.rows,person);count.blame=d.summaries?.[person]?.blame||0;return {person,count,minutes:d.minutes[person]||0,index:mode==='old'?(d.indices[person]||[]).reduce((a,b)=>a+b,0):d.summaries[person]?.index||0};
}
const codeLabel=c=>{
 const shots={'9':'9 metrov','6':'6 metrov','7':'7 metrov',K:'Krilo',PD:'Prodor',PT:'Protinapad'};
 if(/^(9|6|7|K|PD|PT)[ZOG]$/.test(c))return `${shots[c.slice(0,-1)]} · ${{Z:'Zgrešeni',O:'Obramba',G:'Gol'}[c.slice(-1)]}`;
 for(const kind of ['assist','foul','error','gain']){const found=TYPES[kind].find(x=>x[0]===c);if(found)return `${{assist:'Asistenca',foul:'Prekršek',error:'Napaka',gain:'Dobljena žoga'}[kind]} · ${found[1]}`}
 return c;
};
function importPanel(){const n=t=>EXCEL_IMPORT.teams[t].games.length;return `<div class="panel" id="excelImportPanel"><div class="panel-head"><h2>Odigrane tekme iz Excelov</h2><span class="tag">${n('members')} članice · ${n('juniors')} mladinke</span></div><p>Tekme iz Excelov sezone 2026 (novi indeks) so vgrajene v aplikacijo in se ob odprtju samodejno naložijo na vsaki napravi. Vsaka tekma je shranjena enkrat; popravljena različica zamenja prejšnjo.</p><div class="toolbar"><a class="btn" href="./excel-import.json" download>Prenesi podatke uvoza</a></div><div class="hint">Excel vsebuje seštevke po četrtinah, brez minut in zaporedja akcij.</div></div>`}
const originalRenderMatches=renderMatches;
renderMatches=function(){originalRenderMatches();$('#view-matches').insertAdjacentHTML('afterbegin',importPanel());
 const imported=db().games.filter(g=>g.imported).length;
 if(imported)$('#excelImportPanel').insertAdjacentHTML('beforeend',`<p class="muted">V izbrani ekipi je ${imported} uvoženih tekem. V števcu akcij so samo vnosi v živo.</p>`);
};
const originalRenderGame=renderGame;
let importedMode='new';
renderGame=function(){const g=game();if(!g?.imported){originalRenderGame();return}renderImportedGame(g)};
function renderImportedGame(g){
 const src=g.imported[importedMode],players=Object.keys(src.minutes),diff=g.imported.differences||[],rows=src.rows;
 const stats=players.map(p=>sourceStats(p,g,importedMode));
 $('#view-game').innerHTML=`<div class="toolbar"><button class="btn small" id="backImported">← Vse tekme</button><span class="tag">${teamLabel()} · Uvoz Excel</span></div><div class="match-banner"><div><p>${esc(g.date)} · polčas ${g.firstHalfHome}:${g.firstHalfAway}</p><h2>${esc(g.home||'Celje')} – ${esc(g.opponent)}</h2></div><div class="scoreline">${g.finalHome}:${g.finalAway}</div></div><div class="panel"><div class="panel-head"><h2>Statistika odigrane tekme</h2><div class="mode-strip"><button data-source="new" class="${importedMode==='new'?'active':''}">Novi vir in indeks</button><button data-source="old" class="${importedMode==='old'?'active':''}">Stari vir in indeks</button></div></div><p class="muted">Vir: ${esc(src.file)} · list ${esc(src.sheet)}. Prikaz ohranja izbrani Excelov vir; novi indeks je prepisan iz tabele igralk, stari izračunan po predlogi 2025. Minute akcij niso znane.</p><div class="tablescroll"><table class="table"><thead><tr><th>Igralka</th><th>Indeks</th><th>Goli iz igre</th><th>Goli 7 m</th><th>Obr.</th><th>Zgreš.</th><th>Obr. 7 m</th><th>Zgreš. 7 m</th><th>Asist.</th><th>Krivda</th><th>Minute</th></tr></thead><tbody>${stats.map(s=>`<tr><td>${esc(s.person)}</td><td>${fmt(s.index)}</td><td>${s.count.goal}</td><td>${s.count.sevenGoal}</td><td>${s.count.saves}</td><td>${s.count.miss}</td><td>${s.count.sevenSave||0}</td><td>${s.count.sevenMiss||0}</td><td>${s.count.assist}</td><td>${s.count.blame||0}</td><td>${fmt(s.minutes)}</td></tr>`).join('')}</tbody></table></div><div class="hint">Vsota indeksov igralk: ${fmt(stats.reduce((n,s)=>n+s.index,0))}.${importedMode==='new'?` Skupna celica v Excelu: ${fmt(src.reportedTeamIndex)}. Vsota igralk in skupna celica se lahko razlikujeta.`:''}</div></div>
 <div class="panel"><div class="panel-head"><h2>Akcije po četrtinah</h2></div>${aggregateTable(rows,true)}</div>
 <div class="panel"><div class="panel-head"><h2>Streli nasprotnic po četrtinah</h2></div>${aggregateTable(src.opponents,false)}</div>
 <div class="panel"><div class="panel-head"><h2>Vratarke</h2></div><div class="tablescroll"><table class="table"><thead><tr><th>Vratarka</th><th>Minute</th><th>Prejeti goli</th><th>Streli v okvir</th><th>Obrambe</th><th>Uspešnost</th></tr></thead><tbody>${src.keepers.map(k=>`<tr><td>${esc(k.person)}</td><td>${fmt(k.minutes)}</td><td>${k.conceded}</td><td>${k.shots}</td><td>${k.shots-k.conceded}</td><td>${k.shots?fmt((k.shots-k.conceded)/k.shots*100):'—'} %</td></tr>`).join('')}</tbody></table></div><p class="muted">Razporeditev strelov med vratarkami po četrtinah ni znana. ${esc(src.notes?.map(n=>n.join(' · ')).join('; ')||'')}</p></div>
 ${g.imported.new.fouls.length?`<div class="panel"><h2>7 m in izključitve v novem viru</h2><div class="tablescroll"><table class="table"><thead><tr><th>Igralka</th><th>Prekršek</th><th>7 m</th><th>2 min</th></tr></thead><tbody>${g.imported.new.fouls.map(f=>`<tr><td>${esc(f.person)}</td><td>${esc(f.code)}</td><td>${f.seven}</td><td>${f.twoMin}</td></tr>`).join('')}</tbody></table></div><p class="muted">Seštevki za celo tekmo; ne prištevajo se ponovno k prekrškom po četrtinah.</p></div>`:''}
 <div class="panel"><div class="panel-head"><h2>Razlike med viroma</h2><span class="tag">${diff.length} vrstic</span></div><p>Vsaka tekma je shranjena enkrat. Podrobna statistika starega in novega vira je ohranjena. Skupni pregled uporablja novi vir za števce in časa ter oba ustrezna indeksa.</p>${diff.length?`<div class="tablescroll"><table class="table"><thead><tr><th>Igralka</th><th>Koda</th><th>Stari 0–15 / 15–30 / 30–45 / 45–60</th><th>Novi 0–15 / 15–30 / 30–45 / 45–60</th></tr></thead><tbody>${diff.map(d=>`<tr><td>${esc(d.person)}</td><td>${esc(d.code)}</td><td>${d.old.join(' / ')}</td><td>${d.new.join(' / ')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Ni razlik v vrsticah po četrtinah.</p>'}<p class="muted">Poenotene različice imen v novih virih: Lana Kolobarič → Lara Kolobarič; Alja/Ajla Mehulič → Ajla Mehulić. Izvirni Exceli ostanejo nespremenjeni.</p></div>
 <div class="panel"><button class="btn danger" id="deleteImported">Odstrani uvoženo tekmo</button></div>`;
 $('#backImported').onclick=()=>setView('matches');$$('[data-source]').forEach(b=>b.onclick=()=>{importedMode=b.dataset.source;renderGame()});
 $('#deleteImported').onclick=()=>{if(confirm('Odstranim to uvoženo tekmo?')){db().games=db().games.filter(x=>x.id!==g.id);save();setView('matches')}};
}
function aggregateTable(rows,includePerson){return `<div class="tablescroll"><table class="table"><thead><tr>${includePerson?'<th>Igralka</th>':''}<th>Akcija</th>${[0,1,2,3].map(q=>`<th>${qName(q)}</th>`).join('')}<th>Skupno</th></tr></thead><tbody>${rows.map(r=>`<tr>${includePerson?`<td>${esc(r.person)}</td>`:''}<td>${esc(codeLabel(r.code))}</td>${r.quarters.map(n=>`<td>${n}</td>`).join('')}<td>${r.quarters.reduce((a,b)=>a+b,0)}</td></tr>`).join('')}</tbody></table></div>`}
const originalOverview=renderOverview;
renderOverview=function(){if(!db().games.some(g=>g.imported)){originalOverview();return}
 const games=db().games,rows=allStats().sort((a,b)=>b.indexNew-a.indexNew),score=games.reduce((a,g)=>{const s=matchScore(g);a[0]+=g.finalHome!==''&&g.finalHome!=null?Number(g.finalHome):s.h;a[1]+=g.finalAway!==''&&g.finalAway!=null?Number(g.finalAway):s.a;return a},[0,0]);
 $('#view-overview').innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()} · vse tekme</p><h1>Skupni pregled</h1><p>Uvožene tekme in zapisniki v živo v enem pregledu. Števci in minute pri uvoženih tekmah uporabljajo novi vir.</p></div></div><div class="cards"><div class="card stat"><div class="label">Tekme</div><strong>${games.length}</strong></div><div class="card stat"><div class="label">Indeks po novem</div><strong>${fmt(teamIndex())}</strong></div><div class="card stat"><div class="label">Goli Celje · nasprotnice</div><strong>${score[0]} : ${score[1]}</strong></div><div class="card stat"><div class="label">Minute igralk</div><strong>${fmt(rows.reduce((n,s)=>n+s.minutes,0))}</strong></div></div><div class="panel"><div class="panel-head"><h2>Učinek po igralkah</h2><div class="mode-strip"><button data-aggregate-index="new" class="active">Novi indeks</button><button data-aggregate-index="old">Stari indeks</button></div></div><div class="tablescroll"><table class="table"><thead><tr><th>Igralka</th><th>Indeks skupaj</th><th>Indeks/tekmo</th><th>Goli iz igre</th><th>Goli 7 m</th><th>Obr.</th><th>Zgreš.</th><th>Obr. 7 m</th><th>Zgreš. 7 m</th><th>Asist.</th><th>Krivda</th><th>Min.</th></tr></thead><tbody>${rows.map(s=>`<tr><td>${esc(s.person)}</td><td class="aggregate-index" data-new="${s.indexNew}" data-old="${s.indexOld}">${fmt(s.indexNew)}</td><td class="aggregate-average" data-new="${s.indexNew/games.length}" data-old="${s.indexOld/games.length}">${fmt(s.indexNew/games.length)}</td><td>${s.count.goal}</td><td>${s.count.sevenGoal}</td><td>${s.count.saves}</td><td>${s.count.miss}</td><td>${s.count.sevenSave||0}</td><td>${s.count.sevenMiss||0}</td><td>${s.count.assist}</td><td>${s.count.blame||0}</td><td>${fmt(s.minutes)}</td></tr>`).join('')}</tbody><tfoot><tr class="total"><td>Skupaj</td><td id="aggregateTotal" data-new="${rows.reduce((n,s)=>n+s.indexNew,0)}" data-old="${rows.reduce((n,s)=>n+s.indexOld,0)}">${fmt(rows.reduce((n,s)=>n+s.indexNew,0))}</td><td></td><td>${rows.reduce((n,s)=>n+s.count.goal,0)}</td><td>${rows.reduce((n,s)=>n+s.count.sevenGoal,0)}</td><td>${rows.reduce((n,s)=>n+s.count.saves,0)}</td><td>${rows.reduce((n,s)=>n+s.count.miss,0)}</td><td>${rows.reduce((n,s)=>n+(s.count.sevenSave||0),0)}</td><td>${rows.reduce((n,s)=>n+(s.count.sevenMiss||0),0)}</td><td>${rows.reduce((n,s)=>n+s.count.assist,0)}</td><td>${rows.reduce((n,s)=>n+(s.count.blame||0),0)}</td><td>${fmt(rows.reduce((n,s)=>n+s.minutes,0))}</td></tr></tfoot></table></div><div class="hint">Novi indeks je vsota vrednosti iz Excelovih tabel igralk. Stari indeks uporablja podrobne podatke starega vira. Preklop indeksa spremeni tudi povprečje in skupni seštevek. Novi indeks in minute po četrtinah niso na voljo za uvožene tekme; njihove celotne vrednosti so ohranjene.</div></div>`;
 $$('[data-aggregate-index]').forEach(b=>b.onclick=()=>{const mode=b.dataset.aggregateIndex;$$('[data-aggregate-index]').forEach(x=>x.classList.toggle('active',x===b));$$('.aggregate-index,.aggregate-average,#aggregateTotal').forEach(c=>c.textContent=fmt(c.dataset[mode]))});
};
const originalExports=renderExports;
renderExports=function(){originalExports();$('#view-exports').insertAdjacentHTML('afterbegin',importPanel());$('#backup').onclick=()=>download(new Blob([JSON.stringify({format:'celje-full-backup',version:2,state},null,2)],{type:'application/json'}),'Celje-obe-ekipi-varnostna-kopija.json');
 $('#view-exports').querySelectorAll('p').forEach(p=>{if(p.textContent.includes('obstoječe podatke izbrane ekipe bo zamenjala'))p.textContent='Prenesi varnostno kopijo obeh ekip. Obnova varnostne kopije zamenja podatke; paket uvoza Excel doda samo manjkajoče tekme.'});
};
const originalRestore=restore;
restore=function(ev){const f=ev.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const o=JSON.parse(reader.result);
 if(o.format==='celje-excel-import'){importExcelPackage(o);return}
 if(o.format==='celje-full-backup'){
  for(const t of ['members','juniors'])if(!Array.isArray(o.state?.teams?.[t]?.games)||!Array.isArray(o.state.teams[t].roster?.players)||!Array.isArray(o.state.teams[t].roster?.keepers))throw new Error('Neveljavna varnostna kopija.');
  if(!confirm('Obnovim varnostno kopijo in zamenjam podatke obeh ekip?'))return;
  const previous=state;state=o.state;ensureTeams();try{save()}catch(e){state=previous;throw e}setView('matches');toast('Obe ekipi obnovljeni.');return
 }
 if(o.team&&o.team!==team)throw new Error('Najprej izberi ekipo, ki ji pripada varnostna kopija.');
 originalRestore(ev);
 }catch(e){toast(e.message||'Datoteka ni veljavna.')}finally{if(ev.target)ev.target.value=''}};reader.readAsText(f)};
function aggregateWorkbook(mode){
 const games=db().games,players=[...db().roster.players,...db().roster.keepers],live=games.filter(g=>!g.imported),sheets=[];
 const summary=[['ŽRK Celje '+teamLabel()+' – '+(mode==='old'?'stari indeks 2025':'novi indeks')],['Pri uvozu se ohrani statistika iz izbranega Excelovega vira; ni minut akcij.'],['Igralka','Indeks','Indeks/tekmo','Goli iz igre','Goli 7 m','Obrambe','Zgrešeni','Obrambe 7 m','Zgrešeni 7 m','Asistence','DA','DN','NA','NN','POA','PON','PNA','PNN','Krivda','Minute']];
 for(const p of players){let s=originalPlayerStats(p,live),index=mode==='old'?s.indexOld:s.indexNew,mins=s.minutes,c={...s.count};for(const g of games.filter(g=>g.imported)){const x=sourceStats(p,g,mode);index+=x.index;mins+=x.minutes;for(const k in x.count)c[k]=(c[k]||0)+x.count[k]}summary.push([p,index,index/Math.max(games.length,1),...['goal','sevenGoal','saves','miss','sevenSave','sevenMiss','assist','DA','DN','NA','NN','POA','PON','PNA','PNN','blame'].map(k=>c[k]||0),mins])}
 summary.push(['Skupaj',summary.slice(3).reduce((n,r)=>n+r[1],0)]);sheets.push({name:'Skupno',rows:summary});
 const meta=[['Ekipa','Datum','Nasprotnik','Celje','Nasprotnik goli','Polčas Celje','Polčas nasprotnik','Vrsta vira']];
 for(const [i,g]of games.entries()){
  meta.push([teamLabel(),g.date,g.opponent,g.finalHome,g.finalAway,g.firstHalfHome,g.firstHalfAway,g.imported?'Excel':'Vnos v živo']);
  let rows=[];
  if(g.imported){const src=g.imported[mode];rows=[[g.date,g.opponent,g.finalHome,g.finalAway],['Vir',src.file,src.sheet],['Akcije po četrtinah; minute in vrstni red niso znani.'],['Igralka','Koda','Akcija','0–15','15–30','30–45','45–60','Skupno'],...src.rows.map(r=>[r.person,r.code,codeLabel(r.code),...r.quarters,r.quarters.reduce((a,b)=>a+b,0)]),[],['Streli nasprotnic'],['Koda','Akcija','0–15','15–30','30–45','45–60','Skupno'],...src.opponents.map(r=>[r.code,codeLabel(r.code),...r.quarters,r.quarters.reduce((a,b)=>a+b,0)]),[],['Minute in indeks – samo celotna tekma'],['Igralka','Minute','Indeks'],...Object.keys(src.minutes).map(p=>[p,src.minutes[p],sourceStats(p,g,mode).index]),[],['Vratarke'],['Vratarka','Minute','Prejeti goli','Streli v okvir','Obrambe'],...src.keepers.map(k=>[k.person,k.minutes,k.conceded,k.shots,k.shots-k.conceded])];
   if(mode==='new')rows.push([],['7 m in 2 min – seštevki brez četrtin'],['Igralka','Koda prekrška','7 m','2 min'],...src.fouls.map(f=>[f.person,f.code,f.seven,f.twoMin]),[],['Podatki tabele novega indeksa'],['Igralka','Indeks','Goli','7M','Obrambe','Zgrešeni','Neuspešni 7M','Asistence','DA','DN','NA','NN','POA','PON','PNA','PNN','Krivda','7M dobljen'],...Object.entries(src.summaries).map(([p,s])=>[p,...Object.values(s)]),['Skupna celica vira',src.reportedTeamIndex],...src.notes);
  }else rows=[[g.date,g.opponent],['Polčas','Minuta/začetek','Konec','Igralka','Vrsta','Tip/koda','Izid','Vratarka','7m','2min'],...g.events.map(e=>[e.half,e.minute??e.start,e.end??'',e.person||'',e.type,e.code||e.shot||'',e.result||'',e.keeper||'',e.seven?'Da':'',e.twoMin?'Da':''])];
  sheets.push({name:`${i+1} ${g.opponent}`.replace(/[\\/?*\[\]:]/g,' ').slice(0,31),rows});
 }
 sheets.push({name:'Tekme',rows:meta});return sheets;
}
const originalNewWorkbook=newWorkbook,originalOldWorkbook=oldWorkbook;
newWorkbook=function(){return db().games.some(g=>g.imported)?aggregateWorkbook('new'):originalNewWorkbook()};
oldWorkbook=function(){return db().games.some(g=>g.imported)?aggregateWorkbook('old'):originalOldWorkbook()};
// Vgrajene tekme iz Excelov: ob vsakem zagonu zamenjajo vse prejšnje uvožene tekme, tako da je vsaka tekma natanko enkrat.
function syncBundledGames(){
 try{validateExcelPackage(EXCEL_IMPORT)}catch(e){console.error(e);return}
 let changed=false;
 for(const t of ['members','juniors']){
  const d=state.teams[t],incoming=EXCEL_IMPORT.teams[t],ids=new Set(incoming.games.map(g=>g.id)),keys=new Set(incoming.games.map(importIdentity));
  const keep=d.games.filter(g=>!(g.imported&&(ids.has(g.id)||keys.has(importIdentity(g))||String(g.id).startsWith('excel-'))));
  const live=new Set(keep.map(importIdentity)),next=[...keep];
  for(const g of incoming.games)if(!live.has(importIdentity(g)))next.push(structuredClone(g));
  if(JSON.stringify(next)!==JSON.stringify(d.games)){d.games=next;changed=true}
  const all=new Set([...d.roster.players,...d.roster.keepers]);
  for(const type of ['players','keepers'])for(const p of incoming.roster[type])if(!all.has(p)){d.roster[type].push(p);all.add(p);changed=true}
 }
 if(changed)save();
}
syncBundledGames();
render();

// Detailed overview for both live records and imported new-source aggregates.
function drawnSevenCount(person,games){
 return games.reduce((total,g)=>total+(g.imported
  ? Number(g.imported.new.summaries[person]?.sevenDrawn||0)
  : g.events.filter(e=>e.person===person&&e.type==='foul'&&e.seven&&['PNA','PNN'].includes(e.code)).length),0);
}
const overviewPlayerStats=playerStats;
function drawnTwoCount(person,games){
 return games.reduce((total,g)=>total+(g.imported
  ? (g.imported.new.fouls||[]).filter(f=>f.person===person&&['PNA','PNN'].includes(f.code)).reduce((n,f)=>n+Number(f.twoMin||0),0)
  : g.events.filter(e=>e.person===person&&e.type==='foul'&&e.twoMin&&['PNA','PNN'].includes(e.code)).length),0);
}
function ownExclusionCount(person,games){
 return games.reduce((total,g)=>{
  if(g.imported)return total+(g.imported.new.fouls||[]).filter(f=>f.person===person&&['POA','PON'].includes(f.code)).reduce((n,f)=>n+Number(f.twoMin||0),0);
  const ex=g.events.filter(e=>e.type==='exclusion'&&e.forTeam==='celje'&&e.forPersonType!=='bench'&&e.person===person);
  return total+ex.length+g.events.filter(e=>e.type==='foul'&&e.person===person&&e.twoMin&&['POA','PON'].includes(e.code)&&!ex.some(x=>x.half===e.half&&Math.abs(x.minute-e.minute)<=1)).length;
 },0);
}
playerStats=function(person,games=db().games){const stats=overviewPlayerStats(person,games);stats.count.sevenDrawn=drawnSevenCount(person,games);stats.count.twoDrawn=drawnTwoCount(person,games);stats.count.twoOwn=ownExclusionCount(person,games);return stats};
function overviewElementRows(){
 const names=[...new Set([...db().roster.players,...db().roster.keepers,...db().games.flatMap(g=>g.imported?[...Object.keys(g.imported.new.summaries),...g.imported.new.rows.map(r=>r.person)]:g.events.filter(e=>e.person&&e.forPersonType!=='bench').map(e=>e.person))])];
 return names.map(person=>{const c=playerStats(person).count;return {person,POA:c.POA||0,PON:c.PON||0,PNA:c.PNA||0,PNN:c.PNN||0,defenseFouls:(c.POA||0)+(c.PON||0),attackFouls:(c.PNA||0)+(c.PNN||0),NA:c.NA||0,NN:c.NN||0,errors:(c.NA||0)+(c.NN||0),DA:c.DA||0,DN:c.DN||0,gains:(c.DA||0)+(c.DN||0),sevenDrawn:c.sevenDrawn||0,twoDrawn:c.twoDrawn||0,twoOwn:c.twoOwn||0}});
}
const overviewColumns=[['POA','Obr. akt.','Prekrški v obrambi – aktivni'],['PON','Obr. neakt.','Prekrški v obrambi – neaktivni'],['PNA','Prid. akt.','Pridobljeni prekrški (prekrški nasprotnic) – aktivni'],['PNN','Prid. neakt.','Pridobljeni prekrški (prekrški nasprotnic) – neaktivni'],['defenseFouls','Obrambni skupaj','Obrambni prekrški skupaj'],['attackFouls','Pridobljeni skupaj','Pridobljeni prekrški (prekrški nasprotnic) skupaj'],['NA','Napake akt.','Aktivne napake'],['NN','Napake neakt.','Neaktivne napake'],['errors','Napake skupaj','Vse napake'],['DA','Dobljene akt.','Aktivno dobljene žoge'],['DN','Dobljene neakt.','Neaktivno dobljene žoge'],['gains','Dobljene skupaj','Vse dobljene žoge'],['sevenDrawn','Dobljeni 7 m','Pridobljene sedemmetrovke'],['twoDrawn','Izborjene 2 min','Izborjene izključitve nasprotnic (brez uteži v indeksu)'],['twoOwn','Izključitve 2 min','Izključitve igralke (s prekrškom ali brez), brez izključitev klopi']];
const overviewRender=renderOverview;
renderOverview=function(){
 overviewRender();const rows=overviewElementRows(),totals=Object.fromEntries(overviewColumns.map(([key])=>[key,rows.reduce((sum,row)=>sum+row[key],0)]));
 $('#view-overview').insertAdjacentHTML('beforeend',`<div class="cards">${[['defenseFouls','Obrambni prekrški skupaj'],['attackFouls','Prekrški nasprotnic (pridobljeni)'],['errors','Napake skupaj'],['gains','Dobljene žoge'],['sevenDrawn','Dobljeni 7 m'],['twoDrawn','Izborjene 2 min']].map(([key,label])=>`<div class="card stat"><div class="label">${label}</div><strong>${totals[key]}</strong><em>${teamLabel().toLowerCase()} · vse prikazane tekme</em></div>`).join('')}</div><div class="panel" id="overviewOtherElements"><div class="panel-head"><h2>Prekrški, napake in dobljene žoge</h2><span class="tag">${db().games.length} tekem</span></div><div class="tablescroll"><table class="table"><thead><tr><th>Igralka / vratarka</th>${overviewColumns.map(([,label,title])=>`<th title="${esc(title)}">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.person)}</td>${overviewColumns.map(([key])=>`<td>${row[key]}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr class="total"><td>Skupaj</td>${overviewColumns.map(([key])=>`<td>${totals[key]}</td>`).join('')}</tr></tfoot></table></div><div class="hint">Prekrški: obramba aktivno/neaktivno (POA/PON) in napad aktivno/neaktivno (PNA/PNN). Napake in dobljene žoge so razčlenjene na aktivne in neaktivne. Dobljeni 7 m se pri zapisih v živo štejejo iz označenih prekrškov v napadu; pri uvoženih tekmah iz vrednosti »7M dobljen« novega Excelovega vira. Asistenca za izsiljen 7 m se ne šteje še enkrat kot dobljeni 7 m. Preklop indeksa spremeni indeks, števci uvoženih tekem pa ostanejo iz novega vira.</div></div>`);
};
function overviewElementsSheet(){return {name:'Prekrški in ostalo',rows:[['Prekrški, napake, dobljene žoge in dobljeni 7 m'],['Uvožene tekme: novi Excelov vir; zapisi v živo: zabeležene akcije.'],['Igralka / vratarka',...overviewColumns.map(([,label,title])=>title)],...overviewElementRows().map(row=>[row.person,...overviewColumns.map(([key])=>row[key])]),['Skupaj',...overviewColumns.map(([key])=>overviewElementRows().reduce((n,row)=>n+row[key],0))]]}}
const overviewNewWorkbook=newWorkbook,overviewOldWorkbook=oldWorkbook;
newWorkbook=function(){return [...overviewNewWorkbook(),overviewElementsSheet()]};
oldWorkbook=function(){return [...overviewOldWorkbook(),overviewElementsSheet()]};
render();
