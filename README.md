# arango-migrate

Migration tools for ArangoDB.

## Getting Started

> yarn add arango-migrate --dev

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

Sample migration:

```javascript
const migration = {
    async collections () {
        return ['todo'] // all collections used in this migration must be defined here
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

Runs all unapplied migrations.

`yarn arango-migrate -u -t 1`

Runs all unapplied migrations up to and including version 1.

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

### Anatomy of a migration

```javascript
const migration = {
    async collections () {
        // Must return an array of collections used in this migration
        return []
    },
    async beforeUp (db, step) {
        return data;
    },
    async up (db, step, data) {
        return data;
    },
    async afterUp (db, data) {
    },
    async beforeDown (db, step) {
        return data;
    },
    async down (db, step, data) {
        return data;
    },
    async afterDown (db, data) {
    }
}
export default migration
```
