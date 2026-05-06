"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import "@excalidraw/excalidraw/index.css";
import { ArrowLeft, Eye, Pencil, Share2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShareDialog } from "./_share-dialog";

const Excalidraw = dynamic(() => import("@excalidraw/excalidraw").then((m) => m.Excalidraw), {
	ssr: false,
	loading: () => <div className="p-8 text-sm text-muted-foreground">Carregando…</div>,
});

type Role = "OWNER" | "EDITOR" | "VIEWER";

type Drawing = {
	id: string;
	name: string;
	content: unknown;
	ownerId: string;
};

const SAVE_DEBOUNCE_MS = 800;

export function DrawingPageClient({
	user,
	drawing,
	role,
}: {
	user: { id: string; email: string; name: string | null };
	drawing: Drawing;
	role: Role;
}) {
	const router = useRouter();
	const [name, setName] = useState(drawing.name);
	const [editingName, setEditingName] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const canEdit = role === "OWNER" || role === "EDITOR";
	const isOwner = role === "OWNER";

	const initialData = (() => {
		if (!drawing.content || typeof drawing.content !== "object") return {};
		const raw = drawing.content as Record<string, unknown>;
		const appState =
			raw.appState && typeof raw.appState === "object"
				? { ...(raw.appState as Record<string, unknown>) }
				: undefined;
		if (appState) {
			// Excalidraw espera collaborators como Map; após JSON.parse vira objeto e quebra (forEach is not a function).
			// Removemos para o Excalidraw recriar internamente.
			delete appState.collaborators;
		}
		return { ...raw, ...(appState ? { appState } : {}) };
	})();

	const onChange = useCallback(
		(elements: readonly unknown[], appState: unknown, files: unknown) => {
			if (!canEdit) return;
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(async () => {
				try {
					// Não persistir collaborators (Map não serializa em JSON e quebra no reload)
					const cleanAppState =
						appState && typeof appState === "object"
							? (() => {
									const { collaborators: _omit, ...rest } = appState as Record<string, unknown>;
									void _omit;
									return rest;
								})()
							: appState;
					const res = await apiFetch(`/drawings/${drawing.id}`, {
						method: "PUT",
						body: JSON.stringify({ elements, appState: cleanAppState, files }),
					});
					if (!res.ok) {
						const data = await res.json().catch(() => ({}));
						toast.error(data.message ?? data.error ?? "Falha ao salvar");
					}
				} catch {
					toast.error("Falha de rede ao salvar");
				}
			}, SAVE_DEBOUNCE_MS);
		},
		[canEdit, drawing.id],
	);

	useEffect(() => {
		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
		};
	}, []);

	async function renameDrawing() {
		const trimmed = name.trim();
		if (!trimmed || trimmed === drawing.name) {
			setEditingName(false);
			setName(drawing.name);
			return;
		}
		const res = await apiFetch(`/drawings/${drawing.id}`, {
			method: "PATCH",
			body: JSON.stringify({ name: trimmed }),
		});
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			toast.error(data.message ?? data.error ?? "Erro ao renomear");
			setName(drawing.name);
		} else {
			toast.success("Renomeado");
			router.refresh();
		}
		setEditingName(false);
	}

	return (
		<div className="h-screen w-screen flex flex-col">
			<header className="border-b bg-background flex items-center gap-3 px-4 h-12 shrink-0">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/" aria-label="Voltar">
						<ArrowLeft />
					</Link>
				</Button>

				{editingName && isOwner ? (
					<input
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
						onBlur={renameDrawing}
						onKeyDown={(e) => {
							if (e.key === "Enter") renameDrawing();
							if (e.key === "Escape") {
								setName(drawing.name);
								setEditingName(false);
							}
						}}
						className="text-sm font-medium bg-transparent border-b border-input outline-hidden focus:border-foreground"
					/>
				) : (
					<button
						type="button"
						onClick={() => isOwner && setEditingName(true)}
						className="text-sm font-medium truncate max-w-[40vw] disabled:cursor-default"
						disabled={!isOwner}
						title={isOwner ? "Renomear" : undefined}
					>
						{name}
					</button>
				)}

				<Badge variant={canEdit ? "default" : "secondary"} className="gap-1">
					{canEdit ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
					{role}
				</Badge>

				<div className="ml-auto flex items-center gap-2">
					{isOwner && (
						<Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
							<Share2 /> Compartilhar
						</Button>
					)}
				</div>
			</header>

			<div className="flex-1 min-h-0">
				<Excalidraw
					initialData={initialData as never}
					viewModeEnabled={!canEdit}
					onChange={onChange}
				/>
			</div>

			{isOwner && (
				<ShareDialog
					drawingId={drawing.id}
					open={shareOpen}
					onOpenChange={setShareOpen}
					currentUser={user}
				/>
			)}
		</div>
	);
}
