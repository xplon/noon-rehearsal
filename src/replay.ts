import {type Frame,type Event,frameAt} from './engine.ts';
import {Quaternion} from 'three';
export type Clip={name:string;eyebrow:string;start:number;end:number;question:string;fact:string;event?:Event;quote?:string};
export function makeClips(frames:Frame[],events:Event[]):Clip[]{
  const duration=frames.at(-1)?.t||0;
  const stage=(name:string)=>events.find(e=>e.type==='stage'&&e.stage===name)?.t;
  const clip=(name:string,eyebrow:string,time:number,question:string,fact:string,event?:Event):Clip=>({name,eyebrow,start:Math.max(0,time-2),end:Math.min(duration,time+10),question,fact,event});
  const target=events.find(e=>e.type==='target-entered');
  const first=clip('第一条指令','01 / 行动',target?.t??Math.min(12,duration/3),'你当时想做什么？程序实际知道多少？',target?'记录到身体进入门前区域；无法据此判断动机。':'这一局没有记录到进入门前区域。未完成不等于拒绝。',target);
  const echo=events.find(e=>e.type==='echo-playback-start');
  const demo=events.some(e=>e.type==='system-demo');
  const handoff=events.find(e=>e.type==='relay-handoff');
  const choice=handoff?[...events].reverse().find(e=>e.type==='relay-choice'&&e.t<=handoff.t):events.find(e=>e.type==='relay-choice');
  const ending=events.find(e=>e.type==='ending');
  const closeChoice=[...events].reverse().find(e=>e.type==='interaction'&&['stay','end-unfinished'].includes(String(e.action)));
  const chosen=choice?.source==='player'?(choice.order==='body-first'?'你选择身体先过。':'你选择影子先过。'):choice?'没有明确先后选择；影子留门是系统示范。':closeChoice?'':'没有记录到先后选择。';
  const result=handoff?(handoff.holder==='body'?'身体随后在门外踩住踏板，接过留门的位置。':'影子随后在门外踩住踏板，接过留门的位置。'):ending?.memory&&((ending.memory as Record<string,string>).door==='declined')?'你明确选择留在庭院。':closeChoice?'你明确结束了尚未完成的接力。':'这次没有完成接手，不能说你拒绝了合作。';
  const relationEvent=closeChoice??choice;
  const consequence=closeChoice?events.find(e=>e.type==='curtain-ready'&&e.t>=closeChoice.t):handoff;
  const relationship=stage('relay')!==undefined||closeChoice?clip('选择与接应','03 / 行动与关系',relationEvent?.t??stage('relay')!,'选择怎样改变了谁等候、谁接手，或在哪里收场？',chosen+result+' 记录不能说明选择的心理原因。',relationEvent??handoff):undefined;
  if(relationship&&relationEvent){relationship.start=Math.max(0,relationEvent.t-.25);relationship.end=Math.min(duration,(consequence?.t??relationEvent.t)+6);}
  const displayed=events.filter((event,index)=>{
    if(event.type!=='narration')return false;
    const frame=frames.find(f=>f.lineId===index);if(!frame)return false;
    const end=events.find(e=>e.type==='narration-end'&&e.lineId===index);
    return Number(end?.duration??duration-event.t)>=2.4;
  });
  const narration=displayed.find(e=>e.reason==='reverse-reveal')??displayed.find(e=>e.reason==='relay-rule')??displayed.find(e=>e.reason==='guide-assistance')??displayed[0];
  const clips=[first,
    ...(echo?[clip('熟悉的动作','02 / 具身性',echo.t,'动作来自哪一段过去？当前输入又给了谁？',demo?'本局有效路线不足，身体执行明确标记的系统示范。':'身体沿所选真实片段重演；首尾平滑衔接，中段保留原时序与停顿；当前输入交给影子。',echo)]:[]),
    ...(relationship?[relationship]:stage('follow')!==undefined?[clip('谁带着谁走','03 / 审美距离',stage('follow')!,'亲手操作与观看搭档行动，有什么不同？','你直接操作影子，通过影子间接影响身体。')]:[]),
    ...(narration?[clip('旁白的安排','04 / 反身性',narration.t,'这句原话对应什么安排？哪些来自你的选择？',narration.reason==='reverse-reveal'?'玩家接受了沿真实路径反向重走；速度由程序重新安排，玩家仍可叫停。接受不代表程序知道其理由。':'保留实际台词与触发条件，区分玩家选择、角色动作和系统协助。',narration)]:[])
  ];
  const last=clips.at(-1);if(narration&&last){last.quote=String(narration.text);const id=events.indexOf(narration);last.start=frames.find(f=>f.lineId===id)!.t;}
  return clips;
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
