import * as vscode from 'vscode';
import { CommentStore, StoredComment, StoredThread } from './store';

class ReviewComment implements vscode.Comment {
	body: string | vscode.MarkdownString;
	mode: vscode.CommentMode = vscode.CommentMode.Preview;
	author: vscode.CommentAuthorInformation = { name: 'You' };
	contextValue: string = 'preview';
	savedBody: string;

	constructor(
		public readonly id: string,
		public readonly threadId: string,
		body: string,
	) {
		this.body = new vscode.MarkdownString(body);
		this.savedBody = body;
	}
}

export class ReviewController {
	private readonly controller: vscode.CommentController;
	private readonly threadsById = new Map<string, vscode.CommentThread>();
	private readonly decoration: vscode.TextEditorDecorationType;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly store: CommentStore) {
		this.controller = vscode.comments.createCommentController(
			'vscode-comment-renderer',
			'Review Comments',
		);
		this.controller.commentingRangeProvider = {
			provideCommentingRanges: (document) => {
				if (document.lineCount === 0) {
					return [];
				}
				return [new vscode.Range(0, 0, document.lineCount - 1, 0)];
			},
		};

		this.decoration = vscode.window.createTextEditorDecorationType({
			overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
			overviewRulerLane: vscode.OverviewRulerLane.Left,
			isWholeLine: true,
			backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
		});

		this.rebuildAll();

		this.disposables.push(
			vscode.window.onDidChangeVisibleTextEditors(() => this.updateDecorations()),
			this.store.onDidChange(() => this.updateDecorations()),
		);
		this.updateDecorations();
	}

	private rebuildAll(): void {
		for (const t of this.threadsById.values()) {
			t.dispose();
		}
		this.threadsById.clear();
		for (const stored of this.store.getThreads()) {
			this.attachThread(stored);
		}
	}

	private attachThread(stored: StoredThread): vscode.CommentThread {
		const uri = vscode.Uri.parse(stored.fileUri);
		const range = new vscode.Range(
			stored.startLine, stored.startCharacter,
			stored.endLine, stored.endCharacter,
		);
		const comments = stored.comments.map(c => this.toVsComment(stored.id, c));
		const thread = this.controller.createCommentThread(uri, range, comments);
		thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
		thread.contextValue = 'review';
		thread.canReply = true;
		thread.label = `L${stored.startLine + 1}${stored.endLine !== stored.startLine ? `-${stored.endLine + 1}` : ''}`;
		this.threadsById.set(stored.id, thread);
		return thread;
	}

	private toVsComment(storedThreadId: string, c: StoredComment): ReviewComment {
		return new ReviewComment(c.id, storedThreadId, c.body);
	}

	async createThreadFromReply(reply: vscode.CommentReply): Promise<void> {
		const text = reply.text.trim();
		if (!text) {
			return;
		}
		const range = reply.thread.range ?? new vscode.Range(0, 0, 0, 0);
		const stored = await this.store.createThread(reply.thread.uri, range, text);
		reply.thread.comments = stored.comments.map(c => this.toVsComment(stored.id, c));
		reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
		reply.thread.contextValue = 'review';
		reply.thread.canReply = true;
		reply.thread.label = `L${stored.startLine + 1}${stored.endLine !== stored.startLine ? `-${stored.endLine + 1}` : ''}`;
		this.threadsById.set(stored.id, reply.thread);
	}

	async replyToThread(reply: vscode.CommentReply): Promise<void> {
		const text = reply.text.trim();
		if (!text) {
			return;
		}
		const storedId = this.findStoredIdForVsThread(reply.thread);
		if (!storedId) {
			return;
		}
		const added = await this.store.addComment(storedId, text);
		if (!added) {
			return;
		}
		reply.thread.comments = [...reply.thread.comments, this.toVsComment(storedId, added)];
	}

	editComment(comment: ReviewComment): void {
		const vsThread = this.threadsById.get(comment.threadId);
		if (!vsThread) {
			return;
		}
		vsThread.comments = vsThread.comments.map(c => {
			if (c instanceof ReviewComment && c.id === comment.id) {
				c.savedBody = typeof c.body === 'string' ? c.body : c.body.value;
				c.mode = vscode.CommentMode.Editing;
				c.contextValue = 'editing';
			}
			return c;
		});
	}

	async saveEditComment(comment: ReviewComment): Promise<void> {
		const vsThread = this.threadsById.get(comment.threadId);
		if (!vsThread) {
			return;
		}
		const newBody = typeof comment.body === 'string' ? comment.body : comment.body.value;
		await this.store.updateComment(comment.threadId, comment.id, newBody);
		vsThread.comments = vsThread.comments.map(c => {
			if (c instanceof ReviewComment && c.id === comment.id) {
				c.body = new vscode.MarkdownString(newBody);
				c.savedBody = newBody;
				c.mode = vscode.CommentMode.Preview;
				c.contextValue = 'preview';
			}
			return c;
		});
	}

	cancelEditComment(comment: ReviewComment): void {
		const vsThread = this.threadsById.get(comment.threadId);
		if (!vsThread) {
			return;
		}
		vsThread.comments = vsThread.comments.map(c => {
			if (c instanceof ReviewComment && c.id === comment.id) {
				c.body = new vscode.MarkdownString(c.savedBody);
				c.mode = vscode.CommentMode.Preview;
				c.contextValue = 'preview';
			}
			return c;
		});
	}

	async deleteComment(comment: ReviewComment): Promise<void> {
		await this.deleteCommentById(comment.threadId, comment.id);
	}

	async deleteCommentById(threadId: string, commentId: string): Promise<void> {
		const vsThread = this.threadsById.get(threadId);
		const result = await this.store.deleteComment(threadId, commentId);
		if (!result) {
			return;
		}
		if (!vsThread) {
			return;
		}
		if (result.threadRemoved) {
			vsThread.dispose();
			this.threadsById.delete(threadId);
		} else {
			vsThread.comments = vsThread.comments.filter(
				c => !(c instanceof ReviewComment && c.id === commentId),
			);
		}
	}

	async deleteThreadByStoredId(storedId: string): Promise<void> {
		const vsThread = this.threadsById.get(storedId);
		await this.store.deleteThread(storedId);
		if (vsThread) {
			vsThread.dispose();
			this.threadsById.delete(storedId);
		}
	}

	async deleteThreadByVs(vsThread: vscode.CommentThread): Promise<void> {
		const storedId = this.findStoredIdForVsThread(vsThread);
		if (storedId) {
			await this.deleteThreadByStoredId(storedId);
		} else {
			vsThread.dispose();
		}
	}

	async clearAll(): Promise<void> {
		for (const t of this.threadsById.values()) {
			t.dispose();
		}
		this.threadsById.clear();
		await this.store.clearAll();
	}

	async revealThread(storedId: string): Promise<void> {
		const stored = this.store.findThread(storedId);
		if (!stored) {
			return;
		}
		const uri = vscode.Uri.parse(stored.fileUri);
		const range = new vscode.Range(
			stored.startLine, stored.startCharacter,
			stored.endLine, stored.endCharacter,
		);
		await vscode.window.showTextDocument(uri, { selection: range });
		const vsThread = this.threadsById.get(storedId);
		if (vsThread) {
			vsThread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
		}
	}

	private findStoredIdForVsThread(vsThread: vscode.CommentThread): string | undefined {
		for (const [id, t] of this.threadsById) {
			if (t === vsThread) {
				return id;
			}
		}
		return undefined;
	}

	private updateDecorations(): void {
		const byFile = this.store.groupByFile();
		for (const editor of vscode.window.visibleTextEditors) {
			const key = editor.document.uri.toString();
			const threads = byFile.get(key) ?? [];
			const ranges: vscode.Range[] = threads.map(t => new vscode.Range(
				Math.min(t.startLine, editor.document.lineCount - 1), 0,
				Math.min(t.endLine, editor.document.lineCount - 1), 0,
			));
			editor.setDecorations(this.decoration, ranges);
		}
	}

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		for (const t of this.threadsById.values()) {
			t.dispose();
		}
		this.threadsById.clear();
		this.decoration.dispose();
		this.controller.dispose();
	}
}

export { ReviewComment };
