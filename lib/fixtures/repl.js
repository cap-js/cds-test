const repl = global.cds?.repl ?? {}
global.beforeAll  = global.before    = (/** @type {Function?}*/msg,/** @type {Function}*/fn) => (fn ?? msg)()
global.afterAll   = global.after     = (/** @type {Function?}*/msg,/** @type {Function}*/fn) => repl.on?.('exit', fn ?? msg)
global.beforeEach = global.afterEach = ()=>{}
global.describe   = ()=>{}
global.chai = {
  expect: global.expect = require('../expect')
}
