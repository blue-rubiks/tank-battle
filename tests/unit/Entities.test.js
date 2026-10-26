/**
 * 小型實體單元測試（真實實作）：Base、PowerUp、BrickWall、SteelWall
 * 牆壁與地圖同步見 WallMapSync.test.js
 */

import Base from '../../src/entities/Base';
import PowerUp from '../../src/entities/PowerUp';
import BrickWall from '../../src/entities/BrickWall';
import SteelWall from '../../src/entities/SteelWall';
import { DEPTHS, EVENTS, POWERUP_TYPES } from '../../src/utils/Constants';

const makeMockScene = () => ({
  add: { existing: jest.fn() },
  physics: { add: { existing: jest.fn() } },
  time: { now: 0, delayedCall: jest.fn() },
  tweens: { add: jest.fn(), killTweensOf: jest.fn() },
  events: { emit: jest.fn() },
  createExplosion: jest.fn(),
  gameOver: jest.fn(),
  setMapTileAt: jest.fn()
});

describe('Base - 基地', () => {
  let scene;
  let base;

  beforeEach(() => {
    scene = makeMockScene();
    base = new Base(scene, 400, 800);
  });

  test('應該以靜態物體加入場景並設定碰撞體積', () => {
    expect(scene.add.existing).toHaveBeenCalledWith(base);
    expect(scene.physics.add.existing).toHaveBeenCalledWith(base, true);
    expect(base.texture).toBe('base');
    expect(base.isDestroyed).toBe(false);
    expect(base.depth).toBe(DEPTHS.MAP_UPPER);
  });

  test('碰撞體積應該與顯示大小一致', () => {
    // 在物理系統建立 body 時掛上 spy，觀察建構子中的設定
    const spyScene = makeMockScene();
    spyScene.physics.add.existing = jest.fn((obj) => {
      obj.body.setSize = jest.fn();
    });
    const another = new Base(spyScene, 0, 0);

    expect(another.body.setSize).toHaveBeenCalledWith(another.width, another.height);
  });

  test('一擊即毀：爆炸、發出事件、遊戲結束', () => {
    base.takeDamage(1);

    expect(base.isDestroyed).toBe(true);
    expect(scene.createExplosion).toHaveBeenCalledWith(400, 800);
    expect(scene.events.emit).toHaveBeenCalledWith(EVENTS.BASE_DESTROYED);
    expect(scene.gameOver).toHaveBeenCalledTimes(1);
    expect(base.active).toBe(false);
  });

  test('已摧毀時不重複處理', () => {
    base.takeDamage(1);
    base.takeDamage(1);

    expect(scene.gameOver).toHaveBeenCalledTimes(1);
    expect(scene.events.emit).toHaveBeenCalledTimes(1);
  });

  test('場景缺少爆炸與遊戲結束時也能摧毀', () => {
    delete scene.createExplosion;
    delete scene.gameOver;

    expect(() => base.takeDamage(1)).not.toThrow();
    expect(base.isDestroyed).toBe(true);
  });
});

describe('PowerUp - 道具', () => {
  let scene;

  beforeEach(() => {
    scene = makeMockScene();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each(Object.keys(POWERUP_TYPES))('%s 道具應該套用對應設定', (type) => {
    const powerUp = new PowerUp(scene, 10, 20, type);

    expect(powerUp.powerUpType).toBe(type);
    expect(powerUp.config).toBe(POWERUP_TYPES[type]);
    expect(powerUp.texture).toBe(POWERUP_TYPES[type].texture);
  });

  test('預設類型為 STAR', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const powerUp = new PowerUp(scene, 0, 0);

    expect(powerUp.powerUpType).toBe('STAR');
    expect(error).not.toHaveBeenCalled();
  });

  test('未知類型應該記錄錯誤並退回 STAR（不可當掉）', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const powerUp = new PowerUp(scene, 0, 0, 'GHOST');

    expect(error).toHaveBeenCalledWith('Unknown power-up type: GHOST');
    expect(powerUp.powerUpType).toBe('STAR');
    expect(powerUp.config).toBe(POWERUP_TYPES.STAR);
    expect(powerUp.texture).toBe(POWERUP_TYPES.STAR.texture);
  });

  test('應該加入場景與物理系統並設定深度', () => {
    const powerUp = new PowerUp(scene, 0, 0, 'TANK');

    expect(scene.add.existing).toHaveBeenCalledWith(powerUp);
    expect(scene.physics.add.existing).toHaveBeenCalledWith(powerUp);
    expect(powerUp.depth).toBe(DEPTHS.ENTITY);
  });

  test('應該設定 28×28 碰撞箱並置中', () => {
    scene.physics.add.existing = jest.fn((obj) => {
      obj.body.setSize = jest.fn();
      obj.body.setOffset = jest.fn();
    });

    const powerUp = new PowerUp(scene, 0, 0, 'TANK');

    expect(powerUp.body.setSize).toHaveBeenCalledWith(28, 28);
    expect(powerUp.body.setOffset).toHaveBeenCalledWith(2, 2);
  });

  test('應該持續閃爍', () => {
    const powerUp = new PowerUp(scene, 0, 0, 'TANK');

    expect(scene.tweens.add).toHaveBeenCalledWith({
      targets: powerUp,
      alpha: 0.3,
      duration: 500,
      yoyo: true,
      repeat: -1
    });
  });

  test('15 秒後自動消失', () => {
    const powerUp = new PowerUp(scene, 0, 0, 'TANK');
    const [delay, callback] = scene.time.delayedCall.mock.calls[0];

    expect(delay).toBe(15000);
    callback();

    expect(powerUp.active).toBe(false);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(powerUp);
  });

  test('已被拾取（不活躍）時計時器不再摧毀', () => {
    const powerUp = new PowerUp(scene, 0, 0, 'TANK');
    const destroy = jest.spyOn(powerUp, 'destroy');
    powerUp.active = false;

    scene.time.delayedCall.mock.calls[0][1]();

    expect(destroy).not.toHaveBeenCalled();
  });

  test('摧毀時應該停止 tween；場景已不存在時也不拋錯', () => {
    const powerUp = new PowerUp(scene, 0, 0, 'TANK');
    powerUp.destroy();
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(powerUp);

    const orphan = new PowerUp(scene, 0, 0, 'TANK');
    orphan.scene = null;
    expect(() => orphan.destroy()).not.toThrow();
    expect(orphan.active).toBe(false);

    const noTweens = new PowerUp(scene, 0, 0, 'TANK');
    noTweens.scene = {};
    expect(() => noTweens.destroy()).not.toThrow();
  });
});

describe('BrickWall - 磚牆', () => {
  let scene;

  beforeEach(() => {
    scene = makeMockScene();
  });

  test('應該加入場景（body 交給 staticGroup）並設定屬性', () => {
    const wall = new BrickWall(scene, 10, 20);

    expect(scene.add.existing).toHaveBeenCalledWith(wall);
    expect(scene.physics.add.existing).not.toHaveBeenCalled();
    expect(wall.type).toBe('brick');
    expect(wall.texture).toBe('brick');
    expect(wall.health).toBe(1);
    expect(wall.depth).toBe(DEPTHS.MAP_UPPER);
  });

  test('血量剛好歸零或低於零都會被摧毀', () => {
    const wall = new BrickWall(scene, 10, 20);
    wall.health = 2;
    wall.takeDamage(2);
    expect(wall.active).toBe(false);

    const strong = new BrickWall(scene, 10, 20);
    strong.takeDamage(3);
    expect(strong.active).toBe(false);
  });

  test('受傷但未歸零只扣血', () => {
    const wall = new BrickWall(scene, 10, 20);
    wall.health = 3;
    wall.takeDamage(1);

    expect(wall.health).toBe(2);
    expect(wall.active).toBe(true);
  });

  test('場景已不存在時摧毀不拋錯', () => {
    const wall = new BrickWall(scene, 10, 20);
    wall.scene = null;

    expect(() => wall.destroy()).not.toThrow();
  });
});

describe('SteelWall - 鋼牆', () => {
  let scene;

  beforeEach(() => {
    scene = makeMockScene();
  });

  test('應該加入場景並設定屬性', () => {
    const wall = new SteelWall(scene, 10, 20);

    expect(scene.add.existing).toHaveBeenCalledWith(wall);
    expect(wall.type).toBe('steel');
    expect(wall.texture).toBe('steel');
    expect(wall.depth).toBe(DEPTHS.MAP_UPPER);
  });

  test('傷害大於 2 也能摧毀', () => {
    const wall = new SteelWall(scene, 10, 20);
    wall.takeDamage(3);

    expect(wall.active).toBe(false);
  });

  test('場景已不存在時摧毀不拋錯', () => {
    const wall = new SteelWall(scene, 10, 20);
    wall.scene = null;

    expect(() => wall.destroy()).not.toThrow();
  });
});
