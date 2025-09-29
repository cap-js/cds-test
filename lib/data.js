const cds = require('@sap/cds')

class DataUtil {
  /** @type {ReturnType<typeof DELETE.from>[] | undefined} */
  _deletes

  constructor() {
    // This is to support simplified usage like that: beforeEach(test.data.reset)
    const {reset} = this
    /**
     * @param {any} [x]
     */
    this.reset = x => {
      if (typeof x === 'function') reset.call(this).then(x,x) // x is the done callback of jest -> no return
      else if (x?.assert) return reset.call(this) // x is a node --test TestContext object -> ignore
      else return reset.call(this,x) // x is a db service instance
    }
  }

  autoReset() {
    global.beforeEach (() => this.reset())
  }

  /**
   * @param {cds.DatabaseService} db - db
   */
  async deploy(db) {
    if (!db)  db = await cds.connect.to('db')
    // @ts-expect-error - dk type
    await cds.deploy.data(db)
  }

  /**
   * @param {cds.DatabaseService} db - db
   */
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

  /**
  * delete + new deploy from csv
  * @param {cds.DatabaseService} db - db
  */
  async reset(db) {
    if (!db) db = await cds.connect.to('db')
    await this.delete(db)
    await this.deploy(db)
  }

}

module.exports = DataUtil

/* eslint no-console: off */
