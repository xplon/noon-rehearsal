import {SHADOW_SLOPE} from './lighting.ts';
import {freshMemory,readingTime,type StoryMemory} from './direction.ts';
import {steer,angleDelta,type SteeredMotion} from './locomotion.ts';
import {MOTION,facing,velocity,arrival,magnet,easedRouteTime,smooth,clamp,type Motion} from './motion.ts';
import {WORLD_BOUNDS,GATE,FRONT_MARK,INNER_PAD,OUTER_PAD,OUTSIDE_MARK,PAD_RADIUS,ACTOR_RADIUS,limitVelocity,resolveMove,safeDoorStep,doorOccupied,waypoint,isOutside,HOME_MARK,PLANT_MARK,DEPARTURE_MARK,isWalkable} from './space.ts';
export type Mode='student'|'teacher';
export type Stage='arrival'|'return'|'echo'|'follow'|'reverse'|'rejoin'|'relay'|'curtain'|'ended'|'separation'|'shadow'|'handoff'|'encounter';
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
export const HOME=HOME_MARK,EXIT=FRONT_MARK,BOW={x:6.2,z:1.7},LEFT={x:-3.8,z:-1.5},PLANT=PLANT_MARK;
export const THRESHOLD={x:GATE.x,z:GATE.z},DOOR_HOLD=INNER_PAD,DOOR_APPROACH=FRONT_MARK,BOUNDS=WORLD_BOUNDS;
export const CONFIG={student:{arrival:32,echoMax:16},teacher:{arrival:32,echoMax:16}};
export const SOURCES:Record<string,string>={autonomous:'角色自主行动','quote-return':'身体走向引用起点',quote:'本局真实身体动作引用','input-await':'等待松开或换向后接手',input:'当前输入',attached:'随身体投影','recorded-body':'本局身体旧路线','system-demo':'系统示范','system-return':'回到所选真实片段起点',follow:'追随影子',reverse:'沿本局影子路径反向重走（重新定时）',curtain:'落幕动作',none:'无直接控制',shadow:'影子',body:'身体',settling:'减速会合',reaction:'先观察再追随','reaction-step':'影子试着跟上又收住','system-guide':'明确标记的系统接应',partner:'独立搭档','hold-door':'站在留门位','relay-cross':'接手后过门'};
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
    this.say('午休结束了。请从庭院出去。','opening',6);this.event('stage',{stage:this.stage});this.event('instruction',{id:'leave-court',text:'请从庭院出去。',actor:'body',goal:'门外',position:{...OUTER_PAD}});this.cue=null;this.route.push(this.routePoint(this.body,0));this.record();
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
    const n=Math.hypot(x,z);if(this.awaitFreshInput&&(n<.1||x*this.transferVector.x+z*this.transferVector.z<.35)){this.awaitFreshInput=false;this.event('input-ready',{target:this.target});}if(n>1){x/=n;z/=n;}x=Math.round(x*100)/100;z=Math.round(z*100)/100;
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

  // v0.9: narrative decisions come from positions and movement, never menu choices.
  awaitFreshInput=false;transferVector:Vec={x:0,z:0};transferAt=0;
  firstPadAt=-1;firstLeaveAt=-1;latestPadAt=-1;latestLeaveAt=-1;openedOnce=false;quoteSource:RoutePoint[]=[];
  padOwners={inner:'',outer:''};padDwell:Record<string,number>={};
  separationOrigin:Vec={...HOME};separationMark:Vec={...HOME};
  encounterOrigin:Vec={...HOME};encounterTravel=0;encounterDwell=0;testMark:Vec={...HOME};
  quoteStatus:'none'|'returning'|'aligning'|'playing'|'done'|'skipped'|'interrupted'='none';quoteClock=0;quoteStart=0;quoteDuration=0;quotePose:Actor|null=null;quoteEncounterDwell=0;
  handoffNext='';handoffClock=0;relayFirst:'body'|'shadow'='body';relayReady=false;partnerReleased=false;
  outsideStarted=false;outsidePhase='invitation';outsideMark:Vec={x:6.3,z:2.1};outsideInputDistance=0;outsideOrigin:Vec={...OUTSIDE_MARK};
  formation:'unresolved'|'reunited'|'alongside'='unresolved';formationDwell=0;outsideReturning=false;
  outsideRoute:RoutePoint[]=[];responseRoute:{x:number;z:number;t:number}[]=[];responseAt=-1;responseDuration=0;responseDone=false;responsePreparing=false;responseSource={start:0,end:0};
  metrics={inputSeconds:0,watchSeconds:0,unoperatedSeconds:0,movingSeconds:0};
  responded=new Set<string>();
  stageBeat(){return this.beatPhase;}
  actions():ActionChoice[]{return [];}
  actionLabel(){return '';}
  interact(){} choose(_id:string){}
  routePoint(a:Actor,t:number):RoutePoint{return {...copy(a),t};}
  settled(a:Actor,target?:Vec,tolerance=.08){return speed(a)<.10&&(!target||dist(a,target)<tolerance);}
  playerInput(){return this.awaitFreshInput?{x:0,z:0}:this.input;}
  transfer(to:'body'|'shadow'|'none',reason:string){
    const from=this.target;this.target=to;this.transferAt=this.time;
    this.transferVector={...this.input};this.awaitFreshInput=to!=='none'&&speed({vx:this.input.x,vz:this.input.z} as Motion)>.1;
    this.event('control-transfer',{from,to,reason,body:position(this.body),shadow:position(this.shadow),freshInputRequired:this.awaitFreshInput});
  }
  respond(id:string,response:'followed'|'alternative'|'unanswered',evidence:string){
    if(this.responded.has(id))return;this.responded.add(id);
    const instruction=this.events.find(e=>e.type==='instruction'&&e.id===id);
    this.event('instruction-response',{id,response,evidence,windowStart:instruction?.t??0,windowEnd:this.time});
  }
  guidance(){
    let objective=this.stage==='arrival'?'从庭院出去。':this.stage==='curtain'||this.stage==='ended'?'':'和搭档一起离开。';
    let help='方向键 / WASD 移动。留意脚下的石板和门的动静。';
    if(this.stage==='separation'){objective='';help='这是一段角色自己的动作，方向输入仍会显示。';}
    if(this.stage==='shadow'||this.stage==='encounter'&&this.beatPhase!=='outside-invitation')help='方向输入正在交给影子。可以靠近、走开，看看身体怎样回应。';
    if(this.stage==='echo'||this.stage==='return')help='影子仍由你控制。身体在引用这一局已经发生的动作。';
    if(this.stage==='relay')help=this.target==='body'?'身体回应你的方向。搭档还在门的另一侧，留意相同纹样的石板。':'影子回应你的方向。身体会回应门现在的状态；可以过门，也可以回头。';
    if(this.stage==='handoff'){objective='';help='角色正在交接。松开旧方向，再迈出下一步。';}
    if(this.stage==='encounter'&&this.beatPhase==='outside-invitation')help='身体回应你的方向。你可以靠近搭档，也可以继续走向出口。';
    let controlLabel=this.target==='none'?'角色正在行动':this.target==='body'?'方向 · 身体':'方向 · 影子';
    if(this.awaitFreshInput&&this.time-this.transferAt>.55)controlLabel+=' · 松开方向后接手';
    if(this.stage==='curtain'||this.stage==='ended')controlLabel='';
    return {objective,controlLabel,help};
  }
  transition(next:Stage,reason='action'){
    if(this.stage==='ended')return;
    const sameBeat=this.stage==='handoff'&&next==='relay'||this.stage==='separation'&&next==='shadow';
    if(sameBeat)this.speechQueue=this.speechQueue.map(s=>({...s,scope:next}));
    else {this.endLine('scene-changed');this.speechQueue=[];this.lineReadUntil=this.time;}
    this.event('transition',{from:this.stage,to:next,reason});this.stage=next;this.elapsed=0;this.phaseAt=this.time;this.settleDwell=0;this.cue=null;
    this.event('stage',{stage:next});
    if(next==='separation'){
      this.transfer('none','shadow-keeps-the-gesture');this.shadowAttachment=0;
      this.separationOrigin=position(this.body);this.separationMark={x:this.body.x-1.45,z:Math.min(BOUNDS.bottom-.7,this.body.z+1.35)};
      if(dist(this.separationMark,INNER_PAD)<1.3)this.separationMark.z=Math.min(BOUNDS.bottom-.7,INNER_PAD.z+1.65);
      this.bodyAwaitingLead=true;this.bodySource='reaction';this.shadowSource='autonomous';this.beatPhase='gesture';
      this.event('separation',{origin:position(this.body),cause:'gate-closed-after-leaving-plate'});
    }else if(next==='shadow'){
      this.transfer('shadow','shadow-offers-a-step');this.bodySource='follow';this.shadowSource='input';this.beatPhase='discover';this.bodyAwaitingLead=true;
      this.encounterOrigin=position(this.shadow);this.encounterTravel=0;
    }else if(next==='encounter'&&!this.outsideStarted){
      this.beatPhase='wear-invitation';this.encounterOrigin=position(this.shadow);this.encounterTravel=0;this.encounterDwell=0;
      this.bodySource='autonomous';this.shadowSource='input';
      this.event('instruction',{id:'come-close',text:'回来，站这里。',actor:'shadow',goal:'身体脚边',position:position(this.body)});
      this.say('身体：回来，站这里。','wear-invitation',4);
    }else if(next==='follow'){
      this.target='shadow';this.bodyAwaitingLead=true;this.bodySource='follow';this.shadowSource='input';this.beatPhase='discover';
    }
  }
  startHandoff(to:'body'|'shadow',next:string){
    this.transition('handoff','physical-partnership');this.handoffNext=next;this.handoffClock=0;this.beatPhase='to-'+to;
    this.transfer('none','partners-look-at-each-other');this.bodySource='reaction';this.shadowSource='hold-door';
  }
  performHandoff(dt:number){
    this.drive(this.body,{x:0,z:0},dt);this.drive(this.shadow,{x:0,z:0},dt);
    this.bodyLook=this.shadowGaze();this.shadowLook={...this.body,height:1.4};
    this.handoffClock+=dt;if(this.handoffClock>.25)this.bodyActing='reach';
    if(this.handoffClock>.85&&this.settled(this.body)&&this.settled(this.shadow)){
      const next=this.handoffNext;this.transition('relay','handoff-complete');
      this.transfer('body','body-accepts-direction');this.bodySource='input';
      if(next==='outside'){this.beginOutside();return;}
      this.beatPhase=next;this.relayReady=true;
      if(next==='body-first'){this.relayFirst='body';this.memory.order='body-first';this.memory.orderSource='movement';}
      else this.relayFirst='shadow';
      this.memory.door='in-progress';
      this.event('control-returned',{shadowIndependent:true});
    }
  }
  updateDoor(dt:number){
    const actors=this.shadowAttachment>.99?[['body',this.body] as const]:[['body',this.body] as const,['shadow',this.shadow] as const];
    const previous={...this.padOwners};
    for(const [name,pad] of [['inner',INNER_PAD],['outer',OUTER_PAD]] as const){
      const holders:string[]=[];
      for(const [who,a] of actors){const key=name+'-'+who;this.padDwell[key]=dist(a,pad)<PAD_RADIUS?(this.padDwell[key]??0)+dt:0;if(this.padDwell[key]>.08)holders.push(who);}
      this.padOwners[name]=holders.join('+');
      if(previous[name]!==this.padOwners[name]){
        for(const who of ['body','shadow']){
          const held=holders.includes(who);if(previous[name].includes(who)!==held)this.event('pad',{pad:name,actor:who,held,body:position(this.body),shadow:position(this.shadow)});
        }
        this.event('door-pad',{inner:!!this.padOwners.inner,outer:!!this.padOwners.outer,body:position(this.body),shadow:position(this.shadow)});
      }
    }
    this.innerHeld=!!this.padOwners.inner;this.outerHeld=!!this.padOwners.outer;
    this.innerDwell=this.innerHeld?this.innerDwell+dt:0;this.outerDwell=this.outerHeld?this.outerDwell+dt:0;
    if(this.stage==='arrival'){
      if(this.innerHeld&&!previous.inner)this.latestPadAt=this.time;
      if(previous.inner&&!this.innerHeld)this.latestLeaveAt=this.time;
      if(this.innerHeld&&this.firstPadAt<0){this.firstPadAt=this.time;this.event('first-plate',{actor:'body'});}
      if(this.firstPadAt>=0&&previous.inner&&!this.innerHeld&&this.firstLeaveAt<0){this.firstLeaveAt=this.time;this.event('first-release',{actor:'body'});}
      if(this.doorOpen>.25)this.openedOnce=true;
    }
    this.doorOpen=safeDoorStep(this.doorOpen,this.innerHeld||this.outerHeld?1:0,actors.map(([,a])=>a),dt);
  }
  performArrival(dt:number){
    this.target='body';this.bodySource='input';this.shadowSource='attached';
    if(this.fired.has('gate-failure'))this.drive(this.body,{x:0,z:0},dt);else this.move(this.body,this.playerInput(),dt,MOTION.speed,INNER_PAD);
    if(this.firstPadAt<0&&dist(this.body,FRONT_MARK)<1.1){
      this.bodyLook={...INNER_PAD,height:0};
      this.once('first-door-look',()=>{this.say('人到了。门倒是纹丝不动。','closed-door',4);this.event('door-inspected');});
    }
    if(this.openedOnce&&this.firstLeaveAt>=0&&this.doorOpen<.07&&dist(this.body,FRONT_MARK)<1.35){
      this.once('gate-failure',()=>{this.event('gate-failure',{body:position(this.body),firstPadAt:this.firstPadAt,firstLeaveAt:this.firstLeaveAt,latestPadAt:this.latestPadAt,latestLeaveAt:this.latestLeaveAt});});
      if(this.settled(this.body)){
        this.quoteSource=this.route.map(p=>copy(p));this.transition('separation','actual-gate-failure');
        this.say('门关得倒挺准时。','gate-joke',3.5);this.say('身体：我还没出去。','body-retort',3.5);
      }
    }
    if(this.elapsed>22&&this.firstPadAt<0)this.once('plate-look',()=>{this.bodyLook={...INNER_PAD,height:0};this.say('身体：这边的石板好像会动。','local-hint',5);this.event('assistance',{source:'environment-observation',stage:'arrival'});});
    if(isOutside(this.body))this.once('opening-unexpected-cross',()=>{this.respond('leave-court','followed','身体实际通过门槛。');this.event('opening-crossed');});
  }
  performSeparation(dt:number){
    this.bodySource='reaction';this.shadowSource='autonomous';
    if(this.elapsed<1.5){
      this.drive(this.body,{x:0,z:0},dt);this.drive(this.shadow,{x:0,z:0},dt);
      this.bodyActing=this.elapsed<.65?'shrug':'idle';this.shadowActing=this.elapsed>.45?'shrug':'idle';
      if(this.elapsed>.8)this.bodyLook=this.shadowGaze();
    }else{
      this.follow(this.shadow,this.separationMark,dt,1.25*smooth((this.elapsed-1.5)/.6));
      this.followWithReaction(dt,1.45);
      if(dist(this.body,this.shadow)>.65)this.once('shadow-departed',()=>this.say('身体：你去哪儿？','shadow-departed',3));
      if(this.settled(this.shadow,this.separationMark,.12)&&this.elapsed>3.1){this.shadowLook={...this.body,height:1.4};this.transition('shadow','autonomous-route-finished');}
    }
  }
  liveShadow(dt:number){
    const old=position(this.shadow);this.move(this.shadow,this.playerInput(),dt,MOTION.speed,INNER_PAD);this.shadowSource=this.awaitFreshInput?'input-await':'input';
    this.encounterTravel+=dist(old,this.shadow);
  }
  performShadow(dt:number){
    this.liveShadow(dt);this.bodySource='follow';
    if(dist(this.shadow,INNER_PAD)<1.5){
      const observation={x:INNER_PAD.x+1.05,z:INNER_PAD.z+1.0};this.follow(this.body,observation,dt,1.5);this.bodyLook=this.shadowGaze();
    }else this.followWithReaction(dt,1.9);
    if(this.mode==='teacher'&&this.encounterTravel>.55){this.transition('encounter','shadow-responded-to-player');return;}
    if(this.padOwners.inner.includes('shadow')&&this.innerDwell>.35&&this.doorOpen>.8){
      this.bodyLook={...FRONT_MARK,height:1.3};this.bodyActing='surprise';
      this.once('shadow-opens',()=>{this.event('shadow-opened-door');});
      this.startHandoff('body','body-first');
      this.say('身体：……还开着。','shadow-keeps-door',3.5);
    }
    if(this.elapsed>18&&!this.innerHeld)this.once('shadow-no-progress',()=>{this.bodyLook={...INNER_PAD,height:0};this.say('身体：刚才就是这里。','shadow-local-hint',4);});
  }
  performWear(dt:number){
    this.liveShadow(dt);this.bodyLook=this.shadowGaze();
    const apart=dist(this.body,this.shadow),active=Math.hypot(this.playerInput().x,this.playerInput().z)>.1;
    if(this.beatPhase==='wear-invitation'){
      this.drive(this.body,{x:0,z:0},dt);this.bodyActing='reach';
      this.encounterDwell=apart<.34&&speed(this.shadow)<.25?this.encounterDwell+dt:0;
      if(this.encounterDwell>.3){
        this.memory.encounter='overlapped';this.respond('come-close','followed','影子的脚部与身体实际接近。');this.beginWearTest();
      }else if(this.encounterTravel>3.1&&apart>1.4){
        this.memory.encounter='kept-apart';this.respond('come-close','alternative','影子移动了超过三米，并保持在身体脚边之外。');
        this.event('encounter-result',{outcome:'kept-apart',source:'player-position',distance:apart});
        this.say('身体：好。那就分开走。','wear-kept-apart',4);this.beatPhase='wear-release';this.phaseAt=this.time;
      }else if(this.elapsed>8){
        this.beatPhase='body-approaches';this.phaseAt=this.time;this.bodySource='autonomous';
        this.say('旁白：站位这件事，他打算亲自处理。','body-approaches',5);
      }
    }else if(this.beatPhase==='body-approaches'){
      this.followWithReaction(dt,1.3,true);
      if(apart<.38&&!active){this.memory.encounter='body-approached';this.respond('come-close','unanswered','影子没有走向身体；接近由身体自主完成。');this.beginWearTest();}
      else if(this.encounterTravel>4.5&&apart>1.25){this.memory.encounter='kept-apart';this.respond('come-close','alternative','影子继续移动，身体没有追到脚边。');this.event('encounter-result',{outcome:'kept-apart',source:'player-position',distance:apart});this.beatPhase='wear-release';this.phaseAt=this.time;this.say('身体：你比刚才难穿多了。','wear-missed',4);}
    }else if(this.beatPhase==='wear-test'){
      this.bodySource='autonomous';this.follow(this.body,this.testMark,dt,.85);this.bodyLook=this.shadowGaze();
      if(dist(this.body,this.shadow)>.7)this.once('wear-mismatch',()=>{this.bodyActing='surprise';this.say('旁白：恢复原样——这句话说早了。','wear-mismatch',4.5,true);});
      if(this.settled(this.body,this.testMark,.1)||this.time-this.phaseAt>4){this.beatPhase='wear-release';this.phaseAt=this.time;this.event('wear-test-ended',{body:position(this.body),shadow:position(this.shadow)});}
    }else{
      this.drive(this.body,{x:0,z:0},dt);if(this.speechRead())this.beginQuote();
    }
  }
  beginWearTest(){
    this.event('encounter-result',{outcome:this.memory.encounter,source:this.memory.encounter==='body-approached'?'actor-action':'player-position'});
    this.beatPhase='wear-test';this.phaseAt=this.time;this.testMark={x:Math.min(GATE.x-.8,this.body.x+1.0),z:this.body.z-.5};
    if(!isWalkable(this.testMark,this.doorOpen))this.testMark={x:this.body.x-.9,z:this.body.z};
    this.say('身体：这次，跟紧。','wear-test',3);
  }
  beginQuote(){
    this.transition('return','body-cites-earlier-action');this.target='shadow';this.shadowSource='input';this.bodySource='quote-return';this.beatPhase='quote-return';
    const release=this.latestLeaveAt>=0?this.latestLeaveAt:this.firstLeaveAt;
    const press=this.latestPadAt>=0?this.latestPadAt:this.firstPadAt;
    const end=release>0?release+.16:press;
    const source=this.quoteSource.filter(p=>p.t<=end&&p.t>=Math.max(0,end-4));
    let selected=source;
    // A nearby continuous tail avoids making the actor walk back through the whole courtyard.
    while(selected.length>2&&dist(this.body,selected[0])>3.8)selected=selected.slice(15);
    const travel=selected.reduce((n,p,i)=>n+(i?dist(p,selected[i-1]):0),0);
    if(selected.length<3||travel<.3||dist(this.body,selected[0])>4.0){
      this.quoteStatus='skipped';this.event('quote-skipped',{reason:'no-nearby-moving-continuous-interval'});this.memory.rehearsal='unavailable';this.beginTeacherRelay();return;
    }
    this.quoteStart=selected[0].t;this.routeStart=this.quoteStart;this.route=selected.map(p=>({...copy(p),t:p.t-this.quoteStart}));this.echoWindow=this.route.at(-1)!.t;
    this.quoteStatus='returning';this.quoteClock=0;this.echoReady=false;this.quoteDuration=this.echoWindow+Math.min(.65,this.echoWindow);
    this.event('quote-selected',{sourceStart:this.quoteStart,sourceEnd:this.quoteStart+this.echoWindow,selection:this.quoteStart>press?'continuous-tail-after-long-hold':'continuous-latest-plate-and-release',platePress:press,plateRelease:release,distance:travel});
    this.say('身体：刚才，我明明是这样走的。','quote-invitation',4.5);
  }
  performQuote(dt:number){
    const oldShadow=position(this.shadow);this.liveShadow(dt);
    if(this.quoteStatus==='returning'){
      this.bodySource='quote-return';this.follow(this.body,this.route[0],dt,1.8);
      if(this.settled(this.body,this.route[0],.05)){this.quoteStatus='aligning';this.phaseAt=this.time;}
      return false;
    }
    if(this.quoteStatus==='aligning'){
      const yaw=this.route[0].yaw;this.bodyLook={x:this.body.x+Math.sin(yaw)*2,z:this.body.z+Math.cos(yaw)*2,height:1.4};
      this.drive(this.body,{x:0,z:0},dt);this.body.pivoting=true;this.body.turnWait=this.time-this.phaseAt<.22?1:0;
      if(!this.body.turnWait&&speed(this.body)<.005)facing(this.body,yaw,dt);
      if(Math.abs(angleDelta(this.body.yaw,yaw))<.07&&Math.abs(this.body.yawVelocity)<.2){
        this.quoteStatus='playing';this.stage='echo';this.elapsed=0;this.beatPhase='quote';this.quotePose=copy(this.body);this.echoOffset={x:this.body.x-this.route[0].x,z:this.body.z-this.route[0].z};
        this.event('stage',{stage:'echo'});this.event('quote-start',{sourceStart:this.quoteStart,sourceEnd:this.quoteStart+this.echoWindow,retiming:'original interior; eased temporal edges',edgeRamp:Math.min(.65,this.echoWindow)});
        this.event('echo-playback-start',{routeStart:this.quoteStart});this.memory.rehearsal='performed';
      }
      return false;
    }
    const approaching=dist(oldShadow,this.body)-dist(this.shadow,this.body)>.002&&Math.hypot(this.playerInput().x,this.playerInput().z)>.1;
    this.quoteEncounterDwell=dist(this.body,this.shadow)<.5&&approaching?this.quoteEncounterDwell+dt:0;
    if(this.quoteEncounterDwell>.12){this.quoteStatus='interrupted';this.event('quote-interrupted',{sourceCursor:this.quoteStart+this.echoClock,reason:'live-encounter'});this.beginTeacherRelay();this.say('旁白：这一句被叫住了。','quote-interrupted',4,true);return false;}
    this.bodySource='quote';this.quoteClock=Math.min(this.quoteDuration,this.quoteClock+dt);
    const ramp=Math.min(.65,this.echoWindow),tail=this.quoteDuration-this.quoteClock;
    const integral=(seconds:number)=>{const u=clamp(seconds/ramp,0,1);return ramp*(u*u*u-.5*u*u*u*u);};
    const clock=this.quoteClock<ramp?integral(this.quoteClock):tail<ramp?this.echoWindow-integral(tail):this.quoteClock-ramp/2;
    this.echoClock=clock;
    const p=routeAt(this.route,clock),rate=smooth(Math.min(this.quoteClock,tail)/ramp),edge=1-smooth(this.quoteClock/ramp);
    const old=position(this.body);Object.assign(this.body,p);this.body.x+=this.echoOffset.x*edge;this.body.z+=this.echoOffset.z*edge;
    const legal=resolveMove(old,this.body,this.doorOpen);this.body.x=legal.x;this.body.z=legal.z;this.body.vx*=rate;this.body.vz*=rate;this.body.ax*=rate;this.body.az*=rate;this.body.yawVelocity*=rate;
    const fade=smooth(this.quoteClock/.35);if(this.quotePose&&fade<1)for(const name of ANIMATIONS)this.body.weights[name]=this.quotePose.weights[name]*(1-fade)+p.weights[name]*fade;
    const locomotion=this.body.weights.walk+this.body.weights.chase;this.body.weights.walk*=rate;this.body.weights.chase*=rate;this.body.weights.idle+=locomotion*(1-rate);
    if(this.quoteClock>=this.quoteDuration){this.quoteStatus='done';this.event('quote-end',{sourceEnd:this.quoteStart+this.echoWindow});this.beginTeacherRelay();}
    return true;
  }
  beginTeacherRelay(){
    this.transition('relay','quote-finished-or-skipped');this.target='shadow';this.bodySource='autonomous';this.shadowSource='input';this.beatPhase='teacher-read';this.relayReady=false;this.memory.door='in-progress';
  }
  setOrder(first:'body'|'shadow',reason:string){
    this.relayFirst=first;this.memory.order=first==='body'?'body-first':'shadow-first';this.memory.orderSource='movement';this.relayReady=true;
    this.event('relay-order',{first,reason,source:'movement',body:position(this.body),shadow:position(this.shadow)});
    this.beatPhase=first==='body'?'teacher-body-first':'teacher-shadow-first';
  }
  performRelay(dt:number){
    if(this.mode==='teacher'&&this.target==='shadow'){
      this.move(this.shadow,this.playerInput(),dt,MOTION.speed,OUTER_PAD);this.shadowSource=this.awaitFreshInput?'input-await':'input';this.bodyLook=this.shadowGaze();
      if(this.beatPhase==='teacher-read'){
        this.drive(this.body,{x:0,z:0},dt);this.bodyActing='look';
        if(this.elapsed>.55){
          if(isOutside(this.shadow))this.setOrder('shadow','shadow-crossed-during-quote');
          else if(this.padOwners.inner.includes('shadow')&&this.doorOpen>.75)this.setOrder('body','shadow-is-holding-inner-plate');
          else this.setOrder('shadow','body-offers-to-hold-inner-plate');
        }
      }else if(this.relayFirst==='shadow'){
        this.follow(this.body,INNER_PAD,dt,1.7);this.bodySource='hold-door';
        if(this.innerHeld&&this.padOwners.inner.includes('body'))this.once('body-holding',()=>this.say('身体：这回你先。','body-holding',3.5));
        if(doorOccupied([this.shadow])&&this.doorOpen>.9&&speed(this.shadow)<.2&&this.settled(this.body,INNER_PAD,.15)){
          this.setOrder('body','shadow-holds-real-doorway');this.say('身体：你把门留住了。','doorway-handoff',3.5);
        }else if(this.padOwners.inner.includes('shadow')&&this.padDwell['inner-shadow']>.45&&speed(this.shadow)<.2&&this.settled(this.body,INNER_PAD,.15)){
          this.setOrder('body','shadow-took-over-inner-plate');this.say('身体：那我先试试。','body-takes-offer',3.5);
        }else if(isOutside(this.shadow)&&this.padOwners.outer.includes('shadow')&&this.outerDwell>.3&&speed(this.shadow)<.25&&this.settled(this.body,INNER_PAD,.15)){
          this.event('relay-handoff',{holder:'shadow',order:'shadow-first',source:'movement'});this.startHandoff('body','shadow-first');
        }
      }else{
        if(this.innerHeld||this.doorOpen>.9||isOutside(this.body)){this.follow(this.body,OUTER_PAD,dt,1.8);this.bodySource='relay-cross';}
        else{this.drive(this.body,{x:0,z:0},dt);this.bodyActing='reach';this.noteWithdrawal();}
        if(isOutside(this.body)&&this.padOwners.outer.includes('body')){
          this.partnerReleased=true;this.once('teacher-body-outside',()=>{this.respond('leave-court','followed','身体在影子留门时自主穿过门洞；当时方向输入控制影子。');this.event('relay-handoff',{holder:'body',order:'body-first',source:'movement'});this.say('身体：到你了。','teacher-body-outside',3.5);});
          if(isOutside(this.shadow))this.startHandoff('body','outside');
        }
      }
    }else{
      this.bodySource=this.awaitFreshInput?'input-await':'input';
      const catching=this.partnerReleased&&isOutside(this.body);
      this.move(this.body,this.playerInput(),dt,catching?1.1:MOTION.speed,this.partnerReleased&&isOutside(this.shadow)?undefined:OUTER_PAD);
      if(this.relayFirst==='body'){
        if(!this.partnerReleased){
          this.follow(this.shadow,INNER_PAD,dt,1.5);this.shadowSource='hold-door';this.shadowLook={...this.body,height:1.4};
          const byPlate=isOutside(this.body)&&this.padOwners.outer.includes('body')&&this.outerDwell>.25;
          const byDoorway=doorOccupied([this.body])&&this.doorOpen>.9;
          if((byPlate||byDoorway)&&speed(this.body)<.25){
            this.partnerReleased=true;this.event('relay-handoff',{holder:'body',method:byPlate?'outer-plate':'doorway',source:'movement'});this.say('身体：过来。','come-through',3);
          }
        }else{
          this.shadowSource='relay-cross';
          if(!isOutside(this.shadow)){
            if(this.outerHeld||this.doorOpen>.92||doorOccupied([this.shadow]))this.follow(this.shadow,OUTSIDE_MARK,dt,1.9);
            else {this.drive(this.shadow,{x:0,z:0},dt);this.shadowActing='reach';this.noteWithdrawal();}
          }else this.follow(this.shadow,isOutside(this.body)?this.body:OUTER_PAD,dt,2.7);
          this.bodyLook=this.shadowGaze();
        }
      }else{
        this.follow(this.shadow,OUTER_PAD,dt,1.4);this.shadowSource='hold-door';this.shadowLook={...this.body,height:1.4};
        if(isOutside(this.body))this.partnerReleased=true;
      }
      if(isOutside(this.body))this.once('body-outside',()=>{this.respond('leave-court','followed','身体实际穿过唯一门洞，到达外庭。');this.event('target-entered',{target:'outside'});});
      if(this.partnerReleased&&isOutside(this.body)&&isOutside(this.shadow)){
        if(this.mode==='teacher'){this.beginOutside();return;}
        if(dist(this.body,this.shadow)<.35){this.memory.reunion='reunited';this.completeCrossing();}
      }
    }
    if(this.elapsed>22&&!this.outerHeld)this.once('relay-observation',()=>this.say(this.target==='shadow'?'身体：我还在这边。':'影子：我还在这边。','relay-observation',4));
  }
  noteWithdrawal(){
    if(this.time-this.phaseAt<1)return;
    this.once('withdrawal-'+this.memory.withdrawals,()=>{});
    if(this.fired.has('withdrawal-active'))return;this.fired.add('withdrawal-active');this.memory.withdrawals++;
    this.event('plate-withdrawal',{body:position(this.body),shadow:position(this.shadow)});this.say('搭档：等等。','withdrawal',3);
  }
  beginOutside(){
    if(this.outsideStarted)return;this.outsideStarted=true;
    if(this.stage!=='encounter')this.transition('encounter','both-have-crossed');
    this.beatPhase='outside-invitation';this.outsidePhase='invitation';this.phaseAt=this.time;this.outsideOrigin=position(this.body);this.outsideInputDistance=0;
    this.target='body';this.bodySource='input';this.shadowSource='autonomous';this.cue=null;
    this.event('outside-invitation',{body:position(this.body),shadow:position(this.shadow),encounter:this.memory.encounter});
    this.event('instruction',{id:'leave-together',text:'出口就在前面。',actor:'body',goal:'出口',position:{...DEPARTURE_MARK}});
    this.say('旁白：门过了。现在，总该能一起走了。','outside-narrator',5,true);
    this.outsideRoute=[this.routePoint(this.body,this.time)];
  }
  prepareResponse(){
    if(this.responseDone||this.responsePreparing||this.responseAt>=0)return false;
    const moving=this.outsideRoute.filter(p=>p.t>=this.time-3.2);if(moving.length<8)return false;
    const travel=moving.reduce((n,p,i)=>n+(i?dist(p,moving[i-1]):0),0);if(travel<.65)return false;
    const first=moving[0],last=moving.at(-1)!;
    const turn=Math.abs(angleDelta(first.yaw,last.yaw));
    if(speed(this.body)>.2&&turn<.7)return false;
    this.responseSource={start:first.t,end:last.t};this.responseDuration=last.t-first.t;
    this.responseRoute=moving.map(p=>({x:this.shadow.x+(p.x-first.x)*.7,z:this.shadow.z+(p.z-first.z)*.7,t:p.t-first.t}));
    if(this.responseRoute.some(p=>!isWalkable(p,this.doorOpen)||!isOutside(p))){this.event('response-unavailable',{reason:'space',sourceStart:first.t,sourceEnd:last.t});this.responseDone=true;return false;}
    this.responsePreparing=true;this.phaseAt=this.time;this.event('response-preparing',{sourceStart:first.t,sourceEnd:last.t});return true;
  }
  performResponse(dt:number){
    this.shadowLook={...this.body,height:1.4};this.shadowSource='autonomous';
    if(this.responsePreparing){
      this.drive(this.shadow,{x:0,z:0},dt);this.shadowActing='look';
      if(this.time-this.phaseAt>.65&&this.settled(this.shadow)){
        this.responsePreparing=false;this.responseAt=this.time;
        this.event('response-start',{sourceStart:this.responseSource.start,sourceEnd:this.responseSource.end,transformation:'translated-scaled',scale:.7});
        this.say('影子：你那几步，我学会了。','response-start',4.5,true);
      }
      return;
    }
    const clock=Math.min(this.responseDuration,this.time-this.responseAt);
    let right=this.responseRoute.findIndex(p=>p.t>=clock);if(right<0)right=this.responseRoute.length-1;
    const a=this.responseRoute[Math.max(0,right-1)],b=this.responseRoute[right],f=b.t>a.t?(clock-a.t)/(b.t-a.t):0;
    const target={x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f};this.follow(this.shadow,target,dt,1.65);
    if(clock>=this.responseDuration&&(this.settled(this.shadow,this.responseRoute.at(-1)!,.12)||this.time-this.responseAt>this.responseDuration+2)){
      this.responseDone=true;this.responseAt=-1;this.event('response-end',{reason:'completed'});this.shadowActing='reach';
    }
  }
  performOutside(dt:number){
    const before=position(this.body),shadowBefore=position(this.shadow);this.move(this.body,this.playerInput(),dt,this.outsidePhase==='walking'?1.1:1.65);this.bodySource=this.awaitFreshInput?'input-await':'input';this.outsideInputDistance+=dist(before,this.body);
    this.bodyLook=this.shadowGaze();
    this.outsideRoute.push(this.routePoint(this.body,this.time));
    // Going back is a real reversible action. The companion holds the outer plate again.
    if(!isOutside(this.body)){
      if(!this.outsideReturning){this.outsideReturning=true;this.memory.returns++;this.event('returned-inside',{body:position(this.body)});this.say('影子：我在这边等。','outside-return',3.5);}
      this.follow(this.shadow,OUTER_PAD,dt,1.7);this.shadowSource='hold-door';this.shadowLook={...this.body,height:1.4};return;
    }
    this.outsideReturning=false;
    const bodyApproached=dist(before,shadowBefore)-dist(this.body,shadowBefore)>.002&&Math.hypot(this.playerInput().x,this.playerInput().z)>.1;
    if(this.outsidePhase==='invitation'){
      if(this.responsePreparing||this.responseAt>=0)this.performResponse(dt);
      else{
        this.shadowSource='autonomous';this.follow(this.shadow,this.outsideMark,dt,1.1);this.shadowLook={...this.body,height:1.4};
        if(this.settled(this.shadow,this.outsideMark,.2)&&!this.responseDone){this.shadowActing=this.memory.withdrawals?'reach':'shrug';this.prepareResponse();}
      }
      if(this.outsideInputDistance>.5&&(this.body.x>8.0||this.time-this.phaseAt>2.4)){
        const together=dist(this.body,this.shadow)<.7&&bodyApproached&&this.responseDone;
        const ahead=this.body.x>8.0;
        if(together||ahead){
          if(this.responsePreparing||this.responseAt>=0){this.event('response-end',{reason:'left-for-exit'});this.responsePreparing=false;this.responseAt=-1;this.responseDone=true;}
          this.formation=together?'reunited':'alongside';this.outsidePhase='walking';
          this.event('formation-change',{formation:this.formation,reason:together?'body-approached':'body-walked-ahead',body:position(this.body),shadow:position(this.shadow)});
          if(together)this.say(this.memory.encounter==='kept-apart'?'身体：这次，站近一点。':'身体：这回是我过来了。','outside-together',4);
          else this.say('旁白：并排也算一起。这句我改一下。','outside-alongside',4,true);
        }
      }
      if(this.time-this.phaseAt>15)this.once('outside-reaction',()=>this.say('影子：走吧。','outside-invitation',3));
    }else{
      const aligned=Math.abs(angleDelta(this.body.yaw,this.shadow.yaw))<.5;
      this.formationDwell=bodyApproached&&dist(this.body,this.shadow)<.7&&aligned?this.formationDwell+dt:0;
      if(this.formationDwell>.25&&this.formation!=='reunited'){this.formation='reunited';this.event('formation-change',{formation:'reunited',reason:'body-approached-in-same-direction'});}
      if(dist(this.body,this.shadow)>1.8&&!bodyApproached&&speed(this.body)>.3&&this.formation!=='alongside'){this.formation='alongside';this.event('formation-change',{formation:'alongside',reason:'body-moved-apart'});}
      const offset=this.formation==='alongside'?{x:this.body.x-.55,z:this.body.z+.8}:position(this.body);
      this.shadowSource='partner';this.follow(this.shadow,offset,dt,2.7);this.shadowLook={...this.body,height:1.4};
      const atDeparture=(p:Vec)=>p.x>10.4&&p.z>-2.0&&p.z<.2;
      if(atDeparture(this.body)&&atDeparture(this.shadow)){
        this.memory.reunion=dist(this.body,this.shadow)<.55&&aligned?'reunited':'alongside';
        this.event('reunion-choice',{outcome:this.memory.reunion,body:position(this.body),shadow:position(this.shadow),basis:'actual-formation-at-departure-line'});
        this.respond('leave-together','followed','身体与影子实际走入外庭离场通道；同行形态按当时位置记录。');this.completeCrossing();
      }
    }
  }
  completeCrossing(){
    if(!isOutside(this.body)||!isOutside(this.shadow))return;
    this.memory.door='passed-together';this.memory.endingSource='completed';
    this.event('both-crossed',{body:position(this.body),shadow:position(this.shadow),gateX:GATE.x,formation:this.memory.reunion});this.finish('exit');
  }
  finish(ending:string){
    if(this.stage==='ended'||this.stage==='curtain')return;if(ending==='exit'&&(!isOutside(this.body)||!isOutside(this.shadow)))return;
    this.endLine('curtain');this.speechQueue=[];this.lineReadUntil=this.time;
    if(ending!=='exit'){this.memory.endingSource=ending==='host-ended'?'host':'player';this.memory.door='unfinished';}
    this.ending=ending;this.stage='curtain';this.elapsed=0;this.curtainClock=0;this.cue=null;this.transfer('none','curtain');this.bodySource='curtain';this.shadowSource='curtain';
    this.event('ending',{ending,memory:copy(this.memory)});
  }
  performCurtain(dt:number){
    this.curtainClock+=dt;
    if(this.ending==='exit'){
      if(this.memory.reunion==='reunited'){
        if(dist(this.body,this.shadow)<.3){this.shadowAttachment=Math.min(1,this.shadowAttachment+dt/.85);}
        this.follow(this.body,DEPARTURE_MARK,dt,1.1);this.follow(this.shadow,this.body,dt,2.7);
      }else{
        this.follow(this.body,DEPARTURE_MARK,dt,1.1);this.follow(this.shadow,{x:this.body.x-.55,z:this.body.z+.8},dt,2.0);
      }
      if(this.curtainClock>2.4)this.once('ending-fact',()=>this.say(this.memory.reunion==='alongside'?'两位走在一起，影子没有回到脚下。':'这一次，两位一起离开。','ending',25));
    }else{
      this.drive(this.body,{x:0,z:0},dt);this.drive(this.shadow,{x:0,z:0},dt);
      this.once('ending-fact',()=>this.say(this.memory.endingSource==='host'?'这场排练由主持人提前收住。':'这场排练在这里结束。','ending',25));
    }
    if(this.curtainClock>6.0&&this.speechRead()){this.stage='ended';this.event('title-reveal');}
  }
  skip(){
    if(this.stage==='curtain'||this.stage==='ended')return;this.event('host-skip',{stage:this.stage});
    // Hosts may shorten a performance, but cannot manufacture a crossing or a player choice.
    if(this.stage==='encounter'&&this.beatPhase!=='outside-invitation'){this.beginQuote();return;}
    if(this.stage==='return'||this.stage==='echo'){this.quoteStatus='skipped';this.event('quote-skipped',{reason:'host'});this.beginTeacherRelay();return;}
    this.finish('host-ended');
  }
  step(dt=1/60){
    if(this.paused||this.stage==='ended')return;dt=Math.min(dt,.1);
    this.time+=dt;this.elapsed+=dt;this.tick++;const priorLine=this.lineId;this.flushSpeech();
    const oldB=position(this.body),oldS=position(this.shadow),active=Math.hypot(this.playerInput().x,this.playerInput().z)>.1;
    this.idle=active?0:this.idle+dt;this.bodyActing=null;this.shadowActing=null;this.bodyLook=null;this.shadowLook=null;
    if(this.target==='none')this.metrics.watchSeconds+=dt;else if(active)this.metrics.inputSeconds+=dt;else this.metrics.unoperatedSeconds+=dt;
    this.updateDoor(dt);let recordedBody=false;
    if(this.innerHeld||this.outerHeld)this.fired.delete('withdrawal-active');
    if(this.stage==='arrival')this.performArrival(dt);
    else if(this.stage==='separation')this.performSeparation(dt);
    else if(this.stage==='shadow'||this.stage==='follow')this.performShadow(dt);
    else if(this.stage==='encounter'){if(this.beatPhase==='outside-invitation')this.performOutside(dt);else this.performWear(dt);}
    else if(this.stage==='return'||this.stage==='echo')recordedBody=this.performQuote(dt);
    else if(this.stage==='handoff')this.performHandoff(dt);
    else if(this.stage==='relay')this.performRelay(dt);
    else if(this.stage==='curtain')this.performCurtain(dt);
    const bodySpeed=dist(oldB,this.body)/dt,shadowSpeed=dist(oldS,this.shadow)/dt;
    if(this.stage!=='arrival'&&!this.fired.has('first-crossing')&&(isOutside(this.body)||isOutside(this.shadow))){
      this.fired.add('first-crossing');const who=isOutside(this.body)?'body':'shadow';this.memory.order=who==='body'?'body-first':'shadow-first';this.memory.orderSource='movement';
      this.event('first-crossing',{actor:who,body:position(this.body),shadow:position(this.shadow)});
    }
    if(bodySpeed>.1||shadowSpeed>.1)this.metrics.movingSeconds+=dt;
    if(!recordedBody){this.animate(this.body,this.bodyActing??(bodySpeed>.07?'walk':'idle'),dt,bodySpeed);this.lookAt(this.body,this.bodyLook,dt);}
    if(this.shadowSource==='attached'){this.shadow=copy(this.body);this.shadowAttachment=1;}
    else{this.animate(this.shadow,this.shadowActing??(shadowSpeed>.07?'walk':'idle'),dt,shadowSpeed);this.lookAt(this.shadow,this.shadowLook,dt);if(this.shadowAttachment>0)this.shadow=mixActor(this.shadow,this.body,this.shadowAttachment);}
    if(this.stage==='arrival')this.route.push(this.routePoint(this.body,this.time));
    this.flushSpeech();this.shadowRoute.push(this.routePoint(this.shadow,this.time));
    if(this.tick%2===0||(this.stage as Stage)==='ended'||priorLine!==this.lineId)this.record();
  }
  snapshot():Frame{return {t:this.time,stage:this.stage,elapsed:this.elapsed,body:copy(this.body),shadow:copy(this.shadow),shadowAttachment:this.shadowAttachment,input:{...this.input},target:this.target,bodySource:this.bodySource,shadowSource:this.shadowSource,line:this.line,lineId:this.lineId,goal:this.goal,mode:this.mode,ending:this.ending,beat:this.stageBeat(),beatPhase:this.beatPhase,actionLabel:'',cue:this.cue?{...this.cue}:null,doorOpen:this.doorOpen,doorSlots:0,innerHeld:this.innerHeld,outerHeld:this.outerHeld,memory:copy(this.memory),signTurn:0,...this.guidance(),actions:[]};}
  record(){this.frames.push(this.snapshot());}
  export(){return {schemaVersion:9,build:'0.9.0',assetVersion:'actor-5',mode:this.mode,duration:this.time,metrics:{...this.metrics},systemDemo:false,ending:this.ending,memory:copy(this.memory),events:this.events,frames:this.frames};}
}
export function frameAt(frames:Frame[],time:number):Frame{
  let lo=0,hi=frames.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(frames[m].t<=time)lo=m;else hi=m-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],f=b.t>a.t?clamp((time-a.t)/(b.t-a.t),0,1):0;
  return {...a,t:time,body:mixActor(a.body,b.body,f),shadow:mixActor(a.shadow,b.shadow,f),shadowAttachment:a.shadowAttachment+(b.shadowAttachment-a.shadowAttachment)*f,doorOpen:a.doorOpen+(b.doorOpen-a.doorOpen)*f,signTurn:0};
}
