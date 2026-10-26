/**
 * 敵方坦克類別
 */

import Tank from './Tank';
import { ENEMY_TYPES, EVENTS, DIFFICULTY } from '../utils/Constants';

export default class EnemyTank extends Tank {
  /**
   * 建構子
   * @param {Phaser.Scene} scene - 場景
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @param {string} type - 敵人類型 (BASIC, FAST, POWER, ARMOR)
   */
  constructor(scene, x, y, type = 'BASIC') {
    let config = ENEMY_TYPES[type];

    if (!config) {
      console.error(`Unknown enemy type: ${type}`);
      type = 'BASIC';
      config = ENEMY_TYPES[type];
    }

    super(scene, x, y, config.texture);

    this.faction = 'enemy';

    // 敵人屬性
    this.enemyType = type;
    this.config = ENEMY_TYPES[type];

    this.maxHealth = this.config.health;
    this.health = this.config.health;
    // 難度（設定畫面）調整移動速度與射擊間隔；未設定或未知值視為普通
    const difficulty = DIFFICULTY[scene.difficulty] || DIFFICULTY.normal;
    this.speed = this.config.speed * difficulty.enemySpeed;
    this.fireRate = this.config.fireRate * difficulty.enemyFireInterval;
    this.bulletSpeed = this.config.bulletSpeed;
    this.score = this.config.score;

    // 設定顏色（閃紅、解凍後恢復成類型色）
    this.baseTint = this.config.color;
    this.setTint(this.baseTint);

    // AI 相關
    this.aiController = null;

    // 生成動畫
    this._playSpawnAnimation();
  }

  /**
   * 生成動畫
   * @private
   */
  _playSpawnAnimation() {
    this.setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 500,
      ease: 'Power2'
    });
  }

  /**
   * 設定 AI 控制器
   * @param {EnemyAI} aiController - AI 控制器
   */
  setAI(aiController) {
    this.aiController = aiController;
  }

  /**
   * 敵人受傷（裝甲坦克變色）
   * @param {number} damage - 傷害值
   */
  takeDamage(damage) {
    if (this.isDestroyed || this.isInvincible) return;

    this.health -= damage;

    // 裝甲坦克根據血量變色（先更新基礎色，閃紅結束後才顯示，紅閃不被覆蓋）
    if (this.enemyType === 'ARMOR') {
      this._updateArmorColor();
    }

    this._flashRed();

    if (this.health <= 0) {
      this._onDeath();
    }
  }

  /**
   * 更新裝甲坦克顏色
   * @private
   */
  _updateArmorColor() {
    const colors = [
      0x6BCB77,  // 綠色 (4 HP)
      0xFFD93D,  // 黃色 (3 HP)
      0xFF6B6B,  // 紅色 (2 HP)
      0x808080   // 灰色 (1 HP)
    ];

    const colorIndex = this.maxHealth - this.health;
    if (colorIndex < colors.length) {
      this.baseTint = colors[colorIndex];
    }
  }

  /**
   * 敵人死亡處理
   * @private
   */
  _onDeath() {
    // 更新分數
    if (this.scene.player) {
      this.scene.player.addScore(this.score);
    }

    // 發送敵人摧毀事件
    this.scene.events.emit(EVENTS.ENEMY_DESTROYED, this);

    // 播放敵人摧毀音效
    if (this.scene.audioManager && this.scene.audioManager.playSFX) {
      this.scene.audioManager.playSFX('enemydestroy', 0.7);
    }

    // 有機率掉落道具
    this._tryDropPowerUp();

    this.destroy();
  }

  /**
   * 嘗試掉落道具
   * @private
   */
  _tryDropPowerUp() {
    // 10% 機率掉落道具
    if (Math.random() < 0.1 && this.scene.spawnPowerUp) {
      this.scene.spawnPowerUp(this.x, this.y);
    }
  }

  /**
   * 更新 AI 行為
   * @param {number} time - 遊戲時間
   * @param {number} delta - 時間差
   */
  update(time, delta) {
    super.update(time, delta);

    if (this.aiController && !this.isDestroyed && !this.isFrozen) {
      this.aiController.update(delta);
    }
  }

  /**
   * 摧毀前清理
   */
  destroy() {
    // 清理 AI 控制器（從黑板取消註冊）
    if (this.aiController) {
      if (this.aiController.destroy) {
        this.aiController.destroy();
      }
      this.aiController = null;
    }
    super.destroy();
  }
}
