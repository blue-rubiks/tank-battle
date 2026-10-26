/**
 * AIBlackboard 單元測試（真實實作）
 * 測試敵人團隊協作系統：玩家資訊共享、目標分配、包抄、巡邏點與威脅評估
 */

import AIBlackboard from '../../src/systems/AIBlackboard';
import { TILE_TYPES, GAME_CONFIG, AI_CONFIG } from '../../src/utils/Constants';

const TILE = GAME_CONFIG.TILE_SIZE;
const OFFSET_Y = GAME_CONFIG.PLAY_OFFSET_Y;

const makeMap = (fill = TILE_TYPES.EMPTY, size = 26) =>
  Array(size).fill(null).map(() => Array(size).fill(fill));

/** 世界座標 → 地圖格子 */
const toGrid = (x, y) => ({
  gx: Math.floor(x / TILE),
  gy: Math.floor((y - OFFSET_Y) / TILE)
});

const setTileAt = (map, x, y, tile) => {
  const { gx, gy } = toGrid(x, y);
  map[gy][gx] = tile;
};

const makeScene = (overrides = {}) => ({
  time: { now: 1000 },
  player: null,
  game: { config: { width: 832, height: 832 } },
  ...overrides
});

const makePlayer = (overrides = {}) => ({
  x: 400,
  y: 400,
  isDestroyed: false,
  direction: 'up',
  body: { velocity: { x: 0, y: -100 } },
  starLevel: 2,
  lives: 3,
  ...overrides
});

describe('AIBlackboard', () => {
  let scene;
  let blackboard;

  beforeEach(() => {
    scene = makeScene();
    blackboard = new AIBlackboard(scene);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('建構 - 初始狀態', () => {
    test('玩家資訊應該為空', () => {
      expect(blackboard.scene).toBe(scene);
      expect(blackboard.playerLastKnownPosition).toBeNull();
      expect(blackboard.playerLastSeenTime).toBe(0);
      expect(blackboard.playerVelocity).toEqual({ x: 0, y: 0 });
      expect(blackboard.playerDirection).toBe('down');
    });

    test('團隊狀態應該為空', () => {
      expect(blackboard.assignedTargets.size).toBe(0);
      expect(blackboard.targetAssignmentCooldown).toBe(3000);
      expect(blackboard.flankingPositions.size).toBe(0);
      expect(blackboard.occupiedPositions).toEqual([]);
      expect(blackboard.threatLevel).toBe(0);
      expect(blackboard.dangerZones).toEqual([]);
      expect(blackboard.activeEnemyCount).toBe(0);
      expect(blackboard.enemyPositions.size).toBe(0);
      expect(blackboard.attackingEnemies.size).toBe(0);
      expect(blackboard.assignedPatrolPoints.size).toBe(0);
    });

    test('包抄與間距設定應該來自 AI_CONFIG（不可另外寫死）', () => {
      expect(blackboard.config).toEqual({
        positionUpdateInterval: 100,
        flankingDistance: AI_CONFIG.FLANKING_DISTANCE,
        minDistanceBetweenEnemies: AI_CONFIG.MIN_ENEMY_SPACING,
        playerInfoExpireTime: 5000,
        maxFlankingEnemies: AI_CONFIG.MAX_FLANKING_ENEMIES
      });
    });

    test('應該在遊戲場內（扣除 HUD）建立 13 個覆蓋角落、邊緣與中央的候選巡邏點，並等待地圖驗證', () => {
      const third = 832 / 3;
      // 遊戲場從 y = PLAY_OFFSET_Y 開始，巡邏點必須跟著平移
      const at = (x, y) => ({ x, y: y + OFFSET_Y });
      expect(blackboard.patrolPoints).toEqual([
        at(80, 80),
        at(752, 80),
        at(80, 752),
        at(752, 752),
        at(416, 80),
        at(416, 752),
        at(80, 416),
        at(752, 416),
        at(416, 416),
        at(third, third),
        at(third * 2, third),
        at(third, third * 2),
        at(third * 2, third * 2)
      ]);
      expect(blackboard._patrolPointsNeedValidation).toBe(true);
    });
  });

  describe('玩家資訊管理', () => {
    test('應該能更新玩家位置、時間、速度與方向', () => {
      blackboard.updatePlayerInfo(makePlayer({ direction: 'left' }));

      expect(blackboard.playerLastKnownPosition).toEqual({ x: 400, y: 400 });
      expect(blackboard.playerLastSeenTime).toBe(1000);
      expect(blackboard.playerVelocity).toEqual({ x: 0, y: -100 });
      expect(blackboard.playerDirection).toBe('left');
    });

    test('玩家沒有方向時預設為 down', () => {
      blackboard.playerDirection = 'left';
      blackboard.updatePlayerInfo(makePlayer({ direction: undefined }));

      expect(blackboard.playerDirection).toBe('down');
    });

    test('玩家沒有 body 時保留舊速度', () => {
      blackboard.playerVelocity = { x: 5, y: 6 };
      blackboard.updatePlayerInfo(makePlayer({ body: null }));

      expect(blackboard.playerVelocity).toEqual({ x: 5, y: 6 });
      expect(blackboard.playerLastKnownPosition).toEqual({ x: 400, y: 400 });
    });

    test('玩家不存在或已摧毀時不更新', () => {
      blackboard.updatePlayerInfo(null);
      blackboard.updatePlayerInfo(makePlayer({ isDestroyed: true }));

      expect(blackboard.playerLastKnownPosition).toBeNull();
      expect(blackboard.playerLastSeenTime).toBe(0);
    });

    describe('predictPlayerPosition', () => {
      test('沒有玩家資訊時回傳 null', () => {
        expect(blackboard.predictPlayerPosition()).toBeNull();
      });

      test('應該依速度預測位置（預設 0.3 秒）', () => {
        blackboard.updatePlayerInfo(makePlayer({ body: { velocity: { x: 50, y: -100 } } }));

        expect(blackboard.predictPlayerPosition()).toEqual({ x: 415, y: 370 });
      });

      test('應該支援自訂預測時間', () => {
        blackboard.updatePlayerInfo(makePlayer({ body: { velocity: { x: 100, y: 0 } } }));

        expect(blackboard.predictPlayerPosition(1)).toEqual({ x: 500, y: 400 });
      });

      test('剛好 5 秒內的資訊仍然可以預測', () => {
        blackboard.updatePlayerInfo(makePlayer());
        scene.time.now = 6000;

        expect(blackboard.predictPlayerPosition(1)).toEqual({ x: 400, y: 300 });
      });

      test('資訊過舊（超過 5 秒）時回傳最後已知位置而不預測', () => {
        blackboard.updatePlayerInfo(makePlayer());
        scene.time.now = 6001;

        expect(blackboard.predictPlayerPosition(1)).toBe(blackboard.playerLastKnownPosition);
      });
    });

    describe('isPlayerInfoValid', () => {
      test('沒有玩家資訊時無效', () => {
        expect(blackboard.isPlayerInfoValid()).toBe(false);
      });

      test('5 秒內有效、滿 5 秒失效', () => {
        blackboard.updatePlayerInfo(makePlayer());

        scene.time.now = 5999;
        expect(blackboard.isPlayerInfoValid()).toBe(true);

        scene.time.now = 6000;
        expect(blackboard.isPlayerInfoValid()).toBe(false);
      });
    });
  });

  describe('目標分配', () => {
    test('預設偏好目標為 player', () => {
      expect(blackboard.assignTarget('e1')).toBe('player');
      expect(blackboard.assignedTargets.get('e1')).toBe('player');
    });

    test('應該尊重偏好目標', () => {
      expect(blackboard.assignTarget('e1', 'base')).toBe('base');
      expect(blackboard.assignedTargets.get('e1')).toBe('base');
    });

    test('只有 1 個敵人攻擊玩家時仍分配玩家', () => {
      blackboard.assignTarget('e1', 'player');

      expect(blackboard.assignTarget('e2', 'player')).toBe('player');
    });

    test('已有 2 個攻擊玩家且無人攻擊基地時，改派基地', () => {
      blackboard.assignTarget('e1', 'player');
      blackboard.assignTarget('e2', 'player');

      expect(blackboard.assignTarget('e3', 'player')).toBe('base');
      expect(blackboard.assignedTargets.get('e3')).toBe('base');
    });

    test('已有人攻擊基地時不需要再改派', () => {
      blackboard.assignTarget('e1', 'player');
      blackboard.assignTarget('e2', 'player');
      blackboard.assignTarget('e3', 'base');

      expect(blackboard.assignTarget('e4', 'player')).toBe('player');
    });

    test('其他目標類型不計入玩家或基地數量', () => {
      blackboard.assignedTargets.set('x1', 'player');
      blackboard.assignedTargets.set('x2', 'player');
      blackboard.assignedTargets.set('x3', 'other');

      expect(blackboard.assignTarget('e1', 'player')).toBe('base');
    });

    test('移除目標分配應該清除該敵人的所有紀錄', () => {
      blackboard.assignTarget('e1', 'player');
      blackboard.flankingPositions.set('e1', { x: 1, y: 1 });
      blackboard.assignedPatrolPoints.set('e1', 0);
      blackboard.updateEnemyPosition('e1', { x: 1, y: 1 });
      blackboard.markAsAttacking('e1');
      blackboard.assignTarget('e2', 'base');

      blackboard.removeTargetAssignment('e1');

      expect(blackboard.assignedTargets.has('e1')).toBe(false);
      expect(blackboard.flankingPositions.has('e1')).toBe(false);
      expect(blackboard.assignedPatrolPoints.has('e1')).toBe(false);
      expect(blackboard.enemyPositions.has('e1')).toBe(false);
      expect(blackboard.attackingEnemies.has('e1')).toBe(false);
      expect(blackboard.assignedTargets.get('e2')).toBe('base');
    });
  });

  describe('包抄戰術', () => {
    beforeEach(() => {
      blackboard.updatePlayerInfo(makePlayer());
    });

    test('沒有玩家資訊時回傳 null', () => {
      blackboard.playerLastKnownPosition = null;

      expect(blackboard.calculateFlankingPosition('e1')).toBeNull();
    });

    test('應該優先選擇玩家背後（玩家朝上 → 下方）並記錄', () => {
      const pos = blackboard.calculateFlankingPosition('e1');

      expect(pos).toEqual({ x: 400, y: 520, side: 'bottom' });
      expect(blackboard.flankingPositions.get('e1')).toBe(pos);
    });

    test('玩家朝左時優先包抄右側（背後）', () => {
      blackboard.updatePlayerInfo(makePlayer({ direction: 'left' }));

      expect(blackboard.calculateFlankingPosition('e1'))
        .toEqual({ x: 520, y: 400, side: 'right' });
    });

    test('背後已被其他敵人佔據時改選側翼', () => {
      blackboard.flankingPositions.set('e2', { x: 400, y: 520 });

      const pos = blackboard.calculateFlankingPosition('e1');

      expect(pos).toEqual({ x: 280, y: 400, side: 'left' });
    });

    test('有偏好側時優先沿用該側（玩家朝上，偏好左側 → 左）', () => {
      expect(blackboard.calculateFlankingPosition('e1', 'left'))
        .toEqual({ x: 280, y: 400, side: 'left' });
    });

    test('偏好側不可用時退回玩家方向的優先序', () => {
      // 玩家朝上、偏好左側，但左側已被 e2 佔據 → 退回背後（下方）
      blackboard.flankingPositions.set('e2', { x: 280, y: 400 });

      expect(blackboard.calculateFlankingPosition('e1', 'left').side).toBe('bottom');
    });

    test('偏好側為 null 或未知值時維持原本的優先序', () => {
      expect(blackboard.calculateFlankingPosition('e1', null).side).toBe('bottom');
      expect(blackboard.calculateFlankingPosition('e1', 'center').side).toBe('bottom');
    });

    test('自己原本的包抄位置不算被佔據', () => {
      blackboard.flankingPositions.set('e1', { x: 400, y: 520 });

      expect(blackboard.calculateFlankingPosition('e1').side).toBe('bottom');
    });

    test('超出地圖範圍的包抄位置應該被跳過', () => {
      // 玩家朝右靠近左邊界：優先的左側 (x=-20) 不合法 → 改選上方
      blackboard.updatePlayerInfo(makePlayer({ x: 100, y: 400, direction: 'right' }));

      expect(blackboard.calculateFlankingPosition('e1'))
        .toEqual({ x: 100, y: 280, side: 'top' });
    });

    test('包抄位置周圍有牆時應該被跳過', () => {
      const map = makeMap();
      // 下方包抄點 (400, 520) 跨在兩列之間：中心可走，但坦克下半身會壓到下一列的磚牆
      setTileAt(map, 400, 534, TILE_TYPES.BRICK);
      scene.levelData = { map };

      expect(blackboard.calculateFlankingPosition('e1').side).toBe('left');
    });

    test('所有包抄位置都不可走時，改用附近的可行走位置', () => {
      const map = makeMap();
      const blockers = [[400, 520], [280, 400], [520, 400], [400, 280]];
      blockers.forEach(([x, y]) => setTileAt(map, x, y, TILE_TYPES.STEEL));
      scene.levelData = { map };

      const pos = blackboard.calculateFlankingPosition('e1');

      // 下方 (400,520) 最高優先，往右 16px 仍會碰到鋼牆格，往右 32px 才完全淨空
      expect(pos).toEqual({ x: 432, y: 520, side: 'bottom' });
      expect(blackboard.flankingPositions.get('e1')).toBe(pos);
    });

    test('附近可行走位置被佔據時改用下一個方向的附近位置', () => {
      const map = makeMap();
      const blockers = [[400, 520], [280, 400], [520, 400], [400, 280]];
      blockers.forEach(([x, y]) => setTileAt(map, x, y, TILE_TYPES.STEEL));
      scene.levelData = { map };
      blackboard.flankingPositions.set('e2', { x: 432, y: 520 });

      const pos = blackboard.calculateFlankingPosition('e1');

      expect(pos.side).toBe('left');
    });

    test('完全找不到可用位置時回傳 null', () => {
      scene.levelData = { map: makeMap(TILE_TYPES.WATER) };

      expect(blackboard.calculateFlankingPosition('e1')).toBeNull();
      expect(blackboard.flankingPositions.has('e1')).toBe(false);
    });

    describe('_prioritizeFlankingPositions', () => {
      const sides = () => ['top', 'right', 'bottom', 'left'].map(side => ({ side }));

      test.each([
        ['up', ['bottom', 'left', 'right', 'top']],
        ['down', ['top', 'left', 'right', 'bottom']],
        ['left', ['right', 'top', 'bottom', 'left']],
        ['right', ['left', 'top', 'bottom', 'right']],
        ['unknown', ['left', 'right', 'top', 'bottom']]
      ])('玩家朝 %s 時的優先順序', (direction, expected) => {
        const sorted = blackboard._prioritizeFlankingPositions(sides(), direction);

        expect(sorted.map(p => p.side)).toEqual(expected);
      });
    });

    describe('_isPositionOccupied', () => {
      test('距離小於最小間距視為佔據，剛好等於則否', () => {
        blackboard.flankingPositions.set('e2', { x: 100, y: 100 });

        expect(blackboard._isPositionOccupied({ x: 159, y: 100 }, 'e1')).toBe(true);
        expect(blackboard._isPositionOccupied({ x: 160, y: 100 }, 'e1')).toBe(false);
      });

      test('應該排除自己的位置', () => {
        blackboard.flankingPositions.set('e1', { x: 100, y: 100 });

        expect(blackboard._isPositionOccupied({ x: 100, y: 100 }, 'e1')).toBe(false);
      });
    });

    test('releaseFlankingPosition 只釋放該敵人的包抄位置', () => {
      blackboard.flankingPositions.set('e1', { x: 0, y: 0 });
      blackboard.flankingPositions.set('e2', { x: 100, y: 0 });
      blackboard.assignTarget('e1', 'player');

      blackboard.releaseFlankingPosition('e1');

      expect(blackboard.flankingPositions.has('e1')).toBe(false);
      expect(blackboard.flankingPositions.has('e2')).toBe(true);
      expect(blackboard.assignedTargets.get('e1')).toBe('player');
    });

    test('canJoinFlanking 應該限制同時包抄人數為 2', () => {
      expect(blackboard.canJoinFlanking()).toBe(true);

      blackboard.flankingPositions.set('e1', { x: 0, y: 0 });
      expect(blackboard.getFlankingEnemyCount()).toBe(1);
      expect(blackboard.canJoinFlanking()).toBe(true);

      blackboard.flankingPositions.set('e2', { x: 0, y: 0 });
      expect(blackboard.getFlankingEnemyCount()).toBe(2);
      expect(blackboard.canJoinFlanking()).toBe(false);
    });
  });

  describe('位置有效性檢查', () => {
    describe('_isPositionValid - 邊界', () => {
      // 遊戲場 x: 0~832、y: 44~876，四邊各留 32px
      test.each([
        [{ x: 32, y: 400 }, false],
        [{ x: 33, y: 400 }, true],
        [{ x: 800, y: 400 }, false],
        [{ x: 799, y: 400 }, true],
        [{ x: 400, y: OFFSET_Y + 32 }, false],
        [{ x: 400, y: OFFSET_Y + 33 }, true],
        [{ x: 400, y: OFFSET_Y + 800 }, false],
        [{ x: 400, y: OFFSET_Y + 799 }, true]
      ])('%o 是否有效：%s', (pos, expected) => {
        expect(blackboard._isPositionValid(pos)).toBe(expected);
      });

      test('邊界依遊戲場而非畫布（含 HUD 的 912px 高）', () => {
        scene.game.config = { width: 832, height: GAME_CONFIG.HEIGHT };

        // 底部 HUD 正上方的 32px 邊距內
        expect(blackboard._isPositionValid({ x: 400, y: OFFSET_Y + 810 })).toBe(false);
        // 頂部 HUD 下方的 32px 邊距內
        expect(blackboard._isPositionValid({ x: 400, y: 60 })).toBe(false);
      });

      test('邊界內但不可行走時無效', () => {
        const map = makeMap();
        setTileAt(map, 400, 400, TILE_TYPES.BRICK);
        scene.levelData = { map };

        expect(blackboard._isPositionValid({ x: 400, y: 400 })).toBe(false);
      });
    });

    describe('_isPositionWalkable - 地形', () => {
      test('沒有關卡資料或地圖時假設可行走', () => {
        expect(blackboard._isPositionWalkable({ x: 400, y: 400 })).toBe(true);

        scene.levelData = {};
        expect(blackboard._isPositionWalkable({ x: 400, y: 400 })).toBe(true);
      });

      test.each([
        [TILE_TYPES.EMPTY, true],
        [TILE_TYPES.BRICK, false],
        [TILE_TYPES.STEEL, false],
        [TILE_TYPES.WATER, false],
        [TILE_TYPES.ICE, true],
        [TILE_TYPES.FOREST, true],
        [TILE_TYPES.BASE, true]
      ])('地形 %i 可行走：%s', (tile, expected) => {
        const map = makeMap();
        setTileAt(map, 400, 400, tile);
        scene.levelData = { map };

        expect(blackboard._isPositionWalkable({ x: 400, y: 400 })).toBe(expected);
      });

      test('換算格子時應該扣除遊戲場 Y 偏移', () => {
        const map = makeMap();
        // y = 44 是第 0 列、y = 43 已在地圖外
        map[0][0] = TILE_TYPES.BRICK;
        scene.levelData = { map };

        expect(blackboard._isPositionWalkable({ x: 10, y: OFFSET_Y })).toBe(false);
        expect(blackboard._isPositionWalkable({ x: 10, y: OFFSET_Y + TILE })).toBe(true);
      });

      test('第 0 列是地圖內的可走格', () => {
        scene.levelData = { map: makeMap() };

        expect(blackboard._isPositionWalkable({ x: 10, y: OFFSET_Y })).toBe(true);
      });

      test.each([
        [{ x: -1, y: 400 }],
        [{ x: 832, y: 400 }],
        [{ x: 400, y: OFFSET_Y - 1 }],
        [{ x: 400, y: OFFSET_Y + 832 }]
      ])('地圖外 %o 不可行走', (pos) => {
        scene.levelData = { map: makeMap() };

        expect(blackboard._isPositionWalkable(pos)).toBe(false);
      });

      test('最後一列與最後一欄仍在地圖內', () => {
        scene.levelData = { map: makeMap() };

        expect(blackboard._isPositionWalkable({ x: 831, y: OFFSET_Y + 831 })).toBe(true);
      });
    });

    describe('_isPositionSafelyWalkable - 坦克佔地', () => {
      // (400, 412) 是第 12 欄、第 11 列的格子中心
      const cx = 400;
      const cy = 412;

      test('沒有地圖時視為安全', () => {
        expect(blackboard._isPositionSafelyWalkable({ x: cx, y: cy })).toBe(true);
      });

      test('站在格子中心時只需要該格可走（四周的牆不影響，左右對稱）', () => {
        const map = makeMap(TILE_TYPES.BRICK);
        setTileAt(map, cx, cy, TILE_TYPES.EMPTY);
        scene.levelData = { map };

        expect(blackboard._isPositionSafelyWalkable({ x: cx, y: cy })).toBe(true);
      });

      test('中心格是牆時不安全', () => {
        const map = makeMap();
        setTileAt(map, cx, cy, TILE_TYPES.WATER);
        scene.levelData = { map };

        expect(blackboard._isPositionSafelyWalkable({ x: cx, y: cy })).toBe(false);
      });

      test.each([
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ])('偏離中心時，壓到 (%i, %i) 方向斜對角的牆也不安全', (dx, dy) => {
        const map = makeMap();
        setTileAt(map, cx + dx * TILE, cy + dy * TILE, TILE_TYPES.BRICK);
        scene.levelData = { map };

        expect(blackboard._isPositionSafelyWalkable({ x: cx + dx * 3, y: cy + dy * 3 })).toBe(false);
        expect(blackboard._isPositionSafelyWalkable({ x: cx - dx * 3, y: cy - dy * 3 })).toBe(true);
      });
    });

    describe('_findNearbyWalkablePosition', () => {
      test('應該以 16px 為步長由近而遠搜尋並保留 side', () => {
        const map = makeMap();
        setTileAt(map, 400, 400, TILE_TYPES.BRICK);
        scene.levelData = { map };

        // 半徑 16 的候選都還碰到磚牆格，半徑 32 的第一個候選（右）淨空
        expect(blackboard._findNearbyWalkablePosition({ x: 400, y: 400, side: 'left' }))
          .toEqual({ x: 432, y: 400, side: 'left' });
      });

      /** 只讓指定座標通過安全行走檢查，用來驗證候選順序 */
      const onlyWalkableAt = (ex, ey) => {
        jest.spyOn(blackboard, '_isPositionSafelyWalkable')
          .mockImplementation(p => p.x === ex && p.y === ey);
      };

      test.each([
        ['右', 416, 400],
        ['左', 384, 400],
        ['下', 400, 416],
        ['上', 400, 384],
        ['右下', 416, 416],
        ['左下', 384, 416],
        ['右上', 416, 384],
        ['左上', 384, 384]
      ])('%s方的候選應該被搜尋到', (_label, ex, ey) => {
        onlyWalkableAt(ex, ey);

        expect(blackboard._findNearbyWalkablePosition({ x: 400, y: 400 }, 16))
          .toEqual({ x: ex, y: ey, side: undefined });
      });

      test('候選點必須同時在邊界內', () => {
        // 右方候選可走但超出地圖邊界 → 只能選左方
        jest.spyOn(blackboard, '_isPositionSafelyWalkable')
          .mockImplementation(p => p.y === 400 && (p.x === 816 || p.x === 784));

        expect(blackboard._findNearbyWalkablePosition({ x: 800, y: 400 }, 16))
          .toEqual({ x: 784, y: 400, side: undefined });
      });

      test('預設搜尋半徑為 80px（含）', () => {
        onlyWalkableAt(480, 412);

        expect(blackboard._findNearbyWalkablePosition({ x: 400, y: 412 }))
          .toEqual({ x: 480, y: 412, side: undefined });
        expect(blackboard._findNearbyWalkablePosition({ x: 400, y: 412 }, 64)).toBeNull();
      });

      test('範圍內都不可走時回傳 null', () => {
        scene.levelData = { map: makeMap(TILE_TYPES.STEEL) };

        expect(blackboard._findNearbyWalkablePosition({ x: 400, y: 400 })).toBeNull();
      });
    });
  });

  describe('團隊協調', () => {
    test('應該記錄敵人位置與更新時間', () => {
      blackboard.updateEnemyPosition('e1', { x: 100, y: 200 });

      expect(blackboard.enemyPositions.get('e1')).toEqual({ x: 100, y: 200, time: 1000 });
    });

    test('應該能獲取附近的敵人（排除自己、由近到遠）', () => {
      blackboard.updateEnemyPosition('far', { x: 140, y: 100 });
      blackboard.updateEnemyPosition('self', { x: 100, y: 100 });
      blackboard.updateEnemyPosition('near', { x: 110, y: 100 });
      blackboard.updateEnemyPosition('edge', { x: 150, y: 100 });
      blackboard.updateEnemyPosition('out', { x: 300, y: 100 });

      const nearby = blackboard.getNearbyEnemies({ x: 100, y: 100 }, 50, 'self');

      expect(nearby.map(n => n.enemyId)).toEqual(['near', 'far']);
      expect(nearby[0].distance).toBe(10);
      expect(nearby[0].position).toEqual({ x: 110, y: 100, time: 1000 });
    });

    test('沒有排除對象時應該包含所有範圍內敵人', () => {
      blackboard.updateEnemyPosition('e1', { x: 100, y: 100 });

      expect(blackboard.getNearbyEnemies({ x: 100, y: 100 }, 10)).toHaveLength(1);
    });

    test('應該計算正在攻擊特定目標的敵人數', () => {
      blackboard.assignTarget('e1', 'player');
      blackboard.assignTarget('e2', 'player');
      blackboard.assignTarget('e3', 'base');
      blackboard.assignTarget('e4', 'player');
      blackboard.markAsAttacking('e1');
      blackboard.markAsAttacking('e2');
      blackboard.markAsAttacking('e3');

      expect(blackboard.getAttackersCount('player')).toBe(2);
      expect(blackboard.getAttackersCount('player', 'e1')).toBe(1);
      expect(blackboard.getAttackersCount('base')).toBe(1);

      blackboard.markAsNotAttacking('e2');
      expect(blackboard.getAttackersCount('player')).toBe(1);
    });
  });

  describe('智能巡邏點系統', () => {
    describe('_validatePatrolPoints', () => {
      test('地圖尚未載入時保持待驗證', () => {
        blackboard._validatePatrolPoints();
        expect(blackboard._patrolPointsNeedValidation).toBe(true);

        scene.levelData = {};
        blackboard._validatePatrolPoints();
        expect(blackboard._patrolPointsNeedValidation).toBe(true);
        expect(blackboard.patrolPoints).toHaveLength(13);
      });

      test('已驗證過時不再處理', () => {
        blackboard._patrolPointsNeedValidation = false;
        scene.levelData = { map: makeMap(TILE_TYPES.BRICK) };

        blackboard._validatePatrolPoints();

        expect(blackboard.patrolPoints).toHaveLength(13);
      });

      test('應該過濾掉不可行走的巡邏點', () => {
        const map = makeMap();
        setTileAt(map, 80, 80 + OFFSET_Y, TILE_TYPES.BRICK);
        scene.levelData = { map };

        blackboard._validatePatrolPoints();

        expect(blackboard.patrolPoints).toHaveLength(12);
        expect(blackboard.patrolPoints).not.toContainEqual({ x: 80, y: 80 + OFFSET_Y });
        expect(blackboard._patrolPointsNeedValidation).toBe(false);
      });

      test('剩下 5 個有效點時不補點', () => {
        const generate = jest.spyOn(blackboard, '_generateWalkablePatrolPoints');
        blackboard.patrolPoints = blackboard.patrolPoints.slice(0, 5);
        scene.levelData = { map: makeMap() };

        blackboard._validatePatrolPoints();

        expect(generate).not.toHaveBeenCalled();
        expect(blackboard.patrolPoints).toHaveLength(5);
      });

      test('有效點少於 5 個時補足到 10 個', () => {
        const extra = [{ x: 1, y: 1 }];
        const generate = jest.spyOn(blackboard, '_generateWalkablePatrolPoints')
          .mockReturnValue(extra);
        blackboard.patrolPoints = blackboard.patrolPoints.slice(0, 4);
        scene.levelData = { map: makeMap() };

        blackboard._validatePatrolPoints();

        expect(generate).toHaveBeenCalledWith(6);
        expect(blackboard.patrolPoints).toHaveLength(5);
        expect(blackboard.patrolPoints[4]).toBe(extra[0]);
        expect(blackboard._patrolPointsNeedValidation).toBe(false);
      });
    });

    describe('_generateWalkablePatrolPoints', () => {
      test('應該在邊界內產生可行走、彼此相距 100px 以上的點，且嘗試次數有上限', () => {
        scene.levelData = { map: makeMap() };
        blackboard.patrolPoints = [{ x: 416, y: 416 }];
        const random = jest.spyOn(Math, 'random').mockReturnValue(0);

        const points = blackboard._generateWalkablePatrolPoints(2);

        // random = 0 → 每次都是左上角 (80, 44 + 80)：第一次接受，之後都太近被拒絕
        expect(points).toEqual([{ x: 80, y: OFFSET_Y + 80 }]);
        expect(random).toHaveBeenCalledTimes(2 * 2 * 20);
      });

      test('候選點應該分布在遊戲場內（扣除 HUD 與邊距）', () => {
        scene.levelData = { map: makeMap() };
        blackboard.patrolPoints = [];
        jest.spyOn(Math, 'random').mockReturnValue(0.5);

        expect(blackboard._generateWalkablePatrolPoints(1)).toEqual([
          { x: GAME_CONFIG.WIDTH / 2, y: OFFSET_Y + GAME_CONFIG.PLAY_HEIGHT / 2 }
        ]);

        blackboard.patrolPoints = [];
        Math.random.mockReturnValue(0.999);
        const [far] = blackboard._generateWalkablePatrolPoints(1);
        expect(far.x).toBeCloseTo(80 + 0.999 * (GAME_CONFIG.WIDTH - 160));
        expect(far.y).toBeCloseTo(OFFSET_Y + 80 + 0.999 * (GAME_CONFIG.PLAY_HEIGHT - 160));
      });

      test('與既有巡邏點太近的候選要被拒絕', () => {
        scene.levelData = { map: makeMap() };
        blackboard.patrolPoints = [{ x: 80 + 99, y: OFFSET_Y + 80 }];
        jest.spyOn(Math, 'random').mockReturnValue(0);

        expect(blackboard._generateWalkablePatrolPoints(1)).toEqual([]);

        blackboard.patrolPoints = [{ x: 80 + 100, y: OFFSET_Y + 80 }];
        expect(blackboard._generateWalkablePatrolPoints(1)).toEqual([{ x: 80, y: OFFSET_Y + 80 }]);
      });

      test('不可行走的候選要被拒絕', () => {
        scene.levelData = { map: makeMap(TILE_TYPES.BRICK) };
        blackboard.patrolPoints = [];

        expect(blackboard._generateWalkablePatrolPoints(3)).toEqual([]);
      });

      test('數量足夠時應該停止產生', () => {
        scene.levelData = { map: makeMap() };
        blackboard.patrolPoints = [];
        const values = [0, 0, 0.5, 0.5, 0.99, 0.99];
        const random = jest.spyOn(Math, 'random').mockImplementation(() => values.shift() ?? 0);

        const points = blackboard._generateWalkablePatrolPoints(2);

        expect(points).toHaveLength(2);
        expect(random).toHaveBeenCalledTimes(4);
      });
    });

    describe('assignPatrolPoint', () => {
      // 遊戲場中央
      const CENTER = { x: 416, y: OFFSET_Y + 416 };

      test('應該選擇距離適中的點並記錄索引', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);

        // 從遊戲場中央出發：角落太遠扣分、正上方距離 336 為第一個滿分點
        const point = blackboard.assignPatrolPoint('e1', CENTER);

        expect(point).toEqual({ x: 416, y: OFFSET_Y + 80 });
        expect(blackboard.assignedPatrolPoints.get('e1')).toBe(4);
      });

      test('已被分配的點不會再分給其他敵人', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        blackboard.assignPatrolPoint('e1', CENTER);

        const point = blackboard.assignPatrolPoint('e2', CENTER);

        expect(point).toEqual({ x: 416, y: OFFSET_Y + 752 });
        expect(blackboard.assignedPatrolPoints.get('e2')).toBe(5);
      });

      test('隨機因素最多 +30 分，可讓較遠的點勝出', () => {
        // 第一個點（角落，85 分）抽到 1 → 115 分，其餘 0
        const values = [1];
        jest.spyOn(Math, 'random').mockImplementation(() => values.shift() ?? 0);

        expect(blackboard.assignPatrolPoint('e1', CENTER)).toEqual({ x: 80, y: OFFSET_Y + 80 });
      });

      test('太近（< 100px）的點依距離扣分', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        blackboard.patrolPoints = [{ x: 450, y: 416 }, { x: 666, y: 416 }];

        expect(blackboard.assignPatrolPoint('e1', { x: 416, y: 416 })).toEqual({ x: 666, y: 416 });
      });

      test('稍近的點（90px，扣 10 分）優於很遠的點（600px，扣 40 分）', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        blackboard.patrolPoints = [{ x: 416 + 600, y: 416 }, { x: 416 + 90, y: 416 }];

        expect(blackboard.assignPatrolPoint('e1', { x: 416, y: 416 })).toEqual({ x: 506, y: 416 });
      });

      test('最佳點是第 0 個時也應該被選上（不可退回隨機）', () => {
        // 第 0 個點抽到 +30 分勝出；若退回隨機會抽到 0.5 → 第 6 個點
        const values = [1, ...Array(12).fill(0), 0.5];
        jest.spyOn(Math, 'random').mockImplementation(() => values.shift());

        expect(blackboard.assignPatrolPoint('e1', CENTER)).toBe(blackboard.patrolPoints[0]);
        expect(blackboard.assignedPatrolPoints.get('e1')).toBe(0);
      });

      test('太遠（> 400px）的點以 1/5 比例扣分，仍優於太近的點', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        // 50px → 50 分；500px → 80 分
        blackboard.patrolPoints = [{ x: 466, y: 416 }, { x: 916, y: 416 }];

        expect(blackboard.assignPatrolPoint('e1', { x: 416, y: 416 })).toEqual({ x: 916, y: 416 });
      });

      test('剛好 400px 不扣分', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);
        // 399.x 與 400 都是 100 分 → 取第一個
        blackboard.patrolPoints = [{ x: 816, y: 416 }, { x: 716, y: 416 }];

        expect(blackboard.assignPatrolPoint('e1', { x: 416, y: 416 })).toEqual({ x: 816, y: 416 });
      });

      test('所有點都被分配時隨機挑一個', () => {
        blackboard.patrolPoints.forEach((_, i) => blackboard.assignedPatrolPoints.set(`x${i}`, i));
        jest.spyOn(Math, 'random').mockReturnValue(0.5);

        const point = blackboard.assignPatrolPoint('e1', { x: 416, y: 416 });

        expect(point).toBe(blackboard.patrolPoints[6]);
        expect(blackboard.assignedPatrolPoints.get('e1')).toBe(6);
      });
    });

    describe('getNextPatrolPoint', () => {
      test('沒有分配時回傳 null', () => {
        expect(blackboard.getNextPatrolPoint('e1')).toBeNull();
      });

      test('應該前進到下一個點並更新索引', () => {
        blackboard.assignedPatrolPoints.set('e1', 0);

        expect(blackboard.getNextPatrolPoint('e1')).toBe(blackboard.patrolPoints[1]);
        expect(blackboard.assignedPatrolPoints.get('e1')).toBe(1);
      });

      test('最後一個點之後應該循環回第一個', () => {
        blackboard.assignedPatrolPoints.set('e1', 12);

        expect(blackboard.getNextPatrolPoint('e1')).toBe(blackboard.patrolPoints[0]);
        expect(blackboard.assignedPatrolPoints.get('e1')).toBe(0);
      });
    });
  });

  describe('威脅評估', () => {
    test('玩家不存在或已摧毀時威脅為 0', () => {
      blackboard.threatLevel = 50;
      blackboard.calculateThreatLevel(null);
      expect(blackboard.getThreatLevel()).toBe(0);

      blackboard.threatLevel = 50;
      blackboard.calculateThreatLevel(makePlayer({ isDestroyed: true }));
      expect(blackboard.getThreatLevel()).toBe(0);
    });

    test('基礎 50 + 星星 ×10 + 生命 ×5', () => {
      blackboard.updateEnemyPosition('e1', { x: 0, y: 0 });
      blackboard.updateEnemyPosition('e2', { x: 0, y: 0 });

      blackboard.calculateThreatLevel(makePlayer({ starLevel: 1, lives: 2 }));

      expect(blackboard.getThreatLevel()).toBe(70);
    });

    test('沒有星星與生命時只有基礎值', () => {
      blackboard.updateEnemyPosition('e1', { x: 0, y: 0 });
      blackboard.updateEnemyPosition('e2', { x: 0, y: 0 });

      blackboard.calculateThreatLevel(makePlayer({ starLevel: 0, lives: 0 }));

      expect(blackboard.getThreatLevel()).toBe(50);
    });

    test('活躍敵人少於 2 時威脅 +20', () => {
      blackboard.updateEnemyPosition('e1', { x: 0, y: 0 });

      blackboard.calculateThreatLevel(makePlayer({ starLevel: 0, lives: 1 }));

      expect(blackboard.getThreatLevel()).toBe(75);
    });

    test('玩家缺少星級或生命欄位時視為 0（不可變成 NaN）', () => {
      blackboard.updateEnemyPosition('e1', { x: 0, y: 0 });
      blackboard.updateEnemyPosition('e2', { x: 0, y: 0 });

      blackboard.calculateThreatLevel({ isDestroyed: false });

      expect(blackboard.getThreatLevel()).toBe(50);
    });

    test('威脅等級上限為 100', () => {
      blackboard.calculateThreatLevel(makePlayer({ starLevel: 4, lives: 5 }));

      expect(blackboard.getThreatLevel()).toBe(100);
    });
  });

  describe('清理與每幀更新', () => {
    test('clear 應該清除所有數據', () => {
      blackboard.updatePlayerInfo(makePlayer());
      blackboard.assignTarget('e1');
      blackboard.flankingPositions.set('e1', { x: 0, y: 0 });
      blackboard.occupiedPositions.push({ x: 0, y: 0 });
      blackboard.updateEnemyPosition('e1', { x: 0, y: 0 });
      blackboard.markAsAttacking('e1');
      blackboard.assignedPatrolPoints.set('e1', 1);
      blackboard.threatLevel = 80;

      blackboard.clear();

      expect(blackboard.playerLastKnownPosition).toBeNull();
      expect(blackboard.playerLastSeenTime).toBe(0);
      expect(blackboard.playerVelocity).toEqual({ x: 0, y: 0 });
      expect(blackboard.assignedTargets.size).toBe(0);
      expect(blackboard.flankingPositions.size).toBe(0);
      expect(blackboard.occupiedPositions).toEqual([]);
      expect(blackboard.enemyPositions.size).toBe(0);
      expect(blackboard.attackingEnemies.size).toBe(0);
      expect(blackboard.assignedPatrolPoints.size).toBe(0);
      expect(blackboard.threatLevel).toBe(0);
    });

    test('update 應該驗證巡邏點、更新敵人數與玩家資訊', () => {
      scene.levelData = { map: makeMap() };
      scene.player = makePlayer({ starLevel: 0, lives: 1 });
      blackboard.updateEnemyPosition('e1', { x: 0, y: 0 });
      blackboard.updateEnemyPosition('e2', { x: 0, y: 0 });

      blackboard.update();

      expect(blackboard._patrolPointsNeedValidation).toBe(false);
      expect(blackboard.activeEnemyCount).toBe(2);
      expect(blackboard.playerLastKnownPosition).toEqual({ x: 400, y: 400 });
      expect(blackboard.getThreatLevel()).toBe(55);
    });

    test('巡邏點已驗證時 update 不再驗證', () => {
      const validate = jest.spyOn(blackboard, '_validatePatrolPoints');
      blackboard._patrolPointsNeedValidation = false;

      blackboard.update();

      expect(validate).not.toHaveBeenCalled();
    });

    test('玩家已摧毀時 update 不更新玩家資訊', () => {
      scene.player = makePlayer({ isDestroyed: true });
      blackboard.threatLevel = 42;

      blackboard.update();

      expect(blackboard.playerLastKnownPosition).toBeNull();
      expect(blackboard.getThreatLevel()).toBe(42);
    });

    test('沒有玩家時 update 不應該拋錯', () => {
      expect(() => blackboard.update()).not.toThrow();
      expect(blackboard.activeEnemyCount).toBe(0);
    });
  });
});
