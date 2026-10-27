/** Ground-plane motion: bounded acceleration/jerk, eased facing and soft arrival. */
export type Point = {x:number;z:number};
export type Motion = Point & {vx:number;vz:number;ax:number;az:number;yaw:number;yawVelocity:number};
export const MOTION = {speed:2.25,followSpeed:2.65,catchUpSpeed:2.7,attachSpeed:2.9,demoSpeed:1.83,reverseSpeed:1.9,acceleration:8.5,jerk:64,response:11,turnSpeed:4.8,turnAcceleration:16};
export const length=(p:Point)=>Math.hypot(p.x,p.z);
export const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export const smooth=(x:number)=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function limited(x:number,z:number,max:number):Point {const n=Math.hypot(x,z);return n>max?{x:x*max/n,z:z*max/n}:{x,z};}
export function velocity(a:Motion,desired:Point,dt:number){
  const w=MOTION.response;
  const j=limited(w*w*(desired.x-a.vx)-2*w*a.ax,w*w*(desired.z-a.vz)-2*w*a.az,MOTION.jerk);
  const acceleration=limited(a.ax+j.x*dt,a.az+j.z*dt,MOTION.acceleration);
  a.ax=acceleration.x;a.az=acceleration.z;a.vx+=a.ax*dt;a.vz+=a.az*dt;
  a.x+=a.vx*dt;a.z+=a.vz*dt;
}
export function facing(a:Motion,target:number,dt:number){
  const error=Math.atan2(Math.sin(target-a.yaw),Math.cos(target-a.yaw));
  const desired=clamp(error*6,-MOTION.turnSpeed,MOTION.turnSpeed);
  a.yawVelocity+=clamp((desired-a.yawVelocity)*9,-MOTION.turnAcceleration,MOTION.turnAcceleration)*dt;
  a.yaw+=a.yawVelocity*dt;
}
export function arrival(a:Point,target:Point,maxSpeed:number):Point {
  const dx=target.x-a.x,dz=target.z-a.z,d=Math.hypot(dx,dz);
  const speed=Math.min(maxSpeed,d*2.7);return d>1e-8?{x:dx/d*speed,z:dz/d*speed}:{x:0,z:0};
}
/** Gentle help only inside the ring's neighbourhood; deliberate input can always leave. */
export function magnet(a:Point,input:Point,center:Point|undefined):Point {
  if(!center)return input;
  const dx=center.x-a.x,dz=center.z-a.z,d=Math.hypot(dx,dz),n=length(input);
  if(d>.85)return input;
  if(n<.08)return arrival(a,center,.8);
  // Do not fight an intentional movement away from the mark.
  if(dx*input.x+dz*input.z<-.08)return input;
  const influence=.32*smooth(1-d/.85);
  return {x:input.x*(1-influence)+dx*2.6*influence,z:input.z*(1-influence)+dz*2.6*influence};
}
/** Time warp for a reverse route: 0 -> constant speed -> 0, with smooth joins. */
export function easedRouteTime(t:number,duration:number,ramp=1.25){
  const r=Math.min(ramp,duration/2),v=duration/(duration-r);t=clamp(t,0,duration);
  const integral=(u:number)=>u*u*u-.5*u*u*u*u;
  if(t<r)return v*r*integral(t/r);
  if(t<=duration-r)return v*(t-r/2);
  return duration-v*r*integral((duration-t)/r);
}
