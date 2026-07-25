## [1.9.1](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.9.0...v1.9.1) (2026-07-25)


### Bug Fixes

* **shell:** use static import for chat-session in RequireAuth ([5bec903](https://github.com/kodingvibes/late.kodingvibes.com/commit/5bec903a163219d249a812b92e4d80308b2c42e7))

# [1.9.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.8.1...v1.9.0) (2026-07-25)


### Features

* **shell:** gate /icecast and /irc behind an auth check ([fe88681](https://github.com/kodingvibes/late.kodingvibes.com/commit/fe8868191c09ab21ea13516ef9d3e597dabdef59))

## [1.8.1](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.8.0...v1.8.1) (2026-07-25)


### Bug Fixes

* **deployd:** unwrap {valid,user} response from /api/auth/validate ([93f58aa](https://github.com/kodingvibes/late.kodingvibes.com/commit/93f58aa0db9906a57738686ba3f2705cea172dbb))

# [1.8.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.7.0...v1.8.0) (2026-07-25)


### Features

* **deployd:** super_admin dashboard at /dashboard ([735eca8](https://github.com/kodingvibes/late.kodingvibes.com/commit/735eca88941fcc70a3eb2f1055b932334cc39d8f))

# [1.7.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.6.1...v1.7.0) (2026-07-25)


### Features

* **deployd:** auto-restart late-auth-service on push ([d827dbd](https://github.com/kodingvibes/late.kodingvibes.com/commit/d827dbd4a27764f5da7713ae1c2fc2646984cefe))

## [1.6.1](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.6.0...v1.6.1) (2026-07-25)


### Bug Fixes

* **chat:** pass session display_name/email to message repo functions ([2e75c88](https://github.com/kodingvibes/late.kodingvibes.com/commit/2e75c88224b68c5d8567ad372b4aaa69a899d683))

# [1.6.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.5.0...v1.6.0) (2026-07-25)


### Bug Fixes

* **deployd:** use Docker restart script and /healthz probe ([d2ab39c](https://github.com/kodingvibes/late.kodingvibes.com/commit/d2ab39cdb81adb06d0061c0f8c1011dbd7e78ccf))


### Features

* **chat-bridge:** add /healthz endpoint + Docker restart script ([223e462](https://github.com/kodingvibes/late.kodingvibes.com/commit/223e462a595035e70855806c9daa72c74d303765))

# [1.5.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.4.0...v1.5.0) (2026-07-25)


### Features

* **shell:** point chat-session at /api/auth/* (late-auth-service) ([20d6c53](https://github.com/kodingvibes/late.kodingvibes.com/commit/20d6c531038f759c325292a83deb420384dbc23a))

# [1.4.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.3.0...v1.4.0) (2026-07-25)


### Features

* **shell:** own the chat session, expose window.LateSession to the chat micro ([5dcb10b](https://github.com/kodingvibes/late.kodingvibes.com/commit/5dcb10b6b29d5080d5213ac3c8deb85f6c93cec0))

# [1.3.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.2.0...v1.3.0) (2026-07-25)


### Features

* **chat:** every user belongs to every channel ([4e3d539](https://github.com/kodingvibes/late.kodingvibes.com/commit/4e3d5394d43efe0ce84ea3f689ebe6c6ca008c8d))

# [1.2.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.1.0...v1.2.0) (2026-07-25)


### Features

* image dimensions on attachments for chat layout pre-allocation ([1d17790](https://github.com/kodingvibes/late.kodingvibes.com/commit/1d177909cc10cac004bf17b6292f89fa520ae7c4))

# [1.1.0](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.0.1...v1.1.0) (2026-07-24)


### Features

* time-boxed author-only message editing ([47f5bca](https://github.com/kodingvibes/late.kodingvibes.com/commit/47f5bca535f4120f391d82536ef0afaaa83a29a0))

## [1.0.1](https://github.com/kodingvibes/late.kodingvibes.com/compare/v1.0.0...v1.0.1) (2026-07-24)


### Bug Fixes

* **deploy:** restart chat-bridge on every shell deploy and verify unfurl health ([814cda6](https://github.com/kodingvibes/late.kodingvibes.com/commit/814cda600597f8a6e7bf1f970b85bafb0393f110))

# 1.0.0 (2026-07-24)


### Bug Fixes

* **chat-bridge:** clear og_data on hide/delete ([7c6dad4](https://github.com/kodingvibes/late.kodingvibes.com/commit/7c6dad40770dea905e208178ad944afb954456a9))
* **deploy:** correct f-string in deployd self-restart log line ([4ae92ed](https://github.com/kodingvibes/late.kodingvibes.com/commit/4ae92edf28af2d17145d24c7ef83d73ad276e6e5))
* **deploy:** use f-strings for timestamps in deploy logs ([93ca925](https://github.com/kodingvibes/late.kodingvibes.com/commit/93ca925bc7c019a9c12acc89a9d1afe0e5d39699))
* **shell:** cache-busting ?v=version en URLs de microfronts para Safari ([8c30797](https://github.com/kodingvibes/late.kodingvibes.com/commit/8c307975576d0f8ec2c4b2be7bebb8f6215ad539))
* **shell:** evitar loop de recarga de UpdateNotice tras limpiar caché ([8b0a26a](https://github.com/kodingvibes/late.kodingvibes.com/commit/8b0a26a7a535a8760f0a24097fa8747aa07b5baf))
* **shell:** hard-reload con ?late_cb para Safari al aplicar actualización ([7e453d5](https://github.com/kodingvibes/late.kodingvibes.com/commit/7e453d52f943bd3044faffb84d648b80dce87aec))
* single-tap to enter channel on mobile sidebar ([173c3ef](https://github.com/kodingvibes/late.kodingvibes.com/commit/173c3ef90166a50ef8149e3c672ffeccb2f007a9))


### Features

* add quick exit button to voice room (mobile) ([fbf3dd3](https://github.com/kodingvibes/late.kodingvibes.com/commit/fbf3dd37a6545dd38221580a25bf7c3bcf8fc446))
* **chat-bridge:** shared link-preview service, SSRF-safe fetch, unfurl endpoint ([1a6b5a6](https://github.com/kodingvibes/late.kodingvibes.com/commit/1a6b5a63c96082999d35f906b163ea7d9af7bb0f))
* **deploy:** add late-deployd auto-deploy webhook receiver ([18d2c1b](https://github.com/kodingvibes/late.kodingvibes.com/commit/18d2c1bc6c62abefa41cb7ae7a86ec308124d200))
* **deploy:** rebuild shell after microfrontend deploys ([da6a5a6](https://github.com/kodingvibes/late.kodingvibes.com/commit/da6a5a63c3390da9118173672ef1ace54741d1cd))
* **shell:** consume window.RadioEngine via useSyncExternalStore ([e993445](https://github.com/kodingvibes/late.kodingvibes.com/commit/e9934459879bb1faa4bd21892d644fff9015a22c))
* **shell:** new-version toast via BroadcastChannel + /version.json poll ([9637547](https://github.com/kodingvibes/late.kodingvibes.com/commit/96375478cb9ae5cd5f20d825e284bd994f70af1d))
* **shell:** UpdateNotice ahora limpia CacheStorage y late.seen antes de recargar ([d1661c8](https://github.com/kodingvibes/late.kodingvibes.com/commit/d1661c8d46a49002b379edb2ac9a22e5a842e7d6))
* **shell:** wire microfronts via import map + latest symlink ([21c374a](https://github.com/kodingvibes/late.kodingvibes.com/commit/21c374a2b77bf1527acba5655473ab5195a7d0ba))
* show who is in a voice room before joining ([1125058](https://github.com/kodingvibes/late.kodingvibes.com/commit/112505891715f647b2a13981ace44703a7c06761))
