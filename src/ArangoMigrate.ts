import { Config } from 'arangojs/connection'
import glob from 'glob'
import path from 'path'
import { aql, Database } from 'arangojs'
import { CollectionType, CreateCollectionOptions, DocumentCollection, EdgeCollection } from 'arangojs/collection'
import fs from 'fs'
import slugify from 'slugify'

type Collection = DocumentCollection<any> & EdgeCollection<any>

export interface CollectionOptions {
  collectionName: string
  options?: CreateCollectionOptions & {
    type?: CollectionType.DOCUMENT_COLLECTION;
  }
}

export type Collections = string[] | CollectionOptions[]

export type StepFunction = (callback) => Promise<any>

export interface Migration {
    description?: string,
    beforeUp?: (db: Database) => Promise<any>
    up: (db: Database, step: StepFunction, data?: any) => Promise<any>;
    afterUp?: (db: Database, data?: any) => Promise<void>
    beforeDown?: (db: Database) => Promise<any>
    down?: (db: Database, step: StepFunction, data?: any) => Promise<any>;
    afterDown?: (db: Database, data?: any) => Promise<any>
    collections(): Promise<Collections>;
}

export interface MigrationHistory {
    _key: string;
    _id: string;
    direction: 'up' | 'down';
    description?: string;
    version: number;
    name: string;
    createdAt: string;
    counter: number;
}

export interface ArangoMigrateOptions {
    dbConfig: Config
    migrationsPath: string
}

const isString = (s): boolean => {
  return typeof (s) === 'string' || s instanceof String
}

const MIGRATION_TEMPLATE_JS = `const migration = {
  async collections () {
    return []
  },
  async up (db, step) {
  }
}
module.exports = migration`

const MIGRATION_TEMPLATE_TS = `import { Collections, Migration, StepFunction } from 'arango-migrate'
import { Database } from 'arangojs'

const migration: Migration = {
  async collections (): Promise<Collections> {
    return []
  },
  async up (db: Database, step: StepFunction) {}
}

export default migration`

export const DEFAULT_CONFIG_PATH = './config.migrate.js'
export const DEFAULT_MIGRATIONS_PATH = './migrations'

export class ArangoMigrate {
  private readonly options: ArangoMigrateOptions
  private readonly migrationHistoryCollectionName: string = 'migration_history'
  private db: Database
  private readonly migrationPaths: string[]
  private readonly migrationsPath: string

  constructor (options: ArangoMigrateOptions) {
    this.options = options
    this.migrationsPath = this.options.migrationsPath || DEFAULT_MIGRATIONS_PATH
    this.migrationPaths = this.loadMigrationPaths(this.migrationsPath)
  }

  public static validateConfigPath (configPath: string = DEFAULT_CONFIG_PATH) {
    const p = path.resolve(configPath)
    if (!fs.existsSync((p))) {
      throw new Error(`Config file ${p} not found`)
    }

    const config: ArangoMigrateOptions = require(p)

    if (!config.dbConfig) {
      throw new Error('Config object must contain a dbConfig property')
    }
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

  public getMigrationFromVersion (version: number): Migration {
    return require(this.migrationPaths.find(x => {
      const basename = path.basename(x)

      return version === Number(basename.split('_')[0]) && fs.existsSync(path.resolve(x))
    }))
  }

  public async getMigrationHistoryCollection (collectionName: string) {
    let collection: DocumentCollection
    try {
      collection = await this.db.createCollection(collectionName)
    } catch {
      collection = this.db.collection(collectionName)
    }
    return collection
  }

  public async getMigrationHistory (): Promise<MigrationHistory[]> {
    const collection = await this.getMigrationHistoryCollection(this.migrationHistoryCollectionName)

    return await (await this.db.query(aql`
      FOR x IN ${collection}
      SORT x.counter ASC
      RETURN x`)).all()
  }

  public async getLatestMigration (): Promise<MigrationHistory | null> {
    const collection = await this.getMigrationHistoryCollection(this.migrationHistoryCollectionName)

    return await (await this.db.query(aql`
      FOR x IN ${collection}
      SORT x.counter DESC
      LIMIT 1
      RETURN x`)).next()
  }

  public async writeMigrationHistory (direction: 'up' | 'down', name: string, description: string, version: number) {
    const collection = await this.getMigrationHistoryCollection(this.migrationHistoryCollectionName)

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

    for (const collectionData of collections) {
      const data = (isString(collectionData)
        ? {
            collectionName: collectionData
          }
        : collectionData) as CollectionOptions
      allCollectionNames.add(data.collectionName)
      let collection
      try {
        collection = await this.db.createCollection(data.collectionName, data.options)
        newCollections.add(collection)
      } catch {
        collection = this.db.collection(data.collectionName)
      }
      transactionCollections.push(collection)
    }

    return {
      transactionCollections,
      newCollections,
      allCollectionNames
    }
  }

  public async runUpMigrations (to?: number, dryRun?: boolean) {
    const versions = this.getVersionsFromMigrationPaths()
    if (!to) {
      to = versions[versions.length - 1]
    }
    const latestMigration = await this.getLatestMigration()

    let start = 1

    if (latestMigration?.version) {
      start = latestMigration.direction === 'up' ? latestMigration.version + 1 : latestMigration.version
    }

    for (let i = start; i <= (to || latestMigration?.version); i++) {
      let migration: Migration
      try {
        migration = this.getMigrationFromVersion(i)
      } catch (err) {
        console.log(err)
        return
      }

      const name = path.basename(this.getMigrationPathFromVersion(i))

      const collectionNames = migration.collections ? await migration.collections() : []

      const { transactionCollections, newCollections } = await this.initializeTransactionCollections(collectionNames)

      let beforeUpData
      if (migration.beforeUp) {
        beforeUpData = await migration.beforeUp(this.db)
      }

      const transaction = await this.db.beginTransaction(transactionCollections)

      let error
      let upResult

      if (migration.up) {
        try {
          upResult = await migration.up(this.db, (callback: () => Promise<any>) => transaction.step(callback), beforeUpData)
        } catch (err) {
          console.log(err)
          error = new Error(`Running up failed for migration ${i}`)
        }
      }

      if (!dryRun) {
        try {
          const transactionStatus = await transaction.commit()

          if (transactionStatus.status !== 'committed') {
            error = new Error(`Transaction failed with status ${transactionStatus.status} for migration ${name}`)
          }
        } catch (err) {
          error = new Error('Transaction failed')
        }
      }

      try {
        if (migration.afterUp) {
          await migration.afterUp(this.db, upResult)
        }
      } catch (err) {
        error = new Error('afterUp threw an error ' + err)
      }

      if (error) {
        for (const collection of Array.from(newCollections)) {
          await collection.drop()
        }
      }

      if (!error) {
        if (!dryRun) {
          await this.writeMigrationHistory('up', name, migration.description, i)
        }
      }

      if (error) {
        throw error
      }
    }
  }

  public async runDownMigrations (to?: number, dryRun?: boolean) {
    const latestMigration = await this.getLatestMigration()

    if (!latestMigration) {
      throw new Error('No migrations have been applied')
    }

    if (!to) {
      to = 1
    }

    for (let i = latestMigration.version; i >= to; i--) {
      let migration: Migration
      try {
        migration = this.getMigrationFromVersion(i)
      } catch (err) {
        console.log(err)
        return
      }

      const name = path.basename(this.getMigrationPathFromVersion(i))

      const collectionNames = migration.collections ? await migration.collections() : []

      const { transactionCollections, newCollections } = await this.initializeTransactionCollections(collectionNames)

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
          error = new Error(`Running up failed for migration ${i}`)
        }
      }

      if (!dryRun) {
        try {
          const transactionStatus = await transaction.commit()

          if (transactionStatus.status !== 'committed') {
            error = new Error(`Transaction failed with status ${transactionStatus.status} for migration ${name}`)
          }
        } catch (err) {
          error = new Error('Transaction failed')
        }
      }

      try {
        if (migration.afterDown) {
          await migration.afterDown(this.db, downResult)
        }
      } catch (err) {
        error = new Error('afterDown threw an error ' + err)
      }

      if (error) {
        for (const collection of Array.from(newCollections)) {
          await collection.drop()
        }
      }

      if (!error) {
        if (!dryRun) {
          await this.writeMigrationHistory('down', name, migration.description, i)
        }
      }

      if (error) {
        throw error
      }
    }
  }

  public getVersionsFromMigrationPaths (): number[] {
    return this.migrationPaths.map(migrationPath => {
      return Number(path.basename(migrationPath).split('_')[0])
    })
  }

  public validateMigrationFolderNotEmpty () {
    if (this.migrationPaths.length === 0) {
      throw new Error('No migrations')
    }
  }

  public validateMigrationVersions () {
    const versions = this.getVersionsFromMigrationPaths()

    if (!versions || versions.length !== new Set(versions).size) {
      throw new Error('Migration versions must be unique')
    }

    if (versions.length) {
      for (let index = 0; index < versions.length; index++) {
        const current = versions[index]
        if (versions.length > Number(index)) {
          const next = versions[index + 1]
          if (next && current + 1 !== next) {
            throw new Error('Migrations must be numbered consecutively')
          }
        }
      }
    }
  }

  public async validateMigrationVersion (version: number) {
    const latestMigration = await this.getLatestMigration()

    if (!latestMigration && version > 1) {
      throw new Error(`Migration sequence must start with 1, not ${version}`)
    }

    if (latestMigration && version > Number(latestMigration.version) + 1) {
      throw new Error(`Migration must be ran in sequence. ${version} must immediately follow ${latestMigration.version}`)
    }

    if (latestMigration && version <= Number(latestMigration.version)) {
      const name = this.getMigrationPathFromVersion((version))

      throw new Error(`Cannot run up migration ${name} because migration has already been applied`)
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
