// ===== TSP 生成 =====
function generateTSP(Jisu = 14, Fs = 48000, A = 1, type = "down") {
  const N = 2 ** Jisu;
  const J = 2 ** (Jisu - 1);
  const L = (N - J) / 2;

  const H = new Array(N).fill(0);
  const x1 = [];
  for (let k = 0; k <= N / 2; k++) {
    const val = A * Math.exp(2 * Math.PI * 1j * J * (k / N) ** 2);
    x1.push(val);
  }

  H[0] = x1[0];
  for (let k = 1; k < N / 2; k++) H[k] = x1[k];
  H[N / 2] = x1[N / 2];
  for (let k = N / 2 + 1; k < N; k++) H[k] = math.conj(H[N - k]);

  const h = ifft(H).map(v => v.re);

  // 円状シフト
  const YY = new Array(N);
  for (let n = 0; n < L; n++) YY[n] = h[N - L + n];
  for (let n = 0; n < N - L; n++) YY[L + n] = h[n];

  if (type === "up") {
    const G = H.map(v => math.conj(v));
    const g = ifft(G).map(v => v.re);
    const YYG = new Array(N);
    for (let n = 0; n < L; n++) YYG[n] = g[N - L + n];
    for (let n = 0; n < N - L; n++) YYG[L + n] = g[n];
    return { tsp: YYG, inv: YY };
  }
  return { tsp: YY, inv: null };
}

// ===== FFT / IFFT =====
function fft(x) {
  return math.fft(x);
}
function ifft(x) {
  return math.ifft(x);
}
