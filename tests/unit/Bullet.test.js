/**
 * Bullet 子彈系統單元測試（真實實作）
 * 出界處理見 BulletBounds.test.js
 */

import Bullet from '../../src/entities/Bullet';
import { BULLET_CONFIG, DEPTHS } from '../../src/utils/Constants';

const makeMockScene = () => ({
  add: { existing: jest.fn() },
  physics: {
    world: {
      bounds: {
        contains: jest.fn(() => true)
      }
    }
  },
  createHitEffect: jest.fn(),
  audioManager: { playSFX: jest.fn() }
});

describe('Bullet - 子彈系統', () => {
  let scene;
  let bullet;

  beforeEach(() => {
    scene = makeMockScene();
    bullet = new Bullet(scene, 10, 20);
  });

  describe('建構 - 預設屬性', () => {
    test('應該只加入顯示（physics body 由群組建立）', () => {
      expect(scene.add.existing).toHaveBeenCalledWith(bullet);
      expect(bullet.texture).toBe('bullet');
    });

    test('應該正確初始化子彈屬性', () => {
      expect(bullet.speed).toBe(BULLET_CONFIG.SPEED);
      expect(bullet.damage).toBe(BULLET_CONFIG.DAMAGE);
      expect(bullet.direction).toBe('up');
      expect(bullet.owner).toBeNull();
      expect(bullet.isPlayerBullet).toBe(false);
      expect(bullet.depth).toBe(DEPTHS.ENTITY);
    });

    test('預設應該是不活躍且不可見（等待物件池取用）', () => {
      expect(bullet.active).toBe(false);
      expect(bullet.visible).toBe(false);
    });
  });

  describe('fire - 發射', () => {
    test('應該設定位置與屬性並啟用', () => {
      const owner = { faction: 'enemy' };
      bullet.fire(300, 400, 'left', 150, 2, owner);

      expect(bullet.x).toBe(300);
      expect(bullet.y).toBe(400);
      expect(bullet.direction).toBe('left');
      expect(bullet.speed).toBe(150);
      expect(bullet.damage).toBe(2);
      expect(bullet.owner).toBe(owner);
      expect(bullet.active).toBe(true);
      expect(bullet.visible).toBe(true);
    });

    test('應該能識別玩家子彈並染成黃色', () => {
      bullet.fire(0, 0, 'up', 200, 1, { faction: 'player' });

      expect(bullet.isPlayerBullet).toBe(true);
      expect(bullet.tintTopLeft).toBe(BULLET_CONFIG.PLAYER_COLOR);
    });

    test('應該能識別敵人子彈並染成紅色', () => {
      bullet.fire(0, 0, 'up', 200, 1, { faction: 'enemy' });

      expect(bullet.isPlayerBullet).toBe(false);
      expect(bullet.tintTopLeft).toBe(BULLET_CONFIG.ENEMY_COLOR);
    });

    test('沒有發射者時應該視為敵人子彈', () => {
      bullet.fire(0, 0, 'up', 200, 1, null);

      expect(bullet.isPlayerBullet).toBe(false);
    });

    test('發射者沒有陣營時應該視為敵人子彈', () => {
      bullet.fire(0, 0, 'up', 200, 1, {});

      expect(bullet.isPlayerBullet).toBe(false);
    });

    test.each([
      ['up', 0, 0, -200],
      ['down', 180, 0, 200],
      ['left', 270, -200, 0],
      ['right', 90, 200, 0]
    ])('往 %s 發射時角度與速度向量應該正確', (direction, angle, vx, vy) => {
      bullet.fire(0, 0, direction, 200, 1, { faction: 'player' });

      expect(bullet.angle).toBe(angle);
      expect(bullet.body.velocity.x).toBe(vx);
      expect(bullet.body.velocity.y).toBe(vy);
    });

    test('應該設定碰撞箱大小', () => {
      bullet.body.setSize = jest.fn();
      bullet.fire(0, 0, 'up', 200, 1, null);

      expect(bullet.body.setSize).toHaveBeenCalledWith(BULLET_CONFIG.SIZE, BULLET_CONFIG.SIZE);
    });

    test('無效方向時不應該設定速度', () => {
      bullet.fire(0, 0, 'diagonal', 200, 1, null);

      expect(bullet.body.velocity.x).toBe(0);
      expect(bullet.body.velocity.y).toBe(0);
    });

    test('沒有 body 時應該發出警告而不拋錯', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      bullet.body = null;

      expect(() => bullet.fire(0, 0, 'up', 200, 1, null)).not.toThrow();
      expect(warn).toHaveBeenCalledWith('Bullet has no body! Make sure it\'s added to bulletGroup first.');
      expect(bullet.active).toBe(true);

      warn.mockRestore();
    });

    test('應該播放射擊音效', () => {
      bullet.fire(0, 0, 'up', 200, 1, null);

      expect(scene.audioManager.playSFX).toHaveBeenCalledWith('shoot');
    });

    test('沒有音效管理器時也可以發射', () => {
      scene.audioManager = null;

      expect(() => bullet.fire(0, 0, 'up', 200, 1, null)).not.toThrow();
    });

    test('音效管理器沒有 playSFX 時也可以發射', () => {
      scene.audioManager = {};

      expect(() => bullet.fire(0, 0, 'up', 200, 1, null)).not.toThrow();
    });
  });

  describe('preUpdate - 邊界檢查', () => {
    test('應該以子彈目前座標檢查世界邊界', () => {
      bullet.fire(123, 456, 'up', 200, 1, null);
      bullet.preUpdate(0, 16);

      expect(scene.physics.world.bounds.contains).toHaveBeenCalledWith(123, 456);
    });

    test('應該先呼叫父類別 preUpdate（維持動畫更新）', () => {
      const parentPreUpdate = jest.spyOn(Object.getPrototypeOf(Bullet.prototype), 'preUpdate');
      bullet.preUpdate(5, 16);

      expect(parentPreUpdate).toHaveBeenCalledWith(5, 16);
      parentPreUpdate.mockRestore();
    });
  });

  describe('onHit - 擊中', () => {
    test('應該在子彈位置建立擊中特效並停用', () => {
      bullet.fire(50, 60, 'up', 200, 1, { faction: 'player' });
      bullet.onHit();

      expect(scene.createHitEffect).toHaveBeenCalledWith(50, 60);
      expect(bullet.active).toBe(false);
      expect(bullet.owner).toBeNull();
    });

    test('場景沒有擊中特效時也應該停用', () => {
      delete scene.createHitEffect;
      bullet.fire(50, 60, 'up', 200, 1, null);

      expect(() => bullet.onHit()).not.toThrow();
      expect(bullet.active).toBe(false);
    });
  });

  describe('deactivate - 回收', () => {
    test('沒有 body 時也可以停用', () => {
      bullet.fire(0, 0, 'up', 200, 1, { faction: 'enemy' });
      bullet.body = null;

      expect(() => bullet.deactivate()).not.toThrow();
      expect(bullet.active).toBe(false);
      expect(bullet.visible).toBe(false);
      expect(bullet.owner).toBeNull();
    });
  });
});
