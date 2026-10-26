/**
 * 選單 / 暫停 / 結算 / 載入場景的非繪圖邏輯測試（真實實作）
 * 畫面繪製（create / draw*）依賴 Phaser 渲染，不在單元測試範圍
 */

import BootScene from '../../src/scenes/BootScene';
import PreloadScene from '../../src/scenes/PreloadScene';
import MenuScene from '../../src/scenes/MenuScene';
import PauseScene from '../../src/scenes/PauseScene';
import GameOverScene from '../../src/scenes/GameOverScene';
import LevelCompleteScene from '../../src/scenes/LevelCompleteScene';
import SoundGenerator from '../../src/utils/SoundGenerator';
import SaveManager from '../../src/managers/SaveManager';
import { SCENES, GAME_CONFIG } from '../../src/utils/Constants';

const makeScenePlugin = () => ({
  start: jest.fn(),
  stop: jest.fn(),
  resume: jest.fn()
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * 記錄 add.text 文字內容的繪圖替身（其餘繪圖呼叫一律回傳可鏈式的空物件）
 */
const makeDrawingStub = (scene) => {
  const texts = [];
  const chain = () => new Proxy({}, {
    get: (_, prop) => (prop === 'then' ? undefined : () => chain())
  });
  scene.add = {
    graphics: () => chain(),
    text: (x, y, content) => {
      texts.push(content);
      return chain();
    }
  };
  scene.tweens = { add: jest.fn() };
  return texts;
};

/** 關卡總數的顯示格式，例如 "03 / 05" */
const stageOfTotal = (level) =>
  `${String(level).padStart(2, '0')} / ${String(GAME_CONFIG.TOTAL_LEVELS).padStart(2, '0')}`;

describe('場景鍵值', () => {
  test.each([
    [BootScene, SCENES.BOOT],
    [PreloadScene, SCENES.PRELOAD],
    [MenuScene, SCENES.MENU],
    [PauseScene, SCENES.PAUSE],
    [GameOverScene, SCENES.GAME_OVER],
    [LevelCompleteScene, SCENES.LEVEL_COMPLETE]
  ])('%p 應該註冊為 %s', (SceneClass, key) => {
    expect(new SceneClass().sceneConfig).toEqual({ key });
  });
});

describe('BootScene', () => {
  let scene;
  const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');

  const setFonts = (fonts) => {
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
  };

  beforeEach(() => {
    scene = new BootScene();
    scene.scene = makeScenePlugin();
  });

  afterEach(() => {
    if (originalFonts) {
      Object.defineProperty(document, 'fonts', originalFonts);
    } else {
      delete document.fonts;
    }
  });

  test('preload 與全域設定目前為空實作', () => {
    expect(() => {
      scene.preload();
      scene.setupGlobalSettings();
    }).not.toThrow();
  });

  test('等待字型後切換到預載場景', async () => {
    const order = [];
    jest.spyOn(scene, 'setupGlobalSettings').mockImplementation(() => order.push('settings'));
    jest.spyOn(scene, 'waitForFonts').mockImplementation(async () => order.push('fonts'));
    scene.scene.start.mockImplementation(() => order.push('start'));

    await scene.create();

    expect(order).toEqual(['settings', 'fonts', 'start']);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.PRELOAD);
  });

  test('瀏覽器不支援 FontFace API 時直接略過（不當成載入失敗）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    setFonts(undefined);
    await expect(scene.waitForFonts()).resolves.toBeUndefined();

    setFonts({});
    await expect(scene.waitForFonts()).resolves.toBeUndefined();

    expect(warn).not.toHaveBeenCalled();
  });

  test('應該載入英文與繁中像素字型並等待 ready', async () => {
    let readyAwaited = false;
    const fonts = {
      load: jest.fn(() => Promise.resolve()),
      get ready() {
        readyAwaited = true;
        return Promise.resolve();
      }
    };
    setFonts(fonts);

    await scene.waitForFonts();

    expect(fonts.load.mock.calls).toEqual([
      ['16px "Press Start 2P"'],
      ['16px "Cubic 11"'],
      ['16px "Cubic 11"', '坦克大戰']
    ]);
    expect(readyAwaited).toBe(true);
  });

  test('字型載入失敗時只警告不中斷', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('offline');
    setFonts({ load: jest.fn(() => Promise.reject(error)), ready: Promise.resolve() });

    await expect(scene.waitForFonts()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('字型載入失敗，將使用 fallback：', error);
  });
});

describe('PreloadScene', () => {
  let scene;

  beforeEach(() => {
    scene = new PreloadScene();
    scene.scene = makeScenePlugin();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('preload 應該建立進度條、載入資源並監聽載入事件', () => {
    const createLoadingBar = jest.spyOn(scene, 'createLoadingBar').mockImplementation(() => {});
    const loadAssets = jest.spyOn(scene, 'loadAssets').mockImplementation(() => {});
    scene.load = { on: jest.fn() };

    scene.preload();

    expect(createLoadingBar).toHaveBeenCalled();
    expect(loadAssets).toHaveBeenCalled();
    expect(scene.load.on).toHaveBeenCalledWith('progress', scene.onLoadProgress, scene);
    expect(scene.load.on).toHaveBeenCalledWith('complete', scene.onLoadComplete, scene);
  });

  test('應該載入所有關卡 JSON（共 TOTAL_LEVELS 關）', () => {
    scene.load = { json: jest.fn() };

    scene.loadLevelData();

    expect(GAME_CONFIG.TOTAL_LEVELS).toBe(5);
    expect(scene.load.json.mock.calls).toEqual([
      ['level_1', 'data/level_1.json'],
      ['level_2', 'data/level_2.json'],
      ['level_3', 'data/level_3.json'],
      ['level_4', 'data/level_4.json'],
      ['level_5', 'data/level_5.json']
    ]);
  });

  test('應該產生復古音效', () => {
    const generate = jest.spyOn(SoundGenerator, 'generateAllSounds').mockReturnValue({});

    scene.generateRetroSounds();

    expect(generate).toHaveBeenCalledWith(scene);
  });

  test('音效產生失敗時只警告，遊戲仍可繼續', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('no audio');
    jest.spyOn(SoundGenerator, 'generateAllSounds').mockImplementation(() => { throw error; });

    expect(() => scene.generateRetroSounds()).not.toThrow();
    expect(warn).toHaveBeenCalledWith('音效生成失敗:', error);
  });

  test('載入進度應該更新百分比與進度條寬度', () => {
    scene.percentText = { setText: jest.fn() };
    scene.progressBar = { clear: jest.fn(), fillStyle: jest.fn(), fillRect: jest.fn() };
    scene.progressBarX = 10;
    scene.progressBarY = 20;
    scene.progressBarWidth = 300;
    scene.progressBarHeight = 30;

    scene.onLoadProgress(0.456);

    expect(scene.percentText.setText).toHaveBeenCalledWith('45%');
    expect(scene.progressBar.clear).toHaveBeenCalled();
    expect(scene.progressBar.fillStyle).toHaveBeenCalledWith(0xffffff, 1);
    expect(scene.progressBar.fillRect).toHaveBeenCalledWith(10, 20, 300 * 0.456, 30);
  });

  test('載入完成應該移除載入畫面元件', () => {
    scene.progressBar = { destroy: jest.fn() };
    scene.loadingText = { destroy: jest.fn() };
    scene.percentText = { destroy: jest.fn() };

    scene.onLoadComplete();

    expect(scene.progressBar.destroy).toHaveBeenCalled();
    expect(scene.loadingText.destroy).toHaveBeenCalled();
    expect(scene.percentText.destroy).toHaveBeenCalled();
  });

  test('create 應該切換到主選單', () => {
    scene.create();

    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });
});

describe('MenuScene', () => {
  let scene;

  beforeEach(() => {
    scene = new MenuScene();
    scene.scene = makeScenePlugin();
  });

  test.each([
    [0, 'ROOKIE'],
    [4999, 'ROOKIE'],
    [5000, 'CADET'],
    [19999, 'CADET'],
    [20000, 'SCOUT'],
    [49999, 'SCOUT'],
    [50000, 'VETERAN'],
    [99999, 'VETERAN'],
    [100000, 'ACE']
  ])('最高分 %i 的稱號為 %s', (highScore, rank) => {
    expect(scene.deriveRank(highScore)).toBe(rank);
  });

  test('startGame 應該帶關卡進入遊戲', () => {
    scene.startGame(3);

    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 3 });
  });
});

describe('PauseScene', () => {
  let scene;

  beforeEach(() => {
    scene = new PauseScene();
    scene.scene = makeScenePlugin();
  });

  describe('captureStats', () => {
    test('沒有遊戲場景時回傳預設值', () => {
      expect(scene.captureStats(null)).toEqual({
        level: 1,
        score: 0,
        enemiesRemaining: 0,
        enemiesTotal: 0,
        elapsed: 0
      });
    });

    test('應該擷取遊戲場景當下的戰況', () => {
      const gameScene = {
        gameState: { level: 3, score: 1200, enemiesRemaining: 7 },
        totalEnemyCount: 20,
        playTime: 60000
      };

      expect(scene.captureStats(gameScene)).toEqual({
        level: 3,
        score: 1200,
        enemiesRemaining: 7,
        enemiesTotal: 20,
        elapsed: 60000
      });
    });

    test('經過時間取遊玩時間（不含暫停）', () => {
      const gameScene = { gameState: {}, playTime: 5000, time: { now: 999999 } };

      expect(scene.captureStats(gameScene).elapsed).toBe(5000);
    });

    test('缺少遊玩時間時經過時間為 0', () => {
      expect(scene.captureStats({ gameState: {}, time: { now: 5000 } }).elapsed).toBe(0);
    });

    test('沒有 gameState 時使用預設值', () => {
      expect(scene.captureStats({ totalEnemyCount: 5 })).toMatchObject({
        level: 1,
        score: 0,
        enemiesRemaining: 0,
        enemiesTotal: 5
      });
    });
  });

  test('繼續遊戲：恢復遊戲場景並關閉暫停', () => {
    scene.resumeGame();

    expect(scene.scene.resume).toHaveBeenCalledWith(SCENES.GAME);
    expect(scene.scene.stop).toHaveBeenCalledWith();
  });

  test('重新開始：以目前關卡重開遊戲', () => {
    scene.restartGame({ currentLevel: 4 });

    expect(scene.scene.stop).toHaveBeenCalledWith(SCENES.GAME);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 4 });
  });

  test('重新開始：沒有遊戲場景時從第 1 關開始', () => {
    scene.restartGame(null);

    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 1 });
  });

  test('返回主選單：停止遊戲場景', () => {
    scene.backToMenu();

    expect(scene.scene.stop).toHaveBeenCalledWith(SCENES.GAME);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });

  test('戰況面板的關卡進度應該以實際關卡總數顯示', () => {
    const texts = makeDrawingStub(scene);

    scene.drawBreakdown(0, 0, 400, { level: 3, score: 1200, enemiesRemaining: 4, enemiesTotal: 10, elapsed: 61000 });

    expect(texts).toContain(stageOfTotal(3));
    expect(texts).toContain('1,200');
    expect(texts).toContain('4 / 10');
    expect(texts).toContain('01:01');
  });
});

describe('GameOverScene', () => {
  let scene;

  beforeEach(() => {
    scene = new GameOverScene();
    scene.scene = makeScenePlugin();
  });

  test('init 應該保存結算資料', () => {
    scene.init({ score: 900, level: 2, isNewHighScore: true });

    expect(scene.finalScore).toBe(900);
    expect(scene.level).toBe(2);
    expect(scene.isNewHighScore).toBe(true);
  });

  test('init 缺值時使用預設值', () => {
    scene.init({});

    expect(scene.finalScore).toBe(0);
    expect(scene.level).toBe(1);
    expect(scene.isNewHighScore).toBe(false);
  });

  test('重新開始從第 1 關開始，且只觸發一次', () => {
    scene.restart();
    scene.restart();
    scene.backToMenu();

    expect(scene.scene.start).toHaveBeenCalledTimes(1);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 1 });
  });

  test('返回主選單只觸發一次', () => {
    scene.backToMenu();
    scene.backToMenu();
    scene.restart();

    expect(scene.scene.start).toHaveBeenCalledTimes(1);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });

  test('場景再次進入時應該可以再導航（Phaser 重複使用場景實例）', () => {
    scene.init({ score: 100, level: 1 });
    scene.restart();

    // 第二局遊戲結束：同一個實例重新 init
    scene.init({ score: 200, level: 1 });
    scene.backToMenu();

    expect(scene.scene.start).toHaveBeenCalledTimes(2);
    expect(scene.scene.start).toHaveBeenLastCalledWith(SCENES.MENU);
  });

  test('結算面板的到達關卡應該以實際關卡總數顯示', () => {
    const texts = makeDrawingStub(scene);
    scene.init({ score: 4500, level: 4 });

    scene.drawBreakdown(0, 0, 400);

    expect(texts).toContain(stageOfTotal(4));
    expect(texts).toContain('4,500');
  });
});

describe('LevelCompleteScene', () => {
  let scene;

  beforeEach(() => {
    scene = new LevelCompleteScene();
    scene.scene = makeScenePlugin();
  });

  test('init 應該保存過關資料並計算下一關', () => {
    scene.init({ score: 3000, level: 2, lives: 1, starLevel: 3 });

    expect(scene.score).toBe(3000);
    expect(scene.currentLevel).toBe(2);
    expect(scene.nextLevel).toBe(3);
    expect(scene.lives).toBe(1);
    expect(scene.starLevel).toBe(3);
  });

  test('init 缺值時使用預設值', () => {
    scene.init({});

    expect(scene.score).toBe(0);
    expect(scene.currentLevel).toBe(1);
    expect(scene.nextLevel).toBe(2);
    expect(scene.lives).toBe(3);
    expect(scene.starLevel).toBe(0);
  });

  test('init 應該保留 0 條命（不可當成缺值）', () => {
    scene.init({ lives: 0 });

    expect(scene.lives).toBe(0);
  });

  test.each([
    [5, 3],
    [3, 3],
    [2, 2],
    [1, 1],
    [0, 1]
  ])('剩餘 %i 條命得到 %i 顆星', (lives, stars) => {
    scene.init({ lives });

    expect(scene.computeStars()).toBe(stars);
  });

  test('下一關應該帶入生命與星級，且只觸發一次', () => {
    scene.init({ level: 2, lives: 2, starLevel: 1 });

    scene.nextStage();
    scene.nextStage();
    scene.backToMenu();

    expect(scene.scene.start).toHaveBeenCalledTimes(1);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, {
      level: 3,
      lives: 2,
      starLevel: 1
    });
  });

  test('返回主選單只觸發一次', () => {
    scene.backToMenu();
    scene.backToMenu();
    scene.nextStage();

    expect(scene.scene.start).toHaveBeenCalledTimes(1);
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });

  test('第二次過關時應該可以進入下一關（Phaser 重複使用場景實例）', () => {
    scene.init({ level: 1, lives: 3 });
    scene.nextStage();

    // 第 2 關過關：同一個實例重新 init
    scene.init({ level: 2, lives: 2 });
    scene.nextStage();

    expect(scene.scene.start).toHaveBeenCalledTimes(2);
    expect(scene.scene.start).toHaveBeenLastCalledWith(SCENES.GAME, { level: 3, lives: 2, starLevel: 0 });
  });

  test('只有最後一關過關時才算全部通關', () => {
    scene.init({ level: GAME_CONFIG.TOTAL_LEVELS - 1 });
    expect(scene.isLastStage()).toBe(false);

    scene.init({ level: GAME_CONFIG.TOTAL_LEVELS });
    expect(scene.isLastStage()).toBe(true);
  });

  test('過關面板的關卡進度應該以實際關卡總數顯示', () => {
    const texts = makeDrawingStub(scene);
    scene.init({ score: 3000, level: 2, lives: 2, starLevel: 1 });

    scene.drawBreakdown(0, 0, 400, false);

    expect(texts).toContain(stageOfTotal(2));
    expect(texts).toContain('Lv.1');
    expect(texts).not.toContain('★  NEW HIGH SCORE  ★');
  });

  describe('recordCompletion - 寫入過關紀錄', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    test('應該寫入完成紀錄並解鎖下一關', () => {
      scene.init({ score: 800, level: 2 });

      scene.recordCompletion();

      const data = new SaveManager().load();
      expect(data.statistics.levelsCompleted).toBe(1);
      expect(data.unlockedLevels).toContain(3);
    });

    test('超越舊紀錄才算新紀錄', () => {
      new SaveManager().updateHighScore(1000);
      scene.init({ score: 1001, level: 1 });

      expect(scene.recordCompletion()).toBe(true);
      expect(new SaveManager().getHighScore()).toBe(1001);
    });

    test('與舊紀錄平手不算新紀錄', () => {
      new SaveManager().updateHighScore(1000);
      scene.init({ score: 1000, level: 1 });

      expect(scene.recordCompletion()).toBe(false);
    });

    test('0 分不算新紀錄', () => {
      scene.init({ score: 0, level: 1 });

      expect(scene.recordCompletion()).toBe(false);
    });
  });
});
