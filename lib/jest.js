let vm = require('vm')
if (!vm.__caching__) {
  vm.__caching__ = true
  const scriptCache = {}
  vm._Script = vm._Script || vm.Script
  class CachedScript extends vm._Script {
    constructor(src, options) {
      const cached = scriptCache[options.filename]
      if (cached) {
        return cached
      }
      super(src, options)
      // Assume that .test.js files are only loaded once
      if (!options.filename.endsWith('.test.js')) {
        scriptCache[options.filename] = this
      }
    }
  }

  vm.Script = CachedScript
}
vm = undefined

let asyncHooks = require('async_hooks')
if (!asyncHooks._AsyncLocalStorage) {
  asyncHooks._AsyncLocalStorage = asyncHooks.AsyncLocalStorage
  class TmpAsyncLocalStorage extends asyncHooks._AsyncLocalStorage {
    disable() {
      if (this._timer) clearTimeout(this._timer)
      return super.disable()
    }

    _enable() {
      if (this._timer) clearTimeout(this._timer)
      this._timer = setTimeout(() => this.disable(), 60 * 1000)
      this._timer.unref()
      return super._enable()
    }
  }

  asyncHooks.AsyncLocalStorage = TmpAsyncLocalStorage
}
asyncHooks = null
