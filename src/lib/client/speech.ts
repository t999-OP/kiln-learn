// Text-to-speech. Uses generated audio when the course has it (AI voices, see /api/tts),
// otherwise the browser's built-in voices.
export function speak(text: string, lang = "en-US", rate = 1) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const base = lang.split("-")[0];
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.replace("_", "-") === lang) ?? voices.find((v) => v.lang.startsWith(base));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
