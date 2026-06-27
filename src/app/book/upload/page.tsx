import { redirect } from "next/navigation";

// V3: plain upload is superseded by the guided Integrations page.
export default function UploadRedirect() {
  redirect("/book/integrations");
}
