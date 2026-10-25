const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const test = require('node:test');
const helpers = import(pathToFileURL(join(__dirname,'../question-draft-audit.mjs')));
const panel = readFileSync(join(__dirname,'../question-draft-audit-panel.js'),'utf8');

function fixture(n=1) {
  const content={stem:'Original text',item_type:'mcq',correct_answer:'a',rationale:'Original rationale'};
  const draft={id:`d${n}`,question_id:`q${n}`,status:'pending_review',proposed_at:'2026-10-25T14:00:00.123456+00:00',
    base_content:content,proposed_content:{...content,stem:'Original  text'},change_summary:'Spacing'};
  const question={id:`q${n}`,question_no:n,...content,source_key:'source-a',topic:'Topic A'};
  const item={run_id:'r1',revision_id:draft.id,question_id:question.id,draft_version:draft.proposed_at,
    base_content:content,proposed_content:draft.proposed_content,base_fingerprint:'base',proposed_fingerprint:'proposed',
    question_label:`Q-${n}`,status:'completed',audit_id:`a${n}`,
    report:{criteria_version:'draft-qa-v1',classification:'Ready for Approval',eligible:true,diff:[],
      evidence_status:'Clinical accuracy not verified',findings:[{severity:'informational',evidence:'not_verified',field:'clinical',detail:'Not verified',suggestion:'Human review'}]}};
  return {draft,question,item};
}

test('exact content, original, criteria and sub-millisecond version changes invalidate eligibility',async()=>{
  const h=await helpers, {draft,question,item}=fixture();
  assert.equal(h.currentAudit(draft,item,question),true);
  for (const changed of [
    {...draft,proposed_at:'2026-10-25T14:00:00.123457+00:00'},
    {...draft,proposed_content:{...draft.proposed_content,rationale:'Changed'}},
    {...draft,base_content:{...draft.base_content,correct_answer:'b'}},
  ]) assert.equal(h.currentAudit(changed,item,question),false);
  assert.equal(h.currentAudit(draft,item,{...question,stem:'Updated bank'}),false);
  assert.equal(h.currentAudit(draft,{...item,report:{...item.report,criteria_version:'old'}},question),false);
});

test('all backlog filters compose without confusing lifecycle with audit classification',async()=>{
  const h=await helpers, a=fixture(), b=fixture(2);
  b.question.source_key='source-b'; b.question.topic='Topic B'; b.draft.status='approved';
  b.draft.proposed_content={...b.draft.proposed_content,item_type:'sata'};
  const latest=new Map([[a.draft.id,a.item]]);
  const filter={type:'mcq',topic:'Topic A',source:'source-a',status:'pending_review',audit:'Needs Clinical Review',flags:'true'};
  const apply=f=>h.filterDrafts([a.draft,b.draft],[a.question,b.question],latest,[{question_id:'q1',status:'open'}],f);
  assert.deepEqual(apply(filter).map(d=>d.id),['d1']);
  assert.equal(apply({...filter,flags:'false'}).length,0);
  assert.equal(apply({...filter,audit:'Ready for Approval'}).length,0);
  assert.deepEqual(apply({audit:'unaudited'}).map(d=>d.id),['d2']);
  a.draft.proposed_at='new';
  assert.deepEqual(apply({audit:'stale'}).map(d=>d.id),['d1']);
});

test('source filters group imported batches without merging unrelated sources',async()=>{
  const h=await helpers;
  const prefix='qbank-bulk-12345678-1234-1234-1234-123456789abc';
  assert.equal(h.sourceGroup({source_key:`${prefix}-item-1`}),prefix);
  assert.equal(h.sourceGroup({source_key:`${prefix}-item-2`}),prefix);
  assert.equal(h.sourceGroup({source_key:'consult-item-1'}),'Consult diagnostic');
  assert.equal(h.sourceGroup({}), '(Unspecified source)');
});

test('resuming a saved run skips completed work and stops on explicit failure',async()=>{
  const h=await helpers;
  const items=[fixture().item,{...fixture(2).item,status:'pending'},{...fixture(3).item,status:'pending'}];
  const calls=[];
  await h.processRun(items,async i=>{calls.push(i.revision_id);return {...i,status:'failed',error:'Stale draft'};},()=>false,()=>{});
  assert.deepEqual(calls,['d2']);
  await h.processRun(items,async i=>{calls.push(i.revision_id);return {...i,status:'completed'};},()=>false,()=>{});
  assert.deepEqual(calls,['d2','d2','d3']);
  await h.processRun(items,async()=>{throw Error('Completed work repeated');},()=>false,()=>{});
});

test('pause and network interruption preserve completed results for restart',async()=>{
  const h=await helpers, items=[1,2,3].map(n=>({...fixture(n).item,status:'pending'}));
  let pause=false;
  await h.processRun(items,async i=>({...i,status:'completed'}),()=>pause,()=>{pause=true;});
  assert.deepEqual(items.map(i=>i.status),['completed','pending','pending']);
  await assert.rejects(h.processRun(items,async()=>{throw Error('Network');},()=>false,()=>{}),/Network/);
  assert.equal(items[0].status,'completed');
});

test('consolidated CSV and JSON report include every item and neutralize spreadsheet formulas',async()=>{
  const h=await helpers, items=Array.from({length:75},(_,i)=>fixture(i+1).item);
  items[0].report.findings[0].suggestion='=HYPERLINK("bad")';
  items[1]={...items[1],status:'failed',report:null,error:'Network failure'};
  const report=h.reportFor({id:'r1'},items), csv=h.csvReport(report);
  assert.equal(report.counts.selected,75); assert.equal(report.counts.completed,74); assert.equal(report.counts.failed,1);
  assert.match(csv,/'=HYPERLINK/); assert.match(csv,/Q-75/); assert.match(csv,/Network failure/);
  assert.match(csv,/base_fingerprint/); assert.match(JSON.stringify(report),/Clinical accuracy/);
});

async function harness({ failApproval=false, failRefresh=false }={}) {
  const h=await helpers, {draft,question,item}=fixture();
  const elements=new Map(), calls=[], storage=new Map();
  function get(id) {
    if (!elements.has(id)) elements.set(id,{value:'',textContent:'',hidden:false,disabled:false,events:{},
      addEventListener(name,fn){this.events[name]=fn;},querySelectorAll(){return [];},
      set innerHTML(html){
        this.html=html;
        for(const match of html.matchAll(/id="([^"]+)"([^>]*)/g)){
          const el=get(match[1]); el.value=/value="([^"]*)"/.exec(match[2])?.[1]||'';
        }
      },get innerHTML(){return this.html;},
    });
    return elements.get(id);
  }
  const tables={
    latest_question_draft_audits:[item],question_flags:[],
    question_draft_audit_runs:[{id:'r1',created_at:'2026-10-25'}],
    question_draft_audit_items:[item],question_revision_events:[],
  };
  const context={
    __helpers:h, window:{},document:{getElementById:get},
    confirm:()=>true,crypto:{randomUUID:()=> 'request-1'},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  };
  vm.runInNewContext(panel.replace("import('./question-draft-audit.mjs')",'Promise.resolve(__helpers)'),context);
  let approvalAttempt=0;
  await context.window.DraftAudit.init({
    userId:'admin',esc:String,qlabel:q=>`Q-${q.question_no}`,getDrafts:()=>[draft],getLive:()=>[question],
    reloadDrafts:async()=>{if(failRefresh)throw Error('DB unavailable');},reloadQuestions:async()=>{},
    db:{
      from(table){
        let result=tables[table];
        const query={select(){return query;},eq(key,val){result=result.filter(row=>row[key]===val);return query;},
          order(){return query;},range:async(start,end)=>({data:result.slice(start,end+1)})};
        return query;
      },
      async rpc(name,args){
        calls.push({name,args});
        if(name==='approve_question_revision_batch'){
          approvalAttempt++;
          if(failApproval&&approvalAttempt===1)return {error:{message:'Network response lost'}};
          return {data:{approved:true,approved_count:1,applied:false,request_id:args.p_request_id}};
        }
        if(name==='process_question_draft_audit') return {data:{...item,status:'completed'}};
        return {data:'r1'};
      },
    },
  });
  return {get,calls,storage,draft,item,tables};
}

test('panel uses atomic approval and retries exact request after a lost response',async()=>{
  const h=await harness({failApproval:true});
  await h.get('da-select').events.click();
  await h.get('da-approve').events.click();
  assert.match(h.get('da-message').textContent,/Network response lost/);
  assert.equal(h.storage.size,1);
  await h.get('da-retry').events.click();
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[0].name,'approve_question_revision_batch');
  assert.equal(JSON.stringify(h.calls[0].args),JSON.stringify(h.calls[1].args));
  assert.equal(h.storage.size,0);
  assert.match(h.get('da-receipt').textContent,/"applied": false/);
});

test('panel does not submit stale or clinically sensitive selections',async()=>{
  const h=await harness();
  await h.get('da-select').events.click();
  h.item.report={...h.item.report,eligible:false,classification:'Needs Clinical Review'};
  await h.get('da-approve').events.click();
  assert.equal(h.calls.length,0);
  assert.match(h.get('da-message').textContent,/not wholly eligible/);
});

test('saved runs load without automatic work and explicitly resume only unfinished items',async()=>{
  const h=await harness();
  assert.equal(h.calls.length,0);
  h.item.status='pending';
  await h.get('da-resume').events.click();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].name,'process_question_draft_audit');
  assert.equal(h.calls[0].args.p_run_id,'r1');
  assert.equal(h.item.status,'completed');
  await h.get('da-resume').events.click();
  assert.equal(h.calls.length,1);
});

test('database failures are explicit and do not imply empty or successful audits',async()=>{
  const h=await harness({failRefresh:true});
  assert.match(h.get('da-message').textContent,/unavailable: DB unavailable/);
});

test('old non-atomic approval route is removed and Phase 1 never applies questions',()=>{
  const oldPanel=readFileSync(join(__dirname,'../question-audit-panel.js'),'utf8');
  const html=readFileSync(join(__dirname,'../question-bank-review.html'),'utf8');
  assert.doesNotMatch(panel,/apply_question_revision|\.from\(['"]questions['"]\)\.update/);
  assert.doesNotMatch(oldPanel,/rpc\('approve_question_revision'/);
  assert.match(html,/id="draft-audit-mount"/);
  assert.match(html,/DraftAudit\?\.init\(reviewContext\)/);
});
