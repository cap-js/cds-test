const { describe, test, before, after, beforeEach, afterEach, mock } = require('node:test')
const _fn = fn => !fn.length ? fn : (_,done) => fn (done)

describe.each = test.each = describe.skip.each = test.skip.each = require('./test-each')
global.describe = describe
global.beforeEach = beforeEach
global.afterEach = afterEach
global.beforeAll = global.before = (m, fn=m) => typeof fn === 'number' ? before(_fn(m), { timeout: fn }) : before(_fn(fn))
global.afterAll  = global.after  = (m, fn=m) => typeof fn === 'number' ? after(_fn(m),  { timeout: fn }) : after(_fn(fn))
global.test = global.it = test
global.xtest = test.skip
global.xdescribe = describe.skip

global.expect = require('../expect')

global.jest = {
  fn: (..._) => mock.fn (..._),
  spyOn: (..._) => mock.method (..._),
  restoreAllMocks: ()=> mock.restoreAll(),
  resetAllMocks: ()=> mock.reset(),
  clearAllMocks: ()=>{},
  clearAllTimers: ()=> mock.timers.reset(),
  mock (module, fn = ()=>{}, o) {
    if (typeof module === 'string') {
      const path = require.resolve (module)
      return require.cache[path] = { get exports () {
        return require.cache[path] = o?.virtual ? fn() : Object.assign (require(path), fn())
      }}
    }
  },
  setTimeout(){}
}
