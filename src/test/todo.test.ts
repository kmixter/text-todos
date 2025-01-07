import * as assert from 'assert';
import * as proxyquire from 'proxyquire';

// Mock the vscode module
const vscodeMock = {
    window: {
        createTextEditorDecorationType: () => {}
    }
};
const { Todo } = proxyquire.noCallThru()('../extension', { 'vscode': vscodeMock });

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
});
