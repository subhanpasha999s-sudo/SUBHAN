import { permanentRedirect } from "next/navigation";

/** Root URL opens the label workspace directly (no marketing landing). */
export default function HomePage() {
  permanentRedirect("/export-labels");
}
