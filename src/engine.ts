import {SHADOW_SLOPE} from './lighting.ts';
import {FOLLOW_BEATS} from './direction.ts';
import {steer,angleDelta,type SteeredMotion} from './locomotion.ts';
import {MOTION,facing,velocity,arrival,magnet,easedRouteTime,smooth,clamp,type Motion} from './motion.ts';
export type Mode = 'student' | 'teacher';
export type Stage = 'arrival' | 'return' | 'echo' | 'follow' | 'reverse' | 'rejoin' | 'curtain' | 'ended';
export const ANIMATIONS = ['idle','walk','chase','look','shrug','sit','rise','bow','turn','struggle','surprise','reach','pivot_left','pivot_right'] as const;
export type Animation = typeof ANIMATIONS[number];
export type Vec = { x:number; z:number };
export type LookTarget = Vec & {height?:number};
export type Actor = SteeredMotion & {animation:Animation;animTime:number;previous:Animation;previousTime:number;blend:number;pace:number;gaitPhase:number;gazeYaw:number;lookYaw:number;lookPitch:number;lookWeight:number;weights:Record<Animation,number>;clocks:Record<Animation,number>};
export type Visual = {body:Float32Array;shadow:Float32Array};
export type Frame = {t:number;stage:Stage;elapsed:number;body:Actor;shadow:Actor;shadowAttachment:number;input:Vec;target:string;bodySource:string;shadowSource:string;line:string;lineId:number;goal:boolean;mode:Mode;ending:string;beat:string;beatPhase:string;actionLabel:string;cue:Vec|null;doorOpen:number;signTurn:number;visual?:Visual};
export type Event = {t:number;type:string;[key:string]:unknown};
export type RoutePoint = Actor & {t:number};
export const HOME={x:-2.4,z:2.2},EXIT={x:5.4,z:-3.5},BOW={x:1.8,z:-.3},LEFT={x:-3.8,z:-1.5},PLANT={x:-5.8,z:.1,radius:.85};
export const BOUNDS={left:-7.15,right:7.15,top:-3.9,bottom:4.4};
export const CONFIG={student:{arrival:30,echoMax:30,rejoin:22},teacher:{arrival:30,echoMax:30,rejoin:24}};
export const SOURCES:Record<string,string>={input:'当前输入',attached:'随身体投影','recorded-body':'本局身体旧路线','system-demo':'系统代演','system-return':'系统归位',follow:'追随影子',rest:'预设休息动作',bow:'谢幕动作',reverse:'本局影子路线倒放',reconnect:'从当前位置恢复跟随',curtain:'落幕动作',none:'无直接控制',shadow:'影子',body:'身体','settling':'减速并等待会合',reaction:'预设惊讶与迟疑',"reaction-step":'影子试着跟上又收住',"stage-mark":'走向谢幕圈',gesture:'角色的舞台反应'};
export const dist=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.z-b.z);
const copy=<T>(v:T):T=>structuredClone(v);
const position=(a:Vec)=>({x:a.x,z:a.z});
const speed=(a:Motion)=>Math.hypot(a.vx,a.vz);
const table=(value=0)=>Object.fromEntries(ANIMATIONS.map(n=>[n,value])) as Record<Animation,number>;
export function angleMix(a:number,b:number,f:number){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*f;}
export function actor(p:Vec):Actor {const weights=table();weights.idle=1;return {...p,vx:0,vz:0,ax:0,az:0,yaw:.7,yawVelocity:0,travelYaw:.7,turnWait:0,pivoting:false,pivotPhase:0,gazeYaw:.7,animation:'idle',animTime:0,previous:'idle',previousTime:0,blend:1,pace:1,gaitPhase:0,lookYaw:0,lookPitch:0,lookWeight:0,weights,clocks:table()};}
export function mixActor(a:Actor,b:Actor,f:number):Actor {
  const out=copy(a);for(const key of ['x','z','vx','vz','ax','az','yawVelocity','gaitPhase','pivotPhase','turnWait','pace','blend','lookYaw','lookPitch','lookWeight'] as const)out[key]=a[key]+(b[key]-a[key])*f;
  out.yaw=angleMix(a.yaw,b.yaw,f);out.gazeYaw=angleMix(a.gazeYaw,b.gazeYaw,f);out.travelYaw=angleMix(a.travelYaw,b.travelYaw,f);
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
  homeDwell=0;settleDwell=0;leaderStopping=false;reverseStarted=false;reverseClock=0;reverseDuration=12;reconnected=false;curtainActing=false;curtainClock=0;bowQueued=false;restQueued=false;
  stride=1.0;runStride=2.48;echoWindow=0;echoOffset:Vec={x:0,z:0};shadowAttachment=1;
  reversePath:{distance:number;point:RoutePoint}[]=[];reverseLength=0;
  bodyNoticeAt=-100;bodyNoticeHold=.65;bodyNoticeKind='';bodyNoticeCooldown=0;bodyAwaitingLead=true;bodyWasMoving=false;leadHeading:number|null=null;
  shadowNoticeAt=-100;shadowNoticeCount=0;shadowAttemptTarget:Vec|null=null;bodyActing:Animation|null=null;shadowActing:Animation|null=null;
  bodyLook:LookTarget|null=null;shadowLook:LookTarget|null=null;
  arrivalBeat:'door'|'home'='door';followIndex=0;beatTime=0;beatComplete=false;cue:Vec|null={...EXIT};cueDwell=0;
  gestureUntil=0;gesture:Animation='shrug';doorOpen=0;signTurn=0;reverseSourceEnd=0;echoClock=0;echoReady=false;echoPoseFrom:Actor|null=null;

  beatPhase='';beatResolvedAt=-1;beatOutcome='';beatOrigin:Vec={...HOME};beatAnchor:Vec={...HOME};beatTravel=0;beatStartedAt=0;phaseAt=0;actionPending=false;doorDemand=0;reverseSourceStart=0;

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
    const top=this.stage==='curtain'&&this.ending==='exit'&&Math.abs(a.x-EXIT.x)<1? -5.65:BOUNDS.top;
    desired={x:clamp(desired.x,-Math.max(0,a.x-BOUNDS.left)*3,Math.max(0,BOUNDS.right-a.x)*3),z:clamp(desired.z,-Math.max(0,a.z-top)*3,Math.max(0,BOUNDS.bottom-a.z)*3)};
    const dx=a.x-PLANT.x,dz=a.z-PLANT.z,d=Math.hypot(dx,dz),inward=(desired.x*dx+desired.z*dz)/(d||1),clearance=d-PLANT.radius-.3;
    if(inward<0&&clearance<1){const limit=-Math.max(0,clearance)*3;if(inward<limit){desired.x+=(limit-inward)*dx/d;desired.z+=(limit-inward)*dz/d;}}
    steer(a,desired,dt);if(top===BOUNDS.top)this.constrain(a);else{a.x=clamp(a.x,BOUNDS.left,BOUNDS.right);a.z=clamp(a.z,top,BOUNDS.bottom);}
    if(a.pivoting){
      const gaze={x:a.x+Math.sin(a.travelYaw)*3,z:a.z+Math.cos(a.travelYaw)*3,height:1.35};
      if(a===this.body&&!this.bodyLook)this.bodyLook=gaze;
      if(a===this.shadow&&!this.shadowLook)this.shadowLook=gaze;
    }
  }
  move(a:Actor,direction:Vec,dt:number,max=MOTION.speed,mark?:Vec){this.drive(a,magnet(a,{x:direction.x*max,z:direction.z*max},mark),dt);}
  follow(a:Actor,target:Vec,dt:number,max=MOTION.followSpeed){
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
    if(a.pivoting&&actualSpeed<.18&&a.turnWait===0){
      wanted[a.yawVelocity>0?'pivot_left':'pivot_right']=smooth(Math.abs(a.yawVelocity)/1.1);wanted.idle=1-wanted.pivot_left-wanted.pivot_right;
    }else if(animation==='walk'||animation==='chase'){
      const weight=smooth(actualSpeed/.55);const chase=run;
      wanted.walk=weight*(1-chase);wanted.chase=weight*chase;wanted.idle=1-weight;
    }else wanted[animation]=1;
    const amount=1-Math.exp(-dt*(animation==='sit'?3.5:7.5));
    for(const name of ANIMATIONS){a.weights[name]+=(wanted[name]-a.weights[name])*amount;a.clocks[name]+=dt;}
    a.animTime=a.clocks[animation];a.pace=actualSpeed/2.3;a.blend=a.weights[animation];
  }
  lookAt(a:Actor,target:LookTarget|null,dt:number){
    const amount=1-Math.exp(-dt*10),wanted=target?Math.atan2(target.x-a.x,target.z-a.z):a.yaw;
    // Smooth a direction in world space. As the torso catches up, compensate its
    // rotation immediately instead of leaving a delayed head wag after the turn.
    a.gazeYaw=angleMix(a.gazeYaw,wanted,amount);
    a.lookYaw=clamp(angleDelta(a.yaw,a.gazeYaw),-1.25,1.25);
    const pitch=target?clamp(Math.atan2(1.55-(target.height??0),Math.max(.4,dist(a,target)))*.72,-.25,.85):0;
    a.lookPitch+=(pitch-a.lookPitch)*(1-Math.exp(-dt*8));
    a.lookWeight+=((target?1:0)-a.lookWeight)*(1-Math.exp(-dt*9));
  }
  shadowGaze():LookTarget{return {x:this.shadow.x+SHADOW_SLOPE.x*1.15,z:this.shadow.z+SHADOW_SLOPE.z*1.15,height:0};}
  noticeBody(reason:string,hold=1.05){
    this.bodyNoticeAt=this.time;this.bodyNoticeHold=hold;this.bodyNoticeKind=reason;this.bodyNoticeCooldown=this.time+2.3;this.bodyAwaitingLead=false;
    this.event('reaction',{actor:'body',reason,lookFirst:reason==='first-departure'?.32:hold,hold,ramp:1.0});
  }
  followWithReaction(dt:number,max=MOTION.followSpeed,settling=false){
    const separation=dist(this.body,this.shadow),leaderSpeed=speed(this.shadow);
    this.bodyLook=this.shadowGaze();
    if(settling){this.follow(this.body,this.shadow,dt,max);return;}
    const moving=leaderSpeed>.24;
    const heading=moving?Math.atan2(this.shadow.vx,this.shadow.vz):null;
    if(this.bodyAwaitingLead){
      if(separation>.45)this.noticeBody('first-departure');
      else {this.drive(this.body,{x:0,z:0},dt);return;}
    }else if(this.time>this.bodyNoticeCooldown&&separation>.55){
      if(heading!==null&&this.leadHeading!==null&&Math.abs(Math.atan2(Math.sin(heading-this.leadHeading),Math.cos(heading-this.leadHeading)))>1.05)this.noticeBody('direction-change',.28);
      else if(moving&&!this.bodyWasMoving&&speed(this.body)<.16)this.noticeBody('starts-again',.4);
    }
    if(heading!==null&&(this.leadHeading===null||this.time<=this.bodyNoticeAt+.04||!moving))this.leadHeading=heading;
    // The heading reference follows gradually, so slow turns do not repeatedly restart a reaction.
    if(heading!==null)this.leadHeading=angleMix(this.leadHeading??heading,heading,1-Math.exp(-dt*2));
    this.bodyWasMoving=moving;
    const since=this.time-this.bodyNoticeAt;
    const pace=smooth((since-this.bodyNoticeHold)/1.0);
    this.follow(this.body,this.shadow,dt,max*pace);
    if(since<this.bodyNoticeHold&&speed(this.body)<.18)this.bodyActing=this.bodyNoticeKind==='first-departure'&&since>.32?'surprise':'idle';
    if(since<this.bodyNoticeHold+1)this.bodySource='reaction';
  }
  reactShadow(dt:number,active:boolean){
    const separation=dist(this.body,this.shadow);
    this.shadowLook=separation>.75?{...this.body,height:1.4}:null;
    if(!(this.stage==='echo'&&this.echoClock<6)&&!active&&speed(this.body)>.24&&speed(this.shadow)<.12&&separation>.65&&this.shadowNoticeCount<2&&this.time-this.shadowNoticeAt>8){
      this.shadowNoticeAt=this.time;this.shadowNoticeCount++;this.shadowAttemptTarget=null;
      this.event('reaction',{actor:'shadow',reason:'body-left-without-me',hold:.65,attemptDistance:.48});
    }
    const since=this.time-this.shadowNoticeAt;
    if(active){this.shadowNoticeAt=Math.min(this.shadowNoticeAt,this.time-3);this.move(this.shadow,this.input,dt);this.shadowSource='input';return;}
    if(since<.65){this.drive(this.shadow,{x:0,z:0},dt);this.shadowActing='surprise';this.shadowSource='reaction';}
    else if(since<1.65){
      if(!this.shadowAttemptTarget){const d=dist(this.body,this.shadow)||1;this.shadowAttemptTarget={x:this.shadow.x+(this.body.x-this.shadow.x)/d*.48,z:this.shadow.z+(this.body.z-this.shadow.z)/d*.48};this.event('shadow-attempt',{toward:position(this.body),target:this.shadowAttemptTarget});}
      this.follow(this.shadow,this.shadowAttemptTarget,dt,.72*smooth((since-.65)/.35));this.shadowSource='reaction-step';
    }else if(since<2.65){this.drive(this.shadow,{x:0,z:0},dt);if(speed(this.shadow)<.12)this.shadowActing='reach';this.shadowSource='reaction';}
    else {this.move(this.shadow,this.input,dt);this.shadowSource='input';}
  }
  actionLabel(){
    if(this.stage==='rejoin')return dist(this.body,EXIT)<1?'从这里离场':'就留在这里';
    if(this.stage!=='follow'||this.leaderStopping)return '';
    if(this.beatResolvedAt>=0&&!(this.stageBeat()==='rest'&&this.time<this.restUntil))return '';
    const id=FOLLOW_BEATS[this.mode][this.followIndex].id;
    if(id==='search'&&this.beatPhase==='found')return '';
    return id==='meet'?'敲敲门':id==='parting'?'叫上搭档':id==='search'?'我在这里':id==='rest'?'叫他起来':id==='bow'?'还没演完':'就演到这里';
  }
  interact(){
    if(this.paused||!this.actionLabel())return;
    this.actionPending=true;this.event('interaction',{stage:this.stage,beat:this.stageBeat(),action:this.actionLabel(),body:position(this.body),shadow:position(this.shadow)});
  }
  enterFollowBeat(index:number){
    this.followIndex=index;this.beatTime=0;this.beatComplete=false;this.cueDwell=0;this.beatResolvedAt=-1;this.beatOutcome='';this.beatPhase='invitation';this.beatStartedAt=this.time;this.phaseAt=this.time;this.beatTravel=0;this.actionPending=false;
    this.beatOrigin=position(this.body);this.beatAnchor=position(this.body);
    const beat=FOLLOW_BEATS[this.mode][index];
    this.cue=beat.id==='meet'?{...EXIT}:beat.id==='bow'?{...BOW}:null;
    if(beat.id==='parting'){
      this.beatPhase='step-back';this.beatAnchor={x:this.body.x-1.2,z:this.body.z+1.6};this.constrain(this.beatAnchor);this.doorDemand=0;
    }
    if(beat.id==='search')this.beatPhase='looking-away';
    if(beat.id==='rest'){this.restQueued=true;this.beatPhase='sitting-down';}
    this.event('beat',{stage:'follow',beat:beat.id,maximum:beat.max,target:this.cue,advance:'interaction-or-visible-response'});
    this.say(beat.line,`beat-${beat.id}`,8);
  }
  resolveBeat(outcome:string,line:string,response=1.6){
    if(this.beatResolvedAt>=0)return;
    this.beatComplete=true;this.beatOutcome=outcome;this.beatResolvedAt=this.time+response;
    this.event('beat-outcome',{beat:this.stageBeat(),outcome,response});
    this.say(line,`outcome-${outcome}`,response+1);
  }
  stageBeat(){return this.stage==='arrival'?this.arrivalBeat:this.stage==='follow'?FOLLOW_BEATS[this.mode][this.followIndex].id:this.stage;}
  performArrival(dt:number,old:Vec){
    this.move(this.body,this.input,dt,MOTION.speed,this.cue??undefined);this.distance+=dist(old,this.body);
    if(this.arrivalBeat==='door'&&dist(this.body,EXIT)<.8){
      this.goal=true;this.arrivalBeat='home';this.cue={...HOME};this.event('target-entered',{target:'door'});
      this.say('认得这扇门了。现在回白圈，我们就开始。','return-instruction',7);
    }
    this.homeDwell=this.arrivalBeat==='home'&&dist(this.body,HOME)<.35&&speed(this.body)<.3?this.homeDwell+dt:0;
    if(this.homeDwell>.35)this.transition('return','returned-to-home');
    else if(this.elapsed>=this.config.arrival){
      this.transition('return','opening-alternative');
      if(!this.systemDemo)this.say('就用你刚才走的这一段。演员，回到开头。','opening-alternative',4);
    }else if(this.elapsed>14&&!this.goal)this.once('door-late',()=>this.say('门在右边。也可以不去；你走的路一样算数。','target-not-entered',6));
  }
  performFollow(dt:number){
    const beats=FOLLOW_BEATS[this.mode],beat=beats[this.followIndex];this.beatTime+=dt;
    const action=this.actionPending;this.actionPending=false;
    const old=position(this.shadow),active=Math.hypot(this.input.x,this.input.z)>.1;
    this.move(this.shadow,this.leaderStopping?{x:0,z:0}:this.input,dt,MOTION.speed,this.leaderStopping?undefined:this.cue??undefined);this.beatTravel+=dist(old,this.shadow);
    this.shadowSource=this.leaderStopping?'settling':'input';this.bodySource='follow';
    const gap=dist(this.body,this.shadow);
    if(this.leaderStopping){
      this.target='none';this.followWithReaction(dt,MOTION.followSpeed,true);
    }else if(beat.id==='meet'){
      this.followWithReaction(dt);
      // The leaf visibly acknowledges the first arrival, then refuses two.
      this.doorDemand=dist(this.shadow,EXIT)<1.6?.38:0;
      this.cueDwell=dist(this.shadow,EXIT)<.8&&gap<.75&&speed(this.body)<.4?this.cueDwell+dt:0;
      if(this.cueDwell>.35&&this.beatResolvedAt<0){
        this.doorDemand=0;this.gesture='shrug';this.gestureUntil=this.time+1.8;
        this.event('beat-goal',{beat:beat.id,target:EXIT});
        this.resolveBeat('door-count','门刚开了一条缝，又关上了。它数到了两位。',2.1);
      }
      if(action&&this.beatResolvedAt<0){
        if(dist(this.shadow,EXIT)<2.2){this.doorDemand=.6;this.event('door-knock');this.say('门听见了。现在等后面那位。','door-knock',4);}
        else this.say('敲门声够不到。先靠近右边那扇门。','knock-too-far',3);
      }
      if(this.beatResolvedAt>=0){this.doorDemand=0;this.bodyLook={...EXIT,height:2};if(speed(this.body)<.15)this.bodyActing='shrug';}
    }else if(beat.id==='parting'){
      if(this.beatPhase==='step-back'&&!action&&this.beatResolvedAt<0){
        this.follow(this.body,this.beatAnchor,dt,1.6);
        if(this.settled(this.body,this.beatAnchor,.08)){this.beatPhase='choice';this.phaseAt=this.time;this.cue=position(this.body);}
      }else{
        this.drive(this.body,{x:0,z:0},dt);this.bodyLook=this.shadowGaze();
        if(action||this.beatPhase==='choice'&&gap<.9&&dist(this.shadow,EXIT)>1.1){
          this.bodyActing='reach';this.doorDemand=.2;this.resolveBeat('called-partner','好，一个也不落下。我把名单改成两位。',1.8);
        }else if(this.beatPhase==='choice'&&active&&dist(this.shadow,EXIT)<1&&gap>1.5){
          this.bodyActing='reach';this.doorDemand=.8;this.resolveBeat('went-ahead','门开了。可身体没有同意被留在这里。',2.2);
        }
        if(this.beatResolvedAt>=0)this.bodyActing='reach';
      }
    }else if(beat.id==='search'){
      if(this.beatPhase==='looking-away'){
        this.drive(this.body,{x:0,z:0},dt);this.bodyLook={...EXIT,height:2};
        const dx=this.shadow.x-this.body.x,dz=this.shadow.z-this.body.z;
        const behind=gap>1.2&&(dx*Math.sin(this.body.yaw)+dz*Math.cos(this.body.yaw))/gap<-.25;
        if(behind){this.beatPhase='lost';this.phaseAt=this.time;this.event('lost-sight');this.say('等等，刚才还在这一边……','lost-sight',4);}
        if(action){this.beatPhase='found';this.noticeBody('called-from-here',.45);this.event('partner-called');}
      }else if(this.beatPhase==='lost'){
        this.drive(this.body,{x:0,z:0},dt);
        const scan=this.body.yaw+Math.sin(Math.min(1.5,this.time-this.phaseAt)*2)*.7;
        this.bodyLook={x:this.body.x+Math.sin(scan)*2,z:this.body.z+Math.cos(scan)*2,height:.5};
        if(action||this.time-this.phaseAt>1.2){this.beatPhase='found';this.noticeBody('found-behind',.6);this.event('partner-found');}
      }else{
        this.followWithReaction(dt);
        if(gap<.75&&speed(this.body)<.4)this.resolveBeat('found-partner','找到了。原来搭档也会躲猫猫。',1.4);
      }
    }else if(beat.id==='rest'){
      this.drive(this.body,{x:0,z:0},dt);this.bodyLook=this.shadowGaze();this.bodySource='rest';
      if(action&&this.beatPhase==='rest-together'){this.restUntil=this.time;this.riseUntil=this.time+1.4;this.beatPhase='rising';this.beatResolvedAt=this.riseUntil;this.event('rest-interrupted');this.say('好，现在起身。','rest-interrupted',2);}
      if(action&&this.restQueued){this.restQueued=false;this.beatPhase='called-before-sitting';this.bodyActing='reach';this.resolveBeat('called-before-sitting','刚要坐下，又被你叫住了。好，一起走。',1.6);}
      if(this.restQueued&&this.settled(this.body)){
        this.restQueued=false;this.restUntil=this.time+beat.max;this.riseUntil=this.restUntil+1.4;this.phaseAt=this.time;this.beatPhase='resting';this.event('body-rest',{interruptible:true});
      }
      if(this.beatPhase==='resting'&&this.time-this.phaseAt>.7){
        if(action||active&&gap>2.8){
          this.restUntil=this.time;this.riseUntil=this.time+1.4;this.beatPhase='rising';
          this.resolveBeat(action?'woken':'followed-with-eyes',action?'听见了。先撑起身子，再跟你走。':'腿还想歇着，眼睛已经跟过去了。',1.8);
        }else if(gap<1.1&&!active&&speed(this.shadow)<.12){
          this.beatPhase='rest-together';this.phaseAt=this.time;this.restUntil=this.time+1.6;this.riseUntil=this.restUntil+1.4;
          this.resolveBeat('rested-together','影子也坐下了。旁白只好把催促收回去。',3.1);
        }
      }
      if(this.beatPhase==='rest-together')this.shadowActing=this.time<this.restUntil?'sit':'rise';
    }else if(beat.id==='bow'){
      this.bodySource='stage-mark';
      if(action&&this.beatResolvedAt<0){
        this.bowQueued=false;this.bowUntil=this.time;this.gesture='shrug';this.gestureUntil=this.time+1.8;this.event('bow-declined',{reason:'player-response'});
        this.resolveBeat('encore-requested','影子说还没演完。身体把谢幕收了回去。',1.8);
      }
      if(this.beatOutcome==='encore-requested'){
        this.drive(this.body,{x:0,z:0},dt);this.bodyLook=this.shadowGaze();this.bodyActing='shrug';
      }else if(this.beatPhase==='invitation'){
        this.follow(this.body,BOW,dt,MOTION.demoSpeed);
        if(this.settled(this.body,BOW,.06)){
          this.beatPhase='bowing';this.bowUntil=this.time+2.6;this.phaseAt=this.time;this.event('bow',{target:'bow-mark'});
          this.say('身体鞠躬了。影子，可以有自己的动作。','bow',4);
        }
      }else{
        this.drive(this.body,{x:0,z:0},dt);this.bodySource='bow';
        if(gap<1&&speed(this.shadow)<.2){this.shadowActing='bow';this.once('shared-bow',()=>this.event('shadow-bow'));}
        if(this.time>=this.bowUntil)this.resolveBeat(this.fired.has('shared-bow')?'bowed-together':'bowed-apart',this.fired.has('shared-bow')?'这次，他们一起谢幕。':'身体谢幕了。影子把它当成了开场。',1.5);
      }
    }else{
      this.followWithReaction(dt);
      if(action||this.beatTravel>2.5&&!active&&this.idle>.7&&speed(this.shadow)<.15){
        this.resolveBeat('improvisation-finished','记下了。刚才的那段动作，还有自己的主意。',1.4);this.stopLeading();
      }
    }
    if(gap>.75)this.shadowLook={...this.body,height:1.4};
    if(!this.leaderStopping){
      if(this.beatTime>=beat.max&&this.beatResolvedAt<0){
        // A non-participating player still gets an honest, visible alternate scene.
        if(beat.id==='rest'){this.restQueued=false;this.restUntil=this.time;this.riseUntil=this.time+1.4;}
        const lines:Record<string,string>={meet:'门没有等到我们。先商量一下，谁带谁走。',parting:'谁也没先走。身体决定：一起吧。',search:'还没会合。没关系，下一幕也可以边走边找。',rest:'这次休息够了。身体自己站起来。',bow:'谢幕没有按计划发生。那就让结尾自己来。',encore:'这一段，就记到这里。安静也是刚才的一部分。'};
        this.event('beat-fallback',{beat:beat.id,reason:'no-resolution'});this.resolveBeat('alternate',lines[beat.id],1.8);
      }
      if(this.beatResolvedAt>=0&&this.time>=this.beatResolvedAt&&this.time>=this.riseUntil&&this.time>=this.bowUntil){
        this.restQueued=false;this.cue=null;
        if(this.mode==='student'&&beat.id==='bow'&&this.beatOutcome!=='encore-requested')this.stopLeading();
        else if(this.followIndex<beats.length-1)this.enterFollowBeat(this.followIndex+1);else this.stopLeading();
      }
    }
    this.settleDwell=this.leaderStopping&&this.settled(this.shadow)&&this.settled(this.body,this.shadow)?this.settleDwell+dt:0;
    if(this.settleDwell>0)this.shadowAttachment=smooth(this.settleDwell/.65);
    if(this.settleDwell>=.65&&this.time>=this.beatResolvedAt){
      this.shadow=copy(this.body);this.event('actors-met',{distance:0});
      this.reverseRoute.push(...this.shadowRoute.filter(p=>p.t>this.reverseSourceEnd),this.routePoint(this.shadow,this.time));
      this.transition(this.mode==='teacher'?'reverse':'rejoin');
    }
  }
  routePoint(a:Actor,t:number):RoutePoint{return {...copy(a),t};}
  settled(a:Actor,target?:Vec,tolerance=.035){return speed(a)<.06&&(!target||dist(a,target)<tolerance);}
  makeDemo(){
    const a=actor(HOME),route=[this.routePoint(a,0)];let t=0,index=0,dwell=0;const marks=[{x:.7,z:1.2},{x:2,z:-.8},HOME];
    while(index<marks.length&&t<16){this.follow(a,marks[index],1/60,MOTION.demoSpeed);this.animate(a,speed(a)>.07?'walk':'idle',1/60);this.lookAt(a,a.pivoting?{x:a.x+Math.sin(a.travelYaw)*3,z:a.z+Math.cos(a.travelYaw)*3,height:1.35}:null,1/60);t+=1/60;route.push(this.routePoint(a,t));if(this.settled(a,marks[index]))dwell+=1/60;else dwell=0;if(dwell>.35){index++;dwell=0;}}
    return route;
  }
  transition(next:Stage,reason='automatic'){
    if(this.stage==='ended')return;this.event('transition',{from:this.stage,to:next,reason});this.stage=next;this.elapsed=0;this.settleDwell=0;this.line='';this.lineId=-1;this.lineUntil=0;this.event('stage',{stage:next});
    if(next==='return'){
      this.shadowAttachment=0;
      this.target='shadow';this.bodySource='system-return';this.shadowSource='input';
      if(this.distance<1){this.systemDemo=true;this.route=this.makeDemo();this.say('这一场很安静。接下来由影子代演一小段。','system-demo',3.5);this.event('system-demo');}
      else {
        // A completed rehearsal has enough real material; preserve its pauses.
        // If the opening ran over the budget, use the first actual bounded window.
        this.route=this.route.filter(p=>p.t<=this.config.echoMax);
        if(dist(this.body,HOME)>.2)this.say('身体正回到刚才出发的位置。','system-return',3.5);
      }
      this.echoWindow=this.route.at(-1)!.t;this.cue=null;
      this.event('route-window',{start:0,end:this.echoWindow,selection:'original-first-window-with-pauses'});this.event('system-return',{from:position(this.body),to:HOME});
    }else if(next==='echo'){
      this.target='shadow';this.bodySource=this.systemDemo?'system-demo':'recorded-body';this.shadowSource='input';this.echoClock=0;this.echoReady=false;
      this.echoOffset={x:this.body.x-this.route[0].x,z:this.body.z-this.route[0].z};

    }else if(next==='follow'){
      this.target='shadow';this.bodySource='follow';this.shadowSource='input';this.leaderStopping=false;this.bodyAwaitingLead=true;this.leadHeading=null;this.enterFollowBeat(0);
    }else if(next==='reverse'){
      this.target='none';this.bodySource='follow';this.shadowSource='settling';this.reverseStarted=false;this.reverseClock=0;this.shadowAttachment=0;this.bodyAwaitingLead=true;this.leadHeading=null;
    }else if(next==='rejoin'){
      this.target='body';this.bodySource='input';this.shadowSource='attached';this.reconnected=true;this.shadowAttachment=1;this.cue={...EXIT};this.event('control-returned');this.actionPending=false;this.say('现在，离开或留下都可以。这一次，由你收尾。','exit-instruction',8);
    }
  }
  stopLeading(){
    if(this.leaderStopping)return;
    this.leaderStopping=true;this.cue=null;
    this.reverseSourceEnd=this.time;this.reverseSourceStart=Math.max(this.time-8,this.mode==='teacher'&&this.stageBeat()==='encore'?this.beatStartedAt:0);this.reverseRoute=this.shadowRoute.filter(p=>p.t>=this.reverseSourceStart);this.reverseRoute.push(this.routePoint(this.shadow,this.time));
    this.event('lead-window-end',{sourceEnd:this.time,sourceStart:this.reverseSourceStart});
  }
  skip(){
    if(this.stage==='ended'||this.stage==='curtain')return;this.event('host-skip',{stage:this.stage});
    if(this.stage==='arrival')this.transition('return','host-skip');
    else if(this.stage==='echo')this.transition('follow','host-skip');
    else if(this.stage==='follow')this.stopLeading();
    else if(this.stage==='reverse')this.reverseClock=this.reverseDuration; // still settle naturally before reconnecting
    else if(this.stage==='rejoin')this.finish('host-ended');
  }
  finish(ending:string){
    if(this.stage==='ended'||this.stage==='curtain')return;
    this.ending=ending;this.cue=null;this.stage='curtain';this.elapsed=0;this.target='none';this.bodySource='curtain';this.shadowSource='curtain';this.curtainActing=false;this.curtainClock=0;this.event('ending',{ending});
    const text:Record<string,string>={exit:'他们终于走到一起。出口松了一口气。',stillness:'他们都坐下了。没有谁需要先离开。',lingering:'出口等了很久。后来，它也下班了。','host-ended':'这一次，导演替演出落了幕。','player-ended':'这一场，就停在这里。庭院记得你来过。'};this.say(text[ending],'ending',20);
  }
  step(dt=1/60){
    if(this.paused||this.stage==='ended')return;
    this.time+=dt;this.elapsed+=dt;this.tick++;
    if(this.stage==='follow')this.doorOpen+=(this.doorDemand-this.doorOpen)*(1-Math.exp(-dt*3));
    const oldB=position(this.body),oldS=position(this.shadow),active=Math.hypot(this.input.x,this.input.z)>.1;
    this.idle=active?0:this.idle+dt;if(this.time>this.lineUntil){this.line='';this.lineId=-1;}
    let recordedBody=false,recordedShadow=false;this.bodyActing=null;this.shadowActing=null;this.bodyLook=null;this.shadowLook=null;
    if(this.stage==='arrival'){
      this.performArrival(dt,oldB);
    }else if(this.stage==='return'){
      this.reactShadow(dt,active);this.follow(this.body,HOME,dt,MOTION.catchUpSpeed);
      if(this.settled(this.body,HOME)){this.settleDwell+=dt;}else this.settleDwell=0;
      if(this.settleDwell>.35&&this.elapsed>(this.systemDemo?3.5:0))this.transition('echo');
    }else if(this.stage==='echo'){
      if(!this.echoReady){
        // The old performance begins at its original facing. Locate that direction
        // before stepping into the recording, through the nearest turn.
        const yaw=this.route[0].yaw;
        this.bodyLook={x:this.body.x+Math.sin(yaw)*3,z:this.body.z+Math.cos(yaw)*3,height:1.35};
        velocity(this.body,{x:0,z:0},dt);this.body.pivoting=true;this.body.turnWait=0;
        facing(this.body,this.elapsed>.20?yaw:this.body.yaw,dt);
        this.body.pivotPhase+=Math.abs(this.body.yawVelocity)*dt/(Math.PI/2);
        if(Math.abs(angleDelta(this.body.yaw,yaw))<.06&&Math.abs(this.body.yawVelocity)<.18){
          this.echoReady=true;this.echoPoseFrom=copy(this.body);this.event('echo-playback-start',{routeStart:0});
        }
      }else{
        this.echoClock+=dt;
        const p=routeAt(this.route,this.echoClock),offset=1-smooth(this.echoClock/.5);
        Object.assign(this.body,p);this.body.x+=this.echoOffset.x*offset;this.body.z+=this.echoOffset.z*offset;
        const fade=smooth(this.echoClock/.45);
        if(this.echoPoseFrom&&fade<1)for(const name of ANIMATIONS){
          this.body.weights[name]=this.echoPoseFrom.weights[name]*(1-fade)+p.weights[name]*fade;
          if(p.weights[name]<1e-5)this.body.clocks[name]=this.echoPoseFrom.clocks[name]+this.echoClock;
        }
        recordedBody=true;
      }
      this.reactShadow(dt,active);
      if(this.echoClock>=6)this.once('echo-reveal',()=>this.say('……好像有人拿错了自己的部分。','control-reveal',5));
      if(this.echoClock>=this.echoWindow)this.transition('follow');
    }else if(this.stage==='follow'){
      this.performFollow(dt);
    }else if(this.stage==='reverse'){
      this.bodySource='follow';
      if(!this.reverseStarted){
        this.drive(this.shadow,{x:0,z:0},dt);this.follow(this.body,this.shadow,dt,MOTION.catchUpSpeed);
        if(this.settled(this.shadow)){
          if(!this.reverseRoute.length)this.reverseRoute=[...this.shadowRoute.filter(p=>p.t>=this.time-8),this.routePoint(this.shadow,this.time)];
          this.reversePath=[];this.reverseLength=0;
          for(const point of [...this.reverseRoute].reverse()){
            const previous=this.reversePath.at(-1)?.point;
            if(previous){const segment=dist(previous,point);if(segment<.003)continue;this.reverseLength+=segment;}
            this.reversePath.push({distance:this.reverseLength,point});
          }
          this.reverseDuration=this.reverseLength<.25?0:Math.max(2.4,this.reverseLength/MOTION.reverseSpeed+2.0);this.reverseStarted=true;this.reverseClock=0;this.shadowSource='reverse';
          this.event('reverse-start',{duration:this.reverseDuration,length:this.reverseLength,retiming:'arc-length with eased start and stop',sourceWindow:this.reverseSourceEnd-this.reverseSourceStart,sourceStart:this.reverseSourceStart,sourceEnd:this.reverseSourceEnd||this.time,settlingIncluded:true});
          if(this.reverseLength<.25)this.say('刚才的影子没有走远。这一段，原地谢过。','reverse-still',3);
        }
      }else if(this.reverseClock<this.reverseDuration){
        this.reverseClock=Math.min(this.reverseDuration,this.reverseClock+dt);
        const distance=this.reverseLength*easedRouteTime(this.reverseClock,this.reverseDuration)/this.reverseDuration;
        const right=this.reversePath.find(p=>p.distance>=distance)??this.reversePath.at(-1)!;
        const index=this.reversePath.indexOf(right),left=this.reversePath[Math.max(0,index-1)];
        const f=right.distance>left.distance?(distance-left.distance)/(right.distance-left.distance):0;
        const p={x:left.point.x+(right.point.x-left.point.x)*f,z:left.point.z+(right.point.z-left.point.z)*f};
        this.follow(this.shadow,p,dt,MOTION.catchUpSpeed);recordedShadow=false;
        this.followWithReaction(dt,MOTION.catchUpSpeed);
        if(this.reverseClock>.8)this.once('reverse-reveal',()=>this.say('影子把你刚才的意思，当成了现在的命令。','reverse-reveal'));
      }else{
        this.follow(this.shadow,this.reversePath.at(-1)!.point,dt,MOTION.catchUpSpeed);this.follow(this.body,this.shadow,dt,MOTION.catchUpSpeed);
        this.settleDwell=this.settled(this.shadow)&&this.settled(this.body,this.shadow)?this.settleDwell+dt:0;
        if(this.settleDwell>0)this.shadowAttachment=smooth(this.settleDwell/.65);
        if(this.settleDwell>=.65){this.shadow=copy(this.body);this.event('actors-met',{distance:0});this.transition('rejoin');}
      }
    }else if(this.stage==='rejoin'){
      this.move(this.body,this.input,dt,MOTION.speed,EXIT);
      this.doorOpen+=(1-this.doorOpen)*(1-Math.exp(-dt*2));
      this.follow(this.shadow,this.body,dt,MOTION.attachSpeed);
      if(!active&&this.settled(this.body)&&this.settled(this.shadow,this.body,.012)){this.reconnected=true;this.shadowSource='attached';}
      if(this.actionPending){this.actionPending=false;this.finish(dist(this.body,EXIT)<1?'exit':'stillness');}
      else if(dist(this.body,EXIT)<.8&&speed(this.body)<.5)this.finish('exit');
      else if(this.elapsed>=this.config.rejoin)this.finish(this.idle>6?'stillness':'lingering');
    }else if(this.stage==='curtain'){
      if(this.curtainActing&&this.ending==='exit'){
        this.doorOpen+=(1-this.doorOpen)*(1-Math.exp(-dt*3));
        const beyond={x:EXIT.x,z:-5.45};
        this.follow(this.body,beyond,dt,1.55);
        if(this.curtainClock>.5)this.follow(this.shadow,beyond,dt,1.55);else this.drive(this.shadow,{x:0,z:0},dt);
        this.shadowAttachment=0;
      }else{this.drive(this.body,{x:0,z:0},dt);this.follow(this.shadow,this.body,dt,MOTION.attachSpeed);}
      if(!this.curtainActing&&this.settled(this.body)&&this.settled(this.shadow,this.body,.012))this.shadowAttachment=Math.min(1,this.shadowAttachment+dt/.65);
      if(!this.curtainActing&&this.shadowAttachment===1&&this.settled(this.body)&&this.settled(this.shadow,this.body,.012)){this.curtainActing=true;this.curtainClock=0;this.event('curtain-united',{distance:dist(this.body,this.shadow)});}
      if(this.curtainActing){
        this.curtainClock+=dt;
        if(this.ending==='lingering'){this.signTurn=smooth(this.curtainClock/2.2);this.shadowAttachment=0;this.bodyLook=this.shadowGaze();}
        const duration=this.ending==='exit'?6.8:5.8;
        if(this.curtainClock>=duration&&(this.ending!=='exit'||this.settled(this.body)&&this.settled(this.shadow))){this.stage='ended';this.event('title-reveal');}
      }
    }
    const bodySpeed=dist(oldB,this.body)/dt,shadowSpeed=dist(oldS,this.shadow)/dt;
    if(!recordedBody){
      const animation:Animation=this.curtainActing?(this.ending==='stillness'?'sit':this.ending==='exit'?(bodySpeed>.07?'walk':'idle'):this.ending==='lingering'?'shrug':'bow'):this.time<this.restUntil?'sit':this.time<this.riseUntil?'rise':this.time<this.bowUntil?'bow':this.bodyActing??(bodySpeed>.07?(this.stage==='follow'?'chase':'walk'):this.bodyLook?'idle':this.idle>6?'look':'idle');
      this.animate(this.body,animation,dt,bodySpeed);this.lookAt(this.body,this.bodyLook,dt);
    }
    if(this.shadowSource==='attached')this.shadowAttachment=Math.min(1,this.shadowAttachment+dt/.65);
    if(this.stage==='arrival'||this.shadowSource==='attached'&&this.shadowAttachment===1)this.shadow=copy(this.body);
    else if(!recordedShadow){
      // Once united, both actors perform the same bow/sit, including every bone and cloth movement.
      if(this.curtainActing&&!['exit','lingering'].includes(this.ending))this.shadow=copy(this.body);
      else if(this.curtainActing&&this.ending==='lingering')this.animate(this.shadow,'sit',dt,0);

      else this.animate(this.shadow,this.shadowActing??(shadowSpeed>.07?'walk':'idle'),dt,shadowSpeed);
      if(!this.curtainActing)this.lookAt(this.shadow,this.shadowLook,dt);
    }
    const quiet=this.stage==='echo'&&this.echoClock<6||this.stage==='follow';
    if(!quiet&&!['curtain','ended','return'].includes(this.stage)&&!this.line&&this.elapsed>8){
      if(this.idle>6)this.once(`${this.stage}-idle`,()=>this.say('您似乎决定留一会儿。那我也把话说慢一点。','no-input-6s',5,true));
      else if(dist(this.body,PLANT)<1.9)this.once('planter',()=>this.say('花盆原本没有戏份。它现在有了。','near-planter'));
      else if(this.turns>=6)this.once('turns',()=>this.say('您似乎很想改写这条路线。我更新一下说明书。','direction-changes',5,true));
    }
    if(this.stage==='arrival')this.route.push(this.routePoint(this.body,this.elapsed));
    this.shadowRoute.push(this.routePoint(this.shadow,this.time));if(this.tick%2===0||this.stage==='ended')this.record();
  }
  snapshot():Frame{return {t:this.time,stage:this.stage,elapsed:this.elapsed,body:copy(this.body),shadow:copy(this.shadow),shadowAttachment:this.shadowAttachment,input:{...this.input},target:this.target,bodySource:this.bodySource,shadowSource:this.shadowSource,line:this.line,lineId:this.lineId,goal:this.goal,mode:this.mode,ending:this.ending,beat:this.stageBeat(),beatPhase:this.beatPhase,actionLabel:this.actionLabel(),cue:this.cue?{...this.cue}:null,doorOpen:this.doorOpen,signTurn:this.signTurn};}
  record(){this.frames.push(this.snapshot());}
  export(){return {schemaVersion:6,build:'0.6.0',assetVersion:'actor-5',mode:this.mode,duration:this.time,systemDemo:this.systemDemo,ending:this.ending,events:this.events,frames:this.frames};}
}
export function frameAt(frames:Frame[],time:number):Frame {
  let lo=0,hi=frames.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(frames[m].t<=time)lo=m;else hi=m-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],f=b.t>a.t?clamp((time-a.t)/(b.t-a.t),0,1):0;
  return {...a,t:time,body:mixActor(a.body,b.body,f),shadow:mixActor(a.shadow,b.shadow,f),shadowAttachment:a.shadowAttachment+(b.shadowAttachment-a.shadowAttachment)*f,doorOpen:a.doorOpen+(b.doorOpen-a.doorOpen)*f,signTurn:a.signTurn+(b.signTurn-a.signTurn)*f};
}
