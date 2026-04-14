# Change Log

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-...

### Changed

- Usage of `axios` has been removed in favor of the Fetch API, which is available in Node.js 18 and later. This change allows for a more modern and native approach to making HTTP requests, eliminating the need for an external dependency.  For compatibility, if it's is installed explicitly, the `axios` library will used.

- When running in Jest, the `expect` from `cds.test` now returns a built-in implementation which covers the most common matchers with the common _chai_ API.  In other runners, the `expect` from `cds.test` returns the `chai.expect` implementation as before.

- Assertion stack traces no longer contain frames of cds-test's own implementation.

### Removed

- Dependencies to `axios` -> install it yourself if you want to use `axios`.

### Added

- Support for the [Vitest](https://vitest.dev/) test runner.

### Fixed

- `cds.test` can now be used in combination with ESM modules without issues.
- `cds.test` can now be used in combination with `chai` 6 and `chai-as-promised` 8.

## [0.4.1] - 2025-11-10

### Fixed

- `it.each()` only uses the first entry of nested arrays
- Non-axios variant returns response `status` field also as `code`.

### Fixed

## [0.4.0] - 2025-06-24

### Added

- Support for `err.cause` in `Axios` errors
- Experimental support for `fetch` instead of `Axios`

## [0.3.0] - 2025-04-03

### Added

- add `toBeNull` matcher to Jest expectations

### Changed

- Many changes to the experimental test runner.

### Fixed

- Prevent jest and mocha from giving random timeout errors if `cds.test.data.reset` is used.

## [0.2.0] - 2025-03-04

### Changed

- `@sap/cds` 8.8.0 is required at the minimum

## [0.1.2] - 2025-02-21

### Added

- Publish to NPM with provenance attestation

## [0.1.1] - 2025-02-21

### Fixed

- Cleanups

## [0.1.0] - 2025-02-21

### Added

- Initial version
