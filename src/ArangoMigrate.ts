import { Config } from 'arangojs/connection'
import { Database } from 'arangojs/database'
import * as glob from 'glob'
import * as path from 'path'
import { aql } from 'arangojs'
import { DocumentCollection, EdgeCollection } from 'arangojs/collection'

type Collection = DocumentCollection<any> & EdgeCollection<any>

interface Collections {
    read?: string[]
    write?: string[]
    exclusive?: string[]
}

export interface Migration {
    description?: string,
    beforeUp?: (db: Database) => Promise<void>
    beforeDown?: (db: Database) => Promise<void>
    up: (db: Database, step: ((callback) => Promise<any>), data?: any) => Promise<void>;
    down: (db: Database, step: ((callback) => Promise<any>), data?: any) => Promise<void>;
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

export class ArangoMigrate {
    private readonly options: ArangoMigrateOptions;
    private readonly migrationHistoryCollectionName: string = 'migration_history';
    private db: Database;
    private readonly _migrationPaths: string[];

    constructor (options: ArangoMigrateOptions) {
      this.options = options
      this._migrationPaths = glob.sync(this.options.migrationsPath + '/*').reduce((acc, filePath) => {
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
      delete this.options.dbConfig.databaseName
      this.db = new Database(this.options.dbConfig)

      try {
        this.db = await this.db.createDatabase(name)
      } catch (err) {
        this.db = this.db.database(name)
      }
    }

    public getMigrationNameFromVersion (version: number): string {
      return this._migrationPaths.find(x => {
        const basename = path.basename(x)
        return version === Number(basename.split('_')[0])
      })
    }

    public migrationFromVersion (version: number): Migration {
      return require(this._migrationPaths.find(x => {
        const basename = path.basename(x)
        return version === Number(basename.split('_')[0])
      }))
    }

    private async getMigrationHistoryCollection (collectionName: string) {
      let collection: DocumentCollection
      try {
        collection = await this.db.createCollection(collectionName)
      } catch {
        collection = this.db.collection(collectionName)
      }

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

    private async writeMigrationHistory (name: string, version: number) {
      const collection = await this.getMigrationHistoryCollection(this.migrationHistoryCollectionName)

      await collection.save({
        name,
        version,
        createdAt: new Date()
      })
    }

    public async runUpMigrations (from: number, to?: number) {
      const newCollections = new Set<Collection>()
      const allCollectionNames = new Set<string>()

      const transactionCollections = {
        read: [],
        write: [],
        exclusive: []
      }

      const initializeTransactionCollections = async (collections: Collections, key: 'read' | 'write' | 'exclusive') => {
        if (collections[key]) {
          for (const collectionName of collections[key]) {
            allCollectionNames.add(collectionName)
            let collection
            try {
              collection = await this.db.createCollection(collectionName)
              newCollections.add(collection)
            } catch {
              collection = this.db.collection(collectionName)
            }
            transactionCollections[key].push(collection)
          }
        }
      }

      for (let i = from; i <= (to || from); i++) {
        let migration: Migration
        try {
          migration = this.migrationFromVersion(from)
        } catch (err) {
          console.error(`Migration file for version ${i} does not exist`)
          process.exit(1)
        }
        const name = path.basename(this.getMigrationNameFromVersion(i))
        console.log(`Running up migration ${name}`)

        const collectionNames = await migration.collections()

        await Promise.allSettled([
          initializeTransactionCollections(collectionNames, 'read'),
          initializeTransactionCollections(collectionNames, 'write'),
          initializeTransactionCollections(collectionNames, 'exclusive')
        ])

        let data
        if (migration.beforeUp) {
          data = await migration.beforeUp(this.db)
        }

        const transaction = await this.db.beginTransaction(transactionCollections)

        await migration.up(this.db, (callback: () => Promise<any>) => transaction.step(callback), data)

        const transactionStatus = await transaction.commit()

        if (transactionStatus.status !== 'committed') {
          throw new Error(`Transaction failed with status ${transactionStatus.status} for migration ${name}`)
        }

        await this.writeMigrationHistory(name, i)
        console.log(`Applied migration ${name}`)
      }
    }

    public runDownMigrations (from: number, to?: number) {

    }
}
