const assert = require('node:assert/strict')
const path = require('node:path')
const cds = require('@sap/cds/lib')
const cdsTest = require('..')

describe('cds.test run compatibility', () => {
  const project = path.join(__dirname, 'app')
  const test = cdsTest('run', project, '--with-mocks', '--in-memory?')

  it('selects the project and starts core serve without DK-only flags', () => {
    assert.equal(cds.root, project)
    assert.equal(cds.env._home, project)
    assert.equal(cds.options.mocked, true)
    assert.equal(cds.options.project, undefined)
    assert.ok(test.server.address())
    assert.match(test.url, /^http:\/\/localhost:/)
  })
})
