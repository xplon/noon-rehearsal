import {MOTION,velocity,facing,arrival,magnet,easedRouteTime,smooth,clamp,type Motion} from './motion.ts';
export type Mode = 'student' | 'teacher';
export type Stage = 'arrival' | 'return' | 'echo' | 'follow' | 'reverse' | 'rejoin' | 'curtain' | 'ended';
export const ANIMATIONS = ['idle','walk','chase','look','shrug','sit','rise','bow','turn','struggle'] as const;
export type Animation = typeof ANIMATIONS[number];
export type Vec = { x:number; z:number };
export type Actor = Motion & {animation:Animation;animTime:number;previous:Animation;previousTime:number;blend:number;pace:number;gaitPhase:number;weights:Record<Animation,number>;clocks:Record<Animation,number>};
export type Visual = {body:Float32Array;shadow:Float32Array};
export type Frame = {t:number;stage:Stage;elapsed:number;body:Actor;shadow:Actor;shadowAttachment:number;input:Vec;target:string;bodySource:string;shadowSource:string;line:string;lineId:number;goal:boolean;mode:Mode;ending:string;visual?:Visual};
export type Event = {t:number;type:string;[key:string]:unknown};
export type RoutePoint = Actor & {t:number};
export const HOME={x:-2.4,z:2.2},EXIT={x:5.4,z:-3.5},BOW={x:1.8,z:-.3},PLANT={x:-5.8,z:.1,radius:.85};
export const BOUNDS={left:-7.15,right:7.15,top:-3.9,bottom:4.4};
export const CONFIG={student:{arrival:28,follow:24,rejoin:16},teacher:{arrival:32,follow:48,rejoin:18}};
export const SOURCES:Record<string,string>={input:'当前输入',attached:'随身体投影','recorded-body':'本局身体旧路线','system-demo':'系统代演','system-return':'系统归位',follow:'追随影子',rest:'预设休息动作',bow:'谢幕动作',reverse:'本局影子路线倒放',reconnect:'从当前位置恢复跟随',curtain:'落幕动作',none:'无直接控制',shadow:'影子',body:'身体','settling':'减速并等待会合'};
export const dist=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.z-b.z);
const copy=<T>(v:T):T=>structuredClone(v);
const position=(a:Vec)=>({x:a.x,z:a.z});
const speed=(a:Motion)=>Math.hypot(a.vx,a.vz);
const table=(value=0)=>Object.fromEntries(ANIMATIONS.map(n=>[n,value])) as Record<Animation,number>;
export function angleMix(a:number,b:number,f:number){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*f;}
export function actor(p:Vec):Actor {const weights=table();weights.idle=1;return {...p,vx:0,vz:0,ax:0,az:0,yaw:.7,yawVelocity:0,animation:'idle',animTime:0,previous:'idle',previousTime:0,blend:1,pace:1,gaitPhase:0,weights,clocks:table()};}
export function mixActor(a:Actor,b:Actor,f:number):Actor {
  const out=copy(a);for(const key of ['x','z','vx','vz','ax','az','yawVelocity','gaitPhase','pace','blend'] as const)out[key]=a[key]+(b[key]-a[key])*f;
  out.yaw=angleMix(a.yaw,b.yaw,f);
  for(const name of ANIMATIONS){out.weights[name]=a.weights[name]+(b.weights[name]-a.weights[name])*f;out.clocks[name]=b.clocks[name]>=a.clocks[name]?a.clocks[name]+(b.clocks[name]-a.clocks[name])*f:a.clocks[name];}
  out.animTime=out.clocks[out.animation];return out;
}
export function routeAt(route:RoutePoint[],t:number):RoutePoint {
  if(t<=route[0].t)return copy(route[0]);if(t>=route.at(-1)!.t)return copy(route.at(-1)!);
  let lo=0,hi=route.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(route[m].t<=t)lo=m;else hi=m;}
  const a=route[lo],b=route[hi],f=(t-a.t)/(b.t-a.t);return {...mixActor(a,b,f),t};
}
export class Game {
  mode:Mode;config:typeof CONFIG.student;time=0;elapsed=0;stage:Stage='arrival';paused=false;
  body=actor(HOME);shadow=actor(HOME);input:Vec={x:0,z:0};target='body';bodySource='input';shadowSource='attached';
  frames:Frame[]=[];events:Event[]=[];route:RoutePoint[]=[];shadowRoute:RoutePoint[]=[];reverseRoute:RoutePoint[]=[];
  line='';lineId=-1;lineUntil=0;goal=false;distance=0;idle=0;ending='';systemDemo=false;
  fired=new Set<string>();turns=0;lastDirection:Vec|null=null;restUntil=0;riseUntil=0;bowUntil=0;tick=0;
  homeDwell=0;settleDwell=0;leaderStopping=false;reverseStarted=false;reverseClock=0;reverseDuration=8;reconnected=false;curtainActing=false;curtainClock=0;bowQueued=false;restQueued=false;
  stride=1.0;runStride=2.48;returnYaw=.7;echoWindow=0;echoOffset:Vec={x:0,z:0};shadowAttachment=1;
  reversePath:{distance:number;point:RoutePoint}[]=[];reverseLength=0;
  constructor(mode:Mode='student',stride=1.0,runStride=2.48){
    this.mode=mode;this.config=CONFIG[mode];this.stride=stride;this.runStride=runStride;
    this.say('请先到门口，再回来。马上就好。','opening',7);this.event('stage',{stage:this.stage});this.route.push(this.routePoint(this.body,0));this.record();
  }
  event(type:string,data:Record<string,unknown>={}){this.events.push({t:this.time,type,...data});}
  say(text:string,reason:string,duration=6,interpretation=false){this.line=text;this.lineUntil=this.time+duration;this.lineId=this.events.length;this.event('narration',{text,reason,interpretation});}
  once(key:string,fn:()=>void){if(!this.fired.has(key)){this.fired.add(key);fn();}}
  setInput(x:number,z:number){
    const n=Math.hypot(x,z);if(n>1){x/=n;z/=n;}x=Math.round(x*100)/100;z=Math.round(z*100)/100;
    if(x===this.input.x&&z===this.input.z)return;
    if(n>.1){if(this.lastDirection&&x*this.lastDirection.x+z*this.lastDirection.z<-.4)this.turns++;this.lastDirection={x,z};}
    this.input={x,z};this.event('input',{x,z,target:this.target});
  }
  pause(reason='manual'){if(!this.paused&&this.stage!=='ended'){this.setInput(0,0);this.paused=true;this.event('pause',{reason});}}
  resume(){if(this.paused){this.paused=false;this.event('resume');}}
  constrain(p:Vec){
    p.x=clamp(p.x,BOUNDS.left,BOUNDS.right);p.z=clamp(p.z,BOUNDS.top,BOUNDS.bottom);
    const d=dist(p,PLANT),r=PLANT.radius+.3;if(d<r){const dx=p.x-PLANT.x,dz=p.z-PLANT.z;p.x=PLANT.x+(d?dx/d:1)*r;p.z=PLANT.z+(d?dz/d:0)*r;}
  }
  drive(a:Actor,desired:Vec,dt:number){
    // Brake before the wall/planter; constrain is only a numerical safety net.
    desired={x:clamp(desired.x,-Math.max(0,a.x-BOUNDS.left)*3,Math.max(0,BOUNDS.right-a.x)*3),z:clamp(desired.z,-Math.max(0,a.z-BOUNDS.top)*3,Math.max(0,BOUNDS.bottom-a.z)*3)};
    const dx=a.x-PLANT.x,dz=a.z-PLANT.z,d=Math.hypot(dx,dz),inward=(desired.x*dx+desired.z*dz)/(d||1),clearance=d-PLANT.radius-.3;
    if(inward<0&&clearance<1){const limit=-Math.max(0,clearance)*3;if(inward<limit){desired.x+=(limit-inward)*dx/d;desired.z+=(limit-inward)*dz/d;}}
    velocity(a,desired,dt);this.constrain(a);
  }
  move(a:Actor,direction:Vec,dt:number,max=MOTION.speed,mark?:Vec){this.drive(a,magnet(a,{x:direction.x*max,z:direction.z*max},mark),dt);}
  follow(a:Actor,target:Vec,dt:number,max=3.05){
    let aim=target;const dx=target.x-a.x,dz=target.z-a.z,l2=dx*dx+dz*dz;
    const u=clamp(((PLANT.x-a.x)*dx+(PLANT.z-a.z)*dz)/(l2||1),0,1);
    if(u>.01&&u<.99&&dist({x:a.x+dx*u,z:a.z+dz*u},PLANT)<PLANT.radius+.5){
      const side=a.z>=PLANT.z?1:-1;aim={x:Math.abs(a.z-PLANT.z)<1.7?a.x:PLANT.x+(target.x<PLANT.x?-1.55:1.55),z:PLANT.z+side*1.9};
    }
    this.drive(a,arrival(a,aim,max),dt);
  }
  animate(a:Actor,animation:Animation,dt:number,actualSpeed=speed(a)){
    if(animation!==a.animation){a.previous=a.animation;a.previousTime=a.animTime;a.animation=animation;if(!['walk','chase','idle'].includes(animation)&&a.weights[animation]<.04)a.clocks[animation]=0;}
    const run=smooth((actualSpeed-1.2)/1.35);
    a.gaitPhase+=actualSpeed*dt/(this.stride*(1-run)+this.runStride*run);
    const wanted=table();
    if(animation==='walk'||animation==='chase'){
      const weight=smooth(actualSpeed/.55);const chase=run;
      wanted.walk=weight*(1-chase);wanted.chase=weight*chase;wanted.idle=1-weight;
    }else wanted[animation]=1;
    const amount=1-Math.exp(-dt*(animation==='sit'?3.5:7.5));
    for(const name of ANIMATIONS){a.weights[name]+=(wanted[name]-a.weights[name])*amount;a.clocks[name]+=dt;}
    a.animTime=a.clocks[animation];a.pace=actualSpeed/2.3;a.blend=a.weights[animation];
    if(actualSpeed>.06)facing(a,Math.atan2(a.vx,a.vz),dt);else facing(a,a===this.body&&this.stage==='return'?this.returnYaw:a.yaw,dt);
  }
  routePoint(a:Actor,t:number):RoutePoint{return {...copy(a),t};}
  settled(a:Actor,target?:Vec,tolerance=.035){return speed(a)<.06&&(!target||dist(a,target)<tolerance);}
  makeDemo(){
    const a=actor(HOME),route=[this.routePoint(a,0)];let t=0,index=0,dwell=0;const marks=[{x:.7,z:1.2},{x:2,z:-.8},HOME];
    while(index<marks.length&&t<16){this.follow(a,marks[index],1/60,2.15);this.animate(a,speed(a)>.07?'walk':'idle',1/60);t+=1/60;route.push(this.routePoint(a,t));if(this.settled(a,marks[index]))dwell+=1/60;else dwell=0;if(dwell>.35){index++;dwell=0;}}
    return route;
  }
  transition(next:Stage,reason='automatic'){
    if(this.stage==='ended')return;this.event('transition',{from:this.stage,to:next,reason});this.stage=next;this.elapsed=0;this.settleDwell=0;this.line='';this.lineId=-1;this.lineUntil=0;this.event('stage',{stage:next});
    if(next==='return'){
      this.shadowAttachment=0;
      this.target='shadow';this.bodySource='system-return';this.shadowSource='input';
      if(this.distance<1){this.systemDemo=true;this.route=this.makeDemo();this.say('这一场很安静。接下来由影子代演一小段。','system-demo',3.5);this.event('system-demo');}
      else {
        // Remove only excess trailing idle, preserving the original timestamps inside the performed route.
        const lastMoving=[...this.route].reverse().find(p=>speed(p)>.12)?.t??0;
        this.route=this.route.filter(p=>p.t<=lastMoving+.75);
        if(dist(this.body,HOME)>.2)this.say('身体正回到刚才出发的位置。','system-return',3.5);
      }
      this.echoWindow=this.route.at(-1)!.t;this.returnYaw=this.route[0].yaw;
      this.event('route-window',{start:0,end:this.echoWindow,trim:'trailing-idle-only'});this.event('system-return',{from:position(this.body),to:HOME});
    }else if(next==='echo'){
      this.target='shadow';this.bodySource=this.systemDemo?'system-demo':'recorded-body';this.shadowSource='input';
      this.echoOffset={x:this.body.x-this.route[0].x,z:this.body.z-this.route[0].z};
    }else if(next==='follow'){
      this.target='shadow';this.bodySource='follow';this.shadowSource='input';this.leaderStopping=false;this.say('很好。现在请把这个人带到门口。','follow-instruction',7);
    }else if(next==='reverse'){
      this.target='none';this.bodySource='follow';this.shadowSource='settling';this.reverseStarted=false;this.reverseClock=0;this.shadowAttachment=0;
    }else if(next==='rejoin'){
      this.target='body';this.bodySource='input';this.shadowSource='attached';this.reconnected=true;this.shadowAttachment=1;
    }
  }
  skip(){
    if(this.stage==='ended'||this.stage==='curtain')return;this.event('host-skip',{stage:this.stage});
    if(this.stage==='arrival')this.transition('return','host-skip');
    else if(this.stage==='echo')this.transition('follow','host-skip');
    else if(this.stage==='follow')this.leaderStopping=true;
    else if(this.stage==='reverse')this.reverseClock=this.reverseDuration; // still settle naturally before reconnecting
    else if(this.stage==='rejoin')this.finish('host-ended');
  }
  finish(ending:string){
    if(this.stage==='ended'||this.stage==='curtain')return;
    this.ending=ending;this.stage='curtain';this.elapsed=0;this.target='none';this.bodySource='curtain';this.shadowSource='curtain';this.curtainActing=false;this.curtainClock=0;this.event('ending',{ending});
    const text:Record<string,string>={exit:'他们终于走到一起。出口松了一口气。',stillness:'他们都坐下了。没有谁需要先离开。',lingering:'出口等了很久。后来，它也下班了。','host-ended':'这一次，导演替演出落了幕。'};this.say(text[ending],'ending',20);
  }
  step(dt=1/60){
    if(this.paused||this.stage==='ended')return;
    this.time+=dt;this.elapsed+=dt;this.tick++;
    const oldB=position(this.body),oldS=position(this.shadow),active=Math.hypot(this.input.x,this.input.z)>.1;
    this.idle=active?0:this.idle+dt;if(this.time>this.lineUntil){this.line='';this.lineId=-1;}
    let recordedBody=false,recordedShadow=false;
    if(this.stage==='arrival'){
      this.move(this.body,this.input,dt,MOTION.speed,this.goal?HOME:EXIT);this.distance+=dist(oldB,this.body);
      if(dist(this.body,EXIT)<.8&&!this.goal){this.goal=true;this.event('target-entered',{target:'door'});this.say('到了。再回到出发的白圈。','return-instruction',7);}
      this.homeDwell=this.goal&&dist(this.body,HOME)<.25&&speed(this.body)<.25?this.homeDwell+dt:0;
      if(this.homeDwell>.45)this.transition('return','returned-to-home');else if(this.elapsed>=this.config.arrival)this.transition('return','time-limit');
    }else if(this.stage==='return'){
      this.move(this.shadow,this.input,dt);this.follow(this.body,HOME,dt,3.15);
      if(this.settled(this.body,HOME)){this.settleDwell+=dt;}else this.settleDwell=0;
      if(this.settleDwell>.35&&Math.abs(Math.sin((this.body.yaw-this.returnYaw)/2))<.02&&this.elapsed>(this.systemDemo?3.5:0))this.transition('echo');
    }else if(this.stage==='echo'){
      const p=routeAt(this.route,this.elapsed),offset=1-smooth(this.elapsed/.5);Object.assign(this.body,p);
      this.body.x+=this.echoOffset.x*offset;this.body.z+=this.echoOffset.z*offset;recordedBody=true;
      this.move(this.shadow,this.input,dt);
      if(this.elapsed>=Math.min(6,this.echoWindow*.6))this.once('echo-reveal',()=>this.say('……好像有人拿错了自己的部分。','control-reveal',5));
      if(this.elapsed>=this.echoWindow)this.transition('follow');
    }else if(this.stage==='follow'){
      if(this.elapsed>=this.config.follow||(this.elapsed>(this.mode==='teacher'?35:12)&&dist(this.shadow,EXIT)<.75))this.leaderStopping=true;
      const mark=this.mode==='teacher'&&this.elapsed>22&&!this.fired.has('bow')?BOW:EXIT;
      this.move(this.shadow,this.leaderStopping?{x:0,z:0}:this.input,dt,MOTION.speed,this.leaderStopping?undefined:mark);
      this.shadowSource=this.leaderStopping?'settling':'input';if(this.leaderStopping)this.target='none';
      if(this.mode==='teacher'&&this.elapsed>13)this.once('rest',()=>{this.restQueued=true;});
      if(this.mode==='teacher'&&this.elapsed>22)this.once('bow-mark',()=>this.say('谢幕位置准备好了。演员有自己的位置。','bow-instruction'));
      if(this.mode==='teacher'&&this.elapsed>22&&dist(this.shadow,BOW)<.6)this.once('bow',()=>{this.bowQueued=true;this.event('bow',{target:'bow-mark'});this.say('身体正在谢幕。影子似乎还有别的安排。','bow',6,true);});
      if(this.leaderStopping){this.restQueued=false;this.bowQueued=false;}
      const hold=this.restQueued||this.bowQueued||this.time<this.riseUntil||this.time<this.bowUntil;
      if(hold){this.drive(this.body,{x:0,z:0},dt);if(this.settled(this.body)){if(this.restQueued){this.restQueued=false;this.restUntil=this.time+2.2;this.riseUntil=this.restUntil+1.4;this.event('body-rest',{duration:2});this.say('您的身体申请了两秒钟离线。','body-rest');}if(this.bowQueued){this.bowQueued=false;this.bowUntil=this.time+2.6;}}}
      else this.follow(this.body,this.shadow,dt,3.1);
      this.bodySource=this.time<this.riseUntil?'rest':this.time<this.bowUntil?'bow':'follow';
      this.settleDwell=this.leaderStopping&&this.settled(this.shadow)&&this.settled(this.body,this.shadow)?this.settleDwell+dt:0;
      if(this.settleDwell>0)this.shadowAttachment=smooth(this.settleDwell/.65);
      if(this.settleDwell>=.65){this.shadow=copy(this.body);this.event('actors-met',{distance:0});this.transition(this.mode==='teacher'?'reverse':'rejoin');}
    }else if(this.stage==='reverse'){
      if(!this.reverseStarted){
        this.drive(this.shadow,{x:0,z:0},dt);this.follow(this.body,this.shadow,dt,3.15);
        if(this.settled(this.shadow)){
          this.reverseRoute=[...this.shadowRoute.filter(p=>p.t>=this.time-8),this.routePoint(this.shadow,this.time)];
          this.reversePath=[];this.reverseLength=0;
          for(const point of [...this.reverseRoute].reverse()){
            const previous=this.reversePath.at(-1)?.point;
            if(previous){const segment=dist(previous,point);if(segment<.003)continue;this.reverseLength+=segment;}
            this.reversePath.push({distance:this.reverseLength,point});
          }
          this.reverseDuration=Math.max(2,this.reverseLength/2.25+1.25);this.reverseStarted=true;this.reverseClock=0;this.shadowSource='reverse';
          this.event('reverse-start',{duration:this.reverseDuration,length:this.reverseLength,retiming:'arc-length with eased start and stop',sourceWindow:8});
        }
      }else if(this.reverseClock<this.reverseDuration){
        this.reverseClock=Math.min(this.reverseDuration,this.reverseClock+dt);
        const distance=this.reverseLength*easedRouteTime(this.reverseClock,this.reverseDuration)/this.reverseDuration;
        const right=this.reversePath.find(p=>p.distance>=distance)??this.reversePath.at(-1)!;
        const index=this.reversePath.indexOf(right),left=this.reversePath[Math.max(0,index-1)];
        const f=right.distance>left.distance?(distance-left.distance)/(right.distance-left.distance):0;
        const p={x:left.point.x+(right.point.x-left.point.x)*f,z:left.point.z+(right.point.z-left.point.z)*f};
        this.follow(this.shadow,p,dt,3.15);recordedShadow=false;
        this.follow(this.body,this.shadow,dt,3.15);
        if(this.reverseClock>3)this.once('reverse-reveal',()=>this.say('影子把你刚才的意思，当成了现在的命令。','reverse-reveal'));
      }else{
        this.follow(this.shadow,this.reversePath.at(-1)!.point,dt,3.15);this.follow(this.body,this.shadow,dt,3.15);
        this.settleDwell=this.settled(this.shadow)&&this.settled(this.body,this.shadow)?this.settleDwell+dt:0;
        if(this.settleDwell>0)this.shadowAttachment=smooth(this.settleDwell/.65);
        if(this.settleDwell>=.65){this.shadow=copy(this.body);this.event('actors-met',{distance:0});this.transition('rejoin');}
      }
    }else if(this.stage==='rejoin'){
      this.move(this.body,this.input,dt,MOTION.speed,EXIT);
      this.follow(this.shadow,this.body,dt,3.4);
      if(!active&&this.settled(this.body)&&this.settled(this.shadow,this.body,.012)){this.reconnected=true;this.shadowSource='attached';}
      if(this.elapsed>=2)this.once('rejoin-reveal',()=>this.say('可以再试着走一步。出口这次真的准备好了。','exit-instruction'));
      if(this.elapsed>3&&dist(this.body,EXIT)<.55&&speed(this.body)<.4)this.finish('exit');else if(this.elapsed>=this.config.rejoin)this.finish(this.idle>6?'stillness':'lingering');
    }else if(this.stage==='curtain'){
      this.drive(this.body,{x:0,z:0},dt);this.follow(this.shadow,this.body,dt,3.4);
      if(this.settled(this.body)&&this.settled(this.shadow,this.body,.012))this.shadowAttachment=Math.min(1,this.shadowAttachment+dt/.65);
      if(!this.curtainActing&&this.shadowAttachment===1&&this.settled(this.body)&&this.settled(this.shadow,this.body,.012)){this.curtainActing=true;this.curtainClock=0;this.event('curtain-united',{distance:dist(this.body,this.shadow)});}
      if(this.curtainActing){this.curtainClock+=dt;if(this.curtainClock>=3.6){this.stage='ended';this.event('title-reveal');}}
    }
    const bodySpeed=dist(oldB,this.body)/dt,shadowSpeed=dist(oldS,this.shadow)/dt;
    if(!recordedBody){
      const animation:Animation=this.curtainActing?(this.ending==='stillness'?'sit':'bow'):this.time<this.restUntil?'sit':this.time<this.riseUntil?'rise':this.time<this.bowUntil?'bow':bodySpeed>.07?(this.stage==='follow'?'chase':'walk'):this.idle>6?'look':'idle';
      this.animate(this.body,animation,dt,bodySpeed);
    }
    if(this.shadowSource==='attached')this.shadowAttachment=Math.min(1,this.shadowAttachment+dt/.65);
    if(this.stage==='arrival'||this.shadowSource==='attached'&&this.shadowAttachment===1)this.shadow=copy(this.body);
    else if(!recordedShadow){
      // Once united, both actors perform the same bow/sit, including every bone and cloth movement.
      if(this.curtainActing)this.shadow=copy(this.body);
      else if(this.time<this.bowUntil&&shadowSpeed<.08)this.animate(this.shadow,'bow',dt,0);
      else this.animate(this.shadow,shadowSpeed>.07?'walk':bodySpeed>.15&&dist(this.body,this.shadow)>.5?'struggle':'idle',dt,shadowSpeed);
    }
    const quiet=this.stage==='echo'&&this.elapsed<6;
    if(!quiet&&!['curtain','ended','return'].includes(this.stage)&&!this.line&&this.elapsed>8){
      if(this.idle>6)this.once(`${this.stage}-idle`,()=>this.say('您似乎决定留一会儿。那我也把话说慢一点。','no-input-6s',5,true));
      else if(dist(this.body,PLANT)<1.9)this.once('planter',()=>this.say('花盆原本没有戏份。它现在有了。','near-planter'));
      else if(this.turns>=6)this.once('turns',()=>this.say('您似乎很想改写这条路线。我更新一下说明书。','direction-changes',5,true));
    }
    if(this.stage==='arrival')this.route.push(this.routePoint(this.body,this.elapsed));
    this.shadowRoute.push(this.routePoint(this.shadow,this.time));if(this.tick%2===0||this.stage==='ended')this.record();
  }
  snapshot():Frame{return {t:this.time,stage:this.stage,elapsed:this.elapsed,body:copy(this.body),shadow:copy(this.shadow),shadowAttachment:this.shadowAttachment,input:{...this.input},target:this.target,bodySource:this.bodySource,shadowSource:this.shadowSource,line:this.line,lineId:this.lineId,goal:this.goal,mode:this.mode,ending:this.ending};}
  record(){this.frames.push(this.snapshot());}
  export(){return {schemaVersion:3,build:'0.3.0',assetVersion:'actor-2',mode:this.mode,duration:this.time,systemDemo:this.systemDemo,ending:this.ending,events:this.events,frames:this.frames};}
}
export function frameAt(frames:Frame[],time:number):Frame {
  let lo=0,hi=frames.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(frames[m].t<=time)lo=m;else hi=m-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],f=b.t>a.t?clamp((time-a.t)/(b.t-a.t),0,1):0;
  return {...a,t:time,body:mixActor(a.body,b.body,f),shadow:mixActor(a.shadow,b.shadow,f),shadowAttachment:a.shadowAttachment+(b.shadowAttachment-a.shadowAttachment)*f};
}
