const cds = require('@sap/cds')

/** @deprecated */
exports.autoReset = () => global.beforeEach (exports.reset)

exports.deploy = async function (db) {
  if (!db) db = await cds.connect.to('db')
  await cds.deploy.data(db)
}

exports.delete = async function (db) {
  if (!db) db = await cds.connect.to('db')
  const deletes = _deletes4 (db.model)
  if (deletes.length) await db.run(deletes)
}

exports.reset = async function() {
  let [db] = arguments // to avoid confusion with done callback in beforeEach
  if (!db?.isDatabaseService) db = await cds.connect.to('db')
  await exports.delete(db)
  await exports.deploy(db)
}

const DELETES = Symbol.for('cds.test.deletes')
const _deletes4 = model => {
  if (DELETES in model) return model[DELETES]
  const deletes = []
  for (const entity of model.each('entity')) {
    if (!entity.query && entity['@cds.persistence.skip'] !== true) {
      deletes.push(DELETE.from(entity))
    }
    if (entity.drafts) {
      deletes.push(DELETE.from(entity.drafts))
    }
  }
  return model[DELETES] = deletes
}
