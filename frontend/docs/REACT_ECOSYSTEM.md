# React ecosystem compatibility matrix

The frontend uses React 19 because every production dependency that declares a
React peer supports it. The selected versions were checked against their
published npm peer metadata before the lockfile was regenerated with npm
11.4.2.

| Integration | Pinned version | Relevant compatibility |
| --- | ---: | --- |
| React / React DOM | 19.2.8 | Identical stable versions |
| React type declarations | 19.2.17 / 19.2.3 | Both generation 19 |
| Logto React | 4.0.14 | React `>=16.8.0` |
| React Router DOM | 7.18.1 | React and React DOM `>=18` |
| Tabler React icons | 3.45.0 | React `>=16` |
| Vite / React plugin | 8.1.5 / 6.0.4 | Plugin requires Vite 8 |
| TypeScript / typescript-eslint | 6.0.3 / 8.65.0 | Parser supports TypeScript `<6.1.0` and ESLint 10 |
| Vitest / jsdom | 4.1.10 / 29.1.1 | Vitest supports Vite 8; both support the project Node lines |
| ESLint | 10.7.0 | Requires Node 20.19+, 22.13+, or 24+ |
| React Hooks / Refresh plugins | 7.1.1 / 0.5.3 | Both declare ESLint 10 support |

`eslint-plugin-react` is intentionally not installed: its newest stable
release, 7.37.5, only declares support through ESLint 9.7. The frontend did not
previously use that plugin, and adding it would create the invalid peer
dependency this upgrade is designed to prevent. JSX, hooks, and Fast Refresh
remain covered by TypeScript, `eslint-plugin-react-hooks`, and
`eslint-plugin-react-refresh`.

The source already uses `createRoot` and does not use the React 19 removals
(`ReactDOM.render`, `unmountComponentAtNode`, `findDOMNode`, string refs, or
legacy context). Strict Mode remains enabled. The coordinated type-check, lint,
contract-test, and production-build commands therefore exercise the existing
components and hooks without compatibility shims.

Run `npm run validate:ecosystem` after dependency changes. It checks aligned
React versions, matching type generations, ESLint 10 plugin declarations,
lockfile synchronization, and the complete npm peer-dependency tree.
