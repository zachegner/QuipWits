/**
 * Normal Game Test Script
 * Simulates a standard game with normal player behavior:
 * - Varied answers
 * - Distributed votes
 * - Normal scoring progression
 */

const GameSimulator = require('./base-game-simulator');

// Answer strategy: Generate varied, creative answers
function answerStrategy(playerIndex, prompt, round) {
  const answers = [
    `Round ${round} answer from Player${playerIndex + 1} for "${prompt.text}"`,
    `Creative response ${playerIndex + 1}`,
    `Witty comeback ${round}`,
    `Funny answer ${playerIndex + 1}`,
    `Clever response for round ${round}`
  ];
  
  // Return a varied answer based on prompt and player
  const hash = prompt.text.length + playerIndex + round;
  return answers[hash % answers.length];
}

// Vote strategy: Distribute votes fairly but randomly
function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  // Randomly vote for answer 1 or 2, with slight bias based on player index
  const vote = (playerIndex + matchupIndex) % 2 === 0 ? 1 : 2;
  return vote;
}

// Last Lash answer strategy
function lastLashAnswerStrategy(playerIndex, promptData, phase) {
  const mode = promptData.mode;
  
  if (mode === 'FLASHBACK') {
    return `And they lived happily ever after, Player${playerIndex + 1} style`;
  } else if (mode === 'WORD_LASH') {
    // Use the letters if provided
    const letters = promptData.letters || 'T.F.N.';
    return `The Final Night`;
  } else if (mode === 'ACRO_LASH') {
    const letters = promptData.letters || 'R.D.F.';
    return `Rabid Ducks Fight`;
  }
  
  return `Last Lash answer from Player${playerIndex + 1}`;
}

// Last Lash vote strategy: Vote for a random other player
function lastLashVoteStrategy(playerIndex, playerId, votingData, phase) {
  // Get all answers
  const answers = votingData.answers;
  if (answers.length === 0) return null;
  
  // Find answers that aren't ours (can't vote for own)
  const otherAnswers = answers.filter(a => a.playerId !== playerId);
  if (otherAnswers.length === 0) return null;
  
  // Vote for a random other answer
  const randomAnswer = otherAnswers[Math.floor(Math.random() * otherAnswers.length)];
  return randomAnswer.playerId;
}

async function runNormalGame() {
  console.log('='.repeat(60));
  console.log('NORMAL GAME TEST');
  console.log('='.repeat(60));
  
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
  runNormalGame().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runNormalGame, answerStrategy, voteStrategy };

