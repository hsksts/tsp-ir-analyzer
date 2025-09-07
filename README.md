# TSP IR Analyzer (Web Audio, OATSP)

📈 A browser-based **Time-Stretched Pulse (OATSP)** analyzer for impulse response (IR) and transfer function measurement.  
ブラウザだけで動作する **OATSP（時間伸長パルス）法** に基づくインパルス応答・伝達関数解析アプリです。

---

## 🌐 Live Demo / 公開ページ

👉 [TSP IR Analyzer on GitHub Pages](https://hsksts.github.io/tsp-ir-analyzer/)

---

## ✨ Features / 機能

- Generate **OATSP (TSP) signals** (DOWN / UP)  
  OATSP（DOWN / UP）の信号生成
- Play & record simultaneously / 同時再生・録音
- Impulse response & transfer function analysis  
  インパルス応答・伝達関数の解析（FFT逆畳み込み）
- Live spectrum analyzer (input device)  
  入力デバイスのリアルタイムスペクトル表示
- Self-Test (DOWN⊛UP convolution ≈ delta pulse)  
  セルフテスト機能（DOWN⊛UP 畳み込みで理想パルス確認）
- Export WAV files (TSP / Recording / IR / Self-Test)  
  WAV ダウンロード（TSP / 録音 / IR / セルフテスト）
- Output device selection (Chrome only)  
  出力デバイス切替（Chrome のみ対応）

---

## 🖥 How to Use / 使い方

1. **Mic permission**: Allow microphone access when prompted.  
   初回アクセス時にマイク使用を許可してください。
2. **Generate TSP**: Click *🎛️ TSP生成* to create Down/Up signals.  
   「🎛️ TSP生成」で Down/Up TSP を生成。
3. **Play & Record**: Click *▶️ 再生＆録音* to excite and record.  
   「▶️ 再生＆録音」でスピーカー出力とマイク録音を同時実行。
4. **Analyze**: Click *🧮 解析* to compute IR and |H(f)|.  
   「🧮 解析」でインパルス応答・伝達関数を算出。
5. **Self-Test** (optional): Use *🧪 Self-Test* to check TSP pair.  
   「🧪 Self-Test」で生成TSPの動作確認。

---

## 📂 File Structure / ファイル構成

```
index.html           # UI / メインページ
app.js               # Core logic / アプリ本体
recorder-worklet.js  # AudioWorkletProcessor for recording / 録音用ワークレット
tsp.js               # TSP generation utilities / TSP生成関数
```

---

## ⚠ Notes / 注意事項

- **HTTPS required**: Works only on HTTPS or localhost.  
  HTTPS または localhost でのみ動作します。
- **Browser support**:  
  - Chrome recommended (full support for setSinkId).  
  - Safari (especially iOS) has limitations.  
  Chrome 系ブラウザ推奨（Safari/iOS は制限あり）。
- **Output device selection**: `setSinkId` is Chrome-only.  
  出力デバイス切替は Chrome 限定。
- **Audio environment**: Loopback/stereo-mixer may affect IR.  
  ループバック・ステレオミキサーが有効だと解析に影響する場合があります。

---

## 📜 License / ライセンス

MIT License
