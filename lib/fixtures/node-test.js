const { describe, test, before, after, beforeEach, afterEach, mock } = require('node:test')
const _fn = fn => !fn.length ? fn : (_,done) => fn (done)

describe.each = test.each = describe.skip.each = test.skip.each = require('./test-each')
global.describe = describe
global.beforeEach = beforeEach
global.afterEach = afterEach
global.beforeAll = global.before = (m,fn=m) => before(_fn(fn))
global.afterAll = global.after = (m,fn=m) => after(fn)
global.test = global.it = test
global.xtest = test.skip
global.xdescribe = describe.skip
global._fake_chai = { expect: global.expect = require('../expect') }

global.jest = {
  fn: (..._) => mock.fn (..._),
  spyOn: (..._) => mock.method (..._),
  restoreAllMocks: ()=> mock.restoreAll(),
  resetAllMocks: ()=> mock.reset(),
  clearAllMocks: ()=>{},
  clearAllTimers: ()=> mock.timers.reset(),
  mock (module, fn) {
    // return mock.module (module, fn)
    if (typeof module === 'string') {
      const path = require.resolve (module)
      require.cache[path] = new MockedModule (path,fn)
    }
    // if (typeof module === 'string') module = require (module)
  },
}

class MockedModule {
  constructor (path, fn) {
    this.module = require (path)
    this.path = path
    this.fn = fn
  }
  get exports() {
    const mocked = this.fn()
    return super.exports = Object.assign (this.module, mocked)
  }
}