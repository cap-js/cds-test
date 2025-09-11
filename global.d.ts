import type { mock } from 'node:test'
import type each_type from './lib/fixtures/test-each.js'

declare global {
    // when extending global, only var can be used
    var describe: {
        each: typeof each_type;
        skip: {
            each: () => void;
        }
    };
    var xdescribe: typeof describe['skip'];
    var it: {
        each: typeof each_type,
        skip: () => void
    }
    var test: typeof it;
    var xtest: typeof it['skip'];
    function before(method: Function): void;
    function before(message: string & Function?, method: Function): void;
    function beforeEach(): void;
    function beforeAll(method: Function): void;
    function beforeAll(message: string & Function?, method: Function): void;
    function after(method: Function): void;
    function after(message: string & Function?, method: Function): void;
    function afterEach(): void;
    function afterAll(method: Function): void;
    function afterAll(message: string & Function?, method: Function): void;
    function expect(): void;

    var chai: {
        expect: typeof expect,
        should?: () => void,
        fake?: boolean
    }

    var jest: {
        fn: () => void;
        spyOn: typeof mock.method;
        restoreAllMocks: () => void;
        resetAllMocks: () => void;
        clearAllMocks: () => void;
        clearAllTimers: () => void;
        mock: (
            module: string | unknown,
            fn?: Function,
            o?: { virtual?: boolean }
        ) => void;
        setTimeout: () => void;
    }

    // cds-dk types
    var cds: {
        repl: unknown
    }
}
export {};
