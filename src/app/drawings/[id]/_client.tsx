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

// MainMenu customizado (sem X/GitHub, Discord apontando para nosso server).
// Em arquivo separado para que o dynamic import com ssr:false funcione com
// os subcomponentes de namespace (MainMenu.DefaultItems.*).
const CustomMainMenu = dynamic(() => import("./_main-menu"), { ssr: false });

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
// Cursor/laser muda a cada mousemove — throttle mais alto para não inundar.
const POINTER_THROTTLE_MS = 50;
// Após esse tempo sem updates de um peer, removemos o cursor dele.
const PEER_TTL_MS = 8000;

// Tipo mínimo do excalidrawAPI que usamos. Evita import direto do tipo (que
// só existe em runtime após o dynamic import).
type ExcalidrawAPI = {
	updateScene: (scene: {
		elements?: readonly unknown[];
		collaborators?: Map<string, unknown>;
	}) => void;
	getSceneElementsIncludingDeleted: () => readonly unknown[];
};

type PointerPayload = {
	from: { socketId: string; userId: string };
	pointer?: { x: number; y: number; tool?: "pointer" | "laser" };
	button?: "down" | "up";
	selectedElementIds?: Record<string, true>;
	username?: string;
	color?: { background: string; stroke: string };
};

// Paleta determinística por userId — mesmo usuário, mesma cor entre sessões.
const COLLAB_COLORS = [
	{ background: "#FFB1C1", stroke: "#C4395B" },
	{ background: "#A0E7E5", stroke: "#1E847F" },
	{ background: "#FBE7C6", stroke: "#B07D2A" },
	{ background: "#B4F8C8", stroke: "#1F7A3D" },
	{ background: "#C6B4F8", stroke: "#5238A3" },
	{ background: "#FFD6A5", stroke: "#B0501C" },
	{ background: "#9BF6FF", stroke: "#0E7C8A" },
	{ background: "#FDFFB6", stroke: "#7A6A12" },
];
function colorFor(userId: string): { background: string; stroke: string } {
	let h = 0;
	for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
	return COLLAB_COLORS[Math.abs(h) % COLLAB_COLORS.length];
}

const SITE_THEME_KEY = "site-theme";

/**
 * Aplica o tema (light/dark) ao site inteiro togglando a classe `dark` no
 * <html>. globals.css usa `@custom-variant dark (&:is(.dark *))`, então essa
 * classe propaga para todas as utilities `dark:*`.
 *
 * Mantém persistência em localStorage para outras páginas (dashboard, login)
 * carregarem com o mesmo tema.
 */
function applySiteTheme(theme: "light" | "dark"): void {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	if (theme === "dark") root.classList.add("dark");
	else root.classList.remove("dark");
	try {
		localStorage.setItem(SITE_THEME_KEY, theme);
	} catch {
		// localStorage indisponível (modo privado) — ignora.
	}
}

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
	// Estado dos colaboradores remotos (cursores/laser). Map mutável que é
	// reaplicado no Excalidraw via updateScene a cada update.
	const collaboratorsRef = useRef<Map<string, Record<string, unknown>>>(new Map());
	const peerLastSeenRef = useRef<Map<string, number>>(new Map());
	const lastPointerEmitAtRef = useRef(0);
	const pointerEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPointerPayloadRef = useRef<Record<string, unknown> | null>(null);

	const myDisplayName = user.name?.trim() || user.email.split("@")[0] || "Anônimo";
	const myColor = colorFor(user.id);

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

			// Sincroniza o tema do site com o tema do Excalidraw.
			if (appState && typeof appState === "object") {
				const theme = (appState as { theme?: string }).theme;
				if (theme === "dark" || theme === "light") {
					applySiteTheme(theme);
				}
			}

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

	// Reaplica o Map de colaboradores no Excalidraw. Excalidraw espera um
	// Map<socketId, {username, color, pointer, button, selectedElementIds}>.
	const flushCollaborators = useCallback(() => {
		const api = excalidrawAPIRef.current;
		if (!api) return;
		// Clona o Map para forçar comparação por referência interna do Excalidraw.
		const next = new Map(collaboratorsRef.current);
		api.updateScene({ collaborators: next });
	}, []);

	// Handler de pointer update local (movimento de mouse e laser do Excalidraw).
	const onPointerUpdate = useCallback(
		(payload: {
			pointer: { x: number; y: number; tool: "pointer" | "laser" };
			button: "down" | "up";
			pointersMap: Map<unknown, unknown>;
		}) => {
			const socket = socketRef.current;
			if (!socket || !socket.connected) return;
			// Evita inundar quando o Excalidraw dispara múltiplos pointers (touch).
			if (payload.pointersMap?.size && payload.pointersMap.size > 1) return;

			const data: Record<string, unknown> = {
				pointer: {
					x: payload.pointer.x,
					y: payload.pointer.y,
					tool: payload.pointer.tool,
				},
				button: payload.button,
				username: myDisplayName,
				color: myColor,
			};
			lastPointerPayloadRef.current = data;

			const now = Date.now();
			const since = now - lastPointerEmitAtRef.current;
			const flush = () => {
				lastPointerEmitAtRef.current = Date.now();
				if (lastPointerPayloadRef.current) {
					socket.emit("pointer-update", lastPointerPayloadRef.current);
				}
			};
			if (since >= POINTER_THROTTLE_MS) {
				if (pointerEmitTimerRef.current) {
					clearTimeout(pointerEmitTimerRef.current);
					pointerEmitTimerRef.current = null;
				}
				flush();
			} else if (!pointerEmitTimerRef.current) {
				pointerEmitTimerRef.current = setTimeout(() => {
					pointerEmitTimerRef.current = null;
					flush();
				}, POINTER_THROTTLE_MS - since);
			}
		},
		[myDisplayName, myColor],
	);

	// Conexão Socket.IO + listeners de scene-update / pointer-update.
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

		socket.on("pointer-update", (payload: PointerPayload) => {
			if (!payload?.from?.socketId) return;
			const id = payload.from.socketId;
			const fallbackColor = colorFor(payload.from.userId ?? id);
			collaboratorsRef.current.set(id, {
				id,
				username: payload.username ?? "Convidado",
				color: payload.color ?? fallbackColor,
				pointer: payload.pointer,
				button: payload.button,
				selectedElementIds: payload.selectedElementIds ?? {},
			});
			peerLastSeenRef.current.set(id, Date.now());
			flushCollaborators();
		});

		socket.on("peer-left", (payload: { socketId: string }) => {
			if (!payload?.socketId) return;
			collaboratorsRef.current.delete(payload.socketId);
			peerLastSeenRef.current.delete(payload.socketId);
			flushCollaborators();
		});

		// GC de peers inativos (caso o `peer-left` se perca).
		const gc = setInterval(() => {
			const now = Date.now();
			let changed = false;
			for (const [id, ts] of peerLastSeenRef.current) {
				if (now - ts > PEER_TTL_MS) {
					collaboratorsRef.current.delete(id);
					peerLastSeenRef.current.delete(id);
					changed = true;
				}
			}
			if (changed) flushCollaborators();
		}, 2000);

		return () => {
			clearInterval(gc);
			socket.removeAllListeners();
			socket.disconnect();
			socketRef.current = null;
			if (pendingBroadcastTimerRef.current) {
				clearTimeout(pendingBroadcastTimerRef.current);
				pendingBroadcastTimerRef.current = null;
			}
			if (pointerEmitTimerRef.current) {
				clearTimeout(pointerEmitTimerRef.current);
				pointerEmitTimerRef.current = null;
			}
			collaboratorsRef.current.clear();
			peerLastSeenRef.current.clear();
		};
	}, [drawing.id, flushCollaborators]);

	useEffect(() => {
		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
		};
	}, []);

	// Aplica o tema inicial (do desenho ou do localStorage) antes de renderizar.
	useEffect(() => {
		const fromDrawing = (() => {
			const a = (initialData as { appState?: { theme?: string } }).appState;
			return a?.theme === "dark" || a?.theme === "light" ? a.theme : null;
		})();
		const fromStorage = (() => {
			try {
				const v = localStorage.getItem(SITE_THEME_KEY);
				return v === "dark" || v === "light" ? v : null;
			} catch {
				return null;
			}
		})();
		const theme = fromDrawing ?? fromStorage;
		if (theme) applySiteTheme(theme);
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
					onPointerUpdate={onPointerUpdate as never}
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
