import { redirect } from "next/navigation";

export default async function LegacyRoomDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/drawings/${id}`);
}
