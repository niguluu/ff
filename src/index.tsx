#!/usr/bin/env node

const argv = process.argv.slice(2);
if (argv[0] === "--version" || argv[0] === "-v") {
  const fs = require("fs");
  const path = require("path");
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));
    console.log(`fff v${pkg.version}`);
  } catch {
    console.log("fff (unknown version)");
  }
  process.exit(0);
}

import { logger, getLogFile } from "./utils/logger";

if (argv[0] === "index") {
  import("./core/indexer")
    .then(({ runIndexer }) => runIndexer())
    .then((path) => {
      console.log(`Wrote ${path}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`Indexing failed: ${err?.message ?? err}`);
      process.exit(1);
    });
} else {
  void startTui();
}

async function startTui() {
  const isTty = process.stdout.isTTY;

  // Force truecolor for the TUI. Ink colors are emitted via `chalk.hex(...)`,
  // whose output depends on chalk's auto-detected color level. Over SSH / on a
  // VPS, `COLORTERM` is usually not propagated and `TERM` may be minimal
  // ("dumb"/"xterm"), so chalk detects level 0 and silently strips every hex
  // color. We already emit raw 24-bit escapes at startup (see below), proving
  // the terminal renders truecolor, so we pin chalk to level 3 for the TTY.
  if (isTty && !Bun.env.NO_COLOR) {
    process.env.FORCE_COLOR = "3";
    const chalk = (await import("chalk")).default;
    chalk.level = 3;
  }

  const { render } = await import("ink");
  const React = (await import("react")).default;
  const App = (await import("./ui/app")).default;
  const { killAllChildren } = await import("./core/process-registry");

  const GRUVBOX_BG = "#282828";
  const GRUVBOX_FG = "#ebdbb2";

  if (isTty) {
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r};${g};${b}`;
    };
    const bgRgb = hexToRgb(GRUVBOX_BG);
    const fgRgb = hexToRgb(GRUVBOX_FG);
    process.stdout.write(
      `\x1b]11;${GRUVBOX_BG}\x07\x1b]10;${GRUVBOX_FG}\x07` +
        `\x1b[48;2;${bgRgb}m\x1b[38;2;${fgRgb}m` +
        "\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l" +
        "\x1b[?1000h\x1b[?1006h"
    );
  }

  logger.info("startup", "fff starting", { log: getLogFile() });

  const { unmount, waitUntilExit } = render(React.createElement(App), {
    exitOnCtrlC: false,
  });

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    logger.info("shutdown", "cleaning up");
    killAllChildren();
    try {
      unmount();
    } catch {
      /* already unmounted */
    }
    if (isTty) {
      process.stdout.write(
        "\x1b[?1006l\x1b[?1000l\x1b[?25h\x1b]111\x07\x1b]110\x07\x1b[0m\x1b[?1049l"
      );
    }
  }

  function onSignal(signal: NodeJS.Signals) {
    logger.info("shutdown", `received ${signal}`);
    cleanup();
    process.exit(0);
  }

  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));
  process.once("exit", cleanup);
  process.on("uncaughtException", (err) => {
    logger.error("fatal", "uncaughtException", { message: err?.message, stack: err?.stack });
    cleanup();
    process.exit(1);
  });

  void waitUntilExit().then(cleanup);
}
