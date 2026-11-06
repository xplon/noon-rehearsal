/** Shared ground plan. Rendered masonry, navigation and milestones use these coordinates. */
export type Point={x:number;z:number};
export const ACTOR_RADIUS=.24;
export const WORLD_BOUNDS={left:-7.15,right:7.0,top:-4.75,bottom:4.15} as const;
export const GATE={x:4.1,z:-5.2,halfWidth:.9,hingeX:5.0,leafWidth:1.8,maxAngle:1.48,leafThickness:.06,frameDepth:.23,outsideEnd:-7.5,outsideLeft:2.1,outsideShoulder:-6.7} as const;
export const FRONT_MARK:Point={x:GATE.x,z:-3.2};
export const INNER_PAD:Point={x:2.15,z:-3.55};
export const OUTER_PAD:Point={x:2.8,z:-7.05};
export const OUTSIDE_MARK:Point={...OUTER_PAD};
export const PAD_RADIUS=.46;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
type Segment={a:Point;b:Point};
type Rect={left:number;right:number;top:number;bottom:number};
const segment=(x1:number,z1:number,x2:number,z2:number):Segment=>({a:{x:x1,z:z1},b:{x:x2,z:z2}});
const L=GATE.x-GATE.halfWidth,R=GATE.x+GATE.halfWidth,B=WORLD_BOUNDS;
// A real, narrow passage continues through the selected arch. Other arches are scenery.
const perimeter=[segment(B.left,B.top,L,B.top),segment(R,B.top,B.right,B.top),segment(B.left,B.top,B.left,B.bottom),segment(B.right,B.top,B.right,B.bottom),segment(B.left,B.bottom,B.right,B.bottom),segment(L,B.top,L,GATE.outsideShoulder),segment(GATE.outsideLeft,GATE.outsideShoulder,L,GATE.outsideShoulder),segment(GATE.outsideLeft,GATE.outsideShoulder,GATE.outsideLeft,GATE.outsideEnd),segment(R,B.top,R,GATE.outsideEnd),segment(GATE.outsideLeft,GATE.outsideEnd,R,GATE.outsideEnd)];
export const MASONRY:Rect[]=[
  {left:2.175,right:2.925,top:-6.475,bottom:-5.125},
  {left:5.275,right:6.025,top:-6.475,bottom:-5.125},
  {left:L-.28,right:L,top:GATE.z-GATE.frameDepth/2,bottom:GATE.z+GATE.frameDepth/2},
  {left:R,right:R+.28,top:GATE.z-GATE.frameDepth/2,bottom:GATE.z+GATE.frameDepth/2},
  {left:-7.75,right:-5.45,top:-3.875,bottom:-3.125},
];
const planters=[{x:-5.8,z:.1,radius:.85},{x:6.9,z:-4.8,radius:.55}];
export function pointSegmentDistance(p:Point,s:Segment){
  const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
  const t=clamp(((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(p.x-s.a.x-dx*t,p.z-s.a.z-dz*t);
}
export function doorLeaf(open:number):Segment{
  const angle=GATE.maxAngle*clamp(open,0,1);
  return {a:{x:GATE.hingeX,z:GATE.z},b:{x:GATE.hingeX-Math.cos(angle)*GATE.leafWidth,z:GATE.z-Math.sin(angle)*GATE.leafWidth}};
}
export function isOutside(p:Point,radius=ACTOR_RADIUS){
  const cleared=p.z+radius<GATE.z-GATE.leafThickness/2;
  const corridor=p.x-radius>L&&p.x+radius<R;
  const landing=p.z+radius<GATE.outsideShoulder&&p.x-radius>GATE.outsideLeft&&p.x+radius<R;
  return cleared&&(corridor||landing)&&p.z-radius>=GATE.outsideEnd;
}
export function onPad(p:Point,pad:Point){return distance(p,pad)<PAD_RADIUS;}
export function doorOccupied(actors:readonly Point[],radius=ACTOR_RADIUS){
  return actors.some(p=>{
    const threshold=Math.abs(p.z-GATE.z)<radius+.22&&Math.abs(p.x-GATE.x)<GATE.halfWidth+radius;
    // Do not close into the transfer passage behind the threshold. Occupancy only
    // preserves the current angle; it never opens a shut gate.
    const sweep=p.z<GATE.z+radius&&p.x<GATE.hingeX+radius&&p.x>GATE.hingeX-GATE.leafWidth-radius&&distance(p,{x:GATE.hingeX,z:GATE.z})<GATE.leafWidth+radius+.12;
    return threshold||sweep;
  });
}
export function isWalkable(p:Point,doorOpen:number,radius=ACTOR_RADIUS){
  const inCourt=p.x>=B.left&&p.x<=B.right&&p.z>=B.top&&p.z<=B.bottom;
  const inPassage=p.x>=L&&p.x<=R&&p.z>=GATE.outsideEnd&&p.z<=B.top;
  const inLanding=p.x>=GATE.outsideLeft&&p.x<=R&&p.z>=GATE.outsideEnd&&p.z<=GATE.outsideShoulder;
  if(!inCourt&&!inPassage&&!inLanding)return false;
  if(perimeter.some(s=>pointSegmentDistance(p,s)<radius-1e-7))return false;
  if(MASONRY.some(b=>Math.hypot(p.x-clamp(p.x,b.left,b.right),p.z-clamp(p.z,b.top,b.bottom))<radius-1e-7))return false;
  if(planters.some(b=>distance(p,b)<b.radius+radius-1e-7))return false;
  return pointSegmentDistance(p,doorLeaf(doorOpen))>=radius+GATE.leafThickness/2-1e-7;
}
function clearSegment(from:Point,to:Point,open:number,radius=ACTOR_RADIUS){
  const n=Math.max(1,Math.ceil(distance(from,to)/.055));
  for(let i=1;i<=n;i++){const f=i/n;if(!isWalkable({x:from.x+(to.x-from.x)*f,z:from.z+(to.z-from.z)*f},open,radius))return false;}
  return true;
}
/** Continuous small steps prevent tunnelling, including from outside a shut door. */
export function resolveMove(from:Point,to:Point,doorOpen:number,radius=ACTOR_RADIUS):Point{
  const n=Math.max(1,Math.ceil(distance(from,to)/.035)),dx=(to.x-from.x)/n,dz=(to.z-from.z)/n;
  let p={...from};
  for(let i=0;i<n;i++){
    const candidate={x:p.x+dx,z:p.z+dz};
    if(isWalkable(candidate,doorOpen,radius)){p=candidate;continue;}
    const xOnly={x:p.x+dx,z:p.z},zOnly={x:p.x,z:p.z+dz};
    if(Math.abs(dx)>Math.abs(dz))p=isWalkable(xOnly,doorOpen,radius)?xOnly:isWalkable(zOnly,doorOpen,radius)?zOnly:p;
    else p=isWalkable(zOnly,doorOpen,radius)?zOnly:isWalkable(xOnly,doorOpen,radius)?xOnly:p;
  }
  return p;
}
/** Slow before contact; resolveMove remains a numerical safety net after steering. */
export function limitVelocity(p:Point,desired:Point,doorOpen:number):Point{
  const speed=Math.hypot(desired.x,desired.z);if(speed<1e-8)return {...desired};
  const dir={x:desired.x/speed,z:desired.z/speed},horizon=Math.max(.45,speed*.45+speed*speed/(2*6.0)+.12);
  let clearance=horizon;
  for(let s=.025;s<=horizon;s+=.025){if(!isWalkable({x:p.x+dir.x*s,z:p.z+dir.z*s},doorOpen)){clearance=Math.max(0,s-.025);break;}}
  if(clearance>=horizon)return {...desired};
  const limit=Math.min(speed,Math.sqrt(2*5.0*clearance),clearance*2.0);
  return {x:dir.x*limit,z:dir.z*limit};
}
/** The same angle drives collision and rendering; no decorative hinge motion is added. */
export function safeDoorStep(current:number,desired:number,actors:readonly Point[],dt:number){
  let target=clamp(desired,0,1);if(target<current&&doorOccupied(actors))target=current;
  const wanted=current+(target-current)*(1-Math.exp(-dt*3.5));
  const n=Math.max(1,Math.ceil(Math.abs(wanted-current)*GATE.maxAngle/.008));let safe=current;
  for(let i=1;i<=n;i++){
    const next=current+(wanted-current)*i/n,leaf=doorLeaf(next);
    const previousLeaf=doorLeaf(safe);
    if(actors.some(p=>{const next=pointSegmentDistance(p,leaf),before=pointSegmentDistance(p,previousLeaf);return next<ACTOR_RADIUS+GATE.leafThickness/2+.025&&next<before-1e-7;}))break;
    safe=next;
  }
  return safe;
}
const NAV:Point[]=[{x:4.1,z:-2.75},{x:2.45,z:-2.75},{x:4.1,z:-4.5},{x:4.1,z:-5.75},{x:3.5,z:-5.85},{x:3.5,z:-6.4},{x:3.5,z:-6.95},{x:4.1,z:-6.95},OUTER_PAD,{x:-4.35,z:-1.5},{x:-4.35,z:1.6},{x:-6.7,z:1.6},{x:-6.7,z:-1.5}];
/** Use the live leaf angle so a partly closed gate does not invalidate the route. */
export function waypoint(from:Point,target:Point,doorOpen=1):Point{
  if(clearSegment(from,target,doorOpen))return target;
  const nodes=[from,target,...NAV.filter(p=>isWalkable(p,doorOpen))],cost=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set<number>();cost[0]=0;
  for(let iteration=0;iteration<nodes.length;iteration++){
    let a=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(a<0||cost[i]<cost[a]))a=i;
    if(a<0||!Number.isFinite(cost[a]))break;if(a===1)break;done.add(a);
    for(let b=1;b<nodes.length;b++){if(done.has(b)||!clearSegment(nodes[a],nodes[b],doorOpen))continue;const next=cost[a]+distance(nodes[a],nodes[b]);if(next<cost[b]){cost[b]=next;previous[b]=a;}}
  }
  if(previous[1]<0)return target;
  let next=1;while(previous[next]>0)next=previous[next];return nodes[next];
}
