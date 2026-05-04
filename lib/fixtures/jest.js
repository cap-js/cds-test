global.before = (m,fn=m) => global.beforeAll(fn, fn._hookTimeout)
global.after  = (m,fn=m) => global.afterAll(fn)
