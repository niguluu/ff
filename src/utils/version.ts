let _version: string = "";
let _latestVersion: string | null = null;
let _updateCheckDone = false;
let _updateCheckError: string | null = null;

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

/**
 * Check GitHub for a newer release. Returns the latest version string or null
 * if already up-to-date / unreachable. Results are cached after the first call.
 */
export async function checkForUpdate(): Promise<{
  hasUpdate: boolean;
  latestVersion: string | null;
  error: string | null;
}> {
  if (_updateCheckDone) {
    return {
      hasUpdate: _latestVersion !== null && _latestVersion !== getVersion(),
      latestVersion: _latestVersion,
      error: _updateCheckError,
    };
  }

  _updateCheckDone = true;

  try {
    const url = "https://api.github.com/repos/niguluu/fff/releases/latest";
    const response = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "fff-update-checker",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      _updateCheckError = `GitHub API returned ${response.status}`;
      return { hasUpdate: false, latestVersion: null, error: _updateCheckError };
    }

    const data = await response.json() as { tag_name?: string };
    const latestTag = data.tag_name ?? "";
    const latestVer = latestTag.replace(/^v/, "");

    if (!latestVer) {
      _updateCheckError = "No version tag found in latest release";
      return { hasUpdate: false, latestVersion: null, error: _updateCheckError };
    }

    _latestVersion = latestVer;
    const current = getVersion();
    const hasUpdate = latestVer !== current;

    return { hasUpdate, latestVersion: latestVer, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    _updateCheckError = msg;
    return { hasUpdate: false, latestVersion: null, error: msg };
  }
}

/** Reset the cached check result (useful for testing or manual re-check). */
export function resetUpdateCheck(): void {
  _latestVersion = null;
  _updateCheckDone = false;
  _updateCheckError = null;
}
