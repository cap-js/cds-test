const {Readable} = require('stream')

class Naxios {
  /**
   * @type {{
   *   headers?: object,
   *   duplex?: string,
   *   auth?: {username: string, password: string},
   *   body?: string | Readable,
   *   url?: string,
   *   baseURL?: string,
   *   validateStatus?: (status: number) => boolean,
   * }}
   */
  defaults = {}

  /**
   * @param {object} defaults
   */
  constructor (defaults) { this.defaults = { ...axios.defaults, ...defaults } }
  /**
   * @param {object} defaults
   */
  create (defaults) { return new Naxios (defaults) }


  /**
   * @param {string} url
   * @param {Parameters<Naxios['options4']>[number]} [config]
   */
  options (url, config)     { return this.request ({ method:'OPTIONS', url, ...config }) }
  head (url, config)        { return this.request ({ method:'HEAD', url, ...config }) }
  get (url, config)         { return this.request ({ method:'GET', url, ...config }) }
  put (url, data, config)   { return this.request ({ method:'PUT', url, ...config, data }) }
  post (url, data, config)  { return this.request ({ method:'POST', url, ...config, data }) }
  patch (url, data, config) { return this.request ({ method:'PATCH', url, ...config, data }) }
  delete (url, config)      { return this.request ({ method:'DELETE', url, ...config }) }

  /**
   * Mimics the axios.request() method, translating it to fetch() API
   * @param {Parameters<Naxios['options4']>[number] & { method: string, url: string }} config
   */
  async request (config) {

    const o = this.options4 (config)
    const response = await fetch (o.url, o)

    // Axios eagerly reads the response body
    response.data = await this.data4 (response, o)

    // Axios headers can be accessed as object properties
    for (let [k,v] of response.headers.entries())
      // @ts-expect-error - index access is always legal
      response.headers[k.toLowerCase()] = v

    // Axios throws errors for 4xx and 5xx responses
    let ok = o.validateStatus ??= (/** @type {number}*/status) => status >= 200 && status < 300 // default
    if (!ok(response.status)) throw Object.assign (new Error, { response }, response.data.error || {
      code: response.status,
      message: response.statusText,
    })

    return response
  }


  /**
   * Turn axios configs into fetch() options
   * @param {object} parameters
   * @param {string} parameters.url
   * @param {ConstructorParameters<typeof URLSearchParams>} parameters.params
   * @param {'arraybuffer' | 'document' | 'json' | 'text' | 'stream'} [parameters.responseType]
   * @param {object | string | Readable} [parameters.data]
   * @param {object} parameters.headers
   * @param {function(string): any} [parameters.transformResponse]
   * @param {any} [parameters.rest]
   */
  options4 ({ url, params, data, headers, ...rest }) {
    const o = { ...this.defaults, ...rest, headers: new Headers (this.defaults.headers) }
    if (headers) for (let [k,v] of Object.entries(headers)) o.headers.set(k,v)
    if (o.auth) o.headers.set('Authorization', 'Basic ' + btoa (o.auth.username + ':' + o.auth.password||''))
    if (data) o.body =
      typeof data === 'string' ? data :
      data instanceof Readable ? data :
      JSON.stringify(data)
    if (params) url += '?' + new URLSearchParams (params)
    o.url = (o.baseURL||'') + (url[0]==='/'?'':'/') + url
    return o
  }


  /**
   * Turn fetch() response into axios response
   * @param {Response} res
   * @param {{
   *  transformResponse: (value: string) => string | PromiseLike<string>,
   *  responseType: 'arraybuffer' | 'document' | 'json' | 'text' | 'stream' | string
   * }} o
   */
  data4 (res, o) {
    if (o.transformResponse) return res.text().then(o.transformResponse)
    else switch (o.responseType) {
      case 'stream':      return res.body
      case 'json':        return res.json()
      case 'text':        return res.text()
      case 'document':    return res.text()
      case 'arraybuffer': return res.arrayBuffer()
    }
    const ct = res.headers.get('content-type') ?? ''
    if (/stream|image|pdf|tar/.test(ct)) return res.body
    if (/xml/.test(ct)) return res.text()
    else return res.text().then(x => {
      try { return JSON.parse(x) }
      catch { return x }
    })
  }
}

/**
 * The standard default axios instance
 */
const axios = exports = module.exports = Object.setPrototypeOf (
  /**
   * @param {string | object} url
   * @param {object} [config]
   */
  function (url, config) {
    // @ts-expect-error - FIXME: passing a string url to the constructor will deconstruct in an unexpected way!
    if (new.target) return new Naxios (url)
      else config = typeof url === 'object' ? url : { url, ...config }
    return axios.request (config)
}, Naxios.prototype)


/**
 * Also supports tests using the like of:
 * @example
 *   const { ..., axios } = cds.test //...
 *   axios.defaults.auth = { username:'alice' }
 */
exports.defaults = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  duplex: 'half',
}


/**
 * Not supporting interceptors yet, but ensures code that uses them doesn't break
 */
exports.interceptors = {
  request: { use(){}, eject(){} },
  response: { use(){}, eject(){} },
}
