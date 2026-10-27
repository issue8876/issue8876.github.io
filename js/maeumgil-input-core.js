export function speechPCM(samples, sampleRate, targetRate = 16000) {
  if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate < 8000 || !samples.length) throw new Error('Invalid audio');
  const length = Math.min(samples.length, sampleRate * 20);
  const output = new Float32Array(Math.floor(length * targetRate / sampleRate));
  let energy = 0;
  for (let index = 0; index < output.length; index++) {
    const position = index * sampleRate / targetRate, before = Math.floor(position), blend = position - before;
    const a = samples[before], b = samples[Math.min(before + 1, length - 1)];
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid audio');
    output[index] = Math.max(-1, Math.min(1, a + (b - a) * blend));
    energy += output[index] ** 2;
  }
  if (output.length < targetRate / 4 || energy / output.length < 1e-6) throw new Error('No speech');
  return output;
}
