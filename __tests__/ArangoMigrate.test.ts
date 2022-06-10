import { createTestUtil, defaultConfig, TestUtil } from './testUtil'
import * as path from 'path'
import * as fs from 'fs'
import { ArangoMigrate, Migration } from '../src/ArangoMigrate'
import { Database } from 'arangojs/database'
import { jest } from '@jest/globals'

describe('loadMigrationPaths', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
  })

  afterAll(async () => {
    await tu.destroy()
  })

  it('loads array with migration file paths', () => {
    tu.context.am = new ArangoMigrate(defaultConfig)
    expect(tu.context.am.getMigrationPaths().length).toBeGreaterThan(0)
  })
  it('loads empty array if no migration paths found', () => {
    tu.context.am = new ArangoMigrate({
      ...defaultConfig,
      migrationsPath: '../__tests__/migrations_empty'
    })
    expect(tu.context.am.getMigrationPaths().length).toEqual(0)
  })
})

describe('initialize', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
  })

  afterAll(async () => {
    await tu.destroy()
  })
  it('successfully', async () => {
    await tu.context.am.initialize()
    // @ts-ignore
    expect(await tu.context.am.db.exists()).toBeTruthy()
  })
})

describe('getMigrationPathFromVersion', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })

  afterAll(async () => {
    await tu.destroy()
  })
  it('returns migration path given a version', async () => {
    expect(path.basename(tu.context.am.getMigrationPathFromVersion(1))).toEqual('1_initial.js')
  })
  it('returns undefined if version does not exist ', async () => {
    tu.context.am = new ArangoMigrate(defaultConfig)
    await tu.context.am.initialize()
    expect((tu.context.am.getMigrationPathFromVersion(99))).toBeUndefined()
  })
})

describe('getMigrationFromVersion', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })

  afterAll(async () => {
    await tu.destroy()
  })
  it('returns migration given a version', async () => {
    const migration = await tu.context.am.getMigrationFromVersion(1)
    expect(migration.collections()).toBeDefined()
  })
})

describe('getMigrationHistoryCollection', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })

  afterAll(async () => {
    await tu.destroy()
  })
  it('returns collection', async () => {
    expect((await tu.context.am.getMigrationHistoryCollection()).name).toEqual('migration_history')
  })
})

describe('writeNewMigration', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })

  afterAll(async () => {
    await tu.destroy()
  })
  it('writes a new javascript migration file', async () => {
    const name = Date.now().toString()
    const filePath = path.resolve(`${defaultConfig.migrationsPath}/${tu.context.am.getMigrationPaths().length + 1}_${name}.js`)
    tu.context.am.writeNewMigration(name, false)
    expect(fs.existsSync(filePath)).toBeTruthy()
    fs.unlinkSync(filePath)
  })
  it('writes a new typescript migration file', async () => {
    const name = Date.now().toString()
    const filePath = path.resolve(`${defaultConfig.migrationsPath}/${tu.context.am.getMigrationPaths().length + 1}_${name}.ts`)
    tu.context.am.writeNewMigration(name, true)
    expect(fs.existsSync(filePath)).toBeTruthy()
    fs.unlinkSync(filePath)
  })
})

describe('validateMigrationVersions', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
  })

  afterAll(async () => {
    await tu.destroy()
  })
  it('throws error if migration versions are not unique', async () => {
    tu.context.am = new ArangoMigrate({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations_not_unique'
    })
    await tu.context.am.initialize()

    expect(() => tu.context.am.validateMigrationVersions()).toThrowError('Migration versions must be unique')
  })
  it('throws error if migration versions are not numbered consecutively', async () => {
    tu.context.am = new ArangoMigrate({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations_not_numbered'
    })
    await tu.context.am.initialize()

    expect(() => tu.context.am.validateMigrationVersions()).toThrowError('Migrations must be numbered consecutively')
  })
})

describe('validateMigrationFolderNotEmpty', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
  })

  afterAll(async () => {
    await tu.destroy()
  })
  it('throws error if migration folder is empty', async () => {
    tu.context.am = new ArangoMigrate({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations_empty'
    })
    await tu.context.am.initialize()

    expect(() => tu.context.am.validateMigrationFolderNotEmpty()).toThrowError('No migrations')
  })
})

describe('hasNewMigrations', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('returns true if has new migrations', async () => {
    expect(await tu.context.am.hasNewMigrations()).toBeTruthy()
  })
  it('returns false if has no new migrations', async () => {
    await tu.context.am.runUpMigrations()
    expect(await tu.context.am.hasNewMigrations()).toBeFalsy()
  })
})

describe('getVersionsFromMigrationPaths', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('returns versions from migration paths', async () => {
    expect(tu.context.am.getVersionsFromMigrationPaths()).toEqual(expect.arrayContaining([1, 2, 3]))
  })
})

describe('runUpMigrations - all', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('runs all up migrations', async () => {
    await tu.context.am.runUpMigrations()
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(3)
    expect((await tu.context.am.getMigrationHistory())[0].description).toEqual('The first migration')
  })
})

describe('runDownMigrations - all', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('runs all down migrations', async () => {
    await tu.context.am.runUpMigrations()
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(3)
    await tu.context.am.runDownMigrations()
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(6)
    expect((await tu.context.am.getMigrationHistory())[2].direction).toEqual('up')
    expect((await tu.context.am.getMigrationHistory())[4].direction).toEqual('down')
  })
  it('runs all up migrations again', async () => {
    await tu.context.am.runUpMigrations()
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(9)
  })
})

describe('runUpMigrations - in parts', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('run first two migrations', async () => {
    await tu.context.am.runUpMigrations(2)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(2)
  })
  it('run third migration', async () => {
    await tu.context.am.runUpMigrations()
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(3)
  })
})

describe('runUpMigrations - up to version', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil()
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('runs all up migrations', async () => {
    await tu.context.am.runUpMigrations(2)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(2)
    expect(await tu.context.am.hasNewMigrations()).toBeTruthy()
  })
})

describe('runUpMigrations - deletes a new collection if created in a migration that failed', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations_failing'
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('if an error is thrown in an up migration and deletes newly created collections', async () => {
    await expect(tu.context.am.runUpMigrations()).rejects.toThrowError()
    expect(await tu.context.db.collection('user').exists()).toBeFalsy()
  })
})

describe('runUpMigrations - stops running migrations if a migration fails', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations_transaction_failing'
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('stops running migrations after a transaction fails', async () => {
    await expect(tu.context.am.runUpMigrations()).rejects.toThrowError()
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(1)
  })
})

describe('runUpMigrations/runDownMigrations - runs all lifecycle functions', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations'
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('calls all up lifecycle functions', async () => {
    const migration: Migration = {
      async collections () {
        return ['todo']
      },
      beforeUp: jest.fn(async () => 1),
      up: jest.fn(async (db, step, data) => {
        await step(() => db.collection('todo').save({
          _key: '1',
          title: 'Buy milk',
          completed: false
        }))
        return data + 1
      }),
      afterUp: jest.fn() as any,
      beforeDown: jest.fn(async () => 1),
      down: jest.fn(async (db, step, data) => {
        await step(() => db.collection('todo').remove({
          _key: '1'
        }))
        return data + 1
      }),
      afterDown: jest.fn() as any
    }
    tu.context.am.getMigrationFromVersion = async () => migration

    await tu.context.am.runUpMigrations(1)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(1)

    expect(migration.beforeUp).toHaveBeenCalled()
    expect(migration.up).toHaveBeenCalledWith(expect.any(Database), expect.any(Function), 1)
    expect(migration.afterUp).toHaveBeenCalledWith(expect.any(Database), 2)

    await tu.context.am.runDownMigrations(1)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(2)

    expect(migration.beforeDown).toHaveBeenCalled()
    expect(migration.down).toHaveBeenCalledWith(expect.any(Database), expect.any(Function), 1)
    expect(migration.afterDown).toHaveBeenCalledWith(expect.any(Database), 2)
  })
})

describe('runUpMigrations - dry run', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations'
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('for a dry run does not commit transaction to the database or write to the migration history', async () => {
    const migrationOne: Migration = {
      async collections () {
        return ['todo']
      },
      beforeUp: jest.fn(async () => 1),
      up: jest.fn(async (db, step, data) => {
        await step(() => db.collection('todo').save({
          _key: '1',
          title: 'Buy milk',
          completed: false
        }))
        return data + 1
      }),
      afterUp: jest.fn() as any
    }
    const migrationTwo: Migration = {
      async collections () {
        return ['todo']
      },
      beforeUp: jest.fn(async () => 1),
      up: jest.fn(async (db, step, data) => {
        await step(() => db.collection('todo').save({
          _key: '2',
          title: 'Buy food',
          completed: false
        }))
        return data + 1
      }),
      afterUp: jest.fn() as any
    }
    tu.context.am.getMigrationFromVersion = async (version) => version === 1 ? migrationOne : migrationTwo

    await tu.context.am.runUpMigrations(2, true)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(0)

    expect(migrationOne.beforeUp).toHaveBeenCalled()
    expect(migrationOne.up).toHaveBeenCalledWith(expect.any(Database), expect.any(Function), 1)
    expect(migrationOne.afterUp).toHaveBeenCalledWith(expect.any(Database), 2)

    expect(migrationTwo.beforeUp).toHaveBeenCalled()
    expect(migrationTwo.up).toHaveBeenCalledWith(expect.any(Database), expect.any(Function), 1)
    expect(migrationTwo.afterUp).toHaveBeenCalledWith(expect.any(Database), 2)
  })
})

describe('runUpMigrations/runDownMigrations - uses transaction options', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig,
      migrationsPath: './__tests__/migrations'
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('calls transactionOptions', async () => {
    const migration: Migration = {
      async collections () {
        return ['todo']
      },
      transactionOptions: jest.fn(async () => ({
        waitForSync: true
      })),
      up: async (db, step, data) => {
        await step(() => db.collection('todo').save({
          _key: '1',
          title: 'Buy milk',
          completed: false
        }))
        return data + 1
      }
    }

    tu.context.am.getMigrationFromVersion = async () => migration

    await tu.context.am.runUpMigrations(1)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(1)
    expect(migration.transactionOptions).toHaveBeenCalled()
  })
})

describe('runUpMigrations/runDownMigrations - autoCreateNewCollections: false', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig,
      autoCreateNewCollections: false
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('fails because collection does not exist', async () => {
    await expect(tu.context.am.runUpMigrations()).rejects.toThrowError()
  })
})

describe('runUpMigrations - noHistory', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('runs migrations but does not write to the migration history log', async () => {
    await tu.context.am.runUpMigrations(undefined, undefined, true)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(0)
  })
})

describe('custom migrationHistoryCollection', () => {
  let tu: TestUtil

  beforeAll(async () => {
    tu = await createTestUtil({
      ...defaultConfig,
      migrationHistoryCollection: 'custom_migration_history'
    })
    await tu.context.am.initialize()
  })
  afterAll(async () => {
    await tu.destroy()
  })
  it('saves migration history in the configured collection', async () => {
    await tu.context.am.runUpMigrations()
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(3)
    await expect(tu.context.am.getMigrationHistoryCollection()).resolves.toMatchObject({
      name: 'custom_migration_history'
    })
  })
})
