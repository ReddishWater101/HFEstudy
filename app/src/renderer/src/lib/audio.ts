let audioContext: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

export function init(): void {
  if (audioContext) {
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
    return;
  }
  audioContext = new AudioContext();
}

function ensureContext(): AudioContext {
  if (!audioContext) {
    throw new Error('audio.init() must be called inside a user gesture before using audio');
  }
  return audioContext;
}

export async function preload(audioUrls: string[]): Promise<void> {
  const ctx = ensureContext();
  for (const url of audioUrls) {
    if (buffers.has(url)) continue;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    buffers.set(url, decoded);
  }
}

export function play(audioUrl: string): void {
  const ctx = ensureContext();
  const buffer = buffers.get(audioUrl);
  if (buffer) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    return;
  }
  console.warn('audio.play cache miss, falling back to <audio> element:', audioUrl);
  const el = new Audio(audioUrl);
  void el.play();
}

export function isReady(audioUrl: string): boolean {
  return buffers.has(audioUrl);
}

export function cachedCount(): number {
  return buffers.size;
}
