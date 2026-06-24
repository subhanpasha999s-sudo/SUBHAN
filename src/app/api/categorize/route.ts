/**
 * POST /api/categorize
 * AI categorization via Claude Haiku — batch-processes unmatched bank transactions.
 * Falls back gracefully when ANTHROPIC_API_KEY is not set.
 */
import { NextRequest, NextResponse } from "next/server";
import { COA_OPTIONS } from "@/book/lib/engine/bankCategorize";

interface TxnInput {
  id: string;
  description: string;
  debit: number;
  credit: number;
}

interface CatResult {
  id: string;
  category: string;
  coaCode: string;
  confidence: number;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured — AI categorization unavailable." },
      { status: 503 }
    );
  }

  let body: { transactions: TxnInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { transactions } = body;
  if (!transactions?.length) return NextResponse.json({ results: [] });

  // Build the COA reference list for the prompt
  const coaList = COA_OPTIONS.map(o => `  "${o.label}" (${o.direction}s only)`).join("\n");

  const txnLines = transactions
    .map(t => {
      const dir = t.debit > 0 ? "DEBIT" : "CREDIT";
      const amt = t.debit > 0 ? t.debit : t.credit;
      return `ID:${t.id} | ${dir} ₹${amt.toFixed(2)} | ${t.description}`;
    })
    .join("\n");

  const prompt = `You are an accounting assistant for a small Indian e-commerce seller on Meesho.
Categorize each bank transaction into one of these Chart of Accounts entries:

${coaList}

Rules:
- DEBIT = money leaving the account (expenses/asset purchases)
- CREDIT = money arriving (income/owner deposits)
- Match the direction: only assign debit-only accounts to DEBITs, credit-only to CREDITs
- If confidence < 0.6, use "Operating Expenses" for debits or "Sales Revenue" for credits
- Indian context: GST/TDS payments → Operating Expenses; Meesho settlements → Sales Revenue

Transactions to categorize:
${txnLines}

Respond with ONLY this JSON (no markdown, no explanation):
{"results":[{"id":"...","category":"exact account name from list above","confidence":0.0}]}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json({ error: `Anthropic API error: ${errText}` }, { status: 502 });
    }

    const data = await resp.json();
    const text: string = data.content?.[0]?.text ?? "{}";

    // Extract JSON — strip any accidental markdown fences
    const jsonText = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
    let parsed: { results: Array<{ id: string; category: string; confidence: number }> };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "AI returned unparseable JSON", raw: text }, { status: 502 });
    }

    const results: CatResult[] = (parsed.results ?? []).map(r => {
      const opt = COA_OPTIONS.find(o => o.label === r.category);
      return {
        id: r.id,
        category: r.category,
        coaCode: opt?.code ?? "6300",   // fallback: Operating Expenses
        confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
      };
    });

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
