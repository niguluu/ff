import { spawn } from "node:child_process";

export function copyToClipboard(text: string) {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "pbcopy";
    args = [];
  } else if (platform === "win32") {
    command = "clip";
    args = [];
  } else if (process.env.WAYLAND_DISPLAY) {
    command = "wl-copy";
    args = [];
  } else {
    command = "xclip";
    args = ["-selection", "clipboard"];
  }

  const proc = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
  proc.stdin.write(text, "utf-8");
  proc.stdin.end();
  proc.on("error", () => {
    /* silent fail */
  });
}
