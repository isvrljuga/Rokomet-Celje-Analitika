// Klepet z analitikom: prijavljeni uporabniki vprašajo o tekmah in igralkah izbrane ekipe.
// Aplikacija sama pripravi tabele s številkami, posrednik (chat-worker/worker.js) jih pošlje modelu.
const CHAT_URL=(window.CELJE_CLOUD||{}).chatUrl||'';
const CHAT_MAX_CONTEXT=38000;
const CHAT_EXAMPLES=['Katera igralka ima najboljši index na čas?','Primerjaj zadnji dve tekmi.','Kako uspešne so bile golmanke?','V kateri četrtini prejmemo največ golov?'];
let chatLog={},chatBusy=false;

const chatN=x=>{const v=Math.round((Number(x)||0)*10)/10;return String(v).replace('.',',')};
const chatPct=x=>x?`${chatN(x*100)} %`:'—';
function chatContext(){
  const games=db().games,keepers=new Set(db().roster.keepers),head=[],perGame=[];
  head.push(`EKIPA: ${teamLabel()} (ŽRK Celje), ${games.length} tekem.`);
  head.push('','TEKME (datum; tekma; rezultat Celje:nasprotnik; polčas; vir)');
  const data=games.map(g=>({g,d:xpData(g)}));
  for(const {g} of data){const s=matchScore(g),h=g.finalHome!==''&&g.finalHome!=null?g.finalHome:s.h,a=g.finalAway!==''&&g.finalAway!=null?g.finalAway:s.a;head.push(`${g.date}; ${g.home||'Celje'} – ${g.opponent}; ${h}:${a}; ${g.firstHalfHome||0}:${g.firstHalfAway||0}; ${g.imported?'Excel':'vnos v živo'}`)}
  const pot=data.reduce((n,x)=>n+x.d.potential,0);
  head.push('',`IGRALKE SKUPAJ (možni čas igralke v polju ${chatN(pot)} min, vratarke 60 min na tekmo)`,'ime; tekem odigranih; minute; % časa; index; index/tekmo; index na čas; goli; goli 7m; obrambe; zgrešeni; obr./zgr. 7m; asistence; DA; DN; NA; NN; POA; PON; PNA; PNN; krivda; 7m dobljen; 2min dobljene; izključitve 2min');
  const names=[...new Set([...db().roster.players,...db().roster.keepers,...data.flatMap(x=>x.d.players)])];
  for(const p of names){
    const s=playerStats(p),c=s.count,n=gamesPlayed(p,games);
    if(!n&&!s.indexNew&&!s.minutes)continue;
    const share=s.minutes/((keepers.has(p)?60*games.length:pot)||1);
    head.push([p+(keepers.has(p)?' (vratarka)':''),n,chatN(s.minutes),chatPct(share),chatN(s.indexNew),n?chatN(s.indexNew/n):'—',share?chatN(s.indexNew/share):'—',c.goal,c.sevenGoal,c.saves,c.miss,(c.sevenSave||0)+(c.sevenMiss||0),c.assist,c.DA,c.DN,c.NA,c.NN,c.POA,c.PON,c.PNA,c.PNN,c.blame||0,c.sevenDrawn||0,c.twoDrawn||0,c.twoOwn||0].join('; '));
  }
  // Po tekmah (najnovejše najprej): streli po četrtinah, golmanke in igralke.
  for(const {g,d} of [...data].sort((a,b)=>String(b.g.date).localeCompare(String(a.g.date)))){
    const q=(list,r)=>[0,1,2,3].map(i=>xpSum(list.filter(x=>x.code.endsWith(r)&&XP_SHOT_CODES.includes(x.code)).map(x=>x.q[i])));
    const cg=q(d.rows,'G'),cs=[0,1,2,3].map(i=>cg[i]+q(d.rows,'O')[i]+q(d.rows,'Z')[i]),og=q(d.opp,'G'),os=[0,1,2,3].map(i=>og[i]+q(d.opp,'O')[i]+q(d.opp,'Z')[i]);
    const lines=['',`TEKMA ${g.date} proti ${g.opponent}`,`goli/streli Celje po četrtinah 0-15, 15-30, 30-45, 45-60: ${cg.map((x,i)=>`${x}/${cs[i]}`).join(', ')}`,`goli/streli nasprotnic po četrtinah: ${og.map((x,i)=>`${x}/${os[i]}`).join(', ')}`];
    for(const k of d.keepers)lines.push(`golmanka ${k.person}: ${chatN(k.min)} min, obrambe ${k.shots-k.goals} od ${k.shots} strelov v okvir (${chatPct(k.shots?(k.shots-k.goals)/k.shots:0)}), 7m prejeti ${k.sg}/${k.st}`);
    lines.push('igralke: ime; index; goli; goli 7m; asistence; minute; % časa; index na čas');
    for(const r of xpIndexRows(d))if(r.m||r.s.indexNew)lines.push([r.p,chatN(r.s.indexNew),r.c.goal||0,r.c.sevenGoal||0,r.c.assist||0,chatN(r.m),chatPct(r.share),r.share?chatN(r.s.indexNew/r.share):'—'].join('; '));
    perGame.push(lines.join('\n'));
  }
  // Če je podatkov preveč, se izpustijo podrobnosti najstarejših tekem (seštevki ostanejo).
  let text=head.join('\n');const blocks=[];
  for(const b of perGame){if(text.length+blocks.join('\n').length+b.length>CHAT_MAX_CONTEXT){blocks.push('\n(Podrobnosti starejših tekem so izpuščene.)');break}blocks.push(b)}
  return `${text}\n${blocks.join('\n')}`;
}

function chatMd(t){
  const lines=esc(t).split('\n'),out=[];let table=[];
  const inline=s=>s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  const flush=()=>{if(!table.length)return;const rows=table.filter(r=>!/^\|?\s*:?-{2,}/.test(r)).map(r=>r.replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim())));out.push(`<div class="tablescroll"><table class="table"><thead><tr>${rows[0].map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);table=[]};
  for(const l of lines){if(/^\s*\|/.test(l)){table.push(l.trim());continue}flush();if(/^\s*[-*]\s+/.test(l))out.push(`<div class="chat-li">• ${inline(l.replace(/^\s*[-*]\s+/,''))}</div>`);else if(l.trim())out.push(`<p>${inline(l.replace(/^#+\s*/,''))}</p>`)}
  flush();return out.join('');
}
function chatHtml(){
  const log=chatLog[team]||[];
  return `<div class="panel chat" id="chatPanel"><div class="panel-head"><div><p class="eyebrow">${esc(teamLabel())} · ${db().games.length} tekem</p><h2>Vprašaj analitika</h2></div><span class="tag">odprtokodni model</span></div>
  <div class="chat-log" id="chatLog">${log.length?log.map(m=>`<div class="chat-msg ${m.role}">${m.role==='user'?`<p>${esc(m.content)}</p>`:chatMd(m.content)}</div>`).join(''):`<div class="chat-examples">${CHAT_EXAMPLES.map(x=>`<button class="btn small" data-chat-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>`}${chatBusy?'<div class="chat-msg assistant busy"><p>Razmišljam …</p></div>':''}</div>
  <form class="chat-form" id="chatForm"><textarea id="chatInput" rows="2" placeholder="Npr. kdo je dal največ golov iz protinapadov?" aria-label="Vprašanje"></textarea><button class="btn primary" ${chatBusy?'disabled':''}>Pošlji</button></form>
  <p class="muted chat-note">Odgovori temeljijo na podatkih te ekipe v aplikaciji. Model se lahko zmoti – pomembne številke preveri v pregledu.</p></div>`;
}
async function chatAsk(question){
  if(chatBusy||!question.trim())return;
  const log=chatLog[team]=chatLog[team]||[],history=log.slice(-6);
  log.push({role:'user',content:question.trim()});chatBusy=true;renderMatches();
  try{
    const token=await firebase.auth().currentUser.getIdToken();
    const r=await fetch(CHAT_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({team,question:question.trim(),history,context:chatContext()})});
    const d=await r.json().catch(()=>({}));
    log.push({role:'assistant',content:r.ok&&d.answer?d.answer+(d.left!=null&&d.left<=5?`\n\n(Danes ti ostane še ${d.left} vprašanj.)`:''):(d.error||'Odgovora ni bilo mogoče dobiti.')});
  }catch(e){console.error(e);log.push({role:'assistant',content:'Povezava s klepetom ni uspela. Preveri internet in poskusi znova.'})}
  chatBusy=false;if(view==='matches'&&!gameId)renderMatches();
}
const chatRenderMatches=renderMatches;
renderMatches=function(){
  chatRenderMatches();
  if(!CHAT_URL||!cloudOn||!cloudUser||!window.firebase)return;
  const root=$('#view-matches'),anchor=root.querySelector('.lv-start');
  if(anchor)anchor.insertAdjacentHTML('afterend',chatHtml());else root.insertAdjacentHTML('afterbegin',chatHtml());
  const logEl=$('#chatLog');logEl.scrollTop=logEl.scrollHeight;
  const input=$('#chatInput');
  $('#chatForm').onsubmit=e=>{e.preventDefault();const q=input.value;input.value='';chatAsk(q)};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#chatForm').requestSubmit()}});
  $$('[data-chat-ex]').forEach(b=>b.onclick=()=>chatAsk(b.dataset.chatEx));
};
