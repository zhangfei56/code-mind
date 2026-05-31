import assert from "node:assert/strict";
import { formatFinalText, normalizeFinalText } from "../../apps/cli/src/ui/final-text.js";

export function runFinalTextTests(): void {
  assert.equal(
    normalizeFinalText("hello\r\n\r\n\r\nworld\u0000"),
    "hello\n\nworld",
  );

  const formattedHeading = formatFinalText(
    "# Repo Overview\n\nThis is a local-first agent.",
    { level: 0 },
  );
  assert.match(formattedHeading, /^Repo Overview\n\nThis is a local-first agent\./);

  const headingWithLeadIn = formatFinalText(
    "结论：## code-mind 项目概述\n\n这是一个 local-first code agent。",
    { level: 0 },
  );
  assert.match(headingWithLeadIn, /^code-mind 项目概述\n\n这是一个 local-first/);
  assert.doesNotMatch(headingWithLeadIn, /结论：##/);

  const formattedList = formatFinalText(
    "## Tasks\n\n- inspect the repo\n- explain the runtime",
    { level: 1 },
  );
  assert.match(formattedList, /Tasks/);
  assert.match(formattedList, /- inspect the repo/);
  assert.match(formattedList, /- explain the runtime/);

  const formattedCode = formatFinalText(
    "```ts\nconst x = 1;\n```",
    { level: 1 },
  );
  assert.match(formattedCode, /```ts/);
  assert.match(formattedCode, /const x = 1;/);

  const formattedTable = formatFinalText(
    [
      "| Layer | Role | Package |",
      "| --- | --- | --- |",
      "| CLI | entry | apps/cli |",
      "| Core | orchestration | packages/core |",
    ].join("\n"),
    { level: 1 },
  );
  assert.match(formattedTable, /- Layer: CLI/);
  assert.match(formattedTable, /Role: orchestration/);
  assert.doesNotMatch(formattedTable, /\| Layer \|/);

  const formattedVerboseHeading = formatFinalText(
    "# Repo Overview",
    { level: 2 },
  );
  assert.match(formattedVerboseHeading, /Repo Overview\n─+/);

  const inlineCodeWrapped = formatFinalText(
    "Inspect `packages/core/src/agent/runtime/tool-call-handler.ts` before changing the runtime flow.",
    { level: 1, width: 36 },
  );
  assert.match(
    inlineCodeWrapped,
    /`packages\/core\/src\/agent\/runtime\/tool-call-handler\.ts`/,
  );

  const cjkWrapped = formatFinalText(
    "请先检查 runtime 状态流，然后解释为什么 verification 会在 patch 后触发。",
    { level: 1, width: 20 },
  );
  assert.match(cjkWrapped, /请先检查/);
  assert.match(cjkWrapped, /verification/);
  assert.ok(cjkWrapped.includes("\n"));

  const inlineMarkdown = formatFinalText(
    "Use **bold** text, _italic_ text, ~~old~~ text, and [docs](https://example.com) before `keep_this()`.",
    { level: 1, width: 80 },
  );
  assert.match(inlineMarkdown, /Use bold text, italic text, old text, and docs before `keep_this\(\)`\./);
  assert.doesNotMatch(inlineMarkdown, /\*\*bold\*\*/);
  assert.doesNotMatch(inlineMarkdown, /_italic_/);
  assert.doesNotMatch(inlineMarkdown, /\[docs\]\(/);

  const widthFromStream = formatFinalText(
    "This sentence should wrap based on the output stream width rather than the default formatter width.",
    {
      level: 1,
      stream: { columns: 24 } as NodeJS.WriteStream,
    },
  );
  assert.ok(widthFromStream.includes("\n"));
}
