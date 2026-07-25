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
