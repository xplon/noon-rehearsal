import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

/** One occlusion-aware silhouette for the whole actor, independent of material seams. */
export function createInkPipeline(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,exclude:THREE.Object3D[],ink:number){
  const target=new THREE.WebGLRenderTarget(1,1,{samples:4});
  const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
  const outline=new OutlinePass(new THREE.Vector2(1,1),scene,camera);
  outline.downSampleRatio=1;outline.edgeStrength=2.6;outline.edgeThickness=.8*renderer.getPixelRatio();outline.edgeGlow=0;outline.pulsePeriod=0;
  outline.visibleEdgeColor.setRGB(1,1,1);outline.hiddenEdgeColor.setRGB(0,0,0);
  outline.overlayMaterial.blending=THREE.NormalBlending;
  outline.overlayMaterial.uniforms.inkColor={value:new THREE.Color(ink)};
  outline.overlayMaterial.fragmentShader=`varying vec2 vUv;
    uniform sampler2D maskTexture; uniform sampler2D edgeTexture1; uniform float edgeStrength; uniform vec3 inkColor;
    void main(){
      vec4 mask=texture2D(maskTexture,vUv);
      float edge=texture2D(edgeTexture1,vUv).r;
      float alpha=clamp(edgeStrength*mask.r*edge,0.0,.82);
      gl_FragColor=vec4(inkColor,alpha);
    }`;
  // Ground-projected shadow meshes are shader projections, not solid 3D occluders.
  const render=outline.render.bind(outline);
  outline.render=(...args)=>{const visible=exclude.map(o=>o.visible);exclude.forEach(o=>o.visible=false);try{render(...args);}finally{exclude.forEach((o,i)=>o.visible=visible[i]);}};
  composer.addPass(outline);composer.addPass(new OutputPass());
  return {composer,outline};
}
