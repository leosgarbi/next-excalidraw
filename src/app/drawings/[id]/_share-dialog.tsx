"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { initials } from "@/lib/utils";
import { Copy, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Role = "EDITOR" | "VIEWER";

type Member = {
  id: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  user: { id: string; email: string; name: string | null };
};

type Invite = {
  id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  token: string;
};

export function ShareDialog({
  drawingId,
  open,
  onOpenChange,
  currentUser,
}: {
  drawingId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUser: { id: string; email: string };
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [owner, setOwner] = useState<Member["user"] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        apiFetch(`/drawings/${drawingId}/members`).then((r) => r.json()),
        apiFetch(`/drawings/${drawingId}/invites`).then((r) => r.json()),
      ]);
      setOwner(m.owner ?? null);
      setMembers(m.members ?? []);
      setInvites(i.invites ?? []);
    } catch {
      toast.error("Erro ao carregar compartilhamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/drawings/${drawingId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "Erro ao convidar");
        return;
      }
      setEmail("");
      toast.success("Convite criado. Copie o link.");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(memberId: string, newRole: Role) {
    const res = await apiFetch(`/drawings/${drawingId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.message ?? data.error ?? "Erro");
      return;
    }
    toast.success("Permissão atualizada");
    await refresh();
  }

  async function removeMember(memberId: string) {
    if (!confirm("Remover este membro?")) return;
    const res = await apiFetch(`/drawings/${drawingId}/members/${memberId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Erro ao remover");
      return;
    }
    toast.success("Removido");
    await refresh();
  }

  async function revokeInvite(inviteId: string) {
    const res = await apiFetch(`/drawings/${drawingId}/invites/${inviteId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Erro ao revogar");
      return;
    }
    await refresh();
  }

  function copyInviteLink(token: string) {
    const url = `${location.origin}/invites/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compartilhar desenho</DialogTitle>
          <DialogDescription>
            Convide pessoas por email. Apenas usuários cadastrados conseguem aceitar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={sendInvite} className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invite-email" className="sr-only">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EDITOR">Editor</SelectItem>
              <SelectItem value="VIEWER">Visualizador</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={submitting}>
            <UserPlus /> Convidar
          </Button>
        </form>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Pessoas com acesso</h3>
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          <ul className="divide-y rounded-md border">
            {owner && (
              <MemberRow
                user={owner}
                roleLabel="OWNER"
                isCurrent={owner.id === currentUser.id}
              />
            )}
            {members.map((m) => (
              <MemberRow
                key={m.id}
                user={m.user}
                roleLabel={m.role}
                isCurrent={m.user.id === currentUser.id}
                action={
                  <div className="flex items-center gap-2">
                    <Select
                      value={m.role === "OWNER" ? "EDITOR" : m.role}
                      onValueChange={(v) => changeRole(m.id, v as Role)}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EDITOR">Editor</SelectItem>
                        <SelectItem value="VIEWER">Visualizador</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMember(m.id)}
                      aria-label="Remover"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                }
              />
            ))}
            {members.length === 0 && !loading && (
              <li className="px-3 py-3 text-sm text-muted-foreground">Nenhum membro ainda.</li>
            )}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Convites pendentes</h3>
          <ul className="divide-y rounded-md border">
            {invites.filter((i) => i.status === "PENDING").map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Expira em {new Date(i.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="secondary">{i.role}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyInviteLink(i.token)}
                >
                  <Copy /> Link
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => revokeInvite(i.id)}
                  aria-label="Revogar"
                >
                  <X />
                </Button>
              </li>
            ))}
            {invites.filter((i) => i.status === "PENDING").length === 0 && (
              <li className="px-3 py-3 text-sm text-muted-foreground">Nenhum convite pendente.</li>
            )}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  user,
  roleLabel,
  isCurrent,
  action,
}: {
  user: { id: string; email: string; name: string | null };
  roleLabel: "OWNER" | "EDITOR" | "VIEWER";
  isCurrent: boolean;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-medium">
        {initials(user.name, user.email)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">
          {user.name || user.email}
          {isCurrent && <span className="text-muted-foreground ml-1">(você)</span>}
        </p>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>
      {action ?? <Badge variant={roleLabel === "OWNER" ? "default" : "secondary"}>{roleLabel}</Badge>}
    </li>
  );
}
