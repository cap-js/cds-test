const childProcess = require('child_process')
let fs, path

// TODO: This should use a more speaking name and get a best-practices js-doc comment instead of a chatty inline comments
function buildElements(elements = {}, proxyMap = {}) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    // TODO: This does not explain why we would skip fields with el.items ...
    // el.items is set on scalar array types (e.g. many String) — not on cds.Composition.
    // This guard never affects compositions; the handler below is always reached for them.
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
      if (!el.target || !proxyMap[el.target]) continue
      e.target = proxyMap[el.target]
      if (el.cardinality) e.cardinality = el.cardinality
      if (el.on) e.on = el.on
    }
    if (el.type === 'cds.Association') {
      // Association targets must remap to proxy entities: if we point to real bookshop.* entities,
      // the CDS compiler auto-exposes them into dbProxy, causing name collisions with our explicit definitions.
      if (el.target) e.target = proxyMap[el.target] ?? el.target
      if (el.keys)   e.keys   = el.keys
    }
    result[name] = e
  }
  return result
}

// TODO: We should re-consider if the two build functions can be consolidated; We need to carefully whey cost & benefit
// TODO: This should use a more speaking name and get a best-practices js-doc comment instead of a chatty inline comments
function buildDraftElements(elements = {}, linkedModel, proxyMap = {}) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    if (el.virtual) continue
    if (el.items) continue
    if (el.type === 'cds.Composition') {
      if (!el.target || !proxyMap[el.target]) continue
      const e = { target: proxyMap[el.target] }
      if (el.cardinality) e.cardinality = el.cardinality
      if (el.on) e.on = el.on
      result[name] = e
      continue
    }
    if (el.type === 'cds.Association') {
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
  Object.assign(result, {
    IsActiveEntity:                    { type: 'cds.Boolean' },
    HasActiveEntity:                   { type: 'cds.Boolean' },
    HasDraftEntity:                    { type: 'cds.Boolean' },
    DraftAdministrativeData_DraftUUID: { type: 'cds.UUID' }
  })
  return result
}

// TODO: In general use more "speaking" code rather than chatty comments
// TODO: Investigate options for consolidating the logic in this function: The repeated iterations still bother me ...
// TODO: This should get a best-practices js-doc comment instead of a chatty inline comments
const injectTestRuntimeDatabaseProxy = async (cds, options) => {
  const servicesPath = path.resolve(cds.root, cds.env.folders.srv)

  await Promise.allSettled([
    fs.unlink(path.resolve(servicesPath, 'db-proxy.cds')),
    fs.unlink(path.resolve(servicesPath, 'db-proxy.json')),
  ])

  const from = [...(options.from?.split(',') ?? ['*'])]
  const model  = await cds.load(from)
  const linked = cds.linked(model)
  
  // Define a HCQL service for the Java app-runtime
  // > ... that will expose ALL database entities
  const hcqlDatabaseProxy = {
    '$version': '2.0',
    definitions: {
      dbProxy: { kind: 'service', '@path': 'dbProxy', '@protocol': ['hcql'], '@requires': 'any' }
    }
  }

  const proxyMap = {}
  const usedProxyNames = new Set()
  const uniqueProxyName = candidate => {
    if (usedProxyNames.has(candidate)) throw new Error(`Proxy name collision: '${candidate}'`)
    usedProxyNames.add(candidate)
    return candidate
  }

  // Association targets remap to proxy entities (not real bookshop.* entities): if we point to
  // the real entities, the CDS compiler auto-exposes them into dbProxy, causing name collisions.
  // Pass 1: compute all proxy names so association targets can be remapped in pass 2.
  const entityDefs = []
  for (const [name, def] of Object.entries(model.definitions)) {
    if (def.kind !== 'entity') continue
    if (def.projection || def.query) continue
    if (def['@cds.persistence.exists']) continue

    // Derive local name from entity name segments. '.texts' suffix is always prefixed
    // with the parent entity name to avoid collisions (e.g. bookshop.Books.texts → BooksTexts).
    const segments = name.split('.')
    const last = segments.at(-1)
    const localName = last === 'texts'
      ? segments.at(-2) + 'Texts'
      : last

    const proxyKey = 'dbProxy.' + uniqueProxyName(localName)
    proxyMap[name] = proxyKey
    entityDefs.push({ name, def, proxyKey })
  }

  // Pass 2: build proxy entity definitions with association targets remapped to proxy equivalents.
  // Remapping prevents the CDS compiler from auto-exposing bookshop.* entities into dbProxy,
  // which would collide with the explicitly defined proxy entities.
  for (const { name, def, proxyKey } of entityDefs) {
    hcqlDatabaseProxy.definitions[proxyKey] = {
      kind: 'entity',
      '@requires': 'any',
      '@cds.persistence.exists': true,
      '@cds.persistence.name': name.replace(/\./g, '_').toUpperCase(),
      elements: buildElements(def.elements, proxyMap)
    }
  }

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
      elements: buildDraftElements(def.elements, linked, proxyMap)
    }

    proxyMap[draftName] = proxyKey
  }

  // Draft shadow tables also exist for composed sub-entities of draft-enabled roots.
  // CAP Java creates a physical _drafts table for every entity in the composition tree.
  // Traversal is recursive to handle compositions of compositions at any depth.
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

  for (const [name, def] of Object.entries(linked.definitions)) {
    if (def.kind !== 'entity' || !def['@odata.draft.enabled']) continue
    for (const targetName of collectComposedDescendants(name)) {
      const draftName = targetName + '.drafts'
      if (proxyMap[draftName]) continue
      const targetDef = linked.definitions[targetName]
      if (!targetDef || targetDef.kind !== 'entity') continue
      const localName = targetName.split('.').at(-1) + 'Drafts'
      const proxyKey = 'dbProxy.' + uniqueProxyName(localName)
      proxyMap[draftName] = proxyKey
      hcqlDatabaseProxy.definitions[proxyKey] = {
        kind: 'entity',
        '@requires': 'any',
        '@cds.persistence.exists': true,
        '@cds.persistence.name': draftName.replace(/\./g, '_').toUpperCase(),
        elements: buildDraftElements(targetDef.elements, linked, proxyMap)
      }
    }
  }

  await Promise.all([
    fs.writeFile(path.resolve(servicesPath, 'db-proxy.cds'), `using from './db-proxy.json';`),
    fs.writeFile(path.resolve(servicesPath, 'db-proxy.json'), JSON.stringify(hcqlDatabaseProxy)),
  ])

  cds.model = await cds.load([...from, path.resolve(servicesPath, 'db-proxy.cds')])
  cds.model = cds.linked(cds.model)
  cds.compile.for.lean_drafts(cds.model)

  // lean_drafts only links .drafts on service entities with full Fiori annotations; plain
  // cds.load doesn't produce those, so we propagate the link down to the underlying db entity.
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

  return proxyMap
}

// TODO: This should get pragmatic, short, precise inline comments for relevant conceptual blocks
module.exports = async function java(...args) {
  const { cds, axios } = this; ({ fs: { promises: fs }, path } = cds.utils)

  this.defaults.headers['Odata-Version'] = '4.0'

  const [, options] = require('@sap/cds/bin/args')(require('@sap/cds/bin/serve'), args)

  const proxyMap = await injectTestRuntimeDatabaseProxy(cds, options)

  const p = await port()
  const url = `http://localhost:${p}`

  const pomFile = path.resolve(cds.root, cds.env.folders.srv, 'pom.xml')
  const appName = await fs.readFile(pomFile, 'utf8')
    .then(xml => xml.replace(/<parent>[\s\S]*?<\/parent>/, '').match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? 'app')
    .catch(() => 'app')

  const jarFile = path.resolve(cds.root, cds.env.folders.srv, `target/${appName}-exec.jar`)

  await new Promise((resolve, reject) => {
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

  cds.env.requires.db = { impl: require.resolve('./java-hcql.js'), axios, proxyMap }

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
