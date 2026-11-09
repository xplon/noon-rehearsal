import * as THREE from 'three';
import {WORLD_BOUNDS as B} from './space';

export type CourtyardBuilder={
  stage:THREE.Group;
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,outline?:boolean,parent?:THREE.Object3D):THREE.Mesh;
  mesh(geometry:THREE.BufferGeometry,color:number,outline?:boolean,parent?:THREE.Object3D):THREE.Mesh;
  cylinder(x:number,y:number,z:number,top:number,bottom:number,h:number,color:number,segments?:number,parent?:THREE.Object3D):THREE.Mesh;
};
export type CourtyardColors={cream:number;coral:number;lightCoral:number;darkCoral:number;ink:number;mint:number;green:number};

/** Compact inhabited elevations frame the two usable courts, never false exits. */
export function buildCourtyardDetails(b:CourtyardBuilder,C:CourtyardColors){
  const detail=new THREE.Group();detail.name='Shuttered arcade and inhabited roof terrace';b.stage.add(detail);
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,parent:THREE.Object3D=detail)=>b.box(x,y,z,w,h,d,color,false,parent);
  // The slim rear foundation is visibly outside the continuous courtyard wall.
  box(.5,-.24,-4.89,19.65,.48,1.10,C.darkCoral);
  box(.5,1.40,-5.02,19.3,2.8,1.0,C.coral);
  box(.5,2.84,-5.02,19.45,.12,1.15,C.lightCoral);
  const roof=(x:number,z:number,w:number,d:number,y:number)=>{
    box(x,y,z,w,.12,d,C.lightCoral);box(x,y+.09,z,w-.16,.06,d-.16,C.darkCoral);
    for(const sign of [-1,1]){
      box(x+sign*(w-.12)/2,y+.23,z,.12,.32,d,C.coral);
      box(x,y+.23,z+sign*(d-.12)/2,w-.24,.32,.12,C.coral);
      box(x+sign*(w-.12)/2,y+.41,z,.18,.05,d+.04,C.cream);
      box(x,y+.41,z+sign*(d-.12)/2,w-.24,.05,.18,C.cream);
    }
  };
  // Modest unequal towers preserve the coral silhouette without shrinking actors.
  box(-7.0,2.2,-5.05,2.6,4.4,1.16,C.coral);roof(-7,-5.05,2.82,1.32,4.4);
  box(6.8,1.9,-5.02,2.2,3.8,1.1,C.lightCoral);roof(6.8,-5.02,2.40,1.28,3.8);
  const window=(x:number,y:number,w:number,h:number,panel:number)=>{
    const z=y>=2.7?-4.465:B.top+.008,g=new THREE.Group();g.name='Raised shuttered arch with solid backing';g.position.set(x,y,z);detail.add(g);
    const r=w/2,spring=h-r,t=.095;
    const shape=new THREE.Shape();shape.moveTo(-r,0);shape.lineTo(r,0);shape.lineTo(r,spring);shape.absarc(0,spring,r,0,Math.PI,false);shape.closePath();
    b.mesh(new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:false,curveSegments:18}),panel,false,g);
    box(-r-t/2,spring/2,.055,t,spring,.11,C.cream,g);box(r+t/2,spring/2,.055,t,spring,.11,C.cream,g);
    const surround=new THREE.Shape();surround.absarc(0,spring,r+t,0,Math.PI,false);surround.lineTo(-r,spring);surround.absarc(0,spring,r,Math.PI,0,true);surround.closePath();
    b.mesh(new THREE.ExtrudeGeometry(surround,{depth:.11,bevelEnabled:false,curveSegments:18}),C.cream,false,g);
    box(0,-.02,.10,w+.32,.12,.34,C.lightCoral,g);
    // Closed shutters and a continuous sill remove any apparent walking route.
    for(const side of [-1,1]){
      box(side*w*.255,spring*.44,.047,w*.47,spring*.86,.045,side<0?C.mint:C.green,g);
      for(let i=0;i<4;i++)box(side*w*.255,.10+i*spring*.18,.076,w*.40,.028,.015,C.cream,g);
    }
    box(0,spring*.48,.082,.035,spring*.95,.025,C.darkCoral,g);
  };
  for(const x of [-7,-3.5,-.5,4.0,6.8,9])window(x,.83,1.02,1.38,C.darkCoral);
  window(-7,3.02,.72,.99,C.green);window(6.8,2.72,.60,.72,C.darkCoral);
  // Small vents, drainpipes and horizontal plaster joints supply readable scale.
  for(const [x,top] of [[-8.25,4.45],[7.88,3.85]]){
    const pipe=b.cylinder(x,top/2,-4.36,.035,.035,top-.14,C.darkCoral,8,detail);pipe.name='Terracotta drain';
    for(const y of [.3,1.6,top-.35])box(x,y,-4.33,.12,.065,.10,C.cream);
  }
  for(const x of [-8.3,-5.7,5.7,7.9])box(x,2.13,-4.42,.045,1.10,.035,C.lightCoral);
  for(const [x,w,y] of [[-7,2.65,2.78],[6.8,2.24,2.40]])box(x,y,-4.42,w,.07,.08,C.cream);
  // A real raised shelf with pots sits behind the wall, away from playable feet.
  box(-1.4,2.91,-4.88,3.7,.12,.65,C.coral);
  for(const x of [-2.2,-.65]){
    b.cylinder(x,3.08,-4.88,.15,.11,.26,C.lightCoral,12,detail);
    const foliage=b.mesh(new THREE.IcosahedronGeometry(.21,1),C.green,false,detail);foliage.position.set(x,3.29,-4.88);foliage.scale.set(1,1.25,.8);
  }
  return detail;
}
