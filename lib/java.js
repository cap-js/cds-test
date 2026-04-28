const childProcess = require("child_process");

const generateHcqlMockDatabaseService = async (model, srvPath, fs, path) => {
  // enhance java model with database hcql service
  const db = {
    ...model,
    definitions: {
      db: {
        kind: "service",
        "@path": "db",
        "@protocol": ["hcql"],
        "@requires": "any",
      },
    },
  };

  const services = [];

  for (const name in model.definitions) {
    const def = model.definitions[name];

    if (def.kind === "service") services.push(name);
    if (def.kind !== "entity") continue;
    if (services.find((s) => name.startsWith(s))) continue;
    if (name.endsWith(".transitions_")) continue;

    db.definitions["db." + name] = {
      kind: "entity",
      projection: { from: { ref: [name] } },
    };
  }

  await Promise.all([
    fs.writeFile(path.resolve(srvPath, "db.cds"), `using from './db.json';`),
    fs.writeFile(path.resolve(srvPath, "db.json"), JSON.stringify(db)),
  ]);
};

const startJavaAppProcess = async (url, p, cds, path, fs) => {
  // Locate the Java apps 'srv/pom.xml' & extract its 'artifactId'
  const pomFile = path.resolve(cds.root, cds.env.folders.srv, "pom.xml");
  const appName = await fs
    .readFile(pomFile, "utf8")
    .then((fileContents) => {
      const artifactId = fileContents
        ?.replace(/<parent>[\s\S]*?<\/parent>/, "")
        .match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
      return artifactId ?? "app";
    })
    .catch(() => "app");

  const jarFile = path.resolve(
    cds.root,
    cds.env.folders.srv,
    `target/${appName}-exec.jar`,
  );
  const jarFileExists = await fs.access(jarFile).then(
    () => true,
    () => false,
  );

  return await new Promise((resolve, reject) => {
    const app = jarFileExists
      ? childProcess.spawn("java", [`-jar`, jarFile, `--server.port=${p}`], {
          cwd: cds.root,
          stdio: "inherit",
          env: process.env,
        })
      : childProcess.spawn(
          "mvn",
          ["spring-boot:run", `-Dspring-boot.run.arguments=--server.port=${p}`],
          { cwd: cds.root, stdio: "inherit", env: process.env },
        );

    app.on("error", reject);
    app.on("exit", () => reject(new Error("Application failed to start.")));

    // TODO: Introduce some kind of guard here?
    const ping = () => cds.test.axios.get(url).catch(() => ping());
    ping().then(() => resolve(app));
  });
};

module.exports = async function java(...args) {
  const { cds } = this;
  /* prettier-ignore */
  const { fs: { promises: fs }, path } = cds.utils
  const srv = path.resolve(cds.root, cds.env.folders.srv);

  // forces java to respond @odata.context and @odata.count just like the node runtime
  this.defaults.headers['Odata-Version'] = '4.0'

  cds.env.requires.db = {
    impl: require.resolve("./java-hcql.js"),
    axios: this.axios,
  };

  const [_, options] = require("@sap/cds/bin/args")(
    require("@sap/cds/bin/serve"),
    args,
  );

  // load application model
  const from = [...(options.from?.split(",") ?? ["*"])];
  const model = await cds.load(from);

  // link test environment with application linked model
  if (model.definitions.db) {
    // TODO: I think I have observed this being flaky
    // TODO: > What happens if the db files were generated before?
    // TODO: > What is this case supposed to cover?
    cds.model = model;
  } else {
    await generateHcqlMockDatabaseService(model, srv, fs, path);
    cds.model = await cds.load([...from, path.resolve(srv, "db.cds")]);
  }

  cds.model = cds.linked(cds.compile.for.java(cds.model));
  cds.entities; // ...trigger lazy init

  const p = await port();
  const url = `http://localhost:${p}`;

  const app = await startJavaAppProcess(url, p, cds, path, fs);

  cds.shutdown = () => app.kill();

  // connect to primary database hcql proxy service
  await cds.connect.to("db");

  return { server: { address: () => p }, url };
};

function port() {
  return new Promise((resolve, reject) => {
    const net = require("net");
    const server = net.createServer();
    server.on("error", reject);

    server.listen(() => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
