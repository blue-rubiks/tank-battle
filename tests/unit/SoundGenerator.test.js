/**
 * SoundGenerator 音效生成器單元測試（真實實作）
 * 以固定亂數與小取樣率產生波形，鎖定目前 8-bit 音效的輸出（特性測試）。
 * 若刻意調整音色，請重新產生下方的黃金值。
 */

import SoundGenerator from '../../src/utils/SoundGenerator';

const SAMPLE_RATE = 1000;

const makeScene = () => {
  const cache = new Map();
  const context = {
    sampleRate: SAMPLE_RATE,
    createBuffer: jest.fn((channels, size, rate) => {
      const data = new Float32Array(Math.floor(size));
      return {
        channels,
        size,
        rate,
        data,
        getChannelData: jest.fn(() => data)
      };
    }),
    createBufferSource: jest.fn(() => ({ buffer: null }))
  };

  return {
    sound: { context },
    cache: {
      audio: {
        exists: jest.fn(key => cache.has(key)),
        add: jest.fn((key, buffer) => cache.set(key, buffer))
      }
    }
  };
};

const summarize = (buffer) => {
  let sum = 0;
  let abs = 0;
  buffer.data.forEach(v => {
    sum += v;
    abs += Math.abs(v);
  });
  return { sum, abs };
};

// 以 Math.random = 0.75（噪音 = 0.5）、取樣率 1000Hz 產生的黃金值
const GOLDEN = {
  Shoot: { size: 150, sum: 1.9682691, abs: 9.8713777, s1: -0.1617328, s7: 0.2216863 },
  Explosion: { size: 400, sum: 18.53861, abs: 30.870346, s1: 0.0145123, s7: 0.02809309 },
  Hit: { size: 100, sum: 2.9381749, abs: 3.134076, s1: 0.1644966, s7: 0.1418379 },
  PowerUp: { size: 300, sum: -1.0283333, abs: 37.375, s1: -0.2491667, s7: -0.2441667 },
  Move: { size: 500, sum: 1.265625, abs: 12.567579, s1: 0.0216804, s7: -0.01266163 },
  GameStart: { size: 500, sum: -1.3111999, abs: 74.85, s1: 0.1998, s7: -0.1986 },
  EnemyDestroy: { size: 350, sum: 2.1877882, abs: 34.279566, s1: -0.1810923, s7: 0.2298141 }
};

describe('SoundGenerator - 音效生成器', () => {
  let scene;

  beforeEach(() => {
    scene = makeScene();
    jest.spyOn(Math, 'random').mockReturnValue(0.75);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe.each(Object.entries(GOLDEN))('generate%sSound', (name, golden) => {
    let buffer;

    beforeEach(() => {
      buffer = SoundGenerator[`generate${name}Sound`](scene);
    });

    test('應該建立單聲道、指定時長的緩衝區', () => {
      expect(scene.sound.context.createBuffer).toHaveBeenCalledWith(1, golden.size, SAMPLE_RATE);
      expect(buffer.getChannelData).toHaveBeenCalledWith(0);
    });

    test('波形應該與黃金值一致', () => {
      const { sum, abs } = summarize(buffer);

      expect(sum).toBeCloseTo(golden.sum, 4);
      expect(abs).toBeCloseTo(golden.abs, 4);
      expect(buffer.data[1]).toBeCloseTo(golden.s1, 6);
      expect(buffer.data[7]).toBeCloseTo(golden.s7, 6);
    });

    test('音量應該在安全範圍內（不爆音）', () => {
      buffer.data.forEach(v => {
        expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
      });
    });
  });

  describe('音色特性', () => {
    test('移動音效以 250ms 為週期重複（0.5 秒剛好兩個週期），循環播放時接縫不爆音', () => {
      const buffer = SoundGenerator.generateMoveSound(scene);

      // 取樣率 1000Hz：80Hz 每 12.5 個取樣一週期、4Hz 脈動每 250 個取樣一週期
      for (let i = 0; i < 250; i++) {
        expect(buffer.data[i + 250]).toBeCloseTo(buffer.data[i], 6);
      }
    });

    test('射擊音效在第一個取樣只有噪音（方波為 0）', () => {
      const buffer = SoundGenerator.generateShootSound(scene);

      // noise = (0.75 * 2 - 1) * 0.3 = 0.15，envelope = 1，× 0.3
      expect(buffer.data[0]).toBeCloseTo(0.045, 6);
    });

    test('爆炸音效應該從 0 起音（attack）', () => {
      const buffer = SoundGenerator.generateExplosionSound(scene);

      expect(buffer.data[0]).toBe(0);
    });

    test('擊中音效應該快速衰減', () => {
      const buffer = SoundGenerator.generateHitSound(scene);

      expect(Math.abs(buffer.data[90])).toBeLessThan(Math.abs(buffer.data[1]));
    });

    test.each([
      [0, 523],
      [99, 523],
      [100, 659],
      [199, 659],
      [200, 784],
      [299, 784]
    ])('道具音效第 %i 個取樣使用 %iHz（C5 → E5 → G5）', (index, freq) => {
      const buffer = SoundGenerator.generatePowerUpSound(scene);
      const t = index / SAMPLE_RATE;
      const expected = Math.sign(Math.sin(2 * Math.PI * freq * t)) * (1 - t / 0.3) * 0.25;

      expect(buffer.data[index]).toBeCloseTo(expected, 6);
    });

    test.each([
      [124, 262],
      [125, 330],
      [249, 330],
      [250, 392],
      [374, 392],
      [375, 523]
    ])('開場音效第 %i 個取樣使用 %iHz（C4 → E4 → G4 → C5）', (index, freq) => {
      const buffer = SoundGenerator.generateGameStartSound(scene);
      const t = index / SAMPLE_RATE;
      const expected = Math.sign(Math.sin(2 * Math.PI * freq * t)) * (1 - (t / 0.5) * 0.5) * 0.2;

      expect(buffer.data[index]).toBeCloseTo(expected, 6);
    });
  });

  describe('快取', () => {
    test('addBufferToCache 應該在快取不存在時加入', () => {
      const buffer = { id: 'b' };

      SoundGenerator.addBufferToCache(scene, 'shoot', buffer);

      expect(scene.sound.context.createBufferSource).toHaveBeenCalledTimes(1);
      expect(scene.cache.audio.exists).toHaveBeenCalledWith('shoot');
      expect(scene.cache.audio.add).toHaveBeenCalledWith('shoot', buffer);
    });

    test('addBufferToCache 應該把緩衝區掛到音源上', () => {
      const source = { buffer: null };
      scene.sound.context.createBufferSource.mockReturnValue(source);
      const buffer = { id: 'b' };

      SoundGenerator.addBufferToCache(scene, 'shoot', buffer);

      expect(source.buffer).toBe(buffer);
    });

    test('addBufferToCache 不應該覆蓋既有快取', () => {
      SoundGenerator.addBufferToCache(scene, 'shoot', { id: 'first' });
      SoundGenerator.addBufferToCache(scene, 'shoot', { id: 'second' });

      expect(scene.cache.audio.add).toHaveBeenCalledTimes(1);
      expect(scene.cache.audio.add).toHaveBeenCalledWith('shoot', { id: 'first' });
    });

    test('generateAllSounds 應該產生並快取所有 7 種音效', () => {
      const sounds = SoundGenerator.generateAllSounds(scene);
      const keys = ['shoot', 'explosion', 'hit', 'powerup', 'move', 'gamestart', 'enemydestroy'];

      expect(Object.keys(sounds)).toEqual(keys);
      keys.forEach(key => {
        expect(scene.cache.audio.add).toHaveBeenCalledWith(key, sounds[key]);
      });
      expect(sounds.shoot.size).toBe(GOLDEN.Shoot.size);
      expect(sounds.explosion.size).toBe(GOLDEN.Explosion.size);
      expect(sounds.hit.size).toBe(GOLDEN.Hit.size);
      expect(sounds.powerup.size).toBe(GOLDEN.PowerUp.size);
      expect(sounds.move.size).toBe(GOLDEN.Move.size);
      expect(sounds.gamestart.size).toBe(GOLDEN.GameStart.size);
      expect(sounds.enemydestroy.size).toBe(GOLDEN.EnemyDestroy.size);
    });
  });
});
