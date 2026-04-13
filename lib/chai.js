const CHAI = !/\b(false)\b/.test(process.env.CHAI) // to disable chai mode even if chai is installed
const DEBUG = /\b(test)\b/.test(process.env.DEBUG) ? console : null

/** @type {import('chai')} */
module.exports = CHAI && chai() || new class chai {
  get assert() { return super.assert = require('node:assert')}
  get expect() { return super.expect = require('./expect')}
  should() {
    const expect = this.expect
    Object.defineProperty (Object.prototype, 'should', {
      get() { return expect(this) }
    })
  }
}

function chai() {

  // Try to load chai and report any loading errors, but don't throw to allow 
  // falling back to built-in expect function.
  // Includes Jest's ESM loading errors for chai >=7. 
  // Even if --experimental-modules flag is used, Jest doesn't support the require() style.
  try { 
    var chai = require ('chai') 
  } catch (e) { return DEBUG?.error(e) }

  // Try to load chai plugins individually and report any loading errors, 
  // Rethrow any errors other than "MODULE_NOT_FOUND" to report them in test output.
  try {
    const chai_ap = require('chai-as-promised')
    chai.use (chai_ap.default ?? chai_ap) // for ESM and non-ESM versions
  } catch (e) { if (e.code === 'MODULE_NOT_FOUND') DEBUG?.error(e); else throw e }
  try {
    chai.use (require('chai-subset')) // subset now part of chai, but support it here for older chai versions
  } catch (e) { if (e.code === 'MODULE_NOT_FOUND') DEBUG?.error(e); else throw e }

  return chai
}
