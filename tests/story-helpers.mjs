import {Game,dist} from '../src/engine.ts';
import {waypoint,INNER_PAD,OUTER_PAD,FRONT_MARK,DEPARTURE_MARK} from '../src/space.ts';
export const toward=(a,p,open=1)=>{if(!p)return {x:0,z:0};const aim=waypoint(a,p,open),d=dist(a,aim);return d>.10?{x:(aim.x-a.x)/d,z:(aim.z-a.z)/d}:{x:0,z:0};};
export function policy(g,path='body-first'){
 if(path==='idle')return {x:0,z:0};
 if(g.awaitFreshInput)return {x:0,z:0};
 if(path==='explore')return {x:Math.sin(g.time*.55),z:Math.cos(g.time*.43)};
 const aim=(a,p)=>toward(a,p,g.doorOpen);
 if(g.stage==='arrival')return aim(g.body,g.firstPadAt<0||g.firstLeaveAt<0&&g.doorOpen<.95?INNER_PAD:FRONT_MARK);
 if(g.stage==='shadow'||g.stage==='follow')return aim(g.shadow,INNER_PAD);
 if(g.stage==='encounter'){
  if(g.beatPhase==='outside-invitation')return aim(g.body,g.outsidePhase==='walking'||g.responseDone||path==='alongside'||path==='shadow-first'?DEPARTURE_MARK:g.shadow);
  if(g.beatPhase==='wear-invitation'||g.beatPhase==='body-approaches')return aim(g.shadow,path==='shadow-first'||path==='alongside'?{x:-4.5,z:2.8}:g.body);
  return {x:0,z:0};
 }
 if(g.stage==='return'||g.stage==='echo')return aim(g.shadow,path==='shadow-first'||path==='alongside'?OUTER_PAD:INNER_PAD);
 if(g.stage==='relay'){
  if(g.target==='shadow')return aim(g.shadow,g.relayFirst==='body'&&!g.partnerReleased?INNER_PAD:OUTER_PAD);
  if(g.partnerReleased&&g.mode==='student')return path==='continuous'&&g.shadow.x>2.3?aim(g.body,DEPARTURE_MARK):{x:0,z:0};
  return aim(g.body,OUTER_PAD);
 }
 return {x:0,z:0};
}
export function simulate(mode,path='body-first',maxSeconds=240){
 const g=new Game(mode);let maxJump=0,lastB={...g.body},lastS={...g.shadow};
 for(let i=0;i<maxSeconds*60&&g.stage!=='ended';i++){
  const input=policy(g,path);g.setInput(input.x,input.z);g.step();maxJump=Math.max(maxJump,dist(lastB,g.body),dist(lastS,g.shadow));lastB={...g.body};lastS={...g.shadow};
 }
 const beats=g.events.filter(e=>['stage','relay-order','relay-handoff','title-reveal','quote-skipped','encounter-result','reunion-choice'].includes(e.type)).map(e=>({name:e.stage??e.type,t:+e.t.toFixed(2),outcome:e.outcome,reason:e.reason}));
 return {mode,path,duration:+g.time.toFixed(2),stage:g.stage,beat:g.beatPhase,ending:g.ending,memory:g.memory,maxJump,beats,game:g};
}
