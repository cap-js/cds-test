const childProcess = require('child_process')
let fs, path

function buildElements(elements = {}) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    if (el.type === 'cds.Composition' || el.items) continue
    if (el['@odata.foreignKey4']) continue
    if (el.type === 'cds.Association' && !el.keys) continue
    const e = {}
    if (el.key)       e.key       = true
    if (el.type)      e.type      = el.type
    if (el.length && el.type !== 'cds.UUID')    e.length    = el.length
    if (el.precision) e.precision = el.precision
    if (el.scale)     e.scale     = el.scale
    if (el.type === 'cds.Association') {
      if (el.target) e.target = el.target
      if (el.keys)   e.keys   = el.keys
    }
    result[name] = e
  }
  return result
}

function buildDraftElements(elements = {}, linkedModel) {
  const result = {}
  for (const [name, el] of Object.entries(elements)) {
    if (el.virtual) continue
    // TODO: What does this mean for expanding on draft entities? Why would we skip these? Especially compositions should not be skipped. There should not be a reason to.
    if (el.type === 'cds.Composition' || el.items) continue
    if (el.type === 'cds.Association') {
      if (el.keys) {
        for (const { ref: [keyName] } of el.keys) {
          const fkName = `${name}_${keyName}`
          const targetKeyEl = linkedModel?.definitions[el.target]?.elements?.[keyName]
          result[fkName] = { type: targetKeyEl?.type ?? 'cds.Integer' }
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

    hcqlDatabaseProxy.definitions[proxyKey] = {
      kind: 'entity',
      '@requires': 'any',
      '@cds.persistence.exists': true,
      '@cds.persistence.name': name.replace(/\./g, '_').toUpperCase(),
      elements: buildElements(def.elements)
    }

    proxyMap[name] = proxyKey
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
      elements: buildDraftElements(def.elements, linked)
    }

    proxyMap[draftName] = proxyKey
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

  cds.entities

  return proxyMap
}

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
