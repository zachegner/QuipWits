/**
 * Base Game Simulator
 * Provides WebSocket connection management and game flow state machine
 * for simulating complete games with multiple players
 */

const io = require('socket.io-client');
const { CLIENT_EVENTS, SERVER_EVENTS, CONFIG, GAME_STATES } = require('../../shared/constants');

class GameSimulator {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || 'http://localhost:3000';
    this.playerCount = options.playerCount || 4;
    this.logLevel = options.logLevel || 'info'; // 'debug', 'info', 'warn', 'error'
    this.actionDelay = options.actionDelay || 100; // Delay between actions in ms
    
    this.hostSocket = null;
    this.playerSockets = [];
    this.roomCode = null;
    this.hostId = null;
    this.playerIds = [];
    this.playerNames = [];
    
    // Game state tracking
    this.currentRound = 0;
    this.currentPrompts = [];
    this.currentMatchups = [];
    this.lastLashData = null;
    this.finalResults = null;
    
    // Event handlers storage
    this.eventHandlers = new Map();
    this.waitingFor = new Map(); // Map of eventName -> array of resolve functions
    
    // Results tracking
    this.gameLog = [];
    this.errors = [];
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, data };
    this.gameLog.push(logEntry);
    
    if (level === 'error') {
      this.errors.push(logEntry);
    }
    
    if (this.shouldLog(level)) {
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      if (data) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForEvent(eventName, timeout = 3600000) { // Default 1 hour timeout
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from waiting list
        const waiters = this.waitingFor.get(eventName) || [];
        const index = waiters.findIndex(w => w.resolve === resolve);
        if (index !== -1) {
          waiters.splice(index, 1);
          if (waiters.length === 0) {
            this.waitingFor.delete(eventName);
          }
        }
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeout);
      
      // Add to waiting list
      if (!this.waitingFor.has(eventName)) {
        this.waitingFor.set(eventName, []);
      }
      this.waitingFor.get(eventName).push({
        resolve: (data) => {
          clearTimeout(timeoutId);
          resolve(data);
        }
      });
    });
  }

  resolveEvent(eventName, data) {
    const waiters = this.waitingFor.get(eventName);
    if (waiters && waiters.length > 0) {
      // Resolve the first waiter (FIFO queue)
      const waiter = waiters.shift();
      if (waiters.length === 0) {
        this.waitingFor.delete(eventName);
      }
      waiter.resolve(data);
      return true;
    }
    return false;
  }

  setupEventHandlers() {
    // Host event handlers
    if (this.hostSocket) {
      this.hostSocket.on(SERVER_EVENTS.ROOM_CREATED, (data) => {
        this.log('debug', 'Host: Room created', data);
        this.roomCode = data.roomCode;
        this.hostId = data.hostId;
        this.resolveEvent(SERVER_EVENTS.ROOM_CREATED, data);
      });

      this.hostSocket.on(SERVER_EVENTS.ROOM_UPDATE, (data) => {
        this.log('debug', 'Host: Room update', data);
      });

      this.hostSocket.on(SERVER_EVENTS.GAME_STARTED, (data) => {
        this.log('info', 'Host: Game started', data);
      });

      this.hostSocket.on(SERVER_EVENTS.PROMPT_PHASE, (data) => {
        this.log('info', `Host: Prompt phase - Round ${data.round}`);
      });

      this.hostSocket.on(SERVER_EVENTS.VOTING_PHASE, (data) => {
        this.log('info', `Host: Voting phase - Round ${data.round}`);
      });

      this.hostSocket.on(SERVER_EVENTS.ROUND_SCORES, (data) => {
        this.log('info', `Host: Round ${data.round} scores`, data.scoreboard);
        this.resolveEvent(SERVER_EVENTS.ROUND_SCORES, data);
      });

      this.hostSocket.on(SERVER_EVENTS.LAST_WIT_MODE_REVEAL, (data) => {
        this.log('info', 'Host: Last Wit mode reveal', data.mode);
        this.resolveEvent(SERVER_EVENTS.LAST_WIT_MODE_REVEAL, data);
      });

      this.hostSocket.on(SERVER_EVENTS.LAST_LASH_RESULTS, (data) => {
        this.log('info', 'Host: Last Lash results', data);
        this.resolveEvent(SERVER_EVENTS.LAST_LASH_RESULTS, data);
      });

      this.hostSocket.on(SERVER_EVENTS.GAME_OVER, (data) => {
        this.log('info', 'Host: Game over', data);
        this.finalResults = data;
        this.resolveEvent(SERVER_EVENTS.GAME_OVER, data);
      });

      this.hostSocket.on(SERVER_EVENTS.ERROR, (data) => {
        this.log('error', 'Host: Error', data);
      });
    }

    // Player event handlers
    this.playerSockets.forEach((socket, index) => {
      socket.on(SERVER_EVENTS.ROOM_JOINED, (data) => {
        this.log('debug', `Player ${index + 1}: Room joined`, data);
        this.playerIds[index] = data.playerId;
        this.playerNames[index] = data.playerName;
        this.resolveEvent(SERVER_EVENTS.ROOM_JOINED, data);
      });

      socket.on(SERVER_EVENTS.RECEIVE_PROMPTS, (data) => {
        this.log('info', `Player ${index + 1}: Received prompts`, { count: data.prompts.length });
        this.currentPrompts[index] = data.prompts;
        this.resolveEvent(SERVER_EVENTS.RECEIVE_PROMPTS, data);
      });

      socket.on(SERVER_EVENTS.VOTE_MATCHUP, (data) => {
        this.log('info', `Player ${index + 1}: Vote matchup`, { promptId: data.promptId });
        // Add to currentMatchups
        this.currentMatchups.push(data);
        // Only resolve from first player to avoid multiple resolves for same matchup
        if (index === 0) {
          this.resolveEvent(SERVER_EVENTS.VOTE_MATCHUP, data);
        }
      });

      socket.on(SERVER_EVENTS.MATCHUP_RESULT, (data) => {
        this.log('debug', `Player ${index + 1}: Matchup result`, data);
        // Only resolve from first player to avoid multiple resolves
        if (index === 0) {
          this.resolveEvent(SERVER_EVENTS.MATCHUP_RESULT, data);
        }
      });

      socket.on(SERVER_EVENTS.LAST_LASH_PROMPT, (data) => {
        this.log('info', `Player ${index + 1}: Last Lash prompt`, { mode: data.mode });
        this.lastLashData = data;
        this.resolveEvent(SERVER_EVENTS.LAST_LASH_PROMPT, data);
      });

      socket.on(SERVER_EVENTS.LAST_LASH_VOTING, (data) => {
        this.log('info', `Player ${index + 1}: Last Lash voting`, { answerCount: data.answers.length });
        this.resolveEvent(SERVER_EVENTS.LAST_LASH_VOTING, data);
      });

      socket.on(SERVER_EVENTS.GAME_OVER, (data) => {
        this.log('info', `Player ${index + 1}: Game over`, data);
        this.finalResults = data;
      });

      socket.on(SERVER_EVENTS.ERROR, (data) => {
        this.log('error', `Player ${index + 1}: Error`, data);
      });
    });
  }

  async connectHost() {
    this.log('info', 'Connecting host...');
    this.hostSocket = io(this.serverUrl);
    
    return new Promise((resolve, reject) => {
      this.hostSocket.on('connect', () => {
        this.log('info', 'Host connected');
        resolve();
      });
      
      this.hostSocket.on('connect_error', (error) => {
        this.log('error', 'Host connection error', error);
        reject(error);
      });
    });
  }

  async connectPlayers() {
    this.log('info', `Connecting ${this.playerCount} players...`);
    this.playerSockets = [];
    this.playerIds = [];
    this.playerNames = [];
    
    const connections = [];
    for (let i = 0; i < this.playerCount; i++) {
      const socket = io(this.serverUrl);
      this.playerSockets.push(socket);
      
      connections.push(
        new Promise((resolve, reject) => {
          socket.on('connect', () => {
            this.log('debug', `Player ${i + 1} connected`);
            resolve();
          });
          
          socket.on('connect_error', (error) => {
            this.log('error', `Player ${i + 1} connection error`, error);
            reject(error);
          });
        })
      );
    }
    
    await Promise.all(connections);
    this.log('info', 'All players connected');
  }

  async createRoom() {
    this.log('info', 'Creating room...');
    this.hostSocket.emit(CLIENT_EVENTS.CREATE_ROOM, {});
    const data = await this.waitForEvent(SERVER_EVENTS.ROOM_CREATED);
    this.log('info', `Room created: ${this.roomCode}`);
    return data;
  }

  async joinPlayers() {
    this.log('info', 'Joining players to room...');
    
    for (let i = 0; i < this.playerCount; i++) {
      const playerName = `Player${i + 1}`;
      this.playerSockets[i].emit(CLIENT_EVENTS.JOIN_ROOM, {
        roomCode: this.roomCode,
        playerName
      });
      
      await this.waitForEvent(SERVER_EVENTS.ROOM_JOINED);
      await this.delay(this.actionDelay);
    }
    
    this.log('info', 'All players joined');
  }

  async startGame(theme = null) {
    this.log('info', 'Starting game...');
    this.hostSocket.emit(CLIENT_EVENTS.START_GAME, {
      roomCode: this.roomCode,
      theme
    });
    await this.delay(1000); // Wait for game start event
  }

  async handlePromptPhase(round, answerStrategy) {
    this.log('info', `=== Round ${round} - Prompt Phase ===`);
    this.currentRound = round;
    this.currentPrompts = [];
    
    // Wait for all players to receive prompts
    const promptPromises = [];
    for (let i = 0; i < this.playerCount; i++) {
      promptPromises.push(this.waitForEvent(SERVER_EVENTS.RECEIVE_PROMPTS));
    }
    
    await Promise.all(promptPromises);
    await this.delay(this.actionDelay);
    
    // Submit answers using strategy
    for (let i = 0; i < this.playerCount; i++) {
      const prompts = this.currentPrompts[i];
      if (!prompts) continue;
      
      for (const prompt of prompts) {
        const answer = await answerStrategy(i, prompt, round);
        if (answer !== null) {
          this.playerSockets[i].emit(CLIENT_EVENTS.SUBMIT_ANSWER, {
            roomCode: this.roomCode,
            promptId: prompt.id,
            answer
          });
          await this.delay(this.actionDelay);
        }
      }
    }
    
    this.log('info', 'All answers submitted');
  }

  async handleVotingPhase(round, voteStrategy) {
    this.log('info', `=== Round ${round} - Voting Phase ===`);
    this.currentMatchups = [];
    
    // Set up waiter for first matchup BEFORE any delays
    // Server sends first matchup 1.5 seconds after voting phase starts
    // Use very long timeout to accommodate any scenario (timeouts, delays, etc.)
    this.log('debug', 'Setting up waiter for first matchup...');
    const firstMatchupPromise = this.waitForEvent(SERVER_EVENTS.VOTE_MATCHUP, 3600000); // 1 hour
    
    // Now we can safely delay for voting phase announcement
    await this.delay(500);
    
    // Get the first matchup
    this.log('debug', 'Waiting for first matchup...');
    const firstMatchup = await firstMatchupPromise;
    
    if (!firstMatchup) {
      this.log('error', 'No first matchup received');
      return;
    }
    
    const totalMatchups = firstMatchup.totalMatchups;
    this.log('info', `Total matchups to process: ${totalMatchups}`);
    
    // Set up waiters for all remaining matchups NOW (before processing any)
    // Use very long timeout to accommodate any scenario (timeouts, delays, etc.)
    const matchupPromises = [];
    for (let i = 1; i < totalMatchups; i++) {
      matchupPromises.push(this.waitForEvent(SERVER_EVENTS.VOTE_MATCHUP, 3600000)); // 1 hour
    }
    
    // Process each matchup
    for (let matchupIndex = 0; matchupIndex < totalMatchups; matchupIndex++) {
      let matchup;
      
      if (matchupIndex === 0) {
        matchup = firstMatchup;
      } else {
        // Get the next matchup from our promises
        this.log('debug', `Waiting for matchup ${matchupIndex + 1}/${totalMatchups}...`);
        matchup = await matchupPromises[matchupIndex - 1];
        if (!matchup) {
          this.log('error', `No matchup ${matchupIndex + 1} received`);
          break;
        }
      }
      
      this.log('info', `Processing matchup ${matchupIndex + 1}/${totalMatchups} - ${matchup.promptId}`);
      
      // Submit votes using strategy
      for (let i = 0; i < this.playerCount; i++) {
        const playerId = this.playerIds[i];
        // Can't vote on own matchup
        if (matchup.player1Id === playerId || matchup.player2Id === playerId) {
          this.log('debug', `Player ${i + 1} skipping vote (own matchup)`);
          continue;
        }
        
        const vote = await voteStrategy(i, playerId, matchup, round, matchupIndex);
        if (vote !== null && vote !== undefined) {
          this.playerSockets[i].emit(CLIENT_EVENTS.SUBMIT_VOTE, {
            roomCode: this.roomCode,
            promptId: matchup.promptId,
            vote
          });
          await this.delay(this.actionDelay);
        }
      }
      
      this.log('debug', 'All votes submitted for this matchup');
      
      // Wait for server to process votes and show results before next matchup
      // If not all players voted, server waits for vote timer (30s) before showing results
      // Then shows results for 4s before sending next matchup
      if (matchupIndex < totalMatchups - 1) {
        await this.delay(6000); // Slightly longer to ensure server has time
      }
    }
    
    this.log('info', `All ${totalMatchups} matchups processed`);
    
    // Wait for round scores
    this.log('debug', 'Waiting for round scores...');
    const scores = await this.waitForEvent(SERVER_EVENTS.ROUND_SCORES);
    this.log('info', 'Round scores received');
    
    // If this is round 2 (last round), set up waiter for Last Wit mode reveal
    // Server sends it ~5 seconds after round scores
    let modeRevealPromise = null;
    if (round === CONFIG.ROUNDS_PER_GAME) {
      this.log('debug', 'Setting up waiter for Last Wit mode reveal...');
      modeRevealPromise = this.waitForEvent(SERVER_EVENTS.LAST_WIT_MODE_REVEAL);
    }
    
    await this.delay(5000); // Scores shown for 5 seconds
    
    return modeRevealPromise;
  }

  async handleLastLash(answerStrategy, voteStrategy, modeRevealPromise) {
    this.log('info', '=== Last Lash Phase ===');
    
    // Wait for mode reveal (using promise passed in)
    const modeReveal = await modeRevealPromise;
    this.log('info', `Last Wit mode: ${modeReveal.mode}`);
    await this.delay(2000);
    
    // Set up waiter for prompt BEFORE emitting continue event (which triggers the prompt)
    const promptPromise = this.waitForEvent(SERVER_EVENTS.LAST_LASH_PROMPT);
    
    // Host continues (this triggers the prompt to be sent)
    this.hostSocket.emit(CLIENT_EVENTS.CONTINUE_LAST_WIT, { roomCode: this.roomCode });
    
    // Wait for prompt (using promise we set up earlier)
    this.log('debug', 'Waiting for Last Lash prompt...');
    const promptData = await promptPromise;
    this.log('debug', 'Last Lash prompt received');
    
    // Set up waiter for voting phase BEFORE submitting answers
    // (server may send voting immediately after all answers received)
    const votingPromise = this.waitForEvent(SERVER_EVENTS.LAST_LASH_VOTING);
    
    // Submit answers
    for (let i = 0; i < this.playerCount; i++) {
      const answer = await answerStrategy(i, promptData, 'lastLash');
      if (answer !== null && answer !== undefined) {
        this.playerSockets[i].emit(CLIENT_EVENTS.SUBMIT_ANSWER, {
          roomCode: this.roomCode,
          answer,
          isLastLash: true
        });
        await this.delay(this.actionDelay);
      }
    }
    
    this.log('info', 'All Last Lash answers submitted');
    
    // Wait for voting phase (using promise we set up earlier)
    this.log('debug', 'Waiting for Last Lash voting phase...');
    const votingData = await votingPromise;
    this.log('debug', 'Last Lash voting phase started');
    
    // Set up waiter for results BEFORE submitting votes
    const resultsPromise = this.waitForEvent(SERVER_EVENTS.LAST_LASH_RESULTS);
    
    // Submit votes
    for (let i = 0; i < this.playerCount; i++) {
      const playerId = this.playerIds[i];
      const votes = await voteStrategy(i, playerId, votingData, 'lastLash');
      if (votes !== null && votes !== undefined) {
        this.playerSockets[i].emit(CLIENT_EVENTS.SUBMIT_LAST_LASH_VOTES, {
          roomCode: this.roomCode,
          votes
        });
        await this.delay(this.actionDelay);
      }
    }
    
    this.log('info', 'All Last Lash votes submitted');
    
    // Wait for results (using promise we set up earlier)
    this.log('debug', 'Waiting for Last Lash results...');
    const results = await resultsPromise;
    this.log('info', 'Last Lash results received');
    
    // Set up waiter for game over BEFORE the results delay
    const gameOverPromise = this.waitForEvent(SERVER_EVENTS.GAME_OVER);
    await this.delay(8000); // Results shown for 8 seconds
    
    return gameOverPromise;
  }

  async playGame(answerStrategy, voteStrategy) {
    try {
      // Setup
      await this.connectHost();
      await this.connectPlayers();
      this.setupEventHandlers();
      
      await this.createRoom();
      await this.joinPlayers();
      await this.startGame();
      
      // Round 1
      await this.handlePromptPhase(1, answerStrategy);
      await this.handleVotingPhase(1, voteStrategy);
      
      // Round 2 (returns mode reveal promise after final round)
      await this.handlePromptPhase(2, answerStrategy);
      const modeRevealPromise = await this.handleVotingPhase(2, voteStrategy);
      
      // Last Lash (returns a promise for game over)
      const gameOver = await this.handleLastLash(answerStrategy, voteStrategy, modeRevealPromise);
      this.log('info', '=== Game Complete ===');
      
      return {
        success: true,
        results: gameOver,
        log: this.gameLog,
        errors: this.errors
      };
    } catch (error) {
      this.log('error', 'Game simulation failed', error);
      return {
        success: false,
        error: error.message,
        log: this.gameLog,
        errors: this.errors
      };
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    this.log('info', 'Cleaning up connections...');
    
    if (this.hostSocket) {
      this.hostSocket.disconnect();
    }
    
    for (const socket of this.playerSockets) {
      socket.disconnect();
    }
    
    await this.delay(500);
    this.log('info', 'Cleanup complete');
  }

  getSummary() {
    return {
      roomCode: this.roomCode,
      players: this.playerNames,
      finalResults: this.finalResults,
      errors: this.errors.length,
      logEntries: this.gameLog.length
    };
  }
}

module.exports = GameSimulator;

