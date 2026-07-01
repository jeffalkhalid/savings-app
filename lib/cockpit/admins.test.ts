import { describe, it, expect } from "vitest";
import { adminEmailError } from "./admins";

describe("adminEmailError", () => {
  it("requires an email", () => {
    expect(adminEmailError("   ")).toBe("Email requis");
  });
  it("rejects an invalid email", () => {
    expect(adminEmailError("abc")).toBe("Email invalide");
  });
  it("accepts a valid email", () => {
    expect(adminEmailError("a@b.co")).toBeNull();
  });
});
