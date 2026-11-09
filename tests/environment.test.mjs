import test from 'node:test';
import assert from 'node:assert/strict';
import {courtyardMotion} from '../src/environment-motion.ts';
test('courtyard motion is bounded and deterministic across pause and replay seeks',()=>{
 assert(courtyardMotion(0).doorAngle===0);assert(courtyardMotion(9).doorAngle===0);
 assert(Math.abs(courtyardMotion(10.7).doorAngle+.065)<1e-10);assert(courtyardMotion(13).doorAngle===0);
 for(let t=0;t<180;t+=.1){const m=courtyardMotion(t);assert(m.doorAngle>=-.065&&m.doorAngle<=0);assert(Math.abs(m.wind)<.05);assert.deepEqual(m,courtyardMotion(t));}
});

import {WALLS,GATE,INNER_PAD,OUTER_PAD} from '../src/space.ts';
import {segmentHitsRect,shadowReaches} from '../src/ground-projection.ts';

test('projection clipping handles parallel, tangent and diagonal wall rays',()=>{
 const wall={left:1.85,right:2.15,top:.05,bottom:4.35};
 assert(segmentHitsRect({x:1,z:2},{x:4,z:2},wall));
 assert(!segmentHitsRect({x:1,z:-.9},{x:4,z:-.9},wall));
 assert(!segmentHitsRect({x:1,z:2},{x:1,z:3},wall));
 assert(segmentHitsRect({x:2,z:0},{x:2,z:3},wall));
 for(const pad of [INNER_PAD,OUTER_PAD])assert(shadowReaches(pad,{x:pad.x+.15,z:pad.z+.15},1));
});

test('the complete leaf fits behind the continuous rear separator',()=>{
 const pocket=WALLS.find(r=>r.left<GATE.x&&r.right>GATE.x&&r.bottom===GATE.z-GATE.halfWidth);
 assert(pocket);assert(pocket.bottom-pocket.top>=GATE.leafWidth);
});
