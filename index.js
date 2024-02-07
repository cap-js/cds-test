const cds = module.exports = require('@sap/cds')

class CdsTest {

  get test() {
    return super.test = require('./lib/cds-test')
  }

}

cds.extend (cds.constructor) .with (CdsTest)
