import * as vscode from 'vscode';
import * as path from 'path';

export interface StoredComment {
	id: string;
	body: string;
	createdAt: number;
}

export interface StoredThread {
	id: string;
	fileUri: string;
	startLine: number;
	startCharacter: number;
	endLine: number;
	endCharacter: number;
	comments: StoredComment[];
}

export interface StoreData {
	threads: StoredThread[];
	overall: string;
}

const EMPTY: StoreData = { threads: [], overall: '' };
const STORE_KEY = 'commentRenderer.data';

export class CommentStore {
	private data: StoreData = structuredClone(EMPTY);
	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChange = this._onDidChange.event;

	constructor(
		private readonly memento: vscode.Memento,
		private readonly workspaceRoot: vscode.Uri | undefined,
	) {}

	async load(): Promise<void> {
		const stored = this.memento.get<Partial<StoreData>>(STORE_KEY);
		if (!stored) {
			this.data = structuredClone(EMPTY);
			return;
		}
		this.data = {
			threads: Array.isArray(stored.threads) ? stored.threads : [],
			overall: typeof stored.overall === 'string' ? stored.overall : '',
		};
	}

	private async save(): Promise<void> {
		await this.memento.update(STORE_KEY, this.data);
	}

	getData(): Readonly<StoreData> {
		return this.data;
	}

	getThreads(): readonly StoredThread[] {
		return this.data.threads;
	}

	getOverall(): string {
		return this.data.overall;
	}

	findThread(id: string): StoredThread | undefined {
		return this.data.threads.find(t => t.id === id);
	}

	groupByFile(): Map<string, StoredThread[]> {
		const map = new Map<string, StoredThread[]>();
		for (const t of this.data.threads) {
			const list = map.get(t.fileUri) ?? [];
			list.push(t);
			map.set(t.fileUri, list);
		}
		for (const list of map.values()) {
			list.sort((a, b) => a.startLine - b.startLine);
		}
		return map;
	}

	async createThread(fileUri: vscode.Uri, range: vscode.Range, firstComment: string): Promise<StoredThread> {
		const thread: StoredThread = {
			id: generateId(),
			fileUri: fileUri.toString(),
			startLine: range.start.line,
			startCharacter: range.start.character,
			endLine: range.end.line,
			endCharacter: range.end.character,
			comments: [
				{ id: generateId(), body: firstComment, createdAt: Date.now() },
			],
		};
		this.data.threads.push(thread);
		await this.save();
		this._onDidChange.fire();
		return thread;
	}

	async addComment(threadId: string, body: string): Promise<StoredComment | undefined> {
		const thread = this.findThread(threadId);
		if (!thread) {
			return undefined;
		}
		const comment: StoredComment = { id: generateId(), body, createdAt: Date.now() };
		thread.comments.push(comment);
		await this.save();
		this._onDidChange.fire();
		return comment;
	}

	async updateComment(threadId: string, commentId: string, body: string): Promise<void> {
		const thread = this.findThread(threadId);
		if (!thread) {
			return;
		}
		const c = thread.comments.find(x => x.id === commentId);
		if (!c) {
			return;
		}
		c.body = body;
		await this.save();
		this._onDidChange.fire();
	}

	async deleteComment(threadId: string, commentId: string): Promise<{ threadRemoved: boolean } | undefined> {
		const thread = this.findThread(threadId);
		if (!thread) {
			return undefined;
		}
		thread.comments = thread.comments.filter(c => c.id !== commentId);
		if (thread.comments.length === 0) {
			this.data.threads = this.data.threads.filter(t => t.id !== threadId);
			await this.save();
			this._onDidChange.fire();
			return { threadRemoved: true };
		}
		await this.save();
		this._onDidChange.fire();
		return { threadRemoved: false };
	}

	async deleteThread(threadId: string): Promise<void> {
		const before = this.data.threads.length;
		this.data.threads = this.data.threads.filter(t => t.id !== threadId);
		if (this.data.threads.length !== before) {
			await this.save();
			this._onDidChange.fire();
		}
	}

	async clearAll(): Promise<void> {
		this.data = structuredClone(EMPTY);
		await this.save();
		this._onDidChange.fire();
	}

	async setOverall(text: string): Promise<void> {
		if (this.data.overall === text) {
			return;
		}
		this.data.overall = text;
		await this.save();
		this._onDidChange.fire();
	}

	fileUriToLabel(fileUri: string): string {
		try {
			const uri = vscode.Uri.parse(fileUri);
			if (this.workspaceRoot && uri.scheme === 'file') {
				const rel = path.relative(this.workspaceRoot.fsPath, uri.fsPath);
				if (rel && !rel.startsWith('..')) {
					return rel.split(path.sep).join('/');
				}
			}
			return uri.fsPath;
		} catch {
			return fileUri;
		}
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

function generateId(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
