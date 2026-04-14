const vitest = global.__vitest_index__

const { describe, beforeEach, afterEach, beforeAll, afterAll, test, vi, chai } = vitest
global.describe ??= describe
global.beforeEach ??= beforeEach
global.afterEach ??= afterEach
global.beforeAll ??= beforeAll
global.afterAll ??= afterAll
global.test ??= global.it ??= test
global.xtest ??= test.skip
global.xdescribe ??= describe.skip

global.before = (a,b) => beforeAll (typeof a === 'function' ? a : b)
global.after = (a,b) => afterAll (typeof a === 'function' ? a : b)
global.expect ??= vitest.expect

// global.mock = vi
global.jest = { __proto__: vi,
  mock: (module, fn = ()=>{}, options) => vi.mock (
    module, (...args)=> ({ default: fn(...args) }), 
    options
  ),
}

const cap = require ('chai-as-promised')
chai.use (cap.default || cap)

// Add chai-as-promised like functionality to vitest's chai, so that we can 
// write expect(promise).to.be.fulfilled and expect(promise).to.be.rejected
// chai.use (function (chai, utils) {

//   const Assertion = chai.Assertion

//   utils.addProperty (Assertion.prototype, 'fulfilled', function () {
//     const fulfilled = 'expected #{this} to be fulfilled but it was rejected with #{act}'
//     const rejected = 'expected #{this} to be rejected but it was fulfilled with #{act}'
//     const promised = Promise.resolve(this._obj).then(
//       () => this.assert (true, fulfilled, rejected),
//       () => this.assert (false, fulfilled, rejected)
//     )
//     this.then = promised.then.bind(promised)
//     return this
//   })

//   utils.addProperty (chai.Assertion.prototype, 'rejected', function () {
//     const rejected = 'expected #{this} to be rejected but it was fulfilled with #{act}'
//     const fulfilled = 'expected #{this} to be fulfilled but it was rejected with #{act}'
//     const promised = Promise.resolve(this._obj).then(
//       () => this.assert (false, fulfilled, rejected),
//       () => this.assert (true, fulfilled, rejected)
//     )
//     this.then = promised.then.bind(promised)
//     return this
//   })

// })