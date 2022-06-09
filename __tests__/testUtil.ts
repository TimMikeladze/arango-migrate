import { Database } from 'arangojs/database'
import { customAlphabet } from 'nanoid'
import { ArangoMigrate, ArangoMigrateOptions } from '../src/ArangoMigrate'

export const nanoid = customAlphabet('1234567890abcdef', 4)

export interface TestUtil {
    context: {
      am: ArangoMigrate,
      db: Database
    },
    destroy: () => Promise<void>;
}

export const createArango = async (name?: string) => {
  let db = new Database({
    url: process.env.ARANGO_URL,
    auth: {
      username: process.env.ARANGO_USERNAME,
      password: process.env.ARANGO_PASSWORD || ''
    }
  })

  name = name || process.env.ARANGO_NAME

  try {
    db = await db.createDatabase(name)
  } catch (err) {
    db = db.database(name)
  }

  return db
}

export const defaultConfig: ArangoMigrateOptions = {
  dbConfig: {
    url: process.env.ARANGO_URL,
    auth: {
      username: process.env.ARANGO_USERNAME,
      password: process.env.ARANGO_PASSWORD || ''
    }
  },
  migrationsPath: './__tests__/migrations'
}

export const createTestUtil = async (
  config = defaultConfig
): Promise<TestUtil> => {
  const id = nanoid()

  const name = 'arango_migrate_test_' + id

  const db = await createArango(name)

  config.dbConfig.databaseName = name

  const am = new ArangoMigrate(config)

  return {
    context: {
      db,
      am
    },
    async destroy () {
      const db2 = new Database({
        url: process.env.ARANGO_URL,
        auth: {
          username: process.env.ARANGO_USERNAME,
          password: process.env.ARANGO_PASSWORD || ''
        }
      })

      await db2.dropDatabase(name)
    }
  }
}
