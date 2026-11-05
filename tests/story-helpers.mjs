import {Game,HOME,EXIT,THRESHOLD,dist} from '../src/engine.ts';
const toward=(a,p)=>{if(!p)return {x:0,z:0};const d=dist(a,p);return d>.17?{x:(p.x-a.x)/d,z:(p.z-a.z)/d}:{x:0,z:0};};
export function policy(g,path='together',reaction=0){
 if(path==='idle')return {x:0,z:0};
 if(path==='explore')return {x:Math.sin(g.time*.55),z:Math.cos(g.time*.43)};
 if(g.stage==='arrival')return toward(g.body,g.cue);
 if(g.stage==='echo')return toward(g.shadow,{x:Math.sin(g.echoClock*.24)*3,z:1+Math.cos(g.echoClock*.31)*1.8});
 if(g.stage==='follow'){
  const id=g.stageBeat();if(g.leaderStopping)return {x:0,z:0};
  if(id==='meet')return toward(g.shadow,EXIT);
  if(id==='parting'){
   if(path==='ahead')return toward(g.shadow,THRESHOLD);
   if(g.beatTime>reaction&&g.actionLabel())g.interact();
   return {x:0,z:0};
  }
  if(id==='partner'){
   if(g.memory.departure==='ahead'){
    if(g.beatTime>reaction+2&&g.actionLabel())g.interact();return {x:0,z:0};
   }
   return toward(g.shadow,g.body);
  }
  if(id==='duet'){
   if(path==='stay'&&g.beatTime>reaction&&g.actionLabel())g.interact();
   return toward(g.shadow,g.cue);
  }
  if(id==='rest')return {x:0,z:0};
  if(id==='bow'){
   if(path==='encore'&&g.beatTime>reaction&&g.actionLabel())g.interact();
   return toward(g.shadow,g.body);
  }
  if(id==='encore'){
   if(g.beatTravel>6&&g.actionLabel())g.interact();
   return {x:Math.cos(g.beatTime*.6),z:Math.sin(g.beatTime*.6)};
  }
 }
 if(g.stage==='rejoin'){
  if(path==='stay'){if(g.elapsed>reaction+2)g.interact();return toward(g.body,{x:2,z:1});}
  if(g.atDoor(g.body)&&g.elapsed>reaction+1)g.interact();
  return toward(g.body,EXIT);
 }
 return {x:0,z:0};
}
export function simulate(mode,path,reaction=0){
 const g=new Game(mode);let maxJump=0,last={...g.body};
 for(let i=0;i<360*60&&g.stage!=='ended';i++){
  const input=policy(g,path,reaction);g.setInput(input.x,input.z);g.step();maxJump=Math.max(maxJump,dist(last,g.body));last={...g.body};
 }
 const beats=g.events.filter(e=>e.type==='beat'||e.type==='stage'||e.type==='title-reveal').map((e,i,arr)=>({name:e.beat??e.stage??e.type,t:+e.t.toFixed(2)}));
 return {mode,path,reaction,duration:+g.time.toFixed(2),stage:g.stage,ending:g.ending,memory:g.memory,maxJump,beats,outcomes:g.events.filter(e=>['beat-outcome','beat-recovery','memory-reaction','threshold-crossed'].includes(e.type)),narrations:g.events.filter(e=>e.type==='narration').map(e=>({t:+e.t.toFixed(2),text:e.text,reason:e.reason})),game:g};
}
