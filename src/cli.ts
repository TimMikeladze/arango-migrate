#!/usr/bin/env node

import { Command } from 'commander'
import * as path from 'path'
import { ArangoMigrate, DEFAULT_CONFIG_PATH } from './ArangoMigrate'

interface CommanderOptions {
    up?: boolean
    down?: boolean
    config?: string
    to?: number
    single?: number
    init?: string
    list?: boolean
    typescript?: boolean
    dryRun?: boolean
}

(async () => {
  const program = new Command()

  program
    .option('-c, --config <config>', 'path to a js config file. Defaults to ./config.migrate.js')
    .option('-u, --up', 'run up migrations. Defaults to running all unapplied migrations if no --to parameter is provided')
    .option('-d, --down', 'run down migrations')
    .option('-t, --to <version>', 'run migrations to and including a specific version')
    .option('-i --init <name>', 'initialize a new migration file')
    .option('-l --list', 'list all applied migrations')
    .option('-dr --dry-run', 'dry run. Executes migration lifecycle functions but never commits the transaction to the database or writes to the migration history log')

  program.parse(process.argv)

  const options: CommanderOptions = program.opts()

  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH)

  const config = await ArangoMigrate.loadConfig(configPath)

  const am = new ArangoMigrate(config)

  am.initialize().then(async () => {
    if (options.list) {
      const history = await am.getMigrationHistory()
      if (!history.length) {
        console.log('No migration history')
      } else {
        console.table(history)
      }
      process.exit(0)
    } else if (options.init) {
      console.log('Migration created at ' + am.writeNewMigration(options.init, options.typescript))
      process.exit(0)
    } else if (options.up) {
      am.validateMigrationFolderNotEmpty()
      am.validateMigrationVersions()

      const single = (Number(options.single) >= 0)

      const to = Number(single ? options.single : options.to)

      if (!await am.hasNewMigrations() && !options.dryRun) {
        console.log('No new migrations to run')
        process.exit(0)
      }
      await am.runUpMigrations(to, options.dryRun)
      console.log('Up migrations applied')
      process.exit(0)
    } else if (options.down) {
      am.validateMigrationFolderNotEmpty()
      am.validateMigrationVersions()

      const to = Number(options.to)

      await am.runDownMigrations(to, options.dryRun)
      console.log('Down migrations applied')
      process.exit(0)
    }
  })
})()
