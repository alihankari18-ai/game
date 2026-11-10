// Shared display/validation rules. The server remains authoritative for writes.
export const PARK_BUDGET = 6;
export const components = {
  edge_green: {cost:3, label:'Жасыл жиек', description:'Саябақ жиегін көгалдандыру'},
  edge_parking: {cost:3, label:'Қысқа тұрақ', description:'Жиекте қысқа аялдау орындары'},
  edge_mixed: {cost:4, label:'Аралас жиек', description:'Көгал мен аз орындық тұрақ'},
  crossing: {cost:2, label:'Жаяу өткел', description:'Кіреберіске өтуді ұйымдастыру'},
  lighting: {cost:2, label:'Жарық', description:'Жаяу жолға шамдар қою'},
  bike_rack: {cost:1, label:'Велотіреу', description:'Велосипед қоятын орын'}
};
export const presets = {
  green:['edge_green','crossing','bike_rack'],
  parking:['edge_parking','lighting','bike_rack'],
  mixed:['edge_mixed','crossing']
};
export const modes = {
  online:{time:1,money:0,label:'Онлайн',participation_mode:'online',travel_mode:'none'},
  walk:{time:2,money:0,label:'Офлайн, жаяу',participation_mode:'onsite',travel_mode:'walk'},
  paid:{time:1,money:2,label:'Офлайн, ақылы сапар',participation_mode:'onsite',travel_mode:'paid'}
};
export const ordered = values => Object.keys(components).filter(key=>values.includes(key));
export const budgetUsed = values => values.reduce((sum,key)=>sum+(components[key]?.cost??Infinity),0);
export const samePlan = (a,b) => JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
export function validPlan(values){
  return Array.isArray(values) && new Set(values).size===values.length &&
    values.every(key=>Object.hasOwn(components,key)) &&
    values.filter(key=>key.startsWith('edge_')).length===1 && budgetUsed(values)<=PARK_BUDGET;
}
export function candidatePlan(current,action){
  if(action==='park_plan_clear')return [];
  if(action.startsWith('park_preset_'))return [...presets[action.slice(12)]];
  if(action.startsWith('park_edge_'))return ordered([...current.filter(key=>!key.startsWith('edge_')),action.slice(5)]);
  for(const key of ['crossing','lighting','bike_rack']){
    const code=key==='bike_rack'?'bike':key;
    if(action===`park_${code}_add`)return ordered([...current,key]);
    if(action===`park_${code}_remove`)return current.filter(x=>x!==key);
  }
  return null;
}
export const editActions = draft => [
  ...Object.keys(presets).map(x=>'park_preset_'+x),
  'park_edge_green','park_edge_parking','park_edge_mixed',
  ...['crossing','lighting','bike_rack'].map(key=>`park_${key==='bike_rack'?'bike':key}_${draft.includes(key)?'remove':'add'}`),
  'park_plan_clear'
];
