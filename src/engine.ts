export type Mode = 'student' | 'teacher';
export type Stage = 'arrival' | 'return' | 'echo' | 'follow' | 'reverse' | 'rejoin' | 'curtain' | 'ended';
export type Animation = 'idle' | 'walk' | 'chase' | 'look' | 'shrug' | 'sit' | 'bow';
export type Vec = { x: number; z: number };
export type Actor = Vec & { yaw: number; animation: Animation; animTime: number; previous: Animation; previousTime: number; blend: number; pace: number };
export type Visual = { body: Float32Array; shadow: Float32Array };
export type Frame = { t: number; stage: Stage; elapsed: number; body: Actor; shadow: Actor; input: Vec; target: string; bodySource: string; shadowSource: string; line: string; lineId: number; goal: boolean; mode: Mode; ending: string; visual?: Visual };
export type Event = { t: number; type: string; [key: string]: unknown };
export type RoutePoint = Vec & { t: number; yaw: number; animation: Animation; animTime: number };
export const HOME = { x: -2.4, z: 2.2 };
export const EXIT = { x: 5.4, z: -3.5 };
export const BOW = { x: 1.8, z: -.3 };
export const PLANT = { x: -5.8, z: .1, radius: .85 };
export const BOUNDS = { left: -7.15, right: 7.15, top: -3.9, bottom: 4.4 };
export const CONFIG = { student: { arrival: 30, follow: 28, rejoin: 22 }, teacher: { arrival: 36, follow: 60, rejoin: 25 } };
export const SOURCES: Record<string,string> = {
  input: '当前输入', attached: '随身体投影', 'recorded-body': '本局身体旧路线', 'system-demo': '系统代演',
  'system-return': '系统归位', follow: '追随影子', rest: '预设休息动作', reverse: '本局影子路线倒放',
  reconnect: '从当前位置恢复跟随', curtain: '落幕动作', none: '无直接控制', shadow: '影子', body: '身体',
};
export const dist = (a: Vec,b: Vec) => Math.hypot(a.x-b.x,a.z-b.z);
const copy = <T>(v:T):T => structuredClone(v);
const position = (a: Vec) => ({x:a.x,z:a.z});
export function angleMix(a:number,b:number,f:number) { return a + Math.atan2(Math.sin(b-a),Math.cos(b-a))*f; }
export function routeAt(route:RoutePoint[],t:number):RoutePoint {
  if(t<=route[0].t) return {...route[0]};
  if(t>=route.at(-1)!.t) return {...route.at(-1)!};
  let lo=0, hi=route.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(route[m].t<=t)lo=m;else hi=m;}
  const a=route[lo],b=route[hi],f=(t-a.t)/(b.t-a.t);
  return {...a,t,x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,yaw:angleMix(a.yaw,b.yaw,f),animTime:a.animation===b.animation?a.animTime+(b.animTime-a.animTime)*f:a.animTime};
}
function actor(p:Vec):Actor{return {...p,yaw:.7,animation:'idle',animTime:0,previous:'idle',previousTime:0,blend:1,pace:1};}
export class Game {
  mode:Mode; config:typeof CONFIG.student; time=0; elapsed=0; stage:Stage='arrival'; paused=false;
  body=actor(HOME); shadow=actor(HOME); input:Vec={x:0,z:0}; target='body'; bodySource='input'; shadowSource='attached';
  frames:Frame[]=[]; events:Event[]=[]; route:RoutePoint[]=[]; shadowRoute:RoutePoint[]=[]; reverseRoute:RoutePoint[]=[];
  line=''; lineId=-1; lineUntil=0; goal=false; distance=0; idle=0; ending=''; systemDemo=false;
  fired=new Set<string>(); turns=0; lastDirection:Vec|null=null; restUntil=0; bowUntil=0; tick=0;
  constructor(mode:Mode='student') {
    this.mode=mode;this.config=CONFIG[mode];
    this.say('请先到门口，再回来。马上就好。','opening',7);
    this.event('stage',{stage:this.stage});this.route.push(this.routePoint(this.body,0));this.record();
  }
  event(type:string,data:Record<string,unknown>={}){this.events.push({t:this.time,type,...data});}
  say(text:string,reason:string,duration=6,interpretation=false){
    this.line=text;this.lineUntil=this.time+duration;this.lineId=this.events.length;
    this.event('narration',{text,reason,interpretation});
  }
  once(key:string,fn:()=>void){if(!this.fired.has(key)){this.fired.add(key);fn();}}
  setInput(x:number,z:number){
    const n=Math.hypot(x,z);if(n>1){x/=n;z/=n;}
    // Quantize the joystick to keep event logs small, preserving continuous control.
    x=Math.round(x*100)/100;z=Math.round(z*100)/100;
    if(x===this.input.x&&z===this.input.z)return;
    if(n>.1){if(this.lastDirection&&x*this.lastDirection.x+z*this.lastDirection.z<-.4)this.turns++;this.lastDirection={x,z};}
    this.input={x,z};this.event('input',{x,z,target:this.target});
  }
  pause(reason='manual'){if(!this.paused&&this.stage!=='ended'){this.setInput(0,0);this.paused=true;this.event('pause',{reason});}}
  resume(){if(this.paused){this.paused=false;this.event('resume');}}
  constrain(p:Vec){
    p.x=Math.max(BOUNDS.left,Math.min(BOUNDS.right,p.x));p.z=Math.max(BOUNDS.top,Math.min(BOUNDS.bottom,p.z));
    const d=dist(p,PLANT),r=PLANT.radius+.3;
    if(d<r){const dx=p.x-PLANT.x,dz=p.z-PLANT.z;p.x=PLANT.x+(d?dx/d:1)*r;p.z=PLANT.z+(d?dz/d:0)*r;}
  }
  move(a:Actor,direction:Vec,dt:number,speed=2.65){a.x+=direction.x*dt*speed;a.z+=direction.z*dt*speed;this.constrain(a);}
  follow(a:Actor,target:Vec,dt:number,speed=2.25,gap=.0){
    let dx=target.x-a.x,dz=target.z-a.z,d=Math.hypot(dx,dz);if(d<=gap)return;
    // Steer round the one interior planter. All other scenery is outside walkable bounds.
    const l2=dx*dx+dz*dz, u=Math.max(0,Math.min(1,((PLANT.x-a.x)*dx+(PLANT.z-a.z)*dz)/(l2||1)));
    const near={x:a.x+dx*u,z:a.z+dz*u};
    if(u>.01&&u<.99&&dist(near,PLANT)<PLANT.radius+.45){
      const side=a.z>=PLANT.z?1:-1;const waypoint={x:PLANT.x+1.5,z:PLANT.z+side*1.65};
      dx=waypoint.x-a.x;dz=waypoint.z-a.z;d=Math.hypot(dx,dz);
    }
    const step=Math.min(speed*dt,Math.max(0,d-gap));a.x+=dx/d*step;a.z+=dz/d*step;this.constrain(a);
  }
  animate(a:Actor,animation:Animation,dt:number,speed=1){
    if(animation!==a.animation){a.previous=a.animation;a.previousTime=a.animTime;a.animation=animation;a.animTime=0;a.blend=0;}
    a.animTime+=dt*speed;a.previousTime+=dt;a.blend=Math.min(1,a.blend+dt*5);a.pace=speed;
  }
  routePoint(a:Actor,t:number):RoutePoint{return {t,x:a.x,z:a.z,yaw:a.yaw,animation:a.animation,animTime:a.animTime};}
  transition(next:Stage,reason='automatic'){
    if(this.stage==='ended')return;
    this.event('transition',{from:this.stage,to:next,reason});this.stage=next;this.elapsed=0;this.line='';this.lineId=-1;this.lineUntil=0;
    this.event('stage',{stage:next});
    if(next==='return'){
      this.target='shadow';this.bodySource='system-return';this.shadowSource='input';
      if(this.distance<1){
        this.systemDemo=true;
        this.route=[{t:0,...HOME,yaw:.7,animation:'walk',animTime:0},{t:3,x:1,z:1,yaw:.7,animation:'walk',animTime:3},{t:5,x:1,z:1,yaw:.7,animation:'idle',animTime:0},{t:8,x:3,z:-1,yaw:2,animation:'walk',animTime:0},{t:12,...HOME,yaw:-2,animation:'walk',animTime:4}];
        this.say('这一场很安静。接下来由影子代演一小段。','system-demo',5);this.event('system-demo');
      }else if(dist(this.body,HOME)>.15)this.say('稍等，让身体回到刚才出发的位置。','system-return',5);
      this.event('system-return',{from:position(this.body),to:HOME});
    }else if(next==='echo'){
      this.target='shadow';this.bodySource=this.systemDemo?'system-demo':'recorded-body';this.shadowSource='input';
    }else if(next==='follow'){
      this.target='shadow';this.bodySource='follow';this.shadowSource='input';
      this.say('很好。现在请把这个人带到门口。','follow-instruction',7);
    }else if(next==='reverse'){
      this.target='none';this.bodySource='follow';this.shadowSource='reverse';
      this.reverseRoute=[...this.shadowRoute.filter(p=>p.t>=this.time-8),this.routePoint(this.shadow,this.time)];
    }else if(next==='rejoin'){
      this.target='body';this.bodySource='input';this.shadowSource='reconnect';
    }
  }
  skip(){
    if(this.stage==='ended'||this.stage==='curtain')return;
    this.event('host-skip',{stage:this.stage});
    const next:Partial<Record<Stage,Stage>>={arrival:'return',echo:'follow',follow:this.mode==='teacher'?'reverse':'rejoin',reverse:'rejoin'};
    if(this.stage==='return')return; // Finish walking to the original route start; never teleport.
    if(this.stage==='rejoin')this.finish('host-ended');else this.transition(next[this.stage]!,'host-skip');
  }
  finish(ending:string){
    if(this.stage==='ended'||this.stage==='curtain')return;
    this.ending=ending;this.stage='curtain';this.elapsed=0;this.target='none';this.bodySource='curtain';this.shadowSource='curtain';
    this.event('ending',{ending});
    const text:Record<string,string>={exit:'他们终于走到一起。出口松了一口气。',stillness:'他们都坐下了。没有谁需要先离开。',lingering:'出口等了很久。后来，它也下班了。','host-ended':'这一次，导演替演出落了幕。'};
    this.say(text[ending],'ending',10);
  }
  step(dt=1/60){
    if(this.paused||this.stage==='ended')return;
    this.time+=dt;this.elapsed+=dt;this.tick++;
    const oldB=position(this.body),oldS=position(this.shadow);const active=Math.hypot(this.input.x,this.input.z)>.1;
    this.idle=active?0:this.idle+dt;if(this.time>this.lineUntil){this.line='';this.lineId=-1;}
    let recordedBody=false,recordedShadow=false;
    if(this.stage==='arrival'){
      this.move(this.body,this.input,dt);this.distance+=dist(oldB,this.body);
      if(dist(this.body,EXIT)<1&&!this.goal){this.goal=true;this.event('target-entered',{target:'door'});this.say('到了。再回到出发的白圈，稍等片刻。','return-instruction',7);}
      if(this.goal&&this.elapsed>18&&dist(this.body,HOME)<.4)this.transition('return','returned-to-home');
      else if(this.elapsed>=this.config.arrival)this.transition('return','time-limit');
    }else if(this.stage==='return'){
      this.move(this.shadow,this.input,dt);this.follow(this.body,HOME,dt,3.1);
      if(dist(this.body,HOME)<.02&&this.elapsed>(this.systemDemo?5:.5))this.transition('echo');
    }else if(this.stage==='echo'){
      const p=routeAt(this.route,this.elapsed);Object.assign(this.body,p);this.body.blend=1;recordedBody=true;
      this.move(this.shadow,this.input,dt);
      if(this.elapsed>=7)this.once('echo-reveal',()=>this.say('……好像有人拿错了自己的部分。','control-reveal',6));
      if(this.elapsed>=this.route.at(-1)!.t)this.transition('follow');
    }else if(this.stage==='follow'){
      this.move(this.shadow,this.input,dt);
      if(this.mode==='teacher'&&this.elapsed>17)this.once('rest',()=>{this.restUntil=this.time+2.5;this.event('body-rest',{duration:2.5});this.say('您的身体申请了两秒钟离线。','body-rest');});
      this.bodySource=this.time<this.restUntil?'rest':'follow';
      if(this.time>=this.restUntil&&this.time>=this.bowUntil)this.follow(this.body,{x:this.shadow.x-.35,z:this.shadow.z-.15},dt,2.1,.5);
      if(this.mode==='teacher'&&this.elapsed>27)this.once('bow-mark',()=>this.say('谢幕位置准备好了。演员有自己的位置。','bow-instruction'));
      if(this.mode==='teacher'&&this.elapsed>27&&dist(this.shadow,BOW)<.85)this.once('bow',()=>{this.bowUntil=this.time+3;this.event('bow',{target:'bow-mark'});this.say('身体正在谢幕。影子似乎还有别的安排。','bow',6,true);});
      if(this.elapsed>=this.config.follow||(this.elapsed>(this.mode==='teacher'?45:18)&&dist(this.shadow,EXIT)<1&&dist(this.body,EXIT)<1.6))this.transition(this.mode==='teacher'?'reverse':'rejoin');
    }else if(this.stage==='reverse'){
      const p=routeAt(this.reverseRoute,this.reverseRoute.at(-1)!.t-this.elapsed);Object.assign(this.shadow,p);this.shadow.blend=1;recordedShadow=true;
      this.follow(this.body,{x:this.shadow.x-.35,z:this.shadow.z-.15},dt,2.1,.45);
      if(this.elapsed>4)this.once('reverse-reveal',()=>this.say('影子把你刚才的意思，当成了现在的命令。','reverse-reveal'));
      if(this.elapsed>=8)this.transition('rejoin');
    }else if(this.stage==='rejoin'){
      this.move(this.body,this.input,dt);this.follow(this.shadow,this.body,dt,3.1);
      if(dist(this.shadow,this.body)<.03)this.shadowSource='attached';
      if(this.elapsed>=7)this.once('rejoin-reveal',()=>this.say('可以再试着走一步。出口这次真的准备好了。','exit-instruction'));
      if(this.elapsed>8&&dist(this.body,EXIT)<.8)this.finish('exit');
      else if(this.elapsed>=this.config.rejoin)this.finish(this.idle>8?'stillness':'lingering');
    }else if(this.stage==='curtain'){
      if(this.ending==='exit')this.follow(this.shadow,this.body,dt,2);
      if(this.elapsed>=4){this.stage='ended';this.event('title-reveal');}
    }
    const quiet=(this.stage==='echo'||this.stage==='rejoin')&&this.elapsed<8;
    if(!quiet&&this.stage!=='curtain'&&this.stage!=='ended'&&!this.line&&this.elapsed>10){
      if(this.idle>8)this.once(`${this.stage}-idle`,()=>this.say('您似乎决定留一会儿。那我也把话说慢一点。','no-input-8s',6,true));
      else if(dist(this.body,PLANT)<1.9)this.once('planter',()=>this.say('花盆原本没有戏份。它现在有了。','near-planter'));
      else if(this.turns>=6)this.once('turns',()=>this.say('您似乎很想改写这条路线。我更新一下说明书。','direction-changes',6,true));
      else if(this.elapsed>23)this.once(`${this.stage}-late`,()=>this.say('按计划，你这会儿已经到了。看来是计划来早了。','elapsed-23s'));
    }
    const bodySpeed=dist(oldB,this.body)/dt,shadowSpeed=dist(oldS,this.shadow)/dt;
    if(!recordedBody){
      if(bodySpeed>.01)this.body.yaw=angleMix(this.body.yaw,Math.atan2(this.body.x-oldB.x,this.body.z-oldB.z),Math.min(1,dt*12));
      const anim:Animation=(this.stage==='curtain'||this.stage==='ended')?(this.ending==='stillness'?'sit':'bow'):this.time<this.restUntil?'sit':this.time<this.bowUntil?'bow':bodySpeed>.03?(this.stage==='follow'?'chase':'walk'):this.idle>6?'look':'idle';
      this.animate(this.body,anim,dt,bodySpeed>.03?Math.max(.55,bodySpeed/2.3):1);
    }
    if(this.stage==='arrival'||this.shadowSource==='attached'){this.shadow=copy(this.body);}
    else if(!recordedShadow){
      if(shadowSpeed>.01)this.shadow.yaw=angleMix(this.shadow.yaw,Math.atan2(this.shadow.x-oldS.x,this.shadow.z-oldS.z),Math.min(1,dt*12));
      this.animate(this.shadow,this.stage==='curtain'||this.stage==='ended'?'sit':shadowSpeed>.03?'walk':'idle',dt,shadowSpeed>.03?Math.max(.5,shadowSpeed/2.3):1);
    }
    if(this.stage==='arrival')this.route.push(this.routePoint(this.body,this.elapsed));
    this.shadowRoute.push(this.routePoint(this.shadow,this.time));
    if(this.tick%2===0||this.stage==='ended')this.record();
  }
  snapshot():Frame{return {t:this.time,stage:this.stage,elapsed:this.elapsed,body:copy(this.body),shadow:copy(this.shadow),input:{...this.input},target:this.target,bodySource:this.bodySource,shadowSource:this.shadowSource,line:this.line,lineId:this.lineId,goal:this.goal,mode:this.mode,ending:this.ending};}
  record(){this.frames.push(this.snapshot());}
  export(){return {schemaVersion:2,build:'0.2.0',assetVersion:'actor-1',mode:this.mode,duration:this.time,systemDemo:this.systemDemo,ending:this.ending,events:this.events,frames:this.frames};}
}
export function frameAt(frames:Frame[],time:number):Frame{
  let lo=0,hi=frames.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].t<=time)lo=mid;else hi=mid-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],f=b.t>a.t?Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t))):0;
  const mix=(a:Actor,b:Actor):Actor=>({...a,x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,yaw:angleMix(a.yaw,b.yaw,f),animTime:a.animation===b.animation?a.animTime+(b.animTime-a.animTime)*f:a.animTime});
  // Bone quaternion interpolation is performed by the renderer; retain both captured poses there.
  return {...a,t:time,body:mix(a.body,b.body),shadow:mix(a.shadow,b.shadow)};
}
