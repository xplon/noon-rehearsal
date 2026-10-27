import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/engine.ts';
import {makeClips,replayFrame} from '../src/replay.ts';

test('replay interpolates captured bone positions, unit rotations and animated scale without changing the record',()=>{
 const g=new Game();const a=g.snapshot(),b=g.snapshot();a.t=0;b.t=1;
 a.visual={body:new Float32Array([0,1,2,0,0,0,1,1,1,1]),shadow:new Float32Array([0,1,2,0,0,0,1,1,1,1])};
 b.visual={body:new Float32Array([2,3,4,0,1,0,0,1,.2,1]),shadow:new Float32Array([2,3,4,0,1,0,0,1,.2,1])};
 const f=replayFrame([a,b],.5),v=f.visual.body;
 assert.equal(v[0],1);assert.equal(v[1],2);assert(Math.abs(v[8]-.6)<1e-6);assert(Math.abs(Math.hypot(...v.slice(3,7))-1)<1e-6);
 assert.equal(a.visual.body[8],1);assert.equal(b.visual.body[0],2);
});
test('review cards never manufacture missing stage events or an interpretation',()=>{
 const g=new Game();g.finish('host-ended');g.record();const clips=makeClips(g.frames,g.events);
 assert.equal(clips.length,2);assert(clips.at(-1).fact.includes('没有触发'));assert(!clips.some(c=>c.name==='熟悉的动作'));
});
test('typed pose arrays export as plain JSON arrays and survive gzip',async()=>{
 const pose=new Float32Array([1,.25,0,0,0,0,1,1,.2,1]);
 const json=JSON.stringify({pose},(_key,v)=>v instanceof Float32Array?Array.from(v):v);
 const gzip=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
 const decoded=await new Response(gzip.stream().pipeThrough(new DecompressionStream('gzip'))).json();
 assert.deepEqual(decoded.pose,Array.from(pose));
});
