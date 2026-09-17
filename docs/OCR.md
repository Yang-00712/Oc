# 時間 OCR：資料流與限制

## 來源與範圍

使用者指定獨立 `Yang-00712/Oc`，沿用 StrForge 對話確認的「拍照框時間欄 → 由上往下 → 四位數轉時間 → 人工校正」。已讀原StrForge README 的本機保存、CSV、測試與實體iPhone區分；該文件沒有OCR程式或已訓練模型。此OCR為Oc新建，不是搬移既有辨識器。

原StrForge經驗：大WASM/內嵌字型增加首頁負擔；短硬逾時fetch guard曾讓實機重抓大檔；舊入口配新payload不是有效升級測試。Oc不使用StrForge二進位、字型、全域fetch guard或保存key，採獨立小型入口與按需Worker。

## 執行路徑

選圖 → 裝置解碼與縮小（長邊最多1600px） → 拖曳ROI或輸入比例 → 裁切 → 勾選模型 → 依序核對／載入權重 → Module Worker → 局部對比與逐列切割 → CNN單字或PP-OCR整列推論 → 各自時間結果 → 校正頁 → 人工確認 → 草稿/可選教材 → 目前模型TXT/CSV/剪貼簿。

成功才取代草稿。取消、下載/hash失敗、單一模型4分鐘未完成均終止Worker，不無限重抓，可手動重試。時間先後只警告，不推測字跡或改資料。

## 記憶體與保存

不保存原始全照，只保留操作影像和草稿縮圖；替換canvas時縮回1px，Worker結束即釋放。原圖仍需先解碼，超大檔案或低記憶體裝置有風險，不能以1600px宣稱解碼峰值完全受限。

IndexedDB `oc-time-v1`，state存草稿/比例框，samples存最多2000列。transaction成功才回報已保存；失敗提示先匯出。設定頁大小為JSON估算，不是RAM或瀏覽器總量。自動草稿不等於永久備份。

## 模型與訓練

CNN僅0–9：55,000訓練、5,000驗證、10,000未用於選模的測試圖，seed712；驗證集挑checkpoint。參數JSON，JS實作convolution/ReLU/pooling/linear。32組PyTorch golden logits驗證跨語言一致性，不能取代完整精度測試。

數值在metrics；MNIST結果不可外推至照片/四位時間。實拍只用於本地診斷，不提交公開repository；尚無獨立且經人工標註的個人字跡準確率。

手機只有推論，無訓練器。可選保存已確認列，ZIP包含每列PNG與labels.json。再訓練須校對字框/label，依不同纸張或拍攝session分訓練/測試，避免同頁洩漏。本版沒有可直接吃整列ZIP的digit trainer，不能宣稱一鍵個人微調已完成。

## 能力邊界

已有：檔案/相機入口、矩形ROI、比例模板、±15°傾角、自動列/指定列數、4digit、校正候選、時間檢查、確認、草稿、匯出及教材。

未做：自動找紙角、透視拉正、雲端OCR、個人微調、離線Service Worker、Safari原生相機與主畫面實機驗收。capture只是瀏覽器提示。PP-OCR已提供整列預訓練辨識，但不保證潦草連筆的正確率。

測試使用真實圖片及Worker，不直接塞答案。MNIST拼接示例明確標示，不作使用者字跡測量。

## 多模型比較變更

照片像素在記憶體→逐個Worker執行→各自結果與初判→選模型校正→獨立TXT/CSV。三個預訓練PP-OCR權重以整列辨識，原CNN保留為單字對照。全部在裝置上推論；同一時間最多一個模型，完成即終止Worker。沒有雲端API、使用者教材上傳、全域fetch攔截、短逾時重抓。

`draft.schema=1`保留原rows，新增可選resultsSchema/modelResults/activeEngine；舊rows可還原。未知schema或不合法新資料只報錯不覆蓋。模型失敗不將錯誤結果當成空白成功，已完成模型保存。每個模型的raw與value分離，不用合法時間規則補數字。

`src/engine-assets.js`與`src/model-cache.js`只處理獨立IndexedDB `oc-local-model-files-v1`的公開模型檔案，URL含權重hash。寫入交易完成後才將ArrayBuffer轉移給Worker，避免Worker終止或頁面重載遺失模型。手機下載來自本站，首次下載需網路；無Service Worker，不能宣稱整站離線。移除下載只移除指定模型路徑，不清Oc草稿／教材IndexedDB或StrForge。

本次亦改局部對比切列與墨跡範圍切字，指定列數不再強制等分。單一張照片即使得到26列仍不代表26筆正確，需實拍核對。
