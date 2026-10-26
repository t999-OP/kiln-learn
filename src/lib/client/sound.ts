// Small synthesized feedback sounds (no audio files). Muting is remembered per browser.
const KEY = "kiln:sound";
let ctx: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.12) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export function play(kind: "right" | "wrong" | "complete") {
  if (typeof window === "undefined" || !soundOn()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (kind === "right") (tone(660, 0, 0.12), tone(990, 0.08, 0.22));
    else if (kind === "wrong") (tone(196, 0, 0.18, "triangle", 0.1), tone(175, 0.1, 0.25, "triangle", 0.08));
    else [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.28));
  } catch {}
}
