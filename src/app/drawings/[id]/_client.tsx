"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { createRealtimeSocket, type RealtimeSocket } from "@/lib/realtime";
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
// Throttle de broadcast realtime: alta o suficiente para parecer instantâneo,
// baixa o suficiente para não saturar a rede em rabiscos rápidos.
const BROADCAST_THROTTLE_MS = 80;

// Tipo mínimo do excalidrawAPI que usamos. Evita import direto do tipo (que
// só existe em runtime após o dynamic import).
type ExcalidrawAPI = {
	updateScene: (scene: { elements?: readonly unknown[] }) => void;
	getSceneElementsIncludingDeleted: () => readonly unknown[];
};

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

	// Refs do realtime.
	const excalidrawAPIRef = useRef<ExcalidrawAPI | null>(null);
	const socketRef = useRef<RealtimeSocket | null>(null);
	// Quando aplicamos um update vindo da rede, suprimimos o próximo emit
	// para evitar loop (cada cliente reemitindo o que recebeu).
	const skipNextEmitRef = useRef(false);
	// Última vez que disparamos um broadcast (throttle).
	const lastBroadcastAtRef = useRef(0);
	const pendingBroadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastElementsRef = useRef<readonly unknown[] | null>(null);

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
			// Sempre guarda o último snapshot para reconciliação ao receber updates remotos.
			lastElementsRef.current = elements;

			// Se o evento foi disparado por um update remoto, NÃO retransmite nem persiste.
			if (skipNextEmitRef.current) {
				skipNextEmitRef.current = false;
				return;
			}

			if (!canEdit) return;

			// 1) Broadcast em tempo real (throttled).
			const socket = socketRef.current;
			if (socket && socket.connected) {
				const now = Date.now();
				const since = now - lastBroadcastAtRef.current;
				const flush = () => {
					lastBroadcastAtRef.current = Date.now();
					socket.emit("scene-update", { elements });
				};
				if (since >= BROADCAST_THROTTLE_MS) {
					if (pendingBroadcastTimerRef.current) {
						clearTimeout(pendingBroadcastTimerRef.current);
						pendingBroadcastTimerRef.current = null;
					}
					flush();
				} else if (!pendingBroadcastTimerRef.current) {
					pendingBroadcastTimerRef.current = setTimeout(() => {
						pendingBroadcastTimerRef.current = null;
						flush();
					}, BROADCAST_THROTTLE_MS - since);
				}
			}

			// 2) Persistência debounced no backend (autosave).
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

	// Conexão Socket.IO + listeners de scene-update.
	useEffect(() => {
		const socket = createRealtimeSocket();
		socketRef.current = socket;

		const join = () => {
			socket.emit("join", { drawingId: drawing.id }, (res: unknown) => {
				const ok = (res as { ok?: boolean })?.ok;
				if (!ok) {
					console.warn("[realtime] join recusado:", res);
				}
			});
		};

		socket.on("connect", join);
		socket.on("scene-update", (payload: { elements: readonly unknown[] }) => {
			const api = excalidrawAPIRef.current;
			if (!api || !payload?.elements) return;
			// Marca para o próximo onChange disparado pelo updateScene não retransmitir.
			skipNextEmitRef.current = true;
			api.updateScene({ elements: payload.elements });
		});

		return () => {
			socket.removeAllListeners();
			socket.disconnect();
			socketRef.current = null;
			if (pendingBroadcastTimerRef.current) {
				clearTimeout(pendingBroadcastTimerRef.current);
				pendingBroadcastTimerRef.current = null;
			}
		};
	}, [drawing.id]);

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
					excalidrawAPI={(api: unknown) => {
						excalidrawAPIRef.current = api as ExcalidrawAPI;
					}}
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
