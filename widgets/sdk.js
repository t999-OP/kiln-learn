// Kiln widget SDK — the whole integration contract for interactive lesson steps.
//
//   Lesson.on("init", ({ params }) => setup(params));
//   Lesson.attempt({ correct: true, feedback: "Nice!" });   // reports to the lesson player
//
// Widgets run in a sandboxed iframe (scripts only, no same-origin access), so any
// HTML/JS — p5.js, Three.js, plain canvas — can become a tracked lesson step.
window.Lesson = (() => {
  const handlers = {};
  const post = (kind, payload) => parent.postMessage({ kiln: true, kind, payload }, "*");
  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m && m.kiln && handlers[m.kind]) handlers[m.kind](m.payload || {});
  });
  let done = false;
  const api = {
    on: (kind, fn) => ((handlers[kind] = fn), api),
    attempt: (result) => {
      if (done && result.correct) return;
      if (result.correct) done = true;
      post("attempt", result);
    },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => post("ready"));
  else setTimeout(() => post("ready"));
  return api;
})();
