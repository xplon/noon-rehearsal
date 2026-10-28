import {facing,velocity,smooth,type Motion,type Point} from './motion.ts';

export type SteeredMotion=Motion&{travelYaw:number;turnWait:number;pivoting:boolean;pivotPhase:number};
export const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

/** Intention precedes orientation, and orientation precedes a step in a new direction. */
export function steer(a:SteeredMotion,desired:Point,dt:number){
  const magnitude=Math.hypot(desired.x,desired.z),speed=Math.hypot(a.vx,a.vz);
  if(magnitude>.055){
    const target=Math.atan2(desired.x,desired.z),error=angleDelta(a.yaw,target);
    if(!a.pivoting&&Math.abs(error)>.95){a.pivoting=true;a.turnWait=.20;}
    a.travelYaw=target;
    if(a.pivoting){
      a.turnWait=Math.max(0,a.turnWait-dt);
      // Keep the old facing while coasting to a stop. Never accelerate backwards
      // in the requested direction while the actor is still facing away from it.
      if(a.turnWait===0&&speed<.16)facing(a,target,dt);else facing(a,a.yaw,dt);
      desired={x:0,z:0};
      if(a.turnWait===0&&Math.abs(angleDelta(a.yaw,target))<.20&&speed<.16)a.pivoting=false;
    }else{
      facing(a,target,dt);
      const permission=smooth((.8-Math.abs(error))/.6);
      desired={x:desired.x*permission,z:desired.z*permission};
    }
  }else{
    a.pivoting=false;a.turnWait=0;facing(a,a.yaw,dt);
  }
  a.pivotPhase+=Math.abs(a.yawVelocity)*dt/(Math.PI/2);
  velocity(a,desired,dt);
}
