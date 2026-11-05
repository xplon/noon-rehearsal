import {type Frame,type Event,frameAt} from './engine.ts';
import {Quaternion} from 'three';
export type Clip={name:string;eyebrow:string;start:number;end:number;question:string;fact:string;event?:Event;quote?:string};
export function makeClips(frames:Frame[],events:Event[]):Clip[]{
  const duration=frames.at(-1)?.t||0;
  const stage=(name:string)=>events.find(e=>e.type==='stage'&&e.stage===name)?.t;
  const clip=(name:string,eyebrow:string,time:number,question:string,fact:string,event?:Event):Clip=>({name,eyebrow,start:Math.max(0,time-2),end:Math.min(duration,time+10),question,fact,event});
  const target=events.find(e=>e.type==='target-entered');
  const a=clip('第一条指令','01 / 行动',target?.t??Math.min(12,duration/3),'你当时想做什么？程序实际知道多少？',target?'记录到进入门口区域；无法据此判断动机。':'这一局没有记录到进入门口区域。未完成不等于拒绝。',target);
  const t2=events.find(e=>e.type==='echo-playback-start')?.t??stage('echo');
  const demo=events.some(e=>e.type==='system-demo');
  const consequence=events.find(e=>e.type==='memory-reaction')??events.find(e=>e.type==='door-held')??events.find(e=>e.type==='body-led');
  const departure=events.find(e=>e.type==='relationship'&&['shadow-crossed-threshold','partner-called','returned-to-partner'].includes(String(e.reason)));
  const chosen=departure?.reason==='shadow-crossed-threshold'?'影子先跨过门槛。':departure?'你召回或走近搭档。':'本局没有明确选择先走或召回，不能记作玩家同意。';
  const reaction=consequence?.type==='door-held'?'身体实际走到门边留门。':consequence?.type==='body-led'?'身体随后主动领路。':consequence?.reaction==='checks-before-holding-door'?'身体先确认搭档的位置，再准备留门。':consequence?.reaction==='waits-at-last-threshold'?'身体在最后离场前停下来确认搭档。':consequence?'身体在最后离场前向搭档伸手。':'';
  // Only displayed lines with actual recorded frames are eligible. Event existence
  // alone is not proof that a viewer could have seen or can replay the sentence.
  const displayed=events.filter((event,index)=>{
    if(event.type!=='narration')return false;
    const first=frames.find(f=>f.lineId===index);if(!first)return false;
    const end=events.find(e=>e.type==='narration-end'&&e.lineId===index);
    return Number(end?.duration??duration-event.t)>=2.4;
  });
  const interpretation=displayed.find(e=>e.interpretation===true);
  const narration=interpretation??displayed.find(e=>String(e.reason).startsWith('outcome-'))??displayed[0];
  const result=[a,
    ...(t2!==undefined?[clip('熟悉的动作','02 / 具身性',t2,'动作出自刚才的你，但此刻是谁在操作？',demo?'有效路线不足，身体执行明确标记的系统代演。':'身体播放本局记录的旧路线，当前输入交给影子。')]:[]),
    ...(consequence?[clip('后来记住了什么','03 / 行动与关系',consequence.t,'前面的选择，怎样改变了这次接应？',chosen+reaction+' 这是行为条件，不是性格或心理判断。',consequence)]:stage('follow')!==undefined?[clip('谁带着谁走','03 / 审美距离',stage('follow')!,'亲手操作与观看搭档行动，有什么不同？','这段中你直接操作影子，通过影子间接影响身体。')]:[]),
    ...(narration?[clip('旁白的安排','04 / 反身性',narration.t,'这句原话说了什么？谁安排了它后面的动作？',interpretation?'这次倒序由旁白的纠正引出，执行的是本局实际路线；它不代表程序知道玩家的意思。':'本局没有触发可回看的解释性调侃。这里保留实际出现的台词，不另造一次误读。',narration)]:[])
  ];
  const last=result.at(-1);if(narration&&last){last.quote=String(narration.text);const id=events.indexOf(narration);const first=frames.find(f=>f.lineId===id)!;last.start=first.t;}
  return result;
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
