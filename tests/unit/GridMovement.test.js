/**
 * GridMovement 格子移動輔助測試
 * 重點：對齊目標必須是格子中心（k * TILE_SIZE + TILE_SIZE / 2），
 * 與 gridToPixel / 坦克生成位置一致，而非格線交點
 */

import GridMovement from '../../src/utils/GridMovement';
import { GAME_CONFIG, TILE_TYPES } from '../../src/utils/Constants';

const TILE = GAME_CONFIG.TILE_SIZE;       // 32
const OFFSET_Y = GAME_CONFIG.PLAY_OFFSET_Y; // 44

/**
 * 建立全空地的測試地圖
 */
const makeEmptyMap = (size = 26) =>
  Array(size).fill(null).map(() => Array(size).fill(TILE_TYPES.EMPTY));

describe('GridMovement', () => {
  describe('snapXToGrid / snapYToGrid - 對齊到格子中心', () => {
    test('已在格子中心的座標應該保持不變', () => {
      // 格子 1 的中心：1 * 32 + 16 = 48
      expect(GridMovement.snapXToGrid(48)).toBe(48);
      // 格子 24 的中心（Y 含偏移）：24 * 32 + 16 + 44 = 828
      expect(GridMovement.snapYToGrid(828)).toBe(828);
    });

    test('偏移的座標應該吸附到最近的格子中心', () => {
      expect(GridMovement.snapXToGrid(60)).toBe(48);   // 距 48 較近
      expect(GridMovement.snapXToGrid(65)).toBe(80);   // 距 80 較近
      expect(GridMovement.snapYToGrid(70)).toBe(60);   // 格子 0 中心 = 16 + 44 = 60
      expect(GridMovement.snapYToGrid(77)).toBe(92);   // 格子 1 中心 = 48 + 44 = 92
    });

    test('snap 結果應該與 gridToPixel 一致', () => {
      for (let grid = 0; grid < 5; grid++) {
        const pixel = GridMovement.gridToPixel(grid, grid);
        expect(GridMovement.snapXToGrid(pixel.x)).toBe(pixel.x);
        expect(GridMovement.snapYToGrid(pixel.y)).toBe(pixel.y);
      }
    });
  });

  describe('pixelToGrid / gridToPixel - 座標轉換', () => {
    test('gridToPixel 應該回傳格子中心', () => {
      expect(GridMovement.gridToPixel(0, 0)).toEqual({ x: 16, y: 16 + OFFSET_Y });
      expect(GridMovement.gridToPixel(2, 3)).toEqual({
        x: 2 * TILE + 16,
        y: 3 * TILE + 16 + OFFSET_Y
      });
    });

    test('pixelToGrid 與 gridToPixel 應該互為反函數', () => {
      const pixel = GridMovement.gridToPixel(5, 7);
      expect(GridMovement.pixelToGrid(pixel.x, pixel.y)).toEqual({ gridX: 5, gridY: 7 });
    });
  });

  describe('checkAlignment - 對齊檢查', () => {
    test('位於格子中心的坦克應該判定為已對齊', () => {
      const pixel = GridMovement.gridToPixel(3, 3);
      const alignment = GridMovement.checkAlignment({ x: pixel.x, y: pixel.y });

      expect(alignment.alignedX).toBe(true);
      expect(alignment.alignedY).toBe(true);
      expect(alignment.offsetX).toBe(0);
      expect(alignment.offsetY).toBe(0);
    });

    test('偏離中心的坦克應該回報正確偏移量', () => {
      const pixel = GridMovement.gridToPixel(3, 3);
      const alignment = GridMovement.checkAlignment({ x: pixel.x + 6, y: pixel.y - 5 });

      expect(alignment.alignedX).toBe(false);
      expect(alignment.alignedY).toBe(false);
      expect(alignment.offsetX).toBe(6);
      expect(alignment.offsetY).toBe(-5);
      expect(alignment.nearestX).toBe(pixel.x);
      expect(alignment.nearestY).toBe(pixel.y);
    });
  });

  describe('isPositionWalkable - 可行走檢查', () => {
    test('空地、冰地、森林應該可行走', () => {
      const map = makeEmptyMap();
      map[5][5] = TILE_TYPES.ICE;
      map[6][6] = TILE_TYPES.FOREST;

      expect(GridMovement.isPositionWalkable(...Object.values(GridMovement.gridToPixel(5, 5)), map)).toBe(true);
      expect(GridMovement.isPositionWalkable(...Object.values(GridMovement.gridToPixel(6, 6)), map)).toBe(true);
    });

    test('磚牆、鋼牆、水域應該不可行走', () => {
      const map = makeEmptyMap();
      map[5][5] = TILE_TYPES.BRICK;
      map[6][6] = TILE_TYPES.STEEL;
      map[7][7] = TILE_TYPES.WATER;

      [[5, 5], [6, 6], [7, 7]].forEach(([gx, gy]) => {
        const pixel = GridMovement.gridToPixel(gx, gy);
        expect(GridMovement.isPositionWalkable(pixel.x, pixel.y, map)).toBe(false);
      });
    });

    test('超出地圖範圍應該不可行走', () => {
      const map = makeEmptyMap();
      expect(GridMovement.isPositionWalkable(-50, -50, map)).toBe(false);
    });
  });

  describe('calculateCornerSlide - 角落滑動修正', () => {
    test('垂直移動且水平偏移時應該回傳朝中心線的滑動修正', () => {
      const map = makeEmptyMap();
      const center = GridMovement.gridToPixel(5, 5);
      // 坦克向上移動，但偏右 8px
      const tank = { x: center.x + 8, y: center.y };

      const slide = GridMovement.calculateCornerSlide(tank, 'up', map);

      expect(slide).not.toBeNull();
      expect(slide.axis).toBe('x');
      expect(slide.amount).toBeLessThan(0); // 往左修正（朝中心）
      expect(slide.targetValue).toBe(center.x);
    });

    test('滑動目標被牆阻擋時不應該回傳修正', () => {
      const map = makeEmptyMap();
      const center = GridMovement.gridToPixel(5, 5);
      // 中心線位置是牆
      map[5][5] = TILE_TYPES.BRICK;
      const tank = { x: center.x + 8, y: center.y };

      const slide = GridMovement.calculateCornerSlide(tank, 'up', map);

      expect(slide).toBeNull();
    });

    test('已對齊時不需要滑動修正', () => {
      const map = makeEmptyMap();
      const center = GridMovement.gridToPixel(5, 5);
      const tank = { x: center.x, y: center.y };

      expect(GridMovement.calculateCornerSlide(tank, 'up', map)).toBeNull();
      expect(GridMovement.calculateCornerSlide(tank, 'left', map)).toBeNull();
    });
  });

  describe('forceSnapToGrid - 強制對齊', () => {
    test('應該將偏移的坦克吸附回格子中心（而非格線交點）', () => {
      const map = makeEmptyMap();
      const center = GridMovement.gridToPixel(5, 5);
      const tank = { x: center.x + 7, y: center.y - 9 };

      const result = GridMovement.forceSnapToGrid(tank, map);

      expect(result).toBe(true);
      expect(tank.x).toBe(center.x);
      expect(tank.y).toBe(center.y);
      // 對齊後的位置必須是格子中心格式：k * 32 + 16
      expect((tank.x - TILE / 2) % TILE).toBe(0);
      expect((tank.y - OFFSET_Y - TILE / 2) % TILE).toBe(0);
    });

    test('對齊目標不可行走時不應該移動坦克', () => {
      const map = makeEmptyMap();
      map[5][5] = TILE_TYPES.STEEL;
      const center = GridMovement.gridToPixel(5, 5);
      const tank = { x: center.x + 5, y: center.y };

      const result = GridMovement.forceSnapToGrid(tank, map);

      expect(result).toBe(false);
      expect(tank.x).toBe(center.x + 5);
    });
  });

  describe('canMoveInDirection / getAvailableDirections', () => {
    test('前方有牆時應該回報不可通行', () => {
      const map = makeEmptyMap();
      map[4][5] = TILE_TYPES.BRICK; // 上方一格是牆
      const center = GridMovement.gridToPixel(5, 5);
      const tank = { x: center.x, y: center.y };

      expect(GridMovement.canMoveInDirection(tank, 'up', map)).toBe(false);
      expect(GridMovement.canMoveInDirection(tank, 'down', map)).toBe(true);

      const available = GridMovement.getAvailableDirections(tank, map);
      expect(available).not.toContain('up');
      expect(available).toEqual(expect.arrayContaining(['down', 'left', 'right']));
    });
  });
});

describe('GridMovement.tileAt', () => {
  // 3 欄 × 2 列（非正方形，確認欄 / 列沒有對調）
  const map = [
    [TILE_TYPES.EMPTY, TILE_TYPES.BRICK, TILE_TYPES.STEEL],
    [TILE_TYPES.WATER, TILE_TYPES.ICE, TILE_TYPES.FOREST]
  ];

  test('應該回傳 map[gridY][gridX] 的地形', () => {
    expect(GridMovement.tileAt(map, 0, 0)).toBe(TILE_TYPES.EMPTY);
    expect(GridMovement.tileAt(map, 2, 0)).toBe(TILE_TYPES.STEEL);
    expect(GridMovement.tileAt(map, 0, 1)).toBe(TILE_TYPES.WATER);
    expect(GridMovement.tileAt(map, 2, 1)).toBe(TILE_TYPES.FOREST);
  });

  test.each([
    ['上方', 1, -1],
    ['下方', 1, 2],
    ['左方', -1, 0],
    ['右方', 3, 1]
  ])('超出地圖%s時回傳 undefined（不拋錯）', (_, x, y) => {
    expect(GridMovement.tileAt(map, x, y)).toBeUndefined();
  });
});

describe('GridMovement 邊界與分支', () => {
  const center = (gx, gy) => GridMovement.gridToPixel(gx, gy);
  const makeMap = (fill = TILE_TYPES.EMPTY) =>
    Array(26).fill(null).map(() => Array(26).fill(fill));

  test('snapToGrid（舊 API）應該等同 snapXToGrid', () => {
    expect(GridMovement.snapToGrid(60)).toBe(GridMovement.snapXToGrid(60));
    expect(GridMovement.snapToGrid(65)).toBe(80);
  });

  test('checkAlignment 剛好等於門檻時視為已對齊', () => {
    const c = center(5, 5);
    const result = GridMovement.checkAlignment({ x: c.x + 4, y: c.y - 4 });

    expect(result.alignedX).toBe(true);
    expect(result.alignedY).toBe(true);
    expect(GridMovement.checkAlignment({ x: c.x + 5, y: c.y - 5 }).alignedX).toBe(false);
    expect(GridMovement.checkAlignment({ x: c.x + 5, y: c.y - 5 }).alignedY).toBe(false);
  });

  describe('isPositionWalkable', () => {
    test('沒有地圖時視為可走', () => {
      expect(GridMovement.isPositionWalkable(100, 100, null)).toBe(true);
    });

    test.each([
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ])('只有 (%i, %i) 角落伸進斜對角的牆時也不可走', (dx, dy) => {
      const map = makeMap();
      map[5 + dy][5 + dx] = TILE_TYPES.BRICK;
      const c = center(5, 5);

      // 偏移 3px：該角落（±14）跨進斜對角格，其他角落仍在原本或相鄰格
      expect(GridMovement.isPositionWalkable(c.x + dx * 3, c.y + dy * 3, map)).toBe(false);
      expect(GridMovement.isPositionWalkable(c.x - dx * 3, c.y - dy * 3, map)).toBe(true);
    });

    test.each([
      [TILE_TYPES.BRICK, false],
      [TILE_TYPES.STEEL, false],
      [TILE_TYPES.WATER, false],
      [TILE_TYPES.ICE, true],
      [TILE_TYPES.FOREST, true],
      [TILE_TYPES.BASE, true]
    ])('地形 %i 是否可走：%s', (tile, expected) => {
      const map = makeMap();
      map[5][5] = tile;
      const c = center(5, 5);

      expect(GridMovement.isPositionWalkable(c.x, c.y, map)).toBe(expected);
    });

    test('四個邊緣的格子都在地圖內', () => {
      const map = makeMap();

      expect(GridMovement.isPositionWalkable(center(0, 5).x, center(0, 5).y, map)).toBe(true);
      expect(GridMovement.isPositionWalkable(center(5, 0).x, center(5, 0).y, map)).toBe(true);
      expect(GridMovement.isPositionWalkable(center(25, 5).x, center(25, 5).y, map)).toBe(true);
      expect(GridMovement.isPositionWalkable(center(5, 25).x, center(5, 25).y, map)).toBe(true);
    });

    test('任一角落超出地圖時不可走', () => {
      const map = makeMap();

      expect(GridMovement.isPositionWalkable(center(0, 5).x - 3, center(0, 5).y, map)).toBe(false);
      expect(GridMovement.isPositionWalkable(center(5, 0).x, center(5, 0).y - 3, map)).toBe(false);
      expect(GridMovement.isPositionWalkable(center(25, 5).x + 3, center(25, 5).y, map)).toBe(false);
      expect(GridMovement.isPositionWalkable(center(5, 25).x, center(5, 25).y + 3, map)).toBe(false);
    });
  });

  describe('calculateCornerSlide', () => {
    test('沒有地圖時不滑動（即使偏離中心）', () => {
      const c = center(5, 5);

      expect(GridMovement.calculateCornerSlide({ x: c.x + 5, y: c.y }, 'up', null)).toBeNull();
    });

    test.each(['up', 'down'])('往 %s 移動時把 X 偏移往中心修正（每幀最多 3px）', (direction) => {
      const map = makeMap();
      const c = center(5, 5);

      expect(GridMovement.calculateCornerSlide({ x: c.x + 5, y: c.y }, direction, map))
        .toEqual({ axis: 'x', amount: -3, targetValue: c.x });
      expect(GridMovement.calculateCornerSlide({ x: c.x - 5, y: c.y }, direction, map))
        .toEqual({ axis: 'x', amount: 3, targetValue: c.x });
      expect(GridMovement.calculateCornerSlide({ x: c.x + 2.5, y: c.y }, direction, map))
        .toEqual({ axis: 'x', amount: -2.5, targetValue: c.x });
    });

    test.each(['left', 'right'])('往 %s 移動時把 Y 偏移往中心修正', (direction) => {
      const map = makeMap();
      const c = center(5, 5);

      expect(GridMovement.calculateCornerSlide({ x: c.x, y: c.y + 5 }, direction, map))
        .toEqual({ axis: 'y', amount: -3, targetValue: c.y });
      expect(GridMovement.calculateCornerSlide({ x: c.x, y: c.y - 5 }, direction, map))
        .toEqual({ axis: 'y', amount: 3, targetValue: c.y });
    });

    test('偏移在 2px 死區內（含）不修正', () => {
      const map = makeMap();
      const c = center(5, 5);

      expect(GridMovement.calculateCornerSlide({ x: c.x + 2, y: c.y }, 'up', map)).toBeNull();
      expect(GridMovement.calculateCornerSlide({ x: c.x, y: c.y - 2 }, 'left', map)).toBeNull();
    });

    test('只修正移動方向的垂直軸', () => {
      const map = makeMap();
      const c = center(5, 5);

      expect(GridMovement.calculateCornerSlide({ x: c.x, y: c.y + 5 }, 'up', map)).toBeNull();
      expect(GridMovement.calculateCornerSlide({ x: c.x + 5, y: c.y }, 'right', map)).toBeNull();
      expect(GridMovement.calculateCornerSlide({ x: c.x + 5, y: c.y + 5 }, undefined, map)).toBeNull();
    });

    test('修正後的位置不可走時不滑動', () => {
      const map = makeMap();
      const c = center(5, 5);
      map[5][5] = TILE_TYPES.STEEL;

      expect(GridMovement.calculateCornerSlide({ x: c.x + 5, y: c.y }, 'up', map)).toBeNull();
      expect(GridMovement.calculateCornerSlide({ x: c.x, y: c.y + 5 }, 'left', map)).toBeNull();
    });
  });

  describe('resolveGridDirection 防呆', () => {
    test('沒有輸入時即使未對齊也回傳 null', () => {
      expect(GridMovement.resolveGridDirection('up', null, 99, true, 8)).toBeNull();
      expect(GridMovement.resolveGridDirection('left', undefined, 99, true, 8)).toBeNull();
    });

    test('沒有目前方向時即使未對齊也直接採用輸入', () => {
      expect(GridMovement.resolveGridDirection(undefined, 'up', 99, true, 8)).toBe('up');
    });

    test('預設容差為 8px', () => {
      expect(GridMovement.resolveGridDirection('up', 'left', 8, true)).toBe('left');
      expect(GridMovement.resolveGridDirection('up', 'left', 9, true)).toBe('up');
      expect(GridMovement.resolveGridDirection('up', 'left', -8, true)).toBe('left');
    });
  });

  test('lockToLane 預設每幀收斂 3px', () => {
    const c = center(5, 5);

    expect(GridMovement.lockToLane({ x: c.x + 10, y: c.y }, 'down')).toEqual({ axis: 'x', amount: -3 });
    expect(GridMovement.lockToLane({ x: c.x, y: c.y - 2 }, 'right')).toEqual({ axis: 'y', amount: 2 });
  });

  test('canMoveInDirection 沒有地圖時視為可通行', () => {
    expect(GridMovement.canMoveInDirection(center(5, 5), 'up', null)).toBe(true);
    expect(GridMovement.getAvailableDirections(center(5, 5), null)).toEqual(['up', 'down', 'left', 'right']);
  });

  describe('forceSnapToGrid', () => {
    test('偏移達半格（16px）時不強制對齊', () => {
      const c = center(5, 5);
      const tank = { x: c.x + 16, y: c.y };

      expect(GridMovement.forceSnapToGrid(tank, makeMap())).toBe(false);
      expect(tank.x).toBe(c.x + 16);
    });

    test('只有一個軸偏移過大也不對齊', () => {
      const c = center(5, 5);

      expect(GridMovement.forceSnapToGrid({ x: c.x, y: c.y + 16 }, makeMap())).toBe(false);
      expect(GridMovement.forceSnapToGrid({ x: c.x + 15, y: c.y + 15 }, makeMap())).toBe(true);
    });
  });

  describe('findNearestWalkablePosition - 螺旋搜尋', () => {
    test('沒有地圖時回傳 null', () => {
      expect(GridMovement.findNearestWalkablePosition(center(5, 5), null)).toBeNull();
    });

    test('目前格子可走時回傳目前格子中心', () => {
      const c = center(5, 5);

      expect(GridMovement.findNearestWalkablePosition({ x: c.x + 3, y: c.y - 3 }, makeMap())).toEqual(c);
    });

    test('應該由近而遠、由上而下、由左而右搜尋', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      map[6][6] = TILE_TYPES.EMPTY;
      map[4][4] = TILE_TYPES.EMPTY;
      map[4][6] = TILE_TYPES.EMPTY;

      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toEqual(center(4, 4));

      map[4][4] = TILE_TYPES.BRICK;
      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toEqual(center(6, 4));

      map[4][6] = TILE_TYPES.BRICK;
      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toEqual(center(6, 6));
    });

    test('同一圈中下方與右方也會被搜尋到', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      map[5][6] = TILE_TYPES.EMPTY;
      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toEqual(center(6, 5));

      map[5][6] = TILE_TYPES.BRICK;
      map[6][5] = TILE_TYPES.EMPTY;
      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toEqual(center(5, 6));
    });

    test('近的圈優先於遠的圈', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      map[3][3] = TILE_TYPES.EMPTY;
      map[6][6] = TILE_TYPES.EMPTY;

      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toEqual(center(6, 6));
    });

    test('最遠搜尋 3 圈', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      map[5][8] = TILE_TYPES.EMPTY;
      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toEqual(center(8, 5));

      map[5][8] = TILE_TYPES.BRICK;
      map[5][9] = TILE_TYPES.EMPTY;
      expect(GridMovement.findNearestWalkablePosition(center(5, 5), map)).toBeNull();
    });

    test('圈內部的格子不重複檢查', () => {
      const map = makeMap(TILE_TYPES.BRICK);
      const walkable = jest.spyOn(GridMovement, 'isPositionWalkable');

      GridMovement.findNearestWalkablePosition(center(10, 10), map);

      // 1 + 8 + 16 + 24
      expect(walkable).toHaveBeenCalledTimes(49);
      walkable.mockRestore();
    });
  });
});
