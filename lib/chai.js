const { NCHAI } = process.env
module.exports = (!NCHAI && chai()) || new class chai {
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
  try { chai.use (require('chai-as-promised')) } catch {/* ignore */}
  try { chai.use (require('chai-subset')) } catch {/* ignore */} // subset now part of chai, but support it hete for older chai versions
  return chai
} catch {/* ignore */}}
