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
  try {
    var chai = require ('chai')
  } catch (e) {
    // Includes Jest's ESM loading errors for chai >=7. Even if --experimental-modules flag is used, Jest doesn't support the require() style.
    // Return and fall back to built-in chai here.
    return DEBUG?.error(e)
  }

  try {
    const chai_ap = require('chai-as-promised')
    chai.use (chai_ap.default ?? chai_ap) // for ESM and non-ESM versions
  } catch (e) { if (e.code === 'MODULE_NOT_FOUND') DEBUG?.error(e); else throw e }
  try {
    chai.use (require('chai-subset')) // subset now part of chai, but support it here for older chai versions
  } catch (e) { if (e.code === 'MODULE_NOT_FOUND') DEBUG?.error(e); else throw e }

  return chai
}
