import { CLI_BIN_NAME } from "./cli-name.js";

const LOGO = [
  "  ┌─┐┬ ┬┌─┐┌─┐  ┌┬┐┬┌┐┌┬┌─┐",
  "  │ ││││├─┤│    ││││││││ ┬┘",
  "  └─┘└┴┘┴ ┴└─┘  ┴ ┴┴┘└┘└─┘",
].join("\n");

export function renderCliLogo(version = "0.1.0"): string {
  return `${LOGO}\n  ${CLI_BIN_NAME} v${version}\n`;
}

export function printCliLogo(version = "0.1.0"): void {
  console.log(renderCliLogo(version));
}
