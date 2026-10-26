/**
 * 坦克基礎類別
 * 所有坦克（玩家與敵人）的父類別
 */

import Phaser from 'phaser';
import {
  TANK_CONFIG,
  DIRECTION_ANGLES,
  DIRECTION_VECTORS,
  DEPTHS
} from '../utils/Constants';

// 冰凍時的染色（青色）
const FROZEN_TINT = 0x00FFFF;

export default class Tank extends Phaser.Physics.Arcade.Sprite {
  /**
   * 建構子
   * @param {Phaser.Scene} scene - 場景實例
   * @param {number} x - X 座標
   * @param {number} y - Y 座標
   * @param {string} texture - 紋理鍵值
   */
  constructor(scene, x, y, texture) {
    super(scene, x, y, texture);

    // 加入場景
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 基本屬性
    // 陣營判定用顯式欄位，不可依賴 constructor.name（production 壓縮會改名）
    this.faction = null;
    this.maxHealth = 1;
    this.health = 1;
    this.speed = TANK_CONFIG.PLAYER_SPEED;
    this.direction = 'up';

    // 武器屬性
    this.fireRate = TANK_CONFIG.PLAYER_FIRE_RATE;
    this.lastFired = 0;
    this.maxBullets = TANK_CONFIG.PLAYER_MAX_BULLETS;
    this.bulletSpeed = 200;
    this.bulletDamage = 1;

    // 狀態
    this.isDestroyed = false;
    this.isInvincible = false;
    this.isFrozen = false;

    // 無敵 / 冰凍結束時間：多段效果重疊時只有最晚結束的那段能解除
    this.invincibleUntil = 0;
    this.frozenUntil = 0;

    // 基礎染色：閃紅、解凍結束後恢復成此顏色（null = 不染色）
    this.baseTint = null;

    // 設定深度
    this.setDepth(DEPTHS.ENTITY);

    // 初始化
    this._setupPhysics();
  }

  /**
   * 設定物理屬性
   * @private
   */
  _setupPhysics() {
    // 設定碰撞箱（略小於精靈，避免卡牆）
    // 從 28x28 縮小到 26x26，增加 2px 緩衝空間
    const bufferSize = 2; // 碰撞緩衝區
    const bodySize = TANK_CONFIG.TANK_BODY_SIZE - bufferSize;
    const bodyOffset = TANK_CONFIG.TANK_BODY_OFFSET + bufferSize / 2;

    this.body.setSize(bodySize, bodySize);
    this.body.setOffset(bodyOffset, bodyOffset);

    // 設定世界邊界碰撞
    this.setCollideWorldBounds(true);

    // 設定阻力（停止時快速減速）
    this.body.setDrag(TANK_CONFIG.NORMAL_DRAG);

    // 防止被其他坦克推動（經典坦克大戰行為）
    this.body.pushable = false;

    // 移除彈性，避免奇怪的物理行為
    this.body.setBounce(0);
  }

  /**
   * 移動坦克
   * @param {string} direction - 方向 ('up', 'down', 'left', 'right')
   */
  move(direction) {
    if (this.isDestroyed || this.isFrozen) return;

    const vector = DIRECTION_VECTORS[direction];

    if (vector) {
      this.face(direction);
      this.setVelocity(vector.x * this.speed, vector.y * this.speed);
    }
  }

  /**
   * 原地轉向（不移動）
   * 停車射擊時仍需能轉動砲口對準目標
   * @param {string} direction - 方向 ('up', 'down', 'left', 'right')
   */
  face(direction) {
    if (this.isDestroyed || this.isFrozen) return;

    const angle = DIRECTION_ANGLES[direction];

    if (angle !== undefined) {
      this.direction = direction;
      this.setAngle(angle);
    }
  }

  /**
   * 停止移動
   * @param {boolean} force - 強制立即停止（冰凍等狀態用）
   */
  stop(force = false) {
    // 冰上滑行：放開方向時不立即歸零，由降低的阻力自然減速
    if (this.onIce && !force) {
      return;
    }

    this.setVelocity(0, 0);
  }

  /**
   * 射擊
   * @returns {Bullet|null} 子彈物件或 null
   */
  shoot() {
    if (this.isDestroyed || this.isFrozen) return null;

    const currentTime = this.scene.time.now;

    // 檢查冷卻時間
    if (currentTime - this.lastFired < this.fireRate) {
      return null;
    }

    // 檢查子彈數量限制（由場景管理）
    const activeBullets = this.scene.bullets
      .getChildren()
      .filter(bullet => bullet.active && bullet.owner === this);

    if (activeBullets.length >= this.maxBullets) {
      return null;
    }

    this.lastFired = currentTime;

    // 計算子彈發射位置
    const bulletOffset = 20;
    const vector = DIRECTION_VECTORS[this.direction];
    const bulletX = this.x + vector.x * bulletOffset;
    const bulletY = this.y + vector.y * bulletOffset;

    // 建立子彈（由場景實作）
    const bullet = this.scene.createBullet(
      bulletX,
      bulletY,
      this.direction,
      this.bulletSpeed,
      this.bulletDamage,
      this
    );

    return bullet;
  }

  /**
   * 受到傷害
   * @param {number} damage - 傷害值
   */
  takeDamage(damage) {
    if (this.isDestroyed || this.isInvincible) return;

    this.health -= damage;

    // 受傷閃爍效果
    this._flashRed();

    if (this.health <= 0) {
      this.destroy();
    }
  }

  /**
   * 受傷閃爍效果
   * @private
   */
  _flashRed() {
    this.setTint(0xff0000);

    this.scene.time.delayedCall(100, () => {
      if (this.active) {
        this._restoreTint();
      }
    });
  }

  /**
   * 恢復目前應有的顏色（閃紅、解凍結束時呼叫）
   * 不可直接 clearTint：會洗掉敵人類型色與裝甲血量色
   * @private
   */
  _restoreTint() {
    if (this.isFrozen) {
      this.setTint(FROZEN_TINT);
    } else if (this.baseTint !== null) {
      this.setTint(this.baseTint);
    } else {
      this.clearTint();
    }
  }

  /**
   * 摧毀坦克
   */
  destroy() {
    if (this.isDestroyed) return;

    this.isDestroyed = true;

    // 建立爆炸特效（由場景實作）
    if (this.scene.createExplosion) {
      this.scene.createExplosion(this.x, this.y);
    }

    // 移除精靈
    super.destroy();
  }

  /**
   * 設定無敵狀態
   * @param {number} duration - 持續時間（毫秒）
   */
  setInvincible(duration) {
    this.isInvincible = true;

    // 多段無敵重疊時（例如重生無敵中吃到第 4 顆星），只有最晚結束的那段能解除，
    // 否則較早那段的閃爍結束時會提前取消後來給的無敵
    const endsAt = this.scene.time.now + duration;
    this.invincibleUntil = Math.max(this.invincibleUntil, endsAt);

    // 閃爍效果
    this.scene.tweens.add({
      targets: this,
      alpha: 0.5,
      duration: 200,
      yoyo: true,
      repeat: Math.floor(duration / 400),
      onComplete: () => {
        if (this.active && endsAt === this.invincibleUntil) {
          this.isInvincible = false;
          this.setAlpha(1);
        }
      }
    });
  }

  /**
   * 設定冰凍狀態
   * @param {number} duration - 持續時間（毫秒）
   */
  setFrozen(duration) {
    this.isFrozen = true;
    this.stop(true);
    this.setTint(FROZEN_TINT);

    // 冰凍中再次冰凍（連吃兩個時鐘）時以最晚結束者為準，避免第一次的計時提前解凍
    const endsAt = this.scene.time.now + duration;
    this.frozenUntil = Math.max(this.frozenUntil, endsAt);

    this.scene.time.delayedCall(duration, () => {
      if (this.active && endsAt === this.frozenUntil) {
        this.isFrozen = false;
        this._restoreTint();
      }
    });
  }

  /**
   * 每幀更新
   * 子類別可以覆寫此方法，覆寫版本會收到 Phaser 傳入的 (time, delta)
   */
  update() {
  }
}
