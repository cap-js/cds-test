import type { mock } from 'node:test'

declare global {
    // when extending global, only var can be used
    var describe: {
        each: () => void;
        skip: {
            each: () => void;
        }
    } | (() => void);
    var xdescribe: typeof describe['skip'];
    var it: {
        each: () => void,
        skip: () => void
    }
    var test: typeof it;
    var xtest: typeof it['skip'];
    function before(message: string & Function?, method: Function): void;
    function beforeEach(): void
    function beforeAll(message: string & Function?, method: Function): void;
    function after(message: string & Function?, method: Function): void;
    function afterEach(): void;
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
