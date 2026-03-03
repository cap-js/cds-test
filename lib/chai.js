module.exports = chai() || new class chai {
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
  try { chai.use (require('chai-as-promised')) } catch {}
  try { chai.use (require('chai-subset')) } catch {}
  return chai
} catch {/* ignore */}}
