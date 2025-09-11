// required for test.each in mocha and node --test
const {format} = require('util')
/**
 * @param {Array<unknown | unknown[]>} table
 */
module.exports = function each (table) {
  /**
   * @param {string} msg
   * @param {(...args: unknown[]) => unknown} fn
   * @return {Promise<unknown[]>}
   */
  return (msg,fn) => Promise.all (table.map (each => {
    const args = Array.isArray(each) ? each : [each], [label] = args
    // @ts-ignore - FIXME: this should be each(...) or this.exports(...)!!
    return this (format(msg, label), ()=> fn(...args))
  }))
}
