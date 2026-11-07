import { CliError } from "./errors.js";

/**
 * Target connection description for an MCP server.
 */
export type Target =
  | { kind: "stdio"; command: string; args: string[] }
  | { kind: "http"; url: string };

/**
 * Parses target connection information from command-line arguments.
 *
 * Target options are specified either as `--url <http(s) url>`
 * or as `-- <command> [args...]` where everything after `--` forms the process argv.
 *
 * @param argv - Argument array to search for target specification.
 * @returns The parsed Target object.
 * @throws {CliError} When target options are missing, invalid, or specify unsupported schemes.
 */
export function parseTarget(argv: string[]): Target {
  const doubleDashIndex = argv.indexOf("--");
  if (doubleDashIndex !== -1) {
    const command = argv[doubleDashIndex + 1];
    if (!command || command.trim() === "") {
      throw new CliError("INVALID_TARGET", "No command provided after --");
    }
    const args = argv.slice(doubleDashIndex + 2);
    return {
      kind: "stdio",
      command,
      args,
    };
  }

  const urlIndex = argv.indexOf("--url");
  if (urlIndex !== -1) {
    const urlArg = argv[urlIndex + 1];
    if (!urlArg) {
      throw new CliError("INVALID_TARGET", "Missing URL after --url");
    }
    let parsed: URL;
    try {
      parsed = new URL(urlArg);
    } catch {
      throw new CliError("INVALID_TARGET", `Invalid URL: ${urlArg}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new CliError(
        "INVALID_TARGET",
        `Unsupported protocol "${parsed.protocol}", only http: and https: are accepted`,
      );
    }
    return {
      kind: "http",
      url: parsed.toString(),
    };
  }

  throw new CliError(
    "INVALID_TARGET",
    "No target server specified. Provide either --url <url> or -- <command> [args...]",
  );
}
