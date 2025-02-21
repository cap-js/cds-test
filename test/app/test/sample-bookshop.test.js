const cds_test = require ('../../..')
const describe = global.describe ?? require('node:test').describe

describe('Sample tests', () => {
  const { GET, expect } = cds_test (__dirname+'/..')

  it('serves Books', async () => {
    const { data } = await GET `/odata/v4/catalog/Books`
    expect(data.value.length).to.be.greaterThanOrEqual(5)
  })

})