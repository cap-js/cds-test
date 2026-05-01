const childProcess = require('child_process')
let fs, path

const injectTestRuntimeDatabaseProxy = async (cds, options) => {
  const servicesPath = path.resolve(cds.root, cds.env.folders.srv)

  // Cleanup potential left-overs of a prior run
  await Promise.allSettled([
    fs.unlink(path.resolve(servicesPath, 'db.cds')),
    fs.unlink(path.resolve(servicesPath, 'db.json')),
  ])

  const from = [...(options.from?.split(',') ?? ['*'])]
  const model = await cds.load(from)
  const javaModel = cds.compile.for.java(model)
  const linkedJavaModel = cds.linked(javaModel)
  cds.compile.for.lean_drafts(linkedJavaModel)

  // ?: Before te refactor we would:
  // ?: if (model.definitions.db) cds.model = model
  // ?: else ...

  // Define a HCQL service for the Java app-runtime
  // > ... that will expose ALL database entities
  // ?: We call the service 'db' to override `await cds.connect.to('db')`?
  const hcqlDatabaseProxy = { ...model, definitions: {
    db: { kind: 'service', '@path': 'db', '@protocol': ['hcql'], '@requires': 'any' } 
  } }

  for (const name in linkedJavaModel.definitions) {
    const def = linkedJavaModel.definitions[name]

    if (def.kind !== 'entity') continue
    if (linkedJavaModel.services.find((s) => name.startsWith(s.name))) continue
    if (name.endsWith('.transitions_')) continue
    // if (name.endsWith('.texts')) continue // ?
    
    hcqlDatabaseProxy.definitions['db.' + name] = {
      kind: 'entity',
      '@requires': 'any',
      projection: { from: { ref: [name] } }
    }
  }

  // Put the new proxy-service, where both app- and test-runtime will discover it:
  // > The app-runtime will simply expose it generically, as it would any `@hcql` service
  // > The test-runtime will set the proxy from`./java-hcql.js` as the service `impl` 
  await Promise.all([
    fs.writeFile(path.resolve(servicesPath, 'db.cds'), `using from './db.json';`),
    fs.writeFile(path.resolve(servicesPath, 'db.json'), JSON.stringify(hcqlDatabaseProxy)),
  ])

  // The reloaded model will include our injected db proxy
  cds.model = await cds.load([...from, path.resolve(servicesPath, 'db.cds')])
  cds.model = cds.compile.for.java(cds.model)
  cds.model = cds.linked(cds.model)
  cds.entities // ...trigger lazy init
}

module.exports = async function java(...args) {
  const { cds, axios } = this; ({ fs: { promises: fs }, path } = cds.utils)

  // Force Java to respond @odata.context and @odata.count just like the node runtime
  this.defaults.headers['Odata-Version'] = '4.0'
  
  // Parse cds.test(...args) manually, as we won't be using cds.serve for Java
  const [, options] = require('@sap/cds/bin/args')(require('@sap/cds/bin/serve'), args)
  
  // Load application model & establish test-runtime db proxy
  await injectTestRuntimeDatabaseProxy(cds, options)

  const p = await port()
  const url = `http://localhost:${p}`

  // Locate the Java app's srv/pom.xml & extract its artifactId to locate the JAR
  // TODO: Do this earlier and add a verification step for Java pre-requisites 
  // TODO: > If they are not met, inform the user, with link to CAP Java Setup Guide
  const pomFile = path.resolve(cds.root, cds.env.folders.srv, 'pom.xml')
  const appName = await fs.readFile(pomFile, 'utf8')
    .then(xml => xml.replace(/<parent>[\s\S]*?<\/parent>/, '').match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? 'app')
    .catch(() => 'app')

  const jarFile = path.resolve(cds.root, cds.env.folders.srv, `target/${appName}-exec.jar`)
  const jarExists = await fs.access(jarFile).then(() => true, () => false)

  const app = await new Promise((resolve, reject) => {
    const spawnOptions = { cwd: cds.root, stdio: 'inherit', env: process.env }
    const javaAppProcess = jarExists
      ? childProcess.spawn('java', ['-jar', jarFile, `--server.port=${p}`], spawnOptions) // TODO: Why would this be necessary?
      : childProcess.spawn('mvn', ['spring-boot:run', `-Dspring-boot.run.arguments=--server.port=${p}`], spawnOptions)

    javaAppProcess.on('error', reject)
    javaAppProcess.on('exit', (code, signal) => {
      const reason = signal ? `killed by signal ${signal}` : `exited with code ${code}`
      reject(new Error(`Application failed to start — process ${reason}. Check the application output above for details.`))
    })

    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const ping = () => axios.get(url).catch(() => sleep(500).then(ping))
    ping().then(() => resolve(javaAppProcess))
  })

  cds.shutdown = () => app.kill()

  // TODO: Make sure passing the options only during cds.connect.to works 
  cds.env.requires.db = { impl: require.resolve('./java-hcql.js'), axios }

  // Finally: Connect this test-runtime to the hcql proxy 
  // > we just injected into the java app-runtime
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
