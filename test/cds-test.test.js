const cds = require ('@sap/cds/lib') // using cds/lib here to bypass @types
const cds_test = require ('..')
const Books = 'sap.capire.bookshop.Books'

describe('cds_test', ()=>{

  const { expect, test } = cds_test().in(__dirname,'app')

  it('should have started the server correctly', () => {
    const bookshop = cds.utils.path.resolve(__dirname,'app')
    expect (cds.env._home) .to.equal (bookshop)
    expect (cds.root) .to.equal (bookshop)
    expect (test.server).to.exist
    expect (test.server.address()).to.exist
    expect (test.url).to.match (/http:\/\/localhost:/)
  })

  it('should be thenable instances', async () => {
    expect (typeof test.then).to.equal('function')
    const { server, url } = await test
    expect (server).to.exist
    expect (server.address()).to.exist
    expect (url).to.match (/http:\/\/localhost:/)
  })

  it('should support cds and sleep', async()=> {
    const { cds:_cds, sleep } = test, t0 = Date.now()
    expect (_cds) .to.equal (cds)
    await sleep(12)
    expect (Date.now()) .to.be.greaterThanOrEqual (t0+11)
  })


  it('should support mocha', ()=> {
    expect (global.before).to.exist
    expect (global.after).to.exist
  })

  describe ('chai', ()=> {
    if (test.chai.fake) return it.skip ('chai is faked')

    it('should export chai', ()=> {
      expect (test.chai).to.exist
      expect (test.chai.expect).to.exist
      expect (test.chai.should).to.exist
      expect (test.chai.assert).to.exist
    })

    it('should support expect, assert', ()=> {
      expect (test.assert).to.exist
      expect (test.expect).to.exist
    })

    it('should support chai.except style', ()=>{
      const { expect } = test, foobar = {foo:'bar'}
      expect(foobar).to.have.property('foo')
      expect(foobar.foo).to.equal('bar')
    })

    it('should use chai.assert style', ()=>{
      const { assert } = test, foobar = {foo:'bar'}
      assert.property(foobar,'foo')
      assert.equal(foobar.foo,'bar')
    })

    it('should support chai.should style', ()=>{
      const { should } = test, foobar = {foo:'bar'}
      foobar.should.have.property('foo')
      foobar.foo.should.equal('bar')
      should.equal(foobar.foo,'bar')
    })

  })

  describe ('axios', ()=> {
    it('should support axios', ()=> {
      expect (test.axios).to.exist
      expect (test.get).to.exist
      expect (test.put).to.exist
      expect (test.post).to.exist
      expect (test.delete).to.exist
    })

    it('should support REST shortcuts', ()=> {
      const { GET,PUT,POST,PATCH,DEL} = test
      expect (GET).to.exist
      expect (PUT).to.exist
      expect (POST).to.exist
      expect (PATCH).to.exist
      expect (DEL).to.exist
    })
  })


  describe ('logs', ()=> {

    let log = test.log()

    it('should support capturing logs', ()=> {
      expect (log.output).to.exist
      expect (log.output.length).to.equal(0)
      console.log('foo') // eslint-disable-line no-console
      console.log('bar') // eslint-disable-line no-console
      expect (log.output.length).to.be.greaterThan(0)
      expect (log.output).to.contain('foo')
      expect (log.output).to.equal('foo\nbar\n')
    })

    it('should support log.clear()', ()=> {
      log.clear()
      expect (log.output).to.equal('')
    })

    it('should support log.release()', ()=> {
      log.release()
      console.log('foobar') // eslint-disable-line no-console
      expect (log.output).to.equal('')
    })

  })


  describe('data', () => {
    beforeEach (test.data.reset)

    it('should support data delete and reset', async()=> {
      const { data } = test
      const db = await cds.connect.to('db')
      expect(await db.run(SELECT.from(Books))).not.to.be.empty

      await data.delete()
      expect(await db.run(SELECT.from(Books))).to.be.empty

      await data.reset()
      expect(await db.run(SELECT.from(Books))).not.to.be.empty
    })

    it('data reset should be draft aware', async()=> {
      const { data } = test
      const { Books } = cds.entities('DraftService')
      const db = await cds.connect.to('db')
      expect(await db.run(SELECT.from(Books.drafts))).not.to.be.empty

      await data.delete()
      expect(await db.run(SELECT.from(Books.drafts))).to.be.empty

      await data.reset()
      expect(await db.run(SELECT.from(Books.drafts))).not.to.be.empty
    })


    it('should deploy data before first test', async () => {
      expect(await SELECT.from(Books)).not.to.be.empty
      await INSERT.into(Books).entries({ID: 4711, title: 'foo'})
      await DELETE.from(Books,201)
      expect(await SELECT.from(Books,4711)).to.exist
      expect(await SELECT.from(Books,201)).not.to.exist // gone
    })

    it('should reset data before each test', async () => {
      expect(await SELECT.from(Books)).not.to.be.empty
      expect(await SELECT.from(Books,201)).to.exist // here again
      expect(await SELECT.from(Books,4711)).not.to.exist // gone
    })
  })

  it('should error when server not started', async () =>{
    const { GET, expect } = cds_test
    await expect(GET `/foo`).to.be.rejectedWith(/not.*started.*cds\.test/is)
  })

})
