// Provide same global functions for jest and mocha
(function _support_jest_and_mocha() {
  const is_jest = !!global.beforeAll
  const is_mocha = !!global.before
  if (is_mocha) {
    global.beforeAll = global.before
    global.afterAll = global.after
    global.test = global.it
    // Adding test.each() and describe.each() to mocha
    const { format } = require('util')
    for (let td of [ 'test', 'describe' ]) global[td].each = function(table) {
      return (msg,fn) => Promise.all (table.map (each => {
        if (!Array.isArray(each))  each = [each]
        return this (format(msg,...each), ()=> fn(...each))
      }))
    }
  } else if (is_jest) { // it's jest
    global.before = (msg,fn) => global.beforeAll(fn||msg)
    global.after  = (msg,fn) => global.afterAll(fn||msg)
  } else { // it's none of both
    global.beforeAll  = global.before    = (msg,fn) => (fn||msg)()
    global.afterAll   = global.after     = (msg,fn) => global.cds?.repl?.on('exit',fn||msg)
    global.beforeEach = global.afterEach = ()=>{}
  }
})()

/**
 * Instances of this class are constructed and returned by cds.test().
 */
class Test extends require('./axios') {

  /**
   * Allows: const { GET, expect, test } = cds.test()
   */
  test = this

  get cds() { return require('@sap/cds') }
  get sleep() { return super.sleep = require('util').promisify(setTimeout) }
  get data() { return super.data = new (require('./data'))}

  /**
   * Launches a cds server with arbitrary port and returns a subclass which
   * also acts as an axios lookalike, providing methods to send requests.
   */
  run (folder_or_cmd, ...args) {

    switch (folder_or_cmd) {
      case 'serve': break // nothing to do as all arguments are given
      case 'run': if (args.length > 0) args.unshift('--project'); break
      default: this.in(folder_or_cmd); args.push('--in-memory?')
    }
    const {cds} = this

    // launch cds server...
    before (async ()=>{
      if (!args.includes('--port')) args.push('--port', '0')
      let { server, url } = await cds.exec(...args)
      this.server = server
      this.url = url
    })

    // gracefully shutdown cds server...
    after (()=>{
      console.debug('AFTER')
      this.server && cds.shutdown()
      // cds.service.providers = []
      // delete cds.services
      // delete cds.plugins
      // delete cds.env
    })

    return this
  }

  /**
   * Serving projects from subfolders under the root specified by a sequence
   * of path components which are concatenated with path.resolve().
   * Checks conflicts with cds.env loaded in other folder before.
   */
  in (folder, ...paths) {
    if (!folder) return this
    const {cds} = this, { isdir, local } = cds.utils
    // try to resolve folder relative to cds.root, or as a node module
    try {
      const path = require('path')
      folder = isdir (path.resolve (cds.root, folder, ...paths))
      || path.join (require.resolve (folder+'/package.json').slice(0,-13), ...paths)
    } catch(e) {
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
    if (this.server) {
      resolve({ server: this.server, url: this.url })
    } else {
      this.cds.once('listening', resolve)
    }
  }

  /**
   * Captures console.log output.
   */
  log (_capture, afterEach = global.afterEach) {
    const {console} = global, {format} = require('util')
    const log = { output: '' }
    beforeAll(()=> global.console = { __proto__: console,
      log: _capture ??= (..._)=> log.output += format(..._)+'\n',
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
  silent(){ this.log(()=>{},()=>{}); return this }
  /** @deprecated */ verbose(){ return this }


  /**
   * Lazily loads and returns an instance of chai
   */
  get chai() {
    let chai = require('chai')
    chai.use (require('chai-subset'))
    chai.use (require('chai-as-promised'))
    return chai
    function require (mod) { try { return module.require(mod) } catch(e) {
      if (e.code === 'MODULE_NOT_FOUND') throw new Error (`
      Failed to load required package '${mod}'. Please add it thru:
      npm add -D chai@4 chai-as-promised chai-subset
    `)}}
  }
  get assert() { return this.chai.assert }
  get expect() { return this.chai.expect }
  get should() { return this.chai.should() }
}


/** @type Test & ()=>Test */
const cds_test = module.exports = Object.assign ((..._) => (new Test).run(..._), { Test })

// Set prototype to allow usages like cds.test.in(), cds.test.log(), ...
Object.setPrototypeOf (cds_test, Test.prototype)
if (process.env.CDS_TEST_SILENT) cds_test.silent()
