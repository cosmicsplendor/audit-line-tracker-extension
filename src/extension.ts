import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // 1. Persistent state cache mapping file URIs to an array of marked line numbers
    const storage: { [uri: string]: number[] } = context.workspaceState.get('auditProgressCache') || {};

    // 2. Highlighting layer: Dim subtle green background on marked code lines
    const readDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(74, 222, 128, 0.06)', 
        isWholeLine: true
    });

    // 3. UI Status Readout (Sits in bottom-right toolbar area)
    const statusBarTally = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarTally);

    // Recalculate percentage metric for active document view
    function updateProgress(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            statusBarTally.hide();
            return;
        }

        const uri = editor.document.uri.toString();
        const totalLines = editor.document.lineCount;
        const markedLines = storage[uri] || [];

        if (totalLines === 0) return;

        const percentage = Math.round((markedLines.length / totalLines) * 100);
        
        // Render percentage with clear, compact visual markup inside toolbar
        statusBarTally.text = `$(check) Audit: ${percentage}% (${markedLines.length}/${totalLines} lines)`;
        statusBarTally.tooltip = `File tracking profile for: ${editor.document.fileName}`;
        statusBarTally.show();

        // Sync and draw visual highlights on screen
        const ranges = markedLines
            .filter(line => line < totalLines) // Prevent crash arrays if file shrinks
            .map(line => new vscode.Range(line, 0, line, 0));
        editor.setDecorations(readDecorationType, ranges);
    }

    // 4. Command Execution: Adds or removes current line under cursor
    let toggleCommand = vscode.commands.registerCommand('audit-tracker.toggleLine', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const uri = editor.document.uri.toString();
        const currentLine = editor.selection.active.line;
        
        if (!storage[uri]) {
            storage[uri] = [];
        }

        const index = storage[uri].indexOf(currentLine);
        if (index > -1) {
            storage[uri].splice(index, 1); // If already marked, unmark it
        } else {
            storage[uri].push(currentLine); // Else, commit line index
        }

        // Commit updates to local persistent database layer
        context.workspaceState.update('auditProgressCache', storage);
        updateProgress(editor);
    });

    // 5. Automated View Event Listeners
    context.subscriptions.push(
        toggleCommand,
        vscode.window.onDidChangeActiveTextEditor(editor => updateProgress(editor)),
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                updateProgress(editor);
            }
        })
    );

    // Initial pass-through runtime validation on setup startup
    updateProgress(vscode.window.activeTextEditor);
}

export function deactivate() {}