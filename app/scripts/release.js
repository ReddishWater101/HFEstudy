const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const appDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appDir, '..')
const buildDir = path.join(repoRoot, 'build')
const versionFile = path.join(repoRoot, 'VERSION')

const pkg = require('../package.json')
const version = pkg.version
const versionTag = 'V' + version.replace(/\./g, '_')
const exeName = `HFEStudy_${versionTag}.exe`

console.log(`\n  Building HFEStudy ${version}  (${exeName})\n`)

// Ensure build/ directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true })
}

// Remove old .exe files from build/
for (const file of fs.readdirSync(buildDir)) {
  if (file.endsWith('.exe')) {
    console.log(`  Removing old build: ${file}`)
    fs.unlinkSync(path.join(buildDir, file))
  }
}

// Step 1: Build with electron-vite
console.log('\n  [1/3] Compiling app...\n')
execSync('npx electron-vite build', { stdio: 'inherit', cwd: appDir })

// Step 2: Package with electron-builder (skip code signing)
console.log('\n  [2/3] Packaging installer...\n')
execSync('npx electron-builder --win', {
  stdio: 'inherit',
  cwd: appDir,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
})

// Find the generated .exe installer
const releaseDir = path.join(appDir, 'release', version)
if (!fs.existsSync(releaseDir)) {
  console.error(`\n  ERROR: Release directory not found: ${releaseDir}`)
  process.exit(1)
}

const files = fs.readdirSync(releaseDir)
const installerExe = files.find(
  (f) => f.endsWith('.exe') && !f.includes('blockmap')
)

if (!installerExe) {
  console.error('\n  ERROR: No .exe installer found in release directory')
  console.error('  Files found:', files.join(', '))
  process.exit(1)
}

// Copy installer to build/ with clean name
const src = path.join(releaseDir, installerExe)
const dest = path.join(buildDir, exeName)
fs.copyFileSync(src, dest)

// Update VERSION file
fs.writeFileSync(versionFile, version + '\n')

const sizeMB = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1)

// Step 3: Create GitHub Release and upload .exe
console.log('\n  [3/3] Publishing GitHub Release...\n')
try {
  // Delete existing release for this version if it exists
  try {
    execSync(`gh release delete v${version} --yes`, { cwd: repoRoot, stdio: 'ignore' })
  } catch {}

  // Delete existing tag if it exists
  try {
    execSync(`git tag -d v${version}`, { cwd: repoRoot, stdio: 'ignore' })
    execSync(`git push origin :refs/tags/v${version}`, { cwd: repoRoot, stdio: 'ignore' })
  } catch {}

  execSync(
    `gh release create v${version} "${dest}" --title "HFEStudy ${version}" --notes "HFEStudy ${version} installer for Windows.\n\nDownload **${exeName}** below and run it to install or update."`,
    { stdio: 'inherit', cwd: repoRoot }
  )
  console.log(`\n  Release published: v${version}`)
} catch (err) {
  console.error('\n  WARNING: GitHub Release failed. The .exe is still in build/')
  console.error('  Make sure gh CLI is installed and authenticated (gh auth login)')
}

console.log(`\n  Done! build/${exeName}  (${sizeMB} MB)\n`)
