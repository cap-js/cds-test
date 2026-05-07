global.before = (m, fn=m) => typeof fn === 'number' ? global.beforeAll(m, fn) : global.beforeAll(fn)
global.after  = (m,fn=m) => global.afterAll(fn)
