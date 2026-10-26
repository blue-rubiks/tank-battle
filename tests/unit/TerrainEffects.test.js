/**
 * 地形效果單元測試（真實實作）
 * 測試水域、冰地、森林的物理與視覺效果
 * 多塊冰地 / 森林聚合判定見 IceTerrain.test.js
 */

import Water from '../../src/entities/Water';
import Ice from '../../src/entities/Ice';
import Forest from '../../src/entities/Forest';
import CollisionSystem from '../../src/systems/CollisionSystem';
import { TANK_CONFIG, DEPTHS } from '../../src/utils/Constants';

const makeMockScene = () => ({
  add: { existing: jest.fn() },
  tweens: { add: jest.fn() }
});

const makeTank = (x = 100, y = 100) => ({
  x,
  y,
  alpha: 1,
  body: { setDrag: jest.fn() },
  setAlpha: jest.fn(function (a) { this.alpha = a; }),
  getBounds() {
    return { x: this.x - 16, y: this.y - 16, width: 32, height: 32 };
  }
});

describe('地形效果', () => {
  let scene;

  beforeEach(() => {
    scene = makeMockScene();
  });

  describe('水域（Water）', () => {
    test('應該加入場景並在坦克下方渲染', () => {
      const water = new Water(scene, 100, 100);

      expect(scene.add.existing).toHaveBeenCalledWith(water);
      expect(water.type).toBe('water');
      expect(water.texture).toBe('water');
      expect(water.depth).toBe(DEPTHS.MAP_LOWER);
    });

    test('應該有無限循環的波浪動畫', () => {
      const water = new Water(scene, 100, 100);

      expect(scene.tweens.add).toHaveBeenCalledWith({
        targets: water,
        alpha: { from: 0.9, to: 1.0 },
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });

    test('子彈應該能穿透水域（不觸發爆炸與傷害）', () => {
      const collision = new CollisionSystem({ createSpark: jest.fn() });
      const water = new Water(scene, 100, 100);
      water.takeDamage = jest.fn();
      const bullet = { active: true, damage: 1, onHit: jest.fn() };

      collision.onBulletWallCollision(bullet, water);

      expect(bullet.onHit).not.toHaveBeenCalled();
      expect(water.takeDamage).not.toHaveBeenCalled();
      expect(collision.scene.createSpark).not.toHaveBeenCalled();
    });
  });

  describe('冰地（Ice）', () => {
    test('應該加入場景並在坦克下方渲染', () => {
      const ice = new Ice(scene, 100, 100);

      expect(scene.add.existing).toHaveBeenCalledWith(ice);
      expect(ice.type).toBe('ice');
      expect(ice.texture).toBe('ice');
      expect(ice.depth).toBe(DEPTHS.MAP_LOWER);
    });

    test('坦克進入冰地時應該降低阻力並標記', () => {
      const ice = new Ice(scene, 100, 100);
      const tank = makeTank();

      ice.onTankEnter(tank);

      expect(tank.body.setDrag).toHaveBeenCalledWith(TANK_CONFIG.ICE_DRAG);
      expect(tank.onIce).toBe(true);
    });

    test('坦克離開冰地時應該恢復一般阻力並清除標記', () => {
      const ice = new Ice(scene, 100, 100);
      const tank = makeTank();
      tank.onIce = true;

      ice.onTankExit(tank);

      expect(tank.body.setDrag).toHaveBeenCalledWith(TANK_CONFIG.NORMAL_DRAG);
      expect(tank.onIce).toBe(false);
    });

    test('沒有物理 body 的物件進出冰地應該被忽略', () => {
      const ice = new Ice(scene, 100, 100);
      const ghost = { body: null };

      ice.onTankEnter(ghost);
      expect(ghost.onIce).toBeUndefined();

      ghost.onIce = true;
      ice.onTankExit(ghost);
      expect(ghost.onIce).toBe(true);
    });

    test('冰地阻力應該明顯低於一般地面', () => {
      expect(TANK_CONFIG.ICE_DRAG).toBeLessThan(TANK_CONFIG.NORMAL_DRAG / 2);
    });
  });

  describe('森林（Forest）', () => {
    test('應該在坦克上方渲染且半透明', () => {
      const forest = new Forest(scene, 100, 100);

      expect(scene.add.existing).toHaveBeenCalledWith(forest);
      expect(forest.type).toBe('forest');
      expect(forest.texture).toBe('forest');
      expect(forest.depth).toBe(DEPTHS.MAP_UPPER);
      expect(forest.depth).toBeGreaterThan(DEPTHS.ENTITY);
      expect(forest.alpha).toBe(0.85);
    });

    test('坦克進入森林時應該被視覺遮蔽', () => {
      const forest = new Forest(scene, 100, 100);
      const tank = makeTank();

      forest.onTankEnter(tank);

      expect(tank.setAlpha).toHaveBeenCalledWith(0.7);
      expect(tank.inForest).toBe(true);
    });

    test('坦克離開森林時應該恢復完整透明度', () => {
      const forest = new Forest(scene, 100, 100);
      const tank = makeTank();
      tank.inForest = true;

      forest.onTankExit(tank);

      expect(tank.setAlpha).toHaveBeenCalledWith(1);
      expect(tank.inForest).toBe(false);
    });

    test('沒有 setAlpha 的物件也能標記進出', () => {
      const forest = new Forest(scene, 100, 100);
      const plain = {};

      forest.onTankEnter(plain);
      expect(plain.inForest).toBe(true);

      forest.onTankExit(plain);
      expect(plain.inForest).toBe(false);
    });
  });

  describe('地形重疊檢測', () => {
    test.each([Ice, Forest])('%p 應該正確檢測坦克是否重疊', (Terrain) => {
      const terrain = new Terrain(scene, 100, 100);

      expect(terrain.isOverlapping(makeTank(110, 110))).toBe(true);
      expect(terrain.isOverlapping(makeTank(100, 131))).toBe(true);
    });

    test.each([Ice, Forest])('%p 不重疊或只貼邊時應該返回 false', (Terrain) => {
      const terrain = new Terrain(scene, 100, 100);

      expect(terrain.isOverlapping(makeTank(200, 200))).toBe(false);
      expect(terrain.isOverlapping(makeTank(132, 100))).toBe(false);
    });
  });
});
