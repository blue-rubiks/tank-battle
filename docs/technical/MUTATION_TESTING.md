# 變異測試（Mutation Testing）

本專案使用 [StrykerJS](https://stryker-mutator.io/) 搭配 Jest 做變異測試，用來檢驗測試是否真的
會抓到錯誤，而不只是「執行過」程式碼。目標是**不計標註忽略的變異分數 100%**：每個存活的
變異體都要補測試殺掉，或在原始碼標註並附上理由。分數以 Stryker 產出的報告為準
（`reports/mutation/mutation.html`），文件不維護數字快照。

## 執行注意

```bash
npx stryker run --concurrency 4 --mutate "src/systems/EnemyAI.js"
```

- **務必限制並行數**。預設並行數是「CPU 核心數 − 1」，會吃滿整台機器；
  完整執行（4 個 worker）約需 65–80 分鐘，日常請用 `--mutate` 只測改動的檔案
- 已開啟增量模式（`reports/stryker-incremental.json`），只重測有改動的部分。
  **正式數據請加 `--force` 完整重跑**：增量模式在新增測試後，部分原本存活的變異體
  可能沿用舊結果而沒有重測（實測過模組層級的常數物件）
- `@stryker-mutator/core` 固定使用 **9.x**。10.x 的 instrumenter 內建 Babel 8，
  會與專案 `babel.config.js` 使用的 `@babel/preset-env` 7 衝突而無法啟動
- 中斷執行後若殘留 `.stryker-tmp/` 沙盒副本，可直接刪除；`reports/` 與 `.stryker-tmp/`
  都已列入 `.gitignore`，`jest.config.js` 也忽略了 `.stryker-tmp/`

## 標註原則

原始碼中的 `// Stryker disable` 註解只用於以下三種情境，且每處都要附理由：

1. **等價變異體**：改了之後程式行為完全一樣，任何測試都不可能分辨。
   例如 `i < bufferSize` 改成 `i <= bufferSize`（Float32Array 越界寫入會被忽略）。
   能改寫成沒有等價分支的寫法時，優先直接重構，而不是標註。
2. **純繪圖 / 版面樣式**：選單、HUD、結算畫面的像素座標、配色、字型、動畫參數。
   這類「畫得對不對」要靠肉眼確認，為每個座標寫斷言只是把實作抄進測試。
   **按鈕是否綁定點擊、鍵盤快捷鍵、場景切換、分數計算**等行為都留在標註區段之外並有測試。
3. **未使用的設計 token / 常數群組**：如 `AUDIO_KEYS`、`COLORS`、`POOL_CONFIG` 等
   目前沒有程式讀取的公開匯出。刪除屬於 API 變更，因此保留並標註。

```js
// Stryker disable next-line EqualityOperator: 寫入超出 Float32Array 長度的位置會被忽略（等價）
for (let i = 0; i < bufferSize; i++) {

// Stryker disable all : 純繪圖（像素座標、配色、字型），以視覺驗證為準
...
// Stryker restore all
```

### 標註的位置

`disable next-line` 只對「註解所附著的節點」的**起始行**生效。放在 `} else if (...)` 之前時，
Babel 會把它掛成前一個敘述的尾註解，標註**不會生效**，請改寫分支結構：

```js
// ✗ 不生效
if (t < 0.1) {
  freq = 523;
  // Stryker disable next-line EqualityOperator: ...
} else if (t < 0.2) {

// ✓ 生效
if (t < 0.1) {
  freq = 523;
} else {
  // Stryker disable next-line EqualityOperator: ...
  freq = t < 0.2 ? 659 : 784;
}
```

### 標註區段的補償

標註略過的純繪圖程式碼不受單元測試與變異測試保護。改動場景版面或 HUD 後，請以
production build 實際操作一輪（選單 → 遊戲 → 道具 → 暫停 → 過關 → Game Over → 再來一局），
確認沒有 JS 錯誤、文字沒有重疊、提示在正確位置。
