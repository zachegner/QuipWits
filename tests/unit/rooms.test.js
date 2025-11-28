/**
 * Unit Tests for Room Management (server/rooms.js)
 * Tests: Room creation, player management, room state, cleanup
 */

const rooms = require('../../server/rooms');
const { GAME_STATES, CONFIG } = require('../../shared/constants');

describe('Room Management', () => {
  // Clean up rooms after each test
  afterEach(() => {
    rooms.getAllRooms().forEach(room => {
      rooms.deleteRoom(room.code);
    });
  });

  describe('Room Code Generation', () => {
    test('RM-001: generates 4 uppercase letter room code', () => {
      const code = rooms.generateRoomCode();
      expect(code).toMatch(/^[A-Z]{4}$/);
    });

    test('RM-002: generates unique room codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        const code = rooms.generateRoomCode();
        codes.add(code);
      }
      // All codes should be unique
      expect(codes.size).toBe(100);
    });

    test('generates room codes with correct length from CONFIG', () => {
      const code = rooms.generateRoomCode();
      expect(code.length).toBe(CONFIG.ROOM_CODE_LENGTH);
    });
  });

  describe('Room Creation', () => {
    test('RM-003: creates room with LOBBY state', () => {
      const hostSocketId = 'socket_123';
      const hostId = 'host_456';
      const room = rooms.createRoom(hostSocketId, hostId);
      
      expect(room.state).toBe(GAME_STATES.LOBBY);
    });

    test('RM-004: stores host ID correctly', () => {
      const hostSocketId = 'socket_123';
      const hostId = 'host_456';
      const room = rooms.createRoom(hostSocketId, hostId);
      
      expect(room.hostId).toBe(hostId);
      expect(room.hostSocketId).toBe(hostSocketId);
    });

    test('RM-005: initializes with empty players array', () => {
      const room = rooms.createRoom('socket_123', 'host_456');
      
      expect(room.players).toEqual([]);
      expect(room.players.length).toBe(0);
    });

    test('RM-006: getRoom works with any case', () => {
      const room = rooms.createRoom('socket_123', 'host_456');
      const code = room.code;
      
      expect(rooms.getRoom(code.toLowerCase())).toBe(room);
      expect(rooms.getRoom(code.toUpperCase())).toBe(room);
    });

    test('creates room with proper initial values', () => {
      const room = rooms.createRoom('socket_123', 'host_456');
      
      expect(room.currentRound).toBe(0);
      expect(room.prompts).toEqual([]);
      expect(room.scores).toBeInstanceOf(Map);
      expect(room.isPaused).toBe(false);
      expect(room.createdAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Player Management', () => {
    let room;
    
    beforeEach(() => {
      room = rooms.createRoom('socket_host', 'host_id');
    });

    test('PM-001: adds player to room successfully', () => {
      const result = rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      
      expect(result.success).toBe(true);
      expect(result.player.name).toBe('Alice');
      expect(room.players.length).toBe(1);
    });

    test('PM-002: rejects duplicate names', () => {
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      const result = rooms.addPlayer(room.code, 'player_2', 'Alice', 'socket_2');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Name already taken');
    });

    test('PM-002b: rejects duplicate names case-insensitively', () => {
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      const result = rooms.addPlayer(room.code, 'player_2', 'ALICE', 'socket_2');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Name already taken');
    });

    test('PM-003: rejects when room is full', () => {
      // Add MAX_PLAYERS
      for (let i = 0; i < CONFIG.MAX_PLAYERS; i++) {
        rooms.addPlayer(room.code, `player_${i}`, `Player${i}`, `socket_${i}`);
      }
      
      const result = rooms.addPlayer(room.code, 'extra', 'Extra', 'socket_extra');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Room is full');
    });

    test('PM-004: rejects join when game in progress', () => {
      rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      const result = rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Game already in progress');
    });

    test('PM-005: removes player from room', () => {
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      expect(room.players.length).toBe(1);
      
      const removed = rooms.removePlayer(room.code, 'player_1');
      
      expect(removed).toBe(true);
      expect(room.players.length).toBe(0);
    });

    test('PM-006: updates player socket on rejoin', () => {
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      
      const updated = rooms.updatePlayerSocket(room.code, 'player_1', 'socket_new');
      
      expect(updated).toBe(true);
      expect(room.players[0].socketId).toBe('socket_new');
      expect(room.players[0].isConnected).toBe(true);
    });

    test('PM-007: marks player as disconnected', () => {
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      
      const player = rooms.markPlayerDisconnected(room.code, 'socket_1');
      
      expect(player.isConnected).toBe(false);
    });

    test('PM-008: finds room by socket ID', () => {
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      
      // Find by player socket
      const playerResult = rooms.findRoomBySocket('socket_1');
      expect(playerResult.room.code).toBe(room.code);
      expect(playerResult.isHost).toBe(false);
      expect(playerResult.player.name).toBe('Alice');
      
      // Find by host socket
      const hostResult = rooms.findRoomBySocket('socket_host');
      expect(hostResult.room.code).toBe(room.code);
      expect(hostResult.isHost).toBe(true);
    });

    test('returns null for invalid room code', () => {
      const result = rooms.addPlayer('INVALID', 'player_1', 'Alice', 'socket_1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Room not found');
    });

    test('player has proper initial structure', () => {
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      const player = room.players[0];
      
      expect(player.id).toBe('player_1');
      expect(player.socketId).toBe('socket_1');
      expect(player.name).toBe('Alice');
      expect(player.isConnected).toBe(true);
      expect(player.promptsAssigned).toEqual([]);
      expect(player.answersSubmitted).toBe(0);
      expect(player.hasVoted).toBeInstanceOf(Set);
    });
  });

  describe('Room State Management', () => {
    let room;
    
    beforeEach(() => {
      room = rooms.createRoom('socket_host', 'host_id');
    });

    test('RS-001: updates room state correctly', () => {
      const result = rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      
      expect(result).toBe(true);
      expect(room.state).toBe(GAME_STATES.PROMPT);
    });

    test('RS-002: deletes room correctly', () => {
      const code = room.code;
      const deleted = rooms.deleteRoom(code);
      
      expect(deleted).toBe(true);
      expect(rooms.getRoom(code)).toBeUndefined();
    });

    test('RS-003: cleans up old rooms', () => {
      // Create an old room by manipulating createdAt
      room.createdAt = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      
      rooms.cleanupOldRooms(60 * 60 * 1000); // 1 hour max age
      
      expect(rooms.getRoom(room.code)).toBeUndefined();
    });

    test('RS-004: gets room by code', () => {
      const retrieved = rooms.getRoom(room.code);
      expect(retrieved).toBe(room);
    });

    test('returns false for invalid room operations', () => {
      expect(rooms.updateRoomState('INVALID', GAME_STATES.PROMPT)).toBe(false);
      expect(rooms.updatePlayerSocket('INVALID', 'player', 'socket')).toBe(false);
      expect(rooms.markPlayerDisconnected('INVALID', 'socket')).toBeNull();
    });
  });

  describe('Host Management', () => {
    test('updates host socket correctly', () => {
      const room = rooms.createRoom('socket_host', 'host_id');
      
      const updated = rooms.updateHostSocket(room.code, 'host_id', 'socket_new_host');
      
      expect(updated).toBe(true);
      expect(room.hostSocketId).toBe('socket_new_host');
    });

    test('rejects host socket update with wrong hostId', () => {
      const room = rooms.createRoom('socket_host', 'host_id');
      
      const updated = rooms.updateHostSocket(room.code, 'wrong_host_id', 'socket_new');
      
      expect(updated).toBe(false);
      expect(room.hostSocketId).toBe('socket_host');
    });
  });

  describe('Player Lookup', () => {
    test('getPlayerBySocket returns correct player', () => {
      const room = rooms.createRoom('socket_host', 'host_id');
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      
      const player = rooms.getPlayerBySocket(room.code, 'socket_1');
      
      expect(player.name).toBe('Alice');
    });

    test('getPlayerById returns correct player', () => {
      const room = rooms.createRoom('socket_host', 'host_id');
      rooms.addPlayer(room.code, 'player_1', 'Alice', 'socket_1');
      
      const player = rooms.getPlayerById(room.code, 'player_1');
      
      expect(player.name).toBe('Alice');
    });

    test('returns null/undefined for non-existent player', () => {
      const room = rooms.createRoom('socket_host', 'host_id');
      
      expect(rooms.getPlayerBySocket(room.code, 'unknown')).toBeFalsy();
      expect(rooms.getPlayerById(room.code, 'unknown')).toBeFalsy();
    });
  });

  describe('Get All Rooms', () => {
    test('returns all active rooms', () => {
      rooms.createRoom('socket_1', 'host_1');
      rooms.createRoom('socket_2', 'host_2');
      rooms.createRoom('socket_3', 'host_3');
      
      const allRooms = rooms.getAllRooms();
      
      expect(allRooms.length).toBe(3);
    });
  });
});
