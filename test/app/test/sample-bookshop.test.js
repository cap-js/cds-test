const cds_test = require ('@cap-js/cds-test')

describe('Sample tests from bookshop', () => {
  const { GET, expect, axios } = cds_test (__dirname+'/..')
  axios.defaults.auth = { username: 'alice', password: 'admin' }

  it('serves $metadata documents in v4', async () => {
    const { data } = await GET `/browse/$metadata`
    expect(data).to.contain('<EntitySet Name="Books" EntityType="CatalogService.Books">')
    expect(data).to.contain('<Annotation Term="Common.Label" String="Currency"/>')
  })

})