/**
 * LUDO KING — CLIENT APPLICATION
 * Handles board rendering, socket communication, UI state
 */

// =====================================================================
// BOARD LAYOUT CONSTANTS
// =====================================================================

const BOARD_SIZE = 560;
const CELL_SIZE = BOARD_SIZE / 15;
const C = CELL_SIZE;

const COLORS = ['red', 'blue', 'green', 'yellow'];

const COLOR_MAP = {
  red: '#e83b3b',
  blue: '#3b6ae8',
  green: '#2ec060',
  yellow: '#e8c03b'
};

const COLOR_LIGHT = {
  red: '#ff8080',
  blue: '#80aaff',
  green: '#80e8a0',
  yellow: '#ffe080'
};

const TRACK_CELLS = [
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14]
];

const HOME_COLS = {
  red: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
};

const BASE_TOKEN_POSITIONS = {
  red: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
  blue: [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
  green: [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]],
  yellow: [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]]
};

const HOME_CENTER = [7, 7];

const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// =====================================================================
// STATE
// =====================================================================

let socket;
let mySocketId = null;
let myColor = null;
let gameState = null;
let roomId = null;
let animatingToken = null;
let selectedPower = null;

let canvas, ctx;

// =====================================================================
// INIT
// =====================================================================

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('ludo-board');
  ctx = canvas.getContext('2d');

  socket = io("https://ludo-9dtp.onrender.com");

  createPowerUI();
  setupSocketEvents();
  setupUIEvents();
  drawBoard(null);
});

// =====================================================================
// UI EVENT SETUP
// =====================================================================

function createPowerUI() {
  const boardArea = document.querySelector('.board-area');
  if (!boardArea || document.getElementById('power-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'power-panel';
  panel.className = 'power-panel';
  panel.innerHTML = `
    <div class="power-title">⚡ POWER ABILITIES</div>
    <div class="power-buttons">
      <button type="button" class="power-btn" data-power="dice"><span class="power-icon">🎲</span><span>Dice</span></button>
      <button type="button" class="power-btn" data-power="speed"><span class="power-icon">🚀</span><span>Speed +3</span></button>
      <button type="button" class="power-btn" data-power="shield"><span class="power-icon">🛡️</span><span>Shield</span></button>
      <button type="button" class="power-btn" data-power="double"><span class="power-icon">⚡</span><span>Double</span></button>
      <button type="button" class="power-btn" data-power="attack"><span class="power-icon">💥</span><span>Attack</span></button>
    </div>
    <div id="power-hint" class="power-hint">Power бүрийг нэг тоглолтод нэг удаа ашиглана.</div>
  `;

  const diceArea = boardArea.querySelector('.dice-area');
  if (diceArea) diceArea.insertAdjacentElement('afterend', panel);
  else boardArea.appendChild(panel);
}

function setupUIEvents() {
  document.getElementById('btn-next').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();

    if (!name || name.length < 2) {
      return showToast('Enter a name (2+ chars)', 'error');
    }

    window.currentPlayerName = name;

    document.getElementById('display-user-name').textContent = name;

    showScreen('discovery');
    startRoomDiscovery();
  });

  document.getElementById('player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      document.getElementById('btn-next').click();
    }
  });

  document.getElementById('btn-change-name').addEventListener('click', () => {
    stopRoomDiscovery();
    showScreen('name');
  });

  let selectedPlayerCount = 4;
  let includeBots = true;

  document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.count-btn').forEach(b => {
        b.classList.remove('active');
      });

      btn.classList.add('active');
      selectedPlayerCount = parseInt(btn.dataset.count);
    });
  });

  document.getElementById('bot-toggle-yes').addEventListener('click', () => {
    includeBots = true;

    document.getElementById('bot-toggle-yes').classList.add('active');
    document.getElementById('bot-toggle-no').classList.remove('active');
  });

  document.getElementById('bot-toggle-no').addEventListener('click', () => {
    includeBots = false;

    document.getElementById('bot-toggle-no').classList.add('active');
    document.getElementById('bot-toggle-yes').classList.remove('active');
  });

  document.getElementById('btn-create').addEventListener('click', () => {
    const name = window.currentPlayerName;

    socket.emit('create_room', {
      playerName: name,
      maxPlayers: selectedPlayerCount,
      includeBots: includeBots
    });
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const name = window.currentPlayerName;

    const code = document.getElementById('room-code')
      .value.trim().toUpperCase();

    if (!code || code.length < 4) {
      return showToast('Enter room code', 'error');
    }

    socket.emit('join_room', {
      playerName: name,
      roomId: code
    });
  });

  document.getElementById('room-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      document.getElementById('btn-join').click();
    }
  });

  // Lobby

  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('lobby-room-id').textContent;

    navigator.clipboard?.writeText(code).then(() => {
      showToast('Code copied!', 'success');
    });
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    socket.emit('start_game');
  });

  document.getElementById('btn-leave-lobby').addEventListener('click', () => {
    socket.emit('leave_room');
    location.reload();
  });

  document.getElementById('btn-leave-game').addEventListener('click', () => {
    if (confirm('Are you sure you want to quit the game?')) {
      socket.emit('leave_room');
      location.reload();
    }
  });

  // Game

  document.getElementById('btn-roll').addEventListener('click', () => {
    socket.emit('roll_dice');
  });

  // POWER BUTTONS
  document.getElementById('power-panel')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-power]');
    if (!btn || btn.disabled) return;

    const power = btn.dataset.power;
    if (!gameState || gameState.currentTurn !== myColor) {
      showToast('Таны ээлж биш байна.', 'error');
      return;
    }

    if (power === 'shield' || power === 'attack') {
      selectedPower = selectedPower === power ? null : power;
      updatePowerHint();
      renderPowerButtons();
      if (selectedPower) {
        showToast(power === 'shield'
          ? 'Хамгаалах өөрийн хүүг сонгоно уу.'
          : 'Довтлох өрсөлдөгчийн хүүг сонгоно уу.');
      }
      return;
    }

    socket.emit('use_power', { power });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && selectedPower) {
      selectedPower = null;
      updatePowerHint();
      renderPowerButtons();
    }
  });

  canvas.addEventListener('click', onBoardClick);

  // Chat

  document.getElementById('btn-send-chat').addEventListener('click', sendChat);

  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendChat();
  });

  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('emoji_reaction', {
        emoji: btn.dataset.emoji
      });
    });
  });

  // Winner

  document.getElementById('btn-restart').addEventListener('click', () => {
    socket.emit('restart_game');
  });

  document.getElementById('btn-home').addEventListener('click', () => {
    location.reload();
  });
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();

  if (!msg) return;

  socket.emit('chat_message', { message: msg });
  input.value = '';
}// =====================================================================
// SOCKET EVENTS
// =====================================================================

function setupSocketEvents() {
  socket.on('connect', () => {
    mySocketId = socket.id;
  });

  socket.on('error', ({ message }) => {
    showToast(message, 'error');
  });

  socket.on('room_created', ({ roomId: id, room }) => {
    roomId = id;
    stopRoomDiscovery();
    showScreen('lobby');
    renderLobby(room);
    document.getElementById('btn-start').style.display = 'inline-block';
  });

  socket.on('room_joined', ({ roomId: id, room }) => {
    roomId = id;
    stopRoomDiscovery();
    showScreen('lobby');
    renderLobby(room);
  });

  socket.on('rooms_list', (rooms) => {
    renderDiscoveryRooms(rooms);
  });

  socket.on('player_joined', ({ room }) => {
    renderLobby(room);
    showToast(`${room.players[room.players.length - 1].name} joined!`);
  });

  socket.on('player_disconnected', ({ name }) => {
    showToast(`${name} disconnected`, 'error');
    addLogEntry(`${name} disconnected`);
  });

  socket.on('game_started', ({ gameState: gs, playerColors }) => {
    gameState = gs;

    const me = playerColors.find(p => p.socketId === mySocketId);
    if (me) myColor = me.color;

    showScreen('game');
    renderGameUI();
    drawBoard(gs);
    startTimerBar();
    addLogEntry('Game started!');
  });

  socket.on('game_state', (gs) => {
    gameState = gs;
    renderGameUI();
    drawBoard(gs);
    startTimerBar();
  });

  socket.on('dice_rolled', ({ color, dice, validMoves }) => {
    gameState.diceValue = dice;
    gameState.diceRolled = true;
    gameState.validMoves = validMoves;

    animateDice(dice);
    drawBoard(gameState);
    updateRollButton();

    addLogEntry(
      `${capColor(color)} rolled a ${dice}${validMoves.length === 0 ? ' (no moves)' : ''}`
    );
  });

  socket.on('power_used', data => {
    const {
      color, power, tokenIndex, targetColor, targetTokenIndex
    } = data || {};

    selectedPower = null;
    updatePowerHint();
    renderPowerButtons();

    const names = {
      dice: '🎲 Dice Power',
      speed: '🚀 Speed Power',
      shield: '🛡️ Shield Power',
      double: '⚡ Double Power',
      attack: '💥 Attack Power'
    };

    addLogEntry(`${capColor(color)} used ${names[power] || power}`);
    showToast(`${names[power] || power} амжилттай ашиглалаа!`, 'success');

    if (power === 'shield') {
      addLogEntry(`🛡️ ${capColor(color)}-ийн ${Number(tokenIndex) + 1}-р хүү хамгаалалттай боллоо.`);
    }
    if (power === 'attack') {
      addLogEntry(`💥 ${capColor(targetColor)}-ийн ${Number(targetTokenIndex) + 1}-р хүү суурь руу буцлаа.`);
    }
  });

  socket.on('token_moved', async ({
    color,
    tokenIndex,
    oldPosition,
    newPosition,
    path,
    captured,
    dice
  }) => {
    if (path && path.length > 0) {
      await animateJumpPath(color, tokenIndex, path);
    } else {
      gameState.tokens[color][tokenIndex].position = newPosition;
    }

    captured?.forEach(({ color: c, tokenIndex: ti }) => {
      gameState.tokens[c][ti].position = -1;
    });

    drawBoard(gameState);

    if (captured?.length > 0) {
      captured.forEach(({ color: c }) => {
        addLogEntry(`💥 ${capColor(color)} captured ${capColor(c)}!`);
        showToast(`${capColor(color)} captured ${capColor(c)}!`);
      });
    }

    if (newPosition === 200) {
      addLogEntry(`🏠 ${capColor(color)} coin reached home!`);
    }
  });

  socket.on('player_finished', ({ color, name, rank }) => {
    addLogEntry(`🏆 ${name} finished in rank #${rank}!`);
    showToast(`${name} finished in #${rank}!`);
  });

  socket.on('game_over', ({ rankings, tokens }) => {
    gameState.tokens = tokens;
    gameState.rankings = rankings;
    drawBoard(gameState);

    setTimeout(() => showWinnerScreen(rankings), 1200);
  });

  socket.on('chat_message', ({ name, color, message, time }) => {
    addChatMessage(name, color, message);
  });

  socket.on('emoji_reaction', ({ name, emoji }) => {
    showFloatingEmoji(emoji);
    addLogEntry(`${name}: ${emoji}`);
  });

  socket.on('turn_timeout', ({ color }) => {
    addLogEntry(`⏱️ ${capColor(color)}'s turn timed out`);
  });

  socket.on('game_restarted', ({ room }) => {
    selectedPower = null;
    gameState = null;
    myColor = null;
    showScreen('lobby');
    renderLobby(room);
  });
}

// =====================================================================
// DISCOVERY RENDER
// =====================================================================

let discoveryInterval = null;

function startRoomDiscovery() {
  socket.emit('get_rooms');

  discoveryInterval = setInterval(() => {
    socket.emit('get_rooms');
  }, 3000);
}

function stopRoomDiscovery() {
  clearInterval(discoveryInterval);
}

function renderDiscoveryRooms(rooms) {
  const container = document.getElementById('rooms-list');

  if (rooms.length === 0) {
    container.innerHTML =
      '<div class="rooms-empty">No active rooms found. Host one!</div>';
    return;
  }

  container.innerHTML = '';

  rooms.forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-item';

    item.innerHTML = `
      <div class="room-info">
        <div class="room-host">${escHtml(r.host)}'s Room</div>
        <div class="room-meta">Code: <span class="room-id">${r.id}</span></div>
      </div>
      <div class="room-players-count">${r.players} / ${r.maxPlayers}</div>
    `;

    item.onclick = () => {
      const name = window.currentPlayerName;
      socket.emit('join_room', {
        playerName: name,
        roomId: r.id
      });
    };

    container.appendChild(item);
  });
}

// =====================================================================
// LOBBY RENDER
// =====================================================================

function renderLobby(room) {
  document.getElementById('lobby-room-id').textContent = room.id;
  console.log(`[Lobby] Joined room: ${room.id}`);

  const grid = document.getElementById('lobby-players');
  grid.innerHTML = '';

  const colorNames = ['Red', 'Blue', 'Green', 'Yellow'];
  const colorHex = ['#ff3333', '#3366ff', '#22cc66', '#ffcc00'];

  const max = room.maxPlayers || 4;

  for (let i = 0; i < max; i++) {
    const player = room.players[i];
    const isBot = player && player.type === 'bot';

    const slot = document.createElement('div');
    slot.className =
      `player-slot${player ? ' occupied' : ''}${isBot ? ' bot-slot' : ''}`;

    slot.innerHTML = `
      <div class="slot-color" style="background:${colorHex[i]}"></div>
      <div class="slot-name">${player ? (isBot ? '🤖 ' : '') + player.name : '—'}</div>
      <div class="slot-status">${player ? colorNames[i] : 'Waiting...'}</div>
    `;

    grid.appendChild(slot);
  }

  const count = room.players.length;

  document.getElementById('lobby-status').textContent =
    count < 2 ? `Need ${2 - count} more player(s)` :
    count < 4 ? `${count} players — Host can start` :
    'Room full — Starting soon!';
}

// =====================================================================
// GAME UI RENDER
// =====================================================================

function renderGameUI() {
  if (!gameState) return;

  const panels = document.getElementById('player-panels');
  panels.innerHTML = '';

  gameState.players.forEach(p => {
    const isBot = p.type === 'bot';

    const nameLabel =
      (isBot ? '🤖 ' : '') +
      p.name +
      (p.color === myColor ? ' (You)' : '');

    const div = document.createElement('div');

    div.className =
      `player-panel${gameState.currentTurn === p.color ? ' active-turn' : ''}`;

    const homeCount =
      gameState.tokens[p.color].filter(t => t.position === 200).length;

    const onBoard =
      gameState.tokens[p.color].filter(
        t => t.position >= 0 && t.position !== 200
      ).length;

    div.innerHTML = `
      <div class="panel-color color-${p.color}"></div>
      <div class="panel-info">
        <div class="panel-name">${nameLabel}</div>
        <div class="panel-tokens">🏠${homeCount} 🎯${onBoard}</div>
      </div>
      ${p.finished ? '<div class="panel-badge">#' + p.rank + '</div>' : ''}
      ${gameState.currentTurn === p.color ? '<div class="panel-badge">TURN</div>' : ''}
    `;

    panels.appendChild(div);
  });

  const cp = gameState.players.find(
    p => p.color === gameState.currentTurn
  );

  const cpBot = cp && cp.type === 'bot';

  const turnText = cp
    ? `${cpBot ? '🤖 ' : ''}${cp.name}${cp.color === myColor ? ' (You)' : ''}'s Turn`
    : '...';

  const turnEl = document.getElementById('turn-text');
  turnEl.textContent = turnText;
  turnEl.style.color = COLOR_LIGHT[gameState.currentTurn] || '#fff';

  updateRollButton();

  document.getElementById('game-info-content').innerHTML = `
    <div style="margin-bottom:6px">Move #${gameState.moveCount || 0}</div>
    ${gameState.rankings.map(r =>
      `<div style="font-size:11px;color:var(--c-muted)">#${r.rank} ${r.name}</div>`
    ).join('')}
  `;

  const diceEl = document.getElementById('dice');
  const faces = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];

  if (gameState.diceValue) {
    diceEl.textContent = faces[gameState.diceValue] || gameState.diceValue;
  } else {
    diceEl.textContent = '🎲';
  }

  renderPowerButtons();
}

function renderPowerButtons() {
  const panel = document.getElementById('power-panel');
  if (!panel || !gameState || !myColor) return;

  const isMyTurn = gameState.currentTurn === myColor;
  const used = gameState.powersUsed?.[myColor] || {};

  panel.querySelectorAll('[data-power]').forEach(btn => {
    const power = btn.dataset.power;
    const isUsed = !!used[power];
    let canUse = isMyTurn && !isUsed;

    if (['dice', 'speed', 'double'].includes(power)) {
      canUse = canUse && !!gameState.diceRolled &&
        Array.isArray(gameState.validMoves) && gameState.validMoves.length > 0;
    }

    btn.disabled = !canUse;
    btn.classList.toggle('used', isUsed);
    btn.classList.toggle('selected', selectedPower === power);

    const label = btn.querySelector('span:not(.power-icon)');
    if (label) {
      const labels = {
        dice: 'Dice', speed: 'Speed +3', shield: 'Shield',
        double: 'Double', attack: 'Attack'
      };
      label.textContent = isUsed ? `${labels[power]} ✓` : labels[power];
    }
  });

  updatePowerHint();
}

function updatePowerHint() {
  const hint = document.getElementById('power-hint');
  if (!hint) return;

  const messages = {
    shield: '🛡️ Хамгаалах өөрийн хүүг самбар дээр дарна уу. (Esc — болих)',
    attack: '💥 Довтлох өрсөлдөгчийн хүүг самбар дээр дарна уу. (Esc — болих)'
  };

  hint.textContent = selectedPower
    ? messages[selectedPower]
    : 'Power бүрийг нэг тоглолтод нэг удаа ашиглана.';
}

function updateRollButton() {
  const btn = document.getElementById('btn-roll');

  const isMyTurn = gameState && gameState.currentTurn === myColor;
  const canRoll = isMyTurn && !gameState.diceRolled;

  btn.disabled = !canRoll;

  btn.textContent = !isMyTurn
    ? "Waiting..."
    : gameState.diceRolled
      ? "Select Token"
      : "Roll Dice";
}

// =====================================================================
// TIMER BAR
// =====================================================================

let timerInterval = null;
let timerStart = null;

const TIMER_DURATION = 25000;

function startTimerBar() {
  clearInterval(timerInterval);

  timerStart = Date.now();

  const bar = document.getElementById('timer-bar');

  bar.style.transition = 'none';
  bar.style.width = '100%';

  setTimeout(() => {
    bar.style.transition = `width ${TIMER_DURATION}ms linear`;
    bar.style.width = '0%';
  }, 50);
}// =====================================================================
// BOARD CLICK
// =====================================================================

function onBoardClick(e) {
  if (!gameState || gameState.currentTurn !== myColor) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  // SHIELD: choose one of your own tokens on the main track.
  if (selectedPower === 'shield') {
    const ownTokens = gameState.tokens?.[myColor] || [];
    for (let i = 0; i < ownTokens.length; i++) {
      const token = ownTokens[i];
      if (token.position < 0 || token.position > 51) continue;

      const pos = getTokenCanvasPos(myColor, token.position, i);
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < C * 0.8) {
        socket.emit('use_power', { power: 'shield', tokenIndex: i });
        return;
      }
    }
    showToast('Самбар дээр байгаа өөрийн хүүг сонгоно уу.', 'error');
    return;
  }

  // ATTACK: choose an opponent token on the main track.
  if (selectedPower === 'attack') {
    for (const color of COLORS) {
      if (color === myColor) continue;
      const enemyTokens = gameState.tokens?.[color] || [];

      for (let i = 0; i < enemyTokens.length; i++) {
        const token = enemyTokens[i];
        if (token.position < 0 || token.position > 51) continue;

        const pos = getTokenCanvasPos(color, token.position, i);
        const dx = mx - pos.x;
        const dy = my - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) < C * 0.8) {
          socket.emit('use_power', {
            power: 'attack',
            targetColor: color,
            targetTokenIndex: i
          });
          return;
        }
      }
    }
    showToast('Довтлох боломжтой өрсөлдөгчийн хүүг сонгоно уу.', 'error');
    return;
  }

  // NORMAL TOKEN MOVE
  if (!gameState.diceRolled) return;
  if (!gameState.validMoves || gameState.validMoves.length === 0) return;

  const tokens = gameState.tokens[myColor];
  for (const move of gameState.validMoves) {
    const token = tokens[move.tokenIndex];
    const pos = getTokenCanvasPos(myColor, token.position, move.tokenIndex);
    const dx = mx - pos.x;
    const dy = my - pos.y;

    if (Math.sqrt(dx * dx + dy * dy) < C * 0.7) {
      socket.emit('move_token', { tokenIndex: move.tokenIndex });
      return;
    }
  }
}

// =====================================================================
// BOARD RENDERING
// =====================================================================

function drawBoard(gs) {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  drawBoardBase();
  drawTrack();

  if (gs) drawTokens(gs);

  if (gs && gs.validMoves && gs.currentTurn === myColor && gs.diceRolled) {
    highlightValidMoves(gs);
  }
}

function drawBoardBase() {
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // Four colored quadrants
  const bases = [
    { color: '#e83b3b', x: 0, y: 9 * C, label: 'RED' },
    { color: '#2ec060', x: 0, y: 0, label: 'GREEN' },
    { color: '#e8c03b', x: 9 * C, y: 0, label: 'YELLOW' },
    { color: '#3b6ae8', x: 9 * C, y: 9 * C, label: 'BLUE' }
  ];

  bases.forEach(b => {
    ctx.fillStyle = b.color + '22';
    ctx.fillRect(b.x, b.y, 6 * C, 6 * C);

    ctx.strokeStyle = b.color + '88';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, 6 * C - 2, 6 * C - 2);

    const cx = b.x + 3 * C;
    const cy = b.y + 3 * C;

    ctx.fillStyle = b.color + '33';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2 * C, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = b.color + '66';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Token placeholders
    const offset = C * 1.25;
    const slotRadius = C * 0.38;

    for (let i = 0; i < 4; i++) {
      const bx = [-offset, offset, -offset, offset][i];
      const by = [-offset, -offset, offset, offset][i];

      ctx.beginPath();
      ctx.arc(cx + bx, cy + by, slotRadius + 2, 0, Math.PI * 2);
      ctx.fillStyle = b.color + '44';
      ctx.fill();

      ctx.strokeStyle = '#ffffff60';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Track cells with clearly visible square borders
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      if (isTrackCell(col, row)) {
        ctx.fillStyle = '#292943';
        ctx.fillRect(col * C, row * C, C, C);

        // Main grid border
        ctx.strokeStyle = 'rgba(190, 200, 255, 0.42)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(col * C, row * C, C, C);

        // Inner highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(
          col * C + 1,
          row * C + 1,
          C - 2,
          C - 2
        );
      }
    }
  }

  // Home column coloring
  HOME_COLS.red.forEach(([c, r]) => {
    ctx.fillStyle = '#e83b3b55';
    ctx.fillRect(c * C, r * C, C, C);
  });

  HOME_COLS.blue.forEach(([c, r]) => {
    ctx.fillStyle = '#3b6ae855';
    ctx.fillRect(c * C, r * C, C, C);
  });

  HOME_COLS.green.forEach(([c, r]) => {
    ctx.fillStyle = '#2ec06055';
    ctx.fillRect(c * C, r * C, C, C);
  });

  HOME_COLS.yellow.forEach(([c, r]) => {
    ctx.fillStyle = '#e8c03b55';
    ctx.fillRect(c * C, r * C, C, C);
  });

  // Safe cell stars
  TRACK_CELLS.forEach(([c, r], idx) => {
    if (SAFE_INDICES.has(idx)) {
      ctx.fillStyle = '#ffffff20';
      ctx.fillRect(c * C, r * C, C, C);
      drawStar(c * C + C / 2, r * C + C / 2, C * 0.3, '#ffffff55');
    }
  });

  // Starting cells
  const startCells = [
    { idx: 0, color: '#e83b3b' },
    { idx: 13, color: '#2ec060' },
    { idx: 26, color: '#e8c03b' },
    { idx: 39, color: '#3b6ae8' }
  ];

  startCells.forEach(sc => {
    const [c, r] = TRACK_CELLS[sc.idx];

    ctx.fillStyle = sc.color + '80';
    ctx.fillRect(c * C + 1, r * C + 1, C - 2, C - 2);
  });

  drawCenterHome();
}

// =====================================================================
// CENTER HOME
// =====================================================================

function drawCenterHome() {
  const cx = 7.5 * C;
  const cy = 7.5 * C;
  const s = 1.4 * C;

  const triangles = [
    {
      color: '#e83b3b',
      points: [[cx - s, cy + s], [cx + s, cy + s], [cx, cy]]
    },
    {
      color: '#3b6ae8',
      points: [[cx + s, cy - s], [cx + s, cy + s], [cx, cy]]
    },
    {
      color: '#e8c03b',
      points: [[cx - s, cy - s], [cx + s, cy - s], [cx, cy]]
    },
    {
      color: '#2ec060',
      points: [[cx - s, cy - s], [cx - s, cy + s], [cx, cy]]
    }
  ];

  triangles.forEach(tri => {
    ctx.beginPath();
    ctx.moveTo(...tri.points[0]);

    tri.points.slice(1).forEach(p => {
      ctx.lineTo(...p);
    });

    ctx.closePath();
    ctx.fillStyle = tri.color + 'cc';
    ctx.fill();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, C * 0.3, 0, Math.PI * 2);

  ctx.fillStyle = '#0d0d1a';
  ctx.fill();

  ctx.strokeStyle = '#f0c040';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawStar(cx, cy, C * 0.22, '#f0c040');
}

// =====================================================================
// TRACK
// =====================================================================

function drawTrack() {
  ctx.strokeStyle = '#2e2e52';
  ctx.lineWidth = 0.5;
}

function isTrackCell(col, row) {
  if (col >= 6 && col <= 8 && row >= 0 && row <= 14) {
    return true;
  }

  if (row >= 6 && row <= 8 && col >= 0 && col <= 14) {
    return true;
  }

  return false;
}

// =====================================================================
// STAR
// =====================================================================

function drawStar(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();

  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
    const ai = ((i * 4 + 2) * Math.PI / 5) - Math.PI / 2;

    if (i === 0) {
      ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
    } else {
      ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }

    ctx.lineTo(
      x + r * 0.4 * Math.cos(ai),
      y + r * 0.4 * Math.sin(ai)
    );
  }

  ctx.closePath();
  ctx.fill();
}

// =====================================================================
// TOKEN POSITION
// =====================================================================

function getTokenCanvasPos(color, position, tokenIndex) {
  if (position === -1) {
    const offset = C * 1.25;

    const bx = [-offset, offset, -offset, offset][tokenIndex];
    const by = [-offset, -offset, offset, offset][tokenIndex];

    const cx =
      color === 'red' || color === 'green' ? 3 : 12;

    const cy =
      color === 'red' || color === 'blue' ? 12 : 3;

    return {
      x: cx * C + bx,
      y: cy * C + by
    };
  }

  if (position === 200) {
    const cx = 7.5 * C;
    const cy = 7.5 * C;

    const offsets = [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3]
    ];

    return {
      x: cx + offsets[tokenIndex][0] * C,
      y: cy + offsets[tokenIndex][1] * C
    };
  }

  if (position >= 100 && position < 200) {
    const step = position - 100;
    const hcells = HOME_COLS[color];

    if (step < hcells.length) {
      const [c, r] = hcells[step];

      return {
        x: (c + 0.5) * C,
        y: (r + 0.5) * C
      };
    }
  }

  if (position >= 0 && position < TRACK_CELLS.length) {
    const [c, r] = TRACK_CELLS[position];

    return {
      x: (c + 0.5) * C,
      y: (r + 0.5) * C
    };
  }

  return { x: 0, y: 0 };
}// ==========================================
// 4. TOKENS — 3D PAWN STYLE
// ==========================================

function drawTokens(gs) {
  COLORS.forEach(color => {
    gs.tokens[color].forEach((token, idx) => {
      if (token.position === -99) return;

      const pos = getTokenCanvasPos(color, token.position, idx);
      const size = C * 0.38;
      drawPawnToken(color, pos.x, pos.y, size, idx + 1);

      const shielded = gs.shieldedTokens?.[color] || [];
      if (Array.isArray(shielded) && shielded.includes(idx)) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - size * 0.25, size * 1.05, 0, Math.PI * 2);
        ctx.strokeStyle = '#65d9ff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#65d9ff';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }
    });
  });
}

function drawPawnToken(color, x, y, size, number) {
  const light = COLOR_LIGHT[color];
  const base = COLOR_MAP[color];

  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.72, size * 0.82, size * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pawn body
  const body = ctx.createLinearGradient(-size, 0, size, 0);
  body.addColorStop(0, base);
  body.addColorStop(0.35, light);
  body.addColorStop(0.65, base);
  body.addColorStop(1, "#222");

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-size * 0.62, size * 0.55);
  ctx.bezierCurveTo(
    -size * 0.55, size * 0.12,
    -size * 0.28, -size * 0.08,
    -size * 0.28, -size * 0.42
  );
  ctx.lineTo(size * 0.28, -size * 0.42);
  ctx.bezierCurveTo(
    size * 0.28, -size * 0.08,
    size * 0.55, size * 0.12,
    size * 0.62, size * 0.55
  );
  ctx.closePath();
  ctx.fill();

  // Body outline
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Neck ring
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.38, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  const head = ctx.createRadialGradient(
    -size * 0.25, -size * 0.82, size * 0.05,
    0, -size * 0.72, size * 0.58
  );
  head.addColorStop(0, "#ffffff");
  head.addColorStop(0.18, light);
  head.addColorStop(0.7, base);
  head.addColorStop(1, "#222");

  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(0, -size * 0.75, size * 0.48, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(
    -size * 0.18,
    -size * 0.91,
    size * 0.12,
    size * 0.2,
    -0.5,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Number
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.max(9, size * 0.65)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3;
  ctx.fillText(String(number), 0, size * 0.28);

  ctx.restore();
}


// ==========================================
// 5. TOKEN ANIMATION
// ==========================================

async function animateJumpPath(color, tokenIdx, path) {
  if (!path || path.length === 0) return;

  for (const position of path) {
    animateStep(color, tokenIdx, position);
    await new Promise(resolve => setTimeout(resolve, 120));
  }
}

function animateStep(color, tokenIdx, targetPosition) {
  if (!gameState) return;

  const tempTokens = JSON.parse(JSON.stringify(gameState.tokens));
  tempTokens[color][tokenIdx].position = -99;

  drawBoard({
    ...gameState,
    tokens: tempTokens
  });

  const target = getTokenCanvasPos(color, targetPosition, tokenIdx);

  drawPawnToken(
    color,
    target.x,
    target.y,
    C * 0.38,
    tokenIdx + 1
  );

  gameState.tokens[color][tokenIdx].position = targetPosition;
}

function drawSingleToken(color, tokenIdx, position) {
  if (position === -99) return;

  const pos = getTokenCanvasPos(color, position, tokenIdx);

  drawPawnToken(
    color,
    pos.x,
    pos.y,
    C * 0.38,
    tokenIdx + 1
  );
}


// ==========================================
// 6. SCREEN MANAGEMENT
// ==========================================

function showScreen(screenName) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(`screen-${screenName}`);
  if (target) target.classList.add("active");
}


// ==========================================
// 7. VALID MOVE HIGHLIGHT
// ==========================================

function highlightValidMoves(moves) {
  if (!moves) return;

  moves.forEach(move => {
    const pos = getTokenCanvasPos(
      move.color,
      move.position,
      move.tokenIdx
    );

    ctx.save();
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, C * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
}


// ==========================================
// 8. DICE ANIMATION
// ==========================================

function animateDice(value) {
  const dice = document.getElementById("dice");
  if (!dice) return;

  dice.classList.add("rolling");

  setTimeout(() => {
    dice.textContent = value;
    dice.classList.remove("rolling");
  }, 500);
}


// ==========================================
// 9. CHAT AND LOG
// ==========================================

function addChatMessage(message) {
  const chat = document.getElementById("chatMessages");
  if (!chat) return;

  const item = document.createElement("div");
  item.className = "chat-message";
  item.textContent = message;

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
}

function addLogEntry(message) {
  const log = document.getElementById("gameLog");
  if (!log) return;

  const item = document.createElement("div");
  item.className = "log-entry";
  item.textContent = message;

  log.prepend(item);
}


// ==========================================
// 10. WINNER SCREEN
// ==========================================

function showWinnerScreen(winner) {
  const screen = document.getElementById("winnerScreen");
  if (!screen) return;

  const name = document.getElementById("winnerName");
  if (name) name.textContent = winner;

  screen.classList.add("active");
}


// ==========================================
// 11. EMOJI AND TOAST
// ==========================================

function showFloatingEmoji(emoji, x, y) {
  const el = document.createElement("div");

  el.textContent = emoji;
  el.style.position = "fixed";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.fontSize = "32px";
  el.style.pointerEvents = "none";
  el.style.zIndex = "9999";
  el.className = "floating-emoji";

  document.body.appendChild(el);

  setTimeout(() => el.remove(), 1500);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


// ==========================================
// 12. HELPERS
// ==========================================

function capColor(color) {
  if (!color) return "";
  return color.charAt(0).toUpperCase() + color.slice(1);
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
