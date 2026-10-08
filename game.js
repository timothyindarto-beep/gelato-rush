/**
 * ============================================================================
 *  GELATO RUSH
 *  Mobile web game built with Phaser 3, targeting TikTok Minis.
 *
 *  Scene flow:
 *    PreloaderScene -> SplashScene -> MenuScene -> LevelSelectScene -> GameScene -> GameOverScene
 *
 *  - Fixed portrait resolution 1080x1920 with Scale.FIT.
 *  - pixelArt / roundPixels + a pixel UI font ("Press Start 2P").
 *  - Every button uses an oversized invisible Zone hit target.
 *  - ONLY real assets are used. No procedural/placeholder art.
 *
 *  Progression: 10 levels, each with a target number of served orders, an
 *  unlocked flavor count, an unlocked character count, a max stack height and
 *  a patience window. Clearing a level unlocks the next (localStorage).
 *
 *  Monetization stubs:
 *   Rule A - after every cleared level, simulate a TikTok Level-Clear ad.
 *   Rule B - every 3rd "Restart" click, simulate a penalty ad and quietly
 *            grant a free Revive (players only ever see a "Revive (Free!)"
 *            button when they have one).
 * ============================================================================
 */

'use strict';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const GAME_WIDTH = 1080;
const GAME_HEIGHT = 1920;

/* Pixel UI font (loaded via index.html <link> and awaited in the preloader). */
const FONT = '"Press Start 2P", monospace';

/* Warm palette, harmonized with the yellow/red logo (kept restrained). */
const T = {
  gameBg: 0x241a15,
  panel: 0x2e211a,
  panelDark: 0x3a2b21,
  gold: 0xd8a94a,
  goldDeep: 0xbf8f38,
  brand: 0xf2c64c,       // logo yellow (primary actions)
  brandDeep: 0xd9a63c,
  cream: 0xf3e4c4,
  stone: 0x8a7a66,
  barTrack: 0x1c120c,
  green: 0x6f9e5a,
  greenDeep: 0x3f5a34,
  red: 0xb23a2e,
  amber: 0xd9a441,

  sEspresso: '#2e211a',
  sCream: '#f6ecd6',
  sCreamDim: '#c8b89a',
  sGold: '#e8c66a',
  sRed: '#e0503f',
  sGreen: '#a4d68a',
  sStone: '#8a7a66'
};

/* --- Scoop assets --------------------------------------------------------- */
const SCOOP_KEYS = ['scoop_1', 'scoop_2', 'scoop_3', 'scoop_4', 'scoop_5',
                    'scoop_6', 'scoop_7', 'scoop_8', 'scoop_9', 'scoop_10'];

const SCOOP_FILES = [
  'assets/scoop_choco mint.png',
  'assets/scoop_coffee.png',
  'assets/scoop_cookies n cream.png',
  'assets/scoop_dark choco.png',
  'assets/scoop_matcha.png',
  'assets/scoop_orange.png',
  'assets/scoop_strawberry.png',
  'assets/scoop_taro.png',
  'assets/scoop_ube.png',
  'assets/scoop_vanilla.png'
];

/* --- Character assets ----------------------------------------------------- */
const MALE_NAMES = [
  'Fariz', 'Gilang', 'Gundar_Boy', 'Harun', 'Iqbal', 'Jake',
  'Naruta', 'Ryan', 'Sandie', 'Starrie', 'Timo', 'White'
];
const FEMALE_NAMES = [
  'Angel', 'Cattu', 'Daisy', 'Gundar_Girl', 'Lavie',
  'Myahun', 'Quantin', 'Radin', 'Saira', 'Venny'
];

const MALE_CHARACTERS = MALE_NAMES.map(function (n) { return 'male_' + n; });
const FEMALE_CHARACTERS = FEMALE_NAMES.map(function (n) { return 'female_' + n; });

/* Interleave genders so low levels get a mix of both. */
const CHARACTER_POOL = (function () {
  const pool = [];
  const max = Math.max(MALE_CHARACTERS.length, FEMALE_CHARACTERS.length);
  for (let i = 0; i < max; i++) {
    if (i < MALE_CHARACTERS.length) pool.push(MALE_CHARACTERS[i]);
    if (i < FEMALE_CHARACTERS.length) pool.push(FEMALE_CHARACTERS[i]);
  }
  return pool; // 22 total
})();

function characterPath(key) {
  return 'assets/customer_' + key + '.png';
}

/* --- Level table ---------------------------------------------------------- */
const LEVELS = [
  { target: 5,  flavors: 3,  characters: 3,  maxStack: 2, patience: 8000 },
  { target: 7,  flavors: 4,  characters: 5,  maxStack: 2, patience: 7500 },
  { target: 10, flavors: 5,  characters: 7,  maxStack: 3, patience: 7000 },
  { target: 12, flavors: 6,  characters: 10, maxStack: 3, patience: 6500 },
  { target: 15, flavors: 7,  characters: 13, maxStack: 3, patience: 6000 },
  { target: 18, flavors: 8,  characters: 16, maxStack: 4, patience: 5500 },
  { target: 20, flavors: 9,  characters: 19, maxStack: 4, patience: 5000 },
  { target: 22, flavors: 10, characters: 22, maxStack: 4, patience: 4500 },
  { target: 25, flavors: 10, characters: 25, maxStack: 4, patience: 4000 },
  { target: 30, flavors: 10, characters: 25, maxStack: 4, patience: 3500 }
];
const MAX_LEVEL = LEVELS.length;

function getLevelConfig(level) {
  const i = Phaser.Math.Clamp(level, 1, MAX_LEVEL) - 1;
  return LEVELS[i];
}

/* --- Endless mode tuning -------------------------------------------------- */
const ENDLESS_LIVES = 3;
const ENDLESS_START_PATIENCE = 10000;  // ms for the first customer
const ENDLESS_MIN_PATIENCE = 2000;     // hardcore cap
const ENDLESS_PATIENCE_STEP = 500;     // ms shaved off per customer served

/* --- Storage keys --------------------------------------------------------- */
const KEY_MAX_LEVEL = 'gelatoRush.maxLevel';
const KEY_TOKENS = 'gelatoRush.tokens';
const KEY_BEST = 'gelatoRush.best';
const KEY_ENDLESS_BEST = 'gelatoRush.endlessBest';

/* --- Persistent / session state ------------------------------------------ */
const GameState = {
  maxUnlockedLevel: 1,
  reviveTokens: 0,   // hidden from the player
  bestScore: 0,
  endlessBest: 0,
  restartCount: 0    // session-only, drives Rule B
};

function loadPersistentState() {
  try {
    const lvl = parseInt(window.localStorage.getItem(KEY_MAX_LEVEL), 10);
    GameState.maxUnlockedLevel = (lvl >= 1 && lvl <= MAX_LEVEL) ? lvl : 1;
  } catch (e) { GameState.maxUnlockedLevel = 1; }

  try {
    const tk = parseInt(window.localStorage.getItem(KEY_TOKENS), 10);
    GameState.reviveTokens = (tk >= 0) ? tk : 0;
  } catch (e) { GameState.reviveTokens = 0; }

  try {
    const bs = parseInt(window.localStorage.getItem(KEY_BEST), 10);
    GameState.bestScore = (bs >= 0) ? bs : 0;
  } catch (e) { GameState.bestScore = 0; }

  try {
    const eb = parseInt(window.localStorage.getItem(KEY_ENDLESS_BEST), 10);
    GameState.endlessBest = (eb >= 0) ? eb : 0;
  } catch (e) { GameState.endlessBest = 0; }
}

function saveMaxLevel() {
  try { window.localStorage.setItem(KEY_MAX_LEVEL, String(GameState.maxUnlockedLevel)); } catch (e) {}
}
function saveTokens() {
  try { window.localStorage.setItem(KEY_TOKENS, String(GameState.reviveTokens)); } catch (e) {}
}
function saveBestScore() {
  try { window.localStorage.setItem(KEY_BEST, String(GameState.bestScore)); } catch (e) {}
}
function saveEndlessBest() {
  try { window.localStorage.setItem(KEY_ENDLESS_BEST, String(GameState.endlessBest)); } catch (e) {}
}

loadPersistentState();

/* -------------------------------------------------------------------------- */
/*  Audio                                                                      */
/* -------------------------------------------------------------------------- */

/* The main theme loops for the whole session. Extra SFX are loaded from this
 * map automatically, so adding a file is a one-line change. */
const AUDIO = {
  theme:   'assets/sfx/main_theme.mp3',
  scoop:   'assets/sfx/Gelato Scoop.m4a',   // every gelato tap
  correct: 'assets/sfx/Correct Gelato.m4a', // whole order completed
  fail:    'assets/sfx/Fail.m4a',           // timeout or wrong scoop
  start:   'assets/sfx/Start Game.m4a',     // when a countdown begins
  newcone: 'assets/sfx/New Cone.m4a',       // next customer walks in
  click:   'assets/sfx/click.m4a',          // navigating / pressing buttons
  almostfail: 'assets/sfx/almost fail.m4a', // last second of patience
  male1:   'assets/sfx/Male_sound_1.m4a',
  male2:   'assets/sfx/Male_sound_2.m4a',
  male3:   'assets/sfx/Male_sound_3.m4a',
  female1: 'assets/sfx/Female_sound_1.m4a',
  female2: 'assets/sfx/Female_sound_2.m4a',
  female3: 'assets/sfx/Female_sound_3.m4a'
};

/* Character reaction voices, chosen by the customer's gender. */
const MALE_VOICE_KEYS = ['male1', 'male2', 'male3'];
const FEMALE_VOICE_KEYS = ['female1', 'female2', 'female3'];

/* Theme volume + ducking. */
const THEME_VOLUME = 0.45;
const THEME_DUCK = 0.5;   // multiplier while the Game Over menu is open

let themeSound = null;
let themeTween = null;

/* True while the developer splash is on screen, so the theme stays silent
 * until the main menu appears. */
let splashActive = true;

/**
 * Tries to play the looping theme. Safe to call repeatedly (e.g. from the
 * menu as the logo appears, and again on the first user gesture, since most
 * browsers block audio until then).
 */
function tryPlayTheme() {
  try {
    if (splashActive) return;
    if (!game || !game.cache || !game.cache.audio.exists('theme')) return;
    const sm = game.sound;

    // Nudge a suspended/unlocked audio context awake.
    if (sm.context && sm.context.state === 'suspended' && sm.context.resume) {
      sm.context.resume();
    }
    if (sm.locked && sm.unlock) sm.unlock();

    if (!themeSound) themeSound = sm.add('theme', { loop: true, volume: THEME_VOLUME });
    if (!themeSound.isPlaying) themeSound.play();
  } catch (e) { /* audio unavailable - ignore */ }
}

/** Smoothly fades the theme to a target volume. */
function setThemeVolume(scene, target, duration) {
  if (!themeSound) return;
  if (themeTween) { themeTween.stop(); themeTween = null; }

  if (!scene || !scene.tweens) { themeSound.setVolume(target); return; }

  const proxy = { v: themeSound.volume };
  themeTween = scene.tweens.add({
    targets: proxy,
    v: target,
    duration: duration || 400,
    ease: 'Sine.InOut',
    onUpdate: () => themeSound.setVolume(proxy.v),
    onComplete: () => { themeSound.setVolume(target); themeTween = null; }
  });
}

/** Ducks the theme while a menu/overlay is up. */
function duckTheme(scene) { setThemeVolume(scene, THEME_VOLUME * THEME_DUCK, 400); }

/** Restores the theme to full volume. */
function restoreTheme(scene) { setThemeVolume(scene, THEME_VOLUME, 400); }

/** Plays a one-shot SFX if it has been loaded. Returns the Sound (or null). */
function playSfx(scene, key, config) {
  try {
    // Any non-theme sound immediately cuts the "almost fail" warning.
    if (key !== 'almostfail') stopAlmostFail();

    if (!scene.cache.audio.exists(key)) return null;

    const s = scene.sound.play(key, config || {});
    if (key === 'almostfail') almostFailSound = s;
    return s;
  } catch (e) { return null; }
}

/* The "almost fail" warning is a single active instance that gets cut off as
 * soon as any other sound (other than the looping theme) starts. */
let almostFailSound = null;

function stopAlmostFail() {
  if (almostFailSound) {
    try { almostFailSound.stop(); } catch (e) { /* ignore */ }
    almostFailSound = null;
  }
}

/**
 * Plays the fail sound boosted (about +80% over default). Phaser clamps
 * volume to 1.0, so we push the WebAudio gain node past 1.0 when available.
 */
function playFail(scene) {
  const s = playSfx(scene, 'fail');
  if (s && s.gainNode && s.gainNode.gain) {
    try { s.gainNode.gain.value = 1.82; } catch (e) { /* ignore */ }
  }
  return s;
}

/** Plays a random character voice matching the given gender. */
function playVoice(scene, gender) {
  const pool = gender === 'female' ? FEMALE_VOICE_KEYS : MALE_VOICE_KEYS;
  // ~40% quieter than default.
  playSfx(scene, Phaser.Utils.Array.GetRandom(pool), { volume: 0.6 });
}


/* -------------------------------------------------------------------------- */
/*  Layout constants                                                          */
/* -------------------------------------------------------------------------- */

/* GameScene: customer LEFT, order ticket RIGHT. */
const CUSTOMER_X = 300;
const CUSTOMER_Y = 770;
const CUSTOMER_H = 700;

const ORDER_CARD_X = 600;
const ORDER_CARD_Y = 250;
const ORDER_CARD_W = 430;
const ORDER_CARD_H = 660;
const ORDER_CARD_CX = ORDER_CARD_X + ORDER_CARD_W / 2; // 815
const ORDER_CENTER_Y = 640;
const ORDER_SPACING = 118;
const ORDER_SCOOP_SIZE = 170;

const PATIENCE_X = 300;
const PATIENCE_Y = 300;
const PATIENCE_TRACK_W = 520;
const PATIENCE_FILL_W = 500;

const CONE_X = 540;
const CONE_Y = 1330;
const CONE_SIZE = 400;

const PLAYER_SCOOP_SIZE = 190;
const PLAYER_STACK_BASE_Y = 1210;
const PLAYER_STACK_SPACING = 128;

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

function fitToBox(img, boxW, boxH) {
  const src = img.texture.getSourceImage();
  const k = Math.min(boxW / src.width, boxH / src.height);
  img.setScale(k);
  return k;
}

function fitToHeight(img, targetH) {
  const src = img.texture.getSourceImage();
  const k = targetH / src.height;
  img.setScale(k);
  return k;
}

function addCoverBackground(scene) {
  const bg = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg').setDepth(-10);
  const src = bg.texture.getSourceImage();
  bg.setScale(Math.max(GAME_WIDTH / src.width, GAME_HEIGHT / src.height));
  return bg;
}

/** Invisible, oversized touch target. */
function addHitZone(scene, x, y, w, h, onDown) {
  const zone = scene.add.zone(x, y, w, h)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  zone.on('pointerdown', onDown);
  return zone;
}

/** Draws a simple heart at (cx, cy) with radius r onto a Graphics object. */
function drawHeart(g, cx, cy, r, color) {
  g.fillStyle(color, 1);
  g.fillCircle(cx - r / 2, cy - r / 4, r / 2);
  g.fillCircle(cx + r / 2, cy - r / 4, r / 2);
  g.fillTriangle(cx - r, cy - r / 4, cx + r, cy - r / 4, cx, cy + r * 0.9);
}

function makeButton(scene, label, x, y, w, h, fill, textColor, onClick, fontSize) {
  const radius = Math.min(44, h / 2);

  const g = scene.add.graphics();
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.lineStyle(6, T.goldDeep, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);

  const t = scene.add.text(0, 0, label, {
    fontFamily: FONT,
    fontSize: (fontSize || 30) + 'px',
    color: textColor,
    align: 'center'
  }).setOrigin(0.5);

  const c = scene.add.container(x, y, [g, t]).setDepth(20);

  addHitZone(scene, x, y, w + 30, h + 30, () => {
    scene.tweens.add({
      targets: c, scaleX: 0.96, scaleY: 0.96, duration: 80, yoyo: true, ease: 'Quad.Out'
    });
    playSfx(scene, 'click');
    onClick();
  });

  return c;
}

/** Small house/home icon button, top-left. */
function makeHomeButton(scene, onTap) {
  const x = 74;
  const y = 78;
  const r = 50;

  const g = scene.add.graphics();
  g.fillStyle(T.panel, 0.92);
  g.fillCircle(0, 0, r);
  g.lineStyle(5, T.goldDeep, 1);
  g.strokeCircle(0, 0, r);
  // House.
  g.fillStyle(T.cream, 1);
  g.fillTriangle(-26, -2, 26, -2, 0, -30);   // roof
  g.fillRect(-17, -2, 34, 28);               // body
  g.fillStyle(T.panel, 1);
  g.fillRect(-7, 10, 14, 16);                // door

  const c = scene.add.container(x, y, [g]).setDepth(40);
  addHitZone(scene, x, y, r * 2 + 24, r * 2 + 24, () => {
    scene.tweens.add({ targets: c, scaleX: 0.9, scaleY: 0.9, duration: 80, yoyo: true });
    playSfx(scene, 'click');
    onTap();
  });
  return c;
}

/**
 * Simulated rewarded-ad overlay: logs the ad message, shows a spinner for 2
 * seconds, then invokes `onDone`.
 */
function showAdOverlay(scene, message, onDone) {
  console.log(message);

  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const depth = 500;

  scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82).setDepth(depth);

  const arc = scene.add.graphics();
  arc.lineStyle(16, T.gold, 1);
  arc.beginPath();
  arc.arc(0, 0, 56, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(150), false);
  arc.strokePath();

  const spinner = scene.add.container(cx, cy - 160, [arc]).setDepth(depth + 1);
  scene.tweens.add({ targets: spinner, angle: 360, duration: 800, repeat: -1, ease: 'Linear' });

  scene.add.text(cx, cy - 10, message, {
    fontFamily: FONT,
    fontSize: '22px',
    color: T.sCream,
    align: 'center',
    lineSpacing: 12,
    wordWrap: { width: 880 }
  }).setOrigin(0.5).setDepth(depth + 1);

  scene.time.delayedCall(2000, () => { if (onDone) onDone(); });
}

/* ========================================================================== */
/*  PreloaderScene                                                            */
/* ========================================================================== */

class PreloaderScene extends Phaser.Scene {
  constructor() { super('PreloaderScene'); }

  preload() {
    this.buildLoadingUI();

    if (window.location.protocol === 'file:') {
      console.warn(
        '[GelatoRush] Opened via file:// - browsers may block local images.\n' +
        'Serve the folder over HTTP: python3 -m http.server 8000'
      );
    }

    this.load.image('bg', 'assets/bg.png');
    this.load.image('logo', 'assets/logo.png');
    this.load.image('cone', 'assets/cone.png');
    this.load.image('developerLogo', 'assets/developer_logo.png');

    for (let i = 0; i < SCOOP_KEYS.length; i++) {
      this.load.image(SCOOP_KEYS[i], encodeURI(SCOOP_FILES[i]));
    }

    MALE_CHARACTERS.forEach((k) => this.load.image(k, encodeURI(characterPath(k))));
    FEMALE_CHARACTERS.forEach((k) => this.load.image(k, encodeURI(characterPath(k))));

    // Audio (theme + any SFX declared in AUDIO).
    Object.keys(AUDIO).forEach((key) => this.load.audio(key, encodeURI(AUDIO[key])));

    this.load.on('loaderror', (file) => {
      console.warn('[GelatoRush] Failed to load "' + (file && file.key) + '" ->',
        file && (file.src || file.url));
    });

    this.load.on('progress', (v) => {
      if (this.barFill) this.barFill.scaleX = Math.max(0.001, v);
    });
  }

  create() {
    // Make sure the pixel font is ready before any menu text is rasterized,
    // then show the developer logo before the main menu.
    const go = () => this.scene.start('SplashScene');

    if (document.fonts && document.fonts.load) {
      Promise.race([
        document.fonts.load('16px "Press Start 2P"'),
        new Promise((r) => setTimeout(r, 2500))
      ]).then(go).catch(go);
    } else {
      go();
    }
  }

  buildLoadingUI() {
    const cx = GAME_WIDTH / 2;

    this.add.text(cx, 860, 'GELATO RUSH', {
      fontFamily: FONT,
      fontSize: '40px',
      color: T.sGold,
      align: 'center'
    }).setOrigin(0.5);

    const trackW = 720;
    const trackH = 40;
    this.add.rectangle(cx, 1020, trackW, trackH, T.barTrack, 0.7)
      .setStrokeStyle(5, T.gold, 0.7);

    const fill = this.add.rectangle(cx - trackW / 2 + 7, 1020, trackW - 14, trackH - 14, T.gold);
    fill.setOrigin(0, 0.5);
    this.barFill = fill;
    this.barFill.scaleX = 0.001;
  }
}

/* ========================================================================== */
/*  SplashScene - developer logo shown before the main menu                    */
/* ========================================================================== */

class SplashScene extends Phaser.Scene {
  constructor() { super('SplashScene'); }

  create() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Opaque dark backdrop so nothing from behind shows through.
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x241a15, 1);

    let logo;
    if (this.textures.exists('developerLogo')) {
      logo = this.add.image(cx, cy, 'developerLogo');
      fitToBox(logo, 900, 900);
    } else {
      logo = this.add.text(cx, cy, 'GAME ON THE WALL', {
        fontFamily: FONT, fontSize: '40px', color: T.sGold, align: 'center'
      }).setOrigin(0.5);
    }
    logo.setAlpha(0);

    const FADE_IN = 600;
    const HOLD = 2000;   // no music while the logo is held
    const FADE_OUT = 500;

    // Fade the logo in, hold ~2s, fade out, then hand off to the menu.
    this.tweens.add({ targets: logo, alpha: 1, duration: FADE_IN, ease: 'Sine.Out' });
    this.time.delayedCall(FADE_IN + HOLD, () => {
      this.tweens.add({
        targets: logo,
        alpha: 0,
        duration: FADE_OUT,
        ease: 'Sine.In',
        onComplete: () => {
          splashActive = false;   // allow the theme to start in the menu
          this.scene.start('MenuScene');
        }
      });
    });
  }
}

/* ========================================================================== */
/*  MenuScene                                                                 */
/* ========================================================================== */

class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    addCoverBackground(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1c120c, 0.22);

    // Start the theme as the logo pops in; if the browser blocks autoplay,
    // the first tap / gesture will start it instead.
    tryPlayTheme();
    restoreTheme(this);
    this.input.once('pointerdown', tryPlayTheme);

    this.buildLogo();
    this.buildBestScore();
    this.buildButtons();

    // Slide the menu up into place as it appears after the splash.
    this.cameras.main.setScroll(0, -220);
    this.tweens.add({ targets: this.cameras.main, scrollY: 0, duration: 500, ease: 'Cubic.Out' });
  }

  /** Best scores shown on a plate between the logo and the buttons. */
  buildBestScore() {
    const cx = GAME_WIDTH / 2;
    const y = 1140;

    const plate = this.add.graphics();
    plate.fillStyle(T.panel, 0.82);
    plate.fillRoundedRect(cx - 340, y - 72, 680, 144, 30);
    plate.lineStyle(5, T.goldDeep, 0.9);
    plate.strokeRoundedRect(cx - 340, y - 72, 680, 144, 30);

    this.add.text(cx, y - 34, 'BEST SCORE  ' + GameState.bestScore, {
      fontFamily: FONT, fontSize: '24px', color: T.sCream
    }).setOrigin(0.5);

    this.add.text(cx, y + 26, 'ENDLESS  ' + GameState.endlessBest, {
      fontFamily: FONT, fontSize: '20px', color: T.sGold
    }).setOrigin(0.5);
  }

  buildLogo() {
    const cx = GAME_WIDTH / 2;
    const cy = 700;   // lower on the screen

    let logo;
    if (this.textures.exists('logo')) {
      logo = this.add.image(cx, cy, 'logo');
      fitToBox(logo, 1000, 720);          // bigger logo
    } else {
      logo = this.add.text(cx, cy, 'GELATO RUSH', {
        fontFamily: FONT,
        fontSize: '54px',
        color: T.sGold,
        align: 'center'
      }).setOrigin(0.5);
    }

    const targetScale = logo.scaleX || 1;
    logo.setScale(0);
    this.tweens.add({
      targets: logo,
      scale: targetScale,
      duration: 750,
      ease: 'Back.Out',
      onComplete: () => {
        const baseY = logo.y;
        this.tweens.add({
          targets: logo, y: baseY - 18, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut'
        });
      }
    });
  }

  buildButtons() {
    const cx = GAME_WIDTH / 2;

    makeButton(this, 'START', cx, 1300, 720, 150, T.brand, T.sEspresso, () => {
      GameState.selectedLevel = GameState.maxUnlockedLevel;
      this.scene.start('GameScene', { level: GameState.maxUnlockedLevel });
    }, 32);

    makeButton(this, 'ENDLESS MODE', cx, 1470, 720, 150, T.gold, T.sEspresso, () => {
      this.scene.start('EndlessGameScene');
    }, 28);

    if (GameState.maxUnlockedLevel > 1) {
      makeButton(this, 'SELECT LEVEL', cx, 1640, 720, 140, T.panelDark, T.sGold, () => {
        this.scene.start('LevelSelectScene');
      }, 26);
    }
  }
}

/* ========================================================================== */
/*  LevelSelectScene                                                          */
/* ========================================================================== */

class LevelSelectScene extends Phaser.Scene {
  constructor() { super('LevelSelectScene'); }

  create() {
    addCoverBackground(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1c120c, 0.45);

    this.input.once('pointerdown', tryPlayTheme);
    restoreTheme(this);

    // Moved down so it is not crowding the top edge.
    this.add.text(GAME_WIDTH / 2, 400, 'SELECT LEVEL', {
      fontFamily: FONT,
      fontSize: '42px',
      color: T.sGold
    }).setOrigin(0.5);

    this.buildGrid();

    makeButton(this, 'BACK', 190, 190, 240, 110, T.panelDark, T.sCream, () => {
      this.scene.start('MenuScene');
    }, 22);
  }

  buildGrid() {
    const cols = 2;
    const total = MAX_LEVEL + 1;          // + a "Coming Soon" level 11 teaser
    const rows = Math.ceil(total / cols);
    const cardW = 380;
    const gapX = 60;
    const gapY = 28;
    const top = 560;
    const bottom = 1800;
    const pitch = (bottom - top) / rows;
    const cardH = Math.min(200, pitch - gapY);

    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (GAME_WIDTH - totalW) / 2 + cardW / 2;

    for (let i = 0; i < total; i++) {
      const level = i + 1;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = top + row * pitch + cardH / 2;

      if (level > MAX_LEVEL) {
        this.buildComingSoonCard(x, y, cardW, cardH);
      } else {
        this.buildLevelCard(level, x, y, cardW, cardH, level <= GameState.maxUnlockedLevel);
      }
    }
  }

  /** Non-interactive teaser card for the next (not yet released) level. */
  buildComingSoonCard(x, y, w, h) {
    const g = this.add.graphics();
    g.fillStyle(T.panelDark, 0.92);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 34);
    g.lineStyle(6, T.goldDeep, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 34);

    const card = this.add.container(x, y, [g]);
    card.add(this.add.text(0, -22, '11', {
      fontFamily: FONT, fontSize: '46px', color: T.sGold
    }).setOrigin(0.5));
    card.add(this.add.text(0, 44, 'COMING SOON!', {
      fontFamily: FONT, fontSize: '15px', color: T.sCream
    }).setOrigin(0.5));
  }

  buildLevelCard(level, x, y, w, h, unlocked) {
    const g = this.add.graphics();
    g.fillStyle(unlocked ? T.cream : T.panelDark, unlocked ? 1 : 0.9);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 34);
    g.lineStyle(6, unlocked ? T.goldDeep : T.stone, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 34);

    const card = this.add.container(x, y, [g]);

    if (unlocked) {
      card.add(this.add.text(0, -18, String(level), {
        fontFamily: FONT, fontSize: '58px', color: T.sEspresso
      }).setOrigin(0.5));
      card.add(this.add.text(0, 60, 'LEVEL', {
        fontFamily: FONT, fontSize: '18px', color: '#7a6a52'
      }).setOrigin(0.5));

      addHitZone(this, x, y, w + 24, h + 24, () => {
        this.tweens.add({ targets: card, scaleX: 0.95, scaleY: 0.95, duration: 80, yoyo: true });
        playSfx(this, 'click');
        GameState.selectedLevel = level;
        this.scene.start('GameScene', { level: level });
      });
    } else {
      this.drawLock(card, 0, -10);
      card.add(this.add.text(0, 66, 'LOCKED', {
        fontFamily: FONT, fontSize: '18px', color: T.sStone
      }).setOrigin(0.5));
    }
  }

  drawLock(container, cx, cy) {
    const lock = this.add.graphics();
    lock.lineStyle(9, T.stone, 1);
    lock.beginPath();
    lock.arc(cx, cy - 20, 24, Math.PI, 2 * Math.PI, false);
    lock.strokePath();
    lock.fillStyle(T.stone, 1);
    lock.fillRoundedRect(cx - 34, cy - 8, 68, 56, 10);
    lock.fillStyle(T.panelDark, 1);
    lock.fillCircle(cx, cy + 12, 8);
    lock.fillRoundedRect(cx - 4, cy + 12, 8, 18, 3);
    container.add(lock);
  }
}

/* ========================================================================== */
/*  GameScene                                                                 */
/* ========================================================================== */

class GameScene extends Phaser.Scene {
  constructor(key) { super(key || 'GameScene'); }

  init(data) {
    this.level = Phaser.Math.Clamp((data && data.level) || 1, 1, MAX_LEVEL);
    this.config = getLevelConfig(this.level);

    this.target = this.config.target;
    this.patienceDuration = this.config.patience;
    this.maxStack = this.config.maxStack;

    this.ordersCleared = 0;
    this.score = 0;

    this.order = [];
    this.playerStack = [];
    this.playerScoops = [];

    this.patience = 1;
    this.draining = false;
    this.lowPatience = false;
    this.isResolving = false;

    this.customer = null;
    this.pulseTween = null;
    this.scoopButtons = [];
    this.customerGender = 'male';

    // Last-second urgency cues.
    this.almostFailPlayed = false;
    this.urgencyRect = null;
    this.urgencyTween = null;

    // One revive per game attempt.
    this.hasRevived = false;
  }

  create() {
    this.input.addPointer(2);
    this.input.topOnly = true;
    this.input.once('pointerdown', tryPlayTheme);

    this.activeFlavors = SCOOP_KEYS
      .map((k, i) => i)
      .filter((i) => this.textures.exists(SCOOP_KEYS[i]))
      .slice(0, this.config.flavors);

    this.activeCharacters = CHARACTER_POOL
      .filter((k) => this.textures.exists(k))
      .slice(0, this.config.characters);

    this.createBackground();
    this.createOrderTicket();
    this.createCone();
    this.createStackContainer();
    this.createControlPanel();
    this.createPatienceBar();
    this.createHud();
    this.updateHud();

    // Make sure the main theme is playing from the start of gameplay.
    tryPlayTheme();
    restoreTheme(this);

    // Count down before the level actually begins.
    this.beginCountdown(() => this.startCustomer());
  }

  /**
   * 3..2..1..GO! countdown. Input is blocked and patience is frozen while it
   * runs. Used at level start, after Restart, and after a Revive.
   */
  beginCountdown(onDone) {
    this.draining = false;
    this.isResolving = true;   // blocks scoop input

    playSfx(this, 'start', { volume: 0.5 });

    const steps = ['3', '2', '1', 'GO!'];
    let index = 0;

    const tick = () => {
      if (index >= steps.length) {
        if (onDone) onDone();
        return;
      }

      const label = steps[index];
      const isGo = label === 'GO!';

      // 3, 2, 1 each tick the gelato sound; GO! brings in the first cone.
      playSfx(this, isGo ? 'newcone' : 'scoop');

      const txt = this.add.text(GAME_WIDTH / 2, 800, label, {
        fontFamily: FONT,
        fontSize: '150px',
        color: isGo ? T.sGreen : T.sGold,
        stroke: '#1c120c',
        strokeThickness: 20
      }).setOrigin(0.5).setDepth(80).setScale(0.2);

      this.tweens.add({ targets: txt, scale: 1, duration: 220, ease: 'Back.Out' });
      this.tweens.add({
        targets: txt, alpha: 0, duration: 200, delay: isGo ? 360 : 430,
        onComplete: () => txt.destroy()
      });

      index++;
      this.time.delayedCall(isGo ? 600 : 660, tick);
    };

    tick();
  }

  createBackground() {
    addCoverBackground(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1c120c, 0.16);
  }

  createOrderTicket() {
    const card = this.add.graphics().setDepth(4);
    card.fillStyle(T.cream, 0.97);
    card.fillRoundedRect(ORDER_CARD_X, ORDER_CARD_Y, ORDER_CARD_W, ORDER_CARD_H, 36);
    card.lineStyle(6, T.goldDeep, 1);
    card.strokeRoundedRect(ORDER_CARD_X, ORDER_CARD_Y, ORDER_CARD_W, ORDER_CARD_H, 36);

    this.add.text(ORDER_CARD_CX, ORDER_CARD_Y + 52, 'ORDER', {
      fontFamily: FONT, fontSize: '28px', color: T.sEspresso
    }).setOrigin(0.5).setDepth(5);

    const divider = this.add.graphics().setDepth(5);
    divider.lineStyle(4, T.goldDeep, 0.55);
    divider.lineBetween(ORDER_CARD_X + 46, ORDER_CARD_Y + 92,
                        ORDER_CARD_X + ORDER_CARD_W - 46, ORDER_CARD_Y + 92);

    this.orderContainer = this.add.container(0, 0).setDepth(5);
  }

  createCone() {
    const cone = this.add.image(CONE_X, CONE_Y, 'cone').setDepth(6);
    fitToBox(cone, CONE_SIZE, CONE_SIZE);
  }

  createStackContainer() {
    this.stackContainer = this.add.container(CONE_X, 0).setDepth(7);
  }

  createHud() {
    this.add.rectangle(GAME_WIDTH / 2, 78, GAME_WIDTH, 156, 0x1c120c, 0.4).setDepth(19);

    const style = {
      fontFamily: FONT,
      fontSize: '22px',
      color: T.sCream
    };

    // Home button (top-left) -> main menu.
    makeHomeButton(this, () => this.scene.start('MenuScene'));

    this.levelText = this.add.text(150, 44, '', style).setDepth(20);
    this.ordersText = this.add.text(150, 96, '', style).setDepth(20);

    this.scoreText = this.add.text(GAME_WIDTH - 40, 44, '', {
      ...style, color: T.sGold
    }).setOrigin(1, 0).setDepth(20);
  }

  updateHud() {
    this.levelText.setText('LEVEL ' + this.level);
    this.ordersText.setText('ORDERS ' + this.ordersCleared + '/' + this.target);
    this.scoreText.setText('SCORE ' + this.score);
  }

  createPatienceBar() {
    this.patienceContainer = this.add.container(PATIENCE_X, PATIENCE_Y).setDepth(15);

    const bg = this.add.graphics();
    bg.fillStyle(T.barTrack, 0.62);
    bg.fillRoundedRect(-PATIENCE_TRACK_W / 2, -22, PATIENCE_TRACK_W, 44, 22);
    bg.lineStyle(4, T.gold, 0.75);
    bg.strokeRoundedRect(-PATIENCE_TRACK_W / 2, -22, PATIENCE_TRACK_W, 44, 22);

    this.patienceFill = this.add.graphics();
    this.patienceContainer.add([bg, this.patienceFill]);
  }

  createControlPanel() {
    const count = this.activeFlavors.length;
    const singleRow = count <= 5;
    const size = singleRow ? 200 : 170;
    const gap = 16;
    const cols = singleRow ? count : 5;
    const rows = singleRow ? 1 : Math.ceil(count / cols);
    const margin = 34;

    const panelH = rows * size + (rows - 1) * gap + margin * 2;
    const panelY = GAME_HEIGHT - 20 - panelH;

    const panel = this.add.graphics().setDepth(10);
    panel.fillStyle(T.panel, 0.96);
    panel.fillRoundedRect(30, panelY, GAME_WIDTH - 60, panelH, 44);
    panel.lineStyle(6, T.goldDeep, 1);
    panel.strokeRoundedRect(30, panelY, GAME_WIDTH - 60, panelH, 44);

    for (let r = 0; r < rows; r++) {
      const rowStartIndex = r * cols;
      const rowItems = Math.min(cols, count - rowStartIndex);
      if (rowItems <= 0) break;

      const totalW = rowItems * size + (rowItems - 1) * gap;
      const startX = (GAME_WIDTH - totalW) / 2 + size / 2;
      const y = panelY + margin + size / 2 + r * (size + gap);

      for (let c = 0; c < rowItems; c++) {
        const flavorIndex = this.activeFlavors[rowStartIndex + c];
        const x = startX + c * (size + gap);
        this.createScoopButton(x, y, flavorIndex, size);
      }
    }
  }

  createScoopButton(x, y, flavorIndex, size) {
    const bg = this.add.graphics();
    bg.fillStyle(T.cream, 1);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, 30);
    bg.lineStyle(5, T.goldDeep, 1);
    bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 30);

    const image = this.add.image(0, 0, SCOOP_KEYS[flavorIndex]);
    fitToBox(image, size - 34, size - 34);

    const button = this.add.container(x, y, [bg, image]).setDepth(11);
    this.scoopButtons.push(button);

    addHitZone(this, x, y, size + 24, size + 24,
      () => this.onScoopTapped(flavorIndex, button));
  }

  /* -- Customer / order ------------------------------------------------ */

  startCustomer() {
    this.isResolving = false;
    this.playerStack = [];
    this.clearPlayerStack();
    this.stopPatiencePulse();
    this.stopUrgency();

    if (this.customer) { this.customer.destroy(); this.customer = null; }

    const key = Phaser.Utils.Array.GetRandom(this.activeCharacters);
    this.customerGender = key.indexOf('female_') === 0 ? 'female' : 'male';

    this.customer = this.add.image(CUSTOMER_X, CUSTOMER_Y - 180, key)
      .setDepth(5)
      .setAlpha(0);
    fitToHeight(this.customer, CUSTOMER_H);

    this.tweens.add({
      targets: this.customer, y: CUSTOMER_Y, alpha: 1, duration: 460, ease: 'Back.Out'
    });

    this.buildOrder();
    this.renderOrder();

    this.patience = 1;
    this.lowPatience = false;
    this.patienceContainer.setAlpha(1);
    this.updatePatienceVisual();

    this.draining = true;
  }

  buildOrder() {
    const maxCount = Math.min(this.maxStack, this.activeFlavors.length);
    const count = Phaser.Math.Between(2, Math.max(2, maxCount));

    // Random *with replacement*: the same flavour may appear more than once in
    // a single stack (e.g. chocolate, chocolate, vanilla).
    const order = [];
    for (let i = 0; i < count; i++) {
      order.push(Phaser.Utils.Array.GetRandom(this.activeFlavors));
    }
    this.order = order;
  }

  renderOrder() {
    this.orderContainer.removeAll(true);

    const count = this.order.length;
    const baseY = ORDER_CENTER_Y + (count - 1) * ORDER_SPACING / 2;

    this.order.forEach((flavorIndex, i) => {
      const y = baseY - i * ORDER_SPACING;

      const img = this.add.image(ORDER_CARD_CX, y, SCOOP_KEYS[flavorIndex]);
      const targetScale = fitToBox(img, ORDER_SCOOP_SIZE, ORDER_SCOOP_SIZE);
      img.setScale(0);
      this.orderContainer.add(img);
      this.tweens.add({
        targets: img, scaleX: targetScale, scaleY: targetScale,
        duration: 260, delay: i * 90, ease: 'Back.Out'
      });

      const badge = this.add.container(ORDER_CARD_CX - ORDER_SCOOP_SIZE / 2 - 26, y);
      badge.add(this.add.circle(0, 0, 24, T.goldDeep));
      badge.add(this.add.text(0, 0, String(i + 1), {
        fontFamily: FONT, fontSize: '18px', color: T.sEspresso
      }).setOrigin(0.5));
      badge.setScale(0);
      this.orderContainer.add(badge);
      this.tweens.add({
        targets: badge, scale: 1, duration: 220, delay: i * 90 + 120, ease: 'Back.Out'
      });
    });
  }

  /* -- Input ----------------------------------------------------------- */

  onScoopTapped(flavorIndex, button) {
    if (this.isResolving || !this.draining) return;
    if (this.playerStack.length >= this.order.length) return;

    playSfx(this, 'scoop');

    this.tweens.add({
      targets: button, scaleX: 1.14, scaleY: 1.14, duration: 90, yoyo: true, ease: 'Quad.Out'
    });

    this.pushScoopOnCone(flavorIndex, this.playerStack.length);
    this.playerStack.push(flavorIndex);
    this.checkStack();
  }

  pushScoopOnCone(flavorIndex, position) {
    const y = PLAYER_STACK_BASE_Y - position * PLAYER_STACK_SPACING;
    const img = this.add.image(0, y, SCOOP_KEYS[flavorIndex]);

    const targetScale = fitToBox(img, PLAYER_SCOOP_SIZE, PLAYER_SCOOP_SIZE);
    img.setScale(0);
    this.stackContainer.add(img);
    this.playerScoops.push(img);

    this.tweens.add({
      targets: img, scaleX: targetScale, scaleY: targetScale, duration: 180, ease: 'Back.Out'
    });
  }

  clearPlayerStack() {
    this.playerScoops.forEach((s) => s.destroy());
    this.playerScoops = [];
    this.stackContainer.setPosition(CONE_X, 0).setAlpha(1);
  }

  /* -- Validation ------------------------------------------------------ */

  checkStack() {
    const last = this.playerStack.length - 1;

    if (this.playerStack[last] !== this.order[last]) {
      this.onFail('WRONG ORDER');
      return;
    }

    if (this.playerStack.length === this.order.length) {
      this.succeed();
    }
  }

  succeed() {
    this.isResolving = true;
    this.draining = false;
    this.stopPatiencePulse();
    this.stopUrgency();

    // Whole order complete: reward chime + a character voice, then +points.
    playSfx(this, 'correct');
    playVoice(this, this.customerGender);

    const gained = this.order.length * 50 * this.level;
    this.score += gained;
    this.ordersCleared++;
    this.updateHud();

    this.playSuccessEffects(gained);

    this.tweens.add({
      targets: this.stackContainer, y: this.stackContainer.y - 140, alpha: 0,
      duration: 420, ease: 'Cubic.In'
    });

    this.time.delayedCall(820, () => {
      this.clearPlayerStack();

      if (this.ordersCleared >= this.target) {
        this.levelClear();
      } else {
        playSfx(this, 'newcone');
        this.startCustomer();
      }
    });
  }

  levelClear() {
    this.isResolving = true;
    this.draining = false;
    if (this.customer) this.tweens.add({ targets: this.customer, alpha: 0, duration: 300 });
    this.showBanner('LEVEL ' + this.level + ' CLEAR!', T.sGold);

    this.time.delayedCall(950, () => {
      showAdOverlay(this, 'Playing TikTok Level-Clear Ad...', () => {
        const next = this.level + 1;

        if (next <= MAX_LEVEL) {
          GameState.maxUnlockedLevel = Math.max(GameState.maxUnlockedLevel, next);
          saveMaxLevel();
          this.scene.start('GameScene', { level: next });
        } else {
          GameState.maxUnlockedLevel = MAX_LEVEL;
          saveMaxLevel();
          this.scene.start('LevelSelectScene');
        }
      });
    });
  }

  playSuccessEffects(gained) {
    // The +points popup appears: make sure the "almost fail" warning is cut.
    stopAlmostFail();

    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT, T.green, 0.26).setDepth(60);
    this.tweens.add({ targets: flash, alpha: 0, duration: 520, onComplete: () => flash.destroy() });

    // Big, punchy score popup that hangs around long enough to read.
    const bonus = this.add.text(GAME_WIDTH / 2, 900, '+' + gained, {
      fontFamily: FONT,
      fontSize: '92px',
      color: '#eafbe0',
      stroke: '#2f4a26',
      strokeThickness: 16
    }).setOrigin(0.5).setDepth(62).setScale(0.3);

    // Pop in with overshoot...
    this.tweens.add({
      targets: bonus, scale: 1.18, duration: 260, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({ targets: bonus, scale: 1.0, duration: 150, ease: 'Quad.Out' });
      }
    });

    // ...hold, then drift up and fade.
    this.tweens.add({
      targets: bonus, y: 680, alpha: 0, delay: 900, duration: 720, ease: 'Cubic.In',
      onComplete: () => bonus.destroy()
    });
  }

  showBanner(text, color) {
    const banner = this.add.text(GAME_WIDTH / 2, 860, text, {
      fontFamily: FONT, fontSize: '42px', color: color || T.sGold,
      align: 'center', wordWrap: { width: 900 }
    }).setOrigin(0.5).setDepth(61).setScale(0);

    this.tweens.add({
      targets: banner, scale: 1, duration: 300, ease: 'Back.Out',
      yoyo: true, hold: 620, onComplete: () => banner.destroy()
    });
  }

  /**
   * Wrong scoop or timeout. Always heads to the Game Over screen; the
   * behind-the-scenes free revive is offered there.
   */
  onFail(reason) {
    if (this.isResolving) return;
    this.isResolving = true;
    this.draining = false;
    this.stopPatiencePulse();
    this.stopUrgency();
    this.cameras.main.shake(260, 0.012);
    playFail(this);

    if (this.customer) {
      this.tweens.add({
        targets: this.customer, angle: 6, duration: 60, yoyo: true, repeat: 3,
        onComplete: () => { if (this.customer) this.customer.setAngle(0); }
      });
    }

    this.time.delayedCall(560, () => {
      if (this.score > GameState.bestScore) {
        GameState.bestScore = this.score;
        saveBestScore();
      }
      this.scene.pause();
      this.scene.launch('GameOverScene', {
        level: this.level,
        score: this.score,
        cleared: this.ordersCleared,
        target: this.target,
        canRevive: !this.hasRevived
      });
    });
  }

  /** Resumes the current level after a revive (ad or free token). */
  revive() {
    this.hasRevived = true;   // only one revive per game attempt
    restoreTheme(this);
    this.playerStack = [];
    this.clearPlayerStack();

    this.patience = 1;
    this.lowPatience = false;
    this.patienceContainer.setAlpha(1);
    this.updatePatienceVisual();

    if (this.customer) this.customer.setAngle(0);

    // Count down, then continue the same order.
    this.beginCountdown(() => {
      this.isResolving = false;
      this.draining = true;
    });
  }

  /* -- Patience -------------------------------------------------------- */

  updatePatienceVisual() {
    const p = Phaser.Math.Clamp(this.patience, 0, 1);
    const w = PATIENCE_FILL_W * p;
    const color = p < 0.2 ? T.red : (p < 0.5 ? T.amber : T.green);

    this.patienceFill.clear();
    if (w > 4) {
      this.patienceFill.fillStyle(color, 1);
      this.patienceFill.fillRoundedRect(-PATIENCE_FILL_W / 2, -15, w, 30, 15);
    }

    if (p < 0.2) {
      if (!this.lowPatience) {
        this.lowPatience = true;
        this.pulseTween = this.tweens.add({
          targets: this.patienceContainer, alpha: 0.4, duration: 220, yoyo: true, repeat: -1
        });
      }
    } else if (this.lowPatience) {
      this.stopPatiencePulse();
    }
  }

  stopPatiencePulse() {
    if (this.pulseTween) { this.pulseTween.stop(); this.pulseTween = null; }
    this.patienceContainer.setAlpha(1);
    this.lowPatience = false;
  }

  update(time, delta) {
    if (!this.draining) return;

    this.patience -= delta / this.patienceDuration;

    if (this.patience <= 0) {
      this.patience = 0;
      this.updatePatienceVisual();
      this.onFail('TIME UP');
      return;
    }

    // Last second of patience: extra urgency + the "almost fail" cue.
    const remainMs = this.patience * this.patienceDuration;
    if (!this.almostFailPlayed && remainMs <= 1000) {
      this.almostFailPlayed = true;
      playSfx(this, 'almostfail');
      this.startUrgency();
    }

    this.updatePatienceVisual();
  }

  /* -- Last-second urgency --------------------------------------------- */

  startUrgency() {
    if (this.urgencyRect) return;
    this.urgencyRect = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff2a1a, 0.06
    ).setDepth(65);
    this.urgencyTween = this.tweens.add({
      targets: this.urgencyRect,
      alpha: 0.20,
      duration: 130,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  stopUrgency() {
    if (this.urgencyTween) { this.urgencyTween.stop(); this.urgencyTween = null; }
    if (this.urgencyRect) { this.urgencyRect.destroy(); this.urgencyRect = null; }
    this.almostFailPlayed = false;
    stopAlmostFail();
  }
}

/* ========================================================================== */
/*  EndlessGameScene                                                          */
/* ========================================================================== */

/**
 * Endless mode reuses all of GameScene's plumbing (countdown, cone, order
 * ticket, dynamic buttons, urgency, theme ducking, etc.) and only overrides
 * what differs: an all-flavours/all-characters pool, a lives system, a
 * shrinking patience curve, and no fixed target.
 */
class EndlessGameScene extends GameScene {
  constructor() { super('EndlessGameScene'); }

  init(data) {
    this.mode = 'endless';

    // Config mirrors a level but with everything unlocked and no target.
    this.level = 1;
    this.config = {
      target: Infinity,
      flavors: SCOOP_KEYS.length,
      characters: CHARACTER_POOL.length,
      maxStack: 4,
      patience: ENDLESS_START_PATIENCE
    };

    this.target = Infinity;
    this.patienceDuration = ENDLESS_START_PATIENCE;
    this.maxStack = 4;

    this.ordersCleared = 0;
    this.score = 0;
    this.lives = ENDLESS_LIVES;
    this.served = 0;

    this.order = [];
    this.playerStack = [];
    this.playerScoops = [];
    this.patience = 1;
    this.draining = false;
    this.lowPatience = false;
    this.isResolving = false;

    this.customer = null;
    this.pulseTween = null;
    this.scoopButtons = [];
    this.customerGender = 'male';

    this.almostFailPlayed = false;
    this.urgencyRect = null;
    this.urgencyTween = null;
  }

  /* -- HUD: ENDLESS label, score, hearts --------------------------------- */

  createHud() {
    this.add.rectangle(GAME_WIDTH / 2, 78, GAME_WIDTH, 156, 0x1c120c, 0.4).setDepth(19);

    makeHomeButton(this, () => this.scene.start('MenuScene'));

    const style = { fontFamily: FONT, fontSize: '22px', color: T.sCream };

    this.add.text(150, 44, 'ENDLESS', style).setDepth(20);
    this.scoreText = this.add.text(GAME_WIDTH - 40, 44, '', {
      ...style, color: T.sGold
    }).setOrigin(1, 0).setDepth(20);

    this.livesContainer = this.add.container(150, 108).setDepth(20);
    this.updateHud();
  }

  updateHud() {
    if (this.scoreText) this.scoreText.setText('SCORE ' + this.score);
    this.renderLives();
  }

  renderLives() {
    if (!this.livesContainer) return;
    this.livesContainer.removeAll(true);

    const g = this.add.graphics();
    for (let i = 0; i < ENDLESS_LIVES; i++) {
      const filled = i < this.lives;
      drawHeart(g, i * 52, 0, 20, filled ? T.red : 0x4a3a30);
    }
    this.livesContainer.add(g);
  }

  /* -- Patience curve --------------------------------------------------- */

  /** Recompute patience from how many customers have been served so far. */
  currentPatienceMs() {
    return Math.max(
      ENDLESS_MIN_PATIENCE,
      ENDLESS_START_PATIENCE - this.served * ENDLESS_PATIENCE_STEP
    );
  }

  startCustomer() {
    this.patienceDuration = this.currentPatienceMs();
    super.startCustomer();
  }

  /* -- Scoring / progression ------------------------------------------- */

  succeed() {
    this.isResolving = true;
    this.draining = false;
    this.stopPatiencePulse();
    this.stopUrgency();

    // Reward chime + character voice, then the +points popup.
    playSfx(this, 'correct');
    playVoice(this, this.customerGender);

    const gained = this.order.length * 50 * (1 + Math.floor(this.served / 5));
    this.score += gained;
    this.served++;
    this.ordersCleared++;
    this.updateHud();

    this.playSuccessEffects(gained);

    this.tweens.add({
      targets: this.stackContainer, y: this.stackContainer.y - 140, alpha: 0,
      duration: 420, ease: 'Cubic.In'
    });

    this.time.delayedCall(820, () => {
      this.clearPlayerStack();
      playSfx(this, 'newcone');
      this.startCustomer();
    });
  }

  /* -- Penalty: lose a life, continue instantly (or game over) ---------- */

  onFail(reason) {
    if (this.isResolving) return;
    this.isResolving = true;
    this.draining = false;
    this.stopPatiencePulse();
    this.stopUrgency();

    playFail(this);
    this.cameras.main.shake(280, 0.016);

    // Quick red flash so the mistake reads clearly.
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH, GAME_HEIGHT, T.red, 0.32).setDepth(66);
    this.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });

    this.lives--;
    this.updateHud();
    this.playerStack = [];
    this.clearPlayerStack();

    if (this.lives <= 0) {
      this.time.delayedCall(560, () => this.endlessGameOver());
      return;
    }

    // Spawn the next customer almost immediately.
    this.time.delayedCall(520, () => {
      playSfx(this, 'newcone');
      this.startCustomer();
    });
  }

  endlessGameOver() {
    if (this.score > GameState.endlessBest) {
      GameState.endlessBest = this.score;
      saveEndlessBest();
    }

    this.scene.pause();
    this.scene.launch('GameOverScene', {
      mode: 'endless',
      score: this.score,
      served: this.served,
      best: GameState.endlessBest
    });
  }
}

/* ========================================================================== */
/*  GameOverScene                                                             */
/* ========================================================================== */

class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  init(data) {
    data = data || {};
    this.mode = data.mode || 'campaign';   // 'campaign' | 'endless'
    this.level = data.level || 1;
    this.score = data.score || 0;
    this.cleared = data.cleared || 0;      // orders cleared (campaign)
    this.target = data.target || 0;
    this.served = data.served || 0;        // customers served (endless)
    this.best = data.best || 0;
    this.canRevive = data.canRevive !== false;
    this.busy = false;
  }

  create() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x140d09, 0.88)
      .setDepth(0);

    this.input.once('pointerdown', tryPlayTheme);
    duckTheme(this);   // soften the music while the menu is up

    // Home / Levels must also tear down the paused gameplay scene underneath.
    makeHomeButton(this, () => this.leaveTo('MenuScene'));

    this.buildPanel();

    if (this.mode === 'endless') {
      makeButton(this, 'RESTART', GAME_WIDTH / 2, 1040, 760, 130, T.brand, T.sEspresso,
        () => this.onEndlessRestart(), 30);
      makeButton(this, 'LEVELS', GAME_WIDTH / 2, 1200, 760, 130, T.panelDark, T.sGold,
        () => this.leaveTo('LevelSelectScene'), 30);
      makeButton(this, 'MENU', GAME_WIDTH / 2, 1360, 760, 130, T.panelDark, T.sGold,
        () => this.leaveTo('MenuScene'), 30);
    } else {
      makeButton(this, 'RESTART', GAME_WIDTH / 2, 1040, 760, 130, T.brand, T.sEspresso,
        () => this.onRestart(), 30);

      if (this.canRevive) {
        // Watch-ad revive; becomes a free revive if a hidden token is available.
        const reviveLabel = GameState.reviveTokens > 0 ? 'REVIVE (FREE!)' : 'WATCH AD TO REVIVE';
        makeButton(this, reviveLabel, GAME_WIDTH / 2, 1200, 760, 130, T.greenDeep, T.sCream,
          () => this.onRevive(), 24);

        makeButton(this, 'LEVELS', GAME_WIDTH / 2, 1360, 760, 130, T.panelDark, T.sGold,
          () => this.onLevelSelect(), 30);
      } else {
        // Already used the single revive this attempt: no revive option.
        makeButton(this, 'LEVELS', GAME_WIDTH / 2, 1200, 760, 130, T.panelDark, T.sGold,
          () => this.onLevelSelect(), 30);

        makeButton(this, 'MENU', GAME_WIDTH / 2, 1360, 760, 130, T.panelDark, T.sGold,
          () => this.leaveTo('MenuScene'), 30);
      }
    }
  }

  buildPanel() {
    const panel = this.add.container(GAME_WIDTH / 2, 920).setDepth(10);

    const g = this.add.graphics();
    g.fillStyle(T.panel, 0.99);
    g.fillRoundedRect(-450, -560, 900, 1120, 48);
    g.lineStyle(8, T.goldDeep, 1);
    g.strokeRoundedRect(-450, -560, 900, 1120, 48);
    panel.add(g);

    panel.add(this.add.text(0, -470, this.mode === 'endless' ? 'ENDLESS OVER' : 'GAME OVER', {
      fontFamily: FONT, fontSize: '40px', color: T.sRed
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -370,
      this.mode === 'endless' ? 'CUSTOMERS ' + this.served : 'LEVEL ' + this.level, {
      fontFamily: FONT, fontSize: '26px', color: T.sCream
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -290, 'SCORE', {
      fontFamily: FONT, fontSize: '20px', color: T.sCreamDim
    }).setOrigin(0.5));
    panel.add(this.add.text(0, -210, String(this.score), {
      fontFamily: FONT, fontSize: '56px', color: T.sGold
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -110,
      this.mode === 'endless'
        ? 'BEST: ' + this.best
        : 'ORDERS: ' + this.cleared + ' / ' + this.target, {
      fontFamily: FONT, fontSize: '22px', color: T.sCream
    }).setOrigin(0.5));

    if (this.mode !== 'endless') {
      panel.add(this.add.text(0, -20, 'BEST: ' + GameState.bestScore, {
        fontFamily: FONT, fontSize: '22px', color: T.sCreamDim
      }).setOrigin(0.5));
    }
  }

  /**
   * Leaves Game Over for another scene, first stopping the paused gameplay
   * scene (otherwise it keeps rendering on top of, and blocking, the new one).
   */
  leaveTo(key) {
    if (this.busy) return;
    this.scene.stop('GameScene');
    this.scene.stop('EndlessGameScene');
    this.scene.start(key);
  }

  /* -- Actions --------------------------------------------------------- */

  onRestart() {
    if (this.busy) return;
    GameState.restartCount++;

    // Rule B: every 3rd restart plays a penalty ad and grants a hidden token.
    if (GameState.restartCount % 3 === 0) {
      this.busy = true;
      showAdOverlay(this, 'Playing TikTok Penalty/Revive Ad...', () => {
        GameState.reviveTokens++;
        saveTokens();
        this.scene.start('GameScene', { level: this.level });
      });
    } else {
      this.scene.start('GameScene', { level: this.level });
    }
  }

  onEndlessRestart() {
    if (this.busy) return;
    this.scene.start('EndlessGameScene');
  }

  onRevive() {
    if (this.busy) return;

    if (GameState.reviveTokens > 0) {
      // Hidden free revive.
      GameState.reviveTokens--;
      saveTokens();
      this.resumeGame();
    } else {
      this.busy = true;
      showAdOverlay(this, 'Playing TikTok Revive Ad...', () => this.resumeGame());
    }
  }

  resumeGame() {
    const gs = this.scene.get('GameScene');
    this.scene.resume('GameScene');
    if (gs && typeof gs.revive === 'function') gs.revive();
    this.scene.stop();
  }

  onLevelSelect() {
    this.leaveTo('LevelSelectScene');
  }
}

/* ========================================================================== */
/*  Phaser bootstrap                                                          */
/* ========================================================================== */

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#241a15',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  // Load images via <img> tags instead of XHR so textures still load when the
  // game is opened directly from disk (file://), where XHR is blocked.
  loader: { imageLoadType: 'HTMLImageElement' },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },
  input: { activePointers: 3 },
  scene: [PreloaderScene, SplashScene, MenuScene, LevelSelectScene, GameScene, EndlessGameScene, GameOverScene]
};

// eslint-disable-next-line no-unused-vars
const game = new Phaser.Game(config);

// Safety net: if autoplay was blocked, the theme starts on the first gesture.
['pointerdown', 'touchstart', 'keydown'].forEach((evt) => {
  window.addEventListener(evt, tryPlayTheme, { once: true, passive: true });
});
