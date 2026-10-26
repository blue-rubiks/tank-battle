/**
 * Tank 基礎類別單元測試（真實實作）
 */

import Tank from '../../src/entities/Tank';
import { TANK_CONFIG, DEPTHS } from '../../src/utils/Constants';

const makeMockScene = () => ({
  add: { existing: jest.fn() },
  physics: { add: { existing: jest.fn() } },
  time: { now: 10000, delayedCall: jest.fn() },
  tweens: { add: jest.fn() },
  createBullet: jest.fn(() => ({ id: 'bullet' })),
  createExplosion: jest.fn(),
  bullets: { getChildren: () => [] }
});

/** 取出最後一次 delayedCall 的參數 */
const lastDelayedCall = (scene) => {
  const calls = scene.time.delayedCall.mock.calls;
  return calls[calls.length - 1];
};

describe('Tank', () => {
  let scene;
  let tank;

  beforeEach(() => {
    scene = makeMockScene();
    tank = new Tank(scene, 100, 200, 'tank');
  });

  describe('建構與初始屬性', () => {
    test('應該加入場景顯示與物理系統', () => {
      expect(scene.add.existing).toHaveBeenCalledWith(tank);
      expect(scene.physics.add.existing).toHaveBeenCalledWith(tank);
    });

    test('應該正確初始化坦克屬性', () => {
      expect(tank.x).toBe(100);
      expect(tank.y).toBe(200);
      expect(tank.texture).toBe('tank');
      expect(tank.faction).toBeNull();
      expect(tank.maxHealth).toBe(1);
      expect(tank.health).toBe(1);
      expect(tank.speed).toBe(TANK_CONFIG.PLAYER_SPEED);
      expect(tank.direction).toBe('up');
    });

    test('應該正確初始化武器屬性', () => {
      expect(tank.fireRate).toBe(TANK_CONFIG.PLAYER_FIRE_RATE);
      expect(tank.lastFired).toBe(0);
      expect(tank.maxBullets).toBe(TANK_CONFIG.PLAYER_MAX_BULLETS);
      expect(tank.bulletSpeed).toBe(200);
      expect(tank.bulletDamage).toBe(1);
    });

    test('應該正確初始化狀態旗標與深度', () => {
      expect(tank.isDestroyed).toBe(false);
      expect(tank.isInvincible).toBe(false);
      expect(tank.isFrozen).toBe(false);
      expect(tank.baseTint).toBeNull();
      expect(tank.invincibleUntil).toBe(0);
      expect(tank.frozenUntil).toBe(0);
      expect(tank.depth).toBe(DEPTHS.ENTITY);
    });
  });

  describe('_setupPhysics - 物理設定', () => {
    test('碰撞箱應該比車身再縮 2px 並置中，且不可被推動、無彈性', () => {
      const body = tank.body;
      body.setSize = jest.fn();
      body.setOffset = jest.fn();
      body.setDrag = jest.fn();
      body.setBounce = jest.fn();
      body.pushable = true;
      const collideSpy = jest.spyOn(tank, 'setCollideWorldBounds');

      tank._setupPhysics();

      expect(body.setSize).toHaveBeenCalledWith(26, 26);
      expect(body.setOffset).toHaveBeenCalledWith(3, 3);
      expect(collideSpy).toHaveBeenCalledWith(true);
      expect(body.setDrag).toHaveBeenCalledWith(TANK_CONFIG.NORMAL_DRAG);
      expect(body.pushable).toBe(false);
      expect(body.setBounce).toHaveBeenCalledWith(0);
    });

    test('建構時就應該套用一般地面阻力', () => {
      expect(tank.body.drag.x).toBe(TANK_CONFIG.NORMAL_DRAG);
      expect(tank.body.pushable).toBe(false);
    });
  });

  describe('move - 移動', () => {
    test.each([
      ['up', 0, -120, 0],
      ['down', 0, 120, 180],
      ['left', -120, 0, 270],
      ['right', 120, 0, 90]
    ])('往 %s 移動應該設定速度與角度', (direction, vx, vy, angle) => {
      tank.move(direction);

      expect(tank.body.velocity.x).toBe(vx);
      expect(tank.body.velocity.y).toBe(vy);
      expect(tank.direction).toBe(direction);
      expect(tank.angle).toBe(angle);
    });

    test('速度應該依坦克的 speed 屬性縮放', () => {
      tank.speed = 50;
      tank.move('down');

      expect(tank.body.velocity.y).toBe(50);
    });

    test('無效方向不應該改變速度或方向', () => {
      tank.move('sideways');

      expect(tank.body.velocity.x).toBe(0);
      expect(tank.body.velocity.y).toBe(0);
      expect(tank.direction).toBe('up');
    });

    test('已摧毀時不應該移動', () => {
      tank.isDestroyed = true;
      tank.move('right');

      expect(tank.body.velocity.x).toBe(0);
      expect(tank.direction).toBe('up');
    });

    test('冰凍時不應該移動', () => {
      tank.isFrozen = true;
      tank.move('right');

      expect(tank.body.velocity.x).toBe(0);
      expect(tank.direction).toBe('up');
    });
  });

  describe('face - 原地轉向', () => {
    test('應該只轉向而不改變速度', () => {
      tank.face('left');

      expect(tank.direction).toBe('left');
      expect(tank.angle).toBe(270);
      expect(tank.body.velocity.x).toBe(0);
      expect(tank.body.velocity.y).toBe(0);
    });

    test('往上轉向角度應該為 0（不可被當成無效方向）', () => {
      tank.face('right');
      tank.face('up');

      expect(tank.direction).toBe('up');
      expect(tank.angle).toBe(0);
    });

    test('無效方向應該被忽略', () => {
      tank.face('right');
      tank.face('nowhere');

      expect(tank.direction).toBe('right');
      expect(tank.angle).toBe(90);
    });

    test('已摧毀或冰凍時不應該轉向', () => {
      tank.isDestroyed = true;
      tank.face('down');
      expect(tank.direction).toBe('up');

      tank.isDestroyed = false;
      tank.isFrozen = true;
      tank.face('down');
      expect(tank.direction).toBe('up');
    });
  });

  describe('stop - 停止', () => {
    test('一般地面應該立即歸零速度', () => {
      tank.move('left');
      tank.stop();

      expect(tank.body.velocity.x).toBe(0);
      expect(tank.body.velocity.y).toBe(0);
    });

    test('冰上非強制停止時應該保留速度（滑行）', () => {
      tank.onIce = true;
      tank.move('left');
      tank.stop();

      expect(tank.body.velocity.x).toBe(-120);
    });

    test('冰上強制停止時應該歸零速度', () => {
      tank.onIce = true;
      tank.move('left');
      tank.stop(true);

      expect(tank.body.velocity.x).toBe(0);
    });
  });

  describe('shoot - 射擊', () => {
    test('冷卻完成且子彈未滿時應該建立子彈並回傳', () => {
      const bullet = tank.shoot();

      expect(bullet).toEqual({ id: 'bullet' });
      expect(scene.createBullet).toHaveBeenCalledWith(
        100,
        180,
        'up',
        tank.bulletSpeed,
        tank.bulletDamage,
        tank
      );
      expect(tank.lastFired).toBe(10000);
    });

    test.each([
      ['up', 100, 180],
      ['down', 100, 220],
      ['left', 80, 200],
      ['right', 120, 200]
    ])('往 %s 射擊時子彈應該生成在砲口前 20px', (direction, bx, by) => {
      tank.face(direction);
      tank.shoot();

      const [x, y, dir] = scene.createBullet.mock.calls[0];
      expect(x).toBe(bx);
      expect(y).toBe(by);
      expect(dir).toBe(direction);
    });

    test('應該把子彈速度與傷害傳給場景', () => {
      tank.bulletSpeed = 333;
      tank.bulletDamage = 2;
      tank.shoot();

      const args = scene.createBullet.mock.calls[0];
      expect(args[3]).toBe(333);
      expect(args[4]).toBe(2);
    });

    test('冷卻時間內不應該射擊', () => {
      tank.lastFired = 10000 - 499;

      expect(tank.shoot()).toBeNull();
      expect(scene.createBullet).not.toHaveBeenCalled();
      expect(tank.lastFired).toBe(10000 - 499);
    });

    test('剛好等於冷卻時間時應該可以射擊', () => {
      tank.lastFired = 10000 - 500;

      expect(tank.shoot()).not.toBeNull();
    });

    test('子彈數量達上限時不應該射擊', () => {
      scene.bullets.getChildren = () => [
        { active: true, owner: tank },
        { active: true, owner: tank }
      ];

      expect(tank.shoot()).toBeNull();
      expect(scene.createBullet).not.toHaveBeenCalled();
      expect(tank.lastFired).toBe(0);
    });

    test('子彈未達上限時可以射擊', () => {
      scene.bullets.getChildren = () => [{ active: true, owner: tank }];

      expect(tank.shoot()).not.toBeNull();
    });

    test('只計算自己且仍活躍的子彈', () => {
      const other = {};
      scene.bullets.getChildren = () => [
        { active: true, owner: other },
        { active: true, owner: other },
        { active: false, owner: tank },
        { active: false, owner: tank }
      ];

      expect(tank.shoot()).not.toBeNull();
    });

    test('已摧毀或冰凍時不應該射擊', () => {
      tank.isDestroyed = true;
      expect(tank.shoot()).toBeNull();

      tank.isDestroyed = false;
      tank.isFrozen = true;
      expect(tank.shoot()).toBeNull();

      expect(scene.createBullet).not.toHaveBeenCalled();
    });
  });

  describe('takeDamage - 受傷', () => {
    test('應該扣血並閃紅', () => {
      tank.health = 3;
      tank.takeDamage(1);

      expect(tank.health).toBe(2);
      expect(tank.tintTopLeft).toBe(0xff0000);
      expect(tank.isDestroyed).toBe(false);
    });

    test('閃紅 100ms 後應該恢復顏色', () => {
      tank.health = 3;
      tank.takeDamage(1);

      const [delay, callback] = lastDelayedCall(scene);
      expect(delay).toBe(100);

      callback();
      expect(tank.tintTopLeft).toBeUndefined();
    });

    test('有基礎顏色時閃紅結束後恢復成基礎顏色', () => {
      tank.health = 3;
      tank.baseTint = 0x123456;
      tank.takeDamage(1);
      expect(tank.tintTopLeft).toBe(0xff0000);

      lastDelayedCall(scene)[1]();
      expect(tank.tintTopLeft).toBe(0x123456);
    });

    test('冰凍中受擊，閃紅結束後維持冰凍色', () => {
      tank.health = 3;
      tank.setFrozen(8000);
      tank.takeDamage(1);

      lastDelayedCall(scene)[1]();

      expect(tank.tintTopLeft).toBe(0x00FFFF);
    });

    test('閃紅結束時坦克已不活躍則不處理顏色', () => {
      tank.health = 3;
      tank.takeDamage(1);
      tank.active = false;

      lastDelayedCall(scene)[1]();
      expect(tank.tintTopLeft).toBe(0xff0000);
    });

    test('血量歸零時應該被摧毀', () => {
      tank.takeDamage(1);

      expect(tank.health).toBe(0);
      expect(tank.isDestroyed).toBe(true);
      expect(scene.createExplosion).toHaveBeenCalledWith(100, 200);
    });

    test('血量低於零也應該被摧毀', () => {
      tank.takeDamage(5);

      expect(tank.isDestroyed).toBe(true);
    });

    test('無敵狀態時不應該受傷', () => {
      tank.isInvincible = true;
      tank.takeDamage(1);

      expect(tank.health).toBe(1);
      expect(tank.isDestroyed).toBe(false);
      expect(tank.tintTopLeft).toBeUndefined();
    });

    test('已摧毀時不應該再受傷', () => {
      tank.isDestroyed = true;
      tank.takeDamage(1);

      expect(tank.health).toBe(1);
      expect(scene.time.delayedCall).not.toHaveBeenCalled();
    });
  });

  describe('destroy - 摧毀', () => {
    test('應該標記摧毀、產生爆炸並移除精靈', () => {
      tank.destroy();

      expect(tank.isDestroyed).toBe(true);
      expect(scene.createExplosion).toHaveBeenCalledWith(100, 200);
      expect(tank.active).toBe(false);
    });

    test('重複摧毀只處理一次', () => {
      tank.destroy();
      tank.destroy();

      expect(scene.createExplosion).toHaveBeenCalledTimes(1);
    });

    test('場景沒有爆炸特效時也可以摧毀', () => {
      delete scene.createExplosion;

      expect(() => tank.destroy()).not.toThrow();
      expect(tank.active).toBe(false);
    });
  });

  describe('setInvincible - 無敵', () => {
    test('應該設定無敵並以 tween 閃爍', () => {
      tank.setInvincible(3000);

      expect(tank.isInvincible).toBe(true);
      const config = scene.tweens.add.mock.calls[0][0];
      expect(config.targets).toBe(tank);
      expect(config.alpha).toBe(0.5);
      expect(config.duration).toBe(200);
      expect(config.yoyo).toBe(true);
      expect(config.repeat).toBe(7); // floor(3000 / 400)
    });

    test('閃爍次數應該依持續時間向下取整', () => {
      tank.setInvincible(1000);

      expect(scene.tweens.add.mock.calls[0][0].repeat).toBe(2);
    });

    test('閃爍結束後應該解除無敵並恢復不透明', () => {
      tank.setInvincible(3000);
      tank.setAlpha(0.5);

      scene.tweens.add.mock.calls[0][0].onComplete();

      expect(tank.isInvincible).toBe(false);
      expect(tank.alpha).toBe(1);
    });

    test('多段無敵重疊時，較早結束的閃爍不可提前解除無敵', () => {
      // t=10000 給 3 秒，t=11000 再給 5 秒（例如重生無敵中吃到裝甲星）
      tank.setInvincible(3000);
      scene.time.now = 11000;
      tank.setInvincible(5000);
      const [first, second] = scene.tweens.add.mock.calls.map(c => c[0]);

      first.onComplete();
      expect(tank.isInvincible).toBe(true);

      second.onComplete();
      expect(tank.isInvincible).toBe(false);
    });

    test('後給的無敵較短時，以先前較長的無敵為準', () => {
      tank.setInvincible(10000);
      scene.time.now = 11000;
      tank.setInvincible(1000);
      const [longer, shorter] = scene.tweens.add.mock.calls.map(c => c[0]);

      shorter.onComplete();
      expect(tank.isInvincible).toBe(true);

      longer.onComplete();
      expect(tank.isInvincible).toBe(false);
    });

    test('閃爍結束時坦克已不活躍則保持原狀', () => {
      tank.setInvincible(3000);
      tank.setAlpha(0.5);
      tank.active = false;

      scene.tweens.add.mock.calls[0][0].onComplete();

      expect(tank.isInvincible).toBe(true);
      expect(tank.alpha).toBe(0.5);
    });
  });

  describe('setFrozen - 冰凍', () => {
    test('應該冰凍、強制停止（含冰上）並染成青色', () => {
      tank.onIce = true;
      tank.move('right');

      tank.setFrozen(8000);

      expect(tank.isFrozen).toBe(true);
      expect(tank.body.velocity.x).toBe(0);
      expect(tank.tintTopLeft).toBe(0x00FFFF);
      expect(lastDelayedCall(scene)[0]).toBe(8000);
    });

    test('時間到應該解凍並清除顏色', () => {
      tank.setFrozen(8000);

      lastDelayedCall(scene)[1]();

      expect(tank.isFrozen).toBe(false);
      expect(tank.tintTopLeft).toBeUndefined();
    });

    test('解凍後應該恢復基礎顏色', () => {
      tank.baseTint = 0x654321;
      tank.setFrozen(8000);

      lastDelayedCall(scene)[1]();

      expect(tank.tintTopLeft).toBe(0x654321);
    });

    test('冰凍期間再次冰凍時，以較晚的結束時間為準', () => {
      tank.setFrozen(8000);
      const [, first] = lastDelayedCall(scene);
      scene.time.now += 5000;
      tank.setFrozen(8000);
      const [, second] = lastDelayedCall(scene);

      first();
      expect(tank.isFrozen).toBe(true);
      expect(tank.tintTopLeft).toBe(0x00FFFF);

      second();
      expect(tank.isFrozen).toBe(false);
    });

    test('時間到時坦克已不活躍則保持冰凍', () => {
      tank.setFrozen(8000);
      tank.active = false;

      lastDelayedCall(scene)[1]();

      expect(tank.isFrozen).toBe(true);
      expect(tank.tintTopLeft).toBe(0x00FFFF);
    });
  });

  test('update 預設為空實作', () => {
    expect(() => tank.update(0, 16)).not.toThrow();
  });
});
