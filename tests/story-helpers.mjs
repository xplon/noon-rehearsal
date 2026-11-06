import {Game,dist} from '../src/engine.ts';
import {waypoint} from '../src/space.ts';
export const toward=(a,p)=>{if(!p)return {x:0,z:0};const aim=waypoint(a,p),d=dist(a,aim);return d>.12?{x:(aim.x-a.x)/d,z:(aim.z-a.z)/d}:{x:0,z:0};};
export function policy(g,path='body-first',reaction=0){
 if(path==='idle')return {x:0,z:0};
 if(path==='explore')return {x:Math.sin(g.time*.55),z:Math.cos(g.time*.43)};
 if(g.stage==='arrival')return toward(g.body,g.cue);
 if(g.stage==='echo')return {x:Math.sin(g.echoClock*.6),z:Math.cos(g.echoClock*.5)};
 if(g.stage==='follow'){
  if(g.beatPhase==='rehearsal-offer'){if(g.time-g.phaseAt>reaction)g.choose(path==='skip'?'skip-rehearsal':'rehearse');return {x:0,z:0};}
  return toward(g.shadow,g.cue);
 }
 if(g.stage==='reverse'&&path==='interrupt'&&g.reverseClock>2)g.choose('stop-rehearsal');
 if(g.stage==='relay'){
  if(g.beatPhase==='choice'&&g.elapsed>reaction)g.choose(path==='stay'?'stay':path==='shadow-first'?'shadow-first':'body-first');
  return toward(g.body,g.cue);
 }
 return {x:0,z:0};
}
export function simulate(mode,path='body-first',reaction=0){
 const g=new Game(mode);let maxJump=0,last={...g.body};
 for(let i=0;i<360*60&&g.stage!=='ended';i++){
  const input=policy(g,path,reaction);g.setInput(input.x,input.z);g.step();maxJump=Math.max(maxJump,dist(last,g.body));last={...g.body};
 }
 const beats=g.events.filter(e=>e.type==='stage'||e.type==='relay-choice'||e.type==='relay-handoff'||e.type==='title-reveal').map(e=>({name:e.stage??e.type,t:+e.t.toFixed(2)}));
 return {mode,path,duration:+g.time.toFixed(2),stage:g.stage,ending:g.ending,memory:g.memory,maxJump,beats,game:g};
}
