import { redirect } from "next/navigation";

// V3: P&L split into three Payout & P/L pages.
export default function PnlIndex() {
  redirect("/pnl/summary");
}
