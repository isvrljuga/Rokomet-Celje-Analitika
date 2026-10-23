// Izvoz »novi indeks« v obliki Excelove predloge: zavihek na tekmo (streli, prekrški, asistence, napake,
// dobljene žoge, streli skupno, golmanke, igralni čas, indeks igralk) ter skupna zavihka igralk in ekipe.
// Deluje za zapise v živo in za tekme, uvožene iz Excela (novi vir).
const XP_SHOT={'9M':'9','6M':'6','7M':'7',wing:'K',break:'PD',fast:'PT'},XP_RES={miss:'Z',save:'O',goal:'G'};
const XP_POS=['9','6','7','K','PD','PT'],XP_Q=['0-15','15-30','30-45','45-60'];
const XP_SHOT_CODES=XP_POS.flatMap(p=>['Z','O','G'].map(r=>p+r));
const XP_GROUPS={assist:['AZ','AO','AG','A7'],foul:['POA','PON','PNA','PNN'],error:['NA','NN'],gain:['DA','DN']};
const xpSum=a=>a.reduce((n,x)=>n+(Number(x)||0),0);
const xpR=x=>Math.round(x*100)/100;
const xpPct=(a,b)=>b?xpR(a/b*100):'';
const xpRatio=r=>{const m=String(r||'').match(/(\d+)\s*\/\s*(\d+)/);return m?[Number(m[1]),Number(m[2])]:[0,0]};

function xpExclusions(g){
  const ex=g.events.filter(e=>e.type==='exclusion'&&e.forTeam==='celje'&&e.forPersonType!=='bench');
  return ex.concat(g.events.filter(e=>e.type==='foul'&&e.twoMin&&['POA','PON'].includes(e.code)&&!ex.some(x=>x.person===e.person&&x.half===e.half&&Math.abs(x.minute-e.minute)<=1)).map(e=>({...e,duration:'2'})));
}

// Enoten zapis tekme: vrstice igralk po kodi in četrtini, streli nasprotnic, 7 m / 2 min, minute, vratarke.
function xpData(g){
  const rows=new Map(),opp=new Map(),fouls=new Map(),excl={},minutes={},part={},keepers=new Map();
  const add=(map,key,q,n=1,base={})=>{let r=map.get(key);if(!r)map.set(key,r={...base,q:[0,0,0,0]});r.q[q]+=n};
  const foul=(p,code)=>{const k=p+'\u0001'+code;let f=fouls.get(k);if(!f)fouls.set(k,f={person:p,code,seven:0,two:0});return f};
  let exclMin=0,benchExcl=0;
  if(g.imported){
    const s=g.imported.new;
    for(const r of s.rows)r.quarters.forEach((n,q)=>n&&add(rows,r.person+'\u0001'+r.code,q,n,{person:r.person,code:r.code}));
    for(const r of s.opponents)r.quarters.forEach((n,q)=>n&&add(opp,r.code,q,n,{code:r.code}));
    for(const f of s.fouls||[]){const x=foul(f.person,f.code);x.seven+=Number(f.seven)||0;x.two+=Number(f.twoMin)||0;if(['POA','PON'].includes(f.code)&&f.twoMin){excl[f.person]=(excl[f.person]||0)+Number(f.twoMin);exclMin+=2*Number(f.twoMin)}}
    Object.assign(minutes,s.minutes);
    for(const k of s.keepers){const [sg,st]=xpRatio(k.sevenRatio),[og,ot]=xpRatio(k.otherRatio);keepers.set(k.person,{person:k.person,min:Number(k.minutes)||0,shots:Number(k.shots)||0,goals:Number(k.conceded)||0,sg,st,og,ot})}
  }else{
    const kp=name=>{let k=keepers.get(name);if(!k)keepers.set(name,k={person:name,min:0,shots:0,goals:0,sg:0,st:0,og:0,ot:0});return k};
    for(const e of g.events){
      if(e.type==='time'){
        const raw=Math.max(0,Number(e.end)-Number(e.start)),w=raw*(e.mode==='full'||!e.mode?1:.5);
        minutes[e.person]=(minutes[e.person]||0)+w;
        if(e.mode==='attack'||e.mode==='defense'){part[e.person]=part[e.person]||{attack:0,defense:0};part[e.person][e.mode]+=raw}
        continue;
      }
      const q=evQ(e);
      if(e.type==='shot'){
        const code=(XP_SHOT[e.shot]||e.shot)+(XP_RES[e.result]||'');
        if(e.side==='celje')add(rows,e.person+'\u0001'+code,q,1,{person:e.person,code});
        else{
          add(opp,code,q,1,{code});
          if(e.result==='save'||e.result==='goal'){const k=kp(e.keeper||'Ni izbrana');k.shots++;if(e.result==='goal')k.goals++;if(e.shot==='7M'){k.st++;if(e.result==='goal')k.sg++}else{k.ot++;if(e.result==='goal')k.og++}}
        }
      }else if(['assist','foul','error','gain'].includes(e.type)&&e.person&&e.code){
        add(rows,e.person+'\u0001'+e.code,q,1,{person:e.person,code:e.code});
        if(e.type==='foul'){const f=foul(e.person,e.code);if(e.seven)f.seven++;if(e.twoMin)f.two++}
      }
    }
    for(const e of xpExclusions(g)){excl[e.person]=(excl[e.person]||0)+1;exclMin+=e.duration==='4'?4:2}
    // Izključitev klopi zmanjša možni čas ekipe, igralki, ki je šla ven, pa se ne pripiše.
    for(const e of g.events)if(e.type==='exclusion'&&e.forTeam==='celje'&&e.forPersonType==='bench'){benchExcl++;exclMin+=e.duration==='4'?4:2}
    for(const k of keepers.values())k.min=minutes[k.person]||0;
    for(const p of db().roster.keepers)if(minutes[p]&&!keepers.has(p))keepers.set(p,{person:p,min:minutes[p],shots:0,goals:0,sg:0,st:0,og:0,ot:0});
  }
  const rowList=[...rows.values()],oppList=[...opp.values()],foulList=[...fouls.values()];
  const keeperSet=new Set(db().roster.keepers),roster=[...db().roster.players,...db().roster.keepers];
  const seen=new Set([...rowList.map(r=>r.person),...Object.keys(minutes).filter(p=>minutes[p]>0),...foulList.map(f=>f.person),...Object.keys(excl)]);
  if(g.imported){for(const [p,s]of Object.entries(g.imported.new.summaries||{}))if(s&&Object.values(s).some(v=>Number(v)))seen.add(p)}
  else{for(const e of g.events)if(e.type==='blame'&&e.person)seen.add(e.person)}
  const players=[...roster.filter(p=>seen.has(p)),...[...seen].filter(p=>p&&!roster.includes(p))];
  return {g,rows:rowList,opp:oppList,fouls:foulList,excl,benchExcl,exclMin,minutes,part,keepers:[...keepers.values()],players,keeperSet,potential:Math.max(0,360-exclMin)/6};
}

const xpQ=(list,pred)=>[0,1,2,3].map(q=>xpSum(list.filter(pred).map(r=>r.q[q])));
const xpLine=(label,q)=>[label,...q,xpSum(q)];

// Razdelek po igralkah: vsaka igralka s svojimi kodami, nato seštevek po kodah in skupno.
function xpSection(d,title,codes,extra){
  const out=[[title,'',...XP_Q,'Skupno',...(extra?extra.head:[])]];
  for(const p of d.players){
    const mine=codes.filter(c=>d.rows.some(r=>r.person===p&&r.code===c)||(extra&&extra.show(p,c)));
    mine.forEach((c,i)=>{const q=xpQ(d.rows,r=>r.person===p&&r.code===c);out.push([i?'':p,c,...q,xpSum(q),...(extra?extra.cells(p,c):[])])});
  }
  out.push([]);out.push([title+' po tipu','',...XP_Q,'Skupno']);
  for(const c of codes){const q=xpQ(d.rows,r=>r.code===c);out.push(['',c,...q,xpSum(q)])}
  const all=xpQ(d.rows,r=>codes.includes(r.code));out.push(['Skupno','',...all,xpSum(all)]);
  return out;
}

function xpFouls(d){
  const f=(p,c)=>d.fouls.find(x=>x.person===p&&x.code===c)||{seven:0,two:0};
  const out=xpSection(d,'Prekrški',XP_GROUPS.foul,{head:['7M','2 Min'],show:(p,c)=>{const x=f(p,c);return x.seven||x.two},cells:(p,c)=>{const x=f(p,c);return [x.seven||'',x.two||'']}});
  const qOf=codes=>xpQ(d.rows,r=>codes.includes(r.code));
  out.push(['',...xpLine('Prekrški v obrambi (naši)',qOf(['POA','PON']))],['',...xpLine('Prekrški v napadu (nasprotnic, pridobljeni)',qOf(['PNA','PNN']))]);
  out.push([]);out.push(['7 m in 2 min po igralkah','7M obramba (dani)','7M napad (izborjeni)','2 Min obramba (naše izključitve)','2 Min napad (izborjene)']);
  const tot=[0,0,0,0];
  for(const p of d.players){
    const mine=d.fouls.filter(x=>x.person===p),v=[xpSum(mine.filter(x=>['POA','PON'].includes(x.code)).map(x=>x.seven)),xpSum(mine.filter(x=>['PNA','PNN'].includes(x.code)).map(x=>x.seven)),d.excl[p]||0,xpSum(mine.filter(x=>['PNA','PNN'].includes(x.code)).map(x=>x.two))];
    if(xpSum(v)){out.push([p,...v]);v.forEach((n,i)=>tot[i]+=n)}
  }
  if(d.benchExcl){out.push(['Klop',0,0,d.benchExcl,0]);tot[2]+=d.benchExcl}
  out.push(['Skupno',...tot]);
  return out;
}

// Streli skupno: Celje levo, nasprotnice desno, po pozicijah in skupaj, z uspešnostjo golmank.
function xpShots(d){
  const cel=c=>xpQ(d.rows,r=>r.code===c),op=c=>xpQ(d.opp,r=>r.code===c);
  const out=[['Streli skupno Celje','','','','','','','','','Streli skupno nasprotnice'],
    ['Koda',...XP_Q,'Skupno','Dogodki poz.','Obr. % golm. nasp.','Goli / streli %','Koda',...XP_Q,'Skupno','Dogodki poz.','Obr. % naših golm.','Goli / streli %','Razlika dogodki (Celje − nasp.)']];
  for(const pos of XP_POS){
    for(const r of ['Z','O','G']){
      const c=pos+r,a=cel(c),b=op(c),row=[c,...a,xpSum(a),'','','',c,...b,xpSum(b),'','',''];
      if(r==='G'){
        const ce=['Z','O','G'].map(x=>xpSum(cel(pos+x))),oe=['Z','O','G'].map(x=>xpSum(op(pos+x)));
        row.splice(6,3,xpSum(ce),xpPct(ce[1],ce[1]+ce[2]),xpPct(ce[2],xpSum(ce)));
        row.splice(15,3,xpSum(oe),xpPct(oe[1],oe[1]+oe[2]),xpPct(oe[2],xpSum(oe)));
        row.push(xpSum(ce)-xpSum(oe));
      }
      out.push(row);
    }
  }
  const tot=(list,r)=>xpQ(list,x=>x.code.endsWith(r)&&XP_SHOT_CODES.includes(x.code));
  out.push([],['Skupno','','','','','','','','','Skupno']);
  const C={},O={};
  for(const [r,label] of [['Z','Zgrešeni'],['O','Obramba'],['G','Goli']]){C[r]=tot(d.rows,r);O[r]=tot(d.opp,r);out.push([label,...C[r],xpSum(C[r]),'','','',label,...O[r],xpSum(O[r])])}
  const sumQ=o=>[0,1,2,3].map(q=>o.Z[q]+o.O[q]+o.G[q]);
  out.push(['Vsi streli',...sumQ(C),xpSum(sumQ(C)),'','','','Vsi streli',...sumQ(O),xpSum(sumQ(O))]);
  const pctQ=(o,f)=>[0,1,2,3].map(q=>f(o,q)),save=(o,q)=>xpPct(o.O[q],o.O[q]+o.G[q]),goal=(o,q)=>xpPct(o.G[q],o.Z[q]+o.O[q]+o.G[q]);
  const tS=o=>xpPct(xpSum(o.O),xpSum(o.O)+xpSum(o.G)),tG=o=>xpPct(xpSum(o.G),xpSum(sumQ(o)));
  out.push(['Obrambe golmank % (obrambe / (obrambe + goli))',...pctQ(C,save),tS(C),'','','','Obrambe naših golmank %',...pctQ(O,save),tS(O)]);
  out.push(['Goli / vsi streli % (goli / (zgrešeni + obrambe + goli))',...pctQ(C,goal),tG(C),'','','','Goli / vsi streli %',...pctQ(O,goal),tG(O)]);
  out.push([]);
  for(const [r,label] of [['Z','zgrešeni'],['O','obrambe'],['G','goli']]){const q=[0,1,2,3].map(i=>C[r][i]-O[r][i]);out.push(['Razlika '+label+' (Celje − nasprotnice)',...q,xpSum(q)])}
  const dq=[0,1,2,3].map(i=>sumQ(C)[i]-sumQ(O)[i]);out.push(['Razlika dogodki (Celje − nasprotnice)',...dq,xpSum(dq)]);
  return out;
}

function xpKeepers(d){
  const out=[['Golmanke','Čas','Streli v okvir','Prejeti goli','Obrambe','7M (goli/streli)','Ostalo (goli/streli)','Obrambe %','Obrambe brez 7M %']];
  for(const k of d.keepers){const sv=k.shots-k.goals;out.push([k.person,xpR(k.min),k.shots,k.goals,sv,k.st?`${k.sg}/${k.st}`:'',k.ot?`${k.og}/${k.ot}`:'',xpPct(sv,k.shots),xpPct(k.ot-k.og,k.ot)])}
  const s=d.keepers.reduce((a,k)=>({shots:a.shots+k.shots,goals:a.goals+k.goals,ot:a.ot+k.ot,og:a.og+k.og}),{shots:0,goals:0,ot:0,og:0});
  out.push(['Skupno','',s.shots,s.goals,s.shots-s.goals,'','',xpPct(s.shots-s.goals,s.shots),xpPct(s.ot-s.og,s.ot)]);
  return out;
}

function xpIndexRows(d){
  return d.players.map(p=>{const s=playerStats(p,[d.g]),c=s.count,m=d.minutes[p]||0,pot=d.keeperSet.has(p)?60:d.potential,share=pot?m/pot:0;
    return {p,s,c,m,share,vals:[xpR(s.indexNew),c.goal||0,c.sevenGoal||0,c.saves||0,c.miss||0,(c.sevenSave||0)+(c.sevenMiss||0),c.assist||0,c.DA||0,c.DN||0,c.NA||0,c.NN||0,c.POA||0,c.PON||0,c.PNA||0,c.PNN||0,c.blame||0,c.sevenDrawn||0,c.twoDrawn||0]}});
}
const XP_INDEX_HEAD=['Index','Goli','7M','Obrambe','Zgrešeni','Obrambe/zg 7M','Asistenca','DA','DN','NA','NN','POA','PON','PNA','PNN','Krivda','7M dobljen','2 Min dobljene'];

function xpTime(d,idx){
  const out=[['Igralni čas'],[`Možni čas igralke v polju: (360 − ${xpR(d.exclMin)} min izključitev) / 6 = ${xpR(d.potential)} min; vratarke 60 min. Minute samo v napadu ali samo v obrambi štejejo pol.`],
    ['Igralka','Čas (uteženo)','Samo napad (min)','Samo obramba (min)','% časa','Index','Index na čas']];
  for(const r of idx){if(!r.m&&!r.s.indexNew)continue;const pt=d.part[r.p];out.push([r.p,xpR(r.m),pt?xpR(pt.attack):'',pt?xpR(pt.defense):'',r.share?xpR(r.share*100):'',xpR(r.s.indexNew),r.share?xpR(r.s.indexNew/r.share):''])}
  return out;
}

function xpGameSheet(g){
  const d=xpData(g),s=matchScore(g),h=g.finalHome!==''&&g.finalHome!=null?g.finalHome:s.h,a=g.finalAway!==''&&g.finalAway!=null?g.finalAway:s.a;
  const idx=xpIndexRows(d),rows=[[`${g.date}  ${g.home||'Celje'}–${g.opponent}  ${h}:${a} (${g.firstHalfHome||0}:${g.firstHalfAway||0})`],[]];
  const block=b=>{rows.push(...b,[])};
  block(xpSection(d,'Streli',XP_SHOT_CODES));
  block(xpFouls(d));
  block(xpSection(d,'Asistence',XP_GROUPS.assist));
  block(xpSection(d,'Napake',XP_GROUPS.error));
  block(xpSection(d,'Dobljene',XP_GROUPS.gain));
  block(xpShots(d));
  block(xpKeepers(d));
  block(xpTime(d,idx));
  rows.push(['Index igralk',...XP_INDEX_HEAD,'Igralni čas','% časa','Index na čas']);
  for(const r of idx)rows.push([r.p,...r.vals,xpR(r.m),r.share?xpR(r.share*100):'',r.share?xpR(r.s.indexNew/r.share):'']);
  rows.push(['Skupno',...XP_INDEX_HEAD.map((_,i)=>xpR(xpSum(idx.map(r=>r.vals[i])))),xpR(xpSum(idx.map(r=>r.m)))]);
  return {d,idx,rows};
}

function xpSheetName(name,used){
  let base=String(name||'Tekma').replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,28)||'Tekma',n=base,i=2;
  while(used.has(n.toLowerCase()))n=`${base} ${i++}`;used.add(n.toLowerCase());return n;
}

function matchWorkbook(){
  const games=db().games,used=new Set(['skupno igralke','skupno ekipa','prekrški in ostalo']),built=games.map(g=>({g,...xpGameSheet(g)}));
  // Skupno igralke: seštevek vseh tekem, nato tabela indeksa za vsako tekmo.
  const tot=new Map();let potTotal=0;
  for(const b of built){potTotal+=b.d.potential;for(const r of b.idx){let t=tot.get(r.p);if(!t)tot.set(r.p,t={vals:r.vals.map(()=>0),m:0,keeper:b.d.keeperSet.has(r.p)});r.vals.forEach((v,i)=>t.vals[i]+=v);t.m+=r.m}}
  const players=[...new Set([...db().roster.players,...db().roster.keepers].filter(p=>tot.has(p)).concat([...tot.keys()]))];
  const sum=[['Skupno · '+teamLabel()+' · '+games.length+' tekem'],[`Možni čas igralke v polju za vse tekme: ${xpR(potTotal)} min (vsota (360 − izključitve) / 6 po tekmah); vratarke 60 min na tekmo.`],
    ['Index igralk',...XP_INDEX_HEAD,'Igralni čas','% časa','Index na čas']];
  for(const p of players){const t=tot.get(p),pot=t.keeper?60*games.length:potTotal,share=pot?t.m/pot:0;sum.push([p,...t.vals.map(xpR),xpR(t.m),share?xpR(share*100):'',share?xpR(t.vals[0]/share):''])}
  sum.push(['Skupno',...XP_INDEX_HEAD.map((_,i)=>xpR(xpSum(players.map(p=>tot.get(p).vals[i])))),xpR(xpSum(players.map(p=>tot.get(p).m)))]);
  for(const b of built){sum.push([],[`${b.g.date} · ${b.g.opponent}`],['Index igralk',...XP_INDEX_HEAD,'Igralni čas','% časa','Index na čas']);for(const r of b.idx)sum.push([r.p,...r.vals,xpR(r.m),r.share?xpR(r.share*100):'',r.share?xpR(r.s.indexNew/r.share):''])}
  // Skupno ekipa: streli in golmanke za vse tekme skupaj, nato po tekmah.
  const merged={g:null,rows:built.flatMap(b=>b.d.rows),opp:built.flatMap(b=>b.d.opp),keepers:[]};
  const km=new Map();for(const b of built)for(const k of b.d.keepers){const t=km.get(k.person)||{person:k.person,min:0,shots:0,goals:0,sg:0,st:0,og:0,ot:0};for(const f of ['min','shots','goals','sg','st','og','ot'])t[f]+=k[f];km.set(k.person,t)}
  merged.keepers=[...km.values()];
  const team=[['Skupno ekipa · '+teamLabel()],[],...xpShots(merged),[],...xpKeepers(merged)];
  for(const b of built)team.push([],[`${b.g.date} · ${b.g.opponent}`],...xpShots(b.d));
  return [{name:'Skupno igralke',rows:sum},{name:'Skupno ekipa',rows:team},...built.map(b=>({name:xpSheetName(b.g.opponent,used),rows:b.rows})),overviewElementsSheet()];
}
newWorkbook=matchWorkbook;

// Skupni pregled: delež igralnega časa in indeks na čas po istem pravilu kot v izvozu.
// Možni čas igralke v polju je vsota (360 − naše izključitve) / 6 po tekmah, vratarke 60 min na tekmo.
const xpOverviewRender=renderOverview;
renderOverview=function(){
  xpOverviewRender();
  const table=$('#view-overview table'),games=db().games;if(!table||!games.length)return;
  const pot=games.reduce((n,g)=>n+xpData(g).potential,0),keepers=new Set(db().roster.keepers);
  table.querySelector('thead tr').insertAdjacentHTML('beforeend','<th title="Igralni čas / možni čas">% časa</th><th title="Indeks / delež igralnega časa">Index na čas</th>');
  for(const tr of table.querySelectorAll('tbody tr')){
    const p=tr.cells[0].textContent.trim(),s=playerStats(p),share=s.minutes/(keepers.has(p)?60*games.length:pot||1);
    tr.insertAdjacentHTML('beforeend',`<td>${share?fmt(share*100)+' %':'—'}</td><td class="xp-itime" data-new="${share?s.indexNew/share:''}" data-old="${share?s.indexOld/share:''}">${share?fmt(s.indexNew/share):'—'}</td>`);
  }
  table.querySelector('tfoot tr')?.insertAdjacentHTML('beforeend','<td></td><td></td>');
  table.closest('.panel').insertAdjacentHTML('beforeend',`<div class="hint">Možni čas igralke v polju: ${fmt(pot)} min (vsota (360 − izključitve) / 6 po tekmah); vratarke ${60*games.length} min. % časa = igralni čas / možni čas; index na čas = index / delež časa. Minute samo v napadu ali samo v obrambi štejejo pol.</div>`);
  const upd=mode=>$$('.xp-itime').forEach(c=>{if(c.dataset[mode]!=='')c.textContent=fmt(Number(c.dataset[mode]))});
  $$('[data-index],[data-aggregate-index]').forEach(b=>b.addEventListener('click',()=>upd((b.dataset.index||b.dataset.aggregateIndex)==='old'?'old':'new')));
};
if(view==='overview')render();
