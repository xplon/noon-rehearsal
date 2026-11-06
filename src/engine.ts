import {SHADOW_SLOPE} from './lighting.ts';
import {freshMemory,readingTime,type StoryMemory} from './direction.ts';
import {steer,angleDelta,type SteeredMotion} from './locomotion.ts';
import {MOTION,facing,velocity,arrival,magnet,easedRouteTime,smooth,clamp,type Motion} from './motion.ts';
import {WORLD_BOUNDS,GATE,FRONT_MARK,INNER_PAD,OUTER_PAD,OUTSIDE_MARK,PAD_RADIUS,ACTOR_RADIUS,limitVelocity,resolveMove,safeDoorStep,doorOccupied,waypoint,isOutside} from './space.ts';
export type Mode='student'|'teacher';
export type Stage='arrival'|'return'|'echo'|'follow'|'reverse'|'rejoin'|'relay'|'curtain'|'ended';
export const ANIMATIONS=['idle','walk','chase','look','shrug','sit','rise','bow','turn','struggle','surprise','reach','pivot_left','pivot_right'] as const;
export type Animation=typeof ANIMATIONS[number];
export type Vec={x:number;z:number};
export type LookTarget=Vec & {height?:number};
export type Actor=SteeredMotion & {animation:Animation;animTime:number;previous:Animation;previousTime:number;blend:number;pace:number;gaitPhase:number;gazeYaw:number;lookYaw:number;lookPitch:number;lookWeight:number;weights:Record<Animation,number>;clocks:Record<Animation,number>};
export type Visual={body:Float32Array;shadow:Float32Array};
export type ActionChoice={id:string;label:string};
export type Frame={t:number;stage:Stage;elapsed:number;body:Actor;shadow:Actor;shadowAttachment:number;input:Vec;target:string;bodySource:string;shadowSource:string;line:string;lineId:number;goal:boolean;mode:Mode;ending:string;beat:string;beatPhase:string;actionLabel:string;cue:Vec|null;doorOpen:number;doorSlots:number;innerHeld:boolean;outerHeld:boolean;memory:StoryMemory;signTurn:number;objective:string;controlLabel:string;help:string;actions:ActionChoice[];visual?:Visual};
export type Event={t:number;type:string;[key:string]:unknown};
export type RoutePoint=Actor & {t:number};
export const HOME={x:-2.4,z:2.2},EXIT=FRONT_MARK,BOW={x:1.8,z:-.3},LEFT={x:-3.8,z:-1.5},PLANT={x:-5.8,z:.1,radius:.85};
export const THRESHOLD={x:GATE.x,z:GATE.z},DOOR_HOLD=INNER_PAD,DOOR_APPROACH=FRONT_MARK,BOUNDS=WORLD_BOUNDS;
export const CONFIG={student:{arrival:32,echoMax:16},teacher:{arrival:32,echoMax:16}};
export const SOURCES:Record<string,string>={input:'当前输入',attached:'随身体投影','recorded-body':'本局身体旧路线','system-demo':'系统示范','system-return':'回到所选真实片段起点',follow:'追随影子',reverse:'沿本局影子路径反向重走（重新定时）',curtain:'落幕动作',none:'无直接控制',shadow:'影子',body:'身体',settling:'减速会合',reaction:'先观察再追随','reaction-step':'影子试着跟上又收住','system-guide':'明确标记的系统接应',partner:'独立搭档','hold-door':'站在留门位','relay-cross':'接手后过门'};
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

/** Select a continuous, genuinely moving source interval; never compress its internal pauses. */
export function selectRecordedWindow(source:RoutePoint[],maxDuration=16){
  if(source.length<2)return {route:source.map(p=>copy(p)),start:0,end:0,distance:0};
  const cumulative=[0];for(let i=1;i<source.length;i++)cumulative.push(cumulative[i-1]+dist(source[i],source[i-1]));
  let bestStart=0,bestEnd=source.length-1,best=-1,right=0;
  for(let left=0;left<source.length-1;left++){
    while(right+1<source.length&&source[right+1].t-source[left].t<=maxDuration)right++;
    const travel=cumulative[right]-cumulative[left];
    if(travel>best+1e-5){best=travel;bestStart=left;bestEnd=right;}
  }
  let firstMove=bestStart;
  while(firstMove<bestEnd&&dist(source[firstMove+1],source[firstMove])<.002)firstMove++;
  const leadIn=Math.max(source[bestStart].t,source[firstMove].t-.8);
  while(bestStart+1<bestEnd&&source[bestStart+1].t<leadIn)bestStart++;
  const start=source[bestStart].t,end=source[bestEnd].t;
  return {route:source.slice(bestStart,bestEnd+1).map(p=>({...copy(p),t:p.t-start})),start,end,distance:cumulative[bestEnd]-cumulative[bestStart]};
}
export class Game {
  mode:Mode;config:typeof CONFIG.student;time=0;elapsed=0;stage:Stage='arrival';paused=false;
  body=actor(HOME);shadow=actor(HOME);input:Vec={x:0,z:0};target='body';bodySource='input';shadowSource='attached';
  frames:Frame[]=[];events:Event[]=[];route:RoutePoint[]=[];shadowRoute:RoutePoint[]=[];reverseRoute:RoutePoint[]=[];
  line='';lineId=-1;lineUntil=0;goal=false;distance=0;idle=0;ending='';systemDemo=false;
  fired=new Set<string>();turns=0;lastDirection:Vec|null=null;tick=0;
  stride=1;runStride=2.48;shadowAttachment=1;homeDwell=0;settleDwell=0;
  echoWindow=0;echoClock=0;echoRampTime=0;echoReady=false;echoPoseFrom:Actor|null=null;echoOffset:Vec={x:0,z:0};routeStart=0;
  reversePath:{distance:number;point:RoutePoint}[]=[];reverseLength=0;reverseClock=0;reverseDuration=0;reverseStarted=false;reverseDone=false;reverseStopping=false;reverseSourceStart=0;reverseSourceEnd=0;
  bodyNoticeAt=-100;bodyNoticeHold=.65;bodyNoticeKind='';bodyNoticeCooldown=0;bodyAwaitingLead=true;bodyWasMoving=false;leadHeading:number|null=null;
  shadowNoticeAt=-100;shadowNoticeCount=0;shadowAttemptTarget:Vec|null=null;bodyActing:Animation|null=null;shadowActing:Animation|null=null;
  bodyLook:LookTarget|null=null;shadowLook:LookTarget|null=null;
  arrivalBeat:'door'|'home'='door';beatPhase='guide';cue:Vec|null={...EXIT};doorOpen=0;signTurn=0;
  memory=freshMemory();innerHeld=false;outerHeld=false;innerDwell=0;outerDwell=0;phaseAt=0;progressAt=0;progressDistance=Infinity;
  guideAssisted=false;relayWait:Vec={x:2.7,z:-2.5};budgetNoticeAt=-1;relayBudgetStart=0;curtainActing=false;curtainClock=0;reconnected=false;
  lineStartedAt=0;lineReadUntil=0;
  speechQueue:{text:string;reason:string;duration:number;interpretation:boolean;scope:string}[]=[];
  constructor(mode:Mode='student',stride=1,runStride=2.48){
    this.mode=mode;this.config=CONFIG[mode];this.stride=stride;this.runStride=runStride;
    this.say('请先到门前的白圈。马上就好。','opening',7);this.event('stage',{stage:this.stage});this.route.push(this.routePoint(this.body,0));this.record();
  }
  event(type:string,data:Record<string,unknown>={}){this.events.push({t:this.time,type,...data});}
  speechScope(){return this.stage;}
  endLine(reason='finished'){
    if(this.lineId>=0)this.event('narration-end',{lineId:this.lineId,reason,start:this.lineStartedAt,duration:this.time-this.lineStartedAt});
    this.line='';this.lineId=-1;
  }
  say(text:string,reason:string,duration=6,interpretation=false){
    if(this.speechQueue.some(s=>s.reason===reason))return;
    const speech={text,reason,duration,interpretation,scope:this.speechScope()};
    if(this.line&&this.time<this.lineReadUntil||this.speechQueue.length){this.speechQueue.push(speech);return;}
    this.showSpeech(speech);
  }
  showSpeech(speech:{text:string;reason:string;duration:number;interpretation:boolean}){
    this.endLine('replaced-after-reading');this.line=speech.text;this.lineStartedAt=this.time;
    this.lineReadUntil=this.time+readingTime(speech.text);this.lineUntil=speech.reason==='ending'?this.time+speech.duration:Math.max(this.lineReadUntil,Math.min(this.time+speech.duration,this.lineReadUntil+.6));
    this.lineId=this.events.length;this.event('narration',{text:speech.text,reason:speech.reason,interpretation:speech.interpretation,minimum:readingTime(speech.text)});
  }
  flushSpeech(){
    this.speechQueue=this.speechQueue.filter(s=>s.scope===this.speechScope());
    if(this.time>=this.lineReadUntil&&this.speechQueue.length)this.showSpeech(this.speechQueue.shift()!);
    else if(this.line&&this.time>=this.lineUntil)this.endLine();
  }
  speechRead(){return this.time>=this.lineReadUntil&&!this.speechQueue.length;}
  remember(update:Partial<StoryMemory>,reason:string){Object.assign(this.memory,update);this.event('relationship',{reason,memory:copy(this.memory)});}
  once(key:string,fn:()=>void){if(!this.fired.has(key)){this.fired.add(key);fn();}}
  setInput(x:number,z:number){
    const n=Math.hypot(x,z);if(n>1){x/=n;z/=n;}x=Math.round(x*100)/100;z=Math.round(z*100)/100;
    if(x===this.input.x&&z===this.input.z)return;
    if(n>.1){if(this.lastDirection&&x*this.lastDirection.x+z*this.lastDirection.z<-.4)this.turns++;this.lastDirection={x,z};}
    this.input={x,z};this.event('input',{x,z,target:this.target});
  }
  pause(reason='manual'){if(!this.paused&&this.stage!=='ended'){this.setInput(0,0);this.paused=true;this.event('pause',{reason});}}
  resume(){if(this.paused){this.paused=false;this.event('resume');}}
  constrain(p:Vec){p.x=clamp(p.x,BOUNDS.left,BOUNDS.right);p.z=clamp(p.z,BOUNDS.top,BOUNDS.bottom);}
  drive(a:Actor,desired:Vec,dt:number){
    const before=position(a);desired=limitVelocity(a,desired,this.doorOpen);
    const dx=a.x-PLANT.x,dz=a.z-PLANT.z,d=Math.hypot(dx,dz),inward=(desired.x*dx+desired.z*dz)/(d||1),clearance=d-PLANT.radius-.3;
    if(inward<0&&clearance<1){const limit=-Math.max(0,clearance)*3;if(inward<limit){desired.x+=(limit-inward)*dx/d;desired.z+=(limit-inward)*dz/d;}}
    steer(a,desired,dt);
    const legal=resolveMove(before,a,this.doorOpen);
    if(Math.abs(legal.x-a.x)>1e-7){a.x=legal.x;a.vx=(a.x-before.x)/dt;a.ax=0;}
    if(Math.abs(legal.z-a.z)>1e-7){a.z=legal.z;a.vz=(a.z-before.z)/dt;a.az=0;}
    const plantDistance=dist(a,PLANT),r=PLANT.radius+.3;
    if(plantDistance<r){const nx=(a.x-PLANT.x)/(plantDistance||1),nz=(a.z-PLANT.z)/(plantDistance||1);a.x=PLANT.x+nx*r;a.z=PLANT.z+nz*r;}
    if(a.pivoting){
      const gaze={x:a.x+Math.sin(a.travelYaw)*3,z:a.z+Math.cos(a.travelYaw)*3,height:1.35};
      if(a===this.body&&!this.bodyLook)this.bodyLook=gaze;
      if(a===this.shadow&&!this.shadowLook)this.shadowLook=gaze;
    }
  }
  move(a:Actor,direction:Vec,dt:number,max=MOTION.speed,mark?:Vec){this.drive(a,magnet(a,{x:direction.x*max,z:direction.z*max},mark),dt);}
  follow(a:Actor,target:Vec,dt:number,max=MOTION.followSpeed){
    let aim=waypoint(a,target,this.doorOpen);const dx=aim.x-a.x,dz=aim.z-a.z,l2=dx*dx+dz*dz;
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
      if(separation>.45)this.noticeBody('first-departure',1.05);
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

  stageBeat(){return this.stage==='arrival'?this.arrivalBeat:['follow','relay'].includes(this.stage)?this.beatPhase:this.stage;}
  guidance():{objective:string;controlLabel:string;help:string}{
    let objective='',help='';
    if(this.stage==='arrival'){objective=this.arrivalBeat==='door'?'走到门前的浅色圆圈。':'回到庭院中间刚亮起的白圈，停一下。';help='方向键 / WASD 移动。脚下接近圆圈时，松手会轻轻靠拢。';}
    else if(this.stage==='return'){objective='身体正在回到刚才那段路的起点。';help='你可以继续试着移动，看看谁在回应。';}
    else if(this.stage==='echo'){objective=this.echoClock<6?'试着换个方向，或停下来。':'移动影子，看看身体在走哪一段路。';help=this.systemDemo?'身体正在执行刚才标明的示范动作；现在的方向输入交给蓝色影子。':'身体正在重演你刚才的真实动作；现在的方向输入交给蓝色影子。';}
    else if(this.stage==='follow'){objective=this.beatPhase==='rehearsal-offer'?'要沿刚才的路线再排一遍吗？':'移动影子，把身体带到门前圆圈。';help='你控制蓝色影子。身体会先看向它，再转身跟上。到了门前，请停下等身体靠近。';if(this.guideAssisted){objective='身体正在示范到门前的走法。';help='这段是系统接应，会单独记录，不算你的选择。';}}
    else if(this.stage==='reverse'){objective=this.reverseStopping?'两位正在停下来。':'正在沿本局路径反向重走；可随时叫停。';help='当前不直接控制两位。路线来自刚才的影子，速度重新安排；按“停，这遍不算”可中断。';}
    else if(this.stage==='rejoin'){objective='两位正在会合，把身体交回你。';help='身体会重新回应方向键，影子仍是独立的搭档。';}
    else if(this.stage==='relay'){
      help='任意一个留门踏板有人站稳，门就打开。先过门的一位踩住门外踏板，接出另一位。两位都到门外才完成。停下思考不算拒绝。';
      if(this.beatPhase==='choice')objective='让两位都到门外。先决定谁过去。';
      else if(this.memory.order==='body-first')objective=this.beatPhase==='second-crossing'?'站在门外踏板，等影子过来。':this.innerHeld?'身体过门后，踩住门外发亮的踏板。':'影子正在走向门内踏板；你可以先走到门前。';
      else objective=this.beatPhase==='second-crossing'?'影子已接手。走到门外踏板，与它会合。':this.innerHeld?'身体留在踏板上，等影子在外面接手。':'移动身体，站稳门内发亮的踏板。';
      if(this.budgetNoticeAt>=0)objective='这次接力还没完成。可以继续试，或结束排练。';
    }else if(this.stage==='curtain')objective=this.ending==='exit'?'两位已到门外。':this.ending==='stillness'?'两位决定在庭院落幕。':'这次排练在这里收住。';
    let controlLabel=this.target==='body'?'方向键 · 身体':this.target==='shadow'?'方向键 · 影子':'暂时观看';
    if(this.stage==='return'||this.stage==='echo'&&this.echoClock<6)controlLabel='';
    if(this.stage==='ended')controlLabel='';
    return {objective,controlLabel,help};
  }
  actions():ActionChoice[]{
    if(this.stage==='follow'&&this.beatPhase==='rehearsal-offer')return [{id:'rehearse',label:'沿刚才的路重走'},{id:'skip-rehearsal',label:'直接去门口'}];
    if(this.stage==='follow'&&!this.guideAssisted)return [{id:'guide-help',label:'请身体来接应'},{id:'stay',label:'我们留在这里'}];
    if(this.stage==='reverse'&&!this.reverseStopping)return [{id:'stop-rehearsal',label:'停，这遍不算'}];
    if(this.stage!=='relay')return [];
    if(this.budgetNoticeAt>=0)return [{id:'continue',label:'继续试一次'},{id:'end-unfinished',label:'结束这次排练'}];
    if(this.beatPhase==='choice')return [{id:'body-first',label:'身体先过，影子留门'},{id:'shadow-first',label:'影子先过，身体留门'},{id:'stay',label:'我们留在这里'}];
    const list:ActionChoice[]=[{id:'relay-help',label:'怎么接手？'}];
    if(!isOutside(this.body)&&!isOutside(this.shadow))list.push({id:'change-order',label:'换一下先后'});
    list.push({id:'stay',label:isOutside(this.body)||isOutside(this.shadow)?'到这里收场':'我们留在这里'});return list;
  }
  actionLabel(){return this.actions()[0]?.label??'';}
  interact(){const action=this.actions()[0];if(action)this.choose(action.id);}
  choose(id:string){
    if(this.paused||!this.actions().some(a=>a.id===id))return;
    this.event('interaction',{action:id,label:this.actions().find(a=>a.id===id)!.label,stage:this.stage,beat:this.stageBeat(),body:position(this.body),shadow:position(this.shadow)});
    this.endLine('player-choice');this.speechQueue=[];this.lineReadUntil=this.time;
    if(id==='stay'){
      const bothInside=!isOutside(this.body)&&!isOutside(this.shadow);
      this.remember({door:bothInside?'declined':'unfinished',endingSource:'player'},'explicit-stay');
      this.finish(bothInside?'stillness':'player-ended');return;
    }
    if(id==='guide-help'){this.assistGuide('requested');return;}
    if(id==='rehearse'){this.remember({rehearsal:'accepted'},'rehearsal-accepted');this.event('rehearsal-choice',{choice:'accept'});this.beginReverse();return;}
    if(id==='skip-rehearsal'){this.remember({rehearsal:'declined'},'rehearsal-declined');this.event('rehearsal-choice',{choice:'skip'});this.transition('rejoin','player-choice');return;}
    if(id==='stop-rehearsal'){
      this.remember({rehearsal:'interrupted'},'rehearsal-interrupted');this.event('rehearsal-choice',{choice:'interrupt'});this.reverseStopping=true;this.say('停在这里。过去的路不用走完。','reverse-interrupted',4);return;
    }
    if(id==='body-first'||id==='shadow-first'){this.selectOrder(id,'player');return;}
    if(id==='change-order'){this.beatPhase='choice';this.phaseAt=this.time;this.cue=null;this.progressAt=this.time;this.say('好，先停稳。你们可以换一下先后。','change-order',4);return;}
    if(id==='relay-help'){
      this.remember({assistance:'requested'},'help-requested');this.event('assistance',{source:'player-request',stage:'relay'});
      this.say(this.memory.order==='body-first'?'影子留在里面。请让身体走到门外踏板，接影子出来。':'请让身体站稳里面的踏板。影子会在外面接手，再换身体出来。','relay-hint',7);this.progressAt=this.time;return;
    }
    if(id==='continue'){this.budgetNoticeAt=-1;this.relayBudgetStart=this.time;this.progressAt=this.time;this.event('budget-extended');this.say('好，门还会按同样的方式回应。','continue-rehearsal',4);return;}
    if(id==='end-unfinished'){this.remember({door:'unfinished',endingSource:'player'},'explicit-unfinished');this.finish('player-ended');}
  }
  selectOrder(order:'body-first'|'shadow-first',source:'player'|'system'){
    this.remember({order,orderSource:source,door:'in-progress'},source==='player'?'relay-order-chosen':'relay-order-demonstrated');
    this.event('relay-choice',{order,source});this.beatPhase='first-crossing';this.phaseAt=this.time;this.progressAt=this.time;this.progressDistance=Infinity;this.budgetNoticeAt=-1;
    this.say(order==='body-first'?'这一回，影子先留门；身体先走。':'这一回，身体先留门；影子先走。','relay-order',7);
  }
  atDoor(p:Vec){return dist(p,FRONT_MARK)<.95;}
  routePoint(a:Actor,t:number):RoutePoint{return {...copy(a),t};}
  settled(a:Actor,target?:Vec,tolerance=.06){return speed(a)<.08&&(!target||dist(a,target)<tolerance);}
  markProgress(value:number){if(value<this.progressDistance-.12){this.progressDistance=value;this.progressAt=this.time;}}
  assistGuide(source:'requested'|'system'){
    this.guideAssisted=true;this.target='none';this.bodySource='system-guide';this.shadowSource='system-guide';this.cue={...FRONT_MARK};
    this.remember({assistance:source},'guide-assisted');this.event('assistance',{source,stage:'follow'});
    this.say('这一段由身体示范。影子跟着，到门前再把控制交还给你。','guide-assistance',6);
  }
  makeDemo(){
    const a=actor(HOME),route=[this.routePoint(a,0)];let t=0,index=0,dwell=0;const marks=[{x:.7,z:1.2},{x:2,z:-.8},HOME];
    while(index<marks.length&&t<16){this.follow(a,marks[index],1/60,MOTION.demoSpeed);this.animate(a,speed(a)>.07?'walk':'idle',1/60);this.lookAt(a,null,1/60);t+=1/60;route.push(this.routePoint(a,t));if(this.settled(a,marks[index]))dwell+=1/60;else dwell=0;if(dwell>.35){index++;dwell=0;}}
    return route;
  }
  transition(next:Stage,reason='automatic'){
    if(this.stage==='ended')return;
    this.endLine(reason==='host-skip'?'host-interrupted':'stage-complete');this.speechQueue=[];this.lineReadUntil=this.time;
    this.event('transition',{from:this.stage,to:next,reason});this.stage=next;this.elapsed=0;this.settleDwell=0;this.phaseAt=this.time;this.progressAt=this.time;this.progressDistance=Infinity;this.event('stage',{stage:next});
    if(next==='return'){
      this.shadowAttachment=0;this.target='shadow';this.bodySource='system-return';this.shadowSource='input';
      const selected=selectRecordedWindow(this.route,this.config.echoMax);
      if(selected.distance<.9){this.systemDemo=true;this.route=this.makeDemo();this.routeStart=0;this.say('还没有足够的走位。身体先示范一段，另一位可以试着动一动。','system-demo',6);this.event('system-demo');}
      else{this.route=selected.route;this.routeStart=selected.start;this.say('身体先回到刚才那一段的开头。','system-return',4);}
      this.echoWindow=this.route.at(-1)!.t;this.cue=null;
      this.event('route-window',{start:this.routeStart,end:this.routeStart+this.echoWindow,selection:'continuous-moving-window-with-original-pauses',distance:selected.distance,systemDemo:this.systemDemo});
      this.event('system-return',{from:position(this.body),to:position(this.route[0])});
    }else if(next==='echo'){
      this.target='shadow';this.bodySource=this.systemDemo?'system-demo':'recorded-body';this.shadowSource='input';this.echoClock=0;this.echoRampTime=0;this.echoReady=false;this.cue=null;
      this.echoOffset={x:this.body.x-this.route[0].x,z:this.body.z-this.route[0].z};
    }else if(next==='follow'){
      this.target='shadow';this.bodySource='follow';this.shadowSource='input';this.shadowAttachment=0;this.bodyAwaitingLead=true;this.leadHeading=null;this.beatPhase='guide';this.cue={...FRONT_MARK};
      this.say('身体发现影子了。试着把身体带到门前。','guide-invitation',6);
    }else if(next==='reverse'){
      this.target='none';this.bodySource='follow';this.shadowSource='settling';this.shadowAttachment=0;this.reverseStarted=false;this.reverseStopping=false;this.reverseClock=0;this.cue=null;
      this.say('好，沿影子刚才的路反向重走。随时可以叫停。','reverse-invitation',5);
    }else if(next==='rejoin'){
      this.target='none';this.bodySource='settling';this.shadowSource='settling';this.cue=null;this.shadowAttachment=0;
      this.say('这次，身体回到你手里。影子留下来做搭档。','control-handoff',5);
    }else if(next==='relay'){
      this.target='body';this.bodySource='input';this.shadowSource='partner';this.shadowAttachment=0;this.reconnected=true;this.relayBudgetStart=this.time;this.beatPhase='choice';this.cue=null;this.relayWait={x:FRONT_MARK.x-1.15,z:FRONT_MARK.z+.7};
      this.event('control-returned',{shadowIndependent:true});
      this.say('门两边各有一个留门位。一位先过去接手，另一位就能出来。','relay-rule',7);
    }
  }
  beginReverse(){
    let motionEnd=this.time;
    for(let i=this.shadowRoute.length-1;i>0;i--)if(dist(this.shadowRoute[i],this.shadowRoute[i-1])>.003){motionEnd=this.shadowRoute[i].t;break;}
    this.reverseSourceEnd=this.time;this.reverseSourceStart=Math.max(0,motionEnd-8);this.reverseRoute=this.shadowRoute.filter(p=>p.t>=this.reverseSourceStart);this.reverseRoute.push(this.routePoint(this.shadow,this.time));
    this.transition('reverse','player-choice');
  }
  performArrival(dt:number,old:Vec){
    this.move(this.body,this.input,dt,MOTION.speed,this.cue??undefined);this.distance+=dist(old,this.body);
    if(this.arrivalBeat==='door'&&dist(this.body,EXIT)<.6){this.goal=true;this.arrivalBeat='home';this.cue={...HOME};this.event('target-entered',{target:'door'});this.say('到了。回到庭院中间刚亮起的白圈，再停一下。','return-instruction',5);}
    this.homeDwell=this.arrivalBeat==='home'&&dist(this.body,HOME)<.35&&speed(this.body)<.3?this.homeDwell+dt:0;
    if(this.homeDwell>.35&&this.speechRead())this.transition('return','returned-to-home');
    else if(this.elapsed>=this.config.arrival&&this.speechRead())this.transition('return','opening-budget');
    else if(this.elapsed>14&&!this.goal)this.once('door-late',()=>this.say('门前的圈在右边。走过的这一段也已经记下了。','target-help',5));
  }
  performFollow(dt:number){
    if(this.beatPhase==='rehearsal-offer'){
      this.move(this.shadow,this.input,dt);this.followWithReaction(dt);
      if(this.time-this.phaseAt>18&&this.speechRead()){this.remember({rehearsal:'unanswered'},'rehearsal-unanswered');this.event('rehearsal-choice',{choice:'unanswered'});this.transition('rejoin','unanswered-offer');}
      return;
    }
    if(this.guideAssisted){this.follow(this.body,FRONT_MARK,dt,1.7);this.follow(this.shadow,this.body,dt,1.9);}
    else{this.move(this.shadow,this.input,dt,MOTION.speed,FRONT_MARK);this.bodySource='follow';this.shadowSource='input';this.followWithReaction(dt);}
    const remaining=dist(this.shadow,FRONT_MARK)+dist(this.body,this.shadow);this.markProgress(remaining);
    const ready=dist(this.shadow,FRONT_MARK)<.55&&dist(this.body,this.shadow)<.45&&speed(this.shadow)<.18&&speed(this.body)<.25;
    this.settleDwell=ready?this.settleDwell+dt:0;
    if(this.settleDwell>.6&&this.speechRead()){
      this.event('guide-arrived',{assisted:this.guideAssisted});
      if(this.mode==='teacher'&&!this.reverseDone){this.beatPhase='rehearsal-offer';this.phaseAt=this.time;this.target='shadow';this.shadowSource='input';this.cue=null;this.say('刚才那条路，要倒着再排一遍吗？也可以直接去门口。','rehearsal-offer',6);}
      else this.transition('rejoin');
    }else if(!this.guideAssisted){
      if(this.time-this.progressAt>12)this.once('guide-help',()=>this.say('蓝色影子听你的方向键。到门前的圈里停下，身体会跟上。','guide-help',6));
      if((this.time-this.progressAt>35||this.elapsed>80)&&this.speechRead())this.assistGuide('system');
    }
  }
  updateDoor(dt:number){
    const inner=[this.body,this.shadow].some(a=>dist(a,INNER_PAD)<PAD_RADIUS&&speed(a)<.32);
    const outer=[this.body,this.shadow].some(a=>dist(a,OUTER_PAD)<PAD_RADIUS&&speed(a)<.32);
    this.innerDwell=inner?this.innerDwell+dt:0;this.outerDwell=outer?this.outerDwell+dt:0;
    const oldInner=this.innerHeld,oldOuter=this.outerHeld;this.innerHeld=inner&&(this.innerDwell>.16||this.innerHeld);this.outerHeld=outer&&(this.outerDwell>.16||this.outerHeld);
    if(oldInner!==this.innerHeld||oldOuter!==this.outerHeld){this.event('door-pad',{inner:this.innerHeld,outer:this.outerHeld,body:position(this.body),shadow:position(this.shadow)});if(this.stage==='relay')this.progressAt=this.time;}
    const occupied=doorOccupied([this.body,this.shadow]);
    this.doorOpen=safeDoorStep(this.doorOpen,this.innerHeld||this.outerHeld?1:occupied?this.doorOpen:0,[this.body,this.shadow],dt);
  }
  performRelay(dt:number){
    this.target='body';this.bodySource='input';this.shadowSource='partner';
    if(this.beatPhase==='choice'){
      this.cue=null;this.move(this.body,this.input,dt);this.follow(this.shadow,this.relayWait,dt,1.5);this.shadowLook={...this.body,height:1.4};
      if(this.elapsed>28&&this.idle>14&&this.speechRead()){
        this.remember({assistance:'system'},'unanswered-relay');this.event('assistance',{source:'system',stage:'relay'});
        this.say('还没有选先后。影子先示范留门；身体仍由你来走。','relay-demonstration',6);this.selectOrder('body-first','system');
      }
    }else if(this.memory.order==='body-first'){
      this.cue={...OUTER_PAD};this.move(this.body,this.input,dt,MOTION.speed,this.cue);
      if(this.beatPhase==='first-crossing'){
        this.shadowLook={...INNER_PAD,height:0};this.follow(this.shadow,INNER_PAD,dt,1.7);this.shadowSource='hold-door';
        if(this.settled(this.shadow,INNER_PAD,.12)){this.shadowLook={...this.body,height:1.4};this.shadowActing='reach';this.once('shadow-holds',()=>{this.event('door-held',{actor:'shadow',position:position(this.shadow)});this.say('影子踩住了里面的踏板，门打开了。','inner-held',5);});}
        if(this.outerHeld&&dist(this.body,OUTER_PAD)<PAD_RADIUS&&isOutside(this.body)){this.beatPhase='second-crossing';this.phaseAt=this.time;this.speechQueue=this.speechQueue.filter(s=>!['inner-held','relay-order','relay-help','relay-hint'].includes(s.reason));this.event('relay-handoff',{holder:'body',order:this.memory.order,source:this.memory.orderSource});this.say('身体接住了门。影子现在可以出来。','relay-handoff',5);}
      }else{this.shadowLook={...this.body,height:1.4};this.follow(this.shadow,OUTSIDE_MARK,dt,1.7);this.shadowSource='relay-cross';}
    }else{
      this.cue=this.beatPhase==='first-crossing'?{...INNER_PAD}:{...OUTSIDE_MARK};
      this.move(this.body,this.input,dt,MOTION.speed,this.cue);
      if(this.beatPhase==='first-crossing'){
        const held=this.innerHeld&&dist(this.body,INNER_PAD)<PAD_RADIUS;
        if(held||isOutside(this.shadow)){this.follow(this.shadow,OUTER_PAD,dt,1.7);this.shadowSource='relay-cross';}
        else{this.drive(this.shadow,{x:0,z:0},dt);this.shadowLook={...this.body,height:1.4};this.shadowActing='reach';}
        if(held)this.once('body-holds',()=>{this.event('door-held',{actor:'body',position:position(this.body)});this.say('身体踩住了里面的踏板，门打开了。','inner-held',5);});
        if(this.outerHeld&&dist(this.shadow,OUTER_PAD)<PAD_RADIUS&&isOutside(this.shadow)){this.beatPhase='second-crossing';this.phaseAt=this.time;this.speechQueue=this.speechQueue.filter(s=>!['inner-held','relay-order','relay-help','relay-hint'].includes(s.reason));this.event('relay-handoff',{holder:'shadow',order:this.memory.order,source:this.memory.orderSource});this.say('影子在外面留住了门。现在身体可以过来。','relay-handoff',5);}
      }else{this.follow(this.shadow,OUTER_PAD,dt,1.5);this.shadowSource='hold-door';this.shadowLook={...this.body,height:1.4};if(this.settled(this.shadow))this.shadowActing='reach';}
    }
    if(this.cue){this.markProgress(dist(this.body,this.cue));this.bodyLook=this.bodyLook??{...this.cue,height:0};}
    const complete=this.beatPhase==='second-crossing'&&isOutside(this.body)&&isOutside(this.shadow)&&dist(this.body,this.shadow)<.55&&speed(this.body)<.2&&speed(this.shadow)<.2;
    this.settleDwell=complete?this.settleDwell+dt:0;
    if(this.settleDwell>.5&&this.speechRead()){
      this.remember({door:'passed-together',endingSource:'completed'},'both-crossed');this.event('both-crossed',{body:position(this.body),shadow:position(this.shadow),gateZ:GATE.z});this.finish('exit');return;
    }
    if(this.time-this.progressAt>14)this.once('relay-help-'+this.beatPhase,()=>this.say(this.guidance().objective,'relay-help',5));
    if(this.budgetNoticeAt<0&&((this.time-this.relayBudgetStart>75&&this.time-this.progressAt>32)||this.time-this.relayBudgetStart>150)){
      this.budgetNoticeAt=this.time;this.say('接力还没完成。可以继续试，也可以先结束这次排练。','budget-notice',7);this.event('budget-notice',{stage:'relay'});
    }
    if(this.budgetNoticeAt>=0&&this.time-this.budgetNoticeAt>18&&this.speechRead()){
      this.remember({door:'unfinished',endingSource:'system-budget'},'unanswered-budget');this.finish('unfinished');
    }
  }
  performReverse(dt:number){
    this.bodySource='follow';this.shadowSource='reverse';
    if(!this.reverseStarted&&this.reverseStopping){
      this.drive(this.shadow,{x:0,z:0},dt);this.follow(this.body,this.shadow,dt,MOTION.catchUpSpeed);
      if(this.settled(this.shadow)&&this.settled(this.body,this.shadow,.1)&&this.speechRead()){this.reverseDone=true;this.event('reverse-cancelled',{beforePlayback:true});this.transition('rejoin');}
    }else if(!this.reverseStarted){
      this.drive(this.shadow,{x:0,z:0},dt);this.followWithReaction(dt);
      if(this.settled(this.shadow)&&this.speechRead()){
        this.reverseRoute.push(this.routePoint(this.shadow,this.time));this.reversePath=[];this.reverseLength=0;
        for(const point of [...this.reverseRoute].reverse()){
          const previous=this.reversePath.at(-1)?.point;if(previous){const length=dist(previous,point);if(length<.003)continue;this.reverseLength+=length;}
          this.reversePath.push({distance:this.reverseLength,point});
        }
        this.reverseDuration=this.reverseLength<.25?0:Math.max(2.4,this.reverseLength/MOTION.reverseSpeed+2);this.reverseStarted=true;this.reverseClock=0;
        this.event('reverse-start',{duration:this.reverseDuration,length:this.reverseLength,retiming:'arc-length with eased start and stop',sourceStart:this.reverseSourceStart,sourceEnd:this.reverseSourceEnd});
        if(!this.reverseDuration){this.memory.rehearsal='unavailable';this.reverseStopping=true;this.say('这一段没有足够的移动。就不另外编一条路了。','reverse-still',5);}
      }
    }else if(!this.reverseStopping&&this.reverseClock<this.reverseDuration){
      this.reverseClock=Math.min(this.reverseDuration,this.reverseClock+dt);
      const distance=this.reverseLength*easedRouteTime(this.reverseClock,this.reverseDuration)/this.reverseDuration;
      const right=this.reversePath.find(p=>p.distance>=distance)??this.reversePath.at(-1)!;
      const index=this.reversePath.indexOf(right),left=this.reversePath[Math.max(0,index-1)],f=right.distance>left.distance?(distance-left.distance)/(right.distance-left.distance):0;
      this.follow(this.shadow,{x:left.point.x+(right.point.x-left.point.x)*f,z:left.point.z+(right.point.z-left.point.z)*f},dt,MOTION.catchUpSpeed);
      this.followWithReaction(dt,MOTION.catchUpSpeed);
      if(this.reverseClock>.8)this.once('reverse-reveal',()=>this.say('刚才由影子带路。这一遍，是刚才的路在带两位走。','reverse-reveal',5,true));
    }else{
      if(this.reverseStopping)this.drive(this.shadow,{x:0,z:0},dt);else this.follow(this.shadow,this.reversePath.at(-1)!.point,dt,MOTION.catchUpSpeed);
      this.follow(this.body,this.shadow,dt,MOTION.catchUpSpeed);
      if(this.settled(this.shadow)&&this.settled(this.body,this.shadow,.1)&&this.speechRead()){this.reverseDone=true;this.event('reverse-finished',{interrupted:this.reverseStopping});this.transition('rejoin');}
    }
  }
  skip(){
    if(this.stage==='ended'||this.stage==='curtain')return;this.event('host-skip',{stage:this.stage});
    if(this.stage==='arrival')this.transition('return','host-skip');
    else if(this.stage==='return')return;
    else if(this.stage==='echo')this.transition('follow','host-skip');
    else if(this.stage==='follow')this.transition('rejoin','host-skip');
    else if(this.stage==='reverse'){this.reverseStopping=true;this.memory.rehearsal='interrupted';}
    else if(this.stage==='rejoin')return;
    else this.finish('host-ended');
  }
  finish(ending:string){
    if(this.stage==='ended'||this.stage==='curtain')return;
    if(ending==='exit'&&(!isOutside(this.body)||!isOutside(this.shadow)))return;
    this.endLine('ending-chosen');this.speechQueue=[];this.lineReadUntil=this.time;
    if(ending==='host-ended')this.memory.endingSource='host';
    else if(ending==='player-ended')this.memory.endingSource='player';
    this.ending=ending;this.cue=null;this.stage='curtain';this.elapsed=0;this.target='none';this.bodySource='curtain';this.shadowSource='curtain';this.curtainActing=false;this.curtainClock=0;
    this.event('ending',{ending,memory:copy(this.memory)});
    this.say(ending==='exit'?'这次，两位都到门外了。':ending==='stillness'?'好，两位就在庭院里坐一会儿。':ending==='unfinished'?'这次排练还没有完成。我们先在这里收住。':'这一场，先停在这里。','ending-intention',5);
  }
  performCurtain(dt:number){
    this.drive(this.body,{x:0,z:0},dt);
    if(this.ending==='stillness'&&!this.curtainActing)this.follow(this.shadow,this.body,dt,MOTION.attachSpeed);
    else this.drive(this.shadow,{x:0,z:0},dt);
    if(!this.curtainActing&&this.settled(this.body)&&this.settled(this.shadow)&&(this.ending!=='stillness'||dist(this.body,this.shadow)<.08)){
      this.curtainActing=true;this.curtainClock=0;this.body.clocks.sit=0;this.shadow.clocks.sit=0;this.body.clocks.bow=0;this.shadow.clocks.bow=0;this.event('curtain-ready');
    }
    if(this.curtainActing){
      this.curtainClock+=dt;
      if(this.curtainClock>1.8)this.once('ending-fact',()=>{
        const text:Record<string,string>={exit:this.memory.order==='shadow-first'?'身体先留门，影子先走。后来，影子把身体接了出来。':'影子先留门，身体先走。后来，身体把影子接了出来。',stillness:'两位都坐好了。这里也可以是结尾。',unfinished:'这次还没接上。排练先停在这里。','host-ended':'这一次，由主持人替演出落了幕。','player-ended':'你在这里结束了这次排练。'};
        this.say(text[this.ending]??text['player-ended'],'ending',25);
      });
      if(this.curtainClock>5.8&&this.fired.has('ending-fact')&&this.speechRead()){this.stage='ended';this.event('title-reveal');}
    }
  }
  step(dt=1/60){
    if(this.paused||this.stage==='ended')return;
    this.time+=dt;this.elapsed+=dt;this.tick++;const priorLine=this.lineId;this.flushSpeech();
    const oldB=position(this.body),oldS=position(this.shadow),active=Math.hypot(this.input.x,this.input.z)>.1;
    this.idle=active?0:this.idle+dt;this.bodyActing=null;this.shadowActing=null;this.bodyLook=null;this.shadowLook=null;let recordedBody=false;
    this.updateDoor(dt);
    if(this.stage==='arrival')this.performArrival(dt,oldB);
    else if(this.stage==='return'){
      this.reactShadow(dt,active);this.follow(this.body,this.route[0],dt,MOTION.catchUpSpeed);
      this.settleDwell=this.settled(this.body,this.route[0])?this.settleDwell+dt:0;
      if(this.settleDwell>.35&&this.speechRead())this.transition('echo');
    }else if(this.stage==='echo'){
      if(!this.echoReady){
        const yaw=this.route[0].yaw;this.bodyLook={x:this.body.x+Math.sin(yaw)*3,z:this.body.z+Math.cos(yaw)*3,height:1.35};
        velocity(this.body,{x:0,z:0},dt);this.body.pivoting=true;this.body.turnWait=0;facing(this.body,this.elapsed>.2?yaw:this.body.yaw,dt);this.body.pivotPhase+=Math.abs(this.body.yawVelocity)*dt/(Math.PI/2);
        if(Math.abs(angleDelta(this.body.yaw,yaw))<.06&&Math.abs(this.body.yawVelocity)<.18){this.echoReady=true;this.echoPoseFrom=copy(this.body);this.event('echo-playback-start',{routeStart:this.routeStart,edgeRamp:Math.min(1.2,this.echoWindow),retiming:'original interior timing with smooth entry and exit'});}
      }else{
        const ramp=Math.min(1.2,this.echoWindow),duration=this.echoWindow+ramp;
        this.echoRampTime=Math.min(duration,this.echoRampTime+dt);
        const tail=duration-this.echoRampTime;
        const integrated=(seconds:number)=>{const u=clamp(seconds/ramp,0,1);return ramp*(u*u*u-.5*u*u*u*u);};
        const rate=smooth(Math.min(this.echoRampTime,tail)/ramp);
        this.echoClock=this.echoRampTime<ramp?integrated(this.echoRampTime):tail<ramp?this.echoWindow-integrated(tail):this.echoRampTime-ramp/2;
        const p=routeAt(this.route,this.echoClock),offset=1-smooth(this.echoRampTime/ramp);
        const priorVx=this.body.vx,priorVz=this.body.vz;
        Object.assign(this.body,p);this.body.vx*=rate;this.body.vz*=rate;this.body.ax=(this.body.vx-priorVx)/dt;this.body.az=(this.body.vz-priorVz)/dt;this.body.yawVelocity*=rate;
        this.body.x+=this.echoOffset.x*offset;this.body.z+=this.echoOffset.z*offset;
        const fade=smooth(this.echoRampTime/.45);if(this.echoPoseFrom&&fade<1)for(const name of ANIMATIONS){this.body.weights[name]=this.echoPoseFrom.weights[name]*(1-fade)+p.weights[name]*fade;if(p.weights[name]<1e-5)this.body.clocks[name]=this.echoPoseFrom.clocks[name]+this.echoRampTime;}
        if(rate<1){const locomotion=this.body.weights.walk+this.body.weights.chase;this.body.weights.walk*=rate;this.body.weights.chase*=rate;this.body.weights.idle+=locomotion*(1-rate);}
        recordedBody=true;
        if(this.echoRampTime>=duration){this.bodySource='settling';this.animate(this.body,'idle',dt,0);this.once('echo-stopped',()=>this.event('echo-playback-finished'));}
      }
      this.reactShadow(dt,active);
      if(this.echoClock>=Math.min(6,this.echoWindow))this.once('echo-reveal',()=>this.say('身体在走刚才的路。现在，影子在回应你。','control-reveal',5));
      if(this.echoClock>=this.echoWindow&&this.speechRead())this.transition('follow');
    }else if(this.stage==='follow')this.performFollow(dt);
    else if(this.stage==='reverse')this.performReverse(dt);
    else if(this.stage==='rejoin'){
      this.drive(this.shadow,{x:0,z:0},dt);this.follow(this.body,this.shadow,dt,MOTION.catchUpSpeed);
      this.bodyLook=this.shadowGaze();this.shadowLook={...this.body,height:1.4};
      this.settleDwell=this.settled(this.body,this.shadow,.12)&&this.settled(this.shadow)?this.settleDwell+dt:0;
      if(this.settleDwell>.45){this.bodyActing='reach';this.shadowActing='reach';}
      if(this.settleDwell>.85&&this.speechRead())this.transition('relay');
    }else if(this.stage==='relay')this.performRelay(dt);
    else if(this.stage==='curtain')this.performCurtain(dt);
    const bodySpeed=dist(oldB,this.body)/dt,shadowSpeed=dist(oldS,this.shadow)/dt;
    if(!recordedBody){const animation:Animation=this.curtainActing?(this.ending==='stillness'?'sit':'bow'):this.bodyActing??(bodySpeed>.07?'walk':'idle');this.animate(this.body,animation,dt,bodySpeed);this.lookAt(this.body,this.bodyLook,dt);}
    if(this.stage==='arrival'||this.shadowSource==='attached'){this.shadow=copy(this.body);this.shadowAttachment=1;}
    else{
      const animation:Animation=this.curtainActing?(this.ending==='stillness'?'sit':'bow'):this.shadowActing??(shadowSpeed>.07?'walk':'idle');this.animate(this.shadow,animation,dt,shadowSpeed);this.lookAt(this.shadow,this.shadowLook,dt);
      if(this.curtainActing&&this.ending==='stillness'){const root=position(this.shadow);this.shadow={...copy(this.body),...root};this.shadowAttachment=Math.min(1,this.shadowAttachment+dt/.65);}
    }
    if(this.stage==='arrival')this.route.push(this.routePoint(this.body,this.elapsed));
    this.flushSpeech();this.shadowRoute.push(this.routePoint(this.shadow,this.time));if(this.tick%2===0||(this.stage as Stage)==='ended'||priorLine!==this.lineId)this.record();
  }
  snapshot():Frame{return {t:this.time,stage:this.stage,elapsed:this.elapsed,body:copy(this.body),shadow:copy(this.shadow),shadowAttachment:this.shadowAttachment,input:{...this.input},target:this.target,bodySource:this.bodySource,shadowSource:this.shadowSource,line:this.line,lineId:this.lineId,goal:this.goal,mode:this.mode,ending:this.ending,beat:this.stageBeat(),beatPhase:this.beatPhase,actionLabel:this.actionLabel(),cue:this.cue?{...this.cue}:null,doorOpen:this.doorOpen,doorSlots:0,innerHeld:this.innerHeld,outerHeld:this.outerHeld,memory:copy(this.memory),signTurn:this.signTurn,...this.guidance(),actions:this.actions()};}
  record(){this.frames.push(this.snapshot());}
  export(){return {schemaVersion:8,build:'0.8.0',assetVersion:'actor-5',mode:this.mode,duration:this.time,systemDemo:this.systemDemo,ending:this.ending,memory:copy(this.memory),events:this.events,frames:this.frames};}
}
export function frameAt(frames:Frame[],time:number):Frame {
  let lo=0,hi=frames.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(frames[m].t<=time)lo=m;else hi=m-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],f=b.t>a.t?clamp((time-a.t)/(b.t-a.t),0,1):0;
  return {...a,t:time,body:mixActor(a.body,b.body,f),shadow:mixActor(a.shadow,b.shadow,f),shadowAttachment:a.shadowAttachment+(b.shadowAttachment-a.shadowAttachment)*f,doorOpen:a.doorOpen+(b.doorOpen-a.doorOpen)*f,signTurn:a.signTurn+(b.signTurn-a.signTurn)*f};
}
