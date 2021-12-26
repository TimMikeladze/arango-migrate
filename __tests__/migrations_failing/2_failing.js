const migration = {
  async collections () {
    return ['user']
  },
  async beforeUp (db) {
  },
  async up (db, step, data) {
    // await db.collection('todo').ensureIndex({
    //   type: 'persistent',
    //   fields: ['completed'],
    //   inBackground: false
    // })
    throw new Error('Migration failed')
  },
  async beforeDown (db) {
  },
  async down (db, step, data) {
  }
}
module.exports = migration
