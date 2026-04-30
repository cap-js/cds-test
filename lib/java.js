const childProcess = require('child_process')

const ensureJavaAppDatabaseService = async (model, from, cds) => {
  const { fs: { promises: fs }, path } = cds.utils
  const srvPath = path.resolve(cds.root, cds.env.folders.srv)

  // Enhance Java model with database hcql service
  const db = { ...model, definitions: {
    db: { kind: 'service', '@path': 'db', '@protocol': ['hcql'], '@requires': 'any' } 
  } }

  const services = []

  for (const name in model.definitions) {
    const def = model.definitions[name]

    if (def.kind === 'service') services.push(name)
    if (def.kind !== 'entity') continue
    if (services.find((s) => name.startsWith(s))) continue
    if (name.endsWith('.transitions_')) continue

    db.definitions['db.' + name] = {
      kind: 'entity',
      projection: { from: { ref: [name] } },
    }
  }

  await Promise.all([
    fs.writeFile(path.resolve(srvPath, 'db.cds'), `using from './db.json';`),
    fs.writeFile(path.resolve(srvPath, 'db.json'), JSON.stringify(db)),
  ])

  cds.model = await cds.load([...from, path.resolve(srvPath, 'db.cds')])
}

module.exports = async function java(...args) {
  const { cds, axios } = this
  const { fs: { promises: fs }, path } = cds.utils
  const srv = path.resolve(cds.root, cds.env.folders.srv)

  // forces java to respond @odata.context and @odata.count just like the node runtime
  this.defaults.headers['Odata-Version'] = '4.0'

  cds.env.requires.db = { impl: require.resolve('./java-hcql.js'), axios }

  // Parse cds.test(...args) manually, as we won't be using cds.serve for Java
  const [, options] = require('@sap/cds/bin/args')(require('@sap/cds/bin/serve'), args)

  // Cleanup potential left-overs of a previous run
  await Promise.allSettled([
    fs.unlink(path.resolve(srv, 'db.cds')),
    fs.unlink(path.resolve(srv, 'db.json')),
  ])

  // Load application model
  const from = [...(options.from?.split(',') ?? ['*'])]
  const model = await cds.load(from)

  if (model.definitions.db) cds.model = model
  else await ensureJavaAppDatabaseService(model, from, cds)

  cds.model = cds.linked(cds.compile.for.java(cds.model))
  cds.entities // ...trigger lazy init

  const p = await port()
  const url = `http://localhost:${p}`
  const svc = Object.values(model.definitions).find(d => d.kind === 'service' && d['@path'])
  const readyPath = svc ? `/odata/v4/${svc['@path']}` : '/'

  // Locate the Java app's srv/pom.xml & extract its artifactId to find the JAR
  const pomFile = path.resolve(cds.root, cds.env.folders.srv, 'pom.xml')
  const appName = await fs.readFile(pomFile, 'utf8')
    .then(xml => xml.replace(/<parent>[\s\S]*?<\/parent>/, '').match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? 'app')
    .catch(() => 'app')

  const jarFile = path.resolve(cds.root, cds.env.folders.srv, `target/${appName}-exec.jar`)
  const jarExists = await fs.access(jarFile).then(() => true, () => false)

  const app = await new Promise((resolve, reject) => {
    const spawnOptions = { cwd: cds.root, stdio: 'inherit', env: process.env }
    const javaAppProcess = jarExists
      ? childProcess.spawn('java', ['-jar', jarFile, `--server.port=${p}`], spawnOptions)
      : childProcess.spawn('mvn', ['spring-boot:run', `-Dspring-boot.run.arguments=--server.port=${p}`], spawnOptions)

    javaAppProcess.on('error', reject)
    javaAppProcess.on('exit', (code, signal) => {
      const reason = signal ? `killed by signal ${signal}` : `exited with code ${code}`
      reject(new Error(`Application failed to start — process ${reason}. Check the application output above for details.`))
    })

    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const ping = () => axios.get(url + readyPath).catch(() => sleep(500).then(ping))
    ping().then(() => resolve(javaAppProcess))
  })

  cds.shutdown = () => app.kill()

  // connect to primary database hcql proxy service
  await cds.connect.to('db')

  return { server: { address: () => p }, url }
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
