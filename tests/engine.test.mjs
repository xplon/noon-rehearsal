import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,HOME,EXIT,PLANT,dist,routeAt,frameAt} from '../src/engine.ts';
import {MOTION} from '../src/motion.ts';
import {simulate,policy} from './story-helpers.mjs';

function run(game,seconds,input=()=>({x:0,z:0})){for(let i=0;i<seconds*60;i++){const p=input(game,i);game.setInput(p.x,p.z);game.step(1/60);}}
function until(game,stage,max=240,input=()=>({x:0,z:0})){for(let i=0;i<max*60&&game.stage!==stage;i++){const p=input(game,i);game.setInput(p.x,p.z);game.step(1/60);}assert.equal(game.stage,stage);}
test('arrival keeps body and projected actor synchronized, including orientation and pose',()=>{
 const g=new Game();run(g,12,(g,i)=>({x:Math.sin(i/60),z:Math.cos(i/60)}));
 assert.deepEqual(g.body,g.shadow);assert.equal(g.shadowSource,'attached');assert(!g.events.some(e=>e.type==='narration'&&String(e.text).includes('影子')));
});
test('both unattended versions finish honestly and within their time budget',()=>{
 for(const mode of ['student','teacher']){const g=new Game(mode);until(g,'ended');assert(g.systemDemo);assert(g.events.some(e=>e.type==='system-demo'));assert.equal(g.ending,'stillness');assert(g.time<(mode==='student'?180:230));assert(g.events.some(e=>e.type==='title-reveal'));}
});
test('pause freezes game time and trajectory and clears held input',()=>{
 const g=new Game();run(g,1,()=>({x:1,z:0}));g.pause('window-blur');const t=g.time,n=g.frames.length,p={...g.body};run(g,20);assert.equal(g.time,t);assert.equal(g.frames.length,n);assert.deepEqual(g.body,p);assert.deepEqual(g.input,{x:0,z:0});g.resume();run(g,1);assert(g.time>t);
});
test('recorded route is used at original timestamps, with no jump at handoff',()=>{
 const g=new Game();run(g,27,(g,i)=>({x:i<180?1:i<360?-1:0,z:0}));assert(!g.systemDemo);
 until(g,'echo');const start={...g.body};assert(dist(start,HOME)<.03);for(let i=0;i<240&&!g.echoReady;i++)g.step();run(g,1,()=>({x:0,z:1}));
 const expected=routeAt(g.route,g.echoClock);assert(dist(g.body,expected)<1e-7);assert.equal(g.bodySource,'recorded-body');assert(dist(g.shadow,g.body)>.1);
 const pausedPart=routeAt(g.route,9);const pausedPart2=routeAt(g.route,10);assert(dist(pausedPart,pausedPart2)<1e-8);
});
test('teacher correction precedes the single final ending invitation and uses only this session route',()=>{
 const {game:g}=simulate('teacher','together');
 const reverse=g.events.find(e=>e.type==='reverse-start');assert(reverse);assert(g.reverseDone);
 const offer=g.events.find(e=>e.type==='beat'&&e.beat==='bow');assert(offer.t>reverse.t);
 assert(g.reversePath.every(p=>g.reverseRoute.some(r=>r.t===p.point.t)));
 const reunion=g.events.find(e=>e.type==='actors-met'&&e.t>reverse.t);assert(reunion);assert.equal(reunion.distance,0);
 assert(g.events.some(e=>e.type==='narration'&&e.reason==='reverse-finished'));
});
test('movement and following stay outside the planter',()=>{
 const g=new Game();g.body.x=PLANT.x+2;g.body.z=PLANT.z;run(g,2,()=>({x:-1,z:0}));assert(dist(g.body,PLANT)>=PLANT.radius+.29);
 g.body.x=-7;g.body.z=PLANT.z;for(let i=0;i<600;i++)g.follow(g.body,{x:-3,z:PLANT.z},1/60);assert(dist(g.body,{x:-3,z:PLANT.z})<.1);assert(dist(g.body,PLANT)>PLANT.radius);
});
test('continuous contrary input still reaches a distinct lingering ending',()=>{
 const g=new Game();until(g,'ended',200,(g,i)=>({x:Math.sin(i/70),z:Math.cos(i/70)}));assert.equal(g.ending,'lingering');assert(!g.systemDemo);assert(g.frames.every(f=>Number.isFinite(f.body.x)&&Number.isFinite(f.shadow.z)));
});
test('host skip preserves provenance and never teleports return motion',()=>{
 const g=new Game();run(g,2,()=>({x:1,z:0}));g.skip();const p={...g.body};g.skip();g.step();assert(dist(p,g.body)<.1);assert(g.events.filter(e=>e.type==='host-skip').length===2);
});
test('replay reads historical snapshots without modifying the live record',()=>{
 const g=new Game();run(g,4,()=>({x:1,z:0}));const saved=JSON.stringify(g.frames);const f=frameAt(g.frames,2.01);assert(Math.abs(f.t-2.01)<1e-9);assert.equal(JSON.stringify(g.frames),saved);assert(f.body.x<g.body.x);
});

test('press, reverse, release and facing obey continuous motion limits',()=>{
 const g=new Game();let previous={...g.body},maxA=0,maxTurn=0,maxTurnA=0;
 for(let i=0;i<240;i++){
  g.setInput(i<60?1:i<120?-1:0,0);g.step();
  maxA=Math.max(maxA,Math.hypot(g.body.vx-previous.vx,g.body.vz-previous.vz)*60);
  maxTurn=Math.max(maxTurn,Math.abs(g.body.yaw-previous.yaw)*60);
  maxTurnA=Math.max(maxTurnA,Math.abs(g.body.yawVelocity-previous.yawVelocity)*60);
  if(i===0)assert(g.body.vx<.03);previous={...g.body};
 }
 assert(maxA<=MOTION.acceleration+.001);assert(maxTurn<=4.801);assert(maxTurnA<=16.001);assert(Math.hypot(g.body.vx,g.body.vz)<.01);
});
test('ring gently settles the actor but intentional movement can leave',()=>{
 const g=new Game();g.goal=true;g.body.x=HOME.x+.45;g.body.z=HOME.z+.2;g.move(g.body,{x:0,z:0},1/60,MOTION.speed,HOME);
 const start=dist(g.body,HOME);for(let i=0;i<180;i++)g.move(g.body,{x:0,z:0},1/60,MOTION.speed,HOME);
 assert(dist(g.body,HOME)<.01);assert(start>.4);
 for(let i=0;i<150;i++)g.move(g.body,{x:1,z:0},1/60,MOTION.speed,HOME);
 assert(dist(g.body,HOME)>1.5);
});
test('a completed opening leaves after the instruction has been readable, with no runtime minimum',()=>{
 const g=new Game();g.goal=true;g.distance=3;g.arrivalBeat='home';g.cue={...HOME};
 run(g,6);assert.notEqual(g.stage,'arrival');assert(g.events.find(e=>e.type==='transition').t<6);
});
test('curtain unites both roots before using precisely the same bow pose',()=>{
 const g=new Game();g.body.x=1;g.shadow.x=-2;g.finish('host-ended');
 until(g,'ended',30);assert(g.curtainActing);assert.deepEqual(g.body,g.shadow);assert.equal(g.body.animation,'bow');assert(g.body.clocks.bow>2.4);
});
test('first echo discovery stays quiet, then the independent shadow can react',()=>{
 const g=new Game();run(g,14,(g,i)=>({x:Math.sin(i/80),z:Math.cos(i/80)}));g.skip();until(g,'echo',20);for(let i=0;i<240&&!g.echoReady;i++)g.step();run(g,5.9);
 assert(!g.events.some(e=>e.type==='reaction'&&e.t>g.time-5.9));assert(!g.line);
 run(g,4);assert(g.events.some(e=>e.type==='reaction'&&e.actor==='shadow'&&e.t>=g.time-4));
});
test('interrupted animation transitions retain all previous pose weights',()=>{
 const g=new Game();for(const label of ['walk','sit','rise','walk','bow','struggle','idle']){
  const before={...g.body.weights};g.animate(g.body,label,1/60,1.5);
  assert(Math.abs(Object.values(g.body.weights).reduce((a,b)=>a+b,0)-1)<1e-8);
  for(const name of Object.keys(before))assert(Math.abs(g.body.weights[name]-before[name])<.13);
 }
});


test('return keeps the final heading and echo turns through the nearest side without a snap',()=>{
 const g=new Game();g.distance=3;g.body.yaw=Math.PI-.06;g.shadow.yaw=g.body.yaw;g.transition('return');
 const heading=g.body.yaw;until(g,'echo',2);assert(Math.abs(g.body.yaw-heading)<1e-10);
 // The recorded route now crosses the -pi/pi boundary; its root position is still read at original times.
 g.route=[g.routePoint({...g.body,yaw:-Math.PI+.12,vx:-.08,vz:-.8},0),g.routePoint({...g.body,x:HOME.x-.08,z:HOME.z-.8,yaw:-Math.PI+.12,vx:-.08,vz:-.8},1)];g.echoWindow=1;
 let prev=g.body.yaw;
 for(let i=0;i<20;i++){g.step();assert(Math.abs(g.body.yaw-prev)<=MOTION.turnSpeed/60+.0001);prev=g.body.yaw;}
 assert(g.body.yaw>heading);assert(g.body.yaw-heading<.25);
});
test('independent shadow notices, takes a bounded tentative step, then stops; input interrupts it',()=>{
 const g=new Game();g.body.x=1;g.body.vx=1;g.shadowNoticeAt=-100;
 const start={...g.shadow};g.reactShadow(1/60,false);assert.equal(g.shadowActing,'surprise');assert(g.events.some(e=>e.actor==='shadow'&&e.type==='reaction'));
 for(let i=0;i<180;i++){g.time+=1/60;g.shadowActing=null;g.reactShadow(1/60,false);g.animate(g.shadow,g.shadowActing??'walk',1/60);}
 assert(g.events.some(e=>e.type==='shadow-attempt'));assert(dist(start,g.shadow)>.1);assert(dist(start,g.shadow)<.55);assert(Math.hypot(g.shadow.vx,g.shadow.vz)<.02);
 g.shadowNoticeAt=g.time;g.setInput(-1,0);g.reactShadow(1/60,true);assert.equal(g.shadowSource,'input');
});
test('follower looks first, waits, then accelerates; a sharp leader turn causes another glance',()=>{
 const g=new Game();g.transition('follow');g.shadow.x=g.body.x+1;g.shadow.vx=1;
 let maxEarlySpeed=0;
 for(let i=0;i<36;i++){g.time+=1/60;g.followWithReaction(1/60);g.lookAt(g.body,g.bodyLook,1/60);maxEarlySpeed=Math.max(maxEarlySpeed,Math.hypot(g.body.vx,g.body.vz));}
 assert(maxEarlySpeed<.001);assert(g.body.lookWeight>.9);assert(g.body.lookYaw>.2);
 for(let i=0;i<120;i++){g.time+=1/60;g.followWithReaction(1/60);}
 assert(g.body.x>HOME.x+.1);assert(g.events.some(e=>e.reason==='first-departure'));
 g.time+=3;g.shadow.x=g.body.x+1;g.shadow.z=g.body.z+1;g.shadow.vx=-1;g.shadow.vz=0;g.followWithReaction(1/60);
 assert(g.events.some(e=>e.reason==='direction-change'));
});
test('the ending invitation remains an offer, rather than an already completed bow',()=>{
 const g=new Game('teacher');g.transition('follow');g.enterFollowBeat('bow');g.shadow.x+=3;run(g,2);
 assert.equal(g.actionLabel(),'还没演完');assert.equal(g.body.animation,'reach');assert(!g.events.some(e=>e.type==='bow'));
 g.interact();until(g,'rejoin',60);assert(g.memory.askedForMore);
});
test('both full versions finish under sustained contrary input with every pose weight finite',()=>{
 for(const mode of ['student','teacher']){const g=new Game(mode);until(g,'ended',270,(g,i)=>({x:Math.sin(i/80),z:Math.cos(i/90)}));assert(g.frames.every(f=>[f.body,f.shadow].every(a=>Number.isFinite(a.lookYaw)&&Math.abs(Object.values(a.weights).reduce((s,v)=>s+v,0)-1)<1e-7)));assert(dist(g.body,g.shadow)<.03);assert(['lingering','exit'].includes(g.ending));if(g.ending==='lingering'){assert.equal(g.body.animation,'shrug');assert.equal(g.shadow.animation,'sit');}else{assert(g.body.z< -5.4);assert(g.shadow.z< -5.4);}}
});

// Behavioral contracts: turning needs to be perceived before a new step.
test('opposite input leads with the head, plants the feet, then walks forward in the new direction',()=>{
 const g=new Game();g.body.yaw=0;g.body.gazeYaw=0;let firstLook=null,firstTurn=null,firstBackStep=null;
 for(let i=0;i<180;i++){
  g.setInput(0,-1);g.step();const a=g.body;
  if(firstLook===null&&Math.abs(a.lookYaw*a.lookWeight)>.05)firstLook=g.time;
  if(firstTurn===null&&Math.abs(a.yaw)>.05)firstTurn=g.time;
  if(firstBackStep===null&&a.vz<-.05){firstBackStep=g.time;assert(Math.abs(Math.atan2(Math.sin(Math.PI-a.yaw),Math.cos(Math.PI-a.yaw)))<.25);}
  if(a.pivoting)assert(Math.hypot(a.vx,a.vz)<.001);
 }
 assert(firstLook!==null&&firstTurn!==null&&firstBackStep!==null);
 assert(firstLook<firstTurn);assert(firstTurn<firstBackStep);
});
test('a first departure is looked down at before surprise and before pursuit',()=>{
 const g=new Game();g.transition('follow');g.shadow.x=g.body.x+1;g.shadow.vx=1;
 let surprised=false;
 for(let i=0;i<60;i++){
  g.time+=1/60;g.bodyActing=null;g.followWithReaction(1/60);g.lookAt(g.body,g.bodyLook,1/60);
  assert(Math.hypot(g.body.vx,g.body.vz)<.001);
  if(i<18)assert.notEqual(g.bodyActing,'surprise');
  if(g.bodyActing==='surprise'){surprised=true;assert(g.body.lookPitch>.25);assert(g.body.lookWeight>.85);}
 }
 assert(surprised);
});
test('host skip freezes only the last eight seconds of leading plus the real settling tail',()=>{
 const g=new Game('teacher');g.transition('follow');run(g,24,(g,i)=>({x:Math.sin(i/90),z:Math.cos(i/90)}));
 g.skip();const stop=g.time;until(g,'reverse',30);assert.equal(g.reverseSourceEnd,stop);
 assert(g.reverseRoute.every(p=>p.t>=stop-8-1e-8));assert(g.reverseRoute.at(-1).t>stop);
});
function cooperate(g){
 const a=g.target==='shadow'?g.shadow:g.body;
 const cue=g.stage==='echo'?{x:Math.sin(g.time*.25)*4,z:Math.cos(g.time*.2)*2}:g.cue;
 if(!cue||!['arrival','echo','follow','rejoin'].includes(g.stage))return {x:0,z:0};
 const d=dist(a,cue);return d>.2?{x:(cue.x-a.x)/d,z:(cue.z-a.z)/d}:{x:0,z:0};
}
test('both modes remember calling the partner and actually pass through the held door',()=>{
 for(const mode of ['student','teacher']){
  const {game:g}=simulate(mode,'together');assert.equal(g.stage,'ended');assert.equal(g.ending,'exit');assert(!g.systemDemo);
  assert.equal(g.memory.departure,'together');assert.equal(g.memory.door,'passed-together');
  for(const type of ['body-led','door-held'])assert(g.events.some(e=>e.type===type));
  assert(g.body.z< -5.4&&g.shadow.z< -5.4);assert.equal(g.events.filter(e=>e.type==='host-skip').length,0);
  assert.equal(g.events.some(e=>e.type==='reverse-start'),mode==='teacher');
 }
});

test('rapid completion preserves the opening line instead of replacing it within one frame',()=>{
 const g=new Game();g.arrivalBeat='home';g.cue={...HOME};g.distance=4;g.goal=true;run(g,.5);
 assert.equal(g.stage,'arrival');assert(g.line.includes('请先到门口'));run(g,4);assert.notEqual(g.stage,'arrival');
});

test('two arrivals close the door, and the question follows a readable explanation',()=>{
 const g=new Game();g.body={...g.body,...EXIT};g.shadow={...g.shadow,...EXIT};g.transition('follow');
 run(g,1);assert(g.events.some(e=>e.outcome==='door-count'));assert.equal(g.doorSlots,2);
 run(g,10);assert.equal(g.stageBeat(),'parting');assert.equal(g.memory.door,'counted-two');
 const end=g.events.find(e=>e.type==='narration-end'&&e.lineId===g.events.findIndex(e=>e.reason==='outcome-door-count'));
 assert(end.duration>=3);
});

test('going ahead crosses a real threshold and changes the later door and ending reactions',()=>{
 const {game:g}=simulate('student','ahead');assert.equal(g.memory.departure,'ahead');assert.equal(g.memory.reunion,'called');
 const crossed=g.events.find(e=>e.type==='threshold-crossed');assert(crossed.position.z< -4.3);
 assert(g.events.some(e=>e.type==='memory-reaction'&&e.reaction==='checks-before-holding-door'));
 assert(g.events.some(e=>e.type==='memory-reaction'&&e.reaction==='waits-at-last-threshold'));
});

test('a call before sitting is described as an interrupted intention, not a completed sit',()=>{
 const g=new Game('teacher');g.transition('follow');g.enterFollowBeat('rest');g.body.vx=1;g.interact();run(g,.1);
 assert.equal(g.memory.rest,'called');assert(!g.events.some(e=>e.type==='body-rest'));run(g,12);
 assert(g.events.some(e=>e.type==='narration'&&String(e.text).includes('刚要坐下')));
 assert(!g.events.some(e=>e.type==='narration'&&String(e.text).includes('身体先坐下了')));
});

test('a stationary correction has zero path playback and only readable explanation and reunion',()=>{
 const g=new Game('teacher');g.transition('reverse');g.reverseRoute=[g.routePoint(g.shadow,0),g.routePoint(g.shadow,1)];
 for(let i=0;i<720&&!g.reverseDone;i++)g.step();assert(g.reverseDone);assert.equal(g.reverseDuration,0);assert(g.time<12);
 assert.equal(g.stageBeat(),'bow');assert(g.events.some(e=>e.reason==='reverse-still'));
});

test('the restored player can explicitly stay or exit without a timed gate',()=>{
 for(const leave of [false,true]){const g=new Game();g.transition('rejoin');if(leave){Object.assign(g.body,EXIT);Object.assign(g.shadow,EXIT);}g.interact();g.step();assert.equal(g.stage,'curtain');assert.equal(g.ending,leave?'exit':'stillness');}
});

test('handoff into the old route turns once per tick and stays planted until aligned',()=>{
 const g=new Game();g.body.yaw=Math.PI;g.body.gazeYaw=Math.PI;g.echoWindow=10;g.transition('echo');let prior={...g.body};
 for(let i=0;i<240&&!g.echoReady;i++){
  g.step();assert(dist(g.body,HOME)<.001);
  assert(Math.abs(g.body.yaw-prior.yaw)*60<=MOTION.turnSpeed+.001);
  assert(Math.abs(g.body.yawVelocity-prior.yawVelocity)*60<=MOTION.turnAcceleration+.001);
  prior={...g.body};
 }
 assert(g.echoReady);assert(Math.abs(g.body.yaw-g.route[0].yaw)<.07);
});

test('both versions grant an actual encore only when the player asks, after the final invitation',()=>{
 for(const mode of ['student','teacher']){
  const {game:g}=simulate(mode,'encore');assert(g.memory.askedForMore);assert(g.events.some(e=>e.type==='beat'&&e.beat==='encore'));
  const normal=simulate(mode,'together').game;assert(!normal.events.some(e=>e.type==='beat'&&e.beat==='encore'));
 }
});

test('a call across the doorway is not mislabeled as hiding and cannot be repeatedly selected',()=>{
 const g=new Game();g.memory.departure='ahead';g.transition('follow');g.enterFollowBeat('partner');g.shadow.x+=3;g.interact();g.step();
 assert.equal(g.beatPhase,'reuniting');assert.equal(g.actionLabel(),'');assert.equal(g.memory.reunion,'called');
 run(g,10);assert(!g.events.some(e=>e.type==='narration'&&String(e.text).includes('躲猫猫')));
});
