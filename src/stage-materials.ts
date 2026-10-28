import * as THREE from 'three';

/** Scene swatches stay separate from the painted lighting ramp below. */
export const STAGE_COLORS={
  cream:0xfff0c9,paper:0xf5e8c9,sand:0xedbc4a,tile:0xf6cf65,
  coral:0xd9654c,lightCoral:0xed8764,darkCoral:0xa84142,
  ink:0x30334c,blue:0x374f9f,mint:0x92baa1,green:0x457e6e,leaf:0x729a78,
} as const;

export type StageSurfaceRole='environment'|'actor';
type PaintedRamp={occluded:number;shade:number;middle:number;light:number};

// Occlusion is a pigment choice, never a multiplication by black. The ground's
// warm umber shade remains distinct from the narrative ultramarine shadow.
const environmentRamps:Record<number,PaintedRamp>={
  [STAGE_COLORS.sand]:{occluded:0xa97958,shade:0xcd954c,middle:0xe8b547,light:0xf3c960},
  [STAGE_COLORS.tile]:{occluded:0xba8b61,shade:0xd4a052,middle:0xf0c767,light:0xfadd87},
  [STAGE_COLORS.coral]:{occluded:0x7d465b,shade:0xa9525b,middle:0xd46551,light:0xe9906c},
  [STAGE_COLORS.lightCoral]:{occluded:0x955369,shade:0xbc686b,middle:0xe68868,light:0xf2af84},
  [STAGE_COLORS.darkCoral]:{occluded:0x644357,shade:0x884653,middle:0xa84f53,light:0xc87565},
  [STAGE_COLORS.cream]:{occluded:0xaa8b7e,shade:0xcfb28e,middle:0xebd9af,light:0xfff0cb},
  [STAGE_COLORS.paper]:{occluded:0xb39782,shade:0xd2ba97,middle:0xebd9b7,light:0xf8ebcf},
  [STAGE_COLORS.ink]:{occluded:0x252940,shade:0x30334b,middle:0x40465b,light:0x5a6070},
  [STAGE_COLORS.blue]:{occluded:0x29376c,shade:0x334688,middle:0x435aab,light:0x6379bc},
  [STAGE_COLORS.mint]:{occluded:0x526f71,shade:0x6d9184,middle:0x95b59b,light:0xc0d0a9},
  [STAGE_COLORS.green]:{occluded:0x36575a,shade:0x436c62,middle:0x638976,light:0x8fa485},
  [STAGE_COLORS.leaf]:{occluded:0x455f60,shade:0x617f6b,middle:0x85a17a,light:0xacb98b},
};

// The rig's six source swatches. These ramps deliberately differ from the
// architecture: ivory should describe the body without becoming a white cutout.
const actorRamps:Record<number,PaintedRamp>={
  0xf1e2bc:{occluded:0x9c8b82,shade:0xbba98e,middle:0xe1cea5,light:0xffedc5},
  0xd96d53:{occluded:0x804d60,shade:0xab5962,middle:0xd2755b,light:0xec9a72},
  0x28344a:{occluded:0x252b40,shade:0x2d3549,middle:0x39465b,light:0x526276},
  0xac7954:{occluded:0x6f5351,shade:0x8d6553,middle:0xb0845d,light:0xd0a777},
  0xe9b27d:{occluded:0xa7756b,shade:0xc88f71,middle:0xe4b185,light:0xf6d29d},
  0xd9b571:{occluded:0x98795f,shade:0xb69263,middle:0xd9b875,light:0xf1d89a},
};

function rampFor(color:number,role:StageSurfaceRole):PaintedRamp{
  const selected=(role==='actor'?actorRamps[color]:undefined)??environmentRamps[color];
  if(selected)return selected;
  // For small prop swatches, retain hue while giving shade a restrained plum tint.
  const base=new THREE.Color(color);
  return {
    occluded:base.clone().multiplyScalar(.5).lerp(new THREE.Color(0x735568),.14).getHex(),
    shade:base.clone().multiplyScalar(.72).lerp(new THREE.Color(0x8a6570),.08).getHex(),
    middle:color,
    light:base.clone().lerp(new THREE.Color(0xffe8bb),.12).getHex(),
  };
}

const fragmentDeclarations=/* glsl */`
  varying vec3 vStageWorldPosition;
  uniform vec3 stageShade;
  uniform vec3 stageMiddle;
  uniform vec3 stageLight;
  uniform vec3 stageOccluded;
  uniform vec3 stageSunDirection;
  uniform float stageBandSoftness;
  uniform float stageCastShadeStrength;
  uniform float stageContactStrength;

  float stageBoxDistance(vec2 p,vec2 center,vec2 halfSize){
    vec2 d=abs(p-center)-halfSize;
    return length(max(d,0.0))+min(max(d.x,d.y),0.0);
  }
  float stageContactFalloff(float distance,float radius){
    float x=max(distance,0.0)/radius;
    return exp(-x*x*3.0);
  }
  float stageFloorContact(vec3 position,vec3 worldNormal){
    // A handful of known, fixed contacts, not screen-space AO. Only the courtyard
    // floor can receive this field; roofs and the rig are explicitly excluded.
    float floorMask=(1.0-smoothstep(.035,.13,abs(position.y)))
      *smoothstep(.75,.96,worldNormal.y);
    if(floorMask<.001)return 0.0;
    vec2 p=position.xz;
    float contact=0.0;
    // Individual arcade piers preserve light passing through the arch openings.
    for(int i=0;i<5;i++){
      float center=-8.2+float(i)*4.1;
      contact=max(contact,stageContactFalloff(stageBoxDistance(p,vec2(center-1.55,-5.85),vec2(.275,.575)),.35));
      contact=max(contact,stageContactFalloff(stageBoxDistance(p,vec2(center+1.55,-5.85),vec2(.275,.575)),.35));
    }
    contact=max(contact,stageContactFalloff(length(p-vec2(-5.8,.1))-.48,.36));
    contact=max(contact,stageContactFalloff(length(p-vec2(6.9,-4.8))-.312,.27));
    contact=max(contact,stageContactFalloff(stageBoxDistance(p,vec2(-7.4,-3.5),vec2(.125,.275)),.28));
    contact=max(contact,stageContactFalloff(stageBoxDistance(p,vec2(-5.8,-3.5),vec2(.125,.275)),.28));
    contact=max(contact,stageContactFalloff(length(p-vec2(8.35,-3.5))-.3,.27));
    return floorMask*contact;
  }
`;

/**
 * Painted three-band surfaces with independent real shadow-map visibility.
 * Intended for this fixed, sunlit stage and its skinned, solid-color actor.
 * Shares Three's deformation, normal, alpha, depth and shadow-map machinery.
 */
export function createStageMaterial(color:number,role:StageSurfaceRole='environment'):THREE.MeshToonMaterial{
  const ramp=rampFor(color,role);
  const material=new THREE.MeshToonMaterial({color,toneMapped:false});
  material.name=`Painted ${role} ${color.toString(16).padStart(6,'0')}`;
  material.userData.stageSurface={role,ramp};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{
      stageShade:{value:new THREE.Color(ramp.shade)},
      stageMiddle:{value:new THREE.Color(ramp.middle)},
      stageLight:{value:new THREE.Color(ramp.light)},
      stageOccluded:{value:new THREE.Color(ramp.occluded)},
      stageSunDirection:{value:new THREE.Vector3(-10,16,-8).normalize()},
      stageBandSoftness:{value:role==='actor'?.17:.075},
      stageCastShadeStrength:{value:role==='actor'?.58:.76},
      stageContactStrength:{value:role==='actor'?0:.22},
    });
    shader.vertexShader=`varying vec3 vStageWorldPosition;\n${shader.vertexShader}`;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',/* glsl */`
      #include <worldpos_vertex>
      vec4 stageWorld=vec4(transformed,1.0);
      #ifdef USE_BATCHING
        stageWorld=batchingMatrix*stageWorld;
      #endif
      #ifdef USE_INSTANCING
        stageWorld=instanceMatrix*stageWorld;
      #endif
      vStageWorldPosition=(modelMatrix*stageWorld).xyz;
    `);
    shader.fragmentShader=fragmentDeclarations+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',/* glsl */`
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',/* glsl */`
      vec3 stageNormal=normalize(inverseTransformDirection(normal,viewMatrix));
      // A small warm sky bounce distinguishes the visible front/side elevations.
      // Light intensity cannot collapse the whole courtyard into one color band.
      vec3 stageFillDirection=normalize(vec3(.45,.35,1.0));
      float stageKeyFacing=dot(stageNormal,stageSunDirection);
      float stageIllumination=clamp(.5+.5*stageKeyFacing
        +.12*max(dot(stageNormal,stageFillDirection),0.0),0.0,1.0);
      float stageFeather=max(stageBandSoftness,fwidth(stageIllumination)*1.25);
      float stageMiddleBand=smoothstep(.34-stageFeather,.34+stageFeather,stageIllumination);
      float stageLightBand=smoothstep(.73-stageFeather,.73+stageFeather,stageIllumination);
      vec3 stagePaint=mix(stageShade,stageMiddle,stageMiddleBand);
      stagePaint=mix(stagePaint,stageLight,stageLightBand);
      float stageVisibility=getShadowMask();
      // Back-facing walls already have a painted shade. Do not apply a second
      // full self-shadow to those faces and turn the entire elevation purple.
      float stageKeyWeight=.18+.82*smoothstep(-.1,.35,stageKeyFacing);
      stagePaint=mix(stagePaint,stageOccluded,(1.0-stageVisibility)*stageCastShadeStrength*stageKeyWeight);
      float stageContact=0.0;
      if(stageContactStrength>0.0){
        stageContact=stageContactStrength*stageFloorContact(vStageWorldPosition,stageNormal);
      }
      stagePaint=mix(stagePaint,stageOccluded,stageContact);
      outgoingLight=stagePaint+totalEmissiveRadiance;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=>`noon-painted-stage-v1-${role}`;
  return material;
}
