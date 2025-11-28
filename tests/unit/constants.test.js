/**
 * Unit Tests for Shared Constants (shared/constants.js)
 * Tests: Game states, config values, scoring, events
 */

const { GAME_STATES, CONFIG, SCORING, CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/constants');

describe('Shared Constants', () => {
  describe('Game States', () => {
    test('CV-001: all 7 game states are defined', () => {
      expect(Object.keys(GAME_STATES).length).toBe(7);
      
      expect(GAME_STATES.LOBBY).toBe('LOBBY');
      expect(GAME_STATES.PROMPT).toBe('PROMPT');
      expect(GAME_STATES.VOTING).toBe('VOTING');
      expect(GAME_STATES.SCORING).toBe('SCORING');
      expect(GAME_STATES.LAST_LASH).toBe('LAST_LASH');
      expect(GAME_STATES.LAST_LASH_VOTING).toBe('LAST_LASH_VOTING');
      expect(GAME_STATES.GAME_OVER).toBe('GAME_OVER');
    });

    test('game states are unique strings', () => {
      const values = Object.values(GAME_STATES);
      const uniqueValues = new Set(values);
      
      expect(uniqueValues.size).toBe(values.length);
      values.forEach(v => expect(typeof v).toBe('string'));
    });
  });

  describe('Config Values', () => {
    test('CV-002: config values are within acceptable ranges', () => {
      expect(CONFIG.MAX_PLAYERS).toBeGreaterThanOrEqual(3);
      expect(CONFIG.MAX_PLAYERS).toBeLessThanOrEqual(20);
      
      expect(CONFIG.MIN_PLAYERS).toBeGreaterThanOrEqual(2);
      expect(CONFIG.MIN_PLAYERS).toBeLessThanOrEqual(CONFIG.MAX_PLAYERS);
      
      expect(CONFIG.ROUNDS_PER_GAME).toBeGreaterThanOrEqual(1);
      expect(CONFIG.ROUNDS_PER_GAME).toBeLessThanOrEqual(10);
      
      expect(CONFIG.PROMPTS_PER_PLAYER).toBeGreaterThanOrEqual(1);
      
      expect(CONFIG.ANSWER_TIME_LIMIT).toBeGreaterThanOrEqual(10);
      expect(CONFIG.VOTE_TIME_LIMIT).toBeGreaterThanOrEqual(10);
      
      expect(CONFIG.MAX_ANSWER_LENGTH).toBeGreaterThanOrEqual(10);
      
      expect(CONFIG.ROOM_CODE_LENGTH).toBeGreaterThanOrEqual(3);
      expect(CONFIG.ROOM_CODE_LENGTH).toBeLessThanOrEqual(8);
    });

    test('config values are positive numbers', () => {
      Object.values(CONFIG).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
      });
    });

    test('MIN_PLAYERS is less than MAX_PLAYERS', () => {
      expect(CONFIG.MIN_PLAYERS).toBeLessThan(CONFIG.MAX_PLAYERS);
    });

    test('time limits make sense', () => {
      // Answer time should be at least as long as vote time
      expect(CONFIG.ANSWER_TIME_LIMIT).toBeGreaterThanOrEqual(CONFIG.VOTE_TIME_LIMIT);
      // Last Wit answer should have more time (everyone answers same prompt)
      expect(CONFIG.LAST_LASH_ANSWER_TIME).toBeGreaterThanOrEqual(CONFIG.ANSWER_TIME_LIMIT);
    });
  });

  describe('Scoring Values', () => {
    test('CV-003: all scoring values are positive', () => {
      expect(SCORING.POINTS_PER_VOTE).toBeGreaterThan(0);
      expect(SCORING.QUIPWIT_BONUS).toBeGreaterThan(0);
      expect(SCORING.LAST_LASH_FIRST).toBeGreaterThan(0);
      expect(SCORING.LAST_LASH_SECOND).toBeGreaterThan(0);
      expect(SCORING.LAST_LASH_THIRD).toBeGreaterThan(0);
    });

    test('Last Wit scoring is in correct order', () => {
      expect(SCORING.LAST_LASH_FIRST).toBeGreaterThan(SCORING.LAST_LASH_SECOND);
      expect(SCORING.LAST_LASH_SECOND).toBeGreaterThan(SCORING.LAST_LASH_THIRD);
    });

    test('QuipWit bonus is meaningful', () => {
      // Bonus should be significant compared to per-vote points
      expect(SCORING.QUIPWIT_BONUS).toBeGreaterThanOrEqual(SCORING.POINTS_PER_VOTE);
    });
  });

  describe('Socket Events', () => {
    test('CV-004: client events are defined', () => {
      const expectedClientEvents = [
        'CREATE_ROOM',
        'JOIN_ROOM',
        'START_GAME',
        'SUBMIT_ANSWER',
        'SUBMIT_VOTE',
        'SUBMIT_LAST_LASH_VOTES',
        'SKIP_PLAYER',
        'KICK_PLAYER',
        'PAUSE_GAME',
        'RESUME_GAME',
        'EXTEND_TIME',
        'END_GAME',
        'REJOIN',
        'REJOIN_HOST'
      ];

      expectedClientEvents.forEach(event => {
        expect(CLIENT_EVENTS[event]).toBeDefined();
        expect(typeof CLIENT_EVENTS[event]).toBe('string');
      });
    });

    test('server events are defined', () => {
      const expectedServerEvents = [
        'ROOM_CREATED',
        'ROOM_JOINED',
        'ROOM_UPDATE',
        'GAME_STARTED',
        'PROMPT_PHASE',
        'RECEIVE_PROMPTS',
        'VOTING_PHASE',
        'VOTE_MATCHUP',
        'MATCHUP_RESULT',
        'ROUND_SCORES',
        'LAST_LASH_PHASE',
        'LAST_LASH_PROMPT',
        'LAST_LASH_VOTING',
        'LAST_LASH_RESULTS',
        'GAME_OVER',
        'TIMER_UPDATE',
        'PLAYER_KICKED',
        'GAME_PAUSED',
        'GAME_RESUMED',
        'ERROR',
        'PLAYER_SUBMITTED',
        'PLAYER_VOTED',
        'REJOIN_SUCCESS',
        'REJOIN_HOST_SUCCESS'
      ];

      expectedServerEvents.forEach(event => {
        expect(SERVER_EVENTS[event]).toBeDefined();
        expect(typeof SERVER_EVENTS[event]).toBe('string');
      });
    });

    test('event values are unique within their category', () => {
      const clientValues = Object.values(CLIENT_EVENTS);
      const serverValues = Object.values(SERVER_EVENTS);
      
      expect(new Set(clientValues).size).toBe(clientValues.length);
      expect(new Set(serverValues).size).toBe(serverValues.length);
    });

    test('event names follow snake_case convention', () => {
      const allEvents = [...Object.values(CLIENT_EVENTS), ...Object.values(SERVER_EVENTS)];
      
      allEvents.forEach(event => {
        expect(event).toMatch(/^[a-z_]+$/);
      });
    });
  });
});
