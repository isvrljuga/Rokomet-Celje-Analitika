// Analiza tekem: potek tekem, četrtine, napad in obramba, pričakovani goli (xG) po benchmarku in povezave z izidom.
// Vse se računa sproti iz tekem izbrane ekipe (xpData iz export.js), zato velja za vnose v živo in uvožene tekme.
const AN_POS=[['6','6 m'],['7','7 m'],['9','9 m'],['K','Krilo'],['PT','Protinapad'],['PD','Prodor']];
// Benchmark: [goli, streli] igralk in [obrambe, streli] golmank po pozicijah (All Teams Overview).
// Članice: ena slika, mladinke: seštevek dveh slik.
const AN_BENCH_RAW={
  members:{goal:{6:[903,1287],7:[631,836],9:[1053,2805],K:[1051,1738],PT:[685,871],PD:[1491,2268]},save:{6:[270,1173],7:[142,773],9:[934,1986],K:[470,1519],PT:[135,796],PD:[557,2048]}},
  juniors:{goal:{6:[1909,2781],7:[1411,1913],9:[1916,5386],K:[2035,3635],PT:[1576,2021],PD:[3500,5301]},save:{6:[601,2505],7:[305,1716],9:[1738,3648],K:[1049,3082],PT:[270,1828],PD:[1197,4697]}}
};
const AN_FACTORS=[['attack_eff','Uspešnost napada (%)'],['defense_eff','Uspešnost obrambe (%)'],['shot_pct','Uspešnost strelov (%)'],['save_pct','Obrambe golmank (%)'],['opp_shot_pct','Uspešnost strelov nasprotnic (%)'],['errors','Napake'],['gains','Dobljene žoge'],['assists','Asistence'],['shots_for','Streli Celja'],['excl_min','Minute izključitev'],['team_index','Index ekipe'],['att_diff','Goli − xG'],['def_diff','xG nasprotnic − prejeti']];
let anGameId=null,anFactor=null;

const anBenchKey=()=>team==='juniors'||team==='cadets'?'juniors':'members';
const anBench=()=>{const b=AN_BENCH_RAW[anBenchKey()],o={};for(const [p] of AN_POS)o[p]={goal:b.goal[p][0]/b.goal[p][1],save:b.save[p][0]/b.save[p][1]};return o};
const anR=(v,d=1)=>Math.round(v*10**d)/10**d;
const anSigned=v=>v==null?'—':`${v>0?'+':v<0?'−':''}${dbF(Math.abs(v))}`;
const anPctN=(a,b)=>b?anR(100*a/b):null;
const anPctS=v=>v==null?'—':`${dbF(v)} %`;
const anTone=v=>v>0.5?'an-pos':v<-0.5?'an-neg':'';
const anShot=code=>/^(9|6|7|K|PD|PT)[ZOG]$/.test(code);

// Ena vrstica na tekmo z vsemi kazalniki.
function anGameRow(g,bench){
  const d=xpData(g),sc=dbScore(g),tot=(list,pred)=>dbSum(list.filter(pred).map(r=>dbSum(r.q)));
  const sf=tot(d.rows,r=>anShot(r.code)),gf=tot(d.rows,r=>anShot(r.code)&&r.code.endsWith('G'));
  const sa=tot(d.opp,r=>anShot(r.code)),ga=tot(d.opp,r=>anShot(r.code)&&r.code.endsWith('G')),saves=tot(d.opp,r=>anShot(r.code)&&r.code.endsWith('O'));
  const errors=tot(d.rows,r=>r.code==='NA'||r.code==='NN'),gains=tot(d.rows,r=>r.code==='DA'||r.code==='DN'),assists=tot(d.rows,r=>/^A[ZOG7]$/.test(r.code));
  const qf=dbQ(d.rows,r=>anShot(r.code)&&r.code.endsWith('G')),qa=dbQ(d.opp,r=>anShot(r.code)&&r.code.endsWith('G'));
  const pos={};let xg=0,xga=0,xsaves=0;
  for(const [p] of AN_POS){
    const c=r=>r.code.slice(0,-1)===p&&/[ZOG]$/.test(r.code);
    const x={shots:tot(d.rows,c),goals:tot(d.rows,r=>c(r)&&r.code.endsWith('G')),oshots:tot(d.opp,c),ogoals:tot(d.opp,r=>c(r)&&r.code.endsWith('G')),osaves:tot(d.opp,r=>c(r)&&r.code.endsWith('O'))};
    x.xg=x.shots*bench[p].goal;x.xga=x.oshots*bench[p].goal;x.xsaves=x.oshots*bench[p].save;
    xg+=x.xg;xga+=x.xga;xsaves+=x.xsaves;pos[p]=x;
  }
  const att=sf+errors,oatt=sa+gains,result=sc.h>sc.a?'zmaga':sc.h<sc.a?'poraz':'remi';
  return {g,id:g.id,label:`${dbDate(g.date)} ${g.opponent}`,opponent:g.opponent,live:!g.imported,gf:sc.h,ga:sc.a,diff:sc.h-sc.a,result,
    shots_for:sf,shots_against:sa,goals_shots:gf,goals_against_shots:ga,saves,errors,gains,assists,qf,qa,excl_min:d.exclMin,
    team_index:anR(dbSum(d.players.map(p=>playerStats(p,[g]).indexNew))),
    shot_pct:anPctN(gf,sf),opp_shot_pct:anPctN(ga,sa),save_pct:anPctN(saves,saves+ga),attack_eff:anPctN(gf,att),defense_eff:oatt?anR(100-100*ga/oatt):null,
    pos,xg:anR(xg),xga:anR(xga),xsaves:anR(xsaves),att_diff:anR(gf-xg),def_diff:anR(xga-ga),save_diff:anR(saves-xsaves),net:anR(gf-xg+xga-ga)};
}

// Točke poteka: pri vnosih v živo vsak gol, pri uvoženih tekmah konec vsake četrtine.
function anFlow(r){
  const pts=[{m:0,f:0,a:0,side:0}];
  if(r.live){
    const goals=r.g.events.filter(e=>e.type==='shot'&&e.result==='goal').map(e=>({e,m:(String(e.half)==='2'?30:0)+(Number(e.minute)||0)+.5}))
      .sort((x,y)=>x.m-y.m||String(x.e.created||'').localeCompare(String(y.e.created||'')));
    let f=0,a=0;for(const {e,m} of goals){if(e.side==='celje')f++;else a++;pts.push({m,f,a,side:e.side==='celje'?1:-1})}
  }else{let f=0,a=0;for(let q=0;q<4;q++){f+=r.qf[q];a+=r.qa[q];pts.push({m:15*(q+1),f,a,side:0})}}
  return pts;
}
function anFlowStats(r,pts){
  let lead=0,def=0,changes=0,leader=0,run=0,side=0,best=0,worst=0;
  for(const p of pts.slice(1)){
    const d=p.f-p.a;lead=Math.max(lead,d);def=Math.min(def,d);const s=Math.sign(d);if(s&&leader&&s!==leader)changes++;if(s)leader=s;
    if(r.live){run=p.side===side?run+1:1;side=p.side;if(side>0)best=Math.max(best,run);else worst=Math.max(worst,run)}
  }
  return {lead,def,changes:r.live?changes:null,best:r.live?best:null,worst:r.live?worst:null};
}

// ---------- SVG grafi ----------
let AN_W=640;
// Grafi se rišejo v širini svojega okvirja, da je besedilo povsod enako veliko.
const anAt=(w,f)=>{AN_W=Math.max(280,Math.round(w));return f()};
const anTicks=(lo,hi,n=5)=>{const span=hi-lo||1,step0=span/n,mag=10**Math.floor(Math.log10(step0)),step=[1,2,2.5,5,10].map(k=>k*mag).find(s=>s>=step0)||step0;const out=[];for(let v=Math.ceil(lo/step)*step;v<=hi+1e-9;v+=step)out.push(anR(v,6));return out};
const anNice=(lo,hi)=>{if(lo===hi){lo-=1;hi+=1}const t=anTicks(lo,hi);const step=t.length>1?t[1]-t[0]:1;return [Math.floor(lo/step)*step,Math.ceil(hi/step)*step]};
function anSvg(h,body,label){return `<svg class="an-svg" viewBox="0 0 ${AN_W} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`}
const anText=(x,y,t,a='start',cls='')=>`<text x="${anR(x)}" y="${anR(y)}" text-anchor="${a}" class="${cls}">${esc(t)}</text>`;

function anFlowChart(r,pts){
  const H=230,m={t:14,r:14,b:30,l:36},ext=Math.max(4,...pts.map(p=>Math.abs(p.f-p.a)));
  const [lo,hi]=anNice(-ext,ext),x=v=>m.l+(AN_W-m.l-m.r)*v/60,y=v=>m.t+(H-m.t-m.b)*(hi-v)/(hi-lo);
  let path=`M${x(0)},${y(0)}`;for(const p of pts.slice(1)){const d=p.f-p.a;path+=r.live?`H${anR(x(p.m))}V${anR(y(d))}`:`L${anR(x(p.m))},${anR(y(d))}`}
  path+=`H${x(60)}`;
  const area=`${path}V${y(0)}H${x(0)}Z`,id='anclip'+Math.random().toString(36).slice(2,7);
  let s=`<defs><clipPath id="${id}a"><rect x="0" y="0" width="${AN_W}" height="${y(0)}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${y(0)}" width="${AN_W}" height="${H}"/></clipPath></defs>`;
  for(const t of anTicks(lo,hi))s+=`<line class="an-grid" x1="${m.l}" x2="${AN_W-m.r}" y1="${y(t)}" y2="${y(t)}"/>${anText(m.l-6,y(t)+4,t>0?`+${t}`:String(t),'end')}`;
  for(const t of [0,15,30,45,60])s+=anText(x(t),H-10,`${t}'`,'middle');
  s+=`<line class="an-ref" x1="${x(30)}" x2="${x(30)}" y1="${m.t}" y2="${H-m.b}"/>${anText(x(30)+4,m.t+10,'polčas')}`;
  s+=`<path d="${area}" fill="${DB_CELJE}" opacity=".18" clip-path="url(#${id}a)"/><path d="${area}" fill="${DB_OPP}" opacity=".2" clip-path="url(#${id}b)"/>`;
  s+=`<line class="an-axis" x1="${m.l}" x2="${AN_W-m.r}" y1="${y(0)}" y2="${y(0)}"/><path d="${path}" fill="none" stroke="var(--ink)" stroke-width="2"/>`;
  for(const p of pts.slice(1))s+=`<circle cx="${anR(x(p.m))}" cy="${anR(y(p.f-p.a))}" r="${r.live?3:4}" fill="${p.side<0?DB_OPP:DB_CELJE}"><title>${anR(p.m,0)}' · ${p.f}:${p.a}</title></circle>`;
  return anSvg(H,s,`Razlika v golih skozi tekmo ${r.label}`);
}

// Razsevni diagram; tekme obarvane po izidu, po želji premica trenda.
function anScatter(rows,fx,fy,xl,yl,{trend=false,fmtX=v=>dbF(v),fmtY=v=>dbF(v),zeroY=false}={}){
  const pts=rows.filter(r=>r[fx]!=null&&r[fy]!=null);if(pts.length<2)return '<p class="muted">Premalo tekem za graf.</p>';
  const H=260,m={t:26,r:16,b:36,l:44},xs=pts.map(r=>r[fx]),ys=pts.map(r=>r[fy]);
  const [x0,x1]=anNice(Math.min(...xs),Math.max(...xs)),ye=Math.max(...ys.map(Math.abs)),[y0,y1]=zeroY?anNice(-ye,ye):anNice(Math.min(...ys),Math.max(...ys));
  const x=v=>m.l+(AN_W-m.l-m.r)*(v-x0)/((x1-x0)||1),y=v=>m.t+(H-m.t-m.b)*(y1-v)/((y1-y0)||1);
  let s='';for(const t of anTicks(y0,y1))s+=`<line class="an-grid" x1="${m.l}" x2="${AN_W-m.r}" y1="${y(t)}" y2="${y(t)}"/>${anText(m.l-6,y(t)+4,fmtY(t),'end')}`;
  for(const t of anTicks(x0,x1))s+=anText(x(t),H-18,fmtX(t),'middle');
  s+=anText(AN_W-m.r,H-3,`${xl} →`,'end')+anText(4,10,`↑ ${yl}`);
  if(zeroY)s+=`<line class="an-axis" x1="${m.l}" x2="${AN_W-m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  if(trend){const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length,sxx=xs.reduce((a,v)=>a+(v-mx)**2,0),b=sxx?xs.reduce((a,v,i)=>a+(v-mx)*(ys[i]-my),0)/sxx:0;s+=`<line class="an-trend" x1="${x(x0)}" x2="${x(x1)}" y1="${anR(y(my+b*(x0-mx)))}" y2="${anR(y(my+b*(x1-mx)))}"/>`}
  else{const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;s+=`<line class="an-ref" x1="${x(mx)}" x2="${x(mx)}" y1="${m.t}" y2="${H-m.b}"/><line class="an-ref" x1="${m.l}" x2="${AN_W-m.r}" y1="${y(my)}" y2="${y(my)}"/>`}
  const col=r=>r.result==='zmaga'?'var(--an-ok)':r.result==='poraz'?'var(--red)':'var(--an-warn)';
  const placed=[];
  for(const r of pts){const cx=x(r[fx]),cy=y(r[fy]);placed.push({x:cx-7,y:cy-7,w:14,h:14});s+=`<circle class="an-dot" data-an-game="${esc(r.id)}" cx="${anR(cx)}" cy="${anR(cy)}" r="7" fill="${col(r)}"><title>${esc(r.label)} · ${r.gf}:${r.ga}\n${xl}: ${fmtX(r[fx])} · ${yl}: ${fmtY(r[fy])}</title></circle>`}
  // Oznake: prvo prosto mesto okoli pike, sicer brez oznake.
  for(const r of pts){const cx=x(r[fx]),cy=y(r[fy]),w=r.opponent.length*6.2,h=12;
    const spot=[[cx+10,cy+4],[cx-10-w,cy+4],[cx+8,cy-10],[cx+8,cy+18],[cx-8-w,cy-10],[cx-8-w,cy+18]].find(([tx,ty])=>{const b={x:tx,y:ty-h+2,w,h};return tx>=m.l&&tx+w<=AN_W-2&&ty-h>=0&&ty<=H-m.b-2&&!placed.some(p=>b.x<p.x+p.w&&p.x<b.x+b.w&&b.y<p.y+p.h&&p.y<b.y+b.h)});
    if(spot){placed.push({x:spot[0],y:spot[1]-h+2,w,h});s+=anText(spot[0],spot[1],r.opponent)}}
  return anSvg(H,s,`${xl} in ${yl} po tekmah`);
}

// Vodoravni stolpci okoli ničle; vsak element ima lahko več zloženih delov in oznako vrednosti.
function anHBars(items,{min,max,fmt=v=>anSigned(v),label='graf',colors=[DB_CELJE,DB_OPP],marker=false,click=''}){
  const rowH=28,m={t:6,b:26,r:52},L=Math.min(220,12+6.4*Math.max(...items.map(i=>i.label.length))),H=m.t+items.length*rowH+m.b;
  const [lo,hi]=min!=null?[min,max]:anNice(Math.min(0,...items.flatMap(i=>i.ends)),Math.max(0,...items.flatMap(i=>i.ends)));
  const x=v=>L+(AN_W-L-m.r)*(v-lo)/((hi-lo)||1);
  let s='';for(const t of anTicks(lo,hi,6))s+=`<line class="an-grid" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H-m.b}"/>${anText(x(t),H-8,fmt(t),'middle')}`;
  items.forEach((it,i)=>{const yy=m.t+i*rowH;s+=`<g ${click?`class="an-click" ${click}="${esc(it.key)}"`:''}><title>${esc(it.title||it.label)}</title>${anText(L-8,yy+rowH/2+4,it.label,'end',it.bold?'an-strong':'')}`;
    for(const [k,p] of it.parts.entries())s+=`<rect x="${anR(x(Math.min(p[0],p[1])))}" y="${yy+6}" width="${anR(Math.max(1,Math.abs(x(p[1])-x(p[0]))))}" height="${rowH-12}" rx="2" fill="${p[2]||colors[k]}" stroke="var(--paper)"/>`;
    if(marker)s+=`<line x1="${anR(x(it.value))}" x2="${anR(x(it.value))}" y1="${yy+2}" y2="${yy+rowH-2}" stroke="var(--ink)" stroke-width="2"/>`;
    s+=anText(AN_W-m.r+6,yy+rowH/2+4,fmt(it.value),'start','an-strong')+'</g>'});
  s+=`<line class="an-axis" x1="${x(0)}" x2="${x(0)}" y1="${m.t}" y2="${H-m.b}"/>`;
  return anSvg(H,s,label);
}

// Delež zadetkov po pozicijah: Celje, nasprotnice in črta benchmarka.
function anPosChart(rows){
  const H=230,m={t:12,r:10,b:28,l:40},y=v=>m.t+(H-m.t-m.b)*(100-v)/100,bw=(AN_W-m.l-m.r)/rows.length;
  let s='';for(const t of [0,20,40,60,80,100])s+=`<line class="an-grid" x1="${m.l}" x2="${AN_W-m.r}" y1="${y(t)}" y2="${y(t)}"/>${anText(m.l-6,y(t)+4,`${t} %`,'end')}`;
  rows.forEach((r,i)=>{const x0=m.l+i*bw+bw*.14,w=bw*.34;
    [[r.pct,DB_CELJE,`Celje ${anPctS(r.pct)} (${r.goals}/${r.shots})`],[r.opp_pct,DB_OPP,`Nasprotnice ${anPctS(r.opp_pct)} (${r.opp_goals}/${r.opp_shots})`]].forEach(([v,c,t],k)=>{if(v!=null)s+=`<rect x="${anR(x0+k*(w+bw*.04))}" y="${anR(y(v))}" width="${anR(w)}" height="${anR(y(0)-y(v))}" rx="2" fill="${c}"><title>${esc(r.label)} · ${t} · benchmark ${anPctS(r.bench)}</title></rect>`});
    s+=`<line x1="${anR(x0-4)}" x2="${anR(x0+2*w+bw*.04+4)}" y1="${y(r.bench)}" y2="${y(r.bench)}" stroke="#8b9590" stroke-width="3"/>`+anText(m.l+i*bw+bw/2,H-8,r.label,'middle')});
  return anSvg(H,s,'Delež zadetkov po pozicijah ob benchmarku');
}

function anPearson(rows,k){
  const p=rows.filter(r=>r[k]!=null).map(r=>[Number(r[k]),r.diff]),n=p.length;if(n<3)return null;
  const mx=p.reduce((a,v)=>a+v[0],0)/n,my=p.reduce((a,v)=>a+v[1],0)/n,sxy=p.reduce((a,v)=>a+(v[0]-mx)*(v[1]-my),0),sx=Math.sqrt(p.reduce((a,v)=>a+(v[0]-mx)**2,0)),sy=Math.sqrt(p.reduce((a,v)=>a+(v[1]-my)**2,0));
  return sx&&sy?anR(sxy/(sx*sy),2):null;
}

// ---------- Zavihek ----------
function renderGameDash(){
  const root=$('#view-adash'),all=dbGames(),bench=anBench();
  const full=Math.max(280,(root.clientWidth||700)-36),half=innerWidth>900?Math.max(280,(full-52)/2):full;
  const head=t=>`<div class="head"><div><p class="eyebrow">${esc(teamLabel())}${t}</p><h1>Analiza tekem</h1><p>Potek tekem, četrtine, napad in obramba, pričakovani goli in kaj je povezano z izidom.</p></div></div>`;
  if(!all.length){root.innerHTML=head('')+'<div class="panel"><p class="muted">Ni še zapisanih tekem.</p></div>';return}
  const rows=all.map(g=>anGameRow(g,bench)),S=k=>dbSum(rows.map(r=>r[k])),n=rows.length;
  if(!rows.some(r=>r.id===anGameId))anGameId=rows[rows.length-1].id;
  const cur=rows.find(r=>r.id===anGameId),pts=anFlow(cur),fs=anFlowStats(cur,pts);
  const w=rows.filter(r=>r.result==='zmaga').length,dr=rows.filter(r=>r.result==='remi').length,l=n-w-dr;
  const qAvg=[0,1,2,3].map(q=>({f:dbSum(rows.map(r=>r.qf[q]))/n,a:dbSum(rows.map(r=>r.qa[q]))/n})),worstQ=qAvg.map((v,q)=>({q,d:v.f-v.a})).sort((a,b)=>a.d-b.d)[0];
  const gfS=S('goals_shots'),gaS=S('goals_against_shots'),saves=S('saves');
  const byNet=[...rows].sort((a,b)=>b.net-a.net),best=byNet[0],worst=byNet[byNet.length-1];
  const net=anR(S('goals_shots')-S('xg')+S('xga')-S('goals_against_shots'));
  // Pozicije čez vse tekme.
  const pos=AN_POS.map(([p,label])=>{const t=k=>dbSum(rows.map(r=>r.pos[p][k]));return {p,label,shots:t('shots'),goals:t('goals'),pct:anPctN(t('goals'),t('shots')),bench:anR(100*bench[p].goal),att:anR(t('goals')-t('xg')),opp_shots:t('oshots'),opp_goals:t('ogoals'),opp_pct:anPctN(t('ogoals'),t('oshots')),opp:anR(t('xga')-t('ogoals')),save:anPctN(t('osaves'),t('oshots')),bsave:anR(100*bench[p].save)}});
  const corr=AN_FACTORS.map(([k,label])=>({k,label,r:anPearson(rows,k)})).filter(x=>x.r!=null).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
  if(!corr.some(c=>c.k===anFactor))anFactor=corr[0]?.k||null;
  const fLabel=(AN_FACTORS.find(f=>f[0]===anFactor)||[])[1]||'';
  const heat=d=>{const a=Math.min(.55,.12+Math.abs(d)*.07);return d>0?`background:rgba(23,138,111,${a})`:d<0?`background:rgba(189,95,20,${a})`:''};
  const benchName=anBenchKey()==='juniors'?'mladinke (seštevek dveh slik)':'članice';

  root.innerHTML=`${head(` · ${n} tekem`)}
  <p class="an-take">${esc(teamLabel())}: <b>${w}</b> zmag, <b>${dr}</b> remijev in <b>${l}</b> porazov, povprečna razlika <b>${anSigned(anR(S('diff')/n))}</b>. Najslabša četrtina je <b>${qName(worstQ.q)}</b> (${anSigned(anR(worstQ.d))} na tekmo). Glede na pričakovane gole je bila najboljša tekma <b>${esc(best.label)}</b> (${anSigned(best.net)}), najslabša <b>${esc(worst.label)}</b> (${anSigned(worst.net)}).</p>
  ${dbCards([['Bilanca',`${w}–${dr}–${l}`,'zmage – remiji – porazi'],['Razlika na tekmo',anSigned(anR(S('diff')/n)),`goli ${S('gf')} : ${S('ga')}`],['Uspešnost napada',anPctS(anPctN(gfS,S('shots_for')+S('errors'))),'goli / (streli + napake)'],['Uspešnost obrambe',anPctS(anR(100-100*gaS/((S('shots_against')+S('gains'))||1))),'napadi nasprotnic brez gola'],['Uspešnost strelov',anPctS(anPctN(gfS,S('shots_for'))),`${gfS} golov iz ${S('shots_for')} strelov`],['Obrambe golmank',anPctS(anPctN(saves,saves+gaS)),'obrambe / streli v okvir'],['Goli / pričakovani',`${gfS} / ${dbF(S('xg'))}`,`napad ${anSigned(anR(gfS-S('xg')))}`],['Prejeti / pričakovani',`${gaS} / ${dbF(S('xga'))}`,`obramba ${anSigned(anR(S('xga')-gaS))} · skupaj ${anSigned(net)}`]])}

  <div class="panel"><div class="panel-head"><h2>Potek tekme</h2><span class="tag">${cur.live?'vsak gol':'izid po četrtinah (Excel)'}</span></div>
    <div class="db-chips" role="group" aria-label="Tekma">${rows.map(r=>`<button class="${r.id===anGameId?'active':''}" data-an-game="${esc(r.id)}">${esc(r.label)}</button>`).join('')}</div>
    <p class="muted db-note">Razlika v golih skozi tekmo: nad črto vodi Celje, pod njo nasprotnice.</p>
    ${anAt(full,()=>anFlowChart(cur,pts))}
    ${dbCards([['Izid',`${cur.gf}:${cur.ga}`,cur.result],['Največje vodstvo',fs.lead>0?`+${fs.lead}`:'0',''],['Največji zaostanek',fs.def<0?`−${-fs.def}`:'0',''],['Menjave vodstva',fs.changes??'—',cur.live?'':'samo pri vnosu v živo'],['Najdaljša serija Celja',fs.best!=null?`${fs.best} golov`:'—',''],['Najdaljša serija nasprotnic',fs.worst!=null?`${fs.worst} golov`:'—','']])}
  </div>

  <div class="db-grid2"><div class="panel">${dbGrouped(qAvg.map((v,q)=>({label:qName(q),v:[anR(v.f),anR(v.a)]})),[{n:'Celje',c:DB_CELJE},{n:'Nasprotnice',c:DB_OPP}],'Povprečni goli po četrtinah')}</div>
  <div class="panel"><h2>Razlika po četrtinah in tekmah</h2><div class="tablescroll"><table class="table db-table"><thead><tr><th>Tekma</th>${[0,1,2,3].map(q=>`<th>${qName(q)}</th>`).join('')}<th>Izid</th></tr></thead><tbody>${[...rows].reverse().map(r=>`<tr class="db-click ${r.id===anGameId?'sel':''}" data-an-game="${esc(r.id)}"><td>${esc(r.label)}</td>${[0,1,2,3].map(q=>`<td style="${heat(r.qf[q]-r.qa[q])}">${r.qf[q]}:${r.qa[q]}</td>`).join('')}<td><b>${r.gf}:${r.ga}</b></td></tr>`).join('')}</tbody></table></div><p class="muted db-note">Zeleno: četrtino je dobilo Celje, oranžno: nasprotnice.</p></div></div>

  <div class="panel"><h2>Napad in obramba po tekmah</h2><p class="muted db-note">Vsaka pika je tekma (zelena zmaga, rumena remi, rdeča poraz). Desno je uspešnejši napad, zgoraj uspešnejša obramba.</p>
    ${anAt(full,()=>anScatter(rows,'attack_eff','defense_eff','uspešnost napada','obramba',{fmtX:v=>`${dbF(v)} %`,fmtY:v=>`${dbF(v)} %`}))}
    <div class="tablescroll"><table class="table db-table"><thead><tr><th>Tekma</th><th>Izid</th><th>Napad %</th><th>Streli %</th><th>Napake</th><th>Obramba %</th><th>Golmanke %</th><th>Dobljene</th><th>Asist.</th><th>Izklj. min</th><th>Index</th></tr></thead><tbody>${[...rows].reverse().map(r=>`<tr class="db-click" data-an-game="${esc(r.id)}"><td>${esc(r.label)}</td><td><span class="an-pill ${r.result}">${r.gf}:${r.ga}</span></td><td>${anPctS(r.attack_eff)}</td><td>${anPctS(r.shot_pct)}</td><td>${r.errors}</td><td>${anPctS(r.defense_eff)}</td><td>${anPctS(r.save_pct)}</td><td>${r.gains}</td><td>${r.assists}</td><td>${r.excl_min}</td><td>${dbF(r.team_index)}</td></tr>`).join('')}</tbody></table></div></div>

  <div class="panel"><div class="panel-head"><h2>Pričakovani in dejanski goli</h2><span class="tag">benchmark: ${benchName}</span></div>
    <p class="muted db-note">Pričakovani goli (xG): vsak strel je utežen z deležem zadetkov s svoje pozicije v benchmarku. Zeleno: Celje je zadelo več, kot bi pričakovali (goli − xG). Oranžno: nasprotnice so zadele manj od pričakovanega (xG − prejeti). Črtica je skupna ocena tekme.</p>
    ${anAt(full,()=>anHBars(byNet.map(r=>{let p=0,q=0;const part=v=>{const s=v>=0?p:q;if(v>=0)p+=v;else q+=v;return [s,s+v]};const parts=[part(r.att_diff),part(r.def_diff)];return {key:r.id,label:r.label,bold:r.id===anGameId,value:r.net,ends:parts.flat(),parts,title:`${r.label} · ${r.gf}:${r.ga}\nnapad: ${r.gf} golov, xG ${dbF(r.xg)} (${anSigned(r.att_diff)})\nobramba: ${r.ga} prejetih, xG ${dbF(r.xga)} (${anSigned(r.def_diff)})\ngolmanke: ${r.saves} obramb, pričakovanih ${dbF(r.xsaves)}`}}),{marker:true,label:'Goli nad ali pod pričakovanji po tekmah',click:'data-an-game'}))}
    <div class="tablescroll"><table class="table db-table"><thead><tr><th>Tekma</th><th>Izid</th><th>Goli</th><th>xG</th><th>Napad ±</th><th>Prejeti</th><th>xG nasp.</th><th>Obramba ±</th><th>Obrambe</th><th>Pričak. obr.</th><th>Skupaj ±</th></tr></thead><tbody>${byNet.map(r=>`<tr class="db-click ${r.id===anGameId?'sel':''}" data-an-game="${esc(r.id)}"><td>${esc(r.label)}</td><td><span class="an-pill ${r.result}">${r.gf}:${r.ga}</span></td><td>${r.goals_shots}</td><td>${dbF(r.xg)}</td><td class="${anTone(r.att_diff)}">${anSigned(r.att_diff)}</td><td>${r.goals_against_shots}</td><td>${dbF(r.xga)}</td><td class="${anTone(r.def_diff)}">${anSigned(r.def_diff)}</td><td>${r.saves}</td><td>${dbF(r.xsaves)}</td><td class="${anTone(r.net)}"><b>${anSigned(r.net)}</b></td></tr>`).join('')}</tbody></table></div>
    <p class="muted db-note">Razvrščeno od najbolj do najmanj uspešne tekme glede na pričakovanja. Benchmark ne upošteva moči nasprotnika.</p></div>

  <div class="panel"><h2>Uspešnost po pozicijah ob benchmarku</h2><div class="db-legend"><span><i style="background:${DB_CELJE}"></i>Celje</span><span><i style="background:${DB_OPP}"></i>Nasprotnice</span><span><i style="background:#8b9590"></i>benchmark</span></div>
    ${anAt(full,()=>anPosChart(pos))}
    <div class="tablescroll"><table class="table db-table"><thead><tr><th>Pozicija</th><th>Streli Celja</th><th>Goli</th><th>Delež</th><th>Benchmark</th><th>Goli − xG</th><th>Streli nasp.</th><th>Delež nasp.</th><th>xG − prejeti</th><th>Obrambe golm.</th><th>Benchmark obr.</th></tr></thead><tbody>${pos.map(r=>`<tr><td>${r.label}</td><td>${r.shots}</td><td>${r.goals}</td><td>${anPctS(r.pct)}</td><td>${anPctS(r.bench)}</td><td class="${anTone(r.att)}">${anSigned(r.att)}</td><td>${r.opp_shots}</td><td>${anPctS(r.opp_pct)}</td><td class="${anTone(r.opp)}">${anSigned(r.opp)}</td><td>${anPctS(r.save)}</td><td>${anPctS(r.bsave)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted db-note">Pri nasprotnicah je nižji delež boljši za Celje. Obrambe golmank so obrambe deljeno z vsemi streli nasprotnic s pozicije, kot v benchmarku.</p></div>

  <div class="db-grid2"><div class="panel"><h2>Kaj je povezano z izidom</h2><p class="muted db-note">Korelacija z razliko v golih (od −1 do 1), ${n} tekem. Pri malo tekmah so vrednosti le nakazane. Klik na stolpec izbere dejavnik.</p>
    ${corr.length?anAt(half,()=>anHBars(corr.map(c=>({key:c.k,label:c.label,bold:c.k===anFactor,value:c.r,ends:[0,c.r],parts:[[0,c.r,c.r>=0?DB_CELJE:DB_OPP]],title:`${c.label}: ${String(c.r).replace('.',',')}`})),{min:-1,max:1,fmt:v=>String(v).replace('.',','),label:'Korelacija dejavnikov z razliko v golih',click:'data-an-factor'})):'<p class="muted">Za korelacije so potrebne vsaj 3 tekme.</p>'}</div>
  <div class="panel"><h2>Dejavnik in razlika v golih</h2>${corr.length?`<div class="db-chips" role="group" aria-label="Dejavnik">${corr.map(c=>`<button class="${c.k===anFactor?'active':''}" data-an-factor="${c.k}">${esc(c.label)}</button>`).join('')}</div>${anAt(half,()=>anScatter(rows,anFactor,'diff',fLabel,'razlika v golih',{trend:true,zeroY:true,fmtY:v=>v>0?`+${v}`:String(v)}))}`:''}</div></div>

  <details class="panel an-def"><summary>Kako so izračunani kazalniki</summary><dl>
    <dt>Uspešnost napada</dt><dd>Goli / (streli + napake). Napad se konča s strelom ali izgubljeno žogo; aplikacija napadov ne šteje posebej, zato je to ocena.</dd>
    <dt>Uspešnost strelov</dt><dd>Goli / streli.</dd>
    <dt>Uspešnost obrambe</dt><dd>1 − prejeti goli / (streli nasprotnic + dobljene žoge Celja).</dd>
    <dt>Obrambe golmank</dt><dd>Obrambe / streli nasprotnic v okvir (obrambe in goli).</dd>
    <dt>Pričakovani goli (xG)</dt><dd>Streli s pozicije × delež zadetkov s te pozicije v benchmarku. Pričakovane obrambe: streli nasprotnic × delež obramb golmank v benchmarku.</dd>
    <dt>Skupaj ±</dt><dd>(goli − xG) + (xG nasprotnic − prejeti). Pozitivno pomeni boljšo tekmo, kot bi napovedali streli.</dd>
    <dt>Benchmark</dt><dd>All Teams Overview. Članice in ostale ekipe: slika za članice. Mladinke in kadetinje: seštevek dveh slik za mladinke. Protinapad = Fast Break, prodor = Break Through.</dd>
    <dt>Korelacija</dt><dd>Pearsonov koeficient med dejavnikom in razliko v golih. Ne pove, kaj je vzrok.</dd>
    <dt>Goli</dt><dd>Izid in razlika sta iz končnega rezultata tekme; goli iz strelov (pri xG) so seštevek zapisanih strelov.</dd>
  </dl></details>`;
  root.querySelectorAll('[data-an-game]').forEach(b=>b.addEventListener('click',()=>{anGameId=b.dataset.anGame;renderGameDash();root.querySelector('.an-svg')?.scrollIntoView?.({block:'center',behavior:'smooth'})}));
  root.querySelectorAll('[data-an-factor]').forEach(b=>b.addEventListener('click',()=>{anFactor=b.dataset.anFactor;renderGameDash()}));
}

const anRender=render;
render=function(){anRender();if(gameId)return;if(view==='adash')renderGameDash()};
if(view==='adash')render();
