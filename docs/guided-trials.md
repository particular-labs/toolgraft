# Ask, try, and keep

Ask your existing agent: “Find Toyota listings on ClasificadosOnline.” To improve
it, ask: “Also read the listing descriptions.” Tool names, package versions and
request IDs are the agent's job. ToolGraft supplies tools and instructions, not AI.

1. Approve a connection or website permission when needed.
2. For a read-only adapter change, the agent prepares specific browser tests.
3. Choose **Try update** in the extension. This authorizes the exact candidate
   code and listed inputs to run in a dedicated temporary tab. It does not replace
   the installed adapter. Generated scripts have access to the approved site;
   read-only declarations are not a sandbox or a security guarantee.
4. Review the returned examples with your agent. A returned result proves that
   a call ran, not that every field is correct. Failed tests cannot be kept.
5. Choose **Keep update** or **Discard update**. Keeping checks that the installed
   base still matches, then installs those exact tested bytes. Your agent verifies
   the installed tools and continues your original task.

The temporary tab closes after testing, failure, navigation, disconnection or
expiry. Trials expire after ten minutes. The extension records temporary tab IDs
in session storage so a service-worker restart closes abandoned trial tabs.
A new browser session does not inject trial code again. Discarding code does not
undo website effects; trials are trusted code, not isolated from the website.

Current trials support script adapters declaring only read tools and one to five
specific test calls. Write adapters retain the existing installation and per-call
approval flow. Trial results and requests stay in browser memory and are shared
with the requesting agent; they are not sent to analytics. This feature does not
review community code or prove an adapter safe.

## Agent tools

- `toolgraft_inspect`: focus with `selector`, check up to 12 `selectors`, or page
  through bounded structure using `offset` and `limit`. Returns visible text,
  tags, classes and selector paths without form values or hidden fields. Check
  representative page templates; do not extrapolate one layout to every category.
- `toolgraft_update_tools`: explicit `add`, `update`, `remove` operations. Omitted
  tools retain their exact source. Existing full-set `toolgraft_patch` remains for
  compatibility, but is not the normal editing path.
- `toolgraft_request_trial`: takes the immutable `candidateId` and `tests`, each
  with `tool`, `input` and optionally `expectedError` for an exact application error code. Include at least one successful read case; transport failures never count as expected rejections. The extension owns approval, execution, results and keep.
- `toolgraft_wait`: waits up to 40 seconds for connection or a request. Use
  `until: "installed"` after reviewing test results. It cannot approve anything.
  Agents repeat bounded waits only within their client's session budget.
- `toolgraft_release_pages`: releases eligible idle background tabs created by this agent session. User tabs, activated/navigated tabs and pending work are preserved.
- `toolgraft_resume_draft`: resumes a saved draft in a new authoring session without
  resending its source. An obsolete installed base is refused. Revalidate and get
  fresh approval; previous approvals are never replayed.

If your agent cannot keep waiting, say “Resume my ToolGraft task” after approving.
A fresh session checks saved drafts and connects without reinstalling its MCP.
Multiple saved drafts may require choosing which task to resume. This is explicit
recovery, not an always-running background AI service.

## Ownership and compatibility

`packages/agent-core` owns shared workflow language and review-state labels. The
extension owns permission decisions, temporary browser execution and activation.
`packages/mcp` owns static compilation, immutable candidates and saved drafts;
`update-tools.ts` owns individual source changes. Inspection is bundled extension
code; candidate execution uses only Chrome's User Scripts API. The installed
adapter store and archive format are unchanged. Existing immutable adapters are
not rebuilt or silently updated.

Use matching 0.6.0 extension and MCP packages. Reload the extension and restart the
agent's MCP connection once. The test-project configuration is local; normal setup
should explain whether it applies to one project or to the user's agent generally.

Chrome documents temporary execution with `userScripts.execute` and document
selection in its [User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts).
