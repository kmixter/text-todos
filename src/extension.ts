// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

class Todo {
    dayNumber: number = -1;
    desc: string = '';
    duration: number | null = null;
    dueDate: Date | null = null;
    daysLeft: number | null = null;
    start: Date | null = null;
    spentMinutes: number | null = null;

    private static _DURATION_RE = / ([\d.]+)m\b| ([\d.]+)hr(s)?\b/g; 
    private static _TODO_LINE_RE = /\^[MTWRFSN\*] /g;
    private static _DURATION_RE = /\ ([\d\.]+)m\b| ([\d\.]+)hr(s)?\b/g;
    private static _DUE_DATE_RE = /\ <=(\d+)\/(\d+)\b/g;
    private static _START_TIME_RE = /\@(\d+):(\d+)/g;
    private static _SPENT_TIME_RE = /\ \+([\d\.]+)(m|hr)/g;
  
    private static _DOW_STRINGS = ['M', 'T', 'W', 'R', 'F', 'S', 'N'];

    constructor() {
    }

    parse(line: string): boolean {
        if (!Todo.isTodoLine(line)) {
            return false;
        }

        if (line[0] === '*') {
            this.dayNumber = -1;
        } else {
            this.dayNumber = Todo._DOW_STRINGS.indexOf(line[0]);
        }

        this.desc = line.substring(2);

        // Duration Handling
        let durationMatch = line.match(Todo._DURATION_RE); // Assuming _DURATION_RE is defined
        if (durationMatch !== undefined && durationMatch.groups !== undefined) {
            if (durationMatch.groups[1] !== undefined) {
                this.duration = parseFloat(durationMatch.groups[1]);
            } else if (durationMatch.groups[2] !== undefined) {   
                this.duration = parseFloat(durationMatch.groups[2]) * 60;
            }            
        }

        // Due Date Handling
        let dueDateMatch = line.match(Todo._DUE_DATE_RE);  // Assuming _DUE_DATE_RE is defined
        if (dueDateMatch) {
            const today = new Date();
            this.dueDate = new Date(
                today.getFullYear(), 
                parseInt(dueDateMatch.groups[1]) - 1, // Months are zero-indexed
                parseInt(dueDateMatch.groups[2])
            );

            const timeDelta = this.dueDate.getTime() - today.getTime();
            this.daysLeft = Math.ceil(timeDelta / (1000 * 60 * 60 * 24)); 
        }

        // (Implement regex parsing like in your Python code)

        return true;
    }

    static formatMinutes(minutes: number): string {
        if (minutes >= 90 || minutes === 60) {
            return (minutes / 60.0).toFixed(2) + 'hr'; // Note: toFixed for display
        }
        return minutes.toString() + 'm';
    }

    // ... (Implement rest of your formatting and utility methods)

    static isTodoLine(line: string): boolean {
        // ... (Implement your regex check here)
    }

    // ... (Remaining methods) 
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let command = vscode.commands.registerCommand('text-todo.findTodos', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; } // No active editor

        const document = editor.document;
        const currentPosition = editor.selection.active;

        // Search upwards from the current line
        for (let lineNumber = currentPosition.line - 1; lineNumber >= 0; lineNumber--) {
            const lineText = document.lineAt(lineNumber).text;
            if (lineText.includes('TODO')) {
                // Move cursor to found TODO
                const position = new vscode.Position(lineNumber, lineText.indexOf('TODO'));
                editor.selection = new vscode.Selection(position, position);
                vscode.window.showInformationMessage(`Found TODO on line ${lineNumber + 1}`);
                return;
            }
        }

        vscode.window.showInformationMessage('No TODOs found above');
    });

	context.subscriptions.push(command);

    // Create the keybinding dynamically
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.setKeybinding', () => {
            vscode.workspace.getConfiguration().update('keybindings', [
                {
                    "key": "ctrl+k a",
                    "command": "text-todo.findTodos",
                    "when": "editorTextFocus"
                }
            ], vscode.ConfigurationTarget.Global); // Set the keybinding globally
        })
    );

}
