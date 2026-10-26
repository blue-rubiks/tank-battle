/**
 * UITheme 繪圖與格式化函數單元測試（真實實作）
 * 色票 / 字型等設計 token 屬於資料，不在此逐一鎖定
 */

import {
  PALETTE,
  drawGoldCorners,
  drawModalFrame,
  drawPixelHeart,
  drawPixelTank,
  formatScore,
  formatStage,
  formatElapsedTime,
  formatPlayTime
} from '../../src/utils/UITheme';

/** 記錄所有繪圖呼叫的 graphics 替身 */
const makeGraphics = () => {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    lineStyle: record('lineStyle'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    strokePath: record('strokePath'),
    fillStyle: record('fillStyle'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect')
  };
};

const rects = (g) => g.calls.filter(c => c[0] === 'fillRect').map(c => c.slice(1));

describe('UITheme', () => {
  describe('格式化', () => {
    test('formatScore 應該加上千位逗號並把空值視為 0', () => {
      expect(formatScore(1234567)).toBe('1,234,567');
      expect(formatScore(0)).toBe('0');
      expect(formatScore(undefined)).toBe('0');
      expect(formatScore(null)).toBe('0');
    });

    test('formatStage 應該補零到兩位數', () => {
      expect(formatStage(1)).toBe('01');
      expect(formatStage(12)).toBe('12');
      expect(formatStage(123)).toBe('123');
    });

    test('formatElapsedTime 應該把毫秒轉為 mm:ss', () => {
      expect(formatElapsedTime(0)).toBe('00:00');
      expect(formatElapsedTime(999)).toBe('00:00');
      expect(formatElapsedTime(61000)).toBe('01:01');
      expect(formatElapsedTime(600000)).toBe('10:00');
    });

    test('formatPlayTime 應該把秒數轉為 h:mm:ss', () => {
      expect(formatPlayTime(0)).toBe('0:00:00');
      expect(formatPlayTime(59.9)).toBe('0:00:59');
      expect(formatPlayTime(61)).toBe('0:01:01');
      expect(formatPlayTime(3599)).toBe('0:59:59');
      expect(formatPlayTime(3600)).toBe('1:00:00');
      expect(formatPlayTime(36000 + 3 * 60 + 7)).toBe('10:03:07');
    });

    test('formatPlayTime 缺少數值時視為 0', () => {
      expect(formatPlayTime(undefined)).toBe('0:00:00');
    });

    test('formatElapsedTime 負數應該視為 0', () => {
      expect(formatElapsedTime(-5000)).toBe('00:00');
    });
  });

  describe('drawGoldCorners', () => {
    test('應該畫出左上與右下兩組括號', () => {
      const g = makeGraphics();

      drawGoldCorners(g, 10, 20, 100, 50, 14, 3, 0x123456);

      expect(g.calls).toEqual([
        ['lineStyle', 3, 0x123456],
        ['beginPath'],
        ['moveTo', 10, 34],
        ['lineTo', 10, 20],
        ['lineTo', 24, 20],
        ['strokePath'],
        ['beginPath'],
        ['moveTo', 96, 70],
        ['lineTo', 110, 70],
        ['lineTo', 110, 56],
        ['strokePath']
      ]);
    });

    test('預設尺寸 14、粗細 3、亮金色', () => {
      const g = makeGraphics();

      drawGoldCorners(g, 0, 0, 100, 100);

      expect(g.calls[0]).toEqual(['lineStyle', 3, PALETTE.GOLD_2]);
      expect(g.calls[2]).toEqual(['moveTo', 0, 14]);
      expect(g.calls[4]).toEqual(['lineTo', 14, 0]);
    });
  });

  describe('drawModalFrame', () => {
    test('預設應該畫出面板底色、深金外框與亮金內框', () => {
      const g = makeGraphics();

      drawModalFrame(g, 10, 20, 100, 50);

      expect(g.calls).toEqual([
        ['fillStyle', PALETTE.PANEL, 1],
        ['fillRect', 10, 20, 100, 50],
        ['lineStyle', 4, PALETTE.GOLD_DEEP],
        ['strokeRect', 6, 16, 108, 58],
        ['lineStyle', 3, PALETTE.GOLD],
        ['strokeRect', 10, 20, 100, 50]
      ]);
    });

    test('應該套用自訂選項', () => {
      const g = makeGraphics();

      drawModalFrame(g, 0, 0, 10, 10, {
        fillColor: 1,
        fillAlpha: 0.5,
        borderColor: 2,
        borderDeep: 3,
        borderThickness: 5
      });

      expect(g.calls[0]).toEqual(['fillStyle', 1, 0.5]);
      expect(g.calls[2]).toEqual(['lineStyle', 4, 3]);
      expect(g.calls[4]).toEqual(['lineStyle', 5, 2]);
    });
  });

  describe('像素圖示', () => {
    test('實心愛心應該有 27 個像素並以中心定位', () => {
      const g = makeGraphics();

      drawPixelHeart(g, 100, 100, 2);
      const pixels = rects(g);

      expect(pixels).toHaveLength(27);
      // 7×6 圖案、每格 2px → 左上角 (93, 94)
      expect(pixels[0]).toEqual([95, 94, 2, 2]);
      expect(pixels[pixels.length - 1]).toEqual([99, 104, 2, 2]);
    });

    test('空心愛心只畫輪廓', () => {
      const g = makeGraphics();

      drawPixelHeart(g, 0, 0, 1, false);

      expect(rects(g)).toHaveLength(14);
    });

    test('愛心預設縮放為 2 且實心', () => {
      const g = makeGraphics();

      drawPixelHeart(g, 0, 0);

      expect(rects(g)).toHaveLength(27);
      expect(rects(g)[0]).toEqual([-5, -6, 2, 2]);
    });

    test('小坦克應該有 32 個像素並以中心定位', () => {
      const g = makeGraphics();

      drawPixelTank(g, 50, 60, 3);
      const pixels = rects(g);

      expect(pixels).toHaveLength(32);
      // 7×6、每格 3px → 左上角 (39.5, 51)
      expect(pixels[0]).toEqual([42.5, 51, 3, 3]);
      expect(pixels[pixels.length - 1]).toEqual([57.5, 66, 3, 3]);
    });

    test('小坦克預設縮放為 2', () => {
      const g = makeGraphics();

      drawPixelTank(g, 0, 0);

      expect(rects(g)[0]).toEqual([-5, -6, 2, 2]);
    });
  });
});
