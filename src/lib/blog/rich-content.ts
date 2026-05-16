const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "i",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "u",
  "ul",
]);

const SELF_CLOSING_TAGS = new Set(["br"]);
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)|[a-z]+)$/i;
const SIZE_RE = /^(1[0-9]|2[0-8]|[8-9])px$|^(0\.[8-9]|1(\.[0-8])?)rem$|^(8[0-9]|9[0-9]|1[0-8][0-9])%$/;

export function isRichHtmlContent(content: string) {
  return /<\/?(p|h[1-4]|ul|ol|li|span|strong|em|blockquote|pre|a|br)\b/i.test(content);
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeStyle(value: string) {
  const safe: string[] = [];
  for (const chunk of value.split(";")) {
    const [rawName, ...rawValue] = chunk.split(":");
    const name = rawName?.trim().toLowerCase();
    const nextValue = rawValue.join(":").trim();
    if (!name || !nextValue || /url|expression|javascript|[<>]/i.test(nextValue)) continue;

    if ((name === "color" || name === "background-color") && COLOR_RE.test(nextValue)) {
      safe.push(`${name}: ${nextValue}`);
    }
    if (name === "font-size" && SIZE_RE.test(nextValue)) {
      safe.push(`${name}: ${nextValue}`);
    }
    if (name === "text-align" && /^(left|center|right|justify)$/.test(nextValue)) {
      safe.push(`${name}: ${nextValue}`);
    }
    if (name === "font-weight" && /^(400|500|600|700|bold|normal)$/.test(nextValue)) {
      safe.push(`${name}: ${nextValue}`);
    }
    if (name === "font-style" && /^(italic|normal)$/.test(nextValue)) {
      safe.push(`${name}: ${nextValue}`);
    }
    if (name === "text-decoration" && /^(underline|line-through|none)$/.test(nextValue)) {
      safe.push(`${name}: ${nextValue}`);
    }
  }
  return safe.join("; ");
}

function sanitizeAttributes(tag: string, attrs: string) {
  const output: string[] = [];
  const attrPattern = /([a-zA-Z:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(attrs))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name.startsWith("on")) continue;

    if (name === "href" && tag === "a") {
      const href = value.trim();
      if (href.startsWith("/") || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
        output.push(`href="${escapeHtml(href)}"`);
        output.push('rel="noopener noreferrer"');
      }
    }

    if (name === "style") {
      const style = sanitizeStyle(value);
      if (style) output.push(`style="${escapeHtml(style)}"`);
    }
  }

  return output.length ? ` ${Array.from(new Set(output)).join(" ")}` : "";
}

export function sanitizeRichHtml(input: string) {
  return input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)\b[^>]*\/?>/gi, "")
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (raw, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (raw.startsWith("</")) return SELF_CLOSING_TAGS.has(tag) ? "" : `</${tag}>`;
      return `<${tag}${sanitizeAttributes(tag, attrs)}${SELF_CLOSING_TAGS.has(tag) ? " /" : ""}>`;
    })
    .trim();
}

function inlineMarkdownToHtml(text: string) {
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = href.startsWith("/") || href.startsWith("http://") || href.startsWith("https://") ? href : "";
    return safeHref ? `<a href="${escapeHtml(safeHref)}">${escapeHtml(label)}</a>` : escapeHtml(label);
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
  return html;
}

export function markdownToRichHtml(content: string) {
  const lines = content.split(/\r?\n/);
  const blocks: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listType || !listItems.length) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join("")}</${listType}>`);
    listItems = [];
    listType = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered ?? ordered)?.[1] ?? trimmed);
      continue;
    }
    flushList();
    if (trimmed.startsWith("# ")) blocks.push(`<h2>${inlineMarkdownToHtml(trimmed.slice(2))}</h2>`);
    else if (trimmed.startsWith("## ")) blocks.push(`<h3>${inlineMarkdownToHtml(trimmed.slice(3))}</h3>`);
    else if (trimmed.startsWith("### ")) blocks.push(`<h4>${inlineMarkdownToHtml(trimmed.slice(4))}</h4>`);
    else blocks.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
  }

  flushList();
  return sanitizeRichHtml(blocks.join(""));
}

export function contentToRichHtml(content: string) {
  return isRichHtmlContent(content) ? sanitizeRichHtml(content) : markdownToRichHtml(content);
}
