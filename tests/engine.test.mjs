import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEngine, profiles } from '../server/engine.mjs';
import { validPlan, budgetUsed, components } from '../shared/park-rules.mjs';

function player(condition='actionable'){
  const e=createEngine(':memory:',{assign:()=>condition});const {token,state:first}=e.create({adult:true,consent:true,device_class:'desktop'});let s=first;
  const command=(type,extra={})=>{s=e.command(token,{request_id:randomUUID(),revision:s.revision,type,...extra});return s;};
  const view=()=>command('view');
  const act=action=>{view();return command('action',{action,decision_id:s.decision.id,active_ms:0});};
  return {e,token,view,act,command,get s(){return s;},events:()=>e.export(token).events};
}
test('consent gate, no session before explicit consent',()=>{
  const e=createEngine();assert.throws(()=>e.create({adult:true,consent:false}));assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);e.close();
});
test('lost consent response can be retried without creating a second participant',()=>{
  const e=createEngine();const body={adult:true,consent:true,creation_token:'b'.repeat(64)};
  const first=e.create(body);const second=e.create(body);assert.deepEqual(first,second);
  assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);
  assert.equal(e.export(first.token).events.filter(x=>x.event_type==='consent_granted').length,1);e.close();
});
for(const condition of ['actionable','generic'])for(const profile of Object.keys(profiles))test(`${condition}/${profile}: costs, persistence, draft and one completion`,()=>{
  const p=player(condition);p.act('choose_'+profile);assert.equal(p.s.condition,condition);p.act('bus_begin');assert.equal(p.s.time,profiles[profile].time);
  p.act('bus_pre_pass');assert.equal(p.events().filter(x=>x.event_type==='feedback_shown').length,0);p.view();assert.equal(p.events().filter(x=>x.event_type==='feedback_shown').length,1);p.act('bus_reply_continue');
  p.act('bus_proposal_open');p.act('bus_priority_access');p.act('bus_solution_trial');p.act('bus_proposal_save');assert.equal(p.s.time,profiles[profile].time);assert.equal(p.s.primary,null);
  assert.equal(p.e.state(p.token).priority,'access');p.act('bus_materials');const afterInfo=profiles[profile].time-profiles[profile].info;assert.equal(p.s.time,afterInfo);p.act('bus_materials_back');p.act('bus_materials');assert.equal(p.s.time,afterInfo);p.act('bus_materials_back');
  p.act('bus_proposal_open');p.view();const body={request_id:randomUUID(),revision:p.s.revision,type:'action',action:'bus_proposal_submit',decision_id:p.s.decision.id,active_ms:0};
  const saved=p.e.command(p.token,body);const duplicate=p.e.command(p.token,body);assert.deepEqual(saved,duplicate);assert.equal(saved.time,afterInfo-profiles[profile].submit);assert.equal(saved.primary,1);
  assert.equal(p.events().filter(x=>x.event_type==='formal_action_completed').length,1);assert.equal(p.events().filter(x=>x.event_type==='formal_action_started').length,1);assert.equal(p.events().filter(x=>x.event_type==='condition_assigned').length,1);
  const second={...body,request_id:randomUUID(),revision:saved.revision};assert.throws(()=>p.e.command(p.token,second));assert.equal(p.events().filter(x=>x.event_type==='formal_action_completed').length,1);
  const events=p.events();assert.deepEqual(events.map(x=>x.seq),events.map((_,i)=>i+1));assert.ok(events.every(x=>x.study_phase==='dev'));assert.equal(p.e.export(p.token).session.full_game_complete,false);p.e.close();
});
test('unobserved primary stays null; voluntary end is zero; reflection can be skipped',()=>{
  const p=player();p.act('choose_digital');p.act('bus_begin');p.act('bus_pre_info');p.act('bus_reply_continue');assert.equal(p.e.export(p.token).session.bus_primary,null);
  p.act('bus_end_confirm');assert.equal(p.s.primary,0);p.act('clarity_skip');assert.equal(p.s.clarity,null);assert.equal(p.s.prototype_complete,false);assert.equal(p.s.phase,'bus_result');assert.equal(p.events().filter(x=>x.event_type==='session_ended').length,0);p.e.close();
});
test('invalid sequence and forged choices rollback; stale tab cannot mutate',()=>{
  const p=player();const before=p.events().length;assert.throws(()=>p.command('action',{action:'bus_proposal_submit',decision_id:randomUUID(),active_ms:0}));assert.equal(p.events().length,before);
  p.act('choose_digital');const revision=p.s.revision;p.view();assert.throws(()=>p.e.command(p.token,{request_id:randomUUID(),revision,type:'view'}));p.act('bus_begin');p.act('bus_pre_support');p.act('bus_reply_continue');p.act('bus_proposal_open');assert.throws(()=>p.act('bus_proposal_submit'));assert.throws(()=>p.act('bus_priority_secret'));p.e.close();
});
test('tokens isolate exports and deletion cascades events and request receipts',()=>{
  const p=player();const other=p.e.create({adult:true,consent:true});p.act('choose_community');assert.throws(()=>p.e.export('a'.repeat(64)));assert.notEqual(p.e.export(p.token).session.session_id,p.e.export(other.token).session.session_id);
  const id=p.s.id;p.e.remove(p.token);assert.throws(()=>p.e.state(p.token));assert.equal(p.e.db.prepare('SELECT COUNT(*) AS n FROM events WHERE session_id=?').get(id).n,0);assert.equal(p.e.db.prepare('SELECT COUNT(*) AS n FROM receipts WHERE session_id=?').get(id).n,0);assert.equal(p.e.state(other.token).phase,'characters');p.e.close();
});

function parkPlayer(profile='digital',condition='actionable'){
  const p=player(condition);p.act('choose_'+profile);p.act('bus_begin');p.act('bus_pre_pass');p.act('bus_reply_continue');
  p.act('bus_end_confirm');p.act('clarity_skip');p.act('bus_continue_park');return p;
}
const parkEvents=p=>p.events().filter(e=>e.scenario_id==='park');
const completePlan=p=>{p.act('park_plan_open');p.act('park_preset_green');p.act('park_plan_save');};

test('all 16 valid plans are reachable; invalid combinations cannot be added',()=>{
  const keys=Object.keys(components);let accepted=0;
  for(let mask=0;mask<(1<<keys.length);mask++){
    const values=keys.filter((_,i)=>mask&(1<<i));
    const expected=values.filter(x=>x.startsWith('edge_')).length===1&&values.reduce((sum,k)=>sum+components[k].cost,0)<=6;
    assert.equal(validPlan(values),expected);
    if(!expected)continue;accepted++;
    const p=parkPlayer();p.act('park_plan_open');
    for(const key of values)p.act(key.startsWith('edge_')?'park_'+key:'park_'+(key==='bike_rack'?'bike':key)+'_add');
    p.act('park_plan_save');assert.deepEqual(p.s.park.saved,values);p.e.close();
  }
  assert.equal(accepted,16);assert.equal(validPlan(['edge_green','edge_green']),false);assert.equal(validPlan(['unknown']),false);
  const p=parkPlayer();p.act('park_plan_open');p.act('park_preset_green');
  assert.equal(p.s.availability.blocked.park_lighting_add,'plan_budget');const before=p.s.park.edit_seq;
  assert.throws(()=>p.act('park_lighting_add'));assert.equal(p.e.state(p.token).park.edit_seq,before);assert.equal(p.s.time,4);p.e.close();
});

for(const profile of Object.keys(profiles))for(const condition of ['actionable','generic'])test(`park ${profile}/${condition}: one budget reset, save, no-op re-save, finish`,()=>{
  const p=parkPlayer(profile,condition);const assigned=p.s.condition;
  assert.equal(p.s.time,profiles[profile].time);assert.equal(p.s.money,profiles[profile].money);p.view();p.view();
  assert.equal(p.s.time,profiles[profile].time);assert.equal(p.s.condition,assigned);assert.equal(p.s.primary,0);
  assert.equal(parkEvents(p).filter(e=>e.event_type==='resource_changed'&&e.payload.reason==='episode_start').length,2);
  const before=p.s.time;completePlan(p);assert.equal(p.s.time,before-profiles[profile].submit);assert.equal(p.s.park.revision,1);
  p.act('park_plan_open');p.act('park_plan_save');assert.equal(p.s.park.revision,1);assert.equal(p.s.time,before-profiles[profile].submit);
  p.act('park_end_confirm');assert.equal(p.s.prototype_complete,false);p.act('park_finish_prototype');assert.equal(p.s.prototype_complete,true);
  const ex=p.e.export(p.token);assert.equal(ex.session.bus_primary,0);assert.equal(ex.session.park_status,'completed');assert.equal(ex.session.park_group_contribution,0);assert.equal(ex.session.park_hearing_contribution,0);assert.equal(ex.session.full_game_complete,false);
  assert.equal(p.events().filter(e=>e.event_type==='condition_assigned').length,1);assert.equal(p.events().filter(e=>e.event_type==='session_ended').length,0);p.e.close();
});

test('park drafts survive reload; explicit back reverts and journals the change',()=>{
  const p=parkPlayer();p.act('park_plan_open');p.act('park_edge_mixed');assert.deepEqual(p.e.state(p.token).park.draft,['edge_mixed']);
  p.act('park_plan_back');assert.deepEqual(p.s.park.draft,[]);assert.equal(p.s.time,4);
  completePlan(p);p.act('park_plan_open');p.act('park_crossing_remove');p.act('park_lighting_add');p.act('park_plan_back');
  assert.deepEqual(p.s.park.draft,p.s.park.saved);assert.deepEqual(p.s.park.saved,['edge_green','crossing','bike_rack']);
  const e=parkEvents(p).filter(e=>e.event_type==='plan_component_changed').at(-1);assert.equal(e.payload.action_id,'park_plan_back');assert.equal(e.payload.budget_used_after,6);p.e.close();
});

test('group and formal completion retain separate snapshots through later edits',()=>{
  const p=parkPlayer('community');completePlan(p);p.act('park_group_open');p.act('park_group_back');assert.equal(p.s.time,2);p.act('park_group_open');p.act('park_group_publish');
  assert.equal(p.s.time,1);const first=structuredClone(p.s.park.group_snapshot);
  p.act('park_plan_open');p.act('park_preset_parking');p.act('park_plan_save');assert.equal(p.s.park.revision,2);assert.deepEqual(p.s.park.group_snapshot,first);
  p.act('park_hearing_open');assert.equal(p.s.park.mode,null);assert.throws(()=>p.act('park_hearing_submit'));p.act('park_mode_online');p.act('park_hearing_submit');
  assert.equal(p.s.time,0);assert.equal(p.s.park.hearing_snapshot.plan_revision,2);assert.equal(p.s.park.group_snapshot.plan_revision,1);
  p.act('park_plan_open');p.act('park_preset_mixed');p.act('park_plan_save');assert.equal(p.s.park.revision,3);assert.equal(p.s.time,0);
  assert.equal(p.s.park.hearing_snapshot.plan_revision,2);assert.deepEqual(p.s.park.group_snapshot,first);
  assert.equal(p.s.availability.blocked.park_group_open,'already_completed');assert.equal(p.s.availability.blocked.park_hearing_open,'already_completed');
  assert.equal(parkEvents(p).filter(e=>e.event_type==='collective_task_started').length,1);assert.equal(parkEvents(p).filter(e=>e.event_type==='collective_task_completed').length,1);
  p.act('park_end_confirm');assert.equal(p.e.export(p.token).session.bus_primary,0);assert.equal(p.e.export(p.token).session.park_hearing_contribution,1);p.e.close();
});

for(const mode of ['online','walk','paid'])test(`hearing ${mode}: costs, immutable completion and replay protection`,()=>{
  const p=parkPlayer();completePlan(p);p.act('park_hearing_open');p.act('park_mode_'+mode);p.view();
  const before=p.s.time;const body={request_id:randomUUID(),revision:p.s.revision,type:'action',action:'park_hearing_submit',decision_id:p.s.decision.id,active_ms:0};
  const first=p.e.command(p.token,body),second=p.e.command(p.token,body);assert.deepEqual(first,second);
  assert.equal(first.time,before-(mode==='walk'?2:1));assert.equal(first.money,mode==='paid'?0:2);assert.equal(first.primary,0);
  const events=parkEvents(p).filter(e=>e.event_type==='formal_action_completed');assert.equal(events.length,1);assert.equal(events[0].payload.channel,'hearing');assert.equal(events[0].payload.travel_mode,mode==='online'?'none':mode);
  assert.throws(()=>p.e.command(p.token,{...body,request_id:randomUUID(),revision:first.revision}));p.e.close();
});

test('resource shortage blocks paid travel/materials and publishing, never free ending',()=>{
  const p=parkPlayer('flexible');completePlan(p);p.act('park_hearing_open');assert.equal(p.s.availability.blocked.park_mode_paid,'resource');assert.throws(()=>p.act('park_mode_paid'));p.act('park_mode_online');p.act('park_hearing_submit');p.act('park_group_open');p.act('park_group_publish');assert.equal(p.s.time,0);
  assert.equal(p.s.availability.blocked.park_materials,'resource');assert.ok(p.s.availability.available.includes('park_end_confirm'));p.act('park_end_confirm');p.e.close();
  const q=parkPlayer('digital');completePlan(q);q.act('park_hearing_open');q.act('park_mode_online');q.act('park_hearing_submit');q.act('park_group_open');assert.equal(q.s.availability.blocked.park_group_publish,'resource');assert.throws(()=>q.act('park_group_publish'));q.act('park_group_back');q.act('park_end_confirm');q.e.close();
});

test('park sharing is once-only; materials charge once; interrupted absence stays unknown',()=>{
  const p=parkPlayer('procedural');p.act('park_share');assert.throws(()=>p.act('park_share'));p.act('park_materials');assert.equal(p.s.time,2);p.act('park_materials_back');p.act('park_materials');assert.equal(p.s.time,2);p.act('park_materials_back');
  const before=p.e.export(p.token);assert.equal(before.session.park_group_contribution,null);assert.equal(before.session.park_hearing_contribution,null);assert.equal(before.session.bus_primary,0);
  p.act('park_end_confirm');assert.equal(p.e.export(p.token).session.park_group_contribution,0);assert.equal(p.s.park.revision,0);assert.equal(parkEvents(p).filter(e=>e.event_type==='plan_saved').length,0);p.e.close();
});
