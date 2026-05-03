const childProcess = require('child_process')
let fs, path

function buildElements(elements = {}) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    if (el.type === 'cds.Composition' || el.items) continue         // skip compositions
    if (el['@odata.foreignKey4']) continue                          // skip auto-generated FK scalars (defensive)
    if (el.type === 'cds.Association' && !el.keys) continue         // skip unmanaged associations (e.g. localized) — no on-condition to copy
    const e = {}
    if (el.key)       e.key       = true
    if (el.type)      e.type      = el.type
    if (el.length)    e.length    = el.length
    if (el.precision) e.precision = el.precision
    if (el.scale)     e.scale     = el.scale
    if (el.type === 'cds.Association') {
      if (el.target) e.target = el.target  // real entity name — Java joins across service boundaries
      if (el.keys)   e.keys   = el.keys    // managed form — Java derives FK scalar at startup
    }
    result[name] = e
  }
  return result
}

function buildDraftElements(elements = {}) {
  const result = {}
  // Scalar elements from service entity (author_ID not derivable without compile.for.java — omitted; SELECT * works)
  for (const [name, el] of Object.entries(elements)) {
    if (el.virtual) continue
    // TODO: What does this mean for expanding on draft entities? Why would we skip these? Especially compositions should not be skipped. There should not be a reason to.
    if (el.type === 'cds.Association' || el.type === 'cds.Composition' || el.items) continue
    const e = {}
    if (el.key)    e.key    = true
    if (el.type)   e.type   = el.type
    if (el.length) e.length = el.length
    result[name] = e
  }
  // Standard draft columns — hardcoded last so they always win over any loop values
  Object.assign(result, {
    IsActiveEntity:                    { type: 'cds.Boolean' },
    HasActiveEntity:                   { type: 'cds.Boolean' },
    HasDraftEntity:                    { type: 'cds.Boolean' },
    DraftAdministrativeData_DraftUUID: { type: 'cds.UUID' }
  })
  return result
}

const injectTestRuntimeDatabaseProxy = async (cds, options) => {
  const servicesPath = path.resolve(cds.root, cds.env.folders.srv)

  // Cleanup potential left-overs of a prior run
  await Promise.allSettled([
    fs.unlink(path.resolve(servicesPath, 'db.cds')),
    fs.unlink(path.resolve(servicesPath, 'db.json')),
  ])

  const from = [...(options.from?.split(',') ?? ['*'])]
  const model  = await cds.load(from)         // raw source CSN
  const linked = cds.linked(model)            // for draft entity lookup
  // Define a HCQL service for the Java app-runtime
  // > ... that will expose ALL database entities
  const hcqlDatabaseProxy = {
    '$version': '2.0',
    definitions: {
      db: { kind: 'service', '@path': 'db', '@protocol': ['hcql'], '@requires': 'any' }
    }
  }

  // TODO: Why do we need two seperate loops? 
  // Loop 1: base entities (no projection/query) → one db.* entity per DB table
  for (const [name, def] of Object.entries(model.definitions)) {
    if (def.kind !== 'entity') continue
    if (def.projection || def.query) continue
    // TODO: HcqlProxy is a test artifact: Is this case still relevant, once it's gone?
    if (def['@cds.persistence.exists']) continue          // skip already-mapped entities (e.g. hcqlProxy.*)
    // TODO: I would like to be able to access the real cds.outbox.Messages table -> Followup Investigation on what makes it different ... It shouldn't be
    if (name.startsWith('cds.')) continue                 // skip CDS framework internals (e.g. cds.outbox.Messages)
    
    // Define a proxy entity with @cds.persistence.exists
    // This will get us past all the compilation errors 
    // ... we encounter when trying to rely on boostrapped 
    // ... entities too early; e.g. .drafts, .texts
    hcqlDatabaseProxy.definitions['db.' + name] = {
      kind: 'entity',
      '@requires': 'any',
      '@cds.persistence.exists': true,
      '@cds.persistence.name': name.replace(/\./g, '_').toUpperCase(),
      elements: buildElements(def.elements)
    }
  }

  // Loop 2: draft entities — @odata.draft.enabled service entities produce draft tables
  for (const [name, def] of Object.entries(linked.definitions)) {
    if (def.kind !== 'entity' || !def['@odata.draft.enabled']) continue
    const draftName = name + '.drafts'
    hcqlDatabaseProxy.definitions['db.' + draftName] = {
      kind: 'entity',
      '@requires': 'any',
      '@cds.persistence.exists': true,
      '@cds.persistence.name': draftName.replace(/\./g, '_').toUpperCase(),
      elements: buildDraftElements(def.elements)
    }
  }

  // TODO: Is the proxyMap really required? When the hcql proxy test left-over is gone, we will always just prefix with 'db', won't we? Is a map really required under those conditions?
  // Build proxyMap: source entity name → db.* proxy name (used by java-hcql.js for string rewrite)
  const proxyMap = {}
  for (const name of Object.keys(hcqlDatabaseProxy.definitions)) {
    if (name === 'db') continue
    proxyMap[name.slice(3)] = name   // 'bookshop.Books' → 'db.bookshop.Books'
  }

  await Promise.all([
    fs.writeFile(path.resolve(servicesPath, 'db.cds'), `using from './db.json';`),
    fs.writeFile(path.resolve(servicesPath, 'db.json'), JSON.stringify(hcqlDatabaseProxy)),
  ])

  // TODO: Consider moving the model reload back into the exported java function. I don't think it conceptually belongs to the proxy inection.
  cds.model = await cds.load([...from, path.resolve(servicesPath, 'db.cds')])
  cds.model = cds.linked(cds.model)
  cds.compile.for.lean_drafts(cds.model)  // adds .drafts shadow entities for test-runtime CDS APIs
  cds.entities                             // trigger lazy init

  return proxyMap
}

module.exports = async function java(...args) {
  const { cds, axios } = this; ({ fs: { promises: fs }, path } = cds.utils)

  // Force Java to respond @odata.context and @odata.count just like the node runtime
  this.defaults.headers['Odata-Version'] = '4.0'
  
  // Parse cds.test(...args) manually, as we won't be using cds.serve for Java
  const [, options] = require('@sap/cds/bin/args')(require('@sap/cds/bin/serve'), args)
  
  // Load application model & establish test-runtime db proxy
  const proxyMap = await injectTestRuntimeDatabaseProxy(cds, options)

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

  // Build the JAR on first run so subsequent runs use the fast java -jar path
  if (!jarExists) await new Promise((resolve, reject) => {
      const mvnBuild = childProcess.spawn('mvn', ['package', '-DskipTests'], { cwd: cds.root, stdio: 'inherit', env: process.env })
      mvnBuild.on('error', reject)
      mvnBuild.on('exit', (code, signal) => {
        if (code === 0) return resolve()
        const reason = signal ? `killed by signal ${signal}` : `exited with code ${code}`
        reject(new Error(`Maven build failed — ${reason}. Check the output above for details.`))
      })
    })

  const app = await new Promise((resolve, reject) => {
    const spawnOptions = { cwd: cds.root, stdio: 'inherit', env: process.env }
    const javaAppProcess = childProcess.spawn('java', ['-jar', jarFile, `--server.port=${p}`], spawnOptions)

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
  cds.env.requires.db = { impl: require.resolve('./java-hcql.js'), axios, proxyMap }

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
