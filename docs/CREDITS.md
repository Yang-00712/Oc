# 素材與模型來源

## 網站圖示

使用者提供的羽球貓咪照片，採正方形裁切與縮放，沒有宣稱去背景。assets/icon-source.jpg是製作縮圖，180/192/512px PNG由此產生；原始全照未提交。圖片授權用於本網站，不代表可代使用者向第三方重新授權。

## MNIST資料

資料作者與權利人：Yann LeCun、Corinna Cortes；資料說明共同作者包括 Christopher J. C. Burges。MNIST是原NIST資料的衍生資料集。Keras官方載入程式明列資料使用 **Creative Commons Attribution-ShareAlike 3.0**：
https://github.com/keras-team/keras/blob/v2.12.0/keras/datasets/mnist.py
https://creativecommons.org/licenses/by-sa/3.0/

原資料集：
https://yann.lecun.com/exdb/mnist/

下載來源為TensorFlow/Keras鏡像：
https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz
https://www.tensorflow.org/api_docs/python/tf/keras/datasets/mnist/load_data

`assets/demo-times.png`是保留測試集數字經縮放、反相、重新排列的衍生示例；`tests/golden.json`的pixels是32個測試樣本的JSON表示。這些資料部分沿用CC BY-SA 3.0，保留作者、來源與此修改說明，不主張原創。此授權不擴張到使用者照片。

模型由tools/train-model.py在本repository隔離Actions runner訓練；來源SHA256、seed、分割、epoch與精度見models/training-metrics.json。模型權重不含使用者私人教材；示例與測試不能證明其對使用者筆跡的精度。

## 參考

GitHub Pages main/(root)：
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

參考原StrForge已核對的資料隔離、匯出不自動清除、真實測試與實機區分要求，沒有複製C#、WASM、字型或原始使用者資料。

## 新增本機整列模型

PaddleOCR權重著作權屬Baidu/PaddlePaddle及原權利人，Apache-2.0；RapidAI提供ONNX轉換並沿用原授權。固定v3.9.2來源及SHA256在tools/prepare-local-models.py，取得後大小與雜湊在models/local-engines.json，字典由同一模型metadata取得。包含models/PaddleOCR-LICENSE。
https://github.com/RapidAI/RapidOCR/blob/main/python/rapidocr/default_models.yaml
https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/module_usage/text_recognition.html

ONNX Runtime Web 1.22.0，Microsoft Corporation，MIT；npm套件下載以registry發佈的SHA512 integrity核對，隨包附vendor/ort/LICENSE。只包含WASM CPU後端，禁用多執行緒及proxy，不使用外部OCR服務。
https://github.com/microsoft/onnxruntime/tree/v1.22.0
https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html

BGR/CHW正規化與CTC遵守PaddleOCR/RapidOCR公開推論契約。沒有以單一模型換不同名稱，也未訓練使用者照片。各權重獨立；英文與通用版仍屬同一PP-OCR家族。
