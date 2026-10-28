import {courtyardMotion} from './environment-motion';
// Optional, quiet procedural theatre foley. All pitches originate in user-initiated playback.
export class Sound {
  ctx:AudioContext|null=null;enabled=false;lastStep=-1;ambientTime:number|null=null;doorCycle=-1;
  resetAmbience(){this.ambientTime=null;this.doorCycle=-1;}
  ambience(t:number){
    const last=this.ambientTime,motion=courtyardMotion(t);this.ambientTime=t;
    // A seek, restart or restored tab must never replay old creaks in a burst.
    if(last===null||t<last||t-last>.5){this.doorCycle=motion.doorCycle;return;}
    if(motion.doorActive&&motion.doorCycle!==this.doorCycle){this.doorCycle=motion.doorCycle;this.creak();}
  }
  creak(){
    if(!this.enabled||!this.ctx)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain(),filter=c.createBiquadFilter(),t=c.currentTime;
    o.type='triangle';o.frequency.setValueAtTime(210,t);o.frequency.exponentialRampToValueAtTime(135,t+.65);o.frequency.exponentialRampToValueAtTime(185,t+1.1);
    filter.type='lowpass';filter.frequency.value=620;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.008,t+.18);g.gain.linearRampToValueAtTime(.004,t+.7);g.gain.exponentialRampToValueAtTime(.0001,t+1.3);
    o.connect(filter);filter.connect(g);g.connect(c.destination);o.start(t);o.stop(t+1.35);
  }
  async toggle(){this.enabled=!this.enabled;if(this.enabled){this.ctx??=new AudioContext();await this.ctx.resume();}return this.enabled;}
  tone(frequency:number,duration=.12,volume=.025,type:OscillatorType='sine'){
    if(!this.enabled||!this.ctx)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=frequency;
    g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(volume,c.currentTime+.008);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);
    o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+duration+.02);
  }
  step(gaitPhase:number,moving:boolean){const beat=Math.floor(gaitPhase*2);if(!moving){this.lastStep=beat;return;}if(beat!==this.lastStep){this.lastStep=beat;this.tone(beat%2?155:175,.07,.008,'triangle');}}
  chime(){this.tone(440,.8,.015);setTimeout(()=>this.tone(660,.9,.009),160);}
}
