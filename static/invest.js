/* Investment review: renders receipt-verified model outputs only. No external dependencies. */
'use strict';
(() => {
const $=id=>document.getElementById(id);
const lane=document.body.dataset.lane,dataName=document.body.dataset.data,capital=lane==='capital',prefix=capital?'':'local-';
const ORDER=capital?[4,8,12,16,20]:[1,2,3,4];
const TRAINING_GAP=10;  // C model training gaps are below 10억; larger budgets are extrapolation
const MODEL=capital?'C_XGBOOST_LONG_HISTORY_20260926':'local_v7.1';
const MODEL_LABEL=capital?'C 모델(XGBoost 장기이력, 2026-09-26 동결) · 4년 비교 TOP10':'지방 갭투자 기준 v7.1 정본 · RP 후보 TOP5';
const STATUS={READY:'검증 완료',PENDING:'계산 중',FAILED:'실패 · 보류',HOLD:'보류'};
const HOLD_LABEL={REFERENCE_ONLY:'전세호가 반영 · 참고',HOLD_NO_CURRENT_RENT:'HOLD · 현재 전세호가 없음',HOLD_RENT_QUOTE_ABOVE_RP_5PCT:'HOLD · 전세호가가 모델 전세 +5% 초과'};
const EXCLUSION_LABEL={outside_requested_quote_gap:'요청 갭 범위 밖',no_sale_quote:'매매호가 없음',collection_not_ok:'수집 상태 불량',no_quote_match:'호가 매칭 없음'};
const VERDICT_CLASS={'진입 금지(과열)':'stop','보류(전세가율 부족)':'wait','진입 가능':'go','통과':'go','진입 금지':'stop'};
// Timing charts (2026-10-29): drawn from the receipt-bound timing history; band = verdict of each purchase month.
const NS='http://www.w3.org/2000/svg',BAND_NAME={0:'진입 가능',1:'보류',2:'진입 금지'},BAND_CLASS={0:'go',1:'wait',2:'stop'};
const RAMP=['#cde2fb','#9ec5f4','#6da7ec','#3987e5','#256abf'];  // 1급지(brightest) to 5급지; ordinal ramp validated on the dark surface
const PROVINCE_ORDER=['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
let horizon='4',drawnWidth=0,regimeText='';
for(const a of document.querySelectorAll('[data-lane-tab]'))a.setAttribute('aria-selected',String(a.dataset.laneTab===lane));
let snapshot=null,busy=false,selected=null;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=text;return n;};
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:4});
const signed=v=>`${Number(v)>0?'+':''}${v}`;
const dotDate=s=>`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
const ym=s=>`${String(s).slice(0,4)}.${String(s).slice(4,6)}`;
const parts=s=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(s)).map(p=>[p.type,p.value]));
const dayTime=s=>{if(!s)return '—';const p=parts(s);return `${p.month}.${p.day} ${p.hour}:${p.minute}`;};
const day=s=>{if(!s)return '—';const p=parts(s);return `${p.month}.${p.day}`;};
const basis=s=>!s?'':(/^\d{6}$/.test(s)?ym(s):(/^\d{4}-\d{2}-\d{2}$/.test(s)?`${s.slice(5,7)}.${s.slice(8,10)}`:s));
const numeric=v=>v===null||(typeof v==='string'&&v!==''&&Number.isFinite(Number(v)));
function validTiming(t){
 if(t===undefined)return;  // payload without a timing block: the panel stays hidden
 if(!t||!['READY','HOLD'].includes(t.status))throw Error('시점 판정 확인 실패');
 if(t.status!=='READY'){if(!t.reason)throw Error('시점 판정 사유 누락');return;}
 if(!/^\d{6}$/.test(t.month)||!VERDICT_CLASS[t.verdict]||typeof t.consistent!=='boolean')throw Error('시점 판정 확인 실패');
 if(capital){
  for(const k of ['g12_pct','jr_pct','spread_pctp','g12_limit_pct','jr_floor_pct','spread_floor_pctp'])if(t[k]===null||!numeric(t[k]))throw Error('시점 판정 값 확인 실패');
  if(typeof t.g12_pass!=='boolean'||typeof t.jr_pass!=='boolean'||![3,4].includes(t.tier_limit)||!Array.isArray(t.districts)||!t.districts.length)throw Error('시점 판정 값 확인 실패');
  for(const d of t.districts)if(!d.region||!Number.isInteger(d.tier)||typeof d.ok!=='boolean'||!numeric(d.g12_pct)||!numeric(d.jr_pct))throw Error('구 판정 확인 실패');
  if(t.district_counts.ok+t.district_counts.hold!==t.districts.length)throw Error('구 판정 집계 확인 실패');
  if(t.history!=null)validHistory(t.history);else if(t.history_reason!=null&&!/^[A-Z][A-Z0-9_]{2,80}$/.test(t.history_reason))throw Error('그래프 사유 확인 실패');
 }else{
  for(const k of ['national_g12_pct','national_limit_pct','hot_limit_pct'])if(!numeric(t[k]))throw Error('시점 판정 값 확인 실패');
  if(!t.region_state_counts||typeof t.region_state_counts!=='object')throw Error('지역 상태 확인 실패');
  if(t.regions!=null){
   if(!Array.isArray(t.regions)||t.regions.some(r=>!r.name||![-1,0,1].includes(r.state)||(r.code!=null&&!/^\d{5}$/.test(r.code))))throw Error('지역 목록 확인 실패');
   for(const k of ['-1','0','1'])if(t.region_state_counts[k]!=null&&t.regions.filter(r=>r.state===Number(k)).length!==t.region_state_counts[k])throw Error('지역 목록 집계 확인 실패');
  }
 }
}
function validHistory(h){
 const n=h.count,num=v=>v===null||Number.isFinite(v),fail=()=>{throw Error('그래프 자료 확인 실패');};
 if(!Number.isInteger(n)||n<24||!/^\d{6}$/.test(String(h.start))||!Number.isInteger(h.lag)||h.lag<0||h.lag>6)fail();
 if(!Array.isArray(h.tier_index)||h.tier_index.length!==5||h.tier_index.some(t=>!Array.isArray(t)||t.length!==n||!t.every(num)))fail();
 for(const k of ['g12','jr','spread'])if(!Array.isArray(h[k])||h[k].length!==n||!h[k].every(num))fail();
 if(typeof h.band!=='string'||!/^[012-]+$/.test(h.band)||h.band_start+h.band.length!==n+h.lag)fail();
 if(h.tier_last!=null&&(!Array.isArray(h.tier_last)||h.tier_last.length!==5||!h.tier_last.every(Number.isInteger)))fail();
 if(!h.outcomes||!h.outcomes['4'])fail();
 for(const o of Object.values(h.outcomes))if(!Array.isArray(o.rows)||o.rows.some(r=>r.length!==6||!Number.isInteger(r[0])||r[0]<0||r[0]>=n||!Number.isFinite(r[2])||!(r[4]>=0&&r[4]<=1)))fail();
}
function validate(data){
 if(data.schema_version!==1||data.view!=='invest_review'||data.lane!==lane)throw Error('자료 형식 확인 실패');
 if(!Array.isArray(data.budgets)||JSON.stringify(data.budget_order)!==JSON.stringify(ORDER)||JSON.stringify(data.budgets.map(b=>b.budget_eok))!==JSON.stringify(ORDER))throw Error('예산 구성 확인 실패');
 if(!['OK','HOLD'].includes(data.status)||typeof data.stale!=='boolean')throw Error('상태 확인 실패');
 if(data.round!==null&&!/^\d{8}$/.test(data.round))throw Error('회차 확인 실패');
 validTiming(data.timing);
 for(const b of data.budgets){
  if(!STATUS[b.status]||!Array.isArray(b.rows))throw Error('예산 상태 확인 실패');
  if(b.status!=='READY'){if(b.rows.length||!b.reason)throw Error('보류 사유 누락');continue;}
  if(b.model!==MODEL||b.quote_round!==data.round||!/^\d{6}$/.test(b.model_month)||!b.ready_at)throw Error('모델 기준 확인 실패');
  if(b.rows.length>(capital?10:5)||b.rows.some((r,i)=>r.rank!==i+1))throw Error('순위 확인 실패');
  for(const r of b.rows){
   if(!r.id||!r.name||!Number.isInteger(r.size)||!HOLD_LABEL[r.quote_hold]||!['QUOTE','MODEL_RENT'].includes(r.rent_source))throw Error('단지 확인 실패');
   for(const k of ['sale_quote','robust_price','applied_rent','quote_gap',capital?'score48':'model_gap'])if(!numeric(r[k]))throw Error('값 확인 실패');
   if(!numeric(r.rent_ratio_pct??null))throw Error('전세가율 확인 실패');
   if(capital&&!numeric(r.ask_premium_pct))throw Error('차이율 확인 실패');
   if(r.region_code!=null&&(!/^\d{5}$/.test(r.region_code)||![84,59].includes(r.link_area)||!['COMPLEX','REGION'].includes(r.link_match)))throw Error('지역 연결 확인 실패');
  }
 }
}
function regionHref(r,budget){
 return `../${prefix}${r.link_area}/?region=${r.region_code}${r.link_match==='COMPLEX'?`&focus=${encodeURIComponent(r.id)}`:''}&from=gap${budget}`;
}
function nameNode(r,budget,cls){
 if(r.region_code==null)return el('span',cls,r.name);
 const a=el('a',cls?`${cls} inv-link`:'inv-link',r.name);a.href=regionHref(r,budget);
 a.title=`${r.region_name||'지역'} ${r.link_area}㎡ 호가 목록에서 ${r.link_match==='COMPLEX'?'이 단지 보기':'지역 보기'}`;return a;
}
function rentCell(r){
 const box=el('span','inv-rent');box.append(el('span','inv-value',fmt(r.applied_rent)));
 box.append(el('small','inv-note',`${r.rent_source==='QUOTE'?'전세호가':'모델 전세'} · ${basis(r.rent_basis)}`));
 if(r.rent_ratio_pct!=null)box.append(el('small','inv-ratio',`전세가율 ${r.rent_ratio_pct}%`));
 return box;
}
function statusBits(r){
 const box=el('span','inv-status');
 box.append(el('span','inv-gate',r.gate||'—'));
 if(capital&&r.district)box.append(el('small','inv-district-note',`${r.district.tier}급지${r.district.flags&&r.district.flags!=='—'?` · 주의: ${r.district.flags}`:''}`));
 box.append(el('span',`inv-hold ${r.quote_hold==='REFERENCE_ONLY'?'ok':'hold'}`,HOLD_LABEL[r.quote_hold]));
 if(capital&&r.seoul_gap_prohibited)box.append(el('small','inv-flag','서울 토허·2년 실거주: 갭투자 불가'));
 else if(capital&&r.permit)box.append(el('small','inv-flag','개별 토허·실거주 요건 별도 확인'));
 if(capital&&r.expansion)box.append(el('small','inv-flag',r.expansion));
 return box;
}
function identity(r,budget){
 const box=el('span','inv-identity');box.append(el('span','inv-address',`${r.address||''} · ${r.size}㎡`),nameNode(r,budget,'inv-name'));
 return box;
}
function makeRow(r,budget){
 const tr=el('tr');tr.dataset.id=r.id;tr.dataset.hold=r.quote_hold;tr.dataset.rentSource=r.rent_source;
 tr.append(el('td','rank',String(r.rank)));const name=el('td','name');name.append(identity(r,budget));tr.append(name);
 tr.append(el('td','quote current',fmt(r.sale_quote)),el('td','quote',fmt(r.robust_price)));
 if(capital)tr.append(el('td','quote',r.ask_premium_pct===null?'—':`${signed(r.ask_premium_pct)}%`));
 const rent=el('td','quote divider');rent.append(rentCell(r));tr.append(rent);
 tr.append(el('td','metric divider gap',fmt(r.quote_gap)));
 tr.append(el('td','metric score',capital?(r.score48??'—'):fmt(r.model_gap)));
 const st=el('td','inv-status-cell');st.append(statusBits(r));tr.append(st);
 return tr;
}
function makeCard(r,budget){
 const card=el('article','unit-card inv-card');card.dataset.id=r.id;card.dataset.hold=r.quote_hold;
 const head=el('div','card-heading');head.append(el('span','card-rank',String(r.rank)));const who=el('div'),title=el('h3');title.append(nameNode(r,budget,''));who.append(el('span','region',`${r.address||''} · ${r.size}㎡`),title);head.append(who);card.append(head);
 const grid=el('div','current-grid');
 for(const [label,value,cls,note] of [['매매호가',fmt(r.sale_quote),'sale',null],['적용 전세',fmt(r.applied_rent),'rent',`${r.rent_source==='QUOTE'?'전세호가':'모델 전세'} · ${basis(r.rent_basis)}`],['호가 갭',fmt(r.quote_gap),'gap',null],[capital?'4년 점수':'RP 갭',capital?(r.score48??'—'):fmt(r.model_gap),'score',null]]){
  const box=el('div'),strong=el('strong',cls,value);box.append(el('label','',label),strong);if(note)box.append(el('small','inv-note',note));grid.append(box);
 }
 card.append(grid);
 const ratio=r.rent_ratio_pct!=null?` · 전세가율 ${r.rent_ratio_pct}%`:'';
 const extra=el('p','inv-card-line',`강건가 ${fmt(r.robust_price)}${capital?` · 차이율 ${r.ask_premium_pct===null?'—':`${signed(r.ask_premium_pct)}%`}`:''}${ratio} · 호가 관측 ${day(r.observed_at)}`);
 card.append(extra,statusBits(r));return card;
}
function notes(b){
 const list=[];
 if(b.quality)list.push(b.quality);
 if(capital){
  list.push(`시장 판정 ${b.market_gate||'—'} (판정 자료 ${b.gate_month?ym(b.gate_month):'—'}) · 과거 전세 대체 ${b.prior_rent_count.toLocaleString('ko-KR')}개 · 학습 갭 범위 밖 후보 ${b.training_gap_extrapolation_count.toLocaleString('ko-KR')}개`);
  if(b.expansion_budget)list.push(`${b.budget_eok}억은 C 모델 학습 갭(10억 미만) 밖의 확장 추론입니다. 순위는 참고로만 봅니다.`);
  list.push('서울은 토지거래허가구역(2026-12-31까지·2년 실거주)으로 갭투자 불가를 표시합니다. 경기도 개별 요건을 따로 확인해야 합니다.');
 }else{
  list.push(`전국 진입 조건 ${b.market_gate||'—'} · 정본 선정 지역 ${b.chosen_regions.length?b.chosen_regions.join(' → '):'—'}`);
  const c=b.region_state_counts||{};list.push(`지역 상태: 통과 ${c['0']??0} · 제외 ${c['1']??0} · 자료 부족 ${c['-1']??0} · 호가로 후보를 다시 고르지 않습니다.`);
 }
 list.push('단지 이름을 누르면 그 지역의 59㎡·84㎡ 호가 목록으로 이동합니다.');
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
 const body=el('tbody');for(const r of b.rows)body.append(makeRow(r,b.budget_eok));table.append(body);wrap.append(table);p.append(wrap);
 const cards=el('div','mobile-cards');for(const r of b.rows)cards.append(makeCard(r,b.budget_eok));p.append(cards);
 // Local exclusions are budget independent: the full region list lives in the timing panel above.
 if(capital){
  const details=el('details','inv-details'),ul=el('ul');details.append(el('summary','','제외 집계 보기'));
  for(const [k,v] of Object.entries(b.exclusion_counts||{}))ul.append(el('li','',`${EXCLUSION_LABEL[k]||k} ${Number(v).toLocaleString('ko-KR')}개`));
  details.append(ul);p.append(details);
 }
 return p;
}
function rule(label,value,criterion,result,cls,sub,chart){
 const box=el('div','inv-rule');box.dataset.result=cls;
 box.append(el('label','',label),el('strong','',value));if(sub)box.append(el('small','inv-sub',sub));
 box.append(el('small','',criterion),el('span',`inv-result ${cls}`,result));
 if(chart){const c=el('div','inv-chart inv-chart-mini');c.dataset.chart=chart;box.append(c);}
 return box;
}
function districtTable(t){
 const table=el('table','inv-district'),head=el('thead'),tr=el('tr');
 for(const [c,cls] of [['구',''],['급지','num'],['구 판정',''],['주의',''],['12개월 상승률','num'],['전세가율','num']]){const th=el('th',cls,c);th.scope='col';tr.append(th);}
 head.append(tr);table.append(el('caption','sr-only','수도권 구 판정표'),head);const body=el('tbody');
 for(const d of t.districts){
  const row=el('tr',d.ok?'':'hold');row.append(el('td','',d.region),el('td','num',String(d.tier)),el('td','',d.ok?'통과':'보류'),el('td','',d.flags||'—'),
   el('td','num',d.g12_pct===null?'—':`${signed(d.g12_pct)}%`),el('td','num',d.jr_pct===null?'—':`${Number(d.jr_pct).toFixed(0)}%`));body.append(row);
 }
 table.append(body);return table;
}
function renderTiming(t){
 const section=$('timing');
 if(!t){section.hidden=true;return;}
 const verdict=$('timing-verdict'),rules=document.createDocumentFragment(),districts=$('timing-districts');
 section.hidden=false;section.dataset.status=t.status;
 $('timing-charts').hidden=true;$('timing-charts-hold').hidden=true;$('timing-regions').hidden=true;
 if(t.status!=='READY'){
  verdict.textContent='보류';verdict.className='inv-verdict wait';
  $('timing-sub').textContent=`시점 판정 자료를 검증하지 못해 표시하지 않습니다. 사유 코드: ${t.reason}`;
  $('timing-rules').replaceChildren();$('timing-help').textContent='';districts.hidden=true;return;
 }
 verdict.textContent=t.verdict;verdict.className=`inv-verdict ${VERDICT_CLASS[t.verdict]}`;
 const mixed=t.consistent?'모든 예산에 같은 판정':'예산별 판정 자료가 달라 가장 최근 자료를 표시';
 if(capital){
  const h=t.history,ago=(k,unit,sign)=>{if(!h)return null;const v=h[k],n=v.length,f=x=>x===null?'—':`${sign&&x>0?'+':''}${x.toFixed(1)}${unit}`;return `한 달 전 ${f(v[n-2])} · 6개월 전 ${f(v[n-7])}`;};
  $('timing-sub').textContent=`판정 자료 ${ym(t.month)} 실거래 · 수도권 투자 시점·지역 선정 체계 v2 · ${mixed}`;
  rules.append(rule('① 실거래 12개월 상승률 · 구별 중앙값',`${signed(t.g12_pct)}%`,`기준 +${t.g12_limit_pct}% 미만`,t.g12_pass?'통과':'금지',t.g12_pass?'pass':'fail',ago('g12','%',true),h&&'g12'),
   rule('② 시장 전세가율 · 구별 중앙값',`${t.jr_pct}%`,`기준 ${t.jr_floor_pct}% 이상`,t.jr_pass?'통과':'보류',t.jr_pass?'pass':'fail',ago('jr','%',false),h&&'jr'),
   rule('③ 급지 간 격차 · 1급지 − 5급지 24개월',`${signed(t.spread_pctp)}%p`,`+${t.spread_floor_pctp}%p 이상이면 4급지까지, 미만이면 3급지까지`,`${t.tier_limit}급지까지 구 통과`,'info',ago('spread','%p',true),h&&'spread'));
  $('timing-help').textContent=`①이 기준 이상이면 모든 구가 진입 금지이고, ②가 기준 미만이면 보류입니다. ③은 판정이 풀렸을 때 들어갈 수 있는 급지 범위를 정합니다. 작은 그래프의 바탕색은 그 달에 샀을 때의 판정입니다.${t.verdict==='진입 가능'?'':` 지금은 시장 판정이 ${t.verdict}이므로 아래 순위는 판정이 풀리면 볼 후보입니다.`}`;
  $('timing-districts-label').textContent=`구 판정 ${t.districts.length}곳 보기 · 통과 ${t.district_counts.ok} · 보류 ${t.district_counts.hold}`;
  $('timing-district-body').replaceChildren(districtTable(t));districts.hidden=false;
  if(h){$('timing-charts').hidden=false;setupOutcome(h);}
  else{$('timing-charts-hold').textContent=`그래프 자료를 검증하지 못해 그래프만 숨겼습니다. 판정 값은 위와 같습니다. 사유 코드: ${t.history_reason||'CHART_MISSING'}`;$('timing-charts-hold').hidden=false;}
 }else{
  const c=t.region_state_counts||{},pop=t.population_min?`${t.population_min/10000}만`:'기준';
  $('timing-sub').textContent=`판정 자료 ${ym(t.month)} · 지방 갭투자 기준 v7.1 · ${mixed}`;
  rules.append(rule('① 전국 12개월 상승률',t.national_g12_pct===null?'—':`${signed(t.national_g12_pct)}%`,t.national_limit_pct===null?'기준 —':`기준 +${t.national_limit_pct}% 미만`,t.verdict==='통과'?'통과':'진입 금지',t.verdict==='통과'?'pass':'fail'),
   rule('② 지역 판정 · 지방 79곳',`진입 가능 ${c['0']??0}곳`,`상급 단지 12개월 ${t.hot_limit_pct===null?'과열':`+${t.hot_limit_pct}% 이상`} · 입주 과다 · 인구 ${pop} 미만이면 제외`,`제외 ${c['1']??0}곳 · 판정 불가 ${c['-1']??0}곳`,'info'));
  $('timing-help').textContent=`전국 상승률이 기준 이상이면 모든 지역이 진입 금지입니다. 고른 3곳은 예산마다 다르며 각 예산 탭에 표시합니다.${t.verdict==='통과'?'':' 지금은 진입 금지이므로 아래 순위는 판정이 풀리면 볼 후보입니다.'}`;
  districts.hidden=true;regionList(t);
 }
 $('timing-rules').dataset.count=String(rules.childNodes.length);$('timing-rules').replaceChildren(rules);
}
function regionList(t){
 const box=$('timing-regions');box.replaceChildren();box.hidden=false;
 if(!t.regions){box.append(el('p','inv-chart-hold',`지역 목록을 표시하지 못했습니다. 사유 코드: ${t.regions_reason||'REGION_TABLE_MISSING'}`));return;}
 const pass=t.regions.filter(r=>r.state===0),out=t.regions.filter(r=>r.state===1),na=t.regions.filter(r=>r.state===-1);
 const head=el('div','inv-regions-head');head.append(el('strong','',`진입 가능 ${pass.length}곳`),el('span','',pass.length?'전국 조건과 지역 판정을 모두 통과한 시군구입니다. 이름을 누르면 그 지역의 84㎡ 호가 목록으로 갑니다.':'지금은 진입 가능한 지역이 없습니다.'));box.append(head);
 const groups=new Map();
 for(const r of pass){const p=r.name.split(' ')[0];if(!groups.has(p))groups.set(p,[]);groups.get(p).push(r);}
 const rank=p=>{const i=PROVINCE_ORDER.indexOf(p);return i<0?99:i;};
 const list=el('div','inv-region-groups');
 for(const p of [...groups.keys()].sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b,'ko'))){
  const rows=groups.get(p).sort((a,b)=>a.name.localeCompare(b.name,'ko')),row=el('div','inv-region-group'),names=el('div','inv-region-names');
  row.append(el('span','inv-prov',`${p} ${rows.length}`));
  rows.forEach(r=>{
   const label=r.name.split(' ').slice(1).join(' ')||r.name,node=r.code?el('a','inv-link inv-region',label):el('span','inv-region',label);
   if(r.code)node.href=`../local-84/?region=${r.code}`;
   node.title=[r.name,r.hot12_pct!=null?`상급 단지 12개월 ${signed(r.hot12_pct)}%`:null,r.population?`인구 ${(r.population/10000).toFixed(1)}만`:null].filter(Boolean).join(' · ');
   names.append(node);
  });
  row.append(names);list.append(row);
 }
 box.append(list);
 const det=el('details','inv-details'),ul=el('ul');det.append(el('summary','',`제외 ${out.length}곳 · 판정 불가 ${na.length}곳 보기`));
 for(const r of [...out,...na])ul.append(el('li','',`${r.name} — ${r.why||'자료 부족'}`));
 det.append(ul);box.append(det);
}
/* ---- timing charts: SVG drawn at the container width, redrawn when the width changes ---- */
const sv=(tag,attrs,parent)=>{const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);if(parent)parent.append(n);return n;};
const svText=(parent,x,y,cls,text,anchor='start')=>{const t=sv('text',{x,y,class:cls,'text-anchor':anchor},parent);t.textContent=text;return t;};
const mIndex=m=>Math.floor(m/100)*12+(m%100)-1;
const textW=(s,size)=>[...s].reduce((a,c)=>a+(/[ㄱ-힝]/.test(c)?0.97:0.58),0)*size;
const placer=()=>{const used=[];return (x,w)=>{const a=x-w/2,b=x+w/2;if(used.some(([l,r])=>a<r+6&&b>l-6))return false;used.push([a,b]);return true;};};
const mLabel=(h,i)=>{const k=mIndex(h.start)+i;return `${Math.floor(k/12)}.${String(k%12+1).padStart(2,'0')}`;};
const mShort=(h,i)=>mLabel(h,i).slice(2);
function bandSpans(h){
 const out=[];let a=0,s=null;
 for(let k=0;k<=h.band.length;k++){
  const c=k<h.band.length?h.band[k]:null;
  if(c!==s){if(s!==null&&s!=='-')out.push({a:a+h.band_start,b:k-1+h.band_start,s:Number(s)});a=k;s=c;}
 }
 return out;
}
const bandAt=(h,x)=>{const c=h.band[x-h.band_start];return c===undefined||c==='-'?null:Number(c);};
function frame(box,o){
 const W=Math.max(240,Math.floor(box.clientWidth)),H=o.height,svg=sv('svg',{width:W,height:H,viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':o.label,class:'inv-svg'});
 const L=o.left,R=o.right,T=o.top,B=o.bottom,pw=W-L-R,ph=H-T-B;
 return {svg,W,H,L,R,T,B,pw,ph,x:v=>L+(v-o.x0)/(o.x1-o.x0)*pw,y:v=>T+(o.y1-v)/(o.y1-o.y0)*ph,inv:px=>o.x0+(px-L)/pw*(o.x1-o.x0)};
}
function wash(f,spans){for(const s of spans)sv('rect',{x:f.x(s.a-0.5),y:f.T,width:Math.max(0.6,f.x(s.b+0.5)-f.x(s.a-0.5)),height:f.ph,class:`wash ${BAND_CLASS[s.s]}`},f.svg);}
function yGrid(f,ticks,fmt){for(const v of ticks){sv('line',{x1:f.L,x2:f.W-f.R,y1:f.y(v),y2:f.y(v),class:'grid'},f.svg);if(f.y(v)<f.H-f.B-7)svText(f.svg,f.L-5,f.y(v)+3.5,'tick',fmt(v),'end');}}
function yearAxis(f,h,last){
 const base=mIndex(h.start),y0=Math.floor(base/12),y1=Math.floor((base+last)/12),step=f.pw>=620?2:(f.pw>=300?4:5);
 sv('line',{x1:f.L,x2:f.W-f.R,y1:f.H-f.B,y2:f.H-f.B,class:'axis'},f.svg);
 for(let yr=Math.ceil(y0/step)*step;yr<=y1;yr+=step){const i=yr*12-base;if(i>=0)svText(f.svg,f.x(i),f.H-f.B+13,'tick',String(yr),'middle');}
}
function linePath(f,vals,xOf){let d='',pen=false;vals.forEach((v,i)=>{if(v===null){pen=false;return;}d+=`${pen?'L':'M'}${f.x(xOf(i)).toFixed(1)} ${f.y(v).toFixed(1)}`;pen=true;});return d;}
function hover(box,f,pick){
 const tip=el('div','inv-tip');tip.hidden=true;box.append(tip);
 const guide=sv('line',{y1:f.T,y2:f.H-f.B,class:'guide',visibility:'hidden'},f.svg);
 const hit=sv('rect',{x:f.L,y:f.T,width:f.pw,height:f.ph,class:'hit'},f.svg);
 const hide=()=>{tip.hidden=true;guide.setAttribute('visibility','hidden');};
 const move=e=>{
  const r=f.svg.getBoundingClientRect(),got=pick(Math.round(f.inv(e.clientX-r.left)));if(!got){hide();return;}
  const gx=f.x(got.x);guide.setAttribute('x1',gx);guide.setAttribute('x2',gx);guide.setAttribute('visibility','visible');
  tip.replaceChildren(...got.lines.map((l,k)=>el(k?'span':'strong','',l)));tip.hidden=false;
  const tw=tip.offsetWidth;tip.style.left=`${gx+12+tw>f.W?Math.max(0,gx-tw-12):gx+12}px`;tip.style.top=`${f.T}px`;
 };
 hit.addEventListener('pointermove',move);hit.addEventListener('pointerdown',move);hit.addEventListener('pointerleave',hide);
}
const SIGNAL={
 g12:{y0:-27,y1:31,ticks:[-20,0,20],fmt:v=>v===0?'0':`${v>0?'+':''}${v}%`,val:v=>`${v>0?'+':''}${v.toFixed(1)}%`,th:t=>Number(t.g12_limit_pct),thLabel:t=>`기준 +${t.g12_limit_pct}%`,name:'실거래 12개월 상승률',at:[2012,1],below:false},
 jr:{y0:38,y1:88,ticks:[40,60,80],fmt:v=>`${v}%`,val:v=>`${v.toFixed(1)}%`,th:t=>Number(t.jr_floor_pct),thLabel:t=>`기준 ${t.jr_floor_pct}%`,name:'시장 전세가율',at:[2015,6],below:true},
 spread:{y0:-24,y1:38,ticks:[-20,0,20],fmt:v=>v===0?'0':`${v>0?'+':''}${v}%p`,val:v=>`${v>0?'+':''}${v.toFixed(1)}%p`,th:t=>Number(t.spread_floor_pctp),thLabel:t=>`기준 +${t.spread_floor_pctp}%p`,name:'급지 간 격차',at:[2010,1],below:false},
};
function drawSignal(box,t,h,spans,key){
 box.replaceChildren();
 const s=SIGNAL[key],vals=h[key],fin=vals.filter(v=>v!==null),th=s.th(t),end=h.count-1+h.lag;
 const f=frame(box,{height:104,left:36,right:8,top:8,bottom:18,x0:-1,x1:h.count+h.lag+3,y0:Math.min(s.y0,Math.floor(Math.min(...fin))-2),y1:Math.max(s.y1,Math.ceil(Math.max(...fin))+2),
  label:`${s.name} ${mLabel(h,0)}부터 ${mLabel(h,h.count-1)}까지, 매수월 자리에 그림. 기준 ${th}. 현재 ${s.val(fin[fin.length-1])}.`});
 wash(f,spans);yGrid(f,s.ticks,s.fmt);yearAxis(f,h,end);
 sv('line',{x1:f.L,x2:f.W-f.R,y1:f.y(th),y2:f.y(th),class:'thr'},f.svg);
 svText(f.svg,f.x(s.at[0]*12+s.at[1]-1-mIndex(h.start)),f.y(th)+(s.below?11:-4),'thr-label',s.thLabel(t));
 sv('path',{d:linePath(f,vals,i=>i+h.lag),class:'sig'},f.svg);
 const lv=vals[h.count-1];if(lv!==null)sv('circle',{cx:f.x(end),cy:f.y(lv),r:3.6,class:'end-dot'},f.svg);
 box.append(f.svg);
 hover(box,f,x=>{const d=x-h.lag;if(d<0||d>=h.count||vals[d]===null)return null;const b=bandAt(h,x);
  return {x,lines:[`${mShort(h,x)} 매수 · ${b===null?'판정 없음':BAND_NAME[b]}`,`${mShort(h,d)} 자료 ${s.val(vals[d])}`]};});
}
function drawCycle(box,h,spans){
 box.replaceChildren();
 const last=h.tier_index.map(v=>v[h.count-1]),lab=h.tier_last||last.map(v=>Math.round(v)),YT=Math.max(300,Math.ceil((Math.max(...last)+45)/50)*50),narrow=box.clientWidth<560,end=h.count-1+h.lag;
 const f=frame(box,{height:narrow?236:300,left:narrow?30:36,right:narrow?12:74,top:30,bottom:20,x0:-1,x1:h.count+h.lag+3,y0:60,y1:YT,
  label:`급지별 KB 매매지수 ${mLabel(h,0)}부터 ${mLabel(h,h.count-1)}까지(2006년 1월 = 100). 현재 ${lab.map((v,q)=>`${q+1}급지 ${v}`).join(', ')}. 바탕색은 그 달에 샀을 때의 시장 판정.`});
 wash(f,spans);
 const ticks=[];for(let v=100;v<YT;v+=50)ticks.push(v);yGrid(f,ticks,v=>String(v));yearAxis(f,h,end);
 const place=placer();
 for(const s of spans){
  const xa=f.x(s.a-0.5),xb=f.x(s.b+0.5),w=xb-xa,cx=(xa+xb)/2,name=BAND_NAME[s.s];
  if(w<22||s.b>=end||cx-textW(name,10.5)/2<f.L||!place(cx,textW(name,10.5)))continue;
  svText(f.svg,cx,f.T+13,'band-name',name,'middle');
  if(w>=120)svText(f.svg,cx,f.T+26,'band-period',`${mShort(h,s.a)}–${mShort(h,s.b)}`,'middle');
 }
 const now=spans[spans.length-1];
 sv('line',{x1:f.x(end),x2:f.x(end),y1:f.T-6,y2:f.H-f.B,class:'now'},f.svg);
 svText(f.svg,f.W-f.R,f.T-12,'now-label',`지금(${mShort(h,end)} 매수) ${BAND_NAME[now.s]}`,'end');
 for(let q=4;q>=0;q--)sv('path',{d:linePath(f,h.tier_index[q],i=>i),class:'tier',stroke:RAMP[q]},f.svg);
 const order=last.map((v,q)=>({v,q})).sort((a,b)=>a.v-b.v),ypos={};let prev=Infinity;
 for(const e of order){let yy=f.y(e.v);if(yy>prev-13)yy=prev-13;ypos[e.q]=yy;prev=yy;}
 for(let q=0;q<5;q++){
  sv('circle',{cx:f.x(h.count-1),cy:f.y(last[q]),r:3.6,fill:RAMP[q],class:'end-dot tier-dot'},f.svg);
  // Narrow screens: the current index moves into the legend instead of the right margin.
  if(!narrow)svText(f.svg,f.W-f.R+8,ypos[q]+3.5,'end-label',`${q+1}급지 ${lab[q]}`);
  const lg=document.querySelector(`#timing-charts [data-tier="${q+1}"]`);if(lg)lg.textContent=narrow?`${q+1}급지 ${lab[q]}`:`${q+1}급지`;
 }
 box.append(f.svg);
 hover(box,f,x=>{if(x<0||x>end)return null;const b=bandAt(h,x),lines=[`${mLabel(h,x)} · ${b===null?'판정 없음':`그 달에 사면 ${BAND_NAME[b]}`}`];
  if(x<h.count)lines.push(h.tier_index.map((v,q)=>`${q+1}급지 ${v[x]===null?'—':Math.round(v[x])}`).join(' · '));return {x,lines};});
}
function drawOutcome(box,h,spans){
 box.replaceChildren();
 const o=h.outcomes[horizon],rows=o.rows,vals=rows.map(r=>r[2]),lo=Math.min(...vals),hi=Math.max(...vals),step=hi-lo>24?8:4;
 const y0=Math.min(-step,Math.floor(lo/step)*step),y1=Math.ceil((hi+step)/step)*step,narrow=box.clientWidth<560,end=h.count-1+h.lag;
 const f=frame(box,{height:narrow?220:270,left:narrow?30:36,right:narrow?12:74,top:22,bottom:20,x0:-1,x1:h.count+h.lag+3,y0,y1,
  label:`그 달에 샀다면 ${horizon}년 뒤 결과, 갭 ${h.budget_eok}억 미만 한 채 평균. 진입한 달 손실 ${Math.round(o.gate.loss*100)}%, 건너뛴 달에 샀다면 ${Math.round((o.skipped.loss||0)*100)}%.`});
 wash(f,spans);
 const ticks=[];for(let v=y0;v<=y1;v+=step)ticks.push(v);yGrid(f,ticks,v=>v===0?'0':`${v>0?'+':''}${v}억`);yearAxis(f,h,end);
 const bw=Math.max(0.8,(f.x(1)-f.x(0))*0.72);
 for(const r of rows){const top=f.y(Math.max(r[2],0)),bot=f.y(Math.min(r[2],0));sv('rect',{x:f.x(r[0])-bw/2,y:top,width:bw,height:Math.max(bot-top,0.6),class:r[1]?'bar-in':'bar-out'},f.svg);}
 sv('line',{x1:f.L,x2:f.W-f.R,y1:f.y(0),y2:f.y(0),class:'zero'},f.svg);
 // Segment labels: n-weighted mean and loss share per verdict span; the spread regime inside an open span apart (as the monthly card).
 const seg=[];
 for(const s of spans){
  const m=rows.filter(r=>r[0]>=s.a&&r[0]<=s.b),reg=m.filter(r=>r[5]),non=m.filter(r=>!r[5]);
  if(s.s===0&&reg.length>=6&&non.length>=6)seg.push({rows:non,regime:false},{rows:reg,regime:true});else seg.push({rows:m,regime:false});
 }
 const place=placer(),size=narrow?9:10,cls=narrow?'seg-label small':'seg-label';regimeText='';
 for(const g of seg){
  if(g.rows.length<6)continue;
  const w=g.rows.reduce((a,r)=>a+r[3],0),av=g.rows.reduce((a,r)=>a+r[2]*r[3],0)/w,ls=g.rows.reduce((a,r)=>a+r[4]*r[3],0)/w;
  const xa=f.x(g.rows[0][0]),xb=f.x(g.rows[g.rows.length-1][0]),cx=(xa+xb)/2,money=`${av>=0?'+':''}${av.toFixed(1)}억`,loss=`손실 ${Math.round(ls*100)}%`;
  if(g.regime){
   regimeText=`격차 국면(${mShort(h,g.rows[0][0])}–${mShort(h,g.rows[g.rows.length-1][0])} 매수) ${money} · ${loss}`;
   if(!narrow){const top=f.y(Math.max(...g.rows.map(r=>r[2])))-20;svText(f.svg,cx,top,cls,'격차 국면','middle');svText(f.svg,cx,top+12,cls,`${money} · ${loss}`,'middle');}
   continue;
  }
  const one=`평균 ${money} · ${loss}`;
  if(xb-xa>=textW(one,size)+8&&place(cx,textW(one,size)))svText(f.svg,cx,f.T+12,cls,one,'middle');
  else if(xb-xa>=22&&place(cx,Math.max(textW(money,size),textW(loss,size)))){svText(f.svg,cx,f.T+12,cls,money,'middle');svText(f.svg,cx,f.T+12+size+2,cls,loss,'middle');}
 }
 const lastD=rows[rows.length-1][0],nx=f.x(lastD+3);
 if(f.W-f.R-nx>=64){svText(f.svg,nx,f.y(y0)-16,'note',`${mShort(h,lastD+1)} 이후 매수분은`);svText(f.svg,nx,f.y(y0)-5,'note','결과가 아직 없다');}
 box.append(f.svg);
 const byD=new Map(rows.map(r=>[r[0],r]));
 hover(box,f,x=>{const r=byD.get(x);if(!r)return null;const lossN=Math.round(r[4]*r[3]);
  return {x,lines:[`${mLabel(h,x)} 매수 · ${r[1]?'진입한 달':'건너뛴 달'}`,`${horizon}년 뒤 한 채 평균 ${r[2]>=0?'+':''}${r[2].toFixed(2)}억`,`${r[3]}채 중 손실 ${lossN}채${r[5]?' · 격차 국면':''}`]};});
}
function setupOutcome(h){
 const seg=$('outcome-toggle');seg.replaceChildren();
 for(const y of Object.keys(h.outcomes).sort()){
  const b=el('button','',`${y}년`);b.type='button';b.dataset.years=y;b.setAttribute('aria-pressed',String(y===horizon));
  b.addEventListener('click',()=>{horizon=y;for(const x of seg.children)x.setAttribute('aria-pressed',String(x.dataset.years===y));drawCharts(true);});seg.append(b);
 }
 if(!h.outcomes[horizon])horizon='4';
}
function outcomeText(h){
 const o=h.outcomes[horizon],g=Math.round(o.gate.loss*100),k=Math.round((o.skipped.loss||0)*100);
 $('outcome-title').textContent=`그 달에 샀다면 ${horizon}년 뒤 — 갭 ${h.budget_eok}억 미만, 한 채 평균`;
 $('outcome-sub').textContent=`진입한 달 손실 ${g}%${horizon==='4'?'(해마다 기준을 다시 고르면 1-13%)':''} · 건너뛴 달에 샀다면 ${k}% · 지금 같은 격차 국면은 따로 적었다`;
 $('outcome-note').dataset.base=`막대 = 그 달 매수 다섯 채의 평균(실제 매수가, 거래비용 차감, 세전). 진입한 달은 체계가 고른 다섯 채, 건너뛴 달은 판정 없이 같은 순위로 샀다면의 값이다. 판정은 매수월 2개월 전 자료로 한다. 2012-17년 큰 막대는 갭 ${h.budget_eok}억으로 강남·서초를 살 수 있던 시기라, 지금 같은 갭으로 기대할 값이 아니다.`;
}
function drawCharts(force=false){
 const t=snapshot&&snapshot.timing;if(!capital||!t||t.status!=='READY'||!t.history)return;
 const box=$('chart-cycle'),w=box.clientWidth;if(!w||(!force&&w===drawnWidth))return;drawnWidth=w;
 const h=t.history,spans=bandSpans(h);
 drawCycle(box,h,spans);outcomeText(h);drawOutcome($('chart-outcome'),h,spans);
 const note=$('outcome-note');note.textContent=(regimeText&&box.clientWidth<560?`${regimeText}. `:'')+note.dataset.base;
 for(const c of document.querySelectorAll('#timing-rules [data-chart]'))drawSignal(c,t,h,spans,c.dataset.chart);
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
  const label=el('span','inv-tab-label');label.append(el('span','inv-tab-prefix','갭 '),document.createTextNode(`${b.budget_eok}억 미만`));
  t.append(label,el('span',`inv-tab-status ${b.status.toLowerCase()}`,STATUS[b.status]));
  if(capital&&b.budget_eok>TRAINING_GAP)t.append(el('span','inv-tab-flag','확장 추론'));
  t.addEventListener('click',()=>choose(b.budget_eok));
  t.addEventListener('keydown',e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
   const i=ORDER.indexOf(b.budget_eok),n=e.key==='Home'?ORDER[0]:(e.key==='End'?ORDER[ORDER.length-1]:ORDER[(i+(e.key==='ArrowRight'?1:ORDER.length-1))%ORDER.length]);choose(n,true);
  });
  tabs.append(t);panels.append(panel(b));
 }
 // Swap in only after every panel was built: a render error never leaves a half-drawn page.
 snapshot=data;$('budget-tabs').replaceChildren(tabs);$('budget-panels').replaceChildren(panels);
 renderTiming(data.timing);drawCharts(true);
 const fromHash=Number((location.hash.match(/^#gap(\d+)$/)||[])[1]);
 choose(ORDER.includes(selected)?selected:(ORDER.includes(fromHash)?fromHash:ORDER[0]));
 const ready=data.budgets.filter(b=>b.status==='READY');
 $('round-value').textContent=data.round?dotDate(data.round):'없음';
 const gates=data.timing&&data.timing.status==='READY'?[data.timing.verdict]:[...new Set(ready.map(b=>b.market_gate).filter(Boolean))];$('gate-value').textContent=gates.length?gates.join(' / '):'—';
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
if('ResizeObserver' in window){let timer=0;new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>drawCharts(false),120);}).observe($('timing'));}
else addEventListener('resize',()=>drawCharts(false));
load();setInterval(()=>{if(!document.hidden)load();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
