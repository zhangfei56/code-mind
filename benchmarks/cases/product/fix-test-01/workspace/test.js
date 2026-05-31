import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./src/math.ts", import.meta.url), "utf8")
  .replace(/export\s+/g, "")
  .replace(/: number/g, "");

const context = {};
vm.createContext(context);
vm.runInContext(`${source}; globalThis.add = add;`, context);

assert.equal(context.add(1, 2), 3);
console.log("tests passed");
