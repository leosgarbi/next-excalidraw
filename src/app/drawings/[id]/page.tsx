import { serverApi } from "@/lib/server-api";
import { notFound, redirect } from "next/navigation";
import { DrawingPageClient } from "./_client";

export const dynamic = "force-dynamic";

type DrawingResponse = {
	drawing: {
		id: string;
		name: string;
		content: unknown;
		ownerId: string;
	};
	role: "OWNER" | "EDITOR" | "VIEWER";
};

type MeResponse = {
	user: { id: string; email: string; name: string | null } | null;
};

type Props = { params: Promise<{ id: string }> };

export default async function DrawingPage({ params }: Props) {
	const { id } = await params;
	const me = await serverApi.tryGet<MeResponse>("/auth/me");
	if (!me?.user) redirect(`/login?from=/drawings/${id}`);

	const data = await serverApi.tryGet<DrawingResponse>(`/drawings/${id}`);
	if (!data) notFound();

	return (
		<DrawingPageClient
			user={me.user}
			drawing={{
				id: data.drawing.id,
				name: data.drawing.name,
				content: data.drawing.content,
				ownerId: data.drawing.ownerId,
			}}
			role={data.role}
		/>
	);
}
