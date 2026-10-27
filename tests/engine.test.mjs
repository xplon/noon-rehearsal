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
 const g=new Game();run(g,30,(g,i)=>({x:i<180?1:i<360?-1:0,z:0}));assert(!g.systemDemo);
 until(g,'echo');const start={...g.body};assert(dist(start,HOME)<.03);run(g,1,()=>({x:0,z:1}));
 const expected=routeAt(g.route,g.elapsed);assert(dist(g.body,expected)<1e-7);assert.equal(g.bodySource,'recorded-body');assert(dist(g.shadow,g.body)>.1);
 const pausedPart=routeAt(g.route,9);const pausedPart2=routeAt(g.route,10);assert(dist(pausedPart,pausedPart2)<1e-8);
});
test('teacher reverse starts at the latest shadow position and uses its own recorded path',()=>{
 const g=new Game('teacher');until(g,'reverse',200,(g,i)=>({x:Math.sin(i/100),z:Math.cos(i/100)}));
 const start={...g.shadow};g.step(1/60);assert(dist(g.shadow,start)<.1);run(g,2);
 const expected=routeAt(g.reverseRoute,g.reverseRoute.at(-1).t-g.elapsed);assert(dist(expected,g.shadow)<1e-7);assert.equal(g.target,'none');assert.equal(g.shadowSource,'reverse');
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
