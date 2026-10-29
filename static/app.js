/* No external dependencies. Only committed, allowlisted public snapshots. */
'use strict';
(() => {
const area=Number(document.body.dataset.area),$=id=>document.getElementById(id);
const regionCode=new URLSearchParams(location.search).get('region');
// Arrival from an investment-review page: highlight that complex once (2026-10-29).
const query=new URLSearchParams(location.search);
const focusId=/^\d{1,8}$/.test(query.get('focus')||'')?query.get('focus'):null,fromGap=/^gap\d{1,2}$/.test(query.get('from')||'')?query.get('from'):null;
// Arrival from the full-collection search (2026-10-29 (3)): same highlight, its own label.
const findId=!focusId&&/^\d{1,8}$/.test(query.get('find')||'')?query.get('find'):null,markId=focusId||findId,markLabel=focusId?'투자 검토 단지':'검색한 단지';
let focusDone=false,lastTag=null,visible=[],allRows=null,focusNote=null;
const lane=document.body.dataset.lane||'capital',local=lane==='local_major',prefix=local?'local-':'';
for(const a of document.querySelectorAll('[data-lane-tab]'))a.setAttribute('aria-selected',String(a.dataset.laneTab===lane));
if(local){
 document.querySelector('.brand').href=`../local-${area}/`;
 for(const a of document.querySelectorAll('[data-tab]'))a.href=`../local-${a.dataset.tab}/`;
}
let snapshot=null,busy=false;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const fmt=v=>v===null?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:4});
const metric=v=>v===null?'':fmt(v);
const arrows={up:'↑',down:'↓',flat:'=',missing:''};
const descriptions={up:'현재 호가가 과거보다 높음',down:'현재 호가가 과거보다 낮음',flat:'현재 호가와 같음',missing:'비교할 현재 또는 과거 호가 없음'};
const dotDate=s=>`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
const ym=s=>`${s.slice(0,4)}.${s.slice(4,6)}`;
const obsDate=s=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit'}).format(new Date(s)).replace(/\s+/g,'').replace(/\.$/,'');
// Switching 84/59 keeps the region, the highlighted complex and the way back to the investment tab (2026-10-29 (3)).
const keep=`${focusId?`&focus=${focusId}`:''}${findId?`&find=${findId}`:''}${fromGap?`&from=${fromGap}`:''}`;
for(const a of document.querySelectorAll('[data-tab]')){
 if(Number(a.dataset.tab)===area)a.setAttribute('aria-current','page');
 if(regionCode&&/^\d{5}$/.test(regionCode))a.href=`../${prefix}${a.dataset.tab}/?region=${regionCode}${keep}`;
}
$('back-to-regions').hidden=!regionCode;
if(regionCode&&fromGap){const a=el('a','back-link invest-back','← 투자 검토로 돌아가기');a.id='back-to-invest';a.href=`../${prefix}invest/#${fromGap}`;$('back-to-regions').after(a);}
const focusMark=(r,node,label)=>{if(markId&&String(r.id)===markId){node.classList.add('is-focus');label.append(el('span','focus-badge',markLabel));}};
// Search scope is stated (2026-10-29 (3)): the first page searches only the regional leaders it shows.
$('search').placeholder=regionCode?'이 지역의 단지 검색':'이 목록(지역별 최고호가)에서 지역·단지 검색';$('search').setAttribute('aria-label',$('search').placeholder);
const fullBox=el('div','full-search');fullBox.id='full-search';fullBox.hidden=true;$('no-results').after(fullBox);
if(regionCode){$('download-all').href=`../data/${prefix}${area}-regions.csv`;$('download-all').textContent='전체 지역 원본';}
function validate(data){
 if(data.schema_version!==2||data.area!==area||!Array.isArray(data.rows)||!data.rows.length)throw Error('자료 형식·평형 확인 실패');
 if(local){
  const universe=data.scope.region_universe;
  if(data.lane!==lane||data.scope.regions!==79||!Array.isArray(universe)||universe.length!==79||new Set(universe.map(r=>r.region_code)).size!==79||!Array.isArray(data.coverage)||data.coverage.length!==79)throw Error('지방 지역 범위 확인 실패');
  const mapping=new Map(universe.map(r=>[r.region_code,r.region]));
  if(new Set(data.coverage.map(r=>r.region_code)).size!==79||data.coverage.some(r=>mapping.get(r.region_code)!==r.region)||data.rows.some(r=>mapping.get(r.region_code)!==r.region))throw Error('지방 canonical 범위 불일치');
  const sales=new Set(data.rows.filter(r=>r.sale.current!==null).map(r=>r.region_code));
  if(data.coverage.some(r=>(r.status==='AVAILABLE')!==sales.has(r.region_code)||!['AVAILABLE','NO_VALID_SALE'].includes(r.status)))throw Error('지방 coverage 불일치');
 }else if(data.lane&&data.lane!=='capital'||data.scope.regions!==69||new Set(data.rows.map(r=>r.region)).size!==69)throw Error('수도권 지역 범위 확인 실패');
 if(data.view!==(regionCode?'regions':'leaders'))throw Error('목록 종류 확인 실패');
 if(data.counts.rows!==data.rows.length||data.counts.with_metrics!==data.rows.filter(r=>r.gap_eok!==null).length||data.counts.without_metrics!==data.rows.filter(r=>r.gap_eok===null).length)throw Error('자료 집계 확인 실패');
 const keys=new Set();
 for(const r of data.rows){
  const key=`${r.region_code}:${r.id}`;if(keys.has(key))throw Error('단지 중복');keys.add(key);
  if(!r.name||!r.region||!r.id||!/^\d{5}$/.test(r.region_code)||!r.sale||!r.rent)throw Error('단지 확인 실패');
  for(const trade of ['sale','rent'])for(const k of ['current','two_weeks','four_weeks'])if(r[trade][k]!==null&&(r[trade][k]===''||!Number.isFinite(Number(r[trade][k]))||Number(r[trade][k])<=0))throw Error('유효하지 않은 호가');
  if(!regionCode&&r.sale.current===null)throw Error('최고호가 매매 결측');
  for(const trade of ['sale','rent']){
   const source=r[trade+'_source'],applied=r['applied_'+trade],ref=r[trade+'_reference'],quote=r[trade].current;
   const provenance=r[trade+'_provenance'];
   if(!provenance||provenance.source!==source||provenance.asof_month!==data.round.slice(0,6)||!Array.isArray(provenance.observation_months))throw Error('가격 provenance 누락');
   if(applied!==null&&(!Number.isFinite(Number(applied))||Number(applied)<=0))throw Error('적용가격 오류');
   if(r[trade+'_asof_month']!==data.round.slice(0,6))throw Error('적용 기준월 불일치');
   if(source==='QUOTE'){
    if(applied!==quote||quote===null||ref!==null)throw Error('호가 우선순위 불일치');
    if(provenance.count_kind!=='LISTINGS'||!Number.isInteger(provenance.count)||provenance.count<=0||provenance.observation_months.length!==1||!provenance.observed_at)throw Error('호가 관측 근거 누락');
   }else if(source==='ACTUAL'){
    if(quote!==null||!ref||applied!==ref.price_eok||!ref.months.length||ref.count<=0)throw Error('실거래 대체 근거 누락');
    if(provenance.count_kind!=='TRANSACTIONS'||provenance.count!==ref.count||JSON.stringify(provenance.observation_months)!==JSON.stringify(ref.months))throw Error('실거래 provenance 불일치');
   if(ref.months.some(m=>m<ref.window_from||m>ref.window_to)||ref.months.length>3||ref.latest_month!==ref.months[ref.months.length-1])throw Error('실거래 기간 확인 실패');
   }else if(source!=='NONE'||applied!==null||quote!==null||ref!==null)throw Error('가격 결측 상태 불일치');
   if(source==='NONE'&&(provenance.count!==0||provenance.observation_months.length))throw Error('부재 provenance 불일치');
  }
  const valid=r.applied_sale!==null&&r.applied_rent!==null;
  if(valid){
   if(r.gap_eok===null||r.rent_ratio_percent===null||r.rent_ratio_display===null||!Number.isFinite(Number(r.gap_eok))||!Number.isFinite(Number(r.rent_ratio_percent)))throw Error('지표 누락');
   if(Math.abs(Number(r.gap_eok)-(Number(r.applied_sale)-Number(r.applied_rent)))>1e-8||Math.abs(Number(r.rent_ratio_percent)-Number(r.applied_rent)/Number(r.applied_sale)*100)>1e-8)throw Error('지표 값 불일치');
   if(r.metrics_basis!==([r.sale_source,r.rent_source].includes('ACTUAL')?'MIXED_REFERENCE':'QUOTE'))throw Error('지표 출처 불일치');
  }else if(r.gap_eok!==null||r.rent_ratio_percent!==null||r.rent_ratio_display!==null||r.metrics_basis!=='UNAVAILABLE')throw Error('결측 지표 거부');
 }
}
function regionLink(r,cls,text){
 const n=el(regionCode?'span':'a',cls,text);
 if(!regionCode){n.href=`?region=${r.region_code}`;n.title=`${r.region} ${area}㎡ 수집 아파트 전체 보기`;n.classList.add('region-link');}
 return n;
}
function rentNote(r,trade='rent'){
 if(r[trade+'_source']!=='ACTUAL')return null;
 const ref=r[trade+'_reference'],n=el('span','actual-reference',`호가 없음 · 실거래 대체 강건가 · ${ym(ref.latest_month)}`);
 n.title=`국토부 ${trade==='sale'?'매매':'전세'} 실거래 강건가 · 적용 기준월 ${ym(r[trade+'_asof_month'])} · 관측월 ${ref.months.map(ym).join(', ')} · ${ref.count}건 · 최근 12개월 중 마지막 최대 3개 실거래 월평균의 중앙값 · 이월 없음`;
 return n;
}
function quoteCell(value,kind,divider=false){
 const td=el('td',`quote ${kind==='current'?'current':''}${divider?' divider':''}`);
 const badge=el('span',kind,`${kind==='current'?'':arrows[kind]+' '}${fmt(value)}`.trim());
 if(kind!=='current')badge.title=descriptions[kind];td.append(badge);return td;
}
function makeRow(r){
 const tr=el('tr');tr.dataset.id=r.id;tr.dataset.region=r.region;tr.dataset.regionCode=r.region_code;tr.dataset.rentSource=r.rent_source;tr.dataset.saleSource=r.sale_source;
 tr.append(el('td','rank',String(r.order)));
 const name=el('td','name');name.append(regionLink(r,'region',r.region),regionLink(r,'unit',r.name));
 if(r.tie_count>1)name.append(el('span','review',`지역 내 동률 ${r.tie_count}개 단지`));
 if(r.manual_review)name.append(el('span','review','소수매물·평형 역전 수동확인'));
 focusMark(r,tr,name);tr.append(name);
 for(const trade of ['sale','rent'])for(const key of ['current','two_weeks','four_weeks']){
  const td=quoteCell(key==='current'?r['applied_'+trade]:r[trade][key],key==='current'?'current':r.changes[trade][key],trade==='rent'&&key==='current');
  if(key==='current'){const note=rentNote(r,trade);if(note)td.append(note);}
  tr.append(td);
 }
 for(const [cls,value] of [['gap',metric(r.gap_eok)],['ratio',r.rent_ratio_display===null?'':r.rent_ratio_display]]){
  const td=el('td',`metric ${cls==='gap'?'divider ':''}${cls}`);td.append(el('span','metric-value',value));
  if(r.metrics_basis==='MIXED_REFERENCE'){td.append(el('small','mixed-note','참고치'));td.title='적용 매매·전세 중 실거래 강건가가 포함된 참고치';}
  tr.append(td);
 }
 return tr;
}
function makeCard(r){
 const card=el('article','unit-card');card.dataset.id=r.id;card.dataset.region=r.region;card.dataset.rentSource=r.rent_source;card.dataset.saleSource=r.sale_source;
 const header=el('div','card-heading'),identity=el('div');
 header.append(el('span','card-rank',String(r.order)));identity.append(regionLink(r,'region',r.region),regionLink(r,'unit',r.name));
 if(r.tie_count>1)identity.append(el('span','review',`지역 내 동률 ${r.tie_count}개 단지`));
 if(r.manual_review)identity.append(el('span','review','소수매물·평형 역전 수동확인'));
 focusMark(r,card,identity);header.append(identity);card.append(header);const grid=el('div','current-grid');
 for(const [label,value,unit,cls] of [['매매',fmt(r.applied_sale),r.applied_sale===null?'':'억','sale'],['전세',fmt(r.applied_rent),r.applied_rent===null?'':'억','rent'],['현재 갭',metric(r.gap_eok),r.gap_eok===null?'':'억','gap'],['전세가율',r.rent_ratio_display===null?'':r.rent_ratio_display,r.rent_ratio_display===null?'':'%','ratio']]){
  const box=el('div'),strong=el('strong',cls,value);box.append(el('label','',label));if(unit)strong.append(el('small','',unit));box.append(strong);
  if(['sale','rent'].includes(cls)){const note=rentNote(r,cls);if(note)box.append(note);}
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
 $('result-count').textContent=`${new Set(rows.map(r=>r.region)).size}지역 · ${rows.length}단지 / 전체 ${snapshot.counts.rows}단지${sort!=='sale'?' · 순위 숫자는 매매가 순위':''}`;
 // CSV = exactly the rows and order on screen; the static file stays as the full original (2026-10-29 (3)).
 visible=rows;$('download-csv').replaceChildren(document.createTextNode(`현재 결과 CSV · ${rows.length}행 `),el('span','','↗'));$('download-csv').lastChild.setAttribute('aria-hidden','true');
 if(!regionCode){const show=!rows.length&&q.length>0;fullBox.hidden=!show;if(show)fullPrompt($('search').value.trim());}
 document.body.dataset.ready='true';document.body.dataset.visible=String(rows.length);
 if(markId&&!focusDone){const target=[...document.querySelectorAll('.is-focus')].find(n=>n.offsetParent!==null);if(target){focusDone=true;target.scrollIntoView({block:'center'});}}
 if(focusId&&!focusNote&&!snapshot.rows.some(r=>String(r.id)===focusId)){
  focusNote=el('p','table-help focus-missing',`투자 검토에서 고른 단지가 이 ${area}㎡ 목록에는 없습니다. ${area===84?59:84}㎡ 목록을 확인해 주세요.`);focusNote.id='focus-missing';
  ($('back-to-invest')||$('back-to-regions')).after(focusNote);
 }
}
// Full-collection search (2026-10-29 (3)): only when the leaders list has no match; loads the region file on demand
// and shows names with links to the region page (prices are shown there, after that page's full validation).
function fullPrompt(text){
 const btn=el('button','full-search-button',`전체 수집 단지에서 "${text}" 찾기`);btn.type='button';btn.addEventListener('click',()=>fullSearch(text));
 fullBox.replaceChildren(btn);
}
async function fullSearch(text){
 const norm=s=>s.replace(/\s/g,'').toLocaleLowerCase('ko-KR'),q=norm(text);
 fullBox.replaceChildren(el('p','table-help','전체 수집 단지를 불러오는 중입니다.'));
 try{
  if(!allRows){
   const response=await fetch(`../data/${prefix}${area}-regions.json`,{cache:'no-cache',signal:AbortSignal.timeout(60000)});
   if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();
   if(data.schema_version!==2||data.area!==area||data.view!=='regions'||!Array.isArray(data.rows))throw Error('형식');
   allRows=data.rows.filter(r=>r&&r.name&&r.region&&/^\d{5}$/.test(r.region_code)&&/^\d{1,8}$/.test(String(r.id))).map(r=>({id:String(r.id),name:r.name,region:r.region,code:r.region_code}));
  }
  const hits=allRows.filter(r=>norm(`${r.region}${r.name}`).includes(q));
  const box=document.createDocumentFragment();box.append(el('p','table-help',hits.length?`전체 수집 단지 ${allRows.length.toLocaleString('ko-KR')}곳 중 ${hits.length}곳이 맞습니다${hits.length>30?' (앞의 30곳만 표시)':''}. 누르면 그 지역 목록에서 단지를 강조합니다.`:`전체 수집 단지 ${allRows.length.toLocaleString('ko-KR')}곳에서도 찾지 못했습니다.`));
  const list=el('ul','full-search-list');for(const r of hits.slice(0,30)){const li=el('li'),a=el('a','region-link',`${r.region} · ${r.name}`);a.href=`?region=${r.code}&find=${encodeURIComponent(r.id)}`;li.append(a);list.append(li);}
  if(hits.length)box.append(list);fullBox.replaceChildren(box);
 }catch(error){fullBox.replaceChildren(el('p','table-help','전체 수집 단지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));}
}
function apply(data){
 snapshot=data;const first=data.rows[0]||{name:'이 평형 수집 단지 없음',region:data.selected_region,sale:{current:null}};
 if(local){
  const select=$('region'),previous=select.value;select.replaceChildren(new Option('전체 지역','all'));
  for(const name of [...new Set(data.scope.region_universe.map(r=>r.region.split(' ')[0]))].sort())select.add(new Option(name,name));
  select.value=[...select.options].some(o=>o.value===previous)?previous:'all';
  const missing=data.coverage.filter(r=>r.status!=='AVAILABLE');
  $('coverage-notice').replaceChildren(document.createTextNode(`수집 79지역 · 유효 매매 ${79-missing.length}지역 · 미선정 ${missing.length}지역: `));
  for(const r of missing){const a=el('a','region-link',r.region+' (유효 매매호가 없음)');a.href=`?region=${r.region_code}`;$('coverage-notice').append(a,document.createTextNode(' · '));}
  $('coverage-notice').hidden=false;
  $('history-notice').textContent=['two_weeks','four_weeks'].filter(k=>data.history[k].status!=='COMMITTED_VERIFIED').map(k=>`${dotDate(data.dates[k])}: ${data.history[k].reason}`).join(' / ');$('history-notice').hidden=!$('history-notice').textContent;
 }
 if(regionCode){
  $('list-title').textContent=`${first.region} ${area}㎡ 전체 가격순`;
  document.title=`엔비 · ${first.region} ${area}㎡ 전체 가격순`;
 }
 $('region-count').replaceChildren(document.createTextNode(regionCode?'1':String(data.scope.regions)),el('small','','곳'));
 for(const [id,value] of [['row-count',data.counts.rows],['metric-count',data.counts.with_metrics],['missing-count',data.counts.without_metrics]])$(id).replaceChildren(document.createTextNode(String(value)),el('small','','단지'));
 $('round-label').textContent=`확정 회차 ${dotDate(data.round)} · 비교 ${dotDate(data.dates.two_weeks)} / ${dotDate(data.dates.four_weeks)}`;
 $('observed-label').textContent=`현재 호가 실제 관측 ${obsDate(data.observed_from)}–${obsDate(data.observed_to)} KST · 단위 억 원`;
 const replaced=data.rows.filter(r=>r.rent_source==='ACTUAL').length,saleReplaced=data.rows.filter(r=>r.sale_source==='ACTUAL').length;
 $('rent-summary').textContent=`매매·전세 각각 호가 우선 · 호가 없으면 실거래 강건가 대체: 매매 ${saleReplaced} / 전세 ${replaced}단지 · 사용 가능 기간 ${ym(data.rent_policy.window_from)}–${ym(data.rent_policy.window_to)} · 실거래 원천 ${ym(data.rent_policy.source_through)}까지 · 최고호가는 대체가격 제외${local?' · 지방 실거래는 설명용 MATCH_HOLD (identity 인증·모델/매수 승인 아님)':''}`;
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
async function load(force=false){
 if(busy)return;busy=true;$('refresh').disabled=true;
 try{
  if(regionCode&&!/^\d{5}$/.test(regionCode))throw Error('유효하지 않은 지역 코드');
  const file=regionCode?`${prefix}${area}-regions.json`:`${prefix}${area}.json`;
  // 2026-10-29 (3): one fixed URL revalidated with the server (ETag) instead of a new URL every 5 minutes, so an
  // unchanged publication (the 4-5MB region file included) is not downloaded or re-validated again. The button forces it.
  const response=await fetch(`../data/${file}${force?`?t=${Date.now()}`:''}`,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const tag=response.headers.get('ETag')||response.headers.get('Last-Modified');
  if(!force&&snapshot&&tag&&tag===lastTag)return;
  let data=await response.json();validate(data);
  if(regionCode){
   const rows=data.rows.filter(r=>r.region_code===regionCode);const selected=data.scope.region_universe?.find(r=>r.region_code===regionCode);if(!rows.length&&!selected)throw Error('수집 범위에 없는 지역');
   data={...data,selected_region:selected?.region,rows,counts:{rows:rows.length,with_metrics:rows.filter(r=>r.gap_eok!==null).length,without_metrics:rows.filter(r=>r.gap_eok===null).length}};
  }
  apply(data);lastTag=tag;
 }catch(error){
  $('connection').textContent=snapshot?'갱신 확인 실패 · 기존 확정 자료 유지':'자료 확인 실패';
  $('error').textContent=snapshot?'새 발행 확인에 실패해 기존 확정 자료를 유지합니다. 잠시 후 지금 확인을 눌러주세요.':'자료를 불러오지 못했습니다. 지역 코드·네트워크를 확인하거나 지역별 최고호가로 돌아가 주세요.';
  $('error').hidden=false;document.body.dataset.error='true';
 }finally{busy=false;$('refresh').disabled=false;}
}
$('download-csv').addEventListener('click',event=>{
 if(!snapshot)return;event.preventDefault();
 const filtered=visible.length!==snapshot.rows.length||$('sort').value!=='sale';
 const header=['지역','단지','평형','순위','매매현재','매매2주','매매4주','적용전세','전세2주','전세4주','갭','전세가율','전세출처','실거래기준월','실거래관측월','실거래건수','지표기준','적용매매','매매출처','매매적용기준월','매매실거래기준월','매매실거래관측월','매매실거래건수','전세적용기준월','전세현재호가','매매관측월','매매근거건수','매매건수종류','전세관측월','전세근거건수','전세건수종류'];
 const lines=[header,...visible.map(r=>[r.region,r.name,area,r.order,r.sale.current,r.sale.two_weeks,r.sale.four_weeks,r.applied_rent,r.rent.two_weeks,r.rent.four_weeks,r.gap_eok,r.rent_ratio_percent,r.rent_source,r.rent_reference?.latest_month,r.rent_reference?.months.join(' / '),r.rent_reference?.count,r.metrics_basis,r.applied_sale,r.sale_source,r.sale_asof_month,r.sale_reference?.latest_month,r.sale_reference?.months.join(' / '),r.sale_reference?.count,r.rent_asof_month,r.rent.current,...['sale','rent'].flatMap(t=>[r[t+'_provenance'].observation_months.join(','),r[t+'_provenance'].count,r[t+'_provenance'].count_kind])])];
 const csv=lines.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})),a=el('a');a.href=url;a.download=`${regionCode?(snapshot.rows[0]?.region||snapshot.selected_region):`${local?'지방':'수도권'}_지역별최고호가`}_${area}_${snapshot.round}${filtered?'_현재결과':''}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('search').addEventListener('input',renderRows);$('region').addEventListener('change',renderRows);$('sort').addEventListener('change',renderRows);$('refresh').addEventListener('click',()=>load(true));
load();setInterval(()=>{if(!document.hidden)load();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
