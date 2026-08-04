const cds = require('@sap/cds')
const express = require('express')

// middleware with redirect to test the redirect handling of the server
cds.on('bootstrap', app => {
  app.get('/ok', (_, res) => res.status(200).send('ok'))
  app.get('/redirect', (_, res) => res.redirect('/ok'))

  // Echoes the raw request body back as application/octet-stream.
  app.post('/echo-binary',
    express.raw({ type: 'application/octet-stream', limit: '10mb' }),
    (req, res) => {
      res.set('Content-Type', 'application/octet-stream')
      res.status(200).send(req.body)
    })
})
