# arango-migrate

Apply migrations to an ArangoDB in a transaction-safe manner with optional before/after hooks and dry-run support.

## Getting Started

```console
yarn add arango-migrate -D
```

**Note:** Check out a functioning sample in the [arango-migrate-example](https://github.com/TimMikeladze/arango-migrate-example) repository.

## Usage

```
Usage: cli [options]

Options:
  -c, --config <config>  path to a js config file. Defaults to ./config.migrate.js
  -u, --up               run up migrations. Defaults to running all unapplied migrations if no --to parameter is provided
  -d, --down             run down migrations. --to parameter is required
  -t, --to <version>     run migrations to and including a specific version
  -i --init <name>       initialize a new migration file
  -l --list              list all applied migrations
  -dr --dry-run          dry run. Executes migration lifecycle functions but never commits the transaction to the database or writes to the migration history log
  -h, --help             display help for command
```

### Configuration

Create a `config.migrate.js` file in the root of your project. This file contains the database connection information and options for running migrations.

Example:

```js
import 'dotenv/config'

export default {
  dbConfig: {
    databaseName: process.env.ARANGO_NAME,
    url: process.env.ARANGO_URL,
    auth: {
      username: process.env.ARANGO_USERNAME,
      password: process.env.ARANGO_PASSWORD || ''
    }
  },
  migrationsPath: './migrations'
}
```

### Initialize a new migration

`yarn arango-migrate -i new-migration-name`

This will create an empty migration file in the `migrations` directory.

### Simple migration example

This migration will create a new collection called `todo` and insert a single document into it. Additional lifecycle functions can be added to the migration file, see the full list of options below.

```javascript
const migration = {
    async collections () {
        return ['todo'] // all collections used in this migration must be defined here.
    },
    async up (db, step) {
        // Using the `step` function, add a new document to the collection as part of this migration's transaction.
        await step(async () => await db.collection('todo').save({
            _key: '1',
            name: 'Buy milk'
        }))
    }
}
export default migration
```

### Running up migrations

`yarn arango-migrate -u`

Runs all un-applied migrations.

`yarn arango-migrate -u -t 2`

Runs all un-applied migrations up to and including migration with version number 2.

## Understanding ArangoDB transactions and the step function

Individual migrations are ran within a transaction in order to keep the database in a valid state if a migration fails. The migration's transaction is committed to ArangoDB after the `up` or `down` functions are executed.

Observe how the second argument of the `up` and `down` functions is a function called `step`. This is a special function which allows you to add valid ArangoDB operations to the transaction.

For example in order to add a new document to the `todo` collection.

```js
const up = async (db, step) => {
    const todoItem = await step(async () => await db.collection('todo').save({
        _key: '1',
        name: 'Buy milk'
    }))
    return todoItem;
}
```

**Read more about transactions in ArangoDB**

- https://github.com/arangodb/arangojs/blob/main/src/transaction.ts#L168
- https://www.arangodb.com/docs/stable/transactions.html

## Anatomy of a migration

```typescript
export interface Migration {
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
   * Optional function that will be called before the migration's `up` function is executed.
   * @param {Database} db -  Database instance.
   * @returns {Promise<*>} - Value returned will be passed to the `up` function.
   */
  beforeUp?: (db: Database) => Promise<any>
  /**
   * Function that will be called to perform the `up` migration.
   * @param {Database} - db Database instance.
   * @param {StepFunction} - step The `step` function is used to add valid ArangoDB operations to the transaction.
   * @param {*} data Optional value received from the `beforeUp` function.
   */
  up: (db: Database, step: StepFunction, data?: any) => Promise<any>;
  /**
   * Optional function that will be called after the migration's `up` function is executed.
   * @param {Database} db - Database instance.
   * @param {*} data - Value returned from the `up` function.
   * @returns {Promise<*>} - Value returned will be passed to the `afterUp` function.
   */
  afterUp?: (db: Database, data?: any) => Promise<void>
  /**
   * Optional function that will be called before the migration's `down` function is executed.
   * @param {Database} db - Database instance.
   * @returns {Promise<*>} - Value returned will be passed to the `down` function.
   */
  beforeDown?: (db: Database) => Promise<any>
  /**
   * Function that will be called to perform the `down` migration.
   * @param {Database} db - Database instance.
   * @param {StepFunction} - step The `step` function is used to add valid ArangoDB operations to the transaction.
   * @param {*} data - Optional value received from the `beforeDown` function.
   */
  down?: (db: Database, step: StepFunction, data?: any) => Promise<any>;
  /**
   * Optional function that will be called after the migration's `down` function is executed.
   * @param {Database} db - Database instance.
   * @param {*} data - Optional value received from the `beforeDown` function.
   * @returns {Promise<*>} - Value returned will be passed to the `afterDown` function.
   */
  afterDown?: (db: Database, data?: any) => Promise<any>
}
```
