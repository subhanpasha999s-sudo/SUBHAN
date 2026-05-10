import { permanentRedirect } from "next/navigation";

/**
 * Legacy SEO slug kept for backward compatibility.
 * Redirects old indexed URL to the new optimized article.
 */
export default function LegacyMeeshoLabelCropOnlineRedirect() {
  permanentRedirect("/blog/how-to-crop-meesho-labels-for-4x6-thermal-printing");
}
