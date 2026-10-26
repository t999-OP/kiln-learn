import { describe, expect, it } from "vitest";
import { compile, equivalent, parse, pretty, value } from "./mathexpr.ts";

describe("compile", () => {
  it.each([
    ["3x^2 + 2", 2, 14],
    ["2(x+1)", 3, 8],
    ["(x+1)(x-1)", 3, 8],
    ["-x^2", 3, -9],
    ["2^3^2", 0, 512],
    ["xsinx", Math.PI / 2, Math.PI / 2],
    ["sin x^2", 2, Math.sin(4)],
    ["sin(x)^2", 2, Math.sin(2) ** 2],
    ["e^x", 1, Math.E],
    ["2e^(3x)", 0, 2],
    ["|x - 5|", 2, 3],
    ["√(x)", 9, 3],
    ["x²·3", 2, 12],
    ["ln(e^2)", 0, 2],
    ["x^-1", 4, 0.25],
  ])("%s at x=%d", (src, x, expected) => {
    expect(compile(src)(x)).toBeCloseTo(expected, 9);
  });

  it("evaluates constant expressions", () => {
    expect(value("8/3")).toBeCloseTo(8 / 3);
    expect(value("pi/2")).toBeCloseTo(Math.PI / 2);
    expect(value("x+1")).toBeNaN();
  });
});

describe("equivalent", () => {
  it("accepts equivalent forms", () => {
    expect(equivalent("2x", "x*2")).toBe(true);
    expect(equivalent("3x^2", "3*x*x")).toBe(true);
    expect(equivalent("20x^3 - 2", "-2 + 20x^3")).toBe(true);
    expect(equivalent("cos(x)", "sin(x + pi/2)")).toBe(true);
    expect(equivalent("(x^2-1)/(x-1)", "x+1")).toBe(true);
    expect(equivalent("2t", "t+t", { variable: "t" })).toBe(true);
  });
  it("rejects different functions", () => {
    expect(equivalent("2x", "x^2")).toBe(false);
    expect(equivalent("3x^2", "3x^2 + 1")).toBe(false);
  });
  it("handles + C for antiderivatives", () => {
    expect(equivalent("x^3/3 + 5", "x^3/3", { upToConstant: true })).toBe(true);
    expect(equivalent("x^3", "x^3/3", { upToConstant: true })).toBe(false);
  });
});

describe("pretty", () => {
  it.each([
    ["3x^2-2", "3x² − 2"],
    ["20*x^3 - 2*x + 7", "20x³ − 2x + 7"],
    ["x^3/3", "x³/3"],
    ["(x^2-1)/(x-1)", "(x² − 1)/(x − 1)"],
    ["2*pi*sqrt(x)", "2π·sqrt(x)"],
  ])("%s -> %s", (src, out) => expect(pretty(src)).toBe(out));
});

describe("parse errors", () => {
  it.each(["", "2*", "x +* 3", "sin", "y + 1", "(x", "3..2"])("rejects %j", (bad) => {
    expect(() => parse(bad)).toThrow();
  });
  it("names the unknown symbol", () => {
    expect(() => parse("y+1")).toThrow(/Unknown symbol "y"/);
  });
});
