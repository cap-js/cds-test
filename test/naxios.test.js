const assert = require('node:assert/strict')
const axios = require('../lib/naxios')
require('..') // install the test-runner globals

describe('naxios request bodies', () => {
  for (const [data, expected] of [[0, '0'], [false, 'false']]) {
    it(`serializes ${data} as a JSON request body`, () => {
      const options = axios.options4({ url: '/echo', method: 'POST', data })
      assert.equal(options.body, expected)
      assert.equal(options.headers.get('Content-Type'), 'application/json')
    })
  }

  it('keeps null and undefined request data bodyless', () => {
    for (const data of [null, undefined]) {
      const options = axios.options4({ url: '/echo', method: 'POST', data })
      assert.equal(options.body, undefined)
    }
  })
})
