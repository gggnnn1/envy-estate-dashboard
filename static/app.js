/* No external dependencies. Only committed, allowlisted public snapshots. */
'use strict';
(() => {
const area=Number(document.body.dataset.area),$=id=>document.getElementById(id);
const regionCode=new URLSearchParams(location.search).get('region');
let snapshot=null,busy=false;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const fmt=v=>v===null?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:4});
const metric=v=>v===null?'':fmt(v);
const arrows={up:'↑',down:'↓',flat:'=',missing:''};
const descriptions={up:'현재 호가가 과거보다 높음',down:'현재 호가가 과거보다 낮음',flat:'현재 호가와 같음',missing:'비교할 현재 또는 과거 호가 없음'};
const dotDate=s=>`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
const ym=s=>`${s.slice(0,4)}.${s.slice(4,6)}`;
const obsDate=s=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).format(new Date(s)).replace(/\s+/g,'').replace(/\.$/,'');
for(const a of document.querySelectorAll('[data-tab]')){
 if(Number(a.dataset.tab)===area)a.setAttribute('aria-current','page');
 if(regionCode&&/^\d{5}$/.test(regionCode))a.href=`../${a.dataset.tab}/?region=${regionCode}`;
}
$('back-to-regions').hidden=!regionCode;
function validate(data){
 if(data.schema_version!==2||data.area!==area||!Array.isArray(data.rows)||!data.rows.length||data.scope.regions!==69||new Set(data.rows.map(r=>r.region)).size!==69)throw Error('자료 형식·평형·지역 범위 확인 실패');
 if(data.view!==(regionCode?'regions':'leaders'))throw Error('목록 종류 확인 실패');
 if(data.counts.rows!==data.rows.length||data.counts.with_metrics!==data.rows.filter(r=>r.gap_eok!==null).length||data.counts.without_metrics!==data.rows.filter(r=>r.gap_eok===null).length)throw Error('자료 집계 확인 실패');
 const keys=new Set();
 for(const r of data.rows){
  const key=`${r.region_code}:${r.id}`;if(keys.has(key))throw Error('단지 중복');keys.add(key);
  if(!r.name||!r.region||!r.id||!/^\d{5}$/.test(r.region_code)||!r.sale||!r.rent)throw Error('단지 확인 실패');
  for(const trade of ['sale','rent'])for(const k of ['current','two_weeks','four_weeks'])if(r[trade][k]!==null&&(r[trade][k]===''||!Number.isFinite(Number(r[trade][k]))||Number(r[trade][k])<=0))throw Error('유효하지 않은 호가');
  if(!regionCode&&r.sale.current===null)throw Error('최고호가 매매 결측');
  if(r.rent_source==='QUOTE'){
   if(r.applied_rent!==r.rent.current||r.rent.current===null||r.rent_reference!==null)throw Error('전세호가 우선순위 불일치');
  }else if(r.rent_source==='ACTUAL'){
   if(r.rent.current!==null||!r.rent_reference||r.applied_rent!==r.rent_reference.price_eok||!r.rent_reference.months.length||r.rent_reference.count<=0)throw Error('실거래 대체 근거 누락');
   const ref=r.rent_reference;
   if(ref.months.some(m=>m<ref.window_from||m>ref.window_to)||ref.months.length>3||ref.latest_month!==ref.months[ref.months.length-1])throw Error('실거래 기간 확인 실패');
  }else if(r.rent_source!=='NONE'||r.applied_rent!==null||r.rent.current!==null||r.rent_reference!==null)throw Error('전세 결측 상태 불일치');
  const valid=r.sale.current!==null&&r.applied_rent!==null;
  if(valid){
   if(r.gap_eok===null||r.rent_ratio_percent===null||r.rent_ratio_display===null||!Number.isFinite(Number(r.gap_eok))||!Number.isFinite(Number(r.rent_ratio_percent)))throw Error('지표 누락');
   if(Math.abs(Number(r.gap_eok)-(Number(r.sale.current)-Number(r.applied_rent)))>1e-8||Math.abs(Number(r.rent_ratio_percent)-Number(r.applied_rent)/Number(r.sale.current)*100)>1e-8)throw Error('지표 값 불일치');
   if(r.metrics_basis!==(r.rent_source==='ACTUAL'?'MIXED_REFERENCE':'QUOTE'))throw Error('지표 출처 불일치');
  }else if(r.gap_eok!==null||r.rent_ratio_percent!==null||r.rent_ratio_display!==null||r.metrics_basis!=='UNAVAILABLE')throw Error('결측 지표 거부');
 }
}
function regionLink(r,cls,text){
 const n=el(regionCode?'span':'a',cls,text);
 if(!regionCode){n.href=`?region=${r.region_code}`;n.title=`${r.region} ${area}㎡ 수집 아파트 전체 보기`;n.classList.add('region-link');}
 return n;
}
function rentNote(r){
 if(r.rent_source!=='ACTUAL')return null;
 const ref=r.rent_reference,n=el('span','actual-reference',`실거래 대체 · ${ym(ref.latest_month)}`);
 n.title=`국토부 전세 실거래 강건가 · 관측월 ${ref.months.map(ym).join(', ')} · ${ref.count}건 · 최근 12개월 중 마지막 최대 3개 실거래 월평균의 중앙값 · 이월 없음`;
 return n;
}
function quoteCell(value,kind,divider=false){
 const td=el('td',`quote ${kind==='current'?'current':''}${divider?' divider':''}`);
 const badge=el('span',kind,`${kind==='current'?'':arrows[kind]+' '}${fmt(value)}`.trim());
 if(kind!=='current')badge.title=descriptions[kind];td.append(badge);return td;
}
function makeRow(r){
 const tr=el('tr');tr.dataset.id=r.id;tr.dataset.region=r.region;tr.dataset.regionCode=r.region_code;tr.dataset.rentSource=r.rent_source;
 tr.append(el('td','rank',String(r.order)));
 const name=el('td','name');name.append(regionLink(r,'region',r.region),regionLink(r,'unit',r.name));
 if(r.tie_count>1)name.append(el('span','review',`지역 내 동률 ${r.tie_count}개 단지`));
 if(r.manual_review)name.append(el('span','review','소수매물·평형 역전 수동확인'));
 tr.append(name);
 for(const trade of ['sale','rent'])for(const key of ['current','two_weeks','four_weeks']){
  const td=quoteCell(trade==='rent'&&key==='current'?r.applied_rent:r[trade][key],key==='current'?'current':r.changes[trade][key],trade==='rent'&&key==='current');
  if(trade==='rent'&&key==='current'){const note=rentNote(r);if(note)td.append(note);}
  tr.append(td);
 }
 for(const [cls,value] of [['gap',metric(r.gap_eok)],['ratio',r.rent_ratio_display===null?'':r.rent_ratio_display]]){
  const td=el('td',`metric ${cls==='gap'?'divider ':''}${cls}`);td.append(el('span','metric-value',value));
  if(r.metrics_basis==='MIXED_REFERENCE'){td.append(el('small','mixed-note','참고치'));td.title='현재 매매호가와 전세 실거래 강건가를 혼합한 참고치';}
  tr.append(td);
 }
 return tr;
}
function makeCard(r){
 const card=el('article','unit-card');card.dataset.id=r.id;card.dataset.region=r.region;card.dataset.rentSource=r.rent_source;
 const header=el('div','card-heading'),identity=el('div');
 header.append(el('span','card-rank',String(r.order)));identity.append(regionLink(r,'region',r.region),regionLink(r,'unit',r.name));
 if(r.tie_count>1)identity.append(el('span','review',`지역 내 동률 ${r.tie_count}개 단지`));
 if(r.manual_review)identity.append(el('span','review','소수매물·평형 역전 수동확인'));
 header.append(identity);card.append(header);const grid=el('div','current-grid');
 for(const [label,value,unit,cls] of [['매매',fmt(r.sale.current),r.sale.current===null?'':'억','sale'],['전세',fmt(r.applied_rent),r.applied_rent===null?'':'억','rent'],['현재 갭',metric(r.gap_eok),r.gap_eok===null?'':'억','gap'],['전세가율',r.rent_ratio_display===null?'':r.rent_ratio_display,r.rent_ratio_display===null?'':'%','ratio']]){
  const box=el('div'),strong=el('strong',cls,value);box.append(el('label','',label));if(unit)strong.append(el('small','',unit));box.append(strong);
  if(cls==='rent'){const note=rentNote(r);if(note)box.append(note);}
  if(['gap','ratio'].includes(cls)&&r.metrics_basis==='MIXED_REFERENCE')box.append(el('small','mixed-note','실거래 혼합 참고치'));
  grid.append(box);
 }
 card.append(grid);const history=el('div','history-grid');
 for(const [label,key] of [['2주 전','two_weeks'],['4주 전','four_weeks']]){
  history.append(el('span','',label));for(const [trade,title] of [['sale','매매'],['rent','전세']]){
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
 const desktop=document.createDocumentFragment(),mobile=document.createDocumentFragment();for(const r of rows){desktop.append(makeRow(r));mobile.append(makeCard(r));}
 $('rows').replaceChildren(desktop);$('mobile-cards').replaceChildren(mobile);$('no-results').hidden=rows.length!==0;
 $('result-count').textContent=`${new Set(rows.map(r=>r.region)).size}지역 · ${rows.length}단지 / 전체 ${snapshot.counts.rows}단지`;
 document.body.dataset.ready='true';document.body.dataset.visible=String(rows.length);
}
function apply(data){
 snapshot=data;const first=data.rows[0];
 $('top-price').textContent=fmt(first.sale.current);$('top-name').textContent=first.name;$('top-region').textContent=first.region;
 if(regionCode){
  $('title').textContent=`${first.region} ${area}㎡`;document.querySelector('.intro').textContent='수집 아파트 전체 · 매매가격 높은 순 · 호가 없는 단지도 마지막에 표시';
  $('list-title').textContent=`${first.region} ${area}㎡ 전체 가격순`;
  document.querySelector('.price-note').textContent='이 지역 수집 단지 중 가장 높은 최저 매매호가';
  document.title=`엔비 · ${first.region} ${area}㎡ 전체 가격순`;
 }
 $('region-count').replaceChildren(document.createTextNode(regionCode?'1':'69'),el('small','','곳'));
 for(const [id,value] of [['row-count',data.counts.rows],['metric-count',data.counts.with_metrics],['missing-count',data.counts.without_metrics]])$(id).replaceChildren(document.createTextNode(String(value)),el('small','','단지'));
 $('round-label').textContent=`확정 회차 ${dotDate(data.round)} · 비교 ${dotDate(data.dates.two_weeks)} / ${dotDate(data.dates.four_weeks)}`;
 $('observed-label').textContent=`현재 호가 실제 관측 ${obsDate(data.observed_from)}–${obsDate(data.observed_to)} KST · 단위 억 원`;
 const replaced=data.rows.filter(r=>r.rent_source==='ACTUAL').length;
 $('rent-summary').textContent=`전세호가 우선 · 실거래 강건가 대체 ${replaced}단지 · 사용 가능 기간 ${ym(data.rent_policy.window_from)}–${ym(data.rent_policy.window_to)} · 실거래 원천 ${ym(data.rent_policy.source_through)}까지`;
 const policy=data.collection_policy,notices=[];
 if(policy){
  const exclusions=policy.excluded.filter(r=>!regionCode||r.region_code===regionCode);
  const exceptions=policy.mixed_use_exceptions.filter(r=>!regionCode||r.region_code===regionCode);
  const pending=new Set(policy.pending_inclusions.map(r=>r.region_code+':'+r.id));
  if(exclusions.length)notices.push(exclusions.map(r=>r.name).join(' · ')+' 제외');
  for(const r of exceptions)notices.push(r.name+' 포함 예외'+(pending.has(r.region_code+':'+r.id)?' · 이번 확정 회차 미수집, 다음 수도권 수집 대상':' · 주상복합 제외 규칙의 단지별 예외'));
 }
 $('collection-policy').textContent=notices.join(' / ');$('collection-policy').hidden=!notices.length;
 $('connection').textContent='확정 자료 · 검증 통과';document.body.dataset.error='false';
 const old=Date.now()-new Date(data.observed_to).getTime()>21*24*60*60*1000;
 $('error').hidden=!old;if(old)$('error').textContent='최근 관측으로부터 3주 이상 지난 자료입니다. 회차·관측일을 확인해 주세요.';
 renderRows();
}
async function load(){
 if(busy)return;busy=true;$('refresh').disabled=true;
 try{
  if(regionCode&&!/^\d{5}$/.test(regionCode))throw Error('유효하지 않은 지역 코드');
  const file=regionCode?`${area}-regions.json`:`${area}.json`;
  const response=await fetch(`../data/${file}?v=${Math.floor(Date.now()/300000)}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('HTTP '+response.status);let data=await response.json();validate(data);
  if(regionCode){
   const rows=data.rows.filter(r=>r.region_code===regionCode);if(!rows.length)throw Error('수집 범위에 없는 지역');
   data={...data,rows,counts:{rows:rows.length,with_metrics:rows.filter(r=>r.gap_eok!==null).length,without_metrics:rows.filter(r=>r.gap_eok===null).length}};
  }
  apply(data);
 }catch(error){
  $('connection').textContent=snapshot?'갱신 확인 실패 · 기존 확정 자료 유지':'자료 확인 실패';
  $('error').textContent=snapshot?'새 발행 확인에 실패해 기존 확정 자료를 유지합니다. 잠시 후 지금 확인을 눌러주세요.':'자료를 불러오지 못했습니다. 지역 코드·네트워크를 확인하거나 지역별 최고호가로 돌아가 주세요.';
  $('error').hidden=false;document.body.dataset.error='true';
 }finally{busy=false;$('refresh').disabled=false;}
}
$('download-csv').addEventListener('click',event=>{
 if(!regionCode||!snapshot)return;event.preventDefault();
 const header=['지역','단지','평형','순위','매매현재','매매2주','매매4주','적용전세','전세2주','전세4주','갭','전세가율','전세출처','실거래기준월','실거래관측월','실거래건수','지표기준'];
 const lines=[header,...snapshot.rows.map(r=>[r.region,r.name,area,r.order,r.sale.current,r.sale.two_weeks,r.sale.four_weeks,r.applied_rent,r.rent.two_weeks,r.rent.four_weeks,r.gap_eok,r.rent_ratio_percent,r.rent_source,r.rent_reference?.latest_month,r.rent_reference?.months.join(' / '),r.rent_reference?.count,r.metrics_basis])];
 const csv=lines.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),a=el('a');a.href=url;a.download=`${snapshot.rows[0].region}_${area}_${snapshot.round}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('search').addEventListener('input',renderRows);$('region').addEventListener('change',renderRows);$('sort').addEventListener('change',renderRows);$('refresh').addEventListener('click',load);
load();setInterval(()=>{if(!document.hidden)load();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
