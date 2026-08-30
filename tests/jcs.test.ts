import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/jcs";

describe("RFC 8785 JSON canonicalization", () => {
  it("sorts object keys recursively without changing array order", () => {
    expect(canonicalize({ z: 1, a: { d: 4, b: 2 }, list: [3, 1] })).toBe(
      '{"a":{"b":2,"d":4},"list":[3,1],"z":1}',
    );
  });

  it("rejects non-finite numbers and lone surrogate code points", () => {
    expect(() => canonicalize(Number.NaN)).toThrow("JCS_INVALID_NUMBER");
    expect(() => canonicalize("\ud800")).toThrow("JCS_INVALID_UNICODE");
  });
});
