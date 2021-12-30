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
require('dotenv').config()

module.exports = {
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

`arango-migrate -i new-migration-name`

This will create an empty migration file in the `migrations` directory.

Sample migration:

```javascript
const migration = {
    async collections () {
        return ['todo'] // all collections used in this migration must be defined here
    },
    async up (db, step) {
        await step(async () => await db.collection('todo').save({
            _key: '1',
            name: 'Buy milk'
        }))
    }
}
module.exports = migration
```

### Running up migrations

`arango-migrate -u`

Runs all unapplied migrations.

`arango-migrate -u -t 1`

Runs all unapplied migrations up to and including version 1.

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
module.exports = migration
```
