# 進階 AI 系統

> 敵人坦克的智能行為系統詳解

## 概述

本遊戲的敵人 AI 系統實現了多種進階功能，讓敵人行為更加智能和有挑戰性：

- **預測射擊** - 預判玩家移動方向，提前射擊
- **視線檢測** - 判斷是否能直接看到目標
- **智能巡邏** - 有目的地巡邏而非隨機漫步
- **包抄戰術** - 多個敵人協調包抄玩家
- **團隊協作** - 透過 Blackboard 架構共享資訊

## 系統架構

```
┌─────────────────────────────────────────────────────────────┐
│                      GameScene                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    AIBlackboard                          ││
│  │  - 玩家位置/速度資訊                                      ││
│  │  - 目標分配管理                                          ││
│  │  - 包抄位置協調                                          ││
│  │  - 巡邏點系統                                            ││
│  │  - 威脅評估                                              ││
│  └─────────────────────────────────────────────────────────┘│
│                           ↑↓                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ EnemyAI  │  │ EnemyAI  │  │ EnemyAI  │  ...              │
│  │  - 狀態機 │  │  - 狀態機 │  │  - 狀態機 │                   │
│  │  - 尋路   │  │  - 尋路   │  │  - 尋路   │                   │
│  │  - 射擊   │  │  - 射擊   │  │  - 射擊   │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## 功能詳解

### 1. 預測射擊

敵人會根據玩家的移動速度，預測玩家在未來 0.3 秒後的位置，並提前瞄準該位置射擊。

```javascript
// 預測玩家位置
_predictTargetPosition(target, predictionTime = 0.3) {
  const vx = target.body.velocity.x;
  const vy = target.body.velocity.y;

  return {
    x: target.x + vx * predictionTime,
    y: target.y + vy * predictionTime
  };
}
```

**效果**：玩家無法透過簡單的直線移動躲避子彈

### 2. 視線檢測 (Line of Sight)

使用 Bresenham 直線演算法檢測敵人與玩家之間是否有障礙物阻擋。

```javascript
// 檢查視線
_checkLineOfSight(from, to) {
  // 使用 Bresenham 演算法遍歷路徑上的每個格子
  // 如果遇到牆壁 (BRICK/STEEL)，則視線被阻擋
}
```

**效果**：
- 敵人在巡邏時如果「看到」玩家，會立即開火
- 避免敵人對著牆壁射擊

### 3. 智能巡邏

敵人不再隨機漫步，而是依序走訪預定義的巡邏點，覆蓋地圖的關鍵區域。

**巡邏點分布**：
```
    ●─────────●─────────●
    │         │         │
    │    ●────●────●    │
    │    │         │    │
    ●────●────●────●────●
    │    │         │    │
    │    ●────●────●    │
    │         │         │
    ●─────────●─────────●
```

**效果**：
- 敵人會有目的地移動
- 更好的地圖覆蓋率
- 減少玩家「安全角落」

### 4. 包抄戰術

當多個敵人同時追逐玩家時，會協調分配包抄位置，從玩家的側翼或背後攻擊。

**包抄位置優先級**（以玩家面向上方為例）：
1. 下方（背後）- 最高優先
2. 左側
3. 右側
4. 上方（正面）- 最低優先

```javascript
// 優先級排序（有偏好側時該側排最前）
_prioritizeFlankingPositions(positions, playerDirection, preferredSide) {
  const priorityMap = {
    'up': ['bottom', 'left', 'right', 'top'],
    'down': ['top', 'left', 'right', 'bottom'],
    // ...
  };
}
```

**選邊滯後**：敵人會記住上次包抄的那一側（`FLANK_SIDE_MEMORY`，預設 8 秒）。
追逐與攻擊狀態每 2 秒互相切換，若每次重新選邊都跟著玩家當下的面向，
玩家一轉向敵人就會跳到另一側，在玩家左右來回而不逼近；記憶期間內沿用同一側即可避免。

**效果**：
- 敵人會嘗試從玩家的盲區攻擊
- 最多 2 個敵人同時包抄，避免扎堆
- 同一個敵人在短時間內維持同一側包抄，不會左右搖擺

### 5. 團隊協作 (Blackboard 架構)

所有敵人透過共享的「黑板」(Blackboard) 交換資訊：

| 資訊類型 | 說明 |
|---------|------|
| `playerLastKnownPosition` | 玩家最後已知位置 |
| `playerVelocity` | 玩家速度向量 |
| `assignedTargets` | 目標分配（玩家 / 基地） |
| `flankingPositions` | 各敵人的包抄位置 |
| `enemyPositions` | 敵人位置（避免碰撞） |
| `attackingEnemies` | 正在攻擊的敵人集合 |

**效果**：
- 避免所有敵人都攻擊同一目標
- 敵人之間保持最小間距，不會扎堆
- 協調包抄行動

## 配置參數

所有 AI 參數都可以在 `src/utils/Constants.js` 中調整：

```javascript
export const AI_CONFIG = {
  // 預測射擊
  PREDICTION_TIME: 0.3,         // 預測時間（秒）
  PREDICTION_ENABLED: true,

  // 視線檢測
  LINE_OF_SIGHT_ENABLED: true,
  LOS_CHECK_INTERVAL: 200,      // 檢測間隔（ms）

  // 智能巡邏
  SMART_PATROL_ENABLED: true,
  PATROL_POINT_REACH_DIST: 40,

  // 包抄戰術
  FLANKING_ENABLED: true,
  FLANKING_DISTANCE: 120,
  MAX_FLANKING_ENEMIES: 2,
  FLANK_SIDE_MEMORY: 8000,      // 記住上次包抄側的時間（ms）

  // 團隊協作
  TEAM_COORDINATION_ENABLED: true,
  MIN_ENEMY_SPACING: 60
};
```

## 移動控制架構：「移動意圖」模式

為了解決敵人坦克卡牆和抖動問題，AI 採用「移動意圖」(Move Intent) 模式：
狀態機與事件處理只設定意圖（`desiredDirection` / `wantsToMove`），
真正的 `move()` / `stop()` 只在 update 尾端的統一出口執行一次。

### 核心原理

```javascript
// ❌ 舊架構：多處呼叫 move() → 方向衝突 → 抖動
stateMachine.update() → tank.move(direction1)
onWallHit()          → tank.move(direction2)  // 衝突！
checkIfStuck()       → tank.move(direction3)  // 衝突！

// ✅ 新架構：各處只設定移動意圖 → 統一執行
狀態 update（尋路 / 對齊 / 保持距離） → _setMoveIntent('up') / wantsToMove = false
onWallHit()                          → this.desiredDirection = 'left'
_checkIfStuck()                      → this.desiredDirection = 'right'

update() {
  // 唯一的移動出口
  if (this.wantsToMove) {
    this.tank.move(this.desiredDirection);
  } else {
    this.tank.face(this.desiredDirection); // 停車仍轉砲口
    this.tank.stop();
  }
}
```

### 方向變更冷卻

為了避免快速切換方向造成抖動，事件類方向變更（撞牆、撞坦克）有 **500ms 冷卻時間**：

```javascript
// 500ms 內不允許再次改變方向
if (currentTime - this.lastDirectionChange < 500) {
  return; // 維持當前方向
}
```

撞牆換向會先以地圖資料過濾可行走方向，避免在轉角選到另一面牆。

### 統一的 update 流程

```javascript
update(delta) {
  // 1. 視線檢測（節流，每 200ms）
  this._updateLineOfSight();

  // 2. 定期評估狀態切換（每 2 秒）
  this._evaluateState();

  // 3. 狀態機決定移動意圖與射擊
  //    patrol：尋路前往巡邏點，看到玩家就瞄準射擊
  //    chase：A* 尋路追逐（可能包抄），預測射擊
  //    attack：對齊射擊，理想距離內停車（wantsToMove = false）
  //    retreat：反向脫離，邊退邊射
  this.wantsToMove = true;
  this.stateMachine.update(delta);

  // 4. 檢測卡住（時間制；主動停車不計入）
  this._checkIfStuck(delta);

  // 5. 統一移動出口：唯一呼叫 move() / stop() 的地方
  if (this.wantsToMove) {
    this.tank.move(this.desiredDirection);
    this.scene.applyCornerSlide(this.tank, this.desiredDirection); // 轉角滑動輔助
  } else {
    this.tank.face(this.desiredDirection);
    this.tank.stop();
  }
}
```

### 卡住檢測與分級脫困

以固定時間窗口累計移動量，與「速度 × 時間」的預期值比較，
不受畫面更新率影響：

- **1 秒**未正常移動：換一個可行走方向
- **2.5 秒**仍卡住：強制對齊到最近的格子中心，失敗則搬移到最近可行走格

### 滯後效應 (Hysteresis)

方向選擇使用 **1.5x 滯後閾值** 避免在對角線上抖動：

```javascript
// 只有當 dx 明顯大於 dy 時才選擇水平移動
if (Math.abs(dx) > Math.abs(dy) * 1.5) {
  newDir = dx > 0 ? 'right' : 'left';
} else if (Math.abs(dy) > Math.abs(dx) * 1.5) {
  newDir = dy > 0 ? 'down' : 'up';
} else {
  // 差異不大，維持當前方向
  return;
}
```

**效果**：
- ✅ 消除抖動問題
- ✅ 方向變更更自然
- ✅ 減少卡牆情況

### 沿牆繞行滯後

`_moveDirectly`（沒有 A* 路徑時的直線逼近，例如目標是被磚牆圍住的基地）在首選方向
被牆擋住時改走垂直方向繞行。繞行方向一旦選定就記在 `detour`（被擋的方向 + 繞行方向），
只要被擋的方向還是不通、繞行方向仍可走，就沿牆繼續走，不再每幀依 dx / dy 的正負重選：

```javascript
// 目標在正下方隔著牆：dx 在 0 附近變號，原本每幀都在左右之間切換
if (this.detour &&
    !this._isDirectionSafe(this.detour.blocked) &&
    this._isDirectionSafe(this.detour.dir)) {
  this._setMoveIntent(this.detour.dir); // 繼續沿牆走
  return;
}
```

被擋的方向變成可走（繞過牆角）、繞行方向被擋、兩個方向都被擋、找到 A* 路徑或
卡住檢測換向時，都會清除 `detour` 重新選擇。

### 方向翻轉診斷（開發模式）

`npm run dev` 時若有敵人在 2 秒內改變方向超過 6 次，console 會印出一次該敵人的快照
（狀態、目標、是否包抄、路徑點、繞行方向、位置與四周可走方向），同一敵人 5 秒內最多一次。
遊戲中看到敵人卡住左右來回時，打開 DevTools 就能知道是哪個決策分支在翻方向。
正式建置與測試環境（`NODE_ENV` 不是 `development`）完全關閉，不會有任何輸出。

## 狀態機

AI 行為由 4 種狀態組成：

```
         ┌─────────────────────────────────┐
         │            patrol               │
         │  - 智能巡邏                      │
         │  - 視線內看到玩家會射擊          │
         └──────────────┬──────────────────┘
                        │ 發現目標
                        ↓
         ┌─────────────────────────────────┐
         │            chase                │
         │  - 追逐目標（可能包抄）          │
         │  - 使用預測射擊                  │
         └──────────────┬──────────────────┘
                        │ 進入攻擊範圍
                        ↓
         ┌─────────────────────────────────┐
         │            attack               │
         │  - 對齊目標                      │
         │  - 預測射擊                      │
         │  - 保持距離                      │
         └──────────────┬──────────────────┘
                        │ 血量 < 30%
                        ↓
         ┌─────────────────────────────────┐
         │           retreat               │
         │  - 遠離玩家                      │
         │  - 邊撤退邊射擊                  │
         └─────────────────────────────────┘
```

## 測試

AI 系統包含完整的單元測試：

```bash
# 執行 AI 相關測試
npm test -- --testPathPattern="(AIBlackboard|EnemyAI)"
```

測試覆蓋：
- AIBlackboard：19 個測試
- EnemyAI 進階功能：26 個測試
- EnemyAI 基礎行為（撞牆換向、卡住檢測、目標優先級）：11 個測試
- EnemyAI 狀態機整合（攻擊保持距離、A* 追逐、視線射擊）：10 個測試

## 檔案結構

```
src/
├── systems/
│   ├── EnemyAI.js        # 敵人 AI 控制器
│   └── AIBlackboard.js   # 團隊協作黑板
├── utils/
│   └── Constants.js      # AI 配置參數
tests/
└── unit/
    ├── EnemyAI.test.js
    ├── EnemyAIBasics.test.js
    ├── EnemyAIStateMachine.test.js
    └── AIBlackboard.test.js
```

## 參考資料

- [AI Blackboard Architecture for Tactical Game AI](https://tonogameconsultants.com/ai-blackboard/)
- [Squad Coordination in Days Gone (Game AI Pro)](http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf)
- [Behavior Trees for AI: How They Work](https://www.gamedeveloper.com/programming/behavior-trees-for-ai-how-they-work)
