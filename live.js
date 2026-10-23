// Vnos v živo: celozaslonski vnos akcij z dotiki za telefon in tablico.
// Akcije se zapišejo v g.events v isti obliki kot v klasičnem obrazcu.
const LIVE_PREF='celje-live-view';
const LIVE_KINDS=[['shot','Strel'],['assist','Asistenca'],['foul','Prekršek'],['error','Napaka'],['gain','Dobljena žoga'],['blame','Krivda'],['two','2 min'],['exclusion','Izključitev'],['time','Igralni čas']];
const LIVE_OPP_KINDS=[['shot','Strel nasprotnic'],['exclusion','Izključitev']];
const LIVE_SHOT=[['9M','9 m'],['6M','6 m'],['7M','7 m'],['wing','Krilo'],['break','Prodor'],['fast','Protinapad']];
const LIVE_RESULT=[['goal','Gol','good'],['save','Obramba','mid'],['miss','Zgrešen','bad']];
const LIVE_FOUL=[['POA','Naš v obrambi','aktiven'],['PON','Naš v obrambi','neaktiven'],['PNA','Pridobljen','prekršek nasprotnice · aktiven'],['PNN','Pridobljen','prekršek nasprotnice · neaktiven']];
const LIVE_OWN_FOUL=['POA','PON'];
const LIVE_EXCL=[['2','2 minuti'],['4','4 minute'],['red','Rdeči karton']];
const LIVE_MODES=[['full','Napad in obramba'],['attack','Samo napad'],['defense','Samo obramba']];
const LIVE_OPP='__opp',LIVE_BENCH='__bench';
// Vratarka ima dodatno akcijo za strele nasprotnic nanjo (prejet gol / obramba); »Strel« je njen lasten strel.
function liveKindsFor(p){
  if(p===LIVE_OPP)return LIVE_OPP_KINDS;
  if(p===LIVE_BENCH)return [['benchex','2 min klop']];
  if(db().roster.keepers.includes(p))return [['against','Strel nasprotnic'],['shot','Strel (svoj)'],...LIVE_KINDS.filter(k=>k[0]!=='shot')];
  return LIVE_KINDS;
}
let liveSel={person:null,kind:null,shot:null,seven:false,two:false},liveOpts=[],liveTimer=null,liveFlashT=null,liveGameId=null;
let liveSub={out:null,ret:null,pick:[]},liveExpired=new Set(),liveBlameAsk=null;
const LIVE_COURT_MAX=7;

// Enkratna dopolnitev seznama mladink (obstoječi podatki v brskalniku ne vzamejo novih SEEDS).
(function(){const r=state.teams?.juniors?.roster;if(!r)return;state.migrations=state.migrations||{};if(state.migrations.juniorsNovakKavalar)return;for(const n of ['Tiana Novak','Tia Kavalar'])if(!r.players.includes(n))r.players.push(n);state.migrations.juniorsNovakKavalar=true;save()})();

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
function liveWho(e){return (e.type==='shot'&&e.side==='opponent')||(e.type==='exclusion'&&e.forTeam==='opponent')?'Nasprotnik':e.type==='exclusion'&&e.forPersonType==='bench'?'Klop':shortName(e.person)}
function liveDesc(e){
  if(e.type==='shot')return `${liveLab(LIVE_SHOT,e.shot)} · ${liveLab(LIVE_RESULT,e.result)}${e.side==='opponent'&&e.keeper?` · ${shortName(e.keeper)}`:''}`;
  if(e.type==='time')return `Igralni čas · ${liveLab(LIVE_MODES,e.mode).toLowerCase()}`;
  if(e.type==='exclusion'&&e.forTeam==='celje'&&e.forPersonType==='bench')return `Izključitev klopi · 2 min${e.servedBy?` · ven ${shortName(e.servedBy)}`:''}`;
  return displayType(e).replace(/ · (Celje|nasprotnik) · .*$/,'');
}
function liveFlash(msg){const t=$('#lvToast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(liveFlashT);liveFlashT=setTimeout(()=>t.classList.remove('show'),2200)}

function liveAdd(g,e){
  const L=liveState(g),sec=liveSec(L);
  const ev=Object.assign({id:id(),created:new Date().toISOString(),half:L.half,minute:Math.floor(sec/60)},e);
  const prev=g.events[g.events.length-1];
  g.events.push(ev);
  liveBlameAsk=ev.type==='shot'&&ev.side==='opponent'&&ev.result==='goal'&&!(prev?.type==='blame'&&prev.half===ev.half&&prev.minute>=ev.minute-1)?{half:ev.half,minute:ev.minute}:null;
  save();liveClear();renderLive(g);liveFlash(`Shranjeno · ${liveWho(ev)} · ${liveDesc(ev)}`);
}
// Prekršek: naš (v obrambi) z 2 min pošlje igralko na klop; pridobljen z 2 min zapiše izključitev nasprotnice.
function liveFoul(g,P,k,seven,two){
  const own=LIVE_OWN_FOUL.includes(k),ev=livePush(g,{type:'foul',person:P,code:k,seven,twoMin:two});
  if(two){if(own)liveExclude(g,P,'2');else livePush(g,{type:'exclusion',forTeam:'opponent',forPersonType:'bench',person:'Nasprotna klop / vratarka',duration:'2'})}
  liveBlameAsk=null;save();liveClear();renderLive(g);
  liveFlash(`Shranjeno · ${liveWho(ev)} · ${liveDesc(ev)}${two?(own?' · 2 min, gre na klop':' · izključitev nasprotnice'):''}`);
}
function livePush(g,e){const L=liveState(g);const ev=Object.assign({id:id(),created:new Date().toISOString(),half:L.half,minute:Math.floor(liveSec(L)/60)},e);g.events.push(ev);return ev}
function liveOpenCourt(g,p,mode='full'){const L=liveState(g);L.court[p]={half:L.half,start:liveHalfMin(liveSec(L)),mode}}
function liveCloseCourt(g,p){
  const L=liveState(g),c=L.court[p];if(!c)return null;delete L.court[p];
  const end=c.half===L.half?Math.min(30,Math.max(liveHalfMin(liveSec(L)),c.start+.5)):30;
  return end>c.start?livePush(g,{type:'time',person:p,mode:c.mode,half:c.half,start:c.start,end}):null;
}
function liveEnter(g,p,mode){liveOpenCourt(g,p,mode);save();liveClear();renderLive(g);liveFlash(`${shortName(p)} je vstopila`)}
function liveLeave(g,p){liveCloseCourt(g,p);save();liveClear();renderLive(g);liveFlash(`${shortName(p)} je izstopila`)}

// Izključitve: ura teče po času tekme (absolutne sekunde čez oba polčasa), več hkrati.
function liveAbs(L){return (L.half==='2'?1800:0)+liveSec(L)}
function liveExcl(L){if(!L.excl)L.excl=[];return L.excl}
function liveLeft(L,x){return x.dur-(liveAbs(L)-x.start)}
function liveMMSS(s){s=Math.max(0,Math.ceil(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function liveExclude(g,p,code){
  const L=liveState(g);liveCloseCourt(g,p);
  const ev=livePush(g,{type:'exclusion',forTeam:'celje',forPersonType:'player',person:p,duration:code});
  liveExcl(L).push({id:id(),ev:ev.id,person:p,start:liveAbs(L),dur:code==='4'?240:120,returnable:code!=='red',code});
  return ev;
}
// Izključitev klopi: zapiše se klopi; izbrana igralka gre 2 min z igrišča, izključitev se ji ne pripiše.
function liveBenchExclude(g,p){
  const L=liveState(g);if(p)liveCloseCourt(g,p);
  const ev=livePush(g,{type:'exclusion',forTeam:'celje',forPersonType:'bench',person:'Klop',duration:'2',...(p?{servedBy:p}:{})});
  if(p)liveExcl(L).push({id:id(),ev:ev.id,person:p,start:liveAbs(L),dur:120,returnable:true,code:'2',bench:true});
  liveBlameAsk=null;save();liveClear();renderLive(g);liveFlash(`Shranjeno · izključitev klopi${p?` · ${shortName(p)} gre 2 min ven`:''}`);
}
function liveNeedsLineup(g,L){return !L.lineupDone&&!g.events.length&&!Object.keys(L.court).length}
function liveSetHalf(g,h){
  const L=liveState(g);if(L.half===h)return;livePause(L);
  // Ob prehodu v 2. polčas se igralni čas igralk na igrišču zaključi pri 30. minuti in nadaljuje od 0.
  if(L.half==='1'&&h==='2')for(const [p,c] of Object.entries(L.court)){if(c.half!=='1')continue;g.events.push({id:id(),type:'time',created:new Date().toISOString(),person:p,mode:c.mode,half:'1',start:c.start,end:30});L.court[p]={half:'2',start:0,mode:c.mode}}
  L.half=h;save();renderLive(g);
}

function liveGroups(g){
  const S=liveSel,L=liveState(g),opp=S.person===LIVE_OPP,P=S.person,mk=(label,sub,cls,run)=>({label,sub,cls,run});
  if(!P||!S.kind)return {title:'Podrobnosti',groups:[]};
  if(S.kind==='against')return {title:`Strel nasprotnic · v golu ${shortName(P)}`,groups:[
    {title:'Tip strela',cls:'g3',items:LIVE_SHOT.map(([k,l])=>mk(l,'',S.shot===k?'sel':'',()=>{liveSel.shot=k;renderLive(g)}))},
    {title:S.shot?'Izid · dotik shrani':'Izid · najprej tip strela',cls:'g3 big',items:[['goal','Prejet gol','bad'],['save','Obramba','good'],['miss','Zgrešen','mid']].map(([k,l,t])=>mk(l,'',`res-${t}${S.shot?'':' dis'}`,()=>{if(!S.shot)return;L.keeper=P;liveAdd(g,{type:'shot',side:'opponent',shot:S.shot,result:k,person:'',keeper:P})}))}]};
  if(S.kind==='shot')return {title:opp?'Strel nasprotnic':'Strel',groups:[
    {title:'Tip strela',cls:'g3',items:LIVE_SHOT.map(([k,l])=>mk(l,'',S.shot===k?'sel':'',()=>{liveSel.shot=k;renderLive(g)}))},
    {title:S.shot?'Izid · dotik shrani':'Izid · najprej tip strela',cls:'g3 big',items:LIVE_RESULT.map(([k,l,t])=>mk(l,opp?`V golu: ${shortName(L.keeper)}`:'',`res-${t}${S.shot?'':' dis'}`,()=>{if(S.shot)liveAdd(g,{type:'shot',side:opp?'opponent':'celje',shot:S.shot,result:k,person:opp?'':P,keeper:opp?L.keeper:''})}))}]};
  if(S.kind==='assist')return {title:'Asistenca',groups:[{title:'Izid akcije · dotik shrani',cls:'g2',items:TYPES.assist.map(([k,l])=>mk(l,'','',()=>liveAdd(g,{type:'assist',person:P,code:k})))}]};
  if(S.kind==='foul')return {title:'Prekršek',groups:[
    {title:'Posledica (neobvezno)',cls:'g2',items:[mk('→ 7 m','vodil v sedemmetrovko',`tog${S.seven?' sel':''}`,()=>{liveSel.seven=!S.seven;renderLive(g)}),mk('+ 2 min','izključitev (naša igralka gre na klop)',`tog${S.two?' sel':''}`,()=>{liveSel.two=!S.two;renderLive(g)})]},
    {title:'Naš prekršek (v obrambi) · dotik shrani',cls:'g2',items:LIVE_FOUL.filter(f=>LIVE_OWN_FOUL.includes(f[0])).map(([k,l,sub])=>mk(l,sub,'',()=>liveFoul(g,P,k,S.seven,S.two)))},
    {title:'Prekršek nasprotnice (pridobljen) · dotik shrani',cls:'g2',items:LIVE_FOUL.filter(f=>!LIVE_OWN_FOUL.includes(f[0])).map(([k,l,sub])=>mk(l,sub,'',()=>liveFoul(g,P,k,S.seven,S.two)))}]};
  if(S.kind==='error')return {title:'Napaka',groups:[{title:'Vrsta · dotik shrani',cls:'g2 big',items:TYPES.error.map(([k,l])=>mk(l,'','',()=>liveAdd(g,{type:'error',person:P,code:k})))}]};
  if(S.kind==='gain')return {title:'Dobljena žoga',groups:[{title:'Vrsta · dotik shrani',cls:'g2 big',items:TYPES.gain.map(([k,l])=>mk(l,'','',()=>liveAdd(g,{type:'gain',person:P,code:k})))}]};
  if(S.kind==='blame')return {title:'Krivda',groups:[{title:'Potrdi · dotik shrani',cls:'g1 big',items:[mk('Krivda za prejeti gol','−0,5 točke pri novem indeksu','res-bad',()=>liveAdd(g,{type:'blame',person:P}))]}]};
  if(S.kind==='benchex'){const court=Object.keys(L.court);return {title:'Izključitev klopi · 2 min',groups:[{title:court.length?'Kdo gre 2 min z igrišča · dotik shrani (izključitev se ji ne pripiše)':'Nihče ni označen na igrišču · dotik shrani',cls:'g2',items:[...court.map(n=>mk(shortName(n),'gre ven za 2 min','',()=>liveBenchExclude(g,n))),mk('Brez menjave','ne vodim igralnega časa','',()=>liveBenchExclude(g,null))]}]}}
  if(S.kind==='exclusion')return {title:opp?'Izključitev nasprotnika':'Izključitev',groups:[{title:opp?'Trajanje · dotik shrani':'Samo izključitev, brez prekrška (npr. jezikanje, nešportno) · dotik shrani',cls:'g3 big',items:LIVE_EXCL.map(([k,l])=>mk(l,'',k==='red'?'res-bad':'',()=>{if(opp){liveAdd(g,{type:'exclusion',forTeam:'opponent',forPersonType:'bench',person:'Nasprotna klop / vratarka',duration:k});return}const ev=liveExclude(g,P,k);save();liveClear();renderLive(g);liveFlash(`Shranjeno · ${liveWho(ev)} · ${liveDesc(ev)} · gre na klop`)}))}]};
  const c=L.court[P];
  if(c)return {title:'Igralni čas',groups:[{title:`Na igrišču od ${c.half}. P ${liveNum(c.start)}' · ${liveLab(LIVE_MODES,c.mode).toLowerCase()}`,cls:'g1 big',items:[mk('Izstop','zapiše čas do trenutne minute','res-bad',()=>liveLeave(g,P))]}]};
  return {title:'Igralni čas',groups:[{title:'Vstop · čas teče do izstopa',cls:'g1',items:LIVE_MODES.map(([k,l])=>mk(l,k==='full'?'polni čas':'šteje polovično',k==='full'?'res-good':'',()=>liveEnter(g,P,k)))}]};
}

const LIVE_ICON={
  back:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  play:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
  pause:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  undo:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>',
  swap:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/></svg>',
  grid:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
  calc:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  list:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>'
};

function renderLive(g){
  liveGameId=g.id;
  const L=liveState(g),S=liveSel,opp=S.person===LIVE_OPP,sec=liveSec(L),score=matchScore(g),goals={};
  for(const e of g.events)if(e.type==='shot'&&e.side==='celje'&&e.result==='goal')goals[e.person]=(goals[e.person]||0)+1;
  const roster=db().roster;
  const exOf=n=>liveExcl(L).find(x=>x.person===n);
  const tile=n=>{const i=n.indexOf(' '),x=exOf(n);return `<button class="lv-tile ${S.person===n?'sel':''} ${L.court[n]?'on':''} ${x?'ex':''}" data-lv-person="${esc(n)}" aria-label="${esc(n)}${L.court[n]?', na igrišču':''}${x?', izključena':''}"><span>${esc(i<0?'':n.slice(0,i))}</span><b>${esc(i<0?n:n.slice(i+1))}</b>${x?`<i class="lv-exb" data-excl-left="${x.id}">${liveLeft(L,x)>0?liveMMSS(liveLeft(L,x)):'vrnitev'}</i>`:''}${goals[n]?`<i class="lv-badge">${goals[n]} G</i>`:''}</button>`};
  const kinds=liveKindsFor(S.person).map(([k,l])=>`<button class="lv-act ${!S.person?'off':S.kind===k?'sel':''}" data-lv-kind="${k}" ${S.person?'':'disabled'}>${l}</button>`).join('');
  const {title,groups}=liveGroups(g);liveOpts=[];
  const groupHtml=groups.map(gr=>`<div class="lv-group"><p class="lv-lbl">${esc(gr.title)}</p><div class="lv-${gr.cls}">${gr.items.map(o=>{liveOpts.push(o.run);return `<button class="lv-opt ${o.cls}" data-lv-opt="${liveOpts.length-1}"><b>${esc(o.label)}</b>${o.sub?`<span>${esc(o.sub)}</span>`:''}</button>`}).join('')}</div></div>`).join('');
  const hint=!S.person?'Tapni igralko, nato akcijo in še podrobnost. Akcija se shrani ob zadnjem dotiku, z minuto ure tekme.':!S.kind?(opp?'Izberi strel nasprotnic ali izključitev nasprotnika.':`Izberi akcijo za ${esc(shortName(S.person))}.`):'';
  const selName=opp?'Nasprotnik':S.person===LIVE_BENCH?'Klop':shortName(S.person);
  const step=!S.person?1:!S.kind?2:3;
  const lineup=liveNeedsLineup(g,L),scr=lineup?'lineup':L.screen==='subs'?'subs':'entry';
  const ex=liveExcl(L),exDone=ex.some(x=>liveLeft(L,x)<=0);
  const log=g.events.slice(-4).reverse().map((e,i)=>`<div class="lv-ev ${i?'more':''} ${e.type==='shot'&&e.result==='goal'?(e.side==='celje'?'good':'bad'):''}"><small>${e.half}. P · ${e.type==='time'?`${liveNum(e.start)}–${liveNum(e.end)}`:e.minute}'</small><b>${esc(liveWho(e))}</b><span>${esc(liveDesc(e))}</span></div>`).join('')||'<div class="lv-ev"><small>Ni še akcij</small><span>Prva akcija se prikaže tukaj.</span></div>';
  const m=Math.floor(sec/60);
  $('#view-game').innerHTML=`<div class="lv step-${step} scr-${scr}" id="live">
  <header class="lv-top">
    <div class="lv-id"><button class="lv-ic" data-lv="back" aria-label="Nazaj na seznam tekem">${LIVE_ICON.back}</button><div style="min-width:0"><small>${teamLabel()} · vnos v živo</small><b>${esc(g.home||'Celje')} – ${esc(g.opponent)}</b></div></div>
    <div class="lv-score" aria-label="Rezultat">${score.h} : ${score.a}</div>
    <div class="lv-clockbar">
      <div class="lv-seg" role="group" aria-label="Polčas"><button class="${L.half==='1'?'on':''}" data-lv="h1">1. P</button><button class="${L.half==='2'?'on':''}" data-lv="h2">2. P</button></div>
      <button class="lv-tb" data-lv="minus" aria-label="Minuta nazaj">−1'</button>
      <div class="lv-clock"><b id="lvClock">${String(m).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}</b><small id="lvQuarter">${qName(quarter(L.half,m))} min</small></div>
      <button class="lv-tb" data-lv="plus" aria-label="Minuta naprej">+1'</button>
      <button class="lv-play ${L.since?'run':''}" data-lv="run" aria-label="${L.since?'Ustavi uro':'Zaženi uro'}">${L.since?LIVE_ICON.pause:LIVE_ICON.play}<span class="lv-txt">${L.since?'Pavza':'Start'}</span></button>
    </div>
  </header>
  ${liveBlameAsk?liveBlameHtml(L):''}
  <nav class="lv-crumbs" aria-label="Koraki vnosa">
    <button class="${S.person?'done':'cur'}" data-lv="clear">1 · ${esc(S.person?selName:'Igralka')}</button>
    <button class="${S.kind?'done':S.person?'cur':''}" data-lv="unkind">2 · ${esc(S.kind?liveLab(liveKindsFor(S.person),S.kind):'Akcija')}</button>
    <button class="${S.kind?'cur':''}" disabled>3 · Podrobnost</button>
  </nav>
  ${scr!=='entry'?liveSubsHtml(g,L,scr==='lineup'):`<div class="lv-body">
    <section class="lv-col lv-c1" aria-label="Igralke">
      <p class="lv-lbl">1 · Igralka <span class="lv-legend"><i></i>na igrišču</span></p>
      <div class="lv-grid">${roster.players.map(tile).join('')}</div>
      <p class="lv-lbl">Vratarke in nasprotnik</p>
      <div class="lv-grid">${roster.keepers.map(tile).join('')}<button class="lv-tile opp ${opp?'sel':''}" data-lv-person="${LIVE_OPP}"><span>Strel ali izključitev</span><b>Nasprotnik</b></button><button class="lv-tile opp ${S.person===LIVE_BENCH?'sel':''}" data-lv-person="${LIVE_BENCH}"><span>Izključitev 2 min</span><b>Klop</b></button></div>
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
  </div>`}
  <footer class="lv-log">
    <div class="lv-loglabel"><p class="lv-lbl">Zadnje</p><small>${g.events.length} akcij</small></div>
    ${log}
    <button class="lv-btn ${scr==='subs'?'on':''} ${exDone?'alert':''}" data-lv="${scr==='subs'?'entry':'subs'}" aria-label="${scr==='subs'?'Nazaj na akcije':'Menjave in izključitve'}">${scr==='subs'?LIVE_ICON.grid:LIVE_ICON.swap}<span class="lv-txt">${scr==='subs'?'Akcije':'Menjave'}</span>${ex.length?`<i class="lv-cnt">${ex.length}</i>`:''}</button>
    <button class="lv-btn lv-wide" data-lv="recalc" aria-label="Preračunaj tekmo">${LIVE_ICON.calc}<span class="lv-txt">Preračunaj</span></button>
    <button class="lv-btn" data-lv="classic" aria-label="Zapisnik in zaključek tekme">${LIVE_ICON.list}<span class="lv-txt">Zapisnik</span></button>
    <button class="lv-btn" data-lv="undo" aria-label="Razveljavi zadnjo akcijo" ${g.events.length?'':'disabled'}>${LIVE_ICON.undo}<span class="lv-txt">Razveljavi</span></button>
  </footer>
  <div class="lv-toast" id="lvToast" role="status"></div>
</div>`;
  $('#live').onclick=ev=>liveClick(g,ev);
  liveStartTimer();
}

function liveBlameHtml(L){
  const keepers=new Set(db().roster.keepers);let names=Object.keys(L.court).filter(p=>!keepers.has(p));
  if(!names.length)names=db().roster.players;
  return `<div class="lv-blame" role="group" aria-label="Krivda za prejeti gol"><b>Prejet gol (${liveBlameAsk.half}. P ${liveBlameAsk.minute}') – krivda naše igralke?</b><div class="lv-blamebtns">${names.map(p=>`<button class="lv-chip" data-blame="${esc(p)}">${esc(shortName(p))}</button>`).join('')}<button class="lv-chip" data-lv="blameNone">Brez krivde</button></div></div>`;
}

// Preračun tekme iz zapisanih akcij: zaključi odprte vnose igralnega časa, odpravi prekrivanja,
// odšteje čas izključitev in preveri seštevek (vratarke = odigrani čas, igralke = 6 × čas − izključitve).
function liveRecalc(g){
  const L=liveState(g),keepers=new Set(db().roster.keepers),sec=liveSec(L);
  const ended=g.complete||(L.half==='2'&&sec>=1800),fix={closed:0,merged:0,excl:0};
  for(const [p,c] of Object.entries(L.court)){
    if(c.half==='1'&&L.half==='2'){livePush(g,{type:'time',person:p,mode:c.mode,half:'1',start:c.start,end:30});L.court[p]={half:'2',start:0,mode:c.mode};fix.closed++}
    if(ended){liveCloseCourt(g,p);fix.closed++}
  }
  const keyOf=(p,h)=>`${p}\u0001${h}`,spans=new Map(),exclEv=g.events.filter(e=>e.type==='exclusion'&&e.forTeam==='celje'&&e.forPersonType!=='bench'),
    // Starejši vnosi: naš prekršek z 2 min brez zapisa izključitve šteje kot izključitev.
    exclusions=exclEv.concat(g.events.filter(e=>e.type==='foul'&&e.twoMin&&LIVE_OWN_FOUL.includes(e.code)&&!exclEv.some(x=>x.person===e.person&&x.half===e.half&&Math.abs(x.minute-e.minute)<=1)).map(e=>({...e,duration:'2'}))),
    benchEx=g.events.filter(e=>e.type==='exclusion'&&e.forTeam==='celje'&&e.forPersonType==='bench');
  for(const e of g.events){if(e.type!=='time')continue;const s=Math.max(0,Number(e.start)),t=Math.min(30,Number(e.end));if(!(t>s))continue;const k=keyOf(e.person,e.half);(spans.get(k)||spans.set(k,[]).get(k)).push({s,t,mode:e.mode||'full'})}
  const rebuilt=[];
  for(const [k,list] of spans){
    const [person,half]=k.split('\u0001');list.sort((a,b)=>a.s-b.s);
    let merged=[];for(const x of list){const last=merged[merged.length-1];if(last&&x.s<=last.t){if(x.s<last.t)fix.merged++;last.t=Math.max(last.t,x.t)}else merged.push({...x})}
    for(const ex of exclusions.concat(benchEx.filter(e=>e.servedBy).map(e=>({...e,person:e.servedBy}))).filter(e=>e.person===person)){
      const from=(ex.half==='2'?30:0)+Number(ex.minute),to=from+(ex.duration==='4'?4:2),off=half==='2'?30:0;
      const a=from-off,b=to-off;if(b<=0||a>=30)continue;
      const next=[];for(const x of merged){if(b<=x.s||a>=x.t){next.push(x);continue}fix.excl++;if(a>x.s)next.push({...x,t:a});if(b<x.t)next.push({...x,s:b})}merged=next;
    }
    for(const x of merged)if(x.t>x.s)rebuilt.push({id:id(),type:'time',created:new Date().toISOString(),person,mode:x.mode,half,start:x.s,end:x.t});
  }
  const at=e=>(e.half==='2'?30:0)+(e.type==='time'?Number(e.end):Number(e.minute)||0);
  g.events=g.events.filter(e=>e.type!=='time').concat(rebuilt).map((e,i)=>[e,i]).sort((a,b)=>at(a[0])-at(b[0])||a[1]-b[1]).map(x=>x[0]);
  const played=ended?60:Math.min(30,(L.secs['1']||0)/60)+(L.half==='2'?Math.min(30,sec/60):0);
  const mins={};for(const e of rebuilt)mins[e.person]=(mins[e.person]||0)+(e.end-e.start);
  for(const p of Object.keys(L.court)){const c=L.court[p];mins[p]=(mins[p]||0)+Math.max(0,(c.half===L.half?sec/60:30)-c.start)}
  const exclMin=exclusions.concat(benchEx).reduce((n,e)=>n+(e.duration==='4'?4:2),0);
  const sum=f=>Object.entries(mins).filter(([p])=>f(p)).reduce((n,[,m])=>n+m,0);
  const goalsAgainst=g.events.filter(e=>e.type==='shot'&&e.side==='opponent'&&e.result==='goal').length,blames=g.events.filter(e=>e.type==='blame').length;
  save();
  return {fix,played,ended,keeper:sum(p=>keepers.has(p)),field:sum(p=>!keepers.has(p)),expKeeper:played,expField:Math.max(0,6*played-exclMin),exclMin,mins,goalsAgainst,blames};
}
function liveRecalcDialog(g){
  const r=liveRecalc(g),f=x=>fmt(Math.round(x*10)/10),ok=(a,b)=>Math.abs(a-b)<.6;
  const row=(label,a,b,note)=>`<tr><td>${label}</td><td>${f(a)}</td><td>${f(b)}</td><td style="color:${ok(a,b)?'#2f6b1f':'var(--red)'};font-weight:800">${ok(a,b)?'✓':(a>b?'+':'')+f(a-b)}</td></tr>${note?`<tr><td colspan="4" class="muted" style="font-size:12px">${note}</td></tr>`:''}`;
  const keepers=new Set(db().roster.keepers),players=Object.entries(r.mins).sort((a,b)=>b[1]-a[1]);
  const overlay=document.createElement('div');overlay.className='modal-backdrop';
  overlay.innerHTML=`<div class="modal"><div class="panel-head"><div><p class="eyebrow">${r.ended?'Tekma zaključena':'Tekma v teku'} · odigrano ${f(r.played)} min</p><h2>Preračun tekme</h2></div><button class="btn small" data-close>Zapri</button></div>
    <p class="muted" style="margin-top:0">Zaprtih vnosov: ${r.fix.closed} · odpravljenih prekrivanj: ${r.fix.merged} · upoštevanih izključitev: ${r.fix.excl}</p>
    <div class="tablescroll"><table class="table"><thead><tr><th>Igralni čas</th><th>Zapisano</th><th>Pričakovano</th><th>Razlika</th></tr></thead><tbody>
    ${row('Vratarke',r.keeper,r.expKeeper)}${row('Igralke v polju',r.field,r.expField,`6 × ${f(r.played)} min − ${f(r.exclMin)} min izključitev`)}</tbody></table></div>
    ${r.goalsAgainst>r.blames?`<div class="hint">Prejetih golov: ${r.goalsAgainst}, zapisanih krivd: ${r.blames}. Krivdo lahko dodaš pri igralki (akcija Krivda).</div>`:''}
    ${ok(r.field,r.expField)&&ok(r.keeper,r.expKeeper)?'':'<div class="hint">Razlika pomeni, da kakšna menjava ni bila vpisana. Popravi jo v Menjave (ali v Zapisniku izbriši napačen vnos igralnega časa) in znova preračunaj.</div>'}
    <div class="tablescroll" style="margin-top:12px"><table class="table"><thead><tr><th>Igralka</th><th>Minute</th></tr></thead><tbody>${players.map(([p,m])=>`<tr><td>${esc(p)}${keepers.has(p)?' · vrat.':''}</td><td>${f(m)}</td></tr>`).join('')||'<tr><td colspan="2">Ni zapisanega igralnega časa.</td></tr>'}</tbody></table></div></div>`;
  document.body.appendChild(overlay);overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  renderGame();
}

function liveSubsHtml(g,L,lineup){
  const roster=db().roster,all=[...roster.players,...roster.keepers],ex=liveExcl(L),exNames=new Set(ex.map(x=>x.person));
  const order=n=>{const i=all.indexOf(n);return i<0?999:i};
  const court=Object.keys(L.court).sort((a,b)=>order(a)-order(b)),bench=all.filter(n=>!L.court[n]&&!exNames.has(n));
  const tile=(n,attr,cls='')=>{const i=n.indexOf(' ');return `<button class="lv-tile ${cls}" ${attr}="${esc(n)}"><span>${esc(i<0?'':n.slice(0,i))}${roster.keepers.includes(n)?' · vrat.':''}</span><b>${esc(i<0?n:n.slice(i+1))}</b></button>`};
  if(lineup){const n=liveSub.pick.length;return `<div class="lv-subs"><section class="lv-sec wide"><p class="lv-lbl">Začetna postava · tapni, kdo začne <span class="lv-legend">${n}/${LIVE_COURT_MAX}</span></p>
    <div class="lv-grid">${all.map(p=>tile(p,'data-lineup',liveSub.pick.includes(p)?'sel':'')).join('')}</div>
    <div class="lv-subbar"><button class="lv-chip" data-lv="lineupSkip">Preskoči</button><button class="lv-chip go" data-lv="lineupGo" ${n?'':'disabled'}>Začni s postavo (${n})</button></div>
    <p class="lv-hint">Igralni čas začetne postave teče od trenutne minute ure tekme. Menjave nato vpisuješ na zaslonu »Menjave«.</p></section></div>`}
  const active=ex.filter(x=>liveLeft(L,x)>0).length,out=liveSub.out,ret=ex.find(x=>x.id===liveSub.ret);
  const benchHint=out?`tapni, kdo gre noter namesto ${esc(shortName(out))}`:ret?`tapni, kdo se vrne namesto ${esc(shortName(ret.person))}`:'tapni za vstop';
  return `<div class="lv-subs">
    ${ex.length?`<section class="lv-sec wide"><p class="lv-lbl">Izključene · ${ex.length}</p><div class="lv-exlist">${ex.map(x=>{const left=liveLeft(L,x);return `<div class="lv-excard ${left<=0?'done':''} ${liveSub.ret===x.id?'sel':''}"><div class="lv-exname"><b>${esc(shortName(x.person))}</b><small>${x.bench?'za klop · 2 minuti':x.code==='red'?'rdeči karton':x.code==='4'?'4 minute':'2 minuti'}</small></div><span class="lv-exleft" data-excl-left="${x.id}">${left>0?liveMMSS(left):'vrnitev'}</span>${left>0?'':`${x.returnable?`<button class="lv-chip go" data-ret-self="${x.id}">Vrne se ${esc(shortName(x.person))}</button>`:''}<button class="lv-chip ${liveSub.ret===x.id?'sel':''}" data-ret-other="${x.id}">Druga igralka</button>`}</div>`}).join('')}</div></section>`:''}
    <section class="lv-sec"><p class="lv-lbl">Na igrišču <span class="lv-legend">${court.length}/${LIVE_COURT_MAX-active}</span></p>
      <div class="lv-grid">${court.map(p=>tile(p,'data-sub-court',`on ${out===p?'sel':''}`)).join('')||'<p class="lv-hint">Nihče ni na igrišču. Tapni igralke na klopi.</p>'}</div>
      ${out?`<div class="lv-subbar"><b>Ven: ${esc(shortName(out))}</b><button class="lv-chip" data-sub-ex="out">Samo ven</button><button class="lv-chip bad" data-sub-ex="2">2 min</button><button class="lv-chip bad" data-sub-ex="4">4 min</button><button class="lv-chip bad" data-sub-ex="red">Rdeči</button><button class="lv-chip" data-lv="subcancel">Prekliči</button></div>`:'<p class="lv-hint">Tapni igralko, ki gre ven, nato igralko s klopi, ki gre noter. Za izključitev tapni igralko in izberi 2 min.</p>'}
    </section>
    <section class="lv-sec"><p class="lv-lbl">Klop · ${benchHint}</p><div class="lv-grid">${bench.map(p=>tile(p,'data-sub-bench')).join('')}</div></section>
  </div>`;
}

function liveSubClick(g,L,d){
  const ex=liveExcl(L);
  if(d.lineup){const i=liveSub.pick.indexOf(d.lineup);if(i>=0)liveSub.pick.splice(i,1);else if(liveSub.pick.length>=LIVE_COURT_MAX){toast(`Največ ${LIVE_COURT_MAX} igralk.`);return true}else liveSub.pick.push(d.lineup);renderLive(g);return true}
  if(d.subCourt){liveSub.out=liveSub.out===d.subCourt?null:d.subCourt;liveSub.ret=null;renderLive(g);return true}
  if(d.subEx){const p=liveSub.out;if(!p)return true;liveSub.out=null;
    if(d.subEx==='out'){liveCloseCourt(g,p);save();renderLive(g);liveFlash(`${shortName(p)} je izstopila`)}
    else{liveExclude(g,p,d.subEx);save();renderLive(g);liveFlash(`${shortName(p)} · izključitev ${d.subEx==='red'?'rdeči karton':d.subEx+' min'}`)}
    return true}
  if(d.retSelf){const x=ex.find(y=>y.id===d.retSelf);if(x&&liveLeft(L,x)<=0){L.excl=ex.filter(y=>y!==x);liveOpenCourt(g,x.person);liveSub.ret=null;save();renderLive(g);liveFlash(`${shortName(x.person)} se je vrnila`)}return true}
  if(d.retOther){liveSub.ret=liveSub.ret===d.retOther?null:d.retOther;liveSub.out=null;renderLive(g);return true}
  if(d.subBench){const p=d.subBench;
    if(liveSub.out){const o=liveSub.out;liveCloseCourt(g,o);liveOpenCourt(g,p);liveSub.out=null;save();renderLive(g);liveFlash(`${shortName(o)} ven · ${shortName(p)} noter`);return true}
    const ret=ex.find(y=>y.id===liveSub.ret);
    if(ret){L.excl=ex.filter(y=>y!==ret);liveOpenCourt(g,p);liveSub.ret=null;save();renderLive(g);liveFlash(`${shortName(p)} vstopi po izključitvi ${shortName(ret.person)}`);return true}
    const active=ex.filter(x=>liveLeft(L,x)>0).length;
    if(Object.keys(L.court).length>=LIVE_COURT_MAX-active){toast('Igrišče je polno – najprej tapni, kdo gre ven.');return true}
    // Prosto mesto po izteku izključitve zasede ta igralka.
    const done=ex.find(x=>liveLeft(L,x)<=0);if(done)L.excl=ex.filter(y=>y!==done);
    liveOpenCourt(g,p);save();renderLive(g);liveFlash(`${shortName(p)} je vstopila`);return true}
  return false;
}

function liveClick(g,ev){
  const b=ev.target.closest('button');if(!b||b.disabled)return;const L=liveState(g),d=b.dataset;
  if(d.lvPerson!==undefined){const p=d.lvPerson;const same=liveSel.person===p;liveClear();if(!same)liveSel.person=p;renderLive(g);return}
  // »2 min«: en dotik zapiše izključitev brez prekrška (npr. jezikanje); igralka gre na klop.
  if(d.lvKind==='two'&&liveSel.person&&liveSel.person!==LIVE_OPP&&liveSel.person!==LIVE_BENCH){const ev=liveExclude(g,liveSel.person,'2');liveBlameAsk=null;save();liveClear();renderLive(g);liveFlash(`Shranjeno · ${liveWho(ev)} · izključitev 2 min · gre na klop`);return}
  if(d.lvKind){if(liveSel.person){liveSel.kind=d.lvKind;liveSel.shot=null;liveSel.seven=false;liveSel.two=false;renderLive(g)}return}
  if(d.lvOpt!==undefined){liveOpts[Number(d.lvOpt)]?.();return}
  if(d.lvKeeper){L.keeper=d.lvKeeper;save();renderLive(g);return}
  if(liveSubClick(g,L,d))return;
  if(d.blame&&liveBlameAsk){const ev=livePush(g,{type:'blame',person:d.blame,half:liveBlameAsk.half,minute:liveBlameAsk.minute});liveBlameAsk=null;save();renderLive(g);liveFlash(`Shranjeno · ${liveWho(ev)} · krivda za prejeti gol`);return}
  switch(d.lv){
    case 'back':livePause(L);save();liveClear();gameId=null;view='matches';render();break;
    case 'classic':setLivePref(false);liveClear();renderGame();break;
    case 'h1':liveSetHalf(g,'1');break;
    case 'h2':liveSetHalf(g,'2');break;
    case 'minus':case 'plus':{const s=liveSec(L)+(d.lv==='plus'?60:-60);L.secs[L.half]=Math.max(0,Math.min(1800,s));if(L.since)L.since=Date.now();save();renderLive(g);break}
    case 'run':if(L.since)livePause(L);else if(liveSec(L)<1800)L.since=Date.now();save();renderLive(g);break;
    case 'clear':liveClear();renderLive(g);break;
    case 'unkind':if(liveSel.person){liveSel.kind=null;liveSel.shot=null;liveSel.seven=false;liveSel.two=false;renderLive(g)}break;
    case 'recalc':liveRecalcDialog(g);break;
    case 'blameNone':liveBlameAsk=null;renderLive(g);break;
    case 'undo':if(g.events.length){const e=g.events.pop();if(e.type==='exclusion')L.excl=liveExcl(L).filter(x=>x.ev!==e.id);save();renderLive(g);liveFlash('Zadnja akcija razveljavljena.')}break;
    case 'subs':L.screen='subs';liveClear();liveSub.out=liveSub.ret=null;save();renderLive(g);break;
    case 'entry':L.screen='entry';liveSub.out=liveSub.ret=null;save();renderLive(g);break;
    case 'subcancel':liveSub.out=null;renderLive(g);break;
    case 'lineupGo':for(const p of liveSub.pick)liveOpenCourt(g,p);L.lineupDone=true;L.screen='entry';liveSub.pick=[];save();renderLive(g);liveFlash('Začetna postava je na igrišču.');break;
    case 'lineupSkip':L.lineupDone=true;liveSub.pick=[];save();renderLive(g);break;
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
    if(L.since&&sec>=1800){livePause(L);if(L.half==='2'){for(const p of Object.keys(L.court))liveCloseCourt(g,p)}save();renderLive(g);liveFlash(L.half==='2'?'Konec tekme – igralni čas je zaključen.':'Konec 1. polčasa.');return}
    let expired=null,back=null;
    for(const x of [...liveExcl(L)]){const left=liveLeft(L,x);$$(`[data-excl-left="${x.id}"]`).forEach(el=>el.textContent=left>0?liveMMSS(left):'vrnitev');if(left>0||liveExpired.has(x.id))continue;liveExpired.add(x.id);
      // Po izteku se ista igralka sama vrne na igrišče (trener jo lahko nato zamenja v Menjave), če je prostor.
      const active=liveExcl(L).filter(y=>y!==x&&liveLeft(L,y)>0).length;
      if(x.returnable&&!L.court[x.person]&&Object.keys(L.court).length<LIVE_COURT_MAX-active){L.excl=liveExcl(L).filter(y=>y!==x);liveOpenCourt(g,x.person);back=x}else expired=x}
    if(back){save();renderLive(g);liveFlash(`${shortName(back.person)} se je vrnila po izključitvi – v Menjave jo lahko zamenjaš`)}
    else if(expired){renderLive(g);liveFlash(`${shortName(expired.person)} · izključitev je potekla – vpiši vrnitev v Menjave`)}
  },1000);
}

function liveStartDialog(){
  const now=new Date(),today=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const overlay=document.createElement('div');overlay.className='modal-backdrop';
  overlay.innerHTML=`<div class="modal"><div class="panel-head"><div><p class="eyebrow">Vnos v živo · ${teamLabel()}</p><h2>Proti komu igramo?</h2></div><button class="btn small" data-close>Zapri</button></div><div class="form-grid">${team==='other'?'<div class="field"><label for="lsHome">Domača ekipa</label><input id="lsHome" placeholder="Ime ekipe" autocomplete="off"></div>':''}<div class="field"><label for="lsOpp">Nasprotnik</label><input id="lsOpp" placeholder="Ime ekipe" autocomplete="off"></div><div class="field"><label for="lsDate">Datum tekme</label><input id="lsDate" type="date" value="${today}"></div></div><button class="btn lime lv-startbig" id="lsGo">Začni vnos</button></div>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();
  overlay.querySelector('[data-close]').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};
  const go=()=>{const opp=overlay.querySelector('#lsOpp').value.trim();if(!opp){toast('Vnesi ime nasprotnika.');overlay.querySelector('#lsOpp').focus();return}
    const home=overlay.querySelector('#lsHome')?.value.trim()||(isClubTeam(team)?teamLabel():'');if(team==='other'&&!home){toast('Vnesi domačo ekipo.');overlay.querySelector('#lsHome').focus();return}
    const g={id:id(),date:overlay.querySelector('#lsDate').value||today,opponent:opp,...(home?{home}:{}),finalHome:'',finalAway:'',firstHalfHome:'',firstHalfAway:'',complete:false,events:[]};
    db().games.push(g);save();close();setLivePref(true);liveClear();gameId=g.id;view='game';render()};
  overlay.querySelector('#lsGo').onclick=go;
  overlay.querySelector('#lsOpp').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
  overlay.querySelector('#lsOpp').focus();
}
function openLiveGame(g){setLivePref(true);liveClear();gameId=g.id;view='game';render()}

const liveRenderMatches=renderMatches;
renderMatches=function(){
  liveRenderMatches();
  const open=db().games.filter(g=>!g.imported&&!g.complete).sort((a,b)=>b.date.localeCompare(a.date));
  $('#view-matches').insertAdjacentHTML('afterbegin',`<div class="lv-start"><div><p class="eyebrow">${teamLabel()} · vnos v živo</p><h2>Beleži tekmo z dotiki</h2><p>Igralka → akcija → podrobnost. Ura tekme sama zapiše minuto.</p></div><div class="lv-startbtns"><button class="btn lime lv-startbig" id="liveStartBtn">＋ Začni vnos v živo</button>${open.slice(0,2).map(g=>`<button class="btn lv-resume" data-live-open="${g.id}">Nadaljuj · ${esc(g.home||'Celje')} – ${esc(g.opponent)}<small>${esc(g.date)} · ${g.events.length} akcij</small></button>`).join('')}</div></div>`);
  $('#liveStartBtn').onclick=liveStartDialog;
  $$('[data-live-open]').forEach(b=>b.onclick=()=>{const g=db().games.find(x=>x.id===b.dataset.liveOpen);if(g)openLiveGame(g)});
};

const classicRenderGame=renderGame;
renderGame=function(){
  const g=game();
  if(g&&!g.imported&&!g.complete&&livePref()){if(liveGameId!==g.id){liveClear();liveSub={out:null,ret:null,pick:[]};liveExpired=new Set((g.live?.excl||[]).filter(x=>liveLeft(g.live,x)<=0).map(x=>x.id))}renderLive(g);return}
  classicRenderGame();
  if(g&&!g.imported&&!g.complete){$('#backGames')?.insertAdjacentHTML('afterend','<button class="btn small lime" id="openLive">Vnos v živo</button>');$('#openLive').onclick=()=>{setLivePref(true);renderGame()}}
  if(g&&!g.imported&&$('#backGames')){$('#backGames').insertAdjacentHTML('afterend','<button class="btn small" id="recalcGame">Preračunaj tekmo</button>');$('#recalcGame').onclick=()=>liveRecalcDialog(g)}
};
render();
