import { permanentRedirect } from "next/navigation";

/**
 * Legacy SEO slug kept for backward compatibility.
 * Redirects old indexed URL to the closest updated guide.
 */
export default function LegacyMarketplaceWorkflowRedirect() {
  permanentRedirect("/blog/how-top-meesho-sellers-manage-thousands-of-orders");
}
