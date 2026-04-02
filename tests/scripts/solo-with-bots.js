/**
 * Solo UI Playthrough with Bot Players
 *
 * Lets you play a full game through the normal host and player UIs while
 * three (or more) deterministic bots automatically fill the remaining slots,
 * submit answers, and vote each round.
 *
 * Workflow:
 *   1.  Terminal 1:  npm start
 *   2.  Browser A:   open /host → create a room → note the room code
 *   3.  Browser B:   open /play?code=XXXX → join with your name
 *   4.  Terminal 2:  ROOM_CODE=XXXX npm run test:script:solo-bots
 *   5.  Browser A:   once all players appear in the lobby, click Start Game
 *   6.  Play normally; bots answer and vote automatically each round
 *   7.  After round 2 scores, click "Continue" on the host screen to start Last Lash
 *   8.  Script exits 0 on game over
 *
 * Configuration via environment variables:
 *   ROOM_CODE          (required) 4-letter room code shown on the host screen
 *   BOT_COUNT          number of bots to add, 2–9  (default: 3)
 *   QUIPWITS_TEST_URL  base server URL             (default: http://localhost:3000)
 *   SERVER_URL         alias for QUIPWITS_TEST_URL
 *
 * You can also pass the room code as the first CLI argument:
 *   node tests/scripts/solo-with-bots.js ABCD
 */

'use strict';

const GameSimulator = require('./base-game-simulator');
const { CONFIG } = require('../../shared/constants');

// ─── Configuration ─────────────────────────────────────────────────────────────

const SERVER_URL =
  process.env.QUIPWITS_TEST_URL ||
  process.env.SERVER_URL ||
  'http://localhost:3000';

const ROOM_CODE = process.env.ROOM_CODE || process.argv[2] || null;

const BOT_COUNT = Math.min(
  CONFIG.MAX_PLAYERS - 1, // leave at least one slot for the human
  Math.max(2, parseInt(process.env.BOT_COUNT || '3', 10))
);

// ─── Deterministic answer strategies ──────────────────────────────────────────

function answerStrategy(playerIndex, prompt, round) {
  const slug = prompt.id ? String(prompt.id).slice(-4) : String(prompt.text.length);
  return `R${round}B${playerIndex + 1}[${slug}] bot quip`;
}

function voteStrategy(playerIndex, playerId, matchup, round, matchupIndex) {
  return ((playerIndex + round + matchupIndex) % 2) + 1;
}

function lastLashAnswerStrategy(playerIndex, promptData) {
  const p = playerIndex + 1;
  const { mode } = promptData;

  if (mode === 'FLASHBACK') return `And Bot${p} laughed forever after`;
  if (mode === 'WORD_LASH')  return `Totally Bot Night ${p}`;
  if (mode === 'ROAST_LASH')  return `Roast Bot ${p}`;
  return `Last Lash bot answer ${p}`;
}

function lastLashVoteStrategy(playerIndex, playerId, votingData) {
  const others = votingData.answers.filter(a => a.playerId !== playerId);
  if (others.length === 0) return null;
  return others[playerIndex % others.length].playerId;
}

// ─── Entry point ───────────────────────────────────────────────────────────────

async function runSoloWithBots() {
  console.log('='.repeat(60));
  console.log('SOLO UI PLAYTHROUGH — BOT HELPER');
  console.log('='.repeat(60));

  if (!ROOM_CODE) {
    console.error('');
    console.error('  ERROR: No room code provided.');
    console.error('');
    console.error('  Usage:');
    console.error('    ROOM_CODE=ABCD npm run test:script:solo-bots');
    console.error('    — or —');
    console.error('    node tests/scripts/solo-with-bots.js ABCD');
    console.error('');
    process.exit(1);
  }

  const botNames = Array.from({ length: BOT_COUNT }, (_, i) => `Bot${i + 1}`);

  console.log(`  Server:    ${SERVER_URL}`);
  console.log(`  Room code: ${ROOM_CODE.toUpperCase()}`);
  console.log(`  Bots:      ${botNames.join(', ')}`);
  console.log(`  Rounds:    ${CONFIG.ROUNDS_PER_GAME} regular + Last Lash`);
  console.log('');
  console.log('  Make sure you have:');
  console.log('    1. Created the room on the host screen');
  console.log('    2. Joined as yourself on the player screen');
  console.log('');

  const simulator = new GameSimulator({
    serverUrl: SERVER_URL,
    playerCount: BOT_COUNT,
    logLevel: 'info',
    actionDelay: 50,
  });

  const result = await simulator.runBotsOnlyInRoom({
    roomCode: ROOM_CODE,
    botNames,
    answerStrategy: (playerIndex, prompt, round) => {
      if (round === 'lastLash') return lastLashAnswerStrategy(playerIndex, prompt);
      return answerStrategy(playerIndex, prompt, round);
    },
    voteStrategy: (playerIndex, playerId, data, round, matchupIndex) => {
      if (round === 'lastLash') return lastLashVoteStrategy(playerIndex, playerId, data);
      return voteStrategy(playerIndex, playerId, data, round, matchupIndex);
    },
  });

  console.log('');
  console.log('--- Game Summary ---');
  const summary = simulator.getSummary();
  console.log(`  Room code: ${summary.roomCode}`);
  console.log(`  Bots:      ${summary.players.join(', ')}`);
  console.log(`  Errors:    ${summary.errors}`);

  if (result.success) {
    const { winners, scoreboard } = result.results;
    if (Array.isArray(scoreboard) && scoreboard.length > 0) {
      console.log('');
      console.log('--- Final Scoreboard ---');
      scoreboard.forEach((player, i) => {
        const tag = i === 0 ? '  <-- winner' : '';
        console.log(`  ${i + 1}. ${player.name}: ${player.score} pts${tag}`);
      });
      if (Array.isArray(winners) && winners.length > 0) {
        console.log(`\n  Winner(s): ${winners.map(w => w.name).join(', ')}`);
      }
    }
    console.log('');
    console.log('='.repeat(60));
    console.log('GAME COMPLETE');
    console.log('='.repeat(60));
    process.exit(0);
  } else {
    console.error(`\n  Game failed: ${result.error}`);
    if (result.errors && result.errors.length > 0) {
      console.error('  Errors:', result.errors.map(e => e.message).join('; '));
    }
    console.log('');
    console.log('='.repeat(60));
    console.log('GAME FAILED');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

if (require.main === module) {
  runSoloWithBots().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runSoloWithBots };
