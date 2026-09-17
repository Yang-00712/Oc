# Oc 路由索引

| 主題 | 權威檔案 | 何時讀／搜尋詞 |
|---|---|---|
| 入口與操作 | `index.html`, `src/app.js`, `app.css` | 拍照、框選、校正、`recognize` / `renderRows` |
| 時間規則 | `src/time.js` | `parseTime` / `exportTimes`；不可猜補 |
| 圖片與列切割 | `src/photo.js`, `src/segmentation.js` | `cropPhoto` / `segment` / `normalizeDigit` |
| 推論 | `src/ocr-worker.js`, `src/cnn.js`, `models/model.json` | 權重hash、`infer`、Worker生命週期 |
| 本機保存 | `src/store.js`, `src/zip.js` | IndexedDB、`saveSample`、ZIP、不碰StrForge |
| 訓練與模型來源 | `tools/train-model.py`, `models/training-metrics.json` | MNIST、模型參數、單字測試限制 |
| 驗證 | `tests/core.test.mjs`, `tools/browser-check.mjs` | unit、parity、跨引擎UI與失敗路徑 |
| 發布 | `README.md`, `.github/workflows/check.yml`, `tools/stamp.mjs` | main/(root)、內容識別碼、PR驗證 |
| 設計與素材 | `docs/OCR.md`, `docs/CREDITS.md` | 原StrForge經驗、已做／未做、來源 |

驗證依據：由初始化時的實際檔案建立；測試結果以對應commit的GitHub Actions為準。
