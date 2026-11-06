// CI helper: for each raw-data source, print its cache directory and the upstream branch's
// current commit. CI keys each source's cache on that commit: reruns reuse it unchanged, and an
// upstream update restores the previous cache, whose files the pipeline revalidates by blob sha.
// Writes `<name>-path=` and `<name>-rev=` lines to $GITHUB_OUTPUT, or to stdout locally.
import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sources } from "./config.ts";
import { sourceCacheDir } from "./fetchCached.ts";

const run = promisify(execFile);

async function branchHead(repo: string, branch: string): Promise<string> {
  const { stdout } = await run("git", [
    "ls-remote",
    `https://github.com/${repo}.git`,
    `refs/heads/${branch}`,
  ]);
  const sha = stdout.split(/\s/)[0];
  if (!sha) throw new Error(`找不到 ${repo} 的 ${branch} 分支`);
  return sha;
}

const lines: string[] = [];
for (const [name, source] of Object.entries(sources)) {
  const dir = path.relative(process.cwd(), sourceCacheDir(source)).split(path.sep).join("/");
  lines.push(`${name}-path=${dir}`, `${name}-rev=${await branchHead(source.repo, source.branch)}`);
}

const out = lines.join("\n") + "\n";
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, out);
else process.stdout.write(out);
