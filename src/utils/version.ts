let _version: string = "";

export function getVersion(): string {
  if (_version) return _version;
  try {
    const fs = require("fs");
    const path = require("path");
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8")
    );
    _version = pkg.version ?? "0.0.0";
  } catch {
    _version = "0.0.0";
  }
  return _version;
}
