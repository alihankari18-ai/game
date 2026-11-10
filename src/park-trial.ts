import {trialModel} from '../shared/park-trial.mjs';

export function trialScene(preview:string,values:string[]){
  const m=trialModel(values);
  const paths={
    pedestrian:m.pedestrian==='direct'?'M490 235 L270 235 L270 87 L190 87':'M490 235 L36 235 L36 87 L190 87',
    car:m.car==='stops'?'M0 222 L405 222 L405 180':'M0 222 L560 222',
    cyclist:m.cyclist==='parks'?'M25 87 L470 87 L470 60':'M25 87 L560 87'
  };
  const move=(path:string,shape:string)=>'<g class="trial-actor"><animateMotion dur="8s" path="'+path+'" fill="freeze" calcMode="linear"/>'+shape+'</g>';
  const actors='<rect x="0" y="0" width="540" height="205" fill="#122d47" opacity=".28"/>'+
    '<path d="M36 205V240" stroke="#fff0bf" stroke-width="12" stroke-dasharray="3 3"/>'+
    (m.evening==='lit'?[220,315].map(x=>'<circle cx="'+x+'" cy="120" r="32" fill="#ffe4a5" opacity=".45"/>').join(''):'')+
    move(paths.car,'<rect x="-16" y="-7" width="32" height="14" rx="4" fill="#eeb960" stroke="#153941" stroke-width="2"/><rect x="-5" y="-5" width="12" height="10" rx="2" fill="#739a9e"/>')+
    move(paths.pedestrian,'<circle r="9" fill="#de885c" stroke="#fff6de" stroke-width="2"/><circle cy="-3" r="3" fill="#153941"/>')+
    move(paths.cyclist,'<circle cx="-7" cy="3" r="5" fill="none" stroke="#123d50" stroke-width="2"/><circle cx="7" cy="3" r="5" fill="none" stroke="#123d50" stroke-width="2"/><path d="M-7 3L0 -6L7 3Z" fill="#75c3cd" stroke="#123d50"/><circle cy="-9" r="3" fill="#fff6de"/>');
  const scene=preview.replace('<svg ', '<svg id="trial-svg" ').replace('</svg>',actors+'</svg>');
  return '<div class="trial-stage" data-model="'+m.model_version+'" data-pedestrian="'+m.pedestrian+'" data-car="'+m.car+'" data-cyclist="'+m.cyclist+'" data-evening="'+m.evening+'"><div class="trial-heading"><span>КЕШКІ САЯБАҚ</span><span>8 секундтық көрініс</span></div>'+scene+
    '<div class="trial-legend"><span>● Тұрғын</span><span>▰ Көлік</span><span>♧ Велосипедші</span></div><button id="trial-pause" class="quiet" aria-pressed="false">Қозғалысты тоқтату</button></div>'+
    '<div class="trial-observations"><h3>Осы сызбадағы көрініс</h3>'+m.notes.map(n=>'<p>'+n+'</p>').join('')+'</div>';
}
export function bindTrialControls(panel:HTMLElement){
  const svg=panel.querySelector<SVGSVGElement>('#trial-svg');
  const button=panel.querySelector<HTMLButtonElement>('#trial-pause');
  if(!svg||!button)return;
  const finish=()=>{button.disabled=true;button.dataset.wasDisabled='true';button.textContent='Көрініс аяқталды';};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){
    svg.pauseAnimations();svg.setCurrentTime(8);finish();button.textContent='Қозғалыс азайтылған · нәтиже көрсетілді';
  }
  svg.querySelector('animateMotion')?.addEventListener('endEvent',finish);
  button.addEventListener('click',()=>{
    if(svg.animationsPaused()){svg.unpauseAnimations();button.textContent='Қозғалысты тоқтату';button.setAttribute('aria-pressed','false');}
    else{svg.pauseAnimations();button.textContent='Қозғалысты жалғастыру';button.setAttribute('aria-pressed','true');}
  });
}
