/**
 * Multiplayer E2E Test
 *
 * Runs a full QuipWits game with multiple simulated Socket.io clients,
 * mirroring the events that real browsers would fire. Covers both regular
 * rounds and the Last Lash finale, then asserts on game_over outcomes.
 *
 * Architecture:
 *   - One host socket  → creates room, starts game, triggers Last Wit continue
 *   - N player sockets → join room, submit answers, submit votes
 *   - Strategies are fully deterministic (no Math.random) so results are stable
 *     across runs regardless of AI-generated vs fallback prompts
 *
 * Configuration via environment variables:
 *   QUIPWITS_TEST_URL  base server URL          (default: http://localhost:3000)
 *   SERVER_URL         alias for QUIPWITS_TEST_URL
 *   PLAYER_COUNT       players to simulate, 3–10 (default: 6)
 *
 * Quickstart:
 *   Terminal 1:  npm start
 *   Terminal 2:  npm run test:script:multiplayer
 *
 * Or with overrides:
 *   QUIPWITS_TEST_URL=http://localhost:3001 PLAYER_COUNT=5 npm run test:script:multiplayer
 *
 * Exit codes: 0 = all assertions passed, 1 = game or assertion failure.
 */

'use strict';

const GameSimulator = require('./base-game-simulator');
const { CONFIG } = require('../../shared/constants');

// ─── Configuration ─────────────────────────────────────────────────────────────

const SERVER_URL =
  process.env.QUIPWITS_TEST_URL ||
  process.env.SERVER_URL ||
  'http://localhost:3000';

const PLAYER_COUNT = Math.min(
  CONFIG.MAX_PLAYERS,
  Math.max(CONFIG.MIN_PLAYERS, parseInt(process.env.PLAYER_COUNT || '6', 10))
);

// ─── Deterministic answer strategies ──────────────────────────────────────────

/**
 * Regular-round answers: unique per (player, prompt, round) triple so every
 * matchup has two distinct entries. Deterministic: no randomness.
 */
function answerStrategy(playerIndex, prompt, round) {
  const slug = prompt.id ? String(prompt.id).slice(-4) : String(prompt.text.length);
  return `R${round}P${playerIndex + 1}[${slug}] clever quip`;
}

/**
 * Regular-round votes: deterministically picks answer 1 or 2 by folding
 * player index, round, and matchup index together. Spreads votes across both
 * answers without bias toward a single player.
 */
function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  return ((playerIndex + round + matchupIndex) % 2) + 1;
}

/**
 * Last Lash answers: mode-appropriate unique string per player.
 * Tests all three LAST_WIT_MODES (FLASHBACK, WORD_LASH, ACRO_LASH).
 */
function lastLashAnswerStrategy(playerIndex, promptData) {
  const p = playerIndex + 1;
  const { mode } = promptData;

  if (mode === 'FLASHBACK') return `And they all laughed forever, said Player${p}`;
  if (mode === 'WORD_LASH')  return `Totally Funny Night ${p}`;
  if (mode === 'ACRO_LASH')  return `Really Daring Fool ${p}`;
  return `Last Lash answer from Player${p}`;
}

/**
 * Last Lash votes: each voter picks a different "other" answer by offset,
 * spreading points across the field without relying on randomness.
 */
function lastLashVoteStrategy(playerIndex, playerId, votingData) {
  const others = votingData.answers.filter(a => a.playerId !== playerId);
  if (others.length === 0) return null;
  return others[playerIndex % others.length].playerId;
}

// ─── Assertion helpers ─────────────────────────────────────────────────────────

function assert(condition, label) {
  const mark = condition ? '  [PASS]' : '  [FAIL]';
  console.log(`${mark} ${label}`);
  return condition;
}

function runAssertions(result, playerCount) {
  console.log('\n--- Assertions ---');
  let allPassed = true;

  allPassed &= assert(result.success, 'Game completed without fatal error');

  if (!result.success) {
    console.log('  [SKIP] Skipping result assertions (game did not complete)');
    return false;
  }

  const { winners, scoreboard } = result.results;

  allPassed &= assert(
    Array.isArray(scoreboard) && scoreboard.length === playerCount,
    `Scoreboard has exactly ${playerCount} entries`
  );

  allPassed &= assert(
    Array.isArray(winners) && winners.length >= 1,
    'At least one winner declared'
  );

  const allNonNegative =
    Array.isArray(scoreboard) &&
    scoreboard.every(p => Number.isFinite(p.score) && p.score >= 0);
  allPassed &= assert(allNonNegative, 'All player scores are finite and non-negative');

  if (Array.isArray(winners) && winners.length > 0) {
    const topScore = winners[0].score;
    const noOneBeatsWinner =
      Array.isArray(scoreboard) && scoreboard.every(p => p.score <= topScore);
    allPassed &= assert(noOneBeatsWinner, 'Winner(s) hold the highest score on the board');
  }

  return Boolean(allPassed);
}

// ─── Entry point ───────────────────────────────────────────────────────────────

async function runMultiplayerE2E() {
  console.log('='.repeat(60));
  console.log('MULTIPLAYER E2E TEST');
  console.log('='.repeat(60));
  console.log(`  Server:  ${SERVER_URL}`);
  console.log(`  Players: ${PLAYER_COUNT}`);
  console.log(`  Rounds:  ${CONFIG.ROUNDS_PER_GAME} regular + Last Lash`);
  console.log('');

  const simulator = new GameSimulator({
    serverUrl: SERVER_URL,
    playerCount: PLAYER_COUNT,
    logLevel: 'info',
    actionDelay: 50,
  });

  const result = await simulator.playGame(
    (playerIndex, prompt, round) => {
      if (round === 'lastLash') return lastLashAnswerStrategy(playerIndex, prompt);
      return answerStrategy(playerIndex, prompt, round);
    },
    (playerIndex, playerId, data, round, matchupIndex) => {
      if (round === 'lastLash') return lastLashVoteStrategy(playerIndex, playerId, data);
      return voteStrategy(playerIndex, playerId, data, round, matchupIndex);
    }
  );

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n--- Game Summary ---');
  const summary = simulator.getSummary();
  console.log(`  Room code: ${summary.roomCode}`);
  console.log(`  Players:   ${summary.players.join(', ')}`);
  console.log(`  Errors:    ${summary.errors}`);

  if (result.success) {
    console.log('\n--- Final Scoreboard ---');
    result.results.scoreboard.forEach((player, i) => {
      const label = i === 0 ? '  <-- winner' : '';
      console.log(`  ${i + 1}. ${player.name}: ${player.score} pts${label}`);
    });
    console.log(`\n  Winner(s): ${result.results.winners.map(w => w.name).join(', ')}`);
  } else {
    console.error(`\n  Game failed: ${result.error}`);
    if (result.errors && result.errors.length > 0) {
      console.error('  Errors:', result.errors.map(e => e.message).join('; '));
    }
  }

  // ── Assertions ────────────────────────────────────────────────────────────────
  const passed = runAssertions(result, PLAYER_COUNT);

  console.log('\n' + '='.repeat(60));
  if (passed) {
    console.log('ALL ASSERTIONS PASSED');
    process.exit(0);
  } else {
    console.log('SOME ASSERTIONS FAILED');
    process.exit(1);
  }
}

if (require.main === module) {
  runMultiplayerE2E().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runMultiplayerE2E };
