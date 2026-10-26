/**
 * 關卡資料與常數一致性測試
 * 關卡 JSON 以數字編碼地形、以字串引用敵人類型與貼圖，
 * 常數一旦與資料檔脫節，遊戲會在執行期才壞掉
 */

import PreloadScene from '../../src/scenes/PreloadScene';
import GameScene from '../../src/scenes/GameScene';
import {
  GAME_CONFIG,
  TILE_TYPES,
  ENEMY_TYPES,
  POWERUP_TYPES,
  BULLET_CONFIG,
  SCENES,
  EVENTS,
  DIRECTION_ANGLES,
  DIRECTION_VECTORS
} from '../../src/utils/Constants';

const levels = Array.from({ length: GAME_CONFIG.TOTAL_LEVELS }, (_, i) => ({
  n: i + 1,
  data: require(`../../public/data/level_${i + 1}.json`)
}));

describe('關卡總數', () => {
  test('每一關都有對應的關卡檔，且沒有多餘的關卡檔', () => {
    const fs = require('fs');
    const path = require('path');
    const files = fs.readdirSync(path.join(__dirname, '../../public/data'))
      .filter(name => /^level_\d+\.json$/.test(name));

    expect(files).toHaveLength(GAME_CONFIG.TOTAL_LEVELS);
  });

  test('每一關的 levelNumber 與檔名一致', () => {
    levels.forEach(({ n, data }) => expect(data.levelNumber).toBe(n));
  });
});

describe('遊戲場尺寸常數', () => {
  test('遊戲場為 MAP_SIZE × TILE_SIZE 的正方形', () => {
    expect(GAME_CONFIG.WIDTH).toBe(GAME_CONFIG.MAP_SIZE * GAME_CONFIG.TILE_SIZE);
    expect(GAME_CONFIG.PLAY_HEIGHT).toBe(GAME_CONFIG.MAP_SIZE * GAME_CONFIG.TILE_SIZE);
  });

  test('畫布高度 = 上 HUD + 遊戲場 + 下 HUD，遊戲場緊接在上 HUD 之下', () => {
    expect(GAME_CONFIG.HEIGHT).toBe(
      GAME_CONFIG.HUD_TOP_HEIGHT + GAME_CONFIG.PLAY_HEIGHT + GAME_CONFIG.HUD_BOTTOM_HEIGHT
    );
    expect(GAME_CONFIG.PLAY_OFFSET_Y).toBe(GAME_CONFIG.HUD_TOP_HEIGHT);
  });
});

describe('方向常數', () => {
  test('角度與速度向量一致（精靈預設朝上，順時針為正）', () => {
    Object.entries(DIRECTION_VECTORS).forEach(([direction, vector]) => {
      const radians = DIRECTION_ANGLES[direction] * Math.PI / 180;

      // + 0 把 -0 正規化為 0
      expect(Math.round(Math.sin(radians)) + 0).toBe(vector.x);
      expect(Math.round(-Math.cos(radians)) + 0).toBe(vector.y);
      expect(Math.abs(vector.x) + Math.abs(vector.y)).toBe(1);
    });
  });
});

describe('類型表的鍵值一致', () => {
  test.each(Object.entries(ENEMY_TYPES))('敵人 %s 的 key 與表鍵一致', (key, config) => {
    expect(config.key).toBe(key);
    expect(config.health).toBeGreaterThan(0);
  });

  test.each(Object.entries(POWERUP_TYPES))('道具 %s 的 key 與表鍵一致', (key, config) => {
    expect(config.key).toBe(key);
    expect(config.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('識別字串', () => {
  test.each([
    ['場景鍵值', SCENES],
    ['事件名稱', EVENTS]
  ])('%s 必須非空且彼此不重複（重名會讓不同場景 / 事件互相干擾）', (_label, table) => {
    const values = Object.values(table);

    expect(values.length).toBeGreaterThan(0);
    values.forEach(value => {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    });
    expect(new Set(values).size).toBe(values.length);
  });

  test.each(Object.entries(POWERUP_TYPES))('道具 %s 有說明文字（提示訊息會顯示）', (_key, config) => {
    expect(config.description.length).toBeGreaterThan(0);
  });
});

describe('子彈設定', () => {
  test('普通子彈有速度與碰撞箱，且傷害不足以擊穿鋼牆', () => {
    expect(BULLET_CONFIG.SPEED).toBeGreaterThan(0);
    expect(BULLET_CONFIG.SIZE).toBeGreaterThan(0);
    // 鋼牆需要 damage >= 2（星星 Lv.3）
    expect(BULLET_CONFIG.DAMAGE).toBe(1);
  });

  test('玩家與敵人子彈顏色不同', () => {
    expect(typeof BULLET_CONFIG.PLAYER_COLOR).toBe('number');
    expect(typeof BULLET_CONFIG.ENEMY_COLOR).toBe('number');
    expect(BULLET_CONFIG.PLAYER_COLOR).not.toBe(BULLET_CONFIG.ENEMY_COLOR);
  });
});

describe('貼圖鍵值', () => {
  test('所有實體使用的貼圖都由 PreloadScene 產生', () => {
    const scene = new PreloadScene();
    const created = [];
    [
      'createTankSprite',
      'createBulletSprite',
      'createBrickWallSprite',
      'createSteelWallSprite',
      'createWaterSprite',
      'createIceSprite',
      'createForestSprite',
      'createBaseSprite',
      'createPowerUpSprite'
    ].forEach(method => {
      jest.spyOn(scene, method).mockImplementation(key => created.push(key));
    });
    jest.spyOn(scene, 'loadLevelData').mockImplementation(() => {});
    jest.spyOn(scene, 'generateRetroSounds').mockImplementation(() => {});

    scene.loadAssets();

    const required = [
      'player_tank', 'bullet', 'brick', 'steel', 'water', 'ice', 'forest', 'base',
      ...Object.values(ENEMY_TYPES).map(c => c.texture),
      ...Object.values(POWERUP_TYPES).map(c => c.texture)
    ];
    required.forEach(key => expect(created).toContain(key));
  });
});

describe.each(levels)('關卡 $n 資料', ({ data }) => {
  const scene = new GameScene();

  test('地圖尺寸為 MAP_SIZE × MAP_SIZE', () => {
    expect(data.map).toHaveLength(GAME_CONFIG.MAP_SIZE);
    data.map.forEach(row => expect(row).toHaveLength(GAME_CONFIG.MAP_SIZE));
  });

  test('只使用已定義的地形編碼', () => {
    const known = Object.values(TILE_TYPES);
    data.map.flat().forEach(tile => expect(known).toContain(tile));
  });

  test('基地位置正好是唯一的基地格', () => {
    const { x, y } = data.basePosition;

    expect(data.map[y][x]).toBe(TILE_TYPES.BASE);
    expect(data.map.flat().filter(t => t === TILE_TYPES.BASE)).toHaveLength(1);
  });

  test('玩家與敵人出生點都在可生成的地形上', () => {
    const { x, y } = data.playerSpawn;
    expect(scene.isPositionSafe(x, y, data.map)).toBe(true);

    data.enemySpawns.forEach(spawn => {
      expect(scene.isPositionSafe(spawn.x, spawn.y, data.map)).toBe(true);
    });
  });

  test('敵人波次只使用已定義的敵人類型', () => {
    expect(data.enemyWaves.length).toBeGreaterThan(0);
    data.enemyWaves.forEach(wave => {
      expect(Object.keys(ENEMY_TYPES)).toContain(wave.type);
      expect(wave.count).toBeGreaterThan(0);
    });
  });

  test('同屏敵人上限至少 1', () => {
    expect(data.specialRules.maxEnemiesOnScreen).toBeGreaterThanOrEqual(1);
  });
});

describe('地形編碼', () => {
  test('關卡檔以 0~6 編碼地形，常數必須對應', () => {
    // 關卡 JSON 直接存數字，改動編碼會讓所有關卡錯位
    expect(TILE_TYPES).toEqual({
      EMPTY: 0,
      BRICK: 1,
      STEEL: 2,
      WATER: 3,
      ICE: 4,
      FOREST: 5,
      BASE: 6
    });
  });
});
