class AudioManager {
  ctx: AudioContext | null = null;
  bgmOsc: OscillatorNode | null = null;
  bgmGain: GainNode | null = null;
  lfo: OscillatorNode | null = null;

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playPop() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playSquish() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playAlert() {
    this.init();
    if (!this.ctx) return;
    const playNote = (freq: number, timeOffset: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, this.ctx!.currentTime + timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + timeOffset + 0.2);
      osc.start(this.ctx!.currentTime + timeOffset);
      osc.stop(this.ctx!.currentTime + timeOffset + 0.2);
    };
    playNote(440, 0);
    playNote(660, 0.1);
  }

  setBGM(phase: string) {
    this.init();
    if (!this.ctx) return;

    if (this.bgmOsc) {
      this.bgmOsc.stop();
      this.bgmOsc.disconnect();
      this.bgmOsc = null;
    }
    if (this.lfo) {
      this.lfo.stop();
      this.lfo.disconnect();
      this.lfo = null;
    }
    if (this.bgmGain) {
      this.bgmGain.disconnect();
      this.bgmGain = null;
    }

    if (phase === 'OFF') return;

    this.bgmOsc = this.ctx.createOscillator();
    this.bgmGain = this.ctx.createGain();
    this.lfo = this.ctx.createOscillator();

    this.bgmOsc.connect(this.bgmGain);
    this.bgmGain.connect(this.ctx.destination);

    // LFO for pulsing effect
    const lfoGain = this.ctx.createGain();
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.bgmGain.gain);

    if (phase === 'LOBBY') {
      this.bgmOsc.type = 'sine';
      this.bgmOsc.frequency.value = 220; // A3
      this.bgmGain.gain.value = 0.05;
      this.lfo.frequency.value = 0.5; // Slow pulse
      lfoGain.gain.value = 0.02;
    } else if (phase === 'PLAYING') {
      this.bgmOsc.type = 'triangle';
      this.bgmOsc.frequency.value = 110; // A2
      this.bgmGain.gain.value = 0.08;
      this.lfo.frequency.value = 2; // Faster pulse
      lfoGain.gain.value = 0.04;
    } else if (phase === 'THEATER') {
      this.bgmOsc.type = 'sine';
      this.bgmOsc.frequency.value = 330; // E4
      this.bgmGain.gain.value = 0.05;
      this.lfo.frequency.value = 1;
      lfoGain.gain.value = 0.02;
    }

    this.bgmOsc.start();
    this.lfo.start();
  }
}

export const audio = new AudioManager();
