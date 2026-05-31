#!/usr/bin/env node
import { logger, getLogFile } from "./logger.js";

// Subcommand: `fff index` regenerates codebase-index.yaml and exits without
// ever entering the TUI. Imports are dynamic so the index path does not load
// the interactive app (and its hard API-key requirement).
const argv = process.argv.slice(2);
if (argv[0] === "index") {
  import("./indexer.js")
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
  const { render } = await import("ink");
  const React = (await import("react")).default;
  const App = (await import("./app.js")).default;
  const { killAllChildren } = await import("./process-registry.js");
  const isTty = process.stdout.isTTY;

  // Gruvbox dark theme. Ink's <Box> can't paint a background in this version,
  // so we set the terminal's *default* foreground/background via OSC 10/11.
  // This makes the whole screen adopt the theme (including the gaps between
  // text) and is reset on exit with OSC 110/111. Keep these in sync with
  // src/config.ts (GRUVBOX_BG / GRUVBOX_FG).
  const GRUVBOX_BG = "#282828";
  const GRUVBOX_FG = "#ebdbb2";

  // Enter the alternate screen BEFORE Ink's first render. Doing the clear here
  // (instead of in a post-mount effect) means Ink's first frame is never erased
  // — fixing the "UI doesn't appear until I type something" glitch.
  if (isTty) {
    process.stdout.write(
      `\x1b]11;${GRUVBOX_BG}\x07\x1b]10;${GRUVBOX_FG}\x07` +
        "\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l"
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
    // Kill any commands the agent left running so they don't detach into the
    // user's session.
    killAllChildren();
    try {
      unmount();
    } catch {
      /* already unmounted */
    }
    if (isTty) {
      // Restore the cursor, reset the theme colors we set (OSC 110/111) and
      // leave the alternate screen so the shell prompt returns to exactly where
      // it was instead of landing somewhere random.
      process.stdout.write("\x1b[?25h\x1b]111\x07\x1b]110\x07\x1b[?1049l");
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
