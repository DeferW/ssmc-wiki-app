import { describe, expect, it } from "vitest";
import { formatReagentName } from "./format";

describe("formatReagentName", () => {
  it("capitalizes Russian and Latin reagent names", () => {
    expect(formatReagentName("кислород")).toBe("Кислород");
    expect(formatReagentName("water")).toBe("Water");
  });

  it("uses and capitalizes the fallback", () => {
    expect(formatReagentName(undefined, "unknownReagent")).toBe("UnknownReagent");
  });
});
