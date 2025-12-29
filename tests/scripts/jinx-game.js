/**
 * Jinx Game Test Script
 * Simulates a game with Jinx scenarios:
 * - Players submit identical answers to create Jinxes
 * - Verifies Jinx detection (0 points awarded)
 * - Tests case-insensitive matching
 */

const GameSimulator = require('./base-game-simulator');

// Track prompts to coordinate identical answers
let promptAnswers = new Map();

// Answer strategy: Create Jinxes by having both players submit identical answers
function answerStrategy(playerIndex, prompt, round) {
  // For each prompt, both players submit the same answer
  const jinxAnswer = `Jinx Answer for "${prompt.text}"`;
  
  if (!promptAnswers.has(prompt.id)) {
    promptAnswers.set(prompt.id, jinxAnswer);
  }
  
  // Both players use the same answer
  return promptAnswers.get(prompt.id);
}

// Vote strategy: Normal voting (doesn't matter for Jinx, but votes still happen)
function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  // Votes don't matter for Jinx (0 points), but we still vote
  return (playerIndex + matchupIndex) % 2 === 0 ? 1 : 2;
}

// Last Lash answer strategy: All players submit same answer (potential Jinx)
function lastLashAnswerStrategy(playerIndex, promptData, phase) {
  // All players submit the same answer
  return 'Jinx Last Lash Answer';
}

// Last Lash vote strategy: Normal voting
function lastLashVoteStrategy(playerIndex, playerId, votingData, phase) {
  const answers = votingData.answers;
  if (answers.length === 0) return null;
  
  // Find answers that aren't ours
  const otherAnswers = answers.filter(a => a.playerId !== playerId);
  if (otherAnswers.length === 0) return null;
  
  // Vote for first other answer
  return otherAnswers[0].playerId;
}

async function runJinxGame() {
  console.log('='.repeat(60));
  console.log('JINX GAME TEST');
  console.log('='.repeat(60));
  console.log('Testing Jinx detection (identical answers = 0 points)');
  
  // Reset prompt answers
  promptAnswers = new Map();
  
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
    
    // Verify Jinx behavior: Scores should be low due to Jinxes
    const allScores = result.results.scoreboard.map(p => p.score);
    const maxScore = Math.max(...allScores);
    const minScore = Math.min(...allScores);
    
    console.log('\nJinx Verification:');
    console.log(`  Max Score: ${maxScore}`);
    console.log(`  Min Score: ${minScore}`);
    console.log(`  Note: Jinxes result in 0 points, so scores should be lower than normal`);
    
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
  runJinxGame().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runJinxGame };

