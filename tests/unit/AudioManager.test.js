/**
 * AudioManager 音效管理器單元測試（真實實作）
 */

import AudioManager from '../../src/managers/AudioManager';
import { DEFAULT_SETTINGS } from '../../src/utils/Constants';

const makeMusic = () => ({
  play: jest.fn(),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  destroy: jest.fn(),
  setVolume: jest.fn()
});

const makeScene = (cachedKeys = ['shoot', 'bgm', 'move', 'gamestart']) => {
  const music = makeMusic();
  return {
    music,
    cache: { audio: { exists: jest.fn(key => cachedKeys.includes(key)) } },
    sound: {
      mute: false,
      play: jest.fn(),
      add: jest.fn(() => music)
    }
  };
};

/** 最後一次 sound.play 的音量 */
const playedVolume = scene => scene.sound.play.mock.calls[scene.sound.play.mock.calls.length - 1][1].volume;

describe('AudioManager', () => {
  let scene;
  let audio;

  beforeEach(() => {
    scene = makeScene();
    audio = new AudioManager(scene);
  });

  describe('初始設定', () => {
    test('未傳入設定時使用預設音量', () => {
      expect(audio.scene).toBe(scene);
      expect(audio.sfxVolume).toBe(DEFAULT_SETTINGS.sfxVolume);
      expect(audio.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
      expect(audio.isMuted).toBe(false);
      expect(audio.currentMusic).toBeNull();
      expect(audio.loops).toEqual({});
      expect(audio.sounds).toEqual({});
    });

    test('應該套用存檔設定的音量，缺少的欄位用預設值', () => {
      const custom = new AudioManager(scene, { sfxVolume: 0.3, musicVolume: 0 });
      expect(custom.sfxVolume).toBe(0.3);
      expect(custom.musicVolume).toBe(0);

      const partial = new AudioManager(scene, { sfxVolume: 0.9 });
      expect(partial.sfxVolume).toBe(0.9);
      expect(partial.musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    });
  });

  describe('playSFX', () => {
    test('應該以「相對音量 × 音效音量」播放已載入的音效（預設相對音量 0.7）', () => {
      audio.setSFXVolume(0.5);
      audio.playSFX('shoot');

      expect(scene.cache.audio.exists).toHaveBeenCalledWith('shoot');
      expect(scene.sound.play).toHaveBeenCalledWith('shoot', { volume: expect.any(Number) });
      expect(playedVolume(scene)).toBeCloseTo(0.35, 6);
    });

    test('應該支援自訂相對音量', () => {
      audio.setSFXVolume(1);
      audio.playSFX('shoot', 0.9);

      expect(playedVolume(scene)).toBeCloseTo(0.9, 6);
    });

    test('音效音量調整後立即生效', () => {
      audio.setSFXVolume(0.2);
      audio.playSFX('shoot', 1);

      expect(playedVolume(scene)).toBeCloseTo(0.2, 6);
    });

    test('音效音量為 0 時不播放', () => {
      audio.setSFXVolume(0);
      audio.playSFX('shoot');

      expect(scene.sound.play).not.toHaveBeenCalled();
    });

    test('未載入的音效應該略過', () => {
      audio.playSFX('missing');

      expect(scene.sound.play).not.toHaveBeenCalled();
    });

    test('靜音時不播放', () => {
      audio.isMuted = true;
      audio.playSFX('shoot');

      expect(scene.sound.play).not.toHaveBeenCalled();
    });
  });

  describe('playJingle', () => {
    test('應該依音樂音量播放（不受音效音量影響）', () => {
      audio.setSFXVolume(0);
      audio.setMusicVolume(0.4);
      audio.playJingle('gamestart');

      expect(scene.sound.play).toHaveBeenCalledWith('gamestart', { volume: expect.any(Number) });
      expect(playedVolume(scene)).toBeCloseTo(0.4, 6);
    });

    test('應該支援自訂相對音量', () => {
      audio.setMusicVolume(0.8);
      audio.playJingle('gamestart', 0.5);

      expect(playedVolume(scene)).toBeCloseTo(0.4, 6);
    });

    test('音樂音量為 0、靜音或未載入時不播放', () => {
      audio.setMusicVolume(0);
      audio.playJingle('gamestart');

      audio.setMusicVolume(1);
      audio.isMuted = true;
      audio.playJingle('gamestart');

      audio.isMuted = false;
      audio.playJingle('missing');

      expect(scene.sound.play).not.toHaveBeenCalled();
    });
  });

  describe('setLoop（循環音效）', () => {
    test('開始時以「相對音量 × 音效音量」循環播放', () => {
      audio.setSFXVolume(0.5);
      audio.setLoop('move', true, 0.8);

      expect(scene.sound.add).toHaveBeenCalledWith('move', { loop: true, volume: expect.any(Number) });
      expect(scene.sound.add.mock.calls[0][1].volume).toBeCloseTo(0.4, 6);
      expect(scene.music.play).toHaveBeenCalledTimes(1);
      expect(audio.loops.move).toBe(scene.music);
    });

    test('預設相對音量為 1', () => {
      audio.setSFXVolume(0.6);
      audio.setLoop('move', true);

      expect(scene.sound.add.mock.calls[0][1].volume).toBeCloseTo(0.6, 6);
    });

    test('已在播放時重複開始不會疊加', () => {
      audio.setLoop('move', true);
      audio.setLoop('move', true);

      expect(scene.sound.add).toHaveBeenCalledTimes(1);
      expect(scene.music.play).toHaveBeenCalledTimes(1);
    });

    test('停止時應該停止並釋放音效，之後可以重新開始', () => {
      audio.setLoop('move', true);
      audio.setLoop('move', false);

      expect(scene.music.stop).toHaveBeenCalled();
      expect(scene.music.destroy).toHaveBeenCalled();
      expect(audio.loops).toEqual({});

      audio.setLoop('move', true);
      expect(scene.sound.add).toHaveBeenCalledTimes(2);
    });

    test('沒有播放時停止不應該拋錯', () => {
      expect(() => audio.setLoop('move', false)).not.toThrow();
      expect(scene.music.stop).not.toHaveBeenCalled();
    });

    test('靜音、音效音量為 0 或未載入時不開始', () => {
      audio.isMuted = true;
      audio.setLoop('move', true);

      audio.isMuted = false;
      audio.setSFXVolume(0);
      audio.setLoop('move', true);

      audio.setSFXVolume(1);
      audio.setLoop('missing', true);

      expect(scene.sound.add).not.toHaveBeenCalled();
      expect(audio.loops).toEqual({});
    });
  });

  describe('playMusic', () => {
    test('應該以音樂音量循環播放', () => {
      audio.playMusic('bgm');

      expect(scene.sound.add).toHaveBeenCalledWith('bgm', { volume: DEFAULT_SETTINGS.musicVolume, loop: true });
      expect(scene.music.play).toHaveBeenCalled();
      expect(audio.currentMusic).toBe(scene.music);
    });

    test('應該支援不循環', () => {
      audio.playMusic('bgm', false);

      expect(scene.sound.add).toHaveBeenCalledWith('bgm', { volume: DEFAULT_SETTINGS.musicVolume, loop: false });
    });

    test('播放新音樂前應該停止目前音樂', () => {
      const previous = makeMusic();
      audio.currentMusic = previous;

      audio.playMusic('bgm');

      expect(previous.stop).toHaveBeenCalled();
      expect(audio.currentMusic).toBe(scene.music);
    });

    test('未載入的音樂只停止目前音樂而不新增', () => {
      const previous = makeMusic();
      audio.currentMusic = previous;

      audio.playMusic('missing');

      expect(previous.stop).toHaveBeenCalled();
      expect(scene.sound.add).not.toHaveBeenCalled();
    });

    test('靜音時什麼都不做', () => {
      const previous = makeMusic();
      audio.currentMusic = previous;
      audio.isMuted = true;

      audio.playMusic('bgm');

      expect(previous.stop).not.toHaveBeenCalled();
      expect(scene.sound.add).not.toHaveBeenCalled();
    });
  });

  describe('音樂控制', () => {
    beforeEach(() => {
      audio.playMusic('bgm');
    });

    test('stopMusic 應該停止並清除目前音樂', () => {
      audio.stopMusic();

      expect(scene.music.stop).toHaveBeenCalled();
      expect(audio.currentMusic).toBeNull();
    });

    test('pauseMusic / resumeMusic 應該轉呼叫目前音樂', () => {
      audio.pauseMusic();
      expect(scene.music.pause).toHaveBeenCalled();

      audio.resumeMusic();
      expect(scene.music.resume).toHaveBeenCalled();
    });

    test('沒有音樂時控制方法不應該拋錯', () => {
      audio.currentMusic = null;

      expect(() => {
        audio.stopMusic();
        audio.pauseMusic();
        audio.resumeMusic();
        audio.setMusicVolume(0.5);
      }).not.toThrow();
    });
  });

  describe('靜音與音量', () => {
    test('setMuted 應該同步場景音效系統', () => {
      audio.setMuted(true);
      expect(audio.isMuted).toBe(true);
      expect(scene.sound.mute).toBe(true);

      audio.setMuted(false);
      expect(audio.isMuted).toBe(false);
      expect(scene.sound.mute).toBe(false);
    });

    test('setSFXVolume 應該限制在 0~1', () => {
      audio.setSFXVolume(0.4);
      expect(audio.sfxVolume).toBe(0.4);

      audio.setSFXVolume(-1);
      expect(audio.sfxVolume).toBe(0);

      audio.setSFXVolume(2);
      expect(audio.sfxVolume).toBe(1);
    });

    test('setMusicVolume 應該限制在 0~1 並套用到播放中的音樂', () => {
      audio.playMusic('bgm');

      audio.setMusicVolume(0.6);
      expect(audio.musicVolume).toBe(0.6);
      expect(scene.music.setVolume).toHaveBeenLastCalledWith(0.6);

      audio.setMusicVolume(-1);
      expect(audio.musicVolume).toBe(0);

      audio.setMusicVolume(5);
      expect(audio.musicVolume).toBe(1);
      expect(scene.music.setVolume).toHaveBeenLastCalledWith(1);
    });
  });

  test('destroy 應該停止音樂與循環音效並清空快取', () => {
    audio.playMusic('bgm');
    const engine = makeMusic();
    scene.sound.add.mockReturnValueOnce(engine);
    audio.setLoop('move', true);
    audio.sounds = { a: 1 };

    audio.destroy();

    expect(scene.music.stop).toHaveBeenCalled();
    expect(audio.currentMusic).toBeNull();
    expect(engine.stop).toHaveBeenCalled();
    expect(engine.destroy).toHaveBeenCalled();
    expect(audio.loops).toEqual({});
    expect(audio.sounds).toEqual({});
  });
});
