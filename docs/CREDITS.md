# 素材與模型來源

## 網站圖示

使用者在本對話提供的羽球貓咪照片。採正方形裁切與縮放，沒有宣稱去背景或創作全新圖像。`assets/icon-source.jpg` 是製作用縮圖；180/192/512px PNG由這份縮圖產生。原始全尺寸照片未提交。使用者提供圖片用於本網站，不代表已取得向第三方重新授權的權利。

## 手寫數字與模型

MNIST：Yann LeCun、Corinna Cortes、Christopher J. C. Burges 的手寫數字資料集。資料入口採 TensorFlow/Keras MNIST鏡像：
https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz

官方載入/資料說明：
https://www.tensorflow.org/api_docs/python/tf/keras/datasets/mnist/load_data

原資料集首頁：
https://yann.lecun.com/exdb/mnist/

`assets/demo-times.png` 是保留測試集中的數字重新縮放、反相並排列的示例；`tests/golden.json` 含32個測試樣本及模型logits，僅供驗證。這些不是使用者照片，也不是人工輸入答案冒充辨識。資料集權利沿用來源的適用條款，不將素材與資料宣稱為本專案原創或任意重新授權。

模型由 `tools/train-model.py` 在本repository的隔離Actions runner訓練；來源檔SHA256、seed、資料分割、epoch及精度記在 `models/training-metrics.json`。不使用未經辨識的網路模型，也不含使用者私人訓練資料。

## 參考文件

GitHub Pages main / (root) 設定：
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

本專案沿用原StrForge的資料隔離、匯出不自動清除、真實執行才回報通過等已核對要求。並未複製其C#、WASM、字型或原始使用者資料。
