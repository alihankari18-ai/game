import Phaser from 'phaser';

export function createCity(parent:string){
  type View = {park:boolean,components:string[],editor:boolean};
  let view:View={park:false,components:[],editor:false};
  let update:((value:View)=>void)|undefined;
  class Neighborhood extends Phaser.Scene {
    create(){
      let g=this.add.graphics();
      const origin={x:490,y:75};const tile=37;
      const iso=(x:number,y:number,z=0)=>({x:origin.x+(x-y)*tile,y:origin.y+(x+y)*tile*.49-z});
      const poly=(pts:{x:number,y:number}[],color:number)=>{g.fillStyle(color);g.fillPoints(pts,true);};
      const diamond=(x:number,y:number,w:number,d:number,color:number,z=0)=>poly([iso(x,y,z),iso(x+w,y,z),iso(x+w,y+d,z),iso(x,y+d,z)],color);
      const box=(x:number,y:number,w:number,d:number,h:number,color:number)=>{
        poly([iso(x,y+d),iso(x+w,y+d),iso(x+w,y+d,h),iso(x,y+d,h)],color);
        poly([iso(x+w,y),iso(x+w,y+d),iso(x+w,y+d,h),iso(x+w,y,h)],Phaser.Display.Color.ValueToColor(color).darken(20).color);
        diamond(x,y,w,d,Phaser.Display.Color.ValueToColor(color).lighten(19).color,h);
        for(let floor=12;floor<h-4;floor+=13)for(let col=.2;col<w-.1;col+=.38){const p=iso(x+col,y+d+.01,floor);g.fillStyle(0xffd697,.77);g.fillRect(p.x,p.y,5,6);}
        diamond(x+.15,y+.15,w-.3,d-.3,0x6c9097,h+1);
      };
      const tree=(x:number,y:number,size=1)=>{const p=iso(x,y);g.fillStyle(0x0e303b,.35);g.fillEllipse(p.x+8,p.y+3,30*size,13*size);g.fillStyle(0x715c49);g.fillRect(p.x-2,p.y-23*size,4,23*size);g.fillStyle(0x366f64);g.fillCircle(p.x,p.y-28*size,14*size);g.fillStyle(0x619575);g.fillCircle(p.x-5,p.y-34*size,10*size);};
      diamond(-1,-1,17,15,0x122d38);
      diamond(0,0,15,13,0x638b80);
      for(let x=0;x<15;x++)for(let y=0;y<13;y++)diamond(x+.025,y+.025,.95,.95,(x+y)%3?0x709487:0x75998a);
      for(const y of [3.5,8.5]){diamond(0,y-.16,15,1.72,0x9baaa2);diamond(0,y,15,1.4,0x345260);for(let x=.3;x<15;x+=.85)diamond(x,y+.68,.43,.035,0xa9b7ac);}
      for(const x of [3,10.6]){diamond(x-.16,0,1.72,13,0x9baaa2);diamond(x,0,1.4,13,0x345260);for(let y=.3;y<13;y+=.85)diamond(x+.68,y,.035,.43,0xa9b7ac);}
      for(let i=0;i<6;i++){diamond(2.97,3.55+i*.19,1.45,.09,0xdddcc5);diamond(10.6,8.54+i*.19,1.45,.09,0xdddcc5);}
      // Buildings follow painter order; parks and pedestrian paths remain visible.
      box(.4,.5,1.8,1.9,67,0x8098a5);box(5,.6,2.3,1.8,54,0xd0bd9b);box(8.1,.6,1.6,2,79,0x8da0a6);box(12.3,.6,1.8,1.9,48,0xb6a38d);
      box(.5,5.6,1.7,1.8,47,0xd0b494);
      diamond(4.8,5.2,5.3,2.7,0x548b6b);diamond(7.1,5.2,.45,2.7,0xc2b491);diamond(4.8,6.3,5.3,.4,0xc2b491);
      for(const [x,y] of [[5.2,5.7],[6.2,7.4],[8.6,5.6],[9.5,7.3],[12.7,5.6],[13.7,6.7]])tree(x,y,1.05);
      box(12.2,7,1.9,1.1,27,0xc5a886);
      g=this.add.graphics().setDepth(2);
      box(.6,10.5,1.7,1.7,60,0xb0b8b0);box(5,10.3,2,1.7,46,0xc6ae90);box(8.1,10.4,1.6,1.6,62,0x7d9aa3);box(12.2,10.6,2,1.5,35,0xd8be94);
      for(const [x,y] of [[.5,3],[2.4,7.7],[5.2,8],[9.6,9.9],[12.3,3.1],[14.3,11.6],[7.6,12.4]])tree(x,y,.8);
      // Sheltered bus stop and a small bus on the avenue.
      box(4.8,3.05,1.1,.4,15,0x396b70);diamond(4.7,3,1.3,.55,0xf3c374,18);
      box(6.5,4,1.5,.58,15,0xd4b069);diamond(6.65,4.06,.9,.42,0xf4d291,17);
      const labels=[{x:5.3,y:3.1,title:'№18 · Аялдама',active:true},{x:7.5,y:6.3,title:'Самал саябағы'},{x:6.2,y:11.5,title:'Үй ауласы'},{x:13,y:11.5,title:'Кітапхана'}];
      const labelObjects:Phaser.GameObjects.Text[]=[];
      for(const [index,label] of labels.entries()){const p=iso(label.x,label.y,25);const text=this.add.text(p.x,p.y,label.title,{fontFamily:'Arial, sans-serif',fontSize:label.active?'16px':'13px',color:label.active?'#172f37':'#e4efe9',backgroundColor:label.active?'#f5c576':'#1a3b47',padding:{x:12,y:8}}).setOrigin(.5,1).setDepth(3);labelObjects.push(text);if(index<2){text.setInteractive({useHandCursor:true}).on('pointerdown',()=>document.dispatchEvent(new CustomEvent(index===0?'city:bus':'city:park')));}}
      this.add.text(480,20,'С А М А Л   А У Д А Н Ы',{fontFamily:'Arial',fontSize:'13px',color:'#b1c9c6'}).setOrigin(.5);
      const plan=this.add.graphics().setDepth(1);
      const outline=(x:number,y:number,w:number,d:number,color:number)=>{plan.fillStyle(color);plan.fillPoints([iso(x,y),iso(x+w,y),iso(x+w,y+d),iso(x,y+d)],true);};
      update=(next)=>{
        plan.clear();
        labelObjects[0].setStyle({color:next.park?'#e4efe9':'#172f37',backgroundColor:next.park?'#1a3b47':'#f5c576'});
        labelObjects[1].setStyle({color:next.park?'#172f37':'#e4efe9',backgroundColor:next.park?'#f5c576':'#1a3b47'});
        if(!next.park)return;
        const has=(c:string)=>next.components.includes(c);
        plan.lineStyle(2,0xf5c576,.8);plan.strokePoints([iso(4.7,5.1),iso(10.2,5.1),iso(10.2,8.2),iso(4.7,8.2)],true);
        if(has('edge_green')||has('edge_mixed')){
          outline(4.9,7.5,has('edge_mixed')?2:5,.48,0x87a462);
          for(const x of (has('edge_mixed')?[5.3,6]:[5.3,6,6.7,8.5,9.2])){const p=iso(x,7.7,9);plan.fillStyle(0x547e50);plan.fillCircle(p.x,p.y,7);plan.fillStyle(0x9cb672);plan.fillCircle(p.x-2,p.y-3,5);}
        }
        if(has('edge_parking')||has('edge_mixed')){
          const start=has('edge_mixed')?7.5:4.9;outline(start,7.5,10-start,.48,0x8a9a92);
          for(let x=start+.15;x<9.8;x+=.65){outline(x,7.54,.04,.38,0xe5e4cd);outline(x+.13,7.58,.33,.22,0xccd3bd);}
        }
        if(has('crossing'))for(let i=0;i<7;i++)outline(7.05,8.5+i*.18,.75,.08,0xf8e5b7);
        if(has('lighting'))for(const x of [5,9.8]){const p=iso(x,6.6);plan.fillStyle(0xffd590,.12);plan.fillEllipse(p.x,p.y,54,25);plan.lineStyle(3,0x334f50);plan.lineBetween(p.x,p.y,p.x,p.y-28);plan.fillStyle(0xffd99a);plan.fillCircle(p.x,p.y-30,5);}
        if(has('bike_rack'))for(let i=0;i<3;i++){const p=iso(9.4+i*.2,5.35);plan.lineStyle(3,0xd5e8dc);plan.strokeRoundedRect(p.x,p.y-10,6,12,2);}
      };
      update(view);
    }
  }
  const game=new Phaser.Game({type:Phaser.CANVAS,parent,width:1000,height:660,transparent:true,scene:Neighborhood,render:{antialias:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},audio:{noAudio:true},banner:false});
  return {game,setView(next:View){view=next;update?.(next);}};
}
