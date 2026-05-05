const childProcess = require('child_process')
let fs, path

/**
 * Generates the HCQL database proxy CSN and writes it to the srv/ directory.
 *
 * CDS Node.js tests use a `db` service to issue queries; when the application runs on Java,
 * the database is owned by the Java process. The HCQL database proxy bridges this gap: it is
 * a synthetic CDS service that exposes every physical database table as a queryable entity,
 * routing CDS ql queries to the Java application via its HCQL HTTP endpoint.
 *
 * This function derives the complete proxy service definition from the application model —
 * active entities via {@link buildProxyEntityElements}, draft shadow tables via
 * {@link buildProxyDraftElements} — and writes it to srv/ as three files:
 * db-proxy.cds, db-proxy.json (the CSN), and proxy-map.json (the entity name mapping).
 *
 * It is called once per JAR build. The load phase (wiring the proxy into cds.model) runs
 * separately on every test invocation.
 *
 * Two passes over the model are required: Pass 1 assigns every entity a unique proxy name;
 * Pass 2 builds the element descriptors. A single pass is not possible because association
 * targets must resolve to proxy names that may not yet have been assigned.
 *
 * @param {object} cds   — the CDS runtime instance
 * @param {string[]} from — model source list (e.g. ['*'] or specific paths)
 */
const buildDatabaseProxy = async (cds, from) => {
  const servicesPath = path.resolve(cds.root, cds.env.folders.srv)

  // Remove any stale proxy files from srv/ — prevents them from being picked up
  // by cds.load(from) as a duplicate when the proxy is about to be rebuilt.
  await Promise.allSettled([
    fs.unlink(path.resolve(servicesPath, 'db-proxy.cds')),
    fs.unlink(path.resolve(servicesPath, 'db-proxy.json')),
    fs.unlink(path.resolve(servicesPath, 'proxy-map.json')),
  ])

  // Load the application model before the proxy is mixed in.
  const model  = await cds.load(from)
  const linked = cds.linked(model)

  // Bare HCQL service definition — proxy entities are registered in passes 1 and 2.
  const hcqlDatabaseProxy = {
    '$version': '2.0',
    definitions: {
      dbProxy: { kind: 'service', '@path': 'dbProxy', '@protocol': ['hcql'], '@requires': 'any' }
    }
  }

  // Name registry for the two-pass algorithm — collisions throw immediately.
  const proxyMap = {}
  const usedProxyNames = new Set()
  const uniqueProxyName = candidate => {
    if (usedProxyNames.has(candidate)) throw new Error(`Proxy name collision: '${candidate}'`)
    usedProxyNames.add(candidate)
    return candidate
  }

  // Pass 1: populate proxyMap so pass 2 can remap association targets.
  const entityDefs = []
  for (const [name, def] of Object.entries(model.definitions)) {
    if (def.kind !== 'entity') continue
    if (def.projection || def.query) continue
    if (def['@cds.persistence.exists']) continue
    if (def['@cds.persistence.skip']) continue

    // .texts collides across entities — prefix parent: Books.texts → BooksTexts.
    const segments = name.split('.')
    const last = segments.at(-1)
    const localName = last === 'texts'
      ? segments.at(-2) + 'Texts'
      : last

    const proxyKey = 'dbProxy.' + uniqueProxyName(localName)
    proxyMap[name] = proxyKey
    entityDefs.push({ name, def, proxyKey })
  }

  // Pass 2: build element descriptors with proxyMap fully populated.
  for (const { name, def, proxyKey } of entityDefs) {
    hcqlDatabaseProxy.definitions[proxyKey] = {
      kind: 'entity',
      '@requires': 'any',
      '@cds.persistence.exists': true,
      '@cds.persistence.name': name.replace(/\./g, '_').toUpperCase(),
      elements: buildProxyEntityElements(def.elements, proxyMap)
    }
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

  // Register draft proxy tables for the entity and its full composition tree.
  for (const [name, def] of Object.entries(linked.definitions)) {
    if (def.kind !== 'entity' || !def['@odata.draft.enabled']) continue
    const draftName = name + '.drafts'
    // Derive draft local name from the parent's already-computed proxy name.
    const parentLocalName = proxyMap[name]?.split('.')[1] ?? name.split('.').pop()
    const proxyKey = 'dbProxy.' + uniqueProxyName(parentLocalName + 'Drafts')
    hcqlDatabaseProxy.definitions[proxyKey] = {
      kind: 'entity',
      '@requires': 'any',
      '@cds.persistence.exists': true,
      '@cds.persistence.name': draftName.replace(/\./g, '_').toUpperCase(),
      elements: buildProxyDraftElements(def.elements, linked, proxyMap)
    }
    proxyMap[draftName] = proxyKey

    for (const targetName of collectComposedDescendants(name)) {
      const childDraftName = targetName + '.drafts'
      if (proxyMap[childDraftName]) continue
      const targetDef = linked.definitions[targetName]
      if (!targetDef || targetDef.kind !== 'entity') continue
      const localName = targetName.split('.').at(-1) + 'Drafts'
      const childProxyKey = 'dbProxy.' + uniqueProxyName(localName)
      proxyMap[childDraftName] = childProxyKey
      hcqlDatabaseProxy.definitions[childProxyKey] = {
        kind: 'entity',
        '@requires': 'any',
        '@cds.persistence.exists': true,
        '@cds.persistence.name': childDraftName.replace(/\./g, '_').toUpperCase(),
        elements: buildProxyDraftElements(targetDef.elements, linked, proxyMap)
      }
    }
  }

  // Store the proxy where the Java app-runtime will pick it up
  await Promise.all([
    fs.writeFile(path.join(servicesPath, 'db-proxy.cds'), `using from './db-proxy.json';`),
    fs.writeFile(path.join(servicesPath, 'db-proxy.json'), JSON.stringify(hcqlDatabaseProxy)),
    fs.writeFile(path.join(servicesPath, 'proxy-map.json'), JSON.stringify(proxyMap)),
  ])
}

function buildCompositionDescriptor(el, proxyMap) {
  const target = proxyMap[el.target]
  if (!target) return null
  const e = { target }
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
 *   - Keeps structural attributes: key flag, type, length, precision, scale
 *   - Drops compiler artefacts with no physical column: `@odata.foreignKey4` aliases,
 *     unmanaged associations (no FK columns), scalar array types (`many String`, etc.)
 *   - Rewrites association and composition targets to proxy names (e.g. `bookshop.Books` →
 *     `dbProxy.Books`), preventing the CDS compiler from auto-exposing real entities into
 *     the proxy service and causing naming collisions
 *
 * @param {object} elements  — `elements` map from a CDS linked entity definition
 * @param {object} proxyMap  — maps real entity names to their proxy counterparts
 * @returns {object}         — lean element map for use in a CSN entity definition block
 * @see buildProxyDraftElements — draft-table variant where associations expand to FK columns
 */
function buildProxyEntityElements(elements = {}, proxyMap = {}) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    // No physical column — skip: scalar arrays (el.items), FK aliases, unmanaged associations.
    if (el.items) continue
    if (el['@odata.foreignKey4']) continue
    if (el.type === 'cds.Association' && !el.keys) continue
    const e = {}
    if (el.key)       e.key       = true
    if (el.type)      e.type      = el.type
    if (el.length && el.type !== 'cds.UUID')    e.length    = el.length
    if (el.precision) e.precision = el.precision
    if (el.scale)     e.scale     = el.scale
    if (el.type === 'cds.Composition') {
      // Remap target to keep the relationship within the proxy service.
      const comp = buildCompositionDescriptor(el, proxyMap)
      if (!comp) continue
      Object.assign(e, comp)
    }
    if (el.type === 'cds.Association') {
      // Remap target; carry over FK keys.
      if (el.target) e.target = proxyMap[el.target] ?? el.target
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
 * @param {object} proxyMap     — maps real entity names to their proxy counterparts
 * @returns {object}            — lean element map for use in a CSN draft entity definition block
 * @see buildProxyEntityElements — active-entity variant where associations are preserved as-is
 */
function buildProxyDraftElements(elements = {}, linkedModel, proxyMap = {}) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    if (el.virtual) continue
    if (el.items) continue
    if (el.type === 'cds.Composition') {
      // Same target remapping as the active-entity variant.
      const comp = buildCompositionDescriptor(el, proxyMap)
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

  // Skip rebuild if the JAR already exists — avoids concurrent Maven builds across test runners.
  const jarExists   = await fs.access(jarFile).then(() => true).catch(() => false)
  const proxyExists = await fs.access(path.join(srvDir, 'proxy-map.json')).then(() => true).catch(() => false)

  if (!jarExists) {
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

  if (!jarExists || !proxyExists) {
    // Build phase: derive the proxy CSN from the compiled model and write it to srv/.
    // Runs once per JAR — the proxy is stable for the lifetime of the JAR.
    await buildDatabaseProxy(cds, from)
  }

  // Load phase: wire the proxy into cds.model. Runs on every test invocation.
  const proxyMap = JSON.parse(await fs.readFile(path.join(srvDir, 'proxy-map.json'), 'utf8'))
  cds.model = await cds.load([...from, proxyFile])
  cds.model = cds.linked(cds.model)
  cds.compile.for.lean_drafts(cds.model)

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
