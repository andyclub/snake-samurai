class AudioManager {
  ctx: AudioContext | null = null;
  mainBgm: HTMLAudioElement | null = null;
  battleBgm: HTMLAudioElement | null = null;
  bgmScene = '';
  questionSpeechToken = 0;
  questionRetryTimer: number | null = null;
  countdownSpeechToken = 0;
  countdownRetryTimer: number | null = null;

  private ensureBGM() {
    if (this.mainBgm || typeof Audio === 'undefined') return;
    this.mainBgm = new Audio('/audio/ran_music.mp3');
    this.battleBgm = new Audio('/audio/battle.mp3');
    this.mainBgm.loop = true;
    this.battleBgm.loop = true;
    this.mainBgm.preload = 'auto';
    this.battleBgm.preload = 'auto';
    this.mainBgm.volume = .42;
    this.battleBgm.volume = .52;
  }

  private playTrack(track: HTMLAudioElement | null) {
    if (!track) return;
    track.play().catch(() => {
      // Mobile browsers unlock media on the next user gesture; init() retries.
    });
  }

  private duckBGM(ducked: boolean) {
    if (this.mainBgm) this.mainBgm.volume = ducked ? .14 : .42;
    if (this.battleBgm) this.battleBgm.volume = ducked ? .18 : .52;
  }

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
    // Mobile Safari may leave speech synthesis paused after backgrounding.
    // Calling this from every real pointer gesture keeps local TTS available.
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.resume();
    }
    this.ensureBGM();
    if (this.bgmScene && this.bgmScene !== 'OFF') {
      this.playTrack(this.bgmScene === 'BATTLE' ? this.battleBgm : this.mainBgm);
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

  playDenied() {
    this.init();
    if (!this.ctx) return;
    [180, 130].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator(); const gain = this.ctx!.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = freq; osc.connect(gain); gain.connect(this.ctx!.destination);
      const at = this.ctx!.currentTime + i * .09;
      gain.gain.setValueAtTime(.12, at); gain.gain.exponentialRampToValueAtTime(.001, at + .13);
      osc.start(at); osc.stop(at + .14);
    });
  }

  playVictory() {
    this.init();
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator(); const gain = this.ctx!.createGain();
      osc.type = 'square'; osc.frequency.value = freq; osc.connect(gain); gain.connect(this.ctx!.destination);
      const at = this.ctx!.currentTime + i * .11;
      gain.gain.setValueAtTime(.1, at); gain.gain.exponentialRampToValueAtTime(.001, at + .28);
      osc.start(at); osc.stop(at + .3);
    });
  }

  playBattleResult(won: boolean) {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = won ? [523, 659, 784, 1047, 1319] : [392, 330, 247, 165, 98];
    notes.forEach((freq, index) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const at = now + index * (won ? .085 : .12);
      osc.type = won ? (index % 2 ? 'square' : 'triangle') : 'sawtooth';
      osc.frequency.setValueAtTime(freq, at);
      if (!won) osc.frequency.exponentialRampToValueAtTime(Math.max(45, freq * .58), at + .3);
      gain.gain.setValueAtTime(won ? .12 : .095, at);
      gain.gain.exponentialRampToValueAtTime(.001, at + (won ? .34 : .46));
      osc.connect(gain); gain.connect(this.ctx!.destination);
      osc.start(at); osc.stop(at + (won ? .36 : .48));
    });

    // A low cinematic hit makes both outcomes distinct from the map-level
    // split/devour sound, without interrupting the battle music.
    const hit = this.ctx.createOscillator();
    const hitGain = this.ctx.createGain();
    hit.type = 'sine';
    hit.frequency.setValueAtTime(won ? 110 : 72, now);
    hit.frequency.exponentialRampToValueAtTime(36, now + .65);
    hitGain.gain.setValueAtTime(.2, now);
    hitGain.gain.exponentialRampToValueAtTime(.001, now + .68);
    hit.connect(hitGain); hitGain.connect(this.ctx.destination);
    hit.start(now); hit.stop(now + .7);
  }

  playImpact() {
    this.init(); if (!this.ctx) return;
    const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, this.ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(35, this.ctx.currentTime + .45);
    gain.gain.setValueAtTime(.24, this.ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + .45);
    osc.connect(gain); gain.connect(this.ctx.destination); osc.start(); osc.stop(this.ctx.currentTime + .46);
  }

  playCountdown(number: number) {
    this.init();
    const crowdSize = Math.max(1, 6 - number);
    if (this.ctx) {
      const now = this.ctx.currentTime;
      [110, 165, 220].forEach((freq, index) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = index === 0 ? 'sawtooth' : 'square';
        osc.frequency.setValueAtTime(freq * (1 + (5 - number) * .07), now);
        osc.frequency.exponentialRampToValueAtTime(freq / 2, now + .38);
        gain.gain.setValueAtTime(index === 0 ? .2 : .07, now);
        gain.gain.exponentialRampToValueAtTime(.001, now + .42);
        osc.connect(gain); gain.connect(this.ctx!.destination);
        osc.start(now); osc.stop(now + .43);
      });
      // The browser TTS below provides the clear Japanese leader. Add one
      // independently pitched vocal layer per extra person so the composite
      // crowd grows from one voice on 5 to five voices on 1.
      for (let voice = 1; voice < crowdSize; voice++) {
        const startsAt = now + voice * .018;
        const syllables = number === 4 ? 2 : 1; // 「よん」gets a longer two-part shout.
        for (let syllable = 0; syllable < syllables; syllable++) {
          const osc = this.ctx.createOscillator();
          const formant = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();
          const at = startsAt + syllable * .16;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(112 + voice * 13 + number * 3 + syllable * 8, at);
          osc.frequency.exponentialRampToValueAtTime(82 + voice * 8, at + .26);
          formant.type = 'bandpass';
          formant.frequency.value = 680 + voice * 105 + syllable * 190;
          formant.Q.value = 4.2;
          gain.gain.setValueAtTime(.0001, at);
          gain.gain.linearRampToValueAtTime(.055, at + .035);
          gain.gain.exponentialRampToValueAtTime(.001, at + .3);
          osc.connect(formant); formant.connect(gain); gain.connect(this.ctx.destination);
          osc.start(at); osc.stop(at + .31);
        }
      }
    }

    if ('speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      const token = ++this.countdownSpeechToken;
      if (this.countdownRetryTimer !== null) window.clearTimeout(this.countdownRetryTimer);
      synth.cancel();
      const readings: Record<number, string> = { 5: 'ご', 4: 'よん', 3: 'さん', 2: 'に', 1: 'いち' };
      let attempts = 0;
      const speak = () => {
        if (token !== this.countdownSpeechToken) return;
        attempts += 1;
        const utterance = new SpeechSynthesisUtterance(`${readings[number] || number}！`);
        utterance.lang = 'ja-JP';
        utterance.rate = 1.02 - (crowdSize - 1) * .025;
        utterance.pitch = 1 + (crowdSize - 1) * .025;
        utterance.volume = 1;
        const voices = synth.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('ja'));
        if (voices.length) utterance.voice = voices[(crowdSize - 1) % voices.length];
        let started = false;
        utterance.onstart = () => { started = true; };
        utterance.onerror = () => {
          if (token === this.countdownSpeechToken && attempts < 2) this.countdownRetryTimer = window.setTimeout(speak, 100);
        };
        synth.resume();
        synth.speak(utterance);
        this.countdownRetryTimer = window.setTimeout(() => {
          if (token !== this.countdownSpeechToken || started || synth.speaking) return;
          if (attempts < 2) speak();
        }, 420);
      };
      // Calling speak() in the same task as cancel() is dropped by several
      // Chromium/WebKit builds. Queue it after cancellation has settled.
      this.countdownRetryTimer = window.setTimeout(speak, 55);
    }
  }

  speakQuestion(text: string) {
    if (!('speechSynthesis' in window) || !text) return;
    const synth = window.speechSynthesis;
    const token = ++this.questionSpeechToken;
    if (this.questionRetryTimer !== null) window.clearTimeout(this.questionRetryTimer);
    synth.cancel();
    this.duckBGM(true);

    let attempts = 0;
    const speak = () => {
      if (token !== this.questionSpeechToken) return;
      attempts += 1;
      let started = false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = .88;
      utterance.pitch = 1;
      utterance.volume = 1;
      const japaneseVoices = synth.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('ja'));
      if (japaneseVoices.length) utterance.voice = japaneseVoices[0];
      utterance.onstart = () => {
        started = true;
        if (this.questionRetryTimer !== null) window.clearTimeout(this.questionRetryTimer);
      };
      utterance.onend = () => { if (token === this.questionSpeechToken) this.duckBGM(false); };
      utterance.onerror = () => {
        if (token !== this.questionSpeechToken) return;
        if (this.questionRetryTimer !== null) window.clearTimeout(this.questionRetryTimer);
        if (attempts < 3) {
          this.questionRetryTimer = window.setTimeout(speak, 220);
        } else {
          this.duckBGM(false);
        }
      };
      synth.resume();
      synth.speak(utterance);
      this.questionRetryTimer = window.setTimeout(() => {
        if (token !== this.questionSpeechToken || started || synth.speaking) return;
        synth.cancel();
        if (attempts < 3) speak(); else this.duckBGM(false);
      }, 650);
    };

    // Chromium can drop a speak() issued in the same task as cancel(). A tiny
    // delay also gives Safari time to populate its local Japanese voice list.
    this.questionRetryTimer = window.setTimeout(speak, 60);
  }

  setBGM(phase: string) {
    this.init();
    this.ensureBGM();
    if (this.bgmScene === phase) {
      this.playTrack(phase === 'BATTLE' ? this.battleBgm : phase === 'OFF' ? null : this.mainBgm);
      return;
    }
    const previousScene = this.bgmScene;
    this.bgmScene = phase;
    this.mainBgm?.pause();
    this.battleBgm?.pause();
    if (previousScene === 'BATTLE' && this.battleBgm) this.battleBgm.currentTime = 0;
    if (phase === 'OFF') return;
    this.playTrack(phase === 'BATTLE' ? this.battleBgm : this.mainBgm);
  }

  playOutcome(won: boolean) {
    this.setBGM('OFF');
    this.bgmScene = won ? 'VICTORY' : 'DEFEAT';
    if (won) this.playVictory();
    else {
      this.init(); if (!this.ctx) return;
      [330, 277, 220, 165].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator(); const gain = this.ctx!.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        const at = this.ctx!.currentTime + i * .24;
        gain.gain.setValueAtTime(.08, at); gain.gain.exponentialRampToValueAtTime(.001, at + .35);
        osc.connect(gain); gain.connect(this.ctx!.destination); osc.start(at); osc.stop(at + .36);
      });
    }
  }

  playSplit() {
    this.init(); if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [420, 310, 560, 240].forEach((freq, index) => {
      const osc = this.ctx!.createOscillator(); const gain = this.ctx!.createGain();
      osc.type = index % 2 ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + index * .045);
      osc.frequency.exponentialRampToValueAtTime(freq * .45, now + .38 + index * .045);
      gain.gain.setValueAtTime(.09, now + index * .045); gain.gain.exponentialRampToValueAtTime(.001, now + .42 + index * .045);
      osc.connect(gain); gain.connect(this.ctx!.destination); osc.start(now + index * .045); osc.stop(now + .48 + index * .045);
    });
  }

  playDevour() {
    this.init(); if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [95, 72, 55].forEach((freq, index) => {
      const osc = this.ctx!.createOscillator(); const gain = this.ctx!.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq * 2, now + index * .12); osc.frequency.exponentialRampToValueAtTime(freq, now + .32 + index * .12);
      gain.gain.setValueAtTime(.13, now + index * .12); gain.gain.exponentialRampToValueAtTime(.001, now + .34 + index * .12);
      osc.connect(gain); gain.connect(this.ctx!.destination); osc.start(now + index * .12); osc.stop(now + .38 + index * .12);
    });
  }
}

export const audio = new AudioManager();
