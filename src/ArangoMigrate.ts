import { Config } from 'arangojs/connection'
import { Database } from 'arangojs/database'
import * as glob from 'glob'
import * as path from 'path'
import { aql } from 'arangojs'
import { CollectionType, CreateCollectionOptions, DocumentCollection, EdgeCollection } from 'arangojs/collection'
import * as fs from 'fs'

type Collection = DocumentCollection<any> & EdgeCollection<any>

interface CollectionData {
  collectionName: string
  options?: CreateCollectionOptions & {
    type?: CollectionType.DOCUMENT_COLLECTION;
  }
}

type Collections = string[] | CollectionData[]

export interface Migration {
    description?: string,
    beforeUp?: (db: Database) => Promise<void>
    beforeDown?: (db: Database) => Promise<void>
    afterUp?: (db: Database) => Promise<void>
    up: (db: Database, step: ((callback) => Promise<any>), data?: any) => Promise<void>;
    down: (db: Database, step: ((callback) => Promise<any>), data?: any) => Promise<void>;
    afterDown?: (db: Database) => Promise<void>
    collections(): Promise<Collections>;
}

export interface MigrationHistory {
    _key: string;
    _id: string;
    version: number;
    name: string;
    createdAt: string
}

export interface ArangoMigrateOptions {
    dbConfig: Config
    migrationsPath: string
}
const isString = (s): boolean => {
  return typeof (s) === 'string' || s instanceof String
}

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

export const DEFAULT_CONFIG_PATH = './config.migrate.js'

export class ArangoMigrate {
  private readonly options: ArangoMigrateOptions
  private readonly migrationHistoryCollectionName: string = 'migration_history'
  private db: Database
  private readonly _migrationPaths: string[]

  constructor (options: ArangoMigrateOptions) {
    this.options = options
    this._migrationPaths = this.loadMigrationPaths(this.options.migrationsPath)
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

  get migrationPaths (): string[] {
    return this._migrationPaths
  }

  public async initialize (): Promise<void> {
    const name = this.options.dbConfig.databaseName

    this.db = new Database(this.options.dbConfig)

    try {
      this.db = await this.db.createDatabase(name)
    } catch (err) {
      this.db = this.db.database(name)
    }
  }

  public getMigrationPathFromVersion (version: number): string {
    return this._migrationPaths.find(x => {
      const basename = path.basename(x)
      return version === Number(basename.split('_')[0])
    })
  }

  public getMigrationFromVersion (version: number): Migration {
    return require(this._migrationPaths.find(x => {
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

    try {
      await collection.ensureIndex({
        unique: true,
        inBackground: false,
        type: 'persistent',
        fields: ['name']
      })

      await collection.ensureIndex({
        unique: true,
        inBackground: false,
        type: 'persistent',
        fields: ['version']
      })
    } catch (err) {}

    return collection
  }

  public async getMigrationHistory (): Promise<MigrationHistory[]> {
    const collection = await this.getMigrationHistoryCollection(this.migrationHistoryCollectionName)

    return await (await this.db.query(aql`
      FOR x IN ${collection}
      SORT x.version ASC
      RETURN x`)).all()
  }

  public async getLatestMigration (): Promise<MigrationHistory | null> {
    const collection = await this.getMigrationHistoryCollection(this.migrationHistoryCollectionName)

    return await (await this.db.query(aql`
      FOR x IN ${collection}
      SORT x.version DESC
      LIMIT 1
      RETURN x`)).next()
  }

  public async writeMigrationHistory (name: string, version: number) {
    const collection = await this.getMigrationHistoryCollection(this.migrationHistoryCollectionName)

    await collection.save({
      name,
      version,
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
        : collectionData) as CollectionData
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

  public async runUpMigrations (to?: number) {
    const versions = this.getVersionsFromMigrationPaths()
    if (!to) {
      to = versions[versions.length - 1]
    }

    const latestMigration = await this.getLatestMigration()
    for (let i = (latestMigration?.version || 1); i <= (to || latestMigration?.version); i++) {
      let migration: Migration
      try {
        migration = this.getMigrationFromVersion(i)
      } catch (err) {
        console.log(err)
      }

      const name = path.basename(this.getMigrationPathFromVersion(i))

      const collectionNames = await migration.collections()

      const { transactionCollections, newCollections } = await this.initializeTransactionCollections(collectionNames)

      let beforeUpData
      if (migration.beforeUp) {
        beforeUpData = await migration.beforeUp(this.db)
      }

      const transaction = await this.db.beginTransaction(transactionCollections)

      let error

      try {
        await migration.up(this.db, (callback: () => Promise<any>) => transaction.step(callback), beforeUpData)
      } catch (err) {
        error = new Error(`Running up failed for migration ${i}`)
      }

      try {
        const transactionStatus = await transaction.commit()

        if (transactionStatus.status !== 'committed') {
          error = new Error(`Transaction failed with status ${transactionStatus.status} for migration ${name}`)
        }
      } catch (err) {
        error = new Error('Transaction failed')
      }

      try {
        if (migration.afterUp) {
          await migration.afterUp(this.db)
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
        await this.writeMigrationHistory(name, i)
      }
    }
  }

  public async runDownMigrations (to?: number) {
    const latestMigration = await this.getLatestMigration()

    for (let i = (latestMigration?.version || 1); i >= (to || 1); i--) {
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

  public writeNewMigration (name: string) {
    const version = this.migrationPaths.length + 1

    fs.writeFileSync(path.resolve(this.options.migrationsPath + `/${version}_${name}.js`), MIGRATION_TEMPLATE)
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
