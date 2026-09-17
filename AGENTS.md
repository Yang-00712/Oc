# Oc agent 規則

先讀 `docs/agent/INDEX.md`，檢查 git status 與本次涉及檔案。這是新建的獨立靜態 JavaScript PWA，不是 StrForge solution；不得修改其他 repository。根目錄 `index.html` 對應 main / (root)。

照片、人工校正與教材不得上傳遠端，不把使用者教材提交公開 repository。保存資料只能操作 `oc-time-v1`；公開模型權重與已驗證共用引擎另用 `oc-local-model-files-v1`，只能按模型刪除，不得全域清除網站資料。輸入資料不可信，使用 DOM textContent，不把辨識字串插入 HTML。未知資料 schema 必須保留並報錯。

主頁不得預載模型/CNN/Worker；只在使用者明確下載、匯入或辨識時準備資源，推論 Worker 只在辨識時啟動。禁止為「修啟動」加入全域 fetch 攔截、短硬逾時重抓、重建圖示或清快取要求。取消需 terminate Worker；失敗保留舊草稿。數值規則只驗證，不能猜補或自行改時間。

模型權重須通過 SHA-256、schema、shape 與數值驗證。`src/cnn.js` 僅支援現有明確架構；新模型架構先修改並驗證 PyTorch/JS parity，不得只換檔。不要把 single-digit MNIST 分數說成實拍準確率。人工確認時間列不是已驗證的單字分割標籤。

變更後執行 `node tools/stamp.mjs`、`npm test`，檢查差異；跨 Worker/儲存/UI 必跑 GitHub Actions Chromium/WebKit。實際 iPhone 未測就標未驗證。不跳過測試換綠勾、不在手機上安裝訓練工具、不新增不必要的大型依賴或版本號。

沿用固定檔名，原地更新。保留使用者未提交變更；不強制推送。公開設定和 Pages 是管理操作，不能憑 contents write 推論已授權 token 具備 administration scope。
