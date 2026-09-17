# Oc

獨立的手寫時間辨識網站。`index.html` 位於 repository 根目錄，供 GitHub Pages `main / (root)` 發布。這不是 StrForge 的 .NET/Avalonia 模組；沒有修改 StrForge，也不需要在手機或本機安裝 .NET。

## 使用

開啟「掃描」選照片或拍照，用手指框住由上往下的時間欄，再按「辨識時間」。每列四位數，例如 `0900`、`0910`、`1002`、`1004`。切到「校正」後對照縮圖修改；全部確認且合法才可複製、匯出 TXT 或 CSV。結果格式為 `09:00`，保留列順序和前導零。模型分數不是正確率，合法時間也可能辨識錯。

可記住框選的比例座標；新照片仍需核對框位。±15° 微調不是自動透視校正。自動漏列時可填實際列數，並框齊上下邊界；等寬四格只適用字距對齊。每批最多 100 列。

## 資料與訓練

照片在裝置內處理，不上傳伺服器。原始全照不保存；校正草稿包含結果及每列小縮圖，存於獨立 IndexedDB `oc-time-v1`。不讀取、刪除或修改 StrForge 的保存內容。瀏覽器清除網站資料仍可能移除 Oc 資料；請定期匯出。

「收集我確認的字跡」預設關閉；勾選後只在人工確認時保存時間列縮圖與四位答案，最多 2,000 列。設定頁可匯出 `TimeOcrTraining.zip`。它是教材，不是訓練好的模型；不會自動上傳或重新訓練。不能把未核對的切字自動當成每個數字的標籤。

初始模型已使用 MNIST 公開資料在 GitHub Actions 訓練。小型 CNN 的權重在 `models/time-digit.json`；手機只在點辨識時透過 Worker 載入。推論採與 PyTorch 對齊的小型 JavaScript 實作，不需要通用 ONNX/TensorFlow runtime。模型不是由使用者筆跡訓練，MNIST 單字測試不能代表實拍整列正確率。完整度量及限制見 `models/training-metrics.json`。

本版不含 Service Worker，沒有離線保證。失敗或 90 秒未完成會停止該 Worker，保留原有草稿；不攔截全域 fetch、不反覆重抓、不清資料。

## 開發與檢查

```sh
npm test
node tools/stamp.mjs --check
node tools/serve.mjs
```

測試頁面路徑為 `http://127.0.0.1:4173/Oc/`。修改 `src/*.js` 或 CSS 後先執行 `node tools/stamp.mjs`，再提交；內容識別碼不是產品版本號。

瀏覽器檢查需指定隔離安裝的 Playwright ES module 路徑：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/browser-check.mjs
```

CI 使用 Node.js 22、Playwright 1.63.0；不把瀏覽器測試工具放進手機網站下載路徑。含模型權重完整性、PyTorch/JS logits 對照、時間規則、真實 Worker OCR、校正、草稿重載、教材 ZIP、儲存失敗、模型損毀與 320px 顯示檢查。WebKit 行動模擬不等同實體 iPhone 的相機或主畫面驗收。

## 發布

管理者在 GitHub 將本專案改為 Public，Settings → Pages → Deploy from a branch → main → /(root) → Save。预期網址為 `https://yang-00712.github.io/Oc/`；只有 Pages 顯示成功後才算已上線。不要將 `/root` 加在網址末端。

這個連線只能寫程式和執行 Actions，未提供公開設定及 Pages 管理操作。README 不代表這些管理設定已完成。`main / (root)` 發布沿用使用者指定方式；直接推 main 的 Pages 與檢查是分開執行，應先在 PR 通過再合併。

`train-model.yml` 是受限的模型製作工具，只產出 artifact，不會自行發布模型。`prepare-assets.yml` 只在 `build/ocr` 的指定檔案變更時，取得已核對 artifact、產生圖示及內容識別碼；測試成功後只提交指定產物。個人教材不应放進公開 repository。

## 參考

專案專屬規則見 `AGENTS.md`；路由見 `docs/agent/INDEX.md`；資料流、驗收限制與原 StrForge 經驗對應見 `docs/OCR.md`。素材來源見 `docs/CREDITS.md`。
