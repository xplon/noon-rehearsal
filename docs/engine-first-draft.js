// The simulation owns all movement and narration. Replay only reads recorded frames.
export const HOME = { x: 515, y: 560 };
export const MARK = { x: 770, y: 450 };
export const EXIT = { x: 990, y: 430 };
export const BOUNDS = { left: 225, right: 1000, top: 385, bottom: 690 };
export const SETTINGS = {
  student: { first: 28, lead: 28, final: 22 },
  teacher: { first: 38, lead: 62, final: 26 },
};
export const ACTS = { first: ['I', '影子报到'], return: ['I', '影子报到'], replay: ['II', '一段熟悉的路'], lead: ['III', '请把身体带走'], reverse: ['IV', '过去开始带路'], reunite: ['V', '谁又回来了'], done: ['FIN', '本场演出结束'] };
const point = p => ({ x: p.x, y: p.y });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clone = x => structuredClone(x);
export function sampleRoute(route, time) {
  if (!route.length) return null;
  if (time <= route[0].t) return point(route[0]);
  if (time >= route.at(-1).t) return point(route.at(-1));
  let low = 0, high = route.length - 1;
  while (high - low > 1) { const mid = (low + high) >> 1; if (route[mid].t <= time) low = mid; else high = mid; }
  const a = route[low], b = route[high], f = (time - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
export class ShadowGame {
  constructor(mode = 'student') {
    this.mode = mode; this.config = SETTINGS[mode]; this.time = 0; this.stageTime = 0; this.stage = 'first';
    this.body = { ...HOME, face: 1, pose: 'idle' }; this.shadow = { x: HOME.x + 40, y: HOME.y + 16, face: 1, pose: 'idle' };
    this.input = { x: 0, y: 0 }; this.inputTarget = 'body'; this.bodySource = 'current-input'; this.shadowSource = 'delayed-body';
    this.frames = []; this.events = []; this.route = [{ t: 0, ...HOME }]; this.bodyHistory = []; this.shadowHistory = [];
    this.paused = false; this.ending = ''; this.goalReached = false; this.distance = 0; this.idleTime = 0; this.lastInputAt = 0;
    this.narration = ''; this.narrationUntil = 0; this.fired = new Set(); this.turns = 0; this.lastDirection = null;
    this.stageStart = { first: 0 }; this.systemRoute = false; this.quips = 0; this.restUntil = 0; this.bowUntil = 0;
    this.say('请带着你的影子，从这边离场。它今天第一天上班。', 'opening', 6);
    this.event('stage', { stage: 'first' }); this.record();
  }
  event(type, details = {}) { this.events.push({ t: this.time, type, ...details }); }
  say(text, reason, duration = 6, interpretation = false) {
    this.narration = text; this.narrationUntil = this.time + duration;
    this.event('narration', { text, reason, interpretation });
  }
  once(key, action) { if (this.fired.has(key)) return; this.fired.add(key); action(); }
  setInput(x, y) {
    const length = Math.hypot(x, y); if (length > 1) { x /= length; y /= length; }
    if (x !== this.input.x || y !== this.input.y) {
      if (length > .1 && this.lastDirection && x * this.lastDirection.x + y * this.lastDirection.y < -.3) this.turns++;
      if (length > .1) this.lastDirection = { x, y };
      this.input = { x, y }; this.event('input', { x, y, target: this.inputTarget });
    }
  }
  pause(reason = 'manual') { if (!this.paused && this.stage !== 'done') { this.paused = true; this.setInput(0, 0); this.event('pause', { reason }); } }
  resume() { if (this.paused) { this.paused = false; this.event('resume'); } }
  move(actor, x, y, dt, speed = 150) {
    actor.x = Math.max(BOUNDS.left, Math.min(BOUNDS.right, actor.x + x * speed * dt));
    actor.y = Math.max(BOUNDS.top, Math.min(BOUNDS.bottom, actor.y + y * speed * dt * .72));
  }
  follow(actor, target, dt, speed = 120, gap = 0) {
    const dx = target.x - actor.x, dy = target.y - actor.y, d = Math.hypot(dx, dy);
    if (d <= gap) return;
    const step = Math.min(d - gap, speed * dt); actor.x += dx / d * step; actor.y += dy / d * step;
  }
  transition(stage, reason = 'automatic') {
    if (this.stage === 'done') return;
    this.event('transition', { from: this.stage, to: stage, reason });
    this.stage = stage; this.stageTime = 0; this.stageStart[stage] = this.time; this.quips = 0;
    this.narration = ''; this.narrationUntil = 0; this.event('stage', { stage });
    if (stage === 'return') {
      this.inputTarget = 'shadow'; this.bodySource = 'system-return'; this.shadowSource = 'current-input';
      if (this.distance < 60) {
        this.systemRoute = true;
        this.route = [{ t: 0, ...HOME }, { t: 3, x: 650, y: 520 }, { t: 5, x: 650, y: 520 }, { t: 8, x: 730, y: 435 }, { t: 11, ...HOME }];
        this.say('这一场很安静。接下来由影子代演一小段。', 'system-demo'); this.event('system-demo');
      } else if (distance(this.body, HOME) > 20) this.say('请稍等。身体先回到刚才出发的地方。', 'system-return');
      this.event('system-return', { from: point(this.body), to: HOME });
    } else if (stage === 'replay') {
      this.inputTarget = 'shadow'; this.bodySource = this.systemRoute ? 'system-demo' : 'recorded-body'; this.shadowSource = 'current-input';
    } else if (stage === 'lead') {
      this.inputTarget = 'shadow'; this.bodySource = 'follow-shadow'; this.shadowSource = 'current-input';
      this.say('很好。现在请把这个人带到出口。', 'lead-instruction');
    } else if (stage === 'reverse') {
      this.inputTarget = 'none'; this.bodySource = 'follow-shadow'; this.shadowSource = 'recorded-shadow-reverse';
      const recent = this.shadowHistory.filter(p => p.t >= this.time - 8);
      this.reverseRoute = [...recent, { t: this.time, ...point(this.shadow) }];
    } else if (stage === 'reunite') {
      this.inputTarget = 'body'; this.bodySource = 'current-input'; this.shadowSource = 'delayed-body';
      this.bodyHistory = [{ t: this.time, ...point(this.body) }];
    }
  }
  skip() {
    if (this.stage === 'done') return;
    this.event('host-skip', { stage: this.stage });
    const next = { first: 'return', return: 'replay', replay: 'lead', lead: this.mode === 'teacher' ? 'reverse' : 'reunite', reverse: 'reunite' };
    // Even a host skip preserves spatial continuity and provenance.
    if (this.stage === 'return') { this.event('host-skip-deferred', { reason: 'finish-continuous-return' }); this.forceReturn = true; return; }
    if (this.stage === 'reunite') this.finish('host-ended'); else this.transition(next[this.stage], 'host-skip');
  }
  finish(ending) {
    this.ending = ending; this.stage = 'done'; this.inputTarget = 'none'; this.bodySource = 'ending'; this.shadowSource = 'ending';
    this.body.pose = ending === 'stillness' ? 'sit' : 'bow'; this.shadow.pose = 'sit';
    const text = { exit: '身体离场了。影子依然晚了半拍。', lingering: '出口等了很久。后来，它也下班了。', stillness: '他们都坐下了。没有谁需要先离开。', 'host-ended': '这一次，导演替演出落了幕。' }[ending];
    this.say(text, 'ending', 999); this.event('ending', { ending }); this.record();
  }
  step(dt) {
    if (this.paused || this.stage === 'done') return;
    dt = Math.min(dt, .05); this.time += dt; this.stageTime += dt;
    const before = point(this.body), shadowBefore = point(this.shadow);
    const active = Math.hypot(this.input.x, this.input.y) > .1;
    if (active) { this.lastInputAt = this.time; this.idleTime = 0; } else this.idleTime += dt;
    if (this.time > this.narrationUntil) this.narration = '';
    if (this.stage === 'first') {
      this.move(this.body, this.input.x, this.input.y, dt);
      this.distance += distance(before, this.body); this.route.push({ t: this.stageTime, ...point(this.body) });
      const delayed = sampleRoute(this.route, Math.max(0, this.stageTime - .55));
      this.follow(this.shadow, { x: delayed.x + 38, y: delayed.y + 14 }, dt, 240);
      if (this.stageTime > 6) this.once('first-target', () => this.say('出口还在排练。先去绿圈转一圈，再回到白圈等它。', 'first-instruction', 8));
      if (this.stageTime > 6 && distance(this.body, MARK) < 40 && !this.goalReached) {
        this.goalReached = true; this.event('target-entered', { target: 'mint-mark' });
        this.say('到了。现在回到白圈，等你的影子报到。', 'return-instruction');
      }
      if (this.stageTime > 14 && this.goalReached && distance(this.body, HOME) < 30) this.transition('return', 'returned-to-home');
      else if (this.stageTime >= this.config.first) this.transition('return', 'stage-time-limit');
    } else if (this.stage === 'return') {
      this.move(this.shadow, this.input.x, this.input.y, dt); this.follow(this.body, HOME, dt, 210);
      if (distance(this.body, HOME) < .5 && this.stageTime > (this.systemRoute ? 4 : .3)) this.transition('replay');
    } else if (this.stage === 'replay') {
      const p = sampleRoute(this.route, this.stageTime); Object.assign(this.body, p);
      this.move(this.shadow, this.input.x, this.input.y, dt);
      if (this.stageTime >= 7) this.once('replay-reveal', () => this.say('等一下。刚才走路的，和现在按键的，好像不是同一位。', 'control-reveal', 7));
      if (this.stageTime >= this.route.at(-1).t) this.transition('lead');
    } else if (this.stage === 'lead') {
      this.move(this.shadow, this.input.x, this.input.y, dt);
      if (this.mode === 'teacher' && this.stageTime >= 17) this.once('rest', () => {
        this.restUntil = this.time + 2; this.event('body-rest', { duration: 2 });
        this.say('您的身体申请了两秒钟离线。', 'body-rest');
      });
      this.bodySource = this.time < this.restUntil ? 'scripted-rest' : 'follow-shadow';
      if (this.time >= this.restUntil) this.follow(this.body, { x: this.shadow.x - 28, y: this.shadow.y - 8 }, dt, 105, 10);
      if (this.mode === 'teacher' && this.stageTime > 25) this.once('bow-mark', () => this.say('谢幕位置准备好了。演员有自己的位置。', 'bow-instruction'));
      if (this.mode === 'teacher' && this.stageTime > 25 && distance(this.shadow, MARK) < 45) this.once('bow', () => {
        this.bowUntil = this.time + 3; this.event('bow', { target: 'mint-mark' }); this.say('身体正在谢幕。请影子暂时不要加班。', 'bow');
      });
      if (this.stageTime >= this.config.lead || (this.stageTime > (this.mode === 'teacher' ? 44 : 16) && distance(this.shadow, EXIT) < 45 && distance(this.body, EXIT) < 90))
        this.transition(this.mode === 'teacher' ? 'reverse' : 'reunite');
    } else if (this.stage === 'reverse') {
      Object.assign(this.shadow, sampleRoute(this.reverseRoute, Math.max(this.reverseRoute[0].t, this.reverseRoute.at(-1).t - this.stageTime)));
      this.follow(this.body, { x: this.shadow.x - 25, y: this.shadow.y - 8 }, dt, 110, 15);
      if (this.stageTime > 4) this.once('reverse-line', () => this.say('影子把你刚才的意思，当成了现在的命令。', 'reverse-reveal'));
      if (this.stageTime >= 8) this.transition('reunite');
    } else if (this.stage === 'reunite') {
      this.move(this.body, this.input.x, this.input.y, dt);
      const delayed = sampleRoute(this.bodyHistory, this.time - .6) || point(this.body);
      this.follow(this.shadow, { x: delayed.x + 35, y: delayed.y + 15 }, dt, 170);
      if (this.stageTime > 7) this.once('reunite-line', () => this.say('可以再试着走一步。出口这次真的准备好了。', 'exit-instruction'));
      if (this.stageTime > 8 && distance(this.body, EXIT) < 44) { this.finish('exit'); return; }
      if (this.stageTime >= this.config.final) { this.finish(this.idleTime > 8 ? 'stillness' : 'lingering'); return; }
    }
    const discovery = (this.stage === 'replay' || this.stage === 'reunite') && this.stageTime < 8;
    if (!discovery && !this.narration && this.stageTime > 8 && this.quips < 2) {
      if (this.idleTime > 8) this.once(`${this.stage}-idle`, () => { this.quips++; this.say('您似乎决定留一会儿。那我也把话说慢一点。', 'no-effective-input-8s', 6, true); });
      else if (distance(this.body, { x: 270, y: 480 }) < 65) this.once('flower', () => { this.quips++; this.say('花盆原本没有戏份。它现在有了。', 'near-planter'); });
      else if (this.turns > 6) this.once('turns', () => { this.quips++; this.say('您似乎很想改写这条路线。我更新一下说明书。', 'repeated-direction-changes', 6, true); });
      else if (this.stageTime > 20) this.once(`${this.stage}-late`, () => { this.quips++; this.say('按计划，你这会儿已经到了。看来是计划来早了。', 'stage-elapsed-20s'); });
    }
    const bMoved = distance(before, this.body) > .05, sMoved = distance(shadowBefore, this.shadow) > .05;
    if (Math.abs(this.body.x - before.x) > .05) this.body.face = this.body.x > before.x ? 1 : -1;
    if (Math.abs(this.shadow.x - shadowBefore.x) > .05) this.shadow.face = this.shadow.x > shadowBefore.x ? 1 : -1;
    this.body.pose = this.time < this.restUntil ? 'sit' : this.time < this.bowUntil ? 'bow' : bMoved ? (this.stage === 'lead' ? 'chase' : 'walk') : this.idleTime > 5 ? 'look' : 'idle';
    this.shadow.pose = sMoved ? 'walk' : 'idle';
    this.bodyHistory.push({ t: this.time, ...point(this.body) });
    this.shadowHistory.push({ t: this.time, ...point(this.shadow) });
    this.record();
  }
  record() { this.frames.push(this.snapshot()); }
  snapshot() { return { t: this.time, stage: this.stage, stageTime: this.stageTime, body: clone(this.body), shadow: clone(this.shadow), input: clone(this.input), inputTarget: this.inputTarget, bodySource: this.bodySource, shadowSource: this.shadowSource, narration: this.narration, goalReached: this.goalReached, mode: this.mode, ending: this.ending }; }
  export() { return { format: 'the-late-shadow/1', mode: this.mode, duration: this.time, systemRoute: this.systemRoute, ending: this.ending, frames: this.frames, events: this.events }; }
}
export function recordedFrame(frames, time) {
  let low = 0, high = frames.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (frames[mid].t <= time) low = mid; else high = mid - 1; }
  return frames[low];
}
