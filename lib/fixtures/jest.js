/**
 * @param {string} message
 * @param {string} [fn]
 */
global.before = (message, fn = message) => global.beforeAll(fn)
/**
 * @param {string} message
 * @param {string} [fn]
 */
global.after  = (message, fn = message) => global.afterAll(fn)
