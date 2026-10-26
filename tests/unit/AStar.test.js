/**
 * A* 尋路演算法測試
 */

import AStar from '../../src/utils/AStar';
import { TILE_TYPES, GAME_CONFIG } from '../../src/utils/Constants';

const TILE = GAME_CONFIG.TILE_SIZE;
const OFFSET_Y = GAME_CONFIG.PLAY_OFFSET_Y;

const makeEmptyMap = (size = 26) =>
  Array(size).fill(null).map(() => Array(size).fill(TILE_TYPES.EMPTY));

/**
 * 格子座標轉世界座標（格子中心）
 */
const toWorld = (gridX, gridY) => ({
  x: gridX * TILE + TILE / 2,
  y: gridY * TILE + TILE / 2 + OFFSET_Y
});

describe('AStar', () => {
  test('開闊地圖上應該找到路徑', () => {
    const map = makeEmptyMap();
    const path = AStar.findPath(toWorld(1, 1), toWorld(5, 1), map, TILE, OFFSET_Y);

    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(0);
    // 終點是目標格子
    const last = path[path.length - 1];
    expect(last.gridX).toBe(5);
    expect(last.gridY).toBe(1);
  });

  test('路徑應該繞過牆壁缺口', () => {
    const map = makeEmptyMap();
    // 橫牆只留 x=10 缺口
    for (let x = 0; x < 26; x++) {
      if (x !== 10) {
        map[7][x] = TILE_TYPES.BRICK;
      }
    }

    const path = AStar.findPath(toWorld(5, 5), toWorld(5, 12), map, TILE, OFFSET_Y);

    expect(path).not.toBeNull();
    // 穿越橫牆的那一步必須在缺口
    const crossing = path.find(p => p.gridY === 7);
    expect(crossing.gridX).toBe(10);
  });

  test('目標被完全包圍時應該回傳 null', () => {
    const map = makeEmptyMap();
    // 目標 (10,10) 周圍築滿鋼牆
    [[9, 10], [11, 10], [10, 9], [10, 11]].forEach(([x, y]) => {
      map[y][x] = TILE_TYPES.STEEL;
    });

    const path = AStar.findPath(toWorld(1, 1), toWorld(10, 10), map, TILE, OFFSET_Y);

    expect(path).toBeNull();
  });

  test('冰地、森林與基地格應該可通行', () => {
    const map = makeEmptyMap();
    // 強制路徑經過特殊地形
    for (let x = 0; x < 26; x++) {
      if (x !== 3) {
        map[5][x] = TILE_TYPES.BRICK;
      }
    }
    map[5][3] = TILE_TYPES.ICE;

    const path = AStar.findPath(toWorld(3, 3), toWorld(3, 8), map, TILE, OFFSET_Y);

    expect(path).not.toBeNull();
    expect(path.some(p => p.gridX === 3 && p.gridY === 5)).toBe(true);
  });

  test('水域應該不可通行', () => {
    const map = makeEmptyMap();
    // 水域整排橫斷
    for (let x = 0; x < 26; x++) {
      map[5][x] = TILE_TYPES.WATER;
    }

    const path = AStar.findPath(toWorld(3, 3), toWorld(3, 8), map, TILE, OFFSET_Y);

    expect(path).toBeNull();
  });

  describe('simplifyPath', () => {
    test('應該移除同方向的中間點', () => {
      const straight = [
        { x: 16, y: 16 },
        { x: 48, y: 16 },
        { x: 80, y: 16 },
        { x: 112, y: 16 }
      ];

      const simplified = AStar.simplifyPath(straight);

      // 直線只保留頭尾（可能含一個方向起點）
      expect(simplified.length).toBeLessThan(straight.length);
      expect(simplified[simplified.length - 1]).toEqual(straight[straight.length - 1]);
    });

    test('應該保留轉彎點', () => {
      const lShape = [
        { x: 16, y: 16 },
        { x: 48, y: 16 },
        { x: 80, y: 16 },
        { x: 80, y: 48 },
        { x: 80, y: 80 }
      ];

      const simplified = AStar.simplifyPath(lShape);

      // 轉彎點 (80,16) 必須保留
      expect(simplified.some(p => p.x === 80 && p.y === 16)).toBe(true);
      expect(simplified[simplified.length - 1]).toEqual(lShape[lShape.length - 1]);
    });
  });
});

describe('AStar 正確性（以 BFS 為參考答案）', () => {
  /** 固定種子的亂數產生器（mulberry32），讓迷宮可重現 */
  const seededRandom = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const makeMaze = (seed, size = 10, density = 0.3) => {
    const random = seededRandom(seed);
    const blockers = [TILE_TYPES.BRICK, TILE_TYPES.STEEL, TILE_TYPES.WATER];
    const open = [TILE_TYPES.EMPTY, TILE_TYPES.ICE, TILE_TYPES.FOREST, TILE_TYPES.BASE];
    return Array(size).fill(null).map(() => Array(size).fill(null).map(() =>
      random() < density
        ? blockers[Math.floor(random() * blockers.length)]
        : open[Math.floor(random() * open.length)]
    ));
  };

  const isOpen = (map, x, y) =>
    y >= 0 && y < map.length && x >= 0 && x < map[0].length &&
    [TILE_TYPES.EMPTY, TILE_TYPES.ICE, TILE_TYPES.FOREST, TILE_TYPES.BASE].includes(map[y][x]);

  /** 參考答案：BFS 最短步數（不可達回傳 null） */
  const bfs = (map, start, goal) => {
    const queue = [[start.x, start.y, 0]];
    const seen = new Set([`${start.x},${start.y}`]);
    while (queue.length > 0) {
      const [x, y, d] = queue.shift();
      if (x === goal.x && y === goal.y) return d;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = `${nx},${ny}`;
        if (!seen.has(key) && isOpen(map, nx, ny)) {
          seen.add(key);
          queue.push([nx, ny, d + 1]);
        }
      }
    }
    return null;
  };

  test('隨機迷宮中的路徑應該連續、可行走且為最短路徑', () => {
    let reachableCases = 0;

    for (let seed = 1; seed <= 150; seed++) {
      const map = makeMaze(seed);
      const random = seededRandom(seed * 7919);
      const pick = () => ({ x: Math.floor(random() * 10), y: Math.floor(random() * 10) });
      const start = pick();
      const goal = pick();
      map[start.y][start.x] = TILE_TYPES.EMPTY;
      map[goal.y][goal.x] = TILE_TYPES.EMPTY;

      const expected = bfs(map, start, goal);
      const path = AStar.findPath(toWorld(start.x, start.y), toWorld(goal.x, goal.y), map, TILE, OFFSET_Y);

      if (expected === null) {
        expect(path).toBeNull();
        continue;
      }

      reachableCases++;
      expect(path).toHaveLength(expected);

      let prev = start;
      path.forEach(step => {
        expect(Math.abs(step.gridX - prev.x) + Math.abs(step.gridY - prev.y)).toBe(1);
        expect(isOpen(map, step.gridX, step.gridY)).toBe(true);
        expect(step).toEqual({ ...toWorld(step.gridX, step.gridY), gridX: step.gridX, gridY: step.gridY });
        prev = { x: step.gridX, y: step.gridY };
      });
      if (expected > 0) {
        expect(prev).toEqual(goal);
      }
    }

    // 確認測資涵蓋足夠多的可達案例
    expect(reachableCases).toBeGreaterThan(80);
  });

  test('開闊地上的最短路徑只轉一次彎（L 形，敵人移動較平順）', () => {
    const map = makeEmptyMap(10);
    const turns = (path, start) => {
      let count = 0;
      let prev = start;
      let lastDir = null;
      path.forEach(step => {
        const dir = `${step.gridX - prev.x},${step.gridY - prev.y}`;
        if (lastDir !== null && dir !== lastDir) count++;
        lastDir = dir;
        prev = { x: step.gridX, y: step.gridY };
      });
      return count;
    };

    [[[0, 0], [5, 4]], [[6, 6], [1, 2]], [[0, 7], [7, 0]], [[8, 1], [2, 6]], [[3, 3], [3, 9]]]
      .forEach(([[sx, sy], [gx, gy]]) => {
        const path = AStar.findPath(toWorld(sx, sy), toWorld(gx, gy), map, TILE, OFFSET_Y);
        const expectedTurns = sx === gx || sy === gy ? 0 : 1;

        expect(path).toHaveLength(Math.abs(gx - sx) + Math.abs(gy - sy));
        expect(turns(path, { x: sx, y: sy })).toBe(expectedTurns);
      });
  });

  test('需要大幅繞路的迷宮仍是最短路徑', () => {
    // 蛇形迷宮：只有一條路
    const map = [
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1],
      [0, 0, 0, 0, 0]
    ];

    const path = AStar.findPath(toWorld(0, 0), toWorld(4, 4), map, TILE, OFFSET_Y);

    expect(path).toHaveLength(16);
    expect(path.map(p => [p.gridX, p.gridY])).toEqual([
      [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [3, 2], [2, 2],
      [1, 2], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4]
    ]);
  });

  test('開放列表中的節點只能被更短的路徑更新（不可被較長的路徑覆蓋）', () => {
    // 以隨機搜尋縮小出的反例：若無條件覆蓋 g 值，會得到 22 步而非最短的 20 步
    const rows = [
      'S...#.........',
      '.....#........',
      '....#.........',
      '.....#........',
      '.......#...#..',
      '..........#..G'
    ];
    const map = rows.map(r => [...r].map(c => (c === '#' ? TILE_TYPES.BRICK : TILE_TYPES.EMPTY)));

    const path = AStar.findPath(toWorld(0, 0), toWorld(13, 5), map, TILE, OFFSET_Y);

    expect(bfs(map, { x: 0, y: 0 }, { x: 13, y: 5 })).toBe(20);
    expect(path).toHaveLength(20);
  });

  test('啟發式應該引導搜尋（不是盲目的廣度優先）', () => {
    const map = makeEmptyMap(26);
    const expand = jest.spyOn(AStar, 'getNeighbors');
    const expanded = (from, to) => {
      expand.mockClear();
      AStar.findPath(toWorld(...from), toWorld(...to), map, TILE, OFFSET_Y);
      return expand.mock.calls.length;
    };

    // 直線：只展開路線上的 20 個節點
    expect(expanded([0, 5], [20, 5])).toBe(20);
    // 斜向（17 × 19）：只在起終點圍出的矩形內搜尋，不會擴散到整張地圖
    expect(expanded([3, 3], [20, 22])).toBeLessThanOrEqual(18 * 20);

    expand.mockRestore();
  });

  test('起點或終點在地圖外時回傳 null', () => {
    const map = makeEmptyMap(5);

    expect(AStar.findPath({ x: -10, y: OFFSET_Y + 10 }, toWorld(1, 1), map, TILE, OFFSET_Y)).toBeNull();
    expect(AStar.findPath(toWorld(1, 1), { x: 10, y: OFFSET_Y + 500 }, map, TILE, OFFSET_Y)).toBeNull();
    expect(AStar.findPath(toWorld(1, 1), toWorld(5, 1), map, TILE, OFFSET_Y)).toBeNull();
  });

  test('起點即終點時回傳空路徑', () => {
    expect(AStar.findPath(toWorld(2, 2), toWorld(2, 2), makeEmptyMap(5), TILE, OFFSET_Y)).toEqual([]);
  });

  test('應該回傳格子中心的世界座標並移除起點', () => {
    const path = AStar.findPath(toWorld(1, 1), toWorld(3, 1), makeEmptyMap(5), TILE, OFFSET_Y);

    expect(path).toEqual([
      { x: 80, y: 48 + OFFSET_Y, gridX: 2, gridY: 1 },
      { x: 112, y: 48 + OFFSET_Y, gridX: 3, gridY: 1 }
    ]);
  });

  test('預設格子 32px、無 Y 偏移', () => {
    const path = AStar.findPath({ x: 16, y: 16 }, { x: 16, y: 80 }, makeEmptyMap(5));

    expect(path).toEqual([
      { x: 16, y: 48, gridX: 0, gridY: 1 },
      { x: 16, y: 80, gridX: 0, gridY: 2 }
    ]);
  });

  test('應該支援其他格子大小', () => {
    const path = AStar.findPath({ x: 5, y: 5 }, { x: 25, y: 5 }, makeEmptyMap(5), 10, 0);

    expect(path.map(p => [p.x, p.y])).toEqual([[15, 5], [25, 5]]);
  });

  test('heuristic 應該是曼哈頓距離', () => {
    expect(AStar.heuristic({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(7);
    expect(AStar.heuristic({ x: 4, y: 6 }, { x: 1, y: 2 })).toBe(7);
    expect(AStar.heuristic({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(0);
  });

  test('getNeighbors 應該依 上 / 下 / 左 / 右 回傳可行走鄰居', () => {
    const map = makeEmptyMap(5);

    expect(AStar.getNeighbors({ x: 1, y: 1 }, map)).toEqual([
      { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 1 }, { x: 2, y: 1 }
    ]);

    map[0][1] = TILE_TYPES.BRICK;
    expect(AStar.getNeighbors({ x: 1, y: 1 }, map)).toEqual([
      { x: 1, y: 2 }, { x: 0, y: 1 }, { x: 2, y: 1 }
    ]);

    expect(AStar.getNeighbors({ x: 0, y: 0 }, makeEmptyMap(5))).toEqual([
      { x: 0, y: 1 }, { x: 1, y: 0 }
    ]);
  });

  test('isValidNode 應該依地圖寬高判斷（支援非正方形）', () => {
    const map = [[0, 0, 0], [0, 0, 0]];

    expect(AStar.isValidNode({ x: 0, y: 0 }, map)).toBe(true);
    expect(AStar.isValidNode({ x: 2, y: 1 }, map)).toBe(true);
    expect(AStar.isValidNode({ x: 3, y: 0 }, map)).toBe(false);
    expect(AStar.isValidNode({ x: 0, y: 2 }, map)).toBe(false);
    expect(AStar.isValidNode({ x: -1, y: 0 }, map)).toBe(false);
    expect(AStar.isValidNode({ x: 0, y: -1 }, map)).toBe(false);
  });

  test.each([
    [TILE_TYPES.EMPTY, true],
    [TILE_TYPES.BRICK, false],
    [TILE_TYPES.STEEL, false],
    [TILE_TYPES.WATER, false],
    [TILE_TYPES.ICE, true],
    [TILE_TYPES.FOREST, true],
    [TILE_TYPES.BASE, true]
  ])('isWalkable 地形 %i：%s', (tile, expected) => {
    expect(AStar.isWalkable({ x: 0, y: 0 }, [[tile]])).toBe(expected);
  });

  test('isWalkable 地圖外不可走', () => {
    expect(AStar.isWalkable({ x: 1, y: 0 }, [[0]])).toBe(false);
  });

  describe('simplifyPath', () => {
    const p = (x, y) => ({ x, y });

    test('空值或兩點以內的路徑原樣回傳', () => {
      const two = [p(0, 0), p(1, 0)];
      const one = [p(0, 0)];
      const empty = [];

      expect(AStar.simplifyPath(null)).toBeNull();
      expect(AStar.simplifyPath(two)).toBe(two);
      expect(AStar.simplifyPath(one)).toBe(one);
      expect(AStar.simplifyPath(empty)).toBe(empty);
    });

    test('直線只保留起點與終點（起點不可重複）', () => {
      const straight = [p(16, 16), p(48, 16), p(80, 16), p(112, 16)];

      expect(AStar.simplifyPath(straight)).toEqual([straight[0], straight[3]]);
    });

    test('應該保留每個轉彎點', () => {
      const lShape = [p(16, 16), p(48, 16), p(80, 16), p(80, 48), p(80, 80)];

      expect(AStar.simplifyPath(lShape)).toEqual([lShape[0], lShape[2], lShape[4]]);
    });

    test('往左 / 往上的轉彎也要辨識', () => {
      const path = [p(112, 112), p(80, 112), p(48, 112), p(48, 80), p(48, 48), p(16, 48)];

      expect(AStar.simplifyPath(path)).toEqual([path[0], path[2], path[4], path[5]]);
    });

    test('180° 迴轉也算轉彎', () => {
      const horizontal = [p(16, 16), p(48, 16), p(80, 16), p(48, 16)];
      const vertical = [p(16, 16), p(16, 48), p(16, 80), p(16, 48)];

      expect(AStar.simplifyPath(horizontal)).toEqual([horizontal[0], horizontal[2], horizontal[3]]);
      expect(AStar.simplifyPath(vertical)).toEqual([vertical[0], vertical[2], vertical[3]]);
    });

    test('轉彎方向只有一軸變號時也要辨識', () => {
      const path = [p(16, 16), p(16, 48), p(16, 80), p(48, 80)];

      expect(AStar.simplifyPath(path)).toEqual([path[0], path[2], path[3]]);
    });
  });
});
