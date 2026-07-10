"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
function activate(context) {
    // Upgraded to globalState for hard disk persistence across sessions/workspaces
    const storage = context.globalState.get('auditProgressCache') || {};
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
    function updateProgress(editor) {
        if (!editor) {
            statusBarTally.hide();
            return;
        }
        const uri = editor.document.uri.toString();
        const totalLines = editor.document.lineCount;
        const markedLines = storage[uri] || [];
        if (totalLines === 0)
            return;
        const percentage = Math.round((markedLines.length / totalLines) * 100);
        statusBarTally.text = `$(checklist) Audit: ${percentage}% (${markedLines.length}/${totalLines} lines marked)`;
        statusBarTally.tooltip = `Audit Progress Matrix for current file scope`;
        statusBarTally.show();
        const ranges = markedLines
            .filter(line => line < totalLines)
            .map(line => new vscode.Range(line, 0, line, 0));
        editor.setDecorations(readDecorationType, ranges);
    }
    let toggleCommand = vscode.commands.registerCommand('audit-tracker.toggleLine', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const uri = editor.document.uri.toString();
        const currentLine = editor.selection.active.line;
        if (!storage[uri]) {
            storage[uri] = [];
        }
        const index = storage[uri].indexOf(currentLine);
        if (index > -1) {
            storage[uri].splice(index, 1);
        }
        else {
            storage[uri].push(currentLine);
        }
        // Force a persistent block write to globalState cache and wait for confirmation
        await context.globalState.update('auditProgressCache', storage);
        updateProgress(editor);
    });
    context.subscriptions.push(toggleCommand, vscode.window.onDidChangeActiveTextEditor(editor => updateProgress(editor)), vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            updateProgress(editor);
        }
    }));
    updateProgress(vscode.window.activeTextEditor);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map