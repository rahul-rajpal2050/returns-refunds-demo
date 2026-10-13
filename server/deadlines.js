const DAY = 86400000;

function latestRequestAt(c) {
  const times = c.messages.filter(m=>m.actor==='assistant' && !m.reminder).map(m=>m.at);
  if(c.decision?.action==='request_info') times.push(c.decision.at);
  return times.filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1) || c.submittedAt;
}
export function ensureReplyWindow(c) {
  if(c.status!=='waiting_customer') return false;
  const requestedAt=latestRequestAt(c);
  if(c.customerReplyRequestedAt===requestedAt && c.customerReplyDueAt) return false;
  c.customerReplyRequestedAt=requestedAt;
  c.customerReplyDueAt=new Date(Date.parse(requestedAt)+(c.policy.customerReplyDays??3)*DAY).toISOString();
  c.customerReminderSentAt=null;
  c.customerReminderSource=null;
  return true;
}
function event(c, at, actor, action, detail) {
  c.audit.push({id:globalThis.crypto.randomUUID(),at,actor,action,detail});
}
export function sendReminder(c, now, actor='assistant') {
  const at=new Date(now).toISOString();
  const replyBy=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(c.customerReplyDueAt));
  c.messages.push({id:globalThis.crypto.randomUUID(),at,actor,reminder:true,text:`A reminder: please reply with the requested information by ${replyBy} IST. If you cannot provide it, let us know so a person can review your request.`});
  c.customerReminderSentAt=at;
  c.customerReminderSource=actor==='merchant'?'manual':'automatic';
  event(c,at,actor,'customer_reminder','One reminder sent in the local claim thread; no external message was sent.');
}
export function advanceReplyDeadline(c, now) {
  if(c.status!=='waiting_customer') return false;
  let changed=ensureReplyWindow(c);
  const due=Date.parse(c.customerReplyDueAt);
  if(now>=due) {
    const at=new Date(now).toISOString();
    c.status='needs_decision';
    c.customerReplyExpiredAt=at;
    c.assessment={...c.assessment,recommendation:'needs_judgement',headline:'Review the request manually.',needsJudgement:[...(c.assessment.needsJudgement||[]),'The customer reply window expired. Decide with the available information; this is not an automatic decline.']};
    event(c,at,'system','customer_reply_expired','Reply deadline passed. Sent to the merchant for review; no automatic decline.');
    changed=true;
  } else if(now>=due-DAY && !c.customerReminderSentAt && c.assistantOn) {
    sendReminder(c,now);
    changed=true;
  }
  return changed;
}
export function runDueTasks(store, now=Date.now()) {
  let changed=0;
  const update=()=>{
    for(const raw of store.all()) {const c=structuredClone(raw);if(advanceReplyDeadline(c,now)) {c.version++;store.save(c);changed++;}}
  };
  if(store.transaction)store.transaction(update);else update();
  return changed;
}
