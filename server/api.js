import { runDueTasks } from './deadlines.js';
import { queueSummary, withQueueFields } from './queue.js';
import { mutate, newClaim, requireThat } from './domain.js';

// Shared synchronous application API. Transport/authentication belong to adapters.
// store: all(), get(id), save(claim), optional transaction(fn); JSON-compatible claims.
export function handle({store, method, path, body, now=Date.now()}) {
  const send=(status,value)=>({status,body:value?.id && value?.status?withQueueFields(value,now):value});
  try {
    requireThat(Number.isFinite(now),'Invalid request clock.',400);
    runDueTasks(store,now);
    path=path.replace(/^\/api(?=\/)/,'').split('?')[0];
    if(method==='GET' && path==='/session')return send(200,{user:'Nikhil Verma',role:'owner',mode:'browser local demo'});
    if(method==='GET' && path==='/claims') {
      const claims=store.all().map(c=>structuredClone(c));
      return send(200,{claims:claims.map(c=>({...withQueueFields(c,now),evidence:c.evidence.map(({data,...e})=>e)})),counts:queueSummary(claims,now)});
    }
    if(method==='POST')requireThat(body && typeof body==='object' && !Array.isArray(body),'JSON object required.',400);
    if(method==='POST' && path==='/claims') {const c=newClaim(body,now);store.save(c);return send(201,c);}
    const match=path.match(/^\/claims\/(RR-\d+)(?:\/([a-z-]+))?$/);
    requireThat(match,'Endpoint not found.',404);
    const raw=store.get(match[1]);requireThat(raw,'Claim not found.',404);
    const c=structuredClone(raw);
    if(method==='GET' && !match[2])return send(200,c);
    requireThat(method==='POST' && match[2],'Method not allowed.',405);
    const existing=[c.refund,...(c.refundHistory||[])].find(r=>r && r.key===body.key);
    if(match[2]==='refund' && existing) {
      const reason=typeof body.partialReason==='string'?body.partialReason.trim():body.partialReason==null?'':null;
      requireThat(existing.amount===body.amount && (existing.partialReason||'')===reason,'Idempotency key reused with a different amount or partial reason.',409);
      return send(200,c);
    }
    requireThat(body.version===c.version,'Claim changed; refresh before acting.',409);
    mutate(c,match[2],body,{now});store.save(c);return send(200,c);
  } catch(error) {return {status:error.status||500,body:{error:error.status?error.message:'Internal server error'}};}
}
