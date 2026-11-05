import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,dist,EXIT,DOOR_APPROACH} from '../src/engine.ts';
import {makeClips,replayFrame} from '../src/replay.ts';
import {policy,simulate} from './story-helpers.mjs';

const toward=(a,p)=>{const d=dist(a,p);return d>.17?{x:(p.x-a.x)/d,z:(p.z-a.z)/d}:{x:0,z:0};};
const inBeat=(g,id)=>g.stage==='follow'&&g.stageBeat()===id;
function play(mode,input){
 const g=new Game(mode);
 for(let i=0;i<360*60&&g.stage!=='ended';i++){const v=input(g);g.setInput(v.x,v.z);g.step();}
 assert.equal(g.stage,'ended');return g;
}

test('a cooperative body actually leads to a different position before declaring arrival',()=>{
 const {game:g}=simulate('student','together');
 const start=g.events.find(e=>e.type==='body-led'),end=g.events.find(e=>e.outcome==='followed-partner');
 assert(end.t-start.t>1);
 assert(dist(replayFrame(g.frames,start.t).body,replayFrame(g.frames,end.t).body)>1);
});
test('waiting at the usual lead destination selects another real nearby destination',()=>{
 const g=play('student',g=>{
  if(inBeat(g,'parting')){if(dist(g.shadow,DOOR_APPROACH)<.25)g.interact();return toward(g.shadow,DOOR_APPROACH);}
  return policy(g,'together');
 });
 const start=g.events.find(e=>e.type==='body-led'),end=g.events.find(e=>e.outcome==='followed-partner');
 assert(start&&end);assert(end.t-start.t>1);assert(dist(replayFrame(g.frames,start.t).body,replayFrame(g.frames,end.t).body)>.6);
});
test('retreating after the shadow crosses cannot fabricate a two-person crossing',()=>{
 const g=play('student',g=>inBeat(g,'duet')&&g.beatPhase==='joining'?toward(g.shadow,{x:EXIT.x,z:-2}):policy(g,'together'));
 assert(!g.events.some(e=>e.reason==='both-crossed'));
 assert(!g.events.some(e=>e.type==='narration'&&String(e.text).includes('两位都到了')));
});
test('moving during shared rest first stands up, without a sitting slide or false reunion',()=>{
 const g=play('teacher',g=>inBeat(g,'rest')&&g.beatPhase==='rest-together'?{x:-1,z:1}:policy(g,'together'));
 assert(g.events.some(e=>e.reason==='shared-rest-movement'));
 assert(!g.events.some(e=>e.reason==='outcome-rested-together'));
 for(const f of g.frames.filter(f=>f.beat==='rest'&&f.shadow.weights.sit>.8))assert(Math.hypot(f.shadow.vx,f.shadow.vz)<.08);
});
test('walking back to the partner remains an answer and keeps calling available',()=>{
 const g=play('student',g=>{
  if(!inBeat(g,'parting'))return policy(g,'together');
  if(g.beatPhase==='step-back')return {x:0,z:0};
  return toward(g.shadow,g.body);
 });
 assert.equal(g.memory.departure,'together');
 assert(g.events.some(e=>e.reason==='returned-to-partner'));
 assert(!g.events.some(e=>e.reason==='choice-unanswered'));
});
test('declining a freshly held door cancels its queued invitation',()=>{
 const g=play('student',g=>{
  if(inBeat(g,'duet')&&g.beatPhase==='holding')g.interact();
  return policy(g,'together');
 });
 const declined=g.events.find(e=>e.reason==='declined-door');assert(declined);
 assert(!g.events.some(e=>e.type==='narration'&&e.reason==='door-is-held'&&e.t>declined.t));
});
test('one real threshold crossing is recorded once, and leaving the corridor never teleports',()=>{
 const {game:g}=simulate('student','ahead');
 assert.equal(g.events.filter(e=>e.type==='threshold-crossed').length,1);
 const probe=new Game();probe.doorOpen=1;Object.assign(probe.shadow,{x:EXIT.x,z:-4.6});
 let last={...probe.shadow};
 for(let i=0;i<180;i++){probe.move(probe.shadow,{x:-1,z:0},1/60);assert(dist(last,probe.shadow)<.06);last={...probe.shadow};}
 assert(probe.shadow.z< -4.5);
});
test('shown narration remains readable and every review quote opens on its recorded sentence',()=>{
 for(const mode of ['student','teacher'])for(const path of ['together','ahead','idle','encore']){
  const {game:g}=simulate(mode,path);
  g.events.forEach((e,id)=>{
   if(e.type!=='narration')return;
   const end=g.events.find(x=>x.type==='narration-end'&&x.lineId===id);
   if(end&&!['ending-chosen','player-gesture'].includes(end.reason))assert(end.duration+.02>=e.minimum,`${mode}/${path}: ${e.reason}`);
  });
  for(const c of makeClips(g.frames,g.events).filter(c=>c.quote))assert.equal(replayFrame(g.frames,c.start).line,c.quote);
 }
});
test('the requested encore gives a reciprocal bow, and zero-route correction never claims a replay happened',()=>{
 for(const mode of ['student','teacher']){
  const {game:g}=simulate(mode,'encore');assert(g.events.some(e=>e.type==='encore-bow-offered'));assert(g.events.some(e=>e.type==='encore-bow-answered'));
  assert(g.frames.some(f=>f.beat==='encore'&&f.body.weights.bow>.8&&f.shadow.weights.bow>.8));
 }
 const {game:g}=simulate('teacher','idle');
 assert(g.events.some(e=>e.reason==='reverse-still'));
 assert(!g.events.some(e=>e.reason==='reverse-finished'&&String(e.text).includes('走完')));
});
test('a last-moment encore gesture brakes before bowing and completes before the deadline can recover',()=>{
 for(const delay of [0,29.8]){
  const g=play('student',g=>{
   if(inBeat(g,'encore')){if(g.beatTime>delay)g.interact();return {x:Math.cos(g.beatTime),z:Math.sin(g.beatTime)};}
   return policy(g,'encore');
  });
  assert(g.events.some(e=>e.outcome==='bow-answered'));
  assert(!g.events.some(e=>e.type==='beat-recovery'&&e.beat==='encore'));
  for(const f of g.frames.filter(f=>f.beat==='encore'&&f.shadow.weights.bow>.8))assert(Math.hypot(f.shadow.vx,f.shadow.vz)<.07);
 }
});
test('a resolved doorway outcome cannot later mutate into the opposite result',()=>{
 const {game:g}=simulate('teacher','explore');
 const result=g.events.find(e=>e.type==='beat-outcome'&&e.beat==='duet');assert(result);
 const following=g.events.find(e=>e.type==='beat'&&e.t>result.t);assert(following);
 const late=g.events.filter(e=>e.type==='relationship'&&e.t>result.t&&e.t<following.t);
 assert(!late.some(e=>e.reason==='both-crossed'));
});
test('a long opening replays at most sixteen seconds of its real route',()=>{
 const {game:g}=simulate('student','explore');
 assert(!g.systemDemo);assert(g.echoWindow<=16.01);assert(g.echoWindow>=6);
 const window=g.events.find(e=>e.type==='route-window');assert.equal(window.end,g.echoWindow);
});
