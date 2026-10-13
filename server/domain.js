import { loadSeed, fixtureAssessment } from './seed.js';
import { claimWindow } from './queue.js';
import { ensureReplyWindow, sendReminder } from './deadlines.js';
export const policy = { version: '2.3', illustrative: true, claimDays: 7, responseDays: 4, pickupDays: 5, inspectionDays: 2, customerReplyDays: 3, clauses: { window: '§2.1 Return requests must be submitted within 7 days of delivery under this sample policy.', category: '§1.3 Lighting and décor are returnable; custom/final-sale items are excluded.', evidence: '§3.2 Damage claims require a clear close-up and full view.', inspection: '§4.1 Refunds for damage claims require inspection unless the owner grants an explicit exception.' } };
export class DomainError extends Error { constructor(message, status=422) { super(message); this.status=status; } }
export function requireThat(ok, message, status) { if (!ok) throw new DomainError(message, status); }
export function note(c, actor, action, detail, now=Date.now()) { c.audit.push({id:globalThis.crypto.randomUUID(), at:new Date(now).toISOString(), actor, action, detail}); }
export function message(c, actor, text, now=Date.now()) { c.messages.push({id:globalThis.crypto.randomUUID(), at:new Date(now).toISOString(), actor, text}); }
export function text(v, label, required=true) { requireThat(typeof v==='string' && v.length<=4000 && (!required || v.trim().length>0), `${label} must be text${required?' and cannot be empty':''} (max 4000 characters).`); return v.trim(); }
export function analyse(c, now=Date.now()) {
  if(c.assessmentFixture && c.evidence.every(e=>e.fixture)) {
    c.assessment=fixtureAssessment(c,c.assessmentFixture,new Date(now).toISOString());
    note(c,'assistant','assessment',c.assessment.recommendation,now);return c;
  }
  const inWindow = claimWindow(c).claimWindowMet;
  const category = !c.excluded;
  const physical=(c.purchaseType||'physical')==='physical';
  const views = c.evidence.map(e=>e.kind);
  const complete = !physical ? c.description.length>10 : c.reason==='damaged' ? views.includes('closeup') && views.includes('full') : c.reason==='wrong_item' ? views.includes('full') : c.description.length>10;
  c.assessment = { mode:'simulated', assessedAt:new Date(now).toISOString(), recommendation: !inWindow || !category ? 'decline' : !complete ? 'request_info' : physical ? 'approve_return' : 'refund_now',
    rationale: !inWindow ? 'Submitted outside the sample merchant claim window; review exceptions before declining.' : !category ? 'Item is excluded by the sample policy; review exceptions.' : !complete ? 'Evidence is incomplete. Ask for the missing views.' : physical ? 'The sample evidence scenario is consistent with the claim. Review the customer information and inspect the returned item before refunding.' : 'The customer described the issue. Review the applicable cancellation or refund terms before approving a refund.',
    checks:[{label:'Claim window', result:inWindow?'pass':'review', source:c.policy.clauses.window, type:'rule'}, {label:physical?'Item category':'Purchase eligibility', result:physical&&category?'pass':'review', source:physical?c.policy.clauses.category:'Review this merchant’s service, subscription or digital refund terms. Eligibility is not independently verified in this prototype.',type:'rule'}, {label:'Required evidence',result:complete?'complete':'missing', source:c.reason==='damaged'?c.policy.clauses.evidence:c.reason==='wrong_item'?'Sample workflow: full view of received item.':'Sample workflow: a description of the request.',type:'checklist'}],
    observations: c.evidence.filter(e=>e.fixture).length ? ['Demo fixture: crack visible in the close-up; sage lamp matches the sample order.'] : [c.evidence.length?'Attachments saved as provided. Their contents have not been verified by a vision model.':'No attachments were provided. The customer’s description is available for your review.'],
    uncertainty: physical ? 'Photos alone cannot establish when damage occurred. File descriptions are customer-provided and are not visual verification.' : 'The service, subscription or digital purchase has not been independently verified. Review the relevant records before deciding.',
    authenticity: {result:'inconclusive', details:'No watermark, provenance, online-image search, or manipulation detector is connected. Absence of a signal is not proof of authenticity.'} };
  if (['needs_decision','waiting_customer'].includes(c.status)) c.status=complete||!c.assistantOn?'needs_decision':'waiting_customer';
  if (!complete && c.assistantOn) {
    const prompt=c.reason==='damaged' ? `Please provide ${[!views.includes('closeup')?'a clear close-up of the damage':'',!views.includes('full')?'a full view of the item':''].filter(Boolean).join(' and ')}. These help us review your claim under policy §3.2. If you cannot provide them, ask for human review.` : c.reason==='wrong_item' ? 'Please provide a full view of the item you received so the merchant can compare it with your order. If you cannot provide a photo, ask for human review.' : 'Please describe your request in more detail so the merchant can review it. You can also ask for human review.';
    if(!c.messages.some(m=>m.actor==='assistant' && m.text===prompt)) message(c,'assistant',prompt,now);
  }
  ensureReplyWindow(c);
  note(c,'assistant','assessment',c.assessment.recommendation,now); return c;
}
export function seed(store, source, now = Date.now()) { return loadSeed(store, source, policy, now); }
export function newClaim(b, now=Date.now()) {
 const customer=text(b.customer,'Customer'),item=text(b.item,'Item');text(b.description,'Description');const description=b.description;
 const purchaseType=b.purchaseType??'physical',requestedResolution=b.requestedResolution??null;
 requireThat(['physical','digital','service','subscription'].includes(purchaseType),'Invalid purchase type.');
 requireThat(requestedResolution===null||['refund','return'].includes(requestedResolution),'Invalid requested resolution.');
 requireThat(purchaseType==='physical'||requestedResolution!=='return','Returns apply to physical products. Choose a refund for this purchase.');
 const customerContact=text(b.customerContact??'','Contact',false),customerOrderReference=text(b.customerOrderReference??'','Customer order reference',false);
 requireThat(Number.isSafeInteger(b.amount) && b.amount>0 && b.amount<=100000000,'Amount must be positive integer paise, up to INR 10 lakh.');
 requireThat(['damaged','preference','wrong_item','missing_item','service_issue','digital_issue','duplicate_payment','cancellation'].includes(b.reason),'Invalid reason.');
 const id='RR-'+String(now)+String(Math.floor(Math.random()*1000)).padStart(3,'0');
 const c={id,customer,item,description,purchaseType,requestedResolution,customerContact,customerOrderReference,reason:b.reason,amount:b.amount,refunded:0,method:'UPI',paymentId:'pay_MOCK_'+id,orderId:'ORD-MOCK-'+id,paymentStatus:'captured',excluded:false,deliveredAt:new Date(now-86400000).toISOString(),submittedAt:new Date(now).toISOString(),decisionDueAt:new Date(now+policy.responseDays*86400000).toISOString(),policy:structuredClone(policy),status:'needs_decision',assistantOn:true,evidence:[],messages:[],audit:[],refund:null,inspection:null,returnStage:null,version:1};
 if(purchaseType!=='physical')c.policy.clauses.inspection='No physical return or inspection applies to this purchase. Review the merchant’s refund terms before confirming a refund.';
 message(c,'customer',description,now); note(c,'system','created','Mock captured payment; delivered one day before claim.',now); return analyse(c,now);
}
export function mutate(c, action, b, {now=Date.now()}={}) {
 requireThat(!['closed','declined'].includes(c.status),'This claim is closed.',409);
 switch(action) {
 case 'remind': {
  requireThat(c.status==='waiting_customer','Reminders apply only while waiting for the customer.',409);
  ensureReplyWindow(c);
  requireThat(now<Date.parse(c.customerReplyDueAt),'The reply deadline has passed; review this claim manually.',409);
  requireThat(!c.customerReminderSentAt,'A reminder has already been sent for this reply window.',409);
  sendReminder(c,now,'merchant');break;
 }
 case 'analyse': analyse(c,now); break;
 case 'assistant': requireThat(typeof b.enabled==='boolean','enabled must be boolean.'); c.assistantOn=b.enabled; if(!b.enabled && c.status==='waiting_customer') c.status='needs_decision'; break;
 case 'messages': {
  requireThat(['customer','merchant'].includes(b.actor),'actor must be customer or merchant.');
  text(b.text,'Message');message(c,b.actor,b.actor==='customer'?b.text:b.text.trim(),now); if(b.actor==='customer' && c.status==='waiting_customer') {c.status='needs_decision';c.customerReplyReceivedAt=new Date(now).toISOString();c.assessment={...c.assessment,recommendation:'needs_judgement',headline:'Review the customer’s reply.'};note(c,'customer','human_review',b.cannotProvide===true?'Customer cannot provide requested evidence.':'Customer replied; merchant review required.',now);} break;
 }
 case 'evidence': {
  requireThat(['needs_decision','waiting_customer'].includes(c.status),'Evidence collection is complete for this decision.',409);
  requireThat(c.evidence.length<8,'Maximum 8 evidence attachments.');
  requireThat(['closeup','full','other'].includes(b.kind),'Invalid evidence kind.');
  requireThat(typeof b.data==='string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(b.data) && b.data.length<=2800000,'Upload a PNG/JPEG up to 2 MB.');
  let bytes;try{bytes=Uint8Array.from(atob(b.data.split(',')[1]),char=>char.charCodeAt(0));}catch{requireThat(false,'Invalid image encoding.');}
  const matches=signature=>signature.every((byte,index)=>bytes[index]===byte);
  requireThat(bytes.length>8 && bytes.length<=2*1024*1024 && (matches([137,80,78,71,13,10,26,10]) || matches([255,216,255])),'Image signature or size does not match a PNG/JPEG up to 2 MB.');
  c.evidence.push({id:globalThis.crypto.randomUUID(),kind:b.kind,name:text(b.name,'Filename'),data:b.data,fixture:false}); analyse(c,now); break;
 }
 case 'decision': {
  requireThat(['needs_decision','waiting_customer'].includes(c.status),'Decision already recorded.',409);
  requireThat(['approve_return','refund_now','request_info','decline'].includes(b.decision),'Invalid decision.');
  const override=c.assessment.recommendation!=='needs_judgement' && b.decision!==c.assessment.recommendation;
  const why=text(b.reason??'','Decision reason',override || b.decision==='decline' || b.decision==='request_info');
  const customerMessage=text(b.message,'Customer message');
  requireThat(b.confirmed===true,'Merchant confirmation is required.');
  c.decision={action:b.decision,reason:why,override,actor:'Nikhil Verma (Owner)',at:new Date(now).toISOString(),recommendation:c.assessment.recommendation};
  if(b.decision==='approve_return') {requireThat((c.purchaseType||'physical')==='physical','Returns apply to physical products.');c.status='return_in_progress'; c.returnStage='awaiting_pickup'; c.pickupDueAt=new Date(now+c.policy.pickupDays*86400000).toISOString();}
  if(b.decision==='refund_now') {c.status='refund_ready';c.inspectionException=true;requireThat((c.purchaseType||'physical')!=='physical'||why.length>0,'Immediate refund requires an exception reason.');}
  if(b.decision==='decline') c.status='declined';
  if(b.decision==='request_info') {c.status='waiting_customer';c.customerReplyRequestedAt=null;delete c.customerReplyExpiredAt;delete c.customerReplyReceivedAt;}
  message(c,'merchant',customerMessage,now); break;
 }
 case 'return': {
  requireThat(c.status==='return_in_progress','No active return.',409);
  requireThat((b.stage==='picked_up' && c.returnStage==='awaiting_pickup') || (b.stage==='received' && c.returnStage==='picked_up'),'Invalid return transition.',409);
  c.returnStage=b.stage;
  if(b.stage==='received') c.inspectionDueAt=new Date(now+c.policy.inspectionDays*86400000).toISOString();
  break;
 }
 case 'inspection': {
  requireThat(c.status==='return_in_progress' && c.returnStage==='received','Inspection is available only after receipt.',409);
  requireThat(['pass','fail'].includes(b.result),'Invalid inspection result.');
  const why=text(b.reason??'','Inspection reason',b.result==='fail');
  c.inspection={result:b.result,reason:why,at:new Date(now).toISOString(),actor:'Nikhil Verma (Owner)'};
  c.status=b.result==='pass'?'refund_ready':'inspection_review'; break;
 }
 case 'resolve-inspection': {
  requireThat(c.status==='inspection_review','No failed inspection to resolve.',409);
  requireThat(['refund','decline'].includes(b.resolution),'Invalid resolution.');
  const why=text(b.reason,'Policy or exception reason');
  requireThat(b.confirmed===true,'Merchant confirmation required.');
  c.status=b.resolution==='refund'?'refund_ready':'declined'; c.inspectionException=b.resolution==='refund';
  message(c,'merchant',text(b.message,'Customer message'),now); note(c,'merchant','inspection_resolution',why,now); break;
 }
 case 'refund': {
  requireThat(c.status==='refund_ready','Refund requires approval and successful inspection or an explicit owner exception.',409);
  requireThat(c.paymentStatus==='captured','Only captured payments can be refunded.');
  requireThat(b.confirmed===true,'Explicit refund confirmation required.');
  requireThat(Number.isSafeInteger(b.amount) && b.amount>0 && b.amount<=c.amount-c.refunded,'Invalid amount; use integer paise within refundable balance.');
  const partialReason=text(b.partialReason??'','Partial refund reason',b.amount<c.amount-c.refunded);
  const key=text(b.key,'Idempotency key'); const customerMessage=text(b.message,'Customer message');
  c.refund={id:`rfnd_mock_${globalThis.crypto.randomUUID()}`,key,amount:b.amount,status:'processing',partialReason,failureReason:null,mode:'simulated',method:c.method,at:new Date(now).toISOString()};
  c.status='refund_processing'; message(c,'merchant',customerMessage,now); break;
 }
 case 'simulate-refund': {
  requireThat(c.status==='refund_processing' && c.refund?.status==='processing','No refund is processing.',409);
  requireThat(['processed','failed'].includes(b.result),'Invalid simulated result.');
  const failureReason=b.result==='failed'?(text(b.failureReason??'','Refund failure reason',false)||'The demo payment provider could not process the refund.'):null;
  c.refund.status=b.result;c.refund.failureReason=failureReason;
  if(b.result==='processed') {c.refunded+=c.refund.amount;c.status='closed';message(c,'system','Demo refund processed to the original payment method. No real money moved.',now);} else {message(c,'system',`Demo refund failed: ${failureReason}. Your team can review and retry; no funds moved.`,now);c.refundHistory=[...(c.refundHistory||[]),c.refund]; c.refund=null;c.status='refund_ready';}
  break;
 }
 default: throw new DomainError('Unknown action.',404);
 }
 note(c,action==='analyse'?'assistant':action==='messages'?b.actor:action==='simulate-refund'?'system':'merchant',action, action==='evidence'?'Evidence uploaded':JSON.stringify({...b,data:undefined}),now);
 ensureReplyWindow(c);
 c.version++; return c;
}
