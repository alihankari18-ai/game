import { components, modes, budgetUsed, candidatePlan } from '../shared/park-rules.mjs';

type State = Record<string, any>;
const items = components as Record<string,{cost:number,label:string,description:string}>;
const reasons:Record<string,string> = {
  prerequisite:'Жеке жоспар сақталғаннан кейін ашылады',resource:'Қор жеткіліксіз',
  already_completed:'Орындалды',already_selected:'Таңдалған',plan_budget:'6 бірліктік бюджеттен асады'
};
const title=(tag:string,heading:string,text='')=>`<span class="eyebrow">${tag}</span><h2>${heading}</h2>${text?`<p>${text}</p>`:''}`;
export const planNames=(values:string[])=>values.map(x=>items[x].label).join(' · ');
export function planPreview(values:string[],label='Сіздің жоспар нұсқаңыз'){
  const has=(key:string)=>values.includes(key);
  const edge=has('edge_green')?'green':has('edge_parking')?'parking':has('edge_mixed')?'mixed':'empty';
  const tree=(x:number,y:number)=>`<rect x="${x-3}" y="${y}" width="6" height="18" fill="#7b6953"/><circle cx="${x}" cy="${y-6}" r="16" fill="#3e7661"/><circle cx="${x-5}" cy="${y-11}" r="10" fill="#659571"/>`;
  return `<figure class="plan-preview" data-edge="${edge}" aria-label="${label}: ${values.length?planNames(values):'Жиек әлі таңдалмады'}">
    <svg viewBox="0 0 540 240" role="img" aria-label="Саябақ жоспарының сызбасы">
      <rect width="540" height="240" rx="12" fill="#dce7d6"/><rect x="20" y="20" width="500" height="133" rx="12" fill="#99b795"/>
      <path d="M20 87H520M270 20V160" stroke="#e0d4af" stroke-width="17"/>
      ${[[75,45],[150,115],[365,45],[457,115]].map(([x,y])=>tree(x,y)).join('')}
      <rect x="20" y="160" width="500" height="35" rx="5" fill="${edge==='empty'?'#c1ccbb':edge==='green'?'#739964':edge==='parking'?'#8e9b98':'#a4ad8c'}" stroke="#7c9683" stroke-dasharray="${edge==='empty'?'6 5':'0'}"/>
      ${edge==='green'||edge==='mixed'?[60,110,...(edge==='green'?[360,415,470]:[])].map(x=>tree(x,171)).join(''):''}
      ${edge==='parking'||edge==='mixed'?(edge==='mixed'?[350,405,460]:[65,120,175,350,405,460]).map(x=>`<path d="M${x-20} 165V190H${x+17}" fill="none" stroke="#e7e8d5" stroke-width="2"/><rect x="${x-13}" y="168" width="24" height="16" rx="4" fill="#d8d7bf"/>`).join(''):''}
      <rect x="0" y="205" width="540" height="35" fill="#526e70"/><path d="M0 224H540" stroke="#a2b4a7" stroke-width="2" stroke-dasharray="20 14"/>
      ${has('crossing')?[0,1,2,3,4].map(i=>`<rect x="248" y="${207+i*6}" width="44" height="3" fill="#fbf4d5"/>`).join(''):''}
      ${has('lighting')?[220,315].map(x=>`<circle cx="${x}" cy="120" r="25" fill="#ffe1a0" opacity=".6"/><path d="M${x} 145V113h12" stroke="#4a655d" stroke-width="4"/><circle cx="${x+12}" cy="114" r="5" fill="#ffe4ac"/>`).join(''):''}
      ${has('bike_rack')?[0,1,2].map(i=>`<path d="M${460+i*12} 65V54q4-8 8 0v11" fill="none" stroke="#50757a" stroke-width="3"/>`).join(''):''}
      <rect x="185" y="24" width="170" height="23" rx="10" fill="#f2f0dd"/><text x="270" y="40" text-anchor="middle" font-family="Arial" font-size="11" fill="#46654f">Орталық ағаштар сақталады</text>
    </svg><figcaption>${label} · ${budgetUsed(values)} / 6 бюджет${!values.length?' · Жиек таңдалмады':''}</figcaption>
  </figure>`;
}
export function renderPark(s:State){
  const p=s.park;
  const savingCost=p.revision?0:s.profile.submit;
  const timePreview=(cost:number,label:string)=>`<div class="time-preview"><strong>Уақыт қоры: ${s.time} бірлік</strong><span>${label}: ${cost} бірлік</span><b>${s.time>=cost?'Одан кейін қалады: '+(s.time-cost):'Қосымша қажет: '+(cost-s.time)} бірлік</b></div>`;
  const guide=`<details class="resource-guide"><summary>Үш қор қалай жұмыс істейді?</summary><p><b>Уақыт қоры</b> — кейіпкердің осы эпизодтағы істеріне арналған шартты бірліктер. Бұл таймер емес. Оқу ұзақтығы қорды азайтпайды; құны көрсетілген әрекет жұмсайды. Күткенде қор толмайды.</p><p><b>Жоба бюджеті — 6 бірлік.</b> Онымен саябақтың нысандарын жоспарлайсыз. Бюджетті түгел қолдансаңыз да, уақыт жетсе жоспарды сақтай аласыз.</p><p><b>Жеке қаражат</b> — тек ақылы сапарға арналған. Жоспар құрастыруға ақша алынбайды.</p></details>`;
  const btn=(label:string,action:string,kind='choice',selected=false,id='')=>{
    const reason=s.availability.blocked[action];
    let why=reasons[reason]||'';
    if(action==='park_plan_save'&&reason==='prerequisite')why=budgetUsed(p.draft)>3?'Жиекке орын қалдырыңыз: қосымшаны алыңыз немесе дайын сызба таңдаңыз':'Сақтау үшін бір жиек нұсқасын таңдаңыз';
    if(action==='park_hearing_submit'&&reason==='prerequisite')why='Қатысу тәсілін таңдаңыз';
    if(reason==='plan_budget')why=`Жобаға ${budgetUsed(candidatePlan(p.draft,action))} бірлік керек, шегі — 6. Қосымшаны алып тастауға болады.`;
    if(reason==='resource'){
      const mode=action.startsWith('park_mode_')?(modes as Record<string,any>)[action.slice(10)]:action==='park_hearing_submit'?(modes as Record<string,any>)[p.mode]:null;
      const time=mode?mode.time:action==='park_materials'?s.profile.info:action==='park_group_publish'?s.profile.group:savingCost;
      const money=mode?.money??0;
      why=[...(time>s.time?[`Уақыт: ${time} керек, сізде ${s.time}`]:[]),...(money>s.money?[`Жеке қаражат: ${money} керек, сізде ${s.money}`]:[])].join('. ');
    }
    return `<button ${id?`id="${id}"`:''} class="${kind}${selected?' selected':''}" data-action="${action}" ${reason?'disabled':''} ${kind==='component'||kind==='mode-option'?`aria-pressed="${selected}"`:''}>${label}${why?`<small class="blocked-reason">${why}</small>`:''}</button>`;
  };
  const overview=()=>`<div class="contributions"><div><span>Өзіңізде сақталған</span><strong>${p.revision?'Жоспар · '+p.revision+'-нұсқа':'Жоспар жоқ'}</strong></div><div><span>Көршілер тақтасы</span><strong>${p.group_snapshot?'Қосылды · '+p.group_snapshot.plan_revision+'-нұсқа':'Қосылған жоқ'}</strong></div><div><span>Ресми талқылау</span><strong>${p.hearing_snapshot?'Ұсынылды · '+p.hearing_snapshot.plan_revision+'-нұсқа':'Ұсынылған жоқ'}</strong></div></div>`;
  if(s.phase==='park_intro'||s.phase==='park_hub'){
    const intro=s.phase==='park_intro';
    return title('02 · САМАЛ САЯБАҒЫ',intro?'Бір жиек. Бірнеше мүдде.':p.revision?'Жоспарыңыз қайда барады?':'Жоспарды осы жерден бастаңыз.',intro?'Саябақ жиегінің бір бөлігін тұраққа бейімдеу ұсынылды. Орталық ағаштар сақталады. Дау — жиектің қалай пайдаланылатынында.':p.revision?'Жоспарды өзіңізде қалдыруға, көршілермен бөлісуге немесе ресми талқылауға ұсынуға болады.':'Жоспар редакторында өз сызбаңызды құрастырып, сақтай аласыз. Жоспарсыз жалғастыруға да болады.')+
      (intro?`<div class="news-card"><span class="eyebrow">КЕЛЕСІ АПТА · №18 ЖАҢАЛЫҒЫ</span><p>Бір айлық сынақ ұсынылды; аудан аялдамасы сынақ кезінде сақталады.${s.submitted?' Жеке ұсынысыңыз материалдарда тіркелген.':''}</p><p><b>Осы эпизодқа ${s.profile.time} уақыт бірлігі берілді.</b> Қазір: ${s.time}. Автобустағы шығын саябаққа көшірілмейді.</p></div><div class="voices"><p>«Кешке тынығатын орын азаймаса екен».</p><p>«Көліктер жаяу жолға жиналмайтын орын керек».</p><p>«Ал кіреберісті ашық қалдырайық».</p></div><p class="aside">Чат әкімшісі: «Бәрі керек деген нұсқаның бюджеті әзірге табылмады».</p>`:p.revision?overview():'')+
      (p.revision?planPreview(p.saved):'')+
      `<section class="planning-step" aria-label="Жоспар жасау"><span class="eyebrow">1 · ЖЕКЕ ЖОСПАР</span><h3>${p.revision?'Жоспарыңызды өзгерте аласыз':'Редакторды ашып, сызба құрастырыңыз'}</h3><p>Редакторды ашу және нұсқаларды сынау тегін. Жоба нысандарына бөлек 6 бірліктік бюджет беріледі.</p>${timePreview(savingCost,p.revision?'Қайта сақтау':'Алғаш сақтау')}${btn(p.revision?'Жоспар редакторын қайта ашу →':'Жоспар редакторын ашу →','park_plan_open','primary')}</section>${guide}
      <div class="stack">${btn(`Материалдарды ашу <small>${p.info?'Қайта ашу тегін':`Алғаш ашу — ${s.profile.info} уақыт бірлігі`} · сызба және шығындар</small>`,'park_materials')}
      ${btn(`Хабарды аудан чатына бөлісу <small>${p.shared?'Бөлісілді':'Тегін · бір рет'}</small>`,'park_share')}
      <h3 class="editor-heading">2 · Сақталған жоспарды ұсыну</h3><p class="small">Жоспар жасаған соң осы екі жол ашылады. Ұсыну міндетті емес.</p>
      ${btn(`Топ тақтасына қосу <small>${s.profile.group} уақыт · нақты үлес</small>`,'park_group_open')}${btn('Ресми талқылауда таныстыру <small>1–2 уақыт · сапар тәсілі таңдалады</small>','park_hearing_open')}
      ${btn(p.revision?'Осы нәтижемен эпизодты аяқтау →':'Жеке жоспарсыз жалғастыру →',p.revision?'park_end_confirm':'park_exit_open','quiet')}</div>`;
  }
  if(s.phase==='park_materials')return title('САЯБАҚ · МАТЕРИАЛДАР','Нені өзгертуге болады?','Орталық ағаштар мен негізгі жаяу жол қалады. Таңдау тек саябақ жиегіне және қосымша нысандарға қатысты.')+
    `<p class="small">Төмендегі сандар — жоба бюджетінен жұмсалатын бірліктер. Сіздің уақыт қорыңыз қазір: ${s.time} бірлік.</p><div class="cost-table">${Object.entries(items).map(([id,c])=>`<div><span>${c.label}<small>${c.description}</small></span><b>${c.cost}</b></div>`).join('')}</div><p class="small">Дәл бір жиек таңдалады. Қосымшалар ерікті, жалпы құн 6-дан аспайды. Бұл ойындық жоспар; нақты құрылыс сметасы емес.</p>${btn('Таңдауларға оралу →','park_materials_back','primary')}`;
  if(s.phase==='park_editor'){
    const used=budgetUsed(p.draft);
    return title('СІЗДІҢ ЖОСПАР НҰСҚАҢЫЗ','Жиекті бірге ойластырайық.','Нұсқаларды ауыстырып көріңіз: карта бірден өзгереді. Өзгерту тегін; бұл әлі салынған нысан емес.')+
      `${timePreview(savingCost,p.revision?'Қайта сақтау':'Алғаш сақтау')}<div class="budget-bar" aria-live="polite"><span>Жобаға бөлінді</span><strong>${used} / 6</strong><span>Бюджет қалдығы: <b>${6-used}</b></span></div><p class="small">Жоба бюджетінің қалдығы 0 болса да, жарамды жоспарды уақыт қорымен сақтауға болады.</p>${planPreview(p.draft)}
      <div class="preset-row">${btn('Жасыл жиек <small>Дайын нұсқа · 6</small>','park_preset_green','preset')}${btn('Қысқа тұрақ <small>Дайын нұсқа · 6</small>','park_preset_parking','preset')}${btn('Аралас <small>Дайын нұсқа · 6</small>','park_preset_mixed','preset')}</div>
      <h3 class="editor-heading">1. Бір жиек таңдаңыз</h3><div class="component-grid">${Object.entries(items).filter(([id])=>id.startsWith('edge_')).map(([id,c])=>btn(`<strong>${c.label}</strong><span>${c.description}</span><b>${c.cost} бюджет</b>`,'park_'+id,'component',p.draft.includes(id),'edit-'+id)).join('')}</div>
      <h3 class="editor-heading">2. Қосымша нысандар</h3><div class="component-grid">${Object.entries(items).filter(([id])=>!id.startsWith('edge_')).map(([id,c])=>btn(`<strong>${p.draft.includes(id)?'✓ ':''}${c.label}</strong><span>${c.description}</span><b>${p.draft.includes(id)?'Алып тастау':'+ '+c.cost+' бюджет'}</b>`,'park_'+(id==='bike_rack'?'bike':id)+(p.draft.includes(id)?'_remove':'_add'),'component',p.draft.includes(id),'edit-'+id)).join('')}</div>
      <p class="small editor-note">${p.revision?'Сізде сақталған '+p.revision+'-нұсқа бар. Қайта сақтау уақыт алмайды.':'Алғашқы сақтау — '+s.profile.submit+' уақыт. Оған дейін ресурсыңыз жұмсалмайды.'}</p><div class="stack">${btn('Жоспарды сақтау →','park_plan_save','primary')}${btn('Сызбаны тазарту','park_plan_clear','quiet')}${btn('Өзгерістерді сақтамай қайту','park_plan_back','quiet')}</div>`;
  }
  if(s.phase==='park_group')return title('КӨРШІЛЕРДІҢ ОРТАҚ ТАҚТАСЫ','Нұсқаңызды бірге салыстырайық.','Көрші: «Жоспарыңызды ортақ тақтаға қоссаңыз, бірге салыстырамыз». Топтағы тұрғындар — ойын кейіпкерлері.')+
    planPreview(p.saved,`Жарияланатын ${p.revision}-нұсқа`)+timePreview(s.profile.group,'Топқа жариялау')+`<p>Уақыт тек жариялаған кезде жұмсалады.</p><div class="stack">${btn('Топ тақтасына қосу →','park_group_publish','primary')}${btn('Әзірге қайту','park_group_back','quiet')}</div>`;
  if(s.phase==='park_hearing')return title('РЕСМИ ТАЛҚЫЛАУ','Қай тәсілмен таныстырасыз?','Үш тәсіл де бір жоспарды ұсынуға мүмкіндік береді. Қатысу тәсілі ұсыныстың мақұлдануына кепілдік бермейді.')+
    planPreview(p.saved,`Ұсынылатын ${p.revision}-нұсқа`)+`<div class="stack">${Object.entries(modes).map(([key,m])=>btn(`<strong>${m.label}</strong><span>${m.time} уақыт · ${m.money?m.money+' жеке қаражат':'ақшалай шығын жоқ'}</span>`,'park_mode_'+key,'mode-option',p.mode===key)).join('')}</div><p class="small editor-note">${p.mode?`Таңдалғаны: ${(modes as Record<string,any>)[p.mode].label}. Толық құны жоғарыда көрсетілген.`:'Ешбір тәсіл алдын ала таңдалмаған.'} Қазір: ${s.time} уақыт, ${s.money} жеке қаражат.</p><div class="stack">${btn('Жоспарды таныстыру →','park_hearing_submit','primary')}${btn('Әзірге қайту','park_hearing_back','quiet')}</div>`;
  if(s.phase==='park_result')return title('САЯБАҚ · ЭПИЗОД АЯҚТАЛДЫ','Талқылау аяқталды, шешім алда.','Қала тобы қосымша бағалау жасайды. Түпкілікті құрылыс шешімі кейін жарияланады. Картада сіздің ұсынысыңыз ғана бейнеленген.')+overview()+(p.revision?planPreview(p.saved):'<div class="note">Сіз жоспар құрмай жалғастыруды таңдадыңыз.</div>')+`<p class="small">${p.shared?'Аудан чатына хабар бөлістіңіз.':'Аудан чатына хабар бөліскен жоқсыз.'} Бұл жоспар ұсынудан бөлек әрекет.</p>${btn('Екі эпизодтың қорытындысы →','park_finish_prototype','primary')}`;
  if(s.phase==='park_exit')return title('ЭПИЗОДТЫ АЯҚТАУ','Жеке жоспарсыз жалғастырасыз ба?','Жеке жоспар әлі сақталмаған. Эпизодты осылай аяқтауға немесе таңдауларға оралуға болады.')+timePreview(savingCost,'Жоспарды алғаш сақтау')+`<div class="stack">${btn('Таңдауларға оралу','park_exit_back')}${btn('Жоспарсыз аяқтау','park_end_confirm')}</div>`;
  return '';
}
