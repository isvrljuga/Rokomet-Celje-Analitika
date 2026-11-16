// Analiza igralk in analiza ekipe: preglednici po zgledu Excelove analize (stari indeks), razširjeni s podatki novega indeksa.
// Vsi podatki pridejo iz xpData (export.js) in playerStats (app.js), zato veljajo za vnose v živo in uvožene tekme.
const DB_POS=[['9','9M'],['K','Krilo'],['6','6M'],['PD','Prodor'],['PT','Protinapad'],['7','7M']],DB_RES=[['Z','zgrešeni'],['O','obramba'],['G','gol']];
const DB_ASSIST=[['AZ','Podaja – zgrešeni'],['AO','Podaja – obramba'],['AG','Podaja – gol'],['A7','Podaja – 7M']];
const DB_CELJE='#178a6f',DB_OPP='#bd5f14',DB_NEG='#b54238';
const DB_W={G:1.4,'7G':.7,O:-.2,Z:-.4,'7O':-.5,'7Z':-.5,AZ:1,AO:1,AG:1,A7:1,DA:.7,DN:.2,NA:-.4,NN:-.7,POA:.4,PON:.2,PNA:.2,PNN:.1};
let dbPlayer=null,dbGameId='all';

const dbSum=a=>a.reduce((n,x)=>n+(Number(x)||0),0);
const dbF=x=>fmt(Math.round((Number(x)||0)*10)/10);
const dbPct=(a,b)=>b?`${fmt(Math.round(a/b*1000)/10)} %`:'—';
const dbDate=d=>{const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${Number(m[3])}. ${Number(m[2])}.`:d};
const dbW=code=>/^7[ZOG]$/.test(code)?DB_W[code]:/^(9|6|K|PD|PT)[ZOG]$/.test(code)?DB_W[code.slice(-1)]:DB_W[code]||0;
const dbQ=(rows,pred)=>[0,1,2,3].map(q=>dbSum(rows.filter(pred).map(r=>r.q[q])));
const dbRow=(label,q,extra=[],cls='')=>`<tr class="${cls}"><td>${label}</td>${q.map(v=>`<td>${v||v===0?(typeof v==='number'?dbF(v):v):''}</td>`).join('')}<td><b>${typeof dbSum(q)==='number'?dbF(dbSum(q)):''}</b></td>${extra.map(v=>`<td>${v}</td>`).join('')}</tr>`;
const dbHead=(first,extra=[])=>`<thead><tr><th>${first}</th>${qName(0)?[0,1,2,3].map(q=>`<th>${qName(q)}</th>`).join(''):''}<th>Skupno</th>${extra.map(x=>`<th>${x}</th>`).join('')}</tr></thead>`;
const dbTable=(first,body,extra=[])=>`<div class="tablescroll"><table class="table db-table">${dbHead(first,extra)}<tbody>${body}</tbody></table></div>`;
function dbScore(g){const s=matchScore(g),h=g.finalHome!==''&&g.finalHome!=null?Number(g.finalHome):s.h,a=g.finalAway!==''&&g.finalAway!=null?Number(g.finalAway):s.a;return {h,a}}
function dbGames(){return [...db().games].sort((a,b)=>String(a.date).localeCompare(String(b.date)))}
function dbSelected(){const all=dbGames();if(dbGameId!=='all'&&!all.some(g=>g.id===dbGameId))dbGameId='all';return dbGameId==='all'?all:all.filter(g=>g.id===dbGameId)}
function dbMerge(games){const data=games.map(g=>({g,d:xpData(g)}));return {data,rows:data.flatMap(x=>x.d.rows),opp:data.flatMap(x=>x.d.opp),fouls:data.flatMap(x=>x.d.fouls),pot:dbSum(data.map(x=>x.d.potential))}}
// Index po četrtinah: vnosi v živo iz zapisov, uvožene tekme iz vrstic Excela (krivda in 7 m dobljen tam nimata četrtine).
function dbQIndex(p,g,d){
  if(!g.imported){const s=playerStats(p,[g]);if(Array.isArray(s.qidx)&&s.qidx.every(x=>x!=null))return s.qidx}
  return [0,1,2,3].map(q=>dbSum(d.rows.filter(r=>r.person===p).map(r=>dbW(r.code)*r.q[q])));
}
function dbGameChips(){
  const games=dbGames();
  return `<div class="db-chips" role="group" aria-label="Tekma"><button class="${dbGameId==='all'?'active':''}" data-db-game="all">Vse tekme</button>${games.map(g=>`<button class="${dbGameId===g.id?'active':''}" data-db-game="${esc(g.id)}">${esc(dbDate(g.date))} ${esc(g.opponent)}</button>`).join('')}</div>`;
}
function dbCards(items){return `<div class="cards db-cards">${items.map(([l,v,e])=>`<div class="card stat"><div class="label">${l}</div><strong>${v}</strong>${e?`<em>${e}</em>`:''}</div>`).join('')}</div>`}

// Navpični stolpci; pri negativnih vrednostih je ničla dvignjena in stolpec gre navzdol.
function dbBars(items,title,{pct=false}={}){
  if(!items.length)return '';
  const H=150,vals=items.map(i=>i.v),pos=Math.max(0,...vals),neg=Math.max(0,...vals.map(v=>-v)),range=(pos+neg)||1,zero=neg/range*H;
  return `<div class="db-chart"><p class="db-ctitle">${title}</p><div class="db-plot" style="height:${H}px">${neg?`<div class="db-zero" style="bottom:${zero}px"></div>`:''}${items.map(i=>{const h=Math.abs(i.v)/range*H,neg=i.v<0;return `<div class="db-col" title="${esc(i.label)}: ${pct?dbF(i.v)+' %':dbF(i.v)}"><div class="db-bar ${neg?'neg':''}" style="${neg?`bottom:${zero-h}px`:`bottom:${zero}px`};height:${Math.max(h,i.v?2:0)}px;background:${i.c||(neg?DB_NEG:DB_CELJE)}"></div></div>`}).join('')}</div><div class="db-xl">${items.map(i=>`<span>${esc(i.short||i.label)}</span>`).join('')}</div></div>`;
}
function dbGrouped(groups,series,title){
  const H=150,max=Math.max(1,...groups.flatMap(g=>g.v));
  return `<div class="db-chart"><p class="db-ctitle">${title}</p><div class="db-legend">${series.map(s=>`<span><i style="background:${s.c}"></i>${s.n}</span>`).join('')}</div><div class="db-plot" style="height:${H}px">${groups.map(g=>`<div class="db-col grp">${g.v.map((v,i)=>`<div class="db-gbar" title="${esc(series[i].n)} · ${esc(g.label)}: ${dbF(v)}"><span>${dbF(v)}</span><div style="height:${Math.max(v/max*(H-18),v?2:0)}px;background:${series[i].c}"></div></div>`).join('')}</div>`).join('')}</div><div class="db-xl">${groups.map(g=>`<span>${esc(g.label)}</span>`).join('')}</div></div>`;
}

// Tabele, skupne za igralko in ekipo.
function dbShotTable(rows,first){
  let body='';
  for(const [p,lab] of DB_POS){for(const [r,rl] of DB_RES)body+=dbRow(`${lab} – ${rl}`,dbQ(rows,x=>x.code===p+r),[],r==='G'?'db-good':'')}
  const tot=r=>dbQ(rows,x=>/^(9|6|7|K|PD|PT)[ZOG]$/.test(x.code)&&x.code.endsWith(r));
  body+=`<tr class="db-sub"><td colspan="6">Skupno</td></tr>`+dbRow('Zgrešeni',tot('Z'))+dbRow('Obramba',tot('O'))+dbRow('Goli',tot('G'),[],'db-good');
  return dbTable(first,body);
}
function dbPosSummary(rows,opp){
  const t=(list,p,r)=>dbSum(dbQ(list,x=>x.code===p+r));
  return `<div class="tablescroll"><table class="table db-table"><thead><tr><th>Pozicija</th><th>Streli Celje</th><th>Goli</th><th>% golov</th><th>% obramb nasp. golmank</th><th>Streli nasprotnic</th><th>Goli</th><th>% golov</th><th>% obramb naših golmank</th><th>Razlika strelov</th></tr></thead><tbody>${DB_POS.map(([p,lab])=>{
    const cz=t(rows,p,'Z'),co=t(rows,p,'O'),cg=t(rows,p,'G'),oz=t(opp,p,'Z'),oo=t(opp,p,'O'),og=t(opp,p,'G');
    return `<tr><td>${lab}</td><td>${cz+co+cg}</td><td>${cg}</td><td>${dbPct(cg,cz+co+cg)}</td><td>${dbPct(co,co+cg)}</td><td>${oz+oo+og}</td><td>${og}</td><td>${dbPct(og,oz+oo+og)}</td><td>${dbPct(oo,oo+og)}</td><td>${cz+co+cg-(oz+oo+og)}</td></tr>`}).join('')}</tbody></table></div>`;
}
function dbActionTables(rows,fouls,filterPerson){
  const r=filterPerson?rows.filter(x=>x.person===filterPerson):rows,f=filterPerson?fouls.filter(x=>x.person===filterPerson):fouls,c=k=>dbQ(r,x=>x.code===k);
  const sum=k=>dbSum(f.filter(x=>k.includes(x.code)).map(x=>x.seven)),two=k=>dbSum(f.filter(x=>k.includes(x.code)).map(x=>x.two));
  const assist=DB_ASSIST.map(([k,l])=>dbRow(l,c(k),[],k==='AG'?'db-good':'')).join('')+dbRow('Skupno',dbQ(r,x=>['AZ','AO','AG','A7'].includes(x.code)),[],'db-sub2');
  const foul=dbRow('Narejeni (v obrambi) – aktivni POA',c('POA'),[sum(['POA'])||'',two(['POA'])||''])+dbRow('Narejeni (v obrambi) – neaktivni PON',c('PON'),[sum(['PON'])||'',two(['PON'])||''])+dbRow('Prekrški narejeni',dbQ(r,x=>['POA','PON'].includes(x.code)),[sum(['POA','PON']),two(['POA','PON'])],'db-sub2')
    +dbRow('Nad igralko (pridobljeni) – aktivni PNA',c('PNA'),[sum(['PNA'])||'',two(['PNA'])||''],'db-good')+dbRow('Nad igralko (pridobljeni) – neaktivni PNN',c('PNN'),[sum(['PNN'])||'',two(['PNN'])||''],'db-good')+dbRow('Prekrški nad',dbQ(r,x=>['PNA','PNN'].includes(x.code)),[sum(['PNA','PNN']),two(['PNA','PNN'])],'db-sub2');
  const err=dbRow('Aktivne napake NA',c('NA'))+dbRow('Neaktivne napake NN',c('NN'))+dbRow('Napake',dbQ(r,x=>['NA','NN'].includes(x.code)),[],'db-sub2');
  const gain=dbRow('Aktivno dobljene DA',c('DA'),[],'db-good')+dbRow('Neaktivno dobljene DN',c('DN'))+dbRow('Dobljene',dbQ(r,x=>['DA','DN'].includes(x.code)),[],'db-sub2');
  return `<div class="db-grid2"><div class="panel"><h2>Podaje (asistence)</h2>${dbTable('Tip',assist)}</div><div class="panel"><h2>Prekrški</h2>${dbTable('Tip',foul,['7 m','2 min'])}<p class="muted db-note">7 m in 2 min sta za celo tekmo (pri narejenih prekrških dana, pri pridobljenih izborjena).</p></div><div class="panel"><h2>Napake</h2>${dbTable('Tip',err)}</div><div class="panel"><h2>Dobljene žoge</h2>${dbTable('Tip',gain)}</div></div>`;
}

// ---------- Analiza igralk ----------
function dbPlayerList(games){
  const names=[...new Set([...db().roster.players,...db().roster.keepers,...games.flatMap(g=>xpData(g).players)])];
  return names.map(p=>({p,s:playerStats(p,games)})).filter(x=>x.s.indexNew||x.s.minutes||dbSum(Object.values(x.s.count))).sort((a,b)=>b.s.indexNew-a.s.indexNew);
}
function renderPlayerDash(){
  const root=$('#view-pdash'),all=dbGames(),games=dbSelected(),list=dbPlayerList(all);
  if(!list.length){root.innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()}</p><h1>Analiza igralk</h1><p>Ko bodo zapisane tekme z akcijami igralk, se tu prikaže analiza.</p></div></div>`;return}
  if(!list.some(x=>x.p===dbPlayer))dbPlayer=list[0].p;
  const p=dbPlayer,keeper=db().roster.keepers.includes(p),M=dbMerge(games),s=playerStats(p,games),c=s.count,played=gamesPlayed(p,games);
  const potential=keeper?60*games.length:M.pot,share=potential?s.minutes/potential:0;
  const myRows=M.rows.filter(r=>r.person===p),shot=r=>dbSum(dbQ(myRows,x=>/^(9|6|7|K|PD|PT)[ZOG]$/.test(x.code)&&x.code.endsWith(r)));
  const goals=shot('G'),shots=goals+shot('O')+shot('Z'),teamGoals=dbSum(dbQ(M.rows,x=>/^(9|6|7|K|PD|PT)G$/.test(x.code)));
  const teamIndex=dbSum(dbPlayerList(games).map(x=>x.s.indexNew));
  const perGame=all.map(g=>{const d=xpData(g),x=playerStats(p,[g]);return {g,d,x}}).filter(o=>o.x.minutes||o.x.indexNew||o.d.players.includes(p));
  const qIdx=[0,1,2,3].map(q=>dbSum(M.data.map(({g,d})=>dbQIndex(p,g,d)[q])));
  root.innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()} · ${games.length===all.length?`vse tekme (${all.length})`:`tekma ${esc(dbDate(games[0].date))} ${esc(games[0].opponent)}`}</p><h1>Analiza igralk</h1><p>Izberi igralko in tekmo. Vrstica v tabeli »Po tekmah« odpre podrobnosti te tekme.</p></div></div>
  <div class="db-chips" role="group" aria-label="Igralka">${list.map(x=>`<button class="${x.p===p?'active':''}" data-db-player="${esc(x.p)}">${esc(x.p)}</button>`).join('')}</div>
  ${dbGameChips()}
  ${dbCards([['Index',dbF(s.indexNew),`${dbPct(s.indexNew,teamIndex)} indexa ekipe`],['Index/tekmo',played?dbF(s.indexNew/played):'—',`${played} tekem z igralnim časom`],['Index na čas',share?dbF(s.indexNew/share):'—',`${dbPct(s.minutes,potential)} možnega časa`],['Igralni čas',`${dbF(s.minutes)} min`,keeper?'vratarka, 60 min na tekmo':'polovični čas šteje pol'],['Goli',`${goals}`,`${dbPct(goals,teamGoals)} golov ekipe · 7 m: ${c.sevenGoal||0}`],['Uspešnost strelov',dbPct(goals,shots),`${goals} od ${shots} strelov`],['Asistence',`${c.assist||0}`,`7 m dobljen: ${c.sevenDrawn||0} · 2 min dobljene: ${c.twoDrawn||0}`],['Krivda',`${c.blame||0}`,`izključitve 2 min: ${c.twoOwn||0}`]])}
  ${games.length>1?`<div class="panel">${dbBars(perGame.map(o=>({label:`${dbDate(o.g.date)} ${o.g.opponent}`,short:o.g.opponent.slice(0,8),v:o.x.indexNew})),`Index po tekmah · ${esc(p)}`)}</div>`:''}
  <div class="panel"><div class="panel-head"><h2>Po tekmah</h2><span class="tag">tapni vrstico za podrobnosti</span></div><div class="tablescroll"><table class="table db-table"><thead><tr><th>Tekma</th><th>Rezultat</th><th>Min.</th><th>% časa</th><th>Index</th><th>Index na čas</th><th>Goli</th><th>7 m</th><th>Streli</th><th>% golov</th><th>Asist.</th><th>DA</th><th>DN</th><th>NA</th><th>NN</th><th>POA</th><th>PON</th><th>PNA</th><th>PNN</th><th>Krivda</th><th>7 m dob.</th><th>2 min dob.</th></tr></thead><tbody>${perGame.map(({g,d,x})=>{const k=x.count,r=d.rows.filter(y=>y.person===p),sh=t=>dbSum(dbQ(r,y=>/^(9|6|7|K|PD|PT)[ZOG]$/.test(y.code)&&y.code.endsWith(t))),gg=sh('G'),ss=gg+sh('O')+sh('Z'),pot=keeper?60:d.potential,sc=dbScore(g);
    return `<tr class="db-click ${dbGameId===g.id?'sel':''}" data-db-game="${esc(g.id)}"><td>${esc(dbDate(g.date))} ${esc(g.opponent)}</td><td>${sc.h}:${sc.a}</td><td>${dbF(x.minutes)}</td><td>${dbPct(x.minutes,pot)}</td><td><b>${dbF(x.indexNew)}</b></td><td>${x.minutes&&pot?dbF(x.indexNew/(x.minutes/pot)):'—'}</td><td>${k.goal||0}</td><td>${k.sevenGoal||0}</td><td>${ss}</td><td>${dbPct(gg,ss)}</td><td>${k.assist||0}</td><td>${k.DA||0}</td><td>${k.DN||0}</td><td>${k.NA||0}</td><td>${k.NN||0}</td><td>${k.POA||0}</td><td>${k.PON||0}</td><td>${k.PNA||0}</td><td>${k.PNN||0}</td><td>${k.blame||0}</td><td>${k.sevenDrawn||0}</td><td>${k.twoDrawn||0}</td></tr>`}).join('')}</tbody></table></div></div>
  <div class="db-grid2"><div class="panel"><h2>Goli in streli po četrtinah</h2>${dbShotTable(myRows,'Strel')}</div>
  <div class="panel"><h2>Index po četrtinah</h2>${dbTable('',dbRow('Index',qIdx))}<p class="muted db-note">${Math.abs(dbSum(qIdx)-s.indexNew)>.05?`Index ${dbF(s.indexNew)}: od tega ${dbF(s.indexNew-dbSum(qIdx))} brez četrtine (krivda in dobljeni 7 m pri tekmah, uvoženih iz Excela).`:'Index po četrtinah iz zapisanih akcij.'}</p>
  <h2 style="margin-top:18px">Igralni čas po četrtinah</h2>${dbTable('',dbRow('Minute',[0,1,2,3].map(q=>dbSum(games.filter(g=>!g.imported).map(g=>minutes(g,p,q))))))}<p class="muted db-note">${games.some(g=>g.imported)?'Uvožene tekme imajo samo skupne minute, brez četrtin.':'Minute samo v napadu ali samo v obrambi štejejo pol.'}</p></div></div>
  ${dbActionTables(M.rows,M.fouls,p)}`;
  dbBind(root);
}

// ---------- Analiza ekipe ----------
function renderTeamDash(){
  const root=$('#view-tdash'),all=dbGames(),games=dbSelected();
  if(!all.length){root.innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()}</p><h1>Analiza ekipe</h1><p>Ni še zapisanih tekem.</p></div></div>`;return}
  const M=dbMerge(games),tot=(list,r)=>dbQ(list,x=>/^(9|6|7|K|PD|PT)[ZOG]$/.test(x.code)&&x.code.endsWith(r));
  const C={Z:tot(M.rows,'Z'),O:tot(M.rows,'O'),G:tot(M.rows,'G')},O={Z:tot(M.opp,'Z'),O:tot(M.opp,'O'),G:tot(M.opp,'G')};
  const S=o=>[0,1,2,3].map(q=>o.Z[q]+o.O[q]+o.G[q]);
  let w=0,dr=0,l=0,gf=0,ga=0;for(const g of games){const s=dbScore(g);gf+=s.h;ga+=s.a;if(s.h>s.a)w++;else if(s.h<s.a)l++;else dr++}
  const sumAll=all.map(g=>{const d=xpData(g),q=[0,1,2,3].map(i=>dbSum(d.players.map(p=>dbQIndex(p,g,d)[i]))),idx=dbSum(d.players.map(p=>playerStats(p,[g]).indexNew)),oo=dbSum(d.opp.filter(x=>x.code.endsWith('O')).map(x=>dbSum(x.q))),og=dbSum(d.opp.filter(x=>x.code.endsWith('G')).map(x=>dbSum(x.q)));return {g,d,q,idx,save:oo+og?oo/(oo+og)*100:0,oo,og}});
  const sel=sumAll.filter(x=>games.includes(x.g)),teamQ=[0,1,2,3].map(i=>dbSum(sel.map(x=>x.q[i]))),teamIdx=dbSum(sel.map(x=>x.idx));
  const keepers=new Map();for(const {d} of M.data)for(const k of d.keepers){const t=keepers.get(k.person)||{p:k.person,min:0,shots:0,goals:0,st:0,sg:0};t.min+=k.min;t.shots+=k.shots;t.goals+=k.goals;t.st+=k.st;t.sg+=k.sg;keepers.set(k.person,t)}
  const diff=(a,b)=>[0,1,2,3].map(i=>a[i]-b[i]);
  root.innerHTML=`<div class="head"><div><p class="eyebrow">${teamLabel()} · ${games.length===all.length?`vse tekme (${all.length})`:`tekma ${esc(dbDate(games[0].date))} ${esc(games[0].opponent)}`}</p><h1>Analiza ekipe</h1><p>Izberi tekmo za podrobnosti ali vrstico v tabeli »Tekme«.</p></div></div>
  ${dbGameChips()}
  ${dbCards([['Tekme',`${games.length}`,`${w} zmag · ${dr} neodločeno · ${l} porazov`],['Goli',`${gf} : ${ga}`,`razlika ${gf-ga>0?'+':''}${gf-ga}`],['Uspešnost strelov Celje',dbPct(dbSum(C.G),dbSum(S(C))),`${dbSum(C.G)} golov iz ${dbSum(S(C))} strelov`],['Uspešnost strelov nasprotnic',dbPct(dbSum(O.G),dbSum(S(O))),`${dbSum(O.G)} golov iz ${dbSum(S(O))} strelov`],['Obrambe naših golmank',dbPct(dbSum(O.O),dbSum(O.O)+dbSum(O.G)),'obrambe / streli v okvir'],['Obrambe nasprotnih golmank',dbPct(dbSum(C.O),dbSum(C.O)+dbSum(C.G)),'obrambe / streli v okvir'],['Index ekipe',dbF(teamIdx),`na tekmo ${games.length?dbF(teamIdx/games.length):'—'}`],['Asistence',`${dbSum(dbQ(M.rows,x=>['AZ','AO','AG','A7'].includes(x.code)))}`,`napake ${dbSum(dbQ(M.rows,x=>['NA','NN'].includes(x.code)))} · dobljene ${dbSum(dbQ(M.rows,x=>['DA','DN'].includes(x.code)))}`]])}
  <div class="db-grid2"><div class="panel">${dbGrouped([0,1,2,3].map(q=>({label:qName(q),v:[C.G[q],O.G[q]]})),[{n:'Celje',c:DB_CELJE},{n:'Nasprotnice',c:DB_OPP}],'Goli po četrtinah')}</div>
  <div class="panel">${all.length>1?dbBars(sumAll.map(x=>({label:`${dbDate(x.g.date)} ${x.g.opponent}`,short:x.g.opponent.slice(0,8),v:x.save})),'Obrambe naših golmank po tekmah (%)',{pct:true}):dbBars([0,1,2,3].map(q=>({label:qName(q),v:teamQ[q]})),'Index ekipe po četrtinah')}</div></div>
  <div class="panel"><h2>Streli po pozicijah</h2>${dbPosSummary(M.rows,M.opp)}</div>
  <div class="db-grid2"><div class="panel"><h2>Streli skupno Celje</h2>${dbShotTable(M.rows,'Strel')}</div><div class="panel"><h2>Streli skupno nasprotnice</h2>${dbShotTable(M.opp,'Strel')}</div></div>
  <div class="panel"><h2>Primerjava po četrtinah</h2>${dbTable('',dbRow('Streli Celje',S(C))+dbRow('Goli Celje',C.G,[],'db-good')+dbRow('Streli nasprotnic',S(O))+dbRow('Goli nasprotnic',O.G)
    +`<tr><td>% golov Celje</td>${[0,1,2,3].map(q=>`<td>${dbPct(C.G[q],S(C)[q])}</td>`).join('')}<td><b>${dbPct(dbSum(C.G),dbSum(S(C)))}</b></td></tr><tr><td>% obramb naših golmank</td>${[0,1,2,3].map(q=>`<td>${dbPct(O.O[q],O.O[q]+O.G[q])}</td>`).join('')}<td><b>${dbPct(dbSum(O.O),dbSum(O.O)+dbSum(O.G))}</b></td></tr>`
    +dbRow('Razlika zgrešeni',diff(C.Z,O.Z))+dbRow('Razlika obrambe',diff(C.O,O.O))+dbRow('Razlika goli',diff(C.G,O.G),[],'db-good')+dbRow('Razlika dogodki',diff(S(C),S(O)))+dbRow('Index ekipe',teamQ,[],'db-sub2'))}</div>
  ${dbActionTables(M.rows,M.fouls,null)}
  <div class="db-grid2"><div class="panel"><h2>Golmanke</h2><div class="tablescroll"><table class="table db-table"><thead><tr><th>Golmanka</th><th>Min.</th><th>Streli v okvir</th><th>Obrambe</th><th>% obramb</th><th>7 m (obr./streli)</th></tr></thead><tbody>${[...keepers.values()].map(k=>`<tr><td>${esc(k.p)}</td><td>${dbF(k.min)}</td><td>${k.shots}</td><td>${k.shots-k.goals}</td><td>${dbPct(k.shots-k.goals,k.shots)}</td><td>${k.st?`${k.st-k.sg}/${k.st}`:'—'}</td></tr>`).join('')||'<tr><td colspan="6">Ni podatkov.</td></tr>'}</tbody></table></div></div>
  <div class="panel"><h2>Igralke</h2><div class="tablescroll"><table class="table db-table"><thead><tr><th>Igralka</th><th>Index</th><th>Goli</th><th>Asist.</th><th>Napake</th><th>Dobljene</th><th>Krivda</th></tr></thead><tbody>${dbPlayerList(games).map(x=>`<tr class="db-click" data-db-open-player="${esc(x.p)}"><td>${esc(x.p)}</td><td><b>${dbF(x.s.indexNew)}</b></td><td>${(x.s.count.goal||0)+(x.s.count.sevenGoal||0)}</td><td>${x.s.count.assist||0}</td><td>${(x.s.count.NA||0)+(x.s.count.NN||0)}</td><td>${(x.s.count.DA||0)+(x.s.count.DN||0)}</td><td>${x.s.count.blame||0}</td></tr>`).join('')}</tbody></table></div></div></div>
  <div class="panel"><div class="panel-head"><h2>Tekme · index po četrtinah in obrambe golmank</h2><span class="tag">tapni vrstico za tekmo</span></div><div class="tablescroll"><table class="table db-table"><thead><tr><th>Tekma</th><th>Rezultat</th>${[0,1,2,3].map(q=>`<th>${qName(q)}</th>`).join('')}<th>Index</th><th>% obramb</th></tr></thead><tbody>${sumAll.map(x=>{const sc=dbScore(x.g);return `<tr class="db-click ${dbGameId===x.g.id?'sel':''}" data-db-game="${esc(x.g.id)}"><td>${esc(dbDate(x.g.date))} ${esc(x.g.opponent)}</td><td class="${sc.h>sc.a?'db-win':sc.h<sc.a?'db-loss':''}">${sc.h}:${sc.a}</td>${x.q.map(v=>`<td>${dbF(v)}</td>`).join('')}<td><b>${dbF(x.idx)}</b></td><td>${dbPct(x.oo,x.oo+x.og)}</td></tr>`}).join('')}</tbody><tfoot><tr class="total"><td>Indeks kot ekipa</td><td></td>${[0,1,2,3].map(i=>`<td>${dbF(dbSum(sumAll.map(x=>x.q[i])))}</td>`).join('')}<td>${dbF(dbSum(sumAll.map(x=>x.idx)))}</td><td>${dbPct(dbSum(sumAll.map(x=>x.oo)),dbSum(sumAll.map(x=>x.oo+x.og)))}</td></tr><tr><td>Povprečno na tekmo</td><td></td>${[0,1,2,3].map(i=>`<td>${dbF(dbSum(sumAll.map(x=>x.q[i]))/all.length)}</td>`).join('')}<td><b>${dbF(dbSum(sumAll.map(x=>x.idx))/all.length)}</b></td><td></td></tr></tfoot></table></div><p class="muted db-note">Index po četrtinah pri uvoženih tekmah je izračunan iz akcij po četrtinah; krivda in dobljeni 7 m tam nimata četrtine, zato je stolpec Index lahko drugačen od seštevka četrtin.</p></div>
  <div class="panel"><h2>Sestava indexa</h2><div class="tablescroll"><table class="table db-table"><thead><tr><th>Akcija</th><th>Utež</th></tr></thead><tbody>${[['Gol iz igre','1,4'],['Gol 7 m','0,7'],['Strel – obramba','−0,2'],['Strel – zgrešen','−0,4'],['7 m – obramba ali zgrešen','−0,5'],['Asistenca (vse)','1'],['Dobljena žoga aktivno / neaktivno','0,7 / 0,2'],['Napaka aktivna / neaktivna','−0,4 / −0,7'],['Prekršek v obrambi POA / PON','0,4 / 0,2'],['Pridobljen prekršek PNA / PNN','0,2 / 0,1'],['Dobljen 7 m','0,7'],['Krivda za gol','−0,5']].map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div></div>`;
  dbBind(root);
}

function dbBind(root){
  root.querySelectorAll('[data-db-player]').forEach(b=>b.onclick=()=>{dbPlayer=b.dataset.dbPlayer;renderPlayerDash()});
  root.querySelectorAll('[data-db-game]').forEach(b=>b.onclick=()=>{const id=b.dataset.dbGame;dbGameId=dbGameId===id&&id!=='all'?'all':id;render();root.scrollIntoView?.({block:'start'})});
  root.querySelectorAll('[data-db-open-player]').forEach(b=>b.onclick=()=>{dbPlayer=b.dataset.dbOpenPlayer;setView('pdash')});
}
const dbRender=render;
render=function(){dbRender();if(gameId)return;if(view==='pdash')renderPlayerDash();if(view==='tdash')renderTeamDash()};
if(view==='pdash'||view==='tdash')render();
