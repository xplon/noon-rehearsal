// Optional, quiet procedural theatre foley. All pitches originate in user-initiated playback.
export class Sound {
  ctx:AudioContext|null=null;enabled=false;lastStep=-1;
  async toggle(){this.enabled=!this.enabled;if(this.enabled){this.ctx??=new AudioContext();await this.ctx.resume();}return this.enabled;}
  tone(frequency:number,duration=.12,volume=.025,type:OscillatorType='sine'){
    if(!this.enabled||!this.ctx)return;const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=frequency;
    g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(volume,c.currentTime+.008);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);
    o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+duration+.02);
  }
  step(t:number,moving:boolean){if(!moving)return;const beat=Math.floor(t*4);if(beat!==this.lastStep){this.lastStep=beat;this.tone(beat%2?155:175,.07,.008,'triangle');}}
  chime(){this.tone(440,.8,.015);setTimeout(()=>this.tone(660,.9,.009),160);}
}
