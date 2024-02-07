const cds = require('@sap/cds')

class DataUtil {

  constructor() {
    // This is to support simplified usage like that: beforeEach(test.data.reset)
    this.reset = (fn) => {
      if (typeof fn === 'function') this.__proto__.reset().then(fn)
      else return this.__proto__.reset(fn)
    }
  }

  autoReset() {
    global.beforeEach (() => this.reset())
  }

  async deploy(db) {
    if (!db)  db = await cds.connect.to('db')
    await cds.deploy.data(db)
  }

  async delete(db) {
    if (!db)  db = await cds.connect.to('db')
    if (!this._deletes) {
      this._deletes = []
      for (const entity of db.model.each('entity')) {
        if (!entity.query && entity['@cds.persistence.skip'] !== true) {
          this._deletes.push(DELETE.from(entity))
        }
        if (entity.drafts) {
          this._deletes.push(DELETE.from(entity.drafts))
        }
      }
    }
    if (this._deletes.length > 0) {
      await db.run(this._deletes)
    }
  }

  /* delete + new deploy from csv */
  async reset(db) {
    if (!db)  db = await cds.connect.to('db')
    await this.delete(db)
    await this.deploy(db)
  }

}

module.exports = DataUtil

/* eslint no-console: off */
