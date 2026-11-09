/** One ground plan for the visible masonry, feet, sliding door and navigation. */
export type Point={x:number;z:number};
export type Segment={a:Point;b:Point};
export type Rect={left:number;right:number;top:number;bottom:number};
export const ACTOR_RADIUS=.24;
export const WORLD_BOUNDS={left:-9,right:10,top:-4.35,bottom:4.35} as const;
export const GATE={x:2,z:-.9,halfWidth:.95,leafWidth:1.9,leafThickness:.10,frameDepth:.30,pocketDirection:-1,passableOpen:.90} as const;
export const HOME_MARK:Point={x:-5.7,z:2};
export const PLANT_MARK={x:-6.8,z:-.6,radius:.85} as const;
export const SECOND_PLANT={x:8.65,z:2.85,radius:.56} as const;
export const BENCH={x:-6.8,z:-3.50,width:2.3,depth:.75} as const;
export const FRONT_MARK:Point={x:.65,z:GATE.z};
export const INNER_PAD:Point={x:-1.8,z:.7};
export const OUTER_PAD:Point={x:4.1,z:.6};
export const OUTSIDE_MARK:Point={x:5.4,z:-.3};
export const DEPARTURE_MARK:Point={x:12.1,z:GATE.z};
export const EXIT_ROUTE={end:13,top:GATE.z-1.35,bottom:GATE.z+1.35} as const;
export const PAD_RADIUS=.46;
export const DOOR_RATE=3.5;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const B=WORLD_BOUNDS,T=.30,near=GATE.z+GATE.halfWidth,far=GATE.z-GATE.halfWidth;
/** The courtyard bounds describe the INSIDE faces of the visible perimeter. */
export const WALLS:Rect[]=[
  {left:B.left-T,right:B.left,top:B.top-T,bottom:B.bottom+T},
  {left:B.left,right:B.right+T,top:B.top-T,bottom:B.top},
  {left:B.left,right:B.right+T,top:B.bottom,bottom:B.bottom+T},
  {left:B.right,right:B.right+T,top:B.top,bottom:EXIT_ROUTE.top},
  {left:B.right,right:B.right+T,top:EXIT_ROUTE.bottom,bottom:B.bottom},
  {left:B.right,right:EXIT_ROUTE.end,top:EXIT_ROUTE.top-T,bottom:EXIT_ROUTE.top},
  {left:B.right,right:EXIT_ROUTE.end,top:EXIT_ROUTE.bottom,bottom:EXIT_ROUTE.bottom+T},
  {left:GATE.x-GATE.frameDepth/2,right:GATE.x+GATE.frameDepth/2,top:B.top,bottom:far},
  {left:GATE.x-GATE.frameDepth/2,right:GATE.x+GATE.frameDepth/2,top:near,bottom:B.bottom},
  // Cream jambs surround exactly the same net opening as the leaf.
  {left:GATE.x-.24,right:GATE.x+.24,top:far-.28,bottom:far},
  {left:GATE.x-.24,right:GATE.x+.24,top:near,bottom:near+.28},
];
export const MASONRY:Rect[]=[...WALLS,{left:BENCH.x-BENCH.width/2,right:BENCH.x+BENCH.width/2,top:BENCH.z-BENCH.depth/2,bottom:BENCH.z+BENCH.depth/2}];
export const GROUND_RECTS:Rect[]=[{...B},{left:B.right,right:EXIT_ROUTE.end,top:EXIT_ROUTE.top,bottom:EXIT_ROUTE.bottom}];
const planters=[PLANT_MARK,SECOND_PLANT];
export function pointSegmentDistance(p:Point,s:Segment){
  const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
  const t=clamp(((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/(dx*dx+dz*dz||1),0,1);
  return Math.hypot(p.x-s.a.x-dx*t,p.z-s.a.z-dz*t);
}
/** A rectangular leaf translates along -z into its full-length masonry pocket. */
export function doorLeaf(open:number):Segment{
  const shift=GATE.leafWidth*clamp(open,0,1);
  return {a:{x:GATE.x,z:far-shift},b:{x:GATE.x,z:near-shift}};
}
export function doorRect(open:number):Rect{const leaf=doorLeaf(open);return {left:GATE.x-GATE.leafThickness/2,right:GATE.x+GATE.leafThickness/2,top:leaf.a.z,bottom:leaf.b.z};}
export function isOutside(p:Point,radius=ACTOR_RADIUS){return p.x-radius>GATE.x+GATE.frameDepth/2&&GROUND_RECTS.some(r=>p.x>=r.left&&p.x<=r.right&&p.z>=r.top&&p.z<=r.bottom);}
export function onPad(p:Point,pad:Point){return distance(p,pad)<PAD_RADIUS;}
export function doorOccupied(actors:readonly Point[],radius=ACTOR_RADIUS){
  return actors.some(p=>Math.abs(p.x-GATE.x)<radius+.22&&Math.abs(p.z-GATE.z)<GATE.halfWidth);
}
const inRect=(p:Point,r:Rect)=>p.x>=r.left&&p.x<=r.right&&p.z>=r.top&&p.z<=r.bottom;
function touchesRect(p:Point,r:Rect,radius:number){return inRect(p,r)||Math.hypot(p.x-clamp(p.x,r.left,r.right),p.z-clamp(p.z,r.top,r.bottom))<radius-1e-7;}
export function isWalkable(p:Point,doorOpen:number,radius=ACTOR_RADIUS){
  if(!GROUND_RECTS.some(r=>inRect(p,r)))return false;
  // The open far end is the visible stage edge, never a second locked door.
  if(p.x+radius>EXIT_ROUTE.end||MASONRY.some(r=>touchesRect(p,r,radius)))return false;
  if(planters.some(b=>distance(p,b)<b.radius+radius-1e-7))return false;
  return !touchesRect(p,doorRect(doorOpen),radius);
}
function clearSegment(from:Point,to:Point,open:number,radius=ACTOR_RADIUS){
  const n=Math.max(1,Math.ceil(distance(from,to)/.055));
  for(let i=1;i<=n;i++){const f=i/n;if(!isWalkable({x:from.x+(to.x-from.x)*f,z:from.z+(to.z-from.z)*f},open,radius))return false;}
  return true;
}
/** Continuous small steps prevent tunnelling from either side of a closed door. */
export function resolveMove(from:Point,to:Point,doorOpen:number,radius=ACTOR_RADIUS):Point{
  const n=Math.max(1,Math.ceil(distance(from,to)/.035)),dx=(to.x-from.x)/n,dz=(to.z-from.z)/n;let p={...from};
  for(let i=0;i<n;i++){
    const candidate={x:p.x+dx,z:p.z+dz};if(isWalkable(candidate,doorOpen,radius)){p=candidate;continue;}
    const xOnly={x:p.x+dx,z:p.z},zOnly={x:p.x,z:p.z+dz};
    if(Math.abs(dx)>Math.abs(dz))p=isWalkable(xOnly,doorOpen,radius)?xOnly:isWalkable(zOnly,doorOpen,radius)?zOnly:p;
    else p=isWalkable(zOnly,doorOpen,radius)?zOnly:isWalkable(xOnly,doorOpen,radius)?xOnly:p;
  }
  return p;
}
/** Check the complete steered ray, including corners and narrow obstacle gaps. */
function limitAlongRay(p:Point,desired:Point,doorOpen:number):Point{
  const speed=Math.hypot(desired.x,desired.z);if(speed<1e-8)return {...desired};
  const dir={x:desired.x/speed,z:desired.z/speed},horizon=Math.max(.45,speed*.45+speed*speed/12+.12);let clearance=horizon;
  for(let s=.025;s<=horizon;s+=.025)if(!isWalkable({x:p.x+dir.x*s,z:p.z+dir.z*s},doorOpen)){clearance=Math.max(0,s-.025);break;}
  if(clearance>=horizon)return {...desired};const limit=Math.min(speed,Math.sqrt(10*clearance),clearance*2);
  return {x:dir.x*limit,z:dir.z*limit};
}
/** Brake toward solid surfaces while retaining the player's along-wall motion. */
export function limitVelocity(p:Point,desired:Point,doorOpen:number):Point{
  if(Math.hypot(desired.x,desired.z)<1e-8)return {...desired};
  const contacts:{x:number;z:number;clearance:number}[]=[],margin=.025;
  for(const r of [...MASONRY,doorRect(doorOpen)]){
    const x=p.x-clamp(p.x,r.left,r.right),z=p.z-clamp(p.z,r.top,r.bottom),d=Math.hypot(x,z);
    if(d>1e-8)contacts.push({x:x/d,z:z/d,clearance:Math.max(0,d-ACTOR_RADIUS-margin)});
  }
  for(const q of planters){
    const x=p.x-q.x,z=p.z-q.z,d=Math.hypot(x,z);
    if(d>1e-8)contacts.push({x:x/d,z:z/d,clearance:Math.max(0,d-q.radius-ACTOR_RADIUS-margin)});
  }
  contacts.push({x:-1,z:0,clearance:Math.max(0,EXIT_ROUTE.end-p.x-ACTOR_RADIUS-margin)});
  const v={...desired};
  // Revisit contacts because one corner normal can restore motion into another.
  for(let pass=0;pass<3;pass++)for(const c of contacts){
    const closing=-(v.x*c.x+v.z*c.z);if(closing<=0)continue;
    const allowed=Math.min(closing,Math.sqrt(10*c.clearance),2*c.clearance);
    v.x+=c.x*(closing-allowed);v.z+=c.z*(closing-allowed);
  }
  // Keep the original anticipatory check: normals alone are insufficient at
  // narrow concave corners while the smooth locomotion still carries momentum.
  return limitAlongRay(p,v,doorOpen);
}
/** Only actual doorway occupancy can hold a closing leaf; it cannot open it. */
export function safeDoorStep(current:number,desired:number,actors:readonly Point[],dt:number){
  let target=clamp(desired,0,1);if(target<current&&doorOccupied(actors))target=current;
  const wanted=current+(target-current)*(1-Math.exp(-dt*DOOR_RATE));
  const n=Math.max(1,Math.ceil(Math.abs(wanted-current)*GATE.leafWidth/.008));let safe=current;
  for(let i=1;i<=n;i++){
    const next=current+(wanted-current)*i/n,leaf=doorLeaf(next),previousLeaf=doorLeaf(safe);
    if(actors.some(p=>{const after=pointSegmentDistance(p,leaf),before=pointSegmentDistance(p,previousLeaf);return after<ACTOR_RADIUS+GATE.leafThickness/2+.025&&after<before-1e-7;}))break;
    safe=next;
  }
  return safe;
}
const NAV:Point[]=[FRONT_MARK,{x:GATE.x-.65,z:GATE.z},{x:GATE.x+.65,z:GATE.z},{x:GATE.x-.65,z:near-.30},{x:GATE.x+.65,z:near-.30},INNER_PAD,OUTER_PAD,OUTSIDE_MARK,{x:8.9,z:GATE.z},DEPARTURE_MARK,
  {x:-5.55,z:-1.85},{x:-5.55,z:.65},{x:-8.05,z:.65},{x:-8.05,z:-1.85},{x:-6.8,z:1.05},{x:7.5,z:1.7},{x:9.5,z:1.7},{x:7.5,z:3.8}];
/** Route through the actual live opening; return the target while an open route is pending. */
export function waypoint(from:Point,target:Point,doorOpen=1):Point{
  if(clearSegment(from,target,doorOpen))return target;
  const nodes=[from,target,...NAV.filter(p=>isWalkable(p,doorOpen))],cost=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set<number>();cost[0]=0;
  for(let iteration=0;iteration<nodes.length;iteration++){
    let a=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(a<0||cost[i]<cost[a]))a=i;
    if(a<0||!Number.isFinite(cost[a])||a===1)break;done.add(a);
    for(let b=1;b<nodes.length;b++){if(done.has(b)||!clearSegment(nodes[a],nodes[b],doorOpen))continue;const next=cost[a]+distance(nodes[a],nodes[b]);if(next<cost[b]){cost[b]=next;previous[b]=a;}}
  }
  if(previous[1]<0){
    // Waiting on the near-side gate axis also avoids steering into the low wall.
    if((from.x-GATE.x)*(target.x-GATE.x)<0)return {x:GATE.x+(from.x<GATE.x?-.65:.65),z:GATE.z};
    return target;
  }
  let next=1;while(previous[next]>0)next=previous[next];return nodes[next];
}
