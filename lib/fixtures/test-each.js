// required for test.each in mocha and node --test
const {format} = require('util')
module.exports = function each (table) {
  return (msg,fn) => Promise.all (table.map (each => {
    const args = Array.isArray(each) ? each : [each], [label] = args
    return this (format(msg, label), ()=> fn(...args))
  }))
}
