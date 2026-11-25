// Zapisi tekem brez statistike: tekme, za katere so na voljo le podatki iz uradnega zapisnika.
// Prikažejo se na zavihku Tekme pod seznamom tekem, v db().games pa NE pridejo,
// zato se ne upoštevajo v nobeni analizi, pregledu, izvozu ali klepetu.
const ZAPISI={
  juniors:[{
    title:'ŽRK Sežana – ŽRK Z’dežele',venue:'gostovanje',result:'24 : 29 (zmaga Celja)',half:'15 : 14 za Sežano',
    quarters:'7:7, 8:7, 2:6, 7:9 (Sežana : Celje)',
    shots:'Celje 29 golov iz 52 strelov (55,8 %), Sežana 24 iz 42 (57,1 %)',
    keeper:'Nika Kuri: 5 obramb od 29 strelov v okvir (17 %), 7 m 0 od 3 (v zapisniku napačno Zoja Brglez)',
    other:'7 m Celje 1 od 3 · izključitve Celje 5 (10 min), Sežana 4 · rumeni karton Zoja Verbovšek',
    scorers:[['Lenja Ripnak','7/12'],['Larissa Zukić','7/9'],['Zala Petek','5/6'],['Ajla Mehulić','4/6'],['Sarah Pilih Derča','2/8'],['Zoja Verbovšek','2/5'],['Vita Sečki','2/4'],['Zala Kuri','0/1'],['Tinkara Korošec','0/1']],
    note:'Iz uradnega zapisnika (video). Ni podatkov o pozicijah strelov, podajah, napakah in igralnem času, zato tekma ni v statistiki.'
  }]
};
function zapisiHtml(){
  const list=ZAPISI[team]||[];
  if(!list.length)return '';
  return `<div class="panel zapisi"><div class="panel-head"><h2>Zapisi brez statistike</h2><span class="tag">${list.length} ${list.length===1?'tekma':'tekme'} · ni v analizah</span></div>${list.map(z=>`
    <details class="zapis"><summary><b>${esc(z.title)}</b> <span class="muted">· ${esc(z.venue)} · ${esc(z.result)}</span></summary>
    <dl>
      <dt>Polčas</dt><dd>${esc(z.half)}</dd>
      <dt>Četrtine</dt><dd>${esc(z.quarters)}</dd>
      <dt>Streli</dt><dd>${esc(z.shots)}</dd>
      <dt>Strelke (goli/streli)</dt><dd>${z.scorers.map(([p,s])=>`${esc(p)} ${esc(s)}`).join(' · ')}</dd>
      <dt>Golmanka</dt><dd>${esc(z.keeper)}</dd>
      <dt>Ostalo</dt><dd>${esc(z.other)}</dd>
    </dl><p class="muted db-note">${esc(z.note)}</p></details>`).join('')}</div>`;
}
const zapisiRenderMatches=renderMatches;
renderMatches=function(){
  zapisiRenderMatches();
  const html=zapisiHtml();
  if(html)$('#view-matches').insertAdjacentHTML('beforeend',html);
};
if(view==='matches'&&!gameId)render();
