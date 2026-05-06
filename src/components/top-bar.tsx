"use client";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { initials } from "@/lib/utils";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = {
  user: { id: string; email: string; name: string | null } | null;
};

export function TopBar({ user }: Props) {
  const router = useRouter();

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" });
    toast.success("Sessão encerrada");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b bg-background sticky top-0 z-30">
      <div className="mx-auto max-w-6xl flex h-14 items-center justify-between px-6">
        <Link href="/" className="font-semibold tracking-tight">
          Excalidraw <span className="text-muted-foreground">SaaS</span>
        </Link>
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <div className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-medium">
                  {initials(user.name, user.email)}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.name || "Sem nome"}</span>
                  <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );
}
