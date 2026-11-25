
/**
 * socketHandler.js
 * Socket.IO event handlers.
 * Room management, game flow, bots and Power system.
 */

const {
  createGameState,
  rollDice,
  getValidMoves,
  applyMove,
  checkWin,
  getNextPlayer,
  chooseBotMove,
  COLORS,
} = require('./gameLogic');

const sanitizeName = (n) =>
  n?.toString().trim().slice(0, 20) || '';

const TURN_TIMEOUT_MS = 20000;

const SAFE_CELLS = [0, 8, 13, 21, 26, 34, 39, 47];

const POWER_TYPES = [
  'dice',
  'speed',
  'shield',
  'double',
  'attack',
];

// In-memory room storage
const rooms = new Map();

module.exports = function registerSocketHandlers(io) {

  io.on('connection', (socket) => {

    console.log(`[Socket] Connected: ${socket.id}`);

    // ─────────────────────────────────────────────
    // CREATE ROOM
    // ─────────────────────────────────────────────

    socket.on('create_room', ({ playerName, maxPlayers, includeBots } = {}) => {

      const name = sanitizeName(playerName);

      if (!name) {
        socket.emit('error', { message: 'Нэрээ оруулна уу.' });
        return;
      }

      const roomId = generateRoomId();

      const max = Math.min(
        Math.max(parseInt(maxPlayers) || 4, 2),
        4
      );

      const room = {
        id: roomId,
        maxPlayers: max,
        players: [],
        game: null,
        chat: [],
        turnTimer: null,
        turnTimerInterval: null,
        botTimer: null,
        noMoveTimer: null,
        hasBots: !!includeBots,
      };

      const color = COLORS[0];

      const player = {
        id: socket.id,
        name,
        color,
        connected: true,
        type: 'human',
      };

      room.players.push(player);

      // Fill remaining slots with bots
      if (includeBots) {

        const botNames = [
          'Bot Alpha',
          'Bot Beta',
          'Bot Gamma',
        ];

        for (let i = 1; i < max; i++) {

          room.players.push({
            id: `bot_${i}`,
            name: botNames[i - 1] || `Bot ${i}`,
            color: COLORS[i],
            connected: true,
            type: 'bot',
          });

        }
      }

      rooms.set(roomId, room);

      socket.join(roomId);

      socket.data.roomId = roomId;
      socket.data.color = color;

      socket.emit('room_created', {
        roomId,
        room,
      });

      console.log(
        `[Room] Created ${roomId} by ${name}`
      );

    });


    // ─────────────────────────────────────────────
    // JOIN ROOM
    // ─────────────────────────────────────────────

    socket.on('join_room', ({ roomId, playerName } = {}) => {

      const name = sanitizeName(playerName);

      const room = rooms.get(
        roomId?.toUpperCase()
      );

      if (!room) {
        socket.emit('error', {
          message: 'Room not found.',
        });
        return;
      }

      if (room.game) {
        socket.emit('error', {
          message: 'Game already in progress.',
        });
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        socket.emit('error', {
          message: 'Room is full.',
        });
        return;
      }

      if (!name) {
        socket.emit('error', {
          message: 'Нэрээ оруулна уу.',
        });
        return;
      }

      const color = COLORS[room.players.length];

      const player = {
        id: socket.id,
        name,
        color,
        connected: true,
        type: 'human',
      };

      room.players.push(player);

      socket.join(room.id);

      socket.data.roomId = room.id;
      socket.data.color = color;

      io.to(room.id).emit('player_joined', {
        room,
      });

      socket.emit('room_joined', {
        roomId: room.id,
        room,
      });

      if (room.players.length === room.maxPlayers) {
        startGame(io, room);
      }

      console.log(
        `[Room] ${name} joined ${room.id}`
      );

    });


    // ─────────────────────────────────────────────
    // START GAME
    // ─────────────────────────────────────────────

    socket.on('start_game', () => {

      const room = getPlayerRoom(socket);

      if (!room) return;

      if (room.players[0].id !== socket.id) {
        socket.emit('error', {
          message: 'Only the host can start.',
        });
        return;
      }

      if (room.players.length < 2) {
        socket.emit('error', {
          message: 'Need at least 2 players.',
        });
        return;
      }

      if (!room.game) {
        startGame(io, room);
      }

    });


    // ─────────────────────────────────────────────
    // ROLL DICE
    // ─────────────────────────────────────────────

    socket.on('roll_dice', () => {

      const room = getPlayerRoom(socket);

      if (!room || !room.game) return;

      const game = room.game;

      const currentPlayer = game.players.find(
        p => p.color === game.currentTurn
      );

      if (!currentPlayer || currentPlayer.id !== socket.id) {
        socket.emit('error', {
          message: 'Not your turn.',
        });
        return;
      }

      if (game.phase === 'finished') return;

      if (game.diceRolled) {
        socket.emit('error', {
          message: 'Already rolled.',
        });
        return;
      }

      const value = rollDice();

      game.diceValue = value;
      game.diceRolled = true;

      game.validMoves = getValidMoves(
        game,
        game.currentTurn,
        value
      );

      io.to(room.id).emit('dice_rolled', {
        color: game.currentTurn,
        dice: value,
        validMoves: game.validMoves,
      });

      if (game.validMoves.length === 0) {

        scheduleNoMoveAdvance(io, room);

      } else {

        startSelectionTimer(
          io,
          room,
          game.currentTurn
        );

      }

    });


    // ─────────────────────────────────────────────
    // POWER SYSTEM
    // ─────────────────────────────────────────────

    socket.on('use_power', (data = {}) => {

      const room = getPlayerRoom(socket);

      if (!room || !room.game) return;

      const game = room.game;

      const {
        power,
        tokenIndex,
        targetColor,
        targetTokenIndex,
      } = data;

      const color = game.currentTurn;

      const currentPlayer = game.players.find(
        p => p.color === color
      );

      // Validate player
      if (!currentPlayer || currentPlayer.id !== socket.id) {
        socket.emit('error', {
          message: 'Not your turn.',
        });
        return;
      }

      if (game.phase === 'finished') return;

      // Validate power type
      if (!POWER_TYPES.includes(power)) {
        socket.emit('error', {
          message: 'Invalid power.',
        });
        return;
      }

      // Validate power state
      if (!game.powersUsed || !game.powersUsed[color]) {
        socket.emit('error', {
          message: 'Power system not initialized.',
        });
        return;
      }

      if (game.powersUsed[color][power]) {
        socket.emit('error', {
          message: 'Энэ Power-ийг өмнө нь ашигласан байна.',
        });
        return;
      }


      // ─────────────────────────────────────
      // 🎲 DICE POWER
      // Reroll once
      // ─────────────────────────────────────

      if (power === 'dice') {

        if (!game.diceRolled || !game.validMoves.length) {
          socket.emit('error', {
            message: 'Эхлээд шоо орхиж, боломжит нүүдэлтэй болсон байх хэрэгтэй.',
          });
          return;
        }

        game.powersUsed[color].dice = true;

        game.diceValue = rollDice();

        game.validMoves = getValidMoves(
          game,
          color,
          game.diceValue
        );

        io.to(room.id).emit('dice_rolled', {
          color,
          dice: game.diceValue,
          validMoves: game.validMoves,
          power: 'dice',
        });

        if (game.validMoves.length === 0) {

          clearTurnTimer(room);
          scheduleNoMoveAdvance(io, room);

        } else {

          startSelectionTimer(io, room, color);

        }

      }


      // ─────────────────────────────────────
      // 🚀 SPEED POWER
      // Add 3 to dice result
      // ─────────────────────────────────────

      if (power === 'speed') {

        if (!game.diceRolled || !game.validMoves.length) {
          socket.emit('error', {
            message: 'Эхлээд шоо орхиж, боломжит нүүдэлтэй болсон байх хэрэгтэй.',
          });
          return;
        }

        const newValue = game.diceValue + 3;

        const newMoves = getValidMoves(
          game,
          color,
          newValue
        );

        if (!newMoves.length) {
          socket.emit('error', {
            message: '+3 нэмэхэд боломжит нүүдэл алга.',
          });
          return;
        }

        game.powersUsed[color].speed = true;

        game.diceValue = newValue;
        game.validMoves = newMoves;

        io.to(room.id).emit('dice_rolled', {
          color,
          dice: newValue,
          validMoves: newMoves,
          power: 'speed',
        });

        startSelectionTimer(io, room, color);

      }


      // ─────────────────────────────────────
      // ⚡ DOUBLE POWER
      // Double dice result
      // ─────────────────────────────────────

      if (power === 'double') {

        if (!game.diceRolled || !game.validMoves.length) {
          socket.emit('error', {
            message: 'Эхлээд шоо орхиж, боломжит нүүдэлтэй болсон байх хэрэгтэй.',
          });
          return;
        }

        const newValue = game.diceValue * 2;

        const newMoves = getValidMoves(
          game,
          color,
          newValue
        );

        if (!newMoves.length) {
          socket.emit('error', {
            message: 'Давхарласан шоогоор боломжит нүүдэл алга.',
          });
          return;
        }

        game.powersUsed[color].double = true;

        game.diceValue = newValue;
        game.validMoves = newMoves;

        io.to(room.id).emit('dice_rolled', {
          color,
          dice: newValue,
          validMoves: newMoves,
          power: 'double',
        });

        startSelectionTimer(io, room, color);

      }


      // ─────────────────────────────────────
      // 🛡️ SHIELD POWER
      // Protect own token from one capture
      // ─────────────────────────────────────

      if (power === 'shield') {

        const ownTokenIndex = Number(tokenIndex);

        const ownToken =
          game.tokens[color]?.[ownTokenIndex];

        if (
          !Number.isInteger(ownTokenIndex) ||
          !ownToken ||
          ownToken.position < 0 ||
          ownToken.position > 51
        ) {
          socket.emit('error', {
            message: 'Самбар дээр байгаа өөрийн хүүг сонгоно уу.',
          });
          return;
        }

        if (!Array.isArray(game.shieldedTokens[color])) {
          game.shieldedTokens[color] = [];
        }

        if (
          game.shieldedTokens[color].includes(ownTokenIndex)
        ) {
          socket.emit('error', {
            message: 'Энэ хүү аль хэдийн хамгаалалттай байна.',
          });
          return;
        }

        game.powersUsed[color].shield = true;

        game.shieldedTokens[color].push(
          ownTokenIndex
        );

      }


      // ─────────────────────────────────────
      // 💥 ATTACK POWER
      // Send opponent token back to base
      // ─────────────────────────────────────

      if (power === 'attack') {

        const enemyColor = targetColor;
        const enemyIndex = Number(targetTokenIndex);

        if (
          !enemyColor ||
          enemyColor === color ||
          !COLORS.includes(enemyColor)
        ) {
          socket.emit('error', {
            message: 'Өрсөлдөгчийн хүүг сонгоно уу.',
          });
          return;
        }

        const enemyToken =
          game.tokens[enemyColor]?.[enemyIndex];

        if (
          !Number.isInteger(enemyIndex) ||
          !enemyToken ||
          enemyToken.position < 0 ||
          enemyToken.position > 51
        ) {
          socket.emit('error', {
            message: 'Самбар дээр байгаа өрсөлдөгчийн хүүг сонгоно уу.',
          });
          return;
        }

        if (SAFE_CELLS.includes(enemyToken.position)) {
          socket.emit('error', {
            message: 'Аюулгүй нүдэн дээрх хүүг довтлох боломжгүй.',
          });
          return;
        }

        game.powersUsed[color].attack = true;

        // Return opponent token to base
        enemyToken.position = -1;

        // Remove shield if present
        if (Array.isArray(game.shieldedTokens[enemyColor])) {
          game.shieldedTokens[enemyColor] =
            game.shieldedTokens[enemyColor].filter(
              index => index !== enemyIndex
            );
        }

      }


      // ─────────────────────────────────────
      // BROADCAST POWER RESULT
      // ─────────────────────────────────────

      io.to(room.id).emit('power_used', {
        color,
        power,

        tokenIndex:
          power === 'shield'
            ? Number(tokenIndex)
            : null,

        targetColor:
          power === 'attack'
            ? targetColor
            : null,

        targetTokenIndex:
          power === 'attack'
            ? Number(targetTokenIndex)
            : null,

        diceValue: game.diceValue,
      });

      io.to(room.id).emit(
        'game_state',
        buildClientState(game, room)
      );

    });


    // ─────────────────────────────────────────────
    // MOVE TOKEN
    // ─────────────────────────────────────────────

    socket.on('move_token', ({ tokenIndex } = {}) => {

      const room = getPlayerRoom(socket);

      if (!room || !room.game) return;

      const game = room.game;

      const currentPlayer = game.players.find(
        p => p.color === game.currentTurn
      );

      if (!currentPlayer || currentPlayer.id !== socket.id) {
        socket.emit('error', {
          message: 'Not your turn.',
        });
        return;
      }

      if (!game.diceRolled) {
        socket.emit('error', {
          message: 'Roll dice first.',
        });
        return;
      }

      const validMove = game.validMoves.find(
        m => m.tokenIndex === tokenIndex
      );

      if (!validMove) {
        socket.emit('error', {
          message: 'Invalid move.',
        });
        return;
      }

      clearTurnTimer(room);

      executeMove(
        io,
        room,
        currentPlayer.color,
        tokenIndex
      );

    });


    // ─────────────────────────────────────────────
    // CHAT
    // ─────────────────────────────────────────────

    socket.on('chat_message', ({ message } = {}) => {

      const room = getPlayerRoom(socket);

      if (!room) return;

      const player = room.players.find(
        p => p.id === socket.id
      );

      if (!player) return;

      const msg = String(message || '')
        .replace(/[<>&]/g, '')
        .trim()
        .slice(0, 200);

      if (!msg) return;

      const entry = {
        name: player.name,
        color: player.color,
        message: msg,
        time: Date.now(),
      };

      room.chat.push(entry);

      if (room.chat.length > 100) {
        room.chat.shift();
      }

      io.to(room.id).emit(
        'chat_message',
        entry
      );

    });


    // ─────────────────────────────────────────────
    // EMOJI REACTION
    // ─────────────────────────────────────────────

    socket.on('emoji_reaction', ({ emoji } = {}) => {

      const room = getPlayerRoom(socket);

      if (!room) return;

      const player = room.players.find(
        p => p.id === socket.id
      );

      if (!player) return;

      const safeEmojis = [
        '👍', '😂', '😮', '😢',
        '🎉', '🔥', '💪', '😡',
        '😤', '👏', '💀', '🏆',
      ];

      const safe = safeEmojis.includes(emoji)
        ? emoji
        : '👍';

      io.to(room.id).emit('emoji_reaction', {
        name: player.name,
        color: player.color,
        emoji: safe,
      });

    });


    // ─────────────────────────────────────────────
    // RESTART GAME
    // ─────────────────────────────────────────────

    socket.on('restart_game', () => {

      const room = getPlayerRoom(socket);

      if (!room) return;

      if (room.players[0].id !== socket.id) {
        socket.emit('error', {
          message: 'Only the host can restart.',
        });
        return;
      }

      clearTurnTimer(room);

      room.game = null;

      io.to(room.id).emit('game_restarted', {
        players: room.players,
      });

    });


    // ─────────────────────────────────────────────
    // DISCONNECT
    // ─────────────────────────────────────────────

    socket.on('disconnect', () => {

      console.log(
        `[Socket] Disconnected: ${socket.id}`
      );

      const room = getPlayerRoom(socket);

      if (!room) return;

      const player = room.players.find(
        p => p.id === socket.id
      );

      if (!player) return;

      player.connected = false;

      io.to(room.id).emit('player_disconnected', {
        name: player.name,
        color: player.color,
      });

      if (
        room.game &&
        room.game.currentTurn === player.color
      ) {
        clearTurnTimer(room);

        advanceTurn(io, room, false);
      }

      if (room.players.every(p => !p.connected)) {

        clearTurnTimer(room);

        rooms.delete(room.id);

        console.log(
          `[Room] Deleted empty room ${room.id}`
        );

      }

    });


    // ─────────────────────────────────────────────
    // RECONNECT
    // ─────────────────────────────────────────────

    socket.on('reconnect_room', ({ roomId, playerName } = {}) => {

      const room = rooms.get(
        roomId?.toUpperCase()
      );

      if (!room) {
        socket.emit('error', {
          message: 'Room not found.',
        });
        return;
      }

      const name = sanitizeName(playerName);

      const player = room.players.find(
        p => p.name === name && !p.connected
      );

      if (!player) {
        socket.emit('error', {
          message: 'Player not found in room.',
        });
        return;
      }

      player.id = socket.id;
      player.connected = true;

      socket.join(room.id);

      socket.data.roomId = room.id;
      socket.data.color = player.color;

      socket.emit('reconnected', {
        color: player.color,
        players: room.players,
      });

      if (room.game) {
        socket.emit(
          'game_state',
          buildClientState(room.game, room)
        );
      }

      io.to(room.id).emit('player_reconnected', {
        name,
        color: player.color,
      });

    });


    // ─────────────────────────────────────────────
    // GET PUBLIC ROOMS
    // ─────────────────────────────────────────────

    socket.on('get_rooms', () => {

      const publicRooms = Array.from(rooms.values())
        .filter(r => !r.game)
        .map(r => ({
          id: r.id,
          players: r.players.length,
          maxPlayers: r.maxPlayers,
          host: r.players[0]?.name || 'Unknown',
        }));

      socket.emit(
        'rooms_list',
        publicRooms
      );

    });

  });


  // ═════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═════════════════════════════════════════════

  function getPlayerRoom(socket) {

    return socket.data?.roomId
      ? rooms.get(socket.data.roomId)
      : null;

  }


  // ─────────────────────────────────────────────
  // START GAME
  // ─────────────────────────────────────────────

  function startGame(io, room) {

    const playerData = room.players.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type || 'human',
    }));

    room.game = createGameState(playerData);

    io.to(room.id).emit('game_started', {
      gameState: buildClientState(room.game, room),

      playerColors: room.players.map(p => ({
        socketId: p.id,
        color: p.color,
      })),
    });

    const firstPlayer = room.game.players.find(
      p => p.color === room.game.currentTurn
    );

    if (firstPlayer && firstPlayer.type === 'bot') {
      scheduleBotTurn(io, room);
    } else {
      startTurnTimer(io, room);
    }

  }


  // ─────────────────────────────────────────────
  // EXECUTE MOVE
  // ─────────────────────────────────────────────

  function executeMove(io, room, color, tokenIndex) {

    const game = room.game;

    if (!game || game.phase === 'finished') return;

    const moveResult = applyMove(
      game,
      color,
      tokenIndex,
      game.diceValue
    );

    if (!moveResult) return;

    io.to(room.id).emit('token_moved', {

      color,
      tokenIndex,

      oldPosition: moveResult.oldPosition,
      newPosition: moveResult.newPosition,

      path: moveResult.path,
      captured: moveResult.captured,

      blockedCaptures: game.blockedCaptures || [],

      dice: game.diceValue,

    });

    // Check win
    if (checkWin(game, color)) {

      const winner = game.players.find(
        p => p.color === color
      );

      game.phase = 'finished';

      io.to(room.id).emit('game_over', {
        winner: color,
        winnerName: winner?.name,
        rankings: game.rankings || [],
        tokens: game.tokens,
      });

      clearTurnTimer(room);

      return;

    }

    // Advance turn
    advanceTurn(
      io,
      room,
      moveResult.extraTurn
    );

  }


  // ─────────────────────────────────────────────
  // ADVANCE TURN
  // ─────────────────────────────────────────────

  function advanceTurn(io, room, extraTurn) {

    const game = room.game;

    if (!game || game.phase === 'finished') return;

    clearTurnTimer(room);

    if (extraTurn) {

      game.diceRolled = false;
      game.diceValue = null;
      game.validMoves = [];

    } else {

      const nextColor = getNextPlayer(game);

      if (!nextColor) return;

      game.currentTurn = nextColor;

      game.diceRolled = false;
      game.diceValue = null;
      game.validMoves = [];

    }

    io.to(room.id).emit(
      'game_state',
      buildClientState(game, room)
    );

    const currentPlayer = game.players.find(
      p => p.color === game.currentTurn
    );

    if (currentPlayer && currentPlayer.type === 'bot') {
      scheduleBotTurn(io, room);
    } else {
      startTurnTimer(io, room);
    }

  }


  // ─────────────────────────────────────────────
  // TURN TIMER
  // ─────────────────────────────────────────────

  function startTurnTimer(io, room) {

    clearTurnTimer(room);

    if (!room.game || room.game.phase === 'finished') {
      return;
    }

    const game = room.game;

    let timeLeft = TURN_TIMEOUT_MS / 1000;

    io.to(room.id).emit('turn_timer', {
      seconds: timeLeft,
    });

    room.turnTimerInterval = setInterval(() => {

      timeLeft--;

      io.to(room.id).emit('turn_timer', {
        seconds: timeLeft,
      });

    }, 1000);

    room.turnTimer = setTimeout(() => {

      clearInterval(room.turnTimerInterval);
      room.turnTimerInterval = null;
      room.turnTimer = null;

      if (!room.game || game.phase === 'finished') {
        return;
      }

      const currentColor = game.currentTurn;

      if (!game.diceRolled) {

        // Auto roll
        const value = rollDice();

        game.diceValue = value;
        game.diceRolled = true;

        game.validMoves = getValidMoves(
          game,
          currentColor,
          value
        );

        const currentPlayer = game.players.find(
          p => p.color === currentColor
        );

        io.to(room.id).emit('dice_rolled', {
          color: currentColor,
          dice: value,
          validMoves: game.validMoves,
          playerId: currentPlayer?.id,
          auto: true,
        });

        if (game.validMoves.length === 0) {

          scheduleNoMoveAdvance(io, room);

        } else {

          setTimeout(() => {

            if (
              !room.game ||
              room.game.phase === 'finished' ||
              room.game.currentTurn !== currentColor
            ) {
              return;
            }

            const m = room.game.validMoves[0];

            if (m) {
              executeMove(
                io,
                room,
                currentColor,
                m.tokenIndex
              );
            }

          }, 1500);

        }

      } else {

        // Auto pick move
        const m = game.validMoves[0];

        if (m) {
          executeMove(
            io,
            room,
            currentColor,
            m.tokenIndex
          );
        } else {
          advanceTurn(io, room, false);
        }

      }

    }, TURN_TIMEOUT_MS);

  }


  // ─────────────────────────────────────────────
  // TOKEN SELECTION TIMER
  // ─────────────────────────────────────────────

  function startSelectionTimer(io, room, color) {

    clearTurnTimer(room);

    if (!room.game || room.game.phase === 'finished') {
      return;
    }

    let seconds = TURN_TIMEOUT_MS / 1000;

    io.to(room.id).emit('turn_timer', {
      seconds,
    });

    room.turnTimerInterval = setInterval(() => {

      seconds--;

      io.to(room.id).emit('turn_timer', {
        seconds,
      });

    }, 1000);

    room.turnTimer = setTimeout(() => {

      clearInterval(room.turnTimerInterval);

      room.turnTimerInterval = null;
      room.turnTimer = null;

      if (
        !room.game ||
        room.game.phase === 'finished' ||
        room.game.currentTurn !== color
      ) {
        return;
      }

      const move = room.game.validMoves[0];

      if (move) {
        executeMove(
          io,
          room,
          color,
          move.tokenIndex
        );
      } else {
        advanceTurn(io, room, false);
      }

    }, TURN_TIMEOUT_MS);

  }


  // ─────────────────────────────────────────────
  // NO VALID MOVE
  // ─────────────────────────────────────────────

  function scheduleNoMoveAdvance(io, room) {

    if (room.noMoveTimer) {
      clearTimeout(room.noMoveTimer);
    }

    const color = room.game?.currentTurn;

    room.noMoveTimer = setTimeout(() => {

      room.noMoveTimer = null;

      if (
        !room.game ||
        room.game.phase === 'finished' ||
        room.game.currentTurn !== color
      ) {
        return;
      }

      advanceTurn(io, room, false);

    }, 1500);

  }


  // ─────────────────────────────────────────────
  // CLEAR TIMERS
  // ─────────────────────────────────────────────

  function clearTurnTimer(room) {

    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }

    if (room.turnTimerInterval) {
      clearInterval(room.turnTimerInterval);
      room.turnTimerInterval = null;
    }

    if (room.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
    }

    if (room.noMoveTimer) {
      clearTimeout(room.noMoveTimer);
      room.noMoveTimer = null;
    }

  }


  // ─────────────────────────────────────────────
  // BOT TURN
  // ─────────────────────────────────────────────

  function scheduleBotTurn(io, room) {

    clearTurnTimer(room);

    const game = room.game;

    if (!game || game.phase === 'finished') return;

    const botColor = game.currentTurn;

    console.log(
      `[Bot] Scheduling turn for ${botColor}`
    );

    // Step 1: Roll dice
    room.botTimer = setTimeout(() => {

      if (
        !room.game ||
        room.game.phase === 'finished' ||
        room.game.currentTurn !== botColor
      ) {
        return;
      }

      const value = rollDice();

      game.diceValue = value;
      game.diceRolled = true;

      game.validMoves = getValidMoves(
        game,
        botColor,
        value
      );

      io.to(room.id).emit('dice_rolled', {
        color: botColor,
        dice: value,
        validMoves: game.validMoves,
      });

      console.log(
        `[Bot] ${botColor} rolled ${value}, ${game.validMoves.length} valid moves`
      );

      if (game.validMoves.length === 0) {

        room.botTimer = setTimeout(() => {

          if (
            room.game &&
            room.game.currentTurn === botColor
          ) {
            advanceTurn(io, room, false);
          }

        }, 1000);

        return;
      }

      // Step 2: Choose and execute move
      room.botTimer = setTimeout(() => {

        if (
          !room.game ||
          room.game.phase === 'finished' ||
          room.game.currentTurn !== botColor
        ) {
          return;
        }

        const chosenMove = chooseBotMove(
          game,
          botColor,
          game.validMoves
        );

        if (chosenMove) {

          executeMove(
            io,
            room,
            botColor,
            chosenMove.tokenIndex
          );

        } else {

          advanceTurn(io, room, false);

        }

      }, 1200);

    }, 1000);

  }


  // ─────────────────────────────────────────────
  // CLIENT GAME STATE
  // ─────────────────────────────────────────────

  function buildClientState(game, room) {

    const currentPlayer = game.players.find(
      p => p.color === game.currentTurn
    );

    return {

      players: game.players,

      tokens: game.tokens,

      currentTurn: game.currentTurn,

      currentPlayerId: currentPlayer?.id,

      diceValue: game.diceValue,

      diceRolled: game.diceRolled,

      validMoves: game.validMoves,

      phase: game.phase,

      rankings: game.rankings || [],

      // Power information
      powersUsed: game.powersUsed || {},

      shieldedTokens: game.shieldedTokens || {},

      blockedCaptures: game.blockedCaptures || [],

    };

  }


  // ─────────────────────────────────────────────
  // GENERATE ROOM ID
  // ─────────────────────────────────────────────

  function generateRoomId() {

    let id;

    do {

      const digits = Math.floor(
        100 + Math.random() * 900
      );

      id = `SIVA${digits}`;

    } while (rooms.has(id));

    return id;

  }

};
