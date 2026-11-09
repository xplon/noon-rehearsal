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

test('pause freezes game time and trajectory and clears held input',()=>{
 const g=new Game();run(g,1,()=>({x:1,z:0}));g.pause('window-blur');const t=g.time,n=g.frames.length,p={...g.body};run(g,20);assert.equal(g.time,t);assert.equal(g.frames.length,n);assert.deepEqual(g.body,p);assert.deepEqual(g.input,{x:0,z:0});g.resume();run(g,1);assert(g.time>t);
});

test('movement and following stay outside the planter',()=>{
 const g=new Game();g.body.x=PLANT.x+2;g.body.z=PLANT.z;run(g,2,()=>({x:-1,z:0}));assert(dist(g.body,PLANT)>=PLANT.radius+.29);
 g.body.x=-6.85;g.body.z=1.6;for(let i=0;i<600;i++)g.follow(g.body,{x:-3,z:PLANT.z},1/60);assert(dist(g.body,{x:-3,z:PLANT.z})<.1);assert(dist(g.body,PLANT)>PLANT.radius);
});

test('host ending preserves provenance and never teleports; repeated ending is inert',()=>{
 const g=new Game();run(g,2,()=>({x:1,z:0}));const p={...g.body};g.skip();g.skip();g.step();assert(dist(p,g.body)<.1);assert.equal(g.events.filter(e=>e.type==='host-skip').length,1);assert.equal(g.memory.endingSource,'host');assert.equal(g.memory.door,'unfinished');
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

test('opening transition follows a real plate release and failed crossing, never elapsed time',()=>{
 const g=new Game();run(g,40);assert.equal(g.stage,'arrival');assert(!g.events.some(e=>e.type==='gate-failure'));
 until(g,'separation',40,g=>policy(g));
 const press=g.events.find(e=>e.type==='first-plate'),release=g.events.find(e=>e.type==='first-release'),fail=g.events.find(e=>e.type==='gate-failure');
 assert(press&&release&&fail);assert(press.t<release.t&&release.t<fail.t);assert(g.time-fail.t<2);assert(!g.events.some(e=>e.type==='instruction-response'&&e.response==='declined'));
});

test('interrupted animation transitions retain all previous pose weights',()=>{
 const g=new Game();for(const label of ['walk','sit','rise','walk','bow','struggle','idle']){
  const before={...g.body.weights};g.animate(g.body,label,1/60,1.5);
  assert(Math.abs(Object.values(g.body.weights).reduce((a,b)=>a+b,0)-1)<1e-8);
  for(const name of Object.keys(before))assert(Math.abs(g.body.weights[name]-before[name])<.13);
 }
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

test('opening instruction survives the first frame and no-input remains an open attempt',()=>{
 const g=new Game();const line=g.line;run(g,.5);assert.equal(g.stage,'arrival');assert.equal(g.line,line);assert(line.includes('庭院'));
 run(g,15);assert.equal(g.stage,'arrival');assert.equal(g.memory.door,'untried');
});

test('quote preparation pivots with planted feet before historical motion begins',()=>{
 const g=new Game('teacher');until(g,'return',80,g=>policy(g,'shadow-first'));
 for(let i=0;i<1800&&g.quoteStatus==='returning';i++){g.setInput(0,0);g.step();}
 assert.equal(g.quoteStatus,'aligning');const p={...g.body};let prior={...g.body};
 for(let i=0;i<360&&g.quoteStatus==='aligning';i++){
  g.step();assert(dist(g.body,p)<.02);if(Math.abs(g.body.yaw-prior.yaw)>.00001)assert(Math.hypot(g.body.vx,g.body.vz)<.005);
  assert(Math.abs(g.body.yaw-prior.yaw)*60<=MOTION.turnSpeed+.001);
  assert(Math.abs(g.body.yawVelocity-prior.yawVelocity)*60<=MOTION.turnAcceleration+.001);
  prior={...g.body};
 }
 assert.equal(g.quoteStatus,'playing');assert(Math.abs(Math.atan2(Math.sin(g.body.yaw-g.route[0].yaw),Math.cos(g.body.yaw-g.route[0].yaw)))<.07);
});
