import {components} from '../shared/park-rules.mjs';

type Button=(label:string,action:string,kind?:string,selected?:boolean,id?:string)=>string;
export function workbench(s:Record<string,any>,btn:Button,preview:(values:string[])=>string){
  const p=s.park;
  const extras=Object.entries(components).filter(([id])=>!id.startsWith('edge_'));
  const action=(id:string)=>'park_'+(id==='bike_rack'?'bike':id)+(p.draft.includes(id)?'_remove':'_add');
  const notes=extras.filter(([id])=>s.availability.blocked[action(id)]==='plan_budget');
  return '<div class="park-workbench"><div class="workbench-caption">САМАЛ · ЖОБАЛАУ ҮСТЕЛІ <span>Өзгерту тегін</span></div>'+
    '<div class="workbench-scene">'+preview(p.draft)+'<div class="map-tools">'+extras.map(([id,c])=>
      btn('<strong>'+(p.draft.includes(id)?'✓':'＋')+' '+c.label+'</strong><small>'+(p.draft.includes(id)?'Алып тастау':c.cost+' бюджет')+'</small>',
      action(id),'component map-tool map-'+id,p.draft.includes(id),'edit-'+id)).join('')+'</div></div>'+
    '<h3 class="editor-heading">Жиек түрі</h3><div class="edge-tools">'+Object.entries(components).filter(([id])=>id.startsWith('edge_')).map(([id,c])=>
      btn('<strong>'+c.label+'</strong><small>'+c.cost+' бюджет</small>','park_'+id,'component',p.draft.includes(id),'edit-'+id)).join('')+'</div></div>'+
    (notes.length?'<p class="map-budget-note">'+notes.map(([,c])=>c.label).join(', ')+' қосуға бюджет жетпейді. Басқа нысанды алып тастап көріңіз.</p>':'');
}
