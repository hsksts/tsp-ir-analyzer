/* TSP (OATSP) IR Analyzer + Live Spectrum + Playback Select (DOWN/UP) + Self‑Test
   出力デバイス選択：<audio>.setSinkId() + フォールバック（既定出力にも同時出力）
   スペクトルアナライザ：選択デバイスのみ監視
   ★表示用基準化（Normalize for display）を追加：Recording / IR / Self‑Test を最大表示
*/

(() => {
  // ===== DOM =====
  const jisuEl = document.getElementById('jisu');
  const ampAEl = document.getElementById('ampA');
  const tailEl = document.getElementById('silenceTail');
  const playGainEl = document.getElementById('playGain');
  const playSigEl = document.getElementById('playSig');
  const micSelect = document.getElementById('micSelect');
  const spkSelect = document.getElementById('spkSelect');
  const sinkNote = document.getElementById('sinkNote');
  const httpsWarn = document.getElementById('httpsWarn');
  const normDisplayEl = document.getElementById('normDisplay');

  const genBtn = document.getElementById('genBtn');
  const playRecBtn = document.getElementById('playRecBtn');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const monitorBtn = document.getElementById('monitorBtn');
  const selfTestBtn = document.getElementById('selfTestBtn');

  const excitationInfo = document.getElementById('excitationInfo');
  const inverseInfo = document.getElementById('inverseInfo');
  const recordingInfo = document.getElementById('recordingInfo');
  const lagInfo = document.getElementById('lagInfo');
  const srInfo = document.getElementById('srInfo');
  const fsDisp = document.getElementById('fsDisp');
  const dlArea = document.getElementById('dlArea');

  const micSpecCanvas = document.getElementById('micSpectrum');
  const micSpecCtx = micSpecCanvas.getContext('2d');
  const irCanvas = document.getElementById('irCanvas');
  const magCanvas = document.getElementById('magCanvas');
  const irCtx = irCanvas.getContext('2d');
  const magCtx = magCanvas.getContext('2d');

  const sinkAudio = document.getElementById('sinkAudio');

  // ===== Error helpers =====
  function notifyError(prefix, err) {
    console.error(prefix, err);
    alert(`${prefix}\n${(err && err.message) ? err.message : err}`);
  }
  window.addEventListener('error', (e) => notifyError('エラーが発生しました', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => notifyError('未処理の例外です', e.reason));

  // ===== Audio =====
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx;
  try { audioCtx = new AudioCtx(); }
  catch (e) { notifyError('AudioContextの初期化に失敗しました', e); return; }
  const fs = audioCtx.sampleRate;
  srInfo.textContent = `${fs} Hz`;
  fsDisp.value = `${fs} Hz`;

  // Worklet
  let workletReady = false;
  (async () => {
    try {
      if (audioCtx.audioWorklet) {
        await audioCtx.audioWorklet.addModule('recorder-worklet.js');
        workletReady = true;
      }
    } catch (e) {
      console.warn('AudioWorklet load failed, fallback to ScriptProcessor', e);
      workletReady = false;
    }
  })();

  // ===== State =====
  let downTSPBuf = null, upTSPBuf = null;           // 再生用（tail付き）
  let downTSPFloat = null, upTSPFloat = null;       // 参照（tail無し）
  let lastPlayedRefFloat = null;                    // 直近に再生した参照（down/up）
  let lastPlayedName = 'down';                      // 'down' or 'up'
  let recorded = null, recDurationSec = 0, alignLag = 0;
  let micStream = null;       // 録音用ストリーム
  let mediaDeviceId = null;

  // Monitor用（指定デバイスの専用ストリーム）
  let monStream = null, monSource = null, monAnalyser = null, monAnimId = null, monitorOn = false;

  // 出力（スピーカー）選択用：WebAudio → MediaStreamDestination → <audio>（＋既定出力にも並列）
  const sinkDest = audioCtx.createMediaStreamDestination();
  const sinkGain = audioCtx.createGain(); sinkGain.gain.value = 1;
  sinkGain.connect(sinkDest);                 // 切替先（<audio>）へ
  sinkGain.connect(audioCtx.destination);     // 既定出力にも常に出す（フォールバック）
  sinkAudio.srcObject = sinkDest.stream;

  // HTTPS チェック
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    httpsWarn.textContent = '⚠ 出力デバイス切替は HTTPS でのみ有効（Chrome推奨）。localhost も可。';
  }

  // ===== Helpers =====
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 画面描画：基準化対応
  function drawSignal(canvasCtx, data, color = '#24d1a0', label) {
    const { width, height } = canvasCtx.canvas;
    canvasCtx.fillStyle = '#111';
    canvasCtx.fillRect(0, 0, width, height);

    if (!data || data.length === 0) return;
    // Normalize for display (optional)
    let scale = 0.45;
    if (normDisplayEl && normDisplayEl.checked) {
      let maxAbs = 0;
      for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > maxAbs) maxAbs = a; }
      if (maxAbs > 1e-12) scale = 0.48 / maxAbs;
    }

    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    const N = data.length, mid = height / 2;
    canvasCtx.moveTo(0, mid);
    for (let x = 0; x < width; x++) {
      const idx = Math.floor((x / (width - 1)) * (N - 1));
      const y = mid - data[idx] * (height * scale);
      canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();

    if (label) {
      canvasCtx.fillStyle = 'rgba(255,255,255,.75)';
      canvasCtx.font = '12px system-ui,sans-serif';
      canvasCtx.fillText(label, 8, 16);
    }
  }

  function drawMag(canvasCtx, mags, sr, color = '#24d1a0', label) {
    const { width, height } = canvasCtx.canvas;
    canvasCtx.fillStyle = '#111';
    canvasCtx.fillRect(0, 0, width, height);
    if (!mags) return;

    const N = mags.length;
    const fMax = sr / 2, fMin = 20;
    const logMin = Math.log10(fMin), logMax = Math.log10(fMax);
    let maxdB = -Infinity, mindB = Infinity;
    for (let i = 1; i < N; i++) {
      const db = 20 * Math.log10(clamp(mags[i], 1e-12, 1e12));
      if (db > maxdB) maxdB = db;
      if (db < mindB) mindB = db;
    }
    const top = Math.ceil(maxdB / 10) * 10;
    const bottom = Math.floor(mindB / 10) * 10;

    canvasCtx.strokeStyle = 'rgba(255,255,255,.08)';
    canvasCtx.beginPath();
    [100, 1000, 10000].forEach(f => {
      const t = (Math.log10(f) - logMin) / (logMax - logMin);
      const x = t * width;
      canvasCtx.moveTo(x, 0); canvasCtx.lineTo(x, height);
    });
    canvasCtx.stroke();

    canvasCtx.strokeStyle = color;
    canvasCtx.beginPath();
    let started = false;
    for (let i = 1; i < N; i++) {
      const f = (i / (N - 1)) * fMax;
      if (f < fMin) continue;
      const t = (Math.log10(f) - logMin) / (logMax - logMin);
      const x = clamp(t * width, 0, width);
      const db = 20 * Math.log10(clamp(mags[i], 1e-12, 1e12));
      const y = height - ((db - bottom) / (top - bottom)) * height;
      if (!started) { canvasCtx.moveTo(x, y); started = true; } else canvasCtx.lineTo(x, y);
    }
    canvasCtx.stroke();

    if (label) {
      canvasCtx.fillStyle = 'rgba(255,255,255,.75)';
      canvasCtx.font = '12px system-ui,sans-serif';
      canvasCtx.textAlign = 'left';
      canvasCtx.fillText(label, 8, 16);
    }
  }

  // ===== WAV utils =====
  function floatToWavBlob(float32, sr) {
    const len = float32.length;
    const buffer = new ArrayBuffer(44 + len * 2);
    const view = new DataView(buffer);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true);
    writeStr(8, 'WAVE'); writeStr(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true); // mono
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    writeStr(36, 'data'); view.setUint32(40, len * 2, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
    }
    return new Blob([view], { type: 'audio/wav' });
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.textContent = `⬇ ${filename}`;
    a.onclick = () => { setTimeout(() => URL.revokeObjectURL(url), 5000); };
    dlArea.appendChild(a);
  }

  // ===== FFT / IFFT / Convolution / Lag =====
  function fftComplex(re, im) { /* ...同前... */ 
    const n = re.length;
    if (n !== im.length) throw new Error('FFT len mismatch');
    if ((n & (n - 1)) !== 0) throw new Error('FFT length must be power of 2');
    let i = 0, j = 0;
    for (i = 0; i < n; i++) {
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
      let m = n >> 1;
      while (m && (j & m)) { j ^= m; m >>= 1; }
      j |= m;
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const theta = -2 * Math.PI / size;
      const wpr = Math.cos(theta), wpi = Math.sin(theta);
      for (let start = 0; start < n; start += size) {
        let wr = 1, wi = 0;
        for (let k = 0; k < half; k++) {
          const i1 = start + k, i2 = i1 + half;
          const tr = wr * re[i2] - wi * im[i2];
          const ti = wr * im[i2] + wi * re[i2];
          re[i2] = re[i1] - tr; im[i2] = im[i1] - ti;
          re[i1] += tr; im[i1] += ti;
          const wr2 = wr * wpr - wi * wpi;
          wi = wr * wpi + wi * wpr;
          wr = wr2;
        }
      }
    }
  }
  function ifftComplex(re, im) {
    const n = re.length;
    const r = new Float64Array(n), i = new Float64Array(n);
    for (let k = 0; k < n; k++) { r[k] = re[k]; i[k] = -im[k]; }
    fftComplex(r, i);
    for (let k = 0; k < n; k++) { re[k] = r[k] / n; im[k] = -i[k] / n; }
  }
  function estimateLag(x, y) {
    const N = Math.min(x.length, y.length);
    const L = Math.min(2 * fs, N - 1);
    let bestLag = 0, bestVal = -Infinity;
    for (let lag = -L; lag <= L; lag++) {
      let sum = 0;
      const iStart = Math.max(0, -lag), iEnd = Math.min(N, N - lag);
      for (let i = iStart; i < iEnd; i++) sum += x[i] * y[i + lag];
      if (sum > bestVal) { bestVal = sum; bestLag = lag; }
    }
    return bestLag;
  }
  const nextPow2 = (v)=>{ let p=1; while(p<v) p<<=1; return p; };
  function fftConvolveReal(x, y) {
    const Nx = x.length, Ny = y.length;
    const nfft = nextPow2(Nx + Ny - 1);
    const ReX = new Float64Array(nfft), ImX = new Float64Array(nfft);
    const ReY = new Float64Array(nfft), ImY = new Float64Array(nfft);
    for (let i=0;i<Nx;i++) ReX[i] = x[i];
    for (let i=0;i<Ny;i++) ReY[i] = y[i];
    fftComplex(ReX, ImX); fftComplex(ReY, ImY);
    const ReZ = new Float64Array(nfft), ImZ = new Float64Array(nfft);
    for (let k=0;k<nfft;k++){
      const a=ReX[k], b=ImX[k], c=ReY[k], d=ImY[k];
      ReZ[k] = a*c - b*d;
      ImZ[k] = a*d + b*c;
    }
    ifftComplex(ReZ, ImZ);
    const out = new Float32Array(Nx + Ny - 1);
    for (let i=0;i<out.length;i++) out[i] = ReZ[i];
    return out;
  }

  // ===== OATSP (TSP) generator =====
  function generateTSP_OATSP(Jisu, A) {
    const N = 2 ** Jisu;
    const J = 2 ** (Jisu - 1);
    const L = Math.floor((N - J) / 2);
    if (N > (1 << 23)) throw new Error(`N=2^${Jisu} が大きすぎます（${N} samples）`);

    const Hr = new Float64Array(N);
    const Hi = new Float64Array(N);
    const twoPi = 2 * Math.PI;

    for (let k = 0; k <= N / 2; k++) {
      const kn = k / N;
      const phase = (2 * J * Math.PI * kn * kn) % twoPi;
      Hr[k] = A * Math.cos(phase);
      Hi[k] = A * Math.sin(phase);
    }
    for (let k = 1; k < N / 2; k++) {
      const kc = N - k;
      Hr[kc] = Hr[k];
      Hi[kc] = -Hi[k];
    }

    const yr = Hr.slice(0), yi = Hi.slice(0);
    ifftComplex(yr, yi);
    const Y = new Float32Array(N);
    for (let n = 0; n < N; n++) Y[n] = yr[n];

    const YY = new Float32Array(N);
    const Ls = Math.floor((N - J) / 2);
    YY.set(Y.subarray(0, Ls), N - Ls);
    YY.set(Y.subarray(Ls, N), 0);

    const Gr = new Float64Array(N), Gi = new Float64Array(N);
    for (let n = 0; n < N; n++) { Gr[n] = Hr[n]; Gi[n] = -Hi[n]; }
    const zr = Gr.slice(0), zi = Gi.slice(0);
    ifftComplex(zr, zi);
    const YG = new Float32Array(N);
    for (let n = 0; n < N; n++) YG[n] = zr[n];

    const YYG = new Float32Array(N);
    YYG.set(YG.subarray(N - Ls, N), 0);
    YYG.set(YG.subarray(0, N - Ls), Ls);

    let maxAbs = 0;
    for (let i = 0; i < N; i++) maxAbs = Math.max(maxAbs, Math.abs(YY[i]), Math.abs(YYG[i]));
    if (maxAbs > 0.99) {
      const s = 0.99 / maxAbs;
      for (let i = 0; i < N; i++) { YY[i] *= s; YYG[i] *= s; }
    }
    return { YY, YYG, N, J, L: Ls };
  }
  function float32ToBuffer(float32, fs) {
    const buf = audioCtx.createBuffer(1, float32.length, fs);
    buf.copyToChannel(float32, 0);
    return buf;
  }

  // ===== Device list & permissions =====
  async function refreshDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    const spks = devices.filter(d => d.kind === 'audiooutput');

    micSelect.innerHTML = '';
    mics.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Mic ${idx + 1}`;
      micSelect.appendChild(opt);
    });
    if (mics[0]) mediaDeviceId = mics[0].deviceId;

    spkSelect.innerHTML = '';
    if (sinkAudio.setSinkId) {
      spks.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Speaker ${idx + 1}`;
        spkSelect.appendChild(opt);
      });
      sinkNote.textContent = spks.length ? '（出力先を選べます）' : '（出力デバイスが検出されませんでした）';
      spkSelect.disabled = spks.length === 0;
    } else {
      sinkNote.textContent = '（このブラウザは出力先切替に未対応：setSinkIdなし）';
      spkSelect.disabled = true;
    }
  }

  (async () => {
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
    await refreshDevices();
  })();
  navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);

  micSelect.addEventListener('change', async () => {
    mediaDeviceId = micSelect.value;
    if (monitorOn) {
      stopMonitor();
      await startMonitor();
    }
  });
  spkSelect.addEventListener('change', async () => {
    try {
      if (sinkAudio.setSinkId && spkSelect.value) await sinkAudio.setSinkId(spkSelect.value);
      try { await sinkAudio.play(); } catch {}
    } catch (e) {
      notifyError('出力デバイスの切替に失敗しました', e);
    }
  });

  // ===== Mic Monitor（指定デバイスのみ） =====
  function stopMonitor() {
    try { if (monAnimId) cancelAnimationFrame(monAnimId); } catch {}
    monAnimId = null;
    try { monSource && monSource.disconnect(); } catch {}
    monSource = null;
    try { monAnalyser && monAnalyser.disconnect(); } catch {}
    monAnalyser = null;
    if (monStream) {
      monStream.getTracks().forEach(t => t.stop());
      monStream = null;
    }
    monitorOn = false;
    monitorBtn.textContent = '🔎 Mic Monitor: OFF';
    micSpecCtx.fillStyle = '#111';
    micSpecCtx.fillRect(0, 0, micSpecCanvas.width, micSpecCanvas.height);
  }
  function drawMicSpectrumLoop() {
    if (!monAnalyser) return;
    const { width, height } = micSpecCanvas;
    const freqData = new Uint8Array(monAnalyser.frequencyBinCount);
    const fMin = 20, fMax = fs / 2;
    const logMin = Math.log10(fMin), logMax = Math.log10(fMax);
    const fx = (f) => {
      const clamped = Math.max(f, fMin);
      const t = (Math.log10(clamped) - logMin) / (logMax - logMin);
      return t * width;
    };
    const render = () => {
      monAnalyser.getByteFrequencyData(freqData);
      micSpecCtx.fillStyle = '#111';
      micSpecCtx.fillRect(0, 0, width, height);

      const bins = freqData.length;
      for (let i = 0; i < bins; i++) {
        const f1 = (i * fMax) / bins;
        const f2 = ((i + 1) * fMax) / bins;
        const x1 = fx(f1);
        const x2 = fx(f2);
        const w = Math.max(1, x2 - x1);
        const v = freqData[i];
        const h = (v / 255) * height;
        micSpecCtx.fillStyle = '#24d1a0';
        micSpecCtx.fillRect(x1, height - h, w, h);
      }
      micSpecCtx.strokeStyle = 'rgba(255,255,255,.08)';
      micSpecCtx.beginPath();
      [100, 1000, 10000].forEach((f) => {
        if (f > fMin && f < fMax) {
          const x = fx(f);
          micSpecCtx.moveTo(x, 0); micSpecCtx.lineTo(x, height);
        }
      });
      micSpecCtx.stroke();
      micSpecCtx.fillStyle = 'rgba(255,255,255,.7)';
      micSpecCtx.font = '12px system-ui, sans-serif';
      micSpecCtx.textAlign = 'center';
      [100, 1000, 10000].forEach((f) => {
        if (f > fMin && f < fMax) {
          const x = fx(f);
          const label = f >= 1000 ? `${f/1000}k` : `${f}`;
          micSpecCtx.fillText(label, x, 14);
        }
      });

      monAnimId = requestAnimationFrame(render);
    };
    render();
  }
  async function startMonitor() {
    try {
      if (monitorOn) return;
      const audioConstraints = mediaDeviceId ? { deviceId: { exact: mediaDeviceId } } : {};
      Object.assign(audioConstraints, {
        channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0
      });
      monStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      const source = audioCtx.createMediaStreamSource(monStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      monSource = source; monAnalyser = analyser; monitorOn = true;
      monitorBtn.textContent = '🔎 Mic Monitor: ON';
      drawMicSpectrumLoop();
    } catch (e) {
      notifyError('Mic Monitor開始に失敗しました', e);
      stopMonitor();
    }
  }
  monitorBtn.addEventListener('click', () => { if (monitorOn) stopMonitor(); else startMonitor(); });

  // ===== Generate =====
  genBtn.addEventListener('click', () => {
    try {
      const Jisu = parseInt(jisuEl.value, 10);
      if (!Number.isInteger(Jisu) || Jisu < 10 || Jisu > 22) { alert('Jisu は 10〜22 の整数にしてください（N=2^Jisu）'); return; }
      const A = parseFloat(ampAEl.value);
      if (!isFinite(A) || A <= 0) { alert('振幅 A は正の数にしてください'); return; }
      const tailSec = parseFloat(tailEl.value);
      if (!isFinite(tailSec) || tailSec < 0) { alert('テイル無音は0以上の数にしてください'); return; }

      const { YY, YYG, N, J, L } = generateTSP_OATSP(Jisu, A);
      downTSPFloat = YY; upTSPFloat = YYG;

      const tailN = Math.max(0, Math.floor(tailSec * fs));
      const playDown = new Float32Array(YY.length + tailN); playDown.set(YY, 0);
      const playUp   = new Float32Array(YYG.length + tailN); playUp.set(YYG, 0);
      downTSPBuf = float32ToBuffer(playDown, fs);
      upTSPBuf   = float32ToBuffer(playUp, fs);

      // 既定は DOWN を参照に
      lastPlayedRefFloat = downTSPFloat;
      lastPlayedName = 'down';

      excitationInfo.textContent = `N=2^${Jisu}=${N}, J=${J}, L=${L}, len=${(YY.length / fs).toFixed(3)} s (+ tail ${tailSec}s)`;
      inverseInfo.textContent    = `inverse upTSP length=${YYG.length} (${(YYG.length / fs).toFixed(3)} s)`;

      drawSignal(irCtx, YY, '#24d1a0', 'downTSP preview');
      magCtx.clearRect(0, 0, magCanvas.width, magCanvas.height);

      dlArea.innerHTML = '';
      downloadBlob(floatToWavBlob(YY, fs),  `downTSP_${Jisu}_Fs${fs}.wav`);
      downloadBlob(floatToWavBlob(YYG, fs), `upTSP_${Jisu}_Fs${fs}.wav`);

      alert('TSP（downTSP / upTSP）を生成しました ✅');
    } catch (e) { notifyError('TSP生成でエラー', e); }
  });

  // ===== Play & Record =====
  playRecBtn.addEventListener('click', async () => {
    try {
      const mode = (playSigEl && playSigEl.value) || 'down';
      const playBuf = (mode === 'up') ? upTSPBuf : downTSPBuf;
      const refFloat = (mode === 'up') ? upTSPFloat : downTSPFloat;
      if (!playBuf || !refFloat) { alert('先に TSP を生成してください'); return; }

      const audioConstraints = mediaDeviceId ? { deviceId: { exact: mediaDeviceId } } : {};
      Object.assign(audioConstraints, {
        channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0
      });

      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false }); }
      catch (e) { notifyError('マイク取得に失敗しました', e); return; }

      const inputNode = audioCtx.createMediaStreamSource(micStream);

      // レコーダ
      const recChunks = []; let recLen = 0; let disconnectFns = [];
      if (workletReady) {
        const recNode = new AudioWorkletNode(audioCtx, 'recorder-processor', { processorOptions: { bufferSize: 2048 } });
        recNode.port.onmessage = (e) => { const block = e.data; recChunks.push(block); recLen += block.length; };
        inputNode.connect(recNode);
        disconnectFns.push(() => { try { inputNode.disconnect(recNode); } catch {} });
      } else {
        const bufferSize = 4096;
        const sp = audioCtx.createScriptProcessor(bufferSize, 1, 1);
        sp.onaudioprocess = (e) => { const ch0 = e.inputBuffer.getChannelData(0); recChunks.push(new Float32Array(ch0)); recLen += ch0.length; };
        const mute = audioCtx.createGain(); mute.gain.value = 0;
        inputNode.connect(sp); sp.connect(mute); mute.connect(audioCtx.destination);
        disconnectFns.push(() => { try { mute.disconnect(); } catch {} try { sp.disconnect(); } catch {} try { inputNode.disconnect(); } catch {} });
      }

      // 再生（選択信号）→ sinkGain（ここから <audio> と 既定出力の両方へ）
      const src = audioCtx.createBufferSource();
      src.buffer = playBuf;
      const g = audioCtx.createGain(); g.gain.value = parseFloat(playGainEl.value);
      src.connect(g); g.connect(sinkGain);

      // 解析用の参照を記録
      lastPlayedRefFloat = refFloat;
      lastPlayedName = mode;

      // setSinkId: 選択された出力デバイスへ（失敗しても既定出力からは鳴る）
      try {
        if (sinkAudio.setSinkId && spkSelect.value) await sinkAudio.setSinkId(spkSelect.value);
      } catch (e) {
        notifyError('選択された出力デバイスへ割り当てできませんでした', e);
      }
      // autoplay対策：明示的に再生
      try { await sinkAudio.play(); } catch {}

      await audioCtx.resume();
      const t0 = audioCtx.currentTime + 0.4; // 余裕を持ってプリロール
      src.start(t0);

      const stopAt = t0 + playBuf.duration + 0.05;
      setTimeout(() => { try { src.stop(); } catch {} }, (stopAt - audioCtx.currentTime) * 1000);

      setTimeout(() => {
        disconnectFns.forEach(fn => { try { fn(); } catch {} });
        disconnectFns = [];
        // join
        recorded = new Float32Array(recChunks.reduce((s,a)=>s+a.length,0));
        let off = 0; for (const c of recChunks) { recorded.set(c, off); off += c.length; }
        recDurationSec = recorded.length / fs;
        recordingInfo.textContent = `${recorded.length} samples (${recDurationSec.toFixed(2)} s)`;

        // 表示（基準化ON時は最大化表示）
        drawSignal(irCtx, recorded, '#24d1a0', 'Recording (display only)');

        dlArea.innerHTML = '';
        downloadBlob(floatToWavBlob(recorded, fs), 'recording.wav');
        if (downTSPFloat) downloadBlob(floatToWavBlob(downTSPFloat, fs), `downTSP_${jisuEl.value}_Fs${fs}.wav`);
        if (upTSPFloat)   downloadBlob(floatToWavBlob(upTSPFloat, fs),   `upTSP_${jisuEl.value}_Fs${fs}.wav`);

        alert(`録音完了 ✅（再生信号: ${lastPlayedName.toUpperCase()}）`);
      }, (stopAt - audioCtx.currentTime) * 1000 + 150);

    } catch (e) { notifyError('再生/録音でエラー', e); }
  });

  // ===== Analyze (FFT deconvolution) =====
  analyzeBtn.addEventListener('click', async () => {
    try {
      if (!recorded || !lastPlayedRefFloat) { alert('TSP生成と録音を先に行ってください'); return; }

      const ref = lastPlayedRefFloat;       // 直近に再生した信号（DOWN/UP）
      const N = ref.length;

      // 1) アライン（相互相関）
      alignLag = estimateLag(ref, recorded);
      lagInfo.textContent = `${alignLag}`;

      // 2) 記録の切り出し（TSP1回 + 取りたいIR長）
      const IRwantSec = 1.5;
      const IRwant = Math.floor(IRwantSec * fs);
      const start = Math.max(0, alignLag);
      const end = Math.min(recorded.length, start + N + IRwant);
      const recSeg = recorded.subarray(start, end);

      // 3) FFT逆畳み込み
      const M = recSeg.length;
      const nfft = nextPow2(N + M - 1);
      const Re_ref = new Float64Array(nfft), Im_ref = new Float64Array(nfft);
      const Re_rec = new Float64Array(nfft), Im_rec = new Float64Array(nfft);
      for (let i=0;i<N;i++) Re_ref[i] = ref[i];
      for (let i=0;i<M;i++) Re_rec[i] = recSeg[i];
      fftComplex(Re_ref, Im_ref);
      fftComplex(Re_rec, Im_rec);

      const eps = 1e-9;
      const Re_out = new Float64Array(nfft), Im_out = new Float64Array(nfft);
      for (let k=0;k<nfft;k++){
        const ar = Re_rec[k], ai = Im_rec[k];
        const br = Re_ref[k], bi = Im_ref[k];
        const denom = br*br + bi*bi + eps; // Tikhonov的安定化
        Re_out[k] = (ar*br + ai*bi) / denom;
        Im_out[k] = (ai*br - ar*bi) / denom;
      }
      ifftComplex(Re_out, Im_out);
      const irFull = new Float32Array(nfft);
      for (let i=0;i<nfft;i++) irFull[i] = Re_out[i];

      // 4) ピーク周りを切り出し
      let peakIdx=0, peakVal=0;
      for (let i=0;i<irFull.length;i++){ const a=Math.abs(irFull[i]); if(a>peakVal){peakVal=a; peakIdx=i;} }
      const pre  = Math.floor(0.005 * fs); // 5ms
      const post = Math.floor(1.0  * fs);  // 1.0s
      const i0 = Math.max(0, peakIdx - pre);
      const i1 = Math.min(irFull.length, peakIdx + post);
      const ir = irFull.subarray(i0, i1);

      // 5) 窓（Tukey）
      const L = ir.length, alpha = 0.1;
      for (let n=0;n<L;n++){
        let w = 1.0, r = n/(L-1);
        if (r < alpha/2) w = 0.5 * (1 - Math.cos(Math.PI * (2*r/alpha)));
        else if (r > 1 - alpha/2) { const r2 = (r - 1 + alpha/2) / (alpha/2); w = 0.5 * (1 + Math.cos(Math.PI * r2)); }
        ir[n] *= w;
      }

      // 6) 描画（基準化表示） & 保存
      drawSignal(irCtx, ir, '#24d1a0', 'Impulse Response (display normalized)');
      const mag = (function(){
        let Npad = 1; while (Npad < ir.length) Npad <<= 1;
        const re = new Float64Array(Npad), im = new Float64Array(Npad);
        for (let i=0;i<ir.length;i++) re[i] = ir[i];
        fftComplex(re, im);
        const half = (Npad>>1)+1, out = new Float64Array(half);
        for (let k=0;k<half;k++) out[k] = Math.hypot(re[k], im[k]) / (Npad/2);
        return out;
      })();
      drawMag(magCtx, mag, fs, '#24d1a0', '|H(f)|');

      dlArea.innerHTML = '';
      downloadBlob(floatToWavBlob(ir, fs), 'impulse_response.wav');

      alert(`解析完了 ✅（FFTデコンボリューション, 再生信号: ${lastPlayedName.toUpperCase()}）`);

    } catch (e) { notifyError('解析でエラー', e); }
  });

  // ===== Self‑Test: DOWN⊛UP / UP⊛DOWN（表示は基準化） =====
  selfTestBtn.addEventListener('click', () => {
    try {
      if (!downTSPFloat || !upTSPFloat) {
        alert('先に TSP（down/up）を生成してください');
        return;
      }
      const convDU = fftConvolveReal(downTSPFloat, upTSPFloat);
      const convUD = fftConvolveReal(upTSPFloat, downTSPFloat);

      function peakStats(x){
        let p=0, pv=0;
        for (let i=0;i<x.length;i++){ const a=Math.abs(x[i]); if(a>pv){pv=a; p=i;} }
        let main=0, total=0;
        for (let i=0;i<x.length;i++){
          const e=x[i]*x[i]; total+=e;
          if (i>=p-3 && i<=p+3) main+=e;
        }
        const ratio = main/Math.max(total,1e-12);
        return {peakIndex:p, peakVal:pv, mainEnergyRatio:ratio};
      }
      const sDU = peakStats(convDU);

      drawSignal(irCtx, convDU, '#24d1a0',
        `Self‑Test: DOWN⊛UP (display normalized)  peak=${sDU.peakIndex}, mainE=${(sDU.mainEnergyRatio*100).toFixed(1)}%`);
      magCtx.clearRect(0, 0, magCanvas.width, magCanvas.height);

      dlArea.innerHTML = '';
      downloadBlob(floatToWavBlob(convDU, fs), 'selftest_down_convolve_up.wav');
      downloadBlob(floatToWavBlob(convUD, fs), 'selftest_up_convolve_down.wav');

      alert('Self‑Test 完了 ✅');
    } catch (e) { notifyError('Self‑Test でエラー', e); }
  });

})();
