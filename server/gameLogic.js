
/**
 * LUDO GAME LOGIC - Server-side authoritative game state
 * Handles rules, movement, captures, powers and win detection
 */

const COLORS = ['red', 'blue', 'green', 'yellow'];

const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const COLOR_START = { red: 0, green: 13, yellow: 26, blue: 39 };
const COLOR_HOME_ENTRY = { red: 50, green: 11, yellow: 24, blue: 37 };

const HOME_COL_LENGTH = 5;
const TRACK_SIZE = 52;

const POWER_TYPES = ['dice', 'speed', 'shield', 'double', 'attack'];

function createInitialTokens() {
  const tokens = {};

  COLORS.forEach(color => {
    tokens[color] = Array.from({ length: 4 }, (_, id) => ({
      id,
      position: -1,
      color
    }));
  });

  return tokens;
}

function createPowerUsage() {
  const powers = {};

  COLORS.forEach(color => {
    powers[color] = {
      dice: false,
      speed: false,
      shield: false,
      double: false,
      attack: false
    };
  });

  return powers;
}

function createShieldedTokens() {
  const shields = {};

  COLORS.forEach(color => {
    shields[color] = [];
  });

  return shields;
}

function getAbsolutePosition(color, relativePos) {
  if (relativePos < 0 || relativePos >= 200) return null;
  return (COLOR_START[color] + relativePos) % TRACK_SIZE;
}

function getRelativePosition(color, absolutePos) {
  return (absolutePos - COLOR_START[color] + TRACK_SIZE) % TRACK_SIZE;
}

function canTokenMove(token, dice, color) {
  const pos = token.position;

  if (!Number.isInteger(dice) || dice < 1) {
    return { canMove: false };
  }

  // Token in base
  if (pos === -1) {
    return {
      canMove: dice === 6,
      newPosition: COLOR_START[color],
      enterHome: false,
      unlockOnly: true
    };
  }

  // Already home
  if (pos === 200) return { canMove: false };

  // Home column
  if (pos >= 100 && pos < 200) {
    const homeStep = pos - 100;
    const newStep = homeStep + dice;

    if (newStep === HOME_COL_LENGTH) {
      return {
        canMove: true,
        newPosition: 200,
        enterHome: true
      };
    }

    if (newStep < HOME_COL_LENGTH) {
      return {
        canMove: true,
        newPosition: 100 + newStep,
        enterHome: false
      };
    }

    return { canMove: false };
  }

  // Main track
  const relPos = getRelativePosition(color, pos);
  const newRel = relPos + dice;

  if (relPos <= 50 && newRel > 50) {
    const homeSteps = newRel - 50;

    if (homeSteps === HOME_COL_LENGTH + 1) {
      return {
        canMove: true,
        newPosition: 200,
        enterHome: true
      };
    }

    if (homeSteps <= HOME_COL_LENGTH) {
      return {
        canMove: true,
        newPosition: 100 + homeSteps - 1,
        enterHome: false
      };
    }

    return { canMove: false };
  }

  return {
    canMove: true,
    newPosition: (pos + dice) % TRACK_SIZE,
    enterHome: false
  };
}

function getValidMoves(gameState, color, dice) {
  const tokens = gameState.tokens[color];
  const validMoves = [];

  tokens.forEach((token, idx) => {
    const result = canTokenMove(token, dice, color);

    if (result.canMove) {
      validMoves.push({
        tokenIndex: idx,
        ...result
      });
    }
  });

  return validMoves;
}

function checkCaptures(gameState, movingColor, newPosition) {
  if (newPosition < 0 || newPosition >= 100) return [];
  if (SAFE_CELLS.has(newPosition)) return [];

  const captured = [];

  COLORS.forEach(color => {
    if (color === movingColor) return;

    gameState.tokens[color].forEach((token, idx) => {
      if (token.position !== newPosition) return;

      const shields = gameState.shieldedTokens?.[color] || [];
      const shieldIndex = shields.indexOf(idx);

      // Shield blocks one capture, then disappears
      if (shieldIndex !== -1) {
        shields.splice(shieldIndex, 1);

        if (!gameState.blockedCaptures) {
          gameState.blockedCaptures = [];
        }

        gameState.blockedCaptures.push({
          color,
          tokenIndex: idx
        });

        return;
      }

      captured.push({
        color,
        tokenIndex: idx
      });
    });
  });

  return captured;
}

function calculatePath(token, dice, color) {
  const path = [];
  let currentPos = token.position;

  if (currentPos === -1) {
    if (dice === 6) path.push(COLOR_START[color]);
    return path;
  }

  for (let i = 1; i <= dice; i++) {
    const result = canTokenMove(
      { position: currentPos },
      1,
      color
    );

    if (!result.canMove) break;

    currentPos = result.newPosition;
    path.push(currentPos);

    if (currentPos === 200) break;
  }

  return path;
}

function applyMove(gameState, color, tokenIndex, dice) {
  const token = gameState.tokens[color]?.[tokenIndex];

  if (!token) return null;

  const oldPosition = token.position;
  const path = calculatePath(token, dice, color);

  if (path.length === 0) return null;

  const finalPos = path[path.length - 1];

  token.position = finalPos;

  gameState.blockedCaptures = [];

  const captured = checkCaptures(
    gameState,
    color,
    finalPos
  );

  captured.forEach(({ color: capColor, tokenIndex: capIdx }) => {
    gameState.tokens[capColor][capIdx].position = -1;
  });

  const blockedCaptures = [...gameState.blockedCaptures];
  gameState.blockedCaptures = [];

  const reachedHome = finalPos === 200;
  const extraTurn = dice === 6 || captured.length > 0;

  gameState.moveCount = (gameState.moveCount || 0) + 1;

  return {
    captured,
    blockedCaptures,
    reachedHome,
    extraTurn,
    oldPosition,
    newPosition: finalPos,
    path
  };
}

function checkWin(gameState, color) {
  return gameState.tokens[color].every(
    token => token.position === 200
  );
}

function getNextPlayer(gameState) {
  const activePlayers = gameState.players.filter(
    player => player.active && !player.finished
  );

  if (activePlayers.length === 0) return null;

  const currentIdx = activePlayers.findIndex(
    player => player.color === gameState.currentTurn
  );

  const nextIdx = (currentIdx + 1) % activePlayers.length;

  return activePlayers[nextIdx].color;
}

function createGameState(players) {
  const assignedPlayers = players.map((player, index) => ({
    ...player,
    color: COLORS[index],
    type: player.type || 'human',
    active: true,
    finished: false,
    rank: null
  }));

  return {
    players: assignedPlayers,
    tokens: createInitialTokens(),
    currentTurn: assignedPlayers[0].color,
    phase: 'playing',
    diceValue: null,
    diceRolled: false,
    validMoves: [],
    rankings: [],
    moveCount: 0,
    startTime: Date.now(),

    // Power state
    powersUsed: createPowerUsage(),
    shieldedTokens: createShieldedTokens(),
    blockedCaptures: []
  };
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

function chooseBotMove(gameState, color, validMoves) {
  if (validMoves.length === 0) return null;
  if (validMoves.length === 1) return validMoves[0];

  // Priority 1: Capture
  for (const move of validMoves) {
    if (
      move.newPosition >= 0 &&
      move.newPosition < 100 &&
      !SAFE_CELLS.has(move.newPosition)
    ) {
      for (const opponentColor of COLORS) {
        if (opponentColor === color) continue;

        for (const opponentToken of gameState.tokens[opponentColor]) {
          if (opponentToken.position === move.newPosition) {
            return move;
          }
        }
      }
    }
  }

  // Priority 2: Reach home
  const homeMove = validMoves.find(
    move => move.newPosition === 200
  );

  if (homeMove) return homeMove;

  // Priority 3: Bring token out
  const unlockMove = validMoves.find(
    move => move.unlockOnly
  );

  if (unlockMove) return unlockMove;

  // Priority 4: Move furthest-progressed token
  let bestMove = validMoves[0];
  let bestProgress = -1;

  for (const move of validMoves) {
    const token = gameState.tokens[color][move.tokenIndex];
    const pos = token.position;

    let progress = 0;

    if (pos >= 100 && pos < 200) {
      progress = 50 + (pos - 100);
    } else if (pos >= 0) {
      progress = getRelativePosition(color, pos);
    }

    if (progress > bestProgress) {
      bestProgress = progress;
      bestMove = move;
    }
  }

  return bestMove;
}

module.exports = {
  createGameState,
  rollDice,
  getValidMoves,
  applyMove,
  checkWin,
  getNextPlayer,
  chooseBotMove,
  COLORS,
  COLOR_START,
  SAFE_CELLS,
  TRACK_SIZE,
  POWER_TYPES,
  canTokenMove
};
