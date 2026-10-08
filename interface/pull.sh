#!/bin/bash
# Takes what this repository imports (interface/INTERFACE.json, "imports") from the repository that
# offers it, each export into its own folder, and writes that folder's ORIGIN: the repository, the
# commit, the export and its version, and each file's sha256 (extension/test/boundary.test.ts fails when
# a folder and its ORIGIN differ). Nothing is read from a checkout of another repository and nothing of
# it is run here (the interface standard, interface/README.md).
#
#   bash interface/pull.sh [--ref REF] FOLDER...    from GitHub through gh and your own sign-in (REF: main)
#   bash interface/pull.sh --at-origin FOLDER...    again the files each FOLDER's ORIGIN records, at its commit
#
# FOLDER is an import's "into": framework/profiles, framework/contract or framework/contract-text.
# REF must be a commit the provider's default branch contains (a merged change, never a pull request's
# branch). Only the files the provider's interface/INTERFACE.json lists under the export at that commit
# are taken, at the version the import names, each to its path below the folder the export's paths share
# (framework/profiles/wayne.json -> wayne.json), with the executable bit the provider's tree records. A
# file a folder holds and the export no longer does is listed for a person to remove in a reviewed commit;
# nothing is deleted. Node reads the manifests and computes the digests, as the extension's build needs it
# anyway. Then the tests in extension/, and each committed copy and its ORIGIN are committed together.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
usage() { echo "usage: $0 [--ref REF | --at-origin] FOLDER..." >&2; exit 2; }
fail() { echo "FAILED: $*" >&2; exit 1; }
REF=main AT_ORIGIN=0 folders=()
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?--ref needs a branch, tag or commit}"; shift 2 ;;
    --at-origin) AT_ORIGIN=1; shift ;;
    -*) usage ;;
    *) folders+=("${1%/}"); shift ;;
  esac
done
[ ${#folders[@]} -gt 0 ] || usage
command -v gh >/dev/null || fail "gh is not installed"
command -v node >/dev/null || fail "node is needed to read the manifests"

# the import a folder holds, as "<repository><TAB><export><TAB><version>", from this repository's own manifest
import_of() {
  node -e '
const [file, into] = process.argv.slice(1);
const m = JSON.parse(require("fs").readFileSync(file, "utf8"));
const hit = (m.imports || []).filter((i) => i && i.into === into);
if (hit.length !== 1 || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(hit[0].repository) || !/^[a-z][a-z0-9-]*$/.test(hit[0].export) || !Number.isInteger(hit[0].version)) {
  process.stderr.write(`FAILED: interface/INTERFACE.json names no import into ${into} (imports: ${(m.imports || []).map((i) => i && i.into).join(", ") || "none"})\n`);
  process.exit(1);
}
process.stdout.write(`${hit[0].repository}\t${hit[0].export}\t${hit[0].version}`);' "$ROOT/interface/INTERFACE.json" "$1"
}
digest() { node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$1"; }
# a .json file of an export is read as a JSON object (the build's profiles, the contract's files); anything else stays out
is_object() { node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); process.exit(v && typeof v === "object" && !Array.isArray(v) ? 0 : 1)' "$1" 2>/dev/null; }

pull_one() {
  local into="$1" dir="$ROOT/$1" imp repo export want sha default status manifest pairs own
  imp=$(import_of "$into") || exit 1
  IFS=$'\t' read -r repo export want <<< "$imp"
  [ -d "$dir" ] || fail "$into is not a folder of this repository"
  if [ "$AT_ORIGIN" = 1 ]; then
    [ -f "$dir/ORIGIN" ] || fail "$into has no ORIGIN to take the commit from"
    [ "$(sed -n 1p "$dir/ORIGIN")" = "repository $repo" ] || fail "$into/ORIGIN does not name $repo"
    sha=$(sed -n 's/^commit \([0-9a-f]\{40\}\)$/\1/p' "$dir/ORIGIN")
  else
    sha=$(gh api "repos/$repo/commits/$REF" --jq .sha) || fail "could not read $REF of $repo (is gh signed in?)"
  fi
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "no commit for ${REF} of $repo"
  default=$(gh api "repos/$repo" --jq .default_branch) || fail "could not read $repo's default branch"
  status=$(gh api "repos/$repo/compare/$default...$sha" --jq .status) || fail "could not compare $sha with $repo's $default"
  case "$status" in
    identical|behind) ;;
    *) fail "$sha is not on $repo's $default; take only what was merged there" ;;
  esac
  fetch() { gh api -H "Accept: application/vnd.github.raw" "repos/$repo/contents/$1?ref=$sha"; }

  # the export's paths, as the provider's manifest at that commit lists them
  manifest=$(fetch interface/INTERFACE.json) || fail "$repo has no interface/INTERFACE.json at $sha, so it offers no export to take there. Until its interface is merged on $default, $into stays as its ORIGIN records it."
  # what this folder keeps for itself: ORIGIN and pull.sh always, and a README.md of its own (one its
  # ORIGIN does not list); a README.md the export carries (the framework's own) lands like any other file
  own="ORIGIN pull.sh"
  if [ -f "$dir/README.md" ] && ! grep -qxE 'sha256 [0-9a-f]{64} README\.md' "$dir/ORIGIN" 2>/dev/null; then own="$own README.md"; fi
  # every file of the export at that commit, as "<mode><TAB><path in the provider><TAB><path in this
  # folder>": a path ending in "/" covers a folder, "*" matches within one part of a path, and each file
  # lands at its path below the folder all of the export's paths share
  pairs=$(gh api "repos/$repo/git/trees/$sha?recursive=1" --jq '(if .truncated then "truncated" else empty end), (.tree[] | select(.type == "blob") | "\(.mode) \(.path)")' | PULL_MANIFEST="$manifest" PULL_OWN="$own" node -e '
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
const own = new Set(process.env.PULL_OWN.split(" "));
let tree = "";
process.stdin.on("data", (d) => (tree += d)).on("end", () => {
  const out = [];
  for (const line of tree.split("\n").filter(Boolean)) {
    if (line === "truncated") fail("the tree at that commit is too large for one listing, so the export cannot be read whole");
    const sp = line.indexOf(" ");
    const mode = line.slice(0, sp);
    const s = line.slice(sp + 1);
    if (!covers.some((c) => c(s))) continue;
    // a regular file or an executable one, never a link (its bytes would be the name it points at)
    if (mode !== "100644" && mode !== "100755") fail(`${s} is not a regular file at that commit (mode ${mode})`);
    const rel = s.slice(base.length);
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*(\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/.test(rel)) fail(`${s} cannot be a file of this folder`);
    if (own.has(rel)) fail(`${s} would overwrite ${rel}, which this folder keeps for itself`);
    out.push(`${mode}\t${s}\t${rel}`);
  }
  if (!out.length) fail(`the export ${want} holds no file at that commit`);
  process.stdout.write(out.join("\n") + "\n");
});' "$export" "$want") || fail "nothing taken from $repo at $sha into $into"

  # every file is fetched and checked before any is moved in, so a failure leaves the folder as it was
  local parts=() rels=() modes=() p rel mode dest
  discard() { local x; for x in "${parts[@]}"; do rm -f -- "$x"; done; }
  while IFS=$'\t' read -r mode p rel; do
    dest="$dir/$rel"
    mkdir -p "$(dirname "$dest")"
    parts+=("$dest.part") rels+=("$rel") modes+=("$mode")
    fetch "$p" >"$dest.part" || { discard; fail "could not read $p at $sha"; }
    case "$rel" in
      *.json) is_object "$dest.part" || { discard; fail "$p at $sha is not a JSON object"; } ;;
    esac
  done <<< "$pairs"
  local origin=("repository $repo" "commit $sha" "export $export $want") i
  for i in "${!rels[@]}"; do
    mv -f -- "$dir/${rels[$i]}.part" "$dir/${rels[$i]}"
    if [ "${modes[$i]}" = 100755 ]; then chmod 755 "$dir/${rels[$i]}"; else chmod 644 "$dir/${rels[$i]}"; fi
  done
  # sorted by path, the same in every locale, so the same export always writes the same ORIGIN
  while IFS= read -r rel; do origin+=("sha256 $(digest "$dir/$rel") $rel"); done < <(printf '%s\n' "${rels[@]}" | LC_ALL=C sort)
  printf '%s\n' "${origin[@]}" >"$dir/ORIGIN.part"
  mv -f "$dir/ORIGIN.part" "$dir/ORIGIN"
  echo "$into: ${#rels[@]} file(s) of $export $want from $repo at $sha"
  local f
  while IFS= read -r f; do
    rel="${f#"$dir"/}"
    case " $own " in *" $rel "*) continue ;; esac
    printf '%s\n' "${rels[@]}" | grep -qxF -- "$rel" && continue
    echo "not in $repo's export $export any more: $into/$rel (remove it in a reviewed commit)"
  done < <(find "$dir" -type f | LC_ALL=C sort)
}

for f in "${folders[@]}"; do pull_one "$f"; done
echo "then, in extension/: the tests; commit each committed copy with its ORIGIN, and every ORIGIN"
