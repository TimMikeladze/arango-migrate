#!/usr/bin/env node

import { Command } from 'commander'
import * as path from 'path'
import { ArangoMigrate, DEFAULT_CONFIG_PATH } from './ArangoMigrate'

interface CommanderOptions {
    config?: string,
    disallowMissingVersions?: boolean,
    down?: boolean,
    dryRun?: boolean,
    init?: string,
    list?: boolean,
    noHistory?: boolean,
    single?: number,
    to?: number,
    typescript?: boolean,
    up?: boolean
}

(async () => {
  const program = new Command()

  program
    .option('-c, --config <config>', 'path to a js config file. Defaults to ./config.migrate.js')
    .option('-u, --up', 'run up migrations. Defaults to running all un-applied migrations if no --to parameter is provided')
    .option('-d, --down', 'run down migrations')
    .option('-t, --to <version>', 'run migrations to and including a specific version')
    .option('-i --init <name>', 'initialize a new migration file')
    .option('-l --list', 'list all applied migrations')
    .option('-dr --dry-run', 'dry run. Executes migration lifecycle functions but never commits the transaction to the database or writes to the migration history log')
    .option('-nh --no-history', 'Skips writing to the migration history log. Use this with caution since the applied migrations will not be saved in the migration history log, opening the possibility of applying the same migration multiple times and potentially dirtying your data')
    .option('--disallow-missing-versions', 'raise an exception if there are missing versions when running down migrations')

  program.parse(process.argv)

  const options: CommanderOptions = program.opts()

  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH)

  const config = await ArangoMigrate.loadConfig(configPath)

  const am = new ArangoMigrate(config)

  am.initialize().then(async () => {
    if (options.list) {
      const history = await am.getMigrationHistory()
      if (!history.length) {
        console.log('No migration history.')
      } else {
        console.table(history)
      }
      process.exit(0)
    } else if (options.init) {
      console.log(`Migration created at ${am.writeNewMigration(options.init, options.typescript)}.`)
      process.exit(0)
    } else if (options.up) {
      am.validateMigrationFolderNotEmpty()
      am.validateMigrationVersions()

      const single = (Number(options.single) >= 0)

      const to = Number(single ? options.single : options.to)

      if (!await am.hasNewMigrations() && !options.dryRun) {
        console.log('No new migrations to run.')
        process.exit(0)
      }
      const { createdCollections, appliedMigrations } = await am.runUpMigrations(to, options.dryRun, options.noHistory)
      console.log(`${createdCollections} collections created.`)
      if (options.dryRun) {
        console.log(`${appliedMigrations} \`up\` migrations dry ran.`)
      } else {
        console.log(`${appliedMigrations} \`up\` migrations applied.`)
      }

      process.exit(0)
    } else if (options.down) {
      am.validateMigrationFolderNotEmpty()
      am.validateMigrationVersions()

      const to = Number(options.to)

      const { createdCollections, appliedMigrations } = await am.runDownMigrations(to, options.dryRun, options.noHistory, options.disallowMissingVersions)
      console.log(`${createdCollections} collections created.`)
      if (options.dryRun) {
        console.log(`${appliedMigrations} \`down\` migrations dry ran.`)
      } else {
        console.log(`${appliedMigrations} \`down\` migrations applied.`)
      }

      process.exit(0)
    }
  })
})()
