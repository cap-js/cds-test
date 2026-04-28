const cds_test = require('../../../lib/cds-test')

describe('Java integration', () => {
  const { GET, expect, cds } = cds_test(__dirname + '/..')

  it('serves Books via Java OData endpoint', async () => {
    const { data } = await GET`/odata/v4/catalog/Books`
    expect(data.value).to.exist
    expect(data.value.length).to.be.greaterThanOrEqual(1)
  })

  it('accesses database via HCQL proxy', async () => {
    const { Books } = cds.entities('bookshop')
    const data = await cds.ql`SELECT ID FROM ${Books}`
    expect(data.length).to.be.greaterThanOrEqual(1)
  })
})
