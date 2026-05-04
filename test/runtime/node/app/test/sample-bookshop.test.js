const cds_test = require('../../../../../lib/cds-test')

describe('Sample tests', () => {
  const { GET, expect, cds } = cds_test (__dirname+'/..')

  it('serves Books', async () => {
    const { data } = await GET`/odata/v4/catalog/Books`
    expect(data.value.length).to.be.greaterThanOrEqual(5)
    expect(data.value).to.containSubset([
      { title: 'Wuthering Heights' },
      { title: 'The Raven' },
    ])
  })

  it('database Books', async () => {
    const { Books } = cds.entities('sap.capire.bookshop')
    const data = await cds.ql`SELECT ID FROM ${Books}`
    expect(data.length).to.be.greaterThanOrEqual(5)
  })

})