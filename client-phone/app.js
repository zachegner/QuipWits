// Phone Client Application
const socket = io();

// State
let playerId = sessionStorage.getItem('playerId');
let roomCode = sessionStorage.getItem('roomCode');
let playerName = sessionStorage.getItem('playerName');
let currentPrompts = [];
let currentPromptIndex = 0;
let currentMatchup = null;
let lastLashVotes = [];
let lastWitMode = null;
let lastWitLetters = null;

// DOM Elements
const screens = {
  join: document.getElementById('join-screen'),
  lobby: document.getElementById('lobby-screen'),
  answer: document.getElementById('answer-screen'),
  waiting: document.getElementById('waiting-screen'),
  voting: document.getElementById('voting-screen'),
  voteSubmitted: document.getElementById('vote-submitted-screen'),
  lastLash: document.getElementById('last-lash-screen'),
  lastLashVoting: document.getElementById('last-lash-voting-screen'),
  gameOver: document.getElementById('game-over-screen'),
  kicked: document.getElementById('kicked-screen')
};

// Screen management
function showScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[screenName]) {
    screens[screenName].classList.add('active');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Check for reconnection
  if (playerId && roomCode) {
    socket.emit('rejoin', { playerId, roomCode });
  }
  
  // Event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Join button
  document.getElementById('join-btn').addEventListener('click', joinGame);
  
  // Allow Enter key to submit
  document.getElementById('room-code-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('name-input').focus();
    }
  });
  
  document.getElementById('name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
  });
  
  // Auto-uppercase room code
  document.getElementById('room-code-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
  
  // Answer submission
  document.getElementById('submit-answer-btn').addEventListener('click', submitAnswer);
  
  // Character counter
  document.getElementById('answer-input').addEventListener('input', (e) => {
    document.getElementById('char-count').textContent = e.target.value.length;
  });
  
  // Voting buttons
  document.getElementById('vote-a-btn').addEventListener('click', () => submitVote(1));
  document.getElementById('vote-b-btn').addEventListener('click', () => submitVote(2));
  
  // Last Wit answer
  document.getElementById('ll-submit-btn').addEventListener('click', submitLastLashAnswer);
  document.getElementById('ll-answer-input').addEventListener('input', (e) => {
    document.getElementById('ll-char-count').textContent = e.target.value.length;
  });
  
  // Last Wit voting submit
  document.getElementById('ll-vote-submit-btn').addEventListener('click', submitLastLashVotes);
  
  // Play again / rejoin buttons
  document.getElementById('play-again-btn').addEventListener('click', resetAndJoin);
  document.getElementById('rejoin-btn').addEventListener('click', resetAndJoin);
}

// Game functions
function joinGame() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  const name = document.getElementById('name-input').value.trim();
  
  console.log('joinGame called with:', { code, name });
  
  // Validation
  if (code.length !== 4) {
    showError('Room code must be 4 letters');
    return;
  }
  
  if (name.length < 1) {
    showError('Please enter your name');
    return;
  }
  
  if (name.length > 15) {
    showError('Name too long (max 15 characters)');
    return;
  }
  
  showError(''); // Clear error
  
  console.log('Socket connected:', socket.connected);
  console.log('Emitting join_room event...');
  socket.emit('join_room', { roomCode: code, playerName: name });
}

function submitAnswer() {
  const answer = document.getElementById('answer-input').value.trim();
  const prompt = currentPrompts[currentPromptIndex];
  
  if (!prompt) return;
  
  // Show immediate visual feedback
  const btn = document.getElementById('submit-answer-btn');
  btn.disabled = true;
  btn.textContent = 'SUBMITTING...';
  
  socket.emit('submit_answer', {
    roomCode,
    promptId: prompt.id,
    answer
  });
}

function submitVote(choice) {
  if (!currentMatchup) return;
  
  // Add immediate visual feedback
  const btnA = document.getElementById('vote-a-btn');
  const btnB = document.getElementById('vote-b-btn');
  
  // Disable both buttons to prevent double-voting
  btnA.disabled = true;
  btnB.disabled = true;
  
  // Show selected state on clicked button (use class, don't replace content)
  if (choice === 1) {
    btnA.classList.add('selected');
  } else {
    btnB.classList.add('selected');
  }
  
  socket.emit('submit_vote', {
    roomCode,
    promptId: currentMatchup.promptId,
    vote: choice
  });
}

function submitLastLashAnswer() {
  const answer = document.getElementById('ll-answer-input').value.trim();
  
  // Show immediate visual feedback
  const btn = document.getElementById('ll-submit-btn');
  btn.disabled = true;
  btn.textContent = 'SUBMITTING...';
  
  socket.emit('submit_answer', {
    roomCode,
    answer,
    isLastLash: true
  });
}

function submitLastLashVotes() {
  if (lastLashVotes.length < requiredVotes) return;
  
  // Show visual feedback
  const btn = document.getElementById('ll-vote-submit-btn');
  btn.disabled = true;
  btn.textContent = 'SUBMITTING...';
  
  socket.emit('submit_last_lash_votes', {
    roomCode,
    votes: lastLashVotes
  });
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
}

function resetAndJoin() {
  sessionStorage.clear();
  playerId = null;
  roomCode = null;
  playerName = null;
  currentPrompts = [];
  currentPromptIndex = 0;
  lastLashVotes = [];
  
  document.getElementById('room-code-input').value = '';
  document.getElementById('name-input').value = '';
  
  showScreen('join');
}

function updateTimer(remaining, elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = remaining;
    if (remaining <= 10) {
      el.classList.add('warning');
    } else {
      el.classList.remove('warning');
    }
  }
}

function showNextPrompt() {
  if (currentPromptIndex >= currentPrompts.length) {
    showScreen('waiting');
    return;
  }
  
  const prompt = currentPrompts[currentPromptIndex];
  document.getElementById('current-prompt').textContent = prompt.text;
  document.getElementById('prompt-current').textContent = currentPromptIndex + 1;
  document.getElementById('prompt-total').textContent = currentPrompts.length;
  document.getElementById('answer-input').value = '';
  document.getElementById('char-count').textContent = '0';
  
  // Reset submit button state
  const btn = document.getElementById('submit-answer-btn');
  btn.disabled = false;
  btn.textContent = 'SUBMIT';
  
  showScreen('answer');
}

// Socket event handlers
socket.on('room_joined', (data) => {
  console.log('room_joined event received:', data);
  playerId = data.playerId;
  roomCode = data.roomCode;
  playerName = data.playerName;
  
  // Save to sessionStorage for reconnection
  sessionStorage.setItem('playerId', playerId);
  sessionStorage.setItem('roomCode', roomCode);
  sessionStorage.setItem('playerName', playerName);
  
  document.getElementById('display-name').textContent = playerName;
  document.getElementById('display-room').textContent = roomCode;
  
  showScreen('lobby');
});

socket.on('rejoin_success', (data) => {
  playerId = data.playerId;
  roomCode = data.roomCode;
  playerName = data.playerName;
  
  document.getElementById('display-name').textContent = playerName;
  document.getElementById('display-room').textContent = roomCode;
  
  // Handle current game state
  if (data.gameState === 'LOBBY') {
    showScreen('lobby');
  } else {
    showScreen('waiting');
  }
});

socket.on('game_started', () => {
  // Game is starting - wait for prompts
  showScreen('waiting');
});

socket.on('receive_prompts', (data) => {
  currentPrompts = data.prompts;
  currentPromptIndex = 0;
  showNextPrompt();
});

socket.on('player_submitted', (data) => {
  if (data.isLastLash) {
    showScreen('waiting');
  } else if (data.promptId) {
    // Regular prompt submitted
    currentPromptIndex++;
    showNextPrompt();
  }
});

socket.on('voting_phase', () => {
  showScreen('waiting');
});

socket.on('vote_matchup', (data) => {
  currentMatchup = data;
  
  document.getElementById('vote-prompt').textContent = data.promptText;
  document.getElementById('vote-answer-a').textContent = data.answer1;
  document.getElementById('vote-answer-b').textContent = data.answer2;
  
  // Reset button states completely for new matchup
  const btnA = document.getElementById('vote-a-btn');
  const btnB = document.getElementById('vote-b-btn');
  btnA.classList.remove('selected');
  btnB.classList.remove('selected');
  btnA.disabled = false;
  btnB.disabled = false;
  
  // Check if this is the player's own matchup
  const isOwnMatchup = (data.player1Id === playerId || data.player2Id === playerId);
  
  if (isOwnMatchup) {
    // Hide voting buttons and show message
    document.getElementById('cannot-vote').style.display = 'block';
    document.querySelector('.vote-buttons').style.display = 'none';
  } else {
    // Show voting buttons
    document.getElementById('cannot-vote').style.display = 'none';
    document.querySelector('.vote-buttons').style.display = 'flex';
  }
  
  showScreen('voting');
});

socket.on('player_voted', (data) => {
  if (data.isLastLash) {
    showScreen('waiting');
  } else {
    showScreen('voteSubmitted');
  }
});

socket.on('vote_failed', (data) => {
  // Re-enable voting buttons on failure
  const btnA = document.getElementById('vote-a-btn');
  const btnB = document.getElementById('vote-b-btn');
  btnA.classList.remove('selected');
  btnB.classList.remove('selected');
  btnA.disabled = false;
  btnB.disabled = false;
  
  // Show error if it's not about own matchup (expected failure)
  if (data.error && !data.error.includes('own matchup')) {
    showError(data.error);
  }
});

socket.on('matchup_result', () => {
  // Result is showing on host screen
  // Show waiting screen for all players (not "voted" since some didn't vote)
  showScreen('waiting');
});

socket.on('round_scores', () => {
  // Scores showing on host screen
  showScreen('waiting');
});

// Last Wit mode reveal - show watching message
socket.on('last_wit_mode_reveal', () => {
  showScreen('waiting');
  const waitingText = document.querySelector('#waiting-screen .screen-title');
  const waitingSubtext = document.querySelector('#waiting-screen .waiting-text');
  
  if (waitingText) {
    waitingText.textContent = 'THE LAST WIT!';
  }
  if (waitingSubtext) {
    waitingSubtext.textContent = 'Watch the screen for your challenge...';
  }
});

socket.on('last_lash_phase', () => {
  // Wait for prompt
});

socket.on('last_lash_prompt', (data) => {
  // Store mode info
  lastWitMode = data.mode || 'FLASHBACK';
  lastWitLetters = data.letters || null;
  
  // Update title based on mode
  const titleEl = document.getElementById('ll-mode-title');
  const instructionsEl = document.getElementById('ll-instructions');
  const promptEl = document.getElementById('ll-prompt');
  const placeholderText = document.getElementById('ll-answer-input');
  
  if (titleEl) {
    switch (lastWitMode) {
      case 'FLASHBACK':
        titleEl.textContent = 'FLASHBACK LASH';
        titleEl.className = 'screen-title last-lash mode-flashback';
        break;
      case 'WORD_LASH':
        titleEl.textContent = 'WORD LASH';
        titleEl.className = 'screen-title last-lash mode-word';
        break;
      case 'ACRO_LASH':
        titleEl.textContent = 'ACRO LASH';
        titleEl.className = 'screen-title last-lash mode-acro';
        break;
      default:
        titleEl.textContent = 'THE LAST WIT';
        titleEl.className = 'screen-title last-lash';
    }
  }
  
  // Set mode-specific instructions
  if (instructionsEl) {
    switch (lastWitMode) {
      case 'FLASHBACK':
        instructionsEl.textContent = 'Complete the story!';
        break;
      case 'WORD_LASH':
        instructionsEl.textContent = 'Create a phrase where each word starts with these letters';
        break;
      case 'ACRO_LASH':
        instructionsEl.textContent = 'What does this acronym stand for?';
        break;
      default:
        instructionsEl.textContent = 'Make it your best!';
    }
    instructionsEl.style.display = 'block';
  }
  
  // Set placeholder text based on mode
  if (placeholderText) {
    switch (lastWitMode) {
      case 'FLASHBACK':
        placeholderText.placeholder = 'What happens next...';
        break;
      case 'WORD_LASH':
        placeholderText.placeholder = lastWitLetters ? `${lastWitLetters.join(' ')} ...` : 'Your phrase...';
        break;
      case 'ACRO_LASH':
        placeholderText.placeholder = lastWitLetters ? `${lastWitLetters.length} words starting with ${lastWitLetters.join(', ')}` : 'Expand the acronym...';
        break;
      default:
        placeholderText.placeholder = 'Make it your best!';
    }
  }
  
  // Display prompt (letters for WORD_LASH/ACRO_LASH, story for FLASHBACK)
  if (promptEl) {
    if ((lastWitMode === 'WORD_LASH' || lastWitMode === 'ACRO_LASH') && lastWitLetters) {
      promptEl.innerHTML = `<span class="last-wit-letters">${lastWitLetters.join('. ')}.</span>`;
    } else {
      promptEl.textContent = data.prompt;
    }
  }
  
  document.getElementById('ll-answer-input').value = '';
  document.getElementById('ll-char-count').textContent = '0';
  
  // Reset submit button
  const btn = document.getElementById('ll-submit-btn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'SUBMIT';
  }
  
  showScreen('lastLash');
});

// Single vote for Last Lash (official Quiplash rules)
let requiredVotes = 1;

socket.on('last_lash_voting', (data) => {
  lastLashVotes = [];
  
  // Update mode from voting data
  lastWitMode = data.mode || lastWitMode || 'FLASHBACK';
  lastWitLetters = data.letters || lastWitLetters;
  
  // Update voting title based on mode
  const voteTitleEl = document.getElementById('ll-vote-title');
  if (voteTitleEl) {
    switch (lastWitMode) {
      case 'FLASHBACK':
        voteTitleEl.textContent = 'FLASHBACK - VOTE!';
        break;
      case 'WORD_LASH':
        voteTitleEl.textContent = 'WORD LASH - VOTE!';
        break;
      case 'ACRO_LASH':
        voteTitleEl.textContent = 'ACRO LASH - VOTE!';
        break;
      default:
        voteTitleEl.textContent = 'PICK YOUR FAVORITE!';
    }
  }
  
  // Display prompt/letters
  const votePromptEl = document.getElementById('ll-vote-prompt');
  if (votePromptEl) {
    if ((lastWitMode === 'WORD_LASH' || lastWitMode === 'ACRO_LASH') && lastWitLetters) {
      votePromptEl.innerHTML = `<span class="last-wit-letters-small">${lastWitLetters.join('. ')}.</span>`;
    } else {
      votePromptEl.textContent = data.prompt;
    }
  }
  
  const optionsContainer = document.getElementById('ll-vote-options');
  
  optionsContainer.innerHTML = data.answers.map((a, i) => {
    const isOwn = a.playerId === playerId;
    return `
    <button class="ll-option ${isOwn ? 'own-answer' : ''}" data-player-id="${a.playerId}" data-index="${i}" ${isOwn ? 'disabled' : ''}>
      "${a.answer}"
      ${isOwn ? '<span class="own-label">(Your answer)</span>' : ''}
    </button>
  `;
  }).join('');
  
  // Add click handlers only to non-own answers
  optionsContainer.querySelectorAll('.ll-option:not(.own-answer)').forEach(btn => {
    btn.addEventListener('click', () => handleLastLashVote(btn));
  });
  
  updateLastLashVoteButton();
  showScreen('lastLashVoting');
});

function handleLastLashVote(btn) {
  const optionPlayerId = btn.dataset.playerId;
  
  // Can't vote for yourself (should be disabled anyway)
  if (optionPlayerId === playerId) {
    return;
  }
  
  // Single vote - clear previous selection and select new one
  // Or deselect if clicking the same one
  if (lastLashVotes.includes(optionPlayerId)) {
    lastLashVotes = [];
  } else {
    lastLashVotes = [optionPlayerId];
  }
  
  // Update UI - single selection style
  document.querySelectorAll('.ll-option').forEach(option => {
    const pid = option.dataset.playerId;
    option.classList.remove('selected', 'selected-1');
    
    if (lastLashVotes.includes(pid)) {
      option.classList.add('selected');
    }
  });
  
  updateLastLashVoteButton();
}

function updateLastLashVoteButton() {
  const btn = document.getElementById('ll-vote-submit-btn');
  if (lastLashVotes.length >= requiredVotes) {
    btn.disabled = false;
    btn.textContent = 'SUBMIT VOTE';
  } else {
    btn.disabled = true;
    btn.textContent = 'SELECT YOUR FAVORITE';
  }
}

socket.on('last_lash_results', () => {
  showScreen('waiting');
});

socket.on('game_over', (data) => {
  // Find player's score
  const playerScore = data.scoreboard.find(p => p.id === playerId);
  document.getElementById('your-score').textContent = playerScore?.score || 0;
  
  // Check if player won
  const isWinner = data.winners.some(w => w.id === playerId);
  if (isWinner) {
    document.getElementById('final-message').textContent = '🎉 YOU WON! 🎉';
  } else {
    document.getElementById('final-message').textContent = 'Thanks for playing!';
  }
  
  if (data.reason) {
    document.getElementById('final-message').textContent = data.reason;
  }
  
  // Clear session data
  sessionStorage.clear();
  
  showScreen('gameOver');
});

socket.on('player_kicked', (data) => {
  sessionStorage.clear();
  showScreen('kicked');
});

socket.on('timer_update', (data) => {
  // Update all visible timers
  updateTimer(data.remaining, 'answer-timer');
  updateTimer(data.remaining, 'vote-timer');
  updateTimer(data.remaining, 'll-answer-timer');
  updateTimer(data.remaining, 'll-vote-timer');
});

socket.on('game_paused', () => {
  document.getElementById('pause-overlay').classList.add('active');
  console.log('Game paused');
});

socket.on('game_resumed', () => {
  document.getElementById('pause-overlay').classList.remove('active');
  console.log('Game resumed');
});

socket.on('error', (data) => {
  console.log('error event received:', data);
  showError(data.message);
});

socket.on('connect', () => {
  console.log('Connected to server');
  
  // Try to rejoin if we have saved data
  if (playerId && roomCode && screens.join.classList.contains('active') === false) {
    socket.emit('rejoin', { playerId, roomCode });
  }
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
