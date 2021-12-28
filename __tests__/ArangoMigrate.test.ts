import { createTestUtil, defaultConfig, TestUtil } from './testUtil'
import * as path from 'path'
import * as fs from 'fs'
import { ArangoMigrate, Migration } from '../src/ArangoMigrate'
import { Database } from 'arangojs/database'

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
    expect(tu.context.am.getMigrationFromVersion(1).collections()).toBeDefined()
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
    expect((await tu.context.am.getMigrationHistoryCollection('migration_history')).name).toEqual('migration_history')
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
  it('writes a new migration file', async () => {
    const name = Date.now().toString()
    const filePath = path.resolve(`${defaultConfig.migrationsPath}/${tu.context.am.getMigrationPaths().length + 1}_${name}.js`)
    tu.context.am.writeNewMigration(name)
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

describe('runUpMigrations - runs all lifecycle functions', () => {
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
      afterUp: jest.fn()
    }
    tu.context.am.getMigrationFromVersion = () => migration

    await tu.context.am.runUpMigrations(1)
    expect(await tu.context.am.getMigrationHistory()).toHaveLength(1)

    expect(migration.beforeUp).toHaveBeenCalled()
    expect(migration.up).toHaveBeenCalledWith(expect.any(Database), expect.any(Function), 1)
    expect(migration.afterUp).toHaveBeenCalledWith(expect.any(Database), 2)
  })
})
