/**
 * Helpers 輔助函數單元測試（真實實作）
 */

import {
  distance,
  angleBetween,
  degreesToRadians,
  radiansToDegrees,
  clamp,
  lerp,
  randomInt,
  randomFloat,
  randomChoice,
  formatScore,
  formatTime,
  gridToWorld,
  worldToGrid,
  pointInRect
} from '../../src/utils/Helpers';

describe('Helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('distance 應該計算歐氏距離', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
    expect(distance(1, 2, -2, -2)).toBe(5);
    expect(distance(5, 5, 5, 5)).toBe(0);
  });

  test('angleBetween 應該回傳由起點指向終點的弧度', () => {
    expect(angleBetween(0, 0, 1, 0)).toBe(0);
    expect(angleBetween(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);
    expect(angleBetween(2, 2, 1, 2)).toBeCloseTo(Math.PI);
    expect(angleBetween(1, 1, 1, 0)).toBeCloseTo(-Math.PI / 2);
  });

  test('角度與弧度互轉', () => {
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
    expect(radiansToDegrees(Math.PI / 4)).toBeCloseTo(45);
  });

  test('clamp 應該限制在範圍內', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  test('lerp 應該線性插值', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  test('randomInt 應該包含上下界', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomInt(3, 7)).toBe(3);

    Math.random.mockReturnValue(0.9999);
    expect(randomInt(3, 7)).toBe(7);

    Math.random.mockReturnValue(0.5);
    expect(randomInt(3, 7)).toBe(5);
  });

  test('randomFloat 應該落在 [min, max)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomFloat(2, 6)).toBe(2);

    Math.random.mockReturnValue(0.5);
    expect(randomFloat(2, 6)).toBe(4);
  });

  test('randomChoice 應該依亂數挑選元素', () => {
    const items = ['a', 'b', 'c', 'd'];
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomChoice(items)).toBe('a');

    Math.random.mockReturnValue(0.6);
    expect(randomChoice(items)).toBe('c');

    Math.random.mockReturnValue(0.99);
    expect(randomChoice(items)).toBe('d');
  });

  test('formatScore 應該加入千位分隔符', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1000)).toBe('1,000');
    expect(formatScore(1234567)).toBe('1,234,567');
  });

  test('formatTime 應該格式化為 MM:SS', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(65.9)).toBe('01:05');
    expect(formatTime(600)).toBe('10:00');
  });

  test('gridToWorld 應該回傳格子中心（預設 32px）', () => {
    expect(gridToWorld(0, 0)).toEqual({ x: 16, y: 16 });
    expect(gridToWorld(2, 3)).toEqual({ x: 80, y: 112 });
    expect(gridToWorld(2, 3, 10)).toEqual({ x: 25, y: 35 });
  });

  test('worldToGrid 應該向下取整（預設 32px）', () => {
    expect(worldToGrid(0, 0)).toEqual({ gridX: 0, gridY: 0 });
    expect(worldToGrid(63, 64)).toEqual({ gridX: 1, gridY: 2 });
    expect(worldToGrid(25, 35, 10)).toEqual({ gridX: 2, gridY: 3 });
  });

  test('pointInRect 應該包含邊界', () => {
    expect(pointInRect(5, 5, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(0, 0, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(10, 10, 0, 0, 10, 10)).toBe(true);
    expect(pointInRect(-1, 5, 0, 0, 10, 10)).toBe(false);
    expect(pointInRect(11, 5, 0, 0, 10, 10)).toBe(false);
    expect(pointInRect(5, -1, 0, 0, 10, 10)).toBe(false);
    expect(pointInRect(5, 11, 0, 0, 10, 10)).toBe(false);
  });
});
