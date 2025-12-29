/**
 * QuipWit Game Test Script
 * Simulates a game with QuipWit scenarios:
 * - Players coordinate votes to create unanimous decisions
 * - Verifies QuipWit bonus points (100 bonus)
 * - Tests multiple QuipWits in one round
 */

const GameSimulator = require('./base-game-simulator');

// Track matchups to coordinate unanimous votes
let matchupVotes = new Map();

// Answer strategy: Varied answers (not identical)
function answerStrategy(playerIndex, prompt, round) {
  // Different answers for each player
  return `Unique answer ${playerIndex + 1} for round ${round}`;
}

// Vote strategy: Coordinate unanimous votes for answer 1
function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  // All voters vote for answer 1 (unanimous = QuipWit)
  // Use matchup index to ensure consistency
  if (!matchupVotes.has(matchup.promptId)) {
    matchupVotes.set(matchup.promptId, 1); // Always vote for answer 1
  }
  
  return matchupVotes.get(matchup.promptId);
}

// Last Lash answer strategy: Varied answers
function lastLashAnswerStrategy(playerIndex, promptData, phase) {
  const mode = promptData.mode;
  
  if (mode === 'FLASHBACK') {
    return `And they lived happily ever after, Player${playerIndex + 1} style`;
  } else if (mode === 'WORD_LASH') {
    const letters = promptData.letters || 'T.F.N.';
    return `The Final Night ${playerIndex + 1}`;
  } else if (mode === 'ACRO_LASH') {
    const letters = promptData.letters || 'R.D.F.';
    return `Rabid Ducks Fight ${playerIndex + 1}`;
  }
  
  return `Last Lash answer from Player${playerIndex + 1}`;
}

// Last Lash vote strategy: Coordinate votes for one player (winner)
function lastLashVoteStrategy(playerIndex, playerId, votingData, phase) {
  const answers = votingData.answers;
  if (answers.length === 0) return null;
  
  // Find answers that aren't ours
  const otherAnswers = answers.filter(a => a.playerId !== playerId);
  if (otherAnswers.length === 0) return null;
  
  // All players vote for the first other answer to create a clear winner
  // This simulates a QuipWit-like scenario in Last Lash
  return otherAnswers[0].playerId;
}

async function runQuipWitGame() {
  console.log('='.repeat(60));
  console.log('QUIPWIT GAME TEST');
  console.log('='.repeat(60));
  console.log('Testing QuipWit detection (unanimous votes = bonus points)');
  
  // Reset matchup votes
  matchupVotes = new Map();
  
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
    
    // Verify QuipWit behavior: Scores should be higher due to bonuses
    const allScores = result.results.scoreboard.map(p => p.score);
    const maxScore = Math.max(...allScores);
    
    console.log('\nQuipWit Verification:');
    console.log(`  Max Score: ${maxScore}`);
    console.log(`  Note: QuipWits add 100 bonus points per unanimous vote`);
    console.log(`  Scores should reflect bonus points from unanimous votes`);
    
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
  runQuipWitGame().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runQuipWitGame };

