import { notFound } from "next/navigation";
import { RequestDetail } from "@/components/request-detail";
import { MOCK_REQUESTS } from "@/lib/mock-data";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const request = MOCK_REQUESTS.find((item) => item.id === requestId);

  if (!request) {
    notFound();
  }

  return <RequestDetail requestId={request.id} />;
}
