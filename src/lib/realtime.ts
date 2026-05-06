"use client";

import { io, type Socket } from "socket.io-client";

/**
 * URL do backend de realtime (Socket.IO).
 *
 * Em produção, o Socket.IO compartilha o mesmo host do backend HTTP, mas o
 * caminho `/socket.io` é independente do `/api/v2`. Por isso derivamos a base
 * removendo qualquer prefixo `/api*` do `NEXT_PUBLIC_BACKEND_URL`.
 */
function deriveSocketOrigin(): string {
	const raw = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080/api";
	try {
		const u = new URL(raw);
		return `${u.protocol}//${u.host}`;
	} catch {
		return raw.replace(/\/api.*$/, "");
	}
}

export type SceneUpdatePayload = {
	from: { socketId: string; userId: string };
	elements: readonly unknown[];
};

export type PointerUpdatePayload = {
	from: { socketId: string; userId: string };
	pointer?: { x: number; y: number; tool?: string };
	button?: "down" | "up";
	selectedElementIds?: Record<string, true>;
};

export type RealtimeSocket = Socket;

/**
 * Cria uma conexão Socket.IO autenticada via cookie (`withCredentials`).
 * O servidor lê o JWT do header `cookie` no handshake.
 */
export function createRealtimeSocket(): RealtimeSocket {
	const origin = deriveSocketOrigin();
	const socket = io(origin, {
		withCredentials: true,
		transports: ["websocket", "polling"],
		autoConnect: true,
	});
	return socket;
}
