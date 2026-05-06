# Excalidraw SaaS — Frontend (Next.js)

Aplicação **somente frontend** em **Next.js 16** + **shadcn/ui**. Toda a
lógica de autenticação, banco de dados e domínio fica no backend NestJS
em `../excalidraw-storage-backend`.

## Arquitetura

```
Browser ──► Next.js (3000)        ──► (apenas SSR/UI)
Browser ──► NestJS  (8080) /api   ──► Postgres (via Prisma)
```

- O Next.js **não tem rotas de API próprias**, **não fala com Postgres** e
  **não importa Prisma**. Ele apenas renderiza páginas.
- Toda chamada autenticada usa o helper `apiFetch` (browser) ou `serverApi`
  (Server Components) em `src/lib/api-client.ts`. Cookies httpOnly são
  enviados automaticamente com `credentials: include`.
- O middleware (`src/middleware.ts`) faz apenas o gate de autenticação
  baseado na **presença** do cookie `token`. A validação real do JWT é
  responsabilidade do backend.

## Setup

1. Suba o backend primeiro (vide `../excalidraw-storage-backend/README.md`).
2. No frontend:

   ```bash
   cp .env.example .env   # ajuste NEXT_PUBLIC_BACKEND_URL se necessário
   npm install
   npm run dev            # http://localhost:3000
   ```

## Variáveis de ambiente

| Variável                  | Descrição                                                          |
| ------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_BACKEND_URL` | URL pública do backend, com sufixo `/api`. Usada no browser.       |
| `BACKEND_URL_INTERNAL`    | (Opcional) URL interna usada por RSC. Cai em `NEXT_PUBLIC_BACKEND_URL`. |

> Como o backend usa cookie httpOnly com `SameSite=Lax`, em desenvolvimento
> o frontend (`localhost:3000`) e o backend (`localhost:8080`) compartilham
> o mesmo registrable domain (`localhost`) e os cookies funcionam sem
> nenhuma configuração extra. Em produção, hospede ambos sob o mesmo
> domínio principal (ex.: `app.exemplo.com` + `api.exemplo.com`).

## Deploy (Dokploy / Docker puro)

```bash
docker build \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.exemplo.com/api \
  -t excalidraw-frontend .

docker run --rm -p 3000:3000 excalidraw-frontend
```

> `NEXT_PUBLIC_BACKEND_URL` precisa ser passado em **build time**: o Next
> embute esse valor diretamente no bundle do browser. No Dokploy, defina
> isso como build arg do Dockerfile e exponha a porta `3000`.

## Pastas/arquivos legados (esvaziados)

`src/app/api/**/route.ts`, `src/lib/{prisma,auth,permissions,api,tokens,db}.ts`,
`prisma/`, `prisma.config.ts`. Ficaram presentes mas vazios pois a
ferramentaria do workspace não permite remoção.


