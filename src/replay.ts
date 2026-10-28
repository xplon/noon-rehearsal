import {type Frame,type Event,frameAt} from './engine.ts';
import {Quaternion} from 'three';
export type Clip={name:string;eyebrow:string;start:number;end:number;question:string;fact:string;event?:Event};
export function makeClips(frames:Frame[],events:Event[]):Clip[]{
  const duration=frames.at(-1)?.t||0;
  const stage=(name:string)=>events.find(e=>e.type==='stage'&&e.stage===name)?.t;
  const clip=(name:string,eyebrow:string,time:number,question:string,fact:string,event?:Event):Clip=>({name,eyebrow,start:Math.max(0,time-2),end:Math.min(duration,time+10),question,fact,event});
  const target=events.find(e=>e.type==='target-entered');
  const a=clip('第一条指令','01 / 行动',target?.t??Math.min(12,duration/3),'你当时想做什么？程序实际知道多少？',target?'记录到进入门口区域；无法据此判断动机。':'这一局没有记录到进入门口区域。未完成不等于拒绝。',target);
  const t2=events.find(e=>e.type==='echo-playback-start')?.t??stage('echo');const demo=events.some(e=>e.type==='system-demo');
  const reverse=events.find(e=>e.type==='reverse-start');
  const t3=reverse?.t??stage('follow');
  const interpretation=events.find(e=>e.type==='narration'&&e.interpretation===true);
  const narration=interpretation??events.find(e=>e.type==='narration');
  return [a,
    ...(t2!==undefined?[clip('熟悉的动作','02 / 具身性',t2,'动作出自刚才的你，但此刻是谁在操作？',demo?'本局有效路线不足，此段是明确标记的系统代演。':'身体播放本局记录的旧路线，当前输入交给影子。')]:[]),
    ...(t3!==undefined?[clip('谁带着谁走','03 / 审美距离',t3,'从亲手操作到观看自己的动作，距离怎样变了？',reverse?(Number(reverse.length)<.02?'本局这一段影子没有移动，倒序段也保留静止，没有另造一条路线。':'影子倒序走过领路末尾八秒及实际减速会合的路线，起止重新加减速；身体追随并会合。'):'你直接操作影子，通过影子间接影响身体。')]:[]),
    ...(narration?[clip('旁白也会猜错','04 / 反身性',narration.t,'这句话是观察，还是创作者替你写的解释？',interpretation?'触发条件只是输入、位置或时间；台词对动机的解释来自编剧。':'本局没有触发动机调侃。这张卡回看实际出现的指令，不能补造一次调侃。',narration)]:[])
  ];
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
