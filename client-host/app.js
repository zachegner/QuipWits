// Host Client Application
const socket = io();

// State
let roomCode = null;
let hostId = null;
let players = [];
let currentTimer = null;
let timerDuration = 0;
let isPaused = false;
let currentGameState = 'LOBBY';
let gameTheme = null;
let aiEnabled = false;
let joinUrl = null;

// DOM Elements
const screens = {
  setup: document.getElementById('setup-screen'),
  lobby: document.getElementById('lobby-screen'),
  prompt: document.getElementById('prompt-screen'),
  voting: document.getElementById('voting-screen'),
  result: document.getElementById('result-screen'),
  scoreboard: document.getElementById('scoreboard-screen'),
  lastLash: document.getElementById('last-lash-screen'),
  lastLashVoting: document.getElementById('last-lash-voting-screen'),
  lastLashResults: document.getElementById('last-lash-results-screen'),
  gameOver: document.getElementById('game-over-screen')
};

// Screen management
function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[screenName]) {
    screens[screenName].classList.add('active');
  }
}

// QR Code Generation
function generateQRCode(url) {
  const container = document.getElementById('qr-code');
  if (!container || !url) return;
  
  // Clear existing QR code
  container.innerHTML = '';
  
  // Use Google Charts API for reliable QR code generation (works offline too after first load)
  // Alternative: use qrserver.com API
  const encodedUrl = encodeURIComponent(url);
  const qrSize = 180;
  
  // Try multiple QR code services for reliability
  const img = document.createElement('img');
  img.width = qrSize;
  img.height = qrSize;
  img.alt = 'Scan to join';
  img.style.display = 'block';
  
  // Use qrserver.com (reliable and free)
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodedUrl}&bgcolor=ffffff&color=000000&margin=0`;
  
  img.onerror = () => {
    // Fallback: try Google Charts API
    img.src = `https://chart.googleapis.com/chart?cht=qr&chs=${qrSize}x${qrSize}&chl=${encodedUrl}&choe=UTF-8`;
    
    img.onerror = () => {
      // Final fallback: show text
      container.innerHTML = `<p style="color: #666; font-size: 0.7rem; padding: 1rem;">QR unavailable<br>Type URL manually</p>`;
    };
  };
  
  container.appendChild(img);
}

// Fetch network info and set the best join URL
async function setupJoinUrl() {
  try {
    const response = await fetch('/api/network');
    const data = await response.json();
    
    // Prefer LAN IP over localhost for players on other devices
    if (data.addresses && data.addresses.length > 0) {
      const lanAddress = data.addresses[0].address;
      joinUrl = `http://${lanAddress}:${data.port}/play`;
    } else {
      joinUrl = `${window.location.origin}/play`;
    }
  } catch (error) {
    console.error('Failed to fetch network info:', error);
    joinUrl = `${window.location.origin}/play`;
  }
  
  // Update URL displays
  const joinUrlEl = document.getElementById('join-url');
  const setupJoinUrlEl = document.getElementById('setup-join-url');
  if (joinUrlEl) joinUrlEl.textContent = joinUrl;
  if (setupJoinUrlEl) setupJoinUrlEl.textContent = joinUrl;
  
  // Generate QR code
  generateQRCode(joinUrl);
  
  return joinUrl;
}

// API Key Management
async function checkApiKeyStatus() {
  try {
    const response = await fetch('/api/config/status');
    const data = await response.json();
    updateApiStatusUI(data.hasApiKey);
    return data.hasApiKey;
  } catch (error) {
    console.error('Error checking API status:', error);
    updateApiStatusUI(false);
    return false;
  }
}

function updateApiStatusUI(hasKey) {
  aiEnabled = hasKey;
  
  // Update setup screen status
  const statusEl = document.getElementById('api-key-status');
  const iconEl = document.getElementById('api-status-icon');
  const textEl = document.getElementById('api-status-text');
  
  if (statusEl && iconEl && textEl) {
    if (hasKey) {
      statusEl.classList.add('configured');
      iconEl.textContent = '✅';
      textEl.textContent = 'API key configured - AI prompts enabled!';
    } else {
      statusEl.classList.remove('configured');
      iconEl.textContent = '❌';
      textEl.textContent = 'No API key - using pre-made prompts';
    }
  }
  
  // Update lobby AI badge
  const lobbyBadge = document.getElementById('lobby-ai-status');
  const lobbyText = document.getElementById('lobby-ai-text');
  
  if (lobbyBadge && lobbyText) {
    if (hasKey) {
      lobbyBadge.classList.add('enabled');
      lobbyText.textContent = 'AI Enabled';
    } else {
      lobbyBadge.classList.remove('enabled');
      lobbyText.textContent = 'AI Disabled';
    }
  }
}

async function saveApiKey() {
  const input = document.getElementById('api-key-input');
  const saveCheckbox = document.getElementById('save-api-key');
  const apiKey = input?.value?.trim();
  
  if (!apiKey) {
    alert('Please enter an API key');
    return;
  }
  
  if (!apiKey.startsWith('sk-ant-')) {
    alert('Invalid API key format. Anthropic keys start with "sk-ant-"');
    return;
  }
  
  try {
    const response = await fetch('/api/config/apikey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        apiKey, 
        persist: saveCheckbox?.checked ?? true 
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      input.value = '';
      updateApiStatusUI(true);
      alert('API key saved successfully!');
    } else {
      alert('Failed to save API key: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error saving API key:', error);
    alert('Failed to save API key');
  }
}

async function testApiKey() {
  const input = document.getElementById('api-key-input');
  const apiKey = input?.value?.trim();
  
  // Use entered key if available, otherwise test saved key
  const keyToTest = apiKey || null;
  
  try {
    const response = await fetch('/api/config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: keyToTest })
    });
    
    const data = await response.json();
    
    if (data.valid) {
      alert('✅ API key is valid!');
    } else {
      alert('❌ API key test failed: ' + (data.error || 'Invalid key'));
    }
  } catch (error) {
    console.error('Error testing API key:', error);
    alert('Failed to test API key');
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

// Session persistence helpers
function saveSession() {
  if (roomCode && hostId) {
    sessionStorage.setItem('roomCode', roomCode);
    sessionStorage.setItem('hostId', hostId);
  }
}

function loadSession() {
  return {
    roomCode: sessionStorage.getItem('roomCode'),
    hostId: sessionStorage.getItem('hostId')
  };
}

function clearSession() {
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('hostId');
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize sound effects
  if (window.SoundManager) {
    SoundManager.init();
    
    // Setup sound controls
    const soundToggle = document.getElementById('sound-toggle');
    const musicToggle = document.getElementById('music-toggle');
    const volumeSlider = document.getElementById('volume-slider');
    
    if (soundToggle) {
      soundToggle.textContent = SoundManager.enabled ? '🔊' : '🔇';
      soundToggle.addEventListener('click', () => {
        const enabled = SoundManager.toggle();
        soundToggle.textContent = enabled ? '🔊' : '🔇';
      });
    }
    
    if (musicToggle) {
      musicToggle.textContent = SoundManager.musicEnabled ? '🎵' : '🎵';
      musicToggle.style.opacity = SoundManager.musicEnabled ? '1' : '0.5';
      musicToggle.addEventListener('click', () => {
        const enabled = SoundManager.toggleMusic();
        musicToggle.style.opacity = enabled ? '1' : '0.5';
      });
    }
    
    if (volumeSlider) {
      volumeSlider.value = SoundManager.volume * 100;
      volumeSlider.addEventListener('input', (e) => {
        const vol = e.target.value / 100;
        SoundManager.setVolume(vol);
        SoundManager.setMusicVolume(vol * 0.6); // Music slightly quieter
      });
    }
    
    // Start lobby music on first user interaction (required by browsers)
    const startMusicOnInteraction = () => {
      SoundManager.playMusic();
      document.removeEventListener('click', startMusicOnInteraction);
      document.removeEventListener('keydown', startMusicOnInteraction);
    };
    document.addEventListener('click', startMusicOnInteraction);
    document.addEventListener('keydown', startMusicOnInteraction);
  }
  
  // Setup join URL with network detection and QR code
  await setupJoinUrl();
  
  // Check for existing session
  const savedSession = loadSession();
  
  // Check API key status first
  const hasApiKey = await checkApiKeyStatus();
  
  // If first time (no session), show setup screen
  // If returning to an existing session, skip setup
  if (savedSession.roomCode && savedSession.hostId) {
    // Try to rejoin existing room
    console.log('Attempting to rejoin room:', savedSession.roomCode);
    socket.emit('rejoin_host', { 
      roomCode: savedSession.roomCode, 
      hostId: savedSession.hostId 
    });
    showScreen('lobby'); // Will be updated by rejoin_host_success
  } else {
    // Show setup screen for new sessions (or lobby if API key already configured)
    showScreen('setup');
  }
  
  // Setup screen event listeners
  document.getElementById('save-api-btn')?.addEventListener('click', saveApiKey);
  document.getElementById('test-api-btn')?.addEventListener('click', testApiKey);
  document.getElementById('toggle-api-key')?.addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('continue-to-lobby-btn')?.addEventListener('click', () => {
    // Create room and go to lobby
    socket.emit('create_room', {});
    showScreen('lobby');
  });
  
  // Lobby event listeners
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('new-game-btn').addEventListener('click', () => {
    window.location.reload();
  });
  
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    showScreen('setup');
  });
  
  document.getElementById('pause-btn')?.addEventListener('click', () => {
    if (isPaused) {
      socket.emit('resume_game', { roomCode });
    } else {
      socket.emit('pause_game', { roomCode });
    }
  });
  
  // Click on pause overlay to resume
  document.getElementById('pause-overlay')?.addEventListener('click', () => {
    if (isPaused) {
      socket.emit('resume_game', { roomCode });
    }
  });
});

// Socket event handlers
socket.on('room_created', (data) => {
  roomCode = data.roomCode;
  hostId = data.hostId;
  document.getElementById('room-code').textContent = roomCode;
  saveSession();
  console.log('Room created:', roomCode);
});

// Handle successful host rejoin
socket.on('rejoin_host_success', (data) => {
  roomCode = data.roomCode;
  hostId = data.hostId;
  players = data.players || [];
  currentGameState = data.state;
  isPaused = data.isPaused || false;
  
  document.getElementById('room-code').textContent = roomCode;
  saveSession();
  
  // Restore UI based on game state
  updatePlayerList();
  updateStartButton();
  
  // Show appropriate screen based on state
  switch (data.state) {
    case 'LOBBY':
      showScreen('lobby');
      break;
    case 'PROMPT':
      showScreen('prompt');
      document.getElementById('current-round').textContent = data.currentRound;
      break;
    case 'VOTING':
      showScreen('voting');
      document.getElementById('matchup-num').textContent = data.currentMatchupIndex + 1;
      document.getElementById('total-matchups').textContent = data.totalMatchups;
      break;
    case 'SCORING':
      showScreen('scoreboard');
      break;
    case 'LAST_LASH':
      showScreen('lastLash');
      break;
    case 'LAST_LASH_VOTING':
      showScreen('lastLashVoting');
      break;
    case 'GAME_OVER':
      showScreen('gameOver');
      break;
    default:
      showScreen('lobby');
  }
  
  // Restore timer display from server state
  if (data.timerEndTime && !data.isPaused) {
    // Calculate remaining time from server's timerEndTime
    const remaining = Math.max(0, Math.ceil((data.timerEndTime - Date.now()) / 1000));
    updateTimer(remaining);
  } else if (data.isPaused && data.remainingTimeOnPause !== undefined) {
    // Show frozen timer value when paused
    updateTimer(data.remainingTimeOnPause);
    document.getElementById('pause-overlay').classList.add('active');
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = 'RESUME';
      pauseBtn.classList.add('paused');
    }
  }
  
  console.log('Rejoined room:', roomCode, 'State:', data.state);
});

// Handle rejoin failure
socket.on('error', (data) => {
  console.error('Error:', data.message);
  
  // If room not found or invalid host, clear session and create new room
  if (data.code === 'ROOM_NOT_FOUND' || data.code === 'INVALID_HOST') {
    clearSession();
    socket.emit('create_room', {});
  } else {
    alert(data.message);
  }
});

socket.on('room_update', (data) => {
  const previousCount = players.length;
  players = data.players;
  updatePlayerList();
  updateStartButton();
  
  // Play sound when new player joins
  if (players.length > previousCount && window.SoundManager) {
    SoundManager.play('playerJoin');
  }
});

socket.on('game_started', (data) => {
  console.log('Game started with', data.playerCount, 'players');
  gameTheme = data.theme || null;
  updateThemeDisplays();
  
  // Fade out lobby music and play game start sound
  if (window.SoundManager) {
    SoundManager.fadeOutMusic(1500);
    setTimeout(() => SoundManager.play('gameStart'), 500);
  }
});

socket.on('prompt_phase', (data) => {
  showScreen('prompt');
  document.getElementById('current-round').textContent = data.round;
  
  // Reset submission list
  const submissionList = document.getElementById('submission-list');
  submissionList.innerHTML = players.map(p => 
    `<div class="submission-item pending" id="submit-${p.id}">${p.name}: 0/${2}</div>`
  ).join('');
});

socket.on('timer_update', (data) => {
  updateTimer(data.remaining);
  
  // Play countdown tick for last 5 seconds
  if (data.remaining <= 5 && data.remaining > 0 && window.SoundManager) {
    SoundManager.play('tick');
  }
  
  // Play buzzer when time runs out
  if (data.remaining === 0 && window.SoundManager) {
    SoundManager.play('buzzer');
  }
});

socket.on('player_submitted', (data) => {
  if (data.playerId) {
    const el = document.getElementById(`submit-${data.playerId}`);
    if (el) {
      el.textContent = `${data.playerName}: ${data.submitted}/${data.total}`;
      if (data.submitted >= data.total) {
        el.classList.remove('pending');
      }
    }
    
    // Last Wit submission
    if (data.isLastLash) {
      const list = document.getElementById('last-lash-submissions');
      if (list) {
        const existing = document.getElementById(`ll-submit-${data.playerId}`);
        if (!existing) {
          list.innerHTML += `<div class="submission-item" id="ll-submit-${data.playerId}">${data.playerName} ✓</div>`;
        }
      }
    }
  }
});

socket.on('voting_phase', (data) => {
  showScreen('voting');
  document.getElementById('total-matchups').textContent = data.totalMatchups;
});

socket.on('vote_matchup', (data) => {
  showScreen('voting');
  document.getElementById('matchup-num').textContent = data.matchupIndex + 1;
  document.getElementById('total-matchups').textContent = data.totalMatchups;
  document.getElementById('vote-prompt-text').textContent = data.promptText;
  document.getElementById('answer-1-text').textContent = data.answer1;
  document.getElementById('answer-2-text').textContent = data.answer2;
  document.getElementById('vote-count-1').textContent = '0';
  document.getElementById('vote-count-2').textContent = '0';
  
  // Play whoosh sound for new matchup
  if (window.SoundManager) {
    SoundManager.play('whoosh');
  }
});

socket.on('player_voted', (data) => {
  // Could show voting progress here
  console.log(`${data.playerName} voted`);
});

socket.on('matchup_result', (data) => {
  showScreen('result');
  
  document.getElementById('result-prompt-text').textContent = data.prompt;
  
  const resultsContainer = document.getElementById('result-answers');
  const jinxDisplay = document.getElementById('jinx-display');
  const quipwitDisplay = document.getElementById('quipwit-display');
  
  jinxDisplay.style.display = 'none';
  quipwitDisplay.style.display = 'none';
  
  if (data.isJinx) {
    jinxDisplay.style.display = 'block';
    resultsContainer.innerHTML = `
      <div class="result-answer">
        <div class="player-name">${data.player1Name} & ${data.player2Name}</div>
        <div class="answer">"${data.answer}"</div>
        <div class="points">JINX! 0 points each</div>
      </div>
    `;
    
    // Play jinx sound
    if (window.SoundManager) {
      SoundManager.play('jinx');
    }
  } else {
    const winner1 = data.player1Votes > data.player2Votes;
    const winner2 = data.player2Votes > data.player1Votes;
    
    resultsContainer.innerHTML = `
      <div class="result-answer ${winner1 ? 'winner' : ''}">
        <div class="player-name">${data.player1Name}</div>
        <div class="answer">"${data.answer1}"</div>
        <div class="votes">${data.player1Votes} votes</div>
        <div class="points">+${data.player1Score} pts</div>
      </div>
      <div class="result-answer ${winner2 ? 'winner' : ''}">
        <div class="player-name">${data.player2Name}</div>
        <div class="answer">"${data.answer2}"</div>
        <div class="votes">${data.player2Votes} votes</div>
        <div class="points">+${data.player2Score} pts</div>
      </div>
    `;
    
    if (data.quipwit) {
      quipwitDisplay.style.display = 'block';
      // Play quipwit sound
      if (window.SoundManager) {
        SoundManager.play('quipwit');
      }
    } else {
      // Play normal result sound
      if (window.SoundManager) {
        SoundManager.play('ding');
      }
    }
  }
});

socket.on('round_scores', (data) => {
  showScreen('scoreboard');
  document.getElementById('score-round').textContent = data.round;
  
  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = data.scoreboard.map((player, index) => `
    <div class="score-row" style="animation-delay: ${index * 0.1}s">
      <div class="score-rank">#${index + 1}</div>
      <div class="score-name">${player.name}</div>
      <div class="score-points">${player.score}</div>
    </div>
  `).join('');
  
  // Play round end sound
  if (window.SoundManager) {
    SoundManager.play('roundEnd');
  }
});

socket.on('last_lash_phase', (data) => {
  showScreen('lastLash');
  document.getElementById('last-lash-prompt').textContent = data.prompt;
  document.getElementById('last-lash-submissions').innerHTML = '';
  
  // Play dramatic fanfare for Last Wit
  if (window.SoundManager) {
    SoundManager.play('fanfare');
  }
});

socket.on('last_lash_voting', (data) => {
  showScreen('lastLashVoting');
  document.getElementById('ll-vote-prompt').textContent = data.prompt;
  
  const answersContainer = document.getElementById('ll-answers');
  answersContainer.innerHTML = data.answers.map((a, i) => `
    <div class="ll-answer-card">
      <p>"${a.answer}"</p>
    </div>
  `).join('');
});

socket.on('last_lash_results', (data) => {
  showScreen('lastLashResults');
  
  const resultsContainer = document.getElementById('ll-results');
  resultsContainer.innerHTML = data.answers.map((a, index) => `
    <div class="ll-result-row" style="animation-delay: ${index * 0.2}s">
      <div class="ll-result-rank">${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}</div>
      <div class="ll-result-content">
        <div class="ll-result-answer">"${a.answer}"</div>
        <div class="ll-result-player">- ${a.playerName}</div>
      </div>
      <div class="ll-result-points">+${a.points}</div>
    </div>
  `).join('');
});

socket.on('game_over', (data) => {
  showScreen('gameOver');
  
  // Play victory sound
  if (window.SoundManager) {
    SoundManager.play('victory');
  }
  
  if (data.winners && data.winners.length > 0) {
    const winnerNames = data.winners.map(w => w.name).join(' & ');
    document.getElementById('winner-name').textContent = winnerNames;
    document.getElementById('winner-score').textContent = `${data.winners[0].score} points`;
  }
  
  const scoreboard = document.getElementById('final-scoreboard');
  scoreboard.innerHTML = data.scoreboard.map((player, index) => `
    <div class="score-row" style="animation-delay: ${index * 0.1}s">
      <div class="score-rank">#${index + 1}</div>
      <div class="score-name">${player.name}</div>
      <div class="score-points">${player.score}</div>
    </div>
  `).join('');
  
  if (data.reason) {
    document.getElementById('winner-name').textContent = data.reason;
    document.getElementById('winner-score').textContent = '';
  }
  
  // Clear session on game over so new game button creates fresh room
  clearSession();
});

socket.on('game_paused', (data) => {
  isPaused = true;
  document.getElementById('pause-overlay').classList.add('active');
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    pauseBtn.textContent = 'RESUME';
    pauseBtn.classList.add('paused');
  }
  // Display frozen timer value
  if (data && data.remainingTime !== undefined) {
    updateTimer(data.remainingTime);
  }
  console.log('Game paused with', data?.remainingTime, 'seconds remaining');
});

socket.on('game_resumed', () => {
  isPaused = false;
  document.getElementById('pause-overlay').classList.remove('active');
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) {
    pauseBtn.textContent = 'PAUSE';
    pauseBtn.classList.remove('paused');
  }
  console.log('Game resumed');
});

// Helper functions
function updatePlayerList() {
  const list = document.getElementById('player-list');
  if (players.length === 0) {
    list.innerHTML = '<p class="waiting-text">Waiting for players...</p>';
  } else {
    list.innerHTML = players.map(p => 
      `<div class="player-tag ${p.isConnected ? '' : 'disconnected'}">${p.name}</div>`
    ).join('');
  }
  document.getElementById('player-count').textContent = players.length;
}

function updateStartButton() {
  const btn = document.getElementById('start-btn');
  if (players.length >= 3) {
    btn.disabled = false;
    btn.textContent = 'START GAME';
  } else {
    btn.disabled = true;
    btn.textContent = `NEED ${3 - players.length} MORE PLAYER${players.length === 2 ? '' : 'S'}`;
  }
}

function startGame() {
  const themeInput = document.getElementById('theme-input');
  const theme = themeInput?.value?.trim() || null;
  socket.emit('start_game', { roomCode, theme });
}

function updateThemeDisplays() {
  const themeDisplays = document.querySelectorAll('.theme-display');
  themeDisplays.forEach(el => {
    if (gameTheme) {
      el.textContent = `Theme: ${gameTheme}`;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  });
}

function updateTimer(remaining) {
  // Update all timer displays
  const timerTexts = document.querySelectorAll('.timer-text');
  const timerFills = document.querySelectorAll('.timer-fill');
  
  timerTexts.forEach(el => {
    el.textContent = remaining;
    if (remaining <= 10) {
      el.style.color = '#ff4444';
    } else {
      el.style.color = '';
    }
  });
  
  // Update timer bar (need to know total duration for percentage)
  // For now, assume standard durations based on screen
  let duration = 60; // default
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    if (activeScreen.id === 'voting-screen') duration = 30;
    else if (activeScreen.id === 'last-lash-screen') duration = 90;
    else if (activeScreen.id === 'last-lash-voting-screen') duration = 45;
  }
  
  const percentage = (remaining / duration) * 100;
  timerFills.forEach(el => {
    el.style.width = `${percentage}%`;
  });
}
