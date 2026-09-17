# Oc

獨立的手寫時間辨識網站。`index.html` 位於 repository 根目錄，供 GitHub Pages `main / (root)` 發布。這不是 StrForge 的 .NET/Avalonia 模組，沒有修改 StrForge；不需要在手機或本機安裝 .NET。

## 使用

在「掃描」選照片或拍照，用手指框住由上往下的四位數時間，再按「辨識時間」。例如 `0900`、`0910`、`1002`、`1004`。切到「校正」對照縮圖修改，全部確認且合法才可複製或匯出 TXT／CSV。結果為 `09:00`，保留順序和前導零。模型分數不是正確率，合法時間也可能辨識錯。

可記住框選比例座標，新照片仍需核對框位。±15° 微調不是透視校正。自動漏列時填實際列數，並框齊上下邊界；等寬四格只適用字距對齊。每批最多100列。

## 資料與模型

照片在裝置內處理，不上傳。原始全照不保存；草稿包含結果與每列小縮圖，存於獨立 IndexedDB `oc-time-v1`。不讀取、刪除或修改 StrForge 資料。瀏覽器清除網站資料仍可能移除 Oc 資料，請定期匯出。

「收集我確認的字跡」預設關閉，勾選後在人工確認時保存列縮圖與四位答案，最多2000列；設定頁可匯出 `TimeOcrTraining.zip`。它是教材，不是模型，不會自動上傳或訓練。未核對的切字不能當成每個數字的訓練標籤。

初始模型在 GitHub Actions 用 MNIST 公開資料訓練，權重在 `models/time-digit.json`。手機只在點辨識時透過 Worker 載入；推論採與 PyTorch 對齊的小型 JavaScript 實作，不下載通用 ONNX/TensorFlow runtime。模型不是用你的字跡訓練；MNIST 單字測試不代表實拍時間正確率。完整度量在 `models/training-metrics.json`。

本版沒有 Service Worker 或離線保證。失敗或90秒未完成時停止 Worker，保留原草稿；不攔截全域 fetch、不反覆重抓、不清資料。

## 開發與檢查

```sh
npm test
node tools/stamp.mjs --check
node tools/serve.mjs
```

本地網址 `http://127.0.0.1:4173/Oc/`。修改 `src/*.js` 或 CSS 後執行 `node tools/stamp.mjs` 再提交；內容識別碼不是產品版本號。

瀏覽器檢查需指定隔離安裝的 Playwright ES module：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/browser-check.mjs
```

CI 使用 Node.js22、Playwright1.63.0。包括模型完整性、PyTorch/JS logits、時間規則、真實 Worker OCR、檔案輸入、框選、校正、草稿重載、教材ZIP、取消、儲存失敗、模型損毀與320px顯示。WebKit行動模擬不等同實體iPhone相機或主畫面驗收。結果以對應commit的CI為準，不預先宣稱通過。

## 發布

管理者將專案改為 Public，Settings → Pages → Deploy from a branch → main → /(root) → Save。預期網址 `https://yang-00712.github.io/Oc/`，只有Pages成功後才算上線；網址後面不加`/root`。

目前連線沒有公開設定與Pages管理操作。README不代表管理設定已完成。使用者指定main/(root)，直接推main的Pages和檢查各自執行，應先PR驗證再合併。

`train-model.yml` 只產出模型artifact，不自行發布。`prepare-assets.yml` 限build/ocr指定檔案變更，取得固定artifact、產生圖示與內容識別碼，測試成功才提交指定產物。個人教材不得提交公開repository。

規則在 `AGENTS.md`；路由在 `docs/agent/INDEX.md`；資料流與限制在 `docs/OCR.md`；素材來源在 `docs/CREDITS.md`。
