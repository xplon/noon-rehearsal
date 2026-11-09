import {type Frame,type Event,frameAt} from './engine.ts';
import {Quaternion} from 'three';

export type RecordedLine={text:string;t:number;lineId:number;reason:string};
export type RecordedInstruction={text:string;t:number;response:string;evidence:string;windowStart?:number;windowEnd?:number;context?:string};
export type Clip={
  name:string;eyebrow:string;start:number;end:number;available:boolean;
  question:string;concept:string;fact:string;observations:string[];
  instructions:RecordedInstruction[];narrations:RecordedLine[];event?:Event;
  sourceWindow?:{start:number;end:number};endingWindow?:{start:number;end:number};quote?:string;
};
const actorName=(value:unknown)=>value==='body'?'身体':value==='shadow'?'影子':value==='none'?'无直接控制':'记录未注明';
const stamp=(t:number)=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:undefined;

/** Only a narration actually present in a recorded frame can be quoted as shown. */
export function recordedLines(frames:Frame[],events:Event[],start:number,end:number):RecordedLine[]{
  const displayed=new Set(frames.filter(f=>f.t>=start&&f.t<=end&&f.line).map(f=>f.lineId));
  return events.flatMap((event,lineId)=>{
    if(event.type!=='narration'||typeof event.text!=='string'||!displayed.has(lineId))return [];
    if(!frames.some(f=>f.t>=start&&f.t<=end&&f.lineId===lineId&&f.line===event.text))return [];
    return [{text:event.text,t:event.t,lineId,reason:typeof event.reason==='string'?event.reason:''}];
  });
}

export function recordedInstructions(events:Event[],start:number,end:number,relatedIds:readonly string[]=[]):RecordedInstruction[]{
  return events.filter(e=>e.type==='instruction'&&typeof e.text==='string'&&e.t<=end).flatMap(event=>{
    const response=events.find(e=>e.type==='instruction-response'&&event.id!==undefined&&e.id===event.id&&e.t>=event.t);
    const windowStart=number(response?.windowStart)??event.t,windowEnd=number(response?.windowEnd)??response?.t;
    const endedBefore=windowEnd!==undefined&&windowEnd<start;
    const linked=typeof event.id==='string'&&relatedIds.includes(event.id);
    if(endedBefore&&!linked)return [];
    const context=endedBefore?'关联指引：核对窗口在本片段之外（之前）。':windowEnd===undefined&&event.t<start?'较早发出的指引；记录未给出窗口结束或回应结论。':windowEnd!==undefined&&windowEnd>end?'核对窗口延续到本片段之后。':windowStart<start?'核对窗口从本片段之前开始。':'';
    // A window that continues beyond the displayed clip is identified, never silently truncated.
    const label=response?.response==='followed'?'记录为到达指引目标':response?.response==='alternative'?'记录到其他行动':response?.response==='unanswered'?'窗口内未记录到目标回应':'尚无回应结论';
    return [{text:String(event.text),t:event.t,response:label,evidence:typeof response?.evidence==='string'?response.evidence:'没有对应的回应证据；不能补写理由。',windowStart,windowEnd,context}];
  });
}

/** Integrate recorded inputs as left-held states between actual adjacent timestamps. */
export function inputDuration(frames:Frame[],start:number,end:number):{recordedSeconds:number;activeSeconds:number}{
  let recordedSeconds=0,activeSeconds=0;
  for(let i=0;i+1<frames.length;i++){
    const a=frames[i],b=frames[i+1];
    const seconds=Math.max(0,Math.min(end,b.t)-Math.max(start,a.t));
    recordedSeconds+=seconds;
    if(Math.hypot(a.input.x,a.input.z)>.1)activeSeconds+=seconds;
  }
  return {recordedSeconds,activeSeconds};
}
const secondsLabel=(value:number)=>value>0&&value<.1?'不足 0.1':value.toFixed(1);

function eventObservation(event:Event):string|undefined{
  if(event.type==='gate-failure')return '身体曾开门，离板后门关闭，身体来到关门前。';
  if(event.type==='separation')return '记录到身体与影子分离。';
  if(event.type==='control-transfer')return `输入对象由${actorName(event.from)}交给${actorName(event.to)}。`;
  if(event.type==='pad'&&(event.pad==='inner'||event.pad==='outer')&&typeof event.held==='boolean')return `${actorName(event.actor)}${event.held?'占住':'离开'}${event.pad==='inner'?'内侧':'外侧'}踏板。`;
  if(event.type==='quote-start')return '身体开始引用本局的旧动作；当前场景继续运行。';
  if(event.type==='quote-end')return '旧动作引用结束，身体恢复现场行动。';
  if(event.type==='quote-interrupted')return event.reason==='live-encounter'?`历史引用在源时刻 ${number(event.sourceCursor)!==undefined?stamp(Number(event.sourceCursor)):'未注明'} 中断；当前影子的实际靠近与移动使身体转而回应现场。`:'历史引用中断；记录未说明具体现场原因。';
  if(event.type==='outside-invitation')return '影子先在外庭发起行动；身体仍由当前输入控制。';
  if(event.type==='response-start'){
    const sourceStart=number(event.sourceStart),sourceEnd=number(event.sourceEnd),scale=number(event.scale);
    return event.transformation==='translated-scaled'&&scale!==undefined?`影子开始动作回应：素材来自本局 ${sourceStart!==undefined?stamp(sourceStart):'未注明'}–${sourceEnd!==undefined?stamp(sourceEnd):'未注明'}，位置重新安排，空间幅度缩放为 ${scale} 倍。`:'记录到外庭动作回应开始；源时间或改编方式未完整注明。';
  }
  if(event.type==='response-end')return event.reason==='completed'?'这段外庭改编动作回应已完成。':event.reason==='left-for-exit'?'身体向出口离开后，这段动作回应结束。':event.reason==='spatial-limit'?'可行空间的边界使这段动作回应结束。':'外庭动作回应结束，记录未说明原因。';
  if(event.type==='formation-change')return `临时站位变为${event.formation==='reunited'?'靠近重合':event.formation==='alongside'?'并行':'未注明状态'}；最终离场构图仍待实际跨线时确认。`;
  if(event.type==='quote-skipped')return `本局跳过旧动作引用${typeof event.reason==='string'?`（记录原因：${event.reason}）`:''}。`;
  if(event.type==='encounter-result'){
    const result=event.outcome==='overlapped'?'身体与影子曾靠近重合':event.outcome==='kept-apart'?'这次行动后两者保持分开':event.outcome==='body-approached'?'身体主动靠近影子':'结果未注明';
    return `第一次相遇：${result}。记录来源：${event.source==='input'||event.source==='player'?'玩家输入':event.source==='movement'?'实际运动':event.source==='system'||event.source==='actor-action'?'角色自主动作':event.source==='player-position'?'当前影子位置':String(event.source??'未注明')}。`;
  }
  if(event.type==='reunion-choice'){
    if(event.basis!=='actual-formation-at-departure-line')return '记录到构图结果事件，但没有注明双方实际跨离场线的依据。';
    return event.outcome==='reunited'?'双方实际跨过离场线时，构图为靠近重合。':event.outcome==='alongside'?'双方实际跨过离场线时，保持各自位置，并行离开。':'双方实际跨线时的构图未注明。';
  }
  if(event.type==='host-skip')return '主持人使用了跳段。该操作不算玩家完成这段行动。';
  if(event.type==='assistance'||event.type==='system-demo')return '记录到系统协助；该动作不算玩家输入。';
  if(event.type==='ending')return event.ending==='exit'?'记录到共同离场结尾。':`本局在此结束（记录：${String(event.ending??'未注明原因')}），不据此判断玩家意图。`;
  return undefined;
}

/** Four evidence slots stay visible even when a run ends before a node occurs. */
export function makeClips(frames:Frame[],events:Event[]):Clip[]{
  const duration=frames.at(-1)?.t??0;
  const first=(type:string)=>events.find(e=>e.type===type);
  const failure=first('gate-failure');
  const separation=first('separation');
  const shadowControl=events.find(e=>e.type==='control-transfer'&&e.to==='shadow');
  const quote=first('quote-start'),quoteEnd=quote?events.find(e=>(e.type==='quote-end'||e.type==='quote-interrupted')&&e.t>=quote.t):undefined;
  const quoteSkipped=first('quote-skipped'),encounter=first('encounter-result'),selection=first('quote-selected');
  const outside=first('outside-invitation'),response=first('response-start');
  const responseEnd=response?events.find(e=>e.type==='response-end'&&e.t>=response.t):undefined;
  const reunion=events.find(e=>e.type==='reunion-choice'&&e.basis==='actual-formation-at-departure-line');
  const ending=first('ending'),departure=reunion??events.find(e=>e.type==='ending'&&e.ending==='exit');
  const create=(name:string,eyebrow:string,event:Event|undefined,question:string,concept:string,fact:string,endEvent?:Event,window?:{start:number;end:number}):Clip=>{
    const available=Boolean(event&&frames.length&&event.t<=duration);
    const start=available?Math.max(0,window?.start??event!.t-3):0,end=available?Math.min(duration,window?.end??Math.min(start+18,Math.max(event!.t+7,(endEvent?.t??event!.t)+2))):0;
    const windowFrames=frames.filter(f=>f.t>=start&&f.t<=end);
    const observations=available?events.filter(e=>e.t>=start&&e.t<=end).flatMap(e=>{const text=eventObservation(e);return text?[`${stamp(e.t)} · ${text}`]:[];}):[];
    if(available&&windowFrames.length){
      const input=inputDuration(frames,start,end);
      observations.push(input.recordedSeconds===0?'本片段缺少可计算时间间隔的相邻记录，无法统计输入时长。':input.activeSeconds>0?`本片段可核对 ${secondsLabel(input.recordedSeconds)} 秒，其中约 ${secondsLabel(input.activeSeconds)} 秒有方向输入；输入不等于角色一定移动。`:`本片段可核对 ${secondsLabel(input.recordedSeconds)} 秒，这些时间内没有方向输入。记录不能区分等待、观看或其他原因。`);
      const labels=windowFrames.filter((f,i)=>i===0||f.target!==windowFrames[i-1].target).map(f=>actorName(f.target));
      observations.push(`片段中的输入对象：${labels.join(' → ')}。`);
    }
    const narrations=available?recordedLines(frames,events,start,end):[];
    return {name,eyebrow,start,end,available,question,concept,fact:available?fact:'本局未记录该节点的真实片段。没有发生的行动不补演，未完成也不等于拒绝。',observations,instructions:available?recordedInstructions(events,start,end):[],narrations,event:available?event:undefined,quote:narrations[0]?.text};
  };
  // Use the actual most recent press/release cycle that led to this failure.
  const release=failure?[...events].reverse().find(e=>e.t<=failure.t&&(e.type==='pad'&&e.pad==='inner'&&e.actor==='body'&&e.held===false||e.type==='first-release'&&e.actor==='body')):undefined;
  const press=release?[...events].reverse().find(e=>e.t<=release.t&&(e.type==='pad'&&e.pad==='inner'&&e.actor==='body'&&e.held===true||e.type==='first-plate'&&e.actor==='body')):undefined;
  const firstWindow=failure?{start:Math.max(0,(press?.t??failure.t-2.5)-.5),end:separation?separation.t+.5:failure.t+3}:undefined;
  const secondAnchor=separation??shadowControl;
  const secondWindow=secondAnchor?{start:Math.max(0,secondAnchor.t-.5),end:shadowControl?shadowControl.t+1.2:duration}:undefined;
  if(secondWindow){
    // Keep the actual displayed end of lines present during the separation and
    // handoff. Do not pull in queued lines or infer a new narration scope.
    const lineIds=new Set(frames.filter(f=>f.t>=secondWindow.start&&f.t<=(shadowControl?.t??secondWindow.end)&&f.line&&events[f.lineId]?.type==='narration'&&events[f.lineId]?.text===f.line).map(f=>f.lineId));
    for(let i=0;i<frames.length;i++)if(lineIds.has(frames[i].lineId)&&frames[i].line){
      secondWindow.end=Math.max(secondWindow.end,frames[Math.min(i+1,frames.length-1)].t);
    }
  }
  const firstClip=create('第一次试门','01 / 具体行动',failure,
    '当时你先看到了什么，又试了什么？这与旁白的说法相同吗？',
    '具身性：身体感觉、动作与空间共同参与经验。输入、门的变化和玩家自述可以放在一起核对。',
    '记录到开门、离板后关门与身体来到关门前。这里只描述这次动作，不能推断尝试的动机。',undefined,firstWindow);
  const secondClip=create('影子与交接','02 / 操作与观看',separation??shadowControl,
    '哪一刻你发现方向输入换了对象？从操作身体到看身体行动，有什么变化？',
    '审美距离：投入行动时仍能意识到自己在观看作品。换控是否带来这种变化，需要当事人描述。',
    separation&&shadowControl?'本局记录了影子分离与输入转交影子；两件事的时刻分别保留。':'本局只记录了分离或交接中的一项，不能把另一项补写为已发生。',shadowControl,secondWindow);
  const thirdClip=create('旧动作与主动性','03 / 本局旧动作',quote??quoteSkipped??encounter,
    '如果播放了旧动作，你认出来了吗？身体尝试靠近或重复旧动作时，当前影子做了什么？',
    '反身性：审视自己的预设、位置与行动。引用让创作者与玩家回看同一动作在不同处境中的作用；是否认出需要自述。',
    quote?'身体引用本局的一段连续旧动作；当前影子的输入、踏板与门仍按现场状态运行。':quoteSkipped?`本局没有播放旧动作引用${typeof quoteSkipped.reason==='string'?`，记录原因为「${quoteSkipped.reason}」`:''}。之后的现场动作不能称作历史复演。`:'本局记录到身体与影子的一次靠近或分开；这段是当时的现场动作，没有可核对的历史引用。',quoteEnd);
  if(thirdClip.available&&encounter&&(encounter.t<thirdClip.start||encounter.t>thirdClip.end)){
    thirdClip.observations.push(`本局关联事件（本片段之外）${stamp(encounter.t)} · ${eventObservation(encounter)}`);
    thirdClip.instructions=recordedInstructions(events,thirdClip.start,thirdClip.end,['come-close']);
  }
  const sourceStart=number(quote?.sourceStart),sourceEnd=number(quote?.sourceEnd);
  if(thirdClip.available&&sourceStart!==undefined&&sourceEnd!==undefined&&sourceStart>=0&&sourceEnd>sourceStart&&sourceEnd<=duration&&sourceEnd<=quote!.t&&frames.filter(f=>f.t>=sourceStart&&f.t<=sourceEnd).length>=2){
    thirdClip.sourceWindow={start:sourceStart,end:sourceEnd};
    thirdClip.observations.unshift(`引用源片段：本局 ${stamp(sourceStart)}–${stamp(sourceEnd)}；引用发生于 ${stamp(quote!.t)}。`);
    if(typeof selection?.selection==='string'&&selection.selection.startsWith('continuous-tail')){
      thirdClip.observations.push('本局引用选取连续尾段，没有展示完整的首次上板过程。');
      if(frames.find(f=>f.t>=sourceStart)?.innerHeld)thirdClip.observations.push('源片段起始帧已记录内侧踏板被占住。');
    }
    if(number(quote?.edgeRamp))thirdClip.observations.push('引用的首尾经过平滑过渡；中段保留源片段时序。');
  }else if(quote&&thirdClip.available){
    thirdClip.fact='记录到引用开始，但源片段起止信息不完整，无法在此核对原片段。';
  }
  if(thirdClip.available&&quoteEnd?.type==='quote-interrupted')thirdClip.fact+=' 历史引用在现场相遇时中断，身体随后回应当前行动；这不说明玩家拒绝了引用。';
  const fourthClip=create('外庭回应与离场','04 / 当前行动与改编',response??outside??departure,
    '影子先做了什么？你随后的动作怎样进入它的回应？哪些来自本局素材，哪些经过创作者改编？',
    '投射中的联想由当事人说明。可以分析本局动作与指引的关系，不把一次靠近、离开或回应归为稳定性格。',
    response?'影子的外庭回应使用本局真实动作素材；源位置重新安排，动作空间幅度经过缩放。请核对源时间、改编比例与回应结束原因。':outside?'记录到影子在外庭先发起行动；本局没有动作回应开始事件，不补写一段改编回应。':'本局没有外庭发起或动作回应片段；这里只回看实际离场，最终构图按双方跨过离场线时的状态判断。',responseEnd??ending);
  if(fourthClip.available&&outside&&outside.t<fourthClip.start)fourthClip.observations.push(`外庭发起（本片段之前）${stamp(outside.t)} · ${eventObservation(outside)}`);
  if(fourthClip.available&&response){
    const start=number(response.sourceStart),end=number(response.sourceEnd),scale=number(response.scale);
    if(start===undefined||end===undefined||start<0||end<=start||end>response.t||response.transformation!=='translated-scaled'||scale===undefined||scale<=0||frames.filter(f=>f.t>=start&&f.t<=end).length<2){
      fourthClip.fact='记录到外庭动作回应开始，但源时间、记录帧或空间改编信息不完整，无法完整核对这段素材。';
    }
  }
  if(fourthClip.available&&ending&&ending.t>fourthClip.end&&ending.t<=duration){
    fourthClip.endingWindow={start:Math.max(0,ending.t-7),end:Math.min(duration,ending.t+5)};
    fourthClip.observations.push(`本局结尾（另段可播放）${stamp(ending.t)} · ${eventObservation(ending)}`);
    if(reunion&&reunion.t<=ending.t)fourthClip.observations.push(`结尾关联事件 ${stamp(reunion.t)} · ${eventObservation(reunion)}`);
  }
  return [firstClip,secondClip,thirdClip,fourthClip];
}
export function replayFrame(frames:Frame[],t:number):Frame{
  const f=frameAt(frames,t);
  let lo=0,hi=frames.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].t<=t)lo=mid;else hi=mid-1;}
  const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],blend=b.t>a.t?Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t))):0;
  if(a.visual&&b.visual){
    const interpolate=(left:Float32Array,right:Float32Array)=>{
      if(left.length!==right.length)return left;
      const out=left.map((v,i)=>v+(right[i]-v)*blend);const qa=new Quaternion(),qb=new Quaternion();
      for(let j=0;j<left.length;j+=10){qa.fromArray(left,j+3);qb.fromArray(right,j+3);qa.slerp(qb,blend).toArray(out,j+3);}
      return out;
    };
    f.visual={body:interpolate(a.visual.body,b.visual.body),shadow:interpolate(a.visual.shadow,b.visual.shadow)};
  }
  return f;
}
