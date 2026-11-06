import test from 'node:test';
import assert from 'node:assert/strict';
import {GATE,ACTOR_RADIUS,FRONT_MARK,INNER_PAD,OUTER_PAD,OUTSIDE_MARK,doorLeaf,isOutside,isWalkable,resolveMove,limitVelocity,safeDoorStep,waypoint,pointSegmentDistance,onPad,PAD_RADIUS,doorOccupied} from '../src/space.ts';
import {steer} from '../src/locomotion.ts';
import {arrival} from '../src/motion.ts';

test('a closed gate blocks both sides and high-speed diagonal motion',()=>{
  const inside={x:GATE.x,z:GATE.z+1},outside={x:GATE.x,z:GATE.z-1};
  const inward=resolveMove(inside,outside,0),outward=resolveMove(outside,inside,0);
  assert(inward.z>=GATE.z+ACTOR_RADIUS+GATE.leafThickness/2-1e-5);
  assert(outward.z<=GATE.z-ACTOR_RADIUS-GATE.leafThickness/2+1e-5);
  assert.equal(isOutside(inward),false);
  const diagonal=resolveMove({x:4.7,z:-4.0},{x:3.5,z:-6.4},0);
  assert(diagonal.z>GATE.z);assert(isWalkable(diagonal,0));
});

test('a half-open leaf blocks its actual location behind the threshold; full opening clears the route',()=>{
  const from={x:GATE.x,z:-3.2};
  const beyond={x:GATE.x,z:-7.1};
  const half=resolveMove(from,beyond,.65),open=resolveMove(from,beyond,1);
  assert(half.z>beyond.z+.2);assert(isWalkable(half,.65));
  assert(Math.hypot(open.x-beyond.x,open.z-beyond.z)<1e-6);assert(isOutside(open));
  const leaf=doorLeaf(.65);assert(pointSegmentDistance(half,leaf)>=ACTOR_RADIUS+GATE.leafThickness/2-1e-6);
});

test('outside status uses the whole collision radius beyond the actual leaf plane',()=>{
  assert.equal(isOutside({x:GATE.x,z:-4.6}),false);
  assert.equal(isOutside({x:GATE.x,z:GATE.z-.15}),false);
  assert.equal(isOutside({x:GATE.x,z:GATE.z-.31}),true);
  assert.equal(isOutside({x:5.5,z:GATE.z-.8}),false);
});

test('masonry and jambs cannot be bypassed by starting outside',()=>{
  let p={...OUTSIDE_MARK};
  for(let i=0;i<80;i++)p=resolveMove(p,{x:p.x+.06,z:p.z},1);
  assert(p.x<=GATE.x+GATE.halfWidth-ACTOR_RADIUS+1e-6);assert(isWalkable(p,1));
  const intoColumn=resolveMove({x:5.5,z:-4.0},{x:5.5,z:-6.0},1);
  assert(intoColumn.z>-4.75);assert(isWalkable(intoColumn,1));
});

test('door cannot close through occupied threshold or swing open through an actor',()=>{
  const inThreshold={x:GATE.x,z:GATE.z};
  assert.equal(safeDoorStep(1,0,[inThreshold],1),1);
  const blocker={x:4.1,z:-6.0};let opening=0;
  for(let i=0;i<180;i++)opening=safeDoorStep(opening,1,[blocker],1/60);
  assert(opening<.95);assert(pointSegmentDistance(blocker,doorLeaf(opening))>=ACTOR_RADIUS+GATE.leafThickness/2);
  let released=opening;for(let i=0;i<180;i++)released=safeDoorStep(released,1,[],1/60);
  assert(released>.99);
});

test('approaching collision produces a lower desired speed before contact',()=>{
  const far=limitVelocity({x:GATE.x,z:-3.5},{x:0,z:-2.25},0);
  const near=limitVelocity({x:GATE.x,z:GATE.z+.38},{x:0,z:-2.25},0);
  assert(Math.abs(near.z)<Math.abs(far.z));assert(near.z<=0);
});

test('relay routes navigate around the open leaf and align with the passage',()=>{
  function walk(from,target){let p={...from};for(let i=0;i<1500;i++){
    const goal=waypoint(p,target),d=Math.hypot(goal.x-p.x,goal.z-p.z);if(Math.hypot(target.x-p.x,target.z-p.z)<.04)return p;
    const step=Math.min(.04,d);p=resolveMove(p,{x:p.x+(goal.x-p.x)/(d||1)*step,z:p.z+(goal.z-p.z)/(d||1)*step},1);
    assert(isWalkable(p,1));
  }assert.fail(`unreachable relay route ${JSON.stringify(from)} -> ${JSON.stringify(target)} at ${JSON.stringify(p)}`);}
  for(const pad of [INNER_PAD,OUTER_PAD,OUTSIDE_MARK])assert(isWalkable(pad,1));
  walk(FRONT_MARK,INNER_PAD);walk(INNER_PAD,OUTER_PAD);walk(OUTER_PAD,INNER_PAD);walk(FRONT_MARK,OUTSIDE_MARK);
});

const movingActor=p=>({...p,vx:0,vz:0,ax:0,az:0,yaw:Math.PI,yawVelocity:0,travelYaw:Math.PI,turnWait:0,pivoting:false,pivotPhase:0});
test('normal locomotion brakes before the shut leaf without a positional snap',()=>{
  const a=movingActor({x:GATE.x,z:-2});let largestCorrection=0;
  for(let i=0;i<600;i++){
    const from={x:a.x,z:a.z};steer(a,limitVelocity(a,{x:0,z:-2.25},0),1/60);
    const resolved=resolveMove(from,a,0);largestCorrection=Math.max(largestCorrection,Math.hypot(resolved.x-a.x,resolved.z-a.z));Object.assign(a,resolved);
  }
  assert(largestCorrection<1e-5);assert(Math.abs(a.vz)<.01);assert(a.z>GATE.z+ACTOR_RADIUS);
});

test('steered partners can actually reach both relay pads without hitting the open leaf',()=>{
  for(const [from,target] of [[FRONT_MARK,INNER_PAD],[INNER_PAD,OUTER_PAD],[OUTER_PAD,INNER_PAD]]){
    const a=movingActor(from);let reached=false;
    for(let i=0;i<2400;i++){
      const before={x:a.x,z:a.z};steer(a,limitVelocity(a,arrival(a,waypoint(a,target),2.25),1),1/60);Object.assign(a,resolveMove(before,a,1));
      assert(isWalkable(a,1));
      if(Math.hypot(a.x-target.x,a.z-target.z)<.06&&Math.hypot(a.vx,a.vz)<.08){reached=true;break;}
    }
    assert(reached,`steering must reach ${JSON.stringify(target)} from ${JSON.stringify(from)}, stopped at ${a.x},${a.z}`);
  }
});


test('a partner can open the gate after the player has already walked up to the closed leaf',()=>{
  const body=movingActor(FRONT_MARK),shadow=movingActor({x:-2.4,z:2.2});let open=0,passed=false,waitedAtDoor=false;
  const move=(a,target)=>{const before={x:a.x,z:a.z};steer(a,limitVelocity(a,arrival(a,waypoint(a,target,open),2.25),open),1/60);Object.assign(a,resolveMove(before,a,open));assert(isWalkable(a,open));};
  for(let i=0;i<3600;i++){
    const outsideHeld=onPad(body,OUTER_PAD),insideHeld=onPad(shadow,INNER_PAD);
    open=safeDoorStep(open,insideHeld||outsideHeld?1:doorOccupied([body,shadow])?open:0,[body,shadow],1/60);
    move(body,OUTER_PAD);move(shadow,outsideHeld?OUTSIDE_MARK:INNER_PAD);
    if(open<.01&&body.z<-4.85)waitedAtDoor=true;
    if(isOutside(body)&&isOutside(shadow)&&Math.hypot(shadow.vx,shadow.vz)<.06){passed=true;break;}
  }
  assert(waitedAtDoor,'probe must actually approach the shut leaf before the partner opens it');
  assert(passed,`relay failed: ${JSON.stringify({body:{x:body.x,z:body.z},shadow:{x:shadow.x,z:shadow.z},open})}`);
});

test('every reachable part of the outside pad is clear of the opening sweep',()=>{
  let examined=0;
  for(const radius of [0,.15,.30,PAD_RADIUS-.01])for(let i=0;i<24;i++){
    const a=i*Math.PI/12,p={x:OUTER_PAD.x+Math.cos(a)*radius,z:OUTER_PAD.z+Math.sin(a)*radius};
    if(!isWalkable(p,0))continue;examined++;let open=0;
    for(let frame=0;frame<180;frame++)open=safeDoorStep(open,1,[p],1/60);
    assert(open>.99,`outside pad traps opener at ${JSON.stringify(p)} (${open})`);
  }
  assert(examined>=20,'sample the reachable pad interior, not only inaccessible boundary points');
});


test('the shadow can cross first while the body holds inside, then take over outside',()=>{
  const body=movingActor(FRONT_MARK),shadow=movingActor({x:2.4,z:-2.1});let open=0,takenOver=false,passed=false;
  const move=(a,target)=>{const before={x:a.x,z:a.z};steer(a,limitVelocity(a,arrival(a,waypoint(a,target,open),2.25),open),1/60);Object.assign(a,resolveMove(before,a,open));assert(isWalkable(a,open));};
  for(let i=0;i<3600;i++){
    const inner=onPad(body,INNER_PAD),outer=onPad(shadow,OUTER_PAD);if(outer)takenOver=true;
    open=safeDoorStep(open,inner||outer?1:doorOccupied([body,shadow])?open:0,[body,shadow],1/60);
    move(body,takenOver?OUTSIDE_MARK:INNER_PAD);move(shadow,inner||takenOver?OUTER_PAD:FRONT_MARK);
    if(takenOver&&isOutside(body)&&isOutside(shadow)&&Math.hypot(body.vx,body.vz)<.06){passed=true;break;}
  }
  assert(passed,`shadow-first failed: ${JSON.stringify({body:{x:body.x,z:body.z},shadow:{x:shadow.x,z:shadow.z},open})}`);
});


test('early release of the inside pad cannot close the leaf across the transfer passage',()=>{
  const body=movingActor(INNER_PAD),shadow=movingActor(FRONT_MARK);let open=0,released=false,handedOff=false;
  const move=(a,target)=>{const before={x:a.x,z:a.z};steer(a,limitVelocity(a,arrival(a,waypoint(a,target,open),2.25),open),1/60);Object.assign(a,resolveMove(before,a,open));assert(isWalkable(a,open));};
  for(let i=0;i<3600;i++){
    const inner=onPad(body,INNER_PAD),outer=onPad(shadow,OUTER_PAD);if(isOutside(shadow))released=true;
    open=safeDoorStep(open,inner||outer?1:doorOccupied([body,shadow])?open:0,[body,shadow],1/60);
    move(body,released?OUTSIDE_MARK:INNER_PAD);move(shadow,OUTER_PAD);
    if(outer&&Math.hypot(shadow.vx,shadow.vz)<.08){handedOff=true;break;}
  }
  assert(released);assert(handedOff,`early release stalled: ${JSON.stringify({body:{x:body.x,z:body.z},shadow:{x:shadow.x,z:shadow.z},open})}`);
});

test('a recorded half-closed obstruction can be escaped without automatically opening the gate',()=>{
  const shadow=movingActor({x:4.0005,z:-6.5432}),body=movingActor(OUTSIDE_MARK);let open=.74018,arrived=false,maxOpen=open;
  for(let i=0;i<2400;i++){
    open=safeDoorStep(open,doorOccupied([body,shadow])?open:0,[body,shadow],1/60);maxOpen=Math.max(maxOpen,open);
    const from={x:shadow.x,z:shadow.z};steer(shadow,limitVelocity(shadow,arrival(shadow,waypoint(shadow,OUTER_PAD,open),1.7),open),1/60);Object.assign(shadow,resolveMove(from,shadow,open));
    assert(isWalkable(shadow,open));
    if(Math.hypot(shadow.x-OUTER_PAD.x,shadow.z-OUTER_PAD.z)<.07&&Math.hypot(shadow.vx,shadow.vz)<.08){arrived=true;break;}
  }
  assert(maxOpen<=.74018+1e-8);assert(arrived,`half-open recovery stopped at ${shadow.x},${shadow.z}`);
});

test('occupancy beside a closed gate never creates opening demand',()=>{
  const actor={x:GATE.x,z:GATE.z+.3};let open=0;
  for(let i=0;i<180;i++)open=safeDoorStep(open,doorOccupied([actor])?open:0,[actor],1/60);
  assert.equal(open,0);
});
