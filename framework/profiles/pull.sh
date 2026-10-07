#!/bin/bash
# Refresh framework/profiles/ from OpenSpineConsortium/hpcworker, where the composed site profiles are
# canonical (its `profile.py compose-all` writes them from beethoven-sites' modules), and write ORIGIN:
# the commit they came from, the export and its version, and each file's sha256
# (extension/test/boundary.test.ts fails when the copy and ORIGIN differ). The profiles are data;
# nothing of that repository is run here, and nothing is read from a checkout of it (the interface
# standard, interface/README.md).
#
#   bash framework/profiles/pull.sh [--ref REF]   from GitHub through gh and your own sign-in (REF: main)
#
# REF must be a commit hpcworker's default branch contains (a merged change, never a pull request's
# branch), and only the files its interface/INTERFACE.json lists under the export "profiles" at that
# commit are taken, each to its path below the folder the export's paths share
# (framework/profiles/wayne.json -> wayne.json). A profile this copy has and the export no longer does
# is listed for a person to remove in a reviewed commit; nothing is deleted. Node reads the manifest
# and computes the digests, as the extension's own build needs it anyway. Then `npm run sync-profiles`
# and the tests in extension/, and the copy and ORIGIN are committed together.
set -euo pipefail
REPO=OpenSpineConsortium/hpcworker
EXPORT=profiles WANT=1   # the export, and the version of it the extension reads (scripts/sync-profiles.mjs, core/install.ts)
REF=main
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?--ref needs a branch, tag or commit}"; shift 2 ;;
    *) echo "usage: $0 [--ref REF]" >&2; exit 2 ;;
  esac
done
HERE="$(cd "$(dirname "$0")" && pwd)"
command -v gh >/dev/null || { echo "FAILED: gh is not installed" >&2; exit 1; }
command -v node >/dev/null || { echo "FAILED: node is needed to read the export's paths" >&2; exit 1; }
# your own sign-in, never a token a shell or a tool left in the environment
GH() { env -u GITHUB_TOKEN -u GH_TOKEN gh "$@"; }

sha=$(GH api "repos/$REPO/commits/$REF" --jq .sha) || { echo "FAILED: could not read $REF of $REPO (is gh signed in?)" >&2; exit 1; }
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "FAILED: no commit for $REF" >&2; exit 1; }
default=$(GH api "repos/$REPO" --jq .default_branch) || { echo "FAILED: could not read $REPO's default branch" >&2; exit 1; }
status=$(GH api "repos/$REPO/compare/$default...$sha" --jq .status) || { echo "FAILED: could not compare $sha with $REPO's $default" >&2; exit 1; }
case "$status" in
  identical|behind) ;;
  *) echo "FAILED: $sha is not on $REPO's $default; take only what was merged there" >&2; exit 1 ;;
esac
fetch() { GH api -H "Accept: application/vnd.github.raw" "repos/$REPO/contents/$1?ref=$sha"; }

# the export's paths, as the provider's manifest at that commit lists them
manifest=$(fetch interface/INTERFACE.json) || {
  echo "FAILED: $REPO has no interface/INTERFACE.json at $sha, so it offers no export to take there. Until its interface is merged on $default, the copy here stays as ORIGIN records it." >&2
  exit 1
}
# every file of the export at that commit, as "<path in hpcworker><TAB><path in this folder>": a path
# ending in "/" covers a folder, "*" matches within one part of a path, and each file lands at its path
# below the folder all of the export's paths share
pairs=$(GH api "repos/$REPO/git/trees/$sha?recursive=1" --jq '.tree[] | select(.type == "blob") | .path' | PULL_MANIFEST="$manifest" node -e '
const [want, ver] = process.argv.slice(1);
const fail = (why) => { process.stderr.write(`FAILED: ${why}\n`); process.exit(1); };
let m;
try { m = JSON.parse(process.env.PULL_MANIFEST); } catch (e) { fail(`its interface/INTERFACE.json is not JSON (${e.message})`); }
const offered = Array.isArray(m && m.exports) ? m.exports : [];
const e = offered.filter((x) => x && x.id === want);
if (e.length !== 1 || e[0].version !== Number(ver)) fail(`it does not offer ${want} version ${ver} (offered: ${offered.map((x) => `${x && x.id} ${x && x.version}`).join(", ") || "nothing"})`);
const pats = e[0].paths;
if (!Array.isArray(pats) || !pats.length || pats.some((p) => typeof p !== "string" || !p || p.startsWith("/") || p.split("/").includes(".."))) fail(`the paths of ${want} are not relative paths`);
const folderOf = (p) => { const lit = p.split("*")[0]; return lit.slice(0, lit.lastIndexOf("/") + 1); };
let base = folderOf(pats[0]);
for (const f of pats.map(folderOf)) while (!f.startsWith(base)) base = base.slice(0, base.slice(0, -1).lastIndexOf("/") + 1);
const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const covers = pats.map((p) => (p.endsWith("/") ? (s) => s.startsWith(p) : ((r) => (s) => r.test(s))(new RegExp(`^${p.split("*").map(esc).join("[^/]*")}$`))));
const own = new Set(["ORIGIN", "README.md", "pull.sh"]);
let tree = "";
process.stdin.on("data", (d) => (tree += d)).on("end", () => {
  const out = [];
  for (const s of tree.split("\n").filter(Boolean)) {
    if (!covers.some((c) => c(s))) continue;
    const rel = s.slice(base.length);
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/.test(rel)) fail(`${s} cannot be a file of this folder`);
    if (own.has(rel)) fail(`${s} would overwrite ${rel}, which this folder keeps for itself`);
    out.push(`${s}\t${rel}`);
  }
  if (!out.length) fail(`the export ${want} holds no file at that commit`);
  process.stdout.write(out.join("\n") + "\n");
});' "$EXPORT" "$WANT") || { echo "FAILED: nothing taken from $REPO at $sha" >&2; exit 1; }

digest() { node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"; }
# each profile is read by the build as a JSON object (scripts/sync-profiles.mjs); anything else stays out
is_object() { node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.exit(v && typeof v === "object" && !Array.isArray(v) ? 0 : 1)' "$1" 2>/dev/null; }

# every file is fetched and checked before any is moved in, so a failure leaves the copy as it was
parts=() rels=()
discard() { local p; for p in "${parts[@]}"; do rm -f -- "$p"; done; }
while IFS=$'\t' read -r p rel; do
  dest="$HERE/$rel"
  mkdir -p "$(dirname "$dest")"
  parts+=("$dest.part") rels+=("$rel")
  fetch "$p" >"$dest.part" || { discard; echo "FAILED: could not read $p at $sha" >&2; exit 1; }
  is_object "$dest.part" || { discard; echo "FAILED: $p at $sha is not a JSON object" >&2; exit 1; }
done <<< "$pairs"
origin=("repository $REPO" "commit $sha" "export $EXPORT $WANT")
for rel in "${rels[@]}"; do
  mv -f -- "$HERE/$rel.part" "$HERE/$rel"
  origin+=("sha256 $(digest "$HERE/$rel") $rel")
done
printf '%s\n' "${origin[@]}" >"$HERE/ORIGIN.part"
mv -f "$HERE/ORIGIN.part" "$HERE/ORIGIN"
echo "framework/profiles: ${#rels[@]} file(s) of $EXPORT $WANT from $REPO at $sha"
while IFS= read -r f; do
  rel="${f#"$HERE"/}"
  case "$rel" in ORIGIN|README.md|pull.sh) continue ;; esac
  printf '%s\n' "${rels[@]}" | grep -qxF -- "$rel" && continue
  echo "not in $REPO's export $EXPORT any more: framework/profiles/$rel (remove it in a reviewed commit)"
done < <(find "$HERE" -type f | sort)
echo "then, in extension/: npm run sync-profiles and the tests; commit the copy and ORIGIN together"
