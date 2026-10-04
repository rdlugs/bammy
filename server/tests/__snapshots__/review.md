## Bammy review

⛔ **Blocked**: 1 finding at or above critical.

- **critical** `src/app.ts:11`: SQL built from @​input

4 findings (1 critical, 1 major, 2 minor): 2 actionable, 2 in the sections below.

### Walkthrough

Adds b and c.

Labels: `feature` · Review effort: 1/5 · Blast radius: small

<details>
<summary>Changes (1 file)</summary>

| File | Summary |
| --- | --- |
| `src/app.ts` | Two new constants. |

</details>

<details>
<summary>Actionable comments (2)</summary>

- **critical** `src/app.ts:11`: SQL built from @​input
- **minor** `src/app.ts:12`: c is never negative

</details>

<details>
<summary>Outside diff range comments (1)</summary>

#### `src/app.ts:40`: Caller ignores &lt;result&gt;

*major · bug · potential issue*

Adding one can exceed the safe integer range.

**Evidence:** x | y

</details>

<details>
<summary>Nitpick comments (1)</summary>

#### `src/app.ts:12`: Name c more clearly

*minor · bug · nitpick*

Adding one can exceed the safe integer range.

**Evidence:** main() is called with Number.MAX_SAFE_INTEGER from the CLI.

</details>

<details>
<summary>Not reviewed (1 item)</summary>

- `package-lock.json`: ignored by configuration

</details>

**Notes**

- .bammy.yaml was ignored: review: unknown setting nope

<sub>Reviewed `head` with anthropic/claude-sonnet-5-5 · 1 review pass · 1 file reviewed</sub>

<!-- bammy:summary -->
