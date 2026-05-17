import readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of rl) {
  const request = JSON.parse(line);
  if (request.type === "list_tools") {
    process.stdout.write(
      `${JSON.stringify({
        id: request.id,
        ok: true,
        tools: [
          {
            name: "echo",
            description: "Echo MCP input",
            inputSchema: {
              type: "object",
              properties: {
                text: { type: "string" },
              },
              required: ["text"],
            },
          },
        ],
      })}\n`,
    );
    continue;
  }

  if (request.type === "call_tool" && request.tool === "echo") {
    process.stdout.write(
      `${JSON.stringify({
        id: request.id,
        ok: true,
        result: {
          echoed: request.arguments?.text ?? "",
        },
      })}\n`,
    );
    continue;
  }

  process.stdout.write(
    `${JSON.stringify({
      id: request.id,
      ok: false,
      error: "unknown request",
    })}\n`,
  );
}
