/**
 * @param {Function} message
 * @param {Function} [fn]
 */
global.before = (message, fn = message) => global.beforeAll(fn)
/**
 * @param {Function} message
 * @param {Function} [fn]
 */
global.after  = (message, fn = message) => global.afterAll(fn)
