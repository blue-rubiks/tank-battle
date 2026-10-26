/**
 * 基地防護（鏟子道具）測試
 * 重點：重複拾取時延長時間而非疊加，
 * 原牆（磚/鋼/水）在防護結束後依類型恢復
 */

import GameScene from '../../src/scenes/GameScene';
import BrickWall from '../../src/entities/BrickWall';
import SteelWall from '../../src/entities/SteelWall';
import Water from '../../src/entities/Water';
import { TILE_TYPES, GAME_CONFIG } from '../../src/utils/Constants';

describe('基地防護（鏟子道具）', () => {
  let scene;
  let pendingTimers;

  /**
   * 建立可手動觸發 delayedCall 的 GameScene 測試替身
   */
  const createScene = (existingWalls = []) => {
    pendingTimers = [];

    const s = new GameScene();
    s.base = { isDestroyed: false };
    s.gameState = { baseProtected: false };
    s.levelData = {
      basePosition: { x: 12, y: 24 },
      map: Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY))
    };
    s.add = { existing: jest.fn() };
    s.collisionSystem = {
      addWall: jest.fn(),
      wallGroup: { getChildren: () => existingWalls }
    };
    s.time = {
      delayedCall: jest.fn((duration, callback) => {
        const timer = { duration, callback, removed: false, remove: jest.fn(function () { this.removed = true; }) };
        pendingTimers.push(timer);
        return timer;
      })
    };
    return s;
  };

  /**
   * 在指定世界座標建立一面測試用原牆
   */
  const makeExistingWall = (gridX, gridY, type) => {
    const tileSize = GAME_CONFIG.TILE_SIZE;
    return {
      active: true,
      type,
      x: gridX * tileSize + tileSize / 2,
      y: gridY * tileSize + tileSize / 2 + GAME_CONFIG.PLAY_OFFSET_Y,
      destroy: jest.fn(function () { this.active = false; })
    };
  };

  beforeEach(() => {
    scene = createScene();
  });

  test('啟動防護時應該在基地周圍建立 8 面鋼牆', () => {
    scene.activateBaseProtection(15000);

    expect(scene.gameState.baseProtected).toBe(true);
    expect(scene.baseProtectionWalls).toHaveLength(8);
    expect(scene.collisionSystem.addWall).toHaveBeenCalledTimes(8);

    // 地圖資料同步為鋼牆
    expect(scene.levelData.map[23][11]).toBe(TILE_TYPES.STEEL);
    expect(scene.levelData.map[24][11]).toBe(TILE_TYPES.STEEL);
  });

  test('防護到期後應該移除鋼牆並恢復原本的磚牆', () => {
    const brick = makeExistingWall(11, 23, 'brick');
    scene = createScene([brick]);

    scene.activateBaseProtection(15000);
    expect(brick.destroy).toHaveBeenCalled();

    // 觸發到期
    pendingTimers[0].callback();

    expect(scene.gameState.baseProtected).toBe(false);
    // 原磚牆恢復：addWall 被呼叫 8（鋼牆）+ 1（恢復磚牆）次
    expect(scene.collisionSystem.addWall).toHaveBeenCalledTimes(9);
    expect(scene.levelData.map[23][11]).toBe(TILE_TYPES.BRICK);
  });

  test('防護期間重複拾取應該重設計時器而非重建牆', () => {
    scene.activateBaseProtection(15000);
    const firstTimer = pendingTimers[0];
    const wallsAfterFirst = scene.collisionSystem.addWall.mock.calls.length;

    // 防護中再次拾取
    scene.activateBaseProtection(15000);

    // 第一個計時器被取消、不重建牆
    expect(firstTimer.remove).toHaveBeenCalled();
    expect(scene.collisionSystem.addWall).toHaveBeenCalledTimes(wallsAfterFirst);
    expect(pendingTimers).toHaveLength(2);

    // 只有新計時器到期才會結束防護
    pendingTimers[1].callback();
    expect(scene.gameState.baseProtected).toBe(false);
  });

  test('原本是鋼牆時，防護結束後應該恢復鋼牆而非磚牆', () => {
    const steel = makeExistingWall(13, 23, 'steel');
    scene = createScene([steel]);

    scene.activateBaseProtection(15000);
    pendingTimers[0].callback();

    expect(scene.levelData.map[23][13]).toBe(TILE_TYPES.STEEL);
  });

  test('基地已被摧毀時不應該啟動防護', () => {
    scene.base.isDestroyed = true;
    scene.activateBaseProtection(15000);

    expect(scene.gameState.baseProtected).toBe(false);
    expect(scene.collisionSystem.addWall).not.toHaveBeenCalled();
  });
});

describe('基地防護 - 牆位置與恢復細節', () => {
  const TILE = GAME_CONFIG.TILE_SIZE;
  const toWorld = (gx, gy) => ({ x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 + GAME_CONFIG.PLAY_OFFSET_Y });
  let timers;

  const createScene = (existingWalls = []) => {
    timers = [];
    const s = new GameScene();
    s.base = { isDestroyed: false };
    s.gameState = { baseProtected: false };
    s.levelData = {
      basePosition: { x: 12, y: 24 },
      map: Array(26).fill(null).map(() => Array(26).fill(TILE_TYPES.EMPTY))
    };
    s.add = { existing: jest.fn() };
    s.tweens = { add: jest.fn() };
    s.collisionSystem = {
      addWall: jest.fn(),
      wallGroup: { getChildren: () => existingWalls }
    };
    s.time = {
      delayedCall: jest.fn((delay, callback) => {
        const timer = { delay, callback, remove: jest.fn() };
        timers.push(timer);
        return timer;
      })
    };
    return s;
  };

  const makeWall = (gx, gy, type, active = true) => ({
    ...toWorld(gx, gy),
    type,
    active,
    destroy: jest.fn(function () { this.active = false; })
  });

  test('鋼牆應該剛好圍住基地周圍 8 格（不含基地本身）', () => {
    const scene = createScene();

    scene.activateBaseProtection(15000);

    const positions = scene.baseProtectionWalls.map(w => `${w.x},${w.y}`).sort();
    const expected = [];
    for (let gx = 11; gx <= 13; gx++) {
      for (let gy = 23; gy <= 25; gy++) {
        if (gx === 12 && gy === 24) continue;
        const w = toWorld(gx, gy);
        expected.push(`${w.x},${w.y}`);
      }
    }
    expect(positions).toEqual(expected.sort());
    expect(timers[0].delay).toBe(15000);
  });

  test('只取代同一格且仍存在的原牆', () => {
    const target = makeWall(11, 23, 'brick');
    const sameColumn = makeWall(11, 20, 'brick');
    const destroyed = makeWall(13, 23, 'steel', false);
    const scene = createScene([sameColumn, destroyed, target]);

    scene.activateBaseProtection(15000);

    expect(target.destroy).toHaveBeenCalled();
    expect(sameColumn.destroy).not.toHaveBeenCalled();
    expect(destroyed.destroy).not.toHaveBeenCalled();
    expect(scene.savedBaseWalls).toEqual([{ ...toWorld(11, 23), type: 'brick' }]);
  });

  test('重複拾取時取消舊計時器但不觸發其回呼', () => {
    const scene = createScene();
    scene.activateBaseProtection(15000);

    scene.activateBaseProtection(15000);

    expect(timers[0].remove).toHaveBeenCalledWith(false);
    expect(scene.gameState.baseProtected).toBe(true);
  });

  test('防護結束時移除仍存在的防護鋼牆，已被打掉的不重複移除', () => {
    const scene = createScene();
    scene.activateBaseProtection(15000);
    const walls = scene.baseProtectionWalls;
    const destroySpies = walls.map(w => jest.spyOn(w, 'destroy'));
    walls[0].active = false;

    timers[0].callback();

    expect(destroySpies[0]).not.toHaveBeenCalled();
    destroySpies.slice(1).forEach(spy => expect(spy).toHaveBeenCalled());
    expect(scene.baseProtectionWalls).toEqual([]);
  });

  test.each([
    ['brick', BrickWall, TILE_TYPES.BRICK],
    ['steel', SteelWall, TILE_TYPES.STEEL],
    ['water', Water, TILE_TYPES.WATER]
  ])('原本是 %s 時恢復成同類型的牆並同步地圖', (type, WallClass, tile) => {
    const scene = createScene([makeWall(11, 23, type)]);
    scene.activateBaseProtection(15000);
    scene.collisionSystem.addWall.mockClear();

    timers[0].callback();

    const restored = scene.collisionSystem.addWall.mock.calls.map(c => c[0]);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toBeInstanceOf(WallClass);
    expect([restored[0].x, restored[0].y]).toEqual(Object.values(toWorld(11, 23)));
    expect(scene.levelData.map[23][11]).toBe(tile);
    expect(scene.savedBaseWalls).toEqual([]);
  });

  test('無法辨識的原牆類型直接略過', () => {
    const scene = createScene();
    scene.activateBaseProtection(15000);
    scene.savedBaseWalls.push({ ...toWorld(11, 23), type: 'lava' });
    scene.collisionSystem.addWall.mockClear();

    expect(() => timers[0].callback()).not.toThrow();
    expect(scene.collisionSystem.addWall).not.toHaveBeenCalled();
  });

  test('從未啟動防護時結束防護也不應該拋錯', () => {
    const scene = createScene();

    expect(() => scene._endBaseProtection()).not.toThrow();
    expect(scene.gameState.baseProtected).toBe(false);
  });
});
