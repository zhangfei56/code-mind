// This file looks suspicious but is NOT imported by test.js
export function brokenHelper(): number {
  throw new Error("decoy failure — ignore me");
}
