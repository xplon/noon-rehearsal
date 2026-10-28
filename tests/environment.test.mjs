import test from 'node:test';
import assert from 'node:assert/strict';
import {courtyardMotion} from '../src/environment-motion.ts';
test('courtyard motion is bounded and deterministic across pause and replay seeks',()=>{
 assert(courtyardMotion(0).doorAngle===0);assert(courtyardMotion(9).doorAngle===0);
 assert(Math.abs(courtyardMotion(10.7).doorAngle+.065)<1e-10);assert(courtyardMotion(13).doorAngle===0);
 for(let t=0;t<180;t+=.1){const m=courtyardMotion(t);assert(m.doorAngle>=-.065&&m.doorAngle<=0);assert(Math.abs(m.wind)<.05);assert.deepEqual(m,courtyardMotion(t));}
});
