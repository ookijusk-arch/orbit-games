const $ = (selector) => document.querySelector(selector);
const dialog = $('#gameDialog');
const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = $('#gameOverlay');
const title = $('#gameTitle');
const type = $('#gameType');
const scoreEl = $('#score');
const bestEl = $('#best');
const levelEl = $('#level');
const startButton = $('#startGame');
const controls = $('#gameControls');
const memoryBoard = $('#memoryBoard');
const toast = $('#toast');

let activeGame = null;
let frame = null;
let cleanup = () => {};
let soundOn = false;
let audioContext = null;

const games = {
  neon: {
    title: 'Neon Dodge', type: 'ARCADE • 1 PLAYER', best: 'orbit-neon-best',
    intro: ['Catch the glow.', 'Move with <kbd>←</kbd> <kbd>→</kbd> or your mouse. You have three shield hits.'],
    controls: '<span><kbd>←</kbd><kbd>→</kbd> move</span><span>Three shield hits</span>'
  },
  breaker: {
    title: 'Brick Bloom', type: 'CLASSIC • 3 LEVELS', best: 'orbit-breaker-best',
    intro: ['Clear all three blooms.', 'Move with <kbd>←</kbd> <kbd>→</kbd> or your mouse. Every level adds more bricks.'],
    controls: '<span><kbd>←</kbd><kbd>→</kbd> move</span><span>Three bloom boards</span>'
  },
  memory: {
    title: 'Pixel Pairs', type: 'PUZZLE • 3 LEVELS', best: 'orbit-memory-best',
    intro: ['Find every pair.', 'Tap two tiles to reveal them. Each level adds more symbols.'],
    controls: '<span>Tap cards to flip</span><span>Three puzzle sets</span>'
  },
  comet: {
    title: 'Comet Catch', type: 'ARCADE • 3 LEVELS', best: 'orbit-comet-best',
    intro: ['Make a wish.', 'Slide the catcher with <kbd>←</kbd> <kbd>→</kbd> or your mouse. Collect the glowing comets.'],
    controls: '<span><kbd>←</kbd><kbd>→</kbd> move</span><span>Catch every comet</span>'
  },
  pulse: {
    title: 'Pulse Garden', type: 'REACTION • 30 SECONDS', best: 'orbit-pulse-best',
    intro: ['Grow the garden.', 'Tap each blooming pulse before it fades. Keep your streak alive for bonus points.'],
    controls: '<span>Click or tap the pulses</span><span>30-second rhythm round</span>'
  },
  mail: {
    title: 'Moon Mail', type: 'ARCADE • 3 LEVELS', best: 'orbit-mail-best',
    intro: ['Special delivery.', 'Switch lanes with <kbd>←</kbd> <kbd>→</kbd> or your mouse. Catch letters, dodge satellites.'],
    controls: '<span><kbd>←</kbd><kbd>→</kbd> switch lanes</span><span>Three deliveries to the moon</span>'
  }
};

function storedBest(key) {
  try { return Number(localStorage.getItem(games[key].best) || 0); }
  catch { return 0; }
}

function saveBest(key, score) {
  try { localStorage.setItem(games[key].best, score); }
  catch {}
}

function setScore(value) { scoreEl.textContent = String(Math.max(0, Math.floor(value))).padStart(4, '0'); }
function setBest(key) { bestEl.textContent = String(storedBest(key)).padStart(4, '0'); }
function setLevel(value) { levelEl.textContent = String(value).padStart(2, '0'); }

function playTone(frequency = 440, duration = 0.06) {
  if (!soundOn) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.055, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {}
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2300);
}

function sizeCanvas() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { w: rect.width, h: rect.height };
}

function paintGrid(w, h, shade = '#242c4c') {
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#a8b2ec1f';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 38) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 38) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function paintStars(w, h, shade = '#172038') {
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffffaa';
  for (let i = 0; i < 72; i += 1) {
    const x = (i * 71) % w;
    const y = (i * 43) % h;
    ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
  }
}

function finishGame(key, score, message) {
  cancelAnimationFrame(frame);
  frame = null;
  cleanup();
  cleanup = () => {};
  const best = storedBest(key);
  if (score > best) {
    saveBest(key, score);
    setBest(key);
    message += ' New personal best!';
  }
  overlay.querySelector('#overlayLabel').textContent = score > best ? 'NEW BEST' : 'ROUND COMPLETE';
  overlay.querySelector('#overlayTitle').textContent = message;
  overlay.querySelector('#overlayHelp').innerHTML = `Score: <strong>${Math.floor(score)}</strong>`;
  startButton.textContent = 'Play again →';
  overlay.hidden = false;
  playTone(190, 0.13);
}

function closeRunningGame() {
  cancelAnimationFrame(frame);
  frame = null;
  cleanup();
  cleanup = () => {};
}

function openGame(key) {
  closeRunningGame();
  activeGame = key;
  const details = games[key];
  title.textContent = details.title;
  type.textContent = details.type;
  setScore(0);
  setBest(key);
  setLevel(1);
  controls.innerHTML = details.controls;
  overlay.querySelector('#overlayLabel').textContent = 'READY?';
  overlay.querySelector('#overlayTitle').textContent = details.intro[0];
  overlay.querySelector('#overlayHelp').innerHTML = details.intro[1];
  startButton.textContent = 'Start game →';
  overlay.hidden = false;
  memoryBoard.hidden = key !== 'memory';
  canvas.style.display = key === 'memory' ? 'none' : 'block';
  if (!dialog.open) dialog.showModal();
  if (key !== 'memory') paintIdle(key);
}

function paintIdle(key) {
  const { w, h } = sizeCanvas();
  if (key === 'comet' || key === 'mail') paintStars(w, h);
  else paintGrid(w, h, key === 'pulse' ? '#254c48' : '#242c4c');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d9ff45';
  ctx.font = '600 13px DM Mono';
  ctx.fillText(key === 'pulse' ? 'TAP WHEN THE GARDEN BLOOMS' : 'PRESS START WHEN READY', w / 2, h / 2);
}

function addMoveControls(onMove) {
  const keys = {};
  const keyChange = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      keys[event.key] = event.type === 'keydown';
    }
  };
  const pointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    onMove(event.clientX - rect.left, keys);
  };
  addEventListener('keydown', keyChange);
  addEventListener('keyup', keyChange);
  canvas.addEventListener('pointermove', pointer);
  return {
    keys,
    remove: () => {
      removeEventListener('keydown', keyChange);
      removeEventListener('keyup', keyChange);
      canvas.removeEventListener('pointermove', pointer);
    }
  };
}

function startNeon() {
  overlay.hidden = true;
  const { w, h } = sizeCanvas();
  const player = { x: w / 2, y: h - 46, width: 47 };
  const shards = [];
  let pointerX = player.x;
  let hits = 3;
  let invincibleUntil = 0;
  const started = performance.now();
  let last = started;
  const input = addMoveControls((x) => { pointerX = x; });
  cleanup = input.remove;

  const loop = (now) => {
    const dt = Math.min(32, now - last) / 16;
    last = now;
    const seconds = (now - started) / 1000;
    const score = seconds * 100;
    if (input.keys.ArrowLeft) player.x -= 7 * dt;
    if (input.keys.ArrowRight) player.x += 7 * dt;
    player.x += (pointerX - player.x) * 0.09;
    player.x = Math.max(player.width / 2 + 6, Math.min(w - player.width / 2 - 6, player.x));
    if (Math.random() < Math.min(0.025 + seconds * 0.00075, 0.052)) {
      shards.push({ x: Math.random() * w, y: -22, r: 8 + Math.random() * 8, speed: 1.9 + Math.random() * 2.1 + seconds * 0.035, spin: Math.random() * 6 });
    }
    shards.forEach((shard) => { shard.y += shard.speed * dt; shard.spin += 0.08 * dt; });
    for (const shard of shards) {
      if (now > invincibleUntil && Math.abs(shard.x - player.x) < shard.r + 20 && Math.abs(shard.y - player.y) < shard.r + 18) {
        shard.y = h + 40;
        hits -= 1;
        invincibleUntil = now + 850;
        playTone(220, 0.09);
        if (hits === 0) { setScore(score); finishGame('neon', score, 'Your shield ran out.'); return; }
      }
    }
    while (shards.length && shards[0].y > h + 35) shards.shift();
    paintGrid(w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 11px DM Mono';
    ctx.textAlign = 'left';
    ctx.fillText(`SHIELD ${'●'.repeat(hits)}${'○'.repeat(3 - hits)}`, 18, 28);
    ctx.fillStyle = now < invincibleUntil && Math.floor(now / 90) % 2 ? '#ffffff' : '#d9ff45';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(player.x, player.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillRect(player.x - player.width / 2, player.y + 18, player.width, 5);
    for (const shard of shards) {
      ctx.save(); ctx.translate(shard.x, shard.y); ctx.rotate(shard.spin);
      ctx.fillStyle = '#ff7474'; ctx.shadowColor = '#ff7474'; ctx.shadowBlur = 12;
      ctx.fillRect(-shard.r, -shard.r, shard.r * 2, shard.r * 2); ctx.restore();
    }
    setScore(score);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function startBreaker() {
  overlay.hidden = true;
  const { w, h } = sizeCanvas();
  const configs = [{ rows: 3, cols: 5, speed: 3.0 }, { rows: 4, cols: 6, speed: 3.55 }, { rows: 5, cols: 7, speed: 4.15 }];
  let level = 1;
  let score = 0;
  let paddle = w / 2;
  let pointerX = paddle;
  let bannerUntil = 0;
  let last = performance.now();
  const input = addMoveControls((x) => { pointerX = x; });
  cleanup = input.remove;
  let ball;
  let bricks;
  const resetLevel = () => {
    const config = configs[level - 1];
    const brickWidth = (w - 58) / config.cols;
    bricks = [];
    for (let row = 0; row < config.rows; row += 1) {
      for (let column = 0; column < config.cols; column += 1) {
        bricks.push({ x: 29 + column * brickWidth, y: 54 + row * 35, w: brickWidth - 7, h: 23, live: true, color: ['#ff7474', '#d9ff45', '#8d7aff', '#4fb9ae', '#ffb86b'][row] });
      }
    }
    ball = { x: w / 2, y: h - 76, vx: config.speed, vy: -config.speed, r: 8 };
    setLevel(level);
  };
  resetLevel();
  const draw = () => {
    paintGrid(w, h);
    for (const brick of bricks) if (brick.live) { ctx.fillStyle = brick.color; ctx.fillRect(brick.x, brick.y, brick.w, brick.h); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(paddle - 46, h - 30, 92, 8);
    ctx.beginPath(); ctx.fillStyle = '#d9ff45'; ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
  };
  const loop = (now) => {
    const dt = Math.min(30, now - last) / 16;
    last = now;
    if (now < bannerUntil) {
      draw(); ctx.fillStyle = '#ffffff'; ctx.font = '700 26px Outfit'; ctx.textAlign = 'center'; ctx.fillText(`LEVEL ${level}`, w / 2, h / 2); frame = requestAnimationFrame(loop); return;
    }
    if (input.keys.ArrowLeft) paddle -= 8 * dt;
    if (input.keys.ArrowRight) paddle += 8 * dt;
    paddle += (pointerX - paddle) * 0.1;
    paddle = Math.max(48, Math.min(w - 48, paddle));
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < ball.r || ball.x > w - ball.r) { ball.vx *= -1; playTone(310); }
    if (ball.y < ball.r) { ball.vy *= -1; playTone(310); }
    if (ball.y > h + 20) { setScore(score); finishGame('breaker', score, 'The bloom got away.'); return; }
    if (ball.y > h - 48 && ball.y < h - 26 && Math.abs(ball.x - paddle) < 54 && ball.vy > 0) {
      ball.vy = -Math.abs(ball.vy); ball.vx += (ball.x - paddle) / 36; playTone(430);
    }
    for (const brick of bricks) {
      if (brick.live && ball.x + ball.r > brick.x && ball.x - ball.r < brick.x + brick.w && ball.y + ball.r > brick.y && ball.y - ball.r < brick.y + brick.h) {
        brick.live = false; ball.vy *= -1; score += 100; playTone(640, 0.04); break;
      }
    }
    draw(); setScore(score);
    if (!bricks.some((brick) => brick.live)) {
      if (level === configs.length) { finishGame('breaker', score, 'Every bloom cleared!'); return; }
      level += 1; resetLevel(); bannerUntil = now + 900; showToast(`Brick Bloom — level ${level}`);
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function startMemory() {
  overlay.hidden = true;
  memoryBoard.hidden = false;
  const pairCounts = [3, 5, 8];
  const icons = ['✦', '●', '◆', '☻', '☾', '♥', '☁', '✿'];
  let level = 1;
  let score = 0;
  let locked = false;
  cleanup = () => { locked = true; };
  const loadLevel = () => {
    const selected = icons.slice(0, pairCounts[level - 1]);
    const tiles = [...selected, ...selected].sort(() => Math.random() - 0.5);
    let open = [];
    let matched = 0;
    let moves = 0;
    locked = false;
    setLevel(level);
    memoryBoard.innerHTML = '';
    tiles.forEach((icon) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'memory-card';
      card.setAttribute('aria-label', 'Flip card');
      card.innerHTML = `<div><span class="front">?</span><span class="back">${icon}</span></div>`;
      card.addEventListener('click', () => {
        if (locked || open.length === 2 || card.classList.contains('flipped') || card.classList.contains('matched')) return;
        card.classList.add('flipped');
        open.push({ card, icon });
        playTone(430, 0.035);
        if (open.length !== 2) return;
        moves += 1;
        if (open[0].icon === open[1].icon) {
          open.forEach((item) => item.card.classList.add('matched'));
          score += Math.max(35, 165 - moves * 12);
          setScore(score);
          matched += 1;
          open = [];
          playTone(730, 0.08);
          if (matched === selected.length) {
            locked = true;
            if (level === pairCounts.length) { setTimeout(() => finishGame('memory', score, 'Every pair found!'), 450); return; }
            setTimeout(() => { level += 1; showToast(`Pixel Pairs — level ${level}`); loadLevel(); }, 500);
          }
        } else {
          locked = true;
          setTimeout(() => { open.forEach((item) => item.card.classList.remove('flipped')); open = []; locked = false; }, 650);
        }
      });
      memoryBoard.append(card);
    });
  };
  loadLevel();
}

function startComet() {
  overlay.hidden = true;
  const { w, h } = sizeCanvas();
  const targets = [7, 10, 14];
  let level = 1;
  let score = 0;
  let collected = 0;
  let basketX = w / 2;
  let pointerX = basketX;
  let last = performance.now();
  let bannerUntil = last + 700;
  const comets = [];
  const input = addMoveControls((x) => { pointerX = x; });
  cleanup = input.remove;
  setLevel(level);
  const loop = (now) => {
    const dt = Math.min(32, now - last) / 16;
    last = now;
    if (input.keys.ArrowLeft) basketX -= 7 * dt;
    if (input.keys.ArrowRight) basketX += 7 * dt;
    basketX += (pointerX - basketX) * 0.09;
    basketX = Math.max(48, Math.min(w - 48, basketX));
    if (now > bannerUntil && Math.random() < 0.026 + level * 0.008) {
      comets.push({ x: 25 + Math.random() * (w - 50), y: -22, speed: 2.1 + Math.random() * 1.4 + level * 0.5, r: 9 + Math.random() * 6, hue: Math.random() > 0.5 ? '#d9ff45' : '#ffb86b' });
    }
    comets.forEach((comet) => { comet.y += comet.speed * dt; });
    for (const comet of comets) {
      if (Math.abs(comet.x - basketX) < 51 && comet.y > h - 79 && comet.y < h - 37) {
        comet.y = h + 50;
        collected += 1; score += 100 + level * 25; setScore(score); playTone(720, 0.06);
        if (collected >= targets[level - 1]) {
          if (level === targets.length) { finishGame('comet', score, 'The night sky is yours!'); return; }
          level += 1; collected = 0; setLevel(level); bannerUntil = now + 900; showToast(`Comet Catch — level ${level}`);
        }
      }
    }
    while (comets.length && comets[0].y > h + 40) comets.shift();
    paintStars(w, h);
    for (const comet of comets) {
      ctx.fillStyle = comet.hue; ctx.shadowColor = comet.hue; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(comet.x, comet.y, comet.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = comet.hue; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(comet.x - comet.r * 3, comet.y - comet.r * 3); ctx.lineTo(comet.x - 3, comet.y - 3); ctx.stroke();
    }
    ctx.strokeStyle = '#d9ff45'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(basketX, h - 57, 38, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '500 11px DM Mono'; ctx.textAlign = 'left'; ctx.fillText(`CATCH ${collected}/${targets[level - 1]}`, 18, 28);
    if (now < bannerUntil) { ctx.fillStyle = '#ffffff'; ctx.font = '700 25px Outfit'; ctx.textAlign = 'center'; ctx.fillText(`LEVEL ${level}`, w / 2, h / 2); }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function startPulse() {
  overlay.hidden = true;
  const { w, h } = sizeCanvas();
  let score = 0;
  let streak = 0;
  const started = performance.now();
  let target;
  const spawn = (now) => {
    const colors = ['#d9ff45', '#ff7474', '#b7a8ff', '#ffb86b', '#69d5c5'];
    target = { x: 45 + Math.random() * (w - 90), y: 55 + Math.random() * (h - 120), r: 27 + Math.random() * 13, color: colors[Math.floor(Math.random() * colors.length)], born: now, expires: now + 1050 };
  };
  spawn(started);
  const tap = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (Math.hypot(x - target.x, y - target.y) <= target.r) {
      streak += 1; score += 50 + streak * 8; setScore(score); playTone(460 + streak * 10, 0.04); spawn(performance.now());
    } else { streak = 0; playTone(180, 0.04); }
  };
  canvas.addEventListener('pointerdown', tap);
  cleanup = () => canvas.removeEventListener('pointerdown', tap);
  const loop = (now) => {
    const remaining = Math.max(0, 30 - (now - started) / 1000);
    if (remaining === 0) { finishGame('pulse', score, streak > 8 ? 'What a rhythm!' : 'Garden time is over.'); return; }
    if (now >= target.expires) { streak = 0; spawn(now); }
    paintGrid(w, h, '#254c48');
    const progress = Math.min(1, (now - target.born) / (target.expires - target.born));
    ctx.strokeStyle = `${target.color}77`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(target.x, target.y, target.r + progress * 35, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = target.color; ctx.shadowColor = target.color; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#172038'; ctx.font = '700 20px Outfit'; ctx.textAlign = 'center'; ctx.fillText('✦', target.x, target.y + 7);
    ctx.fillStyle = '#ffffff'; ctx.font = '500 11px DM Mono'; ctx.textAlign = 'left'; ctx.fillText(`TIME ${remaining.toFixed(1)}s`, 18, 28); ctx.textAlign = 'right'; ctx.fillText(`STREAK ×${streak}`, w - 18, 28);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function startMail() {
  overlay.hidden = true;
  const { w, h } = sizeCanvas();
  const lanes = [w * 0.22, w * 0.5, w * 0.78];
  const targets = [6, 9, 12];
  let level = 1;
  let score = 0;
  let delivered = 0;
  let selectedLane = 1;
  let shield = 3;
  let last = performance.now();
  let bannerUntil = last + 900;
  let nextSpawn = bannerUntil + 250;
  const parcels = [];

  const selectLaneFromX = (x) => {
    const nearest = lanes.reduce((best, laneX, index) => Math.abs(laneX - x) < Math.abs(lanes[best] - x) ? index : best, 0);
    selectedLane = nearest;
  };
  const onKey = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' || event.type !== 'keydown') return;
    event.preventDefault();
    selectedLane = Math.max(0, Math.min(2, selectedLane + (event.key === 'ArrowLeft' ? -1 : 1)));
    playTone(380, 0.025);
  };
  const onPointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    selectLaneFromX(event.clientX - rect.left);
  };
  addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('pointermove', onPointer);
  cleanup = () => {
    removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.removeEventListener('pointermove', onPointer);
  };
  setLevel(level);

  const advanceLevel = (now) => {
    if (level === targets.length) { finishGame('mail', score, 'Every letter delivered!'); return true; }
    level += 1;
    delivered = 0;
    setLevel(level);
    bannerUntil = now + 950;
    nextSpawn = bannerUntil + 260;
    showToast(`Moon Mail — level ${level}`);
    return false;
  };
  const addParcel = (now) => {
    parcels.push({
      lane: Math.floor(Math.random() * 3),
      y: -34,
      speed: 1.7 + level * 0.45 + Math.random() * 0.5,
      kind: Math.random() < 0.72 ? 'letter' : 'satellite',
      spin: Math.random() * Math.PI * 2
    });
    nextSpawn = now + Math.max(360, 760 - level * 100) + Math.random() * 190;
  };
  const drawLetter = (x, y) => {
    ctx.fillStyle = '#fff9e3';
    ctx.strokeStyle = '#ffb86b';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x - 20, y - 14, 40, 28, 4); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 18, y - 11); ctx.lineTo(x, y + 3); ctx.lineTo(x + 18, y - 11); ctx.stroke();
  };
  const drawSatellite = (x, y, spin) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
    ctx.fillStyle = '#ff7474'; ctx.strokeStyle = '#ffd1d1'; ctx.lineWidth = 2;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeRect(-19, -7, 10, 14); ctx.strokeRect(9, -7, 10, 14);
    ctx.restore();
  };
  const loop = (now) => {
    const dt = Math.min(32, now - last) / 16;
    last = now;
    if (now >= nextSpawn && now > bannerUntil) addParcel(now);
    parcels.forEach((parcel) => { parcel.y += parcel.speed * dt; parcel.spin += 0.055 * dt; });
    for (const parcel of parcels) {
      if (parcel.lane !== selectedLane || parcel.y < h - 106 || parcel.y > h - 43) continue;
      parcel.y = h + 60;
      if (parcel.kind === 'letter') {
        delivered += 1;
        score += 125 + level * 25;
        setScore(score);
        playTone(700, 0.06);
        if (delivered >= targets[level - 1] && advanceLevel(now)) return;
      } else {
        shield -= 1;
        playTone(155, 0.1);
        if (shield === 0) { finishGame('mail', score, 'A satellite stopped the route.'); return; }
      }
    }
    for (let index = parcels.length - 1; index >= 0; index -= 1) if (parcels[index].y > h + 55) parcels.splice(index, 1);
    paintStars(w, h, '#25214d');
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 2;
    lanes.forEach((x, index) => {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      if (index === selectedLane) { ctx.fillStyle = '#d9ff451b'; ctx.fillRect(x - w / 7, 0, w / 3.5, h); }
    });
    for (const parcel of parcels) {
      const x = lanes[parcel.lane];
      if (parcel.kind === 'letter') drawLetter(x, parcel.y);
      else drawSatellite(x, parcel.y, parcel.spin);
    }
    const rocketX = lanes[selectedLane];
    ctx.fillStyle = '#d9ff45'; ctx.shadowColor = '#d9ff45'; ctx.shadowBlur = 13;
    ctx.beginPath(); ctx.moveTo(rocketX, h - 96); ctx.lineTo(rocketX - 19, h - 54); ctx.lineTo(rocketX + 19, h - 54); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff7474'; ctx.fillRect(rocketX - 6, h - 55, 12, 15);
    ctx.fillStyle = '#172038'; ctx.beginPath(); ctx.arc(rocketX, h - 77, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '500 11px DM Mono'; ctx.textAlign = 'left'; ctx.fillText(`MAIL ${delivered}/${targets[level - 1]}`, 18, 28); ctx.textAlign = 'right'; ctx.fillText(`SHIELD ${'●'.repeat(shield)}${'○'.repeat(3 - shield)}`, w - 18, 28);
    if (now < bannerUntil) { ctx.fillStyle = '#ffffff'; ctx.font = '700 25px Outfit'; ctx.textAlign = 'center'; ctx.fillText(`LEVEL ${level}`, w / 2, h / 2); }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
}

function startCurrentGame() {
  if (activeGame === 'neon') startNeon();
  if (activeGame === 'breaker') startBreaker();
  if (activeGame === 'memory') startMemory();
  if (activeGame === 'comet') startComet();
  if (activeGame === 'pulse') startPulse();
  if (activeGame === 'mail') startMail();
}

startButton.addEventListener('click', startCurrentGame);
document.querySelectorAll('[data-play]').forEach((button) => button.addEventListener('click', () => openGame(button.dataset.play)));
$('#closeGame').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', closeRunningGame);
$('#soundToggle').addEventListener('click', () => {
  soundOn = !soundOn;
  $('#soundToggle').textContent = soundOn ? '♫' : '♪';
  $('#soundToggle').setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  showToast(soundOn ? 'Sound on' : 'Sound off');
  playTone(520, 0.08);
});
$('#year').textContent = new Date().getFullYear();
$('#heroBest').textContent = (storedBest('neon') || 2480).toLocaleString();
