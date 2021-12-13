import { Command } from 'commander'
import * as path from 'path'
import { ArangoMigrate, ArangoMigrateOptions } from './ArangoMigrate'
import * as fs from 'fs'

export interface CommanderOptions {
    up?: boolean
    down?: boolean
    config?: string
    to?: number
    single?: number
    init?: boolean
    list?: boolean
}

(async () => {
  const DEFAULT_MIGRATIONS_PATH = './migrations'
  const DEFAULT_CONFIG_PATH = './config.migrate.js'
  const MIGRATION_TEMPLATE = `const migration = {
  async collections () {
    return {
      read: [],
      write: [],
      exclusive: []
    }
  },
  async beforeUp (db) {
  },
  async up (db, step, data) {
  },
  async beforeDown (db) {
  },
  async down (db, step, data) {
  }
}
module.exports = migration
`

  const program = new Command()

  program
    .option('-c, --config <config>', 'path to a js config file. Defaults to ./config.migrate.js')
    .option('-u, --up', 'run up migrations. Defaults to running all unapplied migrations if no --to parameter is provided')
    .option('-d, --down', 'run down migrations')
    .option('-t, --to <version>', 'run migrations up to and including a specific version')
    .option('-s --single <version>', 'run a single migration')
    .option('-i --init <name>', 'initialize a new migration file')
    .option('-l --list', 'list all applied migrations')

  program.parse(process.argv)

  const options: CommanderOptions = program.opts()

  if (!fs.existsSync(options.config || DEFAULT_CONFIG_PATH)) {
    console.error(`Config file ${options.config || DEFAULT_CONFIG_PATH} not found`)
    process.exit(1)
  }

  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH)

  const config: ArangoMigrateOptions = require(configPath)

  const migrationsPath = path.resolve(config.migrationsPath || DEFAULT_MIGRATIONS_PATH)

  if (!config.dbConfig) {
    console.error('Config object must contain a dbConfig property')
    process.exit(1)
  }

  const am = new ArangoMigrate(config)

  const migrationsFolderEmpty = () => {
    if (am.migrationPaths.length === 0) {
      console.error(`No migrations found in ${migrationsPath}`)
      process.exit(1)
    }
  }

  const validateMigrationNames = () => {
    const versions: number[] = am.migrationPaths.map(migrationPath => {
      return Number(path.basename(migrationPath).split('_')[0])
    })

    if (versions.length !== new Set(versions).size) {
      console.error('Migrations must have unique versiones')
      process.exit(1)
    }

    if (versions.length) {
      for (let index = 0; index < versions.length; index++) {
        const current = versions[index]
        if (versions.length > Number(index)) {
          const next = versions[index + 1]
          if (next && current + 1 !== next) {
            console.error('Migrations must be numbered consecutively')
            process.exit(1)
          }
        }
      }
    }
  }

  const validateMigrationVersion = async (version) => {
    const latestMigration = await am.getLatestMigration()

    if (!latestMigration && version > 1) {
      console.log(`Migration sequence must start with 1, not ${version}`)
      process.exit(0)
    }

    if (latestMigration && version > Number(latestMigration.version) + 1) {
      console.log(`Migration must be ran in sequence. ${version} must immediately follow ${latestMigration.version}`)
      process.exit(0)
    }

    if (latestMigration && version <= Number(latestMigration.version)) {
      const name = am.getMigrationNameFromVersion((version))

      console.error(`Cannot run up migration ${name} because migration has already been applied`)
      process.exit(1)
    }
  }

  const getDirection = (): 'up' | 'down' => {
    if (options.up === undefined && options.down === undefined) {
      console.error('You must specify either --up or --down')
      process.exit(1)
    }
    return options.up ? 'up' : 'down'
  }

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
      const filePaths = am.migrationPaths

      const version = filePaths.length

      fs.writeFileSync(migrationsPath + `/${version}_${options.init}.js`, MIGRATION_TEMPLATE)
      process.exit(0)
    } else if (Number(options.single) >= 0) {
      migrationsFolderEmpty()
      validateMigrationNames()
      const version = Number(options.single)
      const direction = getDirection()

      if (direction === 'up') {
        await validateMigrationVersion(version)

        await am.runUpMigrations(version, version)
      } else {
        am.runDownMigrations(version, version)
      }

      process.exit(0)
    } else if (options.up) {
      let to = Number(options.to)

      const latestMigration = await am.getLatestMigration()

      const versions = am.migrationPaths.map(migrationPath => {
        return Number(path.basename(migrationPath).split('_')[0])
      })

      if (!to) {
        to = versions[versions.length - 1]
      }

      if (versions[versions.length - 1] === latestMigration.version) {
        console.log('No new migrations to run')
        process.exit(0)
      }

      await am.runUpMigrations(latestMigration?.version ? latestMigration.version + 1 : 1, to)
    }
  })
})()
