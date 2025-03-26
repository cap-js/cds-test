/* eslint-disable no-console */
const expect = require('../lib/expect')
const describe = global.describe ?? require('node:test').describe
const it = global.it ?? require('node:test').it

describe (`supported chai features subset ...`, ()=>{

  it ('supports language chains', ()=>{
    expect(1).equals(1)
    expect(1).equals(1)
    expect(1).to.equal(1)
    expect(1).to.be.a(Number)
    expect('test').to.be.a('string')

    expect({foo:11})
    .to.have.a.property ('foo')
    .which.is.a (Number)
    .that.is.within (10,12)
    .does.equal (11)
    .and.also.eqls ('11')
    .but.still.not.equals ('11')
  })

  it ('supports .not', ()=>{
    expect(function () {}).to.not.throw()
    expect({a:1}).to.not.have.property('b')
    expect([1, 2]).to.be.an('array').that.does.not.include(3)
    expect(2).to.equal(2); // Recommended
    expect(2).to.not.equal(1); // Not recommended
  })

  it ('supports .deep', ()=>{
    // Target object deeply (but not strictly) equals `{a:1}`
    expect({a:1}).to.deep.equal({a:1})
    expect({a:1}).to.not.equal({a:1})

    // Target array deeply (but not strictly) includes `{a:1}`
    expect([{a:1}]).to.deep.include({a:1})
    expect([{a:1}]).to.not.include({a:1})

    // Target object deeply (but not strictly) includes `x:{a:1}`
    expect({x:{a:1}}).to.deep.include({x:{a:1}})
    // expect({x:{a:1}}).to.not.include({x:{a:1}}) // FIXME expect test

    // Target object deeply (but not strictly) has property `x:{a:1}`
    expect({x:{a:1}}).to.have.deep.property('x', {a:1})
    // expect({x:{a:1}}).to.not.have.property('x', {a:1}) // FIXME expect test
  })

  it ('supports .a/.an', ()=>{
    expect('foo').to.be.kindof('string')
    expect('foo').to.be.a('string')
    expect({a:1}).to.be.an('object')
    // expect(null).to.be.a('null')
    // expect(undefined).to.be.an('undefined')
    expect(new Error).to.be.an('error')
    expect(Promise.resolve()).to.be.a('promise')
    // expect(new Float32Array).to.be.a('float32array')
    expect(Symbol()).to.be.a('symbol')

    // It’s often best to use .a to check a target’s type before making
    // more assertions on the same target...
    expect([1, 2, 3]).to.be.an('array').that.includes(2)
    expect({}).to.be.an('object').that.is.empty
    expect([]).to.be.an('array').that.is.empty
    expect('').to.be.a('string').that.is.empty
    expect('foo').to.be.a('string').that.is.not.empty

    expect('foo').to.be.a('string'); // Recommended
    expect('foo').to.not.be.an('array'); // Not recommended
  })

  it ('supports .include', ()=>{
    expect('foobar').to.include('foo')
    expect([1, 2, 3]).to.include(2)
    expect({a:1, b:2, c:3}).to.match({a:1, b:2})
    expect(new Set([1, 2])).to.include(2)

    expect([1, 2, 3]).to.be.an('array').that.includes(2)
    expect([{a:1}]).to.deep.include({a:1})
    expect([{a:1}]).to.not.include({a:1})
    expect({x:{a:1}}).to.deep.include({x:{a:1}})
    // expect({x:{a:1}}).to.not.include({x:{a:1}}) // FIXME expect test

    expect('foobar').to.not.include('taco')
    expect([1, 2, 3]).to.not.include(4)

    expect({a:3, b:4}).to.match({a:3, b:4}); // Recommended
    expect({a:3, b:4}).to.deep.include({a:3, b:4}); // Recommended
    expect({a:3, b:4}).to.not.include({a:1, b:2}); // Not recommended

    // The aliases .includes, .contain, and .contains can be used interchangeably with .include.
  })

  it ('supports .within', ()=>{
    expect(11).to.be.within(10,12)
    expect(11).to.be.gt(10) .and.lt(12)
    expect(11).to.be.gte(10) .and.lte(12)
    expect(11).to.be.within(10,12) .and.not.within(12,14)
  })

  it ('supports .all.keys', ()=>{
    expect({a:1,b:2}).to.have.all.keys(['a','b'])
    expect({a:1,b:2}).not.to.have.keys(['c','d'])
  })

  it ('supports .has.property', ()=>{
    expect({b:2}).to.have.a.property('b')
    expect({b:2}).to.have.property('b')
    let a = { a:1, __proto__:{b:2}}
    expect(a).to.have.own.property('a')
    expect(a).to.have.property('b')
    expect(a).to.not.have.an.own.property('b')
  })

  it (`supports .nested.property`, ()=>{
    // expect({a:{b:['x', 'y']}}).to.have.nested.property('a.b[1]')
    expect({a:{b:['x', 'y']}}).to.have.nested.property('a.b.1')
    // expect({a:{b:['x', 'y']}}).to.nested.include({'a.b[1]':'y'})
    expect({a:{b:['x', 'y']}}).to.have.nested.property('a.b.1','y')
    // expect({'.a':{'[b]':'x'}}).to.have.nested.property('\\.a.\\[b\\]')
    // expect({'.a':{'[b]':'x'}}).to.have.nested.property('\\.a.\\[b\\]','x')
  })

})


describe (`superset features, not in chai ...`, ()=>{

  it ('supports .be/.is for strict equal tests', async ()=>{
    expect(11).is(11) .and.equals(11)
    expect(11).to.be(11) .and.to.equal(11)
    expect('11').eqls(11) .but.is.not(11)
    expect('11').to.eql(11) .but.not.to.be(11)
    await expect(Promise.resolve(11)).to.eventually.be(11)
  })

  it ('supports .kindof as alias to .a/.an', ()=>{
    expect('foo').to.be.kindof('string')
    expect('foo').to.be.a('string')
  })

  it ('supports classes as arguments to .a/.an/.kindof', ()=>{
    expect('foo').to.be.kindof(String) .and.kindof('string') .but.not.kindof(Object)
    expect('foo').to.be.a(String) .and.a('string') .but.not.an(Object)
    expect({a:1}).to.be.an(Object) .and.an('object') .but.not.a(Date)
    expect(new Error).to.be.an(Error) .and.an('error')
    expect(Promise.resolve()).to.be.a(Promise) .and.a('promise')
    // expect(new Float32Array).to.be.a(Float32Array) .and.a('float32array')
    expect([]).to.be.an(Array) .and.an('array') //.but.not.an (Object)
    expect(Symbol()).to.be.a(Symbol) .and.a ('symbol')
    expect('foo').to.be.a(String); // Recommended
    expect('foo').to.not.be.an(Array); // Not recommended
  })

})


describe ('unsupported chai features', ()=>{

  it.skip (`doesn't support .include subsets`, ()=>{
    expect({a:3, b:4}).to.include({a:3}); // use .subset or .match instead
  })
  it.skip (`doesn't support .include chains`, ()=>{
    expect({a:1, b:2, c:3}).to.include.all.keys('a', 'b')
    expect({a:1, b:2, c:3}).to.not.have.all.keys('a', 'b')

    expect([1, 2, 3]).to.include.members([1, 2])
    expect([1, 2, 3]).to.not.have.members([1, 2])
    expect([1, 2, 3]).to.include.members([1, 2, 2, 2])

    expect({a:1}).to.include.any.keys('a', 'b')
    expect({a:1}).to.have.any.keys('a', 'b')
    expect({c:3}).to.not.have.any.keys('a', 'b'); // Recommended
  })

  it.skip (`doesn't support .nested.include`, ()=>{
    expect({a:{b:['x', 'y']}}).to.nested.include({'a.b[1]':'y'})
    expect({'.a':{'[b]':2}}).to.nested.include({'\\.a.\\[b\\]':2})
    expect({a:{b:[{c:3}]}}).to.deep.nested.include({'a.b[0]':{c:3}})

    expect({a:{b:['x', 'y']}}).to.have.nested.property('a.b[1]')
    expect({a:{b:['x', 'y']}}).to.nested.include({'a.b[1]':'y'})
    expect({'.a':{'[b]':'x'}}).to.have.nested.property('\\.a.\\[b\\]')
    expect({'.a':{'[b]':'x'}}).to.nested.include({'\\.a.\\[b\\]':'x'})
  })

  it.skip (`doesn't support .own.include`, ()=>{
    Object.prototype.b = 2

    expect({a:1}).to.own.include({a:1})
    expect({a:1}).to.include({b:2}).but.not.own.include({b:2})
    expect({a:{b:2}}).to.deep.own.include({a:{b:2}})

    expect({a:1}).to.own.include({a:1})
    expect({a:1}).to.include({b:2}).but.not.own.include({b:2})
  })

  it.skip (`doesn't support .members`, ()=>{
    // Target array deeply (but not strictly) has member `{a:1}`
    expect([{a:1}]).to.have.deep.members([{a:1}])
    expect([{a:1}]).to.not.have.members([{a:1}])

    // Causes all .members assertions that follow in the chain to require that members be in the same order.
    expect([1, 2]).to.have.ordered.members([1, 2])
    .but.not.have.ordered.members([2, 1])

    // When .include and .ordered are combined, the ordering begins at the start of both arrays.
    expect([1, 2, 3]).to.include.ordered.members([1, 2])
      .but.not.include.ordered.members([2, 3])
  })

  it.skip (`doesn't support Sets and Maps`, ()=>{
    // Target set deeply (but not strictly) has key `{a:1}`
    expect(new Set([{a:1}])).to.have.deep.keys([{a:1}])
    expect(new Set([{a:1}])).to.not.have.keys([{a:1}])
    expect(new Map([['a', 1], ['b', 2]])).to.include(2)
  })

})

describe ('miscellaneous...', ()=>{

  it('misc', async ()=>{
    expect ('some string') .to.be.a ('string') .and.to.be.a (String) .but.not.to.be.an (Object)
    expect (new String) .to.be.a ('string') .and.to.be.a (String) .and.to.be.an (Object)
    expect (new Date) .to.be.a ('date') .and.to.be.a (Date) .and.to.be.an (Object)
    expect ({a:11,b:12,c:13}) .to.be.an (Object) .and.to.be.an.instanceof (Object)
    expect ({__proto__:null}) .to.be.an (Object) .but.not.to.be.an.instanceof (Object)

    expect (()=>{throw new Error('boomy')}) .to.throw('boom') .and.to.throw(/boo.y/)
    expect (()=>{throw new Error('boom')}) .to.throw('boom') .and.to.throw(/boo/)
    expect (()=>{throw {code:'boom'}}) .to.throw('boom') .but.not.to.throw(/boo/)
    expect (()=>{throw {foo:'bar'}})
      .to.throw(e => e.foo === 'bar')
      .but.not.to.throw('foo')
      .and.not.to.throw('bar')
    expect (()=>{throw 'whatever'}) .to.throw() .and.to.throw(/what/)

    // exists checks
    expect(false).exists
    expect('').exists
    expect(0).exists
    expect(null).not.exists
    expect(undefined).not.exists

    expect(false).to.exist
    expect('').to.exist
    expect(0).to.exist
    expect(null).not.to.exist
    expect(undefined).not.to.exist

    // defined/undefined/null checks
    expect(false).to.be.defined
    expect('').to.be.defined
    expect(0).to.be.defined
    expect(null).not.to.be.defined
    expect(undefined).not.to.be.defined
    expect(undefined).to.be.undefined
    expect(null).to.be.null

    // truthy checks
    expect(true).to.be.truthy;          expect(true).to.be.true
    expect({}).to.be.truthy;            expect({}).not.to.be.true
    expect('1').to.be.truthy;           expect('1').not.to.be.true
    expect(1).to.be.truthy;             expect(1).not.to.be.true
    expect(null).not.to.be.truthy;      expect(null).not.to.be.true
    expect(undefined).not.to.be.truthy; expect(undefined).not.to.be.true

    // falsy checks
    expect(false).to.be.falsy;      expect(false).to.be.false
    expect('').to.be.falsy;         expect('').not.to.be.false
    expect(0).to.be.falsy;          expect(0).not.to.be.false
    expect(null).to.be.falsy;       expect(null).not.to.be.false
    expect(undefined).to.be.falsy;  expect(undefined).not.to.be.false

    // strict equal checks
    expect(1).is(1)
    expect(1).to.be(1)
    expect(1).equals(1)
    expect(1).to.equal(1)

    // strict not equal checks
    expect(1).is.not(2)
    expect(1).not.to.be(2)
    expect(1).not.equals(2)
    expect(1).not.to.equal(2)

    // strict gt/lt/ge/le checks
    expect(2).is.gt(1)
    expect(2).to.be.gt(1)
    expect(1).is.not.gt(2)
    expect(1).not.to.be.gt(2)

    // await expect(1).to.eventually.be(1)
    await expect(1).to.eventually.equal(1)
    await expect(2).to.eventually.be.gt(1)

    await expect(await 1).to.eventually.equal(1)
    await expect(await 2).to.eventually.be.gt(1)

    let expected = {
      ID:expect.any(String),
      foo:1,
      nested:{x:1},
      array:[{x:1},{y:2}],
      deeply:{ nested:{ y:2, array:[1,2, expect.any() ] } },
    }
    let actual = {
      ID:'12345678-1234-1234-1234-123456789012',
      foo:1, bar:2,
      nested:{x:1,y:2},
      deeply:{ nested:{ x:1,y:2, array:[1,2,3] } },
      array:[{x:1},{y:2,z:11},{z:3}],
      more:{z:3}
    }
    expect(actual).to.match(expected)
    // expect(11).to.match(expected)

    return // Not supported:
  })

})
