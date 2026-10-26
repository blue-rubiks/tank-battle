/**
 * 設定場景 — 調整音樂音量、音效音量與難度（Style A 金邊 Modal）
 * ↑↓ 選擇項目、←→ 調整數值；變更立即寫入存檔
 */

import Phaser from 'phaser';
import { SCENES, DIFFICULTY } from '../utils/Constants';
import { PALETTE, HEX, TEXT_STYLES, drawGoldCorners } from '../utils/UITheme';
import SaveManager from '../managers/SaveManager';
import AudioManager from '../managers/AudioManager';

/** 設定項目（顯示順序） */
export const SETTING_ROWS = [
  { key: 'musicVolume', label: '音樂音量' },
  { key: 'sfxVolume', label: '音效音量' },
  { key: 'difficulty', label: '難　　度' }
];

const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.SETTINGS });
  }

  init() {
    this.saveManager = new SaveManager();
    this.settings = { ...this.saveManager.getSettings() };
    if (!DIFFICULTY[this.settings.difficulty]) {
      this.settings.difficulty = 'normal';
    }
    this.selected = 0;
  }

  create() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 試聽用（依目前設定的音量）
    this.audioManager = new AudioManager(this, this.settings);

    this.labelTexts = [];
    this.valueTexts = [];
    this.markers = [];
    this.arrows = [];

    // Stryker disable all : 純繪圖（座標 / 尺寸 / 顏色 / 字型 / 動畫參數），無可由單元測試驗證的邏輯
    this.add.rectangle(0, 0, width, height, PALETTE.BG_0).setOrigin(0);

    const modalW = 500;
    const modalH = 420;
    const mx = (width - modalW) / 2;
    const my = (height - modalH) / 2;

    const outer = this.add.rectangle(mx - 4, my - 4, modalW + 8, modalH + 8, PALETTE.BG_0).setOrigin(0);
    outer.setStrokeStyle(2, PALETTE.GOLD_DEEP);
    const panel = this.add.rectangle(mx, my, modalW, modalH, PALETTE.PANEL).setOrigin(0);
    panel.setStrokeStyle(3, PALETTE.GOLD);
    drawGoldCorners(this.add.graphics(), mx, my, modalW, modalH, 14, 3, PALETTE.GOLD_2);

    this.add.text(mx + modalW / 2, my + 40, '設  定', {
      fontFamily: TEXT_STYLES.SECTION_TITLE.fontFamily,
      fontSize: '28px',
      color: HEX.GOLD,
      padding: { x: 4, y: 6 },
      shadow: { offsetX: 3, offsetY: 3, color: HEX.BLACK, blur: 0, fill: true }
    }).setOrigin(0.5).setLetterSpacing(8);

    this.add.text(mx + modalW / 2, my + 74, '— SETTINGS —', {
      fontFamily: TEXT_STYLES.LABEL_SMALL.fontFamily,
      fontSize: '10px',
      color: HEX.INK_2
    }).setOrigin(0.5).setLetterSpacing(6);

    // ===== 設定列 =====
    const rowY = my + 130;
    const rowH = 56;
    const valueX = mx + modalW - 130;
    SETTING_ROWS.forEach((row, i) => {
      const y = rowY + i * rowH;

      this.markers.push(this.add.text(mx + 36, y, '▶', {
        fontFamily: TEXT_STYLES.BTN_PRIMARY.fontFamily,
        fontSize: '12px',
        color: HEX.GOLD
      }).setOrigin(0.5));

      this.labelTexts.push(this.add.text(mx + 56, y, row.label, {
        fontFamily: TEXT_STYLES.LABEL.fontFamily,
        fontSize: '16px',
        color: HEX.INK_1,
        padding: { x: 0, y: 3 }
      }).setOrigin(0, 0.5).setLetterSpacing(2));

      this.valueTexts.push(this.add.text(valueX, y, '', {
        fontFamily: TEXT_STYLES.VALUE.fontFamily,
        fontSize: '14px',
        color: HEX.GOLD_2,
        padding: { x: 0, y: 3 }
      }).setOrigin(0.5).setLetterSpacing(2));

      const left = this.add.text(valueX - 80, y, '▶', {
        fontFamily: TEXT_STYLES.BTN_PRIMARY.fontFamily,
        fontSize: '14px',
        color: HEX.GOLD
      }).setOrigin(0.5).setFlipX(true).setInteractive({ useHandCursor: true });
      const right = this.add.text(valueX + 80, y, '▶', {
        fontFamily: TEXT_STYLES.BTN_PRIMARY.fontFamily,
        fontSize: '14px',
        color: HEX.GOLD
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      this.arrows.push({ left, right });
    });

    this.add.text(mx + modalW / 2, my + modalH - 118, '↑↓ 選擇 · ←→ 調整 · ENTER / ESC 返回', {
      fontFamily: TEXT_STYLES.KBD_LABEL.fontFamily,
      fontSize: '11px',
      color: HEX.INK_2,
      padding: { x: 0, y: 2 }
    }).setOrigin(0.5).setLetterSpacing(2);

    // ===== 返回按鈕 =====
    const btnW = modalW - 72;
    const btnX = mx + 36;
    const btnY = my + modalH - 84;
    const btn = this.add.rectangle(btnX, btnY, btnW, 44, PALETTE.GOLD).setOrigin(0);
    btn.setStrokeStyle(2, PALETTE.GOLD);
    btn.setInteractive({ useHandCursor: true });
    this.add.text(btnX + btnW / 2, btnY + 22, '⌂  返 回 主 選 單', {
      fontFamily: TEXT_STYLES.BTN_SECONDARY.fontFamily,
      fontSize: '12px',
      color: HEX.BG_0,
      padding: { x: 0, y: 3 }
    }).setOrigin(0.5).setLetterSpacing(4);
    btn.on('pointerover', () => btn.setFillStyle(PALETTE.GOLD_2));
    btn.on('pointerout', () => btn.setFillStyle(PALETTE.GOLD));

    // Stryker restore all
    // 滑鼠：點箭頭調整該列（同時選取該列）
    this.arrows.forEach(({ left, right }, i) => {
      left.on('pointerdown', () => this.selectAndAdjust(i, -1));
      right.on('pointerdown', () => this.selectAndAdjust(i, 1));
    });
    btn.on('pointerdown', () => this.backToMenu());

    // 鍵盤
    this.input.keyboard.on('keydown-UP', () => this.moveSelection(-1));
    this.input.keyboard.on('keydown-DOWN', () => this.moveSelection(1));
    this.input.keyboard.on('keydown-LEFT', () => this.adjust(SETTING_ROWS[this.selected].key, -1));
    this.input.keyboard.on('keydown-RIGHT', () => this.adjust(SETTING_ROWS[this.selected].key, 1));
    this.input.keyboard.on('keydown-ENTER', () => this.backToMenu());
    this.input.keyboard.on('keydown-ESC', () => this.backToMenu());

    this.refresh();
  }

  /**
   * 移動選取列（上下循環）
   * @param {number} delta - -1 往上、1 往下
   */
  moveSelection(delta) {
    this.selected = (this.selected + delta + SETTING_ROWS.length) % SETTING_ROWS.length;
    this.refresh();
  }

  /**
   * 選取指定列並調整（滑鼠點箭頭）
   */
  selectAndAdjust(index, delta) {
    this.selected = index;
    this.adjust(SETTING_ROWS[index].key, delta);
  }

  /**
   * 調整設定值並立即存檔
   * @param {string} key - 設定鍵值
   * @param {number} delta - -1 減少、1 增加
   */
  adjust(key, delta) {
    if (key === 'difficulty') {
      const index = DIFFICULTY_ORDER.indexOf(this.settings.difficulty);
      const next = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, index + delta));
      this.settings.difficulty = DIFFICULTY_ORDER[next];
    } else {
      // 以 10% 為一格；先換成整數格數再運算，避免 0.1 累加的浮點誤差
      const steps = Math.max(0, Math.min(10, Math.round(this.settings[key] * 10) + delta));
      this.settings[key] = steps / 10;
      this.preview(key);
    }

    this.saveManager.updateSettings({ [key]: this.settings[key] });
    this.refresh();
  }

  /**
   * 以新音量試聽（音樂播開場曲、音效播射擊聲）
   */
  preview(key) {
    if (key === 'musicVolume') {
      this.audioManager.setMusicVolume(this.settings.musicVolume);
      this.audioManager.playJingle('gamestart');
    } else {
      this.audioManager.setSFXVolume(this.settings.sfxVolume);
      this.audioManager.playSFX('shoot');
    }
  }

  /**
   * 設定值的顯示文字
   */
  formatValue(key) {
    if (key === 'difficulty') {
      return DIFFICULTY[this.settings.difficulty].label;
    }
    return `${Math.round(this.settings[key] * 100)}%`;
  }

  /**
   * 依目前設定與選取狀態更新畫面
   */
  refresh() {
    SETTING_ROWS.forEach((row, i) => {
      const isSelected = i === this.selected;
      this.valueTexts[i].setText(this.formatValue(row.key));
      this.labelTexts[i].setColor(isSelected ? HEX.GOLD_2 : HEX.INK_1);
      this.markers[i].setVisible(isSelected);
    });
  }

  backToMenu() {
    this.scene.start(SCENES.MENU);
  }
}
