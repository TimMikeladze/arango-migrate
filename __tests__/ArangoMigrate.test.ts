import { createTestUtil, defaultConfig, TestUtil } from './testUtil'
import * as path from 'path'
import * as fs from 'fs'
import { ArangoMigrate } from '../src/ArangoMigrate'

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
    expect(tu.context.am.migrationPaths.length).toBeGreaterThan(0)
  })
  it('loads empty array if no migration paths found', () => {
    tu.context.am = new ArangoMigrate({
      ...defaultConfig,
      migrationsPath: '../__tests__/migrations_empty'
    })
    expect(tu.context.am.migrationPaths.length).toEqual(0)
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
    const filePath = path.resolve(`${defaultConfig.migrationsPath}/${tu.context.am.migrationPaths.length + 1}_${name}.js`)
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
