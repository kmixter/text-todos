import * as assert from 'assert';
import * as proxyquire from 'proxyquire';

// Mock the vscode module
const vscodeMock = {
    window: {
        createTextEditorDecorationType: () => {}
    }
};
const { Todo, BaseTodoCommand } = proxyquire.noCallThru()('../extension', { 'vscode': vscodeMock });

describe('Todo Parsing', () => {
    it('should parse a simple TODO line', () => {
        const line = '* This is a basic TODO';
        const todo = Todo.parse(line);
        assert(todo !== undefined);
        assert.strictEqual(todo!.dayNumber, -1);
        assert.strictEqual(todo!.desc, 'This is a basic TODO');
        assert.strictEqual(todo!.format(), line);
    });

    it('should parse a TODO line with annotations stripped', () => {
        const line = 'M This is a TODO  ## and skip all this';
        const todo = Todo.parse(line);
        assert(todo !== undefined);
        assert.strictEqual(todo!.dayNumber, 0);
        assert.strictEqual(todo!.desc, 'This is a TODO');
        assert.strictEqual(todo!.format(), 'M This is a TODO');
    });

    it('should parse a TODO line with duration', () => {
        const line = 'M This is a TODO with a duration 30m';
        const todo = Todo.parse(line);
        assert(todo !== undefined);
        assert.strictEqual(todo!.dayNumber, 0);
        assert.strictEqual(todo!.desc, 'This is a TODO with a duration');
        assert.strictEqual(todo!.duration, 30);
        assert.strictEqual(todo!.format(), line);
    });

    it('should parse a TODO line with due date', () => {
        const line = 'M This is a TODO with a due date <=12/31';
        const todo = Todo.parse(line);
        assert(todo !== undefined);
        assert.strictEqual(todo!.dayNumber, 0);
        assert.strictEqual(todo!.desc, 'This is a TODO with a due date');
        const currentYear = new Date().getFullYear();
        assert.strictEqual(todo!.dueDate?.getFullYear(), currentYear);
        assert.strictEqual(todo!.dueDate?.getMonth(), 11); // December is month 11 (0-based index)
        assert.strictEqual(todo!.dueDate?.getDate(), 31);
        assert.strictEqual(todo!.format(), line);
    });

    it('should parse a TODO line with all annotations', () => {
        const line = '* This is a TODO with all bells and whistles 76m +2hr 115c <=12/31 ##@8:56 10m/d 91c/hr';
        const fixedDate = new Date(2024, 11, 24, 8, 56);
        const todo = Todo.parse(line, fixedDate);
        assert(todo !== undefined);
        assert.strictEqual(todo!.dayNumber, -1);
        assert.strictEqual(todo!.desc, 'This is a TODO with all bells and whistles');
        assert.strictEqual(todo!.duration, 76);
        assert.strictEqual(todo!.spentMinutes, 120);
        assert.strictEqual(todo!.dueDate?.getFullYear(), 2024);
        assert.strictEqual(todo!.dueDate?.getMonth(), 11);
        assert.strictEqual(todo!.dueDate?.getDate(), 31);
        assert.strictEqual(todo!.start?.getHours(), 8);
        assert.strictEqual(todo!.start?.getMinutes(), 56);
        assert.strictEqual(todo!.format(), line);
    });

    it('should consider identical TODOs as equal', () => {
        const line = 'M This is a TODO with a duration 30m';
        const todo1 = Todo.parse(line);
        const todo2 = Todo.parse(line);
        assert(todo1 !== undefined && todo2 !== undefined);
        assert.deepStrictEqual(todo1, todo2);
    });

    it('should consider different TODOs as not equal', () => {
        const line1 = 'M This is a TODO with a duration 30m';
        const line2 = 'T This is a different TODO with a duration 30m';
        const todo1 = Todo.parse(line1);
        const todo2 = Todo.parse(line2);
        assert(todo1 !== undefined && todo2 !== undefined);
        assert.notDeepStrictEqual(todo1, todo2);
    });

    it('should sort TODOs correctly', () => {
        const lines = [
            'TODOs:',
            '* This is a pending TODO',
            'M This is a completed TODO on Monday',
            'T This is a completed TODO on Tuesday',
            '* Another pending TODO',
            'W This is a completed TODO on Wednesday'
        ];

        const baseTodoCommand = new BaseTodoCommand();
        const sortedTodos = baseTodoCommand.sortTodos(lines);

        assert.strictEqual(sortedTodos[0], 'TODOs:');
        assert.strictEqual(sortedTodos[1], '* This is a pending TODO');
        assert.strictEqual(sortedTodos[2], '* Another pending TODO');
        assert.strictEqual(sortedTodos[3], 'M This is a completed TODO on Monday');
        assert.strictEqual(sortedTodos[4], 'T This is a completed TODO on Tuesday');
        assert.strictEqual(sortedTodos[5], 'W This is a completed TODO on Wednesday');
    });
});

describe('Todo Sorting', () => {
    it('should sort TODOs with due dates and different remaining times', () => {
        const fixedDate = new Date(2024, 9, 2); // October 2, 2024

        const lines = [
            'TODOs:',
            `* TODO with 120 minutes remaining 120m <=10/7`,
            `* TODO with 60 minutes remaining 60m <=10/7`,
            `* TODO with 180 minutes remaining 180m <=10/7`
        ];

        const baseTodoCommand = new BaseTodoCommand();
        const sortedTodos = baseTodoCommand.sortTodos(lines, fixedDate);

        assert.strictEqual(sortedTodos[0], `TODOs:                                                            ##∑: 1hr/d 6hr`);
        assert.strictEqual(sortedTodos[1], `* TODO with 180 minutes remaining 3hr <=10/7                      ##30m/d`);
        assert.strictEqual(sortedTodos[2], `* TODO with 120 minutes remaining 2hr <=10/7                      ##20m/d`);
        assert.strictEqual(sortedTodos[3], `* TODO with 60 minutes remaining 1hr <=10/7                       ##10m/d`);
    });

    it('should sort TODOs with coins and varying times left', () => {
        const fixedDate = new Date(2024, 9, 2); // October 2, 2024

        const lines = [
            `TODOs:`,
            `* TODO with 120 minutes remaining 120m 50c`,
            `* TODO with 60 minutes remaining 60m 100c`,
            `* TODO with 180 minutes remaining 180m 90c`
        ];

        const baseTodoCommand = new BaseTodoCommand();
        const sortedTodos = baseTodoCommand.sortTodos(lines, fixedDate);

        assert.strictEqual(sortedTodos[0], `TODOs:                                                            ##∑: 6hr 240c 40c/hr`);
        assert.strictEqual(sortedTodos[1], `* TODO with 60 minutes remaining 1hr 100c                         ##100c/hr`);
        assert.strictEqual(sortedTodos[2], `* TODO with 180 minutes remaining 3hr 90c                         ##30c/hr`);
        assert.strictEqual(sortedTodos[3], `* TODO with 120 minutes remaining 2hr 50c                         ##25c/hr`);
    });

    it('should sort TODOs of different forms', () => {
        const fixedDate = new Date(2024, 9, 2); // October 2, 2024

        const lines = [
            'TODOs:',
            '* TODO elapsed <=10/1',
            '* First boring TODO',
            'M TODO finished +15m 15m 16c <=9/1',
            '* TODO with completion rate 20m <=10/7',
            '* Second boring TODO',
            '* TODO with coin rate 20m 50c',
        ];

        const baseTodoCommand = new BaseTodoCommand();
        const sortedTodos = baseTodoCommand.sortTodos(lines, fixedDate);

        assert.strictEqual(sortedTodos[0], 'TODOs:                                                            ##∑: 3m/d 40m 50c 150c/hr');
        assert.strictEqual(sortedTodos[1], '* TODO elapsed <=10/1                                             ##ELAPSED!');
        assert.strictEqual(sortedTodos[2], '* TODO with completion rate 20m <=10/7                            ##3m/d');
        assert.strictEqual(sortedTodos[3], '* TODO with coin rate 20m 50c                                     ##150c/hr');
        assert.strictEqual(sortedTodos[4], '* First boring TODO');
        assert.strictEqual(sortedTodos[5], '* Second boring TODO');
        assert.strictEqual(sortedTodos[6], 'M TODO finished +15m 15m 16c <=9/1');
    });
});
