import type * as THREE from 'three';
import {SHADOW_SLOPE,SHADOW_HEIGHT} from './lighting.ts';
import {WALLS,GROUND_RECTS,doorRect,GATE,type Point,type Rect} from './space.ts';

/** Ground-only theatre projection. Every fragment tests the path from its foot. */
export function segmentHitsRect(from:Point,to:Point,r:Rect){
  let enter=0,leave=1;
  for(const [a,d,low,high] of [[from.x,to.x-from.x,r.left,r.right],[from.z,to.z-from.z,r.top,r.bottom]]){
    if(Math.abs(d)<1e-9){if(a<low||a>high)return false;continue;}
    const first=(low-a)/d,last=(high-a)/d;enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));
    if(leave<enter)return false;
  }
  return leave>=Math.max(enter,.0001)&&enter<.9999;
}
export function shadowReaches(foot:Point,pixel:Point,open:number){
  if(!GROUND_RECTS.some(r=>pixel.x>=r.left&&pixel.x<=r.right&&pixel.z>=r.top&&pixel.z<=r.bottom))return false;
  return ![...WALLS,doorRect(open)].some(r=>segmentHitsRect(foot,pixel,r));
}
const gl=(v:number)=>Number.isInteger(v)?`${v}.0`:String(v);
const rectangle=(r:Rect)=>`vec4(${[r.left,r.top,r.right,r.bottom].map(gl).join(',')})`;
export const projectionFragment=/* glsl */`
  varying vec2 vProjectedGround;
  uniform vec2 projectionFoot;
  uniform float projectionDoorOpen;
  bool projectionRectHit(vec2 a,vec2 b,vec4 rect){
    vec2 d=b-a;
    if(abs(d.x)<.000001&&(a.x<rect.x||a.x>rect.z))return false;
    if(abs(d.y)<.000001&&(a.y<rect.y||a.y>rect.w))return false;
    vec2 safeD=vec2(abs(d.x)<.000001?.000001:d.x,abs(d.y)<.000001?.000001:d.y);
    vec2 first=(rect.xy-a)/safeD,last=(rect.zw-a)/safeD;
    vec2 lo=min(first,last),hi=max(first,last);
    float enter=max(max(lo.x,lo.y),0.0),leave=min(min(hi.x,hi.y),1.0);
    return leave>=max(enter,.0001)&&enter<.9999;
  }
  bool projectionOnGround(vec2 p){return ${GROUND_RECTS.map(r=>`(p.x>=${gl(r.left)}&&p.x<=${gl(r.right)}&&p.y>=${gl(r.top)}&&p.y<=${gl(r.bottom)})`).join('||')};}
  bool projectionBlocked(vec2 p){
    ${WALLS.map(r=>`if(projectionRectHit(projectionFoot,p,${rectangle(r)}))return true;`).join('\n')}
    float slide=${gl(GATE.leafWidth)}*clamp(projectionDoorOpen,0.0,1.0);
    return projectionRectHit(projectionFoot,p,vec4(${gl(GATE.x-GATE.leafThickness/2)},${gl(GATE.z-GATE.halfWidth)}-slide,${gl(GATE.x+GATE.leafThickness/2)},${gl(GATE.z+GATE.halfWidth)}-slide));
  }
`;
export function installGroundProjection(material:THREE.MeshBasicMaterial,foot:{value:THREE.Vector2},door:{value:number}){
  material.onBeforeCompile=shader=>{
    shader.uniforms.projectionFoot=foot;shader.uniforms.projectionDoorOpen=door;
    shader.vertexShader=`varying vec2 vProjectedGround;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',/* glsl */`
      vec4 projectedWorld=modelMatrix*vec4(transformed,1.0);
      projectedWorld.x+=projectedWorld.y*${SHADOW_SLOPE.x};
      projectedWorld.z+=projectedWorld.y*${SHADOW_SLOPE.z};
      projectedWorld.y=${SHADOW_HEIGHT};
      vProjectedGround=projectedWorld.xz;
      vec4 mvPosition=viewMatrix*projectedWorld;
      gl_Position=projectionMatrix*mvPosition;
    `);
    shader.fragmentShader=projectionFragment+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',/* glsl */`
      #include <clipping_planes_fragment>
      if(!projectionOnGround(vProjectedGround)||projectionBlocked(vProjectedGround))discard;
    `);
  };
  material.customProgramCacheKey=()=> 'two-court-foot-projection-v3';
}
