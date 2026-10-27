import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,HOME,EXIT,PLANT,dist,routeAt,frameAt} from '../src/engine.ts';

function run(game,seconds,input=()=>({x:0,z:0})){for(let i=0;i<seconds*60;i++){const p=input(game,i);game.setInput(p.x,p.z);game.step(1/60);}}
function until(game,stage,max=240,input=()=>({x:0,z:0})){for(let i=0;i<max*60&&game.stage!==stage;i++){const p=input(game,i);game.setInput(p.x,p.z);game.step(1/60);}assert.equal(game.stage,stage);}
test('arrival keeps body and projected actor synchronized, including orientation and pose',()=>{
 const g=new Game();run(g,12,(g,i)=>({x:Math.sin(i/60),z:Math.cos(i/60)}));
 assert.deepEqual(g.body,g.shadow);assert.equal(g.shadowSource,'attached');assert(!g.events.some(e=>e.type==='narration'&&String(e.text).includes('影子')));
});
test('both unattended versions finish honestly and within their time budget',()=>{
 for(const mode of ['student','teacher']){const g=new Game(mode);until(g,'ended');assert(g.systemDemo);assert(g.events.some(e=>e.type==='system-demo'));assert.equal(g.ending,'stillness');assert(g.time<190);assert(g.events.some(e=>e.type==='title-reveal'));}
});
test('pause freezes game time and trajectory and clears held input',()=>{
 const g=new Game();run(g,1,()=>({x:1,z:0}));g.pause('window-blur');const t=g.time,n=g.frames.length,p={...g.body};run(g,20);assert.equal(g.time,t);assert.equal(g.frames.length,n);assert.deepEqual(g.body,p);assert.deepEqual(g.input,{x:0,z:0});g.resume();run(g,1);assert(g.time>t);
});
test('recorded route is used at original timestamps, with no jump at handoff',()=>{
 const g=new Game();run(g,27,(g,i)=>({x:i<180?1:i<360?-1:0,z:0}));assert(!g.systemDemo);
 until(g,'echo');const start={...g.body};assert(dist(start,HOME)<.03);run(g,1,()=>({x:0,z:1}));
 const expected=routeAt(g.route,g.elapsed);assert(dist(g.body,expected)<1e-7);assert.equal(g.bodySource,'recorded-body');assert(dist(g.shadow,g.body)>.1);
 const pausedPart=routeAt(g.route,9);const pausedPart2=routeAt(g.route,10);assert(dist(pausedPart,pausedPart2)<1e-8);
});
test('teacher reverse follows its own route and waits for both actors to stop together',()=>{
 const g=new Game('teacher');until(g,'reverse',220,(g,i)=>({x:Math.sin(i/100),z:Math.cos(i/100)}));
 const start={...g.shadow};g.step(1/60);assert(dist(g.shadow,start)<.01);
 until(g,'rejoin',40);assert(g.reverseStarted);assert(g.events.some(e=>e.type==='reverse-start'));
 assert(dist(g.shadow,g.reversePath.at(-1).point)<.04);assert.equal(dist(g.body,g.shadow),0);assert.deepEqual(g.body,g.shadow);
 assert(Math.hypot(g.body.vx,g.body.vz)<.06);assert(Math.hypot(g.shadow.vx,g.shadow.vz)<.06);
 assert(g.reversePath.every(p=>g.reverseRoute.some(r=>r.t===p.point.t)));
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
 assert(maxA<=10.001);assert(maxTurn<=4.801);assert(maxTurnA<=16.001);assert(Math.hypot(g.body.vx,g.body.vz)<.01);
});
test('ring gently settles the actor but intentional movement can leave',()=>{
 const g=new Game();g.goal=true;g.body.x=HOME.x+.45;g.body.z=HOME.z+.2;g.move(g.body,{x:0,z:0},1/60,2.65,HOME);
 const start=dist(g.body,HOME);for(let i=0;i<180;i++)g.move(g.body,{x:0,z:0},1/60,2.65,HOME);
 assert(dist(g.body,HOME)<.01);assert(start>.4);
 for(let i=0;i<90;i++)g.move(g.body,{x:1,z:0},1/60,2.65,HOME);
 assert(dist(g.body,HOME)>1.5);
});
test('returning to the white mark has a short dwell, not an 18-second gate',()=>{
 const g=new Game();g.goal=true;g.distance=3;run(g,1);assert.notEqual(g.stage,'arrival');assert(g.time<2);
});
test('curtain unites both roots before using precisely the same bow pose',()=>{
 const g=new Game();g.body.x=1;g.shadow.x=-2;g.finish('host-ended');
 until(g,'ended',30);assert(g.curtainActing);assert.deepEqual(g.body,g.shadow);assert.equal(g.body.animation,'bow');assert(g.body.clocks.bow>2.4);
});
test('stationary independent shadow performs restrained struggle while body moves',()=>{
 const g=new Game();run(g,4,()=>({x:1,z:0}));g.skip();until(g,'echo',20);run(g,2);
 assert.equal(g.shadow.animation,'struggle');assert(g.shadow.weights.struggle>.5);assert(g.shadow.clocks.struggle>0);
});
test('interrupted animation transitions retain all previous pose weights',()=>{
 const g=new Game();for(const label of ['walk','sit','rise','walk','bow','struggle','idle']){
  const before={...g.body.weights};g.animate(g.body,label,1/60,1.5);
  assert(Math.abs(Object.values(g.body.weights).reduce((a,b)=>a+b,0)-1)<1e-8);
  for(const name of Object.keys(before))assert(Math.abs(g.body.weights[name]-before[name])<.13);
 }
});
