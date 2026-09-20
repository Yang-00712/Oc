# Oc

獨立的手寫時間辨識網站。`index.html` 位於 repository 根目錄，供 GitHub Pages `main / (root)` 發布。這不是 StrForge 的 .NET/Avalonia 模組，沒有修改 StrForge；不需要在手機或本機安裝 .NET。

## 使用

在「掃描」選照片或拍照，用手指框住由上往下的四位數時間，將旁邊文字留在框外，再按「辨識時間」。例如 `0900`、`0910`、`1002`、`1004`。正式表單選「表單 30 格」，框入第一格上緣到最後一格下緣的整欄格線；每格保留原位，辨識不到的格子留空供校正。練習紙等無格線照片沿用「自由手寫」。切到「校正」對照縮圖修改，全部確認且合法才可複製或匯出 TXT／CSV。結果為 `09:00`，每個時間一行，保留順序和前導零。模型分數不是正確率，合法時間也可能辨識錯。

可記住框選比例座標，新照片仍需核對框位。±15° 微調不是透視校正。自由手寫先以局部對比降低陰影干擾，再按列間距切割；指定列數僅核對，不再等高硬切。表單先在框內追蹤兩側細長格線，依真正欄寬找橫線，容許少量左右留白、色塊及輕微傾斜。比一格高度更窄的邊欄會排除；有兩個可用資料欄時要求縮小框選，避免選錯。每列原圖與模型輸入均限制在時間欄內。表單預設偵測完整 31 條橫線；只有上／下外框缺線時，可在「表單外框」明確指定以框選頂端、底端或兩端代替。需要分別找到 30／29 條其餘格線，且缺線端距下一條線須像完整一格；中間缺線或大片黑帶仍停止，不平均硬切。使用框選邊界的首／末格會提示核對，並保留空白位置。每批最多100列。

## 主畫面捷徑更新

啟動、回到前景或恢復連線時，以 `cache: no-cache` 核對本站小型 `index.html` 的內容識別碼，30 秒內合併重複檢查；不下載模型、不持續輪詢。尚未操作且沒有照片時可自動更新；已操作時顯示更新提示，也可到設定按「檢查更新」及「更新並保留資料」。辨識、安裝或其他操作未完成時不重載；更新等待草稿交易完成，儲存失敗或未知 schema 時保留畫面。照片不保存，手動更新前會提醒需重新選取。每個新版最多自動跳轉一次，失敗時可手動重試，不清快取或重建圖示。

第一次取得此更新功能時，舊的暫停畫面本身仍不會檢查：先從多工畫面關閉 Oc，再由原主畫面圖示開啟並連線載入新版。毋須刪除捷徑或清網站資料。WebKit 自動化不是實體 iPhone 主畫面驗收。

## 目前使用的模型

新掃描只使用 PP-OCRv5 通用。其他模型的原權重與下載包保留在 repository，舊多模型草稿也保留並可查看；手機正常操作介面不再提供其他模型選項。TXT／CSV 匯出目前顯示的校正結果，時間格式與人工確認規則不變。

數字限定預設生效：PP-OCR 選字只允許 ASCII `0–9` 與內部 CTC 空白標記，保留 `0900` 這類前導零／重複字，不是辨識後刪除英文。缺字、多字、無效時間仍須人工核對；不自動補零、截字、改時間或確認。原字典文字只在「原始辨識與候選」展開對照，不混入數字輸入／匯出。舊草稿保持原樣；重新辨識才使用數字限制。沿用已匯入權重與引擎，無需重新下載模型，不能宣稱辨識率必然提高。

不需要Python、不需要養模型、不需要教材ZIP。收集教材保留為選用功能，預設不開啟。模型分數不是正確率；「修改」只統計使用者改過的列數。

PP-OCR模型由GitHub runner取得已訓練且固定雜湊的權重，隨本站發布。手機只從本站下載，照片及像素不傳到GitHub或任何OCR服務。英文v5約7.5MiB、通用v5約16.0MiB、英文v4約7.3MiB，共用ONNX Runtime Web約10.8MiB；實際bytes見models/local-engines.json。權重磁碟大小不代表推論RAM。模型按需載入，首頁不載入；設定頁可查看或只移除指定模型快取。

## 先存手機，再匯入

設定頁的「模型安裝與容量」提供兩步：

1. 按「下載通用模型 ZIP」，存入 iPhone「檔案」。先前下載的完整包也包含通用模型，可直接使用，不需再下載或解壓。
2. 回到平常使用的 Oc 主畫面入口，設定 →「從檔案匯入模型 ZIP」→ 選檔 → 等到匯入完成，且通用模型顯示「可辨識」。再回掃描頁辨識。

本站固定下載檔位於 `downloads/Oc-Models.zip` 與 `downloads/Oc-PP-OCRv5-General.zip`。下載只是保存 ZIP，不會自動安裝。不是匯出教材，也不是 Oc 原始碼 ZIP。瀏覽器下載介面可能不同；必要時以 Safari 開啟下載連結，保存後仍回原 Oc 入口匯入。

匯入會先檢查全部檔案的 SHA-256，再寫入獨立模型保存區，包含共用 WASM 引擎。使用 `ZIP_STORED` 逐檔讀取，無需大型解壓依賴；任意重新壓縮／不符合清單的包會拒絕。失敗、取消保留已完整保存檔案與草稿，不自動清資料。

也可用掃描頁「下載並保存通用模型」或設定頁通用模型的「下載並保存」。下載顯示檔名、位元組進度；下載準備與四分鐘辨識計時分開。匯入後模型與共用引擎都從本機讀取，網站入口與普通 JS 仍需正常載入；不宣稱整站可離線。

## 資料與模型

照片在裝置內處理，不上傳。原始全照不保存；草稿包含結果與每列小縮圖，存於獨立 IndexedDB `oc-time-v1`。不讀取、刪除或修改 StrForge 資料。瀏覽器清除網站資料仍可能移除 Oc 資料，請定期匯出。

「收集我確認的字跡」預設關閉，勾選後在人工確認時保存列縮圖與四位答案，最多2000列；設定頁可匯出 `TimeOcrTraining.zip`。它是教材，不是模型，不會自動上傳或訓練。未核對的切字不能當成每個數字的訓練標籤。

原有 CNN 模型在 GitHub Actions 用 MNIST 公開資料訓練，權重在 `models/time-digit.json`。手機只在點辨識時透過 Worker 載入；此 CNN 的推論採與 PyTorch 對齊的小型 JavaScript 實作，不需 ONNX runtime；只有選 PP-OCR 時才載入共用 ONNX Runtime Web。模型不是用你的字跡訓練；MNIST 單字測試不代表實拍時間正確率。完整度量在 `models/training-metrics.json`。

本版沒有 Service Worker 或整站離線保證。模型權重、字典與共用執行引擎由 Window 保存於獨立 IndexedDB `oc-local-model-files-v1`，交易完成並讀回驗證後才以 transferable ArrayBuffer 交給 Worker；不依賴 WebKit 的 CacheStorage 跨頁保留。共用引擎僅以本站固定雜湊驗證的 Blob URL 執行，不執行任意 ZIP 腳本。清理模型不清草稿。每次只執行一個 Worker；下載準備最多15分鐘，模型準備好後才開始四分鐘初始化／辨識計時；取消或錯誤保留已完成的其他模型。不攔截全域 fetch、不自動反覆重抓。

## 開發與檢查

```sh
npm test
node tools/stamp.mjs --check
node tools/serve.mjs
```

本地網址 `http://127.0.0.1:4173/Oc/`。真實瀏覽器流程另執行 `node tools/multi-browser-check.mjs`。模型安裝驗收依序執行 `python tools/model-packs.py` 與 `node tools/model-install-check.mjs`，測試設定頁實際下載、匯入、重載、模型與引擎 HTTP 封鎖後的通用模型推論、損毀包拒絕與資料保留。修改 `src/*.js`、CSS 或 `index.html` 後執行 `node tools/stamp.mjs` 再提交；內容識別碼不是產品版本號。

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
