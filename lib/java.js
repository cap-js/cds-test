const childProcess = require('child_process')
let fs, path

const PROXY_PREFIX = 'dbProxy.'

const proxyNameOf = entityName => PROXY_PREFIX + entityName.replace(/\./g, '_')
const databaseNameOf = entityName => entityName.replace(/\./g, '_').toUpperCase()

/**
 * Derives the HCQL database proxy CSN from the application model and writes it to srv/.
 *
 * CDS Node.js tests normally query a local `db` service. When the application runs on Java,
 * the database is owned by the Java process instead. This function builds a synthetic CDS
 * service that exposes every physical database table as a proxy entity, enabling the same
 * query patterns to route transparently to the Java backend via HCQL.
 *
 * Returns `{ changed }` — the caller uses this to decide whether the JAR needs rebuilding.
 *
 * @param {object} cds    — the CDS runtime instance
 * @param {string[]} from — model source list (e.g. ['*'] or specific paths)
 * @returns {{ changed: boolean }}
 */
const buildDatabaseProxy = async (cds, from) => {
  const servicesPath = path.resolve(cds.root, cds.env.folders.srv)
  const proxyJsonPath = path.join(servicesPath, 'db-proxy.json')
  const proxyCdsPath  = path.join(servicesPath, 'db-proxy.cds')

  const existingContent = await fs.readFile(proxyJsonPath, 'utf8').catch(() => null)

  const linked = cds.linked(await cds.load(from))

  // Bare HCQL service definition — proxy entities are registered in the loop below.
  const hcqlDatabaseProxy = {
    '$version': '2.0',
    definitions: {
      dbProxy: { kind: 'service', '@path': 'dbProxy', '@protocol': ['hcql'], '@requires': 'any' }
    }
  }

  const isDatabaseEntity = entityName => {
    const def = linked.definitions[entityName]
    if (!def || def.kind !== 'entity') return false
    if (def.projection || def.query) return false
    if (def['@cds.persistence.exists']) return false
    if (def['@cds.persistence.skip']) return false
    return true
  }

  const determineProjectionTarget = entityName => {
    if (isDatabaseEntity(entityName)) return entityName
    const def = linked.definitions[entityName]
    const fromRef = def?.query?.SELECT?.from?.ref ?? def?.projection?.from?.ref
    if (fromRef?.length) return determineProjectionTarget(fromRef[0])
    return null
  }

  const determineProxyTarget = (entityName, forDraft = false) => {
    if (forDraft && draftEntityNames.has(entityName)) return proxyNameOf(entityName + '.drafts')
    const targetName = determineProjectionTarget(entityName)
    return targetName ? proxyNameOf(targetName) : entityName
  }

  // CAP Java creates _drafts tables for the full composition tree
  const collectComposedDescendants = (entityName, descendants = new Set(), visited = new Set()) => {
    if (visited.has(entityName)) return descendants
    
    visited.add(entityName)
    
    for (const [, el] of Object.entries(linked.definitions[entityName]?.elements ?? {})) {
      if (el.type !== 'cds.Composition' || !el.target) continue
      if (el.target.endsWith('.texts')) continue // Java generates no _drafts tables for localized texts
      descendants.add(el.target)
      collectComposedDescendants(el.target, descendants, visited)
    }
    return descendants
  }

  // Pre-collect entity names that will have draft table proxies so that buildProxyElements
  // can wire composition links between draft proxy entities (e.g. Books_drafts → ExpertReviews_drafts).
  const draftEntityNames = new Set()
  for (const [name, def] of Object.entries(linked.definitions)) {
    if (def.kind === 'entity' && def['@odata.draft.enabled']) {
      draftEntityNames.add(name)
      for (const targetName of collectComposedDescendants(name)) {
        if (linked.definitions[targetName]?.kind === 'entity') draftEntityNames.add(targetName)
      }
    }
  }

  const buildProxyElements = (elements = {}, forDraft = false) => {
    const proxyElements = {}

    for (const [name, el] of Object.entries(elements)) {
      if (forDraft && el.virtual) continue

      if (el.type === 'cds.Composition') {
        if (forDraft && !draftEntityNames.has(el.target)) continue
        if (!forDraft && !isDatabaseEntity(el.target)) continue
        
        const targetName = `${el.target}${forDraft ? '.drafts' : ''}`

        const compositionElement = {
          type: 'cds.Composition',
          target: proxyNameOf(targetName)
        }
        if (el.cardinality) compositionElement.cardinality = el.cardinality
        if (el.on) compositionElement.on = el.on

        proxyElements[name] = compositionElement
        continue
      }

      if (el.type === 'cds.Association') {
        if (!el.keys && !el.on) continue
        const associationElement = { type: 'cds.Association' }
        if (el.target) associationElement.target = determineProxyTarget(el.target, forDraft)
        if (el.keys)        associationElement.keys        = el.keys
        if (el.on)          associationElement.on          = el.on
        if (el.cardinality) associationElement.cardinality = el.cardinality

        proxyElements[name] = associationElement
        continue
      }

      const scalarElement = {}
      if (el.key)                               scalarElement.key    = true
      if (el.type)                              scalarElement.type   = el.type
      if (el.items)                             scalarElement.items  = el.items
      if (el.length && el.type !== 'cds.UUID')  scalarElement.length = el.length
      // precision/scale are enforced by the DB — the proxy doesn't need them
      // if (el.precision)                      scalarElement.precision = el.precision
      // if (el.scale)                          scalarElement.scale     = el.scale

      proxyElements[name] = scalarElement
    }

    if (forDraft) Object.assign(proxyElements, {
      IsActiveEntity:                    { type: 'cds.Boolean' },
      HasActiveEntity:                   { type: 'cds.Boolean' },
      HasDraftEntity:                    { type: 'cds.Boolean' },
      DraftAdministrativeData_DraftUUID: { type: 'cds.UUID' }
    })

    return proxyElements
  }

  const proxyEntityDef = (entityName, elements) => ({
    kind: 'entity',
    '@requires': 'any',
    '@cds.persistence.exists': true,
    '@cds.persistence.name': databaseNameOf(entityName),
    elements
  })

  for (const [name, def] of Object.entries(linked.definitions)) {

    if (isDatabaseEntity(name)) {
      const entity = proxyEntityDef(name, buildProxyElements(def.elements))
      hcqlDatabaseProxy.definitions[proxyNameOf(name)] = entity
    }

    if (def.kind === 'entity' && def['@odata.draft.enabled']) {
      const draftEntity = proxyEntityDef(name + '.drafts', buildProxyElements(def.elements, true))
      hcqlDatabaseProxy.definitions[proxyNameOf(name + '.drafts')] = draftEntity

      for (const targetName of collectComposedDescendants(name)) {
        const childDraftEntityName = proxyNameOf(targetName + '.drafts')
        if (hcqlDatabaseProxy.definitions[childDraftEntityName]) continue

        const targetDef = linked.definitions[targetName]
        if (!targetDef || targetDef.kind !== 'entity') continue

        const childDraftEntity = proxyEntityDef(targetName + '.drafts', buildProxyElements(targetDef.elements, true))
        hcqlDatabaseProxy.definitions[childDraftEntityName] = childDraftEntity
      }
    }
  }

  const newContent = JSON.stringify(hcqlDatabaseProxy)

  // Only write when content changed — avoids a concurrent-worker race where one
  // worker unlinks the proxy file while another is loading it.
  if (newContent !== existingContent) {
    await Promise.all([
      fs.writeFile(proxyCdsPath,  `using from './db-proxy.json';`),
      fs.writeFile(proxyJsonPath, newContent),
    ])
  }

  return { changed: newContent !== existingContent }
}

module.exports = async function java(...args) {
  const { cds, axios } = this; ({ fs: { promises: fs }, path } = cds.utils)

  // Java app requires OData-Version: 4.0 — set as default on cds-test's HTTP client.
  this.defaults.headers['Odata-Version'] = '4.0'

  // reuse cds-serve arg parser to extract '--from' and other serve options
  const [, options] = require('@sap/cds/bin/args')(require('@sap/cds/bin/serve'), args)

  const from    = [...(options.from?.split(',') ?? ['*'])]
  const srvDir  = path.resolve(cds.root, cds.env.folders.srv)
  const proxyFile = path.join(srvDir, 'db-proxy.cds')

  // Reserve a free port to pass to the Java process at startup.
  const p = await port()
  const url = `http://localhost:${p}`

  // JAR filename is based on the Maven artifact ID in pom.xml.
  const pomFile = path.resolve(cds.root, cds.env.folders.srv, 'pom.xml')
  const appName = await fs.readFile(pomFile, 'utf8')
    .then(xml => xml.replace(/<parent>[\s\S]*?<\/parent>/, '').match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? 'app')
    .catch(() => 'app')

  const jarFile = path.resolve(cds.root, cds.env.folders.srv, `target/${appName}-exec.jar`)

  // `db-proxy.json` and `.jar` are coupled:
  // JAR gets rebuilt only when proxy changed or absent.
  const jarExists = await fs.access(jarFile).then(() => true).catch(() => false)
  const { changed } = await buildDatabaseProxy(cds, from)

  if (changed || !jarExists) {
    await new Promise((resolve, reject) => {
      const mvnBuild = childProcess.spawn('mvn', ['package', '-DskipTests'], { cwd: cds.root, stdio: 'inherit', env: process.env })
      mvnBuild.on('error', reject)
      mvnBuild.on('exit', (code, signal) => {
        if (code === 0) return resolve()
        const reason = signal ? `killed by signal ${signal}` : `exited with code ${code}`
        reject(new Error(`Maven build failed — ${reason}. Check the output above for details.`))
      })
    })
  }

  // Load phase: wire the proxy into cds.model. Runs on every test invocation.
  cds.model = await cds.load([...from, proxyFile])
  cds.model = cds.linked(cds.model)
  cds.compile.for.lean_drafts(cds.model)

  const proxyMap = {}
  for (const [name] of Object.entries(cds.model.definitions)) {
    if (name.startsWith(PROXY_PREFIX)) continue
    const key = proxyNameOf(name)
    if (cds.model.definitions[key]) proxyMap[name] = key
    const draftKey = proxyNameOf(name + '.drafts')
    if (cds.model.definitions[draftKey]) proxyMap[name + '.drafts'] = draftKey
  }

  // lean_drafts only links .drafts on fully-annotated service entities — propagate to the db layer too.
  for (const [draftName, proxyKey] of Object.entries(proxyMap)) {
    if (!draftName.endsWith('.drafts')) continue
    const activeName = draftName.slice(0, -'.drafts'.length)
    const activeDef = cds.model.definitions[activeName]
    const fromRef = activeDef?.query?.SELECT?.from?.ref ?? activeDef?.projection?.from?.ref
    if (!fromRef?.length) continue
    const dbEntity = cds.model.definitions[fromRef[0]]
    const proxyDraftEntity = cds.model.definitions[proxyKey]

    // `.defineProperty` keeps `.drafts` non-enumerable matching
    // > how drafts entities are usually attached to acives
    if (dbEntity && proxyDraftEntity && !dbEntity.drafts)
      Object.defineProperty(dbEntity, 'drafts', { value: proxyDraftEntity, configurable: true })
  }

  cds.entities // trigger lazy init of entity cache

  // Start the app; resolve only once the HTTP endpoint responds
  const app = await new Promise((resolve, reject) => {
    const spawnOptions = { cwd: cds.root, stdio: 'inherit', env: process.env }
    const javaAppProcess = childProcess.spawn('java', ['-jar', jarFile, `--server.port=${p}`], spawnOptions)

    let startupAborted = false
    javaAppProcess.on('error', reject)
    javaAppProcess.on('exit', (code, signal) => {
      startupAborted = true
      const reason = signal ? `killed by signal ${signal}` : `exited with code ${code}`
      reject(new Error(`Application failed to start — process ${reason}. Check the application output above for details.`))
    })

    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const ping = () => {
      if (startupAborted) return
      return axios.get(url).catch(() => sleep(500).then(ping))
    }
    ping().then(() => resolve(javaAppProcess))
  })

  const _shutdown = cds.shutdown
  cds.shutdown = () => {
    // Detach the HCQL proxy so the next test file reconnects to a new Java process.
    delete cds.services.db
    delete cds.db
    app.removeAllListeners('exit')
    const killed = new Promise(r => { app.once('exit', r); app.kill() })
    return Promise.all([killed, _shutdown.call(cds)])
  }

  // Wire db to the Java app — all test queries route through java-hcql.js from here.
  cds.env.requires.db = { impl: require.resolve('./java-hcql.js'), axios, proxyMap }

  await cds.connect.to('db')

  // This shape is expected by cds test runner: 
  // - `address()` returns the port 
  // - `url` is the base URL
  return { server: { address: () => p }, url }
}

// Generate a `db-proxy.json` without running tests
module.exports.generateProxy = async function(appDir) {
  const cds = require('@sap/cds')
  cds.root = require('path').resolve(appDir);
  ({ fs: { promises: fs }, path } = cds.utils)
  await buildDatabaseProxy(cds, ['*'])
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
