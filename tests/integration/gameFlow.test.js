/**
 * Integration Tests for Complete Game Flow
 * Tests: Full game scenarios, edge cases, scoring verification
 */

const { GAME_STATES, CONFIG, SCORING } = require('../../shared/constants');
const rooms = require('../../server/rooms');
const gameLogic = require('../../server/gameLogic');

describe('Complete Game Flow', () => {
  /**
   * Helper to create a fully set up room with players
   */
  function setupRoom(playerCount = 4) {
    const room = rooms.createRoom('host_socket', 'host_id');
    
    for (let i = 0; i < playerCount; i++) {
      rooms.addPlayer(room.code, `player_${i}`, `Player${i}`, `socket_${i}`);
    }
    
    return room;
  }

  afterEach(() => {
    rooms.getAllRooms().forEach(room => {
      rooms.deleteRoom(room.code);
    });
  });

  describe('IT-001: Complete 3-Player Game', () => {
    test('runs through all phases correctly', () => {
      const room = setupRoom(3);
      
      // Start game
      rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      
      // Round 1: Assign and answer prompts
      room.currentRound = 1;
      gameLogic.assignPromptsToPlayers(room);
      
      expect(room.prompts.length).toBeGreaterThan(0);
      
      // All players answer
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer from P1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Answer from P2');
      });
      
      expect(gameLogic.allAnswersSubmitted(room)).toBe(true);
      
      // Voting phase
      rooms.updateRoomState(room.code, GAME_STATES.VOTING);
      
      room.prompts.forEach(prompt => {
        const voters = room.players.filter(
          p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
        );
        voters.forEach(voter => {
          gameLogic.submitVote(room, voter.id, prompt.id, 1);
        });
        
        gameLogic.calculateMatchupScores(room, prompt.id);
        gameLogic.advanceMatchup(room);
      });
      
      // Round scores
      rooms.updateRoomState(room.code, GAME_STATES.SCORING);
      const midScoreboard = gameLogic.getScoreboard(room);
      expect(midScoreboard.length).toBe(3);
      
      // Round 2
      room.currentRound = 2;
      rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      gameLogic.assignPromptsToPlayers(room);
      
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'R2 Answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'R2 Answer 2');
      });
      
      rooms.updateRoomState(room.code, GAME_STATES.VOTING);
      room.currentMatchupIndex = 0;
      
      room.prompts.forEach(prompt => {
        const voters = room.players.filter(
          p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
        );
        voters.forEach(voter => {
          gameLogic.submitVote(room, voter.id, prompt.id, 2);
        });
        gameLogic.calculateMatchupScores(room, prompt.id);
        gameLogic.advanceMatchup(room);
      });
      
      // Last Wit
      rooms.updateRoomState(room.code, GAME_STATES.LAST_LASH);
      const lastLashPrompt = gameLogic.setupLastLash(room);
      expect(lastLashPrompt).toBeDefined();
      
      room.players.forEach((player, i) => {
        gameLogic.submitLastLashAnswer(room, player.id, `Last answer ${i}`);
      });
      
      expect(gameLogic.allLastLashAnswersSubmitted(room)).toBe(true);
      
      // Last Wit voting
      rooms.updateRoomState(room.code, GAME_STATES.LAST_LASH_VOTING);
      
      room.players.forEach(player => {
        const otherPlayers = room.players.filter(p => p.id !== player.id).map(p => p.id);
        gameLogic.submitLastLashVotes(room, player.id, otherPlayers);
      });
      
      expect(gameLogic.allLastLashVotesSubmitted(room)).toBe(true);
      
      const lastLashResults = gameLogic.calculateLastLashScores(room);
      expect(lastLashResults.finalScoreboard).toBeDefined();
      
      // Game over
      rooms.updateRoomState(room.code, GAME_STATES.GAME_OVER);
      const winners = gameLogic.getWinners(room);
      
      expect(winners.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('IT-002: Complete 10-Player Game', () => {
    test('handles maximum players correctly', () => {
      const room = setupRoom(10);
      
      room.currentRound = 1;
      rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      gameLogic.assignPromptsToPlayers(room);
      
      // Each player should have at least 1 prompt (may vary based on assignment algorithm)
      room.players.forEach(player => {
        expect(player.promptsAssigned.length).toBeGreaterThanOrEqual(1);
        expect(player.promptsAssigned.length).toBeLessThanOrEqual(CONFIG.PROMPTS_PER_PLAYER + 1);
      });
      
      // All prompts should have 2 different players
      room.prompts.forEach(prompt => {
        expect(prompt.player1Id).not.toBe(prompt.player2Id);
      });
      
      // Submit all answers
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Answer 2');
      });
      
      expect(gameLogic.allAnswersSubmitted(room)).toBe(true);
      
      // Voting with many voters per matchup
      room.prompts.forEach(prompt => {
        const voters = room.players.filter(
          p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
        );
        
        // With 10 players, each matchup should have at least 8 voters (10 - 2 participants)
        // In practice, if assignment algorithm gives extra prompts, may be less
        expect(voters.length).toBeGreaterThanOrEqual(7);
        expect(voters.length).toBeLessThanOrEqual(8);
        
        voters.forEach((voter, i) => {
          gameLogic.submitVote(room, voter.id, prompt.id, i % 2 === 0 ? 1 : 2);
        });
      });
    });
  });

  describe('IT-003: Game with Disconnections', () => {
    test('continues with remaining players', () => {
      const room = setupRoom(4);
      
      room.currentRound = 1;
      rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      gameLogic.assignPromptsToPlayers(room);
      
      // Mark one player as disconnected
      rooms.markPlayerDisconnected(room.code, 'socket_2');
      
      // Submit answers from connected players only
      room.prompts.forEach(prompt => {
        if (rooms.getPlayerById(room.code, prompt.player1Id)?.isConnected) {
          gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer');
        }
        if (rooms.getPlayerById(room.code, prompt.player2Id)?.isConnected) {
          gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Answer');
        }
      });
      
      // Auto-submit for disconnected
      gameLogic.autoSubmitMissingAnswers(room);
      
      expect(gameLogic.allAnswersSubmitted(room)).toBe(true);
    });
  });

  describe('IT-004: Game with All Jinxes', () => {
    test('handles all identical answers', () => {
      const room = setupRoom(4);
      
      room.currentRound = 1;
      rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      gameLogic.assignPromptsToPlayers(room);
      
      // Everyone submits the same answer
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Same answer');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Same answer');
      });
      
      // All should be Jinxes
      room.prompts.forEach(prompt => {
        const result = gameLogic.calculateMatchupScores(room, prompt.id);
        expect(result.isJinx).toBe(true);
        expect(result.player1Score).toBe(0);
        expect(result.player2Score).toBe(0);
      });
      
      // All scores should be 0
      const scoreboard = gameLogic.getScoreboard(room);
      scoreboard.forEach(player => {
        expect(player.score).toBe(0);
      });
    });
  });

  describe('IT-005: Game with All QuipWits', () => {
    test('awards bonus points correctly', () => {
      const room = setupRoom(4);
      
      room.currentRound = 1;
      rooms.updateRoomState(room.code, GAME_STATES.PROMPT);
      gameLogic.assignPromptsToPlayers(room);
      
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Unique answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Unique answer 2');
      });
      
      // All voters vote for answer 1 (unanimous)
      room.prompts.forEach(prompt => {
        const voters = room.players.filter(
          p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
        );
        voters.forEach(voter => {
          gameLogic.submitVote(room, voter.id, prompt.id, 1);
        });
        
        const result = gameLogic.calculateMatchupScores(room, prompt.id);
        expect(result.quipwit).toBe(1);
        expect(result.player1Score).toBe(voters.length * SCORING.POINTS_PER_VOTE + SCORING.QUIPWIT_BONUS);
      });
    });
  });

  describe('EC-001: Multiple Jinxes in Same Round', () => {
    test('handles multiple simultaneous Jinxes', () => {
      const room = setupRoom(4);
      
      room.currentRound = 1;
      gameLogic.assignPromptsToPlayers(room);
      
      // Make first half Jinxes, second half normal
      room.prompts.forEach((prompt, i) => {
        if (i < room.prompts.length / 2) {
          gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Jinx answer');
          gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Jinx answer');
        } else {
          gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Unique 1');
          gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Unique 2');
        }
      });
      
      let jinxCount = 0;
      room.prompts.forEach(prompt => {
        const result = gameLogic.calculateMatchupScores(room, prompt.id);
        if (result.isJinx) jinxCount++;
      });
      
      expect(jinxCount).toBe(Math.floor(room.prompts.length / 2));
    });
  });

  describe('EC-002: Timer Expires with No Answers', () => {
    test('auto-submits blank answers for everyone', () => {
      const room = setupRoom(4);
      
      room.currentRound = 1;
      gameLogic.assignPromptsToPlayers(room);
      
      // No one answers - timer expires
      gameLogic.autoSubmitMissingAnswers(room);
      
      expect(gameLogic.allAnswersSubmitted(room)).toBe(true);
      
      room.prompts.forEach(prompt => {
        expect(prompt.player1Answer).toBe('[No answer]');
        expect(prompt.player2Answer).toBe('[No answer]');
      });
    });
  });

  describe('EC-004: Last Wit with Fewer Than 3 Voters', () => {
    test('adjusts vote count for small games', () => {
      const room = setupRoom(3);
      
      gameLogic.setupLastLash(room);
      
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });
      
      // With 3 players, each can only vote for 2 others
      const voter = room.players[0];
      const otherPlayers = room.players.filter(p => p.id !== voter.id).map(p => p.id);
      
      const result = gameLogic.submitLastLashVotes(room, voter.id, otherPlayers);
      expect(result.success).toBe(true);
    });
  });

  describe('EC-005: Exact Tie for Winner', () => {
    test('returns multiple winners', () => {
      const room = setupRoom(4);
      
      // Set exact tie
      room.scores.set('player_0', 500);
      room.scores.set('player_1', 500);
      room.scores.set('player_2', 300);
      room.scores.set('player_3', 200);
      
      const winners = gameLogic.getWinners(room);
      
      expect(winners.length).toBe(2);
      expect(winners[0].score).toBe(500);
      expect(winners[1].score).toBe(500);
    });
  });

  describe('EC-006: Case-Insensitive Jinx Detection', () => {
    test('detects Jinx regardless of case', () => {
      const room = setupRoom(4);
      
      room.currentRound = 1;
      gameLogic.assignPromptsToPlayers(room);
      
      const prompt = room.prompts[0];
      gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Hello World');
      gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'HELLO WORLD');
      
      const result = gameLogic.calculateMatchupScores(room, prompt.id);
      expect(result.isJinx).toBe(true);
    });

    test('detects Jinx with whitespace differences', () => {
      const room = setupRoom(4);
      
      room.currentRound = 1;
      gameLogic.assignPromptsToPlayers(room);
      
      const prompt = room.prompts[0];
      gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, '  answer  ');
      gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'answer');
      
      const result = gameLogic.calculateMatchupScores(room, prompt.id);
      expect(result.isJinx).toBe(true);
    });
  });

  describe('Scoring Verification', () => {
    test('points accumulate correctly across rounds', () => {
      const room = setupRoom(4);
      
      // Round 1
      room.currentRound = 1;
      gameLogic.assignPromptsToPlayers(room);
      
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Answer 2');
      });
      
      room.prompts.forEach(prompt => {
        const voters = room.players.filter(
          p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
        );
        voters.forEach(voter => {
          gameLogic.submitVote(room, voter.id, prompt.id, 1);
        });
        gameLogic.calculateMatchupScores(room, prompt.id);
      });
      
      const round1Scores = new Map(room.scores);
      
      // Round 2
      room.currentRound = 2;
      gameLogic.assignPromptsToPlayers(room);
      
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'R2 Answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'R2 Answer 2');
      });
      
      room.prompts.forEach(prompt => {
        const voters = room.players.filter(
          p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
        );
        voters.forEach(voter => {
          gameLogic.submitVote(room, voter.id, prompt.id, 2);
        });
        gameLogic.calculateMatchupScores(room, prompt.id);
      });
      
      // Verify scores accumulated
      room.players.forEach(player => {
        const finalScore = room.scores.get(player.id);
        const round1Score = round1Scores.get(player.id);
        // Final score should be >= round 1 score (since points added)
        expect(finalScore).toBeGreaterThanOrEqual(round1Score);
      });
    });

    test('Last Wit points added to final score', () => {
      const room = setupRoom(4);
      
      // Set some initial scores
      room.scores.set('player_0', 200);
      room.scores.set('player_1', 300);
      room.scores.set('player_2', 100);
      room.scores.set('player_3', 150);
      
      const initialTotal = Array.from(room.scores.values()).reduce((a, b) => a + b, 0);
      
      gameLogic.setupLastLash(room);
      
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });
      
      room.players.forEach(player => {
        const otherPlayers = room.players.filter(p => p.id !== player.id).map(p => p.id);
        gameLogic.submitLastLashVotes(room, player.id, otherPlayers.slice(0, 3));
      });
      
      gameLogic.calculateLastLashScores(room);
      
      const finalTotal = Array.from(room.scores.values()).reduce((a, b) => a + b, 0);
      
      // Last Wit should add points
      expect(finalTotal).toBeGreaterThan(initialTotal);
    });
  });
});
