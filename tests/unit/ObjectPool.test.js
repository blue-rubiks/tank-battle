/**
 * ObjectPool 類別單元測試（真實實作）
 */

import ObjectPool from '../../src/utils/ObjectPool';

describe('ObjectPool', () => {
  let pool;
  let factory;

  beforeEach(() => {
    factory = jest.fn(() => ({
      id: Math.random(),
      deactivate: jest.fn()
    }));

    pool = new ObjectPool(factory, 5, 10);
  });

  test('應該建立初始物件', () => {
    expect(factory).toHaveBeenCalledTimes(5);
    expect(pool.pool.length).toBe(5);
  });

  test('應該能從池中取得物件', () => {
    const obj = pool.get();

    expect(obj).toBeDefined();
    expect(pool.active.length).toBe(1);
    expect(pool.pool.length).toBe(4);
  });

  test('應該能歸還物件到池', () => {
    const obj = pool.get();
    pool.release(obj);

    expect(pool.pool.length).toBe(5);
    expect(pool.active.length).toBe(0);
    expect(obj.deactivate).toHaveBeenCalled();
  });

  test('池空時應該建立新物件', () => {
    // 取出所有初始物件
    for (let i = 0; i < 5; i++) {
      pool.get();
    }

    // 再取一個，應該建立新的
    const obj = pool.get();
    expect(factory).toHaveBeenCalledTimes(6);
    expect(obj).toBe(factory.mock.results[5].value);
  });

  test('達到上限時應該重用最舊的物件', () => {
    // 取出所有物件（5 個初始 + 5 個新建 = 10 個最大值）
    const objects = [];
    for (let i = 0; i < 10; i++) {
      objects.push(pool.get());
    }

    // 再取一個，應該重用最舊的
    const obj = pool.get();
    expect(obj).toBe(objects[0]);
    expect(pool.active.length).toBe(10);
  });

  test('應該正確回報統計資訊', () => {
    pool.get();
    pool.get();

    const stats = pool.getStats();
    expect(stats.poolSize).toBe(3);
    expect(stats.activeSize).toBe(2);
    expect(stats.totalSize).toBe(5);
    expect(stats.maxSize).toBe(10);
  });

  test('預設應該建立 10 個初始物件、上限 100', () => {
    const defaultFactory = jest.fn(() => ({}));
    const defaultPool = new ObjectPool(defaultFactory);

    expect(defaultFactory).toHaveBeenCalledTimes(10);
    expect(defaultPool.getStats()).toEqual({
      poolSize: 10,
      activeSize: 0,
      totalSize: 10,
      maxSize: 100
    });
  });

  test('池中有物件時不應該呼叫工廠建立新物件', () => {
    pool.get();

    expect(factory).toHaveBeenCalledTimes(5);
  });

  test('活躍數未達上限前都應該建立新物件，達上限才重用', () => {
    // 初始 5 個用完後，第 6~10 個都要新建
    for (let i = 0; i < 10; i++) {
      pool.get();
    }

    expect(factory).toHaveBeenCalledTimes(10);
    expect(pool.active.length).toBe(10);

    // 第 11 個重用最舊物件，不再新建
    pool.get();
    expect(factory).toHaveBeenCalledTimes(10);
  });

  test('重用的物件應該移到活躍清單尾端', () => {
    const objects = [];
    for (let i = 0; i < 10; i++) {
      objects.push(pool.get());
    }

    const reused = pool.get();

    expect(pool.active[pool.active.length - 1]).toBe(reused);
    expect(pool.active[0]).toBe(objects[1]);
  });

  test('歸還不屬於活躍清單的物件應該被忽略', () => {
    const stranger = { deactivate: jest.fn() };

    pool.release(stranger);

    expect(pool.pool.length).toBe(5);
    expect(pool.active.length).toBe(0);
    expect(stranger.deactivate).not.toHaveBeenCalled();
  });

  test('歸還時只移除該物件', () => {
    const a = pool.get();
    const b = pool.get();

    pool.release(a);

    expect(pool.active).toEqual([b]);
    expect(pool.pool).toContain(a);
  });

  test('沒有 deactivate 的物件也可以歸還', () => {
    const plainPool = new ObjectPool(() => ({}), 1, 2);
    const obj = plainPool.get();

    expect(() => plainPool.release(obj)).not.toThrow();
    expect(plainPool.pool).toContain(obj);
  });

  test('clear 應該摧毀池中與活躍中的所有物件並清空', () => {
    const destroyFactory = jest.fn(() => ({ destroy: jest.fn() }));
    const destroyPool = new ObjectPool(destroyFactory, 2, 5);
    const active = destroyPool.get();
    const idle = destroyPool.pool[0];

    destroyPool.clear();

    expect(active.destroy).toHaveBeenCalledTimes(1);
    expect(idle.destroy).toHaveBeenCalledTimes(1);
    expect(destroyPool.pool).toEqual([]);
    expect(destroyPool.active).toEqual([]);
  });

  test('clear 遇到沒有 destroy 的物件不應該拋錯', () => {
    pool.get();

    expect(() => pool.clear()).not.toThrow();
    expect(pool.getStats().totalSize).toBe(0);
  });
});
