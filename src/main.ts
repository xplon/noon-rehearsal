import './style.css';
import {Game,SOURCES,HOME,mixActor,type Frame,type Mode} from './engine';
import {StageScene} from './scene';
import {makeClips,replayFrame,type Clip} from './replay';
import {Sound} from './audio';
import QRCode from 'qrcode';

const archIcon='<svg viewBox="0 0 32 36" aria-hidden="true"><path d="M4 33V17a12 12 0 0 1 24 0v16M10 33V17a6 6 0 0 1 12 0v16M1 33h30" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16 1v5M1 13l5 1M26 14l5-1" stroke="currentColor"/></svg>';
const icons={sound:'♫',full:'⛶',pause:'Ⅱ',play:'▷',arrow:'↗'};
document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<div id="theatre" data-screen="lobby">
  <header class="masthead"><a class="wordmark" href="#" id="home-link" aria-label="回到入场页">${archIcon}<span>正午排练场<small>NOON REHEARSAL</small></span></a>
    <div class="header-note">一处庭院。一次小小的偏离。</div>
    <nav aria-label="工具"><button id="about-button" class="text-button">游玩须知</button><button id="sound-button" class="tool-button" aria-label="开启声音">${icons.sound}<span>声音 关</span></button><button id="fullscreen-button" class="tool-button" aria-label="全屏">${icons.full}</button></nav>
  </header>
  <main>
    <div id="scene-area"><div id="scene"></div><div class="grain" aria-hidden="true"></div></div>
    <section id="lobby" class="lobby-copy" aria-label="入场">
      <p class="eyebrow"><span class="sun-mark">✳</span> 互动短剧 / 第一号庭院</p>
      <h1>请入场<span class="punctuation">。</span></h1>
      <p class="invitation">门已经在那里。<br>接下来，请你走一小段路。</p>
      <fieldset class="mode-switch"><legend class="sr-only">选择演出版本</legend><label><input type="radio" name="mode" value="student" checked><span>个人体验 <small>约 1–3 分钟</small></span></label><label><input type="radio" name="mode" value="teacher"><span>剧场演出 <small>即兴与回看</small></span></label></fieldset>
      <button id="start-button" class="primary" disabled><span>正在布置舞台</span><span aria-hidden="true">→</span></button>
      <p class="small-note">方向键 / WASD 移动 · 手机使用方向盘<br>静音也能完整体验 · 剧场版结束后可回看</p>
    </section>
    <div class="scene-caption" id="scene-caption"><span class="caption-line"></span><span>正午 · 无需准时</span><span class="sun-mark">☼</span></div>
    <div id="loading" class="loading"><span class="loader-arch"></span><span>演员正在候场</span></div>
    <section id="hud" class="hud" hidden>
      <div class="stage-strip"><span class="eyebrow" id="mode-label">一场个人试演</span><div class="stage-tools"><button id="hint-button" class="text-button" aria-expanded="false" aria-controls="hint-panel">刚才的提示</button><button id="pause-button" class="text-button">Ⅱ 暂停</button></div></div>
      <div class="current-invitation" aria-label="当前行动"><span id="control-label" class="control-label" hidden></span><span id="objective"></span></div>
      <div id="subtitle" class="subtitle" role="status" aria-live="polite"></div><div id="stage-actions" class="stage-actions" role="group" aria-label="现在可以做的动作" hidden></div>
      <div class="control-bar"><div class="keys" aria-label="当前输入"><kbd data-key="up">↑</kbd><div><kbd data-key="left">←</kbd><kbd data-key="down">↓</kbd><kbd data-key="right">→</kbd></div></div><p>方向键 / WASD<span>随时可以停下来</span></p><button id="host-button" class="text-button">演出控制 <span>⌄</span></button></div>
      <div id="host-controls" class="host-controls" hidden><span>这些操作会写入本局记录</span><button id="skip-button">跳过这一段</button><button id="end-button">提前落幕</button></div>
    </section>
    <div id="joystick" class="joystick" aria-label="拖动方向盘移动" role="application" hidden><div class="joystick-cross"></div><div class="joystick-knob"></div></div>
    <section id="ending" class="ending" hidden><p class="eyebrow">这一场，演完了。</p><h1 aria-label="我的影子迟到了"><span aria-hidden="true" class="title-first">我的影子</span><span aria-hidden="true" class="title-second"><span class="late-word">迟到</span><span class="title-last">了</span></span></h1><p id="ending-line"></p><div class="ending-actions"><button class="primary" id="review-button"><span>回看刚才</span><span>↗</span></button><button class="text-button" id="again-button">再走一遍</button></div></section>
    <section id="review" class="review" hidden>
      <div class="review-heading"><p class="eyebrow">本场演出记录 / RECORDED HERE</p><h2>刚才，是谁在走？</h2><p>先看一次，再打开幕后的线索。</p></div>
      <div class="clip-tabs" id="clip-tabs" role="tablist" aria-label="回看片段"></div>
      <div id="replay-subtitle" class="replay-subtitle"></div>
      <div class="review-bottom"><div class="transport"><button id="replay-play" aria-label="播放片段">▷</button><span id="replay-time">00:00</span><input id="timeline" type="range" min="0" max="1" value="0" step="0.033" aria-label="回看时间"><span id="replay-end">00:00</span><button id="evidence-button" aria-pressed="false">展开线索</button></div><div class="analysis-card"><div><span class="eyebrow" id="clip-concept"></span><h3 id="clip-question"></h3><p id="clip-fact"></p><p id="clip-quote" class="clip-quote" hidden></p></div><div class="evidence-values" id="evidence-values" hidden></div></div><div id="correction" class="correction" hidden></div><div class="review-actions"><button id="correct-button">旁白，说明你的安排。</button><button id="export-button">保存本局记录 ↓</button><button id="new-button">重新入场 ↗</button></div></div>
    </section>
    <section id="pause-panel" class="pause-panel" aria-label="演出已暂停" hidden><p class="eyebrow">幕间 / INTERMISSION</p><h2>庭院会等你。</h2><p>时间已暂停。<br>可以慢慢看清舞台和当前提示。</p><button id="resume-button" class="primary"><span>继续这一场</span><span>→</span></button><button id="leave-button" class="text-button">结束这一场</button></section>
    <section id="hint-panel" class="hint-panel" aria-label="提示回顾" tabindex="-1" hidden><div class="hint-heading"><h2>刚才的提示</h2><button id="hint-close" class="text-button">收起</button></div><p class="hint-paused">演出已暂停，可以慢慢看。</p><p id="current-help" class="current-help"></p><ol id="hint-history" aria-label="最近实际出现的旁白"></ol><button id="hint-return" class="primary"><span>回到演出</span><span>→</span></button></section>
  </main>
  <footer class="footer"><span>一个关于行动与观看的互动作品</span><span class="footer-center">EST. AT NOON <span>✳</span></span><button id="share-button" class="text-button">邀请另一个人入场 ↗</button></footer>
</div>
<dialog id="about-dialog"><button class="dialog-close" aria-label="关闭">×</button><p class="eyebrow">入场之前</p><h2>用一小段时间，<br>走进一处庭院。</h2><p>电脑使用方向键或 WASD；手机横屏，拖动右侧方向盘。出现动作提示时，按空格或点按按钮回应搭档。游戏不计分，也不需要每一步都照着提示走。</p><p>个人体验约一至三分钟，剧场演出约两至三分钟；选择与探索会改变长度，随时可以暂停或提前结束。个人体验在片名出现时结束；剧场演出结束后可回看自己的动作。</p><div class="notice"><strong>关于本局记录</strong><p>角色轨迹与操作保存在当前页面，用于本场演出与剧场版回看。不采集姓名、摄像头或麦克风，不上传游玩记录。分享或展示他人的体验前，请先征得同意。关闭或刷新页面会清除未导出的记录。</p></div><p class="asset-credit">角色改编自 <a href="https://kaylousberg.com/game-assets" target="_blank" rel="noopener">Kay Lousberg · KayKit</a>（CC0）；植物来自 <a href="https://kenney.nl/assets/nature-kit" target="_blank" rel="noopener">Kenney · Nature Kit</a>（CC0）。</p><button class="primary dialog-close-action"><span>知道了</span><span>→</span></button></dialog>
<dialog id="share-dialog"><button class="dialog-close" aria-label="关闭">×</button><p class="eyebrow">一人，一场。</p><h2>在你的庭院里见。</h2><canvas id="qr"></canvas><p>扫码进入个人体验</p><button id="copy-button" class="primary"><span>复制入场链接</span><span>↗</span></button></dialog>
<div id="toast" role="status" aria-live="polite"></div>
<section id="rotation-guide" class="rotation-guide" aria-label="手机横屏游玩" hidden><div class="rotate-device" aria-hidden="true"><span>↻</span></div><p class="eyebrow">把庭院展开</p><h2>横过来，再入场。</h2><p>请将手机转为横屏。<br>留出足够的空间，看清人物与庭院。</p><small>若已开始，演出会暂停等你。</small></section>`;

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const theatre=$('theatre'),sound=new Sound();let scene:StageScene;
let game:Game|null=null,view:'lobby'|'play'|'ending'|'review'='lobby',mode:Mode='student';
let clips:Clip[]=[],clipIndex=0,replayTime=0,replayPlaying=false,evidence=false;
let corrections:{t:number;text:string;eventTime?:number}[]=[];
const keys=new Set<string>();let stick={x:0,y:0};let accumulator=0,last=performance.now(),lobbyTime=0,ready=false,toastTimer=0;
let helpOpen=false,helpOwnPause=false,actionSignature='',historySignature='';
const lobbyGame=new Game();let previousTick:Frame|null=null;
const time=(t:number)=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
function setText(id:string,text:string){const element=$(id);if(element.textContent!==text)element.textContent=text;}
function toast(message:string){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function screen(next:typeof view){
  view=next;theatre.dataset.screen=next;$('lobby').hidden=next!=='lobby';$('hud').hidden=next!=='play';$('ending').hidden=next!=='ending';$('review').hidden=next!=='review';$('joystick').hidden=next!=='play';$('scene-caption').hidden=next!=='lobby';
  $('pause-panel').hidden=true;$('host-controls').hidden=true;$('hint-panel').hidden=true;helpOpen=false;helpOwnPause=false;theatre.dataset.paused='false';$('hint-button').setAttribute('aria-expanded','false');requestAnimationFrame(()=>scene.resize());
}
function start(){
  if(!ready)return;mode=document.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value as Mode;
  game=new Game(mode,scene.stride,scene.runStride);previousTick=null;corrections=[];keys.clear();stick={x:0,y:0};accumulator=0;replayPlaying=false;evidence=false;
  $('mode-label').textContent=mode==='teacher'?'一场剧场演出':'一场个人试演';$('host-button').hidden=mode==='student';scene.setEvidence(game.snapshot(),[],false);actionSignature='';historySignature='';screen('play');renderHud(game.snapshot());sound.resetAmbience();
  document.title='庭院试演 · 正午排练场';scene.apply(game.snapshot());game.frames[0].visual=scene.capture();sound.chime();
}
function pause(reason='manual'){
  if(view!=='play'||!game||game.stage==='ended')return;game.pause(reason);keys.clear();resetStick();$('pause-panel').hidden=helpOpen;$('host-controls').hidden=true;renderHud(game.snapshot());
}
function resume(){if(!game)return;game.resume();last=performance.now();accumulator=0;helpOpen=false;helpOwnPause=false;$('pause-panel').hidden=true;$('hint-panel').hidden=true;$('hint-button').setAttribute('aria-expanded','false');renderHud(game.snapshot());$('scene').tabIndex=-1;$('scene').focus({preventScroll:true});}
function renderHud(frame:Frame){
  setText('objective',frame.objective);
  setText('control-label',frame.controlLabel);$('control-label').hidden=!frame.controlLabel;
  setText('subtitle',frame.line);$('subtitle').classList.toggle('empty',!frame.line);
  theatre.dataset.paused=String(Boolean(game?.paused));
  setText('pause-button',game?.paused?'▷ 继续':'Ⅱ 暂停');
  const signature=JSON.stringify(frame.actions);
  if(signature!==actionSignature){
    actionSignature=signature;const container=$('stage-actions');container.replaceChildren();
    frame.actions.forEach((action,index)=>{
      const button=document.createElement('button');button.type='button';button.className='stage-action';button.dataset.action=action.id;
      const label=document.createElement('span');label.textContent=action.label;button.append(label);
      if(index===0){button.classList.add('primary-action');const shortcut=document.createElement('small');shortcut.textContent='空格 / 点击';button.append(shortcut);}
      button.onclick=()=>chooseAction(action.id);container.append(button);
    });
  }
  $('stage-actions').hidden=!frame.actions.length;
  $('stage-actions').querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.disabled=Boolean(game?.paused));
  $<HTMLButtonElement>('host-button').disabled=Boolean(game?.paused);
  $('joystick').setAttribute('aria-disabled',String(Boolean(game?.paused)));
  if(helpOpen)renderHints(frame);
}
function chooseAction(id?:string){
  if(view!=='play'||!game||game.paused)return;
  const current=game.snapshot().actions;const action=id?current.find(choice=>choice.id===id):current[0];
  if(!action){renderHud(game.snapshot());return;}
  game.choose(action.id);renderHud(game.snapshot());
}
function renderHints(frame:Frame){
  $('current-help').textContent=frame.help||frame.objective;
  const lines=game?.events.filter(event=>event.type==='narration'&&typeof event.text==='string').slice(-5).map(event=>String(event.text))??[];
  const signature=JSON.stringify(lines);if(signature===historySignature)return;historySignature=signature;
  const list=$('hint-history');list.replaceChildren();
  for(const line of lines){const item=document.createElement('li');item.textContent=line;list.append(item);}
  list.hidden=!lines.length;
}
function toggleHints(open=!helpOpen){
  if(view!=='play'||!game)return;
  if(open){helpOwnPause=!game.paused;helpOpen=true;pause('hint-history');$('hint-panel').hidden=false;$('pause-panel').hidden=true;$('hint-button').setAttribute('aria-expanded','true');renderHints(game.snapshot());$('hint-panel').focus({preventScroll:true});}
  else{const restore=helpOwnPause;helpOpen=false;helpOwnPause=false;$('hint-panel').hidden=true;$('hint-button').setAttribute('aria-expanded','false');if(restore)resume();else{$('pause-panel').hidden=!game.paused;$('hint-button').focus({preventScroll:true});}}
}
const portraitPhone=matchMedia('(max-width:700px) and (orientation:portrait)');
function syncOrientation(){
  theatre.inert=portraitPhone.matches;$('rotation-guide').hidden=!portraitPhone.matches;
  if(portraitPhone.matches&&view==='play')pause('portrait-orientation');
}
portraitPhone.addEventListener('change',syncOrientation);syncOrientation();
function endReveal(){
  $('review-button').hidden=mode==='student';$('again-button').className=mode==='student'?'primary':'text-button';
  screen('ending');document.title='我的影子迟到了 · 正午排练场';$('ending-line').textContent=game!.line;
}
function review(){
  if(!game?.frames.length||game.mode!=='teacher')return;clips=makeClips(game.frames,game.events);screen('review');
  $('clip-tabs').innerHTML=clips.map((c,i)=>`<button role="tab" id="clip-${i}" data-clip="${i}"><small>0${i+1}</small>${c.name}</button>`).join('');
  $('clip-tabs').querySelectorAll<HTMLButtonElement>('button').forEach(button=>button.onclick=()=>selectClip(Number(button.dataset.clip)));
  selectClip(0);replayPlaying=true;$('replay-play').textContent='Ⅱ';
}
function selectClip(i:number){
  clipIndex=i;const c=clips[i];replayTime=c.start;replayPlaying=false;evidence=false;
  $('evidence-button').setAttribute('aria-pressed','false');$('evidence-button').textContent='展开线索';$('evidence-values').hidden=true;$('correction').hidden=true;$('replay-play').textContent='▷';
  $('clip-tabs').querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-selected',String(j===i)));
  const timeline=$<HTMLInputElement>('timeline');timeline.min=String(c.start);timeline.max=String(c.end);timeline.value=String(c.start);
  $('replay-end').textContent=time(c.end);$('clip-concept').textContent=c.eyebrow;$('clip-question').textContent=c.question;$('clip-fact').textContent=c.fact;$('clip-quote').hidden=!c.quote;$('clip-quote').textContent=c.quote?`本局原话：「${c.quote}」`:'';
  $('correct-button').hidden=!c.quote;
  renderReplay();
}
function renderReplay(){
  if(!game)return;const frame=replayFrame(game.frames,replayTime);scene.apply(frame);scene.setEvidence(frame,game.frames,evidence);$('replay-subtitle').textContent=frame.line;
  $('replay-time').textContent=time(replayTime);$<HTMLInputElement>('timeline').value=String(replayTime);
  $('evidence-values').textContent=`输入 → ${SOURCES[frame.target]||frame.target}　身体：${SOURCES[frame.bodySource]||frame.bodySource}　影子：${SOURCES[frame.shadowSource]||frame.shadowSource}`;
}
function input(){
  let x=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a'))+stick.x;
  let y=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w'))+stick.y;
  const n=Math.hypot(x,y);if(n>1){x/=n;y/=n;}return {x,y};
}
function animate(now:number){
  const dt=(now-last)/1000;last=now;
  if(dt>.5&&view==='play'&&game&&!game.paused)pause('long-frame');
  if(ready){
    if(view==='lobby'){
      lobbyTime+=Math.min(dt,.05);const frame=lobbyGame.snapshot();frame.t=lobbyTime;frame.body.animTime=lobbyTime;frame.shadow.animTime=lobbyTime;frame.body.clocks.idle=lobbyTime;frame.shadow.clocks.idle=lobbyTime;frame.line='';scene.apply(frame);sound.ambience(lobbyTime);
    }else if(view==='play'&&game&&!game.paused){
      const direction=input(),world=scene.screenInput(direction.x,direction.y);game.setInput(world.x,world.z);
      const active={up:direction.y<-.1,down:direction.y>.1,left:direction.x<-.1,right:direction.x>.1};
      document.querySelectorAll<HTMLElement>('[data-key]').forEach(el=>el.classList.toggle('active',active[el.dataset.key as keyof typeof active]));
      accumulator+=Math.min(dt,.25);
      while(accumulator>=1/60){
        const count=game.frames.length;previousTick=game.snapshot();game.step(1/60);accumulator-=1/60;
        if(game.frames.length>count){const frame=game.frames.at(-1)!;scene.apply(frame);frame.visual=scene.capture();}
      }
      const rendered=game.snapshot();if(previousTick){const alpha=accumulator*60;rendered.body=mixActor(previousTick.body,rendered.body,alpha);rendered.shadow=mixActor(previousTick.shadow,rendered.shadow,alpha);}scene.apply(rendered);renderHud(rendered);
      sound.step(game.body.gaitPhase,game.body.animation==='walk'||game.body.animation==='chase');
      sound.ambience(game.time);
      if(game.stage==='ended')endReveal();
    }else if(view==='review'&&game){
      if(replayPlaying){replayTime=Math.min(clips[clipIndex].end,replayTime+Math.min(dt,.1));if(replayTime>=clips[clipIndex].end){replayPlaying=false;$('replay-play').textContent='▷';}}
      renderReplay();
    }
    scene.render();
  }
  requestAnimationFrame(animate);
}
try{
  scene=new StageScene($('scene'));
  scene.load().then(()=>{ready=true;$('loading').hidden=true;$<HTMLButtonElement>('start-button').disabled=false;$('start-button').innerHTML='<span>入场</span><span aria-hidden="true">→</span>';}).catch(error=>{console.error(error);$('loading').innerHTML='<p>演员还没准备好。<br>请刷新页面，再试一次。</p>';});
}catch(error){console.error(error);$('loading').innerHTML='<p>这个浏览器暂时无法开启三维舞台。<br>请使用支持 WebGL2 的浏览器重新进入。</p>';}
requestAnimationFrame(animate);
$('start-button').onclick=start;$('again-button').onclick=start;$('review-button').onclick=review;
$('pause-button').onclick=()=>game?.paused?resume():pause();$('resume-button').onclick=resume;
$('hint-button').onclick=()=>toggleHints();$('hint-close').onclick=()=>toggleHints(false);$('hint-return').onclick=resume;
$('host-button').onclick=()=>{$('host-controls').hidden=!$('host-controls').hidden;};
$('skip-button').onclick=()=>{game?.skip();$('host-controls').hidden=true;};
$('end-button').onclick=()=>{game?.finish('host-ended');$('host-controls').hidden=true;};
$('leave-button').onclick=()=>{if(game){resume();game.finish(mode==='teacher'?'host-ended':'player-ended');}};
$('new-button').onclick=()=>{screen('lobby');document.title='入场 · 正午排练场';scene.setEvidence(game!.snapshot(),[],false);};
$('home-link').onclick=e=>{e.preventDefault();if(view==='play'){pause();return;}screen('lobby');document.title='入场 · 正午排练场';if(game)scene.setEvidence(game.snapshot(),[],false);};
$('replay-play').onclick=()=>{if(replayTime>=clips[clipIndex].end)replayTime=clips[clipIndex].start;replayPlaying=!replayPlaying;$('replay-play').textContent=replayPlaying?'Ⅱ':'▷';};
$<HTMLInputElement>('timeline').oninput=e=>{replayTime=Number((e.target as HTMLInputElement).value);replayPlaying=false;$('replay-play').textContent='▷';renderReplay();};
$('evidence-button').onclick=()=>{evidence=!evidence;$('evidence-button').setAttribute('aria-pressed',String(evidence));$('evidence-button').textContent=evidence?'收起线索':'展开线索';$('evidence-values').hidden=!evidence;renderReplay();};
$('correct-button').onclick=()=>{const c=clips[clipIndex];const text=c.event?.reason==='reverse-reveal'?'路线来自本局，反向重走的速度由程序重新安排。接受或中断会被记录，但这些选择并不说明你的理由。':'这句话由预设条件触发。我看到了记录中的动作，但不知道你为何这样做。';corrections.push({t:replayTime,text,eventTime:c.event?.t});const panel=$('correction');panel.hidden=false;panel.textContent=`旁白补充：${text}`;};
$('export-button').onclick=async()=>{
  if(!game)return;const button=$<HTMLButtonElement>('export-button');button.disabled=true;
  try{
    const data={...game.export(),corrections};const json=JSON.stringify(data,(_key,value)=>value instanceof Float32Array?Array.from(value):value);
    let blob=new Blob([json],{type:'application/json'}),filename='noon-rehearsal-session.json';
    if('CompressionStream' in window){blob=await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();filename+='.gz';}
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('本局记录已生成，请查看浏览器下载');
  }catch{toast('记录生成失败，请保留页面后重试');}finally{button.disabled=false;}
};
$('sound-button').onclick=async()=>{const enabled=await sound.toggle();$('sound-button').innerHTML=`♫<span>声音 ${enabled?'开':'关'}</span>`;$('sound-button').setAttribute('aria-label',enabled?'关闭声音':'开启声音');if(enabled)sound.chime();};
$('fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前浏览器不支持全屏，可横屏体验');}};
function openDialog(id:string){if(view==='play')pause('dialog');$<HTMLDialogElement>(id).showModal();}
$('about-button').onclick=()=>openDialog('about-dialog');
document.querySelectorAll<HTMLButtonElement>('.dialog-close,.dialog-close-action').forEach(button=>button.onclick=()=>button.closest('dialog')!.close());
$('share-button').onclick=async()=>{openDialog('share-dialog');const url=new URL(location.href);url.hash='';url.search='';await QRCode.toCanvas($<HTMLCanvasElement>('qr'),url.toString(),{width:240,margin:2,color:{dark:'#30334c',light:'#fff6df'}});};
$('copy-button').onclick=async()=>{try{await navigator.clipboard.writeText(location.href.split(/[?#]/)[0]);toast('入场链接已复制');}catch{toast('可直接复制浏览器地址分享');}};
window.addEventListener('keydown',e=>{
  if((e.target as HTMLElement).matches('input,textarea')||document.querySelector('dialog[open]'))return;
  if(e.code==='Space'&&view==='play'&&!game?.paused){if((e.target as HTMLElement).closest('button'))return;e.preventDefault();if(!e.repeat)chooseAction();return;}
  const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)&&view==='play'&&!game?.paused){e.preventDefault();keys.add(k);}
  if(k==='escape'&&view==='play'){if(game?.paused)resume();else pause();}
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{if(view==='play')pause('window-blur');replayPlaying=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(view==='play')pause('document-hidden');replayPlaying=false;}});
const joystick=$('joystick'),knob=joystick.querySelector<HTMLElement>('.joystick-knob')!;let pointer:number|null=null;
function resetStick(){pointer=null;stick={x:0,y:0};knob.style.transform='translate(-50%,-50%)';}
function stickMove(e:PointerEvent){const r=joystick.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/38,y=(e.clientY-r.top-r.height/2)/38,n=Math.max(1,Math.hypot(x,y));stick={x:x/n,y:y/n};knob.style.transform=`translate(calc(-50% + ${stick.x*32}px),calc(-50% + ${stick.y*32}px))`;}
joystick.onpointerdown=e=>{if(game?.paused)return;pointer=e.pointerId;joystick.setPointerCapture(e.pointerId);stickMove(e);};joystick.onpointermove=e=>{if(!game?.paused&&e.pointerId===pointer)stickMove(e);};joystick.onpointerup=resetStick;joystick.onpointercancel=resetStick;joystick.onlostpointercapture=resetStick;

// Minimal read-only diagnostics for QA; never offers a way to manufacture a recorded session.
Object.defineProperty(window,'noonDebug',{get:()=>({view,ready,stage:game?.stage,time:game?.time,paused:game?.paused,frames:game?.frames.length,events:game?.events.length,triangles:scene?.renderer.info.render.triangles,drawCalls:scene?.renderer.info.render.calls})});
