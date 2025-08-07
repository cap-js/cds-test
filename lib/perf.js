const cds = require('@sap/cds')
const { LIGHT_GRAY: GREEN, DIMMED, RESET } = require('@sap/cds/lib/utils/colors')

const DEFAULTS = {
  warmup: {
    duration: '1s',
  },
  duration: '3s',
  connections: 3,
}

class Performance {
  constructor(test) {
    this._test = test
    this._reports = 0
  }

  get autocannon() {
    const autocannon = require('autocannon')
    super._histUtil = require('autocannon/lib/histUtil')
    super._aggregateResult = require('autocannon/lib/aggregateResult')
    super._timestring = require('timestring')
    return super.autocannon = function () {
      (this._collection ??= []).push(arguments[0])
      return {
        then: (resolve, reject) => {
          this._collection = []
          autocannon(...arguments).then(resolve, reject)
        }
      }
    }
  }
  fn(..._) { return this._run(this._args('FN', _)) }
  get(..._) { return this.autocannon(this._args('GET', _)) }
  put(..._) { return this.autocannon(this._args('PUT', _)) }
  post(..._) { return this.autocannon(this._args('POST', _)) }
  patch(..._) { return this.autocannon(this._args('PATCH', _)) }
  delete(..._) { return this.autocannon(this._args('DELETE', _)) }
  options(..._) { return this.autocannon(this._args('OPTIONS', _)) }

  /** @type typeof _.options */ get FN() { return this.fn.bind(this) }
  /** @type typeof _.get     */ get GET() { return this.get.bind(this) }
  /** @type typeof _.put     */ get PUT() { return this.put.bind(this) }
  /** @type typeof _.post    */ get POST() { return this.post.bind(this) }
  /** @type typeof _.patch   */ get PATCH() { return this.patch.bind(this) }
  /** @type typeof _.delete  */ get DELETE() { return this.delete.bind(this) }
  /** @type typeof _.delete  */ get DEL() { return this.delete.bind(this) } //> to avoid conflicts with cds.ql.DELETE
  /** @type typeof _.options */ get OPTIONS() { return this.options.bind(this) }

  _args(METHOD, args) {
    const first = args[0], last = args[args.length - 1]
    if (first.raw) {
      if (first[first.length - 1] === '' && typeof last === 'object')
        return this._defaults(METHOD, last, { url: String.raw(...args.slice(0, -1)) })
      return this._defaults(METHOD, { url: String.raw(...args) })
    }
    else if (typeof first === 'string') args[0] = { url: first }
    else if (typeof first === 'function') args[0] = { fn: first, title: first.name }
    else if (typeof first !== 'string')
      throw new Error(`Argument path is expected to be a string or function but got ${typeof first}`)
    return this._defaults(METHOD, ...args)
  }

  _defaults(method = 'GET', ...opts) {
    let fn
    if (typeof method === 'function') fn = method

    const o = Object.assign({ fn, method }, DEFAULTS, ...opts)
    if (o.url) {
      o.title ??= o.url
      const { auth } = this._test.axios.defaults
      o.headers ??= {}
      if (auth) {
        o.headers.authorization = `Basic ${btoa(`${auth.username}:${auth.password}`)}`
      }
      const { baseURL } = this._test.axios.defaults || ''
      const sep = baseURL.at(-1) !== '/' && o.url?.[0] !== '/' ? '/' : ''
      o.url = /^https?:/.test(o.url) ? o.url : `${baseURL}${sep}${o.url}`
    }
    return o
  }

  async _run(opts) {
    this.autocannon

    let { fn, args } = opts
    if (args) fn = fn.bind(null, ...args)

    if (opts.warmup) await this._run({ ...opts, fn, args: undefined, ...opts.warmup, warmup: undefined })

    const { getHistograms, encodeHist } = this._histUtil

    const histograms = getHistograms(opts.histograms)
    const { latencies, requests, throughput } = histograms

    const statusCodeStats = {}

    let stop = false
    let count = 0
    let errors = 0
    let nextTrack
    let totalRequests = 0
    let totalCompletedRequests = 0

    const runners = new Array(opts.connections)

    const startTime = process.hrtime.bigint()
    const endTime = startTime + BigInt((typeof opts.duration === 'string' ? this._timestring(opts.duration) : opts.duration) * 1e9)

    for (let r = 0; r < runners.length; r++) {
      runners[r] = run()
    }
    await Promise.all(runners)

    const result = {
      latencies: encodeHist(latencies),
      requests: encodeHist(requests),
      throughput: encodeHist(throughput),
      totalCompletedRequests,
      totalRequests,
      totalBytes: 0,
      samples: Math.floor(Number(process.hrtime.bigint() - startTime) / 1e9),
      errors,
      timeouts: 0,
      mismatches: 0,
      non2xx: Object.keys(statusCodeStats).reduce((l, c) => l + (c[0] === '2' ? 0 : statusCodeStats[c]), 0),
      statusCodeStats,
      resets: 0,
      duration: Number(process.hrtime.bigint() - startTime) / 1e9,
      start: new Date(Number(startTime)),
      finish: new Date(),
      '1xx': 0,
      '2xx': statusCodeStats['200']?.count || 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': statusCodeStats['500']?.count || 0,
    }

    return this._aggregateResult(result, opts, histograms)

    async function run() {
      while (!stop) {
        const now = process.hrtime.bigint()
        if (!nextTrack) nextTrack = now + BigInt(1e9)
        if (now >= nextTrack) {
          nextTrack = now + BigInt(1e9)
          requests.recordValue(count)
          count = 0
        }

        if (now >= endTime) {
          stop = true
          break
        }

        totalRequests++
        try {
          const s = process.hrtime.bigint()

          const ret = fn()
          if (ret?.then) await ret;

          const d = process.hrtime.bigint() - s
          latencies.recordValue(Number(d) / 1000000)

          count++
          totalCompletedRequests++
          (statusCodeStats['200'] ??= { count: 0 }).count++
        } catch {
          errors++
          (statusCodeStats['500'] ??= { count: 0 }).count++
        }
      }
    }
  }

  async _report(result, options = {}) {
    if (this._collection?.length) {
      const { baseURL } = this._test.axios.defaults || ''
      const requests = this._collection.map(req => {
        return {
          path: req.url.replace(baseURL, ''),
          method: req.method
        }
      })
      const title = requests.map(req => req.path).join(' + ')
      result = await this.autocannon(this._defaults(null, {
        title,
        url: baseURL,
        requests,
      }))
    }

    let { requests, latency, throughput, title = `${this._reports++}` } = result

    // Collect the result into a file for further processing later
    if (options.store) {
      result.file = cds.utils.path.relative(process.cwd(), require.main.filename)
      const stack = {}
      Error.captureStackTrace(stack)
      result.line = /:(\d*:\d*)\)/.exec(stack.stack.split('\n').find(l => l.indexOf(result.file) > -1))?.[1]

      const benchmark = `${result.file}:${title}`
      cds.utils.fs.writeFileSync(cds.utils.path.resolve(process.cwd(), 'results.bench'), `${JSON.stringify({ [benchmark]: result })}\n`, { flag: 'a' })
    }

    // TODO: determine a good default report format of the available measured information
    console.log( // eslint-disable-line no-console
      title.padEnd(50),
      GREEN + (requests.average >>> 0).toLocaleString().padStart(5), DIMMED + 'req/s' + RESET,
      GREEN + (throughput.average / 1024 / 1024 >>> 0).toLocaleString().padStart(5), DIMMED + 'MiB/s' + RESET,
      GREEN + (latency.average >>> 0).toLocaleString().padStart(5), DIMMED + 'ms' + RESET,
    )
  }
  /** @type typeof _._report */ get report() { return this._report.bind(this) }

}

// ? const _ = Performance.prototype // eslint-disable-line no-unused-vars
module.exports = Performance