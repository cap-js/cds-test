const cds = require ('@sap/cds/lib')
const { path, isdir, local, fs } = cds.utils


/**
 * Instances of this class are constructed and returned by cds.test().
 */
class Test extends require('./xaxios') {

  /**
   * Allows: const { GET, expect, test } = cds.test()
   */
  get test() { return this }
  get sleep() { return super.sleep = require('node:timers/promises').setTimeout }
  get data() { return super.data = require('./data') }
  get cds() { return cds }


  /**
   * Launches a cds server with arbitrary port and returns a subclass which
   * also acts as an axios lookalike, providing methods to send requests.
   */
  run (folder_or_cmd, ...args) {

    switch (folder_or_cmd) {
      case 'serve': break // nothing to do as all arguments are given
      case 'run': if (args.length > 0) args.unshift ('--project'); break
      default: this.in(folder_or_cmd); args.push ('--in-memory?')
    }

    const self = this

    before (async function () {
      // -> launch cds server

      const pomFile = path.join(cds.root, cds.env.folders.srv, 'pom.xml')
      const hasPom = fs.existsSync(pomFile)
      const isJava = hasPom || cds.env.profiles.includes('java')
      
      if (isJava && !cds.env.profiles.includes('node')) {
        const { spawnSync } = require('child_process')
        if (hasPom) process.env.CDS_ENV = 'java'
        const mvnOk  = spawnSync('mvn',  ['--version'], { stdio: 'pipe', shell: true }).status === 0
        const javaOk = spawnSync('java', ['-version'],  { stdio: 'pipe', shell: true }).status === 0
        if (!mvnOk || !javaOk) {
          const missing = [!mvnOk && 'mvn', !javaOk && 'java'].filter(Boolean).join(', ')
          throw cds.error(`Unable to find ${missing}: Can't run Java tests.`)
        }

        this?.timeout?.(30000)
        global.jest?.setTimeout?.(30000)

        cds.exec // trigger lazy getter to make the property writable
        cds.exec = require('./java').bind(self)
      }

      process.env.cds_test_temp = path.resolve (cds.root,'_out',''+process.pid)
      if (!args.includes('--port')) args.push ('--port', '0')

      let { server, url } = await cds.exec (...args)
      self.server = server
      self.url = url
    })

    // gracefully shutdown cds server...
    after (()=> Promise.all([
      cds.utils.rimraf (process.env.cds_test_temp),
      cds.shutdown(),
    ]))

    return this
  }


  /**
   * Serving projects from subfolders under the root specified by a sequence
   * of path components which are concatenated with path.resolve().
   * Checks conflicts with cds.env loaded in other folder before.
   */
  in (folder, ...paths) {
    if (!folder) return this
    // try to resolve folder relative to cds.root, or as a node module
    try {
      folder = isdir (path.resolve (cds.root, folder, ...paths))
      || path.join (require.resolve (folder+'/package.json').slice(0,-13), ...paths)
    } catch {
      throw cds.error (`No such folder or package '${process.cwd()}' -> '${folder}'`)
    }
    // Check if cds.env was loaded before running cds.test in different folder
    if (process.env.CDS_TEST_ENV_CHECK) {
      const env = Reflect.getOwnPropertyDescriptor(cds,'env')?.value
      if (env && env._home !== folder && env.stack) {
        let filter = line => !line.match(/node_modules\/jest-|node:internal/)
        let err = new Error; err.message =
          `Detected cds.env loaded before running cds.test in different folder: \n` +
          `1. cds.env loaded from:  ${local(cds.env._home)||'./'} \n` +
          `2. cds.test running in:  ${local(folder)} \n\n` +
          err.stack.split('\n').filter(filter).slice(1).join('\n')
        err.stack = env.stack.split('\n').filter(filter).slice(1).join('\n')
        throw err
      }
    }
    cds.root = folder
    return this
  }


  /**
   * Method to spy on a function in an object, similar to jest.spyOn().
   */
  spy (o,f) {
    const origin = o[f]
    const fn = function (...args) {
      ++fn.called
      return origin.apply(this,args)
    }
    fn.called = 0
    fn.restore = ()=> o[f] = origin
    return o[f] = fn
  }


  /**
   * For usage in repl, e.g. var test = await cds.test()
   */
  then (resolve) {
    if (this.server) resolve ({ server: this.server, url: this.url })
    else cds.once ('listening', resolve)
  }


  /**
   * Captures console.log output.
   */
  log (_capture) {
    const {console} = global, {format} = require('util')
    const log = { output: '' }
    beforeAll (()=> global.console = { __proto__: console,
      log: _capture ??= (..._) => log.output += format(..._)+'\n',
      info: _capture,
      warn: _capture,
      debug: _capture,
      trace: _capture,
      error: _capture,
      timeEnd: _capture, time: ()=>{},
    })
    afterAll (log.release = ()=>{ log.output = ''; global.console = console })
    afterEach (log.clear = ()=>{ log.output = '' })
    return log
  }


  /**
   * Silences all console log output, e.g.: CDS_TEST_SILENT=y jest/mocha ...
   */
  silent(){
    global.console = { __proto__: console,
      log: ()=>{},
      info: ()=>{},
      warn: ()=>{},
      debug: ()=>{},
      trace: ()=>{},
      error: ()=>{},
      time: ()=>{},
      timeEnd: ()=>{},
    }
    return this
  }


  /** 
   * Returns `chai.expect` function, or a lookalike.
   * @returns {import('./expect')} 
   */ 
  get expect() { return this.chai.expect }

  /** @deprecated */ get assert() { return this.chai.assert }
  /** @deprecated */ get should() { return this.chai.should() }
  /** @deprecated */ get chai() { return super.chai = require('./chai') }
}


/** @type Test & ()=>Test */
module.exports = exports = Object.assign ((..._) => (new Test).run(..._), { Test })

// Set prototype to allow usages like cds.test.in(), cds.test.log(), ...
Object.setPrototypeOf (exports, Test.prototype)


/**
 * Provide same global functions for node --test, jest, mocha, and vitest, 
 * to allow running tests with any of these runners without changing test code. 
 * Note that cds.test() must be called before importing test code to ensure the 
 * correct runner is detected and supported.
 */
exports.runner ??= function _support_jest_and_mocha() {
  
  // Determine the test runner we are running in...
  const runner = (
    global.cds?.repl              ? 'repl' :
    process.env.CDS_TEST_FAKE     ? 'repl' :
    '__vitest_index__' in global  ? 'vitest' :
    'beforeAll' in global         ? 'jest' :
    'before' in global            ? 'mocha' :
    /* else */                      'node-test'
  )

  // Load support for the detected runner, which will define global test 
  // functions like describe(), it(), expect(), ...
  require ('./fixtures/'+runner+'.js')

  // Silence test output by default if not explicitly disabled, 
  // to avoid cluttering CI logs, but allow it for mocha which 
  const { CDS_TEST_SILENT } = process.env; if (/true|y|1/.test(CDS_TEST_SILENT)) exports.silent()
  else if (CDS_TEST_SILENT !== 'false' && runner === 'node-test') exports.silent()
  else if (CDS_TEST_SILENT !== 'false' && runner === 'mocha') exports.silent()
  
  return runner
}()
