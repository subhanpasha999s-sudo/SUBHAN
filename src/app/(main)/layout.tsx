import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceSectionStack } from "@/components/layout/workspace-layout";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <WorkspaceSectionStack>{children}</WorkspaceSectionStack>
    </AppShell>
  );
}
