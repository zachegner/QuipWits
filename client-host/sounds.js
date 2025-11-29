// Sound Effects Manager for Host Screen
const SoundManager = {
  sounds: {},
  music: null,
  musicEnabled: true,
  enabled: true,
  volume: 0.5,
  musicVolume: 0.3,

  // Initialize sounds - call this once on page load
  init() {
    // Define your sound effects here
    // You can use local files or URLs to free sound effects
    this.register('tick', 'sounds/tick.mp3');
    this.register('buzzer', 'sounds/buzzer.mp3');
    this.register('ding', 'sounds/ding.mp3');
    this.register('fanfare', 'sounds/fanfare.mp3');
    this.register('whoosh', 'sounds/whoosh.mp3');
    this.register('pop', 'sounds/pop.mp3');
    this.register('countdown', 'sounds/countdown.mp3');
    this.register('quipwit', 'sounds/quipwit.mp3');
    this.register('jinx', 'sounds/jinx.mp3');
    this.register('vote', 'sounds/vote.mp3');
    this.register('playerJoin', 'sounds/player-join.mp3');
    this.register('gameStart', 'sounds/game-start.mp3');
    this.register('roundEnd', 'sounds/round-end.mp3');
    this.register('victory', 'sounds/victory.mp3');
    this.register('modeSpinTick', 'sounds/mode-spin-tick.mp3');
    this.register('modeSelected', 'sounds/mode-selected.mp3');
    
    // Load saved preferences
    const savedEnabled = localStorage.getItem('soundEnabled');
    const savedVolume = localStorage.getItem('soundVolume');
    const savedMusicEnabled = localStorage.getItem('musicEnabled');
    const savedMusicVolume = localStorage.getItem('musicVolume');
    if (savedEnabled !== null) this.enabled = savedEnabled === 'true';
    if (savedVolume !== null) this.volume = parseFloat(savedVolume);
    if (savedMusicEnabled !== null) this.musicEnabled = savedMusicEnabled === 'true';
    if (savedMusicVolume !== null) this.musicVolume = parseFloat(savedMusicVolume);
    
    // Initialize background music
    this.music = new Audio('sounds/lobby-music.mp3');
    this.music.loop = true;
    this.music.volume = this.musicVolume;
  },

  // Register a sound effect
  register(name, src) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = this.volume;
    this.sounds[name] = audio;
  },

  // Play a sound effect
  play(name) {
    if (!this.enabled) return;
    
    const sound = this.sounds[name];
    if (sound) {
      // Clone the audio to allow overlapping sounds
      const clone = sound.cloneNode();
      clone.volume = this.volume;
      clone.play().catch(err => {
        // Ignore autoplay errors (user hasn't interacted yet)
        console.log('Sound play blocked:', err.message);
      });
    } else {
      console.warn(`Sound "${name}" not found`);
    }
  },

  // Set master volume (0-1)
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    Object.values(this.sounds).forEach(sound => {
      sound.volume = this.volume;
    });
    localStorage.setItem('soundVolume', this.volume);
  },

  // Toggle sound on/off
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('soundEnabled', this.enabled);
    return this.enabled;
  },

  // Enable/disable
  setEnabled(enabled) {
    this.enabled = enabled;
    localStorage.setItem('soundEnabled', this.enabled);
  },

  // Background music controls
  playMusic() {
    if (!this.musicEnabled || !this.music) return;
    this.music.play().catch(err => {
      console.log('Music play blocked:', err.message);
    });
  },

  stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
    }
  },

  pauseMusic() {
    if (this.music) {
      this.music.pause();
    }
  },

  resumeMusic() {
    if (this.musicEnabled && this.music) {
      this.music.play().catch(err => {
        console.log('Music play blocked:', err.message);
      });
    }
  },

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    localStorage.setItem('musicEnabled', this.musicEnabled);
    if (this.musicEnabled) {
      this.playMusic();
    } else {
      this.pauseMusic();
    }
    return this.musicEnabled;
  },

  setMusicVolume(vol) {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.music) {
      this.music.volume = this.musicVolume;
    }
    localStorage.setItem('musicVolume', this.musicVolume);
  },

  // Fade out music (useful for transitions)
  fadeOutMusic(duration = 1000) {
    if (!this.music) return;
    const startVolume = this.music.volume;
    const steps = 20;
    const stepTime = duration / steps;
    const volumeStep = startVolume / steps;
    
    let step = 0;
    const fadeInterval = setInterval(() => {
      step++;
      this.music.volume = Math.max(0, startVolume - (volumeStep * step));
      if (step >= steps) {
        clearInterval(fadeInterval);
        this.music.pause();
        this.music.volume = this.musicVolume; // Reset for next play
      }
    }, stepTime);
  }
};

// Export for use in app.js
window.SoundManager = SoundManager;
