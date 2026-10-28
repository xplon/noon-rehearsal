import * as THREE from 'three';
import {ANIMATIONS,type Actor} from './engine.ts';
type BonePose={position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3};
export type Rig={root:THREE.Group,mixer:THREE.AnimationMixer,actions:Map<string,THREE.AnimationAction>,nodes:THREE.Object3D[];basePose?:BonePose[]};
export function poseRig(rig:Rig,a:Actor,phaseOffsets:Record<string,number>={},values?:Float32Array){
    rig.root.position.set(a.x,0,a.z);rig.root.rotation.y=a.yaw;
    if(values?.length===rig.nodes.length*10){
      rig.actions.forEach(action=>action.enabled=false);
      rig.nodes.forEach((node,i)=>{const j=i*10;node.position.fromArray(values,j);node.quaternion.fromArray(values,j+3);node.scale.fromArray(values,j+7);});
    }else{
      // AnimationMixer skips unchanged property writes. Restore the unmodified
      // mixed pose before updating it, so gaze and attachment never accumulate
      // across render calls (including the extra calls used to record a frame).
      rig.basePose?.forEach((p,i)=>{const n=rig.nodes[i];n.position.copy(p.position);n.quaternion.copy(p.quaternion);n.scale.copy(p.scale);});
      rig.actions.forEach(action=>{action.enabled=false;action.weight=0;});
      for(const name of ANIMATIONS){
        const action=rig.actions.get(name)||rig.actions.get(name==='struggle'?'look':'idle');
        if(!action||a.weights[name]<1e-6)continue;
        const duration=action.getClip().duration;
        const time=name==='walk'||name==='chase'?(a.gaitPhase+(phaseOffsets[name]||0))*duration:name.startsWith('pivot_')?a.pivotPhase*duration:a.clocks[name];
        action.enabled=true;action.weight+=a.weights[name];
        action.time=['bow','shrug','turn','sit','rise','look','surprise','reach'].includes(name)?Math.min(time,duration-1e-5):time%duration;
      }
      rig.mixer.update(0);
      if(!rig.basePose)rig.basePose=rig.nodes.map(n=>({position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()}));
      else rig.basePose.forEach((p,i)=>{const n=rig.nodes[i];p.position.copy(n.position);p.quaternion.copy(n.quaternion);p.scale.copy(n.scale);});
      // Add the recorded gaze after clip mixing, using world-up in each bone's parent frame.
      if(a.lookWeight>.001){
        rig.root.updateMatrixWorld(true);
        for(const [name,share] of [['chest',.28],['head',.72]] as const){
          const bone=rig.nodes.find(n=>n.name===name);if(!bone?.parent)continue;
          const inverse=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
          const axis=new THREE.Vector3(0,1,0).applyQuaternion(inverse);
          bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis,a.lookYaw*a.lookWeight*share));
          if(name==='head'){
            const right=new THREE.Vector3(Math.cos(a.yaw),0,-Math.sin(a.yaw)).applyQuaternion(inverse);
            bone.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(right,a.lookPitch*a.lookWeight));
          }
          bone.updateMatrixWorld(true);
        }
      }
    }
    rig.root.updateMatrixWorld(true);
  }
