const { inspect } = require('node:util')

/**
 * @param {{message: string, status: unknown, data: unknown, body?: any}} x
 */
const format = x => inspect(
  is.error(x) ? x.message
  : typeof x === 'object' && 'status' in x && 'body' in x ? { status: x.status, body: x.body }
  : typeof x === 'object' && 'status' in x && 'data' in x ? { status: x.status, data: x.data }
  : x,
  { colors: true, sorted: true, depth: 11 }
)


/**
 * @type {{
 *  (actual?: any): any,
 *   any: Function,
 *   stringMatching: (x: string | RegExp) => (a: string) => boolean,
 *   stringContaining: (x: string) => (a: string) => boolean,
 *   arrayContaining: (x: any[]) => (a: any[]) => boolean,
 *   objectContaining: (x: object) => (a: object) => boolean,
 *   fail: (actual: any, expected?: any, message?: string) => void,
 * }}
 */
const expect = module.exports = actual => {
  const chainable = function (x) {
    return this.call(x)
  }
  return Object.setPrototypeOf(chainable, new Assertion(actual))
}

/**
 * @template T
 * @typedef {(x?: any) => x is T} Is */

const is = new class {
  /** @type {Is<Array<unknown>>} */
  Array = Array.isArray
  /** @type {Is<Error>} */
  Error = x => x instanceof Error || x?.stack && x.message
  /** @type {Is<Symbol>} */
  Symbol = x => typeof x === 'symbol'
  /** @type {Is<Object>} */
  Object = x => typeof x === 'object' // && x && !is.array(x)
  /** @type {Is<String>} */
  String = x => typeof x === 'string' || x instanceof String
  /** @type {Is<Number>} */
  Number = x => typeof x === 'number' || x instanceof Number
  /** @type {Is<Boolean>} */
  Boolean = x => typeof x === 'boolean' || x instanceof Boolean
  /** @type {Is<Promise<unknown>>} */
  Promise = x => x instanceof Promise
  /** @type {Is<RegExp>} */
  RegExp = x => x instanceof RegExp
  /** @type {Is<Date>} */
  Date = x => x instanceof Date
  /** @type {Is<Set<unknown>>} */
  Set = x => x instanceof Set
  /** @type {Is<Map<unknown, unknown>>} */
  Map = x => x instanceof Map
  array = this.Array
  error = this.Error
  symbol = this.Symbol
  object = this.Object
  string = this.String
  number = this.Number
  boolean = this.Boolean
  promise = this.Promise
  regexp = this.RegExp
  date = this.Date
  set = this.Set
  map = this.Map
  /** Jest-style any matcher */

  /**
   * @param {{name: string} | string} type
   */
  any = expect.any = type => {
    if (type === undefined) return () => true
    // @ts-expect-error - we do not check if type is an actual valid checker (string, boolean, date, ...)
    else return this [type.name || type] || (x => x instanceof type)
  }
}

class Core {
  _not = false
  _own = false
  _deep = false
  _nested = false

  /** @param {any} actual */
  constructor (actual) { this._ = actual }

  /**
   * The central method to throw an AssertionError.
   * @param {any[] | TemplateStringsArray} args
   */
  expected ([a, be, ...etc], ...args) {
    const raw = [a, (this._not ? ' NOT' : '') + be, ...etc]
    const err = new expected({ raw }, ...args)
    // err.operator = be.trim().replace(/^to /,'')
    // err.expected = args[1]
    // err.actual = args[0]
    throw err
  }

  /** @param {any[] | TemplateStringsArray} args */
  should ([be, ...etc], ...args) {
    return this.expected(['', ' to ' + be, ...etc], this._, ...args)
  }

  /**
   * The central method to check assertions.
   * @param {(actual: any) => boolean} check
   * @param {(outcome: boolean) => any} [_fail]
   */
  assert (check, _fail = (_) => false) {
    const outcome = check(this._)
    if (this._not ? outcome : !outcome) return _fail(outcome)
    else return this
  }

  /** @param {Function & string} x */
  instanceof (x) {
    return this.assert(a => a instanceof x) || this.should`be an instance of ${x.name || x}`
  }

  /** @param {Function & string} x */
  kindof (x) {
    return this.assert(is.any(x)) || this.should`be kind of ${x?.name || x}`
  }

  /** @param {Function & string} x */
  equals (x, _fail = () => this.should`strictly equal ${x}`) {
    if (typeof x === 'function') return this.assert(x)
    if (this._deep) return this.eqls(x)
    return this.assert(a => a === x, _fail)
  }

  /** @param {Function & string} x */
  eqls (x, _fail = () => this.should`deeply equal ${x}`) {
    if (typeof x === 'function') return this.assert(x)
    return this.assert(a => compare(a, x, true), _fail)
  }

  /** @param {Function & string} x */
  subset (x, _fail = () => this.should`contain subset ${x}`) {
    return this.assert(a => {
      if (is.array(a) && is.array(x)) return x.every(x => a.some(o => compare(o,x)))
      if (is.array(a) && !is.array(x)) return a.some(o => compare(o,x))
      else return compare(a,x)
    }, _fail)
  }

  /** @param {Function & string} x */
  matches (x, _fail = () => this.should`match ${x}`) {
    return this.assert(a => {
      if (is.regexp(x)) return x.test(a)
      if (is.string(x)) return a.includes?.(x)
      if (is.object(x)) return this.subset(x) && !this._not //> to avoid doubled not
      // if (is.array(x)) return x.every(x => a.includes(x))
    }, _fail)
  }

  /** @param {Function & string} x */
  includes (x, _fail = () => this.should`include ${x}`) {
    return this.assert(a => {
      if (!a) expected`an array or string or set or object but got ${a}`
      if (is.string(a)) return a.includes(x)
      if (is.array(a)) return a.includes(x) || this._deep && a.some(o => compare(o,x))
      if (is.set(a)) return a.has(x)
      if (is.object(a)) return compare(a,x)
      return false
    }, _fail)
  }

  /** @param {Function & string} x */
  oneOf (x, _fail = () => this.should`be one of ${x}`) {
    return this.assert(a => x.includes(a), _fail)
  }

  /** @param {Function & string & { test?: Function }} x */
  throws (x, _fail = () => this.should`throw ${x}`) {
    if (is.promise(this._)) return this.rejectsWith(x)
    return this.assert(a => {
      if (typeof a === 'function') try { a(); return false } catch (err) { if (!x) return true; else this._= a = err }
      if (typeof x.test === 'function') return x.test(a)
      // @ts-expect-error - TS does not pick up on the type guard
      if (typeof x === 'function') return x(a)
      if (typeof x === 'string') return a == x || a.code == x || a.message?.includes(x)
      if (typeof x === 'object') return compare(a,x)
    }, _fail)
  }

  /** @param {Function & string} x */
  rejectsWith (x) {
    if (this._not) return Promise.resolve(this._).catch(
      e => expected`promise to be fulfilled but it was rejected with ${e}`
    )
    else return Promise.resolve(this._).then(
      y => expected`promise to be rejected but it was fulfilled with ${y}`,
      e => {
        if (x) expect(e).throws(x, () => expected`promise to be rejected with ${x} but got ${e}`)
        return e
      }
    )
  }

  // tricking TS into coercion so that numbers are allowed and can be passed on to should``
  /** @param {number & string} ln */
  length (ln) {
    return this.assert(a => (a.length ?? String(a).length) === ln, () => this.should`have length ${ln}`)
  }

  /**
   * @param {string | string[]} p
   * @param {any} [v]
   */
  property (p, v) {
    const has = !this._own ? (/** @type {object}*/ a, /** @type {string}*/ p) => a && typeof a === 'object' && p in a : Reflect.getOwnPropertyDescriptor
    /**
     * @param {Record<string, any>} a
     * @param {string} p
    */
    const get = (a, p) => has(a, p) ? a[p] : $not_found, $not_found = {}
    // FIXME: improve name.
    const y = this.assert(() => true) && !this._nested
      // @ts-expect-error - !this._nested => p is string
      ? get(this._, p)
      : (Array.isArray(p) ? p : p.split?.('.'))
        .reduce((a, p) => get(a, p), this._)
    if (y === $not_found) return this._not || (this._nested
      ? this.should`have nested property ${p}`
      : this.should`have property ${p}`)
    const that = Object.assign(expect(), this, { _: y })
    if (v !== undefined) return that.eqls(v, () => this._nested
      ? this.should`have nested property ${p} with value ${v}`
      : this.should`have property ${p} with value ${v}`)
    return that
  }

  /** @param {string[]} keys */
  keys (...keys) {
    if (is.array(keys[0])) keys = /** @type{string[]}*/(keys[0])
    return this.assert(a => keys.every(k => k in a)) || this.should`have all keys ${keys}`
  }

  /** @param {number} x */
  gt (x) { return this.assert(a => a > x) || this.should`be > ${x}` }
  /** @param {number} x */
  lt (x) { return this.assert(a => a < x) || this.should`be < ${x}` }
  /** @param {number} x */
  gte (x) { return this.assert(a => a >= x) || this.should`be >= ${x}` }
  /** @param {number} x */
  lte (x) { return this.assert(a => a <= x) || this.should`be <= ${x}` }
  /** @param {number} x */
  within (x, y) { return this.assert(a => x <= a && a <= y) || this.should`be within ${[x, y]}` }
}


class Chai extends Core {

  // linguistic chaining

  get to() { return this }
  get be() { this.call = this.equals; return this }
  get is() { this.call = this.equals; return this }
  get at() { return this }
  get of() { return this }
  get and() { return this }
  get but() { return this }
  get has() { this.call = this.property; return this }
  get have() { this.call = this.property; return this }
  get that() { return this }
  get does() { return this }
  get with() { return this }
  get also() { return this }
  get still() { return this }
  get which() { return this }
  get eventually() {
    this.assert = (fn, _fail) => Promise.resolve(this._).then(a => expect(a).assert(fn, _fail))
    return this
  }

  // flags changing behaviour of subsequent methods in the chain

  get not() { this._not = true; return this }
  get own() { this._own = true; return this }
  get deep() { this._deep = true; return this }
  get nested() { this._nested = true; return this }
  get ordered() { return unsupported() }
  get any() { return unsupported() }
  get all() { return this }

  get undefined() { return this.assert(a => a === undefined) || this.should`be undefined` }
  get exist() { return this.assert(a => a != undefined) || this.should`exist` }
  get truthy() { return this.assert(a => !!a) || this.should`be truthy` }
  get falsy() { return this.assert(a => !a) || this.should`be falsy` }
  get null() { return this.assert(a => a === null) || this.should`be ${null}` }
  get true() { return this.assert(a => a === true) || this.should`be ${true}` }
  get false() { return this.assert(a => a === false) || this.should`be ${false}` }
  // @ts-expect-error - FIXME: this is always false due to precedence!
  get empty() { return this.assert((/** @type {{length: number}} */a) => !a?.length === 0 || Object.keys(a).length === 0) || this.should`be empty` }
  get NaN() { return this.assert(a => isNaN(a)) || this.should`be ${NaN}` }
  get ok() { return this.truthy }

  get containSubset() { return this.subset }
  get contains() { return new Proxy (this.includes,{
    get: (fn,k) => {
      if (k === 'deep') {
        this._deep = fn
        return (...args) => fn.call(this,...args)
      }
      else return fn[k]
    },
    apply: (fn,t,args) => fn.call (this,...args)
  })}
  get contain() { return this.contains }
  get include() { return this.contains }
  get match() { return this.matches }
  get equal() { return this.equals }
  get eq() { return this.equals }
  get eql() { return this.eqls }
  // @ts-expect-error - FIXME! This is probably actually missing!
  get exists() { return this.defined }
  get lengthOf() { return this.length }
  get instanceOf() { return this.instanceof }
  get kindOf() { return this.kindof }
  get kind() { return this.kindof }
  get an() { this.call = this.kindof; return this }
  get a() { this.call = this.kindof; return this }
  get key() { return this.keys }

  get below() { return this.lt }
  get above() { return this.gt }
  get most() { return this.lte }
  get least() { return this.gte }
  get lessThan() { return this.lt }
  get greaterThan() { return this.gt }
  get lessThanOrEqual() { return this.lte }
  get greaterThanOrEqual() { return this.gte }

  get throw() { return this.throws }
  get fulfilled() { return this.not.rejectsWith() }
  get rejected() { return this.rejectsWith() }
  get rejectedWith() { return this.rejectsWith }
}


class Jest extends Chai {

  get resolves() { return this.eventually }
  get rejects() { return this.eventually }
  get toBe() { return this.equals }
  get toEqual() { return this.eqls }
  get toMatch() { return this.matches }
  get toMatchObject() { return this.matches }
  get toContainEqual() { return this.deep.includes }
  get toContain() { return this.includes }
  get toThrow() { return this.throws }
  get toThrowError() { return this.throws }
  get toBeGreaterThan() { return this.gt }
  get toBeLessThan() { return this.lt }
  get toBeGreaterThanOrEqual() { return this.gte }
  get toBeLessThanOrEqual() { return this.lte }
  get toHaveProperty() { return this.nested.property }
  get toHaveLength() { return this.length }

  toBeNull() { return this.null }
  toBeFalsy() { return this.falsy }
  toBeTruthy() { return this.truthy }
  // @ts-expect-error - FIXME! This is probably actually missing!
  toBeDefined() { return this.defined }
  toBeUndefined() { return this.undefined }
  toBeInstanceOf() { return this.instanceof }
  toMatchSnapshot() { unsupported('toMatchSnapshot') }

  // mocking
  toHaveBeenCalled() {
    return this.assert (
      fn => fn.mock.callCount() > 0,
      () => this.should`have been called at least once`
    )
  }
  /**
   * @param {number} count
   */
  toHaveBeenCalledTimes (count) {
    return this.assert (
      fn => count === fn.mock.callCount(),
      () => this.should`have been called ${count} times, but was called ${this._.mock.callCount()} times`
    )
  }
  /**
   * @param  {...any} args
   */
  toHaveBeenCalledWith (...args) {
    return this.assert (
      fn => fn.mock.calls.some(c => compare(c.arguments,args,true)),
      () => this.should`have been called with ${args}`
    )
  }
  /**
   * @param  {...any} args
   */
  toHaveBeenLastCalledWith (...args) {
    return this.assert (
      fn => compare(fn.mock.calls.at(-1).arguments,args,true),
      () => this.should`have been last called with ${args}`
    )
  }

  static expect() {
    expect.stringMatching = x => a => (is.regexp(x) ? x : RegExp(x)).test?.(a)
    expect.stringContaining = x => a => a?.includes(x)
    expect.arrayContaining = x => a => x.every(e => a.includes(e))
    expect.objectContaining = x => a => compare(a,x)
    expect.any = is.any
  }
}
Jest.expect()


class Assertion extends Jest {
  toString() { return `[ expect: ${format(this._)} ]` }
}


class AssertionError extends Error {
  /**
   * @param {string} m - message
   */
  // @ts-expect-error - super(...) usually returns void (in this case it returns Error, so it is fine to do)
  constructor (m, caller = Assertion.prototype.should) { Error.captureStackTrace (super(m), caller) }
  get caller() { return Assertion.prototype.should }
  get code() { return 'ERR_ASSERTION' }
}

// function AssertionError(m){
//   Error.captureStackTrace (this,this.caller)
//   this.message = m
// }
// AssertionError.prototype = Object.create (Error.prototype, {constructor:{value: AssertionError }})
// AssertionError.__proto__ = Error


expect.fail = function (actual, expected, message) {
  if (arguments.length === 1) throw new AssertionError (actual, expect.fail)
  if (arguments.length === 3) throw Object.assign (new AssertionError (message, expect.fail), { expected, actual })
}

/**
 * @param {{ raw: readonly string[] | ArrayLike<string>; }} strings
 * @param  {...any} args
 */
function expected (strings, ...args) {
  const err = new AssertionError ('expected ' + String.raw(strings, ...args.map(format)))
  if (new.target) return err; else throw err
}

/**
 * @param {string} [method]
 */
function unsupported (method) {
  // @ts-expect-error - skip not picked up by type system even when explicitly typed
  const ignore = unsupported.skip ??= (process.env._chest_skip || '')?.split(',').reduce((p, c) => (p[c] = 1, p), /** @type{Record<string,any>} */({}))
  if (!method) return new Error(`unsupported`)
  if (method in ignore) return () => { }
  else throw new Error(`
    Method expect .${method}() is not yet supported.
    Use --skip ${method} to skip checks.
  `)
}

/**
 * @param {*} a
 * @param {*} b
 * @param {boolean} [strict]
 */
function compare (a, b, strict) {
  if (a == b) return true
  if (Buffer.isBuffer(a)) return Buffer.isBuffer(b) && a.equals(b)
  return function _recurse (a, b) {
    if (!a || typeof a !== 'object') return false
    if (!b || typeof b !== 'object') return false
    if (strict)
      for (let k of Object.keys(a)) if (!(k in b))
        return false
    for (let k in b) {
      const v = a[k], x = b[k]; if (v === x) continue
      if (typeof x === 'function') { if (x(v)) continue; else return false }
      if (!_recurse(v, x)) return false
    }
    return true
  }(a, b)
}
