/**
 * GameScene 遊戲流程測試（真實實作）
 * 以輕量 Phaser 替身跑完整的 create()，驗證關卡載入、地圖建立、
 * 玩家 / 敵人生成、輸入、每幀更新、勝負流程與清理
 */

import GameScene from '../../src/scenes/GameScene';
import Bullet from '../../src/entities/Bullet';
import BrickWall from '../../src/entities/BrickWall';
import SteelWall from '../../src/entities/SteelWall';
import Water from '../../src/entities/Water';
import Ice from '../../src/entities/Ice';
import Forest from '../../src/entities/Forest';
import EnemyTank from '../../src/entities/EnemyTank';
import PlayerTank from '../../src/entities/PlayerTank';
import PowerUp from '../../src/entities/PowerUp';
import Phaser from 'phaser';
import SaveManager from '../../src/managers/SaveManager';
import { PALETTE } from '../../src/utils/UITheme';
import {
  SCENES,
  GAME_CONFIG,
  TANK_CONFIG,
  TILE_TYPES,
  EVENTS
} from '../../src/utils/Constants';

const TILE = GAME_CONFIG.TILE_SIZE;
const OFFSET_Y = GAME_CONFIG.PLAY_OFFSET_Y;
const toWorld = (gx, gy) => ({ x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 + OFFSET_Y });

/** 任何方法呼叫都回傳自己的顯示物件替身（setOrigin().setDepth()...） */
const makeDisplayObject = (kind, args) => {
  const target = { kind, args, calls: [], destroyed: false };
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      // 未設定的私有標記（如 __baseAlpha）與 thenable 檢查維持 undefined
      if (typeof prop === 'symbol' || prop === 'then' || prop.startsWith('__')) return undefined;
      return (...callArgs) => {
        obj.calls.push([prop, ...callArgs]);
        if (prop === 'destroy') obj.destroyed = true;
        return proxy;
      };
    }
  });
  return proxy;
};

const makeGroup = () => {
  const children = [];
  return {
    children,
    add: jest.fn((obj) => { children.push(obj); return obj; }),
    remove: jest.fn((obj) => {
      const i = children.indexOf(obj);
      if (i !== -1) children.splice(i, 1);
    }),
    clear: jest.fn(() => { children.length = 0; }),
    getChildren: () => children
  };
};

const makeKey = () => ({ isDown: false, timeDown: 0, on: jest.fn() });

/**
 * 建立帶有 Phaser 系統替身的 GameScene
 */
const makeGameScene = ({ levelData = null, now = 1000 } = {}) => {
  const scene = new GameScene();
  const timers = [];

  scene.add = {
    existing: jest.fn(),
    group: jest.fn(makeGroup),
    rectangle: jest.fn((...args) => makeDisplayObject('rectangle', args)),
    graphics: jest.fn((...args) => makeDisplayObject('graphics', args)),
    text: jest.fn((...args) => makeDisplayObject('text', args)),
    circle: jest.fn((...args) => makeDisplayObject('circle', args))
  };
  scene.physics = {
    world: {
      setBounds: jest.fn(),
      bounds: { contains: () => true }
    },
    add: {
      existing: jest.fn(),
      group: jest.fn(makeGroup),
      staticGroup: jest.fn(makeGroup),
      collider: jest.fn(),
      overlap: jest.fn()
    }
  };
  scene.time = {
    now,
    delayedCall: jest.fn((delay, callback) => {
      const timer = { delay, callback, remove: jest.fn() };
      timers.push(timer);
      return timer;
    })
  };
  scene.timers = timers;
  scene.tweens = { add: jest.fn(), killTweensOf: jest.fn() };
  scene.events = { once: jest.fn(), on: jest.fn(), off: jest.fn(), emit: jest.fn() };
  scene.cache = {
    json: {
      exists: jest.fn(() => levelData !== null),
      get: jest.fn(() => levelData)
    },
    audio: { exists: jest.fn(() => true) }
  };
  scene.sound = {
    play: jest.fn(),
    add: jest.fn(() => ({ play: jest.fn(), stop: jest.fn(), destroy: jest.fn() }))
  };
  scene.scene = { start: jest.fn(), pause: jest.fn(), launch: jest.fn() };
  scene.cameras = { main: { shake: jest.fn() } };
  scene.input = {
    keyboard: {
      createCursorKeys: jest.fn(() => ({
        up: makeKey(),
        down: makeKey(),
        left: makeKey(),
        right: makeKey()
      })),
      addKey: jest.fn(makeKey)
    }
  };

  return scene;
};

const emptyMap = () => Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));

const makeLevel = (overrides = {}) => ({
  levelNumber: 2,
  playerSpawn: { x: 8, y: 24 },
  basePosition: { x: 12, y: 24 },
  enemySpawns: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 24, y: 0 }],
  enemyWaves: [
    { type: 'BASIC', count: 2 },
    { type: 'FAST', count: 1 }
  ],
  map: emptyMap(),
  specialRules: { maxEnemiesOnScreen: 2 },
  ...overrides
});

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GameScene.init', () => {
  test('應該保存關卡與上一關傳來的玩家狀態', () => {
    const scene = new GameScene();
    scene.init({ level: 3, lives: 2, starLevel: 4 });

    expect(scene.sceneConfig).toEqual({ key: SCENES.GAME });
    expect(scene.currentLevel).toBe(3);
    expect(scene.savedLives).toBe(2);
    expect(scene.savedStarLevel).toBe(4);
    expect(scene.uiVisible).toBe(true);
    expect(scene.uiElements).toEqual([]);
  });

  test('缺值時從第 1 關開始且不恢復玩家狀態', () => {
    const scene = new GameScene();
    scene.init({});

    expect(scene.currentLevel).toBe(1);
    expect(scene.savedLives).toBeNull();
    expect(scene.savedStarLevel).toBeNull();
  });
});

describe('GameScene.create - 完整建立流程', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test('物理世界邊界應該限制在 HUD 之間的遊戲場', () => {
    expect(scene.physics.world.setBounds)
      .toHaveBeenCalledWith(0, OFFSET_Y, GAME_CONFIG.WIDTH, GAME_CONFIG.PLAY_HEIGHT);
  });

  test('應該初始化各系統與遊戲狀態', () => {
    expect(scene.saveManager.load().gamesPlayed).toBe(1);
    expect(scene.audioManager.scene).toBe(scene);
    expect(scene.collisionSystem.scene).toBe(scene);
    expect(scene.collisionSystem.playerGroup).not.toBeNull();
    expect(scene.aiBlackboard.scene).toBe(scene);
    expect(scene.bulletPool.getStats()).toMatchObject({ maxSize: 50 });
    expect(scene.bulletPool.pool[0]).toBeInstanceOf(Bullet);
    expect(scene.gameState).toMatchObject({
      score: 0,
      lives: 3,
      level: 2,
      enemiesRemaining: 3,
      enemiesKilled: 0,
      isPaused: false,
      baseProtected: false
    });
  });

  test('子彈池應該預先建立 20 顆子彈', () => {
    expect(scene.bulletPool.getStats().poolSize).toBe(20);
  });

  test('應該註冊場景事件監聽', () => {
    expect(scene.events.once).toHaveBeenCalledWith('shutdown', scene.shutdown, scene);
    expect(scene.events.on).toHaveBeenCalledWith(EVENTS.PLAYER_DESTROYED, scene.onPlayerDestroyed, scene);
    expect(scene.events.on).toHaveBeenCalledWith(EVENTS.ENEMY_DESTROYED, scene.onEnemyDestroyed, scene);
    expect(scene.events.on).toHaveBeenCalledWith(EVENTS.SCORE_CHANGED, scene.updateScore, scene);
    expect(scene.events.on).toHaveBeenCalledWith(EVENTS.LIVES_CHANGED, scene.updateLives, scene);
  });

  test('應該在基地位置建立基地並加入碰撞系統', () => {
    const { x, y } = toWorld(12, 24);

    expect(scene.base.x).toBe(x);
    expect(scene.base.y).toBe(y);
    expect(scene.collisionSystem.baseGroup.getChildren()).toContain(scene.base);
  });

  test('應該在出生點建立玩家', () => {
    const { x, y } = toWorld(8, 24);

    expect(scene.player).toBeInstanceOf(PlayerTank);
    expect(scene.player.x).toBe(x);
    expect(scene.player.y).toBe(y);
    expect(scene.player.lives).toBe(TANK_CONFIG.PLAYER_LIVES);
    expect(scene.collisionSystem.playerGroup.getChildren()).toContain(scene.player);
  });

  test('應該立即生成第一個敵人並排程下一個', () => {
    expect(scene.enemies.getChildren()).toHaveLength(1);
    expect(scene.enemyQueue).toHaveLength(2);
    expect(scene.maxEnemiesOnScreen).toBe(2);
    expect(scene.time.delayedCall).toHaveBeenCalledWith(3000, expect.any(Function));
  });

  test('應該建立 HUD 並播放開場音效', () => {
    expect(scene.playTime).toBe(0);
    expect(scene.totalEnemyCount).toBe(3);
    expect(scene.uiElements.length).toBeGreaterThan(0);
    expect(scene.stageChipText.calls).toContainEqual(['setText', 'STAGE 02']);
    expect(scene.sound.play).toHaveBeenCalledWith('gamestart', { volume: 0.5 });
  });

  test('應該設定方向鍵、射擊、暫停與 HUD 切換按鍵', () => {
    expect(scene.cursors.up).toBeDefined();
    expect(scene.input.keyboard.addKey).toHaveBeenCalledWith(Phaser.Input.Keyboard.KeyCodes.SPACE);
    expect(scene.input.keyboard.addKey).toHaveBeenCalledWith(Phaser.Input.Keyboard.KeyCodes.P);
    expect(scene.input.keyboard.addKey).toHaveBeenCalledWith(Phaser.Input.Keyboard.KeyCodes.TAB);
  });

  test('按 P 應該暫停並開啟暫停選單', () => {
    const [event, handler] = scene.pauseKey.on.mock.calls[0];
    expect(event).toBe('down');

    handler();

    expect(scene.scene.pause).toHaveBeenCalled();
    expect(scene.scene.launch).toHaveBeenCalledWith(SCENES.PAUSE);
  });

  test('按 P 暫停前應該先停掉引擎聲（暫停後 update 不再執行）', () => {
    const loop = jest.spyOn(scene.audioManager, 'setLoop');
    const [, handler] = scene.pauseKey.on.mock.calls[0];

    handler();

    expect(loop).toHaveBeenCalledWith('move', false);
    expect(loop.mock.invocationCallOrder[0]).toBeLessThan(scene.scene.pause.mock.invocationCallOrder[0]);
  });

  test('應該依存檔設定的難度與音量建立系統', () => {
    new SaveManager().updateSettings({ difficulty: 'hard', sfxVolume: 0.3, musicVolume: 0.9 });
    const configured = makeGameScene({ levelData: makeLevel() });
    configured.init({ level: 2 });
    configured.create();

    expect(configured.difficulty).toBe('hard');
    expect(configured.audioManager.sfxVolume).toBe(0.3);
    expect(configured.audioManager.musicVolume).toBe(0.9);
    // 開場音樂依音樂音量播放
    expect(configured.sound.play).toHaveBeenCalledWith('gamestart', { volume: 0.9 });
  });

  test('按 Tab 應該切換 HUD', () => {
    const toggle = jest.spyOn(scene, 'toggleUI');
    const [event, handler] = scene.toggleUIKey.on.mock.calls[0];
    expect(event).toBe('down');

    handler();

    expect(toggle).toHaveBeenCalled();
  });
});

describe('GameScene.loadLevel', () => {
  test('應該深拷貝快取中的關卡（不可修改共享快取）', () => {
    const level = makeLevel();
    const scene = makeGameScene({ levelData: level });
    scene.init({ level: 2 });
    scene.gameState = {};

    scene.loadLevel();
    scene.levelData.map[0][0] = TILE_TYPES.STEEL;

    expect(scene.cache.json.exists).toHaveBeenCalledWith('level_2');
    expect(scene.cache.json.get).toHaveBeenCalledWith('level_2');
    expect(scene.levelData).not.toBe(level);
    expect(level.map[0][0]).toBe(TILE_TYPES.EMPTY);
  });

  test('應該加總所有波次的敵人數', () => {
    const scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.gameState = {};

    scene.loadLevel();

    expect(scene.gameState.enemiesRemaining).toBe(3);
  });

  test('快取沒有關卡時使用預設關卡（13 輛敵人）', () => {
    const scene = makeGameScene();
    scene.init({ level: 7 });
    scene.gameState = {};

    scene.loadLevel();

    expect(scene.levelData.levelNumber).toBe(7);
    expect(scene.levelData.name).toBe('Level 7');
    expect(scene.gameState.enemiesRemaining).toBe(13);
  });
});

describe('GameScene 預設關卡', () => {
  let scene;

  beforeEach(() => {
    scene = new GameScene();
    scene.currentLevel = 1;
  });

  test('預設關卡應該有完整的出生點與規則', () => {
    const level = scene.getDefaultLevelData();

    expect(level.playerSpawn).toEqual({ x: 8, y: 24 });
    expect(level.basePosition).toEqual({ x: 12, y: 24 });
    expect(level.enemySpawns).toEqual([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 24, y: 0 }]);
    expect(level.enemyWaves).toEqual([
      { type: 'BASIC', count: 10, spawnInterval: 3000 },
      { type: 'FAST', count: 3, spawnInterval: 3000 }
    ]);
    expect(level.specialRules).toEqual({ maxEnemiesOnScreen: 3, baseProtection: false, timeLimit: 0 });
    expect(level.map).toHaveLength(26);
  });

  test('預設地圖應該是 26×26，基地被磚牆包圍', () => {
    const map = scene.generateSimpleMap();

    expect(map).toHaveLength(26);
    map.forEach(row => expect(row).toHaveLength(26));
    expect(map[24][12]).toBe(TILE_TYPES.BASE);
    [[11, 23], [12, 23], [13, 23], [11, 24], [13, 24], [11, 25], [12, 25], [13, 25]]
      .forEach(([x, y]) => expect(map[y][x]).toBe(TILE_TYPES.BRICK));
  });

  test('預設地圖應該包含各種地形', () => {
    const map = scene.generateSimpleMap();
    const count = (tile) => map.flat().filter(t => t === tile).length;

    expect(map[5][5]).toBe(TILE_TYPES.BRICK);
    expect(map[5][20]).toBe(TILE_TYPES.BRICK);
    expect(map[12][8]).toBe(TILE_TYPES.STEEL);
    expect(map[12][17]).toBe(TILE_TYPES.STEEL);
    expect(count(TILE_TYPES.BRICK)).toBe(12);
    expect(count(TILE_TYPES.STEEL)).toBe(4);
    expect(count(TILE_TYPES.WATER)).toBe(6);
    expect(count(TILE_TYPES.ICE)).toBe(9);
    expect(count(TILE_TYPES.FOREST)).toBe(9);
    expect(count(TILE_TYPES.BASE)).toBe(1);
    expect(map[8][10]).toBe(TILE_TYPES.WATER);
    expect(map[10][16]).toBe(TILE_TYPES.ICE);
    expect(map[17][12]).toBe(TILE_TYPES.FOREST);
  });
});

describe('GameScene.createMap', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene();
    scene.collisionSystem = { addWall: jest.fn() };
    scene.iceTerrains = makeGroup();
    scene.forestTerrains = makeGroup();
    const map = [
      [TILE_TYPES.BRICK, TILE_TYPES.STEEL, TILE_TYPES.WATER],
      [TILE_TYPES.ICE, TILE_TYPES.FOREST, TILE_TYPES.BASE],
      [TILE_TYPES.EMPTY, TILE_TYPES.EMPTY, TILE_TYPES.EMPTY]
    ];
    scene.levelData = { map };
    scene.createMap();
  });

  test('牆壁與水域應該加入碰撞系統，且位置在格子中心', () => {
    const walls = scene.collisionSystem.addWall.mock.calls.map(c => c[0]);

    expect(walls).toHaveLength(3);
    expect(walls[0]).toBeInstanceOf(BrickWall);
    expect(walls[1]).toBeInstanceOf(SteelWall);
    expect(walls[2]).toBeInstanceOf(Water);
    expect([walls[0].x, walls[0].y]).toEqual([16, 16 + OFFSET_Y]);
    expect([walls[1].x, walls[1].y]).toEqual([48, 16 + OFFSET_Y]);
    expect([walls[2].x, walls[2].y]).toEqual([80, 16 + OFFSET_Y]);
  });

  test('冰地與森林應該加入各自的地形群組', () => {
    const [ice] = scene.iceTerrains.getChildren();
    const [forest] = scene.forestTerrains.getChildren();

    expect(ice).toBeInstanceOf(Ice);
    expect([ice.x, ice.y]).toEqual([16, 48 + OFFSET_Y]);
    expect(forest).toBeInstanceOf(Forest);
    expect([forest.x, forest.y]).toEqual([48, 48 + OFFSET_Y]);
    expect(scene.iceTerrains.getChildren()).toHaveLength(1);
    expect(scene.forestTerrains.getChildren()).toHaveLength(1);
  });

  test('應該畫出遊戲場背景與邊框', () => {
    const bg = scene.add.rectangle.mock.results[0].value;
    expect(bg.args).toEqual([0, OFFSET_Y, GAME_CONFIG.WIDTH, GAME_CONFIG.PLAY_HEIGHT, 0x000000]);

    const border = scene.add.graphics.mock.results[0].value;
    expect(border.calls).toContainEqual(['strokeRect', 0, OFFSET_Y, GAME_CONFIG.WIDTH, GAME_CONFIG.PLAY_HEIGHT]);
  });
});

describe('GameScene 玩家建立與星級恢復', () => {
  const createWithSaved = (saved) => {
    const scene = makeGameScene();
    scene.init(saved);
    scene.levelData = makeLevel();
    scene.gameState = { lives: 3 };
    scene.collisionSystem = { addPlayer: jest.fn() };
    scene.createPlayer();
    return scene;
  };

  test('出生點不安全時改用附近的安全位置', () => {
    const scene = makeGameScene();
    scene.init({});
    scene.levelData = makeLevel();
    scene.levelData.map[24][8] = TILE_TYPES.BRICK;
    scene.collisionSystem = { addPlayer: jest.fn() };

    scene.createPlayer();

    // 半徑 1 由 (dx=-1, dy=-1) 開始搜尋 → (7, 23)
    const expected = toWorld(7, 23);
    expect(scene.player.x).toBe(expected.x);
    expect(scene.player.y).toBe(expected.y);
    expect(scene.collisionSystem.addPlayer).toHaveBeenCalledWith(scene.player);
  });

  test('應該恢復上一關的生命數', () => {
    const scene = createWithSaved({ lives: 1 });

    expect(scene.player.lives).toBe(1);
    expect(scene.player.starLevel).toBe(0);
  });

  test('恢復的生命數應該同步到遊戲狀態與 HUD', () => {
    const scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2, lives: 1 });
    scene.create();

    expect(scene.gameState.lives).toBe(1);
    const heartAlphas = scene.livesGraphics.calls.filter(c => c[0] === 'fillStyle').map(c => c[2]);
    expect(heartAlphas).toEqual([1, 0.18, 0.18]);
  });

  test.each([
    [1, { speed: 156, maxBullets: 2, bulletDamage: 1 }],
    [2, { speed: 156, maxBullets: 2, bulletDamage: 1 }],
    [3, { speed: 156, maxBullets: 2, bulletDamage: 2 }],
    [4, { speed: 156, maxBullets: 3, bulletDamage: 2 }]
  ])('星級 %i 應該累積恢復所有升級效果', (starLevel, expected) => {
    const scene = createWithSaved({ starLevel });

    expect(scene.player.starLevel).toBe(starLevel);
    expect(scene.player.speed).toBeCloseTo(expected.speed);
    expect(scene.player.maxBullets).toBe(expected.maxBullets);
    expect(scene.player.bulletDamage).toBe(expected.bulletDamage);
  });

  test('星級 2 恢復時應該設定 2 發子彈', () => {
    const scene = new GameScene();
    const player = { starLevel: 2, baseSpeed: 100, maxBullets: 1, bulletDamage: 1 };

    scene._restoreStarUpgrades(player);

    expect(player.maxBullets).toBe(2);
    expect(player.speed).toBeCloseTo(130);
  });

  test('星級 0 不改變屬性', () => {
    const scene = new GameScene();
    const player = { starLevel: 0, baseSpeed: 100, speed: 100, maxBullets: 1, bulletDamage: 1 };

    scene._restoreStarUpgrades(player);

    expect(player).toEqual({ starLevel: 0, baseSpeed: 100, speed: 100, maxBullets: 1, bulletDamage: 1 });
  });
});

describe('GameScene 安全出生位置搜尋', () => {
  let scene;

  beforeEach(() => {
    scene = new GameScene();
  });

  test('應該由內而外、依 dx 再 dy 的順序搜尋', () => {
    const map = Array(7).fill(null).map(() => Array(7).fill(TILE_TYPES.BRICK));
    scene.levelData = { map };
    // 半徑 1 只開放右上與右下，應先找到 (dx=1, dy=-1)
    map[2][4] = TILE_TYPES.EMPTY;
    map[4][4] = TILE_TYPES.EMPTY;

    expect(scene.findSafeSpawnPosition(3, 3)).toEqual({ x: 4, y: 2 });
  });

  test('半徑 1 沒有時才擴大到半徑 2', () => {
    const map = Array(7).fill(null).map(() => Array(7).fill(TILE_TYPES.BRICK));
    scene.levelData = { map };
    map[1][1] = TILE_TYPES.EMPTY;

    expect(scene.findSafeSpawnPosition(3, 3)).toEqual({ x: 1, y: 1 });
  });

  test('最遠搜尋到半徑 5', () => {
    const map = Array(13).fill(null).map(() => Array(13).fill(TILE_TYPES.BRICK));
    scene.levelData = { map };
    map[6][11] = TILE_TYPES.EMPTY;
    expect(scene.findSafeSpawnPosition(6, 6)).toEqual({ x: 11, y: 6 });

    map[6][11] = TILE_TYPES.BRICK;
    map[6][12] = TILE_TYPES.EMPTY;
    expect(scene.findSafeSpawnPosition(6, 6)).toEqual({ x: 8, y: 24 });
  });

  test('半徑內部（非邊緣）的格子不重複檢查', () => {
    const map = Array(7).fill(null).map(() => Array(7).fill(TILE_TYPES.BRICK));
    scene.levelData = { map };
    const safe = jest.spyOn(scene, 'isPositionSafe');

    scene.findSafeSpawnPosition(3, 3);

    // 1（原點）+ 8（半徑 1）+ 16 + 24 + 32 + 40
    expect(safe).toHaveBeenCalledTimes(1 + 8 + 16 + 24 + 32 + 40);
  });

  test('isPositionSafe 的地圖邊界應該包含最後一欄 / 列', () => {
    const map = [[TILE_TYPES.EMPTY, TILE_TYPES.EMPTY], [TILE_TYPES.EMPTY, TILE_TYPES.EMPTY]];

    expect(scene.isPositionSafe(1, 1, map)).toBe(true);
    expect(scene.isPositionSafe(2, 1, map)).toBe(false);
    expect(scene.isPositionSafe(1, 2, map)).toBe(false);
    expect(scene.isPositionSafe(-1, 0, map)).toBe(false);
    expect(scene.isPositionSafe(0, -1, map)).toBe(false);
  });
});

describe('GameScene 敵人生成', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
    scene.time.delayedCall.mockClear();
  });

  test('敵人佇列應該依波次建立並以 Fisher-Yates 洗牌', () => {
    const fresh = makeGameScene({ levelData: makeLevel() });
    fresh.init({ level: 2 });
    fresh.levelData = makeLevel({ enemyWaves: [{ type: 'ARMOR', count: 2 }, { type: 'FAST', count: 1 }] });
    jest.spyOn(fresh, 'spawnNextEnemy').mockImplementation(() => {});
    const shuffle = jest.spyOn(Phaser.Utils.Array, 'Shuffle').mockImplementation(arr => arr.reverse());

    fresh.startEnemySpawning();

    expect(shuffle).toHaveBeenCalledWith(fresh.enemyQueue);
    expect(fresh.enemyQueue).toEqual(['FAST', 'ARMOR', 'ARMOR']);
    expect(fresh.spawnNextEnemy).toHaveBeenCalledTimes(1);
  });

  test('沒有指定同屏上限時預設 3', () => {
    const fresh = makeGameScene();
    fresh.levelData = makeLevel({ specialRules: undefined });
    jest.spyOn(fresh, 'spawnNextEnemy').mockImplementation(() => {});

    fresh.startEnemySpawning();

    expect(fresh.maxEnemiesOnScreen).toBe(3);
  });

  test('生成的敵人應該有 AI 並加入碰撞系統', () => {
    const [enemy] = scene.enemies.getChildren();

    expect(enemy).toBeInstanceOf(EnemyTank);
    expect(enemy.aiController.tank).toBe(enemy);
    expect(scene.collisionSystem.enemyGroup.getChildren()).toContain(enemy);
    expect(['BASIC', 'FAST']).toContain(enemy.enemyType);
  });

  test('達到同屏上限時 500ms 後重試且不消耗佇列', () => {
    scene.spawnNextEnemy(); // 第 2 輛：達上限 2
    scene.time.delayedCall.mockClear();
    const queueLength = scene.enemyQueue.length;

    scene.spawnNextEnemy();

    expect(scene.enemyQueue).toHaveLength(queueLength);
    expect(scene.time.delayedCall).toHaveBeenCalledWith(500, expect.any(Function));
  });

  test('重試回呼應該再次嘗試生成', () => {
    scene.spawnNextEnemy();
    scene.time.delayedCall.mockClear();
    scene.spawnNextEnemy();
    const spawn = jest.spyOn(scene, 'spawnNextEnemy');

    scene.time.delayedCall.mock.calls[0][1]();

    expect(spawn).toHaveBeenCalled();
  });

  test('只計算仍活躍的敵人', () => {
    scene.spawnNextEnemy(); // 共 2 輛，達上限
    scene.enemies.getChildren().forEach(e => { e.active = false; });

    scene.spawnNextEnemy();

    expect(scene.enemies.getChildren()).toHaveLength(3);
    expect(scene.enemies.getChildren().filter(e => e.active)).toHaveLength(1);
  });

  test('出生點全被佔據時 500ms 後重試且不消耗佇列', () => {
    jest.spyOn(scene, 'findFreeSpawnPoint').mockReturnValue(null);
    scene.enemies.getChildren().forEach(e => { e.active = false; });
    const queueLength = scene.enemyQueue.length;

    scene.spawnNextEnemy();

    expect(scene.enemyQueue).toHaveLength(queueLength);
    expect(scene.time.delayedCall).toHaveBeenCalledWith(500, expect.any(Function));

    const retry = jest.spyOn(scene, 'spawnNextEnemy').mockImplementation(() => {});
    scene.time.delayedCall.mock.calls[0][1]();
    expect(retry).toHaveBeenCalled();
  });

  test('佇列清空後不再排程', () => {
    scene.enemies.getChildren().forEach(e => { e.active = false; });
    scene.enemyQueue = ['BASIC'];

    scene.spawnNextEnemy();
    expect(scene.time.delayedCall).not.toHaveBeenCalled();

    scene.spawnNextEnemy();
    expect(scene.enemies.getChildren()).toHaveLength(2);
  });

  test('3 秒後的排程應該生成下一輛', () => {
    const fresh = makeGameScene({ levelData: makeLevel() });
    fresh.init({ level: 2 });
    fresh.create();
    const timer = fresh.timers.find(t => t.delay === 3000);
    const spawn = jest.spyOn(fresh, 'spawnNextEnemy');

    timer.callback();

    expect(spawn).toHaveBeenCalled();
  });
});

describe('GameScene 子彈與道具建立', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test('createBullet 應該從物件池取出、加入群組後再發射', () => {
    const bullet = scene.createBullet(100, 200, 'left', 150, 2, scene.player);

    expect(bullet).toBeInstanceOf(Bullet);
    expect(scene.bullets.getChildren()).toContain(bullet);
    expect(scene.collisionSystem.bulletGroup.getChildren()).toContain(bullet);
    expect(bullet.active).toBe(true);
    expect(bullet.x).toBe(100);
    expect(bullet.y).toBe(200);
    expect(bullet.direction).toBe('left');
    expect(bullet.speed).toBe(150);
    expect(bullet.damage).toBe(2);
    expect(bullet.isPlayerBullet).toBe(true);
    expect(scene.bulletPool.active).toContain(bullet);
  });

  test('玩家射擊應該透過場景建立子彈', () => {
    scene.player.isFrozen = false;
    const bullet = scene.player.shoot();

    expect(bullet).toBeInstanceOf(Bullet);
    expect(bullet.owner).toBe(scene.player);
  });

  test('spawnPowerUp 應該建立指定道具並加入群組', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    scene.spawnPowerUp(50, 60, 'CLOCK');

    const [powerUp] = scene.powerUps.getChildren();
    expect(powerUp).toBeInstanceOf(PowerUp);
    expect(powerUp.powerUpType).toBe('CLOCK');
    expect([powerUp.x, powerUp.y]).toEqual([50, 60]);
    expect(scene.collisionSystem.powerUpGroup.getChildren()).toContain(powerUp);
  });

  test('spawnPowerUp 沒指定類型時從 6 種道具隨機挑選', () => {
    const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[1]);

    scene.spawnPowerUp(50, 60);

    expect(pick.mock.calls[0][0]).toEqual(['TANK', 'STAR', 'HELMET', 'SHOVEL', 'CLOCK', 'GRENADE']);
    expect(scene.powerUps.getChildren()[0].powerUpType).toBe('STAR');
  });
});

describe('GameScene 遊戲事件', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test('respawnPlayer 應該在出生點以目前生命 / 分數建立新玩家', () => {
    const old = scene.player;
    scene.gameState.lives = 2;
    scene.gameState.score = 700;

    scene.respawnPlayer();

    expect(scene.player).not.toBe(old);
    expect(scene.player.lives).toBe(2);
    expect(scene.player.score).toBe(700);
    expect([scene.player.x, scene.player.y]).toEqual(Object.values(toWorld(8, 24)));
    expect(scene.collisionSystem.playerGroup.getChildren()).toContain(scene.player);
  });

  test('沒有玩家或生命用完時不重生', () => {
    const old = scene.player;
    old.lives = 0;
    scene.respawnPlayer();
    expect(scene.player).toBe(old);

    scene.player = null;
    scene.respawnPlayer();
    expect(scene.player).toBeNull();
  });

  test('玩家死亡流程應該同步生命數並重生', () => {
    scene.player.isInvincible = false;
    // 讓事件真正派送到場景處理器
    scene.events.emit.mockImplementation((event, ...args) => {
      if (event === EVENTS.LIVES_CHANGED) scene.updateLives(...args);
      if (event === EVENTS.PLAYER_DESTROYED) scene.onPlayerDestroyed(...args);
    });
    const old = scene.player;

    old.takeDamage(1);

    expect(scene.gameState.lives).toBe(2);
    expect(scene.player).not.toBe(old);
    expect(scene.player.lives).toBe(2);
  });

  test('onPlayerDestroyed：遊戲結束時切換到結束畫面', () => {
    const gameOver = jest.spyOn(scene, 'gameOver');
    scene.player.lives = 0;

    scene.onPlayerDestroyed(false);
    expect(gameOver).not.toHaveBeenCalled();
    expect(scene.gameState.lives).toBe(0);

    scene.onPlayerDestroyed(true);
    expect(gameOver).toHaveBeenCalledTimes(1);
  });

  test('onPlayerDestroyed：沒有玩家時生命為 0', () => {
    scene.player = null;
    jest.spyOn(scene, 'gameOver').mockImplementation(() => {});

    scene.onPlayerDestroyed(false);

    expect(scene.gameState.lives).toBe(0);
  });

  test('onEnemyDestroyed 應該更新計數與 HUD', () => {
    scene.onEnemyDestroyed({});

    expect(scene.gameState.enemiesRemaining).toBe(2);
    expect(scene.gameState.enemiesKilled).toBe(1);
    expect(scene.killsText.calls).toContainEqual(['setText', 'KILLS · 1']);
    expect(scene.enemyGridLabel.calls).toContainEqual(['setText', '敵 2/3']);
  });

  test('最後一輛敵人被消滅且佇列已空時過關', () => {
    const complete = jest.spyOn(scene, 'levelComplete');
    scene.gameState.enemiesRemaining = 1;
    scene.enemyQueue = ['BASIC'];

    scene.onEnemyDestroyed({});
    expect(complete).not.toHaveBeenCalled();

    scene.gameState.enemiesRemaining = 1;
    scene.enemyQueue = [];
    scene.onEnemyDestroyed({});
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('佇列已空但場上還有敵人時不過關', () => {
    const complete = jest.spyOn(scene, 'levelComplete');
    scene.gameState.enemiesRemaining = 2;
    scene.enemyQueue = [];

    scene.onEnemyDestroyed({});

    expect(scene.gameState.enemiesRemaining).toBe(1);
    expect(complete).not.toHaveBeenCalled();
  });

  test('第 4 輛敵人掉落的道具應該位於地圖安全格的中心', () => {
    const spawn = jest.spyOn(scene, 'spawnPowerUp').mockImplementation(() => {});
    jest.spyOn(scene, 'getRandomEmptyPosition').mockReturnValue({ x: 5, y: 6 });
    scene.gameState.enemiesKilled = 3;

    scene.onEnemyDestroyed({});

    expect(spawn).toHaveBeenCalledWith(toWorld(5, 6).x, toWorld(5, 6).y);
  });

  test('getRandomEmptyPosition 找不到空位時回傳地圖中央並警告', () => {
    scene.levelData.map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.BRICK));

    expect(scene.getRandomEmptyPosition()).toEqual({ x: 13, y: 13 });
    expect(console.warn).toHaveBeenCalledWith('⚠️ 找不到空位置生成道具，使用中央位置');
  });

  test('getRandomEmptyPosition 應該排除外圍 2 格', () => {
    const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.BRICK));
    [[1, 1], [24, 24], [2, 24], [24, 2], [1, 23], [23, 1]].forEach(([x, y]) => { map[y][x] = TILE_TYPES.EMPTY; });
    scene.levelData.map = map;
    expect(scene.getRandomEmptyPosition()).toEqual({ x: 13, y: 13 });

    map[2][2] = TILE_TYPES.EMPTY;
    expect(scene.getRandomEmptyPosition()).toEqual({ x: 2, y: 2 });

    map[2][2] = TILE_TYPES.BRICK;
    map[23][23] = TILE_TYPES.EMPTY;
    expect(scene.getRandomEmptyPosition()).toEqual({ x: 23, y: 23 });
  });
});

describe('GameScene HUD 更新', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test('updateScore 應該更新分數；超過最高分時同步更新 HI', () => {
    scene.highScore = 1000;

    scene.updateScore(500);
    expect(scene.gameState.score).toBe(500);
    expect(scene.scoreText.calls).toContainEqual(['setText', '500']);
    expect(scene.hiScoreText.calls).not.toContainEqual(['setText', '500']);

    scene.updateScore(1000);
    expect(scene.highScore).toBe(1000);
    expect(scene.hiScoreText.calls).not.toContainEqual(['setText', '1,000']);

    scene.updateScore(1500);
    expect(scene.highScore).toBe(1500);
    expect(scene.hiScoreText.calls).toContainEqual(['setText', '1,500']);
  });

  test('updateScore 沒有舊最高分時任何分數都會刷新', () => {
    scene.highScore = undefined;

    scene.updateScore(10);

    expect(scene.highScore).toBe(10);
  });

  test('updateScore 在 HUD 尚未建立時只更新狀態', () => {
    scene.scoreText = null;
    scene.hiScoreText = null;

    expect(() => scene.updateScore(42)).not.toThrow();
    expect(scene.gameState.score).toBe(42);
  });

  test('updateLives 應該更新狀態並重繪愛心', () => {
    const render = jest.spyOn(scene, 'renderLives');

    scene.updateLives(1);

    expect(scene.gameState.lives).toBe(1);
    expect(render).toHaveBeenCalledWith(1);
  });

  test('renderLives 應該依生命數畫實心 / 空心愛心；超過 3 條改為 1 顆愛心加上 ×N', () => {
    const fills = () => scene.livesGraphics.calls.filter(c => c[0] === 'fillStyle').map(c => c[2]);
    const countText = () => scene.livesCountText.calls.filter(c => c[0] === 'setText').pop()[1];
    const render = lives => {
      scene.livesGraphics = makeDisplayObject('graphics', []);
      scene.renderLives(lives);
    };

    render(2);
    expect(fills()).toEqual([1, 1, 0.18]);
    expect(countText()).toBe('');

    render(3);
    expect(fills()).toEqual([1, 1, 1]);
    expect(countText()).toBe('');

    render(4);
    expect(fills()).toEqual([1]);
    expect(countText()).toBe('×4');

    render(9);
    expect(fills()).toEqual([1]);
    expect(countText()).toBe('×9');

    render(undefined);
    expect(fills()).toEqual([0.18, 0.18, 0.18]);
    expect(countText()).toBe('');
  });

  test('renderEnemyGrid 應該標示已擊敗與存活的敵人', () => {
    scene.totalEnemyCount = 4;
    scene.gameState.enemiesRemaining = 3;
    scene.enemyGridGraphics = makeDisplayObject('graphics', []);

    scene.renderEnemyGrid();

    const calls = scene.enemyGridGraphics.calls;
    expect(calls.filter(c => c[0] === 'fillRect')).toHaveLength(3);
    expect(calls.filter(c => c[0] === 'strokeRect')).toHaveLength(4);
    expect(scene.enemyGridLabel.calls).toContainEqual(['setText', '敵 3/4']);
  });

  test('renderLives 的愛心應該從錨點起每 27px（21px 寬 + 6px 間距）排列、3 倍像素', () => {
    scene.livesGraphics = makeDisplayObject('graphics', []);
    scene.livesAnchorX = 100;
    scene.livesAnchorY = 20;

    scene.renderLives(2);

    const rects = scene.livesGraphics.calls.filter(c => c[0] === 'fillRect').map(c => c.slice(1));
    // 實心 27 格 ×2、空心 14 格；每顆的第一格在 (中心 - 10.5 + 3, 中心 - 9)
    expect(rects).toHaveLength(27 * 2 + 14);
    expect(rects[0]).toEqual([103, 11, 3, 3]);
    expect(rects[27]).toEqual([130, 11, 3, 3]);
    expect(rects[54]).toEqual([157, 11, 3, 3]);
  });

  test('renderEnemyGrid 以 5 欄、8px 格子、3px 間距垂直置中排列（至少 3 列）', () => {
    scene.totalEnemyCount = 7;
    scene.gameState.enemiesRemaining = 5;
    scene.enemyGridAnchorX = 200;
    scene.enemyGridAnchorY = 30;
    scene.enemyGridGraphics = makeDisplayObject('graphics', []);

    scene.renderEnemyGrid();

    const calls = scene.enemyGridGraphics.calls.slice(1);
    // 第 0、1 格已擊敗：暗色空格
    expect(calls.slice(0, 4)).toEqual([
      ['lineStyle', 1, PALETTE.GOLD_DEEP, 0.6],
      ['strokeRect', 196, 15, 8, 8],
      ['lineStyle', 1, PALETTE.GOLD_DEEP, 0.6],
      ['strokeRect', 207, 15, 8, 8]
    ]);
    // 第 2 格存活：亮金實心 + 描邊
    expect(calls.slice(4, 8)).toEqual([
      ['fillStyle', PALETTE.GOLD_3, 1],
      ['fillRect', 218, 15, 8, 8],
      ['lineStyle', 1, PALETTE.GOLD, 1],
      ['strokeRect', 218, 15, 8, 8]
    ]);
    // 第 5 格換到第 2 列（列距 11px）
    const sixth = calls.filter(c => c[0] === 'fillRect')[3];
    expect(sixth).toEqual(['fillRect', 196, 26, 8, 8]);
  });

  test('renderEnemyGrid 超過 15 輛時延伸列數並保持垂直置中', () => {
    scene.totalEnemyCount = 16;
    scene.gameState.enemiesRemaining = 16;
    scene.enemyGridAnchorX = 200;
    scene.enemyGridAnchorY = 30;
    scene.enemyGridGraphics = makeDisplayObject('graphics', []);

    scene.renderEnemyGrid();

    const fills = scene.enemyGridGraphics.calls.filter(c => c[0] === 'fillRect');
    expect(fills).toHaveLength(16);
    // 4 列 → 第一列中心 30 - 16.5，最後一格在第 4 列
    expect(fills[0]).toEqual(['fillRect', 196, 9.5, 8, 8]);
    expect(fills[15]).toEqual(['fillRect', 196, 42.5, 8, 8]);
  });

  test('renderEnemyGrid 已擊敗數不會是負數', () => {
    scene.totalEnemyCount = 2;
    scene.gameState.enemiesRemaining = 5;
    scene.enemyGridGraphics = makeDisplayObject('graphics', []);

    scene.renderEnemyGrid();

    expect(scene.enemyGridGraphics.calls.filter(c => c[0] === 'fillRect')).toHaveLength(2);
    expect(scene.enemyGridLabel.calls).toContainEqual(['setText', '敵 5/2']);
  });

  test('renderEnemyGrid 沒有敵人時只更新標籤', () => {
    scene.totalEnemyCount = 0;
    scene.gameState.enemiesRemaining = 0;
    scene.enemyGridGraphics = makeDisplayObject('graphics', []);

    scene.renderEnemyGrid();

    expect(scene.enemyGridGraphics.calls).toEqual([['clear']]);
  });

  test('renderEnemyGrid 沒有敵人標籤時仍繪製方格', () => {
    scene.enemyGridLabel = null;
    scene.enemyGridGraphics = makeDisplayObject('graphics', []);

    expect(() => scene.renderEnemyGrid()).not.toThrow();
    expect(scene.enemyGridGraphics.calls.filter(c => c[0] === 'fillRect').length).toBeGreaterThan(0);
  });

  test('HUD 尚未建立時 render 方法直接略過', () => {
    scene.livesGraphics = null;
    scene.enemyGridGraphics = null;

    expect(() => {
      scene.renderLives(3);
      scene.renderEnemyGrid();
    }).not.toThrow();
  });

  test('HUD 尚未建立時更新擊殺數與關卡不應該拋錯', () => {
    scene.killsText = null;
    scene.stageChipText = null;

    expect(() => {
      scene.updateEnemies();
      scene.updateLevel(3);
    }).not.toThrow();
  });

  test('updateLevel 應該顯示兩位數關卡編號', () => {
    scene.updateLevel(5);

    expect(scene.stageChipText.calls).toContainEqual(['setText', 'STAGE 05']);
  });

  test('toggleUI 應該切換顯示並淡入淡出所有 HUD 元素', () => {
    const message = jest.spyOn(scene, 'showToggleMessage').mockImplementation(() => {});
    scene.tweens.add.mockClear();

    scene.toggleUI();
    expect(scene.uiVisible).toBe(false);
    expect(message).toHaveBeenCalledWith('HUD 已隱藏');
    expect(scene.tweens.add).toHaveBeenCalledTimes(scene.uiElements.length);
    scene.tweens.add.mock.calls.forEach(([config]) => {
      expect(config.alpha).toBe(0);
      expect(config.duration).toBe(200);
    });

    scene.tweens.add.mockClear();
    scene.toggleUI();
    expect(scene.uiVisible).toBe(true);
    expect(message).toHaveBeenLastCalledWith('HUD 已顯示');
    scene.tweens.add.mock.calls.forEach(([config]) => {
      const base = config.targets.__baseAlpha;
      expect(config.alpha).toBe(base != null ? base : 1);
    });
  });

  test('toggleUI 重新顯示時，半透明的 HUD 底條應該回到原本的透明度', () => {
    jest.spyOn(scene, 'showToggleMessage').mockImplementation(() => {});
    const bar = { __baseAlpha: 0.85 };
    const text = {};
    scene.uiElements = [bar, text];

    scene.toggleUI();
    scene.tweens.add.mockClear();
    scene.toggleUI();

    const alphaOf = target => scene.tweens.add.mock.calls.find(([c]) => c.targets === target)[0].alpha;
    expect(alphaOf(bar)).toBe(0.85);
    expect(alphaOf(text)).toBe(1);
  });

  test('showToggleMessage 應該取代舊訊息並在 1.5 秒後淡出移除', () => {
    scene.showToggleMessage('A');
    const first = scene.toggleMessage;
    scene.showToggleMessage('B');

    expect(first.destroyed).toBe(true);
    expect(scene.toggleMessage.args[2]).toBe('B');

    const timer = scene.timers.filter(t => t.delay === 1500).pop();
    scene.tweens.add.mockClear();
    timer.callback();
    const fadeOut = scene.tweens.add.mock.calls[0][0];
    expect(fadeOut.alpha).toBe(0);

    const current = scene.toggleMessage;
    fadeOut.onComplete();
    expect(current.destroyed).toBe(true);
    expect(scene.toggleMessage).toBeNull();
  });

  test('showToggleMessage 被取代的舊訊息計時不應該提前淡出新訊息', () => {
    scene.showToggleMessage('A');
    const [firstTimer] = scene.timers.filter(t => t.delay === 1500).slice(-1);
    scene.showToggleMessage('B');
    const second = scene.toggleMessage;

    scene.tweens.add.mockClear();
    firstTimer.callback();

    expect(scene.tweens.add).not.toHaveBeenCalled();
    expect(second.destroyed).toBe(false);
    expect(scene.toggleMessage).toBe(second);
  });

  test('showToggleMessage 淡出期間顯示的新訊息不應該被舊訊息的淡出結束移除', () => {
    scene.showToggleMessage('A');
    const first = scene.toggleMessage;
    const [timer] = scene.timers.filter(t => t.delay === 1500).slice(-1);
    scene.tweens.add.mockClear();
    timer.callback();
    const fadeOut = scene.tweens.add.mock.calls[0][0];
    expect(fadeOut.targets).toBe(first);

    scene.showToggleMessage('B');
    const second = scene.toggleMessage;
    fadeOut.onComplete();

    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(false);
    expect(scene.toggleMessage).toBe(second);
  });

  describe('showPowerUpMessage', () => {
    const messageText = () => scene.powerUpMessage.args[2];

    test('未知道具不顯示', () => {
      scene.showPowerUpMessage('UNKNOWN');

      expect(scene.powerUpMessage).toBeUndefined();
    });

    test('有持續時間的道具顯示秒數', () => {
      scene.showPowerUpMessage('HELMET');

      expect(messageText()).toBe('獲得道具：頭盔\n無敵護盾（10秒）');
    });

    test('時鐘顯示冰凍秒數', () => {
      scene.showPowerUpMessage('CLOCK');

      expect(messageText()).toBe('獲得道具：時鐘\n冰凍敵人（8秒）');
    });

    test('非星星道具不會顯示星級效果（即使玩家已有星級）', () => {
      scene.player.starLevel = 2;
      scene.showPowerUpMessage('HELMET');

      expect(messageText()).toBe('獲得道具：頭盔\n無敵護盾（10秒）');
    });

    test('立即生效的道具', () => {
      scene.showPowerUpMessage('GRENADE');

      expect(messageText()).toBe('獲得道具：手榴彈\n消滅所有敵人（立即生效）');
    });

    test('坦克道具只顯示說明', () => {
      scene.showPowerUpMessage('TANK');

      expect(messageText()).toBe('獲得道具：坦克\n額外生命');
    });

    test('星星顯示目前升級效果', () => {
      scene.player.starLevel = 3;
      scene.showPowerUpMessage('STAR');

      expect(messageText()).toBe('獲得道具：星星\n⭐ Level 3：子彈可破壞鋼牆');
    });

    test.each([
      [1, '移動速度提升'],
      [4, '裝甲坦克！最大火力']
    ])('星星 Level %i 的效果說明', (level, effect) => {
      scene.player.starLevel = level;
      scene.showPowerUpMessage('STAR');

      expect(messageText()).toBe(`獲得道具：星星\n⭐ Level ${level}：${effect}`);
    });

    test('拾取星星後的訊息應該顯示升級後的等級', () => {
      scene.player.starLevel = 1;
      const powerUp = { active: true, x: 0, y: 0, powerUpType: 'STAR', destroy: jest.fn() };

      scene.collisionSystem.onPlayerPowerUpCollision(scene.player, powerUp);

      expect(scene.player.starLevel).toBe(2);
      expect(messageText()).toBe('獲得道具：星星\n⭐ Level 2：可發射 2 顆子彈');
    });

    test('星星在 0 級時顯示立即生效', () => {
      scene.player.starLevel = 0;
      scene.showPowerUpMessage('STAR');

      expect(messageText()).toBe('獲得道具：星星\n坦克升級（立即生效）');
    });

    test('應該取代舊訊息並在 2.5 秒後淡出移除', () => {
      scene.showPowerUpMessage('CLOCK');
      const first = scene.powerUpMessage;
      scene.showPowerUpMessage('SHOVEL');
      expect(first.destroyed).toBe(true);
      expect(messageText()).toBe('獲得道具：鐵鍬\n基地防護（15秒）');

      const timer = scene.timers.filter(t => t.delay === 2500).pop();
      scene.tweens.add.mockClear();
      timer.callback();
      const fadeOut = scene.tweens.add.mock.calls[0][0];
      const current = scene.powerUpMessage;
      fadeOut.onComplete();

      expect(current.destroyed).toBe(true);
      expect(scene.powerUpMessage).toBeNull();
    });

    test('被取代的舊訊息計時不應該提前淡出新訊息；淡出期間的新訊息也要保留', () => {
      scene.showPowerUpMessage('CLOCK');
      const [firstTimer] = scene.timers.filter(t => t.delay === 2500).slice(-1);
      scene.showPowerUpMessage('SHOVEL');
      const second = scene.powerUpMessage;

      scene.tweens.add.mockClear();
      firstTimer.callback();
      expect(scene.tweens.add).not.toHaveBeenCalled();

      const [secondTimer] = scene.timers.filter(t => t.delay === 2500).slice(-1);
      secondTimer.callback();
      const fadeOut = scene.tweens.add.mock.calls[0][0];
      expect(fadeOut.targets).toBe(second);

      scene.showPowerUpMessage('HELMET');
      const third = scene.powerUpMessage;
      fadeOut.onComplete();

      expect(second.destroyed).toBe(true);
      expect(third.destroyed).toBe(false);
      expect(scene.powerUpMessage).toBe(third);
    });
  });
});

describe('GameScene 勝負流程', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test('過關時帶著玩家狀態前往結算畫面', () => {
    scene.player.score = 1200;
    scene.player.lives = 2;
    scene.player.starLevel = 3;

    scene.levelComplete();

    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.LEVEL_COMPLETE, {
      score: 1200,
      level: 2,
      lives: 2,
      starLevel: 3
    });
  });

  test('過關時沒有玩家則使用遊戲狀態', () => {
    scene.player = null;
    scene.gameState.score = 300;
    scene.gameState.lives = 1;

    scene.levelComplete();

    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.LEVEL_COMPLETE, {
      score: 300,
      level: 2,
      lives: 1,
      starLevel: 0
    });
  });

  test('遊戲結束時更新最高分並前往結束畫面（統計在場景關閉時才寫入）', () => {
    scene.player.score = 5000;
    scene.gameState.enemiesKilled = 7;

    scene.gameOver();

    const saved = scene.saveManager.load();
    expect(saved.highScore).toBe(5000);
    expect(saved.totalEnemiesDestroyed).toBe(0);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME_OVER, {
      score: 5000,
      level: 2,
      isNewHighScore: true
    });
  });

  test('最後一條命陣亡時只結束一次遊戲：新紀錄不被覆蓋', () => {
    // 讓事件真正派送到場景處理器（與 Phaser 相同）
    scene.events.emit.mockImplementation((event, ...args) => {
      if (event === EVENTS.LIVES_CHANGED) scene.updateLives(...args);
      if (event === EVENTS.PLAYER_DESTROYED) scene.onPlayerDestroyed(...args);
    });
    scene.player.isInvincible = false;
    scene.player.lives = 1;
    scene.player.score = 900;
    scene.gameState.enemiesKilled = 3;

    scene.player.takeDamage(1);

    const gameOverStarts = scene.scene.start.mock.calls.filter(([key]) => key === SCENES.GAME_OVER);
    expect(gameOverStarts).toEqual([[SCENES.GAME_OVER, { score: 900, level: 2, isNewHighScore: true }]]);
  });

  test('基地被毀與玩家陣亡同時發生時只結束一次', () => {
    scene.gameOver();
    scene.gameOver();

    expect(scene.scene.start).toHaveBeenCalledTimes(1);
  });

  test('結束遊戲後不再觸發過關（反之亦然）', () => {
    scene.gameOver();
    scene.levelComplete();
    expect(scene.scene.start).toHaveBeenCalledTimes(1);

    const another = makeGameScene({ levelData: makeLevel() });
    another.init({ level: 2 });
    another.create();
    another.levelComplete();
    another.gameOver();
    expect(another.scene.start).toHaveBeenCalledTimes(1);
    expect(another.scene.start.mock.calls[0][0]).toBe(SCENES.LEVEL_COMPLETE);
  });

  test('場景重新開始後可以再次結束遊戲（Phaser 重複使用場景實例）', () => {
    scene.gameOver();

    scene.init({ level: 1 });
    scene.create();
    scene.gameOver();

    expect(scene.scene.start.mock.calls.filter(([key]) => key === SCENES.GAME_OVER)).toHaveLength(2);
  });

  test('遊戲結束時沒有玩家則使用遊戲狀態分數', () => {
    scene.player = null;
    scene.gameState.score = 0;
    scene.gameState.enemiesKilled = 0;

    scene.gameOver();

    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME_OVER, {
      score: 0,
      level: 2,
      isNewHighScore: false
    });
  });
});

describe('GameScene 道具全體效果', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test('destroyAllEnemies 只對活著的敵人造成致命傷害', () => {
    const alive = { active: true, isDestroyed: false, takeDamage: jest.fn() };
    const dead = { active: true, isDestroyed: true, takeDamage: jest.fn() };
    const inactive = { active: false, isDestroyed: false, takeDamage: jest.fn() };
    scene.enemies.children.splice(0, scene.enemies.children.length, alive, dead, inactive);

    scene.destroyAllEnemies();

    expect(alive.takeDamage).toHaveBeenCalledWith(9999);
    expect(dead.takeDamage).not.toHaveBeenCalled();
    expect(inactive.takeDamage).not.toHaveBeenCalled();
  });

  test('freezeAllEnemies 只冰凍活躍的敵人', () => {
    const alive = { active: true, setFrozen: jest.fn() };
    const inactive = { active: false, setFrozen: jest.fn() };
    scene.enemies.children.splice(0, scene.enemies.children.length, alive, inactive);

    scene.freezeAllEnemies(8000);

    expect(alive.setFrozen).toHaveBeenCalledWith(8000);
    expect(inactive.setFrozen).not.toHaveBeenCalled();
  });
});

describe('GameScene.update - 每幀更新', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test('應該更新黑板、玩家、敵人與地形', () => {
    const blackboard = jest.spyOn(scene.aiBlackboard, 'update');
    const input = jest.spyOn(scene, 'handlePlayerInput');
    const playerUpdate = jest.spyOn(scene.player, 'update');
    const [enemy] = scene.enemies.getChildren();
    const enemyUpdate = jest.spyOn(enemy, 'update');
    const terrain = jest.spyOn(scene, 'updateTerrainEffects');

    scene.update(2000, 16);

    expect(blackboard).toHaveBeenCalled();
    expect(input).toHaveBeenCalled();
    expect(playerUpdate).toHaveBeenCalledWith(2000, 16);
    expect(enemyUpdate).toHaveBeenCalledWith(2000, 16);
    expect(terrain).toHaveBeenCalled();
  });

  test('玩家或敵人不活躍時不更新', () => {
    const input = jest.spyOn(scene, 'handlePlayerInput');
    const [enemy] = scene.enemies.getChildren();
    const enemyUpdate = jest.spyOn(enemy, 'update');
    scene.player.active = false;
    enemy.active = false;

    scene.update(2000, 16);

    expect(input).not.toHaveBeenCalled();
    expect(enemyUpdate).not.toHaveBeenCalled();
  });

  test('應該回收不活躍的子彈（含連續多顆）', () => {
    const a = scene.createBullet(100, 100, 'up', 200, 1, scene.player);
    const b = scene.createBullet(100, 100, 'up', 200, 1, scene.player);
    const c = scene.createBullet(100, 100, 'up', 200, 1, scene.player);
    a.deactivate();
    b.deactivate();

    scene.update(2000, 16);

    expect(scene.bullets.getChildren()).toEqual([c]);
    expect(scene.bullets.remove).toHaveBeenCalledWith(a, false, false);
    expect(scene.bulletPool.pool).toContain(a);
    expect(scene.bulletPool.pool).toContain(b);
    expect(scene.bulletPool.active).toContain(c);
  });

  test('計時器顯示累計遊玩時間，每 250ms 以上才更新一次', () => {
    const setText = () => scene.timerText.calls.filter(call => call[0] === 'setText');
    scene.playTime = 61000 - 16;

    scene.update(5000, 16);
    expect(scene.playTime).toBe(61000);
    expect(setText().pop()).toEqual(['setText', 'TIME · 01:01']);
    const count = setText().length;

    scene.update(5000 + 250, 16);
    expect(setText()).toHaveLength(count);

    scene.update(5000 + 251, 16);
    expect(setText()).toHaveLength(count + 1);
  });

  test('剛開始時顯示 00:00', () => {
    scene.update(0, 16);

    expect(scene.timerText.calls.filter(c => c[0] === 'setText').pop()).toEqual(['setText', 'TIME · 00:00']);
  });

  test('暫停期間不計時：遊玩時間只累加每幀的 delta', () => {
    scene.update(2000, 16);
    // 暫停 90 秒後恢復：場景時鐘跳了 90 秒，但暫停時沒有 update
    scene.update(92000, 16);

    expect(scene.playTime).toBe(32);
    expect(scene.timerText.calls.filter(c => c[0] === 'setText').pop()).toEqual(['setText', 'TIME · 00:00']);
  });

  test('沒有計時器或黑板時也能更新', () => {
    scene.timerText = null;
    scene.aiBlackboard = null;

    expect(() => scene.update(2000, 16)).not.toThrow();
  });

  test('按住方向鍵時播放引擎聲，放開後停止', () => {
    const loop = jest.spyOn(scene.audioManager, 'setLoop');
    jest.spyOn(scene, 'applyPlayerGridLock').mockImplementation(() => {});

    scene.cursors.up.isDown = true;
    scene.update(2000, 16);
    expect(loop).toHaveBeenLastCalledWith('move', true);

    scene.cursors.up.isDown = false;
    scene.update(2016, 16);
    expect(loop).toHaveBeenLastCalledWith('move', false);
  });

  test('玩家陣亡（不活躍）時停止引擎聲', () => {
    const loop = jest.spyOn(scene.audioManager, 'setLoop');
    scene.cursors.up.isDown = true;
    scene.player.active = false;

    scene.update(2000, 16);

    expect(loop).toHaveBeenLastCalledWith('move', false);
  });
});

describe('GameScene.handlePlayerInput', () => {
  let scene;

  beforeEach(() => {
    scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
  });

  test.each([
    [['up', 'down', 'left', 'right'], 'up'],
    [['down', 'left', 'right'], 'down'],
    [['left', 'right'], 'left'],
    [['right'], 'right']
  ])('同時按下 %o 且時間相同時，依上下左右順序採用 %s', (pressed, expected) => {
    const lock = jest.spyOn(scene, 'applyPlayerGridLock').mockImplementation(() => {});
    pressed.forEach(key => { scene.cursors[key].isDown = true; });

    scene.handlePlayerInput();

    expect(lock).toHaveBeenCalledWith(expected);
  });

  test.each([
    ['up', 'right'],
    ['up', 'left'],
    ['down', 'right'],
    ['left', 'up'],
    ['right', 'down']
  ])('按著 %s 再壓 %s 時，最後按下的鍵優先', (first, second) => {
    const lock = jest.spyOn(scene, 'applyPlayerGridLock').mockImplementation(() => {});
    scene.cursors[first].isDown = true;
    scene.cursors[first].timeDown = 1000;
    scene.cursors[second].isDown = true;
    scene.cursors[second].timeDown = 1500;

    scene.handlePlayerInput();

    expect(lock).toHaveBeenCalledWith(second);
  });

  test('放開最後按下的鍵後，回到仍按住的鍵', () => {
    const lock = jest.spyOn(scene, 'applyPlayerGridLock').mockImplementation(() => {});
    scene.cursors.up.isDown = true;
    scene.cursors.up.timeDown = 1000;
    scene.cursors.right.isDown = true;
    scene.cursors.right.timeDown = 1500;
    scene.handlePlayerInput();
    expect(lock).toHaveBeenLastCalledWith('right');

    scene.cursors.right.isDown = false;
    scene.handlePlayerInput();
    expect(lock).toHaveBeenLastCalledWith('up');
  });

  test('較早按下但仍按住的鍵，不會被已放開的新鍵影響', () => {
    const lock = jest.spyOn(scene, 'applyPlayerGridLock').mockImplementation(() => {});
    scene.cursors.left.isDown = true;
    scene.cursors.left.timeDown = 1000;
    scene.cursors.down.isDown = false;
    scene.cursors.down.timeDown = 2000;

    scene.handlePlayerInput();

    expect(lock).toHaveBeenCalledWith('left');
  });

  test('resolveInputDirection 沒有按鍵時回傳 null', () => {
    expect(scene.resolveInputDirection()).toBeNull();
  });

  test('沒有按方向鍵時停止', () => {
    const stop = jest.spyOn(scene.player, 'stop');
    const lock = jest.spyOn(scene, 'applyPlayerGridLock');

    expect(scene.handlePlayerInput()).toBe(false);

    expect(stop).toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });

  test('按住方向鍵時回傳 true（移動中）', () => {
    jest.spyOn(scene, 'applyPlayerGridLock').mockImplementation(() => {});
    scene.cursors.left.isDown = true;

    expect(scene.handlePlayerInput()).toBe(true);
  });

  test('剛按下空白鍵時射擊，並記錄射擊數', () => {
    const shoot = jest.spyOn(scene.player, 'shoot');
    const justDown = jest.spyOn(Phaser.Input.Keyboard, 'JustDown').mockReturnValue(true);

    scene.handlePlayerInput();

    expect(justDown).toHaveBeenCalledWith(scene.fireKey);
    expect(shoot).toHaveBeenCalled();
    expect(scene.stageStats.bulletsShot).toBe(1);
  });

  test('冷卻中或子彈已達上限（沒有射出）時不計入射擊數', () => {
    jest.spyOn(scene.player, 'shoot').mockReturnValue(null);
    jest.spyOn(Phaser.Input.Keyboard, 'JustDown').mockReturnValue(true);

    scene.handlePlayerInput();

    expect(scene.stageStats.bulletsShot).toBe(0);
  });

  test('沒有按空白鍵時不射擊', () => {
    const shoot = jest.spyOn(scene.player, 'shoot');

    scene.handlePlayerInput();

    expect(shoot).not.toHaveBeenCalled();
    expect(scene.stageStats.bulletsShot).toBe(0);
  });
});

describe('GameScene.shutdown', () => {
  test('應該移除事件監聽並清理物件池與黑板', () => {
    const scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
    const bullet = scene.bulletPool.pool[0];
    bullet.destroy = jest.fn();
    scene.aiBlackboard.threatLevel = 99;

    scene.shutdown();

    expect(scene.events.off).toHaveBeenCalledWith(EVENTS.PLAYER_DESTROYED);
    expect(scene.events.off).toHaveBeenCalledWith(EVENTS.ENEMY_DESTROYED);
    expect(scene.events.off).toHaveBeenCalledWith(EVENTS.SCORE_CHANGED);
    expect(scene.events.off).toHaveBeenCalledWith(EVENTS.LIVES_CHANGED);
    expect(bullet.destroy).toHaveBeenCalled();
    expect(scene.bulletPool.getStats().totalSize).toBe(0);
    expect(scene.aiBlackboard.threatLevel).toBe(0);
  });

  test('應該停止所有循環音效（引擎聲）', () => {
    const scene = makeGameScene({ levelData: makeLevel() });
    scene.init({ level: 2 });
    scene.create();
    const destroy = jest.spyOn(scene.audioManager, 'destroy');

    scene.shutdown();

    expect(destroy).toHaveBeenCalled();
  });

  test('系統尚未初始化時也能清理', () => {
    const scene = makeGameScene();

    expect(() => scene.shutdown()).not.toThrow();
  });
});

describe('GameScene 統計資料', () => {
  const startStage = (data) => {
    const scene = makeGameScene({ levelData: makeLevel() });
    scene.init(data);
    scene.create();
    return scene;
  };

  test('init 重設本關統計', () => {
    const scene = makeGameScene();
    scene.playTime = 5000;
    scene.stageStats = { bulletsShot: 9, powerUpsCollected: 9 };

    scene.init({ level: 1 });

    expect(scene.playTime).toBe(0);
    expect(scene.stageStats).toEqual({ bulletsShot: 0, powerUpsCollected: 0 });
  });

  test('新的一局才記一場遊戲：過關進下一關不重複計算', () => {
    startStage({ level: 1 });
    expect(new SaveManager().getStatistics().gamesPlayed).toBe(1);

    startStage({ level: 2, lives: 3, starLevel: 1 });
    expect(new SaveManager().getStatistics().gamesPlayed).toBe(1);

    // 遊戲結束後重來 / 暫停選單重新開始都只帶關卡編號
    startStage({ level: 1 });
    expect(new SaveManager().getStatistics().gamesPlayed).toBe(2);
  });

  test('recordStat 累加本關統計', () => {
    const scene = startStage({ level: 1 });

    scene.recordStat('powerUpsCollected');
    scene.recordStat('powerUpsCollected');
    scene.recordStat('bulletsShot');

    expect(scene.stageStats).toEqual({ bulletsShot: 1, powerUpsCollected: 2 });
  });

  test('場景關閉時寫入本關統計（遊玩時間四捨五入成秒），每關累加', () => {
    const first = startStage({ level: 1 });
    first.gameState.enemiesKilled = 7;
    first.stageStats = { bulletsShot: 30, powerUpsCollected: 2 };
    first.playTime = 61499;
    first.shutdown();

    const second = startStage({ level: 2, lives: 2 });
    second.gameState.enemiesKilled = 5;
    second.stageStats = { bulletsShot: 12, powerUpsCollected: 1 };
    second.playTime = 30500;
    second.shutdown();

    expect(new SaveManager().getStatistics()).toMatchObject({
      totalEnemiesDestroyed: 12,
      bulletsShot: 42,
      powerUpsCollected: 3,
      totalPlayTime: 61 + 31
    });
  });

  test('拾取道具時計入道具數', () => {
    const scene = startStage({ level: 1 });
    const powerUp = { active: true, x: 0, y: 0, powerUpType: 'TANK', destroy: jest.fn() };

    scene.collisionSystem.onPlayerPowerUpCollision(scene.player, powerUp);

    expect(scene.stageStats.powerUpsCollected).toBe(1);
  });
});
