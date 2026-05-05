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
 * active entities via {@link buildProxyEntityElements}, draft shadow tables via
 * {@link buildProxyDraftElements} — and writes it to srv/ as two files:
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

  // Read existing proxy content before unlinking — used for change detection below.
  const existingContent = await fs.readFile(proxyJsonPath, 'utf8').catch(() => null)

  // Remove proxy files before cds.load — prevents them from being picked up
  // by the model load as duplicate definitions.
  await Promise.allSettled([
    fs.unlink(proxyCdsPath),
    fs.unlink(proxyJsonPath),
  ])

  const linked = cds.linked(await cds.load(from))

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

  // CAP Java creates _drafts tables for the full composition tree, not just draft-enabled roots.
  const collectComposedDescendants = (entityName, descendants = new Set(), visited = new Set()) => {
    if (visited.has(entityName)) return descendants
    visited.add(entityName)
    const def = linked.definitions[entityName]
    for (const [, el] of Object.entries(def?.elements ?? {})) {
      if (el.type !== 'cds.Composition' || !el.target) continue
      // CAP Java does not create _drafts tables for localization text entities (empirically verified).
      if (el.target.endsWith('.texts')) continue
      descendants.add(el.target)
      collectComposedDescendants(el.target, descendants, visited)
    }
    return descendants
  }

  const buildProxyEntity = (entityName, elements, buildElements = buildProxyEntityElements) => {
    return {
      kind: 'entity',
      '@requires': 'any',
      '@cds.persistence.exists': true,
      '@cds.persistence.name': persistenceName(entityName),
      elements: buildElements(elements, isDBEntity)
    }
  }

  const buildProxyDraftEntity = (entityName, elements) => {
    return buildProxyEntity(entityName, elements, (els, pred) => buildProxyDraftElements(els, linked, pred))
  }

  for (const [name, def] of Object.entries(linked.definitions)) {
    
    if (isDBEntity(name)) {
      const entity = buildProxyEntity(name, def.elements, buildProxyEntityElements)
      hcqlDatabaseProxy.definitions[nameToProxyKey(name)] = entity
    }

    if (def.kind === 'entity' && def['@odata.draft.enabled']) {
      const draftName = name + '.drafts'
      const draftEntity = buildProxyDraftEntity(draftName, def.elements)
      hcqlDatabaseProxy.definitions[nameToProxyKey(draftName)] = draftEntity

      for (const targetName of collectComposedDescendants(name)) {
        const childDraftName = targetName + '.drafts'
        if (hcqlDatabaseProxy.definitions[nameToProxyKey(childDraftName)]) continue

        const targetDef = linked.definitions[targetName]
        if (!targetDef || targetDef.kind !== 'entity') continue

        const childDraftEntity = buildProxyDraftEntity(childDraftName, targetDef.elements)
        hcqlDatabaseProxy.definitions[nameToProxyKey(childDraftName)] = childDraftEntity
      }
    }
  }

  const newContent = JSON.stringify(hcqlDatabaseProxy)

  // Always write proxy files — they were unlinked above and the load phase needs them.
  await Promise.all([
    fs.writeFile(proxyCdsPath,  `using from './db-proxy.json';`),
    fs.writeFile(proxyJsonPath, newContent),
  ])

  return { changed: newContent !== existingContent }
}

function buildCompositionDescriptor(el, isDBEntity) {
  if (!isDBEntity(el.target)) return null
  const e = { target: nameToProxyKey(el.target) }
  if (el.cardinality) e.cardinality = el.cardinality
  if (el.on) e.on = el.on
  return e
}

/**
 * Produces the `elements` block for an active-entity proxy declaration in CSN format.
 *
 * Each proxy entity needs only a minimal field description — the CDS runtime does not need
 * service-layer artefacts that have no physical column. This function distils a real entity's
 * elements to that minimum:
 *   - Keeps structural attributes: key flag, type, length, precision, scale, items
 *   - Drops compiler artefacts with no physical column: `@odata.foreignKey4` aliases,
 *     unmanaged associations (no FK columns)
 *   - Rewrites association and composition targets to proxy names (e.g. `bookshop.Books` →
 *     `dbProxy.bookshop_Books`), preventing the CDS compiler from auto-exposing real entities into
 *     the proxy service and causing naming collisions
 *
 * @param {object} elements    — `elements` map from a CDS linked entity definition
 * @param {function} isDBEntity — predicate: returns true if an entity name is a physical DB table
 * @returns {object}           — lean element map for use in a CSN entity definition block
 * @see buildProxyDraftElements — draft-table variant where associations expand to FK columns
 */
function buildProxyEntityElements(elements = {}, isDBEntity) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    // No physical column — skip: FK aliases, unmanaged associations.
    if (el['@odata.foreignKey4']) continue
    if (el.type === 'cds.Association' && !el.keys) continue
    const e = {}
    if (el.key)       e.key       = true
    if (el.type)      e.type      = el.type
    if (el.items)     e.items     = el.items
    if (el.length && el.type !== 'cds.UUID')    e.length    = el.length
    if (el.precision) e.precision = el.precision
    if (el.scale)     e.scale     = el.scale
    if (el.type === 'cds.Composition') {
      // Remap target to keep the relationship within the proxy service.
      const comp = buildCompositionDescriptor(el, isDBEntity)
      if (!comp) continue
      Object.assign(e, comp)
    }
    if (el.type === 'cds.Association') {
      // Remap target; carry over FK keys.
      if (el.target) e.target = isDBEntity(el.target) ? nameToProxyKey(el.target) : el.target
      if (el.keys)   e.keys   = el.keys
    }
    result[name] = e
  }
  return result
}

/**
 * Draft-table variant of {@link buildProxyEntityElements}.
 *
 * CAP Java creates a physical `*_DRAFTS` shadow table for every draft-enabled entity and
 * each entity in its composition tree. Unlike active-entity tables, these shadow tables are
 * structurally flat: associations are stored as FK columns (e.g. an `author` association
 * with key `ID` becomes the column `author_ID`). This function applies that difference:
 *   - Associations are expanded into their constituent FK columns
 *   - Compositions are remapped to proxy targets (same logic as the active-entity variant)
 *   - The four CAP draft metadata columns are always appended:
 *     `IsActiveEntity`, `HasActiveEntity`, `HasDraftEntity`, `DraftAdministrativeData_DraftUUID`
 *
 * @param {object} elements     — `elements` map from a CDS linked entity definition
 * @param {object} linkedModel  — CDS linked model, used to resolve the types of FK columns
 * @param {function} isDBEntity — predicate: returns true if an entity name is a physical DB table
 * @returns {object}            — lean element map for use in a CSN draft entity definition block
 * @see buildProxyEntityElements — active-entity variant where associations are preserved as-is
 */
function buildProxyDraftElements(elements = {}, linkedModel, isDBEntity) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    if (el.virtual) continue
    if (el.items) continue
    if (el.type === 'cds.Composition') {
      // Same target remapping as the active-entity variant.
      const comp = buildCompositionDescriptor(el, isDBEntity)
      if (!comp) continue
      result[name] = comp
      continue
    }
    if (el.type === 'cds.Association') {
      // Flat _drafts layout — expand associations into FK columns.
      if (el.keys) {
        for (const { ref: [keyName] } of el.keys) {
          const fkName = `${name}_${keyName}`
          const targetKeyEl = linkedModel?.definitions[el.target]?.elements?.[keyName]
          result[fkName] = { type: targetKeyEl?.type ?? 'cds.UUID' }
        }
      }
      continue
    }
    const e = {}
    if (el.key)    e.key    = true
    if (el.type)   e.type   = el.type
    if (el.length && el.type !== 'cds.UUID') e.length = el.length
    result[name] = e
  }
  // Every _drafts table carries these four metadata columns.
  Object.assign(result, {
    IsActiveEntity:                    { type: 'cds.Boolean' },
    HasActiveEntity:                   { type: 'cds.Boolean' },
    HasDraftEntity:                    { type: 'cds.Boolean' },
    DraftAdministrativeData_DraftUUID: { type: 'cds.UUID' }
  })
  return result
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

  // JAR filenameis based on the Maven artifact ID in pom.xml.
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
    cds.log('cds-test/java').warn(
      'Build artifacts are stale or missing — rebuilding JAR.',
      'If running tests in parallel, use the single-threaded *:java npm scripts for local development,',
      'or pre-build the JAR before running parallel tests in CI.'
    )
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
