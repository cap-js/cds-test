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
  try { chai.use (require('chai-as-promised')) } catch (err) {console.error(err)}
  try { chai.use (require('chai-subset')) } catch {/* ignore */} // subset now part of chai, but support it hete for older chai versions
  return chai
} catch (err) {console.error(err)}}
