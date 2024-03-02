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

    private static TODO_LINE_RE = /\^[MTWRFSN\*] /g;
    private static DURATION_RE = /\ ([\d\.]+)m\b| ([\d\.]+)hr(s)?\b/g;
    private static DUE_DATE_RE = /\ <=(\d+)\/(\d+)\b/g;
    private static START_TIME_RE = /\@(\d+):(\d+)/g;
    private static SPENT_TIME_RE = /\ \+([\d\.]+)(m|hr)/g;

    private static DOW_STRINGS = ['M', 'T', 'W', 'R', 'F', 'S', 'N'];

    constructor() {
    }

    parse(line: string): boolean {
        if (!Todo.isTodoLine(line)) {
            return false;
        }

        if (line[0] === '*') {
            this.dayNumber = -1;
        } else {
            this.dayNumber = Todo.DOW_STRINGS.indexOf(line[0]);
        }

        this.desc = line.substring(2);

        let durationMatch = line.match(Todo.DURATION_RE);
        if (durationMatch) { // null check is sufficient here
            if (durationMatch.groups?.[1]) { // Check the capture group directly
                this.duration = parseFloat(durationMatch.groups[1]);
            } else if (durationMatch.groups?.[2]) {
                this.duration = parseFloat(durationMatch.groups[2]) * 60;
            }
        }

        let dueDateMatch = line.match(Todo.DUE_DATE_RE);  // Assuming _DUE_DATE_RE is defined
        if (dueDateMatch) {
            const today = new Date();
            this.dueDate = new Date(
                today.getFullYear(),
                parseInt(dueDateMatch.groups?.[1] ?? '0') - 1, // Months are zero-indexed
                parseInt(dueDateMatch.groups?.[2] ?? '0')
            );

            const timeDelta = this.dueDate.getTime() - today.getTime();
            this.daysLeft = Math.ceil(timeDelta / (1000 * 60 * 60 * 24));
        }

        let startTimeMatch = line.match(Todo.START_TIME_RE);
        if (startTimeMatch) {
            const hour = parseInt(startTimeMatch.groups?.[1] ?? '0');
            const minute = parseInt(startTimeMatch.groups?.[2] ?? '0');
            this.start = new Date(); // Get the current date and time
            this.start.setHours(hour);
            this.start.setMinutes(minute);
        }

        let spentTimeMatch = line.match(Todo.SPENT_TIME_RE);
        if (spentTimeMatch) {
            this.spentMinutes = parseFloat(spentTimeMatch.groups?.[1] ?? '0');
            if (spentTimeMatch.groups?.[2] === 'hr') {
                this.spentMinutes *= 60;
            }
        }

        return true;
    }

    static formatMinutes(minutes: number): string {
        if (minutes >= 90 || minutes === 60) {
            return (minutes / 60.0).toFixed(2) + 'hr'; // Note: toFixed for display
        }
        return minutes.toString() + 'm';
    }

    static stripAnnotations(line: string): string {
        if (line.includes('##')) {
            return line.substring(0, line.indexOf('##')).trimRight();
        }
        return line;
    }

    static formatAnnotations(line: string, annotations: string[]): string {
        line = Todo.stripAnnotations(line);
        return `${line.padEnd(65)} ##${annotations.join(' ')}`;
    }

    format(): string {
        let line = this.isDone() ? `${Todo.DOW_STRINGS[this.dayNumber]} ` : '* ';
        line += this.desc;

        if (this.duration !== null) {
            line += ' ' + Todo.formatMinutes(this.duration);
        }

        if (this.spentMinutes !== null) {
            line += ' +' + Todo.formatMinutes(this.spentMinutes);
        }

        if (this.dueDate !== null) {
            line += ` <=${this.dueDate.getMonth() + 1}/${this.dueDate.getDate()}`;
        }

        if (this.isDone()) {
            return line;
        }

        const annotations = [];
        if (this.start !== null) {
            annotations.push(`@${this.start.getHours()}:${this.start.getMinutes().toString().padStart(2, '0')}`);
        }

        if (this.isElapsed()) {
            annotations.push('ELAPSED!');
        } else if (this.hasCompletionRate()) {
            annotations.push(`${Todo.formatMinutes(this.getCompletionRate())}s/d`);
        }

        return annotations.length > 0 ? Todo.formatAnnotations(line, annotations) : line;
    }

    isElapsed(): boolean {
        return this.daysLeft !== null && this.daysLeft < 1;
    }

    hasCompletionRate(): boolean {
        return this.daysLeft !== null && this.duration !== null;
    }

    getCompletionRate(): number {
        if (!this.hasCompletionRate()) {
            return 0;
        }
        return this.duration! / this.daysLeft!; // Non-null assertion as checked before
    }

    isDone(): boolean {
        return this.dayNumber >= 0;
    }

    static isTodoLine(line: string): boolean {
        return Todo.TODO_LINE_RE.test(line);
    }

    static isPendingTodoLine(line: string): boolean {
        return line.startsWith('* ');
    }
}

class BaseTodoCommand implements vscode.Disposable {
    private static BLANK_LINE_RE = /^\s*$/;
    private static MAX_LINES_IN_TODOS = 1000;

    getNextLinePoint(position: vscode.Position): vscode.Position {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active text editor');
        }

        const document = editor.document;
        const line = document.lineAt(position);
        const endOfLine = line.range.end; // End of the current line

        // Find the start of the next line, if it exists
        const nextLineStart = endOfLine.with({ character: endOfLine.character + 1 });

        // Check if we're at the end of the document
        if (nextLineStart.isAfter(document.lineAt(document.lineCount - 1).range.end)) {
            return document.getText().length; // Simulate view.size() behavior
        }

        return nextLineStart;
    }

    getLineStartPoint(position: vscode.Position): vscode.Position {
        const startOfLine = position.with({ character: 0 });
        return startOfLine;
    }

    getLinePrefixRegion(position: vscode.Position, length: number): vscode.Range  {
        const start = this.getLineStartPoint(position);
        const end = start.with({ character: start.character + length });
        return new vscode.Range(start, end);
    }

    dispose() {
        // Used to release any resources if needed.
    }
}

class MarkTodoDoneCommand extends BaseTodoCommand {
    async run(edit: vscode.TextEditorEdit) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const currentPosition = editor.selection.active;
        const currentLine = editor.document.lineAt(currentPosition.line);
        const todoText = currentLine.text;

        const todo = new Todo();
        if (!todo.parse(todoText)) {
            vscode.window.showErrorMessage('Not a TODO line');
            return;
        }

        if (!todo.isDone()) {
            todo.dayNumber = new Date().getDay(); // 0 for Sunday, 6 for Saturday
            vscode.window.showInformationMessage('Marked done');
        } else {
            todo.dayNumber = -1;
            vscode.window.showInformationMessage('Unmarked done');
        }

        edit.replace(currentLine.range, todo.format());
    }
}

class ArchiveTodosCommand extends BaseTodoCommand {
    async run(edit: vscode.TextEditorEdit) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const todoRegion = this.findMyTodoRegion();
        const todoText = editor.document.getText(todoRegion);

        const archivedText: string[] = [];
        const newText: string[] = [];

        todoText.split('\n').forEach(line => {
            if (!Todo.isTodoLine(line)) {
                archivedText.push(line);
                newText.push(line);
            } else if (Todo.isPendingTodoLine(line)) {
                newText.push(line);
            } else {
                archivedText.push(line);
            }
        });

        await edit.replace(todoRegion, archivedText.join('\n')); // Update the TODO region

        const insertionPoint = this.getSimplePoint();
        await editor.edit(editBuilder => {
            editBuilder.insert(insertionPoint, newText.join('\n') + '\n');
        });
    }
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    const markTodoDoneCmd = new MarkTodoDoneCommand(); // Instantiate your command
    context.subscriptions.push(
        vscode.commands.registerCommand('text-todo.markTodoDone', markTodoDoneCmd.run.bind(markTodoDoneCmd))
    );
}
