# Third-party notices

ToolGraft's own code is MIT (Particular Labs). Dependencies retain their licenses.
No hosted WebMCP Today AGPL application code is included.

| Component                    | Exact source/version                                                    | License                              |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| @webmcp-today/schema         | npm 0.3.0                                                               | MIT, Robert Niimi                    |
| @webmcp-today/engine         | npm 0.1.0                                                               | MIT, Robert Niimi                    |
| HN/Reddit API definitions    | robertn702/webmcp-today commit c65a11a59b4a921d6262f60b7a2fea7892a395d3 | MIT; see each adapter NOTICE/LICENSE |
| zod                          | npm 4.6.5                                                               | MIT, Colin McDonnell                 |
| fflate                       | npm 0.8.3                                                               | MIT, Arjun Barrett                   |
| @jmespath-community/jmespath | npm 1.3.0, unchanged dependency of the API engine                       | MPL-2.0                              |
| Manrope                      | Google Fonts ofl/manrope, original variable font                        | SIL OFL 1.1                          |
| DM Mono                      | Google Fonts ofl/dmmono, original regular/medium fonts                  | SIL OFL 1.1                          |

License texts are in `docs/licenses/` and the packaged extension. Fonts carry copies
of their OFL licenses alongside the font files in every website/extension build.

JMESPath is a separately licensed, unmodified component. Its source is available
from [the upstream repository](https://github.com/jmespath-community/typescript-jmespath/tree/c38a6b37d2fdf6e51713abe19430d18deebd4b5d) and the
source revision recorded by npm for version 1.3.0. The release includes that
original TypeScript source archive under `extension/third-party/` to preserve source availability.
MPL-2.0 applies to that component, not to ToolGraft's independently authored code.

Font sources: [Manrope](https://github.com/google/fonts/tree/main/ofl/manrope),
[DM Mono](https://github.com/google/fonts/tree/main/ofl/dmmono). Upstream engine
and adapter attribution is preserved from the exact published licenses, including
Joakim Selemyr where present. Build-only tooling has its own license metadata in
the pinned dependency tree; it is not redistributed as part of the extension.

The local MCP package installs pinned MCP SDK, esbuild, TypeScript, ws and Zod
dependencies through npm with their original license files. It bundles fflate and
the upstream MIT schema; their notices are also copied into the MCP archive's
`licenses/` directory. The extension and website redistribute that archive as a
download, not as code executed inside their pages.
