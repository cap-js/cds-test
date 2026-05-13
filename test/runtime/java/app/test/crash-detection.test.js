const cds_test = require("../../../../../lib/cds-test");

describe("Java crash detection", () => {
  const t = cds_test(__dirname + "/..")
  const { expect, cds } = t

  it("should report crash context on follow-up requests after Java app crashes", async () => {
    // Force-kill the Java process — simulates an unexpected crash
    process.kill(t.server.pid, 'SIGKILL')

    await new Promise(r => setTimeout(r, 200))

    // Any subsequent HCQL request must carry an crash info
    let error; try {
      const { Books } = cds.entities('bookshop')
      await cds.db.run(SELECT.from(Books))
    } catch (e) { error = e }

    expect(error, 'expected cds.db to report the crash').to.exist
    expect(error.message).to.match(/Java application.*crashed/i)
  })
})
