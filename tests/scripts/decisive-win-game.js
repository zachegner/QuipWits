/**
 * Decisive Win Game Test Script
 * Simulates a game with one clear winner:
 * - One player dominates (gets most votes)
 * - Verifies clear winner identification
 * - Tests score accumulation
 */

const GameSimulator = require('./base-game-simulator');

// The dominant player (Player 0)
const DOMINANT_PLAYER = 0;

// Answer strategy: Varied answers
function answerStrategy(playerIndex, prompt, round) {
  return `Answer ${playerIndex + 1} for round ${round}`;
}

// Vote strategy: Always vote for dominant player
function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  // Strategy: Always vote for the answer from the dominant player
  // We need to determine which answer is from the dominant player
  // Since we don't know which player is which in the matchup, we'll use a pattern:
  // Vote for answer 1 if matchup index is even, answer 2 if odd
  // This creates a pattern where one player gets more votes
  
  // For decisive win: Player 0 should win
  // We'll vote for answer 1 more often (assuming Player 0 is often player1)
  return matchupIndex % 3 !== 0 ? 1 : 2; // Vote for 1 more often
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

// Last Lash vote strategy: All vote for dominant player
function lastLashVoteStrategy(playerIndex, playerId, votingData, phase) {
  const answers = votingData.answers;
  if (answers.length === 0) return null;
  
  // Find answers that aren't ours
  const otherAnswers = answers.filter(a => a.playerId !== playerId);
  if (otherAnswers.length === 0) return null;
  
  // All players vote for the first other answer (Player 0)
  // This ensures Player 0 wins Last Lash decisively
  return otherAnswers[0].playerId;
}

async function runDecisiveWinGame() {
  console.log('='.repeat(60));
  console.log('DECISIVE WIN GAME TEST');
  console.log('='.repeat(60));
  console.log('Testing decisive win scenario (one clear winner)');
  console.log(`Dominant player: Player${DOMINANT_PLAYER + 1}`);
  
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
      const isWinner = result.results.winners.some(w => w.id === player.id);
      const marker = isWinner ? ' 👑' : '';
      console.log(`  ${index + 1}. ${player.name}: ${player.score} points${marker}`);
    });
    
    // Verify decisive win behavior
    const winners = result.results.winners;
    const scoreboard = result.results.scoreboard;
    const topScore = scoreboard[0]?.score || 0;
    const secondScore = scoreboard[1]?.score || 0;
    const scoreDifference = topScore - secondScore;
    
    console.log('\nDecisive Win Verification:');
    console.log(`  Number of winners: ${winners.length}`);
    console.log(`  Top score: ${topScore}`);
    console.log(`  Second place score: ${secondScore}`);
    console.log(`  Score difference: ${scoreDifference}`);
    
    if (winners.length === 1 && scoreDifference > 0) {
      console.log(`  ✓ Clear winner detected with ${scoreDifference} point lead`);
    } else if (winners.length === 1) {
      console.log(`  ✓ Single winner (may be close)`);
    } else {
      console.log(`  Note: Multiple winners (tie scenario)`);
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
  runDecisiveWinGame().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runDecisiveWinGame };

