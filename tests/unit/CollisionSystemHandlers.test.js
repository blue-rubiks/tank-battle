/**
 * CollisionSystem 群組建立、碰撞規則註冊與碰撞處理器測試（真實實作）
 * 陣營過濾與子彈互撞規則見 CollisionSystem.test.js
 */

import CollisionSystem from '../../src/systems/CollisionSystem';

const makeGroup = (name) => ({ name, add: jest.fn(), clear: jest.fn() });

const makeScene = () => ({
  physics: {
    add: {
      group: jest.fn(),
      staticGroup: jest.fn(),
      collider: jest.fn(),
      overlap: jest.fn()
    }
  },
  cameras: { main: { shake: jest.fn() } },
  createSpark: jest.fn(),
  createHitEffect: jest.fn(),
  createCollectEffect: jest.fn(),
  showPowerUpMessage: jest.fn(),
  audioManager: { playSFX: jest.fn() },
  recordStat: jest.fn(),
  player: null
});

const makeBullet = (overrides = {}) => ({
  active: true,
  x: 10,
  y: 20,
  damage: 1,
  isPlayerBullet: false,
  onHit: jest.fn(),
  ...overrides
});

describe('CollisionSystem - 群組與規則', () => {
  let scene;
  let collision;

  beforeEach(() => {
    scene = makeScene();
    const dynamicGroups = ['player', 'enemy', 'bullet', 'powerUp'].map(makeGroup);
    const staticGroups = ['wall', 'base'].map(makeGroup);
    scene.physics.add.group.mockImplementation(() => dynamicGroups.shift());
    scene.physics.add.staticGroup.mockImplementation(() => staticGroups.shift());
    collision = new CollisionSystem(scene);
  });

  test('建構時群組尚未建立', () => {
    expect(collision.scene).toBe(scene);
    expect(collision.playerGroup).toBeNull();
    expect(collision.enemyGroup).toBeNull();
    expect(collision.bulletGroup).toBeNull();
    expect(collision.wallGroup).toBeNull();
    expect(collision.powerUpGroup).toBeNull();
    expect(collision.baseGroup).toBeNull();
  });

  test('init 應該建立動態與靜態群組', () => {
    collision.init();

    expect(collision.playerGroup.name).toBe('player');
    expect(collision.enemyGroup.name).toBe('enemy');
    expect(collision.bulletGroup.name).toBe('bullet');
    expect(collision.powerUpGroup.name).toBe('powerUp');
    // 牆壁與基地用靜態群組（才會建立靜態 body）
    expect(collision.wallGroup.name).toBe('wall');
    expect(collision.baseGroup.name).toBe('base');
  });

  test('應該註冊坦克的實體碰撞規則（敵人之間不互撞）', () => {
    collision.init();
    const c = collision;

    expect(scene.physics.add.collider.mock.calls).toEqual([
      [c.playerGroup, c.wallGroup, c.onTankWallCollision, null, c],
      [c.enemyGroup, c.wallGroup, c.onTankWallCollision, null, c],
      [c.playerGroup, c.enemyGroup, c.onTankTankCollision, null, c],
      [c.playerGroup, c.baseGroup],
      [c.enemyGroup, c.baseGroup, c.onTankWallCollision, null, c]
    ]);
  });

  test('應該註冊子彈與道具的重疊規則', () => {
    collision.init();
    const c = collision;

    expect(scene.physics.add.overlap.mock.calls).toEqual([
      [c.bulletGroup, c.wallGroup, c.onBulletWallCollision, null, c],
      [c.bulletGroup, c.playerGroup, c.onBulletTankCollision, c.bulletTankFilter, c],
      [c.bulletGroup, c.enemyGroup, c.onBulletTankCollision, c.bulletTankFilter, c],
      [c.bulletGroup, c.bulletGroup, c.onBulletBulletCollision, null, c],
      [c.bulletGroup, c.baseGroup, c.onBulletBaseCollision, null, c],
      [c.playerGroup, c.powerUpGroup, c.onPlayerPowerUpCollision, null, c]
    ]);
  });

  describe('加入物件', () => {
    beforeEach(() => {
      collision.init();
    });

    test('玩家與敵人加入後應該啟用世界邊界碰撞', () => {
      const player = { body: { setCollideWorldBounds: jest.fn() } };
      const enemy = { body: { setCollideWorldBounds: jest.fn() } };

      collision.addPlayer(player);
      collision.addEnemy(enemy);

      expect(collision.playerGroup.add).toHaveBeenCalledWith(player);
      expect(player.body.setCollideWorldBounds).toHaveBeenCalledWith(true);
      expect(collision.enemyGroup.add).toHaveBeenCalledWith(enemy);
      expect(enemy.body.setCollideWorldBounds).toHaveBeenCalledWith(true);
    });

    test('沒有 body 的坦克也能加入', () => {
      expect(() => {
        collision.addPlayer({});
        collision.addEnemy({});
      }).not.toThrow();
    });

    test('其他物件應該加入對應群組', () => {
      const bullet = {};
      const wall = {};
      const powerUp = {};
      const base = {};

      collision.addBullet(bullet);
      collision.addWall(wall);
      collision.addPowerUp(powerUp);
      collision.addBase(base);

      expect(collision.bulletGroup.add).toHaveBeenCalledWith(bullet);
      expect(collision.wallGroup.add).toHaveBeenCalledWith(wall);
      expect(collision.powerUpGroup.add).toHaveBeenCalledWith(powerUp);
      expect(collision.baseGroup.add).toHaveBeenCalledWith(base);
    });

    test('clear 應該清除並摧毀所有群組成員', () => {
      collision.clear();

      ['playerGroup', 'enemyGroup', 'bulletGroup', 'wallGroup', 'powerUpGroup', 'baseGroup']
        .forEach(key => {
          expect(collision[key].clear).toHaveBeenCalledWith(true, true);
        });
    });
  });

  test('尚未 init 時 clear 不應該拋錯', () => {
    expect(() => collision.clear()).not.toThrow();
  });
});

describe('CollisionSystem - 碰撞處理器', () => {
  let scene;
  let collision;

  beforeEach(() => {
    scene = makeScene();
    collision = new CollisionSystem(scene);
  });

  describe('坦克碰撞', () => {
    test('坦克撞牆時通知 AI 換向', () => {
      const tank = { aiController: { onWallHit: jest.fn() } };

      collision.onTankWallCollision(tank, { type: 'brick' });
      collision.onTankWallCollision(tank, { type: 'water' });

      expect(tank.aiController.onWallHit).toHaveBeenCalledTimes(2);
    });

    test('沒有 AI 的坦克（玩家）撞牆不處理', () => {
      expect(() => collision.onTankWallCollision({}, { type: 'brick' })).not.toThrow();
    });

    test('坦克互撞時通知雙方 AI', () => {
      const a = { aiController: { onTankHit: jest.fn() } };
      const b = { aiController: { onTankHit: jest.fn() } };

      collision.onTankTankCollision(a, b);

      expect(a.aiController.onTankHit).toHaveBeenCalledTimes(1);
      expect(b.aiController.onTankHit).toHaveBeenCalledTimes(1);
    });

    test('只有一方有 AI 時只通知該方', () => {
      const enemy = { aiController: { onTankHit: jest.fn() } };

      collision.onTankTankCollision({}, enemy);
      collision.onTankTankCollision(enemy, {});

      expect(enemy.aiController.onTankHit).toHaveBeenCalledTimes(2);
    });
  });

  describe('onBulletWallCollision', () => {
    test('應該在子彈位置產生火花、傷害牆壁並回收子彈', () => {
      const bullet = makeBullet({ damage: 2 });
      const wall = { type: 'steel', takeDamage: jest.fn() };

      collision.onBulletWallCollision(bullet, wall);

      expect(scene.createSpark).toHaveBeenCalledWith(10, 20);
      expect(wall.takeDamage).toHaveBeenCalledWith(2);
      expect(bullet.onHit).toHaveBeenCalledTimes(1);
    });

    test('牆壁不可破壞或場景沒有火花時仍回收子彈', () => {
      delete scene.createSpark;
      const bullet = makeBullet();

      collision.onBulletWallCollision(bullet, { type: 'steel' });

      expect(bullet.onHit).toHaveBeenCalledTimes(1);
    });
  });

  describe('onBulletTankCollision', () => {
    test('應該讓坦克受傷、產生擊中特效並回收子彈', () => {
      const bullet = makeBullet({ damage: 2 });
      const tank = { x: 100, y: 200, takeDamage: jest.fn() };

      collision.onBulletTankCollision(bullet, tank);

      expect(tank.takeDamage).toHaveBeenCalledWith(2);
      expect(scene.createHitEffect).toHaveBeenCalledWith(100, 200);
      expect(bullet.onHit).toHaveBeenCalledTimes(1);
      expect(scene.cameras.main.shake).not.toHaveBeenCalled();
    });

    test('玩家被擊中時應該震動鏡頭', () => {
      const player = { x: 0, y: 0, takeDamage: jest.fn() };
      scene.player = player;

      collision.onBulletTankCollision(makeBullet(), player);

      expect(scene.cameras.main.shake).toHaveBeenCalledWith(200, 0.01);
    });

    test('非活躍子彈不處理', () => {
      const bullet = makeBullet({ active: false });
      const tank = { takeDamage: jest.fn() };

      collision.onBulletTankCollision(bullet, tank);

      expect(tank.takeDamage).not.toHaveBeenCalled();
      expect(bullet.onHit).not.toHaveBeenCalled();
    });

    test('場景沒有擊中特效時仍處理傷害', () => {
      delete scene.createHitEffect;
      const tank = { takeDamage: jest.fn() };
      const bullet = makeBullet();

      collision.onBulletTankCollision(bullet, tank);

      expect(tank.takeDamage).toHaveBeenCalled();
      expect(bullet.onHit).toHaveBeenCalled();
    });
  });

  describe('onBulletBulletCollision', () => {
    test('互相抵銷時在兩彈中點產生火花', () => {
      const a = makeBullet({ isPlayerBullet: true, x: 10, y: 20 });
      const b = makeBullet({ isPlayerBullet: false, x: 30, y: 60 });

      collision.onBulletBulletCollision(a, b);

      expect(a.onHit).toHaveBeenCalled();
      expect(b.onHit).toHaveBeenCalled();
      expect(scene.createSpark).toHaveBeenCalledWith(20, 40);
    });

    test('敵人子彈撞玩家子彈（順序相反）也抵銷', () => {
      const a = makeBullet({ isPlayerBullet: false });
      const b = makeBullet({ isPlayerBullet: true });

      collision.onBulletBulletCollision(a, b);

      expect(a.onHit).toHaveBeenCalled();
      expect(b.onHit).toHaveBeenCalled();
    });

    test('同一顆子彈或任一顆不活躍時不處理', () => {
      const a = makeBullet({ isPlayerBullet: true });
      const b = makeBullet({ isPlayerBullet: false, active: false });

      collision.onBulletBulletCollision(a, a);
      collision.onBulletBulletCollision(a, b);
      collision.onBulletBulletCollision(b, a);

      expect(a.onHit).not.toHaveBeenCalled();
      expect(b.onHit).not.toHaveBeenCalled();
      expect(scene.createSpark).not.toHaveBeenCalled();
    });

    test('場景沒有火花特效時仍抵銷', () => {
      delete scene.createSpark;
      const a = makeBullet({ isPlayerBullet: true });
      const b = makeBullet({ isPlayerBullet: false });

      expect(() => collision.onBulletBulletCollision(a, b)).not.toThrow();
      expect(a.onHit).toHaveBeenCalled();
    });
  });

  describe('onBulletBaseCollision', () => {
    test('應該回收子彈並摧毀基地', () => {
      const bullet = makeBullet({ damage: 3 });
      const base = { takeDamage: jest.fn() };

      collision.onBulletBaseCollision(bullet, base);

      expect(bullet.onHit).toHaveBeenCalledTimes(1);
      expect(base.takeDamage).toHaveBeenCalledWith(3);
    });

    test('非活躍子彈不處理；基地沒有 takeDamage 也不拋錯', () => {
      const base = { takeDamage: jest.fn() };
      const inactive = makeBullet({ active: false });

      collision.onBulletBaseCollision(inactive, base);
      expect(base.takeDamage).not.toHaveBeenCalled();
      expect(inactive.onHit).not.toHaveBeenCalled();

      expect(() => collision.onBulletBaseCollision(makeBullet(), {})).not.toThrow();
    });
  });

  describe('onPlayerPowerUpCollision', () => {
    const makePowerUp = (overrides = {}) => ({
      active: true,
      x: 5,
      y: 6,
      powerUpType: 'STAR',
      destroy: jest.fn(),
      ...overrides
    });

    test('應該顯示訊息、套用效果、播放音效、產生特效並移除道具', () => {
      const player = { active: true, applyPowerUp: jest.fn() };
      const powerUp = makePowerUp();

      collision.onPlayerPowerUpCollision(player, powerUp);

      expect(scene.showPowerUpMessage).toHaveBeenCalledWith('STAR');
      expect(player.applyPowerUp).toHaveBeenCalledWith('STAR');
      expect(scene.audioManager.playSFX).toHaveBeenCalledWith('powerup', 0.7);
      expect(scene.createCollectEffect).toHaveBeenCalledWith(5, 6);
      expect(scene.recordStat).toHaveBeenCalledWith('powerUpsCollected');
      expect(powerUp.destroy).toHaveBeenCalledTimes(1);
    });

    test('應該先套用效果再顯示訊息（訊息要反映升級後的狀態）', () => {
      const order = [];
      scene.showPowerUpMessage.mockImplementation(() => order.push('message'));
      const player = { active: true, applyPowerUp: jest.fn(() => order.push('apply')) };

      collision.onPlayerPowerUpCollision(player, makePowerUp());

      expect(order).toEqual(['apply', 'message']);
    });

    test('玩家或道具不活躍時不處理', () => {
      const player = { active: true, applyPowerUp: jest.fn() };
      const inactivePowerUp = makePowerUp({ active: false });

      collision.onPlayerPowerUpCollision(player, inactivePowerUp);
      collision.onPlayerPowerUpCollision({ active: false, applyPowerUp: jest.fn() }, makePowerUp());

      expect(player.applyPowerUp).not.toHaveBeenCalled();
      expect(inactivePowerUp.destroy).not.toHaveBeenCalled();
      expect(scene.showPowerUpMessage).not.toHaveBeenCalled();
      expect(scene.recordStat).not.toHaveBeenCalled();
    });

    test('場景缺少選用功能時仍移除道具', () => {
      delete scene.showPowerUpMessage;
      delete scene.createCollectEffect;
      delete scene.recordStat;
      scene.audioManager = {};
      const powerUp = makePowerUp();

      collision.onPlayerPowerUpCollision({ active: true }, powerUp);
      expect(powerUp.destroy).toHaveBeenCalled();

      scene.audioManager = null;
      const another = makePowerUp();
      collision.onPlayerPowerUpCollision({ active: true }, another);
      expect(another.destroy).toHaveBeenCalled();
    });
  });
});
