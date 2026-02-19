const childProcess = require('child_process')
const { setTimeout } = require('node:timers/promises')

module.exports = async function java(...args) {
  const { cds } = this
  const { fs: { promises: fs }, path } = cds.utils
  const srv = path.resolve(cds.root, cds.env.folders.srv)

  // forces java to respond @odata.context and @odata.count just like the node runtime
  this.axios.defaults.headers.common['Odata-Version'] = '4.0'

  cds.env.requires.db = { impl: require.resolve('./java-hcql.js'), axios: this.axios }

  const [_, options] = require('@sap/cds/bin/args')(require('@sap/cds/bin/serve'), args)

  // load application model
  const from = [...(options.from?.split(',') ?? ['*'])]
  const model = await cds.load(from)
  if (model.definitions.db) {
    // link test environment with application linked model
    cds.model = model
  } else {
    // enhance java model with database hcql service
    const db = { ...model, definitions: { db: { kind: 'service', '@path': 'db', '@protocol': ['hcql'], '@requires': 'any' } } }
    const services = []
    for (const name in model.definitions) {
      const def = model.definitions[name]
      if (def.kind === 'service') services.push(name)
      if (def.kind !== 'entity') continue
      if (services.find(s => name.startsWith(s))) continue
      if (name.endsWith('.transitions_')) continue
      db.definitions['db.' + name] = { "kind": "entity", "projection": { "from": { "ref": [name] } } }
    }
    await Promise.all([
      fs.writeFile(path.resolve(srv, 'db.cds'), `using from './db.json';`),
      fs.writeFile(path.resolve(srv, 'db.json'), JSON.stringify(db)),
    ])

    // link test environment with application linked model
    cds.model = await cds.load([...from, path.resolve(srv, 'db.cds')])
  }

  cds.model = cds.linked(cds.compile.for.java(cds.model))
  cds.entities

  let res, rej
  const ready = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })

  const p = await port()
  const url = `http://localhost:${p}`
  const jarFile = path.resolve(cds.root, cds.env.folders.srv, 'target/app-exec.jar')
  const jarFileExists = await fs.access(jarFile).then(() => true, () => false)
  const app = jarFileExists
    ? childProcess.spawn('java', [`-jar`, jarFile, `--server.port=${p}`], { cwd: cds.root, stdio: 'inherit', env: process.env })
    : childProcess.spawn('mvn', ['spring-boot:run', `-Dspring-boot.run.arguments=--server.port=${p}`], { cwd: cds.root, stdio: 'inherit', env: process.env })
  app.on('error', rej)
  app.on('exit', () => rej(new Error('Application failed to start.')))
  cds.shutdown = () => app.kill()

  // REVISIT: make it call an actual /health check
  // ping the server until it responds
  const ping = () => cds.test.axios.get(url).catch(() => ping())
  ping().then(res)
  await ready

  // connect to primary database hcql proxy service
  await cds.connect.to('db')

  return { server: { address: () => { return p } }, url }
}

function port() {
  return new Promise((resolve, reject) => {
    const net = require('net')
    const server = net.createServer()
    server.on('error', reject)

    server.listen(() => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}