import * as vscode from 'vscode';

const STORAGE_KEY = 'auditProgressCache';

export function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel('Audit Tracker');
    context.subscriptions.push(output);
    output.appendLine('[audit-tracker] activate() running');

    // Loaded once at startup. Mutated in place, then written back to globalState
    // on every toggle AND on a few extra "flush points" below, since VS Code
    // debounces globalState writes internally and can lose very recent writes
    // if the process exits before that debounce fires.
    const storage: { [uri: string]: number[] } = context.globalState.get(STORAGE_KEY) || {};

    const readDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        isWholeLine: true,
        overviewRulerColor: 'rgba(16, 185, 129, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
        gutterIconSize: 'contain',
        dark: {
            gutterIconPath: vscode.Uri.parse(`data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="4" height="16" fill="%2310b981"/></svg>`)
        },
        light: {
            gutterIconPath: vscode.Uri.parse(`data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="4" height="16" fill="%23059669"/></svg>`)
        }
    });

    const statusBarTally = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10000);
    context.subscriptions.push(statusBarTally);

    // Marking this key for sync gives VS Code an extra signal to persist it
    // promptly rather than treating it as disposable session state.
    context.globalState.setKeysForSync([STORAGE_KEY]);

    async function persist() {
        await context.globalState.update(STORAGE_KEY, storage);
        output.appendLine(`[audit-tracker] persisted, keys=${Object.keys(storage).length}`);
    }

    function updateProgress(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            statusBarTally.hide();
            return;
        }

        // Only track real files on disk; untitled/unsaved buffers have
        // unstable URIs that won't round-trip across restarts anyway.
        if (editor.document.uri.scheme !== 'file') {
            statusBarTally.hide();
            return;
        }

        const uri = editor.document.uri.toString();
        const totalLines = editor.document.lineCount;
        const markedLines = storage[uri] || [];

        if (totalLines === 0) {
            statusBarTally.hide();
            return;
        }

        const percentage = Math.round((markedLines.length / totalLines) * 100);

        statusBarTally.text = `$(checklist) Audit: ${percentage}% (${markedLines.length}/${totalLines} lines marked)`;
        statusBarTally.tooltip = `Audit Progress Matrix for current file scope`;
        statusBarTally.show();

        const ranges = markedLines
            .filter(line => line < totalLines)
            .map(line => new vscode.Range(line, 0, line, 0));
        editor.setDecorations(readDecorationType, ranges);

        output.appendLine(`[audit-tracker] update uri=${uri} pct=${percentage} total=${totalLines}`);
    }

    let toggleCommand = vscode.commands.registerCommand('audit-tracker.toggleLine', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        if (editor.document.uri.scheme !== 'file') return;

        const uri = editor.document.uri.toString();
        const currentLine = editor.selection.active.line;

        if (!storage[uri]) {
            storage[uri] = [];
        }

        const index = storage[uri].indexOf(currentLine);
        if (index > -1) {
            storage[uri].splice(index, 1);
        } else {
            storage[uri].push(currentLine);
        }

        await persist();
        updateProgress(editor);
    });

    // Debounce text-change updates so we're not recomputing on every keystroke.
    let changeTimer: NodeJS.Timeout | undefined;
    const onTextChange = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || event.document !== editor.document) return;

        if (changeTimer) clearTimeout(changeTimer);
        changeTimer = setTimeout(() => updateProgress(editor), 300);
    });

    // Extra flush points: these catch cases where the app closes shortly
    // after the last toggle, before VS Code's internal debounce would have
    // written it out on its own.
    const onWindowStateChange = vscode.window.onDidChangeWindowState(state => {
        if (!state.focused) {
            persist();
        }
    });

    context.subscriptions.push(
        toggleCommand,
        vscode.window.onDidChangeActiveTextEditor(editor => updateProgress(editor)),
        onTextChange,
        onWindowStateChange
    );

    updateProgress(vscode.window.activeTextEditor);
}

export function deactivate() {
    // Note: there's no guaranteed synchronous flush hook here — deactivate()
    // can be interrupted on force-quit. The onDidChangeWindowState listener
    // above is the more reliable persistence guard in practice.
}