import { claimWindow } from './queue.js';
import { ensureReplyWindow } from './deadlines.js';

export function convertOffsets(value, now) {
  if (Array.isArray(value)) return value.map(item => convertOffsets(item, now));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'hoursAgo' || key.endsWith('HoursAgo')) {
      if (item === null) {result[key === 'hoursAgo' ? 'at' : key.slice(0, -8) + 'At'] = null;continue;}
      if (typeof item !== 'number' || !Number.isFinite(item)) throw new Error(`Invalid seed time: ${key}`);
      const target = key === 'hoursAgo' ? 'at' : key.slice(0, -8) + 'At';
      result[target] = new Date(now - item * 3600000).toISOString();
    } else result[key] = convertOffsets(item, now);
  }
  return result;
}
const ist=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true});
export const istDate=s=>ist.format(new Date(s));

export function ruleChecks(c) {
  const inWindow = claimWindow(c).claimWindowMet;
  const physical = (c.purchaseType || 'physical') === 'physical';
  return [
    { label:'Claim window', result:inWindow?'pass':'review', source:c.policy.clauses.window, type:'rule', clauseId:c.reason==='preference'?'2.2':'2.1', facts:`Delivered ${istDate(c.deliveredAt)}; submitted ${istDate(c.submittedAt)}. Eligibility is measured at submission.` },
    { label:physical?'Item category':'Purchase eligibility', result:physical&&!c.excluded?'pass':'review', source:physical?c.policy.clauses.category:'Review the merchant’s service or digital refund terms.', type:'rule', clauseId:'1.3', facts:c.excluded?'Excluded by the merchant policy.':physical?'Not marked custom or final-sale.':'Purchase eligibility needs merchant review.' },
    { label:'Refund timing', result:physical?'inspect_first':'pass', source:c.policy.clauses.inspection, type:'rule', clauseId:'4.1', facts:physical?'Return approval and refund confirmation are separate actions.':'No physical inspection applies.' },
  ];
}
export function fixtureAssessment(c, fixture, assessedAt = fixture.at) {
  return {
    mode:'simulated', assessedAt,
    recommendation:fixture.recommendation,
    headline:fixture.headline,
    rationale:fixture.rationale,
    observations:structuredClone(fixture.observations || []),
    uncertainty:fixture.uncertainty || '',
    needsJudgement:structuredClone(fixture.needsJudgement || []),
    checks:[...ruleChecks(c), ...(fixture.aiChecks || []).map(check=>({ ...check, type:'ai', source:`§${check.clauseId}`, facts:check.facts || '' }))],
    authenticity:{ ...structuredClone(fixture.authenticity || {}), result:fixture.authenticity?.result || 'inconclusive', details:fixture.authenticity?.details || 'No authenticity detector is connected.' },
  };
}
export function loadSeed(store, source, policy, now = Date.now()) {
  if (store.all().length) return false;
  if (!Array.isArray(source.claims)) throw new Error('Seed must contain a claims array.');
  const claims = source.claims.map(raw => {
    const c = {
      paymentStatus:'captured', excluded:false, refund:null, inspection:null,
      refundHistory:[], audit:[], returnStage:null, version:1, policy:structuredClone(policy),
      ...convertOffsets(raw, now),
    };
    c.decisionDueAt = new Date(Date.parse(c.submittedAt) + c.policy.responseDays * 86400000).toISOString();
    if (c.decision?.action === 'approve_return') c.pickupDueAt = new Date(Date.parse(c.decision.at) + c.policy.pickupDays * 86400000).toISOString();
    if (c.return?.receivedAt) c.inspectionDueAt = new Date(Date.parse(c.return.receivedAt) + c.policy.inspectionDays * 86400000).toISOString();
    c.messages = (c.messages || []).map(m => ({id:globalThis.crypto.randomUUID(), ...m}));
    c.evidence = (c.evidence || []).map(e => ({superseded:false, ...e}));
    if (c.refund) c.refund = { id:`rfnd_mock_${c.id.slice(3)}`, mode:'simulated', ...c.refund };
    // Preserve fixture findings and seed statuses; never call analyse() here.
    c.assessment = fixtureAssessment(c, c.assessmentFixture);
    const event = (at, actor, action, detail) => c.audit.push({id:globalThis.crypto.randomUUID(),at,actor,action,detail});
    event(c.submittedAt,'customer','claim_created','Customer submitted the claim.');
    for (const m of c.messages) event(m.at,m.actor,m.actor==='assistant'?'evidence_requested':m.actor==='customer'?'customer_message':'message',m.text);
    event(c.assessment.assessedAt,'assistant','assessment',c.assessment.recommendation);
    if (c.decision) event(c.decision.at,'merchant','decision',JSON.stringify(c.decision));
    if (c.return?.pickedUpAt) event(c.return.pickedUpAt,'system','return_picked_up','Courier pickup confirmed.');
    if (c.return?.receivedAt) event(c.return.receivedAt,'system','return_received','Returned item received.');
    if (c.inspection) event(c.inspection.at,'merchant','inspection',JSON.stringify(c.inspection));
    if (c.refund) {
      event(c.refund.at,'merchant','refund',JSON.stringify(c.refund));
      if(c.refund.status==='processed') {
        const processedAt=c.messages.filter(m=>m.actor==='system' && Date.parse(m.at)>=Date.parse(c.refund.at)).at(-1)?.at || c.refund.at;
        event(processedAt,'system','refund_processed','Demo refund processed; no real money moved.');
      }
    }
    ensureReplyWindow(c);
    c.audit.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    return c;
  });
  const open = claims.filter(c=>!['closed','declined'].includes(c.status)).length;
  if (open !== source._loader.openCount || new Set(claims.map(c=>c.id)).size!==claims.length) throw new Error('Invalid seed count or duplicate claim IDs.');
  const save=()=>claims.forEach(c=>store.save(c));
  if(store.transaction)store.transaction(save);else save();
  return true;
}
