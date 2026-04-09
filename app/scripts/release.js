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

// Parse flags: --mac, --win, or both. Default to current platform.
const args = process.argv.slice(2)
let buildMac = args.includes('--mac')
let buildWin = args.includes('--win')
if (!buildMac && !buildWin) {
  // Default: build for current platform
  buildMac = process.platform === 'darwin'
  buildWin = process.platform === 'win32'
}

const platforms = []
if (buildMac) platforms.push('mac')
if (buildWin) platforms.push('win')

console.log(`\n  Building HFEStudy ${version}  (${platforms.join(' + ')})\n`)

// Ensure build/ directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true })
}

// Step 1: Build with electron-vite
console.log('\n  [1/3] Compiling app...\n')
execSync('npx electron-vite build', { stdio: 'inherit', cwd: appDir })

// Step 2: Package with electron-builder
console.log('\n  [2/3] Packaging installer(s)...\n')

const builderFlags = []
if (buildMac) builderFlags.push('--mac')
if (buildWin) builderFlags.push('--win')

execSync(`npx electron-builder ${builderFlags.join(' ')}`, {
  stdio: 'inherit',
  cwd: appDir,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
})

// Find built artifacts in release directory
const releaseDir = path.join(appDir, 'release', version)
if (!fs.existsSync(releaseDir)) {
  console.error(`\n  ERROR: Release directory not found: ${releaseDir}`)
  process.exit(1)
}

const files = fs.readdirSync(releaseDir)
const assets = [] // { src, dest, label } for each uploadable artifact

// Clean old builds from build/
for (const file of fs.readdirSync(buildDir)) {
  if (file.endsWith('.exe') || file.endsWith('.dmg')) {
    console.log(`  Removing old build: ${file}`)
    fs.unlinkSync(path.join(buildDir, file))
  }
}

// Collect Windows artifact
if (buildWin) {
  const exeName = `HFEStudy_${versionTag}.exe`
  const installerExe = files.find(
    (f) => f.endsWith('.exe') && !f.includes('blockmap')
  )
  if (!installerExe) {
    console.error('\n  ERROR: No .exe installer found in release directory')
    console.error('  Files found:', files.join(', '))
    process.exit(1)
  }
  const src = path.join(releaseDir, installerExe)
  const dest = path.join(buildDir, exeName)
  fs.copyFileSync(src, dest)
  assets.push({ path: dest, label: exeName })
}

// Collect Mac artifacts (arm64 and x64 DMGs)
if (buildMac) {
  const dmgFiles = files.filter(
    (f) => f.endsWith('.dmg') && !f.includes('blockmap')
  )
  if (dmgFiles.length === 0) {
    console.error('\n  ERROR: No .dmg installer found in release directory')
    console.error('  Files found:', files.join(', '))
    process.exit(1)
  }
  for (const dmgFile of dmgFiles) {
    // Map arch from the generated name to a clean name
    let cleanName
    if (dmgFile.includes('arm64')) {
      cleanName = `HFEStudy_${versionTag}_Mac_AppleSilicon.dmg`
    } else if (dmgFile.includes('x64')) {
      cleanName = `HFEStudy_${versionTag}_Mac_Intel.dmg`
    } else {
      cleanName = `HFEStudy_${versionTag}_Mac.dmg`
    }
    const src = path.join(releaseDir, dmgFile)
    const dest = path.join(buildDir, cleanName)
    fs.copyFileSync(src, dest)
    assets.push({ path: dest, label: cleanName })
  }
}

// Update VERSION file
fs.writeFileSync(versionFile, version + '\n')

// Print summary
for (const a of assets) {
  const sizeMB = (fs.statSync(a.path).size / (1024 * 1024)).toFixed(1)
  console.log(`  Built: ${a.label}  (${sizeMB} MB)`)
}

// Step 3: Create GitHub Release and upload artifacts
console.log('\n  [3/3] Publishing GitHub Release...\n')
try {
  // Check if release already exists
  let releaseExists = false
  try {
    execSync(`gh release view v${version}`, { cwd: repoRoot, stdio: 'ignore' })
    releaseExists = true
  } catch {}

  const assetPaths = assets.map((a) => `"${a.path}"`).join(' ')

  if (releaseExists) {
    // Upload new assets to existing release (overwrites if same name)
    console.log(`  Release v${version} exists — uploading new assets...\n`)
    execSync(
      `gh release upload v${version} ${assetPaths} --clobber`,
      { stdio: 'inherit', cwd: repoRoot }
    )
  } else {
    // Create new release with all assets
    const assetNames = assets.map((a) => a.label).join(', ')
    execSync(
      `gh release create v${version} ${assetPaths} --title "HFEStudy ${version}" --notes "HFEStudy ${version}\n\nDownload the installer for your platform below."`,
      { stdio: 'inherit', cwd: repoRoot }
    )
  }
  console.log(`\n  Release published: v${version}`)
} catch (err) {
  console.error('\n  WARNING: GitHub Release failed. Artifacts are still in build/')
  console.error('  Make sure gh CLI is installed and authenticated (gh auth login)')
}

console.log('\n  Done!\n')
