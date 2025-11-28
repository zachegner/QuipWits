const { CONFIG, SCORING, GAME_STATES } = require('../shared/constants');
const { generateUniquePrompts, generateUniquePromptsAsync, generateLastLashPrompt, generateLastLashPromptAsync, getPromptsNeededForRound } = require('./promptGenerator');

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
  
  // Assign prompts to players using slot consumption
  // Create a list of "slots" - each player needs promptsPerPlayer slots
  const slots = [];
  players.forEach(p => {
    for (let i = 0; i < promptsPerPlayer; i++) {
      slots.push(p.id);
    }
  });
  
  // Shuffle slots for randomness
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  
  // Assign players to prompts by consuming slots from the array
  for (const prompt of prompts) {
    // Get first player - take from front of slots
    if (slots.length > 0) {
      prompt.player1Id = slots.shift();
    }
    
    // Find second player (must be different from first)
    // Look for a slot with a different player ID
    let foundIndex = -1;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] !== prompt.player1Id) {
        foundIndex = i;
        break;
      }
    }
    
    if (foundIndex !== -1) {
      // Found a different player - remove and use that slot
      prompt.player2Id = slots.splice(foundIndex, 1)[0];
    } else if (slots.length > 0) {
      // All remaining slots are same player - use anyway (shouldn't happen with proper prompt count)
      prompt.player2Id = slots.shift();
    }
    
    // Fallback if we couldn't find a second player
    if (!prompt.player2Id) {
      // Find any player who isn't player1
      for (const p of players) {
        if (p.id !== prompt.player1Id) {
          prompt.player2Id = p.id;
          break;
        }
      }
    }
    
    // Update player assignments
    const p1 = players.find(p => p.id === prompt.player1Id);
    const p2 = players.find(p => p.id === prompt.player2Id);
    if (p1) p1.promptsAssigned.push(prompt.id);
    if (p2) p2.promptsAssigned.push(prompt.id);
  }
  
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
 * Setup Last Wit round
 */
function setupLastLash(room) {
  if (!room.usedPrompts) {
    room.usedPrompts = new Set();
  }
  
  room.lastLashPrompt = generateLastLashPrompt(room.usedPrompts);
  room.lastLashAnswers = [];
  room.lastLashVotes = new Map();
  
  // Reset player voting state
  room.players.forEach(p => {
    p.hasVoted = new Set();
  });
  
  return room.lastLashPrompt;
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
  
  room.lastLashPrompt = await generateLastLashPromptAsync(room.usedPrompts, true, theme);
  room.lastLashAnswers = [];
  room.lastLashVotes = new Map();
  
  // Reset player voting state
  room.players.forEach(p => {
    p.hasVoted = new Set();
  });
  
  return room.lastLashPrompt;
}

/**
 * Submit Last Wit answer
 */
function submitLastLashAnswer(room, playerId, answerText) {
  // Check if already submitted
  if (room.lastLashAnswers.some(a => a.playerId === playerId)) {
    return { success: false, error: 'Already submitted' };
  }
  
  const trimmedAnswer = answerText.trim().substring(0, CONFIG.MAX_ANSWER_LENGTH);
  
  room.lastLashAnswers.push({
    playerId,
    answer: trimmedAnswer || '[No answer]',
    points: 0
  });
  
  return { success: true };
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
    answers: shuffled.map((a, index) => ({
      index,
      playerId: a.playerId,  // Server-side reference
      answer: a.answer
    }))
  };
}

/**
 * Submit Last Wit votes (top 3)
 */
function submitLastLashVotes(room, voterId, votes) {
  // votes = [playerId1, playerId2, playerId3] in order of preference
  if (room.lastLashVotes.has(voterId)) {
    return { success: false, error: 'Already voted' };
  }
  
  // Calculate how many votes are required (min of 3 or available answers minus own)
  const availableAnswers = room.lastLashAnswers.filter(a => a.playerId !== voterId).length;
  const requiredVotes = Math.min(3, availableAnswers);
  
  if (!Array.isArray(votes) || votes.length < requiredVotes) {
    return { success: false, error: `Must pick ${requiredVotes} answers` };
  }
  
  // Can't vote for your own answer
  if (votes.includes(voterId)) {
    return { success: false, error: 'Cannot vote for your own answer' };
  }
  
  room.lastLashVotes.set(voterId, votes);
  return { success: true };
}

/**
 * Check if all Last Wit votes are in
 */
function allLastLashVotesSubmitted(room) {
  return room.lastLashVotes.size >= room.players.length;
}

/**
 * Calculate Last Wit scores
 */
function calculateLastLashScores(room) {
  // Tally points: 1st = 300, 2nd = 200, 3rd = 100
  const pointValues = [SCORING.LAST_LASH_FIRST, SCORING.LAST_LASH_SECOND, SCORING.LAST_LASH_THIRD];
  
  room.lastLashVotes.forEach((votes, voterId) => {
    votes.forEach((playerId, rank) => {
      const answer = room.lastLashAnswers.find(a => a.playerId === playerId);
      if (answer) {
        answer.points += pointValues[rank];
      }
    });
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
    answers: sortedAnswers.map(a => ({
      playerName: room.players.find(p => p.id === a.playerId)?.name || 'Unknown',
      answer: a.answer,
      points: a.points
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
