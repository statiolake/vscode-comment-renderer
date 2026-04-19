import * as vscode from 'vscode';
import { CommentStore } from './store';

export class OverallWebviewProvider implements vscode.WebviewViewProvider {
	static readonly viewType = 'commentRenderer.overall';

	private view: vscode.WebviewView | undefined;
	private readonly subscription: vscode.Disposable;

	constructor(
		private readonly store: CommentStore,
		private readonly copyCommand: string,
		private readonly clearCommand: string,
	) {
		this.subscription = this.store.onDidChange(() => this.postState());
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.html = this.renderHtml(webviewView.webview);
		webviewView.webview.onDidReceiveMessage(async (msg: IncomingMessage) => {
			if (msg.type === 'ready') {
				this.postState();
				return;
			}
			if (msg.type === 'overall-changed') {
				await this.store.setOverall(msg.value);
				return;
			}
			if (msg.type === 'copy') {
				await vscode.commands.executeCommand(this.copyCommand);
				return;
			}
			if (msg.type === 'clear') {
				await vscode.commands.executeCommand(this.clearCommand);
				return;
			}
		});
	}

	private postState(): void {
		this.view?.webview.postMessage({
			type: 'state',
			overall: this.store.getOverall(),
			threadCount: this.store.getThreads().length,
		} satisfies OutgoingMessage);
	}

	private renderHtml(webview: vscode.Webview): string {
		const nonce = makeNonce();
		const csp = [
			"default-src 'none'",
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ');

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
	body {
		margin: 0;
		padding: 8px;
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		color: var(--vscode-foreground);
		display: flex;
		flex-direction: column;
		gap: 8px;
		height: 100vh;
		box-sizing: border-box;
	}
	label {
		font-weight: 600;
		font-size: 0.9em;
		opacity: 0.9;
	}
	textarea {
		flex: 1;
		min-height: 80px;
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
		padding: 6px 8px;
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		border: 1px solid var(--vscode-input-border, transparent);
		border-radius: 2px;
		font-family: var(--vscode-editor-font-family);
		font-size: var(--vscode-editor-font-size);
	}
	textarea:focus {
		outline: 1px solid var(--vscode-focusBorder);
		outline-offset: -1px;
	}
	.actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 6px;
	}
	.actions .right {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	button {
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
		border: none;
		padding: 6px 12px;
		border-radius: 2px;
		cursor: pointer;
		font-size: inherit;
	}
	button:hover {
		background: var(--vscode-button-hoverBackground);
	}
	button.secondary {
		background: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
	}
	button.secondary:hover {
		background: var(--vscode-button-secondaryHoverBackground);
	}
	.hint {
		font-size: 0.85em;
		opacity: 0.7;
	}
</style>
</head>
<body>
	<label for="overall">Overall comment</label>
	<textarea id="overall" placeholder="Summary, overall guidance, or context for the coding agent…"></textarea>
	<div class="actions">
		<button id="clear" class="secondary">Clear</button>
		<div class="right">
			<span class="hint" id="hint"></span>
			<button id="copy">Copy as Markdown</button>
		</div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const textarea = document.getElementById('overall');
		const copyBtn = document.getElementById('copy');
		const clearBtn = document.getElementById('clear');
		const hint = document.getElementById('hint');

		let debounceTimer = null;
		let lastSent = '';

		textarea.addEventListener('input', () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				const value = textarea.value;
				if (value !== lastSent) {
					lastSent = value;
					vscode.postMessage({ type: 'overall-changed', value });
				}
			}, 250);
		});

		copyBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'copy' });
			hint.textContent = 'Copied';
			setTimeout(() => { hint.textContent = ''; }, 1500);
		});

		clearBtn.addEventListener('click', () => {
			vscode.postMessage({ type: 'clear' });
		});

		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg.type === 'state') {
				if (document.activeElement !== textarea && textarea.value !== msg.overall) {
					textarea.value = msg.overall;
					lastSent = msg.overall;
				} else if (document.activeElement !== textarea) {
					lastSent = msg.overall;
				}
			}
		});

		vscode.postMessage({ type: 'ready' });
	</script>
</body>
</html>`;
	}

	dispose(): void {
		this.subscription.dispose();
	}
}

type IncomingMessage =
	| { type: 'ready' }
	| { type: 'overall-changed'; value: string }
	| { type: 'copy' }
	| { type: 'clear' };

type OutgoingMessage =
	| { type: 'state'; overall: string; threadCount: number };

function makeNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let out = '';
	for (let i = 0; i < 32; i++) {
		out += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return out;
}
