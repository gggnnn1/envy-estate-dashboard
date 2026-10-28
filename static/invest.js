/* Investment review: renders receipt-verified model outputs only. No external dependencies. */
'use strict';
(() => {
const $=id=>document.getElementById(id);
const lane=document.body.dataset.lane,dataName=document.body.dataset.data,capital=lane==='capital';
const ORDER=capital?[4,8,12]:[1,2,3];
const MODEL=capital?'C_XGBOOST_LONG_HISTORY_20260926':'local_v7.1';
const MODEL_LABEL=capital?'C 모델(XGBoost 장기이력, 2026-09-26 동결) · 4년 비교 TOP10':'지방 갭투자 기준 v7.1 정본 · RP 후보 TOP5';
const STATUS={READY:'검증 완료',PENDING:'계산 중',FAILED:'실패 · 보류',HOLD:'보류'};
const HOLD_LABEL={REFERENCE_ONLY:'전세호가 반영 · 참고',HOLD_NO_CURRENT_RENT:'HOLD · 현재 전세호가 없음',HOLD_RENT_QUOTE_ABOVE_RP_5PCT:'HOLD · 전세호가가 모델 전세 +5% 초과'};
const EXCLUSION_LABEL={outside_requested_quote_gap:'요청 갭 범위 밖',no_sale_quote:'매매호가 없음',collection_not_ok:'수집 상태 불량',no_quote_match:'호가 매칭 없음'};
for(const a of document.querySelectorAll('[data-lane-tab]'))a.setAttribute('aria-selected',String(a.dataset.laneTab===lane));
let snapshot=null,busy=false,selected=null;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=text;return n;};
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:4});
const dotDate=s=>`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
const ym=s=>`${String(s).slice(0,4)}.${String(s).slice(4,6)}`;
const parts=s=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(s)).map(p=>[p.type,p.value]));
const dayTime=s=>{if(!s)return '—';const p=parts(s);return `${p.month}.${p.day} ${p.hour}:${p.minute}`;};
const day=s=>{if(!s)return '—';const p=parts(s);return `${p.month}.${p.day}`;};
const basis=s=>!s?'':(/^\d{6}$/.test(s)?ym(s):(/^\d{4}-\d{2}-\d{2}$/.test(s)?`${s.slice(5,7)}.${s.slice(8,10)}`:s));
const numeric=v=>v===null||(typeof v==='string'&&v!==''&&Number.isFinite(Number(v)));
function validate(data){
 if(data.schema_version!==1||data.view!=='invest_review'||data.lane!==lane)throw Error('자료 형식 확인 실패');
 if(!Array.isArray(data.budgets)||JSON.stringify(data.budget_order)!==JSON.stringify(ORDER)||JSON.stringify(data.budgets.map(b=>b.budget_eok))!==JSON.stringify(ORDER))throw Error('예산 구성 확인 실패');
 if(!['OK','HOLD'].includes(data.status)||typeof data.stale!=='boolean')throw Error('상태 확인 실패');
 if(data.round!==null&&!/^\d{8}$/.test(data.round))throw Error('회차 확인 실패');
 for(const b of data.budgets){
  if(!STATUS[b.status]||!Array.isArray(b.rows))throw Error('예산 상태 확인 실패');
  if(b.status!=='READY'){if(b.rows.length||!b.reason)throw Error('보류 사유 누락');continue;}
  if(b.model!==MODEL||b.quote_round!==data.round||!/^\d{6}$/.test(b.model_month)||!b.ready_at)throw Error('모델 기준 확인 실패');
  if(b.rows.length>(capital?10:5)||b.rows.some((r,i)=>r.rank!==i+1))throw Error('순위 확인 실패');
  for(const r of b.rows){
   if(!r.id||!r.name||!Number.isInteger(r.size)||!HOLD_LABEL[r.quote_hold]||!['QUOTE','MODEL_RENT'].includes(r.rent_source))throw Error('단지 확인 실패');
   for(const k of ['sale_quote','robust_price','applied_rent','quote_gap',capital?'score48':'model_gap'])if(!numeric(r[k]))throw Error('값 확인 실패');
   if(capital&&!numeric(r.ask_premium_pct))throw Error('차이율 확인 실패');
  }
 }
}
function rentCell(r){
 const box=el('span','inv-rent');box.append(el('span','inv-value',fmt(r.applied_rent)));
 box.append(el('small','inv-note',`${r.rent_source==='QUOTE'?'전세호가':'모델 전세'} · ${basis(r.rent_basis)}`));return box;
}
function statusBits(r){
 const box=el('span','inv-status');
 box.append(el('span','inv-gate',r.gate||'—'));
 box.append(el('span',`inv-hold ${r.quote_hold==='REFERENCE_ONLY'?'ok':'hold'}`,HOLD_LABEL[r.quote_hold]));
 if(capital&&r.seoul_gap_prohibited)box.append(el('small','inv-flag','서울 토허·2년 실거주: 갭투자 불가'));
 else if(capital&&r.permit)box.append(el('small','inv-flag','개별 토허·실거주 요건 별도 확인'));
 if(capital&&r.expansion)box.append(el('small','inv-flag',r.expansion));
 return box;
}
function identity(r){
 const box=el('span','inv-identity');box.append(el('span','inv-address',`${r.address||''} · ${r.size}㎡`),el('span','inv-name',r.name));
 return box;
}
function makeRow(r){
 const tr=el('tr');tr.dataset.id=r.id;tr.dataset.hold=r.quote_hold;tr.dataset.rentSource=r.rent_source;
 tr.append(el('td','rank',String(r.rank)));const name=el('td','name');name.append(identity(r));tr.append(name);
 tr.append(el('td','quote current',fmt(r.sale_quote)),el('td','quote',fmt(r.robust_price)));
 if(capital)tr.append(el('td','quote',r.ask_premium_pct===null?'—':`${Number(r.ask_premium_pct)>0?'+':''}${r.ask_premium_pct}%`));
 const rent=el('td','quote divider');rent.append(rentCell(r));tr.append(rent);
 tr.append(el('td','metric divider gap',fmt(r.quote_gap)));
 tr.append(el('td','metric score',capital?(r.score48??'—'):fmt(r.model_gap)));
 const st=el('td','inv-status-cell');st.append(statusBits(r));tr.append(st);
 return tr;
}
function makeCard(r){
 const card=el('article','unit-card inv-card');card.dataset.id=r.id;card.dataset.hold=r.quote_hold;
 const head=el('div','card-heading');head.append(el('span','card-rank',String(r.rank)));const who=el('div');who.append(el('span','region',`${r.address||''} · ${r.size}㎡`),el('h3','',r.name));head.append(who);card.append(head);
 const grid=el('div','current-grid');
 for(const [label,value,cls,note] of [['매매호가',fmt(r.sale_quote),'sale',null],['적용 전세',fmt(r.applied_rent),'rent',`${r.rent_source==='QUOTE'?'전세호가':'모델 전세'} · ${basis(r.rent_basis)}`],['호가 갭',fmt(r.quote_gap),'gap',null],[capital?'4년 점수':'RP 갭',capital?(r.score48??'—'):fmt(r.model_gap),'score',null]]){
  const box=el('div'),strong=el('strong',cls,value);box.append(el('label','',label),strong);if(note)box.append(el('small','inv-note',note));grid.append(box);
 }
 card.append(grid);
 const extra=el('p','inv-card-line',`강건가 ${fmt(r.robust_price)}${capital?` · 차이율 ${r.ask_premium_pct===null?'—':`${Number(r.ask_premium_pct)>0?'+':''}${r.ask_premium_pct}%`}`:''} · 호가 관측 ${day(r.observed_at)}`);
 card.append(extra,statusBits(r));return card;
}
function notes(b){
 const list=[];
 if(b.quality)list.push(b.quality);
 if(capital){
  list.push(`시장 판정 ${b.market_gate||'—'} (판정 자료 ${b.gate_month?ym(b.gate_month):'—'}) · 과거 전세 대체 ${b.prior_rent_count.toLocaleString('ko-KR')}개 · 학습 갭 범위 밖 후보 ${b.training_gap_extrapolation_count.toLocaleString('ko-KR')}개`);
  if(b.expansion_budget)list.push('12억은 C 모델 학습 갭(10억 미만) 밖의 확장 추론입니다.');
  list.push('서울은 토지거래허가구역(2026-12-31까지·2년 실거주)으로 갭투자 불가를 표시합니다. 경기도 개별 요건을 따로 확인해야 합니다.');
 }else{
  list.push(`전국 진입 조건 ${b.market_gate||'—'} · 정본 선정 지역 ${b.chosen_regions.length?b.chosen_regions.join(' → '):'—'}`);
  const c=b.region_state_counts||{};list.push(`지역 상태: 통과 ${c['0']??0} · 제외 ${c['1']??0} · 자료 부족 ${c['-1']??0} · 호가로 후보를 다시 고르지 않습니다.`);
 }
 return list;
}
function panel(b){
 const p=el('section','inv-panel');p.id=`panel-${b.budget_eok}`;p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby',`tab-${b.budget_eok}`);p.dataset.status=b.status;
 if(b.status!=='READY'){
  const box=el('div',`inv-hold-box ${b.status.toLowerCase()}`);
  const text={PENDING:'계산 중입니다. 새 확정 회차나 모델 입력 변경으로 다시 계산하고 있으며, 끝나면 자동으로 반영됩니다.',FAILED:'계산이 실패해 보류했습니다. 다음 확인 때 다시 계산합니다.',HOLD:'검증할 수 있는 결과가 없어 보류했습니다. 결과를 추정하거나 대신 채우지 않습니다.'}[b.status];
  box.append(el('strong','',`갭 ${b.budget_eok}억 · ${STATUS[b.status]}`),el('p','',text),el('p','inv-reason',`사유 코드: ${b.reason}`));p.append(box);return p;
 }
 const meta=el('div','data-meta');
 meta.append(el('p','',`${MODEL_LABEL} · 모델 자료 ${ym(b.model_month)} · 계산 ${dayTime(b.ready_at)} KST · 후보 ${b.candidate_count.toLocaleString('ko-KR')}개`));
 meta.append(el('p','',`호가 관측 ${b.observed_from?`${day(b.observed_from)}–${day(b.observed_to)}`:'—'} KST · 단위 억 원`));p.append(meta);
 for(const t of notes(b))p.append(el('p','table-help',t));
 if(!b.rows.length){p.append(el('p','inv-empty','이 예산에 해당하는 후보가 없습니다.'));return p;}
 const wrap=el('div','desktop-table'),table=el('table','inv-table'),head=el('thead'),tr=el('tr');
 const cols=['순위','단지 · 주소 · 평형','매매호가','강건가',...(capital?['차이율']:[]),'적용 전세','호가 갭',capital?'4년 점수':'RP 갭','판정 · 상태'];
 cols.forEach((c,i)=>{const th=el('th',i===0?'rank':(i===1?'identity':(i===cols.length-1?'inv-status-head':'')),c);th.scope='col';tr.append(th);});head.append(tr);table.append(el('caption','sr-only',`갭 ${b.budget_eok}억 미만 투자 검토 순위`),head);
 const body=el('tbody');for(const r of b.rows)body.append(makeRow(r));table.append(body);wrap.append(table);p.append(wrap);
 const cards=el('div','mobile-cards');for(const r of b.rows)cards.append(makeCard(r));p.append(cards);
 const details=el('details','inv-details'),summary=el('summary','',capital?'제외 집계 보기':'제외·보류 지역 보기');details.append(summary);
 if(capital){const ul=el('ul');for(const [k,v] of Object.entries(b.exclusion_counts||{}))ul.append(el('li','',`${EXCLUSION_LABEL[k]||k} ${Number(v).toLocaleString('ko-KR')}개`));details.append(ul);}
 else{const ul=el('ul');for(const x of b.excluded_regions||[])ul.append(el('li','',`${x.region} — ${x.reason}`));details.append(ul);}
 p.append(details);return p;
}
function choose(budget,focus=false){
 selected=budget;
 for(const t of document.querySelectorAll('[role=tab]')){const on=Number(t.dataset.budget)===budget;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;if(on&&focus)t.focus();}
 for(const p of document.querySelectorAll('.inv-panel'))p.hidden=p.id!==`panel-${budget}`;
 if(location.hash!==`#gap${budget}`)history.replaceState(null,'',`#gap${budget}`);
}
function render(data){
 const tabs=document.createDocumentFragment(),panels=document.createDocumentFragment();
 for(const b of data.budgets){
  const t=el('button','inv-tab');t.type='button';t.id=`tab-${b.budget_eok}`;t.dataset.budget=b.budget_eok;t.dataset.status=b.status;t.setAttribute('role','tab');t.setAttribute('aria-controls',`panel-${b.budget_eok}`);
  t.append(el('span','inv-tab-label',`갭 ${b.budget_eok}억 미만`),el('span',`inv-tab-status ${b.status.toLowerCase()}`,STATUS[b.status]));
  t.addEventListener('click',()=>choose(b.budget_eok));
  t.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
   const i=ORDER.indexOf(b.budget_eok),n=e.key==='Home'?ORDER[0]:(e.key==='End'?ORDER[ORDER.length-1]:ORDER[(i+(e.key==='ArrowRight'?1:ORDER.length-1))%ORDER.length]);choose(n,true);
  });
  tabs.append(t);panels.append(panel(b));
 }
 // Swap in only after every panel was built: a render error never leaves a half-drawn page.
 snapshot=data;$('budget-tabs').replaceChildren(tabs);$('budget-panels').replaceChildren(panels);
 const fromHash=Number((location.hash.match(/^#gap(\d+)$/)||[])[1]);
 choose(ORDER.includes(selected)?selected:(ORDER.includes(fromHash)?fromHash:ORDER[0]));
 const ready=data.budgets.filter(b=>b.status==='READY');
 $('round-value').textContent=data.round?dotDate(data.round):'없음';
 const gates=[...new Set(ready.map(b=>b.market_gate).filter(Boolean))];$('gate-value').textContent=gates.length?gates.join(' / '):'—';
 $('ready-value').replaceChildren(document.createTextNode(String(ready.length)),el('small','',`/ ${data.budgets.length}`));
 const months=[...new Set(ready.map(b=>b.model_month))];$('month-value').textContent=months.length?months.map(ym).join(' / '):'—';
 $('round-label').textContent=data.round?`호가 확정 회차 ${dotDate(data.round)}${data.committed_at?` · 확정 ${dayTime(data.committed_at)} KST`:''} · ${capital?'서울·경기 69지역':'지방 79지역'}`:'확정 호가 회차 없음';
 const problems=[];
 if(data.status!=='OK')problems.push(`투자모델 상태 보류(사유 코드: ${data.reason}). 확인 가능한 결과만 표시합니다.`);
 if(data.stale)problems.push('투자모델 상태 확인이 3시간 넘게 갱신되지 않았습니다. 표시된 결과는 마지막으로 검증된 산출물입니다.');
 if(data.committed_at&&Date.now()-new Date(data.committed_at).getTime()>21*24*60*60*1000)problems.push('호가 확정 회차로부터 3주 이상 지난 결과입니다. 회차·계산 시각을 확인해 주세요.');
 $('error').textContent=problems.join(' ');$('error').hidden=!problems.length;
 $('connection').textContent=problems.length?'확정 자료 · 일부 보류':'확정 자료 · 검증 통과';
 document.body.dataset.error='false';document.body.dataset.ready='true';
}
async function load(){
 if(busy)return;busy=true;$('refresh').disabled=true;
 try{
  const response=await fetch(`../data/${dataName}.json?v=${Math.floor(Date.now()/300000)}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();validate(data);render(data);
 }catch(error){
  $('connection').textContent=snapshot?'갱신 확인 실패 · 기존 확정 자료 유지':'자료 확인 실패';
  $('error').textContent=snapshot?'새 발행 확인에 실패해 기존 자료를 유지합니다. 잠시 후 지금 확인을 눌러주세요.':'투자 검토 자료를 불러오지 못했습니다. 네트워크를 확인하고 지금 확인을 눌러주세요.';
  $('error').hidden=false;document.body.dataset.error='true';
 }finally{busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',load);
load();setInterval(()=>{if(!document.hidden)load();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
