global.before = (m, fn=m) => typeof fn === 'number' ? global.beforeAll(m, fn) : global.beforeAll(fn)
global.after  = (m, fn=m) => typeof fn === 'number' ? global.afterAll(m, fn)  : global.afterAll(fn)
