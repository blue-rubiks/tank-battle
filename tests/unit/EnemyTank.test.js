/**
 * EnemyTank 敵方坦克單元測試（真實實作）
 */

import EnemyTank from '../../src/entities/EnemyTank';
import { ENEMY_TYPES, EVENTS, DIFFICULTY } from '../../src/utils/Constants';

const makeMockScene = () => ({
  add: { existing: jest.fn() },
  physics: { add: { existing: jest.fn() } },
  time: { now: 1000, delayedCall: jest.fn() },
  tweens: { add: jest.fn() },
  events: { emit: jest.fn() },
  bullets: { getChildren: () => [] },
  player: { addScore: jest.fn() },
  audioManager: { playSFX: jest.fn() },
  spawnPowerUp: jest.fn(),
  createExplosion: jest.fn()
});

describe('EnemyTank', () => {
  let scene;

  beforeEach(() => {
    scene = makeMockScene();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('建構', () => {
    test.each(Object.keys(ENEMY_TYPES))('%s 類型應該套用對應設定', (type) => {
      const config = ENEMY_TYPES[type];
      const enemy = new EnemyTank(scene, 100, 120, type);

      expect(enemy.faction).toBe('enemy');
      expect(enemy.enemyType).toBe(type);
      expect(enemy.config).toBe(config);
      expect(enemy.texture).toBe(config.texture);
      expect(enemy.maxHealth).toBe(config.health);
      expect(enemy.health).toBe(config.health);
      expect(enemy.speed).toBe(config.speed);
      expect(enemy.fireRate).toBe(config.fireRate);
      expect(enemy.bulletSpeed).toBe(config.bulletSpeed);
      expect(enemy.score).toBe(config.score);
      expect(enemy.tintTopLeft).toBe(config.color);
      expect(enemy.baseTint).toBe(config.color);
      expect(enemy.aiController).toBeNull();
    });

    test.each([
      ['easy', 0.8, 1.5],
      ['normal', 1, 1],
      ['hard', 1.2, 0.7]
    ])('難度 %s 應該把移動速度乘以 %d、射擊間隔乘以 %d', (difficulty, speedRate, fireRate) => {
      scene.difficulty = difficulty;
      const enemy = new EnemyTank(scene, 0, 0, 'FAST');

      expect(DIFFICULTY[difficulty].enemySpeed).toBe(speedRate);
      expect(DIFFICULTY[difficulty].enemyFireInterval).toBe(fireRate);
      expect(enemy.speed).toBeCloseTo(ENEMY_TYPES.FAST.speed * speedRate, 6);
      expect(enemy.fireRate).toBeCloseTo(ENEMY_TYPES.FAST.fireRate * fireRate, 6);
    });

    test('未知難度視為普通', () => {
      scene.difficulty = 'nightmare';
      const enemy = new EnemyTank(scene, 0, 0, 'POWER');

      expect(enemy.speed).toBe(ENEMY_TYPES.POWER.speed);
      expect(enemy.fireRate).toBe(ENEMY_TYPES.POWER.fireRate);
    });

    test('預設類型為 BASIC', () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const enemy = new EnemyTank(scene, 0, 0);

      expect(enemy.enemyType).toBe('BASIC');
      expect(error).not.toHaveBeenCalled();
    });

    test('未知類型應該記錄錯誤並退回 BASIC（不可當掉）', () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});

      const enemy = new EnemyTank(scene, 0, 0, 'GHOST');

      expect(error).toHaveBeenCalledWith('Unknown enemy type: GHOST');
      expect(enemy.enemyType).toBe('BASIC');
      expect(enemy.config).toBe(ENEMY_TYPES.BASIC);
      expect(enemy.texture).toBe(ENEMY_TYPES.BASIC.texture);
    });

    test('應該播放淡入的生成動畫', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'FAST');

      expect(enemy.alpha).toBe(0);
      expect(scene.tweens.add).toHaveBeenCalledWith({
        targets: enemy,
        alpha: 1,
        duration: 500,
        ease: 'Power2'
      });
    });
  });

  describe('AI 整合', () => {
    test('setAI 應該設定控制器，update 時驅動 AI', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'BASIC');
      const ai = { update: jest.fn(), destroy: jest.fn() };

      enemy.setAI(ai);
      enemy.update(1000, 16);

      expect(enemy.aiController).toBe(ai);
      expect(ai.update).toHaveBeenCalledWith(16);
    });

    test('冰凍或已摧毀時不驅動 AI', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'BASIC');
      const ai = { update: jest.fn() };
      enemy.setAI(ai);

      enemy.isFrozen = true;
      enemy.update(1000, 16);
      enemy.isFrozen = false;
      enemy.isDestroyed = true;
      enemy.update(1000, 16);

      expect(ai.update).not.toHaveBeenCalled();
    });

    test('沒有 AI 時 update 不應該拋錯', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'BASIC');

      expect(() => enemy.update(1000, 16)).not.toThrow();
    });

    test('摧毀時應該清理 AI（從黑板取消註冊）', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'BASIC');
      const ai = { update: jest.fn(), destroy: jest.fn() };
      enemy.setAI(ai);

      enemy.destroy();

      expect(ai.destroy).toHaveBeenCalledTimes(1);
      expect(enemy.aiController).toBeNull();
      expect(enemy.isDestroyed).toBe(true);
    });

    test('AI 沒有 destroy 方法時也能摧毀', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'BASIC');
      enemy.setAI({ update: jest.fn() });

      expect(() => enemy.destroy()).not.toThrow();
      expect(enemy.aiController).toBeNull();
    });
  });

  describe('takeDamage - 受傷', () => {
    test('應該扣血並閃紅，血量未歸零不死亡', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'POWER');

      enemy.takeDamage(1);

      expect(enemy.health).toBe(1);
      expect(enemy.isDestroyed).toBe(false);
      expect(scene.time.delayedCall).toHaveBeenCalledWith(100, expect.any(Function));
    });

    test('無敵或已摧毀時不受傷', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'POWER');

      enemy.isInvincible = true;
      enemy.takeDamage(1);
      expect(enemy.health).toBe(2);

      enemy.isInvincible = false;
      enemy.isDestroyed = true;
      enemy.takeDamage(1);
      expect(enemy.health).toBe(2);
    });

    /** 觸發最後一次排程（閃紅結束 / 解凍） */
    const runLastTimer = () => {
      const calls = scene.time.delayedCall.mock.calls;
      calls[calls.length - 1][1]();
    };

    test.each([
      [1, 0xFFD93D],
      [2, 0xFF6B6B],
      [3, 0x808080]
    ])('裝甲坦克受到 %i 點傷害：先閃紅，結束後顯示血量顏色 %s', (damage, color) => {
      const enemy = new EnemyTank(scene, 0, 0, 'ARMOR');

      enemy.takeDamage(damage);
      expect(enemy.tintTopLeft).toBe(0xff0000);

      runLastTimer();
      expect(enemy.tintTopLeft).toBe(color);
      expect(enemy.baseTint).toBe(color);
    });

    test('受傷達到色表長度（第 5 階）時保持目前顏色', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'ARMOR');
      enemy.maxHealth = 5;
      enemy.health = 5;
      enemy.takeDamage(4);

      runLastTimer();
      expect(enemy.tintTopLeft).toBe(ENEMY_TYPES.ARMOR.color);
    });

    test('非裝甲坦克即使多血也不依血量變色', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'POWER');
      enemy.maxHealth = 4;
      enemy.health = 4;
      enemy.takeDamage(2);

      runLastTimer();
      expect(enemy.tintTopLeft).toBe(ENEMY_TYPES.POWER.color);
    });

    test('裝甲顏色超出色表時保持原本顏色', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'ARMOR');
      enemy.maxHealth = 10;
      enemy.health = 10;
      enemy.takeDamage(5);

      runLastTimer();
      expect(enemy.tintTopLeft).toBe(ENEMY_TYPES.ARMOR.color);
    });

    test('非裝甲坦克閃紅結束後恢復類型顏色', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'POWER');
      enemy.takeDamage(1);
      expect(enemy.tintTopLeft).toBe(0xff0000);

      runLastTimer();
      expect(enemy.tintTopLeft).toBe(ENEMY_TYPES.POWER.color);
    });

    test('解凍後恢復類型顏色（不可變成無染色）', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'FAST');
      enemy.setFrozen(8000);
      expect(enemy.tintTopLeft).toBe(0x00FFFF);

      runLastTimer();
      expect(enemy.tintTopLeft).toBe(ENEMY_TYPES.FAST.color);
    });
  });

  describe('死亡處理', () => {
    test('應該加分、發出事件、播放音效並摧毀', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const enemy = new EnemyTank(scene, 40, 50, 'FAST');

      enemy.takeDamage(1);

      expect(scene.player.addScore).toHaveBeenCalledWith(ENEMY_TYPES.FAST.score);
      expect(scene.events.emit).toHaveBeenCalledWith(EVENTS.ENEMY_DESTROYED, enemy);
      expect(scene.audioManager.playSFX).toHaveBeenCalledWith('enemydestroy', 0.7);
      expect(scene.createExplosion).toHaveBeenCalledWith(40, 50);
      expect(enemy.isDestroyed).toBe(true);
      expect(scene.spawnPowerUp).not.toHaveBeenCalled();
    });

    test('血量低於零也應該死亡', () => {
      const enemy = new EnemyTank(scene, 0, 0, 'BASIC');
      enemy.takeDamage(9999);

      expect(enemy.isDestroyed).toBe(true);
    });

    test('有 10% 機率在原地掉落道具', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.09);
      const enemy = new EnemyTank(scene, 40, 50, 'BASIC');

      enemy.takeDamage(1);

      expect(scene.spawnPowerUp).toHaveBeenCalledWith(40, 50);
    });

    test('剛好 10% 時不掉落', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const enemy = new EnemyTank(scene, 40, 50, 'BASIC');

      enemy.takeDamage(1);

      expect(scene.spawnPowerUp).not.toHaveBeenCalled();
    });

    test('場景缺少玩家、音效、道具生成時也能死亡', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      scene.player = null;
      scene.audioManager = { };
      delete scene.spawnPowerUp;
      const enemy = new EnemyTank(scene, 0, 0, 'BASIC');

      expect(() => enemy.takeDamage(1)).not.toThrow();
      expect(enemy.isDestroyed).toBe(true);

      scene.audioManager = null;
      const other = new EnemyTank(scene, 0, 0, 'BASIC');
      expect(() => other.takeDamage(1)).not.toThrow();
    });
  });
});
