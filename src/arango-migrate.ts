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
}

(async () => {
  const program = new Command()

  program
    .option('-c, --config <config>', 'path to a js config file. Defaults to ./config.migrate.js')
    .option('-u, --up', 'run up migrations. Defaults to running all unapplied migrations if no --to parameter is provided')
    .option('-d, --down', 'run down migrations')
    .option('-t, --to <version>', 'run migrations up to and including a specific version')
    .option('-s --single <version>', 'run a single migration')
    .option('-i --init <name>', 'initialize a new migration file')
    .option('-ts --typescript', 'initialize a migration file which uses typescript')
    .option('-l --list', 'list all applied migrations')

  program.parse(process.argv)

  const options: CommanderOptions = program.opts()

  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH)

  ArangoMigrate.validateConfigPath(configPath)

  const am = new ArangoMigrate(require(configPath))

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
      am.writeNewMigration(options.init, options.typescript)

      process.exit(0)
    } else if (options.up) {
      am.validateMigrationFolderNotEmpty()
      am.validateMigrationVersions()

      const single = (Number(options.single) >= 0)

      const to = Number(single ? options.single : options.to)

      if (!await am.hasNewMigrations()) {
        console.log('No new migrations to run')
        process.exit(0)
      }

      await am.runUpMigrations(to)
    } else if (options.down) {
      am.validateMigrationFolderNotEmpty()
      am.validateMigrationVersions()

      const single = (Number(options.single) >= 0)

      const to = Number(single ? options.single : options.to)

      if (!to) {
        console.log('To argument is required')
        process.exit(0)
      }

      await am.runDownMigrations(to)
    }
  })
})()
