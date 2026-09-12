import { RequestDetail } from "@/components/request-detail";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  return <RequestDetail requestId={requestId} />;
}
