// Game States
const GAME_STATES = {
  LOBBY: 'LOBBY',
  PROMPT: 'PROMPT',
  VOTING: 'VOTING',
  SCORING: 'SCORING',
  LAST_LASH: 'LAST_LASH',
  LAST_LASH_VOTING: 'LAST_LASH_VOTING',
  GAME_OVER: 'GAME_OVER'
};

// Last Wit Game Modes (randomly selected each game)
const LAST_WIT_MODES = {
  FLASHBACK: 'FLASHBACK',   // Complete the story ending
  WORD_LASH: 'WORD_LASH',   // Create phrase from starting letters (e.g., T.F.N.)
  ACRO_LASH: 'ACRO_LASH'    // Expand acronym (e.g., R.D.F. -> "Rabid Ducks Fight")
};

// Game Configuration
const CONFIG = {
  MAX_PLAYERS: 8,
  MIN_PLAYERS: 3,
  ROUNDS_PER_GAME: 2,  // 2 regular rounds + 1 Last Wit
  PROMPTS_PER_PLAYER: 2,
  ANSWER_TIME_LIMIT: 90,  // seconds
  VOTE_TIME_LIMIT: 30,    // seconds
  LAST_LASH_ANSWER_TIME: 90, // seconds
  LAST_LASH_VOTE_TIME: 45,   // seconds
  MAX_ANSWER_LENGTH: 100,
  ROOM_CODE_LENGTH: 4
};

// Scoring
const SCORING = {
  POINTS_PER_VOTE: 100,
  QUIPWIT_BONUS: 100,  // Bonus for unanimous vote
  LAST_LASH_FIRST: 300,
  LAST_LASH_SECOND: 200,
  LAST_LASH_THIRD: 100
};

// Socket Events - Client to Server
const CLIENT_EVENTS = {
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  START_GAME: 'start_game',
  SUBMIT_ANSWER: 'submit_answer',
  SUBMIT_VOTE: 'submit_vote',
  SUBMIT_LAST_LASH_VOTES: 'submit_last_lash_votes',
  SKIP_PLAYER: 'skip_player',
  KICK_PLAYER: 'kick_player',
  PAUSE_GAME: 'pause_game',
  RESUME_GAME: 'resume_game',
  EXTEND_TIME: 'extend_time',
  END_GAME: 'end_game',
  REJOIN: 'rejoin',
  REJOIN_HOST: 'rejoin_host'
};

// Socket Events - Server to Client
const SERVER_EVENTS = {
  ROOM_CREATED: 'room_created',
  ROOM_JOINED: 'room_joined',
  ROOM_UPDATE: 'room_update',
  GAME_STARTED: 'game_started',
  PROMPT_PHASE: 'prompt_phase',
  RECEIVE_PROMPTS: 'receive_prompts',
  VOTING_PHASE: 'voting_phase',
  VOTE_MATCHUP: 'vote_matchup',
  MATCHUP_RESULT: 'matchup_result',
  ROUND_SCORES: 'round_scores',
  LAST_LASH_PHASE: 'last_lash_phase',
  LAST_LASH_PROMPT: 'last_lash_prompt',
  LAST_LASH_VOTING: 'last_lash_voting',
  LAST_LASH_RESULTS: 'last_lash_results',
  GAME_OVER: 'game_over',
  TIMER_UPDATE: 'timer_update',
  PLAYER_KICKED: 'player_kicked',
  GAME_PAUSED: 'game_paused',
  GAME_RESUMED: 'game_resumed',
  ERROR: 'error',
  PLAYER_SUBMITTED: 'player_submitted',
  PLAYER_VOTED: 'player_voted',
  REJOIN_SUCCESS: 'rejoin_success',
  REJOIN_HOST_SUCCESS: 'rejoin_host_success',
  WAITING: 'waiting'
};

module.exports = {
  GAME_STATES,
  LAST_WIT_MODES,
  CONFIG,
  SCORING,
  CLIENT_EVENTS,
  SERVER_EVENTS
};
