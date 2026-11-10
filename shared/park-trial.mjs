// A deliberately illustrative model, not a transport forecast or a scoring rule.
import {validPlan} from './park-rules.mjs';
export const TRIAL_MODEL='park-walkthrough-1';
export function trialModel(values){
  if(!validPlan(values))throw new Error('A valid park plan is required');
  const has=k=>values.includes(k);
  const edge=has('edge_green')?'green':has('edge_parking')?'parking':'mixed';
  return {
    model_version:TRIAL_MODEL,
    edge,
    pedestrian:has('crossing')?'direct':'existing_crossing',
    car:edge==='green'?'passes':'stops',
    cyclist:has('bike_rack')?'parks':'continues',
    evening:has('lighting')?'lit':'unlit',
    notes:[
      edge==='green'?'Жиек көгал болып қалды. Көлік бұл жиекте тоқтамай, әрі қарай кетті.':edge==='parking'?'Көлік қысқа тұраққа кірді. Осы жиекте қосымша көгалға орын қалмады.':'Жиектің бір бөлігі көгал, бір бөлігі қысқа тұрақ болды. Әрқайсысына бөлінген орын азайды.',
      has('crossing')?'Тұрғын жаңа өткелмен кіреберіске тура өтті.':'Тұрғын сол жақтағы бар өткелге барып, кіреберіске айналып келді.',
      has('bike_rack')?'Велосипедші велотіреуге тоқтады.':'Велосипедші қою орнын осы сызбадан таппай, жолын жалғастырды.',
      has('lighting')?'Кешкі көріністе жоспарланған шамдар жаяу жолды жарықтандырды.':'Кешкі көріністе жаңа шамдар жоқ; жолдың осы бөлігі қараңғылау қалды.'
    ]
  };
}
