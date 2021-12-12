import { Config } from 'arangojs/connection'
import { Database } from 'arangojs/database'

export interface Migration {
  up: (db) => Promise<void>;
  down: (db) => Promise<void>;
}

export class MigrationRunner {
  private readonly db: Database;
  constructor (config: Config) {
    this.db = new Database(config)
  }
}
