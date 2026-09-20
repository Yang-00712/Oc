# 時間 OCR：資料流與限制

## 來源與範圍

使用者指定獨立 `Yang-00712/Oc`，沿用 StrForge 對話確認的「拍照框時間欄 → 由上往下 → 四位數轉時間 → 人工校正」。已讀原StrForge README 的本機保存、CSV、測試與實體iPhone區分；該文件沒有OCR程式或已訓練模型。此OCR為Oc新建，不是搬移既有辨識器。

原StrForge經驗：大WASM/內嵌字型增加首頁負擔；短硬逾時fetch guard曾讓實機重抓大檔；舊入口配新payload不是有效升級測試。Oc不使用StrForge二進位、字型、全域fetch guard或保存key，採獨立小型入口與按需Worker。

## 執行路徑

選圖 → 裝置解碼與縮小（長邊最多1600px） → 拖曳ROI或輸入比例 → 裁切 → 自由手寫或30格表單分列 → 按需載入PP-OCRv5通用權重 → Module Worker整列推論 → 校正頁 → 人工確認 → 草稿/可選教材 → TXT/CSV/剪貼簿。其他模型仍在原資料與舊草稿中，但不在新掃描介面提供選項。

成功才取代草稿。下載／匯入準備最多15分鐘；全部模型與共用引擎資源準備完成後，才開始四分鐘初始化／辨識計時。取消、下載/hash失敗會停止目前操作、保留已完成結果與檔案，不無限重抓，可手動重試。時間先後只警告，不推測字跡或改資料。

## 記憶體與保存

不保存原始全照，只保留操作影像和草稿縮圖；替換canvas時縮回1px，Worker結束即釋放。原圖仍需先解碼，超大檔案或低記憶體裝置有風險，不能以1600px宣稱解碼峰值完全受限。

IndexedDB `oc-time-v1`，state存草稿/比例框，samples存最多2000列。transaction成功才回報已保存；失敗提示先匯出。設定頁大小為JSON估算，不是RAM或瀏覽器總量。自動草稿不等於永久備份。

## 模型與訓練

CNN僅0–9：55,000訓練、5,000驗證、10,000未用於選模的測試圖，seed712；驗證集挑checkpoint。參數JSON，JS實作convolution/ReLU/pooling/linear。32組PyTorch golden logits驗證跨語言一致性，不能取代完整精度測試。

數值在metrics；MNIST結果不可外推至照片/四位時間。實拍只用於本地診斷，不提交公開repository；尚無獨立且經人工標註的個人字跡準確率。

手機只有推論，無訓練器。可選保存已確認列，ZIP包含每列PNG與labels.json。再訓練須校對字框/label，依不同纸張或拍攝session分訓練/測試，避免同頁洩漏。本版沒有可直接吃整列ZIP的digit trainer，不能宣稱一鍵個人微調已完成。

## 能力邊界

已有：檔案/相機入口、矩形ROI、比例模板、±15°傾角、自由手寫自動列/指定列數、30格表單分列、4digit、校正候選、時間檢查、確認、草稿、匯出及教材。

30格表單只在ROI內找橫線，要求31條邊界及可信間距；找不到完整格線即報錯，不以文字列數或整欄等高切片猜格位。每個格位都形成獨立結果，空格保留待人工修改；表單草稿的`formSlot`記錄1–30，校正頁不允許新增或刪除這些格位。框選必須包含第一格上緣和最後一格下緣，且旁邊文字須在框外。照片未做透視校正，傾斜、遮蔽或格線不完整仍可能失敗；正式手機拍攝需另驗收。

未做：自動找紙角、透視拉正、雲端OCR、個人微調、離線Service Worker、Safari原生相機與主畫面實機驗收。capture只是瀏覽器提示。PP-OCR已提供整列預訓練辨識，但不保證潦草連筆的正確率。

測試使用真實圖片及Worker，不直接塞答案。MNIST拼接示例明確標示，不作使用者字跡測量。

## 多模型比較變更

原多模型資料結構及權重保留供舊草稿還原，現行新掃描只執行PP-OCRv5通用。照片像素在記憶體→一個Worker執行→目前結果與初判→校正→TXT/CSV。推論在裝置上執行，完成即終止Worker。沒有雲端API、使用者教材上傳、全域fetch攔截、短逾時重抓。

`draft.schema=1`保留原rows，新增可選resultsSchema/modelResults/activeEngine；舊rows可還原。未知schema或不合法新資料只報錯不覆蓋。模型失敗不將錯誤結果當成空白成功，已完成模型保存。每個模型的raw與value分離，不用合法時間規則補數字。

`src/engine-assets.js`與`src/model-cache.js`只處理獨立IndexedDB `oc-local-model-files-v1`的公開模型、字典與共用引擎，URL含檔案hash。寫入交易完成並讀回驗證後才將ArrayBuffer轉移給Worker；Worker以經固定hash驗證的Blob URL載入共用引擎，不需再次HTTP下載大檔。手機下載來自本站，首次下載需網路；無Service Worker，不能宣稱整站離線。移除下載只移除指定模型路徑，不清Oc草稿／教材IndexedDB或StrForge。

本次亦改局部對比切列與墨跡範圍切字，指定列數不再強制等分。單一張照片即使得到26列仍不代表26筆正確，需實拍核對。

## 數字限定解碼

三個 PP-OCR Worker 呼叫 `decodeCTC(..., {digitsOnly:true})`，只從原字典的 ASCII 0–9 與第0類blank選字；不修改模型輸出維度或權重。CNN本來只有0–9。保留同一類相鄰合併、blank隔開可重複的CTC規則；不把O/I或標點替換成數字，不強制四位或合法HHMM。

`raw`與初始`value`為數字結果；原完整字典greedy結果保留在既有`transcript`，新增可選`numericOnly`標記。只有展開詳情才顯示限定前文字，DOM使用textContent。分數不重新正規化，非數字候選被排除時提示核對；全部新結果仍未確認。字元限制不能修好混列或保證準確率。schema與匯出格式不變，舊草稿不重算或靜默改字。

## 模型 ZIP 安裝

設定頁只顯示本站 `downloads/Oc-PP-OCRv5-General.zip` 下載連結；原完整 `downloads/Oc-Models.zip` 仍保留並可匯入。使用者回到原 Oc 入口用 file input 選取 ZIP；下載不代表已匯入。

`src/model-pack.js` 僅接受大小及檔數受限的 ZIP_STORED 包。全包依本站 `src/model-catalog.js` 固定清單驗證，不能信任包內自帶hash或執行任意腳本；每個檔案完整驗證後才寫入，損毀包不覆蓋正常模型。模型與共用引擎均完整保存才標可辨識。

`tools/model-install-check.mjs` 從設定頁點真實通用包下載連結，核對下載內容、匯入下載檔、重載，再封鎖模型與共用引擎HTTP請求進行通用模型實際推論。另驗證損毀包拒絕、取消、四分鐘邊界與資料保留；不代表實體iPhone驗收或整站離線。
