import * as THREE from 'three';
import {buildCourtyardDetails} from './courtyard-detail';
import {STAGE_COLORS as C,createStageMaterial,type StageSurfaceRole} from './stage-materials';
import {createInkPipeline} from './ink-outline';
import {courtyardMotion} from './environment-motion';
import {addBotanical,type BotanicalInstance} from './botanical-assets';
import {SUN,SHADOW_SLOPE,SHADOW_HEIGHT} from './lighting';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { BOW, HOME, EXIT, PLANT, type Frame, type Visual, type Vec } from './engine';
import {GATE,INNER_PAD,OUTER_PAD,PAD_RADIUS} from './space';


import {poseRig,type Rig} from './rig-pose';
const GATE_HEIGHT=3.82, GATE_ARCADE_HEIGHT=4.12;
export class StageScene {
  renderer:THREE.WebGLRenderer; scene=new THREE.Scene(); camera:THREE.OrthographicCamera;
  ink:ReturnType<typeof createInkPipeline>;outlineExclusions:THREE.Object3D[]=[];
  plantHosts:{node:THREE.Group;seed:number}[]=[];botanicals:BotanicalInstance[]=[];doorHinge=new THREE.Group();signHinge=new THREE.Group();padFaces:THREE.Mesh<THREE.CylinderGeometry,THREE.MeshBasicMaterial>[]=[];controlRing:THREE.Mesh|null=null;lastShadowUpdate=-1;
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
    this.camera=new THREE.OrthographicCamera(-13,13,8,-8,.1,100);this.camera.position.set(12,19,26);this.camera.lookAt(0,1,-.5);
    const ambient=new THREE.AmbientLight(0xfff3dc,1.6);this.scene.add(ambient);
    const sun=new THREE.DirectionalLight(0xffedc4,2.5);sun.position.set(SUN.x,SUN.y,SUN.z);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-17,right:17,top:16,bottom:-15,near:.1,far:60});sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;
    this.scene.add(sun);this.scene.add(this.stage,this.actors,this.overlay,this.trace);
    this.floor=this.box(0,-.3,0,22,.6,15,C.sand,true);this.floor.receiveShadow=true;
    this.box(0,-.66,.1,22.4,.16,15.4,C.darkCoral,true);
    this.buildArchitecture();buildCourtyardDetails(this,C);this.buildFloor();this.buildPlanter(PLANT.x,PLANT.z,1);this.buildPlanter(6.9,-4.8,.65);
    this.buildBench(-6.6,-3.5);this.buildProps();
    this.homeRing=this.ring(HOME.x,HOME.z,.47,C.cream);this.exitRing=this.ring(EXIT.x,EXIT.z,.63,C.cream,.075);this.bowRing=this.ring(BOW.x,BOW.z,.6,C.mint);this.bowRing.visible=false;
    this.door=this.buildDoor();this.buildRelayPads();this.controlRing=this.ring(0,0,.17,C.ink);this.controlRing.visible=false;this.outlineExclusions.push(this.overlay,this.trace);this.ink=createInkPipeline(this.renderer,this.scene,this.camera,this.outlineExclusions,C.ink);
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
    // Tall rear arcade, with real openings and deliberately broad wall planes.
    // A taller entrance bay frames actors in the rear landing from the fixed
    // camera. Its raised lintel still joins the continuous roof and side piers.
    this.box(-4.175,4.1,-5.8,12.65,.85,1.25,C.coral);
    this.box(8.275,4.1,-5.8,4.45,.85,1.25,C.coral);
    this.box(GATE.x,4.465,-5.8,3.9,.17,1.25,C.coral);
    this.box(0,4.62,-5.8,21.45,.24,1.5,C.lightCoral);
    this.box(0,4.86,-5.95,21.15,.23,1.2,C.coral);
    for(const x of [-8.2,-4.1,0,4.1,8.2]){
      const height=x===GATE.x?GATE_ARCADE_HEIGHT:3.7;
      this.arch(x,-5.75,2.7,height,.9,C.lightCoral);
      const half=1.55,pierHeight=x===GATE.x?4.45:3.7;
      this.box(x-half,pierHeight/2,-5.85,.55,pierHeight,1.15,C.coral);
      this.box(x+half,pierHeight/2,-5.85,.55,pierHeight,1.15,C.coral);
      this.box(x-half,.15,-5.8,.75,.3,1.35,C.lightCoral);
      this.box(x+half,.15,-5.8,.75,.3,1.35,C.lightCoral);
    }
    // Dusky courtyard beyond the arches, not black voids.
    this.box(0,2.1,-7.7,21,4.2,.2,C.darkCoral,false);
    this.box(GATE.outsideLeft-.15,.42,(GATE.outsideEnd+GATE.outsideShoulder)/2,.3,.84,GATE.outsideShoulder-GATE.outsideEnd,C.coral,false);
    this.box(0,-.06,-6.5,21,.12,2.3,C.lightCoral);
    for(let x=-9.5;x<=10;x+=.6)this.line([[x,4.72,-5.0],[x+.08,4.84,-5.0]],C.darkCoral,.20);
    // Asymmetric tower and rooftop stair silhouette.
    this.box(-6.8,6.5,-7.8,4.2,3.8,3.1,C.coral);
    this.box(-6.8,8.45,-7.8,4.45,.2,3.3,C.lightCoral);
    this.box(8,7.3,-7.6,2.8,4.5,3,C.lightCoral);
    // Left terrace, low enough to keep the playable ground visible.
    this.box(-9.5,1.05,.3,2.0,2.1,11.3,C.coral);
    this.box(-9.5,2.18,.3,2.3,.2,11.5,C.lightCoral);
    for(let i=0;i<9;i++)this.box(-7.95,1.95-i*.23,-3.7+i*.57,1.1,.25,1.0,C.lightCoral);
    this.box(-9.8,2.6,.1,.3,.7,11.2,C.coral);
    for(const z of [-4.6,-1.3,2,5.3]){
      this.cylinder(-9.65,3.7,z,.16,.2,2.0,C.lightCoral,12);
      this.box(-9.65,4.75,z,.5,.18,.5,C.cream);
    }
    this.box(-9.65,4.95,.2,.65,.25,10.7,C.coral);
    // Right wing frames the exit without covering the actors.
    this.box(10.8,1.2,-1,1.4,2.4,9,C.coral);
    this.box(10.8,2.48,-1,1.65,.18,9.2,C.lightCoral);
    for(let z=-4.8;z<3.5;z+=.65){this.box(10.8,3,z,.15,1,.17,C.lightCoral,false);}
    this.box(10.8,3.55,-1,1.6,.2,9,C.coral);
    this.box(10.4,.28,4.9,1.0,.55,1.6,C.lightCoral);
    // Foreground plinths leave the central action readable.
    for(const x of [-10.3,10.3]){
      this.box(x,.35,6.2,1.1,.7,1.1,C.coral);
      this.box(x,.78,6.2,1.35,.16,1.35,C.lightCoral);
      this.cylinder(x,1.55,6.2,.28,.35,1.45,C.coral,12);
      this.box(x,2.32,6.2,.9,.18,.9,C.cream);
    }
    // Banner, water spout and small architectural details.
    const pole=this.cylinder(-4,6.1,-6.2,.035,.035,3,C.ink,8);
    pole.castShadow=false;
    const flag=this.mesh(new THREE.PlaneGeometry(1.05,1.7,5,7),C.mint,false);flag.position.set(-3.45,6.55,-6.18);flag.material=this.material(C.mint,'environment',THREE.DoubleSide);this.flags.push(flag);
    for(const x of [-8.2,0,8.2])this.cylinder(x,4.15,-5.11,.12,.12,.15,C.cream,12).rotation.x=Math.PI/2;
  }
  buildFloor(){
    const floorTop=.006;
    for(let x=-10;x<=10;x+=2)this.line([[x,floorTop,-5],[x,floorTop,7]],0xb4893f,.16);
    for(let z=-5;z<=7;z+=1.5)this.line([[-10,floorTop,z],[10,floorTop,z]],0xb4893f,.16);
    for(const z of [-4.8,5.7]){
      this.box(0,.012,z,18,.025,.12,C.cream,false);
      for(let x=-8.7;x<9;x+=.36){const tile=this.box(x,.035,z,.15,.025,.15,C.darkCoral,false);tile.rotation.y=Math.PI/4;}
    }
    for(let i=0;i<16;i++){
      const x=-8.7+(i*5.37)%17.4,z=-4.2+(i*3.27)%9.5;
      this.line([[x,.014,z],[x+.12,.014,z+.02],[x+.2,.014,z-.04]],0xa67a36,.18);
    }
  }
  buildDoor(){
    const g=new THREE.Group();g.name='Single hinged courtyard gate';g.position.set(GATE.x,0,GATE.z);this.stage.add(g);
    // Infill belongs to the selected arcade opening; its hole follows the cream surround.
    const spring=GATE_HEIGHT-GATE.halfWidth,outerSpring=GATE_ARCADE_HEIGHT-1.35;
    const infill=new THREE.Shape();infill.moveTo(-1.35,0);infill.lineTo(-1.35,outerSpring);infill.absarc(0,outerSpring,1.35,Math.PI,0,true);infill.lineTo(1.35,0);infill.lineTo(1.18,0);infill.lineTo(1.18,spring);infill.absarc(0,spring,1.18,0,Math.PI,false);infill.lineTo(-1.18,0);infill.closePath();
    const fillGeometry=new THREE.ExtrudeGeometry(infill,{depth:.22,bevelEnabled:false,curveSegments:20});fillGeometry.translate(0,0,-.11);this.mesh(fillGeometry,C.coral,false,g);
    this.arch(0,0,GATE.halfWidth*2,GATE_HEIGHT,GATE.frameDepth,C.cream,0,g);
    const r=GATE.halfWidth-.025;
    const shape=new THREE.Shape();shape.moveTo(-r,.035);shape.lineTo(r,.035);shape.lineTo(r,spring);shape.absarc(0,spring,r,0,Math.PI,false);shape.closePath();
    this.doorHinge.position.set(GATE.halfWidth,0,0);g.add(this.doorHinge);
    const panel=new THREE.Group();panel.position.x=-GATE.halfWidth;this.doorHinge.add(panel);
    const leafGeometry=new THREE.ExtrudeGeometry(shape,{depth:GATE.leafThickness,bevelEnabled:false,curveSegments:20});leafGeometry.translate(0,0,-GATE.leafThickness/2);this.mesh(leafGeometry,C.green,false,panel);
    for(let x=-.6;x<=.7;x+=.3)this.line([[x,.15,.033],[x,spring+.25,.033]],C.ink,.17,panel);
    for(const y of [.55,1.85]){
      this.box(.75,y,.055,.25,.085,.05,C.ink,false,panel);
      this.cylinder(GATE.halfWidth,y,0,.055,.055,.24,C.ink,10,g);
    }
    this.box(-.68,1.2,.065,.14,.28,.05,C.ink,false,panel);
    this.cylinder(-.68,1.2,.13,.065,.065,.09,C.cream,12,panel).rotation.x=Math.PI/2;
    // Threshold and both landing surfaces share y=0; decoration remains below the shadow.
    this.box(0,.008,0,GATE.halfWidth*2,.016,.32,C.lightCoral,false,g);
    this.signHinge.position.set(1.72,2.5,.1);g.add(this.signHinge);
    this.box(0,0,0,.85,.65,.12,C.cream,false,this.signHinge);
    this.line([[-.27,0,.08],[.25,0,.08],[.07,.16,.08]],C.ink,1,this.signHinge);
    this.line([[.25,0,.08],[.07,-.16,.08]],C.ink,1,this.signHinge);
    return g;
  }
  buildRelayPads(){
    // A pale stone landing distinguishes the far side from the ochre courtyard.
    // It stays flush below the projection and makes the handoff readable through the arch.
    this.box(GATE.x,.006,-6.3,1.72,.012,2.1,C.cream,false);
    this.box((GATE.outsideLeft+5)/2,.006,-7.05,5-GATE.outsideLeft,.012,.62,C.cream,false);
    for(const [index,pad] of [INNER_PAD,OUTER_PAD].entries()){
      const rim=this.ring(pad.x,pad.z,PAD_RADIUS+.08,C.cream);rim.name=index?'Outside hold position':'Inside hold position';rim.position.y=.026;
      const face=new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS-.05,PAD_RADIUS-.05,.016,48),new THREE.MeshBasicMaterial({color:C.mint}));
      face.position.set(pad.x,.018,pad.z);this.stage.add(face);this.padFaces.push(face);
      const center=this.ring(pad.x,pad.z,.13,C.green);center.position.y=.035;
    }
    this.line([[INNER_PAD.x,.023,INNER_PAD.z],[INNER_PAD.x,.023,-4.55],[GATE.x-GATE.halfWidth,.023,-4.55],[GATE.x-GATE.halfWidth,.023,GATE.z]],C.mint,.75);
    this.line([[OUTER_PAD.x,.023,OUTER_PAD.z],[GATE.x,.023,-6.95],[GATE.x,.023,GATE.z]],C.mint,.75);
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
    const vase=this.mesh(new THREE.LatheGeometry(v,20),C.lightCoral);vase.position.set(10.1,0,-3.5);
    for(const side of [-1,1]){const handle=this.mesh(new THREE.TorusGeometry(.23,.055,6,16),C.coral);handle.position.set(10.1+side*.34,.76,-3.5);}
    const cat=this.mesh(new THREE.SphereGeometry(.33,16,8),C.cream,false);cat.position.set(-6.7,.85,-3.4);cat.scale.set(1.6,.45,.7);
    const head=this.mesh(new THREE.SphereGeometry(.18,12,8),C.cream);head.position.set(-6.25,.92,-3.3);
    for(const x of [-6.35,-6.14]){const ear=this.mesh(new THREE.ConeGeometry(.085,.18,3),C.cream);ear.position.set(x,1.08,-3.3);}
    for(let i=0;i<7;i++){
      const leaf=this.mesh(new THREE.CircleGeometry(.09,3),C.lightCoral);leaf.rotation.x=-Math.PI/2;leaf.position.set(-5.2+Math.sin(i*4)*.9,.018,1+Math.cos(i*2)*.8);
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
        flat.onBeforeCompile=shader=>{
          shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 projectedWorld = modelMatrix * vec4( transformed, 1.0 );
            projectedWorld.x += projectedWorld.y * ${SHADOW_SLOPE.x};
            projectedWorld.z += projectedWorld.y * ${SHADOW_SLOPE.z};
            projectedWorld.y = ${SHADOW_HEIGHT};
            vec4 mvPosition = viewMatrix * projectedWorld;
            gl_Position = projectionMatrix * mvPosition;`);
        };
        flat.customProgramCacheKey=()=> 'ground-projection-v2';return flat;
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
    this.homeRing.visible=at(HOME)||frame.stage==='return';
    this.exitRing.visible=at(EXIT);
    this.bowRing.visible=!!frame.cue&&!at(HOME)&&!at(EXIT);
    if(frame.cue)this.bowRing.position.set(frame.cue.x,.052,frame.cue.z);
    const motion=courtyardMotion(frame.t);
    this.doorHinge.rotation.y=-GATE.maxAngle*frame.doorOpen;
    this.padFaces.forEach((pad,i)=>{const held=i?frame.outerHeld:frame.innerHeld;pad.position.y=held?.009:.018;pad.material.color.setHex(held?C.cream:C.mint);});
    if(this.controlRing){
      this.controlRing.visible=!!frame.controlLabel&&['body','shadow'].includes(frame.target)&&!['curtain','ended'].includes(frame.stage);
      const controlled=frame.target==='shadow'?frame.shadow:frame.body;
      this.controlRing.position.set(controlled.x,.061,controlled.z);
    }
    this.signHinge.rotation.y=Math.PI*frame.signTurn;
    for(const botanical of this.botanicals)botanical.update(frame.t,motion.wind);
    // Moving foliage and the hinged door keep their real cast shadows in step.
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
