const { CONFIG, SCORING, GAME_STATES, LAST_WIT_MODES } = require('../shared/constants');
const { 
  generateUniquePrompts, 
  generateUniquePromptsAsync, 
  generateLastLashPrompt, 
  generateLastLashPromptAsync, 
  getPromptsNeededForRound,
  generateLastWitPrompt,
  generateLastWitPromptAsync,
  validateWordLashAnswer,
  validateAcroLashAnswer
} = require('./promptGenerator');

/**
 * Assign prompts to players for a round
 * Each prompt goes to exactly 2 players
 * Each player gets PROMPTS_PER_PLAYER prompts
 */
function assignPromptsToPlayers(room) {
  const players = room.players;
  const playerCount = players.length;
  const promptsPerPlayer = CONFIG.PROMPTS_PER_PLAYER;
  
  // Track used prompts across the game
  if (!room.usedPrompts) {
    room.usedPrompts = new Set();
  }
  
  // Calculate number of prompts needed
  const promptCount = getPromptsNeededForRound(playerCount, promptsPerPlayer);
  
  // Generate unique prompts (sync version for backwards compatibility)
  const promptTexts = generateUniquePrompts(promptCount, room.usedPrompts);
  
  return assignPromptsToPlayersWithTexts(room, promptTexts, players, playerCount, promptsPerPlayer);
}

/**
 * Assign prompts to players for a round (async version with AI fallback)
 * Each prompt goes to exactly 2 players
 * Each player gets PROMPTS_PER_PLAYER prompts
 * @param {Object} room - The game room
 * @param {string|null} theme - Optional theme for themed prompt generation
 */
async function assignPromptsToPlayersAsync(room, theme = null) {
  const players = room.players;
  const playerCount = players.length;
  const promptsPerPlayer = CONFIG.PROMPTS_PER_PLAYER;
  
  // Track used prompts across the game
  if (!room.usedPrompts) {
    room.usedPrompts = new Set();
  }
  
  // Calculate number of prompts needed
  const promptCount = getPromptsNeededForRound(playerCount, promptsPerPlayer);
  
  // Generate unique prompts with AI fallback, passing theme for themed generation
  const promptTexts = await generateUniquePromptsAsync(promptCount, room.usedPrompts, true, theme);
  
  return assignPromptsToPlayersWithTexts(room, promptTexts, players, playerCount, promptsPerPlayer);
}

/**
 * Internal helper to assign prompts to players given prompt texts
 * Uses a pairing algorithm that guarantees each player gets exactly promptsPerPlayer prompts
 */
function assignPromptsToPlayersWithTexts(room, promptTexts, players, playerCount, promptsPerPlayer) {
  // Create prompt objects with IDs
  const prompts = promptTexts.map((text, index) => ({
    id: `r${room.currentRound}_p${index}`,
    text,
    player1Id: null,
    player2Id: null,
    player1Answer: null,
    player2Answer: null,
    player1Votes: 0,
    player2Votes: 0,
    isJinx: false,
    quipwit: null  // Will be 1 or 2 if a player got all votes
  }));
  
  // Reset player prompt assignments
  players.forEach(p => {
    p.promptsAssigned = [];
    p.answersSubmitted = 0;
    p.hasVoted = new Set();
  });
  
  // Build pairs using a balanced assignment algorithm
  // Each player needs exactly promptsPerPlayer assignments
  // Each prompt needs exactly 2 different players
  
  // Track how many more assignments each player needs
  const assignmentsNeeded = new Map();
  players.forEach(p => assignmentsNeeded.set(p.id, promptsPerPlayer));
  
  // Create all valid pairs (player combinations) with weights
  // Prioritize pairing players who still need more assignments
  for (const prompt of prompts) {
    // Get players sorted by how many assignments they still need (most needed first)
    const availablePlayers = players
      .filter(p => assignmentsNeeded.get(p.id) > 0)
      .sort((a, b) => assignmentsNeeded.get(b.id) - assignmentsNeeded.get(a.id));
    
    if (availablePlayers.length >= 2) {
      // Take the two players who need the most assignments
      // Add some randomness among players with equal need
      const maxNeed = assignmentsNeeded.get(availablePlayers[0].id);
      const playersWithMaxNeed = availablePlayers.filter(p => assignmentsNeeded.get(p.id) === maxNeed);
      
      // Shuffle players with equal need for randomness
      for (let i = playersWithMaxNeed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playersWithMaxNeed[i], playersWithMaxNeed[j]] = [playersWithMaxNeed[j], playersWithMaxNeed[i]];
      }
      
      let player1, player2;
      
      if (playersWithMaxNeed.length >= 2) {
        // Both players from the max-need group
        player1 = playersWithMaxNeed[0];
        player2 = playersWithMaxNeed[1];
      } else {
        // First player from max-need, second from next tier
        player1 = playersWithMaxNeed[0];
        const otherPlayers = availablePlayers.filter(p => p.id !== player1.id);
        // Shuffle other players for randomness
        for (let i = otherPlayers.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [otherPlayers[i], otherPlayers[j]] = [otherPlayers[j], otherPlayers[i]];
        }
        player2 = otherPlayers[0];
      }
      
      prompt.player1Id = player1.id;
      prompt.player2Id = player2.id;
      
      // Decrement their remaining assignments needed
      assignmentsNeeded.set(player1.id, assignmentsNeeded.get(player1.id) - 1);
      assignmentsNeeded.set(player2.id, assignmentsNeeded.get(player2.id) - 1);
      
      // Update player assignments
      player1.promptsAssigned.push(prompt.id);
      player2.promptsAssigned.push(prompt.id);
    } else if (availablePlayers.length === 1) {
      // Edge case: only one player has slots left - pair with someone else
      const player1 = availablePlayers[0];
      const otherPlayers = players.filter(p => p.id !== player1.id);
      const player2 = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
      
      prompt.player1Id = player1.id;
      prompt.player2Id = player2.id;
      
      assignmentsNeeded.set(player1.id, assignmentsNeeded.get(player1.id) - 1);
      
      player1.promptsAssigned.push(prompt.id);
      player2.promptsAssigned.push(prompt.id);
    }
  }
  
  // Validation: log warning if any player didn't get the expected number of prompts
  players.forEach(p => {
    if (p.promptsAssigned.length !== promptsPerPlayer) {
      console.warn(`[PROMPT ASSIGNMENT WARNING] Player ${p.name} (${p.id}) has ${p.promptsAssigned.length} prompts instead of ${promptsPerPlayer}`);
    }
  });
  
  room.prompts = prompts;
  room.currentMatchupIndex = 0;
  
  return prompts;
}

/**
 * Get prompts assigned to a specific player
 */
function getPlayerPrompts(room, playerId) {
  return room.prompts.filter(p => 
    p.player1Id === playerId || p.player2Id === playerId
  ).map(p => ({
    id: p.id,
    text: p.text
  }));
}

/**
 * Submit an answer for a prompt
 */
function submitAnswer(room, playerId, promptId, answerText) {
  const prompt = room.prompts.find(p => p.id === promptId);
  if (!prompt) {
    return { success: false, error: 'Prompt not found' };
  }
  
  // Validate player is assigned to this prompt
  if (prompt.player1Id !== playerId && prompt.player2Id !== playerId) {
    return { success: false, error: 'You are not assigned to this prompt' };
  }
  
  // Validate answer length
  const trimmedAnswer = answerText.trim().substring(0, CONFIG.MAX_ANSWER_LENGTH);
  
  // Store answer
  if (prompt.player1Id === playerId) {
    if (prompt.player1Answer !== null) {
      return { success: false, error: 'Already submitted' };
    }
    prompt.player1Answer = trimmedAnswer || '[No answer]';
  } else {
    if (prompt.player2Answer !== null) {
      return { success: false, error: 'Already submitted' };
    }
    prompt.player2Answer = trimmedAnswer || '[No answer]';
  }
  
  // Update player's submission count
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.answersSubmitted++;
  }
  
  return { success: true };
}

/**
 * Check if all answers are submitted for the round
 */
function allAnswersSubmitted(room) {
  return room.prompts.every(p => 
    p.player1Answer !== null && p.player2Answer !== null
  );
}

/**
 * Auto-submit blank answers for players who haven't answered
 */
function autoSubmitMissingAnswers(room) {
  for (const prompt of room.prompts) {
    if (prompt.player1Answer === null) {
      prompt.player1Answer = '[No answer]';
    }
    if (prompt.player2Answer === null) {
      prompt.player2Answer = '[No answer]';
    }
  }
}

/**
 * Get the next matchup for voting
 */
function getNextMatchup(room) {
  if (room.currentMatchupIndex >= room.prompts.length) {
    return null;
  }
  
  const prompt = room.prompts[room.currentMatchupIndex];
  const player1 = room.players.find(p => p.id === prompt.player1Id);
  const player2 = room.players.find(p => p.id === prompt.player2Id);
  
  return {
    promptId: prompt.id,
    promptText: prompt.text,
    answer1: prompt.player1Answer,
    answer2: prompt.player2Answer,
    player1Id: prompt.player1Id,
    player2Id: prompt.player2Id,
    player1Name: player1?.name || 'Unknown',
    player2Name: player2?.name || 'Unknown',
    // Don't reveal who wrote which answer during voting
    matchupIndex: room.currentMatchupIndex,
    totalMatchups: room.prompts.length
  };
}

/**
 * Submit a vote for a matchup
 */
function submitVote(room, voterId, promptId, votedFor) {
  const prompt = room.prompts.find(p => p.id === promptId);
  if (!prompt) {
    return { success: false, error: 'Prompt not found' };
  }
  
  // Can't vote on your own matchup
  if (prompt.player1Id === voterId || prompt.player2Id === voterId) {
    return { success: false, error: 'Cannot vote on your own matchup' };
  }
  
  // Check if already voted
  const voter = room.players.find(p => p.id === voterId);
  if (voter?.hasVoted.has(promptId)) {
    return { success: false, error: 'Already voted' };
  }
  
  // Record vote (1 = first answer, 2 = second answer)
  if (votedFor === 1) {
    prompt.player1Votes++;
  } else if (votedFor === 2) {
    prompt.player2Votes++;
  } else {
    return { success: false, error: 'Invalid vote' };
  }
  
  // Mark player as voted
  if (voter) {
    voter.hasVoted.add(promptId);
  }
  
  return { success: true };
}

/**
 * Check if all votes are in for current matchup
 */
function allVotesSubmitted(room, promptId) {
  const prompt = room.prompts.find(p => p.id === promptId);
  if (!prompt) return false;
  
  // Count eligible voters (everyone except the two answerers)
  const eligibleVoters = room.players.filter(p => 
    p.id !== prompt.player1Id && p.id !== prompt.player2Id
  ).length;
  
  const totalVotes = prompt.player1Votes + prompt.player2Votes;
  return totalVotes >= eligibleVoters;
}

/**
 * Calculate scores for a matchup and check for Jinx/QuipWit
 */
function calculateMatchupScores(room, promptId) {
  const prompt = room.prompts.find(p => p.id === promptId);
  if (!prompt) return null;
  
  // Check for Jinx (identical answers)
  if (prompt.player1Answer.toLowerCase().trim() === prompt.player2Answer.toLowerCase().trim() &&
      prompt.player1Answer !== '[No answer]') {
    prompt.isJinx = true;
    return {
      isJinx: true,
      prompt: prompt.text,
      answer: prompt.player1Answer,
      player1Name: room.players.find(p => p.id === prompt.player1Id)?.name,
      player2Name: room.players.find(p => p.id === prompt.player2Id)?.name,
      player1Score: 0,
      player2Score: 0
    };
  }
  
  // Calculate points
  const player1Points = prompt.player1Votes * SCORING.POINTS_PER_VOTE;
  const player2Points = prompt.player2Votes * SCORING.POINTS_PER_VOTE;
  
  // Check for QuipWit (unanimous vote)
  const totalVotes = prompt.player1Votes + prompt.player2Votes;
  let player1Bonus = 0;
  let player2Bonus = 0;
  
  if (totalVotes > 0) {
    if (prompt.player1Votes === totalVotes) {
      prompt.quipwit = 1;
      player1Bonus = SCORING.QUIPWIT_BONUS;
    } else if (prompt.player2Votes === totalVotes) {
      prompt.quipwit = 2;
      player2Bonus = SCORING.QUIPWIT_BONUS;
    }
  }
  
  // Update scores
  const currentP1Score = room.scores.get(prompt.player1Id) || 0;
  const currentP2Score = room.scores.get(prompt.player2Id) || 0;
  
  room.scores.set(prompt.player1Id, currentP1Score + player1Points + player1Bonus);
  room.scores.set(prompt.player2Id, currentP2Score + player2Points + player2Bonus);
  
  const player1 = room.players.find(p => p.id === prompt.player1Id);
  const player2 = room.players.find(p => p.id === prompt.player2Id);
  
  return {
    isJinx: false,
    prompt: prompt.text,
    answer1: prompt.player1Answer,
    answer2: prompt.player2Answer,
    player1Name: player1?.name || 'Unknown',
    player2Name: player2?.name || 'Unknown',
    player1Votes: prompt.player1Votes,
    player2Votes: prompt.player2Votes,
    player1Score: player1Points + player1Bonus,
    player2Score: player2Points + player2Bonus,
    quipwit: prompt.quipwit,
    totalScores: getScoreboard(room)
  };
}

/**
 * Move to next matchup
 */
function advanceMatchup(room) {
  room.currentMatchupIndex++;
  return room.currentMatchupIndex < room.prompts.length;
}

/**
 * Get scoreboard sorted by score
 */
function getScoreboard(room) {
  return room.players
    .map(p => ({
      id: p.id,
      name: p.name,
      score: room.scores.get(p.id) || 0
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Setup Last Wit round with randomly selected mode
 * Modes: FLASHBACK (complete the story), WORD_LASH (phrase from letters), ACRO_LASH (expand acronym)
 */
function setupLastLash(room) {
  if (!room.usedPrompts) {
    room.usedPrompts = new Set();
  }
  
  // Generate Last Wit prompt with random mode selection
  const lastWitData = generateLastWitPrompt(room.usedPrompts);
  
  room.lastLashPrompt = lastWitData.prompt;
  room.lastLashMode = lastWitData.mode;
  room.lastLashLetters = lastWitData.letters || null;
  room.lastLashInstructions = lastWitData.instructions || null;
  room.lastLashAnswers = [];
  room.lastLashVotes = new Map();
  
  // Reset player voting state
  room.players.forEach(p => {
    p.hasVoted = new Set();
  });
  
  return {
    prompt: room.lastLashPrompt,
    mode: room.lastLashMode,
    letters: room.lastLashLetters,
    instructions: room.lastLashInstructions
  };
}

/**
 * Setup Last Wit round (async version with AI fallback)
 * @param {Object} room - The game room
 * @param {string|null} theme - Optional theme for themed prompt generation
 */
async function setupLastLashAsync(room, theme = null) {
  if (!room.usedPrompts) {
    room.usedPrompts = new Set();
  }
  
  // Generate Last Wit prompt with random mode selection and AI support
  const lastWitData = await generateLastWitPromptAsync(room.usedPrompts, true, theme);
  
  room.lastLashPrompt = lastWitData.prompt;
  room.lastLashMode = lastWitData.mode;
  room.lastLashLetters = lastWitData.letters || null;
  room.lastLashInstructions = lastWitData.instructions || null;
  room.lastLashAnswers = [];
  room.lastLashVotes = new Map();
  
  // Reset player voting state
  room.players.forEach(p => {
    p.hasVoted = new Set();
  });
  
  return {
    prompt: room.lastLashPrompt,
    mode: room.lastLashMode,
    letters: room.lastLashLetters,
    instructions: room.lastLashInstructions
  };
}

/**
 * Submit Last Wit answer with mode-specific soft validation
 * For WORD_LASH and ACRO_LASH, validates letter matching (case-insensitive)
 */
function submitLastLashAnswer(room, playerId, answerText) {
  // Check if already submitted
  if (room.lastLashAnswers.some(a => a.playerId === playerId)) {
    return { success: false, error: 'Already submitted' };
  }
  
  const trimmedAnswer = answerText.trim().substring(0, CONFIG.MAX_ANSWER_LENGTH);
  
  // Soft validation for letter-based modes (warning only, still accepts answer)
  let validationWarning = null;
  
  if (room.lastLashMode === LAST_WIT_MODES.WORD_LASH && room.lastLashLetters) {
    const validation = validateWordLashAnswer(trimmedAnswer, room.lastLashLetters);
    if (!validation.valid) {
      validationWarning = validation.message;
    }
  } else if (room.lastLashMode === LAST_WIT_MODES.ACRO_LASH && room.lastLashLetters) {
    const validation = validateAcroLashAnswer(trimmedAnswer, room.lastLashLetters);
    if (!validation.valid) {
      validationWarning = validation.message;
    }
  }
  
  room.lastLashAnswers.push({
    playerId,
    answer: trimmedAnswer || '[No answer]',
    points: 0,
    validationWarning
  });
  
  return { success: true, warning: validationWarning };
}

/**
 * Check if all Last Wit answers are in
 */
function allLastLashAnswersSubmitted(room) {
  return room.lastLashAnswers.length >= room.players.length;
}

/**
 * Auto-submit missing Last Wit answers
 */
function autoSubmitMissingLastLashAnswers(room) {
  room.players.forEach(p => {
    if (!room.lastLashAnswers.some(a => a.playerId === p.id)) {
      room.lastLashAnswers.push({
        playerId: p.id,
        answer: '[No answer]',
        points: 0
      });
    }
  });
}

/**
 * Get Last Wit answers for voting (shuffled, anonymized)
 * Includes mode information for display
 */
function getLastLashVotingData(room) {
  // Shuffle answers
  const shuffled = [...room.lastLashAnswers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return {
    prompt: room.lastLashPrompt,
    mode: room.lastLashMode,
    letters: room.lastLashLetters,
    instructions: room.lastLashInstructions,
    answers: shuffled.map((a, index) => ({
      index,
      playerId: a.playerId,  // Server-side reference
      answer: a.answer
    }))
  };
}

/**
 * Submit Last Wit vote (single vote per player - official Quiplash rules)
 */
function submitLastLashVotes(room, voterId, votes) {
  if (room.lastLashVotes.has(voterId)) {
    return { success: false, error: 'Already voted' };
  }
  
  // Accept single vote (backwards compatible with array format)
  const votedForId = Array.isArray(votes) ? votes[0] : votes;
  
  // Can't vote for your own answer
  if (votedForId === voterId) {
    return { success: false, error: 'Cannot vote for your own answer' };
  }
  
  // Validate the voted player exists in answers
  if (!room.lastLashAnswers.some(a => a.playerId === votedForId)) {
    return { success: false, error: 'Invalid vote target' };
  }
  
  room.lastLashVotes.set(voterId, votedForId);
  return { success: true };
}

/**
 * Check if all Last Wit votes are in
 */
function allLastLashVotesSubmitted(room) {
  return room.lastLashVotes.size >= room.players.length;
}

/**
 * Calculate Last Wit scores (official Quiplash style - points based on votes received)
 * Includes mode information for results display
 */
function calculateLastLashScores(room) {
  // Count votes for each player
  const voteCounts = new Map();
  room.lastLashAnswers.forEach(a => voteCounts.set(a.playerId, 0));
  
  room.lastLashVotes.forEach((votedForId) => {
    const current = voteCounts.get(votedForId) || 0;
    voteCounts.set(votedForId, current + 1);
  });
  
  // Find the winner(s) - most votes
  let maxVotes = 0;
  voteCounts.forEach(count => {
    if (count > maxVotes) maxVotes = count;
  });
  
  // Award points based on votes received
  // Points per vote + bonus for winner
  const POINTS_PER_VOTE = SCORING.POINTS_PER_VOTE;  // 100 points per vote
  const WINNER_BONUS = SCORING.LAST_LASH_FIRST;     // 300 point bonus for winner
  
  room.lastLashAnswers.forEach(answer => {
    const votes = voteCounts.get(answer.playerId) || 0;
    answer.votes = votes;
    answer.points = votes * POINTS_PER_VOTE;
    
    // Winner bonus (only if they got at least one vote)
    if (votes === maxVotes && votes > 0) {
      answer.points += WINNER_BONUS;
      answer.isWinner = true;
    }
  });
  
  // Update total scores
  room.lastLashAnswers.forEach(answer => {
    const currentScore = room.scores.get(answer.playerId) || 0;
    room.scores.set(answer.playerId, currentScore + answer.points);
  });
  
  // Sort answers by points for results display
  const sortedAnswers = [...room.lastLashAnswers].sort((a, b) => b.points - a.points);
  
  return {
    prompt: room.lastLashPrompt,
    mode: room.lastLashMode,
    letters: room.lastLashLetters,
    answers: sortedAnswers.map(a => ({
      playerName: room.players.find(p => p.id === a.playerId)?.name || 'Unknown',
      answer: a.answer,
      votes: a.votes,
      points: a.points,
      isWinner: a.isWinner || false
    })),
    finalScoreboard: getScoreboard(room)
  };
}

/**
 * Get the winner(s) of the game
 */
function getWinners(room) {
  const scoreboard = getScoreboard(room);
  if (scoreboard.length === 0) return [];
  
  const topScore = scoreboard[0].score;
  return scoreboard.filter(p => p.score === topScore);
}

module.exports = {
  assignPromptsToPlayers,
  assignPromptsToPlayersAsync,
  getPlayerPrompts,
  submitAnswer,
  allAnswersSubmitted,
  autoSubmitMissingAnswers,
  getNextMatchup,
  submitVote,
  allVotesSubmitted,
  calculateMatchupScores,
  advanceMatchup,
  getScoreboard,
  setupLastLash,
  setupLastLashAsync,
  submitLastLashAnswer,
  allLastLashAnswersSubmitted,
  autoSubmitMissingLastLashAnswers,
  getLastLashVotingData,
  submitLastLashVotes,
  allLastLashVotesSubmitted,
  calculateLastLashScores,
  getWinners
};
