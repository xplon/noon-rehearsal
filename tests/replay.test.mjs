import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/engine.ts';
import {makeClips,replayFrame,recordedInstructions,recordedLines,inputDuration} from '../src/replay.ts';

test('replay interpolates captured bone positions, unit rotations and animated scale without changing the record',()=>{
 const g=new Game();const a=g.snapshot(),b=g.snapshot();a.t=0;b.t=1;
 a.visual={body:new Float32Array([0,1,2,0,0,0,1,1,1,1]),shadow:new Float32Array([0,1,2,0,0,0,1,1,1,1])};
 b.visual={body:new Float32Array([2,3,4,0,1,0,0,1,.2,1]),shadow:new Float32Array([2,3,4,0,1,0,0,1,.2,1])};
 const f=replayFrame([a,b],.5),v=f.visual.body;
 assert.equal(v[0],1);assert.equal(v[1],2);assert(Math.abs(v[8]-.6)<1e-6);assert(Math.abs(Math.hypot(...v.slice(3,7))-1)<1e-6);
 assert.equal(a.visual.body[8],1);assert.equal(b.visual.body[0],2);
});
const recordedFrames=(duration=30)=>{const base=new Game().snapshot();return Array.from({length:duration*2+1},(_,i)=>({...structuredClone(base),t:i/2,line:'',lineId:-1,input:{x:0,z:0}}));};

test('four review nodes identify missing records instead of inventing player scenes',()=>{
 const frames=recordedFrames(3),clips=makeClips(frames,[]);
 assert.equal(clips.length,4);assert(clips.every(c=>!c.available&&c.start===0&&c.end===0));
 assert(clips.every(c=>c.fact.includes('未记录')));assert(clips.every(c=>c.narrations.length===0&&!c.sourceWindow));
});
test('replay quotes only exact narration text that appeared in recorded frames',()=>{
 const frames=recordedFrames(12),events=[
  {t:2,type:'narration',text:'这句确实出现。',reason:'shown'},
  {t:4,type:'narration',text:'这句排队但未显示。',reason:'queued'},
  {t:5,type:'narration',text:'事件与帧不一致。',reason:'mismatch'},
 ];
 frames[5].line=events[0].text;frames[5].lineId=0;
 frames[11].line='另一句话';frames[11].lineId=2;
 assert.deepEqual(recordedLines(frames,events,0,12),[{text:events[0].text,t:2,lineId:0,reason:'shown'}]);
 assert.equal(recordedLines(frames,events,3,12).length,0);
});
test('actual event anchors retain source time and distinguish original from quoted scene',()=>{
 const frames=recordedFrames(30),events=[
  {t:8,type:'gate-failure'}, {t:10,type:'separation'},
  {t:13,type:'control-transfer',from:'none',to:'shadow'},
  {t:16,type:'quote-start',sourceStart:2,sourceEnd:6}, {t:20,type:'quote-end'},
  {t:24,type:'outside-invitation'}, {t:24,type:'pad',pad:'outer',actor:'shadow',held:true},
  {t:25,type:'control-transfer',from:'shadow',to:'body'}, {t:29,type:'ending',ending:'exit'},
 ];
 const clips=makeClips(frames,events);
 assert(clips.every(c=>c.available));assert.equal(clips[0].event,events[0]);
 assert.deepEqual(clips[2].sourceWindow,{start:2,end:6});assert(clips[2].start>clips[2].sourceWindow.end);
 assert(clips[3].observations.some(text=>text.includes('影子占住外侧踏板')));
 assert(clips[3].observations.some(text=>text.includes('输入对象由影子交给身体')));
 assert(clips[3].observations.some(text=>text.includes('没有方向输入')));
 assert(!clips.some(c=>/你(拒绝|故意|选择)|顺从|叛逆|听话指数/.test(c.fact+c.observations.join(''))));
});
test('unanswered instruction stays a bounded observed result and never becomes refusal',()=>{
 const events=[
  {t:1,type:'instruction',id:'leave',text:'请从庭院出去。',actor:'body',goal:'exit'},
  {t:6,type:'instruction-response',id:'leave',response:'unanswered',evidence:'观察窗口内没有方向输入。',windowStart:1,windowEnd:6},
  {t:8,type:'instruction',id:'look',text:'试着动一下。'},
 ];
 const instructions=recordedInstructions(events,2,7);
 assert.equal(instructions.length,1);assert.equal(instructions[0].text,'请从庭院出去。');
 assert.equal(instructions[0].response,'窗口内未记录到目标回应');assert.equal(instructions[0].evidence,'观察窗口内没有方向输入。');
 assert.equal(instructions[0].windowStart,1);assert.equal(instructions[0].windowEnd,6);
 assert(!JSON.stringify(instructions).includes('拒绝'));
 assert.equal(recordedInstructions(events,7,10)[0].response,'尚无回应结论');
});
test('response evidence must match the instruction identity and follow its issue time',()=>{
 const events=[{t:0,type:'instruction-response',id:'one',response:'followed',evidence:'too early'},
  {t:1,type:'instruction',id:'one',text:'先试一步。'},
  {t:2,type:'instruction-response',id:'other',response:'followed',evidence:'wrong identity'}];
 const [instruction]=recordedInstructions(events,0,5);
 assert.equal(instruction.response,'尚无回应结论');assert(!instruction.evidence.includes('wrong identity'));
});
test('skipped, invalid or missing quotes cannot masquerade as a real historical source',()=>{
 const frames=recordedFrames(20);
 const skipped=makeClips(frames,[{t:10,type:'quote-skipped',reason:'source-too-short'},{t:11,type:'system-demo'}])[2];
 assert(skipped.available);assert(!skipped.sourceWindow);assert(skipped.fact.includes('没有播放'));assert(skipped.fact.includes('source-too-short'));
 assert(skipped.observations.some(s=>s.includes('系统协助')));
 for(const source of [{sourceStart:5},{sourceStart:5,sourceEnd:15},{sourceStart:-2,sourceEnd:3},{sourceStart:5,sourceEnd:4}]){
  const clip=makeClips(frames,[{t:10,type:'quote-start',...source}])[2];assert(!clip.sourceWindow);assert(clip.fact.includes('无法'));
 }
 const noQuote=makeClips(frames,[{t:10,type:'system-demo'}])[2];assert(!noQuote.available);
});
test('teacher encounter and separate reunion outcomes remain observable actions',()=>{
 const frames=recordedFrames(50),events=[
  {t:12,type:'encounter-result',outcome:'body-approached',source:'system'},
  {t:20,type:'pad',pad:'outer',actor:'body',held:true}, {t:21,type:'outside-invitation'},
  {t:45,type:'reunion-choice',outcome:'alongside',basis:'actual-formation-at-departure-line'}, {t:48,type:'ending',ending:'exit'},
 ];
 const clips=makeClips(frames,events);
 assert(clips[2].available);assert(!clips[2].sourceWindow);assert(clips[2].fact.includes('没有可核对的历史引用'));
 assert(clips[2].observations.some(s=>s.includes('身体主动靠近影子')&&s.includes('角色自主动作')));
 assert(clips[3].end-clips[3].start<=18);assert(clips[3].endingWindow.start<=45&&clips[3].endingWindow.end>=48);
 assert(clips[3].observations.some(s=>s.includes('各自位置')));
});
test('input target evidence preserves returns to an earlier actor',()=>{
 const frames=recordedFrames(10);
 for(const frame of frames)frame.target=frame.t<4?'body':frame.t<7?'shadow':'body';
 const clip=makeClips(frames,[{t:3,type:'outside-invitation'}])[3];
 assert(clip.observations.some(s=>s.includes('身体 → 影子 → 身体')));
});
test('source timestamps without recorded source frames never enable source playback',()=>{
 const all=recordedFrames(20),frames=all.filter(f=>f.t<2||f.t>8);
 const clip=makeClips(frames,[{t:10,type:'quote-start',sourceStart:3,sourceEnd:6}])[2];
 assert(!clip.sourceWindow);assert(clip.fact.includes('无法'));
});
test('outside response keeps true source time and identifies its spatial adaptation',()=>{
 const frames=recordedFrames(60),events=[
  {t:20,type:'outside-invitation'},
  {t:30,type:'response-start',sourceStart:22,sourceEnd:27,transformation:'translated-scaled',scale:.7},
  {t:34,type:'response-end',reason:'left-for-exit'},
  {t:40,type:'formation-change',formation:'reunited'},
  {t:55,type:'reunion-choice',outcome:'alongside',basis:'actual-formation-at-departure-line'},
  {t:56,type:'ending',ending:'exit'},
 ];
 const c=makeClips(frames,events)[3];
 assert.equal(c.event,events[1]);assert(c.fact.includes('源位置重新安排'));assert(c.fact.includes('缩放'));
 assert(c.observations.some(s=>s.includes('00:22.0–00:27.0')&&s.includes('0.7 倍')));
 assert(c.observations.some(s=>s.includes('身体向出口离开')));
 assert(c.observations.some(s=>s.includes('本片段之前')&&s.includes('影子先')));
 assert(c.observations.some(s=>s.includes('实际跨过离场线')&&s.includes('并行')));
});
test('temporary formation and host ending cannot create a completed outside scene',()=>{
 const frames=recordedFrames(20);
 const c=makeClips(frames,[{t:5,type:'formation-change',formation:'reunited'},{t:12,type:'ending',ending:'host-ended'}])[3];
 assert(!c.available);
 const d=makeClips(frames,[{t:5,type:'reunion-choice',outcome:'alongside',basis:'actual-formation-at-departure-line'},{t:6,type:'ending',ending:'exit'}])[3];
 assert(d.available);assert(d.fact.includes('这里只回看实际离场'));assert(!d.fact.includes('玩家选择'));
});
test('live encounter interruption reports an absolute source cursor without attributing refusal',()=>{
 const frames=recordedFrames(30),events=[{t:15,type:'quote-start',sourceStart:2,sourceEnd:6},
  {t:17,type:'quote-interrupted',sourceCursor:4.5,reason:'live-encounter'}];
 const c=makeClips(frames,events)[2];
 assert(c.observations.some(s=>s.includes('00:04.5')&&s.includes('回应现场')));
 assert(c.fact.includes('现场相遇时中断'));assert(c.fact.includes('不说明玩家拒绝'));
});
test('first two nodes retain the latest physical gate cycle and the whole separation with at most one second overlap',()=>{
 const frames=recordedFrames(75),events=[
  {t:2,type:'pad',pad:'inner',actor:'body',held:true},
  {t:4,type:'pad',pad:'inner',actor:'body',held:false},
  {t:10,type:'pad',pad:'inner',actor:'body',held:true},
  {t:35,type:'pad',pad:'inner',actor:'body',held:false},
  {t:38,type:'gate-failure'}, {t:39,type:'separation'},
  {t:39,type:'narration',text:'门关得倒挺准时。'},
  {t:43,type:'narration',text:'身体：你去哪儿？'},
  {t:64,type:'control-transfer',from:'none',to:'shadow'},
 ];
 for(const frame of frames){
  if(frame.t>=39&&frame.t<42){frame.lineId=6;frame.line=events[6].text;}
  if(frame.t>=43&&frame.t<66){frame.lineId=7;frame.line=events[7].text;}
 }
 const [first,second]=makeClips(frames,events);
 assert(first.start>4&&first.start<=10);assert(first.end>=39&&first.end<=39.5);
 assert(first.observations.some(s=>s.includes('00:10.0')&&s.includes('占住')));
 assert(first.observations.some(s=>s.includes('00:35.0')&&s.includes('离开')));
 assert(first.end-first.start>18);assert(second.end-second.start>18);
 assert(second.start<=39&&second.end>=66);assert(first.end-second.start<=1);
 assert(second.observations.some(s=>s.includes('输入对象由无直接控制交给影子')));
 assert(second.narrations.some(n=>n.text===events[6].text));assert(second.narrations.some(n=>n.text===events[7].text));
});
test('an earlier unresolved instruction remains available without inventing a response',()=>{
 const events=[{t:1,type:'instruction',id:'leave',text:'请从庭院出去。'},
  {t:3,type:'instruction',id:'old',text:'已结束的指引。'},
  {t:5,type:'instruction-response',id:'old',response:'followed',evidence:'已完成',windowStart:3,windowEnd:5}];
 const records=recordedInstructions(events,20,30);
 assert.equal(records.length,1);assert.equal(records[0].text,events[0].text);assert.equal(records[0].response,'尚无回应结论');
 assert.equal(records[0].windowEnd,undefined);assert(records[0].context.includes('较早发出'));
});
test('off-clip encounter links the actual come-close instruction and its matching observed response',()=>{
 const frames=recordedFrames(60),events=[
  {t:12,type:'instruction',id:'come-close',text:'回来，站这里。'},
  {t:17,type:'instruction-response',id:'come-close',response:'alternative',evidence:'影子继续走到身体另一侧。',windowStart:12,windowEnd:17},
  {t:18,type:'encounter-result',outcome:'kept-apart',source:'player-position'},
  {t:40,type:'quote-start',sourceStart:2,sourceEnd:5}, {t:44,type:'quote-end'},
 ];
 const clip=makeClips(frames,events)[2],instruction=clip.instructions.find(i=>i.text==='回来，站这里。');
 assert(instruction);assert(instruction.context.includes('本片段之外'));assert.equal(instruction.windowStart,12);assert.equal(instruction.windowEnd,17);
 assert.equal(instruction.evidence,events[1].evidence);assert.equal(instruction.response,'记录到其他行动');
 const unresolved=makeClips(frames,events.filter(e=>e.type!=='instruction-response'))[2].instructions.find(i=>i.text==='回来，站这里。');
 assert.equal(unresolved.response,'尚无回应结论');assert.equal(unresolved.windowEnd,undefined);
});
test('input seconds integrate nonuniform adjacent frame intervals and clip boundaries',()=>{
 const base=new Game().snapshot(),frames=[
  {...structuredClone(base),t:0,input:{x:1,z:0}},
  {...structuredClone(base),t:.2,input:{x:0,z:0}},
  {...structuredClone(base),t:1.2,input:{x:0,z:1}},
  {...structuredClone(base),t:3.7,input:{x:0,z:0}},
  {...structuredClone(base),t:4,input:{x:1,z:0}},
 ];
 const duration=inputDuration(frames,.1,3.8);
 assert(Math.abs(duration.recordedSeconds-3.7)<1e-9);assert(Math.abs(duration.activeSeconds-2.6)<1e-9);
 assert.deepEqual(inputDuration(frames,1.2,3.7),{recordedSeconds:2.5,activeSeconds:2.5});
 assert.deepEqual(inputDuration(frames,4,10),{recordedSeconds:0,activeSeconds:0});
 const clip=makeClips(frames,[{t:2,type:'outside-invitation'}])[3];
 assert(clip.observations.some(s=>s.includes('4.0 秒')&&s.includes('2.7 秒')));
 assert(!clip.observations.some(s=>s.includes('个记录帧')));
});
test('typed pose arrays export as plain JSON arrays and survive gzip',async()=>{
 const pose=new Float32Array([1,.25,0,0,0,0,1,1,.2,1]);
 const json=JSON.stringify({pose},(_key,v)=>v instanceof Float32Array?Array.from(v):v);
 const gzip=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
 const decoded=await new Response(gzip.stream().pipeThrough(new DecompressionStream('gzip'))).json();
 assert.deepEqual(decoded.pose,Array.from(pose));
});
