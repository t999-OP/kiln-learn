// Safe math expression engine (no eval). Shared by the quality pipeline, the lesson
// player (expression answers) and widgets (plotting). Runs on server and client.
//
//   compile("3x^2 + sin(x)")(2)                              -> 12.909…
//   equivalent("2x", "x*2")                                  -> true
//   equivalent("x^3/3 + 5", "x^3/3", { upToConstant: true }) -> true
//   pretty("3x^2-2")                                         -> "3x² − 2"

type Fn = (x: number) => number;

const FUNCS: Record<string, Fn> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sec: (x) => 1 / Math.cos(x),
  csc: (x) => 1 / Math.sin(x),
  cot: (x) => 1 / Math.tan(x),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sqrt: Math.sqrt,
  abs: Math.abs,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type BinOp = "+" | "-" | "*" | "/" | "^";
export type Node =
  | { k: "num"; v: number }
  | { k: "const"; name: string; v: number }
  | { k: "var"; v: string }
  | { k: "neg"; a: Node }
  | { k: "fn"; name: string; a: Node }
  | { k: "bin"; op: BinOp; a: Node; b: Node; implicit?: boolean };

type Token =
  | { t: "num"; v: number; name?: string }
  | { t: "var"; v: string }
  | { t: "fn"; v: string }
  | { t: "+" | "-" | "*" | "/" | "^" | "(" | ")" | "," | "|" };

const normalize = (src: string) =>
  String(src)
    .replace(/[·×∙⋅]/g, "*")
    .replace(/[−–]/g, "-")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/⁴/g, "^4");

function splitWord(word: string, vars: string[]): Token[] {
  // Greedy longest match so "xsinx" -> x·sin(x) and "exp" stays one function.
  const names = [...Object.keys(FUNCS), ...Object.keys(CONSTS), ...vars].sort((a, b) => b.length - a.length);
  const out: Token[] = [];
  let p = 0;
  while (p < word.length) {
    const name = names.find((n) => word.startsWith(n, p));
    if (!name) throw new Error(`Unknown symbol "${word.slice(p)}"${vars.length ? ` (the variable is ${vars.join(", ")})` : ""}`);
    if (vars.includes(name)) out.push({ t: "var", v: name });
    else if (name in FUNCS) out.push({ t: "fn", v: name });
    else out.push({ t: "num", v: CONSTS[name], name });
    p += name.length;
  }
  return out;
}

function tokenize(s: string, vars: string[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const t = s.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) throw new Error(`Bad number "${t}"`);
      out.push({ t: "num", v: Number(t) });
      i = j;
    } else if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      out.push(...splitWord(s.slice(i, j), vars));
      i = j;
    } else if ("+-*/^(),|".includes(c)) {
      out.push({ t: c as "+" });
      i++;
    } else throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

const show = (tk: Token | undefined) => (!tk ? "end" : "name" in tk && tk.name ? tk.name : "v" in tk ? String(tk.v) : tk.t);

export function parse(src: string, vars: string[] = ["x"]): Node {
  if (!String(src ?? "").trim()) throw new Error("Empty expression");
  const toks = tokenize(normalize(src), vars);
  let p = 0;
  const peek = () => toks[p];
  const expect = (t: string) => {
    if (toks[p]?.t !== t) throw new Error(`Expected "${t}" but found "${show(toks[p])}"`);
    p++;
  };
  const startsFactor = (tk: Token | undefined) => !!tk && (tk.t === "num" || tk.t === "var" || tk.t === "fn" || tk.t === "(");

  function expr(): Node {
    let a = term();
    while (peek()?.t === "+" || peek()?.t === "-") {
      const op = toks[p++].t as BinOp;
      a = { k: "bin", op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    for (;;) {
      const tk = peek();
      if (tk?.t === "*" || tk?.t === "/") {
        p++;
        a = { k: "bin", op: tk.t, a, b: unary() };
      } else if (startsFactor(tk)) a = { k: "bin", op: "*", a, b: power(), implicit: true };
      else return a;
    }
  }
  function unary(): Node {
    const tk = peek();
    if (tk?.t === "-" || tk?.t === "+") {
      p++;
      const a = unary();
      return tk.t === "-" ? { k: "neg", a } : a;
    }
    return power();
  }
  function power(): Node {
    const base = primary();
    if (peek()?.t === "^") {
      p++;
      return { k: "bin", op: "^", a: base, b: unary() };
    }
    return base;
  }
  function primary(): Node {
    const tk = toks[p++];
    if (!tk) throw new Error("Expression ends too early");
    if (tk.t === "num") return tk.name ? { k: "const", name: tk.name, v: tk.v } : { k: "num", v: tk.v };
    if (tk.t === "var") return { k: "var", v: tk.v };
    if (tk.t === "(") {
      const e = expr();
      expect(")");
      return e;
    }
    if (tk.t === "|") {
      const e = expr();
      expect("|");
      return { k: "fn", name: "abs", a: e };
    }
    if (tk.t === "fn") {
      if (peek()?.t === "(") {
        p++;
        const a = expr();
        expect(")");
        return { k: "fn", name: tk.v, a };
      }
      if (!startsFactor(peek())) throw new Error(`${tk.v} needs an argument, e.g. ${tk.v}(x)`);
      return { k: "fn", name: tk.v, a: power() };
    }
    throw new Error(`Unexpected "${show(tk)}"`);
  }

  const ast = expr();
  if (p < toks.length) throw new Error(`Unexpected "${show(toks[p])}"`);
  return ast;
}

export function evaluate(ast: Node, scope: Record<string, number> = {}): number {
  switch (ast.k) {
    case "num":
    case "const":
      return ast.v;
    case "var":
      return scope[ast.v];
    case "neg":
      return -evaluate(ast.a, scope);
    case "fn":
      return FUNCS[ast.name](evaluate(ast.a, scope));
    case "bin": {
      const a = evaluate(ast.a, scope);
      const b = evaluate(ast.b, scope);
      switch (ast.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return Math.pow(a, b);
      }
    }
  }
}

/** compile(src, ["x"]) -> f(x) or f({ x, y }) */
export function compile(src: string, vars: string[] = ["x"]): (arg?: number | Record<string, number>) => number {
  const ast = parse(src, vars);
  return (arg) => evaluate(ast, typeof arg === "number" ? { [vars[0]]: arg } : arg || {});
}

/** Value of a constant expression like "8/3" or "pi/2"; NaN if it isn't one. */
export function value(src: string): number {
  try {
    return evaluate(parse(src, []));
  } catch {
    return NaN;
  }
}

/** Seeded PRNG so equivalence checks are reproducible. */
function rng(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

export interface EquivalenceOptions {
  variable?: string;
  range?: [number, number];
  /** Accept any F + C (antiderivatives). */
  upToConstant?: boolean;
}

/** Numeric equivalence at sample points. */
export function equivalent(
  a: string,
  b: string,
  { variable = "x", range = [-3, 3], upToConstant = false }: EquivalenceOptions = {},
): boolean {
  const fa = compile(a, [variable]);
  const fb = compile(b, [variable]);
  const rand = rng(7);
  let valid = 0;
  let offset: number | null = null;
  for (let i = 0; i < 80 && valid < 12; i++) {
    const x = range[0] + (range[1] - range[0]) * rand();
    const va = fa(x);
    const vb = fb(x);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    let d = va - vb;
    if (upToConstant) {
      if (offset === null) offset = d;
      d -= offset;
    }
    if (Math.abs(d) > 1e-6 * Math.max(1, Math.abs(va), Math.abs(vb))) return false;
    valid++;
  }
  return valid >= 4;
}

// Human-friendly rendering: "3x^2-2" -> "3x² − 2".
const SUP: Record<string, string> = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "-": "⁻" };
const PREC: Record<BinOp, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };
const prec = (n: Node) => (n.k === "bin" ? PREC[n.op] : n.k === "neg" ? 3 : 5);
const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6))));
const sup = (n: number) =>
  String(n)
    .split("")
    .map((c) => SUP[c])
    .join("");

function fmt(n: Node): string {
  const wrap = (c: Node, min: number) => (prec(c) < min ? `(${fmt(c)})` : fmt(c));
  switch (n.k) {
    case "num":
      return num(n.v);
    case "const":
      return n.name === "pi" ? "π" : n.name;
    case "var":
      return n.v;
    case "neg":
      return `−${wrap(n.a, 3)}`;
    case "fn":
      return n.name === "abs" ? `|${fmt(n.a)}|` : `${n.name}(${fmt(n.a)})`;
    case "bin":
      if (n.op === "^") {
        const base = wrap(n.a, 5);
        if (n.b.k === "num" && Number.isInteger(n.b.v)) return base + sup(n.b.v);
        if (n.b.k === "neg" && n.b.a.k === "num" && Number.isInteger(n.b.a.v)) return base + "⁻" + sup(n.b.a.v);
        return `${base}^${wrap(n.b, 5)}`;
      }
      if (n.op === "*") {
        const A = wrap(n.a, 2);
        const B = wrap(n.b, 3);
        const juxt =
          (n.a.k === "num" || n.a.k === "const") &&
          (n.b.k === "var" || n.b.k === "fn" || n.b.k === "const" || (n.b.k === "bin" && n.b.op === "^" && n.b.a.k === "var"));
        return juxt ? A + B : `${A}·${B}`;
      }
      if (n.op === "/") return `${wrap(n.a, 2)}/${wrap(n.b, 3)}`;
      return `${wrap(n.a, 1)} ${n.op === "-" ? "−" : "+"} ${wrap(n.b, 2)}`;
  }
}

export function pretty(src: string, vars: string[] = ["x"]): string {
  return fmt(parse(src, vars));
}
