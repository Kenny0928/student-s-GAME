/**
 * Space Shooter - HTML5 Canvas 移植版 (支援鍵盤與 Arduino 實體控制器 Web Serial API)
 * =========================================================================
 * 課程用途：九年級資訊科技課程，學生可自由修改標有 // [editable] 的設定值，觀察遊戲變化。
 */

// ═══════════════════════════════════════════════════════════════
//  遊戲設定（學生可自由修改這裡！）
// ═══════════════════════════════════════════════════════════════

const SCREEN_W            = 480;                   // 視窗寬度
const SCREEN_H            = 640;                   // 視窗高度
const TITLE               = "Space Shooter";      // [editable] 遊戲標題

// ── 玩家 ──────────────────────────────────────────────────────
const PLAYER_SPEED        = 5;                     // [editable] 玩家飛船移動速度
const PLAYER_BULLET_SPEED = 10;                    // [editable] 玩家子彈速度
const PLAYER_FIRE_DELAY   = 15;                    // [editable] 射擊冷卻時間 (幀數，越小射速越快)
const PLAYER_LIVES        = 3;                     // [editable] 初始生命數
const PLAYER_COLOR        = "rgb(0, 220, 255)";    // [editable] 玩家飛船顏色 (R, G, B)
const PLAYER_INVINCIBLE   = 120;                  // [editable] 被擊中後的無敵保護幀數

// ── 實體控制器設定（Arduino 雙軸搖桿） ─────────────────────────
const JOYSTICK_CENTER     = 512;                   // Arduino 10-bit ADC 中心基準數值 (0~1023)
const JOYSTICK_DEADZONE   = 80;                    // [editable] 搖桿死區防飄移門檻 (建議 50~100)

// ── 敵機 ──────────────────────────────────────────────────────
const ENEMY_SPEED         = 2;                     // [editable] 敵機移動速度
const ENEMY_SPAWN_DELAY   = 60;                    // [editable] 敵機生成間隔 (幀數)
const ENEMY_BULLET_SPEED  = 4;                     // [editable] 敵機子彈速度
const ENEMY_FIRE_CHANCE   = 0.008;                 // [editable] 敵機每幀發射子彈機率 (0.0~1.0)
const ENEMY_SCORE         = 10;                    // [editable] 每擊殺一架敵機得分
const ENEMY_COLOR         = "rgb(255, 80, 80)";    // [editable] 敵機顏色

// ── 子彈與背景顏色 ───────────────────────────────────────────
const PLAYER_BULLET_COLOR = "rgb(255, 255, 0)";    // [editable] 玩家子彈顏色
const ENEMY_BULLET_COLOR  = "rgb(255, 120, 0)";    // [editable] 敵機子彈顏色
const BG_COLOR            = "rgb(10, 10, 30)";     // [editable] 宇宙深空背景顏色
const STAR_COUNT          = 80;                    // [editable] 背景流星數量


// ═══════════════════════════════════════════════════════════════
//  Web Audio API 即時合成 8-bit 音效（免外部檔案、無 CORS 問題）
// ═══════════════════════════════════════════════════════════════

class SoundSynth {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playLaser() {
    if (!this.enabled) return;
    this._init();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.12);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  playExplosion() {
    if (!this.enabled) return;
    this._init();
    const t = this.ctx.currentTime;
    // 產生 0.25 秒白噪音模擬爆炸
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // 低通濾波器創造沈重爆炸聲
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(50, t + 0.25);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
  }

  playHit() {
    if (!this.enabled) return;
    this._init();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.linearRampToValueAtTime(60, t + 0.15);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  playGameOver() {
    if (!this.enabled) return;
    this._init();
    const notes = [330, 294, 262, 196];
    notes.forEach((freq, idx) => {
      const t = this.ctx.currentTime + idx * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.linearRampToValueAtTime(0.01, t + 0.13);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }
}

const sounds = new SoundSynth();


// ═══════════════════════════════════════════════════════════════
//  工具函式：繪製三角形像素風飛船
// ═══════════════════════════════════════════════════════════════

function drawShip(ctx, cx, cy, size, color, facingUp = true) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (facingUp) {
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx - size / 2, cy + size / 2);
    ctx.lineTo(cx + size / 2, cy + size / 2);
  } else {
    ctx.moveTo(cx, cy + size);
    ctx.lineTo(cx - size / 2, cy - size / 2);
    ctx.lineTo(cx + size / 2, cy - size / 2);
  }
  ctx.closePath();
  ctx.fill();

  // 引擎噴射火花
  const engineY = facingUp ? cy + size / 2 : cy - size / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, engineY, Math.max(Math.floor(size / 5), 3), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 矩形碰撞偵測
function rectIntersect(r1, r2) {
  return !(
    r2.left > r1.right ||
    r2.right < r1.left ||
    r2.top > r1.bottom ||
    r2.bottom < r1.top
  );
}


// ═══════════════════════════════════════════════════════════════
//  背景星星
// ═══════════════════════════════════════════════════════════════

class Star {
  constructor() {
    this.reset(Math.random() * SCREEN_H);
  }

  reset(y = 0) {
    this.x = Math.random() * SCREEN_W;
    this.y = y;
    this.speed = 0.5 + Math.random() * 2.0;
    const rPool = [1, 1, 1, 2];
    this.r = rPool[Math.floor(Math.random() * rPool.length)];
  }

  update() {
    this.y += this.speed;
    if (this.y > SCREEN_H) {
      this.reset(0);
    }
  }

  draw(ctx) {
    ctx.fillStyle = "rgb(190, 190, 210)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}


// ═══════════════════════════════════════════════════════════════
//  玩家子彈
// ═══════════════════════════════════════════════════════════════

class PlayerBullet {
  static W = 4;
  static H = 14;

  constructor(x, y) {
    this.x = x - PlayerBullet.W / 2;
    this.y = y - PlayerBullet.H;
    this.w = PlayerBullet.W;
    this.h = PlayerBullet.H;
    this.alive = true;
  }

  get rect() {
    return { left: this.x, right: this.x + this.w, top: this.y, bottom: this.y + this.h };
  }

  update() {
    this.y -= PLAYER_BULLET_SPEED;
    if (this.y + this.h < 0) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.fillStyle = PLAYER_BULLET_COLOR;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 彈頭高亮
    ctx.fillStyle = "rgb(255, 255, 200)";
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}


// ═══════════════════════════════════════════════════════════════
//  敵機子彈
// ═══════════════════════════════════════════════════════════════

class EnemyBullet {
  static W = 4;
  static H = 10;

  constructor(x, y) {
    this.x = x - EnemyBullet.W / 2;
    this.y = y;
    this.w = EnemyBullet.W;
    this.h = EnemyBullet.H;
    this.alive = true;
  }

  get rect() {
    return { left: this.x, right: this.x + this.w, top: this.y, bottom: this.y + this.h };
  }

  update() {
    this.y += ENEMY_BULLET_SPEED;
    if (this.y > SCREEN_H) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.fillStyle = ENEMY_BULLET_COLOR;
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }
}


// ═══════════════════════════════════════════════════════════════
//  玩家飛船
// ═══════════════════════════════════════════════════════════════

class Player {
  static SIZE = 18;

  constructor() {
    this.x = SCREEN_W / 2;
    this.y = SCREEN_H - 80;
    this.lives = PLAYER_LIVES;
    this.fireCd = 0;
    this.invincible = 0;
    this.bullets = [];
  }

  get rect() {
    const s = Player.SIZE;
    return {
      left: this.x - s,
      right: this.x + s,
      top: this.y - s,
      bottom: this.y + s
    };
  }

  move(dx, dy) {
    const s = Player.SIZE;
    this.x = Math.max(s, Math.min(SCREEN_W - s, this.x + dx));
    this.y = Math.max(s, Math.min(SCREEN_H - s, this.y + dy));
  }

  tryFire() {
    if (this.fireCd <= 0) {
      this.bullets.push(new PlayerBullet(this.x, this.y - Player.SIZE));
      this.fireCd = PLAYER_FIRE_DELAY;
      sounds.playLaser();
    }
  }

  hit() {
    if (this.invincible > 0) return;
    this.lives -= 1;
    this.invincible = PLAYER_INVINCIBLE;
    sounds.playHit();
  }

  update() {
    if (this.fireCd > 0) this.fireCd--;
    if (this.invincible > 0) this.invincible--;

    for (const b of this.bullets) {
      b.update();
    }
    this.bullets = this.bullets.filter(b => b.alive);
  }

  draw(ctx) {
    // 無敵狀態受傷閃爍特效
    if (this.invincible > 0 && Math.floor(this.invincible / 6) % 2 === 0) {
      return;
    }
    drawShip(ctx, this.x, this.y, Player.SIZE, PLAYER_COLOR, true);
  }

  drawBullets(ctx) {
    for (const b of this.bullets) {
      b.draw(ctx);
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  敵機
// ═══════════════════════════════════════════════════════════════

class Enemy {
  static SIZE = 14;

  constructor() {
    const s = Enemy.SIZE;
    this.x = s + 10 + Math.random() * (SCREEN_W - (s + 10) * 2);
    this.y = -s;
    this.alive = true;
    this.bullets = [];
  }

  get rect() {
    const s = Enemy.SIZE;
    return {
      left: this.x - s,
      right: this.x + s,
      top: this.y - s,
      bottom: this.y + s
    };
  }

  update() {
    this.y += ENEMY_SPEED;
    if (this.y > SCREEN_H + Enemy.SIZE) {
      this.alive = false;
    }

    // 機率開火
    if (Math.random() < ENEMY_FIRE_CHANCE) {
      this.bullets.push(new EnemyBullet(this.x, this.y + Enemy.SIZE));
    }

    for (const b of this.bullets) {
      b.update();
    }
    this.bullets = this.bullets.filter(b => b.alive);
  }

  draw(ctx) {
    drawShip(ctx, this.x, this.y, Enemy.SIZE, ENEMY_COLOR, false);
  }

  drawBullets(ctx) {
    for (const b of this.bullets) {
      b.draw(ctx);
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  爆炸特效
// ═══════════════════════════════════════════════════════════════

class Explosion {
  static MAX_FRAMES = 22;

  constructor(cx, cy) {
    this.cx = cx;
    this.cy = cy;
    this.frame = 0;
  }

  get alive() {
    return this.frame < Explosion.MAX_FRAMES;
  }

  update() {
    this.frame++;
  }

  draw(ctx) {
    const p = this.frame / Explosion.MAX_FRAMES;
    const radius = Math.floor(32 * p);
    const g = Math.floor(200 * (1 - p));
    const lineWidth = Math.max(1, 4 - Math.floor(p * 4));

    if (radius > 0) {
      ctx.save();
      ctx.strokeStyle = `rgb(255, ${g}, 0)`;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}


// ═══════════════════════════════════════════════════════════════
//  主遊戲核心類別
// ═══════════════════════════════════════════════════════════════

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.stars = Array.from({ length: STAR_COUNT }, () => new Star());
    this.state = "start"; // 'start' | 'play' | 'gameover'

    // 輸入狀態
    this.keys = {};
    this.serialInput = { dx: 0, dy: 0, fire: false, confirm: false };
    this.autoFire = false;

    this.newGame();
    this._bindEvents();
  }

  newGame() {
    this.player = new Player();
    this.enemies = [];
    this.explosions = [];
    this.score = 0;
    this.spawnTimer = 0;
  }

  _bindEvents() {
    // ── 鍵盤監聽 ──
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }

      if (this.state === "start") {
        if (e.code === "Enter" || e.code === "Space") {
          this.state = "play";
        }
      } else if (this.state === "gameover") {
        if (e.code === "KeyR" || e.code === "Enter" || e.code === "Space") {
          this.newGame();
          this.state = "play";
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });

    // ── 手機畫布直接觸控拖曳 (Touch to Move) 與點擊開始 ──
    let touchStartX = 0;
    let touchStartY = 0;
    let isTouchingCanvas = false;

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (this.state === "start") {
        this.state = "play";
        return;
      }
      if (this.state === "gameover") {
        this.newGame();
        this.state = "play";
        return;
      }

      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      isTouchingCanvas = true;
      // 觸碰當下若非連發則發射一發
      this.player.tryFire();
    }, { passive: false });

    this.canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (!isTouchingCanvas || this.state !== "play") return;
      const t = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = SCREEN_W / rect.width;
      const scaleY = SCREEN_H / rect.height;

      const deltaX = (t.clientX - touchStartX) * scaleX;
      const deltaY = (t.clientY - touchStartY) * scaleY;

      touchStartX = t.clientX;
      touchStartY = t.clientY;

      // 飛船跟隨手指等比位移
      this.player.move(deltaX * 1.1, deltaY * 1.1);
      if (this.autoFire) {
        this.player.tryFire();
      }
    }, { passive: false });

    this.canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      isTouchingCanvas = false;
    }, { passive: false });

    this.canvas.addEventListener("click", () => {
      if (this.state === "start") {
        this.state = "play";
      } else if (this.state === "gameover") {
        this.newGame();
        this.state = "play";
      }
    });

    // ── 下方專屬虛擬方向鍵（多點觸控支援） ──
    const dpadBtns = document.querySelectorAll(".dpad-btn");
    dpadBtns.forEach(btn => {
      const key = btn.dataset.key;
      const press = (e) => {
        e.preventDefault();
        btn.classList.add("active");
        this.keys[key] = true;
        if (this.state === "start") this.state = "play";
        if (this.state === "gameover") {
          this.newGame();
          this.state = "play";
        }
      };
      const release = (e) => {
        e.preventDefault();
        btn.classList.remove("active");
        this.keys[key] = false;
      };

      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", release);
    });

    // ── 開火按鍵 ──
    const fireBtn = document.querySelector(".fire-btn");
    if (fireBtn) {
      const press = (e) => {
        e.preventDefault();
        fireBtn.classList.add("active");
        this.keys["Space"] = true;
        if (this.state === "start") this.state = "play";
        if (this.state === "gameover") {
          this.newGame();
          this.state = "play";
        }
      };
      const release = (e) => {
        e.preventDefault();
        fireBtn.classList.remove("active");
        this.keys["Space"] = false;
      };

      fireBtn.addEventListener("pointerdown", press);
      fireBtn.addEventListener("pointerup", release);
      fireBtn.addEventListener("pointercancel", release);
      fireBtn.addEventListener("pointerleave", release);
    }

    // ── 連發開關按鈕 ──
    const btnAutoFire = document.getElementById("btnAutoFire");
    if (btnAutoFire) {
      btnAutoFire.addEventListener("click", (e) => {
        e.preventDefault();
        this.autoFire = !this.autoFire;
        btnAutoFire.textContent = this.autoFire ? "連發: 開" : "連發: 關";
        btnAutoFire.classList.toggle("on", this.autoFire);
      });
    }
  }

  getInput() {
    let dx = 0;
    let dy = 0;
    let fire = false;
    let confirm = false;

    // 1. 鍵盤輸入 (方向鍵 + WASD)
    if (this.keys["ArrowLeft"] || this.keys["KeyA"])  dx -= PLAYER_SPEED;
    if (this.keys["ArrowRight"] || this.keys["KeyD"]) dx += PLAYER_SPEED;
    if (this.keys["ArrowUp"] || this.keys["KeyW"])    dy -= PLAYER_SPEED;
    if (this.keys["ArrowDown"] || this.keys["KeyS"])  dy += PLAYER_SPEED;
    if (this.keys["Space"] || this.autoFire) fire = true;
    if (this.keys["Enter"] || this.keys["KeyR"]) confirm = true;

    // 2. Arduino 實體控制器輸入 (疊加)
    dx += this.serialInput.dx;
    dy += this.serialInput.dy;
    if (this.serialInput.fire) fire = true;
    if (this.serialInput.confirm) confirm = true;

    return { dx, dy, fire, confirm };
  }

  checkCollisions() {
    const pRect = this.player.rect;

    // 玩家子彈擊中敵機
    for (const bullet of this.player.bullets) {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (rectIntersect(bullet.rect, enemy.rect)) {
          bullet.alive = false;
          enemy.alive = false;
          this.explosions.push(new Explosion(enemy.x, enemy.y));
          this.score += ENEMY_SCORE;
          sounds.playExplosion();
        }
      }
    }

    // 敵機子彈擊中玩家
    for (const enemy of this.enemies) {
      for (const ebullet of enemy.bullets) {
        if (rectIntersect(ebullet.rect, pRect)) {
          ebullet.alive = false;
          this.player.hit();
          this.explosions.push(new Explosion(this.player.x, this.player.y));
        }
      }

      // 敵機機身撞擊玩家
      if (enemy.alive && rectIntersect(enemy.rect, pRect)) {
        enemy.alive = false;
        this.player.hit();
        this.explosions.push(new Explosion(enemy.x, enemy.y));
      }
    }
  }

  drawStart() {
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    for (const s of this.stars) s.draw(this.ctx);

    // 標題
    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = PLAYER_COLOR;
    this.ctx.font = "bold 38px 'Courier New', monospace";
    this.ctx.shadowColor = "rgba(0, 220, 255, 0.7)";
    this.ctx.shadowBlur = 15;
    this.ctx.fillText(TITLE, SCREEN_W / 2, SCREEN_H / 3);
    this.ctx.restore();

    // 飛船預覽展示
    drawShip(this.ctx, SCREEN_W / 2, SCREEN_H / 2 + 10, 26, PLAYER_COLOR, true);

    // 操作指引文字
    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "rgb(200, 200, 200)";
    this.ctx.font = "16px 'Courier New', monospace";
    const instructions = [
      "Arrow / WASD / Joystick   Move",
      "SPACE / Button           Fire",
      "",
      "Press ENTER or Tap to Start"
    ];
    instructions.forEach((line, i) => {
      this.ctx.fillText(line, SCREEN_W / 2, SCREEN_H * 2 / 3 + i * 28);
    });
    this.ctx.restore();
  }

  drawHUD() {
    this.ctx.save();
    this.ctx.font = "16px 'Courier New', monospace";
    this.ctx.fillStyle = "#ffffff";
    this.ctx.textAlign = "left";
    const scoreStr = String(this.score).padStart(5, "0");
    this.ctx.fillText(`SCORE  ${scoreStr}`, 14, 24);

    // 生命值紅圓點
    for (let i = 0; i < this.player.lives; i++) {
      this.ctx.fillStyle = "rgb(255, 60, 60)";
      this.ctx.beginPath();
      this.ctx.arc(SCREEN_W - 20 - i * 24, 20, 8, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  drawGameOver() {
    // 半透明遮罩
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    this.ctx.save();
    this.ctx.textAlign = "center";

    // GAME OVER
    this.ctx.fillStyle = "rgb(255, 80, 80)";
    this.ctx.font = "bold 44px 'Courier New', monospace";
    this.ctx.shadowColor = "rgba(255, 80, 80, 0.8)";
    this.ctx.shadowBlur = 12;
    this.ctx.fillText("GAME  OVER", SCREEN_W / 2, SCREEN_H / 2 - 50);

    // 分數
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "24px 'Courier New', monospace";
    const scoreStr = String(this.score).padStart(5, "0");
    this.ctx.fillText(`SCORE : ${scoreStr}`, SCREEN_W / 2, SCREEN_H / 2);

    // 重新開始提示
    this.ctx.fillStyle = "rgb(160, 160, 160)";
    this.ctx.font = "16px 'Courier New', monospace";
    this.ctx.fillText("Press R / ENTER or Tap to Restart", SCREEN_W / 2, SCREEN_H / 2 + 55);

    this.ctx.restore();
  }

  update() {
    const { dx, dy, fire, confirm } = this.getInput();

    for (const s of this.stars) s.update();

    if (this.state === "start") {
      if (confirm) this.state = "play";
    } else if (this.state === "play") {
      this.player.move(dx, dy);
      if (fire) this.player.tryFire();
      this.player.update();

      // 生成敵機
      this.spawnTimer++;
      if (this.spawnTimer >= ENEMY_SPAWN_DELAY) {
        this.enemies.push(new Enemy());
        this.spawnTimer = 0;
      }

      for (const e of this.enemies) e.update();
      this.enemies = this.enemies.filter(e => e.alive);

      for (const ex of this.explosions) ex.update();
      this.explosions = this.explosions.filter(ex => ex.alive);

      this.checkCollisions();

      if (this.player.lives <= 0) {
        this.state = "gameover";
        sounds.playGameOver();
      }
    } else if (this.state === "gameover") {
      if (confirm) {
        this.newGame();
        this.state = "play";
      }
    }
  }

  render() {
    if (this.state === "start") {
      this.drawStart();
      return;
    }

    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    for (const s of this.stars) s.draw(this.ctx);

    for (const e of this.enemies) {
      e.drawBullets(this.ctx);
      e.draw(this.ctx);
    }

    this.player.drawBullets(this.ctx);
    this.player.draw(this.ctx);

    for (const ex of this.explosions) ex.draw(this.ctx);

    this.drawHUD();

    if (this.state === "gameover") {
      this.drawGameOver();
    }
  }

  run() {
    const loop = () => {
      this.update();
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}


// ═══════════════════════════════════════════════════════════════
//  Web Serial API 支援 (連接 Arduino 實體雙軸搖桿)
// ═══════════════════════════════════════════════════════════════

class WebSerialController {
  constructor(game) {
    this.game = game;
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.btnConnect = document.getElementById("btnConnectSerial");
    this.statusDot = document.getElementById("serialDot");
    this.btnText = document.getElementById("serialBtnText");

    this._bindButton();
  }

  _bindButton() {
    if (!this.btnConnect) return;

    this.btnConnect.addEventListener("click", async () => {
      if (!("serial" in navigator)) {
        alert("⚠️ 您的瀏覽器不支援 Web Serial API！\n請使用 Google Chrome 或 Microsoft Edge 瀏覽器以支援 Arduino 實體控制器。");
        return;
      }

      if (this.port) {
        // 若已連線則中斷
        await this.disconnect();
      } else {
        await this.connect();
      }
    });
  }

  async connect() {
    try {
      this.updateStatus("connecting", "搜尋裝置中...");
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });

      this.updateStatus("connected", "Arduino 已連線");
      this.readLoop();
    } catch (err) {
      console.warn("連線被取消或失敗:", err);
      this.updateStatus("disconnected", "連線 Arduino 搖桿");
      this.port = null;
    }
  }

  async readLoop() {
    let buffer = "";
    try {
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop(); // 保留最後未滿一行的部分

        for (const line of lines) {
          this.parseLine(line.trim());
        }
      }
    } catch (err) {
      console.error("序列埠讀取中斷:", err);
    } finally {
      this.disconnect();
    }
  }

  parseLine(line) {
    if (!line) return;
    try {
      // 剖析 "LX:512,LY:512,B:0"
      const parts = {};
      line.split(",").forEach(item => {
        const [k, v] = item.split(":");
        if (k && v) parts[k.trim()] = v.trim();
      });

      if (parts.LX !== undefined && parts.LY !== undefined) {
        const lx = parseInt(parts.LX, 10) || JOYSTICK_CENTER;
        const ly = parseInt(parts.LY, 10) || JOYSTICK_CENTER;
        const btn = parts.B === "1";

        const offsetX = lx - JOYSTICK_CENTER;
        const offsetY = ly - JOYSTICK_CENTER;

        let joyDx = 0;
        let joyDy = 0;

        if (Math.abs(offsetX) > JOYSTICK_DEADZONE) {
          joyDx = Math.round((offsetX / 512.0) * PLAYER_SPEED);
        }
        if (Math.abs(offsetY) > JOYSTICK_DEADZONE) {
          joyDy = Math.round((offsetY / 512.0) * PLAYER_SPEED);
        }

        this.game.serialInput.dx = joyDx;
        this.game.serialInput.dy = joyDy;
        this.game.serialInput.fire = btn;
        this.game.serialInput.confirm = btn;
      }
    } catch (e) {
      // 容錯跳過畸形封包
    }
  }

  async disconnect() {
    try {
      if (this.reader) {
        await this.reader.cancel();
        await this.readableStreamClosed.catch(() => {});
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.warn("斷開序列埠時錯誤:", err);
    }
    this.game.serialInput = { dx: 0, dy: 0, fire: false, confirm: false };
    this.updateStatus("disconnected", "連線 Arduino 搖桿");
  }

  updateStatus(state, text) {
    if (!this.statusDot || !this.btnText) return;
    this.statusDot.className = `status-dot ${state}`;
    this.btnText.textContent = text;
  }
}


// ═══════════════════════════════════════════════════════════════
//  初始化啟動
// ═══════════════════════════════════════════════════════════════

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const game = new Game(canvas);
  new WebSerialController(game);

  // 音效切換按鈕
  const btnSound = document.getElementById("btnToggleSound");
  if (btnSound) {
    btnSound.addEventListener("click", () => {
      sounds.enabled = !sounds.enabled;
      btnSound.textContent = sounds.enabled ? "🔊 音效: 開" : "🔇 音效: 關";
    });
  }

  game.run();
});

