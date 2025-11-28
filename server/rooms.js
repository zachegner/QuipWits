const { CONFIG, GAME_STATES } = require('../shared/constants');

// In-memory storage for all rooms
const rooms = new Map();

/**
 * Generate a random room code (4 uppercase letters)
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure code is unique
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

/**
 * Create a new game room
 */
function createRoom(hostSocketId, hostId) {
  const code = generateRoomCode();
  const room = {
    code,
    hostSocketId,
    hostId,  // Persistent host identifier for reconnection
    state: GAME_STATES.LOBBY,
    players: [],
    currentRound: 0,
    prompts: [],           // All prompts for current round
    answers: new Map(),    // promptId -> { player1Answer, player2Answer }
    votes: new Map(),      // promptId -> { player1Votes, player2Votes }
    scores: new Map(),     // playerId -> score
    currentMatchupIndex: 0,
    matchups: [],          // Array of matchup objects for voting
    lastLashPrompt: null,
    lastLashAnswers: [],   // Array of { playerId, answer }
    lastLashVotes: new Map(), // playerId -> [1st, 2nd, 3rd] picks
    isPaused: false,
    timerEndTime: null,
    remainingTimeOnPause: null,  // Seconds remaining when paused
    pausedInState: null,         // Game state when paused (for callback restoration)
    createdAt: Date.now()
  };
  rooms.set(code, room);
  return room;
}

/**
 * Get a room by code
 */
function getRoom(roomCode) {
  return rooms.get(roomCode?.toUpperCase());
}

/**
 * Add a player to a room
 */
function addPlayer(roomCode, playerId, playerName, socketId) {
  const room = getRoom(roomCode);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }
  if (room.state !== GAME_STATES.LOBBY) {
    return { success: false, error: 'Game already in progress' };
  }
  if (room.players.length >= CONFIG.MAX_PLAYERS) {
    return { success: false, error: 'Room is full' };
  }
  // Check for duplicate name
  if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    return { success: false, error: 'Name already taken' };
  }

  const player = {
    id: playerId,
    socketId,
    name: playerName,
    isConnected: true,
    promptsAssigned: [],  // Prompt IDs assigned to this player
    answersSubmitted: 0,
    hasVoted: new Set()   // Set of promptIds this player has voted on
  };

  room.players.push(player);
  room.scores.set(playerId, 0);

  return { success: true, player };
}

/**
 * Remove a player from a room
 */
function removePlayer(roomCode, playerId) {
  const room = getRoom(roomCode);
  if (!room) return false;

  const index = room.players.findIndex(p => p.id === playerId);
  if (index !== -1) {
    room.players.splice(index, 1);
    room.scores.delete(playerId);
    return true;
  }
  return false;
}

/**
 * Update player's socket ID (for reconnection)
 */
function updatePlayerSocket(roomCode, playerId, newSocketId) {
  const room = getRoom(roomCode);
  if (!room) return false;

  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.socketId = newSocketId;
    player.isConnected = true;
    return true;
  }
  return false;
}

/**
 * Update host's socket ID (for reconnection)
 */
function updateHostSocket(roomCode, hostId, newSocketId) {
  const room = getRoom(roomCode);
  if (!room) return false;
  
  // Verify hostId matches
  if (room.hostId !== hostId) return false;
  
  room.hostSocketId = newSocketId;
  return true;
}

/**
 * Mark player as disconnected
 */
function markPlayerDisconnected(roomCode, socketId) {
  const room = getRoom(roomCode);
  if (!room) return null;

  const player = room.players.find(p => p.socketId === socketId);
  if (player) {
    player.isConnected = false;
    return player;
  }
  return null;
}

/**
 * Get player by socket ID
 */
function getPlayerBySocket(roomCode, socketId) {
  const room = getRoom(roomCode);
  if (!room) return null;
  return room.players.find(p => p.socketId === socketId);
}

/**
 * Get player by ID
 */
function getPlayerById(roomCode, playerId) {
  const room = getRoom(roomCode);
  if (!room) return null;
  return room.players.find(p => p.id === playerId);
}

/**
 * Update room state
 */
function updateRoomState(roomCode, newState) {
  const room = getRoom(roomCode);
  if (!room) return false;
  room.state = newState;
  return true;
}

/**
 * Delete a room
 */
function deleteRoom(roomCode) {
  return rooms.delete(roomCode?.toUpperCase());
}

/**
 * Get all rooms (for debugging)
 */
function getAllRooms() {
  return Array.from(rooms.values());
}

/**
 * Find room by socket ID
 */
function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId) {
      return { room, isHost: true };
    }
    const player = room.players.find(p => p.socketId === socketId);
    if (player) {
      return { room, isHost: false, player };
    }
  }
  return null;
}

/**
 * Clean up old rooms (call periodically)
 */
function cleanupOldRooms(maxAgeMs = 3600000) { // 1 hour default
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > maxAgeMs) {
      rooms.delete(code);
    }
  }
}

module.exports = {
  generateRoomCode,
  createRoom,
  getRoom,
  addPlayer,
  removePlayer,
  updatePlayerSocket,
  updateHostSocket,
  markPlayerDisconnected,
  getPlayerBySocket,
  getPlayerById,
  updateRoomState,
  deleteRoom,
  getAllRooms,
  findRoomBySocket,
  cleanupOldRooms
};
