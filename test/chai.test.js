// jest.unstable_shouldLoadAsEsm = ()=>false

// Requires jest to be run with NODE_OPTIONS="--experimental-vm-modules"
it.skip ('should load chai via dynamic import', async ()=>{
  const chai = await import('chai')
  console.log (chai)
  chai.expect(chai).to.exist
  expect(chai).toBeDefined()
})

// Supported by Node 24, but not by jest's monkey-patched require implementation
it.skip ('should load chai via createRequire', async ()=>{
  const chai = require ('chai')
  console.log (chai)
  chai.expect(chai).to.exist
  expect(chai).toBeDefined()
})

// Supported by Node 24, but not by jest's monkey-patched createRequire implementation
it.skip ('should load chai via createRequire', async ()=>{
  const { createRequire } = require ('module')
  require = createRequire (__filename)
  const chai = require ('chai')
  console.log (chai)
  chai.expect(chai).to.exist
  expect(chai).toBeDefined()
})