/**
 * GameScene 遊戲場景單元測試
 * 測試安全生成位置檢查與經典道具掉落邏輯（真實實作）
 */

import GameScene from '../../src/scenes/GameScene';
import { TILE_TYPES, GAME_CONFIG } from '../../src/utils/Constants';

/**
 * 以真實 GameScene 建立只含關卡資料的場景替身
 */
const makeScene = (levelData) => {
  const scene = new GameScene();
  scene.levelData = levelData;
  return scene;
};

beforeEach(() => {
  // findSafeSpawnPosition 會輸出搜尋過程，測試中靜音
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GameScene - 安全生成位置檢查', () => {

  describe('isPositionSafe', () => {
    test('空地 (0) 應該是安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(1, 1, map)).toBe(true);
    });

    test('冰地 (4) 應該是安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 4, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(1, 1, map)).toBe(true);
    });

    test('森林 (5) 應該是安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 5, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(1, 1, map)).toBe(true);
    });

    test('磚牆 (1) 應該是不安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(1, 1, map)).toBe(false);
    });

    test('鋼牆 (2) 應該是不安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 2, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(1, 1, map)).toBe(false);
    });

    test('水域 (3) 應該是不安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 3, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(1, 1, map)).toBe(false);
    });

    test('基地 (6) 應該是不安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 6, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(1, 1, map)).toBe(false);
    });

    test('超出地圖邊界（負數）應該是不安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(-1, 1, map)).toBe(false);
      expect(scene.isPositionSafe(1, -1, map)).toBe(false);
    });

    test('超出地圖邊界（超過範圍）應該是不安全的', () => {
      const map = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(3, 1, map)).toBe(false);
      expect(scene.isPositionSafe(1, 3, map)).toBe(false);
    });
  });

  describe('findSafeSpawnPosition', () => {
    test('原始位置安全時，應該返回原始位置', () => {
      const map = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0]
      ];
      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(2, 2);
      expect(result).toEqual({ x: 2, y: 2 });
    });

    test('原始位置在磚牆上，應該尋找附近的空地', () => {
      const map = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0], // 中間是磚牆
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0]
      ];
      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(2, 2);

      // 應該找到附近的安全位置（不是原始位置）
      expect(result).not.toEqual({ x: 2, y: 2 });

      // 驗證找到的位置確實是安全的
      expect(scene.isPositionSafe(result.x, result.y, map)).toBe(true);
    });

    test('被牆壁包圍時，應該能找到外圍的空地', () => {
      const map = [
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 1, 1, 1, 0], // 中心被牆壁包圍
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
      ];
      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(2, 2);

      // 應該找到外圍的安全位置
      expect(scene.isPositionSafe(result.x, result.y, map)).toBe(true);

      // 確保不在中心的牆壁區域
      const isInWallArea = result.x >= 1 && result.x <= 3 && result.y >= 1 && result.y <= 3;
      expect(isInWallArea).toBe(false);
    });

    test('應該優先選擇最近的安全位置', () => {
      const map = [
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 0],
        [0, 1, 1, 0, 0], // 右邊有空地
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
      ];
      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(2, 2);

      // 應該找到距離為 1 的位置 (3, 2)
      expect(result).toEqual({ x: 3, y: 2 });
    });

    test('原始位置在冰地上，應該返回原始位置（冰地是安全的）', () => {
      const map = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 4, 0, 0], // 中間是冰地
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0]
      ];
      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(2, 2);
      expect(result).toEqual({ x: 2, y: 2 });
    });

    test('原始位置在森林上，應該返回原始位置（森林是安全的）', () => {
      const map = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 5, 0, 0], // 中間是森林
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0]
      ];
      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(2, 2);
      expect(result).toEqual({ x: 2, y: 2 });
    });

    test('應該輸出搜尋過程的提示', () => {
      const map = [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });

      scene.findSafeSpawnPosition(1, 1);

      expect(console.warn).toHaveBeenCalledWith('⚠️ 玩家生成位置 (1, 1) 不安全，正在尋找替代位置...');
    });

    test('完全沒有安全位置時應該記錄錯誤', () => {
      const scene = makeScene({ map: [[1]] });

      scene.findSafeSpawnPosition(0, 0);

      expect(console.error).toHaveBeenCalledWith('❌ 無法找到安全生成位置，使用預設位置 (8, 24)');
    });

    test('完全沒有安全位置時，應該返回預設位置 (8, 24)', () => {
      // 創建一個小地圖，全部都是牆壁
      const map = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1]
      ];
      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(1, 1);

      // 應該返回預設位置
      expect(result).toEqual({ x: 8, y: 24 });
    });

    test('真實場景：關卡 4 的問題位置 (8, 24)', () => {
      // 模擬關卡 4 第 24 行的部分地圖
      const map = new Array(26).fill(null).map(() => new Array(26).fill(0));

      // 設置第 24 行 (索引 23) 的磚牆
      map[23][8] = 1; // 原本的問題位置
      map[23][9] = 1;
      map[23][10] = 1;
      map[23][11] = 1;
      map[23][12] = 1;
      map[23][13] = 1;
      map[23][14] = 1;
      map[23][15] = 1;

      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(8, 23);

      // 應該找到附近的安全位置
      expect(result).not.toEqual({ x: 8, y: 23 });
      expect(scene.isPositionSafe(result.x, result.y, map)).toBe(true);
    });

    test('真實場景：關卡 5 的問題位置 (8, 24)', () => {
      // 模擬關卡 5 第 24 行的部分地圖
      const map = new Array(26).fill(null).map(() => new Array(26).fill(0));

      // 設置第 24 行 (索引 23) 的磚牆
      map[23][8] = 1; // 原本的問題位置
      map[23][9] = 1;
      map[23][10] = 2; // 鋼牆
      map[23][11] = 2;
      map[23][12] = 2;
      map[23][13] = 2;
      map[23][14] = 2;
      map[23][15] = 1;

      const scene = makeScene({ map });
      const result = scene.findSafeSpawnPosition(8, 23);

      // 應該找到附近的安全位置
      expect(result).not.toEqual({ x: 8, y: 23 });
      expect(scene.isPositionSafe(result.x, result.y, map)).toBe(true);
    });
  });

  describe('邊界情況測試', () => {
    test('地圖邊角位置應該正確處理', () => {
      const map = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ];
      const scene = makeScene({ map });

      // 測試四個角落
      expect(scene.isPositionSafe(0, 0, map)).toBe(true);
      expect(scene.isPositionSafe(2, 0, map)).toBe(true);
      expect(scene.isPositionSafe(0, 2, map)).toBe(true);
      expect(scene.isPositionSafe(2, 2, map)).toBe(true);
    });

    test('1x1 地圖應該正確處理', () => {
      const map = [[0]];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(0, 0, map)).toBe(true);
    });

    test('空地圖應該不會崩潰', () => {
      const map = [];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(0, 0, map)).toBe(false);
    });

    test('地圖只有一行時應該正確處理', () => {
      const map = [[0, 1, 0, 4, 5]];
      const scene = makeScene({ map });
      expect(scene.isPositionSafe(0, 0, map)).toBe(true);  // 空地
      expect(scene.isPositionSafe(1, 0, map)).toBe(false); // 磚牆
      expect(scene.isPositionSafe(3, 0, map)).toBe(true);  // 冰地
      expect(scene.isPositionSafe(4, 0, map)).toBe(true);  // 森林
    });
  });
});

describe('GameScene - 經典道具掉落機制', () => {
  /**
   * 建立可呼叫 onEnemyDestroyed 的場景替身（UI 與道具生成以 mock 取代）
   */
  const makePowerUpScene = (levelData) => {
    const scene = makeScene(levelData);
    scene.gameState = { enemiesKilled: 0, enemiesRemaining: 10 };
    scene.enemyQueue = [];
    scene.powerUpsSpawned = [];
    scene.updateEnemies = jest.fn();
    scene.levelComplete = jest.fn();
    scene.spawnPowerUp = jest.fn((x, y, type) => scene.powerUpsSpawned.push({ x, y, type }));
    return scene;
  };

  describe('經典觸發點測試', () => {
    test('第 4 個敵人被擊毀時應該掉落道具', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      const scene = makePowerUpScene({ map });

      // 擊毀前 3 個敵人
      scene.onEnemyDestroyed();
      scene.onEnemyDestroyed();
      scene.onEnemyDestroyed();
      expect(scene.powerUpsSpawned.length).toBe(0);

      // 擊毀第 4 個敵人
      scene.onEnemyDestroyed();
      expect(scene.powerUpsSpawned.length).toBe(1);
      expect(scene.gameState.enemiesKilled).toBe(4);
    });

    test('第 11 個敵人被擊毀時應該掉落道具', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      const scene = makePowerUpScene({ map });

      // 擊毀 11 個敵人
      for (let i = 0; i < 11; i++) {
        scene.onEnemyDestroyed();
      }

      // 應該在第 4 和第 11 個敵人處掉落 2 個道具
      expect(scene.powerUpsSpawned.length).toBe(2);
      expect(scene.gameState.enemiesKilled).toBe(11);
    });

    test('第 18 個敵人被擊毀時應該掉落道具', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      const scene = makePowerUpScene({ map });

      // 擊毀 18 個敵人
      for (let i = 0; i < 18; i++) {
        scene.onEnemyDestroyed();
      }

      // 應該在第 4、11、18 個敵人處掉落 3 個道具
      expect(scene.powerUpsSpawned.length).toBe(3);
      expect(scene.gameState.enemiesKilled).toBe(18);
    });

    test('擊毀 20 個敵人應該只掉落 3 個道具', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      const scene = makePowerUpScene({ map });

      // 擊毀 20 個敵人
      for (let i = 0; i < 20; i++) {
        scene.onEnemyDestroyed();
      }

      // 只在第 4、11、18 處掉落道具
      expect(scene.powerUpsSpawned.length).toBe(3);
    });
  });

  describe('隨機位置生成測試', () => {
    test('應該在空地生成道具', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      const scene = makePowerUpScene({ map });

      const pos = scene.getRandomEmptyPosition();
      expect(pos).toBeDefined();
      expect(scene.isPositionSafe(pos.x, pos.y, map)).toBe(true);
    });

    test('應該避開磚牆和鋼牆', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      // 在地圖中間放置一些障礙物
      for (let i = 10; i < 16; i++) {
        for (let j = 10; j < 16; j++) {
          map[i][j] = TILE_TYPES.BRICK;
        }
      }

      const scene = makePowerUpScene({ map });
      const pos = scene.getRandomEmptyPosition();

      expect(pos).toBeDefined();
      expect(scene.isPositionSafe(pos.x, pos.y, map)).toBe(true);
      // 確保不在障礙物區域
      expect(pos.x < 10 || pos.x >= 16 || pos.y < 10 || pos.y >= 16).toBe(true);
    });

    test('應該可以在冰地生成道具', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.ICE));
      const scene = makePowerUpScene({ map });

      const pos = scene.getRandomEmptyPosition();
      expect(pos).toBeDefined();
      expect(map[pos.y][pos.x]).toBe(TILE_TYPES.ICE);
    });

    test('應該可以在森林生成道具', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.FOREST));
      const scene = makePowerUpScene({ map });

      const pos = scene.getRandomEmptyPosition();
      expect(pos).toBeDefined();
      expect(map[pos.y][pos.x]).toBe(TILE_TYPES.FOREST);
    });

    test('地圖邊緣應該被排除（避免生成在邊界）', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      const scene = makePowerUpScene({ map });

      const pos = scene.getRandomEmptyPosition();
      expect(pos).toBeDefined();
      // 確保不在最外層 2 格邊界
      expect(pos.x).toBeGreaterThanOrEqual(2);
      expect(pos.x).toBeLessThan(24);
      expect(pos.y).toBeGreaterThanOrEqual(2);
      expect(pos.y).toBeLessThan(24);
    });
  });

  describe('道具位置有效性測試', () => {
    test('道具應該生成在可達位置', () => {
      const map = Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY));
      const scene = makePowerUpScene({ map });

      // 擊毀第 4 個敵人觸發道具
      for (let i = 0; i < 4; i++) {
        scene.onEnemyDestroyed();
      }

      expect(scene.powerUpsSpawned.length).toBe(1);
      const powerUp = scene.powerUpsSpawned[0];

      // 檢查道具位置的有效性（轉換回格子座標，扣除遊戲場 Y 偏移）
      const tileSize = GAME_CONFIG.TILE_SIZE;
      const tileX = Math.floor(powerUp.x / tileSize);
      const tileY = Math.floor((powerUp.y - GAME_CONFIG.PLAY_OFFSET_Y) / tileSize);

      expect(powerUp.x).toBe(tileX * tileSize + tileSize / 2);
      expect(powerUp.y).toBe(tileY * tileSize + tileSize / 2 + GAME_CONFIG.PLAY_OFFSET_Y);
      // 不指定類型，交給 spawnPowerUp 隨機
      expect(powerUp.type).toBeUndefined();

      expect(scene.isPositionSafe(tileX, tileY, map)).toBe(true);
    });
  });
});
