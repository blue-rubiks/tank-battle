/**
 * SaveManager 單元測試
 */

import SaveManager from '../../src/managers/SaveManager';
import { GAME_CONFIG } from '../../src/utils/Constants';

describe('SaveManager', () => {
  let saveManager;
  const SAVE_KEY = 'tank_battle_save_data';

  beforeEach(() => {
    // 清空 localStorage
    localStorage.clear();
    saveManager = new SaveManager();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('初始化與預設值', () => {
    test('應該正確初始化預設資料', () => {
      const data = saveManager.load();

      expect(data.highScore).toBe(0);
      expect(data.currentLevel).toBe(1);
      expect(data.lastClearedLevel).toBe(0);
      expect(data.unlockedLevels).toEqual([1]);
      expect(data.totalEnemiesDestroyed).toBe(0);
      expect(data.gamesPlayed).toBe(0);
      expect(data.settings).toBeDefined();
      expect(data.statistics).toBeDefined();
    });

    test('沒有存檔時應該返回預設值', () => {
      const data = saveManager.load();

      expect(data.highScore).toBe(0);
      expect(data.unlockedLevels).toContain(1);
    });
  });

  describe('儲存與載入', () => {
    test('舊版存檔缺少 unlockedLevels 時補上預設（第 1 關已解鎖）', () => {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ highScore: 500, currentLevel: 2 }));

      const loaded = saveManager.load();

      expect(loaded.highScore).toBe(500);
      expect(loaded.unlockedLevels).toEqual([1]);
    });

    test('應該能成功儲存資料', () => {
      const testData = {
        highScore: 1000,
        currentLevel: 3,
        unlockedLevels: [1, 2, 3],
        totalEnemiesDestroyed: 50,
        gamesPlayed: 5,
        settings: {
          musicVolume: 0.8,
          sfxVolume: 0.9,
          difficulty: 'hard'
        },
        statistics: {
          totalPlayTime: 3600,
          levelsCompleted: 2,
          bulletsShot: 200,
          powerUpsCollected: 10
        }
      };

      const result = saveManager.save(testData);
      expect(result).toBe(true);

      const loaded = saveManager.load();
      expect(loaded.highScore).toBe(1000);
      expect(loaded.currentLevel).toBe(3);
      expect(loaded.unlockedLevels).toEqual([1, 2, 3]);
    });

    test('應該能從 localStorage 載入已存在的資料', () => {
      const testData = {
        highScore: 2000,
        currentLevel: 5,
        unlockedLevels: [1, 2, 3, 4, 5],
        totalEnemiesDestroyed: 100,
        gamesPlayed: 10,
        settings: {
          musicVolume: 0.5,
          sfxVolume: 0.7,
          difficulty: 'normal'
        },
        statistics: {
          totalPlayTime: 7200,
          levelsCompleted: 4,
          bulletsShot: 500,
          powerUpsCollected: 25
        }
      };

      localStorage.setItem(SAVE_KEY, JSON.stringify(testData));

      const loaded = saveManager.load();
      expect(loaded.highScore).toBe(2000);
      expect(loaded.currentLevel).toBe(5);
    });
  });

  describe('最高分管理', () => {
    test('應該能獲取最高分', () => {
      const highScore = saveManager.getHighScore();
      expect(highScore).toBe(0);
    });

    test('應該能更新最高分（新分數更高）', () => {
      const isNewHighScore = saveManager.updateHighScore(5000);

      expect(isNewHighScore).toBe(true);
      expect(saveManager.getHighScore()).toBe(5000);
    });

    test('分數較低時不應更新最高分', () => {
      saveManager.updateHighScore(5000);
      const isNewHighScore = saveManager.updateHighScore(3000);

      expect(isNewHighScore).toBe(false);
      expect(saveManager.getHighScore()).toBe(5000);
    });

    test('分數相同時不應算作新高分', () => {
      saveManager.updateHighScore(5000);
      const isNewHighScore = saveManager.updateHighScore(5000);

      expect(isNewHighScore).toBe(false);
    });
  });

  describe('關卡進度管理', () => {
    test('應該能獲取當前關卡', () => {
      const level = saveManager.getCurrentLevel();
      expect(level).toBe(1);
    });

    test('應該能設定當前關卡', () => {
      saveManager.setCurrentLevel(3);
      expect(saveManager.getCurrentLevel()).toBe(3);
    });

    test('設定關卡後應該持久化', () => {
      saveManager.setCurrentLevel(4);

      const newManager = new SaveManager();
      expect(newManager.getCurrentLevel()).toBe(4);
    });
  });

  describe('關卡解鎖', () => {
    test('第一關預設應該是解鎖的', () => {
      expect(saveManager.isLevelUnlocked(1)).toBe(true);
    });

    test('應該能解鎖新關卡', () => {
      saveManager.unlockLevel(2);
      expect(saveManager.isLevelUnlocked(2)).toBe(true);
    });

    test('應該能解鎖多個關卡', () => {
      saveManager.unlockLevel(2);
      saveManager.unlockLevel(3);
      saveManager.unlockLevel(4);

      expect(saveManager.isLevelUnlocked(2)).toBe(true);
      expect(saveManager.isLevelUnlocked(3)).toBe(true);
      expect(saveManager.isLevelUnlocked(4)).toBe(true);
    });

    test('未解鎖的關卡應該返回 false', () => {
      expect(saveManager.isLevelUnlocked(5)).toBe(false);
    });

    test('重複解鎖同一關卡不應該重複添加', () => {
      saveManager.unlockLevel(2);
      saveManager.unlockLevel(2);
      saveManager.unlockLevel(2);

      const unlockedLevels = saveManager.getUnlockedLevels();
      const level2Count = unlockedLevels.filter(l => l === 2).length;
      expect(level2Count).toBe(1);
    });

    test('應該能獲取所有已解鎖關卡', () => {
      saveManager.unlockLevel(2);
      saveManager.unlockLevel(3);

      const unlockedLevels = saveManager.getUnlockedLevels();
      expect(unlockedLevels).toContain(1);
      expect(unlockedLevels).toContain(2);
      expect(unlockedLevels).toContain(3);
    });

    test('已解鎖關卡應該保持排序', () => {
      saveManager.unlockLevel(4);
      saveManager.unlockLevel(2);
      saveManager.unlockLevel(3);

      const unlockedLevels = saveManager.getUnlockedLevels();
      expect(unlockedLevels).toEqual([1, 2, 3, 4]);
    });
  });

  describe('完成關卡', () => {
    test('完成關卡應該更新統計', () => {
      saveManager.completeLevel(1, 3000);

      const data = saveManager.load();
      expect(data.statistics.levelsCompleted).toBe(1);
    });

    test('完成關卡應該更新最高分（如果更高）', () => {
      saveManager.completeLevel(1, 5000);
      expect(saveManager.getHighScore()).toBe(5000);
    });

    test('完成關卡應該解鎖下一關', () => {
      saveManager.completeLevel(1, 1000);

      expect(saveManager.isLevelUnlocked(2)).toBe(true);
      expect(saveManager.getCurrentLevel()).toBe(2);
    });

    test('完成關卡 2 應該解鎖關卡 3', () => {
      saveManager.completeLevel(2, 2000);

      expect(saveManager.isLevelUnlocked(3)).toBe(true);
      expect(saveManager.getCurrentLevel()).toBe(3);
    });

    test('完成第 5 關不應該嘗試解鎖第 6 關', () => {
      saveManager.completeLevel(5, 10000);

      const unlockedLevels = saveManager.getUnlockedLevels();
      expect(unlockedLevels).not.toContain(6);
      expect(saveManager.getCurrentLevel()).toBe(5);
    });

    test('完成關卡應該記錄最後通關的關卡', () => {
      saveManager.completeLevel(2, 2000);
      expect(saveManager.load().lastClearedLevel).toBe(2);
    });

    test('完成最後一關時，最後通關的關卡就是最後一關（目前關卡仍停在最後一關）', () => {
      saveManager.completeLevel(4, 1000);
      saveManager.completeLevel(5, 1000);

      const data = saveManager.load();
      expect(data.currentLevel).toBe(5);
      expect(data.lastClearedLevel).toBe(5);
    });
  });

  describe('統計資料', () => {
    test('應該能更新敵人擊殺數', () => {
      saveManager.updateStatistics({ enemiesDestroyed: 10 });
      saveManager.updateStatistics({ enemiesDestroyed: 5 });

      const data = saveManager.load();
      expect(data.totalEnemiesDestroyed).toBe(15);
    });

    test('應該能更新子彈發射數', () => {
      saveManager.updateStatistics({ bulletsShot: 50 });
      saveManager.updateStatistics({ bulletsShot: 30 });

      const data = saveManager.load();
      expect(data.statistics.bulletsShot).toBe(80);
    });

    test('應該能更新道具收集數', () => {
      saveManager.updateStatistics({ powerUpsCollected: 3 });
      saveManager.updateStatistics({ powerUpsCollected: 2 });

      const data = saveManager.load();
      expect(data.statistics.powerUpsCollected).toBe(5);
    });

    test('應該能同時更新多個統計', () => {
      saveManager.updateStatistics({
        enemiesDestroyed: 10,
        bulletsShot: 50,
        powerUpsCollected: 5
      });

      const data = saveManager.load();
      expect(data.totalEnemiesDestroyed).toBe(10);
      expect(data.statistics.bulletsShot).toBe(50);
      expect(data.statistics.powerUpsCollected).toBe(5);
    });

    test('應該能獲取統計資料', () => {
      saveManager.updateHighScore(8000);
      saveManager.updateStatistics({
        enemiesDestroyed: 20,
        bulletsShot: 100,
        powerUpsCollected: 10,
        playTime: 95
      });
      saveManager.completeLevel(1, 5000);
      saveManager.recordGameStart();

      const stats = saveManager.getStatistics();

      expect(stats.highScore).toBe(8000);
      expect(stats.totalEnemiesDestroyed).toBe(20);
      expect(stats.gamesPlayed).toBe(1);
      expect(stats.levelsCompleted).toBe(1);
      expect(stats.bulletsShot).toBe(100);
      expect(stats.powerUpsCollected).toBe(10);
      expect(stats.totalPlayTime).toBe(95);
      expect(stats.unlockedLevels).toBe(2); // 第1關完成，解鎖2關
    });
  });

  describe('遊戲紀錄', () => {
    test('應該能記錄遊戲開始次數', () => {
      saveManager.recordGameStart();
      saveManager.recordGameStart();
      saveManager.recordGameStart();

      const data = saveManager.load();
      expect(data.gamesPlayed).toBe(3);
    });
  });

  describe('設定管理', () => {
    test('應該能獲取預設設定', () => {
      const settings = saveManager.getSettings();

      expect(settings.musicVolume).toBe(0.5);
      expect(settings.sfxVolume).toBe(0.7);
      expect(settings.difficulty).toBe('normal');
    });

    test('應該能更新設定', () => {
      saveManager.updateSettings({
        musicVolume: 0.8,
        sfxVolume: 0.9
      });

      const settings = saveManager.getSettings();
      expect(settings.musicVolume).toBe(0.8);
      expect(settings.sfxVolume).toBe(0.9);
      expect(settings.difficulty).toBe('normal'); // 未更新的保持原值
    });

    test('部分更新設定不應該覆蓋其他設定', () => {
      saveManager.updateSettings({ musicVolume: 0.3 });

      const settings = saveManager.getSettings();
      expect(settings.musicVolume).toBe(0.3);
      expect(settings.sfxVolume).toBe(0.7); // 保持預設值
    });
  });

  describe('重置功能', () => {
    test('應該能重置所有存檔', () => {
      // 先設定一些資料
      saveManager.updateHighScore(10000);
      saveManager.completeLevel(3, 5000);
      saveManager.updateStatistics({ enemiesDestroyed: 100 });

      // 重置
      const result = saveManager.reset();
      expect(result).toBe(true);

      // 驗證資料已重置
      const data = saveManager.load();
      expect(data.highScore).toBe(0);
      expect(data.currentLevel).toBe(1);
      expect(data.unlockedLevels).toEqual([1]);
      expect(data.totalEnemiesDestroyed).toBe(0);
    });
  });

  describe('匯出與匯入', () => {
    test('應該能匯出存檔為 JSON', () => {
      saveManager.updateHighScore(5000);
      saveManager.completeLevel(2, 3000);

      const exported = saveManager.exportSave();
      const data = JSON.parse(exported);

      expect(data.highScore).toBe(5000);
      expect(data.currentLevel).toBe(3);
    });

    test('應該能匯入存檔', () => {
      const saveData = {
        highScore: 15000,
        currentLevel: 4,
        unlockedLevels: [1, 2, 3, 4],
        totalEnemiesDestroyed: 200,
        gamesPlayed: 20,
        settings: {
          musicVolume: 0.6,
          sfxVolume: 0.8,
          difficulty: 'hard'
        },
        statistics: {
          totalPlayTime: 10000,
          levelsCompleted: 3,
          bulletsShot: 1000,
          powerUpsCollected: 50
        }
      };

      const result = saveManager.importSave(JSON.stringify(saveData));
      expect(result).toBe(true);

      const loaded = saveManager.load();
      expect(loaded.highScore).toBe(15000);
      expect(loaded.currentLevel).toBe(4);
    });

    test('匯入無效的 JSON 應該返回 false', () => {
      const result = saveManager.importSave('invalid json');
      expect(result).toBe(false);
    });
  });

  describe('錯誤處理', () => {
    test('localStorage 讀取錯誤時應該返回預設值', () => {
      // 模擬 localStorage.getItem 錯誤
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const data = saveManager.load();
      expect(data.highScore).toBe(0);
      expect(data.currentLevel).toBe(1);

      Storage.prototype.getItem.mockRestore();
    });

    test('localStorage 寫入錯誤時應該返回 false', () => {
      // 模擬 localStorage.setItem 錯誤
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });

      const result = saveManager.save({ highScore: 1000 });
      expect(result).toBe(false);

      Storage.prototype.setItem.mockRestore();
    });

    test('載入損壞的 JSON 應該返回預設值', () => {
      localStorage.setItem(SAVE_KEY, 'not valid json{}}');

      const data = saveManager.load();
      expect(data.highScore).toBe(0);
      expect(data.currentLevel).toBe(1);
    });
  });

  describe('資料合併', () => {
    test('舊版存檔應該合併新欄位的預設值', () => {
      // 模擬舊版存檔（缺少某些欄位）
      const oldSaveData = {
        highScore: 3000,
        currentLevel: 2,
        unlockedLevels: [1, 2]
        // 缺少 statistics、settings 等新欄位
      };

      localStorage.setItem(SAVE_KEY, JSON.stringify(oldSaveData));

      const loaded = saveManager.load();

      // 舊資料應該保留
      expect(loaded.highScore).toBe(3000);
      expect(loaded.currentLevel).toBe(2);

      // 新欄位應該使用預設值
      expect(loaded.statistics).toBeDefined();
      expect(loaded.settings).toBeDefined();
      expect(loaded.gamesPlayed).toBe(0);
    });

    test('舊版存檔沒有最後通關紀錄時，以目前關卡的前一關推算', () => {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ currentLevel: 3, unlockedLevels: [1, 2, 3] }));
      expect(saveManager.load().lastClearedLevel).toBe(2);

      localStorage.setItem(SAVE_KEY, JSON.stringify({ highScore: 100 }));
      expect(saveManager.load().lastClearedLevel).toBe(0);
    });

    test('已有最後通關紀錄時以紀錄為準，不再推算', () => {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ currentLevel: 5, lastClearedLevel: 5 }));
      expect(saveManager.load().lastClearedLevel).toBe(5);

      localStorage.setItem(SAVE_KEY, JSON.stringify({ currentLevel: 3, lastClearedLevel: 0 }));
      expect(saveManager.load().lastClearedLevel).toBe(0);
    });
  });

  describe('整合場景', () => {
    test('完整遊戲流程測試', () => {
      // 開始遊戲
      saveManager.recordGameStart();

      // 完成第一關
      saveManager.completeLevel(1, 2000);
      saveManager.updateStatistics({ enemiesDestroyed: 10, bulletsShot: 50 });

      // 完成第二關（更高分數）
      saveManager.completeLevel(2, 3500);
      saveManager.updateStatistics({ enemiesDestroyed: 15, bulletsShot: 60 });

      // 驗證結果
      expect(saveManager.getHighScore()).toBe(3500);
      expect(saveManager.getCurrentLevel()).toBe(3);
      expect(saveManager.isLevelUnlocked(3)).toBe(true);

      const stats = saveManager.getStatistics();
      expect(stats.totalEnemiesDestroyed).toBe(25);
      expect(stats.levelsCompleted).toBe(2);
      expect(stats.bulletsShot).toBe(110);
      expect(stats.gamesPlayed).toBe(1);
    });
  });
});

describe('SaveManager 邊界與錯誤處理', () => {
  const SAVE_KEY = 'tank_battle_save_data';
  let saveManager;
  let consoleError;

  beforeEach(() => {
    localStorage.clear();
    saveManager = new SaveManager();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('沒有存檔時直接回傳預設值（不走錯誤處理）', () => {
    expect(saveManager.load()).toEqual(saveManager.defaultData);
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('存檔損毀時記錄錯誤並回傳預設值', () => {
    localStorage.setItem(SAVE_KEY, '{broken');

    expect(saveManager.load()).toEqual(saveManager.defaultData);
    expect(consoleError).toHaveBeenCalledWith('載入存檔失敗:', expect.any(Error));
  });

  test('儲存失敗時記錄錯誤並回傳 false', () => {
    const circular = {};
    circular.self = circular;

    expect(saveManager.save(circular)).toBe(false);
    expect(consoleError).toHaveBeenCalledWith('儲存失敗:', expect.any(Error));
  });

  test('重置失敗時記錄錯誤並回傳 false', () => {
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(saveManager.reset()).toBe(false);
    expect(consoleError).toHaveBeenCalledWith('重置存檔失敗:', expect.any(Error));
  });

  test('匯入失敗時記錄錯誤', () => {
    expect(saveManager.importSave('not json')).toBe(false);
    expect(consoleError).toHaveBeenCalledWith('匯入存檔失敗:', expect.any(Error));
  });

  test('舊存檔缺少最高分欄位時補上預設 0', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ currentLevel: 2 }));

    expect(saveManager.load().highScore).toBe(0);
  });

  test('最高分為 0 也應該保留（不可當成缺值）', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ highScore: 0 }));

    expect(saveManager.load().highScore).toBe(0);
  });

  test('getUnlockedLevels 在資料缺欄位時回傳 [1]', () => {
    jest.spyOn(saveManager, 'load').mockReturnValue({});

    expect(saveManager.getUnlockedLevels()).toEqual([1]);
  });

  describe('completeLevel', () => {
    test('完成第 4 關應該解鎖並前往第 5 關', () => {
      saveManager.completeLevel(4, 100);

      const data = saveManager.load();
      expect(data.unlockedLevels).toContain(5);
      expect(data.currentLevel).toBe(5);
    });

    test('完成最後一關停留在最後一關', () => {
      const last = GAME_CONFIG.TOTAL_LEVELS;
      saveManager.completeLevel(last, 100);

      const data = saveManager.load();
      expect(data.unlockedLevels).not.toContain(last + 1);
      expect(data.currentLevel).toBe(last);
    });

    test('重複完成同一關不重複解鎖', () => {
      saveManager.completeLevel(1, 100);
      saveManager.completeLevel(1, 100);

      expect(saveManager.load().unlockedLevels).toEqual([1, 2]);
    });

    test('解鎖後應該保持由小到大排序', () => {
      saveManager.unlockLevel(3);
      saveManager.completeLevel(1, 100);

      expect(saveManager.load().unlockedLevels).toEqual([1, 2, 3]);
    });

    test('分數較低時不覆蓋最高分', () => {
      saveManager.updateHighScore(500);
      saveManager.completeLevel(1, 100);

      expect(saveManager.load().highScore).toBe(500);
    });
  });

  test('unlockLevel 應該保持由小到大排序', () => {
    saveManager.unlockLevel(4);
    saveManager.unlockLevel(2);

    expect(saveManager.load().unlockedLevels).toEqual([1, 2, 4]);
  });

  test('updateStatistics 只累加有提供的欄位', () => {
    saveManager.updateStatistics({ bulletsShot: 5 });

    const data = saveManager.load();
    expect(data.statistics.bulletsShot).toBe(5);
    expect(data.totalEnemiesDestroyed).toBe(0);
    expect(data.statistics.powerUpsCollected).toBe(0);
    expect(data.statistics.totalPlayTime).toBe(0);

    saveManager.updateStatistics({ playTime: 40 });
    saveManager.updateStatistics({ playTime: 20 });
    expect(saveManager.load().statistics.totalPlayTime).toBe(60);

    saveManager.updateStatistics({ enemiesDestroyed: 2 });
    saveManager.updateStatistics({ powerUpsCollected: 1 });
    const updated = saveManager.load();
    expect(updated.totalEnemiesDestroyed).toBe(2);
    expect(updated.statistics.powerUpsCollected).toBe(1);
    expect(updated.statistics.bulletsShot).toBe(5);
  });
});

describe('SaveManager 預設值隔離', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('reset 之後應該回到真正的預設值', () => {
    const saveManager = new SaveManager();
    saveManager.completeLevel(1, 100);
    saveManager.updateStatistics({ bulletsShot: 3 });

    saveManager.reset();
    const data = saveManager.load();

    expect(data.unlockedLevels).toEqual([1]);
    expect(data.statistics.levelsCompleted).toBe(0);
    expect(data.statistics.bulletsShot).toBe(0);
    expect(data.currentLevel).toBe(1);
  });

  test('修改 load() 回傳的資料不可影響預設值範本', () => {
    const saveManager = new SaveManager();
    const data = saveManager.load();
    data.unlockedLevels.push(4);
    data.statistics.bulletsShot = 99;
    data.settings.musicVolume = 0;

    const fresh = saveManager.load();

    expect(fresh.unlockedLevels).toEqual([1]);
    expect(fresh.statistics.bulletsShot).toBe(0);
    expect(fresh.settings.musicVolume).toBe(0.5);
  });

  test('存檔損毀時回傳的預設值也是獨立的副本', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('tank_battle_save_data', '{broken');
    const saveManager = new SaveManager();

    saveManager.load().unlockedLevels.push(5);

    expect(saveManager.load().unlockedLevels).toEqual([1]);
    jest.restoreAllMocks();
  });

  test('舊存檔缺少已解鎖關卡時，補上的預設陣列也是獨立的副本', () => {
    localStorage.setItem('tank_battle_save_data', JSON.stringify({ highScore: 5 }));
    const saveManager = new SaveManager();

    saveManager.load().unlockedLevels.push(3);

    expect(saveManager.defaultData.unlockedLevels).toEqual([1]);
  });
});
