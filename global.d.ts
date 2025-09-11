declare function test(): void;
declare global {
    // when extending global, only var can be used
    var describe: {
        each: function(): void;
        skip: function(): void;
    }
    var it: {
        each: function (): void,
        skip: function (): void
    }
    var test: typeof it;
    function before(): void;
    function beforeAll(): void;
    function after(): void;
    function afterAll(): void;
    function xtest(): void;
    function xdescribe(): void;
}
export {};