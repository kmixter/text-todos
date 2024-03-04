import * as vscode from 'vscode';

class Todo {
    dayNumber: number = -1;
    desc: string = '';
    duration: number | null = null;
    dueDate: Date | null = null;
    daysLeft: number | null = null;
    start: Date | null = null;
    spentMinutes: number | null = null;

    private static TODO_LINE_RE = /^[MTWRFSN\*] /;
    private static DURATION_RE = /\ ([\d\.]+)m\b| ([\d\.]+)hr(s)?\b/;
    private static DUE_DATE_RE = /\ <=(\d+)\/(\d+)\b/;
    private static START_TIME_RE = /\@(\d+):(\d+)/;
    private static SPENT_TIME_RE = /\ \+([\d\.]+)(m|hr)/;

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

        this.desc = Todo.stripAnnotations(line.substring(2));
        [Todo.DURATION_RE, Todo.DUE_DATE_RE, Todo.START_TIME_RE, Todo.SPENT_TIME_RE].forEach((re) => {
            this.desc = this.desc.replace(re, '');
        });
        this.desc.trimEnd();

        let durationMatch = line.match(Todo.DURATION_RE);
        if (durationMatch) {
            if (durationMatch[1]) {
                this.duration = parseFloat(durationMatch[1]);
            } else if (durationMatch[2]) {
                this.duration = parseFloat(durationMatch[2]) * 60;
            }
        }

        let dueDateMatch = line.match(Todo.DUE_DATE_RE);  // Assuming _DUE_DATE_RE is defined
        if (dueDateMatch) {
            const today = new Date();
            this.dueDate = new Date(
                today.getFullYear(),
                parseInt(dueDateMatch[1]) - 1, // Months are zero-indexed
                parseInt(dueDateMatch[2]),
                23, 59, 59
            );

            const msecPerDay = 1000 * 60 * 60 * 24;
            const timeDelta = this.dueDate.getTime() - today.getTime();
            this.daysLeft = Math.ceil(timeDelta / msecPerDay);
        }

        let startTimeMatch = line.match(Todo.START_TIME_RE);
        if (startTimeMatch) {
            const hour = parseInt(startTimeMatch[1]);
            const minute = parseInt(startTimeMatch[2]);
            this.start = new Date(); // Get the current date and time
            this.start.setHours(hour);
            this.start.setMinutes(minute);
        }

        let spentTimeMatch = line.match(Todo.SPENT_TIME_RE);
        if (spentTimeMatch) {
            this.spentMinutes = parseFloat(spentTimeMatch[1]);
            if (spentTimeMatch[2] === 'hr') {
                this.spentMinutes *= 60;
            }
        }

        return true;
    }

    static parse(line: string): Todo | undefined {
        let todo = new Todo();
        if (todo.parse(line)) {
            return todo;
        }
        return undefined;
    }

    static formatMinutes(minutes: number): string {
        if (minutes >= 90 || minutes === 60) {
            return parseFloat((minutes / 60.0).toFixed(2)) + 'hr'; // Note: toFixed for display
        }
        return minutes.toString() + 'm';
    }

    static stripAnnotations(line: string): string {
        if (line.includes('##')) {
            return line.substring(0, line.indexOf('##')).trimEnd();
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
            annotations.push(`${Todo.formatMinutes(this.getCompletionRate())}/d`);
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
    static timedRegionDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(128, 255, 128, 0.3)',
        isWholeLine: true
    });

    getLineStartPoint(position: vscode.Position): vscode.Position {
        const startOfLine = position.with({ character: 0 });
        return startOfLine;
    }

    getLinePrefixRegion(position: vscode.Position, length: number): vscode.Range  {
        const start = this.getLineStartPoint(position);
        const end = start.with({ character: start.character + length });
        return new vscode.Range(start, end);
    }

    static isBlankLine(line: string): boolean {
        return BaseTodoCommand.BLANK_LINE_RE.test(line);
    }

    findTodosRegion(editor: vscode.TextEditor): vscode.Range | undefined {  // Note the asynchronous aspect
        const document = editor.document;
        const currentPosition = editor.selection.active;

        // Find last TODO region before cursor line.
        const todoPattern = /^TODOs(:)?\s*(?:##.*)?$/;
        let todoRegion = undefined;
        let startLine = -1;
        for (let lineNumber = currentPosition.line - 1; lineNumber > 0; lineNumber--) {
            const lineText = document.lineAt(lineNumber).text;
            if (todoPattern.test(lineText)) {
                startLine = lineNumber; 
                break;
            }
        }

        if (startLine < 0) { return undefined; } 

        // Find the end of the TODOs region
        let endLine = startLine;
        for (let i = startLine + 1; i < document.lineCount; ++i) {
            if (i - startLine >= BaseTodoCommand.MAX_LINES_IN_TODOS) {
                break;
            }

            const lineText = document.lineAt(i).text;

            if (Todo.isTodoLine(lineText)) {
                endLine = i;
            } else if (!BaseTodoCommand.isBlankLine(lineText)) {
                break;
            }
        }

        return new vscode.Range(document.lineAt(startLine).range.start,
                                document.lineAt(endLine).range.end);
    }


    dispose() {
        // Used to release any resources if needed.
    }
}

class MarkTodoDoneCommand extends BaseTodoCommand {
    async run(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
        const currentPosition = editor.selection.active;
        const currentLine = editor.document.lineAt(currentPosition.line);
        const todoText = currentLine.text;

        const todo = Todo.parse(todoText);
        if (!todo) {
            vscode.window.showErrorMessage('Not a TODO line');
            return;
        }

        if (!todo.isDone()) {
            todo.dayNumber = new Date().getDay(); // 0 for Sunday, 6 for Saturday
        } else {
            todo.dayNumber = -1;
        }

        edit.replace(currentLine.range, todo.format());
    }
}

class ArchiveTodosCommand extends BaseTodoCommand {
    async run(editor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
        const todoRegion = this.findTodosRegion(editor);
        if (todoRegion === undefined) {
            vscode.window.showInformationMessage('No TODOs found');
            return;
        }
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

        edit.replace(todoRegion, archivedText.join('\n')); // Update the TODO region
        const insertionPoint = editor.selections[0].start;
        edit.insert(insertionPoint, newText.join('\n') + '\n');
    }
}

class TimeTodoCommand extends BaseTodoCommand {
    async run(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, isStart: boolean) {
        const todosRegion = this.findTodosRegion(editor);
        if (!todosRegion) {
            vscode.window.showErrorMessage('No TODO region');
            return;
        }

        const currentPosition = editor.selection.active;
        const lineRegion = editor.document.lineAt(currentPosition.line);

        if (isStart && !Todo.isTodoLine(lineRegion.text)) {
            vscode.window.showErrorMessage('Not on a TODO line');
            return;
        }

        const todoLines = editor.document.getText(todosRegion).split('\n');
        let line = todosRegion.start.line;
        const timedRegions: vscode.Range[] = [];
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();

        const resultText: string[] = [];
        for (let lineNumber = todosRegion.start.line; lineNumber <= todosRegion.end.line; ++lineNumber) {
            const line = editor.document.lineAt(lineNumber)
            let todo = Todo.parse(line.text);

            if (!todo) {
                resultText.push(line.text);
                continue;
            }

            if (todo.start) {
                let diffMins = nowMins - (todo.start.getHours() * 60 + todo.start.getMinutes());
                if (diffMins < 0) {
                    diffMins += 24 * 60; // Handle wrapping over to the next day
                }

                vscode.window.showInformationMessage(`Spent ${diffMins} minutes on ${todo.desc}`);

                if (!todo.spentMinutes) {
                    todo.spentMinutes = 0;
                }

                todo.spentMinutes += diffMins;
                todo.start = null; // Reset start time
            }

            if (isStart && lineNumber == currentPosition.line && !todo.isDone()) {
                todo.start = new Date();
                timedRegions.push(line.range);
            }

            resultText.push(todo.format());
        }

        edit.replace(todosRegion, resultText.join('\n'));

        // Create a decoration type (customize the styling)
        editor.setDecorations(TimeTodoCommand.timedRegionDecoration, timedRegions);
    }
}

class SortTodosCommand extends BaseTodoCommand {
    private static getPendingLinePriority(todo: Todo) {
        if (!todo.hasCompletionRate()) {
            return -1;
        }
        if (todo.isElapsed()) {
            return 1<<31;
        }
        return todo.getCompletionRate();
    }

    private static getTotalsAnnotation(todos: Todo[]): string {
        if (todos.find((t) => t.isElapsed())) {
            return '∑: ELAPSED!';
        }
        let sumCompletionRate = 0;
        for (const todo of todos) {
            sumCompletionRate += todo.getCompletionRate();
        }
        return `∑: ${Todo.formatMinutes(sumCompletionRate)}/d`;
    }

    sortTodos(todoLines: string[]): string[] {
        const pending: Todo[] = [];
        let completedByDay: string[][] = [];
        const unknown: string[] = [];

        for (let i = 0; i < 7; ++i) {
            completedByDay.push([]);
        }

        for (const line of todoLines) {
            if (BaseTodoCommand.isBlankLine(line)) { continue; }

            const todo = Todo.parse(line);
            if (todo) {
                if (todo.dayNumber >= 0) {
                    completedByDay[todo.dayNumber].push(line);
                } else {
                    pending.push(todo);
                }
            } else {
                unknown.push(line);
            }
        }

        // Sort pending based on your priority logic
        pending.sort((a, b) => (SortTodosCommand.getPendingLinePriority(b) -
                                SortTodosCommand.getPendingLinePriority(a)));

        if (unknown.length > 0) {
            unknown[0] = Todo.formatAnnotations(unknown[0], [SortTodosCommand.getTotalsAnnotation(pending)]);
        }

        // Final array assembly
        const resultText = [...unknown];
        for (const todo of pending) {
            resultText.push(todo.format());
        }
        for (let i = 0; i < 7; i++) {
            resultText.push(...completedByDay[i]);
        }

        return resultText;
    }

    async run(editor: vscode.TextEditor, edit: vscode.TextEditorEdit, isStart: boolean) {
        const todosRegion = this.findTodosRegion(editor);
        if (!todosRegion) {
            vscode.window.showErrorMessage('No TODO region');
            return;
        }
        let todoLines = editor.document.getText(todosRegion).split('\n');
        todoLines = this.sortTodos(todoLines);

        edit.replace(todosRegion, todoLines.join('\n'));
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    const markTodoDoneCommand = new MarkTodoDoneCommand();
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('text-todo.markTodoDone', markTodoDoneCommand.run.bind(markTodoDoneCommand))
    );

    const archiveTodosCommand = new ArchiveTodosCommand();
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('text-todo.archiveTodos', archiveTodosCommand.run.bind(markTodoDoneCommand))
    );

    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('text-todo.startTimeTodo',
                                                  (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
            let timeTodoCommand = new TimeTodoCommand();
            timeTodoCommand.run(editor, edit, true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('text-todo.stopTimeTodo',
                                                  (editor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {
            let timeTodoCommand = new TimeTodoCommand();
            timeTodoCommand.run(editor, edit, false);
        })
    );

    const sortTodosCommand = new SortTodosCommand();
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('text-todo.sortTodos', sortTodosCommand.run.bind(sortTodosCommand)));
}
