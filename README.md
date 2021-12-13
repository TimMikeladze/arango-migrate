# arango-migrate

## Getting Started

> npm install arango-migrate --dev

> yarn add arango-migrate --dev


## Usage

```
Usage: arango-migrate [options]

Options:
  -c, --config <config>  path to a js config file. Defaults to ./config.migrate.js
  -u, --up               run up migrations. Defaults to running all unapplied migrations if no --to parameter is provided
  -d, --down             run down migrations
  -t, --to <version>     run migrations up to and including a specific version
  -s --single <version>  run a single migration
  -i --init <name>       initialize a new migration
  -l --list              list all applied migrations
  -h, --help             display help for command
```

### Sample config file

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

yarn arango-migrate -i new-migration-name

### Run all unapplied up migrations

yarn arango-migrate -u
