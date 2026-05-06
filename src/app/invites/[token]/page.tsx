"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

type Preview = {
  drawingName: string;
  ownerName: string;
  role: "EDITOR" | "VIEWER";
  email: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
};

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [me, setMe] = useState<{ email: string } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    apiFetch(`/invites/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? data.error ?? "Convite inválido");
        setPreview(data);
      })
      .catch((err: Error) => setError(err.message));

    apiFetch("/auth/me")
      .then(async (r) => (r.ok ? r.json() : { user: null }))
      .then((data) => setMe(data.user ? { email: data.user.email } : null));
  }, [token]);

  async function accept() {
    setAccepting(true);
    try {
      const res = await apiFetch(`/invites/${token}/accept`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "Erro ao aceitar");
        return;
      }
      toast.success("Convite aceito!");
      router.push(`/drawings/${data.drawingId}`);
    } finally {
      setAccepting(false);
    }
  }

  if (error) {
    return <Centered><p className="text-sm text-destructive">{error}</p></Centered>;
  }
  if (!preview) {
    return <Centered><p className="text-sm text-muted-foreground">Carregando…</p></Centered>;
  }

  const expired = preview.status === "EXPIRED";
  const usable = preview.status === "PENDING";
  const wrongAccount = me && me.email !== preview.email;

  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Você foi convidado</CardTitle>
          <CardDescription>
            <strong>{preview.ownerName}</strong> compartilhou{" "}
            <strong>{preview.drawingName}</strong> com você.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Permissão:</span>
            <Badge>{preview.role}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Convite enviado para <strong>{preview.email}</strong>.
          </div>

          {!usable && (
            <p className="text-sm text-destructive">
              Este convite está {preview.status.toLowerCase()}.
            </p>
          )}

          {usable && me === null && (
            <div className="space-y-2">
              <p className="text-sm">Você precisa entrar para aceitar.</p>
              <div className="flex gap-2">
                <Button asChild className="flex-1">
                  <Link href={`/login?from=/invites/${token}`}>Entrar</Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link href={`/register?from=/invites/${token}`}>Criar conta</Link>
                </Button>
              </div>
            </div>
          )}

          {usable && me && wrongAccount && (
            <p className="text-sm text-destructive">
              Você está logado como {me.email}. Saia e entre com {preview.email}.
            </p>
          )}

          {usable && me && !wrongAccount && (
            <Button className="w-full" onClick={accept} disabled={accepting}>
              {accepting ? "Aceitando…" : "Aceitar convite"}
            </Button>
          )}
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-6">{children}</div>;
}
