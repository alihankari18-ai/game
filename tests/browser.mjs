import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('test-results',{recursive:true});
const db='test-results/browser.sqlite';for(const suffix of ['','-wal','-shm'])rmSync(db+suffix,{force:true});
const server=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'8799',GAME_DB:db},stdio:['ignore','pipe','pipe']});
let browser;
try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timeout')),10000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited '+code)));});
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const errors=[];
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    let createRequests=0;page.on('request',req=>{if(req.url().endsWith('/api/session')&&req.method()==='POST')createRequests++;});
    await page.goto('http://127.0.0.1:8799');await page.waitForSelector('canvas');
    await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-welcome.png`,fullPage:true});
    assert.equal(createRequests,0);assert.equal(await page.locator('#start').isDisabled(),true);
    await page.locator('#adult').check();await page.locator('#consent').check();await page.locator('#start').click();
    const click=async(action)=>{const b=page.locator(`[data-action="${action}"]`);await b.waitFor();await b.click();};
    await page.locator('[data-action="choose_digital"]:enabled').waitFor();
    await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-characters.png`,fullPage:true});
    await click(mobile?'choose_flexible':'choose_community');await click('bus_begin');await click('bus_pre_pass');await page.locator('[data-action="bus_reply_continue"]:enabled').waitFor();
    const getExport=()=>page.evaluate(async()=>{const token=localStorage.getItem('ortaq-dev-v02-session');return fetch('/api/export',{headers:{Authorization:'Bearer '+token}}).then(r=>r.json());});
    const before=await getExport();await page.reload();await page.locator('[data-action="bus_reply_continue"]:enabled').waitFor();const reloaded=await getExport();assert.equal(before.session.condition,reloaded.session.condition);
    assert.equal(reloaded.events.filter(e=>e.event_type==='condition_assigned').length,1);assert.equal(reloaded.events.filter(e=>e.event_type==='feedback_shown').at(-1).payload.display_kind,'revisit');
    await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-reply.png`,fullPage:true});
    await click('bus_reply_continue');
    if(!mobile){
      await click('bus_proposal_open');assert.equal(await page.locator('[data-action="bus_proposal_submit"]').isDisabled(),true);
      await page.locator('#priority').selectOption('walk');await page.locator('#solution:enabled').waitFor();await page.locator('#solution').selectOption('trial');await page.locator('[data-action="bus_proposal_save"]:enabled').waitFor();await click('bus_proposal_save');
      await page.reload();await click('bus_proposal_open');assert.equal(await page.locator('#priority').inputValue(),'walk');
      await page.locator('[data-action="bus_proposal_submit"]:enabled').waitFor();await page.screenshot({path:'test-results/desktop-proposal.png',fullPage:true});
      // Server commits, but the response is lost. Retrying after reload must not double-charge.
      let lost=false;await page.route('**/api/command',async route=>{const body=route.request().postDataJSON();if(body.action==='bus_proposal_submit'&&!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
      await click('bus_proposal_submit');await page.locator('#error:not([hidden])').waitFor();await page.unroute('**/api/command');await page.reload();await page.locator('[data-action="bus_end_confirm"]:enabled').waitFor();
      const completed=await getExport();assert.equal(completed.events.filter(e=>e.event_type==='formal_action_completed').length,1);assert.equal(completed.events.filter(e=>e.event_type==='resource_changed'&&e.payload.reason==='action').length,1);
      await click('bus_materials');await click('bus_materials_back');
    }
    await click('bus_end_confirm');await click('clarity_skip');await click('bus_continue_park');
    await page.locator('[data-action="park_plan_open"]:enabled').waitFor();
    const assertChoices=async()=>{const actual=await page.evaluate(async()=>{const s=await fetch('/api/state',{headers:{Authorization:'Bearer '+localStorage.getItem('ortaq-dev-v02-session')}}).then(r=>r.json());return {offered:s.availability.all.sort(),available:s.availability.available.sort(),dom:[...document.querySelectorAll('#panel [data-action]')].map(e=>e.dataset.action).sort(),enabled:[...document.querySelectorAll('#panel [data-action]:not(:disabled)')].map(e=>e.dataset.action).sort()};});assert.deepEqual(actual.dom,actual.offered);assert.deepEqual(actual.enabled,actual.available);};
    await assertChoices();const parkStarted=await getExport();assert.equal(parkStarted.session.bus_primary,mobile?0:1);assert.equal(parkStarted.session.park_status,'in_progress');
    await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-park-intro.png`,fullPage:true});
    await click('park_plan_open');assert.equal(await page.locator('[data-action="park_plan_save"]').isDisabled(),true);
    await click('park_preset_green');await page.locator('[data-action="park_plan_save"]:enabled').waitFor();
    assert.equal(await page.locator('[data-action="park_lighting_add"]').isDisabled(),true);
    assert.equal(await page.locator('.plan-preview').getAttribute('data-edge'),'green');
    await page.reload();await page.locator('[data-action="park_plan_save"]:enabled').waitFor();assert.equal(await page.locator('.plan-preview').getAttribute('data-edge'),'green');
    await assertChoices();await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-park-editor.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Park editor: no horizontal overflow');
    if(mobile){
      await click('park_plan_back');await click('park_plan_open');assert.equal(await page.locator('.plan-preview').getAttribute('data-edge'),'empty');
      await click('park_preset_mixed');await click('park_plan_save');await click('park_materials');await click('park_materials_back');await click('park_materials');await click('park_materials_back');
      await click('park_hearing_open');await page.locator('[data-action="park_mode_walk"]:enabled').waitFor();assert.equal(await page.locator('[data-action="park_mode_paid"]').isDisabled(),true);
      await click('park_mode_walk');await page.locator('[data-action="park_hearing_submit"]:enabled').waitFor();await page.screenshot({path:'test-results/mobile-park-hearing.png',fullPage:true});await click('park_hearing_submit');
      await click('park_group_open');await page.locator('[data-action="park_group_back"]:enabled').waitFor();assert.equal(await page.locator('[data-action="park_group_publish"]').isDisabled(),true);await click('park_group_back');
    }else{
      await click('park_plan_save');await click('park_group_open');
      let lost=false;await page.route('**/api/command',async route=>{if(route.request().postDataJSON().action==='park_group_publish'&&!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
      await click('park_group_publish');await page.locator('#error:not([hidden])').waitFor();await page.unroute('**/api/command');await page.reload();await page.locator('[data-action="park_plan_open"]:enabled').waitFor();
      let ex=await getExport();assert.equal(ex.events.filter(e=>e.event_type==='collective_task_completed').length,1);
      await click('park_plan_open');await click('park_preset_parking');await click('park_plan_save');await click('park_hearing_open');await click('park_mode_online');await click('park_hearing_submit');
      await click('park_plan_open');await click('park_preset_mixed');await click('park_plan_save');
      ex=await getExport();assert.equal(ex.session.park_plan_revision,3);assert.equal(ex.session.park_group_snapshot.plan_revision,1);assert.equal(ex.session.park_hearing_snapshot.plan_revision,2);
    }
    await click('park_share');await page.locator('[data-action="park_end_confirm"]:enabled').waitFor();assert.equal(await page.locator('[data-action="park_share"]').isDisabled(),true);
    await click('park_end_confirm');await page.locator('[data-action="park_finish_prototype"]:enabled').waitFor();
    await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-park-result.png`,fullPage:true});
    await click('park_finish_prototype');await page.locator('#ending-export:enabled').waitFor();
    const exported=await getExport();assert.equal(exported.session.bus_primary,mobile?0:1);assert.equal(exported.session.prototype_complete,true);assert.equal(exported.session.full_game_complete,false);assert.equal(exported.session.park_status,'completed');assert.equal(exported.session.park_hearing_contribution,1);assert.equal(exported.session.park_group_contribution,mobile?0:1);
    assert.ok(exported.events.every(e=>e.study_phase==='dev'));assert.equal(exported.events.filter(e=>e.event_type==='session_ended').length,0);
    await page.screenshot({path:`test-results/${mobile?'mobile':'desktop'}-ending.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
    await page.locator('#ending-export').click();const downloadPromise=page.waitForEvent('download');await page.locator('[data-export="csv"]').click();const download=await downloadPromise;await download.saveAs(`test-results/${mobile?'mobile':'desktop'}-events.csv`);
    const oldToken=await page.evaluate(()=>localStorage.getItem('ortaq-dev-v02-session'));page.once('dialog',d=>d.accept());await page.locator('#delete').click();await page.locator('#start').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('ortaq-dev-v02-session')),null);
    const deleted=await context.request.get('http://127.0.0.1:8799/api/export',{headers:{Authorization:'Bearer '+oldToken}});assert.equal(deleted.status(),401);
    await context.close();console.log(`${mobile?'Mobile 390px':'Desktop 1440px'}: bus + park, editor, budget, reload, publication snapshots, export and deletion passed.`);
  }
  const skipContext=await browser.newContext({viewport:{width:360,height:800}});const skip=await skipContext.newPage();skip.on('pageerror',e=>errors.push(e.message));
  await skip.goto('http://127.0.0.1:8799');await skip.locator('#adult').check();await skip.locator('#consent').check();await skip.locator('#start').click();
  for(const action of ['choose_digital','bus_begin','bus_pre_pass','bus_reply_continue','bus_end_confirm','clarity_skip','bus_continue_park','park_end_confirm','park_finish_prototype'])await skip.locator(`[data-action="${action}"]`).click();
  await skip.locator('#ending-export:enabled').waitFor();const skipped=await skip.evaluate(async()=>fetch('/api/export',{headers:{Authorization:'Bearer '+localStorage.getItem('ortaq-dev-v02-session')}}).then(r=>r.json()));
  assert.equal(skipped.session.bus_primary,0);assert.equal(skipped.session.park_group_contribution,0);assert.equal(skipped.session.park_hearing_contribution,0);assert.equal(skipped.session.park_plan_revision,0);
  assert.equal(await skip.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await skipContext.close();console.log('360px: both episodes can be completed without participating.');
  assert.deepEqual(errors,[]);console.log('No browser JavaScript errors. Screenshots saved in test-results/.');
}finally{await browser?.close();server.kill('SIGTERM');}
