/** Offline runtime validation of the shipped plant and its actual TypeScript module. */
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {createServer} from 'node:http';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as THREE from 'three';

const project=new URL('../',import.meta.url);
const asset=await readFile(new URL('public/assets/courtyard-plant.glb',project));
const manifest=JSON.parse(await readFile(new URL('public/assets/courtyard-plant-manifest.json',project),'utf8'));
assert.equal(createHash('sha256').update(asset).digest('hex'),manifest.sha256);
const server=createServer((_request,response)=>{response.setHeader('Content-Type','model/gltf-binary');response.end(asset);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/`;
globalThis.ProgressEvent??=class {constructor(type,values){this.type=type;Object.assign(this,values);}};
const temporary=new URL(`.botanical-check-${process.pid}.mjs`,import.meta.url);
try {
  const source=(await readFile(new URL('src/botanical-assets.ts',project),'utf8')).replace('import.meta.env.BASE_URL',JSON.stringify(base));
  await writeFile(temporary,stripTypeScriptTypes(source,{mode:'strip'}));
  const {addBotanical}=await import(pathToFileURL(fileURLToPath(temporary)));
  const parent=new THREE.Group();parent.position.set(3,.87,-2);
  const borrowed=new THREE.MeshToonMaterial({color:0x648c6b,side:THREE.DoubleSide});
  const shaderHook=()=>{};borrowed.onBeforeCompile=shaderHook;
  let borrowedDisposals=0;borrowed.addEventListener('dispose',()=>borrowedDisposals++);
  const plant=await addBotanical(parent,{height:1.8,seed:4,materialFor:()=>borrowed});
  const meshes=plant.root.children.filter(node=>node.isMesh);
  const original=meshes.map(mesh=>Float32Array.from(mesh.geometry.getAttribute('position').array));
  const rootTransform=[...plant.root.position,...plant.root.quaternion,...plant.root.scale];
  const nativeHeight=Math.max(...original.flatMap(a=>Array.from(a).filter((_,i)=>i%3===1)));
  let pinnedVertices=0,maxPinnedDisplacement=0,maxTipDisplacement=0,maxDisplacement=0;
  for(const mesh of meshes){assert.equal(mesh.material,borrowed);assert(mesh.castShadow);assert(mesh.receiveShadow);}
  assert.equal(borrowed.onBeforeCompile,shaderHook);
  for(let frame=0;frame<=240;frame++){
    plant.update(frame/20,Math.sin(frame*.03)*.08);
    assert.deepEqual([...plant.root.position,...plant.root.quaternion,...plant.root.scale],rootTransform);
    for(let m=0;m<meshes.length;m++){
      const position=meshes[m].geometry.getAttribute('position').array;
      const normal=meshes[m].geometry.getAttribute('normal').array;
      assert(Array.from(position).every(Number.isFinite));assert(Array.from(normal).every(Number.isFinite));
      for(let j=0;j<position.length;j+=3){
        const delta=Math.hypot(position[j]-original[m][j],position[j+1]-original[m][j+1],position[j+2]-original[m][j+2]);
        maxDisplacement=Math.max(maxDisplacement,delta);
        if(original[m][j+1]<=nativeHeight*.08){maxPinnedDisplacement=Math.max(maxPinnedDisplacement,delta);if(frame===0)pinnedVertices++;}
        if(original[m][j+1]>nativeHeight*.9)maxTipDisplacement=Math.max(maxTipDisplacement,delta);
      }
    }
  }
  assert(pinnedVertices>0);assert.equal(maxPinnedDisplacement,0);assert(maxTipDisplacement>.005);
  plant.update(3.25,.03);const reference=meshes.map(mesh=>Float32Array.from(mesh.geometry.getAttribute('position').array));
  plant.update(11.9,-.06);plant.update(3.25,.03);
  for(let m=0;m<meshes.length;m++)assert.deepEqual(meshes[m].geometry.getAttribute('position').array,reference[m]);
  let geometryDisposals=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>geometryDisposals++);
  const scale=plant.root.scale.y;plant.dispose();plant.dispose();
  assert.equal(parent.children.length,0);assert.equal(geometryDisposals,meshes.length);assert.equal(borrowedDisposals,0);
  const defaultPlant=await addBotanical(parent);const ownMaterials=new Set(defaultPlant.root.children.flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]));
  let ownDisposals=0;for(const material of ownMaterials)material.addEventListener('dispose',()=>ownDisposals++);
  defaultPlant.dispose();assert.equal(ownDisposals,ownMaterials.size);
  const result={assetSha256:manifest.sha256,frames:241,seconds:12,meshCount:meshes.length,pinnedVertices,maxPinnedDisplacement,maxTipDisplacementNative:maxTipDisplacement,maxTipDisplacementAtHeight1_8:maxTipDisplacement*scale,maxDisplacementNative:maxDisplacement,finitePositionsAndNormals:true,absoluteTimeDeterministic:true,rootTransformUnchanged:true,borrowedShaderHookPreserved:true,borrowedMaterialDisposals:borrowedDisposals,ownedMaterialDisposals:ownDisposals,geometryDisposals};
  await writeFile(new URL('assets-src/vendor/kenney-botanical/runtime-validation.json',project),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));borrowed.dispose();
} finally {
  await unlink(temporary).catch(()=>{});await new Promise(resolve=>server.close(resolve));
}
