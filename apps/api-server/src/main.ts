import { startApiServer } from "./web-ui.js";

const workspaceRoot = process.argv[2] ?? process.cwd();
const port = Number(process.env.PORT ?? 3847);

await startApiServer(workspaceRoot, port);
