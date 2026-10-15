# Changelog

## [0.2.0](https://github.com/lensapp/bored-mplex/compare/v0.1.5...v0.2.0) (2026-10-15)


### Features

* add per-stream flow control between peers ([2bd7cc0](https://github.com/lensapp/bored-mplex/commit/2bd7cc067656da20770060169d60932708230ae8)), closes [#35](https://github.com/lensapp/bored-mplex/issues/35)
* support half-close on streams ([3132019](https://github.com/lensapp/bored-mplex/commit/3132019359311051a1bb1b6a2becc00c35d4eb85)), closes [#36](https://github.com/lensapp/bored-mplex/issues/36)

## [0.1.5](https://github.com/lensapp/bored-mplex/compare/v0.1.4...v0.1.5) (2026-10-12)


### Bug Fixes

* hold stream writes until the session sends them ([6d1a75b](https://github.com/lensapp/bored-mplex/commit/6d1a75bda0904665e75389a129ef382994983f77))

## [0.1.4](https://github.com/lensapp/bored-mplex/compare/v0.1.3...v0.1.4) (2026-10-07)


### Bug Fixes

* end the reader of a stream when the stream closes ([9b4ee70](https://github.com/lensapp/bored-mplex/commit/9b4ee704056d8ff745a151320327f07160836ab0))
