import { PUBLIC_BACKEND_URL } from "@/lib/api-client";
import { cookies } from "next/headers";
import "server-only";

/**
 * Helpers de API para uso em React Server Components.
 * - Usa BACKEND_URL_INTERNAL (rede privada do compose/Dokploy) quando disponível.
 * - Encaminha o cookie `token` automaticamente.
 */

const SESSION_COOKIE = "token";

export const SERVER_BACKEND_URL = process.env.BACKEND_URL_INTERNAL ?? PUBLIC_BACKEND_URL;

export class ServerApiError extends Error {
	status: number;
	body: unknown;
	constructor(message: string, status: number, body: unknown) {
		super(message);
		this.name = "ServerApiError";
		this.status = status;
		this.body = body;
	}
}

async function buildCookieHeader(): Promise<string> {
	const jar = await cookies();
	const token = jar.get(SESSION_COOKIE)?.value;
	return token ? `${SESSION_COOKIE}=${token}` : "";
}

async function serverFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const url = path.startsWith("http") ? path : `${SERVER_BACKEND_URL}${path}`;
	const cookieHeader = await buildCookieHeader();
	const headers = new Headers(init.headers);
	if (cookieHeader) headers.set("cookie", cookieHeader);
	if (init.body && !headers.has("content-type") && typeof init.body === "string") {
		headers.set("content-type", "application/json");
	}
	// Timeout defensivo: em produção o RSC pode pendurar se o backend estiver
	// inacessível (ex.: BACKEND_URL_INTERNAL ausente e Cloudflare bloqueando
	// requisições server-to-server). Sem isso, a página fica em "loading infinito".
	const timeoutMs = Number(process.env.SERVER_FETCH_TIMEOUT_MS ?? 8000);
	const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
	return fetch(url, { ...init, headers, cache: init.cache ?? "no-store", signal });
}

export const serverApi = {
	/** GET parseado. Lança ServerApiError em status >= 400. */
	async get<T>(path: string): Promise<T> {
		const res = await serverFetch(path);
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			throw new ServerApiError(
				(body as { message?: string } | null)?.message ?? `HTTP ${res.status}`,
				res.status,
				body,
			);
		}
		return res.json() as Promise<T>;
	},
	/** GET que devolve `null` em 401/404 ou em falha de rede/timeout. */
	async tryGet<T>(path: string): Promise<T | null> {
		let res: Response;
		try {
			res = await serverFetch(path);
		} catch (err) {
			// Timeout/falha de rede no SSR não deve pendurar a página — devolvemos null
			// e a rota chama notFound()/redirect conforme a regra de cada page.
			console.error(`[server-api] ${path} falhou:`, err);
			return null;
		}
		if (res.status === 401 || res.status === 404) return null;
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			throw new ServerApiError(`HTTP ${res.status}`, res.status, body);
		}
		return res.json() as Promise<T>;
	},
};
