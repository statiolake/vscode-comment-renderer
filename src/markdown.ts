import * as vscode from 'vscode';
import { CommentStore, StoredThread } from './store';

export async function renderMarkdown(store: CommentStore): Promise<string> {
	const data = store.getData();
	const parts: string[] = [];

	const overall = data.overall.trim();
	if (overall.length > 0) {
		parts.push(overall);
		parts.push('');
	}

	const byFile = store.groupByFile();
	const sortedFiles = [...byFile.keys()].sort((a, b) =>
		store.fileUriToLabel(a).localeCompare(store.fileUriToLabel(b)),
	);
	for (const fileUri of sortedFiles) {
		const label = store.fileUriToLabel(fileUri);
		const threads = byFile.get(fileUri)!;
		for (const thread of threads) {
			const loc = thread.startLine === thread.endLine
				? `${thread.startLine + 1}`
				: `${thread.startLine + 1}-${thread.endLine + 1}`;
			parts.push(`## ${label}:${loc}`);
			parts.push('');

			const snippet = await tryReadSnippet(fileUri, thread);
			if (snippet !== undefined) {
				parts.push('```' + languageHint(fileUri));
				parts.push(snippet);
				parts.push('```');
				parts.push('');
			}

			for (const c of thread.comments) {
				const body = c.body.trim();
				if (body.length === 0) {
					continue;
				}
				parts.push(body);
				parts.push('');
			}
		}
	}

	const out = parts.join('\n').replace(/\n+$/, '');
	return out.length > 0 ? out + '\n' : '';
}

async function tryReadSnippet(fileUri: string, thread: StoredThread): Promise<string | undefined> {
	try {
		const uri = vscode.Uri.parse(fileUri);
		const doc = await vscode.workspace.openTextDocument(uri);
		if (doc.lineCount === 0) {
			return undefined;
		}
		const startLine = Math.max(0, Math.min(thread.startLine, doc.lineCount - 1));
		const endLine = Math.max(startLine, Math.min(thread.endLine, doc.lineCount - 1));
		const lines: string[] = [];
		for (let i = startLine; i <= endLine; i++) {
			lines.push(doc.lineAt(i).text);
		}
		return lines.join('\n');
	} catch {
		return undefined;
	}
}

function languageHint(fileUri: string): string {
	const m = /\.([a-zA-Z0-9]+)(?:$|\?|#)/.exec(fileUri);
	if (!m) {
		return '';
	}
	const ext = m[1].toLowerCase();
	const map: Record<string, string> = {
		ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
		py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
		java: 'java', kt: 'kotlin', swift: 'swift',
		c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp',
		cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash',
		json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
		md: 'markdown', html: 'html', css: 'css', scss: 'scss',
		sql: 'sql', xml: 'xml',
	};
	return map[ext] ?? ext;
}
