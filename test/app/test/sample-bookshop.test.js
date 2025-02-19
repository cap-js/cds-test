const cds_test = require ('../../../lib/cds-test')
const { describe } = require('node:test')

describe('Sample tests', () => {
  const { GET, expect } = cds_test (__dirname+'/..')

  it('serves Books', async () => {
    const { data } = await GET `/odata/v4/catalog/Books`
    expect(data.value.length).to.be.greaterThanOrEqual(5)
  })

})