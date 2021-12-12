import { Migration } from '../../src'

const migration: Migration = {
  async down (db: any): Promise<void> {
    return Promise.resolve(undefined)
  },
  async up (db: any): Promise<void> {
    return Promise.resolve(undefined)
  }
}

export default migration
