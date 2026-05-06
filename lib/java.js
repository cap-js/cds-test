const childProcess = require('child_process')
let fs, path

const nameToProxyKey = name => 'dbProxy.' + name.replace(/\./g, '_')
const persistenceName = name => name.replace(/\./g, '_').toUpperCase()

/**
 * Derives the HCQL database proxy CSN from the application model and writes it to srv/.
 *
 * CDS Node.js tests use a `db` service to issue queries; when the application runs on Java,
 * the database is owned by the Java process. The HCQL database proxy bridges this gap: it is
 * a synthetic CDS service that exposes every physical database table as a queryable entity,
 * routing CDS ql queries to the Java application via its HCQL HTTP endpoint.
 *
 * This function derives the complete proxy service definition from the application model —
 * active entities via {@link buildActiveElements}, draft shadow tables via
 * {@link buildDraftElements} — and writes it to srv/ as two files:
 * db-proxy.cds and db-proxy.json (the CSN).
 *
 * Run on every test invocation. Returns `{ changed }` — true when the proxy content differs
 * from the previously written file. The caller uses this to decide whether the JAR must be
 * rebuilt (proxy and JAR are treated as a coupled build artifact pair).
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

  // Load the app model. 
  const linked = cds.linked(await cds.load(from))
  // ... old proxy definitions in srv/ are ignored 

  // Bare HCQL service definition — proxy entities are registered in the loop below.
  const hcqlDatabaseProxy = {
    '$version': '2.0',
    definitions: {
      dbProxy: { kind: 'service', '@path': 'dbProxy', '@protocol': ['hcql'], '@requires': 'any' }
    }
  }

  const isDBEntity = name => {
    const d = linked.definitions[name]
    if (!d || d.kind !== 'entity') return false
    if (d.projection || d.query) return false
    if (d['@cds.persistence.exists']) return false
    if (d['@cds.persistence.skip']) return false
    return true
  }

  // CAP Java creates _drafts tables for the full composition tree
  const collectComposedDescendants = (entityName, descendants = new Set(), visited = new Set()) => {
    if (visited.has(entityName)) return descendants
    
    visited.add(entityName)
    
    for (const [, el] of Object.entries(linked.definitions[entityName]?.elements ?? {})) {
      if (el.type !== 'cds.Composition' || !el.target) continue
      if (el.target.endsWith('.texts')) continue // ?: ... no separate tables for _texts?
      descendants.add(el.target)
      collectComposedDescendants(el.target, descendants, visited)
    }
    return descendants
  }

  // Pre-collect entity names that will have draft table proxies so that buildDraftElements
  // can wire composition links between draft proxy entities (e.g. Books_drafts → ExpertReviews_drafts).
  const draftEntityNames = new Set()
  for (const [name, def] of Object.entries(linked.definitions)) {
    if (def.kind === 'entity' && def['@odata.draft.enabled']) {
      draftEntityNames.add(name)
      // TODO: Can there be descendents that are not part of linked.definitions themselves?
      for (const targetName of collectComposedDescendants(name)) {
        if (linked.definitions[targetName]?.kind === 'entity') draftEntityNames.add(targetName)
      }
    }
  }

  // Builds the elements block for an active-entity proxy.
  // - Compositions and associations are remapped to proxy service targets
  // - Associations without no keys and no on condition are dropped.
  const buildActiveElements = (elements = {}) => {
    const activeEntityElements = {}
    for (const [name, el] of Object.entries(elements)) {
      if (el['@odata.foreignKey4']) continue

      if (el.type === 'cds.Composition') {
        if (!isDBEntity(el.target)) continue

        const compositionElement = {
          type: 'cds.Composition',
          target: nameToProxyKey(el.target)
        }
        if (el.cardinality) compositionElement.cardinality = el.cardinality
        if (el.on) compositionElement.on = el.on 

        activeEntityElements[name] = compositionElement
        
        continue
      }

      if (el.type === 'cds.Association') {
        if (!el.keys && !el.on) continue
        const associationElement = {
          type: 'cds.Association'
        }
        if (el.target)      associationElement.target      = isDBEntity(el.target) ? nameToProxyKey(el.target) : el.target
        if (el.keys)        associationElement.keys        = el.keys
        if (el.on)          associationElement.on          = el.on
        if (el.cardinality) associationElement.cardinality = el.cardinality

        activeEntityElements[name] = associationElement

        continue
      }

      const scalarElement = {}
      if (el.key)                               scalarElement.key       = true
      if (el.type)                              scalarElement.type      = el.type
      if (el.items)                             scalarElement.items     = el.items
      if (el.length && el.type !== 'cds.UUID')  scalarElement.length    = el.length
      if (el.precision)                         scalarElement.precision = el.precision
      if (el.scale)                             scalarElement.scale     = el.scale

      activeEntityElements[name] = scalarElement
    }

    return activeEntityElements
  }

  const buildDraftElements = (elements = {}) => {
    // Builds the elements block for a draft-entity proxy.
    const draftEntityElements = {}
    
    for (const [name, el] of Object.entries(elements)) {
      if (el.virtual) continue
      if (el.items) continue

      if (el.type === 'cds.Composition') {
        if (!el.target || !draftEntityNames.has(el.target)) continue
        
        const compositionElement = {
          type: 'cds.Composition',
          target: nameToProxyKey(el.target + '.drafts'),
        }

        if (el.cardinality) compositionElement.cardinality = el.cardinality
        if (el.on) compositionElement.on = remapDraftJoinConditions(el.on, linked.definitions[el.target]?.elements ?? {})

        draftEntityElements[name] = compositionElement
        
        continue
      }

      if (el.type === 'cds.Association') {
        // Flat _drafts layout — expand associations into FK columns.
        for (const { ref: [keyName] } of (el.keys ?? [])) {
          const targetKeyEl = linked.definitions[el.target]?.elements?.[keyName]
          draftEntityElements[`${name}_${keyName}`] = { type: targetKeyEl?.type ?? 'cds.UUID' }
        }
        continue
      }

      const e = {}
      if (el.key)    e.key    = true
      if (el.type)   e.type   = el.type
      if (el.length && el.type !== 'cds.UUID') e.length = el.length
      draftEntityElements[name] = e
    }
    // Every _drafts table carries these four metadata columns.
    Object.assign(draftEntityElements, {
      IsActiveEntity:                    { type: 'cds.Boolean' },
      HasActiveEntity:                   { type: 'cds.Boolean' },
      HasDraftEntity:                    { type: 'cds.Boolean' },
      DraftAdministrativeData_DraftUUID: { type: 'cds.UUID' }
    })
    return draftEntityElements
  }

  const proxyEntityDef = (entityName, elements) => ({
    kind: 'entity',
    '@requires': 'any',
    '@cds.persistence.exists': true,
    '@cds.persistence.name': persistenceName(entityName),
    elements
  })

  for (const [name, def] of Object.entries(linked.definitions)) {

    if (isDBEntity(name)) {
      const entity = proxyEntityDef(name, buildActiveElements(def.elements))
      hcqlDatabaseProxy.definitions[nameToProxyKey(name)] = entity
    }

    if (def.kind === 'entity' && def['@odata.draft.enabled']) {
      const draftEntity = proxyEntityDef(name + '.drafts', buildDraftElements(def.elements))
      hcqlDatabaseProxy.definitions[nameToProxyKey(name + '.drafts')] = draftEntity

      for (const targetName of collectComposedDescendants(name)) {
        const childDraftEntityName = nameToProxyKey(targetName + '.drafts')
        if (hcqlDatabaseProxy.definitions[childDraftEntityName]) continue

        const targetDef = linked.definitions[targetName]
        if (!targetDef || targetDef.kind !== 'entity') continue

        const childDraftEntity = proxyEntityDef(targetName + '.drafts', buildDraftElements(targetDef.elements))
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

/**
 * Remaps a composition on-condition for the draft-table context.
 *
 * Draft tables expand managed associations to FK columns (e.g. `book` → `book_ID`), so the
 * original on-condition references that use association names must be rewritten to use FK
 * column names, and bare `$self` references must be expanded with the corresponding key name.
 *
 * Example: `[{ref:["expertReviews","book"]},"=",{ref:["$self"]}]`
 *       →  `[{ref:["expertReviews","book_ID"]},"=",{ref:["$self","ID"]}]`
 *
 * @param {Array} conditions              — original on-condition token array
 * @param {object} targetElements — elements map of the composition target entity
 * @returns {Array}               — remapped on-condition token array
 */
function remapDraftJoinConditions(conditions, targetElements) {
  let keyName
  return conditions.map(condition => {
    if (!condition.ref) return condition
    const [target, field] = condition.ref
    if (field) {
      const association = targetElements[field]
      if (association?.type === 'cds.Association' && association.keys?.length) {
        keyName = association.keys[0].ref[0]
        return { ref: [target, `${field}_${keyName}`] }
      }
    }
    if (target === '$self' && !field && keyName) return { ref: ['$self', keyName] }
    return condition
  })
}


module.exports = async function java(...args) {
  const { cds, axios } = this; ({ fs: { promises: fs }, path } = cds.utils)

  // Java app requires OData-Version: 4.0 — set as default on cds-test's HTTP client.
  this.defaults.headers['Odata-Version'] = '4.0'

  // reuse cds-serve arg parser to extract --from and other serve options
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

  // Proxy and JAR are a coupled build artifact pair — always derive the proxy from the current
  // model and rebuild the JAR only when the proxy content changed or the JAR is missing.
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

  // Derive proxyMap in-memory from the loaded model — no file I/O needed.
  const proxyMap = {}
  for (const [name] of Object.entries(cds.model.definitions)) {
    if (name.startsWith('dbProxy.')) continue
    const key = nameToProxyKey(name)
    if (cds.model.definitions[key]) proxyMap[name] = key
    const draftKey = nameToProxyKey(name + '.drafts')
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
    if (dbEntity && proxyDraftEntity && !dbEntity.drafts)
      Object.defineProperty(dbEntity, 'drafts', { value: proxyDraftEntity, configurable: true })
  }

  cds.entities // trigger lazy init of entity cache

  // Start the app; resolve only once the HTTP endpoint responds — process spawn is not enough.
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

  // Kill the Java process when the cds session ends.
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

  // shape expected by cds test runner: address() returns the port, url is the base URL
  return { server: { address: () => p }, url }
}

module.exports.generateProxy = async function(appDir) {
  const cds = require('@sap/cds')
  cds.root = require('path').resolve(appDir);
  ({ fs: { promises: fs }, path } = cds.utils)
  await buildDatabaseProxy(cds, ['*'])
}

module.exports._injectTestRuntimeDatabaseProxy = (cds, options) => {
  ;({ fs: { promises: fs }, path } = cds.utils)
  const from = [...(options.from?.split(',') ?? ['*'])]
  return buildDatabaseProxy(cds, from)
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
