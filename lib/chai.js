const CHAI = !/\b(false)\b/.test(process.env.CHAI) // to disable chai mode even if chai is installed

module.exports = (CHAI && chai()) || new class chai {
  get assert() { return super.assert = require('node:assert')}
  get expect() { return super.expect = require('./expect')}
  should() {
    const expect = this.expect
    Object.defineProperty (Object.prototype, 'should', {
      get() { return expect(this) }
    })
  }
}

function chai() { try {
  const chai = require ('chai')
  try { const chai_ap = require('chai-as-promised'); chai.use (chai_ap.default ?? chai_ap) } catch {/* ignore */}
  try { chai.use (require('chai-subset')) } catch {/* ignore */} // subset now part of chai, but support it here for older chai versions
  return chai
} catch {/* ignore */}}
