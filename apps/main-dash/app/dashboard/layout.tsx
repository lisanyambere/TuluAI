import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardDataProvider } from "@/components/dashboard-data-provider";
import { MOCK_REQUESTS } from "@/lib/mock-data";
import { loadFacilityProfile } from "@/lib/operations-api";

const DEMO_USER = {
  name: "Grace N.",
  email: "demo.staff@tulu.test",
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const facility = await loadFacilityProfile();

  return (
    <DashboardDataProvider initialRequests={MOCK_REQUESTS} initialFacility={facility}>
      <DashboardShell user={DEMO_USER}>{children}</DashboardShell>
    </DashboardDataProvider>
  );
}
