import { useEffect } from "react";

export function useAlternateScreen() {
  useEffect(() => {
    if (!process.stdout.isTTY) return;

    const enter = () => process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H");
    const exit = () => process.stdout.write("\x1b[?1049l");

    enter();

    const onSignal = () => {
      exit();
      process.exit();
    };

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    return () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      exit();
    };
  }, []);
}
