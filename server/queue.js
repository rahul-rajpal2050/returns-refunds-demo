const DAY=86400000;
export const statuses=['needs_decision','waiting_customer','return_in_progress','inspection_review','refund_ready','refund_processing','closed','declined'];
export function nextDeadline(c, now=Date.now()) {
  let kind='none',at=null;
  if(c.status==='needs_decision') {kind='decision';at=c.decisionDueAt;}
  else if(c.status==='waiting_customer') {kind='customer_reply';at=c.customerReplyDueAt;}
  else if(c.status==='inspection_review') {kind='inspection';at=c.inspectionDueAt;}
  else if(c.status==='return_in_progress' && c.returnStage==='awaiting_pickup') {kind='pickup';at=c.pickupDueAt;}
  else if(c.status==='return_in_progress' && c.returnStage==='received') {kind='inspection';at=c.inspectionDueAt;}
  // Do not invent logistics arrival or refund settlement dates.
  if(!at || !Number.isFinite(Date.parse(at))) return {kind:'none',at:null,urgent:false};
  return {kind,at,urgent:Date.parse(at)-now<DAY};
}
export function claimWindow(c) {
  const delivered=Date.parse(c.deliveredAt),submitted=Date.parse(c.submittedAt);
  const closes=delivered+c.policy.claimDays*DAY;
  // India has a fixed +05:30 offset; count date boundaries, not elapsed 24-hour blocks.
  const indiaOffset=19800000;
  return {
    claimWindowClosesAt:new Date(closes).toISOString(),
    claimDayOfWindow:Math.floor((submitted+indiaOffset)/DAY)-Math.floor((delivered+indiaOffset)/DAY),
    claimWindowMet:submitted<=closes,
  };
}
export function withQueueFields(c,now) {return {...c,...claimWindow(c),nextDeadline:nextDeadline(c,now)};}
export function queueSummary(claims,now=Date.now()) {
  const counts={open:0,byStatus:Object.fromEntries(statuses.map(s=>[s,0])),dueWithin24h:0,refundsProcessingAmount:0};
  for(const c of claims) {
    counts.byStatus[c.status]=(counts.byStatus[c.status]||0)+1;
    if(!['closed','declined'].includes(c.status))counts.open++;
    if(nextDeadline(c,now).urgent)counts.dueWithin24h++;
    if(c.status==='refund_processing' && c.refund?.status==='processing')counts.refundsProcessingAmount+=c.refund.amount;
  }
  return counts;
}
