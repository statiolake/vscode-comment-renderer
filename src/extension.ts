import * as vscode from 'vscode';
import { CommentStore } from './store';
import { ReviewComment, ReviewController } from './controller';
import { ReviewTreeProvider, TreeElement } from './treeView';
import { OverallWebviewProvider } from './webview';
import { renderMarkdown } from './markdown';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
	const store = new CommentStore(workspaceRoot);
	await store.load();

	const controller = new ReviewController(store);
	const treeProvider = new ReviewTreeProvider(store);
	const webviewProvider = new OverallWebviewProvider(
		store,
		'vscode-comment-renderer.copyMarkdown',
		'vscode-comment-renderer.clearAll',
	);

	context.subscriptions.push(
		{ dispose: () => store.dispose() },
		{ dispose: () => controller.dispose() },
		{ dispose: () => treeProvider.dispose() },
		{ dispose: () => webviewProvider.dispose() },
	);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('commentRenderer.tree', treeProvider),
		vscode.window.registerWebviewViewProvider(OverallWebviewProvider.viewType, webviewProvider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'vscode-comment-renderer.createThread',
			(reply: vscode.CommentReply) => controller.createThreadFromReply(reply),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.replyThread',
			(reply: vscode.CommentReply) => controller.replyToThread(reply),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.editComment',
			(comment: ReviewComment) => controller.editComment(comment),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.saveEditComment',
			(comment: ReviewComment) => controller.saveEditComment(comment),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.cancelEditComment',
			(comment: ReviewComment) => controller.cancelEditComment(comment),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.deleteComment',
			(comment: ReviewComment) => controller.deleteComment(comment),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.deleteThread',
			(thread: vscode.CommentThread) => controller.deleteThreadByVs(thread),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.deleteThreadFromTree',
			(element: TreeElement) => {
				if (element?.kind === 'thread') {
					return controller.deleteThreadByStoredId(element.storedThreadId);
				}
				return undefined;
			},
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.deleteCommentFromTree',
			(element: TreeElement) => {
				if (element?.kind === 'comment') {
					return controller.deleteCommentById(element.storedThreadId, element.commentId);
				}
				return undefined;
			},
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.revealThread',
			(storedId: string) => controller.revealThread(storedId),
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.copyMarkdown',
			async () => {
				const md = await renderMarkdown(store);
				await vscode.env.clipboard.writeText(md);
				vscode.window.showInformationMessage('Review comments copied as Markdown.');
			},
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.previewMarkdown',
			async () => {
				const md = await renderMarkdown(store);
				const doc = await vscode.workspace.openTextDocument({ content: md, language: 'markdown' });
				await vscode.window.showTextDocument(doc, { preview: true });
			},
		),
		vscode.commands.registerCommand(
			'vscode-comment-renderer.clearAll',
			async () => {
				const threadCount = store.getThreads().length;
				const hasOverall = store.getOverall().trim().length > 0;
				if (threadCount === 0 && !hasOverall) {
					vscode.window.showInformationMessage('No review comments to clear.');
					return;
				}
				const choice = await vscode.window.showWarningMessage(
					`Delete all review comments (${threadCount} thread${threadCount === 1 ? '' : 's'}${hasOverall ? ' + overall' : ''})?`,
					{ modal: true, detail: 'This cannot be undone.' },
					'Delete',
				);
				if (choice === 'Delete') {
					await controller.clearAll();
				}
			},
		),
	);
}

export function deactivate(): void {
	// no-op — disposables handled via context.subscriptions
}
