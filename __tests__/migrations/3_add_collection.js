const migration = {
  async collections () {
    return {
      read: [],
      write: ['user'],
      exclusive: []
    }
  },
  async beforeUp (db) {
  },
  async up (db, step, data) {
  },
  async beforeDown (db) {
  },
  async down (db, step, data) {
  }
}
module.exports = migration
