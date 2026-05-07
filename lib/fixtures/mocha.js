const { describe, before, after, it } = global
global.describe.each = global.it.each = require('./test-each')
global.beforeAll = before
global.afterAll = after
global.test = it
global.xtest = it.skip
global.xdescribe = describe.skip

global.before = (m, fn=m) => typeof fn === 'number'
  ? before(function() { this.timeout(fn); return m() })
  : before(fn)

global.after = (m, fn=m) => typeof fn === 'number'
  ? after(function() { this.timeout(fn); return m() })
  : after(fn)
