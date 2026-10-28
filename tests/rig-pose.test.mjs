import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {poseRig} from '../src/rig-pose.ts';
import {actor,HOME} from '../src/engine.ts';
import {SUN,SHADOW_SLOPE,SHADOW_HEIGHT} from '../src/lighting.ts';
const bytes=await fs.readFile(new URL('../public/assets/actor.glb',import.meta.url));
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
function rig(){
 const root=clone(gltf.scene),mixer=new THREE.AnimationMixer(root),actions=new Map(),nodes=[];
 gltf.animations.forEach(c=>{const a=mixer.clipAction(c);a.play();a.enabled=false;actions.set(c.name,a)});
 root.traverse(n=>{if(n.isBone)nodes.push(n)});return {root,mixer,actions,nodes};
}
const values=r=>new Float32Array(r.nodes.flatMap(n=>[...n.position,...n.quaternion,...n.scale]));
const maxDiff=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));

test('repeated rendering of a frozen gaze cannot accumulate head or torso rotation',()=>{
 const r=rig(),a=actor(HOME);a.lookWeight=1;a.lookYaw=.8;a.lookPitch=.6;
 poseRig(r,a);const expected=values(r);
 for(let i=0;i<120;i++){poseRig(r,a);assert(maxDiff(values(r),expected)<1e-7);}
});

test('pose recording and attachment do not change a later rendering of the same animation',()=>{
 const r=rig(),a=actor(HOME);a.lookWeight=.8;a.lookYaw=-.6;a.lookPitch=.7;
 a.weights.idle=.4;a.weights.walk=.6;a.gaitPhase=.32;
 poseRig(r,a);const expected=values(r);
 // Recorded playback may leave arbitrary bones behind; rendering restores the
 // independent mixer base instead of incorporating that snapshot into its gaze.
 const recorded=expected.slice();recorded[13]+=.2;poseRig(r,a,{},recorded);
 r.nodes.forEach(n=>n.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.4)));
 poseRig(r,a);assert(maxDiff(values(r),expected)<1e-6);
});

test('render call count does not alter a moving actor or its projected silhouette',()=>{
 const once=rig(),many=rig(),a=actor(HOME);a.lookWeight=1;a.lookYaw=.5;a.lookPitch=.4;
 a.weights.idle=0;a.weights.walk=1;
 for(let i=0;i<120;i++){
  a.gaitPhase=i/120;a.yaw=i/240;a.clocks.idle=i/60;
  poseRig(once,a);for(let n=0;n<4;n++)poseRig(many,a);
  assert(maxDiff(values(once),values(many))<1e-6);
 }
});

test('the oblique projection shares the architectural sun and clears floor inlays',()=>{
 assert.equal(SHADOW_SLOPE.x,-SUN.x/SUN.y);assert.equal(SHADOW_SLOPE.z,-SUN.z/SUN.y);
 const factor=Math.hypot(SHADOW_SLOPE.x,SHADOW_SLOPE.z)/Math.hypot(.625,.5);
 assert(factor>1.4&&factor<1.5);assert(SHADOW_HEIGHT>.0475);
});
