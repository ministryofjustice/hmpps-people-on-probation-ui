import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const paths = {
  publicDir: path.join(rootDir, 'public'),
  appDir: path.join(rootDir, 'public', 'app'),
  generatedDir: path.join(rootDir, 'public', 'generated'),
  vendorDir: path.join(rootDir, 'public', 'generated', 'vendor'),
  publicAssetsDir: path.join(rootDir, 'public', 'assets'),
  publicFontsDir: path.join(rootDir, 'public', 'assets', 'fonts'),
  publicImagesDir: path.join(rootDir, 'public', 'assets', 'images'),
  govukDir: path.join(rootDir, 'node_modules', 'govuk-frontend', 'dist', 'govuk'),
  mojDir: path.join(rootDir, 'node_modules', '@ministryofjustice', 'frontend', 'moj'),
  sourceImagesDir: path.join(rootDir, 'assets', 'images'),
}

async function resetDir(dir) {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
}

async function copyIfExists(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { force: true })
}

async function main() {
  await mkdir(paths.publicDir, { recursive: true })
  await mkdir(paths.appDir, { recursive: true })
  await resetDir(paths.generatedDir)
  await resetDir(paths.publicAssetsDir)
  await resetDir(paths.vendorDir)
  await resetDir(paths.publicFontsDir)
  await resetDir(paths.publicImagesDir)

  await mkdir(path.join(paths.vendorDir, 'govuk'), { recursive: true })
  await mkdir(path.join(paths.vendorDir, 'moj'), { recursive: true })

  await copyIfExists(
    path.join(paths.govukDir, 'govuk-frontend.min.css'),
    path.join(paths.vendorDir, 'govuk', 'govuk-frontend.min.css'),
  )
  await copyIfExists(
    path.join(paths.mojDir, 'moj-frontend.min.css'),
    path.join(paths.vendorDir, 'moj', 'moj-frontend.min.css'),
  )

  await cp(path.join(paths.govukDir, 'assets', 'fonts'), paths.publicFontsDir, { recursive: true, force: true })
  await cp(path.join(paths.govukDir, 'assets', 'images'), paths.publicImagesDir, { recursive: true, force: true })
  await cp(path.join(paths.mojDir, 'assets', 'images'), paths.publicImagesDir, { recursive: true, force: true })
  await cp(paths.sourceImagesDir, paths.publicImagesDir, { recursive: true, force: true })
  await copyIfExists(path.join(paths.sourceImagesDir, 'favicon.ico'), path.join(paths.generatedDir, 'favicon.ico'))

}

await main()
