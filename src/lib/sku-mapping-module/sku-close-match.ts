/** Lowercase, trim, normalize spaces for SKU comparison */
export function normalizeSkuMatchKey(s: string): string {
  return s
    .replace(/^\ufeff/, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Heuristic: spreadsheet header text slipped into column F */
export function isLikelyNonListingSkuLabel(s: string): boolean {
  const t = normalizeSkuMatchKey(s);
  if (!t) return true;
  if (t.includes("product id") && t.includes("style")) return true;
  if (t === "product id" || t === "style id") return true;
  if (t.includes("listing sku") && t.includes("master")) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n]!;
}

function longestCommonPrefixLen(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  for (; i < len; i++) {
    if (a[i] !== b[i]) break;
  }
  return i;
}

/**
 * Higher score = closer match to `master` (for sorting listing SKUs).
 * Empty master → all scores 0 (caller falls back to alphabetical).
 */
export function closeMatchScore(master: string, sku: string): number {
  const rawM = normalizeSkuMatchKey(master);
  const rawK = normalizeSkuMatchKey(sku);
  const m = rawM.replace(/\s+/g, "");
  const k = rawK.replace(/\s+/g, "");
  if (!m) return 0;
  if (!k) return 0;

  if (m === k) return 1_000_000_000;

  let score = 0;

  if (k.includes(m)) score += 800_000 + Math.min(200_000, (m.length / k.length) * 200_000);
  else if (m.includes(k) && k.length >= 3)
    score += 600_000 + Math.min(150_000, (k.length / m.length) * 150_000);

  const pref = longestCommonPrefixLen(m, k);
  score += pref * 12_000;

  const maxLen = Math.max(m.length, k.length, 1);
  const lev = levenshtein(m, k);
  score += (1 - lev / maxLen) * 400_000;

  const mt = rawM.split(/[\s\-_/]+/).filter((t) => t.length > 0);
  const kt = rawK.split(/[\s\-_/]+/).filter((t) => t.length > 0);
  if (mt.length && kt.length) {
    const kset = new Set(kt);
    let hits = 0;
    for (const t of mt) {
      if (kset.has(t)) hits++;
      else {
        for (const u of kt) {
          if (t.length >= 3 && u.length >= 3 && (t.includes(u) || u.includes(t))) {
            hits += 0.85;
            break;
          }
          const mx = Math.max(t.length, u.length, 1);
          const d = levenshtein(t, u);
          if (d <= 1 && mx <= 6) {
            hits += 0.7;
            break;
          }
          if (d <= 2 && mx >= 5 && d / mx <= 0.35) {
            hits += 0.5;
            break;
          }
        }
      }
    }
    score += (hits / mt.length) * 250_000;
  }

  return score;
}
