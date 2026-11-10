import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, randomInt, createHash } from 'node:crypto';
import { PARK_BUDGET, modes, budgetUsed, samePlan, validPlan, candidatePlan, editActions } from '../shared/park-rules.mjs';

export const profiles = {digital:{time:4,info:0,submit:2,group:2,money:2},community:{time:4,info:1,submit:2,group:1,money:2},procedural:{time:3,info:1,submit:1,group:2,money:2},flexible:{time:5,info:1,submit:2,group:2,money:1}};
export const versions = {schema_version:'0.4-park.2',script_version:'compact_0.1',game_version:'bus-park-prototype-0.2.1',study_phase:'dev',scope:'bus_park_prototype'};
export const priorities = ['access','duration','walk'];
export const solutions = ['keep','connector','trial'];
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export class RuleError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const requireRule = (value,message='Бұл әрекет қазір қолжетімсіз.')=>{if(!value)throw new RuleError(message);};
const hash = t => createHash('sha256').update(t).digest('hex');
export function createEngine(filename=':memory:', {assign=()=>randomInt(2)?'actionable':'generic'}={}) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token TEXT UNIQUE, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, seq INTEGER, body TEXT, PRIMARY KEY(session_id,seq));
    CREATE TABLE IF NOT EXISTS receipts(session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, request_id TEXT, PRIMARY KEY(session_id,request_id));`);
  function event(s,type,payload={},scenario=s.phase==='characters'||s.phase==='tutorial'?'onboarding':s.phase==='ending'?'debrief':s.park?'park':'bus'){
    const {scope,...eventVersions}=versions;
    const e={event_id:randomUUID(),participant_id:s.participant_id,session_id:s.id,seq:++s.seq,elapsed_ms:Math.max(0,Date.now()-s.started_at),event_type:type,...eventVersions,character_id:s.character,condition:s.condition,scenario_id:scenario,payload};
    db.prepare('INSERT INTO events VALUES(?,?,?)').run(s.id,e.seq,JSON.stringify(e));
  }
  function save(s){db.prepare('UPDATE sessions SET state=? WHERE id=?').run(JSON.stringify(s),s.id);}
  function get(token){if(typeof token!=='string'||token.length!==64)throw new RuleError('Сессия табылмады.',401);const row=db.prepare('SELECT state FROM sessions WHERE token=?').get(hash(token));if(!row)throw new RuleError('Сессия табылмады.',401);return JSON.parse(row.state);}
  function publicState(s){const {started_at,seq,...rest}=s;return {...rest,...versions,profile:profiles[s.character]||null,availability:available(s)};}
  function options(s){
    switch(s.phase){
      case 'characters':return Object.keys(profiles).map(x=>'choose_'+x);
      case 'tutorial':return ['bus_begin'];
      case 'intro':return ['bus_pre_support','bus_pre_info','bus_pre_pass'];
      case 'reply':return ['bus_reply_continue'];
      case 'hub':return ['bus_materials',...(s.submitted?[]:['bus_proposal_open']),'bus_reply_open','bus_end_confirm'];
      case 'materials':return ['bus_materials_back'];
      case 'proposal':return [...priorities.map(x=>'bus_priority_'+x),...solutions.map(x=>'bus_solution_'+x),'bus_proposal_save','bus_proposal_submit'];
      case 'reflection':return ['clarity_1','clarity_2','clarity_3','clarity_4','clarity_5','clarity_skip'];
      case 'bus_result':return ['bus_continue_park'];
      case 'park_intro':case 'park_hub':return ['park_plan_open','park_materials','park_share','park_group_open','park_hearing_open',s.park.revision?'park_end_confirm':'park_exit_open'];
      case 'park_exit':return ['park_exit_back','park_end_confirm'];
      case 'park_materials':return ['park_materials_back'];
      case 'park_editor':return [...editActions(s.park.draft),'park_plan_save','park_plan_back'];
      case 'park_group':return ['park_group_publish','park_group_back'];
      case 'park_hearing':return ['park_mode_online','park_mode_walk','park_mode_paid','park_hearing_submit','park_hearing_back'];
      case 'park_result':return ['park_finish_prototype'];
      default:return [];
    }
  }
  function available(s){
    const all=options(s),blocked={},p=s.park,profile=profiles[s.character];
    if(s.phase==='proposal'&&(!s.priority||!s.solution))blocked.bus_proposal_submit='prerequisite';
    if(s.phase==='proposal'&&s.time<profile.submit)blocked.bus_proposal_submit='resource';
    if(s.phase==='hub'&&!s.info&&s.time<profile.info)blocked.bus_materials='resource';
    if(p){
      for(const action of all){
        if(['park_group_open','park_hearing_open'].includes(action)){
          if(!p.revision)blocked[action]='prerequisite';
          else if(action==='park_group_open'?p.group_snapshot:p.hearing_snapshot)blocked[action]='already_completed';
        }
        if(action==='park_materials'&&!p.info&&s.time<profile.info)blocked[action]='resource';
        if(action==='park_share'&&p.shared)blocked[action]='already_completed';
        if(action==='park_plan_save'){
          if(!validPlan(p.draft))blocked[action]='prerequisite';
          else if(!p.revision&&s.time<profile.submit)blocked[action]='resource';
        }
        if(action==='park_group_publish'&&s.time<profile.group)blocked[action]='resource';
        if(action.startsWith('park_mode_')){
          const mode=modes[action.slice(10)];
          if(s.time<mode.time||s.money<mode.money)blocked[action]='resource';
        }
        if(action==='park_hearing_submit'){
          const mode=modes[p.mode];
          if(!mode)blocked[action]='prerequisite';
          else if(s.time<mode.time||s.money<mode.money)blocked[action]='resource';
        }
        if(s.phase==='park_editor'&&editActions(p.draft).includes(action)){
          const next=candidatePlan(p.draft,action);
          if(budgetUsed(next)>PARK_BUDGET)blocked[action]='plan_budget';
          else if(samePlan(next,p.draft))blocked[action]='already_selected';
        }
      }
    }
    return {all,available:all.filter(x=>!blocked[x]),blocked};
  }
  function spend(s,cost,action){if(!cost)return;requireRule(s.time>=cost);const before=s.time;s.time-=cost;event(s,'resource_changed',{resource:'time',reason:'action',before,after:s.time,delta:-cost,action_id:action});}
  function changePlan(s,next,action){
    const p=s.park;if(samePlan(p.draft,next))return;
    const before=[...p.draft];p.draft=[...next];p.edit_seq++;
    event(s,'plan_component_changed',{plan_id:p.plan_id,edit_seq:p.edit_seq,action_id:action,decision_instance_id:s.decision.id,before_components:before,after_components:[...next],budget_used_before:budgetUsed(before),budget_used_after:budgetUsed(next),budget_limit:PARK_BUDGET});
  }
  function snapshot(p){return {plan_id:p.plan_id,plan_revision:p.revision,components:[...p.saved],budget_used:budgetUsed(p.saved),budget_limit:PARK_BUDGET};}
  function parkAction(s,action){
    const profile=profiles[s.character];
    if(action==='bus_continue_park'){
      requireRule(s.bus_completed&&!s.park);
      s.park={plan_id:randomUUID(),draft:[],saved:[],revision:0,edit_seq:0,info:false,shared:false,group_id:null,group_snapshot:null,hearing_id:null,hearing_snapshot:null,mode:null,completed:false,public_views:0};
      s.phase='park_intro';event(s,'scenario_started',{scenario_id:'park'});
      for(const resource of ['time','money']){const before=s[resource];s[resource]=profile[resource];event(s,'resource_changed',{resource,reason:'episode_start',before,after:s[resource],delta:s[resource]-before,action_id:'park_begin'});}
      return;
    }
    const p=s.park;requireRule(p&&!p.completed||action==='park_finish_prototype');
    if(action==='park_plan_open')s.phase='park_editor';
    else if(s.phase==='park_editor'&&editActions(p.draft).includes(action))changePlan(s,candidatePlan(p.draft,action),action);
    else if(action==='park_plan_back'){changePlan(s,p.saved,action);s.phase='park_hub';}
    else if(action==='park_plan_save'){
      requireRule(validPlan(p.draft));
      if(!samePlan(p.draft,p.saved)){
        if(!p.revision)spend(s,profile.submit,action);
        p.saved=[...p.draft];p.revision++;
        event(s,'plan_saved',{...snapshot(p),action_id:action,decision_instance_id:s.decision.id});
      }
      s.phase='park_hub';
    }else if(action==='park_materials'){
      if(!p.info)spend(s,profile.info,action);p.info=true;s.phase='park_materials';event(s,'information_opened',{info_id:'park_materials',source_type:'official'});
    }else if(action==='park_materials_back'||action==='park_group_back'||action==='park_hearing_back')s.phase='park_hub';
    else if(action==='park_share')p.shared=true;
    else if(action==='park_group_open'){
      requireRule(p.revision&&!p.group_snapshot);s.phase='park_group';
      if(!p.group_id){p.group_id=randomUUID();event(s,'collective_task_started',{task_instance_id:p.group_id,task_type:'prepare_proposal'});}
    }else if(action==='park_group_publish'){
      requireRule(p.revision&&!p.group_snapshot);spend(s,profile.group,action);p.group_snapshot=snapshot(p);s.phase='park_hub';
      event(s,'collective_task_completed',{task_instance_id:p.group_id,task_type:'prepare_proposal',...p.group_snapshot});
    }else if(action==='park_hearing_open'){
      requireRule(p.revision&&!p.hearing_snapshot);s.phase='park_hearing';
      if(!p.hearing_id){p.hearing_id=randomUUID();event(s,'formal_action_started',{action_instance_id:p.hearing_id,channel:'hearing'});}
    }else if(action.startsWith('park_mode_'))p.mode=action.slice(10);
    else if(action==='park_hearing_submit'){
      requireRule(p.revision&&!p.hearing_snapshot);const mode=modes[p.mode];requireRule(mode&&s.time>=mode.time&&s.money>=mode.money);
      spend(s,mode.time,action);
      if(mode.money){const before=s.money;s.money-=mode.money;event(s,'resource_changed',{resource:'money',reason:'action',before,after:s.money,delta:-mode.money,action_id:action});}
      p.hearing_snapshot={...snapshot(p),participation_mode:mode.participation_mode,travel_mode:mode.travel_mode};s.phase='park_hub';
      event(s,'formal_action_completed',{action_instance_id:p.hearing_id,channel:'hearing',...p.hearing_snapshot});
    }else if(action==='park_exit_open')s.phase='park_exit';
    else if(action==='park_exit_back')s.phase='park_hub';
    else if(action==='park_end_confirm'){
      p.completed=true;s.phase='park_result';event(s,'scenario_completed',{scenario_id:'park',outcome_code:'consultation_complete'});
    }else if(action==='park_finish_prototype'){s.prototype_complete=true;s.phase='ending';}
    else throw new RuleError('Белгісіз саябақ әрекеті.');
  }
  return {
    db,
    create(body){
      requireRule(body?.consent===true&&body?.adult===true,'Келісім мен ересектікті растау қажет.');
      const token=body.creation_token??randomBytes(32).toString('hex');
      requireRule(typeof token==='string'&&/^[0-9a-f]{64}$/.test(token),'Қате сессия кілті.');
      const existing=db.prepare('SELECT state FROM sessions WHERE token=?').get(hash(token));
      if(existing)return {token,state:publicState(JSON.parse(existing.state))};
      const s={id:randomUUID(),participant_id:'p_'+randomBytes(12).toString('hex'),started_at:Date.now(),seq:0,revision:0,phase:'characters',character:null,condition:null,time:0,money:0,park:null,info:false,submitted:false,priority:null,solution:null,formal_id:null,bus_completed:false,primary:null,clarity:null,prototype_complete:false,decision:null,reply_views:0};
      db.exec('BEGIN IMMEDIATE');try{
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(s.id,hash(token),JSON.stringify(s));
        event(s,'consent_granted',{consent_version:'dev-local-0.2',adult_confirmed:true},'onboarding');
        event(s,'session_started',{device_class:['desktop','mobile','tablet'].includes(body.device_class)?body.device_class:'unknown'},'onboarding');
        save(s);db.exec('COMMIT');return {token,state:publicState(s)};
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    state:token=>publicState(get(token)),
    command(token,body){
      const s=get(token);requireRule(uuid(body?.request_id),'Қате сұрау коды.');
      if(db.prepare('SELECT 1 FROM receipts WHERE session_id=? AND request_id=?').get(s.id,body.request_id))return publicState(s);
      if(body.revision!==s.revision)throw new RuleError('Сессия басқа терезеде өзгерді. Бетті жаңартыңыз.',409);
      db.exec('BEGIN IMMEDIATE');try{
        if(body.type==='view'){
          const opts=available(s);s.decision={id:randomUUID(),name:s.phase,shown_at:Date.now()};
          event(s,'decision_presented',{decision_id:s.phase,decision_instance_id:s.decision.id,offered_actions:opts.all,available_actions:opts.available,blocked_reasons:opts.blocked,time_units:s.time,money_units:s.money});
          if(s.phase==='reply'){event(s,'feedback_shown',{feedback_id:'bus_reply_1',variant:s.condition,display_kind:s.reply_views?'revisit':'initial'});s.reply_views++;}
          if(s.phase==='park_intro'){event(s,'feedback_shown',{feedback_id:'bus_public_result',variant:'standard',display_kind:s.park.public_views?'revisit':'initial'},'bus');s.park.public_views++;}
        }else if(body.type==='visibility'){
          requireRule(['visible','hidden'].includes(body.value));event(s,'visibility_changed',{state:body.value});
        }else{
          requireRule(body.type==='action','Қате пәрмен түрі.');
          const action=body.action;const opts=available(s);
          requireRule(s.decision&&body.decision_id===s.decision.id&&opts.available.includes(action));
          requireRule(Number.isSafeInteger(body.active_ms)&&body.active_ms>=0&&body.active_ms<=Date.now()-s.decision.shown_at+1500,'Қате уақыт мәні.');
          event(s,'action_selected',{decision_id:s.decision.name,decision_instance_id:s.decision.id,action_id:action,active_decision_ms:body.active_ms});
          if(action==='bus_continue_park'||action.startsWith('park_'))parkAction(s,action);
          else if(action.startsWith('choose_')){
            s.character=action.slice(7);s.condition=assign();requireRule(['actionable','generic'].includes(s.condition));s.phase='tutorial';
            event(s,'character_selected',{character_id:s.character},'onboarding');event(s,'condition_assigned',{condition:s.condition,assignment_version:'crypto-random-1:1-v1'},'onboarding');
          }else if(action==='bus_begin'){
            s.phase='intro';s.time=profiles[s.character].time;
            event(s,'scenario_started',{scenario_id:'bus'});event(s,'resource_changed',{resource:'time',reason:'episode_start',before:0,after:s.time,delta:s.time,action_id:'bus_begin'});
          }else if(action.startsWith('bus_pre_')){s.baseline=action;s.phase='reply';}
          else if(action==='bus_reply_continue')s.phase='hub';
          else if(action==='bus_reply_open')s.phase='reply';
          else if(action==='bus_materials'){
            if(!s.info)spend(s,profiles[s.character].info,action);s.info=true;s.phase='materials';event(s,'information_opened',{info_id:'bus_materials',source_type:'official'});
          }else if(action==='bus_materials_back')s.phase='hub';
          else if(action==='bus_proposal_open'){
            s.phase='proposal';if(!s.formal_id){s.formal_id=randomUUID();event(s,'formal_action_started',{action_instance_id:s.formal_id,channel:'appeal'});}
          }else if(action.startsWith('bus_priority_'))s.priority=action.slice(13);
          else if(action.startsWith('bus_solution_'))s.solution=action.slice(13);
          else if(action==='bus_proposal_save')s.phase='hub';
          else if(action==='bus_proposal_submit'){
            requireRule(!s.submitted&&priorities.includes(s.priority)&&solutions.includes(s.solution));spend(s,profiles[s.character].submit,action);s.submitted=true;s.primary=1;s.phase='hub';
            event(s,'formal_action_completed',{action_instance_id:s.formal_id,channel:'appeal',priority_code:s.priority,solution_code:s.solution});
          }else if(action==='bus_end_confirm'){
            s.bus_completed=true;s.primary=s.submitted?1:0;s.phase='reflection';event(s,'scenario_completed',{scenario_id:'bus',outcome_code:'review_pending'});
          }else if(action.startsWith('clarity_')){
            s.clarity=action==='clarity_skip'?null:Number(action.slice(8));s.phase='bus_result';event(s,'reflection_answered',{item_id:'clarity_bus',value:s.clarity});
            // Full-game session_ended(completed) is absent until all four episodes exist.
          }
          s.decision=null;
        }
        s.revision++;save(s);db.prepare('INSERT INTO receipts VALUES(?,?)').run(s.id,body.request_id);db.exec('COMMIT');return publicState(s);
      }catch(e){db.exec('ROLLBACK');throw e;}
    },
    export(token){const s=get(token),p=s.park;return {metadata:versions,session:{participant_id:s.participant_id,session_id:s.id,character_id:s.character,condition:s.condition,bus_completed:s.bus_completed,bus_primary:s.primary,clarity_bus:s.clarity,park_status:!p?'not_reached':p.completed?'completed':'in_progress',park_plan_id:p?.plan_id??null,park_plan_revision:p?.revision??null,park_plan_components:p?.saved??null,park_shared:p?.shared??null,park_group_contribution:p?.group_snapshot?1:p?.completed?0:null,park_hearing_contribution:p?.hearing_snapshot?1:p?.completed?0:null,park_group_snapshot:p?.group_snapshot??null,park_hearing_snapshot:p?.hearing_snapshot??null,prototype_complete:s.prototype_complete,full_game_complete:false},events:db.prepare('SELECT body FROM events WHERE session_id=? ORDER BY seq').all(s.id).map(x=>JSON.parse(x.body))};},
    remove(token){const s=get(token);db.prepare('DELETE FROM sessions WHERE id=?').run(s.id);db.exec('PRAGMA wal_checkpoint(TRUNCATE)');},
    close(){db.close();}
  };
}
