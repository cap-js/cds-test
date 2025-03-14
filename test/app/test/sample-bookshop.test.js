const cds_test = require ('../../..')
const describe = global.describe ?? require('node:test').describe

describe('Sample tests', () => {
  const { GET, expect, cds } = cds_test (__dirname+'/..')

  it('serves Books', async () => {
    const { data } = await GET`/odata/v4/catalog/Books`
    expect(data.value.length).to.be.greaterThanOrEqual(5)
  })

  it('database Books', async () => {
    const { Books } = cds.entities('sap.capire.bookshop')
    const data = await cds.ql`SELECT ID FROM ${Books}`
    expect(data.length).to.be.greaterThanOrEqual(5)
  })

})