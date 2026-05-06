import { TopBar } from "@/components/top-bar";
import { serverApi } from "@/lib/api-client";
import { redirect } from "next/navigation";
import { DashboardClient } from "./_components/dashboard-client";

export const dynamic = "force-dynamic";

type DrawingsResponse = {
  owned: Array<{ id: string; name: string; updatedAt: string }>;
  shared: Array<{
    id: string;
    name: string;
    updatedAt: string;
    role: "OWNER" | "EDITOR" | "VIEWER";
    owner: { name: string | null; email: string };
  }>;
};

type MeResponse = {
  user: { id: string; email: string; name: string | null } | null;
};

export default async function HomePage() {
  const me = await serverApi.tryGet<MeResponse>("/auth/me");
  if (!me?.user) redirect("/login");

  const data = await serverApi.tryGet<DrawingsResponse>("/drawings");
  const owned = data?.owned ?? [];
  const shared = data?.shared ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar user={me.user} />
      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8">
        <DashboardClient
          owned={owned.map((d) => ({
            id: d.id,
            name: d.name,
            updatedAt: d.updatedAt,
            role: "OWNER" as const,
          }))}
          shared={shared.map((d) => ({
            id: d.id,
            name: d.name,
            updatedAt: d.updatedAt,
            role: d.role,
            ownerLabel: d.owner.name || d.owner.email,
          }))}
        />
      </main>
    </div>
  );
}

