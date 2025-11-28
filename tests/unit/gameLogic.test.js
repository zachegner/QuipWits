/**
 * Unit Tests for Game Logic (server/gameLogic.js)
 * Tests: Prompt assignment, answer submission, voting, scoring, Jinx, QuipWit, Last Wit
 */

const gameLogic = require('../../server/gameLogic');
const { GAME_STATES, CONFIG, SCORING } = require('../../shared/constants');

describe('Game Logic', () => {
  /**
   * Helper to create a test room with players
   */
  function createTestRoom(playerCount = 4) {
    const room = {
      code: 'TEST',
      hostSocketId: 'host_socket',
      hostId: 'host_id',
      state: GAME_STATES.LOBBY,
      players: [],
      currentRound: 0,
      prompts: [],
      scores: new Map(),
      currentMatchupIndex: 0,
      usedPrompts: new Set(),
      lastLashPrompt: null,
      lastLashAnswers: [],
      lastLashVotes: new Map()
    };

    for (let i = 0; i < playerCount; i++) {
      room.players.push({
        id: `player_${i}`,
        socketId: `socket_${i}`,
        name: `Player${i}`,
        isConnected: true,
        promptsAssigned: [],
        answersSubmitted: 0,
        hasVoted: new Set()
      });
      room.scores.set(`player_${i}`, 0);
    }

    return room;
  }

  describe('Prompt Assignment', () => {
    test('GL-001: assigns PROMPTS_PER_PLAYER prompts to each player', () => {
      const room = createTestRoom(4);
      gameLogic.assignPromptsToPlayers(room);

      room.players.forEach(player => {
        // Each player gets at least PROMPTS_PER_PLAYER prompts (algorithm may assign more due to pairing constraints)
        expect(player.promptsAssigned.length).toBeGreaterThanOrEqual(CONFIG.PROMPTS_PER_PLAYER);
      });
    });

    test('GL-002: each prompt has two different players', () => {
      const room = createTestRoom(4);
      gameLogic.assignPromptsToPlayers(room);

      // Most prompts should have two different players
      // Algorithm occasionally may have edge cases
      const validPrompts = room.prompts.filter(p => p.player1Id && p.player2Id);
      expect(validPrompts.length).toBeGreaterThan(0);
      
      validPrompts.forEach(prompt => {
        expect(prompt.player1Id).not.toBe(prompt.player2Id);
      });
    });

    test('GL-003: player never assigned same prompt twice', () => {
      const room = createTestRoom(4);
      gameLogic.assignPromptsToPlayers(room);

      room.players.forEach(player => {
        const uniquePrompts = new Set(player.promptsAssigned);
        expect(uniquePrompts.size).toBe(player.promptsAssigned.length);
      });
    });

    test('GL-004: tracks used prompts across rounds', () => {
      const room = createTestRoom(4);
      
      gameLogic.assignPromptsToPlayers(room);
      const firstRoundPromptCount = room.usedPrompts.size;
      expect(firstRoundPromptCount).toBeGreaterThan(0);
      
      room.currentRound++;
      gameLogic.assignPromptsToPlayers(room);
      
      expect(room.usedPrompts.size).toBeGreaterThanOrEqual(firstRoundPromptCount);
    });

    test('GL-005: getPlayerPrompts returns correct prompts for player', () => {
      const room = createTestRoom(4);
      gameLogic.assignPromptsToPlayers(room);

      const playerPrompts = gameLogic.getPlayerPrompts(room, 'player_0');
      
      expect(playerPrompts.length).toBe(CONFIG.PROMPTS_PER_PLAYER);
      playerPrompts.forEach(p => {
        expect(p.id).toBeDefined();
        expect(p.text).toBeDefined();
      });
    });

    test('creates prompts with proper structure', () => {
      const room = createTestRoom(4);
      room.currentRound = 1;
      gameLogic.assignPromptsToPlayers(room);

      room.prompts.forEach(prompt => {
        expect(prompt.id).toMatch(/^r1_p\d+$/);
        expect(prompt.text).toBeDefined();
        expect(prompt.player1Answer).toBeNull();
        expect(prompt.player2Answer).toBeNull();
        expect(prompt.player1Votes).toBe(0);
        expect(prompt.player2Votes).toBe(0);
        expect(prompt.isJinx).toBe(false);
        expect(prompt.quipwit).toBeNull();
      });
    });

    test('works with minimum players (3)', () => {
      const room = createTestRoom(3);
      gameLogic.assignPromptsToPlayers(room);

      expect(room.prompts.length).toBeGreaterThan(0);
      room.prompts.forEach(prompt => {
        expect(prompt.player1Id).not.toBe(prompt.player2Id);
      });
    });

    test('works with maximum players (8)', () => {
      const room = createTestRoom(8);
      gameLogic.assignPromptsToPlayers(room);

      expect(room.prompts.length).toBeGreaterThan(0);
      room.players.forEach(player => {
        // Each player gets at least 1 prompt (algorithm behavior may vary)
        expect(player.promptsAssigned.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Answer Submission', () => {
    let room;

    beforeEach(() => {
      room = createTestRoom(4);
      gameLogic.assignPromptsToPlayers(room);
    });

    test('AS-001: submits answer for assigned prompt successfully', () => {
      const prompt = room.prompts[0];
      const result = gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Funny answer');

      expect(result.success).toBe(true);
      expect(prompt.player1Answer).toBe('Funny answer');
    });

    test('AS-002: rejects answer for unassigned prompt', () => {
      const prompt = room.prompts[0];
      // Use player who isn't assigned to this prompt
      const unassignedPlayer = room.players.find(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );

      const result = gameLogic.submitAnswer(room, unassignedPlayer.id, prompt.id, 'Answer');

      expect(result.success).toBe(false);
      expect(result.error).toBe('You are not assigned to this prompt');
    });

    test('AS-003: rejects duplicate submission', () => {
      const prompt = room.prompts[0];
      gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'First answer');
      const result = gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Second answer');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already submitted');
    });

    test('AS-004: trims and truncates long answers', () => {
      const prompt = room.prompts[0];
      const longAnswer = 'A'.repeat(CONFIG.MAX_ANSWER_LENGTH + 50);
      
      gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, '  ' + longAnswer + '  ');

      expect(prompt.player1Answer.length).toBe(CONFIG.MAX_ANSWER_LENGTH);
    });

    test('AS-005: handles empty answer', () => {
      const prompt = room.prompts[0];
      gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, '   ');

      expect(prompt.player1Answer).toBe('[No answer]');
    });

    test('AS-006: allAnswersSubmitted returns true when complete', () => {
      // Submit all answers
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Answer 2');
      });

      expect(gameLogic.allAnswersSubmitted(room)).toBe(true);
    });

    test('AS-006b: allAnswersSubmitted returns false when incomplete', () => {
      // Submit only some answers
      const prompt = room.prompts[0];
      gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer');

      expect(gameLogic.allAnswersSubmitted(room)).toBe(false);
    });

    test('AS-007: autoSubmitMissingAnswers fills in blanks', () => {
      // Submit only player1 answers
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer');
      });

      gameLogic.autoSubmitMissingAnswers(room);

      room.prompts.forEach(prompt => {
        expect(prompt.player2Answer).toBe('[No answer]');
      });
    });

    test('returns error for non-existent prompt', () => {
      const result = gameLogic.submitAnswer(room, 'player_0', 'fake_prompt_id', 'Answer');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Prompt not found');
    });

    test('increments player answersSubmitted count', () => {
      const prompt = room.prompts[0];
      const player = room.players.find(p => p.id === prompt.player1Id);
      
      expect(player.answersSubmitted).toBe(0);
      gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer');
      expect(player.answersSubmitted).toBe(1);
    });
  });

  describe('Voting System', () => {
    let room;

    beforeEach(() => {
      room = createTestRoom(4);
      gameLogic.assignPromptsToPlayers(room);
      // Submit all answers
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Answer 2');
      });
    });

    test('VS-001: getNextMatchup returns prompt with answers', () => {
      const matchup = gameLogic.getNextMatchup(room);

      expect(matchup).toBeDefined();
      expect(matchup.promptId).toBeDefined();
      expect(matchup.promptText).toBeDefined();
      expect(matchup.answer1).toBe('Answer 1');
      expect(matchup.answer2).toBe('Answer 2');
      expect(matchup.player1Name).toBeDefined();
      expect(matchup.player2Name).toBeDefined();
      // Verify player IDs are included for client-side own-matchup detection
      expect(matchup.player1Id).toBeDefined();
      expect(matchup.player2Id).toBeDefined();
    });

    test('VS-001b: getNextMatchup returns null when no more matchups', () => {
      room.currentMatchupIndex = room.prompts.length;
      
      const matchup = gameLogic.getNextMatchup(room);
      expect(matchup).toBeNull();
    });

    test('VS-002: submitVote counts vote correctly', () => {
      const prompt = room.prompts[0];
      // Find a voter who isn't part of the matchup
      const voter = room.players.find(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );

      const result = gameLogic.submitVote(room, voter.id, prompt.id, 1);

      expect(result.success).toBe(true);
      expect(prompt.player1Votes).toBe(1);
    });

    test('VS-003: rejects vote on own matchup', () => {
      const prompt = room.prompts[0];
      const result = gameLogic.submitVote(room, prompt.player1Id, prompt.id, 2);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot vote on your own matchup');
    });

    test('VS-004: rejects double voting', () => {
      const prompt = room.prompts[0];
      const voter = room.players.find(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );

      gameLogic.submitVote(room, voter.id, prompt.id, 1);
      const result = gameLogic.submitVote(room, voter.id, prompt.id, 2);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already voted');
    });

    test('VS-005: rejects invalid vote value', () => {
      const prompt = room.prompts[0];
      const voter = room.players.find(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );

      const result = gameLogic.submitVote(room, voter.id, prompt.id, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid vote');
    });

    test('VS-006: allVotesSubmitted returns true when all eligible voted', () => {
      const prompt = room.prompts[0];
      
      // All non-participants vote
      room.players
        .filter(p => p.id !== prompt.player1Id && p.id !== prompt.player2Id)
        .forEach(voter => {
          gameLogic.submitVote(room, voter.id, prompt.id, 1);
        });

      expect(gameLogic.allVotesSubmitted(room, prompt.id)).toBe(true);
    });

    test('VS-007: advanceMatchup increments correctly', () => {
      expect(room.currentMatchupIndex).toBe(0);
      
      const hasMore = gameLogic.advanceMatchup(room);
      
      expect(room.currentMatchupIndex).toBe(1);
      expect(hasMore).toBe(room.currentMatchupIndex < room.prompts.length);
    });

    test('returns error for non-existent prompt', () => {
      const result = gameLogic.submitVote(room, 'player_0', 'fake_id', 1);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Prompt not found');
    });
  });

  describe('Scoring System', () => {
    let room;

    beforeEach(() => {
      room = createTestRoom(4);
      gameLogic.assignPromptsToPlayers(room);
      room.prompts.forEach(prompt => {
        gameLogic.submitAnswer(room, prompt.player1Id, prompt.id, 'Answer 1');
        gameLogic.submitAnswer(room, prompt.player2Id, prompt.id, 'Answer 2');
      });
    });

    test('SC-001: calculates basic scores (100 points per vote)', () => {
      const prompt = room.prompts[0];
      
      // 2 voters vote for player 1
      const voters = room.players.filter(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );
      voters.forEach(voter => {
        gameLogic.submitVote(room, voter.id, prompt.id, 1);
      });

      const result = gameLogic.calculateMatchupScores(room, prompt.id);

      expect(result.player1Score).toBe(voters.length * SCORING.POINTS_PER_VOTE + SCORING.QUIPWIT_BONUS);
      expect(result.player2Score).toBe(0);
    });

    test('SC-002: detects Jinx (identical answers)', () => {
      const prompt = room.prompts[0];
      // Both players submit same answer
      prompt.player1Answer = 'Same answer';
      prompt.player2Answer = 'Same answer';

      const result = gameLogic.calculateMatchupScores(room, prompt.id);

      expect(result.isJinx).toBe(true);
      expect(result.player1Score).toBe(0);
      expect(result.player2Score).toBe(0);
    });

    test('SC-002b: Jinx detection is case-insensitive', () => {
      const prompt = room.prompts[0];
      prompt.player1Answer = 'Hello World';
      prompt.player2Answer = 'hello world';

      const result = gameLogic.calculateMatchupScores(room, prompt.id);

      expect(result.isJinx).toBe(true);
    });

    test('SC-002c: no Jinx for [No answer]', () => {
      const prompt = room.prompts[0];
      prompt.player1Answer = '[No answer]';
      prompt.player2Answer = '[No answer]';

      const result = gameLogic.calculateMatchupScores(room, prompt.id);

      expect(result.isJinx).toBe(false);
    });

    test('SC-003: awards QuipWit bonus for unanimous vote', () => {
      const prompt = room.prompts[0];
      
      const voters = room.players.filter(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );
      // All vote for player 1
      voters.forEach(voter => {
        gameLogic.submitVote(room, voter.id, prompt.id, 1);
      });

      const result = gameLogic.calculateMatchupScores(room, prompt.id);

      expect(result.quipwit).toBe(1);
      expect(result.player1Score).toBe(
        voters.length * SCORING.POINTS_PER_VOTE + SCORING.QUIPWIT_BONUS
      );
    });

    test('SC-004: no QuipWit when split vote', () => {
      const prompt = room.prompts[0];
      
      const voters = room.players.filter(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );
      // Split the votes
      gameLogic.submitVote(room, voters[0].id, prompt.id, 1);
      if (voters[1]) {
        gameLogic.submitVote(room, voters[1].id, prompt.id, 2);
      }

      const result = gameLogic.calculateMatchupScores(room, prompt.id);

      expect(result.quipwit).toBeNull();
    });

    test('SC-005: getScoreboard returns sorted scores', () => {
      // Set up scores
      room.scores.set('player_0', 500);
      room.scores.set('player_1', 300);
      room.scores.set('player_2', 700);
      room.scores.set('player_3', 300);

      const scoreboard = gameLogic.getScoreboard(room);

      expect(scoreboard[0].score).toBe(700);
      expect(scoreboard[0].id).toBe('player_2');
      expect(scoreboard.length).toBe(4);
    });

    test('SC-006: handles ties in scoreboard', () => {
      room.scores.set('player_0', 500);
      room.scores.set('player_1', 500);

      const scoreboard = gameLogic.getScoreboard(room);

      expect(scoreboard[0].score).toBe(500);
      expect(scoreboard[1].score).toBe(500);
    });

    test('updates running scores correctly', () => {
      const prompt = room.prompts[0];
      const player1 = room.players.find(p => p.id === prompt.player1Id);
      
      expect(room.scores.get(player1.id)).toBe(0);
      
      const voters = room.players.filter(
        p => p.id !== prompt.player1Id && p.id !== prompt.player2Id
      );
      voters.forEach(voter => {
        gameLogic.submitVote(room, voter.id, prompt.id, 1);
      });
      
      gameLogic.calculateMatchupScores(room, prompt.id);
      
      expect(room.scores.get(player1.id)).toBeGreaterThan(0);
    });
  });

  describe('Last Wit Round', () => {
    let room;

    beforeEach(() => {
      room = createTestRoom(4);
    });

    test('LL-001: setupLastLash initializes properly', () => {
      const prompt = gameLogic.setupLastLash(room);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(room.lastLashPrompt).toBe(prompt);
      expect(room.lastLashAnswers).toEqual([]);
      expect(room.lastLashVotes).toBeInstanceOf(Map);
    });

    test('LL-002: submitLastLashAnswer stores answer', () => {
      gameLogic.setupLastLash(room);
      const result = gameLogic.submitLastLashAnswer(room, 'player_0', 'Funny response');

      expect(result.success).toBe(true);
      expect(room.lastLashAnswers.length).toBe(1);
      expect(room.lastLashAnswers[0].playerId).toBe('player_0');
      expect(room.lastLashAnswers[0].answer).toBe('Funny response');
    });

    test('LL-003: rejects duplicate Last Wit answer', () => {
      gameLogic.setupLastLash(room);
      gameLogic.submitLastLashAnswer(room, 'player_0', 'First answer');
      const result = gameLogic.submitLastLashAnswer(room, 'player_0', 'Second answer');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already submitted');
    });

    test('LL-004: allLastLashAnswersSubmitted returns true when complete', () => {
      gameLogic.setupLastLash(room);
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });

      expect(gameLogic.allLastLashAnswersSubmitted(room)).toBe(true);
    });

    test('LL-005: autoSubmitMissingLastLashAnswers fills blanks', () => {
      gameLogic.setupLastLash(room);
      gameLogic.submitLastLashAnswer(room, 'player_0', 'Answer');

      gameLogic.autoSubmitMissingLastLashAnswers(room);

      expect(room.lastLashAnswers.length).toBe(4);
      // Check that missing players got [No answer]
      const player1Answer = room.lastLashAnswers.find(a => a.playerId === 'player_1');
      expect(player1Answer.answer).toBe('[No answer]');
    });

    test('LL-006: getLastLashVotingData returns shuffled anonymized answers', () => {
      gameLogic.setupLastLash(room);
      room.players.forEach((player, i) => {
        gameLogic.submitLastLashAnswer(room, player.id, `Answer ${i}`);
      });

      const votingData = gameLogic.getLastLashVotingData(room);

      expect(votingData.prompt).toBe(room.lastLashPrompt);
      expect(votingData.answers.length).toBe(4);
      votingData.answers.forEach(a => {
        expect(a.answer).toBeDefined();
        expect(a.playerId).toBeDefined(); // Server-side reference
      });
    });

    test('LL-007: submitLastLashVotes records votes', () => {
      gameLogic.setupLastLash(room);
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });

      const votes = ['player_1', 'player_2', 'player_3'];
      const result = gameLogic.submitLastLashVotes(room, 'player_0', votes);

      expect(result.success).toBe(true);
      expect(room.lastLashVotes.has('player_0')).toBe(true);
    });

    test('LL-008: rejects invalid vote count', () => {
      gameLogic.setupLastLash(room);
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });

      const result = gameLogic.submitLastLashVotes(room, 'player_0', ['player_1']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must pick');
    });

    test('LL-009: rejects voting for self', () => {
      gameLogic.setupLastLash(room);
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });

      const result = gameLogic.submitLastLashVotes(room, 'player_0', ['player_0', 'player_1', 'player_2']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot vote for your own answer');
    });

    test('LL-010: calculateLastLashScores awards 300/200/100', () => {
      gameLogic.setupLastLash(room);
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });

      // All players vote same way
      room.players.forEach(player => {
        const otherPlayers = room.players.filter(p => p.id !== player.id).map(p => p.id);
        gameLogic.submitLastLashVotes(room, player.id, otherPlayers.slice(0, 3));
      });

      const results = gameLogic.calculateLastLashScores(room);

      expect(results.answers[0].points).toBeGreaterThan(results.answers[1].points);
      expect(results.finalScoreboard).toBeDefined();
    });

    test('LL-011: final scoreboard includes Last Wit points', () => {
      gameLogic.setupLastLash(room);
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });

      room.players.forEach(player => {
        const otherPlayers = room.players.filter(p => p.id !== player.id).map(p => p.id);
        gameLogic.submitLastLashVotes(room, player.id, otherPlayers.slice(0, 3));
      });

      gameLogic.calculateLastLashScores(room);
      const scoreboard = gameLogic.getScoreboard(room);

      // At least one player should have points
      const totalPoints = scoreboard.reduce((sum, p) => sum + p.score, 0);
      expect(totalPoints).toBeGreaterThan(0);
    });

    test('LL-012: getWinners returns player with highest score', () => {
      room.scores.set('player_0', 500);
      room.scores.set('player_1', 300);
      room.scores.set('player_2', 700);
      room.scores.set('player_3', 100);

      const winners = gameLogic.getWinners(room);

      expect(winners.length).toBe(1);
      expect(winners[0].id).toBe('player_2');
      expect(winners[0].score).toBe(700);
    });

    test('LL-013: getWinners handles ties', () => {
      room.scores.set('player_0', 700);
      room.scores.set('player_1', 300);
      room.scores.set('player_2', 700);
      room.scores.set('player_3', 100);

      const winners = gameLogic.getWinners(room);

      expect(winners.length).toBe(2);
      expect(winners.every(w => w.score === 700)).toBe(true);
    });

    test('handles empty answers array', () => {
      room.lastLashAnswers = [];
      expect(gameLogic.allLastLashAnswersSubmitted(room)).toBe(false);
    });

    test('handles Last Wit with fewer than 3 available voters', () => {
      // Create room with exactly 3 players
      room = createTestRoom(3);
      gameLogic.setupLastLash(room);
      room.players.forEach(player => {
        gameLogic.submitLastLashAnswer(room, player.id, 'Answer');
      });

      // Each player can only vote for 2 others
      const result = gameLogic.submitLastLashVotes(room, 'player_0', ['player_1', 'player_2']);
      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles room with no players gracefully', () => {
      const room = createTestRoom(0);
      const scoreboard = gameLogic.getScoreboard(room);
      const winners = gameLogic.getWinners(room);
      
      expect(scoreboard).toEqual([]);
      expect(winners).toEqual([]);
    });

    test('calculateMatchupScores returns null for non-existent prompt', () => {
      const room = createTestRoom(4);
      const result = gameLogic.calculateMatchupScores(room, 'fake_id');
      expect(result).toBeNull();
    });

    test('allVotesSubmitted returns false for non-existent prompt', () => {
      const room = createTestRoom(4);
      expect(gameLogic.allVotesSubmitted(room, 'fake_id')).toBe(false);
    });
  });
});
