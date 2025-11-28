/**
 * Jest Test Setup
 * Global configuration and utilities for all tests
 */

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock console.log to keep test output clean (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
// };

// Helper to generate unique test identifiers
global.generateTestId = () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Helper to create mock player data
global.createMockPlayer = (overrides = {}) => ({
  id: global.generateTestId(),
  socketId: `socket_${global.generateTestId()}`,
  name: `Player${Math.floor(Math.random() * 1000)}`,
  isConnected: true,
  promptsAssigned: [],
  answersSubmitted: 0,
  hasVoted: new Set(),
  ...overrides
});

// Helper to create mock room data
global.createMockRoom = (overrides = {}) => ({
  code: 'TEST',
  hostSocketId: `host_${global.generateTestId()}`,
  hostId: global.generateTestId(),
  state: 'LOBBY',
  players: [],
  currentRound: 0,
  prompts: [],
  answers: new Map(),
  votes: new Map(),
  scores: new Map(),
  currentMatchupIndex: 0,
  matchups: [],
  lastLashPrompt: null,
  lastLashAnswers: [],
  lastLashVotes: new Map(),
  isPaused: false,
  timerEndTime: null,
  remainingTimeOnPause: null,
  pausedInState: null,
  createdAt: Date.now(),
  ...overrides
});

// Clean up after all tests
afterAll(() => {
  // Any global cleanup
});
