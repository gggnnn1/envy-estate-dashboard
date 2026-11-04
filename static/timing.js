/* Capital timing page: the timing system's charts + Seoul KB index + household-loan growth (YoY).
   Renders receipt-verified public data only. No external dependencies. */
'use strict';
(() => {
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=text;return n;};
const signed=v=>`${Number(v)>0?'+':''}${v}`;
const ym=s=>`${String(s).slice(0,4)}.${String(s).slice(4,6)}`;
const dotDate=s=>`${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
const numeric=v=>v===null||(typeof v==='string'&&v!==''&&Number.isFinite(Number(v)));
const VERDICT_CLASS={'진입 금지(과열)':'stop','보류(전세가율 부족)':'wait','진입 가능':'go'};
const NS='http://www.w3.org/2000/svg',BAND_NAME={0:'진입 가능',1:'보류',2:'진입 금지'},BAND_CLASS={0:'go',1:'wait',2:'stop'};
const RAMP=['#cde2fb','#9ec5f4','#6da7ec','#3987e5','#256abf'];  // 1급지(brightest) to 5급지; ordinal ramp validated on the dark surface
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
function hover(box,f,pick,x0,x1){
 const tip=el('div','inv-tip');tip.hidden=true;box.append(tip);
 // Fixed read-out under the chart (2026-10-29 (3)): the same values for keyboard and small screens.
 const read=el('p','inv-readout');read.setAttribute('aria-live','polite');read.textContent='누르거나 ←·→ 키로 달을 고르면 값이 나옵니다.';box.append(read);
 const guide=sv('line',{y1:f.T,y2:f.H-f.B,class:'guide',visibility:'hidden'},f.svg);
 const hit=sv('rect',{x:f.L,y:f.T,width:f.pw,height:f.ph,class:'hit'},f.svg);
 let cur=null;
 const hide=()=>{tip.hidden=true;guide.setAttribute('visibility','hidden');};
 const show=got=>{
  cur=got.x;const gx=f.x(got.x);guide.setAttribute('x1',gx);guide.setAttribute('x2',gx);guide.setAttribute('visibility','visible');
  tip.replaceChildren(...got.lines.map((l,k)=>el(k?'span':'strong','',l)));tip.hidden=false;
  const tw=tip.offsetWidth;tip.style.left=`${gx+12+tw>f.W?Math.max(0,gx-tw-12):gx+12}px`;tip.style.top=`${f.T}px`;
  read.textContent=got.lines.join(' · ');
 };
 const move=e=>{const r=f.svg.getBoundingClientRect(),got=pick(Math.round(f.inv(e.clientX-r.left)));if(!got){hide();return;}show(got);};
 hit.addEventListener('pointermove',move);hit.addEventListener('pointerdown',move);hit.addEventListener('pointerleave',hide);
 const step=(from,dir)=>{for(let x=from+dir;x>=x0&&x<=x1;x+=dir){const got=pick(x);if(got)return got;}return null;};
 if(box._key)box.removeEventListener('keydown',box._key);
 box._key=e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
  const got=e.key==='Home'?step(x0-1,1):(e.key==='End'?step(x1+1,-1):step(cur===null?(e.key==='ArrowLeft'?x1+1:x0-1):cur,e.key==='ArrowRight'?1:-1));
  if(got)show(got);
 };
 box.addEventListener('keydown',box._key);
 if(box._blur)box.removeEventListener('blur',box._blur);box._blur=hide;box.addEventListener('blur',box._blur);
 box.tabIndex=0;box.setAttribute('role','group');box.setAttribute('aria-label',`${f.svg.getAttribute('aria-label')} 선택한 뒤 ←·→ 키로 달을 옮깁니다.`);
}
const SIGNAL={
 g12:{y0:-27,y1:31,ticks:[-20,0,20],fmt:v=>v===0?'0':`${v>0?'+':''}${v}%`,val:v=>`${v>0?'+':''}${v.toFixed(1)}%`,th:t=>Number(t.g12_limit_pct),thLabel:t=>`기준 +${t.g12_limit_pct}%`,name:'실거래 12개월 상승률',at:[2012,1],below:false},
 jr:{y0:38,y1:88,ticks:[40,60,80],fmt:v=>`${v}%`,val:v=>`${v.toFixed(1)}%`,th:t=>Number(t.jr_floor_pct),thLabel:t=>`기준 ${t.jr_floor_pct}%`,name:'시장 전세가율',at:[2015,6],below:true},
 spread:{y0:-24,y1:38,ticks:[-20,0,20],fmt:v=>v===0?'0':`${v>0?'+':''}${v}%p`,val:v=>`${v>0?'+':''}${v.toFixed(1)}%p`,th:t=>Number(t.spread_floor_pctp),thLabel:t=>`기준 +${t.spread_floor_pctp}%p`,name:'급지 간 격차',at:[2010,1],below:false},
};
function drawSignal(box,t,h,spans,key){
 box.replaceChildren();
 const s=SIGNAL[key],vals=h[key],fin=vals.filter(v=>v!==null),th=s.th(t),end=h.count-1+h.lag;
 const f=frame(box,{height:128,left:36,right:8,top:8,bottom:18,x0:-1,x1:h.count+h.lag+3,y0:Math.min(s.y0,Math.floor(Math.min(...fin))-2),y1:Math.max(s.y1,Math.ceil(Math.max(...fin))+2),
  label:`${s.name} ${mLabel(h,0)}부터 ${mLabel(h,h.count-1)}까지, 매수월 자리에 그림. 기준 ${th}. 현재 ${s.val(fin[fin.length-1])}.`});
 wash(f,spans);
 // Substitute / estimated data months (2026-10-29 (3)): ① KB index before real-transaction 12-month change exists, ② estimated rent ratio.
 const until=key==='g12'?h.g12_kb_until:(key==='jr'?h.jr_est_until:null),u=until?mIndex(until)-mIndex(h.start):-1,estName=key==='g12'?'KB 지수 대체':'추정';
 if(u>=0){
  const xa=f.x(h.lag-0.5),xb=f.x(u+h.lag+0.5);sv('rect',{x:xa,y:f.T,width:Math.max(0,xb-xa),height:f.ph,class:'est'},f.svg);
  if(xb-xa>=textW(estName,9)+6)svText(f.svg,xa+3,f.T+9,'est-label',estName);
 }
 yGrid(f,s.ticks,s.fmt);yearAxis(f,h,end);
 sv('line',{x1:f.L,x2:f.W-f.R,y1:f.y(th),y2:f.y(th),class:'thr'},f.svg);
 svText(f.svg,f.x(s.at[0]*12+s.at[1]-1-mIndex(h.start)),f.y(th)+(s.below?11:-4),'thr-label',s.thLabel(t));
 if(u>=0){
  sv('path',{d:linePath(f,vals.map((v,i)=>i<=u?v:null),i=>i+h.lag),class:'sig sig-est'},f.svg);
  sv('path',{d:linePath(f,vals.map((v,i)=>i>=u?v:null),i=>i+h.lag),class:'sig'},f.svg);
 }else sv('path',{d:linePath(f,vals,i=>i+h.lag),class:'sig'},f.svg);
 const lv=vals[h.count-1];if(lv!==null)sv('circle',{cx:f.x(end),cy:f.y(lv),r:3.6,class:'end-dot'},f.svg);
 box.append(f.svg);
 hover(box,f,x=>{const d=x-h.lag;if(d<0||d>=h.count||vals[d]===null)return null;const b=bandAt(h,x);
  return {x,lines:[`${mShort(h,x)} 매수 · ${b===null?'판정 없음':BAND_NAME[b]}`,`${mShort(h,d)} 자료 ${s.val(vals[d])}${d<=u?` (${estName})`:''}`]};},h.lag,end);
}

const RAMP_SEOUL='#f4f8fa';
let snapshot=null,busy=false,lastTag=null,drawnWidth=0;
// ---- validation (a malformed file never half-draws a page)
function validHistory(h){
 const n=h.count,num=v=>v===null||Number.isFinite(v),fail=()=>{throw Error('그래프 자료 확인 실패');};
 if(!Number.isInteger(n)||n<24||!/^\d{6}$/.test(String(h.start))||!Number.isInteger(h.lag)||h.lag<0||h.lag>6)fail();
 if(!Array.isArray(h.tier_index)||h.tier_index.length!==5||h.tier_index.some(t=>!Array.isArray(t)||t.length!==n||!t.every(num)))fail();
 for(const k of ['g12','jr','spread'])if(!Array.isArray(h[k])||h[k].length!==n||!h[k].every(num))fail();
 if(typeof h.band!=='string'||!/^[012-]+$/.test(h.band)||h.band_start+h.band.length!==n+h.lag)fail();
 if(h.tier_last!=null&&(!Array.isArray(h.tier_last)||h.tier_last.length!==5||!h.tier_last.every(Number.isInteger)))fail();
 for(const k of ['g12_kb_until','jr_est_until'])if(h[k]!=null&&(!/^\d{6}$/.test(String(h[k]))||mIndex(h[k])<mIndex(h.start)))fail();
}
function validate(d){
 if(!d||d.view!=='timing'||!['OK','HOLD'].includes(d.status))throw Error('시점 자료 확인 실패');
 if(d.status==='HOLD'){if(!d.reason)throw Error('시점 자료 사유 누락');return;}
 const t=d.timing;
 if(!t||!/^\d{6}$/.test(t.month)||!VERDICT_CLASS[t.verdict])throw Error('시점 판정 확인 실패');
 for(const k of ['g12_pct','jr_pct','spread_pctp','g12_limit_pct','jr_floor_pct','spread_floor_pctp'])if(t[k]===null||!numeric(t[k]))throw Error('시점 판정 값 확인 실패');
 validHistory(t.history);
 const s=d.seoul;
 if(s!=null){const n=t.history.count;if(!Array.isArray(s.values)||s.values.length<n||s.values.length>n+3||!s.values.every(v=>Number.isFinite(v))||!/^\d{6}$/.test(String(s.last_month)))throw Error('서울 지수 확인 실패');}
 const l=d.loan;
 if(l!=null){if(!Array.isArray(l.yoy_pct)||l.yoy_pct.length<12||l.yoy_pct.length!==l.change_trn.length||!l.yoy_pct.every(v=>Number.isFinite(v))||!/^\d{6}$/.test(String(l.start))||!/^\d{6}$/.test(String(l.last_month)))throw Error('가계대출 자료 확인 실패');
  if(mIndex(l.last_month)-mIndex(l.start)+1!==l.yoy_pct.length)throw Error('가계대출 월 확인 실패');}
}
// ---- chart 1: tier index + Seoul KB (tier 1 = price tier 1)
function drawCycle(box,d,spans){
 box.replaceChildren();
 const h=d.timing.history,seoul=d.seoul?d.seoul.values:null;
 const last=h.tier_index.map(v=>v[h.count-1]),lab=h.tier_last||last.map(v=>Math.round(v)),sLast=seoul?seoul[seoul.length-1]:null;
 const top=Math.max(...last,sLast||0),YT=Math.max(300,Math.ceil((top+45)/50)*50),narrow=box.clientWidth<560,end=h.count-1+h.lag;
 const f=frame(box,{height:narrow?250:310,left:narrow?30:36,right:narrow?12:84,top:30,bottom:20,x0:-1,x1:h.count+h.lag+3,y0:60,y1:YT,
  label:`급지별 KB 매매지수와 서울 KB 매매지수, ${mLabel(h,0)}부터 ${mLabel(h,h.count-1)}까지(2006년 1월 = 100). 현재 ${lab.map((v,q)=>`${q+1}급지 ${v}`).join(', ')}${sLast===null?'':`, 서울 ${Math.round(sLast)}`}. 바탕색은 그 달에 샀을 때의 시장 판정.`});
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
 if(seoul)sv('path',{d:linePath(f,seoul,i=>i),class:'seoul-line'},f.svg);
 const items=last.map((v,q)=>({v,q,text:q===0?`1급지·1분위 ${lab[q]}`:`${q+1}급지 ${lab[q]}`}));
 if(seoul)items.push({v:sLast,q:5,text:`서울 ${Math.round(sLast)}`});
 items.sort((a,b)=>a.v-b.v);const ypos={};let prev=Infinity;
 for(const e of items){let yy=f.y(e.v);if(yy>prev-13)yy=prev-13;ypos[e.q]=yy;prev=yy;}
 for(const e of items){
  const q=e.q,seoulItem=q===5;
  sv('circle',{cx:f.x(seoulItem?seoul.length-1:h.count-1),cy:f.y(e.v),r:3.6,fill:seoulItem?RAMP_SEOUL:RAMP[q],class:'end-dot tier-dot'},f.svg);
  if(!narrow)svText(f.svg,f.W-f.R+8,ypos[q]+3.5,'end-label',e.text);
  if(!seoulItem){const lg=document.querySelector(`#timing-charts [data-tier="${q+1}"]`);if(lg)lg.textContent=narrow?e.text:(q===0?'1급지·1분위':`${q+1}급지`);}
  else{const lg=document.querySelector('#timing-charts [data-seoul]');if(lg)lg.textContent=narrow?e.text:'서울';}
 }
 box.append(f.svg);
 hover(box,f,x=>{
  if(x<0||x>end)return null;const b=bandAt(h,x),lines=[`${mLabel(h,x)} · ${b===null?'판정 없음':`그 달에 사면 ${BAND_NAME[b]}`}`];
  if(x<h.count)lines.push(h.tier_index.map((v,q)=>`${q+1}급지 ${v[x]===null?'—':Math.round(v[x])}`).join(' · '));
  if(seoul&&x<seoul.length)lines.push(`서울 KB ${Math.round(seoul[x])}`);
  return {x,lines};},0,end);
}
// ---- chart 2: household loan growth (year over year); the month on the axis is the data month
function drawLoan(box,d,spans){
 box.replaceChildren();
 const h=d.timing.history,l=d.loan,off=mIndex(l.start)-mIndex(h.start),vals=l.yoy_pct,end=h.count-1+h.lag;
 const lo=Math.min(...vals),hi=Math.max(...vals),step=5,y0=Math.min(-2,Math.floor(lo/step)*step),y1=Math.ceil((hi+1)/step)*step+1,narrow=box.clientWidth<560;
 const f=frame(box,{height:narrow?200:230,left:36,right:narrow?12:74,top:14,bottom:20,x0:-1,x1:h.count+h.lag+3,y0,y1,
  label:`가계대출 증가율(전년 동월 대비), ${ym(l.start)}부터 ${ym(l.last_month)}까지. 최신 ${l.last_yoy_pct>0?'+':''}${l.last_yoy_pct.toFixed(1)}%.`});
 wash(f,spans);
 const ticks=[];for(let v=Math.ceil(y0/step)*step;v<=y1;v+=step)ticks.push(v);
 yGrid(f,ticks,v=>v===0?'0':`${v>0?'+':''}${v}%`);yearAxis(f,h,end);
 sv('line',{x1:f.L,x2:f.W-f.R,y1:f.y(0),y2:f.y(0),class:'zero'},f.svg);
 sv('path',{d:linePath(f,vals,i=>i+off),class:'loan-line'},f.svg);
 const xe=f.x(off+vals.length-1);
 sv('circle',{cx:xe,cy:f.y(vals[vals.length-1]),r:3.6,class:'end-dot'},f.svg);
 if(!narrow)svText(f.svg,f.W-f.R+8,f.y(vals[vals.length-1])+3.5,'end-label',`${l.last_yoy_pct>0?'+':''}${l.last_yoy_pct.toFixed(1)}%`);
 box.append(f.svg);
 hover(box,f,x=>{const i=x-off;if(i<0||i>=vals.length)return null;
  const k=mIndex(l.start)+i,label=`${Math.floor(k/12)}.${String(k%12+1).padStart(2,'0')}`;
  return {x,lines:[`${label} 자료 · 전년 동월 대비 ${vals[i]>0?'+':''}${vals[i].toFixed(1)}%`,`1년 새 ${l.change_trn[i]>0?'+':''}${l.change_trn[i].toFixed(1)}조원`]};},off,off+vals.length-1);
}
// ---- page
function caption(id,text){const n=$(id);if(n)n.textContent=text;}
function render(d){
 snapshot=d;
 const hold=$('timing-hold'),charts=$('timing-charts');
 if(d.status!=='OK'){
  hold.textContent=`타이밍 자료를 검증하지 못해 표시하지 않습니다. 사유 코드: ${d.reason}`;hold.hidden=false;charts.hidden=true;
  $('verdict-value').textContent='보류';$('month-value').textContent='—';$('seoul-value').textContent='—';$('loan-value').textContent='—';
  $('connection').textContent='자료 보류';document.body.dataset.error='false';document.body.dataset.ready='true';return;
 }
 const t=d.timing,h=t.history;
 hold.hidden=true;charts.hidden=false;
 $('verdict-value').textContent=t.verdict;$('verdict-value').className=`inv-verdict ${VERDICT_CLASS[t.verdict]}`;
 $('month-value').textContent=ym(t.month);
 $('seoul-value').textContent=d.seoul?ym(d.seoul.last_month):'보류';
 $('loan-value').textContent=d.loan?ym(d.loan.last_month):'보류';
 const spans=bandSpans(h);
 const notes=[];
 const est=[h.g12_kb_until?`실거래 상승률은 ${ym(h.g12_kb_until)}까지 KB 지수 대체`:null,h.jr_est_until?`전세가율은 ${ym(h.jr_est_until)}까지 추정`:null].filter(Boolean);
 $('timing-help').textContent=`판정은 판정 자료월(${ym(t.month)}) 실거래로 냅니다. 서울 KB 지수와 가계대출은 자료가 나오는 대로 따로 갱신되어 최신월이 다를 수 있습니다.${est.length?` 회색 점선 구간은 대체·추정 자료입니다: ${est.join(', ')}.`:''}`;
 if(!d.seoul)notes.push(`서울 KB 지수를 검증하지 못해 점선을 숨겼습니다. 사유 코드: ${d.seoul_reason}`);
 if(!d.loan)notes.push(`가계대출 자료를 검증하지 못해 그래프를 숨겼습니다. 사유 코드: ${d.loan_reason}`);
 if(d.loan&&d.loan.stale)notes.push('가계대출 원천 갱신이 5일 넘게 확인되지 않았습니다. 표시된 값은 마지막으로 검증된 자료입니다.');
 $('timing-notes').textContent=notes.join(' ');$('timing-notes').hidden=!notes.length;
 $('fig-loan').hidden=!d.loan;
 if(d.loan){
  const l=d.loan;
  caption('loan-sub',`예금취급기관 주택담보대출 잔액의 전년 동월 대비 증가율 · 한국은행 ECOS · ${ym(l.start)}~${ym(l.last_month)} · 최신 ${l.last_yoy_pct>0?'+':''}${l.last_yoy_pct.toFixed(1)}%(1년 새 ${l.last_change_trn>0?'+':''}${l.last_change_trn.toFixed(1)}조원, 잔액 ${l.last_stock_trn.toLocaleString('ko-KR')}조원) · 가로축은 자료월 그대로(판정처럼 2개월 늦추지 않음)`);
 }
 caption('cycle-sub',`구 가격 수준 5분위 급지의 KB 매매지수 평균(1급지 = 1분위) · 점선 = 서울 전체 KB 매매지수${d.seoul?`(${ym(d.seoul.last_month)}까지)`:''} · 2006년 1월 = 100 · 바탕색 = 그 달에 샀을 때의 시장 판정 · 그래프를 누르면 그 달 값`);
 for(const key of ['g12','jr','spread']){
  const s=SIGNAL[key],vals=h[key],cur=vals[vals.length-1];
  caption(`sig-${key}-sub`,`현재 ${s.val(cur)} · ${s.thLabel(t)} · 바탕색 = 그 달에 샀을 때의 판정`);
 }
 drawAll(true);
 $('round-label').textContent=d.round?`호가 확정 회차 ${dotDate(d.round)} 기준 판정 · 서울·경기 66개 구, 59·84㎡, 300세대 이상`:'';
 $('connection').textContent=notes.length?'자료 검증 · 일부 보류':'자료 검증 통과';
 $('error').hidden=true;document.body.dataset.error='false';document.body.dataset.ready='true';
}
function drawAll(force){
 const d=snapshot;if(!d||d.status!=='OK')return;
 const box=$('chart-cycle'),w=box.clientWidth;if(!w||(!force&&w===drawnWidth))return;drawnWidth=w;
 const t=d.timing,h=t.history,spans=bandSpans(h);
 drawCycle(box,d,spans);
 if(d.loan)drawLoan($('chart-loan'),d,spans);
 for(const c of document.querySelectorAll('#timing-charts [data-chart]'))drawSignal(c,t,h,spans,c.dataset.chart);
}
async function load(force=false){
 if(busy)return;busy=true;$('refresh').disabled=true;
 try{
  const response=await fetch(`../data/timing.json${force?`?t=${Date.now()}`:''}`,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const tag=response.headers.get('ETag')||response.headers.get('Last-Modified');
  if(!force&&snapshot&&tag&&tag===lastTag)return;
  const data=await response.json();validate(data);render(data);lastTag=tag;
 }catch(error){
  $('connection').textContent=snapshot?'갱신 확인 실패 · 기존 확정 자료 유지':'자료 확인 실패';
  $('error').textContent=snapshot?'새 발행 확인에 실패해 기존 자료를 유지합니다. 잠시 후 지금 확인을 눌러주세요.':'타이밍 자료를 불러오지 못했습니다. 네트워크를 확인하고 지금 확인을 눌러주세요.';
  $('error').hidden=false;document.body.dataset.error='true';
 }finally{busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',()=>load(true));
if('ResizeObserver' in window){let timer=0;new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>drawAll(false),120);}).observe($('timing-charts'));}
else addEventListener('resize',()=>drawAll(false));
load();setInterval(()=>{if(!document.hidden)load();},300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
