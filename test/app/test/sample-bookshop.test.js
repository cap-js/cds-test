const cds_test = require('../../../lib/cds-test')
const describe = global.describe ?? require('node:test').describe

describe('Sample tests', () => {
  const { GET, expect, perf } = cds_test(__dirname+'/..')

  it('serves Books', async () => {
    const { data } = await GET`/odata/v4/catalog/Books`
    expect(data.value.length).to.be.greaterThanOrEqual(5)
  })

  it('measures Books', async () => {
    perf.report(await perf.GET `/odata/v4/catalog/Books`)
  })

})