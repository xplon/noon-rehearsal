import * as THREE from 'three';

/** Geometric assets only. The director and the playable floor remain elsewhere. */
export type CourtyardBuilder = {
  stage: THREE.Group;
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,outline?:boolean,parent?:THREE.Object3D):THREE.Mesh;
  mesh(geometry:THREE.BufferGeometry,color:number,outline?:boolean,parent?:THREE.Object3D):THREE.Mesh;
  cylinder(x:number,y:number,z:number,top:number,bottom:number,h:number,color:number,segments?:number,parent?:THREE.Object3D):THREE.Mesh;
};
export type CourtyardColors = {cream:number;coral:number;lightCoral:number;darkCoral:number;ink:number;mint:number;green:number};

/**
 * Call after the original arcade and tower bodies, before collecting framing bounds.
 * Replaces the old solid roof cap, floating stair blocks and left-tower window;
 * see docs/COURTYARD.md for the four original snippets to remove.
 */
export function buildCourtyardDetails(b:CourtyardBuilder,C:CourtyardColors){
  const detail=new THREE.Group();detail.name='Courtyard architectural completion';b.stage.add(detail);
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,parent:THREE.Object3D=detail)=>b.box(x,y,z,w,h,d,color,false,parent);
  const beam=(a:THREE.Vector3,z:THREE.Vector3,width:number,depth:number,color:number,parent:THREE.Object3D=detail)=>{
    const direction=z.clone().sub(a),m=box(0,0,0,direction.length(),width,depth,color,parent);
    m.position.copy(a).add(z).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),direction.normalize());return m;
  };
  const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);

  // The towers have continuous load-bearing walls down to the rear footing.
  // Their previous upper boxes began above the arcade; only these lower volumes
  // and a narrow rear footing are added, without widening the playable courtyard.
  box(0,-.29,-8.47,21.7,.58,1.94,C.darkCoral);
  box(0,-.66,-8.50,22,.16,1.88,C.darkCoral);
  box(0,.025,-8.46,21.7,.05,1.93,C.lightCoral);
  box(-6.8,2.3,-7.8,4.2,4.6,3.1,C.coral);
  box(8,2.55,-7.6,2.8,5.1,3,C.lightCoral);
  box(0,2.415,-9.28,21,4.83,.24,C.darkCoral);
  for(const x of [-10.39,10.39])box(x,2.415,-7.81,.22,4.83,3.10,C.coral);
  // A continuous upper floor carries the stairs, both towers and the roof walk.
  box(0,4.91,-7.32,21,.16,3.86,C.coral);
  box(0,5.15,-9.27,20.9,.34,.22,C.coral);
  box(0,5.34,-9.27,21.04,.07,.30,C.lightCoral);
  // Reveal joints at each tower base and the upper storey of the right tower.
  for(const [x,y,z,w,d] of [[-6.8,4.99,-7.8,4.32,3.2],[8,5.05,-7.6,2.94,3.12],[8,7.28,-7.6,2.94,3.12]]){
    box(x,y,z,w,.12,d,C.lightCoral);
  }

  // Flat roofs have inset surfaces, complete perimeter coping and drains.
  const roof=(x:number,z:number,w:number,d:number,floorY:number,topY:number)=>{
    const wall=.14,wallHeight=topY-floorY;
    box(x,floorY-.045,z,w,.09,d,C.darkCoral);
    for(const side of [-1,1]){
      box(x+side*(w-wall)/2,floorY+wallHeight/2,z,wall,wallHeight,d,C.coral);
      box(x+side*(w-wall)/2,topY-.025,z,wall+.08,.05,d+.06,C.lightCoral);
      box(x,floorY+wallHeight/2,z+side*(d-wall)/2,w-wall*2,wallHeight,wall,C.coral);
      box(x,topY-.025,z+side*(d-wall)/2,w-wall*2,.05,wall+.08,C.lightCoral);
    }
    // Quiet roof seams: shallow bands, not a wireframe over every polygon.
    for(const dx of [-.55,.55])box(x+dx,floorY+.002,z,.018,.008,d-.35,C.coral);
  };
  roof(-6.8,-7.8,4.12,2.96,8.60,8.975);
  // The right tower's roof stays below its established 9.76 silhouette.
  box(8,9.56,-7.6,3.13,.08,3.27,C.coral);
  roof(8,-7.6,2.95,3.10,9.61,9.76);
  box(-7.40,8.625,-8.15,.62,.05,.77,C.lightCoral); // low roof hatch
  box(-7.40,8.657,-8.15,.48,.015,.63,C.darkCoral);
  box(8.64,9.64,-8.32,.40,.06,.45,C.lightCoral); // low ventilation cap
  for(const dz of [-.1,.1])box(8.64,9.674,-8.32+dz,.27,.008,.03,C.darkCoral);

  const drain=(x:number,z:number,top:number,bottom:number)=>{
    const pipe=b.cylinder(x,(top+bottom)/2,z,.045,.045,top-bottom,C.darkCoral,8,detail);pipe.name='Terracotta rainwater pipe';
    for(const y of [bottom+.28,(top+bottom)/2,top-.30])box(x,y,z,.13,.07,.13,C.lightCoral);
    box(x,top,z-.11,.16,.10,.35,C.lightCoral);
    box(x,bottom,z+.10,.12,.10,.30,C.darkCoral);
  };
  drain(-4.63,-6.48,8.64,4.96);drain(9.46,-8.83,9.62,.13);

  // Complete arched openings, each with a recessed colored panel, continuous
  // thin masonry surround, reveal and projecting sill. The rear wall behind
  // each panel stays closed: these are architectural reliefs, not gameplay holes.
  const opening=(x:number,y:number,z:number,w:number,h:number,yaw:number,panel:number,door=false)=>{
    const g=new THREE.Group();g.name=door?'Upper terrace doorway':'Tower window';g.position.set(x,y,z);g.rotation.y=yaw;detail.add(g);
    const r=w/2,spring=h-r,t=.10;
    const pane=new THREE.Shape();pane.moveTo(-r,0);pane.lineTo(r,0);pane.lineTo(r,spring);pane.absarc(0,spring,r,0,Math.PI,false);pane.closePath();
    b.mesh(new THREE.ExtrudeGeometry(pane,{depth:.028,bevelEnabled:false,curveSegments:12}),panel,false,g);
    box(-r-t/2,spring/2,.065,t,spring,.13,C.cream,g);box(r+t/2,spring/2,.065,t,spring,.13,C.cream,g);
    const curve=new THREE.Shape();curve.absarc(0,spring,r+t,0,Math.PI,false);curve.lineTo(-r,spring);curve.absarc(0,spring,r,Math.PI,0,true);curve.closePath();
    b.mesh(new THREE.ExtrudeGeometry(curve,{depth:.13,bevelEnabled:false,curveSegments:12}),C.cream,false,g);
    box(0,.015,.12,w+.32,.10,.39,C.lightCoral,g);
    box(0,spring*.48,.048,.035,spring*.96,.038,door?C.mint:C.lightCoral,g);
    if(door){
      for(const dx of [-w*.24,w*.24])box(dx,spring*.48,.042,.014,spring*.92,.02,C.mint,g);
      box(w*.20,spring*.48,.08,.055,.07,.035,C.cream,g);
    }else{
      box(0,spring*.55,.051,w-.035,.04,.045,C.lightCoral,g);
      // Lower shutter boards leave a dark upper fanlight, without a black void.
      box(-w*.255,spring*.24,.056,w*.43,spring*.42,.045,C.mint,g);
      box(w*.255,spring*.24,.056,w*.43,spring*.42,.045,C.green,g);
    }
    return g;
  };
  opening(-6.8,5.68,-6.232,.92,1.63,0,C.darkCoral);
  opening(-4.682,5.83,-7.72,.74,1.48,Math.PI/2,C.darkCoral);
  opening(8,7.43,-6.082,.86,1.72,0,C.green,true);
  opening(8,5.48,-6.082,.66,1.25,0,C.darkCoral);
  opening(9.418,6.02,-7.76,.76,1.48,Math.PI/2,C.darkCoral);
  // Narrow upper ventilation slots on the right side, below the roof cornice.
  for(const z of [-8.12,-7.67,-7.22]){
    box(9.421,8.82,z,.034,.35,.12,C.darkCoral);
    box(9.445,8.58,z,.13,.07,.21,C.lightCoral);
  }

  // Eight solid steps terminate in a landing in front of the right tower door.
  // A closed inclined support fills the old floating undersides. It is inset
  // from the risers so that front faces do not share a coplanar surface.
  const stairStart=2.30,run=.56,base=4.99,firstTop=5.31,rise=.30,depth=.80,z=-5.72;
  const side=new THREE.Shape();side.moveTo(stairStart-run/2,base);side.lineTo(6.50,base);side.lineTo(6.50,7.39);side.lineTo(stairStart-run/2,base+.02);side.closePath();
  const underside=b.mesh(new THREE.ExtrudeGeometry(side,{depth:depth-.10,bevelEnabled:false}),C.coral,false,detail);underside.position.z=z-(depth-.10)/2;underside.name='Closed stair support';
  for(let i=0;i<8;i++){
    const x=stairStart+i*run,top=firstTop+i*rise;
    box(x,top-.16,z,.56,.32,depth,C.coral);
    box(x,top+.012,z,.58,.035,depth+.035,C.lightCoral);
    if(i%2===0||i===7)for(const edge of [-1,1])box(x,top+.28,z+edge*(depth/2+.015),.085,.52,.085,C.coral);
  }
  for(const edge of [-1,1])beam(V(stairStart,firstTop+.55,z+edge*.415),V(6.22,7.41+.55,z+edge*.415),.09,.12,C.lightCoral);
  box(7.55,7.28,-5.70,2.10,.26,.84,C.coral);
  box(7.55,7.425,-5.70,2.16,.035,.88,C.lightCoral);
  // Corbels visibly anchor the projecting landing to the tower wall.
  for(const x of [6.82,8.38])beam(V(x,6.62,-6.04),V(x,7.22,-5.34),.14,.17,C.darkCoral);
  for(const x of [6.55,7.55,8.55])box(x,7.69,-5.24,.085,.52,.085,C.coral);
  box(7.55,7.98,-5.24,2.12,.09,.12,C.lightCoral);
  beam(V(6.22,7.96,z+.415),V(6.55,7.98,-5.24),.09,.12,C.lightCoral);
  beam(V(6.22,7.96,z-.415),V(6.50,7.98,-6.12),.09,.12,C.lightCoral);
  box(8.59,7.69,-5.70,.085,.52,.84,C.coral);
  box(8.59,7.98,-5.70,.12,.09,.9,C.lightCoral);

  // A few structural seams on otherwise quiet plaster planes.
  for(const x of [-8.72,-4.88])box(x,6.50,-6.228,.045,3.30,.036,C.lightCoral);
  for(const y of [5.45,8.12])box(-6.8,y,-6.218,3.76,.045,.045,C.lightCoral);
  // Small paired scuppers along the arcade roof edge; the existing front lintel
  // stays uninterrupted, preserving its broad graphic silhouette.
  for(const x of [-1.9,1.9])box(x,4.79,-5.10,.18,.14,.36,C.lightCoral);

  return detail;
}
