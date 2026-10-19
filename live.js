// Vnos v živo: celozaslonski vnos akcij z dotiki za telefon in tablico.
// Akcije se zapišejo v g.events v isti obliki kot v klasičnem obrazcu.
const LIVE_PREF='celje-live-view';
const LIVE_KINDS=[['shot','Strel'],['assist','Asistenca'],['foul','Prekršek'],['error','Napaka'],['gain','Dobljena žoga'],['blame','Krivda'],['exclusion','Izključitev'],['time','Igralni čas']];
const LIVE_OPP_KINDS=[['shot','Strel nasprotnic'],['exclusion','Izključitev']];
const LIVE_SHOT=[['9M','9 m'],['6M','6 m'],['7M','7 m'],['wing','Krilo'],['break','Prodor'],['fast','Protinapad']];
const LIVE_RESULT=[['goal','Gol','good'],['save','Obramba','mid'],['miss','Zgrešen','bad']];
const LIVE_FOUL=[['POA','V obrambi','aktiven'],['PON','V obrambi','neaktiven'],['PNA','V napadu','aktiven'],['PNN','V napadu','neaktiven']];
const LIVE_EXCL=[['2','2 minuti'],['4','4 minute'],['red','Rdeči karton']];
const LIVE_MODES=[['full','Napad in obramba'],['attack','Samo napad'],['defense','Samo obramba']];
const LIVE_OPP='__opp';
let liveSel={person:null,kind:null,shot:null,seven:false,two:false},liveOpts=[],liveTimer=null,liveFlashT=null,liveGameId=null;

function livePref(){try{const v=localStorage.getItem(LIVE_PREF);if(v!==null)return v==='1'}catch{}return matchMedia('(pointer:coarse)').matches||innerWidth<1100}
function setLivePref(on){try{localStorage.setItem(LIVE_PREF,on?'1':'0')}catch{}}
function liveClear(){liveSel={person:null,kind:null,shot:null,seven:false,two:false}}
function liveState(g){if(!g.live)g.live={half:'1',secs:{'1':0,'2':0},since:null,keeper:db().roster.keepers[0]||'',court:{}};return g.live}
function liveSec(L){let s=L.secs[L.half]||0;if(L.since)s+=(Date.now()-L.since)/1000;return Math.min(1800,Math.floor(s))}
function livePause(L){L.secs[L.half]=liveSec(L);L.since=null}
function liveHalfMin(sec){return Math.round(sec/30)/2}
function liveNum(x){return String(x).replace('.',',')}
function shortName(n){if(!n)return '—';const i=n.indexOf(' ');return i<0?n:`${n[0]}. ${n.slice(i+1)}`}
function liveLab(list,k){return list.find(x=>x[0]===k)?.[1]||k}
function liveWho(e){return (e.type==='shot'&&e.side==='opponent')||(e.type==='exclusion'&&e.forTeam==='opponent')?'Nasprotnik':shortName(e.person)}
function liveDesc(e){
  if(e.type==='shot')return `${liveLab(LIVE_SHOT,e.shot)} · ${liveLab(LIVE_RESULT,e.result)}${e.side==='opponent'&&e.keeper?` · ${shortName(e.keeper)}`:''}`;
  if(e.type==='time')return `Igralni čas · ${liveLab(LIVE_MODES,e.mode).toLowerCase()}`;
  return displayType(e).replace(/ · (Celje|nasprotnik) · .*$/,'');
}
function liveFlash(msg){const t=$('#lvToast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(liveFlashT);liveFlashT=setTimeout(()=>t.classList.remove('show'),2200)}

function liveAdd(g,e){
  const L=liveState(g),sec=liveSec(L);
  const ev=Object.assign({id:id(),created:new Date().toISOString(),half:L.half,minute:Math.floor(sec/60)},e);
  g.events.push(ev);save();liveClear();renderLive(g);liveFlash(`Shranjeno · ${liveWho(ev)} · ${liveDesc(ev)}`);
}
function liveEnter(g,p,mode){const L=liveState(g);L.court[p]={half:L.half,start:liveHalfMin(liveSec(L)),mode};save();liveClear();renderLive(g);liveFlash(`${shortName(p)} je vstopila`)}
function liveLeave(g,p){
  const L=liveState(g),c=L.court[p],now=liveHalfMin(liveSec(L));
  const end=c.half===L.half?Math.max(now,c.start+.5):30;
  delete L.court[p];
  liveAdd(g,{type:'time',person:p,mode:c.mode,half:c.half,start:c.start,end});
}
function liveSetHalf(g,h){
  const L=liveState(g);if(L.half===h)return;livePause(L);
  // Ob prehodu v 2. polčas se igralni čas igralk na igrišču zaključi pri 30. minuti in nadaljuje od 0.
  if(L.half==='1'&&h==='2')for(const [p,c] of Object.entries(L.court)){if(c.half!=='1')continue;g.events.push({id:id(),type:'time',created:new Date().toISOString(),person:p,mode:c.mode,half:'1',start:c.start,end:30});L.court[p]={half:'2',start:0,mode:c.mode}}
  L.half=h;save();renderLive(g);
}

function liveGroups(g){
  const S=liveSel,L=liveState(g),opp=S.person===LIVE_OPP,P=S.person,mk=(label,sub,cls,run)=>({label,sub,cls,run});
  if(!P||!S.kind)return {title:'Podrobnosti',groups:[]};
  if(S.kind==='shot')return {title:opp?'Strel nasprotnic':'Strel',groups:[
    {title:'Tip strela',cls:'g3',items:LIVE_SHOT.map(([k,l])=>mk(l,'',S.shot===k?'sel':'',()=>{liveSel.shot=k;renderLive(g)}))},
    {title:S.shot?'Izid · dotik shrani':'Izid · najprej tip strela',cls:'g3 big',items:LIVE_RESULT.map(([k,l,t])=>mk(l,opp?`V golu: ${shortName(L.keeper)}`:'',`res-${t}${S.shot?'':' dis'}`,()=>{if(S.shot)liveAdd(g,{type:'shot',side:opp?'opponent':'celje',shot:S.shot,result:k,person:opp?'':P,keeper:opp?L.keeper:''})}))}]};
  if(S.kind==='assist')return {title:'Asistenca',groups:[{title:'Izid akcije · dotik shrani',cls:'g2',items:TYPES.assist.map(([k,l])=>mk(l,'','',()=>liveAdd(g,{type:'assist',person:P,code:k})))}]};
  if(S.kind==='foul')return {title:'Prekršek',groups:[
    {title:'Posledica (neobvezno)',cls:'g2',items:[mk('→ 7 m','vodil v sedemmetrovko',`tog${S.seven?' sel':''}`,()=>{liveSel.seven=!S.seven;renderLive(g)}),mk('+ 2 min','sledila izključitev',`tog${S.two?' sel':''}`,()=>{liveSel.two=!S.two;renderLive(g)})]},
    {title:'Tip prekrška · dotik shrani',cls:'g2',items:LIVE_FOUL.map(([k,l,sub])=>mk(l,sub,'',()=>liveAdd(g,{type:'foul',person:P,code:k,seven:S.seven,twoMin:S.two})))}]};
  if(S.kind==='error')return {title:'Napaka',groups:[{title:'Vrsta · dotik shrani',cls:'g2 big',items:TYPES.error.map(([k,l])=>mk(l,'','',()=>liveAdd(g,{type:'error',person:P,code:k})))}]};
  if(S.kind==='gain')return {title:'Dobljena žoga',groups:[{title:'Vrsta · dotik shrani',cls:'g2 big',items:TYPES.gain.map(([k,l])=>mk(l,'','',()=>liveAdd(g,{type:'gain',person:P,code:k})))}]};
  if(S.kind==='blame')return {title:'Krivda',groups:[{title:'Potrdi · dotik shrani',cls:'g1 big',items:[mk('Krivda za prejeti gol','−0,5 točke pri novem indeksu','res-bad',()=>liveAdd(g,{type:'blame',person:P}))]}]};
  if(S.kind==='exclusion')return {title:opp?'Izključitev nasprotnika':'Izključitev',groups:[{title:'Trajanje · dotik shrani',cls:'g3 big',items:LIVE_EXCL.map(([k,l])=>mk(l,'',k==='red'?'res-bad':'',()=>liveAdd(g,{type:'exclusion',forTeam:opp?'opponent':'celje',forPersonType:opp?'bench':'player',person:opp?'Nasprotna klop / vratarka':P,duration:k})))}]};
  const c=L.court[P];
  if(c)return {title:'Igralni čas',groups:[{title:`Na igrišču od ${c.half}. P ${liveNum(c.start)}' · ${liveLab(LIVE_MODES,c.mode).toLowerCase()}`,cls:'g1 big',items:[mk('Izstop','zapiše čas do trenutne minute','res-bad',()=>liveLeave(g,P))]}]};
  return {title:'Igralni čas',groups:[{title:'Vstop · čas teče do izstopa',cls:'g1',items:LIVE_MODES.map(([k,l])=>mk(l,k==='full'?'polni čas':'šteje polovično',k==='full'?'res-good':'',()=>liveEnter(g,P,k)))}]};
}

const LIVE_ICON={
  back:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  play:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
  pause:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  undo:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>',
  list:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'
};

function renderLive(g){
  liveGameId=g.id;
  const L=liveState(g),S=liveSel,opp=S.person===LIVE_OPP,sec=liveSec(L),score=matchScore(g),goals={};
  for(const e of g.events)if(e.type==='shot'&&e.side==='celje'&&e.result==='goal')goals[e.person]=(goals[e.person]||0)+1;
  const roster=db().roster;
  const tile=n=>{const i=n.indexOf(' ');return `<button class="lv-tile ${S.person===n?'sel':''} ${L.court[n]?'on':''}" data-lv-person="${esc(n)}" aria-label="${esc(n)}${L.court[n]?', na igrišču':''}"><span>${esc(i<0?'':n.slice(0,i))}</span><b>${esc(i<0?n:n.slice(i+1))}</b>${goals[n]?`<i class="lv-badge">${goals[n]} G</i>`:''}</button>`};
  const kinds=(opp?LIVE_OPP_KINDS:LIVE_KINDS).map(([k,l])=>`<button class="lv-act ${!S.person?'off':S.kind===k?'sel':''}" data-lv-kind="${k}" ${S.person?'':'disabled'}>${l}</button>`).join('');
  const {title,groups}=liveGroups(g);liveOpts=[];
  const groupHtml=groups.map(gr=>`<div class="lv-group"><p class="lv-lbl">${esc(gr.title)}</p><div class="lv-${gr.cls}">${gr.items.map(o=>{liveOpts.push(o.run);return `<button class="lv-opt ${o.cls}" data-lv-opt="${liveOpts.length-1}"><b>${esc(o.label)}</b>${o.sub?`<span>${esc(o.sub)}</span>`:''}</button>`}).join('')}</div></div>`).join('');
  const hint=!S.person?'Tapni igralko, nato akcijo in še podrobnost. Akcija se shrani ob zadnjem dotiku, z minuto ure tekme.':!S.kind?(opp?'Izberi strel nasprotnic ali izključitev nasprotnika.':`Izberi akcijo za ${esc(shortName(S.person))}.`):'';
  const selName=opp?'Nasprotnik':shortName(S.person);
  const step=!S.person?1:!S.kind?2:3;
  const log=g.events.slice(-4).reverse().map((e,i)=>`<div class="lv-ev ${i?'more':''} ${e.type==='shot'&&e.result==='goal'?(e.side==='celje'?'good':'bad'):''}"><small>${e.half}. P · ${e.type==='time'?`${liveNum(e.start)}–${liveNum(e.end)}`:e.minute}'</small><b>${esc(liveWho(e))}</b><span>${esc(liveDesc(e))}</span></div>`).join('')||'<div class="lv-ev"><small>Ni še akcij</small><span>Prva akcija se prikaže tukaj.</span></div>';
  const m=Math.floor(sec/60);
  $('#view-game').innerHTML=`<div class="lv step-${step}" id="live">
  <header class="lv-top">
    <div class="lv-id"><button class="lv-ic" data-lv="back" aria-label="Nazaj na seznam tekem">${LIVE_ICON.back}</button><div style="min-width:0"><small>${teamLabel()} · vnos v živo</small><b>Celje – ${esc(g.opponent)}</b></div></div>
    <div class="lv-score" aria-label="Rezultat">${score.h} : ${score.a}</div>
    <div class="lv-clockbar">
      <div class="lv-seg" role="group" aria-label="Polčas"><button class="${L.half==='1'?'on':''}" data-lv="h1">1. P</button><button class="${L.half==='2'?'on':''}" data-lv="h2">2. P</button></div>
      <button class="lv-tb" data-lv="minus" aria-label="Minuta nazaj">−1'</button>
      <div class="lv-clock"><b id="lvClock">${String(m).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}</b><small id="lvQuarter">${qName(quarter(L.half,m))} min</small></div>
      <button class="lv-tb" data-lv="plus" aria-label="Minuta naprej">+1'</button>
      <button class="lv-play ${L.since?'run':''}" data-lv="run" aria-label="${L.since?'Ustavi uro':'Zaženi uro'}">${L.since?LIVE_ICON.pause:LIVE_ICON.play}<span class="lv-txt">${L.since?'Pavza':'Start'}</span></button>
    </div>
  </header>
  <nav class="lv-crumbs" aria-label="Koraki vnosa">
    <button class="${S.person?'done':'cur'}" data-lv="clear">1 · ${esc(S.person?selName:'Igralka')}</button>
    <button class="${S.kind?'done':S.person?'cur':''}" data-lv="unkind">2 · ${esc(S.kind?liveLab(opp?LIVE_OPP_KINDS:LIVE_KINDS,S.kind):'Akcija')}</button>
    <button class="${S.kind?'cur':''}" disabled>3 · Podrobnost</button>
  </nav>
  <div class="lv-body">
    <section class="lv-col lv-c1" aria-label="Igralke">
      <p class="lv-lbl">1 · Igralka <span class="lv-legend"><i></i>na igrišču</span></p>
      <div class="lv-grid">${roster.players.map(tile).join('')}</div>
      <p class="lv-lbl">Vratarke in nasprotnik</p>
      <div class="lv-grid">${roster.keepers.map(tile).join('')}<button class="lv-tile opp ${opp?'sel':''}" data-lv-person="${LIVE_OPP}"><span>Strel ali izključitev</span><b>Nasprotnik</b></button></div>
      ${roster.keepers.length?`<div class="lv-keeper"><p class="lv-lbl">V golu</p><div class="lv-kseg" role="group" aria-label="Vratarka v golu">${roster.keepers.map(k=>`<button class="${L.keeper===k?'on':''}" data-lv-keeper="${esc(k)}">${esc(shortName(k))}</button>`).join('')}</div></div>`:''}
    </section>
    <section class="lv-col lv-c2" aria-label="Akcija">
      <p class="lv-lbl">2 · Akcija${S.person?` · ${esc(selName)}`:''}</p>
      <div class="lv-acts">${kinds}</div>
    </section>
    <section class="lv-col lv-c3" aria-label="Podrobnosti">
      <p class="lv-lbl">3 · ${esc(title)}</p>
      ${S.person?`<div class="lv-selchip"><b>${esc(selName)}</b><button data-lv="clear">Prekliči</button></div>`:''}
      ${hint?`<p class="lv-hint">${hint}</p>`:''}
      ${groupHtml}
    </section>
  </div>
  <footer class="lv-log">
    <div class="lv-loglabel"><p class="lv-lbl">Zadnje</p><small>${g.events.length} akcij</small></div>
    ${log}
    <button class="lv-btn" data-lv="classic" aria-label="Zapisnik in zaključek tekme">${LIVE_ICON.list}<span class="lv-txt">Zapisnik</span></button>
    <button class="lv-btn" data-lv="undo" aria-label="Razveljavi zadnjo akcijo" ${g.events.length?'':'disabled'}>${LIVE_ICON.undo}<span class="lv-txt">Razveljavi</span></button>
  </footer>
  <div class="lv-toast" id="lvToast" role="status"></div>
</div>`;
  $('#live').onclick=ev=>liveClick(g,ev);
  liveStartTimer();
}

function liveClick(g,ev){
  const b=ev.target.closest('button');if(!b||b.disabled)return;const L=liveState(g),d=b.dataset;
  if(d.lvPerson!==undefined){const p=d.lvPerson;const same=liveSel.person===p;liveClear();if(!same)liveSel.person=p;renderLive(g);return}
  if(d.lvKind){if(liveSel.person){liveSel.kind=d.lvKind;liveSel.shot=null;liveSel.seven=false;liveSel.two=false;renderLive(g)}return}
  if(d.lvOpt!==undefined){liveOpts[Number(d.lvOpt)]?.();return}
  if(d.lvKeeper){L.keeper=d.lvKeeper;save();renderLive(g);return}
  switch(d.lv){
    case 'back':livePause(L);save();liveClear();gameId=null;view='matches';render();break;
    case 'classic':setLivePref(false);liveClear();renderGame();break;
    case 'h1':liveSetHalf(g,'1');break;
    case 'h2':liveSetHalf(g,'2');break;
    case 'minus':case 'plus':{const s=liveSec(L)+(d.lv==='plus'?60:-60);L.secs[L.half]=Math.max(0,Math.min(1800,s));if(L.since)L.since=Date.now();save();renderLive(g);break}
    case 'run':if(L.since)livePause(L);else if(liveSec(L)<1800)L.since=Date.now();save();renderLive(g);break;
    case 'clear':liveClear();renderLive(g);break;
    case 'unkind':if(liveSel.person){liveSel.kind=null;liveSel.shot=null;liveSel.seven=false;liveSel.two=false;renderLive(g)}break;
    case 'undo':if(g.events.length){g.events.pop();save();renderLive(g);liveFlash('Zadnja akcija razveljavljena.')}break;
  }
}

function liveStartTimer(){
  if(liveTimer)return;
  liveTimer=setInterval(()=>{
    const clock=$('#lvClock'),g=gameId===liveGameId?game():null;
    if(!clock||!g?.live){clearInterval(liveTimer);liveTimer=null;return}
    const L=g.live,sec=liveSec(L),m=Math.floor(sec/60);
    clock.textContent=`${String(m).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    $('#lvQuarter').textContent=`${qName(quarter(L.half,m))} min`;
    if(L.since&&sec>=1800){livePause(L);save();renderLive(g);liveFlash(`Konec ${L.half}. polčasa.`)}
  },1000);
}

const classicRenderGame=renderGame;
renderGame=function(){
  const g=game();
  if(g&&!g.imported&&!g.complete&&livePref()){if(liveGameId!==g.id)liveClear();renderLive(g);return}
  classicRenderGame();
  if(g&&!g.imported&&!g.complete){$('#backGames')?.insertAdjacentHTML('afterend','<button class="btn small lime" id="openLive">Vnos v živo</button>');$('#openLive').onclick=()=>{setLivePref(true);renderGame()}}
};
render();
