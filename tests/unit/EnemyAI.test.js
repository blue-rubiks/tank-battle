/**
 * EnemyAI 進階功能單元測試（真實實作）
 * 測試初始化、黑板整合、預測射擊、視線檢測、智能巡邏、包抄戰術
 */

import EnemyAI from '../../src/systems/EnemyAI';
import AIBlackboard from '../../src/systems/AIBlackboard';
import GridMovement from '../../src/utils/GridMovement';
import { TILE_TYPES, AI_CONFIG, GAME_CONFIG } from '../../src/utils/Constants';

const TILE_SIZE = GAME_CONFIG.TILE_SIZE;

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

const makeBlackboard = (overrides = {}) => ({
  assignTarget: jest.fn(),
  updateEnemyPosition: jest.fn(),
  removeTargetAssignment: jest.fn(),
  markAsAttacking: jest.fn(),
  markAsNotAttacking: jest.fn(),
  assignPatrolPoint: jest.fn(() => ({ x: 1, y: 2 })),
  canJoinFlanking: jest.fn(() => true),
  calculateFlankingPosition: jest.fn(() => null),
  releaseFlankingPosition: jest.fn(),
  flankingPositions: new Map(),
  ...overrides
});

describe('EnemyAI 進階功能', () => {
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

  describe('初始化', () => {
    test('應該有唯一識別碼', () => {
      const other = new EnemyAI(scene, makeTank());

      expect(ai.id).toMatch(/^enemy_\d+_[a-z0-9]+$/);
      expect(ai.id).not.toBe(other.id);
    });

    test('AI 參數應該來自設定', () => {
      expect(ai.scene).toBe(scene);
      expect(ai.tank).toBe(tank);
      expect(ai.detectionRange).toBe(AI_CONFIG.DETECTION_RANGE);
      expect(ai.attackRange).toBe(AI_CONFIG.ATTACK_RANGE);
      expect(ai.retreatHealthPercent).toBe(AI_CONFIG.RETREAT_HEALTH_PERCENT);
      expect(ai.attackIdealDistance).toBe(100);
      expect(ai.attackDistanceBuffer).toBe(30);
      expect(ai.stateChangeCooldown).toBe(AI_CONFIG.STATE_CHANGE_COOLDOWN);
    });

    test('時間與移動意圖的初始值', () => {
      expect(ai.lastStateChange).toBe(0);
      expect(ai.lastShot).toBe(0);
      expect(ai.desiredDirection).toBe('down');
      expect(ai.wantsToMove).toBe(true);
      expect(ai.lastDirectionChange).toBe(0);
      expect(ai.directionChangeCooldown).toBe(500);
      expect(ai.lastRandomDirectionChange).toBe(0);
      expect(ai.randomDirectionInterval).toBe(3000);
      expect(ai.lastShootDecision).toBe(0);
      expect(ai.shootDecisionInterval).toBe(250);
    });

    test('卡住檢測與尋路的初始值', () => {
      expect(ai.stuckTime).toBe(0);
      expect(ai.stuckWindowTime).toBe(0);
      expect(ai.stuckWindowDistance).toBe(0);
      expect(ai.stuckTurned).toBe(false);
      expect(ai.lastPosition).toEqual({ x: tank.x, y: tank.y });
      expect(ai.currentPath).toBeNull();
      expect(ai.pathUpdateInterval).toBe(500);
      expect(ai.lastPathUpdate).toBe(0);
      expect(ai.currentWaypointIndex).toBe(0);
      expect(ai.waypointReachDistance).toBe(16);
      expect(ai.pathUpdateIntervalChase).toBe(500);
      expect(ai.pathUpdateIntervalPatrol).toBe(1000);
      expect(ai.currentTarget).toBeNull();
    });

    test('進階功能開關應該來自設定', () => {
      expect(ai.predictionEnabled).toBe(AI_CONFIG.PREDICTION_ENABLED);
      expect(ai.predictionTime).toBe(AI_CONFIG.PREDICTION_TIME);
      expect(ai.losEnabled).toBe(AI_CONFIG.LINE_OF_SIGHT_ENABLED);
      expect(ai.lastLosCheck).toBe(0);
      expect(ai.losCheckInterval).toBe(AI_CONFIG.LOS_CHECK_INTERVAL);
      expect(ai.hasLineOfSight).toBe(false);
      expect(ai.smartPatrolEnabled).toBe(AI_CONFIG.SMART_PATROL_ENABLED);
      expect(ai.patrolPointReachDist).toBe(AI_CONFIG.PATROL_POINT_REACH_DIST);
      expect(ai.flankingEnabled).toBe(AI_CONFIG.FLANKING_ENABLED);
      expect(ai.isFlankingMode).toBe(false);
      expect(ai.flankingTarget).toBeNull();
      expect(ai.teamCoordinationEnabled).toBe(AI_CONFIG.TEAM_COORDINATION_ENABLED);
    });

    test('應該從巡邏狀態開始', () => {
      expect(ai.stateMachine.getCurrentState()).toBe('patrol');
      expect(ai.stateMachine.context).toBe(ai);
    });
  });

  describe('黑板整合', () => {
    test('偏好玩家的類型應該向黑板登記攻擊玩家並回報位置', () => {
      scene.aiBlackboard = makeBlackboard();
      const enemy = new EnemyAI(scene, makeTank({ enemyType: 'BASIC' }));

      expect(scene.aiBlackboard.assignTarget).toHaveBeenCalledWith(enemy.id, 'player');
      expect(scene.aiBlackboard.updateEnemyPosition)
        .toHaveBeenCalledWith(enemy.id, { x: tank.x, y: tank.y });
    });

    test('偏好基地的類型（FAST）應該登記攻擊基地', () => {
      scene.aiBlackboard = makeBlackboard();
      const enemy = new EnemyAI(scene, makeTank({ enemyType: 'FAST' }));

      expect(scene.aiBlackboard.assignTarget).toHaveBeenCalledWith(enemy.id, 'base');
    });

    test('關閉團隊協作時不回報位置', () => {
      scene.aiBlackboard = makeBlackboard();
      ai.teamCoordinationEnabled = false;

      ai._updateBlackboardPosition();
      ai._registerToBlackboard();

      expect(scene.aiBlackboard.updateEnemyPosition).not.toHaveBeenCalled();
      expect(scene.aiBlackboard.assignTarget).not.toHaveBeenCalled();
    });

    test('每幀應該更新黑板中的位置', () => {
      scene.aiBlackboard = makeBlackboard();
      tank.x = 321;
      tank.y = 654;

      ai._updateBlackboardPosition();

      expect(scene.aiBlackboard.updateEnemyPosition).toHaveBeenCalledWith(ai.id, { x: 321, y: 654 });
    });

    test('沒有黑板時 _getBlackboard 回傳 null', () => {
      expect(ai._getBlackboard()).toBeNull();
      expect(() => ai._updateBlackboardPosition()).not.toThrow();
      expect(() => ai.unregisterFromBlackboard()).not.toThrow();
    });

    test('銷毀時應該從黑板取消註冊', () => {
      scene.aiBlackboard = makeBlackboard();

      ai.destroy();

      expect(scene.aiBlackboard.removeTargetAssignment).toHaveBeenCalledWith(ai.id);
    });
  });

  describe('預測射擊', () => {
    test('應該能預測移動目標的位置（預設 0.3 秒）', () => {
      const target = { x: 100, y: 100, body: { velocity: { x: 100, y: 50 } } };

      expect(ai._predictTargetPosition(target)).toEqual({ x: 130, y: 115 });
    });

    test('應該支援自訂預測時間', () => {
      const target = { x: 100, y: 100, body: { velocity: { x: 100, y: 50 } } };

      expect(ai._predictTargetPosition(target, 0.5)).toEqual({ x: 150, y: 125 });
    });

    test('速度缺值時視為 0', () => {
      const target = { x: 100, y: 100, body: { velocity: {} } };

      expect(ai._predictTargetPosition(target)).toEqual({ x: 100, y: 100 });
    });

    test('沒有 body 或關閉預測時回傳目前位置', () => {
      const target = { x: 100, y: 100, body: { velocity: { x: 100, y: 0 } } };

      expect(ai._predictTargetPosition({ x: 7, y: 8 })).toEqual({ x: 7, y: 8 });

      ai.predictionEnabled = false;
      expect(ai._predictTargetPosition(target)).toEqual({ x: 100, y: 100 });
    });

    describe('_tryShootAtTargetWithPrediction', () => {
      const shootCase = (direction, target) => {
        tank.direction = direction;
        ai._tryShootAtTargetWithPrediction(target);
        return tank.shoot.mock.calls.length > 0;
      };

      test.each([
        ['up', { dx: 0, dy: -200 }],
        ['down', { dx: 0, dy: 200 }],
        ['left', { dx: -200, dy: 0 }],
        ['right', { dx: 200, dy: 0 }]
      ])('朝 %s 且預測位置在前方同一線上時射擊', (direction, { dx, dy }) => {
        const target = { x: tank.x + dx, y: tank.y + dy };

        expect(shootCase(direction, target)).toBe(true);
        expect(ai.lastShot).toBe(scene.time.now);
      });

      test.each([
        ['up', { dx: 0, dy: 200 }],
        ['down', { dx: 0, dy: -200 }],
        ['left', { dx: 200, dy: 0 }],
        ['right', { dx: -200, dy: 0 }]
      ])('朝 %s 但目標在背後時不射擊', (direction, { dx, dy }) => {
        expect(shootCase(direction, { x: tank.x + dx, y: tank.y + dy })).toBe(false);
        expect(ai.lastShot).toBe(0);
      });

      test.each([
        ['up', { dx: 39, dy: -200 }, true],
        ['up', { dx: 40, dy: -200 }, false],
        ['down', { dx: -39, dy: 200 }, true],
        ['down', { dx: -40, dy: 200 }, false],
        ['left', { dx: -200, dy: 39 }, true],
        ['left', { dx: -200, dy: 40 }, false],
        ['right', { dx: 200, dy: -39 }, true],
        ['right', { dx: 200, dy: -40 }, false]
      ])('朝 %s 偏移 %o 時是否射擊：%s（容差 40）', (direction, { dx, dy }, expected) => {
        expect(shootCase(direction, { x: tank.x + dx, y: tank.y + dy })).toBe(expected);
      });

      test('應該瞄準預測位置而非目前位置', () => {
        // 目前在正前方偏 60px，但正往砲口方向移動，0.3 秒後偏移 0
        const target = {
          x: tank.x + 60,
          y: tank.y - 200,
          body: { velocity: { x: -200, y: 0 } }
        };

        expect(shootCase('up', target)).toBe(true);
      });

      test('冷卻中不射擊、剛好冷卻完成可以射擊', () => {
        const target = { x: tank.x, y: tank.y - 200 };
        ai.lastShot = scene.time.now - 1999;
        expect(shootCase('up', target)).toBe(false);

        ai.lastShot = scene.time.now - 2000;
        expect(shootCase('up', target)).toBe(true);
      });
    });

    describe('_tryShootAtTarget（無預測）', () => {
      const shootCase = (direction, dx, dy) => {
        tank.direction = direction;
        ai._tryShootAtTarget({ x: tank.x + dx, y: tank.y + dy, body: { velocity: { x: 999, y: 999 } } });
        return tank.shoot.mock.calls.length > 0;
      };

      test.each([
        ['up', 29, -200, true],
        ['up', 30, -200, false],
        ['up', 0, 200, false],
        ['down', -29, 200, true],
        ['down', -30, 200, false],
        ['down', 0, -200, false],
        ['left', -200, 29, true],
        ['left', -200, 30, false],
        ['left', 200, 0, false],
        ['right', 200, -29, true],
        ['right', 200, -30, false],
        ['right', -200, 0, false]
      ])('朝 %s 目標偏移 (%i, %i) 時是否射擊：%s（容差 30）', (direction, dx, dy, expected) => {
        expect(shootCase(direction, dx, dy)).toBe(expected);
      });

      test('射擊後記錄時間，冷卻中不再射擊', () => {
        expect(shootCase('up', 0, -200)).toBe(true);
        expect(ai.lastShot).toBe(scene.time.now);

        tank.shoot.mockClear();
        scene.time.now += 1999;
        expect(shootCase('up', 0, -200)).toBe(false);
      });
    });
  });

  describe('視線檢測 (Line of Sight)', () => {
    test('沒有地圖時假設有視線', () => {
      scene.levelData = null;
      expect(ai._checkLineOfSight(cell(0, 0), cell(10, 10))).toBe(true);

      scene.levelData = {};
      expect(ai._checkLineOfSight(cell(0, 0), cell(10, 10))).toBe(true);
    });

    test('無障礙物時應該有視線', () => {
      expect(ai._checkLineOfSight(cell(2, 2), cell(10, 2))).toBe(true);
    });

    test.each([
      ['磚牆', TILE_TYPES.BRICK, false],
      ['鋼牆', TILE_TYPES.STEEL, false],
      ['水域', TILE_TYPES.WATER, true],
      ['森林', TILE_TYPES.FOREST, true],
      ['冰地', TILE_TYPES.ICE, true]
    ])('中間有%s時視線：%s', (_label, tile, expected) => {
      scene.levelData.map[2][6] = tile;

      expect(ai._checkLineOfSight(cell(2, 2), cell(10, 2))).toBe(expected);
    });

    test('垂直方向的牆壁也應該阻擋視線', () => {
      scene.levelData.map[6][3] = TILE_TYPES.BRICK;

      expect(ai._checkLineOfSight(cell(3, 2), cell(3, 10))).toBe(false);
      expect(ai._checkLineOfSight(cell(3, 10), cell(3, 2))).toBe(false);
    });

    test('起點或終點格子是牆也算被阻擋', () => {
      scene.levelData.map[2][2] = TILE_TYPES.BRICK;
      expect(ai._checkLineOfSight(cell(2, 2), cell(6, 2))).toBe(false);

      scene.levelData.map[2][2] = TILE_TYPES.EMPTY;
      scene.levelData.map[2][6] = TILE_TYPES.STEEL;
      expect(ai._checkLineOfSight(cell(2, 2), cell(6, 2))).toBe(false);
    });

    // Bresenham 路徑：實際經過的格子會阻擋、旁邊的格子不會
    test.each([
      [[2, 2], [6, 4], [[3, 2], [4, 3], [5, 3]], [[3, 3], [5, 4], [4, 2]]],
      [[6, 4], [2, 2], [[3, 3], [4, 3], [5, 4]], [[3, 2], [5, 3], [4, 4]]],
      [[2, 6], [5, 2], [[4, 3], [3, 4], [3, 5]], [[2, 5], [4, 4], [4, 2]]]
    ])('Bresenham %o → %o 只被路徑上的格子阻擋', (from, to, onPath, offPath) => {
      onPath.forEach(([gx, gy]) => {
        scene.levelData.map = makeMap();
        scene.levelData.map[gy][gx] = TILE_TYPES.BRICK;
        expect(ai._checkLineOfSight(cell(...from), cell(...to))).toBe(false);
      });

      offPath.forEach(([gx, gy]) => {
        scene.levelData.map = makeMap();
        scene.levelData.map[gy][gx] = TILE_TYPES.BRICK;
        expect(ai._checkLineOfSight(cell(...from), cell(...to))).toBe(true);
      });
    });

    test('抵達終點後不再檢查後方的格子', () => {
      // 路徑：(2,2) (3,2) (4,3) (5,3) (6,4)；終點周圍全是牆
      [[7, 4], [7, 5], [6, 5], [8, 5], [8, 4], [8, 6], [7, 6], [7, 3]].forEach(([gx, gy]) => {
        scene.levelData.map[gy][gx] = TILE_TYPES.BRICK;
      });

      expect(ai._checkLineOfSight(cell(2, 2), cell(6, 4))).toBe(true);
    });

    test('第 0 欄的牆也會阻擋視線', () => {
      scene.levelData.map[5][0] = TILE_TYPES.STEEL;

      expect(ai._checkLineOfSight(cell(0, 2), cell(0, 8))).toBe(false);
    });

    test('往地圖下方延伸的視線不應該出錯', () => {
      const below = { x: cell(5, 24).x, y: cell(5, 24).y + TILE_SIZE * 10 };

      expect(ai._checkLineOfSight(cell(5, 24), below)).toBe(true);
    });

    test('換算格子時應該扣除遊戲場 Y 偏移', () => {
      scene.levelData.map[0][3] = TILE_TYPES.BRICK;
      const y = GAME_CONFIG.PLAY_OFFSET_Y + 16;

      expect(ai._checkLineOfSight({ x: 16, y }, { x: 200, y })).toBe(false);
    });

    test('地圖外的格子不阻擋（也不會出錯）', () => {
      expect(ai._checkLineOfSight({ x: -100, y: -100 }, cell(2, 2))).toBe(true);
      expect(ai._checkLineOfSight(cell(24, 24), { x: 2000, y: 2000 })).toBe(true);
    });

    test('地圖外的路徑仍會檢查進入地圖後的牆', () => {
      scene.levelData.map[0][1] = TILE_TYPES.BRICK;

      expect(ai._checkLineOfSight({ x: 48, y: -100 }, cell(1, 3))).toBe(false);
    });

    describe('_updateLineOfSight', () => {
      test('沒有玩家或玩家已摧毀時沒有視線', () => {
        ai.hasLineOfSight = true;
        ai._updateLineOfSight();
        expect(ai.hasLineOfSight).toBe(false);

        ai.hasLineOfSight = true;
        scene.player = { ...cell(5, 10), isDestroyed: true };
        ai._updateLineOfSight();
        expect(ai.hasLineOfSight).toBe(false);
      });

      test('應該以坦克與玩家位置檢查視線', () => {
        scene.player = { ...cell(5, 10), isDestroyed: false };
        ai._updateLineOfSight();
        expect(ai.hasLineOfSight).toBe(true);

        scene.levelData.map[7][5] = TILE_TYPES.STEEL;
        ai._updateLineOfSight();
        expect(ai.hasLineOfSight).toBe(false);
      });
    });

    test('update 應該節流視線檢測（間隔 200ms）', () => {
      const los = jest.spyOn(ai, '_updateLineOfSight');
      ai.lastStateChange = scene.time.now;

      ai.lastLosCheck = scene.time.now - 200;
      ai.update(16);
      expect(los).not.toHaveBeenCalled();

      ai.lastLosCheck = scene.time.now - 201;
      ai.update(16);
      expect(los).toHaveBeenCalledTimes(1);
      expect(ai.lastLosCheck).toBe(scene.time.now);
    });

    test('關閉視線檢測時 update 不檢查', () => {
      const los = jest.spyOn(ai, '_updateLineOfSight');
      ai.losEnabled = false;

      ai.update(16);

      expect(los).not.toHaveBeenCalled();
    });
  });

  describe('智能巡邏', () => {
    test('有黑板時應該向黑板索取巡邏點', () => {
      scene.aiBlackboard = makeBlackboard();

      ai._assignNewPatrolTarget();

      expect(scene.aiBlackboard.assignPatrolPoint)
        .toHaveBeenCalledWith(ai.id, { x: tank.x, y: tank.y });
      expect(ai.currentPatrolTarget).toEqual({ x: 1, y: 2 });
    });

    test('沒有黑板或關閉智能巡邏時隨機產生巡邏點', () => {
      const random = jest.spyOn(ai, '_generateRandomPatrolTarget').mockReturnValue({ x: 9, y: 9 });

      ai._assignNewPatrolTarget();
      expect(ai.currentPatrolTarget).toEqual({ x: 9, y: 9 });

      scene.aiBlackboard = makeBlackboard();
      ai.smartPatrolEnabled = false;
      ai._assignNewPatrolTarget();
      expect(scene.aiBlackboard.assignPatrolPoint).not.toHaveBeenCalled();
      expect(random).toHaveBeenCalledTimes(2);
    });

    describe('_generateRandomPatrolTarget', () => {
      test('應該限制在遊戲場內（扣除邊距與 HUD）', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        expect(ai._generateRandomPatrolTarget()).toEqual({
          x: 80,
          y: GAME_CONFIG.PLAY_OFFSET_Y + 80
        });
      });

      test('應該依遊戲場大小縮放', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);
        expect(ai._generateRandomPatrolTarget()).toEqual({
          x: 80 + 0.5 * (GAME_CONFIG.WIDTH - 160),
          y: GAME_CONFIG.PLAY_OFFSET_Y + 80 + 0.5 * (GAME_CONFIG.PLAY_HEIGHT - 160)
        });
      });

      test('候選不可走時重試，最多 30 次後改找附近安全位置', () => {
        scene.levelData.map = makeMap(TILE_TYPES.BRICK);
        const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
        const nearby = jest.spyOn(ai, '_findSafePositionNearby').mockReturnValue({ x: 3, y: 4 });

        expect(ai._generateRandomPatrolTarget()).toEqual({ x: 3, y: 4 });
        expect(random).toHaveBeenCalledTimes(60);
        expect(nearby).toHaveBeenCalledWith({ x: tank.x, y: tank.y });
      });

      test('第二次嘗試可走時就回傳', () => {
        const values = [0, 0, 0.5, 0.5];
        jest.spyOn(Math, 'random').mockImplementation(() => values.shift());
        // (80, 124) 一帶設為牆，讓第一次候選失敗
        scene.levelData.map[2][2] = TILE_TYPES.BRICK;

        expect(ai._generateRandomPatrolTarget().x).toBe(416);
      });
    });

    describe('_isTargetPositionWalkable', () => {
      test('沒有地圖時視為可走', () => {
        scene.levelData = null;
        expect(ai._isTargetPositionWalkable({ x: 0, y: 0 })).toBe(true);

        scene.levelData = {};
        expect(ai._isTargetPositionWalkable({ x: 0, y: 0 })).toBe(true);
      });

      test.each([
        [TILE_TYPES.EMPTY, true],
        [TILE_TYPES.BRICK, false],
        [TILE_TYPES.STEEL, false],
        [TILE_TYPES.WATER, false],
        [TILE_TYPES.ICE, true],
        [TILE_TYPES.FOREST, true],
        [TILE_TYPES.BASE, true]
      ])('中心地形 %i 是否可走：%s', (tile, expected) => {
        scene.levelData.map[5][5] = tile;

        expect(ai._isTargetPositionWalkable(cell(5, 5))).toBe(expected);
      });

      test('站在格子中心時四周的牆不影響（左右對稱）', () => {
        scene.levelData.map = makeMap(TILE_TYPES.BRICK);
        scene.levelData.map[5][5] = TILE_TYPES.EMPTY;

        expect(ai._isTargetPositionWalkable(cell(5, 5))).toBe(true);
      });

      test.each([
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ])('偏離中心時，坦克壓到 (%i, %i) 方向斜對角的牆就不可走', (dx, dy) => {
        const center = cell(5, 5);
        scene.levelData.map[5 + dy][5 + dx] = TILE_TYPES.BRICK;

        expect(ai._isTargetPositionWalkable({ x: center.x + dx * 3, y: center.y + dy * 3 })).toBe(false);
        expect(ai._isTargetPositionWalkable({ x: center.x - dx * 3, y: center.y - dy * 3 })).toBe(true);
      });

      test.each([
        [{ x: 8, y: 300 }],
        [{ x: 830, y: 300 }],
        [{ x: 300, y: GAME_CONFIG.PLAY_OFFSET_Y + 8 }],
        [{ x: 300, y: GAME_CONFIG.PLAY_OFFSET_Y + 830 }]
      ])('四角超出地圖的位置 %o 不可走', (pos) => {
        expect(ai._isTargetPositionWalkable(pos)).toBe(false);
      });

      test('最靠邊的格子（第一與最後一欄 / 列）都可走', () => {
        expect(ai._isTargetPositionWalkable(cell(0, 0))).toBe(true);
        expect(ai._isTargetPositionWalkable(cell(25, 25))).toBe(true);
      });
    });

    describe('_findSafePositionNearby', () => {
      test.each([
        ['右', 32, 0],
        ['左', -32, 0],
        ['下', 0, 32],
        ['上', 0, -32]
      ])('只有%s方可走時找到該位置', (_label, dx, dy) => {
        const origin = cell(10, 10);
        jest.spyOn(ai, '_isTargetPositionWalkable')
          .mockImplementation(p => p.x === origin.x + dx && p.y === origin.y + dy);

        expect(ai._findSafePositionNearby(origin)).toEqual({ x: origin.x + dx, y: origin.y + dy });
      });

      test('應該由近而遠搜尋，最遠 5 格', () => {
        const origin = cell(10, 10);
        const walkable = jest.spyOn(ai, '_isTargetPositionWalkable')
          .mockImplementation(p => p.x === origin.x + 160 && p.y === origin.y);

        expect(ai._findSafePositionNearby(origin)).toEqual({ x: origin.x + 160, y: origin.y });
        // 半徑 32~128 各 4 個候選失敗後，半徑 160 的第一個候選成功
        expect(walkable).toHaveBeenCalledTimes(17);
      });

      test('找不到時回傳原位置', () => {
        const origin = cell(10, 10);
        jest.spyOn(ai, '_isTargetPositionWalkable').mockReturnValue(false);

        expect(ai._findSafePositionNearby(origin)).toBe(origin);
      });
    });

    test('patrol 狀態離開時應該清除巡邏目標', () => {
      scene.aiBlackboard = makeBlackboard();
      ai.stateMachine.setState('retreat');
      ai.stateMachine.setState('patrol');
      expect(ai.currentPatrolTarget).toEqual({ x: 1, y: 2 });

      ai.stateMachine.setState('retreat');
      expect(ai.currentPatrolTarget).toBeNull();
    });
  });

  describe('包抄戰術', () => {
    beforeEach(() => {
      scene.aiBlackboard = makeBlackboard();
      ai.currentTarget = 'player';
    });

    describe('_evaluateFlankingOpportunity', () => {
      test('黑板給出包抄位置時進入包抄模式', () => {
        scene.aiBlackboard.calculateFlankingPosition.mockReturnValue({ x: 50, y: 60 });

        ai._evaluateFlankingOpportunity();

        expect(scene.aiBlackboard.calculateFlankingPosition)
          .toHaveBeenCalledWith(ai.id, null);
        expect(ai.isFlankingMode).toBe(true);
        expect(ai.flankingTarget).toEqual({ x: 50, y: 60 });
      });

      test('包抄後記住那一側，記憶期間內重新包抄優先沿用同一側', () => {
        scene.aiBlackboard.calculateFlankingPosition
          .mockReturnValue({ x: 50, y: 60, side: 'left' });

        ai._evaluateFlankingOpportunity();
        expect(ai.lastFlankSide).toBe('left');
        expect(ai.lastFlankTime).toBe(scene.time.now);

        // 離開再進入追逐（記憶期間內）
        scene.time.now += AI_CONFIG.FLANK_SIDE_MEMORY - 1;
        ai._evaluateFlankingOpportunity();

        expect(scene.aiBlackboard.calculateFlankingPosition)
          .toHaveBeenLastCalledWith(ai.id, 'left');
      });

      test('超過記憶時間後不再偏好上次那一側', () => {
        scene.aiBlackboard.calculateFlankingPosition
          .mockReturnValue({ x: 50, y: 60, side: 'left' });

        ai._evaluateFlankingOpportunity();
        scene.time.now += AI_CONFIG.FLANK_SIDE_MEMORY;
        ai._evaluateFlankingOpportunity();

        expect(scene.aiBlackboard.calculateFlankingPosition)
          .toHaveBeenLastCalledWith(ai.id, null);
      });

      test('黑板回傳的位置沒有 side 時記為 null', () => {
        scene.aiBlackboard.calculateFlankingPosition.mockReturnValue({ x: 50, y: 60 });

        ai._evaluateFlankingOpportunity();

        expect(ai.lastFlankSide).toBeNull();
      });

      test('找不到包抄位置時不更新記憶', () => {
        ai.lastFlankSide = 'right';
        ai.lastFlankTime = scene.time.now - 10;

        ai._evaluateFlankingOpportunity();

        expect(ai.lastFlankSide).toBe('right');
        expect(ai.lastFlankTime).toBe(scene.time.now - 10);
      });

      test('找不到包抄位置時不包抄', () => {
        ai.isFlankingMode = true;
        ai.flankingTarget = { x: 1, y: 1 };

        ai._evaluateFlankingOpportunity();

        expect(ai.isFlankingMode).toBe(false);
        expect(ai.flankingTarget).toBeNull();
      });

      test('包抄人數已滿時不包抄', () => {
        scene.aiBlackboard.canJoinFlanking.mockReturnValue(false);
        ai.isFlankingMode = true;

        ai._evaluateFlankingOpportunity();

        expect(ai.isFlankingMode).toBe(false);
        expect(scene.aiBlackboard.calculateFlankingPosition).not.toHaveBeenCalled();
      });

      test('目標是基地或關閉包抄時不包抄', () => {
        ai.isFlankingMode = true;
        ai.flankingTarget = { x: 1, y: 1 };
        ai.currentTarget = 'base';
        ai._evaluateFlankingOpportunity();
        expect(ai.isFlankingMode).toBe(false);
        expect(ai.flankingTarget).toBeNull();

        ai.currentTarget = 'player';
        ai.flankingEnabled = false;
        ai.isFlankingMode = true;
        ai.flankingTarget = { x: 1, y: 1 };
        ai._evaluateFlankingOpportunity();
        expect(ai.isFlankingMode).toBe(false);
        expect(ai.flankingTarget).toBeNull();
        expect(scene.aiBlackboard.canJoinFlanking).not.toHaveBeenCalled();
      });

      test('沒有黑板時不包抄', () => {
        scene.aiBlackboard = null;
        ai.isFlankingMode = true;

        ai._evaluateFlankingOpportunity();

        expect(ai.isFlankingMode).toBe(false);
      });
    });

    describe('_executeFlankingMove', () => {
      test('沒有包抄目標時結束包抄模式', () => {
        ai.isFlankingMode = true;

        ai._executeFlankingMove();

        expect(ai.isFlankingMode).toBe(false);
      });

      test('到達包抄位置（< 30px）後切換到攻擊狀態並釋放位置', () => {
        ai.stateMachine.setState('chase');
        ai.isFlankingMode = true;
        ai.flankingTarget = { x: tank.x + 29, y: tank.y };

        ai._executeFlankingMove();

        expect(ai.isFlankingMode).toBe(false);
        expect(ai.flankingTarget).toBeNull();
        expect(scene.aiBlackboard.releaseFlankingPosition).toHaveBeenCalledWith(ai.id);
        expect(ai.stateMachine.getCurrentState()).toBe('attack');
      });

      test('尚未到達時朝包抄位置移動，並對玩家嘗試射擊', () => {
        const move = jest.spyOn(ai, '_moveTowardsTarget').mockImplementation(() => {});
        const shoot = jest.spyOn(ai, '_tryShootAtTargetWithPrediction').mockImplementation(() => {});
        scene.player = { ...cell(5, 15), isDestroyed: false };
        ai.isFlankingMode = true;
        ai.flankingTarget = { x: tank.x + 30, y: tank.y };

        ai._executeFlankingMove();

        expect(move).toHaveBeenCalledWith(ai.flankingTarget);
        expect(shoot).toHaveBeenCalledWith(scene.player);
        expect(ai.isFlankingMode).toBe(true);
      });

      test('玩家不存在或已摧毀時包抄途中不射擊', () => {
        jest.spyOn(ai, '_moveTowardsTarget').mockImplementation(() => {});
        const shoot = jest.spyOn(ai, '_tryShootAtTargetWithPrediction');
        ai.flankingTarget = { x: tank.x + 100, y: tank.y };

        ai._executeFlankingMove();
        scene.player = { ...cell(5, 15), isDestroyed: true };
        ai._executeFlankingMove();

        expect(shoot).not.toHaveBeenCalled();
      });
    });

    test('chase 狀態進入時評估包抄並標記攻擊、離開時清除', () => {
      scene.aiBlackboard.calculateFlankingPosition.mockReturnValue({ x: 50, y: 60 });

      ai.stateMachine.setState('chase');
      expect(ai.isFlankingMode).toBe(true);
      expect(scene.aiBlackboard.markAsAttacking).toHaveBeenCalledWith(ai.id);

      ai.stateMachine.setState('patrol');
      expect(ai.isFlankingMode).toBe(false);
      expect(ai.flankingTarget).toBeNull();
      expect(scene.aiBlackboard.markAsNotAttacking).toHaveBeenCalledWith(ai.id);
    });

    test('chase 狀態在包抄模式下執行包抄移動', () => {
      const flank = jest.spyOn(ai, '_executeFlankingMove').mockImplementation(() => {});
      const move = jest.spyOn(ai, '_moveTowardsTarget').mockImplementation(() => {});
      scene.player = { ...cell(5, 15), isDestroyed: false };
      ai.stateMachine.setState('chase');
      ai.isFlankingMode = true;
      ai.flankingTarget = { x: 1, y: 1 };

      ai.stateMachine.update(16);

      expect(flank).toHaveBeenCalled();
      expect(move).not.toHaveBeenCalled();
    });

    test('離開 chase 時應該釋放包抄位置，讓其他敵人可以包抄', () => {
      const realScene = makeScene();
      realScene.aiBlackboard = new AIBlackboard(realScene);
      realScene.aiBlackboard.updatePlayerInfo({ ...cell(12, 12), direction: 'up', isDestroyed: false });
      const enemies = [new EnemyAI(realScene, makeTank()), new EnemyAI(realScene, makeTank())];
      enemies.forEach(enemy => {
        enemy.currentTarget = 'player';
        enemy.stateMachine.setState('chase');
        expect(enemy.isFlankingMode).toBe(true);
      });
      expect(realScene.aiBlackboard.canJoinFlanking()).toBe(false);

      // 兩者中途改去攻擊 / 巡邏（尚未抵達包抄點）
      enemies[0].stateMachine.setState('attack');
      enemies[1].stateMachine.setState('patrol');

      expect(realScene.aiBlackboard.getFlankingEnemyCount()).toBe(0);
      expect(realScene.aiBlackboard.canJoinFlanking()).toBe(true);
    });

    test('attack 狀態進入與離開時更新黑板攻擊標記', () => {
      ai.stateMachine.setState('attack');
      expect(scene.aiBlackboard.markAsAttacking).toHaveBeenCalledWith(ai.id);

      ai.stateMachine.setState('patrol');
      expect(scene.aiBlackboard.markAsNotAttacking).toHaveBeenCalledWith(ai.id);
    });
  });
});
