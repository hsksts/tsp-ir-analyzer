// AudioWorkletProcessor for robust mono recording
class RecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferSize = (options.processorOptions && options.processorOptions.bufferSize) || 2048;
    this._buf = new Float32Array(this.bufferSize);
    this._w = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channels = input.length;
    const N = input[0].length;
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += input[c][i] || 0;
      const mono = sum / Math.max(1, channels);
      this._buf[this._w++] = mono;
      if (this._w >= this.bufferSize) {
        this.port.postMessage(this._buf.slice(0, this._w));
        this._w = 0;
      }
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
