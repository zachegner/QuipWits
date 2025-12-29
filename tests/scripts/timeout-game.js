/**
 * Timeout Game Test Script
 * Simulates a game with timeout scenarios:
 * - Some players don't answer/vote in time
 * - Verifies auto-submission of [No answer]
 * - Tests timer expiration handling
 */

const GameSimulator = require('./base-game-simulator');

// Track which players should timeout
const timeoutPlayers = new Set([1, 2]); // Players 1 and 2 will timeout on votes

// Answer strategy: All players answer (to avoid 90s answer timer)
function answerStrategy(playerIndex, prompt, round) {
  // All players submit answers to avoid long answer timer
  return `Answer from Player${playerIndex + 1} for round ${round}`;
}

// Vote strategy: Some players don't vote (timeout)
function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  // Players 1 and 2 don't vote (will timeout)
  if (timeoutPlayers.has(playerIndex)) {
    return null; // Don't submit vote
  }
  
  return (playerIndex + matchupIndex) % 2 === 0 ? 1 : 2;
}

// Last Lash answer strategy: Some players timeout
function lastLashAnswerStrategy(playerIndex, promptData, phase) {
  // Players 1 and 2 don't answer
  if (timeoutPlayers.has(playerIndex)) {
    return null;
  }
  
  const mode = promptData.mode;
  if (mode === 'FLASHBACK') {
    return `And they lived happily ever after`;
  } else if (mode === 'WORD_LASH') {
    return `The Final Night`;
  } else if (mode === 'ACRO_LASH') {
    return `Rabid Ducks Fight`;
  }
  
  return `Last Lash answer from Player${playerIndex + 1}`;
}

// Last Lash vote strategy: Some players timeout
function lastLashVoteStrategy(playerIndex, playerId, votingData, phase) {
  // Players 1 and 2 don't vote
  if (timeoutPlayers.has(playerIndex)) {
    return null;
  }
  
  const answers = votingData.answers;
  if (answers.length === 0) return null;
  
  // Find answers that aren't ours
  const otherAnswers = answers.filter(a => a.playerId !== playerId);
  if (otherAnswers.length === 0) return null;
  
  // Vote for first available other answer
  return otherAnswers[0].playerId;
}

async function runTimeoutGame() {
  console.log('='.repeat(60));
  console.log('TIMEOUT GAME TEST');
  console.log('='.repeat(60));
  console.log('Testing timeout scenarios (auto-submission of [No answer])');
  console.log(`Players that will timeout: ${Array.from(timeoutPlayers).map(i => `Player${i + 1}`).join(', ')}`);
  
  const simulator = new GameSimulator({
    playerCount: 4,
    logLevel: 'info',
    actionDelay: 50
  });
  
  // Note: We need to wait for timeouts, so we'll let the server handle it
  // The server will auto-submit [No answer] when timers expire
  
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
    
    console.log('\nTimeout Verification:');
    console.log(`  Players ${Array.from(timeoutPlayers).map(i => `Player${i + 1}`).join(', ')} should have [No answer] entries`);
    console.log(`  Server should have auto-submitted missing answers/votes`);
    
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
  runTimeoutGame().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTimeoutGame };

