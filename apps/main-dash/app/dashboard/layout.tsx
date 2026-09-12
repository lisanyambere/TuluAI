import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardDataProvider } from "@/components/dashboard-data-provider";
import { MOCK_FACILITY, MOCK_REQUESTS } from "@/lib/mock-data";

const DEMO_USER = {
  name: "Grace N.",
  email: "demo.staff@tulu.test",
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <DashboardDataProvider initialRequests={MOCK_REQUESTS} initialFacility={MOCK_FACILITY}>
      <DashboardShell user={DEMO_USER}>{children}</DashboardShell>
    </DashboardDataProvider>
  );
}
