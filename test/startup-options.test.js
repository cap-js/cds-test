const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
require('..') // install the test-runner globals
const source = fs.readFileSync(path.join(__dirname, '../lib/cds-test.js'), 'utf8')

function fixture() {
  const hooks = [], calls = []
  const cds = {
    root: '/root',
    utils: { path, isdir: directory => directory, local: directory => directory },
    exec: async (...args) => { calls.push(args); return { server: {}, url: 'http://localhost:1234' } }
  }
  const module = { exports: {} }
  vm.runInNewContext(source, {
    module, exports: module.exports, global: { cds: { repl: true } },
    process: { env: {}, pid: 42 },
    before: hook => hooks.push(hook), after: () => {},
    require: id => id === '@sap/cds/lib' ? cds : id === './xaxios' ? class {} : {}
  })
  return { test: module.exports, cds, calls, hooks }
}

describe('cds.test startup options', () => {
  it('selects run projects directly instead of passing --project to core', async () => {
    const { test, cds, calls, hooks } = fixture()
    test('run', 'app', '--with-mocks')
    assert.equal(cds.root, '/root/app')
    await hooks[0]()
    assert.deepEqual(Array.from(calls[0]), ['--mocked', '--port', '0'])
  })

  it('keeps run without a project in the current root', async () => {
    const { test, cds, calls, hooks } = fixture()
    test('run', '--with-mocks')
    assert.equal(cds.root, '/root')
    await hooks[0]()
    assert.deepEqual(Array.from(calls[0]), ['--mocked', '--port', '0'])
  })

  it('translates with-mocks for explicit serve while preserving model arguments', async () => {
    const { test, cds, calls, hooks } = fixture()
    test('serve', 'CatalogService', '--with-mocks', '--port', '4004')
    await hooks[0]()
    assert.equal(cds.root, '/root')
    assert.deepEqual(Array.from(calls[0]), ['CatalogService', '--mocked', '--port', '4004'])
  })

  it('preserves default project startup and its in-memory fallback', async () => {
    const { test, cds, calls, hooks } = fixture()
    test('app', '--with-mocks')
    await hooks[0]()
    assert.equal(cds.root, '/root/app')
    assert.deepEqual(Array.from(calls[0]), ['--mocked', '--in-memory?', '--port', '0'])
  })

  it('translates the MTX shortcut to a core profile argument', async () => {
    const { test, calls, hooks } = fixture()
    test('run', 'app', '--with-mtx')
    await hooks[0]()
    assert.deepEqual(Array.from(calls[0]), ['--profile', 'with-mtx', '--port', '0'])
  })
})
