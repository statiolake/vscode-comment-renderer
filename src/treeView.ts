import * as vscode from 'vscode';
import { CommentStore } from './store';

export type TreeElement =
	| { kind: 'file'; fileUri: string }
	| { kind: 'thread'; storedThreadId: string }
	| { kind: 'comment'; storedThreadId: string; commentId: string };

export class ReviewTreeProvider implements vscode.TreeDataProvider<TreeElement> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private readonly subscription: vscode.Disposable;

	constructor(private readonly store: CommentStore) {
		this.subscription = this.store.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
	}

	getTreeItem(element: TreeElement): vscode.TreeItem {
		if (element.kind === 'file') {
			const label = this.store.fileUriToLabel(element.fileUri);
			const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
			item.iconPath = new vscode.ThemeIcon('file');
			item.resourceUri = safeParseUri(element.fileUri);
			item.contextValue = 'reviewFile';
			const threadCount = this.store.groupByFile().get(element.fileUri)?.length ?? 0;
			item.description = `${threadCount} thread${threadCount === 1 ? '' : 's'}`;
			return item;
		}
		if (element.kind === 'thread') {
			const thread = this.store.findThread(element.storedThreadId);
			if (!thread) {
				return new vscode.TreeItem('(missing thread)');
			}
			const loc = thread.startLine === thread.endLine
				? `L${thread.startLine + 1}`
				: `L${thread.startLine + 1}–${thread.endLine + 1}`;
			const preview = thread.comments[0]?.body.split('\n')[0]?.slice(0, 60) ?? '';
			const item = new vscode.TreeItem(
				`${loc}${preview ? ` — ${preview}` : ''}`,
				vscode.TreeItemCollapsibleState.Collapsed,
			);
			item.iconPath = new vscode.ThemeIcon('comment');
			item.contextValue = 'reviewThread';
			item.description = `${thread.comments.length}`;
			item.command = {
				command: 'vscode-comment-renderer.revealThread',
				title: 'Reveal',
				arguments: [element.storedThreadId],
			};
			return item;
		}
		const thread = this.store.findThread(element.storedThreadId);
		const comment = thread?.comments.find(c => c.id === element.commentId);
		const item = new vscode.TreeItem(
			comment ? firstLine(comment.body) : '(missing)',
			vscode.TreeItemCollapsibleState.None,
		);
		item.tooltip = comment ? new vscode.MarkdownString(comment.body) : undefined;
		item.iconPath = new vscode.ThemeIcon('comment-discussion');
		item.contextValue = 'reviewComment';
		item.command = {
			command: 'vscode-comment-renderer.revealThread',
			title: 'Reveal',
			arguments: [element.storedThreadId],
		};
		return item;
	}

	getChildren(element?: TreeElement): TreeElement[] {
		if (!element) {
			const files = [...this.store.groupByFile().keys()];
			files.sort((a, b) => this.store.fileUriToLabel(a).localeCompare(this.store.fileUriToLabel(b)));
			return files.map<TreeElement>(fileUri => ({ kind: 'file', fileUri }));
		}
		if (element.kind === 'file') {
			const threads = this.store.groupByFile().get(element.fileUri) ?? [];
			return threads.map<TreeElement>(t => ({ kind: 'thread', storedThreadId: t.id }));
		}
		if (element.kind === 'thread') {
			const thread = this.store.findThread(element.storedThreadId);
			if (!thread) {
				return [];
			}
			return thread.comments.map<TreeElement>(c => ({
				kind: 'comment',
				storedThreadId: thread.id,
				commentId: c.id,
			}));
		}
		return [];
	}

	dispose(): void {
		this.subscription.dispose();
		this._onDidChangeTreeData.dispose();
	}
}

function firstLine(s: string): string {
	const line = s.split('\n')[0] ?? '';
	return line.length > 80 ? line.slice(0, 80) + '…' : line;
}

function safeParseUri(s: string): vscode.Uri | undefined {
	try {
		return vscode.Uri.parse(s);
	} catch {
		return undefined;
	}
}
