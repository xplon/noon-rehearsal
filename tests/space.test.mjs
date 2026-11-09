import test from 'node:test';
import assert from 'node:assert/strict';
import {GATE,ACTOR_RADIUS,WORLD_BOUNDS,HOME_MARK,FRONT_MARK,INNER_PAD,OUTER_PAD,OUTSIDE_MARK,DEPARTURE_MARK,doorLeaf,isOutside,isWalkable,resolveMove,limitVelocity,safeDoorStep,waypoint,pointSegmentDistance,onPad,PAD_RADIUS,doorOccupied,DOOR_RATE} from '../src/space.ts';
import {shadowReaches} from '../src/ground-projection.ts';
import {steer} from '../src/locomotion.ts';
import {arrival} from '../src/motion.ts';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const actor=p=>({...p,vx:0,vz:0,ax:0,az:0,yaw:Math.PI/2,yawVelocity:0,travelYaw:Math.PI/2,turnWait:0,pivoting:false,pivotPhase:0});
const step=(a,target,open,dt=1/60,max=2.7)=>{const before={x:a.x,z:a.z};steer(a,limitVelocity(a,arrival(a,waypoint(a,target,open),max),open),dt);Object.assign(a,resolveMove(before,a,open));assert(isWalkable(a,open),`feet in solid geometry at ${JSON.stringify({x:a.x,z:a.z,open})}`);};

test('the left and right courts have full playable depth and visible departure space',()=>{
  assert(GATE.x-WORLD_BOUNDS.left>=11);assert(WORLD_BOUNDS.right-GATE.x>=5.5);
  for(const point of [HOME_MARK,FRONT_MARK,INNER_PAD,OUTER_PAD,OUTSIDE_MARK,DEPARTURE_MARK,{x:7,z:-3},{x:7,z:3},{x:4,z:3}])assert(isWalkable(point,0));
  assert(!isOutside(HOME_MARK));assert(isOutside(OUTER_PAD));assert(isOutside(DEPARTURE_MARK));
});

test('a closed gate blocks both x crossing directions and diagonal tunnelling',()=>{
  const inside={x:GATE.x-1,z:GATE.z},outside={x:GATE.x+1,z:GATE.z};
  const toOuter=resolveMove(inside,outside,0),toInner=resolveMove(outside,inside,0);
  assert(toOuter.x<=GATE.x-ACTOR_RADIUS-GATE.leafThickness/2+1e-5);
  assert(toInner.x>=GATE.x+ACTOR_RADIUS+GATE.leafThickness/2-1e-5);
  assert.equal(isOutside(toOuter),false);
  for(const z of [-4,-2.5,.7,2.2,4]){
    const blocked=resolveMove({x:0,z},{x:6,z:z+.12},1);assert(blocked.x<GATE.x);assert(isWalkable(blocked,1));
  }
});

test('a sliding leaf occupies its current geometry and retracts exactly into the pocket',()=>{
  const shut=doorLeaf(0),half=doorLeaf(.5),open=doorLeaf(1);
  assert.equal(shut.a.x,GATE.x);assert.equal(open.b.z,shut.a.z);
  assert(Math.abs(half.b.z-GATE.z)<1e-9);assert(Math.abs(dist(half.a,half.b)-GATE.leafWidth)<1e-9);
  const blocked=resolveMove(FRONT_MARK,{x:3.4,z:GATE.z},.25);assert(blocked.x<GATE.x);
  const crossed=resolveMove(FRONT_MARK,{x:3.4,z:GATE.z},1);assert(Math.abs(crossed.x-3.4)<1e-8);assert(isOutside(crossed));
});

test('outside status requires the complete foot radius past the separating masonry',()=>{
  assert(!isOutside({x:GATE.x+.3,z:GATE.z}));assert(isOutside({x:GATE.x+.4,z:GATE.z}));
  assert(!isOutside({x:7,z:-5}));
});

test('the separator joins both real boundaries and cannot be walked around',()=>{
  for(const z of [-4.1,4.1]){let p={x:.8,z};for(let i=0;i<180;i++)p=resolveMove(p,{x:p.x+.08,z:p.z},1);assert(p.x<GATE.x);}
  for(const x of [-8.5,0,4,9])for(const sign of [-1,1]){
    const start={x,z:sign*3.8},p=resolveMove(start,{x,z:sign*6},1);assert(Math.abs(p.z)<=4.35-ACTOR_RADIUS+1e-6);assert(isWalkable(p,1));
  }
});

test('door occupancy preserves current opening but never opens a shut gate',()=>{
  const p={x:GATE.x,z:GATE.z};assert(doorOccupied([p]));assert.equal(safeDoorStep(1,0,[p],1),1);assert.equal(safeDoorStep(.72,0,[p],1),.72);
  assert.equal(safeDoorStep(0,0,[{x:1.7,z:GATE.z}],1),0);
  assert(!doorOccupied([INNER_PAD,OUTER_PAD,{x:GATE.x-.8,z:GATE.z}]));
});

test('closing cannot pinch a foot at any sampled walkable point of the opening',()=>{
  for(const initial of [.5,.75,1])for(let z=GATE.z-GATE.halfWidth;z<GATE.z+GATE.halfWidth;z+=.10)for(const dx of [-.25,0,.25]){
    const p={x:GATE.x+dx,z};if(!isWalkable(p,initial))continue;let open=initial;
    for(let i=0;i<120;i++){open=safeDoorStep(open,0,[p],1/60);assert(isWalkable(p,open));}
    assert(open<=initial);
  }
});

test('both pedal interiors remain clear of the moving leaf and its safety hold zone',()=>{
  for(const pad of [INNER_PAD,OUTER_PAD])for(const radius of [0,.15,.30,PAD_RADIUS-.01])for(let i=0;i<24;i++){
    const a=i*Math.PI/12,p={x:pad.x+Math.cos(a)*radius,z:pad.z+Math.sin(a)*radius};assert(isWalkable(p,0));assert(!doorOccupied([p]));
    let open=0;for(let f=0;f<180;f++)open=safeDoorStep(open,1,[p],1/60);assert(open>.99);
  }
});

test('navigation and real steering reach the pads, both courts, and departure',()=>{
  for(const [from,target] of [[HOME_MARK,INNER_PAD],[FRONT_MARK,INNER_PAD],[INNER_PAD,OUTER_PAD],[OUTER_PAD,INNER_PAD],[OUTSIDE_MARK,DEPARTURE_MARK]]){
    const a=actor(from);let reached=false;
    for(let i=0;i<2400;i++){step(a,target,1);if(dist(a,target)<.06&&Math.hypot(a.vx,a.vz)<.08){reached=true;break;}}
    assert(reached,`unreachable ${JSON.stringify({from,target,at:{x:a.x,z:a.z}})}`);
  }
});

test('normal locomotion brakes before the shut leaf without snapping',()=>{
  const a=actor(FRONT_MARK);let correction=0;
  for(let i=0;i<600;i++){const from={x:a.x,z:a.z};steer(a,limitVelocity(a,{x:2.7,z:0},0),1/60);const p=resolveMove(from,a,0);correction=Math.max(correction,dist(a,p));Object.assign(a,p);}
  assert(correction<1e-5);assert(Math.abs(a.vx)<.01);assert(a.x<GATE.x-ACTOR_RADIUS);
});

test('screen-up input slides along the separator instead of losing its tangent speed',()=>{
  const desired={x:.8356290219,z:-2.0890725545};
  const near=limitVelocity({x:1.59,z:2.5},desired,0);
  assert(Math.abs(near.x)<1e-8);assert(near.z<-2,'the clear tangent must remain responsive');
  const a=actor({x:1.3,z:2.8});a.yaw=a.travelYaw=Math.atan2(desired.x,desired.z);
  let correction=0;
  for(let i=0;i<180;i++){
    const before={x:a.x,z:a.z};steer(a,limitVelocity(a,desired,0),1/60);
    const p=resolveMove(before,a,0);correction=Math.max(correction,dist(p,a));Object.assign(a,p);
    assert(isWalkable(a,0));assert(!isOutside(a),'sliding must not bypass the closed gate');
  }
  assert(a.z<-1,'three seconds of held up input must progress along the wall');
  assert(correction<1e-5,'slide should use smooth steering rather than positional correction');
});

test('surface braking respects the shut gate and all boundaries across 256 approaches',()=>{
  let approaches=0,largestCorrection=0;
  const origins=[FRONT_MARK,{x:1.3,z:2.8},{x:8.8,z:-3.2},{x:-8,z:-.6}];
  for(const dt of [1/30,1/60])for(let heading=0;heading<32;heading++)for(const origin of origins){
    const angle=heading*Math.PI/16,desired={x:Math.sin(angle)*2.7,z:Math.cos(angle)*2.7};
    const a=actor(origin);a.yaw=a.travelYaw=Math.atan2(desired.x,desired.z);
    const side=Math.sign(a.x-GATE.x);
    for(let i=0;i<5/dt;i++){
      const before={x:a.x,z:a.z};steer(a,limitVelocity(a,desired,0),dt);
      const p=resolveMove(before,a,0);largestCorrection=Math.max(largestCorrection,dist(p,a));Object.assign(a,p);
      assert(isWalkable(a,0),JSON.stringify({origin,heading,dt,at:{x:a.x,z:a.z}}));
      assert.equal(Math.sign(a.x-GATE.x),side,'a closed separator cannot be bypassed while sliding');
    }
    approaches++;
  }
  assert.equal(approaches,256);
  assert(largestCorrection<1e-5,`boundary contact required a positional correction of ${largestCorrection}`);
});

test('minimum inner-pedal release distance exceeds even the instantaneous sprint budget',()=>{
  const safetyNearX=GATE.x-ACTOR_RADIUS-.22;
  const dMin=safetyNearX-INNER_PAD.x-PAD_RADIUS;
  // Any physical slit needs at least two foot radii. This is more permissive
  // than the NPC's conservative centreline/passableOpen gate check.
  const finalPassable=2*ACTOR_RADIUS/GATE.leafWidth;
  const tPassable=-Math.log(finalPassable)/DOOR_RATE;
  assert(dMin>2.7*tPassable+.4,JSON.stringify({dMin,tPassable}));
});

test('no full-speed single actor can rush from any pedal edge through any gate approach',()=>{
  let attempts=0;
  for(const dt of [1/30,1/60])for(let angle=0;angle<32;angle++)for(let slot=0;slot<9;slot++){
    const a=angle*Math.PI/16,p={x:INNER_PAD.x+Math.cos(a)*(PAD_RADIUS+.001),z:INNER_PAD.z+Math.sin(a)*(PAD_RADIUS+.001)};
    const target={x:GATE.x+1,z:GATE.z-.65+slot*.1625};let open=1;
    for(let t=0;t<2;t+=dt){open=safeDoorStep(open,0,[p],dt);const d=dist(p,target);Object.assign(p,resolveMove(p,{x:p.x+(target.x-p.x)/d*2.7*dt,z:p.z+(target.z-p.z)/d*2.7*dt},open));assert(!isOutside(p));}
    attempts++;
  }
  assert.equal(attempts,576);
});

test('real acceleration from the pedal also cannot outrun the closing leaf',()=>{
  for(const dt of [1/30,1/60])for(const z of [GATE.z-.5,GATE.z,GATE.z+.5]){
    const a=actor(INNER_PAD);let open=1;
    for(let t=0;t<7;t+=dt){open=safeDoorStep(open,onPad(a,INNER_PAD)?1:0,[a],dt);step(a,{x:4,z},open,dt);assert(!isOutside(a));}
    assert(open<.01);
  }
});

for(const first of ['body','shadow'])test(`${first} can cross first and hold the exterior pedal for its partner`,()=>{
  const holder=actor(INNER_PAD),traveler=actor(FRONT_MARK);let open=0,handedOff=false,complete=false;
  for(let i=0;i<3600;i++){
    const inner=onPad(holder,INNER_PAD),outer=onPad(traveler,OUTER_PAD);if(outer)handedOff=true;
    open=safeDoorStep(open,inner||outer?1:0,[holder,traveler],1/60);
    step(traveler,OUTER_PAD,open);step(holder,handedOff?OUTSIDE_MARK:INNER_PAD,open);
    if(handedOff&&isOutside(holder)&&isOutside(traveler)&&dist(holder,OUTSIDE_MARK)<.08){complete=true;break;}
  }
  assert(complete,JSON.stringify({holder,traveler,open}));
});

test('leaving the outer pedal stops the remaining partner safely, and returning resumes',()=>{
  const waiting=actor(FRONT_MARK),outside=actor(OUTER_PAD);let open=1;
  // An exterior holder withdraws before the partner is in the safety band.
  outside.x+=1.2;
  for(let i=0;i<180;i++){open=safeDoorStep(open,0,[waiting,outside],1/60);step(waiting,OUTSIDE_MARK,open);}
  assert(!isOutside(waiting));assert(open<.01);
  Object.assign(outside,OUTER_PAD);let crossed=false;
  for(let i=0;i<900;i++){open=safeDoorStep(open,1,[waiting,outside],1/60);step(waiting,OUTSIDE_MARK,open);if(isOutside(waiting)){crossed=true;break;}}
  assert(crossed);
});

test('projected head and hands stop at masonry even when their root is clear',()=>{
  for(const open of [0,.5,1]){
    assert(!shadowReaches({x:1,z:1},{x:4,z:2},open));assert(!shadowReaches({x:1,z:-3},{x:4,z:-2.4},open));
    assert(shadowReaches({x:-5,z:1},{x:-3,z:2},open));
  }
  assert(!shadowReaches({x:1,z:GATE.z},{x:3,z:GATE.z},0));
  assert(shadowReaches({x:1,z:GATE.z},{x:3,z:GATE.z},1));
  assert(!shadowReaches({x:1,z:-1.5},{x:3,z:-1.5},.2));
  assert(!shadowReaches({x:8,z:3.5},{x:9,z:5},1));
  assert(shadowReaches({x:9,z:GATE.z},{x:12,z:GATE.z},1));
});
