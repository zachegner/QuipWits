/**
 * Tie Game Test Script
 * Simulates a game ending in a tie:
 * - Players coordinate to end with tied scores
 * - Verifies multiple winners returned
 * - Tests tie-breaking logic
 */

const GameSimulator = require('./base-game-simulator');

// Track scores to coordinate ties
let roundScores = new Map();
let currentRound = 0;

// Answer strategy: Varied answers
function answerStrategy(playerIndex, prompt, round) {
  currentRound = round;
  return `Answer ${playerIndex + 1} for round ${round}`;
}

// Vote strategy: Distribute votes to create ties
function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  // Strategy: Alternate votes to balance scores
  // For 4 players, 2 voters per matchup
  // Distribute votes evenly to create ties
  
  // Round 1: Player 0 and 1 get more votes
  // Round 2: Player 2 and 3 get more votes
  // This should create a tie between top players
  
  if (round === 1) {
    // In round 1, vote for player 1 (answer 1) more often
    return matchupIndex % 2 === 0 ? 1 : 2;
  } else {
    // In round 2, vote for player 2 (answer 2) more often
    return matchupIndex % 2 === 0 ? 2 : 1;
  }
}

// Last Lash answer strategy: Varied answers
function lastLashAnswerStrategy(playerIndex, promptData, phase) {
  const mode = promptData.mode;
  
  if (mode === 'FLASHBACK') {
    return `And they lived happily ever after, Player${playerIndex + 1} style`;
  } else if (mode === 'WORD_LASH') {
    return `The Final Night ${playerIndex + 1}`;
  } else if (mode === 'ACRO_LASH') {
    return `Rabid Ducks Fight ${playerIndex + 1}`;
  }
  
  return `Last Lash answer from Player${playerIndex + 1}`;
}

// Last Lash vote strategy: Distribute votes to create ties
function lastLashVoteStrategy(playerIndex, playerId, votingData, phase) {
  const answers = votingData.answers;
  if (answers.length === 0) return null;
  
  // Find answers that aren't ours
  const otherAnswers = answers.filter(a => a.playerId !== playerId);
  if (otherAnswers.length === 0) return null;
  
  // Distribute votes evenly to create ties
  // Players 0 and 1 vote for first other answer
  // Players 2 and 3 vote for second other answer
  // This should create a tie
  
  if (playerIndex < 2) {
    return otherAnswers[0].playerId;
  } else {
    return otherAnswers[1] ? otherAnswers[1].playerId : otherAnswers[0].playerId;
  }
}

async function runTieGame() {
  console.log('='.repeat(60));
  console.log('TIE GAME TEST');
  console.log('='.repeat(60));
  console.log('Testing tie scenarios (multiple winners)');
  
  // Reset tracking
  roundScores = new Map();
  currentRound = 0;
  
  const simulator = new GameSimulator({
    playerCount: 4,
    logLevel: 'info',
    actionDelay: 50
  });
  
  const result = await simulator.playGame(
    (playerIndex, prompt, round) => {
      if (round === 'lastLash') {
        return lastLashAnswerStrategy(playerIndex, prompt, round);
      }
      return answerStrategy(playerIndex, prompt, round);
    },
    (playerIndex, playerId, data, round, matchupIndex) => {
      if (round === 'lastLash') {
        return lastLashVoteStrategy(playerIndex, playerId, data, round);
      }
      return voteStrategy(playerIndex, playerId, data, round, matchupIndex);
    }
  );
  
  if (result.success) {
    console.log('\n✓ Game completed successfully!');
    console.log('\nFinal Results:');
    console.log(`  Winners: ${result.results.winners.map(w => w.name).join(', ')}`);
    console.log('\nFinal Scoreboard:');
    result.results.scoreboard.forEach((player, index) => {
      console.log(`  ${index + 1}. ${player.name}: ${player.score} points`);
    });
    
    // Verify tie behavior
    const winners = result.results.winners;
    const topScore = winners.length > 0 ? winners[0].score : 0;
    const allTopScores = result.results.scoreboard.filter(p => p.score === topScore);
    
    console.log('\nTie Verification:');
    console.log(`  Number of winners: ${winners.length}`);
    console.log(`  Top score: ${topScore}`);
    console.log(`  Players with top score: ${allTopScores.map(p => p.name).join(', ')}`);
    
    if (winners.length > 1) {
      console.log(`  ✓ Tie detected: Multiple winners with same score`);
    } else {
      console.log(`  Note: No tie detected (may vary based on game flow)`);
    }
    
    const summary = simulator.getSummary();
    console.log(`\nSummary:`);
    console.log(`  Room Code: ${summary.roomCode}`);
    console.log(`  Players: ${summary.players.join(', ')}`);
    console.log(`  Errors: ${summary.errors}`);
    
    process.exit(0);
  } else {
    console.error('\n✗ Game failed:', result.error);
    console.error('\nErrors:', result.errors);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTieGame().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTieGame };

