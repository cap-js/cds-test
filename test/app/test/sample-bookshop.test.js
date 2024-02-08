const cds = require ('@cap-js/cds-test')

describe('Sample tests from bookshop', () => {
  const { GET, expect, axios } = cds.test (__dirname+'/..')
  axios.defaults.auth = { username: 'alice', password: 'admin' }

  it('serves $metadata documents in v4', async () => {
    const { headers, status, data } = await GET `/browse/$metadata`
    expect(status).to.equal(200)
    expect(headers).to.contain({
      'content-type': 'application/xml',
      'odata-version': '4.0',
    })
    expect(data).to.contain('<EntitySet Name="Books" EntityType="CatalogService.Books">')
    expect(data).to.contain('<Annotation Term="Common.Label" String="Currency"/>')
  })

})