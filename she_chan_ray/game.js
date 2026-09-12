/**
 * Space Shooter - Boss 挑戰客製版 (she_chan_ray)
 * =========================================================================
 * 專屬客製規則：
 * 1. 小怪擊殺分數為 1 分 (ENEMY_SCORE = 1)
 * 2. 分數達到 90 分時，停止生成小怪，觸發 WARNING 警報並生成 Boss
 * 3. Boss 體積佔據上方 1/4 螢幕 (寬 380px、高 160px)，血量為 50 滴血
 * 4. Boss 具備巡弋移動、雙砲交替射擊與三向散射彈幕
 * 5. 擊敗 Boss 後遊戲暫時結束，進入通關勝利結算畫面 (VICTORY)
 * 6. 同步支援鍵盤與 Arduino 雙軸搖桿 (Web Serial API)
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

// ── 敵機（小怪） ──────────────────────────────────────────────
const ENEMY_SPEED         = 2;                     // [editable] 敵機移動速度
const ENEMY_SPAWN_DELAY   = 60;                    // [editable] 敵機生成間隔 (幀數)
const ENEMY_BULLET_SPEED  = 4;                     // [editable] 敵機子彈速度
const ENEMY_FIRE_CHANCE   = 0.008;                 // [editable] 敵機每幀發射子彈機率 (0.0~1.0)
const ENEMY_SCORE         = 1;                     // [editable] 客製設定：小怪每隻 1 分
const ENEMY_COLOR         = "rgb(255, 80, 80)";    // [editable] 敵機顏色

// ── Boss 設定 (she_chan_ray 專屬) ──────────────────────────────
const BOSS_SPAWN_SCORE    = 90;                    // [editable] 客製設定：達到 90 分生成 Boss
const BOSS_MAX_HP         = 50;                    // [editable] 客製設定：Boss 50 滴血
const BOSS_W              = 380;                   // Boss 寬度
const BOSS_H              = 160;                   // Boss 高度 (佔據 640 高度的 1/4)
const BOSS_BULLET_SPEED   = 4;                     // Boss 子彈飛行速度

// ── 子彈與背景顏色 ───────────────────────────────────────────
const PLAYER_BULLET_COLOR = "rgb(255, 255, 0)";    // [editable] 玩家子彈顏色
const ENEMY_BULLET_COLOR  = "rgb(255, 120, 0)";    // [editable] 敵機子彈顏色
const BG_COLOR            = "rgb(10, 10, 30)";     // [editable] 宇宙深空背景顏色
const STAR_COUNT          = 80;                    // [editable] 背景流星數量


// ═══════════════════════════════════════════════════════════════
//  Web Audio API 即時合成 8-bit 音效
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
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

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
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(70, t + 0.12);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);
  }

  playBossAlarm() {
    if (!this.enabled) return;
    this._init();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.setValueAtTime(880, t + 0.1);
    osc.frequency.setValueAtTime(440, t + 0.2);
    osc.frequency.setValueAtTime(880, t + 0.3);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.4);
  }

  playVictory() {
    if (!this.enabled) return;
    this._init();
    const melody = [
      { f: 261.6, d: 0.15 }, // C4
      { f: 329.6, d: 0.15 }, // E4
      { f: 392.0, d: 0.15 }, // G4
      { f: 523.2, d: 0.45 }  // C5
    ];
    let offset = 0;
    melody.forEach(note => {
      const t = this.ctx.currentTime + offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.linearRampToValueAtTime(0.01, t + note.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + note.d);
      offset += note.d * 0.9;
    });
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

  const engineY = facingUp ? cy + size / 2 : cy - size / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, engineY, Math.max(Math.floor(size / 5), 3), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

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
//  Boss 專屬子彈 (光球彈幕)
// ═══════════════════════════════════════════════════════════════

class BossBullet {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = 6;
    this.alive = true;
  }

  get rect() {
    return {
      left: this.x - this.r,
      right: this.x + this.r,
      top: this.y - this.r,
      bottom: this.y + this.r
    };
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    if (this.y > SCREEN_H + 20 || this.x < -20 || this.x > SCREEN_W + 20) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    // 外層光暈
    ctx.fillStyle = "#ff0077";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();

    // 核心高亮
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r - 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
//  普通小怪
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
//  巨型 Boss (she_chan_ray 專屬)
// ═══════════════════════════════════════════════════════════════

class Boss {
  constructor() {
    this.w = BOSS_W;                          // 380px 寬
    this.h = BOSS_H;                          // 160px 高 (剛好是 640 的四分之一)
    this.x = (SCREEN_W - this.w) / 2;         // 水平置中
    this.targetY = 24;                        // 最終停留的頂部 Y 座標 (約 24~184px，佔據頂部 1/4)
    this.y = -this.h;                         // 從畫布上方外側慢慢滑入
    this.hp = BOSS_MAX_HP;                    // 50 滴血
    this.maxHp = BOSS_MAX_HP;
    this.alive = true;
    this.entering = true;                     // 進場動畫中
    this.vx = 1.2;                            // 左右巡弋移動速度
    this.attackTimer = 0;
    this.hitFlash = 0;
    this.bullets = [];
  }

  get rect() {
    return {
      left: this.x,
      right: this.x + this.w,
      top: this.y,
      bottom: this.y + this.h
    };
  }

  hit() {
    if (this.entering) return;
    this.hp--;
    this.hitFlash = 5;
    sounds.playHit();
    if (this.hp <= 0) {
      this.alive = false;
    }
  }

  update(playerX) {
    // 1. 進場滑入
    if (this.entering) {
      this.y += 1.6;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.entering = false;
      }
      return;
    }

    // 2. 左右巡弋徘徊
    this.x += this.vx;
    if (this.x <= 15) {
      this.x = 15;
      this.vx = Math.abs(this.vx);
    } else if (this.x + this.w >= SCREEN_W - 15) {
      this.x = SCREEN_W - 15 - this.w;
      this.vx = -Math.abs(this.vx);
    }

    if (this.hitFlash > 0) this.hitFlash--;

    // 3. 攻擊機制
    this.attackTimer++;

    // 彈幕模式 A：每 40 幀左右副砲射擊
    if (this.attackTimer % 40 === 0) {
      this.bullets.push(new BossBullet(this.x + 45, this.y + this.h - 10, 0, BOSS_BULLET_SPEED));
      this.bullets.push(new BossBullet(this.x + this.w - 45, this.y + this.h - 10, 0, BOSS_BULLET_SPEED));
    }

    // 彈幕模式 B：每 100 幀中央主砲發動三向散射彈幕
    if (this.attackTimer % 100 === 0) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h - 15;
      this.bullets.push(new BossBullet(cx, cy, -1.8, BOSS_BULLET_SPEED));
      this.bullets.push(new BossBullet(cx, cy, 0, BOSS_BULLET_SPEED + 0.5));
      this.bullets.push(new BossBullet(cx, cy, 1.8, BOSS_BULLET_SPEED));
    }

    // 更新子彈
    for (const b of this.bullets) b.update();
    this.bullets = this.bullets.filter(b => b.alive);
  }

  draw(ctx) {
    ctx.save();
    const cx = this.x + this.w / 2;
    const topY = this.y;
    const botY = this.y + this.h;

    // 受傷閃白特效
    const isHit = this.hitFlash > 0;
    ctx.fillStyle = isHit ? "#ffffff" : "#2d123d";
    ctx.strokeStyle = isHit ? "#ffffff" : "#ff0077";
    ctx.lineWidth = 3;

    // 繪製巨型太空旗艦艦體 (從上方往下佔據 1/4 螢幕)
    ctx.beginPath();
    ctx.moveTo(this.x + 35, topY + 10);
    ctx.lineTo(this.x + this.w - 35, topY + 10);
    ctx.lineTo(this.x + this.w, topY + 60);
    ctx.lineTo(this.x + this.w - 30, botY);
    ctx.lineTo(cx + 65, botY - 20);
    ctx.lineTo(cx, botY);
    ctx.lineTo(cx - 65, botY - 20);
    ctx.lineTo(this.x + 30, botY);
    ctx.lineTo(this.x, topY + 60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 艦體裝甲分段
    ctx.fillStyle = isHit ? "#ffffff" : "#4f1a63";
    ctx.beginPath();
    ctx.moveTo(cx - 75, topY + 20);
    ctx.lineTo(cx + 75, topY + 20);
    ctx.lineTo(cx + 40, botY - 30);
    ctx.lineTo(cx - 40, botY - 30);
    ctx.closePath();
    ctx.fill();

    // 中央動力發光核心
    const pulse = (Math.sin(Date.now() / 140) + 1) / 2;
    ctx.fillStyle = `rgb(255, ${Math.floor(60 + pulse * 140)}, 255)`;
    ctx.beginPath();
    ctx.arc(cx, topY + 65, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#00dcff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 左右主砲口
    ctx.fillStyle = "#ff0055";
    ctx.fillRect(this.x + 38, botY - 14, 14, 20);
    ctx.fillRect(this.x + this.w - 52, botY - 14, 14, 20);

    ctx.restore();
  }

  drawHpBar(ctx) {
    ctx.save();
    const barW = 340;
    const barH = 14;
    const bx = (SCREEN_W - barW) / 2;
    const by = 38;

    // 文字
    ctx.fillStyle = "#ff2d6c";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(255, 0, 119, 0.7)";
    ctx.shadowBlur = 8;
    ctx.fillText(`⚡ BOSS HP: ${Math.max(0, this.hp)} / ${this.maxHp} ⚡`, SCREEN_W / 2, by - 6);

    // 血條底框
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(25, 10, 25, 0.85)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.strokeStyle = "#ff0077";
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, barW, barH);

    // 血條填滿 (漸層)
    const pct = Math.max(0, this.hp / this.maxHp);
    if (pct > 0) {
      const grad = ctx.createLinearGradient(bx, by, bx + barW, by);
      grad.addColorStop(0, "#ff0055");
      grad.addColorStop(1, "#ffbb00");
      ctx.fillStyle = grad;
      ctx.fillRect(bx + 2, by + 2, (barW - 4) * pct, barH - 4);
    }

    ctx.restore();
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

  constructor(cx, cy, scale = 1.0) {
    this.cx = cx;
    this.cy = cy;
    this.scale = scale;
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
    const radius = Math.floor(32 * this.scale * p);
    const g = Math.floor(200 * (1 - p));
    const lineWidth = Math.max(1, Math.floor((4 - p * 4) * this.scale));

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
    this.state = "start"; // 'start' | 'play' | 'gameover' | 'victory'

    this.keys = {};
    this.serialInput = { dx: 0, dy: 0, fire: false, confirm: false };
    this.autoFire = false;

    this.newGame();
    this._bindEvents();
  }

  newGame() {
    this.player = new Player();
    this.enemies = [];
    this.boss = null;
    this.bossWarningTimer = 0;
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
      } else if (this.state === "gameover" || this.state === "victory") {
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
      if (this.state === "gameover" || this.state === "victory") {
        this.newGame();
        this.state = "play";
        return;
      }

      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      isTouchingCanvas = true;
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
      } else if (this.state === "gameover" || this.state === "victory") {
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
        if (this.state === "gameover" || this.state === "victory") {
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
        if (this.state === "gameover" || this.state === "victory") {
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

    if (this.keys["ArrowLeft"] || this.keys["KeyA"])  dx -= PLAYER_SPEED;
    if (this.keys["ArrowRight"] || this.keys["KeyD"]) dx += PLAYER_SPEED;
    if (this.keys["ArrowUp"] || this.keys["KeyW"])    dy -= PLAYER_SPEED;
    if (this.keys["ArrowDown"] || this.keys["KeyS"])  dy += PLAYER_SPEED;
    if (this.keys["Space"] || this.autoFire) fire = true;
    if (this.keys["Enter"] || this.keys["KeyR"]) confirm = true;

    dx += this.serialInput.dx;
    dy += this.serialInput.dy;
    if (this.serialInput.fire) fire = true;
    if (this.serialInput.confirm) confirm = true;

    return { dx, dy, fire, confirm };
  }

  checkCollisions() {
    const pRect = this.player.rect;

    // 1. 玩家子彈擊中普通小怪
    for (const bullet of this.player.bullets) {
      for (const enemy of this.enemies) {
        if (!enemy.alive || !bullet.alive) continue;
        if (rectIntersect(bullet.rect, enemy.rect)) {
          bullet.alive = false;
          enemy.alive = false;
          this.explosions.push(new Explosion(enemy.x, enemy.y));
          this.score += ENEMY_SCORE; // 客製：小怪 1 分
          sounds.playExplosion();
        }
      }
    }

    // 2. 玩家子彈擊中 Boss (50 滴血)
    if (this.boss && this.boss.alive && !this.boss.entering) {
      for (const bullet of this.player.bullets) {
        if (!bullet.alive) continue;
        if (rectIntersect(bullet.rect, this.boss.rect)) {
          bullet.alive = false;
          this.boss.hit();
          this.explosions.push(new Explosion(bullet.x, bullet.y, 0.7));
          if (!this.boss.alive) {
            // Boss 殞落，連環大爆炸！
            for (let i = 0; i < 15; i++) {
              setTimeout(() => {
                const rx = this.boss.x + Math.random() * this.boss.w;
                const ry = this.boss.y + Math.random() * this.boss.h;
                this.explosions.push(new Explosion(rx, ry, 1.6));
                sounds.playExplosion();
              }, i * 120);
            }
            setTimeout(() => {
              this.state = "victory";
              sounds.playVictory();
            }, 1800);
          }
        }
      }
    }

    // 3. 小怪子彈擊中玩家
    for (const enemy of this.enemies) {
      for (const ebullet of enemy.bullets) {
        if (rectIntersect(ebullet.rect, pRect)) {
          ebullet.alive = false;
          this.player.hit();
          this.explosions.push(new Explosion(this.player.x, this.player.y));
        }
      }

      // 小怪撞擊玩家
      if (enemy.alive && rectIntersect(enemy.rect, pRect)) {
        enemy.alive = false;
        this.player.hit();
        this.explosions.push(new Explosion(enemy.x, enemy.y));
      }
    }

    // 4. Boss 子彈與本體碰撞玩家
    if (this.boss && this.boss.alive) {
      for (const bbullet of this.boss.bullets) {
        if (rectIntersect(bbullet.rect, pRect)) {
          bbullet.alive = false;
          this.player.hit();
          this.explosions.push(new Explosion(this.player.x, this.player.y));
        }
      }

      if (!this.boss.entering && rectIntersect(this.boss.rect, pRect)) {
        this.player.hit();
        this.explosions.push(new Explosion(this.player.x, this.player.y));
      }
    }
  }

  drawStart() {
    this.ctx.fillStyle = BG_COLOR;
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    for (const s of this.stars) s.draw(this.ctx);

    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = PLAYER_COLOR;
    this.ctx.font = "bold 34px 'Courier New', monospace";
    this.ctx.shadowColor = "rgba(0, 220, 255, 0.7)";
    this.ctx.shadowBlur = 15;
    this.ctx.fillText("SPACE SHOOTER", SCREEN_W / 2, SCREEN_H / 3 - 20);

    this.ctx.fillStyle = "#ff0077";
    this.ctx.font = "bold 20px 'Courier New', monospace";
    this.ctx.shadowColor = "rgba(255, 0, 119, 0.8)";
    this.ctx.fillText("BOSS BATTLE EDITION", SCREEN_W / 2, SCREEN_H / 3 + 18);
    this.ctx.restore();

    drawShip(this.ctx, SCREEN_W / 2, SCREEN_H / 2 + 10, 26, PLAYER_COLOR, true);

    this.ctx.save();
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "rgb(200, 200, 200)";
    this.ctx.font = "15px 'Courier New', monospace";
    const instructions = [
      "Target: 90 Score -> Boss Spawn",
      "Boss HP: 50 | Arrow/WASD: Move",
      "SPACE / Button: Fire",
      "",
      "Press ENTER or Tap to Start"
    ];
    instructions.forEach((line, i) => {
      this.ctx.fillText(line, SCREEN_W / 2, SCREEN_H * 2 / 3 + i * 26);
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

    // 生命圓點
    for (let i = 0; i < this.player.lives; i++) {
      this.ctx.fillStyle = "rgb(255, 60, 60)";
      this.ctx.beginPath();
      this.ctx.arc(SCREEN_W - 20 - i * 24, 20, 8, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();

    // Boss 血條
    if (this.boss && this.boss.alive) {
      this.boss.drawHpBar(this.ctx);
    }
  }

  drawWarning() {
    this.ctx.save();
    this.ctx.textAlign = "center";
    const pulse = (Math.floor(Date.now() / 200) % 2 === 0);
    this.ctx.fillStyle = pulse ? "#ff0055" : "#ffff00";
    this.ctx.font = "bold 24px 'Courier New', monospace";
    this.ctx.shadowColor = "#ff0055";
    this.ctx.shadowBlur = 15;
    this.ctx.fillText("⚠️ WARNING: BOSS APPROACHING! ⚠️", SCREEN_W / 2, SCREEN_H / 2 - 20);
    this.ctx.restore();
  }

  drawVictory() {
    // 勝利遮罩
    this.ctx.fillStyle = "rgba(10, 15, 35, 0.85)";
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    this.ctx.save();
    this.ctx.textAlign = "center";

    // 勝利字樣
    this.ctx.fillStyle = "#00ffbb";
    this.ctx.font = "bold 40px 'Courier New', monospace";
    this.ctx.shadowColor = "rgba(0, 255, 187, 0.9)";
    this.ctx.shadowBlur = 18;
    this.ctx.fillText("VICTORY!", SCREEN_W / 2, SCREEN_H / 2 - 70);

    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 20px 'Courier New', monospace";
    this.ctx.fillText("BOSS HAS BEEN DEFEATED!", SCREEN_W / 2, SCREEN_H / 2 - 20);

    const scoreStr = String(this.score).padStart(5, "0");
    this.ctx.fillStyle = "#ffd700";
    this.ctx.font = "24px 'Courier New', monospace";
    this.ctx.fillText(`FINAL SCORE : ${scoreStr}`, SCREEN_W / 2, SCREEN_H / 2 + 30);

    this.ctx.fillStyle = "rgb(180, 190, 210)";
    this.ctx.font = "16px 'Courier New', monospace";
    this.ctx.fillText("Press R / ENTER or Tap to Play Again", SCREEN_W / 2, SCREEN_H / 2 + 80);

    this.ctx.restore();
  }

  drawGameOver() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    this.ctx.save();
    this.ctx.textAlign = "center";

    this.ctx.fillStyle = "rgb(255, 80, 80)";
    this.ctx.font = "bold 44px 'Courier New', monospace";
    this.ctx.shadowColor = "rgba(255, 80, 80, 0.8)";
    this.ctx.shadowBlur = 12;
    this.ctx.fillText("GAME  OVER", SCREEN_W / 2, SCREEN_H / 2 - 50);

    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "24px 'Courier New', monospace";
    const scoreStr = String(this.score).padStart(5, "0");
    this.ctx.fillText(`SCORE : ${scoreStr}`, SCREEN_W / 2, SCREEN_H / 2);

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

      // 判斷是否達到 90 分生成 Boss
      if (this.score >= BOSS_SPAWN_SCORE && !this.boss) {
        if (this.bossWarningTimer === 0) {
          sounds.playBossAlarm();
        }
        this.bossWarningTimer++;

        // 警告倒數結束，Boss 正式登場
        if (this.bossWarningTimer >= 120) {
          this.boss = new Boss();
        }
      }

      // 未達 90 分且 Boss 未生成時才生成普通小怪
      if (!this.boss && this.score < BOSS_SPAWN_SCORE) {
        this.spawnTimer++;
        if (this.spawnTimer >= ENEMY_SPAWN_DELAY) {
          this.enemies.push(new Enemy());
          this.spawnTimer = 0;
        }
      }

      // 更新小怪
      for (const e of this.enemies) e.update();
      this.enemies = this.enemies.filter(e => e.alive);

      // 更新 Boss
      if (this.boss && this.boss.alive) {
        this.boss.update(this.player.x);
      }

      // 更新爆炸特效
      for (const ex of this.explosions) ex.update();
      this.explosions = this.explosions.filter(ex => ex.alive);

      this.checkCollisions();

      if (this.player.lives <= 0) {
        this.state = "gameover";
        sounds.playGameOver();
      }
    } else if (this.state === "gameover" || this.state === "victory") {
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

    // 繪製小怪
    for (const e of this.enemies) {
      e.drawBullets(this.ctx);
      e.draw(this.ctx);
    }

    // 繪製 Boss
    if (this.boss && this.boss.alive) {
      this.boss.drawBullets(this.ctx);
      this.boss.draw(this.ctx);
    }

    // 繪製玩家
    this.player.drawBullets(this.ctx);
    this.player.draw(this.ctx);

    // 繪製爆炸
    for (const ex of this.explosions) ex.draw(this.ctx);

    // 繪製 Boss 登場警告文字
    if (this.score >= BOSS_SPAWN_SCORE && !this.boss && this.bossWarningTimer < 120) {
      this.drawWarning();
    }

    this.drawHUD();

    if (this.state === "gameover") {
      this.drawGameOver();
    } else if (this.state === "victory") {
      this.drawVictory();
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
        buffer = lines.pop();

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
    } catch (e) {}
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

  const btnSound = document.getElementById("btnToggleSound");
  if (btnSound) {
    btnSound.addEventListener("click", () => {
      sounds.enabled = !sounds.enabled;
      btnSound.textContent = sounds.enabled ? "🔊 音效: 開" : "🔇 音效: 關";
    });
  }

  game.run();
});

