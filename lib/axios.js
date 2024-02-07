const http = require('http')
class Axios {
  get axios() {
    const axios = require('axios').create ({
      headers: { 'Content-Type': 'application/json' },
      httpAgent: new http.Agent({ keepAlive: false}),
      baseURL: this.url,
    })
    // fill in baseURL on subsequent this.url = url, after server has started
    Reflect.defineProperty (this, 'url', { configurable: true, set: url => {
      Reflect.defineProperty (this, 'url', { value: url })
      axios.defaults.baseURL = url
    }})
    return super.axios = axios
  }
  get     (..._) { return this.axios.get     (..._args(_)) .catch(_error) }
  put     (..._) { return this.axios.put     (..._args(_)) .catch(_error) }
  post    (..._) { return this.axios.post    (..._args(_)) .catch(_error) }
  patch   (..._) { return this.axios.patch   (..._args(_)) .catch(_error) }
  delete  (..._) { return this.axios.delete  (..._args(_)) .catch(_error) }
  options (..._) { return this.axios.options (..._args(_)) .catch(_error) }

  /** @type typeof _.get     */ get GET()     { return this.get     .bind (this) }
  /** @type typeof _.put     */ get PUT()     { return this.put     .bind (this) }
  /** @type typeof _.post    */ get POST()    { return this.post    .bind (this) }
  /** @type typeof _.patch   */ get PATCH()   { return this.patch   .bind (this) }
  /** @type typeof _.delete  */ get DELETE()  { return this.delete  .bind (this) }
  /** @type typeof _.delete  */ get DEL()     { return this.delete  .bind (this) } //> to avoid conflicts with cds.ql.DELETE
  /** @type typeof _.options */ get OPTIONS() { return this.options .bind (this) }

}

const _args = (args) => {
  const first = args[0], last = args[args.length-1]
  if (first.raw) {
    if (first[first.length-1] === '' && typeof last === 'object')
      return [ String.raw(...args.slice(0,-1)), last ]
    return [ String.raw(...args) ]
  }
  else if (typeof first !== 'string')
    throw new Error (`Argument path is expected to be a string but got ${typeof first}`)
  return args
}

const _error = (e) => {
  Error.captureStackTrace (e,_error) //> adds the stack trace from caller code
  if (e.errors) e = e.errors[0] // Node 20 sends AggregationErros
  if (e.code && e.port === 80 /* default port */) throw Object.assign (e, {
    message:  e.message + '\nIt seems that the server was not started. Make sure to call \'cds.test(...)\' or \'cds.test.run(...)\'.',
    stack: null // stack is just clutter here
  })
  const { code, message } = e.response && e.response.data && e.response.data.error || {}
  if (message) e.message = code && code !== 'null' ? `${code} - ${message}` : message
  // Promote toJSON from prototype to own property to make it iterable
  // eslint-disable-next-line no-self-assign
  if (typeof jest !== 'undefined') e.toJSON = e.toJSON // REVISIT: what is this for?
  throw e
}

const _ = Axios.prototype // eslint-disable-line no-unused-vars
module.exports = Axios
