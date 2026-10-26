/**
 * 選單 / 暫停 / 結算 / 載入場景的 create() 行為測試（真實實作）
 * 以會記錄呼叫的顯示物件替身跑完整畫面建立，驗證其中的互動邏輯：
 * 鍵盤綁定、按鈕回呼、倒數自動前進、貼圖產生
 * （座標 / 顏色等純繪圖細節不在此驗證）
 */

import MenuScene from '../../src/scenes/MenuScene';
import PauseScene from '../../src/scenes/PauseScene';
import GameOverScene from '../../src/scenes/GameOverScene';
import LevelCompleteScene from '../../src/scenes/LevelCompleteScene';
import PreloadScene from '../../src/scenes/PreloadScene';
import SettingsScene, { SETTING_ROWS } from '../../src/scenes/SettingsScene';
import SaveManager from '../../src/managers/SaveManager';
import SoundGenerator from '../../src/utils/SoundGenerator';
import { SCENES, GAME_CONFIG, ENEMY_TYPES, POWERUP_TYPES, DEFAULT_SETTINGS } from '../../src/utils/Constants';
import { HEX } from '../../src/utils/UITheme';

/** 任何方法呼叫都回傳自己、並記錄呼叫與事件處理器的顯示物件替身 */
const makeObject = (kind, args, registry) => {
  const target = { kind, args, calls: [], handlers: {} };
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      return (...callArgs) => {
        obj.calls.push([prop, ...callArgs]);
        if (prop === 'on') obj.handlers[callArgs[0]] = callArgs[1];
        return proxy;
      };
    }
  });
  registry.push(proxy);
  return proxy;
};

/**
 * 為場景裝上 Phaser 系統替身
 */
const setupScene = (scene) => {
  const objects = [];
  const factory = (kind) => (...args) => makeObject(kind, args, objects);
  const keyHandlers = {};
  const timers = [];

  scene.objects = objects;
  scene.keyHandlers = keyHandlers;
  scene.timers = timers;
  scene.add = {
    rectangle: factory('rectangle'),
    text: factory('text'),
    graphics: factory('graphics'),
    circle: factory('circle'),
    image: factory('image'),
    triangle: factory('triangle'),
    sprite: factory('sprite')
  };
  scene.make = { graphics: factory('graphics') };
  scene.tweens = { add: jest.fn() };
  scene.time = {
    now: 0,
    delayedCall: jest.fn((delay, callback) => timers.push({ delay, callback })),
    addEvent: jest.fn((config) => timers.push(config))
  };
  scene.input = {
    keyboard: { on: jest.fn((event, handler) => { keyHandlers[event] = handler; }) }
  };
  scene.cameras = { main: { width: GAME_CONFIG.WIDTH, height: GAME_CONFIG.HEIGHT } };
  scene.scene = {
    start: jest.fn(),
    stop: jest.fn(),
    resume: jest.fn(),
    get: jest.fn(() => null)
  };
  scene.load = { on: jest.fn(), json: jest.fn() };
  return scene;
};

/** 依按鈕文字找出 createButton 註冊的回呼 */
const buttonCallback = (createButton, labelPart) => {
  const call = createButton.mock.calls.find(c => c[3].includes(labelPart));
  return call && call[5];
};

/** 統計列：依標籤找出緊接在後的數值文字 */
const statValue = (scene, label) => {
  const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]);
  const index = texts.indexOf(label);
  return index === -1 ? undefined : texts[index + 1];
};

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MenuScene.create', () => {
  let scene;

  beforeEach(() => {
    const save = new SaveManager();
    save.updateHighScore(23000);
    save.completeLevel(2, 0);
    scene = setupScene(new MenuScene());
    scene.create();
  });

  test('應該讀取存檔並顯示最高分、上次進度與稱號', () => {
    const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]);

    expect(texts).toEqual(expect.arrayContaining(['HIGH SCORE', 'LAST RUN', 'RANK']));
    expect(texts).toContain('23,000');
    expect(statValue(scene, 'LAST RUN')).toBe('STAGE 02');
    expect(texts).toContain('SCOUT');
  });

  test('應該顯示累計遊戲紀錄（場數 / 擊毀 / 射擊 / 道具 / 遊玩時間）', () => {
    localStorage.clear();
    const save = new SaveManager();
    save.recordGameStart();
    save.recordGameStart();
    save.updateStatistics({ enemiesDestroyed: 1234, bulletsShot: 56789, powerUpsCollected: 12, playTime: 3725 });
    const fresh = setupScene(new MenuScene());
    fresh.create();

    expect(statValue(fresh, 'GAMES')).toBe('2');
    expect(statValue(fresh, 'KILLS')).toBe('1,234');
    expect(statValue(fresh, 'SHOTS')).toBe('56,789');
    expect(statValue(fresh, 'ITEMS')).toBe('12');
    expect(statValue(fresh, 'PLAY TIME')).toBe('1:02:05');
  });

  test('沒有存檔時遊戲紀錄全為 0', () => {
    localStorage.clear();
    const fresh = setupScene(new MenuScene());
    fresh.create();

    expect(['GAMES', 'KILLS', 'SHOTS', 'ITEMS'].map(k => statValue(fresh, k))).toEqual(['0', '0', '0', '0']);
    expect(statValue(fresh, 'PLAY TIME')).toBe('0:00:00');
  });

  test('尚未通關任何關卡時上次進度顯示「—」', () => {
    localStorage.clear();
    const fresh = setupScene(new MenuScene());
    fresh.create();
    const texts = fresh.objects.filter(o => o.kind === 'text').map(o => o.args[2]);

    expect(statValue(fresh, 'LAST RUN')).toBe('—');
    expect(texts).toContain('ROOKIE');
  });

  test('通關最後一關後上次進度顯示最後一關（不是前一關）', () => {
    const save = new SaveManager();
    save.completeLevel(4, 0);
    save.completeLevel(5, 0);
    const cleared = setupScene(new MenuScene());
    cleared.create();

    expect(statValue(cleared, 'LAST RUN')).toBe('STAGE 05');
  });

  test('Enter 與空白鍵都從存檔的目前關卡開始', () => {
    scene.keyHandlers['keydown-ENTER']();
    expect(scene.scene.start).toHaveBeenLastCalledWith(SCENES.GAME, { level: 3 });

    scene.keyHandlers['keydown-SPACE']();
    expect(scene.scene.start).toHaveBeenCalledTimes(2);
  });

  test('點擊開始按鈕從目前關卡開始', () => {
    const button = scene.objects.find(o => o.handlers.pointerdown);

    button.handlers.pointerdown();

    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 3 });
  });

  test('開始按鈕的滑入 / 滑出效果不應該拋錯', () => {
    const button = scene.objects.find(o => o.handlers.pointerdown);

    expect(() => {
      button.handlers.pointerover();
      button.handlers.pointerout();
    }).not.toThrow();
  });

  test('S 鍵與設定按鈕都開啟設定畫面', () => {
    scene.keyHandlers['keydown-S']();
    expect(scene.scene.start).toHaveBeenLastCalledWith(SCENES.SETTINGS);

    const button = scene.objects.filter(o => o.handlers.pointerdown).pop();
    button.handlers.pointerdown();
    expect(scene.scene.start).toHaveBeenCalledTimes(2);
    expect(scene.scene.start).toHaveBeenLastCalledWith(SCENES.SETTINGS);
    expect(() => {
      button.handlers.pointerover();
      button.handlers.pointerout();
    }).not.toThrow();
  });

  test('沒有存檔時從第 1 關開始', () => {
    localStorage.clear();
    const fresh = setupScene(new MenuScene());
    fresh.create();

    fresh.keyHandlers['keydown-ENTER']();

    expect(fresh.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 1 });
  });
});

describe('SettingsScene', () => {
  const makeSettings = (saved) => {
    if (saved) new SaveManager().updateSettings(saved);
    const scene = setupScene(new SettingsScene());
    scene.cache = { audio: { exists: jest.fn(() => true) } };
    scene.sound = { play: jest.fn() };
    scene.init();
    scene.create();
    return scene;
  };
  const shownValue = (scene, i) => scene.valueTexts[i].calls.filter(c => c[0] === 'setText').pop()[1];
  const saved = () => new SaveManager().getSettings();
  const lastVolume = scene => scene.sound.play.mock.calls[scene.sound.play.mock.calls.length - 1][1].volume;

  test('應該讀取存檔設定並顯示目前數值', () => {
    const scene = makeSettings();

    expect(SETTING_ROWS.map(r => r.key)).toEqual(['musicVolume', 'sfxVolume', 'difficulty']);
    expect(scene.settings).toEqual(DEFAULT_SETTINGS);
    expect(scene.selected).toBe(0);
    expect(shownValue(scene, 0)).toBe('50%');
    expect(shownValue(scene, 1)).toBe('70%');
    expect(shownValue(scene, 2)).toBe('普通');
  });

  test('存檔的難度無效時視為普通', () => {
    const scene = makeSettings({ difficulty: 'nightmare' });

    expect(scene.settings.difficulty).toBe('normal');
    expect(shownValue(scene, 2)).toBe('普通');
  });

  test('只有選取的列顯示箭頭標記並以金色標示', () => {
    const scene = makeSettings();
    const visible = i => scene.markers[i].calls.filter(c => c[0] === 'setVisible').pop()[1];
    const color = i => scene.labelTexts[i].calls.filter(c => c[0] === 'setColor').pop()[1];

    scene.keyHandlers['keydown-DOWN']();

    expect([0, 1, 2].map(visible)).toEqual([false, true, false]);
    expect([0, 1, 2].map(color)).toEqual([HEX.INK_1, HEX.GOLD_2, HEX.INK_1]);
  });

  test('上下鍵移動選取列並循環', () => {
    const scene = makeSettings();

    scene.keyHandlers['keydown-UP']();
    expect(scene.selected).toBe(2);

    scene.keyHandlers['keydown-DOWN']();
    expect(scene.selected).toBe(0);
    scene.keyHandlers['keydown-DOWN']();
    expect(scene.selected).toBe(1);
  });

  test('左右鍵以 10% 調整音樂音量、立即存檔並試聽開場曲', () => {
    const scene = makeSettings();

    scene.keyHandlers['keydown-RIGHT']();

    expect(scene.settings.musicVolume).toBe(0.6);
    expect(saved().musicVolume).toBe(0.6);
    expect(shownValue(scene, 0)).toBe('60%');
    expect(scene.sound.play).toHaveBeenLastCalledWith('gamestart', { volume: expect.any(Number) });
    expect(lastVolume(scene)).toBeCloseTo(0.6, 6);

    scene.keyHandlers['keydown-LEFT']();
    scene.keyHandlers['keydown-LEFT']();
    expect(saved().musicVolume).toBe(0.4);
  });

  test('音量上下限為 100% / 0%，累加不產生浮點誤差', () => {
    const scene = makeSettings();

    for (let i = 0; i < 8; i++) scene.keyHandlers['keydown-RIGHT']();
    expect(scene.settings.musicVolume).toBe(1);
    expect(shownValue(scene, 0)).toBe('100%');

    for (let i = 0; i < 15; i++) scene.keyHandlers['keydown-LEFT']();
    expect(scene.settings.musicVolume).toBe(0);
    expect(shownValue(scene, 0)).toBe('0%');
  });

  test('調整音效音量時試聽射擊音效', () => {
    const scene = makeSettings();
    scene.keyHandlers['keydown-DOWN']();

    scene.keyHandlers['keydown-LEFT']();

    expect(saved().sfxVolume).toBe(0.6);
    expect(scene.sound.play).toHaveBeenLastCalledWith('shoot', { volume: expect.any(Number) });
    // 射擊音效的相對音量 0.7 × 音效音量 0.6
    expect(lastVolume(scene)).toBeCloseTo(0.42, 6);
  });

  test('難度依簡單 / 普通 / 困難切換，到兩端停住', () => {
    const scene = makeSettings();
    scene.keyHandlers['keydown-UP']();

    scene.keyHandlers['keydown-RIGHT']();
    expect(saved().difficulty).toBe('hard');
    expect(shownValue(scene, 2)).toBe('困難');
    scene.keyHandlers['keydown-RIGHT']();
    expect(saved().difficulty).toBe('hard');

    scene.keyHandlers['keydown-LEFT']();
    scene.keyHandlers['keydown-LEFT']();
    expect(saved().difficulty).toBe('easy');
    expect(shownValue(scene, 2)).toBe('簡單');
    scene.keyHandlers['keydown-LEFT']();
    expect(saved().difficulty).toBe('easy');
    // 切換難度不試聽
    expect(scene.sound.play).not.toHaveBeenCalled();
  });

  test('點擊某列的箭頭會選取該列並調整', () => {
    const scene = makeSettings();

    scene.arrows[2].left.handlers.pointerdown();
    expect(scene.selected).toBe(2);
    expect(saved().difficulty).toBe('easy');

    scene.arrows[1].right.handlers.pointerdown();
    expect(scene.selected).toBe(1);
    expect(saved().sfxVolume).toBe(0.8);
  });

  test('Enter、ESC 與返回按鈕都回到主選單', () => {
    const scene = makeSettings();
    const button = scene.objects.find(o => o.kind === 'rectangle' && o.handlers.pointerdown);

    scene.keyHandlers['keydown-ENTER']();
    scene.keyHandlers['keydown-ESC']();
    button.handlers.pointerdown();

    expect(scene.scene.start).toHaveBeenCalledTimes(3);
    expect(scene.scene.start.mock.calls.every(c => c[0] === SCENES.MENU)).toBe(true);
    expect(() => {
      button.handlers.pointerover();
      button.handlers.pointerout();
    }).not.toThrow();
  });
});

describe('PauseScene.create', () => {
  let scene;
  let gameScene;
  let createButton;

  beforeEach(() => {
    gameScene = {
      currentLevel: 2,
      gameState: { level: 2, score: 300, enemiesRemaining: 5 },
      totalEnemyCount: 12,
      playTime: 5000
    };
    scene = setupScene(new PauseScene());
    scene.scene.get.mockReturnValue(gameScene);
    createButton = jest.spyOn(scene, 'createButton');
    scene.create();
  });

  test('應該取得遊戲場景並顯示當下戰況', () => {
    const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]);

    expect(scene.scene.get).toHaveBeenCalledWith(SCENES.GAME);
    expect(texts).toContain('5 / 12');
    expect(texts).toContain('00:05');
  });

  test('戰況統計列應該是「標籤 → 數值」成對顯示', () => {
    expect(statValue(scene, 'STAGE')).toBe('02 / 05');
    expect(statValue(scene, 'SCORE')).toBe('300');
    expect(statValue(scene, 'HOSTILES')).toBe('5 / 12');
    expect(statValue(scene, 'TIME ELAPSED')).toBe('00:05');
  });

  test('按鈕應該分別繼續、重新開始、返回主選單', () => {
    expect(createButton).toHaveBeenCalledTimes(3);

    buttonCallback(createButton, '繼')();
    expect(scene.scene.resume).toHaveBeenCalledWith(SCENES.GAME);

    buttonCallback(createButton, '重')();
    expect(scene.scene.start).toHaveBeenLastCalledWith(SCENES.GAME, { level: 2 });

    buttonCallback(createButton, '返')();
    expect(scene.scene.start).toHaveBeenLastCalledWith(SCENES.MENU);
  });

  test('實際點擊按鈕（pointerdown）應該觸發對應動作', () => {
    const clickable = scene.objects.filter(o => o.handlers.pointerdown);
    expect(clickable).toHaveLength(3);

    clickable[0].handlers.pointerdown();
    expect(scene.scene.resume).toHaveBeenCalledWith(SCENES.GAME);
  });

  test('P 與 Esc 都可以繼續遊戲', () => {
    scene.keyHandlers['keydown-P']();
    scene.keyHandlers['keydown-ESC']();

    expect(scene.scene.resume).toHaveBeenCalledTimes(2);
  });

  test('按鈕的滑入 / 滑出效果不應該拋錯', () => {
    scene.objects.filter(o => o.handlers.pointerover).forEach(button => {
      expect(() => {
        button.handlers.pointerover();
        button.handlers.pointerout();
      }).not.toThrow();
    });
  });
});

describe('GameOverScene.create', () => {
  let scene;
  let createButton;

  const create = (data) => {
    scene = setupScene(new GameOverScene());
    createButton = jest.spyOn(scene, 'createButton');
    scene.init(data);
    scene.create();
  };

  test('應該顯示最終分數與到達關卡', () => {
    create({ score: 4200, level: 3, isNewHighScore: false });
    const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]);

    expect(texts).toContain('4,200');
    expect(texts).toContain('03 / 05');
  });

  test('結算統計列應該是「標籤 → 數值」成對顯示', () => {
    create({ score: 4200, level: 3, isNewHighScore: false });

    expect(statValue(scene, 'STAGE REACHED')).toBe('03 / 05');

    // 大字分數與明細列各有一組「FINAL SCORE → 分數」
    const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]);
    const labels = texts.flatMap((t, i) => (t === 'FINAL SCORE' ? [i] : []));
    expect(labels).toHaveLength(2);
    labels.forEach(i => expect(texts[i + 1]).toBe('4,200'));
  });

  test('創新高時顯示 NEW PERSONAL BEST', () => {
    create({ score: 4200, level: 3, isNewHighScore: true });
    const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]).join('\n');

    expect(texts).toMatch(/NEW PERSONAL BEST/);
  });

  test('沒有創新高時不顯示 NEW PERSONAL BEST', () => {
    create({ score: 100, level: 1, isNewHighScore: false });
    const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]).join('\n');

    expect(texts).not.toMatch(/NEW PERSONAL BEST/);
  });

  test('再來一局按鈕與 Enter 從第 1 關重新開始', () => {
    create({ score: 0, level: 1 });

    buttonCallback(createButton, '再')();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 1 });

    create({ score: 0, level: 1 });
    scene.keyHandlers['keydown-ENTER']();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 1 });
  });

  test('實際點擊按鈕（pointerdown）應該觸發對應動作', () => {
    create({ score: 0, level: 1 });
    const clickable = scene.objects.filter(o => o.handlers.pointerdown);
    expect(clickable).toHaveLength(2);

    clickable[0].handlers.pointerdown();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 1 });
  });

  test('返回按鈕與 Esc 回到主選單', () => {
    create({ score: 0, level: 1 });
    buttonCallback(createButton, '返')();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);

    create({ score: 0, level: 1 });
    scene.keyHandlers['keydown-ESC']();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });

  test('按鈕的滑入 / 滑出效果不應該拋錯', () => {
    create({ score: 0, level: 1 });

    scene.objects.filter(o => o.handlers.pointerover).forEach(button => {
      expect(() => {
        button.handlers.pointerover();
        button.handlers.pointerout();
      }).not.toThrow();
    });
  });
});

describe('LevelCompleteScene.create', () => {
  let scene;
  let createButton;

  const create = (data) => {
    scene = setupScene(new LevelCompleteScene());
    createButton = jest.spyOn(scene, 'createButton');
    scene.init(data);
    scene.create();
  };

  test('應該寫入過關紀錄', () => {
    create({ score: 1500, level: 2, lives: 2 });

    const data = new SaveManager().load();
    expect(data.statistics.levelsCompleted).toBe(1);
    expect(data.currentLevel).toBe(3);
  });

  test('非最後一關：顯示下一關按鈕，3 秒後自動前進', () => {
    create({ score: 1500, level: 2, lives: 2, starLevel: 1 });

    expect(createButton).toHaveBeenCalledTimes(2);
    expect(createButton.mock.calls[0][3]).toContain('STAGE 03');

    const autoAdvance = scene.timers.find(t => t.delay === 3000);
    autoAdvance.callback();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 3, lives: 2, starLevel: 1 });
  });

  test('倒數提示每秒更新', () => {
    create({ score: 1500, level: 2, lives: 2 });
    const countdown = scene.timers.find(t => t.repeat !== undefined);
    const text = scene.objects.find(o => o.kind === 'text' && String(o.args[2]).includes('3 秒後'));

    expect(countdown.delay).toBe(1000);
    expect(countdown.repeat).toBe(2);

    countdown.callback();
    expect(text.calls).toContainEqual(['setText', '2 秒後自動進入下一關...']);
    countdown.callback();
    expect(text.calls).toContainEqual(['setText', '1 秒後自動進入下一關...']);

    // 倒數到 0 時交給 3 秒計時前進，不再更新文字
    const before = text.calls.length;
    countdown.callback();
    expect(text.calls).toHaveLength(before);
  });

  test('過關統計列應該是「標籤 → 數值」成對顯示', () => {
    create({ score: 1500, level: 2, lives: 2, starLevel: 1 });

    expect(statValue(scene, 'STAGE')).toBe('02 / 05');
    expect(statValue(scene, 'CURRENT SCORE')).toBe('1,500');
    expect(statValue(scene, 'LIVES REMAINING')).toBe('2');
    expect(statValue(scene, 'STAR LEVEL')).toBe('Lv.1');
  });

  test('沒有星級時星級欄顯示「—」', () => {
    create({ score: 1500, level: 2, lives: 2, starLevel: 0 });

    expect(statValue(scene, 'STAR LEVEL')).toBe('—');
  });

  test('倒數文字已移除時不更新', () => {
    create({ score: 1500, level: 2, lives: 2 });
    const countdown = scene.timers.find(t => t.repeat !== undefined);
    scene.countdownText = null;

    expect(() => countdown.callback()).not.toThrow();
  });

  test('非最後一關：按鈕與 Enter 前往下一關，返回按鈕回主選單', () => {
    create({ score: 0, level: 1, lives: 3 });
    buttonCallback(createButton, '下')();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 2, lives: 3, starLevel: 0 });

    create({ score: 0, level: 1, lives: 3 });
    scene.keyHandlers['keydown-ENTER']();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.GAME, { level: 2, lives: 3, starLevel: 0 });

    create({ score: 0, level: 1, lives: 3 });
    buttonCallback(createButton, '返')();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });

  test('實際點擊按鈕（pointerdown）應該觸發對應動作', () => {
    create({ score: 0, level: 1, lives: 3 });
    const clickable = scene.objects.filter(o => o.handlers.pointerdown);
    expect(clickable).toHaveLength(2);

    clickable[1].handlers.pointerdown();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });

  test('最後一關：只有返回按鈕、沒有自動前進，Enter 回主選單', () => {
    create({ score: 0, level: GAME_CONFIG.TOTAL_LEVELS, lives: 3 });

    expect(createButton).toHaveBeenCalledTimes(1);
    expect(scene.timers.find(t => t.delay === 3000)).toBeUndefined();
    const texts = scene.objects.filter(o => o.kind === 'text').map(o => o.args[2]).join('\n');
    expect(texts).toMatch(/ALL STAGES CLEARED/);

    scene.keyHandlers['keydown-ENTER']();
    expect(scene.scene.start).toHaveBeenCalledWith(SCENES.MENU);
  });

  test('創新高時顯示 NEW HIGH SCORE 並閃爍', () => {
    create({ score: 999, level: 1, lives: 3 });
    const tag = scene.objects.find(o => o.kind === 'text' && String(o.args[2]).includes('NEW HIGH SCORE'));

    expect(tag).toBeDefined();
    expect(scene.tweens.add).toHaveBeenCalledWith(expect.objectContaining({ targets: tag, yoyo: true, repeat: -1 }));
  });

  test.each([
    [3, 3],
    [2, 2],
    [1, 1]
  ])('剩餘 %i 條命時亮起 %i 顆星', (lives, stars) => {
    const drawStars = jest.spyOn(LevelCompleteScene.prototype, 'drawStars');

    create({ score: 0, level: 1, lives });

    expect(drawStars).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), stars);
  });

  test('按鈕的滑入 / 滑出效果不應該拋錯', () => {
    create({ score: 0, level: 1, lives: 3 });

    scene.objects.filter(o => o.handlers.pointerover).forEach(button => {
      expect(() => {
        button.handlers.pointerover();
        button.handlers.pointerout();
      }).not.toThrow();
    });
  });
});

describe('PreloadScene.preload', () => {
  test('應該產生所有實體需要的貼圖（正確尺寸）', () => {
    const scene = setupScene(new PreloadScene());
    jest.spyOn(SoundGenerator, 'generateAllSounds').mockReturnValue({});

    scene.preload();

    const textures = {};
    scene.objects
      .filter(o => o.kind === 'graphics')
      .forEach(o => o.calls
        .filter(c => c[0] === 'generateTexture')
        .forEach(([, key, w, h]) => { textures[key] = [w, h]; }));

    ['player_tank', ...Object.values(ENEMY_TYPES).map(c => c.texture)].forEach(key => {
      expect(textures[key]).toEqual([GAME_CONFIG.TILE_SIZE, GAME_CONFIG.TILE_SIZE]);
    });
    ['brick', 'steel', 'water', 'ice', 'forest', 'base', ...Object.values(POWERUP_TYPES).map(c => c.texture)]
      .forEach(key => expect(textures[key]).toEqual([32, 32]));
    expect(textures.bullet).toEqual([8, 8]);
  });

  test('每種道具貼圖都應該畫出各自的內部圖示（不是空白）', () => {
    const scene = setupScene(new PreloadScene());
    jest.spyOn(SoundGenerator, 'generateAllSounds').mockReturnValue({});

    scene.preload();

    const icons = {};
    scene.objects
      .filter(o => o.kind === 'graphics')
      .forEach(o => {
        const end = o.calls.findIndex(c => c[0] === 'generateTexture');
        if (end === -1 || !String(o.calls[end][1]).startsWith('powerup_')) return;
        // 黑色畫筆之後、產生貼圖之前的繪製呼叫就是圖示
        const start = o.calls.map(c => `${c[0]}:${c[1]}`).lastIndexOf(`fillStyle:${0x000000}`);
        icons[o.calls[end][1]] = JSON.stringify(o.calls.slice(start + 1, end));
      });

    const textures = Object.values(POWERUP_TYPES).map(c => c.texture);
    expect(Object.keys(icons).sort()).toEqual([...textures].sort());
    textures.forEach(key => expect(icons[key]).not.toBe('[]'));
    expect(new Set(Object.values(icons)).size).toBe(textures.length);
  });

  test('應該建立載入畫面並在完成後移除', () => {
    const scene = setupScene(new PreloadScene());
    jest.spyOn(SoundGenerator, 'generateAllSounds').mockReturnValue({});

    scene.preload();
    scene.onLoadProgress(0.5);
    scene.onLoadComplete();

    expect(scene.percentText.calls).toContainEqual(['setText', '50%']);
    expect(scene.progressBar.calls).toContainEqual(['destroy']);
    expect(scene.loadingText.calls).toContainEqual(['destroy']);
    expect(scene.percentText.calls).toContainEqual(['destroy']);
  });
});
