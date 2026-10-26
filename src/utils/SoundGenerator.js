/**
 * 音效生成器
 * 使用 Web Audio API 生成復古 8-bit 風格音效
 */

export default class SoundGenerator {
  /**
   * 建立單聲道緩衝區並逐一取樣
   * @param {Phaser.Scene} scene - 場景（需有 Web Audio context）
   * @param {number} duration - 時長（秒）
   * @param {Function} sample - (t) => 取樣值，t 為秒
   * @returns {AudioBuffer}
   * @private
   */
  static _render(scene, duration, sample) {
    const audioContext = scene.sound.context;
    const sampleRate = audioContext.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // Stryker disable next-line EqualityOperator: 寫入超出 Float32Array 長度的位置會被忽略（等價）
    for (let i = 0; i < bufferSize; i++) {
      data[i] = sample(i / sampleRate);
    }

    return buffer;
  }

  /**
   * 生成射擊音效（短促的爆破聲）
   */
  static generateShootSound(scene) {
    const duration = 0.15;
    return this._render(scene, duration, (t) => {
      // 快速下降的頻率（從 800Hz 到 200Hz）
      const freq = 800 - (t * 4000);
      // 方波 + 噪音
      const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
      const noise = (Math.random() * 2 - 1) * 0.3;
      // 快速衰減的包絡
      const envelope = Math.exp(-t * 20);

      return (square * 0.7 + noise) * envelope * 0.3;
    });
  }

  /**
   * 生成爆炸音效（更長的爆破聲）
   */
  static generateExplosionSound(scene) {
    const duration = 0.4;
    return this._render(scene, duration, (t) => {
      // 低頻爆炸聲（從 300Hz 快速降到 50Hz）
      const freq = 300 * Math.exp(-t * 8);
      const noise = (Math.random() * 2 - 1);
      const rumble = Math.sin(2 * Math.PI * freq * t);
      // 爆炸包絡（快速上升，慢速下降）
      const attack = Math.min(t * 50, 1);
      const decay = Math.exp(-t * 3);
      const envelope = attack * decay;

      return (noise * 0.5 + rumble * 0.5) * envelope * 0.4;
    });
  }

  /**
   * 生成擊中音效（短促的碰撞聲）
   */
  static generateHitSound(scene) {
    const duration = 0.1;
    return this._render(scene, duration, (t) => {
      // 高頻撞擊聲
      const freq = 1200 - (t * 3000);
      const noise = (Math.random() * 2 - 1);
      const tone = Math.sin(2 * Math.PI * freq * t);
      // 超快速衰減
      const envelope = Math.exp(-t * 30);

      return (noise * 0.6 + tone * 0.4) * envelope * 0.25;
    });
  }

  /**
   * 生成道具收集音效（向上的音階）
   */
  static generatePowerUpSound(scene) {
    const duration = 0.3;
    return this._render(scene, duration, (t) => {
      // 向上的音階（C5 -> E5 -> G5）
      let freq;
      if (t < 0.1) {
        freq = 523; // C5
      } else {
        // Stryker disable next-line EqualityOperator: t 恰為 0.2 時 659Hz 與 784Hz 的相位小數部分相同，取樣值一致（等價）
        freq = t < 0.2 ? 659 : 784; // E5 / G5
      }

      // 方波音色（8-bit 風格）
      const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
      // 包絡
      const envelope = 1 - (t / duration);

      return square * envelope * 0.25;
    });
  }

  /**
   * 生成坦克移動音效（低頻引擎聲，循環播放）
   * 0.5 秒內 80Hz 剛好 40 個週期、4Hz 脈動剛好 2 個週期，首尾相接不會爆音；
   * 若改成隨時間變動的頻率，相位在接縫處不連續，每次循環都會喀一聲
   */
  static generateMoveSound(scene) {
    const duration = 0.5;
    return this._render(scene, duration, (t) => {
      // 低頻引擎隆隆聲
      const rumble = Math.sin(2 * Math.PI * 80 * t);
      const noise = (Math.random() * 2 - 1) * 0.3;
      // 引擎脈動（振幅起伏）
      const pulse = 0.75 + 0.25 * Math.sin(2 * Math.PI * 4 * t);

      return (rumble * 0.7 + noise * 0.3) * pulse * 0.5 * 0.15;
    });
  }

  /**
   * 生成遊戲開始音效
   */
  static generateGameStartSound(scene) {
    const duration = 0.5;
    return this._render(scene, duration, (t) => {
      // 向上的琶音
      let freq;
      if (t < 0.125) freq = 262; // C4
      else if (t < 0.25) freq = 330; // E4
      else if (t < 0.375) freq = 392; // G4
      else freq = 523; // C5

      const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
      const envelope = 1 - (t / duration) * 0.5;

      return square * envelope * 0.2;
    });
  }

  /**
   * 生成敵人被摧毀音效
   */
  static generateEnemyDestroySound(scene) {
    const duration = 0.35;
    return this._render(scene, duration, (t) => {
      // 下降的音調
      const freq = 600 * Math.exp(-t * 6);
      const square = Math.sign(Math.sin(2 * Math.PI * freq * t));
      const noise = (Math.random() * 2 - 1) * 0.4;
      const envelope = Math.exp(-t * 5);

      return (square * 0.6 + noise * 0.4) * envelope * 0.35;
    });
  }

  /**
   * 將 AudioBuffer 添加到場景的音效快取
   */
  static addBufferToCache(scene, key, buffer) {
    // 創建一個臨時的音頻源來儲存
    const source = scene.sound.context.createBufferSource();
    source.buffer = buffer;

    // 添加到 Phaser 的音效系統
    if (!scene.cache.audio.exists(key)) {
      scene.cache.audio.add(key, buffer);
    }
  }

  /**
   * 生成所有遊戲音效
   */
  static generateAllSounds(scene) {
    const sounds = {
      'shoot': this.generateShootSound(scene),
      'explosion': this.generateExplosionSound(scene),
      'hit': this.generateHitSound(scene),
      'powerup': this.generatePowerUpSound(scene),
      'move': this.generateMoveSound(scene),
      'gamestart': this.generateGameStartSound(scene),
      'enemydestroy': this.generateEnemyDestroySound(scene)
    };

    // 添加到快取
    for (const [key, buffer] of Object.entries(sounds)) {
      this.addBufferToCache(scene, key, buffer);
    }

    return sounds;
  }
}
