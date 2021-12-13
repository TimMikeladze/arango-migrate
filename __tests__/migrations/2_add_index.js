const migration = {
  async collections () {
    return {
      read: [],
      write: [],
      exclusive: []
    }
  },
  async beforeUp (db) {
    await db.collection('todo').ensureIndex({
      type: 'persistent',
      fields: ['completed'],
      inBackground: false
    })
  },
  async up (db, step, data) {
  },
  async beforeDown (db) {
  },
  async down (db, step, data) {
  }
}
module.exports = migration
