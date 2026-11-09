import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,actor,dist,routeAt} from '../src/engine.ts';
import {MOTION} from '../src/motion.ts';
import {INNER_PAD,OUTER_PAD,OUTSIDE_MARK,FRONT_MARK,DEPARTURE_MARK,GATE,PAD_RADIUS,isOutside} from '../src/space.ts';
import {simulate,toward} from './story-helpers.mjs';
import {makeClips,recordedLines} from '../src/replay.ts';

const DT=1/60;
const zero=()=>({x:0,z:0});
function run(g,seconds,input=zero,stop=()=>false){
  for(let i=0;i<Math.ceil(seconds/DT)&&g.stage!=='ended'&&!stop(g);i++){
    const p=input(g,i);g.setInput(p.x,p.z);g.step(DT);
  }
  return g;
}
function until(g,predicate,seconds,input=zero,label='expected state'){
  run(g,seconds,input,predicate);
  assert(predicate(g),`${label}; got ${g.stage}/${g.beatPhase} at ${g.time.toFixed(2)} s`);
}
const steer=(who,target)=>(g)=>g.awaitFreshInput?zero():toward(g[who],target,g.doorOpen);
function independent(mode='teacher',body=INNER_PAD,shadow=OUTSIDE_MARK){
  const g=new Game(mode);g.body=actor(body);g.shadow=actor(shadow);g.shadowAttachment=0;
  g.target='shadow';g.bodySource='autonomous';g.shadowSource='input';g.awaitFreshInput=false;
  return g;
}
function teacherRelay(first='shadow',body=INNER_PAD,shadow=OUTSIDE_MARK){
  const g=independent('teacher',body,shadow);g.stage='relay';g.elapsed=0;g.phaseAt=0;
  g.setOrder(first,'test-fixture');g.memory.door='in-progress';g.quoteStatus='done';return g;
}
function outside(body={x:5.5,z:1.5},shadow={x:5.6,z:1.5}){
  const g=independent('teacher',body,shadow);g.stage='relay';g.beginOutside();g.setInput(0,0);return g;
}
const completed=new Map();
function completedRun(mode,path){
  const key=mode+'/'+path;if(!completed.has(key))completed.set(key,simulate(mode,path));
  return completed.get(key);
}
function assertNoInventedChoice(g){
  assert.notEqual(g.memory.door,'declined');assert.notEqual(g.ending,'stillness');
  assert.notEqual(g.memory.endingSource,'system-budget');
  assert(!g.events.some(e=>e.type==='rehearsal-choice'||e.type==='relay-choice'||e.type==='interaction'));
}

for(const [mode,path] of [['student','body-first'],['student','continuous'],['teacher','body-first'],['teacher','shadow-first']]){
  test(`${mode}/${path}: movement completes the real gate without narrative menus`,()=>{
    const {game:g,maxJump}=completedRun(mode,path);
    assert.equal(g.stage,'ended',`${g.stage}/${g.beatPhase}`);assert.equal(g.ending,'exit');
    assert.equal(g.memory.door,'passed-together');assert(isOutside(g.body)&&isOutside(g.shadow));
    assert.equal(g.events.filter(e=>e.type==='ending').length,1);
    assert.equal(g.events.filter(e=>e.type==='both-crossed').length,1);
    assert.equal(g.events.filter(e=>e.type==='title-reveal').length,1);
    assert(g.frames.every(f=>f.actions.length===0));assert.deepEqual(g.actions(),[]);
    assertNoInventedChoice(g);assert(maxJump<.06,`one-frame displacement ${maxJump}`);
    const failure=g.events.find(e=>e.type==='gate-failure');
    const separated=g.events.find(e=>e.type==='separation');
    const control=g.events.find(e=>e.type==='control-transfer'&&e.to==='shadow');
    const crossing=g.events.find(e=>e.type==='both-crossed');
    assert(failure&&separated&&control&&crossing);
    assert(failure.t<=separated.t&&separated.t<control.t&&control.t<crossing.t);
    assert(isOutside(crossing.body)&&isOutside(crossing.shadow));
    if(mode==='teacher'){
      assert.equal(g.memory.order,path);assert.equal(g.memory.orderSource,'movement');
      assert(crossing.body.x>10.4&&crossing.shadow.x>10.4,'teacher must reach the actual departure line');
    }
  });
}

test('silence leaves both versions available to play; it does not select refusal or auto-end',()=>{
  for(const mode of ['student','teacher']){
    const g=new Game(mode);const body={...g.body};run(g,70);
    assert.equal(g.stage,'arrival');assert.equal(g.ending,'');assert(dist(body,g.body)<1e-8);
    assertNoInventedChoice(g);assert(!g.events.some(e=>e.type==='ending'||e.type==='both-crossed'));
  }
});

test('obsolete narrative action names are inert, including while paused',()=>{
  const g=teacherRelay();const before=JSON.stringify(g.snapshot());
  for(const id of ['stay','body-first','shadow-first','rehearse','skip-rehearsal','continue'])g.choose(id);
  assert.equal(JSON.stringify(g.snapshot()),before);
  g.pause();const paused=JSON.stringify(g.snapshot());g.choose('stay');g.interact('body-first');run(g,2);
  assert.equal(JSON.stringify(g.snapshot()),paused);
});

test('a teacher outside the door must settle on the outer plate before body input transfers',()=>{
  const g=teacherRelay();run(g,2);
  assert.equal(g.target,'shadow');assert(!g.events.some(e=>e.type==='relay-handoff'));
  until(g,q=>q.stage==='handoff',12,steer('shadow',OUTER_PAD),'outer plate handoff');
  assert(dist(g.shadow,OUTER_PAD)<PAD_RADIUS);assert(Math.hypot(g.shadow.vx,g.shadow.vz)<.25);
  assert(g.outerDwell>.3);assert(g.padOwners.outer.includes('shadow'));
  const handoff=g.events.find(e=>e.type==='relay-handoff');assert.equal(handoff.holder,'shadow');
  until(g,q=>q.target==='body',3,zero,'body input after handoff');
  assert.equal(g.shadowAttachment,0);assert.notEqual(g.shadowSource,'attached');
});

test('passing through the outer plate at speed does not count as standing there',()=>{
  const g=teacherRelay('shadow',INNER_PAD,{x:OUTER_PAD.x-.36,z:OUTER_PAD.z});
  Object.assign(g.shadow,{yaw:Math.PI/2,travelYaw:Math.PI/2,vx:1.8,vz:0});
  run(g,.65,()=>({x:1,z:0}));
  assert(!g.events.some(e=>e.type==='relay-handoff'),'moving across a plate must not trigger handoff');
  assert.equal(g.target,'shadow');
});

test('withdrawing and restoring the inner plate pauses and resumes the same body-first crossing',()=>{
  const g=teacherRelay('body',{x:-2.8,z:-.9},INNER_PAD);run(g,.9);
  assert(g.doorOpen>.9);assert(!isOutside(g.body));
  run(g,1.05,()=>({x:0,z:1}));run(g,1.0);
  assert(!g.innerHeld);assert(g.doorOpen<.2);assert(!isOutside(g.body));
  assert.equal(g.memory.door,'in-progress');assert.equal(g.relayFirst,'body');
  until(g,q=>q.padOwners.outer.includes('body'),14,steer('shadow',INNER_PAD),'body reaches outer plate after restoration');
  assert(isOutside(g.body));assert(g.doorOpen>.8);
  assert.equal(g.events.filter(e=>e.type==='relay-order').length,1,'restoration must not restart the scene');
});

test('taking over the inner plate after the initial teacher branch can still change who goes first',()=>{
  const g=teacherRelay('shadow',INNER_PAD,{x:-3.0,z:.7});run(g,1);
  assert.equal(g.relayFirst,'shadow');
  until(g,q=>q.relayFirst==='body',8,steer('shadow',INNER_PAD),'late inner plate takeover');
  const order=g.events.filter(e=>e.type==='relay-order').at(-1);
  assert.equal(order.reason,'shadow-took-over-inner-plate');assert.equal(order.source,'movement');
});

test('the teacher body-first route accepts a shadow that has already walked far outside',()=>{
  const g=teacherRelay('body',OUTER_PAD,{x:8.0,z:-.9});run(g,.6);
  assert(g.stage==='handoff'||g.outsideStarted,'no hidden 2.6 m return-to-partner requirement');
  until(g,q=>q.outsideStarted&&q.target==='body',3,zero,'body input in outer courtyard');
});

test('a stationary shadow 0.41 m away cannot deadlock the autonomous wear approach',()=>{
  const g=independent('teacher',{x:0,z:2},{x:.41,z:2});
  g.stage='encounter';g.beatPhase='body-approaches';g.bodyAwaitingLead=true;
  until(g,q=>q.beatPhase!=='body-approaches',3,zero,'wear approach finishes without input');
  assert.equal(g.memory.encounter,'body-approached');
  const response=g.events.find(e=>e.type==='instruction-response'&&e.id==='come-close');
  assert.equal(response.response,'unanswered');assert.match(response.evidence,/身体自主/);
  assert(!g.events.some(e=>e.type==='ending'));
});

test('nearby actors with no input do not turn a provisional reunion into an automatic exit',()=>{
  const g=outside();g.outsidePhase='walking';g.formation='reunited';
  run(g,12);assert.equal(g.stage,'encounter');assert.equal(g.target,'body');assert.equal(g.ending,'');
  assert(!g.events.some(e=>e.type==='reunion-choice'||e.type==='both-crossed'));
});

test('an autonomous shadow approaching a stopped body is not reported as player approach',()=>{
  const g=outside({x:6.3,z:2.1},{x:5,z:1.5});g.outsideInputDistance=.6;g.responseDone=true;
  const initial={...g.body};run(g,10);
  assert(dist(initial,g.body)<1e-8);assert.equal(g.stage,'encounter');assert.equal(g.target,'body');
  assert(!g.events.some(e=>e.type==='formation-change'&&String(e.reason).includes('body-approached')));
  assert(!g.events.some(e=>e.type==='instruction-response'&&e.id==='leave-together'));
  assert(!g.events.some(e=>e.type==='reunion-choice'||e.type==='ending'));
});

test('returning into the inner courtyard makes the outer companion hold the door again',()=>{
  const g=outside({x:2.50,z:GATE.z},{x:5.5,z:1.5});g.doorOpen=1;
  g.outsidePhase='walking';g.formation='alongside';g.body.yaw=-Math.PI/2;g.body.travelYaw=-Math.PI/2;g.body.vx=-.6;
  until(g,q=>q.body.x<1.4,6,steer('body',FRONT_MARK),'body returns through the open gate');
  run(g,7);assert(g.outsideReturning);assert(g.padOwners.outer.includes('shadow'));assert(g.doorOpen>.9);
  assert.equal(g.stage,'encounter');assert.equal(g.ending,'');
  until(g,q=>isOutside(q.body),8,steer('body',OUTER_PAD),'body can leave again');
});

test('teacher completion records the final formation only beyond the actual departure line',()=>{
  const g=outside({x:8.6,z:-1.0},{x:8.05,z:-.2});g.outsidePhase='walking';g.formation='alongside';
  run(g,3);assert.equal(g.ending,'');assert(!g.events.some(e=>e.type==='reunion-choice'));
  until(g,q=>q.stage==='curtain',16,steer('body',DEPARTURE_MARK),'both actors enter the departure passage');
  const event=g.events.find(e=>e.type==='reunion-choice');assert(event);
  assert(event.body.x>10.4&&event.shadow.x>10.4);
  assert.equal(event.basis,'actual-formation-at-departure-line');
  assert.equal(g.events.filter(e=>e.type==='reunion-choice').length,1);
});

test('each teacher quote has a real source interval, an explicit interruption, or an honest skip',()=>{
  for(const path of ['body-first','shadow-first']){
    const g=completedRun('teacher',path).game;
    const start=g.events.find(e=>e.type==='quote-start'),skip=g.events.find(e=>e.type==='quote-skipped');
    assert(start||skip,'the historical node cannot silently disappear');
    if(skip){assert.equal(typeof skip.reason,'string');assert(skip.reason.length>0);}
    if(!start)continue;
    const selection=g.events.find(e=>e.type==='quote-selected');assert(selection);
    assert(start.sourceStart>=0&&start.sourceEnd>start.sourceStart&&start.sourceEnd<start.t);
    assert(start.sourceEnd<=g.latestLeaveAt+.16+DT,'no later collision may be included after the selected release');
    assert.equal(typeof selection.selection,'string');assert(selection.selection.length>0);
    assert.match(String(start.retiming),/eased temporal edges/,'modified timing must be disclosed');
    for(const p of g.route){
      const source=routeAt(g.quoteSource,p.t+g.quoteStart);
      assert(dist(p,source)<1e-8);assert(Math.abs(p.yaw-source.yaw)<1e-8);
    }
    assert(g.events.some(e=>['quote-end','quote-interrupted','quote-skipped'].includes(e.type)&&e.t>=start.t));
  }
});

test('an absent quote source is skipped rather than replaced with a fabricated route',()=>{
  const g=independent();g.quoteSource=[];g.beginQuote();
  assert.equal(g.quoteStatus,'skipped');assert.equal(g.stage,'relay');
  assert(g.events.some(e=>e.type==='quote-skipped'&&e.reason));
  assert(!g.events.some(e=>e.type==='quote-start'));assert.equal(g.memory.rehearsal,'unavailable');
});

// A synthetic source isolates live door physics. It is fixture data, not a claimed user recording.
function quotePhysicsFixture(){
  const g=independent('teacher',{x:-4.3,z:.7},OUTER_PAD);g.stage='echo';g.beatPhase='quote';
  g.quoteStatus='playing';g.quoteClock=0;g.quoteStart=0;g.echoWindow=4;g.quoteDuration=4.65;
  g.quotePose=actor(g.body);g.echoOffset={x:0,z:0};g.time=10;
  g.route=Array.from({length:241},(_,i)=>{
    const t=i*DT,x=t<2.5?-4.3+t:t<3?-1.8:-1.8+(t-3);
    const p=actor({x,z:.7});p.yaw=Math.PI/2;p.travelYaw=Math.PI/2;return {...p,t};
  });
  return g;
}

test('a current shadow opens and releases the live door while the historical body is away from the plate',()=>{
  const g=quotePhysicsFixture();run(g,.45);
  assert.equal(g.quoteStatus,'playing');assert(g.padOwners.outer.includes('shadow'));assert(g.doorOpen>.6);
  assert(dist(g.body,INNER_PAD)>1.5);
  run(g,1.1,()=>({x:0,z:1}));
  assert.equal(g.quoteStatus,'playing');assert(!g.outerHeld&&!g.innerHeld);assert(g.doorOpen<.3);
});

test('standing near a quote is not an interruption unless current shadow input approaches the body',()=>{
  const g=quotePhysicsFixture();g.shadow=actor({x:g.body.x,z:g.body.z+.3});run(g,.4);
  assert.equal(g.quoteStatus,'playing');assert(!g.events.some(e=>e.type==='quote-interrupted'));
});

test('current shadow approach can interrupt a quote without claiming that the whole source completed',()=>{
  const g=quotePhysicsFixture();g.shadow=actor({x:-4.3,z:1.45});g.shadow.yaw=Math.PI;g.shadow.travelYaw=Math.PI;
  until(g,q=>q.quoteStatus==='interrupted',2,q=>toward(q.shadow,q.body,q.doorOpen),'live approach interrupts quote');
  const event=g.events.find(e=>e.type==='quote-interrupted');assert(event);
  assert.equal(event.reason,'live-encounter');assert(event.sourceCursor>=g.quoteStart&&event.sourceCursor<=g.quoteStart+g.echoWindow);
  assert(!g.events.some(e=>e.type==='quote-end'));assert.equal(g.stage,'relay');
});

test('a long first hold selects an honestly labelled continuous tail without compressing its pause',()=>{
  const g=independent('teacher',{x:-1.3,z:.7},OUTSIDE_MARK);g.time=30;
  g.firstPadAt=1;g.firstLeaveAt=20.6;
  g.quoteSource=Array.from({length:1321},(_,i)=>{
    const t=i*DT,x=t<1?-2.8+t:t<=20?-1.8:-1.8+(t-20)*.8;
    return {...actor({x,z:.7}),t};
  });
  g.beginQuote();assert.notEqual(g.quoteStatus,'skipped');
  const selected=g.events.find(e=>e.type==='quote-selected');assert(selected);
  assert.match(selected.selection,/tail.*long/);assert(selected.sourceStart>g.firstPadAt);
  assert(selected.sourceEnd-selected.sourceStart<=4+DT);
  const a=routeAt(g.route,17-g.quoteStart),b=routeAt(g.route,19-g.quoteStart);
  assert(dist(a,b)<1e-8,'the two seconds of recorded stillness must remain in the source interval');
  for(const p of g.route)assert(dist(p,routeAt(g.quoteSource,p.t+g.quoteStart))<1e-8);
});

test('the exterior response identifies its translated/scaled source while the current body stays controllable',()=>{
  const g=outside({x:5.5,z:.3},{x:6.3,z:2.1});g.body.yaw=Math.PI;g.body.travelYaw=Math.PI;
  run(g,1.05,()=>({x:0,z:-1}));
  until(g,q=>q.events.some(e=>e.type==='response-start'),5,zero,'exterior action response starts');
  const event=g.events.find(e=>e.type==='response-start');assert.equal(event.transformation,'translated-scaled');assert.equal(event.scale,.7);
  assert(event.sourceStart>=0&&event.sourceEnd>event.sourceStart&&event.sourceEnd<event.t);
  const source=g.outsideRoute.filter(p=>p.t>=event.sourceStart-DT/10&&p.t<=event.sourceEnd+DT/10);
  assert.equal(source.length,g.responseRoute.length);
  const origin=g.responseRoute[0],first=source[0];
  for(let i=0;i<source.length;i++){
    assert(Math.abs(g.responseRoute[i].x-origin.x-(source[i].x-first.x)*.7)<1e-8);
    assert(Math.abs(g.responseRoute[i].z-origin.z-(source[i].z-first.z)*.7)<1e-8);
    assert(Math.abs(g.responseRoute[i].t-(source[i].t-first.t))<1e-8);
  }
  const before={...g.body};run(g,.5,()=>({x:1,z:0}));
  assert.equal(g.target,'body');assert(dist(before,g.body)>.03,'the live body must respond during the shadow response');
  assert(!g.events.some(e=>e.type==='control-transfer'&&e.to==='none'&&e.t>=event.t));
  until(g,q=>q.events.some(e=>e.type==='response-end'),8,zero,'exterior response finishes');
  assert.equal(g.events.filter(e=>e.type==='response-start').length,1);
});

test('walking toward the exit can cancel response preparation before playback',()=>{
  const g=outside({x:7.95,z:-.9},{x:6.3,z:2.1});g.time=3;g.phaseAt=3;
  g.responsePreparing=true;g.responseDuration=2;g.responseSource={start:0,end:2};
  g.responseRoute=[{x:6.3,z:2.1,t:0},{x:6.6,z:2.1,t:2}];g.outsideInputDistance=.7;
  g.body.yaw=Math.PI/2;g.body.travelYaw=Math.PI/2;g.body.vx=1.65;
  until(g,q=>q.outsidePhase==='walking',4,()=>({x:1,z:0}),'current movement can bypass response preparation');
  const event=g.events.find(e=>e.type==='response-end'&&e.reason==='left-for-exit');assert(event);
  assert(!g.events.some(e=>e.type==='response-start'),'walking past the exit threshold during preparation must bypass playback');
  assert.equal(g.target,'body');assert.equal(g.responsePreparing,false);
});

test('host termination never manufactures successful crossing or a player refusal',()=>{
  for(const mode of ['student','teacher']){
    const g=new Game(mode);run(g,.3,()=>({x:1,z:0}));g.skip();run(g,15);
    assert.equal(g.stage,'ended');assert.equal(g.ending,'host-ended');assert.equal(g.memory.endingSource,'host');
    assert.equal(g.memory.door,'unfinished');assert(!g.events.some(e=>e.type==='both-crossed'||e.type==='reunion-choice'));
    assertNoInventedChoice(g);
  }
  const q=quotePhysicsFixture();q.skip();assert.equal(q.quoteStatus,'skipped');
  assert(q.events.some(e=>e.type==='quote-skipped'&&e.reason==='host'));
  assert(!q.events.some(e=>e.type==='quote-end'||e.type==='both-crossed'));
});

test('four replay slots use recorded facts and only quote lines actually displayed',()=>{
  const g=completedRun('teacher','shadow-first').game;const clips=makeClips(g.frames,g.events);
  assert.equal(clips.length,4);assert(clips.every(c=>c.available));
  for(const clip of clips){
    for(const line of clip.narrations){
      assert(g.frames.some(f=>f.t>=clip.start&&f.t<=clip.end&&f.lineId===line.lineId&&f.line===line.text));
    }
  }
  const incomplete=new Game('teacher');incomplete.skip();run(incomplete,12);
  const slots=makeClips(incomplete.frames,incomplete.events);assert.equal(slots.length,4);
  assert(slots.some(c=>!c.available));assert(slots.filter(c=>!c.available).every(c=>c.narrations.length===0));
});

test('the opening discovery line survives into displayed handoff frames',()=>{
  const g=completedRun('student','body-first').game;
  const lines=recordedLines(g.frames,g.events,0,g.time);
  assert(lines.some(line=>line.text.includes('还开着')),'the discovery must not be cleared in the same transition tick');
});

test('successful paths preserve finite normalized poses, bounded turns and frame-to-frame motion',()=>{
  for(const [mode,path] of [['student','continuous'],['teacher','body-first'],['teacher','shadow-first']]){
    const {game:g,maxJump}=completedRun(mode,path);assert(maxJump<.06,`${mode}/${path} displacement ${maxJump}`);
    for(let i=1;i<g.frames.length;i++){
      const a=g.frames[i-1],b=g.frames[i],dt=b.t-a.t;if(dt<=0)continue;
      for(const who of ['body','shadow']){
        const actorBefore=a[who],actorNow=b[who];
        for(const key of ['x','z','vx','vz','yaw','gaitPhase'])assert(Number.isFinite(actorNow[key]),`${who}.${key}`);
        const values=Object.values(actorNow.weights);assert(values.every(Number.isFinite));
        assert(Math.abs(values.reduce((sum,v)=>sum+v,0)-1)<1e-6,`${who} pose weights at ${b.t}`);
        assert(values.every(v=>v>=-1e-6&&v<=1+1e-6));
        assert(dist(actorBefore,actorNow)<=3.2*dt+.006,`${mode}/${path} ${who} position discontinuity at ${b.t}`);
        const turn=Math.abs(Math.atan2(Math.sin(actorNow.yaw-actorBefore.yaw),Math.cos(actorNow.yaw-actorBefore.yaw)));
        assert(turn<=MOTION.turnSpeed*dt+.025,`${mode}/${path} ${who} heading discontinuity at ${b.t}`);
        for(const name of Object.keys(actorNow.weights))assert(Math.abs(actorNow.weights[name]-actorBefore.weights[name])<=8.5*dt+.025,`${mode}/${path} ${who}.${name} pose discontinuity at ${b.t}`);
      }
    }
  }
});


test('the quote uses the most recent attempt, not an incidental first plate brush',()=>{
  const g=independent('teacher',{x:-1.3,z:.7},OUTSIDE_MARK);g.time=30;
  g.firstPadAt=1;g.firstLeaveAt=2;g.latestPadAt=20;g.latestLeaveAt=22;
  g.quoteSource=Array.from({length:1441},(_,i)=>({...actor({x:-2.8+Math.sin(i*DT)*.8,z:.7}),t:i*DT}));
  g.beginQuote();const selection=g.events.find(e=>e.type==='quote-selected');assert(selection);
  assert(selection.sourceStart>=18.16-DT);assert(selection.sourceEnd<=22.16+DT);
  assert.equal(selection.platePress,20);assert.equal(selection.plateRelease,22);
});

test('the observed open-door reaction remains readable after control handoff',()=>{
  const g=independent('student',{x:-.8,z:1.7},INNER_PAD);g.stage='shadow';g.doorOpen=1;g.innerDwell=1;g.padOwners.inner='shadow';g.endLine();g.speechQueue=[];
  g.startHandoff('body','body-first');g.say('身体：……还开着。','shadow-keeps-door',3.5);
  run(g,1.1);assert.equal(g.stage,'relay');assert.match(g.line,/还开着/);
  const event=g.events.find(e=>e.type==='narration'&&e.reason==='shadow-keeps-door');
  assert(!g.events.some(e=>e.type==='narration-end'&&e.lineId===g.events.indexOf(event)&&e.duration<event.minimum));
});
