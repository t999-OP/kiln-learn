import { describe, expect, it } from "vitest";
import { levenshtein, matchAnswer } from "./answers.ts";

describe("matchAnswer", () => {
  it("ignores case and punctuation", () => {
    expect(matchAnswer("hola soy ana", ["Hola, soy Ana."])).toMatchObject({ correct: true });
  });
  it("accepts missing accents with a note", () => {
    expect(matchAnswer("adios", ["adiós"])).toEqual({ correct: true, matched: "adiós", note: "accents" });
  });
  it("forgives one typo on longer answers only", () => {
    expect(matchAnswer("graciaz", ["gracias"])).toMatchObject({ correct: true, note: "typo" });
    expect(matchAnswer("holo", ["hola"])).toMatchObject({ correct: false, expected: "hola" });
  });
  it("checks every accepted answer", () => {
    expect(matchAnswer("me llamo ana", ["Soy Ana", "Me llamo Ana"])).toMatchObject({ correct: true, matched: "Me llamo Ana" });
  });
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});
