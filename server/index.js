const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');

const { GAME_STATES, CONFIG, CLIENT_EVENTS, SERVER_EVENTS } = require('../shared/constants');
const rooms = require('./rooms');
const gameLogic = require('./gameLogic');
const config = require('./config');
const promptGenerator = require('./promptGenerator');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper to get base path for static files (works with pkg bundled apps)
function getBasePath() {
  // When running as pkg executable, use process.pkg to detect
  // The snapshot filesystem in pkg uses /snapshot/ prefix
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  return path.dirname(__dirname);
}

// Serve static files - use pkg-compatible paths
const basePath = getBasePath();
app.use('/host', express.static(path.join(__dirname, '../client-host')));
app.use('/play', express.static(path.join(__dirname, '../client-phone')));
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Routes
app.get('/', (req, res) => {
  res.redirect('/host');
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, '../client-host/index.html'));
});

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, '../client-phone/index.html'));
});

// API Routes for configuration
app.get('/api/config/status', (req, res) => {
  res.json({
    hasApiKey: config.hasAnthropicApiKey(),
    aiAvailable: promptGenerator.isAIAvailable()
  });
});

app.post('/api/config/apikey', (req, res) => {
  const { apiKey, persist = true } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'API key is required' });
  }
  
  if (!apiKey.startsWith('sk-ant-')) {
    return res.status(400).json({ success: false, error: 'Invalid API key format' });
  }
  
  try {
    config.setAnthropicApiKey(apiKey, persist);
    // Reinitialize the prompt generator's client
    promptGenerator.reinitializeClient?.();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/config/test', async (req, res) => {
  const { apiKey } = req.body;
  
  // Use provided key or fall back to configured key
  const keyToTest = apiKey || config.getAnthropicApiKey();
  
  if (!keyToTest) {
    return res.json({ valid: false, error: 'No API key provided or configured' });
  }
  
  try {
    // Quick test with Anthropic API
    const Anthropic = require('@anthropic-ai/sdk').default;
    const client = new Anthropic({ apiKey: keyToTest });
    
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "ok"' }]
    });
    
    res.json({ valid: true });
  } catch (error) {
    res.json({ valid: false, error: error.message });
  }
});

app.get('/api/network', (req, res) => {
  const addresses = getNetworkAddresses();
  const port = process.env.PORT || 3000;
  res.json({ addresses, port });
});

// Timer management
const timers = new Map(); // roomCode -> timer data

function startTimer(roomCode, duration, callback) {
  clearTimer(roomCode);
  
  const endTime = Date.now() + duration * 1000;
  const room = rooms.getRoom(roomCode);
  if (room) {
    room.timerEndTime = endTime;
  }
  
  // Emit timer updates every second
  const intervalId = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    io.to(roomCode).emit(SERVER_EVENTS.TIMER_UPDATE, { remaining });
    
    if (remaining <= 0) {
      clearTimer(roomCode);
      callback();
    }
  }, 1000);
  
  timers.set(roomCode, { intervalId, endTime, callback });
  
  // Emit initial time
  io.to(roomCode).emit(SERVER_EVENTS.TIMER_UPDATE, { remaining: duration });
}

function clearTimer(roomCode) {
  const timer = timers.get(roomCode);
  if (timer) {
    clearInterval(timer.intervalId);
    timers.delete(roomCode);
  }
}

function extendTimer(roomCode, extraSeconds) {
  const timer = timers.get(roomCode);
  if (timer) {
    timer.endTime += extraSeconds * 1000;
    const room = rooms.getRoom(roomCode);
    if (room) {
      room.timerEndTime = timer.endTime;
    }
  }
}

/**
 * Get the appropriate timer callback based on current game state.
 * Used when resuming a paused game to restore the correct timer behavior.
 */
function getTimerCallback(roomCode, state) {
  const room = rooms.getRoom(roomCode);
  if (!room) return () => {};

  switch (state) {
    case GAME_STATES.PROMPT:
      return () => {
        gameLogic.autoSubmitMissingAnswers(room);
        startVotingPhase(roomCode);
      };
    case GAME_STATES.VOTING:
      // Get the current prompt being voted on
      const currentPrompt = room.prompts?.[room.currentMatchupIndex];
      const promptId = currentPrompt?.promptId;
      return () => {
        if (promptId) {
          showMatchupResult(roomCode, promptId);
        }
      };
    case GAME_STATES.LAST_LASH:
      return () => {
        gameLogic.autoSubmitMissingLastLashAnswers(room);
        startLastLashVoting(roomCode);
      };
    case GAME_STATES.LAST_LASH_VOTING:
      return () => {
        showLastLashResults(roomCode);
      };
    default:
      return () => {};
  }
}

/**
 * Get remaining time on timer for a room.
 * Returns 0 if no active timer.
 */
function getRemainingTime(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room || !room.timerEndTime) return 0;
  return Math.max(0, Math.ceil((room.timerEndTime - Date.now()) / 1000));
}

// Game flow functions
async function startPromptPhase(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  room.currentRound++;
  rooms.updateRoomState(roomCode, GAME_STATES.PROMPT);
  
  // Assign prompts to players (use async version with AI fallback)
  // Pass theme for themed prompt generation
  await gameLogic.assignPromptsToPlayersAsync(room, room.theme);
  
  // Notify host
  io.to(room.hostSocketId).emit(SERVER_EVENTS.PROMPT_PHASE, {
    round: room.currentRound,
    totalRounds: CONFIG.ROUNDS_PER_GAME,
    playerCount: room.players.length
  });
  
  // Send prompts to each player
  room.players.forEach(player => {
    const prompts = gameLogic.getPlayerPrompts(room, player.id);
    io.to(player.socketId).emit(SERVER_EVENTS.RECEIVE_PROMPTS, {
      prompts,
      timeLimit: CONFIG.ANSWER_TIME_LIMIT
    });
  });
  
  // Start timer
  startTimer(roomCode, CONFIG.ANSWER_TIME_LIMIT, () => {
    gameLogic.autoSubmitMissingAnswers(room);
    startVotingPhase(roomCode);
  });
}

function startVotingPhase(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  rooms.updateRoomState(roomCode, GAME_STATES.VOTING);
  room.currentMatchupIndex = 0;
  
  // Notify everyone voting is starting
  io.to(roomCode).emit(SERVER_EVENTS.VOTING_PHASE, {
    round: room.currentRound,
    totalMatchups: room.prompts.length
  });
  
  // Reset voting state for all players
  room.players.forEach(p => p.hasVoted = new Set());
  
  // Send first matchup
  setTimeout(() => sendNextMatchup(roomCode), 1500);
}

function sendNextMatchup(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  const matchup = gameLogic.getNextMatchup(room);
  
  if (!matchup) {
    // No more matchups - show round scores then proceed
    showRoundScores(roomCode);
    return;
  }
  
  // Send matchup to everyone
  io.to(roomCode).emit(SERVER_EVENTS.VOTE_MATCHUP, matchup);
  
  // Start vote timer
  startTimer(roomCode, CONFIG.VOTE_TIME_LIMIT, () => {
    showMatchupResult(roomCode, matchup.promptId);
  });
}

function showMatchupResult(roomCode, promptId) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  clearTimer(roomCode);
  
  const result = gameLogic.calculateMatchupScores(room, promptId);
  io.to(roomCode).emit(SERVER_EVENTS.MATCHUP_RESULT, result);
  
  // Move to next matchup after showing result
  setTimeout(() => {
    const hasMore = gameLogic.advanceMatchup(room);
    if (hasMore) {
      sendNextMatchup(roomCode);
    } else {
      showRoundScores(roomCode);
    }
  }, 4000); // Show result for 4 seconds
}

function showRoundScores(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  rooms.updateRoomState(roomCode, GAME_STATES.SCORING);
  
  const scoreboard = gameLogic.getScoreboard(room);
  io.to(roomCode).emit(SERVER_EVENTS.ROUND_SCORES, {
    round: room.currentRound,
    scoreboard
  });
  
  // After showing scores, decide what's next
  setTimeout(() => {
    if (room.currentRound >= CONFIG.ROUNDS_PER_GAME) {
      // Time for Last Wit
      startLastLash(roomCode);
    } else {
      // Start next round
      startPromptPhase(roomCode);
    }
  }, 5000);
}

async function startLastLash(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  rooms.updateRoomState(roomCode, GAME_STATES.LAST_LASH);

  // setupLastLashAsync now returns { prompt, mode, letters, instructions }
  const lastWitData = await gameLogic.setupLastLashAsync(room, room.theme);
  
  // Notify host with full mode data
  io.to(room.hostSocketId).emit(SERVER_EVENTS.LAST_LASH_PHASE, {
    prompt: lastWitData.prompt,
    mode: lastWitData.mode,
    letters: lastWitData.letters,
    instructions: lastWitData.instructions
  });
  
  // Send prompt to all players with mode info
  room.players.forEach(player => {
    io.to(player.socketId).emit(SERVER_EVENTS.LAST_LASH_PROMPT, {
      prompt: lastWitData.prompt,
      mode: lastWitData.mode,
      letters: lastWitData.letters,
      instructions: lastWitData.instructions,
      timeLimit: CONFIG.LAST_LASH_ANSWER_TIME
    });
  });
  
  // Start timer
  startTimer(roomCode, CONFIG.LAST_LASH_ANSWER_TIME, () => {
    gameLogic.autoSubmitMissingLastLashAnswers(room);
    startLastLashVoting(roomCode);
  });
}

function startLastLashVoting(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  rooms.updateRoomState(roomCode, GAME_STATES.LAST_LASH_VOTING);
  
  const votingData = gameLogic.getLastLashVotingData(room);
  
  // Send to everyone
  io.to(roomCode).emit(SERVER_EVENTS.LAST_LASH_VOTING, {
    ...votingData,
    timeLimit: CONFIG.LAST_LASH_VOTE_TIME
  });
  
  // Start timer
  startTimer(roomCode, CONFIG.LAST_LASH_VOTE_TIME, () => {
    showLastLashResults(roomCode);
  });
}

function showLastLashResults(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  clearTimer(roomCode);
  
  const results = gameLogic.calculateLastLashScores(room);
  io.to(roomCode).emit(SERVER_EVENTS.LAST_LASH_RESULTS, results);
  
  // Show game over after Last Wit results
  setTimeout(() => {
    endGame(roomCode);
  }, 8000);
}

function endGame(roomCode) {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  
  clearTimer(roomCode);
  rooms.updateRoomState(roomCode, GAME_STATES.GAME_OVER);
  
  const winners = gameLogic.getWinners(room);
  const finalScoreboard = gameLogic.getScoreboard(room);
  
  io.to(roomCode).emit(SERVER_EVENTS.GAME_OVER, {
    winners,
    scoreboard: finalScoreboard
  });
}

// Socket.IO event handlers
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  // Host creates a room
  socket.on(CLIENT_EVENTS.CREATE_ROOM, (data) => {
    const hostId = data?.hostId || `host_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const room = rooms.createRoom(socket.id, hostId);
    socket.join(room.code);
    
    socket.emit(SERVER_EVENTS.ROOM_CREATED, {
      roomCode: room.code,
      hostId: room.hostId
    });
    
    console.log(`Room created: ${room.code}`);
  });
  
  // Host rejoins after disconnect/refresh
  socket.on(CLIENT_EVENTS.REJOIN_HOST, ({ roomCode, hostId }) => {
    const room = rooms.getRoom(roomCode);
    if (!room) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
      return;
    }
    
    if (room.hostId !== hostId) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Invalid host credentials', code: 'INVALID_HOST' });
      return;
    }
    
    // Update host socket ID
    rooms.updateHostSocket(roomCode, hostId, socket.id);
    socket.join(roomCode.toUpperCase());
    
    // Send current game state back to host
    socket.emit(SERVER_EVENTS.REJOIN_HOST_SUCCESS, {
      roomCode: room.code,
      hostId: room.hostId,
      players: room.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected })),
      state: room.state,
      currentRound: room.currentRound,
      isPaused: room.isPaused,
      timerEndTime: room.timerEndTime,
      remainingTimeOnPause: room.remainingTimeOnPause,
      currentMatchupIndex: room.currentMatchupIndex,
      totalMatchups: room.prompts?.length || 0
    });
    
    console.log(`Host rejoined room ${roomCode}`);
  });
  
  // Player joins a room
  socket.on(CLIENT_EVENTS.JOIN_ROOM, ({ roomCode, playerName }) => {
    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = rooms.addPlayer(roomCode, playerId, playerName, socket.id);
    
    if (!result.success) {
      socket.emit(SERVER_EVENTS.ERROR, { message: result.error });
      return;
    }
    
    socket.join(roomCode.toUpperCase());
    
    // Send success to player
    socket.emit(SERVER_EVENTS.ROOM_JOINED, {
      playerId,
      roomCode: roomCode.toUpperCase(),
      playerName
    });
    
    // Notify room of update
    const room = rooms.getRoom(roomCode);
    io.to(roomCode.toUpperCase()).emit(SERVER_EVENTS.ROOM_UPDATE, {
      players: room.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected })),
      state: room.state
    });
    
    console.log(`Player ${playerName} joined room ${roomCode}`);
  });
  
  // Player rejoins after disconnect
  socket.on(CLIENT_EVENTS.REJOIN, ({ playerId, roomCode }) => {
    const room = rooms.getRoom(roomCode);
    if (!room) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Room not found' });
      return;
    }
    
    const updated = rooms.updatePlayerSocket(roomCode, playerId, socket.id);
    if (!updated) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Player not found' });
      return;
    }
    
    socket.join(roomCode.toUpperCase());
    
    const player = rooms.getPlayerById(roomCode, playerId);
    
    socket.emit(SERVER_EVENTS.REJOIN_SUCCESS, {
      playerId,
      roomCode,
      playerName: player?.name,
      gameState: room.state,
      currentRound: room.currentRound
    });
    
    // Send current game state based on phase
    if (room.state === GAME_STATES.PROMPT) {
      const prompts = gameLogic.getPlayerPrompts(room, playerId);
      socket.emit(SERVER_EVENTS.RECEIVE_PROMPTS, {
        prompts,
        timeLimit: Math.ceil((room.timerEndTime - Date.now()) / 1000)
      });
    } else if (room.state === GAME_STATES.LAST_LASH) {
      socket.emit(SERVER_EVENTS.LAST_LASH_PROMPT, {
        prompt: room.lastLashPrompt,
        timeLimit: Math.ceil((room.timerEndTime - Date.now()) / 1000)
      });
    }
    
    // Notify room
    io.to(roomCode.toUpperCase()).emit(SERVER_EVENTS.ROOM_UPDATE, {
      players: room.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected })),
      state: room.state
    });
    
    console.log(`Player ${player?.name} rejoined room ${roomCode}`);
  });
  
  // Host starts the game
  socket.on(CLIENT_EVENTS.START_GAME, ({ roomCode, theme }) => {
    const room = rooms.getRoom(roomCode);
    if (!room) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Room not found' });
      return;
    }
    
    if (room.hostSocketId !== socket.id) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Only host can start game' });
      return;
    }
    
    if (room.players.length < CONFIG.MIN_PLAYERS) {
      socket.emit(SERVER_EVENTS.ERROR, { message: `Need at least ${CONFIG.MIN_PLAYERS} players` });
      return;
    }
    
    // Store theme on room (trimmed to 120 chars max)
    room.theme = theme ? theme.trim().substring(0, 120) : null;
    
    // Notify everyone game is starting
    io.to(roomCode).emit(SERVER_EVENTS.GAME_STARTED, {
      playerCount: room.players.length,
      theme: room.theme
    });
    
    // Start first round after brief delay
    setTimeout(() => startPromptPhase(roomCode), 2000);
    
    console.log(`Game started in room ${roomCode}`);
  });
  
  // Player submits answer
  socket.on(CLIENT_EVENTS.SUBMIT_ANSWER, ({ roomCode, promptId, answer }) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return;
    
    const player = rooms.getPlayerBySocket(roomCode, socket.id);
    if (!player) return;
    
    const result = gameLogic.submitAnswer(room, player.id, promptId, answer);
    
    if (result.success) {
      // Notify player
      socket.emit(SERVER_EVENTS.PLAYER_SUBMITTED, { promptId });
      
      // Notify host of progress
      io.to(room.hostSocketId).emit(SERVER_EVENTS.PLAYER_SUBMITTED, {
        playerId: player.id,
        playerName: player.name,
        submitted: player.answersSubmitted,
        total: player.promptsAssigned.length
      });
      
      // Check if all answers are in
      if (gameLogic.allAnswersSubmitted(room)) {
        clearTimer(roomCode);
        startVotingPhase(roomCode);
      }
    }
  });
  
  // Player submits vote
  socket.on(CLIENT_EVENTS.SUBMIT_VOTE, ({ roomCode, promptId, vote }) => {
    const room = rooms.getRoom(roomCode);
    if (!room) return;
    
    const player = rooms.getPlayerBySocket(roomCode, socket.id);
    if (!player) return;
    
    const result = gameLogic.submitVote(room, player.id, promptId, vote);
    
    if (result.success) {
      socket.emit(SERVER_EVENTS.PLAYER_VOTED, { promptId });
      
      // Notify host
      io.to(room.hostSocketId).emit(SERVER_EVENTS.PLAYER_VOTED, {
        playerId: player.id,
        playerName: player.name
      });
      
      // Check if all votes are in
      if (gameLogic.allVotesSubmitted(room, promptId)) {
        showMatchupResult(roomCode, promptId);
      }
    } else {
      // Send failure notification back to client
      socket.emit('vote_failed', { error: result.error, promptId });
    }
  });
  
  // Player submits Last Wit answer
  socket.on(CLIENT_EVENTS.SUBMIT_ANSWER, ({ roomCode, answer, isLastLash }) => {
    if (!isLastLash) return; // Regular answers handled above
    
    const room = rooms.getRoom(roomCode);
    if (!room || room.state !== GAME_STATES.LAST_LASH) return;
    
    const player = rooms.getPlayerBySocket(roomCode, socket.id);
    if (!player) return;
    
    const result = gameLogic.submitLastLashAnswer(room, player.id, answer);
    
    if (result.success) {
      socket.emit(SERVER_EVENTS.PLAYER_SUBMITTED, { isLastLash: true });
      
      io.to(room.hostSocketId).emit(SERVER_EVENTS.PLAYER_SUBMITTED, {
        playerId: player.id,
        playerName: player.name,
        isLastLash: true,
        submitted: room.lastLashAnswers.length,
        total: room.players.length
      });
      
      if (gameLogic.allLastLashAnswersSubmitted(room)) {
        clearTimer(roomCode);
        startLastLashVoting(roomCode);
      }
    }
  });
  
  // Player submits Last Wit votes
  socket.on(CLIENT_EVENTS.SUBMIT_LAST_LASH_VOTES, ({ roomCode, votes }) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.state !== GAME_STATES.LAST_LASH_VOTING) return;
    
    const player = rooms.getPlayerBySocket(roomCode, socket.id);
    if (!player) return;
    
    const result = gameLogic.submitLastLashVotes(room, player.id, votes);
    
    if (result.success) {
      socket.emit(SERVER_EVENTS.PLAYER_VOTED, { isLastLash: true });
      
      io.to(room.hostSocketId).emit(SERVER_EVENTS.PLAYER_VOTED, {
        playerId: player.id,
        playerName: player.name,
        isLastLash: true
      });
      
      if (gameLogic.allLastLashVotesSubmitted(room)) {
        showLastLashResults(roomCode);
      }
    }
  });
  
  // Host controls
  socket.on(CLIENT_EVENTS.SKIP_PLAYER, ({ roomCode, playerId }) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    
    // Auto-submit for skipped player based on current phase
    if (room.state === GAME_STATES.PROMPT) {
      const player = rooms.getPlayerById(roomCode, playerId);
      if (player) {
        player.promptsAssigned.forEach(promptId => {
          gameLogic.submitAnswer(room, playerId, promptId, '[Skipped]');
        });
      }
    } else if (room.state === GAME_STATES.LAST_LASH) {
      gameLogic.submitLastLashAnswer(room, playerId, '[Skipped]');
    }
    
    io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATE, {
      players: room.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected })),
      state: room.state,
      message: `Player skipped`
    });
  });
  
  socket.on(CLIENT_EVENTS.KICK_PLAYER, ({ roomCode, playerId }) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    
    const player = rooms.getPlayerById(roomCode, playerId);
    if (player) {
      // Notify the kicked player
      io.to(player.socketId).emit(SERVER_EVENTS.PLAYER_KICKED, {
        message: 'You have been kicked from the game'
      });
      
      rooms.removePlayer(roomCode, playerId);
      
      io.to(roomCode).emit(SERVER_EVENTS.ROOM_UPDATE, {
        players: room.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected })),
        state: room.state
      });
    }
  });
  
  socket.on(CLIENT_EVENTS.PAUSE_GAME, ({ roomCode }) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    
    // Save remaining time before clearing the timer
    const remaining = getRemainingTime(roomCode);
    room.remainingTimeOnPause = remaining;
    room.pausedInState = room.state;
    room.isPaused = true;
    
    clearTimer(roomCode);
    
    // Send paused event with frozen timer value
    io.to(roomCode).emit(SERVER_EVENTS.GAME_PAUSED, {
      remainingTime: remaining
    });
  });
  
  socket.on(CLIENT_EVENTS.RESUME_GAME, ({ roomCode }) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    
    room.isPaused = false;
    
    // Get saved remaining time and state
    const remainingTime = room.remainingTimeOnPause;
    const pausedState = room.pausedInState;
    
    // Clear pause state
    room.remainingTimeOnPause = null;
    room.pausedInState = null;
    
    io.to(roomCode).emit(SERVER_EVENTS.GAME_RESUMED);
    
    // Resume timer if there was time remaining and we have a valid state
    if (remainingTime && remainingTime > 0 && pausedState) {
      const callback = getTimerCallback(roomCode, pausedState);
      startTimer(roomCode, remainingTime, callback);
    } else if (remainingTime === 0 && pausedState) {
      // Timer expired while paused - immediately trigger the callback
      const callback = getTimerCallback(roomCode, pausedState);
      callback();
    }
  });
  
  socket.on(CLIENT_EVENTS.EXTEND_TIME, ({ roomCode, seconds = 30 }) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    
    extendTimer(roomCode, seconds);
  });
  
  socket.on(CLIENT_EVENTS.END_GAME, ({ roomCode }) => {
    const room = rooms.getRoom(roomCode);
    if (!room || room.hostSocketId !== socket.id) return;
    
    endGame(roomCode);
  });
  
  // Handle disconnection
  socket.on('disconnecting', () => {
    const result = rooms.findRoomBySocket(socket.id);
    if (!result) return;
    
    const { room, isHost, player } = result;
    
    if (isHost) {
      // Host disconnected - notify players but keep room alive for reconnection
      io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATE, {
        players: room.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected })),
        state: room.state,
        hostDisconnected: true
      });
      console.log(`Host disconnected from room ${room.code}, waiting for reconnection`);
    } else if (player) {
      // Player disconnected
      rooms.markPlayerDisconnected(room.code, socket.id);
      
      io.to(room.code).emit(SERVER_EVENTS.ROOM_UPDATE, {
        players: room.players.map(p => ({ id: p.id, name: p.name, isConnected: p.isConnected })),
        state: room.state
      });
      
      console.log(`Player ${player.name} disconnected from room ${room.code}`);
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Cleanup old rooms periodically (every 30 minutes)
setInterval(() => {
  rooms.cleanupOldRooms();
}, 30 * 60 * 1000);

// Helper function to get local network addresses
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.internal || iface.family !== 'IPv4') continue;
      addresses.push({ name, address: iface.address });
    }
  }
  
  return addresses;
}

// Load API key from config at startup
const savedApiKey = config.getAnthropicApiKey();
if (savedApiKey) {
  process.env.ANTHROPIC_API_KEY = savedApiKey;
  console.log('📦 Loaded API key from config');
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║              🎮 QUIPWITS SERVER RUNNING 🎮                 ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}/host`);
  
  // Display network addresses for players to connect
  const addresses = getNetworkAddresses();
  if (addresses.length > 0) {
    console.log('║');
    console.log('║  📱 Players can join at:');
    addresses.forEach(({ name, address }) => {
      console.log(`║     http://${address}:${PORT}/play`);
    });
  }
  
  console.log('║');
  console.log(`║  🤖 AI Prompts: ${config.hasAnthropicApiKey() ? 'ENABLED ✓' : 'DISABLED (no API key)'}`);
  console.log(`║  📁 Config: ${config.getConfigPath()}`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});
