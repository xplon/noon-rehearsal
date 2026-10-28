import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';

export interface BotanicalOptions {
  /** Plant height above the soil, in the parent's local units. */
  height?:number;
  seed?:number;
  rotation?:number;
  materialFor?:(color:number)=>THREE.Material;
}
export interface BotanicalInstance {
  /** Local origin is the stem/rosette base; place the parent at the pot's soil. */
  root:THREE.Group;
  /** Absolute scene time; repeated calls at the same time produce the same pose. */
  update:(time:number,wind?:number)=>void;
  dispose:()=>void;
}

let asset:Promise<GLTF>|undefined;
const assetUrl=`${import.meta.env.BASE_URL}assets/courtyard-plant.glb`;
function sourceAsset(){
  return asset??=new GLTFLoader().loadAsync(assetUrl).catch(error=>{asset=undefined;throw error;});
}

/** Add licensed foliage only. The caller retains ownership of its existing pot. */
export async function addBotanical(parent:THREE.Object3D,options:BotanicalOptions={}):Promise<BotanicalInstance>{
  const gltf=await sourceAsset();
  const root=new THREE.Group();root.name='Courtyard botanical';
  const original=gltf.scene.clone(true);original.updateMatrixWorld(true);
  const meshes:THREE.Mesh<THREE.BufferGeometry,THREE.Material|THREE.Material[]>[]=[];
  const materials=new Map<THREE.Material,THREE.Material>();
  const ownedMaterials=new Set<THREE.Material>();
  const material=(source:THREE.Material)=>{
    let value=materials.get(source);if(value)return value;
    const color=(source as THREE.MeshStandardMaterial).color?.getHex()??0x729a78;
    value=options.materialFor?.(color);
    if(!value){value=new THREE.MeshToonMaterial({color,toneMapped:false,side:THREE.DoubleSide});ownedMaterials.add(value);}
    // Factory materials are borrowed: keep their shader hooks, side and lifecycle.
    materials.set(source,value);return value;
  };
  original.traverse(node=>{
    if(!(node instanceof THREE.Mesh))return;
    const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);
    const source=node.material as THREE.Material|THREE.Material[];
    const mesh=new THREE.Mesh(geometry,Array.isArray(source)?source.map(material):material(source));
    mesh.name=node.name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);
  });
  if(!meshes.length)throw new Error('The botanical asset contains no meshes.');
  const bounds=new THREE.Box3().setFromObject(root);const nativeHeight=bounds.max.y-bounds.min.y;
  if(!(nativeHeight>0))throw new Error('The botanical asset has no measurable height.');
  // Keep the authored horizontal root position; asymmetric leaves must not recenter it.
  for(const mesh of meshes)mesh.geometry.translate(0,-bounds.min.y,0);
  root.scale.setScalar((options.height??1.8)/nativeHeight);
  root.rotation.y=options.rotation??(options.seed??0)*2.399963229728653;
  const phase=(options.seed??0)*1.618;
  const buffers=meshes.map(mesh=>{
    const position=mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setUsage(THREE.DynamicDrawUsage);
    const base=Float32Array.from(position.array);
    const weight=new Float32Array(position.count);
    for(let i=0;i<position.count;i++){
      const h=THREE.MathUtils.clamp(base[i*3+1]/nativeHeight,0,1);
      // The lower 8% is fixed, including every point touching the soil.
      const free=THREE.MathUtils.smoothstep(h,.08,.55);weight[i]=free*h*h;
    }
    mesh.geometry.computeBoundingBox();mesh.geometry.boundingBox!.expandByScalar(nativeHeight*.06);
    mesh.geometry.computeBoundingSphere();mesh.geometry.boundingSphere!.radius+=nativeHeight*.06;
    return {mesh,position,base,weight};
  });
  parent.add(root);let disposed=false;
  return {
    root,
    update(time,wind=0){
      if(disposed)return;
      const bias=THREE.MathUtils.clamp(wind,-.08,.08);
      const x=(Math.sin(time*.83+phase)*.017+Math.sin(time*1.37+phase*.7)*.006+bias*.24)*nativeHeight;
      const z=Math.sin(time*.61+phase+1.1)*.011*nativeHeight;
      for(const {mesh,position,base,weight} of buffers){
        for(let i=0;i<position.count;i++){
          const j=i*3,w=weight[i];
          const flutter=Math.sin(time*1.85+phase+base[j]*2.3+base[j+2]*1.7)*.002*nativeHeight*w;
          position.setXYZ(i,base[j]+x*w+flutter,base[j+1],base[j+2]+z*w);
        }
        position.needsUpdate=true;mesh.geometry.computeVertexNormals();
      }
    },
    dispose(){
      if(disposed)return;disposed=true;root.removeFromParent();
      for(const mesh of meshes)mesh.geometry.dispose();
      for(const value of ownedMaterials)value.dispose();
    }
  };
}
