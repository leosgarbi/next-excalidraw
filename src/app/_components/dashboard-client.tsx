"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type Owned = { id: string; name: string; updatedAt: string; role: "OWNER" };
type Shared = {
  id: string;
  name: string;
  updatedAt: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  ownerLabel: string;
};

export function DashboardClient({ owned, shared }: { owned: Owned[]; shared: Shared[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);

  async function createDrawing() {
    setCreating(true);
    try {
      const res = await apiFetch("/drawings", {
        method: "POST",
        body: JSON.stringify({ name: "Sem título" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Erro");
      router.push(`/drawings/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setCreating(false);
    }
  }

  async function deleteDrawing(id: string) {
    if (!confirm("Apagar este desenho? Esta ação não pode ser desfeita.")) return;
    start(async () => {
      const res = await apiFetch(`/drawings/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message ?? data.error ?? "Erro ao apagar");
        return;
      }
      toast.success("Desenho apagado");
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Meus desenhos</h1>
          <Button onClick={createDrawing} disabled={creating}>
            <Plus /> Novo desenho
          </Button>
        </div>
        {owned.length === 0 ? (
          <EmptyState message="Você ainda não tem desenhos. Crie o primeiro." />
        ) : (
          <Grid>
            {owned.map((d) => (
              <DrawingCard
                key={d.id}
                drawing={d}
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      deleteDrawing(d.id);
                    }}
                    disabled={pending}
                    aria-label="Apagar"
                  >
                    <Trash2 />
                  </Button>
                }
              />
            ))}
          </Grid>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" /> Compartilhados comigo
        </h2>
        {shared.length === 0 ? (
          <EmptyState message="Nenhum desenho compartilhado com você ainda." />
        ) : (
          <Grid>
            {shared.map((d) => (
              <DrawingCard
                key={d.id}
                drawing={d}
                subtitle={`de ${d.ownerLabel}`}
              />
            ))}
          </Grid>
        )}
      </section>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function DrawingCard({
  drawing,
  subtitle,
  actions,
}: {
  drawing: { id: string; name: string; updatedAt: string; role: "OWNER" | "EDITOR" | "VIEWER" };
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Link href={`/drawings/${drawing.id}`} className="block">
      <Card className="hover:border-foreground/30 transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="truncate">{drawing.name}</CardTitle>
            <Badge variant={drawing.role === "OWNER" ? "default" : "secondary"}>
              {drawing.role}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {subtitle ? `${subtitle} · ` : ""}atualizado{" "}
            {new Date(drawing.updatedAt).toLocaleDateString()}
          </span>
          {actions}
        </CardContent>
      </Card>
    </Link>
  );
}
