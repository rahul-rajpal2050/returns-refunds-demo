const app=document.querySelector('#app'), modal=document.querySelector('#modal');
let claim=null, list=[], filter='needs_decision', query='', counts=null, type='all';
const reasons={damaged:'Item arrived damaged',wrong_item:'Wrong item received',missing_item:'Item missing',preference:'Changed my mind',service_issue:'Service issue',digital_issue:'Digital purchase issue',duplicate_payment:'Paid twice',cancellation:'Cancellation request'};
const purchaseTypes={physical:'Physical product',digital:'Digital product',service:'Service',subscription:'Subscription'};
const views={needs_decision:['needs_decision','inspection_review','refund_ready'],waiting_customer:['waiting_customer'],return_in_progress:['return_in_progress'],refund_processing:['refund_processing'],closed:['closed','declined']};
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const money=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p/100);
const date=s=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const labels={needs_decision:'Needs your decision',waiting_customer:'Waiting for customer',return_in_progress:'Return in progress',refund_ready:'Ready for refund',refund_processing:'Refund processing',inspection_review:'Inspection review',closed:'Closed',declined:'Declined',approve_return:'Approve return',refund_now:'Refund now',request_info:'Request information',decline:'Recommend declining'};
// GitHub Pages build (meta api-mode=local) or ?local: run the API in the browser (P2).
const localMode=document.querySelector('meta[name="api-mode"]')?.content==='local'||new URLSearchParams(location.search).has('local');
let localApi=null;
async function localRequest(path,body){localApi??=await import('./local-api.js');const r=await localApi.request(path,body);if(r.status>=400)throw Error(r.body.error);return r.body;}
if(localMode){const reset=document.querySelector('#reset-demo');reset.hidden=false;reset.addEventListener('click',async()=>{if(!confirm('Reset the demo? Your changes in this browser are cleared and the 15 sample requests come back.'))return;localApi??=await import('./local-api.js');localApi.reset();location.hash='';location.reload();});}
async function api(path,body){if(localMode)return localRequest(path,body);const options={method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined};let r=await fetch('/api/'+path,options);if(r.status===401 && path!=='session'){await fetch('/api/session');r=await fetch('/api/'+path,options);}const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
function notice(msg,error=false){document.querySelector('#notice').innerHTML=`<div class="${error?'error':'toast'}">${esc(msg)}</div>`;}
async function refresh(){const d=await api('claims');list=d.claims;counts=d.counts;document.querySelector('#badge').textContent=d.counts.open;if(location.hash){claim=await api('claims/'+location.hash.slice(1));renderClaim();}else renderQueue();}
async function act(action,body={}){try{claim=await api(`claims/${claim.id}/${action}`,{...body,version:claim.version});await refresh();notice('Saved to the claim record.');return true;}catch(e){notice(e.message,true);return false;}}
const btn=(label,action,cls='',disabled=false)=>`<button data-action="${action}" class="${cls}" ${disabled?'disabled':''}>${label}</button>`;
// Queue screen (C2): matches design/Main.dc.html.
const HOUR=3600000, DAY=86400000;
const queueTabs=[['needs_decision','Needs your decision'],['waiting_customer','Waiting for customer'],['return_in_progress','Return in progress'],['refund_processing','Refund processing'],['closed','Closed']];
const lastColumn={needs_decision:'AI recommendation',waiting_customer:'Waiting on',return_in_progress:'Return stage',refund_processing:'Refund status',closed:'Outcome'};
const physicalReasons=['damaged','wrong_item','missing_item','preference'];
const typeFilters=[['all','All'],['damaged','Damaged'],['wrong_item','Wrong item'],['missing_item','Missing item'],['preference','Fit / preference'],['other','Other']];
const reasonShort={damaged:'Damaged item',wrong_item:'Wrong item',missing_item:'Missing item',preference:'Changed my mind',service_issue:'Service issue',digital_issue:'Digital issue',duplicate_payment:'Paid twice',cancellation:'Cancellation'};
const reasonTone={damaged:'amber',wrong_item:'blue',missing_item:'violet'};
const recommendationInfo={approve_return:['Approve return · refund after inspection','green'],refund_now:['Refund now','green'],request_info:['Request more information','blue'],decline:['Recommend decline','red'],needs_judgement:['Needs your judgement','amber']};
const deadlineVerb={decision:'Decide by',customer_reply:'Reply due',pickup:'Pickup by',inspection:'Inspect by'};
const shortDate=s=>s?new Date(s).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'}):'—';
const rupees=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:p%100?2:0}).format(p/100);
const chip=(label,tone)=>`<span class="chip tone-${tone}">${esc(label)}</span>`;
function relative(at){
  const ms=Date.parse(at)-Date.now();
  if(ms<0){const h=Math.ceil(-ms/HOUR);return h<24?`Overdue by ${h} h`:`Overdue by ${Math.round(-ms/DAY)} d`;}
  const h=Math.floor(ms/HOUR);
  if(h<24)return `Due in ${Math.max(h,1)} h`;
  const d=Math.round(ms/DAY);
  return `in ${d} day${d===1?'':'s'}`;
}
function age(c){const ms=Date.now()-Date.parse(c.submittedAt);return ms<DAY?`${Math.max(1,Math.floor(ms/HOUR))} h`:`${Math.floor(ms/DAY)} d`;}
function deadlineCell(c){
  const d=c.nextDeadline||{kind:'none'};
  if(d.kind!=='none'&&d.at)return {main:`${deadlineVerb[d.kind]||'Due'} ${shortDate(d.at)}`,sub:relative(d.at),urgent:d.urgent};
  if(c.status==='refund_ready')return {main:'Release refund',sub:'Waiting for you'};
  if(c.status==='refund_processing')return {main:`Initiated ${shortDate(c.refund?.at)}`,sub:'Per Razorpay refund timelines'};
  if(c.status==='return_in_progress'&&c.returnStage==='picked_up')return {main:'In transit',sub:'No arrival date from courier'};
  if(['closed','declined'].includes(c.status))return {main:`Closed ${shortDate(c.audit.at(-1)?.at||c.submittedAt)}`,sub:c.status==='declined'?'Declined':'Refund processed'};
  return {main:'—',sub:''};
}
function outcomeCell(c){
  const a=c.assessment||{};
  if(c.status==='needs_decision'){const [label,tone]=recommendationInfo[a.recommendation]||['Assessment pending','grey'];return {label,tone,note:a.rationale||''};}
  if(c.status==='inspection_review')return {label:'Inspection failed · decide',tone:'amber',note:c.inspection?.reason||''};
  if(c.status==='refund_ready')return {label:'Release refund',tone:'blue',note:c.inspectionException?'Refund exception approved. Confirm the amount.':'Inspection passed. Confirm the amount.'};
  if(c.status==='waiting_customer'){const recent=[...c.messages].reverse();const ask=recent.find(m=>m.askedBecause)||recent.find(m=>m.actor==='assistant'||m.actor==='merchant');return {label:'Evidence requested',tone:'grey',note:ask?.askedBecause||ask?.text||''};}
  if(c.status==='return_in_progress'){const [label,tone]={awaiting_pickup:['Pickup scheduled','blue'],picked_up:['Returning to you','blue'],received:['Received · inspect now','amber']}[c.returnStage]||['Return approved','blue'];return {label,tone,note:'Refund after inspection.'};}
  if(c.status==='refund_processing')return {label:'Refund initiated',tone:'violet',note:`${money(c.refund?.amount||0)} to the original ${c.method} payment.`};
  if(c.status==='declined')return {label:'Declined',tone:'grey',note:c.decision?.reason||''};
  return {label:'Refunded',tone:'green',note:c.decision?.override?'You chose differently from the recommendation.':'Matched the recommendation.'};
}
const matchesType=c=>type==='all'||(type==='other'?!physicalReasons.includes(c.reason):c.reason===type);
const byDeadline=(a,b)=>(Date.parse(a.nextDeadline?.at)||Infinity)-(Date.parse(b.nextDeadline?.at)||Infinity)||Date.parse(a.submittedAt)-Date.parse(b.submittedAt);
function renderQueue(){
  const by=counts?.byStatus||{};
  const inView=c=>views[filter].includes(c.status);
  const q=query.trim().toLowerCase();
  const searching=q.length>0;
  const pool=list.filter(c=>searching?`${c.id} ${c.orderId} ${c.customerOrderReference||''} ${c.customer} ${c.item}`.toLowerCase().includes(q):inView(c));
  const rows=pool.filter(matchesType).sort(byDeadline);
  const decide=list.filter(c=>views.needs_decision.includes(c.status));
  const ready=decide.filter(c=>c.status!=='needs_decision'||(c.assessment&&c.assessment.recommendation!=='needs_judgement')).length;
  const showOther=list.some(c=>!physicalReasons.includes(c.reason));
  const tabCount=key=>views[key].reduce((n,s)=>n+(by[s]||0),0);
  app.innerHTML=`
  <div class="queue-head">
    <div><h1>Returns &amp; Refunds</h1><p>Every request reaches you with its evidence, the policy that applies and a reasoned recommendation. You make the final call.</p></div>
    ${btn('Preview customer request form','new')}
  </div>
  <div class="tiles">
    <div class="tile"><span class="tile-label">Needs your decision</span><span class="tile-value">${decide.length}</span><span class="tile-sub">${ready} with an AI recommendation ready</span></div>
    <div class="tile urgent"><span class="tile-label"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Due within 24 h</span><span class="tile-value">${counts?.dueWithin24h??0}</span><span class="tile-sub">Decisions, replies, pickups and inspections</span></div>
    <div class="tile"><span class="tile-label">Waiting for customer</span><span class="tile-value">${by.waiting_customer||0}</span><span class="tile-sub">Assistant asked for missing evidence</span></div>
    <div class="tile"><span class="tile-label">Refunds processing</span><span class="tile-value mono">${rupees(counts?.refundsProcessingAmount||0)}</span><span class="tile-sub">${by.refund_processing||0} initiated, not yet settled</span></div>
  </div>
  <section class="queue" aria-label="Requests">
    <div class="queue-tabs" role="tablist" aria-label="Queue views">${queueTabs.map(([key,label])=>`<button type="button" role="tab" data-filter="${key}" aria-selected="${!searching&&filter===key}">${label}<span class="count">${tabCount(key)}</span></button>`).join('')}</div>
    <div class="filters"><span class="filters-label">Claim type</span>${typeFilters.filter(([key])=>key!=='other'||showOther).map(([key,label])=>`<button type="button" data-type="${key}" aria-pressed="${type===key}">${label}</button>`).join('')}<span class="sort-note">Sorted by next deadline, soonest first</span></div>
    ${searching?`<div class="search-note">Search results across all views for “${esc(query.trim())}”</div>`:''}
    <div class="table-scroll"><table class="requests">
      <thead><tr><th scope="col">Customer &amp; request</th><th scope="col">Item</th><th scope="col">Claim reason</th><th scope="col" class="th-num">Amount</th><th scope="col">Age</th><th scope="col">Next deadline</th><th scope="col">${searching?'Status':lastColumn[filter]}</th></tr></thead>
      <tbody>${rows.map(c=>{const [itemName,...variant]=c.item.split(' · ');const d=deadlineCell(c);const o=outcomeCell(c);return `<tr data-href="#${esc(c.id)}">
        <td><div class="cell"><a class="name" href="#${esc(c.id)}">${esc(c.customer)}</a><small class="mono">${esc(c.id)} · ${esc(c.orderId)}</small></div></td>
        <td><div class="cell"><span>${esc(itemName)}</span><small>${esc(variant.join(' · '))}</small></div></td>
        <td>${chip(reasonShort[c.reason]||c.reason,reasonTone[c.reason]||'grey')}</td>
        <td class="num">${rupees(c.amount)}</td>
        <td>${age(c)}</td>
        <td><div class="cell deadline"><span>${esc(d.main)}</span><small class="${d.urgent?'due-urgent':''}">${esc(d.sub)}</small></div></td>
        <td><div class="outcome">${chip(searching?labels[c.status]:o.label,searching?'grey':o.tone)}<small>${esc(o.note)}</small></div></td>
      </tr>`;}).join('')}</tbody>
    </table></div>
    ${rows.length?'':`<div class="queue-empty">${searching?'No requests match your search.':'No requests of this type in this view.'}</div>`}
    <div class="queue-foot"><span>Showing ${rows.length} of ${pool.length} request${pool.length===1?'':'s'}${filter==='needs_decision'&&!searching?' · includes failed inspections and refunds ready to release':''}</span><span>Badge = all open requests (${counts?.open??0}). AI findings are simulated.</span></div>
  </section>`;
}
// Claim workspace (C3): matches design/Claim.dc.html, ClaimJudgement and ClaimWaiting.
let photoSel={claim:null,id:null};
const observationKind={observed:['Observed',''],consistent:['Consistent',''],contradiction:['Doesn’t fit','kind-red'],cannot_tell:['Can’t tell','kind-amber']};
const checkResult={pass:['Pass','green'],complete:['Provided','green'],likely:['Likely','amber'],review:['Review','amber'],unclear:['Unclear','amber'],missing:['Missing','red'],fail:['Fail','red'],inspect_first:['Inspect first','blue']};
const authResult={none_found:'None found',not_detected:'Not detected',detected:'Detected',consistent:'Consistent',inconsistent:'Inconsistent',match_found:'Near-match found',unavailable:'Unavailable'};
const authStatus={no_signals:['No signals found','green'],signals_found:['Signals found','amber'],inconclusive:['Inconclusive','amber']};
const evidenceKind={closeup:'Close-up',full:'Full view',other:'Other'};
const icon={
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>',
  spark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  shield:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/></svg>',
};
const isoToText=s=>String(s||'').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/g,m=>date(m));
const imageSrc=e=>e.data||(e.image?e.image.replace(/^\//,''):'media/placeholder-photo.svg');
function deadlineCards(c){
  const physical=(c.purchaseType||'physical')==='physical',active=['needs_decision','waiting_customer'].includes(c.status),p=c.policy||{};
  const met=c.claimWindowMet;
  const windowCard=met===undefined?['Customer’s claim window','—','',''] :[ 'Customer’s claim window', `${met?'Met':'Missed'}: claimed on day ${c.claimDayOfWindow} of ${p.claimDays||7}`, `Window ${Date.parse(c.claimWindowClosesAt)>Date.now()?'closes':'closed'} ${date(c.claimWindowClosesAt)} · measured at submission, not review`, met?'ok':'bad'];
  const dueUrgent=active&&Date.parse(c.decisionDueAt)-Date.now()<DAY;
  const decisionCard=active?['Your decision is due',`${date(c.decisionDueAt)} · ${relative(c.decisionDueAt)}`,c.status==='waiting_customer'&&c.customerReplyDueAt?`Customer reply due ${date(c.customerReplyDueAt)}`:`Your policy: respond within ${p.responseDays||4} days of the claim`,dueUrgent?'urgent':'']:['Your decision',c.decision?`${labels[c.decision.action]||c.decision.action} · ${date(c.decision.at)}`:'—',c.decision?.actor||'','done'];
  const stage={awaiting_pickup:`Pickup by ${date(c.pickupDueAt)}`,picked_up:'Item in transit to you',received:c.inspection?`Inspection ${c.inspection.result==='pass'?'passed':'failed'}`:`Inspect by ${date(c.inspectionDueAt)}`}[c.returnStage];
  const returnCard=physical?['Return & inspection',stage||'Starts if you approve a return',`Pickup within ${p.pickupDays||5} days; inspect within ${p.inspectionDays||2} days of receipt`,'']:['Return & inspection','Not applicable','No physical return for this purchase',''];
  const r=c.refund;
  const refundCard=['Refund processing',r?(r.status==='processed'?`Processed · ${money(r.amount)}`:`Initiated · ${money(r.amount)}`):(c.status==='refund_ready'?'Ready for you to release':'Starts once you release the refund'),'Settles per Razorpay refund timelines [verify in docs]',''];
  return [windowCard,decisionCard,returnCard,refundCard].map(([label,main,sub,tone])=>`<div class="deadline-card ${tone}"><span class="deadline-label">${esc(label)}</span><span class="deadline-main">${tone==='ok'?icon.check:''}${esc(main)}</span><small>${esc(sub)}</small></div>`).join('');
}
function threadHtml(c){
  const first=c.customer.split(' ')[0];
  return c.messages.map(m=>{
    const photos=(m.evidenceIds||[]).length;
    if(m.actor==='system')return `<div class="thread-event"><span></span>${date(m.at)} · ${esc(m.text)}<span></span></div>`;
    const mine=m.actor!=='customer';
    const who=m.actor==='assistant'?`<span class="chip tone-violet chip-sm">${icon.spark}Assistant</span> for Kaveri Home Studio`:m.actor==='merchant'?'Kaveri Home Studio':esc(first);
    return `<div class="bubble-row ${mine?'mine':''}"><small>${who} · ${date(m.at)}</small><div class="bubble ${mine?'bubble-out':''}">${esc(m.text)}${photos?`<span class="bubble-meta">${photos} photo${photos>1?'s':''} attached</span>`:''}</div>${m.askedBecause?`<small>Asked because: ${esc(m.askedBecause)}</small>`:''}</div>`;
  }).join('');
}
function photosHtml(c,a){
  const photos=c.evidence;
  if(!photos.length)return '<p class="muted">No photos or files provided.</p>';
  const selId=photoSel.claim===c.id&&photos.some(e=>e.id===photoSel.id)?photoSel.id:(photos.find(e=>!e.superseded)||photos[0]).id;
  const sel=photos.find(e=>e.id===selId);
  const region=(a.observations||[]).find(o=>o.region?.evidenceId===selId)?.region;
  const n=photos.indexOf(sel)+1;
  return `<div class="viewer"><img src="${esc(imageSrc(sel))}" alt="${esc(sel.fixture?'Illustration standing in for customer photo '+n:'Customer photo '+n)}">${region?`<svg class="region" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x="${region.x*100}" y="${region.y*100}" width="${region.w*100}" height="${region.h*100}" rx="1.5"/></svg>`:''}</div>
  <div class="thumbs">${photos.map((e,i)=>`<button type="button" data-photo="${esc(e.id)}" aria-pressed="${e.id===selId}" aria-label="Photo ${i+1}, ${esc(evidenceKind[e.kind]||e.kind)}${e.superseded?', superseded':''}"><span>Photo ${i+1}</span><small class="${e.superseded?'due-urgent':''}">${e.superseded?esc(e.supersededReason||'Superseded'):esc(evidenceKind[e.kind]||e.kind)}</small></button>`).join('')}</div>
  <div class="photo-caption"><strong>Photo ${n} · ${esc(evidenceKind[sel.kind]||sel.kind)}${sel.capturedAt?` · taken ${date(sel.capturedAt)}`:''}</strong><small>${region?`Highlighted: ${esc(region.label)}. `:''}${sel.superseded?esc(sel.supersededReason||'Superseded')+'. ':''}${sel.fixture?'Illustration for this demo, not a real customer upload.':esc(sel.name)}</small></div>`;
}
function decisionHtml(c,a){
  const physical=(c.purchaseType||'physical')==='physical',rec=a.recommendation;
  const actions=[physical&&['approve_return','Approve return',' · refund after inspection'],['refund_now',physical?'Refund now':'Approve refund',''],['request_info','Ask for more',''],['decline','Decline…','']].filter(Boolean);
  const primary=actions.find(([k])=>k===rec);
  const rest=actions.filter(x=>x!==primary);
  const note=rec==='needs_judgement'?'There’s no recommendation, so none of these counts as an override.':'Approving a return doesn’t move money; you confirm the refund after inspection. If you choose differently from the recommendation, you’ll be asked why. Your reason is logged; it doesn’t change your policy.';
  return `<section class="panel" aria-labelledby="decide-h"><div class="panel-head"><h3 id="decide-h">Your decision</h3><small>Refundable: <strong class="mono">${money(c.amount-c.refunded)}</strong> to ${esc(c.method)}</small></div>
  ${primary?`<button type="button" class="primary big" data-action="${primary[0]}">${primary[1]}<span>${primary[2]}</span></button>`:''}
  <div class="decision-grid">${rest.map(([k,label])=>`<button type="button" data-action="${k}" class="${k==='decline'?'danger':''}">${label}</button>`).join('')}</div>
  <p class="muted">${note}</p></section>`;
}
function renderClaim(){
  const c=claim,a=c.assessment||{};
  const active=['needs_decision','waiting_customer'].includes(c.status),closed=['closed','declined'].includes(c.status);
  const [itemName,...variant]=c.item.split(' · ');
  const viewKey=Object.keys(views).find(k=>views[k].includes(c.status));
  const viewLabel=queueTabs.find(([k])=>k===viewKey)?.[1]||labels[c.status];
  const judgement=a.recommendation==='needs_judgement';
  const auth=a.authenticity||{};
  const [authLabel,authTone]=authStatus[auth.result]||['Inconclusive','amber'];
  const requested=c.requestedResolution==='return'?'Return':c.requestedResolution==='refund'?'Refund':'Not specified by customer';
  app.innerHTML=`
  <nav class="crumbs" aria-label="Breadcrumb"><a href="#">Returns &amp; Refunds</a><span aria-hidden="true">/</span><span>${esc(viewLabel)}</span><span aria-hidden="true">/</span><span class="mono">${esc(c.id)}</span></nav>
  <div class="claim-title"><h1>${esc(itemName)}</h1>${chip(reasonShort[c.reason]||c.reason,reasonTone[c.reason]||'grey')}${chip(labels[c.status],c.status==='needs_decision'?'blue':closed?'grey':'grey')}<span class="muted">${esc(c.customer)}’s request${variant.length?` · ${esc(variant.join(' · '))}`:''}</span></div>
  <div class="facts">
    <div><small>Customer</small><strong>${esc(c.customer)}</strong><small>${esc(c.customerContact||'No contact given')}</small></div>
    <div><small>Order</small><strong class="mono">${esc(c.orderId)}</strong><small>Customer entered “${esc(c.customerOrderReference||c.orderId)}”</small></div>
    <div><small>Payment</small><strong>${esc(c.method)} · ${esc(c.paymentStatus)}</strong><small class="mono">${esc(c.paymentId)}</small></div>
    <div><small>Delivered</small><strong>${date(c.deliveredAt)}</strong><small>From order records · demo</small></div>
    <div><small>Claim submitted</small><strong>${date(c.submittedAt)}</strong><small>Policy v${esc(c.policy?.version)} applies</small></div>
    <div><small>Customer asked for</small><strong>${esc(requested)}</strong><small>In their own words below</small></div>
  </div>
  <section class="deadlines" aria-label="Deadlines">${deadlineCards(c)}</section>
  <div class="workspace">
    <section class="col" aria-labelledby="col-claim"><h2 id="col-claim" class="col-title">Claim &amp; conversation</h2>
      <div class="panel"><div class="panel-head"><h3>What the customer sent</h3><span class="source-tag">Customer provided</span></div>
        <p class="muted">Reason selected: <strong>${esc(reasons[c.reason]||c.reason)}</strong></p>
        <blockquote class="customer-quote">${esc(c.description)}</blockquote>
        <div class="claimed"><span class="muted">${esc(c.item)}</span><strong class="mono">${money(c.amount)} claimed</strong></div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Claim thread</h3><small>Customer sees these messages</small></div>
        <div class="thread">${threadHtml(c)}</div>
        ${closed?'<p class="muted">This request is closed.</p>':`<div class="thread-controls">
          <div class="switch-row"><span id="assist-label">Assistant replies to this customer</span><button type="button" role="switch" class="switch" aria-checked="${c.assistantOn}" aria-labelledby="assist-label" data-action="assistant"><span></span></button></div>
          <small>${c.assistantOn?'On: the assistant asks for missing evidence and answers status questions. It never approves, declines or refunds.':'Off: you’ve taken over this conversation.'}</small>
          <form id="message-form"><label for="reply">Message ${esc(c.customer.split(' ')[0])} as Kaveri Home Studio</label><textarea id="reply" name="text" required maxlength="4000" rows="3" placeholder="Write a reply…"></textarea><input type="hidden" name="actor" value="merchant"><div class="form-end"><button>Send message</button></div></form>
        </div>`}
      </div>
      ${closed?'':`<details class="demo-controls"><summary>Demo: act as the customer</summary><p class="muted">Simulates customer activity. Nothing leaves this prototype.</p>
        <form id="customer-message-form"><label for="cust-reply">Customer’s reply</label><textarea id="cust-reply" name="text" required maxlength="4000" rows="2"></textarea><label class="check-label"><input class="inline-check" name="cannotProvide" type="checkbox"> Customer can’t provide the requested information</label><div class="form-end"><button>Add customer reply</button></div></form>
        ${active?`<form id="evidence-form"><label for="ev-kind">Customer uploads a photo showing</label><select id="ev-kind" name="kind"><option value="closeup">Close-up of the issue</option><option value="full">Full view of the item</option><option value="other">Something else</option></select><label for="ev-file">PNG or JPEG, up to 2 MB</label><input id="ev-file" name="file" type="file" accept="image/png,image/jpeg" required><div class="form-end"><button>Upload photo</button></div></form>`:''}
      </details>`}
    </section>
    <section class="col" aria-labelledby="col-evidence"><h2 id="col-evidence" class="col-title">Evidence</h2>
      <div class="panel"><div class="panel-head"><h3>Photos</h3><small>${c.evidence.length} received</small></div>${photosHtml(c,a)}</div>
      <div class="panel"><div class="panel-head"><h3>What the photos and description show</h3><span class="chip tone-violet chip-sm">AI · simulated</span></div>
        ${(a.observations||[]).length?`<ul class="observations">${a.observations.map(o=>{const [k,cls]=observationKind[o.kind]||['Note',''];return `<li><span class="obs-kind ${cls}">${k}</span><span>${esc(typeof o==='string'?o:o.text)}</span></li>`;}).join('')}</ul>`:'<p class="muted">No observations yet.</p>'}
        ${a.uncertainty?`<p class="muted">${esc(a.uncertainty)}</p>`:''}
      </div>
      <div class="panel ${auth.result==='inconclusive'||auth.result==='signals_found'?'panel-amber':''}"><div class="panel-head"><h3 class="with-icon">${icon.shield}Authenticity signals</h3>${chip(authLabel,authTone)}</div>
        ${(auth.checks||[]).length?`<dl class="auth-list">${auth.checks.map(x=>`<dt>${esc(x.label)}</dt><dd class="${x.result==='match_found'||x.result==='detected'||x.result==='inconsistent'?'auth-flag':x.result==='consistent'?'auth-ok':''}">${esc(authResult[x.result]||x.result)}${x.detail?`<small>${esc(x.detail)}</small>`:''}</dd>`).join('')}</dl>`:''}
        <p class="note-box">${esc(auth.details||'No detector is connected.')} Exploratory and simulated: a signal prompts review and never leads to a decline on its own.</p>
      </div>
    </section>
    <section class="col col-wide" aria-labelledby="col-decision"><h2 id="col-decision" class="col-title">Assessment &amp; decision</h2>
      <div class="panel ${judgement?'panel-grey':'panel-blue'}">
        <div class="panel-head"><span class="rec-label">${judgement?'No recommendation':icon.spark+'Recommendation'}</span><small>Simulated · ${date(a.assessedAt)}</small></div>
        <p class="rec-headline">${esc(a.headline||labels[a.recommendation]||'Assessment pending')}</p>
        <p class="rec-body">${esc(a.rationale||'')}</p>
        ${(a.needsJudgement||[]).map(t=>`<div class="judgement"><strong>Needs your judgement</strong><span>${esc(t)}</span></div>`).join('')}
      </div>
      <div class="panel"><div class="panel-head"><h3>Policy checks</h3><small>Sample policy v${esc(c.policy?.version)}</small></div>
        <ul class="checks">${(a.checks||[]).map(x=>{const [l,t]=checkResult[x.result]||[x.result,'grey'];return `<li><span class="check-result">${chip(l,t)}</span><div><strong>${esc(x.label)}</strong><small>${x.clauseId?'§'+esc(x.clauseId)+' ':''}${esc(isoToText(x.facts||x.source||''))}</small><small class="mono">${x.type==='rule'?'Rule check':'AI judgement'}</small></div></li>`;}).join('')}</ul>
      </div>
      ${active?decisionHtml(c,a):tracking(c)}
      ${active?`<button type="button" class="link-button" data-action="analyse">Re-run assessment</button>`:''}
    </section>
  </div>
  <details class="panel history"><summary>Decision history and audit trail</summary>${c.decision?`<p>Decision: <strong>${esc(labels[c.decision.action]||c.decision.action)}</strong> by ${esc(c.decision.actor)} · ${date(c.decision.at)}${c.decision.override?' · overrode the recommendation':''}<br>${esc(c.decision.reason||'No reason needed: matched the recommendation.')}</p>`:''}<ol class="timeline">${c.audit.map(e=>`<li><small>${date(e.at)} · ${esc(e.actor)}</small><strong>${esc(String(e.action).replaceAll('_',' '))}</strong></li>`).join('')}</ol></details>`;
}
function tracking(c){let actions='';if(c.status==='return_in_progress'){actions=c.returnStage==='awaiting_pickup'?btn('Simulate courier pickup','picked_up','primary'):c.returnStage==='picked_up'?btn('Simulate item received','received','primary'):`<p>Item received. Inspection due ${date(c.inspectionDueAt)}</p>${btn('Inspection passed','pass','primary')}${btn('Inspection failed','fail','danger')}`;if(c.returnStage!=='received')actions+='<p class="muted">Inspection unlocks only after the item is received.</p>';}if(c.status==='refund_ready')actions=btn('Review refund amount','review-refund','primary');if(c.status==='refund_processing')actions=`<p>Demo refund ${money(c.refund.amount)} is processing.</p>${btn('Simulate processed','processed','primary')}${btn('Simulate failure','failed')}`;if(c.status==='inspection_review')actions=`<p>Inspection failed: ${esc(c.inspection.reason)}</p>${btn('Decline with policy reason','inspection-decline','danger')}${btn('Grant refund exception','inspection-refund')}`;if(c.status==='closed')actions='<p class="pill good">Demo refund processed · request closed</p>';return `<section class="card"><h2>Return & refund tracking</h2><p>${esc(({awaiting_pickup:'Awaiting pickup',picked_up:'In transit to merchant',received:'Received by merchant'})[c.returnStage]||'Return not started')}</p><div class="actions">${actions}</div>${c.pickupDueAt&&c.returnStage==='awaiting_pickup'?`<p class="muted">Sample pickup deadline: ${date(c.pickupDueAt)}</p>`:''}${c.refund?`<p class="muted">${esc(c.refund.id)}<br>Original payment method: ${esc(c.refund.method)}</p>`:''}</section>`;}
function dialog(title,content,submit){modal.className='';modal.innerHTML=`<form id="dialog-form"><h1>${title}</h1><div id="dialog-error" role="alert"></div>${content}<div class="actions"><button type="button" data-action="cancel">Cancel</button><button class="primary" type="submit">Confirm</button></div></form>`;modal.showModal();modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const ok=await submit(new FormData(e.target));if(ok)modal.close();else modal.querySelector('#dialog-error').textContent='Could not save. Check the error message in the dashboard.';}catch(err){modal.querySelector('#dialog-error').textContent=err.message;}finally{button.disabled=false;}};}
// Confirmation dialogs (C4): design/Confirm.dc.html, RefundConfirm.dc.html, InspectionFailed.dc.html.
const closeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
async function save(action,body){claim=await api(`claims/${claim.id}/${action}`,{...body,version:claim.version});await refresh();notice('Saved to the claim record.');return true;}
function openDialog({title,body,submitLabel,danger=false,onSubmit,onReady}){
  const c=claim;
  modal.className='dlg';
  modal.innerHTML=`<form id="dialog-form" class="confirm">
    <div class="dlg-head"><div><small class="mono">${esc(c.id)} · ${esc(c.orderId)} · ${esc(c.customer)}</small><h2 id="dlg-title">${title}</h2></div><button type="button" class="icon-button" data-action="cancel" aria-label="Close">${closeIcon}</button></div>
    <div class="dlg-body"><div id="dialog-error" class="dialog-error" role="alert"></div>${body}</div>
    <div class="dlg-foot"><small>Logged as Nikhil Verma (Owner), with the recommendation, your choice and any reason.</small><div class="actions"><button type="button" data-action="cancel">Cancel</button><button type="submit" class="${danger?'danger-solid':'primary'}">${submitLabel}</button></div></div>
  </form>`;
  modal.setAttribute('aria-labelledby','dlg-title');
  const form=modal.querySelector('form');
  modal.showModal();
  onReady?.(form);
  form.onsubmit=async e=>{
    e.preventDefault();
    const button=form.querySelector('[type=submit]'),error=form.querySelector('#dialog-error');
    button.disabled=true;error.textContent='';
    try{if(await onSubmit(new FormData(form),form))modal.close();}
    catch(err){error.textContent=err.message;}
    finally{button.disabled=false;}
  };
}
const firstName=c=>c.customer.split(' ')[0];
const itemNameOf=c=>c.item.split(' · ')[0];
const sign='\n\nKaveri Home Studio';
function steps(list){return `<div class="dlg-section"><span class="dlg-label">What happens next</span><ol class="steps">${list.map(([when,what,sub],i)=>`<li class="${i===0?'now':''}"><span>${esc(when)}</span><strong>${esc(what)}</strong><small>${esc(sub)}</small></li>`).join('')}</ol></div>`;}
function decisionDialog(action){
  const c=claim,a=c.assessment||{},p=c.policy||{};
  const physical=(c.purchaseType||'physical')==='physical';
  const rec=a.recommendation,judgement=rec==='needs_judgement',override=!judgement&&action!==rec;
  const refundable=money(c.amount-c.refunded),item=itemNameOf(c).toLowerCase(),first=firstName(c);
  const windowClause=(a.checks||[]).find(x=>x.label==='Claim window')?.clauseId||'2.1';
  const titles={approve_return:'Approve the return?',refund_now:physical?'Refund now, without a return?':'Approve the refund?',request_info:'Ask the customer for more?',decline:'Decline this request?'};
  const submit={approve_return:'Approve return & send',refund_now:'Approve refund & send',request_info:'Send request',decline:'Decline & send'};
  const drafts={
    approve_return:`Hi ${first}, sorry about the problem with your ${item}. We've approved your return. Our courier partner will collect it within ${p.pickupDays||5} days; please keep it in the original box if you can. Once it reaches us and is inspected, we'll refund ${refundable} to your original ${c.method} payment method.`,
    refund_now:`Hi ${first}, sorry about the problem with your ${item}. We're refunding ${refundable} to your original ${c.method} payment method, and you'll get a confirmation once it's on its way.${physical?' There’s no need to send the item back.':''}`,
    request_info:`Hi ${first}, thanks for your request. To help us review it, could you send [what you need]? If you can't, just reply and a person will review your request.`,
    decline:`Hi ${first}, we've reviewed your request and can't offer a return or refund this time${c.claimWindowMet===false?` because it arrived after our ${p.claimDays||7}-day window (policy §${windowClause})`:' because [reason]'}. If you think we've missed something, reply to this message.`,
  };
  const reasonLabel=override?`Why are you choosing differently from the recommendation? (required, internal)`:{decline:'Reason for declining (required, logged)',request_info:'What do you need from the customer? (required, logged)',refund_now:physical?'Why skip the return and inspection? (required, owner exception)':'Note (optional, internal)'}[action];
  const reasonRequired=override||action==='decline'||action==='request_info'||(action==='refund_now'&&physical);
  const summary={approve_return:['Refund after inspection',refundable],refund_now:['Refund, after you confirm the amount',refundable],request_info:['Refund','Not decided yet'],decline:['Refund','None']}[action];
  const next={
    approve_return:steps([['Now','Return approved','Customer notified'],[`By ${shortDate(Date.now()+(p.pickupDays||5)*DAY)}`,'Courier pickup',`Within ${p.pickupDays||5} days`],[`${p.inspectionDays||2} days after receipt`,'You inspect','Pass or fail, with notes'],['You confirm',`Release ${refundable}`,'Then Razorpay refund timelines']]),
    refund_now:steps([['Now','Refund approved',physical?'No return or inspection':'Customer notified'],['Next','You confirm the amount','Full or partial, with a reason'],['Then','Refund initiated','Razorpay refund timelines']]),
    request_info:steps([['Now','Message sent','Request moves to Waiting for customer'],['Customer replies','Reassessed','Comes back to Needs your decision']]),
    decline:steps([['Now','Request declined','Customer gets your message'],['Afterwards','Kept on record','Reason and policy clause logged']]),
  }[action];
  const compare=judgement?`<div class="compare neutral">There’s no recommendation for this request, so this isn’t an override.</div>`:override?`<div class="compare warn"><strong>This differs from the recommendation</strong><span>Recommended: ${esc(labels[rec]||rec)}. Your reason is logged and used to review future recommendations; it doesn’t change your policy.</span></div>`:`<div class="compare ok">${icon.check}Same as the recommendation</div>`;
  openDialog({
    title:titles[action],submitLabel:submit[action],danger:action==='decline',
    body:`<div class="dlg-tiles"><div><small>Item</small><strong>${esc(c.item)}</strong></div><div><small>${summary[0]}</small><strong class="mono">${summary[1]}</strong></div><div><small>Refund to</small><strong>Original method · ${esc(c.method)}</strong></div></div>
      ${next}
      <div class="dlg-section"><span class="dlg-label">Compared with the recommendation</span>${compare}</div>
      ${reasonLabel?`<label for="dlg-reason">${reasonLabel}</label><textarea id="dlg-reason" name="reason" rows="2" ${reasonRequired?'required':''}></textarea>`:''}
      <div class="dlg-section"><label for="dlg-msg" class="dlg-label">Message to customer <small>Drafted for you · edit freely · posted in the claim thread</small></label><textarea id="dlg-msg" name="message" rows="6" required maxlength="4000">${esc(drafts[action]+sign)}</textarea></div>`,
    onSubmit:f=>{
      const message=f.get('message');
      if(/\[(what you need|reason)\]/.test(message))throw Error('Replace the text in [square brackets] in the message before sending.');
      return save('decision',{decision:action,reason:f.get('reason')||'',message,confirmed:true});
    },
  });
}
function refundDialog(){
  const c=claim,balance=c.amount-c.refunded,key=crypto.randomUUID(),first=firstName(c);
  const lastFail=(c.refundHistory||[]).at(-1);
  const basis=c.inspection?.result==='pass'?`Inspection passed · ${date(c.inspection.at)} · ${c.inspection.actor||'Nikhil Verma'}`:c.inspectionException?'Refund exception approved':'Ready to refund';
  openDialog({
    title:'Release the refund?',submitLabel:`Refund ${money(balance)}`,
    body:`${lastFail?`<div class="compare bad"><strong>The last attempt failed</strong><span>${esc(lastFail.failureReason||'No reason given.')} This is a new attempt with its own reference.</span></div>`:''}
      <div class="compare ok">${icon.check}${esc(basis)}</div>
      <fieldset class="dlg-section amount-choice"><legend class="dlg-label">Amount</legend>
        <label class="radio-card"><input type="radio" name="mode" value="full" checked><span><strong>Full refund</strong><small>${money(balance)}</small></span></label>
        <label class="radio-card"><input type="radio" name="mode" value="partial"><span><strong>Partial refund</strong><small>Reason required</small></span></label>
      </fieldset>
      <div class="partial-fields" hidden><label for="dlg-amount">Amount (₹)</label><input id="dlg-amount" name="amount" type="number" min="0.01" max="${balance/100}" step="0.01" value="${balance/100}"><label for="dlg-partial">Reason for a partial refund (required, shared with the customer)</label><input id="dlg-partial" name="partialReason" maxlength="4000"></div>
      <dl class="dlg-facts"><dt>Refund to</dt><dd>Original method · ${esc(c.method)}</dd><dt>Payment</dt><dd class="mono">${esc(c.paymentId)}</dd><dt>Refundable balance</dt><dd class="mono">${money(balance)}</dd><dt>After you confirm</dt><dd>Settles per Razorpay refund timelines [verify in docs]</dd></dl>
      <label for="dlg-msg" class="dlg-label">Message to customer</label><textarea id="dlg-msg" name="message" rows="4" required maxlength="4000">${esc(`Hi ${first}, we've started your refund of ${money(balance)} to your original ${c.method} payment method. Thanks for your patience.`+sign)}</textarea>
      <label class="check-label"><input type="checkbox" name="checked" required class="inline-check"> <span id="dlg-confirm-text">I’ve checked the amount: refund ${money(balance)} to the original ${esc(c.method)} payment method.</span></label>
      <p class="muted">Prototype: refunds are simulated. No real money moves.</p>`,
    onReady:form=>{
      const sync=()=>{
        const partial=form.elements.mode.value==='partial',fields=form.querySelector('.partial-fields');
        fields.hidden=!partial;form.elements.partialReason.required=partial;
        const paise=partial?Math.round(Number(form.elements.amount.value)*100):balance;
        const shown=Number.isFinite(paise)&&paise>0?money(paise):'—';
        form.querySelector('[type=submit]').textContent=`Refund ${shown}`;
        form.querySelector('#dlg-confirm-text').textContent=`I’ve checked the amount: refund ${shown} to the original ${c.method} payment method.`;
      };
      form.addEventListener('change',sync);form.addEventListener('input',sync);
    },
    onSubmit:f=>{
      const partial=f.get('mode')==='partial';
      const amount=partial?Math.round(Number(f.get('amount'))*100):balance;
      return save('refund',{amount,key,message:f.get('message'),confirmed:true,...(amount<balance?{partialReason:f.get('partialReason')}:{})});
    },
  });
}
function inspectionDialog(result){
  const fail=result==='fail';
  openDialog({
    title:fail?'Record a failed inspection':'Record a passed inspection',submitLabel:fail?'Record failed inspection':'Record pass',danger:fail,
    body:`<p class="muted">${fail?'Note what doesn’t match the claim. You decide next whether to decline or refund anyway.':'The item matches the claim and meets the condition rules (§2.4). You confirm the refund amount next.'}</p>
      <label for="dlg-notes">${fail?'What did you find? (required)':'Notes (optional)'}</label><textarea id="dlg-notes" name="reason" rows="3" ${fail?'required':''} placeholder="${fail?'e.g. Signs of use; tags removed':'e.g. Crack matches the claim photos'}"></textarea>`,
    onSubmit:f=>save('inspection',{result,reason:f.get('reason')||''}),
  });
}
function resolveDialog(initial='decline'){
  const c=claim,first=firstName(c),item=itemNameOf(c).toLowerCase();
  const msgs={decline:`Hi ${first}, we inspected the ${item} and found ${c.inspection?.reason?c.inspection.reason.replace(/\.$/,'').toLowerCase():'[what you found]'}, so we can't offer a refund under our returns policy (§2.4). We'll send it back to you at no cost.`,refund:`Hi ${first}, we've received the ${item}. As a one-time exception, we'll refund ${money(c.amount-c.refunded)} to your original ${c.method} payment method. You'll see a confirmation once the refund is on its way.`};
  openDialog({
    title:'Resolve the failed inspection',submitLabel:'Decline & send message',danger:true,
    body:`<div class="compare bad"><strong>Inspection failed</strong><span>${esc(c.inspection?.reason||'')}</span></div>
      <fieldset class="dlg-section"><legend class="dlg-label">Your decision</legend>
        <label class="radio-card"><input type="radio" name="resolution" value="decline" checked><span><strong>Decline the refund</strong><small>Policy reason required. The customer sees it.</small></span></label>
        <label class="radio-card"><input type="radio" name="resolution" value="refund"><span><strong>Refund anyway (exception)</strong><small>Your reason is logged. You confirm the amount next.</small></span></label>
      </fieldset>
      <label for="dlg-reason" id="dlg-reason-label">Policy reason (required)</label><textarea id="dlg-reason" name="reason" rows="2" required></textarea>
      <label for="dlg-msg">Message to ${esc(first)}</label><textarea id="dlg-msg" name="message" rows="5" required maxlength="4000">${esc(msgs.decline+sign)}</textarea>`,
    onReady:form=>{form.addEventListener('change',e=>{
      if(e.target.name!=='resolution')return;
      const decline=e.target.value==='decline',btn=form.querySelector('[type=submit]');
      form.querySelector('#dlg-reason-label').textContent=decline?'Policy reason (required)':'Why make an exception? (required, internal)';
      form.elements.message.value=msgs[e.target.value]+sign;
      btn.textContent=decline?'Decline & send message':'Approve exception';btn.className=decline?'danger-solid':'primary';
    });if(initial==='refund'){const r=form.querySelector('input[value=refund]');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));}},
    onSubmit:f=>{
      if(/\[what you found\]/.test(f.get('message')))throw Error('Replace the text in [square brackets] in the message before sending.');
      return save('resolve-inspection',{resolution:f.get('resolution'),reason:f.get('reason'),message:f.get('message'),confirmed:true});
    },
  });
}

document.addEventListener('click',async e=>{const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;query='';document.querySelector('#search').value='';renderQueue();return;}const t=e.target.closest('[data-type]');if(t){type=t.dataset.type;renderQueue();return;}const row=e.target.closest('tr[data-href]');if(row&&!e.target.closest('a,button')){location.hash=row.dataset.href;return;}const ph=e.target.closest('[data-photo]');if(ph){photoSel={claim:claim.id,id:ph.dataset.photo};renderClaim();return;}const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='cancel'){modal.close();return;}if(a==='new'){dialog('Customer request form',`<p>Preview of the information a customer sends. Photos are requested only when relevant to the issue.</p><label>Your name<input name="customer" required maxlength="4000"></label><label>Email or phone (optional)<input name="customerContact" maxlength="4000"></label><label>Order or booking reference<input name="customerOrderReference" required maxlength="4000"></label><label>Item or service<input name="item" required maxlength="4000"></label><label>What did you purchase?<select name="purchaseType">${Object.entries(purchaseTypes).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>What would you like?<select name="requestedResolution"><option value="refund">Refund</option><option value="return">Return</option></select></label><label>Reason<select name="reason">${Object.entries(reasons).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>Tell us what happened<textarea name="description" required maxlength="4000" placeholder="Describe the issue in your own words…"></textarea></label><label>Photos or screenshots (optional)<input type="file" name="initialFile" accept="image/png,image/jpeg"></label><small>Attach a PNG or JPEG up to 2 MB if it helps explain the issue.</small><details class="demo-controls"><summary>Demo order setup · not customer-provided</summary><label>Mock amount paid (INR)<input name="amount" type="number" min="1" step="0.01" value="3499" required></label><p class="muted">In a connected product, this comes from the order. This demo uses a mock payment and delivery date.</p></details>`,async f=>{const file=f.get('initialFile');if(file?.size>2*1024*1024)throw Error('Please choose an image smaller than 2 MB.');let c=await api('claims',{customer:f.get('customer'),item:f.get('item'),customerContact:f.get('customerContact'),customerOrderReference:f.get('customerOrderReference'),purchaseType:f.get('purchaseType'),requestedResolution:f.get('requestedResolution'),amount:Math.round(Number(f.get('amount'))*100),reason:f.get('reason'),description:f.get('description')});if(file?.size){const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});c=await api(`claims/${c.id}/evidence`,{version:c.version,kind:'other',name:file.name,data});}location.hash=c.id;await refresh();return true;});modal.querySelector('button[type="submit"]').textContent='Submit request';return;}if(['approve_return','refund_now','request_info','decline'].includes(a)){decisionDialog(a);return;}if(a==='review-refund'){refundDialog();return;}if(['picked_up','received'].includes(a)){await act('return',{stage:a});return;}if(['pass','fail'].includes(a)){inspectionDialog(a);return;}if(a.startsWith('inspection-')){resolveDialog(a==='inspection-refund'?'refund':'decline');return;}if(['processed','failed'].includes(a)){await act('simulate-refund',{result:a});return;}if(a==='assistant')await act('assistant',{enabled:!claim.assistantOn});if(a==='analyse')await act('analyse');});
document.addEventListener('change',e=>{if(e.target.name==='purchaseType'){const f=e.target.form,physical=e.target.value==='physical';const resolution=f.elements.requestedResolution;resolution.querySelector('option[value="return"]').disabled=!physical;if(!physical)resolution.value='refund';const reason=f.elements.reason;for(const o of reason.options)o.disabled=!physical&&['damaged','wrong_item','missing_item','preference'].includes(o.value);reason.value=physical?'damaged':e.target.value==='digital'?'digital_issue':e.target.value==='service'?'service_issue':'cancellation';}});
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;if(location.hash){location.hash='';return;}renderQueue();}});
document.addEventListener('submit',async e=>{if(e.target.id==='customer-message-form'){e.preventDefault();const f=new FormData(e.target);await act('messages',{actor:'customer',text:f.get('text'),cannotProvide:f.get('cannotProvide')==='on'});}if(e.target.id==='message-form'){e.preventDefault();const f=new FormData(e.target);await act('messages',{actor:f.get('actor'),text:f.get('text'),cannotProvide:f.get('cannotProvide')==='on'});}if(e.target.id==='evidence-form'){e.preventDefault();const f=new FormData(e.target),file=f.get('file');if(file.size>2*1024*1024){notice('Image must be smaller than 2 MB.',true);return;}const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});await act('evidence',{kind:f.get('kind'),name:file.name,data});}});
window.addEventListener('hashchange',()=>(document.querySelector('#notice').innerHTML='',refresh()).catch(e=>notice(e.message,true)));
await api('session');await refresh();
