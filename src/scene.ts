import * as THREE from 'three';
import {buildCourtyardDetails} from './courtyard-detail';
import {STAGE_COLORS as C,createStageMaterial,type StageSurfaceRole} from './stage-materials';
import {createInkPipeline} from './ink-outline';
import {courtyardMotion} from './environment-motion';
import {addBotanical,type BotanicalInstance} from './botanical-assets';
import {SUN} from './lighting';
import {installGroundProjection} from './ground-projection';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { BOW, HOME, EXIT, type Frame, type Visual, type Vec } from './engine';
import {GATE,WORLD_BOUNDS as B,EXIT_ROUTE,INNER_PAD,OUTER_PAD,PAD_RADIUS,PLANT_MARK,SECOND_PLANT,BENCH} from './space';


import {poseRig,type Rig} from './rig-pose';
const GATE_HEIGHT=3.35;
export class StageScene {
  renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera:THREE.OrthographicCamera;
  ink:ReturnType<typeof createInkPipeline>;outlineExclusions:THREE.Object3D[]=[];
  plantHosts:{node:THREE.Group;seed:number}[]=[];botanicals:BotanicalInstance[]=[];doorSlide=new THREE.Group();counterweight=new THREE.Group();signHinge=new THREE.Group();padFaces:THREE.Mesh<THREE.CylinderGeometry,THREE.MeshBasicMaterial>[]=[];controlRing:THREE.Mesh|null=null;lastShadowUpdate=-1;
  projectionFoot={value:new THREE.Vector2()};projectionDoor={value:0};
  stage=new THREE.Group(); actors=new THREE.Group(); body:Rig|null=null; shadow:Rig|null=null;
  clips:THREE.AnimationClip[]=[]; materialCache=new Map<string,THREE.MeshToonMaterial>();
  homeRing:THREE.Mesh; exitRing:THREE.Mesh; bowRing:THREE.Mesh;
  door:THREE.Group; flags:THREE.Mesh[]=[]; overlay=new THREE.Group(); trace=new THREE.Group();
  inputArrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1.4,C.cream,.35,.23);
  bodyTrail:THREE.Line;shadowTrail:THREE.Line;
  floor:THREE.Mesh; ready=false; pixelRatio=1.5; lastFrame:Frame|null=null;
  actorScale=1.18; stride=1.0; runStride=2.48; phaseOffsets:Record<string,number>={}; framingPoints:THREE.Vector3[]=[];
  constructor(public host:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.pixelRatio));
    this.renderer.setClearColor(C.paper);this.scene.background=new THREE.Color(C.paper);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
    this.renderer.domElement.setAttribute('aria-label','正午庭院，固定镜头的三维互动舞台');this.host.append(this.renderer.domElement);
    this.camera=new THREE.OrthographicCamera(-13,13,8,-8,.1,100);this.camera.position.set(-10,34,28);this.camera.lookAt(1.2,.5,0);
    const ambient=new THREE.AmbientLight(0xfff3dc,1.6);this.scene.add(ambient);
    const sun=new THREE.DirectionalLight(0xffedc4,2.5);sun.position.set(SUN.x,SUN.y,SUN.z);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-17,right:17,top:16,bottom:-15,near:.1,far:60});sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;
    this.scene.add(sun);this.scene.add(this.stage,this.actors,this.overlay,this.trace);
    this.floor=this.box((B.left+GATE.x)/2,-.26,0,GATE.x-B.left,.52,B.bottom-B.top,C.sand);
    this.box((GATE.x+B.right)/2,-.26,0,B.right-GATE.x,.52,B.bottom-B.top,C.cream);
    this.box((B.right+EXIT_ROUTE.end)/2,-.26,GATE.z,EXIT_ROUTE.end-B.right,.52,EXIT_ROUTE.bottom-EXIT_ROUTE.top,C.cream);
    this.box((B.left+B.right)/2,-.58,0,B.right-B.left+.64,.14,B.bottom-B.top+.64,C.darkCoral);
    this.box((B.right+EXIT_ROUTE.end)/2,-.58,GATE.z,EXIT_ROUTE.end-B.right,.14,EXIT_ROUTE.bottom-EXIT_ROUTE.top+.60,C.darkCoral);
    this.buildArchitecture();buildCourtyardDetails(this,C);this.buildFloor();this.buildPlanter(PLANT_MARK.x,PLANT_MARK.z,1);this.buildPlanter(SECOND_PLANT.x,SECOND_PLANT.z,.65);
    this.buildBench(BENCH.x,BENCH.z);this.buildProps();
    this.homeRing=this.ring(HOME.x,HOME.z,.47,C.cream);this.exitRing=this.ring(EXIT.x,EXIT.z,.63,C.cream,.075);this.bowRing=this.ring(BOW.x,BOW.z,.6,C.mint);this.homeRing.visible=false;this.exitRing.visible=false;this.bowRing.visible=false;
    this.door=this.buildDoor();this.buildRelayPads();this.controlRing=this.ring(0,0,.29,C.cream,.04);this.controlRing.visible=false;this.outlineExclusions.push(this.overlay,this.trace);this.ink=createInkPipeline(this.renderer,this.scene,this.camera,this.outlineExclusions,C.ink);
    // Fit the whole architecture in camera space, including the tower roofs and platform.
    this.stage.updateMatrixWorld(true);
    this.stage.traverse(node=>{if(!(node instanceof THREE.Mesh))return;
      node.geometry.computeBoundingBox();const bounds=node.geometry.boundingBox!;
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])this.framingPoints.push(new THREE.Vector3(x,y,z).applyMatrix4(node.matrixWorld));
    });
    this.overlay.visible=false;
    this.overlay.add(this.inputArrow);
    const trail=(color:number)=>new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(305*3),3)),new THREE.LineBasicMaterial({color}));
    this.bodyTrail=trail(C.cream);this.shadowTrail=trail(C.blue);this.trace.add(this.bodyTrail,this.shadowTrail);this.trace.visible=false;
    const ro=new ResizeObserver(()=>this.resize());ro.observe(host);this.resize();
  }
  material(color:number,role:StageSurfaceRole='environment',side:THREE.Side=THREE.FrontSide){
    const key=`${role}:${color}:${side}`;
    if(!this.materialCache.has(key)){const material=createStageMaterial(color,role);material.side=side;this.materialCache.set(key,material);}
    return this.materialCache.get(key)!;
  }
  mesh(geometry:THREE.BufferGeometry,color:number,_outline=false,parent:THREE.Object3D=this.stage){
    const m=new THREE.Mesh(geometry,this.material(color));m.castShadow=true;m.receiveShadow=true;parent.add(m);
    return m;
  }
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:number,outline=true,parent:THREE.Object3D=this.stage){const m=this.mesh(new THREE.BoxGeometry(w,h,d),color,outline,parent);m.position.set(x,y,z);return m;}
  cylinder(x:number,y:number,z:number,top:number,bottom:number,h:number,color:number,segments=20,parent:THREE.Object3D=this.stage){const m=this.mesh(new THREE.CylinderGeometry(top,bottom,h,segments),color,false,parent);m.position.set(x,y,z);return m;}
  line(points:number[][],color:number=C.ink,opacity=.6,parent:THREE.Object3D=this.stage){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity}));parent.add(line);return line;}
  arch(x:number,z:number,width:number,height:number,depth:number,color:number,y=0,parent:THREE.Object3D=this.stage){
    const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);
    const r=width/2,inner=height-r,thick=.28;
    this.box(-r-thick/2,inner/2,0,thick,inner,depth,color,true,g);this.box(r+thick/2,inner/2,0,thick,inner,depth,color,true,g);
    const s=new THREE.Shape();s.absarc(0,inner,r+thick,0,Math.PI,false);s.lineTo(-r,inner);s.absarc(0,inner,r,Math.PI,0,true);s.closePath();
    const geo=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:20});geo.translate(0,0,-depth/2);this.mesh(geo,color,true,g);
    return g;
  }
  buildArchitecture(){
    // The rear elevations are closed buildings with raised, shuttered windows.
    // No decorative opening offers a false route around the separating wall.
    this.box(.5,1.35,B.top-.15,19.6,2.7,.30,C.coral);
    this.box(.5,2.77,B.top-.15,19.8,.15,.46,C.lightCoral);
    this.box(B.left-.15,.65,0,.30,1.3,8.7,C.coral);
    this.box(B.left-.15,1.34,0,.43,.08,8.7,C.cream);
    this.box(.5,.25,B.bottom+.15,19.6,.5,.30,C.coral);
    this.box(.5,.54,B.bottom+.15,19.8,.08,.43,C.lightCoral);
    // A visible break in the right parapet leads into the departure street.
    for(const [top,bottom] of [[B.top,EXIT_ROUTE.top],[EXIT_ROUTE.bottom,B.bottom]]){
      this.box(B.right+.15,.49,(top+bottom)/2,.30,.98,bottom-top,C.coral);
      this.box(B.right+.15,1.02,(top+bottom)/2,.43,.08,bottom-top,C.cream);
    }
    for(const z of [EXIT_ROUTE.top-.15,EXIT_ROUTE.bottom+.15]){
      this.box((B.right+EXIT_ROUTE.end)/2,.27,z,EXIT_ROUTE.end-B.right,.54,.30,C.coral);
      this.box((B.right+EXIT_ROUTE.end)/2,.58,z,EXIT_ROUTE.end-B.right,.08,.40,C.lightCoral);
    }
    // Rear wall contains the entire 1.9 m leaf. The foreground wall stays low.
    const far=GATE.z-GATE.halfWidth,near=GATE.z+GATE.halfWidth;
    this.box(GATE.x,1.69,(B.top+far)/2,GATE.frameDepth,3.38,far-B.top,C.coral);
    this.box(GATE.x,3.43,(B.top+far)/2,.44,.10,far-B.top,C.lightCoral);
    this.box(GATE.x,.36,(near+B.bottom)/2,GATE.frameDepth,.72,B.bottom-near,C.coral);
    this.box(GATE.x,.77,(near+B.bottom)/2,.42,.10,B.bottom-near,C.cream);
    // A small flag and foliage retain motion without widening the camera bounds.
    const pole=this.cylinder(-4.6,3.15,-4.52,.025,.025,1.65,C.ink,8);pole.castShadow=false;
    const flag=this.mesh(new THREE.PlaneGeometry(.8,1.05,5,7),C.mint);flag.position.set(-4.18,3.39,-4.50);flag.material=this.material(C.mint,'environment',THREE.DoubleSide);this.flags.push(flag);
  }
  buildFloor(){
    const y=.006;
    for(let x=-8;x<10;x+=1.5)this.line([[x,y,B.top],[x,y,B.bottom]],0xb4893f,.13);
    for(let z=-3.75;z<4.3;z+=1.35)this.line([[B.left,y,z],[B.right,y,z]],0xb4893f,.13);
    for(const x of [-8.66,9.66])this.box(x,.012,0,.10,.024,8.0,C.lightCoral,false);
    for(const z of [-4.02,4.02]){
      this.box(.5,.012,z,18.5,.024,.10,C.cream,false);
      for(let x=-8.5;x<9.6;x+=.5){const tile=this.box(x,.029,z,.10,.012,.10,C.darkCoral,false);tile.rotation.y=Math.PI/4;}
    }
    // The actual passage has flush paving continuous with the pale outer court.
    this.box(GATE.x,.01,GATE.z,.62,.02,GATE.halfWidth*2,C.cream,false);
    for(let x=10.2;x<13;x+=.65)this.line([[x,y,EXIT_ROUTE.top],[x,y,EXIT_ROUTE.bottom]],C.darkCoral,.15);
    for(let i=0;i<14;i++){
      const x=-8+(i*5.37)%17,z=-3.7+(i*3.27)%7.4;
      this.line([[x,.014,z],[x+.12,.014,z+.02],[x+.2,.014,z-.04]],0xa67a36,.14);
    }
  }
  buildDoor(){
    const g=new THREE.Group();g.name='Sliding gate and full-length masonry pocket';g.position.set(GATE.x,0,GATE.z);g.rotation.y=-Math.PI/2;this.stage.add(g);
    const spring=GATE_HEIGHT-GATE.halfWidth;
    const spandrel=new THREE.Shape();spandrel.moveTo(-1.23,spring);spandrel.lineTo(-1.23,3.64);spandrel.lineTo(1.23,3.64);spandrel.lineTo(1.23,spring);spandrel.lineTo(GATE.halfWidth,spring);spandrel.absarc(0,spring,GATE.halfWidth,0,Math.PI,false);spandrel.closePath();
    const cap=new THREE.ExtrudeGeometry(spandrel,{depth:.30,bevelEnabled:false,curveSegments:20});cap.translate(0,0,-.15);this.mesh(cap,C.coral,false,g);
    this.arch(0,0,GATE.halfWidth*2,GATE_HEIGHT,.48,C.cream,0,g);
    // The rectangular shutter rides behind an arched surround; there are no hinges.
    g.add(this.doorSlide);this.doorSlide.name='Leaf translating into the rear wall';
    this.box(0,GATE_HEIGHT/2,0,GATE.leafWidth,GATE_HEIGHT,GATE.leafThickness,C.green,false,this.doorSlide);
    for(const face of [-1,1]){
      for(let x=-.76;x<=.8;x+=.19)this.line([[x,.12,face*.054],[x,3.25,face*.054]],C.ink,.17,this.doorSlide);
      for(const y of [.36,2.55])this.box(0,y,face*.058,1.78,.09,.016,C.mint,false,this.doorSlide);
      // Flush recessed grip does not imply rotation.
      this.box(.64,1.3,face*.06,.10,.32,.018,C.ink,false,this.doorSlide);
    }
    this.box(-.92,3.46,.10,3.84,.10,.16,C.darkCoral,false,g);
    this.box(-.92,3.51,.10,3.95,.035,.21,C.cream,false,g);
    // Both rails visibly continue into the pocket, which fits the entire leaf.
    for(const z of [-.065,.065])this.box(-.95,.025,z,3.8,.02,.025,C.ink,false,g);
    this.counterweight.position.set(-1.35,1.0,.19);g.add(this.counterweight);
    this.box(0,0,0,.19,.55,.13,C.cream,false,this.counterweight);
    for(const side of [-1,1])this.box(-1.35+side*.16,1.73,.19,.025,2.9,.025,C.ink,false,g);
    this.line([[-1.35,.3,.19],[-1.35,3.38,.19],[.70,3.38,.19]],C.cream,.85,g);
    for(const x of [-1.35,.70]){
      const wheel=this.mesh(new THREE.TorusGeometry(.105,.025,6,16),C.cream,false,g);wheel.position.set(x,3.36,.20);
    }
    this.signHinge.position.set(.99,2.60,-.31);g.add(this.signHinge);
    this.box(0,0,0,.58,.38,.035,C.cream,false,this.signHinge);
    this.line([[-.18,0,.026],[.18,0,.026],[.04,.11,.026]],C.green,1,this.signHinge);
    this.line([[.18,0,.026],[.04,-.11,.026]],C.green,1,this.signHinge);
    return g;
  }
  buildRelayPads(){
    const copper=0xb07b55;
    for(const [index,pad] of [INNER_PAD,OUTER_PAD].entries()){
      const rim=this.ring(pad.x,pad.z,PAD_RADIUS+.08,index?C.lightCoral:C.cream);rim.name=index?'Outside relay pedal':'Inside relay pedal';rim.position.y=.026;
      const face=new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS-.05,PAD_RADIUS-.05,.016,48),new THREE.MeshBasicMaterial({color:C.mint}));
      face.position.set(pad.x,.018,pad.z);this.stage.add(face);this.padFaces.push(face);
      const center=this.ring(pad.x,pad.z,.15,C.green,.025);center.position.y=.035;
      for(const angle of [0,Math.PI*2/3,Math.PI*4/3]){
        const d=.27;this.line([[pad.x+Math.cos(angle)*.20,.036,pad.z+Math.sin(angle)*.20],[pad.x+Math.cos(angle)*d,.036,pad.z+Math.sin(angle)*d]],C.green,.8);
      }
    }
    // Copper inlays physically run from each pedal to the shared counterweight.
    const wire=(points:number[][])=>{this.line(points,copper,.95);for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);const m=this.box((a[0]+b[0])/2,.020,(a[2]+b[2])/2,length,.012,.028,copper,false);m.rotation.y=-Math.atan2(dz,dx);}};
    wire([[INNER_PAD.x,.024,INNER_PAD.z],[.67,.024,INNER_PAD.z],[.67,.024,-2.25],[1.76,.024,-2.25]]);
    wire([[OUTER_PAD.x,.024,OUTER_PAD.z],[3.32,.024,OUTER_PAD.z],[3.32,.024,-2.25],[2.24,.024,-2.25]]);
  }
  buildPlanter(x:number,z:number,scale:number){
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);this.stage.add(g);
    const profile=[new THREE.Vector2(.48,0),new THREE.Vector2(.6,.1),new THREE.Vector2(.67,.55),new THREE.Vector2(.82,.8),new THREE.Vector2(.84,.92),new THREE.Vector2(.76,.96),new THREE.Vector2(.72,.84)];
    this.mesh(new THREE.LatheGeometry(profile,20),C.coral,false,g);
    this.cylinder(0,.85,0,.72,.72,.05,C.darkCoral,20,g);
    const soil=new THREE.Group();soil.position.y=.87;g.add(soil);this.plantHosts.push({node:soil,seed:x*.7+z});
  }

  buildBench(x:number,z:number){
    const g=new THREE.Group();g.position.set(x,0,z);this.stage.add(g);
    this.box(0,.62,0,2.3,.17,.75,C.cream,true,g);this.box(-.8,.3,0,.25,.6,.55,C.coral,true,g);this.box(.8,.3,0,.25,.6,.55,C.coral,true,g);
    this.box(0,1.2,-.26,2.3,.7,.12,C.lightCoral,true,g);
  }
  buildProps(){
    // Amphora, three stones, fallen leaves and a sleeping courtyard cat.
    const v=[new THREE.Vector2(.3,0),new THREE.Vector2(.47,.3),new THREE.Vector2(.43,.75),new THREE.Vector2(.2,1),new THREE.Vector2(.2,1.2)];
    const vase=this.mesh(new THREE.LatheGeometry(v,20),C.lightCoral);vase.position.set(8.8,0,-4.58);
    for(const side of [-1,1]){const handle=this.mesh(new THREE.TorusGeometry(.23,.055,6,16),C.coral);handle.position.set(8.8+side*.34,.76,-4.58);}
    const cat=this.mesh(new THREE.SphereGeometry(.33,16,8),C.cream,false);cat.position.set(BENCH.x-.1,.85,BENCH.z+.1);cat.scale.set(1.6,.45,.7);
    const head=this.mesh(new THREE.SphereGeometry(.18,12,8),C.cream);head.position.set(BENCH.x+.35,.92,BENCH.z+.2);
    for(const x of [BENCH.x+.25,BENCH.x+.46]){const ear=this.mesh(new THREE.ConeGeometry(.085,.18,3),C.cream);ear.position.set(x,1.08,BENCH.z+.2);}
    for(let i=0;i<7;i++){
      const leaf=this.mesh(new THREE.CircleGeometry(.09,3),C.lightCoral);leaf.rotation.x=-Math.PI/2;leaf.position.set(PLANT_MARK.x+.6+Math.sin(i*4)*.9,.018,PLANT_MARK.z+.9+Math.cos(i*2)*.8);
    }
  }
  ring(x:number,z:number,r:number,color:number,width=.05){const m=new THREE.Mesh(new THREE.RingGeometry(r-width,r,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,.052,z);this.stage.add(m);return m;}
  async load(){
    const [gltf,manifest,botanicals]=await Promise.all([new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/actor.glb?v=5`),fetch(`${import.meta.env.BASE_URL}assets/actor-manifest.json?v=5`).then(r=>r.json()),Promise.all(this.plantHosts.map(({node,seed})=>addBotanical(node,{height:1.8,seed,materialFor:color=>this.material(color,'environment',THREE.DoubleSide)})))]);this.botanicals=botanicals;this.clips=gltf.animations;this.phaseOffsets=Object.fromEntries(Object.entries(manifest.clips).map(([name,clip])=>[name,(clip as {phaseOffset?:number}).phaseOffset||0]));
    const bounds=new THREE.Box3().setFromObject(gltf.scene);this.actorScale=2.07/(bounds.max.y-bounds.min.y);
    this.stride=(manifest.clips.walk.strideLength||1)*this.actorScale;this.runStride=(manifest.clips.chase.strideLength||2.48)*this.actorScale;
    this.body=this.createRig(gltf.scene,false);this.shadow=this.createRig(gltf.scene,true);this.outlineExclusions.push(this.shadow.root);this.ink.outline.selectedObjects=[this.body.root];this.ready=true;
  }
  createRig(source:THREE.Group,shadow:boolean):Rig{
    const root=cloneSkeleton(source) as THREE.Group;root.name=shadow?'Shadow actor':'Body actor';root.scale.setScalar(this.actorScale);
    const materialFor=(m:THREE.Material)=>{
      const original=m as THREE.MeshStandardMaterial;const color=original.color?.getHex()??C.cream;
      if(shadow){
        const flat=new THREE.MeshBasicMaterial({color:C.blue,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
        installGroundProjection(flat,this.projectionFoot,this.projectionDoor);return flat;
      }
      return this.material(color,'actor',original.side);
    };
    root.traverse(node=>{
      if(node.name==='ink-outline')return;
      if(node instanceof THREE.Mesh){
        node.castShadow=false;node.receiveShadow=!shadow;node.frustumCulled=false;
        node.material=Array.isArray(node.material)?node.material.map(materialFor):materialFor(node.material);
        if(shadow)node.renderOrder=2;
      }
    });
    this.actors.add(root);const mixer=new THREE.AnimationMixer(root);const actions=new Map<string,THREE.AnimationAction>();
    this.clips.forEach(clip=>{const action=mixer.clipAction(clip);action.play();action.enabled=false;actions.set(clip.name,action);});
    const nodes:THREE.Object3D[]=[];root.traverse(n=>{if(n instanceof THREE.Bone)nodes.push(n);});
    return {root,mixer,actions,nodes};
  }
  capture():Visual{
    const capture=(rig:Rig|null)=>{const values=new Float32Array((rig?.nodes.length??0)*10);rig?.nodes.forEach((node,i)=>{node.position.toArray(values,i*10);node.quaternion.toArray(values,i*10+3);node.scale.toArray(values,i*10+7);});return values;};
    return {body:capture(this.body),shadow:capture(this.shadow)};
  }
  apply(frame:Frame){
    this.lastFrame=frame;
    if(this.body&&this.shadow){
      poseRig(this.body,frame.body,this.phaseOffsets,frame.visual?.body);poseRig(this.shadow,frame.shadow,this.phaseOffsets,frame.visual?.shadow);
      const attachment=frame.shadowAttachment;
      if(attachment>0){
        this.shadow.root.position.lerp(this.body.root.position,attachment);
        this.shadow.root.quaternion.slerp(this.body.root.quaternion,attachment);
        // Captured playback poses already include this blend; do not apply it twice.
        if(!frame.visual)this.shadow.nodes.forEach((node,i)=>{const body=this.body!.nodes[i];node.position.lerp(body.position,attachment);node.quaternion.slerp(body.quaternion,attachment);node.scale.lerp(body.scale,attachment);});
        this.shadow.root.updateMatrixWorld(true);
      }
    }
    const at=(p:Vec)=>!!frame.cue&&Math.hypot(frame.cue.x-p.x,frame.cue.z-p.z)<.01;
    this.homeRing.visible=at(HOME);
    this.exitRing.visible=at(EXIT);
    this.bowRing.visible=!!frame.cue&&!at(HOME)&&!at(EXIT);
    if(frame.cue)this.bowRing.position.set(frame.cue.x,.052,frame.cue.z);
    const motion=courtyardMotion(frame.t);
    this.doorSlide.position.x=-GATE.leafWidth*frame.doorOpen;
    this.counterweight.position.y=1.0+frame.doorOpen*1.75;
    this.projectionDoor.value=frame.doorOpen;
    if(this.shadow)this.projectionFoot.value.set(this.shadow.root.position.x,this.shadow.root.position.z);
    this.padFaces.forEach((pad,i)=>{const held=i?frame.outerHeld:frame.innerHeld;pad.position.y=held?.009:.018;pad.material.color.setHex(held?C.cream:C.mint);});
    if(this.controlRing){
      this.controlRing.visible=!!frame.controlLabel&&['body','shadow'].includes(frame.target)&&!['curtain','ended'].includes(frame.stage);
      const controlled=frame.target==='shadow'?frame.shadow:frame.body;
      this.controlRing.position.set(controlled.x,.061,controlled.z);
    }
    this.signHinge.rotation.y=Math.PI*frame.signTurn;
    for(const botanical of this.botanicals)botanical.update(frame.t,motion.wind);
    // Moving foliage and the sliding leaf keep their real cast shadows in step.
    if(Math.abs(frame.t-this.lastShadowUpdate)>.08){this.renderer.shadowMap.needsUpdate=true;this.lastShadowUpdate=frame.t;}
    for(const flag of this.flags){const p=flag.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i);p.setZ(i,Math.sin(frame.t*1.4+x*3+p.getY(i))*.035*(x+.55));}p.needsUpdate=true;}
  }
  setEvidence(frame:Frame,frames:Frame[],show:boolean){
    this.overlay.visible=show;this.trace.visible=show;
    if(!show)return;
    const actor=frame.target==='shadow'?frame.shadow:frame.body;
    const from=new THREE.Vector3(actor.x,.05,actor.z),d=new THREE.Vector3(frame.input.x,0,frame.input.z);
    this.inputArrow.visible=d.length()>.1;if(this.inputArrow.visible){this.inputArrow.position.copy(from);this.inputArrow.setDirection(d.normalize());}
    const recent=frames.filter(f=>f.t>=frame.t-10&&f.t<=frame.t).slice(-305);
    for(const [trail,key,y] of [[this.bodyTrail,'body',.06],[this.shadowTrail,'shadow',.07]] as const){
      const attr=trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      recent.forEach((f,i)=>attr.setXYZ(i,f[key].x,y,f[key].z));attr.needsUpdate=true;trail.geometry.setDrawRange(0,recent.length);trail.geometry.computeBoundingSphere();
    }
  }
  screenInput(x:number,y:number):Vec{
    const forward=new THREE.Vector3();this.camera.getWorldDirection(forward);forward.y=0;forward.normalize();
    const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
    return {x:right.x*x-forward.x*y,z:right.z*x-forward.z*y};
  }
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.ink.composer.setPixelRatio(this.renderer.getPixelRatio());this.ink.composer.setSize(w,h);this.ink.outline.edgeThickness=.6*this.renderer.getPixelRatio();
    const aspect=w/h;this.camera.updateMatrixWorld(true);
    const points=this.framingPoints.map(p=>p.clone().applyMatrix4(this.camera.matrixWorldInverse));
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const left=Math.min(...xs),right=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
    const height=Math.max((top-bottom)*1.06,(right-left)*1.06/aspect),cx=(left+right)/2,cy=(bottom+top)/2;
    this.camera.left=cx-height*aspect/2;this.camera.right=cx+height*aspect/2;this.camera.top=cy+height/2;this.camera.bottom=cy-height/2;
    this.camera.updateProjectionMatrix();this.render();}
  setQuality(low:boolean){this.renderer.setPixelRatio(low?1:Math.min(devicePixelRatio,1.5));this.resize();}
  render(){this.ink.composer.render();}
}
