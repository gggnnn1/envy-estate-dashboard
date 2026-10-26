/* No external dependencies. Public, allowlisted quote snapshots only. */
'use strict';
(() => {
const area=Number(document.body.dataset.area), $=id=>document.getElementById(id);
let snapshot=null, busy=false, signature='';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const fmt=v=>v===null?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:4});
const metric=v=>v===null?'':fmt(v);
const arrows={up:'↑',down:'↓',flat:'=',missing:''};
const descriptions={up:'현재 호가가 과거보다 높음',down:'현재 호가가 과거보다 낮음',flat:'현재 호가와 같음',missing:'비교할 현재 또는 과거 호가 없음'};
const dotDate=s=>`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
const obsDate=s=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).format(new Date(s)).replace(/\s+/g,'').replace(/\.$/,'');
for(const a of document.querySelectorAll('[data-tab]'))if(Number(a.dataset.tab)===area)a.setAttribute('aria-current','page');

function validate(data){
 if(data.schema_version!==1||data.area!==area||!Array.isArray(data.rows)||!data.rows.length||data.scope.regions!==69||new Set(data.rows.map(r=>r.region)).size!==69)throw Error('자료 형식·평형·지역 범위 확인 실패');
 if(data.counts.rows!==data.rows.length||data.counts.with_metrics!==data.rows.filter(r=>r.gap_eok!==null).length)throw Error('자료 집계 확인 실패');
 for(const r of data.rows){
  if(!r.name||!r.region||!r.id||!r.sale||!r.rent||r.sale.current===null||r.sale.current===''||!Number.isFinite(Number(r.sale.current))||Number(r.sale.current)<=0)throw Error('유효하지 않은 매매호가');
  if(r.rent.current===null&&(r.gap_eok!==null||r.rent_ratio_percent!==null||r.rent_ratio_display!==null))throw Error('결측 대체자료 거부');
  if(r.rent.current!==null&&(r.gap_eok===null||r.rent_ratio_percent===null||r.rent_ratio_display===null))throw Error('현재 지표 누락');
 }
}
function quoteCell(value,kind,divider=false){
 const td=el('td',`quote ${kind==='current'?'current':''}${divider?' divider':''}`);
 const badge=el('span',kind,`${kind==='current'?'':arrows[kind]+' '}${fmt(value)}`.trim());
 if(kind!=='current')badge.title=descriptions[kind];
 td.append(badge);return td;
}
function makeRow(r){
 const tr=el('tr');tr.dataset.id=r.id;tr.dataset.region=r.region;
 tr.append(el('td','rank',String(r.order)));
 const name=el('td','name');name.append(el('span','region',r.region),el('span','unit',r.name));
 if(r.tie_count>1)name.append(el('span','review',`지역 내 동률 ${r.tie_count}개 단지`));
 if(r.manual_review)name.append(el('span','review','소수매물·평형 역전 수동확인'));
 tr.append(name);
 for(const trade of ['sale','rent'])for(const key of ['current','two_weeks','four_weeks'])tr.append(quoteCell(r[trade][key],key==='current'?'current':r.changes[trade][key],trade==='rent'&&key==='current'));
 tr.append(el('td','metric divider gap',metric(r.gap_eok)),el('td','metric ratio',r.rent_ratio_display===null?'':r.rent_ratio_display));
 return tr;
}
function makeCard(r){
 const card=el('article','unit-card');card.dataset.id=r.id;card.dataset.region=r.region;
 const header=el('div','card-heading'),identity=el('div');
 header.append(el('span','card-rank',String(r.order)));identity.append(el('span','region',r.region),el('h3','',r.name));
 if(r.tie_count>1)identity.append(el('span','review',`지역 내 동률 ${r.tie_count}개 단지`));
 if(r.manual_review)identity.append(el('span','review','소수매물·평형 역전 수동확인'));
 header.append(identity);card.append(header);
 const grid=el('div','current-grid');
 for(const [label,value,unit,cls] of [['매매',fmt(r.sale.current),'억','sale'],['전세',fmt(r.rent.current),r.rent.current===null?'':'억','rent'],['현재 갭',metric(r.gap_eok),r.gap_eok===null?'':'억','gap'],['전세가율',r.rent_ratio_display===null?'':r.rent_ratio_display,r.rent_ratio_display===null?'':'%','ratio']]){
  const box=el('div'),strong=el('strong',cls,value);box.append(el('label','',label));if(unit)strong.append(el('small','',unit));box.append(strong);grid.append(box);
 }
 card.append(grid);
 const history=el('div','history-grid');
 for(const [label,key] of [['2주 전','two_weeks'],['4주 전','four_weeks']]){
  history.append(el('span','',label));
  for(const [trade,title] of [['sale','매매'],['rent','전세']]){
   const d=r.changes[trade][key],n=el('div',`history-value ${d}`);n.title=descriptions[d];n.append(el('em','',title),el('span','',`${arrows[d]} ${fmt(r[trade][key])}`.trim()));history.append(n);
  }
 }
 card.append(history);return card;
}
function renderRows(){
 if(!snapshot)return;
 const q=$('search').value.trim().replace(/\s/g,'').toLocaleLowerCase('ko-KR'),region=$('region').value,sort=$('sort').value;
 const rows=snapshot.rows.filter(r=>(region==='all'||r.region.startsWith(region))&&`${r.region}${r.name}`.replace(/\s/g,'').toLocaleLowerCase('ko-KR').includes(q));
 if(sort!=='sale')rows.sort((a,b)=>{
  const key=sort==='gap'?'gap_eok':'rent_ratio_percent',av=a[key],bv=b[key];
  if(av===null)return bv===null?a.order-b.order:1;if(bv===null)return -1;
  return (sort==='gap'?Number(av)-Number(bv):Number(bv)-Number(av))||a.order-b.order;
 });
 const desktop=document.createDocumentFragment(),mobile=document.createDocumentFragment();
 for(const r of rows){desktop.append(makeRow(r));mobile.append(makeCard(r));}
 $('rows').replaceChildren(desktop);$('mobile-cards').replaceChildren(mobile);
 $('no-results').hidden=rows.length!==0;
 $('result-count').textContent=`${new Set(rows.map(r=>r.region)).size}지역 · ${rows.length}단지 / 전체 ${snapshot.counts.rows}단지`;
 document.body.dataset.ready='true';document.body.dataset.visible=String(rows.length);
}
function apply(data){
 snapshot=data;
 $('top-price').textContent=fmt(data.rows[0].sale.current);
 $('top-name').textContent=data.rows[0].name;$('top-region').textContent=data.rows[0].region;
 for(const [id,value] of [['row-count',data.counts.rows],['metric-count',data.counts.with_metrics],['missing-count',data.counts.without_metrics]]){const n=$(id);n.replaceChildren(document.createTextNode(String(value)),el('small','', '단지'));}
 $('round-label').textContent=`확정 회차 ${dotDate(data.round)} · 비교 ${dotDate(data.dates.two_weeks)} / ${dotDate(data.dates.four_weeks)}`;
 $('observed-label').textContent=`현재 호가 실제 관측 ${obsDate(data.observed_from)}–${obsDate(data.observed_to)} KST · 단위 억 원`;
 $('connection').textContent='확정 자료 · 검증 통과';
 const age=Date.now()-new Date(data.observed_to).getTime();
 if(age>21*24*60*60*1000){$('error').textContent='최근 관측으로부터 3주 이상 지난 확정 자료입니다. 표시된 회차·관측일을 확인해 주세요.';$('error').hidden=false;}else $('error').hidden=true;
 renderRows();
}
async function load(){
 if(busy)return;busy=true;$('refresh').disabled=true;
 try{
  const response=await fetch(`../data/${area}.json?v=${Math.floor(Date.now()/300000)}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();validate(data);
  const next=JSON.stringify(data);
  if(next!==signature){signature=next;apply(data);}else if(snapshot){apply(snapshot);}
 }catch(error){
  $('connection').textContent=snapshot?'갱신 확인 실패 · 기존 확정 자료 유지':'자료 확인 실패';
  $('error').textContent=snapshot?'새 발행 확인에 실패했습니다. 기존 확정 회차를 유지합니다. 잠시 후 지금 확인을 눌러주세요.':'자료를 불러오지 못했습니다. 네트워크를 확인한 뒤 지금 확인을 눌러주세요.';
  $('error').hidden=false;document.body.dataset.error='true';
 }finally{busy=false;$('refresh').disabled=false;}
}
$('search').addEventListener('input',renderRows);$('region').addEventListener('change',renderRows);$('sort').addEventListener('change',renderRows);$('refresh').addEventListener('click',load);
load();setInterval(()=>{if(!document.hidden)load();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
