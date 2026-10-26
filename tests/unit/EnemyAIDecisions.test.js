/**
 * EnemyAI 決策邏輯測試（真實實作）
 * 狀態評估、目標選擇、尋路跟隨、直線移動、撤退、射擊節奏、
 * 卡住檢測、撞牆 / 相撞換向、各狀態行為與統一移動出口
 */

import Phaser from 'phaser';
import EnemyAI from '../../src/systems/EnemyAI';
import GridMovement from '../../src/utils/GridMovement';
import { TILE_TYPES, AI_CONFIG } from '../../src/utils/Constants';

const makeMap = (fill = TILE_TYPES.EMPTY, size = 26) =>
  Array(size).fill(null).map(() => Array(size).fill(fill));

const cell = (gx, gy) => GridMovement.gridToPixel(gx, gy);

const makeTank = (overrides = {}) => ({
  ...cell(5, 5),
  enemyType: 'BASIC',
  direction: 'up',
  speed: 60,
  fireRate: 2000,
  health: 1,
  maxHealth: 1,
  isFrozen: false,
  isDestroyed: false,
  move: jest.fn(),
  stop: jest.fn(),
  face: jest.fn(),
  shoot: jest.fn(),
  body: { velocity: { x: 0, y: 0 } },
  ...overrides
});

const makeScene = (overrides = {}) => ({
  time: { now: 100000 },
  levelData: { map: makeMap() },
  aiBlackboard: null,
  player: null,
  base: null,
  ...overrides
});

describe('EnemyAI 決策邏輯', () => {
  let scene;
  let tank;
  let ai;

  beforeEach(() => {
    scene = makeScene();
    tank = makeTank();
    ai = new EnemyAI(scene, tank);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('_determineTargetPriority', () => {
    test.each([
      ['BASIC', { player: 0.7, base: 0.3 }],
      ['FAST', { player: 0.4, base: 0.6 }],
      ['POWER', { player: 0.8, base: 0.2 }],
      ['ARMOR', { player: 0.8, base: 0.2 }],
      ['UNKNOWN', { player: 0.7, base: 0.3 }]
    ])('%s 的目標偏好', (type, expected) => {
      expect(ai._determineTargetPriority(type)).toEqual(expected);
    });
  });

  describe('_selectTarget', () => {
    const player = { isDestroyed: false };
    const base = { isDestroyed: false };

    test('已有有效目標時 80% 機率維持', () => {
      ai.currentTarget = 'base';
      jest.spyOn(Math, 'random').mockReturnValue(0.79);

      ai._selectTarget(player, base);

      expect(ai.currentTarget).toBe('base');
      expect(Math.random).toHaveBeenCalledTimes(1);
    });

    test('沒抽中維持時依優先級重新選擇', () => {
      ai.currentTarget = 'base';
      const values = [0.8, 0.1];
      jest.spyOn(Math, 'random').mockImplementation(() => values.shift());

      ai._selectTarget(player, base);

      expect(ai.currentTarget).toBe('player');
    });

    test('目前目標已摧毀時一定重新選擇', () => {
      ai.currentTarget = 'player';
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      ai._selectTarget({ isDestroyed: true }, base);

      expect(ai.currentTarget).toBe('base');
    });

    test('目前目標物件不存在時重新選擇', () => {
      ai.currentTarget = 'base';
      jest.spyOn(Math, 'random').mockReturnValue(0);

      ai._selectTarget(player, null);

      expect(ai.currentTarget).toBe('player');
    });

    test('沒有可用目標時清空', () => {
      ai.currentTarget = 'player';

      ai._selectTarget({ isDestroyed: true }, { isDestroyed: true });
      expect(ai.currentTarget).toBeNull();

      ai._selectTarget(null, null);
      expect(ai.currentTarget).toBeNull();
    });

    test('依優先級機率選擇（BASIC：< 0.7 選玩家）', () => {
      const random = jest.spyOn(Math, 'random');

      random.mockReturnValue(0.69);
      ai._selectTarget(player, base);
      expect(ai.currentTarget).toBe('player');

      ai.currentTarget = null;
      random.mockReturnValue(0.7);
      ai._selectTarget(player, base);
      expect(ai.currentTarget).toBe('base');
    });
  });

  test('_getCurrentTarget 應該對應到場景中的物件', () => {
    scene.player = { id: 'p' };
    scene.base = { id: 'b' };

    ai.currentTarget = 'player';
    expect(ai._getCurrentTarget()).toBe(scene.player);
    ai.currentTarget = 'base';
    expect(ai._getCurrentTarget()).toBe(scene.base);
    ai.currentTarget = null;
    expect(ai._getCurrentTarget()).toBeNull();
  });

  describe('_evaluateState', () => {
    const forceTarget = (target) => {
      jest.spyOn(ai, '_selectTarget').mockImplementation(() => { ai.currentTarget = target; });
    };
    const placePlayer = (distance) => {
      scene.player = { x: tank.x, y: tank.y + distance, isDestroyed: false };
    };

    test('沒有目標時巡邏', () => {
      ai.stateMachine.setState('chase');
      forceTarget(null);

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe('patrol');
    });

    test('目標物件不存在或已摧毀時清除目標並巡邏', () => {
      ai.stateMachine.setState('chase');
      forceTarget('player');
      scene.player = { x: 0, y: 0, isDestroyed: true };

      ai._evaluateState();
      expect(ai.currentTarget).toBeNull();
      expect(ai.stateMachine.getCurrentState()).toBe('patrol');

      ai.stateMachine.setState('chase');
      scene.player = null;
      ai._evaluateState();
      expect(ai.stateMachine.getCurrentState()).toBe('patrol');
    });

    test('沒有 isDestroyed 欄位的目標視為有效', () => {
      forceTarget('base');
      scene.base = { x: tank.x, y: tank.y + 100 };

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe('attack');
    });

    test('攻擊玩家時血量低於 30% 撤退', () => {
      forceTarget('player');
      placePlayer(50);
      tank.maxHealth = 10;
      tank.health = 2;

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe('retreat');
    });

    test('血量剛好 30% 不撤退', () => {
      forceTarget('player');
      placePlayer(50);
      tank.maxHealth = 10;
      tank.health = 3;

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe('attack');
    });

    test('攻擊基地時即使低血量也不撤退', () => {
      forceTarget('base');
      scene.base = { x: tank.x, y: tank.y + 50, isDestroyed: false };
      tank.maxHealth = 10;
      tank.health = 1;

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe('attack');
    });

    test.each([
      [149, 'attack'],
      [150, 'chase'],
      [299, 'chase'],
      [300, 'patrol']
    ])('與玩家距離 %i 時進入 %s', (distance, state) => {
      ai.stateMachine.setState('retreat');
      forceTarget('player');
      placePlayer(distance);

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe(state);
    });

    test('目標是基地時即使很遠也追逐', () => {
      forceTarget('base');
      scene.base = { x: tank.x, y: tank.y + 600, isDestroyed: false };

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe('chase');
    });
  });

  describe('_moveTowardsTarget - 路徑更新頻率', () => {
    let updatePath;

    beforeEach(() => {
      updatePath = jest.spyOn(ai, '_updatePath');
      jest.spyOn(ai, '_followPath').mockImplementation(() => {});
      jest.spyOn(ai, '_moveDirectly').mockImplementation(() => {});
    });

    test('沒有路徑時立即計算並記錄時間', () => {
      ai._moveTowardsTarget(cell(10, 5));

      expect(updatePath).toHaveBeenCalledWith(cell(10, 5));
      expect(ai.lastPathUpdate).toBe(scene.time.now);
    });

    test('追逐狀態每 500ms 更新路徑', () => {
      ai.stateMachine.setState('chase');
      ai.currentPath = [cell(10, 5)];

      ai.lastPathUpdate = scene.time.now - 500;
      ai._moveTowardsTarget(cell(10, 5));
      expect(updatePath).not.toHaveBeenCalled();

      ai.lastPathUpdate = scene.time.now - 501;
      ai._moveTowardsTarget(cell(10, 5));
      expect(updatePath).toHaveBeenCalledTimes(1);
    });

    test('其他狀態每 1000ms 更新路徑', () => {
      ai.currentPath = [cell(10, 5)];

      ai.lastPathUpdate = scene.time.now - 1000;
      ai._moveTowardsTarget(cell(10, 5));
      expect(updatePath).not.toHaveBeenCalled();

      ai.lastPathUpdate = scene.time.now - 1001;
      ai._moveTowardsTarget(cell(10, 5));
      expect(updatePath).toHaveBeenCalledTimes(1);
    });

    test('有路徑時沿路徑移動，否則直線前往', () => {
      ai.currentPath = [cell(10, 5)];
      ai.lastPathUpdate = scene.time.now;
      ai._moveTowardsTarget(cell(10, 5));
      expect(ai._followPath).toHaveBeenCalledTimes(1);
      expect(ai._moveDirectly).not.toHaveBeenCalled();

      ai.currentPath = [];
      ai._moveTowardsTarget(cell(10, 5));
      expect(ai._moveDirectly).toHaveBeenCalledWith(cell(10, 5));
    });
  });

  describe('_updatePath', () => {
    test('應該以 A* 計算並簡化路徑', () => {
      ai.currentWaypointIndex = 3;

      ai._updatePath(cell(5, 10));

      // 直線路徑簡化後只剩下一格（方向起點）與終點
      expect(ai.currentPath).toEqual([
        { ...cell(5, 6), gridX: 5, gridY: 6 },
        { ...cell(5, 10), gridX: 5, gridY: 10 }
      ]);
      expect(ai.currentWaypointIndex).toBe(0);
    });

    test('應該繞過牆壁', () => {
      for (let x = 3; x <= 7; x++) scene.levelData.map[7][x] = TILE_TYPES.STEEL;

      ai._updatePath(cell(5, 10));

      const visited = ai.currentPath.map(p => `${p.gridX},${p.gridY}`);
      expect(visited).not.toContain('5,7');
      expect(ai.currentPath[ai.currentPath.length - 1]).toMatchObject({ gridX: 5, gridY: 10 });
    });

    test('找不到路徑或已在目標上時清除路徑', () => {
      ai.currentPath = [cell(1, 1)];
      const map = scene.levelData.map;
      [[4, 9], [6, 9], [5, 8], [5, 10]].forEach(([x, y]) => { map[y][x] = TILE_TYPES.WATER; });
      ai._updatePath(cell(5, 9));
      expect(ai.currentPath).toBeNull();

      ai.currentPath = [cell(1, 1)];
      ai._updatePath({ x: tank.x, y: tank.y });
      expect(ai.currentPath).toBeNull();
    });

    test('沒有地圖時不更新', () => {
      ai.currentPath = [cell(1, 1)];
      scene.levelData = null;
      ai._updatePath(cell(5, 10));
      expect(ai.currentPath).toEqual([cell(1, 1)]);

      scene.levelData = {};
      ai._updatePath(cell(5, 10));
      expect(ai.currentPath).toEqual([cell(1, 1)]);
    });
  });

  describe('_followPath', () => {
    const follow = (dx, dy, current = 'down') => {
      ai.desiredDirection = current;
      ai.currentPath = [{ x: tank.x + dx, y: tank.y + dy }, { x: 999, y: 999 }];
      ai.currentWaypointIndex = 0;
      ai._followPath();
      return ai.desiredDirection;
    };

    test('沒有路徑或已走完時清除路徑', () => {
      ai.currentPath = null;
      ai._followPath();
      expect(ai.currentPath).toBeNull();

      ai.currentPath = [cell(1, 1)];
      ai.currentWaypointIndex = 1;
      ai._followPath();
      expect(ai.currentPath).toBeNull();
    });

    test.each([
      [100, 0, 'right'],
      [-100, 0, 'left'],
      [0, 100, 'down'],
      [0, -100, 'up'],
      [100, 60, 'right'],
      [60, -100, 'up']
    ])('路徑點在 (%i, %i) 時朝 %s', (dx, dy, expected) => {
      expect(follow(dx, dy, 'down')).toBe(expected);
    });

    test('軸向差距不到 1.5 倍時維持目前軸向', () => {
      expect(follow(100, 80, 'left')).toBe('right');
      expect(follow(-100, 80, 'right')).toBe('left');
      expect(follow(80, 100, 'up')).toBe('down');
      expect(follow(80, -100, 'down')).toBe('up');
    });

    test('剛好 1.5 倍時視為相近（維持目前軸向）', () => {
      expect(follow(90, 60, 'up')).toBe('down');
      expect(follow(60, 90, 'left')).toBe('right');
    });

    test('目前軸向的偏移在死區內時改用較大偏移的軸', () => {
      // 目前水平移動，但 dx 只有 8（死區內）→ 改看較大的 dy
      expect(follow(8, 10, 'right')).toBe('down');
      expect(follow(10, 8, 'up')).toBe('right');
      expect(follow(-10, -8, 'down')).toBe('left');
      expect(follow(-8, -10, 'left')).toBe('up');
    });

    test('偏移很小（死區內）時維持目前方向', () => {
      expect(follow(7, -7, 'left')).toBe('left');
    });

    test('尚未有移動方向時，兩軸相近就選較大偏移的軸', () => {
      expect(follow(40, 30, null)).toBe('right');
      expect(follow(30, -40, null)).toBe('up');
    });

    test('到達路徑點（< 16px）時前進到下一個', () => {
      ai.currentPath = [{ x: tank.x + 15, y: tank.y }, { x: tank.x + 200, y: tank.y }];
      ai.currentWaypointIndex = 0;

      ai._followPath();

      expect(ai.currentWaypointIndex).toBe(1);
      expect(ai.currentPath).not.toBeNull();
    });

    test('剛好 16px 尚未到達', () => {
      ai.currentPath = [{ x: tank.x + 16, y: tank.y }, { x: tank.x + 200, y: tank.y }];
      ai.currentWaypointIndex = 0;

      ai._followPath();

      expect(ai.currentWaypointIndex).toBe(0);
      expect(ai.desiredDirection).toBe('right');
    });

    test('到達最後一個路徑點時清除路徑', () => {
      ai.currentPath = [{ x: tank.x + 5, y: tank.y }];
      ai.currentWaypointIndex = 0;

      ai._followPath();

      expect(ai.currentPath).toBeNull();
    });

    test('應該設定移動意圖', () => {
      ai.wantsToMove = false;
      follow(100, 0);

      expect(ai.wantsToMove).toBe(true);
    });
  });

  describe('_moveDirectly - 直線移動與避障', () => {
    // 每次呼叫都是全新情境：清除上一次的繞行紀錄
    const moveTo = (dx, dy, current = 'down') => {
      ai.desiredDirection = current;
      ai.detour = null;
      ai._moveDirectly({ x: tank.x + dx, y: tank.y + dy });
      return ai.desiredDirection;
    };

    test.each([
      [100, 0, 'right'],
      [-100, 0, 'left'],
      [0, 100, 'down'],
      [0, -100, 'up']
    ])('目標在 (%i, %i) 且無障礙時朝 %s', (dx, dy, expected) => {
      expect(moveTo(dx, dy, 'down')).toBe(expected);
    });

    test('軸向相近時維持目前軸向', () => {
      expect(moveTo(100, 90, 'left')).toBe('right');
      expect(moveTo(-100, 90, 'right')).toBe('left');
      expect(moveTo(100, 90, 'up')).toBe('down');
      expect(moveTo(100, -90, 'down')).toBe('up');
    });

    test('剛好 1.5 倍時視為相近', () => {
      expect(moveTo(90, 60, 'up')).toBe('down');
      expect(moveTo(60, 90, 'right')).toBe('right');
    });

    test('死區內不改變方向', () => {
      expect(moveTo(7, 7, 'left')).toBe('left');
    });

    test('首選方向被擋時改走次要方向', () => {
      // 右方被牆擋住，目標在右下 → 改往下
      scene.levelData.map[5][6] = TILE_TYPES.BRICK;
      expect(moveTo(200, 50, 'down')).toBe('down');

      scene.levelData.map = makeMap();
      scene.levelData.map[5][4] = TILE_TYPES.BRICK;
      expect(moveTo(-200, -50, 'down')).toBe('up');
    });

    test('垂直首選被擋時改走水平次要方向', () => {
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;
      expect(moveTo(50, 200, 'down')).toBe('right');

      scene.levelData.map = makeMap();
      scene.levelData.map[4][5] = TILE_TYPES.BRICK;
      expect(moveTo(-50, -200, 'down')).toBe('left');
    });

    test('軸向相近且兩個方向都被擋時使用最安全方向', () => {
      scene.levelData.map[5][6] = TILE_TYPES.BRICK;
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;
      const safest = jest.spyOn(ai, '_chooseSafestDirection').mockReturnValue('left');

      expect(moveTo(100, 90, 'right')).toBe('left');
      expect(safest).toHaveBeenCalled();
    });

    test('沒有安全方向時維持原方向', () => {
      jest.spyOn(ai, '_isDirectionSafe').mockReturnValue(false);
      jest.spyOn(ai, '_chooseSafestDirection').mockReturnValue(null);

      expect(moveTo(100, 0, 'up')).toBe('up');
    });
  });

  describe('_isDirectionSafe', () => {
    test('沒有地圖時視為安全', () => {
      scene.levelData = null;
      expect(ai._isDirectionSafe('up')).toBe(true);

      scene.levelData = {};
      expect(ai._isDirectionSafe('up')).toBe(true);
    });

    test.each([
      [TILE_TYPES.EMPTY, true],
      [TILE_TYPES.ICE, true],
      [TILE_TYPES.FOREST, true],
      [TILE_TYPES.BRICK, false],
      [TILE_TYPES.STEEL, false],
      [TILE_TYPES.WATER, false],
      [TILE_TYPES.BASE, false]
    ])('前方一格為地形 %i 時是否安全：%s', (tile, expected) => {
      scene.levelData.map[4][5] = tile;

      expect(ai._isDirectionSafe('up')).toBe(expected);
    });

    test.each([
      ['down', 5, 6],
      ['left', 4, 5],
      ['right', 6, 5]
    ])('往 %s 時檢查格子 (%i, %i)', (direction, gx, gy) => {
      scene.levelData.map[gy][gx] = TILE_TYPES.BRICK;

      expect(ai._isDirectionSafe(direction)).toBe(false);
    });

    test.each([
      [cell(0, 5), 'left'],
      [cell(25, 5), 'right'],
      [cell(5, 0), 'up'],
      [cell(5, 25), 'down']
    ])('位於 %o 往 %s 會出界，視為不安全', (pos, direction) => {
      Object.assign(tank, pos);

      expect(ai._isDirectionSafe(direction)).toBe(false);
    });
  });

  describe('_moveAwayFromTarget - 撤退方向', () => {
    const awayFrom = (dx, dy, current = 'down') => {
      ai.desiredDirection = current;
      ai.lastDirectionChange = 0;
      ai._moveAwayFromTarget({ x: tank.x + dx, y: tank.y + dy });
      return ai.desiredDirection;
    };

    test.each([
      [100, 0, 'left'],
      [-100, 0, 'right'],
      [0, 100, 'up'],
      [0, -100, 'down']
    ])('目標在 (%i, %i) 時往 %s 撤退', (dx, dy, expected) => {
      expect(awayFrom(dx, dy, 'down')).toBe(expected);
    });

    test('應該清除追逐路徑', () => {
      ai.currentPath = [cell(1, 1)];
      awayFrom(100, 0);

      expect(ai.currentPath).toBeNull();
    });

    test('軸向差距不到 1.3 倍時維持目前方向', () => {
      expect(awayFrom(100, 80, 'right')).toBe('right');
      expect(awayFrom(130, 100, 'up')).toBe('up');
    });

    test('超過 1.3 倍才換向', () => {
      expect(awayFrom(131, 100, 'up')).toBe('left');
      expect(awayFrom(100, 131, 'left')).toBe('up');
    });

    test('200ms 內不換方向', () => {
      ai.desiredDirection = 'down';
      ai.lastDirectionChange = scene.time.now - 199;
      ai._moveAwayFromTarget({ x: tank.x + 100, y: tank.y });
      expect(ai.desiredDirection).toBe('down');

      ai.lastDirectionChange = scene.time.now - 200;
      ai._moveAwayFromTarget({ x: tank.x + 100, y: tank.y });
      expect(ai.desiredDirection).toBe('left');
    });

    test('換向時記錄時間，方向不變則不更新', () => {
      awayFrom(100, 0, 'down');
      expect(ai.lastDirectionChange).toBe(scene.time.now);

      ai.lastDirectionChange = 5;
      ai.desiredDirection = 'left';
      scene.time.now += 1000;
      ai._moveAwayFromTarget({ x: tank.x + 100, y: tank.y });
      expect(ai.lastDirectionChange).toBe(5);
    });

    test('撤退方向被牆擋住時改走最安全方向', () => {
      scene.levelData.map[5][4] = TILE_TYPES.BRICK;
      jest.spyOn(ai, '_chooseSafestDirection').mockReturnValue('up');

      expect(awayFrom(100, 0)).toBe('up');
    });

    test('沒有安全方向時仍嘗試反向撤退', () => {
      scene.levelData.map[5][4] = TILE_TYPES.BRICK;
      jest.spyOn(ai, '_chooseSafestDirection').mockReturnValue(null);

      expect(awayFrom(100, 0)).toBe('left');
    });
  });

  describe('_maintainDistance', () => {
    test.each([
      [181, true],
      [180, false],
      [100, false]
    ])('距離 %i 時是否繼續移動：%s', (distance, expected) => {
      ai.wantsToMove = !expected;
      ai._maintainDistance({ x: tank.x, y: tank.y + distance });

      expect(ai.wantsToMove).toBe(expected);
    });
  });

  describe('射擊節奏', () => {
    test('隨機射擊每 250ms 決策一次、25% 機率', () => {
      const random = jest.spyOn(Math, 'random').mockReturnValue(0.24);

      ai._tryRandomShoot();
      expect(tank.shoot).toHaveBeenCalledTimes(1);
      expect(ai.lastShot).toBe(scene.time.now);
      expect(ai.lastShootDecision).toBe(scene.time.now);

      random.mockReturnValue(0.25);
      ai.lastShot = 0;
      scene.time.now += 250;
      ai._tryRandomShoot();
      expect(tank.shoot).toHaveBeenCalledTimes(1);
      expect(ai.lastShootDecision).toBe(scene.time.now);
    });

    test('決策間隔內不重複決策', () => {
      const random = jest.spyOn(Math, 'random').mockReturnValue(0);
      ai.lastShootDecision = scene.time.now - 249;

      ai._tryRandomShoot();

      expect(random).not.toHaveBeenCalled();
      expect(tank.shoot).not.toHaveBeenCalled();
    });

    test('冷卻中不射擊也不消耗決策', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      ai.lastShot = scene.time.now - 1999;

      ai._tryRandomShoot();

      expect(tank.shoot).not.toHaveBeenCalled();
      expect(ai.lastShootDecision).toBe(0);
    });
  });

  describe('隨機轉向', () => {
    test('每 3 秒有 30% 機率換到其他方向', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.29);
      const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[0]);
      ai.desiredDirection = 'up';

      ai._maybeRandomTurn();

      expect(pick).toHaveBeenCalledWith(['down', 'left', 'right']);
      expect(ai.desiredDirection).toBe('down');
      expect(ai.lastRandomDirectionChange).toBe(scene.time.now);
      expect(ai.lastDirectionChange).toBe(scene.time.now);
    });

    test('沒抽中時不換向但仍重置計時', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.3);
      ai.desiredDirection = 'up';

      ai._maybeRandomTurn();

      expect(ai.desiredDirection).toBe('up');
      expect(ai.lastRandomDirectionChange).toBe(scene.time.now);
    });

    test('間隔未滿 3 秒時不考慮換向', () => {
      const random = jest.spyOn(Math, 'random');
      ai.lastRandomDirectionChange = scene.time.now - 3000;

      ai._maybeRandomTurn();

      expect(random).not.toHaveBeenCalled();
    });
  });

  describe('_chooseSafestDirection', () => {
    test('沒有地圖時選垂直方向', () => {
      scene.levelData = null;
      const perpendicular = jest.spyOn(ai, '_choosePerpendicularDirection').mockReturnValue('left');

      expect(ai._chooseSafestDirection()).toBe('left');
      expect(perpendicular).toHaveBeenCalled();

      scene.levelData = {};
      expect(ai._chooseSafestDirection()).toBe('left');
    });

    test('四周開闊時避免反向，依 上/下/左/右 順序取最高分', () => {
      tank.direction = 'down';

      // up 是反向（-3），down / left / right 同分 → down
      expect(ai._chooseSafestDirection()).toBe('down');
    });

    test('前方一格有牆時改選其他方向', () => {
      tank.direction = 'up';
      scene.levelData.map[4][5] = TILE_TYPES.BRICK;

      expect(ai._chooseSafestDirection()).toBe('left');
    });

    test('前方第二格有牆時分數較低', () => {
      tank.direction = 'left';
      scene.levelData.map[3][5] = TILE_TYPES.STEEL;

      // up 只有 10 分，down 15 分
      expect(ai._chooseSafestDirection()).toBe('down');
    });

    test('冰地與森林視為安全', () => {
      tank.direction = 'right';
      const map = makeMap(TILE_TYPES.BRICK);
      map[5][6] = TILE_TYPES.ICE;
      map[5][7] = TILE_TYPES.FOREST;
      scene.levelData.map = map;

      expect(ai._chooseSafestDirection()).toBe('right');
    });

    test('所有方向都被擋時選分數最高的', () => {
      tank.direction = 'up';
      scene.levelData.map = makeMap(TILE_TYPES.BRICK);

      // 全部 -5，down 是反向 -8 → 第一個最高分 up
      expect(ai._chooseSafestDirection()).toBe('up');
    });

    test('出界的方向分數最低', () => {
      tank.direction = 'up';
      Object.assign(tank, cell(0, 5));
      scene.levelData.map = makeMap(TILE_TYPES.BRICK);

      // left 出界 -10；up/right -5 → up
      expect(ai._chooseSafestDirection()).toBe('up');

      tank.direction = 'right';
      Object.assign(tank, cell(25, 0));
      // up / right 出界，down -5、left 為反向 -8
      expect(ai._chooseSafestDirection()).toBe('down');
    });

    test('只有遠處可走時，得分不足的方向仍不被選為「有效」', () => {
      tank.direction = 'up';
      const map = makeMap(TILE_TYPES.BRICK);
      // 右邊一格是牆、兩格外是空地：-5 + 5 = 0（不算有效）
      map[5][7] = TILE_TYPES.EMPTY;
      // 下方一格空地：+10
      map[6][5] = TILE_TYPES.EMPTY;
      scene.levelData.map = map;

      expect(ai._chooseSafestDirection()).toBe('down');
    });
  });

  describe('_choosePerpendicularDirection', () => {
    test.each([
      ['up', ['left', 'right']],
      ['down', ['left', 'right']],
      ['left', ['up', 'down']],
      ['right', ['up', 'down']],
      ['none', ['up', 'down', 'left', 'right']]
    ])('坦克朝 %s 時從 %o 挑選', (direction, options) => {
      const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[arr.length - 1]);
      tank.direction = direction;

      expect(ai._choosePerpendicularDirection()).toBe(options[options.length - 1]);
      expect(pick).toHaveBeenCalledWith(options);
    });
  });

  describe('_checkIfStuck - 卡住檢測', () => {
    test('主動停車時重置所有卡住狀態並同步位置', () => {
      Object.assign(ai, { stuckTime: 900, stuckTurned: true, stuckWindowTime: 100, stuckWindowDistance: 3 });
      ai.wantsToMove = false;
      tank.x += 10;

      ai._checkIfStuck(16);

      expect(ai.stuckTime).toBe(0);
      expect(ai.stuckTurned).toBe(false);
      expect(ai.stuckWindowTime).toBe(0);
      expect(ai.stuckWindowDistance).toBe(0);
      expect(ai.lastPosition).toEqual({ x: tank.x, y: tank.y });
    });

    test('窗口未滿 250ms 只累計移動量', () => {
      tank.x += 3;
      tank.y += 4;

      ai._checkIfStuck(100);

      expect(ai.stuckWindowTime).toBe(100);
      expect(ai.stuckWindowDistance).toBe(5);
      expect(ai.lastPosition).toEqual({ x: tank.x, y: tank.y });
      expect(ai.stuckTime).toBe(0);
    });

    test('移動量低於預期 25% 視為卡住並累計時間', () => {
      // 速度 60、窗口 250ms → 預期 15px，25% = 3.75px
      tank.x += 3.7;

      ai._checkIfStuck(250);

      expect(ai.stuckTime).toBe(250);
      expect(ai.stuckWindowTime).toBe(0);
      expect(ai.stuckWindowDistance).toBe(0);
    });

    test('移動量達到預期 25% 不算卡住，並清除累計', () => {
      ai.stuckTime = 750;
      ai.stuckTurned = true;
      tank.x += 3.75;

      ai._checkIfStuck(250);

      expect(ai.stuckTime).toBe(0);
      expect(ai.stuckTurned).toBe(false);
    });

    test('卡住滿 1 秒時換一個脫困方向（只換一次）', () => {
      jest.spyOn(ai, '_pickEscapeDirection').mockReturnValue('left');
      ai.currentPath = [cell(1, 1)];
      ai.stuckTime = 750;

      ai._checkIfStuck(250);

      expect(ai.desiredDirection).toBe('left');
      expect(ai.lastDirectionChange).toBe(scene.time.now);
      expect(ai.currentPath).toBeNull();
      expect(ai.stuckTurned).toBe(true);

      ai._pickEscapeDirection.mockReturnValue('right');
      ai._checkIfStuck(250);
      expect(ai.desiredDirection).toBe('left');
    });

    test('卡住不到 1 秒不換向', () => {
      const pick = jest.spyOn(ai, '_pickEscapeDirection');
      ai.stuckTime = 749;

      ai._checkIfStuck(250);

      expect(pick).not.toHaveBeenCalled();
      expect(ai.stuckTurned).toBe(false);
    });

    test('卡住滿 2.5 秒時強制對齊格子並重置', () => {
      const align = jest.spyOn(ai, '_forceGridAlign').mockReturnValue(true);
      const escape = jest.spyOn(ai, '_escapeToWalkablePosition');
      ai.stuckTime = 2250;
      ai.stuckTurned = true;
      ai.currentPath = [cell(1, 1)];

      ai._checkIfStuck(250);

      expect(align).toHaveBeenCalled();
      expect(escape).not.toHaveBeenCalled();
      expect(ai.currentPath).toBeNull();
      expect(ai.stuckTime).toBe(0);
      expect(ai.stuckTurned).toBe(false);
    });

    test('對齊失敗時搬移到最近的可行走位置', () => {
      jest.spyOn(ai, '_forceGridAlign').mockReturnValue(false);
      const escape = jest.spyOn(ai, '_escapeToWalkablePosition').mockReturnValue(true);
      ai.stuckTime = 2250;

      ai._checkIfStuck(250);

      expect(escape).toHaveBeenCalled();
    });

    test('應該使用 AI 設定中的時間門檻', () => {
      expect(AI_CONFIG.STUCK_CHECK_INTERVAL).toBe(250);
      expect(AI_CONFIG.STUCK_TURN_TIME).toBe(1000);
      expect(AI_CONFIG.STUCK_ESCAPE_TIME).toBe(2500);
    });
  });

  describe('脫困方向', () => {
    test('優先從可行走方向（排除目前方向）挑選', () => {
      const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[0]);
      ai.desiredDirection = 'up';
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;

      expect(ai._pickEscapeDirection()).toBe('left');
      expect(pick).toHaveBeenCalledWith(['left', 'right']);
    });

    test('沒有可行走方向時從其他三個方向挑選', () => {
      const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[0]);
      ai.desiredDirection = 'left';
      scene.levelData.map = makeMap(TILE_TYPES.BRICK);

      expect(ai._pickEscapeDirection()).toBe('up');
      expect(pick).toHaveBeenCalledWith(['up', 'down', 'right']);
    });

    test('_forceGridAlign 應該把坦克吸到格子中心', () => {
      tank.x += 5;
      tank.y -= 4;

      expect(ai._forceGridAlign()).toBe(true);
      expect({ x: tank.x, y: tank.y }).toEqual(cell(5, 5));
    });

    test('_escapeToWalkablePosition 應該搬到最近可行走格並清除路徑', () => {
      scene.levelData.map[5][5] = TILE_TYPES.BRICK;
      ai.currentPath = [cell(1, 1)];

      expect(ai._escapeToWalkablePosition()).toBe(true);
      expect({ x: tank.x, y: tank.y }).not.toEqual(cell(5, 5));
      expect(GridMovement.isPositionWalkable(tank.x, tank.y, scene.levelData.map)).toBe(true);
      expect(ai.currentPath).toBeNull();
    });

    test('_escapeToWalkablePosition 找不到時回傳 false 且不移動', () => {
      scene.levelData.map = makeMap(TILE_TYPES.BRICK);
      const before = { x: tank.x, y: tank.y };

      expect(ai._escapeToWalkablePosition()).toBe(false);
      expect({ x: tank.x, y: tank.y }).toEqual(before);
    });
  });

  describe('碰撞事件', () => {
    test('撞牆：冷卻 500ms 內不換向，剛好 500ms 可以換', () => {
      ai.desiredDirection = 'up';
      ai.lastDirectionChange = scene.time.now - 499;
      ai.onWallHit();
      expect(ai.desiredDirection).toBe('up');

      ai.lastDirectionChange = scene.time.now - 500;
      ai.onWallHit();
      expect(['left', 'right']).toContain(ai.desiredDirection);
      expect(ai.lastDirectionChange).toBe(scene.time.now);
    });

    test('撞牆：水平移動時優先選垂直方向', () => {
      const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[arr.length - 1]);
      ai.desiredDirection = 'right';

      ai.onWallHit();

      expect(pick).toHaveBeenCalledWith(['up', 'down']);
      expect(ai.desiredDirection).toBe('down');
    });

    test('撞牆：四面都不可走時退回隨機垂直方向', () => {
      const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[0]);
      scene.levelData.map = makeMap(TILE_TYPES.BRICK);
      ai.desiredDirection = 'down';

      ai.onWallHit();

      expect(pick).toHaveBeenCalledWith(['left', 'right']);
      expect(ai.desiredDirection).toBe('left');
    });

    test('撞牆：垂直方向都不通時退回其他可行走方向（排除原方向）', () => {
      const pick = jest.spyOn(Phaser.Utils.Array, 'GetRandom').mockImplementation(arr => arr[0]);
      scene.levelData.map[5][4] = TILE_TYPES.BRICK;
      scene.levelData.map[5][6] = TILE_TYPES.BRICK;
      ai.desiredDirection = 'up';

      ai.onWallHit();

      expect(pick).toHaveBeenCalledWith(['down']);
      expect(ai.desiredDirection).toBe('down');
    });

    test('相撞：冷卻內不換向；冷卻後挑選脫困方向並清除路徑', () => {
      jest.spyOn(ai, '_pickEscapeDirection').mockReturnValue('right');
      ai.desiredDirection = 'up';
      ai.currentPath = [cell(1, 1)];
      ai.lastDirectionChange = scene.time.now - 499;

      ai.onTankHit();
      expect(ai.desiredDirection).toBe('up');
      expect(ai.currentPath).not.toBeNull();

      ai.lastDirectionChange = scene.time.now - 500;
      ai.onTankHit();
      expect(ai.desiredDirection).toBe('right');
      expect(ai.lastDirectionChange).toBe(scene.time.now);
      expect(ai.currentPath).toBeNull();
    });
  });

  describe('_alignAndShootTargetWithPrediction', () => {
    let shoot;

    beforeEach(() => {
      shoot = jest.spyOn(ai, '_tryShootAtTargetWithPrediction').mockImplementation(() => {});
    });

    test.each([
      [19, 100, 'down'],
      [-19, -100, 'up'],
      [100, 19, 'right'],
      [-100, -19, 'left']
    ])('目標偏移 (%i, %i) 時轉向 %s 並射擊', (dx, dy, expected) => {
      ai.desiredDirection = 'none';
      const target = { x: tank.x + dx, y: tank.y + dy };

      ai._alignAndShootTargetWithPrediction(target);

      expect(ai.desiredDirection).toBe(expected);
      expect(ai.lastDirectionChange).toBe(scene.time.now);
      expect(shoot).toHaveBeenCalledWith(target);
    });

    test('未對齊時維持移動意圖但仍嘗試射擊', () => {
      ai.desiredDirection = 'left';

      ai._alignAndShootTargetWithPrediction({ x: tank.x + 20, y: tank.y + 20 });

      expect(ai.desiredDirection).toBe('left');
      expect(shoot).toHaveBeenCalled();
    });

    test('方向不變時不更新換向時間', () => {
      ai.desiredDirection = 'down';
      ai.lastDirectionChange = 5;

      ai._alignAndShootTargetWithPrediction({ x: tank.x, y: tank.y + 100 });
      expect(ai.lastDirectionChange).toBe(5);

      ai.desiredDirection = 'right';
      ai._alignAndShootTargetWithPrediction({ x: tank.x + 100, y: tank.y });
      expect(ai.lastDirectionChange).toBe(5);
    });

    test('200ms 內只射擊不轉向', () => {
      ai.desiredDirection = 'left';
      ai.lastDirectionChange = scene.time.now - 199;

      ai._alignAndShootTargetWithPrediction({ x: tank.x, y: tank.y + 100 });

      expect(ai.desiredDirection).toBe('left');
      expect(shoot).toHaveBeenCalledTimes(1);
    });

    test('應該以預測位置對齊', () => {
      ai.desiredDirection = 'left';
      // 目前水平偏移 60，但 0.3 秒後會移到同一條垂直線上
      const target = { x: tank.x + 60, y: tank.y + 100, body: { velocity: { x: -200, y: 0 } } };

      ai._alignAndShootTargetWithPrediction(target);

      expect(ai.desiredDirection).toBe('down');
    });
  });

  describe('狀態行為', () => {
    beforeEach(() => {
      ai.lastStateChange = scene.time.now; // 不重新評估狀態
    });

    describe('patrol', () => {
      test('距離巡邏點 40px 以上時前往', () => {
        const move = jest.spyOn(ai, '_moveTowardsTarget').mockImplementation(() => {});
        ai.currentPatrolTarget = { x: tank.x + 40, y: tank.y };

        ai.stateMachine.update(16);

        expect(move).toHaveBeenCalledWith(ai.currentPatrolTarget);
      });

      test('到達巡邏點（< 40px）時換下一個', () => {
        const assign = jest.spyOn(ai, '_assignNewPatrolTarget').mockImplementation(() => {});
        const move = jest.spyOn(ai, '_moveTowardsTarget');
        ai.currentPatrolTarget = { x: tank.x + 39, y: tank.y };

        ai.stateMachine.update(16);

        expect(assign).toHaveBeenCalled();
        expect(move).not.toHaveBeenCalled();
      });

      test('沒有巡邏點或關閉智能巡邏時隨機漫遊', () => {
        const wander = jest.spyOn(ai, '_maybeRandomTurn');
        ai.currentPatrolTarget = null;
        ai.stateMachine.update(16);

        ai.currentPatrolTarget = { x: 0, y: 0 };
        ai.smartPatrolEnabled = false;
        ai.stateMachine.update(16);

        expect(wander).toHaveBeenCalledTimes(2);
      });

      test('看得到玩家時瞄準射擊，否則隨機射擊', () => {
        const aimed = jest.spyOn(ai, '_tryShootAtTarget');
        const random = jest.spyOn(ai, '_tryRandomShoot');
        ai.currentPatrolTarget = null;
        scene.player = { ...cell(5, 15), isDestroyed: false };

        ai.hasLineOfSight = true;
        ai.stateMachine.update(16);
        expect(aimed).toHaveBeenCalledWith(scene.player);
        expect(random).not.toHaveBeenCalled();

        ai.hasLineOfSight = false;
        ai.stateMachine.update(16);
        expect(random).toHaveBeenCalledTimes(1);

        ai.hasLineOfSight = true;
        scene.player.isDestroyed = true;
        ai.stateMachine.update(16);
        expect(random).toHaveBeenCalledTimes(2);

        scene.player = null;
        ai.stateMachine.update(16);
        expect(random).toHaveBeenCalledTimes(3);
      });
    });

    describe('chase', () => {
      test('朝目標移動並以預測射擊', () => {
        scene.player = { ...cell(5, 15), isDestroyed: false };
        ai.currentTarget = 'player';
        ai.stateMachine.setState('chase');
        const move = jest.spyOn(ai, '_moveTowardsTarget').mockImplementation(() => {});
        const shoot = jest.spyOn(ai, '_tryShootAtTargetWithPrediction').mockImplementation(() => {});

        ai.stateMachine.update(16);

        expect(move).toHaveBeenCalledWith(scene.player);
        expect(shoot).toHaveBeenCalledWith(scene.player);
      });

      test('目標消失時回到巡邏', () => {
        ai.currentTarget = 'base';
        ai.stateMachine.setState('chase');

        ai.stateMachine.update(16);

        expect(ai.stateMachine.getCurrentState()).toBe('patrol');
      });
    });

    describe('attack', () => {
      beforeEach(() => {
        ai.currentTarget = 'player';
        ai.stateMachine.setState('attack');
      });

      test('距離玩家太近（< 70px）時拉開距離並射擊', () => {
        scene.player = { x: tank.x, y: tank.y + 69, isDestroyed: false };
        const away = jest.spyOn(ai, '_moveAwayFromTarget');
        const align = jest.spyOn(ai, '_alignAndShootTargetWithPrediction');
        const shoot = jest.spyOn(ai, '_tryShootAtTargetWithPrediction');

        ai.stateMachine.update(16);

        expect(away).toHaveBeenCalledWith(scene.player);
        expect(shoot).toHaveBeenCalledWith(scene.player);
        expect(align).not.toHaveBeenCalled();
      });

      test('剛好 70px 時對齊射擊並保持距離', () => {
        scene.player = { x: tank.x, y: tank.y + 70, isDestroyed: false };
        const away = jest.spyOn(ai, '_moveAwayFromTarget');
        const align = jest.spyOn(ai, '_alignAndShootTargetWithPrediction');
        const maintain = jest.spyOn(ai, '_maintainDistance');

        ai.stateMachine.update(16);

        expect(away).not.toHaveBeenCalled();
        expect(align).toHaveBeenCalledWith(scene.player);
        expect(maintain).toHaveBeenCalledWith(scene.player);
        expect(ai.wantsToMove).toBe(false);
      });

      test('攻擊基地時不拉開距離也不停車', () => {
        ai.currentTarget = 'base';
        scene.base = { x: tank.x, y: tank.y + 30, isDestroyed: false };
        const away = jest.spyOn(ai, '_moveAwayFromTarget');
        const maintain = jest.spyOn(ai, '_maintainDistance');

        ai.stateMachine.update(16);

        expect(away).not.toHaveBeenCalled();
        expect(maintain).not.toHaveBeenCalled();
      });

      test('目標消失時回到巡邏', () => {
        ai.currentTarget = null;

        ai.stateMachine.update(16);

        expect(ai.stateMachine.getCurrentState()).toBe('patrol');
      });
    });

    describe('retreat', () => {
      test('遠離目標並邊退邊射擊', () => {
        scene.player = { x: tank.x + 100, y: tank.y, isDestroyed: false };
        ai.currentTarget = 'player';
        ai.stateMachine.setState('retreat');
        const shoot = jest.spyOn(ai, '_tryShootAtTarget');

        ai.stateMachine.update(16);

        expect(ai.desiredDirection).toBe('left');
        expect(shoot).toHaveBeenCalledWith(scene.player);
      });

      test('目標消失時回到巡邏', () => {
        ai.currentTarget = null;
        ai.stateMachine.setState('retreat');

        ai.stateMachine.update(16);

        expect(ai.stateMachine.getCurrentState()).toBe('patrol');
      });
    });
  });

  describe('update - 統一移動出口', () => {
    test('冰凍時完全不動作', () => {
      tank.isFrozen = true;
      const evaluate = jest.spyOn(ai, '_evaluateState');

      ai.update(16);

      expect(evaluate).not.toHaveBeenCalled();
      expect(tank.move).not.toHaveBeenCalled();
      expect(tank.stop).not.toHaveBeenCalled();
    });

    test('冷卻 2 秒後才重新評估狀態', () => {
      const evaluate = jest.spyOn(ai, '_evaluateState');

      ai.lastStateChange = scene.time.now - 2000;
      ai.update(16);
      expect(evaluate).not.toHaveBeenCalled();

      ai.lastStateChange = scene.time.now - 2001;
      ai.update(16);
      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(ai.lastStateChange).toBe(scene.time.now);
    });

    test('要移動時呼叫 move 與轉角滑動輔助', () => {
      scene.applyCornerSlide = jest.fn();
      ai.lastStateChange = scene.time.now;
      ai.desiredDirection = 'left';
      jest.spyOn(ai.stateMachine, 'update').mockImplementation(() => {});

      ai.update(16);

      expect(tank.move).toHaveBeenCalledWith('left');
      expect(scene.applyCornerSlide).toHaveBeenCalledWith(tank, 'left');
      expect(tank.stop).not.toHaveBeenCalled();
    });

    test('沒有轉角滑動輔助時仍可移動', () => {
      ai.lastStateChange = scene.time.now;
      jest.spyOn(ai.stateMachine, 'update').mockImplementation(() => {});

      expect(() => ai.update(16)).not.toThrow();
      expect(tank.move).toHaveBeenCalled();
    });

    test('停車射擊時只轉向並停止', () => {
      ai.lastStateChange = scene.time.now;
      ai.desiredDirection = 'right';
      jest.spyOn(ai.stateMachine, 'update').mockImplementation(() => { ai.wantsToMove = false; });

      ai.update(16);

      expect(tank.face).toHaveBeenCalledWith('right');
      expect(tank.stop).toHaveBeenCalled();
      expect(tank.move).not.toHaveBeenCalled();
    });

    test('每幀開始時重置為要移動，並把 delta 交給狀態機與卡住檢測', () => {
      ai.lastStateChange = scene.time.now;
      ai.wantsToMove = false;
      const stateUpdate = jest.spyOn(ai.stateMachine, 'update').mockImplementation(() => {});
      const stuck = jest.spyOn(ai, '_checkIfStuck');

      ai.update(33);

      expect(stateUpdate).toHaveBeenCalledWith(33);
      expect(stuck).toHaveBeenCalledWith(33);
      expect(tank.move).toHaveBeenCalled();
    });
  });
});

describe('EnemyAI 決策邊界（變異測試補強）', () => {
  let scene;
  let tank;
  let ai;

  beforeEach(() => {
    scene = makeScene();
    tank = makeTank();
    ai = new EnemyAI(scene, tank);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('目標選擇', () => {
    const player = () => ({ isDestroyed: false });
    const base = () => ({ isDestroyed: false });

    test('目前目標（玩家）已摧毀時，即使抽中維持也要重新選擇', () => {
      ai.currentTarget = 'player';
      jest.spyOn(Math, 'random').mockReturnValue(0);

      ai._selectTarget({ isDestroyed: true }, base());

      expect(ai.currentTarget).toBe('base');
    });

    test('玩家不可用時一律選基地（不受優先級影響）', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);

      ai._selectTarget({ isDestroyed: true }, base());

      expect(ai.currentTarget).toBe('base');
    });

    test('基地不可用時一律選玩家（不受優先級影響）', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.99);

      ai._selectTarget(player(), null);

      expect(ai.currentTarget).toBe('player');
    });

    test('沒有選出目標時即使基地存在也巡邏', () => {
      ai.stateMachine.setState('chase');
      jest.spyOn(ai, '_selectTarget').mockImplementation(() => { ai.currentTarget = null; });
      scene.base = { x: tank.x, y: tank.y + 600, isDestroyed: false };

      ai._evaluateState();

      expect(ai.stateMachine.getCurrentState()).toBe('patrol');
    });

    test('優先級剛好 0.5 時偏好基地', () => {
      scene.aiBlackboard = { assignTarget: jest.fn(), updateEnemyPosition: jest.fn() };
      ai.targetPriority = { player: 0.5, base: 0.5 };

      ai._registerToBlackboard();

      expect(scene.aiBlackboard.assignTarget).toHaveBeenCalledWith(ai.id, 'base');
    });
  });

  test('chase：包抄模式旗標還在但沒有包抄目標時，直接追逐目標', () => {
    scene.player = { ...cell(5, 15), isDestroyed: false };
    ai.currentTarget = 'player';
    ai.stateMachine.setState('chase');
    ai.isFlankingMode = true;
    ai.flankingTarget = null;
    const move = jest.spyOn(ai, '_moveTowardsTarget').mockImplementation(() => {});
    const flank = jest.spyOn(ai, '_executeFlankingMove');

    ai.stateMachine.update(16);

    expect(move).toHaveBeenCalledWith(scene.player);
    expect(flank).not.toHaveBeenCalled();
  });

  describe('_followPath 邊界', () => {
    const follow = (dx, dy, current) => {
      ai.desiredDirection = current;
      ai.currentPath = [{ x: tank.x + dx, y: tank.y + dy }, { x: 999, y: 999 }];
      ai.currentWaypointIndex = 0;
      jest.spyOn(Phaser.Math.Distance, 'Between').mockReturnValue(999);
      ai._followPath();
      Phaser.Math.Distance.Between.mockRestore();
      return ai.desiredDirection;
    };

    test('偏移剛好 8px（死區邊界）時不算在死區內', () => {
      expect(follow(8, 0, 'up')).toBe('right');
      expect(follow(0, 8, 'left')).toBe('down');
    });

    test('垂直方向明顯較大時，即使目前水平移動也轉為垂直', () => {
      expect(follow(10, 100, 'left')).toBe('down');
    });

    test('相近時維持目前軸向（右 / 下也適用）', () => {
      expect(follow(80, 100, 'right')).toBe('right');
      expect(follow(100, 80, 'down')).toBe('down');
    });

    test('完全沒有偏好且兩軸偏移相同時取垂直方向', () => {
      expect(follow(8, 8, 'left')).toBe('down');
      expect(follow(-8, -8, 'right')).toBe('up');
    });
  });

  describe('_moveDirectly 邊界', () => {
    const moveTo = (dx, dy, current) => {
      ai.desiredDirection = current;
      ai.detour = null;
      ai._moveDirectly({ x: tank.x + dx, y: tank.y + dy });
      return ai.desiredDirection;
    };

    test('偏移剛好 8px（死區邊界）時不算在死區內', () => {
      expect(moveTo(8, 0, 'down')).toBe('right');
      expect(moveTo(0, 8, 'left')).toBe('down');
    });

    test('垂直方向明顯較大時，即使目前水平移動也以垂直為首選', () => {
      expect(moveTo(10, 100, 'left')).toBe('down');
    });

    test('相近且目前水平移動、水平首選被擋時，依 dy 選上或下', () => {
      scene.levelData.map[5][6] = TILE_TYPES.BRICK;
      expect(moveTo(100, -90, 'right')).toBe('up');
      expect(moveTo(100, 90, 'right')).toBe('down');
    });

    test('相近且目前垂直移動、垂直首選被擋時，依 dx 選左或右', () => {
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;
      expect(moveTo(-90, 100, 'down')).toBe('left');
      expect(moveTo(90, 100, 'down')).toBe('right');
    });

    test('目標正下方且下方被擋時，次要方向（dx = 0）取左', () => {
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;

      expect(moveTo(0, 100, 'up')).toBe('left');
    });
  });

  test('_isDirectionSafe：第 0 列與第 0 欄仍在地圖內', () => {
    Object.assign(tank, cell(5, 1));
    expect(ai._isDirectionSafe('up')).toBe(true);

    Object.assign(tank, cell(1, 5));
    expect(ai._isDirectionSafe('left')).toBe(true);
  });

  test('_moveAwayFromTarget：剛好 1.3 倍時視為相近（維持方向）', () => {
    ai.desiredDirection = 'left';
    ai._moveAwayFromTarget({ x: tank.x + 100, y: tank.y + 130 });

    expect(ai.desiredDirection).toBe('left');
  });

  test('_alignAndShootTargetWithPrediction：目標與坦克重疊（dy = 0）時朝上', () => {
    jest.spyOn(ai, '_tryShootAtTargetWithPrediction').mockImplementation(() => {});
    ai.desiredDirection = 'left';

    ai._alignAndShootTargetWithPrediction({ x: tank.x, y: tank.y });

    expect(ai.desiredDirection).toBe('up');
  });

  test('_alignAndShootTargetWithPrediction：剛好 200ms 後可以轉向', () => {
    jest.spyOn(ai, '_tryShootAtTargetWithPrediction').mockImplementation(() => {});
    ai.desiredDirection = 'left';
    ai.lastDirectionChange = scene.time.now - 200;

    ai._alignAndShootTargetWithPrediction({ x: tank.x, y: tank.y + 100 });

    expect(ai.desiredDirection).toBe('down');
  });

  describe('射擊冷卻邊界', () => {
    test('瞄準射擊：剛好冷卻完成可以射擊', () => {
      tank.direction = 'up';
      ai.lastShot = scene.time.now - tank.fireRate;

      ai._tryShootAtTarget({ x: tank.x, y: tank.y - 100 });

      expect(tank.shoot).toHaveBeenCalled();
    });

    test('隨機射擊：剛好冷卻完成可以射擊', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      ai.lastShot = scene.time.now - tank.fireRate;

      ai._tryRandomShoot();

      expect(tank.shoot).toHaveBeenCalled();
    });
  });

  describe.each([
    ['_tryShootAtTarget'],
    ['_tryShootAtTargetWithPrediction']
  ])('%s：目標與坦克在同一位置（不在砲口前方）時不射擊', (method) => {
    test.each(['up', 'down', 'left', 'right'])('朝 %s', (direction) => {
      tank.direction = direction;

      ai[method]({ x: tank.x, y: tank.y });

      expect(tank.shoot).not.toHaveBeenCalled();
    });
  });

  describe('_chooseSafestDirection 計分', () => {
    const open = (map, cells) => cells.forEach(([x, y]) => { map[y][x] = TILE_TYPES.EMPTY; });

    test('前方第一格應該是相鄰格（不是目前所在格）', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      open(map, [[6, 5]]);
      scene.levelData.map = map;
      tank.direction = 'up';

      expect(ai._chooseSafestDirection()).toBe('right');
    });

    test('前方第二格應該在同方向兩格外', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      open(map, [[6, 5], [7, 5], [4, 5]]);
      scene.levelData.map = map;
      tank.direction = 'up';

      // 右：10 + 5；左：10 + 0
      expect(ai._chooseSafestDirection()).toBe('right');
    });

    test('第 0 列是地圖內的可走格', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      open(map, [[5, 0]]);
      scene.levelData.map = map;
      Object.assign(tank, cell(5, 1));
      tank.direction = 'left';

      expect(ai._chooseSafestDirection()).toBe('up');
    });

    test('第二格在第 0 列 / 第 0 欄時仍計分', () => {
      Object.assign(tank, cell(5, 2));
      tank.direction = 'left';
      // 上 / 下 / 左都是 15 分，同分取上
      expect(ai._chooseSafestDirection()).toBe('up');

      const map = makeMap(TILE_TYPES.BRICK);
      open(map, [[1, 5], [0, 5], [3, 5], [4, 5]]);
      scene.levelData.map = map;
      Object.assign(tank, cell(2, 5));
      tank.direction = 'up';
      // 左右都是 15 分，同分取左
      expect(ai._chooseSafestDirection()).toBe('left');
    });

    test('貼著下緣時往下的兩格都在地圖外', () => {
      Object.assign(tank, cell(5, 25));
      tank.direction = 'down';
      expect(ai._chooseSafestDirection()).toBe('left');

      Object.assign(tank, cell(5, 24));
      expect(ai._chooseSafestDirection()).toBe('left');
    });

    test.each([
      ['冰地', TILE_TYPES.ICE],
      ['森林', TILE_TYPES.FOREST]
    ])('前方第一格是%s時視為安全', (_label, tile) => {
      const map = makeMap(TILE_TYPES.BRICK);
      open(map, [[4, 5]]);
      map[5][6] = tile;
      map[5][7] = TILE_TYPES.EMPTY;
      scene.levelData.map = map;
      tank.direction = 'up';

      // 左：10；右：10 + 5
      expect(ai._chooseSafestDirection()).toBe('right');
    });

    test.each([
      ['冰地', TILE_TYPES.ICE],
      ['森林', TILE_TYPES.FOREST]
    ])('前方第二格是%s時視為安全', (_label, tile) => {
      const map = makeMap(TILE_TYPES.BRICK);
      open(map, [[4, 5], [6, 5]]);
      map[5][7] = tile;
      scene.levelData.map = map;
      tank.direction = 'up';

      expect(ai._chooseSafestDirection()).toBe('right');
    });

    test('面向右時只懲罰左（反向）', () => {
      scene.levelData.map[4][5] = TILE_TYPES.BRICK;
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;
      tank.direction = 'right';

      // 左 15 - 3 = 12、右 15
      expect(ai._chooseSafestDirection()).toBe('right');
    });
  });

  describe('沒有關卡資料時的防護', () => {
    beforeEach(() => {
      scene.levelData = null;
    });

    test('脫困、撞牆、相撞時仍能換方向', () => {
      ai.desiredDirection = 'up';
      expect(['down', 'left', 'right']).toContain(ai._pickEscapeDirection());

      ai.onWallHit();
      expect(['left', 'right']).toContain(ai.desiredDirection);

      ai.lastDirectionChange = 0;
      ai.onTankHit();
      expect(ai.desiredDirection).toBeDefined();
    });

    test('強制對齊與脫困搬移不應該拋錯', () => {
      tank.x += 5;

      expect(ai._forceGridAlign()).toBe(true);
      expect(ai._escapeToWalkablePosition()).toBe(false);
    });
  });

  describe('_executeFlankingMove 抵達包抄點', () => {
    test('不在 chase 狀態時也應該自行結束包抄模式', () => {
      ai.isFlankingMode = true;
      ai.flankingTarget = { x: tank.x + 10, y: tank.y };

      ai._executeFlankingMove();

      expect(ai.isFlankingMode).toBe(false);
      expect(ai.flankingTarget).toBeNull();
      expect(ai.stateMachine.getCurrentState()).toBe('attack');
    });

    test('不在 chase 狀態時也應該釋放黑板中的包抄位置', () => {
      scene.aiBlackboard = { releaseFlankingPosition: jest.fn(), markAsAttacking: jest.fn() };
      ai.isFlankingMode = true;
      ai.flankingTarget = { x: tank.x + 10, y: tank.y };

      ai._executeFlankingMove();

      expect(scene.aiBlackboard.releaseFlankingPosition).toHaveBeenCalledWith(ai.id);
    });

    test('沒有黑板時也能結束包抄', () => {
      ai.stateMachine.setState('chase');
      ai.flankingTarget = { x: tank.x + 10, y: tank.y };

      expect(() => ai._executeFlankingMove()).not.toThrow();
      expect(ai.stateMachine.getCurrentState()).toBe('attack');
    });
  });

  describe('_moveDirectly - 沿牆繞行滯後', () => {
    const moveTo = (dx, dy) => {
      ai._moveDirectly({ x: tank.x + dx, y: tank.y + dy });
      return ai.desiredDirection;
    };

    beforeEach(() => {
      // 下方被磚牆擋住，目標在牆後
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;
      ai.desiredDirection = 'down';
    });

    test('首選方向被擋時開始繞行並記錄被擋方向與繞行方向', () => {
      expect(moveTo(0, 100)).toBe('left');
      expect(ai.detour).toEqual({ blocked: 'down', dir: 'left' });
    });

    test('目標在正前方隔著牆、dx 在 0 附近變號時維持同一繞行方向', () => {
      moveTo(0, 100);

      expect(moveTo(10, 100)).toBe('left');
      expect(moveTo(-10, 100)).toBe('left');
      // 軸向相近帶：原本會改朝目標的水平方向往回走
      expect(moveTo(80, 100)).toBe('left');
      expect(ai.detour).toEqual({ blocked: 'down', dir: 'left' });
    });

    test('擋住的方向變成可走時結束繞行，改走首選方向', () => {
      moveTo(0, 100);
      scene.levelData.map[6][5] = TILE_TYPES.EMPTY;

      expect(moveTo(0, 100)).toBe('down');
      expect(ai.detour).toBeNull();
    });

    test('繞行方向被擋時重新選擇', () => {
      moveTo(0, 100);
      scene.levelData.map[5][4] = TILE_TYPES.BRICK;

      expect(moveTo(10, 100)).toBe('right');
      expect(ai.detour).toEqual({ blocked: 'down', dir: 'right' });
    });

    test('兩個方向都被擋時清除繞行並使用最安全方向', () => {
      moveTo(0, 100);
      scene.levelData.map[5][4] = TILE_TYPES.BRICK;
      scene.levelData.map[5][6] = TILE_TYPES.BRICK;
      jest.spyOn(ai, '_chooseSafestDirection').mockReturnValue('up');

      expect(moveTo(0, 100)).toBe('up');
      expect(ai.detour).toBeNull();
    });

    test('死區內不動時保留繞行紀錄', () => {
      moveTo(0, 100);

      expect(moveTo(3, 3)).toBe('left');
      expect(ai.detour).toEqual({ blocked: 'down', dir: 'left' });
    });

    test('找到 A* 路徑時清除繞行', () => {
      ai.detour = { blocked: 'down', dir: 'left' };

      ai._updatePath(cell(10, 5));

      expect(ai.currentPath).not.toBeNull();
      expect(ai.detour).toBeNull();
    });

    test('找不到路徑時保留繞行', () => {
      ai.detour = { blocked: 'down', dir: 'left' };

      ai._updatePath({ x: -100, y: -100 });

      expect(ai.currentPath).toBeNull();
      expect(ai.detour).toEqual({ blocked: 'down', dir: 'left' });
    });

    test('中度卡住換方向時清除繞行', () => {
      ai.detour = { blocked: 'down', dir: 'left' };
      ai.stuckTime = AI_CONFIG.STUCK_TURN_TIME;
      ai.stuckWindowTime = AI_CONFIG.STUCK_CHECK_INTERVAL;
      jest.spyOn(ai, '_pickEscapeDirection').mockReturnValue('up');

      ai._checkIfStuck(0);

      expect(ai.desiredDirection).toBe('up');
      expect(ai.detour).toBeNull();
    });
  });

  describe('方向翻轉診斷', () => {
    let warn;

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    /** 連續翻轉 times 次，每次間隔 step ms */
    const flip = (times, step) => {
      for (let i = 0; i < times; i++) {
        ai.desiredDirection = ai.desiredDirection === 'left' ? 'right' : 'left';
        scene.time.now += step;
        ai._trackDirectionFlips(scene.time.now);
      }
    };

    test('測試環境預設關閉，翻轉再多也不輸出', () => {
      expect(ai.flipDiagnostics).toBe(false);

      flip(20, 50);

      expect(warn).not.toHaveBeenCalled();
      expect(ai.flipTimes).toEqual([]);
    });

    test('2 秒內翻轉超過 6 次才輸出一次快照', () => {
      ai.flipDiagnostics = true;

      flip(6, 100);
      expect(warn).not.toHaveBeenCalled();

      flip(1, 100);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toBe('[EnemyAI] 方向反覆翻轉');
      expect(warn.mock.calls[0][1]).toMatchObject({
        id: ai.id,
        state: 'patrol',
        direction: ai.desiredDirection
      });
      expect(ai.lastFlipReport).toBe(scene.time.now);
    });

    test('方向沒變時不算翻轉', () => {
      ai.flipDiagnostics = true;
      ai.desiredDirection = 'left';

      for (let i = 0; i < 10; i++) {
        scene.time.now += 100;
        ai._trackDirectionFlips(scene.time.now);
      }

      expect(ai.flipTimes).toEqual([scene.time.now - 900]);
      expect(warn).not.toHaveBeenCalled();
    });

    test('5 秒內不重複輸出，間隔過後再次翻轉會再輸出', () => {
      ai.flipDiagnostics = true;

      flip(7, 100);
      flip(7, 100);
      expect(warn).toHaveBeenCalledTimes(1);

      scene.time.now += 5000;
      flip(7, 100);
      expect(warn).toHaveBeenCalledTimes(2);
    });

    test('超過 2 秒的翻轉不計入', () => {
      ai.flipDiagnostics = true;

      flip(10, 400);

      expect(warn).not.toHaveBeenCalled();
      expect(ai.flipTimes.length).toBe(6);
    });

    test('快照包含狀態、位置、路徑點、繞行與四周可走方向', () => {
      scene.levelData.map[6][5] = TILE_TYPES.BRICK;
      ai.currentTarget = 'base';
      ai.currentPath = [cell(5, 8)];
      ai.currentWaypointIndex = 0;
      ai.detour = { blocked: 'down', dir: 'left' };

      expect(ai._debugSnapshot()).toMatchObject({
        type: 'BASIC',
        target: 'base',
        hasPath: true,
        waypoint: cell(5, 8),
        detour: { blocked: 'down', dir: 'left' },
        gridX: 5,
        gridY: 5,
        open: ['up', 'left', 'right']
      });
    });

    test('沒有路徑時快照的路徑點為 null', () => {
      expect(ai._debugSnapshot()).toMatchObject({ hasPath: false, waypoint: null });
    });

    test('update 每幀以目前時間執行診斷', () => {
      ai.lastStateChange = scene.time.now;
      jest.spyOn(ai.stateMachine, 'update').mockImplementation(() => {});
      const track = jest.spyOn(ai, '_trackDirectionFlips');

      ai.update(16);

      expect(track).toHaveBeenCalledWith(scene.time.now);
    });
  });

});
