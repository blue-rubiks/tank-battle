/**
 * PlayerTank 單元測試
 * 直接以真實實作測試玩家坦克的道具、升星、受傷 / 死亡流程
 */

import PlayerTank from '../../src/entities/PlayerTank';
import { TANK_CONFIG, EVENTS, POWERUP_TYPES } from '../../src/utils/Constants';

const makeShieldSprite = () => ({
  setStrokeStyle: jest.fn(),
  setDepth: jest.fn(),
  setPosition: jest.fn(),
  destroy: jest.fn()
});

describe('PlayerTank', () => {
  let mockScene;
  let player;

  beforeEach(() => {
    mockScene = {
      add: { existing: jest.fn(), circle: jest.fn(() => makeShieldSprite()) },
      physics: { add: { existing: jest.fn() } },
      time: { now: 1000, delayedCall: jest.fn() },
      tweens: { add: jest.fn() },
      events: { emit: jest.fn() },
      respawnPlayer: jest.fn(),
      gameOver: jest.fn(),
      createExplosion: jest.fn(),
      bullets: { getChildren: () => [] },
      destroyAllEnemies: jest.fn(),
      activateBaseProtection: jest.fn(),
      freezeAllEnemies: jest.fn()
    };

    jest.spyOn(console, 'log').mockImplementation(() => {});
    player = new PlayerTank(mockScene, 100, 100);
    // 出生無敵由 tween 控制，測試中直接解除
    player.isInvincible = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** 取出最後一次 delayedCall 的參數 */
  const lastDelayedCall = () => {
    const calls = mockScene.time.delayedCall.mock.calls;
    return calls[calls.length - 1];
  };

  describe('基本屬性', () => {
    test('陣營應該是 player', () => {
      expect(player.faction).toBe('player');
      expect(player.texture).toBe('player_tank');
    });

    test('初始生命數為 3', () => {
      expect(player.lives).toBe(3);
    });

    test('初始分數、星級、速度與道具狀態', () => {
      expect(player.score).toBe(0);
      expect(player.starLevel).toBe(0);
      expect(player.baseSpeed).toBe(TANK_CONFIG.PLAYER_SPEED);
      expect(player.speed).toBe(TANK_CONFIG.PLAYER_SPEED);
      expect(player.powerUps).toEqual({
        shield: false,
        rapidFire: false,
        powerBullet: false,
        speedBoost: false
      });
      expect(player.shieldSprite).toBeNull();
    });

    test('生成時應該有 3 秒無敵', () => {
      const fresh = new PlayerTank(mockScene, 0, 0);

      expect(fresh.isInvincible).toBe(true);
      const tween = mockScene.tweens.add.mock.calls[mockScene.tweens.add.mock.calls.length - 1][0];
      expect(tween.targets).toBe(fresh);
      expect(tween.repeat).toBe(Math.floor(3000 / 400));
    });
  });

  describe('applyPowerUp - 道具', () => {
    test('每種道具都應該發出收集事件', () => {
      Object.keys(POWERUP_TYPES).forEach(type => {
        player.applyPowerUp(type);
        expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.POWERUP_COLLECTED, type);
      });
    });

    test('未知道具只發出收集事件', () => {
      player.applyPowerUp('UNKNOWN');

      expect(mockScene.events.emit).toHaveBeenCalledTimes(1);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.POWERUP_COLLECTED, 'UNKNOWN');
      expect(player.lives).toBe(3);
      expect(player.starLevel).toBe(0);
    });

    test('TANK：額外生命並發出生命變化事件', () => {
      player.applyPowerUp('TANK');

      expect(player.lives).toBe(4);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.LIVES_CHANGED, 4);
    });

    test('GRENADE：消滅所有敵人', () => {
      player.applyPowerUp('GRENADE');

      expect(mockScene.destroyAllEnemies).toHaveBeenCalledTimes(1);
    });

    test('SHOVEL：以道具持續時間啟動基地防護', () => {
      player.applyPowerUp('SHOVEL');

      expect(mockScene.activateBaseProtection).toHaveBeenCalledWith(POWERUP_TYPES.SHOVEL.duration);
    });

    test('CLOCK：以道具持續時間冰凍敵人', () => {
      player.applyPowerUp('CLOCK');

      expect(mockScene.freezeAllEnemies).toHaveBeenCalledWith(POWERUP_TYPES.CLOCK.duration);
    });

    test('場景缺少對應方法時道具不應該拋錯', () => {
      delete mockScene.destroyAllEnemies;
      delete mockScene.activateBaseProtection;
      delete mockScene.freezeAllEnemies;

      expect(() => {
        player.applyPowerUp('GRENADE');
        player.applyPowerUp('SHOVEL');
        player.applyPowerUp('CLOCK');
      }).not.toThrow();
    });

    describe('HELMET：護盾', () => {
      test('應該開啟護盾、無敵並建立青色護盾精靈', () => {
        player.applyPowerUp('HELMET');

        expect(player.powerUps.shield).toBe(true);
        expect(player.isInvincible).toBe(true);
        expect(mockScene.add.circle).toHaveBeenCalledWith(100, 100, 24, 0x00FFFF, 0.3);
        expect(player.shieldSprite.setStrokeStyle).toHaveBeenCalledWith(2, 0x00FFFF);
        expect(player.shieldSprite.setDepth).toHaveBeenCalledWith(player.depth + 1);
      });

      test('護盾精靈應該持續脈動', () => {
        player.applyPowerUp('HELMET');

        expect(mockScene.tweens.add).toHaveBeenCalledWith({
          targets: player.shieldSprite,
          alpha: 0.5,
          duration: 500,
          yoyo: true,
          repeat: -1
        });
      });

      test('無敵閃爍應該以頭盔持續時間計算', () => {
        player.applyPowerUp('HELMET');

        const invincibleTween = mockScene.tweens.add.mock.calls
          .map(c => c[0])
          .filter(c => c.targets === player)
          .pop();
        expect(invincibleTween.repeat).toBe(Math.floor(POWERUP_TYPES.HELMET.duration / 400));
      });

      test('時間到應該移除護盾', () => {
        player.applyPowerUp('HELMET');
        const sprite = player.shieldSprite;
        const [delay, callback] = lastDelayedCall();

        expect(delay).toBe(POWERUP_TYPES.HELMET.duration);
        callback();

        expect(player.powerUps.shield).toBe(false);
        expect(sprite.destroy).toHaveBeenCalled();
        expect(player.shieldSprite).toBeNull();
      });

      test('已有護盾精靈時不重複建立', () => {
        player.applyPowerUp('HELMET');
        player.applyPowerUp('HELMET');

        expect(mockScene.add.circle).toHaveBeenCalledTimes(1);
      });

      test('護盾到期前陣亡（Phaser 已清掉 scene）時計時器不可拋錯', () => {
        player.applyPowerUp('HELMET');
        const [, callback] = lastDelayedCall();
        player.destroy();
        player.scene = undefined;

        expect(() => callback()).not.toThrow();
      });

      test('護盾期間再拾取頭盔時，以較晚的結束時間為準', () => {
        player.applyPowerUp('HELMET');
        const [, first] = lastDelayedCall();
        mockScene.time.now += 4000;
        player.applyPowerUp('HELMET');
        const [, second] = lastDelayedCall();
        const sprite = player.shieldSprite;

        first();
        expect(player.powerUps.shield).toBe(true);
        expect(sprite.destroy).not.toHaveBeenCalled();

        second();
        expect(player.powerUps.shield).toBe(false);
        expect(sprite.destroy).toHaveBeenCalled();
      });

      test('頭盔結束時裝甲護盾（第 4 顆星）仍有效，護盾外觀應該保留到裝甲結束', () => {
        player.applyPowerUp('HELMET');
        const [, helmetEnds] = lastDelayedCall();
        mockScene.time.now += 8000;
        player.starLevel = 3;
        player.applyPowerUp('STAR');
        const [, armorEnds] = lastDelayedCall();
        const sprite = player.shieldSprite;

        // 頭盔在 10 秒到期（裝甲到 13 秒）
        mockScene.time.now += 2000;
        helmetEnds();
        expect(player.powerUps.shield).toBe(false);
        expect(sprite.destroy).not.toHaveBeenCalled();

        mockScene.time.now += 3000;
        armorEnds();
        expect(sprite.destroy).toHaveBeenCalled();
        expect(player.shieldSprite).toBeNull();
      });

      test('頭盔與裝甲護盾同一刻到期、且裝甲計時先執行時，仍要移除護盾外觀', () => {
        player.applyPowerUp('HELMET');
        const [, helmetEnds] = lastDelayedCall();
        // 讓裝甲護盾（5 秒）與頭盔同一刻結束
        mockScene.time.now += POWERUP_TYPES.HELMET.duration - 5000;
        player.starLevel = 3;
        player.applyPowerUp('STAR');
        const [, armorEnds] = lastDelayedCall();
        const sprite = player.shieldSprite;

        mockScene.time.now += 5000;
        armorEnds();
        // 頭盔仍有效 → 裝甲計時不移除
        expect(sprite.destroy).not.toHaveBeenCalled();

        helmetEnds();
        expect(player.powerUps.shield).toBe(false);
        expect(sprite.destroy).toHaveBeenCalled();
        expect(player.shieldSprite).toBeNull();
      });
    });
  });

  describe('星星升級（經典 FC 模式）', () => {
    test('Level 1：移動速度 ×1.3', () => {
      player.applyPowerUp('STAR');

      expect(player.starLevel).toBe(1);
      expect(player.speed).toBeCloseTo(TANK_CONFIG.PLAYER_SPEED * 1.3);
      expect(player.maxBullets).toBe(TANK_CONFIG.PLAYER_MAX_BULLETS);
      expect(player.bulletDamage).toBe(1);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.STAR_UPGRADED, 1);
      // 事件名稱必須有定義（否則發出的是名為 undefined 的事件）
      expect(EVENTS.STAR_UPGRADED).toBe('star_upgraded');
    });

    test('Level 2：可同時發射 2 顆子彈', () => {
      player.maxBullets = 1;
      player.starLevel = 1;
      player.applyPowerUp('STAR');

      expect(player.starLevel).toBe(2);
      expect(player.maxBullets).toBe(2);
    });

    test('Level 3：子彈可破壞鋼牆（damage = 2）', () => {
      player.starLevel = 2;
      player.applyPowerUp('STAR');

      expect(player.starLevel).toBe(3);
      expect(player.bulletDamage).toBe(2);
    });

    test('Level 4：3 發子彈 + 5 秒金色裝甲護盾', () => {
      player.starLevel = 3;
      player.applyPowerUp('STAR');

      expect(player.starLevel).toBe(4);
      expect(player.maxBullets).toBe(3);
      expect(player.isInvincible).toBe(true);
      expect(mockScene.add.circle).toHaveBeenCalledWith(100, 100, 24, 0xFFD700, 0.3);
      expect(player.shieldSprite.setStrokeStyle).toHaveBeenCalledWith(2, 0xFFD700);
      expect(player.shieldSprite.setDepth).toHaveBeenCalledWith(player.depth + 1);
      expect(mockScene.tweens.add).toHaveBeenCalledWith({
        targets: player.shieldSprite,
        alpha: 0.5,
        duration: 300,
        yoyo: true,
        repeat: -1
      });
      const invincibleTween = mockScene.tweens.add.mock.calls
        .map(c => c[0])
        .filter(c => c.targets === player)
        .pop();
      expect(invincibleTween.repeat).toBe(Math.floor(5000 / 400));
    });

    test('重生無敵期間升到 4 級時，裝甲無敵不可被重生無敵的結束提前取消', () => {
      const fresh = new PlayerTank(mockScene, 0, 0);
      const spawnTween = mockScene.tweens.add.mock.calls[mockScene.tweens.add.mock.calls.length - 1][0];
      fresh.starLevel = 3;
      mockScene.time.now = 2000;
      fresh.applyPowerUp('STAR');
      const armorTween = mockScene.tweens.add.mock.calls
        .map(c => c[0])
        .filter(c => c.targets === fresh)
        .pop();

      spawnTween.onComplete();
      expect(fresh.isInvincible).toBe(true);

      armorTween.onComplete();
      expect(fresh.isInvincible).toBe(false);
    });

    test('裝甲護盾 5 秒後移除', () => {
      player.starLevel = 3;
      player.applyPowerUp('STAR');
      const sprite = player.shieldSprite;
      const [delay, callback] = lastDelayedCall();

      expect(delay).toBe(5000);
      callback();

      expect(sprite.destroy).toHaveBeenCalled();
      expect(player.shieldSprite).toBeNull();
    });

    test('裝甲護盾到期時若頭盔護盾仍在則保留精靈', () => {
      player.starLevel = 3;
      player.applyPowerUp('STAR');
      const sprite = player.shieldSprite;
      const [, callback] = lastDelayedCall();
      player.powerUps.shield = true;

      callback();

      expect(sprite.destroy).not.toHaveBeenCalled();
      expect(player.shieldSprite).toBe(sprite);
    });

    test('裝甲護盾到期時精靈已被移除也不拋錯', () => {
      player.starLevel = 3;
      player.applyPowerUp('STAR');
      const [, callback] = lastDelayedCall();
      player.shieldSprite = null;

      expect(() => callback()).not.toThrow();
    });

    test('已有護盾精靈時裝甲不重複建立', () => {
      player.applyPowerUp('HELMET');
      player.starLevel = 3;
      player.applyPowerUp('STAR');

      expect(mockScene.add.circle).toHaveBeenCalledTimes(1);
    });

    test('連續吃 5 顆星星最多升到 4 級，滿級後不再發出升級事件', () => {
      for (let i = 0; i < 4; i++) {
        player.applyPowerUp('STAR');
      }
      mockScene.events.emit.mockClear();

      player.applyPowerUp('STAR');

      expect(player.starLevel).toBe(4);
      expect(mockScene.events.emit).not.toHaveBeenCalledWith(EVENTS.STAR_UPGRADED, expect.anything());
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.POWERUP_COLLECTED, 'STAR');
    });

    test('升級效果應該累積（永久有效）', () => {
      for (let i = 0; i < 4; i++) {
        player.applyPowerUp('STAR');
      }

      expect(player.speed).toBeCloseTo(TANK_CONFIG.PLAYER_SPEED * 1.3);
      expect(player.bulletDamage).toBe(2);
      expect(player.maxBullets).toBe(3);
    });
  });

  describe('分數與每幀更新', () => {
    test('addScore 應該累加並發出分數事件', () => {
      player.addScore(100);
      player.addScore(250);

      expect(player.score).toBe(350);
      expect(mockScene.events.emit).toHaveBeenLastCalledWith(EVENTS.SCORE_CHANGED, 350);
    });

    test('護盾精靈應該跟隨坦克', () => {
      player.applyPowerUp('HELMET');
      player.x = 150;
      player.y = 160;

      player.update(0, 16);

      expect(player.shieldSprite.setPosition).toHaveBeenCalledWith(150, 160);
    });

    test('坦克不活躍時護盾不跟隨；沒有護盾時不拋錯', () => {
      expect(() => player.update(0, 16)).not.toThrow();

      player.applyPowerUp('HELMET');
      player.active = false;
      player.update(0, 16);

      expect(player.shieldSprite.setPosition).not.toHaveBeenCalled();
    });

    test('摧毀時應該移除護盾', () => {
      player.applyPowerUp('HELMET');
      const sprite = player.shieldSprite;

      player.destroy();

      expect(sprite.destroy).toHaveBeenCalled();
      expect(player.shieldSprite).toBeNull();
      expect(player.powerUps.shield).toBe(false);
    });
  });

  describe('takeDamage - 受傷處理', () => {
    test('受到致命傷害時應該扣一條命並重生', () => {
      player.takeDamage(1);

      expect(player.lives).toBe(2);
      expect(mockScene.respawnPlayer).toHaveBeenCalledTimes(1);
      expect(player.isDestroyed).toBe(true);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.PLAYER_HIT);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.LIVES_CHANGED, 2);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.PLAYER_DESTROYED, false);
      expect(mockScene.createExplosion).toHaveBeenCalledWith(100, 100);
    });

    test('非致命傷害只扣血、閃紅並發出受傷事件', () => {
      player.health = 2;
      player.takeDamage(1);

      expect(player.health).toBe(1);
      expect(player.tintTopLeft).toBe(0xff0000);
      expect(player.lives).toBe(3);
      expect(player.isDestroyed).toBe(false);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.PLAYER_HIT);
      expect(mockScene.respawnPlayer).not.toHaveBeenCalled();
    });

    test('場景缺少重生 / 遊戲結束方法時死亡也不拋錯', () => {
      delete mockScene.respawnPlayer;
      delete mockScene.gameOver;

      expect(() => player.takeDamage(1)).not.toThrow();

      const last = new PlayerTank(mockScene, 0, 0);
      last.isInvincible = false;
      last.lives = 1;
      expect(() => last.takeDamage(1)).not.toThrow();
      expect(last.isDestroyed).toBe(true);
    });

    test('同幀第二次傷害不應該重複觸發死亡（重複死亡防護）', () => {
      // 模擬同一個物理步進中兩顆敵彈先後命中
      player.takeDamage(1);
      player.takeDamage(1);

      // 生命只能扣一次、重生只能觸發一次
      expect(player.lives).toBe(2);
      expect(mockScene.respawnPlayer).toHaveBeenCalledTimes(1);
    });

    test('無敵狀態下不應該受傷', () => {
      player.isInvincible = true;
      player.takeDamage(1);

      expect(player.health).toBe(1);
      expect(player.lives).toBe(3);
    });

    test('護盾狀態下不應該受傷', () => {
      player.powerUps.shield = true;
      player.takeDamage(1);

      expect(player.health).toBe(1);
      expect(player.lives).toBe(3);
    });

    test('最後一條命死亡時應該觸發遊戲結束而非重生', () => {
      player.lives = 1;
      player.takeDamage(1);

      expect(player.lives).toBe(0);
      expect(mockScene.respawnPlayer).not.toHaveBeenCalled();
      expect(mockScene.gameOver).toHaveBeenCalledTimes(1);
      expect(mockScene.events.emit).toHaveBeenCalledWith(EVENTS.PLAYER_DESTROYED, true);
      expect(player.isDestroyed).toBe(true);
    });
  });
});
