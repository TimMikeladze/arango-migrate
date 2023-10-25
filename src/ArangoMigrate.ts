import { Config } from 'arangojs/connection'
import glob from 'glob'
import path from 'path'
import { aql, Database } from 'arangojs'
import { CollectionType, CreateCollectionOptions, DocumentCollection, EdgeCollection } from 'arangojs/collection'
import fs from 'fs'
import slugify from 'slugify'
import { TransactionOptions } from 'arangojs/database'

type Collection = DocumentCollection<any> & EdgeCollection<any>

export interface CollectionOptions {
  collectionName: string
  options?: CreateCollectionOptions & {
    type?: CollectionType
  }
}

export type Collections = Array<string | CollectionOptions>

export type StepFunction = (callback) => Promise<any>

export interface Migration {
  /**
   * Optional function that will be called after the migration's `down` function is executed.
   * @param {Database} db - Database instance.
   * @param {*} data - Optional value received from the `beforeDown` function.
   * @returns {Promise<*>} - Value returned will be passed to the `afterDown` function.
   */
  afterDown?: (db: Database, data?: any) => Promise<any>,
  /**
   * Optional function that will be called after the migration's `up` function is executed.
   * @param {Database} db - Database instance.
   * @param {*} data - Value returned from the `up` function.
   * @returns {Promise<*>} - Value returned will be passed to the `afterUp` function.
   */
  afterUp?: (db: Database, data?: any) => Promise<void>,
  /**
   * Optional function that will be called before the migration's `down` function is executed.
   * @param {Database} db - Database instance.
   * @returns {Promise<*>} - Value returned will be passed to the `down` function.
   */
  beforeDown?: (db: Database) => Promise<any>,
  /**
   * Optional function that will be called before the migration's `up` function is executed.
   * @param {Database} db -  Database instance.
   * @returns {Promise<*>} - Value returned will be passed to the `up` function.
   */
  beforeUp?: (db: Database) => Promise<any>
  /**
   * Defines all the collections that will be used as part of this migration.
   * @returns {Promise<Collections>} An array of collection names or an array of collection options.
   */
  collections(): Promise<Collections>;
  /**
   * Optional description of what the migration does. This value will be stored in the migration log.
   */
  description?: string,
  /**
   * Function that will be called to perform the `down` migration.
   * @param {Database} db - Database instance.
   * @param {StepFunction} - step The `step` function is used to add valid ArangoDB operations to the transaction.
   * @param {*} data - Optional value received from the `beforeDown` function.
   */
  down?: (db: Database, step: StepFunction, data?: any) => Promise<any>;
  /**
   * Optional function that configures how the transaction will be executed. See ArangoDB documentation for more information.
   * @returns {Promise<TransactionOptions>} - The transaction options.
   */
  transactionOptions?: () => Promise<TransactionOptions>;
  /**
   * Function that will be called to perform the `up` migration.
   * @param {Database} - db Database instance.
   * @param {StepFunction} - step The `step` function is used to add valid ArangoDB operations to the transaction.
   * @param {*} data Optional value received from the `beforeUp` function.
   */
  up: (db: Database, step: StepFunction, data?: any) => Promise<any>;
}

export interface MigrationHistory {
    _id: string;
    _key: string;
    counter: number;
    createdAt: string;
    description?: string;
    direction: 'up' | 'down';
    name: string;
    version: number;
}

export interface ArangoMigrateOptions {
  /**
   * Automatically create referenced collections if they do not exist. Defaults to `true`.
   */
  autoCreateNewCollections?: boolean,
  /**
   * ArangoDB connection options.
   */
  dbConfig: Config,
  /**
   * The collection in which the migration history will be stored. Defaults to `migration_history`.
   */
  migrationHistoryCollection?: string,
  /**
   * Path to the directory containing the migration files.
   */
  migrationsPath: string
}

const isString = (s): boolean => {
  return typeof (s) === 'string' || s instanceof String
}

const MIGRATION_TEMPLATE_JS = `/**
 * @typedef { import("arango-migrate").Migration } Migration
 */

/**
 * @type { Migration }
 */
const migration = {
  async collections () {
    return []
  },
  async up (db, step) {
  }
}

export default migration
`

const MIGRATION_TEMPLATE_TS = `import { Collections, Migration, StepFunction } from 'arango-migrate'
import { Database } from 'arangojs'

const migration: Migration = {
  async collections (): Promise<Collections> {
    return []
  },
  async up (db: Database, step: StepFunction) {}
}

export default migration
`

export const DEFAULT_CONFIG_PATH = './config.migrate.js'
export const DEFAULT_MIGRATIONS_PATH = './migrations'
export const DEFAULT_MIGRATION_HISTORY_COLLECTION = 'migration_history'

export class ArangoMigrate {
  private readonly options: ArangoMigrateOptions
  private readonly migrationHistoryCollection: string
  private db: Database
  private readonly migrationPaths: string[]
  private readonly migrationsPath: string

  constructor (options: ArangoMigrateOptions) {
    this.options = options
    this.migrationsPath = this.options.migrationsPath || DEFAULT_MIGRATIONS_PATH
    this.migrationHistoryCollection = this.options.migrationHistoryCollection || DEFAULT_MIGRATION_HISTORY_COLLECTION
    this.migrationPaths = this.loadMigrationPaths(this.migrationsPath)
  }

  public static async loadConfig (configPath: string = DEFAULT_CONFIG_PATH): Promise<ArangoMigrateOptions> {
    const p = path.resolve(configPath)
    if (!fs.existsSync((p))) {
      throw new Error(`Config file ${p} not found.`)
    }

    const importedConfig = await import(p)

    const config: ArangoMigrateOptions = importedConfig.default

    if (!config.dbConfig) {
      throw new Error('Config object must contain a dbConfig property.')
    }

    return config
  }

  public loadMigrationPaths (migrationsPath: string) {
    return glob.sync(migrationsPath + '/*').reduce((acc, filePath) => {
      return [
        ...acc,
        path.resolve(filePath)
      ]
    }, []).sort((a, b) => a.localeCompare(b))
  }

  public getMigrationPaths (): string[] {
    return this.migrationPaths
  }

  public async initialize (): Promise<void> {
    const name = this.options.dbConfig.databaseName

    try {
      this.db = new Database({ ...this.options.dbConfig, databaseName: undefined })
      this.db = await this.db.createDatabase(name)
    } catch (err) {
      this.db = new Database(this.options.dbConfig)
      this.db = this.db.database(name)
    }
  }

  public getMigrationPathFromVersion (version: number): string {
    return this.migrationPaths.find(x => {
      const basename = path.basename(x)
      return version === Number(basename.split('_')[0])
    })
  }

  public async getMigrationFromVersion (version: number): Promise<Migration> {
    const migrationPath = this.migrationPaths.find(x => {
      const basename = path.basename(x)

      return version === Number(basename.split('_')[0]) && fs.existsSync(path.resolve(x))
    })

    const importedMigration = await import(migrationPath)
    return importedMigration.default
  }

  public async getMigrationHistoryCollection () {
    let collection: DocumentCollection
    try {
      collection = await this.db.createCollection(this.migrationHistoryCollection)
    } catch {
      collection = this.db.collection(this.migrationHistoryCollection)
    }
    return collection
  }

  public async getMigrationHistory (): Promise<MigrationHistory[]> {
    const collection = await this.getMigrationHistoryCollection()

    return await (await this.db.query(aql`
      FOR x IN ${collection}
      SORT x.counter ASC
      RETURN x`)).all()
  }

  public async getLatestMigration (): Promise<MigrationHistory | null> {
    const collection = await this.getMigrationHistoryCollection()

    return await (await this.db.query(aql`
      FOR x IN ${collection}
      SORT x.counter DESC
      LIMIT 1
      RETURN x`)).next()
  }

  public async writeMigrationHistory (direction: 'up' | 'down', name: string, description: string, version: number) {
    const collection = await this.getMigrationHistoryCollection()

    const latest = await this.getLatestMigration()

    await collection.save({
      name,
      description,
      version,
      direction,
      counter: latest ? latest.counter + 1 : 1,
      createdAt: new Date()
    })
  }

  public async initializeTransactionCollections (collections: Collections) {
    const newCollections = new Set<Collection>()
    const allCollectionNames = new Set<string>()

    const transactionCollections = []

    let createdCollectionCount = 0

    for (const collectionData of collections) {
      const data = (isString(collectionData)
        ? {
            collectionName: collectionData
          }
        : collectionData) as CollectionOptions
      allCollectionNames.add(data.collectionName)
      let collection
      try {
        if (this.options.autoCreateNewCollections !== false) {
          /**
           * NOTE: arangojs *.d.ts invites user to pass "literal" options object
           * to infer typeof collection. Thus there is no another way to support
           * collections() API but using this ugly "as any" cast
           */
          collection = await this.db.createCollection(data.collectionName, data.options as any)
          createdCollectionCount++
          newCollections.add(collection)
        }
      } catch {
        collection = this.db.collection(data.collectionName)
        if (!collection) {
          throw new Error(`Collection ${data.collectionName} not found.`)
        }
      }
      if (collection) {
        transactionCollections.push(collection)
      }
    }

    return {
      transactionCollections,
      newCollections,
      allCollectionNames,
      createdCollectionCount
    }
  }

  public async runUpMigrations (to?: number, dryRun?: boolean, noHistory?: boolean): Promise<{
    appliedMigrations: number
    createdCollections: number
  }> {
    const versions = this.getVersionsFromMigrationPaths()
    if (!to) {
      to = versions[versions.length - 1]
    }
    const latestMigration = await this.getLatestMigration()

    let start = 1

    if (latestMigration?.version) {
      start = latestMigration.direction === 'up' ? latestMigration.version + 1 : latestMigration.version
    }

    let appliedMigrations = 0
    let createdCollections = 0

    for (let i = start; i <= (to || latestMigration?.version); i++) {
      let migration: Migration
      try {
        migration = await this.getMigrationFromVersion(i)
      } catch (err) {
        console.log(err)
        return
      }

      const name = path.basename(this.getMigrationPathFromVersion(i))

      const collectionNames = migration.collections ? await migration.collections() : []

      const { transactionCollections, newCollections, createdCollectionCount } = await this.initializeTransactionCollections(collectionNames)
      createdCollections += createdCollectionCount

      let beforeUpData
      if (migration.beforeUp) {
        beforeUpData = await migration.beforeUp(this.db)
      }

      const transactionOptions = await migration.transactionOptions?.()

      const transaction = await this.db.beginTransaction(transactionCollections, transactionOptions)

      let error
      let upResult

      if (migration.up) {
        try {
          upResult = await migration.up(this.db, (callback: () => Promise<any>) => transaction.step(callback), beforeUpData)
        } catch (err) {
          console.log(err)
          error = new Error(`Running up failed for migration ${i}.`)
        }
      }

      if (!dryRun) {
        try {
          const transactionStatus = await transaction.commit()

          if (transactionStatus.status !== 'committed') {
            error = new Error(`Transaction failed with status ${transactionStatus.status} for migration ${name}.`)
          }
        } catch (err) {
          error = new Error('Transaction failed.')
        }
      }

      try {
        if (migration.afterUp) {
          await migration.afterUp(this.db, upResult)
        }
      } catch (err) {
        error = new Error(`afterUp threw an error ${err}.`)
      }

      if (error) {
        for (const collection of Array.from(newCollections)) {
          await collection.drop()
        }
      }

      if (!error) {
        if (!dryRun && noHistory !== true) {
          await this.writeMigrationHistory('up', name, migration.description, i)
        }
      }

      if (error) {
        throw error
      }
      appliedMigrations += 1
    }
    return { appliedMigrations, createdCollections }
  }

  public async runDownMigrations (to?: number, dryRun?: boolean, noHistory?: boolean): Promise<{ appliedMigrations: number, createdCollections: number; }> {
    const latestMigration = await this.getLatestMigration()

    if (!latestMigration) {
      throw new Error('No migrations have been applied.')
    }

    if (!to) {
      to = 1
    }

    let appliedMigrations = 0
    let createdCollections = 0

    for (let i = latestMigration.version; i >= to; i--) {
      let migration: Migration
      try {
        migration = await this.getMigrationFromVersion(i)
      } catch (err) {
        console.log(err)
        return
      }

      const name = path.basename(this.getMigrationPathFromVersion(i))

      const collectionNames = migration.collections ? await migration.collections() : []

      const { transactionCollections, newCollections, createdCollectionCount } = await this.initializeTransactionCollections(collectionNames)

      createdCollections += createdCollectionCount

      let error

      let beforeDownData

      if (migration.beforeDown) {
        beforeDownData = await migration.beforeDown(this.db)
      }

      const transaction = await this.db.beginTransaction(transactionCollections)

      let downResult

      if (migration.down) {
        try {
          downResult = await migration.down(this.db, (callback: () => Promise<any>) => transaction.step(callback), beforeDownData)
        } catch (err) {
          console.log(err)
          error = new Error(`Running up failed for migration ${i}.`)
        }
      }

      if (!dryRun) {
        try {
          const transactionStatus = await transaction.commit()

          if (transactionStatus.status !== 'committed') {
            error = new Error(`Transaction failed with status ${transactionStatus.status} for migration ${name}.`)
          }
        } catch (err) {
          error = new Error('Transaction failed.')
        }
      }

      try {
        if (migration.afterDown) {
          await migration.afterDown(this.db, downResult)
        }
      } catch (err) {
        error = new Error(`afterDown threw an error ${err}.`)
      }

      if (error) {
        for (const collection of Array.from(newCollections)) {
          await collection.drop()
        }
      }

      if (!error) {
        if (!dryRun && noHistory !== true) {
          await this.writeMigrationHistory('down', name, migration.description, i)
        }
      }

      if (error) {
        throw error
      }
      appliedMigrations += 1
    }
    return { appliedMigrations, createdCollections }
  }

  public getVersionsFromMigrationPaths (): number[] {
    return this.migrationPaths.map(migrationPath => {
      return Number(path.basename(migrationPath).split('_')[0])
    }).sort((a, b) => a - b)
  }

  public validateMigrationFolderNotEmpty () {
    if (this.migrationPaths.length === 0) {
      throw new Error('No migrations.')
    }
  }

  public validateMigrationVersions () {
    const versions = this.getVersionsFromMigrationPaths()

    if (!versions || versions.length !== new Set(versions).size) {
      throw new Error('Migration versions must be unique.')
    }

    if (versions.length) {
      for (let index = 0; index < versions.length; index++) {
        const current = versions[index]
        if (versions.length > Number(index)) {
          const next = versions[index + 1]
          if (next && current + 1 !== next) {
            throw new Error('Migrations must be numbered consecutively.')
          }
        }
      }
    }
  }

  public async validateMigrationVersion (version: number) {
    const latestMigration = await this.getLatestMigration()

    if (!latestMigration && version > 1) {
      throw new Error(`Migration sequence must start with 1, not ${version}.`)
    }

    if (latestMigration && version > Number(latestMigration.version) + 1) {
      throw new Error(`Migration must be ran in sequence. ${version} must immediately follow ${latestMigration.version}.`)
    }

    if (latestMigration && version <= Number(latestMigration.version)) {
      const name = this.getMigrationPathFromVersion((version))

      throw new Error(`Cannot run up migration ${name} because migration has already been applied.`)
    }
  }

  public writeNewMigration (name: string, typescript: boolean): string {
    name = slugify(name, '_')
    const version = this.migrationPaths.length + 1

    if (!fs.existsSync(path.resolve(this.migrationsPath))) {
      fs.mkdirSync(path.resolve(this.migrationsPath))
    }

    const res = path.resolve(`${this.migrationsPath}/${version}_${name}${typescript ? '.ts' : '.js'}`)

    fs.writeFileSync(res, typescript ? MIGRATION_TEMPLATE_TS : MIGRATION_TEMPLATE_JS)

    return res
  }

  public async hasNewMigrations (): Promise<boolean> {
    const latestMigration = await this.getLatestMigration()
    if (!latestMigration) {
      return true
    }
    const versions = this.getVersionsFromMigrationPaths()
    return latestMigration && versions[versions.length - 1] !== latestMigration.version
  }
}
