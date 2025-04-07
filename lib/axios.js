// require = id => module.require (id === 'axios' ? './naxios' : id) // eslint-disable-line no-global-assign

class AxiosProvider {

  get axios() {
    const http = require('node:http')
    const axios = require('axios')
    return super.axios = axios.create ({
      httpAgent: new http.Agent({ keepAlive: false}), //> https://github.com/nodejs/node/issues/47130
      headers: { 'content-type': 'application/json' },
      baseURL: this.url,
    })
  }

  set url (url) { // fill in baseURL when this.url is filled in subsequently on server start
    if (Object.hasOwn(this,'axios')) this.axios.defaults.baseURL = url
    super.url = url
  }

  options (..._) { return this.axios.options (..._args(_)) .catch(_error) }
  head    (..._) { return this.axios.head    (..._args(_)) .catch(_error) }
  get     (..._) { return this.axios.get     (..._args(_)) .catch(_error) }
  put     (..._) { return this.axios.put     (..._args(_)) .catch(_error) }
  post    (..._) { return this.axios.post    (..._args(_)) .catch(_error) }
  patch   (..._) { return this.axios.patch   (..._args(_)) .catch(_error) }
  delete  (..._) { return this.axios.delete  (..._args(_)) .catch(_error) }

  /** @type typeof self.options */ get OPTIONS() { return this.options .bind (this) }
  /** @type typeof self.head    */ get HEAD()    { return this.head    .bind (this) }
  /** @type typeof self.get     */ get GET()     { return this.get     .bind (this) }
  /** @type typeof self.put     */ get PUT()     { return this.put     .bind (this) }
  /** @type typeof self.post    */ get POST()    { return this.post    .bind (this) }
  /** @type typeof self.patch   */ get PATCH()   { return this.patch   .bind (this) }
  /** @type typeof self.delete  */ get DELETE()  { return this.delete  .bind (this) }
  /** @type typeof self.delete  */ get DEL()     { return this.delete  .bind (this) } //> to avoid conflicts with cds.ql.DELETE

}
const self = AxiosProvider.prototype // eslint-disable-line no-unused-vars


const _args = (args) => {
  const first = args[0], last = args.at(-1)
  if (first.raw) {
    if (first.at(-1) === '' && typeof last === 'object')
      return [ String.raw(...args.slice(0,-1)).trim(), last ]
    return [ String.raw(...args) ]
  }
  if (typeof first === 'string') return args
  else throw new Error (`Argument path is expected to be a string but got ${typeof first}`)
}

const _error = (e) => {
  if (e.errors) e = e.errors[0] // Node 20 sends AggregationErrors
  if (e.code === 'ERR_INVALID_URL') {// URL wasn't completed due to the non-started server
    Error.captureStackTrace(e, require('axios').Axios.prototype.request) // avoid stack clutter from Axios
    throw new Error (`It seems that the server was not started. Make sure to call 'cds.test(...)' or 'cds.test.run(...)'.`, {cause:e})
  }

  // Create new instance of Error to overcome AxiosError's inferior and cluttered output
  const err = new Error (e.message); err.code = e.code
  Object.defineProperty (err, 'response', { value: e.response, enumerable:false })
  Error.captureStackTrace (err, _error)
  // Add original error thrown by the service, if exists
  const o = err.response?.data?.error ; if (!o) throw err
  err.message = !o.code || o.code == 'null' ? o.message : `${o.code} - ${o.message}`
  // err.cause = o instanceof Error ? o : Object.assign (new Error, o)
  // Object.defineProperty (o, 'stack', { enumerable:false }) //> allow strict equal checks against {code,message}
  throw err
}

module.exports = AxiosProvider
