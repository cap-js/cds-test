
const vitest = global.__vitest_index__
module.exports = vitest

//> used in Vitest
? { __proto__: vitest.chai,
  get expect() {
    const cap = require ('chai-as-promised')
    vitest.chai.use (cap.default || cap)
    return vitest.expect
  },
}

//> used in Node --test, Chest, Jest, Mocha
: new class chai {

  // Static chai interface used in cds.test
  assert (...args) { return $chai.assert (...args) }
  expect (...args) { return $chai.expect (...args) }
  should () {
    Object.defineProperty (Object.prototype, 'should', {
      get() { return $chai.expect (this) }
    })
  }

  constructor() { global.beforeAll (async () => {
    try {
      // Loading chai and chai-as-promised dynamically...
      $chai = await import ('chai')
      .then (chai => import ('chai-as-promised')
      .then (chap => chai.use (chap.default||chap)))
    } catch {
      // Fallback for Jest without --experimental-vm-modules
      $chai.assert = require ('node:assert')
      $chai.expect = require ('./expect')
    }
    Object.assign (this.assert, $chai.assert)
    Object.assign (this.expect, $chai.expect)
  })}
}

let $chai = {} //> loaded dynamically in constructor above
