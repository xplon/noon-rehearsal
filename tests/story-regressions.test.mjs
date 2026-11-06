import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,actor,dist,selectRecordedWindow,routeAt} from '../src/engine.ts';
import {INNER_PAD,OUTER_PAD,OUTSIDE_MARK,FRONT_MARK,GATE,isOutside,isWalkable,waypoint} from '../src/space.ts';
import {simulate,policy,toward} from './story-helpers.mjs';
import {makeClips,replayFrame} from '../src/replay.ts';
const run=(g,seconds,input=()=>({x:0,z:0}))=>{for(let i=0;i<seconds*60&&g.stage!=='ended';i++){const p=input(g,i);g.setInput(p.x,p.z);g.step();}};
function relay(mode='student'){const g=new Game(mode);Object.assign(g.body,actor(FRONT_MARK));Object.assign(g.shadow,actor(FRONT_MARK));g.transition('relay');return g;}

test('two versions and both orders produce a single actual exit with a visible handoff',()=>{
 for(const mode of ['student','teacher'])for(const order of ['body-first','shadow-first']){
  const {game:g,maxJump}=simulate(mode,order);assert.equal(g.stage,'ended');assert.equal(g.ending,'exit');assert.equal(g.memory.order,order);
  assert.equal(g.memory.orderSource,'player');assert.equal(g.memory.door,'passed-together');assert(isOutside(g.body)&&isOutside(g.shadow));
  assert.equal(g.events.filter(e=>e.type==='ending').length,1);assert.equal(g.events.filter(e=>e.type==='both-crossed').length,1);assert(maxJump<.055);
  const choice=g.events.find(e=>e.type==='relay-choice'),handoff=g.events.find(e=>e.type==='relay-handoff'),cross=g.events.find(e=>e.type==='both-crossed');
  assert(choice.t<handoff.t&&handoff.t<cross.t);assert.equal(handoff.holder,order==='body-first'?'body':'shadow');
  assert(cross.body.z+.24<GATE.z&&cross.shadow.z+.24<GATE.z);
 }
});
test('silence and exploration never become a voluntary refusal or accepted rehearsal',()=>{
 for(const mode of ['student','teacher'])for(const path of ['idle','explore']){
  const {game:g}=simulate(mode,path);assert.equal(g.stage,'ended');assert.notEqual(g.memory.door,'declined');assert.notEqual(g.ending,'stillness');
  assert.equal(g.memory.endingSource,'system-budget');assert.notEqual(g.memory.orderSource,'player');
  assert(!g.events.some(e=>e.type==='rehearsal-choice'&&e.choice==='accept'));assert(g.time<330);
 }
});
test('a declared stay is immediate and cannot later turn into a crossing',()=>{
 const g=relay();g.choose('stay');assert.equal(g.stage,'curtain');run(g,20);assert.equal(g.ending,'stillness');
 assert.equal(g.memory.door,'declined');assert.equal(g.memory.endingSource,'player');assert(!g.events.some(e=>e.type==='both-crossed'));
});
test('reading near the door does not silently commit a leave or stay choice',()=>{
 const g=relay();run(g,20);assert.equal(g.stage,'relay');assert.equal(g.beatPhase,'choice');assert.equal(g.memory.order,'unanswered');assert.equal(g.memory.door,'untried');
 g.pause();const frozen=JSON.stringify(g.snapshot());run(g,120);assert.equal(JSON.stringify(g.snapshot()),frozen);g.resume();g.choose('shadow-first');assert.equal(g.memory.order,'shadow-first');
});
test('stale or paused action identifiers cannot change the branch',()=>{
 const g=relay();g.choose('shadow-first');g.choose('body-first');assert.equal(g.memory.order,'shadow-first');
 g.pause();g.choose('stay');assert.equal(g.stage,'relay');assert.equal(g.memory.door,'in-progress');
});
test('returning to a holding plate restores the same rule instead of a scripted exception',()=>{
 const g=relay();Object.assign(g.body,actor(INNER_PAD));Object.assign(g.shadow,actor({x:5.3,z:-2}));g.choose('shadow-first');
 run(g,2);assert(g.innerHeld);assert(g.doorOpen>.9);
 run(g,1.7,()=>({x:0,z:1}));assert(!g.innerHeld);assert.equal(g.memory.door,'in-progress');
 run(g,8,()=>toward(g.body,INNER_PAD));assert(g.innerHeld);run(g,2);assert(g.doorOpen>.9);assert(!g.events.some(e=>e.reason==='both-crossed'));
});
test('restoring body input does not erase the independent shadow before cooperation',()=>{
 const g=new Game();g.transition('rejoin');run(g,7);assert.equal(g.stage,'relay');assert.equal(g.target,'body');assert.equal(g.shadowAttachment,0);assert.notEqual(g.shadowSource,'attached');
 run(g,2,()=>({x:1,z:0}));assert(dist(g.body,g.shadow)>.3);
});
test('teacher can accept, decline or interrupt path retracing before the only ending',()=>{
 for(const path of ['body-first','skip','interrupt']){
  const {game:g}=simulate('teacher',path);assert.equal(g.ending,'exit');
  if(path==='skip'){assert.equal(g.memory.rehearsal,'declined');assert(!g.events.some(e=>e.type==='reverse-start'));}
  else{assert(g.events.some(e=>e.type==='reverse-start'));assert.equal(g.memory.rehearsal,path==='interrupt'?'interrupted':'accepted');}
  const last=g.events.find(e=>e.type==='ending');assert(g.events.filter(e=>e.type==='reverse-start').every(e=>e.t<last.t));
 }
});
test('student never offers the optional teacher retracing or multiple ending invitations',()=>{
 const {game:g}=simulate('student','body-first');assert(!g.events.some(e=>e.type==='stage'&&e.stage==='reverse'));
 assert(!g.events.some(e=>e.type==='rehearsal-choice'));assert.equal(g.events.filter(e=>e.type==='title-reveal').length,1);
});
test('late movement is selected from its actual source interval, preserving internal pauses',()=>{
 const source=[];for(let i=0;i<=1800;i++){const t=i/60;const x=t<21?0:t<24?t-21:t<26?3:3+(t-26)*.4;source.push({...actor({x,z:0}),t});}
 const chosen=selectRecordedWindow(source,16);assert(chosen.start>18);assert(chosen.distance>3);assert(chosen.end-chosen.start<=16);
 for(const p of chosen.route)assert(Math.abs(p.x-routeAt(source,p.t+chosen.start).x)<1e-8);
 assert(dist(routeAt(chosen.route,24.5-chosen.start),routeAt(chosen.route,25.5-chosen.start))<1e-8);
 const g=new Game();g.route=source;g.distance=5;g.transition('return');assert(!g.systemDemo);assert(g.routeStart>18);assert(g.events.find(e=>e.type==='system-return').to.x===g.route[0].x);
});
test('zero-motion retracing is identified and no reverse route is fabricated',()=>{
 const g=new Game('teacher');g.reverseRoute=[g.routePoint(g.shadow,0),g.routePoint(g.shadow,1)];g.transition('reverse');run(g,18);
 assert(g.reverseDone);assert.equal(g.reverseDuration,0);assert(g.events.some(e=>e.reason==='reverse-still'));assert.equal(g.memory.rehearsal,'unavailable');
});
test('replay shows the actual choice before its handoff and every quote uses displayed frames',()=>{
 for(const mode of ['student','teacher'])for(const path of ['body-first','shadow-first','stay','idle']){
  const {game:g}=simulate(mode,path);const clips=makeClips(g.frames,g.events);
  for(const clip of clips.filter(c=>c.quote))assert.equal(replayFrame(g.frames,clip.start).line,clip.quote);
  const relation=clips.find(c=>c.name==='选择与接应'),choice=g.events.find(e=>e.type==='relay-choice'),handoff=g.events.find(e=>e.type==='relay-handoff');
  if(choice&&handoff){assert(relation.start<=choice.t);assert(relation.end>=handoff.t);}
  if(path==='idle')assert(!relation.fact.includes('你选择'));
 }
});
test('exit is refused until both complete the actual spatial crossing',()=>{
 const g=relay();g.finish('exit');assert.equal(g.stage,'relay');
 Object.assign(g.body,actor(OUTSIDE_MARK));g.finish('exit');assert.equal(g.stage,'relay');
});
test('accepted actions supersede prompts without leaking outdated queued instructions',()=>{
 const g=relay();g.say('waiting sentence','queued',6);g.choose('stay');run(g,20);
 const choice=g.events.find(e=>e.type==='interaction');assert(!g.events.some(e=>e.type==='narration'&&e.reason==='queued'&&e.t>choice.t));
});
test('the independent shadow does not walk or slide during the final sit',()=>{
 const {game:g}=simulate('student','stay');for(const f of g.frames.filter(f=>f.stage==='curtain'&&f.body.weights.sit>.8)){
 assert(Math.hypot(f.body.vx,f.body.vz)<.08);assert(Math.hypot(f.shadow.vx,f.shadow.vz)<.08);
 }assert.equal(g.body.animation,'sit');assert.equal(g.shadow.animation,'sit');
});

test('continuing after the absolute relay budget restores ordinary choices for a new attempt',()=>{
 const g=relay();g.elapsed=151;g.time=151;g.step();assert(g.actions().some(a=>a.id==='continue'));
 g.choose('continue');run(g,2);assert(g.budgetNoticeAt<0);assert(g.actions().some(a=>a.id==='body-first'));assert.equal(g.stage,'relay');
});
test('walking toward an untouched closed door cannot open it without a plate',()=>{
 const g=relay();run(g,6,()=>toward(g.body,OUTSIDE_MARK));assert(!isOutside(g.body));assert(g.doorOpen<.01);
 assert(!g.events.some(e=>e.type==='door-pad'));assert.equal(g.memory.order,'unanswered');
});
test('a late explicit stay is included in the relationship replay with its consequence',()=>{
 const g=relay();run(g,20);g.choose('stay');run(g,20);
 const choice=g.events.find(e=>e.type==='interaction'&&e.action==='stay'),ready=g.events.find(e=>e.type==='curtain-ready');
 const c=makeClips(g.frames,g.events).find(c=>c.name==='选择与接应');assert(c.start<=choice.t&&c.end>=ready.t);assert(c.start>15);
});
test('a moving recorded interval enters without an instantaneous speed jump',()=>{
 const g=new Game();for(let i=0;i<32*60&&g.stage==='arrival';i++){g.setInput(Math.sin(g.time),Math.cos(g.time));g.step();}
 g.setInput(0,0);let max=0;for(let i=0;i<30*60&&g.stage!=='follow';i++){const old={...g.body};g.step();if(g.stage==='echo'&&g.echoClock<1.2)max=Math.max(max,Math.hypot(g.body.vx-old.vx,g.body.vz-old.vz)*60);}
 assert(max<8.5,`entry acceleration ${max}`);
});

test('cancelling a rehearsal before movement never records playback as started',()=>{
 const g=new Game('teacher');g.shadowRoute=[g.routePoint(actor({x:0,z:0}),0),g.routePoint(g.shadow,1)];g.time=1;g.beginReverse();g.choose('stop-rehearsal');run(g,12);
 assert(!g.events.some(e=>e.type==='reverse-start'));assert(g.events.some(e=>e.type==='reverse-cancelled'&&e.beforePlayback));assert.equal(g.memory.rehearsal,'interrupted');
});

test('a short late route comes to rest while the control explanation remains readable',()=>{
 const g=new Game();for(let i=0;i<32*60&&g.stage==='arrival';i++){g.setInput(g.time>=30?1:0,0);g.step();}g.setInput(0,0);
 let checked=0;for(let i=0;i<30*60&&g.stage!=='follow';i++){g.step();if(g.stage==='echo'&&g.echoClock>=g.echoWindow){assert(Math.hypot(g.body.vx,g.body.vz)<.01);assert(g.body.weights.walk+g.body.weights.chase<.01);checked++;}}
 assert(checked>30);assert(g.events.some(e=>e.type==='echo-playback-finished'));
});
test('current help identifies a demonstration rather than inventing the players route',()=>{
 const g=new Game();g.transition('return');g.transition('echo');assert(g.systemDemo);assert(g.guidance().help.includes('示范'));assert(!g.guidance().help.includes('真实动作'));
});

test('an explicit stay before the gate is replayed at its actual decision',()=>{
 const g=new Game('teacher');g.transition('follow');run(g,18);g.choose('stay');run(g,20);
 const choice=g.events.find(e=>e.type==='interaction'&&e.action==='stay'),ready=g.events.find(e=>e.type==='curtain-ready');const c=makeClips(g.frames,g.events).find(c=>c.name==='选择与接应');assert(c);assert(c.start<=choice.t&&c.start>15&&c.end>=ready.t);assert(c.fact.includes('明确选择留在庭院'));
});
