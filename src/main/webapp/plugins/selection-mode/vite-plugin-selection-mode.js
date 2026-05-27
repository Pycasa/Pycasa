import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default function selectionModePlugin() {
	return {
		name: 'vite:selection-mode',
		apply: 'serve',

		transformIndexHtml() {
			const scriptPath = resolve(__dirname, 'selection-mode-script.js');
			const scriptContent = readFileSync(scriptPath, 'utf-8');

			return [
				{
					tag: 'script',
					attrs: { type: 'module' },
					children: scriptContent,
					injectTo: 'body',
				},
			];
		},
	};
}
