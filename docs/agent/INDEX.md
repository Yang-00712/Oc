# Oc 路由索引

| 主題 | 權威檔案 | 何時讀／搜尋詞 |
|---|---|---|
| 主畫面更新 | `src/update.js`, `tools/stamp.mjs`, `tools/update-check.mjs` | `startUpdates` / pageshow / visibilitychange；不清資料、不重建圖示 |
| 入口與操作 | `index.html`, `src/app.js`, `app.css` | 拍照、框選、校正、`recognize` / `renderRows` |
| 時間規則 | `src/time.js` | `parseTime` / `exportTimes`；不可猜補 |
| 圖片與列切割 | `src/photo.js`, `src/segmentation.js`, `tests/grid.test.mjs` | `cropPhoto` / `segment` / `gridColumn` / `grid30` / `gridEdges` / `normalizeDigit` |
| 推論 | `src/ocr-worker.js`, `src/cnn.js`, `models/model.json` | 權重hash、`infer`、Worker生命週期 |
| 本機保存 | `src/store.js`, `src/zip.js` | IndexedDB、`saveSample`、ZIP、不碰StrForge |
| 訓練與模型來源 | `tools/train-model.py`, `models/training-metrics.json` | MNIST、模型參數、單字測試限制 |
| 手寫壓力測試 | `tests/handwriting-fixtures.mjs`, `tests/handwriting.html`, `tools/handwriting-benchmark.mjs`, `tests/recognition-box.test.mjs` | 30 格合成筆跡 / recognitionBox / 固定答案 / 不代表個人筆跡準確率 |
| 驗證 | `tests/core.test.mjs`, `tools/browser-check.mjs` | unit、parity、跨引擎UI與失敗路徑 |
| 發布 | `README.md`, `.github/workflows/check.yml`, `tools/stamp.mjs` | main/(root)、內容識別碼、PR驗證 |
| 設計與素材 | `docs/OCR.md`, `docs/CREDITS.md` | 原StrForge經驗、已做／未做、來源 |
| 現行通用模型與舊結果隔離 | `src/engines.js`, `src/multi-state.js`, `src/app.js` | `SCAN_ENGINE` / `formSlot` / restoreDraft / modelRuns |
| 整列推論與快取 | `src/line-worker.js`, `src/paddle.js`, `src/engine-assets.js`, `src/model-cache.js` | BGR / CTC / digitsOnly / verifiedAsset / writeModelFile / clearModel |
| 多模型驗證與來源 | `tests/multi.test.mjs`, `tools/multi-browser-check.mjs`, `tools/prepare-local-models.py` | 完整性 / 獨立校正 / 下載非上傳 |
| 模型下載與匯入 | `src/model-pack.js`, `src/asset-download.js`, `src/engine-assets.js`, `index.html` | importModelPack / downloadAsset / prepareEngine；先準備再辨識 |
| 模型包產生與驗收 | `tools/model-packs.py`, `tools/model-install-check.mjs`, `downloads/` | 固定下載點、ZIP_STORED、hash、封鎖資源網路後推論 |

驗證依據：以對應commit的GitHub Actions為準；模型保存於獨立IndexedDB，交易完成後傳給Worker，跨頁重載須實際驗證。
