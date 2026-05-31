import assert from "node:assert/strict";
import { resolveTerminalWidth, wrapPrefixedBlock, wrapText, displayWidth, truncateToWidth } from "../../apps/cli/src/ui/text-wrap.js";

export function runTextWrapTests(): void {
  assert.equal(resolveTerminalWidth(undefined, 80), process.stderr.columns ?? 80);

  const mockStream = { columns: 40 } as NodeJS.WriteStream;
  assert.equal(resolveTerminalWidth(mockStream), 40);

  const wrapped = wrapText("hello world from code-mind display layer", 20);
  assert.ok(wrapped.length >= 2);
  for (const line of wrapped) {
    assert.ok(line.length <= 20);
  }

  const cjkWrapped = wrapText("我将阅读项目结构并定位失败测试", 6);
  assert.ok(cjkWrapped.length >= 1);
  assert.ok(cjkWrapped.join("").includes("我将"));

  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("中文"), 4);
  assert.ok(displayWidth(truncateToWidth("用户说fix test需要找出失败", 10)) <= 10);

  const prefixed = wrapPrefixedBlock("Command requires explicit approval before proceeding.", 30);
  assert.ok(prefixed.length >= 2);
  assert.match(prefixed[0]!, /^ {2}/);
  for (const line of prefixed) {
    assert.ok(line.length <= 30);
  }
}
