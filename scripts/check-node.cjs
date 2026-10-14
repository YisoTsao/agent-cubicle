// Fails fast with a clear message when the Node on PATH is too old for the dev toolchain
// (electron-vite 5 and vite 8 need Node ^20.19 or >=22.12). Plain CommonJS so it also runs on old Node.
const [major, minor] = process.versions.node.split('.').map(Number)
const ok = major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19)
if (!ok) {
  console.error(
    `Node ${process.versions.node} is too old for this project; use Node ^20.19 or >=22.12 ` +
      '(see .nvmrc). On this machine: nvm use 22, or pnpm env use --global 22.',
  )
  process.exit(1)
}
