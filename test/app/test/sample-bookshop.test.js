const cds_test = require('../../../lib/cds-test')
const describe = global.describe ?? require('node:test').describe

describe('Sample tests', () => {
  const { GET, expect } = cds_test('@cap-js/test-sample-app')

  it('serves Books', async () => {
    const { data } = await GET`/odata/v4/catalog/Books`
    expect(data.value.length).to.be.greaterThanOrEqual(5)
  })

})