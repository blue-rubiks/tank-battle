/**
 * 音效管理器
 * 管理所有音效與音樂
 */

import { DEFAULT_SETTINGS } from '../utils/Constants';

export default class AudioManager {
  /**
   * 建構子
   * @param {Phaser.Scene} scene - 場景
   * @param {Object} settings - 存檔中的設定（musicVolume / sfxVolume，0~1）
   */
  constructor(scene, settings = {}) {
    this.scene = scene;

    // 音量設定（設定畫面可調）；實際音量 = 個別音效的相對音量 × 這裡的音量
    const volumes = { ...DEFAULT_SETTINGS, ...settings };
    this.sfxVolume = volumes.sfxVolume;
    this.musicVolume = volumes.musicVolume;
    this.isMuted = false;

    // 當前播放的音樂
    this.currentMusic = null;

    // 循環播放中的音效（如坦克引擎聲），依鍵值保存
    this.loops = {};

    // 音效快取
    this.sounds = {};
  }

  /**
   * 播放音效
   * @param {string} key - 音效鍵值
   * @param {number} mix - 相對音量（0~1，會再乘上音效音量）
   */
  playSFX(key, mix = 0.7) {
    this._play(key, mix * this.sfxVolume);
  }

  /**
   * 播放短曲（如開場音樂），音量依「音樂音量」
   * @param {string} key - 音效鍵值
   * @param {number} mix - 相對音量（0~1，會再乘上音樂音量）
   */
  playJingle(key, mix = 1) {
    this._play(key, mix * this.musicVolume);
  }

  /**
   * 播放一次性音效；靜音、音量為 0 或尚未載入時略過
   * @private
   */
  _play(key, volume) {
    if (this.isMuted || volume <= 0) return;
    if (!this.scene.cache.audio.exists(key)) return;

    this.scene.sound.play(key, { volume });
  }

  /**
   * 開始或停止循環音效（重複開始不會疊加）
   * @param {string} key - 音效鍵值
   * @param {boolean} playing - true 開始、false 停止
   * @param {number} mix - 相對音量（0~1，會再乘上音效音量）
   */
  setLoop(key, playing, mix = 1) {
    const current = this.loops[key];

    if (!playing) {
      if (current) {
        current.stop();
        current.destroy();
        delete this.loops[key];
      }
      return;
    }

    const volume = mix * this.sfxVolume;
    if (current || this.isMuted || volume <= 0) return;
    if (!this.scene.cache.audio.exists(key)) return;

    const sound = this.scene.sound.add(key, { loop: true, volume });
    sound.play();
    this.loops[key] = sound;
  }

  /**
   * 播放背景音樂
   * @param {string} key - 音樂鍵值
   * @param {boolean} loop - 是否循環
   */
  playMusic(key, loop = true) {
    if (this.isMuted) return;

    // 停止當前音樂
    if (this.currentMusic) {
      this.currentMusic.stop();
    }

    // 檢查音樂是否已載入
    if (!this.scene.cache.audio.exists(key)) {
      return;
    }

    // 播放新音樂
    this.currentMusic = this.scene.sound.add(key, {
      volume: this.musicVolume,
      loop: loop
    });

    this.currentMusic.play();
  }

  /**
   * 停止音樂
   */
  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic = null;
    }
  }

  /**
   * 暫停音樂
   */
  pauseMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
    }
  }

  /**
   * 繼續音樂
   */
  resumeMusic() {
    if (this.currentMusic) {
      this.currentMusic.resume();
    }
  }

  /**
   * 設定靜音
   * @param {boolean} muted - 是否靜音
   */
  setMuted(muted) {
    this.isMuted = muted;

    if (muted) {
      this.scene.sound.mute = true;
    } else {
      this.scene.sound.mute = false;
    }
  }

  /**
   * 設定音效音量
   * @param {number} volume - 音量 (0-1)
   */
  setSFXVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * 設定音樂音量
   * @param {number} volume - 音量 (0-1)
   */
  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));

    if (this.currentMusic) {
      this.currentMusic.setVolume(this.musicVolume);
    }
  }

  /**
   * 清理
   */
  destroy() {
    this.stopMusic();
    Object.keys(this.loops).forEach(key => this.setLoop(key, false));
    this.sounds = {};
  }
}
