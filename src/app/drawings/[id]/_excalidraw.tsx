"use client";

/**
 * Wrapper único que importa Excalidraw + MainMenu do mesmo módulo.
 *
 * Por que existe: `next/dynamic({ ssr: false })` em arquivos separados que
 * importam o mesmo pacote (`@excalidraw/excalidraw`) faz o bundler criar
 * chunks independentes. Cada chunk re-avalia o pacote, e o loader interno
 * de locale do Excalidraw usa estado de módulo — quando coexistem duas
 * instâncias do pacote, o spinner "Loading scene..." fica preso.
 *
 * Aqui Excalidraw e MainMenu são exportados a partir de um único módulo,
 * então um único `dynamic()` consumidor garante uma única instância.
 */
import { Excalidraw, MainMenu, reconcileElements } from "@excalidraw/excalidraw";

export { Excalidraw, MainMenu, reconcileElements };

/** Versão pronta do nosso MainMenu customizado. */
export function CustomMainMenu() {
	return (
		<MainMenu>
			<MainMenu.DefaultItems.LoadScene />
			<MainMenu.DefaultItems.SaveAsImage />
			<MainMenu.DefaultItems.Help />
			<MainMenu.DefaultItems.ClearCanvas />
			<MainMenu.Separator />
			<MainMenu.DefaultItems.ToggleTheme />
			<MainMenu.DefaultItems.ChangeCanvasBackground />
			<MainMenu.Separator />
			<MainMenu.ItemLink href="https://discord.gg/melhorzin" icon={<DiscordIcon />}>
				Discord
			</MainMenu.ItemLink>
		</MainMenu>
	);
}

function DiscordIcon() {
	return (
		<svg
			aria-hidden="true"
			focusable="false"
			role="img"
			viewBox="0 0 24 24"
			fill="currentColor"
			width="14"
			height="14"
		>
			<path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3a14.49 14.49 0 0 0-.69 1.405 18.27 18.27 0 0 0-5.736 0A14.39 14.39 0 0 0 9.443 3 19.74 19.74 0 0 0 5.683 4.37C2.46 9.077 1.66 13.66 2.06 18.176a19.93 19.93 0 0 0 6.022 3.04c.487-.66.918-1.36 1.288-2.094a12.83 12.83 0 0 1-2.027-.97c.17-.124.336-.252.497-.384 3.94 1.804 8.198 1.804 12.094 0 .163.132.329.26.499.384a12.86 12.86 0 0 1-2.03.971c.37.733.8 1.434 1.287 2.093a19.93 19.93 0 0 0 6.025-3.04c.473-5.34-.81-9.881-3.398-13.806ZM9.34 15.658c-1.183 0-2.158-1.085-2.158-2.42 0-1.336.951-2.42 2.158-2.42 1.207 0 2.181 1.084 2.158 2.42 0 1.335-.951 2.42-2.158 2.42Zm5.32 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.336.95-2.42 2.157-2.42 1.207 0 2.181 1.084 2.158 2.42 0 1.335-.951 2.42-2.158 2.42Z" />
		</svg>
	);
}
