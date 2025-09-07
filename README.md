# TSP IR Analyzer (Web Audio, OATSP)

📈 Web Audio API を使った **Time-Stretched Pulse (OATSP)** ベースの  
Impulse Response (IR) / Transfer Function analyzer.  
ブラウザだけで動作し、マイク入力とスピーカー出力を利用して計測できます。  

This app runs fully in the browser (no server required),  
using **Web Audio API** for playback, recording, and FFT deconvolution.  

---

## ✨ Features / 機能

- Generate **OATSP (Time-Stretched Pulse)** signals (DOWN / UP)  
  OATSP（TSP）信号を生成（DOWN / UP 両対応）
- Record microphone input simultaneously with playback  
  再生と同時にマイク録音
- Analyze impulse response and transfer function |H(f)|  
  インパルス応答と伝達関数 |H(f)| を解析
- Live spectrum analyzer for the selected input device  
  入力デバイスのリアルタイムスペクトラム表示
- Self-Test mode (DOWN⊛UP convolution ≈ delta pulse)  
  セルフテスト（DOWN⊛UP 畳み込みで理想的なパルス確認）
- Export WAV files (TSP / Recording / IR / Self-Test)  
  WAV ファイル出力（TSP / 録音 / IR / セルフテスト）
- Output device selection (Chrome only)  
  出力デバイス選択（Chrome のみ対応）

---

## 🚀 Demo / デモ

GitHub Pages:  
👉 https://<your-username>.github.io/<repository-name>/

---

## 📂 File Structure / ファイル構成

```
index.html           # Main HTML / メインHTML
app.js               # Application logic / アプリ本体
recorder-worklet.js  # AudioWorkletProcessor for recording / 録音用ワークレット
tsp.js               # TSP generation functions / TSP生成関数
```

---

## 🛠 Development / 開発・ローカル実行

1. Clone repository / リポジトリをクローン  
   ```bash
   git clone https://github.com/<your-username>/<repository-name>.git
   cd <repository-name>
   ```

2. Run local server / ローカルサーバを起動（例: Python）  
   ```bash
   python3 -m http.server 8000
   ```
   or use VSCode Live Server. / VSCode Live Server なども可

3. Open in browser / ブラウザでアクセス  
   - http://localhost:8000  
   - HTTPS is not required for localhost / localhost では HTTPS 不要

---

## 🌐 Publish on GitHub Pages / GitHub Pages で公開

1. Go to **Settings → Pages** / リポジトリの **Settings → Pages** を開く  
2. Select **Deploy from a branch** / **Source: Deploy from a branch** を選択  
3. Set **Branch: main, Folder: /(root)** / **Branch: main, Folder: /(root)** を指定  
4. Save → wait a few minutes / 保存後、数分で公開URLが表示されます  

---

## ⚠ Notes / 注意点

- **HTTPS required** for `getUserMedia` (mic) and `setSinkId` (output device)  
  マイク取得・出力切替は HTTPS または localhost でのみ動作
- **Browser compatibility / ブラウザ対応**  
  - Output device selection works best in Chrome / 出力デバイス切替は Chrome 系のみ安定  
  - Safari (esp. iOS) has limitations / Safari (特にiOS) は制限あり
- **Permissions / 権限**: Allow microphone access when prompted  
  初回アクセス時にマイク権限を許可してください
- **Audio environment / オーディオ環境**  
  Loopback/stereo-mixer enabled may affect IR  
  ループバック・ステレオミキサー設定が有効だと測定に影響します

---

## 📜 License / ライセンス

MIT License
