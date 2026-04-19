# Review Comment Renderer

A VS Code extension that lets you leave GitHub-style inline review comments on your own local codebase and export them as Markdown — the intended workflow is to paste the output into a coding agent (Claude Code, etc.) as a review-style change request.

## Features

- **Inline comments** — click the `+` on the line number gutter to add a comment on a single line or a selected range, using VS Code's native Comments API.
- **Sidebar tree** — a dedicated activity bar view lists every thread grouped by file; clicking a thread reveals it in the editor.
- **Overall comment** — a WebviewView under the same activity bar for review-wide guidance (summary, constraints, context for the agent).
- **Markdown export** — a `Copy as Markdown` button (and a `Preview` command) renders:
    ```
    <overall comment>

    ## path/to/file.ts:123

    ```ts
    <the source lines you commented on>
    ```

    <your comment body>
    ```
- **Persistence** — all threads and the overall comment are stored in `.vscode/review-comments.json` at the workspace root, so they survive reload.
- **Clear all** — one button (with confirm) wipes every thread plus the overall comment.

## Requirements

- VS Code `^1.100.0`.
- A workspace folder is required for persistence; without one, comments are in-memory only.

## Usage

1. Open the `Review Comments` view from the activity bar (the comment bubble icon).
2. In any editor, hover a line number and click the `+` to attach a comment to that line or the current selection.
3. Write your review across files as you read.
4. Fill in overall guidance in the `Overall & Export` webview.
5. Click `Copy as Markdown` and paste into your coding agent.

## Commands

- `Copy Review as Markdown` — copy the rendered Markdown to the clipboard.
- `Preview Review as Markdown` — open the rendered Markdown in a new editor.
- `Clear All Review Comments` — delete every stored thread + overall comment.

## Known limitations

- Thread ranges are fixed to the line numbers at the time of creation; edits to the file do not shift them automatically across sessions.
- Comments always appear in VS Code's built-in Comments panel alongside comments from other providers (GitHub PRs, etc.); this is intrinsic to the Comments API and cannot be hidden.

## License

[MIT](./LICENSE)
