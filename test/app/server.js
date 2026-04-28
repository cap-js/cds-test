const cds = require('@sap/cds')

// middleware with redirect to test the redirect handling of the server
cds.on('bootstrap', app => {
  app.get('/ok', (_, res) => res.status(200).send('ok'))
  app.get('/redirect', (_, res) => res.redirect('/ok'))
})