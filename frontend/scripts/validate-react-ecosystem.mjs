import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)))
const declared = { ...packageJson.dependencies, ...packageJson.devDependencies }
const lockedRoot = {
  ...packageLock.packages[''].dependencies,
  ...packageLock.packages[''].devDependencies,
}

const fail = (message) => {
  console.error(`React ecosystem validation failed: ${message}`)
  process.exitCode = 1
}

if (declared.react !== declared['react-dom']) {
  fail(`react (${declared.react}) and react-dom (${declared['react-dom']}) must match`)
}

const major = (version) => Number.parseInt(version.match(/\d+/)?.[0] ?? '', 10)
if (major(declared['@types/react']) !== major(declared['@types/react-dom'])) {
  fail('@types/react and @types/react-dom must have the same major generation')
}
if (major(declared.react) !== major(declared['@types/react'])) {
  fail('React and its type declarations must have the same major generation')
}

for (const name of ['eslint', 'eslint-plugin-react-hooks', 'eslint-plugin-react-refresh']) {
  if (!declared[name]) fail(`${name} must be declared`)
}
if (declared.eslint !== '10.7.0') fail('eslint must be pinned to 10.7.0')

for (const name of ['eslint-plugin-react-hooks', 'eslint-plugin-react-refresh']) {
  const metadata = JSON.parse(
    readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url)),
  )
  if (!metadata.peerDependencies?.eslint?.includes('10')) {
    fail(`${name} does not declare ESLint 10 compatibility`)
  }
}

for (const [name, version] of Object.entries(declared)) {
  if (lockedRoot[name] !== version) {
    fail(`${name} differs between package.json (${version}) and package-lock.json (${lockedRoot[name]})`)
  }
}

const dependencyTree = spawnSync('npm', ['ls', '--all'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
if (dependencyTree.status !== 0) {
  fail(`npm ls reports invalid peer dependencies\n${dependencyTree.stdout}${dependencyTree.stderr}`)
}

if (!process.exitCode) console.log('React ecosystem versions and peer dependencies are coherent.')
